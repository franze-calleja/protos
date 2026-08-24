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

/** Next's App Router owns src/app; a Vite project has no such folder. */
function stylesheetPath(base: string): string {
  return base === 'next' ? 'src/app/globals.css' : 'src/index.css'
}

export const tailwindLayer: Layer = {
  id: 'tailwind',
  label: 'Tailwind CSS',
  description: 'Utility-first CSS framework',
  appliesTo: ['next', 'vite-react'],
  // The architecture makes no difference here, but the base does.
  manifest: (_arch, base) => [stylesheetPath(base), 'postcss.config.mjs'],

  apply(tree: FileTree, ctx: LayerCtx): void {
    const cssPath = stylesheetPath(ctx.app.base)
    tree.write(cssPath, GLOBALS_CSS)
    // Without this the stylesheet is dead code and Tailwind never applies.
    tree.sideEffects.add(cssPath)
    tree.write('postcss.config.mjs', POSTCSS_CONFIG)
    tree.pkg.addDevDep('tailwindcss', dep('tailwindcss'))
    tree.pkg.addDevDep('@tailwindcss/postcss', dep('@tailwindcss/postcss'))
  },
}

registerLayer(tailwindLayer)
