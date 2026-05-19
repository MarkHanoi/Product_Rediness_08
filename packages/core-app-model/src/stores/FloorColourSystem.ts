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
 * Resolve the primary display colour for a floor panel.
 * Follows the priority chain:
 * floor.colour → finishSpec.finishColor → systemType layer 0 → default
 */
export function resolveFloorColor(
  floor: Pick<FloorData, 'colour' | 'finishSpec' | 'layers'>,
  systemTypeFirstLayerColor?: string
): string {
  if (floor.colour) return floor.colour;
  if (floor.finishSpec?.finishColor) return floor.finishSpec.finishColor;
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

/** Build a colour key for cache invalidation. */
export function floorColorCacheKey(floor: FloorData): string {
  return [
    floor.colour ?? '',
    floor.finishSpec?.finishColor ?? '',
    floor.finishSpec?.finishPattern ?? '',
    floor.opacity ?? 1,
  ].join(':');
}
