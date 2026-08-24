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
