import { registerRootLayer } from './root-registry'
import type { RootCtx, RootLayer } from './root-types'
import type { ProjectTree } from '../assemblers/types'

export const ghActionsRootLayer: RootLayer = {
  id: 'gh-actions',
  label: 'GitHub Actions',
  description: 'A CI workflow that installs and builds every app',
  requiresProjectRoot: true,
  manifest: ['.github/workflows/ci.yml'],

  applyRoot(project: ProjectTree, ctx: RootCtx): void {
    const appPaths = new Map(project.apps.map((a) => [a.spec.id, project.appPath(a.spec)]))
    // The workflow shape comes from the assembler's CiStrategy, so this layer
    // never learns what layout it is running under.
    project.root.write('.github/workflows/ci.yml', ctx.ci.workflow(project.apps, appPaths))
  },
}

registerRootLayer(ghActionsRootLayer)
