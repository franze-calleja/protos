import type { LayerId } from '../config/types'
import type { Layer } from './types'

/** Populated as layers are implemented. Adding a layer touches this file and one layer file. */
export const LAYERS: Partial<Record<LayerId, Layer>> = {}

export function registerLayer(layer: Layer): void {
  LAYERS[layer.id] = layer
}
