// Relé Nostr: eventos efêmeros (não armazenados) com conteúdo já cifrado.
// Cada sessão usa uma identidade Nostr descartável — nada liga você aos eventos.
import { schnorr } from '@noble/curves/secp256k1.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { randomId, toHex, utf8 } from '../bytes'
import { WsRelay } from './relay'

/** Faixa 20000–29999 = eventos efêmeros (NIP-01). */
const KIND = 25418

interface NostrEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

export class NostrRelay extends WsRelay {
  readonly kind = 'nostr' as const
  private sk = schnorr.utils.randomSecretKey()
  private pk = toHex(schnorr.getPublicKey(this.sk))
  private subId = randomId(6)

  protected handleOpen() {
    this.subId = randomId(6)
    const filter = { kinds: [KIND], '#x': [this.topic], since: Math.floor(Date.now() / 1000) - 60 }
    this.send(JSON.stringify(['REQ', this.subId, filter]))
    this.setState('open')
  }

  protected beforeClose() {
    if (this.state === 'open') this.send(JSON.stringify(['CLOSE', this.subId]))
  }

  publish(data: string): boolean {
    if (this.state !== 'open') return false
    const created_at = Math.floor(Date.now() / 1000)
    const tags = [['x', this.topic]]
    const id = sha256(utf8.encode(JSON.stringify([0, this.pk, created_at, KIND, tags, data])))
    const ev: NostrEvent = {
      id: toHex(id),
      pubkey: this.pk,
      created_at,
      kind: KIND,
      tags,
      content: data,
      sig: toHex(schnorr.sign(id, this.sk)),
    }
    return this.send(JSON.stringify(['EVENT', ev]))
  }

  protected handleData(data: string | ArrayBuffer) {
    if (typeof data !== 'string') return
    let msg: unknown
    try {
      msg = JSON.parse(data)
    } catch {
      return
    }
    if (!Array.isArray(msg)) return
    if (msg[0] === 'EVENT' && msg[1] === this.subId) {
      const ev = msg[2] as NostrEvent
      if (ev?.kind === KIND && ev.tags?.some((t) => t[0] === 'x' && t[1] === this.topic) && typeof ev.content === 'string') {
        // A autenticidade é garantida pelo AES-GCM da camada acima.
        this.onMessage(ev.content)
      }
    } else if (msg[0] === 'CLOSED' && msg[1] === this.subId) {
      // Relé encerrou a assinatura (limite/política): reconecta mais tarde.
      this.recycle()
    }
  }
}
