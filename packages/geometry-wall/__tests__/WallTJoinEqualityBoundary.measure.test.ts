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

        // TODAY (pre-fix): the gate refuses at the tie. Both numbers are the SAME number.
        expect(penetrationWarns.length).toBe(1);
        expect(penetrationWarns[0]).toContain('penetrates host=');
        expect(penetrationWarns[0]).toContain('by 100.0 mm');
        expect(penetrationWarns[0]).toContain('retreat (100.0 mm)');
        expect(penetrationWarns[0]).toContain('Left un-trimmed');

        // …and the join resolver did NOT seat this endpoint. It ends up at −49 mm — one
        // INNER_OVERLAP_M inside the near face — which is the signature of the LATER
        // `_clampEndToShellInnerFace` pass, a RESCUER, not of `_applyT`'s own trim (which
        // would seat it at exactly −50 mm, on the face). Pinning −49 pins the fact that the
        // emitter is broken and something downstream is covering for it (L-909a).
        expect(mm(stemEnd.z)).toBeCloseTo(-49, 3);
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
