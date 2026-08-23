import type { BaseId } from '../config/types'
import type { Base } from './types'

export const BASES: Partial<Record<BaseId, Base>> = {}

export function registerBase(base: Base): void {
  BASES[base.id] = base
}

export function getBase(id: BaseId): Base {
  const base = BASES[id]
  if (!base) throw new Error(`Unknown base "${id}"`)
  return base
}
