// Unidade dos pais: conecta à câmera, recebe vídeo/áudio, controla a câmera
// remotamente e permite falar com o bebê (push-to-talk).
import { safetyCode, sdpFingerprint, type SafetyCode } from '../crypto'
import { platformName, ScreenWake, setAudioSession } from '../device'
import { settings } from '../settings'
import {
  directory,
  onlineCameras,
  onSignal,
  probe,
  sendSignal,
  setRole,
  type PeerInfo,
  type SignalMessage,
} from '../signaling'
import { createStore, type Store } from '../store'
import { deviceId } from '../vault'
import { EMPTY_STATS, iceConfig, readStats, type LinkStats } from './config'
import { sendJson, type CameraEvent, type CameraStatus, type CameraToMonitor, type MonitorToCamera } from './protocol'

export type MonitorPhase = 'searching' | 'choose' | 'connecting' | 'live' | 'reconnecting'

export interface MonitorState {
  phase: MonitorPhase
  target: PeerInfo | null
  candidates: PeerInfo[]
  stream: MediaStream | null
  status: CameraStatus | null
  level: number
  cry: number
  motion: number
  history: number[]
  stats: LinkStats
  safety: SafetyCode | null
  talking: boolean
  talkError: string | null
  everLive: boolean
  lostSince: number | null
  wakeLock: boolean
}

const HISTORY = 120 // 30 s a 4 amostras/s

export class MonitorSession {
  readonly state: Store<MonitorState>
  onCameraEvent?: (ev: CameraEvent, camera: string) => void
  onLink?: (kind: 'lost' | 'restored', camera: string) => void
  onStatus?: (s: CameraStatus) => void
  private pc: RTCPeerConnection | null = null
  private dc: RTCDataChannel | null = null
  private pcId: string | null = null
  private audioSender: RTCRtpSender | null = null
  private mic: MediaStreamTrack | null = null
  private pendingIce = new Map<string, RTCIceCandidateInit[]>()
  private outgoing: RTCIceCandidateInit[] = []
  private flushTimer: ReturnType<typeof setTimeout> | undefined
  private timers: ReturnType<typeof setInterval>[] = []
  private cleanups: (() => void)[] = []
  private queue: Promise<void> = Promise.resolve()
  private lastStatusAt = 0
  private attemptAt = 0
  private lastProbe = 0
  private alerted = false
  private statsPrev = { bytes: 0, at: 0 }
  private stopped = false
  private wake = new ScreenWake()

  constructor() {
    this.state = createStore<MonitorState>({
      phase: 'searching',
      target: null,
      candidates: [],
      stream: null,
      status: null,
      level: 0,
      cry: 0,
      motion: 0,
      history: [],
      stats: { ...EMPTY_STATS },
      safety: null,
      talking: false,
      talkError: null,
      everLive: false,
      lostSince: null,
      wakeLock: false,
    })
  }

  /** Chamar a partir de um toque (desbloqueia áudio e, opcionalmente, o microfone). */
  async start() {
    setAudioSession('playback')
    // A tela precisa ficar acesa: com o aparelho bloqueado o navegador pausa o app.
    this.wake.onChange = (wakeLock) => this.state.patch({ wakeLock })
    void this.wake.enable()
    // Com permissão de microfone o navegador revela os IPs locais reais, o que
    // melhora a conexão direta na mesma rede Wi-Fi (e já deixa o "falar" pronto).
    if (settings.get().askMicOnMonitor) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true })
        s.getTracks().forEach((t) => t.stop())
      } catch {
        /* segue sem microfone */
      }
      setAudioSession('playback')
    }
    if (this.stopped) return
    this.cleanups.push(onSignal((m) => this.onSignal(m)))
    this.cleanups.push(directory.subscribe(() => this.tick()))
    this.timers.push(setInterval(() => this.tick(), 1500))
    this.timers.push(setInterval(() => void this.pollStats(), 2000))
    setRole('monitor')
    probe()
    this.tick()
  }

  stop() {
    this.stopped = true
    void this.wake.disable()
    setRole('idle')
    this.timers.forEach(clearInterval)
    this.cleanups.forEach((fn) => fn())
    void this.stopTalk()
    if (this.pc && this.state.get().target) void sendSignal({ type: 'bye', pc: this.pcId ?? undefined }, this.state.get().target!.session)
    this.closePc()
    setAudioSession('auto')
  }

  chooseCamera(peer: PeerInfo) {
    settings.patch({ lastCamera: peer.device })
    this.closePc()
    this.state.patch({ target: peer, phase: 'connecting', status: null, stream: null })
    this.connect()
  }

  /** Volta para a lista de câmeras. */
  forgetTarget() {
    this.closePc()
    settings.patch({ lastCamera: null })
    this.state.patch({ target: null, phase: 'searching', status: null, stream: null, everLive: false, lostSince: null })
    this.tick()
  }

  send(cmd: MonitorToCamera) {
    return sendJson(this.dc, cmd)
  }

  reconnect() {
    this.connect()
  }

  async startTalk(): Promise<boolean> {
    if (this.state.get().talking) return true
    if (!this.audioSender || this.dc?.readyState !== 'open') {
      this.state.patch({ talkError: 'Conecte-se à câmera para falar.' })
      return false
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      this.mic = s.getAudioTracks()[0]
      await this.audioSender.replaceTrack(this.mic)
      this.send({ t: 'talk', on: true })
      this.state.patch({ talking: true, talkError: null })
      return true
    } catch {
      this.state.patch({ talkError: 'Permita o acesso ao microfone para falar com o bebê.' })
      return false
    }
  }

  async stopTalk() {
    if (!this.state.get().talking && !this.mic) return
    this.send({ t: 'talk', on: false })
    await this.audioSender?.replaceTrack(null).catch(() => {})
    this.mic?.stop()
    this.mic = null
    this.state.patch({ talking: false })
    setAudioSession('playback')
  }

  // ---------- conexão ----------

  private connect() {
    const target = this.state.get().target
    if (!target || this.stopped) return
    this.attemptAt = Date.now()
    const s = this.state.get()
    this.state.patch({ phase: s.everLive ? 'reconnecting' : 'connecting' })
    void sendSignal(
      { type: 'connect', name: settings.get().deviceName, device: deviceId, platform: platformName() },
      target.session,
    )
  }

  private tick() {
    if (this.stopped) return
    const now = Date.now()
    const s = this.state.get()
    const cams = onlineCameras(directory.get().peers)
    if (cams.length !== s.candidates.length || cams.some((c, i) => c.session !== s.candidates[i]?.session)) {
      this.state.patch({ candidates: cams })
    }

    if (!s.target) {
      const preferred = cams.find((c) => c.device === settings.get().lastCamera)
      if (preferred || cams.length === 1) return this.chooseCamera(preferred ?? cams[0])
      this.state.patch({ phase: cams.length > 1 ? 'choose' : 'searching' })
      if (now - this.lastProbe > 6000) {
        this.lastProbe = now
        probe()
      }
      return
    }

    // A câmera reiniciou o app (nova sessão)? Reconecta à nova.
    const fresh = cams.find((c) => c.device === s.target!.device)
    if (fresh && fresh.session !== s.target.session) {
      this.state.patch({ target: fresh })
      this.closePc()
      this.connect()
      return
    }

    if (s.phase === 'live') {
      if (now - this.lastStatusAt > 7000) {
        this.markDown()
        this.connect()
      }
    } else if (now - this.attemptAt > 10_000) {
      if (now - this.lastProbe > 5000) {
        this.lastProbe = now
        probe()
      }
      this.connect()
    }

    const lostSince = this.state.get().lostSince
    if (lostSince && !this.alerted && now - lostSince > settings.get().lostAfterSec * 1000) {
      this.alerted = true
      this.onLink?.('lost', s.target.name)
    }
  }

  private markDown() {
    const s = this.state.get()
    if (s.phase === 'live') {
      // Zera os medidores: valores antigos não devem parecer "ao vivo".
      this.state.patch({ phase: 'reconnecting', lostSince: s.lostSince ?? Date.now(), level: 0, cry: 0, motion: 0 })
    }
  }

  private markLive() {
    const s = this.state.get()
    if (this.alerted && s.target) this.onLink?.('restored', s.target.name)
    this.alerted = false
    this.lastStatusAt = Date.now()
    this.state.patch({ phase: 'live', everLive: true, lostSince: null })
  }

  private onSignal(m: SignalMessage) {
    const target = this.state.get().target
    if (!target || m.from !== target.session) return
    if (m.type === 'offer') this.queue = this.queue.then(() => this.onOffer(m.pc, m.sdp))
    else if (m.type === 'ice') this.queue = this.queue.then(() => this.onIce(m.pc, m.c))
    else if (m.type === 'bye') {
      if (!m.pc || m.pc === this.pcId) {
        this.markDown()
        this.closePc()
      }
    }
  }

  private async onOffer(pcId: string, sdp: string) {
    if (this.stopped) return
    if (pcId !== this.pcId || !this.pc) {
      this.closePc()
      this.createPc(pcId)
    }
    const pc = this.pc!
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp })
      if (!this.audioSender) {
        const tr = pc.getTransceivers().find((t) => t.receiver.track.kind === 'audio')
        if (tr) {
          tr.direction = 'sendrecv'
          this.audioSender = tr.sender
        }
      }
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await sendSignal({ type: 'answer', pc: pcId, sdp: pc.localDescription!.sdp }, this.state.get().target!.session)
      const pending = this.pendingIce.get(pcId) ?? []
      this.pendingIce.delete(pcId)
      for (const c of pending) await pc.addIceCandidate(c).catch(() => {})
    } catch (e) {
      console.warn('[monitor] falha ao responder oferta', e)
    }
  }

  private async onIce(pcId: string, cands: RTCIceCandidateInit[]) {
    if (pcId === this.pcId && this.pc?.remoteDescription) {
      for (const c of cands) await this.pc.addIceCandidate(c).catch(() => {})
      return
    }
    const list = this.pendingIce.get(pcId) ?? []
    list.push(...cands)
    this.pendingIce.set(pcId, list)
    if (this.pendingIce.size > 4) this.pendingIce.delete(this.pendingIce.keys().next().value!)
  }

  private createPc(pcId: string) {
    const pc = new RTCPeerConnection(iceConfig())
    this.pc = pc
    this.pcId = pcId
    this.audioSender = null
    this.statsPrev = { bytes: 0, at: 0 }
    pc.ontrack = () => {
      const tracks = pc.getReceivers().map((r) => r.track).filter((t) => t.readyState === 'live')
      this.state.patch({ stream: new MediaStream(tracks) })
    }
    pc.ondatachannel = (ev) => {
      const dc = ev.channel
      this.dc = dc
      dc.onopen = () => {
        sendJson(dc, { t: 'hello', name: settings.get().deviceName, platform: platformName() })
        this.markLive()
      }
      dc.onmessage = (e) => {
        try {
          this.onData(JSON.parse(e.data as string) as CameraToMonitor)
        } catch {
          /* ignore */
        }
      }
      dc.onclose = () => this.dc === dc && this.markDown()
    }
    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return
      this.outgoing.push(ev.candidate.toJSON())
      clearTimeout(this.flushTimer)
      this.flushTimer = setTimeout(() => {
        const t = this.state.get().target
        if (!t || !this.outgoing.length || this.pcId !== pcId) return
        void sendSignal({ type: 'ice', pc: pcId, c: this.outgoing.splice(0) }, t.session)
      }, 120)
    }
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc) return
      const st = pc.connectionState
      if (st === 'connected') {
        void this.computeSafety(pc)
        if (this.dc?.readyState === 'open') this.markLive()
      } else if (st === 'disconnected') this.markDown()
      else if (st === 'failed') {
        this.markDown()
        this.connect()
      }
    }
  }

  private closePc() {
    clearTimeout(this.flushTimer)
    this.outgoing = []
    if (this.state.get().talking) void this.stopTalk()
    this.dc?.close()
    this.pc?.close()
    this.dc = null
    this.pc = null
    this.pcId = null
    this.audioSender = null
    this.state.patch({ safety: null })
  }

  private async computeSafety(pc: RTCPeerConnection) {
    const a = sdpFingerprint(pc.localDescription?.sdp)
    const b = sdpFingerprint(pc.remoteDescription?.sdp)
    if (a && b) this.state.patch({ safety: await safetyCode(a, b) })
  }

  private onData(msg: CameraToMonitor) {
    switch (msg.t) {
      case 'status':
        this.lastStatusAt = Date.now()
        if (this.state.get().phase !== 'live') this.markLive()
        this.state.patch({ status: msg })
        this.onStatus?.(msg)
        break
      case 'lvl': {
        this.lastStatusAt = Date.now()
        const history = [...this.state.get().history, msg.l]
        if (history.length > HISTORY) history.splice(0, history.length - HISTORY)
        this.state.patch({ level: msg.l, cry: msg.c, motion: msg.m, history })
        break
      }
      case 'event':
        this.onCameraEvent?.(msg.ev, this.state.get().target?.name ?? 'Câmera')
        break
    }
  }

  private async pollStats() {
    if (!this.pc || this.state.get().phase !== 'live') return
    try {
      this.state.patch({ stats: await readStats(this.pc, this.statsPrev) })
    } catch {
      /* ignore */
    }
  }
}
