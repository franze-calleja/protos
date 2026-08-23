import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'
import { siblingsAssembler } from '@/generator/assemblers/siblings'
import { getPackageManager } from '@/generator/pm'
import type { BuiltApp } from '@/generator/assemblers/types'
import type { ProtosConfig } from '@/generator/config/types'

const cfg: ProtosConfig = {
  v: 1,
  name: 'hrims',
  layout: 'siblings',
  pm: 'npm',
  apps: [
    { id: 'api', base: 'express', arch: 'layered', layers: [], options: {} },
    { id: 'web', base: 'next', arch: 'type-based', layers: [], options: {} },
  ],
  layers: [],
}

function apps(): BuiltApp[] {
  return cfg.apps.map((spec) => {
    const tree = new FileTree()
    tree.write('src/index.ts', `// ${spec.id}`)
    return { spec, tree, isServer: true }
  })
}

describe('siblings assembler', () => {
  it('produces exactly one deliverable named after the project', () => {
    const out = siblingsAssembler.assemble(apps(), cfg, new FileTree())
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('hrims')
  })

  it('places each app in its own prefixed folder', () => {
    const files = siblingsAssembler.assemble(apps(), cfg, new FileTree())[0].files
    expect([...files.keys()]).toEqual(
      expect.arrayContaining(['hrims-api/src/index.ts', 'hrims-web/src/index.ts'])
    )
  })

  it('exposes the same paths through appPath that it uses when assembling', () => {
    expect(siblingsAssembler.appPath(cfg.apps[0], cfg)).toBe('hrims-api')
  })

  it('places root files at the top level, unprefixed', () => {
    const root = new FileTree()
    root.write('docker-compose.yml', 'services: {}')
    const files = siblingsAssembler.assemble(apps(), cfg, root)[0].files
    expect(files.get('docker-compose.yml')).toBe('services: {}')
  })

  it('sorts output paths for deterministic archives', () => {
    const keys = [...siblingsAssembler.assemble(apps(), cfg, new FileTree())[0].files.keys()]
    expect(keys).toEqual([...keys].sort())
  })

  it('renders an npm Dockerfile when npm is selected', () => {
    const df = siblingsAssembler
      .dockerStrategy(getPackageManager('npm'))
      .dockerfile(apps()[0], 'hrims-api')
    expect(df).toContain('RUN npm install')
    expect(df).not.toContain('corepack')
  })

  it('renders a pnpm Dockerfile with corepack when pnpm is selected', () => {
    const df = siblingsAssembler
      .dockerStrategy(getPackageManager('pnpm'))
      .dockerfile(apps()[0], 'hrims-api')
    expect(df).toContain('corepack enable')
    expect(df).toContain('pnpm-lock.yaml')
  })

  it('never uses a frozen install, since no lockfile is generated', () => {
    for (const id of ['npm', 'pnpm'] as const) {
      const df = siblingsAssembler
        .dockerStrategy(getPackageManager(id))
        .dockerfile(apps()[0], 'x')
      expect(df).not.toContain('npm ci')
      expect(df).not.toContain('--frozen-lockfile')
    }
  })

  it('renders CI steps for the selected package manager', () => {
    const paths = new Map([
      ['api', 'hrims-api'],
      ['web', 'hrims-web'],
    ])
    const wf = siblingsAssembler.ciStrategy(getPackageManager('pnpm')).workflow(apps(), paths)
    expect(wf).toContain('pnpm/action-setup')
  })
})

describe('generated Dockerfile base image', () => {
  it('tracks Node LTS rather than pinning a major that will go stale', () => {
    const df = siblingsAssembler
      .dockerStrategy(getPackageManager('npm'))
      .dockerfile(apps()[0], 'hrims-api')
    expect(df).toContain('FROM node:lts-alpine')
    expect(df).not.toMatch(/FROM node:\d+-alpine/)
  })
})
