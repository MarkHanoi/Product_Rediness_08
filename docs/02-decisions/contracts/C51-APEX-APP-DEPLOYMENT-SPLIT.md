# C51 — Apex/App Deployment Split

> **Stamp**: 2026-06-02 · **Status**: CANONICAL (ratified 2026-06-02 via [ADR-0255](../adrs/ADR-0255-one-pryzm-cloudflare-supabase.md))
> **Authority**: this contract is the **normative form** of [ADR-0255 §0](../adrs/ADR-0255-one-pryzm-cloudflare-supabase.md). When ADR-0255 and this contract disagree, **this contract wins** (per the conflict-resolution hierarchy in [CLAUDE.md](../../../CLAUDE.md) + [README.md](./README.md): contract suite > ADR).
> **Scope**: governs PRYZM's **hosting topology** — the rule that there is exactly ONE codebase (`apps/editor/`) emitting exactly TWO build artifacts (`pnpm build:apex` → static apex; `pnpm build:app` → SPA + server), the binding MUST / MUST NOT clauses on each surface (cookies, CSP, region, routing, PII tier, script origin), the DNS table that pins each subdomain to its surface, the routing table that decides which route belongs to which surface, the build contract, and the CI gates that enforce the boundary so the drift trap retired by ADR-0255 cannot recur.
> **Constraint reference**: [C08](./C08-COLLABORATION-AND-SECURITY.md) §1.1 + §3.1/§3.2 (auth identity + CRDT explicit conflict) · [C22](./C22-PRIVACY-AND-PII-TIER.md) §1.1/§1.3 (PII tier-tag + EU residency) · [C39](./C39-PRICING-AND-PLAN-TIERS.md) (single pricing surface via `@pryzm/entitlements`) · [C43](./C43-ACCESSIBILITY.md) §1.5 (`PRYZM_TOKENS` colour registry) · [C48](./C48-BACKUP-AND-DR.md) §1.1/§1.5 (RTO/RPO per data class) · [C49](./C49-MULTI-REGION-AND-SOVEREIGNTY.md) §1.2/§1.3 (EU primary in Phase A; same-sovereignty failover).
> **CI gates** — see §7 for authoritative status. As of 2026-08-08 six of seven are LIVE: `check-no-product-routes-in-docs-site.mjs` · `check-apex-no-auth-cookies.mjs` · `check-apex-self-contained.mjs` · `check-apex-size.mjs` · `check-route-surface-assignment.mjs` · `check-dns-map-honoured.mjs`. Only `check-app-strict-csp.mjs` is still outstanding, and §3.1.2 describes its TARGET policy, not the deployed one — read §7 before relying on that section.
> **Owner**: Platform infrastructure · `@MarkHanoi`.
> **Parent ADR**: [ADR-0255](../adrs/ADR-0255-one-pryzm-cloudflare-supabase.md) (ratified 2026-06-02).
> **Supersedes**: [ADR-0252](../adrs/ADR-0252-docs-site-marketing-surface.md) (the parallel-marketing-codebase pattern this contract retires by construction).

---

## §1 — The architectural invariant

PRYZM is **one codebase** with **two deploy targets**:

1. **Apex** (`pryzm.so`) — static, pre-rendered, global edge. Serves public marketing routes only.
2. **App** (`app.pryzm.so`) — dynamic, SPA + server, regional. Serves the editor.

A single source tree (`apps/editor/src/`) emits both artifacts via two build commands (`pnpm build:apex` → `apps/editor/dist-apex/`; `pnpm build:app` → the SPA bundle the server hosts). This is non-negotiable; the alternative (a second marketing codebase) is the drift trap [ADR-0252](../adrs/ADR-0252-docs-site-marketing-surface.md) fell into and ADR-0255 retired.

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

Every colour hex used in the apex HTML MUST match a value in `packages/a11y-tokens/src/tokens.ts`. The duplicated hex literals from [ADR-0252](../adrs/ADR-0252-docs-site-marketing-surface.md) §3 (where the Astro mirror hardcoded `#5a4282` while the editor shipped `#6600FF`) are forbidden by construction — the pre-render reads tokens from the package, not from a snapshot.

#### §2.1.5 — Use ONLY the editor's component source

Apex MUST consume `apps/editor/src/ui/platform/LandingPage.ts`, `PricingPage.ts`, `SolutionsPage.ts`, `ResourcesPage.ts` (and successors) as its component source. NO parallel CSS, HTML, or copy MAY exist outside that tree. A parallel marketing source — e.g. `apps/docs-site/src/pages/index.astro` — is a CONTRACT VIOLATION; the planned `check-no-product-routes-in-docs-site.mjs` gate (§7) refuses any PR re-introducing it.

#### §2.1.6 — Honour [C39](./C39-PRICING-AND-PLAN-TIERS.md) single pricing surface

The `/pricing` route MUST render from `@pryzm/entitlements` (`packages/entitlements/src/pricingPage.ts`). The JSON-snapshot pattern from ADR-0252 §1.4 (`scripts/build/gen-docs-site-pricing.mjs` → `apps/docs-site/src/data/pricing.json`) is retired; the apex build calls the resolver at build time and inlines the resolved table into static HTML.

### §2.2 — MUST NOT

#### §2.2.1 — Set or read any auth cookie

Apex traffic is anonymous by contract. The apex MUST NOT issue a `Set-Cookie` header that scopes to `pryzm.so` (parent) nor read `Cookie: session=...`. Any auth surface — sign-in, sign-up, "continue as <name>" — MUST 30x-redirect to `app.pryzm.so/<surface>`. The planned `check-apex-no-auth-cookies.mjs` gate (§7) refuses any PR adding cookie operations to apex code paths.

#### §2.2.2 — Issue any database query

The apex is read-only HTML. NO `pg.query()`, NO `supabase.from(...).select()`, NO `fetch('/api/...')` to a same-origin endpoint that touches the DB. The pre-render step MAY read `@pryzm/entitlements` build-time constants; it MAY NOT open a Supabase / Postgres client.

#### §2.2.3 — Carry any PII per [C22](./C22-PRIVACY-AND-PII-TIER.md) §1.1

The apex is `DataTier = 'derived'` (public marketing content). The C22 §1.1 tier-tag-at-write rule means any PII reaching apex (e.g. an email leaked into a meta tag, a user id leaked into a Open Graph image URL) MUST be rejected at the pre-render step. PII writes WITHOUT the `'pii'` tag MUST reject at the `StorageRouter` per C22; the apex build path MUST never even reach it.

#### §2.2.4 — Embed `<script src="...">` referencing the app subdomain

Apex MUST be self-contained: every `<script>`, `<link>`, `<img>`, `<style>` URL referenced from apex HTML MUST resolve to `pryzm.so` or to a CDN allowlisted in the apex CSP (`_headers`). A `<script src="https://app.pryzm.so/assets/bundle.js">` couples apex availability to the app deploy and violates the §1.7 ADR-0255 reliability claim ("marketing survives app maintenance"). The planned `check-apex-self-contained.mjs` gate (§7) lints the rendered HTML for cross-origin script tags.

#### §2.2.5 — Embed user-specific or logged-in content

NO personalisation. NO "Welcome back, $name". NO "Continue your trial" CTA tailored from a cookie. The apex renders the same bytes for every visitor in a given Cloudflare PoP. Personalisation belongs to `app.pryzm.so`.

#### §2.2.6 — Run a Supabase / Stripe webhook handler

Apex MUST NOT accept POSTs. Apex is GET-only (HEAD + OPTIONS permitted for CDN behaviour). Stripe webhooks, OAuth callbacks, AI worker callbacks, marketplace callbacks — all of them — terminate at `app.pryzm.so` or `api.pryzm.so`, never at apex.

---

## §3 — App contract (`app.pryzm.so`) — what it MUST and MUST NOT do

### §3.1 — MUST

#### §3.1.1 — Serve from the contract-mandated region

App MUST run in the region set by [C22](./C22-PRIVACY-AND-PII-TIER.md) §1.3 + [C49](./C49-MULTI-REGION-AND-SOVEREIGNTY.md) §1.2. Phase A pins to `fra` (Frankfurt) on Fly + Supabase `eu-central-1` per ADR-0255 §5 amendment 1. Phase B onward, per-org region binding (C49 §1.1) overrides the global default. A Phase A deployment to `iad` or `lhr` is a CONTRACT VIOLATION until C49 §1.2 multi-region lands.

#### §3.1.2 — Enforce a strict CSP

App MUST serve:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval';
  style-src 'self';
  img-src 'self' data: https:;
  connect-src 'self' https://api.pryzm.so wss://app.pryzm.so
    https://api.cesium.com https://assets.cesium.com https://ionfetch.cesium.com
    https://<supabase-ref>.supabase.co wss://<supabase-ref>.supabase.co
    data: blob: wss:;   /* config-derived — see §3.1.2.2 (RATIFIED 2026-06-02) */
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
| `connect-src` | config-derived (§3.1.2.2) | `'self' data: blob: cesium-ion(×3) + derived `<ref>.supabase.co` + wss:` (ws: dev-only; AI entry dropped) | ✅ **ratified + implemented** (config-derived; residual: scope blanket `wss:`) |

Two blockers remain before `check-app-strict-csp` can pass (blocker 3 — `connect-src` — was **RESOLVED + shipped 2026-06-02**, see §3.1.2.2):

1. **`script-src 'unsafe-eval'` → `'wasm-unsafe-eval'`.** ⚠ **This row previously read *"required by Three.js shader compilation + Cesium's internal `eval()`… tracked for removal in Phase J (ADR-0247 WebGPU worker migration)"*. Both halves were wrong, and one of them was a guess wearing a citation.** Three.js does not eval anything (GLSL goes to `gl.shaderSource`, which `script-src` does not govern — measured 2026-08-07, zero `eval(`/`new Function(` in the 1.87 MB `vendor-three-*` chunk), so **Phase J / ADR-0247 was never the gating work**, and *"Cesium's internal `eval()`"* named no caller. The caller is now NAMED and the load-path half is CLOSED — see §3.1.2.3; the promotion criteria are §3.1.2.4.
2. **`style-src 'unsafe-inline'` → `'self'`.** The editor injects its theme as a runtime `<style>` block (`injectAppTheme()` in `apps/editor/src/ui/styles/AppTheme.ts`). Removing `'unsafe-inline'` requires migrating CSS-in-JS to a hashed/nonce'd stylesheet or an external `.css` link. Non-trivial; needs its own slice.
3. ~~**`connect-src`**~~ — **RESOLVED 2026-06-02** (§3.1.2.2): config-derived `buildConnectSrc` ships the exact `SUPABASE_URL`-derived origin (wildcard fallback), drops the dead AI entry, and makes insecure `ws:` dev-only. Residual (scope blanket `wss:`) deferred to a CSP-reporting-driven slice — see §3.1.2.2.

Therefore `check-app-strict-csp` (§7) stays **deferred** — it cannot pass until (1)+(2) ship (blocker 3 is done). This note is the closure roadmap; flipping `script-src`/`style-src` is its own tested PR (each needs a full-app run).

##### §3.1.2.3 — `script-src`: the eval callers, NAMED (MEASURED 2026-08-24 · L-10420 · lane CSP26)

§3.1.2.2 shipped the strict policy in the report-only slot precisely so this directive could be
narrowed *"from real production telemetry rather than guesswork"*. The founder read the first line
of that telemetry in his production console on **2026-08-24**:

> *"Evaluating a string as JavaScript violates the following Content Security Policy directive
> because `'unsafe-eval'` is not an allowed source of script: `"script-src 'self' 'wasm-unsafe-eval'
> blob:"`. The policy is report-only, so the violation has been logged but no further action has
> been taken."*

That is the **shadow** policy reporting, not the enforced one — nothing was broken. It is also the
first genuinely actionable datum this mechanism has produced, and it has now been resolved to a
file, a line and a column.

**Method (MEASURED, not grepped).** Headless Chromium was pointed at the shipped `dist/` behind the
shadow's exact `script-src`, and the DOM `securitypolicyviolation` event — which carries
`sourceFile` / `lineNumber` / `columnNumber` — was captured in both `report` and `enforce`
disposition. A static scan cannot see a minifier-renamed alias or a dynamically-built call; this
does not have that failure mode. (⚠ A grep *had* already been run here, on 2026-08-07, and its
conclusion — "Three.js does not eval" — was true but was mistaken for the whole answer. That is the
[[probe-can-be-wrong-three-ways]] discipline, and it is why the row above is rewritten rather than
extended.)

**THE CALLER**

```
directive=script-src  blocked=eval  source=/cesium/Cesium.js  line=17925  col=49
```

`dist/cesium/Cesium.js:17925:49` is the **Knockout 3.5.1** UMD prelude, vendored inside **CesiumJS
1.143.0** (`node_modules/cesium/Build/Cesium/Cesium.js`, byte 5628397):

```js
var t = this || (0,eval)("this")      // the classic "get the global object" idiom
```

The Cesium bundle carries a **top-level `"use strict"`** (byte 848), so inside that plain-called
IIFE `this` is `undefined`, the `||` does **not** short-circuit, and the indirect `eval` **runs at
module-evaluation time**. `vite-plugin-cesium` injects `<script src="/cesium/Cesium.js">` as the
**first, parser-blocking tag in `<head>`**, so it fires on **every page, including the marketing
landing page**, before anything else executes — exactly "the first line on load".

⭐ **This is world (a): a dependency we do not control. It is NOT cosmetic.** Measured in **enforce**
disposition, unpatched: the `EvalError` escapes the top-level IIFE, evaluation of the whole bundle
aborts, and **`typeof window.Cesium === 'undefined'`** — the entire geospatial subsystem is dead.
**Anyone promoting this policy to enforcing without this fix would have taken 3D Site down, and it
would have read as an unrelated outage.**

**THE FIX — and what was rejected.** `stripCesiumLoadTimeEvalPlugin()` in
[`vite.config.ts`](../../../vite.config.ts) (§CSP-CESIUM-KNOCKOUT-EVAL) rewrites the single
occurrence to `globalThis` after `vite-plugin-cesium` copies the bundle — semantics-preserving
(indirect `eval("this")` evaluates in global sloppy scope and returns the global object, which is
what `globalThis` *is*), **byte-length-preserving** so line/column offsets in this un-source-mapped
vendor bundle keep pointing where they did, and **fail-closed**: anything other than exactly one
occurrence throws and stops the build.

| Rejected | Why |
|---|---|
| Add `'unsafe-eval'` to the shadow | It is already granted in the **enforced** policy; the entire point is to remove it. ⛔ **CSP cannot scope `'unsafe-eval'`** — there is no per-script, per-hash or per-origin form of that keyword. "Grant it narrowly, just for Cesium" is not a thing that exists. |
| `pnpm patch cesium` | A unified diff over a 5.9 MB minified bundle whose hunk is one multi-megabyte line. Unreviewable, and it rots silently on a version bump. |
| `defer` / dynamic-`import()` Cesium (APPLICATION-PERFORMANCE-LEDGER §8.1 item 5) | **Delays** the eval; never removes it. Worth doing — for a different reason. |
| Swap the dependency | There is no substitute for the geospatial subsystem. Not a real option. |

**VERIFIED END-TO-END** through a real `vite build` with the plugin registered, then a browser load
of that output under the **ENFORCED** strict policy: **0 violations, 0 page errors, `window.Cesium`
present**, and `new Cesium.Viewer(...)` with PRYZM's exact options (`CesiumViewport.ts:2059` — every
Knockout widget disabled) constructs with **zero `script-src` violations**. So Cesium's *other*
Knockout eval (`parseBindingsString`, the data-bind compiler) is **not on PRYZM's path**.

##### §3.1.2.4 — Can `script-src` be PROMOTED to enforcing? **NOT YET — and this is exactly what blocks it**

⛔ **NO.** The app-shell load path is clean after §3.1.2.3, but the load path is not the app. The
same measurement enumerated everything else that can still `eval`, split honestly:

**BENIGN — measured, not blockers.** Each short-circuits or self-heals in a browser:

| Site | Shape | Why it is not a blocker |
|---|---|---|
| `vendor-dxf-*.js` | lodash `root` detection `Function("return this")()` | `self` is truthy first; the call is never evaluated. |
| `vendor-thatopen-*.js` ×2, `jszip.min-*.js` | `setimmediate` polyfill `new Function(""+S)` | Reached only if `setImmediate` is called with a **string**. Nothing does. |
| `packages/ai-host/src/workflows/VoiceCommand.ts:111`, `packages/constraint-solver/src/engine.ts:497` | **PRYZM's own — the only two** — `new Function('s','return import(s)')`, a deliberate bundler-opaque dynamic import | Both gated on an env var read from `process.env`, which the browser does not have; both return their mock **before** reaching the call. Delete them when those adapters ship. |
| `domain-engine-*.js` | **Zod 4.4.3** — a JIT capability probe `new Function("")` plus `Doc.compile()` validator codegen | ⭐ **Self-healing.** The probe sits inside Zod's own `try/catch`; under an enforced policy Zod reports once and falls back to its jitless interpreter. Measured: enforce + the Cesium fix = **1 report, 0 errors**. ⛔ We deliberately do **not** set `z.config({ jitless: true })` — that buys console quiet with a repo-wide validation slowdown *today*, while the enforced policy still permits the JIT. |

**REAL BLOCKERS — Emscripten `new Function` invoker codegen, which runs during embind type
registration (i.e. at WASM-module init, i.e. it would throw):**

| Chunk | Trigger |
|---|---|
| `vendor-rhino3dm-*.js` ×2 **and** `public/libs/rhino3dm/rhino3dm.js` ×2 | Rhino import (`RhinoImporter.ts:72`, `setLibraryPath('/libs/rhino3dm/')`) |
| `manifold-*.js` ×2 | boolean geometry |
| `cesium/Cesium.js` ×2 (bytes 2563266 / 2575513) | Cesium's own WASM glue |
| `index-DS-*.js` ×6 | `ndarray` typed-constructor codegen, lazy-loaded from the domain-engine chunk |

⚠ **None of these was exercised by the load-path measurement, and §3.1.2.2's own warning applies
verbatim: silence over a window that never ran them proves nothing.** The promotion criteria are
therefore explicit:

1. The Cesium load-path fix ships (**DONE** — §3.1.2.3).
2. The shadow is watched across a window that actually runs **an IFC import, a Rhino import, a
   boolean geometry op and a 3D-site session** — the four surfaces above.
3. Each `new Function` blocker either reports clean (the codegen is not reached) or is closed on its
   own terms. **`'unsafe-eval'` cannot be scoped, so there is no partial promotion** — the enforced
   `script-src` narrows all at once or not at all.
4. Only then does `SCRIPT_SRC_PROD` in `server/securityHeaders.js` become
   `["'self'", "'wasm-unsafe-eval'", 'blob:']`, and `check-app-strict-csp` (§7) loses blocker (1).

**Until then the enforced policy keeps `'unsafe-eval'` and the shadow keeps reporting.** ⭐ What
changed is that its reports are now a **named, catalogued** list instead of an open question: a
`script-src` report from a source **not in the tables above is a NEW eval caller** — most likely a
dependency bump — and must be treated as one.

##### §3.1.2.2 — `connect-src` resolution (RATIFIED + IMPLEMENTED 2026-06-02)

Blocker (3) above was a genuine A-vs-B decision. **Ratified** per-origin (not globally — "proxy everything through `api.pryzm.so`" is correct for some origins and an anti-pattern for others) and **implemented** in [`server/securityHeaders.js`](../../../server/securityHeaders.js) as the exported, unit-tested `buildConnectSrc(env, isProd)` (tests: `security-gates-adr-055.test.ts` §6, T6.1–T6.5). The policy is now **configuration-derived**, not a hand-maintained wildcard list:

| Origin (current) | Resolution | Why |
|---|---|---|
| AI worker (`CF_WORKER_URL`) | **B — already same-origin; DROP from `connect-src`** | The browser already calls the BFF `/api/anthropic/v1/messages` (same-origin), never the CF URL directly (`securityHeaders.js:63-65`). The entry is dead forward-compat weight — removing it tightens the policy at zero cost. |
| Cesium ion (`api`/`assets`/`ionfetch.cesium.com`) | **A — enumerate** | Terrain/imagery tile streaming (C12). Proxying map tiles through your own origin is a known anti-pattern: it adds latency, bandwidth cost, and breaks ion's signed-URL CDN caching. Direct browser→CDN is the designed path. |
| Supabase (`*.supabase.co`) | **A — enumerate, but TIGHTEN the wildcard** | Supabase REST + realtime are RLS-protected and designed for direct browser access; proxying realtime re-implements a websocket relay for no gain (and Phase D moves CRDT to Cloudflare DO anyway). Replace `*.supabase.co` with the specific project ref `https://<ref>.supabase.co` + `wss://<ref>.supabase.co`. |
| `ws:` / `wss:` (Socket.io) | **A — scope to the app origin** | Collaboration transport (C08 §3). The blanket `ws:`/`wss:` should narrow to `wss://app.pryzm.so` (prod) — already the §3.1.2 literal value's intent. |
| `data:` / `blob:` | **keep** | Used by `fetch()` of inline/worker-generated payloads; low exfil risk, no first-party alternative. |

**Implemented `connect-src` derivation** (`buildConnectSrc`, replaces the old hand-maintained array):

```
connect-src 'self' data: blob:
  https://api.cesium.com https://assets.cesium.com https://ionfetch.cesium.com
  https://thatopen.github.io   /* OBC engine HDR env-map CDN (RGBELoader) */
  https://<derived-from-SUPABASE_URL>  wss://<derived-from-SUPABASE_URL>
  wss:        /* + ws: in development only */
```

> **2026-06-03 — `thatopen.github.io` added** after the §3.1.2.2 report sink + a live console caught the OBC fragment engine fetching a default HDR env-map (`engineLauncher.ts` RGBELoader) — a report-only violation in dev that would *block* HDRI visual styles in prod. Low-risk allow (the loader degrades to `null` gracefully). Enterprise follow-on: self-host the `.hdr` under `/public` to drop the external dependency. This is exactly the evidence-based-narrowing/widening loop §3.1.2.2 designed for.

**Net:** the "strict" posture is preserved where it matters — the real XSS-exfil tightening is the `script-src` (no `unsafe-eval`) and `style-src` (no `unsafe-inline`) work, blockers (1)+(2), which still need the Phase-J eval removal + a nonce migration. The `connect-src` change shipped here is the **safe, verifiable** slice: it (a) drops the dead AI entry, (b) de-wildcards Supabase to the exact `SUPABASE_URL`-derived origin **with a wildcard fallback so a misconfig never CSP-blocks persistence**, and (c) restricts insecure `ws:` to development. It needed no full-app run because the logic is pure + unit-tested and degrades safely.

**Residual tightening (now instrumented — narrow from evidence, not guesswork):** the blanket `wss:` is still broader than ideal, as are `script-src`/`style-src` (blockers 1+2). Scoping any of them blind under the live Cloudflare→Fly chain could break 3D / persistence / collaboration for every user, so none is shipped on a guess. **CSP violation reporting now SHIPS** ([`server/cspReport.js`](../../../server/cspReport.js) + `report-uri` in `securityHeaders.js`, tests §7 T7.1–T7.4): the policy emits `report-uri /api/security/csp-report` in both enforce and report-only modes, and the sink logs each violation (rate-capped, both report shapes, 204-always). The path to closing `check-app-strict-csp` is now evidence-based: keep the safe policy enforced, watch the `[csp-report]` telemetry in production, and narrow `wss:` / remove `unsafe-eval` (after the Phase-J eval work) / remove `unsafe-inline` (after the `injectAppTheme` nonce migration) one directive at a time, each verified against real reports before it ships. A `report-to`/`Reporting-Endpoints` upgrade (the modern successor to the deprecated `report-uri`) is the one remaining enhancement.

#### §3.1.3 — Honour [C08](./C08-COLLABORATION-AND-SECURITY.md) §1.1 auth invariants

App MUST issue PRYZM's custom JWT via `server/authStore.js` using `SESSION_SECRET` (HMAC-SHA256, 7-day lifetime per C08 §1.1). App MUST NOT use Supabase Auth's JWT issuance until [ADR-0256](../adrs/ADR-0256-supabase-auth-migration.md) ratifies the migration (sequenced AFTER Phase A close — see ADR-0255 §3 row "A.5"). Until ADR-0256 lands, any code path that calls `supabase.auth.signIn()` / `supabase.auth.signUp()` is a contract violation.

#### §3.1.4 — Scope auth cookies to `app.pryzm.so`

Every cookie issued by the app MUST carry:

```
Domain=app.pryzm.so; Path=/; HttpOnly; Secure; SameSite=Lax
```

`Domain=.pryzm.so` (parent) is forbidden — it would leak the session cookie onto apex requests and violate §2.2.1. `SameSite=None` is forbidden unless the request is a documented cross-site flow (Stripe redirect, OAuth callback) and is enumerated in the runbook.

#### §3.1.5 — Implement [C48](./C48-BACKUP-AND-DR.md) §1.1 / §1.5 RTO + RPO

App's persistence layer MUST be Supabase Pro with PITR enabled (≥ 2-minute granularity, 7-day retention) to meet C48 §1.1 CLASS-1 RPO ≤ 5 min and CLASS-2 (billing) RTO ≤ 30 min. The free-tier daily-snapshot fallback is acceptable for Phase A pre-paying-customer ONLY (ADR-0255 §2 "Honest baseline"); a deployment serving a paying tenant on free-tier Supabase is a C48 audit violation.

#### §3.1.6 — Pre-flight the production-hardening checklist before each deploy

Every app deploy MUST pass the 15 gates in [`docs/05-guides/deployments/production-hardening-checklist.md`](../../05-guides/deployments/production-hardening-checklist.md). Skipping the checklist (e.g. "hotfix, deploy fast") is a contract violation; if the deploy is urgent, a documented exception MUST land in the same PR as the deploy commit.

#### §3.1.7 — Preserve [C08](./C08-COLLABORATION-AND-SECURITY.md) §3.2 explicit CRDT conflicts

When Phase D moves CRDT sync to Cloudflare Durable Objects (ADR-0255 §3 row "D"), the server-side `Y.applyUpdate` merge MUST continue to surface `SyncSlot.status = 'CONFLICTED'` + drive `ConflictResolutionDialog` per C08 §3.1 Wave A19. Silent LWW overwrite is forbidden; the parity-tested cutover (ADR-0255 §3 row "D" risk gate) is binding.

#### §3.1.8 — Bridge clean apex entry-paths to the SPA query parser ("§3.2.2" in `server.js`)

> **Server anchor:** the implementation of this clause is the `server.js` block tagged `// C51 §3.2.2 — clean entry-path routing (apex→app)`. It is the MUST-side counterpart to the §3.2.1 marketing guard (the `server.js` `C51 §3.2.1` block). This contract is the source of truth; the code label points back here.

The apex landing emits **clean, shareable** entry-paths on the app origin (no query string, no hash) — see §2.1.5 and the table in §3.2.1.1 below. The app server MUST translate each clean entry-path into the SPA's first-paint query form so that the editor's URL parser (`apps/editor/src/ui/platform/PlatformRouter.ts` initial-load block + `apps/editor/src/router.ts`) routes the visitor on first paint WITHOUT a pathname router.

The bridge MUST be a server-side **302** (temporary — the canonical surface is the `?page=` SPA, the path is only the entry handle), applied on **all hosts including `localhost`** so the full apex→app journey is testable locally before `app.pryzm.so` is live on Fly. (Contrast §3.2.1's marketing guard, which is host-GUARDED to `app.pryzm.so` because those paths belong to the apex, not the app.)

The normative clean-path → SPA-query map:

| Clean entry-path (app origin) | 302 target | SPA effect (PlatformRouter initial load) |
|---|---|---|
| `/signup` | `/?page=signup` | `showLanding()` + `showOnboarding()` — RAC onboarding canvas (A.5.f) |
| `/start` | `/?page=start` | `showLanding()` + `showOnboarding()` — RAC onboarding canvas (A.5.f) |
| `/sign-in` | `/?page=signin` | `showLanding()` + `showAuth()` — auth modal |
| `/contact` | `/` (landing root) | not yet built as an app surface — lands on the landing page |
| `/solutions` | `/` (landing root) | not yet built as an app surface — lands on the landing page |
| `/resources` | `/` (landing root) | not yet built as an app surface — lands on the landing page |

Notes that are part of the contract:

- **Signed-IN short-circuit.** For every `?page=` entry above, a signed-in visitor skips straight to the hub (`showHub`); the onboarding / auth surfaces are signed-OUT entry points only. This is the PlatformRouter initial-load behaviour, not a server concern.
- **`/contact`, `/solutions`, `/resources`** bridge to the landing root (`/`) rather than a `?page=` surface because those app surfaces are not built yet. The apex still links to them (§2.1.5) so the link map is stable; when the surfaces ship, this row gains a `?page=` target via a §3.1.8 amendment. They MUST NOT 404.
- **The brief hand-off (A.5.g).** The end-to-end journey is: apex `"Start here"` → `app.pryzm.so/signup` → §3.2.2 302 → `/?page=signup` → SPA boots → RAC onboarding captures the 4-question brief → auth modal → post-auth the captured brief is stashed (`getCapturedBrief()`) for project pre-load. The full "create a project + run apartment generation from the brief" step is currently a hook (it logs the brief); wiring it is tracked as A.5.g.
- **Marketing paths are NOT bridged here.** `/pricing`, `/manifesto`, `/trust` are apex-owned content routes; on the app host they are handled by §3.2.1 (host-guarded **301** to the apex), never by this §3.1.8 302 bridge. The two blocks are deliberately separate.

##### §3.1.8.1 — Single-source CTA mechanism (cross-reference §2.1.5)

The apex anchors and the editor buttons are emitted by ONE pure string builder, `apps/editor/src/ui/platform/landingMarkup.ts` (zero imports), called in two modes:

- `landingMarkup({ mode: 'app' })` — the editor's `LandingPage.build()`. CTAs are interactive `<button id=…>` with NO `href`; the editor's `addEventListener` wiring drives them.
- `landingMarkup({ mode: 'apex', appOrigin })` — the apex prerender (`scripts/build/prerender-apex.mjs`). CTAs become `<a href>` anchors. App-surface CTAs point at `${appOrigin}/<clean-path>`; apex-owned content routes (`/pricing`, …) stay root-relative.

This is the §2.1.5 single-source mechanism: the apex's clean entry-paths and the editor's CTA targets cannot drift because they are the same function. The exact CTA → clean-path map is fixed in `landingMarkup.ts` (`"Get started for free"` / `"Start here"` → `/signup`; `"Log in"` → `/sign-in`; `"Contact sales"` → `/contact`; Solutions → `/solutions`; Resources → `/resources`; Pricing / "See enterprise options" → root-relative `/pricing`).

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
- §4.2.2 `app.pryzm.so` MUST NOT resolve to Cloudflare Pages WITHOUT Functions in Phase A (the API needs a Node runtime; the Phase B Pages-Functions cutover is gated on each route's parity test per ADR-0255 §3 row "C").
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
| `/signup` | app | Auth + RAC interview (the editor's pre-auth onboarding surface per ADR-0255 §0). |
| `/projects` | app | User's project list — requires auth. |
| `/projects/:id` | app | Canvas — requires auth + Yjs sync + WebGL2. |
| `/api/*` | app | All API routes — auth-gated, DB-touching, AI-proxying. |
| `/admin/*` | app | Owner / ops dashboards (entitlement-gated). |
| Stripe webhook | app | `api.pryzm.so/webhooks/stripe` — raw-body verified (per ADR-0255 §3 amendment 5). |
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

### §5.3 — Entry-path routing table (clean path → SPA query, the §3.1.8 / `server.js` "§3.2.2" bridge)

Each clean entry-path the apex links to (§2.1.5 / §3.1.8.1) is bridged by the app server to the SPA's first-paint form. The marketing paths are listed in the same table for completeness — they take a different (§3.2.1, host-guarded 301) path and are NOT part of the §3.1.8 302 bridge.

| Path | Host scope | Behaviour | Target | Status |
|---|---|---|---|---|
| `/signup` | all hosts (incl. localhost) | 302 (§3.1.8) | `/?page=signup` → `showLanding()` + `showOnboarding()` (RAC, A.5.f) | normative; signed-in → hub |
| `/start` | all hosts (incl. localhost) | 302 (§3.1.8) | `/?page=start` → `showLanding()` + `showOnboarding()` (RAC, A.5.f) | normative; signed-in → hub |
| `/sign-in` | all hosts (incl. localhost) | 302 (§3.1.8) | `/?page=signin` → `showLanding()` + `showAuth()` | normative; signed-in → hub |
| `/contact` | all hosts (incl. localhost) | 302 (§3.1.8) | `/` (landing root) | normative; app surface not built yet — gains a `?page=` target on ship |
| `/solutions` | all hosts (incl. localhost) | 302 (§3.1.8) | `/` (landing root) | normative; app surface not built yet — gains a `?page=` target on ship |
| `/resources` | all hosts (incl. localhost) | 302 (§3.1.8) | `/` (landing root) | normative; app surface not built yet — gains a `?page=` target on ship |
| `/pricing` | `app.pryzm.so` only (host-guarded) | 301 (§3.2.1) | `${APEX_ORIGIN}/pricing` | apex-owned content route — NOT the §3.1.8 bridge |
| `/manifesto` | `app.pryzm.so` only (host-guarded) | 301 (§3.2.1) | `${APEX_ORIGIN}/manifesto` | apex-owned content route — NOT the §3.1.8 bridge |
| `/trust` | `app.pryzm.so` only (host-guarded) | 301 (§3.2.1) | `${APEX_ORIGIN}/trust` | apex-owned content route — NOT the §3.1.8 bridge |

The `/pricing`, `/manifesto`, `/trust` rows also have a SPA-side `?page=` representation (the editor renders them in-app via `showMarketing(page)` when reached as `/?page=pricing|manifesto|trust` — e.g. the apex pre-render deep-linking a customer to a marketing route on first paint, see `apps/editor/src/router.ts` `MarketingPage`). The 301 in this table is only the **stray-request-on-the-app-host** case (§3.2.1): a marketing PATH reaching `app.pryzm.so` is bounced to the apex because the apex owns the content.

---

## §6 — Build contract

### §6.1 — `pnpm build:apex`

- §6.1.1 Pre-renders the §5 apex routes to static HTML via the pre-render step (Vite + a static-route emitter; implementation owned by `scripts/build/build-apex.mjs`, to be authored under ADR-0255 Phase A).
- §6.1.2 Emits to `apps/editor/dist-apex/` — one `.html` per route, plus a small `assets/` tree (CSS, fonts, images).
- §6.1.3 MUST emit a **first-paint payload** ≤ 200 KB (gzipped), measured by `check-apex-size.mjs`. The 200 KB ceiling is the budget that delivers §2.1.2's sub-100 ms first paint.

  **§6.1.3.1 — Streamed-media carve-out (amended 2026-08-09).** Streamed media (`.mp4` / `.webm` / `.ogv` / `.mov` / `.m4v`) is measured on a SEPARATE budget of **24 MB raw** and is NOT charged against the 200 KB first-paint ceiling. Both budgets are hard-fail and both print on every gate run.

  This amendment lands with the founder's full-bleed hero video (a 1920×1080 / 92 s / 14.25 MB testing asset at `public/apex/hero.mp4`). It is a correction to what the gate MEASURES, not a relaxation of what §2.1.2 PROMISES. A `<video preload="metadata" poster=…>` contributes a metadata range request to first paint, not its body; the poster paints immediately and the body streams afterwards. Summing a progressive-download asset into a time-to-first-paint ceiling would fail pages that are genuinely fast, and would push the next contributor to delete the measurement rather than the megabytes.

  Two clauses that are NOT relaxed and constrain this carve-out:

  - **§2.1.2 still binds.** The carve-out changes the accounting, not the promise. If a hero video measurably degrades LCP or TTFB from a PoP, §2.1.2 is violated regardless of which budget the bytes were counted under.
  - **§2.2.4 still binds.** Media MUST be apex-served (`media-src 'self'`; no video CDN without an §2.2.4 allowlist entry + a §7 amendment). The apex CSP in `scripts/build/prerender-apex.mjs` gained `media-src 'self'` in the same change — without it `<source>` falls back to `default-src 'none'` and the video is silently blocked.

  **Open item for the founder, stated rather than buried:** 14.25 MB is a TESTING asset. Before this is a production hero it wants a short, hard-cut, ~1080p-or-720p, ≤ 3 MB encode (and ideally a `.webm` sibling). The 24 MB media budget is sized to notice the SECOND video, not to bless the first one forever.
- §6.1.4 MUST include a `_headers` file (Cloudflare Pages CSP for apex — the permissive variant per §2.1) and a `_redirects` file (www → apex, `/old-pricing` → `/pricing`, etc.).
- §6.1.5 MUST consume `apps/editor/src/ui/platform/` as the component source — no `apps/docs-site/` imports.

### §6.2 — `pnpm build:app`

- §6.2.1 Vite builds the editor SPA — the full editor surface (canvas + panels + plugins + AI host).
- §6.2.2 Emits to `dist/` (the conventional Vite output) — consumed by `server.js` in production via `express.static('dist')`.
- §6.2.3 MUST run the existing `tsc --skipLibCheck` typecheck step before Vite (per the top-level `npm run build` recipe).
- §6.2.4 MUST emit with `NODE_OPTIONS=--max-old-space-size=6144` (the editor build is memory-hungry — per `CLAUDE.md`).
- §6.2.5 MUST emit the strict CSP per §3.1.2 in both `index.html` `<meta>` and the Express middleware response headers.

### §6.3 — Single source of truth

Both builds consume `apps/editor/src/` and ONLY `apps/editor/src/`. After ADR-0255 Phase A close (the Astro retirement; see [astro-retirement-plan-2026-q3.md](../../05-guides/deployments/astro-retirement-plan-2026-q3.md)), `apps/docs-site/src/pages/*.astro` MUST be deleted (or reduced to developer-docs-only content per ADR-0255 §7). No build step MAY consume `apps/docs-site/src/pages/` as a marketing source.

### §6.4 — Reproducibility

A given commit SHA MUST produce byte-identical `dist-apex/` outputs on every CI run (no `Date.now()` in the pre-render; no random ids in the HTML). The app bundle MAY include a build-time stamp (commit SHA, ISO date) embedded in a `<meta name="pryzm-build" content="...">` tag for support diagnosis.

---

## §7 — CI gates that enforce this contract

Each gate is hard-fail on the production branch. **Six of seven are LIVE as of 2026-08-08.**

Five went live 2026-06-02 — the three apex-output gates (`npm run check:apex`) + `check-no-product-routes-in-docs-site` (`npm run check:docs-site`) + `check-route-surface-assignment` (`npm run check:route-surface`), all run by the `apex-gates` CI job.

**`check-dns-map-honoured` was authored 2026-08-08** (`scripts/check/check-dns-map-honoured.mjs`) once the §4 DNS map became real — `app.pryzm.so` and `api.pryzm.so` resolve to Fly with Fly-issued certs, and `pryzm.so` serves the apex from Cloudflare Pages. First run: **4/4 observed clean**. Two deliberate limits are stated in the gate itself rather than implied:

- It verifies **identity** (which surface answers on which host), not **provenance**. §4.1.1 ("Cloudflare Pages, never Fly") and §4.1.3 ("Cloudflare-auto TLS") are not reliably checkable from a response — sniffing `cf-ray` proves a Cloudflare *edge*, not a Cloudflare *origin*. Verifying those needs the Cloudflare API; tracked as a §7 follow-up.
- An **unreachable host SKIPS**, it does not fail. Only a host that ANSWERS as the wrong surface fails. A CI runner without egress is not evidence about DNS, and `DEPLOY-CONTRACT-MANUAL-FLY.md` §5.2 records what a check that can fail a healthy system costs. **The gate can prove a violation; it cannot prove compliance, and it prints that.**

⚠ **`check-app-strict-csp` remains the one gate NOT live, and §3.1.2 currently overstates reality.** That section says "`unsafe-inline` is forbidden. `unsafe-eval` is forbidden." **Production enforces neither.** The enforced policy still carries `script-src 'unsafe-eval'` and `style-src 'unsafe-inline'`. Since 2026-08-08 the §3.1.2 TARGET policy ships alongside it as `Content-Security-Policy-Report-Only` (§CSP-STRICT-SHADOW, `server/securityHeaders.js`), so the two blockers can be narrowed from real production telemetry instead of a full-app run nobody could safely stage. Report-only never blocks; this is measurement, not enforcement. **Read §3.1.2 as the target, not as the deployed state, until this gate goes live.** First telemetry confirms `style-src` violations are numerous (the `injectAppTheme()` CSS-in-JS and Cesium's own inline styles) and `script-src 'unsafe-eval'` is genuinely still exercised — so neither directive can be tightened yet.

| Gate | Path | Status | What it checks | Phase |
|---|---|---|---|---|
| `check-apex-self-contained` | `scripts/check/check-apex-self-contained.mjs` | ✅ **LIVE** (`npm run check:apex`) | Parses the rendered apex HTML for `<script src>` / `<link href>` / `<img src>` / `@import` whose URL host is `app.pryzm.so` (or any non-`pryzm.so` + non-allowlist host). Enforces §2.2.4. Current: 0 script tags, all assets same-origin. | Phase A |
| `check-apex-size` | `scripts/check/check-apex-size.mjs` | ✅ **LIVE** (`npm run check:apex`) | Sums gzipped byte size of `dist-apex/` (excludes `_headers`/`_redirects`/dotfiles **and streamed media, which is measured on its own 24 MB raw budget** — §6.1.3.1); fails if either budget is exceeded. Enforces §6.1.3. | Phase A |
| `check-apex-no-auth-cookies` | `scripts/check/check-apex-no-auth-cookies.mjs` | ✅ **LIVE** (`npm run check:apex`) | Scans the apex build output (`dist-apex/`) + the pre-render source for any `Set-Cookie` / `document.cookie` / `req.cookies` / `res.cookie(` usage (comment lines skipped). Enforces §2.2.1. | Phase A (with the first apex deploy) |
| `check-no-product-routes-in-docs-site` | `scripts/check/check-no-product-routes-in-docs-site.mjs` | ✅ **LIVE** (`npm run check:docs-site`, in the `apex-gates` CI job) | Fails any PR adding `apps/docs-site/src/pages/{index,pricing,manifesto,trust,start,solutions,resources}.astro` (or successors). Enforces §2.1.5 + §8 + the ADR-0255 retirement. The 5 marketing pages + `gen-docs-site-pricing.mjs` + `pricing.json` were deleted (A.17.x.14); only `404.astro` remains in the docs-site. | Phase A close |
| `check-app-strict-csp` | `scripts/check/check-app-strict-csp.mjs` | ⚪ planned | Lints `server.js` middleware + the SPA build for inline `<script>` without nonce, `unsafe-inline` / `unsafe-eval` in the CSP header, missing `default-src 'self'`. Enforces §3.1.2. **Deferred — §3.1.2.1: blocker 3 (`connect-src`) RESOLVED 2026-06-02; 2 remain. Blocker 1 (`unsafe-eval`) is NOT "Three.js/Cesium → Phase J" — that was refuted 2026-08-24; its callers are NAMED in §3.1.2.3, the load-path one is REMOVED, and the promotion criteria are §3.1.2.4. Blocker 2 (CSS-in-JS `unsafe-inline`) still needs the nonce migration.** | Phase A (gates the Fly deploy) |
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

The drift trap ADR-0252 fell into was exactly this — `apps/docs-site/src/pages/index.astro` and `apps/editor/src/ui/platform/LandingPage.ts` both rendered "the landing page", and they diverged within three days (colour palette, font, copy). The retirement sequence is binding: when in doubt, the editor's source wins, and the parallel surface is deleted.

If a §5 route is genuinely shared (e.g. `/legal/privacy` — public marketing AND embedded in the app's footer), the canonical answer is "apex owns it; the app links to apex". A route MUST NOT have two implementations.

### §8.1 — When the contract loses

A revised hosting topology (e.g. ADR-0256-X "single-deploy" reversal, or a future "edge SSR" pattern that obviates the apex/app split) MUST land as a superseding ADR FIRST. Until the superseding ADR is ACCEPTED, this contract is binding even if engineers consider it obsolete.

### §8.2 — Subdomain proliferation guard

New subdomains (`portal.pryzm.so`, `api-v2.pryzm.so`, `internal.pryzm.so`) require a §4 amendment + a stated surface assignment (apex / app / docs / other). Provisioning a new subdomain in Cloudflare WITHOUT a §4 amendment is a contract violation; the on-call ops engineer's first response to "what is `foo.pryzm.so`?" is to check §4.

---

## §9 — What is NOT in this contract

- §9.1 The **Phase B → D execution sequence** — that is ADR-0255 §3 (the migration runbook). C51 is the steady-state invariant; ADR-0255 is the trajectory.
- §9.2 The **specific Cloudflare project naming / Fly app naming** — implementation detail of the runbook ([CLOUDFLARE-MIGRATION-RUNBOOK-2026-Q3.md](../../05-guides/deployments/CLOUDFLARE-MIGRATION-RUNBOOK-2026-Q3.md)).
- §9.3 The **content** of any marketing route — copy is owned by the marketing repository (which is `apps/editor/src/ui/platform/` per §6.3). C51 governs WHERE the content is served, not WHAT it says.
- §9.4 The **AI host endpoint topology** — `CF_WORKER_URL` lives in its own contract surface (C09).
- §9.5 The **plugin marketplace economics** — `marketplace.pryzm.so` is governed by [C40](./C40-MARKETPLACE-ECONOMICS.md), not here.
- §9.6 The **developer docs surface** — `docs.pryzm.so` is governed by C07 (Plugin SDK) + C31 (documentation authoring); C51 only states it MUST NOT carry customer-facing routes.
- §9.7 The **auth migration to Supabase Auth** — that is ADR-0256 (planned, Phase A.5), not C51. C51 only states that until ADR-0256 lands, C08 §1.1 (custom JWT) is binding.

---

## §10 — Change log

- **2026-08-09** — **§6.1.3 split into a first-paint budget + a streamed-media budget** (new §6.1.3.1). Landed with the founder's KRETZ-modelled landing pass: a violet top bar, the tile mark on the right, and a full-bleed hero video. `check-apex-size.mjs` now measures the two separately (200 KB gz first paint / 24 MB raw media), and the apex CSP in `prerender-apex.mjs` gained `media-src 'self'` — without it `<source>` falls back to `default-src 'none'` and the hero video is silently blocked while the page still "looks fine". §2.1.2 and §2.2.4 are explicitly NOT relaxed. The 14.25 MB asset is flagged in §6.1.3.1 as a TESTING encode, not a production hero.
- **2026-06-03** — Canonicalized the **apex→app clean entry-path routing**. Added **§3.1.8** (the clean-path → SPA `?page=` bridge, the MUST-side counterpart to §3.2.1, tagged `C51 §3.2.2` in `server.js`) + **§3.1.8.1** (the `landingMarkup.ts` single-source CTA mechanism, cross-ref §2.1.5) + **§5.3** (the entry-path routing table: path · host · behaviour · target · status for `/signup` · `/start` · `/sign-in` · `/contact` · `/solutions` · `/resources` · `/pricing` · `/manifesto` · `/trust`). Docs-only; no code change. The contract is now the source of truth for the previously-undocumented routing flow.
- **2026-06-02** — Ratified as the normative form of ADR-0255 §0. First contract to govern PRYZM's hosting topology. Authored alongside ADR-0255's amendment pass (4 critical contract conflicts caught + corrected) so the invariants the ADR ratified are now lifted into permanent contract form. CI gates §7 declared but not yet authored.

---

## §11 — Cross-reference summary

| Contract / ADR | Relationship |
|---|---|
| [ADR-0252](../adrs/ADR-0252-docs-site-marketing-surface.md) | SUPERSEDED by ADR-0255 + this contract. The parallel-marketing-codebase pattern this contract retires by construction. |
| [ADR-0255](../adrs/ADR-0255-one-pryzm-cloudflare-supabase.md) | **PARENT** — C51 is the normative form of ADR-0255 §0 (apex/app split) + §5 (DNS map). |
| [ADR-0256](../adrs/ADR-0256-supabase-auth-migration.md) | PLANNED — sequences the C08 §1.1 auth migration; C51 §3.1.3 binds until ADR-0256 ratifies. |
| [C08](./C08-COLLABORATION-AND-SECURITY.md) | App MUST honour §1.1 (custom JWT) + §3.1/§3.2 (CRDT explicit conflict through Phase D). |
| [C22](./C22-PRIVACY-AND-PII-TIER.md) | Apex MUST NOT carry PII (§1.1 tier-tag); app MUST honour §1.3 (region residency — EU primary in Phase A). |
| [C39](./C39-PRICING-AND-PLAN-TIERS.md) | `/pricing` apex route MUST render from `@pryzm/entitlements` — single pricing surface. |
| [C43](./C43-ACCESSIBILITY.md) | Apex MUST honour §1.5 colour tokens (`PRYZM_TOKENS`) — no parallel hex literals. |
| [C48](./C48-BACKUP-AND-DR.md) | App's persistence MUST meet §1.1 / §1.5 RTO + RPO — Supabase Pro PITR for any paying-customer deployment. |
| [C49](./C49-MULTI-REGION-AND-SOVEREIGNTY.md) | App region binding MUST honour §1.2 (Phase A = EU primary) + §1.3 (per-class residency). |

---

*End — C51 Apex/App Deployment Split, 2026-06-02 — CANONICAL.*
