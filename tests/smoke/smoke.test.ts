import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { generate } from '@/generator/pipeline'
import { getPackageManager } from '@/generator/pm'
import { getAssembler } from '@/generator/assemblers/registry'
import type { Deliverable } from '@/generator/assemblers/types'
import type { ProtosConfig } from '@/generator/config/types'
import { CANONICAL_CONFIGS } from '../snapshots/configs'

function run(command: string, cwd: string): void {
  const [cmd, ...args] = command.split(' ')
  execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 600_000 })
}

/**
 * Where install and build must run for a given layout:
 * - monorepo: once at the workspace root, turbo builds every app
 * - separate: once per independent project
 * - siblings: once per app folder inside the single deliverable
 */
function buildTargets(cfg: ProtosConfig, deliverables: Deliverable[], dir: string): string[] {
  if (cfg.layout === 'monorepo') return [path.join(dir, deliverables[0].name)]
  if (cfg.layout === 'separate') return deliverables.map((d) => path.join(dir, d.name))
  const assembler = getAssembler(cfg.layout)
  return cfg.apps.map((spec) => path.join(dir, deliverables[0].name, assembler.appPath(spec, cfg)))
}

describe('smoke matrix', () => {
  for (const { name, config } of CANONICAL_CONFIGS) {
    it(`generates a project that installs and builds: ${name}`, async () => {
      const dir = mkdtempSync(path.join(tmpdir(), `protos-${name}-`))
      try {
        const deliverables = await generate(config)
        for (const deliverable of deliverables) {
          for (const [file, content] of deliverable.files) {
            const full = path.join(dir, deliverable.name, file)
            mkdirSync(path.dirname(full), { recursive: true })
            writeFileSync(full, content)
          }
        }

        const pm = getPackageManager(config.pm)
        for (const target of buildTargets(config, deliverables, dir)) {
          run(pm.install(), target)
          run(pm.runScript('build'), target)
        }
        expect(true).toBe(true)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  }
})
