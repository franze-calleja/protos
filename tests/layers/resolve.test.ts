import { describe, it, expect } from 'vitest'
import { resolveLayers } from '@/generator/layers/resolve'
import type { Layer } from '@/generator/layers/types'
import type { AppSpec, LayerId } from '@/generator/config/types'

/** Stub layers keep this task testable without depending on real layers. */
const stub = (id: string, over: Partial<Layer> = {}): Layer => ({
  id: id as LayerId,
  label: id,
  description: id,
  appliesTo: ['next'],
  manifest: () => [],
  apply: () => {},
  ...over,
})

const REGISTRY: Partial<Record<LayerId, Layer>> = {
  zod: stub('zod'),
  tailwind: stub('tailwind'),
  'react-hook-form': stub('react-hook-form', { requires: ['zod'] }),
  prisma: stub('prisma', { appliesTo: ['next', 'express'] }),
  pino: stub('pino', { conflictsWith: ['helmet'] }),
  helmet: stub('helmet'),
}

const app = (layers: string[], base = 'next'): AppSpec =>
  ({ id: 'web', base, arch: 'type-based', layers, options: {} }) as AppSpec

const resolve = (a: AppSpec) => resolveLayers(a, REGISTRY)

describe('resolveLayers', () => {
  it('returns layers for a valid app', () => {
    expect(resolve(app(['tailwind'])).map((l) => l.id)).toEqual(['tailwind'])
  })

  it('orders a dependency before its dependent', () => {
    const ids = resolve(app(['react-hook-form', 'zod'])).map((l) => l.id)
    expect(ids.indexOf('zod')).toBeLessThan(ids.indexOf('react-hook-form'))
  })

  it('throws when a required layer is missing', () => {
    expect(() => resolve(app(['react-hook-form']))).toThrow(/requires "zod"/)
  })

  it('throws when a layer does not apply to the base', () => {
    expect(() => resolve(app(['tailwind'], 'expo'))).toThrow(/does not apply to base "expo"/)
  })

  it('throws on an unknown layer id rather than ignoring it', () => {
    expect(() => resolve(app(['nope']))).toThrow(/unknown layer/i)
  })

  it('throws when two selected layers conflict', () => {
    expect(() => resolve(app(['pino', 'helmet']))).toThrow(/conflicts with/)
  })

  it('is deterministic regardless of input order', () => {
    expect(resolve(app(['zod', 'tailwind'])).map((l) => l.id)).toEqual(
      resolve(app(['tailwind', 'zod'])).map((l) => l.id)
    )
  })

  it('deduplicates a repeated layer id', () => {
    expect(resolve(app(['tailwind', 'tailwind'])).map((l) => l.id)).toEqual(['tailwind'])
  })
})
