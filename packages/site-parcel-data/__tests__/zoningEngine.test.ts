// C58 §6 — envelope-determinism / confidence-label / derivation-complete gates.

import { describe, it, expect } from 'vitest';
import type {
    Pt,
    ParcelEdgeClassification,
    ZoningRecord,
    EnvelopeGranularity,
} from '@pryzm/schemas';
import { ZoningRecordSchema } from '@pryzm/schemas';
import {
    computeBuildableEnvelope,
    solveEstimatedEnvelope,
    ESTIMATED_DEFAULT_PACK,
    estimatedDefaultZoningRecord,
} from '../src/index.js';

// 40 m × 20 m rectangle (area 800 m²), CCW, edges unclassified (the current C19 state).
const RECT: Pt[] = [
    { x: 0, z: 0 },
    { x: 40, z: 0 },
    { x: 40, z: 20 },
    { x: 0, z: 20 },
];
const UNCLASSIFIED: ParcelEdgeClassification[] = [
    'unclassified',
    'unclassified',
    'unclassified',
    'unclassified',
];

describe('computeBuildableEnvelope — estimated default pack', () => {
    it('produces an estimated-ruleset envelope with the mandatory confidence label', () => {
        const env = solveEstimatedEnvelope(RECT, UNCLASSIFIED);
        expect(env.confidence).toBe('estimated-ruleset'); // C58 §1.2 mandatory label
        expect(env.status).toBe('ok');
        expect(env.zoneCode).toBe('generic-urban');
    });

    it('insets by the uniform mean setback and applies the height', () => {
        const env = solveEstimatedEnvelope(RECT, UNCLASSIFIED);
        // §ESTIMATED-SETBACK-MODEST — uniform = mean(3,1.5,3) = 2.5 → inner (40-2u)×(20-2u).
        const u = (3 + 1.5 + 3) / 3;
        const expectedArea = (40 - 2 * u) * (20 - 2 * u);
        expect(env.insetAreaM2).toBeCloseTo(expectedArea, 4);
        expect(env.maxHeight_m).toBe(12);
        expect(env.maxVolumeM3).toBeCloseTo(expectedArea * 12, 3);
        expect(env.maxFAR).toBe(2);
    });

    it('flags the uniform-setback fallback in caveats (C58 §10.3)', () => {
        const env = solveEstimatedEnvelope(RECT, UNCLASSIFIED);
        expect(env.caveats.some((c) => /uniform setback/i.test(c))).toBe(true);
        expect(env.caveats.some((c) => /verify against/i.test(c))).toBe(true);
    });

    it('populates a DerivationEntry for every resolved numeric constraint (C58 §1.3)', () => {
        const env = solveEstimatedEnvelope(RECT, UNCLASSIFIED);
        const constraints = env.derivation.map((d) => d.constraint);
        for (const c of ['setback.front', 'setback.side', 'setback.rear', 'maxHeight', 'maxFAR', 'maxCoverage']) {
            expect(constraints).toContain(c);
        }
        // Every entry names its source + provenance (C58 §1.3).
        for (const d of env.derivation) {
            expect(d.source.length).toBeGreaterThan(0);
            expect(d.fieldProvenance).toBe('estimated');
            expect(d.zoneCode).toBe('generic-urban');
        }
    });
});

describe('computeBuildableEnvelope — determinism (C58 §1.1)', () => {
    it('is byte-identical across repeated solves of the same input', () => {
        const a = JSON.stringify(solveEstimatedEnvelope(RECT, UNCLASSIFIED));
        const b = JSON.stringify(solveEstimatedEnvelope(RECT, UNCLASSIFIED));
        expect(a).toBe(b);
    });
});

describe('computeBuildableEnvelope — degenerate over-inset', () => {
    it('reports status "degenerate" with no volume when setbacks consume the parcel', () => {
        // §ESTIMATED-SETBACK-MODEST — with the modest 2.5 m uniform inset a plot must be
        // genuinely tiny (≤ ~5 m across) to fully degenerate; a 4×4 m plot still does
        // (4 − 2×2.5 = −1 m → the setbacks cross the centreline).
        const tiny: Pt[] = [
            { x: 0, z: 0 },
            { x: 4, z: 0 },
            { x: 4, z: 4 },
            { x: 0, z: 4 },
        ];
        const env = solveEstimatedEnvelope(tiny, UNCLASSIFIED);
        expect(env.status).toBe('degenerate');
        expect(env.insetPolygon).toEqual([]);
        expect(env.maxVolumeM3).toBeNull();
        // The label is still present (never a fabricated authoritative surface).
        expect(env.confidence).toBe('estimated-ruleset');
        expect(env.caveats.some((c) => /consume the whole parcel/i.test(c))).toBe(true);
    });
});

describe('computeBuildableEnvelope — modest setbacks on a normal urban plot (§ESTIMATED-SETBACK-MODEST)', () => {
    // The demo-critical case: a typical small Barcelona plot (~12 × 8 m). Under the OLD
    // 5/3/6 m defaults (uniform mean 4.667 m) this degenerated to nothing — the founder's
    // "Setbacks consume the whole parcel" card on a normal plot. The modest 3/1.5/3 m
    // defaults MUST leave a plausible, non-degenerate buildable envelope.
    const SMALL_URBAN: Pt[] = [
        { x: 0, z: 0 },
        { x: 12, z: 0 },
        { x: 12, z: 8 },
        { x: 0, z: 8 },
    ];

    it('yields a NON-degenerate envelope with plausible area on a ~12×8 m plot', () => {
        const env = solveEstimatedEnvelope(SMALL_URBAN, UNCLASSIFIED);
        expect(env.status).toBe('ok');
        expect(env.insetPolygon.length).toBeGreaterThanOrEqual(3);
        // uniform = mean(3,1.5,3) = 2.5 → (12 − 5) × (8 − 5) = 7 × 3 = 21 m².
        const u = (3 + 1.5 + 3) / 3;
        const expectedArea = (12 - 2 * u) * (8 - 2 * u);
        expect(env.insetAreaM2).toBeCloseTo(expectedArea, 4);
        expect(env.insetAreaM2).toBeGreaterThan(15); // visibly buildable, not a sliver
        expect(env.maxHeight_m).toBe(12);
        expect(env.maxVolumeM3).toBeCloseTo(expectedArea * 12, 3);
        // Still an ESTIMATE — the honest label + verify caveat are mandatory.
        expect(env.confidence).toBe('estimated-ruleset');
        expect(env.caveats.some((c) => /verify against/i.test(c))).toBe(true);
    });
});

describe('computeBuildableEnvelope — structured fidelity (C58 §1.2 fidelity 1)', () => {
    it('labels an envelope "structured" when every number comes from the provider', () => {
        const zoning: ZoningRecord = ZoningRecordSchema.parse({
            zoneCode: 'DK-B1',
            zoneLabel: 'Boligområde',
            jurisdictionId: 'dk',
            structuredFields: {
                maxHeight_m: 18,
                maxFloors: 6,
                plotRatioFAR: 1.5,
                maxCoverage: 0.4,
                setbacks: { front_m: 2.5, side_m: 2.5, rear_m: 2.5 },
                permittedUse: ['residential'],
            },
            overlays: [],
            provenance: { source: 'plandata-dk', label: 'DK Plandata', version: null, license: null, crs: 'EPSG:25832' },
        });
        const env = computeBuildableEnvelope({
            parcelRing: RECT,
            edgeClassifications: UNCLASSIFIED,
            zoning,
            rulePack: null,
        });
        expect(env.confidence).toBe('structured');
        expect(env.maxHeight_m).toBe(18);
        expect(env.derivation.every((d) => d.fieldProvenance === 'published-structured')).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1 — generic-engine leverage (ENVELOPE-IMPLEMENTATION-PLAN §1). Two engine
// changes that lift EVERY setback-governed jurisdiction at once:
//   (1) per-edge front/side/rear setbacks (the fallback is uniform ONLY for
//       unclassified edges);
//   (2) provider-stamped granularity flowing to `env.granularity`.
// ─────────────────────────────────────────────────────────────────────────────

describe('computeBuildableEnvelope — per-edge front/side/rear setbacks (C58 §10.3, Phase 1)', () => {
    // A structured record carrying REAL, DISTINCT front/side/rear setbacks — no rule pack needed,
    // and every number is `published-structured`, so the inset math is exercised in isolation.
    const perEdgeRecord = (): ZoningRecord =>
        ZoningRecordSchema.parse({
            zoneCode: 'SYNTH-SETBACK',
            zoneLabel: 'Synthetic setback zone',
            jurisdictionId: 'synthetic',
            structuredFields: {
                maxHeight_m: 12,
                setbacks: { front_m: 6, side_m: 2, rear_m: 4 },
                permittedUse: ['residential'],
            },
            overlays: [],
            provenance: { source: 'synthetic-test', label: 'test', version: null, license: null, crs: null },
        });

    // RECT edges (CCW): 0 = front (z=0 side), 1 = side (x=40), 2 = rear (z=20 side), 3 = side (x=0).
    const MIXED: ParcelEdgeClassification[] = ['front', 'side', 'rear', 'side'];

    it('insets each classified edge by its OWN setback, NOT the uniform mean', () => {
        const perEdge = computeBuildableEnvelope({
            parcelRing: RECT, edgeClassifications: MIXED, zoning: perEdgeRecord(), rulePack: null,
        });
        const uniformEnv = computeBuildableEnvelope({
            parcelRing: RECT, edgeClassifications: UNCLASSIFIED, zoning: perEdgeRecord(), rulePack: null,
        });
        // Per-edge: sides inset 2 → x∈[2,38]; front 6 / rear 4 → z∈[6,16]. Area = 36 × 10 = 360 m².
        expect(perEdge.status).toBe('ok');
        expect(perEdge.insetAreaM2).toBeCloseTo(360, 4);
        // Uniform fallback: mean(6,2,4)=4 on every edge → (40−8) × (20−8) = 32 × 12 = 384 m².
        const u = (6 + 2 + 4) / 3;
        expect(uniformEnv.insetAreaM2).toBeCloseTo((40 - 2 * u) * (20 - 2 * u), 4);
        // THE PROOF: real per-edge setbacks yield a DIFFERENT footprint from the uniform fallback.
        expect(Math.abs(perEdge.insetAreaM2 - uniformEnv.insetAreaM2)).toBeGreaterThan(1);
    });

    it('does NOT flag a uniform-setback caveat when EVERY edge is classified', () => {
        const env = computeBuildableEnvelope({
            parcelRing: RECT, edgeClassifications: MIXED, zoning: perEdgeRecord(), rulePack: null,
        });
        expect(env.caveats.some((c) => /uniform setback/i.test(c))).toBe(false);
    });

    it('DOES flag the fallback honestly when SOME edges are unclassified (§CONTEXT-DATA-HONESTY)', () => {
        // One classified front edge + three unclassified → the three receive the uniform mean, a
        // substitution that was SILENT before Phase 1 (the caveat used to fire only when ALL edges
        // were unclassified).
        const partial: ParcelEdgeClassification[] = ['front', 'unclassified', 'unclassified', 'unclassified'];
        const env = computeBuildableEnvelope({
            parcelRing: RECT, edgeClassifications: partial, zoning: perEdgeRecord(), rulePack: null,
        });
        expect(env.caveats.some((c) => /uniform setback/i.test(c))).toBe(true);
    });
});

describe('computeBuildableEnvelope — provider-stamped granularity (C58 §1.11, Phase 1)', () => {
    // A coarse source (Madrid VEDA at *ámbito* level): real published numbers, NOT about this plot.
    const coarseRecord = (granularity?: EnvelopeGranularity): ZoningRecord =>
        ZoningRecordSchema.parse({
            zoneCode: 'ES-MADRID-VEDA',
            zoneLabel: 'Ámbito VEDA',
            jurisdictionId: 'es-madrid',
            structuredFields: { maxHeight_m: 20, plotRatioFAR: 1.2, permittedUse: ['residential'] },
            overlays: [],
            ...(granularity ? { granularity } : {}),
            provenance: { source: 'madrid-veda', label: 'Madrid VEDA', version: null, license: null, crs: null },
        });

    it('flows a coarse `ambito` granularity through to the envelope (§1.11.3 refuses it as parcel)', () => {
        const env = computeBuildableEnvelope({
            parcelRing: RECT, edgeClassifications: UNCLASSIFIED, zoning: coarseRecord('ambito'), rulePack: null,
        });
        expect(env.granularity).toBe('ambito');
    });

    it('defaults to `parcel` when the record stamps no granularity (byte-identical to before)', () => {
        const env = computeBuildableEnvelope({
            parcelRing: RECT, edgeClassifications: UNCLASSIFIED, zoning: coarseRecord(), rulePack: null,
        });
        expect(env.granularity).toBe('parcel');
    });
});

describe('estimated default pack — provenance completeness (C58 §1.6)', () => {
    it('every zone carries per-field provenance + lastReviewed', () => {
        expect(ESTIMATED_DEFAULT_PACK.lastReviewed.length).toBeGreaterThan(3);
        for (const zone of ESTIMATED_DEFAULT_PACK.zones) {
            expect(Object.keys(zone.fieldProvenance).length).toBeGreaterThan(0);
            for (const flag of Object.values(zone.fieldProvenance)) {
                expect(['published-structured', 'ordinance-pdf', 'estimated']).toContain(flag);
            }
        }
    });

    it('estimatedDefaultZoningRecord parses against the L0 schema', () => {
        expect(() => ZoningRecordSchema.parse(estimatedDefaultZoningRecord())).not.toThrow();
    });
});
