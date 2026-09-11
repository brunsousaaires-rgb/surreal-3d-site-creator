import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { Wallet, Clock3, CheckCircle2 } from 'lucide-react'
import { StatCard } from '@/components/dashboard/StatCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase } from '@/lib/supabase'
import { formatCurrencyBRL, formatTimeLabel, PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/lib/domain'
import { useAuth } from '@/hooks/use-auth'

export default function AdminPayments() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'pending' | 'paid'>('pending')

  const { data: bookings } = useQuery({
    queryKey: ['admin-payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*, courts(name)')
        .neq('status', 'cancelled')
        .order('booking_date', { ascending: false })
      if (error) throw error
      return data
    },
  })

  const stats = useMemo(() => {
    const list = bookings ?? []
    const pending = list.filter((b) => b.payment_status === 'pending')
    const paid = list.filter((b) => b.payment_status === 'paid')
    return {
      pending,
      paid,
      pendingTotal: pending.reduce((s, b) => s + Number(b.total_price), 0),
      paidTotal: paid.reduce((s, b) => s + Number(b.total_price), 0),
    }
  }, [bookings])

  const markPaid = useMutation({
    mutationFn: async ({ id, method }: { id: string; method: PaymentMethod }) => {
      const { error } = await supabase
        .from('bookings')
        .update({
          payment_status: 'paid',
          payment_method: method,
          paid_at: new Date().toISOString(),
          confirmed_by: user?.id,
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Pagamento confirmado')
      queryClient.invalidateQueries({ queryKey: ['admin-payments'] })
    },
    onError: (err: Error) => toast.error('Erro ao confirmar pagamento', { description: err.message }),
  })

  const rows = tab === 'pending' ? stats.pending : stats.paid

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pagamentos</h1>
        <p className="text-sm text-muted-foreground">Organize e confirme os pagamentos das reservas.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="A receber" value={formatCurrencyBRL(stats.pendingTotal)} icon={Clock3} />
        <StatCard label="Recebido" value={formatCurrencyBRL(stats.paidTotal)} icon={CheckCircle2} />
        <StatCard label="Total do período" value={formatCurrencyBRL(stats.pendingTotal + stats.paidTotal)} icon={Wallet} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <Tabs value={tab} onValueChange={(v) => setTab(v as 'pending' | 'paid')}>
              <TabsList>
                <TabsTrigger value="pending">Pendentes ({stats.pending.length})</TabsTrigger>
                <TabsTrigger value="paid">Pagos ({stats.paid.length})</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Quadra</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Método</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.customer_name}</TableCell>
                  <TableCell>{b.courts?.name}</TableCell>
                  <TableCell>
                    {format(parseISO(b.booking_date), 'dd/MM/yyyy')} · {formatTimeLabel(b.start_time)}
                  </TableCell>
                  <TableCell>{formatCurrencyBRL(Number(b.total_price))}</TableCell>
                  <TableCell>
                    {b.payment_method ? (
                      <Badge variant="outline">{PAYMENT_METHOD_LABELS[b.payment_method as PaymentMethod]}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {tab === 'pending' && (
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => markPaid.mutate({ id: b.id, method: 'pix' })}>
                          PIX
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => markPaid.mutate({ id: b.id, method: 'dinheiro' })}>
                          Dinheiro
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => markPaid.mutate({ id: b.id, method: 'cartao' })}>
                          Cartão
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Nenhum registro.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
