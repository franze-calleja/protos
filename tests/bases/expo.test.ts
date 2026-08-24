import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'
import { expoBase } from '@/generator/bases/expo'
import { getPackageManager } from '@/generator/pm'
import { getArchitecture } from '@/generator/arch'
import type { LayerCtx } from '@/generator/layers/types'
import type { ArchId } from '@/generator/config/types'

const ctx = (arch: ArchId = 'type-based'): LayerCtx => ({
  app: { id: 'mobile', base: 'expo', arch, layers: [], options: {} },
  project: { name: 'hrims', layout: 'siblings' },
  pm: getPackageManager('npm'),
  arch: getArchitecture(arch),
  specifier: (f: string, t: string) => expoBase.specifier(f, t),
})

function build(arch: ArchId = 'type-based'): FileTree {
  const tree = new FileTree()
  const c = ctx(arch)
  expoBase.init(tree, c)
  expoBase.renderComposed(tree, c)
  return tree
}

describe('expo base', () => {
  it('emits the files an Expo Router app needs', () => {
    const paths = build().paths()
    for (const p of ['package.json', 'tsconfig.json', 'app.json', 'app/_layout.tsx', 'app/index.tsx']) {
      expect(paths).toContain(p)
    }
  })

  it('is not a server', () => {
    expect(expoBase.isServer).toBe(false)
  })

  it('entry point is expo-router', () => {
    const pkg = JSON.parse(build().read('package.json')!)
    expect(pkg.main).toBe('expo-router/entry')
    expect(pkg.dependencies['expo-router']).toBeDefined()
  })

  it('places the example component by architecture, since routing is imposed', () => {
    expect(build('type-based').exists('src/components/Hello.tsx')).toBe(true)
    expect(build('feature-based').exists('src/features/hello/Hello.tsx')).toBe(true)
  })

  it('nests providers a layer pushed into the root layout', () => {
    const tree = new FileTree()
    const c = ctx()
    expoBase.init(tree, c)
    tree.providers.push({ component: 'Q', importName: 'Q', importFrom: '@/providers/q', order: 10 })
    expoBase.renderComposed(tree, c)
    expect(tree.read('app/_layout.tsx')).toContain('<Q>')
  })

  it('enables typed routes and the new architecture', () => {
    const appJson = JSON.parse(build().read('app.json')!)
    expect(appJson.expo.scheme).toBeDefined()
    expect(appJson.expo.newArchEnabled).toBe(true)
  })
})
