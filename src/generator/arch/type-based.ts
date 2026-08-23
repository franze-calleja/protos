import type { ArchitectureStrategy, PathRole } from './types'

const PATHS: Partial<Record<PathRole, (name: string) => string>> = {
  component: (n) => `src/components/${n}.tsx`,
  store: (n) => `src/store/${n}.ts`,
  util: (n) => `src/lib/${n}.ts`,
  'db-client': () => 'src/lib/db.ts',
}

export const typeBasedArch: ArchitectureStrategy = {
  id: 'type-based',
  supports: (role) => role in PATHS,
  path(role, name = 'index') {
    const resolve = PATHS[role]
    if (!resolve) {
      throw new Error(`Role "${role}" is not supported by the type-based architecture`)
    }
    return resolve(name)
  },
}
