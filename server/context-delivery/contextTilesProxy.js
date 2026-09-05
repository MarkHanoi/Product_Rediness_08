// §CTX-TILES-PROXY (L-578) — serve the baked context PMTiles from OUR origin, forwarding
// HTTP byte ranges to the object store.
//
// WHY THIS EXISTS, AND WHY IT IS NOT A RETREAT FROM L-513b
// -------------------------------------------------------
// L-513b moved the 3D-Site context off the live public Overpass API and onto static PMTiles in
// Cloudflare R2. The client reads them directly. That is still the intended path — it is the
// fastest, and it keeps our server out of the loop entirely.
//
// It could not work in a browser, for a reason no green signal could show us: THE BUCKET SENDS NO
// CORS HEADERS. `curl`, `aws s3 ls`, the upload probe and every Node probe saw a clean 200/206,
// because none of them enforce CORS — only a browser does. Setting the bucket's CORS policy is the
// correct fix, but it requires bucket-ADMIN credentials (the repo's R2 token is object-scoped:
// `PutBucketCors` → `AccessDenied`), i.e. it is gated on a human with dashboard access.
//
// ⚠ CORS IS A BROWSER POLICY — IT DOES NOT APPLY SERVER-TO-SERVER. So this route reaches the same
// bytes with no policy in the way, and being same-origin it needs no CORS of its own. It is the
// mechanism the Overpass proxy already uses for the same class of reason
// (`server/overpassProxy.js`, §OVERPASS-PROXY).
//
// ⚠ IT IS A FALLBACK, NOT A REPLACEMENT — AND IT UNWIRES ITSELF. The client prefers a configured
// `VITE_CONTEXT_TILES_URL` (direct R2) and only falls back to this path when none is set. So the
// moment the bucket's CORS policy lands and the variable points at R2, traffic returns to the
// direct route with no code change. This is deliberately not a permanent architecture: proxying
// puts our Fly instance on the context hot path, which is precisely the coupling L-513b removed.
//
// WHAT MAKES THIS SAFE TO PROXY AT ALL — and why it is nothing like proxying Overpass:
//   • The upstream is STATIC OBJECT STORAGE, not a query planner. There is no cost model to trip,
//     no rate limit to exhaust, no `remark`-in-a-200 failure mode (§CONTEXT-DATA-HONESTY).
//   • Each request is a small byte RANGE (a tile), not a whole 19 MB archive — provided we forward
//     the `Range` header and return 206. A proxy that dropped `Range` would silently turn every
//     tile read into a full-file download; that is asserted against in `r2-cors.yml` and is the
//     single most important line in this file.
//   • The response is immutable for a given bake, so it is aggressively cacheable.

/** The route prefix. Mirrors the R2 layout: `<prefix>/<layer>.pmtiles`. */
export const CONTEXT_TILES_PATH = '/api/context-tiles';

/**
 * The upstream base. Same default as `server/securityHeaders.js` and the deploy workflow, so the
 * three cannot drift. Overridable for a custom domain (assets.pryzm.app) without a code change.
 */
export const CONTEXT_TILES_UPSTREAM =
    process.env.CONTEXT_TILES_UPSTREAM
    || process.env.VITE_CONTEXT_TILES_URL
    || 'https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev/tiles/';

/**
 * ⚠ ALLOWLIST, NOT PASS-THROUGH. The file name comes from the URL, so without this the route is an
 * open proxy: any path traversal or arbitrary key under the bucket would be fetchable through our
 * origin, wearing our CORS and our reputation. Only the four baked layers are reachable.
 */
// ⚠ THIS LIST MUST MATCH `ContextTileLayer` IN `apps/editor/src/ui/geospatial/contextTiles.ts`.
// It had DRIFTED: the client grew `rail` (§CTX-PMTILES-READER rail) and `trees`
// (§FORMA-CTX-TREES, L-642 Phase C) and this allowlist was never extended, so every request for
// them was refused BY US with `404 unknown context tile layer` — indistinguishable, from the
// client's side, from "the tileset does not exist upstream". Adding them here makes the proxy
// report the UPSTREAM's answer instead of substituting its own.
//
// ⚠ AND THE UPSTREAM'S ANSWER IS ALSO 404 TODAY — probed 2026-08-06 against R2 directly:
// `rail.pmtiles` and `trees.pmtiles` return 404 in ~163–245 ms, i.e. THOSE TWO LAYERS HAVE NEVER
// BEEN BAKED. So this change does not make rail or trees render; it makes the failure attributable.
// The client already handles it correctly and cheaply — `readContextTileFeatures` returns
// `unavailable`, the console says "tiles configured but unreadable … rendering NO rail", and there
// is NO retry and no timeout, so the two 404s cost ~0.2 s of the context load and nothing else.
// The real fix for rail/trees is a bake that publishes them (`tools/context-bake/`), not this file.
// §SEA-BAKE-POLYGONS (lane SEA-BAKE, 2026-09-05) — `sea` (closed sea polygons from the osmdata
// water-polygons product; bake.mjs LAYERS `sea`, OPTIONAL). Added IN THE SAME COMMIT that teaches
// contextWater.ts to read the layer: an allowlist that lags the client is the drift documented above,
// and it fails in the one way this codebase treats as a defect — our own 404 is indistinguishable
// from "never baked", so the client would blame the bake for a refusal WE made (§L-513b honesty).
export const CONTEXT_TILE_LAYERS = ['buildings', 'roads', 'water', 'parks', 'landuse', 'rail', 'trees', 'sea'];

export const CONTEXT_TILES_UPSTREAM_TIMEOUT_MS = 15_000;

/**
 * Express handler. Never throws; any upstream failure becomes a plain status the PMTiles client
 * already knows how to treat as "this tile could not be read" — which, per the L-513b honesty
 * contract, is DISTINCT from "this tile is empty" and is what makes the client's `unavailable`
 * branch meaningful rather than decorative.
 */
export function makeContextTilesHandler(deps = {}) {
    const fetchImpl = deps.fetch ?? globalThis.fetch;
    const upstreamBase = deps.upstream ?? CONTEXT_TILES_UPSTREAM;

    return async function contextTilesHandler(req, res) {
        // `req.params.layer` under a `:layer` route, or the trailing path segment.
        const raw = String(req.params?.layer ?? '').replace(/\.pmtiles$/i, '');
        if (!CONTEXT_TILE_LAYERS.includes(raw)) {
            return res.status(404).json({ error: 'unknown context tile layer' });
        }

        const base = upstreamBase.endsWith('/') ? upstreamBase : `${upstreamBase}/`;
        const url = `${base}${raw}.pmtiles`;

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), CONTEXT_TILES_UPSTREAM_TIMEOUT_MS);
        try {
            // ⚠ FORWARD THE RANGE HEADER. PMTiles reads a byte range per tile; dropping this makes
            // every read a full 19 MB download that still "works", so the failure is invisible in
            // correctness and catastrophic in cost. Everything else about this route is secondary.
            const headers = {};
            if (req.headers?.range) headers.Range = req.headers.range;
            if (req.headers?.['if-none-match']) headers['If-None-Match'] = req.headers['if-none-match'];

            const upstream = await fetchImpl(url, { headers, signal: ctrl.signal });

            // Pass the status straight through — 206 for a range, 200 for a whole file, 304 for a
            // revalidation. Collapsing 206 into 200 would break the client's range accounting.
            res.status(upstream.status);
            for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
                const v = upstream.headers.get(h);
                if (v) res.setHeader(h, v);
            }
            // §L-580-CACHE — ⚠ THE TILES ARE **NOT** IMMUTABLE UNDER THIS URL, and the first
            // version of this line assumed they were (`max-age=86400, stale-while-revalidate=604800`).
            // A re-bake REPLACES `<layer>.pmtiles` in place, so that policy would have served the
            // OLD tileset for a day — and, via stale-while-revalidate, up to a WEEK — after a bake
            // that fixed real coverage. The L-580 re-bake raised Gòtic coverage 79% → 121%; under
            // the previous header the founder would have hard-refreshed, seen no change, and
            // reasonably concluded the fix had failed. A stale cache that looks like a broken fix
            // is the same class of misleading-green as the rest of this subsystem's history.
            //
            // One hour is short enough that a re-bake is visible the same session, and long enough
            // that a normal session pays for the ~36 tile reads once. `must-revalidate` then makes
            // the browser check the ETag rather than silently extending the stale copy — a 304 is
            // cheap, and correctness here is worth the round-trip.
            res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
            res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

            if (upstream.status === 304 || !upstream.body) return res.end();
            const buf = Buffer.from(await upstream.arrayBuffer());
            return res.end(buf);
        } catch (err) {
            const aborted = err?.name === 'AbortError';
            console.warn(
                `[context-tiles] §CTX-TILES-PROXY ${raw}.pmtiles failed `
                + `(${aborted ? 'upstream timeout' : err?.message ?? err}) — the client will report `
                + 'the tile as UNREADABLE, which is deliberately not the same as "no buildings here".',
            );
            return res.status(aborted ? 504 : 502).end();
        } finally {
            clearTimeout(timer);
        }
    };
}

export const contextTilesHandler = makeContextTilesHandler();

/**
 * §CTX-TILES-TERRAIN — same-origin passthrough for the baked Cesium quantized-mesh TERRAIN under
 * `<base>/terrain/<city>/…` (a `layer.json` + `*.terrain` LOD tiles). SEPARATE from the PMTiles
 * handler above because terrain paths are MULTI-SEGMENT (`terrain/zurich/0/0/0.terrain`), which the
 * single-segment `:layer` route cannot match — so without this route terrain requests fell through
 * to the SPA catch-all and came back as `index.html`, which `CesiumTerrainProvider.fromUrl` cannot
 * parse → the viewport silently kept flat ground (the "terrain looks flat in Zürich" report).
 *
 * ⚠ ALLOWLIST, NOT PASS-THROUGH — same reasoning as the PMTiles handler. The subpath must be
 * `<slug>/…` ending in `layer.json` or `.terrain`, with no traversal, so this can never be turned
 * into an open proxy for arbitrary bucket keys.
 */
export function makeContextTilesTerrainHandler(deps = {}) {
    const fetchImpl = deps.fetch ?? globalThis.fetch;
    const upstreamBase = deps.upstream ?? CONTEXT_TILES_UPSTREAM;

    return async function contextTilesTerrainHandler(req, res) {
        const sub = String(req.params?.[0] ?? '');
        if (
            sub.includes('..') || sub.startsWith('/') ||
            !/^[a-z0-9][a-z0-9._/-]*$/.test(sub) ||
            !/(?:\/layer\.json|\.terrain)$/.test(sub)
        ) {
            return res.status(404).json({ error: 'unknown terrain tile path' });
        }

        const base = upstreamBase.endsWith('/') ? upstreamBase : `${upstreamBase}/`;
        const url = `${base}terrain/${sub}`;

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), CONTEXT_TILES_UPSTREAM_TIMEOUT_MS);
        try {
            const headers = {};
            if (req.headers?.range) headers.Range = req.headers.range;
            if (req.headers?.['if-none-match']) headers['If-None-Match'] = req.headers['if-none-match'];

            const upstream = await fetchImpl(url, { headers, signal: ctrl.signal });
            res.status(upstream.status);
            for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
                const v = upstream.headers.get(h);
                if (v) res.setHeader(h, v);
            }
            // R2 objects already carry the right content-type from the bake; default by extension only
            // if the bucket omitted it, so the Cesium reader never mis-parses a tile as JSON.
            if (!upstream.headers.get('content-type')) {
                res.setHeader('content-type', sub.endsWith('.terrain') ? 'application/vnd.quantized-mesh' : 'application/json');
            }
            res.setHeader('cache-control', upstream.headers.get('cache-control') || 'public, max-age=3600, must-revalidate');
            if (upstream.status === 304 || upstream.status === 204) return res.end();
            const buf = Buffer.from(await upstream.arrayBuffer());
            return res.end(buf);
        } catch {
            return res.status(502).json({ error: 'terrain upstream unreachable' });
        } finally {
            clearTimeout(timer);
        }
    };
}

export const contextTilesTerrainHandler = makeContextTilesTerrainHandler();
