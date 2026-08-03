// §OPEN-TOP-INDICATIVE — the third publication state: DRAW, BUT REFUSE TO CLAIM.
//
// ⭐ THE TEST THAT MATTERS MOST IS `mayPublishAsDetermination` RETURNING **false** FOR AN INDICATIVE
// JURISDICTION. Everything else here protects that one property from being eroded — because the only
// way this state does harm is by quietly becoming `gate-open` with a nicer label.

import { describe, it, expect } from 'vitest';
import {
    envelopePublicationPosture,
    mayPublishAsDetermination,
    mayDrawEnvelope,
    openTopIndicativeRecord,
    OPEN_TOP_INDICATIVE_JURISDICTIONS,
    BALEARS_OPEN_TOP_INDICATIVE,
    rendererCanExpressOpenTop,
    type OpenTopIndicativeRecord,
} from '../src/rulepacks/openTopIndicative.js';
import {
    envelopePublicationAuthorisation,
    isEnvelopePublicationAuthorised,
} from '../src/rulepacks/envelopeAuthorisation.js';
import { BALEARS_JURISDICTION_ID } from '../src/rulepacks/esBalearsMuib.js';
import { MURCIA_JURISDICTION_ID } from '../src/rulepacks/esMurciaEnvelope.js';
import { MADRID_JURISDICTION_ID } from '../src/rulepacks/esMadridNZ1.js';

/** A registry populated ONLY for the test — the shipped one stays empty (a founder decision). */
const withBalears: ReadonlyMap<string, OpenTopIndicativeRecord> = new Map([
    [BALEARS_JURISDICTION_ID, BALEARS_OPEN_TOP_INDICATIVE],
]);

describe('§OPEN-TOP · 1 — IT IS NOT `gate-open` WITH A LABEL', () => {
    it('⭐ A DETERMINATION-LEVEL CONSUMER REFUSES AN OPEN-TOP-INDICATIVE ENVELOPE', () => {
        expect(envelopePublicationPosture(BALEARS_JURISDICTION_ID, withBalears).posture).toBe(
            'open-top-indicative',
        );
        // ⛔ THE CONTRACT. Anything that states a buildable right calls this and gets NO.
        expect(mayPublishAsDetermination(BALEARS_JURISDICTION_ID, withBalears)).toBe(false);
        // …and it is nonetheless DRAWABLE, which is the entire point of the state.
        expect(mayDrawEnvelope(BALEARS_JURISDICTION_ID, withBalears)).toBe(true);
    });

    it('the two postures are distinguishable PROGRAMMATICALLY, not by reading prose', () => {
        const indicative = envelopePublicationPosture(BALEARS_JURISDICTION_ID, withBalears);
        const determination = envelopePublicationPosture(MURCIA_JURISDICTION_ID, withBalears);
        expect(determination.posture).toBe('determination'); // MURCIA_ENVELOPE_VERIFIED is signed
        expect(indicative.posture).not.toBe(determination.posture);
        expect(indicative.openTop).not.toBeNull();
        expect(determination.openTop).toBeNull();
    });

    it('⛔ IT CANNOT WIDEN THE OWNED GATE — `isEnvelopePublicationAuthorised` is untouched', () => {
        // Listing Balears indicative does not, and must never, authorise it as a determination.
        expect(isEnvelopePublicationAuthorised(BALEARS_JURISDICTION_ID)).toBe(false);
        expect(envelopePublicationAuthorisation(BALEARS_JURISDICTION_ID).authorised).toBe(false);
    });
});

describe('§OPEN-TOP · 2 — IT STILL FAILS CLOSED FOR AN UNLISTED JURISDICTION', () => {
    it('an id nobody has assessed is `refused` / `unknown-jurisdiction` — NEVER indicative', () => {
        const p = envelopePublicationPosture('es-99999-nowhere', withBalears);
        expect(p.posture).toBe('refused');
        expect(p.authorisationReason).toBe('unknown-jurisdiction');
        expect(mayDrawEnvelope('es-99999-nowhere', withBalears)).toBe(false);
    });

    it('⚠ `gate-shut` and `unknown-jurisdiction` STAY DISTINGUISHABLE through the refinement', () => {
        // Madrid declares a gate and it is SHUT — "a human has not signed yet".
        const shut = envelopePublicationPosture(MADRID_JURISDICTION_ID, withBalears);
        // A made-up id was never assessed at all — a different statement entirely.
        const unknown = envelopePublicationPosture('xx-nowhere', withBalears);
        expect(shut.posture).toBe('refused');
        expect(unknown.posture).toBe('refused');
        expect(shut.authorisationReason).toBe('gate-shut');
        expect(unknown.authorisationReason).toBe('unknown-jurisdiction');
        expect(shut.authorisationReason).not.toBe(unknown.authorisationReason);
    });

    it('the SHIPPED registry holds exactly the founder-listed jurisdictions, nothing implicit', () => {
        // ⚠ 2026-08-03: the founder listed Balears (renderer capability closed, tests green).
        // The invariant this guards did not change — membership is still by EXPLICIT ENTRY, never a
        // default — only the registry's contents did.
        expect(OPEN_TOP_INDICATIVE_JURISDICTIONS.size).toBe(1);
        expect(OPEN_TOP_INDICATIVE_JURISDICTIONS.has(BALEARS_JURISDICTION_ID)).toBe(true);
        // ⇒ with the shipped registry, Balears now DRAWS as indicative, never a determination.
        expect(envelopePublicationPosture(BALEARS_JURISDICTION_ID).posture).toBe('open-top-indicative');
        expect(mayDrawEnvelope(BALEARS_JURISDICTION_ID)).toBe(true);
        expect(mayPublishAsDetermination(BALEARS_JURISDICTION_ID)).toBe(false);
        // An id nobody has listed still fails closed — the property this whole file protects.
        expect(envelopePublicationPosture('es-99999-nowhere').posture).toBe('refused');
    });
});

describe('§OPEN-TOP · 3 — THE REASON LIST IS DATA, NOT DECORATION', () => {
    it('⛔ REFUSES to construct a record that names no missing constraint', () => {
        expect(() =>
            openTopIndicativeRecord({
                jurisdictionId: 'xx-test',
                reason: 'constraints-not-modelled',
                missingConstraints: [],
                legalProvenance: 'whatever',
                supersession: 'NOT_VERIFIED',
                articleGovernance: 'NOT_ESTABLISHED',
            }),
        ).toThrow(/closed box wearing a label/i);
    });

    it('the Balears record enumerates its risks, and states what is NOT verified', () => {
        const r = BALEARS_OPEN_TOP_INDICATIVE;
        expect(r.reason).toBe('constraints-not-modelled');
        expect(r.missingConstraints.length).toBeGreaterThanOrEqual(5);
        const joined = r.missingConstraints.join(' ').toLowerCase();
        for (const f of ['heritage', 'flood', 'airport', 'coastal', 'environmental', 'pti']) {
            expect(joined, f).toContain(f);
        }
        // ⚠ NOT_VERIFIED is the honest default and must not quietly become VERIFIED.
        expect(r.supersession).toBe('NOT_VERIFIED');
        expect(r.articleGovernance).toBe('NOT_ESTABLISHED');
        expect(r.legalProvenance).toMatch(/fitxa/i);
    });

    it('a constructed record is frozen — its risk list cannot be emptied after the fact', () => {
        expect(Object.isFrozen(BALEARS_OPEN_TOP_INDICATIVE)).toBe(true);
        expect(Object.isFrozen(BALEARS_OPEN_TOP_INDICATIVE.missingConstraints)).toBe(true);
    });
});

describe('§OPEN-TOP · 4 — RENDERING MUST MAKE IT UNMISTAKABLE, AND NOW IT DOES', () => {
    it('⭐ SAYS SO IN CODE: the renderer CAN express an open top', () => {
        // ADR-0293: do not ship a solid that looks complete. The measured gap was that
        // `classifyEnvelopeCompleteness` took confidence / hasRealHeight / footprintIsUpperBound and
        // had NO input for this posture — so an indicative envelope with a real height and a solved
        // footprint classified `complete` and rendered in the confident violet. The posture is now a
        // FOURTH input, `complete` is unreachable for it, and both rasterisers draw it uncapped.
        expect(rendererCanExpressOpenTop).toBe(true);
    });

    it('⛔ THE PICTURE CHANGED FIRST, THE PERMISSION SECOND — and they stayed independent facts', () => {
        // The renderer capability (`rendererCanExpressOpenTop`) and the listing decision were always
        // two separate facts, proven separate while the registry was still empty. Both are now true,
        // but nothing here collapses them into one another.
        expect(rendererCanExpressOpenTop).toBe(true);
        expect(OPEN_TOP_INDICATIVE_JURISDICTIONS.has(BALEARS_JURISDICTION_ID)).toBe(true);
    });

    it('⛔ BALEARS IS LISTED AS INDICATIVE ONLY — its determination gate stays SHUT', () => {
        // Listed (see §1/§4 above) — but listing NARROWS, never WIDENS: the owned determination gate
        // is untouched and unread by this decision.
        expect(OPEN_TOP_INDICATIVE_JURISDICTIONS.has(BALEARS_JURISDICTION_ID)).toBe(true);
        expect(isEnvelopePublicationAuthorised(BALEARS_JURISDICTION_ID)).toBe(false);
        // ⇒ so with the SHIPPED registry, a Balears click draws an open-top indicative volume —
        // never a determination.
        expect(mayDrawEnvelope(BALEARS_JURISDICTION_ID)).toBe(true);
        expect(mayPublishAsDetermination(BALEARS_JURISDICTION_ID)).toBe(false);
    });

    it('the injected registry and the shipped registry now agree on Balears', () => {
        // `withBalears` was built to PROVE the edit would work before it was made; it still matches
        // the shipped registry's behaviour now that the edit exists.
        expect(mayDrawEnvelope(BALEARS_JURISDICTION_ID, withBalears)).toBe(true);
        expect(mayPublishAsDetermination(BALEARS_JURISDICTION_ID, withBalears)).toBe(false);
        expect(envelopePublicationPosture(BALEARS_JURISDICTION_ID, withBalears).posture).toBe(
            envelopePublicationPosture(BALEARS_JURISDICTION_ID).posture,
        );
    });
});
