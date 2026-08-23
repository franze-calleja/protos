import type { ArchId } from '../config/types'
import type { ArchitectureStrategy } from './types'
import { typeBasedArch } from './type-based'
import { featureBasedArch } from './feature-based'

const STRATEGIES: Partial<Record<ArchId, ArchitectureStrategy>> = {
  'type-based': typeBasedArch,
  'feature-based': featureBasedArch,
}

export function getArchitecture(id: ArchId): ArchitectureStrategy {
  const arch = STRATEGIES[id]
  if (!arch) {
    throw new Error(`Architecture "${id}" is not implemented yet`)
  }
  return arch
}

export type { ArchitectureStrategy, PathRole } from './types'
