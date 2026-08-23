import type { PmId } from '../config/types'
import type { PackageManagerStrategy } from './types'
import { npmStrategy } from './npm'
import { pnpmStrategy } from './pnpm'

const STRATEGIES: Record<PmId, PackageManagerStrategy> = {
  npm: npmStrategy,
  pnpm: pnpmStrategy,
}

export function getPackageManager(id: PmId): PackageManagerStrategy {
  const pm = STRATEGIES[id]
  if (!pm) throw new Error(`Unknown package manager "${id}"`)
  return pm
}

export type { PackageManagerStrategy }
