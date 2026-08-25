// shellArcs — ROUNDED PLAN CORNERS for the generated shell (§L-11130).
//
// THE GAP. The boundary-line tool has a Curved mode and PRYZM builds CURVED WALLS
// (`Wall.curve`, a quadratic Bézier — live in production). But a curved boundary
// reaches the generator as a DENSIFIED POLYLINE (`arcSegmentThroughMidpoint`), and
// the shell builders emit one STRAIGHT wall per ring edge — so a rounded corner
// came out as a fan of short facets, and the founder's photograph (rounded ends,
// one continuous curved wall) could not be built. He said it plainly: "we can
// definitely do curved walls — this is fully working on production."
//
// WHAT THIS DOES. Split the footprint ring into RUNS: straight edges stay straight;
// a maximal chain of short, gently-turning, same-sign edges is ONE ARC and becomes
// a single curved wall. Nothing here knows about corners, buildings or radii — it
// knows that a polyline approximating an arc has short edges and small consistent
// turns, and that a real corner of a rectangle is one sharp turn.
//
// ⭐ EVERY THRESHOLD IS RELATIVE TO THE RING ITSELF. "Short" is a fraction of the
// ring's LONGEST edge; "gentle" is a turn well below a right angle. A slight wobble
// on a long straight facade is not an arc (its edges are long); a genuine 90°
// corner is not an arc (its turn is sharp). The two named constants below are
// stated with their reasons and are not tuned to any case.
//
// THE CURVE. `Wall.curve` is a quadratic Bézier via `control`. For an arc the
// control is chosen so the curve PASSES THROUGH the polyline's middle vertex at
// t = 0.5 (control = 2·M − (A + B)/2) — an interpolating fit that keeps the wall
// on the drawn geometry to within ~1–2% radially for arcs up to a quarter turn,
// instead of the ~6% bulge of a tangent-intersection control.

export interface XZ { readonly x: number; readonly z: number }

export type ShellRun =
    | { readonly kind: 'line'; readonly a: XZ; readonly b: XZ }
    | {
          readonly kind: 'arc';
          readonly a: XZ;
          readonly b: XZ;
          /** Quadratic-Bézier control (world XZ). */
          readonly control: XZ;
          /** Tessellation count for `Wall.curve.segments` (≥ 4). */
          readonly segments: number;
          /** How many polyline chords the arc replaced — reported on the transcript. */
          readonly chords: number;
      };

/** An edge is "short" when it is at most this fraction of the ring's longest edge. */
export const ARC_SHORT_EDGE_FRACTION = 0.25;
/** A turn is "gentle" when it is at most this many degrees (a rectangle corner is 90°). */
export const ARC_MAX_TURN_DEG = 60;
/** A turn below this is collinear noise, not curvature. */
export const ARC_MIN_TURN_DEG = 1;

function turnDeg(p: XZ, q: XZ, r: XZ): number {
    const ax = q.x - p.x, az = q.z - p.z;
    const bx = r.x - q.x, bz = r.z - q.z;
    const cross = ax * bz - az * bx;
    const dot = ax * bx + az * bz;
    return (Math.atan2(cross, dot) * 180) / Math.PI; // signed
}

function len(a: XZ, b: XZ): number {
    return Math.hypot(b.x - a.x, b.z - a.z);
}

/**
 * Split a CLOSED ring (no repeated last vertex) into runs. Pure and deterministic.
 * A ring with fewer than 3 vertices returns straight edges only.
 */
export function splitRingIntoRuns(ring: ReadonlyArray<XZ>): ShellRun[] {
    const n = ring.length;
    if (n < 3) {
        const out: ShellRun[] = [];
        for (let i = 0; i < n; i++) out.push({ kind: 'line', a: ring[i]!, b: ring[(i + 1) % n]! });
        return out;
    }
    let longest = 0;
    for (let i = 0; i < n; i++) longest = Math.max(longest, len(ring[i]!, ring[(i + 1) % n]!));
    const shortMax = longest * ARC_SHORT_EDGE_FRACTION;

    // Flag each vertex as ARC-INTERIOR: gentle, non-zero turn AND at least one short
    // adjacent edge (the arc's first/last vertex sits between a long straight edge
    // and a short chord, and must still be flagged so the arc starts on the tangent).
    const turns = new Array<number>(n);
    const flagged = new Array<boolean>(n).fill(false);
    for (let i = 0; i < n; i++) {
        const p = ring[(i - 1 + n) % n]!, q = ring[i]!, r = ring[(i + 1) % n]!;
        const t = turnDeg(p, q, r);
        turns[i] = t;
        const gentle = Math.abs(t) >= ARC_MIN_TURN_DEG && Math.abs(t) <= ARC_MAX_TURN_DEG;
        const shortNeighbour = len(p, q) <= shortMax || len(q, r) <= shortMax;
        flagged[i] = gentle && shortNeighbour;
    }

    // Walk the ring from a vertex that is NOT flagged (a straight-run corner), so no
    // arc is split by the array's wrap-around. If EVERY vertex is flagged the ring is
    // one closed curve; treat it as straight edges (a circle-shaped shell is out of
    // scope here and must not become one degenerate Bézier).
    let start = flagged.findIndex((f) => !f);
    if (start < 0) {
        const out: ShellRun[] = [];
        for (let i = 0; i < n; i++) out.push({ kind: 'line', a: ring[i]!, b: ring[(i + 1) % n]! });
        return out;
    }

    const runs: ShellRun[] = [];
    let i = start;
    let visited = 0;
    while (visited < n) {
        const cur = ring[i]!;
        const next = (i + 1) % n;
        if (!flagged[next]) {
            runs.push({ kind: 'line', a: cur, b: ring[next]! });
            i = next;
            visited++;
            continue;
        }
        // An arc begins at `cur` (the last straight vertex) — but only if `cur`'s
        // OUTGOING edge is short; otherwise the arc begins at `next` itself.
        const arcStartIdx = len(cur, ring[next]!) <= shortMax ? i : next;
        if (arcStartIdx === next) {
            runs.push({ kind: 'line', a: cur, b: ring[next]! });
            visited++;
        }
        // Collect consecutive flagged vertices with the SAME turn sign.
        const sign = Math.sign(turns[next]!);
        let j = next;
        let count = 0;
        // ⛔ A LONG EDGE ENDS THE ARC. Two rounded corners joined by a straight facade
        // are two arcs, not one: the straight edge between them is long, so the walk
        // stops there even though the next corner's first vertex is flagged too.
        while (
            flagged[(j + 1) % n] &&
            Math.sign(turns[(j + 1) % n]!) === sign &&
            len(ring[j]!, ring[(j + 1) % n]!) <= shortMax &&
            count < n
        ) {
            j = (j + 1) % n;
            count++;
        }
        // The arc spans arcStartIdx → the vertex AFTER the last flagged one (its
        // outgoing edge is the last chord), unless that edge is long — then it ends
        // at the last flagged vertex.
        const lastFlagged = j;
        const after = (lastFlagged + 1) % n;
        const arcEndIdx = len(ring[lastFlagged]!, ring[after]!) <= shortMax ? after : lastFlagged;
        const chordCount = ((arcEndIdx - arcStartIdx + n) % n);
        if (chordCount >= 2) {
            const a = ring[arcStartIdx]!;
            const b = ring[arcEndIdx]!;
            const midIdx = (arcStartIdx + Math.floor(chordCount / 2)) % n;
            const m = ring[midIdx]!;
            const control: XZ = { x: 2 * m.x - (a.x + b.x) / 2, z: 2 * m.z - (a.z + b.z) / 2 };
            runs.push({ kind: 'arc', a, b, control, segments: Math.max(8, chordCount * 2), chords: chordCount });
            i = arcEndIdx;
            // `visited` counts EDGES consumed: lines pushed + chords inside arcs.
            visited = runs.reduce((acc, r) => acc + (r.kind === 'line' ? 1 : r.chords), 0);
            continue;
        }
        // Fewer than 2 chords: not an arc — emit straight edges and move on.
        runs.push({ kind: 'line', a: ring[arcStartIdx]!, b: ring[(arcStartIdx + 1) % n]! });
        i = (arcStartIdx + 1) % n;
        visited = runs.reduce((acc, r) => acc + (r.kind === 'line' ? 1 : r.chords), 0);
    }
    return runs;
}
