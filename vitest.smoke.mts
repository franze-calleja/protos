import { defineConfig } from 'vitest/config'
import path from 'node:path'

/** Tier 3 only. Slow by nature: each config runs a real install and build. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/smoke/**/*.test.ts'],
    testTimeout: 900_000,
    hookTimeout: 900_000,
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
})
