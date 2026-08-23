import { describe, it, expect } from 'vitest'
import { generate } from '@/generator/pipeline'
import type { ProtosConfig } from '@/generator/config/types'

const cfg: ProtosConfig = {
  v: 1,
  name: 'hrims',
  layout: 'siblings',
  pm: 'npm',
  apps: [
    {
      id: 'web',
      base: 'next',
      arch: 'type-based',
      layers: ['tailwind', 'prisma'],
      options: { db: 'postgres' },
    },
  ],
  layers: ['docker'],
}

describe('generate', () => {
  it('produces a single deliverable with the app under its prefixed folder', async () => {
    const [out] = await generate(cfg)
    expect(out.name).toBe('hrims')
    expect([...out.files.keys()]).toEqual(
      expect.arrayContaining([
        'hrims-web/package.json',
        'hrims-web/src/app/layout.tsx',
        'hrims-web/prisma/schema.prisma',
        'hrims-web/Dockerfile',
        'docker-compose.yml',
      ])
    )
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
    const reversed: ProtosConfig = {
      ...cfg,
      apps: [{ ...cfg.apps[0], layers: ['prisma', 'tailwind'] }],
    }
    const a = await generate(cfg)
    const b = await generate(reversed)
    expect([...a[0].files.entries()]).toEqual([...b[0].files.entries()])
  })

  it('threads the architecture choice into generated paths', async () => {
    const [typeBased] = await generate(cfg)
    const [featureBased] = await generate({
      ...cfg,
      apps: [{ ...cfg.apps[0], arch: 'feature-based' }],
    })
    expect(typeBased.files.has('hrims-web/src/components/Hello.tsx')).toBe(true)
    expect(featureBased.files.has('hrims-web/src/features/hello/Hello.tsx')).toBe(true)
    // Shared infrastructure stays put under both.
    expect(typeBased.files.has('hrims-web/src/lib/db.ts')).toBe(true)
    expect(featureBased.files.has('hrims-web/src/lib/db.ts')).toBe(true)
  })

  it('threads the package manager choice into every artifact', async () => {
    const [npmOut] = await generate(cfg)
    const [pnpmOut] = await generate({ ...cfg, pm: 'pnpm' })
    expect(npmOut.files.get('hrims-web/Dockerfile')).toContain('npm install')
    expect(npmOut.files.get('hrims-web/README.md')).toContain('npm run dev')
    expect(pnpmOut.files.get('hrims-web/Dockerfile')).toContain('corepack enable')
    expect(pnpmOut.files.get('hrims-web/README.md')).toContain('pnpm dev')
  })

  it('formats generated TypeScript with prettier', async () => {
    const [out] = await generate(cfg)
    expect(out.files.get('hrims-web/src/lib/db.ts')).not.toContain('\t')
  })

  it('completes within the 300ms budget once warm', async () => {
    await generate(cfg) // warm prettier
    const start = performance.now()
    await generate(cfg)
    expect(performance.now() - start).toBeLessThan(300)
  })
})

describe('package manager build permissions', () => {
  it('emits pnpm-workspace.yaml when a pnpm project needs prisma build scripts', async () => {
    const [out] = await generate({ ...cfg, pm: 'pnpm' })
    const yaml = out.files.get('hrims-web/pnpm-workspace.yaml')
    expect(yaml).toContain('allowBuilds:')
    expect(yaml).toContain('prisma')
  })

  it('emits no such file for npm, which needs no permission', async () => {
    const [out] = await generate(cfg)
    expect(out.files.has('hrims-web/pnpm-workspace.yaml')).toBe(false)
  })

  it('emits no such file for pnpm when no layer needs build scripts', async () => {
    const [out] = await generate({
      ...cfg,
      pm: 'pnpm',
      apps: [{ ...cfg.apps[0], layers: ['tailwind'] }],
      layers: [],
    })
    expect(out.files.has('hrims-web/pnpm-workspace.yaml')).toBe(false)
  })
})
