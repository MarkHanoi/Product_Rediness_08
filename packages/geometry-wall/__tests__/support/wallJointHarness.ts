/**
 * wallJointHarness.ts — the SHARED wall-joint measurement rig.
 *
 * ⭐ EXTRACTED, NOT COPIED (WJ1, 2026-08-19). Every helper here was written by RK1 inside
 * `RK1RakedCombinationMatrix.measure.test.ts`, and every one of them was earned by a
 * measurement that came back wrong first — §RK1-LEAN-IS-NOT-A-CENTROID,
 * §RK1-VERTEX-GAP-IS-NOT-A-T-JOINT, §RK1-MAX-Y-CANNOT-SEE-A-PARTIAL-CUT,
 * §WJ1-CROSSING-HULLS-SHARE-NO-VERTEX. A second file needing the same rig had two options:
 * copy it, or share it. **Copying it would have left FOUR corrected instruments in one file
 * and four uncorrected ones in the other**, and the next correction would have landed in
 * whichever copy its author happened to be reading — the C84 EI-9 shape exactly. So the rig
 * moved here and both readers import it. There is ONE `hullSeparation` in this package's
 * tests, and when it is wrong again it will be wrong in one place.
 *
 * This module deliberately imports NOTHING from vitest: it measures, it does not assert.
 * What a given reading MEANS is the caller's argument to make.
 *
 * @file packages/geometry-wall/__tests__/support/wallJointHarness.ts
 */

import { appendFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as THREE from '@pryzm/renderer-three/three';
import { COINCIDENT_M } from '@pryzm/geometry-kernel';

import { WallFragmentBuilder } from '../../src/WallFragmentBuilder';
import { WallJoinResolver } from '../../src/WallJoinResolver';
import { type LevelWallSpec } from '../../src/WallPipelineV2';
import { rakeAuthorability, rakeShearPerMetre } from '../../src/WallRake';
import type { WallData } from '../../src/WallTypes';

export { COINCIDENT_M };

// --- The scene constants -----------------------------------------------------
export const RAKE = 80;                 // the founder's angle
export const VERT = 90;
export const H = 3;
export const T = 0.2;
export const LAYERS3 = [0.0125, 0.075, 0.0125];
/** ONE layer — the founder's "Plain Wall" as `CreateWallCommand` stamps it from a system type. */
export const LAYERS1 = [0.2];
export const K = rakeShearPerMetre(RAKE);        // cot(80 deg) ~= 0.176327
export const EXPECTED_LEAN = H * Math.abs(K);    // ~= 0.52898 m

let _seq = 0;

interface MkOpts {
    layers?: number[];
    rake?: number;
    openings?: unknown[];
    curve?: { control: { x: number; y: number; z: number }; segments: number };
}

export function mk(s: [number, number], e: [number, number], opts: MkOpts = {}): WallData {
    const layers = opts.layers;
    return {
        id: `rk1-${_seq++}`,
        type: 'wall',
        levelId: 'L',
        properties: {},
        childrenIds: [],
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: H,
        thickness: layers ? layers.reduce((a, b) => a + b, 0) : T,
        baseOffset: 0,
        openings: opts.openings ?? [],
        ...(layers ? { layers: layers.map((t, i) => ({ name: `l${i}`, thickness: t })) } : {}),
        ...(opts.rake === undefined ? {} : { rakeAngleDeg: opts.rake }),
        ...(opts.curve ? { curve: opts.curve } : {}),
        metadata: { createdAt: _seq, modifiedAt: _seq, createdBy: 'rk1', version: 1 },
    } as unknown as WallData;
}

export const WINDOW = { id: 'w-1', type: 'window', offset: 2.0, width: 1.2, height: 1.4, sillHeight: 0.9 };
export const DOOR = { id: 'd-1', type: 'door', offset: 1.0, width: 0.9, height: 2.1, sillHeight: 0 };

export const specOf = (w: WallData): LevelWallSpec => ({
    id: w.id,
    startXZ: { x: w.baseLine[0].x, z: w.baseLine[0].z },
    endXZ: { x: w.baseLine[1].x, z: w.baseLine[1].z },
    thickness: w.thickness,
    rakeAngleDeg: (w as unknown as { rakeAngleDeg?: number }).rakeAngleDeg,
    layered: ((w as unknown as { layers?: unknown[] }).layers?.length ?? 0) > 1,
});

export function levelProvider() {
    const level = { id: 'L', name: 'Ground', elevation: 0, height: H, childrenIds: [] };
    return {
        getLevelById: (id: string) => (id === 'L' ? { ...level } : undefined),
        getLevels: () => [{ ...level }],
    };
}

// --- Measurement -------------------------------------------------------------
export interface Pt { x: number; z: number }

/**
 * WORLD-space vertices of the wall-BODY meshes under `root`. Identical selection rule to
 * `L955RakedJoinCorner.test.ts` -- no `elementType` (plain V2 body), `'WallLayer'` (the
 * layered bands) and `'WallPart'` (the segments an opening-bearing wall is built from).
 * `localToWorld` is what makes the §RAKE-HOSTED-OPENING child shear MATRIX visible: that
 * shear lives in the matrix, never in the buffer, so a buffer-space reading would report
 * every raked wall as vertical and this whole file would measure nothing.
 */
export function bodyVertices(root: THREE.Object3D): THREE.Vector3[] {
    root.updateMatrixWorld(true);
    const out: THREE.Vector3[] = [];
    root.traverse(o => {
        const m = o as THREE.Mesh;
        if (!(m as unknown as { isMesh?: boolean }).isMesh) return;
        const ud = m.userData as { role?: string; elementType?: string };
        if (ud?.role !== 'geometry') return;
        if (ud.elementType !== undefined && ud.elementType !== 'WallLayer' && ud.elementType !== 'WallPart') return;
        const pos = m.geometry.getAttribute('position');
        if (!pos) return;
        for (let i = 0; i < pos.count; i++) {
            out.push(m.localToWorld(new THREE.Vector3().fromBufferAttribute(pos as THREE.BufferAttribute, i)));
        }
    });
    return out;
}

/** Distinct plan positions at world height `y`. 1e-7 de-duplicates float32 spellings of ONE vertex. */
export function ringAt(verts: readonly THREE.Vector3[], y: number): Pt[] {
    const out: Pt[] = [];
    for (const v of verts) {
        if (Math.abs(v.y - y) > 1e-6) continue;
        if (!out.some(p => Math.hypot(p.x - v.x, p.z - v.z) < 1e-7)) out.push({ x: v.x, z: v.z });
    }
    return out;
}

/**
 * The MIDPOINT of the ring's extent along `n`, where `n` is the wall's plan LEFT normal.
 *
 * §RK1-LEAN-IS-NOT-A-CENTROID -- this replaced a ring CENTROID, and the reason is a
 * defect this probe reported about ITSELF on its first run. A centroid averages the
 * DISTINCT plan positions at a height, so it moves whenever the two rings are composed of
 * different vertices -- and they routinely are. A door reaching the floor contributes jamb
 * vertices to the BASE ring that the TOP ring has no counterpart for, so `plain+door @90`
 * -- a wall with NO RAKE AT ALL -- read a 0.525 m "lean". That was the METRIC leaning, not
 * the wall, and reporting it would have been a fabricated defect in a file whose entire
 * purpose is to be believable.
 *
 * The extent along the LEFT NORMAL is invariant to all three ways the two rings differ
 * here: a mitre extends the footprint along the wall AXIS (no lateral component), an
 * opening's jambs lie strictly BETWEEN the two faces (inside the existing extent), and an
 * arc's bulge is present identically at both heights (so it cancels in the difference).
 * What survives is exactly the quantity a rake moves: `height * cot(theta)`.
 */
export function lateralMid(r: readonly Pt[], nx: number, nz: number): number {
    if (r.length === 0) return NaN;
    let lo = Infinity, hi = -Infinity;
    for (const p of r) {
        const s = p.x * nx + p.z * nz;
        if (s < lo) lo = s;
        if (s > hi) hi = s;
    }
    return (lo + hi) / 2;
}

export function sharedCount(a: readonly Pt[], b: readonly Pt[], tol: number): number {
    return a.filter(p => b.some(q => Math.hypot(p.x - q.x, p.z - q.z) <= tol)).length;
}

/**
 * Closest approach between two rings measured VERTEX-TO-VERTEX.
 *
 * Correct at an L, where a sound mitre makes the two walls SHARE corner vertices, and
 * that sharing is the thing being measured. ⚠ MEANINGLESS AT A T OR AN X -- see
 * {@link hullSeparation}. Both are reported so the two are never confused.
 */
export function minGap(a: readonly Pt[], b: readonly Pt[]): number {
    let best = Infinity;
    for (const p of a) for (const q of b) best = Math.min(best, Math.hypot(p.x - q.x, p.z - q.z));
    return best;
}

// -- Hull separation: the metric that survives a T and an X ---------------------------
//
// §RK1-VERTEX-GAP-IS-NOT-A-T-JOINT -- the first matrix reported `baseGap = 2.400 m` for a
// PERFECTLY SOUND plain-to-plain T-join, and 3.394 m for an X. Neither is a gap in the
// building. At a T the stem's end face lies flush against the middle of the host's SIDE
// FACE, where the host has no vertex at all -- so the nearest host VERTEX is half a wall
// away, and a vertex-to-vertex metric reports that distance as if it were daylight.
// Reporting those numbers as findings would have invented two defects out of a metric
// that does not apply. What actually matters at a T and an X is whether the two SOLIDS
// touch, so measure hull-to-hull: 0 when they meet or overlap, positive when they part.

/** Monotone-chain convex hull in plan. The wall bodies here are convex or near-convex. */
export function hull(pts: readonly Pt[]): Pt[] {
    const p = [...pts].sort((a, b) => (a.x - b.x) || (a.z - b.z));
    if (p.length < 3) return p;
    const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
    const build = (src: Pt[]): Pt[] => {
        const out: Pt[] = [];
        for (const q of src) {
            while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, q) <= 0) out.pop();
            out.push(q);
        }
        out.pop();
        return out;
    };
    return [...build(p), ...build([...p].reverse())];
}

export function pointSegDist(p: Pt, a: Pt, b: Pt): number {
    const vx = b.x - a.x, vz = b.z - a.z;
    const len2 = vx * vx + vz * vz;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / len2));
    return Math.hypot(p.x - (a.x + t * vx), p.z - (a.z + t * vz));
}

export function pointInHull(p: Pt, h: readonly Pt[]): boolean {
    if (h.length < 3) return false;
    let sign = 0;
    for (let i = 0; i < h.length; i++) {
        const a = h[i]!, b = h[(i + 1) % h.length]!;
        const c = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
        if (Math.abs(c) < 1e-12) continue;
        const s = c > 0 ? 1 : -1;
        if (sign === 0) sign = s; else if (s !== sign) return false;
    }
    return true;
}

/**
 * §WJ1-CROSSING-HULLS-SHARE-NO-VERTEX (WJ1, 2026-08-19) — THE X METRIC WAS WRONG, and the
 * blank listed below as #3 was right to forbid conclusions from it. This is the proof.
 *
 * `hullSeparation` used to decide overlap by asking whether any VERTEX of one hull lay
 * inside the other. **Two convex polygons can overlap with no vertex of either inside the
 * other** — a PLUS SIGN is exactly that case, and a plus sign is exactly what an X
 * junction is. So for `X plain@90 vs plain@90` — two 5 m walls crossing at the origin,
 * upright, no rake, a configuration that cannot be unsound — the metric returned
 * **`sep = 2.400 m`**: no vertex was inside, so it fell through to vertex-to-edge distance
 * and reported the distance from A's far corner to B's side face as if it were daylight.
 * The 2.400 is `2.5 − 0.1`, i.e. half the wall length minus half the thickness, which is a
 * number about the TEST GEOMETRY and not about the building at all.
 *
 * ⭐ THE CONTROL IS WHAT CAUGHT IT. Every X row in the old matrix was *plausible*; it was
 *   only running plain-vertical-vs-plain-vertical through the same metric that made it
 *   unarguable, because that row has a known answer. RK1's own lesson generalised: a
 *   number that cannot be wrong for a known-good input is the only one worth trusting.
 *
 * The fix is SAT (separating-axis) overlap, which is exact for convex polygons and does
 * not care about winding: if no edge normal of either hull separates the two projections,
 * they overlap. The vertex-in-hull test is retained as a cheap first pass — it is correct
 * when it says yes, only incomplete when it says no.
 */
export function convexOverlap(ha: readonly Pt[], hb: readonly Pt[]): boolean {
    for (const poly of [ha, hb]) {
        for (let i = 0; i < poly.length; i++) {
            const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
            // Outward-facing axis for this edge; sign is irrelevant to a gap test.
            const ax = -(q.z - p.z), az = q.x - p.x;
            const len = Math.hypot(ax, az);
            if (!(len > 1e-12)) continue;
            const nx2 = ax / len, nz2 = az / len;
            let aLo = Infinity, aHi = -Infinity, bLo = Infinity, bHi = -Infinity;
            for (const v of ha) { const s = v.x * nx2 + v.z * nz2; if (s < aLo) aLo = s; if (s > aHi) aHi = s; }
            for (const v of hb) { const s = v.x * nx2 + v.z * nz2; if (s < bLo) bLo = s; if (s > bHi) bHi = s; }
            // A strict gap on ANY axis proves disjoint. Touching (gap 0) is NOT a gap:
            // two walls that meet flush must read as meeting, not as separated by zero.
            if (aHi < bLo - 1e-12 || bHi < aLo - 1e-12) return false;
        }
    }
    return true;
}

/** 0 when the two plan hulls touch or overlap; otherwise their closest approach. */
export function hullSeparation(a: readonly Pt[], b: readonly Pt[]): number {
    const ha = hull(a), hb = hull(b);
    if (ha.length < 3 || hb.length < 3) return minGap(a, b);
    for (const p of ha) if (pointInHull(p, hb)) return 0;
    for (const p of hb) if (pointInHull(p, ha)) return 0;
    // §WJ1-CROSSING-HULLS-SHARE-NO-VERTEX — the case the two lines above cannot see.
    if (convexOverlap(ha, hb)) return 0;
    let best = Infinity;
    for (const p of ha) for (let i = 0; i < hb.length; i++) best = Math.min(best, pointSegDist(p, hb[i]!, hb[(i + 1) % hb.length]!));
    for (const p of hb) for (let i = 0; i < ha.length; i++) best = Math.min(best, pointSegDist(p, ha[i]!, ha[(i + 1) % ha.length]!));
    return best;
}

export interface Cell {
    gate: string;            // OK | REFUSED:<code>
    leanA: number;           // plan travel of A's top ring centroid from its base centroid
    baseShared: number;
    topShared: number;
    baseGap: number;
    topGap: number;
    /** Hull-to-hull separation of the two SOLIDS -- the metric that survives a T and an X. */
    baseSep: number;
    topSep: number;
    /** JOINT signature: how much the two solids PART between floor and top. */
    openUp: number;
    /** Highest world-Y of any BODY vertex of A — the silhouette's top. */
    topRingY: number;
    /**
     * How many distinct plan positions of A's body sit at the FULL height `H`.
     *
     * §RK1-MAX-Y-CANNOT-SEE-A-PARTIAL-CUT — `topRingY` alone was the wrong instrument for
     * a profile and this field exists because it failed. A ring that cuts ONE END down
     * leaves the other end at full height, so the body's MAXIMUM y is unchanged at 3 and
     * the assertion read "expected 3 to be less than 2.999". The cut is real; a
     * whole-body extremum simply cannot see it. Counting how much of the wall still
     * REACHES the top can: a rectangle has its whole top edge there, a cut wall has less.
     */
    topRingCount: number;
    note: string;
}

/**
 * Build a pair through the REAL builder -- `refreshV2Cache` -> `WallJoinResolver` ->
 * `buildWall` -- and measure both bodies. A THROW is recorded as a cell value instead of
 * collapsing the whole matrix, because "this combination crashes the builder" is itself a
 * finding and must not be indistinguishable from "not measured".
 */
export function measure(A: WallData, B: WallData): Cell {
    const g = rakeAuthorability(A as never);
    const gate = g.ok ? 'OK' : `REFUSED:${g.code}`;
    try {
        const scene = new THREE.Scene();
        const builder = new WallFragmentBuilder(scene, levelProvider() as never);
        const walls = [A, B];
        builder.refreshV2Cache(walls.map(specOf));
        const joins = WallJoinResolver.resolveLevel(walls.map(w => ({ ...w })), { snapRadius: 0.5 });
        for (const w of walls) builder.buildWall(w, (joins.get(w.id) ?? null) as never, undefined, 0);

        const rootA = builder.getWallRoot(A.id) as unknown as THREE.Object3D | null;
        const rootB = builder.getWallRoot(B.id) as unknown as THREE.Object3D | null;
        if (!rootA || !rootB) {
            return { gate, leanA: NaN, baseShared: -1, topShared: -1, baseGap: NaN, topGap: NaN, baseSep: NaN, topSep: NaN, openUp: NaN, topRingY: NaN, topRingCount: -1, note: 'NO GROUP' };
        }
        const vA = bodyVertices(rootA), vB = bodyVertices(rootB);
        if (vA.length === 0 || vB.length === 0) {
            return { gate, leanA: NaN, baseShared: -1, topShared: -1, baseGap: NaN, topGap: NaN, baseSep: NaN, topSep: NaN, openUp: NaN, topRingY: NaN, topRingCount: -1, note: 'NO BODY GEOMETRY' };
        }
        const baseA = ringAt(vA, 0), baseB = ringAt(vB, 0);
        const topA = ringAt(vA, H), topB = ringAt(vB, H);
        if (topA.length === 0 || topB.length === 0) {
            return {
                gate, leanA: NaN,
                baseShared: baseA.length && baseB.length ? sharedCount(baseA, baseB, COINCIDENT_M) : -1,
                topShared: -1, baseGap: minGap(baseA, baseB), topGap: NaN,
                baseSep: hullSeparation(baseA, baseB), topSep: NaN, openUp: NaN, topRingY: NaN, topRingCount: -1,
                note: 'NO TOP RING AT y=H',
            };
        }
        // A's plan LEFT normal -- `leftPerp(d) = (-d.z, d.x)`, the SAME left every other
        // wall module uses (the `WallTypes.ts` rake sign convention, `WallFootprint2D`,
        // `JunctionResolverV2`). No second convention is minted here; for a curved wall
        // this is the CHORD normal, which is sufficient because only the DIFFERENCE
        // between the two heights is ever read.
        const ax = A.baseLine[1].x - A.baseLine[0].x;
        const az = A.baseLine[1].z - A.baseLine[0].z;
        const aL = Math.hypot(ax, az) || 1;
        const nx = -az / aL, nz = ax / aL;
        const baseGap = minGap(baseA, baseB);
        const topGap = minGap(topA, topB);
        const baseSep = hullSeparation(baseA, baseB);
        const topSep = hullSeparation(topA, topB);
        return {
            gate,
            leanA: Math.abs(lateralMid(topA, nx, nz) - lateralMid(baseA, nx, nz)),
            baseShared: sharedCount(baseA, baseB, COINCIDENT_M),
            topShared: sharedCount(topA, topB, COINCIDENT_M),
            baseGap, topGap, baseSep, topSep,
            openUp: topSep - baseSep,
            topRingY: Math.max(...vA.map(v => v.y)),
            topRingCount: topA.length,
            note: '',
        };
    } catch (e) {
        return { gate, leanA: NaN, baseShared: -1, topShared: -1, baseGap: NaN, topGap: NaN, baseSep: NaN, topSep: NaN, openUp: NaN, topRingY: NaN, topRingCount: -1, note: `THREW: ${(e as Error).message.slice(0, 70)}` };
    }
}

/** The pending report lines. Exported because AXIS 5/6 record GATE readings rather than
 *  measured pairs, so they push their own rows before calling `dump`. */
export const rows: string[] = [];
export function record(label: string, c: Cell): Cell {
    const n = (v: number) => (Number.isFinite(v) ? v.toExponential(3) : '    -    ');
    rows.push(
        `${label.padEnd(40)} gate=${c.gate.padEnd(18)} lean=${n(c.leanA)}  ` +
        `base(sh=${String(c.baseShared).padStart(2)} gap=${n(c.baseGap)} sep=${n(c.baseSep)})  ` +
        `TOP(sh=${String(c.topShared).padStart(2)} gap=${n(c.topGap)} sep=${n(c.topSep)})  ` +
        `openUp=${n(c.openUp)} ${c.note}`,
    );
    return c;
}

/**
 * The matrix goes to a FILE as well as to the console.
 *
 * §RK1-MATRIX-GOES-TO-A-FILE -- on this probe's first run the console dumps for AXIS 2
 * were ABSENT from the reporter's output while both AXIS 2 tests reported PASSED. A
 * matrix whose delivery depends on a reporter is a matrix that can silently arrive empty,
 * and an empty matrix is indistinguishable from a matrix of zeros -- the failure-and-
 * emptiness-are-the-same-value shape this file exists to avoid. The FILE is the artefact;
 * the console is a convenience. Override the path with `RK1_MATRIX_OUT`.
 */
let _outName = 'rk1-raked-matrix.txt';
let _outStarted = false;

/**
 * ⚠ SET THIS PER SUITE. Two suites sharing this module each get their OWN module instance
 * under vitest, but they share the DEFAULT FILE NAME — so without this they would race to
 * truncate one artefact and each would arrive half-written. A half-written artefact is
 * indistinguishable from a short one, which is the failure-and-emptiness-are-the-same-value
 * shape this rig exists to avoid.
 */
export function setDumpFile(name: string): void { _outName = name; _outStarted = false; }

const outPath = (): string => process.env.RK1_MATRIX_OUT ?? join(tmpdir(), _outName);

export function dump(title: string): void {
    const body =
        `\n[RK1 MATRIX -- ${title}]  (expected lean at 80 deg, h=3: ${EXPECTED_LEAN.toFixed(6)} m)\n`
        + rows.join('\n') + '\n';
    // eslint-disable-next-line no-console
    console.log(body);
    try {
        if (!_outStarted) {
            writeFileSync(outPath(), `RK1 raked-wall combination matrix -- ${new Date().toISOString()}\n`);
            _outStarted = true;
        }
        appendFileSync(outPath(), body);
    } catch { /* a probe that cannot write its file still reports to the console */ }
    rows.length = 0;
}

// --- The A-side body kinds ---------------------------------------------------
// Every kind is the SAME baseline so the only difference between rows is the body path.
export type Kind = 'plain' | 'layered3' | 'plain+window' | 'plain+door' | 'layered1+window' | 'layered3+window'
    | 'curved' | 'curved+window' | 'curved+layered3' | 'curved+layered3+window';

export function makeA(kind: Kind, s: [number, number], e: [number, number], rake: number): WallData {
    const curve = { control: { x: (s[0] + e[0]) / 2 + 1.2, y: 0, z: (s[1] + e[1]) / 2 + 1.2 }, segments: 24 };
    switch (kind) {
        case 'plain': return mk(s, e, { rake });
        case 'layered3': return mk(s, e, { rake, layers: LAYERS3 });
        case 'plain+window': return mk(s, e, { rake, openings: [WINDOW] });
        case 'plain+door': return mk(s, e, { rake, openings: [DOOR] });
        // §RK1-THE-REFUSAL-HAS-A-HOLE — ONE layer, an opening, and a rake. This is
        // AUTHORABLE today (`rakeAuthorability` refuses only `layers.length > 1`) and it
        // takes the SAME layered-with-openings body path as the refused three-layer case.
        // It is the founder's own wall: `CreateWallCommand` stamps `layers` from the
        // WallSystemType, and a 1-layer "Plain Wall" is what L-960 was reported on.
        case 'layered1+window': return mk(s, e, { rake, layers: LAYERS1, openings: [WINDOW] });
        case 'layered3+window': return mk(s, e, { rake, layers: LAYERS3, openings: [WINDOW] });
        case 'curved': return mk(s, e, { rake, curve });
        case 'curved+window': return mk(s, e, { rake, curve, openings: [WINDOW] });
        // L-1034 (founder, 2026-08-19) — the two three-way cells added after this file
        // was first written. Neither was in RK1's original brief and neither had ever
        // been measured.
        case 'curved+layered3': return mk(s, e, { rake, curve, layers: LAYERS3 });
        case 'curved+layered3+window': return mk(s, e, { rake, curve, layers: LAYERS3, openings: [WINDOW] });
    }
}

export const ALL_KINDS: Kind[] = [
    'plain', 'layered3', 'plain+window', 'plain+door', 'layered1+window', 'layered3+window',
    'curved', 'curved+window', 'curved+layered3', 'curved+layered3+window',
];

export type Topo = 'L' | 'T' | 'X';

export function pairFor(topo: Topo, kind: Kind, rakeA: number, bKind: Kind, rakeB: number): [WallData, WallData] {
    switch (topo) {
        case 'L':
            return [makeA(kind, [0, 0], [5, 0], rakeA), makeA(bKind, [0, 0], [0, 5], rakeB)];
        case 'T':
            return [makeA(kind, [0, 0], [5, 0], rakeA), makeA(bKind, [2.5, 0], [2.5, 5], rakeB)];
        case 'X':
            return [makeA(kind, [-2.5, 0], [2.5, 0], rakeA), makeA(bKind, [0, -2.5], [0, 2.5], rakeB)];
    }
}

