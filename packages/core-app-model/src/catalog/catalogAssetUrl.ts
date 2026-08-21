// ─────────────────────────────────────────────────────────────────────────────
// catalogAssetUrl.ts — §FURNITURE-GLB-404-SUMMARY / L-570 (OBJECT-STORAGE-GLB)
//
// THE DEFECT THIS CLOSES
// The furniture catalogue (`public/items/**`, 164 GLBs + thumbnails, ~186 MB) is
// DELIBERATELY excluded from the production Docker image (`.dockerignore` line
// `public/items`) — baking it in re-bloats the image for an asset that is pure
// static content. The consequence was that every `/items/<cat>/<slug>/model.glb`
// and `thumbnail.webp` 404'd in production, and every console log ended with
// "§FURNITURE-GLB-404-SUMMARY … N furniture model(s) failed to load".
//
// THE FIX (docs/04-reference/OBJECT-STORAGE-R2-DECISION.md)
// The catalogue is re-hosted on Cloudflare R2 (`pryzm-assets/items/…`) and the
// client composes its URL from a BUILD-TIME base:
//
//     VITE_GLB_URL=https://pub-….r2.dev/items/
//
// Descriptors keep their LOGICAL path (`/items/Sofas/sofa/model.glb`) — that is
// what is persisted on furniture records, so a project saved today keeps loading
// after the bucket moves to `assets.pryzm.app`. Only the URL handed to the loader
// / `<img src>` is rewritten, at the point of fetch.
//
// FALLBACK: when `VITE_GLB_URL` is unset (local dev, where `public/items/**` IS
// served by Vite) the logical path is returned UNCHANGED. So this is a no-op
// everywhere the catalogue is already local, and local dev is unaffected.
//
// ⚠ `VITE_*` is inlined at BUILD time. Setting it only as a Fly runtime secret
// does nothing — it must be in the environment of the vite build (see
// `.github/workflows/deploy-fly.yml` → `--build-arg VITE_GLB_URL` → `Dockerfile`
// `ARG/ENV VITE_GLB_URL`). Verify by grepping the built bundle for the host.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// ⬇ MOVED L7 -> L2, 2026-08-21 (§MATERIAL-MAPS-AND-TILING, L-1701). NOT rewritten.
//
// This file used to live at `apps/editor/src/ui/furniture-carousel/catalogAssetUrl.ts`
// (L7). `MaterialResolver` (L2, `core-app-model/src/materials/`) must resolve
// texture map paths through THE SAME seam the GLBs use — C100 §10.6 records that
// the furniture 404s and the texture question are literally the same unbuilt
// bucket, and a SECOND asset-URL path would be a second answer to one question
// (C84 EI-8), diverging the moment either bucket moves again.
//
// An L2 package may not import from L7, so the ONE implementation moved DOWN to
// the lowest layer that serves both consumers. `apps/editor/.../catalogAssetUrl.ts`
// remains, as a pure re-export shim, so all four editor call sites and the
// existing L-570 test keep working against their original specifier. There is
// still exactly one implementation and exactly one env read.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The logical prefix every catalogue asset path carries (see FurnitureCategoryData*).
 *
 * ⭐ EXPORTED since L-1701, and it is load-bearing rather than decorative. A path
 * that does NOT start with it is returned UNCHANGED by `resolveCatalogAssetUrl`,
 * which in production means it never reaches the CDN and 404s at fetch time. That
 * pass-through is correct for the inputs it was written for (drag payloads,
 * `blob:`/`data:` URLs, the `box` sentinel) and a TRAP for anything that believes
 * itself to be a catalogue asset. Callers that only ever hold catalogue paths
 * MUST check against this prefix and report a named state, not fetch and hope.
 */
export const CATALOG_LOGICAL_PREFIX = '/items/';
const CATALOG_PREFIX = CATALOG_LOGICAL_PREFIX;

/**
 * Build-time base for the re-hosted catalogue, e.g.
 * `https://pub-….r2.dev/items/`. Empty/absent → keep the local `/items/…` path.
 *
 * Read once at module load: Vite has already replaced this expression with a
 * string literal in the bundle, so there is nothing dynamic to re-read.
 */
function readEnv(): string {
    // Browser/bundled path: vite has already substituted a literal here.
    const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    const fromVite = viteEnv?.VITE_GLB_URL;
    if (fromVite) return fromVite;
    // Node path (vitest, and the apex prerender, which run this module outside a
    // vite client build where `import.meta.env` carries no VITE_* values).
    // `typeof` guarded because `process` does not exist in the browser bundle.
    if (typeof process !== 'undefined' && process?.env?.VITE_GLB_URL) return process.env.VITE_GLB_URL;
    return '';
}

const RAW_BASE = readEnv().trim();

/** Normalised base — guaranteed to end with exactly one `/`, or '' when unset. */
const CATALOG_BASE = RAW_BASE ? RAW_BASE.replace(/\/+$/, '') + '/' : '';

/** True when the build was given an object-storage base (i.e. prod). */
export function isCatalogRehosted(): boolean {
    return CATALOG_BASE.length > 0;
}

/** The configured base, for diagnostics/logging. '' when unset. */
export function catalogBaseUrl(): string {
    return CATALOG_BASE;
}

/**
 * Resolve a LOGICAL catalogue path to a fetchable URL.
 *
 * - `/items/Sofas/sofa/model.glb` + base → `https://…/items/Sofas/sofa/model.glb`
 * - `/items/…` with no base                → unchanged (local dev / test)
 * - anything else (absolute URL, blob:, data:, a non-catalogue path, 'box')
 *   → unchanged. Callers pass user/drag payloads through here, so being inert on
 *   non-catalogue input is load-bearing, not defensive noise.
 */
export function resolveCatalogAssetUrl(path: string | null | undefined): string {
    if (!path) return path ?? '';
    if (!CATALOG_BASE) return path;
    if (!path.startsWith(CATALOG_PREFIX)) return path;
    return CATALOG_BASE + path.slice(CATALOG_PREFIX.length);
}
