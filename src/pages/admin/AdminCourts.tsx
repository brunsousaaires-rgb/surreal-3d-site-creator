import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { MODALITY_LABELS, formatCurrencyBRL, type Modality } from '@/lib/domain'
import type { Tables } from '@/lib/database.types'

type Court = Tables<'courts'>

const EMPTY_FORM = {
  name: '',
  modality: 'volei_praia' as Modality,
  description: '',
  price_per_hour: '0',
  is_active: true,
}

export default function AdminCourts() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Court | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const { data: courts, isLoading } = useQuery({
    queryKey: ['admin-courts-all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('courts').select('*').order('sort_order')
      if (error) throw error
      return data
    },
  })

  const saveCourt = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        modality: form.modality,
        description: form.description,
        price_per_hour: Number(form.price_per_hour),
        is_active: form.is_active,
      }
      if (editing) {
        const { error } = await supabase.from('courts').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('courts').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(editing ? 'Quadra atualizada' : 'Quadra criada')
      queryClient.invalidateQueries({ queryKey: ['admin-courts-all'] })
      queryClient.invalidateQueries({ queryKey: ['courts'] })
      closeDialog()
    },
    onError: (err: Error) => toast.error('Erro ao salvar quadra', { description: err.message }),
  })

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('courts').update({ is_active }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-courts-all'] })
      queryClient.invalidateQueries({ queryKey: ['courts'] })
    },
  })

  function openEdit(court: Court) {
    setEditing(court)
    setForm({
      name: court.name,
      modality: court.modality as Modality,
      description: court.description,
      price_per_hour: String(court.price_per_hour),
      is_active: court.is_active,
    })
  }

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setCreating(true)
  }

  function closeDialog() {
    setEditing(null)
    setCreating(false)
    setForm(EMPTY_FORM)
  }

  const dialogOpen = creating || !!editing

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quadras</h1>
          <p className="text-sm text-muted-foreground">Cadastre e gerencie as quadras da arena.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Nova quadra
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && <p className="text-muted-foreground">Carregando...</p>}
        {(courts ?? []).map((court) => (
          <Card key={court.id}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <span className="text-xs font-medium text-primary">
                  {MODALITY_LABELS[court.modality as Modality] ?? court.modality}
                </span>
                <CardTitle className="text-base">{court.name}</CardTitle>
              </div>
              <Button variant="ghost" size="icon" onClick={() => openEdit(court)}>
                <Pencil className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{court.description}</p>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-primary">{formatCurrencyBRL(Number(court.price_per_hour))}/h</span>
                <div className="flex items-center gap-2">
                  <Badge variant={court.is_active ? 'default' : 'outline'}>
                    {court.is_active ? 'Ativa' : 'Inativa'}
                  </Badge>
                  <Switch
                    checked={court.is_active}
                    onCheckedChange={(checked) => toggleActive.mutate({ id: court.id, is_active: checked })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar quadra' : 'Nova quadra'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="courtName">Nome</Label>
              <Input id="courtName" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Modalidade</Label>
              <Select value={form.modality} onValueChange={(v) => setForm((f) => ({ ...f, modality: v as Modality }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MODALITY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="courtDescription">Descrição</Label>
              <Textarea
                id="courtDescription"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="courtPrice">Preço por hora (R$)</Label>
              <Input
                id="courtPrice"
                type="number"
                min="0"
                step="0.01"
                value={form.price_per_hour}
                onChange={(e) => setForm((f) => ({ ...f, price_per_hour: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="courtActive">Quadra ativa</Label>
              <Switch
                id="courtActive"
                checked={form.is_active}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, is_active: checked }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancelar
            </Button>
            <Button onClick={() => saveCourt.mutate()} disabled={saveCourt.isPending || !form.name}>
              {saveCourt.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
