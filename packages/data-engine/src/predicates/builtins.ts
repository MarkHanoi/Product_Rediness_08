// C28 DAT-α-3 (Data Panel & Automation) — Tier-1 seed predicates.
//
// The eight fast (≤10 ms target) on-edit predicates per C28 §7.1.  Each
// is a pure function over a plain element record + the predicate context;
// `registerBuiltinPredicates(registry)` installs the set under stable
// ids matching the rule definitions sourced from
// `apartmentLayout/rules/programRules.ts` + the G-class doc.
//
// The id convention is `{elementType}.{dimension}{Min|Max}` and is what
// upstream `QualityRule.predicateId` references.
//
// L3 purity: no I/O, no THREE, no DOM.  Numbers are SI (metres, m²).

import type { PredicateFn, PredicateRegistry } from './PredicateRegistry.js';

// ─── Thresholds ────────────────────────────────────────────────────────────
// Centralised so test fixtures + UI tooltips read the same numbers.

/** Minimum room floor area in m². */
export const ROOM_AREA_MIN_M2 = 4;
/** Soft maximum room floor area in m² (warns on possible mis-merge). */
export const ROOM_AREA_MAX_M2 = 60;
/** Minimum room clear height in metres. */
export const ROOM_HEIGHT_MIN_M = 2.1;
/** Minimum wall thickness in metres. */
export const WALL_THICKNESS_MIN_M = 0.05;
/** Minimum wall length in metres. */
export const WALL_LENGTH_MIN_M = 0.2;
/** Minimum door leaf width in metres (accessibility). */
export const DOOR_WIDTH_MIN_M = 0.7;
/** Minimum door leaf height in metres. */
export const DOOR_HEIGHT_MIN_M = 2.0;
/** Minimum total apartment area in m² (studio floor). */
export const APARTMENT_AREA_MIN_M2 = 30;

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Read a numeric property defensively — many callers will pass partial
 * elements during edit-time evaluation and we want a missing field to
 * fail loudly (returns `undefined` so predicates can fixSuggestion the
 * gap rather than throw).
 */
function readNumber(
    element: Readonly<Record<string, unknown>>,
    key: string,
): number | undefined {
    const v = element[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

// ─── Predicates ────────────────────────────────────────────────────────────

export const roomAreaMin: PredicateFn = (element) => {
    const a = readNumber(element, 'areaM2');
    if (a === undefined) {
        return {
            pass: false,
            fixSuggestion: 'Room is missing areaM2 — recompute room geometry.',
        };
    }
    if (a < ROOM_AREA_MIN_M2) {
        return {
            pass: false,
            fixSuggestion: `Increase room size to at least ${ROOM_AREA_MIN_M2} m² (currently ${a.toFixed(2)} m²).`,
        };
    }
    return { pass: true };
};

export const roomAreaMax: PredicateFn = (element) => {
    const a = readNumber(element, 'areaM2');
    if (a === undefined) return { pass: true };
    if (a > ROOM_AREA_MAX_M2) {
        return {
            pass: false,
            fixSuggestion: `Room is ${a.toFixed(2)} m² (> ${ROOM_AREA_MAX_M2} m²) — verify it is not a mis-merge of two rooms.`,
        };
    }
    return { pass: true };
};

export const roomHeightMin: PredicateFn = (element) => {
    const h = readNumber(element, 'heightM');
    if (h === undefined) {
        return {
            pass: false,
            fixSuggestion: 'Room is missing heightM — set a ceiling height.',
        };
    }
    if (h < ROOM_HEIGHT_MIN_M) {
        return {
            pass: false,
            fixSuggestion: `Raise ceiling to at least ${ROOM_HEIGHT_MIN_M} m (currently ${h.toFixed(2)} m).`,
        };
    }
    return { pass: true };
};

export const wallThicknessMin: PredicateFn = (element) => {
    const t = readNumber(element, 'thicknessM');
    if (t === undefined) {
        return {
            pass: false,
            fixSuggestion: 'Wall is missing thicknessM — select a wall type.',
        };
    }
    if (t < WALL_THICKNESS_MIN_M) {
        return {
            pass: false,
            fixSuggestion: `Increase wall thickness to at least ${WALL_THICKNESS_MIN_M} m (currently ${t.toFixed(3)} m).`,
        };
    }
    return { pass: true };
};

export const wallLengthMin: PredicateFn = (element) => {
    const l = readNumber(element, 'lengthM');
    if (l === undefined) {
        return {
            pass: false,
            fixSuggestion: 'Wall is missing lengthM — recompute wall geometry.',
        };
    }
    if (l < WALL_LENGTH_MIN_M) {
        return {
            pass: false,
            fixSuggestion: `Wall is shorter than ${WALL_LENGTH_MIN_M} m — delete or extend (currently ${l.toFixed(3)} m).`,
        };
    }
    return { pass: true };
};

export const doorWidthMin: PredicateFn = (element) => {
    const w = readNumber(element, 'widthM');
    if (w === undefined) {
        return {
            pass: false,
            fixSuggestion: 'Door is missing widthM — set a door type.',
        };
    }
    if (w < DOOR_WIDTH_MIN_M) {
        return {
            pass: false,
            fixSuggestion: `Widen door to at least ${DOOR_WIDTH_MIN_M} m for accessibility (currently ${w.toFixed(2)} m).`,
        };
    }
    return { pass: true };
};

export const doorHeightMin: PredicateFn = (element) => {
    const h = readNumber(element, 'heightM');
    if (h === undefined) {
        return {
            pass: false,
            fixSuggestion: 'Door is missing heightM — set a door type.',
        };
    }
    if (h < DOOR_HEIGHT_MIN_M) {
        return {
            pass: false,
            fixSuggestion: `Increase door height to at least ${DOOR_HEIGHT_MIN_M} m (currently ${h.toFixed(2)} m).`,
        };
    }
    return { pass: true };
};

export const apartmentAreaMin: PredicateFn = (element) => {
    const a = readNumber(element, 'areaM2');
    if (a === undefined) {
        return {
            pass: false,
            fixSuggestion: 'Apartment is missing areaM2 — recompute apartment footprint.',
        };
    }
    if (a < APARTMENT_AREA_MIN_M2) {
        return {
            pass: false,
            fixSuggestion: `Apartment is below the ${APARTMENT_AREA_MIN_M2} m² studio floor (currently ${a.toFixed(2)} m²).`,
        };
    }
    return { pass: true };
};

// ─── Registration ─────────────────────────────────────────────────────────

/** The stable id ↔ predicate pairs installed by `registerBuiltinPredicates`. */
export const BUILTIN_PREDICATES: ReadonlyArray<readonly [string, PredicateFn]> = [
    ['room.areaMin', roomAreaMin],
    ['room.areaMax', roomAreaMax],
    ['room.heightMin', roomHeightMin],
    ['wall.thicknessMin', wallThicknessMin],
    ['wall.lengthMin', wallLengthMin],
    ['door.widthMin', doorWidthMin],
    ['door.heightMin', doorHeightMin],
    ['apartment.areaMin', apartmentAreaMin],
];

/**
 * Install every builtin predicate.  Throws if any id is already
 * registered — the registry is append-only by design.  Call once per
 * registry instance during engine bootstrap.
 */
export function registerBuiltinPredicates(registry: PredicateRegistry): void {
    for (const [id, fn] of BUILTIN_PREDICATES) {
        registry.register(id, fn);
    }
}
