import { zipSync, strToU8 } from 'fflate'
import type { Deliverable } from '../assemblers/types'

/** Earliest timestamp the ZIP format can represent. */
const ZIP_EPOCH = new Date('1980-01-01T00:00:00Z')

export function toZip(deliverables: Deliverable[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {}
  for (const d of deliverables) {
    for (const [path, content] of d.files) {
      entries[`${d.name}/${path}`] = strToU8(content)
    }
  }
  // Fixed mtime so identical input yields a byte-identical archive.
  // ZIP timestamps must fall within 1980-2099, so the epoch (0) is not valid here.
  return zipSync(entries, { level: 6, mtime: ZIP_EPOCH })
}
