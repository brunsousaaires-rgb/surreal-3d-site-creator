import { Baby, BatteryCharging, Lightbulb, MonitorSmartphone, ShieldCheck, Smartphone, TriangleAlert, Wifi } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card, ScreenHeader, SectionTitle } from '@/components/ui'
import { isAndroid, isIOS } from '@/lib/device'
import { back } from '@/lib/nav'

export function HelpScreen() {
  return (
    <div className="min-h-full">
      <ScreenHeader title="Como usar" onBack={back} />
      <div className="px-safe mx-auto max-w-lg pb-safe text-[15px] leading-relaxed text-ink-soft">
        <SectionTitle>Em 3 passos</SectionTitle>
        <Card className="space-y-4">
          <Step icon={<Smartphone className="size-5" />} title="1. Pareie os aparelhos">
            No primeiro aparelho, crie a chave da família. No segundo, escolha “Já tenho o Ninar” e escaneie o QR code. Pode parear quantos aparelhos quiser.
          </Step>
          <Step icon={<Baby className="size-5" />} title="2. Câmera no quarto">
            No aparelho que fica com o bebê, toque em <b>Câmera do bebê</b>. Ligue no carregador e deixe a 1 metro ou mais do berço.
          </Step>
          <Step icon={<MonitorSmartphone className="size-5" />} title="3. Monitor com você">
            No outro aparelho, toque em <b>Monitor dos pais</b>. Ele encontra a câmera sozinho — em casa ou fora dela.
          </Step>
        </Card>

        <SectionTitle>Instale como app</SectionTitle>
        <Card className="space-y-3">
          <p className={isIOS ? 'text-ink' : ''}>
            <b>iPhone (Safari):</b> toque em Compartilhar (quadrado com seta) → <b>Adicionar à Tela de Início</b>. Abra o Ninar pelo ícone.
          </p>
          <p className={isAndroid ? 'text-ink' : ''}>
            <b>Android (Chrome):</b> menu ⋮ → <b>Instalar app</b> (ou “Adicionar à tela inicial”).
          </p>
          <p className="text-sm text-ink-muted">
            No iPhone o app instalado tem armazenamento separado do Safari: faça o pareamento <b>dentro do app instalado</b>.
          </p>
        </Card>

        <SectionTitle>Dicas para uma noite tranquila</SectionTitle>
        <Card className="space-y-4">
          <Step icon={<BatteryCharging className="size-5" />} title="Sempre na tomada">
            Transmitir vídeo a noite toda consome bateria. A câmera avisa o monitor se a bateria ficar baixa (Android).
          </Step>
          <Step icon={<Lightbulb className="size-5" />} title="Visão noturna">
            Celulares não têm infravermelho. O Ninar realça a imagem digitalmente e aumenta a exposição; uma luz noturna bem fraca (âmbar) deixa a imagem muito melhor.
          </Step>
          <Step icon={<Wifi className="size-5" />} title="Mantenha as telas abertas">
            Os navegadores pausam a câmera se o app for minimizado ou a tela bloquear. A câmera fica escura sozinha; no monitor, use “Tela escura”.
            {isIOS && ' No iPhone: Ajustes → Tela e Brilho → Bloqueio Automático → Nunca, durante o uso.'}
          </Step>
          <Step icon={<TriangleAlert className="size-5" />} title="Conexão perdida">
            Se a câmera sumir por mais de 20 s, o monitor toca um alarme diferente. Você pode ajustar o tempo nas configurações.
          </Step>
        </Card>

        <SectionTitle>Segurança</SectionTitle>
        <Card className="space-y-3">
          <Step icon={<ShieldCheck className="size-5" />} title="Ponta a ponta de verdade">
            Vídeo e áudio vão direto entre seus aparelhos (WebRTC com DTLS-SRTP). Para se encontrarem, eles trocam mensagens por relés públicos —
            mas cifradas com AES-256-GCM usando uma chave de 256 bits que só existe nos seus aparelhos. Os relés não conseguem ler, alterar nem se passar por eles.
          </Step>
          <p className="text-sm text-ink-muted">
            Toque em <b>E2E</b> na câmera e no monitor: se os emojis forem iguais, ninguém está no meio da conexão. O QR code de pareamento é a chave —
            não o mostre a ninguém. Se vazar, gere uma nova chave em Configurações.
          </p>
        </Card>

        <SectionTitle>Conexão fora de casa</SectionTitle>
        <Card>
          <p>
            Na mesma rede Wi-Fi a conexão é direta. Fora de casa (4G/5G), quase sempre funciona via internet. Algumas operadoras bloqueiam conexões
            diretas; nesse caso, cadastre um servidor <b>TURN</b> em Configurações → Rede (há opções gratuitas, como Cloudflare Calls ou Metered). O
            conteúdo continua cifrado ponta a ponta.
          </p>
        </Card>

        <p className="mt-8 mb-4 text-center text-xs text-ink-faint">
          O Ninar ajuda, mas não substitui a supervisão de um adulto. Não é um dispositivo médico.
        </p>
      </div>
    </div>
  )
}

function Step({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3.5">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-night-700 text-moon">{icon}</div>
      <div>
        <div className="font-extrabold text-ink">{title}</div>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  )
}
