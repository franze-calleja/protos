import { encodeConfig } from '../src/generator/config/codec'
import type { ProtosConfig } from '../src/generator/config/types'

const cfg: ProtosConfig = {
  v: 1,
  name: 'hrims',
  layout: 'siblings',
  pm: 'npm',
  apps: [
    {
      id: 'api',
      base: 'express',
      arch: 'layered',
      layers: ['prisma', 'pino'],
      options: { db: 'postgres' },
    },
    { id: 'web', base: 'next', arch: 'type-based', layers: ['tailwind'], options: {} },
  ],
  layers: ['docker'],
}

console.log(encodeConfig(cfg))
