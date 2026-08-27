// §CONTEXT-DERIVED-STUDY-ENVELOPE (§ENVAMS148) — `buildContextDerivedStudyEnvelope`: a massing
// STUDY built from real neighbour heights, offered only alongside a genuine no-plan-class refusal.
//
// Pins the honesty properties from the module header: an `'assumed'` (fabricated placeholder)
// neighbour height is EXCLUDED from the sample and the median, never treated as data or as zero;
// too few real neighbours refuses rather than averaging a false confidence; a setback that
// consumes the parcel refuses rather than drawing nothing silently; the produced object validates
// against the L0 schema and its own status literal is NEVER a member of `EnvelopeStatus` /
// `EnvelopeConfidence`.

import { describe, it, expect } from 'vitest';
import {
    buildContextDerivedStudyEnvelope,
    CONTEXT_DERIVED_STUDY_ENVELOPE_CERTIFIED,
    CONTEXT_STUDY_DEFAULT_MIN_SAMPLE_SIZE,
    type ContextStudyNeighbourSample,
    buildUserSuppliedStudyEnvelope,
    USER_SUPPLIED_STUDY_HEIGHT_MIN_M,
    USER_SUPPLIED_STUDY_HEIGHT_MAX_M,
} from '../src/index.js';
// SIG-NL2: an OPEN gate must name its recorded decision — asserted below, not assumed.
import { L449_CERTIFICATION_GATES } from '../src/l449CertificationGates.js';
import {
    ContextDerivedStudyEnvelopeSchema,
    CONTEXT_DERIVED_STUDY_STATUS,
    EnvelopeStatusSchema,
    EnvelopeConfidenceSchema,
    type MedianNeighbourHeightBasis,
    type ContextStudyHeightBasis,
} from '@pryzm/schemas';
import type { Pt } from '@pryzm/schemas';

// A 20 m × 10 m rectangular parcel, scene-XZ metres (CCW).
const PARCEL_RING: Pt[] = [
    { x: 0, z: 0 },
    { x: 20, z: 0 },
    { x: 20, z: 10 },
    { x: 0, z: 10 },
];

function neighbour(
    heightM: number,
    heightProvenance: ContextStudyNeighbourSample['heightProvenance'],
    distM: number,
): ContextStudyNeighbourSample {
    return { heightM, heightProvenance, distM };
}

/** Narrow a `heightBasis` to the median-of-neighbours arm, failing loudly (not silently) if a
 *  test ever gets this wrong — mirrors the discriminated union the schema itself enforces. */
function asMedianBasis(b: ContextStudyHeightBasis): MedianNeighbourHeightBasis {
    if (b.method !== 'median-neighbour-height') {
        throw new Error(`expected a 'median-neighbour-height' basis, got '${b.method}'`);
    }
    return b;
}

describe('CONTEXT_DERIVED_STUDY_ENVELOPE_CERTIFIED — the gate itself', () => {
    // ⚠ AMENDED 2026-08-27 — this asserted `false` under §UNSIGNED-GATE-DEFAULTS-SHUT, which was
    // correct while the gate was unsigned. It is now SIGNED (SIG-NL2), so asserting `false` would
    // pin the repo to the state the founder was asking us to leave.
    //
    // The assertion is UPGRADED, not deleted: an OPEN gate must carry a signature, and that is the
    // invariant actually worth defending. §UNSIGNED-GATE-DEFAULTS-SHUT survives intact in its real
    // form — open ⇒ signed — rather than being silently dropped when it became inconvenient. A gate
    // flipped open with `signature: null` still fails here, which is the failure mode that matters.
    it('is OPEN and therefore MUST name its signature — SIG-NL2', () => {
        expect(CONTEXT_DERIVED_STUDY_ENVELOPE_CERTIFIED).toBe(true);
        const row = L449_CERTIFICATION_GATES.find(
            g => g.gate === 'CONTEXT_DERIVED_STUDY_ENVELOPE_CERTIFIED',
        );
        expect(row).toBeDefined();
        expect(row!.value).toBe(true);
        // The whole point of §L449-SIGNATURE-TOTALITY: open without a recorded decision is the bug.
        expect(row!.signature).toBeTruthy();
        // §MANUALENV159 — CORRECTED: `signature` is `L449SignatureRef` (`{doc, anchor}`), never a
        // bare string — `.toContain` on the whole object was passing today only because this
        // suite never ran under the stricter root tsc (a pre-existing type error on
        // `l449CertificationGates.ts` this lane also fixed). Assert the SAME two fields
        // `l449CertificationGates.test.ts`'s own §DEREFERENCE-THE-CITATION check dereferences.
        expect(row!.signature?.doc).toBe('docs/04-reference/jurisdictions/nl/sources/VERIFICATION.md');
        expect(row!.signature?.anchor).toBe('SIG-NL2');
    });
});

describe('buildContextDerivedStudyEnvelope — the honest ok path', () => {
    it('computes the MEDIAN (never mean, never min) of the real neighbour heights', () => {
        // Heights 10, 12, 14, 16, 18 within radius — median is 14, not the mean (14) coincidentally
        // equal here, so also check an asymmetric set below.
        const neighbours = [
            neighbour(10, 'tagged', 5),
            neighbour(12, 'tagged', 10),
            neighbour(14, 'tagged', 15),
            neighbour(16, 'tagged', 20),
            neighbour(18, 'tagged', 25),
        ];
        const result = buildContextDerivedStudyEnvelope({
            parcelRing: PARCEL_RING,
            neighbours,
            radius_m: 50,
            sourceLabel: 'test-source',
            nowIso: '2026-08-27T00:00:00.000Z',
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.study.maxHeight_m).toBe(14);
        const basis = asMedianBasis(result.study.heightBasis);
        expect(basis.medianHeight_m).toBe(14);
        expect(basis.minHeight_m).toBe(10);
        expect(basis.maxHeight_m).toBe(18);
        expect(basis.sampledCount).toBe(5);
        expect(basis.excludedAssumedCount).toBe(0);
    });

    it('an ASYMMETRIC set is not secretly averaged (median != mean)', () => {
        // 1, 2, 3, 4, 100 — median 3, mean 22. A mean would badly overstate the study height.
        const neighbours = [1, 2, 3, 4, 100].map((h) => neighbour(h, 'tagged', 10));
        const result = buildContextDerivedStudyEnvelope({
            parcelRing: PARCEL_RING,
            neighbours,
            radius_m: 50,
            sourceLabel: 'test-source',
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.study.maxHeight_m).toBe(3);
    });

    it('defaults the footprint to the PARCEL RING ITSELF when setback_m is omitted (0)', () => {
        const neighbours = [10, 12, 14].map((h) => neighbour(h, 'tagged', 10));
        const result = buildContextDerivedStudyEnvelope({
            parcelRing: PARCEL_RING,
            neighbours,
            radius_m: 50,
            sourceLabel: 'test-source',
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.study.setback_m).toBe(0);
        // The inset-by-0 identity: same vertex count, same (unsigned) area as the parcel.
        expect(result.study.footprintPolygon).toHaveLength(PARCEL_RING.length);
        expect(result.study.footprintAreaM2).toBeCloseTo(200, 6); // 20 x 10
    });

    it('a positive setback_m insets the footprint (reuses the shared per-edge inset authority)', () => {
        const neighbours = [10, 12, 14].map((h) => neighbour(h, 'tagged', 10));
        const result = buildContextDerivedStudyEnvelope({
            parcelRing: PARCEL_RING,
            neighbours,
            radius_m: 50,
            setback_m: 2,
            sourceLabel: 'test-source',
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.study.setback_m).toBe(2);
        // 20x10 inset by 2 on every edge -> 16 x 6 = 96 m^2 (uniform setback on a rectangle).
        expect(result.study.footprintAreaM2).toBeCloseTo(96, 3);
    });

    it('the study is schema-valid and its status is not any BuildableEnvelope vocabulary member', () => {
        const neighbours = [10, 12, 14].map((h) => neighbour(h, 'tagged', 10));
        const result = buildContextDerivedStudyEnvelope({
            parcelRing: PARCEL_RING,
            neighbours,
            radius_m: 50,
            sourceLabel: 'test-source',
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(() => ContextDerivedStudyEnvelopeSchema.parse(result.study)).not.toThrow();
        expect(result.study.status).toBe(CONTEXT_DERIVED_STUDY_STATUS);
        expect(result.study.status).toBe('context-derived-study');
        expect(EnvelopeStatusSchema.safeParse(result.study.status).success).toBe(false);
        expect(EnvelopeConfidenceSchema.safeParse(result.study.status).success).toBe(false);
        expect(result.study.disclaimer.length).toBeGreaterThan(0);
        expect(result.study.disclaimer.toUpperCase()).toContain('INDICATIVE');
        expect(result.study.disclaimer.toLowerCase()).toContain('not a compliance determination');
    });
});

describe('buildContextDerivedStudyEnvelope — the honesty refusals', () => {
    it('EXCLUDES `assumed` (fabricated placeholder) heights from the sample AND the median', () => {
        // Real evidence: 10, 12, 14 (median 12). Two fabricated 9 m placeholders must not pull it.
        const neighbours = [
            neighbour(10, 'tagged', 5),
            neighbour(12, 'tagged', 10),
            neighbour(14, 'tagged', 15),
            neighbour(9, 'assumed', 5),
            neighbour(9, 'assumed', 8),
        ];
        const result = buildContextDerivedStudyEnvelope({
            parcelRing: PARCEL_RING,
            neighbours,
            radius_m: 50,
            sourceLabel: 'test-source',
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const basis = asMedianBasis(result.study.heightBasis);
        expect(basis.sampledCount).toBe(3);
        expect(basis.excludedAssumedCount).toBe(2);
        expect(result.study.maxHeight_m).toBe(12);
    });

    it('refuses `insufficient-neighbour-sample` when fewer than the minimum REAL samples exist', () => {
        // Only 2 real heights (one assumed) — below the default floor of 3.
        const neighbours = [
            neighbour(10, 'tagged', 5),
            neighbour(12, 'derived-levels', 10),
            neighbour(9, 'assumed', 5),
        ];
        const result = buildContextDerivedStudyEnvelope({
            parcelRing: PARCEL_RING,
            neighbours,
            radius_m: 50,
            sourceLabel: 'test-source',
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe('insufficient-neighbour-sample');
        expect(result.realSampleCount).toBe(2);
        expect(result.excludedAssumedCount).toBe(1);
        expect(CONTEXT_STUDY_DEFAULT_MIN_SAMPLE_SIZE).toBe(3);
    });

    it('excludes neighbours OUTSIDE the search radius before counting real samples', () => {
        const neighbours = [
            neighbour(10, 'tagged', 5),
            neighbour(12, 'tagged', 10),
            neighbour(14, 'tagged', 999), // far outside a 50 m radius
        ];
        const result = buildContextDerivedStudyEnvelope({
            parcelRing: PARCEL_RING,
            neighbours,
            radius_m: 50,
            sourceLabel: 'test-source',
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe('insufficient-neighbour-sample');
        expect(result.realSampleCount).toBe(2);
    });

    it('refuses `degenerate-footprint` when the setback consumes the whole parcel', () => {
        const neighbours = [10, 12, 14].map((h) => neighbour(h, 'tagged', 10));
        const result = buildContextDerivedStudyEnvelope({
            parcelRing: PARCEL_RING, // 20 x 10 — half-width is 5 m
            neighbours,
            radius_m: 50,
            setback_m: 20, // far larger than the parcel's own half-width
            sourceLabel: 'test-source',
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe('degenerate-footprint');
        expect(result.realSampleCount).toBe(3);
    });
});

// §MANUALENV159 (L-12640) — `buildUserSuppliedStudyEnvelope`: the founder's own literal request,
// "if you dont know add this: 24.5 meters on this parcel", reusing the SAME schema/status/badge as
// the median-of-neighbours study above. The one property every test here defends: a user-supplied
// height and a median-of-neighbours height must never collapse into the same PROVENANCE value.
describe('buildUserSuppliedStudyEnvelope — the founder\'s literal ask', () => {
    it('24.5 m (the founder\'s stated value) is comfortably inside the accepted bounds and builds a study', () => {
        const result = buildUserSuppliedStudyEnvelope({
            parcelRing: PARCEL_RING,
            heightM: 24.5,
            nowIso: '2026-08-27T00:00:00.000Z',
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.study.maxHeight_m).toBe(24.5);
        expect(result.study.status).toBe(CONTEXT_DERIVED_STUDY_STATUS);
        expect(() => ContextDerivedStudyEnvelopeSchema.parse(result.study)).not.toThrow();
    });

    it('PROVENANCE DIFFERS FROM THE DERIVED CASE — `heightBasis.method` is `user-supplied`, never `median-neighbour-height`, and the object has NO sample/radius fields', () => {
        const result = buildUserSuppliedStudyEnvelope({ parcelRing: PARCEL_RING, heightM: 24.5 });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.study.heightBasis.method).toBe('user-supplied');
        expect(result.study.heightBasis.method).not.toBe('median-neighbour-height');
        if (result.study.heightBasis.method !== 'user-supplied') return;
        expect(result.study.heightBasis.suppliedHeight_m).toBe(24.5);
        expect('sampledCount' in result.study.heightBasis).toBe(false);
        expect('radius_m' in result.study.heightBasis).toBe(false);
    });

    it('the badge/disclaimer says SUPPLIED BY YOU — never worded as measured or derived', () => {
        const result = buildUserSuppliedStudyEnvelope({ parcelRing: PARCEL_RING, heightM: 24.5 });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.study.disclaimer.toUpperCase()).toContain('INDICATIVE');
        expect(result.study.disclaimer).toContain('SUPPLIED BY YOU');
        // It is fine for the word "measured" to appear as part of an explicit NEGATION ("not
        // measured or derived") — that is the honest disclosure. What must never appear is a
        // POSITIVE claim of measurement.
        expect(result.study.disclaimer.toLowerCase()).toContain('not measured');
        expect(result.study.disclaimer.toLowerCase()).not.toContain('this is a measured');
        if (result.study.heightBasis.method !== 'user-supplied') return;
        expect(result.study.heightBasis.sourceLabel.toLowerCase()).toContain('you');
    });

    it('two builders given the SAME height (24.5 m) still disagree in the DATA MODEL, not only in prose', () => {
        const derived = buildContextDerivedStudyEnvelope({
            parcelRing: PARCEL_RING,
            neighbours: [24.5, 24.5, 24.5].map((h) => neighbour(h, 'tagged', 10)),
            radius_m: 50,
            sourceLabel: 'test-source',
        });
        const supplied = buildUserSuppliedStudyEnvelope({ parcelRing: PARCEL_RING, heightM: 24.5 });
        expect(derived.ok).toBe(true);
        expect(supplied.ok).toBe(true);
        if (!derived.ok || !supplied.ok) return;
        // Same top-level number...
        expect(derived.study.maxHeight_m).toBe(supplied.study.maxHeight_m);
        // ...but a DIFFERENT provenance value underneath, structurally, not just in wording.
        expect(derived.study.heightBasis.method).toBe('median-neighbour-height');
        expect(supplied.study.heightBasis.method).toBe('user-supplied');
        expect(derived.study.heightBasis.method).not.toBe(supplied.study.heightBasis.method);
    });

    it('refuses `height-out-of-bounds` (named, with BOTH numbers — C74/CA-18) below the floor', () => {
        const result = buildUserSuppliedStudyEnvelope({ parcelRing: PARCEL_RING, heightM: 0.5 });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe('height-out-of-bounds');
        expect(result.minM).toBe(USER_SUPPLIED_STUDY_HEIGHT_MIN_M);
        expect(result.maxM).toBe(USER_SUPPLIED_STUDY_HEIGHT_MAX_M);
    });

    it('refuses `height-out-of-bounds` above the ceiling — a likely typo (e.g. 2450 instead of 24.5)', () => {
        const result = buildUserSuppliedStudyEnvelope({ parcelRing: PARCEL_RING, heightM: 2450 });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe('height-out-of-bounds');
        expect(result.minM).toBe(USER_SUPPLIED_STUDY_HEIGHT_MIN_M);
        expect(result.maxM).toBe(USER_SUPPLIED_STUDY_HEIGHT_MAX_M);
    });

    it('rejects a non-finite height the same way as an out-of-bounds one, never a NaN volume', () => {
        const result = buildUserSuppliedStudyEnvelope({ parcelRing: PARCEL_RING, heightM: NaN });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe('height-out-of-bounds');
    });

    it('refuses `degenerate-footprint` when the setback consumes the whole parcel', () => {
        const result = buildUserSuppliedStudyEnvelope({
            parcelRing: PARCEL_RING, // 20 x 10 — half-width is 5 m
            heightM: 24.5,
            setback_m: 20,
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe('degenerate-footprint');
    });

    it('defaults the footprint to the PARCEL RING ITSELF when setback_m is omitted (0) — same footprint construction as the derived study', () => {
        const result = buildUserSuppliedStudyEnvelope({ parcelRing: PARCEL_RING, heightM: 24.5 });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.study.setback_m).toBe(0);
        expect(result.study.footprintAreaM2).toBeCloseTo(200, 6); // 20 x 10
    });

    it('is NEVER gated by CONTEXT_DERIVED_STUDY_ENVELOPE_CERTIFIED — the flag is not even imported/checked here', () => {
        // Deliberately no reference to CONTEXT_DERIVED_STUDY_ENVELOPE_CERTIFIED in this test: the
        // function must build successfully regardless of that flag's value, because it makes no
        // PRYZM-derived claim (see the module header). A regression that starts gating this
        // function would silently reintroduce the L-942 shape this lane exists to remove.
        const result = buildUserSuppliedStudyEnvelope({ parcelRing: PARCEL_RING, heightM: 24.5 });
        expect(result.ok).toBe(true);
    });
});
