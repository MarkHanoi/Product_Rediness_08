// §COR-MC-ANCHO — the MC per-street-width height table (Art. 13.5.3.1), resolved against a
// MEASURED width under the ADR-0287 band-edge guard.
//
// Mirrors `murciaAnchoDeCalle.test.ts`'s shape: the bands are STEPS (one metre can be a whole
// storey here — MC-1's bands are only 2 m apart in places), so what matters is the BOUNDARY and
// REFUSAL behaviour, not the middle of a band.

import { describe, it, expect } from 'vitest';
import {
    resolveCordobaMcHeightForWidth,
    cordobaMcResolvedPack,
    CORDOBA_MC_STREET_WIDTH_HEIGHT_TABLE,
    CORDOBA_MC_ADR0287_GUARD_M,
    CORDOBA_MC_HEIGHT_ARTICLE,
    CORDOBA_MC_FONDO_UNRESOLVED_RING,
} from '../src/rulepacks/esCordobaPGOU2001.js';

describe('§COR-MC-ANCHO — CORDOBA_MC_ADR0287_GUARD_M is the ADR-0287 2σ figure, not a guess', () => {
    it('equals 2·√(0.20² + 0.20²) from BOE-A-2015-11655 §7.2(e), ≈0.566 m', () => {
        expect(CORDOBA_MC_ADR0287_GUARD_M).toBeCloseTo(2 * Math.sqrt(0.2 ** 2 + 0.2 ** 2), 10);
        expect(CORDOBA_MC_ADR0287_GUARD_M).toBeGreaterThan(0.56);
        expect(CORDOBA_MC_ADR0287_GUARD_M).toBeLessThan(0.57);
    });
});

describe('§COR-MC-ANCHO — MC-1 (four bands: 8 / 10 / 14 / 16 m)', () => {
    it('a width safely inside a band resolves cleanly', () => {
        // 6 m is inside [0, 8], well clear of every boundary by more than the guard.
        const r = resolveCordobaMcHeightForWidth('MC-1', 6);
        expect(r).toMatchObject({
            ok: true,
            zone: 'MC-1',
            article: CORDOBA_MC_HEIGHT_ARTICLE,
            maxFloors: 3,
            maxHeight_m: 9.75,
            storeys: 'PB+2',
        });
    });

    it('a width just inside the THIRD band also resolves cleanly', () => {
        // 12 m sits between the 10 m and 14 m boundaries, > guard from both — so it is inside the
        // band bounded ABOVE by 14 m (the 10 m boundary is its LOWER edge, already passed).
        const r = resolveCordobaMcHeightForWidth('MC-1', 12);
        expect(r).toMatchObject({ ok: true, maxFloors: 5, maxHeight_m: 16.75, storeys: 'PB+4' });
    });

    it('⭐ ADR-0287 — a width within the guard of the 8 m boundary REFUSES, never guesses', () => {
        const justUnder = resolveCordobaMcHeightForWidth('MC-1', 8 - CORDOBA_MC_ADR0287_GUARD_M / 2);
        expect(justUnder).toMatchObject({ ok: false, reason: 'band-edge' });
        expect(!justUnder.ok && justUnder.straddles).toEqual([9.75, 12.75]);

        const justOver = resolveCordobaMcHeightForWidth('MC-1', 8 + CORDOBA_MC_ADR0287_GUARD_M / 2);
        expect(justOver).toMatchObject({ ok: false, reason: 'band-edge' });

        const exact = resolveCordobaMcHeightForWidth('MC-1', 8);
        expect(exact).toMatchObject({ ok: false, reason: 'band-edge' });
    });

    it('ADR-0287 checks EVERY boundary in the table, not only the first — 14 m also refuses', () => {
        const r = resolveCordobaMcHeightForWidth('MC-1', 14 + CORDOBA_MC_ADR0287_GUARD_M / 4);
        expect(r).toMatchObject({ ok: false, reason: 'band-edge' });
        expect(!r.ok && r.straddles).toEqual([16.75, 19.5]);
    });

    it('just clear of the guard on either side of 8 m, the correct band governs unambiguously', () => {
        const below = resolveCordobaMcHeightForWidth('MC-1', 8 - CORDOBA_MC_ADR0287_GUARD_M - 0.01);
        expect(below).toMatchObject({ ok: true, maxFloors: 3, maxHeight_m: 9.75 });
        const above = resolveCordobaMcHeightForWidth('MC-1', 8 + CORDOBA_MC_ADR0287_GUARD_M + 0.01);
        expect(above).toMatchObject({ ok: true, maxFloors: 4, maxHeight_m: 12.75 });
    });

    it('the open top band (>16 m) resolves to PB+6, arbitrarily far from any boundary', () => {
        const r = resolveCordobaMcHeightForWidth('MC-1', 1000);
        expect(r).toMatchObject({ ok: true, maxFloors: 7, maxHeight_m: 22.5, storeys: 'PB+6' });
    });
});

describe('§COR-MC-ANCHO — MC-2 / MC-4 (single 10 m boundary, shared band structure)', () => {
    it('MC-2 and MC-4 both refuse within the guard of their one boundary', () => {
        for (const zone of ['MC-2', 'MC-4'] as const) {
            const r = resolveCordobaMcHeightForWidth(zone, 10);
            expect(r).toMatchObject({ ok: false, reason: 'band-edge' });
        }
    });

    it('MC-2 resolves PB+2 below 10 m and PB+3 above it, clear of the guard', () => {
        expect(resolveCordobaMcHeightForWidth('MC-2', 5)).toMatchObject({ ok: true, maxFloors: 3, maxHeight_m: 9.75 });
        expect(resolveCordobaMcHeightForWidth('MC-2', 20)).toMatchObject({ ok: true, maxFloors: 4, maxHeight_m: 12.75 });
    });
});

describe('§COR-MC-ANCHO — bad input never guesses', () => {
    it('a non-finite / non-positive width refuses `bad-input`, not `no-band`', () => {
        expect(resolveCordobaMcHeightForWidth('MC-3', 0)).toMatchObject({ ok: false, reason: 'bad-input' });
        expect(resolveCordobaMcHeightForWidth('MC-3', -4)).toMatchObject({ ok: false, reason: 'bad-input' });
        expect(resolveCordobaMcHeightForWidth('MC-3', Number.NaN)).toMatchObject({ ok: false, reason: 'bad-input' });
        expect(resolveCordobaMcHeightForWidth('MC-3', Number.POSITIVE_INFINITY)).toMatchObject({
            ok: false, reason: 'bad-input',
        });
    });
});

describe('§COR-MC-ANCHO — determinism (same input ⇒ byte-identical output)', () => {
    it('is pure: repeated calls with the same width agree', () => {
        const a = resolveCordobaMcHeightForWidth('MC-3', 17);
        const b = resolveCordobaMcHeightForWidth('MC-3', 17);
        expect(a).toEqual(b);
    });
});

describe('§COR-MC-RESOLVED-PACK — height populated, footprint deliberately UNCHANGED', () => {
    it('carries the resolved height/floors into the zone, but keeps the structural-refusal geometricRule', () => {
        const resolved = resolveCordobaMcHeightForWidth('MC-1', 6);
        expect(resolved.ok).toBe(true);
        if (!resolved.ok) throw new Error('unreachable');
        const pack = cordobaMcResolvedPack('MC-1', resolved, 'CONSTRUCTED from Catastro block dissolve, test fixture');
        expect(pack.zones).toHaveLength(1);
        const zone = pack.zones[0]!;
        expect(zone.maxHeight_m).toBe(9.75);
        expect(zone.maxFloors).toBe(3);
        // ⚠ THE WHOLE POINT — height ≠ footprint. This pack must NOT claim the footprint is solved.
        expect(zone.geometricRule).toEqual({
            kind: 'explicit-area',
            ringRef: CORDOBA_MC_FONDO_UNRESOLVED_RING,
        });
        expect(zone.ordinanceRef).toMatch(/13\.5\.3\.1/);
        expect(zone.ordinanceRef).toMatch(/test fixture/);
    });

    it('MC-3 keeps its 3,50 FAR and MC-4 its 90 % coverage — unchanged from the base pack', () => {
        const mc3 = resolveCordobaMcHeightForWidth('MC-3', 5);
        const mc4 = resolveCordobaMcHeightForWidth('MC-4', 5);
        if (!mc3.ok || !mc4.ok) throw new Error('unreachable');
        expect(cordobaMcResolvedPack('MC-3', mc3, 'x').zones[0]!.plotRatioFAR).toBe(3.5);
        expect(cordobaMcResolvedPack('MC-4', mc4, 'x').zones[0]!.maxCoverage).toBe(0.9);
    });
});

describe('§COR-MC-ANCHO — the table itself is untouched by this file (ground truth)', () => {
    it('MC-1 still has exactly 5 rows and the last row is open-ended', () => {
        const bands = CORDOBA_MC_STREET_WIDTH_HEIGHT_TABLE['MC-1'];
        expect(bands).toHaveLength(5);
        expect(bands[bands.length - 1]!.maxStreetWidth_m).toBeNull();
    });
});
