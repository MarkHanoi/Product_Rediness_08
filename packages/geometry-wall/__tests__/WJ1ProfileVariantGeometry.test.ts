/**
 * WJ1 — §FEAT-WALL-PROFILE-CURVED (L-1072) and the ASSERTION of profile × rake (L-1065).
 *
 * The founder: *"I WOULD LIKE TO BE ABLE TO EDIT A WALL PROFILE OF A RAKED WALL AND A
 * CURVED WALL."* `WallProfileVariants.ts` holds a row per axis and every one of them is
 * `unbuilt`. A row may be flipped only by a lane that has MEASURED the combination. This
 * file is the measurement for two of them.
 *
 * ── THE TWO ROWS ARE DIFFERENT KINDS OF WORK, AND THAT IS THE FINDING ──────────────
 *
 * **`raked` was already BUILT and merely UNASSERTED.** `WallFragmentBuilder`'s profile arm
 * ends by calling `_applyRakeShearToChildren`, and the ring is authored in the un-sheared
 * frame precisely so the two compose. Nothing needed writing. What was missing was a test,
 * and an unverified affordance is exactly what L-1065 was: the editor offered for a
 * combination nobody had built. So the honest fix is to MEASURE, not to build.
 *
 * **`curved` was genuinely UNBUILT, and the refusal that hid it was wrong in a way this
 * family has now been wrong three times.** Its text — *"a straight profile edge is not
 * straight in space, so every edge would have to be tessellated per station and the curved
 * builder has no per-station top"* — reads like a law and is a TODO list. Clause one is a
 * reason to tessellate (`insertStationsAt`); clause two was a fact about two scalars in
 * `CurvedWallLayerBuilder` (`CurvedProfileHeights`). ⭐ The file's own header had already
 * said so — *"A profile on a curve is NOT ill-posed … it is refused because it is UNBUILT …
 * This one CAN lift"* — and the refusal persisted anyway, because downstream readers quote
 * the user-facing STRING and not the header.
 *
 * ── INSTRUMENTS FIRST ──────────────────────────────────────────────────────────────
 *
 * RK1 found two of its own instruments wrong, and one of them is directly relevant here:
 * a body's MAXIMUM y cannot see a profile that cuts ONE END down, because the other end is
 * still at full height. Every height assertion below is therefore LOCAL — the greatest y
 * within a small plan radius of a named point — and each is paired with the other end,
 * which must NOT have moved. A cut measured at one end and an uncut end measured at the
 * other cannot both be produced by a builder that ignored the ring.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { COINCIDENT_M } from '@pryzm/geometry-kernel';
import { WallFragmentBuilder } from '../src/WallFragmentBuilder';
import { buildCurvedLayerGeometry, computeStations } from '../src/CurvedWallLayerBuilder';
import { WallJoinResolver } from '../src/WallJoinResolver';
import { profileAuthorability, wallProfileExtentAt } from '../src/WallProfile';
import { wallCentrelineLength } from '../src/WallArcParam';
import type { WallData } from '../src/WallTypes';

const H = 3;
const T = 0.2;
const RAKE = 80;
const K = Math.abs(1 / Math.tan((RAKE * Math.PI) / 180));
const EXPECTED_LEAN = H * K;                        // ≈ 0.528981 m

let _seq = 0;
function mk(
    s: [number, number], e: [number, number],
    opts: { rake?: number; curve?: unknown; profile?: unknown } = {},
): WallData {
    return {
        id: `wj1-${_seq++}`, type: 'wall', levelId: 'L', properties: {}, childrenIds: [],
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: H, thickness: T, baseOffset: 0, openings: [],
        ...(opts.rake === undefined ? {} : { rakeAngleDeg: opts.rake }),
        ...(opts.curve ? { curve: opts.curve } : {}),
        ...(opts.profile ? { wallProfile: opts.profile } : {}),
        metadata: { createdAt: _seq, modifiedAt: _seq, createdBy: 'wj1', version: 1 },
    } as unknown as WallData;
}

function levelProvider() {
    const level = { id: 'L', name: 'Ground', elevation: 0, height: H, childrenIds: [] };
    return { getLevelById: (id: string) => (id === 'L' ? { ...level } : undefined), getLevels: () => [{ ...level }] };
}

const specOf = (w: WallData) => ({
    id: w.id,
    startXZ: { x: w.baseLine[0].x, z: w.baseLine[0].z },
    endXZ: { x: w.baseLine[1].x, z: w.baseLine[1].z },
    thickness: w.thickness,
    rakeAngleDeg: (w as unknown as { rakeAngleDeg?: number }).rakeAngleDeg,
    layered: false,
});

/** World-space body vertices — the SAME selection rule the shared joint harness uses. */
function bodyVerts(walls: WallData[], id: string): THREE.Vector3[] {
    const scene = new THREE.Scene();
    const builder = new WallFragmentBuilder(scene, levelProvider() as never);
    builder.refreshV2Cache(walls.map(specOf) as never);
    const joins = WallJoinResolver.resolveLevel(walls.map(w => ({ ...w })), { snapRadius: 0.5 });
    for (const w of walls) builder.buildWall(w, (joins.get(w.id) ?? null) as never, undefined, 0);
    const root = builder.getWallRoot(id) as unknown as THREE.Object3D | null;
    if (!root) return [];
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

const lone = (w: WallData): THREE.Vector3[] => bodyVerts([w, mk([50, 50], [55, 50])], w.id);

/**
 * The greatest world-Y within `r` metres (in PLAN) of `(x, z)`.
 *
 * ⚠ LOCAL, NEVER THE WHOLE BODY. `topRingY`-style whole-body extrema cannot see a ring
 *   that cuts one end down — RK1's §RK1-MAX-Y-CANNOT-SEE-A-PARTIAL-CUT, which failed as
 *   "expected 3 to be less than 2.999". Every assertion here names a place.
 */
function topNear(vs: readonly THREE.Vector3[], x: number, z: number, r = 0.35): number {
    let best = -Infinity;
    for (const v of vs) if (Math.hypot(v.x - x, v.z - z) <= r) best = Math.max(best, v.y);
    return best;
}

/** Greatest perpendicular distance of any vertex from the straight chord — "is it an arc?" */
function bulgeFromChord(vs: readonly THREE.Vector3[], a: [number, number], b: [number, number]): number {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len, nz = dx / len;
    let best = 0;
    for (const v of vs) best = Math.max(best, Math.abs((v.x - a[0]) * nx + (v.z - a[1]) * nz));
    return best;
}

// ════════════════════════════════════════════════════════════════════════════════════
//  ROW 1 — `raked`. ALREADY BUILT. This file only has to prove it.
// ════════════════════════════════════════════════════════════════════════════════════

/** A straight 5 m wall whose FAR end is cut down to 1 m. */
const STRAIGHT_RING = { ring: [{ u: 0, v: 0 }, { u: 5, v: 0 }, { u: 5, v: 1 }, { u: 0, v: H }] };

describe('WJ1 — profile × RAKE: the composition is real, not merely plumbed', () => {
    it('CONTROL — the gate admits a profile on a raked wall, and always has', () => {
        // This is the L-1065 fact itself: `profileAuthorability` has NO rake arm, so the
        // store would have ACCEPTED the profile all along. The editor being offered was
        // therefore not a UI bug — it was an unmeasured promise.
        const subj = { wallProfile: STRAIGHT_RING, baseLine: [{ x: 0, z: 0 }, { x: 5, z: 0 }], height: H };
        expect(profileAuthorability(subj as never).ok).toBe(true);
        expect(profileAuthorability({ ...subj, rakeAngleDeg: RAKE } as never).ok).toBe(true);
    });

    it('CONTROL CAN FAIL — an UNPROFILED wall reaches full height at BOTH ends', () => {
        // Without this, "the far end is 1 m" could be true of every wall the harness
        // builds and the discriminator below would be measuring the harness.
        // ⚠ THE RADIUS IS NOT A DETAIL, AND THE FIRST DRAFT OF THIS TEST GOT IT WRONG.
        //   At r = 0.35 the raked wall read `+0` at its near end — not "slightly low", ZERO,
        //   because the TOP ring had leaned 0.529 m clear of the probe and only the base
        //   ring was inside it. The reading was a fact about the probe. A radius must
        //   exceed the lean it is measuring across, or it measures its own aperture.
        for (const rake of [undefined, RAKE]) {
            const vs = lone(mk([0, 0], [5, 0], { rake }));
            expect(topNear(vs, 0, 0, 0.9), `rake=${rake}: near end`).toBeCloseTo(H, 3);
            expect(topNear(vs, 5, 0, 0.9), `rake=${rake}: far end`).toBeCloseTo(H, 3);
        }
    });

    it('the RING IS CUT on a raked wall — far end 1 m, near end still 3 m', () => {
        const vs = lone(mk([0, 0], [5, 0], { rake: RAKE, profile: STRAIGHT_RING }));
        expect(vs.length, 'the raked profiled wall built at all').toBeGreaterThan(0);
        // The lean displaces in +z (leftPerp of +x), so the far end's top has travelled;
        // a generous radius finds it without finding the near end.
        expect(topNear(vs, 5, 0, 0.9), 'the far end is cut to 1 m').toBeCloseTo(1, 3);
        expect(topNear(vs, 0, 0, 0.9), 'the near end is untouched at 3 m').toBeCloseTo(H, 3);
    });

    it('AND IT LEANS — the same profiled wall reads 0 upright and h·cot θ raked', () => {
        // ⭐ The two halves must BOTH be true of ONE wall. A builder that applied the ring
        //   and dropped the shear passes the cut test; one that applied the shear and
        //   dropped the ring passes the lean test. Neither passes both.
        const flat = lone(mk([0, 0], [5, 0], { profile: STRAIGHT_RING }));
        const leaning = lone(mk([0, 0], [5, 0], { rake: RAKE, profile: STRAIGHT_RING }));
        const zSpan = (vs: readonly THREE.Vector3[], atTop: boolean): number => {
            let acc = -Infinity;
            for (const v of vs) {
                if (atTop ? v.y < H - 1e-3 : v.y > 1e-3) continue;
                acc = Math.max(acc, v.z);
            }
            return acc;
        };
        // The near end still reaches y = H in both, so the top ring there is comparable.
        expect(Math.abs(zSpan(flat, true) - zSpan(flat, false)), 'upright: no travel')
            .toBeLessThan(COINCIDENT_M);
        expect(zSpan(leaning, true) - zSpan(leaning, false), 'raked: travels h·cot θ')
            .toBeCloseTo(EXPECTED_LEAN, 3);
    });
});

// ════════════════════════════════════════════════════════════════════════════════════
//  ROW 2 — `curved`. GENUINELY UNBUILT, and now built.
// ════════════════════════════════════════════════════════════════════════════════════

const CURVE = { control: { x: 2.5, y: 0, z: 1.5 }, segments: 24 };
const ARC_L = wallCentrelineLength({
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }], curve: CURVE,
} as never);

/** The SAME cut, expressed against the ARC's length rather than the chord's. A RAMP. */
const CURVED_RING = { ring: [{ u: 0, v: 0 }, { u: ARC_L, v: 0 }, { u: ARC_L, v: 1 }, { u: 0, v: H }] };

/**
 * The same cut as two PLATEAUS rather than a ramp — 3 m over the near half, 1 m over the
 * far half. Used wherever an EXACT height is asserted at an end, because a plateau has no
 * gradient for the probe radius to slide down. See the note in the first cut test.
 */
const STEPPED_ARC_RING = { ring: [
    { u: 0, v: 0 }, { u: ARC_L, v: 0 }, { u: ARC_L, v: 1 },
    { u: ARC_L / 2, v: 1 }, { u: ARC_L / 2, v: H }, { u: 0, v: H },
] };

/**
 * A point on the wall's own quadratic Bézier at parameter `t`, with its ARC LENGTH.
 *
 * ⚠ RE-DERIVED HERE ON PURPOSE. Asking `WallArcParam` for the same point would make the
 *   continuity test agree with the module the builder already uses — it would pass for any
 *   consistent pair of wrong answers. The Bézier is three lines; an independent reference
 *   is worth three lines.
 */
function arcSample(t: number): { x: number; z: number; s: number } {
    const P0 = { x: 0, z: 0 }, C = { x: CURVE.control.x, z: CURVE.control.z }, P1 = { x: 5, z: 0 };
    const at = (u: number) => ({
        x: (1 - u) * (1 - u) * P0.x + 2 * (1 - u) * u * C.x + u * u * P1.x,
        z: (1 - u) * (1 - u) * P0.z + 2 * (1 - u) * u * C.z + u * u * P1.z,
    });
    // ⭐ ARC LENGTH ALONG THE *POLYLINE*, NOT ALONG THE TRUE BÉZIER — and the difference is
    //   not pedantry, it is what this test failed on first. A dense (N = 4000) chord sum
    //   gives the true curve length, which EXCEEDS the 24-segment polyline's by ~0.1%; the
    //   far-end sample then landed at `u` just past the ring's last vertex and
    //   `wallProfileExtentAt` correctly returned null. The test crashed on "Cannot read
    //   properties of null".
    //
    //   The wall IS the polyline. `WallArcParam`'s own header says so — *"the arc length
    //   reported here is the length of the polyline the wall solid is actually made of"* —
    //   and `stationArcLengths` measures the same chords. Measuring the ideal Bézier would
    //   have been measuring a curve the building does not contain. This is still an
    //   INDEPENDENT reference: it re-implements the same DEFINITION from the Bézier
    //   control points, rather than calling the module the builder calls.
    const SEG = CURVE.segments;
    let s = 0, prev = at(0);
    for (let k = 1; k <= SEG; k++) {
        const u = k / SEG;
        const q = at(u);
        if (u > t + 1e-12) break;
        s += Math.hypot(q.x - prev.x, q.z - prev.z);
        prev = q;
    }
    const p = at(t);
    return { x: p.x, z: p.z, s };
}

describe('WJ1 — profile × CURVED: the refusal was UNBUILT, and this is the build', () => {
    it('THE ARC IS LONGER THAN THE CHORD — the premise the gate had wrong', () => {
        // ⭐ Not decoration. `wallProfilePlanarLength` is `Math.hypot` on the endpoints, so
        //   before this work the gate would have bounded `u` by 5.000 on a wall whose run is
        //   longer — refusing a full-length ring as out-of-bounds with a correct-sounding
        //   message and a wrong number in it. If this ever reads 5.000 the fixture has gone
        //   straight and every curved assertion below is vacuous.
        expect(ARC_L).toBeGreaterThan(5.2);
    });

    it('THE GATE ADMITS IT NOW — and the retired code is not what comes back', () => {
        const v = profileAuthorability({
            wallProfile: CURVED_RING, baseLine: [{ x: 0, z: 0 }, { x: 5, z: 0 }],
            height: H, curve: CURVE,
        } as never);
        expect(v.ok, v.reason ?? 'refused').toBe(true);
        expect(v.code).toBeUndefined();
    });

    it('CONTROL — an UNPROFILED curved wall is full height at both ends', () => {
        const vs = lone(mk([0, 0], [5, 0], { curve: CURVE }));
        expect(vs.length, 'the curved wall built').toBeGreaterThan(0);
        expect(topNear(vs, 0, 0), 'near end').toBeCloseTo(H, 3);
        expect(topNear(vs, 5, 0), 'far end').toBeCloseTo(H, 3);
    });

    it('THE RING IS CUT ON THE ARC — far end 1 m, near end 3 m, and it is STILL AN ARC', () => {
        // ⚠ THE PLATEAU RING, NOT THE RAMP, AND FOR AN INSTRUMENT REASON. Against the ramp
        //   this read 1.0909 — correct geometry, wrong probe: a plan radius of 0.35 m around
        //   the end reaches 0.35 m BACK ALONG THE ARC, where a ring falling 0.378 m per metre
        //   genuinely stands 0.13 m higher. A ring that is FLAT over each half has no such
        //   gradient, so an exact assertion is an exact assertion rather than a tolerance
        //   negotiation with the tessellation.
        const vs = lone(mk([0, 0], [5, 0], { curve: CURVE, profile: STEPPED_ARC_RING }));
        expect(vs.length, 'the curved profiled wall built').toBeGreaterThan(0);
        expect(topNear(vs, 5, 0), 'the far end of the ARC is cut to 1 m').toBeCloseTo(1, 3);
        expect(topNear(vs, 0, 0), 'the near end is untouched at 3 m').toBeCloseTo(H, 3);
        // ⭐ NON-VACUITY, and the specific way this could have gone wrong: routing a curved
        //   profiled wall through the STRAIGHT profile arm would cut it correctly and draw a
        //   straight wall. A plausible picture, and the wrong building.
        expect(bulgeFromChord(vs, [0, 0], [5, 0]), 'the wall is still curved')
            .toBeGreaterThan(0.5);
    });

    it('THE CUT IS CONTINUOUS ALONG THE ARC — the top FOLLOWS the ring at EVERY station', () => {
        // ⭐ THE STRONGEST STATEMENT IN THIS FILE, and the one that separates "it drew a
        //   profile" from "it drew the RIGHT profile everywhere". The ring ramps linearly
        //   from v = 3 at u = 0 to v = 1 at u = ARC_L. At SIX points along the arc the built
        //   top must equal the ring's own value at that point's ARC LENGTH — and both the
        //   plan position and the arc length are re-derived HERE from the Bézier, not read
        //   from the builder, so this cannot pass by agreeing with itself.
        //
        //   A builder that applied the ring only at the two CAPS — the cheap wrong
        //   implementation, and the one the old refusal's "no per-station top" describes —
        //   passes at the ends and fails at all four interior samples.
        const vs = lone(mk([0, 0], [5, 0], { curve: CURVE, profile: CURVED_RING }));
        // Sampled at STATION parameters (multiples of 1/segments) so each probe point is
        // a polyline vertex rather than a point the built solid only passes near.
        for (const t of [0, 4 / 24, 8 / 24, 12 / 24, 16 / 24, 20 / 24, 1]) {
            const { x, z, s } = arcSample(t);
            const want = wallProfileExtentAt(CURVED_RING.ring, s)!.top;
            // r = 0.2 reaches at most 0.2 m along a ring falling 0.378 m/m → ±0.076.
            expect(topNear(vs, x, z, 0.2), `t=${t} (arc ${s.toFixed(3)}m)`)
                .toBeGreaterThan(want - 0.1);
            expect(topNear(vs, x, z, 0.2), `t=${t} (arc ${s.toFixed(3)}m)`)
                .toBeLessThan(want + 0.1);
        }
        // NON-VACUITY: the six samples must actually SPAN the ramp, or "within 0.1" is
        // a statement about six copies of the same number.
        const ends = [arcSample(0), arcSample(1)].map(q => topNear(vs, q.x, q.z, 0.2));
        expect(ends[0]! - ends[1]!, 'the samples span the whole cut').toBeGreaterThan(1.5);
    });

    it('A RECTANGLE RING ON A CURVE CHANGES NOTHING — the ring is honoured, not merely present', () => {
        // The zero-signal control: a ring that describes the wall the wall already is must
        // produce the wall the wall already is. If this differs, the profile path is
        // introducing an error of its own that the cut tests would read as success.
        const rect = { ring: [{ u: 0, v: 0 }, { u: ARC_L, v: 0 }, { u: ARC_L, v: H }, { u: 0, v: H }] };
        const withRing = lone(mk([0, 0], [5, 0], { curve: CURVE, profile: rect }));
        const without = lone(mk([0, 0], [5, 0], { curve: CURVE }));
        for (const [x, z] of [[0, 0], [5, 0], [2.5, 1.0]] as const) {
            expect(topNear(withRing, x, z, 0.6), `top at (${x},${z})`)
                .toBeCloseTo(topNear(without, x, z, 0.6), 6);
        }
    });

    it('§FEAT-WALL-PROFILE-CURVED — a ring CORNER survives the sweep, not as a bevel', () => {
        // A corner at u = ARC_L/2 falls between the default stations. Without the station
        // insertion it renders as a bevel and the height AT the corner is wrong by the
        // amount the ramp travels over half a station.
        const half = ARC_L / 2;
        const stepped = { ring: [
            { u: 0, v: 0 }, { u: ARC_L, v: 0 }, { u: ARC_L, v: 1 },
            { u: half, v: 1 }, { u: half, v: H }, { u: 0, v: H },
        ] };
        expect(profileAuthorability({
            wallProfile: stepped, baseLine: [{ x: 0, z: 0 }, { x: 5, z: 0 }], height: H, curve: CURVE,
        } as never).ok, 'a stepped ring is admitted').toBe(true);
        const vs = lone(mk([0, 0], [5, 0], { curve: CURVE, profile: stepped }));
        // The near half is FLAT at H and the far half FLAT at 1 — so a probe just inside
        // each half must read its own plateau exactly, which a bevel cannot do.
        expect(topNear(vs, 0, 0, 0.4), 'near plateau').toBeCloseTo(H, 3);
        expect(topNear(vs, 5, 0, 0.4), 'far plateau').toBeCloseTo(1, 3);
    });

    it('THE SWEEP\'S REAL LIMIT IS REFUSED, NOT APPROXIMATED — curved-multi-interval', () => {
        // ⭐ Lifting `curved` must not be read as "curves take any ring now". A ring with a
        //   VOID in its middle has two vertical spans at some u; a swept solid carries one,
        //   so it would render SOLID where the author drew a hole. Refused by name.
        const holed = { ring: [
            { u: 0, v: 0 }, { u: ARC_L, v: 0 }, { u: ARC_L, v: H }, { u: 3, v: H },
            { u: 3, v: 2 }, { u: 2, v: 2 }, { u: 2, v: 1 }, { u: 3, v: 1 },
            { u: 3, v: 0.5 }, { u: 0, v: 0.5 },
        ] };
        const v = profileAuthorability({
            wallProfile: holed, baseLine: [{ x: 0, z: 0 }, { x: 5, z: 0 }], height: H, curve: CURVE,
        } as never);
        expect(v.ok).toBe(false);
        expect(v.code).toBe('curved-multi-interval');
        expect(v.reason).toMatch(/swept solid/);
        // …and the SAME ring on a STRAIGHT wall is fine, because an extruded Shape has no
        // such limit. That is what makes this a statement about the sweep and not the ring.
        expect(profileAuthorability({
            wallProfile: holed, baseLine: [{ x: 0, z: 0 }, { x: 6, z: 0 }], height: H,
        } as never).ok, 'the same ring is fine on a straight wall').toBe(true);
    });
});

// ════════════════════════════════════════════════════════════════════════════════════
//  ROW 3 — `curved` + `raked` together. The conjunction the founder named.
// ════════════════════════════════════════════════════════════════════════════════════

describe('WJ1 — profile × CURVED × RAKED: a profiled cone', () => {
    it('the CONE is cut, and it is still a cone', () => {
        const vs = lone(mk([0, 0], [5, 0], { curve: CURVE, rake: RAKE, profile: STEPPED_ARC_RING }));
        expect(vs.length, 'it built').toBeGreaterThan(0);
        expect(topNear(vs, 5, 0, 0.9), 'the far end is cut to 1 m').toBeCloseTo(1, 3);
        expect(topNear(vs, 0, 0, 0.9), 'the near end is 3 m').toBeCloseTo(H, 3);
        expect(bulgeFromChord(vs, [0, 0], [5, 0]), 'still an arc').toBeGreaterThan(0.5);
    });

    /**
     * ⭐ THE LEAN FOLLOWS THE PROFILE — asserted at the BUILDER, not through the scene.
     *
     * THE DEFECT THIS CATCHES is what a per-station height introduces if the rake is left
     * as a whole-wall constant: the top edge would travel the full `h·cot θ` even where the
     * profile cut the wall down, so a 1 m column would overhang as far as a 3 m one — a
     * TWISTED top edge, geometrically impossible for a constant batter. `dTopAt(i)` is the
     * fix; this is its instrument.
     *
     * ⚠ THE FIRST DRAFT MEASURED THIS THROUGH THE SCENE AND WAS NOT WORTH TRUSTING. It
     *   compared "the highest vertex within 1.2 m of the far end" between a raked and an
     *   upright build — but with a ramped ring the two builds pick DIFFERENT vertices at
     *   different heights, so the difference was a fact about which vertex won the argmax
     *   (it read 0.053 against an expected 0.176). Calling the builder directly with a
     *   KNOWN per-station height removes the ambiguity entirely: there is one outer top
     *   corner per station and its identity is not in question.
     */
    it('the rake displacement at a station is k × THAT STATION\'s height, not the wall\'s', () => {
        const stations = computeStations(
            new THREE.Vector3(0, 0, 0), new THREE.Vector3(5, 0, 0),
            new THREE.Vector3(2.5, 0, 1.5), 8,
        );
        const n = stations.length;
        // A deliberately LUMPY top: 3 m at the near end falling to 1 m at the far end, so
        // no two stations share a height and a constant would be visible immediately.
        const topY = stations.map((_, i) => 3 - 2 * (i / (n - 1)));

        const upright = buildCurvedLayerGeometry(
            { name: 'b', function: 'structure', thickness: T } as never,
            0, stations, H, 0, T / 2, null, null, null, null, null, { topY },
        );
        const raked = buildCurvedLayerGeometry(
            { name: 'b', function: 'structure', thickness: T } as never,
            0, stations, H, 0, T / 2, null, null, null, null,
            { angleDeg: RAKE, datumY: 0 } as never, { topY },
        );

        // For each station, the OUTER TOP corner is the vertex at `topY[i]` furthest along
        // that station's own outward normal. Its travel between the two builds is the lean.
        const outerTopAt = (g: THREE.BufferGeometry, i: number): number => {
            const st = stations[i]!;
            const pos = g.getAttribute('position');
            let best = -Infinity;
            for (let k = 0; k < pos.count; k++) {
                if (Math.abs(pos.getY(k) - topY[i]!) > 1e-4) continue;
                // Keep only vertices at THIS station: project onto the station tangent.
                const dx = pos.getX(k) - st.cx, dz = pos.getZ(k) - st.cz;
                const along = dx * -st.nz + dz * st.nx;
                if (Math.abs(along) > 1e-4) continue;
                best = Math.max(best, dx * st.nx + dz * st.nz);
            }
            return best;
        };

        let checked = 0;
        for (let i = 0; i < n; i++) {
            const a = outerTopAt(upright, i);
            const b = outerTopAt(raked, i);
            if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
            checked++;
            expect(b - a, `station ${i} (h=${topY[i]!.toFixed(3)}) leans by k·h`)
                .toBeCloseTo(K * topY[i]!, 6);
        }
        // ⭐ NON-VACUITY. A loop that checked nothing passes every assertion inside it, and
        //   that is the single easiest way for a test like this to be green and empty.
        expect(checked, 'stations actually measured').toBeGreaterThanOrEqual(n - 1);
        // And the discriminator, stated as a number: a whole-wall constant would have made
        // every one of those displacements EQUAL. They span k·1 to k·3.
        expect(K * topY[0]! - K * topY[n - 1]!, 'the leans differ across the run')
            .toBeCloseTo(K * 2, 6);
    });
});

/**
 * §WJ1-PROFILE-VARIANT-BLANKS — declared, not discovered.
 *
 *  1. **`layered` and `hosted-openings` are NOT measured here** and their rows stay
 *     `unbuilt`. Both are UNBUILT rather than impossible — their own texts name missing
 *     machinery — and the machinery each needs is recorded in C85.
 *  2. **The curved profiled wall's MITRE is the base mitre.** `projectCapVertex` runs on
 *     all four corner tables and is y-independent, so a per-station top does not disturb
 *     it — but a joined *profiled curved* wall is not measured in this file.
 *  3. **A ring that does not cover some `u` keeps the flat planes** rather than vanishing
 *     there. A single-interval sweep cannot express a gap along the run; drawing nothing
 *     would be an invisible refusal, which is worse.
 *  4. **No persistence round-trip.** Whether a profiled curved wall survives save/reload
 *     is C85 §5's subject.
 */
