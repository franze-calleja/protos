import { registerLayer } from './registry'
import type { Layer, LayerCtx } from './types'
import type { FileTree } from '../tree/file-tree'
import { dep } from '../versions'

const CONFIG = `import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  // Without this a Next project's generated test cannot resolve '@/...'.
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
})
`

const GREET_UTIL = `export function greet(name: string): string {
  return \`Hello, \${name}\`
}
`

function greetTest(specifier: string): string {
  return `import { describe, it, expect } from 'vitest'
import { greet } from '${specifier}'

describe('greet', () => {
  it('greets by name', () => {
    expect(greet('protos')).toBe('Hello, protos')
  })
})
`
}

const HEALTH_TEST = `import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../src/app'

describe('GET /health', () => {
  it('reports ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })
})
`

export const vitestLayer: Layer = {
  id: 'vitest',
  label: 'Vitest',
  description: 'Unit and integration testing, with one real passing test',
  appliesTo: ['next', 'vite-react', 'express'],
  manifest: (arch, base) =>
    base === 'express'
      ? ['vitest.config.ts', 'tests/health.test.ts']
      : ['vitest.config.ts', 'tests/example.test.ts', arch.path('util', 'greet')],

  apply(tree: FileTree, ctx: LayerCtx): void {
    tree.write('vitest.config.ts', CONFIG)
    tree.pkg.addDevDep('vitest', dep('vitest'))
    tree.pkg.addScript('test', 'vitest run')

    if (ctx.app.base === 'express') {
      // A real request through the running app is worth more than a unit test here.
      tree.write('tests/health.test.ts', HEALTH_TEST)
      tree.pkg.addDevDep('supertest', dep('supertest'))
      tree.pkg.addDevDep('@types/supertest', dep('@types/supertest'))
      return
    }

    const utilPath = ctx.arch.path('util', 'greet')
    tree.write(utilPath, GREET_UTIL)
    tree.write('tests/example.test.ts', greetTest(ctx.specifier('tests/example.test.ts', utilPath)))
  },
}

registerLayer(vitestLayer)
