// §NL-PEIL — the datum tests. The prohibition under test is `NL-ENVELOPE-MASTER-PROMPT.md` §7.1:
// **never `peil = AHN elevation`**, and never a fabricated datum.
//
// The exemplar definition texts below are QUOTED FROM THE PHASE 0 SAMPLE
// (nl-phase0-report.json §M4_M5b.m4.clusters), not invented, so the classifier is tested against
// the corpus it will actually meet. Each carries the plan id it came from.

import { describe, it, expect } from 'vitest';
import {
    classifyNlPeilDefinition,
    resolveNlPeil,
    nlVerticalEnvelope,
    nlPeilToRuleState,
    NL_PEIL_REFERENCE_CLASSES,
} from '../src/rulepacks/nlPeil.js';

const REF = {
    country: 'NL',
    authority: 'Gemeente (bestemmingsplan)',
    dataset: 'ruimtelijkeplannen/IMRO2012',
    plan_id: 'NL.IMRO.TEST.PEIL-VG01',
    object_id: null,
    document: null,
    article: 'Artikel 1 (begripsbepalingen)',
    page: null,
} as const;

// ── Real corpus exemplars ─────────────────────────────────────────────────────────────────────

/** NL.IMRO.0736.BP018BgbWest-va02 — a genuinely SINGLE-reference definition (rare). */
const SINGLE_ROAD =
    'voor gebouwen die onmiddellijk aan de weg grenzen: de hoogte van de kruin van de weg.';

/** NL.IMRO.0344.BPCHWZUILEN-VA01 — four branches, the commonest Dutch shape. */
const MULTI_BRANCH =
    '1. Voor een gebouw, waarvan de hoofdtoegang grenst aan de weg: de hoogte van de kruin van de weg. ' +
    '2. Voor andere gebouwen en bouwwerken, geen gebouwen zijnde: de gemiddelde hoogte van het ' +
    'aansluitende afgewerkte maaiveld. 3. Voor gebouwen die grenzen aan een dijk: de hoogte van de ' +
    'kruin van de dijk ter plaatse van het bouwwerk.';

/** NL.IMRO.0148.Kernen2022-vs01 — the authority reserves the determination. */
const AUTHORITY_DETERMINED =
    'De gemiddelde hoogte van het aan het bouwwerk aansluitende maaiveld vóór het bouwrijp maken, ' +
    'in overige gevallen wordt het peil door burgemeester en wethouders nader bepaald.';

describe('classification uses the AUDIT vocabulary, and returns a SET', () => {
    it('classifies the single-reference road-crown definition as exactly one class', () => {
        expect(classifyNlPeilDefinition(SINGLE_ROAD)).toEqual(['road-crown']);
    });

    it('returns EVERY referenced class for a multi-branch definition — never just the first', () => {
        const c = classifyNlPeilDefinition(MULTI_BRANCH);
        expect(c).toContain('road-crown');
        expect(c).toContain('adjoining-finished-ground');
        expect(c).toContain('water-or-dike');
        expect(c.length).toBeGreaterThan(1);
    });

    it('never folds an unmatched definition into maaiveld — that fold IS the hard-code', () => {
        expect(classifyNlPeilDefinition('een geheel eigenzinnige formulering zonder trefwoorden'))
            .toEqual(['unclassified']);
    });

    it('an empty or absent definition classifies to nothing at all', () => {
        expect(classifyNlPeilDefinition('')).toEqual([]);
        expect(classifyNlPeilDefinition(null)).toEqual([]);
        expect(classifyNlPeilDefinition(undefined)).toEqual([]);
    });

    it('every emitted class is a member of the declared vocabulary', () => {
        for (const text of [SINGLE_ROAD, MULTI_BRANCH, AUTHORITY_DETERMINED, 'onzin']) {
            for (const c of classifyNlPeilDefinition(text)) {
                expect(NL_PEIL_REFERENCE_CLASSES).toContain(c);
            }
        }
    });
});

describe('⚠ THE PROHIBITION — an elevation for the WRONG reference never resolves the datum', () => {
    it('refuses AHN ground evidence against a road-crown peil', () => {
        const r = resolveNlPeil({
            definitionVerbatim: SINGLE_ROAD,
            evidence: {
                measuredAtClass: 'adjoining-finished-ground',
                elevationM_NAP: 3.2,
                method: 'AHN4 DTM 0.5 m, median over the parcel',
            },
        });
        expect(r.kind).toBe('datum-identified-elevation-unknown');
        if (r.kind !== 'datum-identified-elevation-unknown') throw new Error('narrowing');
        expect(r.requiredEvidence).toContain('does not resolve this datum');
        // and the wrong number is nowhere in the result
        expect(JSON.stringify(r)).not.toContain('3.2');
    });

    it('resolves ONLY when the evidence class matches the plan’s own reference', () => {
        const r = resolveNlPeil({
            definitionVerbatim: SINGLE_ROAD,
            evidence: {
                measuredAtClass: 'road-crown',
                elevationM_NAP: 4.15,
                method: 'AHN4 DTM 0.5 m, median over the adjoining road polygon (BGT wegdeel)',
            },
        });
        expect(r.kind).toBe('resolved');
        if (r.kind !== 'resolved') throw new Error('narrowing');
        expect(r.datumElevationM_NAP).toBe(4.15);
        expect(r.referenceClass).toBe('road-crown');
    });

    it('a bare elevation with no class is not expressible — enforced by the type, checked here', () => {
        // `NlPeilEvidence` has no arm without `measuredAtClass`. This test documents the intent
        // and fails loudly if a future edit makes the field optional.
        const r = resolveNlPeil({
            definitionVerbatim: SINGLE_ROAD,
            // @ts-expect-error — evidence without measuredAtClass must not type-check
            evidence: { elevationM_NAP: 3.2, method: 'AHN' },
        });
        expect(r.kind).toBe('datum-identified-elevation-unknown');
    });
});

describe('multi-branch peil is the `alternative` arm — not a range, not an average', () => {
    it('classifies as branch-dependent and names every branch', () => {
        const r = resolveNlPeil({ definitionVerbatim: MULTI_BRANCH });
        expect(r.kind).toBe('branch-dependent');
        if (r.kind !== 'branch-dependent') throw new Error('narrowing');
        expect(r.branches.length).toBeGreaterThan(1);
        expect(r.whyUnresolved).toContain('fact about the building');
    });

    it('branch-dependent resolves to RuleState `alternative`, never to a number', () => {
        const s = nlPeilToRuleState(resolveNlPeil({ definitionVerbatim: MULTI_BRANCH }), REF);
        expect(s.rule).toBe('A2');
        expect(s.status).toBe('alternative');
        if (s.status !== 'alternative') throw new Error('narrowing');
        expect(s.alternatives.length).toBeGreaterThanOrEqual(2);
        expect(s).not.toHaveProperty('value');
    });

    it('even WITH matching evidence, a branch-dependent peil stays unresolved', () => {
        // Holding the road elevation does not tell you the building's main entrance adjoins it.
        const r = resolveNlPeil({
            definitionVerbatim: MULTI_BRANCH,
            evidence: { measuredAtClass: 'road-crown', elevationM_NAP: 4.15, method: 'AHN4' },
        });
        expect(r.kind).toBe('branch-dependent');
    });
});

describe('a discretionary datum is never converted into a right (§7.8)', () => {
    it('authority-determined outranks a co-occurring physical class', () => {
        const r = resolveNlPeil({ definitionVerbatim: AUTHORITY_DETERMINED });
        expect(r.kind).toBe('authority-determined');
    });

    it('maps to refused / requires-determination — legally grounded, and not retryable', () => {
        const s = nlPeilToRuleState(resolveNlPeil({ definitionVerbatim: AUTHORITY_DETERMINED }), REF);
        expect(s.status).toBe('refused');
        if (s.status !== 'refused') throw new Error('narrowing');
        expect(s.basis).toBe('requires-determination');
        expect(s.reachability).toBe('undeterminable');
    });
});

describe('a missing definition is about PRYZM, not about the law', () => {
    it('is definition-not-recovered, with mechanism UNKNOWN — never `absent` (F1)', () => {
        const r = resolveNlPeil({ definitionVerbatim: null });
        expect(r.kind).toBe('definition-not-recovered');
        const s = nlPeilToRuleState(r, REF);
        if (s.status !== 'unrecovered') throw new Error('narrowing');
        expect(s.mechanism).toBe('unknown');
        expect(s.mechanism).not.toBe('absent');
        expect(s.failure).toBe('pdf');
    });

    it('an identified-but-unmeasured datum is mechanism PRESENT — the plan HAS a peil article', () => {
        const s = nlPeilToRuleState(resolveNlPeil({ definitionVerbatim: SINGLE_ROAD }), REF);
        if (s.status !== 'unrecovered') throw new Error('narrowing');
        expect(s.mechanism).toBe('present');
        expect(s.failure).toBe('semantic');
    });
});

describe('§7.1 `legally-bounded-datum-unresolved` is a VALUE, not a sentence', () => {
    it('an unresolved datum yields a bounded envelope with NO absolute level', () => {
        const v = nlVerticalEnvelope(12, 'bouwhoogte', resolveNlPeil({ definitionVerbatim: MULTI_BRANCH }));
        expect(v.limitM).toBe(12);
        expect(v.datumResolved).toBe(false);
        expect(v.datumElevationM_NAP).toBeNull();
        expect(v.statement).toContain('LEGALLY BOUNDED, DATUM UNRESOLVED');
        // ⚠ the guard: the module says out loud that AHN is not the definition
        expect(v.statement).toContain('never the legal definition');
    });

    it('a resolved datum yields the absolute NAP top, and shows its working', () => {
        const v = nlVerticalEnvelope(
            12,
            'bouwhoogte',
            resolveNlPeil({
                definitionVerbatim: SINGLE_ROAD,
                evidence: { measuredAtClass: 'road-crown', elevationM_NAP: 4.15, method: 'AHN4 over BGT wegdeel' },
            }),
        );
        expect(v.datumResolved).toBe(true);
        expect(v.datumElevationM_NAP).toBe(4.15);
        expect(v.statement).toContain('16.15');
    });

    it('goothoogte and bouwhoogte never merge — the limit KIND rides on the envelope', () => {
        const peil = resolveNlPeil({ definitionVerbatim: MULTI_BRANCH });
        expect(nlVerticalEnvelope(4, 'goothoogte', peil).limitKind).toBe('goothoogte');
        expect(nlVerticalEnvelope(10, 'bouwhoogte', peil).limitKind).toBe('bouwhoogte');
    });
});

describe('determinism (C58 §1.1)', () => {
    it('repeats byte-identically', () => {
        const first = JSON.stringify(resolveNlPeil({ definitionVerbatim: MULTI_BRANCH }));
        for (let i = 0; i < 50; i++) {
            expect(JSON.stringify(resolveNlPeil({ definitionVerbatim: MULTI_BRANCH }))).toBe(first);
        }
    });
});
