import { registerAssembler } from './registry'
import type {
  Assembler,
  BuiltApp,
  ComposeService,
  CiStrategy,
  Deliverable,
  DockerStrategy,
} from './types'
import type { PackageManagerStrategy } from '../pm/types'
import type { FileTree } from '../tree/file-tree'
import type { AppSpec, ProtosConfig } from '../config/types'
import { getPackageManager } from '../pm'

const dockerStrategy = (pm: PackageManagerStrategy): DockerStrategy => ({
  buildContextIsProjectRoot: false,

  dockerfile(_app: BuiltApp): string {
    const setup = pm.dockerSetup()
    return [
      // lts-alpine rather than a pinned major: a scaffold should start on
      // current LTS, and the user pins it once they care about reproducibility.
      'FROM node:lts-alpine AS base',
      ...(setup ? [setup] : []),
      '',
      'FROM base AS build',
      'WORKDIR /app',
      // Source is copied before installing, not after. A deps-only stage caches
      // better, but any layer with a postinstall (prisma generate) needs its
      // files present — and a scaffold that builds beats one that caches.
      'COPY . .',
      // install(), not installFrozen(): protos cannot generate a lockfile
      // without running the package manager, so a frozen install would fail
      // on the very first build.
      `RUN ${pm.install()}`,
      `RUN ${pm.runScript('build')}`,
      '',
      'FROM base AS runtime',
      'WORKDIR /app',
      'ENV NODE_ENV=production',
      'COPY --from=build /app ./',
      'EXPOSE 3000',
      `CMD ${JSON.stringify(pm.runScript('start').split(' '))}`,
      '',
    ].join('\n')
  },

  service(app: BuiltApp, appPath: string): ComposeService {
    return {
      name: app.spec.id,
      build: { context: `./${appPath}`, dockerfile: 'Dockerfile' },
      ports: [`${app.spec.id === 'web' ? '3000' : '4000'}:3000`],
    }
  },
})

const ciStrategy = (pm: PackageManagerStrategy): CiStrategy => ({
  workflow(apps: BuiltApp[], appPaths: Map<string, string>): string {
    const jobs = apps
      .map(
        (app) => `  ${app.spec.id}:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ${appPaths.get(app.spec.id)}
    steps:
      - uses: actions/checkout@v4
${pm.ciSetupSteps()}
      - run: ${pm.install()}
      - run: ${pm.runScript('build')}`
      )
      .join('\n')

    return `name: CI

on:
  push:
  pull_request:

jobs:
${jobs}
`
  },
})

export const siblingsAssembler: Assembler = {
  id: 'siblings',
  hasProjectRoot: true,

  appPath(spec: AppSpec, cfg: ProtosConfig): string {
    return `${cfg.name}-${spec.id}`
  },

  assemble(apps: BuiltApp[], cfg: ProtosConfig, root: FileTree): Deliverable[] {
    const pm = getPackageManager(cfg.pm)
    const files = new Map<string, string>(root.toMap())
    for (const app of apps) {
      const prefix = this.appPath(app.spec, cfg)
      for (const [path, content] of app.tree.toMap()) {
        files.set(`${prefix}/${path}`, content)
      }
      // Each app installs independently, so its build permissions sit beside it.
      const pmFiles = pm.buildScriptFiles(app.tree.pkg.buildScriptPackages())
      for (const [file, content] of Object.entries(pmFiles)) {
        files.set(`${prefix}/${file}`, content)
      }
    }
    const sorted = new Map([...files.entries()].sort(([a], [b]) => a.localeCompare(b)))
    return [{ name: cfg.name, files: sorted }]
  },

  dockerStrategy,
  ciStrategy,
}

registerAssembler(siblingsAssembler)
