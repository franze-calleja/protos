import { registerLayer } from './registry'
import type { Layer, LayerCtx } from './types'
import type { FileTree } from '../tree/file-tree'
import { dep } from '../versions'

const GLOBALS_CSS = `@import 'tailwindcss';
`

const POSTCSS_CONFIG = `const config = {
  plugins: { '@tailwindcss/postcss': {} },
}

export default config
`

export const tailwindLayer: Layer = {
  id: 'tailwind',
  label: 'Tailwind CSS',
  description: 'Utility-first CSS framework',
  appliesTo: ['next', 'vite-react'],
  // Both paths are framework-fixed, so the architecture makes no difference here.
  manifest: () => ['src/app/globals.css', 'postcss.config.mjs'],

  apply(tree: FileTree, _ctx: LayerCtx): void {
    tree.write('src/app/globals.css', GLOBALS_CSS)
    tree.write('postcss.config.mjs', POSTCSS_CONFIG)
    tree.pkg.addDevDep('tailwindcss', dep('tailwindcss'))
    tree.pkg.addDevDep('@tailwindcss/postcss', dep('@tailwindcss/postcss'))
  },
}

registerLayer(tailwindLayer)
