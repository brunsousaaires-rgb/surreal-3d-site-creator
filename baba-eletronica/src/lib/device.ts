// Utilidades específicas de plataforma (iOS / Android / desktop).

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''

export const isIOS =
  /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)
export const isAndroid = /Android/i.test(ua)
export const isMobile = isIOS || isAndroid

export function platformName(): string {
  if (isIOS) return /iPad/.test(ua) || ua.includes('Macintosh') ? 'iPad' : 'iPhone'
  if (isAndroid) return 'Android'
  if (/Windows/.test(ua)) return 'Windows'
  if (/Mac/.test(ua)) return 'Mac'
  return 'Navegador'
}

export function defaultDeviceName(): string {
  return platformName()
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function canUseMedia(): boolean {
  return !!navigator.mediaDevices?.getUserMedia && window.isSecureContext
}

// ---------- Tela sempre ligada ----------

type WakeLockSentinelLike = { release(): Promise<void>; released: boolean; addEventListener(t: 'release', fn: () => void): void }

export class ScreenWake {
  private sentinel: WakeLockSentinelLike | null = null
  private wanted = false
  supported = 'wakeLock' in navigator
  active = false
  onChange?: (active: boolean) => void

  constructor() {
    document.addEventListener('visibilitychange', this.onVisible)
  }

  private onVisible = () => {
    if (this.wanted && document.visibilityState === 'visible') void this.acquire()
  }

  async enable() {
    this.wanted = true
    await this.acquire()
  }

  private async acquire() {
    if (!this.supported || (this.sentinel && !this.sentinel.released)) return
    try {
      const wl = (navigator as Navigator & { wakeLock: { request(t: 'screen'): Promise<WakeLockSentinelLike> } }).wakeLock
      this.sentinel = await wl.request('screen')
      this.setActive(true)
      this.sentinel.addEventListener('release', () => this.setActive(false))
    } catch {
      this.setActive(false)
    }
  }

  private setActive(v: boolean) {
    this.active = v
    this.onChange?.(v)
  }

  async disable() {
    this.wanted = false
    document.removeEventListener('visibilitychange', this.onVisible)
    try {
      await this.sentinel?.release()
    } catch {
      /* ignore */
    }
    this.sentinel = null
  }
}

// ---------- Bateria (Android/Chrome) ----------

interface BatteryManagerLike extends EventTarget {
  level: number
  charging: boolean
}

export interface BatteryState {
  level: number | null
  charging: boolean | null
}

export async function watchBattery(cb: (s: BatteryState) => void): Promise<() => void> {
  const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> }
  if (!nav.getBattery) {
    cb({ level: null, charging: null })
    return () => {}
  }
  try {
    const b = await nav.getBattery()
    const emit = () => cb({ level: b.level, charging: b.charging })
    emit()
    b.addEventListener('levelchange', emit)
    b.addEventListener('chargingchange', emit)
    return () => {
      b.removeEventListener('levelchange', emit)
      b.removeEventListener('chargingchange', emit)
    }
  } catch {
    cb({ level: null, charging: null })
    return () => {}
  }
}

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* iOS não suporta */
  }
}

/** iOS 17+: permite tocar sons mesmo com a chave de silencioso ligada. */
export function setAudioSession(type: 'playback' | 'play-and-record' | 'auto') {
  const nav = navigator as Navigator & { audioSession?: { type: string } }
  try {
    if (nav.audioSession) nav.audioSession.type = type
  } catch {
    /* ignore */
  }
}

export async function saveFile(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (isMobile && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function stamp(d = new Date()): string {
  const p = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

export async function requestFullscreen(el: HTMLElement = document.documentElement) {
  try {
    if (!document.fullscreenElement) await el.requestFullscreen?.({ navigationUI: 'hide' })
  } catch {
    /* iOS não suporta fullscreen de elemento */
  }
}

export async function exitFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
  } catch {
    /* ignore */
  }
}
