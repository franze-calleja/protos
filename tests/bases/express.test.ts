import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'
import { expressBase } from '@/generator/bases/express'
import { getPackageManager } from '@/generator/pm'
import { getArchitecture } from '@/generator/arch'
import type { LayerCtx } from '@/generator/layers/types'
import type { ArchId } from '@/generator/config/types'

const ctx = (arch: ArchId = 'layered'): LayerCtx => ({
  app: { id: 'api', base: 'express', arch, layers: [], options: {} },
  project: { name: 'hrims', layout: 'siblings' },
  pm: getPackageManager('npm'),
  arch: getArchitecture(arch),
  specifier: (from: string, to: string) => expressBase.specifier(from, to),
})

function build(arch: ArchId = 'layered'): FileTree {
  const tree = new FileTree()
  const c = ctx(arch)
  expressBase.init(tree, c)
  expressBase.renderComposed(tree, c)
  return tree
}

describe('express base', () => {
  it('emits the files an Express app needs to run', () => {
    const paths = build().paths()
    for (const p of ['package.json', 'tsconfig.json', 'src/app.ts', 'src/index.ts', '.gitignore', 'README.md']) {
      expect(paths).toContain(p)
    }
  })

  it('declares express as a dependency and its types as a devDependency', () => {
    const pkg = JSON.parse(build().read('package.json')!)
    expect(pkg.dependencies.express).toBeDefined()
    expect(pkg.devDependencies['@types/express']).toBeDefined()
    expect(pkg.devDependencies.tsx).toBeDefined()
  })

  it('compiles to dist and starts from it', () => {
    const pkg = JSON.parse(build().read('package.json')!)
    expect(pkg.scripts.build).toBe('tsc')
    expect(pkg.scripts.start).toBe('node dist/index.js')
    expect(pkg.scripts.dev).toContain('tsx')
  })

  it('is a server, so docker and compose apply to it', () => {
    expect(expressBase.isServer).toBe(true)
  })

  it('threads the health slice through route, controller, and service under layered', () => {
    const tree = build('layered')
    expect(tree.exists('src/routes/health.route.ts')).toBe(true)
    expect(tree.exists('src/controllers/health.controller.ts')).toBe(true)
    expect(tree.exists('src/services/health.service.ts')).toBe(true)
  })

  it('threads the same slice through one module folder under modular', () => {
    const tree = build('modular')
    expect(tree.exists('src/modules/health/health.route.ts')).toBe(true)
    expect(tree.exists('src/modules/health/health.controller.ts')).toBe(true)
    expect(tree.exists('src/modules/health/health.service.ts')).toBe(true)
    expect(tree.exists('src/routes/health.route.ts')).toBe(false)
  })

  it('wires the slice together with relative imports Node can resolve', () => {
    const controller = build('layered').read('src/controllers/health.controller.ts')!
    expect(controller).toContain('../services/health.service')
    expect(controller).not.toContain('@/')
  })

  it('mounts the router in app.ts', () => {
    const app = build().read('src/app.ts')!
    expect(app).toContain("app.use('/health'")
    expect(app).toContain('express.json()')
  })

  it('renders middleware a layer pushed, in order', () => {
    const tree = new FileTree()
    const c = ctx()
    expressBase.init(tree, c)
    tree.middleware.push({ expr: 'helmet()', importName: 'helmet', importFrom: 'helmet', order: 10 })
    expressBase.renderComposed(tree, c)
    const app = tree.read('src/app.ts')!
    expect(app).toContain("import helmet from 'helmet'")
    expect(app.indexOf('app.use(helmet())')).toBeLessThan(app.indexOf('app.use(express.json())'))
  })

  it('keeps index.ts free of app construction so tests can import app.ts', () => {
    const index = build().read('src/index.ts')!
    expect(index).toContain('app.listen')
    expect(index).not.toContain('express()')
  })

  it('documents the selected package manager', () => {
    expect(build().read('README.md')).toContain('npm run dev')
  })
})

describe('express specifiers', () => {
  it('uses a relative path, because Node resolves imports at runtime', () => {
    expect(expressBase.specifier('src/lib/db.ts', 'src/generated/prisma/client')).toBe(
      '../generated/prisma/client'
    )
  })

  it('prefixes a same-directory import with ./', () => {
    expect(expressBase.specifier('src/routes/health.route.ts', 'src/routes/util.ts')).toBe('./util')
  })

  it('walks up out of a nested module folder', () => {
    expect(expressBase.specifier('src/modules/health/health.service.ts', 'src/shared/db.ts')).toBe(
      '../../shared/db'
    )
  })

  it('never emits an alias, which Node cannot resolve', () => {
    expect(
      expressBase.specifier('src/controllers/health.controller.ts', 'src/services/health.service.ts')
    ).not.toContain('@/')
  })
})
