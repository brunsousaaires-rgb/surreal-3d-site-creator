import { CameraOff } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { encode, QrCodeDataType } from 'uqr'

/** QR code em SVG com módulos arredondados. */
export function QrCode({ value, className = 'size-64' }: { value: string; className?: string }) {
  const qr = useMemo(() => encode(value, { ecc: 'M', border: 0 }), [value])
  const n = qr.size
  const pad = 2
  const parts: string[] = []
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!qr.data[y][x] || qr.types[y][x] === QrCodeDataType.Position) continue
      parts.push(`M${x + pad + 0.12},${y + pad + 0.5}a0.38,0.38 0 1,0 0.76,0a0.38,0.38 0 1,0 -0.76,0`)
    }
  }
  const finder = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x + pad + 0.5} y={y + pad + 0.5} width={6} height={6} rx={1.8} fill="none" stroke="#0b1124" strokeWidth={1} />
      <rect x={x + pad + 2} y={y + pad + 2} width={3} height={3} rx={0.9} fill="#0b1124" />
    </g>
  )
  return (
    <svg viewBox={`0 0 ${n + pad * 2} ${n + pad * 2}`} className={className} role="img" aria-label="QR code de pareamento">
      <rect width={n + pad * 2} height={n + pad * 2} rx={3} fill="#ffffff" />
      <path d={parts.join('')} fill="#0b1124" />
      {finder(0, 0)}
      {finder(n - 7, 0)}
      {finder(0, n - 7)}
    </svg>
  )
}

type Detector = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> }

/** Leitor de QR pela câmera traseira (BarcodeDetector nativo ou jsQR). */
export function QrScanner({ onResult }: { onResult: (text: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const done = useRef(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    async function run() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
      } catch {
        setError('Não foi possível abrir a câmera. Libere o acesso ou digite o código.')
        return
      }
      if (cancelled) return stream.getTracks().forEach((t) => t.stop())
      const v = videoRef.current!
      v.srcObject = stream
      await v.play().catch(() => {})

      let detector: Detector | null = null
      const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector
      if (BD) {
        try {
          detector = new BD({ formats: ['qr_code'] })
        } catch {
          detector = null
        }
      }
      const jsQR = detector ? null : (await import('jsqr')).default

      const scan = async () => {
        if (cancelled || done.current) return
        try {
          if (v.readyState >= 2 && v.videoWidth) {
            let text: string | null = null
            if (detector) {
              const codes = await detector.detect(v)
              text = codes[0]?.rawValue ?? null
            } else if (jsQR && ctx) {
              const scale = Math.min(1, 720 / v.videoWidth)
              canvas.width = Math.round(v.videoWidth * scale)
              canvas.height = Math.round(v.videoHeight * scale)
              ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
              text = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null
            }
            if (text) {
              done.current = true
              onResult(text)
              return
            }
          }
        } catch {
          /* próximo quadro */
        }
        timer = setTimeout(scan, 160)
      }
      void scan()
    }
    void run()
    return () => {
      cancelled = true
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [onResult])

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-3xl bg-black">
      {error ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-ink-muted">
          <CameraOff className="size-10" />
          <p className="text-sm">{error}</p>
        </div>
      ) : (
        <>
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline autoPlay />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative size-3/5 rounded-3xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
              <div className="absolute inset-x-4 top-1/2 h-0.5 animate-breathe bg-moon shadow-[0_0_12px] shadow-moon" />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
