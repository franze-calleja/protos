import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'
import { separateAssembler } from '@/generator/assemblers/separate'
import { siblingsAssembler } from '@/generator/assemblers/siblings'
import { parseConfig } from '@/generator/config/schema'
import { ConfigError } from '@/generator/config/errors'
import type { BuiltApp } from '@/generator/assemblers/types'
import type { ProtosConfig } from '@/generator/config/types'

const cfg: ProtosConfig = {
  v: 1,
  name: 'hrims',
  layout: 'separate',
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

describe('separate assembler', () => {
  it('produces one deliverable per app', () => {
    const out = separateAssembler.assemble(apps(), cfg, new FileTree())
    expect(out).toHaveLength(2)
    expect(out.map((d) => d.name).sort()).toEqual(['hrims-api', 'hrims-web'])
  })

  it('places each app at its own root, unprefixed', () => {
    const out = separateAssembler.assemble(apps(), cfg, new FileTree())
    expect([...out[0].files.keys()]).toEqual(['src/index.ts'])
  })

  it('declares that it has no project root', () => {
    expect(separateAssembler.hasProjectRoot).toBe(false)
    expect(siblingsAssembler.hasProjectRoot).toBe(true)
  })

  it('discards nothing, because no root files can reach it', () => {
    const root = new FileTree()
    root.write('docker-compose.yml', 'services: {}')
    const out = separateAssembler.assemble(apps(), cfg, root)
    for (const d of out) expect(d.files.has('docker-compose.yml')).toBe(false)
  })
})

describe('root layers require a project root', () => {
  const base = { v: 1, name: 'hrims', apps: cfg.apps, pm: 'npm' }

  it('rejects docker with the separate layout, with a reason', () => {
    expect(() => parseConfig({ ...base, layout: 'separate', layers: ['docker'] })).toThrow(
      /project root/i
    )
  })

  it('rejects gh-actions with the separate layout', () => {
    expect(() => parseConfig({ ...base, layout: 'separate', layers: ['gh-actions'] })).toThrow(
      ConfigError
    )
  })

  it('allows root layers with siblings', () => {
    expect(parseConfig({ ...base, layout: 'siblings', layers: ['docker'] }).layers).toEqual([
      'docker',
    ])
  })

  it('allows a separate project with no root layers', () => {
    expect(parseConfig({ ...base, layout: 'separate', layers: [] }).layout).toBe('separate')
  })
})
