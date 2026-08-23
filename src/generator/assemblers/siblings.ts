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

const dockerStrategy = (pm: PackageManagerStrategy): DockerStrategy => ({
  dockerfile(_app: BuiltApp): string {
    const setup = pm.dockerSetup()
    return [
      'FROM node:24-alpine AS base',
      ...(setup ? [setup] : []),
      '',
      'FROM base AS deps',
      'WORKDIR /app',
      `COPY package.json ${pm.lockfile()}* ./`,
      // install(), not installFrozen(): protos cannot generate a lockfile
      // without running the package manager, so a frozen install would fail
      // on the very first build.
      `RUN ${pm.install()}`,
      '',
      'FROM base AS build',
      'WORKDIR /app',
      'COPY --from=deps /app/node_modules ./node_modules',
      'COPY . .',
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

  appPath(spec: AppSpec, cfg: ProtosConfig): string {
    return `${cfg.name}-${spec.id}`
  },

  assemble(apps: BuiltApp[], cfg: ProtosConfig, root: FileTree): Deliverable[] {
    const files = new Map<string, string>(root.toMap())
    for (const app of apps) {
      const prefix = this.appPath(app.spec, cfg)
      for (const [path, content] of app.tree.toMap()) {
        files.set(`${prefix}/${path}`, content)
      }
    }
    const sorted = new Map([...files.entries()].sort(([a], [b]) => a.localeCompare(b)))
    return [{ name: cfg.name, files: sorted }]
  },

  dockerStrategy,
  ciStrategy,
}

registerAssembler(siblingsAssembler)
