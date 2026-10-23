/** The getting-started checklist on Home: each item ticks itself from what the learner did. */
export type ChecklistId = 'cards' | 'review' | 'direction' | 'install' | 'safe'

/** Cards of their own (sample cards don't count) for the first item. */
export const CHECKLIST_CARDS = 5

export interface ChecklistInput {
  ownCards: number
  reviews: number
  directionChosen: boolean
  installed: boolean
  /** Sync is on, or a backup was saved. */
  safe: boolean
}

export interface ChecklistItem {
  id: ChecklistId
  done: boolean
}

export function checklistItems(input: ChecklistInput): ChecklistItem[] {
  return [
    { id: 'cards', done: input.ownCards >= CHECKLIST_CARDS },
    { id: 'review', done: input.reviews > 0 },
    { id: 'direction', done: input.directionChosen },
    { id: 'install', done: input.installed },
    { id: 'safe', done: input.safe },
  ]
}
