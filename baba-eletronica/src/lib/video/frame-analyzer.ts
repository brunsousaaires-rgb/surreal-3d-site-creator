// Sensor de movimento e de luminosidade na câmera, por diferença de quadros
// em baixa resolução (barato o bastante para rodar a noite toda).
import type { Sensitivity } from '../types'

const W = 64
const H = 48

const MOTION = {
  1: { pixel: 34, trigger: 0.06 },
  2: { pixel: 26, trigger: 0.035 },
  3: { pixel: 18, trigger: 0.018 },
} as const

export interface FrameSample {
  luma: number
  motion: number
}

export class FrameAnalyzer {
  onSample?: (s: FrameSample) => void
  onMotion?: (score: number) => void
  private video: HTMLVideoElement
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D | null
  private prev: Uint8Array | null = null
  private timer: ReturnType<typeof setInterval>
  private settleUntil = 0
  private streak = 0
  private lastEvent = 0
  private smoothMotion = 0
  private getConfig: () => { enabled: boolean; sensitivity: Sensitivity }

  constructor(video: HTMLVideoElement, getConfig: () => { enabled: boolean; sensitivity: Sensitivity }) {
    this.video = video
    this.getConfig = getConfig
    this.canvas = document.createElement('canvas')
    this.canvas.width = W
    this.canvas.height = H
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })
    this.timer = setInterval(() => this.tick(), 300)
  }

  /** Ignora alguns quadros após trocar de câmera/ajustar exposição. */
  settle(ms = 2500) {
    this.settleUntil = Date.now() + ms
    this.prev = null
  }

  stop() {
    clearInterval(this.timer)
  }

  private tick() {
    const v = this.video
    if (!this.ctx || v.readyState < 2 || !v.videoWidth) return
    try {
      this.ctx.drawImage(v, 0, 0, W, H)
    } catch {
      return
    }
    const img = this.ctx.getImageData(0, 0, W, H).data
    const gray = new Uint8Array(W * H)
    let sum = 0
    for (let i = 0, p = 0; p < gray.length; i += 4, p++) {
      const y = (img[i] * 77 + img[i + 1] * 150 + img[i + 2] * 29) >> 8
      gray[p] = y
      sum += y
    }
    const luma = sum / gray.length / 255
    let motion = 0
    const cfg = this.getConfig()
    const prev = this.prev
    if (prev && Date.now() > this.settleUntil) {
      // Compensa mudança global de brilho (luz acesa, ajuste automático).
      let prevSum = 0
      for (let p = 0; p < prev.length; p++) prevSum += prev[p]
      const shift = (sum - prevSum) / gray.length
      const th = MOTION[cfg.sensitivity].pixel * (luma < 0.08 ? 1.6 : 1) // mais ruído no escuro
      let changed = 0
      for (let p = 0; p < gray.length; p++) if (Math.abs(gray[p] - prev[p] - shift) > th) changed++
      motion = changed / gray.length
      if (Math.abs(shift) > 40) motion = 0
    }
    this.prev = gray
    this.smoothMotion = this.smoothMotion * 0.5 + motion * 0.5
    this.onSample?.({ luma, motion: Math.min(1, this.smoothMotion * 8) })
    if (!cfg.enabled) return
    const trig = MOTION[cfg.sensitivity].trigger
    this.streak = motion >= trig ? this.streak + 1 : 0
    const now = Date.now()
    if (this.streak >= 2 && now - this.lastEvent > 20_000) {
      this.lastEvent = now
      this.onMotion?.(Math.min(1, motion / (trig * 4)))
    }
  }
}
