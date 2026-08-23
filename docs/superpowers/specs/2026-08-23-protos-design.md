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
contribute files and structured edits. ~4 bases and ~14 layers express
thousands of valid projects. Whole-template approaches multiply with every new
option and cannot be maintained.

### 3.4 No code execution during generation

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

type AppSpec = {
  id: string                        // 'api' | 'web' | 'mobile'
  base: BaseId
  layers: LayerId[]
  options: Record<string, string>   // e.g. { db: 'postgres' }
}

type ProtosConfig = {
  v: 1                              // schema version, for forward compat
  name: string                      // ^[a-z0-9][a-z0-9-]{0,38}$
  layout: LayoutId
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
  apply(tree: FileTree, ctx: Ctx): void
}

interface Ctx {
  app: AppSpec
  project: { name: string; layout: LayoutId }
  docker: DockerStrategy             // supplied by the Assembler
  ci: CiStrategy                     // supplied by the Assembler
  sibling?: AppSpec                  // the other app, if any
}
```

Layers receive layout-dependent behaviour through `ctx.docker` and `ctx.ci`
rather than branching on `ctx.project.layout` themselves. Nothing else in a
layer is layout-aware.

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
| Root files | README, `docker-compose.yml`, `.gitignore` | none | + `pnpm-workspace.yaml`, `turbo.json`, root `package.json` |
| Package names | plain | plain | scoped `@hrims/api` |
| devDeps | per app | per app | hoisted to root |
| Shared types | none | none | `packages/types`, `workspace:*` |
| Dockerfile | plain multi-stage | plain multi-stage | `turbo prune` multi-stage |
| CI | per-app jobs | per-app jobs | single install + turbo cache |

**Deliberate simplification:** Prisma stays inside the app that owns it
(`apps/api/prisma`) in all three layouts, never hoisted to `packages/db`. This
keeps the `prisma` layer completely layout-agnostic. Revisit only if a real
need for a shared schema appears.

**Monorepo is opinionated:** pnpm workspaces + Turborepo. No npm or yarn
workspace variants — one well-tested path rather than a matrix.

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

Express follows layer-based organization (routes / controllers / services /
models), per the user's stated default. Next.js and Expo follow their
frameworks' own conventions.

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
static `manifest: string[]` of the paths it contributes, so the client renders
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
| Styling | Tailwind | |
| Client state | Zustand | the config *is* client state |
| Server state | none | there is nothing to fetch; TanStack Query would be unused |
| Validation | Zod | one schema shared client and server |
| Compression | `fflate` | deflate for config encoding, zip for the sink |
| Formatting | Prettier, applied to generated output | |
| Tests | Vitest | |
| Hosting | Vercel | |

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

## 13. Sequencing

| Milestone | Scope |
|---|---|
| **v1** | Config schema + encoding, FileTree + models, 4 bases, 14 layers, all 3 assemblers, ZIP sink, live-preview UI, all 3 test tiers |
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
5. protos stores nothing about anyone.
