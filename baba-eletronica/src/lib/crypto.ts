/**
 * Criptografia do Ninar.
 *
 * Modelo de segurança
 * - Cada "família" tem uma chave secreta de 256 bits gerada no aparelho e
 *   transferida apenas por QR code / código (nunca passa por servidor).
 * - Da chave derivamos via HKDF-SHA256: o identificador da sala (público, mas
 *   impossível de inverter) e a chave AES-256-GCM que cifra e autentica toda
 *   mensagem de sinalização (ofertas SDP, candidatos ICE, presença).
 * - O SDP carrega a impressão digital do certificado DTLS de cada aparelho. Como
 *   o SDP só circula cifrado e autenticado, nenhum relé consegue se colocar no
 *   meio: o áudio/vídeo (DTLS-SRTP) fica cifrado de ponta a ponta entre os
 *   aparelhos da família.
 * - Opcionalmente a chave fica cifrada em repouso com um PIN (PBKDF2 600k).
 */
import { buf, concatBytes, fromB64u, randomBytes, toB64u, toHex, utf8, utf8d } from './bytes'

const SALT = utf8.encode('ninar/v1/hkdf-salt')
export const FAMILY_KEY_BYTES = 32

export interface FamilyKeys {
  /** Identificador público da sala (hex, 128 bits). */
  roomId: string
  /** Chave AEAD da sinalização. */
  signalKey: CryptoKey
  /** Impressão curta para conferência humana (ex.: "7KQ2-M9XD"). */
  fingerprint: string
}

export function generateFamilySecret(): Uint8Array<ArrayBuffer> {
  return randomBytes(FAMILY_KEY_BYTES)
}

export async function deriveFamilyKeys(secret: Uint8Array): Promise<FamilyKeys> {
  const ikm = await crypto.subtle.importKey('raw', buf(secret), 'HKDF', false, ['deriveBits', 'deriveKey'])
  const hkdf = (info: string) => ({ name: 'HKDF', hash: 'SHA-256', salt: SALT, info: utf8.encode(info) })
  const roomBits = await crypto.subtle.deriveBits(hkdf('room-id'), ikm, 128)
  const fpBits = await crypto.subtle.deriveBits(hkdf('human-fingerprint'), ikm, 40)
  const signalKey = await crypto.subtle.deriveKey(
    hkdf('signal-aead'),
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
  return {
    roomId: toHex(new Uint8Array(roomBits)),
    signalKey,
    fingerprint: humanFingerprint(new Uint8Array(fpBits)),
  }
}

const FP_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
function humanFingerprint(bytes: Uint8Array): string {
  let v = 0n
  for (const b of bytes) v = (v << 8n) | BigInt(b)
  let s = ''
  for (let i = 0; i < 8; i++) {
    s = FP_ALPHABET[Number(v & 31n)] + s
    v >>= 5n
  }
  return `${s.slice(0, 4)}-${s.slice(4)}`
}

// ---------- Envelope AEAD ----------
// Formato: base64url( versão(1) | iv(12) | ciphertext+tag )
// O texto claro começa com 1 byte de formato: 0 = JSON, 1 = JSON comprimido (deflate-raw).

const ENVELOPE_V = 1

async function compress(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null
  try {
    const stream = new Blob([buf(data)]).stream().pipeThrough(new CompressionStream('deflate-raw'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  } catch {
    return null
  }
}

async function decompress(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([buf(data)]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function seal(key: CryptoKey, text: string, aad: string): Promise<string> {
  const raw = utf8.encode(text)
  let body: Uint8Array = concatBytes(new Uint8Array([0]), raw)
  if (raw.length > 600) {
    const packed = await compress(raw)
    if (packed && packed.length < raw.length) body = concatBytes(new Uint8Array([1]), packed)
  }
  const iv = randomBytes(12)
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: utf8.encode(aad) },
    key,
    buf(body),
  )
  return toB64u(concatBytes(new Uint8Array([ENVELOPE_V]), iv, new Uint8Array(ct)))
}

/** Retorna o texto claro ou `null` se a mensagem não for autêntica. */
export async function open(key: CryptoKey, sealed: string, aad: string): Promise<string | null> {
  try {
    const bytes = fromB64u(sealed)
    if (bytes[0] !== ENVELOPE_V || bytes.length < 1 + 12 + 16) return null
    const iv = bytes.slice(1, 13)
    const pt = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData: utf8.encode(aad) },
        key,
        bytes.slice(13),
      ),
    )
    const body = pt.subarray(1)
    if (pt[0] === 0) return utf8d.decode(body)
    if (pt[0] === 1) return utf8d.decode(await decompress(body))
    return null
  } catch {
    return null
  }
}

// ---------- Proteção da chave em repouso com PIN ----------

export interface WrappedSecret {
  kdf: 'PBKDF2-SHA256'
  iterations: number
  salt: string
  iv: string
  ct: string
}

const PIN_ITERATIONS = 600_000

async function pinKey(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const base = await crypto.subtle.importKey('raw', utf8.encode(pin), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function wrapSecret(secret: Uint8Array, pin: string): Promise<WrappedSecret> {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = await pinKey(pin, salt, PIN_ITERATIONS)
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: utf8.encode('ninar/v1/vault') },
    key,
    buf(secret),
  )
  return {
    kdf: 'PBKDF2-SHA256',
    iterations: PIN_ITERATIONS,
    salt: toB64u(salt),
    iv: toB64u(iv),
    ct: toB64u(new Uint8Array(ct)),
  }
}

export async function unwrapSecret(w: WrappedSecret, pin: string): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    const key = await pinKey(pin, fromB64u(w.salt), w.iterations)
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64u(w.iv), additionalData: utf8.encode('ninar/v1/vault') },
      key,
      fromB64u(w.ct),
    )
    return new Uint8Array(pt)
  } catch {
    return null
  }
}

// ---------- Código de segurança da conexão (estilo Signal) ----------

const SAFETY_EMOJI = [
  '🐻', '🐰', '🦊', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🦉', '🦄',
  '🐝', '🐞', '🦋', '🐢', '🐙', '🐳', '🐬', '🐟', '🦀', '🌵', '🌲', '🌻', '🌙', '⭐', '☀️', '🌈',
  '❄️', '🔥', '💧', '🍎', '🍌', '🍇', '🍓', '🍒', '🍑', '🍍', '🥕', '🌽', '🍄', '🥨', '🍪', '🎈',
  '🎁', '🎀', '🪁', '🧸', '🪀', '🎵', '🔔', '🚀', '⛵', '🚲', '🏠', '⚓', '🔑', '💎', '🎨', '📚',
]

/** Extrai a impressão digital DTLS (sha-256) de um SDP. */
export function sdpFingerprint(sdp: string | undefined | null): string | null {
  if (!sdp) return null
  const m = /a=fingerprint:sha-256 ([0-9A-Fa-f:]+)/.exec(sdp)
  return m ? m[1].toUpperCase() : null
}

export interface SafetyCode {
  emoji: string[]
  digits: string
}

/**
 * Código derivado das duas impressões DTLS. Se for igual nos dois aparelhos,
 * ninguém está interceptando a conexão.
 */
export async function safetyCode(fpA: string, fpB: string): Promise<SafetyCode> {
  const [a, b] = [fpA, fpB].sort()
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', utf8.encode(`ninar-sas|${a}|${b}`)))
  const emoji = Array.from(hash.slice(0, 5), (x) => SAFETY_EMOJI[x & 63])
  let digits = ''
  for (let i = 5; i < 11; i++) digits += (hash[i] % 100).toString().padStart(2, '0')
  return { emoji, digits: `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)}` }
}
