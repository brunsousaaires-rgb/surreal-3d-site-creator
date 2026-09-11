import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, ShieldCheck, Smartphone, Sun, Phone, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { ARENA, MODALITY_LABELS, formatCurrencyBRL, type Modality } from '@/lib/domain'

const STEPS = [
  {
    icon: CalendarDays,
    title: 'Escolha data e horário',
    text: 'Veja a disponibilidade em tempo real e escolha o melhor horário para o seu jogo.',
  },
  {
    icon: Smartphone,
    title: 'Confirme pelo celular',
    text: 'Reserve em poucos cliques, direto do seu celular, sem precisar ligar.',
  },
  {
    icon: ShieldCheck,
    title: 'Pagamento organizado',
    text: 'Pague via PIX e acompanhe o status da sua reserva em um só lugar.',
  },
]

export default function Home() {
  const { data: courts } = useQuery({
    queryKey: ['courts', 'public'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('courts')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
      if (error) throw error
      return data
    },
  })

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-white/10">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(60% 50% at 80% 0%, color-mix(in oklch, var(--primary) 25%, transparent), transparent), radial-gradient(50% 40% at 10% 100%, color-mix(in oklch, var(--primary) 15%, transparent), transparent)',
          }}
        />
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 md:grid-cols-2 md:py-28">
          <div className="flex flex-col justify-center gap-6">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Sun className="h-3.5 w-3.5" /> Quadras de areia · {ARENA.city}
            </span>
            <h1 className="text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">
              Agende sua quadra na <span className="text-primary">Estância Imperial Sports</span>
            </h1>
            <p className="max-w-md text-lg text-muted-foreground text-pretty">
              Vôlei de praia, futevôlei e beach tennis. Reserve seu horário online, sem filas e sem ligações.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" render={<Link to="/agendar" />}>
                Agendar horário
              </Button>
              <Button size="lg" variant="outline" render={<Link to="/quadras" />}>
                Ver quadras
              </Button>
            </div>
            <div className="flex items-center gap-4 pt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" /> {ARENA.phone}
              </span>
              <span className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" /> {ARENA.city}
              </span>
            </div>
          </div>

          <div className="relative hidden items-center justify-center md:flex">
            <div className="relative flex h-80 w-80 items-center justify-center rounded-full border border-primary/20 bg-gradient-to-br from-primary/20 to-transparent">
              <div className="flex h-56 w-56 items-center justify-center rounded-full bg-primary/90 shadow-2xl shadow-primary/30">
                <svg viewBox="0 0 48 48" className="h-32 w-32 text-primary-foreground/90">
                  <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none">
                    <path d="M24 4c-7 6-7 34 0 40" />
                    <path d="M24 4c7 6 7 34 0 40" />
                    <path d="M5 16c9-3 29-3 38 0" />
                    <path d="M5 32c9 3 29 3 38 0" />
                    <circle cx="24" cy="24" r="20" />
                  </g>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Modalidades */}
      <section id="modalidades" className="mx-auto max-w-6xl px-4 py-20">
        <div className="mb-10 flex flex-col gap-2 text-center">
          <h2 className="text-3xl font-bold tracking-tight">Nossas quadras</h2>
          <p className="text-muted-foreground">Estrutura profissional para as principais modalidades de areia.</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {(courts ?? []).map((court) => (
            <Card key={court.id} className="border-white/10 bg-card/60 transition hover:border-primary/40">
              <CardContent className="flex flex-col gap-3 p-6">
                <span className="w-fit rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
                  {MODALITY_LABELS[court.modality as Modality] ?? court.modality}
                </span>
                <h3 className="text-lg font-semibold">{court.name}</h3>
                <p className="text-sm text-muted-foreground">{court.description}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-lg font-bold text-primary">
                    {formatCurrencyBRL(Number(court.price_per_hour))}
                    <span className="text-xs font-normal text-muted-foreground"> /hora</span>
                  </span>
                  <Button size="sm" render={<Link to={`/agendar?quadra=${court.id}`} />}>
                    Reservar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Como funciona */}
      <section className="border-y border-white/10 bg-card/30">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold tracking-tight">Como funciona</h2>
          </div>
          <div className="grid gap-8 sm:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.title} className="flex flex-col items-center gap-3 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                  <step.icon className="h-7 w-7" />
                </div>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="mx-auto max-w-6xl px-4 py-20 text-center">
        <h2 className="text-3xl font-bold tracking-tight">Pronto para jogar?</h2>
        <p className="mt-3 text-muted-foreground">Garanta seu horário agora mesmo, é rápido e fácil.</p>
        <Button size="lg" className="mt-6" render={<Link to="/agendar" />}>
          Agendar horário
        </Button>
      </section>
    </div>
  )
}
