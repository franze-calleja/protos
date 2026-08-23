import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'
import { prismaLayer } from '@/generator/layers/prisma'
import { getPackageManager } from '@/generator/pm'
import { getArchitecture } from '@/generator/arch'
import { nextBase } from '@/generator/bases/next'
import type { LayerCtx } from '@/generator/layers/types'

const ctx = (
  db: string,
  pm: 'npm' | 'pnpm' = 'npm',
  arch: 'type-based' | 'feature-based' = 'type-based'
): LayerCtx => ({
  app: { id: 'api', base: 'next', arch, layers: ['prisma'], options: { db } },
  project: { name: 'hrims', layout: 'siblings' },
  pm: getPackageManager(pm),
  arch: getArchitecture(arch),
  specifier: (f: string, t: string) => nextBase.specifier(f, t),
})

describe('prisma layer', () => {
  it('writes a schema with the postgresql provider', () => {
    const tree = new FileTree()
    prismaLayer.apply(tree, ctx('postgres'))
    expect(tree.read('prisma/schema.prisma')).toContain('provider = "postgresql"')
  })

  it('writes a schema with the mysql provider', () => {
    const tree = new FileTree()
    prismaLayer.apply(tree, ctx('mysql'))
    expect(tree.read('prisma/schema.prisma')).toContain('provider = "mysql"')
  })

  it('uses the Prisma 7 generator, not the removed prisma-client-js', () => {
    const tree = new FileTree()
    prismaLayer.apply(tree, ctx('postgres'))
    const schema = tree.read('prisma/schema.prisma')!
    expect(schema).toContain('provider            = "prisma-client"')
    expect(schema).not.toContain('prisma-client-js')
    expect(schema).toContain('output')
  })

  it('pairs each database with its required driver adapter', () => {
    const pg = new FileTree()
    prismaLayer.apply(pg, ctx('postgres'))
    expect(pg.read('src/lib/db.ts')).toContain('@prisma/adapter-pg')

    const my = new FileTree()
    prismaLayer.apply(my, ctx('mysql'))
    expect(my.read('src/lib/db.ts')).toContain('@prisma/adapter-mariadb')
  })

  it('imports the client from the generated output, not @prisma/client', () => {
    const tree = new FileTree()
    prismaLayer.apply(tree, ctx('postgres'))
    const client = tree.read('src/lib/db.ts')!
    expect(client).toContain("from '@/generated/prisma/client'")
    expect(client).not.toContain("PrismaClient } from '@prisma/client'")
  })

  it('regenerates the client on install, since it is not committed', () => {
    const tree = new FileTree()
    prismaLayer.apply(tree, ctx('postgres'))
    expect(tree.pkg.render()).toContain('prisma generate')
    expect(tree.ignore.render()).toContain('src/generated/prisma')
  })

  it('defaults to postgres when no db option is given', () => {
    const tree = new FileTree()
    const c = ctx('postgres')
    prismaLayer.apply(tree, {
      ...c,
      app: { id: 'api', base: 'next', arch: 'type-based', layers: ['prisma'], options: {} },
    })
    expect(tree.read('prisma/schema.prisma')).toContain('postgresql')
  })

  it('rejects an unsupported db option rather than guessing', () => {
    const tree = new FileTree()
    expect(() => prismaLayer.apply(tree, ctx('oracle'))).toThrow(/unsupported db/i)
  })

  it('sets DATABASE_URL with a placeholder that leaks no real value', () => {
    const tree = new FileTree()
    prismaLayer.apply(tree, ctx('postgres'))
    const { env, example } = tree.env.render()
    expect(env).toContain('DATABASE_URL=postgresql://')
    expect(example).not.toContain('localhost')
  })

  it("exports a single shared client instance at the architecture's db path", () => {
    const tree = new FileTree()
    const c = ctx('postgres')
    prismaLayer.apply(tree, c)
    expect(tree.read(c.arch.path('db-client'))).toContain('globalThis')
  })

  it('keeps the db client in lib under feature-based architecture too', () => {
    const tree = new FileTree()
    prismaLayer.apply(tree, ctx('postgres', 'npm', 'feature-based'))
    expect(tree.exists('src/lib/db.ts')).toBe(true)
  })

  it('declares every path it writes in its manifest', () => {
    const tree = new FileTree()
    const c = ctx('postgres')
    prismaLayer.apply(tree, c)
    for (const p of tree.paths()) expect(prismaLayer.manifest(c.arch)).toContain(p)
  })

  it('documents itself using the selected package manager', () => {
    const tree = new FileTree()
    prismaLayer.apply(tree, ctx('postgres'))
    expect(tree.readme.render('x')).toContain('npm run db:migrate')
  })

  it('documents pnpm commands when pnpm is selected', () => {
    const tree = new FileTree()
    prismaLayer.apply(tree, ctx('postgres', 'pnpm'))
    expect(tree.readme.render('x')).toContain('pnpm db:migrate')
  })
})

describe('prisma 7 configuration', () => {
  it('omits url from the datasource, which Prisma 7 rejects', () => {
    const tree = new FileTree()
    prismaLayer.apply(tree, ctx('postgres'))
    expect(tree.read('prisma/schema.prisma')).not.toContain('url')
  })

  it('supplies the connection url through prisma.config.ts instead', () => {
    const tree = new FileTree()
    prismaLayer.apply(tree, ctx('postgres'))
    const config = tree.read('prisma.config.ts')!
    expect(config).toContain("env<Env>('DATABASE_URL')")
    // Prisma 7 stopped auto-loading .env.
    expect(config).toContain("import 'dotenv/config'")
    expect(tree.pkg.render()).toContain('dotenv')
  })
})
