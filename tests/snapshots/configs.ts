import type { ProtosConfig } from '@/generator/config/types'

/**
 * A curated set, not a cross-product. Package manager and architecture are
 * covered by swapping (config 02 uses pnpm, config 10 uses feature-based)
 * rather than multiplying the matrix.
 */
export const CANONICAL_CONFIGS: { name: string; config: ProtosConfig }[] = [
  {
    name: '01-next-tailwind-siblings-npm',
    config: {
      v: 1,
      name: 'demo',
      layout: 'siblings',
      pm: 'npm',
      apps: [
        { id: 'web', base: 'next', arch: 'type-based', layers: ['tailwind'], options: {} },
      ],
      layers: [],
    },
  },
  {
    name: '02-next-prisma-postgres-docker-pnpm',
    config: {
      v: 1,
      name: 'demo',
      layout: 'siblings',
      pm: 'pnpm',
      apps: [
        {
          id: 'web',
          base: 'next',
          arch: 'type-based',
          layers: ['tailwind', 'prisma'],
          options: { db: 'postgres' },
        },
      ],
      layers: ['docker'],
    },
  },
  {
    name: '09-next-minimal-npm',
    config: {
      v: 1,
      name: 'demo',
      layout: 'siblings',
      pm: 'npm',
      apps: [{ id: 'web', base: 'next', arch: 'type-based', layers: [], options: {} }],
      layers: [],
    },
  },
  {
    name: '03-express-prisma-mysql-layered-npm',
    config: {
      v: 1,
      name: 'demo',
      layout: 'siblings',
      pm: 'npm',
      apps: [
        {
          id: 'api',
          base: 'express',
          arch: 'layered',
          layers: ['prisma', 'pino', 'helmet', 'rate-limit', 'zod', 'vitest'],
          options: { db: 'mysql' },
        },
      ],
      layers: ['docker', 'gh-actions'],
    },
  },
  {
    name: '04-express-modular-npm',
    config: {
      v: 1,
      name: 'demo',
      layout: 'siblings',
      pm: 'npm',
      apps: [
        {
          id: 'api',
          base: 'express',
          arch: 'modular',
          layers: ['zod', 'vitest', 'eslint-prettier', 'pino'],
          options: {},
        },
      ],
      layers: ['gh-actions'],
    },
  },
  {
    name: '10-next-feature-based-npm',
    config: {
      v: 1,
      name: 'demo',
      layout: 'siblings',
      pm: 'npm',
      apps: [
        {
          id: 'web',
          base: 'next',
          arch: 'feature-based',
          layers: ['tailwind', 'prisma'],
          options: { db: 'postgres' },
        },
      ],
      layers: ['docker'],
    },
  },
]
