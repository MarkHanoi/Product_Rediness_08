// §NL-PEIL-CATALOGUE — the closed set QUOTED from the seed-20260903 sample, the begripsbepaling extractor
// (with the lowercase-heading trim the probe lacked), and the Stelselcatalogus alignment.

import { describe, it, expect } from 'vitest';
import {
    NL_PEIL_DEFINITION_CATALOGUE,
    NL_STELSELCATALOGUS_REFERENCE,
    alignNlPeilToStraatpeil,
    extractNlBegripsbepaling,
    lookupNlPeilDefinition,
    normaliseNlBegripText,
} from '../src/rulepacks/nlPeilCatalogue.js';
import { NL_PEIL_REFERENCE_CLASSES, classifyNlPeilDefinition } from '../src/rulepacks/nlPeil.js';

describe('the catalogue', () => {
    it('holds 18 distinct definitions over 20 plans, unique ids, non-empty verbatim', () => {
        expect(NL_PEIL_DEFINITION_CATALOGUE.length).toBe(18);
        const ids = new Set(NL_PEIL_DEFINITION_CATALOGUE.map((e) => e.id));
        expect(ids.size).toBe(18);
        const plans = NL_PEIL_DEFINITION_CATALOGUE.flatMap((e) => e.planIds);
        expect(plans.length).toBe(20);
        expect(new Set(plans).size).toBe(20);
        for (const e of NL_PEIL_DEFINITION_CATALOGUE) expect(e.verbatim.length).toBeGreaterThan(20);
    });

    it('no two entries normalise to the same text (the catalogue IS the distinct set)', () => {
        const norms = NL_PEIL_DEFINITION_CATALOGUE.map((e) => normaliseNlBegripText(e.verbatim));
        expect(new Set(norms).size).toBe(norms.length);
    });

    it('every entry classifies to known classes, and none is `unclassified`', () => {
        for (const e of NL_PEIL_DEFINITION_CATALOGUE) {
            const c = classifyNlPeilDefinition(e.verbatim);
            expect(c.length).toBeGreaterThan(0);
            for (const k of c) expect(NL_PEIL_REFERENCE_CLASSES).toContain(k);
            expect(c).not.toContain('unclassified');
        }
    });

    it('lookup is tolerant of whitespace, case, typographic quotes and trailing punctuation — and nothing else', () => {
        const e = NL_PEIL_DEFINITION_CATALOGUE.find((x) => x.id === 'nl-peil-04')!;
        const r = lookupNlPeilDefinition(':  De gemiddelde   hoogte van het bestaande aansluitende afgewerkte maaiveld. ');
        expect(r.kind).toBe('catalogued');
        if (r.kind === 'catalogued') expect(r.entry.id).toBe(e.id);
        // a comma is a different definition
        const miss = lookupNlPeilDefinition('de gemiddelde hoogte van het bestaande, aansluitende afgewerkte maaiveld');
        expect(miss.kind).toBe('not-catalogued');
        if (miss.kind === 'not-catalogued') expect(miss.classes).toContain('adjoining-finished-ground');
        expect(lookupNlPeilDefinition('').kind).toBe('empty');
        expect(lookupNlPeilDefinition(null).kind).toBe('empty');
    });

    it('the three classifier misses the sample exposed are now classified as the finished ground they name', () => {
        // nl-peil-09 (0717): "het aansluitende, afgewerkte maaiveld" — a comma defeated the round-2 regex
        expect(classifyNlPeilDefinition(NL_PEIL_DEFINITION_CATALOGUE[8]!.verbatim)).toContain('adjoining-finished-ground');
        // nl-peil-14 (1509): "het aansluitende, afgewerkte terrein ter plaatse"
        expect(classifyNlPeilDefinition(NL_PEIL_DEFINITION_CATALOGUE[13]!.verbatim)).toContain('adjoining-finished-ground');
        // nl-peil-17 (1896): "het aanliggend afgewerkt terrein" + "het afgewerkte bouwterrein"
        expect(classifyNlPeilDefinition(NL_PEIL_DEFINITION_CATALOGUE[16]!.verbatim)).toContain('adjoining-finished-ground');
    });

    it('pre-construction ground is NOT finished ground: "maaiveld vóór het bouwrijp maken" → maaiveld-other', () => {
        const c = classifyNlPeilDefinition(NL_PEIL_DEFINITION_CATALOGUE[0]!.verbatim); // nl-peil-01 (0148)
        expect(c).toContain('maaiveld-other');
        expect(c).not.toContain('adjoining-finished-ground');
        expect(c).toContain('road-crown'); // "kruin van de dichtstbij gelegen weg"
        expect(c).toContain('authority-determined');
    });
});

describe('the extractor — begripsbepalingen are structurally separable', () => {
    // Quoted from the 0148 plan text as the probe stored it: the definition, then a LOWERCASE-headed begrip.
    const PLAN_TEXT =
        'Artikel 1 Begrippen 1.98 pand: de kleinste bij de totstandkoming functioneel en bouwkundig-constructief zelfstandige eenheid; ' +
        '1.99 peil: 1. De kruin van de dichtstbij gelegen weg, als de (voor)gevel van het gebouw of het bouwwerk, geen gebouw zijnde, geheel of gedeeltelijk is gelegen op een afstand van 10 m of minder van die weg; 2. De gemiddelde hoogte van het aan het bouwwerk aansluitende maaiveld vóór het bouwrijp maken, als de (voor)gevel van het gebouw of het bouwwerk, geen gebouw zijnde, is gelegen op een afstand van meer dan 10 m van de dichtstbij gelegen weg; 3. Indien het bepaalde onder 1 of 2 niet voldoende concreet is te bepalen, het door of namens burgemeester en wethouders aan te geven peil. ' +
        '1.100 permanente bewoning: Bewoning van een ruimte als hoofdverblijf. 1.101 productiegebonden detailhandel: Detailhandel in goederen die ter plaatse worden vervaardigd. Artikel 2 Wijze van meten';

    it('captures the peil definition and stops at the lowercase-headed next begrip', () => {
        const x = extractNlBegripsbepaling(PLAN_TEXT, 'peil');
        expect(x).not.toBeNull();
        expect(x!.heading).toBe('1.99 peil');
        expect(x!.verbatim.endsWith('aan te geven peil.')).toBe(true);
        expect(x!.verbatim).not.toContain('permanente bewoning');
        expect(x!.truncated).toBe(false);
        expect(lookupNlPeilDefinition(x!.verbatim).kind).toBe('catalogued');
    });

    it('a TOC row (heading immediately followed by another heading) is skipped in favour of the body', () => {
        const withToc = '1.98 pand 1.99 peil 1.100 permanente bewoning 1.101 productiegebonden detailhandel ' + PLAN_TEXT;
        const x = extractNlBegripsbepaling(withToc, 'peil');
        expect(x!.verbatim.startsWith('1. De kruin')).toBe(true);
    });

    it('is case-tolerant on the term’s first letter ("1.90 Peil") and matches whole words only', () => {
        const x = extractNlBegripsbepaling('1.90 Peil: 1. Voor een gebouw, waarvan de hoofdtoegang grenst aan de weg: de hoogte van de kruin van de weg. 1.91 Peilbesluit: een besluit', 'peil');
        expect(x!.heading).toBe('1.90 Peil');
        expect(x!.verbatim).not.toContain('Peilbesluit');
    });

    it('returns null on empty input or a missing term', () => {
        expect(extractNlBegripsbepaling('', 'peil')).toBeNull();
        expect(extractNlBegripsbepaling(PLAN_TEXT, 'goothoogte')).toBeNull();
        expect(extractNlBegripsbepaling(PLAN_TEXT, '')).toBeNull();
    });
});

describe('the national reference — Stelselcatalogus', () => {
    it('records that `peil` has no national concept and `straatpeil` does, with the concept URI', () => {
        expect(NL_STELSELCATALOGUS_REFERENCE.noNationalConcept).toContain('peil');
        const sp = NL_STELSELCATALOGUS_REFERENCE.concepts.find((c) => c.naam === 'straatpeil')!;
        expect(sp.uri).toBe('http://regelgeving.omgevingswet.overheid.nl/regelgeving/id/concept/Straatpeil');
        expect(sp.definitie).toContain('bij voltooiing van de bouw');
    });

    it('the national straatpeil definition aligns to itself on both branches', () => {
        const sp = NL_STELSELCATALOGUS_REFERENCE.concepts[0]!.definitie;
        expect(alignNlPeilToStraatpeil(sp)).toEqual({ branchA: true, branchB: true, isStraatpeil: true });
    });

    it('plan definitions that carry the national branches align; a maaiveld-only definition does not', () => {
        const byId = (id: string) => NL_PEIL_DEFINITION_CATALOGUE.find((e) => e.id === id)!.verbatim;
        expect(alignNlPeilToStraatpeil(byId('nl-peil-12')).isStraatpeil).toBe(true); // 0873 — a + b + NAP
        expect(alignNlPeilToStraatpeil(byId('nl-peil-18')).isStraatpeil).toBe(true); // 1970 — a + b + NAP + B&W
        expect(alignNlPeilToStraatpeil(byId('nl-peil-03')).isStraatpeil).toBe(true); // 0175 — "tot het perceel" variant
        const m = alignNlPeilToStraatpeil(byId('nl-peil-04')); // 0310/1701 — maaiveld only
        expect(m.branchA).toBe(false);
        expect(m.isStraatpeil).toBe(false);
        const a = alignNlPeilToStraatpeil(byId('nl-peil-15')); // 1699 — branch a, then maaiveld (no "voltooiing")
        expect(a.branchA).toBe(true);
        expect(a.branchB).toBe(false);
    });
});
