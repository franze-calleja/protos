# protos Generator Core — Implementation Plan (Plan 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an end-to-end generator pipeline that turns an encoded config string into a downloadable ZIP containing a real, buildable Next.js project.

**Architecture:** A pure, in-memory generator. A config object (validated by Zod, encoded in a URL) is fed through per-app *layers* that mutate a `FileTree`. Files touched by more than one layer are never string-patched — they are structured models rendered once at the end. An `Assembler` then places app trees into a deliverable and emits root files. Nothing shells out; nothing is persisted.

**Tech Stack:** Next.js 16.2.x (App Router, TypeScript), Node LTS, npm, Zod, fflate, Prettier, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-23-protos-design.md`

## Why this is Plan 1 of 3

The v1 spec covers three independently testable subsystems. Splitting them keeps each plan reviewable and each milestone shippable:

| Plan | Scope | Deliverable |
|---|---|---|
| **1 — Generator Core (this plan)** | Config, encoding, FileTree + all 6 models, layer/assembler/root-layer/package-manager contracts, `next` base, 2 layers, siblings assembler, docker root layer, ZIP sink, API route, test tiers 1–3 | A URL that downloads a working Next.js project |
| **2 — Catalog** | Remaining 3 bases, remaining 13 layers, `separate` + `monorepo` assemblers, full 10-config smoke matrix | Full stack coverage |
| **3 — Web UI** | Two-column config UI, live path-manifest preview, URL sync, share links | The product |

Plan 1 is a **vertical slice, not a foundation layer**. It proves the whole pipeline end to end with the minimum catalog, so that Plan 2 is pure repetition against a validated set of interfaces.

## Global Constraints

Every task's requirements implicitly include these. Values are copied verbatim from the spec.

- **No database.** Nothing persists between requests. No ORM, no store, no cache of user data.
- **No code execution during generation.** Never shell out, never `eval`, never run another scaffolder. Generation is pure in-memory data transformation.
- **`src/generator/` imports nothing from `next`.** Hard rule — the engine must be testable in isolation. Enforced by a lint test in Task 1.
- **Generation is deterministic.** The same config produces byte-identical output. Layer execution order must never change the result.
- **A layer may never string-patch a file another layer wrote.** Shared files are structured models rendered at the end.
- **Project name regex:** `^[a-z0-9][a-z0-9-]{0,38}$`
- **Caps:** max 2 apps, max 25 layers, max 4096 bytes of encoded config.
- **Unknown ids are rejected, never ignored.** A malformed link must fail loudly.
- **Target:** generation completes in under 300ms server-side.
- **Runtime:** Node LTS. **Package manager:** npm (protos has no workspaces; nothing here needs pnpm). **Framework:** Next.js 16.2.x.
- **Never fabricate dependency versions.** All generated-project versions live in `src/generator/versions.ts` and are resolved with `npm view <pkg> version` at implementation time.

## File Structure

```
src/
  app/
    api/generate/route.ts       # ZIP endpoint (the only Next-aware file in the pipeline)
  generator/
    versions.ts                 # single source of dependency versions for generated projects
    pm/
      types.ts                  # PackageManagerStrategy
      npm.ts                    # default
      pnpm.ts
      index.ts                  # getPackageManager()
    config/
      types.ts                  # BaseId, LayerId, LayoutId, PmId, AppSpec, ProtosConfig
      schema.ts                 # Zod schema + caps
      codec.ts                  # encode / decode / migrate
      errors.ts                 # ConfigError
    tree/
      file-tree.ts              # FileTree
      package-model.ts
      env-model.ts
      readme-model.ts
      provider-model.ts
      middleware-model.ts
      ignore-model.ts
    layers/
      types.ts                  # Layer, RootLayer, LayerCtx, RootCtx
      registry.ts               # id -> Layer lookup
      resolve.ts                # toposort + conflict/appliesTo validation
      tailwind.ts
      prisma.ts
      docker.ts                 # RootLayer
    bases/
      types.ts                  # Base
      next/                     # template files as .ts string modules
    assemblers/
      types.ts                  # Assembler, BuiltApp, Deliverable, DockerStrategy, CiStrategy
      siblings.ts
    sinks/
      zip.ts
    pipeline.ts                 # generate(cfg) -> Deliverable[]
tests/
  pm/                           # tier 1
  layers/                       # tier 1
  snapshots/                    # tier 2 (+ __snapshots__/)
  smoke/                        # tier 3 driver
.github/workflows/
  ci.yml                        # tiers 1-2 on every push
  smoke.yml                     # tier 3 nightly
```

Each model is its own file because they are edited independently and change for different reasons. Layers are one file each so that adding a layer touches exactly one file plus its test — success criterion #4 in the spec.

---

### Task 1: Project bootstrap

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.prettierrc`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`
- Test: `tests/architecture.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: a working `npm test` / `npm run build`; the architecture guard every later task relies on

- [ ] **Step 1: Scaffold the Next app**

```bash
npx create-next-app@latest . --ts --app --src-dir --tailwind --eslint --no-import-alias --use-npm
```

Answer "yes" to overwriting only if prompted about the existing directory — `docs/` and `.git/` must survive. Verify afterwards with `ls docs/superpowers/specs/` and `git status`.

- [ ] **Step 2: Add dev dependencies**

```bash
npm install -D vitest @vitest/coverage-v8 prettier
npm install zod fflate
```

- [ ] **Step 3: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
})
```

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest",
"smoke": "vitest run tests/smoke"
```

- [ ] **Step 4: Write the failing architecture test**

This guard enforces the "generator imports nothing from next" constraint for the entire life of the project.

Create `tests/architecture.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

describe('generator isolation', () => {
  it('never imports from next', () => {
    const files = walk('src/generator').filter((f) => f.endsWith('.ts'))
    const offenders = files.filter((f) =>
      /from ['"]next(\/|['"])/.test(readFileSync(f, 'utf8'))
    )
    expect(offenders).toEqual([])
  })

  it('has generator source to check', () => {
    expect(walk('src/generator').length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 5: Run it and watch it fail**

Run: `npm test -- tests/architecture.test.ts`
Expected: FAIL — `ENOENT: no such file or directory, scandir 'src/generator'`

- [ ] **Step 6: Create the generator directory with a placeholder module**

```bash
mkdir -p src/generator/{config,tree,layers,bases,assemblers,sinks}
mkdir -p tests/{layers,snapshots,smoke}
```

Create `src/generator/versions.ts`:

```ts
/**
 * Single source of truth for dependency versions in GENERATED projects.
 * Bumping a generated project's dependency is a one-file change.
 * Resolve real values with: npm view <pkg> version
 */
export const VERSIONS: Record<string, string> = {}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -- tests/architecture.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 8: Verify the build works**

Run: `npm run build`
Expected: build completes with no errors

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: bootstrap Next 16 app with vitest and architecture guard"
```

---

### Task 2: Config types and Zod schema

**Files:**
- Create: `src/generator/config/types.ts`, `src/generator/config/schema.ts`, `src/generator/config/errors.ts`
- Test: `tests/config/schema.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `ProtosConfig`, `AppSpec`, `BaseId`, `LayerId`, `LayoutId`, `parseConfig(unknown): ProtosConfig`, `ConfigError`

- [ ] **Step 1: Write the failing test**

Create `tests/config/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseConfig } from '@/generator/config/schema'
import { ConfigError } from '@/generator/config/errors'

const valid = {
  v: 1,
  name: 'hrims',
  layout: 'siblings',
  apps: [{ id: 'web', base: 'next', layers: ['tailwind'], options: {} }],
  layers: [],
}

describe('parseConfig', () => {
  it('accepts a valid config', () => {
    expect(parseConfig(valid).name).toBe('hrims')
  })

  it('rejects a name with invalid characters', () => {
    expect(() => parseConfig({ ...valid, name: 'My App!' })).toThrow(ConfigError)
  })

  it('rejects a name longer than 39 characters', () => {
    expect(() => parseConfig({ ...valid, name: 'a'.repeat(40) })).toThrow(ConfigError)
  })

  it('rejects an unknown layer id rather than ignoring it', () => {
    const bad = { ...valid, apps: [{ ...valid.apps[0], layers: ['bitcoin-miner'] }] }
    expect(() => parseConfig(bad)).toThrow(ConfigError)
  })

  it('rejects more than 2 apps', () => {
    const app = valid.apps[0]
    expect(() => parseConfig({ ...valid, apps: [app, app, app] })).toThrow(ConfigError)
  })

  it('rejects more than 25 layers on one app', () => {
    const bad = { ...valid, apps: [{ ...valid.apps[0], layers: Array(26).fill('tailwind') }] }
    expect(() => parseConfig(bad)).toThrow(ConfigError)
  })

  it('rejects an empty apps array', () => {
    expect(() => parseConfig({ ...valid, apps: [] })).toThrow(ConfigError)
  })

  it('defaults the package manager to npm', () => {
    expect(parseConfig(valid).pm).toBe('npm')
  })

  it('accepts pnpm', () => {
    expect(parseConfig({ ...valid, pm: 'pnpm' }).pm).toBe('pnpm')
  })

  it('rejects an unsupported package manager', () => {
    expect(() => parseConfig({ ...valid, pm: 'yarn' })).toThrow(ConfigError)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/config/schema.test.ts`
Expected: FAIL — cannot resolve `@/generator/config/schema`

- [ ] **Step 3: Write the implementation**

Create `src/generator/config/errors.ts`:

```ts
export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}
```

Create `src/generator/config/types.ts`:

```ts
export const BASE_IDS = ['next', 'vite-react', 'express', 'expo'] as const
export type BaseId = (typeof BASE_IDS)[number]

export const LAYER_IDS = [
  'tailwind', 'tanstack-query', 'zustand', 'zod', 'react-hook-form',
  'tanstack-table', 'prisma', 'pino', 'helmet', 'rate-limit',
  'eslint-prettier', 'vitest', 'jest-expo', 'docker', 'gh-actions',
] as const
export type LayerId = (typeof LAYER_IDS)[number]

export const LAYOUT_IDS = ['siblings', 'separate', 'monorepo'] as const
export type LayoutId = (typeof LAYOUT_IDS)[number]

export const PM_IDS = ['npm', 'pnpm'] as const
export type PmId = (typeof PM_IDS)[number]

export interface AppSpec {
  id: string
  base: BaseId
  layers: LayerId[]
  options: Record<string, string>
}

export interface ProtosConfig {
  v: 1
  name: string
  layout: LayoutId
  pm: PmId
  apps: AppSpec[]
  layers: LayerId[]
}

export const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,38}$/
export const MAX_APPS = 2
export const MAX_LAYERS = 25
export const MAX_ENCODED_BYTES = 4096
```

Create `src/generator/config/schema.ts`:

```ts
import { z } from 'zod'
import { BASE_IDS, LAYER_IDS, LAYOUT_IDS, PM_IDS, NAME_PATTERN, MAX_APPS, MAX_LAYERS } from './types'
import type { ProtosConfig } from './types'
import { ConfigError } from './errors'

const appSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,19}$/),
  base: z.enum(BASE_IDS),
  layers: z.array(z.enum(LAYER_IDS)).max(MAX_LAYERS),
  options: z.record(z.string(), z.string()).default({}),
})

export const configSchema = z.object({
  v: z.literal(1),
  name: z.string().regex(NAME_PATTERN),
  layout: z.enum(LAYOUT_IDS),
  pm: z.enum(PM_IDS).default('npm'),
  apps: z.array(appSchema).min(1).max(MAX_APPS),
  layers: z.array(z.enum(LAYER_IDS)).max(MAX_LAYERS).default([]),
})

export function parseConfig(input: unknown): ProtosConfig {
  const result = configSchema.safeParse(input)
  if (!result.success) {
    throw new ConfigError(`Invalid config: ${result.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`)
  }
  return result.data as ProtosConfig
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/config/schema.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/generator/config tests/config
git commit -m "feat: add config types and Zod validation with caps"
```

---

### Task 3: Config encoding and decoding

**Files:**
- Create: `src/generator/config/codec.ts`
- Test: `tests/config/codec.test.ts`

**Interfaces:**
- Consumes: `ProtosConfig`, `parseConfig`, `ConfigError` (Task 2)
- Produces: `encodeConfig(cfg: ProtosConfig): string`, `decodeConfig(s: string): ProtosConfig`

- [ ] **Step 1: Write the failing test**

Create `tests/config/codec.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { encodeConfig, decodeConfig } from '@/generator/config/codec'
import { ConfigError } from '@/generator/config/errors'
import type { ProtosConfig } from '@/generator/config/types'

const cfg: ProtosConfig = {
  v: 1,
  name: 'hrims',
  layout: 'siblings',
  pm: 'pnpm',
  apps: [
    { id: 'api', base: 'express', layers: ['prisma', 'pino'], options: { db: 'postgres' } },
    { id: 'web', base: 'next', layers: ['tailwind'], options: {} },
  ],
  layers: ['docker'],
}

describe('config codec', () => {
  it('round-trips a config unchanged', () => {
    expect(decodeConfig(encodeConfig(cfg))).toEqual(cfg)
  })

  it('produces a URL-safe string', () => {
    expect(encodeConfig(cfg)).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('stays comfortably under the URL budget', () => {
    expect(encodeConfig(cfg).length).toBeLessThan(400)
  })

  it('is deterministic', () => {
    expect(encodeConfig(cfg)).toBe(encodeConfig(cfg))
  })

  it('rejects a string that is not valid base64url', () => {
    expect(() => decodeConfig('!!!!not-base64!!!!')).toThrow(ConfigError)
  })

  it('rejects a string that decodes to invalid JSON', () => {
    const junk = Buffer.from('nonsense').toString('base64url')
    expect(() => decodeConfig(junk)).toThrow(ConfigError)
  })

  it('rejects a payload over the size cap', () => {
    expect(() => decodeConfig('A'.repeat(5000))).toThrow(ConfigError)
  })

  it('rejects a structurally valid payload that fails schema validation', () => {
    const bad = Buffer.from(JSON.stringify({ v: 1, name: 'BAD NAME' })).toString('base64url')
    expect(() => decodeConfig(bad)).toThrow(ConfigError)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/config/codec.test.ts`
Expected: FAIL — cannot resolve `@/generator/config/codec`

- [ ] **Step 3: Write the implementation**

Create `src/generator/config/codec.ts`:

```ts
import { deflateSync, inflateSync, strToU8, strFromU8 } from 'fflate'
import { parseConfig } from './schema'
import { MAX_ENCODED_BYTES } from './types'
import type { ProtosConfig } from './types'
import { ConfigError } from './errors'

/** Stable key order keeps encoding deterministic across JS engines. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

export function encodeConfig(cfg: ProtosConfig): string {
  const deflated = deflateSync(strToU8(stableStringify(cfg)), { level: 9 })
  return Buffer.from(deflated).toString('base64url')
}

export function decodeConfig(encoded: string): ProtosConfig {
  if (encoded.length > MAX_ENCODED_BYTES) {
    throw new ConfigError(`Config exceeds ${MAX_ENCODED_BYTES} byte cap`)
  }
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new ConfigError('Config is not valid base64url')
  }

  let json: string
  try {
    json = strFromU8(inflateSync(new Uint8Array(Buffer.from(encoded, 'base64url'))))
  } catch {
    throw new ConfigError('Config could not be decompressed')
  }

  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new ConfigError('Config is not valid JSON')
  }

  return parseConfig(migrate(raw))
}

/**
 * Upgrades older config versions to the current shape so share links never break.
 * v1 is current, so this is a pass-through until v2 exists.
 */
function migrate(raw: unknown): unknown {
  return raw
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/config/codec.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/generator/config/codec.ts tests/config/codec.test.ts
git commit -m "feat: add deterministic config encoding with hard input validation"
```

---

### Task 4: FileTree with collision guard

**Files:**
- Create: `src/generator/tree/file-tree.ts`, `src/generator/tree/ignore-model.ts`
- Test: `tests/tree/file-tree.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `FileTree` class with `write(path, content)`, `exists(path)`, `read(path)`, `paths()`, `toMap()`, and public model fields `pkg`, `env`, `readme`, `providers`, `middleware`, `ignore`; `IgnoreModel` with `add(pattern)` and `render()`

The collision guard is the mechanical enforcement of the spec's central rule. A layer that tries to overwrite another layer's file gets an exception, not a silent clobber. Model fields are wired in Tasks 5–7; this task installs only `ignore`.

- [ ] **Step 1: Write the failing test**

Create `tests/tree/file-tree.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'

describe('FileTree', () => {
  it('stores and reads a file', () => {
    const t = new FileTree()
    t.write('src/index.ts', 'export {}')
    expect(t.read('src/index.ts')).toBe('export {}')
    expect(t.exists('src/index.ts')).toBe(true)
  })

  it('normalises a leading slash', () => {
    const t = new FileTree()
    t.write('/src/a.ts', 'a')
    expect(t.paths()).toEqual(['src/a.ts'])
  })

  it('throws when a second write targets an existing path', () => {
    const t = new FileTree()
    t.write('src/a.ts', 'first')
    expect(() => t.write('src/a.ts', 'second')).toThrow(/already written/)
  })

  it('allows an explicit overwrite', () => {
    const t = new FileTree()
    t.write('src/a.ts', 'first')
    t.write('src/a.ts', 'second', { overwrite: true })
    expect(t.read('src/a.ts')).toBe('second')
  })

  it('rejects path traversal', () => {
    const t = new FileTree()
    expect(() => t.write('../escape.ts', 'x')).toThrow(/traversal/)
  })

  it('returns paths sorted for deterministic output', () => {
    const t = new FileTree()
    t.write('z.ts', '')
    t.write('a.ts', '')
    expect(t.paths()).toEqual(['a.ts', 'z.ts'])
  })
})

describe('IgnoreModel', () => {
  it('renders unique patterns in insertion order', () => {
    const t = new FileTree()
    t.ignore.add('node_modules')
    t.ignore.add('.env')
    t.ignore.add('node_modules')
    expect(t.ignore.render()).toBe('node_modules\n.env\n')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tree/file-tree.test.ts`
Expected: FAIL — cannot resolve `@/generator/tree/file-tree`

- [ ] **Step 3: Write the implementation**

Create `src/generator/tree/ignore-model.ts`:

```ts
export class IgnoreModel {
  private patterns: string[] = []

  add(pattern: string): void {
    if (!this.patterns.includes(pattern)) this.patterns.push(pattern)
  }

  render(): string {
    return this.patterns.map((p) => `${p}\n`).join('')
  }
}
```

Create `src/generator/tree/file-tree.ts`:

```ts
import { IgnoreModel } from './ignore-model'

export interface WriteOptions {
  /** Explicitly replace an existing file. Layers must not use this on another layer's file. */
  overwrite?: boolean
}

export class FileTree {
  private files = new Map<string, string>()

  readonly ignore = new IgnoreModel()

  write(rawPath: string, content: string, opts: WriteOptions = {}): void {
    const path = normalise(rawPath)
    if (this.files.has(path) && !opts.overwrite) {
      throw new Error(
        `File "${path}" was already written. Layers must not patch each other's files — use a structured model instead.`
      )
    }
    this.files.set(path, content)
  }

  exists(rawPath: string): boolean {
    return this.files.has(normalise(rawPath))
  }

  read(rawPath: string): string | undefined {
    return this.files.get(normalise(rawPath))
  }

  paths(): string[] {
    return [...this.files.keys()].sort()
  }

  toMap(): Map<string, string> {
    return new Map(this.paths().map((p) => [p, this.files.get(p)!]))
  }
}

function normalise(path: string): string {
  const clean = path.replace(/^\/+/, '')
  if (clean.split('/').includes('..')) {
    throw new Error(`Path traversal rejected: "${path}"`)
  }
  return clean
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/tree/file-tree.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/generator/tree tests/tree
git commit -m "feat: add FileTree with layer-collision guard and ignore model"
```

---

### Task 5: PackageModel and version registry

**Files:**
- Create: `src/generator/tree/package-model.ts`
- Modify: `src/generator/tree/file-tree.ts` (add `pkg` field), `src/generator/versions.ts`
- Test: `tests/tree/package-model.test.ts`

**Interfaces:**
- Consumes: `FileTree` (Task 4)
- Produces: `PackageModel` with `setName(name)`, `addDep(name, version)`, `addDevDep(name, version)`, `addScript(name, command)`, `render(): string`; `VERSIONS` registry; `dep(name): string` helper

- [ ] **Step 1: Write the failing test**

Create `tests/tree/package-model.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { PackageModel } from '@/generator/tree/package-model'

describe('PackageModel', () => {
  it('renders deps sorted alphabetically regardless of insertion order', () => {
    const p = new PackageModel()
    p.setName('app')
    p.addDep('zod', '^3.0.0')
    p.addDep('axios', '^1.0.0')
    const json = JSON.parse(p.render())
    expect(Object.keys(json.dependencies)).toEqual(['axios', 'zod'])
  })

  it('produces identical output regardless of call order', () => {
    const a = new PackageModel()
    a.setName('app'); a.addDep('zod', '^3.0.0'); a.addScript('dev', 'next dev')
    const b = new PackageModel()
    b.setName('app'); b.addScript('dev', 'next dev'); b.addDep('zod', '^3.0.0')
    expect(a.render()).toBe(b.render())
  })

  it('accepts the same dep at the same version twice', () => {
    const p = new PackageModel()
    p.addDep('zod', '^3.0.0')
    expect(() => p.addDep('zod', '^3.0.0')).not.toThrow()
  })

  it('throws on conflicting versions of the same dep', () => {
    const p = new PackageModel()
    p.addDep('zod', '^3.0.0')
    expect(() => p.addDep('zod', '^4.0.0')).toThrow(/conflicting version/i)
  })

  it('throws when two layers set different commands for one script', () => {
    const p = new PackageModel()
    p.addScript('test', 'vitest run')
    expect(() => p.addScript('test', 'jest')).toThrow(/conflicting script/i)
  })

  it('omits empty sections', () => {
    const p = new PackageModel()
    p.setName('app')
    const json = JSON.parse(p.render())
    expect(json.dependencies).toBeUndefined()
    expect(json.devDependencies).toBeUndefined()
  })

  it('ends with a trailing newline', () => {
    const p = new PackageModel()
    p.setName('app')
    expect(p.render().endsWith('\n')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tree/package-model.test.ts`
Expected: FAIL — cannot resolve `@/generator/tree/package-model`

- [ ] **Step 3: Write the implementation**

Create `src/generator/tree/package-model.ts`:

```ts
export class PackageModel {
  private name = 'app'
  private deps = new Map<string, string>()
  private devDeps = new Map<string, string>()
  private scripts = new Map<string, string>()
  private extras: Record<string, unknown> = {}

  setName(name: string): void {
    this.name = name
  }

  addDep(name: string, version: string): void {
    addTo(this.deps, name, version, 'dependency')
  }

  addDevDep(name: string, version: string): void {
    addTo(this.devDeps, name, version, 'devDependency')
  }

  addScript(name: string, command: string): void {
    const existing = this.scripts.get(name)
    if (existing && existing !== command) {
      throw new Error(`Conflicting script "${name}": "${existing}" vs "${command}"`)
    }
    this.scripts.set(name, command)
  }

  /** For top-level fields a base needs, e.g. `type: "module"` or `packageManager`. */
  set(key: string, value: unknown): void {
    this.extras[key] = value
  }

  render(): string {
    const json: Record<string, unknown> = {
      name: this.name,
      version: '0.1.0',
      private: true,
      ...this.extras,
    }
    if (this.scripts.size) json.scripts = sorted(this.scripts)
    if (this.deps.size) json.dependencies = sorted(this.deps)
    if (this.devDeps.size) json.devDependencies = sorted(this.devDeps)
    return `${JSON.stringify(json, null, 2)}\n`
  }
}

function addTo(map: Map<string, string>, name: string, version: string, kind: string): void {
  const existing = map.get(name)
  if (existing && existing !== version) {
    throw new Error(`Conflicting version for ${kind} "${name}": "${existing}" vs "${version}"`)
  }
  map.set(name, version)
}

function sorted(map: Map<string, string>): Record<string, string> {
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)))
}
```

- [ ] **Step 4: Wire it into FileTree**

In `src/generator/tree/file-tree.ts`, add the import and field:

```ts
import { PackageModel } from './package-model'
```

```ts
  readonly pkg = new PackageModel()
```

- [ ] **Step 5: Populate the version registry**

Resolve real versions — do not guess:

```bash
for p in next react react-dom typescript tailwindcss @prisma/client prisma zod vitest; do
  echo "\"$p\": \"^$(npm view $p version)\","
done
```

Paste the output into `VERSIONS` in `src/generator/versions.ts`, and add the accessor:

```ts
export function dep(name: string): string {
  const version = VERSIONS[name]
  if (!version) throw new Error(`No pinned version for "${name}" — add it to versions.ts`)
  return version
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- tests/tree`
Expected: PASS (14 tests across both tree test files)

- [ ] **Step 7: Commit**

```bash
git add src/generator/tree src/generator/versions.ts tests/tree
git commit -m "feat: add PackageModel with conflict detection and version registry"
```

---

### Task 6: EnvModel and ReadmeModel

**Files:**
- Create: `src/generator/tree/env-model.ts`, `src/generator/tree/readme-model.ts`
- Modify: `src/generator/tree/file-tree.ts` (add `env`, `readme` fields)
- Test: `tests/tree/env-model.test.ts`, `tests/tree/readme-model.test.ts`

**Interfaces:**
- Consumes: `FileTree` (Task 4)
- Produces: `EnvModel` with `set(key, value, opts?)`, `keys()`, `render(): { env: string; example: string }`; `ReadmeModel` with `section(title, body)`, `render(projectName): string`

- [ ] **Step 1: Write the failing tests**

Create `tests/tree/env-model.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { EnvModel } from '@/generator/tree/env-model'

describe('EnvModel', () => {
  it('renders a dev value in .env and a placeholder in .env.example', () => {
    const e = new EnvModel()
    e.set('DATABASE_URL', 'postgresql://localhost:5432/app', {
      comment: 'Local database',
      placeholder: 'postgresql://user:password@host:5432/db',
    })
    const { env, example } = e.render()
    expect(env).toBe('# Local database\nDATABASE_URL=postgresql://localhost:5432/app\n')
    expect(example).toBe('# Local database\nDATABASE_URL=postgresql://user:password@host:5432/db\n')
  })

  it('falls back to an empty placeholder when none is given', () => {
    const e = new EnvModel()
    e.set('PORT', '3000')
    expect(e.render().example).toBe('PORT=\n')
  })

  it('throws on conflicting values for the same key', () => {
    const e = new EnvModel()
    e.set('PORT', '3000')
    expect(() => e.set('PORT', '4000')).toThrow(/conflicting/i)
  })

  it('exposes keys so root layers can react to them', () => {
    const e = new EnvModel()
    e.set('DATABASE_URL', 'x')
    expect(e.keys()).toContain('DATABASE_URL')
  })

  it('renders in insertion order', () => {
    const e = new EnvModel()
    e.set('B', '2')
    e.set('A', '1')
    expect(e.render().env).toBe('B=2\nA=1\n')
  })
})
```

Create `tests/tree/readme-model.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ReadmeModel } from '@/generator/tree/readme-model'

describe('ReadmeModel', () => {
  it('renders the project name as an H1 followed by sections', () => {
    const r = new ReadmeModel()
    r.section('Getting started', 'Run `npm run dev`.')
    expect(r.render('hrims')).toBe('# hrims\n\n## Getting started\n\nRun `npm run dev`.\n')
  })

  it('renders sections in insertion order', () => {
    const r = new ReadmeModel()
    r.section('First', 'a')
    r.section('Second', 'b')
    expect(r.render('x').indexOf('## First')).toBeLessThan(r.render('x').indexOf('## Second'))
  })

  it('throws when the same section title is added twice', () => {
    const r = new ReadmeModel()
    r.section('Setup', 'a')
    expect(() => r.section('Setup', 'b')).toThrow(/duplicate section/i)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/tree/env-model.test.ts tests/tree/readme-model.test.ts`
Expected: FAIL — modules cannot be resolved

- [ ] **Step 3: Write the implementations**

Create `src/generator/tree/env-model.ts`:

```ts
export interface EnvOptions {
  comment?: string
  /** Value written to .env.example. Defaults to empty — never leak a real value. */
  placeholder?: string
}

interface EnvEntry {
  key: string
  value: string
  comment?: string
  placeholder: string
}

export class EnvModel {
  private entries: EnvEntry[] = []

  set(key: string, value: string, opts: EnvOptions = {}): void {
    const existing = this.entries.find((e) => e.key === key)
    if (existing) {
      if (existing.value !== value) {
        throw new Error(`Conflicting value for env key "${key}"`)
      }
      return
    }
    this.entries.push({ key, value, comment: opts.comment, placeholder: opts.placeholder ?? '' })
  }

  keys(): string[] {
    return this.entries.map((e) => e.key)
  }

  render(): { env: string; example: string } {
    const build = (pick: (e: EnvEntry) => string) =>
      this.entries.map((e) => `${e.comment ? `# ${e.comment}\n` : ''}${e.key}=${pick(e)}\n`).join('')
    return { env: build((e) => e.value), example: build((e) => e.placeholder) }
  }
}
```

Create `src/generator/tree/readme-model.ts`:

```ts
export class ReadmeModel {
  private sections: { title: string; body: string }[] = []

  section(title: string, body: string): void {
    if (this.sections.some((s) => s.title === title)) {
      throw new Error(`Duplicate section "${title}" in README`)
    }
    this.sections.push({ title, body })
  }

  render(projectName: string): string {
    const body = this.sections.map((s) => `## ${s.title}\n\n${s.body.trim()}\n`).join('\n')
    return `# ${projectName}\n\n${body}`
  }
}
```

- [ ] **Step 4: Wire both into FileTree**

In `src/generator/tree/file-tree.ts`:

```ts
import { EnvModel } from './env-model'
import { ReadmeModel } from './readme-model'
```

```ts
  readonly env = new EnvModel()
  readonly readme = new ReadmeModel()
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/tree`
Expected: PASS (22 tests)

- [ ] **Step 6: Commit**

```bash
git add src/generator/tree tests/tree
git commit -m "feat: add env and readme structured models"
```

---

### Task 7: ProviderModel and MiddlewareModel

**Files:**
- Create: `src/generator/tree/provider-model.ts`, `src/generator/tree/middleware-model.ts`
- Modify: `src/generator/tree/file-tree.ts` (add `providers`, `middleware` fields)
- Test: `tests/tree/provider-model.test.ts`

**Interfaces:**
- Consumes: `FileTree` (Task 4)
- Produces: `ProviderModel` with `push(entry: ProviderEntry)`, `imports(): string`, `wrap(children: string): string`, `isEmpty()`; `MiddlewareModel` with `push(entry: MiddlewareEntry)`, `imports(): string`, `statements(): string`

These are the models that make composition visible: two layers each wrap the root layout without knowing about each other. `order` guarantees a deterministic nesting regardless of layer execution order.

- [ ] **Step 1: Write the failing test**

Create `tests/tree/provider-model.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ProviderModel } from '@/generator/tree/provider-model'
import { MiddlewareModel } from '@/generator/tree/middleware-model'

describe('ProviderModel', () => {
  it('nests providers by ascending order, outermost first', () => {
    const p = new ProviderModel()
    p.push({ component: 'Inner', importName: 'Inner', importFrom: './inner', order: 20 })
    p.push({ component: 'Outer', importName: 'Outer', importFrom: './outer', order: 10 })
    expect(p.wrap('{children}')).toBe('<Outer><Inner>{children}</Inner></Outer>')
  })

  it('produces the same output regardless of push order', () => {
    const build = (reverse: boolean) => {
      const p = new ProviderModel()
      const entries = [
        { component: 'A', importName: 'A', importFrom: './a', order: 10 },
        { component: 'B', importName: 'B', importFrom: './b', order: 20 },
      ]
      for (const e of reverse ? [...entries].reverse() : entries) p.push(e)
      return p.wrap('{children}')
    }
    expect(build(false)).toBe(build(true))
  })

  it('renders import statements sorted by module path', () => {
    const p = new ProviderModel()
    p.push({ component: 'Z', importName: 'Z', importFrom: './z', order: 1 })
    p.push({ component: 'A', importName: 'A', importFrom: './a', order: 2 })
    expect(p.imports()).toBe("import { A } from './a'\nimport { Z } from './z'\n")
  })

  it('returns children unchanged when empty', () => {
    expect(new ProviderModel().wrap('{children}')).toBe('{children}')
  })

  it('supports props on a provider', () => {
    const p = new ProviderModel()
    p.push({ component: 'Theme', importName: 'Theme', importFrom: './t', order: 1, props: 'defaultTheme="dark"' })
    expect(p.wrap('{children}')).toBe('<Theme defaultTheme="dark">{children}</Theme>')
  })
})

describe('MiddlewareModel', () => {
  it('emits app.use statements ordered by order value', () => {
    const m = new MiddlewareModel()
    m.push({ expr: 'express.json()', order: 20 })
    m.push({ expr: 'helmet()', importName: 'helmet', importFrom: 'helmet', order: 10 })
    expect(m.statements()).toBe('app.use(helmet())\napp.use(express.json())\n')
  })

  it('emits default imports for middleware that need them', () => {
    const m = new MiddlewareModel()
    m.push({ expr: 'helmet()', importName: 'helmet', importFrom: 'helmet', order: 10 })
    expect(m.imports()).toBe("import helmet from 'helmet'\n")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tree/provider-model.test.ts`
Expected: FAIL — modules cannot be resolved

- [ ] **Step 3: Write the implementations**

Create `src/generator/tree/provider-model.ts`:

```ts
export interface ProviderEntry {
  component: string
  importName: string
  importFrom: string
  /** Lower numbers nest further out. Keeps nesting deterministic. */
  order: number
  props?: string
}

export class ProviderModel {
  private entries: ProviderEntry[] = []

  push(entry: ProviderEntry): void {
    this.entries.push(entry)
  }

  isEmpty(): boolean {
    return this.entries.length === 0
  }

  imports(): string {
    return [...this.entries]
      .sort((a, b) => a.importFrom.localeCompare(b.importFrom))
      .map((e) => `import { ${e.importName} } from '${e.importFrom}'\n`)
      .join('')
  }

  wrap(children: string): string {
    return [...this.entries]
      .sort((a, b) => a.order - b.order)
      .reduceRight(
        (inner, e) => `<${e.component}${e.props ? ` ${e.props}` : ''}>${inner}</${e.component}>`,
        children
      )
  }
}
```

Create `src/generator/tree/middleware-model.ts`:

```ts
export interface MiddlewareEntry {
  /** The expression passed to app.use(), e.g. `helmet()`. */
  expr: string
  importName?: string
  importFrom?: string
  order: number
}

export class MiddlewareModel {
  private entries: MiddlewareEntry[] = []

  push(entry: MiddlewareEntry): void {
    this.entries.push(entry)
  }

  imports(): string {
    return [...this.entries]
      .filter((e) => e.importName && e.importFrom)
      .sort((a, b) => a.importFrom!.localeCompare(b.importFrom!))
      .map((e) => `import ${e.importName} from '${e.importFrom}'\n`)
      .join('')
  }

  statements(): string {
    return [...this.entries]
      .sort((a, b) => a.order - b.order)
      .map((e) => `app.use(${e.expr})\n`)
      .join('')
  }
}
```

- [ ] **Step 4: Wire both into FileTree**

In `src/generator/tree/file-tree.ts`:

```ts
import { ProviderModel } from './provider-model'
import { MiddlewareModel } from './middleware-model'
```

```ts
  readonly providers = new ProviderModel()
  readonly middleware = new MiddlewareModel()
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/tree`
Expected: PASS (29 tests)

- [ ] **Step 6: Commit**

```bash
git add src/generator/tree tests/tree
git commit -m "feat: add provider and middleware models with deterministic ordering"
```

---

### Task 8: Layer contract, registry, and resolver

**Files:**
- Create: `src/generator/layers/types.ts`, `src/generator/layers/registry.ts`, `src/generator/layers/resolve.ts`
- Test: `tests/layers/resolve.test.ts`

**Interfaces:**
- Consumes: `FileTree` (Task 4), `AppSpec`, `LayerId`, `BaseId`, `LayoutId` (Task 2)
- Produces: `Layer`, `LayerCtx`, `LAYERS` registry, `resolveLayers(app: AppSpec): Layer[]`

**Refinement of the spec:** `LayerCtx` carries `pm` but deliberately does **not** carry `docker`/`ci` strategies. Per-app layers never need them — `docker` and `gh-actions` are `RootLayer`s (Task 13) and receive strategies through `RootCtx`. This makes per-app layers strictly layout-agnostic by construction rather than by convention.

- [ ] **Step 1: Write the failing test**

Create `tests/layers/resolve.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveLayers } from '@/generator/layers/resolve'
import type { Layer } from '@/generator/layers/types'
import type { AppSpec, LayerId } from '@/generator/config/types'

/** Stub layers keep this task testable without depending on Task 11. */
const stub = (id: string, over: Partial<Layer> = {}): Layer => ({
  id: id as LayerId,
  label: id,
  description: id,
  appliesTo: ['next'],
  manifest: [],
  apply: () => {},
  ...over,
})

const REGISTRY: Partial<Record<LayerId, Layer>> = {
  zod: stub('zod'),
  tailwind: stub('tailwind'),
  'react-hook-form': stub('react-hook-form', { requires: ['zod'] }),
  prisma: stub('prisma', { appliesTo: ['next', 'express'] }),
  pino: stub('pino', { conflictsWith: ['helmet'] }),
  helmet: stub('helmet'),
}

const app = (layers: string[], base = 'next'): AppSpec =>
  ({ id: 'web', base, layers, options: {} }) as AppSpec

const resolve = (a: AppSpec) => resolveLayers(a, REGISTRY)

describe('resolveLayers', () => {
  it('returns layers for a valid app', () => {
    expect(resolve(app(['tailwind'])).map((l) => l.id)).toEqual(['tailwind'])
  })

  it('orders a dependency before its dependent', () => {
    const ids = resolve(app(['react-hook-form', 'zod'])).map((l) => l.id)
    expect(ids.indexOf('zod')).toBeLessThan(ids.indexOf('react-hook-form'))
  })

  it('throws when a required layer is missing', () => {
    expect(() => resolve(app(['react-hook-form']))).toThrow(/requires "zod"/)
  })

  it('throws when a layer does not apply to the base', () => {
    expect(() => resolve(app(['tailwind'], 'expo'))).toThrow(/does not apply to base "expo"/)
  })

  it('throws on an unknown layer id rather than ignoring it', () => {
    expect(() => resolve(app(['nope']))).toThrow(/unknown layer/i)
  })

  it('throws when two selected layers conflict', () => {
    expect(() => resolve(app(['pino', 'helmet']))).toThrow(/conflicts with/)
  })

  it('is deterministic regardless of input order', () => {
    expect(resolve(app(['zod', 'tailwind'])).map((l) => l.id))
      .toEqual(resolve(app(['tailwind', 'zod'])).map((l) => l.id))
  })

  it('deduplicates a repeated layer id', () => {
    expect(resolve(app(['tailwind', 'tailwind'])).map((l) => l.id)).toEqual(['tailwind'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/layers/resolve.test.ts`
Expected: FAIL — cannot resolve `@/generator/layers/resolve`

- [ ] **Step 3: Write the contract**

Create `src/generator/layers/types.ts`:

```ts
import type { FileTree } from '../tree/file-tree'
import type { AppSpec, BaseId, LayerId, LayoutId } from '../config/types'
import type { PackageManagerStrategy } from '../pm/types'

export interface LayerCtx {
  app: AppSpec
  project: { name: string; layout: LayoutId }
  /** Derived from cfg.pm. Layers use it to name commands in docs and scripts. */
  pm: PackageManagerStrategy
  /** The other app in the project, if there is one. */
  sibling?: AppSpec
}

export interface Layer {
  id: LayerId
  label: string
  description: string
  appliesTo: BaseId[]
  requires?: LayerId[]
  conflictsWith?: LayerId[]
  /** Static paths this layer contributes, for the UI's preview. Asserted in tests. */
  manifest: string[]
  apply(tree: FileTree, ctx: LayerCtx): void
}
```

- [ ] **Step 4: Write the registry and resolver**

Create `src/generator/layers/registry.ts`:

```ts
import type { LayerId } from '../config/types'
import type { Layer } from './types'

/** Populated as layers are implemented. Adding a layer touches this file and one layer file. */
export const LAYERS: Partial<Record<LayerId, Layer>> = {}

export function registerLayer(layer: Layer): void {
  LAYERS[layer.id] = layer
}
```

Create `src/generator/layers/resolve.ts`:

```ts
import type { AppSpec } from '../config/types'
import { LAYERS } from './registry'
import type { Layer } from './types'
import type { LayerId } from '../config/types'

/** `registry` is injectable so the resolver can be tested without real layers. */
export function resolveLayers(
  app: AppSpec,
  registry: Partial<Record<LayerId, Layer>> = LAYERS
): Layer[] {
  const requested = [...new Set(app.layers)]

  const layers = requested.map((id) => {
    const layer = registry[id]
    if (!layer) throw new Error(`Unknown layer "${id}"`)
    if (!layer.appliesTo.includes(app.base)) {
      throw new Error(`Layer "${id}" does not apply to base "${app.base}"`)
    }
    return layer
  })

  for (const layer of layers) {
    for (const req of layer.requires ?? []) {
      if (!requested.includes(req)) {
        throw new Error(`Layer "${layer.id}" requires "${req}", which is not selected`)
      }
    }
    for (const conflict of layer.conflictsWith ?? []) {
      if (requested.includes(conflict)) {
        throw new Error(`Layer "${layer.id}" conflicts with "${conflict}"`)
      }
    }
  }

  return toposort(layers)
}

/** Depth-first topological sort. Sorting by id first makes the result order-independent. */
function toposort(layers: Layer[]): Layer[] {
  const byId = new Map(layers.map((l) => [l.id, l]))
  const sorted: Layer[] = []
  const state = new Map<string, 'visiting' | 'done'>()

  function visit(layer: Layer): void {
    if (state.get(layer.id) === 'done') return
    if (state.get(layer.id) === 'visiting') {
      throw new Error(`Circular layer dependency at "${layer.id}"`)
    }
    state.set(layer.id, 'visiting')
    for (const req of [...(layer.requires ?? [])].sort()) {
      const dep = byId.get(req)
      if (dep) visit(dep)
    }
    state.set(layer.id, 'done')
    sorted.push(layer)
  }

  for (const layer of [...layers].sort((a, b) => a.id.localeCompare(b.id))) visit(layer)
  return sorted
}
```

Create `src/generator/layers/index.ts` with a comment placeholder — layer modules self-register by importing here as they are built:

```ts
/** Importing this module registers every layer. Add each new layer file here. */
export {}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/layers/resolve.test.ts`
Expected: PASS (8 tests) — the stub registry means this task is green on its own.

- [ ] **Step 6: Commit**

```bash
git add src/generator/layers tests/layers
git commit -m "feat: add layer contract, registry, and dependency resolver"
```

---

### Task 9: PackageManagerStrategy

**Files:**
- Create: `src/generator/pm/types.ts`, `src/generator/pm/npm.ts`, `src/generator/pm/pnpm.ts`, `src/generator/pm/index.ts`
- Test: `tests/pm/strategy.test.ts`

**Interfaces:**
- Consumes: `PmId` (Task 2)
- Produces: `PackageManagerStrategy`, `getPackageManager(id: PmId): PackageManagerStrategy`, `npmStrategy`, `pnpmStrategy`

The package manager is a strategy rather than a layer because it adds nothing — it changes how artifacts that already exist get rendered. It is consumed by the base (README), by any layer that documents a command, by the Docker root layer, and by the monorepo assembler in Plan 2.

Two rows make this more than find-and-replace: npm declares a workspace-internal dependency with a plain semver range and symlinks it automatically, while pnpm uses `workspace:*`; and npm declares workspaces in the root `package.json` while pnpm needs a separate `pnpm-workspace.yaml`.

- [ ] **Step 1: Write the failing test**

Create `tests/pm/strategy.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getPackageManager } from '@/generator/pm'

describe('npm strategy', () => {
  const pm = getPackageManager('npm')

  it('prefixes scripts with run', () => {
    expect(pm.runScript('dev')).toBe('npm run dev')
  })

  it('uses ci for a frozen install', () => {
    expect(pm.installFrozen()).toBe('npm ci')
  })

  it('names the npm lockfile', () => {
    expect(pm.lockfile()).toBe('package-lock.json')
  })

  it('needs no extra docker setup because the node image ships npm', () => {
    expect(pm.dockerSetup()).toBe('')
  })

  it('declares workspaces in the root package.json, not a separate file', () => {
    expect(pm.workspaceFiles(['apps/api'])).toEqual({})
    expect(pm.workspacePkgFields(['apps/api'])).toEqual({ workspaces: ['apps/api'] })
  })

  it('uses a plain range for an internal dependency', () => {
    expect(pm.internalDep()).toBe('*')
  })
})

describe('pnpm strategy', () => {
  const pm = getPackageManager('pnpm')

  it('calls scripts directly', () => {
    expect(pm.runScript('dev')).toBe('pnpm dev')
  })

  it('uses a frozen lockfile install', () => {
    expect(pm.installFrozen()).toBe('pnpm install --frozen-lockfile')
  })

  it('names the pnpm lockfile', () => {
    expect(pm.lockfile()).toBe('pnpm-lock.yaml')
  })

  it('enables corepack in docker', () => {
    expect(pm.dockerSetup()).toContain('corepack enable')
  })

  it('declares workspaces in a separate yaml file', () => {
    expect(pm.workspaceFiles(['apps/api'])['pnpm-workspace.yaml']).toContain('apps/api')
    expect(pm.workspacePkgFields(['apps/api'])).toEqual({})
  })

  it('uses the workspace protocol for an internal dependency', () => {
    expect(pm.internalDep()).toBe('workspace:*')
  })
})

describe('getPackageManager', () => {
  it('rejects an unknown package manager rather than silently defaulting', () => {
    // @ts-expect-error deliberately invalid id
    expect(() => getPackageManager('yarn')).toThrow(/unknown package manager/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/pm/strategy.test.ts`
Expected: FAIL — cannot resolve `@/generator/pm`

- [ ] **Step 3: Write the contract**

Create `src/generator/pm/types.ts`:

```ts
import type { PmId } from '../config/types'

export interface PackageManagerStrategy {
  id: PmId
  /** The command a human runs for a script, e.g. `npm run dev`. */
  runScript(script: string): string
  /** Install for a checkout that already has a lockfile. */
  installFrozen(): string
  /** Install when no lockfile exists yet. */
  install(): string
  lockfile(): string
  /** Dockerfile lines that make this package manager available. */
  dockerSetup(): string
  /** GitHub Actions steps that make this package manager available. */
  ciSetupSteps(): string
  /** Version range used for a workspace-internal dependency. */
  internalDep(): string
  /** Extra root files needed to declare a workspace. */
  workspaceFiles(appPaths: string[]): Record<string, string>
  /** Root package.json fields needed to declare a workspace. */
  workspacePkgFields(appPaths: string[]): Record<string, unknown>
}
```

- [ ] **Step 4: Write both strategies**

Create `src/generator/pm/npm.ts`:

```ts
import type { PackageManagerStrategy } from './types'

export const npmStrategy: PackageManagerStrategy = {
  id: 'npm',
  runScript: (script) => `npm run ${script}`,
  installFrozen: () => 'npm ci',
  install: () => 'npm install',
  lockfile: () => 'package-lock.json',
  dockerSetup: () => '',
  ciSetupSteps: () => `      - uses: actions/setup-node@v4
        with:
          node-version: lts/*
          cache: npm`,
  internalDep: () => '*',
  workspaceFiles: () => ({}),
  workspacePkgFields: (appPaths) => ({ workspaces: appPaths }),
}
```

Create `src/generator/pm/pnpm.ts`:

```ts
import type { PackageManagerStrategy } from './types'

export const pnpmStrategy: PackageManagerStrategy = {
  id: 'pnpm',
  runScript: (script) => `pnpm ${script}`,
  installFrozen: () => 'pnpm install --frozen-lockfile',
  install: () => 'pnpm install',
  lockfile: () => 'pnpm-lock.yaml',
  dockerSetup: () => 'RUN corepack enable',
  ciSetupSteps: () => `      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: lts/*
          cache: pnpm`,
  internalDep: () => 'workspace:*',
  workspaceFiles: (appPaths) => ({
    'pnpm-workspace.yaml': `packages:\n${appPaths.map((p) => `  - '${p}'`).join('\n')}\n`,
  }),
  workspacePkgFields: () => ({}),
}
```

Create `src/generator/pm/index.ts`:

```ts
import type { PmId } from '../config/types'
import type { PackageManagerStrategy } from './types'
import { npmStrategy } from './npm'
import { pnpmStrategy } from './pnpm'

const STRATEGIES: Record<PmId, PackageManagerStrategy> = {
  npm: npmStrategy,
  pnpm: pnpmStrategy,
}

export function getPackageManager(id: PmId): PackageManagerStrategy {
  const pm = STRATEGIES[id]
  if (!pm) throw new Error(`Unknown package manager "${id}"`)
  return pm
}

export type { PackageManagerStrategy }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/pm`
Expected: PASS (13 tests)

- [ ] **Step 6: Commit**

```bash
git add src/generator/pm tests/pm
git commit -m "feat: add package manager strategy for npm and pnpm"
```

---

### Task 10: Base contract and the Next.js base template

**Files:**
- Create: `src/generator/bases/types.ts`, `src/generator/bases/registry.ts`, `src/generator/bases/next/index.ts`, `src/generator/bases/next/files.ts`
- Test: `tests/bases/next.test.ts`

**Interfaces:**
- Consumes: `FileTree` (Tasks 4–7), `LayerCtx` (Task 8), `dep()` (Task 5)
- Produces: `Base` interface with `id`, `init(tree, ctx)`, `renderComposed(tree, ctx)`; `BASES` registry; `nextBase`

The base owns every path decision — where `package.json`, `README.md`, `.gitignore`, and the composed root layout live. That is what keeps layers path-agnostic.

- [ ] **Step 1: Write the failing test**

Create `tests/bases/next.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'
import { nextBase } from '@/generator/bases/next'
import { getPackageManager } from '@/generator/pm'
import type { LayerCtx } from '@/generator/layers/types'

const ctx: LayerCtx = {
  app: { id: 'web', base: 'next', layers: [], options: {} },
  project: { name: 'hrims', layout: 'siblings' },
  pm: getPackageManager('npm'),
}

function build(): FileTree {
  const tree = new FileTree()
  nextBase.init(tree, ctx)
  nextBase.renderComposed(tree, ctx)
  return tree
}

describe('next base', () => {
  it('emits the files a Next app needs to run', () => {
    const paths = build().paths()
    for (const p of ['package.json', 'tsconfig.json', 'next.config.ts', 'src/app/layout.tsx', 'src/app/page.tsx', '.gitignore', 'README.md']) {
      expect(paths).toContain(p)
    }
  })

  it('declares next, react, and react-dom as dependencies', () => {
    const pkg = JSON.parse(build().read('package.json')!)
    expect(Object.keys(pkg.dependencies)).toEqual(expect.arrayContaining(['next', 'react', 'react-dom']))
  })

  it('names the package after the app, not the project', () => {
    const pkg = JSON.parse(build().read('package.json')!)
    expect(pkg.name).toBe('hrims-web')
  })

  it('gitignores node_modules, .next, and .env', () => {
    const ignore = build().read('.gitignore')!
    expect(ignore).toContain('node_modules')
    expect(ignore).toContain('.next')
    expect(ignore).toContain('.env')
  })

  it('renders a layout with no provider wrapper when no layer added one', () => {
    expect(build().read('src/app/layout.tsx')).toContain('{children}')
  })

  it('documents npm commands in the README when npm is selected', () => {
    expect(build().read('README.md')).toContain('npm run dev')
  })

  it('documents pnpm commands in the README when pnpm is selected', () => {
    const tree = new FileTree()
    const pnpmCtx = { ...ctx, pm: getPackageManager('pnpm') }
    nextBase.init(tree, pnpmCtx)
    nextBase.renderComposed(tree, pnpmCtx)
    expect(tree.read('README.md')).toContain('pnpm dev')
  })

  it('nests providers into the layout when a layer pushed one', () => {
    const tree = new FileTree()
    nextBase.init(tree, ctx)
    tree.providers.push({ component: 'Q', importName: 'Q', importFrom: '@/providers/q', order: 10 })
    nextBase.renderComposed(tree, ctx)
    const layout = tree.read('src/app/layout.tsx')!
    expect(layout).toContain("import { Q } from '@/providers/q'")
    expect(layout).toContain('<Q>{children}</Q>')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/bases/next.test.ts`
Expected: FAIL — cannot resolve `@/generator/bases/next`

- [ ] **Step 3: Write the Base contract**

Create `src/generator/bases/types.ts`:

```ts
import type { FileTree } from '../tree/file-tree'
import type { LayerCtx } from '../layers/types'
import type { BaseId } from '../config/types'

export interface Base {
  id: BaseId
  label: string
  /** Whether this app runs a server — root layers use it to decide on Docker/compose. */
  isServer: boolean
  /** Write static template files and seed the models. Runs before layers. */
  init(tree: FileTree, ctx: LayerCtx): void
  /** Render every composed file. Runs after all layers. */
  renderComposed(tree: FileTree, ctx: LayerCtx): void
}
```

Create `src/generator/bases/registry.ts`:

```ts
import type { BaseId } from '../config/types'
import type { Base } from './types'

export const BASES: Partial<Record<BaseId, Base>> = {}

export function registerBase(base: Base): void {
  BASES[base.id] = base
}

export function getBase(id: BaseId): Base {
  const base = BASES[id]
  if (!base) throw new Error(`Unknown base "${id}"`)
  return base
}
```

- [ ] **Step 4: Write the Next base**

Create `src/generator/bases/next/files.ts`:

```ts
export const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
`

export const NEXT_CONFIG = `import type { NextConfig } from 'next'

const nextConfig: NextConfig = {}

export default nextConfig
`

export const PAGE = `export default function Home() {
  return (
    <main>
      <h1>It works</h1>
    </main>
  )
}
`
```

Create `src/generator/bases/next/index.ts`:

```ts
import { registerBase } from '../registry'
import type { Base } from '../types'
import type { FileTree } from '../../tree/file-tree'
import type { LayerCtx } from '../../layers/types'
import { dep } from '../../versions'
import { TSCONFIG, NEXT_CONFIG, PAGE } from './files'

export const nextBase: Base = {
  id: 'next',
  label: 'Next.js',
  isServer: true,

  init(tree: FileTree, ctx: LayerCtx): void {
    tree.write('tsconfig.json', TSCONFIG)
    tree.write('next.config.ts', NEXT_CONFIG)
    tree.write('src/app/page.tsx', PAGE)

    tree.pkg.setName(`${ctx.project.name}-${ctx.app.id}`)
    tree.pkg.addDep('next', dep('next'))
    tree.pkg.addDep('react', dep('react'))
    tree.pkg.addDep('react-dom', dep('react-dom'))
    tree.pkg.addDevDep('typescript', dep('typescript'))
    tree.pkg.addScript('dev', 'next dev')
    tree.pkg.addScript('build', 'next build')
    tree.pkg.addScript('start', 'next start')

    for (const p of ['node_modules', '.next', 'out', '.env', '*.log', '.DS_Store']) {
      tree.ignore.add(p)
    }

    tree.readme.section(
      'Getting started',
      ['```bash', ctx.pm.install(), ctx.pm.runScript('dev'), '```', '', 'Open http://localhost:3000.'].join('\n')
    )
  },

  renderComposed(tree: FileTree, ctx: LayerCtx): void {
    tree.write('package.json', tree.pkg.render())
    tree.write('.gitignore', tree.ignore.render())
    tree.write('README.md', tree.readme.render(`${ctx.project.name}-${ctx.app.id}`))

    const env = tree.env.render()
    if (tree.env.keys().length) {
      tree.write('.env', env.env)
      tree.write('.env.example', env.example)
    }

    tree.write('src/app/layout.tsx', renderLayout(tree))
  },
}

function renderLayout(tree: FileTree): string {
  return `${tree.providers.imports()}
export const metadata = {
  title: 'App',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>${tree.providers.wrap('{children}')}</body>
    </html>
  )
}
`
}

registerBase(nextBase)
```

- [ ] **Step 5: Add the missing versions**

```bash
for p in next react react-dom typescript; do echo "\"$p\": \"^$(npm view $p version)\","; done
```

Ensure each appears in `VERSIONS` in `src/generator/versions.ts`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- tests/bases/next.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 7: Commit**

```bash
git add src/generator/bases src/generator/versions.ts tests/bases
git commit -m "feat: add base contract and Next.js base template"
```

---

### Task 11: The tailwind and prisma layers

**Files:**
- Create: `src/generator/layers/tailwind.ts`, `src/generator/layers/prisma.ts`
- Modify: `src/generator/layers/index.ts`
- Test: `tests/layers/tailwind.test.ts`, `tests/layers/prisma.test.ts`

**Interfaces:**
- Consumes: `Layer`, `LayerCtx`, `registerLayer` (Task 8); `FileTree` models (Tasks 4–7); `dep()` (Task 5)
- Produces: `tailwindLayer`, `prismaLayer` registered in `LAYERS`

Two layers chosen deliberately: `tailwind` is files-only, `prisma` exercises options, env, and README together. Between them every model is covered.

- [ ] **Step 1: Write the failing tests**

Create `tests/layers/tailwind.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'
import { tailwindLayer } from '@/generator/layers/tailwind'
import { getPackageManager } from '@/generator/pm'
import type { LayerCtx } from '@/generator/layers/types'

const ctx: LayerCtx = {
  app: { id: 'web', base: 'next', layers: ['tailwind'], options: {} },
  project: { name: 'hrims', layout: 'siblings' },
  pm: getPackageManager('npm'),
}

describe('tailwind layer', () => {
  it('adds tailwind as a dev dependency', () => {
    const tree = new FileTree()
    tailwindLayer.apply(tree, ctx)
    const pkg = JSON.parse(tree.pkg.render())
    expect(pkg.devDependencies['tailwindcss']).toBeDefined()
  })

  it('writes a stylesheet importing tailwind', () => {
    const tree = new FileTree()
    tailwindLayer.apply(tree, ctx)
    expect(tree.read('src/app/globals.css')).toContain('@import "tailwindcss"')
  })

  it('declares every path it writes in its manifest', () => {
    const tree = new FileTree()
    tailwindLayer.apply(tree, ctx)
    for (const p of tree.paths()) expect(tailwindLayer.manifest).toContain(p)
  })
})
```

Create `tests/layers/prisma.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'
import { prismaLayer } from '@/generator/layers/prisma'
import { getPackageManager } from '@/generator/pm'
import type { LayerCtx } from '@/generator/layers/types'

const ctx = (db: string, pm: 'npm' | 'pnpm' = 'npm'): LayerCtx => ({
  app: { id: 'api', base: 'next', layers: ['prisma'], options: { db } },
  project: { name: 'hrims', layout: 'siblings' },
  pm: getPackageManager(pm),
})

describe('prisma layer', () => {
  it('writes a schema with the postgresql provider', () => {
    const tree = new FileTree()
    prismaLayer.apply(tree, ctx('postgres'))
    expect(tree.read('prisma/schema.prisma')).toContain('provider = "postgresql"')
  })

  it('writes a schema with the mysql provider', () => {
    const tree = new FileTree()
    prismaLayer.apply(tree, ctx('mysql'))
    expect(tree.read('prisma/schema.prisma')).toContain('provider = "mysql"')
  })

  it('defaults to postgres when no db option is given', () => {
    const tree = new FileTree()
    prismaLayer.apply(tree, { ...ctx('postgres'), app: { id: 'api', base: 'next', layers: ['prisma'], options: {} } })
    expect(tree.read('prisma/schema.prisma')).toContain('postgresql')
  })

  it('rejects an unsupported db option rather than guessing', () => {
    const tree = new FileTree()
    expect(() => prismaLayer.apply(tree, ctx('oracle'))).toThrow(/unsupported db/i)
  })

  it('sets DATABASE_URL with a placeholder that leaks no real value', () => {
    const tree = new FileTree()
    prismaLayer.apply(tree, ctx('postgres'))
    const { env, example } = tree.env.render()
    expect(env).toContain('DATABASE_URL=postgresql://')
    expect(example).not.toContain('localhost')
  })

  it('exports a single shared client instance', () => {
    const tree = new FileTree()
    prismaLayer.apply(tree, ctx('postgres'))
    expect(tree.read('src/lib/db.ts')).toContain('globalThis')
  })

  it('documents itself in the README using the selected package manager', () => {
    const tree = new FileTree()
    prismaLayer.apply(tree, ctx('postgres'))
    expect(tree.readme.render('x')).toContain('npm run db:migrate')
  })

  it('documents pnpm commands when pnpm is selected', () => {
    const tree = new FileTree()
    prismaLayer.apply(tree, ctx('postgres', 'pnpm'))
    expect(tree.readme.render('x')).toContain('pnpm db:migrate')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/layers`
Expected: FAIL — layer modules cannot be resolved

- [ ] **Step 3: Write the tailwind layer**

Create `src/generator/layers/tailwind.ts`:

```ts
import { registerLayer } from './registry'
import type { Layer, LayerCtx } from './types'
import type { FileTree } from '../tree/file-tree'
import { dep } from '../versions'

const GLOBALS_CSS = `@import "tailwindcss";
`

export const tailwindLayer: Layer = {
  id: 'tailwind',
  label: 'Tailwind CSS',
  description: 'Utility-first CSS framework',
  appliesTo: ['next', 'vite-react'],
  manifest: ['src/app/globals.css', 'postcss.config.mjs'],

  apply(tree: FileTree, _ctx: LayerCtx): void {
    tree.write('src/app/globals.css', GLOBALS_CSS)
    tree.write('postcss.config.mjs', `const config = {\n  plugins: { '@tailwindcss/postcss': {} },\n}\n\nexport default config\n`)
    tree.pkg.addDevDep('tailwindcss', dep('tailwindcss'))
    tree.pkg.addDevDep('@tailwindcss/postcss', dep('@tailwindcss/postcss'))
  },
}

registerLayer(tailwindLayer)
```

- [ ] **Step 4: Write the prisma layer**

Create `src/generator/layers/prisma.ts`:

```ts
import { registerLayer } from './registry'
import type { Layer, LayerCtx } from './types'
import type { FileTree } from '../tree/file-tree'
import { dep } from '../versions'

const PROVIDERS: Record<string, { provider: string; url: string; placeholder: string }> = {
  postgres: {
    provider: 'postgresql',
    url: 'postgresql://postgres:postgres@localhost:5432/app',
    placeholder: 'postgresql://user:password@host:5432/dbname',
  },
  mysql: {
    provider: 'mysql',
    url: 'mysql://root:root@localhost:3306/app',
    placeholder: 'mysql://user:password@host:3306/dbname',
  },
}

const CLIENT = `import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const db = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
`

export const prismaLayer: Layer = {
  id: 'prisma',
  label: 'Prisma ORM',
  description: 'Type-safe database access',
  appliesTo: ['next', 'express'],
  manifest: ['prisma/schema.prisma', 'src/lib/db.ts'],

  apply(tree: FileTree, ctx: LayerCtx): void {
    const dbOption = ctx.app.options.db ?? 'postgres'
    const target = PROVIDERS[dbOption]
    if (!target) throw new Error(`Unsupported db option "${dbOption}" for the prisma layer`)

    tree.write('prisma/schema.prisma', `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "${target.provider}"
  url      = env("DATABASE_URL")
}
`)
    tree.write('src/lib/db.ts', CLIENT)

    tree.env.set('DATABASE_URL', target.url, {
      comment: 'Local development database',
      placeholder: target.placeholder,
    })

    tree.pkg.addDep('@prisma/client', dep('@prisma/client'))
    tree.pkg.addDevDep('prisma', dep('prisma'))
    tree.pkg.addScript('db:migrate', 'prisma migrate dev')
    tree.pkg.addScript('db:studio', 'prisma studio')

    tree.readme.section(
      'Database',
      ['```bash', ctx.pm.runScript('db:migrate'), '```', '', 'Edit `prisma/schema.prisma`, then run the command above.'].join('\n')
    )
  },
}

registerLayer(prismaLayer)
```

- [ ] **Step 5: Register both in the layer index**

Replace `src/generator/layers/index.ts`:

```ts
/** Importing this module registers every layer. Add each new layer file here. */
import './tailwind'
import './prisma'

export {}
```

- [ ] **Step 6: Add the missing versions**

```bash
for p in tailwindcss @tailwindcss/postcss @prisma/client prisma; do echo "\"$p\": \"^$(npm view $p version)\","; done
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -- tests/layers`
Expected: PASS — 10 layer tests plus all 7 resolver tests from Task 8, which now find registered layers

- [ ] **Step 8: Commit**

```bash
git add src/generator/layers src/generator/versions.ts tests/layers
git commit -m "feat: add tailwind and prisma layers"
```

---

### Task 12: Assembler contract and the siblings assembler

**Files:**
- Create: `src/generator/assemblers/types.ts`, `src/generator/assemblers/registry.ts`, `src/generator/assemblers/siblings.ts`
- Test: `tests/assemblers/siblings.test.ts`

**Interfaces:**
- Consumes: `FileTree` (Task 4), `AppSpec`/`ProtosConfig` (Task 2), `Base` (Task 10)
- Produces: `BuiltApp`, `Deliverable`, `ComposeService`, `DockerStrategy`, `CiStrategy`, `Assembler`, `ProjectTree`; `getAssembler(id: LayoutId): Assembler`; `siblingsAssembler`

- [ ] **Step 1: Write the failing test**

Create `tests/assemblers/siblings.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'
import { siblingsAssembler } from '@/generator/assemblers/siblings'
import { getPackageManager } from '@/generator/pm'
import type { BuiltApp } from '@/generator/assemblers/types'
import type { ProtosConfig } from '@/generator/config/types'

const cfg: ProtosConfig = {
  v: 1, name: 'hrims', layout: 'siblings', pm: 'npm',
  apps: [
    { id: 'api', base: 'express', layers: [], options: {} },
    { id: 'web', base: 'next', layers: [], options: {} },
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

describe('siblings assembler', () => {
  it('produces exactly one deliverable named after the project', () => {
    const out = siblingsAssembler.assemble(apps(), cfg, new FileTree())
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('hrims')
  })

  it('places each app in its own prefixed folder', () => {
    const files = siblingsAssembler.assemble(apps(), cfg, new FileTree())[0].files
    expect([...files.keys()]).toEqual(
      expect.arrayContaining(['hrims-api/src/index.ts', 'hrims-web/src/index.ts'])
    )
  })

  it('exposes the same paths through appPath that it uses when assembling', () => {
    expect(siblingsAssembler.appPath(cfg.apps[0], cfg)).toBe('hrims-api')
  })

  it('places root files at the top level, unprefixed', () => {
    const root = new FileTree()
    root.write('docker-compose.yml', 'services: {}')
    const files = siblingsAssembler.assemble(apps(), cfg, root)[0].files
    expect(files.get('docker-compose.yml')).toBe('services: {}')
  })

  it('sorts output paths for deterministic archives', () => {
    const keys = [...siblingsAssembler.assemble(apps(), cfg, new FileTree())[0].files.keys()]
    expect(keys).toEqual([...keys].sort())
  })

  it('renders an npm Dockerfile when npm is selected', () => {
    const df = siblingsAssembler.dockerStrategy(getPackageManager('npm')).dockerfile(apps()[0], 'hrims-api')
    expect(df).toContain('RUN npm install')
    expect(df).not.toContain('corepack')
  })

  it('renders a pnpm Dockerfile with corepack when pnpm is selected', () => {
    const df = siblingsAssembler.dockerStrategy(getPackageManager('pnpm')).dockerfile(apps()[0], 'hrims-api')
    expect(df).toContain('corepack enable')
    expect(df).toContain('pnpm-lock.yaml')
  })

  it('renders CI steps for the selected package manager', () => {
    const paths = new Map([['api', 'hrims-api'], ['web', 'hrims-web']])
    const wf = siblingsAssembler.ciStrategy(getPackageManager('pnpm')).workflow(apps(), paths)
    expect(wf).toContain('pnpm/action-setup')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/assemblers/siblings.test.ts`
Expected: FAIL — cannot resolve `@/generator/assemblers/siblings`

- [ ] **Step 3: Write the contracts**

Create `src/generator/assemblers/types.ts`:

```ts
import type { FileTree } from '../tree/file-tree'
import type { AppSpec, LayoutId, ProtosConfig } from '../config/types'
import type { PackageManagerStrategy } from '../pm/types'

export interface BuiltApp {
  spec: AppSpec
  tree: FileTree
  isServer: boolean
}

export interface Deliverable {
  name: string
  files: Map<string, string>
}

export interface ComposeService {
  name: string
  build?: { context: string; dockerfile: string }
  image?: string
  ports?: string[]
  environment?: Record<string, string>
  dependsOn?: string[]
}

export interface DockerStrategy {
  /** The Dockerfile for one app, given its path within the deliverable. */
  dockerfile(app: BuiltApp, appPath: string): string
  /** The compose service entry for one app. */
  service(app: BuiltApp, appPath: string): ComposeService
}

export interface CiStrategy {
  workflow(apps: BuiltApp[], appPaths: Map<string, string>): string
}

export interface ProjectTree {
  root: FileTree
  apps: BuiltApp[]
  appPath(spec: AppSpec): string
}

export interface Assembler {
  id: LayoutId
  appPath(spec: AppSpec, cfg: ProtosConfig): string
  assemble(apps: BuiltApp[], cfg: ProtosConfig, root: FileTree): Deliverable[]
  dockerStrategy(pm: PackageManagerStrategy): DockerStrategy
  ciStrategy(pm: PackageManagerStrategy): CiStrategy
}
```

Create `src/generator/assemblers/registry.ts`:

```ts
import type { LayoutId } from '../config/types'
import type { Assembler } from './types'

export const ASSEMBLERS: Partial<Record<LayoutId, Assembler>> = {}

export function registerAssembler(a: Assembler): void {
  ASSEMBLERS[a.id] = a
}

export function getAssembler(id: LayoutId): Assembler {
  const a = ASSEMBLERS[id]
  if (!a) throw new Error(`Unknown layout "${id}"`)
  return a
}
```

- [ ] **Step 4: Write the siblings assembler**

Create `src/generator/assemblers/siblings.ts`:

```ts
import { registerAssembler } from './registry'
import type { Assembler, BuiltApp, ComposeService, CiStrategy, Deliverable, DockerStrategy } from './types'
import type { PackageManagerStrategy } from '../pm/types'
import type { FileTree } from '../tree/file-tree'
import type { AppSpec, ProtosConfig } from '../config/types'

const dockerStrategy = (pm: PackageManagerStrategy): DockerStrategy => ({
  dockerfile(_app: BuiltApp): string {
    const setup = pm.dockerSetup()
    return [
      'FROM node:22-alpine AS base',
      ...(setup ? [setup] : []),
      '',
      'FROM base AS deps',
      'WORKDIR /app',
      `COPY package.json ${pm.lockfile()}* ./`,
      // install(), not installFrozen(): protos cannot generate a lockfile
      // without running the package manager, so a frozen install would fail
      // on the very first build. See the note under this task.
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/assemblers/siblings.test.ts`
Expected: PASS (8 tests)

**Why `install()` and not `installFrozen()`:** protos cannot generate a lockfile, because producing one means running the package manager — which the "no code execution" constraint forbids. A generated `Dockerfile` using `npm ci` or `pnpm install --frozen-lockfile` would therefore fail on its very first build. Generated projects use the plain install everywhere, and the README tells the user to commit the lockfile after their first install. Reproducibility is the user's to opt into; a scaffold that cannot build is not.

- [ ] **Step 6: Commit**

```bash
git add src/generator/assemblers tests/assemblers
git commit -m "feat: add assembler contract and siblings layout"
```

---

### Task 13: RootLayer contract and the docker root layer

**Files:**
- Create: `src/generator/layers/root-types.ts`, `src/generator/layers/docker.ts`, `src/generator/layers/root-registry.ts`
- Test: `tests/layers/docker.test.ts`

**Interfaces:**
- Consumes: `ProjectTree`, `DockerStrategy`, `BuiltApp` (Task 12); `FileTree` (Task 4)
- Produces: `RootLayer`, `RootCtx`, `ROOT_LAYERS`, `registerRootLayer`, `resolveRootLayers(cfg)`, `dockerRootLayer`

This is the seam the spec's self-review added. `docker` writes a Dockerfile into *each app* and a single compose file at the *root*, which the per-app `Layer` signature cannot express. It also reads each app's `env` model to decide whether a database service belongs in compose — behaviour, not a checkbox.

**Divergence from spec §5.2:** the spec lists `.dockerignore` as an `IgnoreModel` render target. This plan writes it as a static string instead, because no other layer contributes Docker ignore patterns — routing it through a shared model would add indirection for a single writer. Revisit if a second layer ever needs to add patterns.

- [ ] **Step 1: Write the failing test**

Create `tests/layers/docker.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'
import { dockerRootLayer } from '@/generator/layers/docker'
import { siblingsAssembler } from '@/generator/assemblers/siblings'
import { getPackageManager } from '@/generator/pm'
import type { ProjectTree } from '@/generator/assemblers/types'
import type { RootCtx } from '@/generator/layers/root-types'
import type { ProtosConfig } from '@/generator/config/types'

const cfg: ProtosConfig = {
  v: 1, name: 'hrims', layout: 'siblings', pm: 'npm',
  apps: [{ id: 'web', base: 'next', layers: [], options: {} }],
  layers: ['docker'],
}

function project(withDb = false): ProjectTree {
  const tree = new FileTree()
  if (withDb) tree.env.set('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/app')
  return {
    root: new FileTree(),
    apps: [{ spec: cfg.apps[0], tree, isServer: true }],
    appPath: (spec) => siblingsAssembler.appPath(spec, cfg),
  }
}

const pm = getPackageManager('npm')

const ctx: RootCtx = {
  project: { name: 'hrims', layout: 'siblings' },
  pm,
  docker: siblingsAssembler.dockerStrategy(pm),
  ci: siblingsAssembler.ciStrategy(pm),
}

describe('docker root layer', () => {
  it('writes a Dockerfile into each app, not the root', () => {
    const p = project()
    dockerRootLayer.applyRoot(p, ctx)
    expect(p.apps[0].tree.exists('Dockerfile')).toBe(true)
    expect(p.root.exists('Dockerfile')).toBe(false)
  })

  it('writes a single compose file at the root', () => {
    const p = project()
    dockerRootLayer.applyRoot(p, ctx)
    expect(p.root.read('docker-compose.yml')).toContain('services:')
  })

  it('adds a postgres service because an app declared DATABASE_URL', () => {
    const p = project(true)
    dockerRootLayer.applyRoot(p, ctx)
    expect(p.root.read('docker-compose.yml')).toContain('postgres')
  })

  it('omits the database service when no app declared DATABASE_URL', () => {
    const p = project(false)
    dockerRootLayer.applyRoot(p, ctx)
    expect(p.root.read('docker-compose.yml')).not.toContain('postgres')
  })

  it('gitignores nothing new but dockerignores node_modules per app', () => {
    const p = project()
    dockerRootLayer.applyRoot(p, ctx)
    expect(p.apps[0].tree.read('.dockerignore')).toContain('node_modules')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/layers/docker.test.ts`
Expected: FAIL — cannot resolve `@/generator/layers/docker`

- [ ] **Step 3: Write the RootLayer contract**

Create `src/generator/layers/root-types.ts`:

```ts
import type { LayerId, LayoutId } from '../config/types'
import type { CiStrategy, DockerStrategy, ProjectTree } from '../assemblers/types'
import type { PackageManagerStrategy } from '../pm/types'

export interface RootCtx {
  project: { name: string; layout: LayoutId }
  pm: PackageManagerStrategy
  docker: DockerStrategy
  ci: CiStrategy
}

export interface RootLayer {
  id: LayerId
  label: string
  description: string
  /** Skip this layer when no app in the project runs a server. */
  requiresServerApp?: boolean
  manifest: string[]
  applyRoot(project: ProjectTree, ctx: RootCtx): void
}
```

Create `src/generator/layers/root-registry.ts`:

```ts
import type { LayerId } from '../config/types'
import type { RootLayer } from './root-types'

export const ROOT_LAYERS: Partial<Record<LayerId, RootLayer>> = {}

export function registerRootLayer(layer: RootLayer): void {
  ROOT_LAYERS[layer.id] = layer
}

export function isRootLayer(id: LayerId): boolean {
  return id in ROOT_LAYERS
}
```

- [ ] **Step 4: Write the docker root layer**

Create `src/generator/layers/docker.ts`:

```ts
import { registerRootLayer } from './root-registry'
import type { RootCtx, RootLayer } from './root-types'
import type { ComposeService, ProjectTree } from '../assemblers/types'

const DOCKERIGNORE = `node_modules
.next
dist
.git
.env
`

export const dockerRootLayer: RootLayer = {
  id: 'docker',
  label: 'Docker',
  description: 'Dockerfile per app plus a compose file that starts everything',
  requiresServerApp: true,
  manifest: ['docker-compose.yml', 'Dockerfile', '.dockerignore'],

  applyRoot(project: ProjectTree, ctx: RootCtx): void {
    const services: ComposeService[] = []

    for (const app of project.apps) {
      if (!app.isServer) continue
      const appPath = project.appPath(app.spec)
      app.tree.write('Dockerfile', ctx.docker.dockerfile(app, appPath))
      app.tree.write('.dockerignore', DOCKERIGNORE)
      services.push(ctx.docker.service(app, appPath))
    }

    const needsPostgres = project.apps.some((a) =>
      a.tree.env.keys().includes('DATABASE_URL')
    )
    if (needsPostgres) {
      services.push({
        name: 'db',
        image: 'postgres:17-alpine',
        ports: ['5432:5432'],
        environment: { POSTGRES_USER: 'postgres', POSTGRES_PASSWORD: 'postgres', POSTGRES_DB: 'app' },
      })
      for (const s of services) {
        if (s.name !== 'db') s.dependsOn = ['db']
      }
    }

    project.root.write('docker-compose.yml', renderCompose(services))
  },
}

function renderCompose(services: ComposeService[]): string {
  const body = services
    .map((s) => {
      const lines = [`  ${s.name}:`]
      if (s.image) lines.push(`    image: ${s.image}`)
      if (s.build) lines.push(`    build:`, `      context: ${s.build.context}`, `      dockerfile: ${s.build.dockerfile}`)
      if (s.ports?.length) lines.push(`    ports:`, ...s.ports.map((p) => `      - '${p}'`))
      if (s.environment) {
        lines.push(`    environment:`)
        for (const [k, v] of Object.entries(s.environment)) lines.push(`      ${k}: ${v}`)
      }
      if (s.dependsOn?.length) lines.push(`    depends_on:`, ...s.dependsOn.map((d) => `      - ${d}`))
      return lines.join('\n')
    })
    .join('\n')

  return `services:\n${body}\n`
}

registerRootLayer(dockerRootLayer)
```

- [ ] **Step 5: Register it in the layer index**

In `src/generator/layers/index.ts`, add:

```ts
import './docker'
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- tests/layers/docker.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 7: Commit**

```bash
git add src/generator/layers tests/layers/docker.test.ts
git commit -m "feat: add RootLayer contract and docker root layer"
```

---

### Task 14: Pipeline orchestrator

**Files:**
- Create: `src/generator/pipeline.ts`
- Test: `tests/pipeline.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–13
- Produces: `generate(cfg: ProtosConfig): Promise<Deliverable[]>`

Ordering is load-bearing: root layers run **before** `renderComposed` so that anything they add to a model still reaches `package.json` and `.env`.

- [ ] **Step 1: Write the failing test**

Create `tests/pipeline.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { generate } from '@/generator/pipeline'
import type { ProtosConfig } from '@/generator/config/types'

const cfg: ProtosConfig = {
  v: 1, name: 'hrims', layout: 'siblings', pm: 'npm',
  apps: [{ id: 'web', base: 'next', layers: ['tailwind', 'prisma'], options: { db: 'postgres' } }],
  layers: ['docker'],
}

describe('generate', () => {
  it('produces a single deliverable with the app under its prefixed folder', async () => {
    const [out] = await generate(cfg)
    expect(out.name).toBe('hrims')
    expect([...out.files.keys()]).toEqual(expect.arrayContaining([
      'hrims-web/package.json',
      'hrims-web/src/app/layout.tsx',
      'hrims-web/prisma/schema.prisma',
      'hrims-web/Dockerfile',
      'docker-compose.yml',
    ]))
  })

  it('includes deps from every layer in one package.json', async () => {
    const [out] = await generate(cfg)
    const pkg = JSON.parse(out.files.get('hrims-web/package.json')!)
    expect(pkg.dependencies['@prisma/client']).toBeDefined()
    expect(pkg.devDependencies['tailwindcss']).toBeDefined()
    expect(pkg.dependencies['next']).toBeDefined()
  })

  it('writes .env because the prisma layer declared a key', async () => {
    const [out] = await generate(cfg)
    expect(out.files.get('hrims-web/.env')).toContain('DATABASE_URL')
  })

  it('is deterministic', async () => {
    const a = await generate(cfg)
    const b = await generate(cfg)
    expect([...a[0].files.entries()]).toEqual([...b[0].files.entries()])
  })

  it('produces identical output when layer order in the config is reversed', async () => {
    const reversed = { ...cfg, apps: [{ ...cfg.apps[0], layers: ['prisma', 'tailwind'] as const }] }
    const a = await generate(cfg)
    const b = await generate(reversed as ProtosConfig)
    expect([...a[0].files.entries()]).toEqual([...b[0].files.entries()])
  })

  it('completes within the 300ms budget', async () => {
    const start = performance.now()
    await generate(cfg)
    expect(performance.now() - start).toBeLessThan(300)
  })

  it('formats generated TypeScript with prettier', async () => {
    const [out] = await generate(cfg)
    expect(out.files.get('hrims-web/src/lib/db.ts')).not.toContain('\t')
  })

  it('threads the package manager choice into every artifact', async () => {
    const [npmOut] = await generate(cfg)
    const [pnpmOut] = await generate({ ...cfg, pm: 'pnpm' })
    expect(npmOut.files.get('hrims-web/Dockerfile')).toContain('npm install')
    expect(npmOut.files.get('hrims-web/README.md')).toContain('npm run dev')
    expect(pnpmOut.files.get('hrims-web/Dockerfile')).toContain('corepack enable')
    expect(pnpmOut.files.get('hrims-web/README.md')).toContain('pnpm dev')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/pipeline.test.ts`
Expected: FAIL — cannot resolve `@/generator/pipeline`

- [ ] **Step 3: Write the implementation**

Create `src/generator/pipeline.ts`:

```ts
import { format } from 'prettier'
import type { ProtosConfig } from './config/types'
import { FileTree } from './tree/file-tree'
import { getBase } from './bases/registry'
import { resolveLayers } from './layers/resolve'
import { ROOT_LAYERS } from './layers/root-registry'
import { getAssembler } from './assemblers/registry'
import { getPackageManager } from './pm'
import type { BuiltApp, Deliverable, ProjectTree } from './assemblers/types'
import './bases/index'
import './layers/index'
import './assemblers/index'

export async function generate(cfg: ProtosConfig): Promise<Deliverable[]> {
  const assembler = getAssembler(cfg.layout)
  const pm = getPackageManager(cfg.pm)

  // 1. Build each app: base seeds the tree, then layers apply.
  const apps: BuiltApp[] = cfg.apps.map((spec) => {
    const base = getBase(spec.base)
    const tree = new FileTree()
    const ctx = {
      app: spec,
      project: { name: cfg.name, layout: cfg.layout },
      pm,
      sibling: cfg.apps.find((a) => a.id !== spec.id),
    }
    base.init(tree, ctx)
    for (const layer of resolveLayers(spec)) layer.apply(tree, ctx)
    return { spec, tree, isServer: base.isServer }
  })

  // 2. Root layers run BEFORE renderComposed so their model edits still land.
  const project: ProjectTree = {
    root: new FileTree(),
    apps,
    appPath: (spec) => assembler.appPath(spec, cfg),
  }
  const rootCtx = {
    project: { name: cfg.name, layout: cfg.layout },
    pm,
    docker: assembler.dockerStrategy(pm),
    ci: assembler.ciStrategy(pm),
  }
  for (const id of cfg.layers) {
    const layer = ROOT_LAYERS[id]
    if (!layer) throw new Error(`Unknown root layer "${id}"`)
    if (layer.requiresServerApp && !apps.some((a) => a.isServer)) continue
    layer.applyRoot(project, rootCtx)
  }

  // 3. Render every composed file.
  for (const app of apps) {
    getBase(app.spec.base).renderComposed(app.tree, {
      app: app.spec,
      project: { name: cfg.name, layout: cfg.layout },
      pm,
      sibling: cfg.apps.find((a) => a.id !== app.spec.id),
    })
  }

  // 4. Place everything, then format.
  const deliverables = assembler.assemble(apps, cfg, project.root)
  return Promise.all(deliverables.map(formatDeliverable))
}

const PARSERS: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'babel', mjs: 'babel',
  json: 'json', md: 'markdown', css: 'css', yml: 'yaml', yaml: 'yaml',
}

async function formatDeliverable(d: Deliverable): Promise<Deliverable> {
  const formatted = new Map<string, string>()
  for (const [path, content] of d.files) {
    const parser = PARSERS[path.split('.').pop() ?? '']
    if (!parser) {
      formatted.set(path, content)
      continue
    }
    try {
      formatted.set(path, await format(content, { parser, semi: false, singleQuote: true }))
    } catch {
      // A file prettier cannot parse ships as-is; the smoke tier will catch real breakage.
      formatted.set(path, content)
    }
  }
  return { ...d, files: formatted }
}
```

- [ ] **Step 4: Create the two missing index modules**

Create `src/generator/bases/index.ts`:

```ts
/** Importing this module registers every base. */
import './next'

export {}
```

Create `src/generator/assemblers/index.ts`:

```ts
/** Importing this module registers every assembler. */
import './siblings'

export {}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/pipeline.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS — every test from Tasks 1–14

- [ ] **Step 7: Commit**

```bash
git add src/generator tests/pipeline.test.ts
git commit -m "feat: add generation pipeline with deterministic ordering"
```

---

### Task 15: ZIP sink and the generate endpoint

**Files:**
- Create: `src/generator/sinks/zip.ts`, `src/app/api/generate/route.ts`
- Test: `tests/sinks/zip.test.ts`, `tests/api/generate.test.ts`

**Interfaces:**
- Consumes: `Deliverable` (Task 12), `generate` (Task 14), `decodeConfig` (Task 3), `ConfigError` (Task 2)
- Produces: `toZip(deliverables: Deliverable[], projectName: string): Uint8Array`; `GET /api/generate?c=<config>`

- [ ] **Step 1: Write the failing tests**

Create `tests/sinks/zip.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { toZip } from '@/generator/sinks/zip'

const deliverable = (name: string, files: [string, string][]) => ({ name, files: new Map(files) })

describe('toZip', () => {
  it('round-trips a single deliverable', () => {
    const zip = toZip([deliverable('hrims', [['a.txt', 'hello']])], 'hrims')
    expect(strFromU8(unzipSync(zip)['hrims/a.txt'])).toBe('hello')
  })

  it('namespaces multiple deliverables under their own folders', () => {
    const zip = toZip(
      [deliverable('api', [['a.txt', 'a']]), deliverable('web', [['b.txt', 'b']])],
      'hrims'
    )
    expect(Object.keys(unzipSync(zip))).toEqual(
      expect.arrayContaining(['api/a.txt', 'web/b.txt'])
    )
  })

  it('is byte-identical for identical input', () => {
    const build = () => toZip([deliverable('x', [['a.txt', 'hello']])], 'x')
    expect(Buffer.from(build())).toEqual(Buffer.from(build()))
  })

  it('produces a non-empty archive', () => {
    expect(toZip([deliverable('x', [['a', 'b']])], 'x').length).toBeGreaterThan(0)
  })
})
```

Create `tests/api/generate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { GET } from '@/app/api/generate/route'
import { encodeConfig } from '@/generator/config/codec'
import type { ProtosConfig } from '@/generator/config/types'

const cfg: ProtosConfig = {
  v: 1, name: 'hrims', layout: 'siblings', pm: 'npm',
  apps: [{ id: 'web', base: 'next', layers: ['tailwind'], options: {} }],
  layers: [],
}

const call = (query: string) => GET(new Request(`http://localhost/api/generate${query}`))

describe('GET /api/generate', () => {
  it('returns a zip attachment for a valid config', async () => {
    const res = await call(`?c=${encodeConfig(cfg)}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/zip')
    expect(res.headers.get('content-disposition')).toContain('hrims.zip')
  })

  it('returns 400 when c is missing', async () => {
    expect((await call('')).status).toBe(400)
  })

  it('returns 400 for a malformed config rather than throwing', async () => {
    expect((await call('?c=!!!not-valid!!!')).status).toBe(400)
  })

  it('does not leak internal stack traces in the error body', async () => {
    const body = await (await call('?c=!!!not-valid!!!')).text()
    expect(body).not.toContain('at ')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/sinks tests/api`
Expected: FAIL — modules cannot be resolved

- [ ] **Step 3: Write the ZIP sink**

Create `src/generator/sinks/zip.ts`:

```ts
import { zipSync, strToU8 } from 'fflate'
import type { Deliverable } from '../assemblers/types'

export function toZip(deliverables: Deliverable[], _projectName: string): Uint8Array {
  const entries: Record<string, Uint8Array> = {}
  for (const d of deliverables) {
    for (const [path, content] of d.files) {
      entries[`${d.name}/${path}`] = strToU8(content)
    }
  }
  // mtime fixed so identical input yields a byte-identical archive.
  return zipSync(entries, { level: 6, mtime: 0 })
}
```

- [ ] **Step 4: Write the route handler**

Create `src/app/api/generate/route.ts`:

```ts
import { decodeConfig } from '@/generator/config/codec'
import { ConfigError } from '@/generator/config/errors'
import { generate } from '@/generator/pipeline'
import { toZip } from '@/generator/sinks/zip'

export async function GET(request: Request): Promise<Response> {
  const encoded = new URL(request.url).searchParams.get('c')
  if (!encoded) {
    return Response.json({ error: 'Missing config parameter "c"' }, { status: 400 })
  }

  try {
    const cfg = decodeConfig(encoded)
    const zip = toZip(await generate(cfg), cfg.name)

    return new Response(zip as BodyInit, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${cfg.name}.zip"`,
        'Content-Length': String(zip.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    // Only ConfigError messages are safe to surface — they describe user input.
    const message = error instanceof ConfigError ? error.message : 'Could not generate project'
    return Response.json({ error: message }, { status: 400 })
  }
}
```

The `Cache-Control` header is safe and valuable here: the config string fully determines the bytes, so an identical URL can never produce different output.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/sinks tests/api`
Expected: PASS (7 tests)

- [ ] **Step 6: Add rate limiting**

The spec requires it (§10) and there is no database, so the limiter is in-memory.

Create `src/app/api/rate-limit.ts`:

```ts
const WINDOW_MS = 60_000
const MAX_REQUESTS = 30

const hits = new Map<string, number[]>()

/**
 * Per-instance sliding window. On serverless this limits each instance rather
 * than the fleet, which is the right trade for v1: no database, no shared state,
 * and enough to stop a single client hammering one instance.
 */
export function allow(key: string): boolean {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  if (recent.length >= MAX_REQUESTS) {
    hits.set(key, recent)
    return false
  }
  recent.push(now)
  hits.set(key, recent)
  return true
}

export function resetRateLimit(): void {
  hits.clear()
}
```

Add to the top of the `try` block in `src/app/api/generate/route.ts`:

```ts
import { allow } from '../rate-limit'
```

```ts
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!allow(ip)) {
    return Response.json({ error: 'Too many requests' }, { status: 429 })
  }
```

Place it immediately after the `c` parameter check, before decoding.

Add to `tests/api/generate.test.ts`:

```ts
import { resetRateLimit } from '@/app/api/rate-limit'

it('returns 429 once the window is exhausted', async () => {
  resetRateLimit()
  const url = `?c=${encodeConfig(cfg)}`
  for (let i = 0; i < 30; i++) await call(url)
  expect((await call(url)).status).toBe(429)
})
```

Run: `npm test -- tests/api`
Expected: PASS (5 tests)

- [ ] **Step 7: Verify a real download end to end**

Create `scripts/encode.ts`:

```ts
import { encodeConfig } from '../src/generator/config/codec.ts'

console.log(
  encodeConfig({
    v: 1,
    name: 'hrims',
    layout: 'siblings',
    pm: 'npm',
    apps: [{ id: 'web', base: 'next', layers: ['tailwind', 'prisma'], options: { db: 'postgres' } }],
    layers: ['docker'],
  })
)
```

Add to `package.json` scripts:

```json
"encode": "node --experimental-strip-types scripts/encode.ts"
```

Then:

```bash
npm run dev &
until curl -sf http://localhost:3000 -o /dev/null; do sleep 1; done
C=$(npm run -s encode)
curl -sfL "http://localhost:3000/api/generate?c=$C" -o /tmp/hrims.zip
unzip -l /tmp/hrims.zip
```

Expected: the listing contains `hrims/hrims-web/package.json`, `hrims/hrims-web/prisma/schema.prisma`, `hrims/hrims-web/Dockerfile`, and `hrims/docker-compose.yml`.

- [ ] **Step 8: Prove the generated project actually works**

```bash
cd /tmp && rm -rf hrims && unzip -q hrims.zip && cd hrims/hrims-web
npm install && npm run build
```

Expected: install and build both succeed. This is the first moment protos has produced something real — do not skip it. Stop the dev server afterwards.

- [ ] **Step 7: Commit**

```bash
git add src/generator/sinks src/app/api tests/sinks tests/api scripts package.json
git commit -m "feat: add zip sink, rate-limited generate endpoint, and encode script"
```

---

### Task 16: Tier 2 — snapshot harness

**Files:**
- Create: `tests/snapshots/manifest.ts`, `tests/snapshots/configs.ts`, `tests/snapshots/snapshot.test.ts`
- Test: the above (this task's deliverable *is* tests)

**Interfaces:**
- Consumes: `generate` (Task 14), `ProtosConfig` (Task 2)
- Produces: `manifestOf(deliverables): string`, `CANONICAL_CONFIGS: { name: string; config: ProtosConfig }[]`

Tier 2 catches what tier 1 structurally cannot: one layer breaking another. Reviewing the snapshot diff is how a layer change gets approved — an unexpected hash change in an unrelated file is the signal.

- [ ] **Step 1: Write the manifest helper**

Create `tests/snapshots/manifest.ts`:

```ts
import { createHash } from 'node:crypto'
import type { Deliverable } from '@/generator/assemblers/types'

/** Paths plus content hashes — stable, reviewable, and small enough to read in a diff. */
export function manifestOf(deliverables: Deliverable[]): string {
  return deliverables
    .flatMap((d) =>
      [...d.files.entries()].map(
        ([path, content]) =>
          `${d.name}/${path}  ${createHash('sha256').update(content).digest('hex').slice(0, 12)}`
      )
    )
    .sort()
    .join('\n')
}
```

- [ ] **Step 2: Define the canonical configs**

Create `tests/snapshots/configs.ts`. Plan 1 implements one base and three layers, so only configs 1, 2, and 9 from the spec's matrix are expressible; Plan 2 fills in the rest.

Config 2 runs **pnpm** and the other two run npm, matching the spec's rule that the package manager is covered by swapping rather than multiplying the matrix.

```ts
import type { ProtosConfig } from '@/generator/config/types'

export const CANONICAL_CONFIGS: { name: string; config: ProtosConfig }[] = [
  {
    name: '01-next-tailwind-siblings-npm',
    config: {
      v: 1, name: 'demo', layout: 'siblings', pm: 'npm',
      apps: [{ id: 'web', base: 'next', layers: ['tailwind'], options: {} }],
      layers: [],
    },
  },
  {
    name: '02-next-prisma-postgres-docker-pnpm',
    config: {
      v: 1, name: 'demo', layout: 'siblings', pm: 'pnpm',
      apps: [{ id: 'web', base: 'next', layers: ['tailwind', 'prisma'], options: { db: 'postgres' } }],
      layers: ['docker'],
    },
  },
  {
    name: '09-next-minimal-npm',
    config: {
      v: 1, name: 'demo', layout: 'siblings', pm: 'npm',
      apps: [{ id: 'web', base: 'next', layers: [], options: {} }],
      layers: [],
    },
  },
]
```

- [ ] **Step 3: Write the snapshot test**

Create `tests/snapshots/snapshot.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { generate } from '@/generator/pipeline'
import { manifestOf } from './manifest'
import { CANONICAL_CONFIGS } from './configs'

describe('canonical config snapshots', () => {
  for (const { name, config } of CANONICAL_CONFIGS) {
    it(`matches the recorded manifest for ${name}`, async () => {
      expect(manifestOf(await generate(config))).toMatchSnapshot()
    })
  }

  it('produces a different manifest for the same project under a different package manager', async () => {
    const base = CANONICAL_CONFIGS[0].config
    const asNpm = manifestOf(await generate(base))
    const asPnpm = manifestOf(await generate({ ...base, pm: 'pnpm' }))
    expect(asNpm).not.toBe(asPnpm)
  })

  it('produces a different manifest when a layer is added', async () => {
    const [minimal, withTailwind] = await Promise.all([
      generate(CANONICAL_CONFIGS[2].config).then(manifestOf),
      generate(CANONICAL_CONFIGS[0].config).then(manifestOf),
    ])
    expect(minimal).not.toBe(withTailwind)
  })
})
```

- [ ] **Step 4: Record the snapshots**

Run: `npm test -- tests/snapshots`
Expected: PASS — 5 tests, with `tests/snapshots/__snapshots__/snapshot.test.ts.snap` newly written

- [ ] **Step 5: Read the recorded snapshot before trusting it**

```bash
cat tests/snapshots/__snapshots__/snapshot.test.ts.snap
```

Confirm by eye that `02-next-prisma-postgres-docker-pnpm` lists `Dockerfile`, `docker-compose.yml`, `prisma/schema.prisma`, and `.env`. A snapshot recorded without reading it is worthless.

- [ ] **Step 6: Verify the snapshot actually fails on a real regression**

Temporarily change `GLOBALS_CSS` in `src/generator/layers/tailwind.ts` to `@import "tailwind";` and run `npm test -- tests/snapshots`.
Expected: FAIL on configs 01 and 02, with unchanged hashes for 09.
Revert the change and confirm the tests pass again.

- [ ] **Step 7: Commit**

```bash
git add tests/snapshots
git commit -m "test: add tier 2 snapshot harness over canonical configs"
```

---

### Task 17: Tier 3 — smoke matrix and CI

**Files:**
- Create: `tests/smoke/smoke.test.ts`, `.github/workflows/ci.yml`, `.github/workflows/smoke.yml`
- Modify: `vitest.config.ts` (exclude smoke from the default run)

**Interfaces:**
- Consumes: `generate` (Task 14), `CANONICAL_CONFIGS` (Task 16)
- Produces: `npm run smoke`; two CI workflows

This is the tier that proves generated projects actually work. It writes real files to a temp directory, installs, builds, and lints them. It is slow by nature, so it runs nightly rather than on every push.

- [ ] **Step 1: Exclude smoke from the default test run**

In `vitest.config.ts`, change the `include` line to:

```ts
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/smoke/**'],
```

- [ ] **Step 2: Write the smoke test**

Create `tests/smoke/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { generate } from '@/generator/pipeline'
import { getPackageManager } from '@/generator/pm'
import { CANONICAL_CONFIGS } from '../snapshots/configs'

function run(cmd: string, args: string[], cwd: string): void {
  execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 600_000 })
}

describe('smoke matrix', () => {
  for (const { name, config } of CANONICAL_CONFIGS) {
    it(
      `generates a project that installs and builds: ${name}`,
      async () => {
        const dir = mkdtempSync(path.join(tmpdir(), `protos-${name}-`))
        try {
          for (const deliverable of await generate(config)) {
            for (const [file, content] of deliverable.files) {
              const full = path.join(dir, deliverable.name, file)
              mkdirSync(path.dirname(full), { recursive: true })
              writeFileSync(full, content)
            }
          }

          // Generated projects use sibling folders; build each app in place
          // with whichever package manager the config selected.
          const appDir = path.join(dir, config.name, `${config.name}-${config.apps[0].id}`)
          const pm = getPackageManager(config.pm)
          const [installCmd, ...installArgs] = pm.install().split(' ')
          run(installCmd, installArgs, appDir)
          const [buildCmd, ...buildArgs] = pm.runScript('build').split(' ')
          run(buildCmd, buildArgs, appDir)
          expect(true).toBe(true)
        } finally {
          rmSync(dir, { recursive: true, force: true })
        }
      },
      900_000
    )
  }
})
```

- [ ] **Step 3: Run the smoke suite locally**

Run: `npm run smoke`
Expected: PASS for all 3 configs. This takes several minutes — each config runs a real install and `next build`. Config 02 installs with pnpm, so make sure pnpm is available locally (`corepack enable`).

If a build fails, that is the point of this tier: fix the base or layer that produced broken output before continuing.

- [ ] **Step 4: Write the fast CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: lts/*
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
```

- [ ] **Step 5: Write the nightly smoke workflow**

Create `.github/workflows/smoke.yml`:

```yaml
name: Smoke

on:
  schedule:
    - cron: '0 3 * * *'
  workflow_dispatch:

jobs:
  smoke:
    runs-on: ubuntu-latest
    timeout-minutes: 45
    steps:
      - uses: actions/checkout@v4
      # protos itself uses npm; pnpm is installed as a tool because some
      # generated projects in the matrix build with it.
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: lts/*
          cache: npm
      - run: npm ci
      - run: npm run smoke
```

`workflow_dispatch` matters — after bumping anything in `versions.ts` you want to run this on demand rather than waiting for 3am.

- [ ] **Step 6: Verify the full suite one final time**

```bash
npm test && npm run build
```

Expected: all tests pass and the app builds.

- [ ] **Step 7: Commit**

```bash
git add tests/smoke .github vitest.config.ts
git commit -m "test: add tier 3 smoke matrix and CI workflows"
```

---

## Definition of done for Plan 1

- [ ] `npm test` passes — tiers 1 and 2
- [ ] `npm run smoke` passes — tier 3, all 3 configs install and build
- [ ] `npm run build` succeeds
- [ ] `GET /api/generate?c=<config>` returns a ZIP whose contents unzip, `npm install`, and `npm run build` cleanly
- [ ] The architecture test confirms `src/generator/` imports nothing from `next`
- [ ] No database, no persistence, and no shelling out anywhere in `src/generator/`

## What Plans 2 and 3 inherit

Plan 1 deliberately leaves these interfaces implemented once each so Plan 2 is repetition against a proven shape:

| Interface | Plan 1 proves it with | Plan 2 adds |
|---|---|---|
| `Base` | `next` | `vite-react`, `express`, `expo` |
| `Layer` | `tailwind`, `prisma` | 12 more |
| `RootLayer` | `docker` | `gh-actions` |
| `Assembler` | `siblings` | `separate`, `monorepo` |
| `PackageManagerStrategy` | `npm`, `pnpm` | consumed by the monorepo assembler |
| Sink | `zip` | `tar`, `github` (v2) |

Plan 3 consumes the `manifest` field already present on every layer to render the live preview without shipping templates to the browser.
