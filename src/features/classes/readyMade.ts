/**
 * Classes anyone can join from the Join page, shared from the app's own Google account
 * (mandarin.leitner.app), so their teacher's "Publish changes" reach everyone without an app update.
 * `id` is the class link's id (`…#/join/<id>`).
 */
export interface ReadyMadeClass {
  id: string
  title: string
  /** One line: what's in it. */
  note: string
}

export const READY_MADE_CLASSES: readonly ReadyMadeClass[] = [
  {
    id: '1ofB1iQ5lLeIKHRi74fFDE5uApU_2Xnmh',
    title: 'Beginner Mandarin Course (Term II)',
    note: '6 lessons · about 320 words, Traditional characters with pinyin',
  },
]
