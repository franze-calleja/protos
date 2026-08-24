import { registerBase } from '../registry'
import type { Base } from '../types'
import type { FileTree } from '../../tree/file-tree'
import type { LayerCtx } from '../../layers/types'
import { dep } from '../../versions'
import { TSCONFIG, HELLO_COMPONENT, appJson } from './files'

export const expoBase: Base = {
  id: 'expo',
  label: 'Expo',
  isServer: false,

  specifier(_from: string, to: string): string {
    return `@/${to.replace(/^src\//, '').replace(/\.(tsx?|jsx?)$/, '')}`
  },

  init(tree: FileTree, ctx: LayerCtx): void {
    const name = `${ctx.project.name}-${ctx.app.id}`
    tree.write('tsconfig.json', TSCONFIG)
    tree.write('app.json', appJson(name))

    const componentPath = ctx.arch.path('component', 'Hello')
    tree.write(componentPath, HELLO_COMPONENT)
    tree.write('app/index.tsx', renderIndex(ctx.specifier('app/index.tsx', componentPath)))

    tree.pkg.setName(name)
    tree.pkg.set('main', 'expo-router/entry')
    tree.pkg.addDep('expo', dep('expo'))
    tree.pkg.addDep('expo-router', dep('expo-router'))
    tree.pkg.addDep('react', dep('react'))
    tree.pkg.addDep('react-native', dep('react-native'))
    // expo export --platform web needs the web renderer.
    tree.pkg.addDep('react-dom', dep('react-dom'))
    tree.pkg.addDep('react-native-web', dep('react-native-web'))
    tree.pkg.addDevDep('typescript', dep('typescript'))
    tree.pkg.addDevDep('@types/react', dep('@types/react'))
    tree.pkg.addScript('dev', 'expo start')
    tree.pkg.addScript('build', 'expo export --platform web')
    tree.pkg.addScript('android', 'expo start --android')
    tree.pkg.addScript('ios', 'expo start --ios')

    for (const p of ['node_modules', '.expo', 'dist', '.env', '*.log', '.DS_Store']) {
      tree.ignore.add(p)
    }

    tree.readme.section(
      'Getting started',
      ['```bash', ctx.pm.install(), ctx.pm.runScript('dev'), '```'].join('\n')
    )
  },

  renderComposed(tree: FileTree, ctx: LayerCtx): void {
    tree.write('app/_layout.tsx', renderLayout(tree))
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

function renderIndex(componentSpecifier: string): string {
  return `import { Hello } from '${componentSpecifier}'

export default function Index() {
  return <Hello />
}
`
}

function renderLayout(tree: FileTree): string {
  return `import { Stack } from 'expo-router'
${tree.providers.imports()}
export default function RootLayout() {
  return ${tree.providers.wrap('<Stack />')}
}
`
}

registerBase(expoBase)
