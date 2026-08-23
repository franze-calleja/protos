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

  it('reports emptiness', () => {
    expect(new ProviderModel().isEmpty()).toBe(true)
  })

  it('supports props on a provider', () => {
    const p = new ProviderModel()
    p.push({
      component: 'Theme',
      importName: 'Theme',
      importFrom: './t',
      order: 1,
      props: 'defaultTheme="dark"',
    })
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

  it('omits imports for middleware that need none', () => {
    const m = new MiddlewareModel()
    m.push({ expr: 'express.json()', order: 10 })
    expect(m.imports()).toBe('')
  })
})

describe('MiddlewareModel import-only entries', () => {
  it('contributes an import without an app.use call when importOnly is set', () => {
    const m = new MiddlewareModel()
    m.push({ expr: '', importName: '{ logger }', importFrom: './logger', order: 1, importOnly: true })
    expect(m.imports()).toContain('{ logger }')
    expect(m.statements()).toBe('')
  })
})
