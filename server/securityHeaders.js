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
        // MAP-DATA-OVERTURE — keyless OSM building footprints via the public
        // Overpass API, for the richer 2D + 3D context buildings (apps/editor/src/
        // ui/geospatial/contextBuildings.ts). The browser POSTs an Overpass-QL
        // bbox query and reads the GeoJSON-ish JSON. Overture ships as GeoParquet
        // (not browser-direct) so OSM/Overpass is the keyless path; its Buildings
        // theme is largely OSM-derived anyway. ENTERPRISE FOLLOW-ON: a self-hosted
        // Overpass or a keyed Overture-PMTiles provider replaces these origins.
        'https://overpass-api.de',
        'https://overpass.kumi.systems',
    ];

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
// 'unsafe-eval' is required by Three.js shader compilation and Cesium's internal
// eval() usage.  Tracked for removal in Phase J (ADR-047 WebGPU worker migration)
// once the remaining shader-eval paths are eliminated.
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
