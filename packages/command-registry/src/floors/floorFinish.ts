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

/**
 * Canonical floor styles — ST.2 (SPEC-INTERIOR-STYLE-SYSTEM) extends the
 * original A.21.D19 set (Nordic · Mediterranean · Minimalist · Classic) to the
 * SIX founder styles: Nordic · Mediterranean · Classic · Farmhouse · Japanese ·
 * Industrial. The legacy `minimalist` floor key is RETAINED as an alias target
 * (legacy briefs / saved projects keep resolving) but folds onto Japanese for
 * the clean-line read in `normaliseFloorStyle`, kept in lock-step with the
 * ai-host `resolveStyleId` alias map.
 */
export type FloorStyle =
    | 'nordic'
    | 'mediterranean'
    | 'classic'
    | 'farmhouse'
    | 'japanese'
    | 'industrial'
    /** legacy key — `minimalist` floor finishes (preserved for back-compat). */
    | 'minimalist';

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

/** Engineered-wood finishes per style — colour + plank layout + material label.
 *  A.21.D19: Nordic pale plank · Mediterranean warm honey · Minimalist seamless
 *  pale · Classic dark walnut herringbone. */
const TIMBER_BY_STYLE: Record<FloorStyle, FloorFinishChoice> = {
    nordic:        { finishColor: '#E2D6BE', finishPattern: 'plank-90',          materialName: 'Pale Ash / Birch Plank' },
    mediterranean: { finishColor: '#B07C44', finishPattern: 'plank-90',          materialName: 'Honey Oak Plank' },
    minimalist:    { finishColor: '#D8CDB6', finishPattern: 'plank-90',          materialName: 'Pale Oak — Wide Plank' },
    classic:       { finishColor: '#5A3A22', finishPattern: 'plank-herringbone', materialName: 'Dark Walnut — Herringbone' },
    // ST.2 — new founder styles.
    farmhouse:     { finishColor: '#8B6A47', finishPattern: 'plank-90',          materialName: 'Reclaimed Wide-Plank Oak' },
    japanese:      { finishColor: '#C9B98F', finishPattern: 'plank-90',          materialName: 'Natural Oak / Tatami Tone' },
    industrial:    { finishColor: '#8C8884', finishPattern: 'seamless',          materialName: 'Polished Concrete' },
};

/** Wet-room finishes — small/medium format tile, style-coherent tones. */
const WET_TILE_BY_STYLE: Record<FloorStyle, FloorFinishChoice> = {
    nordic:        { finishColor: '#D9DCDD', finishPattern: 'tile-600x600', materialName: 'Porcelain — Off-White' },
    mediterranean: { finishColor: '#C8794D', finishPattern: 'tile-300x300', materialName: 'Terracotta — Ceramic' },
    minimalist:    { finishColor: '#DCDCDC', finishPattern: 'tile-600x600', materialName: 'Large-Format Pale Tile' },
    classic:       { finishColor: '#E7E0D2', finishPattern: 'tile-300x300', materialName: 'Marble — Veined White' },
    // ST.2 — new founder styles.
    farmhouse:     { finishColor: '#CBB89A', finishPattern: 'tile-300x300', materialName: 'Matte Stone — Warm Cream' },
    japanese:      { finishColor: '#CFCABB', finishPattern: 'tile-600x600', materialName: 'Pebble / Slate — Muted' },
    industrial:    { finishColor: '#7E7B77', finishPattern: 'seamless',     materialName: 'Microcement — Charcoal' },
};

/** Kitchen & service / circulation — larger-format tile, terrazzo or concrete. */
const DRY_TILE_BY_STYLE: Record<FloorStyle, FloorFinishChoice> = {
    nordic:        { finishColor: '#E0DCD3', finishPattern: 'tile-600x600', materialName: 'Porcelain — Chalk' },
    mediterranean: { finishColor: '#C8794D', finishPattern: 'tile-600x300', materialName: 'Terracotta Tile — Warm' },
    minimalist:    { finishColor: '#DCDCDC', finishPattern: 'seamless',     materialName: 'Polished Concrete' },
    classic:       { finishColor: '#E7E0D2', finishPattern: 'tile-600x600', materialName: 'Marble — Polished' },
    // ST.2 — new founder styles.
    farmhouse:     { finishColor: '#C2A57E', finishPattern: 'tile-600x300', materialName: 'Quarry Tile — Warm Clay' },
    japanese:      { finishColor: '#CFCABB', finishPattern: 'tile-600x600', materialName: 'Honed Stone — Muted' },
    industrial:    { finishColor: '#8C8884', finishPattern: 'seamless',     materialName: 'Polished Concrete — Grey' },
};

/**
 * Normalise an arbitrary style string to one of the SIX CANONICAL floor styles
 * (Nordic · Mediterranean · Classic · Farmhouse · Japanese · Industrial). ST.2:
 * extended from four. Kept in LOCK-STEP with the ai-host `resolveStyleId` alias
 * map (SPEC-INTERIOR-STYLE-SYSTEM §4): the legacy `minimal`/`modern`/
 * `minimalist`/`contemporary` clean-line chips fold onto JAPANESE; `rustic`/
 * `countryside` onto FARMHOUSE; `warm`/`cozy` onto MEDITERRANEAN. Default →
 * 'nordic'.
 *
 * NOTE: this is a hand-mirror of `resolveStyleId` (floorFinish.ts cannot import
 * ai-host without a package cycle). If the alias map changes there, change it
 * here too (the furnishStyles.test asserts they agree).
 */
export function normaliseFloorStyle(style: string | undefined): FloorStyle {
    const s = (style ?? '').toLowerCase().trim();
    if (s === 'classic' || s === 'traditional') return 'classic';
    if (s === 'mediterranean' || s === 'warm' || s === 'cozy' || s === 'cosy') return 'mediterranean';
    if (s === 'farmhouse' || s === 'rustic' || s === 'countryside' || s === 'country') return 'farmhouse';
    if (s === 'industrial' || s === 'warehouse' || s === 'loft') return 'industrial';
    if (s === 'japanese' || s === 'japandi' || s === 'zen'
        || s === 'minimalist' || s === 'minimal' || s === 'modern' || s === 'contemporary') return 'japanese';
    if (s === 'nordic' || s === 'scandinavian' || s === 'scandi') return 'nordic';
    return 'nordic';
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
