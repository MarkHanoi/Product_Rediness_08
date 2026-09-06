// §HOUSE-SHELL-IS-ATOMIC (lane CREATE-HOUSE-IS-ATOMIC, L-13011 / L-13014) — the ADAPTER between
// a POLYGON and a WALL BASELINE, which are two different domains with two different tolerances.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ WHY A NEAR-ZERO EDGE IS LEGITIMATE INPUT, MEASURED — NOT ASSUMED
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `generateHouseFromBoundary` draws ONE wall per footprint edge. The footprint arrives from
// `solveTargetFootprintArea` → `insetPolygonPerEdge` (`@pryzm/site-parcel-data`, §INSET-ROUND-JOIN
// / L-586), which is THE erosion in this repo. Two tolerances meet here and they disagree by four
// orders of magnitude:
//
//   · `insetPolygon.ts` `COINCIDENT_EPS_M = 1e-6` — and its own comment records that widening it
//     to the kernel's 1 mm would be "forbidden, C73 §2.5/E4". So the erosion is CONTRACTUALLY
//     BARRED from deduping at anything near a wall's minimum length.
//   · `packages/schemas/src/elements/Wall.ts` refinement (1) — `MIN_WALL_LEN`, 0.05 m, because a
//     shorter baseline cannot clear the join resolver's minimum.
//
// MEASURED, by running the real erosion (lane probe, 2026-09-06). At a REFLEX vertex the mitre
// test fails and the round join emits `push(e) … arc … push(q)` — two points separated by
// `2·r·sin(θ/2)`, r = the inset, θ = the turn. For a 90° re-entrant corner the arc subdivides to
// 8 segments of `0.196·r` each:
//
//     notched plot, inset 0.15 m  →  14 vertices out of 6 in, EIGHT edges of 0.0294 m
//     shallow outward kink, inset 0.20 m  →  one edge of 0.0100 m
//     shallow outward kink, inset 1.00 m  →  one edge of 0.0500 m
//
// i.e. every uniform erosion under ~0.26 m across a 90° re-entrant corner, and much larger insets
// across a shallow one, produces sub-50 mm edges BY CONSTRUCTION. Re-entrant corners, party-wall
// steps and surveyed kinks are what real cadastral parcels are made of, and "fit ~120 m² inside
// the permitted footprint" is exactly the small-inset regime. So this is not a corrupt envelope
// and not a duplicated vertex: it is a VALID POLYGON that is not a valid set of wall baselines.
//
// ⛔ THEREFORE THE FIX IS A WELD, NOT A FILTER. Skipping a short EDGE would leave the shell open
// by up to 50 mm and ship a house with a hole in it. Merging the two vertices that are too close
// keeps the ring exactly closed and moves every corner by less than the wall minimum. The welded
// count and the area delta are REPORTED, never swallowed — see `WeldedFootprint.note`.
//
// ⛔ AND IT STILL REFUSES. A weld that drops the ring below 3 vertices, or that moves the enclosed
// area by more than the stated tolerance, is NOT surveyed micro-detail — it is a malformed
// footprint, and building a shell from it would be the silent-filter defect this module exists to
// avoid. Those refuse, with both numbers.
//
// PURE: no store, no DOM, no THREE, no I/O, no clock, no RNG. Deterministic. Never throws.

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.house.weldFootprintForWalls');

/** A footprint vertex on the level's XZ plane, metres. */
export interface WeldPoint { readonly x: number; readonly z: number }

/**
 * The wall-domain minimum baseline length, metres.
 *
 * ⚠ MIRRORS `packages/schemas/src/elements/Wall.ts` refinement (1) — deliberately re-stated rather
 * than imported, because L0 exports the SCHEMA, not the constant, and reaching into a Zod refine
 * to read a literal would be worse than a named copy with this comment on it. If that floor ever
 * moves, this is the second place.
 */
export const WALL_MIN_BASELINE_M = 0.05;

/**
 * How far the welded ring's enclosed area may move from the original before the weld is treated as
 * evidence of a malformed footprint rather than of surveyed density. The looser of 0.5 m² and 1 %
 * — a fixed epsilon would be absurd on a 4,000 m² block and meaningless on a 20 m² plot.
 */
function areaToleranceM2(areaM2: number): number {
    return Math.max(0.5, areaM2 * 0.01);
}

export interface WeldedFootprint {
    readonly ok: true;
    /** The OPEN ring to draw walls from. Every edge is ≥ `WALL_MIN_BASELINE_M`. */
    readonly ring: readonly WeldPoint[];
    /** How many vertices the weld removed. `0` means the input was already wall-legal. */
    readonly weldedCount: number;
    readonly minEdgeBeforeM: number;
    readonly minEdgeAfterM: number;
    readonly areaBeforeM2: number;
    readonly areaAfterM2: number;
    /**
     * A sentence naming what was welded and why — `null` when nothing was. ⛔ NON-NULL MEANS THE
     * CALLER MUST SAY SO. The whole point of welding rather than filtering is that the user is
     * told the perimeter was simplified, and by how much.
     */
    readonly note: string | null;
}

export interface WeldRefusal {
    readonly ok: false;
    readonly reason: string;
    /** ⛔ Names both numbers wherever two decided it. */
    readonly statement: string;
}

export type WeldResult = WeldedFootprint | WeldRefusal;

function dist(a: WeldPoint, b: WeldPoint): number {
    return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Shoelace area of an OPEN ring on XZ, absolute so winding does not decide it. */
function ringAreaM2(ring: readonly WeldPoint[]): number {
    if (ring.length < 3) return 0;
    let twice = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        twice += a.x * b.z - b.x * a.z;
    }
    return Math.abs(twice) / 2;
}

/** The shortest edge of the OPEN ring, walked exactly as the shell generator walks it. */
function minEdgeM(ring: readonly WeldPoint[]): number {
    if (ring.length < 2) return 0;
    let min = Infinity;
    for (let i = 0; i < ring.length; i++) {
        min = Math.min(min, dist(ring[i]!, ring[(i + 1) % ring.length]!));
    }
    return min;
}

const r2 = (v: number): string => (Math.round(v * 100) / 100).toFixed(2);
const r3 = (v: number): string => (Math.round(v * 1000) / 1000).toFixed(3);

/**
 * Merge footprint vertices that sit closer together than a wall baseline may be, so every edge of
 * the returned ring can legally become a wall. Pure; total; never throws.
 *
 * @param ring    an OPEN footprint ring (the closing edge last→first is implied)
 * @param minLenM the wall-domain minimum; defaults to `WALL_MIN_BASELINE_M`
 */
export function weldFootprintForWalls(
    ring: readonly WeldPoint[] | null | undefined,
    minLenM: number = WALL_MIN_BASELINE_M,
): WeldResult {
    const span = _tracer.startSpan('pryzm.house.weldFootprintForWalls');
    try {
        const input = Array.isArray(ring) ? ring.filter(
            (p) => p != null && Number.isFinite(p.x) && Number.isFinite(p.z),
        ) : [];
        if (input.length !== (ring?.length ?? 0)) {
            span.setAttribute('pryzm.weld.refusal', 'non-finite-vertex');
            return {
                ok: false,
                reason: 'non-finite-vertex',
                statement:
                    `The footprint contains ${(ring?.length ?? 0) - input.length} vertex/vertices that are `
                    + 'not finite numbers. PRYZM will not draw a shell from a ring it cannot measure. '
                    + 'Nothing has been created.',
            };
        }
        if (input.length < 3) {
            span.setAttribute('pryzm.weld.refusal', 'too-few-vertices');
            return {
                ok: false,
                reason: 'too-few-vertices',
                statement:
                    `The footprint has ${input.length} vertices. A closed shell needs at least 3. `
                    + 'Nothing has been created.',
            };
        }

        const areaBeforeM2 = ringAreaM2(input);
        const minEdgeBeforeM = minEdgeM(input);

        // ── The weld. Greedy forward: keep a vertex only when it clears `minLenM` from the last
        //    one KEPT, so a run of micro-steps collapses to a single corner rather than to a chain
        //    of still-too-short ones. Then fold the wrap, because the closing edge is an edge.
        const kept: WeldPoint[] = [{ x: input[0]!.x, z: input[0]!.z }];
        for (let i = 1; i < input.length; i++) {
            const p = input[i]!;
            if (dist(p, kept[kept.length - 1]!) < minLenM) continue;
            kept.push({ x: p.x, z: p.z });
        }
        while (kept.length >= 3 && dist(kept[kept.length - 1]!, kept[0]!) < minLenM) kept.pop();

        const weldedCount = input.length - kept.length;

        if (kept.length < 3) {
            span.setAttribute('pryzm.weld.refusal', 'collapsed-by-weld');
            return {
                ok: false,
                reason: 'collapsed-by-weld',
                statement:
                    `This footprint's ${input.length} vertices collapse to ${kept.length} once vertices `
                    + `closer than ${r3(minLenM)} m are merged — too few to close a shell. A ring that `
                    + 'small is a defect in the envelope, not a small house. Nothing has been created.',
            };
        }

        const areaAfterM2 = ringAreaM2(kept);
        const minEdgeAfterM = minEdgeM(kept);
        const tol = areaToleranceM2(areaBeforeM2);
        const delta = Math.abs(areaAfterM2 - areaBeforeM2);
        if (delta > tol) {
            span.setAttribute('pryzm.weld.refusal', 'weld-moved-the-area');
            return {
                ok: false,
                reason: 'weld-moved-the-area',
                statement:
                    `Merging the ${weldedCount} footprint vertices that sit closer than ${r3(minLenM)} m `
                    + `apart moved the enclosed area from ${r2(areaBeforeM2)} m² to ${r2(areaAfterM2)} m² `
                    + `— a change of ${r2(delta)} m², beyond the ${r2(tol)} m² this is allowed to move. `
                    + 'That is not surveyed detail being tidied up; it means the footprint itself is '
                    + 'malformed, and a shell drawn from it would not be the shape you drew. Nothing has '
                    + 'been created.',
            };
        }

        // ⛔ Belt and braces. If the weld somehow left a short edge, say so rather than handing the
        // caller a ring that `wall.batch.create` will reject — the whole point is that the caller
        // never learns about this floor from a schema error.
        if (minEdgeAfterM < minLenM) {
            span.setAttribute('pryzm.weld.refusal', 'still-degenerate');
            return {
                ok: false,
                reason: 'still-degenerate',
                statement:
                    `After merging, the shortest footprint edge is still ${r3(minEdgeAfterM)} m, under the `
                    + `${r3(minLenM)} m a wall baseline requires. PRYZM will not draw a shell it knows is `
                    + 'invalid. Nothing has been created.',
            };
        }

        span.setAttribute('pryzm.weld.welded', weldedCount);
        span.setAttribute('pryzm.weld.minEdgeAfterM', minEdgeAfterM);
        return {
            ok: true,
            ring: kept,
            weldedCount,
            minEdgeBeforeM,
            minEdgeAfterM,
            areaBeforeM2,
            areaAfterM2,
            note: weldedCount === 0 ? null : (
                `The footprint's perimeter was simplified before drawing: ${weldedCount} vertex`
                + `${weldedCount === 1 ? '' : 'es'} sat closer than ${r3(minLenM)} m to its neighbour `
                + `(shortest gap ${r3(minEdgeBeforeM)} m) and were merged, because a wall baseline shorter `
                + `than ${r3(minLenM)} m cannot be built. The enclosed area moved from `
                + `${r2(areaBeforeM2)} m² to ${r2(areaAfterM2)} m². Your level envelope is unchanged — `
                + 'this simplification applies only to the walls that were drawn.'
            ),
        };
    } finally {
        span.end();
    }
}
