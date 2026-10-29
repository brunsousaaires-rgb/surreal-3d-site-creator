import { saveFile, stamp } from '../device'

function pickMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  const options = [
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ]
  return options.find((m) => MediaRecorder.isTypeSupported?.(m))
}

export const canRecord = () => typeof MediaRecorder !== 'undefined'

/** Grava um clipe do que está na tela (inclui o realce de visão noturna). */
export class ClipRecorder {
  private rec: MediaRecorder | null = null
  private chunks: Blob[] = []
  private mime = 'video/webm'
  startedAt = 0

  start(stream: MediaStream) {
    const mime = pickMime()
    this.chunks = []
    this.rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 2_500_000 } : undefined)
    this.mime = this.rec.mimeType || mime || 'video/webm'
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data)
    this.rec.start(1000)
    this.startedAt = Date.now()
  }

  get recording() {
    return this.rec?.state === 'recording'
  }

  stop(): Promise<Blob | null> {
    const rec = this.rec
    if (!rec) return Promise.resolve(null)
    return new Promise((resolve) => {
      rec.onstop = () => {
        this.rec = null
        resolve(this.chunks.length ? new Blob(this.chunks, { type: this.mime }) : null)
      }
      try {
        rec.stop()
      } catch {
        resolve(null)
      }
    })
  }

  static extension(blob: Blob) {
    return blob.type.includes('mp4') ? 'mp4' : 'webm'
  }
}

export function recordingStream(remote: MediaStream, canvas: HTMLCanvasElement | null): MediaStream {
  if (canvas && canvas.width && 'captureStream' in canvas) {
    const v = canvas.captureStream(24).getVideoTracks()
    return new MediaStream([...v, ...remote.getAudioTracks()])
  }
  return remote
}

export async function snapshot(video: HTMLVideoElement, canvas: HTMLCanvasElement | null): Promise<void> {
  let source: CanvasImageSource = video
  let w = video.videoWidth
  let h = video.videoHeight
  if (canvas && canvas.width) {
    source = canvas
    w = canvas.width
    h = canvas.height
  }
  if (!w || !h) return
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.drawImage(source, 0, 0, w, h)
  // Marca d'água discreta com data/hora.
  const label = new Date().toLocaleString('pt-BR')
  ctx.font = `${Math.round(h / 32)}px system-ui, sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.shadowColor = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur = 4
  ctx.fillText(`Ninar · ${label}`, Math.round(h / 40), h - Math.round(h / 40))
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.92))
  if (blob) await saveFile(blob, `ninar_${stamp()}.jpg`)
}
