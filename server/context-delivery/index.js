/**
 * server/context-delivery/index.js
 * ============================================================================
 * THE CONTEXT- & ASSET-DELIVERY BOUNDED CONTEXT — one router, one mount line.
 *
 * WHY THIS IS A SEPARATE DIRECTORY FROM `server/jurisdiction/`
 * -----------------------------------------------------------
 * These three proxies look like the jurisdiction proxies (same-origin
 * passthroughs to a remote upstream) and are NOT the same thing:
 *
 *   • they carry NO planning/legal semantics — nothing here feeds a buildable
 *     envelope, a refusal card, or a citation. They deliver *bytes*: OSM
 *     context geometry, baked PMTiles, furniture GLBs;
 *   • they are deliberately NOT rate-limited (see below), which is the exact
 *     opposite of the jurisdiction router's invariant;
 *   • their upstreams are our own infrastructure (R2) or a public OSM mirror
 *     pool, not a government register.
 *
 * Collapsing them into the jurisdiction router would make "every route behind
 * `apiLimiter`" untrue there, which is the invariant that keeps ~20 keyless
 * government endpoints from becoming open forwarders. Two contexts, two
 * routers, two honest invariants.
 *
 * ⛔ DO NOT ADD `apiLimiter` TO THESE ROUTES.
 * ------------------------------------------
 * That is not an oversight, it is a measured decision recorded at each route
 * below. `apiLimiter` is 60 req/min/IP; ONE 3D-Site load issues ~30-35 tile
 * reads and opening the furniture carousel fetches many thumbnails at once, so
 * the limiter would throttle the SECOND site visit of any minute and present as
 * the "context randomly doesn't render" / "catalogue 404s" complaints these
 * routes exist to end. `globalLimiter` still applies to all of them.
 *
 * ⚠ WHY `POST /api/overpass` IS *NOT* HERE, THOUGH IT BELONGS TO THIS CONTEXT
 * ---------------------------------------------------------------------------
 * It is the ONLY *write* route in the whole proxy fleet, and the C08 §1.2
 * write-route auth gate — `tools/ga-gate/check-write-route-auth.ts` plus
 * `server/__tests__/permissions.test.ts` §T28-T31 — derives the audited route
 * surface by scanning the TEXT of `server.js` for `app.post|put|patch|delete(`
 * and resolving path constants from a NON-recursive `readdir(server/)`. It
 * understands `app.use('/prefix', router)` mounts but never scans a router's
 * body, and it does not see prefix-less mounts at all.
 *
 * So moving that one POST in here would make it INVISIBLE to the gate whose
 * entire reason for existing is that its predecessor was "green by
 * construction" while nine unaudited write routes had drifted in (L-406). A
 * structural tidy-up is not worth blinding a security audit, so the route and
 * `server/overpassProxy.js` deliberately stay in the monolith.
 *
 * TO FINISH THIS EXTRACTION, `tools/ga-gate` must first learn to scan mounted
 * routers (recursive constant harvest + follow `createXRouter()` factories).
 * That file is CI-owned; this comment is the handoff. Until then, ANY server
 * modularisation that moves a write route is blocked on the same change.
 *
 * PLACEMENT: same reasoning as `server/jurisdiction/index.js` — the Dockerfile
 * runtime stage copies only `server.js` + `server/` (§L-442), so `packages/*`
 * and the undeployed `apps/api-gateway` are not reachable homes today.
 * ============================================================================
 */

import express from 'express';

import { CONTEXT_TILES_PATH, contextTilesHandler, contextTilesTerrainHandler } from './contextTilesProxy.js';
import { CATALOG_PROXY_PATH, catalogAssetHandler } from './catalogAssetProxy.js';

/**
 * The routes this router owns, in registration order, as `[method, path]`.
 * Asserted by `server/__tests__/contextDeliveryRouter.test.ts`.
 * @type {ReadonlyArray<readonly [string, string]>}
 */
export const CONTEXT_DELIVERY_ROUTES = Object.freeze([
    ['get', `${CONTEXT_TILES_PATH}/terrain/*`],
    ['get', `${CONTEXT_TILES_PATH}/:layer`],
    ['get', `${CATALOG_PROXY_PATH}/*`],
]);

/**
 * Build the context/asset-delivery router.
 *
 * @returns {import('express').Router}
 */
export function createContextDeliveryRouter() {
    const router = express.Router();

    // §CTX-TILES-PROXY (L-578) — same-origin passthrough to the baked context PMTiles in R2.
    // The client reads R2 DIRECTLY when `VITE_CONTEXT_TILES_URL` is set; this route exists because
    // the bucket sends no CORS headers, so a browser cannot read it directly (CORS is a BROWSER
    // policy — server-to-server is unaffected). See the module header: it is a fallback that unwires
    // itself the moment the bucket's CORS policy lands.
    //
    // ⚠ DELIBERATELY NOT BEHIND `apiLimiter`. That limiter is 60 req/min/IP, and ONE 3D-Site load
    // issues ~30–35 tile reads (a byte range per tile) — so the limiter would throttle the context
    // on the second site visit of any minute and present as the exact "context randomly doesn't
    // render" complaint this whole work stream exists to end. These are cacheable static bytes, not
    // an expensive upstream query; `globalLimiter` still applies.
    // §CTX-TILES-TERRAIN — MUST be registered before the single-segment `:layer` route. Terrain tiles
    // live at multi-segment `terrain/<city>/…` paths the `:layer` route can't match; without this they
    // fell through to the SPA and returned index.html (silent flat ground). Same no-limiter reasoning.
    router.get(`${CONTEXT_TILES_PATH}/terrain/*`, contextTilesTerrainHandler);
    router.get(`${CONTEXT_TILES_PATH}/:layer`, contextTilesHandler);

    // §CATALOG-R2-PROXY (L-578b) — the furniture catalogue (GLBs + thumbnails) over our own origin,
    // for the SAME reason as the tiles above: the R2 bucket sends no CORS headers, and three.js
    // fetches every GLB from the BROWSER, where CORS is enforced. `VITE_GLB_URL` points here.
    //
    // ⚠ The router carrying this MUST be mounted BEFORE the static/SPA middleware in server.js. The
    // SPA catch-all answers unknown paths with index.html — and it honours Range, so a missed route
    // returns `206 Partial Content` carrying HTML. That is a success-shaped failure: a GLTFLoader
    // handed it reports a corrupt model, not a routing mistake. (Observed live while verifying the
    // tiles proxy.)
    //
    // ⚠ Deliberately NOT behind `apiLimiter` — opening the carousel fetches many thumbnails at once,
    // and 60 req/min/IP would throttle the catalogue into exactly the 404-shaped failure this route
    // exists to end. These are immutable, hard-cached static bytes.
    router.get(`${CATALOG_PROXY_PATH}/*`, catalogAssetHandler);

    return router;
}
