import { registerAssembler } from './registry'
import type { Assembler, BuiltApp, Deliverable } from './types'
import type { PackageManagerStrategy } from '../pm/types'
import type { FileTree } from '../tree/file-tree'
import type { AppSpec, ProtosConfig } from '../config/types'
import { siblingsAssembler } from './siblings'

export const separateAssembler: Assembler = {
  id: 'separate',
  // Two independent projects share no directory, so there is nowhere for a
  // compose file or a single CI workflow to live.
  hasProjectRoot: false,

  appPath(spec: AppSpec, cfg: ProtosConfig): string {
    return `${cfg.name}-${spec.id}`
  },

  assemble(apps: BuiltApp[], cfg: ProtosConfig, _root: FileTree): Deliverable[] {
    return apps.map((app) => ({
      name: this.appPath(app.spec, cfg),
      files: new Map([...app.tree.toMap().entries()].sort(([a], [b]) => a.localeCompare(b))),
    }))
  },

  // Each project is self-contained, so its Dockerfile and CI shape match siblings'.
  dockerStrategy: (pm: PackageManagerStrategy) => siblingsAssembler.dockerStrategy(pm),
  ciStrategy: (pm: PackageManagerStrategy) => siblingsAssembler.ciStrategy(pm),
}

registerAssembler(separateAssembler)
