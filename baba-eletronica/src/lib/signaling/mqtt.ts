// Cliente MQTT 3.1.1 mínimo sobre WebSocket (somente QoS 0), sem dependências.
// Os brokers públicos só enxergam texto cifrado em um tópico aleatório.
import { randomId, utf8, utf8d } from '../bytes'
import { WsRelay } from './relay'

const PKT = {
  CONNECT: 0x10,
  CONNACK: 2,
  PUBLISH: 3,
  SUBSCRIBE: 0x82,
  SUBACK: 9,
  PINGREQ: 0xc0,
  PINGRESP: 13,
  DISCONNECT: 0xe0,
} as const

function encodeLength(n: number): number[] {
  const out: number[] = []
  do {
    let digit = n % 128
    n = Math.floor(n / 128)
    if (n > 0) digit |= 0x80
    out.push(digit)
  } while (n > 0)
  return out
}

function mqttString(s: string): number[] {
  const b = utf8.encode(s)
  return [b.length >> 8, b.length & 0xff, ...b]
}

function packet(header: number, body: ArrayLike<number>): Uint8Array<ArrayBuffer> {
  const len = encodeLength(body.length)
  const out = new Uint8Array(1 + len.length + body.length)
  out[0] = header
  out.set(len, 1)
  out.set(body as ArrayLike<number>, 1 + len.length)
  return out
}

export interface MqttOptions {
  username?: string
  password?: string
}

export class MqttRelay extends WsRelay {
  readonly kind = 'mqtt' as const
  private buffer = new Uint8Array(0)
  private ping: ReturnType<typeof setInterval> | undefined
  private lastRx = 0
  private packetId = 1
  private opts: MqttOptions

  constructor(id: string, label: string, url: string, opts: MqttOptions = {}) {
    super(id, label, url)
    this.opts = opts
    this.protocols = ['mqtt']
  }

  protected handleOpen() {
    this.buffer = new Uint8Array(0)
    const { username, password } = this.opts
    let flags = 0x02 // clean session
    if (username) flags |= 0x80
    if (password) flags |= 0x40
    const keepAlive = 45
    const body = [
      ...mqttString('MQTT'),
      4, // protocolo 3.1.1
      flags,
      keepAlive >> 8,
      keepAlive & 0xff,
      ...mqttString(`nn${randomId(9).replace(/[^A-Za-z0-9]/g, 'x')}`),
      ...(username ? mqttString(username) : []),
      ...(password ? mqttString(password) : []),
    ]
    this.send(packet(PKT.CONNECT, body))
    this.lastRx = Date.now()
    clearInterval(this.ping)
    this.ping = setInterval(() => {
      if (Date.now() - this.lastRx > keepAlive * 2000) return this.recycle()
      this.send(new Uint8Array([PKT.PINGREQ, 0]))
    }, 20_000)
  }

  protected beforeClose() {
    clearInterval(this.ping)
    if (this.state === 'open') this.send(new Uint8Array([PKT.DISCONNECT, 0]))
  }

  publish(data: string): boolean {
    if (this.state !== 'open') return false
    return this.send(packet(0x30, [...mqttString(this.topic), ...utf8.encode(data)]))
  }

  protected handleData(data: string | ArrayBuffer) {
    if (typeof data === 'string') return
    this.lastRx = Date.now()
    const chunk = new Uint8Array(data)
    const merged = new Uint8Array(this.buffer.length + chunk.length)
    merged.set(this.buffer)
    merged.set(chunk, this.buffer.length)
    this.buffer = merged
    this.drain()
  }

  private drain() {
    for (;;) {
      const b = this.buffer
      if (b.length < 2) return
      let mult = 1
      let len = 0
      let i = 1
      let byte: number
      do {
        if (i >= b.length) return // tamanho incompleto
        byte = b[i++]
        len += (byte & 0x7f) * mult
        mult *= 128
        if (i > 5) return this.recycle() // pacote malformado
      } while (byte & 0x80)
      if (b.length < i + len) return
      this.handlePacket(b[0], b.subarray(i, i + len))
      this.buffer = b.slice(i + len)
    }
  }

  private handlePacket(header: number, body: Uint8Array) {
    const type = header >> 4
    switch (type) {
      case PKT.CONNACK: {
        if (body[1] !== 0) return this.recycle()
        const id = this.packetId++ & 0xffff || 1
        this.send(packet(PKT.SUBSCRIBE, [id >> 8, id & 0xff, ...mqttString(this.topic), 0]))
        break
      }
      case PKT.SUBACK:
        this.setState('open')
        break
      case PKT.PUBLISH: {
        const qos = (header >> 1) & 3
        const tlen = (body[0] << 8) | body[1]
        const topic = utf8d.decode(body.subarray(2, 2 + tlen))
        const start = 2 + tlen + (qos > 0 ? 2 : 0)
        if (topic === this.topic) this.onMessage(utf8d.decode(body.subarray(start)))
        break
      }
      case PKT.PINGRESP:
        break
    }
  }
}

/** Converte "wss://usuario:senha@host:porta/caminho" em URL + credenciais. */
export function parseMqttUrl(raw: string): { url: string; opts: MqttOptions } | null {
  try {
    const u = new URL(raw.trim())
    if (u.protocol !== 'wss:') return null
    const opts: MqttOptions = {}
    if (u.username) opts.username = decodeURIComponent(u.username)
    if (u.password) opts.password = decodeURIComponent(u.password)
    u.username = ''
    u.password = ''
    return { url: u.toString(), opts }
  } catch {
    return null
  }
}
