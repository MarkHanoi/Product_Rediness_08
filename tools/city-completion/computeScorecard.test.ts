// C63 (DRAFT — ADR-0281) — City-Completion COMPUTE FUNCTION tests (L-648, Phase-4 enabler).
//
// Run: `npx tsx --test tools/city-completion/computeScorecard.test.ts`  (the `test:pryzm1` runner).
// Uses node:test (not vitest) because the tool transitively imports the large `heightSources.mjs`,
// which plain node imports fine but Vite's SSR transform chokes on. `tsx` resolves the TS L0 schema
// import so the function's output is validated against the real schema.
//
// Load-bearing assertions:
//   1. The function output VALIDATES against the L0 schema (the two agree on the wire shape).
//   2. It computes the three CHEAP axes (dataSources/terrain/context) from real inspectable state.
//   3. It leaves PARCEL/LEGISLATION/ENVELOPE/HEIGHTS honestly `not-assessed` — null + a typed reason,
//      NEVER a fabricated 0 (C63 §1.2, §CONTEXT-DATA-HONESTY).
//   4. It is deterministic and never sets honestyOk false; the tool's weights mirror the schema's.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    CityCompletionScorecardSchema,
    AxisScoreSchema,
    CITY_COMPLETION_WEIGHTS,
    CITY_COMPLETION_WEIGHTS_VERSION,
} from '../../packages/schemas/src/site/completion/CityCompletionScorecard.js';
import {
    computeScorecard,
    computeParcelConfidence,
    CITY_COMPLETION_WEIGHTS as TOOL_WEIGHTS,
    CITY_COMPLETION_WEIGHTS_VERSION as TOOL_WEIGHTS_VERSION,
} from './computeScorecard.mjs';

const NOW = '2026-07-30T00:00:00.000Z';
const BCN = { jurisdictionId: 'es-ct-08019-barcelona', cc: 'es', regionKey: 'barcelona', slug: 'barcelona' };

test('the tool mirrors the schema weights + version EXACTLY (no drift)', () => {
    assert.deepEqual(TOOL_WEIGHTS, CITY_COMPLETION_WEIGHTS);
    assert.equal(TOOL_WEIGHTS_VERSION, CITY_COMPLETION_WEIGHTS_VERSION);
});

test('Barcelona: output validates against the L0 schema', () => {
    const card = computeScorecard(BCN, { now: NOW });
    const parsed = CityCompletionScorecardSchema.safeParse(card);
    assert.equal(parsed.success, true, parsed.success ? '' : JSON.stringify(parsed.error?.issues));
});

test('Barcelona: the three CHEAP axes are numbers in [0,1]', () => {
    const card = computeScorecard(BCN, { now: NOW });
    for (const a of ['dataSources', 'terrain', 'context'] as const) {
        const s = card.axes[a].score;
        assert.equal(typeof s, 'number');
        assert.ok((s as number) >= 0 && (s as number) <= 1);
    }
});

test('leaves PARCEL/LEGISLATION/ENVELOPE/HEIGHTS honestly not-assessed (null + typed reason, never 0)', () => {
    const card = computeScorecard(BCN, { now: NOW });
    const expected: Record<string, string> = {
        parcel: 'not-queried', legislation: 'not-queried',
        envelope: 'pending-implementation', heightsLod: 'not-queried',
    };
    for (const [axis, reason] of Object.entries(expected)) {
        const ax = card.axes[axis as keyof typeof card.axes];
        assert.equal(ax.score, null, `${axis} must be null`);
        assert.notEqual(ax.score, 0, `${axis} must NOT be a fabricated 0`);
        assert.equal(ax.unknownReason, reason);
    }
});

test('overall is renormalised over the assessed subset + flagged partial (C63 §4)', () => {
    const card = computeScorecard(BCN, { now: NOW });
    assert.equal(card.overall.partial, true);
    assert.deepEqual([...card.overall.assessedAxes].sort(), ['context', 'dataSources', 'terrain']);
    const { dataSources, terrain, context } = card.axes;
    const expected =
        (0.15 * (dataSources.score as number) + 0.1 * (terrain.score as number) + 0.05 * (context.score as number)) / 0.3;
    assert.ok(Math.abs((card.overall.score as number) - expected) < 1e-12);
    assert.equal(card.honestyOk, true);
    assert.equal(card.weightsVersion, CITY_COMPLETION_WEIGHTS_VERSION);
});

test('every axis carries a derivation + the generatedBy stamp (non-forgeable, C63 §1.1/§6)', () => {
    const card = computeScorecard(BCN, { now: NOW });
    for (const ax of Object.values(card.axes)) {
        assert.ok(ax.derivation.length > 0);
        assert.equal(ax.generatedBy, `scorecard@1.0 ${NOW}`);
    }
});

test('is DETERMINISTIC — same state + same stamp → identical scorecard (C63 §1.1)', () => {
    assert.deepEqual(computeScorecard(BCN, { now: NOW }), computeScorecard(BCN, { now: NOW }));
});

test('is HONEST for an uncovered city (Tokyo): cheap axes measure 0, honestyOk still true', () => {
    const jp = computeScorecard({ jurisdictionId: 'jp-13-tokyo', cc: 'jp', regionKey: 'tokyo' }, { now: NOW });
    assert.equal(CityCompletionScorecardSchema.safeParse(jp).success, true);
    assert.equal(jp.axes.dataSources.score, 0); // measured-none across wired slots, NOT not-assessed
    assert.equal(jp.axes.terrain.score, 0);
    assert.equal(jp.axes.context.score, 0);
    assert.equal(jp.honestyOk, true);
});

test('a documented height source scores lower than a live one (Oslo < Barcelona dataSources)', () => {
    const bcn = computeScorecard(BCN, { now: NOW });
    const oslo = computeScorecard({ jurisdictionId: 'no-0301-oslo', cc: 'no', regionKey: 'oslo' }, { now: NOW });
    assert.ok((oslo.axes.dataSources.score as number) < (bcn.axes.dataSources.score as number));
});

test('requires a jurisdictionId (C63 §1.7)', () => {
    assert.throws(() => computeScorecard({ cc: 'es', regionKey: 'barcelona' } as never), /jurisdictionId/);
});

test('computeParcelConfidence: without a sample → honest not-assessed (null + not-queried)', () => {
    const a = computeParcelConfidence([2.09, 41.32, 2.23, 41.47], { providerId: 'catastro', kind: 'cadastral' }, { now: NOW });
    assert.equal(a.score, null);
    assert.equal(a.unknownReason, 'not-queried');
    assert.equal(AxisScoreSchema.safeParse(a).success, true);
});

test('computeParcelConfidence: scores a sample {high:1, medium:.5, low:0} (C57 match)', () => {
    const viaCounts = computeParcelConfidence([0, 0, 1, 1], { providerId: 'catastro', kind: 'cadastral' }, { counts: { high: 3, medium: 1, low: 0 }, now: NOW });
    assert.ok(Math.abs((viaCounts.score as number) - 0.875) < 1e-12);
    assert.equal(AxisScoreSchema.safeParse(viaCounts).success, true);
    const viaSample = computeParcelConfidence([0, 0, 1, 1], { providerId: 'catastro', kind: 'cadastral' }, { sample: ['high', 'high', 'high', 'medium'], now: NOW });
    assert.ok(Math.abs((viaSample.score as number) - 0.875) < 1e-12);
});
