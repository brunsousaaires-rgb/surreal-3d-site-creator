import { ArrowRight, Baby, Bell, KeyRound, Lock, MoonStar, QrCode, ShieldCheck, Smartphone } from 'lucide-react'
import { useCallback, useState, type ReactNode } from 'react'
import { LogoMark } from '@/components/Logo'
import { PinPad } from '@/components/PinPad'
import { QrScanner } from '@/components/Qr'
import { Button, Card, Toggle, cn } from '@/components/ui'
import { canUseMedia } from '@/lib/device'
import { nav } from '@/lib/nav'
import { settings } from '@/lib/settings'
import { toast } from '@/lib/toast'
import { createFamily, joinFamily, parsePairing } from '@/lib/vault'

type Step = 'welcome' | 'create' | 'join' | 'join-confirm'

export function Onboarding({ incoming }: { incoming?: Uint8Array | null }) {
  const [step, setStep] = useState<Step>(incoming ? 'join-confirm' : 'welcome')
  const [secret, setSecret] = useState<Uint8Array | null>(incoming ?? null)

  return (
    <div className="sky min-h-full">
      <div className="pt-safe px-safe relative mx-auto flex min-h-dvh max-w-md flex-col pb-safe">
        {step === 'welcome' && <Welcome onCreate={() => setStep('create')} onJoin={() => setStep('join')} />}
        {step === 'create' && <Setup mode="create" onBack={() => setStep('welcome')} />}
        {step === 'join' && (
          <Join
            onBack={() => setStep('welcome')}
            onSecret={(s) => {
              setSecret(s)
              setStep('join-confirm')
            }}
          />
        )}
        {step === 'join-confirm' && secret && <Setup mode="join" secret={secret} onBack={() => setStep('welcome')} />}
      </div>
    </div>
  )
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex gap-3.5">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-night-700/80 text-moon">{icon}</div>
      <div>
        <div className="font-bold">{title}</div>
        <div className="text-sm leading-snug text-ink-muted">{text}</div>
      </div>
    </div>
  )
}

function Welcome({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  return (
    <div className="flex flex-1 animate-fade-in flex-col">
      <div className="flex flex-col items-center pt-10 text-center">
        <div className="animate-float">
          <LogoMark className="size-24 drop-shadow-[0_10px_40px_rgba(247,205,133,0.35)]" />
        </div>
        <h1 className="mt-5 text-4xl font-black tracking-tight">Ninar</h1>
        <p className="mt-2 max-w-xs text-ink-soft">Sua babá eletrônica privada. Use dois celulares — um fica com o bebê, o outro com você.</p>
      </div>
      <div className="mt-10 space-y-5">
        <Feature icon={<ShieldCheck className="size-5" />} title="Criptografia de ponta a ponta" text="Vídeo e áudio vão direto de um aparelho ao outro. Nenhum servidor vê ou guarda nada." />
        <Feature icon={<Baby className="size-5" />} title="Detecção de choro e movimento" text="Alertas na hora, com IA opcional rodando no próprio celular." />
        <Feature icon={<MoonStar className="size-5" />} title="Visão noturna e sons de ninar" text="Realce digital no escuro, chuva, ruído branco, útero e canções." />
        <Feature icon={<Smartphone className="size-5" />} title="iPhone e Android, em qualquer papel" text="Qualquer aparelho pode ser a câmera ou o monitor." />
      </div>
      <div className="mt-auto space-y-3 pt-10">
        {!canUseMedia() && (
          <p className="rounded-2xl bg-coral/10 p-3 text-center text-sm text-coral">
            Abra o Ninar por HTTPS em um navegador moderno (Safari ou Chrome) para usar câmera e microfone.
          </p>
        )}
        <Button full size="lg" onClick={onCreate} icon={<ArrowRight className="size-5" />}>
          Configurar o primeiro aparelho
        </Button>
        <Button full size="lg" variant="secondary" onClick={onJoin} icon={<QrCode className="size-5" />}>
          Já tenho o Ninar em outro aparelho
        </Button>
      </div>
    </div>
  )
}

function Setup({ mode, secret, onBack }: { mode: 'create' | 'join'; secret?: Uint8Array; onBack: () => void }) {
  const [name, setName] = useState(settings.get().deviceName)
  const [usePin, setUsePin] = useState(false)
  const [pinStep, setPinStep] = useState<'off' | 'enter' | 'confirm'>('off')
  const [firstPin, setFirstPin] = useState('')
  const [pinError, setPinError] = useState(0)
  const [busy, setBusy] = useState(false)

  const finish = async (pin: string | null) => {
    setBusy(true)
    settings.patch({ deviceName: name.trim() || settings.get().deviceName })
    try {
      if (mode === 'create') {
        await createFamily(pin)
        // Em seguida, mostra o QR para parear o segundo aparelho.
        nav.set({ stack: ['home', 'pair'] })
        history.pushState({ ninar: 2 }, '')
      } else {
        await joinFamily(secret!, pin)
        toast('Aparelho pareado com sucesso!', 'success')
      }
    } catch (e) {
      toast((e as Error).message || 'Não foi possível concluir.', 'error')
      setBusy(false)
    }
  }

  if (pinStep !== 'off') {
    return (
      <div className="flex flex-1 animate-fade-in flex-col items-center pt-12 text-center">
        <Lock className="size-10 text-moon" />
        <h2 className="mt-4 text-2xl font-extrabold">{pinStep === 'enter' ? 'Crie um PIN de 6 dígitos' : 'Confirme o PIN'}</h2>
        <p className="mt-2 mb-10 max-w-xs text-sm text-ink-muted">
          O PIN cifra a chave da família neste aparelho. Sem ele, ninguém abre o Ninar aqui.
        </p>
        <PinPad
          error={pinError}
          disabled={busy}
          onComplete={(pin) => {
            if (pinStep === 'enter') {
              setFirstPin(pin)
              setPinStep('confirm')
            } else if (pin === firstPin) void finish(pin)
            else {
              setPinError((n) => n + 1)
              setPinStep('enter')
              toast('Os PINs não conferem. Tente de novo.', 'error')
            }
          }}
        />
        <Button variant="ghost" className="mt-8" onClick={() => setPinStep('off')}>
          Voltar
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-1 animate-fade-in flex-col pt-8">
      <div className="flex items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-moon/15 text-moon">
          {mode === 'create' ? <KeyRound className="size-6" /> : <QrCode className="size-6" />}
        </div>
        <div>
          <h2 className="text-2xl font-extrabold">{mode === 'create' ? 'Novo par de aparelhos' : 'Parear este aparelho'}</h2>
          <p className="text-sm text-ink-muted">{mode === 'create' ? 'Vamos criar sua chave secreta' : 'Chave recebida com segurança'}</p>
        </div>
      </div>

      <Card className="mt-8 space-y-5">
        <label className="block">
          <span className="text-sm font-bold text-ink-soft">Nome deste aparelho</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={32}
            placeholder="Ex.: iPhone da mamãe, Quarto do bebê"
            className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-night-900 px-4 text-ink outline-none focus:border-moon"
          />
        </label>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="font-bold">Proteger com PIN</div>
            <div className="text-sm text-ink-muted">Pede o PIN sempre que o app abrir.</div>
          </div>
          <Toggle checked={usePin} onChange={setUsePin} label="Proteger com PIN" />
        </div>
      </Card>

      <div className={cn('mt-6 flex gap-3 rounded-2xl bg-night-800/70 p-4 text-sm text-ink-soft')}>
        <Bell className="mt-0.5 size-5 shrink-0 text-sky" />
        <p>
          {mode === 'create'
            ? 'Uma chave de 256 bits será gerada aqui mesmo. Ela só sai deste aparelho pelo QR code que você vai mostrar ao outro celular.'
            : 'Este aparelho passa a fazer parte da sua família Ninar e poderá ser câmera ou monitor.'}
        </p>
      </div>

      <div className="mt-auto space-y-3 pt-8">
        <Button full size="lg" loading={busy} onClick={() => (usePin ? setPinStep('enter') : void finish(null))}>
          {mode === 'create' ? 'Criar chave e continuar' : 'Concluir pareamento'}
        </Button>
        <Button full variant="ghost" onClick={onBack} disabled={busy}>
          Voltar
        </Button>
      </div>
    </div>
  )
}

function Join({ onBack, onSecret }: { onBack: () => void; onSecret: (s: Uint8Array) => void }) {
  const [manual, setManual] = useState(false)
  const [code, setCode] = useState('')

  const handle = useCallback(
    (text: string) => {
      const s = parsePairing(text)
      if (s) onSecret(s)
      else toast('Código inválido. Confira e tente novamente.', 'error')
    },
    [onSecret],
  )

  return (
    <div className="flex flex-1 animate-fade-in flex-col pt-8">
      <h2 className="text-2xl font-extrabold">Escaneie o QR code</h2>
      <p className="mt-1 text-sm text-ink-muted">
        No aparelho já configurado, abra <b className="text-ink-soft">Parear aparelho</b> e aponte esta câmera para o código.
      </p>
      <div className="mt-6">
        {manual ? (
          <Card className="space-y-4">
            <label className="block">
              <span className="text-sm font-bold text-ink-soft">Código de pareamento</span>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                rows={4}
                placeholder="XXXX-XXXX-XXXX-…  ou o link de pareamento"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-night-900 p-4 font-mono text-sm tracking-wider text-ink outline-none focus:border-moon"
              />
            </label>
            <Button full onClick={() => handle(code)} disabled={code.trim().length < 20}>
              Parear
            </Button>
          </Card>
        ) : (
          <QrScanner onResult={handle} />
        )}
      </div>
      <div className="mt-auto space-y-3 pt-8">
        <Button full variant="secondary" onClick={() => setManual((m) => !m)}>
          {manual ? 'Usar a câmera' : 'Digitar código manualmente'}
        </Button>
        <Button full variant="ghost" onClick={onBack}>
          Voltar
        </Button>
      </div>
    </div>
  )
}
