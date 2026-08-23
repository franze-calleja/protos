import type { FileTree } from '../tree/file-tree'
import type { AppSpec, BaseId, LayerId, LayoutId } from '../config/types'
import type { PackageManagerStrategy } from '../pm/types'
import type { ArchitectureStrategy } from '../arch/types'

export interface LayerCtx {
  app: AppSpec
  project: { name: string; layout: LayoutId }
  /** Derived from cfg.pm. Layers use it to name commands in docs and scripts. */
  pm: PackageManagerStrategy
  /** Derived from the app's arch. Layers resolve paths through it, never directly. */
  arch: ArchitectureStrategy
  /** Module specifier for importing `to` from within `from`, in the base's idiom. */
  specifier(from: string, to: string): string
  /** The other app in the project, if there is one. */
  sibling?: AppSpec
}

export interface Layer {
  id: LayerId
  label: string
  description: string
  appliesTo: BaseId[]
  requires?: LayerId[]
  conflictsWith?: LayerId[]
  /**
   * Paths this layer contributes, for the UI's preview. Asserted in tests.
   * Takes the base too, because a layer's output can differ per ecosystem.
   */
  manifest(arch: ArchitectureStrategy, base: BaseId): string[]
  apply(tree: FileTree, ctx: LayerCtx): void
}
