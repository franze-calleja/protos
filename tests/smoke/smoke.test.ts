import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { generate } from '@/generator/pipeline'
import { getPackageManager } from '@/generator/pm'
import { CANONICAL_CONFIGS } from '../snapshots/configs'

function run(command: string, cwd: string): void {
  const [cmd, ...args] = command.split(' ')
  execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 600_000 })
}

describe('smoke matrix', () => {
  for (const { name, config } of CANONICAL_CONFIGS) {
    it(`generates a project that installs and builds: ${name}`, async () => {
      const dir = mkdtempSync(path.join(tmpdir(), `protos-${name}-`))
      try {
        for (const deliverable of await generate(config)) {
          for (const [file, content] of deliverable.files) {
            const full = path.join(dir, deliverable.name, file)
            mkdirSync(path.dirname(full), { recursive: true })
            writeFileSync(full, content)
          }
        }

        // Sibling layout: build each app in place with the package manager
        // that config actually selected.
        const appDir = path.join(dir, config.name, `${config.name}-${config.apps[0].id}`)
        const pm = getPackageManager(config.pm)
        run(pm.install(), appDir)
        run(pm.runScript('build'), appDir)
        expect(true).toBe(true)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  }
})
