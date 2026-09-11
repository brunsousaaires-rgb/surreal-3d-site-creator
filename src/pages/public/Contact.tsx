import { Phone, MapPin, Clock, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ARENA, whatsappLink } from '@/lib/domain'

export default function Contact() {
  return (
    <div className="dark mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="text-3xl font-bold tracking-tight">Fale com a gente</h1>
      <p className="mt-2 text-muted-foreground">
        Dúvidas sobre horários, valores ou eventos? Fale direto com a {ARENA.name}.
      </p>

      <Card className="mt-8 border-white/10 bg-card/40">
        <CardContent className="flex flex-col gap-4 p-8">
          <div className="flex items-center justify-center gap-2 text-lg font-semibold">
            <Phone className="h-5 w-5 text-primary" /> {ARENA.phone}
          </div>
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <MapPin className="h-4 w-4 text-primary" /> {ARENA.city}
          </div>
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4 text-primary" /> Todos os dias, 08:00 às 22:00
          </div>
          <Button
            size="lg"
            className="mt-4"
            render={<a href={whatsappLink()} target="_blank" rel="noreferrer" />}
          >
            <MessageCircle className="mr-2 h-4 w-4" /> Chamar no WhatsApp
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
