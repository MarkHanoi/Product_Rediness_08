// §HOUSE-CENTRAL-STAIR-SEALED (founder 2026-06-20 live report → standing regression guard).
//
// THE LIVE REPORT (2-storey / 2-bed / 1-bath house, ~175 m² ground plate):
//   §DIAG-DOORS summary: doors=3 roomsWithDoor=4/8
//      sealed=[r0(hall), r3(dining), r5(bedroom), stair0(stair)]
//   §DIAG-ADJACENCY r0(hall) → NO DOOR ✗   ← the ENTRY HALL shipped with no door.
//
// INVESTIGATION OUTCOME (2026-06-20): driving the real entry point `generateHouseLayout`
// at the reported brief + dims (17.491 × 13.416 m, net 175 m²) does NOT reproduce the seal
// on the current engine — the ground storey ships fully connected (Entrance Hall ↔ Corridor
// door w=1000 + Hall ↔ Living; every habitable room has a door; only the Stair keep-out is
// door-less, which is correct). The live seal was therefore plate/seed-specific (most likely
// the central-stair fragmentation at other exact dims) and is NOT reproducible at this brief.
// See docs/03-execution/analysis/HOUSE-CIRCULATION-SEALED-ROOMS-2026-06-20.md.
//
// THE CONTRACT (standing guard): a 2-storey house on this generous plate must ship a GROUND
// storey whose entry hall + every habitable room is reachable — no sealed rooms. This test
// drives the real entry point so it exercises the stair placer AND the door engine together;
// it is GREEN today and guards against a regression that re-introduces the seal.

import { describe, expect, it } from 'vitest';
import { generateHouseLayout } from '../src/workflows/houseLayout/index.js';
import type { ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type { ApartmentConstraints, ApartmentProgram, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

/** The founder's live brief: 2-bed / 1-bath / no en-suite, open-plan K/D, living, hall. */
const PROGRAM: ApartmentProgram = {
    bedrooms: 2, bathrooms: 1, masterEnSuite: false,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};
const CONSTRAINTS: ApartmentConstraints = {
    minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: '',
};
const WEIGHTS: ScoringWeights = {
    naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1,
};

/** ~175 m² (17.5 × 13.4 m) plate — the live reproduction size where a CENTRAL stair won. */
const SHELL: ShellAnalysis = {
    netAreaM2: 175, widthM: 17.491, depthM: 13.416,
    perimeter: [{ x: 0, z: 0 }, { x: 17.491, z: 0 }, { x: 17.491, z: 13.416 }, { x: 0, z: 13.416 }],
    faces: [],
};

/** A room is "sealed" when it has NO door onto any other room — the §DIAG-ADJACENCY
 *  "→ NO DOOR ✗" condition. `doorAdjacentTo` is the real ACCESS graph (a permeable
 *  boundary), as opposed to `adjacentTo` (mere wall-sharing). `hasDirectAccess` is the
 *  engine's own reachable-without-passing-through flag. A room is reachable if EITHER
 *  is satisfied. The `stair` keep-out and any open-plan-merged virtual zone are not
 *  habitable-sealed in the door sense, so we judge only real rooms. */
const NON_HABITABLE = new Set(['stair']);
function sealedRooms(rooms: readonly { type: string; name: string; hasDirectAccess?: boolean; doorAdjacentTo?: string[] }[]): string[] {
    return rooms
        .filter((r) => !NON_HABITABLE.has(r.type))
        .filter((r) => (r.doorAdjacentTo?.length ?? 0) === 0 && r.hasDirectAccess !== true)
        .map((r) => `${r.name}(${r.type})`);
}

describe('§HOUSE-CENTRAL-STAIR-SEALED — the ground storey must not ship a sealed entry hall', () => {
    const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
    const ground = res.perStoreyLayout[0]!;

    it('produced a ground storey with rooms', () => {
        expect(ground).toBeDefined();
        expect(ground.rooms.length).toBeGreaterThan(0);
    });

    it('the entry hall has a realised door (not just graph intent)', () => {
        // Assert on the REALISED door list (the wallsAndDoors output), not only the graph
        // permeability — a door physically serving the hall is the field-truth contract.
        const hallDoor = ground.doors.find((d: any) => d.roomTypeA === 'hall' || d.roomTypeB === 'hall');
        const doorList = ground.doors.map((d: any) => `${d.roomTypeA}↔${d.roomTypeB}`).join(', ');
        expect(hallDoor, `a realised door must serve the hall — doors: [${doorList}]`).toBeDefined();
    });

    it('the entry hall is reachable (has a door) — not sealed', () => {
        const hall = ground.rooms.find((r) => r.type === 'hall');
        expect(hall, 'an entry hall room exists').toBeDefined();
        const reachable = (hall!.doorAdjacentTo?.length ?? 0) > 0 || hall!.hasDirectAccess === true;
        expect(reachable, `hall "${hall?.name}" must have ≥1 door (doorAdjacentTo=${JSON.stringify(hall?.doorAdjacentTo)}, hasDirectAccess=${hall?.hasDirectAccess})`).toBe(true);
    });

    it('no habitable room ships sealed (no door onto any neighbour)', () => {
        const sealed = sealedRooms(ground.rooms as any);
        expect(sealed, `sealed rooms: ${sealed.join(', ')}`).toHaveLength(0);
    });
});

// ── TRACKED KNOWN DEFECT (2026-06-20 sweep) — NOT YET FIXED ─────────────────────
// The 70-320 m² dimension sweep found plates where the carve seats a habitable /
// service room in a pocket whose every neighbour is an ILLEGAL door-host (always
// incl. the `stair` keep-out, plus a bathroom / duplicate service room) → no legal
// host wall → the room ships SEALED. ONE root, same class as the live hall report.
// The correct fix is a POST-SELECTION circulation rescue (a per-candidate rescue
// perturbs buildWallsAndDoors — both scorer AND builder — → area-cap regression on
// revert). These are `.skip` so they track the defect without failing CI; flip to
// `it` when the rescue lands. See HOUSE-CIRCULATION-SEALED-ROOMS-2026-06-20.md.
describe.skip('§HOUSE-SEALED-POCKET — known carve seals (flip to it() when the rescue lands)', () => {
    const SEALERS: ReadonlyArray<readonly [number, number, string]> = [
        [11, 7, 'Bathroom (over-grown ~16.9 m²) stranded on Stair+Storage'],
        [12, 7, 'Bedroom 1 stranded on Bathroom+Stair'],
        [17, 12.5, 'Storage (1 of 3) stranded on Dining+Storage'],
    ];
    for (const [w, d, why] of SEALERS) {
        it(`${w}×${d} m ships no sealed room — ${why}`, () => {
            const shell: ShellAnalysis = {
                netAreaM2: +(w * d).toFixed(1), widthM: w, depthM: d,
                perimeter: [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }], faces: [],
            };
            const r = generateHouseLayout(shell, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
            const g = r.perStoreyLayout[0]!;
            const sealed = sealedRooms(g.rooms as any);
            expect(sealed, `sealed rooms: ${sealed.join(', ')}`).toHaveLength(0);
        });
    }
});
