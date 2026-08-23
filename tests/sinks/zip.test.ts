import { describe, it, expect } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { toZip } from '@/generator/sinks/zip'

const deliverable = (name: string, files: [string, string][]) => ({
  name,
  files: new Map(files),
})

describe('toZip', () => {
  it('round-trips a single deliverable', () => {
    const zip = toZip([deliverable('hrims', [['a.txt', 'hello']])])
    expect(strFromU8(unzipSync(zip)['hrims/a.txt'])).toBe('hello')
  })

  it('namespaces multiple deliverables under their own folders', () => {
    const zip = toZip([
      deliverable('api', [['a.txt', 'a']]),
      deliverable('web', [['b.txt', 'b']]),
    ])
    expect(Object.keys(unzipSync(zip))).toEqual(
      expect.arrayContaining(['api/a.txt', 'web/b.txt'])
    )
  })

  it('is byte-identical for identical input', () => {
    const build = () => toZip([deliverable('x', [['a.txt', 'hello']])])
    expect(Buffer.from(build())).toEqual(Buffer.from(build()))
  })

  it('produces a non-empty archive', () => {
    expect(toZip([deliverable('x', [['a', 'b']])]).length).toBeGreaterThan(0)
  })
})
