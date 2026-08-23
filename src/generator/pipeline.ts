import { format } from 'prettier'
import type { ProtosConfig } from './config/types'
import { FileTree } from './tree/file-tree'
import { getBase } from './bases/registry'
import { resolveLayers } from './layers/resolve'
import { ROOT_LAYERS } from './layers/root-registry'
import { getAssembler } from './assemblers/registry'
import { getPackageManager } from './pm'
import { getArchitecture } from './arch'
import type { BuiltApp, Deliverable, ProjectTree } from './assemblers/types'
import './bases/index'
import './layers/index'
import './assemblers/index'

export async function generate(cfg: ProtosConfig): Promise<Deliverable[]> {
  const assembler = getAssembler(cfg.layout)
  const pm = getPackageManager(cfg.pm)

  // 1. Build each app: base seeds the tree, then layers apply.
  const apps: BuiltApp[] = cfg.apps.map((spec) => {
    const base = getBase(spec.base)
    const tree = new FileTree()
    const ctx = {
      app: spec,
      project: { name: cfg.name, layout: cfg.layout },
      pm,
      arch: getArchitecture(spec.arch),
      specifier: (from: string, to: string) => base.specifier(from, to),
      sibling: cfg.apps.find((a) => a.id !== spec.id),
    }
    base.init(tree, ctx)
    for (const layer of resolveLayers(spec)) layer.apply(tree, ctx)
    return { spec, tree, isServer: base.isServer }
  })

  // 2. Root layers run BEFORE renderComposed so their model edits still land.
  const project: ProjectTree = {
    root: new FileTree(),
    apps,
    appPath: (spec) => assembler.appPath(spec, cfg),
  }
  const rootCtx = {
    project: { name: cfg.name, layout: cfg.layout },
    pm,
    docker: assembler.dockerStrategy(pm),
    ci: assembler.ciStrategy(pm),
  }
  for (const id of cfg.layers) {
    const layer = ROOT_LAYERS[id]
    if (!layer) throw new Error(`Unknown root layer "${id}"`)
    if (layer.requiresServerApp && !apps.some((a) => a.isServer)) continue
    layer.applyRoot(project, rootCtx)
  }

  // 3. Materialise any package-manager files the selected layers require.
  for (const app of apps) {
    const needsBuild = app.tree.pkg.buildScriptPackages()
    for (const [file, content] of Object.entries(pm.buildScriptFiles(needsBuild))) {
      app.tree.write(file, content)
    }
  }

  // 4. Render every composed file.
  for (const app of apps) {
    const base = getBase(app.spec.base)
    base.renderComposed(app.tree, {
      app: app.spec,
      project: { name: cfg.name, layout: cfg.layout },
      pm,
      arch: getArchitecture(app.spec.arch),
      specifier: (from: string, to: string) => base.specifier(from, to),
      sibling: cfg.apps.find((a) => a.id !== app.spec.id),
    })
  }

  // 5. Place everything, then format.
  const deliverables = assembler.assemble(apps, cfg, project.root)
  return Promise.all(deliverables.map(formatDeliverable))
}

const PARSERS: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'babel',
  mjs: 'babel',
  json: 'json',
  md: 'markdown',
  css: 'css',
  yml: 'yaml',
  yaml: 'yaml',
}

async function formatDeliverable(d: Deliverable): Promise<Deliverable> {
  const formatted = new Map<string, string>()
  for (const [path, content] of d.files) {
    const parser = PARSERS[path.split('.').pop() ?? '']
    if (!parser) {
      formatted.set(path, content)
      continue
    }
    try {
      formatted.set(path, await format(content, { parser, semi: false, singleQuote: true }))
    } catch {
      // A file prettier cannot parse ships as-is; the smoke tier catches real breakage.
      formatted.set(path, content)
    }
  }
  return { ...d, files: formatted }
}
