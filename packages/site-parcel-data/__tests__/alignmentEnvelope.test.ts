// ADR-0270 P2 / §L-451 — A1b-iii: the ENGINE-LEVEL integration test.
//
// A1b-i proved the depth clip in isolation and A1b-ii wired it in, but neither proved the
// COMPOSITION end-to-end. This closes that gap, which I flagged as outstanding rather than
// claiming A1b was done.
//
// THE ACCEPTANCE CRITERION: an alignment zone driven through computeBuildableEnvelope must
// yield a DEPTH-LIMITED envelope — not a whole-plot one. A whole-plot result is precisely the
// silent defect ADR-0270 exists to prevent: coercing alineación into a setback produces a
// confidently wrong buildable area on the highest-value urban parcels, and it looks correct.

import { describe, it, expect } from 'vitest';
import type { Pt, ParcelEdgeClassification, GeometricRule } from '@pryzm/schemas';
import { computeBuildableEnvelope, estimatedDefaultZoningRecord, ESTIMATED_DEFAULT_PACK } from '../src/index.js';

/** 30 m wide × 40 m deep. Edge 0 (z=0 → the +x run) is the street. */
const PARCEL: Pt[] = [
    { x: 0, z: 0 },
    { x: 30, z: 0 },
    { x: 30, z: 40 },
    { x: 0, z: 40 },
];

/** Edge i spans vertex i → i+1, so index 0 is the street frontage. */
const WITH_FRONT: ParcelEdgeClassification[] = ['front', 'side', 'rear', 'side'];
const ALL_UNCLASSIFIED: ParcelEdgeClassification[] = [
    'unclassified', 'unclassified', 'unclassified', 'unclassified',
];

const ENSANCHE: GeometricRule = {
    kind: 'alignment',
    alignTo: 'street',
    buildableDepth_m: 12,
    alignmentOffset_m: 0,
    sideTreatment: 'party-wall',
};

function solve(
    geometricRule: GeometricRule | null,
    edges: ParcelEdgeClassification[] = WITH_FRONT,
) {
    return computeBuildableEnvelope({
        parcelRing: PARCEL,
        edgeClassifications: edges,
        zoning: estimatedDefaultZoningRecord(),
        rulePack: ESTIMATED_DEFAULT_PACK,
        geometricRule,
    });
}

describe('ADR-0270 A1b-iii — alignment zones END-TO-END through the engine', () => {
    it('THE ACCEPTANCE CRITERION: an alignment zone yields a DEPTH-LIMITED envelope', () => {
        const withDepth = solve(ENSANCHE);
        const noRule = solve(null);

        expect(withDepth.status).toBe('ok');
        expect(noRule.status).toBe('ok');

        // The whole point. If profundidad edificable were silently dropped, these would match.
        expect(withDepth.insetAreaM2).toBeLessThan(noRule.insetAreaM2);

        // 30 m frontage minus party walls (0) is full width; depth capped at 12 m ⇒ ~360 m².
        // A result near the un-clipped area would mean the depth cap never applied.
        expect(withDepth.insetAreaM2).toBeGreaterThan(200);
        expect(withDepth.insetAreaM2).toBeLessThan(500);
    });

    it('states in the caveats that profundidad edificable was applied (C58 §1.3 explain-why)', () => {
        const env = solve(ENSANCHE);
        expect(env.caveats.some((c) => /profundidad edificable/i.test(c))).toBe(true);
        expect(env.caveats.some((c) => /12/.test(c))).toBe(true);
    });

    it('BACK-COMPAT: omitting geometricRule reproduces today\'s setback behaviour exactly', () => {
        // Every pack shipped before ADR-0270 has no geometric rule. Absence must be the legacy
        // semantic, byte-for-byte — otherwise this change silently moves existing envelopes.
        const omitted = computeBuildableEnvelope({
            parcelRing: PARCEL,
            edgeClassifications: WITH_FRONT,
            zoning: estimatedDefaultZoningRecord(),
            rulePack: ESTIMATED_DEFAULT_PACK,
        });
        const explicitNull = solve(null);
        expect(omitted.insetAreaM2).toBeCloseTo(explicitNull.insetAreaM2, 9);
        expect(omitted.status).toBe(explicitNull.status);
    });

    it('a `setback` rule takes the LEGACY path and is unaffected by the depth machinery', () => {
        const asSetback = solve({ kind: 'setback', front_m: 3, side_m: 1.5, rear_m: 3 });
        const noRule = solve(null);
        // The estimated pack already resolves 3/1.5/3, so an explicit setback rule of the same
        // values must not change the answer — proof the union dispatch is not double-applying.
        expect(asSetback.status).toBe('ok');
        expect(asSetback.insetAreaM2).toBeCloseTo(noRule.insetAreaM2, 6);
        expect(asSetback.caveats.some((c) => /profundidad/i.test(c))).toBe(false);
    });

    it('HARD-FAILS when an alignment zone has NO front edge — never a full-depth fallback', () => {
        // The most important negative case. Without a front edge there is no alineación to
        // measure from. Skipping the clip would return the FULL-DEPTH ring, i.e. a confidently
        // wrong buildable area — so the engine must refuse the envelope instead (C58 §1.4).
        const env = solve(ENSANCHE, ALL_UNCLASSIFIED);
        expect(env.status).toBe('degenerate');
        expect(env.insetAreaM2).toBe(0);
        expect(env.caveats.some((c) => /no parcel edge is classified/i.test(c))).toBe(true);
    });

    it('reports when the depth is NOT binding rather than citing a limit that never applied', () => {
        // 40 m deep parcel, 500 m permitted depth: setbacks alone govern. Claiming the depth
        // constrained the envelope would misrepresent what actually did (C58 §1.3).
        const env = solve({ ...ENSANCHE, buildableDepth_m: 500 });
        expect(env.status).toBe('ok');
        expect(env.caveats.some((c) => /NOT binding/i.test(c))).toBe(true);
    });

    it('is degenerate when the depth leaves nothing after setbacks — no phantom envelope', () => {
        const env = solve({ ...ENSANCHE, buildableDepth_m: 0.001 });
        expect(env.status).toBe('degenerate');
        expect(env.insetAreaM2).toBe(0);
    });

    it('keeps the C58 §1.2 confidence label on the alignment path', () => {
        // The new geometry must not bypass the honesty machinery.
        const env = solve(ENSANCHE);
        expect(env.confidence).toBe('estimated-ruleset');
        expect(env.caveats.some((c) => /verify against/i.test(c))).toBe(true);
    });

    it('is DETERMINISTIC on the alignment path (C58 §1.1)', () => {
        expect(JSON.stringify(solve(ENSANCHE))).toBe(JSON.stringify(solve(ENSANCHE)));
    });
});
