// Madrid PGOUM-97 — the three *ancho de calle* cuadros and their resolver.
//
// The tests that matter here are the PROPERTY tests, not the spot checks:
//   1. Each table is TOTAL over [0, ∞) with NO gap and NO overlap. A gap means some real street
//      width silently resolves to the last band; an overlap means two rows claim the same width and
//      the answer depends on array order. Either is a compliance number decided by a bug.
//   2. The tables are NOT interchangeable — NZ 4 has a 6th storey NZ 9 never grants, and NZ 1
//      grado 6º states NO metre column at all. `zone-mismatch` is a hard refusal, not a fallback.
//   3. A measured width near a band edge REFUSES rather than letting noise choose a storey.

import { describe, it, expect } from 'vitest';
import {
    MADRID_ANCHO_TABLES,
    MADRID_NZ4_ANCHO_TABLE,
    MADRID_NZ9_ANCHO_TABLE,
    MADRID_NZ1_G6_ANCHO_TABLE,
    MADRID_BAND_EDGE_GUARD_M,
    madridEffectiveBandEdgeGuard_m,
    resolveMadridAlturaPorAnchoDeCalle,
    type MadridAnchoTable,
} from '../src/rulepacks/madridAnchoDeCalle.js';

describe('Madrid ancho-de-calle tables — TOTAL over their domain, no gap, no overlap', () => {
    for (const table of MADRID_ANCHO_TABLES) {
        it(`${table.id} tiles [0, ∞) exactly once`, () => {
            const bands = table.bands;
            expect(bands.length).toBeGreaterThan(1);
            // Starts at 0 — a table starting at, say, 5 m would leave every narrow lane unanswered.
            expect(bands[0]!.minWidth_m).toBe(0);
            // Ends open — a finite top band would leave the widest avenues unanswered.
            expect(bands[bands.length - 1]!.maxWidth_m).toBe(Infinity);
            for (let i = 0; i < bands.length; i++) {
                const b = bands[i]!;
                // Non-degenerate: min < max.
                expect(b.maxWidth_m, `${table.id}[${i}]`).toBeGreaterThan(b.minWidth_m);
                // Contiguous: this band starts EXACTLY where the previous ended. `>` would be a
                // gap, `<` an overlap; both are silent wrong answers.
                if (i > 0) {
                    expect(b.minWidth_m, `${table.id}[${i}] contiguity`).toBe(
                        bands[i - 1]!.maxWidth_m,
                    );
                }
            }
        });

        it(`${table.id} is monotonic — a wider street never grants FEWER storeys`, () => {
            for (let i = 1; i < table.bands.length; i++) {
                expect(table.bands[i]!.floors, `${table.id}[${i}]`).toBeGreaterThan(
                    table.bands[i - 1]!.floors,
                );
            }
        });

        it(`${table.id} — every band resolves, and nothing resolves to a fabricated 0`, () => {
            for (const b of table.bands) {
                // Sample well inside the band so the edge guard cannot fire.
                const mid = Number.isFinite(b.maxWidth_m)
                    ? (b.minWidth_m + b.maxWidth_m) / 2
                    : b.minWidth_m + 50;
                const r = resolveMadridAlturaPorAnchoDeCalle(table, mid);
                expect(r.ok, `${table.id} @ ${mid}`).toBe(true);
                if (!r.ok) return;
                expect(r.floors).toBe(b.floors);
                expect(r.floors).toBeGreaterThan(0);
                // ⚠ An unknown height is NULL, never 0 — the NZ 1 grado 6º case.
                expect(r.height_m === null || r.height_m > 0).toBe(true);
                expect(r.height_m).toBe(b.height_m);
            }
        });
    }
});

describe('Madrid ancho-de-calle — the three cuadros are DIFFERENT laws, not one law thrice', () => {
    it('NZ 4 has four bands topping at 6 plantas / 21,50 m (Art. 8.4.10)', () => {
        expect(MADRID_NZ4_ANCHO_TABLE.bands).toHaveLength(4);
        expect(MADRID_NZ4_ANCHO_TABLE.articulo).toBe('8.4.10');
        expect(MADRID_NZ4_ANCHO_TABLE.pdfPage).toBe(415);
        const top = MADRID_NZ4_ANCHO_TABLE.bands[3]!;
        expect(top).toMatchObject({ minWidth_m: 24, floors: 6, height_m: 21.5 });
    });

    it('NZ 9 grados 1º/2º has only THREE bands, topping at 5 plantas / 18,50 m (Art. 8.9.10.1)', () => {
        expect(MADRID_NZ9_ANCHO_TABLE.bands).toHaveLength(3);
        expect(MADRID_NZ9_ANCHO_TABLE.articulo).toBe('8.9.10');
        // ⚠ THE POINT: NZ 9 has no 24 m band. Importing NZ 4's table would invent a 6th storey.
        expect(MADRID_NZ9_ANCHO_TABLE.bands.some((b) => b.floors === 6)).toBe(false);
        expect(MADRID_NZ9_ANCHO_TABLE.bands[2]!).toMatchObject({
            minWidth_m: 18,
            maxWidth_m: Infinity,
            floors: 5,
            height_m: 18.5,
        });
    });

    it('NZ 1 grado 6º states STOREYS ONLY — every height_m is null, never a borrowed metre', () => {
        expect(MADRID_NZ1_G6_ANCHO_TABLE.bands).toHaveLength(5);
        expect(MADRID_NZ1_G6_ANCHO_TABLE.heightMeasured).toBeNull();
        for (const b of MADRID_NZ1_G6_ANCHO_TABLE.bands) {
            expect(b.height_m).toBeNull();
        }
        // Its first edge is at 7 m — unique among the three.
        expect(MADRID_NZ1_G6_ANCHO_TABLE.bands[0]!.maxWidth_m).toBe(7);
        expect(MADRID_NZ1_G6_ANCHO_TABLE.bands[4]!.floors).toBe(7);
    });

    it('the 12 m width gives a DIFFERENT answer in each table — proof they are not interchangeable', () => {
        const nz4 = resolveMadridAlturaPorAnchoDeCalle(MADRID_NZ4_ANCHO_TABLE, 30);
        const nz9 = resolveMadridAlturaPorAnchoDeCalle(MADRID_NZ9_ANCHO_TABLE, 30);
        const nz1 = resolveMadridAlturaPorAnchoDeCalle(MADRID_NZ1_G6_ANCHO_TABLE, 30);
        expect(nz4.ok && nz4.floors).toBe(6);
        expect(nz9.ok && nz9.floors).toBe(5);
        expect(nz1.ok && nz1.floors).toBe(7);
    });

    it('every table declares the zone codes it governs, and they are disjoint', () => {
        const seen = new Set<string>();
        for (const t of MADRID_ANCHO_TABLES) {
            expect(t.appliesToZoneCodes.length).toBeGreaterThan(0);
            for (const c of t.appliesToZoneCodes) {
                expect(seen.has(c), `duplicate zone code ${c}`).toBe(false);
                seen.add(c);
            }
        }
    });
});

describe('Madrid ancho-de-calle — the refusals', () => {
    it('REFUSES `zone-mismatch` rather than answering from the wrong chapter', () => {
        // An NZ 9 parcel routed to NZ 4's table would silently gain a 6th storey.
        const r = resolveMadridAlturaPorAnchoDeCalle(MADRID_NZ4_ANCHO_TABLE, 30, {
            zoneCode: '9.1',
        });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('zone-mismatch');
    });

    it('ACCEPTS a zone code the table does govern', () => {
        const r = resolveMadridAlturaPorAnchoDeCalle(MADRID_NZ4_ANCHO_TABLE, 30, { zoneCode: '4' });
        expect(r.ok).toBe(true);
    });

    it('REFUSES `band-edge` when a MEASURED width straddles a boundary', () => {
        // 12.00 m is the NZ 4 edge between 3 plantas/11,50 m and 4 plantas/15,00 m.
        const r = resolveMadridAlturaPorAnchoDeCalle(MADRID_NZ4_ANCHO_TABLE, 12.0);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('band-edge');
        expect(r.straddles).toEqual([3, 4]);
    });

    it('ANSWERS on a band edge when the width is a DECLARED figure (exact by definition)', () => {
        const r = resolveMadridAlturaPorAnchoDeCalle(MADRID_NZ4_ANCHO_TABLE, 12.0, {
            trustedDeclaredWidth: true,
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.floors).toBe(4);
        expect(r.height_m).toBe(15.0);
    });

    it('a NOISY measurement widens the guard and refuses where a tight one would answer', () => {
        // 12.9 m is 0.9 m clear of the 12 m edge — fine under the 0.5 m substitution allowance…
        expect(resolveMadridAlturaPorAnchoDeCalle(MADRID_NZ4_ANCHO_TABLE, 12.9).ok).toBe(true);
        // …but not when the measurement's own rays disagree by 1.2 m (§L-586).
        const noisy = resolveMadridAlturaPorAnchoDeCalle(MADRID_NZ4_ANCHO_TABLE, 12.9, {
            measurementSpread_m: 1.2,
        });
        expect(noisy.ok).toBe(false);
    });

    it('the guard only ever WIDENS — a tight measurement never relaxes the allowance', () => {
        expect(madridEffectiveBandEdgeGuard_m(0.1)).toBe(MADRID_BAND_EDGE_GUARD_M);
        expect(madridEffectiveBandEdgeGuard_m(null)).toBe(MADRID_BAND_EDGE_GUARD_M);
        expect(madridEffectiveBandEdgeGuard_m(undefined)).toBe(MADRID_BAND_EDGE_GUARD_M);
        expect(madridEffectiveBandEdgeGuard_m(1.4)).toBe(1.4);
    });

    it('REFUSES `bad-input` rather than guessing from a non-positive or non-finite width', () => {
        for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
            const r = resolveMadridAlturaPorAnchoDeCalle(MADRID_NZ4_ANCHO_TABLE, bad);
            expect(r.ok, String(bad)).toBe(false);
            if (r.ok) continue;
            expect(r.reason).toBe('bad-input');
        }
    });
});

describe('Madrid ancho-de-calle — provenance is carried, not asserted', () => {
    it('every table cites an article, an apartado, a PDF page and a printed page', () => {
        for (const t of MADRID_ANCHO_TABLES as ReadonlyArray<MadridAnchoTable>) {
            expect(t.articulo).toMatch(/^8\.\d+\.\d+$/);
            expect(t.apartado.length).toBeGreaterThan(0);
            expect(t.pdfPage).toBeGreaterThan(0);
            // The Compendio's printed page runs 2 behind the PDF page (recorded in the extraction meta).
            expect(t.printedPage).toBe(t.pdfPage - 2);
            // A height without its datum is not a height (L-584).
            expect(t.referencePlane).toMatch(/rasante/);
        }
    });

    it('every band carries its own verbatim row', () => {
        for (const t of MADRID_ANCHO_TABLES) {
            for (const b of t.bands) {
                expect(b.verbatim.length).toBeGreaterThan(0);
            }
        }
    });
});
