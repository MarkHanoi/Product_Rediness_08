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

    it('the SHIPPED registry is EMPTY — enabling a jurisdiction is a founder line, not a default', () => {
        expect(OPEN_TOP_INDICATIVE_JURISDICTIONS.size).toBe(0);
        // ⇒ with the shipped registry, Balears draws NOTHING today.
        expect(envelopePublicationPosture(BALEARS_JURISDICTION_ID).posture).toBe('refused');
        expect(mayDrawEnvelope(BALEARS_JURISDICTION_ID)).toBe(false);
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

describe('§OPEN-TOP · 4 — RENDERING MUST MAKE IT UNMISTAKABLE, AND TODAY IT CANNOT', () => {
    it('⛔ SAYS SO IN CODE: the renderer cannot express an open top yet', () => {
        // ADR-0293: do not ship a solid that looks complete. The measured gap is that
        // `classifyEnvelopeCompleteness` takes confidence / hasRealHeight / footprintIsUpperBound
        // and has NO input for this posture — so an indicative envelope with a real height and a
        // solved footprint would classify `complete` and render in the confident violet.
        expect(rendererCanExpressOpenTop).toBe(false);
    });

    it('⇒ and that is exactly why the shipped registry is empty — the two facts agree', () => {
        if (!rendererCanExpressOpenTop) {
            expect(OPEN_TOP_INDICATIVE_JURISDICTIONS.size).toBe(0);
        }
    });
});
