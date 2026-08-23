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

  it('never leaks a real value into the example file', () => {
    const e = new EnvModel()
    e.set('SECRET', 'super-secret-dev-value')
    expect(e.render().example).not.toContain('super-secret-dev-value')
  })
})
