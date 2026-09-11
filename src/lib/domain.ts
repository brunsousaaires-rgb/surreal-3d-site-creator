export type Modality = 'volei_praia' | 'futevolei' | 'beach_tennis' | 'volei_quadra'

export const MODALITY_LABELS: Record<Modality, string> = {
  volei_praia: 'Vôlei de Praia',
  futevolei: 'Futevôlei',
  beach_tennis: 'Beach Tennis',
  volei_quadra: 'Vôlei de Quadra',
}

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed'
export type PaymentStatus = 'pending' | 'paid' | 'refunded'
export type PaymentMethod = 'pix' | 'dinheiro' | 'cartao'

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Aguardando confirmação',
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
  completed: 'Concluído',
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pagamento pendente',
  paid: 'Pago',
  refunded: 'Reembolsado',
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
}

export const ARENA = {
  name: 'Estância Imperial Sports',
  phone: '+55 62 99684-3915',
  whatsappNumber: '5562996843915',
  city: 'Goiânia, GO',
}

export function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatTimeLabel(time: string): string {
  return time.slice(0, 5)
}

export function whatsappLink(message?: string): string {
  const base = `https://wa.me/${ARENA.whatsappNumber}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0')
  const m = (minutes % 60).toString().padStart(2, '0')
  return `${h}:${m}`
}

export interface TimeRange {
  start: string
  end: string
}

/** Gera slots de 1h dentro do horário de funcionamento, removendo os que colidem com reservas/bloqueios existentes. */
export function generateAvailableSlots(
  businessHours: TimeRange[],
  taken: TimeRange[],
  slotDurationMinutes = 60,
): TimeRange[] {
  const slots: TimeRange[] = []

  for (const range of businessHours) {
    const start = timeToMinutes(range.start)
    const end = timeToMinutes(range.end)

    for (let t = start; t + slotDurationMinutes <= end; t += slotDurationMinutes) {
      const slotStart = t
      const slotEnd = t + slotDurationMinutes

      const overlaps = taken.some((occupied) => {
        const occStart = timeToMinutes(occupied.start)
        const occEnd = timeToMinutes(occupied.end)
        return slotStart < occEnd && occStart < slotEnd
      })

      if (!overlaps) {
        slots.push({ start: minutesToTime(slotStart), end: minutesToTime(slotEnd) })
      }
    }
  }

  return slots
}
