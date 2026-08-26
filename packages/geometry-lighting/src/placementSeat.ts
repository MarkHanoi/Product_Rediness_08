/**
 * placementSeat — §OUTDOOR112 (2026-08-26): ONE base-point convention for
 * lighting placement, consumed by BOTH the preview and the commit.
 *
 * ## The founder's defect this closes
 *
 * *"check the placement of the lightings — some of them go off — their base
 * point might not be correct: terracotta is an example — on placement. …
 * after placement they behave better."*
 *
 * The 3-D tool previewed a fixture at the RAW RAYCAST HIT and committed through
 * `CreateLightingCommand`, which re-derives Y from the seating authority
 * (C11 §5.4, `seating: 'auto'`). Two consequences, both his exact symptom:
 *
 *   · a CEILING fixture's raycast accepted any `'slab'` mesh — including the
 *     FLOOR slab, usually the surface actually under the cursor — so a pendant
 *     previewed ON THE FLOOR and jumped to the ceiling datum at the click;
 *   · a `table`-mounted fixture (the terracotta lamp) raycast furniture, so the
 *     ghost tracked the TABLETOP while the commit dropped it to the FLOOR datum
 *     (`table_terracotta` is in `FLOOR_MOUNTED_FIXTURES`).
 *
 * ## The convention (NORMATIVE, per mount class)
 *
 *   · ceiling-mounted — base point = the CEILING SEATING DATUM at the cursor's
 *     XZ (finished soffit if a ceiling covers the point, else
 *     `level.elevation + level.height` — LEVEL-DERIVED, so a 5 m storey hangs
 *     fixtures at 5 m, the founder's "always adapt to the level height").
 *     The body hangs below it by the fixture's own drop — authored geometry.
 *   · floor-standing (incl. every §OUTDOOR112 site fixture) — base point = the
 *     FLOOR SEATING DATUM (finish top if present, else slab top). Bases sit ON
 *     it; geometry rises +Y.
 *   · table-mounted — base point = the PICKED SURFACE when the user pointed at
 *     one (committed as `seating: 'explicit'` — position-dependent geometry the
 *     user drew, which C11 §5.4 assigns to the tool, not the command); the
 *     floor datum otherwise, exactly as the command's 'auto' arm would derive.
 *   · wall-mounted — no wall arm exists in the seating authority (named
 *     limitation); the command's 'auto' arm hangs non-floor fixtures from the
 *     ceiling datum, so the preview matches THAT. Parity with the commit is the
 *     contract here — inventing a better-looking preview the commit will not
 *     honour is precisely the defect this module removes.
 *
 * Pure: plain data in, `{ y, seating }` out. No THREE, no DOM, no window — so
 * the parity test can drive it against the command's own derivation for every
 * catalogue family.
 */

import {
    FLOOR_MOUNTED_FIXTURES,
    photometryForFixture,
    resolveFloorSeatingDatumFrom,
    resolveCeilingSeatingDatumFrom,
    type SeatingLevelLike,
    type FloorData,
    type CeilingData,
} from '@pryzm/core-app-model';

export interface PlacementSeat {
    /** World Y of the fixture's BASE POINT (the group origin the builder seats). */
    readonly y: number;
    /**
     * What the create payload must say about that Y. `'auto'` = the command
     * re-derives the SAME datum (parity by construction); `'explicit'` = the
     * user pointed at a host surface and the command must store it verbatim.
     */
    readonly seating: 'auto' | 'explicit';
}

/**
 * The ONE seat derivation. `pickedSurfaceY` is the Y of a raycast hit on a
 * legitimate host surface (today: furniture, for `table`-mounted fixtures) —
 * pass `undefined` when the cursor is not over one.
 */
export function placementSeatFor(
    fixtureType: string,
    level: SeatingLevelLike | undefined,
    floors: readonly FloorData[] | undefined | null,
    ceilings: readonly CeilingData[] | undefined | null,
    point: { x: number; z: number },
    pickedSurfaceY?: number,
): PlacementSeat {
    const mount = photometryForFixture(fixtureType).mount;

    // Table lamps live ON a picked surface — stated geometry, stored verbatim.
    if (mount === 'table' && pickedSurfaceY !== undefined && Number.isFinite(pickedSurfaceY)) {
        return { y: pickedSurfaceY, seating: 'explicit' };
    }

    // ⛔ From here the split MUST mirror `CreateLightingCommand`'s 'auto' arm
    // EXACTLY (`FLOOR_MOUNTED_FIXTURES.has ? floor : ceiling`) — the preview's
    // whole job is to stand where the commit will land.
    if (FLOOR_MOUNTED_FIXTURES.has(fixtureType as never)) {
        return { y: resolveFloorSeatingDatumFrom(level, floors, point).y, seating: 'auto' };
    }
    return { y: resolveCeilingSeatingDatumFrom(level, ceilings, point).y, seating: 'auto' };
}
