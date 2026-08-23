import type { ArchId } from '../config/types'

/**
 * What a file *is*, independent of where a given architecture puts it.
 * Layers name roles; architectures resolve them to paths.
 */
export type PathRole =
  | 'component'
  | 'store'
  | 'util'
  | 'db-client'
  | 'route'
  | 'controller'
  | 'service'
  | 'model'

export interface ArchitectureStrategy {
  id: ArchId
  /** Resolve a role to a concrete app-relative path. Throws for unsupported roles. */
  path(role: PathRole, name?: string): string
  /** Whether this architecture has a location for the role. */
  supports(role: PathRole): boolean
}

export function kebab(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}
