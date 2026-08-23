import { registerLayer } from './registry'
import type { Layer, LayerCtx } from './types'
import type { FileTree } from '../tree/file-tree'
import { dep } from '../versions'

/**
 * Prisma 7 differs from 6 in ways that matter here: the generator is
 * `prisma-client` (not `prisma-client-js`), it needs an explicit output path,
 * the client is imported from that path rather than `@prisma/client`, and a
 * driver adapter is required.
 */
interface Target {
  provider: string
  url: string
  placeholder: string
  adapterPkg: string
  adapterClass: string
}

const TARGETS: Record<string, Target> = {
  postgres: {
    provider: 'postgresql',
    url: 'postgresql://postgres:postgres@localhost:5432/app',
    placeholder: 'postgresql://user:password@host:5432/dbname',
    adapterPkg: '@prisma/adapter-pg',
    adapterClass: 'PrismaPg',
  },
  mysql: {
    provider: 'mysql',
    url: 'mysql://root:root@localhost:3306/app',
    placeholder: 'mysql://user:password@host:3306/dbname',
    adapterPkg: '@prisma/adapter-mariadb',
    adapterClass: 'PrismaMariaDb',
  },
}

const GENERATED_DIR = 'src/generated/prisma'

function schema(target: Target): string {
  return `generator client {
  provider            = "prisma-client"
  output              = "../${GENERATED_DIR}"
  importFileExtension = ""
}

datasource db {
  provider = "${target.provider}"
}

model Example {
  id        Int      @id @default(autoincrement())
  name      String
  createdAt DateTime @default(now())
}
`
}

/**
 * Prisma 7 removed `url` from the datasource block; the CLI reads the
 * connection string from here instead. It also no longer auto-loads .env,
 * hence the explicit dotenv import.
 */
const PRISMA_CONFIG = `import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

type Env = {
  DATABASE_URL: string
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env<Env>('DATABASE_URL'),
  },
})
`

function client(target: Target, clientSpecifier: string): string {
  return `import { ${target.adapterClass} } from '${target.adapterPkg}'
import { PrismaClient } from '${clientSpecifier}'

const adapter = new ${target.adapterClass}({ connectionString: process.env.DATABASE_URL as string })

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
`
}

export const prismaLayer: Layer = {
  id: 'prisma',
  label: 'Prisma ORM',
  description: 'Type-safe database access',
  appliesTo: ['next', 'express'],
  manifest: (arch) => ['prisma/schema.prisma', 'prisma.config.ts', arch.path('db-client')],

  apply(tree: FileTree, ctx: LayerCtx): void {
    const dbOption = ctx.app.options.db ?? 'postgres'
    const target = TARGETS[dbOption]
    if (!target) throw new Error(`Unsupported db option "${dbOption}" for the prisma layer`)

    tree.write('prisma/schema.prisma', schema(target))
    tree.write('prisma.config.ts', PRISMA_CONFIG)
    const dbPath = ctx.arch.path('db-client')
    tree.write(dbPath, client(target, ctx.specifier(dbPath, `${GENERATED_DIR}/client`)))

    tree.env.set('DATABASE_URL', target.url, {
      comment: 'Local development database',
      placeholder: target.placeholder,
    })

    tree.pkg.addDep('@prisma/client', dep('@prisma/client'))
    tree.pkg.addDep(target.adapterPkg, dep(target.adapterPkg))
    tree.pkg.addDevDep('prisma', dep('prisma'))
    // Prisma 7's CLI does not load .env on its own.
    tree.pkg.addDevDep('dotenv', dep('dotenv'))
    tree.pkg.allowBuildScripts(['prisma', '@prisma/engines'])
    tree.pkg.addScript('db:migrate', 'prisma migrate dev')
    tree.pkg.addScript('db:studio', 'prisma studio')
    // The generated client is not committed, so it must exist after install.
    tree.pkg.addScript('postinstall', 'prisma generate')

    tree.ignore.add(GENERATED_DIR)

    tree.readme.section(
      'Database',
      [
        '```bash',
        ctx.pm.runScript('db:migrate'),
        '```',
        '',
        'Edit `prisma/schema.prisma`, then run the command above.',
      ].join('\n')
    )
  },
}

registerLayer(prismaLayer)
