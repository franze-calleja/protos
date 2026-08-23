import type { LayoutId } from '../config/types'
import type { Assembler } from './types'

export const ASSEMBLERS: Partial<Record<LayoutId, Assembler>> = {}

export function registerAssembler(a: Assembler): void {
  ASSEMBLERS[a.id] = a
}

export function getAssembler(id: LayoutId): Assembler {
  const a = ASSEMBLERS[id]
  if (!a) throw new Error(`Unknown layout "${id}"`)
  return a
}
