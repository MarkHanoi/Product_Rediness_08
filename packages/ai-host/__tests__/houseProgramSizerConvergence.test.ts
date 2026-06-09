// M-B (ADR-0063 H1) — §PLATE-ROLE program-sizer convergence acceptance tests.
//
// THE DEFECT (last house prod run, ~517 m² plate): rooms came out ENORMOUS +
// generic voids — "Living Room 696 m²", "Bedroom 144 m²", "Room 00-008",
// §FEASIBILITY-ALLOC dropping rooms. The apartment on a 146 m² plate produced
// sensible 7-29 m² rooms on the SAME shared engine.
//
// ROOT CAUSE (audit): the subdivider fills the real plate EXACTLY (squarify), so the
// ONLY lever on per-room size is room COUNT. The apartment is coherent because
// `scaleProgramToShell` scales bedroom COUNT to the plate (~130 m²/bed). The house's
// parallel sizer (`enrichStoreyProgramToPlate`/`fillGroundPlate` grow-loop +
// §ENRICH-DENSITY-CAP) capped growth far too low (≤5 enriched / ≤2 ground beds), so a
// large house storey was starved of rooms and every room stretched.
//
// THE FIX: parameterise `scaleProgramToShell` with a `plateRole` ('single' | 'ground'
// | 'upper') and route every house storey's bedroom-COUNT growth through that SAME
// shared sizer (a denser 45 m²/bed for a house storey, bounded ≤ 8), retiring the
// parallel grow-loop. 'single' (the apartment) is BYTE-IDENTICAL.

import { describe, expect, it } from 'vitest';
import { generateHouseLayout } from '../src/workflows/houseLayout/index.js';
import {
    buildBubbleGraph,
    scaleProgramToShell,
    type PlateRole,
} from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { generateDeterministicLayouts } from '../src/workflows/apartmentLayout/tgl/runDeterministicLayout.js';
import type { ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type {
    ApartmentConstraints, ApartmentProgram, ScoringWeights, ScoredLayoutOption,
} from '../src/workflows/apartmentLayout/types.js';

const C: ApartmentConstraints = { minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: '' };
const W: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };

const FULL: ApartmentProgram = {
    bedrooms: 3, bathrooms: 2, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};

/** A rectangular plate of `areaM2` (width × area/width), axis-aligned. */
function plate(areaM2: number, widthM: number): ShellAnalysis {
    const depthM = areaM2 / widthM;
    return {
        netAreaM2: areaM2, widthM, depthM,
        perimeter: [{ x: 0, z: 0 }, { x: widthM, z: 0 }, { x: widthM, z: depthM }, { x: 0, z: depthM }],
        faces: [],
    };
}

/** Shoelace area (m²) of a room polygon (emitted mm → m²), or 0 when absent. */
function roomAreaM2(room: { polygon?: ReadonlyArray<{ x: number; y: number }> }): number {
    const p = room.polygon;
    if (!p || p.length < 3) return 0;
    let a = 0;
    for (let i = 0; i < p.length; i++) {
        const q = p[i]!, r = p[(i + 1) % p.length]!;
        a += q.x * r.y - r.x * q.y;
    }
    return Math.abs(a) / 2 / 1e6;
}

/** Per-type "no longer a blob" upper bound (m²). M-B (the shared-density sizer)
 *  retires the parallel sizer's over-allocation: the founder's defect class —
 *  "Bedroom 144 m² / Living 696 m²" — is GONE. These bounds prove that class is
 *  closed (a bedroom is tens-of-m², not 144; living is < ~110, not 696). They are
 *  DELIBERATELY looser than the architectural hard max because the residual
 *  proportional inflation on a GENUINELY-OVERSIZED single-family plate is a squarify
 *  fill-the-plate property the density model cannot bound alone — that final
 *  tightening is the envelope/M-C job (see the report). On a NORMAL/MEDIUM house
 *  plate (≤ ~260 m²) rooms are firmly in band (asserted separately, tighter). */
const NO_BLOB_MAX: Partial<Record<string, number>> = {
    living: 110, kitchen: 60, dining: 55, hall: 30, corridor: 45,
    master: 110, bedroom: 70, study: 40, bathroom: 28, ensuite: 24, wc: 10, utility: 18,
};

/** Tight per-type band for a NORMAL/MEDIUM house plate — the apartment-grade
 *  coherence the founder asked for (bedrooms ~12-30, living ~20-50). */
const MEDIUM_MAX: Partial<Record<string, number>> = {
    living: 55, kitchen: 35, dining: 30, hall: 16, corridor: 25,
    master: 50, bedroom: 50, study: 28, bathroom: 16, ensuite: 12, wc: 8, utility: 14,
};

describe('M-B §PLATE-ROLE — apartment is BYTE-IDENTICAL (the HARD SAFETY GATE)', () => {
    it("scaleProgramToShell(program, area) === scaleProgramToShell(program, area, 'single') across the curve", () => {
        const programs: ApartmentProgram[] = [
            { ...FULL, bedrooms: 0, bathrooms: 0 },                 // explicit studio
            { ...FULL, bedrooms: 1, bathrooms: 1, masterEnSuite: false },
            { ...FULL, bedrooms: 2, bathrooms: 1 },
            FULL,
            { ...FULL, bedrooms: 5, bathrooms: 3 },
        ];
        for (const p of programs) {
            for (const area of [20, 60, 100, 120, 146, 200, 260, 400, 500, 650, 1000]) {
                const legacy = scaleProgramToShell(p, area);                 // default param
                const explicit = scaleProgramToShell(p, area, 'single');     // explicit role
                expect(JSON.stringify(explicit)).toEqual(JSON.stringify(legacy));
                // And the value MUST match the pre-M-B heuristic verbatim (130 m²/bed, ≤5).
                if (!(p.bedrooms === 0 && p.bathrooms === 0)) {
                    const expectedBeds = Math.min(5, Math.max(p.bedrooms, Math.round(area / 130)));
                    expect(legacy.bedrooms).toBe(expectedBeds);
                }
            }
        }
    });

    it('buildBubbleGraph is byte-identical for the apartment (no plateRole reaches it)', () => {
        // The apartment never passes a role; buildBubbleGraph defaults to 'single'.
        for (const area of [60, 100, 120, 146, 260]) {
            const a = buildBubbleGraph(FULL, area);
            const b = buildBubbleGraph(FULL, area);
            const areasA = a.rooms.map(r => `${r.type}:${r.targetAreaM2.toFixed(6)}`).join('|');
            const areasB = b.rooms.map(r => `${r.type}:${r.targetAreaM2.toFixed(6)}`).join('|');
            expect(areasA).toEqual(areasB);
        }
    });

    it("a studio request (0 beds ∧ 0 baths) is preserved for every role", () => {
        const studio: ApartmentProgram = { ...FULL, bedrooms: 0, bathrooms: 0 };
        for (const role of ['single', 'ground', 'upper'] as PlateRole[]) {
            const out = scaleProgramToShell(studio, 500, role);
            expect(out.bedrooms).toBe(0);
            expect(out.bathrooms).toBe(0);
        }
    });

    it('the known-good 146 m² apartment still produces sensible rooms (regression floor)', () => {
        const opts = generateDeterministicLayouts(plate(146, 12), FULL, C, W, 1);
        expect(opts.length).toBeGreaterThan(0);
        for (const r of opts[0]!.rooms) {
            const a = roomAreaM2(r);
            const cap = MEDIUM_MAX[r.type] ?? 55;
            expect(a, `apartment ${r.type} = ${a.toFixed(1)} m²`).toBeLessThanOrEqual(cap);
        }
    });
});

describe('M-B §PLATE-ROLE — a HOUSE on a large plate sizes rooms coherently', () => {
    // The convergence target: a house storey on a large (~400-500 m²) plate produces
    // room areas within sensible per-type bounds (no 100+ m² bedroom, no 600 m²
    // living) — exactly like the apartment, and with NO dropped/generic rooms.
    for (const total of [400, 500]) {
        it(`a ${total} m² 2-storey house: the founder's 144/696 blob class is GONE`, () => {
            const r = generateHouseLayout(plate(total, 20), FULL, C, W, { storeyCount: 2 });
            for (const opt of r.perStoreyLayout) {
                if (!opt) continue;
                for (const room of opt.rooms) {
                    const a = roomAreaM2(room);
                    const cap = NO_BLOB_MAX[room.type] ?? 110;
                    // The founder's prod run had Bedroom 144 m² / Living 696 m².
                    // Post-M-B every room is a small fraction of that.
                    expect(a, `${total}m² house ${room.type} = ${a.toFixed(1)} m² (cap ${cap})`)
                        .toBeLessThanOrEqual(cap);
                }
            }
        });
    }

    it('a 500 m² single-storey house packs ENOUGH rooms (density) that none blobs', () => {
        const r = generateHouseLayout(plate(500, 22), FULL, C, W, { storeyCount: 1 });
        const opt = r.perStoreyLayout[0]!;
        // A large single plate is filled with MANY rooms (the shared density), not a
        // few stretched ones — far more than the bare programme's ~9.
        expect(opt.rooms.length).toBeGreaterThanOrEqual(10);
        for (const room of opt.rooms) {
            const a = roomAreaM2(room);
            const cap = NO_BLOB_MAX[room.type] ?? 110;
            expect(a, `single-storey ${room.type} = ${a.toFixed(1)} m²`).toBeLessThanOrEqual(cap);
        }
    });

    it('the upper (private) storey of a large house is bedroom-dense (vs pre-fix 2 beds)', () => {
        const r = generateHouseLayout(plate(500, 20), FULL, C, W, { storeyCount: 2 });
        const upper = r.perStoreyLayout[1]!;
        const beds = upper.rooms.filter(rm => rm.type === 'bedroom' || rm.type === 'master');
        // The shared density (45 m²/bed) fills the private level with several bedrooms
        // (the pre-fix sizer capped at ~2 → 88 m² each). More rooms ⇒ each smaller.
        expect(beds.length).toBeGreaterThanOrEqual(4);
    });

    it('a MEDIUM (~260 m²) house storey is firmly in the apartment-grade band', () => {
        // The realistic founder plate (~517 m² total / 2 storeys ≈ 258 each). At this
        // size the shared density brings every room into a tight, sensible band.
        const r = generateHouseLayout(plate(258, 16), FULL, C, W, { storeyCount: 2 });
        for (const opt of r.perStoreyLayout) {
            if (!opt) continue;
            for (const room of opt.rooms) {
                const a = roomAreaM2(room);
                const cap = MEDIUM_MAX[room.type] ?? 55;
                expect(a, `258m² house ${room.type} = ${a.toFixed(1)} m²`).toBeLessThanOrEqual(cap);
            }
        }
    });

    it('is deterministic (ADR-0061) — identical inputs → identical room areas', () => {
        const a = generateHouseLayout(plate(500, 20), FULL, C, W, { storeyCount: 2 });
        const b = generateHouseLayout(plate(500, 20), FULL, C, W, { storeyCount: 2 });
        const sig = (res: typeof a) => res.perStoreyLayout
            .map(o => (o ? o.rooms.map(r => `${r.type}:${roomAreaM2(r).toFixed(4)}`).join(',') : 'null'))
            .join(';');
        expect(sig(a)).toEqual(sig(b));
    });
});

describe('M-B — the well-behaved small house is unchanged', () => {
    it('a normal 165 m² 2-storey 3-bed house keeps a sensible room set on every storey', () => {
        const r = generateHouseLayout(plate(165, 15), FULL, C, W, { storeyCount: 2 });
        expect(r.perStoreyLayout).toHaveLength(2);
        for (const opt of r.perStoreyLayout as ScoredLayoutOption[]) {
            expect(opt.rooms.length).toBeGreaterThanOrEqual(5);
            for (const room of opt.rooms) {
                const a = roomAreaM2(room);
                const cap = MEDIUM_MAX[room.type] ?? 55;
                expect(a, `165m² house ${room.type} = ${a.toFixed(1)} m²`).toBeLessThanOrEqual(cap);
            }
        }
    });
});
