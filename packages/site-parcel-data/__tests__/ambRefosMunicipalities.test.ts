// §AMB-REFOS-MUNICIPALITIES — the dataset's own scope, and the three properties that make
// parameterising on it safe.
//
// ⚠ EXERCISES THE NEW PATH. `ambRefosMunicipalities.ts`, `ineCodeForJurisdiction` and
// `registeredJurisdictionIdForIne` did not exist before 2026-08-02; this file does not compile
// against the previous tree.
//
// ⚠ AT PACKAGE ROOT deliberately — `vitest.config.ts` includes `__tests__/**/*.test.ts` only, so a
// nested `src/**/__tests__/` file is silently uncollected.
//
// WHAT IS NOT TESTED HERE, AND WHY. There is no test asserting that a non-Barcelona municipality
// PUBLISHES anything, because none does and none should. Reachability and authorisation are
// separate questions; `envelopeAuthorisation.test.ts` owns the second one and it fails closed.

import { describe, it, expect } from 'vitest';
import {
    AMB_REFOS_MUNICIPALITIES,
    AMB_REFOS_SOURCE_DEFECTS,
    AMB_BARCELONA,
    ambMunicipalityByIne,
    isAmbRegisteredMunicipality,
    ineCodeForJurisdiction,
    registeredJurisdictionIdForIne,
    ineCodeLiteral,
    ambVolumetria18PackFor,
    ES_BARCELONA_VOLUMETRIA_18_PACK,
    BCN_INE_CODE,
    BCN_JURISDICTION_ID,
} from '../src/index.js';
// Not re-exported from the barrel (deliberately — it is a gate, not a data accessor).
import { isEnvelopePublicationAuthorised } from '../src/rulepacks/envelopeAuthorisation.js';

describe('§AMB-REFOS-SCOPE — 36 municipalities, read from the service', () => {
    it('carries exactly 36 municipalities, all distinct by INE', () => {
        // The service returned 37 ROWS over 36 distinct CODI_INE values on 2026-08-02 (08019
        // appears twice, once with an EMPTY NOMMUNI). 36 is the municipality count; the 37th row
        // is a source defect, recorded in AMB_REFOS_SOURCE_DEFECTS rather than silently deduped.
        expect(AMB_REFOS_MUNICIPALITIES).toHaveLength(36);
        const codes = AMB_REFOS_MUNICIPALITIES.map((m) => m.ineCode as string);
        expect(new Set(codes).size).toBe(36);
    });

    it('every INE code is five digits and the list is sorted by it', () => {
        const codes = AMB_REFOS_MUNICIPALITIES.map((m) => m.ineCode as string);
        for (const c of codes) expect(/^\d{5}$/.test(c), c).toBe(true);
        expect(codes).toEqual([...codes].sort());
    });

    it('every municipality is in Barcelona province (INE prefix 08)', () => {
        // A cheap cross-check on the transcription: the AMB is a Barcelona-province body, so a row
        // with any other prefix would be a typo. ⚠ It is NOT a collision check — 08196 passes this
        // in BOTH vocabularies, which is exactly why the prefix proves nothing about vocabulary.
        for (const m of AMB_REFOS_MUNICIPALITIES) {
            expect((m.ineCode as string).slice(0, 2), m.nameInSource).toBe('08');
        }
    });

    it('no municipality has an empty name — the source`s blank 08019 row is NOT transcribed', () => {
        // The defect is recorded as a source property; it must not have leaked into the table.
        for (const m of AMB_REFOS_MUNICIPALITIES) {
            expect(m.nameInSource.trim().length, m.ineCode as string).toBeGreaterThan(0);
        }
        expect(AMB_REFOS_SOURCE_DEFECTS.join(' ')).toMatch(/EMPTY `NOMMUNI`/);
    });

    it('08196 is present as the INE municipality — Sant Andreu de la Barca, NOT Llavaneres', () => {
        // ⚠ THE KNOWN-ANSWER CONTROL. If this row ever reads "Sant Andreu de Llavaneres", a DGC
        // value has been transcribed into an INE table and the AMB scope now names a municipality
        // 40 km outside the AMB.
        const m = ambMunicipalityByIne(ineCodeLiteral('08196'));
        expect(m).not.toBeNull();
        expect(m!.nameInSource).toBe('Sant Andreu de la Barca');
        expect(m!.nameInSource).not.toContain('Llavaneres');
    });
});

describe('§AMB-REFOS-SCOPE — lookup keeps reachability and registration apart', () => {
    it('Barcelona is registered, and its INE matches the provider constant', () => {
        expect(AMB_BARCELONA.ineCode).toBe(BCN_INE_CODE);
        expect(AMB_BARCELONA.ineCode).toBe('08019');
        expect(AMB_BARCELONA.jurisdictionId).toBe(BCN_JURISDICTION_ID);
        expect(isAmbRegisteredMunicipality(AMB_BARCELONA)).toBe(true);
    });

    it('exactly five AMB municipalities carry a PRYZM jurisdiction id; 31 carry null', () => {
        const registered = AMB_REFOS_MUNICIPALITIES.filter(isAmbRegisteredMunicipality);
        expect(registered.map((m) => m.ineCode as string).sort()).toEqual([
            '08015', // Badalona
            '08019', // Barcelona
            '08073', // Cornellà de Llobregat
            '08101', // L'Hospitalet de Llobregat
            '08200', // Sant Boi de Llobregat
        ]);
        expect(AMB_REFOS_MUNICIPALITIES.length - registered.length).toBe(31);
    });

    it('an out-of-scope INE returns null — a REACHABILITY answer, not a fact about the land', () => {
        // Madrid, València, Córdoba: real municipalities, real PRYZM jurisdictions, and the AMB
        // publishes nothing for any of them.
        for (const ine of ['28079', '46250', '14021', '00000']) {
            expect(ambMunicipalityByIne(ineCodeLiteral(ine)), ine).toBeNull();
        }
    });

    it('the type guard rejects unregistered municipalities, null and undefined', () => {
        const gava = ambMunicipalityByIne(ineCodeLiteral('08089'));
        expect(gava).not.toBeNull();
        expect(gava!.nameInSource).toBe('Gavà');
        expect(isAmbRegisteredMunicipality(gava)).toBe(false);
        expect(isAmbRegisteredMunicipality(null)).toBe(false);
        expect(isAmbRegisteredMunicipality(undefined)).toBe(false);
    });
});

describe('§JURISDICTION-ID-CARRIES-THE-INE — derived, never restated', () => {
    it('derives the INE code from a `<cc>-<INE>-<slug>` id', () => {
        expect(ineCodeForJurisdiction('es-08019-barcelona')).toBe('08019');
        expect(ineCodeForJurisdiction('es-08101-hospitalet')).toBe('08101');
        expect(ineCodeForJurisdiction('es-46250-valencia')).toBe('46250');
        expect(ineCodeForJurisdiction('es-08073-cornella-de-llobregat')).toBe('08073');
    });

    it('answers null for ids that encode NO municipality — which is true, not an error', () => {
        for (const id of ['ch', 'dk', 'nl-bestemmingsplan', 'es-catalunya', '', 'es-barcelona']) {
            expect(ineCodeForJurisdiction(id), id).toBeNull();
        }
    });

    it('§NO-DRIFT — the derivation agrees with the AMB table for all five registered ids', () => {
        // This is the whole reason there is no second lookup table: the two statements of the
        // mapping are the SAME statement. If someone adds an AMB row whose jurisdictionId does not
        // carry its own INE code, this fails rather than routing a point to the wrong municipality.
        for (const m of AMB_REFOS_MUNICIPALITIES.filter(isAmbRegisteredMunicipality)) {
            expect(
                ineCodeForJurisdiction(m.jurisdictionId),
                `${m.jurisdictionId} must carry INE ${m.ineCode}`,
            ).toBe(m.ineCode);
        }
    });

    it('resolves a REGISTERED jurisdiction from an INE code, and null when none is registered', () => {
        expect(registeredJurisdictionIdForIne(ineCodeLiteral('08019'))).toBe(BCN_JURISDICTION_ID);
        expect(registeredJurisdictionIdForIne(ineCodeLiteral('08101'))).toBe('es-08101-hospitalet');
        // Gavà, Viladecans, Tiana — inside the AMB, reachable, and PRYZM registers nothing.
        for (const ine of ['08089', '08301', '08282']) {
            expect(registeredJurisdictionIdForIne(ineCodeLiteral(ine)), ine).toBeNull();
        }
    });

    it('⛔ §AMB-VOLUMETRIA-18 — a pack is returned ONLY for Barcelona', () => {
        // The third unbinding. `siteDispatch.ts` used to name the Barcelona pack as a CONSTANT;
        // it now resolves it from the municipality, and that resolution must fail closed.
        expect(ambVolumetria18PackFor(ineCodeLiteral('08019'))).toBe(ES_BARCELONA_VOLUMETRIA_18_PACK);
        for (const m of AMB_REFOS_MUNICIPALITIES) {
            if ((m.ineCode as string) === '08019') continue;
            expect(
                ambVolumetria18PackFor(m.ineCode),
                `${m.ineCode} (${m.nameInSource}) must have NO clau-18 pack: the OV footprint is ` +
                    `metropolitan DATA but PGM Art. 306's force there is unrecorded, and two AMB ` +
                    `municipalities demonstrably REWROTE it (Cerdanyola, Sant Cugat).`,
            ).toBeNull();
        }
        expect(ambVolumetria18PackFor(ineCodeLiteral('28079'))).toBeNull();
    });

    it('⛔ §NO-MIS-CITATION — any pack returned must carry THAT municipality`s jurisdiction id', () => {
        // THE INVARIANT THAT CATCHES A LEAK. Adding `['08200', ES_BARCELONA_VOLUMETRIA_18_PACK]`
        // to the resolution map is the natural "extend it to Sant Boi" edit, and it would answer
        // Sant Boi's land under `es-08019-barcelona` and Barcelona's Art. 306 citation — the
        // §LH-ENVELOPE / L-652 mis-citation, silently. Asserting only "null for everyone else"
        // does NOT catch it (measured: that mutation stayed green). This does.
        for (const m of AMB_REFOS_MUNICIPALITIES) {
            const pack = ambVolumetria18PackFor(m.ineCode);
            if (!pack) continue;
            expect(
                ineCodeForJurisdiction(pack.jurisdictionId),
                `clau-18 pack served for INE ${m.ineCode} (${m.nameInSource}) carries ` +
                    `jurisdictionId "${pack.jurisdictionId}", which is a DIFFERENT municipality. ` +
                    `That publishes one town's land under another town's ordinance citation.`,
            ).toBe(m.ineCode);
            expect(pack.jurisdictionId).toBe(m.jurisdictionId);
        }
    });

    it('⛔ REACHABLE IS NOT PUBLISHED — 35 of 36 publish nothing, and Barcelona is the exception', () => {
        // THE COUNT STATEMENT, made executable. Parameterising the hardcodes moved the AMB from
        // "one municipality reachable" to "36 reachable"; it moved NOTHING into published.
        const publishing = AMB_REFOS_MUNICIPALITIES.filter(
            (m) => m.jurisdictionId !== null && isEnvelopePublicationAuthorised(m.jurisdictionId),
        );
        expect(publishing.map((m) => m.ineCode as string)).toEqual(['08019']);

        // The other four REGISTERED municipalities are gated shut, not unknown.
        for (const ine of ['08015', '08073', '08101', '08200']) {
            const m = ambMunicipalityByIne(ineCodeLiteral(ine))!;
            expect(isEnvelopePublicationAuthorised(m.jurisdictionId!), ine).toBe(false);
        }
        // ⚠ CORRECTED 2026-08-02 (L-678). This assertion used to be captioned *"the 31 unregistered
        // ones cannot even present an id to the gate"*, and that caption is no longer true — they
        // now present an AUTHORISATION id and answer `gate-shut` (`ambCorpusGate.test.ts`). What is
        // still true, and is what this field means, is that they carry no ROUTING REGISTRATION:
        // `AmbMunicipality.jurisdictionId` is non-null exactly when a `registry.ts` REGISTRATIONS
        // row exists, and it is that narrowness which keeps `isAmbRegisteredMunicipality` a usable
        // guard against a municipality falling into the PACK path. The two identities are
        // deliberately separate; widening this one would weaken the guard.
        for (const m of AMB_REFOS_MUNICIPALITIES.filter((x) => !isAmbRegisteredMunicipality(x))) {
            expect(m.jurisdictionId).toBeNull();
        }
    });
});
