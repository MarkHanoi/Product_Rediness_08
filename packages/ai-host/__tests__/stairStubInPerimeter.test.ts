// §STAIR-STUB-IN-PERIMETER (founder out-of-boundary screenshot, 2026-06-18).
//
// THE DEFECT (founder screenshot): the §STAIR-CIRC-STUB rescue — a small "Stair Corridor" that
// bridges an otherwise-landlocked stair to the circulation — was rendered as a thin strip poking
// OUTSIDE the building perimeter (its own wall sticking out of the bottom-right of the shell),
// instead of inside. Production log line:
//   §STAIR-CIRC-STUB cand z-fwd-id routed 1/1 empty-space corridor stub(s) to … landlocked stair(s)
// and the room shipped as `corridorStub_stair0_0(corridor)`.
//
// ROOT CAUSE (subdivide.ts findCorridorStubToKeepOut): the stub strip was clamped to the shell's
// BOUNDING BOX (`shellBB`), never to the real shell POLYGON. On a ROTATED / SHEARED / L-shaped /
// stepped footprint the bbox over-covers the real shell, so the bbox-clamped strip ran PAST a
// slanted or re-entrant perimeter edge → a "Stair Corridor" with a wall outside the building.
//
// THE FIX: pass the real `shellPolygon` into findCorridorStubToKeepOut. Each candidate stub is now
// clamped to the polygon (convex shells) and re-verified strictly INSIDE it; a stub that cannot
// reach the stair while staying inside is REJECTED (better no stub than an out-of-bounds one — the
// stair then serves through a room, the existing fallback). Absent polygon ⇒ unchanged bbox-only
// behaviour (byte-identical for every non-house caller, ADR-0061).
//
// Two layers of coverage: (1) a DIRECT unit reproduction of findCorridorStubToKeepOut where the
// shell's slanted edge cuts across the bbox so a bbox-clamped stub would protrude; (2) the FULL
// enumerate pipeline over a sheared-quad house GROUND plate asserting EVERY emitted Space polygon
// (incl. any Stair Corridor) lies inside the shell perimeter.

import { describe, expect, it } from 'vitest';
import { findCorridorStubToKeepOut, type RoomPlacement } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import { enumerateLayouts } from '../src/workflows/apartmentLayout/tgl/enumerate.js';
import { polygonBBox, type Pt, type Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import { validateHouseStorey } from '../src/workflows/houseLayout/houseEnvelope.js';
import type { ApartmentProgram, RoomType, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

// ── point-in-polygon (boundary counts as inside, EPS tolerance) ──────────────
function pointInsidePoly(p: Pt, poly: readonly Pt[], eps = 1e-4): boolean {
    // on-edge → inside
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i]!, b = poly[j]!;
        const dx = b.x - a.x, dz = b.z - a.z;
        const len2 = dx * dx + dz * dz;
        const t = len2 > 1e-12 ? ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2 : -1;
        if (t >= -eps && t <= 1 + eps) {
            const qx = a.x + t * dx, qz = a.z + t * dz;
            if (Math.hypot(p.x - qx, p.z - qz) <= eps) return true;
        }
    }
    let win = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i]!, b = poly[j]!;
        const hit = ((a.z > p.z) !== (b.z > p.z)) &&
            (p.x < (b.x - a.x) * (p.z - a.z) / ((b.z - a.z) || 1e-30) + a.x);
        if (hit) win = !win;
    }
    return win;
}

/** Every vertex of `rectPoly` is inside-or-on `shellPoly`. */
function polyInsideShell(rectPoly: readonly Pt[], shellPoly: readonly Pt[]): boolean {
    return rectPoly.every(v => pointInsidePoly(v, shellPoly));
}

// ── (1) direct unit reproduction ─────────────────────────────────────────────
describe('§STAIR-STUB-IN-PERIMETER — findCorridorStubToKeepOut clips the stub to the shell polygon', () => {
    // A SHEARED quad shell whose RIGHT edge slants inward toward the top: the bbox is the full
    // [0..10]×[0..12] rectangle but the real shell loses ~4 m off the top-right (at z=12 the right
    // edge is at x=6). The corridor is a strip along the LEFT; the only empty channel to the
    // top-right stair keep-out is the upper-right band, which the bbox over-covers — so a bbox-only
    // stub overruns the slant. The polygon-clipped stub must NOT.
    const SHELL: Pt[] = [
        { x: 0, z: 0 }, { x: 10, z: 0 }, { x: 6, z: 12 }, { x: 0, z: 12 },
    ];
    const shellBB: Rect = polygonBBox(SHELL);

    // corridor: a vertical strip along the LEFT; stair keep-out: high band near the slant.
    const corridor: Rect = { x0: 0, z0: 0, x1: 1.4, z1: 12 };
    const stairKO: Rect = { x0: 5.0, z0: 9.0, x1: 7.4, z1: 11.0 };
    const placements: RoomPlacement[] = [
        { roomId: 'cor', rect: corridor },
        // a habitable block below the keep-out band so the only empty channel runs along the top
        { roomId: 'r1', rect: { x0: 1.4, z0: 0, x1: 8.5, z1: 9 } },
    ];
    const typeById = new Map<string, RoomType>([['cor', 'corridor'], ['r1', 'living']]);

    it('a polygon-clipped stub never pokes outside the shell perimeter', () => {
        const stub = findCorridorStubToKeepOut(
            placements, 'cor', [stairKO], typeById, 1.2, shellBB, undefined, SHELL,
        );
        if (stub) {
            const poly: Pt[] = [
                { x: stub.x0, z: stub.z0 }, { x: stub.x1, z: stub.z0 },
                { x: stub.x1, z: stub.z1 }, { x: stub.x0, z: stub.z1 },
            ];
            expect(polyInsideShell(poly, SHELL), `polygon stub ${JSON.stringify(stub)} must be inside the shell`).toBe(true);
        }
        // Either way it MUST NOT protrude — proven above when a stub was emitted.
    });

    it('the fix is load-bearing: the BBOX-ONLY stub would protrude, the POLYGON stub does not', () => {
        // bbox-only (the pre-fix call): clamps only to the bounding box → overruns the slanted edge.
        const bboxStub = findCorridorStubToKeepOut(
            placements, 'cor', [stairKO], typeById, 1.2, shellBB, undefined,
        );
        // polygon (the fixed call): same geometry, real shell polygon supplied.
        const polyStub = findCorridorStubToKeepOut(
            placements, 'cor', [stairKO], typeById, 1.2, shellBB, undefined, SHELL,
        );
        const rectPoly = (r: Rect): Pt[] => [
            { x: r.x0, z: r.z0 }, { x: r.x1, z: r.z0 }, { x: r.x1, z: r.z1 }, { x: r.x0, z: r.z1 },
        ];
        // The pre-fix bbox stub exists AND protrudes past the slant (the founder defect surface).
        expect(bboxStub, 'a bbox-only stub is produced for this scenario').not.toBeNull();
        expect(
            polyInsideShell(rectPoly(bboxStub!), SHELL),
            `bbox-only stub ${JSON.stringify(bboxStub)} SHOULD protrude (proving the defect this fix cures)`,
        ).toBe(false);
        // The fixed polygon stub, if any, is fully inside (never protrudes — better no stub than out).
        if (polyStub) {
            expect(
                polyInsideShell(rectPoly(polyStub), SHELL),
                `polygon stub ${JSON.stringify(polyStub)} must be inside the shell`,
            ).toBe(true);
        }
    });
});

// ── (2) full enumerate pipeline over a sheared-quad house GROUND plate ────────
const GROUND: ApartmentProgram = {
    bedrooms: 1, bathrooms: 1, masterEnSuite: false,
    includeKitchen: true, livingRoom: true, openPlanKitchenDining: true, entranceHall: true,
};
const WEIGHTS: ScoringWeights = {} as ScoringWeights;
const houseValidator = (args: { program: ApartmentProgram; grossAreaM2: number }) =>
    validateHouseStorey({ program: args.program, grossAreaM2: args.grossAreaM2 });

describe('§STAIR-STUB-IN-PERIMETER — no emitted Space polygon pokes outside a sheared house shell', () => {
    // A sheared convex quad (~185 m²) ground plate with a corner stair: the §STAIR-CIRC-STUB rescue
    // can fire here, and the bbox over-covers the real (slanted) shell — exactly the founder case.
    const SHELL: Pt[] = [
        { x: 0, z: 0 }, { x: 13.5, z: 0 }, { x: 12.0, z: 14.4 }, { x: 0, z: 14.4 },
    ];

    // The stair keep-out sits a comfortable margin inside the slanted right edge (so the inflated
    // keep-out itself stays in-bounds — the stair ROOM's corner placement is governed by a separate
    // §STAIR-SHELL-CLAMP path, out of scope here). The corridor still has to bridge UP the right
    // band to reach it → the §STAIR-CIRC-STUB rescue, which is what this fix governs.
    const STAIR_KO: Rect = { x0: 8.5, z0: 10.6, x1: 10.5, z1: 13.0 };

    it('the Stair Corridor stub (and every non-stair Space) lies inside the shell perimeter', () => {
        const cands = enumerateLayouts({
            shellPolygon: SHELL, program: GROUND, levelId: 'L0', seed: 'stub-perim',
            weights: WEIGHTS, count: 8,
            keepOutRects: [STAIR_KO],
            envelopeValidator: houseValidator,
        });
        expect(cands.length, 'the engine produced candidates').toBeGreaterThan(0);

        // Assert containment for every NON-STAIR Space — the out-of-bounds corridorStub would
        // surface as a `corridor`-type Space polygon with a vertex outside the shell. (The stair
        // keep-out room itself is excluded: its corner placement is a different §STAIR-SHELL-CLAMP
        // concern; this fix is scoped to the stub geometry, per the founder brief.)
        for (const c of cands) {
            for (const n of c.graph.nodes) {
                if (n.kind !== 'Space') continue;
                if (String(n.attrs.spaceType ?? '') === 'stair') continue;
                const poly = n.geometry?.polygon;
                if (!poly || poly.length < 3) continue;
                const name = String(n.attrs.name ?? n.sourceId);
                expect(
                    polyInsideShell(poly, SHELL),
                    `Space "${name}" (${n.sourceId}) polygon ${JSON.stringify(poly)} must be inside the shell perimeter`,
                ).toBe(true);
            }
        }
    });

    it('is deterministic (same plate → identical Space count; no RNG, ADR-0061)', () => {
        const run = () => enumerateLayouts({
            shellPolygon: SHELL, program: GROUND, levelId: 'L0', seed: 'stub-perim',
            weights: WEIGHTS, count: 8,
            keepOutRects: [STAIR_KO],
            envelopeValidator: houseValidator,
        });
        const a = run(), b = run();
        const spaces = (cs: ReturnType<typeof run>) =>
            cs.map(c => c.graph.nodes.filter(n => n.kind === 'Space').length);
        expect(spaces(a)).toEqual(spaces(b));
    });
});
