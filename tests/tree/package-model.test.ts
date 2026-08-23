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
    a.setName('app')
    a.addDep('zod', '^3.0.0')
    a.addScript('dev', 'next dev')
    const b = new PackageModel()
    b.setName('app')
    b.addScript('dev', 'next dev')
    b.addDep('zod', '^3.0.0')
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
