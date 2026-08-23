import { describe, it, expect } from 'vitest'
import { classify, majorOf, shouldFail, HELD_BACK } from '@/version-check'

describe('majorOf', () => {
  it('reads the major out of a caret range', () => {
    expect(majorOf('^16.3.2')).toBe(16)
  })

  it('reads a bare version', () => {
    expect(majorOf('7.9.1')).toBe(7)
  })

  it('returns null for something unparseable', () => {
    expect(majorOf('latest')).toBeNull()
  })
})

describe('classify', () => {
  it('reports current when the pin matches the registry', () => {
    expect(classify('next', '^16.3.2', '16.3.2')).toBe('current')
  })

  it('reports a minor gap as behind-minor, which caret ranges absorb anyway', () => {
    expect(classify('next', '^16.3.2', '16.4.0')).toBe('behind-minor')
  })

  it('reports a new major as behind-major', () => {
    expect(classify('next', '^16.3.2', '17.0.0')).toBe('behind-major')
  })

  it('reports a deliberately held-back package as held-back, not a failure', () => {
    expect(classify('typescript', '^5.9.3', '7.0.2')).toBe('held-back')
  })

  it('every held-back entry carries a reason', () => {
    for (const [pkg, reason] of Object.entries(HELD_BACK)) {
      expect(reason.length, pkg).toBeGreaterThan(20)
    }
  })
})

describe('shouldFail', () => {
  it('fails on an unplanned major gap', () => {
    expect(shouldFail([{ drift: 'behind-major' }])).toBe(true)
  })

  it('does not fail on deliberate hold-backs or minor drift', () => {
    expect(shouldFail([{ drift: 'held-back' }, { drift: 'behind-minor' }, { drift: 'current' }])).toBe(
      false
    )
  })
})
