import type { AppSpec, LayerId } from '../config/types'
import { LAYERS } from './registry'
import type { Layer } from './types'

/** `registry` is injectable so the resolver can be tested without real layers. */
export function resolveLayers(
  app: AppSpec,
  registry: Partial<Record<LayerId, Layer>> = LAYERS
): Layer[] {
  const requested = [...new Set(app.layers)]

  const layers = requested.map((id) => {
    const layer = registry[id]
    if (!layer) throw new Error(`Unknown layer "${id}"`)
    if (!layer.appliesTo.includes(app.base)) {
      throw new Error(`Layer "${id}" does not apply to base "${app.base}"`)
    }
    return layer
  })

  for (const layer of layers) {
    for (const req of layer.requires ?? []) {
      if (!requested.includes(req)) {
        throw new Error(`Layer "${layer.id}" requires "${req}", which is not selected`)
      }
    }
    for (const conflict of layer.conflictsWith ?? []) {
      if (requested.includes(conflict)) {
        throw new Error(`Layer "${layer.id}" conflicts with "${conflict}"`)
      }
    }
  }

  return toposort(layers)
}

/** Depth-first topological sort. Sorting by id first makes the result order-independent. */
function toposort(layers: Layer[]): Layer[] {
  const byId = new Map(layers.map((l) => [l.id, l]))
  const sorted: Layer[] = []
  const state = new Map<string, 'visiting' | 'done'>()

  function visit(layer: Layer): void {
    if (state.get(layer.id) === 'done') return
    if (state.get(layer.id) === 'visiting') {
      throw new Error(`Circular layer dependency at "${layer.id}"`)
    }
    state.set(layer.id, 'visiting')
    for (const req of [...(layer.requires ?? [])].sort()) {
      const dep = byId.get(req)
      if (dep) visit(dep)
    }
    state.set(layer.id, 'done')
    sorted.push(layer)
  }

  for (const layer of [...layers].sort((a, b) => a.id.localeCompare(b.id))) visit(layer)
  return sorted
}
