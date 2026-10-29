import { Check, Copy, Eye, EyeOff, Share2, ShieldAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { QrCode } from '@/components/Qr'
import { Button, Card, ScreenHeader } from '@/components/ui'
import { back } from '@/lib/nav'
import { useStore } from '@/lib/store'
import { toast } from '@/lib/toast'
import { currentSecret, pairingCode, pairingLink, vault } from '@/lib/vault'

export function PairScreen() {
  const { keys } = useStore(vault)
  const secret = currentSecret()
  const [revealed, setRevealed] = useState(true)
  const [showCode, setShowCode] = useState(false)
  const [copied, setCopied] = useState(false)
  const link = useMemo(() => (secret ? pairingLink(secret) : ''), [secret])
  const code = useMemo(() => (secret ? pairingCode(secret) : ''), [secret])

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast('Não foi possível copiar.', 'error')
    }
  }

  const share = async () => {
    try {
      await navigator.share({ title: 'Parear Ninar', text: 'Abra este link no outro aparelho para pareá-lo ao Ninar:', url: link })
    } catch {
      /* cancelado */
    }
  }

  if (!secret) return null
  return (
    <div className="min-h-full">
      <ScreenHeader title="Parear aparelho" subtitle={`Família ${keys?.fingerprint ?? ''}`} onBack={back} />
      <div className="px-safe mx-auto max-w-md pb-safe">
        <ol className="mt-2 space-y-2 text-sm text-ink-soft">
          <li>
            <b className="text-moon">1.</b> No outro celular, abra o Ninar e toque em <b>“Já tenho o Ninar em outro aparelho”</b>.
          </li>
          <li>
            <b className="text-moon">2.</b> Aponte a câmera dele para este código.
          </li>
        </ol>

        <div className="relative mx-auto mt-6 w-full max-w-[300px]">
          <div className={revealed ? '' : 'blur-xl'}>
            <QrCode value={link} className="w-full rounded-3xl shadow-[0_20px_60px_-20px_rgba(247,205,133,0.45)]" />
          </div>
          {!revealed && (
            <button onClick={() => setRevealed(true)} className="absolute inset-0 flex flex-col items-center justify-center gap-2 font-bold">
              <Eye className="size-8" /> Mostrar código
            </button>
          )}
        </div>

        <div className="mt-5 flex justify-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setRevealed((r) => !r)} icon={revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}>
            {revealed ? 'Ocultar' : 'Mostrar'}
          </Button>
          {'share' in navigator && (
            <Button size="sm" variant="secondary" onClick={share} icon={<Share2 className="size-4" />}>
              Enviar link
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => setShowCode((s) => !s)}>
            {showCode ? 'Esconder código' : 'Código'}
          </Button>
        </div>

        {showCode && (
          <Card className="mt-4">
            <div className="text-xs font-bold tracking-widest text-ink-muted uppercase">Código para digitar</div>
            <p className="mt-2 font-mono text-[15px] leading-relaxed tracking-wider break-all text-ink">{code}</p>
            <Button size="sm" variant="secondary" className="mt-3" onClick={() => copy(code)} icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}>
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
          </Card>
        )}

        <div className="mt-6 flex gap-3 rounded-2xl border border-moon/25 bg-moon/8 p-4 text-sm text-ink-soft">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-moon" />
          <p>
            Este código <b className="text-ink">é a chave da sua câmera</b>. Mostre apenas aos seus próprios aparelhos. Se ele vazar, gere uma
            nova chave em Configurações → Segurança.
          </p>
        </div>
        <Button full className="mt-6" onClick={back}>
          Pronto
        </Button>
      </div>
    </div>
  )
}
