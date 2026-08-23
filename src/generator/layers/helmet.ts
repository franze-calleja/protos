import { registerLayer } from './registry'
import type { Layer, LayerCtx } from './types'
import type { FileTree } from '../tree/file-tree'
import { dep } from '../versions'

/** Security headers go on first, before anything else touches the request. */
const HELMET_ORDER = 10

export const helmetLayer: Layer = {
  id: 'helmet',
  label: 'Helmet',
  description: 'Sensible security headers for Express',
  appliesTo: ['express'],
  manifest: () => [],

  apply(tree: FileTree, _ctx: LayerCtx): void {
    tree.pkg.addDep('helmet', dep('helmet'))
    tree.middleware.push({
      expr: 'helmet()',
      importName: 'helmet',
      importFrom: 'helmet',
      order: HELMET_ORDER,
    })
  },
}

registerLayer(helmetLayer)
