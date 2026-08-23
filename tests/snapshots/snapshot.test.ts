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

  it('produces a different manifest for the same project under a different architecture', async () => {
    const base = CANONICAL_CONFIGS[0].config
    const asType = manifestOf(await generate(base))
    const asFeature = manifestOf(
      await generate({ ...base, apps: [{ ...base.apps[0], arch: 'feature-based' }] })
    )
    expect(asType).not.toBe(asFeature)
  })

  it('produces a different manifest for the same project under a different package manager', async () => {
    const base = CANONICAL_CONFIGS[0].config
    expect(manifestOf(await generate(base))).not.toBe(
      manifestOf(await generate({ ...base, pm: 'pnpm' }))
    )
  })

  it('produces a different manifest when a layer is added', async () => {
    const minimal = manifestOf(await generate(CANONICAL_CONFIGS[2].config))
    const withTailwind = manifestOf(await generate(CANONICAL_CONFIGS[0].config))
    expect(minimal).not.toBe(withTailwind)
  })
})
