// §BRIEF-IS-AUTHORITATIVE — the founder's L-13023 case, frozen (2026-09-06).
//
// THE REPORT. Founder, on a live 452 m² single-storey plate: *"the apartment generator
// — or resi generator — is NOT SOUND. We also got an error there showing up."* His
// console carried the whole diagnosis in one line:
//
//   [D-TGL] §DIAG-ENRICH before: role=ground plateAreaM2=452 targetFillM2=384 (frac=0.85)
//           bedrooms=2 baths=1 … growBedrooms=true
//   [D-TGL] §DIAG-ENRICH after:  path=grow-bedrooms bedrooms=2->8 (+6) baths=1->3 (+2)
//
// He asked for 2 bedrooms and 1 bathroom. The enricher grew it to 8 and 3 to fill 85 %
// of the plate. Everything downstream followed: 14 cells → `§TOPO-HARD-REJECT-ALL`
// (every one of the 8 strategies HARD-INVALID: window · circulation · reach ·
// room-out-of-bounds) → the least-bad layout shipped → a blocking `§DIAG-CI-1-BANNER`
// naming three SEALED wet rooms (En-suite, Bathroom 1, Bathroom 2).
//
// ⛔ THE SOLVER WAS RIGHT EVERY TIME. It rejected all eight, preferred candidates with
// every room inside the shell, preferred the ones that seal nothing, and stated the
// compromise in words. Those refusals are the product working. The defect was upstream:
// it was handed a programme nobody asked for.
//
// THE RULE (STR §25.0 — *"I want pryzm to guide this process without building the house
// in one click"*): a brief that STATES a bedroom count is INPUT, not a suggestion the
// engine may overwrite. A brief that states NOTHING keeps the sparse-plate fill the
// enricher was originally written for (the "165 m² Room 00-001" blob) — that case is
// covered in houseProgramSizerConvergence.test.ts and is deliberately untouched.
//
// These assertions are the regression gate for the founder's own numbers.

import { describe, expect, it } from 'vitest';
import { generateHouseLayout, programmeHeadroom } from '../src/workflows/houseLayout/index.js';
import type { ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type {
    ApartmentConstraints, ApartmentProgram, ScoringWeights,
} from '../src/workflows/apartmentLayout/types.js';

const C: ApartmentConstraints = { minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: '' };
const W: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };

/** A rectangular plate of `areaM2` (width × area/width), axis-aligned. */
function plate(areaM2: number, widthM: number): ShellAnalysis {
    const depthM = areaM2 / widthM;
    return {
        netAreaM2: areaM2, widthM, depthM,
        perimeter: [{ x: 0, z: 0 }, { x: widthM, z: 0 }, { x: widthM, z: depthM }, { x: 0, z: depthM }],
        faces: [],
    };
}

/** The founder's brief, verbatim from his §DIAG-ENRICH line. */
const FOUNDER_BRIEF: ApartmentProgram = {
    bedrooms: 2, bathrooms: 1, masterEnSuite: false,
    openPlanKitchenDining: false, livingRoom: true, entranceHall: true,
};

const FOUNDER_PLATE_M2 = 452;

describe('§BRIEF-IS-AUTHORITATIVE (L-13023) — the founder\'s 452 m² 2-bed plate', () => {
    const r = generateHouseLayout(plate(FOUNDER_PLATE_M2, 22), FOUNDER_BRIEF, C, W, { storeyCount: 1 });
    const rooms = r.perStoreyLayout[0]?.rooms ?? [];

    it('ships TWO bedrooms — not eight (the defect, in one assertion)', () => {
        const beds = rooms.filter(rm => rm.type === 'bedroom' || rm.type === 'master');
        expect(beds.length, `shipped ${beds.map(b => b.name).join(', ')}`).toBe(2);
    });

    it('ships ONE bathroom — not three', () => {
        const baths = rooms.filter(rm => rm.type === 'bathroom' || rm.type === 'ensuite' || rm.type === 'wc');
        expect(baths.length, `shipped ${baths.map(b => b.name).join(', ')}`).toBe(1);
    });

    it('mints no en-suite the brief did not ask for', () => {
        expect(rooms.some(rm => rm.type === 'ensuite')).toBe(false);
    });

    it('the two bedrooms are LARGE — which is the correct answer, not a defect', () => {
        // The founder: *"A 452 m² plate with a 2-bed brief should yield two large
        // bedrooms, or ask the user what to do with the extra area."* Both halves are
        // asserted: large rooms here, the asking below.
        const beds = rooms.filter(rm => rm.type === 'bedroom' || rm.type === 'master');
        for (const b of beds) expect(b.area, `${b.name} = ${b.area.toFixed(1)} m²`).toBeGreaterThan(30);
    });

    it('every storey is SOUND — no sealed room, so no blocking banner', () => {
        // `HouseCirculationReport.banner` is null IF AND ONLY IF every storey measured
        // SOUND. The founder's run raised `severity=blocking — 1 of 1 storey ships with a
        // sealed room … SEALED — no door at all: En-suite, Bathroom 1, Bathroom 2`.
        expect(r.circulation.banner, r.circulation.banner?.lines.join(' // ') ?? '').toBeNull();
    });

    it('ASKS — a §PROGRAMME-OFFER states the unspent area, with both numbers and both remedies', () => {
        expect(r.programmeHeadroom).toHaveLength(1);
        const h = r.programmeHeadroom[0]!;
        expect(h.briefBedrooms).toBe(2);
        expect(h.briefBathrooms).toBe(1);
        expect(h.plateAreaM2).toBeCloseTo(FOUNDER_PLATE_M2, 0);
        // The plate COULD hold more — that number is computed and OFFERED, never applied.
        expect(h.plateCouldHoldBedrooms).toBeGreaterThan(h.briefBedrooms);
        expect(h.severity).toBe('warning');
        expect(h.spareAreaM2).toBeGreaterThan(200);
        expect(h.offer).toContain('did not add rooms');
        expect(h.offer).toContain('raise the bedroom count');
        expect(h.offer).toContain('smaller house footprint');
    });

    it('the offer is a PURE report — it cannot change what is built', () => {
        // `programmeHeadroom` returns a description, never a programme. Calling it twice,
        // or not at all, cannot move a room. (The type has no programme field; this
        // asserts the numeric contract is stable and side-effect free.)
        const a = programmeHeadroom(FOUNDER_BRIEF, FOUNDER_PLATE_M2, 'ground', 0);
        const b = programmeHeadroom(FOUNDER_BRIEF, FOUNDER_PLATE_M2, 'ground', 0);
        expect(a).toEqual(b);
        expect(a!.briefBedrooms).toBe(FOUNDER_BRIEF.bedrooms);
    });

    it('a brief that states NOTHING is not "offered" anything — there is no count to protect', () => {
        const sparse: ApartmentProgram = { ...FOUNDER_BRIEF, bedrooms: 0, bathrooms: 0 };
        expect(programmeHeadroom(sparse, FOUNDER_PLATE_M2, 'ground', 0)).toBeNull();
    });

    it('a brief that SPENDS its plate is not offered anything either', () => {
        // The raw 2-bed / 1-bath brief with its public set grosses to ~85 m². On a plate
        // that size there is nothing worth saying, so nothing is said (the offer fires
        // only above OFFER_MIN_SPARE_FRACTION of the plate).
        expect(programmeHeadroom(FOUNDER_BRIEF, 95, 'ground', 0)).toBeNull();
    });

    it('is deterministic (ADR-0061) — identical inputs → identical rooms', () => {
        const again = generateHouseLayout(plate(FOUNDER_PLATE_M2, 22), FOUNDER_BRIEF, C, W, { storeyCount: 1 });
        const sig = (res: typeof r) => (res.perStoreyLayout[0]?.rooms ?? [])
            .map(rm => `${rm.type}:${rm.area.toFixed(4)}`).join(',');
        expect(sig(again)).toEqual(sig(r));
    });
});
