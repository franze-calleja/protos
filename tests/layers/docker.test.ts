import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'
import { dockerRootLayer } from '@/generator/layers/docker'
import { siblingsAssembler } from '@/generator/assemblers/siblings'
import { getPackageManager } from '@/generator/pm'
import type { ProjectTree } from '@/generator/assemblers/types'
import type { RootCtx } from '@/generator/layers/root-types'
import type { ProtosConfig } from '@/generator/config/types'

const cfg: ProtosConfig = {
  v: 1,
  name: 'hrims',
  layout: 'siblings',
  pm: 'npm',
  apps: [{ id: 'web', base: 'next', arch: 'type-based', layers: [], options: {} }],
  layers: ['docker'],
}

const pm = getPackageManager('npm')

const ctx: RootCtx = {
  project: { name: 'hrims', layout: 'siblings' },
  pm,
  docker: siblingsAssembler.dockerStrategy(pm),
  ci: siblingsAssembler.ciStrategy(pm),
}

function project(db?: 'postgres' | 'mysql'): ProjectTree {
  const tree = new FileTree()
  const options: Record<string, string> = db ? { db } : {}
  const spec = { ...cfg.apps[0], options }
  if (db) tree.env.set('DATABASE_URL', 'x://local')
  return {
    root: new FileTree(),
    apps: [{ spec, tree, isServer: true }],
    appPath: (s) => siblingsAssembler.appPath(s, cfg),
  }
}

describe('docker root layer', () => {
  it('writes a Dockerfile into each app, not the root', () => {
    const p = project()
    dockerRootLayer.applyRoot(p, ctx)
    expect(p.apps[0].tree.exists('Dockerfile')).toBe(true)
    expect(p.root.exists('Dockerfile')).toBe(false)
  })

  it('writes a single compose file at the root', () => {
    const p = project()
    dockerRootLayer.applyRoot(p, ctx)
    expect(p.root.read('docker-compose.yml')).toContain('services:')
  })

  it('adds a postgres service because an app declared DATABASE_URL', () => {
    const p = project('postgres')
    dockerRootLayer.applyRoot(p, ctx)
    expect(p.root.read('docker-compose.yml')).toContain('postgres')
  })

  it('adds a mysql service when the app selected mysql', () => {
    const p = project('mysql')
    dockerRootLayer.applyRoot(p, ctx)
    const compose = p.root.read('docker-compose.yml')!
    expect(compose).toContain('mysql:8')
    expect(compose).not.toContain('postgres')
  })

  it('omits the database service when no app declared DATABASE_URL', () => {
    const p = project()
    dockerRootLayer.applyRoot(p, ctx)
    expect(p.root.read('docker-compose.yml')).not.toContain('postgres')
  })

  it('makes app services depend on the database when there is one', () => {
    const p = project('postgres')
    dockerRootLayer.applyRoot(p, ctx)
    expect(p.root.read('docker-compose.yml')).toContain('depends_on')
  })

  it('dockerignores node_modules per app', () => {
    const p = project()
    dockerRootLayer.applyRoot(p, ctx)
    expect(p.apps[0].tree.read('.dockerignore')).toContain('node_modules')
  })
})
