import type { FetchLike } from '@/import/ai/types'
import { SyncError, type DriveLike, type RemoteFile } from './types'

/**
 * Google Drive REST v3, limited to the app's hidden `appDataFolder` (scope `drive.appdata`:
 * the app cannot see any other file in the user's Drive).
 */
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const FIELDS = 'id,name,version'

const defaultFetch: FetchLike = (input, init) => fetch(input, init)

async function errorFrom(res: Response): Promise<SyncError> {
  let message = `${res.status} ${res.statusText}`.trim()
  let reason = ''
  try {
    const body = (await res.json()) as { error?: { message?: string; errors?: { reason?: string }[] } }
    message = body.error?.message || message
    reason = body.error?.errors?.[0]?.reason ?? ''
  } catch {
    // Not JSON: keep the status text.
  }
  if (res.status === 401) return new SyncError('auth', 'The Google sign-in has expired.', 401)
  // 403 rateLimitExceeded / userRateLimitExceeded are rate limits too.
  if (res.status === 429 || /ratelimitexceeded/i.test(reason)) return new SyncError('rate-limit', `Google Drive is busy: ${message}`, res.status)
  if (res.status >= 500) return new SyncError('server', `Google Drive had a problem: ${message}`, res.status)
  return new SyncError('other', `Google Drive: ${message}`, res.status)
}

export function createDrive(getToken: () => string | undefined, fetchImpl: FetchLike = defaultFetch): DriveLike {
  async function call(url: string, init: RequestInit = {}): Promise<Response> {
    const token = getToken()
    if (!token) throw new SyncError('auth', 'Sign in to Google to sync.')
    let res: Response
    try {
      res = await fetchImpl(url, { ...init, headers: { ...init.headers, authorization: `Bearer ${token}` } })
    } catch {
      throw new SyncError('network', 'Could not reach Google Drive (offline?).')
    }
    if (!res.ok) throw await errorFrom(res)
    return res
  }

  const asFile = (f: { id?: string; name?: string; version?: string | number }): RemoteFile => ({
    id: String(f.id),
    name: String(f.name),
    version: String(f.version),
  })

  return {
    async list() {
      const files: RemoteFile[] = []
      let pageToken = ''
      do {
        const params = new URLSearchParams({ spaces: 'appDataFolder', fields: `nextPageToken,files(${FIELDS})`, pageSize: '1000' })
        if (pageToken) params.set('pageToken', pageToken)
        const body = (await (await call(`${API}/files?${params}`)).json()) as { files?: RemoteFile[]; nextPageToken?: string }
        files.push(...(body.files ?? []).map(asFile))
        pageToken = body.nextPageToken ?? ''
      } while (pageToken)
      return files
    },

    async download(id) {
      const res = await call(`${API}/files/${encodeURIComponent(id)}?alt=media`)
      return new Uint8Array(await res.arrayBuffer())
    },

    async create(name, data) {
      const boundary = `mandarin-leitner-${Math.random().toString(36).slice(2)}`
      const meta = JSON.stringify({ name, parents: ['appDataFolder'] })
      const body = new Blob([
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
        `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
        data as Uint8Array<ArrayBuffer>,
        `\r\n--${boundary}--`,
      ])
      const res = await call(`${UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`, {
        method: 'POST',
        headers: { 'content-type': `multipart/related; boundary=${boundary}` },
        body,
      })
      return asFile(await res.json())
    },

    async update(id, data) {
      const res = await call(`${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media&fields=${FIELDS}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/octet-stream' },
        body: data as Uint8Array<ArrayBuffer>,
      })
      return asFile(await res.json())
    },
  }
}
