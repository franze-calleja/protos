import { registerBase } from '../registry'
import type { Base } from '../types'
import type { FileTree } from '../../tree/file-tree'
import type { LayerCtx } from '../../layers/types'
import { dep } from '../../versions'
import { TSCONFIG, INDEX, HEALTH_SERVICE } from './files'

/** Express's own body parser sits after security middleware, before routes. */
const JSON_MIDDLEWARE_ORDER = 50

export const expressBase: Base = {
  id: 'express',
  label: 'Express',
  isServer: true,

  specifier(from: string, to: string): string {
    const fromParts = from.split('/').slice(0, -1)
    const toParts = to.replace(/\.(tsx?|jsx?)$/, '').split('/')

    let shared = 0
    while (
      shared < fromParts.length &&
      shared < toParts.length - 1 &&
      fromParts[shared] === toParts[shared]
    ) {
      shared++
    }
    const up = fromParts.length - shared
    const rest = toParts.slice(shared).join('/')
    return up === 0 ? `./${rest}` : `${'../'.repeat(up)}${rest}`
  },

  init(tree: FileTree, ctx: LayerCtx): void {
    tree.write('tsconfig.json', TSCONFIG)
    tree.write('src/index.ts', INDEX)

    // The vertical slice: one real endpoint through every role the
    // architecture defines. Folder names alone would prove nothing.
    const servicePath = ctx.arch.path('service', 'health')
    const controllerPath = ctx.arch.path('controller', 'health')
    const routePath = ctx.arch.path('route', 'health')

    tree.write(servicePath, HEALTH_SERVICE)
    tree.write(controllerPath, renderController(ctx.specifier(controllerPath, servicePath)))
    tree.write(routePath, renderRoute(ctx.specifier(routePath, controllerPath)))

    tree.middleware.push({ expr: 'express.json()', order: JSON_MIDDLEWARE_ORDER })

    tree.pkg.setName(`${ctx.project.name}-${ctx.app.id}`)
    tree.pkg.addDep('express', dep('express'))
    tree.pkg.addDevDep('@types/express', dep('@types/express'))
    tree.pkg.addDevDep('@types/node', dep('@types/node'))
    tree.pkg.addDevDep('typescript', dep('typescript'))
    tree.pkg.addDevDep('tsx', dep('tsx'))
    tree.pkg.addScript('dev', 'tsx watch src/index.ts')
    tree.pkg.addScript('build', 'tsc')
    tree.pkg.addScript('start', 'node dist/index.js')

    for (const p of ['node_modules', 'dist', '.env', '*.log', '.DS_Store']) {
      tree.ignore.add(p)
    }

    tree.readme.section(
      'Getting started',
      [
        '```bash',
        ctx.pm.install(),
        ctx.pm.runScript('dev'),
        '```',
        '',
        'Then GET http://localhost:3000/health.',
      ].join('\n')
    )
  },

  renderComposed(tree: FileTree, ctx: LayerCtx): void {
    tree.write('src/app.ts', renderApp(tree, ctx))
    tree.write('package.json', tree.pkg.render())
    tree.write('.gitignore', tree.ignore.render())
    tree.write('README.md', tree.readme.render(`${ctx.project.name}-${ctx.app.id}`))

    if (tree.env.keys().length) {
      const env = tree.env.render()
      tree.write('.env', env.env)
      tree.write('.env.example', env.example)
    }
  },
}

function renderController(serviceSpecifier: string): string {
  return `import type { Request, Response } from 'express'
import { getHealth } from '${serviceSpecifier}'

export function healthHandler(_req: Request, res: Response): void {
  res.json(getHealth())
}
`
}

function renderRoute(controllerSpecifier: string): string {
  return `import { Router } from 'express'
import { healthHandler } from '${controllerSpecifier}'

const router = Router()

router.get('/', healthHandler)

export { router as healthRouter }
`
}

function renderApp(tree: FileTree, ctx: LayerCtx): string {
  const routeSpecifier = ctx.specifier('src/app.ts', ctx.arch.path('route', 'health'))

  return `import express from 'express'
${tree.middleware.imports()}import { healthRouter } from '${routeSpecifier}'

export const app = express()

${tree.middleware.statements()}
app.use('/health', healthRouter)
`
}

registerBase(expressBase)
