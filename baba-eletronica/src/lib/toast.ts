import { createStore } from './store'

export interface Toast {
  id: number
  text: string
  tone: 'info' | 'success' | 'error'
}

export const toasts = createStore<{ items: Toast[] }>({ items: [] })
let seq = 0

export function toast(text: string, tone: Toast['tone'] = 'info', ms = 3200) {
  const id = ++seq
  toasts.set({ items: [...toasts.get().items, { id, text, tone }] })
  setTimeout(() => toasts.set({ items: toasts.get().items.filter((t) => t.id !== id) }), ms)
}
