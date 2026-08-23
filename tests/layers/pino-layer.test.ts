import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'
import { pinoLayer } from '@/generator/layers/pino'
import { getPackageManager } from '@/generator/pm'
import { getArchitecture } from '@/generator/arch'
import { expressBase } from '@/generator/bases/express'
import { nextBase } from '@/generator/bases/next'
import type { LayerCtx } from '@/generator/layers/types'

const expressCtx: LayerCtx = {
  app: { id: 'api', base: 'express', arch: 'layered', layers: ['pino'], options: {} },
  project: { name: 'hrims', layout: 'siblings' },
  pm: getPackageManager('npm'),
  arch: getArchitecture('layered'),
  specifier: (f: string, t: string) => expressBase.specifier(f, t),
}

const nextCtx: LayerCtx = {
  app: { id: 'web', base: 'next', arch: 'type-based', layers: ['pino'], options: {} },
  project: { name: 'hrims', layout: 'siblings' },
  pm: getPackageManager('npm'),
  arch: getArchitecture('type-based'),
  specifier: (f: string, t: string) => nextBase.specifier(f, t),
}

describe('pino layer', () => {
  it('writes a logger module at the architecture util path', () => {
    const tree = new FileTree()
    pinoLayer.apply(tree, expressCtx)
    expect(tree.read('src/lib/logger.ts')).toContain('pino')
  })

  it('pretty-prints in development only', () => {
    const tree = new FileTree()
    pinoLayer.apply(tree, expressCtx)
    expect(tree.read('src/lib/logger.ts')).toContain('production')
  })

  it('registers request logging middleware for express', () => {
    const tree = new FileTree()
    pinoLayer.apply(tree, expressCtx)
    expect(tree.middleware.statements()).toContain('pinoHttp')
    expect(JSON.parse(tree.pkg.render()).dependencies['pino-http']).toBeDefined()
  })

  it('imports the logger without emitting an app.use for it', () => {
    const tree = new FileTree()
    pinoLayer.apply(tree, expressCtx)
    expect(tree.middleware.imports()).toContain('{ logger }')
    expect(tree.middleware.statements()).not.toContain('app.use()')
  })

  it('adds no middleware for next, which has no express app', () => {
    const tree = new FileTree()
    pinoLayer.apply(tree, nextCtx)
    expect(tree.middleware.statements()).toBe('')
    expect(tree.pkg.render()).not.toContain('pino-http')
  })

  it('logs before the body parser so failed parses are still recorded', () => {
    const tree = new FileTree()
    tree.middleware.push({ expr: 'express.json()', order: 50 })
    pinoLayer.apply(tree, expressCtx)
    const statements = tree.middleware.statements()
    expect(statements.indexOf('pinoHttp')).toBeLessThan(statements.indexOf('express.json'))
  })
})
