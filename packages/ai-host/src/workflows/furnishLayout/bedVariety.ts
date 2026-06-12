// §67.2 (2026-06-11) → §BED-4-TYPES (founder #10, 2026-06-12) — bedroom bed
// VARIETY + consistency.
//
// Founder #10: "use the 4 parametric bed types — Bed, Platform Bed (Japanese),
// Float Bed (Japanese), Walnut Bed (Japanese); 3 of them come WITH bedside
// tables + lights." The geometry catalogue routes each to a real builder
// (FurnitureFactory): the plain `bed` → BedBuilder (bare frame), and the three
// Japanese variants → JapaneseBedBuilder, which build their bedside surfaces INTO
// the bed mesh:
//
//   • japanese_platform_bed — integrated NIGHTSTAND boxes (no lamp),
//   • japanese_walnut_bed   — integrated bedside WINGS (no lamp),
//   • japanese_float_bed    — integrated wings + REAL integrated LAMPS (PointLight).
//
// So this module picks ONE bed type per bedroom — DETERMINISTICALLY by a stable
// hash of the room id (NOT Math.random / Date.now) — rotating across all FOUR so
// different bedrooms read distinct, and pins the CONSISTENCY invariants:
//
//   • plain `bed`            → SEPARATE set: 2 `bedside_table` + 2 lamps via
//     bedsideLamps.ts (the existing default). No integrated furniture, so the
//     archetype's nightstands + lamps are what dress the bed.
//   • japanese_platform/walnut → integrated NIGHTSTANDS, NO integrated lamp:
//     SUPPRESS the separate `bedside_table` (the bed has its own) but KEEP a lamp
//     source (placed INLINE here on the bed's head corners so the suite still has
//     reading light — bedsideLamps.ts is skipped since there are no separate
//     nightstand pieces to ride).
//   • japanese_float        → integrated nightstands AND integrated lamps:
//     SUPPRESS both the separate `bedside_table` AND all lamps (the bed mesh
//     already carries them) → never doubled.

import type { FurnitureArchetype, FurnitureItemSpec, FurnishRoomInput, PlacedFurniture, Footprint, FurnitureKind } from './types.js';

/** The four parametric bed types the editor's bed picker exposes. */
export type BedType = 'bed' | 'japanese_platform_bed' | 'japanese_float_bed' | 'japanese_walnut_bed';

/** Deterministic rotation of the four bed types, indexed by the room-id hash. */
const BED_TYPES: readonly BedType[] = ['bed', 'japanese_platform_bed', 'japanese_float_bed', 'japanese_walnut_bed'];

/** Legacy bed-set label (kept so existing callers/tests compile). 'separate' ⇔
 *  the plain `bed`; 'integrated' ⇔ any Japanese variant (integrated nightstands). */
export type BedSet = 'separate' | 'integrated';

/** Legacy variant alias — the integrated beds the §67.2 tests reference. Kept so
 *  softFurnishings.test.ts integratedBedKind() still resolves a variant kind. */
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
 * §BED-4-TYPES — pick the bed TYPE for a bedroom. Deterministic by room id: the
 * stable hash mod 4 selects one of the four picker bed types, so an apartment with
 * several bedrooms shows all four in a reproducible spread (no RNG, ADR-0061).
 */
export function chooseBedType(roomId: string): BedType {
    return BED_TYPES[stableHash(roomId) % BED_TYPES.length]!;
}

/** True for any Japanese variant (built with integrated bedside surfaces). */
export function bedHasIntegratedBedside(type: BedType): boolean {
    return type !== 'bed';
}

/** True when the bed mesh carries its OWN lamps (only the float bed). */
export function bedHasIntegratedLamps(type: BedType): boolean {
    return type === 'japanese_float_bed';
}

/**
 * Legacy §67.2 API — kept for back-compat with softFurnishings.test.ts. Maps the
 * new 4-type choice onto the old 'separate' | 'integrated' label. 'separate' ⇔ the
 * plain `bed`; everything else is an integrated (Japanese) suite.
 */
export function chooseBedSet(roomId: string): BedSet {
    return chooseBedType(roomId) === 'bed' ? 'separate' : 'integrated';
}

/** Legacy §67.2 API — the variant bed the old 'integrated' set used. Unchanged so
 *  the old test (which asserts the integrated set uses one of these) still holds
 *  for the rooms it probes. New code uses chooseBedType. */
export function integratedBedKind(roomId: string): IntegratedBedKind {
    return (stableHash(roomId + ':bed') & 1) === 0 ? 'nordic_bed' : 'solid_wood_bed';
}

/**
 * §BED-4-TYPES — apply the chosen bed type to a bedroom archetype's item list:
 *   • plain `bed`       → unchanged (separate bedside tables + lamps downstream).
 *   • Japanese variant  → swap the `bed` item's kind for the variant AND DROP the
 *     separate `bedside_table` items (the bed builds its own nightstands/wings).
 *     The wall_mirror that paired to the bed via the 'bed' group is kept.
 *
 * Pure: returns a NEW items array (does not mutate the shared archetype data).
 */
export function applyBedType(archetype: FurnitureArchetype, type: BedType): FurnitureArchetype {
    if (type === 'bed') return archetype;
    const items: FurnitureItemSpec[] = archetype.items
        // The Japanese beds build their own bedside surfaces → drop the separate
        // nightstand pieces (consistency — never double nightstands).
        .filter((it) => it.kind !== 'bedside_table')
        .map((it) => (it.kind === 'bed' ? { ...it, kind: type as FurnitureKind } : it));
    return { ...archetype, items };
}

// ── Legacy §67.2 shims (kept so existing callers compile) ────────────────────

/** Legacy: apply the old 'separate' | 'integrated' set. Routes through the new
 *  4-type path — 'separate' keeps the plain bed; 'integrated' picks a variant. */
export function applyBedSet(archetype: FurnitureArchetype, set: BedSet, roomId: string): FurnitureArchetype {
    if (set === 'separate') return archetype;
    return applyBedType(archetype, chooseBedType(roomId) === 'bed' ? 'japanese_platform_bed' : chooseBedType(roomId));
}

/** Legacy: the integrated set placed its lamps inline. New code uses
 *  bedHasIntegratedLamps / the inline-lamp path keyed on the bed TYPE. */
export function integratedSetUsesInlineLamps(set: BedSet): boolean {
    return set === 'integrated';
}

/** A compact bedside-lamp footprint — identical to bedsideLamps.ts so the two
 *  lamp sources are visually consistent (the consistency check). */
const INTEGRATED_LAMP_FP: Footprint = {
    w: 0.25, l: 0.25, h: 0.45, baseOffset: 0, clearFront: 0, clearSides: 0,
};

const LAMP: FurnitureKind = 'lamp';

/**
 * §BED-4-TYPES — place the reading lamps for an integrated (Japanese) bed that
 * does NOT build its own lamps (platform / walnut). One lamp sits on each head
 * corner of the bed (at bedside-surface height), inheriting the bed yaw. The
 * FLOAT bed builds real lamps into its mesh, so it passes through here as a no-op
 * (its lamps are integrated). Pure + deterministic.
 *
 * `placed` is the room's finished furniture; we read the bed pose from it.
 */
export function placeIntegratedBedLamps(
    input: FurnishRoomInput, placed: readonly PlacedFurniture[],
): PlacedFurniture[] {
    const bed = placed.find((p) => bedHasIntegratedBedside(p.kind as BedType));
    if (!bed) return [];
    if (bedHasIntegratedLamps(bed.kind as BedType)) return [];   // float bed: lamps in the mesh
    // Bed inward normal (toward the room) and along-wall direction.
    const n = { x: Math.sin(bed.rotationY), z: Math.cos(bed.rotationY) };
    const d = { x: n.z, z: -n.x };
    const fp = bed.footprint;
    // Head end = back of the bed (against the wall): centre − n·(l/2). The lamps
    // sit on the two head corners, just inside the bed width.
    const headX = bed.position.x - n.x * (fp.l / 2);
    const headZ = bed.position.z - n.z * (fp.l / 2);
    const side = Math.max(0, fp.w / 2 - INTEGRATED_LAMP_FP.w / 2);
    const lampY = bed.position.y + 0.30;   // sit on the integrated bedside surface
    const out: PlacedFurniture[] = [];
    for (const s of [side, -side]) {
        out.push({
            kind: LAMP,
            position: { x: headX + d.x * s, y: lampY, z: headZ + d.z * s },
            rotationY: bed.rotationY,
            footprint: INTEGRATED_LAMP_FP,
            hostedSpaceId: input.roomId,
        });
    }
    return out;
}
