// §NL-BEBPCT-DENOMINATOR — the denominator is REQUIRED and has NO DEFAULT (founder review §7).
//
// Every definition below is QUOTED VERBATIM from `nl-inhoud-probe.json` (2026-09-04), with its plan
// id — fixtures from the sample, never written by the regex's author (lane rule).

import { describe, it, expect } from 'vitest';
import {
    classifyNlBebouwingspercentageDenominator,
    resolveNlDenominatorFromDefinition,
    resolveNlBebouwingspercentage,
    nlBebouwingspercentageToRuleState,
} from '../src/rulepacks/nlBebouwingspercentage.js';

const REF = {
    country: 'NL',
    authority: 'Gemeente (bestemmingsplan)',
    dataset: 'ruimtelijkeplannen/IMRO2012',
    plan_id: 'NL.IMRO.TEST.BEBPCT-VG01',
    object_id: null,
    document: null,
    article: 'Artikel 1 (begripsbepalingen)',
    page: null,
} as const;

/** NL.IMRO.1509.BP000100-VA02 — bouwvlak, cleanly. */
const DEF_BOUWVLAK = 'Het deel van het bouwvlak uitgedrukt in procenten dat bebouwd mag worden.';
/** NL.IMRO.0882.BPSTEDGEBWAUBACH3-VG01 — bouwperceel, cleanly. */
const DEF_BOUWPERCEEL =
    'een in de verbeelding aangegeven percentage, dat de grootte aangeeft van het deel van een bouwperceel, dat ten hoogste mag worden bebouwd.';
/** NL.IMRO.0553.bpVeegplan-vax1 — names BOTH ("bouwvlak en/of bouwperceel"). */
const DEF_BOTH =
    'een in de regels of op de verbeelding aangegeven percentage, dat de grootte van het bouwvlak en/of bouwperceel aangeeft, dat maximaal mag worden bebouwd.';
/** NL.IMRO.0736.BP022dorpskernen-va02 — names NEITHER ("een bepaald gebied"). */
const DEF_NEITHER =
    ': een in de regels of op de verbeelding aangegeven percentage, dat de grootte van het deel van een bepaald gebied aangeeft dat maximaal mag worden bebouwd.';

describe('classification uses the probe vocabulary and returns a SET', () => {
    it('reads bouwvlak / bouwperceel cleanly from the corpus definitions', () => {
        expect(classifyNlBebouwingspercentageDenominator(DEF_BOUWVLAK)).toEqual(['bouwvlak']);
        expect(classifyNlBebouwingspercentageDenominator(DEF_BOUWPERCEEL)).toEqual(['bouwperceel']);
    });
    it('returns BOTH when the definition names both — never just the first', () => {
        expect(classifyNlBebouwingspercentageDenominator(DEF_BOTH)).toEqual(['bouwvlak', 'bouwperceel']);
    });
    it('is unclassified when neither word appears — never folded into a default', () => {
        expect(classifyNlBebouwingspercentageDenominator(DEF_NEITHER)).toEqual(['unclassified']);
        expect(classifyNlBebouwingspercentageDenominator('')).toEqual(['unclassified']);
    });
    it('does NOT promote a bare "perceel" to bouwperceel', () => {
        expect(classifyNlBebouwingspercentageDenominator('percentage van het perceel dat bebouwd mag worden')).toEqual([
            'perceel-unqualified',
        ]);
        expect(resolveNlDenominatorFromDefinition('percentage van het perceel dat bebouwd mag worden').kind).toBe('unresolved');
    });
});

describe('the denominator is REQUIRED — no path from unresolved to a number', () => {
    const AREAS = { bouwvlak: 200, bouwperceel: 600 };

    it('the founder’s 3× case: 50 % is 100 m² or 300 m² depending on the denominator', () => {
        const a = resolveNlBebouwingspercentage({
            percentage: 50,
            denominator: resolveNlDenominatorFromDefinition(DEF_BOUWVLAK),
            areasM2: AREAS,
        });
        const b = resolveNlBebouwingspercentage({
            percentage: 50,
            denominator: resolveNlDenominatorFromDefinition(DEF_BOUWPERCEEL),
            areasM2: AREAS,
        });
        if (a.kind !== 'footprint-resolved' || b.kind !== 'footprint-resolved') throw new Error('narrowing');
        expect(a.maxFootprintM2).toBe(100);
        expect(b.maxFootprintM2).toBe(300);
    });

    it('an unresolved denominator yields NO footprint and NO default', () => {
        const r = resolveNlBebouwingspercentage({
            percentage: 50,
            denominator: resolveNlDenominatorFromDefinition(DEF_NEITHER),
            areasM2: AREAS,
        });
        expect(r.kind).toBe('denominator-unresolved');
        expect(JSON.stringify(r)).not.toContain('maxFootprintM2');
        const s = nlBebouwingspercentageToRuleState(r, REF);
        expect(s.status).toBe('unrecovered');
        if (s.status !== 'unrecovered') throw new Error('narrowing');
        expect(s.failure).toBe('semantic');
        // The plan DOES publish a percentage — the mechanism is PRESENT, not F1.
        expect(s.mechanism).toBe('present');
        expect(s.stoppedAt).toContain('NOT applied');
    });

    it('a two-candidate definition is `alternative` — both footprints shown, neither picked', () => {
        const r = resolveNlBebouwingspercentage({
            percentage: 50,
            denominator: resolveNlDenominatorFromDefinition(DEF_BOTH),
            areasM2: AREAS,
        });
        expect(r.kind).toBe('denominator-alternative');
        if (r.kind !== 'denominator-alternative') throw new Error('narrowing');
        expect(r.footprintsByCandidateM2).toEqual({ bouwvlak: 100, bouwperceel: 300 });
        const s = nlBebouwingspercentageToRuleState(r, REF);
        expect(s.status).toBe('alternative');
        if (s.status !== 'alternative') throw new Error('narrowing');
        expect(s.alternatives).toHaveLength(2);
    });

    it('a resolved denominator whose area is not held is IDENTIFIED, not applied', () => {
        const r = resolveNlBebouwingspercentage({
            percentage: 40,
            denominator: resolveNlDenominatorFromDefinition(DEF_BOUWPERCEEL),
            areasM2: { bouwvlak: 200 }, // bouwperceel area NOT held
        });
        expect(r.kind).toBe('denominator-identified-area-unknown');
        if (r.kind !== 'denominator-identified-area-unknown') throw new Error('narrowing');
        expect(r.requiredEvidence).toContain('bouwperceel');
    });

    it('a resolved footprint maps to C4 resolved in m², reachability derivable', () => {
        const s = nlBebouwingspercentageToRuleState(
            resolveNlBebouwingspercentage({
                percentage: 60,
                denominator: { kind: 'resolved', denominator: 'bouwvlak', basis: 'human-signed', definitionVerbatim: null },
                areasM2: { bouwvlak: 150 },
            }),
            REF,
        );
        expect(s.rule).toBe('C4');
        expect(s.status).toBe('resolved');
        if (s.status !== 'resolved') throw new Error('narrowing');
        expect(s.value).toBe(90);
        expect(s.unit).toBe('m2');
        expect(s.reachability).toBe('derivable');
    });

    it('a non-percentage (0, 150, NaN) is refused, never divided', () => {
        for (const p of [0, 150, Number.NaN]) {
            const r = resolveNlBebouwingspercentage({
                percentage: p,
                denominator: { kind: 'resolved', denominator: 'bouwvlak', basis: 'human-signed', definitionVerbatim: null },
                areasM2: { bouwvlak: 100 },
            });
            expect(r.kind).toBe('percentage-invalid');
        }
    });
});
