import type { ArchitectureStrategy, PathRole } from './types'
import { kebab } from './types'

const inModule = (name: string, suffix: string) =>
  `src/modules/${kebab(name)}/${name}.${suffix}.ts`

const PATHS: Partial<Record<PathRole, (name: string) => string>> = {
  route: (n) => inModule(n, 'route'),
  controller: (n) => inModule(n, 'controller'),
  service: (n) => inModule(n, 'service'),
  model: (n) => inModule(n, 'model'),
  // Modular Express groups shared code under src/shared, not src/lib.
  util: (n) => `src/shared/${n}.ts`,
  'db-client': () => 'src/shared/db.ts',
}

export const modularArch: ArchitectureStrategy = {
  id: 'modular',
  supports: (role) => role in PATHS,
  path(role, name = 'index') {
    const resolve = PATHS[role]
    if (!resolve) {
      throw new Error(`Role "${role}" is not supported by the modular architecture`)
    }
    return resolve(name)
  },
}
