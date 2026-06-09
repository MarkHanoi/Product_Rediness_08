// Casa Unifamiliar — §HOUSE-PLATE-PROGRAM-FLOOR (A.21.D25 Defect 2) tests.
//
// The founder hit "a generated multi-storey HOUSE barely subdivides — one ~165 m²
// Room 00-001 + almost no other rooms". ROOT CAUSE: a SPARSE captured brief made
// the frozen single-plate engine stretch one or two rooms to fill the whole plate.
// FIX: `enrichStoreyProgramToPlate` raises (never lowers) each storey's programme to
// a sensible house room set sized to its plate, so a ~150–170 m² plate produces a
// FULL room set — never one giant room. These tests pin that invariant + guard the
// normal multi-storey case against regression.

import { describe, expect, it } from 'vitest';
import {
    generateHouseLayout,
    enrichStoreyProgramToPlate,
} from '../src/workflows/houseLayout/index.js';
import { houseStoreyBand } from '../src/workflows/houseLayout/houseEnvelope.js';
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

/** Total rooms across every storey of a generated house. */
function totalRooms(result: ReturnType<typeof generateHouseLayout>): number {
    return result.perStoreyLayout.reduce((n, o) => n + o.rooms.length, 0);
}

// The sparse brief that reproduced the founder's bug: a near-empty programme.
const SPARSE: ApartmentProgram = {
    bedrooms: 0, bathrooms: 0, masterEnSuite: false,
    openPlanKitchenDining: false, livingRoom: true, entranceHall: false,
};
// A genuinely empty brief (no living, no beds) — the worst case ("kitchen blob").
const EMPTY: ApartmentProgram = {
    bedrooms: 0, bathrooms: 0, masterEnSuite: false,
    openPlanKitchenDining: false, livingRoom: false, entranceHall: false,
};
// The well-formed default brief.
const FULL: ApartmentProgram = {
    bedrooms: 3, bathrooms: 2, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};

describe('§HOUSE-PLATE-PROGRAM-FLOOR — Defect 2 (one giant room)', () => {
    it('a ~165 m² single-storey house from an EMPTY brief subdivides into a full room set (≥6 rooms, not 1)', () => {
        const r = generateHouseLayout(plate(165, 15), EMPTY, C, W, { storeyCount: 1 });
        expect(r.perStoreyLayout).toHaveLength(1);
        // The bug produced exactly ONE room (the whole plate). The floor guarantees
        // a real house room set.
        expect(r.perStoreyLayout[0]!.rooms.length).toBeGreaterThanOrEqual(6);
    });

    it('a ~165 m² single-storey house from a SPARSE brief subdivides into ≥6 rooms', () => {
        const r = generateHouseLayout(plate(165, 15), SPARSE, C, W, { storeyCount: 1 });
        expect(r.perStoreyLayout[0]!.rooms.length).toBeGreaterThanOrEqual(6);
    });

    it('a 150–170 m² 2-storey house from a SPARSE brief gives EVERY storey a real room set (no 1-room storey)', () => {
        for (const area of [150, 160, 170]) {
            const r = generateHouseLayout(plate(area, 14), SPARSE, C, W, { storeyCount: 2 });
            expect(r.perStoreyLayout).toHaveLength(2);
            for (const opt of r.perStoreyLayout) {
                // No storey is left as ONE giant room.
                expect(opt.rooms.length).toBeGreaterThanOrEqual(3);
            }
            // The whole house has a sensible total (a real multi-room home).
            expect(totalRooms(r)).toBeGreaterThanOrEqual(10);
        }
    });

    it('the GROUND floor always reads as a home (living + kitchen present) even from an empty brief', () => {
        const r = generateHouseLayout(plate(165, 15), EMPTY, C, W, { storeyCount: 2 });
        const groundTypes = r.perStoreyLayout[0]!.rooms.map(rm => rm.type);
        expect(groundTypes).toContain('living');
        expect(groundTypes).toContain('kitchen');
    });

    it('the UPPER floor fills with bedrooms (private level) from an empty brief', () => {
        const r = generateHouseLayout(plate(165, 15), EMPTY, C, W, { storeyCount: 2 });
        const upperTypes = r.perStoreyLayout[1]!.rooms.map(rm => rm.type);
        expect(upperTypes).toContain('bedroom');
        // Upper storeys never get a kitchen (SPEC-CASA §3).
        expect(upperTypes).not.toContain('kitchen');
    });

    it('§LANDING-NOT-HALL (G14): the UPPER floor has NO entrance hall but DOES have stair-arrival circulation', () => {
        // The founder bug: an upper storey minted a `hall` named "Entrance Hall",
        // which is architecturally impossible (the front door — hence the entrance
        // hall — can only land on the ground floor). The upper storey must instead
        // have a LANDING — the engine's `corridor` (named "Landing" by the executor).
        for (const brief of [EMPTY, SPARSE, FULL]) {
            const r = generateHouseLayout(plate(165, 15), brief, C, W, { storeyCount: 2 });
            const upper = r.perStoreyLayout[1]!.rooms;
            const upperTypes = upper.map(rm => rm.type);
            // No upper-floor entrance hall.
            expect(upperTypes).not.toContain('hall');
            // No upper-floor room is named "Entrance Hall".
            expect(upper.map(rm => rm.name)).not.toContain('Entrance Hall');
            // The stair arrives at circulation — the engine's `corridor`.
            expect(upperTypes).toContain('corridor');
        }
    });

    it('§LANDING-NOT-HALL (G14): the GROUND floor STILL keeps its entrance hall', () => {
        // The fix is upper-only — the ground (entrance) floor must keep its hall.
        const r = generateHouseLayout(plate(165, 15), FULL, C, W, { storeyCount: 2 });
        const groundTypes = r.perStoreyLayout[0]!.rooms.map(rm => rm.type);
        expect(groundTypes).toContain('hall');
    });

    it('§LANDING-NOT-HALL (G14): a 3-storey house has a hall ONLY on the ground, NOT on either upper floor', () => {
        const r = generateHouseLayout(plate(165, 15), FULL, C, W, { storeyCount: 3 });
        expect(r.perStoreyLayout).toHaveLength(3);
        expect(r.perStoreyLayout[0]!.rooms.map(rm => rm.type)).toContain('hall');
        expect(r.perStoreyLayout[1]!.rooms.map(rm => rm.type)).not.toContain('hall');
        expect(r.perStoreyLayout[2]!.rooms.map(rm => rm.type)).not.toContain('hall');
    });

    it('is deterministic — same sparse input → identical room counts', () => {
        const a = generateHouseLayout(plate(165, 15), SPARSE, C, W, { storeyCount: 2 });
        const b = generateHouseLayout(plate(165, 15), SPARSE, C, W, { storeyCount: 2 });
        expect(a.perStoreyLayout.map(o => o.rooms.length))
            .toEqual(b.perStoreyLayout.map(o => o.rooms.length));
    });
});

describe('§HOUSE-GROUND-FILL — A.21.D28 #4 (multi-storey ground = one giant room)', () => {
    // The founder hit a live 2-storey house whose ~167.9 m² GROUND floor read as ONE
    // room ("Living Room / Bedroom 2 / Corridor / Bathroom / Kitchen / Dining") while
    // the UPPER floor subdivided correctly. Root cause: the multi-storey ground was
    // left with only the sparse captured brief (growBedrooms was false there) so the
    // frozen engine stretched a few rooms across the whole plate. The fix fills the
    // ground plate with ground-appropriate rooms (a guest bedroom + bath) so it has
    // real interior partitions and reads as a home.
    const BIG_GROUND = plate(167.9, 16.79);   // the founder's live plate

    it('a ~168 m² 2-storey GROUND floor from a SPARSE brief gets a real room set (≥5 rooms)', () => {
        const r = generateHouseLayout(BIG_GROUND, SPARSE, C, W, { storeyCount: 2 });
        // The ground floor must NOT be one (or two) giant stretched rooms.
        expect(r.perStoreyLayout[0]!.rooms.length).toBeGreaterThanOrEqual(5);
    });

    it('a ~168 m² 2-storey GROUND floor from an EMPTY brief gets a real room set (≥5 rooms)', () => {
        const r = generateHouseLayout(BIG_GROUND, EMPTY, C, W, { storeyCount: 2 });
        expect(r.perStoreyLayout[0]!.rooms.length).toBeGreaterThanOrEqual(5);
        const groundTypes = r.perStoreyLayout[0]!.rooms.map(rm => rm.type);
        expect(groundTypes).toContain('living');
        expect(groundTypes).toContain('kitchen');
        // The ground gets at least one guest bedroom (a real enclosed partitioned
        // room) so the plate isn't stretched across the public set.
        expect(groundTypes).toContain('bedroom');
    });

    it('the multi-storey GROUND floor produces interior partition walls (≥1 non-external)', () => {
        // Distinct rooms ⇒ shared interior walls. The merge defect produced ~0
        // interior partitions on the ground; a real room set produces several.
        const r = generateHouseLayout(BIG_GROUND, SPARSE, C, W, { storeyCount: 2 });
        const interior = r.perStoreyLayout[0]!.walls.filter(w => !w.isExternal);
        expect(interior.length).toBeGreaterThanOrEqual(1);
    });

    it('enrichStoreyProgramToPlate(growGroundRooms) fills a sparse ground plate', () => {
        const out = enrichStoreyProgramToPlate(EMPTY, 167.9, 'ground', { growGroundRooms: true });
        expect(out.livingRoom).toBe(true);
        expect(out.bedrooms).toBeGreaterThanOrEqual(1);     // a guest bedroom appears
        expect(out.bathrooms).toBeGreaterThanOrEqual(1);
        // The master/en-suite stays UPSTAIRS — never added to the ground here.
        expect(out.masterEnSuite).toBe(false);
    });

    it('growGroundRooms never balloons the ground past the low guest-bedroom cap', () => {
        const out = enrichStoreyProgramToPlate(EMPTY, 1000, 'ground', { growGroundRooms: true });
        expect(out.bedrooms).toBeLessThanOrEqual(2);        // MAX_GROUND_FILL_BEDROOMS
    });

    it('growGroundRooms keeps an ALLOCATED single guest bedroom (does not add a 2nd) for a normal brief', () => {
        // A normal multi-bedroom house keeps its ONE ground guest bedroom; bedrooms
        // live upstairs. The fill must not invent a second ground bedroom.
        const groundOfFull = { ...FULL, bedrooms: 1, bathrooms: 1, masterEnSuite: false };
        const out = enrichStoreyProgramToPlate(groundOfFull, 167.9, 'ground', { growGroundRooms: true });
        expect(out.bedrooms).toBe(1);
    });

    it('is deterministic for the ground-fill path', () => {
        const a = generateHouseLayout(BIG_GROUND, SPARSE, C, W, { storeyCount: 2 });
        const b = generateHouseLayout(BIG_GROUND, SPARSE, C, W, { storeyCount: 2 });
        expect(a.perStoreyLayout.map(o => o.rooms.length))
            .toEqual(b.perStoreyLayout.map(o => o.rooms.length));
    });
});

describe('§HOUSE-PLATE-PROGRAM-FLOOR — no regression on the well-formed brief', () => {
    it('the normal 3-bed 2-storey GROUND floor is unchanged (bedrooms stay upstairs)', () => {
        const r = generateHouseLayout(plate(165, 15), FULL, C, W, { storeyCount: 2 });
        const groundTypes = r.perStoreyLayout[0]!.rooms.map(rm => rm.type);
        // Ground keeps its single guest bedroom + the public set — NOT stuffed full.
        expect(groundTypes.filter(t => t === 'bedroom' || t === 'master').length).toBeLessThanOrEqual(1);
        expect(groundTypes).toContain('living');
        expect(groundTypes).toContain('kitchen');
    });

    it('every storey of a normal 3-bed house still produces a full room set', () => {
        const r = generateHouseLayout(plate(165, 15), FULL, C, W, { storeyCount: 2 });
        for (const opt of r.perStoreyLayout) expect(opt.rooms.length).toBeGreaterThanOrEqual(5);
    });
});

describe('enrichStoreyProgramToPlate — pure unit', () => {
    it('never LOWERS a user-stated count (it is a floor, not a cap)', () => {
        const out = enrichStoreyProgramToPlate({ ...FULL, bedrooms: 4 }, 165, 'upper', { growBedrooms: true });
        expect(out.bedrooms).toBeGreaterThanOrEqual(4);
        expect(out.bathrooms).toBeGreaterThanOrEqual(FULL.bathrooms);
    });

    it('guarantees the GROUND public set (living + kitchen + dining + hall)', () => {
        const out = enrichStoreyProgramToPlate(EMPTY, 165, 'ground');
        expect(out.livingRoom).toBe(true);
        expect(out.entranceHall).toBe(true);
        expect(out.includeKitchen).not.toBe(false);
        expect(out.openPlanKitchenDining).toBe(true);
    });

    it('guarantees the UPPER private set (≥1 bedroom, ≥1 bath, no kitchen, NO entrance hall)', () => {
        const out = enrichStoreyProgramToPlate(EMPTY, 165, 'upper');
        expect(out.bedrooms).toBeGreaterThanOrEqual(1);
        expect(out.bathrooms).toBeGreaterThanOrEqual(1);
        expect(out.includeKitchen).toBe(false);
        // §LANDING-NOT-HALL (G14) — an upper storey never mints an entrance hall;
        // the stair arrives at the `corridor` (guaranteed by beds+baths ≥ 1).
        expect(out.entranceHall).toBe(false);
    });

    it('§LANDING-NOT-HALL (G14): an upper enrich does NOT add a hall even when the brief had one', () => {
        // A whole-house brief WITH a hall must not leak that hall onto an upper storey.
        const out = enrichStoreyProgramToPlate({ ...FULL, entranceHall: true }, 165, 'upper', { growBedrooms: true });
        expect(out.entranceHall).toBe(false);
    });

    it('without growBedrooms it only guarantees the SET (does not balloon bedrooms)', () => {
        const out = enrichStoreyProgramToPlate(EMPTY, 165, 'upper', { growBedrooms: false });
        expect(out.bedrooms).toBe(1);   // floor only
    });

    it('grows the programme so its gross target approaches the plate (fills it)', () => {
        const out = enrichStoreyProgramToPlate(EMPTY, 165, 'upper', { growBedrooms: true });
        const band = houseStoreyBand({ program: out, grossAreaM2: 165 });
        // After growth the comfortable gross target should be a real fraction of the
        // plate — not the tiny single-room programme that produced a giant room.
        expect(band.grossTargetM2).toBeGreaterThan(165 * 0.5);
    });

    it('respects the bedroom cap (never an HMO) and is bounded', () => {
        const out = enrichStoreyProgramToPlate(EMPTY, 1000, 'upper', { growBedrooms: true });
        expect(out.bedrooms).toBeLessThanOrEqual(5);
    });

    it('a zero/degenerate plate area is a safe pass-through', () => {
        const out = enrichStoreyProgramToPlate(FULL, 0, 'ground', { growBedrooms: true });
        expect(out.bedrooms).toBe(FULL.bedrooms);
    });

    it('is deterministic', () => {
        const a = enrichStoreyProgramToPlate(SPARSE, 165, 'upper', { growBedrooms: true });
        const b = enrichStoreyProgramToPlate(SPARSE, 165, 'upper', { growBedrooms: true });
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });
});
