import { describe, it, expect } from 'vitest'
import { encodeConfig, decodeConfig } from '@/generator/config/codec'
import { ConfigError } from '@/generator/config/errors'
import { deflateSync, strToU8 } from 'fflate'
import type { ProtosConfig } from '@/generator/config/types'

const cfg: ProtosConfig = {
  v: 1,
  name: 'hrims',
  layout: 'siblings',
  pm: 'pnpm',
  apps: [
    {
      id: 'api',
      base: 'express',
      arch: 'layered',
      layers: ['prisma', 'pino'],
      options: { db: 'postgres' },
    },
    { id: 'web', base: 'next', arch: 'type-based', layers: ['tailwind'], options: {} },
  ],
  layers: ['docker'],
}

describe('config codec', () => {
  it('round-trips a config unchanged', () => {
    expect(decodeConfig(encodeConfig(cfg))).toEqual(cfg)
  })

  it('produces a URL-safe string', () => {
    expect(encodeConfig(cfg)).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('stays comfortably under the URL budget', () => {
    expect(encodeConfig(cfg).length).toBeLessThan(400)
  })

  it('is deterministic', () => {
    expect(encodeConfig(cfg)).toBe(encodeConfig(cfg))
  })

  it('rejects a string that is not valid base64url', () => {
    expect(() => decodeConfig('!!!!not-base64!!!!')).toThrow(ConfigError)
  })

  it('rejects a payload that is not deflate-compressed', () => {
    const junk = Buffer.from('nonsense').toString('base64url')
    expect(() => decodeConfig(junk)).toThrow(/decompressed/)
  })

  it('rejects a well-formed payload that is not valid JSON', () => {
    const deflated = deflateSync(strToU8('not json at all'))
    expect(() => decodeConfig(Buffer.from(deflated).toString('base64url'))).toThrow(/valid JSON/)
  })

  it('rejects a payload over the size cap', () => {
    expect(() => decodeConfig('A'.repeat(5000))).toThrow(ConfigError)
  })

  it('rejects a decodable payload that fails schema validation', () => {
    const deflated = deflateSync(strToU8(JSON.stringify({ v: 1, name: 'BAD NAME' })))
    expect(() => decodeConfig(Buffer.from(deflated).toString('base64url'))).toThrow(/Invalid config/)
  })
})
