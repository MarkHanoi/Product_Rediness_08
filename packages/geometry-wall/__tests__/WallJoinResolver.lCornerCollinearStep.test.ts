// §FIX-WALL-LCORNER-COLLINEAR-STEP — LEGACY (`WallJoinResolver`) half.
//
// A LAYERED wall and an OPENING-bearing wall render through the LEGACY path
// (`WallFragmentBuilder` layered / openings branches → `buildMiterPrism`), NOT the V2
// footprint. So the founder's topology has to be clean on BOTH pipelines.
//
// THE DEFECT (measured before the fix): two THICK walls A + B are joined in a committed,
// mitred L. A THIN wall C — DEFAULT systemTypeId, no `joinIntent` (the plain-drawn /
// generated / legacy case) — arrives COLLINEAR with arm A and terminates at the corner.
// The pass-through predicate pairs the committed arm A with C (collinear + laterally
// coincident), so §PASS-THROUGH-FLUSH square-caps the WHOLE cluster to the consensus and
// the committed L's miter normals are DELETED: A and B went from ±(0.707, 0.707) to null
//
// §FIX-WALL-TYPECHANGE-MITRE (2026-08-06) — the pinned MN literals below were UPDATED from
// ±(0.707, −0.707) to ±(0.707, 0.707). That is a CORRECTION, not a regression: the legacy
// bisector used the two walls' CHORD directions as the mitre-plane NORMAL, which lands on the
// correct diagonal only when the corner's two arms join with OPPOSED chord orientation (one at
// 'start', one at 'end'). This fixture's arms BOTH join at 'start', so the old normal picked
// the WRONG diagonal — leaving an open wedge at the convex outer corner and doubled solid at
// the concave inner one. `_miterPlaneBase` derives the plane from the offset-edge intersection
// instead, which is orientation-independent, and it agrees exactly with what
// `JunctionResolverV2` computes for the identical pair (corners (−0.15, 0.15) / (0.15, −0.15)).
// The tests' INTENT — the committed L's mitre must survive the thin newcomer — is unchanged.
// the moment C landed. That is the founder's open corner / overlapping outlines.
//
// The two existing guards both miss it by construction and the code says so: the L-122
// TYPE proxy needs a different `systemTypeId`, and the L-251 INTENT proxy needs a `joinIntent`
// of 'butt' — the founder has neither.
//
// THE FIX (geometric, not a proxy): a genuine pass-through is two segments of ONE straight
// run, and one run has ONE THICKNESS. §FIX-NEWWALL-LCORNER-SKEW already tightened this
// predicate with lateral coincidence ("on the same line"); thickness equality is the other
// half of "segments of the same wall". A collinear candidate of a DIFFERENT thickness paired
// with a COMMITTED corner arm is a newcomer butting the corner, never a continuation of it.

import { describe, it, expect, afterEach } from 'vitest';
import { WallJoinResolver } from '../src/WallJoinResolver';
import type { WallData } from '../src/WallTypes';

const THICK = 0.30;
const THIN = 0.10;

let _seq = 0;
function mk(
    s: [number, number],
    e: [number, number],
    thickness: number,
    createdAt: number,
    layered = false,
): WallData {
    return {
        id: `w${_seq++}`, type: 'wall', levelId: 'L', properties: {}, childrenIds: [],
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: 3, thickness, baseOffset: 0, openings: [],
        layers: layered
            ? [{ name: 'core', thickness: thickness * 0.8 }, { name: 'finish', thickness: thickness * 0.2 }]
            : undefined,
        metadata: { createdAt },
    } as unknown as WallData;
}

// The founder's L: corner vertex at the origin. A runs RIGHT (+x), B runs DOWN (−z).
const A = () => mk([0, 0], [5, 0], THICK, 1);
const B = () => mk([0, 0], [0, -5], THICK, 2);

interface JD {
    baseLine: Array<{ x: number; z: number }>;
    startMN: { nx: number; nz: number } | null;
    endMN: { nx: number; nz: number } | null;
    invalid?: boolean;
}
function resolve(walls: WallData[]): Map<string, JD> {
    return (WallJoinResolver as unknown as {
        resolveLevel(w: WallData[], o: { snapRadius: number }): Map<string, JD>;
    }).resolveLevel(walls, { snapRadius: 0.5 });
}
const mn = (m: { nx: number; nz: number } | null | undefined): string =>
    m ? `(${m.nx.toFixed(3)},${m.nz.toFixed(3)})` : 'NONE';
const bl = (j: JD | undefined): string =>
    j ? `(${j.baseLine[0]!.x.toFixed(3)},${j.baseLine[0]!.z.toFixed(3)})->(${j.baseLine[1]!.x.toFixed(3)},${j.baseLine[1]!.z.toFixed(3)})` : 'NONE';

afterEach(() => {
    delete (globalThis as { __pryzmWallLCornerCollinearStep?: boolean })
        .__pryzmWallLCornerCollinearStep;
});

describe('§FIX-WALL-LCORNER-COLLINEAR-STEP — legacy WallJoinResolver', () => {

    it('pins the committed 2-wall L miter (the reference the newcomer must not disturb)', () => {
        const [a, b] = [A(), B()];
        const r = resolve([a, b]);
        expect(mn(r.get(a.id)!.startMN)).toBe('(0.707,0.707)');
        expect(mn(r.get(b.id)!.startMN)).toBe('(-0.707,-0.707)');
    });

    for (const layered of [false, true]) {
        describe(layered ? 'LAYERED thin newcomer' : 'PLAIN thin newcomer', () => {
            it('leaves the committed L miter BYTE-IDENTICAL when the thin wall lands on the corner', () => {
                const [a, b] = [A(), B()];
                const c = mk([-4, 0], [0, 0], THIN, 3, layered);
                const bare = resolve([A(), B()]);
                const withC = resolve([a, b, c]);
                expect(mn(withC.get(a.id)!.startMN), 'arm A keeps its mitre')
                    .toBe(mn([...bare.values()][0]!.startMN));
                expect(mn(withC.get(b.id)!.startMN), 'arm B keeps its mitre')
                    .toBe(mn([...bare.values()][1]!.startMN));
                expect(mn(withC.get(a.id)!.startMN)).toBe('(0.707,0.707)');
                expect(mn(withC.get(b.id)!.startMN)).toBe('(-0.707,-0.707)');
            });

            it('butts the thin wall FLAT on arm B\'s outer face (matching the V2 preview)', () => {
                const [a, b] = [A(), B()];
                const c = mk([-4, 0], [0, 0], THIN, 3, layered);
                const r = resolve([a, b, c]);
                // Trimmed to B's outer face x = −halfT_B, with a PERPENDICULAR end cap.
                expect(bl(r.get(c.id)), 'thin wall trimmed to the face, not the centreline')
                    .toBe('(-4.000,0.000)->(-0.150,0.000)');
                expect(mn(r.get(c.id)!.endMN), 'flat perpendicular butt (no diagonal)')
                    .toBe('(-1.000,0.000)');
                expect(r.get(c.id)!.invalid ?? false).toBe(false);
            });
        });
    }

    it('MIRROR — a thin newcomer collinear with arm B butts flat on arm A\'s face', () => {
        const [a, b] = [A(), B()];
        const c = mk([0, 4], [0, 0], THIN, 3);
        const r = resolve([a, b, c]);
        expect(mn(r.get(a.id)!.startMN)).toBe('(0.707,0.707)');
        expect(mn(r.get(b.id)!.startMN)).toBe('(-0.707,-0.707)');
        expect(bl(r.get(c.id))).toBe('(0.000,4.000)->(0.000,0.150)');
        expect(mn(r.get(c.id)!.endMN)).toBe('(0.000,1.000)');
    });

    it('a thin wall already drawn ONTO the face is left where the author put it', () => {
        const [a, b] = [A(), B()];
        const c = mk([-4, 0], [-0.15, 0], THIN, 3);
        const r = resolve([a, b, c]);
        expect(bl(r.get(c.id))).toBe('(-4.000,0.000)->(-0.150,0.000)');
        expect(mn(r.get(a.id)!.startMN)).toBe('(0.707,0.707)');
    });

    it('NO REGRESSION — a SAME-thickness collinear pass-through still flushes', () => {
        // Two collinear segments of ONE run (same thickness) + a perpendicular stem: the
        // genuine §PASS-THROUGH-FLUSH topology. The new thickness term must be inert here.
        const [a, b] = [A(), B()];
        const c = mk([-4, 0], [0, 0], THICK, 3);   // SAME thickness as arm A
        const r = resolve([a, b, c]);
        // Pre-fix behaviour: the cluster square-caps to the consensus (no corner mitre).
        expect(mn(r.get(a.id)!.startMN)).toBe('NONE');
        expect(mn(r.get(b.id)!.startMN)).toBe('NONE');
    });

    it('never relocates a wall baseline off its own axis (no §CLAMP-COSHARE-WELD doubling)', () => {
        const [a, b] = [A(), B()];
        const c = mk([-4, 0], [0, 0], THIN, 3);
        const r = resolve([a, b, c]);
        // A and B are untouched; C is only trimmed ALONG its own axis (z stays 0).
        expect(bl(r.get(a.id))).toBe('(0.000,0.000)->(5.000,0.000)');
        expect(bl(r.get(b.id))).toBe('(0.000,0.000)->(0.000,-5.000)');
        const cj = r.get(c.id)!;
        expect(cj.baseLine[0]!.z).toBeCloseTo(0, 9);
        expect(cj.baseLine[1]!.z).toBeCloseTo(0, 9);
    });

    it('is idempotent on reopen (re-resolving already-trimmed baselines does not drift)', () => {
        const [a, b] = [A(), B()];
        const c = mk([-4, 0], [0, 0], THIN, 3);
        const r1 = resolve([a, b, c]);
        const persisted = [a, b, mk([-4, 0], [r1.get(c.id)!.baseLine[1]!.x, 0], THIN, 3)];
        const r2 = resolve(persisted);
        expect(bl(r2.get(persisted[2]!.id))).toBe(bl(r1.get(c.id)));
        expect(mn(r2.get(a.id)!.startMN)).toBe('(0.707,0.707)');
    });

    it('escape hatch __pryzmWallLCornerCollinearStep = false restores the pre-fix behaviour', () => {
        (globalThis as { __pryzmWallLCornerCollinearStep?: boolean })
            .__pryzmWallLCornerCollinearStep = false;
        const [a, b] = [A(), B()];
        const c = mk([-4, 0], [0, 0], THIN, 3);
        const r = resolve([a, b, c]);
        expect(mn(r.get(a.id)!.startMN), 'pre-fix: the committed L mitre was deleted').toBe('NONE');
        expect(mn(r.get(b.id)!.startMN)).toBe('NONE');
    });
});
