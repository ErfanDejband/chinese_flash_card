import { ProviderError } from '@/import/ai/types'

/** Decode base64 image data (no data: prefix) into a Blob. */
export function base64ToBlob(b64: string, mime: string): Blob {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/** `data:image/png;base64,....` or bare base64. */
export function dataToBlob(data: string, fallbackMime = 'image/png'): Blob {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(data)
  return m ? base64ToBlob(m[2]!, m[1]!) : base64ToBlob(data, fallbackMime)
}

export function noImage(service: string, detail = ''): ProviderError {
  return new ProviderError('bad-response', `${service} returned no picture${detail ? ` (${detail})` : ''}.`)
}
