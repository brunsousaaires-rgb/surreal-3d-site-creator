import { fromB64u, fromBase32, randomId, toB64u, toBase32 } from './bytes'
import {
  deriveFamilyKeys,
  FAMILY_KEY_BYTES,
  generateFamilySecret,
  unwrapSecret,
  wrapSecret,
  type FamilyKeys,
  type WrappedSecret,
} from './crypto'
import { createStore, readJson, safeGet, safeSet } from './store'

type VaultRecord =
  | { v: 1; mode: 'plain'; secret: string; createdAt: number }
  | { v: 1; mode: 'pin'; wrapped: WrappedSecret; createdAt: number }

const VAULT_KEY = 'ninar.vault.v1'
const FAIL_KEY = 'ninar.vault.fails'
const DEVICE_KEY = 'ninar.device.v1'

export interface VaultState {
  status: 'booting' | 'empty' | 'locked' | 'unlocked'
  keys: FamilyKeys | null
  pinProtected: boolean
}

export const vault = createStore<VaultState>({ status: 'booting', keys: null, pinProtected: false })

let secret: Uint8Array | null = null

/** Identificador persistente deste aparelho (não secreto). */
export const deviceId: string = (() => {
  let id = safeGet(DEVICE_KEY)
  if (!id) {
    id = randomId(9)
    safeSet(DEVICE_KEY, id)
  }
  return id
})()

function record(): VaultRecord | null {
  return readJson<VaultRecord>(VAULT_KEY)
}

async function activate(s: Uint8Array, pinProtected: boolean) {
  secret = s
  vault.set({ status: 'unlocked', keys: await deriveFamilyKeys(s), pinProtected })
}

export async function bootVault() {
  const r = record()
  if (!r) return vault.set({ status: 'empty', keys: null, pinProtected: false })
  if (r.mode === 'pin') return vault.set({ status: 'locked', keys: null, pinProtected: true })
  await activate(fromB64u(r.secret), false)
}

async function persist(s: Uint8Array, pin: string | null) {
  const createdAt = record()?.createdAt ?? Date.now()
  const r: VaultRecord = pin
    ? { v: 1, mode: 'pin', wrapped: await wrapSecret(s, pin), createdAt }
    : { v: 1, mode: 'plain', secret: toB64u(s), createdAt }
  safeSet(VAULT_KEY, JSON.stringify(r))
}

export async function createFamily(pin: string | null = null) {
  const s = generateFamilySecret()
  await persist(s, pin)
  await activate(s, !!pin)
}

export async function joinFamily(s: Uint8Array, pin: string | null = null) {
  if (s.length !== FAMILY_KEY_BYTES) throw new Error('Chave inválida')
  await persist(s, pin)
  await activate(s, !!pin)
}

export function failureDelay(): number {
  const f = readJson<{ count: number; until: number }>(FAIL_KEY)
  return f ? Math.max(0, f.until - Date.now()) : 0
}

export async function unlock(pin: string): Promise<'ok' | 'wrong' | 'wait'> {
  const r = record()
  if (!r || r.mode !== 'pin') return 'wrong'
  if (failureDelay() > 0) return 'wait'
  const s = await unwrapSecret(r.wrapped, pin)
  if (!s) {
    const f = readJson<{ count: number; until: number }>(FAIL_KEY) ?? { count: 0, until: 0 }
    const count = f.count + 1
    // Após 3 erros, espera cresce exponencialmente (5s, 10s, 20s ... até 15 min).
    const wait = count >= 3 ? Math.min(15 * 60_000, 5000 * 2 ** (count - 3)) : 0
    safeSet(FAIL_KEY, JSON.stringify({ count, until: Date.now() + wait }))
    return 'wrong'
  }
  safeSet(FAIL_KEY, null)
  await activate(s, true)
  return 'ok'
}

export async function setPin(pin: string | null) {
  if (!secret) throw new Error('Cofre bloqueado')
  await persist(secret, pin)
  vault.patch({ pinProtected: !!pin })
}

export function lockNow() {
  if (!vault.get().pinProtected) return
  secret = null
  vault.set({ status: 'locked', keys: null, pinProtected: true })
}

/** Gera nova chave: todos os outros aparelhos deixam de ter acesso. */
export async function rotateFamily() {
  const pin = vault.get().pinProtected
  if (pin) throw new Error('Remova o PIN antes de gerar uma nova chave')
  await createFamily(null)
}

export function forgetDevice() {
  secret = null
  safeSet(VAULT_KEY, null)
  safeSet(FAIL_KEY, null)
  vault.set({ status: 'empty', keys: null, pinProtected: false })
}

// ---------- Pareamento ----------

export function currentSecret(): Uint8Array | null {
  return secret
}

export function appBaseUrl(): string {
  return `${location.origin}${location.pathname}`
}

/** Link de pareamento. A chave vai no fragmento (#), que nunca é enviado ao servidor. */
export function pairingLink(s: Uint8Array): string {
  return `${appBaseUrl()}#p=${toB64u(s)}`
}

/** Código digitável (Base32 Crockford em grupos de 4). */
export function pairingCode(s: Uint8Array): string {
  return toBase32(s).match(/.{1,4}/g)!.join('-')
}

/** Aceita link, fragmento ou código digitado. */
export function parsePairing(input: string): Uint8Array | null {
  const text = input.trim()
  const m = /[#&]p=([A-Za-z0-9_-]{40,})/.exec(text)
  if (m) {
    try {
      const s = fromB64u(m[1])
      return s.length === FAMILY_KEY_BYTES ? s : null
    } catch {
      return null
    }
  }
  const s = fromBase32(text)
  return s && s.length >= FAMILY_KEY_BYTES ? s.slice(0, FAMILY_KEY_BYTES) : null
}

export function sameSecret(a: Uint8Array): boolean {
  if (!secret || secret.length !== a.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a[i] ^ secret[i]
  return d === 0
}
