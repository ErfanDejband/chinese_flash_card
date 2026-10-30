import { describe, expect, it } from 'vitest'
import type { ReviewLogEntry } from '../types'
import { canonicalJson, contentHash, mergeLog, mergeTombstones, mergeVersioned, preferLocal } from './merge'

const row = (id: string, updatedAt: number, value = 'x') => ({ id, updatedAt, value })
const log = (id: string, at = 1): ReviewLogEntry => ({ id, cardId: 'c', mode: 'image_to_word', at, result: 'knew', fromBox: 1, toBox: 2 })

describe('canonicalJson / contentHash', () => {
  it('ignores key order', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 1, e: 0 }] } })).toBe('{"a":{"c":[3,{"e":0,"f":1}],"d":2},"b":1}')
    expect(contentHash(canonicalJson({ a: 1, b: 2 }))).toBe(contentHash(canonicalJson({ b: 2, a: 1 })))
    expect(contentHash('a')).not.toBe(contentHash('b'))
  })
})

describe('mergeVersioned', () => {
  it('keeps the newer row and reports what changes locally', () => {
    const local = [row('a', 5, 'mine'), row('b', 9, 'mine')]
    const remote = [row('a', 7, 'theirs'), row('b', 3, 'theirs'), row('c', 1, 'new')]
    const { merged, localUpdates } = mergeVersioned(local, remote)
    expect(merged).toEqual([row('a', 7, 'theirs'), row('b', 9, 'mine'), row('c', 1, 'new')])
    expect(localUpdates).toEqual([row('a', 7, 'theirs'), row('c', 1, 'new')])
  })

  it('converges on ties, whichever device merges', () => {
    const x = row('a', 5, 'apple')
    const y = row('a', 5, 'pear')
    expect(mergeVersioned([x], [y]).merged).toEqual(mergeVersioned([y], [x]).merged)
  })

  it('is idempotent and sorted', () => {
    const rows = [row('b', 1), row('a', 2)]
    const once = mergeVersioned(rows, rows)
    expect(once.localUpdates).toEqual([])
    expect(once.merged.map((r) => r.id)).toEqual(['a', 'b'])
  })
})

describe('preferLocal', () => {
  it('keeps this device’s rows, stamped newer where the other copy differs, and retires the rest', () => {
    const local = [row('a', 5, 'mine'), row('b', 1, 'mine'), row('c', 3, 'same')]
    const remote = [row('a', 9, 'theirs'), row('b', 4, 'theirs'), row('c', 3, 'same'), row('d', 2, 'theirs')]
    const r = preferLocal(local, remote, (x) => ({ ...x, value: 'retired', updatedAt: x.updatedAt + 1 }))
    expect(r.merged).toEqual([row('a', 10, 'mine'), row('b', 5, 'mine'), row('c', 3, 'same'), row('d', 3, 'retired')])
    expect(r.localUpdates.map((x) => x.id)).toEqual(['a', 'b', 'd'])
    // Whoever merges later keeps this device's rows.
    expect(mergeVersioned(remote, r.merged).merged).toEqual(r.merged)
  })

  it('leaves a newer local row alone', () => {
    const r = preferLocal([row('a', 9, 'mine')], [row('a', 5, 'theirs')], (x) => x)
    expect(r).toEqual({ merged: [row('a', 9, 'mine')], localUpdates: [] })
  })
})

describe('mergeTombstones', () => {
  it('unions, keeping the earliest deletion', () => {
    const { merged, localUpdates } = mergeTombstones([{ id: 'x', deletedAt: 9 }], [{ id: 'x', deletedAt: 4 }, { id: 'y', deletedAt: 2 }])
    expect(merged).toEqual([{ id: 'x', deletedAt: 4 }, { id: 'y', deletedAt: 2 }])
    expect(localUpdates).toHaveLength(2)
  })
})

describe('mergeLog', () => {
  it('unions entries and drops deleted ones on both sides', () => {
    const local = [log('a'), log('b'), log('undone-here')]
    const remote = [log('a'), log('c'), log('undone-there')]
    const { merged, localAdds, localDeletes } = mergeLog(local, remote, new Set(['undone-here', 'undone-there']))
    expect(merged.map((e) => e.id)).toEqual(['a', 'b', 'c'])
    expect(localAdds.map((e) => e.id)).toEqual(['c'])
    expect(localDeletes).toEqual(['undone-here'])
  })
})
