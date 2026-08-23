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

  it('defaults a next app to type-based architecture', () => {
    expect(parseConfig(valid).apps[0].arch).toBe('type-based')
  })

  it('accepts feature-based for a next app', () => {
    const cfg = { ...valid, apps: [{ ...valid.apps[0], arch: 'feature-based' }] }
    expect(parseConfig(cfg).apps[0].arch).toBe('feature-based')
  })

  it('rejects a backend architecture on a frontend base', () => {
    const cfg = { ...valid, apps: [{ ...valid.apps[0], arch: 'layered' }] }
    expect(() => parseConfig(cfg)).toThrow(ConfigError)
  })

  it('defaults an express app to layered architecture', () => {
    const cfg = { ...valid, apps: [{ id: 'api', base: 'express', layers: [], options: {} }] }
    expect(parseConfig(cfg).apps[0].arch).toBe('layered')
  })

  it('rejects an unknown architecture', () => {
    const cfg = { ...valid, apps: [{ ...valid.apps[0], arch: 'hexagonal' }] }
    expect(() => parseConfig(cfg)).toThrow(ConfigError)
  })
})
