// Unidade da câmera (fica perto do bebê): captura áudio/vídeo, detecta choro e
// movimento, toca sons de ninar e transmite P2P para um ou mais monitores.
import { labelPt, loadAiClassifier } from '../audio/ai-classifier'
import { audioContext, unlockAudio } from '../audio/context'
import { CryDetector } from '../audio/cry-detector'
import { SoundPlayer } from '../audio/player'
import { soundBuffer } from '../audio/soundscapes'
import { randomId } from '../bytes'
import { safetyCode, sdpFingerprint, type SafetyCode } from '../crypto'
import { platformName, ScreenWake, setAudioSession, watchBattery } from '../device'
import { settings, updateDetection } from '../settings'
import { onSignal, sendSignal, setRole, type SignalMessage } from '../signaling'
import { createStore, type Store } from '../store'
import { QUALITY_PRESETS, type DetectionConfig, type Facing, type Quality } from '../types'
import { FrameAnalyzer } from '../video/frame-analyzer'
import { iceConfig, preferHardwareCodec, setMaxBitrate } from './config'
import {
  sendJson,
  type AiState,
  type CameraEvent,
  type CameraStatus,
  type CameraToMonitor,
  type MonitorToCamera,
  type SoundState,
} from './protocol'

export interface MonitorLink {
  session: string
  name: string
  platform: string
  state: RTCPeerConnectionState
  talking: boolean
  safety: SafetyCode | null
}

export interface CameraState {
  phase: 'idle' | 'starting' | 'live' | 'error'
  error: string | null
  stream: MediaStream | null
  facing: Facing
  canFlip: boolean
  torch: boolean
  torchAvailable: boolean
  quality: Quality
  lowLight: boolean
  monitors: MonitorLink[]
  level: number
  cry: number
  crying: boolean
  motion: number
  luma: number
  battery: number | null
  charging: boolean | null
  sound: SoundState | null
  ai: AiState
  aiLabel: string
  wakeLock: boolean
  wakeSupported: boolean
  talking: boolean
  videoOk: boolean
  audioOk: boolean
}

const MAX_MONITORS = 4

function describeMediaError(e: unknown): string {
  const name = (e as DOMException)?.name
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Permissão negada. Libere câmera e microfone para este site nas configurações do navegador.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Nenhuma câmera ou microfone encontrado neste aparelho.'
  if (name === 'NotReadableError' || name === 'AbortError')
    return 'A câmera está sendo usada por outro app. Feche-o e tente novamente.'
  return 'Não foi possível acessar a câmera e o microfone.'
}

function videoConstraints(facing: Facing, q: Quality, lowLight: boolean): MediaTrackConstraints {
  const p = QUALITY_PRESETS[q]
  const fps = lowLight ? Math.min(p.fps, 15) : p.fps
  return {
    facingMode: { ideal: facing },
    width: { ideal: p.width },
    height: { ideal: p.height },
    frameRate: { ideal: fps, max: fps },
  }
}

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true, // remove o som de ninar tocado pelo próprio aparelho
  noiseSuppression: false, // preserva sons sutis do bebê
  autoGainControl: true,
  channelCount: 1,
}

export class CameraSession {
  readonly state: Store<CameraState>
  private stream: MediaStream | null = null
  private peers = new Map<string, CameraPeer>()
  private player: SoundPlayer | null = null
  private detector: CryDetector | null = null
  private analyzer: FrameAnalyzer | null = null
  private probe: HTMLVideoElement | null = null
  private wake = new ScreenWake()
  private cleanups: (() => void)[] = []
  private timers: ReturnType<typeof setInterval>[] = []
  private startedAt = Date.now()
  private stopped = false
  private flipping = false

  constructor() {
    const s = settings.get()
    this.state = createStore<CameraState>({
      phase: 'idle',
      error: null,
      stream: null,
      facing: 'environment',
      canFlip: false,
      torch: false,
      torchAvailable: false,
      quality: s.quality,
      lowLight: false,
      monitors: [],
      level: 0,
      cry: 0,
      crying: false,
      motion: 0,
      luma: 0.5,
      battery: null,
      charging: null,
      sound: null,
      ai: 'off',
      aiLabel: '',
      wakeLock: false,
      wakeSupported: this.wake.supported,
      talking: false,
      videoOk: false,
      audioOk: false,
    })
  }

  get config(): DetectionConfig {
    return settings.get().detection
  }

  /** Deve ser chamado a partir de um toque do usuário (iOS). */
  async start(facing: Facing = 'environment') {
    this.state.patch({ phase: 'starting', error: null, facing })
    await unlockAudio()
    setAudioSession('play-and-record')
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints(facing, this.state.get().quality, false),
        audio: AUDIO_CONSTRAINTS,
      })
    } catch (e) {
      this.state.patch({ phase: 'error', error: describeMediaError(e) })
      return
    }
    if (this.stopped) return this.releaseTracks()

    const ctx = audioContext()
    this.player = new SoundPlayer(ctx)
    this.player.onChange = (sound) => {
      this.state.patch({ sound })
      this.broadcastStatus()
    }

    // Vídeo oculto usado pelos sensores (independe da pré-visualização na tela).
    const probe = document.createElement('video')
    probe.muted = true
    probe.playsInline = true
    probe.setAttribute('playsinline', '')
    Object.assign(probe.style, {
      position: 'fixed',
      width: '2px',
      height: '2px',
      opacity: '0.01',
      pointerEvents: 'none',
      left: '0',
      top: '0',
    })
    document.body.appendChild(probe)
    this.probe = probe
    probe.srcObject = this.stream
    void probe.play().catch(() => {})

    this.analyzer = new FrameAnalyzer(probe, () => ({
      enabled: this.config.motion,
      sensitivity: this.config.motionSensitivity,
    }))
    this.analyzer.onSample = ({ luma, motion }) => this.state.patch({ luma, motion })
    this.analyzer.onMotion = (score) => this.emitEvent('motion', { score })

    this.detector = new CryDetector(ctx, this.stream, () => this.config)
    this.detector.onFrame = (f) => this.state.patch({ level: f.level, cry: f.cry, crying: f.crying })
    this.detector.onCryStart = (score, source) => {
      this.emitEvent('cry', { score, detail: source === 'ai' ? 'IA' : 'acústico' })
      this.autoSoothe()
      this.broadcastStatus()
    }
    this.detector.onCryEnd = (duration) => {
      this.emitEvent('cry-end', { duration })
      this.broadcastStatus()
    }
    this.detector.onNoise = (snr) => this.emitEvent('noise', { score: Math.min(1, snr / 50) })

    this.watchTracks()
    this.refreshVideoCaps()
    void this.countCameras()
    void this.syncAi()

    this.wake.onChange = (wakeLock) => this.state.patch({ wakeLock })
    void this.wake.enable()
    void watchBattery((b) => {
      this.state.patch({ battery: b.level, charging: b.charging })
    }).then((off) => this.cleanups.push(off))

    this.cleanups.push(onSignal((m) => void this.onSignal(m)))
    this.timers.push(
      setInterval(() => {
        const label = this.detector?.lastAiLabel ? labelPt(this.detector.lastAiLabel) : ''
        if (label !== this.state.get().aiLabel) this.state.patch({ aiLabel: label })
        this.broadcastStatus()
      }, 1000),
    )
    this.timers.push(
      setInterval(() => {
        const s = this.state.get()
        this.broadcast({ t: 'lvl', l: round(s.level), c: round(s.cry), m: round(s.motion) })
      }, 250),
    )
    const onVisible = () => document.visibilityState === 'visible' && void this.healTracks()
    document.addEventListener('visibilitychange', onVisible)
    this.cleanups.push(() => document.removeEventListener('visibilitychange', onVisible))

    this.state.patch({ phase: 'live', stream: this.stream })
    setRole('camera')
    // Deixa pronto o som do "acalmar automaticamente" para tocar sem espera.
    setTimeout(() => {
      if (!this.stopped && this.config.autoSoothe) void soundBuffer(ctx, this.config.autoSootheSound).catch(() => {})
    }, 4000)
  }

  stop() {
    this.stopped = true
    setRole('idle')
    for (const p of this.peers.values()) p.close(true)
    this.peers.clear()
    this.timers.forEach(clearInterval)
    this.cleanups.forEach((fn) => fn())
    this.detector?.stop()
    this.analyzer?.stop()
    this.player?.dispose()
    void this.wake.disable()
    this.releaseTracks()
    if (this.probe) {
      this.probe.srcObject = null
      this.probe.remove()
    }
    setAudioSession('auto')
    this.state.patch({ phase: 'idle', stream: null, monitors: [] })
  }

  private releaseTracks() {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
  }

  // ---------- controles ----------

  get videoTrack(): MediaStreamTrack | null {
    return this.stream?.getVideoTracks()[0] ?? null
  }

  get audioTrack(): MediaStreamTrack | null {
    return this.stream?.getAudioTracks()[0] ?? null
  }

  async flip() {
    if (this.flipping || !this.stream) return
    this.flipping = true
    const s = this.state.get()
    const next: Facing = s.facing === 'user' ? 'environment' : 'user'
    try {
      await this.replaceVideo(next)
    } finally {
      this.flipping = false
    }
  }

  private async replaceVideo(facing: Facing) {
    const s = this.state.get()
    const old = this.videoTrack
    old?.stop() // iOS não abre duas câmeras ao mesmo tempo
    let track: MediaStreamTrack | null = null
    for (const f of [facing, s.facing]) {
      try {
        const ms = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(f, s.quality, s.lowLight) })
        track = ms.getVideoTracks()[0]
        facing = f
        break
      } catch {
        /* tenta a câmera anterior */
      }
    }
    if (!track || !this.stream) {
      this.state.patch({ videoOk: false })
      return
    }
    const audio = this.audioTrack
    this.stream = new MediaStream([track, ...(audio ? [audio] : [])])
    for (const p of this.peers.values()) await p.replaceVideo(track)
    if (this.probe) this.probe.srcObject = this.stream
    void this.probe?.play().catch(() => {})
    this.analyzer?.settle()
    this.state.patch({ facing, stream: this.stream, torch: false })
    this.watchTracks()
    this.refreshVideoCaps()
    if (s.lowLight) void this.applyLowLight(true)
    this.broadcastStatus()
  }

  async setTorch(on: boolean) {
    const t = this.videoTrack
    if (!t) return
    try {
      await t.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] })
      this.state.patch({ torch: on })
    } catch {
      this.state.patch({ torch: false })
    }
    this.broadcastStatus()
  }

  async setQuality(q: Quality) {
    settings.patch({ quality: q })
    const s = this.state.get()
    this.state.patch({ quality: q })
    const t = this.videoTrack
    if (t) {
      try {
        const c = videoConstraints(s.facing, q, s.lowLight)
        await t.applyConstraints({ width: c.width, height: c.height, frameRate: c.frameRate })
      } catch {
        await this.replaceVideo(s.facing)
      }
    }
    for (const p of this.peers.values()) p.applyBitrate()
    this.broadcastStatus()
  }

  /** Modo pouca luz: menos quadros por segundo → exposição mais longa → imagem mais clara. */
  async setLowLight(on: boolean) {
    if (this.state.get().lowLight === on) return
    this.state.patch({ lowLight: on })
    await this.applyLowLight(on)
    this.broadcastStatus()
  }

  private async applyLowLight(on: boolean) {
    const t = this.videoTrack
    if (!t) return
    const s = this.state.get()
    const p = QUALITY_PRESETS[s.quality]
    try {
      await t.applyConstraints({ frameRate: on ? { ideal: 12, max: 15 } : { ideal: p.fps, max: p.fps } })
    } catch {
      /* ignore */
    }
    const caps = (t.getCapabilities?.() ?? {}) as Record<string, { max?: number; min?: number } | string[] | undefined>
    const ec = caps.exposureCompensation as { max?: number } | undefined
    if (ec?.max) {
      try {
        await t.applyConstraints({ advanced: [{ exposureCompensation: on ? ec.max * 0.7 : 0 } as MediaTrackConstraintSet] })
      } catch {
        /* ignore */
      }
    }
  }

  async playSound(id: SoundState['id'], volume: number, minutes: number | null) {
    await unlockAudio()
    await this.player?.play(id, volume, minutes)
  }

  stopSound() {
    this.player?.stop()
  }

  setSoundVolume(v: number) {
    this.player?.setVolume(v)
  }

  updateConfig(patch: Partial<DetectionConfig>) {
    updateDetection(patch)
    void this.syncAi()
    this.broadcastStatus()
  }

  // ---------- sensores / IA ----------

  private autoSoothe() {
    const c = this.config
    if (!c.autoSoothe || this.player?.state) return
    void this.player?.play(c.autoSootheSound, 0.55, c.autoSootheMinutes)
    this.emitEvent('soothe', { detail: c.autoSootheSound })
  }

  private async syncAi() {
    const want = this.config.ai && this.config.cry
    const cur = this.state.get().ai
    if (!want) {
      if (cur !== 'off') {
        this.detector?.setAi(null)
        this.state.patch({ ai: 'off' })
      }
      return
    }
    if (cur === 'ready' || cur === 'loading') return
    this.state.patch({ ai: 'loading' })
    this.broadcastStatus()
    try {
      const clf = await loadAiClassifier()
      if (this.stopped || !this.config.ai) return
      this.detector?.setAi(clf)
      this.state.patch({ ai: 'ready' })
    } catch (e) {
      console.warn('[IA] não carregou', e)
      this.state.patch({ ai: 'error' })
    }
    this.broadcastStatus()
  }

  private refreshVideoCaps() {
    const t = this.videoTrack
    const caps = (t?.getCapabilities?.() ?? {}) as { torch?: boolean }
    this.state.patch({ torchAvailable: !!caps.torch, videoOk: t?.readyState === 'live' })
  }

  private async countCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const n = devices.filter((d) => d.kind === 'videoinput').length
      this.state.patch({ canFlip: n > 1 })
    } catch {
      this.state.patch({ canFlip: false })
    }
  }

  private watchTracks() {
    for (const t of this.stream?.getTracks() ?? []) {
      t.onended = () => {
        if (this.stopped) return
        this.state.patch(t.kind === 'video' ? { videoOk: false } : { audioOk: false })
        setTimeout(() => void this.healTracks(), 1500)
      }
      t.onmute = () => this.state.patch(t.kind === 'video' ? { videoOk: false } : { audioOk: false })
      t.onunmute = () => this.state.patch(t.kind === 'video' ? { videoOk: true } : { audioOk: true })
    }
    this.state.patch({
      videoOk: this.videoTrack?.readyState === 'live' && !this.videoTrack.muted,
      audioOk: this.audioTrack?.readyState === 'live' && !this.audioTrack.muted,
    })
  }

  /** Recupera câmera/microfone que o sistema encerrou (ligação, outro app, segundo plano). */
  private async healTracks() {
    if (this.stopped || !this.stream || this.flipping) return
    if (this.videoTrack?.readyState === 'ended') await this.replaceVideo(this.state.get().facing)
    const a = this.audioTrack
    if (!a || a.readyState === 'ended') {
      try {
        const ms = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS })
        const track = ms.getAudioTracks()[0]
        const v = this.videoTrack
        this.stream = new MediaStream([...(v ? [v] : []), track])
        for (const p of this.peers.values()) await p.replaceAudio(track)
        this.detector?.setStream(this.stream)
        if (this.probe) this.probe.srcObject = this.stream
        this.state.patch({ stream: this.stream })
        this.watchTracks()
      } catch {
        this.state.patch({ audioOk: false })
      }
    }
  }

  // ---------- rede ----------

  private async onSignal(m: SignalMessage) {
    if (this.stopped || !this.stream) return
    switch (m.type) {
      case 'connect': {
        this.peers.get(m.from)?.close(false)
        if (this.peers.size >= MAX_MONITORS) {
          const oldest = [...this.peers.values()].sort((a, b) => a.createdAt - b.createdAt)[0]
          oldest?.close(true)
        }
        const peer = new CameraPeer(this, m.from, m.name, m.platform)
        this.peers.set(m.from, peer)
        this.refreshMonitors()
        await peer.negotiate()
        break
      }
      case 'answer':
        await this.findPeer(m.pc)?.onAnswer(m.sdp)
        break
      case 'ice':
        await this.findPeer(m.pc)?.onRemoteIce(m.c)
        break
      case 'bye': {
        const p = this.peers.get(m.from)
        if (p && (!m.pc || m.pc === p.pcId)) p.close(false)
        break
      }
    }
  }

  private findPeer(pcId: string) {
    for (const p of this.peers.values()) if (p.pcId === pcId) return p
    return null
  }

  /** @internal */
  removePeer(peer: CameraPeer) {
    if (this.peers.get(peer.remote) === peer) this.peers.delete(peer.remote)
    this.refreshMonitors()
    this.updateTalking()
  }

  /** @internal */
  refreshMonitors() {
    const monitors: MonitorLink[] = [...this.peers.values()].map((p) => ({
      session: p.remote,
      name: p.name,
      platform: p.platform,
      state: p.pc.connectionState,
      talking: p.talking,
      safety: p.safety,
    }))
    this.state.patch({ monitors })
  }

  /** @internal */
  updateTalking() {
    const talking = [...this.peers.values()].some((p) => p.talking)
    if (talking !== this.state.get().talking) {
      this.player?.duck(talking)
      this.state.patch({ talking })
    }
    this.refreshMonitors()
  }

  /** @internal */
  localStream() {
    return this.stream
  }

  /** @internal */
  onPeerReady(peer: CameraPeer) {
    sendJson(peer.dc, this.statusMessage())
  }

  /** @internal */
  onCommand(peer: CameraPeer, cmd: MonitorToCamera) {
    switch (cmd.t) {
      case 'hello':
        peer.name = cmd.name
        peer.platform = cmd.platform
        this.refreshMonitors()
        break
      case 'flip':
        void this.flip()
        break
      case 'torch':
        void this.setTorch(cmd.on)
        break
      case 'quality':
        void this.setQuality(cmd.q)
        break
      case 'lowlight':
        void this.setLowLight(cmd.on)
        break
      case 'sound':
        void this.player?.play(cmd.id, cmd.volume, cmd.minutes)
        break
      case 'soundStop':
        this.player?.stop()
        break
      case 'soundVolume':
        this.player?.setVolume(cmd.volume)
        break
      case 'config':
        this.updateConfig(cmd.patch)
        break
      case 'talk':
        peer.talking = cmd.on
        peer.ensureTalkAudio()
        this.updateTalking()
        break
      case 'ping':
        sendJson(peer.dc, { t: 'pong', ts: cmd.ts })
        break
    }
  }

  private statusMessage(): CameraStatus {
    const s = this.state.get()
    return {
      t: 'status',
      name: settings.get().deviceName,
      platform: platformName(),
      facing: s.facing,
      canFlip: s.canFlip,
      torch: s.torch,
      torchAvailable: s.torchAvailable,
      quality: s.quality,
      lowLight: s.lowLight,
      luma: round(s.luma),
      battery: s.battery,
      charging: s.charging,
      sound: s.sound,
      ai: s.ai,
      aiLabel: s.aiLabel,
      config: this.config,
      monitors: this.peers.size,
      uptime: Math.round((Date.now() - this.startedAt) / 1000),
      wakeLock: s.wakeLock,
      videoOk: s.videoOk,
      audioOk: s.audioOk,
      crying: s.crying,
    }
  }

  private broadcast(msg: CameraToMonitor) {
    for (const p of this.peers.values()) sendJson(p.dc, msg)
  }

  private broadcastStatus() {
    if (this.peers.size) this.broadcast(this.statusMessage())
  }

  private emitEvent(kind: CameraEvent['kind'], extra: Partial<CameraEvent> = {}) {
    const ev: CameraEvent = { id: randomId(8), kind, at: Date.now(), ...extra }
    this.broadcast({ t: 'event', ev })
  }
}

const round = (x: number) => Math.round(x * 100) / 100

/** Conexão com um monitor específico. */
class CameraPeer {
  readonly pcId = randomId(6)
  readonly createdAt = Date.now()
  readonly pc: RTCPeerConnection
  readonly dc: RTCDataChannel
  readonly remote: string
  name: string
  platform: string
  talking = false
  safety: SafetyCode | null = null
  private owner: CameraSession
  private videoSender: RTCRtpSender | null = null
  private audioSender: RTCRtpSender | null = null
  private pendingRemote: RTCIceCandidateInit[] = []
  private outgoing: RTCIceCandidateInit[] = []
  private flushTimer: ReturnType<typeof setTimeout> | undefined
  private restartTimer: ReturnType<typeof setTimeout> | undefined
  private setupTimer: ReturnType<typeof setTimeout> | undefined
  private restarts = 0
  private closed = false
  private talkAudio: HTMLAudioElement | null = null
  private remoteAudio: MediaStream | null = null

  constructor(owner: CameraSession, remote: string, name: string, platform: string) {
    this.owner = owner
    this.remote = remote
    this.name = name
    this.platform = platform
    this.pc = new RTCPeerConnection(iceConfig())
    const stream = owner.localStream()!
    const video = stream.getVideoTracks()[0]
    const audio = stream.getAudioTracks()[0]
    if (video) {
      const tr = this.pc.addTransceiver(video, { direction: 'sendonly', streams: [stream] })
      preferHardwareCodec(tr)
      this.videoSender = tr.sender
    }
    // Áudio bidirecional: o monitor usa o mesmo canal para falar com o bebê.
    const atr = this.pc.addTransceiver(audio ?? 'audio', { direction: 'sendrecv', streams: [stream] })
    this.audioSender = atr.sender
    this.dc = this.pc.createDataChannel('ctl', { ordered: true })
    this.dc.onopen = () => owner.onPeerReady(this)
    this.dc.onmessage = (ev) => {
      try {
        owner.onCommand(this, JSON.parse(ev.data as string) as MonitorToCamera)
      } catch {
        /* mensagem inválida */
      }
    }
    this.pc.onicecandidate = (ev) => {
      if (!ev.candidate) return
      this.outgoing.push(ev.candidate.toJSON())
      clearTimeout(this.flushTimer)
      this.flushTimer = setTimeout(() => this.flushIce(), 120)
    }
    this.pc.ontrack = (ev) => {
      if (ev.track.kind !== 'audio') return
      this.remoteAudio = ev.streams[0] ?? new MediaStream([ev.track])
      this.ensureTalkAudio()
    }
    this.pc.onconnectionstatechange = () => this.onState()
    // Monitor que nunca responde: libera o recurso.
    this.setupTimer = setTimeout(() => {
      if (this.pc.connectionState !== 'connected') this.close(false)
    }, 45_000)
  }

  private flushIce() {
    if (!this.outgoing.length || this.closed) return
    const c = this.outgoing.splice(0)
    void sendSignal({ type: 'ice', pc: this.pcId, c }, this.remote)
  }

  async negotiate(iceRestart = false) {
    if (this.closed) return
    try {
      const offer = await this.pc.createOffer(iceRestart ? { iceRestart: true } : undefined)
      await this.pc.setLocalDescription(offer)
      await sendSignal({ type: 'offer', pc: this.pcId, sdp: this.pc.localDescription!.sdp }, this.remote)
    } catch (e) {
      console.warn('[câmera] falha na oferta', e)
    }
  }

  async onAnswer(sdp: string) {
    if (this.closed || this.pc.signalingState !== 'have-local-offer') return
    try {
      await this.pc.setRemoteDescription({ type: 'answer', sdp })
    } catch (e) {
      console.warn('[câmera] resposta inválida', e)
      return
    }
    for (const c of this.pendingRemote.splice(0)) await this.pc.addIceCandidate(c).catch(() => {})
    this.applyBitrate()
    const a = sdpFingerprint(this.pc.localDescription?.sdp)
    const b = sdpFingerprint(this.pc.remoteDescription?.sdp)
    if (a && b) {
      this.safety = await safetyCode(a, b)
      this.owner.refreshMonitors()
    }
  }

  async onRemoteIce(cands: RTCIceCandidateInit[]) {
    if (this.closed) return
    if (!this.pc.remoteDescription) {
      this.pendingRemote.push(...cands)
      return
    }
    for (const c of cands) await this.pc.addIceCandidate(c).catch(() => {})
  }

  applyBitrate() {
    if (!this.videoSender) return
    const s = this.owner.state.get()
    const p = QUALITY_PRESETS[s.quality]
    void setMaxBitrate(this.videoSender, p.bitrate, s.lowLight ? 15 : p.fps)
  }

  async replaceVideo(track: MediaStreamTrack) {
    await this.videoSender?.replaceTrack(track).catch(() => {})
  }

  async replaceAudio(track: MediaStreamTrack) {
    await this.audioSender?.replaceTrack(track).catch(() => {})
  }

  ensureTalkAudio() {
    if (!this.remoteAudio) return
    if (!this.talkAudio) {
      const el = document.createElement('audio')
      el.autoplay = true
      el.setAttribute('playsinline', '')
      el.style.display = 'none'
      document.body.appendChild(el)
      this.talkAudio = el
    }
    if (this.talkAudio.srcObject !== this.remoteAudio) this.talkAudio.srcObject = this.remoteAudio
    void this.talkAudio.play().catch(() => {})
  }

  private onState() {
    if (this.closed) return
    const st = this.pc.connectionState
    clearTimeout(this.restartTimer)
    if (st === 'connected') {
      this.restarts = 0
      clearTimeout(this.setupTimer)
    } else if (st === 'disconnected') {
      this.restartTimer = setTimeout(() => this.restart(), 4000)
    } else if (st === 'failed') {
      this.restart()
    } else if (st === 'closed') {
      this.close(false)
    }
    this.owner.refreshMonitors()
  }

  private restart() {
    if (this.closed) return
    if (++this.restarts > 4) return this.close(false)
    void this.negotiate(true)
    // Se a reconexão não vingar, tenta de novo.
    this.restartTimer = setTimeout(() => {
      if (this.pc.connectionState !== 'connected') this.restart()
    }, 10_000)
  }

  close(notify: boolean) {
    if (this.closed) return
    this.closed = true
    clearTimeout(this.flushTimer)
    clearTimeout(this.restartTimer)
    clearTimeout(this.setupTimer)
    if (notify) void sendSignal({ type: 'bye', pc: this.pcId }, this.remote)
    try {
      this.dc.close()
    } catch {
      /* ignore */
    }
    this.pc.close()
    if (this.talkAudio) {
      this.talkAudio.srcObject = null
      this.talkAudio.remove()
    }
    this.owner.removePeer(this)
  }
}
