import { createHash } from 'node:crypto'
import type { Deliverable } from '@/generator/assemblers/types'

/** Paths plus content hashes — stable, reviewable, and small enough to read in a diff. */
export function manifestOf(deliverables: Deliverable[]): string {
  return deliverables
    .flatMap((d) =>
      [...d.files.entries()].map(
        ([path, content]) =>
          `${d.name}/${path}  ${createHash('sha256').update(content).digest('hex').slice(0, 12)}`
      )
    )
    .sort()
    .join('\n')
}
