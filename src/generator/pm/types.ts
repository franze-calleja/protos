import type { PmId } from '../config/types'

export interface PackageManagerStrategy {
  id: PmId
  /** The command a human runs for a script, e.g. `npm run dev`. */
  runScript(script: string): string
  /** Install for a checkout that already has a lockfile. */
  installFrozen(): string
  /** Install when no lockfile exists yet. */
  install(): string
  lockfile(): string
  /** Dockerfile lines that make this package manager available. */
  dockerSetup(): string
  /** GitHub Actions steps that make this package manager available. */
  ciSetupSteps(): string
  /**
   * The exact `packageManager` field value, e.g. `pnpm@11.23.0`. Turborepo
   * refuses to resolve a workspace without it.
   */
  packageManagerField(): string
  /** Version range used for a workspace-internal dependency. */
  internalDep(): string
  /** Files needed so the listed dependencies may run their install scripts. */
  buildScriptFiles(packages: string[]): Record<string, string>
  /** Extra root files needed to declare a workspace. */
  workspaceFiles(appPaths: string[]): Record<string, string>
  /** Root package.json fields needed to declare a workspace. */
  workspacePkgFields(appPaths: string[]): Record<string, unknown>
}
