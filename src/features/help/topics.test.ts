import { describe, expect, it } from 'vitest'
import { HELP_TOPICS, matchesHelp } from './topics'

describe('help topics', () => {
  it('have unique ids', () => {
    expect(new Set(HELP_TOPICS.map((t) => t.id)).size).toBe(HELP_TOPICS.length)
  })

  it('link to app routes or static pages only', () => {
    for (const link of HELP_TOPICS.flatMap((t) => t.links ?? [])) {
      expect(Boolean(link.to?.startsWith('/')) !== Boolean(link.page?.endsWith('.html'))).toBe(true)
    }
  })

  const ids = (query: string) => HELP_TOPICS.filter((t) => matchesHelp(t, query)).map((t) => t.id)

  it('finds topics by title, keywords and text, ignoring case', () => {
    expect(ids('Google Drive')).toContain('sync')
    expect(ids('openrouter')).toEqual(expect.arrayContaining(['ai']))
    expect(ids('tapped the wrong')).toEqual(['routine'])
  })

  it('needs every word of the query', () => {
    expect(ids('backup zip')).toEqual(['backup'])
    expect(ids('zip nonsenseword')).toEqual([])
  })

  it('shows everything for an empty query', () => {
    expect(ids('  ')).toHaveLength(HELP_TOPICS.length)
  })
})
