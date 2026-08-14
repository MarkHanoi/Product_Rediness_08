// Apartment Layout — §L-907A-BOUNDARY-GUARD (2026-08-14, lane L-GENBOUNDARYv2).
//
// Executor-side chokepoint for L-907(a): a plan whose interior walls fall
// OUTSIDE the captured site boundary must surface a NAMED, user-visible finding
// (or a refusal) — never build silently. The generator-side fix (the strip
// slicer's inscribed-rectangle honesty) makes this rare; this guard covers
// EVERY path into the executor (AI relay, D-TGL, procedural, hand-built
// options), because the executor is the one place all of them converge.
//
// PURE + ZERO imports: chains the shell wall baselines into a perimeter ring
// (same 50 mm endpoint tolerance as ai-host's `wallsToPolygon` — deliberately
// NOT imported: the `@pryzm/ai-host` root barrel drags runtime modules that
// break plain-Node tests, see layoutCardModel.ts header), then tests each
// planned wall's endpoints + midpoint against the ring with a small outward
// tolerance. Three-state result (C75 §1.4): 'inside' / 'outside' /
// 'unmeasurable' — an unclosed perimeter refuses to claim either way.

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

const CHAIN_EPS_M = 0.05;   // 50 mm endpoint-match tolerance (= wallsToPolygon)

const near = (a: { x: number; z: number }, b: { x: number; z: number }): boolean =>
    Math.hypot(a.x - b.x, a.z - b.z) < CHAIN_EPS_M;

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

function pointInRing(
    pt: { x: number; z: number },
    ring: ReadonlyArray<{ x: number; z: number }>,
): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i]!, b = ring[j]!;
        if ((a.z > pt.z) !== (b.z > pt.z) &&
            pt.x < ((b.x - a.x) * (pt.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
    }
    return inside;
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
            if (!pointInRing(p, ring) && distToRing(p, ring) > tolM) {
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
