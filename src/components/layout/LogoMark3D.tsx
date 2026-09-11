import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'

const REST_TRANSFORM = 'rotateY(0deg) rotateX(0deg) scale(1)'

/** Emblema oficial com leve inclinação 3D ao mover o mouse (parallax), sem alterar a arte original. */
export function LogoMark3D({ className }: { className?: string }) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [transform, setTransform] = useState(REST_TRANSFORM)

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = wrapperRef.current?.getBoundingClientRect()
    if (!rect) return
    const px = (e.clientX - rect.left) / rect.width - 0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5
    setTransform(`rotateY(${px * 16}deg) rotateX(${-py * 16}deg) scale(1.05)`)
  }

  return (
    <div
      ref={wrapperRef}
      onMouseMove={handleMove}
      onMouseLeave={() => setTransform(REST_TRANSFORM)}
      className={cn('relative [perspective:900px]', className)}
    >
      <div
        className="relative h-full w-full transition-transform duration-300 ease-out will-change-transform"
        style={{ transform }}
      >
        <div className="absolute inset-[6%] rounded-full bg-primary/40 blur-2xl" />
        <img
          src="/brand/logo-mark.png"
          alt="Estância Imperial Sports"
          draggable={false}
          className="relative h-full w-full rounded-full drop-shadow-[0_25px_45px_rgba(0,0,0,0.5)]"
        />
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background: 'radial-gradient(120% 90% at 30% 12%, rgba(255,255,255,0.35), transparent 55%)',
          }}
        />
      </div>
    </div>
  )
}
