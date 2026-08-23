import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'
import { tailwindLayer } from '@/generator/layers/tailwind'
import { getPackageManager } from '@/generator/pm'
import { getArchitecture } from '@/generator/arch'
import { nextBase } from '@/generator/bases/next'
import type { LayerCtx } from '@/generator/layers/types'

const ctx: LayerCtx = {
  app: { id: 'web', base: 'next', arch: 'type-based', layers: ['tailwind'], options: {} },
  project: { name: 'hrims', layout: 'siblings' },
  pm: getPackageManager('npm'),
  arch: getArchitecture('type-based'),
  specifier: (f: string, t: string) => nextBase.specifier(f, t),
}

describe('tailwind layer', () => {
  it('adds tailwind as a dev dependency', () => {
    const tree = new FileTree()
    tailwindLayer.apply(tree, ctx)
    const pkg = JSON.parse(tree.pkg.render())
    expect(pkg.devDependencies['tailwindcss']).toBeDefined()
  })

  it('writes a stylesheet importing tailwind', () => {
    const tree = new FileTree()
    tailwindLayer.apply(tree, ctx)
    expect(tree.read('src/app/globals.css')).toContain('tailwindcss')
  })

  it('declares every path it writes in its manifest', () => {
    const tree = new FileTree()
    tailwindLayer.apply(tree, ctx)
    for (const p of tree.paths()) expect(tailwindLayer.manifest(ctx.arch, ctx.app.base)).toContain(p)
  })
})

describe('tailwind stylesheet wiring', () => {
  it('registers the stylesheet as a side-effect import so it is not dead code', () => {
    const tree = new FileTree()
    tailwindLayer.apply(tree, ctx)
    expect(tree.sideEffects.list()).toContain('src/app/globals.css')
  })
})
