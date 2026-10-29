import type { Relay, RelayState } from './relay'

/** Relé entre abas do mesmo navegador (útil para testes e demonstração). */
export class LocalRelay implements Relay {
  readonly id = 'local'
  readonly label = 'Mesmo aparelho'
  readonly kind = 'local' as const
  state: RelayState = 'idle'
  onState?: () => void
  private ch: BroadcastChannel | null = null

  start(topic: string, onMessage: (data: string) => void) {
    if (typeof BroadcastChannel === 'undefined') return
    this.ch = new BroadcastChannel(`ninar:${topic}`)
    this.ch.onmessage = (ev) => typeof ev.data === 'string' && onMessage(ev.data)
    this.state = 'open'
    this.onState?.()
  }

  publish(data: string): boolean {
    if (!this.ch) return false
    this.ch.postMessage(data)
    return true
  }

  stop() {
    this.ch?.close()
    this.ch = null
    this.state = 'closed'
    this.onState?.()
  }
}
