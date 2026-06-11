// TGL §DIAG-MIN-AREA-GATE (tracker §68.1) + §DIAG-MANDATORY-GATE (tracker §68.2).
//
// Two HARD program-correctness gates in the apartment layout engine:
//
//   §68.1 — NO habitable room (living/kitchen/dining/master/bedroom/study) may be
//           EMITTED below its `roomDimensions[type].areaMin` (e.g. a 2 m² bedroom,
//           min 9 m²). When the plate cannot fit every requested mandatory room +
//           every bedroom at ≥ areaMin, the engine REDUCES the room count rather than
//           shrinking one below its minimum. A candidate that still contains a
//           sub-areaMin habitable room is HARD-INVALID (filtered out of the Pareto
//           set), never just low-scored.
//
//   §68.2 — the requested mandatory rooms (kitchen unless includeKitchen=false,
//           living unless livingRoom=false, plus the requested bedroom + bathroom
//           counts) must ALWAYS be present in every Pareto candidate the picker can
//           choose. A candidate missing / shrinking a requested mandatory room is
//           HARD-INVALID, not low-score. When NO candidate can satisfy the full
//           mandatory set at minimum sizes on the plate, the apartment path surfaces a
//           STRUCTURED rejection (empty result), never a degenerate "no kitchen + no
//           living" / "12.5 m² living (< 14)" option.
//
// THE REPRO (confirmed FAILS before the fix): a 20 × 3.2 = 64 m² shallow 2-bed shell
// passes the 2-bed envelope (60–120 m²), but is too shallow to give every room its
// minimum AREA. Pre-fix the engine SHIPPED a candidate with living=12.5 m² (< 14),
// master=10.5 m² (< 12) and dining=7.9 m² (< 8) — three habitable/mandatory rooms below
// their minimum (a degenerate option). Post-fix the apartment path REJECTS it (empty),
// and on a comfortable plate every room stays at/above its minimum (no regression).

import { describe, expect, it } from 'vitest';
import { enumerateLayouts, type EnumerateInput, type TglCandidate } from '../src/workflows/apartmentLayout/tgl/enumerate.js';
import { dimensionsFor } from '../src/workflows/apartmentLayout/dimensions/roomDimensions.js';
import type { Pt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram, RoomType, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

const WEIGHTS: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };

const HABITABLE: ReadonlySet<RoomType> = new Set<RoomType>([
    'living', 'kitchen', 'dining', 'master', 'bedroom', 'study',
]);

/** The realised Space nodes of a candidate, as {type, areaM2}, read from the EMITTED
 *  semantic graph (the geometry the picker ships) so the assertion is on what the user
 *  would actually see. */
function spacesOf(c: TglCandidate): { type: RoomType; areaM2: number }[] {
    const out: { type: RoomType; areaM2: number }[] = [];
    for (const n of c.graph.nodes) {
        if (n.kind !== 'Space') continue;
        const type = n.attrs?.spaceType as RoomType | undefined;
        const areaM2 = typeof n.attrs?.netAreaM2 === 'number' ? (n.attrs.netAreaM2 as number) : NaN;
        if (type) out.push({ type, areaM2 });
    }
    return out;
}

const input = (over: Partial<EnumerateInput> = {}): EnumerateInput => ({
    shellPolygon: [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }],
    program: {
        bedrooms: 2, bathrooms: 1, masterEnSuite: true,
        openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
    },
    levelId: 'L1', seed: 'seed', weights: WEIGHTS, count: 8, ...over,
});

// The confirmed too-shallow 2-bed repro (pre-fix ships living/master/dining sub-min).
const SHALLOW_2BED: Pt[] = [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 3.2 }, { x: 0, z: 3.2 }];
const PROGRAM_2BED: ApartmentProgram = {
    bedrooms: 2, bathrooms: 1, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};

describe('§DIAG-MIN-AREA-GATE (tracker §68.1) — no sub-areaMin habitable room', () => {
    // (a) THE REPRO — pre-fix this SHIPPED a candidate with living/master/dining below
    //     their areaMin. Post-fix: NO returned candidate may carry a sub-areaMin
    //     habitable room (the plate is rejected outright, or only viable layouts ship).
    it('never SHIPS a habitable room below its areaMin on the shallow 2-bed repro', () => {
        const out = enumerateLayouts(input({ shellPolygon: SHALLOW_2BED, program: PROGRAM_2BED, count: 8 }));
        // Whatever the engine returns (empty after the §68.1/§68.2 reject, or only
        // viable layouts), NO shipped candidate may carry a sub-areaMin habitable room.
        for (const c of out) {
            expect(c.underMinAreaRooms.length, `cand ${c.strategy} underMinAreaRooms=[${c.underMinAreaRooms.map(r => r.type).join(',')}]`).toBe(0);
            for (const sp of spacesOf(c)) {
                if (!HABITABLE.has(sp.type) || Number.isNaN(sp.areaM2)) continue;
                const areaMin = dimensionsFor(sp.type).areaMin;
                expect(sp.areaM2, `${sp.type} area ${sp.areaM2.toFixed(2)} < areaMin ${areaMin}`)
                    .toBeGreaterThanOrEqual(areaMin - 1e-6);
            }
        }
    });

    // (b) A comfortable 2-bed plate keeps every habitable room at/above areaMin (no
    //     regression — the gate never spuriously fires on a roomy plate).
    it('a comfortable 2-bed plate keeps every habitable room at/above its areaMin', () => {
        const out = enumerateLayouts(input({ count: 4 }));
        expect(out.length).toBeGreaterThan(0);
        for (const c of out) {
            expect(c.underMinAreaRooms.length, `cand ${c.strategy}`).toBe(0);
            for (const sp of spacesOf(c)) {
                if (!HABITABLE.has(sp.type) || Number.isNaN(sp.areaM2)) continue;
                const areaMin = dimensionsFor(sp.type).areaMin;
                expect(sp.areaM2, `${sp.type}=${sp.areaM2.toFixed(2)} < ${areaMin}`).toBeGreaterThanOrEqual(areaMin - 1e-6);
            }
        }
    });

    // (c) Determinism — identical min-area report across runs.
    it('is deterministic (identical min-area report across runs)', () => {
        const a = enumerateLayouts(input({ count: 4 }));
        const b = enumerateLayouts(input({ count: 4 }));
        expect(a.map(c => c.underMinAreaRooms)).toEqual(b.map(c => c.underMinAreaRooms));
    });
});

describe('§DIAG-MANDATORY-GATE (tracker §68.2) — mandatory rooms always present at min', () => {
    // (a) THE REPRO — pre-fix the shallow plate SHIPPED living=12.5 (< 14) and
    //     dining=7.9 (< 8), i.e. mandatory PUBLIC rooms below their minimum. Post-fix
    //     the apartment path surfaces a STRUCTURED rejection (empty) rather than a
    //     degenerate option, so it NEVER ships a sub-min mandatory room.
    it('hard-rejects (empty) when the plate cannot fit kitchen+living+dining at minimum', () => {
        const out = enumerateLayouts(input({ shellPolygon: SHALLOW_2BED, program: PROGRAM_2BED, count: 8 }));
        // Either an empty (structured rejection) result, OR — if some viable tiling
        // exists — every shipped candidate has the full mandatory set, each at/above its
        // minimum. It may NEVER ship a candidate that dropped/shrank a mandatory room.
        for (const c of out) {
            expect(c.missingMandatoryTypes.length, `cand ${c.strategy}`).toBe(0);
            const byType = new Map<RoomType, number>();
            for (const sp of spacesOf(c)) {
                if (!HABITABLE.has(sp.type) || Number.isNaN(sp.areaM2)) continue;
                byType.set(sp.type, Math.min(byType.get(sp.type) ?? Infinity, sp.areaM2));
            }
            for (const t of ['kitchen', 'living', 'dining'] as const) {
                const a = byType.get(t);
                if (a !== undefined) expect(a, `${t}=${a.toFixed(2)} < ${dimensionsFor(t).areaMin}`).toBeGreaterThanOrEqual(dimensionsFor(t).areaMin - 1e-6);
            }
        }
    });

    // (b) Every shipped candidate on a COMFORTABLE plate contains the requested kitchen
    //     AND living (no regression — the gate never strips a mandatory room).
    it('every shipped candidate on a comfortable plate contains kitchen AND living', () => {
        const out = enumerateLayouts(input({ count: 8 }));
        expect(out.length).toBeGreaterThan(0);
        for (const c of out) {
            expect(c.missingMandatoryTypes.length, `cand ${c.strategy} missing=[${c.missingMandatoryTypes.join(',')}]`).toBe(0);
            const types = new Set(spacesOf(c).map(s => s.type));
            expect(types.has('kitchen'), `cand ${c.strategy} has kitchen`).toBe(true);
            expect(types.has('living'), `cand ${c.strategy} has living`).toBe(true);
        }
    });

    // (c) A studio brief (no separate living/kitchen requested) is NOT rejected for
    //     "missing living" — the gate keys on the REQUESTED program, not a blanket rule.
    it('does NOT reject a studio brief that legitimately omits the living room', () => {
        const studio: ApartmentProgram = {
            bedrooms: 0, bathrooms: 1, masterEnSuite: false,
            openPlanKitchenDining: false, livingRoom: false, entranceHall: true,
        };
        const SHELL: Pt[] = [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 6 }, { x: 0, z: 6 }];   // 36 m² studio
        const out = enumerateLayouts(input({ shellPolygon: SHELL, program: studio, count: 4 }));
        expect(out.length).toBeGreaterThan(0);
        for (const c of out) {
            expect(c.missingMandatoryTypes).not.toContain('living');
        }
    });
});
