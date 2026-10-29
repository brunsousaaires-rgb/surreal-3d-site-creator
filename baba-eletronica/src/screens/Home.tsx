import {
  Baby,
  ChevronRight,
  CircleQuestionMark,
  ClipboardClock,
  MonitorSmartphone,
  QrCode,
  Settings,
  ShieldCheck,
  Share,
  Video,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Wordmark } from '@/components/Logo'
import { Card, IconButton, Pill, cn } from '@/components/ui'
import { isIOS, isStandalone } from '@/lib/device'
import { timeAgo, useHubInfo, useNow } from '@/lib/hooks'
import { go } from '@/lib/nav'
import { directory } from '@/lib/signaling'
import { useStore } from '@/lib/store'
import { deviceId, vault } from '@/lib/vault'

export function Home() {
  const { keys } = useStore(vault)
  const info = useHubInfo()
  const { peers } = useStore(directory)
  const now = useNow(5000)
  const others = Object.values(peers)
    .filter((p) => p.device !== deviceId && now - p.lastSeen < 45_000)
    .reduce<typeof peers[string][]>((acc, p) => {
      const i = acc.findIndex((x) => x.device === p.device)
      if (i < 0) acc.push(p)
      else if (acc[i].lastSeen < p.lastSeen) acc[i] = p
      return acc
    }, [])

  const online = info.online > 0
  return (
    <div className="sky min-h-full">
      <div className="pt-safe px-safe relative mx-auto max-w-lg pb-safe">
        <header className="flex items-center justify-between py-2">
          <Wordmark />
          <IconButton label="Configurações" onClick={() => go('settings')}>
            <Settings className="size-5" />
          </IconButton>
        </header>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Pill tone={online ? 'mint' : 'coral'} pulse={!online} className="bg-night-800/80 text-ink-soft">
            {online ? `Rede segura · ${info.online} relés` : 'Conectando à rede segura…'}
          </Pill>
          <Pill tone="moon" className="bg-night-800/80 text-ink-soft">
            Família {keys?.fingerprint}
          </Pill>
        </div>

        <h2 className="mt-8 text-[1.7rem] leading-tight font-black">Como este aparelho será usado?</h2>
        <p className="mt-1 text-ink-muted">Você pode trocar a qualquer momento.</p>

        <div className="mt-5 grid gap-4">
          <RoleCard
            onClick={() => go('camera')}
            icon={<Baby className="size-8" />}
            accent="from-moon/30 to-moon/5 text-moon"
            title="Câmera do bebê"
            text="Deixe perto do berço, na tomada. Transmite vídeo, som e alertas."
          />
          <RoleCard
            onClick={() => go('monitor')}
            icon={<MonitorSmartphone className="size-8" />}
            accent="from-lilac/30 to-lilac/5 text-lilac"
            title="Monitor dos pais"
            text="Assista, ouça, fale com o bebê e receba alertas de choro."
          />
        </div>

        <Card className="mt-5">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold">Aparelhos da família</h3>
            <span className="text-xs font-semibold text-ink-muted">ao vivo</span>
          </div>
          {others.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">
              Nenhum outro aparelho online agora. Abra o Ninar no outro celular — ou{' '}
              <button className="font-bold text-moon underline-offset-2 hover:underline" onClick={() => go('pair')}>
                pareie um novo
              </button>
              .
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {others.map((p) => (
                <li key={p.device} className="flex items-center gap-3 rounded-2xl bg-night-850/80 px-3 py-2.5">
                  <div className={cn('flex size-9 items-center justify-center rounded-xl', p.role === 'camera' ? 'bg-moon/15 text-moon' : 'bg-lilac/15 text-lilac')}>
                    {p.role === 'camera' ? <Video className="size-5" /> : <MonitorSmartphone className="size-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{p.name}</div>
                    <div className="text-xs text-ink-muted">
                      {p.role === 'camera' ? 'Câmera ativa' : p.role === 'monitor' ? 'Monitorando' : 'Online'} · {p.platform} · {timeAgo(p.lastSeen, now)}
                    </div>
                  </div>
                  <span className="size-2.5 rounded-full bg-mint" />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <Shortcut icon={<QrCode className="size-6" />} label="Parear" onClick={() => go('pair')} />
          <Shortcut icon={<ClipboardClock className="size-6" />} label="Histórico" onClick={() => go('events')} />
          <Shortcut icon={<CircleQuestionMark className="size-6" />} label="Como usar" onClick={() => go('help')} />
        </div>

        {!isStandalone() && (
          <button
            onClick={() => go('help')}
            className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-dashed border-white/12 p-4 text-left text-sm text-ink-soft"
          >
            <Share className="size-5 shrink-0 text-sky" />
            <span>
              {isIOS
                ? 'Dica: toque em Compartilhar → “Adicionar à Tela de Início” para usar o Ninar como app.'
                : 'Dica: instale o Ninar como app pelo menu do navegador (“Instalar app”).'}
            </span>
          </button>
        )}

        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-ink-faint">
          <ShieldCheck className="size-4" />
          Ponta a ponta · AES-256-GCM · DTLS-SRTP · P2P
        </div>
      </div>
    </div>
  )
}

function RoleCard({ onClick, icon, title, text, accent }: { onClick: () => void; icon: ReactNode; title: string; text: string; accent: string }) {
  return (
    <button
      onClick={onClick}
      className="glass group flex items-center gap-4 rounded-4xl p-5 text-left transition active:scale-[0.98]"
    >
      <div className={cn('flex size-16 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br', accent)}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-lg font-extrabold">{title}</div>
        <div className="mt-0.5 text-sm leading-snug text-ink-muted">{text}</div>
      </div>
      <ChevronRight className="size-6 text-ink-faint transition group-hover:translate-x-0.5" />
    </button>
  )
}

function Shortcut({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="glass flex flex-col items-center gap-2 rounded-3xl py-4 text-sm font-bold text-ink-soft transition active:scale-95">
      <span className="text-moon">{icon}</span>
      {label}
    </button>
  )
}
