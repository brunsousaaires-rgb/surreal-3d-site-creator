import { useEffect, useState, type ReactNode } from 'react'
import { LogoMark } from './components/Logo'
import { Toaster } from './components/Toaster'
import { Button } from './components/ui'
import { nav } from './lib/nav'
import { useStore } from './lib/store'
import { toast } from './lib/toast'
import { joinFamily, parsePairing, sameSecret, vault } from './lib/vault'
import { CameraScreen } from './screens/CameraScreen'
import { EventsScreen } from './screens/EventsScreen'
import { HelpScreen } from './screens/HelpScreen'
import { Home } from './screens/Home'
import { LockScreen } from './screens/LockScreen'
import { MonitorScreen } from './screens/MonitorScreen'
import { Onboarding } from './screens/Onboarding'
import { PairScreen } from './screens/PairScreen'
import { SettingsScreen } from './screens/SettingsScreen'

/** Lê (e apaga da barra de endereço) uma chave de pareamento vinda por link. */
function takePairingFromUrl(): Uint8Array | null {
  if (!location.hash.includes('p=')) return null
  const secret = parsePairing(location.hash)
  history.replaceState(null, '', location.pathname + location.search)
  return secret
}

export function App() {
  const v = useStore(vault)
  const route = useStore(nav, (n) => n.stack[n.stack.length - 1])
  const [incoming, setIncoming] = useState<Uint8Array | null>(takePairingFromUrl)

  useEffect(() => {
    if (incoming && v.status === 'unlocked' && sameSecret(incoming)) {
      toast('Este aparelho já está pareado com essa família.', 'success')
      setIncoming(null)
    }
  }, [incoming, v.status])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route])

  let screen: ReactNode
  if (v.status === 'booting') screen = <Splash />
  else if (v.status === 'empty') screen = <Onboarding incoming={incoming} />
  else if (v.status === 'locked') screen = <LockScreen />
  else if (incoming && !sameSecret(incoming)) screen = <ReplaceFamily secret={incoming} onDone={() => setIncoming(null)} />
  else {
    screen = {
      home: <Home />,
      camera: <CameraScreen />,
      monitor: <MonitorScreen />,
      pair: <PairScreen />,
      settings: <SettingsScreen />,
      events: <EventsScreen />,
      help: <HelpScreen />,
    }[route]
  }

  return (
    <>
      {screen}
      <Toaster />
    </>
  )
}

function Splash() {
  return (
    <div className="sky flex h-full items-center justify-center">
      <LogoMark className="size-16 animate-breathe" />
    </div>
  )
}

function ReplaceFamily({ secret, onDone }: { secret: Uint8Array; onDone: () => void }) {
  const { keys, pinProtected } = useStore(vault)
  const [busy, setBusy] = useState(false)
  return (
    <div className="sky min-h-full">
      <div className="pt-safe px-safe relative mx-auto flex min-h-dvh max-w-md flex-col justify-center pb-safe text-center">
        <LogoMark className="mx-auto size-16" />
        <h1 className="mt-5 text-2xl font-black">Entrar em outra família?</h1>
        <p className="mt-2 text-ink-muted">
          Este aparelho já faz parte da família <b className="text-ink">{keys?.fingerprint}</b>. Ao continuar, ele deixa essa família e passa a usar a nova chave.
          {pinProtected && ' O PIN será removido — ative-o de novo nas configurações.'}
        </p>
        <div className="mt-8 space-y-3">
          <Button
            full
            size="lg"
            loading={busy}
            onClick={async () => {
              setBusy(true)
              await joinFamily(secret, null)
              toast('Aparelho pareado com a nova família.', 'success')
              onDone()
            }}
          >
            Usar a nova chave
          </Button>
          <Button full variant="ghost" onClick={onDone}>
            Manter a família atual
          </Button>
        </div>
      </div>
    </div>
  )
}
