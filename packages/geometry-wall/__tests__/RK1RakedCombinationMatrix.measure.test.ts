/**
 * RK1 — THE RAKED-WALL COMBINATION MATRIX. A MEASUREMENT, NOT A FIX.
 *
 * C85 §11 #1 was CLOSED on 2026-08-18 (lane J1, `002db1c2`): one corner rule now serves
 * the three body paths it named — the plain sheared prism, the V2 layered band slicer,
 * and the opening-bearing body. C85 §12 R-9 binds that closure in place: the two
 * combinations it unblocked must NOT be re-refused.
 *
 * THIS FILE ASKS THE QUESTION THAT CLOSURE DOES NOT ANSWER: **which combinations does it
 * reach?** J1 measured ONE scene — an L-corner, 80 deg, h = 3 — against ONE neighbour.
 * The founder's subject is wider than that scene, so this file walks the cross-product
 * and PRINTS IT, including the cells where the answer is "the model will not hold this".
 *
 * -- THE THREE AXES, KEPT SEPARATE ON PURPOSE ----------------------------------------
 *
 * A cell can fail in three unrelated ways, and collapsing them is how "raked walls work"
 * becomes a claim nobody can check:
 *
 *   GATE      -- will `rakeAuthorability` let the MODEL hold this combination at all?
 *                This is the store-boundary question (`WallDataSchema` create,
 *                `WallStore.update`, `WallStore.addOpening` all consult it).
 *   BODY      -- does the built solid actually LEAN? Measured as the displacement of the
 *                TOP ring's extent midpoint from the BASE ring's, ALONG THE WALL'S PLAN
 *                LEFT NORMAL, which must equal `height * |cot theta|`. A raked wall that
 *                measures 0 here is the silently-wrong outcome: bolt upright on screen
 *                while the store holds 80. (It is an extent midpoint and not a centroid
 *                for a reason this probe found the hard way -- §RK1-LEAN-IS-NOT-A-CENTROID.)
 *   JOINT     -- does the corner CLOSE at the top as well as at the floor? Reported TWICE,
 *                because one number cannot serve all three topologies: `gap` is the rings'
 *                vertex-to-vertex closest approach, which is the right question at an L
 *                (a sound mitre makes the two walls SHARE corner vertices) and the wrong
 *                one at a T or an X (§RK1-VERTEX-GAP-IS-NOT-A-T-JOINT); `sep` is the plan
 *                HULL-to-HULL separation, which is 0 whenever the two solids touch and is
 *                therefore meaningful at all three. `openUp = topSep - baseSep` is the
 *                signature: sound at the floor, open at the top, is L-955's exact shape --
 *                the wedge of daylight that widens with height.
 *
 * -- WHY REFUSED COMBINATIONS ARE STILL BUILT AND STILL MEASURED ---------------------
 *
 * `WallFragmentBuilder` does not consult `rakeAuthorability` -- the gate lives at the
 * store boundary. So a refused combination can still be handed to the builder here, and
 * what it draws is EVIDENCE ABOUT THE REFUSAL: a refusal whose stated reason is
 * "this path has no shear" is only honest for as long as that path has no shear.
 * Measuring it is how the reason stays checkable instead of becoming folklore. Nothing
 * in this file changes a gate; it reports `GATE=REFUSED` and the geometry side by side.
 *
 * THIS FILE MUST NOT BE READ AS AUTHORISING ANY COMBINATION. It reports. C85 section 12
 * R-9 binds what may not be re-refused; nothing here lifts or adds a refusal.
 *
 * -- HONEST BLANKS ------------------------------------------------------------------
 *
 * What this file does NOT reach is listed in `§RK1-MATRIX-BLANKS` at the foot, and the
 * blanks are the point: they tell the next reader where to look. A matrix with blanks
 * beats a claim that "joins work".
 *
 * Tolerance is the canonical `COINCIDENT_M` (1 mm) from `@pryzm/geometry-kernel`, per
 * C73 section 2.2 -- no epsilon is invented here.
 *
 * @file packages/geometry-wall/__tests__/RK1RakedCombinationMatrix.measure.test.ts
 */

import { describe, it, expect } from 'vitest';
import { appendFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as THREE from '@pryzm/renderer-three/three';
import { COINCIDENT_M } from '@pryzm/geometry-kernel';

import { WallFragmentBuilder } from '../src/WallFragmentBuilder';
import { WallJoinResolver } from '../src/WallJoinResolver';
import { type LevelWallSpec } from '../src/WallPipelineV2';
import { rakeAuthorability, rakeShearPerMetre } from '../src/WallRake';
import { profileAuthorability } from '../src/WallProfile';
import type { WallData } from '../src/WallTypes';

// --- The scene constants -----------------------------------------------------
const RAKE = 80;                 // the founder's angle
const VERT = 90;
const H = 3;
const T = 0.2;
const LAYERS3 = [0.0125, 0.075, 0.0125];
/** ONE layer — the founder's "Plain Wall" as `CreateWallCommand` stamps it from a system type. */
const LAYERS1 = [0.2];
const K = rakeShearPerMetre(RAKE);        // cot(80 deg) ~= 0.176327
const EXPECTED_LEAN = H * Math.abs(K);    // ~= 0.52898 m

let _seq = 0;

interface MkOpts {
    layers?: number[];
    rake?: number;
    openings?: unknown[];
    curve?: { control: { x: number; y: number; z: number }; segments: number };
}

function mk(s: [number, number], e: [number, number], opts: MkOpts = {}): WallData {
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

const WINDOW = { id: 'w-1', type: 'window', offset: 2.0, width: 1.2, height: 1.4, sillHeight: 0.9 };
const DOOR = { id: 'd-1', type: 'door', offset: 1.0, width: 0.9, height: 2.1, sillHeight: 0 };

const specOf = (w: WallData): LevelWallSpec => ({
    id: w.id,
    startXZ: { x: w.baseLine[0].x, z: w.baseLine[0].z },
    endXZ: { x: w.baseLine[1].x, z: w.baseLine[1].z },
    thickness: w.thickness,
    rakeAngleDeg: (w as unknown as { rakeAngleDeg?: number }).rakeAngleDeg,
    layered: ((w as unknown as { layers?: unknown[] }).layers?.length ?? 0) > 1,
});

function levelProvider() {
    const level = { id: 'L', name: 'Ground', elevation: 0, height: H, childrenIds: [] };
    return {
        getLevelById: (id: string) => (id === 'L' ? { ...level } : undefined),
        getLevels: () => [{ ...level }],
    };
}

// --- Measurement -------------------------------------------------------------
interface Pt { x: number; z: number }

/**
 * WORLD-space vertices of the wall-BODY meshes under `root`. Identical selection rule to
 * `L955RakedJoinCorner.test.ts` -- no `elementType` (plain V2 body), `'WallLayer'` (the
 * layered bands) and `'WallPart'` (the segments an opening-bearing wall is built from).
 * `localToWorld` is what makes the §RAKE-HOSTED-OPENING child shear MATRIX visible: that
 * shear lives in the matrix, never in the buffer, so a buffer-space reading would report
 * every raked wall as vertical and this whole file would measure nothing.
 */
function bodyVertices(root: THREE.Object3D): THREE.Vector3[] {
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
function ringAt(verts: readonly THREE.Vector3[], y: number): Pt[] {
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
function lateralMid(r: readonly Pt[], nx: number, nz: number): number {
    if (r.length === 0) return NaN;
    let lo = Infinity, hi = -Infinity;
    for (const p of r) {
        const s = p.x * nx + p.z * nz;
        if (s < lo) lo = s;
        if (s > hi) hi = s;
    }
    return (lo + hi) / 2;
}

function sharedCount(a: readonly Pt[], b: readonly Pt[], tol: number): number {
    return a.filter(p => b.some(q => Math.hypot(p.x - q.x, p.z - q.z) <= tol)).length;
}

/**
 * Closest approach between two rings measured VERTEX-TO-VERTEX.
 *
 * Correct at an L, where a sound mitre makes the two walls SHARE corner vertices, and
 * that sharing is the thing being measured. ⚠ MEANINGLESS AT A T OR AN X -- see
 * {@link hullSeparation}. Both are reported so the two are never confused.
 */
function minGap(a: readonly Pt[], b: readonly Pt[]): number {
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
function hull(pts: readonly Pt[]): Pt[] {
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

function pointSegDist(p: Pt, a: Pt, b: Pt): number {
    const vx = b.x - a.x, vz = b.z - a.z;
    const len2 = vx * vx + vz * vz;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / len2));
    return Math.hypot(p.x - (a.x + t * vx), p.z - (a.z + t * vz));
}

function pointInHull(p: Pt, h: readonly Pt[]): boolean {
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
function convexOverlap(ha: readonly Pt[], hb: readonly Pt[]): boolean {
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
function hullSeparation(a: readonly Pt[], b: readonly Pt[]): number {
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

interface Cell {
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
function measure(A: WallData, B: WallData): Cell {
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

const rows: string[] = [];
function record(label: string, c: Cell): Cell {
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
const OUT = process.env.RK1_MATRIX_OUT ?? join(tmpdir(), 'rk1-raked-matrix.txt');
let _outStarted = false;

function dump(title: string): void {
    const body =
        `\n[RK1 MATRIX -- ${title}]  (expected lean at 80 deg, h=3: ${EXPECTED_LEAN.toFixed(6)} m)\n`
        + rows.join('\n') + '\n';
    // eslint-disable-next-line no-console
    console.log(body);
    try {
        if (!_outStarted) {
            writeFileSync(OUT, `RK1 raked-wall combination matrix -- ${new Date().toISOString()}\n`);
            _outStarted = true;
        }
        appendFileSync(OUT, body);
    } catch { /* a probe that cannot write its file still reports to the console */ }
    rows.length = 0;
}

// --- The A-side body kinds ---------------------------------------------------
// Every kind is the SAME baseline so the only difference between rows is the body path.
type Kind = 'plain' | 'layered3' | 'plain+window' | 'plain+door' | 'layered1+window' | 'layered3+window'
    | 'curved' | 'curved+window' | 'curved+layered3' | 'curved+layered3+window';

function makeA(kind: Kind, s: [number, number], e: [number, number], rake: number): WallData {
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

const ALL_KINDS: Kind[] = [
    'plain', 'layered3', 'plain+window', 'plain+door', 'layered1+window', 'layered3+window',
    'curved', 'curved+window', 'curved+layered3', 'curved+layered3+window',
];

// --- AXIS 1 -- the BODY. Does a raked wall of each kind actually lean? -------

describe('RK1 §RK1-MATRIX -- AXIS 1: does the BODY lean, per body path', () => {
    it('every body kind, raked 80 deg and vertical 90 deg, measured against h*cot(theta)', () => {
        const results = new Map<Kind, { raked: Cell; vert: Cell }>();
        for (const kind of ALL_KINDS) {
            // A lone wall: B is placed far away so no join is resolved and the ONLY thing
            // measured is A's own body. A joint cannot mask a missing shear here.
            const far = () => mk([50, 50], [55, 50], { rake: VERT });
            const raked = record(`BODY ${kind} @80`, measure(makeA(kind, [0, 0], [5, 0], RAKE), far()));
            const vert = record(`BODY ${kind} @90`, measure(makeA(kind, [0, 0], [5, 0], VERT), far()));
            results.set(kind, { raked, vert });
        }
        dump('AXIS 1: BODY');

        // (a) THE CONTROL, and it must never move: a VERTICAL wall of every kind measures
        // exactly zero lean. If this ever fails the PROBE is wrong -- as it was on the
        // first run, see §RK1-LEAN-IS-NOT-A-CENTROID -- and nothing else here is believable.
        for (const kind of ALL_KINDS) {
            const v = results.get(kind)!.vert;
            expect(Number.isFinite(v.leanA), `${kind} @90 produced a measurable body`).toBe(true);
            expect(v.leanA, `${kind} @90 must be bolt upright`).toBeLessThan(COINCIDENT_M);
        }

        // (b) THE R-9 GUARD. `plain`, `layered3` and the two opening-bearing kinds are
        // SHIPPED and FOUNDER-CONFIRMED (C85 section 12 R-9: "the bodies are correct and
        // founder-confirmed"). Their lean is asserted EXACTLY, not merely observed, so
        // that no later change can quietly stand one of them back up -- which is the
        // silently-wrong outcome, and the one this subsystem refuses to ship.
        for (const kind of ['plain', 'layered3', 'plain+window', 'plain+door'] as Kind[]) {
            expect(results.get(kind)!.raked.leanA, `${kind} @80 must lean by h*cot(theta)`)
                .toBeCloseTo(EXPECTED_LEAN, 6);
        }

        // (c) THE REST IS MEASUREMENT, DELIBERATELY UNASSERTED. Which of the remaining
        // kinds lean and which do not is the finding this file exists to publish; asserting
        // today's reading would freeze the current defects in as the specification. The
        // readings are pinned as named defects in the dedicated tests below instead.
    });
});

// --- AXIS 2 -- the JOINT, at three topologies -------------------------------
// L: shared endpoint. T: stem meets host mid-edge. X: two walls crossing.

type Topo = 'L' | 'T' | 'X';

function pairFor(topo: Topo, kind: Kind, rakeA: number, bKind: Kind, rakeB: number): [WallData, WallData] {
    switch (topo) {
        case 'L':
            return [makeA(kind, [0, 0], [5, 0], rakeA), makeA(bKind, [0, 0], [0, 5], rakeB)];
        case 'T':
            return [makeA(kind, [0, 0], [5, 0], rakeA), makeA(bKind, [2.5, 0], [2.5, 5], rakeB)];
        case 'X':
            return [makeA(kind, [-2.5, 0], [2.5, 0], rakeA), makeA(bKind, [0, -2.5], [0, 2.5], rakeB)];
    }
}

describe('RK1 §RK1-MATRIX -- AXIS 2: the JOINT, L / T / X', () => {
    it('every body kind against a PLAIN RAKED neighbour, at all three topologies', () => {
        for (const topo of ['L', 'T', 'X'] as Topo[]) {
            for (const kind of ALL_KINDS) {
                const [A, B] = pairFor(topo, kind, RAKE, 'plain', RAKE);
                record(`${topo} ${kind}@80 vs plain@80`, measure(A, B));
            }
        }
        dump('AXIS 2: JOINT vs plain raked');
    });

    it('MIXED neighbours -- raked vs vertical, raked vs opposite lean, raked vs layered raked', () => {
        for (const kind of ['plain', 'layered3', 'plain+window', 'layered3+window'] as Kind[]) {
            record(`L ${kind}@80 vs plain@90 VERTICAL`, measure(...pairFor('L', kind, RAKE, 'plain', VERT)));
            record(`L ${kind}@80 vs plain@110 OPPOSITE`, measure(...pairFor('L', kind, RAKE, 'plain', 110)));
            record(`L ${kind}@80 vs layered3@80`, measure(...pairFor('L', kind, RAKE, 'layered3', RAKE)));
        }
        dump('AXIS 2b: MIXED neighbours');
    });
});

// --- AXIS 3 -- never conclude from one sample -------------------------------

describe('RK1 §RK1-MATRIX -- AXIS 3: the angle and the length are not one sample', () => {
    it('the plain CONTROL corner holds across five rake angles and three wall lengths', () => {
        const cells: Array<{ deg: number; len: number; c: Cell }> = [];
        for (const deg of [20, 60, 80, 110, 160]) {
            for (const len of [1.0, 5.0, 12.0]) {
                const A = mk([0, 0], [len, 0], { rake: deg });
                const B = mk([0, 0], [0, len], { rake: deg });
                cells.push({ deg, len, c: record(`CONTROL plain@${deg} L=${len}m`, measure(A, B)) });
            }
        }
        dump('AXIS 3: angle x length sweep');

        // EVERY cell closes at the FLOOR. ADR-0310's uniform shear is exact there, on every
        // angle and every length -- so a failure here would be a different and much larger
        // defect than the one below, and separating them is the point of asserting it.
        for (const { deg, len, c } of cells) {
            expect(Number.isFinite(c.baseGap), `plain@${deg} L=${len}: a BASE ring was measured`).toBe(true);
            expect(c.baseGap, `plain@${deg} L=${len}: the mitre closes at the FLOOR`).toBeLessThan(COINCIDENT_M);
            expect(c.baseShared, `plain@${deg} L=${len}: >= 2 shared corners at the FLOOR`).toBeGreaterThanOrEqual(2);
        }

        // THE TOP closes only inside a BAND, and the band is the finding. It is asserted
        // for the shallow leans a building actually uses -- which is the founder-confirmed
        // configuration and the one J1 measured -- and NOT asserted outside it, because
        // outside it the corner is open TODAY and pinning it green would be a lie while
        // pinning it open would freeze a defect in as the specification. The open half is
        // pinned separately, and deliberately, as L-1060 below.
        for (const { deg, len, c } of cells) {
            const lean = H * Math.abs(1 / Math.tan((deg * Math.PI) / 180));
            if (lean > len) continue;                     // outside the band -- see L-1060
            expect(c.topGap, `plain@${deg} L=${len} (lean ${lean.toFixed(2)} <= L): TOP faces touch`)
                .toBeLessThan(COINCIDENT_M);
            expect(c.topShared, `plain@${deg} L=${len}: as many corners at TOP as at floor`)
                .toBeGreaterThanOrEqual(c.baseShared);
        }
    });

    /**
     * L-1060 -- THE OPEN CORNER AT A STEEP LEAN IS **CORRECT GEOMETRY, SILENTLY DELIVERED**.
     *
     * C85 section 11 #1 was closed on ONE scene: 80 deg, h = 3, L = 5, an L-corner. The
     * sweep above walks the same axis to its ends and finds, on the plain-to-plain path
     * that is otherwise FOUNDER-CONFIRMED GOOD:
     *
     *     plain@20 L=1m   TOP gap 7.142 m,  0 shared corners   (floor: 3 shared, gap 0)
     *     plain@20 L=5m   TOP gap 3.142 m,  0 shared corners
     *     plain@20 L=12m  TOP gap 0,        3 shared corners   -- closed again
     *
     * ⚠ AND THE FIRST READING OF THAT WAS WRONG, SO IT IS RECORDED RATHER THAN QUIETLY
     *   REPLACED (C84 section 6). This pin was first written as `it.fails` demanding the
     *   top corner CLOSE. It must not. At 20 deg and h = 3 each wall's top travels
     *   `3 * cot(20 deg)` = 8.24 m along its OWN plan normal, and the two normals are
     *   perpendicular -- so at the top A occupies a band 8.24 m in +Z while B occupies one
     *   8.24 m in -X, and the two solids DO NOT INTERSECT AT ALL up there. There is no
     *   mitre to draw. Demanding one would have been demanding geometry that cannot exist,
     *   and `it.fails` would have made that demand look like a defect report.
     *
     * WHAT IS ACTUALLY WRONG IS THE SILENCE, and it is two things:
     *
     *   (a) The ADR-0312 twin-solve loft DECLINED this corner -- `loftOffsets`
     *       (`WallPipelineV2.ts:91`) returns null on an orientation flip (`:111`) or a
     *       drift past `RAKE_JOINT_MAX_DRIFT_PER_M` (`:104`) -- and the build degraded to
     *       ADR-0310's uniform shear, which is floor-exact by construction. That is an
     *       honest degradation IN THE CODE and an invisible one IN THE SCENE: nothing on
     *       the built group distinguishes "the loft solved this corner" from "the loft
     *       gave up and you are looking at a floor-exact joint". Failure and emptiness
     *       print alike, which is the one thing this subsystem's contract forbids.
     *   (b) NOTHING RELATES THE RAKE TO THE WALL IT IS ON. `rakeAuthorability` checks the
     *       ANGLE against [15, 165] and nothing else -- not the height, not the length. A
     *       15 deg rake on a 3 m wall leans 11.2 m, which is authorable on a 1 m wall and
     *       is not a building. Whether that should be refused, warned, or left alone is a
     *       FOUNDER decision (it is an authoring policy, not a geometry bug) and this lane
     *       does not take it.
     *
     * So this is a CHARACTERISATION, asserted in the direction the geometry actually goes.
     * It fails if the band moves -- in either direction -- which is what makes it a pin.
     */
    it('L-1060 -- a steep lean SEPARATES the two solids, and the floor stays exact', () => {
        const steep = measure(mk([0, 0], [1, 0], { rake: 20 }), mk([0, 0], [0, 1], { rake: 20 }));
        expect(steep.baseGap, 'the FLOOR still closes -- this is not a collapsed corner')
            .toBeLessThan(COINCIDENT_M);
        expect(steep.baseShared, 'and it closes on the same corners as any other angle')
            .toBeGreaterThanOrEqual(2);
        // The tops are far apart because the wall leans further than it is long. Asserted
        // as a LOWER bound so the reading cannot be mistaken for a tolerance.
        expect(steep.topGap, 'the two TOPS genuinely separate -- there is no mitre to draw')
            .toBeGreaterThan(1.0);

        // The SAME angle on a wall long enough to still overlap at the top closes exactly,
        // which is what makes the reading above a RATIO effect and not an ANGLE effect.
        const long = measure(mk([0, 0], [12, 0], { rake: 20 }), mk([0, 0], [0, 12], { rake: 20 }));
        expect(long.topGap, 'at L = 12 m the same 20 deg corner closes at the TOP')
            .toBeLessThan(COINCIDENT_M);
        expect(long.topShared, 'and shares as many corners at the top as at the floor')
            .toBeGreaterThanOrEqual(long.baseShared);
    });
});

// --- AXIS 4 -- the two standing refusals, and whether their REASONS are still true ---

/**
 * `rakeAuthorability` refuses exactly two combinations that this lane's subject contains,
 * and each refusal states a GEOMETRIC reason. A refusal is only honest for as long as its
 * stated reason is true, so each is checked against what the builder actually draws.
 *
 * ⛔ NOTHING HERE LIFTS A REFUSAL, and nothing here is a re-refusal either -- both arms
 *    PREDATE C85 section 12 R-9 and neither was ever shipped. R-9 binds two DIFFERENT
 *    combinations: layered-raked with NO openings, and a single-layer raked wall HOSTING
 *    an opening. The matrix above confirms both of those lean correctly and are gated OK.
 */
describe('RK1 §RK1-MATRIX -- AXIS 4: are the two standing refusals still factually true?', () => {
    const far = () => mk([50, 50], [55, 50], { rake: VERT });

    /**
     * ⚠ THIS TEST ONCE ASSERTED THE OPPOSITE, AND THE REVERSAL IS RECORDED RATHER THAN
     *   OVERWRITTEN (C84 §6). As first written it read *"the gate refuses, and the path
     *   really has NO shear"*, and it ended:
     *
     *       expect(c.leanA, 'and it builds BOLT UPRIGHT: the refusal reason is TRUE,
     *                        not folklore').toBeLessThan(COINCIDENT_M);
     *
     *   That was TRUE when measured, and it was the evidence that justified the fix. It
     *   is FALSE now, because §FEAT-RAKE-LAYERED-OPENINGS gave the path its shear — so
     *   the assertion had become a demand for the defect's return, which is the trap
     *   `A2b`/`A3b` in `WallProfileNonRegressionBaseline` were sitting in when this lane
     *   picked them up. A pin that records a defect MUST say what to do when it goes red.
     *   This one now records both states, and asserts the fixed one.
     *
     * WHAT REMAINS TRUE: the GATE still refuses. That is a separate fact from the
     * geometry, and it is deliberately left alone — see the assertion's own comment.
     */
    it('L-1061 -- layered x openings x rake LEANS, and the gate now ADMITS it', () => {
        // ⚠ THIS ASSERTION HAS NOW BEEN REVERSED TWICE, AND BOTH REVERSALS ARE RECORDED
        //   (C84 §6). Draft 1 asserted the path had NO shear and built BOLT UPRIGHT — true
        //   when measured, and the evidence that justified the fix. Draft 2 asserted the
        //   body leaned while the GATE still refused, and flagged that state as knowingly
        //   incoherent and awaiting a decision. The founder has now given it
        //   (2026-08-19, *"this needs to be in place"*), so the arm is lifted and this is
        //   draft 3: the combination is authorable AND correct.
        const g = rakeAuthorability({ rakeAngleDeg: RAKE, layers: [{}, {}, {}], openings: [{ id: 'o' }] });
        expect(g.ok, 'L-1064: the layered x openings arm is LIFTED — its stated reason was measured false').toBe(true);
        expect(g.code).toBeUndefined();

        // The body measurement that made the lift defensible, kept as the standing proof.
        const c = measure(makeA('layered3+window', [0, 0], [5, 0], RAKE), far());
        expect(Number.isFinite(c.leanA), 'the combination BUILDS -- it does not throw').toBe(true);
        expect(c.leanA, 'the body LEANS by h*cot(theta) -- the refusal reason no longer holds')
            .toBeCloseTo(EXPECTED_LEAN, 6);

        // The control that makes the reading mean something: the SAME layer stack with the
        // openings removed leans identically, so the two arms of the layered router now
        // agree about the shear instead of differing by it.
        const ctl = measure(makeA('layered3', [0, 0], [5, 0], RAKE), far());
        expect(ctl.leanA, 'layered WITHOUT openings leans by the same amount')
            .toBeCloseTo(EXPECTED_LEAN, 6);
        expect(Math.abs(c.leanA - ctl.leanA), 'and the two arms agree to within COINCIDENT_M')
            .toBeLessThan(COINCIDENT_M);
    });

    /**
     * THE JOINT half of the same fix — the body leaning is not enough. Before
     * §FEAT-RAKE-LAYERED-OPENINGS this corner opened by 0.7097 m between floor and top
     * (measured: `L layered3+window@80 vs plain@80  base sep 7.713e-4 → TOP sep 5.298e-1`),
     * which is L-955's exact signature on a path L-955 never reached.
     */
    it('§FEAT-RAKE-LAYERED-OPENINGS -- and the CORNER does not open with height', () => {
        for (const kind of ['layered1+window', 'layered3+window'] as Kind[]) {
            const c = measure(...pairFor('L', kind, RAKE, 'plain', RAKE));
            expect(c.baseSep, `${kind}: the solids meet at the FLOOR`).toBeLessThan(COINCIDENT_M);
            expect(c.topSep, `${kind}: and they still meet at the TOP`).toBeLessThan(COINCIDENT_M);
            expect(Math.abs(c.openUp), `${kind}: the corner does not OPEN between floor and top`)
                .toBeLessThan(COINCIDENT_M);
        }
    });

    /**
     * §RK1-THE-REFUSAL-HAS-A-HOLE — and this is the row that makes L-1061 a LIVE defect
     * rather than a statement about code nobody can reach.
     *
     * `rakeAuthorability`'s `layered` arm refuses `layers.length > 1 AND openings.length > 0`.
     * `WallFragmentBuilder`'s layered branch is entered on `layers.length > 0`. **The two
     * thresholds differ by one**, so a ONE-LAYER wall that hosts an opening and carries a
     * rake is fully authorable — schema, store, occupancy gate, property panel, chat — and
     * lands on exactly the body path the refusal exists to keep raked walls off.
     *
     * That wall is not hypothetical. `CreateWallCommand` stamps `layers` from the wall's
     * WallSystemType, and a 1-layer "Plain Wall" is what L-960 was reported on — the
     * founder's own. So "layered × openings × rake has no shear" was reachable in
     * production the whole time, through the gap in its own gate.
     *
     * This is asserted, not merely measured: the gate must keep admitting it (refusing it
     * would be the wrong fix — the geometry is what needed repair, not the affordance) and
     * the body must lean.
     */
    it('§RK1-THE-REFUSAL-HAS-A-HOLE -- a ONE-layer raked wall with an opening is AUTHORABLE', () => {
        const g = rakeAuthorability({ rakeAngleDeg: RAKE, layers: [{}], openings: [{ id: 'o' }] });
        expect(g.ok, 'one layer is not the layered case: the gate admits this wall').toBe(true);

        const c = measure(makeA('layered1+window', [0, 0], [5, 0], RAKE), far());
        expect(Number.isFinite(c.leanA), 'it builds').toBe(true);
        expect(c.leanA, 'and it must LEAN -- it is reachable, so it cannot be left upright')
            .toBeCloseTo(EXPECTED_LEAN, 6);
    });

    it('L-1062 -- curved x rake is ADMITTED and BUILT as a cone; only COLLAPSE is refused', () => {
        // ⚠ REVERSED, AND THE PRIOR STATE RECORDED (C84 §6). This asserted that the curved
        //   arm refuses and that the path "really has NO shear" — both true when measured.
        //   §FEAT-RAKE-CURVED replaced the blanket refusal with the conical sweep, so the
        //   gate now admits a curved rake and refuses only the case that is geometrically
        //   impossible: a top arc pushed inward past its own centre of curvature.
        const g = rakeAuthorability({ rakeAngleDeg: RAKE, curve: { control: { x: 1, y: 0, z: 1 }, segments: 16 } });
        expect(g.ok, 'a curved wall may now hold a rake').toBe(true);

        // The surviving arm, and it names BOTH numbers rather than saying "invalid".
        const collapse = rakeAuthorability({
            rakeAngleDeg: 20, curve: { control: { x: 1, y: 0, z: 1 }, segments: 16 },
            height: 3, curveMinRadiusM: 0.5,
        });
        expect(collapse.ok, 'a lean deeper than the turn radius is refused').toBe(false);
        expect(collapse.code).toBe('curved-collapse');
        expect(collapse.reason, 'the refusal quotes the shift').toMatch(/8\.24/);
        expect(collapse.reason, 'and the radius').toMatch(/0\.500/);

        // UNJUDGEABLE IS NOT FAILURE: without height and radius the arm cannot run, and
        // the wall proceeds rather than being refused on a fact nobody measured.
        expect(rakeAuthorability({ rakeAngleDeg: 20, curve: { control: { x: 1, y: 0, z: 1 }, segments: 16 } }).ok)
            .toBe(true);
    });

    /**
     * The half of R-9 that a future lane is most likely to walk into by accident. Both
     * combinations R-9 protects are asserted GATE-OPEN here, so a change that re-adds
     * either arm to `rakeAuthorability` fails in this file with R-9 named, rather than
     * being discovered by the founder on a deploy.
     */
    it('R-9 GUARD -- layered-raked and opening-on-raked are AUTHORABLE and must stay so', () => {
        expect(rakeAuthorability({ rakeAngleDeg: RAKE, layers: [{}, {}, {}] }).ok,
            'C85 section 12 R-9: layered-raked (no openings) must NOT be re-refused').toBe(true);
        expect(rakeAuthorability({ rakeAngleDeg: RAKE, openings: [{ id: 'o' }] }).ok,
            'C85 section 12 R-9: an opening on a raked wall must NOT be re-refused').toBe(true);
        expect(rakeAuthorability({ rakeAngleDeg: RAKE, layers: [{}], openings: [{ id: 'o' }] }).ok,
            'a SINGLE-layer wall with an opening is not the layered case').toBe(true);
    });
});

// --- AXIS 4b -- D-CURVED #4: a curved RAKED wall against EVERY other wall ------------

/**
 * The founder's words were *"with sound joints with any other walls"*, so this walks the
 * neighbour axis rather than sampling it. A is a curved raked wall throughout; only B
 * changes.
 *
 * WHAT "SOUND" MEANS HERE, and why it is `sep` and not `gap`: at an L the two solids must
 * TOUCH at the floor and still touch at the top. Shared-vertex counting (`gap`) is the
 * right question when both ends are straight mitres, and the wrong one the moment an arc
 * is involved — a curved end face meets a straight one along a line neither tessellates
 * the same way, so they can be flush and still share no vertex. Hull separation answers
 * "do these two solids meet?" for every combination, which is what the founder asked.
 *
 * `openUp = topSep - baseSep` is the L-955 signature: sound at the floor, open at the top.
 */
describe('RK1 D-CURVED #4 -- a curved RAKED wall joined to every other kind', () => {
    const NEIGHBOURS: ReadonlyArray<readonly [string, Kind, number]> = [
        ['straight plain VERTICAL', 'plain', VERT],
        ['straight plain RAKED (same lean)', 'plain', RAKE],
        ['straight plain RAKED (opposite)', 'plain', 110],
        ['straight LAYERED raked', 'layered3', RAKE],
        ['straight raked + WINDOW', 'plain+window', RAKE],
        ['CURVED unraked', 'curved', VERT],
        ['CURVED raked', 'curved', RAKE],
        ['CURVED layered raked', 'curved+layered3', RAKE],
    ];

    for (const aKind of ['curved', 'curved+layered3', 'curved+window'] as Kind[]) {
        it(`${aKind}@80 closes against every neighbour, at the floor AND at the top`, () => {
            const results: Array<{ label: string; c: Cell }> = [];
            for (const [label, bKind, bRake] of NEIGHBOURS) {
                const [A, B] = pairFor('L', aKind, RAKE, bKind, bRake);
                results.push({ label, c: record(`L ${aKind}@80 vs ${label}`, measure(A, B)) });
            }
            dump(`AXIS 4b: ${aKind}@80 vs every neighbour`);

            for (const { label, c } of results) {
                expect(Number.isFinite(c.baseSep), `${label}: both bodies built`).toBe(true);
                // THE FLOOR IS EXACT AT EVERY NEIGHBOUR, and that is asserted hard. It is
                // ADR-0310's guarantee and it survives the conical sweep unchanged.
                expect(c.baseSep, `${label}: the two solids MEET at the floor`).toBeLessThan(COINCIDENT_M);
                // ✅ THE TOP IS NOW ASSERTED CLOSED TOO (L-1066, closed 2026-08-19). This
                //    block used to assert only that the opening was BOUNDED by the leans
                //    that caused it, because the top genuinely did not close and pinning
                //    it green would have been a lie. It closes now, at every neighbour.
                expect(c.topSep, `${label}: and they still MEET at the top`)
                    .toBeLessThan(COINCIDENT_M);
                expect(Math.abs(c.openUp), `${label}: the corner does not OPEN with height`)
                    .toBeLessThan(COINCIDENT_M);
            }
        });
    }

    /**
     * L-1066 — THE CURVED CORNER IS FLOOR-EXACT ONLY. The bodies are right; the JOINT is
     * where L-955's fix has not reached.
     *
     * Measured, curved raked ↔ straight raked at an L, 80°, h = 3:
     *
     *     baseSep 0.000    topSep 0.555    openUp 0.555
     *
     * and the pattern across neighbours names the mechanism exactly:
     *
     *     vs plain VERTICAL        openUp 0.026   (neighbour barely moves)
     *     vs plain RAKED opposite  openUp 0.000   (tops move TOWARD each other)
     *     vs plain RAKED same lean openUp 0.555   (tops move APART)
     *     vs CURVED unraked        openUp 0.000
     *     vs CURVED raked          openUp 0.347
     *
     * THE CAUSE IS NOT THE CONICAL SWEEP — the bodies are correct and pinned exactly by
     * `RK1CurvedRakedConicalSweep.test.ts`. It is that the ADR-0312 TWIN-SOLVE LOFT, which
     * re-solves the mitre in the DISPLACED plan and is what closed L-955 for straight
     * walls, never runs for a curved one: `rakeJointCapDrift` is gated `!wall.curve`, and
     * `WallPipelineV2Cache.refresh` takes straight `startXZ`/`endXZ` specs and has no way
     * to describe an arc. So a curved raked wall places its shared top corner by ADR-0310's
     * uniform rule while its straight raked neighbour places the same corner by the lofted
     * one — two rules at one corner, which is verbatim the defect class L-955 was.
     *
     * ⚠ THIS IS THE REMAINING HALF OF THE FOUNDER'S MANDATE. The bodies asked for are
     *   built; *"sound joints with any other walls"* is not finished until the loft reaches
     *   the arc. Closing it means teaching the V2 probe-solve about curved walls — a real
     *   piece of work, not a patch, and larger than the sweep itself.
     *
     * ✅ CLOSED 2026-08-19 by §FEAT-RAKE-CURVED-JOINT, and the pin did its job: it was
     * written `it.fails`, and the day the fix landed vitest reported "expected to fail but
     * passed" — which is exactly why it was written that way rather than deleted. Flipped
     * to a live assertion here rather than removed, so the corner cannot silently reopen.
     *
     * THE FIX, and the two wrong drafts that preceded it, because the ORDER was the whole
     * thing and neither wrong draft was obviously wrong:
     *   · draft 1 ADDED the loft to the already-coned corner — `openUp` unmoved at 0.555 m,
     *     lean 0.497 → 0.773. One displacement counted twice.
     *   · draft 2 replaced the cone but applied the loft BEFORE `projectCapVertex` —
     *     `openUp` BIT-IDENTICAL to the pre-fix run. The projection solves for the
     *     along-axis coordinate on the base mitre plane, so it overwrote the drift.
     *   · draft 3 (this one) strips the cone from the cap columns, projects, THEN adds the
     *     loft. The top cap corner is `base mitre corner + loft` — the same answer
     *     `rakeJointCapDrift` hands the straight neighbour for the same corner.
     */
    it('L-1066 -- a curved raked corner closes at the TOP, at every neighbour', () => {
        const c = measure(...pairFor('L', 'curved', RAKE, 'plain', RAKE));
        expect(c.baseSep, 'the floor is exact').toBeLessThan(COINCIDENT_M);
        expect(c.topSep, 'L-1066: and so is the top').toBeLessThan(COINCIDENT_M);
        // The sharper statement, and the one that would catch a regression the hull
        // metric could miss: the top corner sits in the SAME relative position as the
        // base corner, i.e. the joint does not open with height at all.
        expect(Math.abs(c.topGap - c.baseGap), 'the corner does not move between floor and top')
            .toBeLessThan(COINCIDENT_M);
    });

    it('the curved BODY leans -- without which the joint result above would be vacuous', () => {
        // A joint between two upright walls closes trivially. This is the non-vacuity
        // guard for the whole block: A must actually be a cone.
        const far = () => mk([50, 50], [55, 50], { rake: VERT });
        for (const kind of ['curved', 'curved+layered3', 'curved+window', 'curved+layered3+window'] as Kind[]) {
            const c = measure(makeA(kind, [0, 0], [5, 0], RAKE), far());
            expect(c.leanA, `${kind} @80 leans`).toBeGreaterThan(0.1);
        }
    });
});

// --- AXIS 4c -- WJ1: the curved RAKED wall at a T and at an X ------------------------

/**
 * L-1066 closed the **L** corner and said so plainly: *"T and X for curved-raked are still
 * not asserted."* This is that assertion — and it could not be written until the METRIC was
 * fixed, because the X arm of `hullSeparation` was measuring the test geometry rather than
 * the building (§WJ1-CROSSING-HULLS-SHARE-NO-VERTEX, above).
 *
 * ── WHAT CHANGED IN THE READINGS, AND WHY EVERY OLD X NUMBER WAS FICTION ───────────
 *
 * Before the metric fix, with the SAME builder and the SAME walls:
 *
 *     X plain@90 vs plain@90   baseSep 2.400   topSep 2.400   openUp  0.000   <- the CONTROL
 *     X plain@80 vs plain@80   baseSep 2.400   topSep 1.871   openUp -0.529
 *     X curved@80 vs plain@90  baseSep 0.000   topSep 0.019   openUp  0.019
 *     X curved@80 vs layered3  baseSep 0.021   topSep 0.061   openUp  0.040
 *
 * After:  **every one of those is 0.000, control included.** The `2.400` was `2.5 − 0.1`,
 * half the test wall's length minus half its thickness — a fact about the fixture. The
 * `openUp = −0.529` was a negative opening, which is not a thing. And the 19 mm and 40 mm
 * "openings" that looked like small real defects worth chasing were the same artefact at a
 * smaller amplitude. ⭐ **The plausible ones are the dangerous ones**: `2.400` announces
 * itself, `0.019` reads as a lead.
 *
 * ── WHAT IS ASSERTED, AND WHAT A T AND AN X CAN EVEN CLAIM ─────────────────────────
 *
 * `baseGap` / `topGap` are VERTEX-to-VERTEX and are meaningless here — RK1 established
 * that (§RK1-VERTEX-GAP-IS-NOT-A-T-JOINT): at a T the stem's end face lands on the middle
 * of the host's side face, where the host has no vertex at all, so the nearest host vertex
 * is half a wall away. They are still RECORDED, never asserted. The claim at a T and an X
 * is the one the founder's sentence makes: the solids MEET at the floor, they still MEET
 * at the top, and the joint does not OPEN with height.
 */
describe('WJ1 -- a curved RAKED wall at a T and at an X, against every neighbour', () => {
    const NEIGHBOURS: ReadonlyArray<readonly [string, Kind, number]> = [
        ['straight plain VERTICAL', 'plain', VERT],
        ['straight plain RAKED (same lean)', 'plain', RAKE],
        ['straight plain RAKED (opposite)', 'plain', 110],
        ['straight LAYERED raked', 'layered3', RAKE],
        ['straight raked + WINDOW', 'plain+window', RAKE],
        ['CURVED unraked', 'curved', VERT],
        ['CURVED raked', 'curved', RAKE],
        ['CURVED layered raked', 'curved+layered3', RAKE],
    ];

    /**
     * ⭐ THE METRIC'S OWN CONTROL, and it runs FIRST at every topology.
     *
     * This is the test that would have caught the X defect on the day it was written. Two
     * plain UPRIGHT walls at a T and at an X cannot be unsound — there is no rake, no
     * curve, no opening and no layering to get wrong. If the metric reports daylight
     * there, the metric is broken and nothing below it means anything. It reported 2.400 m
     * for months.
     */
    it('CONTROL -- plain vertical and plain raked pairs read CLOSED at L, T and X', () => {
        for (const topo of ['L', 'T', 'X'] as Topo[]) {
            for (const [tag, rake] of [['@90 upright', VERT], ['@80 raked', RAKE]] as const) {
                const c = record(`${topo} CONTROL plain${tag} vs plain${tag}`,
                    measure(...pairFor(topo, 'plain', rake as number, 'plain', rake as number)));
                expect(c.baseSep, `${topo} plain${tag}: the floor`).toBeLessThan(COINCIDENT_M);
                expect(c.topSep, `${topo} plain${tag}: the top`).toBeLessThan(COINCIDENT_M);
                expect(Math.abs(c.openUp), `${topo} plain${tag}: does not open`).toBeLessThan(COINCIDENT_M);
            }
        }
        dump('AXIS 4c CONTROL: plain pairs at L / T / X');
    });

    /**
     * ⭐ THE CONTROL CAN FAIL. A green control proves nothing if the instrument cannot
     * produce a red. Two walls placed genuinely apart must read genuinely apart — and the
     * SAT overlap test added above is exactly the kind of change that could have made
     * `hullSeparation` return 0 unconditionally, which would have turned every assertion
     * in this block into a tautology.
     */
    it('CONTROL CAN FAIL -- two walls 2 m apart read as SEPARATED, not as touching', () => {
        const A = makeA('plain', [0, 0], [5, 0], RAKE);
        const B = makeA('plain', [0, 2], [5, 2], RAKE);
        const c = record('CONTROL-CAN-FAIL plain@80 vs plain@80, 2 m apart', measure(A, B));
        dump('AXIS 4c: the instrument can still report a gap');
        expect(c.baseSep, 'a real 2 m gap is reported as a gap').toBeGreaterThan(1.5);
    });

    for (const topo of ['T', 'X'] as Topo[]) {
        for (const aKind of ['curved', 'curved+layered3', 'curved+window'] as Kind[]) {
            it(`${topo}: ${aKind}@80 closes against every neighbour, floor AND top`, () => {
                const results: Array<{ label: string; c: Cell }> = [];
                for (const [label, bKind, bRake] of NEIGHBOURS) {
                    const [A, B] = pairFor(topo, aKind, RAKE, bKind, bRake);
                    results.push({ label, c: record(`${topo} ${aKind}@80 vs ${label}`, measure(A, B)) });
                }
                dump(`AXIS 4c: ${topo} ${aKind}@80 vs every neighbour`);

                for (const { label, c } of results) {
                    expect(Number.isFinite(c.baseSep), `${label}: both bodies built`).toBe(true);
                    expect(c.baseSep, `${topo} ${label}: the two solids MEET at the floor`)
                        .toBeLessThan(COINCIDENT_M);
                    expect(c.topSep, `${topo} ${label}: and they still MEET at the top`)
                        .toBeLessThan(COINCIDENT_M);
                    expect(Math.abs(c.openUp), `${topo} ${label}: does not OPEN with height`)
                        .toBeLessThan(COINCIDENT_M);
                }
            });
        }
    }

    /**
     * The T with the CURVE ON THE STEM rather than on the host. Every row above puts the
     * curved wall in the A slot, which at a T is the HOST — so without this the curved
     * wall's own END would never be the thing landing on a neighbour's side face, and "T
     * is asserted" would be half true.
     */
    it('T-STEM -- a curved raked STEM landing on a straight host, raked and upright', () => {
        const results: Array<{ label: string; c: Cell }> = [];
        for (const aKind of ['curved', 'curved+layered3'] as Kind[]) {
            for (const [tag, hostRake] of [['raked host', RAKE], ['upright host', VERT]] as const) {
                const A = makeA(aKind, [2.5, 0], [2.5, 5], RAKE);
                const B = makeA('plain', [0, 0], [5, 0], hostRake as number);
                results.push({ label: `${aKind} stem, ${tag}`, c: record(`T-STEM ${aKind}@80 onto plain ${tag}`, measure(A, B)) });
            }
        }
        dump('AXIS 4c: T-STEM, the curve on the stem');
        for (const { label, c } of results) {
            expect(c.baseSep, `${label}: meets at the floor`).toBeLessThan(COINCIDENT_M);
            expect(c.topSep, `${label}: meets at the top`).toBeLessThan(COINCIDENT_M);
            expect(Math.abs(c.openUp), `${label}: does not open`).toBeLessThan(COINCIDENT_M);
        }
    });

    /**
     * NON-VACUITY. A T or an X between two upright walls closes trivially; every row above
     * would be green on a builder that had forgotten the rake entirely. A must be a cone.
     */
    it('the curved body still LEANS at T and X placements -- the block is not vacuous', () => {
        const far = () => mk([50, 50], [55, 50], { rake: VERT });
        for (const kind of ['curved', 'curved+layered3', 'curved+window'] as Kind[]) {
            const stem = measure(makeA(kind, [2.5, 0], [2.5, 5], RAKE), far());
            expect(stem.leanA, `${kind} @80 at the T-stem placement leans`).toBeGreaterThan(0.1);
            const cross = measure(makeA(kind, [-2.5, 0], [2.5, 0], RAKE), far());
            expect(cross.leanA, `${kind} @80 at the X placement leans`).toBeGreaterThan(0.1);
        }
    });
});

// --- AXIS 5 -- L-1034 #4: WHERE IS "EDIT PROFILE" ACTUALLY OFFERED? -----------------

/**
 * The founder re-raised PROFILE EDIT alongside the three curved/raked cells (L-1034). The
 * feature itself is already on `main` — `62479227` (slice 0) and `f9ed3ee9` (slice 1),
 * with a live **Edit Profile** button in `ContextualEditBar.ts` under `§EDIT-PROFILE`.
 * So the open question is NOT "build it"; it is **REACHABILITY**: the bar shows the button
 * only where an editor actually exists, so which wall SHAPES offer it has never been
 * measured — and "raked" and "curved" are exactly the shapes this lane owns.
 *
 * `profileAuthorability` is the gate that decides, and this axis reads it directly. The
 * result is a genuine, complete answer to half the question. The other half — whether the
 * BUTTON follows the gate — is an `apps/editor` question and is declared a blank below
 * rather than guessed at: an L2 test importing an L7 bar would be a layer violation, and
 * a mirrored copy of the rule here would be the C84 §8.d defect ("a comment as the
 * synchronisation mechanism") this repo has already been bitten by twice.
 */
describe('RK1 §RK1-MATRIX -- AXIS 5: L-1034 #4, profile-edit reachability by wall shape', () => {
    it('the four cells the founder asked about, read off the gate that decides them', () => {
        // ⚠ THE SHAPE MATTERS, AND THE FIRST DRAFT GOT IT WRONG — recorded, not hidden.
        //   The profile was passed as a BARE ARRAY of `{u, v}`; `resolveWallProfile`
        //   wants `{ ring: [...] }`, so every one of the six cells came back
        //   `REFUSED:malformed` and the axis measured NOTHING. The tell was that all six
        //   agreed: a probe returning the same value for every input is measuring itself.
        //   The `expect`s below are what caught it, which is the whole reason an axis
        //   like this must assert and not merely print.
        const PROFILE = { ring: [{ u: 0, v: 0 }, { u: 5, v: 0 }, { u: 5, v: 3 }, { u: 0, v: 2 }] };
        const BASELINE: readonly [{ x: number; z: number }, { x: number; z: number }] =
            [{ x: 0, z: 0 }, { x: 5, z: 0 }];
        const curve = { control: { x: 2.5, y: 0, z: 1.2 }, segments: 24 };
        const base = { wallProfile: PROFILE, baseLine: BASELINE, height: H };
        const cells: Array<[string, Record<string, unknown>]> = [
            ['plain VERTICAL',      { ...base }],
            ['plain RAKED',         { ...base, rakeAngleDeg: RAKE }],
            ['CURVED',              { ...base, curve }],
            ['CURVED + RAKED',      { ...base, curve, rakeAngleDeg: RAKE }],
            ['LAYERED (3)',         { ...base, layers: [{}, {}, {}] }],
            ['hosting an OPENING',  { ...base, openings: [{ id: 'o' }] }],
        ];
        for (const [label, subject] of cells) {
            const a = profileAuthorability(subject as never);
            rows.push(`PROFILE on ${label.padEnd(24)} ${a.ok ? 'OFFERED' : `REFUSED:${a.code}`}`);
        }
        dump('AXIS 5: profile-edit reachability (L-1034 #4)');

        // THE CONTROL FIRST: a plain vertical wall must be OFFERED the editor. If this
        // fails, the subject is malformed again and nothing below means anything.
        expect(profileAuthorability({ ...base } as never).ok,
            'CONTROL — a plain vertical wall is offered profile edit').toBe(true);

        // THE FINDING. `profileAuthorability` has arms for curved, layered and
        // hosted-openings and NONE for the rake — `ProfileSubject` does not even carry
        // `rakeAngleDeg`, so the rake is not an INPUT to the decision, let alone a
        // refusal. A raked wall is therefore offered the profile editor.
        expect(profileAuthorability({ ...base, rakeAngleDeg: RAKE } as never).ok,
            'a RAKED wall IS offered profile edit — the gate cannot even see the rake').toBe(true);
        expect(profileAuthorability({ ...base, curve } as never).code,
            'a CURVED wall is refused, as curved').toBe('curved');
        expect(profileAuthorability({ ...base, curve, rakeAngleDeg: RAKE } as never).code,
            'CURVED + RAKED is refused for being curved — the rake is not why').toBe('curved');
    });
});

// --- AXIS 6 -- L-1067: WHAT THE "EDIT PROFILE" BUTTON ACTUALLY DOES TODAY ------------

/**
 * The founder asked about Edit Profile twice and has not had a straight answer. This axis
 * is the straight answer, measured rather than inferred from commit messages.
 *
 * WHAT EXISTS: the model (`wallProfile`, a `{ ring: [{u,v}] }` on `WallData`), ONE
 * authorability gate wired into all three write boundaries, Zod validation, persistence,
 * cache invalidation (`WallDeltaClassifier`), the geometry hash (`composeWallGeometryHash`),
 * an instanced-arm exclusion so a profiled wall cannot be flattened into a T·R·S matrix,
 * and a live button in `ContextualEditBar` under §EDIT-PROFILE.
 *
 * ⛔ WHAT DOES NOT EXIST: **any body builder that reads the ring.** A census of
 *    `packages/geometry-wall/src` finds `wallProfile` consumed by the schema, the store,
 *    the delta classifier, the geometry hash and the instanced-arm exclusion — and by NO
 *    geometry path. `WallFragmentBuilder`'s own comment says so in its own words: *"INERT
 *    TODAY, DELIBERATELY. Nothing in the repo authors `wallProfile` yet."*
 *
 * SO THE HONEST STATEMENT IS NOT "profile × rake is unverified" — it is that **a profile
 * draws nothing on ANY wall shape.** Authoring one makes the wall REBUILD (the hash
 * changes) and takes it OFF the instanced arm (the exclusion fires), and then renders the
 * identical full rectangle. That is worse than a refusal, because a refusal at least tells
 * the author why nothing happened.
 *
 * This test does not fix it. It makes the state MEASURED instead of assumed, which is what
 * C84 EI-3 requires of an affordance that is offered — and it gives the lane that builds
 * the body a harness that is already RED in the right place.
 */
describe('RK1 §RK1-MATRIX -- AXIS 6: L-1067, the profile is authorable and DRAWS NOTHING', () => {
    const RING = { ring: [{ u: 0, v: 0 }, { u: 5, v: 0 }, { u: 5, v: 3 }, { u: 0, v: 1 }] };

    const withProfile = (rake?: number): WallData => ({
        ...mk([0, 0], [5, 0], rake === undefined ? {} : { rake }),
        wallProfile: RING,
    } as unknown as WallData);

    it('the gate ADMITS a profile on a plain wall, vertical and raked alike', () => {
        expect(profileAuthorability({ wallProfile: RING, baseLine: [{ x: 0, z: 0 }, { x: 5, z: 0 }], height: H } as never).ok)
            .toBe(true);
        expect(profileAuthorability({ wallProfile: RING, baseLine: [{ x: 0, z: 0 }, { x: 5, z: 0 }], height: H, rakeAngleDeg: RAKE } as never).ok)
            .toBe(true);
    });

    /**
     * ✅ INVERTED 2026-08-19 by §FEAT-WALL-PROFILE-BODY, exactly as this test instructed.
     * It used to assert *"the ring draws NOTHING"* and ended: *"⛔ WHEN A LANE BUILDS THE
     * PROFILE BODY, THIS TEST GOES RED. That is correct and intended: invert it to assert
     * the CUT, do not delete it."* Done — and the instruction is the reason it was safe to
     * touch, which is the same discipline that made `A2b`/`A3b` safe.
     */
    it('L-1067 -- the ring is DRAWN: the profiled wall is a DIFFERENT solid, vertical and raked', () => {
        const far = () => mk([50, 50], [55, 50], { rake: VERT });
        for (const rake of [undefined, RAKE]) {
            const withIt = measure(withProfile(rake), far());
            const withoutIt = measure(mk([0, 0], [5, 0], rake === undefined ? {} : { rake }), far());
            expect(Number.isFinite(withIt.leanA), 'the profiled wall builds').toBe(true);
            // The ring cuts the far end from v=3 down to v=1. A wall that DRAWS it has a
            // different silhouette; the pre-fix reading was these two being equal to 9dp.
            // ⚠ NOT `topRingY`. The ring cuts the NEAR end down to v=1 and leaves the far
            //   end at v=3, so the body's MAXIMUM y is unchanged and a whole-body extremum
            //   reads the cut as absent — it failed exactly that way, "expected 3 to be
            //   less than 2.999". What the cut actually changes is how MUCH of the wall
            //   still reaches the top.
            expect(withIt.topRingCount, `rake=${rake ?? 'none'}: less of the wall reaches the top`)
                .toBeLessThan(withoutIt.topRingCount);
        }
    });

    it('L-1067 -- and a profile COMPOSES with a rake rather than replacing it', () => {
        // The ring is authored in the UN-SHEARED frame, so the two are independent: the
        // profile cuts, then the group leans. Asserted because "they compose" is exactly
        // the kind of claim a comment can make and no code can be held to.
        const far = () => mk([50, 50], [55, 50], { rake: VERT });
        const flat = measure(withProfile(undefined), far());
        const leaning = measure(withProfile(RAKE), far());
        expect(flat.leanA, 'un-raked: the profiled wall is upright').toBeLessThan(COINCIDENT_M);
        expect(leaning.leanA, 'raked: the SAME profiled wall leans by h*cot(theta)')
            .toBeCloseTo(EXPECTED_LEAN, 6);
    });
});

/**
 * -- §RK1-MATRIX-BLANKS -- what this file does NOT reach ------------------------------
 *
 * Stated so the blanks are visible rather than mistaken for clearances (C84 EI-1b).
 *
 *  1. **`WallJunctionInfillManager` is never exercised.** `buildWall` does not call it;
 *     the infill is a separate pass, and it carries its own datum
 *     (`WallJunctionInfillManager.ts:122-123` reads the wall BASELINE Y, which means
 *     different things by creation route). The "triangular prism with unclamped
 *     vertices" the founder has seen therefore CANNOT appear in this matrix -- measuring
 *     it needs the infill pass in the harness, not just the fragment builder.
 *  2. **MOVE-time junction behaviour is out of scope** -- that is lane WM1's path
 *     (`WallMoveReweldService`, `moveReweldPreflight`). This file is GEOMETRY-time only.
 *  3. ✅ **THE X METRIC IS FIXED, AND EVERY OLD X READING WAS FICTION** (WJ1,
 *     2026-08-19). This blank used to read *"NO CONCLUSION -- sound or unsound -- may be
 *     drawn from any X row"*, and it named two candidate causes: either the X junction
 *     genuinely produces bodies that do not touch, or `hullSeparation` is wrong on this
 *     input. **It was the metric.** `hullSeparation` decided overlap by testing whether a
 *     VERTEX of one hull lay inside the other, and two convex polygons crossing in a PLUS
 *     SIGN -- which is precisely what an X junction is -- overlap with no vertex of either
 *     inside the other. The proof is the control: `X plain@90 vs plain@90`, two upright
 *     walls crossing at the origin with nothing to get wrong, read `sep = 2.400 m`. See
 *     §WJ1-CROSSING-HULLS-SHARE-NO-VERTEX. X rows are now assertable and are asserted in
 *     AXIS 4c; the T rows, which the old blank correctly said were unaffected, are
 *     unchanged by the fix and are asserted there too.
 *  3b. **Only ONE neighbour at a time.** A three-wall Y-junction, and a four-wall X where
 *     all four are raked, are not measured.
 *  4. **`baseOffset` / `slabBaseOffset` are 0 throughout.** The wall-Y datum was resolved
 *     at `8f63fb6f` and is pinned by `WallYDatumAgreement.test.ts`; composing a plinth
 *     offset WITH a rake is not measured here.
 *  5. **The leaf is not measured, only the wall body.** Whether a door/window LEAF sits
 *     in its raked hole is pinned by `geometry-window`'s `HostedLeafSitsInItsHole` and
 *     the `geometry-door` twin, not here.
 *  6. **Stack B (`produceWall`) is not measured.** C85 section 11 #11's parity harness is
 *     still absent from `main`; every reading in this file is Stack A only.
 *  7. **No PERSISTENCE round-trip.** Whether a raked layered wall with openings survives
 *     save/reload is C85 section 5's subject, not this file's.
 *  8. **L-1034 #4, the UI half.** AXIS 5 measures `profileAuthorability`, which is the
 *     gate that decides whether an editor CAN exist. Whether `ContextualEditBar`'s
 *     **Edit Profile** button actually follows that gate is an `apps/editor` (L7)
 *     question and is NOT measured here — an L2 test may not import L7, and mirroring
 *     the rule into this file would be the C84 section 8.d defect ("a comment as the
 *     synchronisation mechanism"). Somebody must measure the BUTTON where the button
 *     lives.
 *  9. **Profile x rake GEOMETRY is unmeasured.** AXIS 5 establishes that a raked wall is
 *     OFFERED the profile editor — `profileAuthorability` has no rake arm at all. It does
 *     NOT establish that the resulting body is correct. A profile is authored in the
 *     wall's own UN-SHEARED plane (`WallTypes.ts` says so explicitly: *"both measured in
 *     the UN-SHEARED frame, so a profile and a rake compose"*), and that composition has
 *     never been built and measured. **An affordance that is offered and unverified is a
 *     worse state than one that is refused with a reason** — this is the highest-value
 *     blank in this file.
 */
