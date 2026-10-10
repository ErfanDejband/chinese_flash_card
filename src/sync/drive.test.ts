import { describe, expect, it, vi } from 'vitest'
import type { FetchLike } from '@/import/ai/types'
import { createDrive } from './drive'

function mockFetch(...responses: Response[]) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchImpl: FetchLike = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} })
    const next = responses.shift()
    if (!next) throw new Error('unexpected request')
    return next
  })
  return { fetchImpl, calls }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const auth = (init: RequestInit) => (init.headers as Record<string, string>).authorization

describe('Drive client', () => {
  it('lists the app folder across pages, with the token', async () => {
    const { fetchImpl, calls } = mockFetch(
      json({ files: [{ id: '1', name: 'cards.json.gz', version: '7' }], nextPageToken: 'p2' }),
      json({ files: [{ id: '2', name: 'states.json.gz', version: 3 }] }),
    )
    const files = await createDrive(() => 'TOKEN', fetchImpl).list()
    expect(files).toEqual([
      { id: '1', name: 'cards.json.gz', version: '7' },
      { id: '2', name: 'states.json.gz', version: '3' },
    ])
    const first = new URL(calls[0]!.url)
    expect(first.origin + first.pathname).toBe('https://www.googleapis.com/drive/v3/files')
    expect(first.searchParams.get('spaces')).toBe('appDataFolder')
    expect(new URL(calls[1]!.url).searchParams.get('pageToken')).toBe('p2')
    expect(auth(calls[0]!.init)).toBe('Bearer TOKEN')
  })

  it('creates files in appDataFolder with a multipart upload', async () => {
    const { fetchImpl, calls } = mockFetch(json({ id: 'new', name: 'cards.json.gz', version: '1' }))
    const saved = await createDrive(() => 'TOKEN', fetchImpl).create('cards.json.gz', new Uint8Array([1, 2, 3]))
    expect(saved).toEqual({ id: 'new', name: 'cards.json.gz', version: '1' })
    const { url, init } = calls[0]!
    expect(url).toContain('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart')
    const type = (init.headers as Record<string, string>)['content-type']!
    expect(type).toMatch(/^multipart\/related; boundary=/)
    const body = new Uint8Array(await new Response(init.body).arrayBuffer())
    const text = new TextDecoder().decode(body)
    expect(text).toContain('{"name":"cards.json.gz","parents":["appDataFolder"]}')
    expect(text).toContain(`--${type.split('boundary=')[1]}--`)
  })

  it('updates file content and downloads bytes', async () => {
    const { fetchImpl, calls } = mockFetch(json({ id: 'f', name: 'x', version: '2' }), new Response(new Uint8Array([9, 8])))
    const drive = createDrive(() => 'TOKEN', fetchImpl)
    expect(await drive.update('f', new Uint8Array([5]))).toEqual({ id: 'f', name: 'x', version: '2' })
    expect(calls[0]!.init.method).toBe('PATCH')
    expect(calls[0]!.url).toContain('/upload/drive/v3/files/f?uploadType=media')
    expect([...(await drive.download('f'))]).toEqual([9, 8])
    expect(calls[1]!.url).toBe('https://www.googleapis.com/drive/v3/files/f?alt=media')
  })

  it('maps errors: expired token, rate limits, offline, no token', async () => {
    const { fetchImpl } = mockFetch(
      json({ error: { message: 'Invalid Credentials' } }, 401),
      json({ error: { message: 'Rate Limit Exceeded', errors: [{ reason: 'userRateLimitExceeded' }] } }, 403),
    )
    const drive = createDrive(() => 'TOKEN', fetchImpl)
    await expect(drive.list()).rejects.toMatchObject({ kind: 'auth', status: 401 })
    await expect(drive.list()).rejects.toMatchObject({ kind: 'rate-limit' })
    const offline = createDrive(() => 'TOKEN', async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(offline.list()).rejects.toMatchObject({ kind: 'network' })
    await expect(createDrive(() => undefined, fetchImpl).list()).rejects.toMatchObject({ kind: 'auth' })
  })
})
