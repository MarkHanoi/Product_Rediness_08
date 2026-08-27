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
} from '../src/index.js';
// SIG-NL2: an OPEN gate must name its recorded decision — asserted below, not assumed.
import { L449_CERTIFICATION_GATES } from '../src/l449CertificationGates.js';
import {
    ContextDerivedStudyEnvelopeSchema,
    CONTEXT_DERIVED_STUDY_STATUS,
    EnvelopeStatusSchema,
    EnvelopeConfidenceSchema,
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
        expect(row!.signature).toContain('SIG-NL2');
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
        expect(result.study.heightBasis.medianHeight_m).toBe(14);
        expect(result.study.heightBasis.minHeight_m).toBe(10);
        expect(result.study.heightBasis.maxHeight_m).toBe(18);
        expect(result.study.heightBasis.sampledCount).toBe(5);
        expect(result.study.heightBasis.excludedAssumedCount).toBe(0);
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
        expect(result.study.heightBasis.sampledCount).toBe(3);
        expect(result.study.heightBasis.excludedAssumedCount).toBe(2);
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
