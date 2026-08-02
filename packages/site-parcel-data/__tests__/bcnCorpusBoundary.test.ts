// §SIG-4 (founder, 2026-08-02) — Barcelona's CORPUS BOUNDARY, enforced.
//
// The signature reads, verbatim:
//
//   "22a — Decision: SIGN. Do not require collection of ~2,600 partial plans.
//    Publish: municipal framework · quantified delegation · corpus boundary.
//    Treat delegated plans as outside scope unless individually analysed."
//
// ⚠⚠ THE RISK THIS SIGNATURE CREATES, WHICH IS WHAT THIS FILE EXISTS TO PIN. "Publish the municipal
// framework" is one careless step away from "publish the framework's FAR and occupation AS AN
// ENVELOPE on land the framework does not govern". Art. 350's 2 m²st/m²s is a real, cited figure —
// and on the 98.92 % of clau-22a land that a *pla derivat* governs, PRYZM does not know whether it
// still binds. "Outside scope unless individually analysed" is a REFUSAL, never a silent omission.
//
// So: a delegated parcel must reach a CITED REFUSAL that NAMES the instrument and the article, and
// must never reach a pack. Exactly as Murcia's 67 % delegated land and Madrid's NZ 3 do.
//
// Boundary document: docs/04-reference/jurisdictions/es/es-ct/08019-barcelona/CORPUS-BOUNDARY.md
// Signature record:  .../08019-barcelona/sources/VERIFICATION.md §SIG-4
// Doctrine:          "Partial publication does not authorize inference beyond its demonstrated
//                     spatial extent" (founder, corpus-wide; ADR in flight — cite it, do not restate).

import { describe, it, expect } from 'vitest';
import {
    BCN_JURISDICTION_ID,
    BCN_22A_DELEGATION_MEASURED,
    BCN_22A_REGIME_NEUTRAL_LIMITS,
    resolveZoneDisposition,
} from '../src/index.js';

describe('§SIG-4 — clau 22a reaches a CITED REFUSAL, never a pack and never a framework number', () => {
    const disposition = resolveZoneDisposition(BCN_JURISDICTION_ID, '22a', {
        harmonisedCode: null,
        zoneLabel: 'Zona industrial',
        knownFacts: [],
    });

    it('is a refusal — 22a is absent from packsByZone BY CONSTRUCTION', () => {
        // If this ever flips to `pack`, someone has "finished the job" by registering
        // ES_BARCELONA_INDUSTRIAL_PACK. The registry carries a standing warning not to.
        expect(disposition.kind).toBe('refusal');
    });

    it('NAMES the delegating instrument and the article — the boundary is stated, not implied', () => {
        if (disposition.kind !== 'refusal') throw new Error('unreachable');
        const { detail, ordinanceRef } = disposition.refusal;
        // The instrument class, in the ordinance's own word.
        expect(detail).toMatch(/Pla Parcial/);
        expect(detail).toMatch(/derived plan/i);
        // The delegating article — Art. 350 is what makes the two regimes exist.
        expect(ordinanceRef).toMatch(/Art\. 350/);
        // And the corpus boundary, said plainly enough for a non-lawyer to act on.
        expect(detail).toMatch(/outside the verified corpus/i);
        expect(detail).toMatch(/not individually analysed/i);
    });

    it('publishes the QUANTIFIED delegation — a measured share, not "some" or "most"', () => {
        if (disposition.kind !== 'refusal') throw new Error('unreachable');
        // 98.92 % must appear as a figure. A signature that asks for a QUANTIFIED delegation is not
        // satisfied by prose that says "largely governed by derived plans".
        expect(disposition.refusal.detail).toContain('98.92');
        expect(BCN_22A_DELEGATION_MEASURED.derivedPlanShare).toBeCloseTo(0.9892, 6);
        // The two shares are a partition of the zone — if they stop summing to 1 the census is wrong.
        expect(
            BCN_22A_DELEGATION_MEASURED.derivedPlanShare + BCN_22A_DELEGATION_MEASURED.generalPlanShare,
        ).toBeCloseTo(1, 6);
        // A share with no date and no source is not a measurement (INV-3).
        expect(BCN_22A_DELEGATION_MEASURED.measuredAt).toBe('2026-08-02');
        expect(BCN_22A_DELEGATION_MEASURED.source).toMatch(/qualificacio_refos/);
        expect(BCN_22A_DELEGATION_MEASURED.polygonsMeasured).toBe(81);
    });

    it('⚠ CORRECTS the shipped claim that no public source records the regime', () => {
        if (disposition.kind !== 'refusal') throw new Error('unreachable');
        // The card used to tell every 22a owner: "Neither the cadastral record nor the Generalitat's
        // planning map carries it." True of the MUC; FALSE of the AMB Refós, which PRYZM already
        // consumes for clau 18. A false statement about our own coverage is the mirror image of a
        // false statement about the law — the sixth instance of that defect in this dossier.
        expect(disposition.refusal.detail).not.toMatch(/Neither the cadastral record/);
        expect(disposition.refusal.detail).toMatch(/MEASURED, not inferred/);
    });

    it('stays `legallyGrounded: false` — the LAW grants an envelope here, PRYZM cannot locate it', () => {
        if (disposition.kind !== 'refusal') throw new Error('unreachable');
        // Flipping this to `true` would render the card as "the ordinance grants no envelope here"
        // and tell an industrial landowner their plot cannot be built on. The Pla Parcial almost
        // certainly grants one — we simply do not hold it. L-553 ranks that false negative worst.
        expect(disposition.refusal.legallyGrounded).toBe(false);
        expect(disposition.refusal.code).toBe('regime-undetermined');
    });

    it('⚠⚠ carries the framework as PROSE ONLY — no numeric envelope field is populated', () => {
        if (disposition.kind !== 'refusal') throw new Error('unreachable');
        // C58 §1.13.3: a refused envelope nulls every number, because storeyCap, the generators and
        // the massing path read those fields and WILL extrude one. The framework FAR is published in
        // the detail string under a citation — and nowhere else. This is the precise line between
        // "publish the municipal framework" and "fabricate an envelope on delegated land".
        const r = disposition.refusal as unknown as Record<string, unknown>;
        for (const numericField of ['plotRatioFAR', 'maxCoverage', 'maxHeight_m', 'buildableDepth_m']) {
            expect(r[numericField]).toBeUndefined();
        }
        // …while the figure IS stated in prose, with its condition attached (never bare).
        expect(disposition.refusal.detail).toContain(String(BCN_22A_REGIME_NEUTRAL_LIMITS.plotRatioFAR));
        expect(disposition.refusal.detail).toMatch(/segons alineacions de vial/);
    });
});

describe('§SIG-4 — the signature is SCOPED: it does not leak to neighbouring claus', () => {
    // "Treat delegated plans as outside scope" is a statement about 22a's corpus. It is not a licence
    // to re-reason 22@ (closed by DEC-1 under a different instrument) or clau 18 (SIG-3). Each keeps
    // its own refusal, from its own article — which is also what stops one signature from silently
    // becoming a city-wide policy.
    it.each([
        ['22@', /8\.1|22@/],
        ['18', /306/],
        ['12b', /320/],
    ])('clau %s still refuses under its OWN article', (clau, articlePattern) => {
        const d = resolveZoneDisposition(BCN_JURISDICTION_ID, clau, {
            harmonisedCode: null,
            zoneLabel: null,
            knownFacts: [],
        });
        expect(d.kind).toBe('refusal');
        if (d.kind !== 'refusal') throw new Error('unreachable');
        expect(`${d.refusal.ordinanceRef ?? ''}${d.refusal.detail}`).toMatch(articlePattern);
        // None of them may borrow 22a's freshly-measured number.
        expect(d.refusal.detail).not.toContain('98.92');
    });

    it('the packed claus are UNAFFECTED — this signature adds no envelope and removes none', () => {
        // The ENVELOPE axis must not move because delegation was scoped out (C63 §1.5 / L-656).
        // 13a/13b/12 and the 20a subzones keep their packs; nothing here touches them.
        for (const clau of ['13a', '13b', '12', '20a/9u']) {
            const d = resolveZoneDisposition(BCN_JURISDICTION_ID, clau, {
                harmonisedCode: null,
                zoneLabel: null,
                knownFacts: [],
            });
            expect(d.kind).toBe('pack');
        }
    });
});
