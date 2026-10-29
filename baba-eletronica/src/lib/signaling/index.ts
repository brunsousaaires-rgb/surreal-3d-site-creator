import { randomId } from '../bytes'
import { platformName } from '../device'
import { settings, type Settings } from '../settings'
import { createStore } from '../store'
import { deviceId, vault } from '../vault'
import { SignalHub, type Role, type SignalBody, type SignalMessage } from './hub'
import { LocalRelay } from './local'
import { MqttRelay, parseMqttUrl } from './mqtt'
import { NostrRelay } from './nostr'
import type { Relay } from './relay'

export type { Role, SignalBody, SignalMessage } from './hub'
export { SignalHub } from './hub'

// Vários relés independentes em paralelo: se um cair, os outros entregam.
// Todos só enxergam bytes cifrados num canal derivado da chave da família.
export const MQTT_BROKERS = [
  { id: 'hivemq', label: 'HiveMQ', url: 'wss://broker.hivemq.com:8884/mqtt' },
  { id: 'emqx', label: 'EMQX', url: 'wss://broker.emqx.io:8084/mqtt' },
  { id: 'shiftr', label: 'shiftr.io', url: 'wss://public.cloud.shiftr.io', username: 'public', password: 'public' },
  { id: 'mosquitto', label: 'Mosquitto', url: 'wss://test.mosquitto.org:8081' },
]

export const NOSTR_RELAYS = [
  { id: 'damus', label: 'Damus', url: 'wss://relay.damus.io' },
  { id: 'noslol', label: 'nos.lol', url: 'wss://nos.lol' },
  { id: 'primal', label: 'Primal', url: 'wss://relay.primal.net' },
]

export function buildRelays(s: Settings): Relay[] {
  const relays: Relay[] = [new LocalRelay()]
  if (s.useMqtt) {
    for (const b of MQTT_BROKERS) relays.push(new MqttRelay(b.id, b.label, b.url, b))
  }
  if (s.useNostr) {
    for (const n of NOSTR_RELAYS) relays.push(new NostrRelay(n.id, n.label, n.url))
  }
  if (s.customMqtt) {
    const parsed = parseMqttUrl(s.customMqtt)
    if (parsed) relays.push(new MqttRelay('custom', 'Broker próprio', parsed.url, parsed.opts))
  }
  return relays
}

// ---------- Diretório de aparelhos da família ----------

export interface PeerInfo {
  session: string
  device: string
  name: string
  role: Role
  platform: string
  lastSeen: number
}

/** Sessão estável durante toda a vida da página (sobrevive a reinícios do hub). */
export const mySession = randomId(8)

const listeners = new Set<(m: SignalMessage) => void>()

/** Assina mensagens de sinalização (continua valendo mesmo se o hub reiniciar). */
export function onSignal(fn: (m: SignalMessage) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function sendSignal(body: SignalBody, to?: string) {
  return hubStore.get().hub?.send(body, to)
}

function dispatch(m: SignalMessage) {
  handleDirectory(m)
  for (const l of listeners) {
    try {
      l(m)
    } catch (e) {
      console.error('[sinalização]', e)
    }
  }
}

export const directory = createStore<{ peers: Record<string, PeerInfo> }>({ peers: {} })
export const hubStore = createStore<{ hub: SignalHub | null }>({ hub: null })

let myRole: Role = 'idle'
let presenceTimer: ReturnType<typeof setInterval> | undefined

function presenceBody() {
  return {
    type: 'presence' as const,
    role: myRole,
    name: settings.get().deviceName,
    device: deviceId,
    platform: platformName(),
  }
}

export function announce() {
  void hubStore.get().hub?.send(presenceBody())
}

export function setRole(role: Role) {
  myRole = role
  announce()
}

export function probe() {
  void hubStore.get().hub?.send({ type: 'probe' })
}

/** Câmeras vistas recentemente (ordenadas pela mais recente). */
export function onlineCameras(peers: Record<string, PeerInfo>, maxAgeMs = 45_000): PeerInfo[] {
  const now = Date.now()
  const byDevice = new Map<string, PeerInfo>()
  for (const p of Object.values(peers)) {
    // Outra aba do mesmo aparelho também vale (útil para testar no computador).
    if (p.role !== 'camera' || now - p.lastSeen > maxAgeMs || p.session === mySession) continue
    const prev = byDevice.get(p.device)
    if (!prev || prev.lastSeen < p.lastSeen) byDevice.set(p.device, p)
  }
  return [...byDevice.values()].sort((a, b) => b.lastSeen - a.lastSeen)
}

function handleDirectory(msg: SignalMessage) {
  if (msg.type === 'probe') {
    announce()
    return
  }
  if (msg.type !== 'presence') return
  const peers = { ...directory.get().peers }
  // Remove sessões antigas do mesmo aparelho com o mesmo papel.
  for (const [k, p] of Object.entries(peers)) if (p.device === msg.device && k !== msg.from && p.role === msg.role) delete peers[k]
  peers[msg.from] = {
    session: msg.from,
    device: msg.device,
    name: msg.name,
    role: msg.role,
    platform: msg.platform,
    lastSeen: Date.now(),
  }
  directory.set({ peers })
}

function relayConfigKey(s: Settings) {
  return JSON.stringify([s.useMqtt, s.useNostr, s.customMqtt])
}

let currentKey = ''

function restartHub() {
  const prev = hubStore.get().hub
  prev?.stop()
  clearInterval(presenceTimer)
  const keys = vault.get().keys
  if (!keys) {
    hubStore.set({ hub: null })
    directory.set({ peers: {} })
    return
  }
  const hub = new SignalHub(keys, buildRelays(settings.get()), mySession)
  hub.on(dispatch)
  hub.start()
  hubStore.set({ hub })
  // Presença periódica: o diretório expira aparelhos silenciosos.
  presenceTimer = setInterval(announce, 15_000)
  let lastOnline = 0
  hub.info.subscribe(() => {
    const online = hub.info.get().online
    if (online > lastOnline) {
      announce()
      probe()
    }
    lastOnline = online
  })
  announce()
  probe()
}

export function initSignaling() {
  let lastKeys = vault.get().keys
  currentKey = relayConfigKey(settings.get())
  if (lastKeys) restartHub()
  vault.subscribe(() => {
    const keys = vault.get().keys
    if (keys === lastKeys) return
    lastKeys = keys
    restartHub()
  })
  settings.subscribe(() => {
    const k = relayConfigKey(settings.get())
    if (k === currentKey) return
    currentKey = k
    if (vault.get().keys) restartHub()
  })
}
