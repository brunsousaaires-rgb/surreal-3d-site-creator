// Mensagens trocadas pelo canal de dados WebRTC (cifrado por DTLS, ponta a ponta).
import type { DetectionConfig, EventKind, Facing, Quality, SoundId } from '../types'

export interface SoundState {
  id: SoundId
  volume: number
  startedAt: number
  endsAt: number | null
}

export type AiState = 'off' | 'loading' | 'ready' | 'error'

export interface CameraStatus {
  t: 'status'
  name: string
  platform: string
  facing: Facing
  canFlip: boolean
  torch: boolean
  torchAvailable: boolean
  quality: Quality
  lowLight: boolean
  luma: number
  battery: number | null
  charging: boolean | null
  sound: SoundState | null
  ai: AiState
  /** Último som reconhecido pela IA (pt-BR). */
  aiLabel: string
  config: DetectionConfig
  monitors: number
  uptime: number
  wakeLock: boolean
  videoOk: boolean
  audioOk: boolean
  crying: boolean
}

/** Níveis em tempo real (4×/s). */
export interface LevelUpdate {
  t: 'lvl'
  l: number // nível sonoro 0..1
  c: number // probabilidade de choro 0..1
  m: number // movimento 0..1
}

export interface CameraEvent {
  id: string
  kind: EventKind
  at: number
  score?: number
  duration?: number
  detail?: string
}

export type CameraToMonitor = CameraStatus | LevelUpdate | { t: 'event'; ev: CameraEvent } | { t: 'pong'; ts: number }

export type MonitorToCamera =
  | { t: 'hello'; name: string; platform: string }
  | { t: 'flip' }
  | { t: 'torch'; on: boolean }
  | { t: 'quality'; q: Quality }
  | { t: 'lowlight'; on: boolean }
  | { t: 'sound'; id: SoundId; volume: number; minutes: number | null }
  | { t: 'soundStop' }
  | { t: 'soundVolume'; volume: number }
  | { t: 'config'; patch: Partial<DetectionConfig> }
  | { t: 'talk'; on: boolean }
  | { t: 'ping'; ts: number }

export function sendJson(dc: RTCDataChannel | null | undefined, msg: CameraToMonitor | MonitorToCamera): boolean {
  if (!dc || dc.readyState !== 'open') return false
  try {
    dc.send(JSON.stringify(msg))
    return true
  } catch {
    return false
  }
}
