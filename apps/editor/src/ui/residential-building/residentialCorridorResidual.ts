// §RESI-CORRIDOR-FINISH-SHAPE (founder 2026-06-26: "the public-corridor floor finish
// is ONE finish now [good] but its SHAPE is a comb of thin strips — it should be the
// CLEAN RESIDUAL: the actual leftover circulation space = shell-interior MINUS all
// apartment cells MINUS the core").
//
// The previous shape (§RESI-CORRIDOR-FINISH-CONTINUOUS-FIX2) UNIONed the tightened
// per-band corridor "runs" from the §RESI-FILL-PLATE parallel-corridor grid, which
// renders as thin parallel strips. This module replaces that with the RESIDUAL
// region: take the level's interior polygon, subtract every (status:ok) apartment
// cell rect and the core rect — the remaining polygon(s) ARE the public corridor (a
// clean H/cross hugging the apartment walls, the shell, and the core).
//
// Implementation: the SAME rectilinear breakpoint-grid + boundary-ring tracer the
// union path used, but with a RESIDUAL `corridor[][]` rule: a grid cell is corridor
// when its centre is inside the interior polygon AND not inside any apartment cell
// AND not inside the core. All coordinates are LOCAL (axis-aligned) plan-XZ; the
// caller rotates the resulting rings to world. PURE + deterministic (no THREE/DOM).

import { pointInPolygonXZ } from '@pryzm/geometry-kernel';

export interface Pt { x: number; z: number }
export interface Rect { x0: number; z0: number; x1: number; z1: number }

/** Normalise a rect so x0<x1, z0<z1; returns null when degenerate (zero-area). */
function norm(r: Rect, eps = 1e-4): Rect | null {
    const x0 = Math.min(r.x0, r.x1), x1 = Math.max(r.x0, r.x1);
    const z0 = Math.min(r.z0, r.z1), z1 = Math.max(r.z0, r.z1);
    if (x1 - x0 <= eps || z1 - z0 <= eps) return null;
    return { x0, z0, x1, z1 };
}

/** Even-odd point-in-polygon (ray cast). Boundary handling is irrelevant here — we
 *  only ever test grid-cell CENTRES, which never land exactly on an edge.
 *  §C73-PIP-CANONICAL — delegates to THE kernel ray cast (geometry-kernel). The
 *  note above is exactly why this site could not detect a boundary disagreement
 *  with its rivals: it never asks a boundary question. */
function pointInPoly(pt: Pt, poly: ReadonlyArray<Pt>): boolean {
    return pointInPolygonXZ(pt.x, pt.z, poly);
}

const inRect = (cx: number, cz: number, r: Rect): boolean => cx > r.x0 && cx < r.x1 && cz > r.z0 && cz < r.z1;

/**
 * Compute the public-corridor RESIDUAL rings = interiorPoly − ∪apartmentCells − core.
 *
 * @param interiorPoly  the level's interior polygon (LOCAL axis-aligned plan-XZ). The
 *                      shell-interior — pass the footprint (LOCAL) directly when no
 *                      inset is available; it bounds the residual either way.
 * @param apartmentCells the (status:ok) apartment cell rects (LOCAL).
 * @param core          the core rect (LOCAL), or null when the level has no core.
 * @returns one CCW ring per connected residual component (a clean H/cross for the
 *          typical plate). Collinear vertices are dropped; rings with <3 corners are
 *          discarded. Empty when the residual is empty (fully tiled).
 */
export function computeCorridorResidualRings(
    interiorPoly: ReadonlyArray<Pt>,
    apartmentCells: ReadonlyArray<Rect>,
    core: Rect | null,
): Array<Pt[]> {
    if (interiorPoly.length < 3) return [];
    const cells = apartmentCells.map(r => norm(r)).filter((r): r is Rect => r !== null);
    const coreN = core ? norm(core) : null;

    // Breakpoint grid: every distinct x/z from the interior bbox + each subtracted rect.
    let ix0 = Infinity, ix1 = -Infinity, iz0 = Infinity, iz1 = -Infinity;
    for (const p of interiorPoly) {
        ix0 = Math.min(ix0, p.x); ix1 = Math.max(ix1, p.x);
        iz0 = Math.min(iz0, p.z); iz1 = Math.max(iz1, p.z);
    }
    const xsSet = new Set<number>([ix0, ix1]);
    const zsSet = new Set<number>([iz0, iz1]);
    for (const r of cells) { xsSet.add(r.x0); xsSet.add(r.x1); zsSet.add(r.z0); zsSet.add(r.z1); }
    if (coreN) { xsSet.add(coreN.x0); xsSet.add(coreN.x1); zsSet.add(coreN.z0); zsSet.add(coreN.z1); }
    // Clamp breakpoints to the interior bbox so cells/core protruding past it don't add
    // phantom columns/rows outside the shell.
    const xs = [...xsSet].filter(x => x >= ix0 - 1e-6 && x <= ix1 + 1e-6).sort((a, b) => a - b);
    const zs = [...zsSet].filter(z => z >= iz0 - 1e-6 && z <= iz1 + 1e-6).sort((a, b) => a - b);
    const nx = xs.length - 1, nz = zs.length - 1;
    if (nx < 1 || nz < 1) return [];

    // corridor[i][j] = cell [xs[i],xs[i+1]] × [zs[j],zs[j+1]] is in the residual:
    // inside the interior poly AND not in any apartment cell AND not in the core.
    const corridor: boolean[][] = Array.from({ length: nx }, () => new Array<boolean>(nz).fill(false));
    for (let i = 0; i < nx; i++) {
        const cx = (xs[i]! + xs[i + 1]!) / 2;
        for (let j = 0; j < nz; j++) {
            const cz = (zs[j]! + zs[j + 1]!) / 2;
            if (!pointInPoly({ x: cx, z: cz }, interiorPoly)) continue;
            if (coreN && inRect(cx, cz, coreN)) continue;
            if (cells.some(r => inRect(cx, cz, r))) continue;
            corridor[i]![j] = true;
        }
    }

    return traceCoveredRings(corridor, xs, zs);
}

/**
 * Trace the boundary of a covered grid region into CCW ring(s). Shared rectilinear
 * marching-edges tracer (lifted verbatim from the union path so both share one proven
 * implementation): collect each grid edge that borders covered↔uncovered, wound so the
 * covered region is on the LEFT, then chain the directed edges into rings.
 */
export function traceCoveredRings(
    covered: ReadonlyArray<ReadonlyArray<boolean>>,
    xs: readonly number[],
    zs: readonly number[],
): Array<Pt[]> {
    const nx = xs.length - 1, nz = zs.length - 1;
    if (nx < 1 || nz < 1) return [];
    const key = (a: Pt, b: Pt): string => `${a.x.toFixed(4)},${a.z.toFixed(4)}->${b.x.toFixed(4)},${b.z.toFixed(4)}`;
    const edges = new Map<string, { a: Pt; b: Pt }>();
    const addEdge = (a: Pt, b: Pt): void => { edges.set(key(a, b), { a, b }); };
    const isCov = (i: number, j: number): boolean => i >= 0 && i < nx && j >= 0 && j < nz && !!covered[i]?.[j];
    for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
            if (!covered[i]![j]) continue;
            const x0 = xs[i]!, x1 = xs[i + 1]!, z0 = zs[j]!, z1 = zs[j + 1]!;
            if (!isCov(i, j - 1)) addEdge({ x: x0, z: z0 }, { x: x1, z: z0 });   // bottom (−z) → +x
            if (!isCov(i + 1, j)) addEdge({ x: x1, z: z0 }, { x: x1, z: z1 });   // right (+x)  → +z
            if (!isCov(i, j + 1)) addEdge({ x: x1, z: z1 }, { x: x0, z: z1 });   // top (+z)    → −x
            if (!isCov(i - 1, j)) addEdge({ x: x0, z: z1 }, { x: x0, z: z0 });   // left (−x)   → −z
        }
    }
    const byStart = new Map<string, { a: Pt; b: Pt }[]>();
    for (const e of edges.values()) {
        const k = `${e.a.x.toFixed(4)},${e.a.z.toFixed(4)}`;
        (byStart.get(k) ?? byStart.set(k, []).get(k)!).push(e);
    }
    const used = new Set<string>();
    const rings: Array<Pt[]> = [];
    for (const start of edges.values()) {
        if (used.has(key(start.a, start.b))) continue;
        const ring: Pt[] = [];
        let cur = start;
        let guard = edges.size + 4;
        while (guard-- > 0) {
            used.add(key(cur.a, cur.b));
            ring.push({ x: cur.a.x, z: cur.a.z });
            const k = `${cur.b.x.toFixed(4)},${cur.b.z.toFixed(4)}`;
            const next = (byStart.get(k) ?? []).find(e => !used.has(key(e.a, e.b)));
            if (!next) break;
            cur = next;
            if (cur === start || key(cur.a, cur.b) === key(start.a, start.b)) break;
        }
        const simplified = cleanRing(ring);
        // Keep only OUTER boundaries (covered region enclosed by the ring). The tracer
        // winds the covered region on the LEFT, so outer rings come out CCW (positive
        // signed area) and inner HOLE rings come out CW (negative). We drop the holes:
        // a filled finish can't represent a donut, and any real hole (the core/stairwell)
        // is cut downstream by the void-cut pass (cutVoids). Without this, a frame-shaped
        // residual would lay the hole back in as a second filled ring.
        if (simplified.length >= 3 && signedArea(simplified) > 0) rings.push(simplified);
    }
    return rings;
}

/** Drop near-duplicate + collinear vertices; pure mirror of the executor's _cleanRing
 *  plus a collinear-vertex pass (the union path relied on the executor's _cleanRing,
 *  which already removes collinear points via its own simplify — replicated here so the
 *  helper is self-contained and produces clean rectangles for the residual). */
export function cleanRing(poly: ReadonlyArray<Pt>): Pt[] {
    // 1. Drop consecutive near-duplicates + a closing duplicate.
    const dedup: Pt[] = [];
    for (const p of poly) {
        const prev = dedup[dedup.length - 1];
        if (prev && Math.hypot(p.x - prev.x, p.z - prev.z) < 0.05) continue;
        dedup.push({ x: p.x, z: p.z });
    }
    if (dedup.length >= 2) {
        const first = dedup[0]!, last = dedup[dedup.length - 1]!;
        if (Math.hypot(first.x - last.x, first.z - last.z) < 0.05) dedup.pop();
    }
    if (dedup.length < 3) return dedup;
    // 2. Drop collinear vertices (a, b, c with b on segment a→c) for clean corners.
    const out: Pt[] = [];
    const n = dedup.length;
    for (let i = 0; i < n; i++) {
        const a = dedup[(i - 1 + n) % n]!, b = dedup[i]!, c = dedup[(i + 1) % n]!;
        const cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
        if (Math.abs(cross) < 1e-6) continue;   // b is collinear → drop
        out.push(b);
    }
    return out.length >= 3 ? out : dedup;
}

/** Signed shoelace area of a ring. Positive ⇒ CCW (outer boundary in plan-XZ with the
 *  tracer's covered-on-left winding); negative ⇒ CW (an inner hole boundary). */
export function signedArea(ring: ReadonlyArray<Pt>): number {
    let a2 = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
        a2 += a.x * b.z - b.x * a.z;
    }
    return a2 / 2;
}

/** Shoelace area (absolute) of a ring — small helper for callers/tests. */
export function ringArea(ring: ReadonlyArray<Pt>): number {
    return Math.abs(signedArea(ring));
}
