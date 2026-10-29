import { Delete } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from './ui'

/** Teclado numérico para PIN (4 a 8 dígitos). */
export function PinPad({
  length = 6,
  onComplete,
  error,
  disabled,
}: {
  length?: number
  onComplete: (pin: string) => void
  /** Incrementar a cada erro para sacudir e limpar os dígitos. */
  error?: number
  disabled?: boolean
}) {
  const [pin, setPin] = useState('')
  const [shake, setShake] = useState(false)

  useEffect(() => {
    if (!error) return
    setShake(true)
    setPin('')
    const t = setTimeout(() => setShake(false), 450)
    return () => clearTimeout(t)
  }, [error])

  const press = (d: string) => {
    if (disabled) return
    const next = (pin + d).slice(0, length)
    setPin(next)
    if (next.length === length) {
      setTimeout(() => {
        onComplete(next)
        setPin('')
      }, 120)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="flex gap-3" style={shake ? { animation: 'shake 0.4s' } : undefined}>
        {Array.from({ length }, (_, i) => (
          <span
            key={i}
            className={cn(
              'size-3.5 rounded-full border-2 transition-all',
              i < pin.length ? 'scale-110 border-moon bg-moon' : 'border-ink-faint',
              shake && 'border-coral',
            )}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <Key key={d} onClick={() => press(d)} disabled={disabled}>
            {d}
          </Key>
        ))}
        <span />
        <Key onClick={() => press('0')} disabled={disabled}>
          0
        </Key>
        <button
          aria-label="Apagar"
          onClick={() => setPin((p) => p.slice(0, -1))}
          className="flex size-[4.5rem] items-center justify-center rounded-full text-ink-muted active:bg-white/5"
        >
          <Delete className="size-7" />
        </button>
      </div>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}`}</style>
    </div>
  )
}

function Key({ children, onClick, disabled }: { children: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="glass flex size-[4.5rem] items-center justify-center rounded-full text-2xl font-bold transition active:scale-90 active:bg-night-600 disabled:opacity-40"
    >
      {children}
    </button>
  )
}
