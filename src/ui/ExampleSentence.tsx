import type { Example } from '@/domain/types'
import type { ReadingPref } from '@/lib/readingPref'
import { cn } from './cn'
import { Hanzi } from './Hanzi'
import { Reading } from './Reading'

/** The sentence a word was learned from, with the word highlighted, its reading and translation. */
export function ExampleSentence({ example, word, reading, className }: { example: Example; word: string; reading?: ReadingPref; className?: string }) {
  const pieces = word ? example.hanzi.split(word) : [example.hanzi]
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <Hanzi className="text-lg leading-snug">
        {pieces.map((piece, i) => (
          <span key={i}>
            {i > 0 && <span className="font-semibold text-accent">{word}</span>}
            {piece}
          </span>
        ))}
      </Hanzi>
      {example.pinyin && <Reading pinyin={example.pinyin} hanzi={example.hanzi} show={reading} className="block text-sm text-muted" />}
      {example.meaning && <p className="text-sm text-muted italic">{example.meaning}</p>}
    </div>
  )
}
