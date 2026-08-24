import { registerLayer } from './registry'
import type { Layer, LayerCtx } from './types'
import type { FileTree } from '../tree/file-tree'
import { dep } from '../versions'

const FORM = `'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const schema = z.object({
  email: z.email('Enter a valid email address'),
})

type Values = z.infer<typeof schema>

export function ExampleForm() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  return (
    <form onSubmit={handleSubmit((values) => console.log(values))}>
      <input {...register('email')} placeholder="you@example.com" />
      {errors.email ? <p>{errors.email.message}</p> : null}
      <button type="submit">Submit</button>
    </form>
  )
}
`

export const reactHookFormLayer: Layer = {
  id: 'react-hook-form',
  label: 'React Hook Form',
  description: 'Forms, validated by the Zod schema layer',
  appliesTo: ['next', 'vite-react', 'expo'],
  // The example form validates through zodResolver, so zod is not optional.
  requires: ['zod'],
  manifest: (arch) => [arch.path('component', 'ExampleForm')],

  apply(tree: FileTree, ctx: LayerCtx): void {
    tree.write(ctx.arch.path('component', 'ExampleForm'), FORM)
    tree.pkg.addDep('react-hook-form', dep('react-hook-form'))
    tree.pkg.addDep('@hookform/resolvers', dep('@hookform/resolvers'))
  },
}

registerLayer(reactHookFormLayer)
