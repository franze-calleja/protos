import { describe, it, expect, beforeEach } from 'vitest'
import { GET } from '@/app/api/generate/route'
import { resetRateLimit } from '@/app/api/rate-limit'
import { encodeConfig } from '@/generator/config/codec'
import type { ProtosConfig } from '@/generator/config/types'

const cfg: ProtosConfig = {
  v: 1,
  name: 'hrims',
  layout: 'siblings',
  pm: 'npm',
  apps: [
    { id: 'web', base: 'next', arch: 'type-based', layers: ['tailwind'], options: {} },
  ],
  layers: [],
}

const call = (query: string) => GET(new Request(`http://localhost/api/generate${query}`))

beforeEach(() => resetRateLimit())

describe('GET /api/generate', () => {
  it('returns a zip attachment for a valid config', async () => {
    const res = await call(`?c=${encodeConfig(cfg)}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/zip')
    expect(res.headers.get('content-disposition')).toContain('hrims.zip')
  })

  it('returns 400 when c is missing', async () => {
    expect((await call('')).status).toBe(400)
  })

  it('returns 400 for a malformed config rather than throwing', async () => {
    expect((await call('?c=!!!not-valid!!!')).status).toBe(400)
  })

  it('does not leak internal stack traces in the error body', async () => {
    const body = await (await call('?c=!!!not-valid!!!')).text()
    expect(body).not.toContain('at ')
  })

  it('returns 429 once the window is exhausted', async () => {
    const url = `?c=${encodeConfig(cfg)}`
    for (let i = 0; i < 30; i++) await call(url)
    expect((await call(url)).status).toBe(429)
  })
})
