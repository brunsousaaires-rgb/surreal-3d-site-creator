import { useEffect, useMemo, useState } from 'react'
import { hubStore } from './signaling'
import type { RelayInfo } from './signaling/hub'
import { createStore, useStore } from './store'

const emptyInfo = createStore<{ relays: RelayInfo[]; online: number }>({ relays: [], online: 0 })

export function useHubInfo() {
  const { hub } = useStore(hubStore)
  return useStore(hub?.info ?? emptyInfo)
}

/** Re-renderiza periodicamente (para "há 2 min", expiração de presença etc.). */
export function useNow(ms = 5000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

export function useObjectUrl(blob: Blob | null) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob])
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url])
  return url
}

export function timeAgo(at: number, now = Date.now()): string {
  const s = Math.round((now - at) / 1000)
  if (s < 10) return 'agora'
  if (s < 60) return `há ${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `há ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `há ${h}h`
  return new Date(at).toLocaleDateString('pt-BR')
}
