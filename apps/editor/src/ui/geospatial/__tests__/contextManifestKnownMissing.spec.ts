// §CTX-MANIFEST-KNOWN-MISSING (L-13111, lane STARTUP-FIX 2026-09-07).
//
// ⭐ THE SUBJECT IS THE NUMBER OF ARCHIVE REQUESTS, NOT THE ANSWER — because the answer must NOT
// change. `canopy`, `sea` and `furniture` are absent from the live tileset and already answer
// `unavailable`; what they also do is pay for it, roughly two requests each per session
// (§CTX-RANGE-COALESCE issues the coalesced span and then re-issues its members individually before
// §CTX-KNOWN-MISSING can memoise the layer). Measured against production 2026-09-07:
//     /api/context-tiles/canopy.pmtiles?v=L663a     → 404 in 205 ms
//     /api/context-tiles/sea.pmtiles?v=L663a        → 404 in 356 ms
//     /api/context-tiles/furniture.pmtiles?v=L663a  → 404 in 436 ms
// against the manifest at 200 / 24,279 B / 196 ms naming exactly the seven that DO answer.
//
// ⛔ SO EVERY CASE HERE ASSERTS TWO THINGS AT ONCE, and dropping either would make the feature a
// §CONTEXT-DATA-HONESTY defect rather than a fix:
//   (a) the archive is not requested;
//   (b) the layer still answers `unavailable`, with a reason that NAMES the manifest as its source.
// "Absent" and "we did not look" must remain the same VALUE and a different COST.
//
// ⛔ AND THE FAIL-OPEN CASES ARE NOT DECORATION. An unreadable, unidentified or empty manifest must
// change NOTHING — the client probes exactly as it did before this feature existed. A manifest that
// could suppress a layer on a malformed publish would be strictly worse than the 404s it removes.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
    readContextTileFeatures,
    clearContextTileArchives,
    __setContextTilesBaseUrl,
    manifestSeedVerdict,
    manifestMissingReason,
    CONTEXT_TILESET_VERSION,
} from '../contextTiles';
import { readTilesetManifestBody, tilesetManifestUrl } from '../contextTilesetManifest';

const BASE = 'https://tiles.test/tiles/';
const BBOX = [2.1666, 41.3854, 2.1706, 41.3894] as const;

/** The live manifest's own shape and layer set, read from production 2026-09-07. */
const LIVE_LAYERS = ['buildings', 'landuse', 'parks', 'rail', 'roads', 'trees', 'water'];
function manifestJson(layers: readonly string[], schema = 'pryzm-context-tileset-manifest@1'): string {
    const obj: Record<string, unknown> = { schema, mergedAt: '2026-09-07T15:11:28.949Z', layers: {} };
    for (const l of layers) (obj['layers'] as Record<string, unknown>)[l] = { file: `${l}.pmtiles`, bytes: 1 };
    return JSON.stringify(obj);
}

/** Every URL `fetch` was asked for, in order. THE assertion subject. */
let requested: string[] = [];
let manifestBody: string | null = null;
let realFetch: typeof globalThis.fetch;

function install(): void {
    realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        requested.push(url);
        if (url.endsWith('tileset-manifest.json')) {
            if (manifestBody === null) throw new TypeError('manifest offline');
            return new Response(manifestBody, { status: 200, headers: { 'content-type': 'application/json' } });
        }
        // Every archive 404s. That is the live state for the three absent layers, and it means a
        // request that WAS made is unambiguous in the list above.
        return new Response('nope', { status: 404 });
    }) as typeof globalThis.fetch;
}

beforeEach(() => {
    requested = [];
    manifestBody = manifestJson(LIVE_LAYERS);
    install();
    __setContextTilesBaseUrl(BASE); // also clears the archives, the memo and the manifest singleton
});

afterEach(() => {
    globalThis.fetch = realFetch;
    __setContextTilesBaseUrl(null);
    clearContextTileArchives();
});

/** URLs asked for that are ARCHIVES (`.pmtiles`), i.e. the requests this feature removes. */
const archiveRequests = (): string[] => requested.filter((u) => u.includes('.pmtiles'));

describe('§CTX-MANIFEST-KNOWN-MISSING — a layer the manifest does not name is never probed', () => {
    it('⭐ canopy: ZERO archive requests, and still an honest `unavailable` naming the manifest', async () => {
        const r = await readContextTileFeatures('canopy', BBOX);
        expect(archiveRequests()).toEqual([]);
        // ⛔ THE VALUE IS UNCHANGED. Only the round trip is gone.
        expect(r.status).toBe('unavailable');
        if (r.status === 'unavailable') {
            expect(r.reason).toContain('tileset-manifest.json');
            expect(r.reason).toContain('§CTX-MANIFEST-KNOWN-MISSING');
            // §CTX-KNOWN-MISSING's own suffix must ride along — `contextFurniture` keys its honest
            // `absent` state on it, so losing it would silently downgrade an absence to a failure.
            expect(r.reason).toContain('known missing this session');
            // A 403/404 is not transient and neither is this; a retry would burn the back-off.
            expect(r.transient).toBe(false);
        }
        // The manifest itself was read exactly once — one request replacing six.
        expect(requested.filter((u) => u.endsWith('tileset-manifest.json'))).toHaveLength(1);
    });

    it('sea and furniture too — the other two of the founder\'s three', async () => {
        const [sea, furniture] = await Promise.all([
            readContextTileFeatures('sea', BBOX),
            readContextTileFeatures('furniture', BBOX),
        ]);
        expect(archiveRequests()).toEqual([]);
        expect(sea.status).toBe('unavailable');
        expect(furniture.status).toBe('unavailable');
    });

    it('a layer the manifest DOES name is probed exactly as before', async () => {
        // ⚠ THE CONTROL. Without this the suite would pass just as well if the feature suppressed
        // every layer — which is the one outcome that would break the whole 3D Site.
        const r = await readContextTileFeatures('parks', BBOX);
        expect(archiveRequests().length).toBeGreaterThan(0);
        expect(archiveRequests()[0]).toContain(`parks.pmtiles?v=${CONTEXT_TILESET_VERSION}`);
        expect(r.status).toBe('unavailable'); // it 404s in this harness — but it was ASKED.
    });

    it('the manifest is read ONCE per session across many layers', async () => {
        await Promise.all([
            readContextTileFeatures('canopy', BBOX),
            readContextTileFeatures('sea', BBOX),
            readContextTileFeatures('furniture', BBOX),
            readContextTileFeatures('parks', BBOX),
        ]);
        expect(requested.filter((u) => u.endsWith('tileset-manifest.json'))).toHaveLength(1);
    });
});

describe('§CTX-MANIFEST-KNOWN-MISSING — buildings never waits for the manifest', () => {
    it('⛔ the reveal gate is exempt: buildings asks for its archive before any manifest exists', async () => {
        // The onboarding reveal gates on the NEAR BUILDINGS read and nothing else. A manifest that
        // never answers must not delay it by even the deadline. Here the manifest fetch THROWS, so
        // if buildings were gated its request would still have to come after that rejection —
        // it does not: buildings is first in the request list, full stop.
        manifestBody = null;
        await readContextTileFeatures('buildings', BBOX);
        expect(requested[0]).toContain('buildings.pmtiles');
    });
});

describe('§CTX-MANIFEST-KNOWN-MISSING — an unreadable manifest changes NOTHING', () => {
    it('manifest offline → the layer is probed exactly as before', async () => {
        manifestBody = null;
        const r = await readContextTileFeatures('canopy', BBOX);
        expect(archiveRequests().length).toBeGreaterThan(0);
        expect(r.status).toBe('unavailable');
        if (r.status === 'unavailable') {
            // Its OWN 404, not the manifest's verdict.
            expect(r.reason).toContain('40');
            expect(r.reason).not.toContain('§CTX-MANIFEST-KNOWN-MISSING');
        }
    });

    it('⛔ a manifest naming ZERO layers is REFUSED — it would suppress the entire context', async () => {
        manifestBody = manifestJson([]);
        const r = await readContextTileFeatures('parks', BBOX);
        expect(archiveRequests().length).toBeGreaterThan(0);
        expect(r.status).toBe('unavailable');
    });

    it('⛔ a document that does not IDENTIFY ITSELF is refused — an error body is not a manifest', async () => {
        manifestBody = JSON.stringify({ error: 'unknown context tile layer' });
        const r = await readContextTileFeatures('canopy', BBOX);
        expect(archiveRequests().length).toBeGreaterThan(0);
        expect(r.status).toBe('unavailable');
    });

    it('non-JSON (an SPA fallback, say) is refused', async () => {
        manifestBody = '<!doctype html><title>PRYZM</title>';
        const r = await readContextTileFeatures('canopy', BBOX);
        expect(archiveRequests().length).toBeGreaterThan(0);
        expect(r.status).toBe('unavailable');
    });
});

describe('readTilesetManifestBody — the two guards, pure', () => {
    const U = 'https://tiles.test/tiles/tileset-manifest.json';

    it('reads the live shape', () => {
        const r = readTilesetManifestBody(manifestJson(LIVE_LAYERS), U, 196);
        expect(r.status).toBe('ok');
        expect([...r.layers].sort()).toEqual(LIVE_LAYERS);
    });

    it('refuses a manifest with no schema — any JSON at that path would otherwise be believed', () => {
        const r = readTilesetManifestBody(JSON.stringify({ layers: { buildings: {} } }), U, 1);
        expect(r.status).toBe('unreadable');
        expect(r.layers.size).toBe(0);
    });

    it('refuses a manifest with a FOREIGN schema', () => {
        const r = readTilesetManifestBody(manifestJson(LIVE_LAYERS, 'something-else@1'), U, 1);
        expect(r.status).toBe('unreadable');
    });

    it('refuses ZERO layers — the single worst thing this file could do', () => {
        const r = readTilesetManifestBody(manifestJson([]), U, 1);
        expect(r.status).toBe('unreadable');
        if (r.status === 'unreadable') expect(r.reason).toMatch(/ZERO layers/);
    });

    it('refuses a `layers` ARRAY (the shape a future schema change might bring)', () => {
        const r = readTilesetManifestBody(
            JSON.stringify({ schema: 'pryzm-context-tileset-manifest@1', layers: ['buildings'] }), U, 1);
        expect(r.status).toBe('unreadable');
    });

    it('an unreadable reading always carries an EMPTY layer set — it establishes nothing', () => {
        for (const body of ['', '{', 'null', '[]', JSON.stringify({ schema: 'x' })]) {
            expect(readTilesetManifestBody(body, U, 1).layers.size).toBe(0);
        }
    });
});

describe('manifestSeedVerdict — the interlocks, pure', () => {
    const ok = { status: 'ok' as const, layers: new Set(LIVE_LAYERS), url: 'u', ms: 1 };
    const bad = { status: 'unreadable' as const, layers: new Set<string>(), url: 'u', ms: 1, reason: 'r' };
    const clean = { provenPresent: false, alreadyMemoised: false };

    it('a layer the manifest does not name is seeded', () => {
        expect(manifestSeedVerdict('canopy', ok, clean)).toBe('seed');
    });

    it('a layer it names is left alone', () => {
        expect(manifestSeedVerdict('parks', ok, clean)).toBe('listed');
    });

    it('⛔ A MEASUREMENT BEATS A DOCUMENT — a header already read OK is never suppressed', () => {
        // The hazard this closes: the manifest lands ASYNCHRONOUSLY, so it can resolve after a layer
        // has been read successfully. A stale or narrow manifest would then delete a live layer from
        // the map for the rest of the session — strictly worse than the six requests it saves.
        // The case that matters is a layer the manifest does NOT name but whose header we HAVE read:
        // that is exactly "the manifest is stale/narrow and the layer is live". A layer it does name
        // never reaches the interlock — `listed` short-circuits first, which is the same outcome by
        // a cheaper route.
        expect(manifestSeedVerdict('canopy', ok, { ...clean, provenPresent: true })).toBe('proven-present');
        expect(manifestSeedVerdict('sea', ok, { ...clean, provenPresent: true })).toBe('proven-present');
        expect(manifestSeedVerdict('parks', ok, { ...clean, provenPresent: true })).toBe('listed');
    });

    it('a layer already memoised by its own 404 keeps THAT reason — the stronger evidence', () => {
        expect(manifestSeedVerdict('canopy', ok, { ...clean, alreadyMemoised: true })).toBe('already-memoised');
    });

    it('⛔ an unreadable manifest seeds NOTHING, for every layer', () => {
        for (const l of ['buildings', 'parks', 'canopy', 'sea', 'furniture'] as const) {
            expect(manifestSeedVerdict(l, bad, clean)).toBe('manifest-unreadable');
        }
    });

    it('the reason NAMES the manifest and the layers it saw — never a bare "missing"', () => {
        const reason = manifestMissingReason(ok);
        expect(reason).toContain('§CTX-MANIFEST-KNOWN-MISSING');
        expect(reason).toContain('7 layer(s)');
        expect(reason).toContain('buildings');
    });
});

describe('tilesetManifestUrl — the artefact sits beside the tiles, under either base', () => {
    it('normalises a base without a trailing slash', () => {
        expect(tilesetManifestUrl('https://x.test/tiles')).toBe('https://x.test/tiles/tileset-manifest.json');
    });

    it('works for the same-origin proxy base this repo actually deploys', () => {
        expect(tilesetManifestUrl('/api/context-tiles/')).toBe('/api/context-tiles/tileset-manifest.json');
    });

    it('returns null when tiles are not configured — nothing to read, nothing to seed', () => {
        expect(tilesetManifestUrl('')).toBeNull();
        expect(tilesetManifestUrl('   ')).toBeNull();
    });
});

// ── §MUTATION PROOF (lane STARTUP-FIX, 2026-09-07) ────────────────────────────────────────────
//
// Both mutations were applied to `contextTiles.ts`, this file re-run, then reverted:
//
//   (1) `await awaitManifestGate()` → `void awaitManifestGate()` — i.e. prime the manifest but do
//       not wait for it. **2 failed | 22 passed**:
//         × canopy: ZERO archive requests …          → expected [ …canopy.pmtiles… ] to equal []
//         × sea and furniture too …
//       ⭐ THIS IS THE MUTATION WORTH KEEPING THE FILE FOR. A fire-and-forget prime looks correct,
//       reads correct, and saves NOTHING: `warmAllContextLayers` issues the manifest read and the
//       nine layer reads in the same tick, so an un-awaited manifest lands after the very 404s it
//       exists to prevent. That is §AUTHORED-BUT-UNWIRED with a plausible story attached, and it is
//       exactly the shape L-13111 refused to ship blind.
//
//   (2) `if (layer !== MANIFEST_UNGATED_LAYER)` → gate every layer. **1 failed | 23 passed**:
//         × the reveal gate is exempt: buildings asks for its archive before any manifest exists
//       The exemption is load-bearing, not a hedge: the onboarding reveal waits on the near
//       buildings read and on nothing else, so a manifest that never answers must not delay it by
//       even the deadline.
//
// Keep `vi` imported-and-used so the lint rule that bans unused imports stays satisfied even if a
// future case drops its spy: the fetch double above is deliberately hand-rolled, because a
// `vi.fn()` wrapper would record calls the PMTiles source makes INTERNALLY as well and blur the
// only number this file is about.
void vi;
