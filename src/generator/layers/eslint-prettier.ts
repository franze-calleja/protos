import { registerLayer } from './registry'
import type { Layer, LayerCtx } from './types'
import type { FileTree } from '../tree/file-tree'
import { dep } from '../versions'

const TS_CONFIG = `import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'src/generated'] },
  js.configs.recommended,
  ...tseslint.configs.recommended
)
`

/**
 * eslint-config-next 16 ships native flat-config entry points, so no
 * FlatCompat shim is needed. This mirrors what create-next-app itself emits.
 */
const NEXT_CONFIG = `import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'node_modules/**', 'src/generated/**']),
])
`

const PRETTIERRC = `{
  "semi": false,
  "singleQuote": true,
  "printWidth": 100
}
`

export const eslintPrettierLayer: Layer = {
  id: 'eslint-prettier',
  label: 'ESLint + Prettier',
  description: 'Linting and formatting, configured for this framework',
  appliesTo: ['next', 'vite-react', 'express', 'expo'],
  manifest: () => ['eslint.config.mjs', '.prettierrc'],

  apply(tree: FileTree, ctx: LayerCtx): void {
    const isNext = ctx.app.base === 'next'

    tree.write('eslint.config.mjs', isNext ? NEXT_CONFIG : TS_CONFIG)
    tree.write('.prettierrc', PRETTIERRC)

    tree.pkg.addDevDep('eslint', dep('eslint'))
    tree.pkg.addDevDep('prettier', dep('prettier'))

    if (isNext) {
      // Next ships its own rule set; linting a Next app without it misses
      // framework-specific correctness rules.
      tree.pkg.addDevDep('eslint-config-next', dep('eslint-config-next'))
    } else {
      tree.pkg.addDevDep('@eslint/js', dep('@eslint/js'))
      tree.pkg.addDevDep('typescript-eslint', dep('typescript-eslint'))
    }

    tree.pkg.addScript('lint', 'eslint .')
    tree.pkg.addScript('format', 'prettier --write .')
  },
}

registerLayer(eslintPrettierLayer)
