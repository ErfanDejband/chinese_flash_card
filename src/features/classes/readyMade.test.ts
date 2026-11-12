import { describe, expect, it } from 'vitest'
import { classIdFrom } from '@/lib/classConfig'
import { READY_MADE_CLASSES } from './readyMade'

describe('ready-made classes', () => {
  it('have class ids the join page accepts, once each', () => {
    for (const c of READY_MADE_CLASSES) {
      expect(classIdFrom(c.id)).toBe(c.id)
      expect(c.title.trim()).not.toBe('')
    }
    expect(new Set(READY_MADE_CLASSES.map((c) => c.id)).size).toBe(READY_MADE_CLASSES.length)
  })
})
