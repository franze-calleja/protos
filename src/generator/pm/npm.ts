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
  // npm runs dependency install scripts by default, so nothing is needed.
  buildScriptFiles: () => ({}),
  packageManagerField: () => 'npm@12.0.2',
  internalDep: () => '*',
  workspaceFiles: () => ({}),
  workspacePkgFields: (appPaths) => ({ workspaces: appPaths }),
}
