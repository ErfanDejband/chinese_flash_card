import type { Example } from '@/domain/types'
import { cn } from './cn'
import { Hanzi } from './Hanzi'

/** The sentence a word was learned from, with the word highlighted, its pinyin and translation. */
export function ExampleSentence({ example, word, className }: { example: Example; word: string; className?: string }) {
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
      {example.pinyin && <p className="text-sm text-muted">{example.pinyin}</p>}
      {example.meaning && <p className="text-sm text-muted italic">{example.meaning}</p>}
    </div>
  )
}
