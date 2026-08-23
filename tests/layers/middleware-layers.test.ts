import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'
import { helmetLayer } from '@/generator/layers/helmet'
import { rateLimitLayer } from '@/generator/layers/rate-limit'
import { getPackageManager } from '@/generator/pm'
import { getArchitecture } from '@/generator/arch'
import { expressBase } from '@/generator/bases/express'
import type { LayerCtx } from '@/generator/layers/types'

const ctx: LayerCtx = {
  app: { id: 'api', base: 'express', arch: 'layered', layers: [], options: {} },
  project: { name: 'hrims', layout: 'siblings' },
  pm: getPackageManager('npm'),
  arch: getArchitecture('layered'),
  specifier: (f: string, t: string) => expressBase.specifier(f, t),
}

describe('helmet layer', () => {
  it('registers helmet middleware and its dependency', () => {
    const tree = new FileTree()
    helmetLayer.apply(tree, ctx)
    expect(tree.middleware.statements()).toContain('helmet()')
    expect(tree.middleware.imports()).toContain("from 'helmet'")
    expect(JSON.parse(tree.pkg.render()).dependencies.helmet).toBeDefined()
  })

  it('applies only to express', () => {
    expect(helmetLayer.appliesTo).toEqual(['express'])
  })
})

describe('rate-limit layer', () => {
  it('writes a configurable limiter rather than inlining magic numbers', () => {
    const tree = new FileTree()
    rateLimitLayer.apply(tree, ctx)
    const limiter = tree.read('src/lib/rate-limit.ts')!
    expect(limiter).toContain('windowMs')
    expect(limiter).toContain('limit')
  })

  it('registers the limiter as middleware', () => {
    const tree = new FileTree()
    rateLimitLayer.apply(tree, ctx)
    expect(tree.middleware.statements()).toContain('limiter')
  })

  it('follows the modular architecture', () => {
    const tree = new FileTree()
    rateLimitLayer.apply(tree, { ...ctx, arch: getArchitecture('modular') })
    expect(tree.exists('src/shared/rate-limit.ts')).toBe(true)
  })
})

describe('security middleware ordering', () => {
  it('runs helmet before the rate limiter', () => {
    const tree = new FileTree()
    rateLimitLayer.apply(tree, ctx)
    helmetLayer.apply(tree, ctx)
    const statements = tree.middleware.statements()
    expect(statements.indexOf('helmet()')).toBeLessThan(statements.indexOf('limiter'))
  })
})
