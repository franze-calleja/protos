import { encodeConfig } from '../src/generator/config/codec'
import type { ProtosConfig } from '../src/generator/config/types'

const cfg: ProtosConfig = {
  v: 1,
  name: 'hrims',
  layout: 'siblings',
  pm: 'npm',
  apps: [
    {
      id: 'web',
      base: 'next',
      arch: 'type-based',
      layers: ['tailwind', 'prisma'],
      options: { db: 'postgres' },
    },
  ],
  layers: ['docker'],
}

console.log(encodeConfig(cfg))
