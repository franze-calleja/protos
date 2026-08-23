/**
 * Single source of truth for dependency versions in GENERATED projects.
 * Bumping a generated project's dependency is a one-file change.
 * Resolve real values with: npm view <pkg> version
 */
export const VERSIONS: Record<string, string> = {}

export function dep(name: string): string {
  const version = VERSIONS[name]
  if (!version) throw new Error(`No pinned version for "${name}" — add it to versions.ts`)
  return version
}
