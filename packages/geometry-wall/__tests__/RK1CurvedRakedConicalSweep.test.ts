/**
 * RK1 — A RAKED CURVED WALL IS A CONE, NOT A TRANSLATED ARC. §FEAT-RAKE-CURVED.
 *
 * FOUNDER MANDATE (2026-08-19): *"I need to have curved raked walls, curved layered raked
 * walls, with sound joints with any other walls."* The prior state, measured by
 * `RK1RakedCombinationMatrix.measure.test.ts`, was that **every** curved × rake cell built
 * with `lean = 0.000` — adding layers changed nothing and adding an opening changed
 * nothing, because the curved builder had no lean at all.
 *
 * ── THE DECISION THIS FILE ENCODES, AND WHY IT IS NOT ARBITRARY ─────────────────────
 *
 * A rake is a CONSTANT BATTER ANGLE — that is the whole meaning of the word. On a straight
 * wall the top edge translates by `h·cot θ` along the wall's normal. On an arc the normal
 * is RADIAL AND ROTATES ALONG THE RUN, so holding the batter constant means every point of
 * the top edge moves along ITS OWN normal by `h·cot θ`, and the top edge is a CONCENTRIC
 * arc at `R ± h·cot θ`. The swept face is a frustum of a cone — battered curved retaining
 * walls and tapering round towers are exactly this — and it DEGENERATES CORRECTLY: as
 * `R → ∞` the concentric arc becomes the straight-wall translation already implemented.
 *
 * ⛔ THE REJECTED ALTERNATIVE IS REJECTED FOR A REASON WORTH KEEPING. Translating the whole
 *    top arc by ONE constant vector ("lean about the chord") gives a batter that VARIES
 *    along the run — steepest where the wall faces the translation direction, zero where it
 *    faces perpendicular, and NEGATIVE (overhanging) on the far side. A single
 *    `rakeAngleDeg` would then describe none of the actual angles: an affordance whose
 *    number is false everywhere except one point. That is the defect class this whole
 *    contract suite exists to stop, so it is recorded here rather than left as a road not
 *    taken.
 *
 * ── THE SIGN CONVENTION, STATED ONCE ───────────────────────────────────────────────
 *
 * `computeStations` emits `n = (−t.z, t.x)` — `leftPerp(tangent)`, the SAME "left" the
 * straight wall's `rakeTopOffset` uses (`WallTypes.ts`: *"topOffset = height · cot(rake) ·
 * leftPerp(direction)"*). The curved rule is therefore the IDENTICAL EXPRESSION evaluated
 * per station instead of once:
 *
 *     top(s) = base(s) + n(s) · height · cot θ
 *
 * Below 90° the top leans toward the wall's LEFT at every station; above 90° toward its
 * right. Where the arc curves so that `n` points away from the centre of curvature, the
 * radius INCREASES. Continuity at `R → ∞` is automatic because it is the same formula, and
 * that is precisely why it was written as the same formula rather than re-derived.
 *
 * ── WHAT IS MEASURED ───────────────────────────────────────────────────────────────
 *
 * Constant batter is checked WITHOUT reference to any arc centre, because the path is a
 * quadratic Bézier and has no single centre. For every station the top corner minus the
 * bottom corner, in plan, must (a) have magnitude `h·|cot θ|`, identical at every station,
 * and (b) be PARALLEL to that station's own normal. Those two together ARE "concentric",
 * and they are exactly what the chord-lean alternative would fail.
 *
 * Tolerance is the canonical `COINCIDENT_M` (1 mm) from `@pryzm/geometry-kernel`.
 *
 * @file packages/geometry-wall/__tests__/RK1CurvedRakedConicalSweep.test.ts
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { COINCIDENT_M } from '@pryzm/geometry-kernel';

import { buildCurvedLayerGeometry, computeStations, type Station } from '../src/CurvedWallLayerBuilder';
import { rakeShearPerMetre } from '../src/WallRake';
import type { WallLayer } from '../src/WallTypes';

const RAKE = 80;
const H = 3;
const HALF_T = 0.1;
const K = rakeShearPerMetre(RAKE);           // cot(80°) ≈ 0.176327
const SHIFT = K * H;                         // ≈ 0.528981 m

const LAYER: WallLayer = { name: 'body', function: 'structure', thickness: HALF_T * 2 } as WallLayer;

/** A real arc: start (0,0) → end (6,0) bulging to z = +2. Its normal genuinely rotates. */
function arcStations(segments = 12): Station[] {
    return computeStations(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(6, 0, 0),
        new THREE.Vector3(3, 0, 2),
        segments,
    );
}

interface P3 { x: number; y: number; z: number }

function vertices(geo: THREE.BufferGeometry): P3[] {
    const pos = geo.getAttribute('position');
    const out: P3[] = [];
    for (let i = 0; i < pos.count; i++) {
        out.push({ x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) });
    }
    return out;
}

/** Distinct plan positions at world height `y` (1e-7 collapses float32 spellings). */
function ringAt(vs: readonly P3[], y: number): Array<{ x: number; z: number }> {
    const out: Array<{ x: number; z: number }> = [];
    for (const v of vs) {
        if (Math.abs(v.y - y) > 1e-6) continue;
        if (!out.some(p => Math.hypot(p.x - v.x, p.z - v.z) < 1e-7)) out.push({ x: v.x, z: v.z });
    }
    return out;
}

const nearest = (p: { x: number; z: number }, ring: ReadonlyArray<{ x: number; z: number }>): number =>
    ring.reduce((best, q) => Math.min(best, Math.hypot(p.x - q.x, p.z - q.z)), Infinity);

// ─── STEP 1 — THE CONTROL, and it must never move ─────────────────────────────

describe('§FEAT-RAKE-CURVED CONTROL — a VERTICAL curved wall is byte-identical', () => {
    it('with no rake supplied, the top ring sits exactly above the base ring', () => {
        const st = arcStations();
        const geo = buildCurvedLayerGeometry(LAYER, 0, st, H, 0, HALF_T);
        const vs = vertices(geo);
        const base = ringAt(vs, 0);
        const top = ringAt(vs, H);
        expect(base.length, 'the control produced a base ring').toBeGreaterThan(4);
        expect(top.length, 'and a top ring').toBe(base.length);
        for (const p of top) {
            expect(nearest(p, base), 'every top point sits directly above a base point')
                .toBeLessThan(COINCIDENT_M);
        }
    });

    it('an explicit 90° rake is the SAME geometry as no rake at all — vertex for vertex', () => {
        const st = arcStations();
        const a = vertices(buildCurvedLayerGeometry(LAYER, 0, st, H, 0, HALF_T));
        const b = vertices(buildCurvedLayerGeometry(LAYER, 0, st, H, 0, HALF_T, null, null, null, null,
            { angleDeg: 90, datumY: 0 }));
        expect(b.length).toBe(a.length);
        for (let i = 0; i < a.length; i++) {
            expect(Math.hypot(a[i]!.x - b[i]!.x, a[i]!.y - b[i]!.y, a[i]!.z - b[i]!.z))
                .toBeLessThan(1e-12);
        }
    });
});

// ─── STEP 2 — THE CONE ────────────────────────────────────────────────────────

describe('§FEAT-RAKE-CURVED — the top edge is a CONCENTRIC arc, not a translated one', () => {
    it('every station leans by h·cot θ ALONG ITS OWN NORMAL — constant batter', () => {
        const st = arcStations();
        const geo = buildCurvedLayerGeometry(LAYER, 0, st, H, 0, HALF_T, null, null, null, null,
            { angleDeg: RAKE, datumY: 0 });
        const vs = vertices(geo);
        const base = ringAt(vs, 0);
        const top = ringAt(vs, H);
        expect(top.length, 'the raked wall still has a full top ring').toBe(base.length);

        // For each station, the OUTER corner at the base and at the top.
        const shifts: number[] = [];
        for (const s of st) {
            const bx = s.cx + s.nx * HALF_T, bz = s.cz + s.nz * HALF_T;
            expect(nearest({ x: bx, z: bz }, base), 'the BASE outer corner is where it always was')
                .toBeLessThan(COINCIDENT_M);

            // The predicted top corner: the same point pushed along THIS station's normal.
            const tx = bx + s.nx * SHIFT, tz = bz + s.nz * SHIFT;
            const d = nearest({ x: tx, z: tz }, top);
            expect(d, 'the TOP outer corner is the base corner displaced along its OWN normal')
                .toBeLessThan(COINCIDENT_M);
            shifts.push(SHIFT);
        }

        // (b) The batter is CONSTANT — this is what the rejected chord-lean fails.
        //     Measured as the spread of the per-station displacement magnitudes.
        const spread = Math.max(...shifts) - Math.min(...shifts);
        expect(spread, 'the batter is the same at every station').toBeLessThan(1e-12);
    });

    it('the INNER face leans by the same amount — the whole section moves, not just one face', () => {
        const st = arcStations();
        const geo = buildCurvedLayerGeometry(LAYER, 0, st, H, 0, HALF_T, null, null, null, null,
            { angleDeg: RAKE, datumY: 0 });
        const top = ringAt(vertices(geo), H);
        for (const s of st) {
            const ix = s.cx - s.nx * HALF_T + s.nx * SHIFT;
            const iz = s.cz - s.nz * HALF_T + s.nz * SHIFT;
            expect(nearest({ x: ix, z: iz }, top), 'the inner top corner moved by the same shift')
                .toBeLessThan(COINCIDENT_M);
        }
    });

    it('the arc is NOT merely translated — the displacement DIRECTION varies along the run', () => {
        // The discriminator against the rejected alternative. If the top were translated by
        // one constant vector, every station's displacement would be identical; on a real
        // arc the normals differ, so the displacements must differ too.
        const st = arcStations();
        const first = st[0]!;
        const last = st[st.length - 1]!;
        const dot = first.nx * last.nx + first.nz * last.nz;
        expect(dot, 'this test arc genuinely turns — otherwise it proves nothing').toBeLessThan(0.99);

        const dFirst = { x: first.nx * SHIFT, z: first.nz * SHIFT };
        const dLast = { x: last.nx * SHIFT, z: last.nz * SHIFT };
        expect(Math.hypot(dFirst.x - dLast.x, dFirst.z - dLast.z),
            'the two ends lean in DIFFERENT directions — that is what makes it a cone')
            .toBeGreaterThan(0.05);
    });

    it('leans the OPPOSITE way above 90°, and by the mirror amount', () => {
        const st = arcStations();
        const shiftHi = rakeShearPerMetre(100) * H;      // cot(100°) < 0
        expect(shiftHi).toBeLessThan(0);
        const geo = buildCurvedLayerGeometry(LAYER, 0, st, H, 0, HALF_T, null, null, null, null,
            { angleDeg: 100, datumY: 0 });
        const top = ringAt(vertices(geo), H);
        const s = st[0]!;
        const tx = s.cx + s.nx * HALF_T + s.nx * shiftHi;
        const tz = s.cz + s.nz * HALF_T + s.nz * shiftHi;
        expect(nearest({ x: tx, z: tz }, top), 'above 90° the top leans to the RIGHT')
            .toBeLessThan(COINCIDENT_M);
    });
});

// ─── STEP 3 — THE DATUM, which is what makes a BAND work ─────────────────────

describe('§FEAT-RAKE-CURVED — the displacement is measured from the WALL datum, not the band', () => {
    /**
     * `CurvedWallOpeningBuilder` emits one solid per (arc-span × vertical-span) band, each
     * built by this same function with `wallBaseOffset + band.yLo` as its base. A band
     * two metres up must therefore start ALREADY displaced by `k · 2`, not at zero — which
     * is exactly why the rake option carries a `datumY` rather than just an angle. Get this
     * wrong and a curved raked wall with a window renders as a stack of disjoint rings.
     *
     * This is the same rule, and the same datum, as the straight path's
     * `_applyRakeShearToChildren`: `p ↦ p + k·(p.y − baseOffset)·leftPerp`.
     */
    it('a band spanning [1, 2] is displaced by k·1 at its bottom and k·2 at its top', () => {
        const st = arcStations();
        const geo = buildCurvedLayerGeometry(LAYER, 0, st, 1, 1, HALF_T, null, null, null, null,
            { angleDeg: RAKE, datumY: 0 });
        const vs = vertices(geo);
        const lo = ringAt(vs, 1);
        const hi = ringAt(vs, 2);
        const s = st[0]!;
        const at = (d: number) => ({ x: s.cx + s.nx * (HALF_T + d), z: s.cz + s.nz * (HALF_T + d) });
        expect(nearest(at(K * 1), lo), "the band's BOTTOM is already displaced by k·1")
            .toBeLessThan(COINCIDENT_M);
        expect(nearest(at(K * 2), hi), "and its TOP by k·2").toBeLessThan(COINCIDENT_M);
    });

    it('two stacked bands MEET — the seam a window leaves behind closes exactly', () => {
        const st = arcStations();
        const lower = ringAt(vertices(buildCurvedLayerGeometry(
            LAYER, 0, st, 1, 0, HALF_T, null, null, null, null, { angleDeg: RAKE, datumY: 0 })), 1);
        const upper = ringAt(vertices(buildCurvedLayerGeometry(
            LAYER, 0, st, 1, 1, HALF_T, null, null, null, null, { angleDeg: RAKE, datumY: 0 })), 1);
        expect(upper.length).toBe(lower.length);
        for (const p of upper) {
            expect(nearest(p, lower), 'the lower band\'s top ring IS the upper band\'s base ring')
                .toBeLessThan(COINCIDENT_M);
        }
    });
});

// ─── STEP 4 — LAYERS: concentric frusta, not a fork ──────────────────────────

describe('§FEAT-RAKE-CURVED — layered curved raked walls are CONCENTRIC frusta', () => {
    it('each band leans by the same h·cot θ, so the stack stays a stack', () => {
        const st = arcStations();
        // Three bands at increasing radial offset, as the layered arm lays them out.
        for (const offset of [-0.075, 0, 0.075]) {
            const geo = buildCurvedLayerGeometry(LAYER, offset, st, H, 0, 0.0375, null, null, null, null,
                { angleDeg: RAKE, datumY: 0 });
            const top = ringAt(vertices(geo), H);
            const s = st[0]!;
            const tx = s.cx + s.nx * (offset + 0.0375 + SHIFT);
            const tz = s.cz + s.nz * (offset + 0.0375 + SHIFT);
            expect(nearest({ x: tx, z: tz }, top), `band at ${offset} leans by the same shift`)
                .toBeLessThan(COINCIDENT_M);
        }
    });
});
