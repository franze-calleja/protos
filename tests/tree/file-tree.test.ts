import { describe, it, expect } from 'vitest'
import { FileTree } from '@/generator/tree/file-tree'

describe('FileTree', () => {
  it('stores and reads a file', () => {
    const t = new FileTree()
    t.write('src/index.ts', 'export {}')
    expect(t.read('src/index.ts')).toBe('export {}')
    expect(t.exists('src/index.ts')).toBe(true)
  })

  it('normalises a leading slash', () => {
    const t = new FileTree()
    t.write('/src/a.ts', 'a')
    expect(t.paths()).toEqual(['src/a.ts'])
  })

  it('throws when a second write targets an existing path', () => {
    const t = new FileTree()
    t.write('src/a.ts', 'first')
    expect(() => t.write('src/a.ts', 'second')).toThrow(/already written/)
  })

  it('allows an explicit overwrite', () => {
    const t = new FileTree()
    t.write('src/a.ts', 'first')
    t.write('src/a.ts', 'second', { overwrite: true })
    expect(t.read('src/a.ts')).toBe('second')
  })

  it('rejects path traversal', () => {
    const t = new FileTree()
    expect(() => t.write('../escape.ts', 'x')).toThrow(/traversal/)
  })

  it('returns paths sorted for deterministic output', () => {
    const t = new FileTree()
    t.write('z.ts', '')
    t.write('a.ts', '')
    expect(t.paths()).toEqual(['a.ts', 'z.ts'])
  })
})

describe('IgnoreModel', () => {
  it('renders unique patterns in insertion order', () => {
    const t = new FileTree()
    t.ignore.add('node_modules')
    t.ignore.add('.env')
    t.ignore.add('node_modules')
    expect(t.ignore.render()).toBe('node_modules\n.env\n')
  })
})
