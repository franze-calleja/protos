import { VERSIONS } from '../src/generator/versions'
import { classify, shouldFail, HELD_BACK, type Drift } from '../src/version-check'

async function latestOf(pkg: string): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`)
    if (!res.ok) return null
    return ((await res.json()) as { version?: string }).version ?? null
  } catch {
    return null
  }
}

const results: { pkg: string; pinned: string; latest: string; drift: Drift }[] = []

for (const [pkg, pinned] of Object.entries(VERSIONS)) {
  const latest = await latestOf(pkg)
  if (!latest) {
    console.warn(`  ?  ${pkg} — could not reach the registry`)
    continue
  }
  results.push({ pkg, pinned, latest, drift: classify(pkg, pinned, latest) })
}

const show = (drift: Drift, label: string) => {
  const rows = results.filter((r) => r.drift === drift)
  if (rows.length === 0) return
  console.log(`\n${label}`)
  for (const r of rows) {
    const reason = HELD_BACK[r.pkg] ? `  — ${HELD_BACK[r.pkg]}` : ''
    console.log(`  ${r.pkg}: pinned ${r.pinned}, latest ${r.latest}${reason}`)
  }
}

show('behind-major', 'NEW MAJOR AVAILABLE — review before bumping:')
show('held-back', 'Held back deliberately:')
show('behind-minor', 'Minor drift (caret ranges already absorb this):')

const current = results.filter((r) => r.drift === 'current').length
console.log(`\n${current}/${results.length} pins exactly current.`)

if (shouldFail(results)) {
  console.error('\nA dependency has a new major that is not accounted for.')
  console.error('Either bump it and run the smoke matrix, or add it to HELD_BACK with a reason.')
  process.exit(1)
}
