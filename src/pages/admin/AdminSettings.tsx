import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { ARENA } from '@/lib/domain'
import { useAuth } from '@/hooks/use-auth'

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export default function AdminSettings() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [courtId, setCourtId] = useState<string>('')
  const [hours, setHours] = useState<{ open_time: string; close_time: string }[]>(
    Array.from({ length: 7 }, () => ({ open_time: '08:00', close_time: '22:00' })),
  )

  const { data: courts } = useQuery({
    queryKey: ['admin-courts-all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('courts').select('*').order('sort_order')
      if (error) throw error
      return data
    },
  })

  useEffect(() => {
    if (!courtId && courts && courts.length > 0) setCourtId(courts[0].id)
  }, [courts, courtId])

  const { data: existingHours } = useQuery({
    queryKey: ['admin-business-hours', courtId],
    enabled: !!courtId,
    queryFn: async () => {
      const { data, error } = await supabase.from('business_hours').select('*').eq('court_id', courtId).order('weekday')
      if (error) throw error
      return data
    },
  })

  useEffect(() => {
    if (existingHours && existingHours.length > 0) {
      const next = Array.from({ length: 7 }, (_, weekday) => {
        const found = existingHours.find((h) => h.weekday === weekday)
        return { open_time: found?.open_time.slice(0, 5) ?? '08:00', close_time: found?.close_time.slice(0, 5) ?? '22:00' }
      })
      setHours(next)
    }
  }, [existingHours])

  const saveHours = useMutation({
    mutationFn: async () => {
      const { error: delErr } = await supabase.from('business_hours').delete().eq('court_id', courtId)
      if (delErr) throw delErr
      const rows = hours.map((h, weekday) => ({ court_id: courtId, weekday, open_time: h.open_time, close_time: h.close_time }))
      const { error: insErr } = await supabase.from('business_hours').insert(rows)
      if (insErr) throw insErr
    },
    onSuccess: () => {
      toast.success('Horários atualizados')
      queryClient.invalidateQueries({ queryKey: ['admin-business-hours'] })
      queryClient.invalidateQueries({ queryKey: ['business_hours'] })
    },
    onError: (err: Error) => toast.error('Erro ao salvar horários', { description: err.message }),
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Horários de funcionamento e dados da conta.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Horário de funcionamento por quadra</CardTitle>
          <CardDescription>Define os horários disponíveis para agendamento em cada dia da semana.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs space-y-2">
            <Label>Quadra</Label>
            <Select value={courtId} onValueChange={(v) => v && setCourtId(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(courts ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            {WEEKDAYS.map((label, i) => (
              <div key={label} className="grid grid-cols-3 items-center gap-3 sm:max-w-md">
                <span className="text-sm text-muted-foreground">{label}</span>
                <Input
                  type="time"
                  value={hours[i].open_time}
                  onChange={(e) =>
                    setHours((h) => h.map((row, idx) => (idx === i ? { ...row, open_time: e.target.value } : row)))
                  }
                />
                <Input
                  type="time"
                  value={hours[i].close_time}
                  onChange={(e) =>
                    setHours((h) => h.map((row, idx) => (idx === i ? { ...row, close_time: e.target.value } : row)))
                  }
                />
              </div>
            ))}
          </div>

          <Button onClick={() => saveHours.mutate()} disabled={saveHours.isPending || !courtId}>
            {saveHours.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar horários
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados da arena</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-muted-foreground">Nome</Label>
            <p className="font-medium">{ARENA.name}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-muted-foreground">Telefone</Label>
            <p className="font-medium">{ARENA.phone}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-muted-foreground">Administrador logado</Label>
            <p className="font-medium">{profile?.full_name}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
