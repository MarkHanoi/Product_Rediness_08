// Córdoba PGOU-2001 — THE OCR VERIFICATION LEDGER, AS A TEST.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `sources/VERIFICATION.md` §SIG-1 records that on 2026-08-01 every parameter of all 13 packed
// subzones was re-read from the PUBLISHER'S OWN PDFs and matched the shipped pack — 13/13 clean,
// zero wrong values. A markdown claim rots the moment someone edits the pack. This file makes that
// verification MACHINE-CHECKABLE: the table below is the SOURCE-VERIFIED value, transcribed from
// the rendered ordinance page, with its article. If anyone changes a shipped number without
// re-verifying against the ordinance, this test fails and names the article they must go read.
//
// ⚠ THIS IS NOT THE L-449 SIGN-OFF. It pins TRANSCRIPTION FIDELITY only. Publishing these numbers
// remains a legal act gated by `CORDOBA_ENVELOPE_VERIFIED` + a human signature. A green test here
// says "the pack says what the ordinance says", never "PRYZM may draw this".
//
// ⚠ HOW THE VERIFIED VALUES WERE READ (the method matters — see VERIFICATION.md §SIG-1):
// `O_PAS2` / `O_OA1` / `O_CTP1` / `O_MC` have a ZERO-CHARACTER text layer and `O_UAD3` uses subset
// CID fonts, so every value was read from a RENDERED RASTER (160 dpi; 380–400 dpi for the three
// contested clauses), never from `extract_text()`.
//
// P8/OTel: this module exports no functions — it is a spec file, so it adds no spans.

import { describe, it, expect } from 'vitest';
import {
    ES_CORDOBA_PGOU2001_PACK,
    CORDOBA_PGOU2001_ZONE_CODES,
} from '../src/rulepacks/esCordobaPGOU2001';

/** One source-verified parameter set, transcribed from the rendered ordinance page. */
interface VerifiedZone {
    readonly code: string;
    /** The PGOU article the value set comes from, and the page of the Texto Refundido. */
    readonly article: string;
    readonly maxHeight_m: number | null;
    readonly maxFloors: number | null;
    readonly plotRatioFAR: number | null;
    readonly maxCoverage: number | null;
    readonly front_m: number | null;
    readonly side_m: number | null;
    readonly rear_m: number | null;
}

/**
 * THE VERIFIED TABLE. Every row was read from the raster of the publisher's PDF on 2026-08-01.
 * `null` here means the ORDINANCE states no scalar (derived by algorithm, or a street-width table,
 * or an alignment zone) — never "not extracted" (C58 §1.7a).
 */
const SOURCE_VERIFIED: readonly VerifiedZone[] = [
    // ── Plurifamiliar Aislada, Art. 13.7 (O_PAS2.pdf, pp. 54–56) ─────────────────────────────
    // 13.7.2.1 FAR · 13.7.2.4 ocupación · 13.7.3.3 altura · 13.7.3.1.a front 3 m (all subzones)
    // 13.7.3.1.b «la separación a linderos privados será como mínimo, de 1/2 de la altura total» →
    // evaluated at max height: 12,75/2 = 6,375 · 19,50/2 = 9,75.
    { code: 'PAS-1', article: 'PGOU 13.7.2.1/13.7.2.4/13.7.3.1/13.7.3.3',
      maxHeight_m: 12.75, maxFloors: 4, plotRatioFAR: 1.2, maxCoverage: 0.4,
      front_m: 3, side_m: 6.375, rear_m: 6.375 },
    { code: 'PAS-2', article: 'PGOU 13.7.2.1/13.7.2.4/13.7.3.1/13.7.3.3',
      maxHeight_m: 12.75, maxFloors: 4, plotRatioFAR: 1.66, maxCoverage: 0.5,
      front_m: 3, side_m: 6.375, rear_m: 6.375 },
    { code: 'PAS-3', article: 'PGOU 13.7.2.1/13.7.2.4/13.7.3.1/13.7.3.3',
      maxHeight_m: 19.5, maxFloors: 6, plotRatioFAR: 2.0, maxCoverage: 0.4,
      front_m: 3, side_m: 9.75, rear_m: 9.75 },

    // ── Ordenación Abierta, Art. 13.6 (O_OA1.pdf, p. 52) ─────────────────────────────────────
    // 13.6.2.2 FAR · 13.6.2.3 «ocupación … 40% … en todas las plantas» · 13.6.3.1 «PB+3 (12,5 m) y
    // PB+6 (21 m de altura máxima)» → 21 m / 7 storeys · 13.6.3.3 «≥ 1/2 de la altura, mínimo 3 m»
    // → 10,5 m at max height. 13.6.3.2 alignment applies to OA-2 ONLY → OA-1 front null.
    { code: 'OA-1', article: 'PGOU 13.6.2.2/13.6.2.3/13.6.3.1/13.6.3.3',
      maxHeight_m: 21, maxFloors: 7, plotRatioFAR: 1.4, maxCoverage: 0.4,
      front_m: null, side_m: 10.5, rear_m: 10.5 },
    { code: 'OA-2', article: 'PGOU 13.6.2.2/13.6.2.3/13.6.3.1/13.6.3.2/13.6.3.3',
      maxHeight_m: 21, maxFloors: 7, plotRatioFAR: 1.6, maxCoverage: 0.4,
      front_m: 0, side_m: 10.5, rear_m: 10.5 },

    // ── Unifamiliar Adosada, Art. 13.9 (O_UAD3.pdf, pp. 63–64) ───────────────────────────────
    // 13.9.2.3 FAR · 13.9.2.2 ocupación · 13.9.3.5 «para todas las subzonas … PB+1, con un total de
    // 7 metros» · 13.9.3.2 front (table gives UAD-1 4 m, UAD-2 5 m; UAD-3 «vendrá dispuesta sobre la
    // alineación de vial» → 0) · 13.9.3.4 fondo · lateral = medianera (adosada) → 0.
    // ⚠ D1: 13.9.3.3 ALSO states a profundidad máxima edificable (16/18/16 m) that the pack does NOT
    // carry. Asserted as a known gap at the bottom of this file, so it cannot be forgotten.
    { code: 'UAD-1', article: 'PGOU 13.9.2.2/13.9.2.3/13.9.3.2/13.9.3.4/13.9.3.5',
      maxHeight_m: 7, maxFloors: 2, plotRatioFAR: 1.0, maxCoverage: 0.6,
      front_m: 4, side_m: 0, rear_m: 5 },
    { code: 'UAD-2', article: 'PGOU 13.9.2.2/13.9.2.3/13.9.3.2/13.9.3.4/13.9.3.5',
      maxHeight_m: 7, maxFloors: 2, plotRatioFAR: 0.7, maxCoverage: 0.4,
      front_m: 5, side_m: 0, rear_m: 6 },
    { code: 'UAD-3', article: 'PGOU 13.9.2.2/13.9.2.3/13.9.3.2/13.9.3.4/13.9.3.5',
      maxHeight_m: 7, maxFloors: 2, plotRatioFAR: 1.0, maxCoverage: 0.6,
      front_m: 0, side_m: 0, rear_m: 5 },

    // ── Colonia Tradicional Popular, Art. 13.8 (O_CTP1.pdf, pp. 57–58) ───────────────────────
    // 13.8.2.3 edificabilidad «resultante de la aplicación de las Normas de Composición» → DERIVED,
    // null. 13.8.2.5 ocupación step; 0.80 is the >125 m² value. 13.8.3.1 «PB+1, con un máximo de 7
    // metros». Alignment zone (13.8.2.1) → setbacks null; depth 16 m (13.8.2.4) rides the
    // geometricRule, asserted separately below.
    { code: 'CTP-1', article: 'PGOU 13.8.2.1/13.8.2.3/13.8.2.4/13.8.2.5/13.8.3.1',
      maxHeight_m: 7, maxFloors: 2, plotRatioFAR: null, maxCoverage: 0.8,
      front_m: null, side_m: null, rear_m: null },

    // ── Manzana Cerrada, Art. 13.5 (O_MC.pdf, pp. 49–51) ─────────────────────────────────────
    // 13.5.2.2 «Para MC-1, MC-2 y MC-4, no se fija edificabilidad neta … resultante de la aplicación
    // de las Normas de composición» → DERIVED null; «En MC-3 la edificabilidad neta será 3,50
    // m2/m2» → 3.5 (VERIFIED — exceeds the [0.2,3.0] range gate but is the real number).
    // 13.5.2.5.1º MC-1/2/3 plantas altas 70 % · 13.5.2.5.2º MC-4 plantas altas 90 %.
    // 13.5.3.1 altura = per-street-width TABLE → maxHeight/maxFloors null. 13.5.2.3 alignment.
    { code: 'MC-1', article: 'PGOU 13.5.2.2/13.5.2.3/13.5.2.5/13.5.3.1',
      maxHeight_m: null, maxFloors: null, plotRatioFAR: null, maxCoverage: 0.7,
      front_m: null, side_m: null, rear_m: null },
    { code: 'MC-2', article: 'PGOU 13.5.2.2/13.5.2.3/13.5.2.5/13.5.3.1',
      maxHeight_m: null, maxFloors: null, plotRatioFAR: null, maxCoverage: 0.7,
      front_m: null, side_m: null, rear_m: null },
    { code: 'MC-3', article: 'PGOU 13.5.2.2/13.5.2.3/13.5.2.5/13.5.3.1',
      maxHeight_m: null, maxFloors: null, plotRatioFAR: 3.5, maxCoverage: 0.7,
      front_m: null, side_m: null, rear_m: null },
    { code: 'MC-4', article: 'PGOU 13.5.2.2/13.5.2.3/13.5.2.5.2/13.5.3.1',
      maxHeight_m: null, maxFloors: null, plotRatioFAR: null, maxCoverage: 0.9,
      front_m: null, side_m: null, rear_m: null },
];

const zoneByCode = new Map(ES_CORDOBA_PGOU2001_PACK.zones.map((z) => [z.code, z]));

describe('Córdoba PGOU-2001 — OCR verified against the source ordinance (VERIFICATION.md §SIG-1)', () => {
    it('verifies exactly the 13 registered subzones — no more, no fewer', () => {
        expect(SOURCE_VERIFIED.map((v) => v.code).sort()).toEqual(
            [...CORDOBA_PGOU2001_ZONE_CODES].sort(),
        );
        expect(SOURCE_VERIFIED).toHaveLength(13);
    });

    for (const v of SOURCE_VERIFIED) {
        describe(`${v.code} (${v.article})`, () => {
            const zone = zoneByCode.get(v.code);

            it('is present in the shipped pack', () => {
                expect(zone, `${v.code} missing from ES_CORDOBA_PGOU2001_PACK`).toBeDefined();
            });

            it('matches the source-verified envelope parameters', () => {
                expect(zone!.maxHeight_m ?? null).toBe(v.maxHeight_m);
                expect(zone!.maxFloors ?? null).toBe(v.maxFloors);
                expect(zone!.plotRatioFAR ?? null).toBe(v.plotRatioFAR);
                expect(zone!.maxCoverage ?? null).toBe(v.maxCoverage);
            });

            it('matches the source-verified setbacks (null = the ordinance states no scalar)', () => {
                const s = zone!.setbacks ?? null;
                expect(s?.front_m ?? null).toBe(v.front_m);
                expect(s?.side_m ?? null).toBe(v.side_m);
                expect(s?.rear_m ?? null).toBe(v.rear_m);
            });

            it('cites its ordinance article', () => {
                expect(zone!.ordinanceRef ?? '').toMatch(/PGOU Art\. 13\./);
            });
        });
    }

    it('MC-3 = 3,50 is the VERIFIED source value, not a range-gate artefact', () => {
        // «En MC-3 la edificabilidad neta será 3,50 m2/m2» — Art. 13.5.2.2, O_MC.pdf p. 49.
        // It exceeds the pipeline FAR range gate [0.2, 3.0]; the read is nonetheless correct.
        expect(zoneByCode.get('MC-3')!.plotRatioFAR).toBe(3.5);
    });

    it('CTP-1 carries the VERIFIED 16 m profundidad edificable (Art. 13.8.2.4) as an alignment rule', () => {
        const rule = zoneByCode.get('CTP-1')!.geometricRule;
        expect(rule?.kind).toBe('alignment');
        expect((rule as { buildableDepth_m?: number }).buildableDepth_m).toBe(16);
    });

    it('every DERIVED-by-algorithm edificabilidad stays null — never a fabricated scalar', () => {
        // Arts. 13.5.2.2 (MC-1/2/4) and 13.8.2.3 (CTP-1): «resultante de la aplicación de las
        // Normas de Composición» is an ALGORITHM. Emitting a number would be confident-wrong.
        for (const code of ['MC-1', 'MC-2', 'MC-4', 'CTP-1']) {
            expect(zoneByCode.get(code)!.plotRatioFAR ?? null).toBeNull();
        }
    });

    it('every MC height stays null — Art. 13.5.3.1 is a per-street-width TABLE, not a scalar', () => {
        for (const code of ['MC-1', 'MC-2', 'MC-3', 'MC-4']) {
            expect(zoneByCode.get(code)!.maxHeight_m ?? null).toBeNull();
            expect(zoneByCode.get(code)!.maxFloors ?? null).toBeNull();
        }
    });

    // ── D1 — the KNOWN GAP, asserted so it cannot be quietly forgotten ────────────────────────
    it('⛔ D1: records that the STATED UAD profundidad (Art. 13.9.3.3) is still MISSING', () => {
        // The source states UAD-1 16 m · UAD-2 18 m · UAD-3 16 m (verified 380 dpi, 2026-08-01).
        // The pack carries none of it. This assertion PINS the known-bad state described in
        // VERIFICATION.md §SIG-1 "known limits" #1. When the depth is added, this test SHOULD fail
        // — update it then, and update the ledger in the same change.
        for (const code of ['UAD-1', 'UAD-2', 'UAD-3']) {
            expect(
                zoneByCode.get(code)!.geometricRule ?? null,
                `${code} now carries a geometricRule — D1 may be fixed; update VERIFICATION.md §SIG-1`,
            ).toBeNull();
        }
    });

    it('⛔ D1: UAD-3 is the unguarded case — front 0 + side 0 with no depth band', () => {
        const uad3 = zoneByCode.get('UAD-3')!;
        expect(uad3.setbacks?.front_m).toBe(0);
        expect(uad3.setbacks?.side_m).toBe(0);
        // No depth band ⇒ the inset alone bounds the envelope ⇒ L-616 mechanism A. Latent only
        // because UAD-3 binds 0.00 % of published pilot land and the whole pilot is gate-refused.
        expect(uad3.geometricRule ?? null).toBeNull();
    });
});
