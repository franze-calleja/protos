import { describe, it, expect } from 'vitest'
import { nextBase } from '@/generator/bases/next'

describe('next specifiers', () => {
  it('uses the @ alias and drops the extension', () => {
    expect(nextBase.specifier('src/lib/db.ts', 'src/generated/prisma/client')).toBe(
      '@/generated/prisma/client'
    )
  })

  it('aliases a component path', () => {
    expect(nextBase.specifier('src/app/page.tsx', 'src/components/Hello.tsx')).toBe(
      '@/components/Hello'
    )
  })
})
