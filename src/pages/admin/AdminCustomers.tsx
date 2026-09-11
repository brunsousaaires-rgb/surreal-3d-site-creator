import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import { formatCurrencyBRL } from '@/lib/domain'

export default function AdminCustomers() {
  const [search, setSearch] = useState('')

  const { data: profiles } = useQuery({
    queryKey: ['admin-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })

  const { data: bookings } = useQuery({
    queryKey: ['admin-bookings-for-customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('customer_id, total_price, payment_status, status')
      if (error) throw error
      return data
    },
  })

  const rows = useMemo(() => {
    const list = (profiles ?? []).filter((p) => p.role === 'customer')
    return list
      .map((p) => {
        const own = (bookings ?? []).filter((b) => b.customer_id === p.id && b.status !== 'cancelled')
        const spent = own.filter((b) => b.payment_status === 'paid').reduce((s, b) => s + Number(b.total_price), 0)
        return { ...p, bookingCount: own.length, spent }
      })
      .filter((p) => p.full_name.toLowerCase().includes(search.toLowerCase()) || (p.phone ?? '').includes(search))
  }, [profiles, bookings, search])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">{(profiles ?? []).filter((p) => p.role === 'customer').length} clientes cadastrados.</p>
        </div>
        <Input
          placeholder="Buscar por nome ou telefone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lista de clientes</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Reservas</TableHead>
                <TableHead>Total gasto</TableHead>
                <TableHead>Cadastro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.full_name || 'Sem nome'}</TableCell>
                  <TableCell>{p.phone || '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{p.bookingCount}</Badge>
                  </TableCell>
                  <TableCell>{formatCurrencyBRL(p.spent)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(p.created_at).toLocaleDateString('pt-BR')}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Nenhum cliente encontrado.
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
