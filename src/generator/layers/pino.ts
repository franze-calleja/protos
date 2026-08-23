import { registerLayer } from './registry'
import type { Layer, LayerCtx } from './types'
import type { FileTree } from '../tree/file-tree'
import { dep } from '../versions'

/** Request logging goes before the body parser, so a failed parse is still logged. */
const PINO_HTTP_ORDER = 30

const LOGGER = `import pino from 'pino'

const isProduction = process.env.NODE_ENV === 'production'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
  // Structured JSON in production; readable lines while developing.
  transport: isProduction ? undefined : { target: 'pino-pretty' },
})
`

export const pinoLayer: Layer = {
  id: 'pino',
  label: 'Pino',
  description: 'Structured logging, with request logging wired into Express',
  appliesTo: ['next', 'express'],
  manifest: (arch) => [arch.path('util', 'logger')],

  apply(tree: FileTree, ctx: LayerCtx): void {
    const loggerPath = ctx.arch.path('util', 'logger')
    tree.write(loggerPath, LOGGER)
    tree.pkg.addDep('pino', dep('pino'))
    tree.pkg.addDevDep('pino-pretty', dep('pino-pretty'))

    if (ctx.app.base !== 'express') return

    tree.pkg.addDep('pino-http', dep('pino-http'))
    tree.middleware.push({
      expr: 'pinoHttp({ logger })',
      importName: 'pinoHttp',
      importFrom: 'pino-http',
      order: PINO_HTTP_ORDER,
    })
    // The logger is an argument, not middleware — import only.
    tree.middleware.push({
      expr: '',
      importName: '{ logger }',
      importFrom: ctx.specifier('src/app.ts', loggerPath),
      order: PINO_HTTP_ORDER,
      importOnly: true,
    })
  },
}

registerLayer(pinoLayer)
