// §STAIR-KEEPOUT-LAYOUT-TIGHT + §OVERLAP-RECLAIM (founder defect, 2026-06-12:
// "really bad — always white spaces without being used … the stair is ~33 m² in the
// modal"). TWO coupled defects, both house-only (the apartment path has no stair
// keep-out so it never reaches either):
//
//   A — OVERSIZED STAIR. On a SKEWED plate the stair keep-out was the AABB of the
//       ROTATED stair footprint (inflated once by the rotation), then `mapRectToEngine`
//       AABB'd it AGAIN (inflated twice). The double-AABB bloated the carved stair cell
//       to ~1.8× the real footprint — a ~33 m² "Stair" that ate the plot AND left the
//       matching area on the floor ABOVE it as a giant empty cell. FIX: carve the stair
//       footprint's TIGHT LAYOUT-frame AABB (axis-aligned in that frame ⇒ no inflation)
//       and pass it through the new engine-frame `keepOutRectsLayout` param so it bypasses
//       mapRectToEngine. Axis-aligned plates (principalAxis 0) are byte-identical.
//
//   B — UNRECLAIMED OVERLAP-CLIP GAP. `resolveRoomOverlaps` clips a lower-priority room
//       to its largest clear sub-rect (or drops it). The freed area was never re-absorbed
//       → it shipped as a generic "Room NN" blank. FIX (§OVERLAP-RECLAIM, enumerate.ts):
//       re-run the residual fill over the net placements after a clip/drop, then one more
//       overlap net, so an adjacent room grows into the gap (≤ its hard-max) or a named
//       Store is minted — no gap survives.
//
// Plus the §65.2-TIGHT moderate-blank floor drop (6 → 3 m²) so NO unprogrammed cell > ~3 m².
//
// NO Math.random — fixed fixtures only (ADR-0061 determinism).

import { describe, expect, it } from 'vitest';
import { generateHouseLayout } from '../src/workflows/houseLayout/index.js';
import type { ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type { ApartmentConstraints, ApartmentProgram, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

const C: ApartmentConstraints = { minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: '' };
const W: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };
const PROGRAM: ApartmentProgram = {
    bedrooms: 4, bathrooms: 2, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};

/** A SKEWED parallelogram plate (principal axis ≠ 0) — the founder's repro for the
 *  double-AABB inflated stair. `shearM` slides the top edge across by `shearM` m. */
function skewPlate(widthM: number, depthM: number, shearM: number): ShellAnalysis {
    const perimeter = [
        { x: 0, z: 0 }, { x: widthM, z: 0 },
        { x: widthM + shearM, z: depthM }, { x: shearM, z: depthM },
    ];
    let area = 0;
    for (let i = 0; i < perimeter.length; i++) {
        const p = perimeter[i]!, q = perimeter[(i + 1) % perimeter.length]!;
        area += p.x * q.z - q.x * p.z;
    }
    return { netAreaM2: Math.abs(area) / 2, widthM, depthM, perimeter, faces: [] };
}

/** An axis-aligned rectangular plate (principal axis 0 — the byte-identical path). */
function rectPlate(areaM2: number, widthM: number): ShellAnalysis {
    const depthM = areaM2 / widthM;
    return {
        netAreaM2: areaM2, widthM, depthM,
        perimeter: [{ x: 0, z: 0 }, { x: widthM, z: 0 }, { x: widthM, z: depthM }, { x: 0, z: depthM }],
        faces: [],
    };
}

/** A stair is a tight vertical core — a straight/U flight + landing ≈ 10–16 m² MAX. */
const STAIR_MAX_M2 = 16.0;

describe('§STAIR-KEEPOUT-LAYOUT-TIGHT — the generated stair stays a tight core on a SKEWED plate', () => {
    // Multiple shears so the fix is exercised across a band of principal-axis angles
    // (every one used to inflate the stair past the tight footprint via the double-AABB).
    for (const shear of [6, 8, 10, 12] as const) {
        describe(`a 16×13 m plate sheared ${shear} m (principal axis ≠ 0)`, () => {
            const sh = skewPlate(16, 13, shear);
            const r = generateHouseLayout(sh, PROGRAM, C, W, { storeyCount: 2 });

            it('every storey ships exactly one stair room ≤ a tight core size (never the ~33 m² flood cell)', () => {
                expect(r.perStoreyLayout.length).toBe(2);
                const coreM2 = (r.stairs[0]!.rectMm.w / 1000) * (r.stairs[0]!.rectMm.h / 1000);
                expect(coreM2).toBeGreaterThan(0);
                for (const opt of r.perStoreyLayout) {
                    const stairs = opt!.rooms.filter(rm => rm.type === 'stair');
                    expect(stairs).toHaveLength(1);
                    // Absolute tightness: a stair core is ≤ ~16 m² (a straight/U flight + landing).
                    expect(stairs[0]!.area, `stair = ${stairs[0]!.area.toFixed(1)} m²`).toBeLessThanOrEqual(STAIR_MAX_M2);
                    // Ratio tightness: ≤ ~1.65× the reserved core (no double-AABB inflation).
                    expect(stairs[0]!.area / coreM2).toBeLessThanOrEqual(1.65);
                }
            });

            it('the stair no longer eats a fat slice — the stair share of the plate is small', () => {
                // The founder's defect: a ~33 m² stair on a ~208 m² plate (~16 %). With the
                // tight layout-frame keep-out the stair is a vertical core, a small fraction
                // of each storey. (Plot-packing per se is asserted on the axis-aligned plate
                // below + in houseResidualFill.test.ts, where bbox == shoelace area so the
                // named-room sum is a faithful measure; on a skewed plate the engine tiles the
                // bbox-rectified plate so a shoelace ratio is not a sound packing metric.)
                for (const opt of r.perStoreyLayout) {
                    const tiled = opt!.rooms.reduce((s, rm) => s + rm.area, 0);
                    const stair = opt!.rooms.find(rm => rm.type === 'stair')!;
                    expect(stair.area / tiled, `stair is ${(100 * stair.area / tiled).toFixed(0)} % of the storey`)
                        .toBeLessThanOrEqual(0.10);
                }
            });

            it('every cell is a NAMED program room — never a generic "Room NN" blank', () => {
                for (const opt of r.perStoreyLayout) {
                    for (const room of opt!.rooms) {
                        expect(room.type, 'a cell has no semantic type').toBeTruthy();
                        expect(/^room\s*\d/i.test(room.name), `generic blank name "${room.name}"`).toBe(false);
                    }
                }
            });

            it('is deterministic (ADR-0061) — identical inputs → identical room areas', () => {
                const b = generateHouseLayout(sh, PROGRAM, C, W, { storeyCount: 2 });
                const sig = (res: typeof r) => res.perStoreyLayout
                    .map(o => o!.rooms.map(rm => `${rm.type}:${rm.area.toFixed(3)}`).join(','))
                    .join(';');
                expect(sig(r)).toEqual(sig(b));
            });
        });
    }
});

describe('§STAIR-KEEPOUT-LAYOUT-TIGHT — a tall stack keeps the stair tight too', () => {
    it('a 3-storey, 3.6 m floor-to-floor house keeps every stair ≤ the tight core max', () => {
        const r = generateHouseLayout(rectPlate(200, 14), PROGRAM, C, W, { storeyCount: 3, floorToFloorM: 3.6 });
        expect(r.perStoreyLayout.length).toBe(3);
        for (const opt of r.perStoreyLayout) {
            const stair = opt!.rooms.find(rm => rm.type === 'stair');
            expect(stair, 'every storey has a stair').toBeTruthy();
            expect(stair!.area, `stair = ${stair!.area.toFixed(1)} m²`).toBeLessThanOrEqual(STAIR_MAX_M2);
        }
    });
});

describe('§STAIR-KEEPOUT-LAYOUT-TIGHT — the axis-aligned house path is unchanged (byte-identical)', () => {
    it('an axis-aligned plate is byte-identical run-to-run AND fully tiled with a tight stair', () => {
        const a = generateHouseLayout(rectPlate(230, 16), PROGRAM, C, W, { storeyCount: 2 });
        const b = generateHouseLayout(rectPlate(230, 16), PROGRAM, C, W, { storeyCount: 2 });
        const sig = (res: typeof a) => JSON.stringify(
            res.perStoreyLayout.map(o => o!.rooms.map(rm => `${rm.type}:${rm.area.toFixed(3)}`)),
        );
        expect(sig(a)).toEqual(sig(b));
        for (const opt of a.perStoreyLayout) {
            const stair = opt!.rooms.find(rm => rm.type === 'stair')!;
            expect(stair.area).toBeLessThanOrEqual(STAIR_MAX_M2);
            const tiled = opt!.rooms.reduce((s, rm) => s + rm.area, 0);
            expect(tiled).toBeGreaterThanOrEqual(230 * 0.96);
        }
    });
});
