/**
 * floorFinish.ts — realistic per-room-type + per-style floor finishes.
 *
 * §A.21.D-FLOOR (2026-06-05). The apartment auto-pipeline fires
 * CreateFloorsByRoomTypeCommand, which previously created every floor with the
 * flat fallback colour `#D4C4A8` (rooms carry no explicit floor finish, so the
 * CreateFloorCommand default was always used). The founder's feedback: floors
 * look like "coloured rooms", not realistic finishes.
 *
 * This is the floor analogue of the furnish `styleFinish.ts` (per-style/per-
 * category palette): given a room occupancy type and the brief style, it returns
 * a believable finish — wood plank in living/sleeping rooms, porcelain tile in
 * wet/service rooms — with a real colour + plank/tile pattern + material name
 * the FloorPanelBuilder renders. Pure: no I/O, no THREE, no DOM.
 */

import type { FloorPattern } from '@pryzm/core-app-model';

/** Brief style chip — mirrors furnishLayout FurnishStyle. */
export type FloorStyle = 'modern' | 'classic' | 'minimal' | 'warm';

export interface FloorFinishChoice {
    readonly finishColor: string;
    readonly finishPattern: FloorPattern;
    readonly materialName: string;
}

/** occupancyType → finish family. Mirrors CreateFloorsByRoomTypeCommand's sets so
 *  the two stay in lock-step. */
const TIMBER_TYPES = new Set([
    'living-room', 'bedroom', 'dining-room', 'hotel-bedroom', 'study', 'home-office',
]);
const WET_TILE_TYPES = new Set([
    'bathroom', 'wc', 'accessible-wc', 'shower-room', 'ensuite', 'en-suite',
]);
const DRY_TILE_TYPES = new Set([
    'kitchen', 'kitchen-shared', 'utility-room', 'hallway', 'corridor', 'entrance-hall',
    'entrance', 'circulation',
]);

/** Engineered-wood finishes per style — colour + plank layout + material label. */
const TIMBER_BY_STYLE: Record<FloorStyle, FloorFinishChoice> = {
    modern:  { finishColor: '#C9B68F', finishPattern: 'plank-90',          materialName: 'Engineered Oak — Natural' },
    classic: { finishColor: '#8A5A33', finishPattern: 'plank-herringbone', materialName: 'Walnut — Herringbone' },
    minimal: { finishColor: '#D8CDB6', finishPattern: 'plank-90',          materialName: 'Pale Ash Plank' },
    warm:    { finishColor: '#B07C44', finishPattern: 'plank-90',          materialName: 'Honey Oak Plank' },
};

/** Porcelain tile for wet rooms — small format, cool stone tones. */
const WET_TILE_BY_STYLE: Record<FloorStyle, FloorFinishChoice> = {
    modern:  { finishColor: '#C7CCCF', finishPattern: 'tile-300x300', materialName: 'Porcelain — Grey Stone' },
    classic: { finishColor: '#D6D0C4', finishPattern: 'tile-300x300', materialName: 'Porcelain — Travertine' },
    minimal: { finishColor: '#D9DCDD', finishPattern: 'tile-600x600', materialName: 'Porcelain — Off-White' },
    warm:    { finishColor: '#CFC3B0', finishPattern: 'tile-300x300', materialName: 'Porcelain — Sand' },
};

/** Porcelain / large-format tile for kitchens & service / circulation. */
const DRY_TILE_BY_STYLE: Record<FloorStyle, FloorFinishChoice> = {
    modern:  { finishColor: '#D6D2C9', finishPattern: 'tile-600x600', materialName: 'Porcelain — Light Stone' },
    classic: { finishColor: '#C9B79C', finishPattern: 'tile-600x300', materialName: 'Terracotta — Warm' },
    minimal: { finishColor: '#E0DCD3', finishPattern: 'tile-600x600', materialName: 'Porcelain — Chalk' },
    warm:    { finishColor: '#CDB68F', finishPattern: 'tile-600x600', materialName: 'Porcelain — Honey Stone' },
};

/** Normalise an arbitrary style string to one of the four canonical chips. */
export function normaliseFloorStyle(style: string | undefined): FloorStyle {
    const s = (style ?? '').toLowerCase();
    if (s === 'classic' || s === 'traditional') return 'classic';
    if (s === 'minimal' || s === 'minimalist' || s === 'scandinavian') return 'minimal';
    if (s === 'warm' || s === 'rustic' || s === 'cozy' || s === 'cosy') return 'warm';
    return 'modern';
}

/**
 * Resolve a realistic floor finish for a room. Returns null for room types with
 * no sensible floor mapping (the caller then skips / uses the engine default).
 * `style` is the brief style; absent → 'modern'.
 */
export function floorFinishFor(
    occupancyType: string | undefined,
    style?: string,
): FloorFinishChoice | null {
    if (!occupancyType) return null;
    const occ = occupancyType.toLowerCase();
    const st = normaliseFloorStyle(style);
    if (TIMBER_TYPES.has(occ)) return TIMBER_BY_STYLE[st];
    if (WET_TILE_TYPES.has(occ)) return WET_TILE_BY_STYLE[st];
    if (DRY_TILE_TYPES.has(occ)) return DRY_TILE_BY_STYLE[st];
    return null;
}
