/**
 * Characters that OpenCC maps Simplified → Traditional but that are also correct in Taiwan
 * Traditional (台灣, 皇后, 公里, 游泳, 干擾…). Without this list they would be flagged.
 */
const DUAL_USE = new Set([...'台后里丑伙游征准岩几干面余谷松斗范卷克困蒙朴曲舍于郁致制朱表出借折秋涂向周注才了只系占'])

let detector: Promise<(text: string) => boolean> | undefined

/**
 * Detects text containing Simplified-only characters: keys of OpenCC's Simplified→Traditional
 * character table that are never Traditional forms themselves (not keys of the
 * Traditional→Simplified table), minus DUAL_USE. Uses only the two small character tables.
 */
export function loadSimplifiedDetector(): Promise<(text: string) => boolean> {
  detector ??= Promise.all([import('opencc-js/dict/STCharacters'), import('opencc-js/dict/TSCharacters')]).then(([st, ts]) => {
    const keys = (dict: string) => new Set(dict.split('|').map((entry) => entry.split(' ')[0]))
    const simplified = keys(st.default)
    const traditional = keys(ts.default)
    return (text: string) => [...text].some((c) => simplified.has(c) && !traditional.has(c) && !DUAL_USE.has(c))
  })
  return detector
}

let converter: Promise<(text: string) => string> | undefined

/** Full phrase-aware Simplified → Taiwan Traditional conversion (≈1 MB), loaded only when the user asks for it. */
export function loadToTraditional(): Promise<(text: string) => string> {
  converter ??= import('opencc-js/cn2t').then((m) => m.Converter({ from: 'cn', to: 'tw' }))
  return converter
}
