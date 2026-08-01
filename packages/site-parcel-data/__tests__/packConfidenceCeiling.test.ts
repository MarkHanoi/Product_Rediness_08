// §PACK-CONFIDENCE-CEILING (L-665) — a rule pack's declared `defaultConfidence` reaches the badge.
//
// THE DEFECT
// ----------
// `ZoningRulesEngine` hard-coded `let confidence: EnvelopeConfidence = 'estimated-ruleset'` and
// never once read `rulePack.defaultConfidence`. So an OCR-derived, machine-extracted pack (Madrid
// PGOUM-97, Córdoba PGOU-2001 — both declaring `pipeline-extracted-unverified`, C58 §1.6's
// PERMANENT bottom tier) and a hand-transcribed, article-cited pack (Murcia PGOU TR-2012,
// Barcelona's claus — `estimated-ruleset`) produced envelopes carrying the SAME tier and therefore
// the same violet "Estimated" chip. The red "machine-extracted, unverified" affordance was
// unreachable by any production path.
//
// It was LATENT, not harmless: every `*_ENVELOPE_VERIFIED` gate is shut, so the dispatcher refuses
// before this engine runs. It went LIVE the instant a gate was signed — which is why the fix lands
// BEFORE the three signatures. `madridPgoum97Wiring.test.ts` §THE-ORDERING-PIN holds that ordering.
//
// EVERY ASSERTION IN THE §THE-ENGINE-READS-IT BLOCK FAILS ON `6632f0e3` (they all read
// `estimated-ruleset`).
//
// Authority: C58 §1.2 / §1.6, ADR-0279 BLOCKER-1, L-664 (the ONE ladder), L-665.

import { describe, it, expect } from 'vitest';
import {
    ENVELOPE_CONFIDENCE_ORDER,
    EnvelopeConfidenceSchema,
    RulePackDefaultConfidenceSchema,
    capEnvelopeConfidenceToPackDefault,
    envelopeConfidenceRank,
    weakerEnvelopeConfidence,
    type EnvelopeConfidence,
    type JurisdictionZoningContract,
    type RulePackDefaultConfidence,
    type ZoningRecord,
} from '@pryzm/schemas';
import { computeBuildableEnvelope } from '../src/ZoningRulesEngine.js';
import { ES_MADRID_PGOUM97_PACK } from '../src/rulepacks/esMadridPgoum97.js';
import { ES_CORDOBA_PGOU2001_PACK } from '../src/rulepacks/esCordobaPGOU2001.js';
import { ES_MURCIA_PGOU2012_PACK } from '../src/rulepacks/esMurciaPgou2012.js';

// A 40 × 25 m rectangular parcel, all four edges unclassified. Geometry is irrelevant to the tier —
// it exists only so the solve reaches `status: 'ok'` and produces a badge-able envelope.
const RING = [
    { x: 0, z: 0 },
    { x: 40, z: 0 },
    { x: 40, z: 25 },
    { x: 0, z: 25 },
];
const EDGES = ['unclassified', 'unclassified', 'unclassified', 'unclassified'] as const;

function recordFor(jurisdictionId: string, zoneCode: string): ZoningRecord {
    return {
        jurisdictionId,
        zoneCode,
        structuredFields: null,
        provenance: { source: jurisdictionId, fetchedAt: '2026-08-01T00:00:00.000Z' },
    } as unknown as ZoningRecord;
}

/** Solve with a pack, returning the confidence tier the engine stamped. */
function tierFor(pack: JurisdictionZoningContract, zoneCode: string): EnvelopeConfidence {
    return computeBuildableEnvelope({
        parcelRing: RING,
        edgeClassifications: [...EDGES],
        zoning: recordFor(pack.jurisdictionId, zoneCode),
        rulePack: pack,
    }).confidence;
}

/** The first zone in a pack that actually resolves a value (so the pack genuinely contributed). */
function firstPackZoneCode(pack: JurisdictionZoningContract): string {
    const zone = pack.zones[0];
    expect(zone, `${pack.jurisdictionId} ships at least one zone`).toBeDefined();
    return zone!.code;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('§PACK-CONFIDENCE-CEILING — the L0 primitive (one ladder, no second vocabulary)', () => {
    it('the cap is the ladder MIN — it can only ever DEMOTE, never promote', () => {
        for (const derived of ENVELOPE_CONFIDENCE_ORDER) {
            for (const declared of RulePackDefaultConfidenceSchema.options) {
                const out = capEnvelopeConfidenceToPackDefault(derived, declared);
                expect(envelopeConfidenceRank(out)).toBeLessThanOrEqual(envelopeConfidenceRank(derived));
                expect(envelopeConfidenceRank(out)).toBeLessThanOrEqual(envelopeConfidenceRank(declared));
                // …and it is a MEMBER of the one enum: no invented tier, no translation table (L-664).
                expect(EnvelopeConfidenceSchema.safeParse(out).success).toBe(true);
            }
        }
    });

    it('a `structured`-declaring pack cannot CERTIFY ITSELF up from an estimated solve', () => {
        // Denmark's pack declares `structured`. If the cap were an assignment rather than a min,
        // that declaration would lift a solve the field rules had already labelled estimated —
        // a pack signing its own numbers, which is what every verification gate exists to prevent.
        expect(capEnvelopeConfidenceToPackDefault('estimated-ruleset', 'structured')).toBe(
            'estimated-ruleset',
        );
    });

    it('a machine-extracted pack DEMOTES a curated-estimate solve', () => {
        expect(
            capEnvelopeConfidenceToPackDefault('estimated-ruleset', 'pipeline-extracted-unverified'),
        ).toBe('pipeline-extracted-unverified');
        // …and it demotes a constructed one too, if one were ever handed in.
        expect(
            capEnvelopeConfidenceToPackDefault('block-constructed', 'pipeline-extracted-unverified'),
        ).toBe('pipeline-extracted-unverified');
    });

    it('NO pack default can reach `authoritative` — the L-664 ceiling is not "fixed" here', () => {
        // `authoritative` needs an ISSUED municipal determination as a DATA SOURCE, not engineering.
        // `min` never raises, and `RulePackDefaultConfidence` cannot even express it.
        expect(RulePackDefaultConfidenceSchema.options).not.toContain('authoritative');
        for (const declared of RulePackDefaultConfidenceSchema.options) {
            for (const derived of ENVELOPE_CONFIDENCE_ORDER) {
                expect(capEnvelopeConfidenceToPackDefault(derived, declared)).not.toBe('authoritative');
            }
        }
    });

    it('a null/undefined declaration is a genuine ABSENCE, not a weak claim (§CONTEXT-DATA-HONESTY)', () => {
        // No pack contributed ⇒ nothing to clamp to. Clamping a provider-published `structured`
        // envelope to some unrelated ceiling would UNDER-state real data — the same lie inverted.
        expect(capEnvelopeConfidenceToPackDefault('structured', null)).toBe('structured');
        expect(capEnvelopeConfidenceToPackDefault('structured', undefined)).toBe('structured');
    });

    it('`weakerEnvelopeConfidence` is commutative, idempotent and total over the enum', () => {
        for (const a of ENVELOPE_CONFIDENCE_ORDER) {
            expect(weakerEnvelopeConfidence(a, a)).toBe(a);
            for (const b of ENVELOPE_CONFIDENCE_ORDER) {
                expect(weakerEnvelopeConfidence(a, b)).toBe(weakerEnvelopeConfidence(b, a));
            }
        }
    });

    it('the pack-default vocabulary is a SUBSET of the one envelope ladder (no rival union)', () => {
        // The L-664 root cause was a second vocabulary growing beside the enum. Assert the subset
        // relation at runtime too, not only via the `tsc` guard in ProvenanceFlags.ts.
        for (const declared of RulePackDefaultConfidenceSchema.options) {
            expect(ENVELOPE_CONFIDENCE_ORDER as readonly string[]).toContain(declared);
        }
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('§THE-ENGINE-READS-IT — every assertion here FAILS on 6632f0e3', () => {
    it('a MACHINE-EXTRACTED pack (Madrid PGOUM-97) solves to the red unverified tier', () => {
        expect(ES_MADRID_PGOUM97_PACK.defaultConfidence).toBe('pipeline-extracted-unverified');
        const tier = tierFor(ES_MADRID_PGOUM97_PACK, firstPackZoneCode(ES_MADRID_PGOUM97_PACK));
        expect(tier).toBe('pipeline-extracted-unverified'); // was 'estimated-ruleset'
    });

    it('a MACHINE-EXTRACTED pack (Córdoba PGOU-2001) solves to the red unverified tier', () => {
        expect(ES_CORDOBA_PGOU2001_PACK.defaultConfidence).toBe('pipeline-extracted-unverified');
        const tier = tierFor(ES_CORDOBA_PGOU2001_PACK, firstPackZoneCode(ES_CORDOBA_PGOU2001_PACK));
        expect(tier).toBe('pipeline-extracted-unverified'); // was 'estimated-ruleset'
    });

    it('a HAND-TRANSCRIBED pack (Murcia PGOU TR-2012) stays on the violet estimated tier', () => {
        // THE WHOLE POINT: the two must be DIFFERENT. A human who read and typed a value out-ranks
        // a pipeline nobody has checked (`ENVELOPE_CONFIDENCE_ORDER`, L-590f §6).
        expect(ES_MURCIA_PGOU2012_PACK.defaultConfidence).toBe('estimated-ruleset');
        const tier = tierFor(ES_MURCIA_PGOU2012_PACK, firstPackZoneCode(ES_MURCIA_PGOU2012_PACK));
        expect(tier).toBe('estimated-ruleset');
    });

    it('THE SEPARATION IS REAL — machine-extracted ranks STRICTLY BELOW hand-transcribed', () => {
        const machine = tierFor(ES_CORDOBA_PGOU2001_PACK, firstPackZoneCode(ES_CORDOBA_PGOU2001_PACK));
        const human = tierFor(ES_MURCIA_PGOU2012_PACK, firstPackZoneCode(ES_MURCIA_PGOU2012_PACK));
        expect(machine).not.toBe(human);
        expect(envelopeConfidenceRank(machine)).toBeLessThan(envelopeConfidenceRank(human));
    });

    it('a machine-extracted envelope carries its OWN, louder caveat — never silence', () => {
        // The clamp moves the tier off `estimated-ruleset`, so the existing "Estimated envelope —
        // verify…" caveat stops matching. Without a replacement the fix would leave the LOUDEST
        // tier with NO caveat at all — worse than the defect.
        // Córdoba `PAS-1` is used because it is a SETBACK zone that genuinely solves to
        // `status: 'ok'` on the rectangle above (Madrid's first zone is an alignment zone and goes
        // `degenerate` without a classified front edge, which would make this assertion vacuous).
        const env = computeBuildableEnvelope({
            parcelRing: RING,
            edgeClassifications: [...EDGES],
            zoning: recordFor(ES_CORDOBA_PGOU2001_PACK.jurisdictionId, 'PAS-1'),
            rulePack: ES_CORDOBA_PGOU2001_PACK,
        });
        expect(env.status).toBe('ok'); // guard: the assertion below must never pass vacuously
        expect(env.confidence).toBe('pipeline-extracted-unverified');
        const caveats = env.caveats.join(' || ');
        expect(caveats).toMatch(/MACHINE-EXTRACTED, NOT HUMAN-VERIFIED/);
        expect(caveats).toMatch(/OUR error, not the publisher/);
        // …and it must NOT also carry the softer curated-estimate caveat: two different claims.
        expect(caveats).not.toMatch(/Estimated envelope — verify against the governing ordinance/);
    });

    it('NO PACK CONTRIBUTED ⇒ no clamp: a fully structured solve is untouched', () => {
        // §CONTEXT-DATA-HONESTY, the other direction. Every number here comes from the provider, so
        // the pack's ceiling is irrelevant and must NOT drag a real published envelope down.
        const zoneCode = firstPackZoneCode(ES_MADRID_PGOUM97_PACK);
        const zoning = {
            ...recordFor(ES_MADRID_PGOUM97_PACK.jurisdictionId, zoneCode),
            structuredFields: {
                setbacks: { front_m: 3, side_m: 2, rear_m: 4 },
                maxHeight_m: 18,
                maxFloors: 6,
                plotRatioFAR: 2.5,
                maxCoverage: 0.6,
                permittedUse: ['residential'],
            },
        } as unknown as ZoningRecord;
        const env = computeBuildableEnvelope({
            parcelRing: RING,
            edgeClassifications: [...EDGES],
            zoning,
            rulePack: ES_MADRID_PGOUM97_PACK,
        });
        expect(env.confidence).toBe('structured');
    });

    it('the clamp NEVER blocks the Barcelona `block-constructed` upgrade (ordering, not luck)', () => {
        // Barcelona's packs declare `estimated-ruleset`; the clamp is a no-op for them, and the
        // upgrade below it — guarded on `confidence === 'estimated-ruleset'` — still fires. The
        // clamp runs FIRST, on the field-resolution tier, precisely so this stays true.
        const declared: RulePackDefaultConfidence = 'estimated-ruleset';
        expect(capEnvelopeConfidenceToPackDefault('estimated-ruleset', declared)).toBe(
            'estimated-ruleset',
        );
        // …and a machine-extracted pack CANNOT reach `block-constructed` through that upgrade,
        // because the clamp has already moved it off the guard value. A depth solved from a real
        // block ring does not launder an unverified transcription of the rule that solved it.
        expect(
            capEnvelopeConfidenceToPackDefault('estimated-ruleset', 'pipeline-extracted-unverified'),
        ).not.toBe('estimated-ruleset');
    });
});
