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
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    CityCompletionScorecardSchema,
    AxisScoreSchema,
    CITY_COMPLETION_WEIGHTS,
    CITY_COMPLETION_WEIGHTS_VERSION,
} from '../../packages/schemas/src/site/completion/CityCompletionScorecard.js';
import {
    ENVELOPE_AXIS_TIER_WEIGHT,
    ENVELOPE_AXIS_TIER_WEIGHT_VERSION,
    ENVELOPE_COVERAGE_TIERS,
} from '../../packages/schemas/src/site/completion/EnvelopeAxisWeight.js';
import {
    computeScorecard,
    computeParcelConfidence,
    CITY_COMPLETION_WEIGHTS as TOOL_WEIGHTS,
    CITY_COMPLETION_WEIGHTS_VERSION as TOOL_WEIGHTS_VERSION,
    parseServerZoningMounts,
    parseBakeRegions,
    parseBakeLayers,
    zoneGisSlot,
    wilson95,
    ENVELOPE_AXIS_TIER_WEIGHT as TOOL_ENVELOPE_WEIGHTS,
    ENVELOPE_AXIS_TIER_WEIGHT_VERSION as TOOL_ENVELOPE_WEIGHTS_VERSION,
    // ⚠ READ the version, never restate it. A hard-coded `scorecard@1.1` below meant bumping the
    // tool's own version stamp broke a test that has nothing to do with versioning (L-677).
    SCORECARD_VERSION,
} from './computeScorecard.mjs';

const NOW = '2026-07-30T00:00:00.000Z';
const BCN = { jurisdictionId: 'es-ct-08019-barcelona', cc: 'es', regionKey: 'barcelona', slug: 'barcelona' };

test('the tool mirrors the schema weights + version EXACTLY (no drift)', () => {
    assert.deepEqual(TOOL_WEIGHTS, CITY_COMPLETION_WEIGHTS);
    assert.equal(TOOL_WEIGHTS_VERSION, CITY_COMPLETION_WEIGHTS_VERSION);
});

// ── L-664 §ENVELOPE-CONFIDENCE-LADDER ──────────────────────────────────────────────────────────
test('L-664: the tool mirrors the L0 ENVELOPE tier-weight map EXACTLY, and is TOTAL over it', () => {
    assert.deepEqual(TOOL_ENVELOPE_WEIGHTS, ENVELOPE_AXIS_TIER_WEIGHT);
    assert.equal(TOOL_ENVELOPE_WEIGHTS_VERSION, ENVELOPE_AXIS_TIER_WEIGHT_VERSION);
    // Exhaustive: every tier the SCHEMA can produce has a weight in the TOOL. No default branch.
    for (const tier of ENVELOPE_COVERAGE_TIERS) {
        assert.equal(typeof TOOL_ENVELOPE_WEIGHTS[tier], 'number', `tier ${tier} unmapped in the tool`);
    }
    assert.equal(
        Object.keys(TOOL_ENVELOPE_WEIGHTS).length,
        ENVELOPE_COVERAGE_TIERS.length,
        'the tool maps a tier the schema does not declare',
    );
});

test('L-664: ENVELOPE stays not-assessed WITHOUT a coverage breakdown — the ladder is not a measurement', () => {
    const card = computeScorecard(BCN, { now: NOW });
    assert.equal(card.axes.envelope.score, null);
    assert.equal(card.axes.envelope.unknownReason, 'pending-implementation');
    assert.match(card.axes.envelope.derivation, /ladder exists .*but the MEASUREMENT does not/);
});

test('L-664: ENVELOPE IS scoreable once a coverage breakdown is supplied (the axis is no longer blocked)', () => {
    const card = computeScorecard({
        ...BCN,
        envelopeCoverage: [
            { zoneCode: '13a', tier: 'block-constructed', buildableLandShare: 0.5 }, // 0.5 × 0.7
            { zoneCode: '18', tier: 'not-determined', buildableLandShare: 0.3 },     // cited refusal → 0
            { zoneCode: '22a', tier: 'no-pack', buildableLandShare: 0.2 },           // coverage gap → 0
        ],
    }, { now: NOW });
    assert.ok(Math.abs((card.axes.envelope.score as number) - 0.35) < 1e-12);
    assert.equal(card.axes.envelope.unknownReason, undefined);
    assert.equal(CityCompletionScorecardSchema.safeParse(card).success, true);
    // …and it now joins the assessed subset, so `overall` is renormalised over FOUR axes, not three.
    assert.ok(card.overall.assessedAxes.includes('envelope'));
});

test('L-664: an unmapped tier THROWS — it is never silently scored (no default branch)', () => {
    assert.throws(
        () => computeScorecard({ ...BCN, envelopeCoverage: [{ zoneCode: 'x', tier: 'certified', buildableLandShare: 1 }] }),
        /unmapped EnvelopeConfidence tier/,
    );
});

test('L-664: ENVELOPE renormalises over MEASURED buildable land — unmeasured is excluded, not zero-filled', () => {
    const card = computeScorecard({
        ...BCN,
        envelopeCoverage: [{ zoneCode: '13a', tier: 'block-constructed', buildableLandShare: 0.5 }],
    }, { now: NOW });
    // 0.7 over half the city — NOT 0.35 (which would score the unmeasured half as a measured zero).
    assert.ok(Math.abs((card.axes.envelope.score as number) - 0.7) < 1e-12);
    assert.match(card.axes.envelope.derivation, /PARTIAL: unmeasured buildable land is excluded/);
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

test('leaves PARCEL/LEGISLATION/ENVELOPE/HEIGHTS honestly not-assessed when unmeasured (null + typed reason, never 0)', () => {
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
        assert.equal(ax.generatedBy, `scorecard@${SCORECARD_VERSION} ${NOW}`);
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

// ─────────────────────────────────────────────────────────────────────────────
// L-658 — the PARCEL axis is now MEASURABLE, and the DATA-SOURCES zone-GIS slot is DERIVED.
// These assertions exist to hold the two honesty rules the measurement can most easily break:
//   • a MEASURED ABSENCE ("no parcel here") scores 0 and STAYS IN the denominator;
//   • a TRANSPORT FAILURE is EXCLUDED from the denominator and can never produce a low score.
// ─────────────────────────────────────────────────────────────────────────────

test('zone-GIS slot is derived from server.js MOUNTS, not from a module merely existing', () => {
    const mounts = parseServerZoningMounts(
        'app.get(MUC_ZONING_PATH, apiLimiter, mucZoningHandler);\napp.get(PARIS_PLU_PATH, x, y);',
    );
    assert.ok(mounts.has('MUC_ZONING_PATH'));
    assert.equal(zoneGisSlot('barcelona', mounts).state, 'live');
    // declared but NOT mounted ⇒ `documented` (the L-651 "built but unwired" failure class)
    assert.equal(zoneGisSlot('madrid', mounts).state, 'documented');
    // declared with mountConst:null ⇒ `documented` — the source EXISTS but nothing is wired.
    // `documented` and `none` must not collapse (the failure-vs-absence rule, one level down).
    assert.equal(zoneGisSlot('oslo', mounts).state, 'documented');
    // never declared at all ⇒ a MEASURED absence
    assert.equal(zoneGisSlot('tokyo', mounts).state, 'none');
});

test('against the REAL server.js: Barcelona zone-GIS reads live, Oslo documented, Tokyo none', () => {
    const bcn = computeScorecard(BCN, { now: NOW });
    assert.match(bcn.axes.dataSources.derivation, /regional-zone-GIS=live/);
    const oslo = computeScorecard({ jurisdictionId: 'no-0301-oslo', cc: 'no', regionKey: 'oslo' }, { now: NOW });
    assert.match(oslo.axes.dataSources.derivation, /regional-zone-GIS=documented/);
    const tokyo = computeScorecard({ jurisdictionId: 'jp-13-tokyo', cc: 'jp', regionKey: 'tokyo' }, { now: NOW });
    assert.match(tokyo.axes.dataSources.derivation, /regional-zone-GIS=none/);
});

test('a MEASURED ABSENCE (no parcel here) scores 0 and STAYS IN the denominator', () => {
    const a = computeParcelConfidence([0, 0, 1, 1], { providerId: 'catastro', kind: 'cadastral' },
        { counts: { high: 3, medium: 0, low: 0, none: 1 }, denominator: 'test', now: NOW });
    assert.ok(Math.abs((a.score as number) - 0.75) < 1e-12, 'a measured `none` must divide, not vanish');
    assert.match(a.derivation, /none=1/);
});

test('TRANSPORT FAILURES are excluded from the denominator — never a low score (§CONTEXT-DATA-HONESTY)', () => {
    // 3 high + 40 timeouts reads 100 %, not 3/43: a failed probe is a claim about OUR NETWORK.
    const partial = computeParcelConfidence([0, 0, 1, 1], { providerId: 'geonorge-no', kind: 'cadastral' },
        { counts: { high: 3, medium: 0, low: 0, none: 0 }, failures: { timeout: 40 }, denominator: 'test', now: NOW });
    assert.equal(partial.score, 1);
    assert.match(partial.derivation, /EXCLUDED as transport failures/);

    // …and an ALL-failed probe is not-assessed, NEVER 0.
    const dead = computeParcelConfidence([0, 0, 1, 1], { providerId: 'geonorge-no', kind: 'cadastral' },
        { counts: { high: 0, medium: 0, low: 0, none: 0 }, failures: { 'http-error': 8 }, denominator: 'test', now: NOW });
    assert.equal(dead.score, null);
    assert.notEqual(dead.score, 0);
    assert.equal(dead.unknownReason, 'not-queried');
    assert.match(dead.derivation, /EVERY ONE failed in transport/);
    assert.equal(AxisScoreSchema.safeParse(dead).success, true);
});

test('every scored PARCEL axis NAMES its denominator (L-656 — a % without one is not a number)', () => {
    const a = computeParcelConfidence([0, 0, 1, 1], { providerId: 'catastro', kind: 'cadastral' },
        { counts: { high: 1 }, denominator: 'private buildable land (OSM footprint proxy)', measuredAt: NOW, now: NOW });
    assert.match(a.derivation, /DENOMINATOR: private buildable land/);
    assert.match(a.derivation, /measured 2026-07-30/);
    // omitting it is LOUD, not silent
    const b = computeParcelConfidence([0, 0, 1, 1], { providerId: 'catastro', kind: 'cadastral' }, { counts: { high: 1 }, now: NOW });
    assert.match(b.derivation, /UNSTATED DENOMINATOR/);
});

test('a parcelSample lifts PARCEL into the assessed set and grows the assessed weight', () => {
    const sample = {
        providerId: 'catastro', kind: 'cadastral', bbox: [2.09, 41.32, 2.23, 41.47],
        measuredAt: NOW,
        frame: { denominator: 'OSM non-public building-footprint area (buildable-land proxy)' },
        buildable: { counts: { high: 118, medium: 2, low: 0, none: 0 }, failures: {} },
        allclicks: { counts: { high: 39, medium: 11, low: 0, none: 10 }, failures: {} },
    };
    const card = computeScorecard({ ...BCN, parcelSample: sample }, { now: NOW });
    assert.equal(CityCompletionScorecardSchema.safeParse(card).success, true);
    assert.ok(card.overall.assessedAxes.includes('parcel'));
    assert.ok(Math.abs((card.axes.parcel.score as number) - 119 / 120) < 1e-12);
    // 15 (parcel) + 15 (data-sources) + 10 (terrain) + 5 (context) = 45 % of the ratified weight
    const w = card.overall.assessedAxes.reduce((s, a) => s + CITY_COMPLETION_WEIGHTS[a], 0);
    assert.ok(Math.abs(w - 0.45) < 1e-12);
    // the `allclicks` frame must NOT leak into the axis score (three numbers, never conflated)
    assert.doesNotMatch(card.axes.parcel.derivation, /allclicks/);
});

test('wilson95 brackets the point estimate and never leaves [0,1]', () => {
    const ci = wilson95(119, 120)!;
    assert.ok(ci.lo > 0.9 && ci.lo < 119 / 120);
    assert.ok(ci.hi <= 1);
    assert.equal(wilson95(0, 0), null);
});

// ── §EMPTY-PARSE-IS-NOT-AN-ABSENCE (L-676) ─────────────────────────────────────────────────────
// REGRESSION. `parseBakeRegions` looked only for `const REGIONS = [`. bake.mjs §BAKE-BY-REGION
// renamed that array to `ALL_REGIONS` and rebound `REGIONS` to a `--region`-filtered IIFE, so the
// marker stopped matching and the reader returned an EMPTY SET — silently, for EVERY city. The
// scorecard then published a parser miss as a fact about the world: `context-OSM-extract=none` and
// "not a baked context region → 0 layers present (measured)". València read CONTEXT 0 % and
// DATA-SOURCES 60 % while sitting inside the national `spain` bake — whose SHIPPED tiles a height
// probe read 5 466 València building footprints out of on the very same day.
test('L-676: parseBakeRegions reads the CURRENT bake.mjs declaration (ALL_REGIONS) and finds spain', () => {
    const text = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../context-bake/bake.mjs'), 'utf8');
    const regions = parseBakeRegions(text);
    assert.ok(regions.size > 0, 'empty region set — the reader has drifted from bake.mjs again');
    assert.ok(regions.has('spain'), 'the national `spain` bake row must be visible to the scorecard');
});

test('L-676: an unparseable declaration FAILS LOUD rather than reporting a world with no bakes', () => {
    // The whole point: "no match" is a bug in THIS READER, never a measured absence.
    assert.throws(
        () => parseBakeRegions('const SOMETHING_ELSE = [\n  { nombre: 4 },\n];'),
        /EMPTY-PARSE-IS-NOT-AN-ABSENCE/,
    );
    assert.throws(
        () => parseBakeLayers('const NOT_LAYERS = [\n];'),
        /EMPTY-PARSE-IS-NOT-AN-ABSENCE/,
    );
});

test("L-676: València's zone-GIS is `documented`, not `none` — the service is live and keyless", () => {
    // Absence from ZONE_GIS_SOURCES scores `none`, which asserts "no source exists". València HAS
    // one (21 210 polygons, unauthenticated, re-probed 2026-08-01); what it lacks is a PRYZM proxy.
    // `documented` is exactly that distinction, and collapsing it to `none` under-stated the city.
    const slot = zoneGisSlot('valencia', new Set());
    assert.equal(slot.state, 'documented');
    assert.match(slot.note, /geoportal\.valencia\.es/);
});

// ─────────────────────────────────────────────────────────────────────────────
// L-677 — the COMMITTED per-city measurement records (L-662 §PER-CITY-MEASUREMENTS).
//
// They are EVIDENCE, so they are guarded like evidence. Murcia's and València's are the two
// exemplars; these assertions are written against the SHAPE all three share, so the guard extends to
// the next city by adding one entry to CITY_RECORDS.
//
// What they pin, and why each is load-bearing:
//   • the ENVELOPE shares must lie in (0,1] — a breakdown that quietly sums past 1 double-counts land,
//     and a zero-share slice asserts a tier over nothing;
//   • every tier must be one the L0 schema DECLARES — `axisEnvelope` THROWS on an unmapped tier, and
//     this catches it in the record rather than at the CLI;
//   • the heights block must carry per-building COUNTS that reconcile (§SIZE-IS-NOT-PROVENANCE,
//     L-658: a green bake, a present tileset and a large file are not evidence of one measured height).
// ─────────────────────────────────────────────────────────────────────────────
const MEASUREMENTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'measurements');
const CITY_RECORDS = ['barcelona', 'valencia', 'murcia'] as const;

for (const city of CITY_RECORDS) {
    test(`L-677: ${city}.measurements.json — ENVELOPE shares are a partition and every tier is one the schema declares`, () => {
        const m = JSON.parse(readFileSync(resolve(MEASUREMENTS_DIR, `${city}.measurements.json`), 'utf8'));
        if (m.envelope?.status !== 'measured') return; // an unmeasured axis is a valid, honest record
        const slices: { zoneCode: string; tier: string; buildableLandShare: number }[] = m.envelope.coverage;
        for (const s of slices) {
            assert.ok(
                (ENVELOPE_COVERAGE_TIERS as readonly string[]).includes(s.tier),
                `${city}: tier '${s.tier}' is not an EnvelopeCoverageTier — the tool would throw on it`,
            );
            assert.ok(s.buildableLandShare > 0, `${city}/${s.zoneCode}: a zero-share slice says nothing`);
        }
        const sum = slices.reduce((s, x) => s + x.buildableLandShare, 0);
        assert.ok(sum > 0 && sum <= 1 + 1e-9, `${city}: shares must lie in (0,1], got ${sum}`);
    });
}

test('L-677: barcelona.measurements.json scores ALL SEVEN axes — the first complete C63 card', () => {
    const m = JSON.parse(readFileSync(resolve(MEASUREMENTS_DIR, 'barcelona.measurements.json'), 'utf8'));
    const card = computeScorecard({
        ...BCN,
        legislationAudit: m.legislation,
        envelopeCoverage: m.envelope.coverage,
        heightsSample: m.heightsLod,
        parcelSample: JSON.parse(
            readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'samples/barcelona.parcel-sample.json'), 'utf8'),
        ),
    }, { now: NOW });

    assert.equal(CityCompletionScorecardSchema.safeParse(card).success, true);
    assert.equal(card.honestyOk, true);
    assert.equal(card.overall.partial, false, 'no axis may be left not-assessed');
    const w = card.overall.assessedAxes.reduce((s, a) => s + CITY_COMPLETION_WEIGHTS[a], 0);
    assert.ok(Math.abs(w - 1) < 1e-9, 'weightAssessed must be the whole ratified vector');

    // Barcelona's slices are EXHAUSTIVE (a live per-clau area census), so nothing renormalises out.
    assert.doesNotMatch(card.axes.envelope.derivation, /PARTIAL: unmeasured buildable land/);

    // The LEGISLATION numerator can never exceed its denominator — `cited/authored` would report
    // ~100 % for one clau out of forty (the "Barcelona-borrow" trap C63 §3 Axis 2 names, caught here
    // in the city it is named after).
    assert.ok(m.legislation.citedVerifiedClaus <= m.legislation.totalClausPresent);

    // §SIZE-IS-NOT-PROVENANCE — counts, and they must reconcile.
    assert.equal(m.heightsLod.total, m.heightsLod.tagged + m.heightsLod.derivedLevels + m.heightsLod.assumed);
    // Pinned as a PRE-BAKE baseline: editing these counts to predict the in-flight re-bake means
    // removing the label first, and removing it is a visible act in review.
    assert.match(m.heightsLod.note.join(' '), /PRE-BAKE BASELINE/i);
});
