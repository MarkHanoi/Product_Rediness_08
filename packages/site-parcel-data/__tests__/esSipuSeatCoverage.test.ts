// ═════════════════════════════════════════════════════════════════════════════════════════════
// §SIPU-CROSSMAP-PINNED (lane ENVELOPE-IBERIA, 2026-09-04) — the amendment surface, DERIVED from
// the shipped code rather than asserted in prose.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// `docs/04-reference/jurisdictions/es/ES-SIPU-PARAMETER-CROSSMAP.md` answers the founder's
// question — *"does the SIPU field-mapping hold?"* — with **6 of 14 EXACT, 6 with NO SEAT, one
// AMBIGUOUS, one LOSSY**. That document is prose, and prose rots: `CLAUDE.md`'s correction boxes
// exist because hand-copied counts kept going stale, and §confident-register-rows-are-the-wrong-ones
// records that PROSE-JUSTIFIED verdicts were all wrong while honest blanks were safe.
//
// ⭐ SO EVERY CLAIM BELOW IS RE-DERIVED FROM THE SHIPPED CODE AT TEST TIME. When a C58 amendment
// lands, or a datum member is minted, or a Spanish pack finally sets `heightDatum`, these tests
// FAIL — which is the point. They are shrink-only markers on a gap list, not a description of it.
//
// ⛔ THEY ASSERT NOTHING ABOUT CANARIAS' LEGAL STATE beyond what the code already declares. The
// research lives in the doc; this file only stops the ENGINEERING claims from drifting.

import { describe, it, expect } from 'vitest';
import {
    HeightDatumSchema,
    HEIGHT_DATUM_KIND_REGISTRY,
    heightDatumOf,
    JurisdictionZoningContractSchema,
    ZoningRuleSchema,
} from '@pryzm/schemas';
import {
    CANARIAS_ENVELOPE_VERIFIED,
    SIPU_HEIGHT_DATUM,
} from '../src/rulepacks/esCanariasSipu.js';
import { ES_TELDE_PGO2003_PACK } from '../src/rulepacks/esTeldePgo2003.js';
import { isEnvelopePublicationAuthorised } from '../src/rulepacks/envelopeAuthorisation.js';
import { TELDE_JURISDICTION_ID } from '../src/providers/teldeBbox.js';

/** The seats a `ZoningRule` actually offers today, read off the SCHEMA, never re-typed. */
function zoningRuleSeats(): readonly string[] {
    // A minimal valid zone: every optional field falls back to its `.default()`, so the parsed
    // key set IS the seat set.
    const parsed = ZoningRuleSchema.parse({ code: 'X', label: 'X' }) as Record<string, unknown>;
    return Object.keys(parsed).sort();
}

describe('§SIPU-CROSSMAP-PINNED — the 6 SIPU fields with NO C58 seat', () => {
    it('`ZoningRule` offers exactly these seats — so the missing ones are missing by MEASUREMENT', () => {
        expect(zoningRuleSeats()).toEqual([
            'code',
            'fieldProvenance',
            'geometricRule',
            'label',
            'maxCoverage',
            'maxFloors',
            'maxHeight_m',
            'ordinanceRef',
            'permittedUse',
            'plotRatioFAR',
            'setbacks',
        ]);
    });

    it('⛔ there is NO seat for minimum plot area, minimum frontage, or inscribed circle', () => {
        // SIPU publishes `SupMin`, `LongMin` and `CircInsc` in 102 of 135 censused tables, and
        // Madrid independently publishes `NM_FRTE_MIN`. Today both survive only as prose inside
        // `ordinanceRef`, which the solver cannot read.
        const seats = zoningRuleSeats().join(' ').toLowerCase();
        for (const absent of ['minparcel', 'minplot', 'frontage', 'inscrib', 'circinsc']) {
            expect(seats, `a seat matching "${absent}" appeared — update the cross-map doc`).not.toContain(
                absent,
            );
        }
    });

    it('⛔ `maxCoverage` and `plotRatioFAR` are RATIOS, so the ABSOLUTE m² forms have no seat', () => {
        // `SupOcMax` (superficie ocupable máxima) and `SupEdMax` (superficie edificable máxima)
        // are absolute m² ceilings. `esBalearsMuib.ts` already guards the same defect class:
        // "a 300 m² ceiling read as a FAR of 300 would be catastrophic".
        expect(() => ZoningRuleSchema.parse({ code: 'X', label: 'X', maxCoverage: 300 })).toThrow();
        // The FAR seat has no upper bound at the schema, so an absolute m² value would be
        // ACCEPTED there — which is exactly why the absolute form needs its OWN seat rather than
        // borrowing this one.
        expect(() =>
            ZoningRuleSchema.parse({ code: 'X', label: 'X', plotRatioFAR: 300 }),
        ).not.toThrow();
    });

    it('⛔ `setbacks` is a front/side/rear TRIPLE — separation-between-volumes has nowhere to go', () => {
        const z = ZoningRuleSchema.parse({ code: 'X', label: 'X' });
        expect(Object.keys(z.setbacks).sort()).toEqual(['front_m', 'rear_m', 'side_m']);
    });
});

describe('§SIPU-CROSSMAP-PINNED — the DATUM gap (ADR-0377 vs SIPU)', () => {
    it('the ratified union is these 7 kinds — the census, derived from the registry', () => {
        expect(Object.keys(HEIGHT_DATUM_KIND_REGISTRY).sort()).toEqual([
            'absolute-national',
            'facade-rasant',
            'mean-ground-at-facade',
            'street-level',
            'terrain-highest',
            'terrain-lowest',
            'unknown',
        ]);
    });

    it('⛔ SIPU names datums the ratified union CANNOT express', () => {
        const sipuDatums = new Set(Object.values(SIPU_HEIGHT_DATUM));
        // The SIPU vocabulary the adapter actually ships.
        expect(sipuDatums.has('parcel')).toBe(true);
        expect(sipuDatums.has('cornice')).toBe(true);
        expect(sipuDatums.has('crown')).toBe(true);

        const ratified = new Set(Object.keys(HEIGHT_DATUM_KIND_REGISTRY));
        // `parcel` — AltMaxMP, "measured from the parcel" — has NO member. `terrain-highest` /
        // `terrain-lowest` are natural-terrain extrema and `mean-ground-at-facade` is a
        // façade-line quantity; none of them is "from the parcel".
        expect(ratified.has('parcel')).toBe(false);
        // `cornice` / `crown` are not a missing MEMBER at all — they name the UPPER measurement
        // point where the union names only the LOWER reference plane. No member count fixes that;
        // it needs a second axis. Pinned so a future ADR does not "fix" it by adding a member.
        expect(ratified.has('cornice')).toBe(false);
        expect(ratified.has('crown')).toBe(false);
    });

    it('an unstated datum is legal and REFUSES — absence never reads as a specific plane', () => {
        expect(heightDatumOf(undefined)).toEqual({ kind: 'unknown' });
        expect(heightDatumOf(null)).toEqual({ kind: 'unknown' });
        expect(HeightDatumSchema.parse({ kind: 'unknown' })).toEqual({ kind: 'unknown' });
    });

    it('⛔ NO Telde zone sets the ratified `heightDatum` seat — its datums are code comments', () => {
        // `esTeldePgo2003.ts` records `AltMaxMP`/`AltMaxMV` datums as free text next to the value
        // (`maxHeight_m: 7.5, // AltMaxMP — datum: PARCEL`) and inside `ordinanceRef`. Under
        // `heightDatumOf` every one therefore reads `unknown`, and a resolver consumer refuses.
        const pack = JurisdictionZoningContractSchema.parse(ES_TELDE_PGO2003_PACK);
        const withHeight = pack.zones.filter((z) => z.maxHeight_m !== null);
        expect(withHeight.length, 'the premise: Telde does pack metric heights').toBeGreaterThan(0);
        for (const z of withHeight) {
            expect(heightDatumOf(z.heightDatum), `${z.code} names its datum`).toEqual({
                kind: 'unknown',
            });
        }
    });
});

describe('§SIPU-CROSSMAP-PINNED — the mapping being right changes nothing about publication', () => {
    it('Canarias is unsigned, so every one of its municipalities refuses regardless', () => {
        expect(CANARIAS_ENVELOPE_VERIFIED).toBe(false);
        expect(isEnvelopePublicationAuthorised(TELDE_JURISDICTION_ID)).toBe(false);
    });
});
