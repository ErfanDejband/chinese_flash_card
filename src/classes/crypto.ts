/**
 * The optional class password. PBKDF2-SHA-256 turns it into a 256-bit AES-GCM key; every
 * encrypted part is `iv (12 bytes) + ciphertext`. A wrong password fails the GCM check.
 */
export const PBKDF2_ITERATIONS = 310_000

export function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export function fromBase64(text: string): Uint8Array {
  const s = atob(text)
  const bytes = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i)
  return bytes
}

export const randomSalt = () => toBase64(crypto.getRandomValues(new Uint8Array(16)))

/** The key bytes (base64) for a password, salt and iteration count. */
export async function deriveKey(password: string, salt: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(salt) as Uint8Array<ArrayBuffer>, iterations }, base, 256)
  return toBase64(new Uint8Array(bits))
}

const aesKey = (key: string, use: KeyUsage) => crypto.subtle.importKey('raw', fromBase64(key) as Uint8Array<ArrayBuffer>, 'AES-GCM', false, [use])

export async function seal(data: Uint8Array, key: string): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(key, 'encrypt'), data as Uint8Array<ArrayBuffer>))
  const out = new Uint8Array(iv.length + ct.length)
  out.set(iv)
  out.set(ct, iv.length)
  return out
}

/** Throws when the key is wrong or the data was changed. */
export async function unseal(data: Uint8Array, key: string): Promise<Uint8Array> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.subarray(0, 12) as Uint8Array<ArrayBuffer> }, await aesKey(key, 'decrypt'), data.subarray(12) as Uint8Array<ArrayBuffer>)
  return new Uint8Array(plain)
}
