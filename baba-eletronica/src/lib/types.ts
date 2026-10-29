export type Quality = 'low' | 'medium' | 'high'
export type Sensitivity = 1 | 2 | 3 // baixa, média, alta
export type Facing = 'user' | 'environment'
export type NightMode = 'off' | 'auto' | 'on'
export type NightStyle = 'green' | 'mono' | 'color'

export type SoundId =
  | 'rain'
  | 'ocean'
  | 'white'
  | 'pink'
  | 'brown'
  | 'womb'
  | 'shush'
  | 'fan'
  | 'brahms'
  | 'twinkle'
  | 'musicbox'

/** Configuração de detecção — vive na câmera, pode ser alterada pelo monitor. */
export interface DetectionConfig {
  cry: boolean
  crySensitivity: Sensitivity
  ai: boolean
  motion: boolean
  motionSensitivity: Sensitivity
  noise: boolean
  autoSoothe: boolean
  autoSootheSound: SoundId
  autoSootheMinutes: number
}

export type AlertLevel = 'alarm' | 'notify' | 'log'

export type EventKind = 'cry' | 'cry-end' | 'motion' | 'noise' | 'lost' | 'restored' | 'battery' | 'soothe'

export interface MonitorEvent {
  id: string
  kind: EventKind
  at: number
  camera?: string
  score?: number
  duration?: number
  detail?: string
}

export const QUALITY_PRESETS: Record<Quality, { width: number; height: number; fps: number; bitrate: number; label: string }> = {
  low: { width: 640, height: 360, fps: 15, bitrate: 350_000, label: 'Econômica · 360p' },
  medium: { width: 1280, height: 720, fps: 24, bitrate: 1_200_000, label: 'HD · 720p' },
  high: { width: 1920, height: 1080, fps: 30, bitrate: 2_800_000, label: 'Full HD · 1080p' },
}
