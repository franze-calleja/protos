export const BASE_IDS = ['next', 'vite-react', 'express', 'expo'] as const
export type BaseId = (typeof BASE_IDS)[number]

export const LAYER_IDS = [
  'tailwind',
  'tanstack-query',
  'zustand',
  'zod',
  'react-hook-form',
  'tanstack-table',
  'prisma',
  'pino',
  'helmet',
  'rate-limit',
  'eslint-prettier',
  'vitest',
  'jest-expo',
  'docker',
  'gh-actions',
] as const
export type LayerId = (typeof LAYER_IDS)[number]

export const LAYOUT_IDS = ['siblings', 'separate', 'monorepo'] as const
export type LayoutId = (typeof LAYOUT_IDS)[number]

export const PM_IDS = ['npm', 'pnpm'] as const
export type PmId = (typeof PM_IDS)[number]

export const ARCH_IDS = ['type-based', 'feature-based', 'layered', 'modular'] as const
export type ArchId = (typeof ARCH_IDS)[number]

/** Which architectures make sense for which base. Enforced by the schema. */
export const ARCH_BY_BASE: Record<BaseId, readonly ArchId[]> = {
  next: ['type-based', 'feature-based'],
  'vite-react': ['type-based', 'feature-based'],
  expo: ['type-based', 'feature-based'],
  express: ['layered', 'modular'],
}

export const DEFAULT_ARCH: Record<BaseId, ArchId> = {
  next: 'type-based',
  'vite-react': 'type-based',
  expo: 'type-based',
  express: 'layered',
}

export interface AppSpec {
  id: string
  base: BaseId
  arch: ArchId
  layers: LayerId[]
  options: Record<string, string>
}

export interface ProtosConfig {
  v: 1
  name: string
  layout: LayoutId
  pm: PmId
  apps: AppSpec[]
  layers: LayerId[]
}

/** Layers that write at the project root rather than inside an app. */
export const ROOT_LAYER_IDS: readonly LayerId[] = ['docker', 'gh-actions']

/** Layouts with no shared project root, so root layers cannot apply. */
export const LAYOUTS_WITHOUT_ROOT: readonly LayoutId[] = ['separate']

export const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,38}$/
export const MAX_APPS = 2
export const MAX_LAYERS = 25
export const MAX_ENCODED_BYTES = 4096
