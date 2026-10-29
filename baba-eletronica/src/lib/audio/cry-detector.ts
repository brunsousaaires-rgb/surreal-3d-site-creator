// Detector de choro em tempo real.
//
// 1) Análise acústica (sempre ativa, leve): nível acima do ruído de fundo adaptativo,
//    energia concentrada na faixa do choro (300–3500 Hz, com subtração espectral do
//    ruído estacionário — ex.: o próprio ruído branco tocando), e voz "sonora" com
//    frequência fundamental típica de bebê (250–1000 Hz, por autocorrelação).
//    O choro é confirmado quando esse padrão domina uma janela de 4 segundos.
// 2) IA opcional (YAMNet): confirma com rapidez e reduz falsos alarmes de TV/música.
//    Mesmo com IA ligada, um padrão acústico persistente ainda dispara o alerta —
//    numa babá eletrônica, perder um choro é pior que um alarme a mais.
import type { DetectionConfig } from '../types'
import type { AiClassifier } from './ai-classifier'

export interface DetectorFrame {
  level: number
  snr: number
  cry: number
  crying: boolean
}

const SENS = {
  1: { minSnr: 15, ratio: 0.45, voicing: 0.5, noiseSnr: 34, aiThr: 0.5 },
  2: { minSnr: 10, ratio: 0.32, voicing: 0.45, noiseSnr: 28, aiThr: 0.33 },
  3: { minSnr: 6, ratio: 0.22, voicing: 0.4, noiseSnr: 22, aiThr: 0.2 },
} as const

const FRAME_MS = 100
const WINDOW = 40 // 4 s

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

export class CryDetector {
  onFrame?: (f: DetectorFrame) => void
  onCryStart?: (score: number, source: 'dsp' | 'ai') => void
  onCryEnd?: (durationMs: number) => void
  onNoise?: (snr: number) => void
  lastAiLabel = ''

  private ctx: AudioContext
  private getConfig: () => DetectionConfig
  private source: MediaStreamAudioSourceNode | null = null
  private hp: BiquadFilterNode
  private analyser: AnalyserNode
  private sink: GainNode
  private tap: AudioNode | null = null
  private td: Float32Array<ArrayBuffer>
  private fd: Float32Array<ArrayBuffer>
  private noiseSpec: Float32Array
  private floor = -60
  private history: boolean[] = []
  private loud: boolean[] = []
  private crying = false
  private cryStartedAt = 0
  private quietSince = 0
  private lastNoiseAt = 0
  private dspSustain = 0
  private ai: AiClassifier | null = null
  private ring: Float32Array
  private ringPos = 0
  private ringFilled = 0
  private aiScores: { at: number; score: number }[] = []
  private maxSnrSinceAi = -Infinity
  private timer: ReturnType<typeof setInterval>
  private aiTimer: ReturnType<typeof setInterval>

  constructor(ctx: AudioContext, stream: MediaStream, getConfig: () => DetectionConfig) {
    this.ctx = ctx
    this.getConfig = getConfig
    this.hp = ctx.createBiquadFilter()
    this.hp.type = 'highpass'
    this.hp.frequency.value = 100
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 2048
    this.analyser.smoothingTimeConstant = 0
    this.sink = ctx.createGain()
    this.sink.gain.value = 0
    this.hp.connect(this.analyser).connect(this.sink).connect(ctx.destination)
    this.td = new Float32Array(this.analyser.fftSize)
    this.fd = new Float32Array(this.analyser.frequencyBinCount)
    this.noiseSpec = new Float32Array(this.analyser.frequencyBinCount).fill(1e-9)
    this.ring = new Float32Array(Math.round(ctx.sampleRate))
    this.setStream(stream)
    void this.setupTap()
    this.timer = setInterval(() => this.frame(), FRAME_MS)
    this.aiTimer = setInterval(() => this.runAi(), 1000)
  }

  setStream(stream: MediaStream) {
    this.source?.disconnect()
    this.source = null
    if (!stream.getAudioTracks().length) return
    this.source = this.ctx.createMediaStreamSource(stream)
    this.source.connect(this.hp)
    if (this.tap) this.source.connect(this.tap)
  }

  setAi(classifier: AiClassifier | null) {
    this.ai = classifier
    this.aiScores = []
  }

  get isCrying() {
    return this.crying
  }

  stop() {
    clearInterval(this.timer)
    clearInterval(this.aiTimer)
    this.source?.disconnect()
    this.tap?.disconnect()
    this.hp.disconnect()
    this.analyser.disconnect()
    this.sink.disconnect()
  }

  // ----- captura de PCM para a IA -----

  private async setupTap() {
    const push = (chunk: Float32Array) => {
      const ring = this.ring
      for (let i = 0; i < chunk.length; i++) {
        ring[this.ringPos] = chunk[i]
        this.ringPos = (this.ringPos + 1) % ring.length
      }
      this.ringFilled = Math.min(ring.length, this.ringFilled + chunk.length)
    }
    try {
      if (!this.ctx.audioWorklet) throw new Error('sem AudioWorklet')
      await this.ctx.audioWorklet.addModule(new URL('/worklets/tap.js', location.origin).toString())
      const node = new AudioWorkletNode(this.ctx, 'ninar-tap', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 })
      node.port.onmessage = (ev) => push(ev.data as Float32Array)
      this.tap = node
    } catch {
      const sp = this.ctx.createScriptProcessor(4096, 1, 1)
      sp.onaudioprocess = (ev) => push(ev.inputBuffer.getChannelData(0))
      this.tap = sp
    }
    this.tap.connect(this.sink)
    this.source?.connect(this.tap)
  }

  private runAi() {
    const cfg = this.getConfig()
    if (!this.ai || !cfg.ai || this.ringFilled < this.ring.length) return
    const S = SENS[cfg.crySensitivity]
    // Só roda a IA quando há som relevante (economiza bateria).
    if (this.maxSnrSinceAi < S.minSnr * 0.7) {
      this.maxSnrSinceAi = -Infinity
      return
    }
    this.maxSnrSinceAi = -Infinity
    const ring = this.ring
    const clip = new Float32Array(ring.length)
    clip.set(ring.subarray(this.ringPos))
    clip.set(ring.subarray(0, this.ringPos), ring.length - this.ringPos)
    try {
      const r = this.ai.classify(clip, this.ctx.sampleRate)
      this.lastAiLabel = r.top
      const now = Date.now()
      this.aiScores = this.aiScores.filter((s) => now - s.at < 4000)
      this.aiScores.push({ at: now, score: r.cry })
    } catch (e) {
      console.warn('[IA] falha ao classificar', e)
    }
  }

  // ----- análise acústica -----

  private pitch(): { r: number; f0: number } {
    const x = this.td
    const sr = this.ctx.sampleRate
    const minLag = Math.floor(sr / 1000)
    const maxLag = Math.ceil(sr / 250)
    const W = x.length - maxLag
    let e0 = 0
    for (let n = 0; n < W; n++) e0 += x[n] * x[n]
    let eL = 0
    for (let n = minLag; n < minLag + W; n++) eL += x[n] * x[n]
    let best = 0
    let bestLag = 0
    const rs = new Float32Array(maxLag + 1)
    for (let L = minLag; L <= maxLag; L++) {
      let acc = 0
      for (let n = 0; n < W; n++) acc += x[n] * x[n + L]
      const r = acc / Math.sqrt(e0 * eL + 1e-20)
      rs[L] = r
      if (r > best) {
        best = r
        bestLag = L
      }
      eL += x[L + W] * x[L + W] - x[L] * x[L]
    }
    // Evita erro de oitava: primeiro pico próximo do máximo.
    for (let L = minLag + 1; L < bestLag; L++) {
      if (rs[L] > best * 0.92 && rs[L] >= rs[L - 1] && rs[L] >= rs[L + 1]) {
        bestLag = L
        break
      }
    }
    return { r: best, f0: bestLag ? sr / bestLag : 0 }
  }

  private frame() {
    const cfg = this.getConfig()
    const S = SENS[cfg.crySensitivity]
    const a = this.analyser
    a.getFloatTimeDomainData(this.td)
    let sum = 0
    for (let i = 0; i < this.td.length; i++) sum += this.td[i] * this.td[i]
    const db = 20 * Math.log10(Math.sqrt(sum / this.td.length) + 1e-10)
    // Ruído de fundo: desce rápido, sobe devagar (~1 min).
    this.floor += (db - this.floor) * (db < this.floor ? 0.25 : 0.0015)
    this.floor = Math.max(-100, Math.min(-10, this.floor))
    const snr = db - this.floor
    if (snr > this.maxSnrSinceAi) this.maxSnrSinceAi = snr

    a.getFloatFrequencyData(this.fd)
    const binHz = this.ctx.sampleRate / a.fftSize
    const lo = Math.floor(80 / binHz)
    const hi = Math.min(this.fd.length, Math.ceil(8000 / binHz))
    const bandLo = Math.floor(300 / binHz)
    const bandHi = Math.ceil(3500 / binHz)
    let total = 0
    let band = 0
    for (let i = lo; i < hi; i++) {
      const v = this.fd[i]
      const p = Number.isFinite(v) ? 10 ** (v / 10) : 0
      const nz = this.noiseSpec[i]
      this.noiseSpec[i] += (p - nz) * (p < nz ? 0.25 : 0.002)
      const ex = Math.max(0, p - 2 * nz)
      total += ex
      if (i >= bandLo && i < bandHi) band += ex
    }
    const ratio = total > 0 ? band / total : 0

    let cryLike = false
    if (cfg.cry && snr >= S.minSnr && ratio >= 0.55) {
      const { r, f0 } = this.pitch()
      cryLike = r >= S.voicing && f0 >= 250 && f0 <= 1000
    }
    this.history.push(cryLike)
    if (this.history.length > WINDOW) this.history.shift()
    const cryFrames = this.history.reduce((n, v) => n + (v ? 1 : 0), 0)
    const windowRatio = cryFrames / WINDOW
    const dspScore = clamp01(windowRatio / S.ratio)
    this.dspSustain = windowRatio >= S.ratio ? this.dspSustain + FRAME_MS / 1000 : 0

    const now = Date.now()
    const aiReady = !!this.ai && cfg.ai
    const aiRecent = aiReady
      ? this.aiScores.filter((s) => now - s.at < 2500).reduce((m, s) => Math.max(m, s.score), 0)
      : 0
    const aiHits = aiReady ? this.aiScores.filter((s) => now - s.at < 3200 && s.score >= S.aiThr).length : 0
    const score = aiReady ? Math.max(dspScore * 0.6, clamp01(aiRecent / S.aiThr)) : dspScore

    if (!this.crying && cfg.cry) {
      const aiHit = aiReady && (aiHits >= 2 || aiRecent >= Math.min(0.9, S.aiThr * 2.2))
      const dspHit = aiReady ? this.dspSustain >= 6 : windowRatio >= S.ratio && cryFrames >= 10
      if (aiHit || dspHit) {
        this.crying = true
        this.cryStartedAt = now
        this.quietSince = 0
        this.onCryStart?.(Math.max(score, 0.7), aiHit ? 'ai' : 'dsp')
      }
    } else if (this.crying) {
      const quiet = windowRatio < S.ratio * 0.35 && (!aiReady || aiRecent < S.aiThr * 0.5)
      if (!cfg.cry || quiet) {
        if (!this.quietSince) this.quietSince = now
        if (!cfg.cry || now - this.quietSince > 8000) {
          this.crying = false
          this.onCryEnd?.(now - this.cryStartedAt)
        }
      } else this.quietSince = 0
    }

    this.loud.push(snr >= S.noiseSnr)
    if (this.loud.length > 5) this.loud.shift()
    if (
      cfg.noise &&
      !this.crying &&
      cryFrames < 3 && // som com padrão de choro não conta como "barulho"
      this.loud.filter(Boolean).length >= 3 &&
      now - this.lastNoiseAt > 30_000
    ) {
      this.lastNoiseAt = now
      this.onNoise?.(snr)
    }

    this.onFrame?.({
      level: clamp01(snr / 40),
      snr,
      cry: this.crying ? Math.max(score, 0.8) : score,
      crying: this.crying,
    })
  }
}
