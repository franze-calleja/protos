import type { LayerId } from '../config/types'
import type { RootLayer } from './root-types'

export const ROOT_LAYERS: Partial<Record<LayerId, RootLayer>> = {}

export function registerRootLayer(layer: RootLayer): void {
  ROOT_LAYERS[layer.id] = layer
}

export function isRootLayer(id: LayerId): boolean {
  return id in ROOT_LAYERS
}
