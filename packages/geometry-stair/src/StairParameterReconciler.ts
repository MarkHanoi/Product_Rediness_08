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

// ─── §FIX-STAIR-AUTHORED-PARAM-DEAF (L-63x) ──────────────────────────────────
//
// `deriveStairGeometry` returns null for PATH-AUTHORED stairs (every stair the
// stair-path tool creates carries per-flight `treadDepth` + landing `center`), so
// `GenerateStairGeometryCommand` skipped reconciliation ENTIRELY and rebuilt the
// mesh from unchanged fields. Two founder-reported defects fall out of that one
// all-or-nothing bail:
//
//   A. WIDTH edit does not fix the LANDING. `StairMeshBuilder` builds the landing
//      as `BoxGeometry(stair.width, t, landing.depth)` — the box's X axis reads the
//      LIVE width while its Z axis reads the CREATION-TIME `landings[i].depth`. On
//      an L stair those two are the same number by definition (a square landing),
//      so widening turned the landing rectangular, and flight 2's `startOverride`
//      (pinned half a landing past the corner) no longer met the resized landing.
//   B. TREAD DEPTH does not respond AT ALL. `StairMeshBuilder` line ~423 reads
//      `flight.treadDepth ?? stair.treadDepth`; the per-flight value is always
//      present on a path-authored stair, so the top-level `treadDepth` primitive
//      was structurally unreachable — the mesh rebuilt with identical geometry
//      (founder's console: same "17 risers", same shape, every time).
//
// The cure is to reconcile the fields that ARE functions of the primitives, while
// preserving what the architect actually drew (flight DIRECTIONS and the riser
// distribution across flights). A path-authored stair's layout is a forward chain:
//
//     flight run_i = riserCount_i × treadDepth_i
//     corner landing depth = width      (square, one per 90° corner)
//     switchback landing depth = 2·width
//     landing centre  = inbound flight end + inDir·(depth/2)
//     next flight start = landing centre + outDir·(depth/2)
//
// which is EXACTLY how `StairSolver2D._applyLandingConsumption` +
// `StairPathAdapter` built it (a 90° corner consumes width/2 from each adjacent
// segment). Re-running the chain from the primitives therefore reproduces the
// creation-time record byte-for-byte when nothing changed (idempotent), and moves
// landing + flights together and consistently when width or tread depth changes.
//
// Tread depth is honoured through the CONSERVED relation the solver established:
//
//     Σ (riserCount_i × treadDepth_i)  =  totalRisers × stair.treadDepth
//                                          − Σ landing consumption
//
// (`stair.treadDepth` is the drawn polyline's total length ÷ total steps, and each
// 90° landing consumes `width` of that length; switchbacks consume none). Scaling
// the per-flight treads to satisfy it keeps their relative proportions — so a
// deliberately uneven drawn L still looks like the drawn L — while making
// `stair.treadDepth` the single authoritative going. No `changedKeys` flag is
// needed: the relation already holds for every non-tread, non-width edit, so type /
// riser-height / properties edits reconcile to a scale factor of exactly 1 and
// change nothing.

/** Left-hand perpendicular of a horizontal direction — matches StairMeshBuilder's `perpDir`. */
function perpXZ(v: Vec3): Vec3 {
    return { x: -v.z, y: 0, z: v.x };
}

/** True when flight `i` and `i+1` run anti-parallel (a 180° switchback landing). */
function isSwitchbackAt(flights: readonly StairFlight[], i: number): boolean {
    const a = flights[i]?.direction;
    const b = flights[i + 1]?.direction;
    if (!a || !b) return false;
    const na = normalizeXZ(a);
    const nb = normalizeXZ(b);
    return na.x * nb.x + na.z * nb.z < -0.7;
}

/**
 * Re-derive the layout of a PATH-AUTHORED stair (`stairHasAuthoredFlightGeometry`
 * true) from its primitive parameters, preserving the drawn flight directions and
 * the per-flight riser distribution.
 *
 * Returns `{ flights, landings }` — `riserCount` / `riserHeight` are deliberately
 * NOT touched here: for a drawn stair the riser distribution across flights was
 * fitted to the polyline, and re-splitting it would discard the architect's intent.
 *
 * Returns `null` when the stair carries no flights (nothing to reconcile).
 */
export function reconcilePathAuthoredStairLayout(
    stair: StairData,
): Pick<StairDerivedGeometry, 'flights' | 'landings'> | null {
    const flights = stair.flights;
    if (!flights || flights.length === 0) return null;

    const width = stair.width;
    const dirs = flights.map(f => normalizeXZ(f.direction ?? { x: 0, y: 0, z: 1 }));

    // ── 1. Landing depths are a pure function of width ───────────────────────
    const landingCount = Math.min(stair.landings?.length ?? 0, Math.max(0, flights.length - 1));
    const landingDepths: number[] = [];
    let consumedByLandings = 0;
    for (let i = 0; i < landingCount; i++) {
        const switchback = isSwitchbackAt(flights, i);
        landingDepths.push(switchback ? 2 * width : width);
        // A 90° landing eats `width` of drawn travel length (width/2 either side);
        // a switchback landing sits perpendicular to both runs and eats none.
        consumedByLandings += switchback ? 0 : width;
    }

    // ── 2. Per-flight tread depths honour stair.treadDepth ───────────────────
    const currentTreads = flights.map(f => f.treadDepth ?? stair.treadDepth);
    const currentRun = flights.reduce((s, f, i) => s + f.riserCount * currentTreads[i], 0);
    const totalRisers = flights.reduce((s, f) => s + f.riserCount, 0);
    const targetRun = totalRisers * stair.treadDepth - consumedByLandings;
    const scale = currentRun > 1e-6 && targetRun > 1e-6 ? targetRun / currentRun : 1;
    const treads = currentTreads.map(t => t * scale);

    // ── 3. Forward-chain the flights and landings so they always meet ────────
    const outFlights: StairFlight[] = [];
    const outLandings: StairLanding[] = [];
    let pos: Vec3 = { ...stair.startPosition };

    for (let i = 0; i < flights.length; i++) {
        const f = flights[i];
        const dir = dirs[i];
        outFlights.push({
            ...f,
            direction: dir,
            treadDepth: treads[i],
            // Flight 0 is anchored by `startPosition`; every later flight is pinned.
            startOverride: i === 0 ? f.startOverride : { ...pos },
        });

        const run = f.riserCount * treads[i];
        pos = { x: pos.x + dir.x * run, y: pos.y, z: pos.z + dir.z * run };

        if (i < landingCount) {
            const depth = landingDepths[i];
            const existing = stair.landings![i];
            if (isSwitchbackAt(flights, i)) {
                // U-2: landing is lateral; the next run starts one tread forward and
                // one width across (StairPathAdapter's switchback startOverride).
                //
                // ⭐ §STAIR-SECOND-RUN-DIRECTION (L-10270) — THE SIDE IS READ, NOT
                // ASSUMED. This was `const p = perpXZ(dir)`, i.e. HARDCODED LEFT,
                // and it was the last straggler on an axis the rest of the family
                // already honours: `StairMeshBuilder` §STAIR-U-LANDING-SIDE (:573)
                // and `StairRailingBuilder` (:903) both mirror to the real side.
                // A right-folded U therefore had its return run re-chained to the
                // LEFT by any parameter edit — the run jumped across flight 1 when
                // the architect changed the width. (Path-authored U stairs are the
                // common case here: `StairPathAdapter:208` stamps
                // `secondRunSide ?? 'left'` regardless of what was drawn, so the
                // STAMP could not be trusted to fix it either.)
                //
                // The side is taken from the SIGN OF THE EXISTING LATERAL OFFSET —
                // the drawn truth, and the identical rule
                // `deriveStairSecondRunHandedness` states for the U case in
                // `StairSecondRunDirection.ts`. Only the SIGN is used, so a stale
                // magnitude (an un-reconciled width) cannot mislead it. Falls back
                // to the stamped `secondRunSide`, then to LEFT — so a legacy
                // left-folded stair reconciles byte-identically to before.
                const p = perpXZ(dir);
                const priorStart = flights[i + 1]?.startOverride;
                let sideSign = stair.secondRunSide === 'right' ? -1 : 1;
                if (priorStart) {
                    const lateral = (priorStart.x - pos.x) * p.x + (priorStart.z - pos.z) * p.z;
                    if (Math.abs(lateral) > 1e-4) sideSign = lateral > 0 ? 1 : -1;   // C73 §2.3 — 0.1 mm, METRES.
                }
                outLandings.push({ ...existing, depth, center: undefined });
                pos = {
                    x: pos.x + dir.x * treads[i] + p.x * width * sideSign,
                    y: pos.y,
                    z: pos.z + dir.z * treads[i] + p.z * width * sideSign,
                };
            } else {
                const center: Vec3 = {
                    x: pos.x + dir.x * (depth / 2),
                    y: existing?.center?.y ?? pos.y,
                    z: pos.z + dir.z * (depth / 2),
                };
                outLandings.push({ ...existing, depth, center });
                const next = dirs[i + 1] ?? dir;
                pos = {
                    x: center.x + next.x * (depth / 2),
                    y: pos.y,
                    z: center.z + next.z * (depth / 2),
                };
            }
        }
    }

    // Preserve any trailing landings we did not chain (defensive — never expected).
    for (let i = landingCount; i < (stair.landings?.length ?? 0); i++) {
        outLandings.push(stair.landings![i]);
    }

    return { flights: outFlights, landings: outLandings };
}

/**
 * True when `layout` differs from the stair's current flights/landings enough to
 * warrant a store write. Positions compared with a 0.1 mm epsilon.
 */
export function stairAuthoredLayoutDiffers(
    stair: StairData,
    layout: Pick<StairDerivedGeometry, 'flights' | 'landings'>,
): boolean {
    const EPS_M = 1e-4;   // C73 §2.3 — 0.1 mm, METRES: every quantity compared here (treadDepth, landing depth, override/centre x-z) is a model-space length.
    const near = (a: number | undefined, b: number | undefined): boolean =>
        Math.abs((a ?? 0) - (b ?? 0)) <= EPS_M;
    const nearVec = (a: Vec3 | undefined, b: Vec3 | undefined): boolean => {
        if (!a && !b) return true;
        if (!a || !b) return false;
        return near(a.x, b.x) && near(a.z, b.z);
    };

    if (layout.flights.length !== (stair.flights?.length ?? 0)) return true;
    for (let i = 0; i < layout.flights.length; i++) {
        const cur = stair.flights![i];
        if (!near(layout.flights[i].treadDepth, cur.treadDepth ?? stair.treadDepth)) return true;
        if (!nearVec(layout.flights[i].startOverride, cur.startOverride)) return true;
    }
    if (layout.landings.length !== (stair.landings?.length ?? 0)) return true;
    for (let i = 0; i < layout.landings.length; i++) {
        const cur = stair.landings![i];
        if (!near(layout.landings[i].depth, cur.depth)) return true;
        if (!nearVec(layout.landings[i].center, cur.center)) return true;
    }
    return false;
}

/**
 * True when `derived` differs from the stair's current derived fields enough to
 * warrant a store write (integer counts compared exactly; the float riserHeight
 * with a 0.1 mm epsilon; landing depths with a 0.1 mm epsilon). Lets the caller
 * skip a redundant store update (and its rebuild event) when a non-derived edit
 * left the derived geometry unchanged.
 */
export function stairDerivedGeometryDiffers(stair: StairData, derived: StairDerivedGeometry): boolean {
    const EPS_M = 1e-4;   // C73 §2.3 — 0.1 mm, METRES: riserHeight and landing depth are lengths.
    if (derived.riserCount !== stair.riserCount) return true;
    if (Math.abs(derived.riserHeight - stair.riserHeight) > EPS_M) return true;
    if (derived.flights.length !== (stair.flights?.length ?? 0)) return true;
    for (let i = 0; i < derived.flights.length; i++) {
        if (derived.flights[i].riserCount !== stair.flights?.[i]?.riserCount) return true;
    }
    if (derived.landings.length !== (stair.landings?.length ?? 0)) return true;
    for (let i = 0; i < derived.landings.length; i++) {
        if (Math.abs(derived.landings[i].depth - (stair.landings?.[i]?.depth ?? 0)) > EPS_M) return true;
    }
    return false;
}
