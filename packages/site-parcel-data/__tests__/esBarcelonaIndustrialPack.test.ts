// L-590 — the Barcelona clau `22a` (*Zona Industrial*) pack, PGM Art. 350.
//
// WHAT THESE TESTS GUARD, AND WHY THEY ARE NOT A COPY OF THE 13b SUITE
// --------------------------------------------------------------------
// The 13b suite guards against "13b is 13a with different numbers". This suite guards against two
// failures peculiar to 22a, both of which would look like progress:
//
//   1. **Someone registering this pack.** It is authored, sourced and correct in every scalar, and
//      it is deliberately absent from `registry.ts` because Art. 350.2's envelope is TWO-TIER and
//      our model is a single prism. Registering it would draw the WHOLE parcel next to the 90 %
//      occupation cap it publishes from the same article. The registry assertions below are the
//      guardrail, and they fail loudly with the reason attached.
//   2. **Someone collapsing one of the article's three 70/90 figures into another.** Art. 350
//      states 90 % of the PARCEL (350.2.a), 70 % of the BLOCK left free above the ground floor
//      (350.2.b) and 70 % of the PARCEL for *aïllada* sectors under a Pla Parcial (350.1.2n). Same
//      digits, three different quantities. C58 §1.11 is exactly this failure.

import { describe, it, expect } from 'vitest';
import type { EnvelopeRefusal } from '@pryzm/schemas';
import { resolveAlcadaIndustrial } from '../src/rulepacks/bcnAlcadaIndustrial.js';
import {
    buildRefusedEnvelope,
    isRefusedEnvelope,
    isTransientRefusal,
} from '../src/rulepacks/zoneRefusal.js';
import {
    ES_BARCELONA_INDUSTRIAL_PACK,
    BCN_INDUSTRIAL_ZONE_CODES,
    BCN_22A_ORDINANCE_REF,
    BCN_22A_ENVELOPE_BLOCKER,
    BCN_ART350_MIN_PARCEL_M2,
    BCN_ART350_MIN_FACADE_M,
    BCN_ART350_2B_INTERIOR_FREE_RATIO,
    BCN_ART350_1_AILLADA_COVERAGE,
    BCN_ART350_COSSOS_SORTINTS,
    BCN_22A_REGIME_NEUTRAL_LIMITS,
} from '../src/rulepacks/esBarcelonaIndustrial.js';
import { registeredPackZoneCodes, resolveZoneDisposition, BCN_JURISDICTION_ID } from '../src/rulepacks/registry.js';
import { computeBuildableEnvelope } from '../src/index.js';

const zone = () => ES_BARCELONA_INDUSTRIAL_PACK.zones[0]!;

describe('L-590 — the 22a pack is VALID (parses at load)', () => {
    it('parsed the schema without throwing', () => {
        // The pack runs `JurisdictionZoningContractSchema.parse` at MODULE LOAD, so a schema
        // violation is a runtime throw that `tsc` says nothing about.
        expect(ES_BARCELONA_INDUSTRIAL_PACK.jurisdictionId).toBe('es-08019-barcelona');
        expect(ES_BARCELONA_INDUSTRIAL_PACK.zones).toHaveLength(1);
        expect(zone().code).toBe('22a');
        expect(zone().permittedUse).toEqual(['industrial']);
    });

    it('registers clau 22a ONLY — 22@ is a different subzone with different articles', () => {
        // The 2000 MPGM defines 22@ as a formally distinct subzone governed by its OWN articles
        // except where they defer to the PGM. Claiming it here would cite Art. 350 for land those
        // articles govern.
        expect([...BCN_INDUSTRIAL_ZONE_CODES]).toEqual(['22a']);
        expect([...BCN_INDUSTRIAL_ZONE_CODES]).not.toContain('22@');
    });

    it('ships `estimated-ruleset` — a pack cannot self-certify, re-typeset primary or not', () => {
        expect(ES_BARCELONA_INDUSTRIAL_PACK.defaultConfidence).toBe('estimated-ruleset');
    });
});

describe('L-590 — THE CITATION. Every value names the paragraph that states it', () => {
    it('cites Art. 350.2.a for the FAR and the occupation', () => {
        expect(BCN_22A_ORDINANCE_REF).toMatch(/Art\. 350\.2\.a/);
        expect(BCN_22A_ORDINANCE_REF).toMatch(/2 m² sostre\/m² sòl/);
        expect(BCN_22A_ORDINANCE_REF).toMatch(/90 %/);
        expect(zone().ordinanceRef).toBe(BCN_22A_ORDINANCE_REF);
    });

    it('cites Art. 350.2.c for the height table, and DISCLAIMS 327 and 328', () => {
        // THE LOAD-BEARING ASSERTION. A confident citation to a neighbouring zone's article is the
        // most damaging output this system produces (L-526; and again when 13b briefly inherited
        // Art. 327). The citation must name its own article AND say which ones it is not.
        expect(BCN_22A_ORDINANCE_REF).toMatch(/Art\. 350\.2\.c/);
        expect(BCN_22A_ORDINANCE_REF).toMatch(/NOT Art\. 327/);
        expect(BCN_22A_ORDINANCE_REF).toMatch(/NOT Art\. 328/);
    });

    it('cites .b/.d/.e/.f for the band, the minimum parcel, the interior height and the volums', () => {
        expect(BCN_22A_ORDINANCE_REF).toMatch(/Art\. 350\.2\.b/);
        expect(BCN_22A_ORDINANCE_REF).toMatch(/Art\. 350\.2\.d/);
        expect(BCN_22A_ORDINANCE_REF).toMatch(/Art\. 350\.2\.e/);
        expect(BCN_22A_ORDINANCE_REF).toMatch(/Art\. 350\.2\.f/);
    });

    it('⚠ RECORDS THE 350.1 / 350.2 PLA PARCIAL DISTINCTION — it must survive into the pack', () => {
        // Art. 350.2 governs only industrial land *mancada de Pla Parcial*. A citation that said
        // only "Art. 350" would be uncheckable and would imply this pack governs land it does not.
        expect(BCN_22A_ORDINANCE_REF).toMatch(/MANCADA DE PLA PARCIAL/);
        expect(BCN_22A_ORDINANCE_REF).toMatch(/Art\. 350\.1/);
    });

    it('⚠ RECORDS THAT WE CHECKED FOR A BARCELONA OVERRIDE AND FOUND NONE', () => {
        // "We looked and there is none" is a stronger, different statement from "we found none",
        // and it is only worth anything if the citation carries it.
        expect(BCN_22A_ORDINANCE_REF).toMatch(/Veure modificació per al Municipi de Barcelona/);
        expect(BCN_22A_ORDINANCE_REF).toMatch(/base PGM text for Barcelona/);
    });

    it('states its confidence honestly — a re-typeset re-edition, never certified', () => {
        expect(BCN_22A_ORDINANCE_REF).toMatch(/NOT authenticated/);
        expect(BCN_22A_ORDINANCE_REF).toMatch(/never certified/);
        // "certified" may appear ONLY as part of the disclaimer. Any other occurrence would be the
        // pack claiming an authentication we do not have.
        expect(BCN_22A_ORDINANCE_REF.match(/certified/g)).toHaveLength(1);
        // And it must name the file a reader can open.
        expect(BCN_22A_ORDINANCE_REF).toMatch(/PGM-NNUU-metropolitana\.pdf/);
        expect(BCN_22A_ORDINANCE_REF).toMatch(/p\. 116/);
    });
});

describe('L-590 — the numbers, and the three 70/90 figures that must never be conflated', () => {
    it('Art. 350.2.a — a REAL per-parcel FAR of 2, unlike 13a (none) and 13b (PERI-gated)', () => {
        expect(zone().plotRatioFAR).toBe(2);
        expect(zone().fieldProvenance['maxFAR']).toBe('ordinance-pdf');
    });

    it('Art. 350.2.a — occupation 90 % OF THE PARCEL', () => {
        expect(zone().maxCoverage).toBe(0.9);
        expect(zone().fieldProvenance['maxCoverage']).toBe('ordinance-pdf');
    });

    it('⚠ the 70 % of Art. 350.2.b is a share of the BLOCK, and is NOT the coverage', () => {
        // 350.2.b confines the ABOVE-GROUND-FLOOR mass to a band concentric with the block whose
        // area equals 70 % of it ⇒ 30 % of the BLOCK stays free. Pasting either figure into
        // `maxCoverage` would answer a different question with a real-looking number (C58 §1.11).
        expect(BCN_ART350_2B_INTERIOR_FREE_RATIO).toBe(0.3);
        expect(zone().maxCoverage).not.toBe(0.7);
        expect(zone().maxCoverage).not.toBe(BCN_ART350_2B_INTERIOR_FREE_RATIO);
    });

    it('⚠ the 70 % of Art. 350.1.2n belongs to the OTHER regime and is not shipped', () => {
        // Occupation for *edificació aïllada* sectors inside a definitively-approved Pla Parcial.
        // This pack declares the Art. 350.2 regime, so 0.90 is what it ships.
        expect(BCN_ART350_1_AILLADA_COVERAGE).toBe(0.7);
        expect(zone().maxCoverage).toBe(0.9);
    });

    it('Art. 350.2.d — minimum parcel and façade are BUILDABILITY facts, not envelope fields', () => {
        // `ZoningRule` has no slot for either; they are exported so a consumer can say "this plot
        // is under the zone minimum" without a schema change made by a data file.
        expect(BCN_ART350_MIN_PARCEL_M2).toBe(300);
        expect(BCN_ART350_MIN_FACADE_M).toBe(10);
    });

    it('Art. 350.2.f — cossos sortints recorded, never folded into the envelope', () => {
        expect(BCN_ART350_COSSOS_SORTINTS.maxProjectionFractionOfStreetWidth).toBe(0.1);
        expect(BCN_ART350_COSSOS_SORTINTS.maxProjection_m).toBe(1);
        expect(BCN_ART350_COSSOS_SORTINTS.maxFractionOfFacadeLength).toBeCloseTo(1 / 3, 10);
    });
});

describe('L-590 — EVERY NULL IS A FINDING (C58 §1.7a: null ≠ 0)', () => {
    it('height and floors are null — Art. 350.2.c is a per-street CONSTRUCTION', () => {
        // A scalar here would publish one street's answer for the whole zone. The table lives in
        // `bcnAlcadaIndustrial.ts` and is reached through `resolveBcnAlcadaForZone`.
        expect(zone().maxHeight_m).toBeNull();
        expect(zone().maxFloors).toBeNull();
    });

    it('setbacks are null, NOT zero — an alignment zone has no honest triple', () => {
        // `0` would assert "the ordinance requires zero clearance here", a claim Art. 350 does not
        // make. `null` makes the containment check skip the edge instead.
        expect(zone().setbacks.front_m).toBeNull();
        expect(zone().setbacks.side_m).toBeNull();
        expect(zone().setbacks.rear_m).toBeNull();
    });

    it('⚠⚠ §L-590b — geometricRule is NO LONGER NULL: the two-tier rule kind now exists', () => {
        // ⚠ THIS TEST REPLACES THE ONE THAT ASSERTED `geometricRule` WAS NULL. That assertion was
        // correct and load-bearing for as long as the model could not express Art. 350.2 — it
        // stopped anyone "finishing the job" by publishing a whole-parcel envelope beside the
        // article's own 90 % occupation cap. ADR-0273 removed the thing it was guarding against,
        // so it is replaced rather than deleted: what is asserted now is the SHAPE the article
        // states, transcribed field by field.
        const rule = zone().geometricRule!;
        expect(rule).not.toBeNull();
        expect(rule.kind).toBe('tiered-occupation');
        if (rule.kind !== 'tiered-occupation') return;

        // Art. 350.2.b — the BAND's own ratio, as the article prints it ("superfície igual al 70
        // per 100 d'aquesta"), NOT the 0.30 complement. Transcribing the complement would put the
        // digits of Art. 242.2's `interiorFreeRatio` into a field with opposite semantics.
        expect(rule.bandAreaRatioOfBlock).toBe(0.7);
        expect(rule.bandAreaRatioOfBlock).not.toBe(BCN_ART350_2B_INTERIOR_FREE_RATIO);
        // Art. 350.2.e — 5 m, one INDIVISIBLE storey.
        expect(rule.interiorTierHeight_m).toBe(5);
        expect(rule.interiorTierFloors).toBe(1);
        // Art. 349 — *segons alineacions de vial*: façade ON the line, party walls laterally.
        expect(rule.alignTo).toBe('street');
        expect(rule.alignmentOffset_m).toBe(0);
        expect(rule.sideTreatment).toBe('party-wall');
        // ⚠ AND IT CARRIES NO DEPTH BOUNDS, because Art. 350 states none. A `minDepth_m` or
        // `maxDepth_m` appearing here would necessarily have come from Art. 242 — L-526 exactly.
        expect(rule).not.toHaveProperty('minDepth_m');
        expect(rule).not.toHaveProperty('maxDepth_m');
        expect(rule).not.toHaveProperty('interiorFreeRatio');
    });

    it('the tier numbers are badged as READ FROM THE ORDINANCE, not as PRYZM estimates', () => {
        // Without this the `tier.*` derivation rows fall back to `estimated`, i.e. the panel
        // presents figures read verbatim off p. 116 as guesses — the inverse of the L-459 defect
        // and just as misleading.
        expect(zone().fieldProvenance['geometricRule']).toBe('ordinance-pdf');
    });
});

describe('L-590 — ⚠ THE PACK IS DELIBERATELY UNREGISTERED, AND 22a STILL REFUSES', () => {
    it('is NOT in the Barcelona registry — and the reason has CHANGED, not gone away', () => {
        // ⚠⚠ THE GUARDRAIL, RE-AIMED. It used to guard the ENVELOPE MODEL: registering the pack
        // would have published a whole-parcel envelope beside the article's own 90 % cap. ADR-0273
        // closed that, and this test was deliberately NOT relaxed, because a SECOND blocker was
        // always stated alongside the first and it is untouched by any amount of engineering:
        //
        //   Arts. 350.2.a–f govern only 22a land *mancada de Pla Parcial*. PRYZM holds no source
        //   establishing whether a definitively-approved Pla Parcial covers a given parcel.
        //
        // ⚠ AND IT GATES THE FOOTPRINT, NOT ONLY THE HEIGHT — the point most likely to be missed
        // by someone reading only `resolveAlcadaIndustrial`'s refusal. The FAR and the occupation
        // survive the regime question because Art. 350.1.1r restates them; Art. 350.2.b's band
        // does not. Registering today would apply that band, cited to Art. 350.2.b, to parcels
        // Art. 350.1 may govern.
        //
        // Unblocking is a DATA or LEGAL step (a Pla-Parcial coverage layer, or a founder ruling
        // that 22a inside the municipality is `'none'` by default), never an engineering one.
        const codes = registeredPackZoneCodes(BCN_JURISDICTION_ID);
        expect(
            codes,
            'clau 22a must NOT be registered until the Art. 350.1 / 350.2 Pla-Parcial regime can ' +
                'be established for a parcel — see BCN_22A_ENVELOPE_BLOCKER. The two-tier ' +
                'GEOMETRY is solved (ADR-0273); what is missing is the legal fact that says ' +
                'whether Art. 350.2 governs this land at all.',
        ).not.toContain('22a');
        expect(BCN_22A_ENVELOPE_BLOCKER.registered).toBe(false);
        // ⚠ §L-590c — this asserted `toHaveLength(1)` ("one reason left"). It is now 2, and the
        // count grew because a re-read of p. 116 found a SECOND quantity the regime gates (the
        // occupation: Art. 350.1.2n caps *aïllada* sectors at 70 %, not 90 %), not because a
        // closed blocker came back. Asserting the SHAPE rather than the count is the honest fix —
        // a count is a proxy that punishes a sharper finding.
        expect(BCN_22A_ENVELOPE_BLOCKER.reasons.length).toBeGreaterThanOrEqual(1);
        expect(BCN_22A_ENVELOPE_BLOCKER.reasons[0]).toMatch(/mancada de Pla Parcial/);
        expect(BCN_22A_ENVELOPE_BLOCKER.reasons.join(' ')).toMatch(/70 %/);
        // …and the model blocker is recorded as CLOSED rather than quietly dropped, so the
        // argument that was answered stays readable next to the one that was not.
        expect(BCN_22A_ENVELOPE_BLOCKER.missingRuleKind).toBeNull();
        expect(BCN_22A_ENVELOPE_BLOCKER.ruleKind).toBe('tiered-occupation');
        expect(BCN_22A_ENVELOPE_BLOCKER.closed.length).toBeGreaterThanOrEqual(3);
        // The zones that ARE registered are unaffected.
        expect(codes).toContain('13a');
        expect(codes).toContain('13b');
    });

    it('⚠ THE PACK IS NEVERTHELESS SOLVABLE TODAY — the geometry blocker really is closed', () => {
        // The counterpart to the guard above, and the reason the guard is now honest rather than
        // merely conservative: the pack's rule, driven through the SHIPPING engine on a real
        // block, produces the two-tier envelope Art. 350.2 describes. Registration is gated on a
        // legal fact, not on a missing capability — and this test is what stops that claim from
        // decaying into an excuse.
        const BLOCK = [
            { x: 0, z: 0 }, { x: 113, z: 0 }, { x: 113, z: 113 }, { x: 0, z: 113 },
        ];
        const env = computeBuildableEnvelope({
            parcelRing: [
                { x: 40, z: 0 }, { x: 60, z: 0 }, { x: 60, z: 113 }, { x: 40, z: 113 },
            ],
            edgeClassifications: ['front', 'side', 'rear', 'side'],
            zoning: {
                zoneCode: '22a',
                zoneLabel: 'Zona Industrial (clau 22a)',
                jurisdictionId: 'es-08019-barcelona',
                // The Art. 350.2.c height as the L5 caller would supply it once the regime is
                // established. Passing it here does NOT assume the regime — it isolates the
                // GEOMETRY, which is what this test is about.
                structuredFields: { maxHeight_m: 17 },
                overlays: [],
                ordinanceRef: null,
                provenance: {
                    source: 'catastro-muc', label: 'test', version: 'test',
                    license: null, crs: 'EPSG:4326',
                },
            } as never,
            rulePack: ES_BARCELONA_INDUSTRIAL_PACK,
            blockRing: BLOCK,
            blockEdgeClassifications: ['front', 'front', 'front', 'front'],
        });
        expect(env.status).toBe('ok');
        expect(env.tiers.map((t) => t.id)).toEqual(['block-band', 'block-interior']);
        expect(env.tiers[0]!.maxHeight_m).toBe(17);   // Art. 350.2.c inside the band
        expect(env.tiers[1]!.maxHeight_m).toBe(5);    // Art. 350.2.e beyond it
        // The rule reaches the engine FROM THE PACK — no test-only `geometricRule` override —
        // which is what proves registration is the only remaining step.
        expect(env.derivation.some((d) => d.constraint === 'tier.bandDepth')).toBe(true);
    });

    it('a 22a parcel still resolves to a REFUSAL, not an envelope', () => {
        const d = resolveZoneDisposition(BCN_JURISDICTION_ID, '22a', {
            zoneLabel: 'Zona industrial',
        });
        expect(d.kind).toBe('refusal');
        if (d.kind === 'refusal') {
            // ⚠ `legallyGrounded: false` — this is a statement about PRYZM's inputs, NOT a claim
            // that the ordinance forbids building on industrial land. Flipping it would tell an
            // owner their perfectly buildable plot cannot be built on.
            expect(d.refusal.legallyGrounded).toBe(false);
        }
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// §L-590c / ADR-0276 — TRACK C: the REGIME-NEUTRAL half of Art. 350 ships; everything the
// regime gates stays refused. FOUNDER-RULED 2026-07-22 ("C now, B in parallel, hold A").
// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('§L-590c — clau 22a returns the two cited facts plus a NAMED refusal', () => {
    const refusalFor22a = (): EnvelopeRefusal => {
        const d = resolveZoneDisposition(BCN_JURISDICTION_ID, '22a', { zoneLabel: 'Zona industrial' });
        expect(d.kind).toBe('refusal');
        if (d.kind !== 'refusal') throw new Error('unreachable');
        return d.refusal;
    };

    it('is the FOURTH refusal code, not one of the three that would each be false', () => {
        // `no-rule-pack` would say we have not encoded the zone (we have, and it is solved).
        // `source-data-unavailable` is the TRANSIENT code and would invite an eternal retry.
        // `derived-plan` would assert the delegation we cannot establish — L-526 verbatim.
        const r = refusalFor22a();
        expect(r.code).toBe('regime-undetermined');
        expect(r.code).not.toBe('no-rule-pack');
        expect(r.code).not.toBe('source-data-unavailable');
        expect(r.code).not.toBe('derived-plan');
        // A statement about PRYZM's inputs, never about what the law permits on this land.
        expect(r.legallyGrounded).toBe(false);
    });

    it('publishes the FAR as UNCONDITIONAL — all three paragraphs state it', () => {
        const r = refusalFor22a();
        expect(BCN_22A_REGIME_NEUTRAL_LIMITS.plotRatioFAR).toBe(2);
        // Read live from the pack, so the published figure cannot drift from the encoded one.
        expect(BCN_22A_REGIME_NEUTRAL_LIMITS.plotRatioFAR).toBe(zone().plotRatioFAR);
        expect(r.detail).toMatch(/2 m² of floor per m² of site/);
        expect(r.detail).toMatch(/whichever regime governs your parcel/i);
        // The three paragraphs, named — that is WHY it is unconditional, and the reason must
        // travel with the claim or it is an assertion rather than a citation.
        expect(r.ordinanceRef).toMatch(/Art\. 350\.1\.1r/);
        expect(r.ordinanceRef).toMatch(/Art\. 350\.1\.2n/);
        expect(r.ordinanceRef).toMatch(/Art\. 350\.2\.a/);
    });

    it('⚠ publishes the 90 % occupation ONLY WITH its condition attached', () => {
        // THE LOAD-BEARING ASSERTION OF THIS SUITE. Art. 350.1.2n caps an *edificació aïllada*
        // sector at 70 %, and Art. 349.1 makes the ordering type a property of the Pla Parcial.
        // A bare "90 %" therefore OVER-STATES by 20 pp on such a sector — the one direction
        // C58 §1.4 forbids outright. The condition is not a nicety; it is what makes the figure
        // publishable at all.
        const r = refusalFor22a();
        expect(BCN_22A_REGIME_NEUTRAL_LIMITS.maxCoverage).toBe(zone().maxCoverage);
        expect(BCN_22A_REGIME_NEUTRAL_LIMITS.maxCoverageAilladaAlternative)
            .toBe(BCN_ART350_1_AILLADA_COVERAGE);
        expect(r.detail).toMatch(/90 % of the parcel/);
        expect(r.detail).toMatch(/segons alineacions de vial/);
        expect(r.detail).toMatch(/edificació aïllada/);
        expect(r.detail).toMatch(/70 %/);
    });

    it('NAMES THE MISSING INPUT rather than saying "we don’t know"', () => {
        const r = refusalFor22a();
        expect(r.detail).toMatch(/definitively-approved detailed plan/i);
        expect(r.detail).toMatch(/Pla Parcial/);
        // ⚠ RE-AIMED, NOT RELAXED (§SIG-4, 2026-08-02). This asserted the literal phrase "what
        // ordering type does it assign this sector", inside a paragraph that also claimed *"Neither
        // the cadastral record nor the Generalitat's planning map carries it"*. That claim was FALSE
        // — the AMB Refós `PLAN` field carries exactly it, and a complete 81-polygon census measured
        // the split — so the paragraph was rewritten and this regex went with it. The PROPERTY under
        // test is unchanged and is what the two assertions below now pin: the card must name the
        // missing input per-parcel and actionably, never shrug.
        expect(r.detail).toMatch(/the ordering type it assigns/i);
        expect(r.detail).toMatch(/What would resolve it for YOUR parcel/i);
        // …and names the zone FIRST (L-553 rule 1) so the card cannot read as a crash.
        expect(r.headline).toMatch(/clau 22a/);
        expect(r.headline).toMatch(/TWO regimes/);
    });

    it('⚠⚠ THE GUARD — a 22a parcel gets NO Art. 350.2.b band and NO Art. 350.2.c height', () => {
        // ⚠⚠ THIS IS THE TEST THAT STOPS A FUTURE AGENT "FINISHING THE JOB". The pack is solvable
        // (asserted above) and the temptation is to register it. Registering it would send 22a
        // through `computeBuildableEnvelope` with the `tiered-occupation` rule, cutting an
        // Art. 350.2.b band and publishing an Art. 350.2.e 5 m principal tier — BOTH regime-gated,
        // on parcels Art. 350.1 may govern. Going through `refusalFor` instead keeps every numeric
        // field null and every polygon empty, which is what makes the partial answer safe for
        // consumers that have never heard of it.
        const r = refusalFor22a();
        const env = buildRefusedEnvelope('22a', r);

        // 1 — nothing geometric. Nothing to extrude, nothing to persist, nothing to bound a
        //     generator with (C58 §1.13.3).
        expect(env.insetPolygon).toEqual([]);
        expect(env.insetAreaM2).toBe(0);
        expect(env.tiers).toEqual([]);
        expect(env.maxVolumeM3).toBeNull();

        // 2 — NO HEIGHT. Not 9, not 13, not 17 (Art. 350.2.c), not 5 (Art. 350.2.e).
        expect(env.maxHeight_m).toBeNull();
        expect(env.maxFloors).toBeNull();

        // 3 — and the two facts we DO publish are NOT in numeric fields either. They are prose
        //     under a citation, because prose is the only form that can carry the occupation's
        //     condition, and because a number in these fields is a number a consumer will use.
        expect(env.maxFAR).toBeNull();
        expect(env.maxCoverage).toBeNull();

        // 4 — the refusal is recognised as one, so every consumer takes the refusal branch.
        expect(isRefusedEnvelope(env)).toBe(true);
        expect(env.status).toBe('not-applicable');
        expect(env.confidence).toBe('not-determined');
        // …and is NOT the transient kind, so no surface offers a retry that can never succeed.
        expect(isTransientRefusal(env)).toBe(false);

        // 5 — the CITATION must not name the paragraphs the card is declining to apply. A
        //     reference to Art. 350.2.b/.c beside "we cannot establish the regime" is an
        //     authoritative-looking citation for a claim the card does not make (L-526).
        expect(r.ordinanceRef).not.toMatch(/Art\. 350\.2\.c \(street-width/);
        expect(r.ordinanceRef).toMatch(/NOT cited for this parcel/);
        expect(r.detail).not.toMatch(/\b17 m\b/);
        expect(r.detail).not.toMatch(/\b9 m\b/);
    });

    it('⚠ resolveAlcadaIndustrial still REFUSES on the default (option A stays on hold)', () => {
        // The founder ruling: "Option A is explicitly on hold." There must be no permissive
        // default anywhere — an omitted regime must not become an ordinance fact.
        expect(resolveAlcadaIndustrial(20).ok).toBe(false);
        expect(resolveAlcadaIndustrial(20, { planParcialRegime: 'unknown' }).ok).toBe(false);
        expect(resolveAlcadaIndustrial(20, { planParcialRegime: 'approved' }).ok).toBe(false);
        // …and the gate is still openable by an EXPLICIT establishment, so this is a refusal to
        // guess and not a dead code path.
        expect(
            resolveAlcadaIndustrial(20, { planParcialRegime: 'none', trustedOfficialWidth: true }).ok,
        ).toBe(true);
        // The ruling itself is recorded in the blocker, with its date, so it cannot be
        // re-litigated from memory.
        expect(BCN_22A_ENVELOPE_BLOCKER.founderRuling.date).toBe('2026-07-22');
        expect(BCN_22A_ENVELOPE_BLOCKER.founderRuling.optionAOnHold).toMatch(/NOT implemented/);
        expect(BCN_22A_ENVELOPE_BLOCKER.shipped.length).toBeGreaterThanOrEqual(3);
    });
});
