// L-616 — FAR-BOUND buildable-envelope massing height (§CONTEXT-DATA-HONESTY).
//
// The 3D solid used to extrude footprint × maxHeight and ignore FAR entirely, overstating
// buildable VOLUME whenever FAR caps floorspace below the height cap (the founder's Copenhagen
// defect: 24 m / ~8 storeys drawn where FAR 1.5 permits ~1.5 floors — a ~5× over-statement).
//
// `computeBuildableEnvelope` now returns `farLimitedHeight_m`: the height a FAR-realistic massing
// reaches INSIDE the legal height shell, or `null` when FAR does not bind. These tests lock in:
//   (a) Copenhagen-like — FAR 1.5 on a full-footprint plot → ~4.5 m inside a 24 m shell;
//   (b) Barcelona 13a-like — maxFAR null → farLimitedHeight_m null (single solid, UNCHANGED);
//   (c) BCN 20a-like — real FAR + real height → a bound height strictly below the legal cap.

import { describe, it, expect } from 'vitest';
import type { Pt, ParcelEdgeClassification } from '@pryzm/schemas';
import { JurisdictionZoningContractSchema } from '@pryzm/schemas';
import { computeBuildableEnvelope } from '../src/index.js';

/** Axis-aligned rectangle w × h (CCW), area = w·h. */
function rect(w: number, h: number): Pt[] {
    return [
        { x: 0, z: 0 },
        { x: w, z: 0 },
        { x: w, z: h },
        { x: 0, z: h },
    ];
}
const UNCLASSIFIED: ParcelEdgeClassification[] = [
    'unclassified', 'unclassified', 'unclassified', 'unclassified',
];

/**
 * Build a one-zone rule pack + a matching ZoningRecord so `computeBuildableEnvelope` resolves the
 * exact FAR / height / floors / setbacks we want to measure.
 */
function solveWith(opts: {
    parcel: Pt[];
    maxHeight_m: number | null;
    maxFloors: number | null;
    plotRatioFAR: number | null;
    setbacks?: { front_m: number; side_m: number; rear_m: number };
}) {
    const setbacks = opts.setbacks ?? { front_m: 0, side_m: 0, rear_m: 0 };
    const pack = JurisdictionZoningContractSchema.parse({
        jurisdictionId: 'l616-test',
        displayName: 'L-616 test pack',
        source: 'manual',
        crs: 'EPSG:4326',
        lastReviewed: '2026-07-26',
        defaultConfidence: 'estimated-ruleset',
        zones: [
            {
                code: 'test-zone',
                label: 'L-616 test zone',
                permittedUse: ['residential'],
                maxHeight_m: opts.maxHeight_m,
                maxFloors: opts.maxFloors,
                plotRatioFAR: opts.plotRatioFAR,
                setbacks,
                ordinanceRef: null,
            },
        ],
    });
    const zoning = {
        zoneCode: 'test-zone',
        zoneLabel: 'L-616 test zone',
        jurisdictionId: 'l616-test',
        structuredFields: {},
        overlays: [] as string[],
        ordinanceRef: null,
        provenance: {
            source: 'l616-test',
            label: 'L-616 test',
            version: '2026-07-26',
            license: null,
            crs: 'EPSG:4326',
        },
    };
    return computeBuildableEnvelope({
        parcelRing: opts.parcel,
        edgeClassifications: UNCLASSIFIED,
        zoning,
        rulePack: pack,
    });
}

describe('L-616 — farLimitedHeight_m computation', () => {
    it('(a) Copenhagen-like: FAR 1.5, footprint == parcel (666 m²), 24 m cap → ~4.5 m', () => {
        // 37 × 18 = 666 m². Zero setbacks → inset == parcel → footprint 666 m².
        const env = solveWith({
            parcel: rect(37, 18),
            maxHeight_m: 24,
            maxFloors: null, // → 3.0 m floor-to-floor assumption
            plotRatioFAR: 1.5,
        });
        expect(env.status).toBe('ok');
        expect(env.insetAreaM2).toBeCloseTo(666, 6);
        // maxGFA = 1.5·666 = 999; floorsByFAR = 999/666 = 1.5; ×3.0 m = 4.5 m; min(24, 4.5) = 4.5.
        expect(env.farLimitedHeight_m).toBeCloseTo(4.5, 6);
        // The legal shell (maxHeight_m) is UNCHANGED — the shell/solid split lives downstream.
        expect(env.maxHeight_m).toBe(24);
        // The 3.0 m floor assumption is SURFACED, never silent (§CONTEXT-DATA-HONESTY).
        expect(env.caveats.some((c) => /FAR 1\.5 caps usable floorspace/i.test(c))).toBe(true);
        expect(env.caveats.some((c) => /3\.0 m floors/i.test(c))).toBe(true);
        expect(env.caveats.some((c) => /24 m height limit is the outer legal bound/i.test(c))).toBe(true);
    });

    it('(b) Barcelona 13a-like: maxFAR null → farLimitedHeight_m null (single solid, UNCHANGED)', () => {
        const env = solveWith({
            parcel: rect(37, 18),
            maxHeight_m: 20.75,
            maxFloors: null,
            plotRatioFAR: null, // FAR does not bind — the honesty-critical protected case
        });
        expect(env.status).toBe('ok');
        expect(env.maxFAR).toBeNull();
        expect(env.farLimitedHeight_m).toBeNull();
        // No FAR caveat is added when FAR does not bind.
        expect(env.caveats.some((c) => /caps usable floorspace/i.test(c))).toBe(false);
    });

    it('(c) BCN 20a-like: real FAR + real height → bound height strictly below the legal cap', () => {
        const env = solveWith({
            parcel: rect(40, 20), // 800 m²
            maxHeight_m: 20,
            maxFloors: 6, // → floor height = 20/6 ≈ 3.33 m
            plotRatioFAR: 1.2,
            setbacks: { front_m: 3, side_m: 1.5, rear_m: 3 },
        });
        expect(env.status).toBe('ok');
        expect(env.farLimitedHeight_m).not.toBeNull();
        expect(env.farLimitedHeight_m!).toBeGreaterThan(0);
        expect(env.farLimitedHeight_m!).toBeLessThan(20); // FAR binds below the legal ceiling
        expect(env.caveats.some((c) => /caps usable floorspace/i.test(c))).toBe(true);
    });

    it('FAR never RAISES the height above the legal cap (min-clamp)', () => {
        // Huge FAR that would imply many floors — must still be clamped to maxHeight.
        const env = solveWith({
            parcel: rect(37, 18),
            maxHeight_m: 24,
            maxFloors: null,
            plotRatioFAR: 100, // absurd — farHeight would be enormous
        });
        expect(env.status).toBe('ok');
        expect(env.farLimitedHeight_m).toBe(24); // clamped to the legal cap, not taller
        // No caveat: farLimitedHeight_m is NOT below maxHeight, so FAR did not lower anything.
        expect(env.caveats.some((c) => /caps usable floorspace/i.test(c))).toBe(false);
    });
});
