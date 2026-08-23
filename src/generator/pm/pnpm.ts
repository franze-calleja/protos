import type { PackageManagerStrategy } from './types'

export const pnpmStrategy: PackageManagerStrategy = {
  id: 'pnpm',
  runScript: (script) => `pnpm ${script}`,
  installFrozen: () => 'pnpm install --frozen-lockfile',
  install: () => 'pnpm install',
  lockfile: () => 'pnpm-lock.yaml',
  dockerSetup: () => 'RUN corepack enable',
  ciSetupSteps: () => `      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: lts/*
          cache: pnpm`,
  // pnpm 10+ blocks dependency install scripts and fails the install
  // (ERR_PNPM_IGNORED_BUILDS) until they are explicitly allowed. As of pnpm 11
  // this lives in pnpm-workspace.yaml; the package.json field is ignored.
  buildScriptFiles: (packages): Record<string, string> => {
    if (packages.length === 0) return {}
    const entries = packages.map((p) => `  '${p}': true`).join('\n')
    return { 'pnpm-workspace.yaml': `allowBuilds:\n${entries}\n` }
  },
  internalDep: () => 'workspace:*',
  workspaceFiles: (appPaths) => ({
    'pnpm-workspace.yaml': `packages:\n${appPaths.map((p) => `  - '${p}'`).join('\n')}\n`,
  }),
  workspacePkgFields: () => ({}),
}
