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
      // affect the result.
      importFrom: ctx.specifier(providerPath, providerPath),
      order: QUERY_PROVIDER_ORDER,
    })
  },
}

registerLayer(tanstackQueryLayer)
