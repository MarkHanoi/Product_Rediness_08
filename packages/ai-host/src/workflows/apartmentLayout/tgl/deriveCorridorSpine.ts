// §SPINE-FIRST P1 (ADR-0073 HAG, founder "must work for ANY layout", 2026-06-21) — derive the
// corridor SPINE from the FOOTPRINT, before any room packing. This is the inversion the
// GENERATIVE-ROBUSTNESS-STEPBACK audit calls for: circulation is a DRIVER (derived first from the
// shell's long axis + anchored to the stair/entry), not a side effect of area packing.
//
// PURE + deterministic (ADR-0061): NO geometry/THREE/DOM, NO RNG, NO Date.now. Metres, world XZ.
// The output is a set of centre-line SEGMENTS (+ a width) — straight for a rectangle, an L/T when a
// leg must reach an edge stair. P2 (`packRoomsAlongSpine`) consumes this to band rooms off the spine.
//
// The deriver is intentionally shape-general: the long-axis chord is computed by intersecting a line
// through the shell's cross-centre with the (convex) shell polygon, so it adapts to skewed quads and
// non-axis-aligned plates — exactly the layouts the area-first packer fails on.

import type { Pt, Rect } from './rectDecomposition.js';
import { decomposeToRects } from './rectDecomposition.js';

/** One centre-line segment of the spine (metres, world XZ). */
export interface SpineSegment { readonly a: Pt; readonly b: Pt }

/** A derived corridor spine: ordered centre-line segments + the corridor width. */
export interface SpinePath {
    /** ≥1 segment. segments[0] is the primary long-axis run; later segments are legs (to the stair). */
    readonly segments: readonly SpineSegment[];
    readonly widthM: number;
    /** 'x' ⇒ the primary run is horizontal (long axis = x); 'z' ⇒ vertical. */
    readonly primaryAxis: 'x' | 'z';
}

export interface DeriveSpineOptions {
    /** Corridor width (m). Default 1.2 (the walkable minimum the carve uses). */
    readonly widthM?: number;
    /** Inset (m) of the primary run from the shell wall at each end. Default 0.3. */
    readonly endMarginM?: number;
    /** Stair keep-out rect; when the primary run doesn't reach it, a perpendicular leg is added. */
    readonly stairKeepOut?: Rect;
    /** Front-door / entry anchor (perimeter). Used to orient the primary run toward the entry end. */
    readonly entry?: Pt;
}

const EPS = 1e-6;
const DOOR_W = 0.8;

const bboxOf = (poly: readonly Pt[]): Rect => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of poly) {
        if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
        if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z;
    }
    return { x0, z0, x1, z1 };
};

/** x-range where the horizontal line z=zc crosses the polygon boundary (min,max), or null. */
function horizontalChord(poly: readonly Pt[], zc: number): readonly [number, number] | null {
    const xs: number[] = [];
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
        const zlo = Math.min(a.z, b.z), zhi = Math.max(a.z, b.z);
        if (zc < zlo - EPS || zc > zhi + EPS) continue;
        if (Math.abs(b.z - a.z) < EPS) { xs.push(a.x, b.x); continue; }   // edge lies on the line
        const t = (zc - a.z) / (b.z - a.z);
        xs.push(a.x + t * (b.x - a.x));
    }
    if (xs.length < 2) return null;
    return [Math.min(...xs), Math.max(...xs)];
}

/** z-range where the vertical line x=xc crosses the polygon boundary (min,max), or null. */
function verticalChord(poly: readonly Pt[], xc: number): readonly [number, number] | null {
    const zs: number[] = [];
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
        const xlo = Math.min(a.x, b.x), xhi = Math.max(a.x, b.x);
        if (xc < xlo - EPS || xc > xhi + EPS) continue;
        if (Math.abs(b.x - a.x) < EPS) { zs.push(a.z, b.z); continue; }
        const t = (xc - a.x) / (b.x - a.x);
        zs.push(a.z + t * (b.z - a.z));
    }
    if (zs.length < 2) return null;
    return [Math.min(...zs), Math.max(...zs)];
}

// ── §SPINE-CONCAVE-ARMS (founder "I never saw a corridor branch on an L/T/U shape really
//    connecting all required rooms", 2026-06-28) ─────────────────────────────────────────
//
// On a CONCAVE axis-rectilinear shell (an L/T/U/cross footprint) the bbox-centre chord this
// deriver uses for a convex shell can run THROUGH THE NOTCH (outside the building) or sit in
// ONE ARM only, so the straight primary run never traverses the perpendicular arm. The spine
// stays a single I-run and every room banded off the un-traversed arm lands in the notch (it
// clips away → SEALED / unreachable, the founder's red graph). The cure: build the spine as a
// BRANCHING centre-line that runs through EVERY arm of the shell, so a corridor cell abuts each
// arm's rooms by construction. We reuse the engine's notch-aware slab decomposition
// (`decomposeToRects`) to split the shell into its arm rects, then connect each arm's centre-line
// into a spanning corridor (dominant arm = primary run; every other arm joined by a short
// connector leg at the shared edge → a real L/T/branching spine). Pure + deterministic.

/** True iff every edge of `poly` is horizontal or vertical (an axis L/U/T/cross — the shells the
 *  notch-aware `decomposeToRects` tiles exactly). A diagonal edge ⇒ false (the convex/sheared path). */
function isAxisRectilinear(poly: readonly Pt[]): boolean {
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
        if (Math.abs(a.x - b.x) > 1e-6 && Math.abs(a.z - b.z) > 1e-6) return false;
    }
    return true;
}

/** True iff `poly` has ≥1 reflex (interior-angle > 180°) vertex — a genuine concavity (notch). */
function hasReflexVertex(poly: readonly Pt[]): boolean {
    const n = poly.length;
    if (n < 4) return false;
    let area2 = 0;
    for (let i = 0; i < n; i++) { const p = poly[i]!, q = poly[(i + 1) % n]!; area2 += p.x * q.z - q.x * p.z; }
    const ccw = area2 >= 0;
    for (let i = 0; i < n; i++) {
        const a = poly[(i - 1 + n) % n]!, b = poly[i]!, c = poly[(i + 1) % n]!;
        const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
        if (Math.abs(cross) < EPS) continue;
        if (ccw ? cross < 0 : cross > 0) return true;
    }
    return false;
}

const rectArea = (r: Rect): number => Math.max(0, r.x1 - r.x0) * Math.max(0, r.z1 - r.z0);
const rectLongAxis = (r: Rect): 'x' | 'z' => (r.x1 - r.x0) >= (r.z1 - r.z0) ? 'x' : 'z';

/** The centre-line segment of an arm rect along its LONG axis, inset `margin` from each end so it
 *  stays clear of the shell wall. Returns null for a degenerate arm. */
function armCentreLine(r: Rect, margin: number): SpineSegment | null {
    if (rectLongAxis(r) === 'x') {
        const zc = (r.z0 + r.z1) / 2;
        const xL = r.x0 + margin, xR = r.x1 - margin;
        if (xR - xL < EPS) return null;
        return { a: { x: xL, z: zc }, b: { x: xR, z: zc } };
    }
    const xc = (r.x0 + r.x1) / 2;
    const zL = r.z0 + margin, zR = r.z1 - margin;
    if (zR - zL < EPS) return null;
    return { a: { x: xc, z: zL }, b: { x: xc, z: zR } };
}

/**
 * §SPINE-CONCAVE-ARMS — the corridor centre-line for a secondary arm, run along its LONG axis but
 * OFFSET toward the edge it shares with `host` (the junction), so the arm's full remaining depth is a
 * single band on the façade side. The offset = half the corridor width + the end margin, off the
 * host-shared edge. Falls back to the plain centre line when the arm is too shallow to host the
 * offset band (so a thin arm still gets a corridor, just centred). Pure.
 */
function armCentreLineHuggingHost(arm: Rect, host: Rect, widthM: number, margin: number): SpineSegment | null {
    const longAxis = rectLongAxis(arm);
    const off = widthM / 2 + margin;
    // Which side of the arm faces the host? Compare the shared edge.
    if (longAxis === 'x') {
        // Corridor runs horizontally (constant z). Offset z toward the host (above or below).
        const hostAbove = (host.z0 + host.z1) / 2 >= (arm.z0 + arm.z1) / 2;
        const zc = hostAbove ? arm.z1 - off : arm.z0 + off;
        // Need at least a band of min depth on the far side; else centre it.
        if (zc <= arm.z0 + EPS || zc >= arm.z1 - EPS) return armCentreLine(arm, margin);
        const xL = arm.x0 + margin, xR = arm.x1 - margin;
        if (xR - xL < EPS) return null;
        return { a: { x: xL, z: zc }, b: { x: xR, z: zc } };
    }
    const hostRight = (host.x0 + host.x1) / 2 >= (arm.x0 + arm.x1) / 2;
    const xc = hostRight ? arm.x1 - off : arm.x0 + off;
    if (xc <= arm.x0 + EPS || xc >= arm.x1 - EPS) return armCentreLine(arm, margin);
    const zL = arm.z0 + margin, zR = arm.z1 - margin;
    if (zR - zL < EPS) return null;
    return { a: { x: xc, z: zL }, b: { x: xc, z: zR } };
}

/** Do two axis-aligned rects share a ≥`minM` edge (abut)? Used to know which arms connect. */
function armsAbut(a: Rect, b: Rect, minM: number): boolean {
    const vAbut = Math.abs(a.x1 - b.x0) < SNAP || Math.abs(b.x1 - a.x0) < SNAP;
    const zOv = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
    const hAbut = Math.abs(a.z1 - b.z0) < SNAP || Math.abs(b.z1 - a.z0) < SNAP;
    const xOv = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    return (vAbut && zOv >= minM) || (hAbut && xOv >= minM);
}

const SNAP = 0.05;

/**
 * §SPINE-CONCAVE-ARMS — build a BRANCHING corridor spine that traverses every arm of a concave
 * axis-rectilinear shell. Returns null when the shell decomposes to <2 usable arms (the convex/I
 * path is correct there) so the caller keeps the existing behaviour byte-identical on rectangles.
 *
 * Algorithm (deterministic): decompose into arm rects (largest-first); the dominant arm's
 * centre-line is the PRIMARY run; each remaining arm that abuts an already-connected arm contributes
 * its own centre-line PLUS a short connector segment from that centre-line to the shared edge of the
 * connected arm — so the union of corridor cells reaches into every arm and the segments form one
 * connected (tree) network. `stairKeepOut` / `entry` legs are still appended by the caller.
 */
function deriveConcaveArmSpine(shell: readonly Pt[], widthM: number, margin: number): SpinePath | null {
    const arms = decomposeToRects(shell)
        .filter(r => rectArea(r) > 1e-3)
        .sort((p, q) => rectArea(q) - rectArea(p) || p.x0 - q.x0 || p.z0 - q.z0);
    if (arms.length < 2) return null;

    const bb = bboxOf(shell);
    const primaryAxis: 'x' | 'z' = (bb.x1 - bb.x0) >= (bb.z1 - bb.z0) ? 'x' : 'z';

    // Each arm contributes ONE centre-line segment along its long axis; the segment is EXTENDED so it
    // reaches the host arm's centre-line, making the two perpendicular corridor strips OVERLAP at the
    // junction (a clean orthogonal L/T/+ — no diagonal connectors, no convoluted ring). Process arms
    // largest-first; an arm joins once it abuts an already-connected arm (chain over a few passes).
    interface ArmLine { rect: Rect; line: SpineSegment }
    const connected: ArmLine[] = [];

    const primaryLine = armCentreLine(arms[0]!, margin);
    if (!primaryLine) return null;
    connected.push({ rect: arms[0]!, line: primaryLine });

    const pending = arms.slice(1);
    for (let pass = 0; pass < arms.length && pending.length > 0; pass++) {
        let progressed = false;
        for (let i = 0; i < pending.length; i++) {
            const arm = pending[i]!;
            const host = connected.find(h => armsAbut(h.rect, arm, DOOR_W));
            if (!host) continue;
            // §SPINE-CONCAVE-ARMS — hug the secondary arm's corridor against the edge it SHARES with the
            // host, so the arm's FULL depth becomes ONE band against the façade (rooms keep a window AND a
            // corridor wall) instead of two thin centre-split bands (which over-subscribe the pack and
            // force a drop). The host-shared edge is the junction; offset the line a half-width + margin
            // off it. Falls back to the centre line when the arm is too shallow to host an offset band.
            const base = armCentreLineHuggingHost(arm, host.rect, widthM, margin);
            if (base) {
                // EXTEND the arm's centre-line toward the host centre-line so the two strips meet. The
                // host line is perpendicular; its constant coordinate is the target the arm extends to.
                const hostConst = Math.abs(host.line.a.x - host.line.b.x) < EPS ? host.line.a.x : host.line.a.z;
                const hostIsVertical = Math.abs(host.line.a.x - host.line.b.x) < EPS;
                let line = base;
                if (Math.abs(base.a.x - base.b.x) < EPS && hostIsVertical === false) {
                    // arm vertical, host horizontal ⇒ extend the arm's z toward host's z (=hostConst).
                    const z0 = Math.min(base.a.z, base.b.z, hostConst), z1 = Math.max(base.a.z, base.b.z, hostConst);
                    line = { a: { x: base.a.x, z: z0 }, b: { x: base.a.x, z: z1 } };
                } else if (Math.abs(base.a.z - base.b.z) < EPS && hostIsVertical === true) {
                    // arm horizontal, host vertical ⇒ extend the arm's x toward host's x (=hostConst).
                    const x0 = Math.min(base.a.x, base.b.x, hostConst), x1 = Math.max(base.a.x, base.b.x, hostConst);
                    line = { a: { x: x0, z: base.a.z }, b: { x: x1, z: base.a.z } };
                }
                // Clamp the extension into the shell bbox so it never leaves the building.
                line = {
                    a: { x: Math.min(Math.max(line.a.x, bb.x0), bb.x1), z: Math.min(Math.max(line.a.z, bb.z0), bb.z1) },
                    b: { x: Math.min(Math.max(line.b.x, bb.x0), bb.x1), z: Math.min(Math.max(line.b.z, bb.z0), bb.z1) },
                };
                connected.push({ rect: arm, line });
            } else {
                connected.push({ rect: arm, line: { a: { x: (arm.x0 + arm.x1) / 2, z: (arm.z0 + arm.z1) / 2 }, b: { x: (arm.x0 + arm.x1) / 2, z: (arm.z0 + arm.z1) / 2 } } });
            }
            pending.splice(i, 1);
            i -= 1;
            progressed = true;
        }
        if (!progressed) break;
    }
    if (connected.length < 2) return null;
    return { segments: connected.map(c => c.line), widthM, primaryAxis };
}

/**
 * Derive the corridor spine for a shell polygon. For a CONVEX (rectangle / sheared quad) shell the
 * primary run lies along the shell's LONG axis, centred on the short axis; a perpendicular leg is
 * added to reach an edge stair keep-out / the entry. For a CONCAVE axis-rectilinear shell (L/T/U/
 * cross) the spine BRANCHES through every arm (§SPINE-CONCAVE-ARMS) so a corridor cell abuts each
 * arm's rooms — no single straight run that strands a perpendicular arm. Pure + deterministic.
 *
 * Returns null only for a degenerate shell (no chord through the centre) — callers fall back to the
 * legacy carve.
 */
export function deriveCorridorSpine(
    shell: readonly Pt[],
    opts: DeriveSpineOptions = {},
): SpinePath | null {
    if (shell.length < 3) return null;
    const widthM = opts.widthM ?? 1.2;
    const margin = opts.endMarginM ?? 0.3;
    const bb = bboxOf(shell);
    const w = bb.x1 - bb.x0, d = bb.z1 - bb.z0;
    if (w < EPS || d < EPS) return null;

    // §SPINE-CONCAVE-ARMS — a concave axis-rectilinear (L/T/U/cross) shell gets a BRANCHING spine
    // that traverses every arm; the stair/entry legs are still appended below. A convex / sheared /
    // rectangular shell (no reflex vertex, or a diagonal edge) falls through to the straight run path
    // ⇒ byte-identical on every shape the existing tests cover.
    if (isAxisRectilinear(shell) && hasReflexVertex(shell)) {
        const armSpine = deriveConcaveArmSpine(shell, widthM, margin);
        if (armSpine) {
            const segments = [...armSpine.segments];
            // Reach the stair / entry from the (multi-segment) spine: route a leg from the spine
            // toward each anchor when no existing segment already passes within a door width.
            addStairLegToSpine(segments, armSpine.primaryAxis, widthM, opts.stairKeepOut);
            addEntryLegToSpine(segments, bb, opts.entry);
            return { segments, widthM, primaryAxis: armSpine.primaryAxis };
        }
        // armSpine null (single usable arm) ⇒ fall through to the straight run path below.
    }

    // Long axis = the longer bbox dimension. Primary run is centred on the SHORT axis.
    const primaryAxis: 'x' | 'z' = w >= d ? 'x' : 'z';
    const segments: SpineSegment[] = [];

    if (primaryAxis === 'x') {
        const zc = (bb.z0 + bb.z1) / 2;
        const chord = horizontalChord(shell, zc);
        if (!chord) return null;
        let [xL, xR] = chord;
        xL += margin; xR -= margin;
        if (xR - xL < EPS) return null;
        segments.push({ a: { x: xL, z: zc }, b: { x: xR, z: zc } });
        addStairLegX(segments, shell, zc, xL, xR, widthM, opts.stairKeepOut);
        // §RESI-ENTRY-INTO-CORRIDOR — when an ENTRY anchor is given (the apartment front-door
        // point on the corridor-facing cell edge), add a perpendicular leg so the spine REACHES
        // the entry edge — an L/T when the entry lies off the primary (horizontal) run. This is
        // what guarantees the front door opens INTO the internal corridor, not a habitable room.
        addEntryLeg(segments, bb, primaryAxis, zc, xL, xR, opts.entry);
    } else {
        const xc = (bb.x0 + bb.x1) / 2;
        const chord = verticalChord(shell, xc);
        if (!chord) return null;
        let [zL, zR] = chord;
        zL += margin; zR -= margin;
        if (zR - zL < EPS) return null;
        segments.push({ a: { x: xc, z: zL }, b: { x: xc, z: zR } });
        addStairLegZ(segments, shell, xc, zL, zR, widthM, opts.stairKeepOut);
        // §RESI-ENTRY-INTO-CORRIDOR — perpendicular leg to the entry anchor (see above).
        addEntryLeg(segments, bb, primaryAxis, xc, zL, zR, opts.entry);
    }

    return { segments, widthM, primaryAxis };
}

/**
 * §RESI-ENTRY-INTO-CORRIDOR — add a perpendicular leg from the primary run to the ENTRY anchor,
 * so the corridor reaches the entry edge (the apartment front door then opens into circulation).
 *
 * The primary run lies on the SHORT-axis centre; an entry on the perimeter is generally OFF that
 * line (e.g. the corridor-facing edge midpoint), so a short leg drops from the run to the entry —
 * forming the founder's L/T. When the entry already lies on the run (within half a corridor width)
 * NO leg is added (the run already passes the entry). Pure; mutates `segments` in place.
 *
 * @param runConst  the constant coordinate of the primary run (zc when primaryAxis='x', xc when 'z').
 * @param runLo/runHi  the primary run's span along its axis (xL..xR or zL..zR).
 */
function addEntryLeg(
    segments: SpineSegment[],
    bb: Rect,
    primaryAxis: 'x' | 'z',
    runConst: number,
    runLo: number,
    runHi: number,
    entry?: Pt,
): void {
    if (!entry) return;
    const half = Math.max(DOOR_W, 0.6);   // "already reached" tolerance ≈ a door width
    if (primaryAxis === 'x') {
        // Primary run is horizontal at z = runConst, spanning x ∈ [runLo, runHi].
        // The entry's z distance from the run is the leg length; its x is the joint (clamped to the run).
        if (Math.abs(entry.z - runConst) <= half) return;       // entry already on the run band
        const jointX = Math.min(Math.max(entry.x, runLo), runHi);
        // Reach to the entry edge (clamped inside the shell bbox so the leg never leaves the cell).
        const targetZ = Math.min(Math.max(entry.z, bb.z0), bb.z1);
        if (Math.abs(targetZ - runConst) < EPS) return;
        segments.push({ a: { x: jointX, z: runConst }, b: { x: jointX, z: targetZ } });
    } else {
        // Primary run is vertical at x = runConst, spanning z ∈ [runLo, runHi].
        if (Math.abs(entry.x - runConst) <= half) return;
        const jointZ = Math.min(Math.max(entry.z, runLo), runHi);
        const targetX = Math.min(Math.max(entry.x, bb.x0), bb.x1);
        if (Math.abs(targetX - runConst) < EPS) return;
        segments.push({ a: { x: runConst, z: jointZ }, b: { x: targetX, z: jointZ } });
    }
}

/** Add a vertical leg from the horizontal primary run to an edge stair, when not already reached. */
function addStairLegX(
    segments: SpineSegment[], _shell: readonly Pt[], zc: number, xL: number, xR: number,
    widthM: number, stair?: Rect,
): void {
    if (!stair) return;
    const half = widthM / 2;
    // Already reached? The run's strip [zc±half] overlaps the stair AND the stair's x-range overlaps [xL,xR].
    const stripOverlapsStairZ = zc + half >= stair.z0 - DOOR_W && zc - half <= stair.z1 + DOOR_W;
    const xOverlap = Math.min(xR, stair.x1) - Math.max(xL, stair.x0) > DOOR_W;
    if (stripOverlapsStairZ && xOverlap) return;
    // Joint on the run beneath/above the stair; clamp into both the run span and the stair x-range.
    const jointX = Math.min(Math.max((stair.x0 + stair.x1) / 2, xL), xR);
    const stairCz = (stair.z0 + stair.z1) / 2;
    const targetZ = stairCz > zc ? stair.z0 : stair.z1;             // near edge of the stair facing the run
    if (Math.abs(targetZ - zc) < EPS) return;
    segments.push({ a: { x: jointX, z: zc }, b: { x: jointX, z: targetZ } });
}

/** Add a horizontal leg from the vertical primary run to an edge stair, when not already reached. */
function addStairLegZ(
    segments: SpineSegment[], _shell: readonly Pt[], xc: number, zL: number, zR: number,
    widthM: number, stair?: Rect,
): void {
    if (!stair) return;
    const half = widthM / 2;
    const stripOverlapsStairX = xc + half >= stair.x0 - DOOR_W && xc - half <= stair.x1 + DOOR_W;
    const zOverlap = Math.min(zR, stair.z1) - Math.max(zL, stair.z0) > DOOR_W;
    if (stripOverlapsStairX && zOverlap) return;
    const jointZ = Math.min(Math.max((stair.z0 + stair.z1) / 2, zL), zR);
    const stairCx = (stair.x0 + stair.x1) / 2;
    const targetX = stairCx > xc ? stair.x0 : stair.x1;
    if (Math.abs(targetX - xc) < EPS) return;
    segments.push({ a: { x: xc, z: jointZ }, b: { x: targetX, z: jointZ } });
}

/** Distance from a point to an axis-aligned segment (both segment endpoints share one coord). */
function pointToSegDist(p: Pt, s: SpineSegment): number {
    const minX = Math.min(s.a.x, s.b.x), maxX = Math.max(s.a.x, s.b.x);
    const minZ = Math.min(s.a.z, s.b.z), maxZ = Math.max(s.a.z, s.b.z);
    const cx = Math.min(Math.max(p.x, minX), maxX);
    const cz = Math.min(Math.max(p.z, minZ), maxZ);
    return Math.hypot(p.x - cx, p.z - cz);
}

/** Nearest point ON the segment set to `p` (the joint a leg drops from). */
function nearestOnSpine(p: Pt, segments: readonly SpineSegment[]): Pt {
    let best: Pt = { x: segments[0]!.a.x, z: segments[0]!.a.z };
    let bestD = Infinity;
    for (const s of segments) {
        const minX = Math.min(s.a.x, s.b.x), maxX = Math.max(s.a.x, s.b.x);
        const minZ = Math.min(s.a.z, s.b.z), maxZ = Math.max(s.a.z, s.b.z);
        const cx = Math.min(Math.max(p.x, minX), maxX);
        const cz = Math.min(Math.max(p.z, minZ), maxZ);
        const d = Math.hypot(p.x - cx, p.z - cz);
        if (d < bestD) { bestD = d; best = { x: cx, z: cz }; }
    }
    return best;
}

/**
 * §SPINE-CONCAVE-ARMS — append a leg from the (multi-segment) spine to the stair keep-out when no
 * existing segment already passes within a door-width of it. Routes an orthogonal L (vertical then
 * horizontal) from the nearest spine joint to the stair's centre, clamped to the stair rect so the
 * corridor reaches it (§CORRIDOR-STAIR-CONTIGUITY by construction on a branching spine). Pure.
 */
function addStairLegToSpine(
    segments: SpineSegment[], _primaryAxis: 'x' | 'z', widthM: number, stair?: Rect,
): void {
    if (!stair) return;
    const half = widthM / 2;
    const stairC: Pt = { x: (stair.x0 + stair.x1) / 2, z: (stair.z0 + stair.z1) / 2 };
    // Already reached? Any segment within (half + a door width) of the stair.
    if (segments.some(s => pointToSegDist(stairC, s) <= half + DOOR_W)) return;
    const joint = nearestOnSpine(stairC, segments);
    const corner: Pt = { x: joint.x, z: stairC.z };
    if (Math.hypot(corner.x - joint.x, corner.z - joint.z) > EPS) segments.push({ a: joint, b: corner });
    const target: Pt = { x: Math.min(Math.max(stairC.x, stair.x0), stair.x1), z: corner.z };
    if (Math.hypot(target.x - corner.x, target.z - corner.z) > EPS) segments.push({ a: corner, b: target });
}

/**
 * §SPINE-CONCAVE-ARMS — append a leg from the (multi-segment) spine to the entry anchor when no
 * existing segment already passes within a door-width of it, so the front door opens INTO the
 * corridor on a branching shell too. Orthogonal L from the nearest spine joint; the entry is clamped
 * into the shell bbox so the leg never leaves the cell. Pure.
 */
function addEntryLegToSpine(segments: SpineSegment[], bb: Rect, entry?: Pt): void {
    if (!entry) return;
    const e: Pt = { x: Math.min(Math.max(entry.x, bb.x0), bb.x1), z: Math.min(Math.max(entry.z, bb.z0), bb.z1) };
    if (segments.some(s => pointToSegDist(e, s) <= Math.max(DOOR_W, 0.6))) return;
    const joint = nearestOnSpine(e, segments);
    const corner: Pt = { x: joint.x, z: e.z };
    if (Math.hypot(corner.x - joint.x, corner.z - joint.z) > EPS) segments.push({ a: joint, b: corner });
    if (Math.hypot(e.x - corner.x, e.z - corner.z) > EPS) segments.push({ a: corner, b: e });
}

/** Total centre-line length of the spine (m). Pure helper for tests/scoring. */
export function spineLengthM(spine: SpinePath): number {
    let len = 0;
    for (const s of spine.segments) len += Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z);
    return len;
}
