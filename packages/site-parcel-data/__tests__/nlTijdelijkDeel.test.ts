// §NL-TIJDELIJK-DEEL — the routing between the two halves, the aliasing trap, and the classifier
// that is allowed to classify NOTHING.

import { describe, it, expect } from 'vitest';
import {
    NL_DSO_INTEGRATION,
    NL_CONDITIE_PATTERNS,
    checkNlDocumentAliasing,
    classifyNlConditie,
    nlTijdelijkDeelCoverage,
    nlTijdelijkDeelToRuleState,
    routeNlDocument,
    type NlDsoDocumentRecord,
} from '../src/rulepacks/nlTijdelijkDeel.js';

const REF = {
    country: 'NL',
    authority: 'DSO / Ozon',
    dataset: 'Omgevingsinformatie ontsluiten v2',
    plan_id: null,
    object_id: null,
    document: null,
    article: null,
    page: null,
} as const;

// Records shaped as the Ontsluiten v2 `Document` schema shapes them (fields quoted from the public
// OpenAPI document, 2026-09-04 — not invented).
const OW: NlDsoDocumentRecord = {
    uriIdentificatie: '/akn/nl/act/gm0363/2024/omgevingsplan',
    titel: 'Omgevingsplan Amsterdam',
    omgevingsdocumentMetadata: {
        expressionId: '/akn/nl/act/gm0363/2024/omgevingsplan/nld@2024-01-01;1',
        gerelateerdeTijdelijkeRegelingdelen: ['/akn/nl/act/gm0363/2024/bruidsschat'],
        gerelateerdeTijdelijkeOntwerpRegelingdelen: ['/akn/nl/act/gm0363/2025/ontwerp'],
    },
};
const IMRO: NlDsoDocumentRecord = {
    uriIdentificatie: 'NL.IMRO.0363.A1234BPSTD-VG01',
    titel: 'Bestemmingsplan Sloterdijk',
    imroDocumentMetadata: { imroVersie: 'IMRO2012', isTamPlan: false, heeftPlankaart: true, regelStatus: 'geheel onherroepelijk in werking' },
};

describe('routeNlDocument — which API serves which half', () => {
    it('an OW document routes to Presenteren v8 and carries its tijdelijke regelingdelen', () => {
        const r = routeNlDocument(OW);
        expect(r.half).toBe('ow-omgevingswet');
        expect(r.contentApi).toBe('presenteren-v8');
        expect(r.tijdelijkeRegelingdelen).toEqual(['/akn/nl/act/gm0363/2024/bruidsschat']);
        expect(r.ontwerpTijdelijkeRegelingdelen).toEqual(['/akn/nl/act/gm0363/2025/ontwerp']);
    });

    it('an IMRO document routes to ruimtelijkeplannen.nl — NOT to Presenteren', () => {
        const r = routeNlDocument(IMRO);
        expect(r.half).toBe('imro-wro');
        expect(r.contentApi).toBe('ruimtelijke-plannen-v4');
        expect(r.reason).toContain('ruimtelijkeplannen.nl');
    });

    it('isTamPlan distinguishes "false" from "not told" — they have different remedies', () => {
        expect(routeNlDocument(IMRO).isTamPlan).toBe(false);
        expect(routeNlDocument(IMRO).tamPlanKnown).toBe(true);
        const silent = routeNlDocument({ uriIdentificatie: 'x', imroDocumentMetadata: { imroVersie: 'IMRO2012' } });
        expect(silent.isTamPlan).toBe(false);
        expect(silent.tamPlanKnown).toBe(false); // ⚠ the pair, never the boolean alone
        const tam = routeNlDocument({ uriIdentificatie: 'y', imroDocumentMetadata: { isTamPlan: true } });
        expect(tam.isTamPlan).toBe(true);
        expect(tam.tamPlanKnown).toBe(true);
    });

    it('BOTH metadata blocks → indeterminate, never a guessed preference order', () => {
        const r = routeNlDocument({ ...OW, imroDocumentMetadata: { imroVersie: 'IMRO2012' } });
        expect(r.half).toBe('indeterminate');
        expect(r.contentApi).toBeNull();
        expect(r.reason).toContain('outside the published contract');
    });

    it('NEITHER metadata block → indeterminate, and the reason names why guessing is unsafe', () => {
        const r = routeNlDocument({ uriIdentificatie: 'q' });
        expect(r.half).toBe('indeterminate');
        expect(r.contentApi).toBeNull();
        expect(r.reason).toContain('404');
    });
});

describe('the aliasing trap — asking for a tijdelijk deel can return the hoofdregeling', () => {
    it('names the documented case rather than mis-attributing the rules', () => {
        expect(checkNlDocumentAliasing('/akn/nl/act/gm0363/2024/bruidsschat', OW)).toBe('hoofdregeling-returned-for-tijdelijk-deel');
    });

    it('the same document is the same document', () => {
        expect(checkNlDocumentAliasing(OW.uriIdentificatie, OW)).toBe('same-document');
    });

    it('an unrelated document is NOT silently accepted', () => {
        expect(checkNlDocumentAliasing('/akn/nl/act/gm9999/2024/iets', OW)).toBe('unexpected-document');
    });
});

describe('classifyNlConditie — a classifier that is allowed to classify nothing', () => {
    it('⛔ the pattern table is EMPTY, and this test is the guard against a fabricated one', () => {
        // A pattern may only be added WITH a citation naming the corpus read that observed it.
        // If this fails, either a corpus was read (update the test and cite it) or someone invented
        // a plausible Dutch phrase — which is the 10× `peil` error in a new costume.
        expect(NL_CONDITIE_PATTERNS.length).toBe(0);
    });

    it('an absent conditie is `absent`, not `unclassified` — the DSO said nothing, we did not fail', () => {
        expect(classifyNlConditie(null).klass).toBe('absent');
        expect(classifyNlConditie('   ').klass).toBe('absent');
        expect(classifyNlConditie(undefined).verbatim).toBeNull();
    });

    it('a real-looking conditie is UNCLASSIFIED and is carried verbatim for a human', () => {
        const c = classifyNlConditie('Dit tijdelijke deel geldt naast de hoofdregeling.');
        expect(c.klass).toBe('unclassified');
        expect(c.verbatim).toBe('Dit tijdelijke deel geldt naast de hoofdregeling.');
        expect(c.reason).toContain('NOT "subordinate"');
    });
});

describe('an UNREAD half is NOT CHECKED, never half-checked', () => {
    it('reading only the OW half still leaves overrides UNCHECKED, and names the missing half', () => {
        const c = nlTijdelijkDeelCoverage({ owRead: true, imroRead: false });
        expect(c.precedence).toBe('overrides-not-checked');
        expect(c.unreadHalves).toEqual(['imro-wro']);
        expect(c.caveat).toContain('imro-wro');
    });

    it('reading only the IMRO half is the same verdict, mirrored', () => {
        const c = nlTijdelijkDeelCoverage({ owRead: false, imroRead: true });
        expect(c.precedence).toBe('overrides-not-checked');
        expect(c.unreadHalves).toEqual(['ow-omgevingswet']);
    });

    it('reading neither names BOTH halves', () => {
        expect(nlTijdelijkDeelCoverage({ owRead: false, imroRead: false }).unreadHalves).toEqual(['ow-omgevingswet', 'imro-wro']);
    });

    it('both halves read, no override found → checked-none-apply, no caveat', () => {
        const c = nlTijdelijkDeelCoverage({ owRead: true, imroRead: true });
        expect(c.precedence).toBe('overrides-checked-none-apply');
        expect(c.caveat).toBeNull();
    });

    it('both halves read and an override applied → checked-applied', () => {
        expect(nlTijdelijkDeelCoverage({ owRead: true, imroRead: true, overrideApplied: true }).precedence).toBe('overrides-checked-applied');
    });
});

describe('the B1 projection', () => {
    it('both halves read → resolved / source-complete', () => {
        const s = nlTijdelijkDeelToRuleState({ owRead: true, imroRead: true }, REF);
        expect(s.status).toBe('resolved');
        expect(s.status === 'resolved' && s.value).toBe('overrides-checked-none-apply');
        expect(s.reachability).toBe('source-complete');
    });

    it('a missing half is INACCESSIBLE with the mechanism PRESENT — a credential, not a build', () => {
        const s = nlTijdelijkDeelToRuleState({ owRead: false, imroRead: true }, REF);
        expect(s.status).toBe('unrecovered');
        if (s.status !== 'unrecovered') return;
        expect(s.failure).toBe('inaccessible'); // ⚠ never `not-built`: the mechanism is published
        expect(s.mechanism).toBe('present');
        expect(s.stoppedAt).toContain('x-api-key');
        expect(s.partial?.verbatim).toContain('overrides not checked');
    });
});

describe('the integration constant records what was VERIFIED, and what was not', () => {
    it('the three surfaces are named with the quote that established each', () => {
        expect(NL_DSO_INTEGRATION.discovery.endpoint).toContain('/ontsluiten/v2/documenten/_zoek');
        expect(NL_DSO_INTEGRATION.discovery.quote).toContain('zowel omgevingsdocumenten');
        expect(NL_DSO_INTEGRATION.owContent.api).toContain('Presenteren');
        expect(NL_DSO_INTEGRATION.imroContent.endpoint).toContain('ruimtelijke-plannen');
    });

    it('⛔ the credential is recorded as NOT HELD, and as a human registration', () => {
        expect(NL_DSO_INTEGRATION.credential.heldInThisEnvironment).toBe(false);
        expect(NL_DSO_INTEGRATION.credential.obtainedBy).toContain('HUMAN');
        expect(NL_DSO_INTEGRATION.verifiedBy).toContain('no key held');
    });
});
