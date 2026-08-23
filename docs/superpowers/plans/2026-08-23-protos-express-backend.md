# protos Express & Backend — Implementation Plan (Plan 2 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach protos to generate a working Express API in two architectures, with the backend layers that make it production-shaped.

**Architecture:** Extends the interfaces Plan 1 proved. The `layered` and `modular` architectures implement the `route`/`controller`/`service`/`model` roles that currently throw. The Express base composes `src/app.ts` from the `middleware` model, which Plan 1 built but nothing has used yet. Layers stay layout-, package-manager-, and architecture-agnostic.

**Tech Stack:** Express 5, TypeScript 5.9, tsx, pino, helmet, express-rate-limit, Zod 4, Vitest 4 + supertest, ESLint 10 + typescript-eslint 8.

**Spec:** `docs/superpowers/specs/2026-08-23-protos-design.md`

**Predecessor:** `docs/superpowers/plans/2026-08-23-protos-generator-core.md` (executed; read its execution-notes header)

> **⚠ INCOMPLETE — do not execute yet.** Tasks 1–7 are written. Still to be
> written before this plan is runnable:
> - **Task 8** — the `eslint-prettier` layer (flat config, ESLint 10 +
>   typescript-eslint 8, `lint`/`format` scripts)
> - **Task 9** — the `gh-actions` RootLayer, rendering `.github/workflows/ci.yml`
>   from `ctx.ci` (the `CiStrategy` built in Plan 1 and still unused)
> - **Task 10** — Express smoke configs added to `tests/snapshots/configs.ts`,
>   plus a self-review pass over the whole plan
>
> No self-review has run over Tasks 1–7 yet either.

## Where this sits

| Plan | Scope | Status |
|---|---|---|
| 1 — Generator core | Config, models, contracts, `next` base, 3 layers, siblings, ZIP, API | **done** |
| **2 — Express & backend (this plan)** | express base, layered/modular, 6 layers, gh-actions | — |
| 3 — Multi-app layouts | `separate` + `monorepo` assemblers, `packages/types` | — |
| 4 — Frontend breadth | vite-react, expo, React layers | — |
| 5 — Web UI | Two-column generator, live preview, share links | — |

Express is the keystone: `getArchitecture('layered')` currently throws, and the
`separate`/`monorepo` assemblers in Plan 3 are meaningless without a second app
to pair with `next`.

## Global Constraints

Carried from Plan 1 and the spec. Every task's requirements implicitly include these.

- **No database, no persistence, no code execution during generation.** Nothing shells out.
- **`src/generator/` imports nothing from `next`.** Enforced by `tests/architecture.test.ts`.
- **Generation is deterministic** — same config, byte-identical output, regardless of layer order.
- **A layer may never string-patch a file another layer wrote.** `FileTree.write` throws on collision.
- **Layers are layout-, package-manager-, and architecture-agnostic.** They name roles and call strategies; they never branch on `ctx.project.layout`.
- **Every architecture must generate a working vertical slice**, not empty folders.
- **Never fabricate dependency versions.** All generated-project versions live in `src/generator/versions.ts`, resolved with `npm view <pkg> version`.
- **protos itself uses npm.** Run targeted tests as `npm test -- <path>`.
- **Verify against current docs, not memory.** Plan 1 lost time to a Prisma 6 assumption; Express 5 and ESLint 10 are both majors here.

### Versions resolved for this plan

Confirmed against the registry. Add to `src/generator/versions.ts` as each task needs them.

```ts
express: '^5.2.1',
'@types/express': '^5.0.6',
tsx: '^4.23.12',
pino: '^10.3.1',
'pino-http': '^11.0.0',
'pino-pretty': '^13.1.3',
helmet: '^8.3.0',
'express-rate-limit': '^8.6.2',
supertest: '^7.2.2',
'@types/supertest': '^7.2.1',
eslint: '^10.9.0',
prettier: '^3.9.6',
'typescript-eslint': '^8.67.0',
'@eslint/js': '^10.0.1',
```

**Compatibility checked:** `typescript-eslint@8` peers `eslint ^8.57 || ^9 || ^10` and `typescript >=4.8.4 <6.1.0`. Our pinned TypeScript `^5.9.3` satisfies it — and note TypeScript 7 would **not**, which is a second reason the TS 5 pin stands.

## File Structure

```
src/generator/
  arch/
    layered.ts                 # NEW — express, grouped by technical role
    modular.ts                 # NEW — express, grouped by feature module
    index.ts                   # MODIFY — register both
  bases/
    express/
      files.ts                 # NEW — tsconfig, .env template
      index.ts                 # NEW — base + src/app.ts composition
    types.ts                   # MODIFY — Base gains specifier()
    index.ts                   # MODIFY — register express
  layers/
    types.ts                   # MODIFY — LayerCtx gains specifier()
    vitest.ts                  # NEW
    zod.ts                     # NEW
    pino.ts                    # NEW
    helmet.ts                  # NEW
    rate-limit.ts              # NEW
    eslint-prettier.ts         # NEW
    gh-actions.ts              # NEW — RootLayer
    prisma.ts                  # MODIFY — use ctx.specifier, not a hardcoded alias
    index.ts                   # MODIFY — register all
  pipeline.ts                  # MODIFY — supply ctx.specifier
tests/
  arch/backend.test.ts         # NEW
  bases/express.test.ts        # NEW
  layers/{vitest,zod,pino,middleware,eslint-prettier,gh-actions}.test.ts
  snapshots/configs.ts         # MODIFY — express configs
```

---

### Task 1: Backend architectures — layered and modular

**Files:**
- Create: `src/generator/arch/layered.ts`, `src/generator/arch/modular.ts`
- Modify: `src/generator/arch/index.ts`, `docs/superpowers/specs/2026-08-23-protos-design.md`
- Test: `tests/arch/backend.test.ts`

**Interfaces:**
- Consumes: `ArchitectureStrategy`, `PathRole`, `kebab` from `src/generator/arch/types.ts`
- Produces: `layeredArch`, `modularArch`, registered so `getArchitecture('layered')` and `getArchitecture('modular')` stop throwing

**Spec correction to make in this task.** §3.5's role table says `modular` puts the db client at `src/shared/db.ts`, but the prose below it claims shared infrastructure stays in `src/lib` under *every* architecture. Those disagree. The table is right — `src/modules/*` + `src/shared/*` is the idiomatic modular Express layout. Narrow the prose to say *the React-family architectures*, which is what it was actually about.

- [ ] **Step 1: Write the failing test**

Create `tests/arch/backend.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getArchitecture } from '@/generator/arch'

describe('layered architecture', () => {
  const arch = getArchitecture('layered')

  it('groups files by technical role', () => {
    expect(arch.path('route', 'health')).toBe('src/routes/health.route.ts')
    expect(arch.path('controller', 'health')).toBe('src/controllers/health.controller.ts')
    expect(arch.path('service', 'health')).toBe('src/services/health.service.ts')
    expect(arch.path('model', 'user')).toBe('src/models/user.model.ts')
  })

  it('keeps shared infrastructure in lib', () => {
    expect(arch.path('db-client')).toBe('src/lib/db.ts')
    expect(arch.path('util', 'logger')).toBe('src/lib/logger.ts')
  })

  it('has no home for frontend roles', () => {
    expect(arch.supports('component')).toBe(false)
    expect(() => arch.path('component', 'Hello')).toThrow(/not supported/i)
  })
})

describe('modular architecture', () => {
  const arch = getArchitecture('modular')

  it('groups a feature\'s files together under one module folder', () => {
    expect(arch.path('route', 'health')).toBe('src/modules/health/health.route.ts')
    expect(arch.path('controller', 'health')).toBe('src/modules/health/health.controller.ts')
    expect(arch.path('service', 'health')).toBe('src/modules/health/health.service.ts')
  })

  it('kebab-cases a multi-word module folder', () => {
    expect(arch.path('route', 'userProfile')).toBe(
      'src/modules/user-profile/userProfile.route.ts'
    )
  })

  it('puts shared infrastructure in shared, not lib', () => {
    expect(arch.path('db-client')).toBe('src/shared/db.ts')
    expect(arch.path('util', 'logger')).toBe('src/shared/logger.ts')
  })

  it('has no home for frontend roles either', () => {
    expect(() => arch.path('store', 'counter')).toThrow(/not supported/i)
  })
})

describe('the two backend architectures differ where it matters', () => {
  it('places a service differently', () => {
    expect(getArchitecture('layered').path('service', 'health')).not.toBe(
      getArchitecture('modular').path('service', 'health')
    )
  })

  it('places the db client differently, unlike the frontend pair', () => {
    expect(getArchitecture('layered').path('db-client')).not.toBe(
      getArchitecture('modular').path('db-client')
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/arch/backend.test.ts`
Expected: FAIL — `Architecture "layered" is not implemented yet`

- [ ] **Step 3: Write both architectures**

Create `src/generator/arch/layered.ts`:

```ts
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
```

Create `src/generator/arch/modular.ts`:

```ts
import type { ArchitectureStrategy, PathRole } from './types'
import { kebab } from './types'

const module = (name: string, suffix: string) =>
  `src/modules/${kebab(name)}/${name}.${suffix}.ts`

const PATHS: Partial<Record<PathRole, (name: string) => string>> = {
  route: (n) => module(n, 'route'),
  controller: (n) => module(n, 'controller'),
  service: (n) => module(n, 'service'),
  model: (n) => module(n, 'model'),
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
```

- [ ] **Step 4: Register them**

In `src/generator/arch/index.ts`, add the imports and map entries:

```ts
import { layeredArch } from './layered'
import { modularArch } from './modular'
```

```ts
const STRATEGIES: Partial<Record<ArchId, ArchitectureStrategy>> = {
  'type-based': typeBasedArch,
  'feature-based': featureBasedArch,
  layered: layeredArch,
  modular: modularArch,
}
```

- [ ] **Step 5: Fix the now-stale "not implemented" test**

`tests/arch/strategy.test.ts` asserts `getArchitecture('layered')` throws. That was true only while it was unimplemented. Replace that test with one that still guards the real behaviour:

```ts
describe('getArchitecture', () => {
  it('returns each implemented architecture', () => {
    for (const id of ['type-based', 'feature-based', 'layered', 'modular'] as const) {
      expect(getArchitecture(id).id).toBe(id)
    }
  })

  it('rejects an unknown architecture', () => {
    // @ts-expect-error deliberately invalid id
    expect(() => getArchitecture('hexagonal')).toThrow(/not implemented/i)
  })
})
```

- [ ] **Step 6: Correct the spec**

In §3.5, change the sentence beginning "Shared infrastructure stays in `src/lib` under every architecture" to read:

> Shared infrastructure stays in `src/lib` under both React-family architectures:
> feature-based organisation applies to feature code, and burying the database
> client inside one feature would make it harder to find, not easier. The
> modular Express architecture is the exception — it groups shared code under
> `src/shared`, which is that ecosystem's convention.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -- tests/arch`
Expected: PASS (all backend + frontend architecture tests)

- [ ] **Step 8: Commit**

```bash
git add src/generator/arch tests/arch docs/superpowers/specs
git commit -m "feat: implement layered and modular backend architectures"
```

---

### Task 2: Base-aware module specifiers

**Files:**
- Modify: `src/generator/bases/types.ts`, `src/generator/layers/types.ts`, `src/generator/bases/next/index.ts`, `src/generator/layers/prisma.ts`, `src/generator/pipeline.ts`
- Test: `tests/bases/specifier.test.ts`, and every existing test that builds a `LayerCtx`

**Interfaces:**
- Consumes: `Base`, `LayerCtx` from Plan 1
- Produces: `Base.specifier(from: string, to: string): string`, `LayerCtx.specifier(from, to)`

**Why this exists.** The prisma layer currently hardcodes `import { PrismaClient } from '@/generated/prisma/client'`. That alias is a Next/bundler convention. A compiled Express app resolves imports at runtime through Node, where `@/` means nothing — so `express` + `prisma` would produce a project that typechecks and then crashes on start. Layers must ask the base how to name a module instead of assuming.

- [ ] **Step 1: Write the failing test**

Create `tests/bases/specifier.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { nextBase } from '@/generator/bases/next'
import { expressBase } from '@/generator/bases/express'

describe('next specifiers', () => {
  it('uses the @ alias and drops the extension', () => {
    expect(nextBase.specifier('src/lib/db.ts', 'src/generated/prisma/client')).toBe(
      '@/generated/prisma/client'
    )
  })

  it('aliases a component path', () => {
    expect(nextBase.specifier('src/app/page.tsx', 'src/components/Hello.tsx')).toBe(
      '@/components/Hello'
    )
  })
})

describe('express specifiers', () => {
  it('uses a relative path, because Node resolves imports at runtime', () => {
    expect(expressBase.specifier('src/lib/db.ts', 'src/generated/prisma/client')).toBe(
      '../generated/prisma/client'
    )
  })

  it('prefixes a same-directory import with ./', () => {
    expect(expressBase.specifier('src/routes/health.route.ts', 'src/routes/util.ts')).toBe(
      './util'
    )
  })

  it('walks up out of a nested module folder', () => {
    expect(
      expressBase.specifier('src/modules/health/health.service.ts', 'src/shared/db.ts')
    ).toBe('../../shared/db')
  })

  it('never emits an alias, which Node cannot resolve', () => {
    expect(
      expressBase.specifier('src/controllers/health.controller.ts', 'src/services/health.service.ts')
    ).not.toContain('@/')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/bases/specifier.test.ts`
Expected: FAIL — cannot resolve `@/generator/bases/express` (Task 3 creates it; this test is written first because the contract belongs to this task)

**Note:** this test cannot pass until Task 3 lands the Express base. Implement Steps 3–6 now, and expect the `express` half of this file to stay red until Task 3 completes. The `next` half must pass at the end of this task.

- [ ] **Step 3: Add specifier to the Base contract**

In `src/generator/bases/types.ts`, add to the `Base` interface:

```ts
  /**
   * How this base names a module import. Next uses the `@/` alias; a compiled
   * Node app must use a relative path, because Node resolves at runtime.
   */
  specifier(from: string, to: string): string
```

- [ ] **Step 4: Add it to LayerCtx**

In `src/generator/layers/types.ts`, add to `LayerCtx`:

```ts
  /** Module specifier for importing `to` from within `from`, in the base's idiom. */
  specifier(from: string, to: string): string
```

- [ ] **Step 5: Implement it on the Next base**

In `src/generator/bases/next/index.ts`, replace the private `importSpecifier` helper with a method on the base object, and point `renderPage` at it:

```ts
export const nextBase: Base = {
  id: 'next',
  label: 'Next.js',
  isServer: true,

  specifier(_from: string, to: string): string {
    return `@/${to.replace(/^src\//, '').replace(/\.(tsx?|jsx?)$/, '')}`
  },
  // ... init and renderComposed unchanged except renderPage below
}
```

In `init`, change the page render call to pass the specifier through:

```ts
    tree.write('src/app/page.tsx', renderPage(nextBase.specifier('src/app/page.tsx', componentPath)))
```

And simplify `renderPage` to take the finished specifier:

```ts
function renderPage(componentSpecifier: string): string {
  return `import { Hello } from '${componentSpecifier}'

export default function Home() {
  return (
    <main>
      <Hello />
    </main>
  )
}
`
}
```

Delete the old standalone `importSpecifier` function.

- [ ] **Step 6: Make the prisma layer ask instead of assume**

In `src/generator/layers/prisma.ts`, change `client()` to take the specifier, and compute it in `apply`:

```ts
function client(target: Target, clientSpecifier: string): string {
  return `import { ${target.adapterClass} } from '${target.adapterPkg}'
import { PrismaClient } from '${clientSpecifier}'

const adapter = new ${target.adapterClass}({ connectionString: process.env.DATABASE_URL as string })

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
`
}
```

In `apply`, replace the `tree.write(ctx.arch.path('db-client'), client(target))` line with:

```ts
    const dbPath = ctx.arch.path('db-client')
    tree.write(dbPath, client(target, ctx.specifier(dbPath, `${GENERATED_DIR}/client`)))
```

- [ ] **Step 7: Supply it from the pipeline**

In `src/generator/pipeline.ts`, both `ctx` objects gain the specifier, bound to the app's base. In the app-building loop:

```ts
    const ctx = {
      app: spec,
      project: { name: cfg.name, layout: cfg.layout },
      pm,
      arch: getArchitecture(spec.arch),
      specifier: (from: string, to: string) => base.specifier(from, to),
      sibling: cfg.apps.find((a) => a.id !== spec.id),
    }
```

And in the `renderComposed` loop, where `base` is not in scope, resolve it first:

```ts
  for (const app of apps) {
    const base = getBase(app.spec.base)
    base.renderComposed(app.tree, {
      app: app.spec,
      project: { name: cfg.name, layout: cfg.layout },
      pm,
      arch: getArchitecture(app.spec.arch),
      specifier: (from: string, to: string) => base.specifier(from, to),
      sibling: cfg.apps.find((a) => a.id !== app.spec.id),
    })
  }
```

- [ ] **Step 8: Update every existing LayerCtx fixture**

`LayerCtx` gained a required member, so `tsc` will fail until each test fixture supplies it. Add this line to the ctx literal in `tests/bases/next.test.ts`, `tests/layers/tailwind.test.ts`, and `tests/layers/prisma.test.ts`:

```ts
  specifier: (from: string, to: string) => nextBase.specifier(from, to),
```

In the layer tests, import the base at the top: `import { nextBase } from '@/generator/bases/next'`.

- [ ] **Step 9: Verify**

Run: `npx tsc --noEmit && npm test -- tests/bases/next.test.ts tests/layers tests/pipeline.test.ts`
Expected: PASS. Snapshots will change (the prisma client import is unchanged for Next, so they should not — if any snapshot moves, read the diff and confirm it is only what you intended).

- [ ] **Step 10: Commit**

```bash
git add src/generator tests
git commit -m "refactor: let layers ask the base how to name a module import"
```

---

### Task 3: Express base with a working vertical slice

**Files:**
- Create: `src/generator/bases/express/files.ts`, `src/generator/bases/express/index.ts`
- Modify: `src/generator/bases/index.ts`
- Test: `tests/bases/express.test.ts`

**Interfaces:**
- Consumes: `Base`, `LayerCtx`, `FileTree`, `dep()`, `ctx.arch`, `ctx.pm`, `ctx.specifier`
- Produces: `expressBase` registered under id `express`

**Module system: CommonJS, deliberately.** Express 5, helmet, express-rate-limit, pino and the Prisma 7 client all work under CJS, and CJS lets relative imports stay extensionless — which keeps `specifier()` simple. Native ESM would require every generated relative import to carry a `.js` suffix. Revisit when the ecosystem forces it; there is no benefit here today.

**The vertical slice** is a real `/health` endpoint threaded through all three roles — route → controller → service — so switching architecture visibly moves working code rather than empty folders. `src/app.ts` is split from `src/index.ts` so the app can be imported by a test without binding a port.

- [ ] **Step 1: Write the failing test**

Create `tests/bases/express.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'
import { expressBase } from '@/generator/bases/express'
import { getPackageManager } from '@/generator/pm'
import { getArchitecture } from '@/generator/arch'
import type { LayerCtx } from '@/generator/layers/types'
import type { ArchId } from '@/generator/config/types'

const ctx = (arch: ArchId = 'layered'): LayerCtx => ({
  app: { id: 'api', base: 'express', arch, layers: [], options: {} },
  project: { name: 'hrims', layout: 'siblings' },
  pm: getPackageManager('npm'),
  arch: getArchitecture(arch),
  specifier: (from: string, to: string) => expressBase.specifier(from, to),
})

function build(arch: ArchId = 'layered'): FileTree {
  const tree = new FileTree()
  const c = ctx(arch)
  expressBase.init(tree, c)
  expressBase.renderComposed(tree, c)
  return tree
}

describe('express base', () => {
  it('emits the files an Express app needs to run', () => {
    const paths = build().paths()
    for (const p of ['package.json', 'tsconfig.json', 'src/app.ts', 'src/index.ts', '.gitignore', 'README.md']) {
      expect(paths).toContain(p)
    }
  })

  it('declares express as a dependency and its types as a devDependency', () => {
    const pkg = JSON.parse(build().read('package.json')!)
    expect(pkg.dependencies.express).toBeDefined()
    expect(pkg.devDependencies['@types/express']).toBeDefined()
    expect(pkg.devDependencies.tsx).toBeDefined()
  })

  it('compiles to dist and starts from it', () => {
    const pkg = JSON.parse(build().read('package.json')!)
    expect(pkg.scripts.build).toBe('tsc')
    expect(pkg.scripts.start).toBe('node dist/index.js')
    expect(pkg.scripts.dev).toContain('tsx')
  })

  it('is a server, so docker and compose apply to it', () => {
    expect(expressBase.isServer).toBe(true)
  })

  it('threads the health slice through route, controller, and service under layered', () => {
    const tree = build('layered')
    expect(tree.exists('src/routes/health.route.ts')).toBe(true)
    expect(tree.exists('src/controllers/health.controller.ts')).toBe(true)
    expect(tree.exists('src/services/health.service.ts')).toBe(true)
  })

  it('threads the same slice through one module folder under modular', () => {
    const tree = build('modular')
    expect(tree.exists('src/modules/health/health.route.ts')).toBe(true)
    expect(tree.exists('src/modules/health/health.controller.ts')).toBe(true)
    expect(tree.exists('src/modules/health/health.service.ts')).toBe(true)
    expect(tree.exists('src/routes/health.route.ts')).toBe(false)
  })

  it('wires the slice together with relative imports Node can resolve', () => {
    const controller = build('layered').read('src/controllers/health.controller.ts')!
    expect(controller).toContain('../services/health.service')
    expect(controller).not.toContain('@/')
  })

  it('mounts the router in app.ts', () => {
    const app = build().read('src/app.ts')!
    expect(app).toContain("app.use('/health'")
    expect(app).toContain('express.json()')
  })

  it('renders middleware a layer pushed, in order', () => {
    const tree = new FileTree()
    const c = ctx()
    expressBase.init(tree, c)
    tree.middleware.push({ expr: 'helmet()', importName: 'helmet', importFrom: 'helmet', order: 10 })
    expressBase.renderComposed(tree, c)
    const app = tree.read('src/app.ts')!
    expect(app).toContain("import helmet from 'helmet'")
    expect(app.indexOf('app.use(helmet())')).toBeLessThan(app.indexOf('app.use(express.json())'))
  })

  it('keeps index.ts free of app construction so tests can import app.ts', () => {
    const index = build().read('src/index.ts')!
    expect(index).toContain('app.listen')
    expect(index).not.toContain('express()')
  })

  it('documents the selected package manager', () => {
    expect(build().read('README.md')).toContain('npm run dev')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/bases/express.test.ts`
Expected: FAIL — cannot resolve `@/generator/bases/express`

- [ ] **Step 3: Write the static template files**

Create `src/generator/bases/express/files.ts`:

```ts
export const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "commonjs",
    "moduleResolution": "node10",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
`

export const INDEX = `import { app } from './app'

const port = Number(process.env.PORT ?? 3000)

app.listen(port, () => {
  console.log(\\\`listening on http://localhost:\\\${port}\\\`)
})
`

export const HEALTH_SERVICE = `export interface Health {
  status: 'ok'
  uptime: number
}

export function getHealth(): Health {
  return { status: 'ok', uptime: process.uptime() }
}
`
```

- [ ] **Step 4: Write the base**

Create `src/generator/bases/express/index.ts`:

```ts
import { registerBase } from '../registry'
import type { Base } from '../types'
import type { FileTree } from '../../tree/file-tree'
import type { LayerCtx } from '../../layers/types'
import { dep } from '../../versions'
import { TSCONFIG, INDEX, HEALTH_SERVICE } from './files'

/** Express's own body parser sits after security middleware, before routes. */
const JSON_MIDDLEWARE_ORDER = 50

export const expressBase: Base = {
  id: 'express',
  label: 'Express',
  isServer: true,

  specifier(from: string, to: string): string {
    const fromParts = from.split('/').slice(0, -1)
    const toClean = to.replace(/\.(tsx?|jsx?)$/, '')
    const toParts = toClean.split('/')

    let shared = 0
    while (shared < fromParts.length && shared < toParts.length - 1 && fromParts[shared] === toParts[shared]) {
      shared++
    }
    const up = fromParts.length - shared
    const rest = toParts.slice(shared).join('/')
    return up === 0 ? `./${rest}` : `${'../'.repeat(up)}${rest}`
  },

  init(tree: FileTree, ctx: LayerCtx): void {
    tree.write('tsconfig.json', TSCONFIG)
    tree.write('src/index.ts', INDEX)

    // The vertical slice: one real endpoint through every role the
    // architecture defines. Folder names alone would prove nothing.
    const servicePath = ctx.arch.path('service', 'health')
    const controllerPath = ctx.arch.path('controller', 'health')
    const routePath = ctx.arch.path('route', 'health')

    tree.write(servicePath, HEALTH_SERVICE)
    tree.write(controllerPath, renderController(ctx.specifier(controllerPath, servicePath)))
    tree.write(routePath, renderRoute(ctx.specifier(routePath, controllerPath)))

    tree.middleware.push({ expr: 'express.json()', order: JSON_MIDDLEWARE_ORDER })

    tree.pkg.setName(`${ctx.project.name}-${ctx.app.id}`)
    tree.pkg.addDep('express', dep('express'))
    tree.pkg.addDevDep('@types/express', dep('@types/express'))
    tree.pkg.addDevDep('@types/node', dep('@types/node'))
    tree.pkg.addDevDep('typescript', dep('typescript'))
    tree.pkg.addDevDep('tsx', dep('tsx'))
    tree.pkg.addScript('dev', 'tsx watch src/index.ts')
    tree.pkg.addScript('build', 'tsc')
    tree.pkg.addScript('start', 'node dist/index.js')

    for (const p of ['node_modules', 'dist', '.env', '*.log', '.DS_Store']) {
      tree.ignore.add(p)
    }

    tree.readme.section(
      'Getting started',
      ['```bash', ctx.pm.install(), ctx.pm.runScript('dev'), '```', '', 'Then GET http://localhost:3000/health.'].join('\n')
    )
  },

  renderComposed(tree: FileTree, ctx: LayerCtx): void {
    tree.write('src/app.ts', renderApp(tree, ctx))
    tree.write('package.json', tree.pkg.render())
    tree.write('.gitignore', tree.ignore.render())
    tree.write('README.md', tree.readme.render(`${ctx.project.name}-${ctx.app.id}`))

    if (tree.env.keys().length) {
      const env = tree.env.render()
      tree.write('.env', env.env)
      tree.write('.env.example', env.example)
    }
  },
}

function renderController(serviceSpecifier: string): string {
  return `import type { Request, Response } from 'express'
import { getHealth } from '${serviceSpecifier}'

export function healthHandler(_req: Request, res: Response): void {
  res.json(getHealth())
}
`
}

function renderRoute(controllerSpecifier: string): string {
  return `import { Router } from 'express'
import { healthHandler } from '${controllerSpecifier}'

const router = Router()

router.get('/', healthHandler)

export { router as healthRouter }
`
}

function renderApp(tree: FileTree, ctx: LayerCtx): string {
  const routePath = ctx.arch.path('route', 'health')
  const routeSpecifier = ctx.specifier('src/app.ts', routePath)

  return `import express from 'express'
${tree.middleware.imports()}import { healthRouter } from '${routeSpecifier}'

export const app = express()

${tree.middleware.statements()}
app.use('/health', healthRouter)
`
}

registerBase(expressBase)
```

- [ ] **Step 5: Register it**

In `src/generator/bases/index.ts`:

```ts
import './next'
import './express'
```

- [ ] **Step 6: Add the versions**

Add `express`, `@types/express`, and `tsx` to `VERSIONS` in `src/generator/versions.ts` using the values in this plan's Global Constraints. Confirm each with `npm view <pkg> version` before pasting.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx tsc --noEmit && npm test -- tests/bases`
Expected: PASS — including the `express` half of `tests/bases/specifier.test.ts` from Task 2

- [ ] **Step 8: Commit**

```bash
git add src/generator/bases src/generator/versions.ts tests/bases
git commit -m "feat: add Express base with a route-controller-service vertical slice"
```

---

### Task 4: The vitest layer

**Files:**
- Create: `src/generator/layers/vitest.ts`
- Modify: `src/generator/layers/index.ts`, `src/generator/versions.ts`
- Test: `tests/layers/vitest-layer.test.ts`

**Interfaces:**
- Consumes: `Layer`, `LayerCtx`, `dep()`
- Produces: `vitestLayer` registered under id `vitest`

The example test is base-appropriate rather than uniform: an Express app gets a real HTTP test of `/health` through supertest, which is worth having; a Next app gets a unit test of a generated util. A layer may branch on `ctx.app.base` — that is its own ecosystem, unlike layout or package manager, which it must never branch on.

- [ ] **Step 1: Write the failing test**

Create `tests/layers/vitest-layer.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'
import { vitestLayer } from '@/generator/layers/vitest'
import { getPackageManager } from '@/generator/pm'
import { getArchitecture } from '@/generator/arch'
import { nextBase } from '@/generator/bases/next'
import { expressBase } from '@/generator/bases/express'
import type { LayerCtx } from '@/generator/layers/types'

const nextCtx: LayerCtx = {
  app: { id: 'web', base: 'next', arch: 'type-based', layers: ['vitest'], options: {} },
  project: { name: 'hrims', layout: 'siblings' },
  pm: getPackageManager('npm'),
  arch: getArchitecture('type-based'),
  specifier: (f: string, t: string) => nextBase.specifier(f, t),
}

const expressCtx: LayerCtx = {
  app: { id: 'api', base: 'express', arch: 'layered', layers: ['vitest'], options: {} },
  project: { name: 'hrims', layout: 'siblings' },
  pm: getPackageManager('npm'),
  arch: getArchitecture('layered'),
  specifier: (f: string, t: string) => expressBase.specifier(f, t),
}

describe('vitest layer', () => {
  it('adds vitest and a test script', () => {
    const tree = new FileTree()
    vitestLayer.apply(tree, nextCtx)
    const pkg = JSON.parse(tree.pkg.render())
    expect(pkg.devDependencies.vitest).toBeDefined()
    expect(pkg.scripts.test).toBe('vitest run')
  })

  it('writes a vitest config', () => {
    const tree = new FileTree()
    vitestLayer.apply(tree, nextCtx)
    expect(tree.exists('vitest.config.ts')).toBe(true)
  })

  it('writes a real HTTP test against the health endpoint for express', () => {
    const tree = new FileTree()
    vitestLayer.apply(tree, expressCtx)
    const test = tree.read('tests/health.test.ts')!
    expect(test).toContain('supertest')
    expect(test).toContain('/health')
    const pkg = JSON.parse(tree.pkg.render())
    expect(pkg.devDependencies.supertest).toBeDefined()
  })

  it('writes a unit test and the util it exercises for next', () => {
    const tree = new FileTree()
    vitestLayer.apply(tree, nextCtx)
    expect(tree.exists('tests/example.test.ts')).toBe(true)
    expect(tree.exists(nextCtx.arch.path('util', 'greet'))).toBe(true)
  })

  it('does not pull supertest into a project that has no server', () => {
    const tree = new FileTree()
    vitestLayer.apply(tree, nextCtx)
    expect(tree.pkg.render()).not.toContain('supertest')
  })

  it('declares every path it writes in its manifest', () => {
    for (const c of [nextCtx, expressCtx]) {
      const tree = new FileTree()
      vitestLayer.apply(tree, c)
      for (const p of tree.paths()) expect(vitestLayer.manifest(c.arch)).toContain(p)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/layers/vitest-layer.test.ts`
Expected: FAIL — cannot resolve `@/generator/layers/vitest`

- [ ] **Step 3: Write the layer**

Create `src/generator/layers/vitest.ts`:

```ts
import { registerLayer } from './registry'
import type { Layer, LayerCtx } from './types'
import type { FileTree } from '../tree/file-tree'
import { dep } from '../versions'

const CONFIG = `import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
`

const GREET_UTIL = `export function greet(name: string): string {
  return \`Hello, \${name}\`
}
`

function greetTest(specifier: string): string {
  return `import { describe, it, expect } from 'vitest'
import { greet } from '${specifier}'

describe('greet', () => {
  it('greets by name', () => {
    expect(greet('protos')).toBe('Hello, protos')
  })
})
`
}

const HEALTH_TEST = `import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../src/app'

describe('GET /health', () => {
  it('reports ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })
})
`

export const vitestLayer: Layer = {
  id: 'vitest',
  label: 'Vitest',
  description: 'Unit and integration testing, with one real passing test',
  appliesTo: ['next', 'vite-react', 'express'],
  manifest: (arch) =>
    arch.supports('route')
      ? ['vitest.config.ts', 'tests/health.test.ts']
      : ['vitest.config.ts', 'tests/example.test.ts', arch.path('util', 'greet')],

  apply(tree: FileTree, ctx: LayerCtx): void {
    tree.write('vitest.config.ts', CONFIG)
    tree.pkg.addDevDep('vitest', dep('vitest'))
    tree.pkg.addScript('test', 'vitest run')

    if (ctx.app.base === 'express') {
      // A real request through the running app is worth more than a unit test here.
      tree.write('tests/health.test.ts', HEALTH_TEST)
      tree.pkg.addDevDep('supertest', dep('supertest'))
      tree.pkg.addDevDep('@types/supertest', dep('@types/supertest'))
      return
    }

    const utilPath = ctx.arch.path('util', 'greet')
    tree.write(utilPath, GREET_UTIL)
    tree.write('tests/example.test.ts', greetTest(ctx.specifier('tests/example.test.ts', utilPath)))
  },
}

registerLayer(vitestLayer)
```

- [ ] **Step 4: Register it and add versions**

In `src/generator/layers/index.ts` add `import './vitest'`. Add `supertest` and `@types/supertest` to `VERSIONS` (`vitest` is already there from Plan 1).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx tsc --noEmit && npm test -- tests/layers/vitest-layer.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add src/generator/layers src/generator/versions.ts tests/layers
git commit -m "feat: add vitest layer with a base-appropriate example test"
```

---

### Task 5: The zod layer

**Files:**
- Create: `src/generator/layers/zod.ts`
- Modify: `src/generator/layers/index.ts`
- Test: `tests/layers/zod-layer.test.ts`

**Interfaces:**
- Consumes: `Layer`, `LayerCtx`, `dep()`
- Produces: `zodLayer` registered under id `zod`

Zod earns its place by validating environment variables at startup, which is useful in every base and fails loudly instead of at 3am.

- [ ] **Step 1: Write the failing test**

Create `tests/layers/zod-layer.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'
import { zodLayer } from '@/generator/layers/zod'
import { getPackageManager } from '@/generator/pm'
import { getArchitecture } from '@/generator/arch'
import { expressBase } from '@/generator/bases/express'
import type { LayerCtx } from '@/generator/layers/types'
import type { ArchId } from '@/generator/config/types'

const ctx = (arch: ArchId = 'layered'): LayerCtx => ({
  app: { id: 'api', base: 'express', arch, layers: ['zod'], options: {} },
  project: { name: 'hrims', layout: 'siblings' },
  pm: getPackageManager('npm'),
  arch: getArchitecture(arch),
  specifier: (f: string, t: string) => expressBase.specifier(f, t),
})

describe('zod layer', () => {
  it('adds zod as a runtime dependency', () => {
    const tree = new FileTree()
    zodLayer.apply(tree, ctx())
    expect(JSON.parse(tree.pkg.render()).dependencies.zod).toBeDefined()
  })

  it('writes a validated env module at the architecture util path', () => {
    const tree = new FileTree()
    zodLayer.apply(tree, ctx('layered'))
    expect(tree.read('src/lib/env.ts')).toContain("z.object")
  })

  it('follows the modular architecture to src/shared', () => {
    const tree = new FileTree()
    zodLayer.apply(tree, ctx('modular'))
    expect(tree.exists('src/shared/env.ts')).toBe(true)
    expect(tree.exists('src/lib/env.ts')).toBe(false)
  })

  it('parses at import time so a bad environment fails fast', () => {
    const tree = new FileTree()
    zodLayer.apply(tree, ctx())
    expect(tree.read('src/lib/env.ts')).toContain('.parse(process.env)')
  })

  it('declares every path it writes in its manifest', () => {
    const c = ctx()
    const tree = new FileTree()
    zodLayer.apply(tree, c)
    for (const p of tree.paths()) expect(zodLayer.manifest(c.arch)).toContain(p)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/layers/zod-layer.test.ts`
Expected: FAIL — cannot resolve `@/generator/layers/zod`

- [ ] **Step 3: Write the layer**

Create `src/generator/layers/zod.ts`:

```ts
import { registerLayer } from './registry'
import type { Layer, LayerCtx } from './types'
import type { FileTree } from '../tree/file-tree'
import { dep } from '../versions'

const ENV_MODULE = `import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
})

/**
 * Parsed at import time: a misconfigured environment fails on boot with a
 * readable message rather than somewhere deep in a request later.
 */
export const env = envSchema.parse(process.env)
`

export const zodLayer: Layer = {
  id: 'zod',
  label: 'Zod',
  description: 'Schema validation, wired up to validate the environment on boot',
  appliesTo: ['next', 'vite-react', 'express', 'expo'],
  manifest: (arch) => [arch.path('util', 'env')],

  apply(tree: FileTree, ctx: LayerCtx): void {
    tree.write(ctx.arch.path('util', 'env'), ENV_MODULE)
    tree.pkg.addDep('zod', dep('zod'))
  },
}

registerLayer(zodLayer)
```

- [ ] **Step 4: Register it**

In `src/generator/layers/index.ts` add `import './zod'`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx tsc --noEmit && npm test -- tests/layers/zod-layer.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/generator/layers tests/layers
git commit -m "feat: add zod layer with boot-time environment validation"
```

---

### Task 6: The pino layer

**Files:**
- Create: `src/generator/layers/pino.ts`
- Modify: `src/generator/layers/index.ts`, `src/generator/versions.ts`
- Test: `tests/layers/pino-layer.test.ts`

**Interfaces:**
- Consumes: `Layer`, `LayerCtx`, `dep()`, `tree.middleware`
- Produces: `pinoLayer` registered under id `pino`

- [ ] **Step 1: Write the failing test**

Create `tests/layers/pino-layer.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'
import { pinoLayer } from '@/generator/layers/pino'
import { getPackageManager } from '@/generator/pm'
import { getArchitecture } from '@/generator/arch'
import { expressBase } from '@/generator/bases/express'
import { nextBase } from '@/generator/bases/next'
import type { LayerCtx } from '@/generator/layers/types'

const expressCtx: LayerCtx = {
  app: { id: 'api', base: 'express', arch: 'layered', layers: ['pino'], options: {} },
  project: { name: 'hrims', layout: 'siblings' },
  pm: getPackageManager('npm'),
  arch: getArchitecture('layered'),
  specifier: (f: string, t: string) => expressBase.specifier(f, t),
}

const nextCtx: LayerCtx = {
  app: { id: 'web', base: 'next', arch: 'type-based', layers: ['pino'], options: {} },
  project: { name: 'hrims', layout: 'siblings' },
  pm: getPackageManager('npm'),
  arch: getArchitecture('type-based'),
  specifier: (f: string, t: string) => nextBase.specifier(f, t),
}

describe('pino layer', () => {
  it('writes a logger module at the architecture util path', () => {
    const tree = new FileTree()
    pinoLayer.apply(tree, expressCtx)
    expect(tree.read('src/lib/logger.ts')).toContain('pino')
  })

  it('pretty-prints in development only', () => {
    const tree = new FileTree()
    pinoLayer.apply(tree, expressCtx)
    expect(tree.read('src/lib/logger.ts')).toContain('production')
  })

  it('registers request logging middleware for express', () => {
    const tree = new FileTree()
    pinoLayer.apply(tree, expressCtx)
    expect(tree.middleware.statements()).toContain('pinoHttp')
    expect(JSON.parse(tree.pkg.render()).dependencies['pino-http']).toBeDefined()
  })

  it('adds no middleware for next, which has no express app', () => {
    const tree = new FileTree()
    pinoLayer.apply(tree, nextCtx)
    expect(tree.middleware.statements()).toBe('')
    expect(tree.pkg.render()).not.toContain('pino-http')
  })

  it('logs before the body parser so failed parses are still recorded', () => {
    const tree = new FileTree()
    tree.middleware.push({ expr: 'express.json()', order: 50 })
    pinoLayer.apply(tree, expressCtx)
    const statements = tree.middleware.statements()
    expect(statements.indexOf('pinoHttp')).toBeLessThan(statements.indexOf('express.json'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/layers/pino-layer.test.ts`
Expected: FAIL — cannot resolve `@/generator/layers/pino`

- [ ] **Step 3: Write the layer**

Create `src/generator/layers/pino.ts`:

```ts
import { registerLayer } from './registry'
import type { Layer, LayerCtx } from './types'
import type { FileTree } from '../tree/file-tree'
import { dep } from '../versions'

/** Request logging goes before the body parser, so a failed parse is still logged. */
const PINO_HTTP_ORDER = 30

const LOGGER = `import pino from 'pino'

const isProduction = process.env.NODE_ENV === 'production'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
  // Structured JSON in production; readable lines while developing.
  transport: isProduction ? undefined : { target: 'pino-pretty' },
})
`

export const pinoLayer: Layer = {
  id: 'pino',
  label: 'Pino',
  description: 'Structured logging, with request logging wired into Express',
  appliesTo: ['next', 'express'],
  manifest: (arch) => [arch.path('util', 'logger')],

  apply(tree: FileTree, ctx: LayerCtx): void {
    const loggerPath = ctx.arch.path('util', 'logger')
    tree.write(loggerPath, LOGGER)
    tree.pkg.addDep('pino', dep('pino'))
    tree.pkg.addDevDep('pino-pretty', dep('pino-pretty'))

    if (ctx.app.base !== 'express') return

    tree.pkg.addDep('pino-http', dep('pino-http'))
    tree.middleware.push({
      expr: `pinoHttp({ logger })`,
      importName: 'pinoHttp',
      importFrom: 'pino-http',
      order: PINO_HTTP_ORDER,
    })
    tree.middleware.push({
      expr: '',
      importName: '{ logger }',
      importFrom: ctx.specifier('src/app.ts', loggerPath),
      order: PINO_HTTP_ORDER,
    })
  },
}

registerLayer(pinoLayer)
```

**Careful:** the second `push` above is wrong — `MiddlewareModel.statements()` would emit `app.use()` with an empty expression. Do not write it that way. Instead give `MiddlewareEntry` an optional `importOnly` flag in `src/generator/tree/middleware-model.ts`:

```ts
export interface MiddlewareEntry {
  expr: string
  importName?: string
  importFrom?: string
  order: number
  /** Contribute the import but no app.use() call. */
  importOnly?: boolean
}
```

and filter in `statements()`:

```ts
  statements(): string {
    return [...this.entries]
      .filter((e) => !e.importOnly)
      .sort((a, b) => a.order - b.order)
      .map((e) => `app.use(${e.expr})\n`)
      .join('')
  }
```

Then the second push becomes:

```ts
    tree.middleware.push({
      expr: '',
      importName: '{ logger }',
      importFrom: ctx.specifier('src/app.ts', loggerPath),
      order: PINO_HTTP_ORDER,
      importOnly: true,
    })
```

Add a test for it in `tests/tree/provider-model.test.ts`:

```ts
  it('contributes an import without an app.use call when importOnly is set', () => {
    const m = new MiddlewareModel()
    m.push({ expr: '', importName: '{ logger }', importFrom: './logger', order: 1, importOnly: true })
    expect(m.imports()).toContain('{ logger }')
    expect(m.statements()).toBe('')
  })
```

- [ ] **Step 4: Register it and add versions**

In `src/generator/layers/index.ts` add `import './pino'`. Add `pino`, `pino-http`, and `pino-pretty` to `VERSIONS`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx tsc --noEmit && npm test -- tests/layers/pino-layer.test.ts tests/tree`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/generator tests
git commit -m "feat: add pino layer with express request logging"
```

---

### Task 7: The helmet and rate-limit layers

**Files:**
- Create: `src/generator/layers/helmet.ts`, `src/generator/layers/rate-limit.ts`
- Modify: `src/generator/layers/index.ts`, `src/generator/versions.ts`
- Test: `tests/layers/middleware-layers.test.ts`

**Interfaces:**
- Consumes: `Layer`, `LayerCtx`, `dep()`, `tree.middleware`
- Produces: `helmetLayer`, `rateLimitLayer`

These are the layers the `MiddlewareModel` was built for in Plan 1 and nothing has exercised until now. Two layers, one task: they are the same shape and a reviewer would accept or reject them together.

- [ ] **Step 1: Write the failing test**

Create `tests/layers/middleware-layers.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'
import { helmetLayer } from '@/generator/layers/helmet'
import { rateLimitLayer } from '@/generator/layers/rate-limit'
import { getPackageManager } from '@/generator/pm'
import { getArchitecture } from '@/generator/arch'
import { expressBase } from '@/generator/bases/express'
import type { LayerCtx } from '@/generator/layers/types'

const ctx: LayerCtx = {
  app: { id: 'api', base: 'express', arch: 'layered', layers: [], options: {} },
  project: { name: 'hrims', layout: 'siblings' },
  pm: getPackageManager('npm'),
  arch: getArchitecture('layered'),
  specifier: (f: string, t: string) => expressBase.specifier(f, t),
}

describe('helmet layer', () => {
  it('registers helmet middleware and its dependency', () => {
    const tree = new FileTree()
    helmetLayer.apply(tree, ctx)
    expect(tree.middleware.statements()).toContain('helmet()')
    expect(tree.middleware.imports()).toContain("from 'helmet'")
    expect(JSON.parse(tree.pkg.render()).dependencies.helmet).toBeDefined()
  })

  it('applies only to express', () => {
    expect(helmetLayer.appliesTo).toEqual(['express'])
  })
})

describe('rate-limit layer', () => {
  it('writes a configurable limiter rather than inlining magic numbers', () => {
    const tree = new FileTree()
    rateLimitLayer.apply(tree, ctx)
    const limiter = tree.read('src/lib/rate-limit.ts')!
    expect(limiter).toContain('windowMs')
    expect(limiter).toContain('limit')
  })

  it('registers the limiter as middleware', () => {
    const tree = new FileTree()
    rateLimitLayer.apply(tree, ctx)
    expect(tree.middleware.statements()).toContain('limiter')
  })

  it('follows the modular architecture', () => {
    const tree = new FileTree()
    rateLimitLayer.apply(tree, { ...ctx, arch: getArchitecture('modular') })
    expect(tree.exists('src/shared/rate-limit.ts')).toBe(true)
  })
})

describe('security middleware ordering', () => {
  it('runs helmet before the rate limiter', () => {
    const tree = new FileTree()
    rateLimitLayer.apply(tree, ctx)
    helmetLayer.apply(tree, ctx)
    const statements = tree.middleware.statements()
    expect(statements.indexOf('helmet()')).toBeLessThan(statements.indexOf('limiter'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/layers/middleware-layers.test.ts`
Expected: FAIL — cannot resolve the layer modules

- [ ] **Step 3: Write both layers**

Create `src/generator/layers/helmet.ts`:

```ts
import { registerLayer } from './registry'
import type { Layer, LayerCtx } from './types'
import type { FileTree } from '../tree/file-tree'
import { dep } from '../versions'

/** Security headers go on first, before anything else touches the request. */
const HELMET_ORDER = 10

export const helmetLayer: Layer = {
  id: 'helmet',
  label: 'Helmet',
  description: 'Sensible security headers for Express',
  appliesTo: ['express'],
  manifest: () => [],

  apply(tree: FileTree, _ctx: LayerCtx): void {
    tree.pkg.addDep('helmet', dep('helmet'))
    tree.middleware.push({
      expr: 'helmet()',
      importName: 'helmet',
      importFrom: 'helmet',
      order: HELMET_ORDER,
    })
  },
}

registerLayer(helmetLayer)
```

Create `src/generator/layers/rate-limit.ts`:

```ts
import { registerLayer } from './registry'
import type { Layer, LayerCtx } from './types'
import type { FileTree } from '../tree/file-tree'
import { dep } from '../versions'

/** After helmet, before the body parser. */
const RATE_LIMIT_ORDER = 20

const LIMITER = `import { rateLimit } from 'express-rate-limit'

export const limiter = rateLimit({
  windowMs: 60_000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})
`

export const rateLimitLayer: Layer = {
  id: 'rate-limit',
  label: 'Rate limiting',
  description: 'Per-IP request throttling for Express',
  appliesTo: ['express'],
  manifest: (arch) => [arch.path('util', 'rate-limit')],

  apply(tree: FileTree, ctx: LayerCtx): void {
    const limiterPath = ctx.arch.path('util', 'rate-limit')
    tree.write(limiterPath, LIMITER)
    tree.pkg.addDep('express-rate-limit', dep('express-rate-limit'))
    tree.middleware.push({
      expr: 'limiter',
      importName: '{ limiter }',
      importFrom: ctx.specifier('src/app.ts', limiterPath),
      order: RATE_LIMIT_ORDER,
    })
  },
}

registerLayer(rateLimitLayer)
```

- [ ] **Step 4: Register them and add versions**

In `src/generator/layers/index.ts` add `import './helmet'` and `import './rate-limit'`. Add `helmet` and `express-rate-limit` to `VERSIONS`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx tsc --noEmit && npm test -- tests/layers/middleware-layers.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add src/generator tests
git commit -m "feat: add helmet and rate-limit middleware layers"
```
