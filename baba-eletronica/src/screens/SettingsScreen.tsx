import {
  Bell,
  BellRing,
  KeyRound,
  Lock,
  LockOpen,
  Mic,
  MoonStar,
  Network,
  Plus,
  QrCode,
  RefreshCw,
  Server,
  ShieldCheck,
  Smartphone,
  Trash,
  Vibrate,
  Volume2,
  WifiOff,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { PinPad } from '@/components/PinPad'
import { Button, Card, ScreenHeader, SectionTitle, Segmented, SettingRow, Sheet, Slider, Toggle, cn } from '@/components/ui'
import { Alarm } from '@/lib/audio/alarm'
import { unlockAudio } from '@/lib/audio/context'
import { useHubInfo } from '@/lib/hooks'
import { back, go, resetNav } from '@/lib/nav'
import { notificationsSupported, requestNotifications } from '@/lib/notify'
import { settings, type AlarmTone, type Settings, type TurnServer } from '@/lib/settings'
import { useStore } from '@/lib/store'
import { toast } from '@/lib/toast'
import type { AlertLevel } from '@/lib/types'
import { forgetDevice, lockNow, rotateFamily, setPin, vault } from '@/lib/vault'

const testAlarm = new Alarm()

const LEVELS: { value: AlertLevel; label: string }[] = [
  { value: 'alarm', label: 'Alarme' },
  { value: 'notify', label: 'Aviso' },
  { value: 'log', label: 'Só registrar' },
]

export function SettingsScreen() {
  const s = useStore(settings)
  const v = useStore(vault)
  const info = useHubInfo()
  const [pinSheet, setPinSheet] = useState(false)
  const [danger, setDanger] = useState<'rotate' | 'forget' | null>(null)
  const set = (patch: Partial<Settings>) => settings.patch(patch)
  const setAlert = (k: keyof Settings['alerts'], level: AlertLevel) => set({ alerts: { ...s.alerts, [k]: level } })

  return (
    <div className="min-h-full">
      <ScreenHeader title="Configurações" onBack={back} />
      <div className="px-safe mx-auto max-w-lg pb-safe">
        <SectionTitle>Este aparelho</SectionTitle>
        <Card>
          <label className="block">
            <span className="flex items-center gap-2 text-sm font-bold text-ink-soft">
              <Smartphone className="size-4" /> Nome mostrado aos outros aparelhos
            </span>
            <input
              value={s.deviceName}
              maxLength={32}
              onChange={(e) => set({ deviceName: e.target.value })}
              className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-night-900 px-4 outline-none focus:border-moon"
            />
          </label>
        </Card>

        <SectionTitle>Segurança e privacidade</SectionTitle>
        <Card className="divide-y divide-white/5 py-1">
          <SettingRow icon={<ShieldCheck className="size-5" />} title={`Família ${v.keys?.fingerprint ?? ''}`} description="O mesmo código aparece em todos os seus aparelhos pareados." />
          <SettingRow icon={<QrCode className="size-5" />} title="Parear outro aparelho" description="Mostrar QR code da chave da família." onClick={() => go('pair')} />
          <SettingRow
            icon={v.pinProtected ? <Lock className="size-5" /> : <LockOpen className="size-5" />}
            title={v.pinProtected ? 'PIN ativado' : 'Bloqueio por PIN'}
            description={v.pinProtected ? 'A chave fica cifrada neste aparelho (PBKDF2 + AES-256).' : 'Exigir PIN para abrir o Ninar neste aparelho.'}
          >
            <Button size="sm" variant="secondary" onClick={() => setPinSheet(true)}>
              {v.pinProtected ? 'Alterar' : 'Ativar'}
            </Button>
          </SettingRow>
          {v.pinProtected && (
            <div className="flex gap-2 py-3">
              <Button size="sm" variant="secondary" onClick={lockNow} icon={<Lock className="size-4" />}>
                Bloquear agora
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await setPin(null)
                  toast('PIN removido.')
                }}
              >
                Remover PIN
              </Button>
            </div>
          )}
          <SettingRow icon={<RefreshCw className="size-5" />} title="Gerar nova chave" description="Desconecta todos os outros aparelhos. Use se o QR code vazou.">
            <Button size="sm" variant="danger" onClick={() => setDanger('rotate')}>
              Gerar
            </Button>
          </SettingRow>
          <SettingRow icon={<Trash className="size-5" />} title="Apagar dados deste aparelho" description="Remove a chave, as configurações ficam.">
            <Button size="sm" variant="danger" onClick={() => setDanger('forget')}>
              Apagar
            </Button>
          </SettingRow>
        </Card>

        <SectionTitle>Alertas (quando for monitor)</SectionTitle>
        <Card className="space-y-5">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="flex items-center gap-2 font-bold">
                <Volume2 className="size-4 text-moon" /> Volume do alarme
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await unlockAudio()
                  testAlarm.play('cry', s.alarmTone, s.alarmVolume)
                }}
                icon={<BellRing className="size-4" />}
              >
                Testar
              </Button>
            </div>
            <Slider label="Volume do alarme" value={s.alarmVolume} onChange={(alarmVolume) => set({ alarmVolume })} />
          </div>
          <div>
            <div className="mb-2 font-bold">Som do alarme</div>
            <Segmented<AlarmTone>
              value={s.alarmTone}
              onChange={(alarmTone) => {
                set({ alarmTone })
                void unlockAudio().then(() => testAlarm.play('cry', alarmTone, s.alarmVolume))
              }}
              options={[
                { value: 'chime', label: 'Sino' },
                { value: 'harp', label: 'Harpa' },
                { value: 'beep', label: 'Bipe' },
              ]}
            />
          </div>
          <div className="space-y-3">
            {(
              [
                ['cry', 'Choro'],
                ['motion', 'Movimento'],
                ['noise', 'Barulho alto'],
                ['lost', 'Conexão perdida'],
                ['battery', 'Bateria da câmera'],
              ] as [keyof Settings['alerts'], string][]
            ).map(([k, label]) => (
              <div key={k}>
                <div className="mb-1.5 text-sm font-bold text-ink-soft">{label}</div>
                <Segmented value={s.alerts[k]} options={LEVELS} onChange={(l) => setAlert(k, l)} />
              </div>
            ))}
          </div>
          <div className="divide-y divide-white/5">
            <SettingRow icon={<WifiOff className="size-5" />} title="Avisar queda de conexão após" />
            <Segmented
              value={s.lostAfterSec}
              onChange={(lostAfterSec) => set({ lostAfterSec })}
              options={[
                { value: 10, label: '10 s' },
                { value: 20, label: '20 s' },
                { value: 60, label: '1 min' },
              ]}
            />
            <SettingRow icon={<Vibrate className="size-5" />} title="Vibrar" description="Android. O iPhone não permite vibração pela web.">
              <Toggle checked={s.vibrate} onChange={(vibrate) => set({ vibrate })} label="Vibrar" />
            </SettingRow>
            {notificationsSupported() && (
              <SettingRow icon={<Bell className="size-5" />} title="Notificações do sistema" description="Alertas mesmo com o Ninar em segundo plano (Android).">
                <Toggle
                  checked={s.notifications}
                  onChange={async (on) => {
                    if (on && !(await requestNotifications())) {
                      toast('Permissão de notificação negada nas configurações do navegador.', 'error')
                      return
                    }
                    set({ notifications: on })
                  }}
                  label="Notificações"
                />
              </SettingRow>
            )}
            <SettingRow icon={<Mic className="size-5" />} title="Preparar microfone ao monitorar" description="Melhora a conexão na mesma rede Wi-Fi e agiliza o “falar”.">
              <Toggle checked={s.askMicOnMonitor} onChange={(askMicOnMonitor) => set({ askMicOnMonitor })} label="Preparar microfone" />
            </SettingRow>
          </div>
        </Card>

        <SectionTitle>Câmera</SectionTitle>
        <Card className="divide-y divide-white/5 py-1">
          <SettingRow icon={<MoonStar className="size-5" />} title="Escurecer a tela sozinha" description="Após 30 s sem toque, a câmera fica com a tela preta.">
            <Toggle checked={s.autoDim} onChange={(autoDim) => set({ autoDim })} label="Escurecer a tela" />
          </SettingRow>
        </Card>

        <SectionTitle>Rede</SectionTitle>
        <NetworkCard info={info} />

        <SectionTitle>Sobre</SectionTitle>
        <Card className="space-y-2 text-sm text-ink-muted">
          <p>
            <b className="text-ink">Ninar</b> · versão {__APP_BUILD__}
          </p>
          <p>
            Vídeo e áudio trafegam direto entre seus aparelhos (WebRTC, DTLS-SRTP). A sinalização passa por relés públicos apenas como texto
            cifrado com AES-256-GCM, usando uma chave que só existe nos seus aparelhos. Nada é gravado em servidores.
          </p>
          <p>Ferramenta de apoio — não substitui a supervisão de um adulto e não é um dispositivo médico.</p>
        </Card>
      </div>

      <PinSheet open={pinSheet} onClose={() => setPinSheet(false)} />
      <Sheet open={danger !== null} onClose={() => setDanger(null)} title={danger === 'rotate' ? 'Gerar nova chave?' : 'Apagar dados?'}>
        <p className="text-sm text-ink-soft">
          {danger === 'rotate'
            ? 'Todos os outros aparelhos perdem o acesso imediatamente. Depois, pareie-os de novo com o novo QR code.'
            : 'Este aparelho deixa de fazer parte da família. Você poderá pareá-lo novamente depois.'}
        </p>
        {danger === 'rotate' && v.pinProtected && <p className="mt-2 text-sm text-coral">Remova o PIN antes de gerar uma nova chave.</p>}
        <div className="mt-5 flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={() => setDanger(null)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            disabled={danger === 'rotate' && v.pinProtected}
            onClick={async () => {
              if (danger === 'rotate') {
                await rotateFamily()
                setDanger(null)
                toast('Nova chave gerada. Pareie seus aparelhos novamente.', 'success')
                go('pair')
              } else {
                forgetDevice()
                resetNav()
              }
            }}
          >
            Confirmar
          </Button>
        </div>
      </Sheet>
    </div>
  )
}

function PinSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [first, setFirst] = useState<string | null>(null)
  const [error, setError] = useState(0)
  const close = () => {
    setFirst(null)
    onClose()
  }
  return (
    <Sheet open={open} onClose={close} title={first ? 'Confirme o novo PIN' : 'Novo PIN de 6 dígitos'}>
      <div className="py-4">
        <PinPad
          error={error}
          onComplete={async (pin) => {
            if (!first) return setFirst(pin)
            if (pin !== first) {
              setFirst(null)
              setError((n) => n + 1)
              toast('Os PINs não conferem.', 'error')
              return
            }
            await setPin(pin)
            toast('PIN ativado.', 'success')
            close()
          }}
        />
      </div>
    </Sheet>
  )
}

function NetworkCard({ info }: { info: ReturnType<typeof useHubInfo> }) {
  const s = useStore(settings)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<TurnServer>({ urls: '', username: '', credential: '' })
  const set = (patch: Partial<Settings>) => settings.patch(patch)
  return (
    <Card className="space-y-4">
      <div>
        <div className="flex items-center gap-2 font-bold">
          <Network className="size-4 text-moon" /> Relés de sinalização
        </div>
        <p className="mt-1 text-sm text-ink-muted">Só transportam mensagens cifradas para os aparelhos se encontrarem. Vários em paralelo = mais confiável.</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {info.relays
            .filter((r) => r.kind !== 'local')
            .map((r) => (
              <span key={r.id} className="inline-flex items-center gap-1.5 rounded-full bg-night-850 px-2.5 py-1 text-xs font-semibold text-ink-soft">
                <span className={cn('size-1.5 rounded-full', r.state === 'open' ? 'bg-mint' : r.state === 'connecting' ? 'animate-breathe bg-moon' : 'bg-coral')} />
                {r.label}
              </span>
            ))}
        </div>
      </div>
      <div className="divide-y divide-white/5">
        <SettingRow title="Brokers MQTT públicos" description="HiveMQ, EMQX, shiftr.io, Mosquitto">
          <Toggle checked={s.useMqtt} onChange={(useMqtt) => set({ useMqtt })} label="MQTT" />
        </SettingRow>
        <SettingRow title="Relés Nostr públicos" description="Damus, nos.lol, Primal (eventos efêmeros)">
          <Toggle checked={s.useNostr} onChange={(useNostr) => set({ useNostr })} label="Nostr" />
        </SettingRow>
      </div>
      <label className="block">
        <span className="text-sm font-bold text-ink-soft">Broker MQTT próprio (opcional)</span>
        <input
          value={s.customMqtt}
          onChange={(e) => set({ customMqtt: e.target.value })}
          placeholder="wss://usuario:senha@meu-broker:8884/mqtt"
          className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-night-900 px-3 font-mono text-sm outline-none focus:border-moon"
        />
      </label>

      <div className="border-t border-white/5 pt-4">
        <div className="flex items-center gap-2 font-bold">
          <Server className="size-4 text-moon" /> Servidores TURN
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          Opcional. Ajuda quando os aparelhos estão em redes que bloqueiam conexão direta (ex.: 4G com CGNAT). O conteúdo continua cifrado de ponta a
          ponta. Configure o mesmo servidor nos dois aparelhos.
        </p>
        <ul className="mt-3 space-y-2">
          {s.turnServers.map((t, i) => (
            <li key={i} className="flex items-center gap-2 rounded-xl bg-night-850 px-3 py-2">
              <KeyRound className="size-4 text-ink-muted" />
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{t.urls}</span>
              <button aria-label="Remover" onClick={() => set({ turnServers: s.turnServers.filter((_, j) => j !== i) })} className="text-ink-muted">
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
        {adding ? (
          <div className="mt-3 space-y-2">
            {(
              [
                ['urls', 'turn:turn.exemplo.com:3478'],
                ['username', 'usuário'],
                ['credential', 'senha'],
              ] as [keyof TurnServer, string][]
            ).map(([k, ph]) => (
              <input
                key={k}
                value={draft[k]}
                type={k === 'credential' ? 'password' : 'text'}
                placeholder={ph}
                onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                className="h-11 w-full rounded-xl border border-white/10 bg-night-900 px-3 font-mono text-sm outline-none focus:border-moon"
              />
            ))}
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                disabled={!/^turns?:/.test(draft.urls.trim())}
                onClick={() => {
                  set({ turnServers: [...s.turnServers, { ...draft, urls: draft.urls.trim() }] })
                  setDraft({ urls: '', username: '', credential: '' })
                  setAdding(false)
                }}
              >
                Salvar
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="secondary" className="mt-3" onClick={() => setAdding(true)} icon={<Plus className="size-4" />}>
            Adicionar TURN
          </Button>
        )}
        {s.turnServers.length > 0 && (
          <SettingRow title="Usar somente TURN" description="Esconde o IP de cada aparelho do outro (mais privacidade, um pouco mais de latência).">
            <Toggle checked={s.forceRelay} onChange={(forceRelay) => set({ forceRelay })} label="Somente TURN" />
          </SettingRow>
        )}
      </div>
    </Card>
  )
}
