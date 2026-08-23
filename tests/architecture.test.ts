import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

describe('generator isolation', () => {
  it('never imports from next', () => {
    const files = walk('src/generator').filter((f) => f.endsWith('.ts'))
    const offenders = files.filter((f) =>
      /from ['"]next(\/|['"])/.test(readFileSync(f, 'utf8'))
    )
    expect(offenders).toEqual([])
  })

  it('has generator source to check', () => {
    expect(walk('src/generator').length).toBeGreaterThan(0)
  })
})
