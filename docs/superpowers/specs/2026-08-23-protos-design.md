# protos — Design Document

**Date:** 2026-08-23
**Status:** Approved for planning
**Author:** Franze Calleja (with Claude)

## 1. What protos is

A web app where a developer configures a new project — language, framework,
architecture, folder structure, data layer, containerization, quality tooling —
and receives a working, idiomatic scaffold.

The scaffold is not a starting point that needs fixing. It installs, builds,
lints, and passes its own tests on the first try.

### The gap it fills

`create-next-app` scaffolds one framework with no opinions about what goes
around it. Hand-maintained boilerplate repos rot and cover one combination
each. protos sits between them: composable, current, and able to express
thousands of valid combinations from a small set of maintained parts.

## 2. Non-goals

- **Not a project manager.** No dashboards, no tracking generated projects.
- **Not a code generator for features.** It scaffolds a project once; it does
  not add CRUD modules later.
- **Not a hosting platform.** It hands over files; deployment is the user's.
- **Not exhaustive.** v1 covers the TypeScript/JavaScript ecosystem deeply
  rather than every language shallowly.

## 3. Key decisions

### 3.1 No database

protos v1 ships with **no database of any kind**, and this is a design
commitment rather than a temporary shortcut.

Every reason a tool like this normally reaches for persistence has a better
answer here:

| Would normally need a DB | protos does instead |
|---|---|
| Share a config with a teammate | Config is encoded in the URL |
| Save favorite setups | `localStorage`, plus exportable `protos.json` |
| Feed a config to a CLI | Same encoded string as a CLI argument |
| Usage statistics | Hosted analytics (Plausible/PostHog), never our own store |
| GitHub sign-in (v2) | Encrypted `httpOnly` session cookie, token never at rest |

The generator is a **pure function of its config**. Given the same input it
produces the same file tree, so there is nothing to persist between requests.

This is also a security posture: protos holds no user data, so it is not worth
breaching. When GitHub push arrives in v2, holding tokens only in a short-lived
encrypted cookie keeps that true.

### 3.2 The config lives in the URL

The full selection serializes to a compact string that becomes the share link,
the CLI argument, and the server's input. One representation, four consumers.

### 3.3 Composable layers, not whole templates

A small base template per framework, plus independent layers that each
contribute files and structured edits. ~4 bases and ~15 layers express
thousands of valid projects. Whole-template approaches multiply with every new
option and cannot be maintained.

### 3.4 Package manager is a strategy, not a layer

Layers are additive — they contribute files. The package manager adds nothing;
it changes how artifacts that already exist are rendered. That makes it a
strategy, supplied to layers and assemblers the same way `DockerStrategy` is.

It is not cosmetic. npm workspaces declare a local dependency with a plain
semver range and symlink it automatically; the `workspace:*` protocol is
pnpm-only. The workspace declaration differs too — a `workspaces` field in the
root `package.json` versus a separate `pnpm-workspace.yaml`.

| Artifact | npm | pnpm |
|---|---|---|
| README commands | `npm run dev` | `pnpm dev` |
| Docker install | `npm install` | `corepack enable` + `pnpm install` |
| Lockfile | `package-lock.json` | `pnpm-lock.yaml` |
| CI setup | `setup-node` cache: npm | `pnpm/action-setup` + cache: pnpm |
| Monorepo declaration | `workspaces` field | `pnpm-workspace.yaml` |
| Internal dep | `"@app/types": "*"` | `"@app/types": "workspace:*"` |

**Generated projects use plain installs, never frozen ones.** protos cannot
produce a lockfile — that would mean running the package manager, which §3.6
forbids — so a generated `Dockerfile` or CI job using `npm ci` or
`pnpm install --frozen-lockfile` would fail on its first run. The README tells
the user to commit a lockfile after their first install. Reproducibility is
theirs to opt into; a scaffold that cannot build is not.

v1 supports npm (default) and pnpm. yarn and bun are deliberately excluded:
yarn's classic/berry split is two strategies wearing one name, and bun moves
fast enough that generated projects would rot between smoke runs. Both are
drop-in strategy files if that changes.

### 3.5 Architecture is a strategy of path roles

protos was pitched (§1) as configuring folder structure, so architecture is
selectable rather than fixed per base. The obstacle is that a layer writing
`src/lib/db.ts` has hardcoded someone's folder convention.

So **layers name roles, not paths**. `db-client`, `component`, `service`,
`controller` — the architecture resolves each to a location:

| Role | express/layered | express/modular | react/type-based | react/feature-based |
|---|---|---|---|---|
| `db-client` | `src/lib/db.ts` | `src/shared/db.ts` | `src/lib/db.ts` | `src/lib/db.ts` |
| `component` | — | — | `src/components/X.tsx` | `src/features/x/X.tsx` |
| `store` | — | — | `src/store/x.ts` | `src/features/x/store.ts` |
| `route` | `src/routes/x.route.ts` | `src/modules/x/x.route.ts` | — | — |
| `controller` | `src/controllers/x.controller.ts` | `src/modules/x/x.controller.ts` | — | — |
| `service` | `src/services/x.service.ts` | `src/modules/x/x.service.ts` | — | — |

An architecture throws on a role it has no home for, rather than inventing a
path. Shared infrastructure stays in `src/lib` under both React-family
architectures: feature-based organisation applies to feature code, and burying
the database client inside one feature would make it harder to find, not
easier. The modular Express architecture is the exception — it groups shared
code under `src/shared`, which is that ecosystem's convention, and the role
table above is authoritative.

**How much choice exists depends on the framework.** Next.js and Expo impose
file-based routing, so their only real axis is how non-route code is organised
— offering "MVC" there would be a lie. Express imposes nothing, which is where
the choice genuinely matters.

| Base | v1 architectures | Default |
|---|---|---|
| `next`, `vite-react`, `expo` | `type-based`, `feature-based` | `type-based` |
| `express` | `layered`, `modular` | `layered` |

Invalid pairings are rejected by the schema, not silently coerced.

**Every architecture must generate a working vertical slice.** Emitting
`src/domain/`, `src/application/`, and `src/infrastructure/` with nothing in
them is cargo cult, not architecture. Each option ships a path that actually
runs — for the React family, a page importing a component through the chosen
location; for Express in Plan 2, a route through controller and service with a
passing test.

### 3.6 No code execution during generation

protos never shells out, never runs `create-next-app`, never executes user
input. Generation is pure in-memory data transformation. This rules out an
entire class of sandbox-escape and resource-exhaustion problems and keeps
generation fast (target: under 300ms).

## 4. Config schema

The single source of truth, shared by client and server as a Zod schema.

```ts
type BaseId   = 'next' | 'vite-react' | 'express' | 'expo'
type LayerId  = 'tailwind' | 'tanstack-query' | 'zustand' | 'zod'
              | 'react-hook-form' | 'tanstack-table' | 'prisma'
              | 'pino' | 'helmet' | 'rate-limit'
              | 'eslint-prettier' | 'vitest' | 'docker' | 'gh-actions'
type LayoutId = 'siblings' | 'separate' | 'monorepo'
type PmId     = 'npm' | 'pnpm'
type ArchId   = 'type-based' | 'feature-based' | 'layered' | 'modular'

type AppSpec = {
  id: string                        // 'api' | 'web' | 'mobile'
  base: BaseId
  arch: ArchId                      // defaults per base; validated against it
  layers: LayerId[]
  options: Record<string, string>   // e.g. { db: 'postgres' }
}

type ProtosConfig = {
  v: 1                              // schema version, for forward compat
  name: string                      // ^[a-z0-9][a-z0-9-]{0,38}$
  layout: LayoutId
  pm: PmId                          // default 'npm'
  apps: AppSpec[]                   // 1–2 apps
  layers: LayerId[]                 // root-level: docker, gh-actions
}
```

### Encoding

`JSON.stringify` → `fflate.deflateSync` → base64url. A typical config lands
around 150 characters, comfortable in a URL.

Decoding is **untrusted input**. The server always re-parses with Zod and
rejects unknown ids, over-long names, and configs exceeding the caps in §10.

### Versioning

The `v` field exists so old share links keep working. If the schema changes,
a migration function upgrades `v: 1` configs to the current shape before
validation. Links must not break.

## 5. Generator engine

### 5.1 FileTree

An in-memory representation of a single app, always rooted at `/`. Layers never
know where the app will finally sit on disk.

```ts
interface FileTree {
  write(path: string, content: string): void
  exists(path: string): boolean

  // structured models — see 5.2
  pkg: PackageModel
  env: EnvModel
  readme: ReadmeModel
  providers: ProviderModel
  middleware: MiddlewareModel
  ignore: IgnoreModel
}
```

### 5.2 Structured models — the rule that makes composition safe

**A layer may never string-patch a file another layer wrote.**

Files that more than one layer needs to touch are not files during generation.
They are structured models that get **rendered once, at the end**, after every
layer has run.

| Model | Layers call | Renders to |
|---|---|---|
| `pkg` | `addDep`, `addDevDep`, `addScript` | `package.json` |
| `env` | `set(key, value, comment)` | `.env`, `.env.example` |
| `readme` | `section(title, markdown)` | `README.md` |
| `providers` | `push({ import, component, props })` | `app/layout.tsx` |
| `middleware` | `push({ import, expr, order })` | `src/server.ts` |
| `ignore` | `add(pattern)` | `.gitignore`, `.dockerignore` |
| `sideEffects` | `add(path)` | side-effect imports in the layout |

`sideEffects` was added during implementation: the `tailwind` layer wrote
`globals.css` but nothing imported it, so the stylesheet was dead code and
Tailwind silently never applied — a bug an install-and-build smoke test passes
straight through. A layer cannot patch the base's `layout.tsx`, so the layer
registers the file and the base decides where the import statement goes.

This is why `tanstack-query` and a theme provider can both wrap the root layout
without either knowing the other exists, and why layer execution order does not
change the output. Ordering bugs — the classic generator failure — become
structurally impossible rather than something caught in review.

`providers` renders as a nested stack, outermost first, sorted by a declared
`order` value so the result is deterministic regardless of layer order.

### 5.3 Layer contract

```ts
interface Layer {
  id: LayerId
  label: string
  description: string
  appliesTo: BaseId[]
  requires?: LayerId[]
  conflictsWith?: LayerId[]
  options?: LayerOptionSchema        // e.g. prisma: db = postgres | mysql
  /** Paths contributed under a given architecture, for the UI preview. */
  manifest(arch: ArchitectureStrategy): string[]
  apply(tree: FileTree, ctx: Ctx): void
}

interface Ctx {
  app: AppSpec
  project: { name: string; layout: LayoutId }
  pm: PackageManagerStrategy         // derived from cfg.pm
  arch: ArchitectureStrategy         // derived from the app's arch
  sibling?: AppSpec                  // the other app, if any
}
```

Layers never receive `DockerStrategy` or `CiStrategy` — those belong to root
layers (below), which is what keeps per-app layers layout-agnostic by
construction rather than by convention. They do receive `ctx.pm`, because a
layer that documents a command in the README needs to name the right one.

#### Root-level layers

`docker` and `gh-actions` are not per-app layers — they contribute files to
individual apps *and* to the project root, so they need a second signature that
runs after every app is built and after the assembler has decided placement:

```ts
interface RootLayer {
  id: LayerId
  label: string
  requiresServerApp?: boolean
  applyRoot(project: ProjectTree, ctx: RootCtx): void
}

interface ProjectTree {
  root: FileTree                         // project-root files
  apps: { spec: AppSpec; tree: FileTree; path: string }[]
}
```

`docker` uses this to write one `Dockerfile` into each app tree (via
`ctx.docker`, whose strategy the assembler supplies) and a single
`docker-compose.yml` at the root wiring the apps and any database together.
`gh-actions` writes one workflow at the root shaped by `ctx.ci`.

Root layers always run after per-app layers, so they can inspect what the apps
ended up containing — for example, adding a Postgres service to compose only
because some app's `env` model declared a `DATABASE_URL`.

### 5.4 Assembler contract

The Assembler owns everything about how apps combine into a deliverable.

```ts
interface Assembler {
  id: LayoutId
  assemble(apps: BuiltApp[], cfg: ProtosConfig): Deliverable[]
  dockerStrategy(): DockerStrategy
  ciStrategy(): CiStrategy
}

type Deliverable = { name: string; tree: Map<string, string> }
```

| | `siblings` | `separate` | `monorepo` |
|---|---|---|---|
| Placement | `hrims-backend/` | own deliverable each | `apps/api/` |
| Deliverables | 1 | N | 1 |
| Root files | README, `docker-compose.yml`, `.gitignore` | none | + workspace declaration, `turbo.json`, root `package.json` |
| Package names | plain | plain | scoped `@hrims/api` |
| devDeps | per app | per app | hoisted to root |
| Shared types | none | none | `packages/types`, via `pm.internalDep()` |
| Dockerfile | plain multi-stage | plain multi-stage | `turbo prune` multi-stage |
| CI | per-app jobs | per-app jobs | single install + turbo cache |

**Deliberate simplification:** Prisma stays inside the app that owns it
(`apps/api/prisma`) in all three layouts, never hoisted to `packages/db`. This
keeps the `prisma` layer completely layout-agnostic. Revisit only if a real
need for a shared schema appears.

**Monorepo uses Turborepo** over whichever package manager's workspaces the
config selected. Turborepo is package-manager agnostic; the workspace
declaration and internal dependency protocol come from
`PackageManagerStrategy` (§3.4), so the assembler never branches on the
package manager itself.

**`packages/types`** is emitted by the monorepo assembler only when a project
contains both a backend and a frontend. It holds shared request/response types
so an API change surfaces as a type error rather than a runtime surprise.

## 6. Pipeline

```
encoded config string
  → decode (base64url → inflate → JSON)
  → Zod parse + caps check                    [reject on failure]
  → resolve layers (toposort by `requires`, reject `conflictsWith`)
  → for each app:  load base template
                   run layers in resolved order
                   render structured models
  → assembler.assemble(apps, cfg)             [placement + root files]
  → prettier format (ts, tsx, js, json, md)
  → sink
```

Pure and deterministic end to end. The same config always yields byte-identical
output, which is what makes snapshot testing meaningful.

## 7. Sinks

One generator, four outputs. Each sink is a thin adapter over the same
`Deliverable[]`.

| Sink | Endpoint | Ships in |
|---|---|---|
| ZIP download | `GET /api/generate?c=<config>` | v1 |
| Tar stream | `GET /g/<config>` → `curl … \| tar xz` | v1.5 |
| npm CLI | `npx create-protos <config>` — thin client of `/g/` | v1.5 |
| GitHub push | `POST /api/github/create` | v2 |

The CLI does not bundle the engine. It fetches a tarball and extracts it, so it
stays around 100 lines and can never drift from the web app's output.

When `layout: 'separate'` produces multiple deliverables, the ZIP sink returns
a single archive containing each project as a top-level folder, with no root
files tying them together.

## 8. Catalog (v1)

### Bases

| Base | Notes |
|---|---|
| `next` | App Router, TypeScript, src dir |
| `vite-react` | React + TypeScript |
| `express` | TypeScript, layered routes/controllers/services |
| `expo` | Expo Router, TypeScript |

### Layers

| Layer | Applies to | Options | Notes |
|---|---|---|---|
| `tailwind` | next, vite-react | — | |
| `tanstack-query` | next, vite-react, expo | — | adds a provider |
| `zustand` | next, vite-react, expo | — | example store |
| `zod` | all | — | |
| `react-hook-form` | next, vite-react, expo | — | requires `zod` |
| `tanstack-table` | next, vite-react | — | example data table |
| `prisma` | next, express | `db: postgres \| mysql` | schema, client singleton, env |
| `pino` | express, next | — | |
| `helmet` | express | — | middleware |
| `rate-limit` | express | — | middleware |
| `eslint-prettier` | all | — | |
| `vitest` | next, vite-react, express | — | one real passing test |
| `jest-expo` | expo | — | Expo's idiomatic runner; vitest is not used here |
| `docker` | root-level | — | Dockerfile per app + compose |
| `gh-actions` | root-level | — | install, lint, test, build |

Architecture is selected per app, not fixed per base — see §3.5 for the role
table and the valid pairings. Express defaults to layer-based organization
(routes / controllers / services / models), per the user's stated default;
the React-family bases default to type-based.

### Compatibility rules

Encoded in `appliesTo`, `requires`, and `conflictsWith` — declared once on each
layer, enforced in two places:

- **Client:** unavailable options are disabled with a reason on hover, so an
  invalid config cannot be assembled in the first place.
- **Server:** re-validated on every request, because a URL is user input.

Notable rules:
- `prisma` never applies to `expo` or `vite-react` (no direct DB access from a client).
- `react-hook-form` requires `zod`.
- `docker` requires at least one app with a server (`next` or `express`).
- `packages/types` requires `layout: 'monorepo'` and exactly two apps.

## 9. Web UI

**Single page, two columns.** Not a multi-step wizard — the whole point is
seeing how choices interact.

- **Left:** grouped controls — Project (name, layout) → Apps → Data → Quality → Deploy
- **Right:** a **live file tree** of what will be generated, plus the exact
  commands the user will run afterward

Toggling Docker makes `Dockerfile` and `docker-compose.yml` appear in the tree
immediately. Switching layout from siblings to monorepo visibly restructures
it. That live preview is the product's differentiator and the reason the
generator must be fast and pure.

The URL rewrites on every change (`history.replaceState`), so sharing is
copying the address bar.

**The preview computes paths only, never file contents.** Each layer declares a
a `manifest(arch)` of the paths it contributes, so the client renders
the tree from catalog metadata alone — no base templates are shipped to the
browser and no generation runs client-side. The server remains the single
authority for actual file contents. This keeps the bundle small and means the
preview cannot drift from reality in any way that matters, since a layer's
declared manifest is asserted against its real output in the tier 1 tests.

## 10. Security

The layers approach removes the largest risk by construction: **no user code
executes and nothing is shelled out.** Remaining measures:

- **Path traversal:** project name matched against `^[a-z0-9][a-z0-9-]{0,38}$`;
  all generated paths are composed from a fixed catalog, never from user strings.
- **Caps:** max 2 apps, max 25 layers, max 4KB encoded config. Requests
  exceeding these are rejected before any work happens.
- **Unknown ids rejected** rather than ignored, so a malformed link fails loudly.
- **Rate limiting** on `/api/generate` and `/g/`.
- **No secrets generated.** `.env.example` carries placeholders; `.env` gets
  local-only development values (e.g. a local Postgres URL) and is always
  gitignored.
- **GitHub (v2):** Auth.js JWT session strategy, no DB adapter. Token lives in
  an encrypted `httpOnly`, `sameSite=lax` cookie with a 1-hour TTL, requests
  the narrowest scope that works, and is never written to disk or logs.

## 11. Testing

A generator's tests are the only thing standing between it and silent rot.
Three tiers:

### Tier 1 — Unit (per layer, fast)
Each layer applied to a fixture tree; assert its files, deps, env keys, and
provider entries. Runs on every save.

### Tier 2 — Snapshot (cross-layer, fast)
~12 canonical configs generate a manifest of paths plus content hashes,
committed to the repo. Catches accidental cross-layer breakage — the failure
mode unit tests miss. Reviewing a snapshot diff is how a layer change gets
approved.

### Tier 3 — Smoke matrix (nightly CI, slow, the one that matters)
Roughly 10 representative configs are generated for real, then
`install → lint → build → test` is run against each in GitHub Actions:

1. `next` + tailwind + tanstack-query + zustand — siblings
2. `next` + prisma/postgres + docker — siblings
3. `express` + prisma/mysql + pino + helmet + rate-limit — siblings
4. `express` + `next` pair — **siblings**, docker, gh-actions
5. `express` + `next` pair — **monorepo**, docker, gh-actions, packages/types
6. `express` + `next` pair — **separate**
7. `vite-react` + tailwind + tanstack-query + tanstack-table
8. `expo` + zustand + tanstack-query
9. `next` minimal (base only, no layers)
10. maximal config — every compatible layer on a two-app monorepo

Architecture is a fifth axis and package manager a fourth. Both are covered by
swapping rather than multiplying: one config runs feature-based architecture
and the rest type-based.

Package manager swaps the same way:
configs 2 and 5 run **pnpm**, the rest run npm. Config 5 matters most — it is
the only one exercising `workspace:*` and `pnpm-workspace.yaml` together.

Layout is the third axis, and configs 4–6 exist specifically to cover it. This
is a curated set, not a cross-product; a full matrix would be unusable.

Tier 3 is what catches "Next 16 shipped and our base template no longer
builds." Without it protos becomes exactly the rotting boilerplate repo it
exists to replace.

## 12. protos' own stack

Detected from nothing — this is a greenfield repo, so defaults apply.

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router, TypeScript) | UI plus the streaming generate endpoints in one deploy |
| Runtime | Node LTS | per dependency policy |
| Package manager | npm | protos is a single app with no workspaces; nothing here needs pnpm |
| Styling | Tailwind | |
| Client state | Zustand | the config *is* client state |
| Server state | none | there is nothing to fetch; TanStack Query would be unused |
| Validation | Zod | one schema shared client and server |
| Compression | `fflate` | deflate for config encoding, zip for the sink |
| Formatting | Prettier, applied to generated output | |
| Tests | Vitest | |
| Hosting | Vercel | |

protos using npm is independent of what it generates. CI installs pnpm as a
tool so the smoke tier can build generated pnpm projects.

Exact versions are resolved at implementation time against current docs
(latest stable for libraries, LTS for the runtime), not pinned here.

### Repository layout

```
protos/
  src/
    app/                     # Next.js routes + API handlers
    components/              # UI
    generator/               # the engine — zero Next imports
      config/                # schema, encode/decode, migrations
      tree/                  # FileTree + structured models
      bases/                 # one folder per base template
      layers/                # one file per layer
      assemblers/            # siblings | separate | monorepo
      sinks/                 # zip | tar | github
    store/                   # Zustand
  tests/
    layers/                  # tier 1
    snapshots/               # tier 2
  .github/workflows/         # ci.yml, smoke.yml (nightly)
  docs/superpowers/specs/
```

`src/generator/` importing nothing from Next is a hard rule. It keeps the
engine testable in isolation and leaves the door open to extracting it as a
package if a future CLI ever needs to run offline.

## 12a. Verified version realities

Implementation checked every version against the registry and current docs
rather than trusting training data. Four findings changed the design:

| Package | Decision | Why |
|---|---|---|
| Next.js | `^16.3.2` | Latest stable major; mature well past x.1 |
| TypeScript | `^5.9.3` for generated projects | 6.0 and 7.0 are both live but still at x.0. The dependency policy avoids day-one majors, and create-next-app itself still installs ^5 |
| `@types/node` | `^24` | Tracks Node **LTS**, not Current (26) |
| Prisma | `^7.9.1`, with driver adapters | See below |
| Zod | `^4` | `.superRefine()` must precede `.transform()`; refinements live inside schemas in v4 |

**Prisma 7 differs from 6 in four ways that all matter to a generator:**

1. The generator is `prisma-client`, not the removed `prisma-client-js`.
2. It needs an explicit `output`, and the client is imported from that path
   rather than from `@prisma/client`.
3. A driver adapter is **required** — `@prisma/adapter-pg` for Postgres,
   `@prisma/adapter-mariadb` for MySQL.
4. `url` is no longer permitted in the `datasource` block; it moves to
   `prisma.config.ts`. The CLI also no longer auto-loads `.env`, so that file
   needs an explicit `dotenv` import.

Any one of these produces a project that installs but cannot build. They were
caught by tier 3, not by tiers 1 or 2 — which is the argument for tier 3 in
miniature.

**The generated `tsconfig.json` mirrors create-next-app's output exactly**
(`target: ES2017`, `jsx: react-jsx`, and the `.next/dev/types` include). Any
drift makes Next rewrite the file on first build, which is a poor first
impression from a scaffolding tool.

## 13. Sequencing

| Milestone | Scope |
|---|---|
| **v1** | Config schema + encoding, FileTree + models, 4 bases, 15 layers, all 3 assemblers, ZIP sink, live-preview UI, all 3 test tiers |
| **v1.5** | Tar sink (`curl \| tar xz`) and `npx create-protos` thin client |
| **v2** | GitHub push with OAuth, additional ecosystems (Go, FastAPI, or Laravel), further layers |

v1 is deliberately large in one respect only: all three assemblers ship
together, because monorepo is the only layout that genuinely exercises the
Assembler seam. Building the interface against two near-identical
implementations would risk designing it wrong and paying to redo it.

## 14. Success criteria

1. Every config the UI allows generates a project that installs, lints, builds,
   and passes its own tests — verified by the tier 3 matrix.
2. Generation completes in under 300ms server-side.
3. A share link fully reconstructs someone else's configuration.
4. Adding a new layer touches exactly one file plus its tests.
5. Every architecture produces a project that runs, not a tree of empty folders.
6. protos stores nothing about anyone.
