// L-581 REMEDY COMPARISON — measured on the frozen 65-block fixture. Offline, no network.
//
// WHAT THE FAILURE-SITE CENSUS ESTABLISHED (probe-l581-failure-site.mts), AND WHY IT REDIRECTS
// THIS WORK. The L-581 write-up says the drop cascade makes "the ring drain below 3 lines". It does
// not: that gate (`lines < 3`) fires ZERO times, at every depth, on all 65 blocks. What actually
// happens is that step 4 drops ~50% of the offset lines, and the mitre of the survivors lands
// OUTSIDE the block — caught by the soundness gates:
//
//     front = 11 m :  ok 36.9%  ·  G5 area>parcel 29.2%  ·  G6 vertex-escaped 33.8%
//     escape distance at 11 m: median 1.27 m, max 177 m   (at 30 m: max 5.6 km)
//
// That is not a cosmetic correction. It tells us WHAT A CLAMP HAS TO DO. Dropping line j does not
// merely remove a vertex — it ABANDONS EDGE j'S HALF-PLANE CONSTRAINT, so the neighbours are free
// to mitre to a corner metres or kilometres outside the parcel. A clamp that only preserves the
// LINE COUNT would fix a gate that never fires. A clamp must RESTORE THE ABANDONED CONSTRAINT.
//
// THE VARIANTS. Each is a different answer to "what should step 4 do with a reversed edge?"
//
//   V0  BASELINE — the shipped code. Drop the line, re-mitre, repeat.
//   V1  NO DROP — mitre once and let step 5 handle the folds. Rationale: step 4 is L-403 (before
//       the fold problem was understood) and step 5 §INSET-LOOP-DECOMPOSE is L-525b (after). The
//       later, orientation-based decomposition may simply subsume the earlier greedy drop, in
//       which case the fix is a DELETION and carries no new machinery.
//   V2  CLAMP — drop as today (topology unchanged), then project every surviving vertex back into
//       the half-plane of every line the drop abandoned. This is the remedy the plan intends, now
//       aimed at the constraint rather than the line count.
//   V3  V1 + V2 — no drop, and clamp to every edge's own half-plane.
//
// ⚠ NOT A VARIANT: half-plane INTERSECTION. Retracted, and it must stay retracted — it over-states
// free area at convex front–front corners, hence over-states buildable depth, which is the
// forbidden direction (C58 §1.4). Note that V2/V3 clamp is NOT that: projecting a vertex INTO a
// violated half-plane only ever SHRINKS the inset, so it under-states free area and therefore
// under-states depth. Conservative by construction — the direction the contract permits.
//
// ⚠ THE DECISION THIS PROBE DOES **NOT** MAKE. Any remedy moves real published depths, and some
// move UPWARD (telling a client they may build deeper than we said yesterday). This probe prints
// the full signed before/after distribution precisely so that trade goes to the founder rather
// than being buried in a resolution rate.
//
// Run:  npx tsx scratchpad/probe-l581-remedies.mts

import { readFileSync } from 'node:fs';
import type { Pt, ParcelEdgeClassification } from '@pryzm/schemas';
import { polygonSignedArea, pointInPolygon, pointPolygonEdgeDistance } from '../packages/site-validators/src/index.js';

const EPS = 1e-9;
const COINCIDENT_EPS = 1e-6;
const BOUNDARY_TOLERANCE_M = 1e-3;

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, z: a.z - b.z });
const cross = (a: Pt, b: Pt): number => a.x * b.z - a.z * b.x;
const len = (v: Pt): number => Math.hypot(v.x, v.z);

function lineIntersect(p0: Pt, d0: Pt, p1: Pt, d1: Pt): Pt | null {
    const denom = cross(d0, d1);
    if (Math.abs(denom) < EPS) return null;
    const t = cross(sub(p1, p0), d1) / denom;
    return { x: p0.x + t * d0.x, z: p0.z + t * d0.z };
}
interface OffsetLine { readonly p: Pt; readonly d: Pt }
function miter(lines: ReadonlyArray<OffsetLine>): Pt[] {
    const n = lines.length;
    const out: Pt[] = new Array(n);
    for (let j = 0; j < n; j++) {
        const prev = lines[(j - 1 + n) % n]!, curr = lines[j]!;
        out[j] = lineIntersect(prev.p, prev.d, curr.p, curr.d) ?? { ...curr.p };
    }
    return out;
}
/**
 * Signed distance from `q` to a line, POSITIVE on the interior side.
 * For a CCW ring the interior is LEFT of the directed edge, and the inward normal of `d` is
 * (-d.z, d.x) — so the interior half-plane is {q : (q-p)·n >= 0}.
 */
function interiorSignedDist(q: Pt, line: OffsetLine): number {
    const v = sub(q, line.p);
    return v.x * -line.d.z + v.z * line.d.x;
}
/** Project `q` onto `line` (the nearest point on the supporting line). */
function projectOnto(q: Pt, line: OffsetLine): Pt {
    const s = interiorSignedDist(q, line);
    return { x: q.x - s * -line.d.z, z: q.z - s * line.d.x };
}
function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
    const d1 = cross(sub(b, a), sub(c, a)), d2 = cross(sub(b, a), sub(d, a));
    const d3 = cross(sub(d, c), sub(a, c)), d4 = cross(sub(d, c), sub(b, c));
    return (d1 > EPS) !== (d2 > EPS) && (d3 > EPS) !== (d4 > EPS);
}
function selfIntersects(ring: ReadonlyArray<Pt>): boolean {
    const n = ring.length;
    for (let i = 0; i < n; i++) {
        const a = ring[i]!, b = ring[(i + 1) % n]!;
        for (let j = i + 1; j < n; j++) {
            if (j === i || j === (i + 1) % n || (j + 1) % n === i) continue;
            if (segmentsCross(a, b, ring[j]!, ring[(j + 1) % n]!)) return true;
        }
    }
    return false;
}
function segmentCrossPoint(a: Pt, b: Pt, c: Pt, d: Pt): { t: number; u: number; p: Pt } | null {
    if (!segmentsCross(a, b, c, d)) return null;
    const r = sub(b, a), s = sub(d, c);
    const denom = cross(r, s);
    if (Math.abs(denom) < EPS) return null;
    return { t: cross(sub(c, a), s) / denom, u: cross(sub(c, a), r) / denom,
        p: { x: a.x + (cross(sub(c, a), s) / denom) * r.x, z: a.z + (cross(sub(c, a), s) / denom) * r.z } };
}
function decomposeToSimpleLoops(ring: ReadonlyArray<Pt>): Pt[][] {
    const n = ring.length;
    const perEdge: Array<Array<{ t: number; p: Pt; key: string }>> = [];
    for (let i = 0; i < n; i++) perEdge.push([]);
    for (let i = 0; i < n; i++) {
        const a = ring[i]!, b = ring[(i + 1) % n]!;
        for (let j = i + 1; j < n; j++) {
            if (j === (i + 1) % n || (j + 1) % n === i) continue;
            const x = segmentCrossPoint(a, b, ring[j]!, ring[(j + 1) % n]!);
            if (!x) continue;
            const key = `X${i}:${j}`;
            perEdge[i]!.push({ t: x.t, p: x.p, key });
            perEdge[j]!.push({ t: x.u, p: x.p, key });
        }
    }
    const walk: Array<{ p: Pt; key: string }> = [];
    for (let i = 0; i < n; i++) {
        walk.push({ p: ring[i]!, key: `V${i}` });
        perEdge[i]!.sort((p, q) => p.t - q.t);
        for (const c of perEdge[i]!) walk.push({ p: c.p, key: c.key });
    }
    const loops: Pt[][] = [];
    const path: Array<{ p: Pt; key: string }> = [];
    const seenAt = new Map<string, number>();
    for (const node of walk) {
        const at = seenAt.get(node.key);
        if (at === undefined) { seenAt.set(node.key, path.length); path.push(node); continue; }
        const loop = path.slice(at).map((w) => ({ x: w.p.x, z: w.p.z }));
        if (loop.length >= 3) loops.push(loop);
        for (let k = at + 1; k < path.length; k++) seenAt.delete(path[k]!.key);
        path.length = at + 1;
    }
    if (path.length >= 3) loops.push(path.map((w) => ({ x: w.p.x, z: w.p.z })));
    return loops;
}

type Variant = 'V0-baseline' | 'V1-no-drop' | 'V2-clamp' | 'V3-no-drop+clamp';

interface Res { polygon: Pt[]; degenerate: boolean }

function inset(
    polygon: ReadonlyArray<Pt>,
    edgeClassifications: ReadonlyArray<ParcelEdgeClassification>,
    setbacks: { front: number; side: number; rear: number; unclassified: number },
    variant: Variant,
): Res {
    const DEAD: Res = { polygon: [], degenerate: true };
    if (polygon.length < 3) return DEAD;

    const pts: Pt[] = [];
    const cls: Array<ParcelEdgeClassification | undefined> = [];
    for (let i = 0; i < polygon.length; i++) {
        const p = polygon[i]!, prev = pts[pts.length - 1];
        if (prev && len(sub(p, prev)) < COINCIDENT_EPS) continue;
        pts.push({ x: p.x, z: p.z });
        cls.push(edgeClassifications[i]);
    }
    while (pts.length >= 2 && len(sub(pts[pts.length - 1]!, pts[0]!)) < COINCIDENT_EPS) { pts.pop(); cls.pop(); }
    if (pts.length < 3) return DEAD;
    const signed = polygonSignedArea(pts);
    if (Math.abs(signed) < EPS) return DEAD;

    const maxSetback = Math.max(0, setbacks.front, setbacks.side, setbacks.rear, setbacks.unclassified);
    if (maxSetback <= EPS) return { polygon: pts.map((p) => ({ x: p.x, z: p.z })), degenerate: false };

    let ring: Pt[] = pts;
    let ringCls: Array<ParcelEdgeClassification | undefined> = cls;
    if (signed < 0) {
        const n = pts.length;
        ring = pts.slice().reverse();
        ringCls = new Array(n);
        for (let i = 0; i < n; i++) ringCls[i] = cls[(n - 1 - i + n) % n];
    }

    const n = ring.length;
    const allLines: OffsetLine[] = [];
    for (let i = 0; i < n; i++) {
        const a = ring[i]!, b = ring[(i + 1) % n]!;
        const dir = sub(b, a), l = len(dir);
        if (l < EPS) continue;
        const ux = dir.x / l, uz = dir.z / l;
        const c = ringCls[i];
        const s = Math.max(0, c === 'front' ? setbacks.front : c === 'side' ? setbacks.side
            : c === 'rear' ? setbacks.rear : setbacks.unclassified);
        allLines.push({ p: { x: a.x + -uz * s, z: a.z + ux * s }, d: { x: ux, z: uz } });
    }
    if (allLines.length < 3) return DEAD;

    let lines = allLines.slice();
    let out: Pt[] = miter(lines);
    const doDrop = variant === 'V0-baseline' || variant === 'V2-clamp';
    if (doDrop) {
        for (let guard = 0; guard < lines.length; guard++) {
            let reversedIdx = -1;
            for (let j = 0; j < lines.length; j++) {
                const line = lines[j]!, a = out[j]!, b = out[(j + 1) % out.length]!;
                const edge = sub(b, a);
                if (edge.x * line.d.x + edge.z * line.d.z <= EPS) { reversedIdx = j; break; }
            }
            if (reversedIdx < 0) break;
            lines.splice(reversedIdx, 1);
            if (lines.length < 3) return DEAD;
            out = miter(lines);
        }
    }

    // ── THE CLAMP. Project every vertex back into every offset line's interior half-plane.
    //    A vertex already inside is untouched, so this is a no-op on sound geometry; a vertex that
    //    escaped is pulled onto the boundary of the constraint it violated. Monotone-shrinking by
    //    construction: it can only ever move a vertex INWARD, never outward.
    //    Iterated, because pulling a vertex into one half-plane can push it out of another; a fixed
    //    iteration budget keeps it deterministic (C58 §1.1) rather than converging on a tolerance.
    if (variant === 'V2-clamp' || variant === 'V3-no-drop+clamp') {
        for (let pass = 0; pass < 8; pass++) {
            let moved = false;
            for (let k = 0; k < out.length; k++) {
                let q = out[k]!;
                for (const line of allLines) {
                    if (interiorSignedDist(q, line) < -EPS) { q = projectOnto(q, line); moved = true; }
                }
                out[k] = q;
            }
            if (!moved) break;
        }
    }

    if (selfIntersects(out)) {
        const loops = decomposeToSimpleLoops(out);
        const kept = loops.filter((l) => l.length >= 3 && polygonSignedArea(l) > EPS);
        if (kept.length === 0) return DEAD;
        kept.sort((a, b) => polygonSignedArea(b) - polygonSignedArea(a));
        out = kept[0]!;
    }
    if (out.length < 3) return DEAD;
    const insetSigned = polygonSignedArea(out);
    if (insetSigned <= EPS) return DEAD;
    if (insetSigned > Math.abs(signed) + EPS) return DEAD;
    for (const p of out) {
        if (pointInPolygon(p, ring)) continue;
        if (pointPolygonEdgeDistance(p, ring) <= BOUNDARY_TOLERANCE_M) continue;
        return DEAD;
    }
    return { polygon: out, degenerate: false };
}

// ── the Art. 242.2 solve, parameterised by variant ───────────────────────────
const areaOf = (r: ReadonlyArray<Pt>): number => (r.length < 3 ? 0 : Math.abs(polygonSignedArea(r)));
const MIN_D = 11, MAX_D = 30, RATIO = 0.30, STEPS = 40;

interface Solve { depth: number; binding: string; degenerate: boolean; freeRatio: number }

function solve(ring: Pt[], cls: ParcelEdgeClassification[], variant: Variant): Solve {
    const blockArea = areaOf(ring);
    const required = blockArea * RATIO;
    const free = (d: number): number => {
        const r = inset(ring, cls, { front: d, side: 0, rear: 0, unclassified: 0 }, variant);
        return r.degenerate ? 0 : areaOf(r.polygon);
    };
    const atMin = free(MIN_D);
    if (atMin < required) return { depth: MIN_D, binding: 'min-floor', degenerate: true, freeRatio: atMin / blockArea };
    const atMax = free(MAX_D);
    if (atMax >= required) return { depth: MAX_D, binding: 'max-cap', degenerate: false, freeRatio: atMax / blockArea };
    let lo = MIN_D, hi = MAX_D;
    for (let i = 0; i < STEPS; i++) {
        const mid = (lo + hi) / 2;
        if (free(mid) >= required) lo = mid; else hi = mid;
    }
    return { depth: lo, binding: 'interior-ratio', degenerate: false, freeRatio: free(lo) / blockArea };
}

// ── fixture ──────────────────────────────────────────────────────────────────
interface Fixture {
    refcat: string; blockRing: Pt[]; edgeClassifications: string[];
    blockAreaM2: number; frontEdges: number; totalEdges: number; reflexCount: number;
}
const blocks = JSON.parse(
    readFileSync(new URL('./l581-blocks.fixture.json', import.meta.url), 'utf8'),
) as Fixture[];

const VARIANTS: Variant[] = ['V0-baseline', 'V1-no-drop', 'V2-clamp', 'V3-no-drop+clamp'];

// ── 1. collapse rate at the ordinance floor ──────────────────────────────────
console.log('── INSET SOUNDNESS AT THE 11 m ORDINANCE FLOOR (the gentlest depth ever asked for)');
for (const v of VARIANTS) {
    let ok = 0;
    for (const b of blocks) {
        const r = inset(b.blockRing, b.edgeClassifications as ParcelEdgeClassification[],
            { front: 11, side: 0, rear: 0, unclassified: 0 }, v);
        if (!r.degenerate) ok++;
    }
    console.log(`   ${v.padEnd(18)} ${String(ok).padStart(3)}/${blocks.length} sound  (${((ok / blocks.length) * 100).toFixed(1)}%)`);
}

// ── 2. end-to-end Art. 242.2 outcome ─────────────────────────────────────────
console.log('\n── ART. 242.2 SOLVE OUTCOME across all 65 blocks');
const solved = new Map<Variant, Solve[]>();
for (const v of VARIANTS) {
    const rs = blocks.map((b) => solve(b.blockRing, b.edgeClassifications as ParcelEdgeClassification[], v));
    solved.set(v, rs);
    const deg = rs.filter((r) => r.degenerate).length;
    const ratio = rs.filter((r) => r.binding === 'interior-ratio').length;
    const cap = rs.filter((r) => r.binding === 'max-cap').length;
    // A GENUINE ratio-bound answer lands AT 30%. One that lands far above it was stopped by a
    // collapse wearing a legal label — the original L-581 tell, so it is reported, not just counted.
    const honest = rs.filter((r) => r.binding === 'interior-ratio' && Math.abs(r.freeRatio - RATIO) < 0.02).length;
    console.log(`   ${v.padEnd(18)} degenerate ${String(deg).padStart(2)}  ·  interior-ratio ${String(ratio).padStart(2)}`
        + ` (${honest} landing AT 30%)  ·  max-cap ${String(cap).padStart(2)}`);
}

// ── 3. ⚠ THE FOUNDER'S DECISION — signed depth movement vs the shipped baseline ──
const base = solved.get('V0-baseline')!;
for (const v of VARIANTS.slice(1)) {
    const rs = solved.get(v)!;
    console.log(`\n── ⚠ DEPTH MOVEMENT: ${v} vs shipped baseline (metres, + = we now permit MORE)`);
    const deltas: number[] = [];
    let newlyAnswered = 0, newlyRefused = 0, up = 0, down = 0, same = 0;
    for (let i = 0; i < blocks.length; i++) {
        const a = base[i]!, b = rs[i]!;
        if (a.degenerate && !b.degenerate) { newlyAnswered++; continue; }
        if (!a.degenerate && b.degenerate) { newlyRefused++; continue; }
        if (a.degenerate && b.degenerate) continue;
        const d = b.depth - a.depth;
        deltas.push(d);
        if (d > 0.05) up++; else if (d < -0.05) down++; else same++;
    }
    console.log(`   newly ANSWERED (was "ordinance cannot be satisfied") : ${newlyAnswered}`);
    console.log(`   newly REFUSED  (⚠ a visible regression)              : ${newlyRefused}`);
    console.log(`   already answered: ${up} DEEPER · ${down} shallower · ${same} unchanged`);
    if (deltas.length) {
        const s = [...deltas].sort((x, y) => x - y);
        console.log(`   Δdepth  min ${s[0]!.toFixed(2)}  median ${s[s.length >> 1]!.toFixed(2)}  max ${s[s.length - 1]!.toFixed(2)}`);
    }
    const worst = blocks
        .map((b, i) => ({ refcat: b.refcat, a: base[i]!, b: rs[i]! }))
        .filter((r) => !r.a.degenerate && !r.b.degenerate && r.b.depth - r.a.depth > 0.05)
        .sort((p, q) => (q.b.depth - q.a.depth) - (p.b.depth - p.a.depth))
        .slice(0, 5);
    if (worst.length) {
        console.log('   ⚠ LARGEST UPWARD MOVES — each one tells a client they may build DEEPER than');
        console.log('     we said yesterday. This is the direction that needs sign-off, not the rate:');
        for (const w of worst) {
            console.log(`       ${w.refcat}  ${w.a.depth.toFixed(1)} m → ${w.b.depth.toFixed(1)} m`
                + `   (${w.a.binding} → ${w.b.binding})`);
        }
    }
}
