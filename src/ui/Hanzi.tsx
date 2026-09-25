import type { HTMLAttributes } from 'react'

/** Chinese text: tagged zh-Hant so the Traditional glyph variants and CJK font are used. */
export function Hanzi(props: HTMLAttributes<HTMLSpanElement>) {
  return <span lang="zh-Hant" {...props} />
}
