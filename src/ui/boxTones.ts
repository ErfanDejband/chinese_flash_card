/** Colour identity per Leitner box. Full class strings so Tailwind can see them. */
export interface BoxTone {
  front: string
  /** Solid fill for chart marks (validated with the dataviz palette checks for the default 5 boxes). */
  fill: string
  badge: string
  text: string
}

const NEW_TONE: BoxTone = {
  front: 'from-stone-400 to-stone-500 dark:from-stone-600 dark:to-stone-700',
  fill: 'bg-stone-400 dark:bg-stone-600',
  badge: 'bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200',
  text: 'text-stone-600 dark:text-stone-300',
}

const TONES: BoxTone[] = [
  { front: 'from-rose-500 to-rose-600', fill: 'bg-rose-700 dark:bg-rose-600', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200', text: 'text-rose-600 dark:text-rose-400' },
  { front: 'from-orange-500 to-orange-600', fill: 'bg-orange-600', badge: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200', text: 'text-orange-600 dark:text-orange-400' },
  { front: 'from-amber-400 to-amber-500', fill: 'bg-amber-600', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200', text: 'text-amber-600 dark:text-amber-400' },
  { front: 'from-yellow-400 to-yellow-500', fill: 'bg-yellow-600 dark:bg-yellow-700', badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200', text: 'text-yellow-600 dark:text-yellow-400' },
  { front: 'from-lime-500 to-lime-600', fill: 'bg-lime-600', badge: 'bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-200', text: 'text-lime-600 dark:text-lime-400' },
  { front: 'from-emerald-500 to-emerald-600', fill: 'bg-emerald-600', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200', text: 'text-emerald-600 dark:text-emerald-400' },
  { front: 'from-teal-500 to-teal-600', fill: 'bg-teal-600', badge: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200', text: 'text-teal-600 dark:text-teal-400' },
  { front: 'from-sky-500 to-sky-600', fill: 'bg-sky-600', badge: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200', text: 'text-sky-600 dark:text-sky-400' },
  { front: 'from-indigo-500 to-indigo-600', fill: 'bg-indigo-500', badge: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200', text: 'text-indigo-600 dark:text-indigo-400' },
  { front: 'from-violet-500 to-violet-600', fill: 'bg-violet-500', badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200', text: 'text-violet-600 dark:text-violet-400' },
]

/** Box 0 = new-card pool. Boxes 1..count spread over the palette from red (new) to violet (mastered). */
export function boxTone(box: number, count: number): BoxTone {
  if (box <= 0) return NEW_TONE
  const i = count <= 1 ? 0 : Math.round(((Math.min(box, count) - 1) * (TONES.length - 1)) / (count - 1))
  return TONES[i]!
}

export function boxLabel(box: number): string {
  return box <= 0 ? 'New' : `Box ${box}`
}
