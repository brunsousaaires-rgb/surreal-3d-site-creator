import { Baby, BatteryLow, ClipboardClock, Megaphone, Move, Trash, Wand2, Wifi, WifiOff } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button, Card, ScreenHeader, Segmented, cn } from '@/components/ui'
import { describeEvent } from '@/lib/alerts'
import { clearLog, eventLog, formatDuration, nightSummary } from '@/lib/events-log'
import { useNow } from '@/lib/hooks'
import { back } from '@/lib/nav'
import { useStore } from '@/lib/store'
import type { EventKind, MonitorEvent } from '@/lib/types'

const ICON: Record<EventKind, ReactNode> = {
  cry: <Baby className="size-5" />,
  'cry-end': <Baby className="size-5" />,
  motion: <Move className="size-5" />,
  noise: <Megaphone className="size-5" />,
  lost: <WifiOff className="size-5" />,
  restored: <Wifi className="size-5" />,
  battery: <BatteryLow className="size-5" />,
  soothe: <Wand2 className="size-5" />,
}

const TONE: Record<EventKind, string> = {
  cry: 'bg-coral/15 text-coral',
  'cry-end': 'bg-mint/15 text-mint',
  motion: 'bg-sky/15 text-sky',
  noise: 'bg-moon/15 text-moon',
  lost: 'bg-coral/15 text-coral',
  restored: 'bg-mint/15 text-mint',
  battery: 'bg-moon/15 text-moon',
  soothe: 'bg-lilac/15 text-lilac',
}

type Filter = 'all' | 'cry' | 'motion' | 'link'

function dayLabel(at: number) {
  const d = new Date(at)
  const today = new Date()
  const y = new Date()
  y.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Hoje'
  if (d.toDateString() === y.toDateString()) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
}

export function EventsScreen() {
  const { events } = useStore(eventLog)
  const [filter, setFilter] = useState<Filter>('all')
  const [confirm, setConfirm] = useState(false)
  useNow(30_000)
  const sum = nightSummary(events)

  const filtered = events.filter((e) =>
    filter === 'all'
      ? true
      : filter === 'cry'
        ? e.kind === 'cry' || e.kind === 'cry-end' || e.kind === 'soothe'
        : filter === 'motion'
          ? e.kind === 'motion' || e.kind === 'noise'
          : e.kind === 'lost' || e.kind === 'restored' || e.kind === 'battery',
  )
  const groups = new Map<string, MonitorEvent[]>()
  for (const e of filtered) {
    const k = dayLabel(e.at)
    groups.set(k, [...(groups.get(k) ?? []), e])
  }

  return (
    <div className="min-h-full">
      <ScreenHeader title="Histórico" subtitle="Registrado neste aparelho" onBack={back} />
      <div className="px-safe mx-auto max-w-lg pb-safe">
        <Card className="grid grid-cols-3 gap-2 text-center">
          <Stat value={String(sum.cries)} label="choros (12h)" tone="text-coral" />
          <Stat value={sum.cryTime ? formatDuration(sum.cryTime) : '0s'} label="chorando" tone="text-moon" />
          <Stat value={String(sum.motion)} label="movimentos" tone="text-sky" />
        </Card>

        <Segmented<Filter>
          className="mt-4"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Tudo' },
            { value: 'cry', label: 'Choro' },
            { value: 'motion', label: 'Movim.' },
            { value: 'link', label: 'Conexão' },
          ]}
        />

        {filtered.length === 0 ? (
          <div className="mt-16 flex flex-col items-center text-center text-ink-muted">
            <ClipboardClock className="size-10" />
            <p className="mt-3 max-w-xs text-sm">Nenhum evento ainda. Os alertas recebidos pelo monitor aparecem aqui.</p>
          </div>
        ) : (
          [...groups.entries()].map(([day, list]) => (
            <section key={day} className="mt-6">
              <h3 className="mb-2 px-1 text-xs font-extrabold tracking-widest text-ink-muted uppercase">{day}</h3>
              <ul className="space-y-2">
                {list.map((e) => (
                  <li key={e.id} className="glass flex items-center gap-3 rounded-2xl px-3.5 py-3">
                    <div className={cn('flex size-10 items-center justify-center rounded-xl', TONE[e.kind])}>{ICON[e.kind]}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold">{describeEvent(e.kind, e.duration)}</div>
                      <div className="truncate text-xs text-ink-muted">
                        {e.camera}
                        {e.detail ? ` · ${e.detail}` : ''}
                        {e.kind === 'battery' && e.score !== undefined ? ` · ${Math.round(e.score * 100)}%` : ''}
                      </div>
                    </div>
                    <time className="text-sm font-bold text-ink-soft tabular-nums">
                      {new Date(e.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </time>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}

        {events.length > 0 && (
          <div className="mt-8 flex justify-center">
            {confirm ? (
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    clearLog()
                    setConfirm(false)
                  }}
                >
                  Apagar tudo
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirm(true)} icon={<Trash className="size-4" />}>
                Limpar histórico
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ value, label, tone }: { value: string; label: string; tone: string }) {
  return (
    <div>
      <div className={cn('text-2xl font-black', tone)}>{value}</div>
      <div className="text-xs text-ink-muted">{label}</div>
    </div>
  )
}
