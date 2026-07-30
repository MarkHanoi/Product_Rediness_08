// C63 (DRAFT — ADR-0281) — City-Completion Scorecard L0 SCHEMA tests (P5-pure; L-648).
//
// This suite is the canonical L0 home: it exercises the schema + the pure reducer ONLY (no impure
// tool import), so it runs cleanly under the schemas vitest suite. The impure compute FUNCTION is
// tested next to the tool (`tools/city-completion/computeScorecard.test.ts`, run via `tsx --test`),
// because the tool transitively imports the large `heightSources.mjs`, which Vite's SSR transform
// cannot process but plain node imports fine.
//
// Load-bearing assertions:
//   1. The 7 fixed axes + the ratified weights (C63 §3/§4) — weights sum to 1.0.
//   2. The `AxisScore` refine makes the honesty rule STRUCTURAL: a null score needs a typed reason;
//      a numeric score must NOT claim one (C63 §1.2, §CONTEXT-DATA-HONESTY).
//   3. The pure `renormalizedOverall` reducer: assessed-subset renormalisation + `partial` (C63 §1.5).
//   4. The full schema validates a real-shaped scorecard fixture and rejects a fabricated one.

import { describe, expect, it } from 'vitest';
import {
    CityCompletionScorecardSchema,
    AxisScoreSchema,
    OverallSchema,
    AxisIdSchema,
    CITY_COMPLETION_WEIGHTS,
    CITY_COMPLETION_WEIGHTS_VERSION,
    AXIS_IDS,
    renormalizedOverall,
    type AxisId,
    type AxisScore,
} from '../src/site/completion/CityCompletionScorecard.js';

const stamp = 'scorecard@1.0 2026-07-30T00:00:00.000Z';
const assessed = (axis: AxisId, score: number): AxisScore => ({
    axis, score, validationState: 'auto-validated', derivation: `computed=${score}`, generatedBy: stamp,
});
const notAssessed = (axis: AxisId): AxisScore => ({
    axis, score: null, unknownReason: 'not-queried', validationState: 'not-checked',
    derivation: 'not-assessed', generatedBy: stamp,
});

describe('CityCompletionScorecard — axes + ratified weights', () => {
    it('exposes exactly the seven fixed axes in order (same ruler, C63 §1.3)', () => {
        expect([...AXIS_IDS]).toEqual([
            'parcel', 'legislation', 'dataSources', 'envelope', 'terrain', 'heightsLod', 'context',
        ]);
        expect(AxisIdSchema.safeParse('eighth-axis').success).toBe(false);
    });

    it('the ratified weight vector (C63 §4) sums to 1.0 and front-loads legislation/envelope', () => {
        const sum = AXIS_IDS.reduce((s, a) => s + CITY_COMPLETION_WEIGHTS[a], 0);
        expect(sum).toBeCloseTo(1.0, 10);
        expect(CITY_COMPLETION_WEIGHTS.legislation).toBe(0.25);
        expect(CITY_COMPLETION_WEIGHTS.envelope).toBe(0.2);
        expect(CITY_COMPLETION_WEIGHTS.context).toBe(0.05);
        expect(CITY_COMPLETION_WEIGHTS_VERSION).toBe('ratified-2026-07-30-L649');
    });
});

describe('AxisScore — the honesty rule is structural (C63 §1.2)', () => {
    it('score:null MUST carry a typed unknownReason', () => {
        expect(AxisScoreSchema.safeParse({ axis: 'parcel', score: null, derivation: 'x', generatedBy: stamp }).success).toBe(false);
        expect(AxisScoreSchema.safeParse({ axis: 'parcel', score: null, unknownReason: 'not-queried', derivation: 'x', generatedBy: stamp }).success).toBe(true);
    });
    it('a numeric score MUST NOT also claim an unknownReason (contradiction)', () => {
        expect(AxisScoreSchema.safeParse({ axis: 'terrain', score: 0.5, unknownReason: 'not-queried', derivation: 'x', generatedBy: stamp }).success).toBe(false);
    });
    it('rejects a fabricated / out-of-range score + a fabricated reason token', () => {
        expect(AxisScoreSchema.safeParse({ axis: 'context', score: 1.5, derivation: 'x', generatedBy: stamp }).success).toBe(false);
        expect(AxisScoreSchema.safeParse({ axis: 'context', score: null, unknownReason: 'dunno', derivation: 'x', generatedBy: stamp }).success).toBe(false);
    });
    it('defaults validationState to not-checked (C62 lifecycle)', () => {
        const parsed = AxisScoreSchema.parse({ axis: 'context', score: 1, derivation: 'x', generatedBy: stamp });
        expect(parsed.validationState).toBe('not-checked');
    });
});

describe('renormalizedOverall — assessed-subset renormalisation (C63 §1.5/§4)', () => {
    const axes = {
        parcel: notAssessed('parcel'),
        legislation: notAssessed('legislation'),
        dataSources: assessed('dataSources', 1),
        envelope: notAssessed('envelope'),
        terrain: assessed('terrain', 0.5),
        heightsLod: notAssessed('heightsLod'),
        context: assessed('context', 8 / 9),
    } satisfies Record<AxisId, AxisScore>;

    it('renormalises over ONLY the assessed axes, names them, flags partial', () => {
        const o = renormalizedOverall(axes);
        expect(o.assessedAxes.sort()).toEqual(['context', 'dataSources', 'terrain']);
        expect(o.partial).toBe(true);
        const expected = (0.15 * 1 + 0.1 * 0.5 + 0.05 * (8 / 9)) / (0.15 + 0.1 + 0.05);
        expect(o.score).toBeCloseTo(expected, 12);
        expect(OverallSchema.safeParse(o).success).toBe(true);
    });

    it('an unassessed axis neither counts as 0 nor inflates the rest (honest denominator)', () => {
        // If not-assessed were treated as 0, overall would be far lower; renormalisation keeps it honest.
        const naive = (0.15 * 1 + 0.1 * 0.5 + 0.05 * (8 / 9)) / 1.0; // divide by FULL weight = wrong
        const o = renormalizedOverall(axes);
        expect(o.score).toBeGreaterThan(naive);
    });

    it('returns score:null (not 0) when NOTHING is assessed', () => {
        const none = Object.fromEntries(AXIS_IDS.map((a) => [a, notAssessed(a)])) as Record<AxisId, AxisScore>;
        const o = renormalizedOverall(none);
        expect(o.score).toBeNull();
        expect(o.partial).toBe(true);
        expect(o.assessedAxes).toEqual([]);
    });
});

describe('CityCompletionScorecard — the full record', () => {
    const card = {
        jurisdictionId: 'es-ct-08019-barcelona',
        axes: {
            parcel: notAssessed('parcel'),
            legislation: notAssessed('legislation'),
            dataSources: assessed('dataSources', 1),
            envelope: notAssessed('envelope'),
            terrain: assessed('terrain', 0.5),
            heightsLod: notAssessed('heightsLod'),
            context: assessed('context', 8 / 9),
        },
        overall: { score: 0.8148, partial: true, assessedAxes: ['dataSources', 'terrain', 'context'] },
        honestyOk: true,
        weightsVersion: CITY_COMPLETION_WEIGHTS_VERSION,
    };

    it('VALIDATES a real-shaped scorecard (all seven axes present)', () => {
        expect(CityCompletionScorecardSchema.safeParse(card).success).toBe(true);
    });

    it('REJECTS a scorecard missing an axis (comparability invariant, C63 §1.3)', () => {
        const { context: _drop, ...missing } = card.axes;
        expect(CityCompletionScorecardSchema.safeParse({ ...card, axes: missing }).success).toBe(false);
    });

    it('defaults honestyOk to true', () => {
        const { honestyOk: _o, ...rest } = card;
        expect(CityCompletionScorecardSchema.parse(rest).honestyOk).toBe(true);
    });
});
