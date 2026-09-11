import { MessageCircle } from 'lucide-react'
import { whatsappLink } from '@/lib/domain'

export function WhatsAppButton() {
  return (
    <a
      href={whatsappLink('Olá! Gostaria de mais informações sobre a Estância Imperial Sports.')}
      target="_blank"
      rel="noreferrer"
      className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-black/20 transition hover:scale-105 hover:shadow-xl"
      aria-label="Falar no WhatsApp"
    >
      <MessageCircle className="h-5 w-5" />
      <span className="hidden sm:inline">WhatsApp</span>
    </a>
  )
}
