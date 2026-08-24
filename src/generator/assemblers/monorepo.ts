import { registerAssembler } from './registry'
import type { Assembler, BuiltApp, CiStrategy, Deliverable, DockerStrategy } from './types'
import type { PackageManagerStrategy } from '../pm/types'
import type { FileTree } from '../tree/file-tree'
import type { AppSpec, ProtosConfig } from '../config/types'
import { getPackageManager } from '../pm'
import { dep } from '../versions'

const WORKSPACE_GLOBS = ['apps/*', 'packages/*']

const TURBO_JSON = `{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "test": { "dependsOn": ["^build"] },
    "lint": {},
    "dev": { "cache": false, "persistent": true }
  }
}
`

const TYPES_INDEX = `/**
 * Types shared between the apps in this workspace.
 *
 * Put request and response shapes here rather than duplicating them: an API
 * change then surfaces as a type error on the other side, at build time.
 */

export interface Health {
  status: 'ok'
  uptime: number
}

export interface ApiError {
  message: string
}
`

const TYPES_TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "commonjs",
    "moduleResolution": "node10",
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
`

/** The whole workspace is copied rather than pruned — see Plan 3's decisions. */
const dockerStrategy = (pm: PackageManagerStrategy): DockerStrategy => ({
  // A workspace app cannot build alone; the context is the whole repo.
  buildContextIsProjectRoot: true,

  dockerfile(app: BuiltApp, appPath: string): string {
    const setup = pm.dockerSetup()
    return [
      'FROM node:lts-alpine AS base',
      ...(setup ? [setup] : []),
      'WORKDIR /repo',
      '',
      'FROM base AS build',
      'COPY . .',
      `RUN ${pm.install()}`,
      `RUN ${pm.runScript('build')}`,
      '',
      'FROM base AS runtime',
      'ENV NODE_ENV=production',
      'COPY --from=build /repo ./',
      `WORKDIR /repo/${appPath}`,
      'EXPOSE 3000',
      `CMD ${JSON.stringify(pm.runScript('start').split(' '))}`,
      '',
    ].join('\n')
  },

  service(app: BuiltApp, appPath: string) {
    return {
      name: app.spec.id,
      // Build context is the repo root: a workspace app cannot build alone.
      build: { context: '.', dockerfile: `${appPath}/Dockerfile` },
      ports: [`${app.spec.id === 'web' ? '3000' : '4000'}:3000`],
    }
  },
})

/** One install at the root, then turbo builds everything. */
const ciStrategy = (pm: PackageManagerStrategy): CiStrategy => ({
  workflow(): string {
    return `name: CI

on:
  push:
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
${pm.ciSetupSteps()}
      - run: ${pm.install()}
      - run: ${pm.runScript('build')}
`
  },
})

export const monorepoAssembler: Assembler = {
  id: 'monorepo',
  hasProjectRoot: true,

  appPath(spec: AppSpec, _cfg: ProtosConfig): string {
    return `apps/${spec.id}`
  },

  assemble(apps: BuiltApp[], cfg: ProtosConfig, root: FileTree): Deliverable[] {
    const pm = getPackageManager(cfg.pm)
    const files = new Map<string, string>(root.toMap())
    const sharedTypes = apps.length > 1 ? `@${cfg.name}/types` : null

    for (const app of apps) {
      const prefix = this.appPath(app.spec, cfg)
      // Workspace packages are scoped so internal deps can reference them.
      app.tree.pkg.setName(`@${cfg.name}/${app.spec.id}`)
      if (sharedTypes) app.tree.pkg.addDep(sharedTypes, pm.internalDep())
      // The base already rendered package.json, so renaming the model alone
      // would not change the emitted file. Re-render it.
      app.tree.write('package.json', app.tree.pkg.render(), { overwrite: true })
      for (const [path, content] of app.tree.toMap()) {
        files.set(`${prefix}/${path}`, content)
      }
    }

    if (sharedTypes) {
      files.set('packages/types/package.json', renderTypesPackage(cfg))
      files.set('packages/types/tsconfig.json', TYPES_TSCONFIG)
      files.set('packages/types/src/index.ts', TYPES_INDEX)
    }

    // Workspace declaration and build permissions can target the same file
    // (pnpm-workspace.yaml), and pnpm only reads the one at the root, so they
    // are merged rather than overwriting each other.
    const buildPackages = [
      ...new Set(apps.flatMap((a) => a.tree.pkg.buildScriptPackages())),
    ].sort()
    const pmFiles: Record<string, string> = { ...pm.workspaceFiles(WORKSPACE_GLOBS) }
    for (const [file, content] of Object.entries(pm.buildScriptFiles(buildPackages))) {
      pmFiles[file] = pmFiles[file] ? `${pmFiles[file]}\n${content}` : content
    }
    for (const [file, content] of Object.entries(pmFiles)) {
      files.set(file, content)
    }
    files.set('turbo.json', TURBO_JSON)
    files.set('package.json', renderRootPackage(cfg, pm))

    const sorted = new Map([...files.entries()].sort(([a], [b]) => a.localeCompare(b)))
    return [{ name: cfg.name, files: sorted }]
  },

  dockerStrategy,
  ciStrategy,
}

function renderRootPackage(cfg: ProtosConfig, pm: PackageManagerStrategy): string {
  const json: Record<string, unknown> = {
    name: cfg.name,
    version: '0.1.0',
    private: true,
    // Turborepo will not resolve the workspace without this.
    packageManager: pm.packageManagerField(),
    ...pm.workspacePkgFields(WORKSPACE_GLOBS),
    scripts: {
      build: 'turbo build',
      dev: 'turbo dev',
      test: 'turbo test',
      lint: 'turbo lint',
    },
    devDependencies: { turbo: dep('turbo') },
  }
  return `${JSON.stringify(json, null, 2)}\n`
}

function renderTypesPackage(cfg: ProtosConfig): string {
  return `${JSON.stringify(
    {
      name: `@${cfg.name}/types`,
      version: '0.1.0',
      private: true,
      main: 'dist/index.js',
      types: 'dist/index.d.ts',
      scripts: { build: 'tsc' },
      devDependencies: { typescript: dep('typescript') },
    },
    null,
    2
  )}\n`
}

registerAssembler(monorepoAssembler)
