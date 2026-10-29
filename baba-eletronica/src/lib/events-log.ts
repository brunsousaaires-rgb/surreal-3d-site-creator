import { randomId } from './bytes'
import { createStore, readJson, safeSet } from './store'
import type { EventKind, MonitorEvent } from './types'

const KEY = 'ninar.events.v1'
const MAX = 600

export const eventLog = createStore<{ events: MonitorEvent[] }>({
  events: readJson<MonitorEvent[]>(KEY) ?? [],
})

eventLog.subscribe(() => safeSet(KEY, JSON.stringify(eventLog.get().events)))

export function logEvent(ev: Omit<MonitorEvent, 'id'> & { id?: string }) {
  const events = eventLog.get().events
  const id = ev.id ?? randomId(8)
  if (events.some((e) => e.id === id)) return
  eventLog.set({ events: [{ ...ev, id }, ...events].slice(0, MAX) })
}

export function clearLog() {
  eventLog.set({ events: [] })
}

export const EVENT_LABEL: Record<EventKind, string> = {
  cry: 'Choro detectado',
  'cry-end': 'Choro parou',
  motion: 'Movimento',
  noise: 'Barulho alto',
  lost: 'Conexão perdida',
  restored: 'Conexão restabelecida',
  battery: 'Bateria baixa na câmera',
  soothe: 'Som de ninar iniciado',
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m < 60) return r ? `${m}min ${r}s` : `${m}min`
  return `${Math.floor(m / 60)}h ${m % 60}min`
}

/** Resumo das últimas 12 horas (a "noite"). */
export function nightSummary(events: MonitorEvent[], since = Date.now() - 12 * 3600_000) {
  const recent = events.filter((e) => e.at >= since)
  const cries = recent.filter((e) => e.kind === 'cry').length
  const cryTime = recent.filter((e) => e.kind === 'cry-end').reduce((s, e) => s + (e.duration ?? 0), 0)
  const motion = recent.filter((e) => e.kind === 'motion').length
  const noise = recent.filter((e) => e.kind === 'noise').length
  return { cries, cryTime, motion, noise }
}
