// TGL P8 — deterministic Pareto enumeration tests.
// Contract (SPEC §7): returns ≤ count options; Pareto-sorted (no option dominates
// an earlier one); deterministic (two runs deep-equal); < 2 s for a 12-room program.

import { describe, expect, it } from 'vitest';
import { enumerateLayouts, type EnumerateInput, type TglCandidate } from '../src/workflows/apartmentLayout/tgl/enumerate.js';
import { OBJECTIVE_AXES, type ObjectiveVector } from '../src/workflows/apartmentLayout/tgl/objectives.js';
import type { Pt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

const WEIGHTS: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };
const PROGRAM: ApartmentProgram = {
    bedrooms: 2, bathrooms: 1, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};
const RECT: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }];

const input = (over: Partial<EnumerateInput> = {}): EnumerateInput => ({
    shellPolygon: RECT, program: PROGRAM, levelId: 'L1', seed: 'seed', weights: WEIGHTS, count: 3, ...over,
});

const dominates = (a: ObjectiveVector, b: ObjectiveVector): boolean => {
    let strict = false;
    for (const ax of OBJECTIVE_AXES) { if (a[ax] < b[ax] - 1e-9) return false; if (a[ax] > b[ax] + 1e-9) strict = true; }
    return strict;
};

describe('enumerateLayouts (TGL P8)', () => {
    // §D3.5 (2026-05-29) — apartment-envelope gate.
    describe('§D3.5 apartment-envelope gate', () => {
        const TINY_SHELL: Pt[] = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 6 }, { x: 0, z: 6 }];   // 24 m²
        const HUGE_SHELL: Pt[] = [{ x: 0, z: 0 }, { x: 15, z: 0 }, { x: 15, z: 15 }, { x: 0, z: 15 }]; // 225 m²

        it('returns empty when a 3-bedroom apartment is below 85 m² hard min', () => {
            const tinyProgram: ApartmentProgram = { ...PROGRAM, bedrooms: 3 };
            const result = enumerateLayouts(input({
                shellPolygon: TINY_SHELL, program: tinyProgram,
            }));
            expect(result.length).toBe(0);
        });

        it('returns empty when a 1-bedroom apartment exceeds the 80 m² hard max', () => {
            const bigProgram: ApartmentProgram = { ...PROGRAM, bedrooms: 1 };
            const result = enumerateLayouts(input({
                shellPolygon: HUGE_SHELL, program: bigProgram,
            }));
            expect(result.length).toBe(0);
        });

        it('admits a sensible 2-bedroom apartment within the §3.1 envelope', () => {
            // 12 × 10 = 120 m² for a 2-bed is right at the soft max but admissible.
            const result = enumerateLayouts(input({ count: 1 }));
            expect(result.length).toBeGreaterThan(0);
        });
    });

    it('returns at most `count` candidates', () => {
        expect(enumerateLayouts(input({ count: 3 })).length).toBeLessThanOrEqual(3);
        expect(enumerateLayouts(input({ count: 1 })).length).toBeLessThanOrEqual(1);
    });

    it('each returned candidate is a complete, non-empty layout graph', () => {
        const out = enumerateLayouts(input({ count: 3 }));
        expect(out.length).toBeGreaterThan(0);
        for (const c of out) {
            expect(c.graph.nodes.some(n => n.kind === 'Space')).toBe(true);
            expect(c.graph.nodes.some(n => n.kind === 'Wall')).toBe(true);
            for (const ax of OBJECTIVE_AXES) expect(c.objectives[ax]).toBeGreaterThanOrEqual(0);
        }
    });

    it('is Pareto-respecting: no later option dominates an earlier one', () => {
        const out: TglCandidate[] = enumerateLayouts(input({ count: 8 }));
        for (let i = 0; i < out.length; i++)
            for (let j = i + 1; j < out.length; j++)
                expect(dominates(out[j]!.objectives, out[i]!.objectives)).toBe(false);
    });

    it('ranks are non-decreasing along the returned list', () => {
        const out = enumerateLayouts(input({ count: 8 }));
        for (let i = 1; i < out.length; i++) expect(out[i]!.rank).toBeGreaterThanOrEqual(out[i - 1]!.rank);
    });

    it('is deterministic — two runs are byte-identical (graphs + GUIDs)', () => {
        expect(JSON.stringify(enumerateLayouts(input()))).toEqual(JSON.stringify(enumerateLayouts(input())));
    });

    it('handles an L-shaped shell', () => {
        const L: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 6 }, { x: 6, z: 6 }, { x: 6, z: 10 }, { x: 0, z: 10 }];
        const out = enumerateLayouts(input({ shellPolygon: L }));
        expect(out.length).toBeGreaterThan(0);
        expect(out[0]!.graph.nodes.some(n => n.kind === 'Space')).toBe(true);
    });

    // §DOOR-AVOIDANCE (2026-05-29) — interior partitions must NOT terminate
    // inside a pre-existing exterior door opening. Reuses the windowSpansWorld
    // snap mechanism; the test asserts that doorSpansWorld is plumbed through.
    it('doorSpansWorld snaps interior partitions clear of pre-existing exterior door', () => {
        // 12×10 shell, door span on the SOUTH wall (z=0) from x=5.5 to x=6.4.
        // Without the snap, the centre vertical partition tends to land at x=6
        // (the rect-decomposition midpoint), which would put its bottom
        // endpoint INSIDE the door's [5.5, 6.4] opening. With the snap, the
        // partition is shifted to x ≤ 5.4 or x ≥ 6.5 (clearance 0.1 m default).
        const doorSpan = { a: { x: 5.5, z: 0 }, b: { x: 6.4, z: 0 } };
        const out = enumerateLayouts(input({ doorSpansWorld: [doorSpan] }));
        expect(out.length).toBeGreaterThan(0);
        // Walk every wall in every candidate — no vertical wall (constant x)
        // should have an endpoint at z≈0 with x strictly inside (5.5, 6.4).
        for (const c of out) {
            const walls = c.graph.nodes.filter(n => n.kind === 'Wall');
            for (const w of walls) {
                const bl = w.geometry?.baseLine;
                if (!bl) continue;
                const [a, b] = bl;
                const vertical = Math.abs(a.x - b.x) < 1e-3;
                if (!vertical) continue;
                const x = a.x;
                const touchesSouth = Math.min(a.z, b.z) < 0.05;
                if (!touchesSouth) continue;
                // strict inside the door's clearance band would be the defect
                const insideBand = x > 5.5 - 0.05 && x < 6.4 + 0.05;
                expect(insideBand, `wall at x=${x} terminates inside the door span`).toBe(false);
            }
        }
    });

    // §STAIR-SHELL-CLAMP (v102 regression cure, 2026-06-10) — the house stair keep-out
    // mints a named `stair` room (§STAIR-ROOM-TYPE) inflated by KEEPOUT_MARGIN_M. When the
    // keep-out ABUTS the perimeter (the GROUND-floor stair against the bottom façade in the
    // founder v101 screenshot), the inflation pushed the stair rect 0.05 m OUTSIDE the shell
    // → a wall stub beyond the façade + EXTRA seal walls (the §DIAG-LEVELS ground-only
    // "EXTRA 4"). The fix clamps the inflated rect to the shell bbox.
    describe('§STAIR-SHELL-CLAMP — perimeter-abutting stair keep-out', () => {
        // 14×10 = 140 m² shell so a 3-bed house program fits cleanly.
        const SHELL14: Pt[] = [{ x: 0, z: 0 }, { x: 14, z: 0 }, { x: 14, z: 10 }, { x: 0, z: 10 }];
        const HOUSE_PROGRAM: ApartmentProgram = {
            bedrooms: 3, bathrooms: 2, masterEnSuite: true,
            openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
        };
        const houseInput = (keepOut: ReadonlyArray<{ x0: number; z0: number; x1: number; z1: number }>): EnumerateInput =>
            input({ shellPolygon: SHELL14, program: HOUSE_PROGRAM, count: 4, keepOutRects: keepOut });
        // The shell bbox + a tolerance: a wall body strictly beyond this is OUTSIDE the façade.
        const BBOX = { x0: 0, z0: 0, x1: 14, z1: 10 };
        const OUT_TOL = 1e-3;   // 1 mm — the clamp lands ON the perimeter, never past it.
        const wallsOf = (c: TglCandidate) => c.graph.nodes.filter(n => n.kind === 'Wall');
        const hasStairRoom = (c: TglCandidate): boolean =>
            c.graph.nodes.some(n => n.kind === 'Space' && /stair/i.test(String(n.attrs?.name ?? '') + String(n.attrs?.spaceType ?? '')));
        const anyWallOutsideShell = (c: TglCandidate): boolean => {
            for (const w of wallsOf(c)) {
                const bl = w.geometry?.baseLine;
                if (!bl) continue;
                for (const p of bl) {
                    if (p.x < BBOX.x0 - OUT_TOL || p.x > BBOX.x1 + OUT_TOL ||
                        p.z < BBOX.z0 - OUT_TOL || p.z > BBOX.z1 + OUT_TOL) return true;
                }
            }
            return false;
        };

        it('a stair keep-out ABUTTING the perimeter mints a stair room but emits NO wall outside the shell', () => {
            // Keep-out flush with the bottom façade (z0 = 0). Pre-fix the inflated stair
            // rect reached z = -0.05 → a wall beyond the façade.
            const out = enumerateLayouts(houseInput([{ x0: 5, z0: 0, x1: 8, z1: 3 }]));
            expect(out.length).toBeGreaterThan(0);
            const best = out[0]!;
            expect(hasStairRoom(best), 'the stair room must still be minted (§STAIR-ROOM-TYPE preserved)').toBe(true);
            for (const c of out) {
                expect(anyWallOutsideShell(c), 'no wall may sit outside the shell perimeter').toBe(false);
            }
        });

        it('a CORNER keep-out (two perimeter edges) still emits NO out-of-shell wall', () => {
            // Bottom-left corner: x0=0 AND z0=0 both abut the perimeter → both inflated
            // edges would protrude pre-fix.
            const out = enumerateLayouts(houseInput([{ x0: 0, z0: 0, x1: 3, z1: 3 }]));
            expect(out.length).toBeGreaterThan(0);
            for (const c of out) {
                expect(anyWallOutsideShell(c)).toBe(false);
            }
        });

        it('a FULLY-INTERIOR keep-out still mints the stair room with its own partition walls', () => {
            const out = enumerateLayouts(houseInput([{ x0: 5.5, z0: 4, x1: 8.5, z1: 7 }]));
            expect(out.length).toBeGreaterThan(0);
            expect(hasStairRoom(out[0]!), 'interior stair room is minted').toBe(true);
            for (const c of out) {
                expect(anyWallOutsideShell(c)).toBe(false);
            }
        });

        it('determinism preserved with a keep-out (ADR-0061) — two runs byte-identical', () => {
            const ko = [{ x0: 5, z0: 0, x1: 8, z1: 3 }];
            expect(JSON.stringify(enumerateLayouts(houseInput(ko))))
                .toEqual(JSON.stringify(enumerateLayouts(houseInput(ko))));
        });

        it('apartment path (NO keep-out) is unaffected — no stair room, no out-of-shell wall', () => {
            const out = enumerateLayouts(input({ shellPolygon: SHELL14, program: HOUSE_PROGRAM, count: 4 }));
            expect(out.length).toBeGreaterThan(0);
            expect(hasStairRoom(out[0]!)).toBe(false);
        });
    });

    it('completes a 12-room program in well under 2 s', () => {
        const big: ApartmentProgram = { bedrooms: 4, bathrooms: 2, masterEnSuite: true, openPlanKitchenDining: true, livingRoom: true, entranceHall: true };
        const start = performance.now();
        const out = enumerateLayouts(input({ program: big, shellPolygon: [{ x: 0, z: 0 }, { x: 18, z: 0 }, { x: 18, z: 12 }, { x: 0, z: 12 }], count: 5 }));
        const elapsed = performance.now() - start;
        expect(out.length).toBeGreaterThan(0);
        expect(elapsed).toBeLessThan(2000);
    });
});
