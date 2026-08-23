import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'
import { nextBase } from '@/generator/bases/next'
import { getPackageManager } from '@/generator/pm'
import { getArchitecture } from '@/generator/arch'
import type { LayerCtx } from '@/generator/layers/types'

const ctx: LayerCtx = {
  app: { id: 'web', base: 'next', arch: 'type-based', layers: [], options: {} },
  project: { name: 'hrims', layout: 'siblings' },
  pm: getPackageManager('npm'),
  arch: getArchitecture('type-based'),
}

function build(c: LayerCtx = ctx): FileTree {
  const tree = new FileTree()
  nextBase.init(tree, c)
  nextBase.renderComposed(tree, c)
  return tree
}

describe('next base', () => {
  it('emits the files a Next app needs to run', () => {
    const paths = build().paths()
    for (const p of [
      'package.json',
      'tsconfig.json',
      'next.config.ts',
      'src/app/layout.tsx',
      'src/app/page.tsx',
      '.gitignore',
      'README.md',
    ]) {
      expect(paths).toContain(p)
    }
  })

  it('declares next, react, and react-dom as dependencies', () => {
    const pkg = JSON.parse(build().read('package.json')!)
    expect(Object.keys(pkg.dependencies)).toEqual(
      expect.arrayContaining(['next', 'react', 'react-dom'])
    )
  })

  it('names the package after the app, not the project', () => {
    expect(JSON.parse(build().read('package.json')!).name).toBe('hrims-web')
  })

  it('gitignores node_modules, .next, and .env', () => {
    const ignore = build().read('.gitignore')!
    expect(ignore).toContain('node_modules')
    expect(ignore).toContain('.next')
    expect(ignore).toContain('.env')
  })

  it('renders a layout with no provider wrapper when no layer added one', () => {
    expect(build().read('src/app/layout.tsx')).toContain('{children}')
  })

  it('nests providers into the layout when a layer pushed one', () => {
    const tree = new FileTree()
    nextBase.init(tree, ctx)
    tree.providers.push({
      component: 'Q',
      importName: 'Q',
      importFrom: '@/providers/q',
      order: 10,
    })
    nextBase.renderComposed(tree, ctx)
    const layout = tree.read('src/app/layout.tsx')!
    expect(layout).toContain("import { Q } from '@/providers/q'")
    expect(layout).toContain('<Q>{children}</Q>')
  })

  it('places the example component by kind under type-based architecture', () => {
    const tree = build()
    expect(tree.exists('src/components/Hello.tsx')).toBe(true)
    expect(tree.read('src/app/page.tsx')).toContain("from '@/components/Hello'")
  })

  it('places the example component in a feature folder under feature-based architecture', () => {
    const tree = build({
      ...ctx,
      app: { ...ctx.app, arch: 'feature-based' as const },
      arch: getArchitecture('feature-based'),
    })
    expect(tree.exists('src/features/hello/Hello.tsx')).toBe(true)
    expect(tree.read('src/app/page.tsx')).toContain("from '@/features/hello/Hello'")
  })

  it('documents npm commands in the README when npm is selected', () => {
    expect(build().read('README.md')).toContain('npm run dev')
  })

  it('documents pnpm commands in the README when pnpm is selected', () => {
    const tree = build({ ...ctx, pm: getPackageManager('pnpm') })
    expect(tree.read('README.md')).toContain('pnpm dev')
  })
})
