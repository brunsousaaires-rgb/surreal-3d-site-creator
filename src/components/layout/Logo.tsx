import { cn } from '@/lib/utils'

function BallMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <circle cx="24" cy="24" r="22" className="fill-primary" />
      <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none" className="text-primary-foreground/90">
        <path d="M24 4c-7 6-7 34 0 40" />
        <path d="M24 4c7 6 7 34 0 40" />
        <path d="M5 16c9-3 29-3 38 0" />
        <path d="M5 32c9 3 29 3 38 0" />
      </g>
    </svg>
  )
}

export function Logo({ className, showTagline = true }: { className?: string; showTagline?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <BallMark className="h-10 w-10 shrink-0" />
      <div className="flex flex-col leading-none">
        <span className="text-[0.95rem] font-extrabold tracking-tight uppercase">
          Estância Imperial
        </span>
        <span className="text-[0.65rem] font-medium tracking-[0.3em] text-muted-foreground uppercase">
          {showTagline ? 'Sports' : ''}
        </span>
      </div>
    </div>
  )
}
