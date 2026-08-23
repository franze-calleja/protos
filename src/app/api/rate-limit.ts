const WINDOW_MS = 60_000
const MAX_REQUESTS = 30

const hits = new Map<string, number[]>()

/**
 * Per-instance sliding window. On serverless this limits each instance rather
 * than the fleet, which is the right trade for v1: no database, no shared state,
 * and enough to stop a single client hammering one instance.
 */
export function allow(key: string): boolean {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  if (recent.length >= MAX_REQUESTS) {
    hits.set(key, recent)
    return false
  }
  recent.push(now)
  hits.set(key, recent)
  return true
}

export function resetRateLimit(): void {
  hits.clear()
}
