import { useId } from 'react'

/** Lua crescente com estrelas — marca do Ninar. */
export function LogoMark({ className = 'size-10' }: { className?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe2a8" />
          <stop offset="1" stopColor="#f2b552" />
        </linearGradient>
        <mask id={`m${id}`}>
          <rect width="64" height="64" fill="white" />
          <circle cx="40" cy="24" r="17" fill="black" />
        </mask>
      </defs>
      <circle cx="30" cy="34" r="20" fill={`url(#g${id})`} mask={`url(#m${id})`} />
      <path d="M47 35l1.6 3.6 3.6 1.6-3.6 1.6L47 45.4l-1.6-3.6-3.6-1.6 3.6-1.6z" fill="#fff4dc" />
      <path d="M53 22l1 2.2 2.2 1-2.2 1-1 2.2-1-2.2-2.2-1 2.2-1z" fill="#fff4dc" opacity=".8" />
    </svg>
  )
}

export function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark className="size-9" />
      <span className="text-2xl font-black tracking-tight">Ninar</span>
    </div>
  )
}
