// Sons para acalmar o bebê, gerados proceduralmente (sem arquivos, funcionam offline).
import type { SoundId } from '../types'

export type SoundGroup = 'natureza' | 'ruido' | 'utero' | 'musica'

export interface SoundDef {
  id: SoundId
  label: string
  hint: string
  group: SoundGroup
}

export const SOUNDS: SoundDef[] = [
  { id: 'rain', label: 'Chuva', hint: 'Chuva suave com gotas', group: 'natureza' },
  { id: 'ocean', label: 'Ondas do mar', hint: 'Ondas lentas e ritmadas', group: 'natureza' },
  { id: 'womb', label: 'Útero', hint: 'Batimentos e som abafado', group: 'utero' },
  { id: 'shush', label: 'Shhh', hint: 'O “shhh” ritmado que acalma', group: 'utero' },
  { id: 'white', label: 'Ruído branco', hint: 'Constante e neutro', group: 'ruido' },
  { id: 'pink', label: 'Ruído rosa', hint: 'Mais suave que o branco', group: 'ruido' },
  { id: 'brown', label: 'Ruído marrom', hint: 'Grave e profundo', group: 'ruido' },
  { id: 'fan', label: 'Ventilador', hint: 'Zumbido de ventilador', group: 'ruido' },
  { id: 'brahms', label: 'Canção de ninar', hint: 'Brahms em caixinha de música', group: 'musica' },
  { id: 'twinkle', label: 'Brilha, brilha', hint: 'Brilha, brilha, estrelinha', group: 'musica' },
  { id: 'musicbox', label: 'Caixinha mágica', hint: 'Melodia suave que nunca se repete', group: 'musica' },
]

export const soundLabel = (id: SoundId) => SOUNDS.find((s) => s.id === id)?.label ?? id

// ---------- utilidades DSP ----------

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const onePole = (fc: number, sr: number) => 1 - Math.exp((-2 * Math.PI * fc) / sr)

class Pink {
  b = [0, 0, 0, 0, 0, 0, 0]
  next(w: number) {
    const b = this.b
    b[0] = 0.99886 * b[0] + w * 0.0555179
    b[1] = 0.99332 * b[1] + w * 0.0750759
    b[2] = 0.969 * b[2] + w * 0.153852
    b[3] = 0.8665 * b[3] + w * 0.3104856
    b[4] = 0.55 * b[4] + w * 0.5329522
    b[5] = -0.7616 * b[5] - w * 0.016898
    const out = b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + w * 0.5362
    b[6] = w * 0.115926
    return out * 0.11
  }
}

class Brown {
  last = 0
  next(w: number) {
    this.last = (this.last + 0.02 * w) / 1.02
    return this.last * 3.5
  }
}

/** Ruído suave de baixa frequência (para modulações orgânicas). */
function smoothNoise(rand: () => number, points: number) {
  const pts = Array.from({ length: points + 1 }, () => rand())
  pts[points] = pts[0] // periódico → loop sem emenda
  return (x: number) => {
    const p = (((x % 1) + 1) % 1) * points
    const i = Math.floor(p)
    const f = p - i
    const s = f * f * (3 - 2 * f)
    return pts[i] * (1 - s) + pts[i + 1] * s
  }
}

type Fill = (ch: Float32Array, channel: number, sr: number, rand: () => number) => void

/**
 * Cria um buffer em loop: gera `seconds + fade` e funde o fim no começo
 * (crossfade de potência constante) para não haver "emenda" audível.
 */
function loopBuffer(ctx: BaseAudioContext, seconds: number, fill: Fill, opts: { fade?: number; seed?: number; rms?: number } = {}) {
  const sr = ctx.sampleRate
  const len = Math.round(seconds * sr)
  const fade = Math.round((opts.fade ?? 0.5) * sr)
  const out = ctx.createBuffer(2, len, sr)
  const tmp = new Float32Array(len + fade)
  for (let c = 0; c < 2; c++) {
    tmp.fill(0)
    fill(tmp, c, sr, mulberry32((opts.seed ?? 1) * 7919 + c * 104729))
    const data = out.getChannelData(c)
    for (let i = 0; i < len; i++) data[i] = tmp[i]
    for (let i = 0; i < fade; i++) {
      const t = i / fade
      data[i] = tmp[i] * Math.sqrt(t) + tmp[len + i] * Math.sqrt(1 - t)
    }
  }
  normalize(out, opts.rms ?? 0.12)
  return out
}

function normalize(buf: AudioBuffer, targetRms: number) {
  let sum = 0
  let peak = 0
  let n = 0
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c)
    for (let i = 0; i < d.length; i++) {
      sum += d[i] * d[i]
      const a = Math.abs(d[i])
      if (a > peak) peak = a
    }
    n += d.length
  }
  const rms = Math.sqrt(sum / n) || 1
  const gain = Math.min(targetRms / rms, 0.95 / (peak || 1))
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c)
    for (let i = 0; i < d.length; i++) d[i] *= gain
  }
}

// ---------- geradores ----------

const white: Fill = (ch, _c, _sr, r) => {
  for (let i = 0; i < ch.length; i++) ch[i] = r() * 2 - 1
}

const pink: Fill = (ch, _c, sr, r) => {
  const p = new Pink()
  const a = onePole(9000, sr)
  let y = 0
  for (let i = 0; i < ch.length; i++) {
    y += a * (p.next(r() * 2 - 1) - y)
    ch[i] = y
  }
}

const brown: Fill = (ch, _c, _sr, r) => {
  const b = new Brown()
  for (let i = 0; i < ch.length; i++) ch[i] = b.next(r() * 2 - 1)
}

const rain: Fill = (ch, _c, sr, r) => {
  const p = new Pink()
  const hp = onePole(350, sr)
  const lp = onePole(6500, sr)
  const swell = smoothNoise(r, 6)
  let low = 0
  let y = 0
  const seconds = ch.length / sr
  for (let i = 0; i < ch.length; i++) {
    const x = p.next(r() * 2 - 1)
    low += hp * (x - low)
    y += lp * (x - low - y)
    ch[i] = y * 0.9 * (0.82 + 0.18 * swell(i / ch.length))
  }
  // gotas: rajadas curtas e brilhantes em tempos aleatórios
  const drops = Math.round(seconds * 55)
  for (let d = 0; d < drops; d++) {
    const big = r() < 0.08
    const pos = Math.floor(r() * (ch.length - sr * 0.05))
    const L = Math.floor(sr * (big ? 0.012 + r() * 0.02 : 0.002 + r() * 0.007))
    const amp = big ? 0.25 + r() * 0.35 : 0.04 + r() * r() * 0.3
    let prev = 0
    for (let n = 0; n < L; n++) {
      const w = r() * 2 - 1
      const v = (w - prev) * 0.5 // diferenciação → som mais "estalado"
      prev = w
      ch[pos + n] += v * amp * Math.exp((-5 * n) / L)
    }
  }
}

const ocean: Fill = (ch, c, sr, r) => {
  const b = new Brown()
  const p = new Pink()
  const period = 12
  const offset = c * 0.35
  let y = 0
  for (let i = 0; i < ch.length; i++) {
    const t = i / sr + offset
    const ph = (t % period) / period
    const env = ph < 0.42 ? smooth(ph / 0.42) : Math.exp(-((ph - 0.42) / 0.58) * 3.2)
    const shaped = 0.18 + 0.82 * env * (Math.floor(t / period) % 2 ? 0.85 : 1)
    const x = b.next(r() * 2 - 1) * 0.7 + p.next(r() * 2 - 1) * 0.6
    const fc = 250 + 2600 * shaped ** 1.6
    y += onePole(fc, sr) * (x - y)
    ch[i] = y * (0.25 + 0.75 * shaped)
  }
}

function smooth(x: number) {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}

const BEAT_BPM = 64

const womb: Fill = (ch, _c, sr, r) => {
  const b = new Brown()
  const lp = onePole(380, sr)
  const beat = 60 / BEAT_BPM
  let y = 0
  for (let i = 0; i < ch.length; i++) {
    const t = i / sr
    const ph = (t % beat) / beat
    const whoosh = 0.65 + 0.35 * Math.exp(-ph * 4)
    y += lp * (b.next(r() * 2 - 1) - y)
    ch[i] = y * 0.9 * whoosh
  }
  const thump = (start: number, f0: number, f1: number, amp: number) => {
    const L = Math.floor(sr * 0.22)
    let phase = 0
    for (let n = 0; n < L && start + n < ch.length; n++) {
      const t = n / sr
      const f = f1 + (f0 - f1) * Math.exp(-t * 18)
      phase += (2 * Math.PI * f) / sr
      const env = Math.min(1, t / 0.008) * Math.exp(-t * 16)
      ch[start + n] += Math.sin(phase) * env * amp
    }
  }
  const beats = Math.floor(ch.length / sr / beat)
  for (let k = 0; k <= beats; k++) {
    const s = Math.floor(k * beat * sr)
    thump(s, 72, 44, 0.9)
    thump(s + Math.floor(0.3 * sr), 64, 48, 0.6)
  }
}

const shush: Fill = (ch, _c, sr, r) => {
  const hp1 = onePole(1700, sr)
  const lp = onePole(6500, sr)
  let a = 0
  let y = 0
  const cycle = 2.4
  for (let i = 0; i < ch.length; i++) {
    const x = r() * 2 - 1
    a += hp1 * (x - a)
    const h = x - a
    y += lp * (h - y)
    const t = (i / sr) % cycle
    let env: number
    if (t < 0.25) env = smooth(t / 0.25)
    else if (t < 1.55) env = 1 - 0.15 * ((t - 0.25) / 1.3)
    else if (t < 2.15) env = 0.85 * (1 - smooth((t - 1.55) / 0.6))
    else env = 0
    ch[i] = y * (0.08 + 0.92 * env)
  }
}

const fan: Fill = (ch, _c, sr, r) => {
  const b = new Brown()
  const p = new Pink()
  const lp = onePole(900, sr)
  let y = 0
  for (let i = 0; i < ch.length; i++) {
    const t = i / sr
    y += lp * (b.next(r() * 2 - 1) * 0.8 + p.next(r() * 2 - 1) * 0.5 - y)
    const am = 1 + 0.04 * Math.sin(2 * Math.PI * 0.5 * t)
    ch[i] = (y + 0.018 * Math.sin(2 * Math.PI * 100 * t) + 0.008 * Math.sin(2 * Math.PI * 200 * t)) * am
  }
}

// ---------- canções (caixinha de música) ----------

type Note = [midi: number | null, beats: number]

const N: Record<string, number> = { C5: 72, D5: 74, E5: 76, F5: 77, G5: 79, A5: 81, B5: 83, C6: 84 }
const n = (s: string): Note[] =>
  s
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const [name, dur] = tok.split(':')
      return [name === 'R' ? null : N[name], Number(dur ?? 1)]
    })

// Brahms — Wiegenlied (domínio público), em 3/4.
const BRAHMS = n(`
  E5:.5 E5:.5 G5:1.5 E5:.5 E5:1 G5:2 E5:.5 G5:.5 C6:1 B5:1.5 A5:.5 A5:1 G5:1 D5:.5 E5:.5
  F5:1 D5:1 D5:.5 E5:.5 F5:2 D5:.5 F5:.5 B5:.5 A5:.5 G5:1 B5:1 C6:2 C5:.5 C5:.5
  C6:2 A5:.5 F5:.5 G5:2 E5:.5 C5:.5 F5:1 G5:1 A5:1 G5:2 C5:.5 C5:.5
  C6:2 A5:.5 F5:.5 G5:2 E5:.5 C5:.5 F5:1 E5:1 D5:1 C5:3 R:2
`)

// Brilha, brilha, estrelinha (domínio público).
const TWINKLE = n(`
  C5 C5 G5 G5 A5 A5 G5:2 F5 F5 E5 E5 D5 D5 C5:2
  G5 G5 F5 F5 E5 E5 D5:2 G5 G5 F5 F5 E5 E5 D5:2
  C5 C5 G5 G5 A5 A5 G5:2 F5 F5 E5 E5 D5 D5 C5:2 R:2
`)
const TWINKLE_BASS: Note[] = 'C C F C F C G C C F C G C F C G C C F C F C G C R'
  .split(' ')
  .map((x) => [x === 'R' ? null : ({ C: 48, F: 53, G: 55 } as Record<string, number>)[x], 2])

function generativeMelody(seed: number): Note[] {
  const r = mulberry32(seed)
  const scale = [72, 74, 76, 79, 81, 84, 86, 88] // pentatônica de Dó
  let idx = 2
  const out: Note[] = []
  for (let beat = 0; beat < 40; ) {
    const dur = r() < 0.25 ? 1 : 0.5
    if (r() < 0.12) out.push([null, dur])
    else {
      idx = Math.max(0, Math.min(scale.length - 1, idx + Math.round((r() - 0.5) * 3)))
      out.push([scale[idx], dur])
    }
    beat += dur
  }
  out.push([72, 3], [null, 1.5])
  return out
}

function impulse(ctx: BaseAudioContext, seconds: number) {
  const sr = ctx.sampleRate
  const len = Math.floor(seconds * sr)
  const buf = ctx.createBuffer(2, len, sr)
  const r = mulberry32(42)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    for (let i = 0; i < len; i++) d[i] = (r() * 2 - 1) * Math.exp((-4 * i) / len) * (i < sr * 0.01 ? i / (sr * 0.01) : 1)
  }
  return buf
}

async function renderSong(sampleRate: number, melody: Note[], bpm: number, bass?: Note[]) {
  const spb = 60 / bpm
  const beats = melody.reduce((s, [, b]) => s + b, 0)
  const total = beats * spb + 0.4
  const oc = new OfflineAudioContext(2, Math.ceil(total * sampleRate), sampleRate)
  const bus = oc.createGain()
  const dry = oc.createGain()
  const wet = oc.createGain()
  const verb = oc.createConvolver()
  verb.buffer = impulse(oc, 2.4)
  dry.gain.value = 0.75
  wet.gain.value = 0.32
  bus.connect(dry).connect(oc.destination)
  bus.connect(verb).connect(wet).connect(oc.destination)

  const pluck = (midi: number, t: number, dur: number, amp: number, partials: [number, number][]) => {
    const f = 440 * 2 ** ((midi - 69) / 12)
    const decay = Math.min(2.6, 1.1 + dur * 1.2)
    for (const [ratio, a] of partials) {
      const osc = oc.createOscillator()
      const g = oc.createGain()
      osc.frequency.value = f * ratio
      const d = decay / ratio ** 0.6
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(amp * a, t + 0.006)
      g.gain.exponentialRampToValueAtTime(0.0001, t + d)
      osc.connect(g).connect(bus)
      osc.start(t)
      osc.stop(t + d + 0.05)
    }
  }

  let t = 0.25
  for (const [midi, b] of melody) {
    if (midi !== null) pluck(midi, t, b * spb, 0.22, [[1, 1], [2, 0.28], [3, 0.1], [4.2, 0.06], [5.4, 0.025]])
    t += b * spb
  }
  if (bass) {
    let tb = 0.25
    for (const [midi, b] of bass) {
      if (midi !== null) pluck(midi, tb, b * spb, 0.12, [[1, 1], [2, 0.15]])
      tb += b * spb
    }
  }
  return oc.startRendering()
}

async function songBuffer(ctx: BaseAudioContext, id: 'brahms' | 'twinkle' | 'musicbox') {
  let rendered: AudioBuffer
  if (id === 'brahms') rendered = await renderSong(ctx.sampleRate, BRAHMS, 76)
  else if (id === 'twinkle') rendered = await renderSong(ctx.sampleRate, TWINKLE, 84, TWINKLE_BASS)
  else rendered = await renderSong(ctx.sampleRate, generativeMelody(7), 70)
  normalize(rendered, 0.09)
  return rendered
}

const cache = new Map<string, Promise<AudioBuffer>>()

export function soundBuffer(ctx: BaseAudioContext, id: SoundId): Promise<AudioBuffer> {
  const key = `${id}@${ctx.sampleRate}`
  let p = cache.get(key)
  if (!p) {
    p = build(ctx, id)
    cache.set(key, p)
    p.catch(() => cache.delete(key))
  }
  return p
}

async function build(ctx: BaseAudioContext, id: SoundId): Promise<AudioBuffer> {
  // Cede a vez à interface antes do cálculo pesado.
  await new Promise((r) => setTimeout(r, 0))
  switch (id) {
    case 'white':
      return loopBuffer(ctx, 6, white, { rms: 0.09 })
    case 'pink':
      return loopBuffer(ctx, 8, pink, { rms: 0.11 })
    case 'brown':
      return loopBuffer(ctx, 8, brown, { rms: 0.13, fade: 1 })
    case 'rain':
      return loopBuffer(ctx, 16, rain, { rms: 0.1, fade: 1 })
    case 'ocean':
      return loopBuffer(ctx, 24, ocean, { rms: 0.12, fade: 0.8 })
    case 'womb':
      return loopBuffer(ctx, (60 / BEAT_BPM) * 8, womb, { rms: 0.13, fade: 0.05 })
    case 'shush':
      return loopBuffer(ctx, 2.4 * 4, shush, { rms: 0.1, fade: 0.05 })
    case 'fan':
      return loopBuffer(ctx, 8, fan, { rms: 0.12, fade: 0.5 })
    case 'brahms':
    case 'twinkle':
    case 'musicbox':
      return songBuffer(ctx, id)
  }
}
