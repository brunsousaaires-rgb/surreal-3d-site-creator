import type { SoundState } from '../rtc/protocol'
import type { SoundId } from '../types'
import { soundBuffer } from './soundscapes'

/** Toca os sons de ninar com transições suaves, timer e "ducking" durante a fala dos pais. */
export class SoundPlayer {
  state: SoundState | null = null
  onChange?: (s: SoundState | null) => void
  private ctx: AudioContext
  private master: GainNode
  private duckGain: GainNode
  private current: { src: AudioBufferSourceNode; gain: GainNode } | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private token = 0

  constructor(ctx: AudioContext) {
    this.ctx = ctx
    this.master = ctx.createGain()
    this.duckGain = ctx.createGain()
    this.master.connect(this.duckGain).connect(ctx.destination)
  }

  async play(id: SoundId, volume = 0.6, minutes: number | null = null) {
    const token = ++this.token
    const buffer = await soundBuffer(this.ctx, id)
    if (token !== this.token) return // outro som foi pedido nesse meio tempo
    if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {})
    const now = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(1, now + 2.5)
    src.connect(gain).connect(this.master)
    src.start(now, Math.random() * Math.min(4, buffer.duration / 2))
    this.fadeOut(this.current, 2)
    this.current = { src, gain }
    this.applyVolume(volume)
    clearTimeout(this.timer)
    const endsAt = minutes ? Date.now() + minutes * 60_000 : null
    if (minutes) this.timer = setTimeout(() => this.stop(45), minutes * 60_000)
    this.setState({ id, volume, startedAt: Date.now(), endsAt })
  }

  /** Para o som. Por padrão, desaparece aos poucos. */
  stop(fadeSec = 2.5) {
    this.token++
    clearTimeout(this.timer)
    this.fadeOut(this.current, fadeSec)
    this.current = null
    this.setState(null)
  }

  setVolume(volume: number) {
    this.applyVolume(volume)
    if (this.state) this.setState({ ...this.state, volume })
  }

  /** Abaixa o som enquanto pai/mãe falam pelo monitor. */
  duck(on: boolean) {
    this.duckGain.gain.setTargetAtTime(on ? 0.2 : 1, this.ctx.currentTime, 0.15)
  }

  dispose() {
    this.stop(0.2)
    setTimeout(() => {
      this.master.disconnect()
      this.duckGain.disconnect()
    }, 400)
  }

  private applyVolume(v: number) {
    const clamped = Math.max(0, Math.min(1, v))
    // Curva perceptual.
    this.master.gain.setTargetAtTime(clamped * clamped * 1.4, this.ctx.currentTime, 0.12)
  }

  private fadeOut(node: { src: AudioBufferSourceNode; gain: GainNode } | null, sec: number) {
    if (!node) return
    const now = this.ctx.currentTime
    node.gain.gain.cancelScheduledValues(now)
    node.gain.gain.setValueAtTime(node.gain.gain.value, now)
    node.gain.gain.linearRampToValueAtTime(0, now + sec)
    try {
      node.src.stop(now + sec + 0.05)
    } catch {
      /* já parado */
    }
  }

  private setState(s: SoundState | null) {
    this.state = s
    this.onChange?.(s)
  }
}
