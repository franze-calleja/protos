import { describe, it, expect } from 'vitest'
import { VERSIONS, dep } from '@/generator/versions'

describe('version registry', () => {
  it('returns a pinned version', () => {
    expect(dep('next')).toMatch(/^\^\d+\.\d+\.\d+$/)
  })

  it('throws loudly for an unpinned package rather than emitting "latest"', () => {
    expect(() => dep('not-a-real-package')).toThrow(/No pinned version/)
  })

  it('pins every entry to an exact range, never a tag', () => {
    for (const [name, version] of Object.entries(VERSIONS)) {
      // ~ is allowed: Expo-managed packages pin tighter than caret on purpose.
      expect(version, name).toMatch(/^[\^~]\d+\.\d+\.\d+$/)
    }
  })
})

describe('expo-managed versions', () => {
  it('pins react-native tighter than caret, because Expo decides it', () => {
    expect(VERSIONS['react-native']).toMatch(/^~/)
  })
})
