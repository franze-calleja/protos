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
  internalDep: () => 'workspace:*',
  workspaceFiles: (appPaths) => ({
    'pnpm-workspace.yaml': `packages:\n${appPaths.map((p) => `  - '${p}'`).join('\n')}\n`,
  }),
  workspacePkgFields: () => ({}),
}
