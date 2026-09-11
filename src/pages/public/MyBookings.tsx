import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'
import { CalendarX2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import {
  BOOKING_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  formatCurrencyBRL,
  formatTimeLabel,
  type BookingStatus,
  type PaymentStatus,
} from '@/lib/domain'

const STATUS_VARIANT: Record<BookingStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  confirmed: 'default',
  cancelled: 'destructive',
  completed: 'outline',
}

export default function MyBookings() {
  const { user, profile } = useAuth()
  const queryClient = useQueryClient()

  const { data: bookings, isLoading } = useQuery({
    queryKey: ['my-bookings', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*, courts(name, modality)')
        .eq('customer_id', user!.id)
        .order('booking_date', { ascending: false })
        .order('start_time', { ascending: false })
      if (error) throw error
      return data
    },
  })

  const cancelBooking = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Reserva cancelada')
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] })
    },
    onError: (err: Error) => toast.error('Erro ao cancelar', { description: err.message }),
  })

  return (
    <div className="dark mx-auto max-w-3xl px-4 py-16">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Minha conta</h1>
        <p className="mt-1 text-muted-foreground">
          Olá, {profile?.full_name || user?.email}. Aqui estão suas reservas.
        </p>
      </div>

      <div className="mb-6 flex justify-end">
        <Button render={<Link to="/agendar" />}>Nova reserva</Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Carregando...</p>}

      {!isLoading && (bookings ?? []).length === 0 && (
        <Card className="border-white/10 bg-card/40">
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center text-muted-foreground">
            <CalendarX2 className="h-10 w-10" />
            Você ainda não tem reservas.
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {(bookings ?? []).map((booking) => {
          const canCancel = booking.status === 'pending' || booking.status === 'confirmed'
          return (
            <Card key={booking.id} className="border-white/10 bg-card/40">
              <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{booking.courts?.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {format(parseISO(booking.booking_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })} às{' '}
                    {formatTimeLabel(booking.start_time)}
                  </p>
                  <p className="text-sm font-medium text-primary">{formatCurrencyBRL(Number(booking.total_price))}</p>
                </div>
                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <div className="flex gap-2">
                    <Badge variant={STATUS_VARIANT[booking.status as BookingStatus]}>
                      {BOOKING_STATUS_LABELS[booking.status as BookingStatus]}
                    </Badge>
                    <Badge variant="outline">{PAYMENT_STATUS_LABELS[booking.payment_status as PaymentStatus]}</Badge>
                  </div>
                  {canCancel && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => cancelBooking.mutate(booking.id)}
                    >
                      Cancelar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
