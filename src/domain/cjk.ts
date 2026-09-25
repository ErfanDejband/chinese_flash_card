/** Han characters (CJK unified ideographs incl. extensions and compatibility ideographs). */
const HAN = /\p{Script=Han}/u

export function containsHan(text: string): boolean {
  return HAN.test(text)
}

/** Share of non-space characters that are Han. */
export function hanRatio(text: string): number {
  const chars = [...text.replace(/\s/g, '')]
  if (!chars.length) return 0
  return chars.filter((c) => HAN.test(c)).length / chars.length
}
