import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'
import { zodLayer } from '@/generator/layers/zod'
import { getPackageManager } from '@/generator/pm'
import { getArchitecture } from '@/generator/arch'
import { expressBase } from '@/generator/bases/express'
import type { LayerCtx } from '@/generator/layers/types'
import type { ArchId } from '@/generator/config/types'

const ctx = (arch: ArchId = 'layered'): LayerCtx => ({
  app: { id: 'api', base: 'express', arch, layers: ['zod'], options: {} },
  project: { name: 'hrims', layout: 'siblings' },
  pm: getPackageManager('npm'),
  arch: getArchitecture(arch),
  specifier: (f: string, t: string) => expressBase.specifier(f, t),
})

describe('zod layer', () => {
  it('adds zod as a runtime dependency', () => {
    const tree = new FileTree()
    zodLayer.apply(tree, ctx())
    expect(JSON.parse(tree.pkg.render()).dependencies.zod).toBeDefined()
  })

  it('writes a validated env module at the architecture util path', () => {
    const tree = new FileTree()
    zodLayer.apply(tree, ctx('layered'))
    expect(tree.read('src/lib/env.ts')).toContain('z.object')
  })

  it('follows the modular architecture to src/shared', () => {
    const tree = new FileTree()
    zodLayer.apply(tree, ctx('modular'))
    expect(tree.exists('src/shared/env.ts')).toBe(true)
    expect(tree.exists('src/lib/env.ts')).toBe(false)
  })

  it('parses at import time so a bad environment fails fast', () => {
    const tree = new FileTree()
    zodLayer.apply(tree, ctx())
    expect(tree.read('src/lib/env.ts')).toContain('.parse(process.env)')
  })

  it('declares every path it writes in its manifest', () => {
    const c = ctx()
    const tree = new FileTree()
    zodLayer.apply(tree, c)
    for (const p of tree.paths()) expect(zodLayer.manifest(c.arch, c.app.base)).toContain(p)
  })
})

describe('the env module suits its ecosystem', () => {
  const forBase = (base: 'express' | 'vite-react' | 'expo'): string => {
    const tree = new FileTree()
    zodLayer.apply(tree, { ...ctx(), app: { ...ctx().app, base } })
    return tree.read('src/lib/env.ts')!
  }

  it('reads process.env for a Node base', () => {
    expect(forBase('express')).toContain('process.env')
  })

  it('reads import.meta.env for Vite, which has no process global', () => {
    const module = forBase('vite-react')
    expect(module).toContain('import.meta.env')
    expect(module).not.toContain('process.env')
    expect(module).toContain('VITE_')
  })

  it('uses the EXPO_PUBLIC prefix for Expo', () => {
    expect(forBase('expo')).toContain('EXPO_PUBLIC_')
  })
})
