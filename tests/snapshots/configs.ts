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
  {
    name: '05-express-next-siblings-npm',
    config: {
      v: 1,
      name: 'demo',
      layout: 'siblings',
      pm: 'npm',
      apps: [
        { id: 'api', base: 'express', arch: 'layered', layers: ['zod', 'pino'], options: {} },
        { id: 'web', base: 'next', arch: 'type-based', layers: ['tailwind'], options: {} },
      ],
      layers: ['docker', 'gh-actions'],
    },
  },
  {
    name: '06-express-next-monorepo-pnpm',
    config: {
      v: 1,
      name: 'demo',
      layout: 'monorepo',
      pm: 'pnpm',
      apps: [
        {
          id: 'api',
          base: 'express',
          arch: 'modular',
          layers: ['zod', 'prisma'],
          options: { db: 'postgres' },
        },
        { id: 'web', base: 'next', arch: 'feature-based', layers: ['tailwind'], options: {} },
      ],
      layers: ['docker', 'gh-actions'],
    },
  },
  {
    name: '07-express-next-separate-npm',
    config: {
      v: 1,
      name: 'demo',
      layout: 'separate',
      pm: 'npm',
      apps: [
        { id: 'api', base: 'express', arch: 'layered', layers: ['vitest'], options: {} },
        { id: 'web', base: 'next', arch: 'type-based', layers: [], options: {} },
      ],
      layers: [],
    },
  },
  {
    name: '08-vite-react-full-npm',
    config: {
      v: 1,
      name: 'demo',
      layout: 'siblings',
      pm: 'npm',
      apps: [
        {
          id: 'web',
          base: 'vite-react',
          arch: 'feature-based',
          layers: [
            'tailwind',
            'tanstack-query',
            'zustand',
            'zod',
            'react-hook-form',
            'tanstack-table',
            'vitest',
          ],
          options: {},
        },
      ],
      layers: [],
    },
  },
  {
    name: '11-expo-npm',
    config: {
      v: 1,
      name: 'demo',
      layout: 'siblings',
      pm: 'npm',
      apps: [
        {
          id: 'mobile',
          base: 'expo',
          arch: 'type-based',
          layers: ['tanstack-query', 'zustand', 'jest-expo'],
          options: {},
        },
      ],
      layers: [],
    },
  },
]
