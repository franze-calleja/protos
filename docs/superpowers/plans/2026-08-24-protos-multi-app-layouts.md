# protos Multi-App Layouts — Implementation Plan (Plan 3 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate two-app projects in all three layouts, with a shared types package that turns backend/frontend drift into a type error.

**Architecture:** Completes the `Assembler` seam. `separate` emits N independent deliverables and has no project root; `monorepo` emits one workspace with `apps/*` and `packages/*`. Both take their workspace declaration and internal dependency protocol from `PackageManagerStrategy`, so neither branches on the package manager.

**Tech Stack:** Turborepo 2.10, npm/pnpm workspaces, Express 5 + Next 16 as the paired apps.

**Spec:** `docs/superpowers/specs/2026-08-23-protos-design.md`

**Predecessors:** Plans 1 and 2, both executed and merged (PR #1). Read their execution-notes headers.

> **Execution notes (2026-08-24).** Three things this plan did not anticipate,
> all found by tier 3 and all in the monorepo + pnpm + prisma combination:
>
> 1. **pnpm's `allowBuilds` was written to the wrong place.** The pipeline
>    emitted it per app, but pnpm reads only the workspace file at the root, so
>    a monorepo install failed with the same `ERR_PNPM_IGNORED_BUILDS` already
>    fixed once for siblings. Placement is layout-dependent, so it moved out of
>    the pipeline and into the assemblers.
> 2. **`esbuild` also needs its install script.** It arrives via `tsx` (Express
>    base) and `vite` (vitest layer). The mechanism was right; it just needed
>    the callers that actually bring the dependency to declare it.
> 3. **Turborepo 2.10 requires a `packageManager` field** in the root
>    package.json or it refuses to resolve the workspace. That is
>    package-manager knowledge, so `PackageManagerStrategy` supplies it as an
>    exact pinned version.
>
> Adding prisma to config 06 specifically to exercise this combination is what
> surfaced all three. Configs chosen to cross axes earn their place.

## Why this plan matters

Three things built in Plan 1 have never run: `PackageManagerStrategy.workspaceFiles`, `PackageManagerStrategy.internalDep`, and `ctx.sibling`. All three exist solely for this plan. If the Assembler seam was designed wrong, this is where it shows — which is exactly why we shipped all three layouts in v1 rather than deferring monorepo.

## Global Constraints

- **No database, no persistence, no code execution during generation.**
- **`src/generator/` imports nothing from `next`** — enforced by `tests/architecture.test.ts`.
- **Generation is deterministic**; layer order never changes output.
- **Layers never branch on layout.** Only assemblers and root layers know about it.
- **Every generated project must install and build** — proven by tier 3, not assumed.
- **Never fabricate versions.** `turbo: '^2.10.11'` confirmed via `npm view turbo version`.
- **protos itself uses npm.** Targeted tests run as `npm test -- <path>`.

## Decisions made in this plan

**`separate` has no project root.** Two independent projects have nowhere shared to put a `docker-compose.yml` that starts both — that file would contradict the layout. Rather than silently dropping it, the combination is rejected: `Assembler` gains `hasProjectRoot`, root layers gain `requiresProjectRoot`, and the schema refuses `docker`/`gh-actions` with `separate`, surfacing a reason the UI can show.

**Monorepo does not hoist devDependencies.** Each app keeps its own. Hoisting is an optimisation that complicates every layer's `addDevDep` and buys little at scaffold size. Revisit if it becomes a real problem.

**The monorepo Dockerfile copies the whole workspace** rather than using `turbo prune`. Prune produces smaller images but is fiddly, and — important caveat — **nothing in our test tiers builds a Docker image**, so a clever Dockerfile would be unverified cleverness. Task 5 adds a manual `docker build` check; automating it is noted as a known gap.

## File Structure

```
src/generator/
  assemblers/
    types.ts            # MODIFY — Assembler gains hasProjectRoot
    separate.ts         # NEW
    monorepo.ts         # NEW
    index.ts            # MODIFY — register both
  layers/
    root-types.ts       # MODIFY — RootLayer gains requiresProjectRoot
    docker.ts           # MODIFY — declare requiresProjectRoot
    gh-actions.ts       # MODIFY — declare requiresProjectRoot
  config/
    types.ts            # MODIFY — ROOT_LAYER_IDS, LAYOUTS_WITHOUT_ROOT
    schema.ts           # MODIFY — reject root layers with separate
  pipeline.ts           # MODIFY — packages/types emission
tests/
  assemblers/separate.test.ts     # NEW
  assemblers/monorepo.test.ts     # NEW
  smoke/smoke.test.ts             # MODIFY — layout-aware
  snapshots/configs.ts            # MODIFY — two-app configs
```

---

### Task 1: The separate assembler and the project-root rule

**Files:**
- Create: `src/generator/assemblers/separate.ts`
- Modify: `src/generator/assemblers/types.ts`, `src/generator/assemblers/siblings.ts`, `src/generator/assemblers/index.ts`, `src/generator/layers/root-types.ts`, `src/generator/layers/docker.ts`, `src/generator/layers/gh-actions.ts`, `src/generator/config/types.ts`, `src/generator/config/schema.ts`
- Test: `tests/assemblers/separate.test.ts`

**Interfaces:**
- Produces: `separateAssembler`; `Assembler.hasProjectRoot: boolean`; `RootLayer.requiresProjectRoot?: boolean`; `ROOT_LAYER_IDS`, `LAYOUTS_WITHOUT_ROOT`

- [ ] **Step 1: Write the failing test**

Create `tests/assemblers/separate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'
import { separateAssembler } from '@/generator/assemblers/separate'
import { siblingsAssembler } from '@/generator/assemblers/siblings'
import { parseConfig } from '@/generator/config/schema'
import { ConfigError } from '@/generator/config/errors'
import type { BuiltApp } from '@/generator/assemblers/types'
import type { ProtosConfig } from '@/generator/config/types'

const cfg: ProtosConfig = {
  v: 1, name: 'hrims', layout: 'separate', pm: 'npm',
  apps: [
    { id: 'api', base: 'express', arch: 'layered', layers: [], options: {} },
    { id: 'web', base: 'next', arch: 'type-based', layers: [], options: {} },
  ],
  layers: [],
}

function apps(): BuiltApp[] {
  return cfg.apps.map((spec) => {
    const tree = new FileTree()
    tree.write('src/index.ts', `// ${spec.id}`)
    return { spec, tree, isServer: true }
  })
}

describe('separate assembler', () => {
  it('produces one deliverable per app', () => {
    const out = separateAssembler.assemble(apps(), cfg, new FileTree())
    expect(out).toHaveLength(2)
    expect(out.map((d) => d.name).sort()).toEqual(['hrims-api', 'hrims-web'])
  })

  it('places each app at its own root, unprefixed', () => {
    const out = separateAssembler.assemble(apps(), cfg, new FileTree())
    expect([...out[0].files.keys()]).toEqual(['src/index.ts'])
  })

  it('declares that it has no project root', () => {
    expect(separateAssembler.hasProjectRoot).toBe(false)
    expect(siblingsAssembler.hasProjectRoot).toBe(true)
  })

  it('discards nothing, because no root files can reach it', () => {
    const root = new FileTree()
    root.write('docker-compose.yml', 'services: {}')
    const out = separateAssembler.assemble(apps(), cfg, root)
    for (const d of out) expect(d.files.has('docker-compose.yml')).toBe(false)
  })
})

describe('root layers require a project root', () => {
  const base = { v: 1, name: 'hrims', apps: cfg.apps, pm: 'npm' }

  it('rejects docker with the separate layout, with a reason', () => {
    expect(() => parseConfig({ ...base, layout: 'separate', layers: ['docker'] })).toThrow(
      /project root/i
    )
  })

  it('rejects gh-actions with the separate layout', () => {
    expect(() => parseConfig({ ...base, layout: 'separate', layers: ['gh-actions'] })).toThrow(
      ConfigError
    )
  })

  it('allows root layers with siblings', () => {
    expect(parseConfig({ ...base, layout: 'siblings', layers: ['docker'] }).layers).toEqual([
      'docker',
    ])
  })

  it('allows a separate project with no root layers', () => {
    expect(parseConfig({ ...base, layout: 'separate', layers: [] }).layout).toBe('separate')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/assemblers/separate.test.ts`
Expected: FAIL — cannot resolve `@/generator/assemblers/separate`

- [ ] **Step 3: Add hasProjectRoot to the contract**

In `src/generator/assemblers/types.ts`, add to `Assembler`:

```ts
  /** Whether this layout has a shared project root that root layers can write to. */
  hasProjectRoot: boolean
```

In `src/generator/assemblers/siblings.ts`, add `hasProjectRoot: true,` to the exported object.

- [ ] **Step 4: Write the separate assembler**

Create `src/generator/assemblers/separate.ts`:

```ts
import { registerAssembler } from './registry'
import type { Assembler, BuiltApp, Deliverable } from './types'
import type { PackageManagerStrategy } from '../pm/types'
import type { FileTree } from '../tree/file-tree'
import type { AppSpec, ProtosConfig } from '../config/types'
import { siblingsAssembler } from './siblings'

export const separateAssembler: Assembler = {
  id: 'separate',
  // Two independent projects share no directory, so there is nowhere for a
  // compose file or a single CI workflow to live.
  hasProjectRoot: false,

  appPath(spec: AppSpec, cfg: ProtosConfig): string {
    return `${cfg.name}-${spec.id}`
  },

  assemble(apps: BuiltApp[], cfg: ProtosConfig, _root: FileTree): Deliverable[] {
    return apps.map((app) => ({
      name: this.appPath(app.spec, cfg),
      files: new Map([...app.tree.toMap().entries()].sort(([a], [b]) => a.localeCompare(b))),
    }))
  },

  // Each project is self-contained, so its Dockerfile and CI shape match siblings'.
  dockerStrategy: (pm: PackageManagerStrategy) => siblingsAssembler.dockerStrategy(pm),
  ciStrategy: (pm: PackageManagerStrategy) => siblingsAssembler.ciStrategy(pm),
}

registerAssembler(separateAssembler)
```

Register it in `src/generator/assemblers/index.ts` with `import './separate'`.

- [ ] **Step 5: Declare the rule in config**

In `src/generator/config/types.ts`:

```ts
/** Layers that write at the project root rather than inside an app. */
export const ROOT_LAYER_IDS: readonly LayerId[] = ['docker', 'gh-actions']

/** Layouts with no shared project root, so root layers cannot apply. */
export const LAYOUTS_WITHOUT_ROOT: readonly LayoutId[] = ['separate']
```

In `src/generator/config/schema.ts`, add a `superRefine` to `configSchema`:

```ts
export const configSchema = z
  .object({ /* unchanged */ })
  .superRefine((cfg, ctx) => {
    if (!LAYOUTS_WITHOUT_ROOT.includes(cfg.layout)) return
    for (const id of cfg.layers) {
      if (ROOT_LAYER_IDS.includes(id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['layers'],
          message: `"${id}" needs a project root, which the "${cfg.layout}" layout does not have`,
        })
      }
    }
  })
```

Import `ROOT_LAYER_IDS` and `LAYOUTS_WITHOUT_ROOT` at the top.

- [ ] **Step 6: Declare it on the root layers, and guard the duplication**

In `src/generator/layers/root-types.ts`, add to `RootLayer`:

```ts
  /** This layer writes at the project root and cannot apply without one. */
  requiresProjectRoot?: boolean
```

Add `requiresProjectRoot: true,` to both `dockerRootLayer` and `ghActionsRootLayer`.

`ROOT_LAYER_IDS` duplicates knowledge the registry already holds, so assert they agree. Add to `tests/layers/gh-actions.test.ts`:

```ts
import { ROOT_LAYERS } from '@/generator/layers/root-registry'
import { ROOT_LAYER_IDS } from '@/generator/config/types'
import '@/generator/layers/index'

describe('root layer declarations', () => {
  it('keeps ROOT_LAYER_IDS in step with the registry', () => {
    expect([...ROOT_LAYER_IDS].sort()).toEqual(Object.keys(ROOT_LAYERS).sort())
  })

  it('marks every root layer as needing a project root', () => {
    for (const layer of Object.values(ROOT_LAYERS)) {
      expect(layer!.requiresProjectRoot, layer!.id).toBe(true)
    }
  })
})
```

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit && npm test`
Expected: PASS. Any existing config pairing `separate` with a root layer would now fail — there are none.

- [ ] **Step 8: Commit**

```bash
git add src/generator tests
git commit -m "feat: add separate assembler and the project-root rule"
```

---

### Task 2: The monorepo assembler

**Files:**
- Create: `src/generator/assemblers/monorepo.ts`
- Modify: `src/generator/assemblers/index.ts`, `src/generator/versions.ts`
- Test: `tests/assemblers/monorepo.test.ts`

**Interfaces:**
- Consumes: `PackageManagerStrategy.workspaceFiles`, `workspacePkgFields`, `internalDep`
- Produces: `monorepoAssembler`

- [ ] **Step 1: Write the failing test**

Create `tests/assemblers/monorepo.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'
import { monorepoAssembler } from '@/generator/assemblers/monorepo'
import { getPackageManager } from '@/generator/pm'
import type { BuiltApp } from '@/generator/assemblers/types'
import type { ProtosConfig } from '@/generator/config/types'

const cfg: ProtosConfig = {
  v: 1, name: 'hrims', layout: 'monorepo', pm: 'npm',
  apps: [
    { id: 'api', base: 'express', arch: 'layered', layers: [], options: {} },
    { id: 'web', base: 'next', arch: 'type-based', layers: [], options: {} },
  ],
  layers: [],
}

function apps(): BuiltApp[] {
  return cfg.apps.map((spec) => {
    const tree = new FileTree()
    tree.write('src/index.ts', `// ${spec.id}`)
    tree.pkg.setName(`hrims-${spec.id}`)
    return { spec, tree, isServer: true }
  })
}

const filesOf = (c: ProtosConfig = cfg) =>
  monorepoAssembler.assemble(apps(), c, new FileTree())[0].files

describe('monorepo assembler', () => {
  it('produces one deliverable named after the project', () => {
    const out = monorepoAssembler.assemble(apps(), cfg, new FileTree())
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('hrims')
  })

  it('places apps under apps/', () => {
    expect(monorepoAssembler.appPath(cfg.apps[0], cfg)).toBe('apps/api')
    expect([...filesOf().keys()]).toEqual(expect.arrayContaining(['apps/api/src/index.ts']))
  })

  it('emits a root package.json and turbo config', () => {
    const files = filesOf()
    expect(files.has('package.json')).toBe(true)
    expect(files.has('turbo.json')).toBe(true)
  })

  it('declares npm workspaces in the root package.json', () => {
    const root = JSON.parse(filesOf().get('package.json')!)
    expect(root.workspaces).toEqual(expect.arrayContaining(['apps/*', 'packages/*']))
    expect(root.private).toBe(true)
  })

  it('declares pnpm workspaces in a separate yaml instead', () => {
    const files = filesOf({ ...cfg, pm: 'pnpm' })
    expect(files.has('pnpm-workspace.yaml')).toBe(true)
    expect(JSON.parse(files.get('package.json')!).workspaces).toBeUndefined()
  })

  it('scopes each app package name to the project', () => {
    const pkg = JSON.parse(filesOf().get('apps/api/package.json')!)
    expect(pkg.name).toBe('@hrims/api')
  })

  it('routes root scripts through turbo', () => {
    const root = JSON.parse(filesOf().get('package.json')!)
    expect(root.scripts.build).toContain('turbo')
    expect(root.devDependencies.turbo).toBeDefined()
  })

  it('has a project root, unlike separate', () => {
    expect(monorepoAssembler.hasProjectRoot).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/assemblers/monorepo.test.ts`
Expected: FAIL — cannot resolve `@/generator/assemblers/monorepo`

- [ ] **Step 3: Write the assembler**

Create `src/generator/assemblers/monorepo.ts`:

```ts
import { registerAssembler } from './registry'
import type {
  Assembler,
  BuiltApp,
  CiStrategy,
  Deliverable,
  DockerStrategy,
} from './types'
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

/** The whole workspace is copied rather than pruned — see the plan's decisions. */
const dockerStrategy = (pm: PackageManagerStrategy): DockerStrategy => ({
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
      `RUN ${pm.runScript(`build -- --filter=${app.spec.id}`)}`,
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
      - run: ${pm.runScript('test')}
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

    for (const app of apps) {
      const prefix = this.appPath(app.spec, cfg)
      // Workspace packages are scoped so internal deps can reference them.
      app.tree.pkg.setName(`@${cfg.name}/${app.spec.id}`)
      // The base already rendered package.json, so renaming the model alone
      // would not change the emitted file. Re-render it.
      app.tree.write('package.json', app.tree.pkg.render(), { overwrite: true })
      for (const [path, content] of app.tree.toMap()) {
        files.set(`${prefix}/${path}`, content)
      }
    }

    for (const [file, content] of Object.entries(pm.workspaceFiles(WORKSPACE_GLOBS))) {
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

registerAssembler(monorepoAssembler)
```

- [ ] **Step 4: Register it and add the version**

`import './monorepo'` in `src/generator/assemblers/index.ts`; add `turbo: '^2.10.11'` to `VERSIONS`.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm test -- tests/assemblers`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/generator tests
git commit -m "feat: add monorepo assembler with workspaces and turborepo"
```

---

### Task 3: The shared types package

**Files:**
- Modify: `src/generator/assemblers/monorepo.ts`
- Test: `tests/assemblers/monorepo.test.ts`

**Interfaces:**
- Consumes: `PackageManagerStrategy.internalDep()`, `ctx.sibling`
- Produces: `packages/types` in a two-app monorepo, depended on by both apps

This is the payoff for the whole layout axis: an API change on one side becomes a type error on the other rather than a runtime surprise.

**Why the package is built rather than consumed from source.** Apps resolve `@name/types` through the workspace symlink, and TypeScript follows the package's `main`/`types` fields. Pointing those at `src/index.ts` would make each consuming app compile files outside its own `rootDir`, which `tsc` refuses. So the package emits `dist/` and Turborepo's `dependsOn: ["^build"]` guarantees it builds first.

- [ ] **Step 1: Write the failing test**

Add to `tests/assemblers/monorepo.test.ts`:

```ts
describe('shared types package', () => {
  it('emits packages/types for a two-app project', () => {
    const files = filesOf()
    expect(files.has('packages/types/package.json')).toBe(true)
    expect(files.has('packages/types/src/index.ts')).toBe(true)
    expect(files.has('packages/types/tsconfig.json')).toBe(true)
  })

  it('scopes the package and builds it to dist', () => {
    const pkg = JSON.parse(filesOf().get('packages/types/package.json')!)
    expect(pkg.name).toBe('@hrims/types')
    expect(pkg.types).toBe('dist/index.d.ts')
    expect(pkg.scripts.build).toBe('tsc')
  })

  it('makes both apps depend on it', () => {
    const files = filesOf()
    for (const id of ['api', 'web']) {
      const pkg = JSON.parse(files.get(`apps/${id}/package.json`)!)
      expect(pkg.dependencies['@hrims/types'], id).toBeDefined()
    }
  })

  it('uses the plain range under npm and the workspace protocol under pnpm', () => {
    const npmPkg = JSON.parse(filesOf().get('apps/api/package.json')!)
    expect(npmPkg.dependencies['@hrims/types']).toBe('*')

    const pnpmFiles = filesOf({ ...cfg, pm: 'pnpm' })
    const pnpmPkg = JSON.parse(pnpmFiles.get('apps/api/package.json')!)
    expect(pnpmPkg.dependencies['@hrims/types']).toBe('workspace:*')
  })

  it('omits the package for a single-app monorepo, which has nothing to share', () => {
    const solo: ProtosConfig = { ...cfg, apps: [cfg.apps[0]] }
    const out = monorepoAssembler.assemble(
      [
        (() => {
          const tree = new FileTree()
          tree.write('src/index.ts', '// api')
          return { spec: solo.apps[0], tree, isServer: true }
        })(),
      ],
      solo,
      new FileTree()
    )
    expect(out[0].files.has('packages/types/package.json')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/assemblers/monorepo.test.ts`
Expected: FAIL — no `packages/types` emitted

- [ ] **Step 3: Emit the package**

In `src/generator/assemblers/monorepo.ts`, add the templates:

```ts
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
```

Then compute the shared dependency before the app loop, and replace the loop body from Task 2 with this version (the only change is the `addDep` line):

```ts
    const sharedTypes = apps.length > 1 ? `@${cfg.name}/types` : null

    for (const app of apps) {
      const prefix = this.appPath(app.spec, cfg)
      app.tree.pkg.setName(`@${cfg.name}/${app.spec.id}`)
      if (sharedTypes) app.tree.pkg.addDep(sharedTypes, pm.internalDep())
      // The base already rendered package.json, so re-render it with the new name.
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
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm test -- tests/assemblers`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/generator tests
git commit -m "feat: emit a shared types package in two-app monorepos"
```

---

### Task 4: Layout-aware smoke harness and two-app configs

**Files:**
- Modify: `tests/smoke/smoke.test.ts`, `tests/snapshots/configs.ts`

**Interfaces:**
- Consumes: `getAssembler`, `CANONICAL_CONFIGS`

The smoke harness currently hardcodes the siblings shape (`${name}-${apps[0].id}`) and builds only the first app. Every layout in this plan breaks that assumption.

- [ ] **Step 1: Make the harness layout-aware**

Replace the body of the test in `tests/smoke/smoke.test.ts` with:

```ts
import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { generate } from '@/generator/pipeline'
import { getPackageManager } from '@/generator/pm'
import { getAssembler } from '@/generator/assemblers/registry'
import type { Deliverable } from '@/generator/assemblers/types'
import type { ProtosConfig } from '@/generator/config/types'
import { CANONICAL_CONFIGS } from '../snapshots/configs'

function run(command: string, cwd: string): void {
  const [cmd, ...args] = command.split(' ')
  execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 600_000 })
}

/**
 * Where install and build must run for a given layout:
 * - monorepo: once at the workspace root, turbo builds every app
 * - separate: once per independent project
 * - siblings: once per app folder inside the single deliverable
 */
function buildTargets(cfg: ProtosConfig, deliverables: Deliverable[], dir: string): string[] {
  if (cfg.layout === 'monorepo') return [path.join(dir, deliverables[0].name)]
  if (cfg.layout === 'separate') return deliverables.map((d) => path.join(dir, d.name))
  const assembler = getAssembler(cfg.layout)
  return cfg.apps.map((spec) =>
    path.join(dir, deliverables[0].name, assembler.appPath(spec, cfg))
  )
}

describe('smoke matrix', () => {
  for (const { name, config } of CANONICAL_CONFIGS) {
    it(`generates a project that installs and builds: ${name}`, async () => {
      const dir = mkdtempSync(path.join(tmpdir(), `protos-${name}-`))
      try {
        const deliverables = await generate(config)
        for (const deliverable of deliverables) {
          for (const [file, content] of deliverable.files) {
            const full = path.join(dir, deliverable.name, file)
            mkdirSync(path.dirname(full), { recursive: true })
            writeFileSync(full, content)
          }
        }

        const pm = getPackageManager(config.pm)
        for (const target of buildTargets(config, deliverables, dir)) {
          run(pm.install(), target)
          run(pm.runScript('build'), target)
        }
        expect(true).toBe(true)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  }
})
```

- [ ] **Step 2: Add the two-app configs**

Append to `CANONICAL_CONFIGS` in `tests/snapshots/configs.ts`. These are the spec's matrix configs 4, 5 and 6.

```ts
  {
    name: '05-express-next-siblings-npm',
    config: {
      v: 1, name: 'demo', layout: 'siblings', pm: 'npm',
      apps: [
        { id: 'api', base: 'express', arch: 'layered', layers: ['zod', 'pino'], options: {} },
        { id: 'web', base: 'next', arch: 'type-based', layers: ['tailwind'], options: {} },
      ],
      layers: ['docker', 'gh-actions'],
    },
  },
  {
    name: '06-express-next-monorepo-pnpm',
    config: {
      v: 1, name: 'demo', layout: 'monorepo', pm: 'pnpm',
      apps: [
        { id: 'api', base: 'express', arch: 'modular', layers: ['zod'], options: {} },
        { id: 'web', base: 'next', arch: 'feature-based', layers: ['tailwind'], options: {} },
      ],
      layers: ['docker', 'gh-actions'],
    },
  },
  {
    name: '07-express-next-separate-npm',
    config: {
      v: 1, name: 'demo', layout: 'separate', pm: 'npm',
      apps: [
        { id: 'api', base: 'express', arch: 'layered', layers: ['vitest'], options: {} },
        { id: 'web', base: 'next', arch: 'type-based', layers: [], options: {} },
      ],
      layers: [],
    },
  },
```

Config 07 has no root layers, because `separate` has no project root — Task 1 makes that a validation error rather than a silent drop.

- [ ] **Step 3: Record and read the snapshots**

Run: `npm test -- tests/snapshots -u`

Then read them:

```bash
sed -n '/06-express-next-monorepo-pnpm/,/^`;$/p' tests/snapshots/__snapshots__/snapshot.test.ts.snap
```

Confirm by eye: `apps/api/*` and `apps/web/*`, `packages/types/src/index.ts`, `pnpm-workspace.yaml`, `turbo.json`, and a root `package.json`. Confirm config 07 produces two top-level deliverables with no shared root file. A snapshot recorded without reading it is worthless.

- [ ] **Step 4: Run the full smoke matrix**

Run: `npm run smoke`
Expected: PASS for all nine configs. This is slow — nine real installs and builds.

The monorepo config is the one to watch: it installs once at the root and lets turbo build `packages/types`, then both apps. If `@demo/types` fails to resolve, the cause is the package's `main`/`types` fields or the workspace declaration, not the app code.

- [ ] **Step 5: Commit**

```bash
git add tests
git commit -m "test: make the smoke harness layout-aware and add two-app configs"
```

---

### Task 5: Verify a generated Dockerfile actually builds

**Files:**
- Modify: `docs/superpowers/specs/2026-08-23-protos-design.md`

**Interfaces:** none — this is a verification task.

protos has been generating Dockerfiles since Plan 1 and **nothing has ever built one.** The smoke tier runs install and build, not `docker build`. That is a real gap in the "generated projects work" claim, and the monorepo Dockerfile — with its repo-root build context — is the most likely to be wrong.

- [ ] **Step 1: Build a siblings Dockerfile by hand**

```bash
cat > /tmp/gen-docker.ts <<'EOF'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { generate } from '/Users/franzecalleja/protos/src/generator/pipeline'
import { CANONICAL_CONFIGS } from '/Users/franzecalleja/protos/tests/snapshots/configs'

const target = CANONICAL_CONFIGS.find((c) => c.name.startsWith('05'))!
rmSync('/tmp/dockercheck', { recursive: true, force: true })
for (const d of await generate(target.config)) {
  for (const [file, content] of d.files) {
    const full = path.join('/tmp/dockercheck', d.name, file)
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, content)
  }
}
console.log('written')
EOF
npx vite-node /tmp/gen-docker.ts
cd /tmp/dockercheck/demo && docker build -f demo-api/Dockerfile demo-api
```

Expected: the image builds. If it fails, fix the `dockerStrategy` in `siblings.ts` and re-run — this is the first time that file has been executed.

- [ ] **Step 2: Build a monorepo Dockerfile by hand**

```bash
cd /Users/franzecalleja/protos
sed -i '' "s/startsWith('05')/startsWith('06')/" /tmp/gen-docker.ts
npx vite-node /tmp/gen-docker.ts
cd /tmp/dockercheck/demo && docker build -f apps/api/Dockerfile .
```

Note the build context is `.` (the repo root), not the app folder — a workspace app cannot build alone. Expected: the image builds.

- [ ] **Step 3: Record the gap in the spec**

Add to §11, after the Tier 3 description:

> **Known gap: generated Dockerfiles are not built in CI.** Tier 3 runs install
> and build, not `docker build`, so a broken Dockerfile ships undetected. They
> are verified by hand when the Docker strategy changes. Automating one
> `docker build` per layout in the nightly job is the obvious fix and is not
> yet done.

- [ ] **Step 4: Commit**

```bash
git add docs
git commit -m "docs: record that generated Dockerfiles are not built in CI"
```

## Definition of done for Plan 3

- [ ] `npm test` passes — tiers 1 and 2
- [ ] `npm run smoke` passes — all nine configs install and build
- [ ] `npx tsc --noEmit` clean
- [ ] A two-app monorepo builds `packages/types` first and both apps resolve `@demo/types`
- [ ] `separate` produces two independent projects, and pairing it with `docker` is a validation error with a readable message
- [ ] npm gets `"@demo/types": "*"`, pnpm gets `"workspace:*"` — from the strategy, not a branch
- [ ] One siblings and one monorepo Dockerfile have actually been built with `docker build`

## What Plan 4 inherits

Every interface is now implemented and exercised: 4 architectures, 3 layouts, 2 package managers, 2 bases. Plan 4 adds `vite-react` and `expo` plus the React layers — pure repetition against proven shapes, with no new abstractions expected.
