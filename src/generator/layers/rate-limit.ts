import { registerLayer } from './registry'
import type { Layer, LayerCtx } from './types'
import type { FileTree } from '../tree/file-tree'
import { dep } from '../versions'

/** After helmet, before the body parser. */
const RATE_LIMIT_ORDER = 20

const LIMITER = `import { rateLimit } from 'express-rate-limit'

export const limiter = rateLimit({
  windowMs: 60_000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})
`

export const rateLimitLayer: Layer = {
  id: 'rate-limit',
  label: 'Rate limiting',
  description: 'Per-IP request throttling for Express',
  appliesTo: ['express'],
  manifest: (arch) => [arch.path('util', 'rate-limit')],

  apply(tree: FileTree, ctx: LayerCtx): void {
    const limiterPath = ctx.arch.path('util', 'rate-limit')
    tree.write(limiterPath, LIMITER)
    tree.pkg.addDep('express-rate-limit', dep('express-rate-limit'))
    tree.middleware.push({
      expr: 'limiter',
      importName: '{ limiter }',
      importFrom: ctx.specifier('src/app.ts', limiterPath),
      order: RATE_LIMIT_ORDER,
    })
  },
}

registerLayer(rateLimitLayer)
