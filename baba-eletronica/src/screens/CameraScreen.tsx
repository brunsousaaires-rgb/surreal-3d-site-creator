import {
  Baby,
  ChevronLeft,
  Flashlight,
  FlashlightOff,
  Lock,
  Mic,
  MonitorSmartphone,
  MoonStar,
  Power,
  SlidersHorizontal,
  SwitchCamera,
  TriangleAlert,
  Video,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BatteryBadge, LevelBars } from '@/components/Meters'
import { DetectionSheet, SoundSheet, SOUND_ICON } from '@/components/Sheets'
import { Button, IconButton, Pill, Segmented, Sheet, cn } from '@/components/ui'
import { soundLabel } from '@/lib/audio/soundscapes'
import { isIOS } from '@/lib/device'
import { back } from '@/lib/nav'
import { CameraSession } from '@/lib/rtc/camera-session'
import { settings } from '@/lib/settings'
import { useStore } from '@/lib/store'
import type { Facing } from '@/lib/types'

export function CameraScreen() {
  const session = useMemo(() => new CameraSession(), [])
  const s = useStore(session.state)
  const cfg = useStore(settings, (x) => x.detection)
  const autoDim = useStore(settings, (x) => x.autoDim)
  const [facing, setFacing] = useState<Facing>('environment')
  const [dim, setDim] = useState(false)
  const [sheet, setSheet] = useState<'sounds' | 'sensors' | 'monitors' | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => session.stop(), [session])

  useEffect(() => {
    const v = videoRef.current
    if (v && s.stream && v.srcObject !== s.stream) {
      v.srcObject = s.stream
      void v.play().catch(() => {})
    }
  }, [s.stream, dim])

  // Escurece a tela sozinho para não iluminar o quarto.
  const poke = () => {
    setDim(false)
    clearTimeout(idleTimer.current)
    if (autoDim && !sheet) idleTimer.current = setTimeout(() => setDim(true), 30_000)
  }
  useEffect(() => {
    if (s.phase === 'live') poke()
    return () => clearTimeout(idleTimer.current)
  }, [s.phase, autoDim, sheet])

  const leave = () => {
    session.stop()
    back()
  }

  if (s.phase === 'idle' || s.phase === 'starting' || s.phase === 'error') {
    return (
      <div className="sky min-h-full">
        <div className="pt-safe px-safe relative mx-auto flex min-h-dvh max-w-md flex-col pb-safe">
          <div className="flex items-center gap-2 py-1">
            <IconButton label="Voltar" tone="plain" onClick={back}>
              <ChevronLeft className="size-6" />
            </IconButton>
            <h1 className="text-xl font-extrabold">Câmera do bebê</h1>
          </div>
          <div className="mt-6 flex flex-col items-center text-center">
            <div className="flex size-24 items-center justify-center rounded-[2rem] bg-gradient-to-br from-moon/30 to-moon/5 text-moon">
              <Baby className="size-12" />
            </div>
            <h2 className="mt-5 text-2xl font-black">Prepare o aparelho</h2>
          </div>
          <ul className="mt-6 space-y-3 text-[15px] text-ink-soft">
            <Tip n={1}>Ligue o celular no carregador — ele vai transmitir a noite toda.</Tip>
            <Tip n={2}>Posicione a pelo menos 1 metro do berço, fora do alcance do bebê.</Tip>
            <Tip n={3}>Deixe o Ninar aberto nesta tela. A tela escurece sozinha para não iluminar o quarto.</Tip>
          </ul>
          <div className="mt-6">
            <div className="mb-2 text-sm font-bold text-ink-soft">Qual câmera usar?</div>
            <Segmented
              value={facing}
              onChange={setFacing}
              options={[
                { value: 'environment', label: 'Traseira (melhor)' },
                { value: 'user', label: 'Frontal' },
              ]}
            />
          </div>
          {s.error && (
            <div className="mt-5 flex gap-3 rounded-2xl bg-coral/10 p-4 text-sm text-coral">
              <TriangleAlert className="size-5 shrink-0" />
              {s.error}
            </div>
          )}
          <div className="mt-auto pt-8">
            <Button full size="lg" loading={s.phase === 'starting'} onClick={() => void session.start(facing)} icon={<Video className="size-5" />}>
              Iniciar câmera
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const watching = s.monitors.filter((m) => m.state === 'connected').length
  const talkingNames = s.monitors.filter((m) => m.talking).map((m) => m.name)

  return (
    <div className="fixed inset-0 bg-black" onPointerDown={poke}>
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        className={cn('absolute inset-0 h-full w-full object-cover', s.facing === 'user' && '-scale-x-100')}
      />

      {/* Topo */}
      <div className="pt-safe px-safe absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent pb-10">
        <IconButton label="Encerrar câmera" tone="dark" onClick={leave}>
          <Power className="size-5" />
        </IconButton>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Pill tone={watching ? 'mint' : 'moon'} pulse={!watching}>
            {watching ? `${watching} ${watching > 1 ? 'monitores' : 'monitor'} assistindo` : 'Aguardando monitor…'}
          </Pill>
          <button onClick={() => setSheet('monitors')} className="glass-dark inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold text-white">
            <Lock className="size-3.5 text-mint" /> E2E
          </button>
          <span className="glass-dark rounded-full px-2.5 py-1">
            <BatteryBadge level={s.battery} charging={s.charging} />
          </span>
        </div>
      </div>

      {/* Avisos */}
      <div className="absolute inset-x-0 top-28 flex flex-col items-center gap-2 px-4">
        {s.crying && (
          <div className="flex animate-slide-up items-center gap-2 rounded-full bg-coral px-4 py-2 font-extrabold text-white shadow-lg">
            <Baby className="size-5" /> Choro detectado — avisando os monitores
          </div>
        )}
        {talkingNames.length > 0 && (
          <div className="flex animate-slide-up items-center gap-2 rounded-full bg-lilac px-4 py-2 font-extrabold text-night-950 shadow-lg">
            <Mic className="size-5" /> {talkingNames.join(', ')} falando…
          </div>
        )}
        {!s.wakeLock && (
          <div className="glass-dark max-w-sm rounded-2xl px-4 py-2 text-center text-xs text-white/85">
            {isIOS
              ? 'Para a tela não bloquear: Ajustes → Tela e Brilho → Bloqueio Automático → Nunca.'
              : 'Mantenha esta tela aberta; desative o bloqueio automático se a tela apagar.'}
          </div>
        )}
        {(!s.videoOk || !s.audioOk) && (
          <div className="flex items-center gap-2 rounded-2xl bg-coral/90 px-4 py-2 text-sm font-bold text-white">
            <TriangleAlert className="size-4" />
            {!s.videoOk ? 'Câmera interrompida — tentando recuperar…' : 'Microfone interrompido — tentando recuperar…'}
          </div>
        )}
        {s.charging === false && (s.battery ?? 1) < 0.5 && (
          <div className="glass-dark rounded-full px-4 py-1.5 text-xs font-bold text-moon">Conecte o carregador</div>
        )}
      </div>

      {/* Base */}
      <div className="px-safe pb-safe absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent pt-16">
        <div className="mx-auto max-w-lg">
          <div className="mb-4 flex items-center gap-3">
            <LevelBars level={s.level} bars={16} tone={s.crying ? 'coral' : 'moon'} />
            <div className="text-xs font-semibold text-white/70">
              {s.crying ? 'Chorando' : s.level > 0.35 ? 'Som no ambiente' : 'Silêncio'}
              {s.motion > 0.3 && ' · movimento'}
            </div>
            {s.sound && (
              <button onClick={() => setSheet('sounds')} className="glass-dark ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-moon">
                <span className="[&>svg]:size-4">{SOUND_ICON[s.sound.id]}</span>
                {soundLabel(s.sound.id)}
              </button>
            )}
          </div>
          <div className="flex items-end justify-between gap-1">
            <IconButton showLabel label="Virar" tone="dark" disabled={!s.canFlip} onClick={() => void session.flip()}>
              <SwitchCamera className="size-5" />
            </IconButton>
            <IconButton showLabel label="Lanterna" tone="dark" active={s.torch} disabled={!s.torchAvailable} onClick={() => void session.setTorch(!s.torch)}>
              {s.torch ? <Flashlight className="size-5" /> : <FlashlightOff className="size-5" />}
            </IconButton>
            <IconButton showLabel label="Sons" tone="dark" active={!!s.sound} onClick={() => setSheet('sounds')}>
              <span className="[&>svg]:size-5">{SOUND_ICON[s.sound?.id ?? 'musicbox']}</span>
            </IconButton>
            <IconButton showLabel label="Sensores" tone="dark" onClick={() => setSheet('sensors')}>
              <SlidersHorizontal className="size-5" />
            </IconButton>
            <IconButton showLabel label="Escurecer" tone="dark" onClick={(e) => (e.stopPropagation(), setDim(true))}>
              <MoonStar className="size-5" />
            </IconButton>
          </div>
        </div>
      </div>

      {/* Tela escurecida: preto total, sem luz no quarto */}
      {dim && (
        <div
          className="absolute inset-0 z-40 flex flex-col items-center justify-end bg-black pb-16"
          onPointerDown={(e) => {
            e.stopPropagation()
            poke()
          }}
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-white/25">
            <span className={cn('size-1.5 rounded-full', watching ? 'bg-mint/50' : 'bg-moon/40')} />
            {watching ? `Transmitindo para ${watching}` : 'Aguardando monitor'} · toque para mostrar
          </div>
          <LevelBars level={s.level} bars={10} className="mt-3 opacity-25" />
        </div>
      )}

      <SoundSheet
        open={sheet === 'sounds'}
        onClose={() => setSheet(null)}
        current={s.sound}
        where="Toca neste aparelho, perto do bebê."
        onPlay={(id, v, m) => void session.playSound(id, v, m)}
        onStop={() => session.stopSound()}
        onVolume={(v) => session.setSoundVolume(v)}
      />
      <DetectionSheet open={sheet === 'sensors'} onClose={() => setSheet(null)} config={cfg} ai={s.ai} aiLabel={s.aiLabel} onChange={(p) => session.updateConfig(p)} />
      <Sheet open={sheet === 'monitors'} onClose={() => setSheet(null)} title="Monitores conectados">
        {s.monitors.length === 0 ? (
          <p className="text-sm text-ink-muted">Nenhum monitor conectado. Abra o Ninar no outro aparelho e escolha “Monitor dos pais”.</p>
        ) : (
          <ul className="space-y-3">
            {s.monitors.map((m) => (
              <li key={m.session} className="rounded-2xl bg-night-800 p-4">
                <div className="flex items-center gap-3">
                  <MonitorSmartphone className="size-5 text-lilac" />
                  <div className="flex-1">
                    <div className="font-bold">{m.name}</div>
                    <div className="text-xs text-ink-muted">
                      {m.platform} · {m.state === 'connected' ? 'conectado' : m.state === 'connecting' || m.state === 'new' ? 'conectando…' : 'reconectando…'}
                    </div>
                  </div>
                </div>
                {m.safety && (
                  <div className="mt-3 rounded-xl bg-night-900 p-3 text-center">
                    <div className="text-[11px] font-bold tracking-widest text-ink-muted uppercase">Código de segurança</div>
                    <div className="mt-1 text-2xl tracking-widest">{m.safety.emoji.join(' ')}</div>
                    <div className="mt-1 font-mono text-sm text-ink-soft">{m.safety.digits}</div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs leading-relaxed text-ink-faint">
          Se o código for igual no monitor, a conexão é direta e cifrada de ponta a ponta — ninguém no meio.
        </p>
      </Sheet>
    </div>
  )
}

function Tip({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-moon/15 text-sm font-extrabold text-moon">{n}</span>
      <span>{children}</span>
    </li>
  )
}
