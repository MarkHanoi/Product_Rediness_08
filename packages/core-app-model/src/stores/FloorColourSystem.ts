/**
 * FloorColourSystem — Colour resolution service for the Floor subsystem.
 *
 * Priority chain: floor.colour → finishSpec.finishColor → systemType.layers[0].materialColor → default
 *
 * No Three.js. No store or command imports.
 */

import { FloorData } from './FloorTypes';

/** Default colours */
export const FLOOR_DEFAULTS = {
  /** Warm stone/screed — primary top face colour */
  defaultFinishColor: '#D4C4A8',
  /** Plan fill colour (semi-transparent) */
  defaultPlanFill: '#C8BCB0',
  /** Preview colour while drawing (muted blue — distinct from ceiling indigo) */
  previewColor: '#8fb4c8',
  /** Preview opacity */
  previewOpacity: 0.55,
  /** Selection highlight — electric violet (--app-violet-3 #6600FF) */
  selectionColor: '#6600FF',
  /** Hover highlight — soft violet (--app-violet-1 #8B5CF6) */
  hoverColor: '#8B5CF6',
  /** Edge line colour */
  edgeColor: '#444444',
  /** Plan fill opacity */
  planFillOpacity: 0.40,
  /** Default screed colour */
  screedColor: '#C8BEB0',
  /** Default insulation colour (mineral wool) */
  insulationColor: '#FFD580',
  /** Default waterproofing colour */
  tankingColor: '#6BAED6',
  /** Default adhesive colour */
  adhesiveColor: '#A0A0A0',
  /** Service hole frame colour */
  serviceHoleFrameColor: '#888888',
  /** Drain grating colour */
  drainGratingColor: '#555555',
} as const;

/** Layer function → default colour */
export const FLOOR_LAYER_COLORS: Record<string, string> = {
  finish: '#D4C4A8',
  adhesive: '#A0A0A0',
  screed: '#C8BEB0',
  'underfloor-heating': '#FF8C42',
  insulation: '#FFD580',
  tanking: '#6BAED6',
  substrate: '#9E9E9E',
};

/**
 * Resolves a master-library material id to a `#rrggbb` string.
 *
 * Injected rather than imported: this module is declared THREE-free (see the
 * file header) and `materialLibrary.ts` imports THREE. Passing the master
 * library's own `materialHexById` in here is what lets a floor read the master
 * data set without this module taking a THREE dependency — and without a
 * second transcribed copy of the id/hex table, which is how ai-host's
 * `finishRef.ts` came to exist.
 */
export type MaterialHexResolver = (materialId: string) => string | undefined;

/**
 * Resolve the primary display colour for a floor panel.
 *
 * Priority chain:
 *   floor.colour → finishSpec.finishColor → **floor.materialId** →
 *   layers[0].materialColor → systemType layer 0 → default
 *
 * §LANE-Y-FLOOR-MATERIAL-READ — the `materialId` link is new. `FloorData.materialId`
 * (FloorTypes.ts:33) has been WRITEABLE all along and was read by nothing: no line
 * of this chain consulted it, so choosing a library material for a floor finish
 * changed a field and left the render untouched. That is a silent no-op, not a
 * missing feature, and it is why a landscape material could not appear on a floor.
 *
 * It sits BELOW `colour` and `finishSpec.finishColor` because both of those are
 * explicit per-instance overrides that a user set more recently than the type-level
 * material, and ABOVE the layer/systemType defaults because a chosen library
 * material must beat a default.
 *
 * `resolveMaterialHex` is optional so every existing call site keeps compiling and
 * keeps its exact previous behaviour; a caller that does not inject it simply never
 * reaches the new branch.
 */
export function resolveFloorColor(
  floor: Pick<FloorData, 'colour' | 'finishSpec' | 'layers'> & { materialId?: string },
  systemTypeFirstLayerColor?: string,
  resolveMaterialHex?: MaterialHexResolver
): string {
  if (floor.colour) return floor.colour;
  if (floor.finishSpec?.finishColor) return floor.finishSpec.finishColor;
  if (floor.materialId && resolveMaterialHex) {
    const hex = resolveMaterialHex(floor.materialId);
    // A MISS falls through to the rest of the chain rather than rendering
    // black — an unknown id must degrade to the default, not to a void.
    if (hex) return hex;
  }
  if (floor.layers && floor.layers.length > 0 && floor.layers[0]!.materialColor) {
    return floor.layers[0]!.materialColor;
  }
  if (systemTypeFirstLayerColor) return systemTypeFirstLayerColor;
  return FLOOR_DEFAULTS.defaultFinishColor;
}

/**
 * Returns the colour for a specific layer index.
 * Prioritises layer.materialColor → function default.
 */
export function resolveLayerColor(
  layer: { function: string; materialColor?: string },
  _index: number
): string {
  if (layer.materialColor) return layer.materialColor;
  return FLOOR_LAYER_COLORS[layer.function] ?? '#CCCCCC';
}

/** Convert hex colour string to { r, g, b } in 0–255 range. */
export function hexToRGB(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean;
  return {
    r: parseInt(full.substring(0, 2), 16),
    g: parseInt(full.substring(2, 4), 16),
    b: parseInt(full.substring(4, 6), 16),
  };
}

/** Convert hex colour to THREE.Color-compatible number. */
export function hexToThreeColor(hex: string): number {
  const clean = hex.replace('#', '');
  return parseInt(clean, 16);
}

/** Returns { hex, opacity } preview pair for drawing tool overlay. */
export function getPreviewStyle(): { hex: string; opacity: number } {
  return { hex: FLOOR_DEFAULTS.previewColor, opacity: FLOOR_DEFAULTS.previewOpacity };
}

/** Returns { hex, opacity } plan fill pair for 2D drawing. */
export function getPlanFillStyle(
  _floor: Pick<FloorData, 'colour' | 'finishSpec' | 'layers'>
): { hex: string; opacity: number } {
  return { hex: FLOOR_DEFAULTS.defaultPlanFill, opacity: FLOOR_DEFAULTS.planFillOpacity };
}

/**
 * Build a colour key for cache invalidation.
 *
 * §LANE-Y-FLOOR-MATERIAL-READ — `materialId` MUST be in this key. It is now an
 * input to `resolveFloorColor`, and a cache key that omits an input to the value
 * it guards is an invalidation gate that hides the fix sitting behind it: the
 * colour would resolve correctly and the cached panel would never be rebuilt to
 * show it. Every field this key lists is a field the resolver reads.
 */
export function floorColorCacheKey(floor: FloorData): string {
  return [
    floor.colour ?? '',
    floor.finishSpec?.finishColor ?? '',
    floor.finishSpec?.finishPattern ?? '',
    floor.materialId ?? '',
    floor.opacity ?? 1,
  ].join(':');
}
