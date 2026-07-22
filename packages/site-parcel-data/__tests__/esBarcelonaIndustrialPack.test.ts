// L-590 — the Barcelona clau `22a` (*Zona Industrial*) pack, PGM Art. 350.
//
// WHAT THESE TESTS GUARD, AND WHY THEY ARE NOT A COPY OF THE 13b SUITE
// --------------------------------------------------------------------
// The 13b suite guards against "13b is 13a with different numbers". This suite guards against two
// failures peculiar to 22a, both of which would look like progress:
//
//   1. **Someone registering this pack.** It is authored, sourced and correct in every scalar, and
//      it is deliberately absent from `registry.ts` because Art. 350.2's envelope is TWO-TIER and
//      our model is a single prism. Registering it would draw the WHOLE parcel next to the 90 %
//      occupation cap it publishes from the same article. The registry assertions below are the
//      guardrail, and they fail loudly with the reason attached.
//   2. **Someone collapsing one of the article's three 70/90 figures into another.** Art. 350
//      states 90 % of the PARCEL (350.2.a), 70 % of the BLOCK left free above the ground floor
//      (350.2.b) and 70 % of the PARCEL for *aïllada* sectors under a Pla Parcial (350.1.2n). Same
//      digits, three different quantities. C58 §1.11 is exactly this failure.

import { describe, it, expect } from 'vitest';
import {
    ES_BARCELONA_INDUSTRIAL_PACK,
    BCN_INDUSTRIAL_ZONE_CODES,
    BCN_22A_ORDINANCE_REF,
    BCN_22A_ENVELOPE_BLOCKER,
    BCN_ART350_MIN_PARCEL_M2,
    BCN_ART350_MIN_FACADE_M,
    BCN_ART350_2B_INTERIOR_FREE_RATIO,
    BCN_ART350_1_AILLADA_COVERAGE,
    BCN_ART350_COSSOS_SORTINTS,
} from '../src/rulepacks/esBarcelonaIndustrial.js';
import { registeredPackZoneCodes, resolveZoneDisposition, BCN_JURISDICTION_ID } from '../src/rulepacks/registry.js';

const zone = () => ES_BARCELONA_INDUSTRIAL_PACK.zones[0]!;

describe('L-590 — the 22a pack is VALID (parses at load)', () => {
    it('parsed the schema without throwing', () => {
        // The pack runs `JurisdictionZoningContractSchema.parse` at MODULE LOAD, so a schema
        // violation is a runtime throw that `tsc` says nothing about.
        expect(ES_BARCELONA_INDUSTRIAL_PACK.jurisdictionId).toBe('es-08019-barcelona');
        expect(ES_BARCELONA_INDUSTRIAL_PACK.zones).toHaveLength(1);
        expect(zone().code).toBe('22a');
        expect(zone().permittedUse).toEqual(['industrial']);
    });

    it('registers clau 22a ONLY — 22@ is a different subzone with different articles', () => {
        // The 2000 MPGM defines 22@ as a formally distinct subzone governed by its OWN articles
        // except where they defer to the PGM. Claiming it here would cite Art. 350 for land those
        // articles govern.
        expect([...BCN_INDUSTRIAL_ZONE_CODES]).toEqual(['22a']);
        expect([...BCN_INDUSTRIAL_ZONE_CODES]).not.toContain('22@');
    });

    it('ships `estimated-ruleset` — a pack cannot self-certify, re-typeset primary or not', () => {
        expect(ES_BARCELONA_INDUSTRIAL_PACK.defaultConfidence).toBe('estimated-ruleset');
    });
});

describe('L-590 — THE CITATION. Every value names the paragraph that states it', () => {
    it('cites Art. 350.2.a for the FAR and the occupation', () => {
        expect(BCN_22A_ORDINANCE_REF).toMatch(/Art\. 350\.2\.a/);
        expect(BCN_22A_ORDINANCE_REF).toMatch(/2 m² sostre\/m² sòl/);
        expect(BCN_22A_ORDINANCE_REF).toMatch(/90 %/);
        expect(zone().ordinanceRef).toBe(BCN_22A_ORDINANCE_REF);
    });

    it('cites Art. 350.2.c for the height table, and DISCLAIMS 327 and 328', () => {
        // THE LOAD-BEARING ASSERTION. A confident citation to a neighbouring zone's article is the
        // most damaging output this system produces (L-526; and again when 13b briefly inherited
        // Art. 327). The citation must name its own article AND say which ones it is not.
        expect(BCN_22A_ORDINANCE_REF).toMatch(/Art\. 350\.2\.c/);
        expect(BCN_22A_ORDINANCE_REF).toMatch(/NOT Art\. 327/);
        expect(BCN_22A_ORDINANCE_REF).toMatch(/NOT Art\. 328/);
    });

    it('cites .b/.d/.e/.f for the band, the minimum parcel, the interior height and the volums', () => {
        expect(BCN_22A_ORDINANCE_REF).toMatch(/Art\. 350\.2\.b/);
        expect(BCN_22A_ORDINANCE_REF).toMatch(/Art\. 350\.2\.d/);
        expect(BCN_22A_ORDINANCE_REF).toMatch(/Art\. 350\.2\.e/);
        expect(BCN_22A_ORDINANCE_REF).toMatch(/Art\. 350\.2\.f/);
    });

    it('⚠ RECORDS THE 350.1 / 350.2 PLA PARCIAL DISTINCTION — it must survive into the pack', () => {
        // Art. 350.2 governs only industrial land *mancada de Pla Parcial*. A citation that said
        // only "Art. 350" would be uncheckable and would imply this pack governs land it does not.
        expect(BCN_22A_ORDINANCE_REF).toMatch(/MANCADA DE PLA PARCIAL/);
        expect(BCN_22A_ORDINANCE_REF).toMatch(/Art\. 350\.1/);
    });

    it('⚠ RECORDS THAT WE CHECKED FOR A BARCELONA OVERRIDE AND FOUND NONE', () => {
        // "We looked and there is none" is a stronger, different statement from "we found none",
        // and it is only worth anything if the citation carries it.
        expect(BCN_22A_ORDINANCE_REF).toMatch(/Veure modificació per al Municipi de Barcelona/);
        expect(BCN_22A_ORDINANCE_REF).toMatch(/base PGM text for Barcelona/);
    });

    it('states its confidence honestly — a re-typeset re-edition, never certified', () => {
        expect(BCN_22A_ORDINANCE_REF).toMatch(/NOT authenticated/);
        expect(BCN_22A_ORDINANCE_REF).toMatch(/never certified/);
        // "certified" may appear ONLY as part of the disclaimer. Any other occurrence would be the
        // pack claiming an authentication we do not have.
        expect(BCN_22A_ORDINANCE_REF.match(/certified/g)).toHaveLength(1);
        // And it must name the file a reader can open.
        expect(BCN_22A_ORDINANCE_REF).toMatch(/PGM-NNUU-metropolitana\.pdf/);
        expect(BCN_22A_ORDINANCE_REF).toMatch(/p\. 116/);
    });
});

describe('L-590 — the numbers, and the three 70/90 figures that must never be conflated', () => {
    it('Art. 350.2.a — a REAL per-parcel FAR of 2, unlike 13a (none) and 13b (PERI-gated)', () => {
        expect(zone().plotRatioFAR).toBe(2);
        expect(zone().fieldProvenance['maxFAR']).toBe('ordinance-pdf');
    });

    it('Art. 350.2.a — occupation 90 % OF THE PARCEL', () => {
        expect(zone().maxCoverage).toBe(0.9);
        expect(zone().fieldProvenance['maxCoverage']).toBe('ordinance-pdf');
    });

    it('⚠ the 70 % of Art. 350.2.b is a share of the BLOCK, and is NOT the coverage', () => {
        // 350.2.b confines the ABOVE-GROUND-FLOOR mass to a band concentric with the block whose
        // area equals 70 % of it ⇒ 30 % of the BLOCK stays free. Pasting either figure into
        // `maxCoverage` would answer a different question with a real-looking number (C58 §1.11).
        expect(BCN_ART350_2B_INTERIOR_FREE_RATIO).toBe(0.3);
        expect(zone().maxCoverage).not.toBe(0.7);
        expect(zone().maxCoverage).not.toBe(BCN_ART350_2B_INTERIOR_FREE_RATIO);
    });

    it('⚠ the 70 % of Art. 350.1.2n belongs to the OTHER regime and is not shipped', () => {
        // Occupation for *edificació aïllada* sectors inside a definitively-approved Pla Parcial.
        // This pack declares the Art. 350.2 regime, so 0.90 is what it ships.
        expect(BCN_ART350_1_AILLADA_COVERAGE).toBe(0.7);
        expect(zone().maxCoverage).toBe(0.9);
    });

    it('Art. 350.2.d — minimum parcel and façade are BUILDABILITY facts, not envelope fields', () => {
        // `ZoningRule` has no slot for either; they are exported so a consumer can say "this plot
        // is under the zone minimum" without a schema change made by a data file.
        expect(BCN_ART350_MIN_PARCEL_M2).toBe(300);
        expect(BCN_ART350_MIN_FACADE_M).toBe(10);
    });

    it('Art. 350.2.f — cossos sortints recorded, never folded into the envelope', () => {
        expect(BCN_ART350_COSSOS_SORTINTS.maxProjectionFractionOfStreetWidth).toBe(0.1);
        expect(BCN_ART350_COSSOS_SORTINTS.maxProjection_m).toBe(1);
        expect(BCN_ART350_COSSOS_SORTINTS.maxFractionOfFacadeLength).toBeCloseTo(1 / 3, 10);
    });
});

describe('L-590 — EVERY NULL IS A FINDING (C58 §1.7a: null ≠ 0)', () => {
    it('height and floors are null — Art. 350.2.c is a per-street CONSTRUCTION', () => {
        // A scalar here would publish one street's answer for the whole zone. The table lives in
        // `bcnAlcadaIndustrial.ts` and is reached through `resolveBcnAlcadaForZone`.
        expect(zone().maxHeight_m).toBeNull();
        expect(zone().maxFloors).toBeNull();
    });

    it('setbacks are null, NOT zero — an alignment zone has no honest triple', () => {
        // `0` would assert "the ordinance requires zero clearance here", a claim Art. 350 does not
        // make. `null` makes the containment check skip the edge instead.
        expect(zone().setbacks.front_m).toBeNull();
        expect(zone().setbacks.side_m).toBeNull();
        expect(zone().setbacks.rear_m).toBeNull();
    });

    it('⚠ geometricRule is null BECAUSE THE RULE KIND DOES NOT EXIST — not as a placeholder', () => {
        expect(zone().geometricRule).toBeNull();
        expect(BCN_22A_ENVELOPE_BLOCKER.missingRuleKind).toMatch(/tiered-occupation/);
        expect(BCN_22A_ENVELOPE_BLOCKER.reasons.length).toBeGreaterThanOrEqual(4);
    });
});

describe('L-590 — ⚠ THE PACK IS DELIBERATELY UNREGISTERED, AND 22a STILL REFUSES', () => {
    it('is NOT in the Barcelona registry', () => {
        // THE GUARDRAIL. If someone "finishes the job" by registering it, this fails with the
        // reason in the message rather than shipping a 100 %-of-parcel envelope beside a 90 % cap.
        const codes = registeredPackZoneCodes(BCN_JURISDICTION_ID);
        expect(
            codes,
            'clau 22a must NOT be registered until a tiered-occupation GeometricRule exists — ' +
                'see BCN_22A_ENVELOPE_BLOCKER. Registering it publishes an envelope covering the ' +
                'whole parcel next to the 90 % occupation cap read from the same article.',
        ).not.toContain('22a');
        expect(BCN_22A_ENVELOPE_BLOCKER.registered).toBe(false);
        // The zones that ARE registered are unaffected.
        expect(codes).toContain('13a');
        expect(codes).toContain('13b');
    });

    it('a 22a parcel still resolves to a COVERAGE-GAP refusal, not an envelope', () => {
        const d = resolveZoneDisposition(BCN_JURISDICTION_ID, '22a', {
            zoneLabel: 'Zona industrial',
        });
        expect(d.kind).toBe('refusal');
        if (d.kind === 'refusal') {
            // ⚠ `legallyGrounded: false` — this is a statement about PRYZM's model, NOT a claim
            // that the ordinance forbids building on industrial land. Flipping it would tell an
            // owner their perfectly buildable plot cannot be built on.
            expect(d.refusal.legallyGrounded).toBe(false);
        }
    });

    it('the refusal copy now states the REAL blocker: a shape we cannot draw', () => {
        const d = resolveZoneDisposition(BCN_JURISDICTION_ID, '22a', {});
        expect(d.kind).toBe('refusal');
        if (d.kind === 'refusal') {
            const text = JSON.stringify(d.refusal);
            // Must still name the floor-area index (it is one of the two numbers we CAN quote)…
            expect(text).toMatch(/floor-area index/i);
            // …and must now name the two-tier shape, which is what actually blocks the envelope.
            expect(text).toMatch(/around the whole block/i);
        }
    });
});
