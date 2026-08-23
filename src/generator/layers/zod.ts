import { registerLayer } from './registry'
import type { Layer, LayerCtx } from './types'
import type { FileTree } from '../tree/file-tree'
import { dep } from '../versions'

const ENV_MODULE = `import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
})

/**
 * Parsed at import time: a misconfigured environment fails on boot with a
 * readable message rather than somewhere deep in a request later.
 */
export const env = envSchema.parse(process.env)
`

export const zodLayer: Layer = {
  id: 'zod',
  label: 'Zod',
  description: 'Schema validation, wired up to validate the environment on boot',
  appliesTo: ['next', 'vite-react', 'express', 'expo'],
  manifest: (arch) => [arch.path('util', 'env')],

  apply(tree: FileTree, ctx: LayerCtx): void {
    tree.write(ctx.arch.path('util', 'env'), ENV_MODULE)
    tree.pkg.addDep('zod', dep('zod'))
  },
}

registerLayer(zodLayer)
