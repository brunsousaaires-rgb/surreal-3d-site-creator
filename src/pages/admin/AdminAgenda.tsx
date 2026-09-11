import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { CalendarIcon, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { addDays } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { MODALITY_LABELS, formatTimeLabel, generateAvailableSlots, timeToMinutes, type Modality, type TimeRange } from '@/lib/domain'
import { cn } from '@/lib/utils'

interface SlotCell extends TimeRange {
  booking?: {
    id: string
    customer_name: string
    status: string
    payment_status: string
  }
}

export default function AdminAgenda() {
  const queryClient = useQueryClient()
  const [selectedDate, setSelectedDate] = useState(new Date())
  const dateStr = format(selectedDate, 'yyyy-MM-dd')
  const weekday = selectedDate.getDay()

  const [manualSlot, setManualSlot] = useState<{ courtId: string; courtName: string; price: number; slot: TimeRange } | null>(
    null,
  )
  const [manualName, setManualName] = useState('')
  const [manualPhone, setManualPhone] = useState('')

  const { data: courts } = useQuery({
    queryKey: ['admin-courts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('courts').select('*').eq('is_active', true).order('sort_order')
      if (error) throw error
      return data
    },
  })

  const { data: hoursData } = useQuery({
    queryKey: ['admin-agenda-hours', weekday],
    queryFn: async () => {
      const { data, error } = await supabase.from('business_hours').select('*').eq('weekday', weekday)
      if (error) throw error
      return data
    },
  })

  const { data: bookingsData } = useQuery({
    queryKey: ['admin-agenda-bookings', dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('id, court_id, start_time, end_time, customer_name, status, payment_status')
        .eq('booking_date', dateStr)
        .neq('status', 'cancelled')
      if (error) throw error
      return data
    },
  })

  const { data: blockedData } = useQuery({
    queryKey: ['admin-agenda-blocked', dateStr],
    queryFn: async () => {
      const { data, error } = await supabase.from('blocked_slots').select('*').eq('blocked_date', dateStr)
      if (error) throw error
      return data
    },
  })

  const grid = useMemo(() => {
    const result: Record<string, SlotCell[]> = {}
    for (const court of courts ?? []) {
      const hours = (hoursData ?? []).filter((h) => h.court_id === court.id)
      const bookingsForCourt = (bookingsData ?? []).filter((b) => b.court_id === court.id)
      const blockedForCourt = (blockedData ?? []).filter((b) => b.court_id === court.id)
      const allSlots = generateAvailableSlots(
        hours.map((h) => ({ start: h.open_time, end: h.close_time })),
        [],
      )
      result[court.id] = allSlots.map((slot) => {
        const booking = bookingsForCourt.find(
          (b) => timeToMinutes(b.start_time) === timeToMinutes(slot.start),
        )
        const blocked = blockedForCourt.find((b) => timeToMinutes(b.start_time) === timeToMinutes(slot.start))
        return {
          ...slot,
          booking: booking
            ? {
                id: booking.id,
                customer_name: booking.customer_name,
                status: booking.status,
                payment_status: booking.payment_status,
              }
            : blocked
              ? { id: blocked.id, customer_name: blocked.reason || 'Bloqueado', status: 'blocked', payment_status: '' }
              : undefined,
        }
      })
    }
    return result
  }, [courts, hoursData, bookingsData, blockedData])

  const createManualBooking = useMutation({
    mutationFn: async () => {
      if (!manualSlot) return
      const { error } = await supabase.from('bookings').insert({
        court_id: manualSlot.courtId,
        customer_name: manualName || 'Cliente balcão',
        customer_phone: manualPhone || null,
        booking_date: dateStr,
        start_time: manualSlot.slot.start,
        end_time: manualSlot.slot.end,
        total_price: manualSlot.price,
        status: 'confirmed',
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Reserva criada')
      setManualSlot(null)
      setManualName('')
      setManualPhone('')
      queryClient.invalidateQueries({ queryKey: ['admin-agenda-bookings'] })
    },
    onError: (err: Error) => toast.error('Erro ao criar reserva', { description: err.message }),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agenda</h1>
          <p className="text-sm text-muted-foreground">Visão diária de todas as quadras.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setSelectedDate((d) => addDays(d, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover>
            <PopoverTrigger render={<Button variant="outline" />}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar mode="single" selected={selectedDate} onSelect={(d) => d && setSelectedDate(d)} />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" onClick={() => setSelectedDate((d) => addDays(d, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {(courts ?? []).map((court) => (
          <Card key={court.id}>
            <CardContent className="p-4">
              <div className="mb-3">
                <span className="text-xs font-medium text-primary">
                  {MODALITY_LABELS[court.modality as Modality] ?? court.modality}
                </span>
                <h3 className="font-semibold">{court.name}</h3>
              </div>
              <div className="space-y-1.5">
                {(grid[court.id] ?? []).map((slot) => (
                  <button
                    key={slot.start}
                    disabled={!!slot.booking}
                    onClick={() =>
                      setManualSlot({
                        courtId: court.id,
                        courtName: court.name,
                        price: Number(court.price_per_hour),
                        slot,
                      })
                    }
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition',
                      slot.booking
                        ? slot.booking.status === 'blocked'
                          ? 'border-muted bg-muted/60 text-muted-foreground'
                          : 'border-primary/30 bg-primary/10'
                        : 'border-border hover:border-primary/40',
                    )}
                  >
                    <span className="font-medium">{formatTimeLabel(slot.start)}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {slot.booking ? slot.booking.customer_name : 'Livre'}
                    </span>
                  </button>
                ))}
                {(grid[court.id] ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground">Sem horário de funcionamento cadastrado.</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!manualSlot} onOpenChange={(open) => !open && setManualSlot(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova reserva manual</DialogTitle>
          </DialogHeader>
          {manualSlot && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {manualSlot.courtName} · {format(selectedDate, 'dd/MM/yyyy')} às {formatTimeLabel(manualSlot.slot.start)}
              </p>
              <div className="space-y-2">
                <Label htmlFor="manualName">Nome do cliente</Label>
                <Input id="manualName" value={manualName} onChange={(e) => setManualName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manualPhone">Telefone</Label>
                <Input id="manualPhone" value={manualPhone} onChange={(e) => setManualPhone(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualSlot(null)}>
              Cancelar
            </Button>
            <Button onClick={() => createManualBooking.mutate()} disabled={createManualBooking.isPending}>
              {createManualBooking.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar reserva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
