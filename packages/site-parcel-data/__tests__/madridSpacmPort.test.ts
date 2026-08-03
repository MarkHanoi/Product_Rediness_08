// §MADRID-SPACM-PORT (L-681) — THE REACHABILITY TEST.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS SEPARATELY FROM THE 135 TESTS IN `tools/madrid-envelope-engine/__tests__/`
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Those 135 exercise the RULES, offline, against 3.8 MB of committed live fixtures — and they now
// import this package, so they already prove the ported logic is correct. What they cannot prove is
// the thing the port was FOR: that the adapter is **reachable** — exported from the package barrel,
// registered as a jurisdiction, and out-ranked by the capital rather than merged into it.
//
// ⚠⚠ **REACHABILITY, NOT EXISTENCE, IS THE PROPERTY THAT WAS MISSING.** The standing lesson
// (§authored-but-unwired): six parcel providers and five envelope packs were fully authored,
// fully tested, and had ZERO registry references — so they answered nobody. Auditing that a file
// exists proves nothing. This file asserts the wiring.
//
// The proof parcel is inlined rather than read from the tool's fixtures: one ordinance row is 20
// lines, and copying 3.8 MB of capture into a package that does not need it would be the wrong
// trade. Every value below is the row `probe/05-prove-one-parcel.mjs` captured live from
// `sitcm:VPLA_V_ORDENANZA`, record 253995.

import { describe, it, expect } from 'vitest';
import {
    adaptSpacmRow,
    isMadridSpacmDrawable,
    CM_SPACM_JURISDICTION_ID,
    CM_SPACM_ENVELOPE_VERIFIED,
    CM_SPACM_PROVEN_PARCEL,
    CM_SPACM_REGISTRATION_BLOCKED,
    comunidadMadridNoRulePackRefusal,
    isInComunidadMadrid,
    isComunidadMadridIneCode,
    madridSpacmEnvelopeRefusalCodeFor,
    listJurisdictionCoverage,
    resolveRegisteredJurisdictionAt,
    type SpacmOrdenanzaRow,
} from '../src/index.js';

/**
 * ⭐ THE PROVEN PARCEL — `4228504VK2742N`, CL JUAN DE VILLANUEVA 10, BOADILLA DEL MONTE.
 *
 * ⚠ A LABELLED FALLBACK FROM THE CAPITAL, and the label is the point. Madrid capital publishes no
 * height, depth or setback at any granularity (24,718 municipal fields swept, zero hits), so no
 * solid can be drawn there without inventing a storey height. Boadilla was the pre-declared
 * fallback, not a municipality picked after the fact because it happened to work.
 */
const BOADILLA_ROW: SpacmOrdenanzaRow = {
    CDID: 253995,
    CD_MUNICIPIO: '022',
    DS_MUNICIPIO: 'BOADILLA DEL MONTE',
    DS_NOMB_ORD: 'RESIDENCIAL UNIFAMILIAR',
    DS_NOM_AMB: null,
    DS_CLAS_SUE: 'Suelo Urbano Consolidado',
    NM_ALTURA: 7,
    NM_N_PLTA: 2,
    NM_OCP_MX: 70,
    NM_FDO_MX_ED: null,
    NM_RTR_FRNT: 3,
    NM_RTR_LATL: 3,
    NM_RTR_POST: 3,
    NM_C_ED_ORD: null,
    NM_C_ED_MAZ: 0.7,
    NM_FRTE_MIN: null,
    DS_LEY: 'CM Ley 9/2001, E Ley 6/1998',
    DS_DOCU: 'PLAN GENERAL',
    DS_PLANEAM_GRAL: 'MATRIZ',
    FC_BOCM: '2015-10-28',
};

/** Boadilla del Monte town centre, EPSG:4326 — the point the live capture resolved from. */
const BOADILLA_AT = { lat: 40.401193, lon: -3.89331 };

describe('§MADRID-SPACM-PORT — the adapter survived the move to @pryzm/site-parcel-data', () => {
    it('still draws the Boadilla parcel, field for field, through the package barrel', () => {
        const record = adaptSpacmRow(BOADILLA_ROW, { verificationGateOpen: true });

        expect(record.municipality).toEqual({
            code: '022',
            name: 'BOADILLA DEL MONTE',
            ine5: '28022',
        });
        expect(record.zoningCode.code).toBe('RESIDENCIAL UNIFAMILIAR');
        expect(record.grammar).toBe('setback');
        // ⭐ A SHIPPED `GeometricRule` kind. No Madrid-specific solver exists, and adding one would
        // be a second composition root for zoning.
        expect(record.envelope).toEqual({ kind: 'setback', front_m: 3, side_m: 3, rear_m: 3 });
        expect(isMadridSpacmDrawable(record)).toBe(true);
    });

    it('cites the record it read — source, dataset, document, statute and BOCM date', () => {
        const record = adaptSpacmRow(BOADILLA_ROW, { verificationGateOpen: true });
        expect(record.provenance.source).toBe('idem.comunidad.madrid/geoserver3/wfs');
        expect(record.provenance.dataset).toBe('sitcm:VPLA_V_ORDENANZA');
        expect(record.provenance.recordId).toBe(253995);
        expect(record.provenance.document).toBe('PLAN GENERAL / MATRIZ');
        expect(record.provenance.statute).toBe('CM Ley 9/2001, E Ley 6/1998');
        expect(record.provenance.published).toBe('2015-10-28');
    });

    it('⛔ NEVER DRAWS AN UNKNOWN AS ZERO — depth and frontage stay null, not 0', () => {
        const record = adaptSpacmRow(BOADILLA_ROW, { verificationGateOpen: true });
        expect(record.rules.depth_m.value).toBeNull();
        expect(record.rules.depth_m.provenance).toBe('unknown');
        expect(record.rules.minFrontage_m.value).toBeNull();
        expect(record.rules.minFrontage_m.provenance).toBe('unknown');
        // And the FAR that IS published records WHICH column it came from — `NM_C_ED_MAZ` is per
        // MANZANA, a different granularity from `NM_C_ED_ORD`. A consumer must be able to tell.
        expect(record.rules.plotRatioFAR.value).toBe(0.7);
        expect(record.rules.plotRatioFAR.sourceField).toBe('NM_C_ED_MAZ');
    });

    it('⚠ every envelope is an OPEN TOP and says which constraints are not held (ADR-0293)', () => {
        const record = adaptSpacmRow(BOADILLA_ROW, { verificationGateOpen: true });
        expect(record.missingConstraints.length).toBeGreaterThan(0);
        const joined = record.missingConstraints.join(' ');
        expect(joined).toMatch(/AESA/);
        expect(joined).toMatch(/Heritage/);
        expect(joined).toMatch(/Flood/);
    });

    it('⛔ SHIPS NOTHING with the L-449 gate shut — and reports the gate as its OWN refusal', () => {
        const shipped = adaptSpacmRow(BOADILLA_ROW);
        expect(CM_SPACM_ENVELOPE_VERIFIED).toBe(false);
        expect(isMadridSpacmDrawable(shipped)).toBe(false);
        expect(shipped.envelope).toBeNull();
        expect(shipped.refusals.map((r) => r.reason)).toEqual(['verification-gate-closed']);
        // ⚠ The gate is the ONLY refusal here, which is the honest reading: routing is clean on
        // this parcel (the general plan orders it directly) and the parameters are complete. If the
        // gate short-circuited the other checks, signing it would expose refusals nobody had seen.
    });

    it('pins the proven parcel constant against the row it was derived from', () => {
        expect(CM_SPACM_PROVEN_PARCEL.cdMunicipio).toBe(BOADILLA_ROW.CD_MUNICIPIO);
        expect(CM_SPACM_PROVEN_PARCEL.recordId).toBe(BOADILLA_ROW.CDID);
        expect(CM_SPACM_PROVEN_PARCEL.zone).toBe(BOADILLA_ROW.DS_NOMB_ORD);
        expect(CM_SPACM_PROVEN_PARCEL.ine5).toBe('28022');
    });
});

describe('§CM-REGISTRATION-BLOCKED — reachable BY IMPORT, not yet BY CLICK, and it says so', () => {
    /**
     * ⛔⛔ THE HALF THAT DID NOT LAND, PINNED SO IT CANNOT BE MISTAKEN FOR DONE.
     *
     * ⚠ MY FIRST DIAGNOSIS WAS WRONG AND IS KEPT IN THE RECORD. I asserted `MADRID_BBOX` was
     * "~6 km too loose" and should be tightened. Sourcing the competent authority's own boundaries
     * (`Callejero:SIGI_V_MUNICIPIOS`, keyless, 2026-08-02) refuted it: the shipped `-3.90` sits
     * **938 m** outside a real `-3.888963`, which is the deliberate outward-rounding discipline
     * every `*Bbox.ts` here states. The real obstacle is that Madrid 28079 (lon [-3.8890,-3.5181])
     * and Boadilla 28022 (lon [-3.9526,-3.8378]) genuinely INTERLEAVE — 4.35 km of longitudinal
     * overlap — so NO rectangle separates them, and the registration was withdrawn rather than
     * forced through by loosening a guard.
     *
     * The unblocker is named and now known to exist: `Callejero:SIGI_V_MUNICIPIOS` publishes all
     * 179 municipal boundary POLYGONS, keyless, on the same endpoint as the ordinance corpus. See
     * `esMadridSpacm.ts` §CM-REGISTRATION-BLOCKED.
     */
    it('is NOT registered — and the constant that says so is honest about it', () => {
        expect(CM_SPACM_REGISTRATION_BLOCKED).toBe(true);
        const cm = listJurisdictionCoverage().find(
            (j) => j.jurisdictionId === CM_SPACM_JURISDICTION_ID,
        );
        expect(
            cm,
            'The Comunidad de Madrid registration was withdrawn — a rectangle cannot route between ' +
                'the capital and Boadilla. When a polygon routing gate lands, register it and flip ' +
                'CM_SPACM_REGISTRATION_BLOCKED in the same commit.',
        ).toBeUndefined();
    });

    it('⚠ MEASURED — the capital and Boadilla bounding boxes genuinely overlap', () => {
        // Read live 2026-08-02 from `Callejero:SIGI_V_MUNICIPIOS` (CDMUNICIPIO '079' / '022').
        const MADRID = { minLon: -3.888963, maxLon: -3.518126, minLat: 40.312065, maxLat: 40.64328 };
        const BOADILLA = { minLon: -3.952589, maxLon: -3.837814, minLat: 40.377684, maxLat: 40.456197 };
        const lonOverlap = Math.min(MADRID.maxLon, BOADILLA.maxLon) - Math.max(MADRID.minLon, BOADILLA.minLon);
        const latOverlap = Math.min(MADRID.maxLat, BOADILLA.maxLat) - Math.max(MADRID.minLat, BOADILLA.minLat);
        // ⇒ Both positive: the boxes intersect. A rectangle-based gate CANNOT tell them apart, and
        // no amount of tightening changes that — which is why the registration was withdrawn.
        expect(lonOverlap).toBeGreaterThan(0);
        expect(latOverlap).toBeGreaterThan(0);
        // The proven parcel is inside Boadilla's real term and OUTSIDE the capital's.
        expect(BOADILLA_AT.lon).toBeGreaterThan(BOADILLA.minLon);
        expect(BOADILLA_AT.lon).toBeLessThan(BOADILLA.maxLon);
        expect(BOADILLA_AT.lon).toBeLessThan(MADRID.minLon);
        // …yet the shipped capital gate, correctly rounded OUTWARD, still claims it.
        expect(isInComunidadMadrid(BOADILLA_AT.lat, BOADILLA_AT.lon)).toBe(true);
    });

    it('⚠⚠ NOTHING WAS BROKEN GETTING HERE — the capital still resolves to the capital', () => {
        // Puerta del Sol. The registry is byte-identical to HEAD after this pass, so this is a
        // regression guard on the port, not a claim about new routing.
        const sol = resolveRegisteredJurisdictionAt(40.41692, -3.70359);
        expect(sol.kind).toBe('resolved');
        expect(sol.kind === 'resolved' ? sol.jurisdiction.jurisdictionId : null).toBe(
            'es-28079-madrid',
        );
    });

    it('§COMUNIDAD-MADRID-SPILL — refuses to CITE Madrid law on a non-28 INE code', () => {
        // Toledo (45xxx) sits inside the rectangle. A refusal there would be a confident claim
        // attributed to the wrong autonomous community — worse than no answer.
        expect(comunidadMadridNoRulePackRefusal('X', null, [], '45168')).toBeNull();
        // A Madrid INE gets the card.
        expect(comunidadMadridNoRulePackRefusal('X', null, [], '28022')).not.toBeNull();
        // ⚠ An UNKNOWN code is NOT read as "elsewhere" — absent ≠ negative.
        expect(comunidadMadridNoRulePackRefusal('X', null, [], undefined)).not.toBeNull();
        expect(isComunidadMadridIneCode('28022')).toBe(true);
        expect(isComunidadMadridIneCode('45168')).toBe(false);
        expect(isComunidadMadridIneCode('bogus')).toBe(false);
        expect(isInComunidadMadrid(BOADILLA_AT.lat, BOADILLA_AT.lon)).toBe(true);
    });

    it('the coverage refusal is about PRYZM, never about the law', () => {
        const refusal = comunidadMadridNoRulePackRefusal('RESIDENCIAL UNIFAMILIAR');
        expect(refusal).not.toBeNull();
        expect(refusal!.code).toBe('no-rule-pack');
        // ⚠ LOAD-BEARING. The ordinance almost certainly DOES grant an envelope on this urban
        // land; claiming a legal "no" would tell the owner of a buildable plot that the law
        // forbids building on it. That is the opposite error, and it is worse.
        expect(refusal!.legallyGrounded).toBe(false);
        expect(refusal!.ordinanceRef).toBeNull();
    });

    it('§6.1 — every refusal reason maps to an EXISTING code, and none is retryable', () => {
        expect(madridSpacmEnvelopeRefusalCodeFor('development-ambito-governs')).toBe('derived-plan');
        expect(madridSpacmEnvelopeRefusalCodeFor('public-system')).toBe('public-system');
        expect(madridSpacmEnvelopeRefusalCodeFor('not-urban-land')).toBe('protected-soil');
        expect(madridSpacmEnvelopeRefusalCodeFor('instrument-key-ambiguous')).toBe(
            'regime-undetermined',
        );
        expect(madridSpacmEnvelopeRefusalCodeFor('verification-gate-closed')).toBe('no-rule-pack');
        // ⛔ `source-data-unavailable` is the ONLY transient code and the only one that earns a
        // retry affordance. No adapter refusal clears on a retry, so none may map to it — offering
        // a retry on a delegation or an ambiguity sends the user round a loop for ever.
        const REASONS = [
            'development-ambito-governs', 'instrument-class-unpublished', 'instrument-key-ambiguous',
            'routing-token-unrecognised', 'public-system', 'not-urban-land',
            'parameters-contradict', 'no-grammar-determined', 'required-parameter-unknown',
            'value-is-existing-derived', 'value-is-publisher-estimate', 'value-unit-undocumented',
            'verification-gate-closed',
        ] as const;
        for (const r of REASONS) {
            expect(madridSpacmEnvelopeRefusalCodeFor(r)).not.toBe('source-data-unavailable');
        }
    });
});
