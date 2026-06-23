// Residential building (multi-family) — Slice A / Tracker P6.1 — packer tests.
//
// TEST-FIRST. Covers the acceptance row (audit §6.1 + tracker P6.1):
//  - N (count) derived for various net areas;
//  - the mix honours ONLY the enabled typologies;
//  - every chosen apartment's targetAreaM2 ∈ [min,max] band;
//  - the T1→1bed … T4→4bed ApartmentProgram bedroom counts are correct;
//  - deterministic-repeat (same input → byte-identical output);
//  - soft-fail (return {status:'rejected'} — never throw) when the net area
//    cannot host even one min-area apartment of any enabled typology.

import { describe, it, expect } from 'vitest';
import {
    packApartments,
    type ApartmentPackInput,
    type ApartmentPackResult,
    typologyBedrooms,
} from '../apartmentPacker';

function input(over: Partial<ApartmentPackInput> = {}): ApartmentPackInput {
    return {
        levelIndex: 3,
        netAreaM2: 240,
        minApartmentAreaM2: 45,
        maxApartmentAreaM2: 120,
        typologies: { T1: false, T2: true, T3: true, T4: false },
        ...over,
    };
}

function ok(r: ApartmentPackResult): Extract<ApartmentPackResult, { status: 'ok' }> {
    if (r.status !== 'ok') throw new Error(`expected ok, got rejected: ${r.reason}`);
    return r;
}

describe('apartmentPacker — P6.1', () => {
    it('derives N for a large net area and packs apartments', () => {
        const r = ok(packApartments(input({ netAreaM2: 240 })));
        expect(r.apartments.length).toBeGreaterThanOrEqual(2);
        // Sum of target areas never exceeds the net buildable area.
        const sum = r.apartments.reduce((a, x) => a + x.targetAreaM2, 0);
        expect(sum).toBeLessThanOrEqual(240 + 1e-6);
    });

    it('every apartment target area is within the [min,max] band', () => {
        const r = ok(packApartments(input({ netAreaM2: 300, minApartmentAreaM2: 50, maxApartmentAreaM2: 110 })));
        for (const a of r.apartments) {
            expect(a.targetAreaM2).toBeGreaterThanOrEqual(50 - 1e-6);
            expect(a.targetAreaM2).toBeLessThanOrEqual(110 + 1e-6);
        }
    });

    it('honours only the enabled typologies (single typology)', () => {
        const r = ok(
            packApartments(input({ typologies: { T1: false, T2: true, T3: false, T4: false } })),
        );
        expect(r.apartments.every((a) => a.typology === 'T2')).toBe(true);
    });

    it('honours only the enabled typologies (mix never uses a disabled one)', () => {
        const r = ok(
            packApartments(input({ netAreaM2: 360, typologies: { T1: true, T2: false, T3: true, T4: false } })),
        );
        const used = new Set(r.apartments.map((a) => a.typology));
        expect(used.has('T2')).toBe(false);
        expect(used.has('T4')).toBe(false);
        for (const t of used) expect(t === 'T1' || t === 'T3').toBe(true);
    });

    it('maps T1→1bed … T4→4bed in the ApartmentProgram', () => {
        expect(typologyBedrooms('T1')).toBe(1);
        expect(typologyBedrooms('T2')).toBe(2);
        expect(typologyBedrooms('T3')).toBe(3);
        expect(typologyBedrooms('T4')).toBe(4);
        const r = ok(
            packApartments(input({ netAreaM2: 500, typologies: { T1: true, T2: true, T3: true, T4: true } })),
        );
        for (const a of r.apartments) {
            expect(a.program.bedrooms).toBe(typologyBedrooms(a.typology));
        }
    });

    it('the program bathroom/ensuite flags follow the typology table', () => {
        // Pin each typology with a single-typology pack so we can inspect its program.
        const progFor = (t: 'T1' | 'T2' | 'T3' | 'T4') => {
            const r = ok(
                packApartments(
                    input({
                        netAreaM2: 130,
                        minApartmentAreaM2: 35,
                        maxApartmentAreaM2: 150,
                        typologies: { T1: t === 'T1', T2: t === 'T2', T3: t === 'T3', T4: t === 'T4' },
                    }),
                ),
            );
            expect(r.apartments[0]!.typology).toBe(t);
            return r.apartments[0]!.program;
        };
        expect(progFor('T1').bathrooms).toBe(1);
        expect(progFor('T2').bathrooms).toBe(1);
        expect(progFor('T3').masterEnSuite).toBe(true);
        expect(progFor('T4').masterEnSuite).toBe(true);
        // T1/T2 do not force a master en-suite.
        expect(progFor('T1').masterEnSuite).toBe(false);
        expect(progFor('T2').masterEnSuite).toBe(false);
    });

    it('emits the §DIAG-APARTMENT-PACK diagnostic with level/N/mix/areas', () => {
        const r = ok(packApartments(input({ levelIndex: 5, netAreaM2: 240 })));
        expect(r.diagnostic).toContain('§DIAG-APARTMENT-PACK');
        expect(r.diagnostic).toContain('level=5');
        expect(r.diagnostic).toContain(`N=${r.apartments.length}`);
        expect(r.diagnostic).toContain('mix=[');
        expect(r.diagnostic).toContain('areas=[');
    });

    it('is deterministic — same input twice → identical output', () => {
        const a = packApartments(input({ netAreaM2: 333 }));
        const b = packApartments(input({ netAreaM2: 333 }));
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    it('soft-fails (rejected, not throw) when net area cannot host one min apartment', () => {
        // Smallest enabled typology is T3 (min 80 here); 40 m² net cannot host it.
        const r = packApartments(
            input({
                netAreaM2: 40,
                minApartmentAreaM2: 80,
                maxApartmentAreaM2: 120,
                typologies: { T1: false, T2: false, T3: true, T4: false },
            }),
        );
        expect(r.status).toBe('rejected');
        if (r.status === 'rejected') {
            expect(r.reason).toMatch(/net area/i);
            expect(r.diagnostic).toContain('status=rejected');
        }
    });

    it('soft-fails when no typology is enabled', () => {
        const r = packApartments(input({ typologies: { T1: false, T2: false, T3: false, T4: false } }));
        expect(r.status).toBe('rejected');
    });

    it('soft-fails when net area is non-positive', () => {
        const r = packApartments(input({ netAreaM2: 0 }));
        expect(r.status).toBe('rejected');
    });

    it('clamps a single-typology pack so each apartment stays in the user band', () => {
        // Net 240, only T2 enabled (engine band 55-80), user band 45-120.
        const r = ok(packApartments(input({ netAreaM2: 240, typologies: { T1: false, T2: true, T3: false, T4: false } })));
        // Effective band = intersection of user [45,120] and T2 engine [55,80] = [55,80].
        for (const a of r.apartments) {
            expect(a.targetAreaM2).toBeGreaterThanOrEqual(55 - 1e-6);
            expect(a.targetAreaM2).toBeLessThanOrEqual(80 + 1e-6);
        }
    });

    it('rejects when the user band excludes every enabled typology engine band', () => {
        // Only T4 enabled (engine band 110-150) but user max is 100 → empty intersection.
        const r = packApartments(
            input({
                netAreaM2: 400,
                minApartmentAreaM2: 45,
                maxApartmentAreaM2: 100,
                typologies: { T1: false, T2: false, T3: false, T4: true },
            }),
        );
        expect(r.status).toBe('rejected');
    });
});
