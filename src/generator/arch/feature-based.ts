import type { ArchitectureStrategy, PathRole } from './types'
import { kebab } from './types'

const PATHS: Partial<Record<PathRole, (name: string) => string>> = {
  component: (n) => `src/features/${kebab(n)}/${n}.tsx`,
  store: (n) => `src/features/${kebab(n)}/store.ts`,
  // Shared infrastructure deliberately stays shared — a feature folder is the
  // wrong home for something every feature depends on.
  util: (n) => `src/lib/${n}.ts`,
  'db-client': () => 'src/lib/db.ts',
}

export const featureBasedArch: ArchitectureStrategy = {
  id: 'feature-based',
  supports: (role) => role in PATHS,
  path(role, name = 'index') {
    const resolve = PATHS[role]
    if (!resolve) {
      throw new Error(`Role "${role}" is not supported by the feature-based architecture`)
    }
    return resolve(name)
  },
}
