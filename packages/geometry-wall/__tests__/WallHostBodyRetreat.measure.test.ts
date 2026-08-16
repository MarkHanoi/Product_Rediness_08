/**
 * §FIX-WALL-CREATE-ON-HOST-FACE (L-929) — the creation-time retreat, and what it costs.
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * The ACCEPTANCE proof for this fix is a STORED-STATE assertion driven through production
 * wiring and lives in `apps/editor/__tests__/wallCreateOnHostBodyStoredBaseline.test.ts`.
 * That is deliberate: L-919's proof was a pure-function return value, which is exactly why a
 * fix that was discarded one hop later read as green.
 *
 * THIS file is the unit + collateral layer for the pure function itself:
 *   1. the DRIFT GUARD for the two constants `WallHostBodyRetreat` copies rather than
 *      imports (it must not drag THREE into `WallStore`'s import graph),
 *   2. the guard-by-guard behaviour of `retreatOntoHostFaces`,
 *   3. BOTH RENDER PIPELINES on the retreated baseline — legacy `resolveLevel` footprints
 *      and V2 `resolveJunctions` + `buildAllFootprints`,
 *   4. the CAP the retreat costs, measured rather than assumed.
 *
 * ─── (4) IS THE HONEST PART, SO READ IT ─────────────────────────────────────────────────
 *
 * Retreating the endpoint onto the face moves it AWAY from the host CENTRELINE by exactly
 * `hostHalfT`. Legacy body-T detection measures endpoint→host-CENTRELINE against
 * `SNAP_RADIUS` (`WallJoinResolver.ts:2302-2303`), so a correctly-authored endpoint can fall
 * OUTSIDE detection at a tight zoom and lose its mitred cap. `§CAP-AFTER-RETREAT` below
 * measures the consequence at both a perpendicular and an oblique approach instead of
 * asserting it away.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { WallJoinResolver, DEFAULT_MIN_WALL_LENGTH } from '../src/WallJoinResolver';
import { resolveJunctions, type WallInput } from '../src/JunctionResolverV2';
import { buildAllFootprints } from '../src/WallFootprint2D';
import { retreatOntoHostFaces, type HostBodyCandidate } from '../src/WallHostBodyRetreat';
import type { WallData } from '../src/WallTypes';

type Pt = { x: number; z: number };

const LEVEL = 'L';
let _seq = 0;
function mk(id: string, s: [number, number], e: [number, number], thickness: number): HostBodyCandidate & WallData {
    return {
        id, type: 'wall', levelId: LEVEL, properties: {}, childrenIds: [],
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: 3, thickness, baseOffset: 0, openings: [],
        metadata: { createdAt: ++_seq },
    } as unknown as HostBodyCandidate & WallData;
}

/** Apply the retreat and hand back a wall record carrying the AUTHORED (retreated) line. */
function authored(existing: (HostBodyCandidate & WallData)[], w: HostBodyCandidate & WallData) {
    const r = retreatOntoHostFaces(existing, w);
    return { wall: { ...w, baseLine: r.baseLine } as unknown as WallData, retreats: r.retreats };
}

const HOST_T = 0.20;
const PART_T = 0.10;
const HALF_T = HOST_T / 2;

/** The founder's fixture: a 200 mm host along z=0, x ∈ [0, 8]. Near face at z = +0.10. */
const host = () => mk('host', [0, 0], [8, 0], HOST_T);

describe('§FIX-WALL-CREATE-ON-HOST-FACE — the pure retreat', () => {
    // ── 1. THE DRIFT GUARD ───────────────────────────────────────────────────────────────
    //
    // `WallHostBodyRetreat` COPIES two constants instead of importing them, because importing
    // `WallJoinResolver` would pull THREE + SpatialGrid into `WallStore`'s module graph — the
    // barrel-cycle / module-load-order hazard this repo has been bitten by. A copied constant
    // is a drift hazard, so the copy is guarded here STRUCTURALLY rather than by a comment.
    it('DRIFT GUARD — the copied minimum wall length still equals the resolver\'s', () => {
        expect(DEFAULT_MIN_WALL_LENGTH).toBeCloseTo(0.05, 12);
    });

    it('DRIFT GUARD — the copied clash epsilon still equals the resolver\'s CLASH_EPS_M', () => {
        // Private static; read structurally so a change to either side reddens this.
        const eps = (WallJoinResolver as unknown as { CLASH_EPS_M: number }).CLASH_EPS_M;
        expect(eps).toBeCloseTo(0.0015, 12);
    });

    // ── 2. THE BEHAVIOUR ─────────────────────────────────────────────────────────────────
    it('PERPENDICULAR — an endpoint on the host CENTRELINE retreats to the near FACE', () => {
        const part = mk('part', [4, 3], [4, 0], PART_T);
        const { wall, retreats } = authored([host()], part);

        expect(retreats).toHaveLength(1);
        expect(retreats[0]!.end).toBe('end');
        expect(retreats[0]!.hostId).toBe('host');
        expect(retreats[0]!.penetration).toBeCloseTo(HALF_T, 9);
        expect(retreats[0]!.alongTrim).toBeCloseTo(HALF_T, 9);   // sin 90° = 1
        expect(wall.baseLine[1].z).toBeCloseTo(+HALF_T, 9);
        expect(wall.baseLine[1].x).toBeCloseTo(4, 9);
        // The FREE end never moves.
        expect(wall.baseLine[0].z).toBeCloseTo(3, 9);
    });

    it('OBLIQUE 45° — the retreat costs penetration / sin θ ALONG THE WALL\'S OWN AXIS', () => {
        const part = mk('obl', [1, 3], [4, 0], PART_T);
        const { wall, retreats } = authored([host()], part);

        expect(retreats).toHaveLength(1);
        expect(retreats[0]!.penetration).toBeCloseTo(HALF_T, 9);
        expect(retreats[0]!.alongTrim).toBeCloseTo(HALF_T / Math.sin(Math.PI / 4), 9); // 0.1414
        expect(wall.baseLine[1].z).toBeCloseTo(+HALF_T, 9);
        // NO LATERAL MOVEMENT — still on the drawn line x + z = 4.
        expect(wall.baseLine[1].x + wall.baseLine[1].z).toBeCloseTo(4, 9);
    });

    it('APPROACH SIDE — a wall coming from BELOW retreats to the FAR face, not the near one', () => {
        const part = mk('part', [4, -3], [4, 0], PART_T);
        const { wall } = authored([host()], part);
        expect(wall.baseLine[1].z).toBeCloseTo(-HALF_T, 9);
    });

    it('IDEMPOTENT — re-running on an already-retreated line is a no-op', () => {
        const part = mk('part', [4, 3], [4, 0], PART_T);
        const first = authored([host()], part);
        const second = retreatOntoHostFaces([host()], first.wall as unknown as HostBodyCandidate);
        expect(second.retreats).toHaveLength(0);
        expect(second.baseLine[1].z).toBeCloseTo(+HALF_T, 9);
    });

    it('BOTH ENDS — a partition spanning between two hosts retreats at both', () => {
        const hostB = mk('hostB', [0, 6], [8, 6], HOST_T);
        const part = mk('part', [4, 0], [4, 6], PART_T);
        const { wall, retreats } = authored([host(), hostB], part);
        expect(retreats).toHaveLength(2);
        expect(wall.baseLine[0].z).toBeCloseTo(+HALF_T, 9);
        expect(wall.baseLine[1].z).toBeCloseTo(6 - HALF_T, 9);
    });

    // ── 3. THE GUARDS — every refusal is the RESOLVER's own, so the two cannot disagree ──
    it('GUARD corner — an endpoint on a committed wall ENDPOINT is untouched (that is a mitre)', () => {
        // `deriveJoinIntent` owns this case and the corner resolver mitres it. Moving it here
        // would break committed mitres — the L-44/L-46/L-47 family.
        const a = mk('a', [0, 0], [4, 0], HOST_T);
        const b = mk('b', [4, 0], [4, 4], HOST_T);
        const { retreats } = authored([a], b);
        expect(retreats).toHaveLength(0);
    });

    it('GUARD outside-band — an endpoint SHORT of the face is left to the resolver (REACH)', () => {
        // |d| >= halfT is open space, not a clash. How far a wall may REACH is properly a
        // question about how close the user aimed, so it stays with the camera-aware
        // §T-JOIN-PERP-GATE and is deliberately NOT authored here.
        const part = mk('part', [4, 3], [4, 0.15], PART_T);   // 50 mm short of the face
        const { retreats } = authored([host()], part);
        expect(retreats).toHaveLength(0);
    });

    it('GUARD past-the-end-cap — an endpoint beyond the host\'s extent is not a body landing', () => {
        const part = mk('part', [9, 3], [9, 0], PART_T);      // host runs x ∈ [0, 8]
        const { retreats } = authored([host()], part);
        expect(retreats).toHaveLength(0);
    });

    it('GUARD through-crossing — deeper than one host thickness is refused, as _applyT does', () => {
        // The wall emerged out the FAR side and terminates past it. An axial trim to the near
        // face does not express that, so it is LEFT ALONE (declared, not mis-handled).
        const part = mk('part', [4, 3], [4, -0.5], PART_T);
        const { retreats } = authored([host()], part);
        expect(retreats).toHaveLength(0);
    });

    it('GUARD grazing — an approach shallower than 30° off the host axis is refused', () => {
        // dz = 0.10 over dx = 3.0 ⇒ ~1.9° off the host axis. alongTrim would be ~3 m to clear
        // 0.10 m — an authoring collision, not a junction.
        const part = mk('part', [1, 0.1], [4, 0], PART_T);
        const { retreats } = authored([host()], part);
        expect(retreats).toHaveLength(0);
    });

    it('GUARD stub — a retreat that would shrink the wall below the minimum is refused', () => {
        // The wall would drop under DEFAULT_MIN_WALL_LENGTH, §RESOLVED-STUB-SWEEP would flag
        // it invalid, and the builder would SKIP it — i.e. the wall would VANISH.
        const part = mk('part', [4, 0.12], [4, 0], PART_T);
        const { retreats } = authored([host()], part);
        expect(retreats).toHaveLength(0);
    });

    it('GUARD no siblings — the very first wall on a level is untouched', () => {
        const { retreats } = authored([], mk('solo', [0, 0], [4, 0], HOST_T));
        expect(retreats).toHaveLength(0);
    });

    it('GUARD other level — a wall on a DIFFERENT level is never a host', () => {
        const otherLevel = { ...host(), levelId: 'L2' } as HostBodyCandidate & WallData;
        const part = mk('part', [4, 3], [4, 0], PART_T);
        const { retreats } = authored([otherLevel], part);
        expect(retreats).toHaveLength(0);
    });
});

// ─── 4. BOTH PIPELINES, AND THE CAP ─────────────────────────────────────────────────────

/** The rendered plan footprint of a legacy-resolved wall (baseLine + miter-plane caps). */
function legacyFootprint(jd: {
    baseLine: [THREE.Vector3, THREE.Vector3];
    startMN: { nx: number; nz: number } | null;
    endMN: { nx: number; nz: number } | null;
}, thickness: number): Pt[] {
    const [s, e] = jd.baseLine;
    const d = new THREE.Vector3(e.x - s.x, 0, e.z - s.z).normalize();
    const n = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(thickness / 2);
    const raw: Array<{ px: number; pz: number; o: THREE.Vector3; mn: { nx: number; nz: number } | null }> = [
        { px: s.x + n.x, pz: s.z + n.z, o: s, mn: jd.startMN },
        { px: e.x + n.x, pz: e.z + n.z, o: e, mn: jd.endMN },
        { px: e.x - n.x, pz: e.z - n.z, o: e, mn: jd.endMN },
        { px: s.x - n.x, pz: s.z - n.z, o: s, mn: jd.startMN },
    ];
    return raw.map(({ px, pz, o, mn }) => {
        if (!mn) return { x: px, z: pz };
        const dotD = mn.nx * d.x + mn.nz * d.z;
        if (Math.abs(dotD) < 1e-9) return { x: px, z: pz };
        const t = (mn.nx * (o.x - px) + mn.nz * (o.z - pz)) / dotD;
        return { x: px + t * d.x, z: pz + t * d.z };
    });
}

function inPoly(px: number, pz: number, poly: readonly Pt[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i]!, b = poly[j]!;
        if ((a.z > pz) !== (b.z > pz) && px < ((b.x - a.x) * (pz - a.z)) / (b.z - a.z) + a.x) inside = !inside;
    }
    return inside;
}

const STEP = 0.002;
function overlapArea(p: readonly Pt[], q: readonly Pt[]): number {
    if (p.length < 3 || q.length < 3) return 0;
    const xs = [...p, ...q].map(v => v.x), zs = [...p, ...q].map(v => v.z);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    let hits = 0;
    for (let x = x0 + STEP / 2; x < x1; x += STEP) {
        for (let z = z0 + STEP / 2; z < z1; z += STEP) {
            if (inPoly(x, z, p) && inPoly(x, z, q)) hits++;
        }
    }
    return hits * STEP * STEP;
}

const mm2 = (a: number) => a * 1e6;
/** Same floor the sibling measure file uses, and for the same two reasons. */
const CLEAN_MM2 = 800;

function legacyWorstAt(walls: WallData[], snapRadius: number): number {
    const res = WallJoinResolver.resolveLevel(walls, { snapRadius }) as unknown as Map<string, {
        baseLine: [THREE.Vector3, THREE.Vector3];
        startMN: { nx: number; nz: number } | null;
        endMN: { nx: number; nz: number } | null;
    }>;
    const fps = walls.map(w => ({
        id: w.id,
        fp: legacyFootprint(
            res.get(w.id) ?? {
                baseLine: [
                    new THREE.Vector3(w.baseLine[0].x, 0, w.baseLine[0].z),
                    new THREE.Vector3(w.baseLine[1].x, 0, w.baseLine[1].z),
                ] as [THREE.Vector3, THREE.Vector3],
                startMN: null, endMN: null,
            },
            w.thickness,
        ),
    }));
    let worst = 0;
    for (let i = 0; i < fps.length; i++) {
        for (let j = i + 1; j < fps.length; j++) {
            worst = Math.max(worst, mm2(overlapArea(fps[i]!.fp, fps[j]!.fp)));
        }
    }
    return worst;
}

function toV2(w: WallData): WallInput {
    return {
        id: w.id,
        start: { x: w.baseLine[0].x, z: w.baseLine[0].z },
        end: { x: w.baseLine[1].x, z: w.baseLine[1].z },
        thickness: w.thickness,
    } as unknown as WallInput;
}

function v2Worst(walls: WallData[]): number {
    const inputs = walls.map(toV2);
    const fps = buildAllFootprints(inputs, resolveJunctions(inputs));
    let worst = 0;
    for (let i = 0; i < fps.length; i++) {
        for (let j = i + 1; j < fps.length; j++) {
            worst = Math.max(worst, mm2(overlapArea(fps[i]!.polygon, fps[j]!.polygon)));
        }
    }
    return worst;
}

const ZOOMED_IN = 0.05;     // MIN_WORLD_TOLERANCE_M — the tightest production radius
const DEFAULT_R = 0.50;     // the legacy fallback

describe('§FIX-WALL-CREATE-ON-HOST-FACE — BOTH PIPELINES on the authored line', () => {
    const perpendicular = () => {
        const h = host();
        const { wall } = authored([h], mk('part', [4, 3], [4, 0], PART_T));
        return [h as unknown as WallData, wall];
    };
    const oblique = () => {
        const h = host();
        const { wall } = authored([h], mk('obl', [1, 3], [4, 0], PART_T));
        return [h as unknown as WallData, wall];
    };

    it('LEGACY perpendicular — clean at the TIGHT radius (zoom is not a variable)', () => {
        expect(legacyWorstAt(perpendicular(), ZOOMED_IN)).toBeLessThan(CLEAN_MM2);
    });

    it('LEGACY perpendicular — clean at the DEFAULT radius too', () => {
        expect(legacyWorstAt(perpendicular(), DEFAULT_R)).toBeLessThan(CLEAN_MM2);
    });

    it('V2 (default-ON) perpendicular — clean on the same authored line', () => {
        expect(v2Worst(perpendicular())).toBeLessThan(CLEAN_MM2);
    });

    it('LEGACY oblique — clean at the DEFAULT radius (the T-join is detected and mitred)', () => {
        expect(legacyWorstAt(oblique(), DEFAULT_R)).toBeLessThan(CLEAN_MM2);
    });

    it('LEGACY oblique at the TIGHT radius — DECLARED RESIDUE, a square-cap wedge', () => {
        // ~1 300 mm²: half of a 100 mm wall's square cap at 45° buried in the host. That is
        // BURIAL, not a gap — invisible in the render — but it is the same artefact the cap
        // measurement below names, and it is pinned rather than hidden under the CLEAN floor.
        // See §CAP-AFTER-RETREAT for the mechanism and the bound.
        const worst = legacyWorstAt(oblique(), ZOOMED_IN);
        expect(worst).toBeGreaterThan(CLEAN_MM2);
        expect(worst).toBeLessThan(2000);
    });

    it('V2 (default-ON) oblique — clean on the same authored line', () => {
        expect(v2Worst(oblique())).toBeLessThan(CLEAN_MM2);
    });
});

// ─── §CAP-AFTER-RETREAT — the collateral, measured ──────────────────────────────────────

/**
 * How far the newcomer's JOINING-END cap corners sit outside the host's near-face plane
 * (metres). 0 ⇒ flush against the face. A positive number is a visible wedge GAP.
 *
 * Only the corners belonging to the joining cap are considered — selected by proximity to the
 * joining endpoint rather than by index, because the miter projection moves them along the
 * wall axis. (The free end sits metres away and would otherwise dominate the max, which is
 * exactly the mistake this helper's first draft made.)
 */
function worstCapGap(walls: WallData[], snapRadius: number, newcomerId: string, faceZ: number): number {
    const res = WallJoinResolver.resolveLevel(walls, { snapRadius }) as unknown as Map<string, {
        baseLine: [THREE.Vector3, THREE.Vector3];
        startMN: { nx: number; nz: number } | null;
        endMN: { nx: number; nz: number } | null;
    }>;
    const w = walls.find(x => x.id === newcomerId)!;
    const jd = res.get(newcomerId) ?? {
        baseLine: [
            new THREE.Vector3(w.baseLine[0].x, 0, w.baseLine[0].z),
            new THREE.Vector3(w.baseLine[1].x, 0, w.baseLine[1].z),
        ] as [THREE.Vector3, THREE.Vector3],
        startMN: null, endMN: null,
    };
    const fp = legacyFootprint(jd, w.thickness);
    // The joining end is whichever authored endpoint is nearer the host face plane.
    const jp = Math.abs(w.baseLine[0].z - faceZ) < Math.abs(w.baseLine[1].z - faceZ)
        ? w.baseLine[0] : w.baseLine[1];
    const capRadius = w.thickness * 2;   // generous: catches a mitre-stretched corner too
    const capCorners = fp.filter(p => Math.hypot(p.x - jp.x, p.z - jp.z) <= capRadius);
    if (capCorners.length === 0) return 0;
    return Math.max(0, ...capCorners.map(p => p.z - faceZ));
}

describe('§CAP-AFTER-RETREAT (L-929) — what the retreat costs, measured not assumed', () => {
    it('PERPENDICULAR — the cap is FLUSH with the host face, mitre or not', () => {
        // The cap plane perpendicular to the partition's own axis IS the host face plane here,
        // so detection dropping out costs exactly nothing. This is the founder's case.
        const h = host();
        const { wall } = authored([h], mk('part', [4, 3], [4, 0], PART_T));
        const walls = [h as unknown as WallData, wall];
        expect(worstCapGap(walls, ZOOMED_IN, 'part', HALF_T)).toBeLessThanOrEqual(1e-9);
        expect(worstCapGap(walls, DEFAULT_R, 'part', HALF_T)).toBeLessThanOrEqual(1e-9);
    });

    it('OBLIQUE — DECLARED RESIDUE: a square cap at 45° leaves a wedge at the tight radius', () => {
        // Body-T detection measures endpoint→host-CENTRELINE against SNAP_RADIUS
        // (WallJoinResolver.ts:2302-2303). Authoring the endpoint at the FACE puts it hostHalfT
        // = 0.10 m from that centreline, which at the 0.05 m radius is out of range — so the
        // newcomer gets NO miter normal and takes a square cap.
        //
        // For a 100 mm wall at 45° the corner offset is (PART_T/2)·cos45 = 35.4 mm. Half of
        // that is buried in the host (harmless) and half is a gap.
        //
        // THIS IS NOT ASSERTED AS ACCEPTABLE — it is pinned so it cannot be lost. The fix is a
        // detection predicate measured against the host's BODY rather than its CENTRELINE, and
        // that is a separate change with its own blast radius (it would admit more T-joins
        // everywhere). Declared, bounded, and NOT silently shipped as clean.
        const h = host();
        const { wall } = authored([h], mk('obl', [1, 3], [4, 0], PART_T));
        const gap = worstCapGap([h as unknown as WallData, wall], ZOOMED_IN, 'obl', HALF_T);
        expect(gap).toBeGreaterThan(0.030);
        expect(gap).toBeLessThan(0.040);
    });

    it('OBLIQUE at the DEFAULT radius — detection still reaches, so the cap is mitred FLUSH', () => {
        // At 0.50 m the endpoint→centreline distance of 0.10 m is well inside SNAP_RADIUS, the
        // T-join is detected, and the miter normal lands the cap on the face plane. This is the
        // proof that the residue above is a DETECTION-RANGE artefact and nothing else.
        const h = host();
        const { wall } = authored([h], mk('obl', [1, 3], [4, 0], PART_T));
        expect(worstCapGap([h as unknown as WallData, wall], DEFAULT_R, 'obl', HALF_T))
            .toBeLessThanOrEqual(1e-9);
    });
});
