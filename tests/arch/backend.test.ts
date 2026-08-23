import { describe, it, expect } from 'vitest'
import { getArchitecture } from '@/generator/arch'

describe('layered architecture', () => {
  const arch = getArchitecture('layered')

  it('groups files by technical role', () => {
    expect(arch.path('route', 'health')).toBe('src/routes/health.route.ts')
    expect(arch.path('controller', 'health')).toBe('src/controllers/health.controller.ts')
    expect(arch.path('service', 'health')).toBe('src/services/health.service.ts')
    expect(arch.path('model', 'user')).toBe('src/models/user.model.ts')
  })

  it('keeps shared infrastructure in lib', () => {
    expect(arch.path('db-client')).toBe('src/lib/db.ts')
    expect(arch.path('util', 'logger')).toBe('src/lib/logger.ts')
  })

  it('has no home for frontend roles', () => {
    expect(arch.supports('component')).toBe(false)
    expect(() => arch.path('component', 'Hello')).toThrow(/not supported/i)
  })
})

describe('modular architecture', () => {
  const arch = getArchitecture('modular')

  it("groups a feature's files together under one module folder", () => {
    expect(arch.path('route', 'health')).toBe('src/modules/health/health.route.ts')
    expect(arch.path('controller', 'health')).toBe('src/modules/health/health.controller.ts')
    expect(arch.path('service', 'health')).toBe('src/modules/health/health.service.ts')
  })

  it('kebab-cases a multi-word module folder', () => {
    expect(arch.path('route', 'userProfile')).toBe(
      'src/modules/user-profile/userProfile.route.ts'
    )
  })

  it('puts shared infrastructure in shared, not lib', () => {
    expect(arch.path('db-client')).toBe('src/shared/db.ts')
    expect(arch.path('util', 'logger')).toBe('src/shared/logger.ts')
  })

  it('has no home for frontend roles either', () => {
    expect(() => arch.path('store', 'counter')).toThrow(/not supported/i)
  })
})

describe('the two backend architectures differ where it matters', () => {
  it('places a service differently', () => {
    expect(getArchitecture('layered').path('service', 'health')).not.toBe(
      getArchitecture('modular').path('service', 'health')
    )
  })

  it('places the db client differently, unlike the frontend pair', () => {
    expect(getArchitecture('layered').path('db-client')).not.toBe(
      getArchitecture('modular').path('db-client')
    )
  })
})
