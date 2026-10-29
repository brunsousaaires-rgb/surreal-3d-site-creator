import { useRef, useState, type ReactNode } from 'react'

/** Zoom com pinça e arraste (até 5×). Toque duplo alterna 1× ↔ 2,5×. */
export function ZoomPan({ children, onTap, className }: { children: ReactNode; onTap?: () => void; className?: string }) {
  const [t, setT] = useState({ s: 1, x: 0, y: 0 })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const start = useRef<{ s: number; x: number; y: number; d: number; cx: number; cy: number } | null>(null)
  const lastTap = useRef(0)
  const moved = useRef(false)
  const box = useRef<HTMLDivElement>(null)

  const clamp = (n: { s: number; x: number; y: number }) => {
    const el = box.current
    const s = Math.min(5, Math.max(1, n.s))
    if (!el || s === 1) return { s, x: 0, y: 0 }
    const maxX = (el.clientWidth * (s - 1)) / 2
    const maxY = (el.clientHeight * (s - 1)) / 2
    return { s, x: Math.max(-maxX, Math.min(maxX, n.x)), y: Math.max(-maxY, Math.min(maxY, n.y)) }
  }

  const snapshot = () => {
    const pts = [...pointers.current.values()]
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length
    const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length
    const d = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0
    start.current = { ...t, d, cx, cy }
  }

  return (
    <div
      ref={box}
      className={className}
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        moved.current = false
        snapshot()
      }}
      onPointerMove={(e) => {
        if (!pointers.current.has(e.pointerId) || !start.current) return
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        const pts = [...pointers.current.values()]
        const st = start.current
        const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length
        const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length
        if (Math.hypot(cx - st.cx, cy - st.cy) > 6) moved.current = true
        if (pts.length > 1 && st.d > 0) {
          const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
          moved.current = true
          setT(clamp({ s: st.s * (d / st.d), x: st.x + (cx - st.cx), y: st.y + (cy - st.cy) }))
        } else if (st.s > 1) {
          setT(clamp({ s: st.s, x: st.x + (cx - st.cx), y: st.y + (cy - st.cy) }))
        }
      }}
      onPointerUp={(e) => {
        pointers.current.delete(e.pointerId)
        if (pointers.current.size) return snapshot()
        start.current = null
        if (moved.current) return
        const now = Date.now()
        if (now - lastTap.current < 300) {
          lastTap.current = 0
          setT((cur) => (cur.s > 1 ? { s: 1, x: 0, y: 0 } : { s: 2.5, x: 0, y: 0 }))
        } else {
          lastTap.current = now
          setTimeout(() => lastTap.current === now && onTap?.(), 310)
        }
      }}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId)
        start.current = null
      }}
    >
      <div className="h-full w-full will-change-transform" style={{ transform: `translate3d(${t.x}px, ${t.y}px, 0) scale(${t.s})` }}>
        {children}
      </div>
      {t.s > 1 && (
        <div className="glass-dark pointer-events-none absolute bottom-40 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-bold text-white">
          {t.s.toFixed(1)}×
        </div>
      )}
    </div>
  )
}
