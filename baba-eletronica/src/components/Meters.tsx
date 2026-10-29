import { Battery, BatteryCharging, BatteryFull, BatteryLow, BatteryMedium } from 'lucide-react'
import { cn } from './ui'

/** Medidor de som em barras (estilo equalizador). */
export function LevelBars({ level, bars = 12, className, tone = 'moon' }: { level: number; bars?: number; className?: string; tone?: 'moon' | 'coral' }) {
  const lit = Math.round(Math.max(0, Math.min(1, level)) * bars)
  return (
    <div className={cn('flex h-6 items-end gap-[3px]', className)} aria-label={`Nível de som ${Math.round(level * 100)}%`} role="meter" aria-valuenow={Math.round(level * 100)} aria-valuemin={0} aria-valuemax={100}>
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className={cn(
            'w-1 rounded-full transition-all duration-150',
            i < lit ? (tone === 'coral' || i >= bars * 0.8 ? 'bg-coral' : i >= bars * 0.55 ? 'bg-moon' : 'bg-mint') : 'bg-white/15',
          )}
          style={{ height: `${30 + (i / bars) * 70}%` }}
        />
      ))}
    </div>
  )
}

/** Histórico do nível sonoro (últimos ~30 s). */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const n = 120
  const pts = values.slice(-n)
  const w = 240
  const h = 40
  const step = w / (n - 1)
  const offset = n - pts.length
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${((i + offset) * step).toFixed(1)},${(h - Math.min(1, v) * (h - 2) - 1).toFixed(1)}`).join('')
  const area = pts.length ? `${d}L${w},${h}L${(offset * step).toFixed(1)},${h}Z` : ''
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn('h-10 w-full', className)} aria-hidden="true">
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-moon)" stopOpacity="0.45" />
          <stop offset="1" stopColor="var(--color-moon)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {area && <path d={area} fill="url(#spark)" />}
      {d && <path d={d} fill="none" stroke="var(--color-moon)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
    </svg>
  )
}

export function BatteryBadge({ level, charging }: { level: number | null; charging: boolean | null }) {
  if (level === null) return null
  const pct = Math.round(level * 100)
  const Icon = charging ? BatteryCharging : level > 0.85 ? BatteryFull : level > 0.45 ? BatteryMedium : level > 0.15 ? Battery : BatteryLow
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-bold', level <= 0.15 && !charging ? 'text-coral' : 'text-white/85')}>
      <Icon className="size-4" />
      {pct}%
    </span>
  )
}
