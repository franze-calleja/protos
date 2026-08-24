import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'
import { viteReactBase } from '@/generator/bases/vite-react'
import { getPackageManager } from '@/generator/pm'
import { getArchitecture } from '@/generator/arch'
import type { LayerCtx } from '@/generator/layers/types'
import type { ArchId } from '@/generator/config/types'

const ctx = (arch: ArchId = 'type-based'): LayerCtx => ({
  app: { id: 'web', base: 'vite-react', arch, layers: [], options: {} },
  project: { name: 'hrims', layout: 'siblings' },
  pm: getPackageManager('npm'),
  arch: getArchitecture(arch),
  specifier: (f: string, t: string) => viteReactBase.specifier(f, t),
})

function build(arch: ArchId = 'type-based'): FileTree {
  const tree = new FileTree()
  const c = ctx(arch)
  viteReactBase.init(tree, c)
  viteReactBase.renderComposed(tree, c)
  return tree
}

describe('vite-react base', () => {
  it('emits the files a Vite app needs', () => {
    const paths = build().paths()
    for (const p of [
      'package.json',
      'tsconfig.json',
      'vite.config.ts',
      'index.html',
      'src/main.tsx',
      'src/App.tsx',
    ]) {
      expect(paths).toContain(p)
    }
  })

  it('is not a server, so docker does not apply to it', () => {
    expect(viteReactBase.isServer).toBe(false)
  })

  it('builds with vite', () => {
    const pkg = JSON.parse(build().read('package.json')!)
    expect(pkg.scripts.build).toContain('vite build')
    expect(pkg.scripts.dev).toBe('vite')
    expect(pkg.devDependencies.vite).toBeDefined()
  })

  it('places the example component by architecture', () => {
    expect(build('type-based').exists('src/components/Hello.tsx')).toBe(true)
    expect(build('feature-based').exists('src/features/hello/Hello.tsx')).toBe(true)
  })

  it('nests providers a layer pushed into main.tsx', () => {
    const tree = new FileTree()
    const c = ctx()
    viteReactBase.init(tree, c)
    tree.providers.push({ component: 'Q', importName: 'Q', importFrom: '@/providers/q', order: 10 })
    viteReactBase.renderComposed(tree, c)
    const main = tree.read('src/main.tsx')!
    expect(main).toContain("import { Q } from '@/providers/q'")
    expect(main).toContain('<Q>')
  })

  it('uses the @ alias, which vite resolves', () => {
    expect(viteReactBase.specifier('src/main.tsx', 'src/components/Hello.tsx')).toBe(
      '@/components/Hello'
    )
    expect(build().read('vite.config.ts')).toContain('alias')
  })
})
