# C51 — Apex/App Deployment Split

> **Stamp**: 2026-06-02 · **Status**: CANONICAL (ratified 2026-06-02 via [ADR-055](../adrs/ADR-055-one-pryzm-cloudflare-supabase.md))
> **Authority**: this contract is the **normative form** of [ADR-055 §0](../adrs/ADR-055-one-pryzm-cloudflare-supabase.md). When ADR-055 and this contract disagree, **this contract wins** (per the conflict-resolution hierarchy in [CLAUDE.md](../../../CLAUDE.md) + [README.md](./README.md): contract suite > ADR).
> **Scope**: governs PRYZM's **hosting topology** — the rule that there is exactly ONE codebase (`apps/editor/`) emitting exactly TWO build artifacts (`pnpm build:apex` → static apex; `pnpm build:app` → SPA + server), the binding MUST / MUST NOT clauses on each surface (cookies, CSP, region, routing, PII tier, script origin), the DNS table that pins each subdomain to its surface, the routing table that decides which route belongs to which surface, the build contract, and the CI gates that enforce the boundary so the drift trap retired by ADR-055 cannot recur.
> **Constraint reference**: [C08](./C08-COLLABORATION-AND-SECURITY.md) §1.1 + §3.1/§3.2 (auth identity + CRDT explicit conflict) · [C22](./C22-PRIVACY-AND-PII-TIER.md) §1.1/§1.3 (PII tier-tag + EU residency) · [C39](./C39-PRICING-AND-PLAN-TIERS.md) (single pricing surface via `@pryzm/entitlements`) · [C43](./C43-ACCESSIBILITY.md) §1.5 (`PRYZM_TOKENS` colour registry) · [C48](./C48-BACKUP-AND-DR.md) §1.1/§1.5 (RTO/RPO per data class) · [C49](./C49-MULTI-REGION-AND-SOVEREIGNTY.md) §1.2/§1.3 (EU primary in Phase A; same-sovereignty failover).
> **CI gates** (planned — declared here, authored in a follow-up PR): `check-no-product-routes-in-docs-site.mjs` · `check-apex-no-auth-cookies.mjs` · `check-app-strict-csp.mjs` · `check-apex-self-contained.mjs` · `check-route-surface-assignment.mjs`.
> **Owner**: Platform infrastructure · `@MarkHanoi`.
> **Parent ADR**: [ADR-055](../adrs/ADR-055-one-pryzm-cloudflare-supabase.md) (ratified 2026-06-02).
> **Supersedes**: [ADR-052](../adrs/ADR-052-docs-site-marketing-surface.md) (the parallel-marketing-codebase pattern this contract retires by construction).

---

## §1 — The architectural invariant

PRYZM is **one codebase** with **two deploy targets**:

1. **Apex** (`pryzm.so`) — static, pre-rendered, global edge. Serves public marketing routes only.
2. **App** (`app.pryzm.so`) — dynamic, SPA + server, regional. Serves the editor.

A single source tree (`apps/editor/src/`) emits both artifacts via two build commands (`pnpm build:apex` → `apps/editor/dist-apex/`; `pnpm build:app` → the SPA bundle the server hosts). This is non-negotiable; the alternative (a second marketing codebase) is the drift trap [ADR-052](../adrs/ADR-052-docs-site-marketing-surface.md) fell into and ADR-055 retired.

"One PRYZM" means one codebase + one source of truth for components, tokens, branding, copy. It says nothing about deploy targets. The apex/app split honours "one PRYZM" perfectly — same code, two output artifacts.

The pattern is the canonical SaaS deployment topology (motif.io / linear.app / vercel.com / supabase.com). Mixing the two surfaces — serving the editor on apex, or serving marketing on app — is a contract violation regardless of how convenient the local-dev shortcut looks.

---

## §2 — Apex contract (`pryzm.so`) — what it MUST and MUST NOT do

### §2.1 — MUST

#### §2.1.1 — Be statically pre-rendered HTML

The apex build MUST emit pure HTML with inline critical CSS. NO client JS framework MAY execute before first paint. A small progressive-enhancement bundle (CTA hover, mosaic scroll-reveal) MAY hydrate after first paint via `<script defer>` referencing apex-served assets only (per §2.2.4).

#### §2.1.2 — Serve sub-100 ms p95 first paint globally

The apex artifact lives on Cloudflare Pages' global edge. Measured p95 TTFB + first-contentful-paint MUST be < 100 ms from every Cloudflare PoP. NFT enforced in §7.

#### §2.1.3 — Be SEO-crawlable

Every apex route MUST emit semantic HTML readable by a JS-disabled crawler. `<title>` + `<meta name="description">` + Open Graph + Twitter cards MUST be present per route. The pre-render step MUST fail the build if the rendered HTML for any §5 apex route contains a `<div id="root"></div>` placeholder with no inlined content.

#### §2.1.4 — Honour [C43](./C43-ACCESSIBILITY.md) §1.5 a11y tokens

Every colour hex used in the apex HTML MUST match a value in `packages/a11y-tokens/src/tokens.ts`. The duplicated hex literals from [ADR-052](../adrs/ADR-052-docs-site-marketing-surface.md) §3 (where the Astro mirror hardcoded `#5a4282` while the editor shipped `#6600FF`) are forbidden by construction — the pre-render reads tokens from the package, not from a snapshot.

#### §2.1.5 — Use ONLY the editor's component source

Apex MUST consume `apps/editor/src/ui/platform/LandingPage.ts`, `PricingPage.ts`, `SolutionsPage.ts`, `ResourcesPage.ts` (and successors) as its component source. NO parallel CSS, HTML, or copy MAY exist outside that tree. A parallel marketing source — e.g. `apps/docs-site/src/pages/index.astro` — is a CONTRACT VIOLATION; the planned `check-no-product-routes-in-docs-site.mjs` gate (§7) refuses any PR re-introducing it.

#### §2.1.6 — Honour [C39](./C39-PRICING-AND-PLAN-TIERS.md) single pricing surface

The `/pricing` route MUST render from `@pryzm/entitlements` (`packages/entitlements/src/pricingPage.ts`). The JSON-snapshot pattern from ADR-052 §1.4 (`scripts/build/gen-docs-site-pricing.mjs` → `apps/docs-site/src/data/pricing.json`) is retired; the apex build calls the resolver at build time and inlines the resolved table into static HTML.

### §2.2 — MUST NOT

#### §2.2.1 — Set or read any auth cookie

Apex traffic is anonymous by contract. The apex MUST NOT issue a `Set-Cookie` header that scopes to `pryzm.so` (parent) nor read `Cookie: session=...`. Any auth surface — sign-in, sign-up, "continue as <name>" — MUST 30x-redirect to `app.pryzm.so/<surface>`. The planned `check-apex-no-auth-cookies.mjs` gate (§7) refuses any PR adding cookie operations to apex code paths.

#### §2.2.2 — Issue any database query

The apex is read-only HTML. NO `pg.query()`, NO `supabase.from(...).select()`, NO `fetch('/api/...')` to a same-origin endpoint that touches the DB. The pre-render step MAY read `@pryzm/entitlements` build-time constants; it MAY NOT open a Supabase / Postgres client.

#### §2.2.3 — Carry any PII per [C22](./C22-PRIVACY-AND-PII-TIER.md) §1.1

The apex is `DataTier = 'derived'` (public marketing content). The C22 §1.1 tier-tag-at-write rule means any PII reaching apex (e.g. an email leaked into a meta tag, a user id leaked into a Open Graph image URL) MUST be rejected at the pre-render step. PII writes WITHOUT the `'pii'` tag MUST reject at the `StorageRouter` per C22; the apex build path MUST never even reach it.

#### §2.2.4 — Embed `<script src="...">` referencing the app subdomain

Apex MUST be self-contained: every `<script>`, `<link>`, `<img>`, `<style>` URL referenced from apex HTML MUST resolve to `pryzm.so` or to a CDN allowlisted in the apex CSP (`_headers`). A `<script src="https://app.pryzm.so/assets/bundle.js">` couples apex availability to the app deploy and violates the §1.7 ADR-055 reliability claim ("marketing survives app maintenance"). The planned `check-apex-self-contained.mjs` gate (§7) lints the rendered HTML for cross-origin script tags.

#### §2.2.5 — Embed user-specific or logged-in content

NO personalisation. NO "Welcome back, $name". NO "Continue your trial" CTA tailored from a cookie. The apex renders the same bytes for every visitor in a given Cloudflare PoP. Personalisation belongs to `app.pryzm.so`.

#### §2.2.6 — Run a Supabase / Stripe webhook handler

Apex MUST NOT accept POSTs. Apex is GET-only (HEAD + OPTIONS permitted for CDN behaviour). Stripe webhooks, OAuth callbacks, AI worker callbacks, marketplace callbacks — all of them — terminate at `app.pryzm.so` or `api.pryzm.so`, never at apex.

---

## §3 — App contract (`app.pryzm.so`) — what it MUST and MUST NOT do

### §3.1 — MUST

#### §3.1.1 — Serve from the contract-mandated region

App MUST run in the region set by [C22](./C22-PRIVACY-AND-PII-TIER.md) §1.3 + [C49](./C49-MULTI-REGION-AND-SOVEREIGNTY.md) §1.2. Phase A pins to `fra` (Frankfurt) on Fly + Supabase `eu-central-1` per ADR-055 §5 amendment 1. Phase B onward, per-org region binding (C49 §1.1) overrides the global default. A Phase A deployment to `iad` or `lhr` is a CONTRACT VIOLATION until C49 §1.2 multi-region lands.

#### §3.1.2 — Enforce a strict CSP

App MUST serve:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval';
  style-src 'self';
  img-src 'self' data: https:;
  connect-src 'self' https://api.pryzm.so wss://app.pryzm.so;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
```

`unsafe-inline` is forbidden. `unsafe-eval` is forbidden. `script-src` is `'self'` only (plus `'wasm-unsafe-eval'` for the WebAssembly-compiled geometry kernel). The planned `check-app-strict-csp.mjs` gate (§7) lints both `server.js` and the SPA build for any path that emits an inline `<script>` without a nonce, an inline `style="..."` attribute on a server-rendered surface, or a CSP header without `default-src 'self'`.

Apex MAY ship a more permissive CSP (its threat surface is smaller — no auth, no DB, no PII). The strict CSP is an APP-side invariant.

##### §3.1.2.1 — Implementation status (2026-06-02 audit)

The app's CSP is emitted by [`server/securityHeaders.js`](../../../server/securityHeaders.js) via helmet 8 (`useDefaults` on, so `base-uri 'self'` · `form-action 'self'` · `object-src 'none'` are already present; CSP is enforce-mode in prod, report-only in dev). Today's **production** policy vs the §3.1.2 target:

| Directive | §3.1.2 target | Current prod | Status |
|---|---|---|---|
| `default-src` | `'self'` | `'self'` | ✅ met |
| `frame-ancestors` | `'none'` | `'none'` | ✅ met |
| `base-uri` / `form-action` | `'self'` | `'self'` (helmet default) | ✅ met |
| `object-src` | — | `'none'` (helmet default) | ✅ stronger |
| `script-src` | `'self' 'wasm-unsafe-eval'` | `'self' 'unsafe-eval' blob:` | ❌ **blocked** |
| `style-src` | `'self'` | `'self' 'unsafe-inline' https://fonts.googleapis.com` | ❌ **blocked** |
| `connect-src` | `'self' https://api.pryzm.so wss://app.pryzm.so` | `'self' data: blob: cesium-ion(×3) *.supabase.co wss: ws: [CF_WORKER_URL]` | ⚠️ **contract too narrow** |

Three things block flipping to the literal §3.1.2 policy — none is a quick edit:

1. **`script-src 'unsafe-eval'` → `'wasm-unsafe-eval'`.** `'unsafe-eval'` is currently required by Three.js shader compilation + Cesium's internal `eval()` (documented in `securityHeaders.js:83-90`). Tracked for removal in **Phase J** (ADR-047 WebGPU worker migration). Flipping it now breaks 3D rendering + geospatial. Needs a full-app run to verify after the eval paths are gone.
2. **`style-src 'unsafe-inline'` → `'self'`.** The editor injects its theme as a runtime `<style>` block (`injectAppTheme()` in `apps/editor/src/ui/styles/AppTheme.ts`). Removing `'unsafe-inline'` requires migrating CSS-in-JS to a hashed/nonce'd stylesheet or an external `.css` link. Non-trivial; needs its own slice.
3. **`connect-src` — the contract list is unrealistic.** §3.1.2's `connect-src` omits origins the real app legitimately needs: Cesium ion (`api/assets/ionfetch.cesium.com`, C12 geospatial), Supabase (`*.supabase.co`), the CF AI-worker relay, and `ws:`/`wss:` for Socket.io collaboration (C08 §3). **DECISION NEEDED**: either (a) amend §3.1.2's `connect-src` to enumerate these, or (b) proxy all of them through `api.pryzm.so` so `'self' https://api.pryzm.so` suffices. Until decided, the current broad `connect-src` is correct-for-the-app and the literal contract value would break geospatial + persistence + AI + collaboration.

Therefore `check-app-strict-csp` (§7) stays **deferred** — it cannot pass until (1)+(2) ship and (3) is resolved. This note is the closure roadmap; flipping any row above is its own tested PR.

##### §3.1.2.2 — `connect-src` resolution (RECOMMENDED — pending owner ratification)

Blocker (3) above is a genuine A-vs-B decision. Resolved per-origin rather than globally, because "proxy everything through `api.pryzm.so`" (Option B) is correct for some origins and an anti-pattern for others:

| Origin (current) | Resolution | Why |
|---|---|---|
| AI worker (`CF_WORKER_URL`) | **B — already same-origin; DROP from `connect-src`** | The browser already calls the BFF `/api/anthropic/v1/messages` (same-origin), never the CF URL directly (`securityHeaders.js:63-65`). The entry is dead forward-compat weight — removing it tightens the policy at zero cost. |
| Cesium ion (`api`/`assets`/`ionfetch.cesium.com`) | **A — enumerate** | Terrain/imagery tile streaming (C12). Proxying map tiles through your own origin is a known anti-pattern: it adds latency, bandwidth cost, and breaks ion's signed-URL CDN caching. Direct browser→CDN is the designed path. |
| Supabase (`*.supabase.co`) | **A — enumerate, but TIGHTEN the wildcard** | Supabase REST + realtime are RLS-protected and designed for direct browser access; proxying realtime re-implements a websocket relay for no gain (and Phase D moves CRDT to Cloudflare DO anyway). Replace `*.supabase.co` with the specific project ref `https://<ref>.supabase.co` + `wss://<ref>.supabase.co`. |
| `ws:` / `wss:` (Socket.io) | **A — scope to the app origin** | Collaboration transport (C08 §3). The blanket `ws:`/`wss:` should narrow to `wss://app.pryzm.so` (prod) — already the §3.1.2 literal value's intent. |
| `data:` / `blob:` | **keep** | Used by `fetch()` of inline/worker-generated payloads; low exfil risk, no first-party alternative. |

**Recommended amended §3.1.2 `connect-src`** (replaces line 103's literal value):

```
connect-src 'self'
  https://api.pryzm.so wss://app.pryzm.so
  https://api.cesium.com https://assets.cesium.com https://ionfetch.cesium.com
  https://<supabase-ref>.supabase.co wss://<supabase-ref>.supabase.co
  data: blob:;
```

**Net:** the "strict" posture is preserved where it matters — the real XSS-exfil tightening is the `script-src` (no `unsafe-eval`) and `style-src` (no `unsafe-inline`) work, blockers (1)+(2). `connect-src` to a short list of scoped, reputable, contractually-required CDNs is the correct end state; the only true tightening available is dropping the dead AI entry (done above) and de-wildcarding Supabase. This is **the smaller of the two changes** and does NOT require a full-app run — it can ship the moment the owner ratifies it (then `securityHeaders.js`'s `CONNECT_SRC` drops `CF_WORKER_URL`, narrows `*.supabase.co` + `ws:`/`wss:`, and §3.1.2's normative block is updated to match). `check-app-strict-csp` still waits on (1)+(2).

#### §3.1.3 — Honour [C08](./C08-COLLABORATION-AND-SECURITY.md) §1.1 auth invariants

App MUST issue PRYZM's custom JWT via `server/authStore.js` using `SESSION_SECRET` (HMAC-SHA256, 7-day lifetime per C08 §1.1). App MUST NOT use Supabase Auth's JWT issuance until [ADR-056](../adrs/ADR-056-supabase-auth-migration.md) ratifies the migration (sequenced AFTER Phase A close — see ADR-055 §3 row "A.5"). Until ADR-056 lands, any code path that calls `supabase.auth.signIn()` / `supabase.auth.signUp()` is a contract violation.

#### §3.1.4 — Scope auth cookies to `app.pryzm.so`

Every cookie issued by the app MUST carry:

```
Domain=app.pryzm.so; Path=/; HttpOnly; Secure; SameSite=Lax
```

`Domain=.pryzm.so` (parent) is forbidden — it would leak the session cookie onto apex requests and violate §2.2.1. `SameSite=None` is forbidden unless the request is a documented cross-site flow (Stripe redirect, OAuth callback) and is enumerated in the runbook.

#### §3.1.5 — Implement [C48](./C48-BACKUP-AND-DR.md) §1.1 / §1.5 RTO + RPO

App's persistence layer MUST be Supabase Pro with PITR enabled (≥ 2-minute granularity, 7-day retention) to meet C48 §1.1 CLASS-1 RPO ≤ 5 min and CLASS-2 (billing) RTO ≤ 30 min. The free-tier daily-snapshot fallback is acceptable for Phase A pre-paying-customer ONLY (ADR-055 §2 "Honest baseline"); a deployment serving a paying tenant on free-tier Supabase is a C48 audit violation.

#### §3.1.6 — Pre-flight the production-hardening checklist before each deploy

Every app deploy MUST pass the 15 gates in [`docs/05-guides/deployments/PRODUCTION-HARDENING-CHECKLIST.md`](../../05-guides/deployments/PRODUCTION-HARDENING-CHECKLIST.md). Skipping the checklist (e.g. "hotfix, deploy fast") is a contract violation; if the deploy is urgent, a documented exception MUST land in the same PR as the deploy commit.

#### §3.1.7 — Preserve [C08](./C08-COLLABORATION-AND-SECURITY.md) §3.2 explicit CRDT conflicts

When Phase D moves CRDT sync to Cloudflare Durable Objects (ADR-055 §3 row "D"), the server-side `Y.applyUpdate` merge MUST continue to surface `SyncSlot.status = 'CONFLICTED'` + drive `ConflictResolutionDialog` per C08 §3.1 Wave A19. Silent LWW overwrite is forbidden; the parity-tested cutover (ADR-055 §3 row "D" risk gate) is binding.

### §3.2 — MUST NOT

#### §3.2.1 — Serve marketing routes

App MUST NOT respond 200 to `/pricing`, `/manifesto`, `/trust`, `/solutions`, `/resources`, or any other §5 apex route. Those belong to apex. App MAY redirect a stray request to the apex equivalent (e.g. `app.pryzm.so/pricing → 301 → pryzm.so/pricing`), but MUST NOT render the marketing surface in-place. The planned `check-route-surface-assignment.mjs` gate (§7) enforces this against `apps/editor/src/ui/platform/PlatformRouter.ts`.

#### §3.2.2 — Be reachable from apex DNS

`pryzm.so` MUST resolve to Cloudflare Pages (the apex artifact). `pryzm.so` MUST NOT CNAME to `pryzm.fly.dev` (the app). The DNS table in §4 is normative; any deviation in the Cloudflare dashboard is a CONTRACT VIOLATION and the DNS map drift is the first thing to check during a "marketing looks broken" incident.

#### §3.2.3 — Issue cookies scoped to the parent domain

`Set-Cookie: ...; Domain=.pryzm.so` is forbidden — see §3.1.4. A cookie scoped to the parent domain leaks the session onto apex requests, violates §2.2.1, and breaks the §1 reliability promise.

#### §3.2.4 — Embed apex-mirrored marketing copy

If a marketing page changes — copy, layout, pricing tier — the change ships via the apex build's pre-render step consuming the canonical editor component (LandingPage.ts, PricingPage.ts, ...). Hand-mirrored copy in app code, in apex-only HTML files, or in a separate marketing CMS is forbidden. The single source of truth is the editor's `apps/editor/src/ui/platform/` tree.

---

## §4 — DNS contract

The following DNS map is normative. Every entry MUST resolve as specified; deviations are CONTRACT VIOLATIONS.

| FQDN | Surface | Resolves to (Phase A) | Phase B+ | Notes |
|---|---|---|---|---|
| `pryzm.so` | **apex** | Cloudflare Pages (`pryzm.pages.dev`) | Cloudflare Pages | Static, pre-rendered. NEVER carries auth, NEVER hits Supabase. Global edge. |
| `www.pryzm.so` | redirect | 301 → `pryzm.so` | 301 → `pryzm.so` | Permanent redirect; preserves canonical apex URL. |
| `app.pryzm.so` | **app** | Fly.io (`pryzm.fly.dev`, region `fra`) | Cloudflare Pages + Functions | THE editor. Strict CSP. EU region. Cookies scoped here. |
| `api.pryzm.so` | **app** | Fly.io (alias of `app.pryzm.so`) | Pages Functions | API alias so the SPA at app can call the API without same-origin gymnastics. |
| `docs.pryzm.so` | docs | Cloudflare Pages (Astro Starlight) | Cloudflare Pages | Developer docs ONLY (Plugin SDK / REST API / Headless / Self-Host). MUST NOT serve any customer-facing route. |
| `marketplace.pryzm.so` | reserved | unconfigured | Cloudflare Pages | Plugin marketplace SPA (apps/marketplace-web/, Sprint 9+). |
| `staging.pryzm.so` | ephemeral | Cloudflare Pages branch previews | unchanged | Each PR gets `<pr-N>.pryzm-staging.pages.dev`. |
| `eu.pryzm.so` / `uk.pryzm.so` | reserved | unconfigured | per [C49](./C49-MULTI-REGION-AND-SOVEREIGNTY.md) §1.13 | Multi-region failover; sovereignty-bounded. |

### §4.1 — DNS rules (MUST)

- §4.1.1 `pryzm.so` MUST resolve to a Cloudflare Pages project (the apex artifact). Never to Fly, never to a Supabase Edge Function, never to a custom origin.
- §4.1.2 `app.pryzm.so` and `api.pryzm.so` MUST resolve to the app artifact (Fly in Phase A; Cloudflare Pages + Functions in Phase B+).
- §4.1.3 TLS for every entry MUST be Cloudflare-auto-provisioned (no manual cert work; no cert sprawl).
- §4.1.4 `docs.pryzm.so` MUST be a separate Cloudflare Pages project from the apex; mixing them couples docs releases to marketing releases.

### §4.2 — DNS rules (MUST NOT)

- §4.2.1 `pryzm.so` MUST NOT CNAME to the app. Apex on Fly violates the §1 reliability invariant (app maintenance window = marketing offline).
- §4.2.2 `app.pryzm.so` MUST NOT resolve to Cloudflare Pages WITHOUT Functions in Phase A (the API needs a Node runtime; the Phase B Pages-Functions cutover is gated on each route's parity test per ADR-055 §3 row "C").
- §4.2.3 `docs.pryzm.so` MUST NOT serve any of the §5 apex routes (no mirror, no embedded `<iframe>`, no JSON proxy).

---

## §5 — Routing contract — which routes belong where

Every customer-reachable URL is assigned to exactly one surface. Adding a new route requires a §5 amendment + the appropriate CI gate update.

| Route | Surface | Why |
|---|---|---|
| `/` | apex | Marketing landing — must rank for SEO; sub-100 ms first paint globally. |
| `/pricing` | apex | Marketing tier comparison — must rank; renders from `@pryzm/entitlements` (C39 §1.x single pricing surface). |
| `/manifesto` | apex | Brand narrative; pre-rendered HTML. |
| `/trust` | apex | Trust pillars + retention table; no PII (C22 derived tier). |
| `/solutions` | apex | Per-discipline marketing; static. |
| `/resources` | apex | Resource hub; static. |
| `/contact` | apex | Static form that POSTs to `api.pryzm.so/forms/contact`. |
| `/sign-in` | app | Auth entry — needs SESSION_SECRET-signed cookie + Supabase user lookup. |
| `/signup` | app | Auth + RAC interview (the editor's pre-auth onboarding surface per ADR-055 §0). |
| `/projects` | app | User's project list — requires auth. |
| `/projects/:id` | app | Canvas — requires auth + Yjs sync + WebGL2. |
| `/api/*` | app | All API routes — auth-gated, DB-touching, AI-proxying. |
| `/admin/*` | app | Owner / ops dashboards (entitlement-gated). |
| Stripe webhook | app | `api.pryzm.so/webhooks/stripe` — raw-body verified (per ADR-055 §3 amendment 5). |
| OAuth callback | app | `api.pryzm.so/oauth/{google,microsoft}/callback` — uses PKCE per [C08](./C08-COLLABORATION-AND-SECURITY.md) §1.3. |
| Plugin marketplace listings | `marketplace.pryzm.so` | Separate SPA; out of apex/app scope (own contract). |
| Developer SDK docs | `docs.pryzm.so` | Astro Starlight; out of apex/app scope. |

### §5.1 — Route ambiguity resolution

If a route's purpose is genuinely ambiguous (e.g. a future `/pricing/calculator` that needs a live entitlement lookup), the FIRST resolution is "split it" — `/pricing` stays apex with a static call-to-action linking to `app.pryzm.so/pricing/calculator`. The SECOND resolution is to amend §5 with the new row + a written rationale in the PR. NEVER serve the same route from both surfaces; see §8.

### §5.2 — Signup flow (the canonical user journey)

1. User on `pryzm.so/` clicks "Build something →".
2. Apex emits `<a href="https://app.pryzm.so/signup">` — a hard cross-domain link, NOT a SPA route.
3. Browser loads `app.pryzm.so/signup`; the app issues its own JS bundle, its own cookies, its own CSP.
4. RAC chatbot runs INSIDE `app.pryzm.so` (it is the editor's pre-auth onboarding).
5. After RAC capture → project created → user lands on `app.pryzm.so/projects/<id>`.

Crossing the apex→app boundary is a full page load by design. Same-origin SPA navigation between apex and app is impossible (different subdomains, different CSPs, different cookie scopes) — this is a feature, not a limitation.

---

## §6 — Build contract

### §6.1 — `pnpm build:apex`

- §6.1.1 Pre-renders the §5 apex routes to static HTML via the pre-render step (Vite + a static-route emitter; implementation owned by `scripts/build/build-apex.mjs`, to be authored under ADR-055 Phase A).
- §6.1.2 Emits to `apps/editor/dist-apex/` — one `.html` per route, plus a small `assets/` tree (CSS, fonts, images).
- §6.1.3 MUST emit a bundle ≤ 200 KB total (gzipped), measured by `check-apex-size.mjs` (planned). The 200 KB ceiling is the budget that delivers §2.1.2's sub-100 ms first paint.
- §6.1.4 MUST include a `_headers` file (Cloudflare Pages CSP for apex — the permissive variant per §2.1) and a `_redirects` file (www → apex, `/old-pricing` → `/pricing`, etc.).
- §6.1.5 MUST consume `apps/editor/src/ui/platform/` as the component source — no `apps/docs-site/` imports.

### §6.2 — `pnpm build:app`

- §6.2.1 Vite builds the editor SPA — the full editor surface (canvas + panels + plugins + AI host).
- §6.2.2 Emits to `dist/` (the conventional Vite output) — consumed by `server.js` in production via `express.static('dist')`.
- §6.2.3 MUST run the existing `tsc --skipLibCheck` typecheck step before Vite (per the top-level `npm run build` recipe).
- §6.2.4 MUST emit with `NODE_OPTIONS=--max-old-space-size=6144` (the editor build is memory-hungry — per `CLAUDE.md`).
- §6.2.5 MUST emit the strict CSP per §3.1.2 in both `index.html` `<meta>` and the Express middleware response headers.

### §6.3 — Single source of truth

Both builds consume `apps/editor/src/` and ONLY `apps/editor/src/`. After ADR-055 Phase A close (the Astro retirement; see [ASTRO-RETIREMENT-PLAN-2026-Q3.md](../../05-guides/deployments/ASTRO-RETIREMENT-PLAN-2026-Q3.md)), `apps/docs-site/src/pages/*.astro` MUST be deleted (or reduced to developer-docs-only content per ADR-055 §7). No build step MAY consume `apps/docs-site/src/pages/` as a marketing source.

### §6.4 — Reproducibility

A given commit SHA MUST produce byte-identical `dist-apex/` outputs on every CI run (no `Date.now()` in the pre-render; no random ids in the HTML). The app bundle MAY include a build-time stamp (commit SHA, ISO date) embedded in a `<meta name="pryzm-build" content="...">` tag for support diagnosis.

---

## §7 — CI gates that enforce this contract

Each gate is hard-fail on the production branch. **Five** gates are **LIVE** as of 2026-06-02 — the three apex-output gates (`npm run check:apex`) + `check-no-product-routes-in-docs-site` (`npm run check:docs-site`) + `check-route-surface-assignment` (`npm run check:route-surface`); all run by the `apex-gates` CI job. The remaining two are **planned**: `check-app-strict-csp` would false-fail until the Fly CSP lands (3 blockers — see §3.1.2.1), and `check-dns-map-honoured` is a runtime DNS probe that needs live DNS.

| Gate | Path | Status | What it checks | Phase |
|---|---|---|---|---|
| `check-apex-self-contained` | `scripts/check/check-apex-self-contained.mjs` | ✅ **LIVE** (`npm run check:apex`) | Parses the rendered apex HTML for `<script src>` / `<link href>` / `<img src>` / `@import` whose URL host is `app.pryzm.so` (or any non-`pryzm.so` + non-allowlist host). Enforces §2.2.4. Current: 0 script tags, all assets same-origin. | Phase A |
| `check-apex-size` | `scripts/check/check-apex-size.mjs` | ✅ **LIVE** (`npm run check:apex`) | Sums gzipped byte size of `dist-apex/` (excludes `_headers`/`_redirects`/dotfiles); fails if > 200 KB. Enforces §6.1.3. Current: 21.2 KB (89% headroom). | Phase A |
| `check-apex-no-auth-cookies` | `scripts/check/check-apex-no-auth-cookies.mjs` | ✅ **LIVE** (`npm run check:apex`) | Scans the apex build output (`dist-apex/`) + the pre-render source for any `Set-Cookie` / `document.cookie` / `req.cookies` / `res.cookie(` usage (comment lines skipped). Enforces §2.2.1. | Phase A (with the first apex deploy) |
| `check-no-product-routes-in-docs-site` | `scripts/check/check-no-product-routes-in-docs-site.mjs` | ✅ **LIVE** (`npm run check:docs-site`, in the `apex-gates` CI job) | Fails any PR adding `apps/docs-site/src/pages/{index,pricing,manifesto,trust,start,solutions,resources}.astro` (or successors). Enforces §2.1.5 + §8 + the ADR-055 retirement. The 5 marketing pages + `gen-docs-site-pricing.mjs` + `pricing.json` were deleted (A.17.x.14); only `404.astro` remains in the docs-site. | Phase A close |
| `check-app-strict-csp` | `scripts/check/check-app-strict-csp.mjs` | ⚪ planned | Lints `server.js` middleware + the SPA build for inline `<script>` without nonce, `unsafe-inline` / `unsafe-eval` in the CSP header, missing `default-src 'self'`. Enforces §3.1.2. **Deferred — see the §3.1.2.1 audit: 3 blockers (Three.js/Cesium `unsafe-eval` → Phase J · CSS-in-JS `unsafe-inline` → nonce migration · `connect-src` contract-too-narrow decision). Cannot pass until those land.** | Phase A (gates the Fly deploy) |
| `check-route-surface-assignment` | `scripts/check/check-route-surface-assignment.mjs` | ✅ **LIVE** (`npm run check:route-surface`, in the `apex-gates` CI job) | Statically asserts `server.js` 301-redirects every apex marketing path (`/pricing` · `/manifesto` · `/trust`) to `APEX_ORIGIN` under an `app.pryzm.so` host guard, and that `apps/editor/src/router.ts` reaches in-app marketing via the `?page=` slot rather than owning an apex path. Enforces §3.2.1 + §5. Behaviour also tested in `security-gates-adr-055.test.ts` §5 (T5.1–T5.3). | Phase A |
| `check-dns-map-honoured` | runtime probe + alert | ⚪ planned | Periodic DNS resolution check against §4; alerts on a `pryzm.so` resolution drift (e.g. CNAME flipped to Fly). | Phase A close |

Once each remaining gate ships, its row MUST be amended (status flipped to LIVE, commit SHA referenced). Adding a new CI gate that touches the apex/app boundary requires a §7 amendment in the same PR.

---

## §8 — Conflict resolution

If apex and app serve different content for the same route, this is a CONTRACT VIOLATION — regardless of which surface "looks right". The resolution sequence:

1. Identify which surface the route belongs to per §5.
2. Retire the duplicate on the other surface — delete the file; do NOT keep "for backup".
3. Run the relevant §7 gate locally; confirm it passes.
4. Ship a single PR retiring the duplicate + a §10 change-log entry.

The drift trap ADR-052 fell into was exactly this — `apps/docs-site/src/pages/index.astro` and `apps/editor/src/ui/platform/LandingPage.ts` both rendered "the landing page", and they diverged within three days (colour palette, font, copy). The retirement sequence is binding: when in doubt, the editor's source wins, and the parallel surface is deleted.

If a §5 route is genuinely shared (e.g. `/legal/privacy` — public marketing AND embedded in the app's footer), the canonical answer is "apex owns it; the app links to apex". A route MUST NOT have two implementations.

### §8.1 — When the contract loses

A revised hosting topology (e.g. ADR-056-X "single-deploy" reversal, or a future "edge SSR" pattern that obviates the apex/app split) MUST land as a superseding ADR FIRST. Until the superseding ADR is ACCEPTED, this contract is binding even if engineers consider it obsolete.

### §8.2 — Subdomain proliferation guard

New subdomains (`portal.pryzm.so`, `api-v2.pryzm.so`, `internal.pryzm.so`) require a §4 amendment + a stated surface assignment (apex / app / docs / other). Provisioning a new subdomain in Cloudflare WITHOUT a §4 amendment is a contract violation; the on-call ops engineer's first response to "what is `foo.pryzm.so`?" is to check §4.

---

## §9 — What is NOT in this contract

- §9.1 The **Phase B → D execution sequence** — that is ADR-055 §3 (the migration runbook). C51 is the steady-state invariant; ADR-055 is the trajectory.
- §9.2 The **specific Cloudflare project naming / Fly app naming** — implementation detail of the runbook ([CLOUDFLARE-MIGRATION-RUNBOOK-2026-Q3.md](../../05-guides/deployments/CLOUDFLARE-MIGRATION-RUNBOOK-2026-Q3.md)).
- §9.3 The **content** of any marketing route — copy is owned by the marketing repository (which is `apps/editor/src/ui/platform/` per §6.3). C51 governs WHERE the content is served, not WHAT it says.
- §9.4 The **AI host endpoint topology** — `CF_WORKER_URL` lives in its own contract surface (C09).
- §9.5 The **plugin marketplace economics** — `marketplace.pryzm.so` is governed by [C40](./C40-MARKETPLACE-ECONOMICS.md), not here.
- §9.6 The **developer docs surface** — `docs.pryzm.so` is governed by C07 (Plugin SDK) + C31 (documentation authoring); C51 only states it MUST NOT carry customer-facing routes.
- §9.7 The **auth migration to Supabase Auth** — that is ADR-056 (planned, Phase A.5), not C51. C51 only states that until ADR-056 lands, C08 §1.1 (custom JWT) is binding.

---

## §10 — Change log

- **2026-06-02** — Ratified as the normative form of ADR-055 §0. First contract to govern PRYZM's hosting topology. Authored alongside ADR-055's amendment pass (4 critical contract conflicts caught + corrected) so the invariants the ADR ratified are now lifted into permanent contract form. CI gates §7 declared but not yet authored.

---

## §11 — Cross-reference summary

| Contract / ADR | Relationship |
|---|---|
| [ADR-052](../adrs/ADR-052-docs-site-marketing-surface.md) | SUPERSEDED by ADR-055 + this contract. The parallel-marketing-codebase pattern this contract retires by construction. |
| [ADR-055](../adrs/ADR-055-one-pryzm-cloudflare-supabase.md) | **PARENT** — C51 is the normative form of ADR-055 §0 (apex/app split) + §5 (DNS map). |
| [ADR-056](../adrs/ADR-056-supabase-auth-migration.md) | PLANNED — sequences the C08 §1.1 auth migration; C51 §3.1.3 binds until ADR-056 ratifies. |
| [C08](./C08-COLLABORATION-AND-SECURITY.md) | App MUST honour §1.1 (custom JWT) + §3.1/§3.2 (CRDT explicit conflict through Phase D). |
| [C22](./C22-PRIVACY-AND-PII-TIER.md) | Apex MUST NOT carry PII (§1.1 tier-tag); app MUST honour §1.3 (region residency — EU primary in Phase A). |
| [C39](./C39-PRICING-AND-PLAN-TIERS.md) | `/pricing` apex route MUST render from `@pryzm/entitlements` — single pricing surface. |
| [C43](./C43-ACCESSIBILITY.md) | Apex MUST honour §1.5 colour tokens (`PRYZM_TOKENS`) — no parallel hex literals. |
| [C48](./C48-BACKUP-AND-DR.md) | App's persistence MUST meet §1.1 / §1.5 RTO + RPO — Supabase Pro PITR for any paying-customer deployment. |
| [C49](./C49-MULTI-REGION-AND-SOVEREIGNTY.md) | App region binding MUST honour §1.2 (Phase A = EU primary) + §1.3 (per-class residency). |

---

*End — C51 Apex/App Deployment Split, 2026-06-02 — CANONICAL.*
