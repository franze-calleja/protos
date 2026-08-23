import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'
import { eslintPrettierLayer } from '@/generator/layers/eslint-prettier'
import { getPackageManager } from '@/generator/pm'
import { getArchitecture } from '@/generator/arch'
import { expressBase } from '@/generator/bases/express'
import { nextBase } from '@/generator/bases/next'
import type { LayerCtx } from '@/generator/layers/types'

const expressCtx: LayerCtx = {
  app: { id: 'api', base: 'express', arch: 'layered', layers: ['eslint-prettier'], options: {} },
  project: { name: 'hrims', layout: 'siblings' },
  pm: getPackageManager('npm'),
  arch: getArchitecture('layered'),
  specifier: (f: string, t: string) => expressBase.specifier(f, t),
}

const nextCtx: LayerCtx = {
  app: { id: 'web', base: 'next', arch: 'type-based', layers: ['eslint-prettier'], options: {} },
  project: { name: 'hrims', layout: 'siblings' },
  pm: getPackageManager('npm'),
  arch: getArchitecture('type-based'),
  specifier: (f: string, t: string) => nextBase.specifier(f, t),
}

describe('eslint-prettier layer', () => {
  it('writes a flat config and a prettier config', () => {
    const tree = new FileTree()
    eslintPrettierLayer.apply(tree, expressCtx)
    expect(tree.exists('eslint.config.mjs')).toBe(true)
    expect(tree.exists('.prettierrc')).toBe(true)
  })

  it('adds lint and format scripts', () => {
    const tree = new FileTree()
    eslintPrettierLayer.apply(tree, expressCtx)
    const pkg = JSON.parse(tree.pkg.render())
    expect(pkg.scripts.lint).toBe('eslint .')
    expect(pkg.scripts.format).toBe('prettier --write .')
  })

  it('uses typescript-eslint for a plain TypeScript project', () => {
    const tree = new FileTree()
    eslintPrettierLayer.apply(tree, expressCtx)
    const config = tree.read('eslint.config.mjs')!
    expect(config).toContain('typescript-eslint')
    expect(config).not.toContain('eslint-config-next')
  })

  it('uses eslint-config-next flat entry points for a Next project', () => {
    const tree = new FileTree()
    eslintPrettierLayer.apply(tree, nextCtx)
    const config = tree.read('eslint.config.mjs')!
    expect(config).toContain('eslint-config-next/core-web-vitals')
    expect(config).not.toContain('FlatCompat')
    expect(JSON.parse(tree.pkg.render()).devDependencies['eslint-config-next']).toBeDefined()
  })

  it('ignores build output and generated code', () => {
    const tree = new FileTree()
    eslintPrettierLayer.apply(tree, expressCtx)
    const config = tree.read('eslint.config.mjs')!
    for (const ignored of ['dist', 'node_modules', 'src/generated']) {
      expect(config).toContain(ignored)
    }
  })

  it('declares every path it writes in its manifest', () => {
    const tree = new FileTree()
    eslintPrettierLayer.apply(tree, expressCtx)
    for (const p of tree.paths()) {
      expect(eslintPrettierLayer.manifest(expressCtx.arch, expressCtx.app.base)).toContain(p)
    }
  })
})
