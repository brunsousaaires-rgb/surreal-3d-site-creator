import { cn } from '@/lib/utils'

export function Logo({ className, showTagline = true }: { className?: string; showTagline?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <img
        src="/brand/logo-mark-256.png"
        alt="Estância Imperial Sports"
        className="h-10 w-10 shrink-0 rounded-full drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)]"
        draggable={false}
      />
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
