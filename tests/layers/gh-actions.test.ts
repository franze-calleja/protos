import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'
import { ghActionsRootLayer } from '@/generator/layers/gh-actions'
import { siblingsAssembler } from '@/generator/assemblers/siblings'
import { getPackageManager } from '@/generator/pm'
import type { ProjectTree } from '@/generator/assemblers/types'
import type { RootCtx } from '@/generator/layers/root-types'
import type { ProtosConfig } from '@/generator/config/types'

const cfg: ProtosConfig = {
  v: 1,
  name: 'hrims',
  layout: 'siblings',
  pm: 'npm',
  apps: [{ id: 'api', base: 'express', arch: 'layered', layers: [], options: {} }],
  layers: ['gh-actions'],
}

const ctxFor = (pmId: 'npm' | 'pnpm'): RootCtx => {
  const pm = getPackageManager(pmId)
  return {
    project: { name: 'hrims', layout: 'siblings' },
    pm,
    docker: siblingsAssembler.dockerStrategy(pm),
    ci: siblingsAssembler.ciStrategy(pm),
  }
}

const project = (): ProjectTree => ({
  root: new FileTree(),
  apps: [{ spec: cfg.apps[0], tree: new FileTree(), isServer: true }],
  appPath: (s) => siblingsAssembler.appPath(s, cfg),
})

const workflowFor = (pmId: 'npm' | 'pnpm'): string => {
  const p = project()
  ghActionsRootLayer.applyRoot(p, ctxFor(pmId))
  return p.root.read('.github/workflows/ci.yml')!
}

describe('gh-actions root layer', () => {
  it('writes a workflow at the project root, not inside an app', () => {
    const p = project()
    ghActionsRootLayer.applyRoot(p, ctxFor('npm'))
    expect(p.root.exists('.github/workflows/ci.yml')).toBe(true)
    expect(p.apps[0].tree.exists('.github/workflows/ci.yml')).toBe(false)
  })

  it('gives each app its own job scoped to that app directory', () => {
    const wf = workflowFor('npm')
    expect(wf).toContain('  api:')
    expect(wf).toContain('working-directory: hrims-api')
  })

  it('takes its setup steps from the package manager, not a branch on layout', () => {
    expect(workflowFor('npm')).toContain('cache: npm')
    expect(workflowFor('pnpm')).toContain('pnpm/action-setup')
  })

  it('runs on push and pull request', () => {
    const wf = workflowFor('npm')
    expect(wf).toContain('push:')
    expect(wf).toContain('pull_request:')
  })
})
