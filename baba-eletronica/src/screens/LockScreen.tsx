import { useEffect, useState } from 'react'
import { LogoMark } from '@/components/Logo'
import { PinPad } from '@/components/PinPad'
import { Button } from '@/components/ui'
import { failureDelay, forgetDevice, unlock } from '@/lib/vault'

export function LockScreen() {
  const [error, setError] = useState(0)
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState(failureDelay())
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    if (wait <= 0) return
    const t = setInterval(() => setWait(failureDelay()), 500)
    return () => clearInterval(t)
  }, [wait])

  return (
    <div className="sky min-h-full">
      <div className="pt-safe px-safe relative mx-auto flex min-h-dvh max-w-md flex-col items-center pb-safe text-center">
        <LogoMark className="mt-12 size-16" />
        <h1 className="mt-4 text-2xl font-extrabold">Ninar está bloqueado</h1>
        <p className="mt-1 mb-10 text-sm text-ink-muted">
          {wait > 0 ? `Muitas tentativas. Aguarde ${Math.ceil(wait / 1000)}s.` : busy ? 'Verificando…' : 'Digite seu PIN'}
        </p>
        <PinPad
          error={error}
          disabled={busy || wait > 0}
          onComplete={async (pin) => {
            setBusy(true)
            const r = await unlock(pin)
            setBusy(false)
            if (r !== 'ok') {
              setError((n) => n + 1)
              setWait(failureDelay())
            }
          }}
        />
        <div className="mt-auto pt-8">
          {confirmReset ? (
            <div className="space-y-3">
              <p className="text-sm text-ink-muted">Isso apaga a chave deste aparelho. Você precisará parear de novo.</p>
              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setConfirmReset(false)}>
                  Cancelar
                </Button>
                <Button variant="danger" onClick={forgetDevice}>
                  Apagar e parear de novo
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)}>
              Esqueci o PIN
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
