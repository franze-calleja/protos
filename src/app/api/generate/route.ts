import { decodeConfig } from '@/generator/config/codec'
import { ConfigError } from '@/generator/config/errors'
import { generate } from '@/generator/pipeline'
import { toZip } from '@/generator/sinks/zip'
import { allow } from '../rate-limit'

export async function GET(request: Request): Promise<Response> {
  const encoded = new URL(request.url).searchParams.get('c')
  if (!encoded) {
    return Response.json({ error: 'Missing config parameter "c"' }, { status: 400 })
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!allow(ip)) {
    return Response.json({ error: 'Too many requests' }, { status: 429 })
  }

  try {
    const cfg = decodeConfig(encoded)
    const zip = toZip(await generate(cfg))

    return new Response(zip as BodyInit, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${cfg.name}.zip"`,
        'Content-Length': String(zip.length),
        // Safe: the config string fully determines the bytes.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    // Only ConfigError messages are safe to surface — they describe user input.
    const message = error instanceof ConfigError ? error.message : 'Could not generate project'
    return Response.json({ error: message }, { status: 400 })
  }
}
