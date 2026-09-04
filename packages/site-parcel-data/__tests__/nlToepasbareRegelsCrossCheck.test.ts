// §NL-TOEPASBARE-REGELS-CROSSCHECK — the DSO's executable rule as a second representation; disagree → REVIEW.

import { describe, it, expect } from 'vitest';
import {
    DSO_CONCLUSIE_CODES,
    NL_TOEPASBARE_REGELS_SURFACE,
    crossCheckNlPermitVerdict,
    nlVerdictToDsoCode,
    nlVergunningvrijOutcomeToVerdict,
    type NlDsoConclusie,
} from '../src/rulepacks/nlToepasbareRegelsCrossCheck.js';
import { resolveNlVergunningvrijOpa } from '../src/rulepacks/nlVergunningvrij.js';

const dso = (code: NlDsoConclusie extends { kind: 'conclusie'; code: infer C } ? C : never, openVragen = 0, regelRefs: string[] = []): NlDsoConclusie => ({
    kind: 'conclusie',
    code,
    activiteitUrn: 'urn:dso:activiteit:bouwen-bijbehorend-bouwwerk',
    openVragen,
    regelRefs,
});

describe('the probed surface and the DSO vocabulary', () => {
    it('the conclusion codes are the Uitvoeren v3 enum, verbatim, seven members', () => {
        expect(DSO_CONCLUSIE_CODES).toEqual(['NietVanToepassing', 'Verbod', 'Vergunningplicht', 'Meldingsplicht', 'Informatieplicht', 'Toestemmingsvrij', 'NeemContactOpMet']);
    });

    it('the surface record names five register APIs, no key held, and their anonymous readings', () => {
        expect(NL_TOEPASBARE_REGELS_SURFACE.apiKeyHeld).toBe(false);
        expect(NL_TOEPASBARE_REGELS_SURFACE.apis.length).toBe(5);
        for (const a of NL_TOEPASBARE_REGELS_SURFACE.apis) {
            expect(a.base.startsWith('https://service.omgevingswet.overheid.nl/publiek/')).toBe(true);
            expect([401, 404]).toContain(a.anonymousAppInfo);
        }
    });

    it('every comparable verdict maps to exactly one DSO code; undetermined maps to none', () => {
        expect(nlVerdictToDsoCode('vergunningvrij')).toBe('Toestemmingsvrij');
        expect(nlVerdictToDsoCode('vergunningplichtig')).toBe('Vergunningplicht');
        expect(nlVerdictToDsoCode('meldingsplichtig')).toBe('Meldingsplicht');
        expect(nlVerdictToDsoCode('informatieplichtig')).toBe('Informatieplicht');
        expect(nlVerdictToDsoCode('verboden')).toBe('Verbod');
        expect(nlVerdictToDsoCode('not-applicable')).toBe('NietVanToepassing');
        expect(nlVerdictToDsoCode('undetermined')).toBeNull();
    });
});

describe('crossCheckNlPermitVerdict', () => {
    it('agreement is corroboration, not proof — the why says so', () => {
        const r = crossCheckNlPermitVerdict('vergunningvrij', dso('Toestemmingsvrij'));
        expect(r.verdict).toBe('agree');
        expect(r.why).toContain('not proof');
    });

    it('disagreement → REVIEW, neither adopted; regelRefs are quoted', () => {
        const r = crossCheckNlPermitVerdict('vergunningvrij', dso('Vergunningplicht', 0, ['omgevingsplan art. 22.36 lid 1 onder a']));
        expect(r.verdict).toBe('disagree-review');
        expect(r.why).toContain('REVIEW');
        expect(r.why).toContain('22.36');
        expect(r.oursAsDso).toBe('Toestemmingsvrij');
    });

    it('our undetermined → not-comparable, and the DSO answer is NOT adopted', () => {
        const r = crossCheckNlPermitVerdict('undetermined', dso('Toestemmingsvrij'));
        expect(r.verdict).toBe('not-comparable');
        expect(r.why).toContain('NOT adopted');
    });

    it('NeemContactOpMet is a referral, not a verdict → inconclusive', () => {
        expect(crossCheckNlPermitVerdict('vergunningvrij', dso('NeemContactOpMet')).verdict).toBe('dso-inconclusive');
    });

    it('a conclusion read with open vragen is provisional → inconclusive, even when the codes match', () => {
        const r = crossCheckNlPermitVerdict('vergunningvrij', dso('Toestemmingsvrij', 2));
        expect(r.verdict).toBe('dso-inconclusive');
        expect(r.why).toContain('2 vraag/vragen');
    });

    it('DSO unavailable (no key) → our verdict stands UNCHECKED, stated as a fact about the check', () => {
        const r = crossCheckNlPermitVerdict('vergunningplichtig', { kind: 'unavailable', reason: 'no-api-key', detail: 'HTTP 401 Inloggegevens ontbreken' });
        expect(r.verdict).toBe('dso-unavailable');
        expect(r.dsoCode).toBeNull();
        expect(r.why).toContain('UNCHECKED');
    });
});

describe('lifting the round-two vergunningvrij outcome into a verdict', () => {
    it('national floor applies → vergunningvrij; heritage exclusion → vergunningplichtig', () => {
        const floor = resolveNlVergunningvrijOpa({
            activity: 'art-2.29-listed-case',
            heritage: { monument: 'none', rijksbeschermdGezichtFunctieaanduiding: false },
            municipalOverlay: { read: false },
        });
        expect(nlVergunningvrijOutcomeToVerdict(floor)).toBe('vergunningvrij');
        const excluded = resolveNlVergunningvrijOpa({
            activity: 'art-2.29-listed-case',
            heritage: { monument: 'rijks', rijksbeschermdGezichtFunctieaanduiding: false },
            municipalOverlay: { read: false },
        });
        expect(nlVergunningvrijOutcomeToVerdict(excluded)).toBe('vergunningplichtig');
    });

    it('every "we do not know yet" arm lifts to undetermined, never to a guess', () => {
        const unknownHeritage = resolveNlVergunningvrijOpa({
            activity: 'art-2.29-listed-case',
            heritage: { monument: 'unknown', rijksbeschermdGezichtFunctieaanduiding: null },
            municipalOverlay: { read: false },
        });
        expect(nlVergunningvrijOutcomeToVerdict(unknownHeritage)).toBe('undetermined');
        const municipal = resolveNlVergunningvrijOpa({
            activity: 'bijbehorend-bouwwerk',
            heritage: { monument: 'none', rijksbeschermdGezichtFunctieaanduiding: false },
            municipalOverlay: { read: false },
        });
        expect(nlVergunningvrijOutcomeToVerdict(municipal)).toBe('undetermined');
    });

    it('the municipal overlay verdicts map: replaced-by-melding → meldingsplichtig; not-vergunningvrij → vergunningplichtig; unclear → undetermined', () => {
        const mk = (v: 'replaced-by-melding' | 'not-vergunningvrij' | 'unclear' | 'extended') =>
            resolveNlVergunningvrijOpa({
                activity: 'bijbehorend-bouwwerk',
                heritage: { monument: 'none', rijksbeschermdGezichtFunctieaanduiding: false },
                municipalOverlay: { read: true, bijbehorendeBouwwerken: v, citation: 'omgevingsplan art. 22.36' },
            });
        expect(nlVergunningvrijOutcomeToVerdict(mk('replaced-by-melding'))).toBe('meldingsplichtig');
        expect(nlVergunningvrijOutcomeToVerdict(mk('not-vergunningvrij'))).toBe('vergunningplichtig');
        expect(nlVergunningvrijOutcomeToVerdict(mk('unclear'))).toBe('undetermined');
        expect(nlVergunningvrijOutcomeToVerdict(mk('extended'))).toBe('vergunningvrij');
    });
});
