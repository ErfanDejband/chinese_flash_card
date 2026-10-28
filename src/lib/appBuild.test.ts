import { describe, expect, it } from 'vitest'
import { appBuild, versionLabel } from './appBuild'

describe('app build', () => {
  it('comes from the build (vite.config.ts define)', () => {
    const build = appBuild()
    expect(build.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(build.sha).toMatch(/^([0-9a-f]{7,}|dev)$/)
  })

  it('reads as date · commit', () => {
    expect(versionLabel({ date: '2026-10-28', sha: 'abc1234' })).toBe('2026-10-28 · abc1234')
  })
})
