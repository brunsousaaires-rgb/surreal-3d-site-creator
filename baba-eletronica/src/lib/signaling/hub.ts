import { randomId } from '../bytes'
import { open, seal, type FamilyKeys } from '../crypto'
import { createStore } from '../store'
import type { Relay, RelayKind, RelayState } from './relay'

export type Role = 'camera' | 'monitor' | 'idle'

/** Corpo das mensagens de sinalização (sempre trafegam cifradas). */
export type SignalBody =
  | { type: 'probe' }
  | { type: 'presence'; role: Role; name: string; device: string; platform: string }
  | { type: 'connect'; name: string; device: string; platform: string }
  | { type: 'offer'; pc: string; sdp: string }
  | { type: 'answer'; pc: string; sdp: string }
  | { type: 'ice'; pc: string; c: RTCIceCandidateInit[] }
  | { type: 'bye'; pc?: string }

export type SignalMessage = SignalBody & { id: string; ts: number; from: string; to?: string }

export interface RelayInfo {
  id: string
  label: string
  kind: RelayKind
  state: RelayState
}

const MAX_SKEW = 10 * 60_000
const RESEND_WINDOW = 12_000

export class SignalHub {
  /** Identificador desta aba/sessão (muda a cada abertura do app). */
  readonly session: string
  readonly info = createStore<{ relays: RelayInfo[]; online: number }>({ relays: [], online: 0 })
  private seen = new Map<string, number>()
  private handlers = new Set<(m: SignalMessage) => void>()
  private recent: { data: string; at: number }[] = []
  private aad: string
  private topic: string
  private keys: FamilyKeys
  private relays: Relay[]
  private gc: ReturnType<typeof setInterval> | undefined

  constructor(keys: FamilyKeys, relays: Relay[], session: string) {
    this.session = session
    this.keys = keys
    this.relays = relays
    this.aad = `ninar/v1/${keys.roomId}`
    this.topic = `ninar/v1/${keys.roomId}`
  }

  start() {
    for (const r of this.relays) {
      r.onState = () => {
        this.refreshInfo()
        if (r.state === 'open') this.replayTo(r)
      }
      r.start(r.kind === 'nostr' ? this.keys.roomId : this.topic, (data) => void this.receive(data))
    }
    this.refreshInfo()
    this.gc = setInterval(() => {
      const now = Date.now()
      for (const [id, t] of this.seen) if (now - t > 2 * MAX_SKEW) this.seen.delete(id)
    }, 60_000)
  }

  stop() {
    clearInterval(this.gc)
    for (const r of this.relays) r.stop()
    this.handlers.clear()
  }

  on(fn: (m: SignalMessage) => void): () => void {
    this.handlers.add(fn)
    return () => this.handlers.delete(fn)
  }

  async send(body: SignalBody, to?: string) {
    const msg: SignalMessage = { ...body, id: randomId(12), ts: Date.now(), from: this.session, ...(to ? { to } : {}) }
    const data = await seal(this.keys.signalKey, JSON.stringify(msg), this.aad)
    const now = Date.now()
    this.recent = this.recent.filter((m) => now - m.at < RESEND_WINDOW)
    this.recent.push({ data, at: now })
    for (const r of this.relays) r.publish(data)
  }

  /** Relé que acabou de (re)conectar recebe as mensagens recentes — duplicatas são descartadas no destino. */
  private replayTo(r: Relay) {
    const now = Date.now()
    for (const m of this.recent) if (now - m.at < RESEND_WINDOW) r.publish(m.data)
  }

  private async receive(data: string) {
    if (data.length > 200_000) return
    const text = await open(this.keys.signalKey, data, this.aad)
    if (!text) return // não é da nossa família (ou foi adulterada)
    let msg: SignalMessage
    try {
      msg = JSON.parse(text)
    } catch {
      return
    }
    if (!msg?.id || msg.from === this.session) return
    if (msg.to && msg.to !== this.session) return
    if (Math.abs(Date.now() - msg.ts) > MAX_SKEW) return // proteção contra replay
    if (this.seen.has(msg.id)) return
    this.seen.set(msg.id, Date.now())
    for (const h of this.handlers) {
      try {
        h(msg)
      } catch (e) {
        console.error('[sinalização]', e)
      }
    }
  }

  private refreshInfo() {
    const relays = this.relays.map((r) => ({ id: r.id, label: r.label, kind: r.kind, state: r.state }))
    this.info.set({ relays, online: relays.filter((r) => r.kind !== 'local' && r.state === 'open').length })
  }
}
