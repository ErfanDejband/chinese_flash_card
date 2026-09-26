/** "1-5, 8, 10-12" → sorted unique pages within 1..max. Invalid parts are ignored. */
export function parsePageRanges(text: string, max: number): number[] {
  const pages = new Set<number>()
  for (const part of text.split(/[,\s]+/)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim())
    if (!m) continue
    const a = Number(m[1])
    const b = m[2] ? Number(m[2]) : a
    for (let p = Math.max(1, Math.min(a, b)); p <= Math.min(max, Math.max(a, b)); p++) pages.add(p)
  }
  return [...pages].sort((x, y) => x - y)
}

/** Sorted pages → compact text, e.g. [1,2,3,5] → "1-3, 5". */
export function formatPageRanges(pages: number[]): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b)
  const parts: string[] = []
  for (let i = 0; i < sorted.length; ) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++
    parts.push(i === j ? `${sorted[i]}` : `${sorted[i]}-${sorted[j]}`)
    i = j + 1
  }
  return parts.join(', ')
}
