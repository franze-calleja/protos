import { describe, it, expect } from 'vitest'
import { getArchitecture } from '@/generator/arch'

describe('type-based architecture', () => {
  const arch = getArchitecture('type-based')

  it('groups components by kind', () => {
    expect(arch.path('component', 'Hello')).toBe('src/components/Hello.tsx')
  })

  it('groups stores by kind', () => {
    expect(arch.path('store', 'counter')).toBe('src/store/counter.ts')
  })

  it('keeps shared infrastructure in lib', () => {
    expect(arch.path('db-client')).toBe('src/lib/db.ts')
  })

  it('reports which roles it supports', () => {
    expect(arch.supports('component')).toBe(true)
    expect(arch.supports('controller')).toBe(false)
  })

  it('throws on a role it does not support rather than inventing a path', () => {
    expect(() => arch.path('controller', 'User')).toThrow(/not supported/i)
  })
})

describe('feature-based architecture', () => {
  const arch = getArchitecture('feature-based')

  it('groups a component under its own feature folder', () => {
    expect(arch.path('component', 'Hello')).toBe('src/features/hello/Hello.tsx')
  })

  it('puts a feature store beside its feature', () => {
    expect(arch.path('store', 'Counter')).toBe('src/features/counter/store.ts')
  })

  it('still keeps shared infrastructure in lib', () => {
    expect(arch.path('db-client')).toBe('src/lib/db.ts')
  })

  it('kebab-cases a multi-word feature folder', () => {
    expect(arch.path('component', 'UserProfile')).toBe(
      'src/features/user-profile/UserProfile.tsx'
    )
  })
})

describe('the two architectures differ where it matters', () => {
  it('places components differently', () => {
    expect(getArchitecture('type-based').path('component', 'Hello')).not.toBe(
      getArchitecture('feature-based').path('component', 'Hello')
    )
  })

  it('places shared infrastructure identically', () => {
    expect(getArchitecture('type-based').path('db-client')).toBe(
      getArchitecture('feature-based').path('db-client')
    )
  })
})

describe('getArchitecture', () => {
  it('returns each implemented architecture', () => {
    for (const id of ['type-based', 'feature-based', 'layered', 'modular'] as const) {
      expect(getArchitecture(id).id).toBe(id)
    }
  })

  it('rejects an unknown architecture', () => {
    // @ts-expect-error deliberately invalid id
    expect(() => getArchitecture('hexagonal')).toThrow(/not implemented/i)
  })
})
