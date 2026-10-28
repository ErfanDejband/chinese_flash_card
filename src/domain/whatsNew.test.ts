import { describe, expect, it } from 'vitest'
import { unseenReleases } from './whatsNew'

const releases = [{ id: '2026-10-28' }, { id: '2026-10-23' }, { id: '2026-10-22' }, { id: '2026-10-20' }, { id: '2026-10-11' }]
const ids = (list: { id: string }[]) => list.map((r) => r.id)

describe('unseenReleases', () => {
  it('returns the releases after the last one seen, newest first', () => {
    expect(ids(unseenReleases(releases, '2026-10-20'))).toEqual(['2026-10-28', '2026-10-23', '2026-10-22'])
  })

  it('returns nothing when the newest was seen', () => {
    expect(unseenReleases(releases, '2026-10-28')).toEqual([])
    expect(unseenReleases(releases, '2027-01-01')).toEqual([])
  })

  it('keeps at most `max`, the newest ones', () => {
    expect(ids(unseenReleases(releases, ''))).toEqual(['2026-10-28', '2026-10-23', '2026-10-22'])
    expect(ids(unseenReleases(releases, '', 1))).toEqual(['2026-10-28'])
    expect(unseenReleases(releases, '', 0)).toEqual([])
  })

  it('sorts input in any order without changing it', () => {
    const shuffled = [releases[3]!, releases[0]!, releases[4]!, releases[1]!]
    expect(ids(unseenReleases(shuffled, '2026-10-11', 5))).toEqual(['2026-10-28', '2026-10-23', '2026-10-20'])
    expect(ids(shuffled)).toEqual(['2026-10-20', '2026-10-28', '2026-10-11', '2026-10-23'])
  })

  it('returns the original objects', () => {
    const list = [{ id: '2026-10-28', title: 'x' }]
    expect(unseenReleases(list, '')[0]).toBe(list[0])
  })
})
