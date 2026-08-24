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
