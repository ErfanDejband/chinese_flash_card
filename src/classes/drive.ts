import type { FetchLike } from '@/import/ai/types'
import { DRIVE_TIMEOUT_MS } from '@/sync/drive'
import { ClassError } from './format'

/**
 * Google Drive for classes. The teacher's side writes with the `drive.file` scope (the app sees
 * only files it created) into a folder in their My Drive and shares each file with anyone who
 * has the link. Students read those files with the app's public API key, no sign-in.
 */
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

const defaultFetch: FetchLike = (input, init) => fetch(input, init)

/** The few calls publishing needs (an in-memory one stands in for it in tests). */
export interface ClassDrive {
  createFolder(name: string): Promise<string>
  create(name: string, data: Uint8Array, parent: string): Promise<string>
  update(id: string, data: Uint8Array): Promise<void>
  /** Anyone with the link can read the file. */
  share(id: string): Promise<void>
  /** Gone already is fine. */
  remove(id: string): Promise<void>
}

/** Reads a shared file without signing in. */
export type PublicRead = (id: string) => Promise<Uint8Array>

async function errorFrom(res: Response, sharing = false): Promise<ClassError> {
  let message = `${res.status} ${res.statusText}`.trim()
  let reason = ''
  try {
    const body = (await res.json()) as { error?: { message?: string; errors?: { reason?: string }[] } }
    message = body.error?.message || message
    reason = body.error?.errors?.[0]?.reason ?? ''
  } catch {
    // Not JSON: keep the status text.
  }
  if (res.status === 401) return new ClassError('auth', 'The Google sign-in has expired.', 401)
  if (res.status === 429 || /ratelimitexceeded/i.test(reason)) return new ClassError('rate-limit', `Google Drive is busy: ${message}`, res.status)
  if (res.status === 404) return new ClassError('not-found', 'The class file is gone.', 404)
  if (sharing && res.status === 403) {
    return new ClassError('sharing-blocked', 'This Google account may not share files by link (school accounts often can’t). Try a personal Gmail, or send a class file.', 403)
  }
  return new ClassError('other', `Google Drive: ${message}`, res.status)
}

const timedOut = (e: unknown) => e instanceof Error && e.name === 'TimeoutError'

async function send(fetchImpl: FetchLike, url: string, init: RequestInit, timeoutMs: number, sharing = false): Promise<Response> {
  let res: Response
  try {
    res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  } catch (e) {
    throw new ClassError('network', timedOut(e) ? 'Google Drive took too long to answer.' : 'Could not reach Google Drive (offline?).')
  }
  if (!res.ok) throw await errorFrom(res, sharing)
  return res
}

async function body<T>(read: Promise<T>): Promise<T> {
  try {
    return await read
  } catch (e) {
    throw new ClassError('network', timedOut(e) ? 'Google Drive took too long to answer.' : 'The connection to Google Drive broke off.')
  }
}

export function createClassDrive(getToken: () => string | undefined, fetchImpl: FetchLike = defaultFetch, timeoutMs = DRIVE_TIMEOUT_MS): ClassDrive {
  const call = (url: string, init: RequestInit = {}, sharing = false) => {
    const token = getToken()
    if (!token) throw new ClassError('auth', 'Sign in to Google to share the class.')
    return send(fetchImpl, url, { ...init, headers: { ...init.headers, authorization: `Bearer ${token}` } }, timeoutMs, sharing)
  }

  async function create(meta: Record<string, unknown>, data?: Uint8Array): Promise<string> {
    if (!data) {
      const res = await call(`${API}/files?fields=id`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(meta) })
      return String(((await body(res.json())) as { id: string }).id)
    }
    const boundary = `mandarin-leitner-${Math.random().toString(36).slice(2)}`
    const payload = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
      data as Uint8Array<ArrayBuffer>,
      `\r\n--${boundary}--`,
    ])
    const res = await call(`${UPLOAD}/files?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'content-type': `multipart/related; boundary=${boundary}` }, body: payload })
    return String(((await body(res.json())) as { id: string }).id)
  }

  return {
    createFolder: (name) => create({ name, mimeType: 'application/vnd.google-apps.folder' }),
    create: (name, data, parent) => create({ name, parents: [parent] }, data),
    async update(id, data) {
      await call(`${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media&fields=id`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/octet-stream' },
        body: data as Uint8Array<ArrayBuffer>,
      })
    },
    async share(id) {
      await call(
        `${API}/files/${encodeURIComponent(id)}/permissions?fields=id`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'anyone', role: 'reader' }) },
        true,
      )
    },
    async remove(id) {
      try {
        await call(`${API}/files/${encodeURIComponent(id)}`, { method: 'DELETE' })
      } catch (e) {
        if (!(e instanceof ClassError && e.kind === 'not-found')) throw e
      }
    },
  }
}

/** Reads shared class files with the app's public key; the browser sends the page's address, which the key is limited to. */
export function createPublicRead(apiKey: string, fetchImpl: FetchLike = defaultFetch, timeoutMs = DRIVE_TIMEOUT_MS): PublicRead {
  return async (id) => {
    try {
      const res = await send(fetchImpl, `${API}/files/${encodeURIComponent(id)}?alt=media&key=${encodeURIComponent(apiKey)}`, {}, timeoutMs)
      return new Uint8Array(await body(res.arrayBuffer()))
    } catch (e) {
      // A file that isn't shared (any more) answers 403 or 404: the class is gone for the student.
      if (e instanceof ClassError && (e.kind === 'not-found' || e.status === 403)) throw new ClassError('not-found', 'This class isn’t shared any more, or the link is wrong.', e.status)
      throw e
    }
  }
}
