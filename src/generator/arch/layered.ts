import type { ArchitectureStrategy, PathRole } from './types'

const PATHS: Partial<Record<PathRole, (name: string) => string>> = {
  route: (n) => `src/routes/${n}.route.ts`,
  controller: (n) => `src/controllers/${n}.controller.ts`,
  service: (n) => `src/services/${n}.service.ts`,
  model: (n) => `src/models/${n}.model.ts`,
  util: (n) => `src/lib/${n}.ts`,
  'db-client': () => 'src/lib/db.ts',
}

export const layeredArch: ArchitectureStrategy = {
  id: 'layered',
  supports: (role) => role in PATHS,
  path(role, name = 'index') {
    const resolve = PATHS[role]
    if (!resolve) {
      throw new Error(`Role "${role}" is not supported by the layered architecture`)
    }
    return resolve(name)
  },
}
