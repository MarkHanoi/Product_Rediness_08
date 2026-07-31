// DK gap G3 — the byggefelt PLACEMENT-EVIDENCE PRODUCER, tested against RECORDED REAL Plandata
// responses (`fixtures/byggefeltFixtures.ts`, fetched live 2026-07-31) rather than invented shapes.
//
// WHAT IS BEING PROVED — behaviours, not the implementation restated:
//   §STATE-MACHINE          the four real record classes classify to the four documented statuses.
//   §NULL-IS-NOT-FALSE      an unpublished flag is `metadata-unavailable`, never `not-declared`.
//   §WFS-BOOL-COERCION      the GML `'false'` STRING (which is truthy in JS) does not read as binding.
//   §DO-NOT-RECLASSIFY      an explicitly advisory field can never become a footprint.
//   §REFUSE-TO-INFER        a self-contradictory record resolves to NEITHER status and lands in QA.
//   §CRS-INTERLOCK          an unprojected ring is refused, not passed through as plausible metres.
//   §FAILURE-IS-NOT-ABSENCE a 500, a timeout, an abort and zero features are four different answers.
//   §TRUNCATION-IS-NOT-NONE "no binding on this page" is not "no binding in this bbox".
//   end-to-end              a real binding byggefelt drives G6 tier 1 to an explicit-area envelope.

import { describe, it, expect } from 'vitest';
import type { ParcelEdgeClassification, Pt } from '@pryzm/schemas';
import {
    classifyByggefeltLegalStatus,
    byggefeltFeatureToEvidence,
    byggefeltCollectionToEvidence,
    dkByggefeltFromEvidence,
    wfsBool,
    rankPlacementEvidence,
    collectEvidenceConflicts,
    strongestBindingEvidence,
    createByggefeltProducer,
    byggefeltResultToTierOne,
    resolveDkEnvelopePlacement,
    DK_BYGGEFELT_RING_REF,
    type Bbox25832,
    type DkByggefeltFeature,
    type PlacementEvidence,
} from '../src/index.js';
import {
    ADVISORY_FEATURE,
    BINDING_FEATURE,
    CONTRADICTORY_FEATURE,
    NOT_DECLARED_FEATURE,
} from './fixtures/byggefeltFixtures.js';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────────────────────

const BBOX: Bbox25832 = { minX: 531_000, minY: 6_224_000, maxX: 532_000, maxY: 6_225_000 };

/** A response body shaped exactly like GeoServer's `outputFormat=application/json`. */
function collection(features: DkByggefeltFeature[], numberMatched = features.length): unknown {
    return {
        type: 'FeatureCollection',
        features,
        totalFeatures: numberMatched,
        numberMatched,
        numberReturned: features.length,
    };
}

interface StubResponse {
    readonly status?: number;
    readonly body?: unknown;
    /** Throw instead of responding (a network error). */
    readonly throws?: string;
    readonly headers?: Record<string, string>;
}

/** A fetch stub that plays a scripted sequence and records the URLs it was called with. */
function stubFetch(sequence: StubResponse[]): {
    fetchImpl: typeof globalThis.fetch;
    calls: string[];
} {
    const calls: string[] = [];
    let i = 0;
    const fetchImpl = (async (url: unknown) => {
        calls.push(String(url));
        const step = sequence[Math.min(i, sequence.length - 1)];
        i += 1;
        if (step?.throws !== undefined) throw new Error(step.throws);
        const status = step?.status ?? 200;
        return {
            ok: status >= 200 && status < 300,
            status,
            headers: { get: (h: string) => step?.headers?.[h.toLowerCase()] ?? null },
            json: async () => step?.body ?? collection([]),
        };
    }) as unknown as typeof globalThis.fetch;
    return { fetchImpl, calls };
}

/** A producer with all waiting disabled, so tests exercise logic rather than timers. */
function producerWith(sequence: StubResponse[], overrides = {}) {
    const { fetchImpl, calls } = stubFetch(sequence);
    const producer = createByggefeltProducer({
        fetchImpl,
        minIntervalMs: 0,
        backoffBaseMs: 0,
        sleep: async () => undefined,
        jitter: () => 0.5,
        ...overrides,
    });
    return { producer, calls };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('§STATE-MACHINE — the four real record classes', () => {
    it('classifies the real BINDING record (Silkeborg LP 12-002) as binding via metadata', () => {
        const c = classifyByggefeltLegalStatus(BINDING_FEATURE.properties!);
        expect(c.legalStatus).toBe('binding');
        expect(c.unknownCause).toBeNull();
        expect(c.hasMetadataConflict).toBe(false);

        const [evidence] = byggefeltFeatureToEvidence(BINDING_FEATURE);
        expect(evidence!.legalStatus).toBe('binding');
        // Denmark is the first jurisdiction where the LEGAL STATUS comes from feature metadata.
        expect(evidence!.legalStatusSource).toBe('metadata');
        // The GEOMETRY source is independent of that, and is the authority's own GIS layer.
        expect(evidence!.geometrySource).toBe('official_gis');
        expect(evidence!.authority).toBe('plan');
    });

    it('classifies the real ADVISORY record as illustrative — from the SAME lokalplan', () => {
        const c = classifyByggefeltLegalStatus(ADVISORY_FEATURE.properties!);
        expect(c.legalStatus).toBe('illustrative');
        expect(c.unknownCause).toBeNull();
        // Both fixtures come from Silkeborg LP 12-002: bindingness is a per-FEATURE property, so it
        // can never be inferred from the plan a feature belongs to.
        expect(ADVISORY_FEATURE.properties!.lp_plannr).toBe(BINDING_FEATURE.properties!.lp_plannr);
    });

    it('classifies the real both-false record as unknown/not-declared (the plan-text target)', () => {
        const c = classifyByggefeltLegalStatus(NOT_DECLARED_FEATURE.properties!);
        expect(c.legalStatus).toBe('unknown');
        expect(c.unknownCause).toBe('not-declared');
        expect(c.hasMetadataConflict).toBe(false);
    });

    it('classifies the real both-true record as unknown/metadata-conflict, resolving NEITHER way', () => {
        const c = classifyByggefeltLegalStatus(CONTRADICTORY_FEATURE.properties!);
        expect(c.legalStatus).toBe('unknown');
        expect(c.unknownCause).toBe('metadata-conflict');
        expect(c.hasMetadataConflict).toBe(true);
        // The refusal is the behaviour: it did NOT silently become binding, and did NOT silently
        // become advisory. Either would be PRYZM resolving a contradiction it has no standing to.
        expect(c.legalStatus).not.toBe('binding');
        expect(c.legalStatus).not.toBe('illustrative');
    });

    it('gives an `unknown` evidence record NO legalStatusSource — there is no determination to cite', () => {
        for (const f of [NOT_DECLARED_FEATURE, CONTRADICTORY_FEATURE]) {
            const [e] = byggefeltFeatureToEvidence(f);
            expect(e!.legalStatus).toBe('unknown');
            expect(e!.legalStatusSource).toBeNull();
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('§NULL-IS-NOT-FALSE + §WFS-BOOL-COERCION', () => {
    it('treats a null flag as metadata-unavailable, NOT as a declaration of "not binding"', () => {
        const c = classifyByggefeltLegalStatus({ bygkunifelt: null, bygvejledende: false });
        expect(c.legalStatus).toBe('unknown');
        // The distinction that matters: this is RETRYABLE (a publication gap), whereas both-false is
        // a settled non-declaration that only the plan text can resolve. Same status, different fix.
        expect(c.unknownCause).toBe('metadata-unavailable');
        expect(c.unknownCause).not.toBe('not-declared');
    });

    it('treats an ABSENT flag the same as an explicit null', () => {
        expect(classifyByggefeltLegalStatus({}).unknownCause).toBe('metadata-unavailable');
        expect(classifyByggefeltLegalStatus({ bygkunifelt: true }).unknownCause).toBe(
            'metadata-unavailable',
        );
    });

    it('does NOT let the truthy string "false" read as binding (the GML encoding)', () => {
        // GeoServer emits real booleans on GeoJSON but 'true'/'false' STRINGS on GML. `'false'` is
        // truthy in JavaScript, so a naive read would classify an advisory field as binding — a
        // one-character path to over-stating a building envelope.
        expect(wfsBool('false')).toBe(false);
        expect(wfsBool('true')).toBe(true);
        const c = classifyByggefeltLegalStatus({ bygkunifelt: 'false', bygvejledende: 'true' });
        expect(c.legalStatus).toBe('illustrative');
    });

    it('classifies the string-encoded fixture identically to the boolean-encoded one', () => {
        const asStrings = {
            ...BINDING_FEATURE.properties!,
            bygkunifelt: 'true',
            bygvejledende: 'false',
        };
        expect(classifyByggefeltLegalStatus(asStrings).legalStatus).toBe(
            classifyByggefeltLegalStatus(BINDING_FEATURE.properties!).legalStatus,
        );
    });

    it('maps an UNRECOGNISED value to null (unknown), never to a guess', () => {
        expect(wfsBool('ja')).toBeNull();
        expect(wfsBool(2)).toBeNull();
        expect(classifyByggefeltLegalStatus({ bygkunifelt: 'ja', bygvejledende: 'nej' }).unknownCause).toBe(
            'metadata-unavailable',
        );
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('citation chain (G11) — built from the feature, never fabricated', () => {
    it('carries doklink as the citation URL for a real feature', () => {
        const [e] = byggefeltFeatureToEvidence(BINDING_FEATURE);
        expect(e!.citation?.url).toBe(BINDING_FEATURE.properties!.doklink);
        expect(e!.citation?.url).toMatch(/^https:\/\/dokument\.plandata\.dk\//);
        expect(e!.citation?.document).toContain('12-002');
        expect(e!.citation?.document).toContain('Silkeborg');
        expect(e!.featureId).toBe(String(BINDING_FEATURE.properties!.id));
        expect(e!.sourceLayer).toBe('theme_pdk_byggefelt_vedtaget');
    });

    it('omits the URL entirely when no doklink was published, rather than inventing one', () => {
        const [e] = byggefeltFeatureToEvidence({
            ...BINDING_FEATURE,
            properties: { ...BINDING_FEATURE.properties!, doklink: null },
        });
        expect(e!.citation?.url).toBeUndefined();
        expect(e!.citation?.document).toBeTruthy();
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('ranking + QA output', () => {
    const all = byggefeltCollectionToEvidence([
        ADVISORY_FEATURE,
        CONTRADICTORY_FEATURE,
        NOT_DECLARED_FEATURE,
        BINDING_FEATURE,
    ]);

    it('ranks binding first regardless of the order the WFS returned them in', () => {
        const ranked = rankPlacementEvidence(all);
        expect(ranked[0]!.legalStatus).toBe('binding');
        expect(ranked[1]!.legalStatus).toBe('illustrative');
        expect(ranked.slice(2).every((e) => e.legalStatus === 'unknown')).toBe(true);
    });

    it('ranks a self-contradictory record LAST — weaker than an honest silence', () => {
        const ranked = rankPlacementEvidence(all);
        const conflictIdx = ranked.findIndex((e) => e.unknownCause === 'metadata-conflict');
        const silentIdx = ranked.findIndex((e) => e.unknownCause === 'not-declared');
        expect(conflictIdx).toBeGreaterThan(silentIdx);
    });

    it('is deterministic — the same input always yields the same order', () => {
        const a = rankPlacementEvidence(all).map((e) => e.featureId);
        const b = rankPlacementEvidence([...all].reverse()).map((e) => e.featureId);
        expect(a).toEqual(b);
    });

    it('collects the contradictory record as a QA output WITHOUT dropping or resolving it', () => {
        const conflicts = collectEvidenceConflicts(all);
        expect(conflicts).toHaveLength(1);
        expect(conflicts[0]!.featureId).toBe(String(CONTRADICTORY_FEATURE.properties!.id));
        // Still present in the full list — a silent drop makes a data-quality problem invisible.
        expect(all.some((e) => e.featureId === conflicts[0]!.featureId)).toBe(true);
    });

    it('returns null from strongestBindingEvidence when nothing binds — never the best available', () => {
        const noBinding = byggefeltCollectionToEvidence([ADVISORY_FEATURE, NOT_DECLARED_FEATURE]);
        expect(strongestBindingEvidence(noBinding)).toBeNull();
        expect(strongestBindingEvidence(all)?.legalStatus).toBe('binding');
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('§DO-NOT-RECLASSIFY + §CRS-INTERLOCK — the tier-1 adapter refuses', () => {
    const project = (p: Pt): Pt => ({ x: p.x - 531_400, z: p.z - 6_224_400 });

    it('refuses an explicitly ADVISORY field as a footprint', () => {
        const [e] = byggefeltFeatureToEvidence(ADVISORY_FEATURE, { project });
        const r = dkByggefeltFromEvidence(e!);
        expect(r.ok).toBe(false);
        expect(r.ok === false && r.reason).toBe('not-binding');
    });

    it('refuses both unknown causes as footprints', () => {
        for (const f of [NOT_DECLARED_FEATURE, CONTRADICTORY_FEATURE]) {
            const [e] = byggefeltFeatureToEvidence(f, { project });
            expect(dkByggefeltFromEvidence(e!).ok).toBe(false);
        }
    });

    it('refuses a BINDING field whose ring is still in EPSG:25832 (the CRS interlock)', () => {
        // Both frames are metric and both magnitudes are plausible, so passing this through would
        // produce a plausible-looking building in the wrong place rather than a visible error.
        const [e] = byggefeltFeatureToEvidence(BINDING_FEATURE); // no projector
        expect(e!.geometry.crs).toBe('EPSG:25832');
        const r = dkByggefeltFromEvidence(e!);
        expect(r.ok).toBe(false);
        expect(r.ok === false && r.reason).toBe('unprojected-crs');
    });

    it('ACCEPTS a binding field once projected to scene-XZ', () => {
        const [e] = byggefeltFeatureToEvidence(BINDING_FEATURE, { project });
        expect(e!.geometry.crs).toBe('scene-xz');
        const r = dkByggefeltFromEvidence(e!);
        expect(r.ok).toBe(true);
        expect(r.ok === true && r.byggefelt.binding).toBe('binding');
        expect(r.ok === true && r.byggefelt.ring.length).toBeGreaterThanOrEqual(3);
    });

    it('refuses a binding field with a HOLE rather than over-state the buildable area', () => {
        // A hole is a published "do not build here". The single-ring explicit-area primitive cannot
        // carry it, so dropping it would inflate the footprint — the L-616 direction of error.
        const holed: DkByggefeltFeature = {
            ...BINDING_FEATURE,
            geometry: {
                type: 'Polygon',
                coordinates: [
                    [
                        [0, 0],
                        [100, 0],
                        [100, 100],
                        [0, 100],
                    ],
                    [
                        [40, 40],
                        [60, 40],
                        [60, 60],
                        [40, 60],
                    ],
                ],
            },
        };
        const [e] = byggefeltFeatureToEvidence(holed, { project: (p) => p });
        expect(e!.geometry.kind === 'polygon' && e!.geometry.holes).toHaveLength(1);
        const r = dkByggefeltFromEvidence(e!);
        expect(r.ok).toBe(false);
        expect(r.ok === false && r.reason).toBe('holes-unsupported');
    });

    it('refuses a MULTI-PART binding field rather than silently keep only part 0', () => {
        const twoPart: DkByggefeltFeature = {
            ...BINDING_FEATURE,
            geometry: {
                type: 'MultiPolygon',
                coordinates: [
                    [
                        [
                            [0, 0],
                            [10, 0],
                            [10, 10],
                            [0, 10],
                        ],
                    ],
                    [
                        [
                            [50, 50],
                            [60, 50],
                            [60, 60],
                            [50, 60],
                        ],
                    ],
                ],
            },
        };
        const parts = byggefeltFeatureToEvidence(twoPart, { project: (p) => p });
        // Both parts are VISIBLE as evidence — the loss would be invisible if we emitted only one.
        expect(parts).toHaveLength(2);
        expect(parts[0]!.partCount).toBe(2);
        for (const p of parts) {
            const r = dkByggefeltFromEvidence(p);
            expect(r.ok).toBe(false);
            expect(r.ok === false && r.reason).toBe('multi-part-unsupported');
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('§FAILURE-IS-NOT-ABSENCE — the producer keeps four answers apart', () => {
    it('returns ABSENT for a 200 with zero features (a durable coverage fact)', async () => {
        const { producer } = producerWith([{ status: 200, body: collection([]) }]);
        const r = await producer.fetchByBbox(BBOX);
        expect(r.outcome.status).toBe('absent');
        expect(r.featureCount).toBe(0);
    });

    it('returns TRANSIENT for a 500 — never absent', async () => {
        const { producer, calls } = producerWith([{ status: 500 }]);
        const r = await producer.fetchByBbox(BBOX);
        expect(r.outcome.status).toBe('transient');
        expect(r.outcome.status !== 'found' && r.outcome.reason).toContain('500');
        expect(calls.length).toBe(4); // 1 try + 3 retries
    });

    it('returns TRANSIENT for a network error', async () => {
        const { producer } = producerWith([{ throws: 'ECONNRESET' }]);
        const r = await producer.fetchByBbox(BBOX);
        expect(r.outcome.status).toBe('transient');
    });

    it('⚠ treats a 500 whose BODY parses as an empty collection as transient, not absent', async () => {
        // The status is checked BEFORE the body precisely so a proxy error page that happens to
        // deserialise into `{features:[]}` can never masquerade as "the plan published nothing here".
        const { producer } = producerWith([{ status: 500, body: collection([]) }]);
        const r = await producer.fetchByBbox(BBOX);
        expect(r.outcome.status).toBe('transient');
    });

    it('returns ABORTED (not transient) when the caller cancels', async () => {
        const controller = new AbortController();
        controller.abort();
        const { producer, calls } = producerWith([{ status: 200, body: collection([]) }]);
        const r = await producer.fetchByBbox(BBOX, { signal: controller.signal });
        expect(r.outcome.status).toBe('aborted');
        expect(calls).toHaveLength(0); // an already-aborted request is never sent
    });

    it('reports an invalid bbox as a caller error, not as "nothing here"', async () => {
        const { producer, calls } = producerWith([{ status: 200, body: collection([]) }]);
        const r = await producer.fetchByBbox({ minX: 10, minY: 10, maxX: 10, maxY: 10 });
        expect(r.outcome.status).toBe('transient');
        expect(calls).toHaveLength(0);
    });

    it('does NOT retry a 400 — a client error is our bug and retrying cannot fix it', async () => {
        const { producer, calls } = producerWith([{ status: 400 }]);
        const r = await producer.fetchByBbox(BBOX);
        expect(r.outcome.status).toBe('transient'); // still not `absent`
        expect(calls).toHaveLength(1);
    });

    it('recovers when a retry succeeds', async () => {
        const { producer, calls } = producerWith([
            { status: 503 },
            { status: 200, body: collection([BINDING_FEATURE]) },
        ]);
        const r = await producer.fetchByBbox(BBOX);
        expect(r.outcome.status).toBe('found');
        expect(calls).toHaveLength(2);
        expect(r.requests).toBe(2);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('polite-client behaviour', () => {
    it('caches a durable answer but NEVER caches a transient one', async () => {
        const absent = producerWith([{ status: 200, body: collection([]) }]);
        await absent.producer.fetchByBbox(BBOX);
        const second = await absent.producer.fetchByBbox(BBOX);
        expect(second.fromCache).toBe(true);
        expect(absent.calls).toHaveLength(1); // the second call made no request

        // A cached transient would turn one bad minute into a TTL-long fake "no byggefelt here".
        const failing = producerWith([{ status: 500 }]);
        await failing.producer.fetchByBbox(BBOX);
        const before = failing.calls.length;
        const retry = await failing.producer.fetchByBbox(BBOX);
        expect(retry.fromCache).toBe(false);
        expect(failing.calls.length).toBeGreaterThan(before);
    });

    it('expires a cache entry once the TTL passes', async () => {
        let clock = 1_000;
        const { producer, calls } = producerWith([{ status: 200, body: collection([]) }], {
            now: () => clock,
            cacheTtlMs: 5_000,
        });
        await producer.fetchByBbox(BBOX);
        clock += 6_000;
        await producer.fetchByBbox(BBOX);
        expect(calls).toHaveLength(2);
    });

    it('de-duplicates concurrent requests for the same bbox into ONE fetch', async () => {
        const { producer, calls } = producerWith([{ status: 200, body: collection([BINDING_FEATURE]) }]);
        const [a, b, c] = await Promise.all([
            producer.fetchByBbox(BBOX),
            producer.fetchByBbox(BBOX),
            producer.fetchByBbox(BBOX),
        ]);
        expect(calls).toHaveLength(1);
        expect([a.outcome.status, b.outcome.status, c.outcome.status]).toEqual([
            'found',
            'found',
            'found',
        ]);
    });

    it('honours a Retry-After header over its own backoff', async () => {
        const waits: number[] = [];
        const { producer } = producerWith([{ status: 429, headers: { 'retry-after': '2' } }], {
            sleep: async (ms: number) => {
                waits.push(ms);
            },
            backoffBaseMs: 400,
        });
        await producer.fetchByBbox(BBOX);
        expect(waits).toContain(2000);
    });

    it('sends an identifying User-Agent and asks Plandata for its native CRS', async () => {
        let seenHeaders: Record<string, string> = {};
        const fetchImpl = (async (url: unknown, init: { headers?: Record<string, string> }) => {
            seenHeaders = init?.headers ?? {};
            expect(String(url)).toContain('srsName=EPSG%3A25832');
            expect(String(url)).toContain('theme_pdk_byggefelt_vedtaget');
            expect(String(url)).toContain('BBOX');
            return {
                ok: true,
                status: 200,
                headers: { get: () => null },
                json: async () => collection([]),
            };
        }) as unknown as typeof globalThis.fetch;
        const producer = createByggefeltProducer({ fetchImpl, minIntervalMs: 0 });
        await producer.fetchByBbox(BBOX);
        expect(seenHeaders['User-Agent']).toContain('PRYZM');
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('the bridge into G6 tier 1', () => {
    const project = (p: Pt): Pt => ({ x: p.x - 531_400, z: p.z - 6_224_400 });

    it('yields a FOUND binding byggefelt from a real binding response', async () => {
        const { producer } = producerWith([{ status: 200, body: collection([BINDING_FEATURE]) }]);
        const bridged = byggefeltResultToTierOne(await producer.fetchByBbox(BBOX, { project }));
        expect(bridged.outcome.status).toBe('found');
        expect(bridged.outcome.status === 'found' && bridged.outcome.value.binding).toBe('binding');
    });

    it('yields ABSENT (durable) when byggefelter exist but none is binding', async () => {
        const { producer } = producerWith([
            { status: 200, body: collection([ADVISORY_FEATURE, NOT_DECLARED_FEATURE]) },
        ]);
        const bridged = byggefeltResultToTierOne(await producer.fetchByBbox(BBOX, { project }));
        // Durable, NOT transient: no amount of re-fetching makes an advisory field binding.
        expect(bridged.outcome.status).toBe('absent');
        expect(bridged.evidence).toHaveLength(2);
    });

    it('⚠ yields TRANSIENT, not absent, when the page was TRUNCATED and held no binding record', async () => {
        // "None of these is binding" describes the PAGE that was read, not the bbox — a binding
        // byggefelt could sit on page 2. Concluding absence from a partial read is how a fetch
        // limit becomes a fake coverage fact.
        const { producer } = producerWith([
            { status: 200, body: collection([ADVISORY_FEATURE], 4_000) },
        ]);
        const result = await producer.fetchByBbox(BBOX, { project });
        expect(result.truncated).toBe(true);
        const bridged = byggefeltResultToTierOne(result);
        expect(bridged.outcome.status).toBe('transient');
    });

    it('surfaces the contradictory record on the QA channel while refusing to place it', async () => {
        const { producer } = producerWith([
            { status: 200, body: collection([CONTRADICTORY_FEATURE, ADVISORY_FEATURE]) },
        ]);
        const bridged = byggefeltResultToTierOne(await producer.fetchByBbox(BBOX, { project }));
        expect(bridged.conflicts).toHaveLength(1);
        expect(bridged.outcome.status).toBe('absent');
    });

    it('reports an unadaptable BINDING field as a PRYZM limitation, not as missing data', async () => {
        const multiPart: DkByggefeltFeature = {
            ...BINDING_FEATURE,
            geometry: {
                type: 'MultiPolygon',
                coordinates: [
                    [
                        [
                            [531_400, 6_224_400],
                            [531_410, 6_224_400],
                            [531_410, 6_224_410],
                            [531_400, 6_224_410],
                        ],
                    ],
                    [
                        [
                            [531_450, 6_224_450],
                            [531_460, 6_224_450],
                            [531_460, 6_224_460],
                            [531_450, 6_224_460],
                        ],
                    ],
                ],
            },
        };
        const { producer } = producerWith([{ status: 200, body: collection([multiPart]) }]);
        const bridged = byggefeltResultToTierOne(await producer.fetchByBbox(BBOX, { project }));
        expect(bridged.unusableBinding.length).toBeGreaterThan(0);
        expect(bridged.outcome.status).toBe('absent');
        // The reason must NAME it as our gap, so a coverage metric cannot absorb it as "no data".
        expect(bridged.outcome.status === 'absent' && bridged.outcome.reason).toContain(
            'pryzm-limitation',
        );
    });

    it('passes a transient producer failure straight through, so tier 1 stays retryable', async () => {
        const { producer } = producerWith([{ status: 500 }]);
        const bridged = byggefeltResultToTierOne(await producer.fetchByBbox(BBOX, { project }));
        expect(bridged.outcome.status).toBe('transient');
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('END-TO-END — a real binding byggefelt drives G6 tier 1', () => {
    const project = (p: Pt): Pt => ({ x: p.x - 531_400, z: p.z - 6_224_400 });
    const parcel: Pt[] = [
        { x: 0, z: 0 },
        { x: 120, z: 0 },
        { x: 120, z: 120 },
        { x: 0, z: 120 },
    ];
    const edges: ParcelEdgeClassification[] = ['front', 'side', 'rear', 'side'];

    async function tierOneFor(features: DkByggefeltFeature[]) {
        const { producer } = producerWith([{ status: 200, body: collection(features) }]);
        const bridged = byggefeltResultToTierOne(await producer.fetchByBbox(BBOX, { project }));
        return {
            bridged,
            resolution: resolveDkEnvelopePlacement({
                parcelRing: parcel,
                parcelEdgeClassifications: edges,
                byggefelt: bridged.outcome,
            }),
        };
    }

    it('places the footprint at TIER 1 with byggefelt provenance — the gate is open', async () => {
        const { resolution } = await tierOneFor([BINDING_FEATURE]);
        expect(resolution.placed).toBe(true);
        expect(resolution.tier).toBe('byggefelt');
        expect(resolution.placement).toEqual({ source: 'byggefelt' });
        expect(resolution.openSpace).toEqual({ courtyard: true, source: 'byggefelt-hole' });
        expect(resolution.geometricRule).toEqual({
            kind: 'explicit-area',
            ringRef: DK_BYGGEFELT_RING_REF,
        });
        expect(resolution.explicitAreaSource?.footprintRing.length).toBeGreaterThanOrEqual(3);
        expect(resolution.refusalReason).toBeNull();
        // No provisional caveat: the strongest source answered, so the answer is cacheable.
        expect(resolution.higherAuthorityUnresolved).toBe(false);
    });

    it('carries the byggefelt identity through to the placement diagnostics', async () => {
        const { resolution } = await tierOneFor([BINDING_FEATURE]);
        const diag = resolution.diagnostics.find((d) => d.tier === 'byggefelt');
        expect(diag?.outcome).toBe('used');
        expect(diag?.detail).toContain(String(BINDING_FEATURE.properties!.id));
    });

    it('falls through to a REFUSAL — not a footprint — when only advisory fields exist', async () => {
        const { resolution } = await tierOneFor([ADVISORY_FEATURE]);
        expect(resolution.placed).toBe(false);
        expect(resolution.tier).toBeNull();
        // Durable, so the refusal is `no-usable-source` rather than the retryable variant.
        expect(resolution.refusalReason).toBe('no-usable-source');
        expect(resolution.higherAuthorityUnresolved).toBe(false);
    });

    it('marks the answer PROVISIONAL when the byggefelt fetch failed', async () => {
        const { producer } = producerWith([{ status: 500 }]);
        const bridged = byggefeltResultToTierOne(await producer.fetchByBbox(BBOX, { project }));
        const resolution = resolveDkEnvelopePlacement({
            parcelRing: parcel,
            parcelEdgeClassifications: edges,
            byggefelt: bridged.outcome,
        });
        expect(resolution.placed).toBe(false);
        // A failure and an absence produce DIFFERENT refusals — the whole point of the seam.
        expect(resolution.refusalReason).toBe('sources-unresolved');
        expect(resolution.higherAuthorityUnresolved).toBe(true);
    });

    it('picks the binding field out of a mixed real-world response', async () => {
        const { bridged, resolution } = await tierOneFor([
            ADVISORY_FEATURE,
            CONTRADICTORY_FEATURE,
            NOT_DECLARED_FEATURE,
            BINDING_FEATURE,
        ]);
        expect(resolution.tier).toBe('byggefelt');
        expect(bridged.evidence).toHaveLength(4);
        expect(bridged.conflicts).toHaveLength(1); // still surfaced, still unresolved
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('national distribution — the classifier reproduces the measured shares', () => {
    it('classifies a synthetic population in the documented proportions', () => {
        // Guards the STATE MACHINE against a future edit that quietly reclassifies a bucket. The
        // counts are the measured national figures (n = 57,035, 2026-07-31, resultType=hits).
        const population: { flags: [unknown, unknown]; n: number }[] = [
            { flags: [true, false], n: 13_629 },
            { flags: [false, true], n: 36_921 },
            { flags: [false, false], n: 6_101 },
            { flags: [true, true], n: 179 },
            { flags: [null, null], n: 205 },
        ];
        const tally = { binding: 0, illustrative: 0, unknown: 0 };
        const causes = { 'not-declared': 0, 'metadata-conflict': 0, 'metadata-unavailable': 0 };
        for (const { flags, n } of population) {
            const c = classifyByggefeltLegalStatus({ bygkunifelt: flags[0], bygvejledende: flags[1] });
            tally[c.legalStatus] += n;
            if (c.unknownCause !== null) causes[c.unknownCause] += n;
        }
        expect(tally.binding).toBe(13_629);
        expect(tally.illustrative).toBe(36_921);
        expect(tally.unknown).toBe(6_101 + 179 + 205);
        expect(causes['not-declared']).toBe(6_101);
        expect(causes['metadata-conflict']).toBe(179);
        expect(causes['metadata-unavailable']).toBe(205);
        // 23.9% of the national set is placeable at tier 1 — a FEATURE share, never a parcel share.
        expect(tally.binding / 57_035).toBeCloseTo(0.239, 3);
    });
});
