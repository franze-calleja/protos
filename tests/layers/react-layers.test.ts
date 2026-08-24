import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'
import { tanstackQueryLayer } from '@/generator/layers/tanstack-query'
import { zustandLayer } from '@/generator/layers/zustand'
import { reactHookFormLayer } from '@/generator/layers/react-hook-form'
import { tanstackTableLayer } from '@/generator/layers/tanstack-table'
import { jestExpoLayer } from '@/generator/layers/jest-expo'
import { resolveLayers } from '@/generator/layers/resolve'
import { getPackageManager } from '@/generator/pm'
import { getArchitecture } from '@/generator/arch'
import { nextBase } from '@/generator/bases/next'
import { viteReactBase } from '@/generator/bases/vite-react'
import type { LayerCtx } from '@/generator/layers/types'
import type { ArchId, BaseId } from '@/generator/config/types'
import '@/generator/layers/index'

const reactCtx = (base: BaseId = 'next', arch: ArchId = 'type-based'): LayerCtx => ({
  app: { id: 'web', base, arch, layers: [], options: {} },
  project: { name: 'hrims', layout: 'siblings' },
  pm: getPackageManager('npm'),
  arch: getArchitecture(arch),
  specifier: (f: string, t: string) =>
    base === 'next' ? nextBase.specifier(f, t) : viteReactBase.specifier(f, t),
})

describe('tanstack-query layer', () => {
  it('writes a provider in the shared providers folder, under both architectures', () => {
    for (const arch of ['type-based', 'feature-based'] as const) {
      const tree = new FileTree()
      tanstackQueryLayer.apply(tree, reactCtx('next', arch))
      expect(tree.exists('src/providers/QueryProvider.tsx'), arch).toBe(true)
    }
  })

  it('registers itself with the provider model so the base wraps the tree', () => {
    const tree = new FileTree()
    tanstackQueryLayer.apply(tree, reactCtx())
    expect(tree.providers.isEmpty()).toBe(false)
    expect(tree.providers.wrap('{children}')).toContain('QueryProvider')
  })

  it('marks the provider as a client component for Next, which needs it', () => {
    const tree = new FileTree()
    tanstackQueryLayer.apply(tree, reactCtx('next'))
    expect(tree.read('src/providers/QueryProvider.tsx')!.startsWith("'use client'")).toBe(true)
  })

  it('omits the client directive for Vite, which has no server components', () => {
    const tree = new FileTree()
    tanstackQueryLayer.apply(tree, reactCtx('vite-react'))
    expect(tree.read('src/providers/QueryProvider.tsx')).not.toContain("'use client'")
  })

  it('declares every path it writes in its manifest', () => {
    const c = reactCtx()
    const tree = new FileTree()
    tanstackQueryLayer.apply(tree, c)
    for (const p of tree.paths()) {
      expect(tanstackQueryLayer.manifest(c.arch, c.app.base)).toContain(p)
    }
  })
})

describe('zustand layer', () => {
  it('writes a store at the architecture store path', () => {
    const tree = new FileTree()
    zustandLayer.apply(tree, reactCtx('next', 'type-based'))
    expect(tree.exists('src/store/useCounter.ts')).toBe(true)
  })

  it('follows feature-based architecture', () => {
    const tree = new FileTree()
    zustandLayer.apply(tree, reactCtx('next', 'feature-based'))
    expect(tree.exists('src/features/use-counter/store.ts')).toBe(true)
  })

  it('adds the dependency', () => {
    const tree = new FileTree()
    zustandLayer.apply(tree, reactCtx())
    expect(JSON.parse(tree.pkg.render()).dependencies.zustand).toBeDefined()
  })
})

describe('react-hook-form layer', () => {
  it('requires zod, because the resolver wires them together', () => {
    expect(reactHookFormLayer.requires).toContain('zod')
    expect(() => resolveLayers({ ...reactCtx().app, layers: ['react-hook-form'] })).toThrow(
      /requires "zod"/
    )
  })

  it('resolves when zod is present', () => {
    const ids = resolveLayers({
      ...reactCtx().app,
      layers: ['react-hook-form', 'zod'],
    }).map((l) => l.id)
    expect(ids.indexOf('zod')).toBeLessThan(ids.indexOf('react-hook-form'))
  })

  it('writes an example form validated by a zod schema', () => {
    const tree = new FileTree()
    reactHookFormLayer.apply(tree, reactCtx())
    const form = tree.read('src/components/ExampleForm.tsx')!
    expect(form).toContain('zodResolver')
    expect(form).toContain('useForm')
  })

  it('adds both the form library and its zod resolver', () => {
    const tree = new FileTree()
    reactHookFormLayer.apply(tree, reactCtx())
    const deps = JSON.parse(tree.pkg.render()).dependencies
    expect(deps['react-hook-form']).toBeDefined()
    expect(deps['@hookform/resolvers']).toBeDefined()
  })
})

describe('tanstack-table layer', () => {
  it('writes an example table component', () => {
    const tree = new FileTree()
    tanstackTableLayer.apply(tree, reactCtx())
    expect(tree.read('src/components/ExampleTable.tsx')).toContain('useReactTable')
  })

  it('does not apply to expo, which has no DOM table', () => {
    expect(tanstackTableLayer.appliesTo).not.toContain('expo')
  })
})

describe('jest-expo layer', () => {
  it('applies only to expo, whose idiomatic runner is jest', () => {
    expect(jestExpoLayer.appliesTo).toEqual(['expo'])
  })

  it('writes a jest config using the expo preset', () => {
    const tree = new FileTree()
    jestExpoLayer.apply(tree, reactCtx('expo'))
    expect(tree.read('jest.config.js')).toContain('jest-expo')
  })

  it('writes one real passing test and a test script', () => {
    const tree = new FileTree()
    jestExpoLayer.apply(tree, reactCtx('expo'))
    expect(tree.exists('tests/example.test.ts')).toBe(true)
    expect(JSON.parse(tree.pkg.render()).scripts.test).toBe('jest')
  })
})
