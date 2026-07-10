// ─── §FIX-STAIR-PARAM-NO-REGEN (L-215) — derived-geometry reconciler ──────────
//
// The single, pure source of truth for the fields StairMeshBuilder reads that
// are DERIVED from a stair's primitive parameters:
//
//   • width       → landing polygon depth  (L: width,  U: 2·width)
//   • riserHeight → riser COUNT + total run (count = round(levelHeight/riserHeight))
//   • treadDepth  → the "going" + U-shape flight-2 startOverride offset
//   • shape / turnDirection / secondRunSide / stepsBeforeLanding → flight layout
//
// Before this reconciler existed, a stair parameter edit wrote ONLY the primitive
// to the store; `flights[].riserCount`, `landings[].depth`, `riserCount` and the
// adjusted `riserHeight` were left STALE, so any mesh rebuild reproduced the OLD
// geometry (the founder's "width doesn't update the landing / riser-height doesn't
// update the preview" report). `GenerateStairGeometryCommand` now calls this to
// bring those derived fields back into agreement with the primitives before it
// rebuilds the mesh.
//
// This is the same derivation StairCreationController.updatePreview() /
// getFinalInput() and ChangeStairShapeCommand perform at creation / reshape time —
// centralised here so the update path can never drift from the create path.
//
// PURE: no THREE, no DOM, no I/O (semantic layer, §03-BIM-SEMANTIC-MODEL-CONTRACT
// §1.1). All direction maths is plain Vec3.

import type { StairData, StairFlight, StairLanding, Vec3 } from './StairTypes';

export interface StairDerivedGeometry {
    flights: StairFlight[];
    landings: StairLanding[];
    riserCount: number;
    riserHeight: number;
}

/** Normalise a horizontal direction (Y dropped). Falls back to +Z when degenerate. */
function normalizeXZ(v: Vec3): Vec3 {
    const len = Math.hypot(v.x, v.z);
    if (len < 1e-6) return { x: 0, y: 0, z: 1 };
    return { x: v.x / len, y: 0, z: v.z / len };
}

/**
 * A stair whose flights carry per-flight `treadDepth` overrides, or whose landings
 * carry an explicit `center`, was authored from a 2D polyline / curved path
 * (StairPathAdapter — §STAIR-PREVIEW-MATCH-2026-04-25). Its flight lengths and
 * landing positions are fitted to the drawn geometry, NOT to the uniform
 * even-split this reconciler produces. Re-deriving would flatten that bespoke
 * layout, so we detect and preserve it (the caller skips reconciliation and just
 * rebuilds the mesh from the authored fields).
 */
export function stairHasAuthoredFlightGeometry(stair: StairData): boolean {
    const perFlightTread = stair.flights?.some(f => typeof f.treadDepth === 'number') ?? false;
    const landingCenter = stair.landings?.some(l => !!l.center) ?? false;
    return perFlightTread || landingCenter;
}

/**
 * Re-derive `{ flights, landings, riserCount, riserHeight }` from a stair's
 * primitive parameters and the connecting level height.
 *
 * Returns `null` when the stair carries authored per-flight geometry (see
 * {@link stairHasAuthoredFlightGeometry}) — the caller must then leave the
 * authored flights/landings untouched.
 *
 * `riserHeight` in the result is the ADJUSTED value (levelHeight / riserCount) so
 * the flight always reaches the top level exactly, mirroring
 * StairCreationController — the passed `stair.riserHeight` is treated as the
 * architect's TARGET, from which the integer riser count is chosen.
 */
export function deriveStairGeometry(stair: StairData, levelHeight: number): StairDerivedGeometry | null {
    if (stairHasAuthoredFlightGeometry(stair)) return null;

    const lh = levelHeight > 1e-6 ? levelHeight : stair.riserHeight * stair.riserCount;
    const totalRisers = Math.max(2, Math.round(lh / stair.riserHeight));
    const riserHeight = lh / totalRisers;

    const dir1 = normalizeXZ(stair.flights?.[0]?.direction ?? { x: 0, y: 0, z: 1 });
    const width = stair.width;
    const treadDepth = stair.treadDepth;

    // Flight split — honour stepsBeforeLanding when set, else even split.
    let before: number;
    if (stair.stepsBeforeLanding != null) {
        before = Math.max(1, Math.min(totalRisers - 1, stair.stepsBeforeLanding));
    } else {
        before = Math.floor(totalRisers / 2);
    }
    const after = totalRisers - before;

    let flights: StairFlight[];
    let landings: StairLanding[];

    switch (stair.shape) {
        case 'L': {
            // Left turn  → rotate dir1 by +90° about Y : (-z, 0, +x)
            // Right turn → rotate dir1 by -90° about Y : (+z, 0, -x)
            const d2 = stair.turnDirection === 'right'
                ? { x: dir1.z, y: 0, z: -dir1.x }
                : { x: -dir1.z, y: 0, z: dir1.x };
            flights = [
                { direction: dir1, riserCount: before },
                { direction: normalizeXZ(d2), riserCount: after },
            ];
            landings = [{ depth: width }];
            break;
        }
        case 'U': {
            const d2 = { x: -dir1.x, y: 0, z: -dir1.z };
            const perp = stair.secondRunSide === 'right'
                ? { x: dir1.z, y: 0, z: -dir1.x }
                : { x: -dir1.z, y: 0, z: dir1.x };
            const p = normalizeXZ(perp);
            // Mirrors StairCreationController.buildUShapeSecondFlightStart:
            //   forward = before·treadDepth + treadDepth,  lateral = width.
            const forward = before * treadDepth + treadDepth;
            const secondStart: Vec3 = {
                x: stair.startPosition.x + dir1.x * forward + p.x * width,
                y: stair.startPosition.y,
                z: stair.startPosition.z + dir1.z * forward + p.z * width,
            };
            flights = [
                { direction: dir1, riserCount: before },
                { direction: d2, riserCount: after, startOverride: secondStart },
            ];
            landings = [{ depth: 2 * width }];
            break;
        }
        case 'I':
        default:
            // I / spiral / winder: single-flight approximation (matches
            // ChangeStairShapeCommand's default branch).
            flights = [{ direction: dir1, riserCount: totalRisers }];
            landings = [];
    }

    return { flights, landings, riserCount: totalRisers, riserHeight };
}

/**
 * True when `derived` differs from the stair's current derived fields enough to
 * warrant a store write (integer counts compared exactly; the float riserHeight
 * with a 0.1 mm epsilon; landing depths with a 0.1 mm epsilon). Lets the caller
 * skip a redundant store update (and its rebuild event) when a non-derived edit
 * left the derived geometry unchanged.
 */
export function stairDerivedGeometryDiffers(stair: StairData, derived: StairDerivedGeometry): boolean {
    const EPS = 1e-4;
    if (derived.riserCount !== stair.riserCount) return true;
    if (Math.abs(derived.riserHeight - stair.riserHeight) > EPS) return true;
    if (derived.flights.length !== (stair.flights?.length ?? 0)) return true;
    for (let i = 0; i < derived.flights.length; i++) {
        if (derived.flights[i].riserCount !== stair.flights?.[i]?.riserCount) return true;
    }
    if (derived.landings.length !== (stair.landings?.length ?? 0)) return true;
    for (let i = 0; i < derived.landings.length; i++) {
        if (Math.abs(derived.landings[i].depth - (stair.landings?.[i]?.depth ?? 0)) > EPS) return true;
    }
    return false;
}
