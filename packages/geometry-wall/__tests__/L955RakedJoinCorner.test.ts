/**
 * L-955 — A RAKED WALL JOINS SOUNDLY ONLY WHEN IT IS PLAIN.
 *
 * Founder-reported on the live deploy `d5b8d82f` (2026-08-18) with screenshots. The
 * differential IS the finding:
 *
 *     plain raked   ↔ plain raked      SOUND  — the founder's word is "perfect"
 *     LAYERED raked ↔ raked            NOT SOUND
 *     raked HOSTING A WINDOW ↔ raked   NOT SOUND
 *
 * The bodies are correct on all three — the founder confirms layered-raked walls and
 * windows-on-raked-walls both render properly. **Only the CORNER fails**: the two end
 * faces do not close, leaving a wedge of daylight and a spike at the junction.
 *
 * ── WHAT IS MEASURED, AND WHY IT IS THE CORNER AND NOT A RETURN VALUE ────────────
 *
 * Every number here is read off the BufferGeometries `WallFragmentBuilder` actually put
 * in the scene, in WORLD coordinates (`localToWorld`, so the §RAKE-HOSTED-OPENING child
 * shear matrix is included — that shear lives in the matrix, not in the buffer).
 *
 * The defect is a GAP and a SPIKE at a corner, so the metric is corner closure:
 *
 *   · BASE closure — how many distinct plan positions the two walls' FLOOR rings share.
 *     At a mitred L this is ≥ 2 (the outer and inner mitre corners). All three cases
 *     pass this: ADR-0310's uniform shear is exact at the floor.
 *   · TOP closure — the same count on the walls' TOP rings, plus the minimum distance
 *     between them. This is where the two new paths fail, and it is exactly what the
 *     screenshots show.
 *
 * Tolerance is the CANONICAL `COINCIDENT_M` (1 mm) from `@pryzm/geometry-kernel` —
 * C73 §2.2 requires consuming the declared constant, and `check-epsilon-policy` sees a
 * new literal. Nothing here invents an epsilon. (The 1e-7 used inside `ringAt` is a
 * float32 de-duplication threshold for two spellings of ONE vertex in ONE buffer, not a
 * model-space identity question — see `dedupeThresholdIsNotAToleranceQuestion` below.)
 *
 * ── THE CONTROL COMES FIRST, AND IT IS WATCHED RED ──────────────────────────────
 *
 * plain ↔ plain is CONFIRMED GOOD in production. `CONTROL` pins it. `CONTROL CAN FAIL`
 * proves the metric discriminates: the SAME pair, built with the ADR-0312 twin-solve
 * loft suppressed (an explicit uniform `topOffset`, i.e. the ADR-0310 behaviour — a
 * deliberately broken shear at the end face), opens by ~0.46 m at the top. A control
 * that cannot fail is not a control.
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { COINCIDENT_M } from '@pryzm/geometry-kernel';

import { WallFragmentBuilder } from '../src/WallFragmentBuilder';
import { WallJoinResolver } from '../src/WallJoinResolver';
import {
    WallPipelineV2Cache,
    buildWallV2Geometry,
    type LevelWallSpec,
} from '../src/WallPipelineV2';
import { rakeShearPerMetre } from '../src/WallRake';
import type { WallData } from '../src/WallTypes';

// ─── The scene ────────────────────────────────────────────────────────────────
// An L: A along +X from the origin, B along +Z from the origin. Both RAKED at 80°,
// which is the founder's case (raked ↔ raked). Only A changes between the three
// cases below — B is the same plain raked wall throughout, so any difference in the
// corner is attributable to A's body path and to nothing else.

const RAKE = 80;
const H = 3;
const T = 0.2;
const LAYERS = [0.0125, 0.075, 0.0125];          // a 0.10 m partition, exterior → interior
const T_LAYERED = LAYERS.reduce((s, t) => s + t, 0);
const K = rakeShearPerMetre(RAKE);               // cot(80°) ≈ 0.176327

/** Opening on A, clear of both ends so it can never be confused with an end-cap effect. */
const OP = { id: 'op-1', type: 'window', offset: 2.0, width: 1.2, height: 1.4, sillHeight: 0.9 };

let _seq = 0;

function mk(
    s: [number, number],
    e: [number, number],
    opts: { layers?: number[]; rake?: number; openings?: unknown[] } = {},
): WallData {
    const layers = opts.layers;
    return {
        id: `l955-${_seq++}`,
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
        metadata: { createdAt: _seq, modifiedAt: _seq, createdBy: 't', version: 1 },
    } as unknown as WallData;
}

const specOf = (w: WallData): LevelWallSpec => ({
    id: w.id,
    startXZ: { x: w.baseLine[0].x, z: w.baseLine[0].z },
    endXZ:   { x: w.baseLine[1].x, z: w.baseLine[1].z },
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

// ─── Measurement ──────────────────────────────────────────────────────────────

interface Pt { x: number; z: number }

/**
 * Every WORLD-space vertex of the wall-BODY meshes under `root`.
 *
 * Body meshes are the three spellings the three paths produce: no `elementType` (the
 * plain V2 body), `'WallLayer'` (the layered bands) and `'WallPart'` (the segments a
 * wall with an opening is built from, merged or not). Door/window leaves and the edge
 * overlay are excluded — the question is where the WALL's end face is.
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
            const v = new THREE.Vector3().fromBufferAttribute(pos as THREE.BufferAttribute, i);
            out.push(m.localToWorld(v));
        }
    });
    return out;
}

/**
 * Distinct plan positions of the vertices lying at world height `y`.
 *
 * `dedupeThresholdIsNotAToleranceQuestion`: 1e-7 m here collapses the several
 * BUFFER spellings of ONE vertex (a corner appears in three faces, stored in
 * float32) into one point. It is a de-duplication threshold on a single geometry,
 * not a "are these two model points the same place?" question — that question is
 * asked below, and it is asked with `COINCIDENT_M`.
 */
function ringAt(verts: readonly THREE.Vector3[], y: number): Pt[] {
    const out: Pt[] = [];
    for (const v of verts) {
        if (Math.abs(v.y - y) > 1e-6) continue;
        if (!out.some(p => Math.hypot(p.x - v.x, p.z - v.z) < 1e-7)) out.push({ x: v.x, z: v.z });
    }
    return out;
}

/** Points of `a` that have a partner in `b` within `tol` — the corners the two solids SHARE. */
function sharedCount(a: readonly Pt[], b: readonly Pt[], tol: number): number {
    return a.filter(p => b.some(q => Math.hypot(p.x - q.x, p.z - q.z) <= tol)).length;
}

/** Closest approach between the two rings. 0-ish ⇒ the two solids touch at that elevation. */
function minGap(a: readonly Pt[], b: readonly Pt[]): number {
    let best = Infinity;
    for (const p of a) for (const q of b) best = Math.min(best, Math.hypot(p.x - q.x, p.z - q.z));
    return best;
}

interface Corner {
    baseShared: number;
    topShared: number;
    baseGap: number;
    topGap: number;
}

/** Build the pair through the REAL builder and measure the joint at floor and at top. */
function measureJoint(A: WallData, B: WallData): Corner {
    const scene = new THREE.Scene();
    const builder = new WallFragmentBuilder(scene, levelProvider() as never);
    const walls = [A, B];
    builder.refreshV2Cache(walls.map(specOf));
    const joins = WallJoinResolver.resolveLevel(walls.map(w => ({ ...w })), { snapRadius: 0.5 });
    for (const w of walls) builder.buildWall(w, (joins.get(w.id) ?? null) as never, undefined, 0);

    const rootA = builder.getWallRoot(A.id) as unknown as THREE.Object3D;
    const rootB = builder.getWallRoot(B.id) as unknown as THREE.Object3D;
    expect(rootA, 'builder produced a group for A').toBeTruthy();
    expect(rootB, 'builder produced a group for B').toBeTruthy();

    const vA = bodyVertices(rootA);
    const vB = bodyVertices(rootB);
    expect(vA.length, 'A has body geometry').toBeGreaterThan(0);
    expect(vB.length, 'B has body geometry').toBeGreaterThan(0);

    const baseA = ringAt(vA, 0), baseB = ringAt(vB, 0);
    const topA  = ringAt(vA, H), topB  = ringAt(vB, H);
    expect(topA.length, 'A has a top ring at y = H').toBeGreaterThan(0);
    expect(topB.length, 'B has a top ring at y = H').toBeGreaterThan(0);

    return {
        baseShared: sharedCount(baseA, baseB, COINCIDENT_M),
        topShared:  sharedCount(topA,  topB,  COINCIDENT_M),
        baseGap: minGap(baseA, baseB),
        topGap:  minGap(topA,  topB),
    };
}

function report(label: string, c: Corner): void {
    // eslint-disable-next-line no-console
    console.log(
        `[L-955] ${label.padEnd(34)} base: shared=${c.baseShared} gap=${c.baseGap.toExponential(3)} m` +
        `   TOP: shared=${c.topShared} gap=${c.topGap.toExponential(3)} m`,
    );
}

/**
 * The joint is SOUND: the two walls share at least as many corners at the top as they
 * do at the floor, and their top rings touch. Both halves matter — a top ring that
 * merely grazes its neighbour at one point is a spike, not a closed corner.
 */
function expectSoundJoint(label: string, c: Corner): void {
    report(label, c);
    expect(c.baseShared, `${label}: the mitre closes at the FLOOR`).toBeGreaterThanOrEqual(2);
    expect(c.topGap, `${label}: the two TOP faces touch within COINCIDENT_M`).toBeLessThan(COINCIDENT_M);
    expect(c.topShared, `${label}: as many corners shared at the TOP as at the floor`)
        .toBeGreaterThanOrEqual(c.baseShared);
}

const plainB = () => mk([0, 0], [0, 5], { rake: RAKE });

// ─── STEP 1 — THE CONTROL. Pinned FIRST, and it must never move. ──────────────

describe('L-955 CONTROL — plain raked ↔ plain raked is SOUND and must stay sound', () => {
    it('the two walls share their mitre corners at the TOP, not only at the floor', () => {
        const A = mk([0, 0], [5, 0], { rake: RAKE });
        expectSoundJoint('plain ↔ plain (CONTROL)', measureJoint(A, plainB()));
    });

    it('CONTROL CAN FAIL — with the end-face shear broken, the SAME metric opens ~0.46 m', () => {
        // The deliberately broken shear: build the same L through the same V2 chain, but
        // hand the extruder an explicit UNIFORM `topOffset`. That suppresses the ADR-0312
        // per-vertex loft (`buildWallV2Geometry` honours a caller-supplied offset over the
        // twin solve), which is precisely the state the two failing paths are in — the body
        // leans correctly, the END FACE does not follow the mitre line.
        const specs: LevelWallSpec[] = [
            { id: 'A', startXZ: { x: 0, z: 0 }, endXZ: { x: 5, z: 0 }, thickness: T, rakeAngleDeg: RAKE },
            { id: 'B', startXZ: { x: 0, z: 0 }, endXZ: { x: 0, z: 5 }, thickness: T, rakeAngleDeg: RAKE },
        ];
        const cache = new WallPipelineV2Cache();
        cache.refresh(specs);
        // A's own uniform shear: leftPerp((1,0)) = (0,1). B's: leftPerp((0,1)) = (−1,0).
        const gA = buildWallV2Geometry(specs[0]!, cache, { height: H, topOffset: { x: 0, z: H * K } });
        const gB = buildWallV2Geometry(specs[1]!, cache, { height: H, topOffset: { x: -H * K, z: 0 } });

        const vertsOf = (g: THREE.BufferGeometry): THREE.Vector3[] => {
            const pos = g.getAttribute('position');
            const out: THREE.Vector3[] = [];
            for (let i = 0; i < pos.count; i++) {
                out.push(new THREE.Vector3().fromBufferAttribute(pos as THREE.BufferAttribute, i));
            }
            return out;
        };
        const vA = vertsOf(gA.geometry), vB = vertsOf(gB.geometry);
        const broken: Corner = {
            baseShared: sharedCount(ringAt(vA, 0), ringAt(vB, 0), COINCIDENT_M),
            topShared:  sharedCount(ringAt(vA, H), ringAt(vB, H), COINCIDENT_M),
            baseGap: minGap(ringAt(vA, 0), ringAt(vB, 0)),
            topGap:  minGap(ringAt(vA, H), ringAt(vB, H)),
        };
        report('plain ↔ plain (SHEAR BROKEN)', broken);

        // The floor is still exact — which is why this defect is invisible in plan.
        expect(broken.baseShared).toBeGreaterThanOrEqual(2);
        expect(broken.baseGap).toBeLessThan(COINCIDENT_M);
        // …and the top is wide open. The metric discriminates by ~2.5 orders of magnitude.
        expect(broken.topShared).toBe(0);
        expect(broken.topGap).toBeGreaterThan(0.4);
    });
});

// ─── STEP 2 — THE TWO REPORTED FAILURES, as tests on the JOINED GEOMETRY ──────

describe('L-955 — LAYERED raked ↔ raked must close at the corner', () => {
    it('a 3-layer raked wall shares its mitre corners with a raked neighbour at the TOP', () => {
        const A = mk([0, 0], [5, 0], { layers: LAYERS, rake: RAKE });
        expectSoundJoint('LAYERED raked ↔ raked', measureJoint(A, plainB()));
    });

    it('the layered BODY is still correct — the defect is the corner, not the wall', () => {
        // The founder confirms layered-raked bodies render properly, so a "fix" that
        // moved the body would be a regression dressed as a repair. The stack's plan
        // span stays `Σt / sin θ` and the top still leans by exactly h·cot θ.
        const A = mk([0, 0], [5, 0], { layers: LAYERS, rake: RAKE });
        const scene = new THREE.Scene();
        const builder = new WallFragmentBuilder(scene, levelProvider() as never);
        const B = plainB();
        builder.refreshV2Cache([A, B].map(specOf));
        const joins = WallJoinResolver.resolveLevel([A, B].map(w => ({ ...w })), { snapRadius: 0.5 });
        builder.buildWall(A, (joins.get(A.id) ?? null) as never, undefined, 0);
        builder.buildWall(B, (joins.get(B.id) ?? null) as never, undefined, 0);

        // A runs along +X, so its lateral axis is leftPerp((1,0)) = +Z. Per LAYER mesh,
        // measure the base ring's lateral span and the base→top lateral travel. A 90°
        // mitre extends a wall AXIALLY, not laterally, so these two quantities are
        // unaffected by whether the ends are lofted — which is exactly what makes them a
        // usable non-regression instrument for the BODY while the CORNER changes.
        const root = builder.getWallRoot(A.id) as unknown as THREE.Object3D;
        root.updateMatrixWorld(true);
        const reads: Array<{ i: number; span: number; lean: number }> = [];
        root.traverse(o => {
            const m = o as THREE.Mesh;
            if (!(m as unknown as { isMesh?: boolean }).isMesh) return;
            if ((m.userData as { elementType?: string })?.elementType !== 'WallLayer') return;
            const pos = m.geometry.getAttribute('position');
            const lat: number[] = [], ys: number[] = [];
            for (let i = 0; i < pos.count; i++) {
                const v = m.localToWorld(new THREE.Vector3().fromBufferAttribute(pos as THREE.BufferAttribute, i));
                lat.push(v.z);            // leftPerp((1,0)) = (0,1) ⇒ the lateral axis IS +Z
                ys.push(v.y);
            }
            const at = (want: number): number[] => lat.filter((_, i) => Math.abs(ys[i]! - want) < 1e-6);
            const b = at(0), t = at(H);
            const mid = (v: number[]): number => (Math.min(...v) + Math.max(...v)) / 2;
            reads.push({
                i: (m.userData as { layerIndex: number }).layerIndex,
                span: Math.max(...b) - Math.min(...b),
                lean: mid(t) - mid(b),
            });
        });
        reads.sort((a, b) => a.i - b.i);
        expect(reads, 'one mesh per authored layer').toHaveLength(LAYERS.length);
        const sin = Math.sin((RAKE * Math.PI) / 180);
        for (const r of reads) {
            // eslint-disable-next-line no-console
            console.log(`[L-955] layered body layer ${r.i}: plan span ${r.span.toFixed(9)} m (t/sinθ = ${(LAYERS[r.i]! / sin).toFixed(9)}), lean ${r.lean.toFixed(9)} m (h·cotθ = ${(H * K).toFixed(9)})`);
            expect(r.span, `layer ${r.i} is still t / sin θ in plan`).toBeCloseTo(LAYERS[r.i]! / sin, 6);
            expect(r.lean, `layer ${r.i} still leans by h · cot θ`).toBeCloseTo(H * K, 6);
        }
        expect(reads.reduce((s, r) => s + r.span, 0), 'the stack still tiles Σt / sin θ')
            .toBeCloseTo(T_LAYERED / sin, 6);
    });
});

// ─── §L955-LEGACY-PLAIN-SHEAR — the arm that dropped the rake entirely ────────
//
// A SEPARATE DEFECT ON THE SAME SUBJECT, found while answering "which legacy arm
// renders a raked wall vertical?". It is NOT the layered fallback at :1543 — that one
// shears at :1608-1622 and `RakedLayeredWallBands.measure.test.ts:232` already pins it.
// It is `createWallBodyFragment`'s own fallback (:3942/:3974), reached from `buildWall`'s
// `wall.openings.length === 0` branch (:2123), which returns without ever calling
// `_applyRakeShearToChildren` — that method is invoked only from the opening-bearing
// branch. So a PLAIN raked wall that fell back here stood bolt upright.
//
// ⚠ REACHABILITY, MEASURED BEFORE THE FIX WAS WRITTEN. A plain, single-layer,
// opening-free, UNJOINED wall never reaches this function at all: `isSimpleWall`
// (:1147) routes it to `WallInstanceBridge`, which reads no rake and drops the lean too
// — a DIFFERENT defect with a different owner. The two are disjoint BY CONSTRUCTION,
// because `isSimpleWall` requires `!joinData?.startMN && !joinData?.endMN`. The scene
// below is therefore a JOINED corner (which is also the founder's L-955 case), and the
// `theInstancedArmDoesNotInterceptThisCase` assertion holds that reasoning to a
// measurement rather than to a reading of the source.

/** Lateral lean (along the wall's own leftPerp) of the top ring vs the base ring. */
function legacyArmLean(
    rake: number,
    withBridge: boolean,
): { lean: number; reachedFn: boolean; instanced: number } {
    (globalThis as { __pryzmWallPipelineV2?: boolean }).__pryzmWallPipelineV2 = false;
    const A = mk([0, 0], [5, 0], { rake });
    const B = mk([0, 0], [0, 5], { rake });
    const scene = new THREE.Scene();
    const builder = new WallFragmentBuilder(scene, levelProvider() as never);
    let instanced = 0;
    if (withBridge) {
        // A minimal bridge — enough for `isSimpleWall`'s `this._instanceBridge !== null`
        // to be TRUE, so the router's instancing arm is genuinely in play, and enough for
        // the standard-mesh path's `isInstanced`/`unregister` probe (:1235) not to throw.
        // `register` COUNTS, so "the instancing arm declined this wall" is a measurement
        // and not an inference from where an exception happened to land.
        (builder as unknown as { _instanceBridge: unknown })._instanceBridge = {
            register: () => { instanced++; },
            isInstanced: () => false,
            unregister: () => { /* no-op */ },
        };
    }
    builder.refreshV2Cache([A, B].map(specOf));
    const joins = WallJoinResolver.resolveLevel([A, B].map(w => ({ ...w })), { snapRadius: 0.5 });
    builder.buildWall(A, (joins.get(A.id) ?? null) as never, undefined, 0);

    const verts = bodyVertices(builder.getWallRoot(A.id) as unknown as THREE.Object3D);
    if (verts.length === 0) return { lean: NaN, reachedFn: false, instanced };
    // A runs along +X ⇒ leftPerp((1,0)) = (0,1) ⇒ the lateral axis IS +Z.
    const at = (y: number): number[] => verts.filter(v => Math.abs(v.y - y) < 1e-6).map(v => v.z);
    const mid = (v: number[]): number => (Math.min(...v) + Math.max(...v)) / 2;
    return { lean: mid(at(H)) - mid(at(0)), reachedFn: true, instanced };
}

describe('L-955 §L955-LEGACY-PLAIN-SHEAR — the plain legacy arm must not stand a raked wall up', () => {
    afterEach(() => { delete (globalThis as { __pryzmWallPipelineV2?: boolean }).__pryzmWallPipelineV2; });

    it('leans by h·cot θ on the legacy MiterPrism arm — at 80° AND at 110°, opposite signs', () => {
        // TWO angles of opposite sign, deliberately. A dropped shear reads 0 for both; a
        // hard-coded or sign-blind one cannot satisfy both. The measurement is the
        // canonical predicate's own value, so this cannot pass against a second spelling
        // of the trigonometry either.
        for (const rake of [80, 110]) {
            const { lean, reachedFn } = legacyArmLean(rake, false);
            const expected = H * rakeShearPerMetre(rake);
            // eslint-disable-next-line no-console
            console.log(`[L-955] legacy plain arm @ ${rake}°: lean ${lean.toFixed(9)} m, h·cotθ = ${expected.toFixed(9)} m`);
            expect(reachedFn, `${rake}°: the legacy arm produced a body`).toBe(true);
            expect(lean, `${rake}°: the legacy prism leans by h · cot θ`).toBeCloseTo(expected, 6);
        }
        // Signs really are opposite — so "both close to expected" is not two zeroes.
        expect(H * rakeShearPerMetre(80)).toBeGreaterThan(0);
        expect(H * rakeShearPerMetre(110)).toBeLessThan(0);
    });

    it('a 90° wall on the same arm does not move — the shear block is SKIPPED, not multiplied by identity', () => {
        const { lean } = legacyArmLean(90, false);
        // eslint-disable-next-line no-console
        console.log(`[L-955] legacy plain arm @ 90°: lean ${lean.toFixed(12)} m`);
        expect(lean).toBe(0);
    });

    it('theInstancedArmDoesNotInterceptThisCase — a JOINED wall still reaches the fragment path', () => {
        // With an instance bridge present, `isSimpleWall` is decided by the join: this
        // wall is mitred at its start, so `joinData.startMN` is set and the instancing
        // arm declines it. If that ever changes, the lean vanishes and this test says so —
        // which is the honest failure mode, because the shear would then never run.
        const { lean, reachedFn, instanced } = legacyArmLean(RAKE, true);
        // eslint-disable-next-line no-console
        console.log(`[L-955] legacy plain arm @ ${RAKE}° WITH instance bridge: reached=${reachedFn} register() calls=${instanced} lean ${lean.toFixed(9)} m`);
        expect(instanced, 'the instancing arm declined this wall — register() never called').toBe(0);
        expect(reachedFn, 'the joined wall did NOT go down the instanced arm').toBe(true);
        expect(lean).toBeCloseTo(H * K, 6);
    });
});

// ─── STEP 5 — DOES THE SPIKE GUARD FIRE? ──────────────────────────────────────
//
// `WallFragmentBuilder.ts:1543` logs *"a layer band failed the spike guard — falling
// back to legacy MiterPrism for the whole stack"*, and "spike" is what the founder
// photographed, so the fallback was a live suspect for the layered artefact. It is NOT
// the mechanism: measured on the founder's configuration the guard is SILENT both
// before and after the fix, so the layered wall was reaching the V2 band arm all along
// and failing there. The fallback is therefore neither the cause nor the cure — it
// stays as the honest degradation it was written to be, and this test is what keeps a
// future change from quietly starting to depend on it.

describe('L-955 STEP 5 — the §FIX-LAYERED-WALL-V2-PARITY spike guard is not involved', () => {
    it('never fires on the founder\'s raked layered corner — before or after the fix', () => {
        const seen: string[] = [];
        const realWarn = console.warn;
        console.warn = (...a: unknown[]) => { seen.push(a.map(String).join(' ')); };
        try {
            measureJoint(mk([0, 0], [5, 0], { layers: LAYERS, rake: RAKE }), plainB());
        } finally {
            console.warn = realWarn;
        }
        const guard = seen.filter(s => s.includes('failed the spike guard'));
        const v2guard = seen.filter(s => s.includes('§V2-SPIKE-GUARD'));
        // eslint-disable-next-line no-console
        console.log(`[L-955] spike-guard warnings: layered=${guard.length}, V2=${v2guard.length}`);
        expect(guard, 'the layered band guard did not fire — the V2 arm built the wall').toHaveLength(0);
        expect(v2guard, 'the plain V2 guard did not fire either').toHaveLength(0);
    });
});

describe('L-955 — raked wall HOSTING A WINDOW ↔ raked must close at the corner', () => {
    it('an opening-bearing raked wall shares its mitre corners with a raked neighbour at the TOP', () => {
        const A = mk([0, 0], [5, 0], { rake: RAKE, openings: [OP] });
        expectSoundJoint('raked + window ↔ raked', measureJoint(A, plainB()));
    });

    it('the opening is still carved where it was authored — the void rides the shear', () => {
        // Non-regression on the §RAKE-HOSTED-OPENING feature itself: the void's sill and
        // head stay PLUMB (a shear preserves Y), so a ray across the wall at the opening's
        // own height passes clean through, and one below the sill does not.
        const A = mk([0, 0], [5, 0], { rake: RAKE, openings: [OP] });
        const B = plainB();
        const scene = new THREE.Scene();
        const builder = new WallFragmentBuilder(scene, levelProvider() as never);
        builder.refreshV2Cache([A, B].map(specOf));
        const joins = WallJoinResolver.resolveLevel([A, B].map(w => ({ ...w })), { snapRadius: 0.5 });
        builder.buildWall(A, (joins.get(A.id) ?? null) as never, undefined, 0);
        const root = builder.getWallRoot(A.id) as unknown as THREE.Object3D;
        root.updateMatrixWorld(true);

        const xMid = OP.offset + OP.width / 2;          // 2.6 — the opening's centre station
        const shoot = (y: number): number => {
            const ray = new THREE.Raycaster(new THREE.Vector3(xMid, y, -50), new THREE.Vector3(0, 0, 1));
            return ray.intersectObject(root, true)
                .filter(h => {
                    const ud = (h.object as THREE.Mesh).userData as { role?: string; elementType?: string };
                    return (h.object as THREE.Mesh).isMesh === true && ud?.role === 'geometry'
                        && (ud.elementType === undefined || ud.elementType === 'WallPart');
                }).length;
        };
        const throughVoid = shoot(OP.sillHeight + OP.height / 2);   // y = 1.6 — inside the void
        const throughSolid = shoot(OP.sillHeight / 2);              // y = 0.45 — below the sill
        // eslint-disable-next-line no-console
        console.log(`[L-955] raked host carve: hits through void=${throughVoid}, through solid=${throughSolid}`);
        expect(throughVoid, 'the void is clear through the raked face').toBe(0);
        expect(throughSolid, 'the solid below the sill is still solid').toBeGreaterThan(0);
    });
});
