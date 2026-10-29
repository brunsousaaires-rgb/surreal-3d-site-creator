import {
  Aperture,
  Baby,
  BellOff,
  ChevronLeft,
  CircleDot,
  ClipboardClock,
  Expand,
  Flashlight,
  Gauge,
  Lock,
  Mic,
  MonitorOff,
  MonitorSmartphone,
  MoonStar,
  Move,
  RefreshCw,
  Router,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  SwitchCamera,
  TriangleAlert,
  Video,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BatteryBadge, LevelBars, Sparkline } from '@/components/Meters'
import { DetectionSheet, SoundSheet, SOUND_ICON } from '@/components/Sheets'
import { Button, IconButton, Pill, Segmented, Sheet, cn } from '@/components/ui'
import { ZoomPan } from '@/components/ZoomPan'
import { AlertCenter } from '@/lib/alerts'
import { unlockAudio } from '@/lib/audio/context'
import { soundLabel } from '@/lib/audio/soundscapes'
import { saveFile, stamp } from '@/lib/device'
import { useNow } from '@/lib/hooks'
import { back, go } from '@/lib/nav'
import { requestNotifications } from '@/lib/notify'
import { MonitorSession } from '@/lib/rtc/monitor-session'
import { settings } from '@/lib/settings'
import { useStore } from '@/lib/store'
import { toast } from '@/lib/toast'
import { QUALITY_PRESETS, type NightMode, type NightStyle, type Quality } from '@/lib/types'
import { canRecord, ClipRecorder, recordingStream, snapshot } from '@/lib/video/capture'
import { cssNightFilter, NightVision } from '@/lib/video/night-vision'

type SheetId = 'sounds' | 'night' | 'more' | 'sensors' | 'link' | null

export function MonitorScreen() {
  const { session, alerts } = useMemo(() => {
    const session = new MonitorSession()
    const alerts = new AlertCenter()
    session.onCameraEvent = (ev, cam) => alerts.handleCameraEvent(ev, cam)
    session.onLink = (k, cam) => alerts.handleLink(k, cam)
    session.onStatus = (st) => alerts.handleStatus(st)
    return { session, alerts }
  }, [])
  const s = useStore(session.state)
  const alert = useStore(alerts.state)
  const nightMode = useStore(settings, (x) => x.nightMode)
  const nightStyle = useStore(settings, (x) => x.nightStyle)
  const [started, setStarted] = useState(false)
  const [sheet, setSheet] = useState<SheetId>(null)
  const [chrome, setChrome] = useState(true)
  const [dark, setDark] = useState(false)
  const [needsTap, setNeedsTap] = useState(false)
  const [cover, setCover] = useState(false)
  const [recording, setRecording] = useState<number | null>(null)
  const [darkScene, setDarkScene] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nvRef = useRef<NightVision | null>(null)
  const recRef = useRef<ClipRecorder | null>(null)
  const now = useNow(1000)

  useEffect(() => {
    return () => {
      void recRef.current?.stop()
      nvRef.current?.stop()
      session.stop()
      alerts.dispose()
    }
  }, [session, alerts])

  const begin = async () => {
    // Tudo aqui roda dentro do toque: libera áudio e o elemento de vídeo no iOS.
    await unlockAudio()
    const v = videoRef.current
    if (v) {
      v.muted = false
      v.srcObject = new MediaStream()
      void v.play().catch(() => {})
    }
    if (settings.get().notifications) void requestNotifications()
    setStarted(true)
    void session.start()
  }

  // Liga o stream ao <video>.
  useEffect(() => {
    const v = videoRef.current
    if (!v || !s.stream) return
    if (v.srcObject !== s.stream) v.srcObject = s.stream
    v.muted = false
    v.play()
      .then(() => setNeedsTap(false))
      .catch(() => {
        // Sem permissão de autoplay com som: toca mudo e pede um toque.
        v.muted = true
        void v.play().catch(() => {})
        setNeedsTap(true)
      })
  }, [s.stream])

  // Durante a fala, silencia o áudio da câmera para evitar eco.
  useEffect(() => {
    const v = videoRef.current
    if (v && !needsTap) v.muted = s.talking
  }, [s.talking, needsTap])

  // Visão noturna: manual ou automática pela luminosidade medida na câmera.
  const luma = s.status?.luma ?? 0.5
  useEffect(() => {
    setDarkScene((d) => (d ? luma < 0.24 : luma < 0.15))
  }, [luma])
  const nightOn = nightMode === 'on' || (nightMode === 'auto' && darkScene)

  const [glOk, setGlOk] = useState(false)
  useEffect(() => {
    if (!canvasRef.current || nvRef.current) return
    nvRef.current = new NightVision(canvasRef.current)
    setGlOk(nvRef.current.supported)
  }, [])
  useEffect(() => {
    const nv = nvRef.current
    const v = videoRef.current
    if (!nv || !v) return
    nv.setStyle(nightStyle)
    if (nightOn && s.stream && nv.supported) nv.start(v)
    else nv.stop()
  }, [nightOn, nightStyle, s.stream])

  // Pede à câmera o modo pouca luz quando a visão noturna está ativa.
  const lowLightSent = useRef<boolean | null>(null)
  useEffect(() => {
    if (s.phase !== 'live') {
      lowLightSent.current = null
      return
    }
    if (lowLightSent.current === nightOn) return
    if (session.send({ t: 'lowlight', on: nightOn })) lowLightSent.current = nightOn
  }, [nightOn, s.phase, session, s.status])

  // Esconde os controles depois de um tempo sem toque.
  useEffect(() => {
    if (!chrome || sheet || s.phase !== 'live') return
    const t = setTimeout(() => setChrome(false), 6000)
    return () => clearTimeout(t)
  }, [chrome, sheet, s.phase])

  const unmute = async () => {
    await unlockAudio()
    const v = videoRef.current
    if (!v) return
    v.muted = false
    try {
      await v.play()
      setNeedsTap(false)
    } catch {
      toast('Toque novamente para ativar o som.', 'error')
    }
  }

  const takePhoto = async () => {
    const v = videoRef.current
    if (!v) return
    await snapshot(v, nightOn && glOk ? canvasRef.current : null)
    toast('Foto salva', 'success')
  }

  const toggleRecord = async () => {
    if (recRef.current?.recording) {
      const rec = recRef.current
      recRef.current = null
      setRecording(null)
      const blob = await rec.stop()
      if (blob) await saveFile(blob, `ninar_${stamp()}.${ClipRecorder.extension(blob)}`)
      return
    }
    if (!s.stream) return
    const rec = new ClipRecorder()
    try {
      rec.start(recordingStream(s.stream, nightOn && glOk ? canvasRef.current : null))
      recRef.current = rec
      setRecording(Date.now())
    } catch {
      toast('Gravação não suportada neste navegador.', 'error')
    }
  }
  useEffect(() => {
    if (recording && now - recording > 10 * 60_000) void toggleRecord()
  })

  const talkDown = useCallback(async () => {
    await unlockAudio()
    const ok = await session.startTalk()
    if (!ok) toast(session.state.get().talkError ?? 'Não foi possível falar.', 'error')
  }, [session])
  const talkUp = useCallback(() => void session.stopTalk(), [session])

  const st = s.status
  const live = s.phase === 'live'
  const showVideo = started && !!s.stream && (live || s.phase === 'reconnecting')
  const cssFilter = nightOn && !glOk ? cssNightFilter(nightStyle, 0.42 / Math.max(luma, 0.02)) : undefined

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      {/* Vídeo */}
      <ZoomPan className={cn('absolute inset-0', !showVideo && 'invisible')} onTap={() => setChrome((c) => !c)}>
        <video
          ref={videoRef}
          playsInline
          autoPlay
          className={cn('absolute inset-0 h-full w-full', cover ? 'object-cover' : 'object-contain')}
          style={cssFilter ? { filter: cssFilter } : undefined}
        />
        <canvas
          ref={canvasRef}
          className={cn('absolute inset-0 h-full w-full', cover ? 'object-cover' : 'object-contain', !(nightOn && glOk) && 'hidden')}
        />
      </ZoomPan>

      {!started && <StartPanel onStart={begin} />}
      {started && !showVideo && <ConnectPanel session={session} />}

      {/* Barra superior */}
      {showVideo && (
        <div
          className={cn(
            'pt-safe px-safe absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/75 to-transparent pb-12 transition-opacity duration-300',
            chrome || !live ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        >
          <div className="flex items-center gap-2">
            <IconButton label="Voltar" tone="dark" onClick={back}>
              <ChevronLeft className="size-6" />
            </IconButton>
            <div className="min-w-0 flex-1">
              <div className="truncate font-extrabold text-white">{s.target?.name ?? 'Câmera'}</div>
              <div className="flex items-center gap-2 text-xs text-white/70">
                {live ? (
                  <>
                    <span className="inline-flex items-center gap-1 font-bold text-mint">
                      <span className="size-1.5 animate-breathe rounded-full bg-mint" />
                      Ao vivo
                    </span>
                    {s.stats.rtt !== null && <span>{s.stats.rtt} ms</span>}
                    {s.stats.path && <span>{s.stats.path === 'local' ? 'Wi-Fi local' : s.stats.path === 'relay' ? 'via TURN' : 'Internet'}</span>}
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1 font-bold text-moon">
                    <RefreshCw className="size-3 animate-spin" /> Reconectando…
                  </span>
                )}
              </div>
            </div>
            {st && <BatteryBadge level={st.battery} charging={st.charging} />}
            <button onClick={() => setSheet('link')} className="glass-dark inline-flex h-9 items-center gap-1 rounded-full px-3 text-xs font-bold text-white">
              <Lock className="size-3.5 text-mint" /> E2E
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {nightOn && <Pill tone="mint">Visão noturna{nightMode === 'auto' ? ' (auto)' : ''}</Pill>}
            {st?.sound && (
              <button onClick={() => setSheet('sounds')}>
                <Pill tone="moon">{soundLabel(st.sound.id)}</Pill>
              </button>
            )}
            {recording && (
              <Pill tone="coral" pulse>
                REC {Math.floor((now - recording) / 60000)}:{String(Math.floor(((now - recording) / 1000) % 60)).padStart(2, '0')}
              </Pill>
            )}
            {alert.snoozeUntil > now && (
              <button onClick={() => alerts.unsnooze()}>
                <Pill tone="muted">Alarmes silenciados · {Math.ceil((alert.snoozeUntil - now) / 60000)} min</Pill>
              </button>
            )}
            {st && !st.wakeLock && <Pill tone="moon">Tela da câmera pode bloquear</Pill>}
          </div>
        </div>
      )}

      {/* Alertas */}
      {alert.active && (
        <div className="px-safe absolute inset-x-0 top-[calc(env(safe-area-inset-top)+5.5rem)] z-30 flex justify-center">
          <div
            className={cn(
              'w-full max-w-md animate-slide-up rounded-3xl p-4 shadow-2xl',
              alert.active.level === 'alarm' ? 'bg-coral text-white' : 'glass text-ink',
            )}
          >
            <div className="flex items-center gap-3">
              <div className={cn('flex size-11 items-center justify-center rounded-2xl', alert.active.level === 'alarm' ? 'animate-pulse-ring bg-white/20' : 'bg-moon/15 text-moon')}>
                {alert.active.kind === 'cry' ? <Baby className="size-6" /> : alert.active.kind === 'lost' ? <WifiOff className="size-6" /> : alert.active.kind === 'motion' ? <Move className="size-6" /> : <TriangleAlert className="size-6" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-lg font-black">{alert.active.title}</div>
                <div className="text-sm opacity-85">{alert.active.body}</div>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" className="flex-1 !bg-white !text-night-950 !shadow-none" onClick={() => alerts.acknowledge()}>
                OK, estou vendo
              </Button>
              {alert.active.level === 'alarm' && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="!bg-black/20 !text-white"
                  onClick={() => {
                    alerts.snooze(10)
                    alerts.acknowledge()
                  }}
                  icon={<BellOff className="size-4" />}
                >
                  10 min
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {needsTap && showVideo && (
        <button onClick={unmute} className="absolute top-1/2 left-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 rounded-3xl bg-black/60 px-6 py-5 font-bold text-white backdrop-blur">
          <VolumeX className="size-9" />
          Toque para ativar o som
        </button>
      )}

      {/* Painel inferior */}
      {showVideo && (
        <div
          className={cn(
            'px-safe pb-safe absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-14 transition-opacity duration-300',
            chrome || !live ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        >
          <div className="mx-auto max-w-lg">
            <div className="mb-4 flex items-center gap-3">
              <LevelBars level={s.level} bars={14} tone={st?.crying ? 'coral' : 'moon'} />
              <Sparkline values={s.history} className="flex-1 opacity-80" />
              <div className="w-20 text-right text-xs leading-tight font-bold text-white/80">
                {st?.crying ? <span className="text-coral">Chorando</span> : s.cry > 0.4 ? 'Possível choro' : s.level > 0.35 ? 'Som' : 'Silêncio'}
                {s.motion > 0.3 && <div className="text-sky">movimento</div>}
              </div>
            </div>
            <div className="flex items-end justify-between">
              <IconButton showLabel label="Noturna" tone="dark" active={nightOn} onClick={() => setSheet('night')}>
                <MoonStar className="size-5" />
              </IconButton>
              <IconButton showLabel label="Sons" tone="dark" active={!!st?.sound} onClick={() => setSheet('sounds')}>
                <span className="[&>svg]:size-5">{SOUND_ICON[st?.sound?.id ?? 'musicbox']}</span>
              </IconButton>
              <div className="flex flex-col items-center gap-1.5">
                <button
                  aria-label="Segure para falar"
                  onPointerDown={(e) => {
                    e.preventDefault()
                    void talkDown()
                  }}
                  onPointerUp={talkUp}
                  onPointerLeave={talkUp}
                  onPointerCancel={talkUp}
                  onContextMenu={(e) => e.preventDefault()}
                  disabled={!live}
                  style={{ touchAction: 'none' }}
                  className={cn(
                    'flex size-[4.5rem] items-center justify-center rounded-full transition-all select-none disabled:opacity-40',
                    s.talking ? 'scale-110 animate-pulse-ring bg-lilac text-night-950' : 'bg-white text-night-950',
                  )}
                >
                  <Mic className="size-7" />
                </button>
                <span className="text-[11px] font-semibold text-white/80">{s.talking ? 'Falando…' : 'Segure p/ falar'}</span>
              </div>
              <IconButton showLabel label="Foto" tone="dark" onClick={() => void takePhoto()}>
                <Aperture className="size-5" />
              </IconButton>
              <IconButton showLabel label="Mais" tone="dark" onClick={() => setSheet('more')}>
                <SlidersHorizontal className="size-5" />
              </IconButton>
            </div>
          </div>
        </div>
      )}

      {/* Modo tela escura: só som e alertas */}
      {dark && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black" onClick={() => setDark(false)}>
          <div className="text-6xl font-black text-white/20 tabular-nums">
            {new Date(now).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <LevelBars level={s.level} bars={16} className="mt-8 h-10 opacity-60" tone={st?.crying ? 'coral' : 'moon'} />
          <div className="mt-4 text-sm font-semibold text-white/30">
            {live ? (st?.crying ? 'Choro detectado' : 'Ouvindo o quarto do bebê') : 'Reconectando…'}
          </div>
          <div className="absolute bottom-12 text-xs text-white/20">Toque para voltar ao vídeo</div>
        </div>
      )}

      {/* Folhas */}
      <SoundSheet
        open={sheet === 'sounds'}
        onClose={() => setSheet(null)}
        current={st?.sound ?? null}
        where={`Toca no aparelho da câmera (${s.target?.name ?? 'quarto do bebê'}).`}
        onPlay={(id, volume, minutes) => session.send({ t: 'sound', id, volume, minutes })}
        onStop={() => session.send({ t: 'soundStop' })}
        onVolume={(volume) => session.send({ t: 'soundVolume', volume })}
      />
      {st && (
        <DetectionSheet
          open={sheet === 'sensors'}
          onClose={() => setSheet(null)}
          config={st.config}
          ai={st.ai}
          aiLabel={st.aiLabel}
          onChange={(patch) => session.send({ t: 'config', patch })}
        />
      )}
      <NightSheet open={sheet === 'night'} onClose={() => setSheet(null)} mode={nightMode} style={nightStyle} active={nightOn} luma={luma} lowLight={!!st?.lowLight} />
      <Sheet open={sheet === 'more'} onClose={() => setSheet(null)} title="Controles da câmera">
        <div className="grid grid-cols-4 gap-3">
          <Action icon={<SwitchCamera className="size-6" />} label="Virar câmera" disabled={!st?.canFlip} onClick={() => session.send({ t: 'flip' })} />
          <Action
            icon={<Flashlight className="size-6" />}
            label={st?.torch ? 'Desligar luz' : 'Lanterna'}
            active={st?.torch}
            disabled={!st?.torchAvailable}
            onClick={() => session.send({ t: 'torch', on: !st?.torch })}
          />
          {canRecord() && (
            <Action
              icon={recording ? <Square className="size-6" /> : <CircleDot className="size-6" />}
              label={recording ? 'Parar gravação' : 'Gravar clipe'}
              active={!!recording}
              onClick={() => {
                void toggleRecord()
                setSheet(null)
              }}
            />
          )}
          <Action icon={<Expand className="size-6" />} label={cover ? 'Ajustar' : 'Preencher'} onClick={() => setCover((c) => !c)} />
          <Action icon={<SlidersHorizontal className="size-6" />} label="Sensores" onClick={() => setSheet('sensors')} />
          <Action
            icon={<MonitorOff className="size-6" />}
            label="Tela escura"
            onClick={() => {
              setSheet(null)
              setDark(true)
            }}
          />
          <Action icon={<ClipboardClock className="size-6" />} label="Histórico" onClick={() => go('events')} />
          <Action icon={<ShieldCheck className="size-6" />} label="Conexão" onClick={() => setSheet('link')} />
        </div>
        {st && (
          <>
            <div className="mt-6 mb-2 text-xs font-extrabold tracking-widest text-ink-muted uppercase">Qualidade do vídeo</div>
            <Segmented<Quality>
              value={st.quality}
              onChange={(q) => session.send({ t: 'quality', q })}
              options={(['low', 'medium', 'high'] as Quality[]).map((q) => ({ value: q, label: QUALITY_PRESETS[q].label.split(' · ')[1] }))}
            />
            <p className="mt-2 text-xs text-ink-faint">360p economiza bateria e dados; 1080p mostra mais detalhes.</p>
          </>
        )}
        {s.candidates.length > 1 && (
          <Button full variant="secondary" className="mt-5" onClick={() => session.forgetTarget()} icon={<Video className="size-4" />}>
            Trocar de câmera
          </Button>
        )}
      </Sheet>
      <LinkSheet open={sheet === 'link'} onClose={() => setSheet(null)} session={session} />
    </div>
  )
}

function Action({ icon, label, onClick, disabled, active }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex flex-col items-center gap-2 rounded-2xl px-1 py-3 text-center text-xs font-bold transition active:scale-95 disabled:opacity-35',
        active ? 'bg-moon text-night-950' : 'bg-night-800 text-ink-soft',
      )}
    >
      {icon}
      <span className="leading-tight">{label}</span>
    </button>
  )
}

function StartPanel({ onStart }: { onStart: () => void }) {
  return (
    <div className="sky absolute inset-0 z-20">
      <div className="pt-safe px-safe relative mx-auto flex h-full max-w-md flex-col pb-safe">
        <div className="flex items-center gap-2 py-1">
          <IconButton label="Voltar" tone="plain" onClick={back}>
            <ChevronLeft className="size-6" />
          </IconButton>
          <h1 className="text-xl font-extrabold">Monitor dos pais</h1>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="flex size-24 items-center justify-center rounded-[2rem] bg-gradient-to-br from-lilac/30 to-lilac/5 text-lilac">
            <MonitorSmartphone className="size-12" />
          </div>
          <h2 className="mt-5 text-2xl font-black">Pronto para monitorar</h2>
          <p className="mt-2 max-w-xs text-ink-muted">
            Deixe o volume alto e o Ninar aberto. Avisaremos com som e vibração quando o bebê chorar ou se a conexão cair.
          </p>
          <div className="mt-6 flex items-center gap-2 rounded-full bg-night-800/80 px-4 py-2 text-sm text-ink-soft">
            <Volume2 className="size-4 text-moon" /> Verifique se o volume não está no mínimo
          </div>
        </div>
        <Button full size="lg" onClick={onStart} icon={<Wifi className="size-5" />}>
          Conectar à câmera
        </Button>
      </div>
    </div>
  )
}

function ConnectPanel({ session }: { session: MonitorSession }) {
  const s = useStore(session.state)
  const searching = s.phase === 'searching'
  return (
    <div className="sky absolute inset-0 z-20">
      <div className="pt-safe px-safe relative mx-auto flex h-full max-w-md flex-col pb-safe">
        <div className="flex items-center gap-2 py-1">
          <IconButton label="Voltar" tone="plain" onClick={back}>
            <ChevronLeft className="size-6" />
          </IconButton>
          <h1 className="text-xl font-extrabold">Monitor dos pais</h1>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="relative flex size-28 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-lilac/15" />
            <span className="absolute inset-3 animate-breathe rounded-full bg-lilac/20" />
            <Router className="relative size-11 text-lilac" />
          </div>
          {s.phase === 'choose' ? (
            <>
              <h2 className="mt-6 text-2xl font-black">Escolha a câmera</h2>
              <div className="mt-5 w-full space-y-2">
                {s.candidates.map((c) => (
                  <button key={c.session} onClick={() => session.chooseCamera(c)} className="glass flex w-full items-center gap-3 rounded-2xl p-4 text-left">
                    <Video className="size-5 text-moon" />
                    <span className="flex-1 font-bold">{c.name}</span>
                    <span className="text-xs text-ink-muted">{c.platform}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <h2 className="mt-6 text-2xl font-black">{searching ? 'Procurando a câmera…' : `Conectando a ${s.target?.name ?? 'câmera'}…`}</h2>
              <p className="mt-2 max-w-xs text-sm text-ink-muted">
                {searching
                  ? 'No aparelho que ficará com o bebê, abra o Ninar e toque em “Câmera do bebê”.'
                  : 'Estabelecendo conexão direta e cifrada. Isso leva alguns segundos.'}
              </p>
            </>
          )}
        </div>
        {!searching && s.phase !== 'choose' && (
          <Button variant="ghost" onClick={() => session.reconnect()} icon={<RefreshCw className="size-4" />}>
            Tentar novamente
          </Button>
        )}
        {s.target && s.candidates.length > 1 && (
          <Button variant="ghost" onClick={() => session.forgetTarget()}>
            Escolher outra câmera
          </Button>
        )}
      </div>
    </div>
  )
}

function NightSheet({
  open,
  onClose,
  mode,
  style,
  active,
  luma,
  lowLight,
}: {
  open: boolean
  onClose: () => void
  mode: NightMode
  style: NightStyle
  active: boolean
  luma: number
  lowLight: boolean
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Visão noturna">
      <p className="-mt-1 mb-4 text-sm text-ink-muted">
        Realce digital com redução de ruído para enxergar no escuro. No modo automático liga sozinho quando o quarto escurece.
      </p>
      <Segmented<NightMode>
        value={mode}
        onChange={(nightMode) => settings.patch({ nightMode })}
        options={[
          { value: 'off', label: 'Desligada' },
          { value: 'auto', label: 'Automática' },
          { value: 'on', label: 'Sempre' },
        ]}
      />
      <div className="mt-5 mb-2 text-xs font-extrabold tracking-widest text-ink-muted uppercase">Estilo</div>
      <div className="grid grid-cols-3 gap-2.5">
        {(
          [
            ['green', 'Infravermelho', 'bg-gradient-to-br from-emerald-300 to-emerald-900'],
            ['mono', 'Preto e branco', 'bg-gradient-to-br from-zinc-200 to-zinc-800'],
            ['color', 'Cores realçadas', 'bg-gradient-to-br from-amber-200 via-rose-300 to-indigo-700'],
          ] as [NightStyle, string, string][]
        ).map(([v, label, swatch]) => (
          <button
            key={v}
            onClick={() => settings.patch({ nightStyle: v })}
            className={cn('rounded-2xl border p-2 text-xs font-bold', style === v ? 'border-moon text-moon' : 'border-white/8 text-ink-soft')}
          >
            <div className={cn('mb-2 h-14 rounded-xl', swatch)} />
            {label}
          </button>
        ))}
      </div>
      <div className="mt-5 space-y-2 rounded-2xl bg-night-800 p-4 text-sm">
        <Row label="Luminosidade do quarto" value={`${Math.round(luma * 100)}%`} />
        <Row label="Realce agora" value={active ? 'Ativo' : 'Desligado'} />
        <Row label="Exposição longa na câmera" value={lowLight ? 'Ativa' : 'Desligada'} />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-faint">
        Dica: celulares não têm infravermelho, então uma luz noturna bem fraca (âmbar) no quarto melhora muito a imagem sem acordar o bebê.
      </p>
    </Sheet>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-ink-muted">{label}</span>
      <span className="text-right font-bold text-ink">{value}</span>
    </div>
  )
}

function LinkSheet({ open, onClose, session }: { open: boolean; onClose: () => void; session: MonitorSession }) {
  const s = useStore(session.state)
  const st = s.stats
  const path = st.path === 'local' ? 'Direta pela rede local' : st.path === 'relay' ? 'Retransmitida (TURN, ainda cifrada)' : st.path === 'internet' ? 'Direta pela internet' : '—'
  return (
    <Sheet open={open} onClose={onClose} title="Conexão segura">
      {s.safety ? (
        <div className="rounded-3xl bg-night-800 p-5 text-center">
          <ShieldCheck className="mx-auto size-8 text-mint" />
          <div className="mt-2 text-xs font-bold tracking-widest text-ink-muted uppercase">Código de segurança</div>
          <div className="mt-2 text-3xl tracking-[0.2em]">{s.safety.emoji.join(' ')}</div>
          <div className="mt-2 font-mono text-ink-soft">{s.safety.digits}</div>
          <p className="mt-3 text-xs leading-relaxed text-ink-muted">
            Compare com a tela da câmera (toque em “E2E”). Se for igual, a conexão é de ponta a ponta e ninguém está no meio.
          </p>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">Conectando…</p>
      )}
      <div className="mt-4 space-y-2.5 rounded-2xl bg-night-800 p-4 text-sm">
        <Row label="Caminho" value={path} />
        <Row label="Latência" value={st.rtt !== null ? `${st.rtt} ms` : '—'} />
        <Row label="Vídeo" value={st.width ? `${st.width}×${st.height} · ${st.fps ?? '—'} fps` : '—'} />
        <Row label="Taxa" value={st.bitrate ? `${(st.bitrate / 1_000_000).toFixed(2)} Mbps` : '—'} />
        <Row label="Codec" value={st.codec ?? '—'} />
        <Row label="Mídia" value="DTLS-SRTP (AES)" />
        <Row label="Sinalização" value="AES-256-GCM + HKDF" />
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs text-ink-faint">
        <Gauge className="size-4" /> Câmera ligada há {Math.round((s.status?.uptime ?? 0) / 60)} min
      </div>
    </Sheet>
  )
}
