import { registerBase } from '../registry'
import type { Base } from '../types'
import type { FileTree } from '../../tree/file-tree'
import type { LayerCtx } from '../../layers/types'
import { dep } from '../../versions'
import { TSCONFIG, NEXT_CONFIG, HELLO_COMPONENT } from './files'

export const nextBase: Base = {
  id: 'next',
  label: 'Next.js',
  isServer: true,

  specifier(_from: string, to: string): string {
    return `@/${to.replace(/^src\//, '').replace(/\.(tsx?|jsx?)$/, '')}`
  },

  init(tree: FileTree, ctx: LayerCtx): void {
    tree.write('tsconfig.json', TSCONFIG)
    tree.write('next.config.ts', NEXT_CONFIG)

    // A working vertical slice, not just folder names: the page imports a
    // component through whichever path the architecture chose.
    const componentPath = ctx.arch.path('component', 'Hello')
    tree.write(componentPath, HELLO_COMPONENT)
    tree.write(
      'src/app/page.tsx',
      renderPage(ctx.specifier('src/app/page.tsx', componentPath))
    )

    tree.pkg.setName(`${ctx.project.name}-${ctx.app.id}`)
    tree.pkg.addDep('next', dep('next'))
    tree.pkg.addDep('react', dep('react'))
    tree.pkg.addDep('react-dom', dep('react-dom'))
    tree.pkg.addDevDep('typescript', dep('typescript'))
    tree.pkg.addDevDep('@types/node', dep('@types/node'))
    tree.pkg.addDevDep('@types/react', dep('@types/react'))
    tree.pkg.addDevDep('@types/react-dom', dep('@types/react-dom'))
    tree.pkg.addScript('dev', 'next dev')
    tree.pkg.addScript('build', 'next build')
    tree.pkg.addScript('start', 'next start')

    for (const p of ['node_modules', '.next', 'out', '.env', '*.log', '.DS_Store']) {
      tree.ignore.add(p)
    }

    tree.readme.section(
      'Getting started',
      ['```bash', ctx.pm.install(), ctx.pm.runScript('dev'), '```', '', 'Open http://localhost:3000.'].join('\n')
    )
  },

  renderComposed(tree: FileTree, ctx: LayerCtx): void {
    tree.write('package.json', tree.pkg.render())
    tree.write('.gitignore', tree.ignore.render())
    tree.write('README.md', tree.readme.render(`${ctx.project.name}-${ctx.app.id}`))

    if (tree.env.keys().length) {
      const env = tree.env.render()
      tree.write('.env', env.env)
      tree.write('.env.example', env.example)
    }

    tree.write('src/app/layout.tsx', renderLayout(tree))
  },
}

function renderPage(componentSpecifier: string): string {
  return `import { Hello } from '${componentSpecifier}'

export default function Home() {
  return (
    <main>
      <Hello />
    </main>
  )
}
`
}

function renderLayout(tree: FileTree): string {
  const sideEffects = tree.sideEffects
    .list()
    .map((f) => `import '@/${f.replace(/^src\//, '')}'\n`)
    .join('')

  return `${sideEffects}${tree.providers.imports()}
export const metadata = {
  title: 'App',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>${tree.providers.wrap('{children}')}</body>
    </html>
  )
}
`
}

registerBase(nextBase)
