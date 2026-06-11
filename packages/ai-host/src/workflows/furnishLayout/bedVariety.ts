// §67.2 (2026-06-11) — bedroom bed VARIETY + consistency.
//
// Founder ask: "use different types of beds — some with incorporated bedside
// tables + lamps (check for consistency)". The geometry catalogue has several
// bed builders (plain `bed`, plus the parametric BedFactory variants that route
// to JapaneseBedBuilder: `nordic_bed`, `solid_wood_bed`, …). This module picks
// ONE coherent "bed set" per bedroom so different bedrooms read distinct, and
// pins the CONSISTENCY invariant: a bedroom gets EITHER
//
//   • the SEPARATE set  — plain `bed` + 2 `bedside_table` + lamps via
//     bedsideLamps.ts (the existing default), OR
//   • the INTEGRATED set — a variant bed that READS as a coherent suite with
//     its nightstands + lamps; the 2 `bedside_table` ride the bed as part of
//     the suite and the lamps are placed INLINE here, so bedsideLamps.ts is
//     SKIPPED (no double nightstands, no double lamps).
//
// The choice is DETERMINISTIC — a stable hash of the room id (NOT Math.random /
// Date.now) — so it varies between bedrooms in one apartment yet is reproducible.

import type { FurnitureArchetype, FurnitureItemSpec, FurnishRoomInput, PlacedFurniture, Footprint } from './types.js';

/** A bedroom bed set. */
export type BedSet = 'separate' | 'integrated';

/** The variant bed kind used by the integrated set (rotates per room). */
export type IntegratedBedKind = 'nordic_bed' | 'solid_wood_bed';

/** Stable 32-bit FNV-1a hash of a string. Deterministic; no RNG. */
export function stableHash(s: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

/**
 * Pick the bed set for a bedroom. Deterministic by room id. Roughly half the
 * bedrooms get the integrated suite (parity of the hash), the rest the separate
 * set — so an apartment shows variety without RNG.
 */
export function chooseBedSet(roomId: string): BedSet {
    return (stableHash(roomId) & 1) === 0 ? 'separate' : 'integrated';
}

/** Pick which variant bed the integrated set uses (rotates per room). */
export function integratedBedKind(roomId: string): IntegratedBedKind {
    // A second, independent bit so the variant isn't perfectly correlated with
    // the set choice. Deterministic.
    return (stableHash(roomId + ':bed') & 1) === 0 ? 'nordic_bed' : 'solid_wood_bed';
}

/**
 * Apply the bed-set choice to a bedroom archetype's item list:
 *   • SEPARATE   → unchanged (plain `bed`, bedsideLamps fires downstream).
 *   • INTEGRATED → swap the `bed` item's kind for the variant bed; the bedside
 *     tables stay (the suite has nightstands). The lamp source is handled by
 *     `integratedSetUsesInlineLamps` — bedsideLamps.ts is suppressed and lamps
 *     are placed inline (see furnishRoom.ts) so they're never doubled.
 *
 * Pure: returns a NEW items array (does not mutate the shared archetype data).
 */
export function applyBedSet(archetype: FurnitureArchetype, set: BedSet, roomId: string): FurnitureArchetype {
    if (set === 'separate') return archetype;
    const variant = integratedBedKind(roomId);
    const items: FurnitureItemSpec[] = archetype.items.map((it) =>
        it.kind === 'bed' ? { ...it, kind: variant } : it,
    );
    return { ...archetype, items };
}

/** The integrated set places its bedside lamps INLINE (so bedsideLamps.ts must
 *  be skipped to avoid a double placement). The separate set defers to
 *  bedsideLamps.ts. This is the single consistency switch. */
export function integratedSetUsesInlineLamps(set: BedSet): boolean {
    return set === 'integrated';
}

/** A compact bedside-lamp footprint — identical to bedsideLamps.ts so the two
 *  lamp sources are visually consistent (the consistency check). */
const INTEGRATED_LAMP_FP: Footprint = {
    w: 0.25, l: 0.25, h: 0.45, baseOffset: 0, clearFront: 0, clearSides: 0,
};

/**
 * Place the integrated suite's lamps: one on EACH bedside table already placed
 * (same rule as bedsideLamps.ts, kept here so the integrated path owns its own
 * lamps and we never run BOTH sources). Lamp sits ON the table top. Pure.
 */
export function placeIntegratedBedLamps(
    input: FurnishRoomInput, placed: readonly PlacedFurniture[],
): PlacedFurniture[] {
    const tables = placed.filter((p) => p.kind === 'bedside_table');
    const out: PlacedFurniture[] = [];
    for (const t of tables) {
        out.push({
            kind: 'lamp',
            position: { x: t.position.x, y: t.position.y + t.footprint.h, z: t.position.z },
            rotationY: t.rotationY,
            footprint: INTEGRATED_LAMP_FP,
            hostedSpaceId: input.roomId,
        });
    }
    return out;
}
