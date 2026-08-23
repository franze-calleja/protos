import type { LayerId, LayoutId } from '../config/types'
import type { CiStrategy, DockerStrategy, ProjectTree } from '../assemblers/types'
import type { PackageManagerStrategy } from '../pm/types'

export interface RootCtx {
  project: { name: string; layout: LayoutId }
  pm: PackageManagerStrategy
  docker: DockerStrategy
  ci: CiStrategy
}

export interface RootLayer {
  id: LayerId
  label: string
  description: string
  /** Skip this layer when no app in the project runs a server. */
  requiresServerApp?: boolean
  manifest: string[]
  applyRoot(project: ProjectTree, ctx: RootCtx): void
}
