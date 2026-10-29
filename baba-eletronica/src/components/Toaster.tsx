import { CircleAlert, CircleCheck, Info } from 'lucide-react'
import { toasts } from '@/lib/toast'
import { useStore } from '@/lib/store'
import { cn } from './ui'

export function Toaster() {
  const { items } = useStore(toasts)
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-safe">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            'glass flex max-w-md animate-slide-up items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-semibold shadow-xl',
            t.tone === 'error' && 'text-coral',
            t.tone === 'success' && 'text-mint',
          )}
        >
          {t.tone === 'error' ? <CircleAlert className="size-5 shrink-0" /> : t.tone === 'success' ? <CircleCheck className="size-5 shrink-0" /> : <Info className="size-5 shrink-0 text-sky" />}
          <span className="text-ink">{t.text}</span>
        </div>
      ))}
    </div>
  )
}
