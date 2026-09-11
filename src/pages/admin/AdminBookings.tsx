import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { MoreHorizontal } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import {
  BOOKING_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  formatCurrencyBRL,
  formatTimeLabel,
  type BookingStatus,
  type PaymentStatus,
} from '@/lib/domain'
import { useAuth } from '@/hooks/use-auth'
import type { TablesUpdate } from '@/lib/database.types'

const STATUS_VARIANT: Record<BookingStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  confirmed: 'default',
  cancelled: 'destructive',
  completed: 'outline',
}

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'Todos os status' },
  { value: 'pending', label: 'Aguardando confirmação' },
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'completed', label: 'Concluído' },
  { value: 'cancelled', label: 'Cancelado' },
]

export default function AdminBookings() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('all')

  const { data: bookings, isLoading } = useQuery({
    queryKey: ['admin-bookings-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*, courts(name, modality)')
        .order('booking_date', { ascending: false })
        .order('start_time', { ascending: false })
      if (error) throw error
      return data
    },
  })

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return bookings ?? []
    return (bookings ?? []).filter((b) => b.status === statusFilter)
  }, [bookings, statusFilter])

  const updateBooking = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<'bookings'> }) => {
      const { error } = await supabase.from('bookings').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-bookings-all'] })
      queryClient.invalidateQueries({ queryKey: ['admin-bookings-30d'] })
    },
    onError: (err: Error) => toast.error('Erro ao atualizar reserva', { description: err.message }),
  })

  function markPaid(id: string, method: 'pix' | 'dinheiro' | 'cartao') {
    updateBooking.mutate(
      {
        id,
        patch: {
          payment_status: 'paid',
          payment_method: method,
          paid_at: new Date().toISOString(),
          confirmed_by: user?.id,
          status: 'confirmed',
        },
      },
      { onSuccess: () => toast.success('Pagamento confirmado') },
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reservas</h1>
          <p className="text-sm text-muted-foreground">Gerencie todas as reservas da arena.</p>
        </div>
        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{filtered.length} reserva(s)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Quadra</TableHead>
                <TableHead>Data / Horário</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <div className="font-medium">{b.customer_name}</div>
                    <div className="text-xs text-muted-foreground">{b.customer_phone}</div>
                  </TableCell>
                  <TableCell>{b.courts?.name}</TableCell>
                  <TableCell>
                    {format(parseISO(b.booking_date), 'dd/MM/yyyy', { locale: ptBR })}
                    <br />
                    <span className="text-muted-foreground">{formatTimeLabel(b.start_time)}</span>
                  </TableCell>
                  <TableCell>{formatCurrencyBRL(Number(b.total_price))}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[b.status as BookingStatus]}>
                      {BOOKING_STATUS_LABELS[b.status as BookingStatus]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{PAYMENT_STATUS_LABELS[b.payment_status as PaymentStatus]}</Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}>
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {b.status === 'pending' && (
                          <DropdownMenuItem onClick={() => updateBooking.mutate({ id: b.id, patch: { status: 'confirmed' } })}>
                            Confirmar reserva
                          </DropdownMenuItem>
                        )}
                        {b.payment_status !== 'paid' && (
                          <>
                            <DropdownMenuItem onClick={() => markPaid(b.id, 'pix')}>Marcar pago (PIX)</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => markPaid(b.id, 'dinheiro')}>Marcar pago (Dinheiro)</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => markPaid(b.id, 'cartao')}>Marcar pago (Cartão)</DropdownMenuItem>
                          </>
                        )}
                        {b.status !== 'completed' && b.status !== 'cancelled' && (
                          <DropdownMenuItem onClick={() => updateBooking.mutate({ id: b.id, patch: { status: 'completed' } })}>
                            Marcar como concluída
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {b.status !== 'cancelled' && (
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => updateBooking.mutate({ id: b.id, patch: { status: 'cancelled' } })}
                          >
                            Cancelar reserva
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
