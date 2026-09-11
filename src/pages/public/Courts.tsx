import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { MODALITY_LABELS, formatCurrencyBRL, type Modality } from '@/lib/domain'

export default function Courts() {
  const { data: courts, isLoading } = useQuery({
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
    <div className="dark mx-auto max-w-6xl px-4 py-16">
      <div className="mb-10 space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Nossas quadras</h1>
        <p className="text-muted-foreground">
          Estrutura profissional de areia para vôlei de praia, futevôlei e beach tennis.
        </p>
      </div>

      {isLoading && <p className="text-center text-muted-foreground">Carregando quadras...</p>}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {(courts ?? []).map((court) => (
          <Card key={court.id} className="border-white/10 bg-card/60">
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
    </div>
  )
}
