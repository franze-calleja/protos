import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'
import { vitestLayer } from '@/generator/layers/vitest'
import { getPackageManager } from '@/generator/pm'
import { getArchitecture } from '@/generator/arch'
import { nextBase } from '@/generator/bases/next'
import { expressBase } from '@/generator/bases/express'
import type { LayerCtx } from '@/generator/layers/types'

const nextCtx: LayerCtx = {
  app: { id: 'web', base: 'next', arch: 'type-based', layers: ['vitest'], options: {} },
  project: { name: 'hrims', layout: 'siblings' },
  pm: getPackageManager('npm'),
  arch: getArchitecture('type-based'),
  specifier: (f: string, t: string) => nextBase.specifier(f, t),
}

const expressCtx: LayerCtx = {
  app: { id: 'api', base: 'express', arch: 'layered', layers: ['vitest'], options: {} },
  project: { name: 'hrims', layout: 'siblings' },
  pm: getPackageManager('npm'),
  arch: getArchitecture('layered'),
  specifier: (f: string, t: string) => expressBase.specifier(f, t),
}

describe('vitest layer', () => {
  it('adds vitest and a test script', () => {
    const tree = new FileTree()
    vitestLayer.apply(tree, nextCtx)
    const pkg = JSON.parse(tree.pkg.render())
    expect(pkg.devDependencies.vitest).toBeDefined()
    expect(pkg.scripts.test).toBe('vitest run')
  })

  it('gives the generated config a path alias so @/ resolves in tests', () => {
    const tree = new FileTree()
    vitestLayer.apply(tree, nextCtx)
    expect(tree.read('vitest.config.ts')).toContain("alias: { '@'")
  })

  it('writes a real HTTP test against the health endpoint for express', () => {
    const tree = new FileTree()
    vitestLayer.apply(tree, expressCtx)
    const test = tree.read('tests/health.test.ts')!
    expect(test).toContain('supertest')
    expect(test).toContain('/health')
    expect(JSON.parse(tree.pkg.render()).devDependencies.supertest).toBeDefined()
  })

  it('writes a unit test and the util it exercises for next', () => {
    const tree = new FileTree()
    vitestLayer.apply(tree, nextCtx)
    expect(tree.exists('tests/example.test.ts')).toBe(true)
    expect(tree.exists(nextCtx.arch.path('util', 'greet'))).toBe(true)
  })

  it('does not pull supertest into a project that has no server', () => {
    const tree = new FileTree()
    vitestLayer.apply(tree, nextCtx)
    expect(tree.pkg.render()).not.toContain('supertest')
  })

  it('declares every path it writes in its manifest, for both bases', () => {
    for (const c of [nextCtx, expressCtx]) {
      const tree = new FileTree()
      vitestLayer.apply(tree, c)
      for (const p of tree.paths()) {
        expect(vitestLayer.manifest(c.arch, c.app.base), c.app.base).toContain(p)
      }
    }
  })
})
