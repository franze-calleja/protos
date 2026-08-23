import { describe, it, expect } from 'vitest'
import { getPackageManager } from '@/generator/pm'

describe('npm strategy', () => {
  const pm = getPackageManager('npm')

  it('prefixes scripts with run', () => {
    expect(pm.runScript('dev')).toBe('npm run dev')
  })

  it('uses ci for a frozen install', () => {
    expect(pm.installFrozen()).toBe('npm ci')
  })

  it('names the npm lockfile', () => {
    expect(pm.lockfile()).toBe('package-lock.json')
  })

  it('needs no extra docker setup because the node image ships npm', () => {
    expect(pm.dockerSetup()).toBe('')
  })

  it('declares workspaces in the root package.json, not a separate file', () => {
    expect(pm.workspaceFiles(['apps/api'])).toEqual({})
    expect(pm.workspacePkgFields(['apps/api'])).toEqual({ workspaces: ['apps/api'] })
  })

  it('uses a plain range for an internal dependency', () => {
    expect(pm.internalDep()).toBe('*')
  })
})

describe('pnpm strategy', () => {
  const pm = getPackageManager('pnpm')

  it('calls scripts directly', () => {
    expect(pm.runScript('dev')).toBe('pnpm dev')
  })

  it('uses a frozen lockfile install', () => {
    expect(pm.installFrozen()).toBe('pnpm install --frozen-lockfile')
  })

  it('names the pnpm lockfile', () => {
    expect(pm.lockfile()).toBe('pnpm-lock.yaml')
  })

  it('enables corepack in docker', () => {
    expect(pm.dockerSetup()).toContain('corepack enable')
  })

  it('declares workspaces in a separate yaml file', () => {
    expect(pm.workspaceFiles(['apps/api'])['pnpm-workspace.yaml']).toContain('apps/api')
    expect(pm.workspacePkgFields(['apps/api'])).toEqual({})
  })

  it('uses the workspace protocol for an internal dependency', () => {
    expect(pm.internalDep()).toBe('workspace:*')
  })
})

describe('getPackageManager', () => {
  it('rejects an unknown package manager rather than silently defaulting', () => {
    // @ts-expect-error deliberately invalid id
    expect(() => getPackageManager('yarn')).toThrow(/unknown package manager/i)
  })
})

describe('build script permissions', () => {
  it('npm needs no file, since it runs install scripts by default', () => {
    expect(getPackageManager('npm').buildScriptFiles(['prisma'])).toEqual({})
  })

  it('pnpm allows the listed packages in pnpm-workspace.yaml', () => {
    const files = getPackageManager('pnpm').buildScriptFiles(['prisma', '@prisma/engines'])
    const yaml = files['pnpm-workspace.yaml']
    expect(yaml).toContain('allowBuilds:')
    expect(yaml).toContain("'prisma': true")
    expect(yaml).toContain("'@prisma/engines': true")
  })

  it('pnpm emits nothing when no dependency needs a build script', () => {
    expect(getPackageManager('pnpm').buildScriptFiles([])).toEqual({})
  })
})

describe('packageManager field', () => {
  it('pins an exact version, which is what the field requires', () => {
    expect(getPackageManager('npm').packageManagerField()).toMatch(/^npm@\d+\.\d+\.\d+$/)
    expect(getPackageManager('pnpm').packageManagerField()).toMatch(/^pnpm@\d+\.\d+\.\d+$/)
  })

  it('never uses a range, which the field does not accept', () => {
    for (const id of ['npm', 'pnpm'] as const) {
      expect(getPackageManager(id).packageManagerField()).not.toContain('^')
    }
  })
})
