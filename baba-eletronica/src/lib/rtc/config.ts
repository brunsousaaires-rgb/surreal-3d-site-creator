import { settings } from '../settings'

export function iceConfig(): RTCConfiguration {
  const s = settings.get()
  const iceServers: RTCIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ]
  for (const t of s.turnServers) {
    const urls = t.urls.split(/[\s,]+/).filter(Boolean)
    if (urls.length) iceServers.push({ urls, username: t.username, credential: t.credential })
  }
  const relayOnly = s.forceRelay && s.turnServers.length > 0
  return {
    iceServers,
    iceTransportPolicy: relayOnly ? 'relay' : 'all',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  }
}

/**
 * Prefere H.264 quando o aparelho codifica em hardware (menos bateria e calor
 * para transmitir a noite toda). Sem H.264, mantém a ordem padrão (VP8/VP9).
 */
export function preferHardwareCodec(tr: RTCRtpTransceiver) {
  try {
    const send = RTCRtpSender.getCapabilities?.('video')
    const recv = RTCRtpReceiver.getCapabilities?.('video')
    if (!send || !recv || !tr.setCodecPreferences) return
    const canEncodeH264 = send.codecs.some((c) => c.mimeType.toLowerCase() === 'video/h264')
    if (!canEncodeH264) return
    const score = (c: RTCRtpCodec) => {
      const mime = c.mimeType.toLowerCase()
      if (mime !== 'video/h264') return 0
      const fmtp = c.sdpFmtpLine ?? ''
      let s = 10
      if (fmtp.includes('packetization-mode=1')) s += 2
      if (/profile-level-id=42e0/i.test(fmtp)) s += 1 // baseline restrita: compatível com todos
      return s
    }
    const codecs = [...recv.codecs].sort((a, b) => score(b) - score(a))
    tr.setCodecPreferences(codecs)
  } catch {
    /* navegador sem suporte: usa a negociação padrão */
  }
}

export async function setMaxBitrate(sender: RTCRtpSender, bps: number, fps?: number) {
  try {
    const p = sender.getParameters()
    if (!p.encodings || p.encodings.length === 0) return
    p.encodings[0].maxBitrate = bps
    if (fps) p.encodings[0].maxFramerate = fps
    await sender.setParameters(p)
  } catch {
    /* alguns navegadores rejeitam antes da negociação terminar */
  }
}

export type PathKind = 'local' | 'internet' | 'relay'

export interface LinkStats {
  rtt: number | null
  bitrate: number | null
  fps: number | null
  width: number | null
  height: number | null
  path: PathKind | null
  codec: string | null
  lost: number | null
}

export const EMPTY_STATS: LinkStats = {
  rtt: null,
  bitrate: null,
  fps: null,
  width: null,
  height: null,
  path: null,
  codec: null,
  lost: null,
}

/** Lê estatísticas de recepção (lado do monitor). */
export async function readStats(pc: RTCPeerConnection, prev: { bytes: number; at: number }): Promise<LinkStats> {
  const report = await pc.getStats()
  const out: LinkStats = { ...EMPTY_STATS }
  let pairId: string | undefined
  const byId = new Map<string, Record<string, unknown>>()
  report.forEach((s) => byId.set(s.id, s as Record<string, unknown>))
  report.forEach((s) => {
    const r = s as Record<string, unknown>
    if (r.type === 'transport' && typeof r.selectedCandidatePairId === 'string') pairId = r.selectedCandidatePairId
  })
  if (!pairId) {
    report.forEach((s) => {
      const r = s as Record<string, unknown>
      if (r.type === 'candidate-pair' && r.state === 'succeeded' && (r.nominated || r.selected)) pairId = r.id as string
    })
  }
  const pair = pairId ? byId.get(pairId) : undefined
  if (pair) {
    if (typeof pair.currentRoundTripTime === 'number') out.rtt = Math.round(pair.currentRoundTripTime * 1000)
    const local = byId.get(pair.localCandidateId as string)
    const remote = byId.get(pair.remoteCandidateId as string)
    const lt = local?.candidateType
    const rt = remote?.candidateType
    if (lt === 'relay' || rt === 'relay') out.path = 'relay'
    else if (lt === 'host' && rt === 'host') out.path = 'local'
    else out.path = 'internet'
    // Mesma rede privada também conta como "local".
    const ip = String(remote?.address ?? remote?.ip ?? '')
    if (out.path === 'internet' && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)) out.path = 'local'
  }
  report.forEach((s) => {
    const r = s as Record<string, unknown>
    if (r.type === 'inbound-rtp' && r.kind === 'video') {
      const bytes = Number(r.bytesReceived ?? 0)
      const now = Number(r.timestamp ?? performance.now())
      if (prev.at && now > prev.at) out.bitrate = Math.max(0, ((bytes - prev.bytes) * 8) / ((now - prev.at) / 1000))
      prev.bytes = bytes
      prev.at = now
      out.fps = typeof r.framesPerSecond === 'number' ? Math.round(r.framesPerSecond) : null
      out.width = (r.frameWidth as number) ?? null
      out.height = (r.frameHeight as number) ?? null
      out.lost = (r.packetsLost as number) ?? null
      const codec = byId.get(r.codecId as string)
      if (codec?.mimeType) out.codec = String(codec.mimeType).replace('video/', '')
    }
  })
  return out
}
