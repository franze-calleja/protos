import type { PackageManagerStrategy } from './types'

export const npmStrategy: PackageManagerStrategy = {
  id: 'npm',
  runScript: (script) => `npm run ${script}`,
  installFrozen: () => 'npm ci',
  install: () => 'npm install',
  lockfile: () => 'package-lock.json',
  dockerSetup: () => '',
  ciSetupSteps: () => `      - uses: actions/setup-node@v4
        with:
          node-version: lts/*
          cache: npm`,
  internalDep: () => '*',
  workspaceFiles: () => ({}),
  workspacePkgFields: (appPaths) => ({ workspaces: appPaths }),
}
