import { z } from 'zod'
import {
  BASE_IDS,
  LAYER_IDS,
  LAYOUT_IDS,
  PM_IDS,
  ARCH_IDS,
  ARCH_BY_BASE,
  DEFAULT_ARCH,
  NAME_PATTERN,
  MAX_APPS,
  MAX_LAYERS,
} from './types'
import type { ProtosConfig } from './types'
import { ConfigError } from './errors'

const appSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{0,19}$/),
    base: z.enum(BASE_IDS),
    // Omitting arch is normal — short share links rely on the per-base default.
    arch: z.enum(ARCH_IDS).optional(),
    layers: z.array(z.enum(LAYER_IDS)).max(MAX_LAYERS),
    options: z.record(z.string(), z.string()).default({}),
  })
  // Validate against the *effective* arch, then fill the default in. Doing it
  // in this order keeps the refinement on a plain object schema.
  .superRefine((app, ctx) => {
    const arch = app.arch ?? DEFAULT_ARCH[app.base]
    if (!ARCH_BY_BASE[app.base].includes(arch)) {
      ctx.addIssue({
        code: 'custom',
        path: ['arch'],
        message: `architecture "${arch}" is not valid for base "${app.base}"`,
      })
    }
  })
  .transform((app) => ({ ...app, arch: app.arch ?? DEFAULT_ARCH[app.base] }))

export const configSchema = z.object({
  v: z.literal(1),
  name: z.string().regex(NAME_PATTERN),
  layout: z.enum(LAYOUT_IDS),
  pm: z.enum(PM_IDS).default('npm'),
  apps: z.array(appSchema).min(1).max(MAX_APPS),
  layers: z.array(z.enum(LAYER_IDS)).max(MAX_LAYERS).default([]),
})

export function parseConfig(input: unknown): ProtosConfig {
  const result = configSchema.safeParse(input)
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join('.')} ${i.message}`)
      .join('; ')
    throw new ConfigError(`Invalid config: ${detail}`)
  }
  return result.data as ProtosConfig
}
