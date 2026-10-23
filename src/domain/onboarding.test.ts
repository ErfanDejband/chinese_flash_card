import { describe, expect, it } from 'vitest'
import { checklistItems, type ChecklistInput } from './onboarding'

const fresh: ChecklistInput = { ownCards: 0, reviews: 0, directionChosen: false, installed: false, safe: false }
const done = (input: ChecklistInput) => checklistItems(input).filter((i) => i.done).map((i) => i.id)

describe('getting-started checklist', () => {
  it('starts with nothing done', () => {
    expect(checklistItems(fresh).map((i) => i.id)).toEqual(['cards', 'review', 'direction', 'install', 'safe'])
    expect(done(fresh)).toEqual([])
  })

  it('needs five cards of your own', () => {
    expect(done({ ...fresh, ownCards: 4 })).toEqual([])
    expect(done({ ...fresh, ownCards: 5 })).toEqual(['cards'])
  })

  it('ticks each item from what was done', () => {
    expect(done({ ownCards: 9, reviews: 1, directionChosen: true, installed: true, safe: true })).toEqual(['cards', 'review', 'direction', 'install', 'safe'])
    expect(done({ ...fresh, reviews: 3, safe: true })).toEqual(['review', 'safe'])
  })
})
