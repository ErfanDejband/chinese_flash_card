/** Ways to support the app, shown in Settings → "Support this app". */
export const REPO_URL = 'https://github.com/ErfanDejband/chinese_flash_card'

export interface SupportLink {
  id: 'ko-fi' | 'github-sponsors' | 'custom'
  label: string
  url: string
  /** Small line under the label, e.g. "One-off tip". */
  note: string
}

/**
 * Donation links. An entry stays hidden while its `url` is empty and appears once it holds an https link:
 * - Ko-fi: `https://ko-fi.com/<name>`
 * - GitHub Sponsors: `https://github.com/sponsors/ErfanDejband` once the profile is approved
 * - custom: a Stripe Payment Link (`https://buy.stripe.com/…`) or `https://revolut.me/<name>`; adjust its label and note to match
 */
export const SUPPORT_LINKS: SupportLink[] = [
  { id: 'ko-fi', label: 'Buy me a coffee on Ko-fi', url: '', note: 'One-off tip' },
  { id: 'github-sponsors', label: 'Sponsor on GitHub', url: '', note: 'One-off or monthly' },
  { id: 'custom', label: 'Donate', url: '', note: 'Card or bank transfer' },
]

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname !== '' && value === value.trim()
  } catch {
    return false
  }
}

/** The donation links that are filled in (https only), in their listed order. */
export function activeSupportLinks(links: readonly SupportLink[] = SUPPORT_LINKS): SupportLink[] {
  return links.filter((link) => isHttpsUrl(link.url))
}
