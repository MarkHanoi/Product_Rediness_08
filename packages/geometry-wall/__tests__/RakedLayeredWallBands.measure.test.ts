/**
 * §FEAT-RAKE-LAYERED (founder 2026-08-18) — "In parallel I need LAYERED walls to work
 * with RAKED walls too."
 *
 * ── WHAT IS MEASURED, AND WHERE FROM ─────────────────────────────────────────────────
 * Every number in this file is read off the BufferGeometry that `WallFragmentBuilder`
 * actually put in the scene — `mesh.userData.elementType === 'WallLayer'`, positions
 * attribute, world frame. Not `buildWallLayerBands`' return value, and not
 * `rakedPlanThickness`' return value. Committed ≠ reachable: this repo has shipped
 * "fixed" geometry that no code path could reach, and a pure function returning the
 * right number proves nothing about the wall a user sees.
 *
 * ── THE FOUNDER'S NUMBER ─────────────────────────────────────────────────────────────
 * A layer authored `t` thick is `t` thick PERPENDICULAR to the wall face. Sheared to θ,
 * it occupies `t / sin θ` in PLAN. Asserted here per layer, on the real mesh, at
 * {@link MESH_DP} decimal places — see that constant for why the bar is where it is.
 *
 * ── THE THREE WATCHED CONTROLS ───────────────────────────────────────────────────────
 *   A. RED-FIRST — the raked layered wall's per-layer plan bands are `t / sin θ` AND the
 *      solid is genuinely sheared. Both halves: a correctly-banded wall standing straight
 *      up is the silently-wrong outcome, not a partial win.
 *   B. NON-VACUITY — a layered wall at 90° is byte-identical to the same wall with the
 *      rake field ABSENT (the legacy shape), its bands are the authored thicknesses to
 *      the last bit (`toBe`, not `toBeCloseTo`), and its top sits exactly above its base.
 *      A single-layer RAKED wall keeps `wall.thickness` as its plan width — the plain
 *      path is not dragged into the widening.
 *   C. The `curved` refusal still fires, and so does the narrowed layered × openings one.
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { WallFragmentBuilder } from '../src/WallFragmentBuilder';
import { WallJoinResolver } from '../src/WallJoinResolver';
import { rakeAuthorability, rakedPlanThickness, rakeShearPerMetre } from '../src/WallRake';
import type { LevelWallSpec } from '../src/WallPipelineV2';
import type { WallData } from '../src/WallTypes';

// ─── The scene ────────────────────────────────────────────────────────────────────────
// A three-layer partition (board / studs / board) along +X, meeting a second layered wall
// at an L corner so the V2 junction solve is live — the arm a real drawn wall takes.
const LAYERS = [0.0125, 0.075, 0.0125];          // 0.10 m partition, exterior → interior
const T = LAYERS.reduce((s, t) => s + t, 0);     // = wall.thickness, as CreateWallCommand stamps it
const HEIGHT = 3;
const RAKE = 80;
const SIN80 = Math.sin((RAKE * Math.PI) / 180);  // 0.984807753012208

/**
 * Tolerance, in `toBeCloseTo` decimal places, for anything READ BACK OFF THE MESH.
 *
 * It is 6 (± 5e-7 m = half a micron) and NOT 9, and the reason is the measurement
 * apparatus, not the maths: `buildWallExtrusion` / `buildMiterPrism` store positions in a
 * `Float32BufferAttribute`, so a coordinate near 0.5 m carries ~3e-8 m of storage error and
 * one near 5 m carries ~5e-7 m. Asserting past that would be asserting on float32 rounding.
 *
 * The first run of this file DID assert at 9 and failed on six cases — every one of them by
 * 1e-9…6e-9, i.e. exactly the float32 floor, with the value otherwise dead on. Recorded here
 * so the relaxation reads as a calibrated instrument rather than a moved goalpost: half a
 * micron is four orders of magnitude below the smallest quantity this feature moves (the
 * 80° widening of a 12.5 mm board is 1.9e-4 m), so a real regression cannot hide under it.
 *
 * PURE-function assertions in this file stay at 12 dp — they never touch a buffer.
 */
const MESH_DP = 6;

let _seq = 0;
function mk(
    s: [number, number],
    e: [number, number],
    opts: { layers?: number[]; thickness?: number; rake?: number; openings?: unknown[] } = {},
): WallData {
    const layers = opts.layers;
    return {
        id: `rl${_seq++}`, type: 'wall', levelId: 'L', properties: {}, childrenIds: [],
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: HEIGHT,
        thickness: opts.thickness ?? (layers ? layers.reduce((a, b) => a + b, 0) : 0.2),
        baseOffset: 0,
        openings: opts.openings ?? [],
        layers: layers?.map((t, i) => ({ name: `l${i}`, thickness: t })),
        ...(opts.rake === undefined ? {} : { rakeAngleDeg: opts.rake }),
        metadata: { createdAt: _seq },
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

interface LayerRead {
    index: number;
    /** Lateral span of the BASE polygon, signed along leftPerp(direction), metres. */
    baseLo: number;
    baseHi: number;
    /** Lateral centroid of the base ring and of the top ring — their difference IS the shear. */
    baseMid: number;
    topMid: number;
    /** Every position float, world frame — for the byte-identity control. */
    positions: number[];
}

/**
 * Build `walls` through the REAL builder (real join data, real V2 cache) and report, per
 * layer of `target`, the lateral extents of the rendered solid in the wall's own plan frame.
 */
function measureLayers(walls: WallData[], target: WallData): LayerRead[] {
    const scene = new THREE.Scene();
    const builder = new WallFragmentBuilder(scene, {} as never);
    // No instance bridge: a multi-layer wall is excluded from the instanced arm anyway
    // (`_layerCount <= 1`), so the router sends it to the layered branch either way.
    builder.refreshV2Cache(walls.map(specOf));
    const joins = WallJoinResolver.resolveLevel(walls.map(w => ({ ...w })), { snapRadius: 0.5 });
    for (const w of walls) builder.buildWall(w, (joins.get(w.id) ?? null) as never, undefined, 0);

    const s = target.baseLine[0], e = target.baseLine[1];
    const dl = Math.hypot(e.x - s.x, e.z - s.z);
    const dx = (e.x - s.x) / dl, dz = (e.z - s.z) / dl;
    const px = -dz, pz = dx;                       // leftPerp(direction) — the rake's "left"

    const root = scene.children.find(c => c.userData?.id === target.id);
    expect(root, 'the builder put a group for the target wall in the scene').toBeTruthy();

    const out: LayerRead[] = [];
    root!.traverse(o => {
        const m = o as THREE.Mesh;
        if (!(m as unknown as { isMesh?: boolean }).isMesh) return;
        if (m.userData?.elementType !== 'WallLayer') return;
        const pos = m.geometry.getAttribute('position');
        const world = new THREE.Vector3();
        const lat: number[] = [];
        const ys: number[] = [];
        const positions: number[] = [];
        for (let i = 0; i < pos.count; i++) {
            world.fromBufferAttribute(pos as THREE.BufferAttribute, i);
            m.localToWorld(world);
            positions.push(world.x, world.y, world.z);
            lat.push((world.x - s.x) * px + (world.z - s.z) * pz);
            ys.push(world.y);
        }
        const yTop = Math.max(...ys), yBot = Math.min(...ys);
        const ringMid = (pick: (y: number) => boolean): number => {
            const v = lat.filter((_, i) => pick(ys[i]!));
            return (Math.min(...v) + Math.max(...v)) / 2;
        };
        out.push({
            index: m.userData.layerIndex as number,
            baseLo: Math.min(...lat.filter((_, i) => Math.abs(ys[i]! - yBot) < 1e-9)),
            baseHi: Math.max(...lat.filter((_, i) => Math.abs(ys[i]! - yBot) < 1e-9)),
            baseMid: ringMid(y => Math.abs(y - yBot) < 1e-9),
            topMid:  ringMid(y => Math.abs(y - yTop) < 1e-9),
            positions,
        });
    });
    out.sort((a, b) => a.index - b.index);
    return out;
}

/** The L-corner scene. `rake` applies to the FIRST (measured) wall only. */
function scene(rake: number | undefined, layers: number[] | undefined = LAYERS) {
    _seq = 0;
    const A = mk([0, 0], [5, 0], { layers, rake });
    const B = mk([5, 0], [5, 5], { layers });
    return { A, B, walls: [A, B] };
}

afterEach(() => { delete (globalThis as { __pryzmWallPipelineV2?: boolean }).__pryzmWallPipelineV2; });

// ─── CONTROL A — the founder's number, on the rendered solid ──────────────────────────

describe('§FEAT-RAKE-LAYERED — CONTROL A: per-layer plan footprint honours t / sin θ', () => {

    it('every layer of a RAKED layered wall measures t / sin θ in plan, on the real mesh', () => {
        const { A, walls } = scene(RAKE);
        const read = measureLayers(walls, A);

        expect(read, 'the layered arm produced one mesh per layer').toHaveLength(LAYERS.length);

        // eslint-disable-next-line no-console
        console.log(`\n[§FEAT-RAKE-LAYERED] wall ${A.id}, rake ${RAKE}°, sin θ = ${SIN80.toFixed(9)}`);
        // eslint-disable-next-line no-console
        console.log('  layer   authored t (perp)   measured PLAN width   t / sin θ (expected)   recovered perp');
        for (const r of read) {
            const t = LAYERS[r.index]!;
            const measured = r.baseHi - r.baseLo;
            // eslint-disable-next-line no-console
            console.log(
                `    ${r.index}      ${t.toFixed(6)}           ${measured.toFixed(9)}` +
                `           ${(t / SIN80).toFixed(9)}          ${(measured * SIN80).toFixed(9)}`,
            );
            expect(measured, `layer ${r.index} plan width = t / sin θ`).toBeCloseTo(t / SIN80, MESH_DP);
            // THE ARCHITECT'S NUMBER, stated the way they authored it: the layer really is
            // `t` thick measured perpendicular to the face it was drawn against.
            expect(measured * SIN80, `layer ${r.index} recovers its authored PERPENDICULAR t`)
                .toBeCloseTo(t, MESH_DP);
        }

        // The stack tiles the wall's raked plan width — no seam, nothing clipped away.
        const spanned = read[read.length - 1]!.baseHi - read[0]!.baseLo;
        // eslint-disable-next-line no-console
        console.log(`  stack plan span ${spanned.toFixed(9)} m  vs  wall.thickness / sin θ = ${(T / SIN80).toFixed(9)} m\n`);
        expect(spanned).toBeCloseTo(T / SIN80, MESH_DP);
        expect(spanned).toBeCloseTo(0.1015423, MESH_DP);      // the literal number, so a silent drift is loud
        for (let i = 1; i < read.length; i++) {
            expect(read[i]!.baseLo, `layer ${i} starts where layer ${i - 1} ends — no gap, no overlap`)
                .toBeCloseTo(read[i - 1]!.baseHi, MESH_DP);
        }
    });

    it('the raked layered solid is genuinely SHEARED — banding it correctly is only half', () => {
        // A wall banded at t / sin θ but standing straight up is the silently-wrong outcome:
        // the numbers audit clean and the render is a lie. Measure the top ring against the base.
        const { A, walls } = scene(RAKE);
        const read = measureLayers(walls, A);
        const expectedShift = HEIGHT * rakeShearPerMetre(RAKE);   // h · cot 80° ≈ +0.5290 m, toward LEFT

        // eslint-disable-next-line no-console
        console.log(`[§FEAT-RAKE-LAYERED] expected top-vs-base lateral shift: ${expectedShift.toFixed(9)} m`);
        for (const r of read) {
            // eslint-disable-next-line no-console
            console.log(`    layer ${r.index}: baseMid ${r.baseMid.toFixed(9)}  topMid ${r.topMid.toFixed(9)}  Δ ${(r.topMid - r.baseMid).toFixed(9)}`);
            expect(r.topMid - r.baseMid, `layer ${r.index} leans by h·cot θ`).toBeCloseTo(expectedShift, MESH_DP);
        }
        expect(expectedShift).toBeCloseTo(0.528981, 6);
        // Sign: 80° < 90° ⇒ the top moves toward the wall's LEFT (+leftPerp). Positive.
        expect(expectedShift).toBeGreaterThan(0);
    });

    it('the LEGACY fallback arm shears too — a fallback must never render the wall vertical', () => {
        // `__pryzmWallPipelineV2 = false` forces every wall onto `buildMiterPrism`, the arm
        // that has no shear of its own. Before this feature that arm would have stood a raked
        // layered wall bolt upright while the store held 80° — the worst outcome available.
        (globalThis as { __pryzmWallPipelineV2?: boolean }).__pryzmWallPipelineV2 = false;
        const { A, walls } = scene(RAKE);
        const read = measureLayers(walls, A);
        const expectedShift = HEIGHT * rakeShearPerMetre(RAKE);

        expect(read).toHaveLength(LAYERS.length);
        for (const r of read) {
            expect(r.topMid - r.baseMid, `legacy layer ${r.index} leans`).toBeCloseTo(expectedShift, MESH_DP);
            expect(r.baseHi - r.baseLo, `legacy layer ${r.index} plan width = t / sin θ`)
                .toBeCloseTo(LAYERS[r.index]! / SIN80, MESH_DP);
        }
    });

    it('a 120° rake leans the OTHER way, and the widening is symmetric about 90°', () => {
        const { A, walls } = scene(120);
        const read = measureLayers(walls, A);
        const sin120 = Math.sin((120 * Math.PI) / 180);
        for (const r of read) {
            expect(r.baseHi - r.baseLo).toBeCloseTo(LAYERS[r.index]! / sin120, MESH_DP);
            expect(r.topMid - r.baseMid, 'top moves toward the RIGHT at >90°').toBeLessThan(0);
        }
        // sin is symmetric about 90°, so 80° and 100° widen by exactly the same factor.
        expect(rakedPlanThickness(0.1, 80)).toBeCloseTo(rakedPlanThickness(0.1, 100), 12);
    });
});

// ─── CONTROL B — non-vacuity ──────────────────────────────────────────────────────────

describe('§FEAT-RAKE-LAYERED — CONTROL B: the existing paths are not regressed', () => {

    it('a layered wall at 90° is BYTE-IDENTICAL to the same wall with no rake field at all', () => {
        const withNinety = scene(90);
        const withAbsent = scene(undefined);
        const a = measureLayers(withNinety.walls, withNinety.A);
        const b = measureLayers(withAbsent.walls, withAbsent.A);

        expect(a).toHaveLength(b.length);
        for (let i = 0; i < a.length; i++) {
            expect(a[i]!.positions.length, `layer ${i} vertex count`).toBe(b[i]!.positions.length);
            for (let k = 0; k < a[i]!.positions.length; k++) {
                // Object.is, via toBe — bit equality, not a tolerance.
                expect(a[i]!.positions[k]).toBe(b[i]!.positions[k]);
            }
        }
    });

    it('a VERTICAL layered wall bands at the AUTHORED thicknesses, exactly — no 1/sin drift', () => {
        const { A, walls } = scene(undefined);
        const read = measureLayers(walls, A);

        // eslint-disable-next-line no-console
        console.log('\n[§FEAT-RAKE-LAYERED] NON-VACUITY — vertical layered wall (the pre-feature shape):');
        let cursor = -T / 2;
        for (const r of read) {
            const t = LAYERS[r.index]!;
            // eslint-disable-next-line no-console
            console.log(`    layer ${r.index}: plan width ${(r.baseHi - r.baseLo).toFixed(9)}  (authored ${t})  lo ${r.baseLo.toFixed(9)}`);
            expect(r.baseHi - r.baseLo, `layer ${r.index} width is the authored t`).toBeCloseTo(t, MESH_DP);
            // The documented cursor walk, unmoved: [-total/2 + Σ_{j<i} t_j, + t_i].
            expect(r.baseLo, `layer ${r.index} sits where it always sat`).toBeCloseTo(cursor, MESH_DP);
            cursor += t;
            // No shear whatsoever: the top ring is directly above the base ring.
            expect(r.topMid - r.baseMid, `layer ${r.index} is vertical`).toBe(0);
        }
        expect(read[read.length - 1]!.baseHi).toBeCloseTo(T / 2, MESH_DP);
        // eslint-disable-next-line no-console
        console.log(`    stack plan span ${(read[read.length - 1]!.baseHi - read[0]!.baseLo).toFixed(9)} m  vs wall.thickness ${T}\n`);
    });

    it('a SINGLE-LAYER raked wall is NOT widened — the plain path keeps its plan footprint', () => {
        // `thickness` on a plain wall is a PLAN quantity already (WallRake's stated
        // convention), so the widening must not reach it. This is the boundary of the
        // feature, and it is the assertion that stops it leaking into every raked wall.
        _seq = 0;
        const A = mk([0, 0], [5, 0], { layers: [0.2], rake: RAKE });
        const B = mk([5, 0], [5, 5], { layers: [0.2] });
        const read = measureLayers([A, B], A);
        expect(read).toHaveLength(1);
        // eslint-disable-next-line no-console
        console.log(`[§FEAT-RAKE-LAYERED] single-layer raked wall plan width ${(read[0]!.baseHi - read[0]!.baseLo).toFixed(9)} (authored thickness 0.2, NOT 0.2/sin80 = ${(0.2 / SIN80).toFixed(9)})`);
        expect(read[0]!.baseHi - read[0]!.baseLo).toBeCloseTo(0.2, MESH_DP);
        expect(read[0]!.baseHi - read[0]!.baseLo).not.toBeCloseTo(0.2 / SIN80, 6);
        // …and it still leans, exactly as it did before this feature existed.
        expect(read[0]!.topMid - read[0]!.baseMid).toBeCloseTo(HEIGHT * rakeShearPerMetre(RAKE), MESH_DP);
    });
});

// ─── CONTROL C — what is still refused, and what stopped being refused ────────────────
//
// ⚠ THIS BLOCK WAS CALLED "the refusals that must survive". NEITHER OF THE TWO SURVIVED,
//   and both are rewritten here rather than deleted (C84 §6) because the REASONS they gave
//   are the interesting part — each was true, checkable, and later falsified by building
//   the thing it said was missing. That is the healthy outcome for a refusal; the failure
//   mode this file guards against is a refusal whose reason nobody re-checks.

describe('§FEAT-RAKE-LAYERED — CONTROL C: what is still refused', () => {

    it('rake × CURVED is ALLOWED — "ill-posed, not merely unbuilt" was the wrong call', () => {
        // ⚠ This test asserted the opposite and justified it as *"ill-posed, not merely
        //   unbuilt"*. The ill-posedness was in the ASSUMED SOLUTION — one shear vector,
        //   which is indeed only right at one station — and not in the question.
        //   §FEAT-RAKE-CURVED (founder mandate 2026-08-19) builds it as a CONE: each
        //   station's top edge displaced along its OWN normal by `h·cot θ`, constant
        //   batter, concentric top arc, degenerating to the straight rule as R → ∞.
        const a = rakeAuthorability({ rakeAngleDeg: RAKE, curve: { control: { x: 1, y: 0, z: 1 } } });
        expect(a.ok).toBe(true);
        // …including a curved LAYERED wall, which the founder asked for by name. Its bands
        // are concentric frusta, laid out radially at `t / sin θ` by the same
        // `rakedPlanThickness` the straight arms use.
        expect(rakeAuthorability({ rakeAngleDeg: RAKE, curve: {}, layers: [{}, {}] }).ok).toBe(true);
    });

    it('rake × LAYERED × OPENINGS is ALLOWED — that builder now HAS a shear', () => {
        // ⚠ Asserted the opposite, on the ground that "that builder has no shear". Measured
        //   true at the time (lean 0.000 against an expected 0.528981) and measured false
        //   now: §FEAT-RAKE-LAYERED-OPENINGS gave it `t / sin θ` bands, the shear, and its
        //   share of the §L955-ONE-CORNER-RULE residual. The arm also had an off-by-one
        //   (L-1064) that let the ONE-layer case through unsheared all along.
        const a = rakeAuthorability({ rakeAngleDeg: RAKE, layers: [{}, {}], openings: [{ id: 'o' }] });
        expect(a.ok).toBe(true);
        expect(a.code).toBeUndefined();
        // The one-layer twin, asserted beside it so the two can never disagree again.
        expect(rakeAuthorability({ rakeAngleDeg: RAKE, layers: [{}], openings: [{ id: 'o' }] }).ok).toBe(true);
    });

    it('the CURVED-COLLAPSE arm is what replaced the blanket curved refusal', () => {
        // Non-vacuity for the two inversions above: lifting them did not leave the gate
        // with nothing to say about a curved rake. A top ring pushed inward past its own
        // centre of curvature inverts, and that IS refused — naming both numbers.
        const a = rakeAuthorability({
            rakeAngleDeg: 20, curve: { control: { x: 1, y: 0, z: 1 } },
            height: 3, curveMinRadiusM: 0.5,
        });
        expect(a.ok).toBe(false);
        expect(a.code).toBe('curved-collapse');
        expect(a.reason).toContain('0.500');
    });

    it('rake × LAYERED with NO openings is ALLOWED — the feature is actually reachable', () => {
        expect(rakeAuthorability({ rakeAngleDeg: RAKE, layers: [{}, {}, {}] }).ok).toBe(true);
        expect(rakeAuthorability({ rakeAngleDeg: RAKE, layers: [{}, {}], openings: [] }).ok).toBe(true);
    });

    it('out-of-range is still rejected, so sin θ can never approach 0 in a built wall', () => {
        for (const bad of [0, 14.9, 165.1, 180]) {
            expect(rakeAuthorability({ rakeAngleDeg: bad }).ok).toBe(false);
        }
        // The widening factor over the whole ADMISSIBLE band is bounded by 3.8637.
        for (const deg of [15, 30, 90, 150, 165]) {
            expect(rakedPlanThickness(1, deg)).toBeLessThanOrEqual(3.8638);
            expect(rakedPlanThickness(1, deg)).toBeGreaterThanOrEqual(1);
        }
    });
});
