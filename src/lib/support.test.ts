import { describe, expect, it } from 'vitest'
import { activeSupportLinks, SUPPORT_LINKS, type SupportLink } from './support'

const link = (id: SupportLink['id'], url: string): SupportLink => ({ id, label: id, url, note: '' })

describe('activeSupportLinks', () => {
  it('shows no donation link while none is filled in', () => {
    expect(activeSupportLinks([link('ko-fi', ''), link('github-sponsors', ''), link('custom', '')])).toEqual([])
    expect(activeSupportLinks([])).toEqual([])
  })

  it('returns the filled-in links in their listed order', () => {
    const links = [link('ko-fi', 'https://ko-fi.com/someone'), link('github-sponsors', ''), link('custom', 'https://buy.stripe.com/test_123')]
    expect(activeSupportLinks(links).map((l) => l.id)).toEqual(['ko-fi', 'custom'])
  })

  it('ignores blank, non-https and malformed URLs', () => {
    const links = [
      link('ko-fi', '   '),
      link('ko-fi', 'http://ko-fi.com/someone'),
      link('ko-fi', 'javascript:alert(1)'),
      link('ko-fi', 'ko-fi.com/someone'),
      link('ko-fi', 'https://'),
      link('ko-fi', ' https://ko-fi.com/someone'),
    ]
    expect(activeSupportLinks(links)).toEqual([])
  })

  it('has no shipped link that is filled in but would stay hidden', () => {
    expect(new Set(SUPPORT_LINKS.map((l) => l.id)).size).toBe(SUPPORT_LINKS.length)
    for (const l of SUPPORT_LINKS) if (l.url !== '') expect(activeSupportLinks([l])).toEqual([l])
  })
})
