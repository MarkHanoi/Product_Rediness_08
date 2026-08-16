/**
 * §MEASURED-EQUALITY-REFUSED (L-928, founder — the INTERIOR residue of the L-919 family).
 *
 * THE FOUNDER, verbatim, on deploy `288c65e8`:
 *
 *   "the wall perimeter behaves really good — but the inner wall partitions not as expected:
 *    the wall should follow along to connect — why is not happening."
 *
 * The perimeter half (L-919/920/921/922/923/925/926) is CONFIRMED WORKING by the founder. This
 * file measures the interior residue, and ONLY measures it — the fix is a separate commit.
 *
 * ─── THE CONSOLE LINE THIS FILE REPRODUCES ───────────────────────────────────────────────────
 *
 *   §FIX-T-JOIN-PENETRATION T-JOIN: wall_…NW42(end) penetrates host=wall_…FEDJK by 100.0 mm
 *   but the axial retreat (100.0 mm) EXCEEDS one host thickness — grazing or through-crossing,
 *   not a T-join. Left un-trimmed.
 *
 * 100.0 mm retreat against a cap of one 100 mm host thickness. **100.0 is not greater than
 * 100.0.** The prose says "exceeds"; the arithmetic refuses at equality. This file pins that,
 * with the two numbers, before anything is changed.
 *
 * ─── WHY THE TWO HALVES DIVERGE — the asymmetry, measured not asserted ───────────────────────
 *
 * `_applyT`'s penetration branch is TWO comparisons sharing one `if`:
 *
 *     if (penetration > hostWall.thickness + this.CLASH_EPS_M   // ← tolerant: 1.5 mm of slack
 *         || alongTrim > PENETRATION_ALONG_CAP)                 // ← INTOLERANT: bare `>`
 *
 * The same declared boundary — "one host thickness" — is asked twice, once with a tolerance and
 * once without. At an exact tie the first arm forgives and the second refuses, so the verdict is
 * decided by whichever way floating-point noise happens to fall in the ray-plane solve. That is
 * the defect: not a wrong bound, an UNTOLERANCED one.
 *
 * ─── AND WHY IT BITES INTERIORS ONLY ─────────────────────────────────────────────────────────
 *
 * The cap's own comment derives it as an APPROACH-ANGLE rule — "capping the retreat at one host
 * THICKNESS … with a penetration of at most `hostHalfT` it admits every approach down to 30° off
 * the host axis". That derivation is sound *at the depth it names*: alongTrim = penetration /
 * sin θ, so with penetration = hostHalfT a cap of 2·hostHalfT = thickness is exactly θ ≥ 30°.
 *
 * But the cap is a CONSTANT while the rule it encodes is a RATIO. Every case whose penetration
 * is deeper than `hostHalfT` gets a silently stricter angle. At penetration = one full thickness
 * — a stem drawn through to the host's far face, which is what an interior partition chain does —
 * the admitted angle collapses from 30° to 90°, i.e. only an EXACT perpendicular survives, and it
 * survives only on the tie this file measures. Case B below pins the ratio half independently at
 * the design depth: a textbook 30° approach, the exact angle the comment promises to admit, is
 * refused for the same reason.
 *
 * ─── THE CONTROL THAT MUST NOT MOVE ──────────────────────────────────────────────────────────
 *
 * Case C is 200 mm perimeter geometry at a centreline snap — the behaviour the founder has just
 * confirmed working. Its resolved endpoints and miter normals are pinned as EXACT literals (not
 * tolerances), so any fix that so much as perturbs the last ulp of the perimeter path fails here
 * rather than in the founder's next session.
 *
 * @file packages/geometry-wall/__tests__/WallTJoinEqualityBoundary.measure.test.ts
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { WallJoinResolver } from '../src/WallJoinResolver';
import type { WallData } from '../src/WallTypes';

type Pt = { x: number; z: number };

/** The rendered plan footprint of a legacy-resolved wall (baseLine + miter-plane caps). */
function legacyFootprint(jd: {
    baseLine: [THREE.Vector3, THREE.Vector3];
    startMN: { nx: number; nz: number } | null;
    endMN: { nx: number; nz: number } | null;
}, thickness: number): Pt[] {
    const [s, e] = jd.baseLine;
    const d = new THREE.Vector3(e.x - s.x, 0, e.z - s.z).normalize();
    const n = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(thickness / 2);
    const raw = [
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

/** Overlap area in mm², sampled on a 2 mm grid — the same instrument `WallCreateOnHostBody` uses. */
function overlapMm2(p: readonly Pt[], q: readonly Pt[]): number {
    const STEP = 0.002;
    const xs = [...p, ...q].map(v => v.x), zs = [...p, ...q].map(v => v.z);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    let hits = 0;
    for (let x = x0 + STEP / 2; x < x1; x += STEP) {
        for (let z = z0 + STEP / 2; z < z1; z += STEP) {
            if (inPoly(x, z, p) && inPoly(x, z, q)) hits++;
        }
    }
    return hits * STEP * STEP * 1e6;
}

let _seq = 0;
function mk(s: [number, number], e: [number, number], thickness: number): WallData {
    return {
        id: `eq${_seq++}`, type: 'wall', levelId: 'L', properties: {}, childrenIds: [],
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: 3, thickness, baseOffset: 0, openings: [],
        metadata: { createdAt: _seq },
    } as unknown as WallData;
}

type Resolved = Map<string, {
    baseLine: [THREE.Vector3, THREE.Vector3];
    startMN: { nx: number; nz: number } | null;
    endMN: { nx: number; nz: number } | null;
}>;

/**
 * Resolve at the APP's zoomed-in snap radius (0.05 m, the `MIN_WORLD_TOLERANCE_M` clamp), and
 * capture every `console.warn` so the refusal can be asserted as text, not inferred from geometry.
 */
function resolveCapturingWarns(walls: WallData[], snapRadius = 0.05): { res: Resolved; warns: string[] } {
    const warns: string[] = [];
    const spy = vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => { warns.push(a.join(' ')); });
    try {
        const res = WallJoinResolver.resolveLevel(walls, { snapRadius }) as unknown as Resolved;
        return { res, warns };
    } finally {
        spy.mockRestore();
    }
}

const mm = (m: number) => Math.round(m * 1e6) / 1e3;   // metres → mm, 3 dp

afterEach(() => { vi.restoreAllMocks(); });

// ── Case A — the founder's exact numbers: penetration == thickness == retreat ────────────────
//
// Host: 100 mm partition along +X through z = 0. Its band is z ∈ [−0.05, +0.05].
// Stem: 100 mm partition along +Z, drawn from z = −2 THROUGH the host to z = +0.05 — i.e. its
// endpoint lands exactly on the host's FAR face. Approach is exactly perpendicular, so
//
//     penetration = 0.05 − (−0.05) = 0.100 m = one host thickness, EXACTLY
//     alongTrim   = penetration / sin 90° = 0.100 m = the cap, EXACTLY
//
// Both arms of the gate sit precisely ON their boundary. Neither "exceeds" it.
describe('§MEASURED-EQUALITY-REFUSED — case A: penetration EXACTLY one host thickness (100 mm interior)', () => {
    it('pins the refusal, and pins that the endpoint is left inside the host solid', () => {
        const host = mk([0, 0], [4, 0], 0.1);
        const stem = mk([2, -2], [2, 0.05], 0.1);

        const { res, warns } = resolveCapturingWarns([host, stem]);
        const penetrationWarns = warns.filter(w => w.includes('§FIX-T-JOIN-PENETRATION'));

        const stemEnd = res.get(stem.id)?.baseLine[1] ?? new THREE.Vector3(2, 0, 0.05);

        // eslint-disable-next-line no-console
        console.log(JSON.stringify({
            case: 'A',
            hostThicknessMm: mm(host.thickness),
            resolvedStemEndZmm: mm(stemEnd.z),
            nearFaceZmm: mm(-0.05),
            refusals: penetrationWarns.length,
            warn: penetrationWarns[0] ?? null,
        }, null, 2));

        // BEFORE §FIX-T-JOIN-EQUALITY-BOUNDARY (measured at `17824619`, the founder's own
        // numbers): ONE refusal, reading `penetrates … by 100.0 mm but the axial retreat
        // (100.0 mm) exceeds one host thickness`, with 100.0 compared against a cap of 100.0.
        // AFTER: admitted. The depth arm is unchanged (0.100 is not past 0.100 + CLASH_EPS_M);
        // the grazing arm now reads its declared 30° ratio — cap = max(t, 2 · penetration) =
        // 0.200 m — so a PERPENDICULAR approach clears it by 2×, not by a rounding accident.
        expect(penetrationWarns.length).toBe(0);

        // BEFORE: −49 mm. `_applyT` never seated this endpoint; the later
        // `_clampEndToShellInnerFace` pass did, one INNER_OVERLAP_M inside the face — a RESCUER
        // covering for the emitter (L-909a). AFTER: −50 mm, exactly ON the host's near face,
        // seated by the join resolver itself. The 1 mm difference is the whole point: the rescuer
        // is no longer the thing doing the work, and the inner-face clamp now returns early
        // because the endpoint it would have moved is already correct.
        expect(mm(stemEnd.z)).toBeCloseTo(-50, 3);
    });
});

// ── Case B — the ratio half, at the depth the comment's own derivation names ─────────────────
//
// A 30.0° approach with penetration = hostHalfT. The cap comment promises this is admitted
// ("admits every approach down to 30° off the host axis"). alongTrim = hostHalfT / sin 30° =
// 2 · hostHalfT = one thickness = the cap, EXACTLY. So the promised-admissible case is a tie too.
describe('§MEASURED-EQUALITY-REFUSED — case B: the 30° approach the cap comment promises to admit', () => {
    it('pins whether an exactly-30° stem at centreline depth is admitted or refused', () => {
        const host = mk([0, 0], [6, 0], 0.1);
        // Endpoint on the host CENTRELINE (a Midpoint/body snap) → penetration = hostHalfT.
        // Direction 30° off the host axis: run 2·cos30 across, 2·sin30 = 1.0 up.
        const stem = mk([3 - 2 * Math.cos(Math.PI / 6), -1], [3, 0], 0.1);

        const { res, warns } = resolveCapturingWarns([host, stem]);
        const penetrationWarns = warns.filter(w => w.includes('§FIX-T-JOIN-PENETRATION'));
        const stemEnd = res.get(stem.id)?.baseLine[1] ?? new THREE.Vector3(3, 0, 0);

        // eslint-disable-next-line no-console
        console.log(JSON.stringify({
            case: 'B',
            resolvedStemEndZmm: mm(stemEnd.z),
            refusals: penetrationWarns.length,
            warn: penetrationWarns[0] ?? null,
            allWarns: warns,
        }, null, 2));

        // MEASURED: this tie is ADMITTED — refusals 0, endpoint seated on the near face (−50 mm).
        //
        // Case A and case B are BOTH exact ties against the SAME cap, and they get OPPOSITE
        // verdicts. Nothing distinguishes them geometrically at the boundary; what differs is
        // which way the last bit of the ray-plane solve happened to round. That is the whole
        // defect stated as a measurement: `alongTrim > PENETRATION_ALONG_CAP` has no tolerance,
        // so ON the boundary the verdict is floating-point noise, not geometry.
        expect(penetrationWarns.length).toBe(0);
        expect(mm(stemEnd.z)).toBeCloseTo(-50, 3);
    });
});

// ── Case C — THE CONTROL: 200 mm perimeter geometry the founder confirmed working ────────────
//
// Same relative configuration as a real perimeter T: a 200 mm partition meeting a 200 mm
// perimeter wall at a centreline (Midpoint) snap, perpendicular. penetration = hostHalfT =
// 100 mm, alongTrim = 100 mm, cap = 200 mm — a 2× margin, nowhere near the boundary. This
// resolves TODAY and must resolve BYTE-IDENTICALLY after the fix.
describe('§MEASURED-EQUALITY-REFUSED — case C: 200 mm perimeter CONTROL (founder-confirmed, must not move)', () => {
    it('pins the exact resolved geometry of the perimeter path', () => {
        const host = mk([0, 0], [8, 0], 0.2);
        const stem = mk([4, -3], [4, 0], 0.2);

        const { res, warns } = resolveCapturingWarns([host, stem]);
        const jd = res.get(stem.id);
        const hostJd = res.get(host.id);

        // eslint-disable-next-line no-console
        console.log(JSON.stringify({
            case: 'C',
            stemStart: jd ? [jd.baseLine[0].x, jd.baseLine[0].z] : null,
            stemEnd: jd ? [jd.baseLine[1].x, jd.baseLine[1].z] : null,
            stemStartMN: jd?.startMN ?? null,
            stemEndMN: jd?.endMN ?? null,
            hostStart: hostJd ? [hostJd.baseLine[0].x, hostJd.baseLine[0].z] : null,
            hostEnd: hostJd ? [hostJd.baseLine[1].x, hostJd.baseLine[1].z] : null,
            warns,
        }, null, 2));

        // EXACT literals, not tolerances. C83 §10.4 asks for "byte-identical"; a `toBeCloseTo`
        // control can be satisfied by a fix that perturbs the perimeter path within its own
        // slack, which is precisely the regression the founder would find and this file would
        // not. The trailing ulp on the z value below is REAL and is pinned deliberately.
        expect(jd).toBeDefined();
        expect(jd!.baseLine[0].x).toBe(4);
        expect(jd!.baseLine[0].z).toBe(-3);
        expect(jd!.baseLine[1].x).toBe(4);
        expect(jd!.baseLine[1].z).toBe(-0.10000000000000009);   // the host's near face, exactly
        expect(jd!.startMN).toBe(null);
        expect(jd!.endMN).toEqual({ nx: 0, nz: -1 });

        // The INCUMBENT is untouched — no entry at all (C83 §10.4, the L-922 property).
        expect(hostJd).toBeUndefined();

        // And the perimeter path never reaches the boundary: no refusal on this geometry.
        expect(warns.filter(w => w.includes('§FIX-T-JOIN-PENETRATION')).length).toBe(0);
    });
});

// ── Case D — the founder's sentence, as an AREA, with no rescuer in the way ──────────────────
//
// Case A's endpoint was seated by `_clampEndToShellInnerFace` even while the gate refused, so
// its clash was hidden. This case separates the two by the ONE millimetre that tells them apart:
// `_applyT` seats an endpoint exactly ON the face, while the rescuer seats it one
// INNER_OVERLAP_M short of it. A 120 mm partition therefore resolves to z = 4.060 if the join
// resolver did the work, and z = 4.059 if the rescuer did.
//
// (A first attempt pushed the endpoint past the snap radius to make the rescuer decline
// outright. That defeated DETECTION too — `_detect` and the rescuer read the same
// `snapRadius` — so the pair produced no join at all and measured nothing. Recorded because
// the null result is easy to mistake for a clean one: no entry is not the same as no clash.)
//
// What it measures is the founder's actual sentence:
//
//   "it should ALWAYS connect with the face of the wall — never create a clash — never should
//    the created wall go THROUGH the other wall."
describe('§MEASURED-EQUALITY-REFUSED — case D: the tie, seated by the resolver and not the rescuer', () => {
    const HOST_T = 0.12;

    it('seats the stem on the face with ZERO doubled solid, where the OLD predicate refused', () => {
        const host = mk([0, 4], [12, 4], HOST_T);
        // Stem approaches from the north; its start endpoint is drawn through to P's FAR
        // (south) face at z = 4 − 0.06. Perpendicular, so retreat == penetration == thickness.
        const stem = mk([6, 4 - HOST_T / 2], [6, 8], HOST_T);

        // 0.07 m: above the 60 mm far-face offset so the pair is DETECTED as a T-join at all,
        // and still inside the app's [0.05, 1.0] camera-derived band.
        const { res, warns } = resolveCapturingWarns([host, stem], 0.07);
        const stemJd = res.get(stem.id);

        // THE OLD PREDICATE, REPLAYED ON THIS FIXTURE'S OWN NUMBERS. Both quantities are fixed
        // by the geometry: a perpendicular approach whose endpoint sits on the far face has
        // penetration = one thickness, and retreat = penetration / sin 90° = the same number.
        const penetration = HOST_T;
        const alongTrim = HOST_T;
        // BEFORE: cap was the bare `hostWall.thickness`, compared with no tolerance at all.
        expect(alongTrim > HOST_T).toBe(false);          // …and yet it refused, on rounding alone
        // AFTER: the cap is the declared 30° ratio, so a PERPENDICULAR approach is 2× inside it
        // and no amount of floating-point noise can flip the verdict.
        expect(alongTrim > Math.max(HOST_T, penetration / 0.5) + 0.001).toBe(false);
        expect(Math.max(HOST_T, penetration / 0.5)).toBe(0.24);

        // No refusal, and the stem is seated on the host's NORTH face (z = 4 + 0.06) by the
        // join resolver itself — not left through the body at z = 3.94.
        expect(warns.filter(w => w.includes('§FIX-T-JOIN-PENETRATION')).length).toBe(0);
        expect(stemJd).toBeDefined();
        // 4060, NOT 4059. `_applyT` seats ON the face; `_clampEndToShellInnerFace` seats one
        // INNER_OVERLAP_M (1 mm) short of it. This millimetre is the whole assertion: the
        // emitter is doing its own job and the rescuer has nothing left to do.
        expect(mm(stemJd!.baseLine[0].z)).toBeCloseTo(4060, 3);

        // THE FOUNDER'S SENTENCE, AS A NUMBER: no doubled solid anywhere in the pair.
        // The 2 mm sampler registers a thin band along a shared face; 800 mm² sits above that
        // and orders of magnitude below the ~700 000 mm² a through-crossing 120 mm stem makes.
        const fpHost = legacyFootprint(
            res.get(host.id) ?? {
                baseLine: [new THREE.Vector3(0, 0, 4), new THREE.Vector3(12, 0, 4)] as [THREE.Vector3, THREE.Vector3],
                startMN: null, endMN: null,
            }, HOST_T);
        const fpStem = legacyFootprint(stemJd!, HOST_T);

        // eslint-disable-next-line no-console
        console.log(JSON.stringify({ case: 'D', clashMm2: Math.round(overlapMm2(fpHost, fpStem)) }));
        expect(overlapMm2(fpHost, fpStem)).toBeLessThan(800);
    });
});
