import { ChevronLeft, LoaderCircle, X } from 'lucide-react'
import { useEffect, useId, type ButtonHTMLAttributes, type ReactNode } from 'react'

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary:
    'bg-moon text-night-950 hover:bg-moon-strong shadow-[0_8px_30px_-8px] shadow-moon/50 disabled:bg-night-600 disabled:text-ink-muted disabled:shadow-none',
  secondary: 'glass text-ink hover:bg-night-700/80',
  ghost: 'text-ink-soft hover:bg-white/5',
  danger: 'bg-coral/15 text-coral hover:bg-coral/25 border border-coral/30',
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  loading,
  full,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
  icon?: ReactNode
  loading?: boolean
  full?: boolean
}) {
  const sizes = { sm: 'h-10 px-4 text-sm gap-2', md: 'h-12 px-5 text-[15px] gap-2.5', lg: 'h-14 px-6 text-base gap-3' }
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-2xl font-bold transition-all active:scale-[0.97] disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        full && 'w-full',
        className,
      )}
    >
      {loading ? <LoaderCircle className="size-5 animate-spin" /> : icon}
      {children}
    </button>
  )
}

export function IconButton({
  label,
  active,
  tone = 'glass',
  size = 'md',
  className,
  children,
  showLabel,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  active?: boolean
  tone?: 'glass' | 'dark' | 'danger' | 'plain'
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}) {
  const sizes = { sm: 'size-10', md: 'size-12', lg: 'size-16' }
  const tones = {
    glass: 'glass text-ink',
    dark: 'glass-dark text-white',
    danger: 'bg-coral text-white',
    plain: 'text-ink-soft hover:bg-white/5',
  }
  const btn = (
    <button
      {...rest}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full transition-all active:scale-90 disabled:opacity-40',
        sizes[size],
        active ? 'bg-moon text-night-950 border-transparent' : tones[tone],
        className,
      )}
    >
      {children}
    </button>
  )
  if (!showLabel) return btn
  return (
    <div className="flex flex-col items-center gap-1.5">
      {btn}
      <span className="max-w-[4.5rem] truncate text-center text-[11px] font-semibold text-white/80">{label}</span>
    </div>
  )
}

export function Card({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cn('glass rounded-3xl p-5', onClick && 'cursor-pointer transition active:scale-[0.99]', className)}
    >
      {children}
    </div>
  )
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-8 w-[3.25rem] shrink-0 rounded-full transition-colors disabled:opacity-40',
        checked ? 'bg-mint' : 'bg-night-600',
      )}
    >
      <span
        className={cn(
          'absolute top-1 left-1 size-6 rounded-full bg-white shadow transition-transform',
          checked && 'translate-x-5',
        )}
      />
    </button>
  )
}

export function SettingRow({
  icon,
  title,
  description,
  children,
  onClick,
}: {
  icon?: ReactNode
  title: string
  description?: ReactNode
  children?: ReactNode
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={cn('flex items-center gap-4 py-3.5', onClick && 'cursor-pointer active:opacity-70')}
    >
      {icon && <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-night-700 text-moon">{icon}</div>}
      <div className="min-w-0 flex-1">
        <div className="font-bold text-ink">{title}</div>
        {description && <div className="mt-0.5 text-sm leading-snug text-ink-muted">{description}</div>}
      </div>
      {children}
    </div>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  className,
}: {
  value: T
  options: { value: T; label: string; icon?: ReactNode }[]
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div role="radiogroup" className={cn('flex rounded-2xl bg-night-850 p-1', className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-bold transition-all',
            o.value === value ? 'bg-night-600 text-ink shadow' : 'text-ink-muted',
          )}
        >
          {o.icon}
          <span className="truncate">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

export function Slider({
  value,
  onChange,
  onCommit,
  label,
  min = 0,
  max = 1,
  step = 0.01,
}: {
  value: number
  onChange: (v: number) => void
  onCommit?: (v: number) => void
  label: string
  min?: number
  max?: number
  step?: number
}) {
  const fill = `${((value - min) / (max - min)) * 100}%`
  return (
    <input
      type="range"
      aria-label={label}
      className="slider"
      min={min}
      max={max}
      step={step}
      value={value}
      style={{ ['--fill' as string]: fill }}
      onChange={(e) => onChange(Number(e.target.value))}
      onPointerUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
      onKeyUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
    />
  )
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  const id = useId()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby={id}>
      <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[88dvh] w-full max-w-lg animate-slide-up flex-col rounded-t-4xl border border-white/8 bg-night-850 shadow-2xl sm:rounded-4xl">
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-white/15 sm:hidden" />
        <div className="flex items-center justify-between px-6 pt-4 pb-2">
          <h2 id={id} className="text-lg font-extrabold">
            {title}
          </h2>
          <IconButton label="Fechar" tone="plain" size="sm" onClick={onClose}>
            <X className="size-5" />
          </IconButton>
        </div>
        <div className="no-scrollbar flex-1 overflow-y-auto px-6 pb-4">{children}</div>
        {footer && <div className="border-t border-white/5 px-6 pt-3 pb-safe">{footer}</div>}
        {!footer && <div className="pb-safe" />}
      </div>
    </div>
  )
}

export function Pill({ tone = 'muted', children, pulse, className }: { tone?: 'mint' | 'coral' | 'moon' | 'muted' | 'sky' | 'lilac'; children: ReactNode; pulse?: boolean; className?: string }) {
  const dot = { mint: 'bg-mint', coral: 'bg-coral', moon: 'bg-moon', muted: 'bg-ink-faint', sky: 'bg-sky', lilac: 'bg-lilac' }[tone]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold', className ?? 'glass-dark text-white')}>
      <span className={cn('size-2 rounded-full', dot, pulse && 'animate-breathe')} />
      {children}
    </span>
  )
}

export function ScreenHeader({ title, onBack, right, subtitle }: { title: string; subtitle?: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <header className="pt-safe px-safe sticky top-0 z-20 flex items-center gap-3 bg-night-900/85 pb-3 backdrop-blur-xl">
      {onBack && (
        <IconButton label="Voltar" tone="plain" onClick={onBack}>
          <ChevronLeft className="size-6" />
        </IconButton>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-extrabold">{title}</h1>
        {subtitle && <p className="truncate text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {right}
    </header>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="mt-7 mb-2 px-1 text-xs font-extrabold tracking-[0.14em] text-ink-muted uppercase">{children}</h3>
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cn('animate-spin', className ?? 'size-6')} />
}
