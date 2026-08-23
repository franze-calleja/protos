import type { FileTree } from '../tree/file-tree'
import type { LayerCtx } from '../layers/types'
import type { BaseId } from '../config/types'

export interface Base {
  id: BaseId
  label: string
  /** Whether this app runs a server — root layers use it to decide on Docker/compose. */
  isServer: boolean
  /**
   * How this base names a module import. Next uses the `@/` alias; a compiled
   * Node app must use a relative path, because Node resolves at runtime.
   */
  specifier(from: string, to: string): string
  /** Write static template files and seed the models. Runs before layers. */
  init(tree: FileTree, ctx: LayerCtx): void
  /** Render every composed file. Runs after all layers. */
  renderComposed(tree: FileTree, ctx: LayerCtx): void
}
