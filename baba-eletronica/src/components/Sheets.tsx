import {
  AudioLines,
  AudioWaveform,
  Baby,
  BrainCircuit,
  CloudRain,
  EighthNotes,
  Fan,
  HeartPulse,
  LoaderCircle,
  Megaphone,
  Mountain,
  Move,
  Sparkles,
  Square,
  Star,
  Wand2,
  WavesHorizontal,
  Wind,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { SOUNDS, soundLabel, type SoundGroup } from '@/lib/audio/soundscapes'
import { useNow } from '@/lib/hooks'
import type { AiState, SoundState } from '@/lib/rtc/protocol'
import type { DetectionConfig, Sensitivity, SoundId } from '@/lib/types'
import { Button, Segmented, SettingRow, Sheet, Slider, Toggle, cn } from './ui'

export const SOUND_ICON: Record<SoundId, ReactNode> = {
  rain: <CloudRain className="size-6" />,
  ocean: <WavesHorizontal className="size-6" />,
  womb: <HeartPulse className="size-6" />,
  shush: <Wind className="size-6" />,
  white: <AudioWaveform className="size-6" />,
  pink: <AudioLines className="size-6" />,
  brown: <Mountain className="size-6" />,
  fan: <Fan className="size-6" />,
  brahms: <EighthNotes className="size-6" />,
  twinkle: <Star className="size-6" />,
  musicbox: <Sparkles className="size-6" />,
}

const GROUPS: { id: SoundGroup; label: string }[] = [
  { id: 'natureza', label: 'Natureza' },
  { id: 'utero', label: 'Aconchego' },
  { id: 'ruido', label: 'Ruídos' },
  { id: 'musica', label: 'Canções' },
]

const TIMERS: { value: number; label: string }[] = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 h' },
  { value: 0, label: 'Sempre' },
]

function remaining(endsAt: number, now: number) {
  const s = Math.max(0, Math.round((endsAt - now) / 1000))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export function SoundSheet({
  open,
  onClose,
  current,
  onPlay,
  onStop,
  onVolume,
  where,
}: {
  open: boolean
  onClose: () => void
  current: SoundState | null
  onPlay: (id: SoundId, volume: number, minutes: number | null) => void
  onStop: () => void
  onVolume: (v: number) => void
  where: string
}) {
  const [volume, setVolume] = useState(current?.volume ?? 0.55)
  const [timer, setTimer] = useState(30)
  const [pending, setPending] = useState<{ id: SoundId; at: number } | null>(null)
  const now = useNow(1000)
  useEffect(() => {
    if (current) setVolume(current.volume)
  }, [current?.volume, current])
  // Canções são sintetizadas na primeira vez (alguns segundos): mostra carregamento.
  const loadingId = pending && pending.id !== current?.id && now - pending.at < 20_000 ? pending.id : null

  return (
    <Sheet open={open} onClose={onClose} title="Sons para ninar">
      <p className="-mt-1 mb-4 text-sm text-ink-muted">{where}</p>
      {current && (
        <div className="mb-4 flex items-center gap-3 rounded-3xl bg-moon/12 p-3.5">
          <div className="flex size-12 animate-breathe items-center justify-center rounded-2xl bg-moon/20 text-moon">{SOUND_ICON[current.id]}</div>
          <div className="min-w-0 flex-1">
            <div className="font-extrabold">{soundLabel(current.id)}</div>
            <div className="text-xs text-ink-muted">
              {current.endsAt ? `Desliga suavemente em ${remaining(current.endsAt, now)}` : 'Tocando sem limite de tempo'}
            </div>
          </div>
          <Button size="sm" variant="danger" onClick={onStop} icon={<Square className="size-4" />}>
            Parar
          </Button>
        </div>
      )}

      {GROUPS.map((g) => (
        <div key={g.id} className="mb-4">
          <div className="mb-2 text-xs font-extrabold tracking-widest text-ink-muted uppercase">{g.label}</div>
          <div className="grid grid-cols-3 gap-2.5">
            {SOUNDS.filter((s) => s.group === g.id).map((s) => {
              const active = current?.id === s.id
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    setPending({ id: s.id, at: Date.now() })
                    onPlay(s.id, volume, timer || null)
                  }}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-center transition active:scale-95',
                    active ? 'border-moon bg-moon/15 text-moon' : 'border-white/6 bg-night-800 text-ink-soft',
                  )}
                >
                  {loadingId === s.id ? <LoaderCircle className="size-6 animate-spin text-moon" /> : SOUND_ICON[s.id]}
                  <span className="text-[13px] leading-tight font-bold text-ink">{s.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}

      <div className="mt-2 mb-1 text-xs font-extrabold tracking-widest text-ink-muted uppercase">Volume</div>
      <Slider label="Volume do som" value={volume} onChange={(v) => { setVolume(v); if (current) onVolume(v) }} />
      <div className="mt-3 mb-2 text-xs font-extrabold tracking-widest text-ink-muted uppercase">Timer</div>
      <Segmented value={timer} options={TIMERS} onChange={setTimer} />
      <p className="mt-2 text-xs text-ink-faint">Ao fim do timer o som diminui gradualmente por 45 s.</p>
    </Sheet>
  )
}

const SENS: { value: Sensitivity; label: string }[] = [
  { value: 1, label: 'Baixa' },
  { value: 2, label: 'Média' },
  { value: 3, label: 'Alta' },
]

const AI_TEXT: Record<AiState, string> = {
  off: 'Desligada',
  loading: 'Carregando modelo…',
  ready: 'Ativa no aparelho da câmera',
  error: 'Falhou ao carregar (sem internet?) — usando detecção acústica',
}

export function DetectionSheet({
  open,
  onClose,
  config,
  ai,
  aiLabel,
  onChange,
}: {
  open: boolean
  onClose: () => void
  config: DetectionConfig
  ai: AiState
  aiLabel?: string
  onChange: (patch: Partial<DetectionConfig>) => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Sensores e alertas">
      <div className="divide-y divide-white/5">
        <SettingRow icon={<Baby className="size-5" />} title="Detectar choro" description="Analisa o som em tempo real no aparelho da câmera.">
          <Toggle checked={config.cry} onChange={(cry) => onChange({ cry })} label="Detectar choro" />
        </SettingRow>
        {config.cry && (
          <div className="pb-4">
            <div className="mb-2 text-sm font-bold text-ink-soft">Sensibilidade do choro</div>
            <Segmented value={config.crySensitivity} options={SENS} onChange={(crySensitivity) => onChange({ crySensitivity })} />
          </div>
        )}
        <SettingRow
          icon={<BrainCircuit className="size-5" />}
          title="IA de reconhecimento de choro"
          description={
            <>
              Modelo YAMNet (Google) rodando localmente — o áudio nunca sai do aparelho. Baixa ~10 MB uma vez.
              <span className={cn('mt-1 block font-bold', ai === 'ready' ? 'text-mint' : ai === 'error' ? 'text-coral' : 'text-ink-soft')}>{AI_TEXT[ai]}</span>
              {ai === 'ready' && aiLabel && <span className="block text-ink-soft">Último som reconhecido: {aiLabel}</span>}
            </>
          }
        >
          <Toggle checked={config.ai} disabled={!config.cry} onChange={(v) => onChange({ ai: v })} label="IA de choro" />
        </SettingRow>
        <SettingRow icon={<Move className="size-5" />} title="Detectar movimento" description="Compara os quadros do vídeo para perceber o bebê se mexendo.">
          <Toggle checked={config.motion} onChange={(motion) => onChange({ motion })} label="Detectar movimento" />
        </SettingRow>
        {config.motion && (
          <div className="pb-4">
            <div className="mb-2 text-sm font-bold text-ink-soft">Sensibilidade do movimento</div>
            <Segmented value={config.motionSensitivity} options={SENS} onChange={(motionSensitivity) => onChange({ motionSensitivity })} />
          </div>
        )}
        <SettingRow icon={<Megaphone className="size-5" />} title="Barulho alto" description="Avisa sobre sons fortes que não sejam choro.">
          <Toggle checked={config.noise} onChange={(noise) => onChange({ noise })} label="Barulho alto" />
        </SettingRow>
        <SettingRow icon={<Wand2 className="size-5" />} title="Acalmar automaticamente" description="Ao detectar choro, toca um som no quarto do bebê.">
          <Toggle checked={config.autoSoothe} onChange={(autoSoothe) => onChange({ autoSoothe })} label="Acalmar automaticamente" />
        </SettingRow>
        {config.autoSoothe && (
          <div className="space-y-3 pb-4">
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
              {SOUNDS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onChange({ autoSootheSound: s.id })}
                  className={cn(
                    'flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm font-bold',
                    config.autoSootheSound === s.id ? 'border-moon bg-moon/15 text-moon' : 'border-white/8 text-ink-soft',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <Segmented
              value={config.autoSootheMinutes}
              options={[
                { value: 5, label: '5 min' },
                { value: 15, label: '15 min' },
                { value: 30, label: '30 min' },
              ]}
              onChange={(autoSootheMinutes) => onChange({ autoSootheMinutes })}
            />
          </div>
        )}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-faint">
        O Ninar ajuda, mas não substitui a supervisão de um adulto. Não é um dispositivo médico.
      </p>
    </Sheet>
  )
}
