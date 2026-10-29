import { createStore, readJson, safeSet } from './store'
import type { AlertLevel, DetectionConfig, NightMode, NightStyle, Quality } from './types'
import { defaultDeviceName } from './device'

export interface TurnServer {
  urls: string
  username: string
  credential: string
}

export type AlarmTone = 'chime' | 'harp' | 'beep'

export interface Settings {
  deviceName: string
  // ----- câmera -----
  quality: Quality
  detection: DetectionConfig
  autoDim: boolean
  // ----- monitor -----
  alarmVolume: number
  alarmTone: AlarmTone
  vibrate: boolean
  notifications: boolean
  alerts: { cry: AlertLevel; motion: AlertLevel; noise: AlertLevel; lost: AlertLevel; battery: AlertLevel }
  lostAfterSec: number
  nightMode: NightMode
  nightStyle: NightStyle
  askMicOnMonitor: boolean
  lastCamera: string | null
  // ----- rede -----
  turnServers: TurnServer[]
  forceRelay: boolean
  useMqtt: boolean
  useNostr: boolean
  customMqtt: string
}

export const DEFAULT_DETECTION: DetectionConfig = {
  cry: true,
  crySensitivity: 2,
  ai: false,
  motion: true,
  motionSensitivity: 2,
  noise: true,
  autoSoothe: false,
  autoSootheSound: 'shush',
  autoSootheMinutes: 15,
}

function defaults(): Settings {
  return {
    deviceName: defaultDeviceName(),
    quality: 'medium',
    detection: { ...DEFAULT_DETECTION },
    autoDim: true,
    alarmVolume: 0.8,
    alarmTone: 'chime',
    vibrate: true,
    notifications: false,
    alerts: { cry: 'alarm', motion: 'notify', noise: 'notify', lost: 'alarm', battery: 'notify' },
    lostAfterSec: 20,
    nightMode: 'auto',
    nightStyle: 'green',
    askMicOnMonitor: true,
    lastCamera: null,
    turnServers: [],
    forceRelay: false,
    useMqtt: true,
    useNostr: true,
    customMqtt: '',
  }
}

const KEY = 'ninar.settings.v1'

function load(): Settings {
  const base = defaults()
  const saved = readJson<Partial<Settings>>(KEY)
  if (!saved) return base
  return {
    ...base,
    ...saved,
    detection: { ...base.detection, ...saved.detection },
    alerts: { ...base.alerts, ...saved.alerts },
  }
}

export const settings = createStore<Settings>(load())
settings.subscribe(() => safeSet(KEY, JSON.stringify(settings.get())))

export function updateDetection(patch: Partial<DetectionConfig>) {
  settings.patch({ detection: { ...settings.get().detection, ...patch } })
}

export function resetSettings() {
  safeSet(KEY, null)
  settings.set(defaults())
}
