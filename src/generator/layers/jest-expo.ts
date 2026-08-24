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
