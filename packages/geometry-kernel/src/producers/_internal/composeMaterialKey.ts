// Deterministic material key composer.  Two walls that produce the
// same `(systemTypeId, materialId, materialColor, layerName)` MUST
// produce the same `MaterialKey` so `MaterialPool` can dedupe.

import { asMaterialKey, type MaterialKey } from '../../types/MaterialKey.js';

export interface MaterialKeyInput {
  readonly systemTypeId?: string | undefined;
  readonly materialId?: string | undefined;
  readonly materialColor?: string | undefined;
  readonly layerName?: string | undefined;
}

const DEFAULT_WALL_COLOR = '#d4c5b0';

export function composeMaterialKey(input: MaterialKeyInput): MaterialKey {
  const sys = input.systemTypeId ?? '_';
  const mat = input.materialId ?? '_';
  const col = (input.materialColor ?? DEFAULT_WALL_COLOR).toLowerCase();
  const lay = input.layerName ?? '_';
  return asMaterialKey(`wall|${sys}|${mat}|${col}|${lay}`);
}
