// §CTX-MANIFEST-KNOWN-MISSING (L-13111, lane STARTUP-FIX 2026-09-07) — read the tileset manifest
// ONCE per session, so the client stops probing archive headers for layers that are not published.
//
// ⭐ THE DEFECT, IN THE FOUNDER'S FIRST-LOAD CONSOLE. `canopy`, `sea` and `furniture` each 404 on the
// archive header. §CTX-RANGE-COALESCE re-issues the span's members individually before
// §CTX-KNOWN-MISSING can memoise the layer, so each absent layer costs roughly TWO requests before
// it costs zero — ~6 wasted round trips per session, on the hot path, queued behind Cesium's terrain
// stream and the seven layers that DO answer. Measured against production 2026-09-07:
//     /api/context-tiles/canopy.pmtiles?v=L663a     → 404 in 205 ms
//     /api/context-tiles/sea.pmtiles?v=L663a        → 404 in 356 ms
//     /api/context-tiles/furniture.pmtiles?v=L663a  → 404 in 436 ms
//
// `tileset-manifest.json` is published BESIDE the tiles by `tools/context-bake/merge-tiles.mjs`,
// carries `layers: { <name>: {…} }`, and §MANIFEST-LAYER-CARRY-FORWARD (every per-layer merge
// rewrites it with the UNION, never with only what it merged) is what makes *"not named ⇒ not live"*
// a true statement rather than an accident. Live reading 2026-09-07:
//     layers = [buildings, landuse, parks, rail, roads, trees, water]   (24,279 B, 196 ms)
// — exactly the seven that answer, and none of the three that 404.
//
// ⛔ WHY THIS MODULE DID NOT EXIST UNTIL TODAY, AND WHY IT DOES NOW. The cure has been recorded as
// sound since the artefact shipped; the CLIENT COULD NOT REACH IT. `VITE_CONTEXT_TILES_URL` is
// deployed as the same-origin proxy (contextTiles.ts §L-776), and that proxy's layer handler is an
// ALLOWLIST — so `tileset-manifest.json` resolved to a layer name nobody had allowlisted and came
// back as OUR 404 (measured: 404, **38 bytes**, `{"error":"unknown context tile layer"}`). Writing
// this module first would have shipped code that failed open on every load and changed nothing
// (§AUTHORED-BUT-UNWIRED — audit REACHABILITY, not existence). The server leg landed first
// (`server/context-delivery/contextTilesProxy.js` §CTX-MANIFEST-KNOWN-MISSING); this is the reader.
//
// ⛔⛔ THE HONEST VALUE IS UNTOUCHED — ONLY THE ROUND TRIP GOES. §CONTEXT-DATA-HONESTY: failure and
// empty are DIFFERENT VALUES, and a layer this module suppresses still answers `unavailable` with a
// reason that NAMES the manifest as its source. Nothing here converts an absence into an empty
// answer, and nothing here can make a layer render.
//
// ⛔ AND AN UNREADABLE MANIFEST MUST CHANGE NOTHING. Every failure mode below returns `unreadable`
// and seeds NOTHING, so the client probes exactly as it did before this file existed — a slow path,
// never a wrong answer. Two guards make that stricter than "did the fetch resolve":
//   · the document must IDENTIFY ITSELF (`schema: 'pryzm-context-tileset-manifest@…'`). A JSON error
//     body, an SPA fallback, or a future unrelated document at that path is `unreadable`, not an
//     assertion that every layer is missing.
//   · the layer set must be NON-EMPTY. A manifest naming zero layers would otherwise suppress the
//     entire context — the single worst thing this file could do — off one malformed publish.
//
// PURITY: no Cesium, no THREE, no DOM. It does not import `contextTiles`, deliberately: `contextTiles`
// imports THIS, and a cycle between them would be resolved at module load with one half undefined
// (memory `scc-no-barrel-access-at-module-load`). The base URL arrives as an argument.
//
// P8: the exported async function carries an OTel span.

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.gis.context-tileset-manifest');

/** The file the merge publishes beside the tiles. Shared with `server/context-delivery/`. */
export const TILESET_MANIFEST_FILE = 'tileset-manifest.json';

/** The `schema` value `merge-tiles.mjs` writes. A document that does not say this is not a manifest. */
export const TILESET_MANIFEST_SCHEMA_PREFIX = 'pryzm-context-tileset-manifest@';

/** How long one manifest read may take before it is abandoned as unreadable. */
export const TILESET_MANIFEST_TIMEOUT_MS = 8_000;

/**
 * What one manifest read established.
 *
 * ⚠ `ok` vs `unreadable` is the ONLY distinction callers may act on, and only `ok` may suppress a
 * probe. There is deliberately no third "empty" state: a manifest that parses but names no layers is
 * `unreadable`, because acting on it would suppress every layer in the tileset.
 */
export type TilesetManifestReading =
    | {
        readonly status: 'ok';
        /** The layer names the manifest lists, lower-cased. Never empty in this arm. */
        readonly layers: ReadonlySet<string>;
        readonly url: string;
        readonly ms: number;
    }
    | {
        readonly status: 'unreadable';
        /** Always empty — an unreadable manifest establishes NOTHING and must seed nothing. */
        readonly layers: ReadonlySet<string>;
        readonly url: string;
        readonly ms: number;
        /** Why. Carried so the console line can say which of the failure modes happened. */
        readonly reason: string;
    };

/** The manifest URL for a tiles base, or `null` when tiles are not configured. */
export function tilesetManifestUrl(base: string): string | null {
    const trimmed = base.trim();
    if (!trimmed) return null;
    return `${trimmed.endsWith('/') ? trimmed : `${trimmed}/`}${TILESET_MANIFEST_FILE}`;
}

/**
 * PURE — decide what a fetched body establishes. Exported so the two guards above can be pinned
 * without a network, which is the half a mocked `fetch` cannot prove on its own.
 */
export function readTilesetManifestBody(
    body: string, url: string, ms: number,
): TilesetManifestReading {
    const fail = (reason: string): TilesetManifestReading =>
        ({ status: 'unreadable', layers: new Set<string>(), url, ms, reason });

    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch (e) {
        return fail(`manifest did not parse as JSON (${(e as Error)?.message ?? e})`);
    }
    if (!parsed || typeof parsed !== 'object') return fail('manifest is not a JSON object');
    const doc = parsed as { schema?: unknown; layers?: unknown };

    // ⛔ IT MUST IDENTIFY ITSELF. Without this, any JSON document served at that path — an error
    // envelope, a future unrelated artefact — would be read as "these are the only live layers".
    if (typeof doc.schema !== 'string' || !doc.schema.startsWith(TILESET_MANIFEST_SCHEMA_PREFIX)) {
        return fail(`document does not declare ${TILESET_MANIFEST_SCHEMA_PREFIX}* (schema=${JSON.stringify(doc.schema)})`);
    }
    if (!doc.layers || typeof doc.layers !== 'object' || Array.isArray(doc.layers)) {
        return fail('manifest has no `layers` object');
    }
    const layers = new Set(Object.keys(doc.layers as Record<string, unknown>).map((k) => k.toLowerCase()));
    // ⛔ A MANIFEST NAMING ZERO LAYERS SUPPRESSES THE WHOLE CONTEXT. Refuse it as unreadable.
    if (layers.size === 0) return fail('manifest names ZERO layers — refusing to read it as "nothing is published"');

    return { status: 'ok', layers, url, ms };
}

/**
 * Read the tileset manifest at `url`. Never throws; every failure is an `unreadable` reading.
 *
 * `fetchImpl` is a test seam only — production passes nothing and uses `globalThis.fetch`.
 */
export async function readTilesetManifest(
    url: string,
    fetchImpl: typeof fetch = globalThis.fetch,
): Promise<TilesetManifestReading> {
    const span = _tracer.startSpan('pryzm.gis.context-tileset-manifest.read');
    const t0 = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TILESET_MANIFEST_TIMEOUT_MS);
    try {
        const res = await fetchImpl(url, { signal: ctrl.signal });
        if (!res.ok) {
            return {
                status: 'unreadable', layers: new Set<string>(), url, ms: Date.now() - t0,
                reason: `manifest HTTP ${res.status}`,
            };
        }
        return readTilesetManifestBody(await res.text(), url, Date.now() - t0);
    } catch (e) {
        return {
            status: 'unreadable', layers: new Set<string>(), url, ms: Date.now() - t0,
            reason: `manifest fetch failed (${(e as Error)?.message ?? e})`,
        };
    } finally {
        clearTimeout(timer);
        span.end();
    }
}
