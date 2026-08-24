import { registerLayer } from './registry'
import type { Layer, LayerCtx } from './types'
import type { FileTree } from '../tree/file-tree'
import { dep } from '../versions'

/**
 * Environment variables come from different places per ecosystem: Node reads
 * process.env, Vite exposes import.meta.env with a VITE_ prefix, and Expo
 * inlines EXPO_PUBLIC_ vars. A single Node-shaped module would not even
 * typecheck in a Vite app, which has no process global.
 */
const ENV_MODULES: Record<string, string> = {
  node: `import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
})

/**
 * Parsed at import time: a misconfigured environment fails on boot with a
 * readable message rather than somewhere deep in a request later.
 */
export const env = envSchema.parse(process.env)
`,

  vite: `import { z } from 'zod'

const envSchema = z.object({
  VITE_API_URL: z.string().url().default('http://localhost:3000'),
})

/** Vite exposes only VITE_-prefixed variables, through import.meta.env. */
export const env = envSchema.parse(import.meta.env)
`,

  expo: `import { z } from 'zod'

const envSchema = z.object({
  EXPO_PUBLIC_API_URL: z.string().url().default('http://localhost:3000'),
})

/** Expo inlines EXPO_PUBLIC_-prefixed variables at build time. */
export const env = envSchema.parse(process.env)
`,
}

function envModuleFor(base: string): string {
  if (base === 'vite-react') return ENV_MODULES.vite
  if (base === 'expo') return ENV_MODULES.expo
  return ENV_MODULES.node
}

export const zodLayer: Layer = {
  id: 'zod',
  label: 'Zod',
  description: 'Schema validation, wired up to validate the environment on boot',
  appliesTo: ['next', 'vite-react', 'express', 'expo'],
  manifest: (arch) => [arch.path('util', 'env')],

  apply(tree: FileTree, ctx: LayerCtx): void {
    tree.write(ctx.arch.path('util', 'env'), envModuleFor(ctx.app.base))
    tree.pkg.addDep('zod', dep('zod'))
  },
}

registerLayer(zodLayer)
