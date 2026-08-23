import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'
import { monorepoAssembler } from '@/generator/assemblers/monorepo'
import type { BuiltApp } from '@/generator/assemblers/types'
import type { ProtosConfig } from '@/generator/config/types'

const cfg: ProtosConfig = {
  v: 1,
  name: 'hrims',
  layout: 'monorepo',
  pm: 'npm',
  apps: [
    { id: 'api', base: 'express', arch: 'layered', layers: [], options: {} },
    { id: 'web', base: 'next', arch: 'type-based', layers: [], options: {} },
  ],
  layers: [],
}

function apps(spec = cfg.apps): BuiltApp[] {
  return spec.map((s) => {
    const tree = new FileTree()
    tree.write('src/index.ts', `// ${s.id}`)
    tree.pkg.setName(`hrims-${s.id}`)
    tree.write('package.json', tree.pkg.render())
    return { spec: s, tree, isServer: true }
  })
}

const filesOf = (c: ProtosConfig = cfg) =>
  monorepoAssembler.assemble(apps(c.apps), c, new FileTree())[0].files

describe('monorepo assembler', () => {
  it('produces one deliverable named after the project', () => {
    const out = monorepoAssembler.assemble(apps(), cfg, new FileTree())
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('hrims')
  })

  it('places apps under apps/', () => {
    expect(monorepoAssembler.appPath(cfg.apps[0], cfg)).toBe('apps/api')
    expect([...filesOf().keys()]).toEqual(expect.arrayContaining(['apps/api/src/index.ts']))
  })

  it('emits a root package.json and turbo config', () => {
    const files = filesOf()
    expect(files.has('package.json')).toBe(true)
    expect(files.has('turbo.json')).toBe(true)
  })

  it('declares npm workspaces in the root package.json', () => {
    const root = JSON.parse(filesOf().get('package.json')!)
    expect(root.workspaces).toEqual(expect.arrayContaining(['apps/*', 'packages/*']))
    expect(root.private).toBe(true)
  })

  it('declares pnpm workspaces in a separate yaml instead', () => {
    const files = filesOf({ ...cfg, pm: 'pnpm' })
    expect(files.has('pnpm-workspace.yaml')).toBe(true)
    expect(JSON.parse(files.get('package.json')!).workspaces).toBeUndefined()
  })

  it('scopes each app package name to the project', () => {
    expect(JSON.parse(filesOf().get('apps/api/package.json')!).name).toBe('@hrims/api')
  })

  it('routes root scripts through turbo', () => {
    const root = JSON.parse(filesOf().get('package.json')!)
    expect(root.scripts.build).toContain('turbo')
    expect(root.devDependencies.turbo).toBeDefined()
  })

  it('has a project root, unlike separate', () => {
    expect(monorepoAssembler.hasProjectRoot).toBe(true)
  })
})

describe('shared types package', () => {
  it('emits packages/types for a two-app project', () => {
    const files = filesOf()
    expect(files.has('packages/types/package.json')).toBe(true)
    expect(files.has('packages/types/src/index.ts')).toBe(true)
    expect(files.has('packages/types/tsconfig.json')).toBe(true)
  })

  it('scopes the package and builds it to dist', () => {
    const pkg = JSON.parse(filesOf().get('packages/types/package.json')!)
    expect(pkg.name).toBe('@hrims/types')
    expect(pkg.types).toBe('dist/index.d.ts')
    expect(pkg.scripts.build).toBe('tsc')
  })

  it('makes both apps depend on it', () => {
    const files = filesOf()
    for (const id of ['api', 'web']) {
      const pkg = JSON.parse(files.get(`apps/${id}/package.json`)!)
      expect(pkg.dependencies['@hrims/types'], id).toBeDefined()
    }
  })

  it('uses the plain range under npm and the workspace protocol under pnpm', () => {
    expect(JSON.parse(filesOf().get('apps/api/package.json')!).dependencies['@hrims/types']).toBe(
      '*'
    )
    const pnpmFiles = filesOf({ ...cfg, pm: 'pnpm' })
    expect(
      JSON.parse(pnpmFiles.get('apps/api/package.json')!).dependencies['@hrims/types']
    ).toBe('workspace:*')
  })

  it('omits the package for a single-app monorepo, which has nothing to share', () => {
    const solo: ProtosConfig = { ...cfg, apps: [cfg.apps[0]] }
    expect(filesOf(solo).has('packages/types/package.json')).toBe(false)
  })
})

describe('package manager build permissions', () => {
  const withPrisma: ProtosConfig = {
    ...cfg,
    pm: 'pnpm',
    apps: [
      { id: 'api', base: 'express', arch: 'layered', layers: ['prisma'], options: {} },
      cfg.apps[1],
    ],
  }

  function appsNeedingBuilds(): BuiltApp[] {
    return withPrisma.apps.map((s, i) => {
      const tree = new FileTree()
      tree.write('src/index.ts', `// ${s.id}`)
      tree.pkg.setName(`hrims-${s.id}`)
      if (i === 0) tree.pkg.allowBuildScripts(['prisma', '@prisma/engines'])
      tree.write('package.json', tree.pkg.render())
      return { spec: s, tree, isServer: true }
    })
  }

  it('merges build permissions into the single root workspace file', () => {
    const files = monorepoAssembler.assemble(appsNeedingBuilds(), withPrisma, new FileTree())[0]
      .files
    const root = files.get('pnpm-workspace.yaml')!
    expect(root).toContain('packages:')
    expect(root).toContain('allowBuilds:')
    expect(root).toContain("'prisma': true")
  })

  it('never writes a workspace file inside an app, which pnpm would ignore', () => {
    const files = monorepoAssembler.assemble(appsNeedingBuilds(), withPrisma, new FileTree())[0]
      .files
    for (const key of files.keys()) {
      expect(key.endsWith('pnpm-workspace.yaml') && key.includes('/')).toBe(false)
    }
  })
})
