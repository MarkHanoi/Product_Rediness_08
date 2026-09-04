// §NL-INHOUD — fixtures QUOTED VERBATIM from `nl-inhoud-probe.json` (2026-09-04), plan ids named.

import { describe, it, expect } from 'vitest';
import { extractNlInhoudRules, resolveNlInhoud, nlInhoudToRuleState } from '../src/rulepacks/nlInhoud.js';

const REF = {
    country: 'NL',
    authority: 'Gemeente (bestemmingsplan)',
    dataset: 'ruimtelijkeplannen/IMRO2012',
    plan_id: 'NL.IMRO.TEST.INHOUD-VG01',
    object_id: null,
    document: null,
    article: 'bouwregels',
    page: null,
} as const;

/** NL.IMRO.0588.BPBGA13hp0615-VG01 (1e Herziening Buitengebied 2015), Artikel 5 Bedrijf. */
const CAP_750 =
    'bedrijfswoningen mag niet meer bedragen dan 6 m. De bouwhoogte van bedrijfswoningen mag niet meer bedragen dan 10 m. ' +
    'De inhoud van een bedrijfswoning bedraagt ten hoogste 750 m³. De ondergrondse bebouwing en de bijbehorende bouwwerken ' +
    'worden niet meegerekend voor het bepalen van de inhoud. 5.2.4 Bijbehorende bouwwerken';

/** NL.IMRO.0736.BP018BgbWest-va02 (Buitengebied-West), Artikel 25 Wonen — a MINIMUM for splitting. */
const MIN_900 =
    'stedenbouwkundige eenheid vormen, met inachtneming van het volgende: a. de te splitsen (voormalige) boerderij dient een ' +
    'inhoud te hebben van minimaal 900 m³; b. het bestaande grondoppervlak van het hoofdgebouw mag niet worden vergroot;';

/** NL.IMRO.0736.BP022dorpskernen-va02 (Dorpskernen), Artikel 3 Agrarisch — a CONDITIONAL sloop bonus. */
const COND_900 =
    'bouwen ten hoogste 50 m², vermeerderd met 50% van het meerdere van 50 m² aan bedrijfsgebouwen dat wordt gesloopt; ' +
    '4. de inhoud van een voormalige bedrijfswoning kan worden verruimd tot 900 m³ in geval van sloop van tenminste 500 m² ' +
    'aan voormalige bedrijfsgebouwen van het bedrijf';

/** NL.IMRO.0114.2022075-B702 (Buitengebied Emmen 2011, Veegplan) — a cap on a SILO, Dutch thousands separator. */
const SILO_2500 =
    'g. de inhoud van één mestsilo bedraagt maximaal 2.500 m³; h. de bouwhoogte van mestsilo\'s bedraagt maximaal 6 meter.';

describe('extraction — the probe detector plus quantifier and subject', () => {
    it('reads "bedraagt ten hoogste 750 m³" as a MAXIMUM about "een bedrijfswoning"', () => {
        const h = extractNlInhoudRules(CAP_750);
        expect(h).toHaveLength(1);
        expect(h[0]!.numbersM3).toEqual([750]);
        expect(h[0]!.quantifier).toBe('maximum');
        expect(h[0]!.subjectVerbatim).toBe('een bedrijfswoning');
    });
    it('reads "minimaal 900 m³" as a MINIMUM — a floor is never a ceiling', () => {
        const h = extractNlInhoudRules(MIN_900);
        expect(h).toHaveLength(1);
        expect(h[0]!.quantifier).toBe('minimum');
    });
    it('reads "kan worden verruimd tot 900 m³ in geval van sloop" as CONDITIONAL', () => {
        const h = extractNlInhoudRules(COND_900);
        expect(h).toHaveLength(1);
        expect(h[0]!.quantifier).toBe('conditional');
    });
    it('parses the Dutch thousands separator: "2.500 m³" → 2500, subject "één mestsilo"', () => {
        const h = extractNlInhoudRules(SILO_2500);
        expect(h[0]!.numbersM3).toEqual([2500]);
        expect(h[0]!.subjectVerbatim).toBe('één mestsilo');
    });
    it('a plain "inhoud" mention with no cubic figure is not a hit', () => {
        expect(extractNlInhoudRules('de inhoud van dit plan is als volgt opgebouwd')).toHaveLength(0);
    });
});

describe('resolution — one subject, one maximum, or an honest non-answer', () => {
    it('recovers the 750 m³ dwelling cap and maps to D1 resolved in m³', () => {
        const r = resolveNlInhoud({ planText: CAP_750 });
        expect(r.kind).toBe('cap-recovered');
        const s = nlInhoudToRuleState(r, REF);
        expect(s.rule).toBe('D1');
        if (s.status !== 'resolved') throw new Error('narrowing');
        expect(s.value).toBe(750);
        expect(s.unit).toBe('m3');
    });
    it('a minimum-only text yields NO cap — refused as requires-determination, never 900 m³', () => {
        const r = resolveNlInhoud({ planText: MIN_900 });
        expect(r.kind).toBe('no-unconditional-maximum');
        const s = nlInhoudToRuleState(r, REF);
        expect(s.status).toBe('refused');
        expect(JSON.stringify(s)).not.toContain('"value"');
    });
    it('a conditional sloop bonus is not an entitlement', () => {
        expect(resolveNlInhoud({ planText: COND_900 }).kind).toBe('no-unconditional-maximum');
    });
    it('the silo cap does NOT become the dwelling’s cap — subject-filtered', () => {
        const r = resolveNlInhoud({ planText: SILO_2500 });
        expect(r.kind).toBe('no-cubic-rule-detected');
        if (r.kind !== 'no-cubic-rule-detected') throw new Error('narrowing');
        expect(r.otherSubjectHits).toBe(1);
        const s = nlInhoudToRuleState(r, REF);
        if (s.status !== 'unrecovered') throw new Error('narrowing');
        // ⚠ never F1 from a detector miss.
        expect(s.mechanism).toBe('unknown');
        expect(s.failure).toBe('pdf');
    });
    it('asking for the silo explicitly recovers 2500 m³', () => {
        const r = resolveNlInhoud({ planText: SILO_2500, subject: /mestsilo/i });
        if (r.kind !== 'cap-recovered') throw new Error('narrowing');
        expect(r.capM3).toBe(2500);
    });
    it('two distinct maxima for the subject are `alternative`, never averaged', () => {
        const r = resolveNlInhoud({ planText: CAP_750 + ' De inhoud van een bedrijfswoning bedraagt ten hoogste 900 m³.' });
        expect(r.kind).toBe('several-caps');
        const s = nlInhoudToRuleState(r, REF);
        if (s.status !== 'alternative') throw new Error('narrowing');
        expect(s.alternatives).toEqual(['maximum inhoud 750 m³', 'maximum inhoud 900 m³']);
    });
    it('unread text is about us: unrecovered / pdf / mechanism unknown', () => {
        const s = nlInhoudToRuleState(resolveNlInhoud({ planText: null }), REF);
        if (s.status !== 'unrecovered') throw new Error('narrowing');
        expect(s.mechanism).toBe('unknown');
    });
});
