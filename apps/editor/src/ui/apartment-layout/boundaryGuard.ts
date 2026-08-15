// Apartment Layout — §L-907A-BOUNDARY-GUARD (2026-08-14, lane L-GENBOUNDARYv2).
//
// Executor-side chokepoint for L-907(a): a plan whose interior walls fall
// OUTSIDE the captured site boundary must surface a NAMED, user-visible finding
// (or a refusal) — never build silently. The generator-side fix (the strip
// slicer's inscribed-rectangle honesty) makes this rare; this guard covers
// EVERY path into the executor (AI relay, D-TGL, procedural, hand-built
// options), because the executor is the one place all of them converge.
//
// PURE: chains the shell wall baselines into a perimeter ring (same 50 mm
// endpoint band as ai-host's `wallsToPolygon` — deliberately NOT imported: the
// `@pryzm/ai-host` root barrel drags runtime modules that break plain-Node
// tests, see layoutCardModel.ts header), then tests each planned wall's
// endpoints + midpoint against the ring with a small outward tolerance.
// Three-state result (C75 §1.4): 'inside' / 'outside' / 'unmeasurable' — an
// unclosed perimeter refuses to claim either way.
//
// The one import is `@pryzm/geometry-kernel`'s canonical point-in-polygon
// (C73 §3.1). The header used to say "ZERO imports" and this file carried its
// own even-odd ray cast; that made it the 52nd rival body of a predicate the
// kernel already owns. The kernel is PURE (no THREE, no DOM, no I/O) so it
// costs the plain-Node test path nothing — the barrel this file must avoid is
// ai-host's, not the kernel's. `matchDetectedRooms.ts`, in this same
// directory, already imports it.

import { pointInPolygonXZ } from '@pryzm/geometry-kernel';

export interface GuardShellSeg {
    readonly start: { readonly x: number; readonly z: number };
    readonly end: { readonly x: number; readonly z: number };
}

/** A planned layout wall in the emitted mm/{x,y} plan convention. */
export interface GuardPlannedWall {
    readonly start: { readonly x: number; readonly y: number };
    readonly end: { readonly x: number; readonly y: number };
    readonly isExternal?: boolean;
}

export type BoundaryCheck =
    | { readonly kind: 'inside'; readonly total: number }
    | {
        readonly kind: 'outside';
        readonly total: number;
        /** Planned INTERIOR walls with ≥1 sample point outside the boundary. */
        readonly outsideWallCount: number;
        /** Sample points tested (endpoints + midpoint per wall). */
        readonly samplesTotal: number;
        readonly samplesOutside: number;
    }
    | {
        readonly kind: 'unmeasurable';
        readonly total: number;
        /** Why the boundary could not be established (e.g. perimeter did not
         *  close). NOT a pass — the caller must say so, not stay silent. */
        readonly reason: string;
    };

/**
 * Shell-chaining endpoint BAND — 50 mm, metres. A DOMAIN BAND under this
 * module's own ownership (C73 §2.1), NOT a numeric epsilon, and deliberately
 * not named one.
 *
 * It was called `CHAIN_EPS_M`, which claimed a generality it does not have.
 * The question it answers is "did the generator author these two shell
 * baselines as meeting?", and the band exists to absorb the authored-endpoint
 * slop of `wallsToPolygon`, whose 50 mm convention it mirrors exactly. That is
 * not the kernel's `COINCIDENT_M` question: `COINCIDENT_M` is 1 mm and means
 * "these are THE SAME POINT in the model", and 50 mm is fifty times that — in
 * a model whose thinnest wall layer is ~12 mm you cannot call two points 50 mm
 * apart the same place. `tolerance.ts`'s own header names the 0.05 m family as
 * domain bands and says in terms: do NOT fold them onto `COINCIDENT_M`.
 *
 * So this does NOT migrate onto a kernel role, and the value does NOT move.
 * Adopting `COINCIDENT_M` here would TIGHTEN the band 50×, perimeters that
 * close today would stop closing, and `checkPlannedWallsInsideBoundary` would
 * return 'unmeasurable' on ordinary plans — a silent behaviour change shipped
 * as a tidy-up, which is the one thing C73 forbids.
 */
const CHAIN_ENDPOINT_BAND_M = 0.05;

const near = (a: { x: number; z: number }, b: { x: number; z: number }): boolean =>
    Math.hypot(a.x - b.x, a.z - b.z) < CHAIN_ENDPOINT_BAND_M;

/** Chain shell wall baselines into an ordered ring (greedy walk over shared
 *  endpoints). Returns null when the segments do not close into a ring of ≥3
 *  vertices — the honest "cannot measure" arm. */
export function chainShellPerimeter(
    segs: readonly GuardShellSeg[],
): Array<{ x: number; z: number }> | null {
    if (segs.length < 3) return null;
    const pool = segs.map(s => ({ a: s.start, b: s.end, used: false }));
    pool[0]!.used = true;
    const ring: Array<{ x: number; z: number }> = [pool[0]!.a, pool[0]!.b];
    let tail = pool[0]!.b;
    let closed = false;
    for (let guard = 0; guard < pool.length + 1; guard++) {
        let advanced = false;
        for (const s of pool) {
            if (s.used) continue;
            if (near(s.a, tail)) { ring.push(s.b); tail = s.b; s.used = true; advanced = true; break; }
            if (near(s.b, tail)) { ring.push(s.a); tail = s.a; s.used = true; advanced = true; break; }
        }
        if (!advanced) break;
        if (near(tail, ring[0]!)) { ring.pop(); closed = true; break; }
    }
    return closed && ring.length >= 3 ? ring : null;
}

function distToRing(
    pt: { x: number; z: number },
    ring: ReadonlyArray<{ x: number; z: number }>,
): number {
    let best = Infinity;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
        const dx = b.x - a.x, dz = b.z - a.z;
        const L2 = dx * dx + dz * dz;
        const t = L2 > 0 ? Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.z - a.z) * dz) / L2)) : 0;
        const px = a.x + t * dx, pz = a.z + t * dz;
        best = Math.min(best, Math.hypot(pt.x - px, pt.z - pz));
    }
    return best;
}

/**
 * Test every planned INTERIOR wall (endpoints + midpoint, mm plan frame)
 * against the captured boundary (shell baselines, world metres). A point
 * counts INSIDE when it is in the ring OR within `tolM` of its edge (the
 * partition-meets-shell case). External/shell walls in `planned` are skipped —
 * they ARE the boundary.
 */
export function checkPlannedWallsInsideBoundary(
    planned: readonly GuardPlannedWall[],
    shellSegs: readonly GuardShellSeg[],
    tolM = 0.15,
): BoundaryCheck {
    const interior = planned.filter(w => !w.isExternal);
    const ring = chainShellPerimeter(shellSegs);
    if (!ring) {
        return {
            kind: 'unmeasurable',
            total: interior.length,
            reason: `the ${shellSegs.length} captured shell wall(s) do not chain into a closed perimeter — boundary containment was NOT verified`,
        };
    }
    let samplesTotal = 0, samplesOutside = 0, outsideWallCount = 0;
    for (const w of interior) {
        const pts = [
            { x: w.start.x / 1000, z: w.start.y / 1000 },
            { x: w.end.x / 1000, z: w.end.y / 1000 },
            { x: (w.start.x + w.end.x) / 2000, z: (w.start.y + w.end.y) / 2000 },
        ];
        let wallOutside = false;
        for (const p of pts) {
            samplesTotal++;
            if (!pointInPolygonXZ(p.x, p.z, ring) && distToRing(p, ring) > tolM) {
                samplesOutside++;
                wallOutside = true;
            }
        }
        if (wallOutside) outsideWallCount++;
    }
    return samplesOutside > 0
        ? { kind: 'outside', total: interior.length, outsideWallCount, samplesTotal, samplesOutside }
        : { kind: 'inside', total: interior.length };
}

/** The NAMED user-visible finding for the 'outside' arm (L-907a: "named
 *  user-visible finding or refusal, never silent"). Null on 'inside'. */
export function boundaryFindingMessage(check: BoundaryCheck): string | null {
    if (check.kind === 'inside') return null;
    if (check.kind === 'unmeasurable') {
        return `Boundary check not possible: ${check.reason}. The layout was built anyway — verify it against the site boundary.`;
    }
    return (
        `Layout breaches the captured site boundary: ${check.outsideWallCount} of ${check.total} ` +
        `planned interior walls fall outside it (${check.samplesOutside}/${check.samplesTotal} sample points). ` +
        `The plan was made on a region larger than the real footprint (L-907a) — review before accepting.`
    );
}

/**
 * §L-907b — the RESULT ≠ PROPOSAL divergence as a USER-VISIBLE report with
 * BOTH numbers (a diagnostic console line is not a report — §15.7 lesson 1).
 * Returns null only when detected === expected (no divergence). A negative
 * `detected` means the room store could not be read — reported as NOT
 * MEASURED, never as success (C70 §2.2).
 */
export function roomCountDivergenceMessage(detected: number, expected: number): string | null {
    if (detected === expected) return null;
    if (detected < 0) {
        return `Built rooms could not be counted (room store unavailable) — the result was NOT verified against the ${expected}-room plan you chose.`;
    }
    if (detected < expected) {
        return `The built layout differs from the plan you chose: ${detected} rooms detected vs ${expected} planned — open-plan rooms may have merged (boundary lines not splitting).`;
    }
    return `The built layout differs from the plan you chose: ${detected} rooms detected vs ${expected} planned — rooms may have fragmented.`;
}
