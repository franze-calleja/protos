import { registerBase } from '../registry'
import type { Base } from '../types'
import type { FileTree } from '../../tree/file-tree'
import type { LayerCtx } from '../../layers/types'
import { dep } from '../../versions'
import { TSCONFIG, VITE_CONFIG, INDEX_HTML, HELLO_COMPONENT } from './files'

export const viteReactBase: Base = {
  id: 'vite-react',
  label: 'Vite + React',
  // A static bundle, not a Node server: docker and compose do not apply.
  isServer: false,

  specifier(_from: string, to: string): string {
    return `@/${to.replace(/^src\//, '').replace(/\.(tsx?|jsx?)$/, '')}`
  },

  init(tree: FileTree, ctx: LayerCtx): void {
    tree.write('tsconfig.json', TSCONFIG)
    tree.write('vite.config.ts', VITE_CONFIG)
    tree.write('index.html', INDEX_HTML)

    const componentPath = ctx.arch.path('component', 'Hello')
    tree.write(componentPath, HELLO_COMPONENT)
    tree.write('src/App.tsx', renderApp(ctx.specifier('src/App.tsx', componentPath)))

    tree.pkg.setName(`${ctx.project.name}-${ctx.app.id}`)
    tree.pkg.set('type', 'module')
    tree.pkg.addDep('react', dep('react'))
    tree.pkg.addDep('react-dom', dep('react-dom'))
    tree.pkg.addDevDep('vite', dep('vite'))
    tree.pkg.addDevDep('@vitejs/plugin-react', dep('@vitejs/plugin-react'))
    tree.pkg.addDevDep('typescript', dep('typescript'))
    tree.pkg.addDevDep('@types/react', dep('@types/react'))
    tree.pkg.addDevDep('@types/react-dom', dep('@types/react-dom'))
    tree.pkg.addScript('dev', 'vite')
    tree.pkg.addScript('build', 'tsc --noEmit && vite build')
    tree.pkg.addScript('preview', 'vite preview')
    // vite bundles esbuild, whose install script fetches a platform binary.
    tree.pkg.allowBuildScripts(['esbuild'])

    for (const p of ['node_modules', 'dist', '.env', '*.log', '.DS_Store']) {
      tree.ignore.add(p)
    }

    tree.readme.section(
      'Getting started',
      ['```bash', ctx.pm.install(), ctx.pm.runScript('dev'), '```'].join('\n')
    )
  },

  renderComposed(tree: FileTree, ctx: LayerCtx): void {
    tree.write('src/main.tsx', renderMain(tree))
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

function renderApp(componentSpecifier: string): string {
  return `import { Hello } from '${componentSpecifier}'

export function App() {
  return (
    <main>
      <Hello />
    </main>
  )
}
`
}

function renderMain(tree: FileTree): string {
  const sideEffects = tree.sideEffects
    .list()
    .map((f) => `import '@/${f.replace(/^src\//, '')}'\n`)
    .join('')

  return `${sideEffects}import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
${tree.providers.imports()}import { App } from '@/App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>${tree.providers.wrap('<App />')}</StrictMode>
)
`
}

registerBase(viteReactBase)
