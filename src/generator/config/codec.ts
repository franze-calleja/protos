import { deflateSync, inflateSync, strToU8, strFromU8 } from 'fflate'
import { parseConfig } from './schema'
import { MAX_ENCODED_BYTES } from './types'
import type { ProtosConfig } from './types'
import { ConfigError } from './errors'

/** Stable key order keeps encoding deterministic across JS engines. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

export function encodeConfig(cfg: ProtosConfig): string {
  const deflated = deflateSync(strToU8(stableStringify(cfg)), { level: 9 })
  return Buffer.from(deflated).toString('base64url')
}

export function decodeConfig(encoded: string): ProtosConfig {
  if (encoded.length > MAX_ENCODED_BYTES) {
    throw new ConfigError(`Config exceeds ${MAX_ENCODED_BYTES} byte cap`)
  }
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new ConfigError('Config is not valid base64url')
  }

  let json: string
  try {
    json = strFromU8(inflateSync(new Uint8Array(Buffer.from(encoded, 'base64url'))))
  } catch {
    throw new ConfigError('Config could not be decompressed')
  }

  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new ConfigError('Config is not valid JSON')
  }

  return parseConfig(migrate(raw))
}

/**
 * Upgrades older config versions to the current shape so share links never break.
 * v1 is current, so this is a pass-through until v2 exists.
 */
function migrate(raw: unknown): unknown {
  return raw
}
