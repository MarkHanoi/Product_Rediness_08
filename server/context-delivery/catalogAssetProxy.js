// §CATALOG-R2-PROXY (L-578b) — serve the furniture catalogue (GLBs + thumbnails) from OUR origin,
// backed by the same Cloudflare R2 bucket.
//
// WHY, IN ONE LINE: the bucket sends no `Access-Control-Allow-Origin`, so a browser may not READ
// its responses — and three.js fetches every GLB from the browser.
//
// THE FULL CHAIN, BECAUSE IT TOOK FOUR DEPLOYS TO SEE
//   v271  `public/items/**` (164 GLBs, ~186 MB) is `.dockerignore`d out of the image on purpose,
//         so every `/items/**` 404'd in production. The catalogue was re-hosted on R2 and the
//         client taught to compose URLs from `VITE_GLB_URL`.
//   v272  Upload green, bundle correct, deploy green — every model still failed.
//   v273  §L-570-CSP added the R2 origin to `connect-src`. Necessary. Still not enough.
//   v275  The context PMTiles hit the SAME wall and were routed through our origin
//         (§CTX-TILES-PROXY). The GLBs were left on the direct path and stayed broken.
//   here  The catalogue takes the same route.
//
// ⚠ CSP AND CORS ARE DIFFERENT CONTROLS. CSP is OUR header on OUR document — which origins the
// page may ASK. CORS is THEIR header on THEIR response — whether the answer may be READ. We fixed
// the first and the second was never set at all. Every non-browser check (curl, `aws s3 ls`, the
// upload probe, every Node probe) returned a clean 200, because NONE OF THEM ENFORCE CORS. Only a
// browser does. That is the entire reason this took four deploys to see.
//
// ⚠ THIS IS A FALLBACK THAT UNWIRES ITSELF. Setting the bucket's CORS policy is the correct fix
// and needs bucket-ADMIN credentials the repo's object-scoped R2 token does not have
// (`PutBucketCors` → `AccessDenied`; `.github/workflows/r2-cors.yml` is committed and waiting).
// The client resolves the catalogue from a build-time base, so pointing `VITE_GLB_URL` back at
// R2 restores the direct route with no code change.
//
// WHY PROXYING THE CATALOGUE IS ACCEPTABLE WHERE PROXYING OVERPASS WOULD NOT BE: these are
// IMMUTABLE STATIC BYTES from object storage — no query planner, no rate limit, no in-band
// failure mode. They are cached hard here and by the browser, and a GLB is fetched once per
// session, not once per interaction.

/** The route prefix the client's `VITE_GLB_URL` points at. */
export const CATALOG_PROXY_PATH = '/api/catalog/items';

/** Upstream base for the catalogue objects. Same default as the deploy workflow + the CSP. */
export const CATALOG_UPSTREAM =
    process.env.CATALOG_UPSTREAM
    || 'https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev/items/';

/**
 * ⚠ EXTENSION ALLOWLIST + TRAVERSAL GUARD. The object key comes from the URL, so without this the
 * route is an open proxy: any key in the bucket becomes fetchable through our origin, wearing our
 * hostname and our reputation. Only the file types the catalogue actually contains are reachable.
 */
export const CATALOG_ALLOWED_EXT = ['.glb', '.gltf', '.bin', '.webp', '.png', '.jpg', '.jpeg', '.ktx2'];

export const CATALOG_UPSTREAM_TIMEOUT_MS = 20_000;

const CONTENT_TYPES = {
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.bin': 'application/octet-stream',
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ktx2': 'image/ktx2',
};

/**
 * Decide whether a requested catalogue-relative key is safe to fetch.
 * Exported so the rule is TESTABLE rather than buried in the handler.
 */
export function isSafeCatalogKey(key) {
    if (typeof key !== 'string' || key.length === 0 || key.length > 512) return false;
    // Reject traversal in every form, including the encoded ones a decoder may already have
    // resolved, plus absolute paths, protocol-relative paths and backslashes.
    if (key.includes('..') || key.startsWith('/') || key.startsWith('\\') || key.includes('\\')) return false;
    if (key.includes('://')) return false;
    if (!/^[A-Za-z0-9 ._\-/()]+$/.test(key)) return false;
    const dot = key.lastIndexOf('.');
    if (dot < 0) return false;
    return CATALOG_ALLOWED_EXT.includes(key.slice(dot).toLowerCase());
}

export function makeCatalogAssetHandler(deps = {}) {
    const fetchImpl = deps.fetch ?? globalThis.fetch;
    const upstreamBase = deps.upstream ?? CATALOG_UPSTREAM;

    return async function catalogAssetHandler(req, res) {
        // Everything after the mount point, e.g. `Sofas/sofa/model.glb`.
        const raw = String(req.params?.[0] ?? req.params?.key ?? '').replace(/^\/+/, '');
        let key;
        try {
            key = decodeURIComponent(raw);
        } catch {
            return res.status(400).json({ error: 'malformed catalogue path' });
        }
        if (!isSafeCatalogKey(key)) {
            return res.status(404).json({ error: 'not a catalogue asset' });
        }

        const base = upstreamBase.endsWith('/') ? upstreamBase : `${upstreamBase}/`;
        const url = base + key.split('/').map(encodeURIComponent).join('/');

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), CATALOG_UPSTREAM_TIMEOUT_MS);
        try {
            const headers = {};
            // GLTF loaders range-request large buffers; forward it so a big model streams rather
            // than re-downloading in full.
            if (req.headers?.range) headers.Range = req.headers.range;
            if (req.headers?.['if-none-match']) headers['If-None-Match'] = req.headers['if-none-match'];

            const upstream = await fetchImpl(url, { headers, signal: ctrl.signal });
            res.status(upstream.status);
            for (const h of ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
                const v = upstream.headers.get(h);
                if (v) res.setHeader(h, v);
            }
            // ⚠ SET THE TYPE OURSELVES. R2 serves unknown extensions as `application/octet-stream`
            // (or worse, `text/html` for an error page), and a GLTFLoader handed the wrong type
            // fails in a way that reads as a corrupt model rather than a transport problem.
            const dot = key.lastIndexOf('.');
            const ct = CONTENT_TYPES[key.slice(dot).toLowerCase()];
            res.setHeader('Content-Type', ct || upstream.headers.get('content-type') || 'application/octet-stream');
            res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
            res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

            if (upstream.status === 304 || !upstream.body) return res.end();
            if (!upstream.ok && upstream.status !== 206) {
                // Do NOT pass an upstream HTML error page through as if it were a model.
                console.warn(`[catalog-assets] §CATALOG-R2-PROXY ${key} → upstream ${upstream.status}`);
                return res.status(upstream.status).end();
            }
            return res.end(Buffer.from(await upstream.arrayBuffer()));
        } catch (err) {
            const aborted = err?.name === 'AbortError';
            console.warn(
                `[catalog-assets] §CATALOG-R2-PROXY ${key} failed `
                + `(${aborted ? 'upstream timeout' : err?.message ?? err})`,
            );
            return res.status(aborted ? 504 : 502).end();
        } finally {
            clearTimeout(timer);
        }
    };
}

export const catalogAssetHandler = makeCatalogAssetHandler();
