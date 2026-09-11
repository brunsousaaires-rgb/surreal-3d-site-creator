import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, subDays, startOfMonth, isToday, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { CalendarCheck2, Wallet, Users, PercentCircle } from 'lucide-react'
import { StatCard } from '@/components/dashboard/StatCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { formatCurrencyBRL, MODALITY_LABELS, type Modality } from '@/lib/domain'

const CHART_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

export default function AdminOverview() {
  const since = format(subDays(new Date(), 30), 'yyyy-MM-dd')
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')

  const { data: bookings } = useQuery({
    queryKey: ['admin-bookings-30d'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*, courts(name, modality)')
        .gte('booking_date', since)
        .order('booking_date')
      if (error) throw error
      return data
    },
  })

  const { data: customerCount } = useQuery({
    queryKey: ['admin-customer-count'],
    queryFn: async () => {
      const { count, error } = await supabase.from('profiles').select('*', { count: 'exact', head: true })
      if (error) throw error
      return count ?? 0
    },
  })

  const stats = useMemo(() => {
    const list = bookings ?? []
    const today = list.filter((b) => isToday(parseISO(b.booking_date)) && b.status !== 'cancelled')
    const monthPaid = list.filter((b) => b.booking_date >= monthStart && b.payment_status === 'paid')
    const pendingPayment = list.filter((b) => b.status !== 'cancelled' && b.payment_status === 'pending')
    const revenueMonth = monthPaid.reduce((sum, b) => sum + Number(b.total_price), 0)

    const revenueByDay: Record<string, number> = {}
    for (let i = 13; i >= 0; i--) {
      revenueByDay[format(subDays(new Date(), i), 'dd/MM')] = 0
    }
    list.forEach((b) => {
      const label = format(parseISO(b.booking_date), 'dd/MM')
      if (label in revenueByDay && b.payment_status === 'paid') {
        revenueByDay[label] += Number(b.total_price)
      }
    })

    const byCourt: Record<string, number> = {}
    list.forEach((b) => {
      if (b.status === 'cancelled') return
      const name = b.courts?.name ?? 'Outra'
      byCourt[name] = (byCourt[name] ?? 0) + 1
    })

    return {
      todayCount: today.length,
      revenueMonth,
      pendingPaymentCount: pendingPayment.length,
      revenueChart: Object.entries(revenueByDay).map(([date, total]) => ({ date, total })),
      courtChart: Object.entries(byCourt).map(([name, value]) => ({ name, value })),
    }
  }, [bookings, monthStart])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Visão geral</h1>
        <p className="text-sm text-muted-foreground">Acompanhe reservas, pagamentos e ocupação da arena.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Reservas hoje" value={String(stats.todayCount)} icon={CalendarCheck2} />
        <StatCard
          label="Faturamento do mês"
          value={formatCurrencyBRL(stats.revenueMonth)}
          icon={Wallet}
          hint="Pagamentos confirmados"
        />
        <StatCard
          label="Pagamentos pendentes"
          value={String(stats.pendingPaymentCount)}
          icon={PercentCircle}
          hint="Reservas aguardando pagamento"
        />
        <StatCard label="Clientes cadastrados" value={String(customerCount ?? 0)} icon={Users} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Faturamento recebido (14 dias)</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.revenueChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  formatter={(value) => formatCurrencyBRL(Number(value))}
                  contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8 }}
                />
                <Bar dataKey="total" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reservas por quadra (30 dias)</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stats.courtChart} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {stats.courtChart.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Próximas reservas</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {(bookings ?? [])
            .filter((b) => b.booking_date >= format(new Date(), 'yyyy-MM-dd') && b.status !== 'cancelled')
            .slice(0, 6)
            .map((b) => (
              <div key={b.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-medium">{b.customer_name}</p>
                  <p className="text-muted-foreground">
                    {b.courts?.name} · {MODALITY_LABELS[b.courts?.modality as Modality] ?? ''}
                  </p>
                </div>
                <div className="text-right text-muted-foreground">
                  {format(parseISO(b.booking_date), "dd 'de' MMM", { locale: ptBR })} · {b.start_time.slice(0, 5)}
                </div>
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  )
}
