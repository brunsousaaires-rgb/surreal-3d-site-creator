import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, addDays, isSameDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { CheckCircle2, Loader2, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import {
  MODALITY_LABELS,
  formatCurrencyBRL,
  formatTimeLabel,
  generateAvailableSlots,
  whatsappLink,
  type Modality,
  type TimeRange,
} from '@/lib/domain'
import { cn } from '@/lib/utils'

const DAYS_AHEAD = 14

export default function Booking() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(searchParams.get('quadra'))
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [selectedSlot, setSelectedSlot] = useState<TimeRange | null>(null)
  const [confirmedBookingId, setConfirmedBookingId] = useState<string | null>(null)

  const { data: courts } = useQuery({
    queryKey: ['courts', 'public'],
    queryFn: async () => {
      const { data, error } = await supabase.from('courts').select('*').eq('is_active', true).order('sort_order')
      if (error) throw error
      return data
    },
  })

  useEffect(() => {
    if (!selectedCourtId && courts && courts.length > 0) {
      setSelectedCourtId(courts[0].id)
    }
  }, [courts, selectedCourtId])

  useEffect(() => {
    if (selectedCourtId) {
      setSearchParams({ quadra: selectedCourtId }, { replace: true })
    }
    setSelectedSlot(null)
  }, [selectedCourtId, selectedDate]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedCourt = courts?.find((c) => c.id === selectedCourtId)
  const weekday = selectedDate.getDay()
  const dateStr = format(selectedDate, 'yyyy-MM-dd')

  const { data: businessHours } = useQuery({
    queryKey: ['business_hours', selectedCourtId, weekday],
    enabled: !!selectedCourtId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('business_hours')
        .select('open_time, close_time')
        .eq('court_id', selectedCourtId!)
        .eq('weekday', weekday)
      if (error) throw error
      return data
    },
  })

  const { data: occupied } = useQuery({
    queryKey: ['occupied', selectedCourtId, dateStr],
    enabled: !!selectedCourtId,
    queryFn: async () => {
      const [{ data: bookings, error: bErr }, { data: blocked, error: blErr }] = await Promise.all([
        supabase
          .from('bookings')
          .select('start_time, end_time')
          .eq('court_id', selectedCourtId!)
          .eq('booking_date', dateStr)
          .neq('status', 'cancelled'),
        supabase
          .from('blocked_slots')
          .select('start_time, end_time')
          .eq('court_id', selectedCourtId!)
          .eq('blocked_date', dateStr),
      ])
      if (bErr) throw bErr
      if (blErr) throw blErr
      return [...(bookings ?? []), ...(blocked ?? [])].map(
        (r): TimeRange => ({ start: r.start_time, end: r.end_time }),
      )
    },
  })

  const availableSlots = useMemo(() => {
    if (!businessHours) return []
    return generateAvailableSlots(
      businessHours.map((h) => ({ start: h.open_time, end: h.close_time })),
      occupied ?? [],
    )
  }, [businessHours, occupied])

  const createBooking = useMutation({
    mutationFn: async () => {
      if (!user || !selectedCourt || !selectedSlot) throw new Error('Dados incompletos')
      const { data, error } = await supabase
        .from('bookings')
        .insert({
          court_id: selectedCourt.id,
          customer_id: user.id,
          customer_name: profile?.full_name || user.email || 'Cliente',
          customer_phone: profile?.phone ?? null,
          booking_date: dateStr,
          start_time: selectedSlot.start,
          end_time: selectedSlot.end,
          total_price: selectedCourt.price_per_hour,
        })
        .select('id')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      setConfirmedBookingId(data.id)
      queryClient.invalidateQueries({ queryKey: ['occupied'] })
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] })
    },
    onError: (err: Error) => {
      toast.error('Não foi possível concluir a reserva', { description: err.message })
    },
  })

  function handleConfirm() {
    if (!user) {
      sessionStorage.setItem(
        'pendingBooking',
        JSON.stringify({ quadra: selectedCourtId, date: dateStr, slot: selectedSlot }),
      )
      navigate('/entrar', { state: { from: { pathname: '/agendar' } } })
      return
    }
    createBooking.mutate()
  }

  // restore selection after login redirect
  useEffect(() => {
    const pending = sessionStorage.getItem('pendingBooking')
    if (pending && user) {
      try {
        const parsed = JSON.parse(pending)
        if (parsed.quadra) setSelectedCourtId(parsed.quadra)
        if (parsed.date) setSelectedDate(new Date(parsed.date))
        if (parsed.slot) setSelectedSlot(parsed.slot)
      } catch {
        /* ignore */
      }
      sessionStorage.removeItem('pendingBooking')
    }
  }, [user])

  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(new Date(), i))

  if (confirmedBookingId && selectedCourt && selectedSlot) {
    return (
      <div className="dark mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center gap-6 px-4 py-16 text-center">
        <CheckCircle2 className="h-16 w-16 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Reserva enviada!</h1>
          <p className="mt-2 text-muted-foreground">
            {selectedCourt.name} · {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })} às{' '}
            {formatTimeLabel(selectedSlot.start)}
          </p>
        </div>
        <Card className="w-full border-white/10 bg-card/60 text-left">
          <CardContent className="space-y-2 p-6 text-sm">
            <p className="font-medium">Próximo passo: combine o pagamento</p>
            <p className="text-muted-foreground">
              Sua reserva está com status <b>aguardando confirmação</b>. Fale com a gente no WhatsApp para combinar o
              pagamento (PIX, dinheiro ou cartão) e garantir seu horário.
            </p>
          </CardContent>
        </Card>
        <div className="flex flex-wrap justify-center gap-3">
          <Button
            render={
              <a
                href={whatsappLink(
                  `Olá! Acabei de reservar a ${selectedCourt.name} para ${format(selectedDate, 'dd/MM')} às ${formatTimeLabel(selectedSlot.start)}. Gostaria de combinar o pagamento.`,
                )}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <MessageCircle className="mr-2 h-4 w-4" /> Falar no WhatsApp
          </Button>
          <Button variant="outline" onClick={() => navigate('/minha-conta')}>
            Ver minhas reservas
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="dark mx-auto max-w-4xl px-4 py-16">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Agendar horário</h1>
        <p className="mt-2 text-muted-foreground">Escolha a quadra, a data e o horário disponível.</p>
      </div>

      {/* Quadra */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">1. Quadra</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {(courts ?? []).map((court) => (
            <button
              key={court.id}
              onClick={() => setSelectedCourtId(court.id)}
              className={cn(
                'rounded-xl border p-4 text-left transition',
                selectedCourtId === court.id
                  ? 'border-primary bg-primary/10'
                  : 'border-white/10 bg-card/40 hover:border-primary/40',
              )}
            >
              <span className="text-xs font-medium text-primary">
                {MODALITY_LABELS[court.modality as Modality] ?? court.modality}
              </span>
              <p className="font-semibold">{court.name}</p>
              <p className="text-sm text-muted-foreground">
                {formatCurrencyBRL(Number(court.price_per_hour))}/hora
              </p>
            </button>
          ))}
        </div>
      </section>

      {/* Data */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">2. Data</h2>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {days.map((day) => (
            <button
              key={day.toISOString()}
              onClick={() => setSelectedDate(day)}
              className={cn(
                'flex min-w-16 flex-col items-center rounded-xl border px-3 py-2 text-sm transition',
                isSameDay(day, selectedDate)
                  ? 'border-primary bg-primary/10'
                  : 'border-white/10 bg-card/40 hover:border-primary/40',
              )}
            >
              <span className="text-xs text-muted-foreground">{format(day, 'EEE', { locale: ptBR })}</span>
              <span className="font-semibold">{format(day, 'dd/MM')}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Horário */}
      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">3. Horário</h2>
        {availableSlots.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum horário disponível nesta data.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {availableSlots.map((slot) => (
              <button
                key={slot.start}
                onClick={() => setSelectedSlot(slot)}
                className={cn(
                  'rounded-lg border px-3 py-2 text-sm font-medium transition',
                  selectedSlot?.start === slot.start
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-white/10 bg-card/40 hover:border-primary/40',
                )}
              >
                {formatTimeLabel(slot.start)}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Resumo */}
      {selectedCourt && selectedSlot && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Resumo da reserva</p>
              <p className="font-semibold">
                {selectedCourt.name} · {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })} às{' '}
                {formatTimeLabel(selectedSlot.start)}
              </p>
              <p className="text-lg font-bold text-primary">
                {formatCurrencyBRL(Number(selectedCourt.price_per_hour))}
              </p>
            </div>
            <Button size="lg" onClick={handleConfirm} disabled={createBooking.isPending}>
              {createBooking.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {user ? 'Confirmar reserva' : 'Entrar e confirmar'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
