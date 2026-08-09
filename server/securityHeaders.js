/**
 * @file server/securityHeaders.js
 * @description HTTP security-header middleware for PRYZM — helmet-powered.
 *
 * CONTRACT (C08 §4 — enterprise security baseline):
 *   Every HTTP response is hardened via helmet with PRYZM-specific overrides for
 *   Three.js shader compilation ('unsafe-eval'), Web Workers (blob:), Socket.io
 *   WebSockets (wss:/ws:), and the Cesium ion CDN.  HSTS, COOP, and COEP are now
 *   set globally on ALL responses rather than per-route.
 *
 * Header inventory (post-helmet):
 *   Content-Security-Policy           — enforce in prod; report-only in dev
 *   Cross-Origin-Embedder-Policy      — credentialless (enables SharedArrayBuffer)
 *   Cross-Origin-Opener-Policy        — same-origin (required for cross-origin isolation)
 *   Cross-Origin-Resource-Policy      — same-origin
 *   Referrer-Policy                   — strict-origin-when-cross-origin
 *   Strict-Transport-Security         — 2-year HSTS with preload (prod only)
 *   X-Content-Type-Options            — nosniff
 *   X-DNS-Prefetch-Control            — off
 *   X-Frame-Options                   — SAMEORIGIN (removed entirely on /embed)
 *   X-Permitted-Cross-Domain-Policies — none
 *   X-XSS-Protection                  — 0 (disables the legacy browser auditor)
 *   Origin-Agent-Cluster              — ?1
 *
 * Exports:
 *   helmetMiddleware     — apply globally:  app.use(helmetMiddleware)
 *   securityHeaders      — backward-compat alias for helmetMiddleware
 *   applyEmbedHeaders(res) — call inside the GET /embed handler to relax framing
 *
 * TASK STATUS: DONE — Phase 0 Task 0.1 (R04 · C08 §4)
 */

// Node.js ESM can default-import CommonJS packages.  helmet exports
// module.exports as the CommonJS default, which becomes the ESM default.
import helmet from 'helmet';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
// C51 §3.1.2.2 — the CSP `report-uri` points at this single shared path.
import { CSP_REPORT_PATH } from './cspReport.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ── Environment detection ──────────────────────────────────────────────────────
// Mirrors the isProd logic in server.js exactly:
//   - npm_lifecycle_event is 'dev' when launched via `pnpm run dev`
//   - dist/ must exist for a production build to be present
//
// WHY NOT just `npm_lifecycle_event !== 'dev'`:
//   On Replit the workflow runner launches `pnpm run dev` via a shell task;
//   npm_lifecycle_event may be undefined in that context.  Using only that
//   flag would make IS_PROD=true in development, enforcing `frame-ancestors
//   'none'` and `X-Frame-Options: SAMEORIGIN` — both of which block the
//   Replit preview iframe (a cross-origin wrapper).  Requiring dist/ to
//   exist as the second guard prevents accidental prod-mode in dev.
//
// CONTRACT: C08 §4 — header policy MUST use report-only in development so
// engineers can observe violations without the Replit preview breaking.
const IS_PROD = (process.env.NODE_ENV === 'production' || process.env.npm_lifecycle_event !== 'dev')
    && existsSync(join(__dirname, '../dist'));

// ── CSP: connect-src origins ──────────────────────────────────────────────────
// C51 §3.1.2.2 — configuration-derived, no wildcards when configured. Built once
// at module init from environment config so the policy reflects the ACTUAL
// deployment rather than a hand-maintained allowlist that drifts.
//
// The AI worker is deliberately ABSENT: the browser calls the same-origin BFF
// (/api/anthropic/v1/messages), never CF_WORKER_URL directly, so no third-party
// AI origin belongs here. (Previously CF_WORKER_URL was pushed "for forward-
// compatibility" — dead weight that only widened the policy. Removed.)
/**
 * Build the CSP `connect-src` allowlist from environment configuration.
 * Pure + exported so the policy logic is unit-testable without standing up the
 * whole server (enterprise practice: tested config, not inline magic).
 *
 * @param {Record<string,string|undefined>} env   process.env (or a test double)
 * @param {boolean} isProd                          production posture
 * @returns {string[]} the connect-src token list
 */
export function buildConnectSrc(env = process.env, isProd = IS_PROD) {
    const src = [
        "'self'",
        'data:',
        'blob:',
        // Cesium ion terrain / asset CDN — C12 geospatial. Direct browser→CDN is
        // the designed path; proxying signed tile URLs through our origin is an
        // anti-pattern (latency + bandwidth + breaks ion CDN caching).
        'https://api.cesium.com',
        'https://assets.cesium.com',
        'https://ionfetch.cesium.com',
        // GIS-CESIUM-NOTOKEN-IMAGERY (2026-06-04) — external photoreal-imagery tile
        // origins. These are ONLY ever requested on the token/photoreal Cesium path
        // (apps/editor/src/ui/geospatial/CesiumViewport.ts): ESRI World Imagery
        // satellite basemap, Google Photorealistic 3D Tiles streamed via ion, and
        // the Bing aerial that ion's default base layer can resolve to. On the FREE
        // Forma path (no VITE_CESIUM_TOKEN) the viewer is constructed with
        // `baseLayer:false` and SKIPS both the ESRI install and the Google tileset,
        // so it makes ZERO requests to these hosts — they are allowlisted purely so
        // that a token-configured deployment's photoreal imagery is not CSP-blocked.
        'https://server.arcgisonline.com',
        'https://tile.googleapis.com',
        'https://dev.virtualearth.net',
        'https://*.virtualearth.net',
        // ThatOpen / OBC engine asset CDN — the fragment engine lazily fetches
        // a default HDR env-map (RGBELoader, engineLauncher.ts) for HDRI-based
        // visual styles. Surfaced as a prod CSP violation by the §3.1.2.2 report
        // sink. The loader degrades gracefully (resolve null) if unreachable, so
        // this is a low-risk allow. ENTERPRISE FOLLOW-ON: self-host the .hdr
        // under /public to drop this external dependency entirely.
        'https://thatopen.github.io',
        // A.8.a — OpenStreetMap Nominatim forward-geocoder (address search box in
        // the GIS site-authoring surface, apps/editor/src/ui/site/geocodeAddress.ts).
        // Direct browser→Nominatim is the designed path for low-volume interactive
        // search; ENTERPRISE FOLLOW-ON: a self-hosted Nominatim / commercial geocoder
        // (set VITE_GEOCODE_ENDPOINT) replaces this origin when volume warrants.
        'https://nominatim.openstreetmap.org',
        // A.8.c.f.2 — OpenFreeMap keyless vector basemap for the 2D Hektar
        // boundary-draw map (apps/editor/src/ui/geospatial/siteMap2DStyle.ts).
        // The browser fetches the planet TileJSON, the .pbf vector tiles, and the
        // font/glyph PBFs from this origin. The sprite is an https image already
        // covered by img-src https:. Direct browser→OpenFreeMap is the designed
        // path (free, no key); ENTERPRISE FOLLOW-ON: self-host the tiles to drop
        // this external dependency when volume warrants.
        'https://tiles.openfreemap.org',
        // GIS-CESIUM-OSM-GLOBE (2026-06-05) — keyless OpenStreetMap raster tiles
        // for the Cesium "3D globe" basemap (apps/editor/src/ui/geospatial/
        // CesiumViewport.ts UrlTemplateImageryProvider). Cesium's tile loader
        // fetches PNG tiles via XHR/fetch (connect-src), NOT <img> — so img-src
        // https: alone does NOT cover it and every tile was CSP-blocked ("Failed
        // to obtain image tile"). The {s} subdomain rotates a/b/c. ENTERPRISE
        // FOLLOW-ON: self-host the tiles / use a keyed provider when volume warrants.
        'https://tile.openstreetmap.org',
        'https://*.tile.openstreetmap.org',
        // MAP-DATA-OVERTURE — keyless OSM building footprints via the public
        // Overpass API, for the richer 2D + 3D context buildings (apps/editor/src/
        // ui/geospatial/contextBuildings.ts). The browser POSTs an Overpass-QL
        // bbox query and reads the GeoJSON-ish JSON. Overture ships as GeoParquet
        // (not browser-direct) so OSM/Overpass is the keyless path; its Buildings
        // theme is largely OSM-derived anyway. ENTERPRISE FOLLOW-ON: a self-hosted
        // Overpass or a keyed Overture-PMTiles provider replaces these origins.
        'https://overpass-api.de',
        'https://overpass.kumi.systems',
        // §A.21.D-GLOBE2 — extra keyless Overpass mirrors so context buildings
        // survive rate-limiting (429) of the primary during heavy testing.
        'https://overpass.private.coffee',
        // §SITE-METRIC-OVERPASS-PARALLEL (2026-06-29) — `overpass.osm.jp` dropped:
        // its TLS cert is invalid (ERR_CERT_COMMON_NAME_INVALID), so it never connected.
        // CLIMATE-LIVE-DATA — keyless live climate sources for the FORMA.5
        // climate card + sun/wind analysis (apps/editor/src/ui/climate/
        // liveClimateFetch.ts → @pryzm/climate-host liveNormalsAdapter).
        //   - Open-Meteo Climate API: monthly temperature normals + wind rose.
        //   - PVGIS (EU JRC): monthly global-horizontal irradiation (GHI).
        // Both FREE + NO KEY; direct browser→provider is the designed path.
        // Any fetch failure degrades to the BUNDLED climate-zone templates
        // (C21 §7.4), so a blocked origin never breaks the climate card — it
        // just loses the live upgrade. ENTERPRISE FOLLOW-ON: proxy/self-host
        // when volume warrants.
        'https://climate-api.open-meteo.com',
        'https://re.jrc.ec.europa.eu',
        // §ANALYSIS-REAL-DATA-CSP (ADR-0095) — the site-analysis REAL datasets the
        // Forma metrics read directly from the browser (apps/editor/src/ui/climate/
        // siteRealData.ts):
        //   - NASA POWER (power.larc.nasa.gov): T2M air-temperature + WS10M/WD10M
        //     wind climatology → the temperature + wind heatmaps and the wind rose.
        //   - WorldPop (api.worldpop.org): gridded population stats over the plot →
        //     the population-density heatmap (real persons/hectare).
        // Both are FREE + NO KEY and send permissive CORS, so direct browser→provider
        // is the designed path. WITHOUT these two origins the fetch is CSP-blocked
        // ("Refused to connect … violates connect-src") and every metric silently
        // degrades to the built-density ESTIMATE — exactly what shipped in ADR-0095
        // (the fetchers landed, this allowlist entry didn't). Failure still degrades
        // gracefully to the estimate (non-fatal).
        'https://power.larc.nasa.gov',
        'https://api.worldpop.org',
    ];

    // §L-570-CSP (2026-07-21) — the Cloudflare R2 asset origin (furniture GLB
    // catalogue + the L-571 context PMTiles). THE SAME MISTAKE AS THE NASA/WorldPop
    // entry NOTED DIRECTLY ABOVE: the client re-host landed, this allowlist entry
    // did not, so every model 404'd differently than before — not "missing object"
    // but `Refused to connect … violates the document's Content Security Policy`,
    // with the upload, the bundle and the deploy all reporting success. A new
    // client ORIGIN is never just a client change.
    //
    // Derived from the SAME env var the build inlines (VITE_GLB_URL) so the policy
    // cannot drift from the bundle: point the build at a custom domain
    // (assets.pryzm.app) and the CSP follows automatically. Only the ORIGIN is taken
    // — a path in connect-src is meaningless and would silently widen nothing.
    for (const raw of [env.VITE_GLB_URL, env.VITE_CONTEXT_TILES_URL]) {
        if (!raw) continue;
        try {
            const o = new URL(raw).origin;
            if (o.startsWith('https://') && !src.includes(o)) src.push(o);
        } catch { /* malformed → allow nothing, never crash the header build */ }
    }
    // The r2.dev default the deploy workflow bakes in when no repo VARIABLE overrides
    // it. Listed explicitly so a deployment that sets neither env var still serves the
    // catalogue — the vars are BUILD-time (vite inlines them) and are not guaranteed
    // to be present in the RUNTIME server process, which is exactly the asymmetry that
    // makes this class of bug invisible until a browser refuses the request.
    if (!src.some((s) => s.endsWith('.r2.dev'))) {
        src.push('https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev');
    }

    // Supabase REST + realtime — derive the EXACT project origin from
    // SUPABASE_URL (RLS-protected direct browser access is by design). Falls
    // back to the *.supabase.co wildcard ONLY when SUPABASE_URL is unset /
    // unparseable, so a misconfiguration degrades to the previous safe-but-broad
    // behaviour rather than CSP-blocking persistence for every user. No silent
    // break — that is the enterprise-safe failure mode.
    try {
        const sbHost = env.SUPABASE_URL ? new URL(env.SUPABASE_URL).host : null;
        if (sbHost) src.push(`https://${sbHost}`, `wss://${sbHost}`);
        else src.push('https://*.supabase.co', 'wss://*.supabase.co');
    } catch {
        src.push('https://*.supabase.co', 'wss://*.supabase.co');
    }

    // Socket.io collaboration transport (C08 §3). 'wss:' (any secure WebSocket)
    // is retained: the editor connects to its own origin, but scoping this to a
    // single host safely requires a staging run to confirm the realtime origin
    // under the Cloudflare→Fly chain — tracked as the residual tightening in
    // C51 §3.1.2.2. Insecure 'ws:' is permitted ONLY in development (Vite HMR /
    // localhost sockets); production is wss-only.
    src.push('wss:');
    if (!isProd) src.push('ws:');

    return src;
}

const CONNECT_SRC = buildConnectSrc();

// ── CSP: script-src ───────────────────────────────────────────────────────────
// ⚠ THE STATED JUSTIFICATION FOR 'unsafe-eval' IS AT LEAST PARTLY FALSE, AND THE
// COMMENT THAT ASSERTED IT SURVIVED UNCHALLENGED BECAUSE NOBODY MEASURED IT.
// This block previously read "'unsafe-eval' is required by Three.js shader
// compilation". Three.js does NOT eval shaders — GLSL is handed to the driver via
// `gl.shaderSource`/`gl.compileShader`, which is not script execution and is not
// governed by script-src at all. Measured 2026-08-07 against the SHIPPED bundle:
// the 1.87 MB `vendor-three-*.js` production chunk contains **zero** occurrences
// of `eval(` or `new Function(`.
//
// That does NOT prove 'unsafe-eval' is removable — the claim has two halves and
// only one is disproved. Cesium, the WASM/Draco/Basis decoders and the worker
// chunks are not covered by that grep, a minifier can rename an eval alias, and a
// static scan cannot see a dynamically-constructed call. See the
// [[probe-can-be-wrong-three-ways]] discipline: a scan can be wrong about the
// runtime, the property, or the system.
//
// So the enforced policy is UNCHANGED here and stays permissive. The evidence for
// narrowing comes from STRICT_CSP_SHADOW_DIRECTIVES below, which ships the C51
// §3.1.2 target policy in report-only mode against real production traffic. When
// the shadow reports nothing for `script-src` over a representative window, this
// list becomes ["'self'", "'wasm-unsafe-eval'", 'blob:'] — and not before.
//
// 'unsafe-inline' is granted ONLY in development for Vite HMR injected scripts.
// ES module scripts loaded via <script type="module"> do not require it in prod.
const SCRIPT_SRC_PROD = ["'self'", "'unsafe-eval'", 'blob:'];
const SCRIPT_SRC_DEV  = ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'blob:'];

// ── CSP: main-application directives ─────────────────────────────────────────
// frame-ancestors 'none' prevents the app shell from being iframed.
// The /embed route overrides this to 'frame-ancestors *' via applyEmbedHeaders().
const MAIN_CSP_DIRECTIVES = {
    defaultSrc:     ["'self'"],
    scriptSrc:      IS_PROD ? SCRIPT_SRC_PROD : SCRIPT_SRC_DEV,
    workerSrc:      ["'self'", 'blob:'],           // Web Workers + WASM workers (IFC, Cesium)
    styleSrc:       ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], // CSS-in-JS + Three.js CSS2DRenderer + Google Fonts
    imgSrc:         ["'self'", 'data:', 'blob:', 'https:'], // textures, thumbnails, Cesium tiles
    fontSrc:        ["'self'", 'data:', 'https://fonts.gstatic.com'], // Google Fonts woff2
    connectSrc:     CONNECT_SRC,
    frameAncestors: ["'none'"],
    // frame-src is intentionally omitted: PRYZM does not embed external iframes
    // in the main application shell.

    // C51 §3.1.2.2 — report-uri sends violation reports to the in-app sink
    // (server/cspReport.js). Works in BOTH enforce (prod) and report-only (dev)
    // modes, so we collect the evidence needed to safely narrow script-src /
    // style-src / the blanket wss: from real production telemetry rather than
    // guesswork. (report-uri is deprecated in favour of report-to, but remains
    // the broadest-supported mechanism; a report-to/Reporting-Endpoints upgrade
    // is the documented follow-up.)
    reportUri:      [CSP_REPORT_PATH],

    // §CSP-UPGRADE-INSECURE (DAILY-USE 2026-05-21) — helmet adds the
    // `upgrade-insecure-requests` directive to its default CSP. Browsers
    // explicitly IGNORE this directive when the policy is delivered in
    // report-only mode (W3C CSP3 §2.5: "the directive has no effect if it
    // appears in a Content-Security-Policy-Report-Only header") and emit a
    // console warning per request. PRYZM uses report-only mode in
    // development (line 136: `reportOnly: !IS_PROD`), so every dev page
    // load fires the warning at least twice. Architect reported the spam:
    // "The Content Security Policy directive 'upgrade-insecure-requests'
    // is ignored when delivered in a report-only policy."
    //
    // Helmet's documented disable-a-default-directive idiom is to set the
    // key to `null`. In production (`IS_PROD`), upgrade-insecure-requests
    // IS effective and worth keeping; in development we explicitly null it
    // out so the warnings stop. Same posture as hsts / coep / coop / corp
    // / frameguard which are all disabled in dev for similar pragmatic
    // reasons (see crossOriginEmbedderPolicy/Opener/Resource below).
    ...(IS_PROD ? {} : { upgradeInsecureRequests: null }),
};

// ── CSP: the STRICT SHADOW policy (C51 §3.1.2 target, report-only) ───────────
// §CSP-STRICT-SHADOW (C51 §3.1.2 / §3.1.2.2) — the two remaining blockers on the
// contract's strict CSP are `script-src 'unsafe-eval'` and `style-src
// 'unsafe-inline'`. Both have been "blocked on a full-app run" for months, which
// is another way of saying nobody could safely try them: flipping either one in
// ENFORCE mode on production risks a white screen for every user, and neither can
// be cleared from a local run because localhost dev cannot exercise Cesium, the
// WASM decoders and the worker chunks the way real traffic does.
//
// A second policy resolves that. A browser applies EVERY CSP header it receives:
// `Content-Security-Policy` is enforced, `Content-Security-Policy-Report-Only` is
// evaluated and reported but never blocks. Shipping the TARGET policy in the
// report-only slot therefore measures the strict policy against real production
// traffic at ZERO user risk — every violation report is a precise, located
// statement of what the tightening would have broken.
//
// This is the contract's own instruction, not an invention: §3.1.2.2 exists so
// script-src / style-src can be narrowed "from real production telemetry rather
// than guesswork". It is also the standing §CONTEXT-DATA-HONESTY discipline —
// ship the PROBE before the FIX, and never let "we found nothing" and "we did not
// look" be the same value.
//
// ⚠ READ THE SILENCE CORRECTLY. Zero reports means "no user exercised the code
// path that needs it", NOT "the directive is unnecessary". Before flipping either
// directive into the enforced policy, confirm the window actually covered the
// risky surfaces: open a Cesium 3D site view, load an IFC (WASM worker), run a
// geometry batch, open the marketplace. Silence over a window that never ran
// Cesium proves nothing about Cesium.
const STRICT_CSP_SHADOW_DIRECTIVES = {
    ...MAIN_CSP_DIRECTIVES,

    // BLOCKER 1 — 'unsafe-eval' → 'wasm-unsafe-eval'. The narrower token permits
    // WebAssembly compilation (the geometry kernel, IFC, Draco/Basis decoders)
    // while refusing JS eval()/new Function(). If the WASM paths are the only real
    // consumers, this reports clean and the enforced policy can adopt it.
    // ⚠ ANSWERED 2026-08-09 — `eval` IS GENUINELY USED. Production telemetry from
    // this very shadow reported `directive=script-src blocked=eval` against real
    // sessions. So `'unsafe-eval'` CANNOT be dropped, and the Three.js measurement
    // that suggested otherwise (zero `eval(`/`new Function(` in the 1.87 MB
    // vendor-three chunk) was TRUE BUT INCOMPLETE — the eval lives elsewhere
    // (Cesium / a WASM glue path / a worker chunk), exactly the gap that grep was
    // warned not to cover. Tightening on that evidence alone would have white-
    // screened production.
    //
    // Kept at 'wasm-unsafe-eval' so the shadow keeps NAMING which surfaces still
    // eval — that is the remaining work item, and silence here would erase it.
    scriptSrc: ["'self'", "'wasm-unsafe-eval'", 'blob:'],

    // BLOCKER 2 — style-src 'self'. `injectAppTheme()` writes CSS-in-JS, which
    // needs a nonce or hash migration before this can hold. Expect reports here
    // FIRST; they name the exact injection sites that still need migrating, which
    // is the work item this shadow is meant to scope.
    // ⚠ ANSWERED, AND NOW RETIRED FROM THE SHADOW — style-src was DROWNING THE
    // FOUNDER'S CONSOLE. Every `injectAppTheme()` write, every Cesium widget style
    // and every inline `style="…"` attribute produced its own report-only warning:
    // hundreds of lines per page load, making the console unusable for reading the
    // application's OWN diagnostics. That is a real cost, and it was being paid to
    // re-learn something already established.
    //
    // The finding stands and needs no further sampling: `style-src-elem` and
    // `style-src-attr` are both violated, by CSS-in-JS and by inline style
    // attributes respectively. Closing it is a nonce/hash migration of
    // `injectAppTheme()` — a work item, not a measurement question.
    //
    // ⚠ THIS IS A DELIBERATE REDUCTION IN COVERAGE, NOT AN OVERSIGHT. Keeping the
    // permissive value here means the shadow NO LONGER TESTS style-src at all; if
    // the CSS-in-JS migration lands, this line must go back to `'self'` to prove
    // it. A diagnostic whose noise stops people reading their own logs has stopped
    // being a diagnostic — but a retired probe must say so, or its silence reads
    // as a pass.
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],

    // Label the reports so the sink can tell a research datum from a live break.
    reportUri: [`${CSP_REPORT_PATH}?policy=strict-shadow`],

    // W3C CSP3 §2.5: browsers IGNORE upgrade-insecure-requests in a report-only
    // policy and warn once per response. The enforced policy already carries it,
    // so omitting it here costs nothing and keeps the console clean.
    upgradeInsecureRequests: null,
};

/** Serialise a helmet-style directive map into a CSP header string. */
function serialiseCspDirectives(directives) {
    return Object.entries(directives)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([key, values]) => {
            const name = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
            const list = Array.isArray(values) ? values : [values];
            return list.length ? `${name} ${list.join(' ')}` : name;
        })
        .join('; ');
}

const STRICT_CSP_SHADOW_HEADER = serialiseCspDirectives(STRICT_CSP_SHADOW_DIRECTIVES);

/**
 * §CSP-STRICT-SHADOW — emit the C51 §3.1.2 target policy in report-only mode
 * alongside helmet's enforced policy.
 *
 * PRODUCTION ONLY, deliberately. In development helmet already delivers the MAIN
 * policy as report-only (`reportOnly: !IS_PROD`); adding a second report-only
 * header there would produce two interleaved streams from two different policies
 * with no enforced policy at all — noise that teaches nothing.
 *
 * Exported for direct unit testing and mounted in `server.js` after helmet.
 */
export function strictCspShadowMiddleware(_req, res, next) {
    if (IS_PROD) {
        res.setHeader('Content-Security-Policy-Report-Only', STRICT_CSP_SHADOW_HEADER);
    }
    next();
}

/** Test-only accessor: the serialised shadow policy. */
export const __strictCspShadowHeader = STRICT_CSP_SHADOW_HEADER;

// ── CSP: embed-mode string ────────────────────────────────────────────────────
// Used exclusively by applyEmbedHeaders() on the GET /embed route.
// 'frame-ancestors *' permits embedding from any third-party origin (C07 §6.1).
// 'unsafe-inline' in script-src covers the inline bootstrap script in the embed
// shell HTML (<script>window.__PRYZM_EMBED__ = …</script>).
const EMBED_CSP_STRING = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self' wss: ws: https:",
    "img-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "frame-ancestors *",
].join('; ');

// ── helmet instance ───────────────────────────────────────────────────────────
// Single shared middleware instance, constructed once at module load.
// Option names are compatible with helmet ≥ 5.x (the version family that
// introduced crossOriginEmbedderPolicy, crossOriginOpenerPolicy, and
// crossOriginResourcePolicy).
export const helmetMiddleware = helmet({

    // ── Content-Security-Policy ───────────────────────────────────────────────
    contentSecurityPolicy: {
        directives: MAIN_CSP_DIRECTIVES,
        // Enforce in production; report-only in development so engineers can
        // observe violations in DevTools → Console without the app breaking.
        reportOnly: !IS_PROD,
    },

    // ── Cross-Origin Embedder Policy (COEP) ───────────────────────────────────
    // 'credentialless' grants SharedArrayBuffer access — required by Cesium WASM
    // and the IFC WASM worker — while allowing cross-origin images and GLBs to
    // load without a CORP header on every CDN sub-resource.
    // Disabled in development so the Replit preview iframe (cross-origin) can
    // embed the app without triggering COEP restrictions.
    crossOriginEmbedderPolicy: IS_PROD ? { policy: 'credentialless' } : false,

    // ── Cross-Origin Opener Policy (COOP) ─────────────────────────────────────
    // 'same-origin' prevents foreign origins from retaining a JS window reference
    // to this page, enabling cross-origin isolation (a prerequisite for
    // SharedArrayBuffer in all modern browsers).
    // Disabled in development so the Replit preview iframe can load the app.
    crossOriginOpenerPolicy: IS_PROD ? { policy: 'same-origin' } : false,

    // ── Cross-Origin Resource Policy (CORP) ───────────────────────────────────
    // Restricts this server's responses to same-origin consumers.
    // Individual static-file routes (/items, /mosaic) may set their own CORP
    // header via express.static setHeaders — those per-response values take
    // precedence over this global default.
    // Relaxed in development to allow cross-origin Replit preview access.
    crossOriginResourcePolicy: IS_PROD ? { policy: 'same-origin' } : false,

    // ── Referrer-Policy ───────────────────────────────────────────────────────
    // Send only the origin (no path or query) as Referer on cross-origin
    // navigations, preventing project IDs and auth tokens from leaking.
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

    // ── Strict-Transport-Security (HSTS) ──────────────────────────────────────
    // 2-year max-age, subdomain coverage, preload-list eligibility.
    // Disabled in development — localhost does not support TLS and a stray HSTS
    // header on localhost can break the browser for months.
    hsts: IS_PROD
        ? { maxAge: 63072000, includeSubDomains: true, preload: true }
        : false,

    // ── Origin-Agent-Cluster ──────────────────────────────────────────────────
    // Opts this origin into origin-keyed agent clusters, improving process-level
    // memory isolation between different origins in the same browsing session.
    originAgentCluster: true,

    // ── X-Content-Type-Options ────────────────────────────────────────────────
    // nosniff — prevents MIME-type sniffing attacks (e.g. the browser executing
    // a .png file as JavaScript).
    noSniff: true,

    // ── X-DNS-Prefetch-Control ────────────────────────────────────────────────
    // Disables speculative DNS pre-resolution on page content (minor privacy
    // benefit for a platform handling confidential BIM data).
    dnsPrefetchControl: { allow: false },

    // ── X-Frame-Options ───────────────────────────────────────────────────────
    // SAMEORIGIN in production — prevents clickjacking while allowing same-origin
    // iframe usage.  Disabled in development so Replit's canvas/preview iframe
    // (which uses a cross-origin wrapper) can embed the app.
    // applyEmbedHeaders() removes this header entirely for /embed so that
    // third-party sites can embed the editor in an iframe.
    frameguard: IS_PROD ? { action: 'sameorigin' } : false,

    // ── X-Permitted-Cross-Domain-Policies ─────────────────────────────────────
    // 'none' — prevents Adobe Flash and Acrobat from loading this server's
    // cross-domain policy files.
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },

    // ── X-XSS-Protection ──────────────────────────────────────────────────────
    // 0 — disables the legacy browser XSS auditor, which can itself introduce
    // XSS vulnerabilities.  The CSP above is the correct defence-in-depth layer.
    xssFilter: false,

    // ── X-Powered-By ──────────────────────────────────────────────────────────
    // Belt-and-suspenders: server.js already calls app.disable('x-powered-by').
    // hidePoweredBy removes the header if that call were ever missed.
    hidePoweredBy: true,
});

// ── Backward-compatibility alias ──────────────────────────────────────────────
// server.js previously imported { securityHeaders } from this module.
// Export both names so any callers using the old name continue to work without
// change during the migration period.
export { helmetMiddleware as securityHeaders };

/**
 * Applies embed-mode header overrides to an Express response object.
 *
 * Call this inside the GET /embed route handler body.  Because
 * app.use(helmetMiddleware) is mounted before all route handlers, helmet has
 * already written the default security headers when the route handler runs.
 * This function overrides just the two headers that embed mode must relax.
 *
 * CONTRACT (C07 §6.1): The /embed route MUST be embeddable inside iframes from
 * any origin.  The global helmetMiddleware sets X-Frame-Options: SAMEORIGIN and
 * CSP frame-ancestors 'none'; this function corrects both for embed mode.
 *
 * Design: We remove X-Frame-Options entirely rather than setting it to the
 * non-standard value ALLOWALL (which is not defined in RFC 7034; only DENY and
 * SAMEORIGIN are valid).  Modern browsers honour CSP frame-ancestors when
 * X-Frame-Options is absent, making frame-ancestors the authoritative control.
 *
 * @param {import('express').Response} res
 */
export function applyEmbedHeaders(res) {
    // (1) Remove X-Frame-Options — any value restricts embedding in browsers
    //     that still check this legacy header before CSP frame-ancestors.
    res.removeHeader('X-Frame-Options');

    // (2) Remove report-only CSP if present (set by helmet in dev mode) so
    //     the enforce header below is the sole CSP signal on this response.
    res.removeHeader('Content-Security-Policy-Report-Only');

    // (3) Set the embed-mode CSP that uses frame-ancestors * (C07 §6.1).
    //     Always enforce (never report-only) so the embed route works in both
    //     development and production without requiring a production build.
    res.setHeader('Content-Security-Policy', EMBED_CSP_STRING);
}
