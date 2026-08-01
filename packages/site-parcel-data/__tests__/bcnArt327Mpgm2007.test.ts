// §L-660 — the Barcelona MPGM of 02-03-2007 (DOGC 4893, 29-05-2007) restating PGM Arts. 327.2a and
// 328.2a, transcribed from `PGM-NNUU-metropolitana.pdf` PDF pp. 277 / 278.
//
// WHAT THESE TESTS ARE FOR, AND WHAT THEY DELIBERATELY DO NOT DO
// -------------------------------------------------------------
// They do NOT assert that the modification is in force — that is an L-449 signature the founder has
// not given (`docs/…/08019-barcelona/L-660-ART-327-328-MPGM-2007-FOUNDER-DECISION.md`). They assert
// two other things, and both are the kind of thing a test is uniquely good at:
//
//   1. **THE TRANSCRIPTION IS PINNED.** Six metre values were recovered from a raster because every
//      text extractor drops the digits on that page. A transcription that can silently drift is
//      worse than none — the next person would have no way to tell a typo from the source.
//   2. **IT IS NOT WIRED.** `applied` is false and the shipped resolvers still answer with the BASE
//      table. This is the safety property of the whole change: the numbers are in the repo so the
//      founder can decide, and NOTHING reads them until that decision is made. A test is the only
//      thing that keeps "prepared" from quietly becoming "applied".
//
// The structural assertions in §3 are the load-bearing ones for the impact analysis: because the
// bands and storey counts are identical between the two tables, NO parcel changes band or storey
// count. That claim is asserted here rather than merely written down.

import { describe, it, expect } from 'vitest';
import {
    BCN_ALCADA_REGULADORA_TABLE,
    BCN_ART327_MPGM_2007,
    BCN_ART327_MPGM_2007_BAND_DELTA,
    BCN_ART328_MPGM_2007_BANDS,
    BCN_STOREY_MODULE_M,
    resolveAlcadaReguladora,
} from '../src/rulepacks/bcnAlcadaReguladora.js';
import {
    BCN_ALCADA_SEMIINTENSIVA_TABLE,
    resolveAlcadaSemiintensiva,
} from '../src/rulepacks/bcnAlcadaSemiintensiva.js';

describe('§L-660 — the 2007 modification is TRANSCRIBED but NOT APPLIED', () => {
    it('is explicitly flagged as not applied', () => {
        // The single most important assertion in this file. Flipping `applied` is a signed legal
        // act; if it ever flips without the rest of this suite being rewritten, that is the bug.
        expect(BCN_ART327_MPGM_2007.applied).toBe(false);
    });

    it('leaves the SHIPPED Art. 327 resolver answering with the BASE metropolitan values', () => {
        // A 20 m official width — the standard Cerdà grid, PB+5. Base says 20,75; the modification
        // would say 22,40. We must still be publishing 20,75 until the founder signs.
        const r = resolveAlcadaReguladora(20, { trustedOfficialWidth: true });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.height_m).toBe(20.75);
        expect(r.height_m).not.toBe(22.4);
    });

    it('leaves the SHIPPED Art. 328 resolver answering with the BASE metropolitan values', () => {
        const r = resolveAlcadaSemiintensiva(20, { trustedOfficialWidth: true });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.height_m).toBe(16.7);
        expect(r.height_m).not.toBe(18.8);
    });

    it('keeps the modified bands out of the shipped tables entirely', () => {
        const shipped327 = BCN_ALCADA_REGULADORA_TABLE.map((b) => b.height_m);
        for (const b of BCN_ART327_MPGM_2007.bands) expect(shipped327).not.toContain(b.height_m);
        const shipped328 = BCN_ALCADA_SEMIINTENSIVA_TABLE.map((b) => b.height_m);
        for (const b of BCN_ART328_MPGM_2007_BANDS) expect(shipped328).not.toContain(b.height_m);
    });
});

describe('§L-660 — the transcription itself, pinned against the raster', () => {
    it('carries the instrument citation exactly as printed at PDF p.274', () => {
        expect(BCN_ART327_MPGM_2007.dogcNumber).toBe(4893);
        expect(BCN_ART327_MPGM_2007.dogcDate).toBe('2007-05-29');
        expect(BCN_ART327_MPGM_2007.approvedOn).toBe('2007-03-02');
        expect(BCN_ART327_MPGM_2007.approvedBy).toBe("Subcomissió d'Urbanisme del Municipi de Barcelona");
        expect(BCN_ART327_MPGM_2007.sourcePdfPage).toBe(277);
        // ⚠ NOT `certified`. We hold a transcription in a self-declared non-official compendium,
        // not DOGC 4893. Promoting this string without the binding text is the defect to catch.
        expect(BCN_ART327_MPGM_2007.evidence).toBe('located-in-non-official-compendium');
    });

    it('Art. 327.2a — the six alçades màximes, verbatim from PDF p.277', () => {
        expect(BCN_ART327_MPGM_2007.bands.map((b) => b.height_m)).toEqual([
            9.0, 12.35, 15.7, 19.05, 22.4, 25.75,
        ]);
        expect(BCN_ART327_MPGM_2007.bands.map((b) => b.floorsAboveGround)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('Art. 328.2a — the four alçades màximes, verbatim from PDF p.278', () => {
        expect(BCN_ART328_MPGM_2007_BANDS.map((b) => b.height_m)).toEqual([8.25, 12.0, 15.4, 18.8]);
        expect(BCN_ART328_MPGM_2007_BANDS.map((b) => b.floorsAboveGround)).toEqual([1, 2, 3, 4]);
    });

    it('§THE-3,05-VS-3,35-RECONCILIATION — the ladder steps 3,35 m and the storey MINIMUM is 3,05 m', () => {
        // The two quantities EXTRACTION-PROTOCOL Step 4 conflated when it rejected this table.
        // They are different quantities, they coexist in the same article, and the modification
        // changes one and not the other. Asserting both here makes the distinction non-losable.
        const heights = BCN_ART327_MPGM_2007.bands.map((b) => b.height_m);
        for (let i = 1; i < heights.length; i++) {
            expect(heights[i]! - heights[i - 1]!).toBeCloseTo(BCN_ART327_MPGM_2007.bandStep_m, 10);
        }
        expect(BCN_ART327_MPGM_2007.bandStep_m).toBe(3.35);
        // «L'alçada mínima de les plantes … serà de 3,05 m» — roman type on p.277, i.e. UNCHANGED
        // from the base article, whose own ladder step happens to equal it.
        expect(BCN_ART327_MPGM_2007.storeyMinimum_m).toBe(3.05);
        expect(BCN_ART327_MPGM_2007.storeyMinimum_m).toBe(BCN_STOREY_MODULE_M);
        expect(BCN_ART327_MPGM_2007.bandStep_m).not.toBe(BCN_ART327_MPGM_2007.storeyMinimum_m);
    });
});

describe('§L-660 — the impact is a pure per-band shift: NO parcel changes band or storey', () => {
    it('the modified Art. 327 table has IDENTICAL band boundaries and storey counts to the base', () => {
        // This is the whole impact analysis, as an assertion. If it ever fails, the "zero parcels
        // change band" conclusion in the founder packet is void and must be recomputed.
        expect(BCN_ART327_MPGM_2007.bands.length).toBe(BCN_ALCADA_REGULADORA_TABLE.length);
        BCN_ART327_MPGM_2007.bands.forEach((mod, i) => {
            const base = BCN_ALCADA_REGULADORA_TABLE[i]!;
            expect(mod.minWidth_m).toBe(base.minWidth_m);
            expect(mod.maxWidth_m).toBe(base.maxWidth_m);
            expect(mod.floorsAboveGround).toBe(base.floorsAboveGround);
            expect(mod.height_m).toBeGreaterThan(base.height_m); // and the metres always rise
        });
    });

    it('the modified Art. 328 table likewise', () => {
        expect(BCN_ART328_MPGM_2007_BANDS.length).toBe(BCN_ALCADA_SEMIINTENSIVA_TABLE.length);
        BCN_ART328_MPGM_2007_BANDS.forEach((mod, i) => {
            const base = BCN_ALCADA_SEMIINTENSIVA_TABLE[i]!;
            expect(mod.minWidth_m).toBe(base.minWidth_m);
            expect(mod.maxWidth_m).toBe(base.maxWidth_m);
            expect(mod.floorsAboveGround).toBe(base.floorsAboveGround);
            expect(mod.height_m).toBeGreaterThan(base.height_m);
        });
    });

    it('the published delta table agrees with both tables, band for band', () => {
        // The founder signs against these numbers, so they must not be able to drift away from the
        // tables they claim to compare.
        expect(BCN_ART327_MPGM_2007_BAND_DELTA.length).toBe(6);
        BCN_ART327_MPGM_2007_BAND_DELTA.forEach((row, i) => {
            const base = BCN_ALCADA_REGULADORA_TABLE[i]!;
            const mod = BCN_ART327_MPGM_2007.bands[i]!;
            expect(row.floorsAboveGround).toBe(base.floorsAboveGround);
            expect(row.base_m).toBe(base.height_m);
            expect(row.modified_m).toBe(mod.height_m);
            expect(row.delta_m).toBeCloseTo(mod.height_m - base.height_m, 10);
            // The headline claim of the impact analysis.
            expect(row.floorsChange).toBe(0);
        });
    });

    it('§ZERO-RECLASSIFICATION — no width anywhere on the axis lands in a different band', () => {
        const bandOf = (t: ReadonlyArray<{ minWidth_m: number; maxWidth_m: number }>, w: number) =>
            t.findIndex((b) => w >= b.minWidth_m && w < b.maxWidth_m);
        // Sweep the width axis at 5 cm, plus every exact boundary — the places a reclassification
        // could possibly hide.
        const probes = [0.01, 7.99, 8, 11.99, 12, 14.99, 15, 19.99, 20, 29.99, 30, 60, 1000];
        for (let w = 0.05; w <= 40; w += 0.05) probes.push(Math.round(w * 100) / 100);
        for (const w of probes) {
            expect(bandOf(BCN_ART327_MPGM_2007.bands, w)).toBe(bandOf(BCN_ALCADA_REGULADORA_TABLE, w));
            expect(bandOf(BCN_ART328_MPGM_2007_BANDS, w)).toBe(
                bandOf(BCN_ALCADA_SEMIINTENSIVA_TABLE, w),
            );
        }
    });

    it('§L-528-REOPENED — 22,40 m IS the modified PB+5 alçada reguladora, not a derived figure', () => {
        // The record this replaces said 22,40 m "was never a competing alçada reguladora". It is
        // literally a row of Art. 327.2a as modified. Pinned so the withdrawn identification
        // (20,75 + 1,65 cornice increment) cannot quietly return.
        const pb5 = BCN_ART327_MPGM_2007.bands.find((b) => b.floorsAboveGround === 5);
        expect(pb5?.height_m).toBe(22.4);
        expect(pb5?.minWidth_m).toBe(20);
        expect(pb5?.maxWidth_m).toBe(30);
    });
});
