/**
 * Detects when a pinned dependency in versions.ts has fallen a major behind
 * the registry. The nightly smoke run proves the *current* pins still build;
 * it can never tell us a new major shipped. This closes that gap.
 */

/**
 * Packages deliberately held back, with the reason. Without this the check
 * would be permanently red and would stop being read.
 */
export const HELD_BACK: Record<string, string> = {
  typescript:
    'Pinned to 5.x on purpose: 6.0 and 7.0 are both still at x.0, and typescript-eslint 8 peers typescript <6.1.0',
  '@types/node': 'Tracks Node LTS, not Current',
  '@tanstack/react-table':
    'Pinned to 8.x: 9.0 shipped after 100+ prereleases and the official docs still document v8 as latest, so generated v9 code would not match anything a user can look up',
}

export type Drift = 'current' | 'behind-minor' | 'behind-major' | 'held-back' | 'unknown'

export function majorOf(range: string): number | null {
  const match = range.match(/(\d+)\.(\d+)\.(\d+)/)
  return match ? Number(match[1]) : null
}

export function classify(pkg: string, pinned: string, latest: string): Drift {
  const pinnedMajor = majorOf(pinned)
  const latestMajor = majorOf(latest)
  if (pinnedMajor === null || latestMajor === null) return 'unknown'

  if (latestMajor > pinnedMajor) {
    return pkg in HELD_BACK ? 'held-back' : 'behind-major'
  }
  return pinned.replace(/^\^/, '') === latest ? 'current' : 'behind-minor'
}

/** Only a non-deliberate major gap is worth failing over. */
export function shouldFail(results: { drift: Drift }[]): boolean {
  return results.some((r) => r.drift === 'behind-major')
}
