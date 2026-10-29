export type RelayState = 'idle' | 'connecting' | 'open' | 'closed'
export type RelayKind = 'mqtt' | 'nostr' | 'local'

export interface Relay {
  readonly id: string
  readonly label: string
  readonly kind: RelayKind
  state: RelayState
  onState?: () => void
  start(topic: string, onMessage: (data: string) => void): void
  /** Publica a mensagem (já cifrada). Retorna false se não estiver conectado. */
  publish(data: string): boolean
  stop(): void
}

/**
 * Base para relés WebSocket com reconexão automática (backoff exponencial
 * com jitter) e reconexão imediata quando a rede volta ou a aba reaparece.
 */
export abstract class WsRelay implements Relay {
  abstract readonly kind: RelayKind
  state: RelayState = 'idle'
  onState?: () => void
  protected ws: WebSocket | null = null
  protected topic = ''
  protected onMessage: (data: string) => void = () => {}
  private attempts = 0
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private stopped = false
  protected protocols: string | string[] | undefined
  readonly id: string
  readonly label: string
  protected url: string

  constructor(id: string, label: string, url: string) {
    this.id = id
    this.label = label
    this.url = url
  }

  start(topic: string, onMessage: (data: string) => void) {
    this.topic = topic
    this.onMessage = onMessage
    this.stopped = false
    window.addEventListener('online', this.kick)
    document.addEventListener('visibilitychange', this.kick)
    this.connect()
  }

  stop() {
    this.stopped = true
    clearTimeout(this.retryTimer)
    window.removeEventListener('online', this.kick)
    document.removeEventListener('visibilitychange', this.kick)
    this.beforeClose()
    const ws = this.ws
    this.ws = null
    if (ws) {
      ws.onclose = ws.onerror = ws.onmessage = ws.onopen = null
      try {
        ws.close()
      } catch {
        /* ignore */
      }
    }
    this.setState('closed')
  }

  abstract publish(data: string): boolean
  protected abstract handleOpen(): void
  protected abstract handleData(data: string | ArrayBuffer): void
  protected beforeClose() {}

  protected setState(s: RelayState) {
    if (this.state === s) return
    this.state = s
    if (s === 'open') this.attempts = 0
    this.onState?.()
  }

  protected send(data: string | Uint8Array<ArrayBuffer>): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false
    try {
      this.ws.send(data)
      return true
    } catch {
      return false
    }
  }

  /** Força reconexão imediata (ex.: rede voltou). */
  private kick = () => {
    if (this.stopped || document.visibilityState === 'hidden') return
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
      clearTimeout(this.retryTimer)
      this.attempts = 0
      this.connect()
    }
  }

  protected connect() {
    if (this.stopped) return
    this.setState('connecting')
    let ws: WebSocket
    try {
      ws = new WebSocket(this.url, this.protocols)
    } catch {
      this.scheduleRetry()
      return
    }
    ws.binaryType = 'arraybuffer'
    this.ws = ws
    const timeout = setTimeout(() => ws.readyState !== WebSocket.OPEN && ws.close(), 10_000)
    ws.onopen = () => {
      clearTimeout(timeout)
      this.handleOpen()
    }
    ws.onmessage = (ev) => this.handleData(ev.data)
    ws.onerror = () => {
      /* onclose segue */
    }
    ws.onclose = () => {
      clearTimeout(timeout)
      if (this.ws !== ws) return
      this.ws = null
      this.beforeClose()
      this.setState('closed')
      this.scheduleRetry()
    }
  }

  /** Fecha o socket atual para forçar reconexão (protocolo travado). */
  protected recycle() {
    try {
      this.ws?.close()
    } catch {
      /* ignore */
    }
  }

  private scheduleRetry() {
    if (this.stopped) return
    clearTimeout(this.retryTimer)
    const base = Math.min(30_000, 1000 * 2 ** this.attempts)
    this.attempts++
    this.retryTimer = setTimeout(() => this.connect(), base * (0.7 + Math.random() * 0.6))
  }
}
