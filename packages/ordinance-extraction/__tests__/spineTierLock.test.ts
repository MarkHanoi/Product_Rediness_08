// THE TIER LOCK, PROVEN TO FIRE.
//
// The brief this lane executes says: *"It must be IMPOSSIBLE for the spine to emit
// tier 1/2/3 — enforce that in the type system if the frozen schema allows,
// otherwise in a guard with a test that proves the guard fires."*
//
// The TYPE-level half cannot be tested at runtime by construction — `tier: 2` in an
// `ExtractionClaimProvenance` does not compile, and a test that cannot be written is
// the strongest possible form of the guarantee. What CAN and MUST be tested is the
// RUNTIME half, because that is the door every `as unknown as` cast, every parsed
// JSON payload and every future caller comes through.
//
// ⭐ `tierLock.ts`'s own header claimed this file existed before it did. That claim
// was FALSE for the life of the lane that wrote it (measured: the package's suite
// was 20 files / 252 tests both before and after the spine was written — not one
// test covered any of it). This file makes the claim true; it is not decoration.

import { describe, expect, it } from 'vitest';
import {
    EXTRACTION_DERIVATION,
    EXTRACTION_TIER,
    assertExtractionProvenance,
    buildExtractionProvenance,
    checkExtractionProvenance,
} from '../src/spine/tierLock.js';
import { type RuleSourceRef } from '@pryzm/schemas';

const SOURCE: RuleSourceRef = {
    country: 'CH',
    authority: 'Stadt Luzern',
    dataset: 'Bau- und Zonenreglement, Anhang 1',
    plan_id: null,
    object_id: '10',
    document: 'luze_BZR.pdf',
    article: 'FH @ row 10',
    page: 27,
};

/** A record the lock ACCEPTS — the shape the spine really emits. */
function validRecord(): Record<string, unknown> {
    return {
        parameter: 'maxHeight_m',
        value: 21,
        unit: 'm',
        source: SOURCE,
        derivation: EXTRACTION_DERIVATION,
        valueLocation: 'in-document-text',
        confidence: { tier: EXTRACTION_TIER, note: 'extraction method: table-reconstruction' },
        normativeForce: null,
        validityBasis: 'ingestion',
        valid_from: '2026-09-02',
        valid_to: null,
    };
}

describe('tier lock — the constructor emits tier 4 / AI_EXTRACTED and nothing else', () => {
    it('stamps tier 4, AI_EXTRACTED and in-document-text', () => {
        const p = buildExtractionProvenance({
            parameter: 'maxHeight_m',
            value: 21,
            unit: 'm',
            source: SOURCE,
            validity: { basis: 'ingestion', from: '2026-09-02', to: null },
            method: 'table-reconstruction',
        });
        expect(p.confidence.tier).toBe(4);
        expect(p.derivation).toBe('AI_EXTRACTED');
        expect(p.valueLocation).toBe('in-document-text');
    });

    it('mirrors the extraction METHOD into the frozen record, so what happened is not lost', () => {
        const p = buildExtractionProvenance({
            parameter: 'maxHeight_m',
            value: 21,
            unit: 'm',
            source: SOURCE,
            validity: { basis: 'ingestion', from: '2026-09-02', to: null },
            method: 'table-reconstruction',
        });
        expect(p.confidence.note).toContain('table-reconstruction');
        // The validation state travels INSIDE the record, not merely beside it.
        expect(p.confidence.note).toContain('UNVALIDATED');
    });
});

describe('tier lock — THE GUARD FIRES (this is the test the brief demands)', () => {
    // ⛔ Every tier that is not 4. Tiers 1/2/3 assert authority the pipeline does
    // not have; tier 5 requires a RECORDED human validation event; tier 6 is a
    // different statement (uncertain-missing) that an extraction spine must not
    // stamp on a value it did read.
    for (const tier of [1, 2, 3, 5, 6]) {
        it(`REFUSES tier ${tier}`, () => {
            const record = { ...validRecord(), confidence: { tier } };
            const verdict = checkExtractionProvenance(record);
            expect(verdict.ok).toBe(false);
            expect(() => assertExtractionProvenance(record)).toThrow(
                /ordinance-extraction\/tier-lock/u,
            );
        });
    }

    // A tier-1 record is refused whether the FROZEN L0 schema rejects it first
    // (tier 1 + AI_EXTRACTED is unrepresentable there) or the spine's own
    // constraint catches it. Either way the answer is "no", and the test asserts
    // the OUTCOME rather than which of the two layers spoke.
    it('REFUSES tier 1 even when the derivation is changed to make it schema-legal', () => {
        const record = {
            ...validRecord(),
            derivation: 'DIRECT',
            valueLocation: 'attribute',
            confidence: { tier: 1 },
        };
        expect(checkExtractionProvenance(record).ok).toBe(false);
        expect(checkExtractionProvenance(record).violations).toContain('tier-not-4');
    });

    for (const derivation of ['DIRECT', 'DERIVED', 'HUMAN_VALIDATED']) {
        it(`REFUSES derivation ${derivation}`, () => {
            const record = { ...validRecord(), derivation };
            expect(checkExtractionProvenance(record).ok).toBe(false);
            expect(() => assertExtractionProvenance(record)).toThrow();
        });
    }

    it('REFUSES a valueLocation that is not in-document-text', () => {
        const record = { ...validRecord(), valueLocation: 'attribute' };
        const verdict = checkExtractionProvenance(record);
        expect(verdict.ok).toBe(false);
        expect(verdict.violations).toContain('value-location-not-in-document-text');
    });

    it('REFUSES a non-object, so a parsed-JSON caller cannot slip past', () => {
        for (const junk of [null, 42, 'tier 4', [], undefined]) {
            expect(checkExtractionProvenance(junk).ok).toBe(false);
        }
    });

    it('runs the FROZEN L0 schema FIRST — a malformed record is named as schema-invalid', () => {
        const verdict = checkExtractionProvenance({ derivation: 'AI_EXTRACTED' });
        expect(verdict.ok).toBe(false);
        expect(verdict.violations).toEqual(['schema-invalid']);
        expect(verdict.detail).toContain('FROZEN L0');
    });

    // ⭐ THE SCRAMBLE CONTROL. A guard that says "no" to everything is as useless as
    // one that says "yes" to everything, and a test suite of only-negative cases
    // cannot tell the two apart. The valid record must PASS.
    it('CONTROL — the valid record passes, so the refusals above are discriminating', () => {
        const verdict = checkExtractionProvenance(validRecord());
        expect(verdict.ok).toBe(true);
        expect(verdict.violations).toEqual([]);
        expect(() => assertExtractionProvenance(validRecord())).not.toThrow();
    });
});
