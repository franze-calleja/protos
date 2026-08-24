# protos Frontend Breadth — Implementation Plan (Plan 4 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the v1 catalog — the `vite-react` and `expo` bases plus the five remaining React layers.

**Architecture:** Pure repetition against interfaces proven in Plans 1–3. No new abstractions are expected; if one becomes necessary, that is a signal worth stopping on. The one seam that finally gets a real consumer is `ProviderModel`: `tanstack-query` is the first *layer* to wrap the app tree, which until now only the Next base has done.

**Tech Stack:** Vite 8, Expo 57 / React Native 0.87, TanStack Query 5, TanStack Table 9, Zustand 5, react-hook-form 7, jest-expo 57.

**Spec:** `docs/superpowers/specs/2026-08-23-protos-design.md`

**Predecessors:** Plans 1–3, all executed and merged (PRs #1, #2). Read their execution-notes headers — particularly the recurring lesson that generalising one library's API to its sibling is where the bugs come from.

## Global Constraints

- **No database, no persistence, no code execution during generation.**
- **`src/generator/` imports nothing from `next`** — enforced by `tests/architecture.test.ts`.
- **Generation is deterministic**; layer order never changes output.
- **Layers never branch on layout.** Branching on `ctx.app.base` is allowed and established (vitest, pino, eslint-prettier all do).
- **Layers name path roles, never paths.**
- **Every generated project must install and build** — proven by tier 3.
- **protos itself uses npm.** Targeted tests run as `npm test -- <path>`.

### Versions resolved for this plan

Confirmed against the registry on 2026-08-24:

```ts
vite: '^8.2.2',
'@vitejs/plugin-react': '^6.1.0',
expo: '^57.0.15',
'expo-router': '^57.0.15',
'react-native': '^0.87.0',
'react-native-web': '^0.21.2',
'@tanstack/react-query': '^5.102.2',
'@tanstack/react-table': '^9.1.2',
zustand: '^5.0.15',
'react-hook-form': '^7.86.0',
'@hookform/resolvers': '^5.9.1',
'jest-expo': '^57.0.4',
jest: '^30.4.2',
'@types/jest': '^30.0.0',
```

## Decisions made in this plan

**Both new bases are `isServer: false`.** A Vite SPA and an Expo app are not Node servers — they produce static bundles. The `docker` root layer already skips non-server apps per app, and `requiresServerApp` already skips the layer entirely when no app is a server, so a Vite-only project correctly gets no Dockerfile and no compose file. Serving a built SPA behind nginx is a deployment concern, not a scaffolding one.

**Expo's build script is `expo export --platform web`.** Expo has no headless native build without EAS, but `expo export` runs Metro and genuinely bundles the app, which is a real check that the generated code compiles and resolves. If it proves impractical in tier 3, fall back to `tsc --noEmit` and **record the weakening in the spec** rather than quietly shipping a build script that proves nothing.

**Expo installs are large.** react-native plus Metro is hundreds of megabytes. Expect the Expo smoke config to dominate matrix runtime.

## File Structure

```
src/generator/
  bases/
    vite-react/{files.ts,index.ts}   # NEW
    expo/{files.ts,index.ts}         # NEW
    index.ts                         # MODIFY
  layers/
    tanstack-query.ts                # NEW — first layer to use ProviderModel
    zustand.ts                       # NEW
    react-hook-form.ts               # NEW
    tanstack-table.ts                # NEW
    jest-expo.ts                     # NEW
    index.ts                         # MODIFY
  versions.ts                        # MODIFY
tests/
  bases/{vite-react,expo}.test.ts    # NEW
  layers/react-layers.test.ts        # NEW
  snapshots/configs.ts               # MODIFY
```

---

### Task 1: The vite-react base

**Files:**
- Create: `src/generator/bases/vite-react/files.ts`, `src/generator/bases/vite-react/index.ts`
- Modify: `src/generator/bases/index.ts`, `src/generator/versions.ts`
- Test: `tests/bases/vite-react.test.ts`

**Interfaces:**
- Produces: `viteReactBase` registered under id `vite-react`

Like the Next base, it renders its entry file from `ProviderModel` so layers can wrap the tree, and emits a vertical slice: `main.tsx` → `App.tsx` → a component at the architecture's path.

- [ ] **Step 1: Write the failing test**

Create `tests/bases/vite-react.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'
import { viteReactBase } from '@/generator/bases/vite-react'
import { getPackageManager } from '@/generator/pm'
import { getArchitecture } from '@/generator/arch'
import type { LayerCtx } from '@/generator/layers/types'
import type { ArchId } from '@/generator/config/types'

const ctx = (arch: ArchId = 'type-based'): LayerCtx => ({
  app: { id: 'web', base: 'vite-react', arch, layers: [], options: {} },
  project: { name: 'hrims', layout: 'siblings' },
  pm: getPackageManager('npm'),
  arch: getArchitecture(arch),
  specifier: (f: string, t: string) => viteReactBase.specifier(f, t),
})

function build(arch: ArchId = 'type-based'): FileTree {
  const tree = new FileTree()
  const c = ctx(arch)
  viteReactBase.init(tree, c)
  viteReactBase.renderComposed(tree, c)
  return tree
}

describe('vite-react base', () => {
  it('emits the files a Vite app needs', () => {
    const paths = build().paths()
    for (const p of ['package.json', 'tsconfig.json', 'vite.config.ts', 'index.html', 'src/main.tsx', 'src/App.tsx']) {
      expect(paths).toContain(p)
    }
  })

  it('is not a server, so docker does not apply to it', () => {
    expect(viteReactBase.isServer).toBe(false)
  })

  it('builds with vite', () => {
    const pkg = JSON.parse(build().read('package.json')!)
    expect(pkg.scripts.build).toContain('vite build')
    expect(pkg.scripts.dev).toBe('vite')
    expect(pkg.devDependencies.vite).toBeDefined()
  })

  it('places the example component by architecture', () => {
    expect(build('type-based').exists('src/components/Hello.tsx')).toBe(true)
    expect(build('feature-based').exists('src/features/hello/Hello.tsx')).toBe(true)
  })

  it('nests providers a layer pushed into main.tsx', () => {
    const tree = new FileTree()
    const c = ctx()
    viteReactBase.init(tree, c)
    tree.providers.push({ component: 'Q', importName: 'Q', importFrom: '@/providers/q', order: 10 })
    viteReactBase.renderComposed(tree, c)
    const main = tree.read('src/main.tsx')!
    expect(main).toContain("import { Q } from '@/providers/q'")
    expect(main).toContain('<Q>')
  })

  it('uses the @ alias, which vite resolves', () => {
    expect(viteReactBase.specifier('src/main.tsx', 'src/components/Hello.tsx')).toBe(
      '@/components/Hello'
    )
    expect(build().read('vite.config.ts')).toContain('alias')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/bases/vite-react.test.ts`
Expected: FAIL — cannot resolve `@/generator/bases/vite-react`

- [ ] **Step 3: Write the template files**

Create `src/generator/bases/vite-react/files.ts`:

```ts
export const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
`

export const VITE_CONFIG = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
})
`

export const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`

export const HELLO_COMPONENT = `export function Hello() {
  return <h1>It works</h1>
}
`
```

- [ ] **Step 4: Write the base**

Create `src/generator/bases/vite-react/index.ts`:

```ts
import { registerBase } from '../registry'
import type { Base } from '../types'
import type { FileTree } from '../../tree/file-tree'
import type { LayerCtx } from '../../layers/types'
import { dep } from '../../versions'
import { TSCONFIG, VITE_CONFIG, INDEX_HTML, HELLO_COMPONENT } from './files'

export const viteReactBase: Base = {
  id: 'vite-react',
  label: 'Vite + React',
  // A static bundle, not a Node server: docker and compose do not apply.
  isServer: false,

  specifier(_from: string, to: string): string {
    return `@/${to.replace(/^src\//, '').replace(/\.(tsx?|jsx?)$/, '')}`
  },

  init(tree: FileTree, ctx: LayerCtx): void {
    tree.write('tsconfig.json', TSCONFIG)
    tree.write('vite.config.ts', VITE_CONFIG)
    tree.write('index.html', INDEX_HTML)

    const componentPath = ctx.arch.path('component', 'Hello')
    tree.write(componentPath, HELLO_COMPONENT)
    tree.write('src/App.tsx', renderApp(ctx.specifier('src/App.tsx', componentPath)))

    tree.pkg.setName(`${ctx.project.name}-${ctx.app.id}`)
    tree.pkg.set('type', 'module')
    tree.pkg.addDep('react', dep('react'))
    tree.pkg.addDep('react-dom', dep('react-dom'))
    tree.pkg.addDevDep('vite', dep('vite'))
    tree.pkg.addDevDep('@vitejs/plugin-react', dep('@vitejs/plugin-react'))
    tree.pkg.addDevDep('typescript', dep('typescript'))
    tree.pkg.addDevDep('@types/react', dep('@types/react'))
    tree.pkg.addDevDep('@types/react-dom', dep('@types/react-dom'))
    tree.pkg.addScript('dev', 'vite')
    tree.pkg.addScript('build', 'tsc --noEmit && vite build')
    tree.pkg.addScript('preview', 'vite preview')
    // vite bundles esbuild, whose install script fetches a platform binary.
    tree.pkg.allowBuildScripts(['esbuild'])

    for (const p of ['node_modules', 'dist', '.env', '*.log', '.DS_Store']) {
      tree.ignore.add(p)
    }

    tree.readme.section(
      'Getting started',
      ['```bash', ctx.pm.install(), ctx.pm.runScript('dev'), '```'].join('\n')
    )
  },

  renderComposed(tree: FileTree, ctx: LayerCtx): void {
    tree.write('src/main.tsx', renderMain(tree))
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

function renderApp(componentSpecifier: string): string {
  return `import { Hello } from '${componentSpecifier}'

export function App() {
  return (
    <main>
      <Hello />
    </main>
  )
}
`
}

function renderMain(tree: FileTree): string {
  const sideEffects = tree.sideEffects
    .list()
    .map((f) => `import '@/${f.replace(/^src\//, '')}'\n`)
    .join('')

  return `${sideEffects}import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
${tree.providers.imports()}import { App } from '@/App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>${tree.providers.wrap('<App />')}</StrictMode>
)
`
}

registerBase(viteReactBase)
```

- [ ] **Step 5: Register and add versions**

`import './vite-react'` in `src/generator/bases/index.ts`; add `vite` and `@vitejs/plugin-react` to `VERSIONS`.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm test -- tests/bases/vite-react.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 7: Commit**

```bash
git add src/generator tests
git commit -m "feat: add vite-react base"
```

---

### Task 2: The expo base

**Files:**
- Create: `src/generator/bases/expo/files.ts`, `src/generator/bases/expo/index.ts`
- Modify: `src/generator/bases/index.ts`, `src/generator/versions.ts`
- Test: `tests/bases/expo.test.ts`

**Interfaces:**
- Produces: `expoBase` registered under id `expo`

Expo Router imposes file-based routing in `app/`, exactly as Next does, so the architecture axis governs only non-route code.

- [ ] **Step 1: Write the failing test**

Create `tests/bases/expo.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'
import { expoBase } from '@/generator/bases/expo'
import { getPackageManager } from '@/generator/pm'
import { getArchitecture } from '@/generator/arch'
import type { LayerCtx } from '@/generator/layers/types'
import type { ArchId } from '@/generator/config/types'

const ctx = (arch: ArchId = 'type-based'): LayerCtx => ({
  app: { id: 'mobile', base: 'expo', arch, layers: [], options: {} },
  project: { name: 'hrims', layout: 'siblings' },
  pm: getPackageManager('npm'),
  arch: getArchitecture(arch),
  specifier: (f: string, t: string) => expoBase.specifier(f, t),
})

function build(arch: ArchId = 'type-based'): FileTree {
  const tree = new FileTree()
  const c = ctx(arch)
  expoBase.init(tree, c)
  expoBase.renderComposed(tree, c)
  return tree
}

describe('expo base', () => {
  it('emits the files an Expo Router app needs', () => {
    const paths = build().paths()
    for (const p of ['package.json', 'tsconfig.json', 'app.json', 'app/_layout.tsx', 'app/index.tsx']) {
      expect(paths).toContain(p)
    }
  })

  it('is not a server', () => {
    expect(expoBase.isServer).toBe(false)
  })

  it('entry point is expo-router', () => {
    const pkg = JSON.parse(build().read('package.json')!)
    expect(pkg.main).toBe('expo-router/entry')
    expect(pkg.dependencies['expo-router']).toBeDefined()
  })

  it('places the example component by architecture, since routing is imposed', () => {
    expect(build('type-based').exists('src/components/Hello.tsx')).toBe(true)
    expect(build('feature-based').exists('src/features/hello/Hello.tsx')).toBe(true)
  })

  it('nests providers a layer pushed into the root layout', () => {
    const tree = new FileTree()
    const c = ctx()
    expoBase.init(tree, c)
    tree.providers.push({ component: 'Q', importName: 'Q', importFrom: '@/providers/q', order: 10 })
    expoBase.renderComposed(tree, c)
    expect(tree.read('app/_layout.tsx')).toContain('<Q>')
  })

  it('enables typed routes and the new architecture', () => {
    const appJson = JSON.parse(build().read('app.json')!)
    expect(appJson.expo.scheme).toBeDefined()
    expect(appJson.expo.newArchEnabled).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/bases/expo.test.ts`
Expected: FAIL — cannot resolve `@/generator/bases/expo`

- [ ] **Step 3: Write the template files**

Create `src/generator/bases/expo/files.ts`:

```ts
export const TSCONFIG = `{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
`

export const HELLO_COMPONENT = `import { Text, View } from 'react-native'

export function Hello() {
  return (
    <View>
      <Text>It works</Text>
    </View>
  )
}
`

export function appJson(name: string): string {
  return `${JSON.stringify(
    {
      expo: {
        name,
        slug: name,
        scheme: name,
        version: '1.0.0',
        orientation: 'portrait',
        userInterfaceStyle: 'automatic',
        newArchEnabled: true,
        web: { bundler: 'metro', output: 'static' },
        plugins: ['expo-router'],
      },
    },
    null,
    2
  )}\n`
}
```

- [ ] **Step 4: Write the base**

Create `src/generator/bases/expo/index.ts`:

```ts
import { registerBase } from '../registry'
import type { Base } from '../types'
import type { FileTree } from '../../tree/file-tree'
import type { LayerCtx } from '../../layers/types'
import { dep } from '../../versions'
import { TSCONFIG, HELLO_COMPONENT, appJson } from './files'

export const expoBase: Base = {
  id: 'expo',
  label: 'Expo',
  isServer: false,

  specifier(_from: string, to: string): string {
    return `@/${to.replace(/^src\//, '').replace(/\.(tsx?|jsx?)$/, '')}`
  },

  init(tree: FileTree, ctx: LayerCtx): void {
    const name = `${ctx.project.name}-${ctx.app.id}`
    tree.write('tsconfig.json', TSCONFIG)
    tree.write('app.json', appJson(name))

    const componentPath = ctx.arch.path('component', 'Hello')
    tree.write(componentPath, HELLO_COMPONENT)
    tree.write('app/index.tsx', renderIndex(ctx.specifier('app/index.tsx', componentPath)))

    tree.pkg.setName(name)
    tree.pkg.set('main', 'expo-router/entry')
    tree.pkg.addDep('expo', dep('expo'))
    tree.pkg.addDep('expo-router', dep('expo-router'))
    tree.pkg.addDep('react', dep('react'))
    tree.pkg.addDep('react-native', dep('react-native'))
    // expo export --platform web needs the web renderer.
    tree.pkg.addDep('react-dom', dep('react-dom'))
    tree.pkg.addDep('react-native-web', dep('react-native-web'))
    tree.pkg.addDevDep('typescript', dep('typescript'))
    tree.pkg.addDevDep('@types/react', dep('@types/react'))
    tree.pkg.addScript('dev', 'expo start')
    tree.pkg.addScript('build', 'expo export --platform web')
    tree.pkg.addScript('android', 'expo start --android')
    tree.pkg.addScript('ios', 'expo start --ios')

    for (const p of ['node_modules', '.expo', 'dist', '.env', '*.log', '.DS_Store']) {
      tree.ignore.add(p)
    }

    tree.readme.section(
      'Getting started',
      ['```bash', ctx.pm.install(), ctx.pm.runScript('dev'), '```'].join('\n')
    )
  },

  renderComposed(tree: FileTree, ctx: LayerCtx): void {
    tree.write('app/_layout.tsx', renderLayout(tree))
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

function renderIndex(componentSpecifier: string): string {
  return `import { Hello } from '${componentSpecifier}'

export default function Index() {
  return <Hello />
}
`
}

function renderLayout(tree: FileTree): string {
  return `import { Stack } from 'expo-router'
${tree.providers.imports()}
export default function RootLayout() {
  return ${tree.providers.wrap('<Stack />')}
}
`
}

registerBase(expoBase)
```

- [ ] **Step 5: Register and add versions**

`import './expo'` in `src/generator/bases/index.ts`; add `expo`, `expo-router`, `react-native`, `react-native-web` to `VERSIONS`.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm test -- tests/bases/expo.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 7: Commit**

```bash
git add src/generator tests
git commit -m "feat: add expo base"
```

---

### Task 3: The tanstack-query layer

**Files:**
- Create: `src/generator/layers/tanstack-query.ts`
- Modify: `src/generator/arch/types.ts`, `src/generator/arch/type-based.ts`, `src/generator/arch/feature-based.ts`, `src/generator/layers/index.ts`, `src/generator/versions.ts`
- Test: `tests/layers/react-layers.test.ts`, `tests/arch/strategy.test.ts`

**Interfaces:**
- Produces: `tanstackQueryLayer`; a new `provider` `PathRole`

**A new path role, deliberately.** This plan said no new abstractions were expected and that needing one is worth stopping on — so here is the reasoning. A global provider is not feature code; it is app-wide infrastructure, exactly like `db-client`. Routing `QueryProvider` through the `component` role would put it at `src/features/query-provider/QueryProvider.tsx` under feature-based architecture, which is wrong for something every feature depends on. The `provider` role resolves to `src/providers/X.tsx` under **both** React architectures, mirroring the decision already made for `db-client`.

This is also the first time a *layer* wraps the app tree; until now only the Next base has pushed to `ProviderModel`.

- [ ] **Step 1: Add the provider role**

In `src/generator/arch/types.ts`, add `'provider'` to the `PathRole` union.

In both `type-based.ts` and `feature-based.ts`, add to `PATHS`:

```ts
  // App-wide infrastructure, not feature code — shared under both architectures.
  provider: (n) => `src/providers/${n}.tsx`,
```

Add to `tests/arch/strategy.test.ts`:

```ts
describe('the provider role', () => {
  it('resolves to a shared providers folder under both React architectures', () => {
    for (const id of ['type-based', 'feature-based'] as const) {
      expect(getArchitecture(id).path('provider', 'QueryProvider'), id).toBe(
        'src/providers/QueryProvider.tsx'
      )
    }
  })

  it('has no meaning for the backend architectures', () => {
    for (const id of ['layered', 'modular'] as const) {
      expect(getArchitecture(id).supports('provider'), id).toBe(false)
    }
  })
})
```

- [ ] **Step 2: Write the failing layer test**

Create `tests/layers/react-layers.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'
import { tanstackQueryLayer } from '@/generator/layers/tanstack-query'
import { getPackageManager } from '@/generator/pm'
import { getArchitecture } from '@/generator/arch'
import { nextBase } from '@/generator/bases/next'
import { viteReactBase } from '@/generator/bases/vite-react'
import type { LayerCtx } from '@/generator/layers/types'
import type { ArchId, BaseId } from '@/generator/config/types'

export const reactCtx = (
  base: BaseId = 'next',
  arch: ArchId = 'type-based'
): LayerCtx => ({
  app: { id: 'web', base, arch, layers: [], options: {} },
  project: { name: 'hrims', layout: 'siblings' },
  pm: getPackageManager('npm'),
  arch: getArchitecture(arch),
  specifier: (f: string, t: string) =>
    base === 'next' ? nextBase.specifier(f, t) : viteReactBase.specifier(f, t),
})

describe('tanstack-query layer', () => {
  it('writes a provider in the shared providers folder, under both architectures', () => {
    for (const arch of ['type-based', 'feature-based'] as const) {
      const tree = new FileTree()
      tanstackQueryLayer.apply(tree, reactCtx('next', arch))
      expect(tree.exists('src/providers/QueryProvider.tsx'), arch).toBe(true)
    }
  })

  it('registers itself with the provider model so the base wraps the tree', () => {
    const tree = new FileTree()
    tanstackQueryLayer.apply(tree, reactCtx())
    expect(tree.providers.isEmpty()).toBe(false)
    expect(tree.providers.wrap('{children}')).toContain('QueryProvider')
  })

  it("marks the provider as a client component for Next, which needs it", () => {
    const tree = new FileTree()
    tanstackQueryLayer.apply(tree, reactCtx('next'))
    expect(tree.read('src/providers/QueryProvider.tsx')!.startsWith("'use client'")).toBe(true)
  })

  it('omits the client directive for Vite, which has no server components', () => {
    const tree = new FileTree()
    tanstackQueryLayer.apply(tree, reactCtx('vite-react'))
    expect(tree.read('src/providers/QueryProvider.tsx')).not.toContain("'use client'")
  })

  it('adds the dependency', () => {
    const tree = new FileTree()
    tanstackQueryLayer.apply(tree, reactCtx())
    expect(JSON.parse(tree.pkg.render()).dependencies['@tanstack/react-query']).toBeDefined()
  })

  it('declares every path it writes in its manifest', () => {
    const c = reactCtx()
    const tree = new FileTree()
    tanstackQueryLayer.apply(tree, c)
    for (const p of tree.paths()) {
      expect(tanstackQueryLayer.manifest(c.arch, c.app.base)).toContain(p)
    }
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- tests/layers/react-layers.test.ts`
Expected: FAIL — cannot resolve `@/generator/layers/tanstack-query`

- [ ] **Step 4: Write the layer**

Create `src/generator/layers/tanstack-query.ts`:

```ts
import { registerLayer } from './registry'
import type { Layer, LayerCtx } from './types'
import type { FileTree } from '../tree/file-tree'
import { dep } from '../versions'

/** Data fetching wraps close to the app; other providers may sit outside it. */
const QUERY_PROVIDER_ORDER = 20

function provider(isNext: boolean): string {
  // Next needs the directive because the provider holds client state.
  const directive = isNext ? "'use client'\n\n" : ''
  return `${directive}import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

export function QueryProvider({ children }: { children: ReactNode }) {
  // Created in state so the client is not shared between requests.
  const [client] = useState(() => new QueryClient())

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
`
}

export const tanstackQueryLayer: Layer = {
  id: 'tanstack-query',
  label: 'TanStack Query',
  description: 'Server state management, wired into the app tree',
  appliesTo: ['next', 'vite-react', 'expo'],
  manifest: (arch) => [arch.path('provider', 'QueryProvider')],

  apply(tree: FileTree, ctx: LayerCtx): void {
    const providerPath = ctx.arch.path('provider', 'QueryProvider')
    tree.write(providerPath, provider(ctx.app.base === 'next'))

    tree.pkg.addDep('@tanstack/react-query', dep('@tanstack/react-query'))

    tree.providers.push({
      component: 'QueryProvider',
      importName: 'QueryProvider',
      // All three React bases alias from src, so the importing file does not
      // affect the result. Passing the provider's own path keeps that honest
      // rather than naming a layout file this layer knows nothing about.
      importFrom: ctx.specifier(providerPath, providerPath),
      order: QUERY_PROVIDER_ORDER,
    })
  },
}

registerLayer(tanstackQueryLayer)
```

- [ ] **Step 5: Register, add version, verify**

`import './tanstack-query'` in `src/generator/layers/index.ts`; add `@tanstack/react-query` to `VERSIONS`.

Run: `npx tsc --noEmit && npm test -- tests/layers/react-layers.test.ts tests/arch`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/generator tests
git commit -m "feat: add tanstack-query layer and the provider path role"
```

---

### Task 4: The zustand and react-hook-form layers

**Files:**
- Create: `src/generator/layers/zustand.ts`, `src/generator/layers/react-hook-form.ts`
- Modify: `src/generator/layers/index.ts`, `src/generator/versions.ts`
- Test: `tests/layers/react-layers.test.ts`

**Interfaces:**
- Produces: `zustandLayer`, `reactHookFormLayer`

`react-hook-form` declares `requires: ['zod']` — the resolver has enforced that since Plan 1, and this is its first real use.

- [ ] **Step 1: Write the failing tests**

Append to `tests/layers/react-layers.test.ts`:

```ts
import { zustandLayer } from '@/generator/layers/zustand'
import { reactHookFormLayer } from '@/generator/layers/react-hook-form'
import { resolveLayers } from '@/generator/layers/resolve'
import '@/generator/layers/index'

describe('zustand layer', () => {
  it('writes a store at the architecture store path', () => {
    const tree = new FileTree()
    zustandLayer.apply(tree, reactCtx('next', 'type-based'))
    expect(tree.exists('src/store/useCounter.ts')).toBe(true)
  })

  it('follows feature-based architecture', () => {
    const tree = new FileTree()
    zustandLayer.apply(tree, reactCtx('next', 'feature-based'))
    expect(tree.exists('src/features/use-counter/store.ts')).toBe(true)
  })

  it('adds the dependency', () => {
    const tree = new FileTree()
    zustandLayer.apply(tree, reactCtx())
    expect(JSON.parse(tree.pkg.render()).dependencies.zustand).toBeDefined()
  })
})

describe('react-hook-form layer', () => {
  it('requires zod, because the resolver wires them together', () => {
    expect(reactHookFormLayer.requires).toContain('zod')
    expect(() =>
      resolveLayers({ ...reactCtx().app, layers: ['react-hook-form'] })
    ).toThrow(/requires "zod"/)
  })

  it('resolves when zod is present', () => {
    const ids = resolveLayers({
      ...reactCtx().app,
      layers: ['react-hook-form', 'zod'],
    }).map((l) => l.id)
    expect(ids.indexOf('zod')).toBeLessThan(ids.indexOf('react-hook-form'))
  })

  it('writes an example form validated by a zod schema', () => {
    const tree = new FileTree()
    reactHookFormLayer.apply(tree, reactCtx())
    const form = tree.read('src/components/ExampleForm.tsx')!
    expect(form).toContain('zodResolver')
    expect(form).toContain('useForm')
  })

  it('adds both the form library and its zod resolver', () => {
    const tree = new FileTree()
    reactHookFormLayer.apply(tree, reactCtx())
    const deps = JSON.parse(tree.pkg.render()).dependencies
    expect(deps['react-hook-form']).toBeDefined()
    expect(deps['@hookform/resolvers']).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/layers/react-layers.test.ts`
Expected: FAIL — cannot resolve the two new layer modules

- [ ] **Step 3: Write the zustand layer**

Create `src/generator/layers/zustand.ts`:

```ts
import { registerLayer } from './registry'
import type { Layer, LayerCtx } from './types'
import type { FileTree } from '../tree/file-tree'
import { dep } from '../versions'

const STORE = `import { create } from 'zustand'

interface CounterState {
  count: number
  increment: () => void
  reset: () => void
}

export const useCounter = create<CounterState>((set) => ({
  count: 0,
  increment: () => set((s) => ({ count: s.count + 1 })),
  reset: () => set({ count: 0 }),
}))
`

export const zustandLayer: Layer = {
  id: 'zustand',
  label: 'Zustand',
  description: 'Client state management',
  appliesTo: ['next', 'vite-react', 'expo'],
  manifest: (arch) => [arch.path('store', 'useCounter')],

  apply(tree: FileTree, ctx: LayerCtx): void {
    tree.write(ctx.arch.path('store', 'useCounter'), STORE)
    tree.pkg.addDep('zustand', dep('zustand'))
  },
}

registerLayer(zustandLayer)
```

- [ ] **Step 4: Write the react-hook-form layer**

Create `src/generator/layers/react-hook-form.ts`:

```ts
import { registerLayer } from './registry'
import type { Layer, LayerCtx } from './types'
import type { FileTree } from '../tree/file-tree'
import { dep } from '../versions'

const FORM = `'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const schema = z.object({
  email: z.email('Enter a valid email address'),
})

type Values = z.infer<typeof schema>

export function ExampleForm() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  return (
    <form onSubmit={handleSubmit((values) => console.log(values))}>
      <input {...register('email')} placeholder="you@example.com" />
      {errors.email ? <p>{errors.email.message}</p> : null}
      <button type="submit">Submit</button>
    </form>
  )
}
`

export const reactHookFormLayer: Layer = {
  id: 'react-hook-form',
  label: 'React Hook Form',
  description: 'Forms, validated by the Zod schema layer',
  appliesTo: ['next', 'vite-react', 'expo'],
  // The example form validates through zodResolver, so zod is not optional.
  requires: ['zod'],
  manifest: (arch) => [arch.path('component', 'ExampleForm')],

  apply(tree: FileTree, ctx: LayerCtx): void {
    tree.write(ctx.arch.path('component', 'ExampleForm'), FORM)
    tree.pkg.addDep('react-hook-form', dep('react-hook-form'))
    tree.pkg.addDep('@hookform/resolvers', dep('@hookform/resolvers'))
  },
}

registerLayer(reactHookFormLayer)
```

**Note on the `'use client'` directive:** it is harmless in Vite and Expo (they ignore it) and required in Next, so it is unconditional here rather than branching on the base. That is a deliberate simplification — revisit if a base ever rejects it.

- [ ] **Step 5: Register, add versions, verify**

`import './zustand'` and `import './react-hook-form'` in `src/generator/layers/index.ts`; add `zustand`, `react-hook-form`, `@hookform/resolvers` to `VERSIONS`.

Run: `npx tsc --noEmit && npm test -- tests/layers/react-layers.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/generator tests
git commit -m "feat: add zustand and react-hook-form layers"
```

---

### Task 5: Make the tailwind layer base-aware

**Files:**
- Modify: `src/generator/layers/tailwind.ts`
- Test: `tests/layers/tailwind.test.ts`

**Interfaces:** unchanged — this fixes existing behaviour.

**The bug this fixes.** `tailwind` has declared `appliesTo: ['next', 'vite-react']` since Plan 1, but it hardcodes `src/app/globals.css` — a Next App Router path. A Vite project would get a stylesheet in a folder that means nothing to it. Nothing caught this because `vite-react` did not exist until Task 1 of this plan; the moment it does, the combination becomes reachable.

**Deliberate simplification:** Tailwind 4 with Vite is more idiomatically wired through `@tailwindcss/vite` than through PostCSS. That would require the layer to contribute a plugin to `vite.config.ts`, which the *base* owns — needing a new structured model. PostCSS is officially supported and works for both bases, so v1 uses it and this note records the trade. Revisit if a second layer ever needs to contribute a Vite plugin, at which point the model earns its place.

- [ ] **Step 1: Write the failing test**

Add to `tests/layers/tailwind.test.ts`:

```ts
import { viteReactBase } from '@/generator/bases/vite-react'

describe('tailwind stylesheet location follows the base', () => {
  const viteCtx: LayerCtx = {
    app: { id: 'web', base: 'vite-react', arch: 'type-based', layers: ['tailwind'], options: {} },
    project: { name: 'hrims', layout: 'siblings' },
    pm: getPackageManager('npm'),
    arch: getArchitecture('type-based'),
    specifier: (f: string, t: string) => viteReactBase.specifier(f, t),
  }

  it('uses the App Router path for Next', () => {
    const tree = new FileTree()
    tailwindLayer.apply(tree, ctx)
    expect(tree.exists('src/app/globals.css')).toBe(true)
  })

  it('uses a plain src path for Vite, which has no app directory', () => {
    const tree = new FileTree()
    tailwindLayer.apply(tree, viteCtx)
    expect(tree.exists('src/index.css')).toBe(true)
    expect(tree.exists('src/app/globals.css')).toBe(false)
  })

  it('registers whichever stylesheet it wrote as a side-effect import', () => {
    const tree = new FileTree()
    tailwindLayer.apply(tree, viteCtx)
    expect(tree.sideEffects.list()).toEqual(['src/index.css'])
  })

  it('declares the right path in its manifest for each base', () => {
    expect(tailwindLayer.manifest(ctx.arch, 'next')).toContain('src/app/globals.css')
    expect(tailwindLayer.manifest(viteCtx.arch, 'vite-react')).toContain('src/index.css')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/layers/tailwind.test.ts`
Expected: FAIL — the Vite case writes `src/app/globals.css`

- [ ] **Step 3: Make the layer base-aware**

In `src/generator/layers/tailwind.ts`, replace the hardcoded path:

```ts
/** Next's App Router owns src/app; a Vite project has no such folder. */
function stylesheetPath(base: string): string {
  return base === 'next' ? 'src/app/globals.css' : 'src/index.css'
}

export const tailwindLayer: Layer = {
  id: 'tailwind',
  label: 'Tailwind CSS',
  description: 'Utility-first CSS framework',
  appliesTo: ['next', 'vite-react'],
  manifest: (_arch, base) => [stylesheetPath(base), 'postcss.config.mjs'],

  apply(tree: FileTree, ctx: LayerCtx): void {
    const cssPath = stylesheetPath(ctx.app.base)
    tree.write(cssPath, GLOBALS_CSS)
    // Without this the stylesheet is dead code and Tailwind never applies.
    tree.sideEffects.add(cssPath)
    tree.write('postcss.config.mjs', POSTCSS_CONFIG)
    tree.pkg.addDevDep('tailwindcss', dep('tailwindcss'))
    tree.pkg.addDevDep('@tailwindcss/postcss', dep('@tailwindcss/postcss'))
  },
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm test -- tests/layers/tailwind.test.ts`
Expected: PASS. Snapshots for Next configs must be unchanged — if any move, read the diff before accepting.

- [ ] **Step 5: Commit**

```bash
git add src/generator tests
git commit -m "fix: put the tailwind stylesheet where each base expects it"
```

---

### Task 6: The tanstack-table and jest-expo layers

**Files:**
- Create: `src/generator/layers/tanstack-table.ts`, `src/generator/layers/jest-expo.ts`
- Modify: `src/generator/layers/index.ts`, `src/generator/versions.ts`
- Test: `tests/layers/react-layers.test.ts`

**Interfaces:**
- Produces: `tanstackTableLayer`, `jestExpoLayer`

- [ ] **Step 1: Write the failing tests**

Append to `tests/layers/react-layers.test.ts`:

```ts
import { tanstackTableLayer } from '@/generator/layers/tanstack-table'
import { jestExpoLayer } from '@/generator/layers/jest-expo'

describe('tanstack-table layer', () => {
  it('writes an example table component', () => {
    const tree = new FileTree()
    tanstackTableLayer.apply(tree, reactCtx())
    expect(tree.read('src/components/ExampleTable.tsx')).toContain('useReactTable')
  })

  it('does not apply to expo, which has no DOM table', () => {
    expect(tanstackTableLayer.appliesTo).not.toContain('expo')
  })
})

describe('jest-expo layer', () => {
  it('applies only to expo, whose idiomatic runner is jest', () => {
    expect(jestExpoLayer.appliesTo).toEqual(['expo'])
  })

  it('writes a jest config using the expo preset', () => {
    const tree = new FileTree()
    jestExpoLayer.apply(tree, reactCtx('expo'))
    expect(tree.read('jest.config.js')).toContain('jest-expo')
  })

  it('writes one real passing test and a test script', () => {
    const tree = new FileTree()
    jestExpoLayer.apply(tree, reactCtx('expo'))
    expect(tree.exists('tests/example.test.ts')).toBe(true)
    expect(JSON.parse(tree.pkg.render()).scripts.test).toBe('jest')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/layers/react-layers.test.ts`
Expected: FAIL — cannot resolve the two new modules

- [ ] **Step 3: Write the tanstack-table layer**

Create `src/generator/layers/tanstack-table.ts`:

```ts
import { registerLayer } from './registry'
import type { Layer, LayerCtx } from './types'
import type { FileTree } from '../tree/file-tree'
import { dep } from '../versions'

const TABLE = `'use client'

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'

interface Person {
  name: string
  role: string
}

const columnHelper = createColumnHelper<Person>()

const columns = [
  columnHelper.accessor('name', { header: 'Name' }),
  columnHelper.accessor('role', { header: 'Role' }),
]

const data: Person[] = [
  { name: 'Ada Lovelace', role: 'Engineer' },
  { name: 'Grace Hopper', role: 'Engineer' },
]

export function ExampleTable() {
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() })

  return (
    <table>
      <thead>
        {table.getHeaderGroups().map((group) => (
          <tr key={group.id}>
            {group.headers.map((header) => (
              <th key={header.id}>
                {flexRender(header.column.columnDef.header, header.getContext())}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
`

export const tanstackTableLayer: Layer = {
  id: 'tanstack-table',
  label: 'TanStack Table',
  description: 'Headless tables for data-heavy screens',
  // Expo renders native views, not DOM tables.
  appliesTo: ['next', 'vite-react'],
  manifest: (arch) => [arch.path('component', 'ExampleTable')],

  apply(tree: FileTree, ctx: LayerCtx): void {
    tree.write(ctx.arch.path('component', 'ExampleTable'), TABLE)
    tree.pkg.addDep('@tanstack/react-table', dep('@tanstack/react-table'))
  },
}

registerLayer(tanstackTableLayer)
```

- [ ] **Step 4: Write the jest-expo layer**

Create `src/generator/layers/jest-expo.ts`:

```ts
import { registerLayer } from './registry'
import type { Layer, LayerCtx } from './types'
import type { FileTree } from '../tree/file-tree'
import { dep } from '../versions'

const JEST_CONFIG = `module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/tests/**/*.test.ts?(x)'],
}
`

const GREET_UTIL = `export function greet(name: string): string {
  return \`Hello, \${name}\`
}
`

function greetTest(specifier: string): string {
  return `import { greet } from '${specifier}'

describe('greet', () => {
  it('greets by name', () => {
    expect(greet('protos')).toBe('Hello, protos')
  })
})
`
}

export const jestExpoLayer: Layer = {
  id: 'jest-expo',
  label: 'Jest (Expo)',
  // Expo's idiomatic runner is jest with the expo preset, not vitest.
  description: "Testing with Expo's own jest preset",
  appliesTo: ['expo'],
  manifest: (arch) => ['jest.config.js', 'tests/example.test.ts', arch.path('util', 'greet')],

  apply(tree: FileTree, ctx: LayerCtx): void {
    tree.write('jest.config.js', JEST_CONFIG)

    const utilPath = ctx.arch.path('util', 'greet')
    tree.write(utilPath, GREET_UTIL)
    tree.write('tests/example.test.ts', greetTest(ctx.specifier('tests/example.test.ts', utilPath)))

    tree.pkg.addDevDep('jest', dep('jest'))
    tree.pkg.addDevDep('jest-expo', dep('jest-expo'))
    tree.pkg.addDevDep('@types/jest', dep('@types/jest'))
    tree.pkg.addScript('test', 'jest')
  },
}

registerLayer(jestExpoLayer)
```

- [ ] **Step 5: Register, add versions, verify**

Add both imports to `src/generator/layers/index.ts`; add `@tanstack/react-table`, `jest`, `jest-expo`, `@types/jest` to `VERSIONS`.

Run: `npx tsc --noEmit && npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/generator tests
git commit -m "feat: add tanstack-table and jest-expo layers"
```

---

### Task 7: Frontend smoke configs

**Files:**
- Modify: `tests/snapshots/configs.ts`

- [ ] **Step 1: Add the configs**

Append to `CANONICAL_CONFIGS`:

```ts
  {
    name: '08-vite-react-full-npm',
    config: {
      v: 1,
      name: 'demo',
      layout: 'siblings',
      pm: 'npm',
      apps: [
        {
          id: 'web',
          base: 'vite-react',
          arch: 'feature-based',
          layers: ['tailwind', 'tanstack-query', 'zustand', 'zod', 'react-hook-form', 'tanstack-table', 'vitest'],
          options: {},
        },
      ],
      layers: [],
    },
  },
  {
    name: '11-expo-npm',
    config: {
      v: 1,
      name: 'demo',
      layout: 'siblings',
      pm: 'npm',
      apps: [
        {
          id: 'mobile',
          base: 'expo',
          arch: 'type-based',
          layers: ['tanstack-query', 'zustand', 'jest-expo'],
          options: {},
        },
      ],
      layers: [],
    },
  },
```

Config 08 deliberately stacks every React layer at once — the combinations are where bugs live, as configs 03 and 06 both demonstrated.

- [ ] **Step 2: Record and read the snapshots**

Run: `npm test -- tests/snapshots -u`, then read config 08's manifest and confirm `src/index.css` (not `src/app/globals.css`), `src/providers/QueryProvider.tsx`, and the feature-based component paths. A snapshot recorded without reading it is worthless.

- [ ] **Step 3: Run the full smoke matrix**

Run: `npm run smoke`
Expected: PASS for all eleven configs. The Expo config will dominate the runtime — react-native and Metro are a large install.

If `expo export --platform web` proves impractical, fall back to `tsc --noEmit` as the build script **and record the weakening in spec §11**. Do not leave a build script that proves nothing without saying so.

- [ ] **Step 4: Commit**

```bash
git add tests
git commit -m "test: add vite-react and expo configs to the smoke matrix"
```

## Definition of done for Plan 4

- [ ] `npm test` passes — tiers 1 and 2
- [ ] `npm run smoke` passes — all eleven configs install and build
- [ ] `npx tsc --noEmit` clean
- [ ] All 4 bases and all 15 layers are registered and reachable
- [ ] A Vite project gets `src/index.css`, a Next project gets `src/app/globals.css`
- [ ] `tanstack-query` wraps the app tree in all three React bases
- [ ] `npm run check:versions` reports every new dependency as current or held back

## What Plan 5 inherits

The catalog is complete: 4 bases, 15 layers, 4 architectures, 3 layouts, 2 package managers. Plan 5 builds the web UI on top, and it is registry-driven — `BASES` and `LAYERS` render themselves, and every layer's `manifest(arch, base)` feeds the live file-tree preview without the UI knowing what any layer does.
