import type { AlarmTone } from '../settings'
import { audioContext } from './context'

type AlarmKind = 'cry' | 'lost' | 'notify'

/** Alarmes sintetizados do monitor (tocam mesmo com o celular no silencioso no iOS 17+). */
export class Alarm {
  private repeat: ReturnType<typeof setInterval> | undefined
  private repeatingKind: AlarmKind | null = null

  play(kind: AlarmKind, tone: AlarmTone, volume: number) {
    const ctx = audioContext()
    if (ctx.state !== 'running') void ctx.resume().catch(() => {})
    const out = ctx.createGain()
    out.gain.value = Math.max(0.05, volume) * 0.9
    out.connect(ctx.destination)
    const t = ctx.currentTime + 0.02
    if (kind === 'lost') beeps(ctx, out, t, [988, 784, 988], 0.16)
    else if (kind === 'notify') bell(ctx, out, t, [1318.5], 0.6)
    else if (tone === 'harp') harp(ctx, out, t)
    else if (tone === 'beep') beeps(ctx, out, t, [880, 880], 0.14)
    else bell(ctx, out, t, [1318.5, 1046.5], 0.45)
    setTimeout(() => out.disconnect(), 3000)
  }

  /** Repete até `stop()` (usado para choro e conexão perdida). */
  start(kind: AlarmKind, tone: AlarmTone, volume: () => number, everyMs = 4000) {
    if (this.repeatingKind === kind) return
    this.stop()
    this.repeatingKind = kind
    this.play(kind, tone, volume())
    this.repeat = setInterval(() => this.play(kind, tone, volume()), everyMs)
  }

  stop() {
    clearInterval(this.repeat)
    this.repeat = undefined
    this.repeatingKind = null
  }

  get active() {
    return this.repeatingKind
  }
}

function bell(ctx: AudioContext, out: AudioNode, t: number, freqs: number[], gap: number) {
  freqs.forEach((f, i) => {
    const start = t + i * gap
    for (const [ratio, amp] of [
      [1, 0.5],
      [2.01, 0.18],
      [3.02, 0.08],
    ] as const) {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = f * ratio
      g.gain.setValueAtTime(0, start)
      g.gain.linearRampToValueAtTime(amp, start + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, start + 1.4 / ratio)
      o.connect(g).connect(out)
      o.start(start)
      o.stop(start + 1.5)
    }
  })
}

function harp(ctx: AudioContext, out: AudioNode, t: number) {
  ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    const s = t + i * 0.11
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'triangle'
    o.frequency.value = f
    g.gain.setValueAtTime(0, s)
    g.gain.linearRampToValueAtTime(0.45, s + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, s + 1.2)
    o.connect(g).connect(out)
    o.start(s)
    o.stop(s + 1.3)
  })
}

function beeps(ctx: AudioContext, out: AudioNode, t: number, freqs: number[], len: number) {
  freqs.forEach((f, i) => {
    const s = t + i * (len + 0.08)
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'square'
    o.frequency.value = f
    g.gain.setValueAtTime(0, s)
    g.gain.linearRampToValueAtTime(0.18, s + 0.01)
    g.gain.setValueAtTime(0.18, s + len - 0.02)
    g.gain.linearRampToValueAtTime(0, s + len)
    o.connect(g).connect(out)
    o.start(s)
    o.stop(s + len + 0.02)
  })
}
