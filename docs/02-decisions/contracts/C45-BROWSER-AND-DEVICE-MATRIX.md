# C45 — Browser & Device Matrix

> **Stamp**: 2026-06-01 · **Status**: DRAFT
> **Scope**: governs the **supported browsers + devices + hardware floor + the per-feature rendering-fallback policy** — the contract between PRYZM and the broader ecosystem of user agents. Codifies the tiered support model (Tier 1 fully tested, Tier 2 best-effort, Tier 3 unsupported), the version-cutoff policy, the WebGL → WebGPU rollout, the screen-reader × browser × OS compatibility matrix, the hardware floor (CPU / GPU / RAM minimums), the polyfill posture (no polyfills for evergreen browsers; selective for outliers), the unsupported-browser landing experience, the per-release device-fleet QA pass, and the public browser-support page. Differs from [C44](C44-MOBILE-AND-TABLET.md) which deals with form-factor; **a browser is the user agent, a form-factor is the screen size**. A device may run a Tier 1 browser at any form-factor or a Tier 3 browser at desktop form-factor.
> **Depends on**: [C04](C04-RENDERING-AND-SCHEDULING.md) (WebGL / WebGPU rollout — the browser support matrix gates which renderer ships), [C06](C06-UI-SHELL-AND-TOOLS.md) (UI shell hosts the unsupported-browser landing), [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md) (per-browser-version perf budgets in NFTs), [C43](C43-ACCESSIBILITY.md) (assistive-tech compatibility matrix), [C44](C44-MOBILE-AND-TABLET.md) (sibling — form-factor × browser combinations).
> **Sibling**: [C43](C43-ACCESSIBILITY.md), [C44](C44-MOBILE-AND-TABLET.md), [C46](C46-I18N-AND-L10N.md).
> **Downstream**: BrowserSupportRegistry consumed by feature-detection gates · public support page at `pryzm.app/supported-browsers` · CI playwright project matrix · BrowserStack / Sauce Labs device farm config · per-release QA checklist.
> **Key principles**: **P5** (browser detection schemas pure — no behaviour at L0), **P6** (browser-policy mutations via commandBus — admin changes a Tier 2 → Tier 3 only via the published-decision command), **P8** (every unsupported-browser landing + every WebGPU fallback emits a span).
> **Master plan**: [PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md §13 (Phase 6.3 accessibility & device)](../03-execution/plans/master-implementation-plan.md).
> **Audit-source**: [MISSING-CONTRACTS-AUDIT-2026-06-01.md §3.4](../MISSING-CONTRACTS-AUDIT-2026-06-01.md).

---

## §1 — Invariants

### §1.1 — Three tiers of browser support

```
TIER 1 — Fully Supported
  * Tested every PR in CI on real (or near-real) instances
  * All features work; performance NFTs honoured
  * Customer-reported bugs are bugs, not "your browser is unsupported"
  * Latest stable + previous stable releases

TIER 2 — Best-Effort
  * Tested at each release (not per PR)
  * Most features work; some advanced features (WebGPU, OPFS, WebTransport) may be unavailable
  * Customer-reported bugs are logged + addressed when convenient
  * Older versions of TIER 1 browsers + smaller-market-share browsers

TIER 3 — Unsupported
  * Not tested; product MAY work but no commitment
  * Customer-reported bugs are closed with the support-page link
  * Pre-WebGL browsers; Internet Explorer; security-deprecated versions
```

### §1.2 — The canonical browser-tier matrix

| Browser | Tier 1 versions | Tier 2 versions | Tier 3 versions |
|---|---|---|---|
| **Chrome / Chromium** (desktop) | latest stable, latest stable − 1 | stable − 2, stable − 3 | < stable − 4 |
| **Edge** (desktop, Chromium-based) | latest stable, latest stable − 1 | stable − 2 | < stable − 3 |
| **Safari** (macOS) | latest stable | stable − 1 | < stable − 2 |
| **Safari** (iOS / iPadOS) | iOS 17+, iPadOS 17+ | iOS 16, iPadOS 16 | < iOS 16 |
| **Firefox** (desktop) | latest stable, latest ESR | stable − 1, ESR − 1 | < ESR − 1 |
| **Chrome** (Android) | latest stable | stable − 1 | < stable − 2 |
| **Samsung Internet** | latest stable | stable − 1 | < stable − 2 |
| **Brave** (Chromium-based) | latest stable | stable − 1 | < stable − 2 |
| **Vivaldi / Opera** | — | latest stable | < stable |
| **Internet Explorer** | — | — | all versions |

Version cut-off updates monthly (browsers update fast; the published matrix updates at the same cadence). The `BrowserSupportRegistry` is the source of truth; CI consumes it to gate playwright project selection.

### §1.3 — Hardware floor

Tier 1 + Tier 2 support is conditioned on minimum hardware:

| Resource | Floor |
|---|---|
| CPU | 4 cores, x86-64 or ARM64 |
| RAM | 8 GB (desktop) / 4 GB (mobile + tablet) |
| GPU | WebGL2-capable (D3D11 / OpenGL 3.3 / Metal 2 / Vulkan 1.1 floor); integrated GPU acceptable for moderate models |
| Network | broadband at boot (cached resources allow sub-broadband subsequent loads) |
| OS | macOS 12+, Windows 10+, Ubuntu 22.04+, iOS 16+, Android 11+ |

Below floor: the product may run in a degraded mode but is not contracted. Above floor: standard NFTs per [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md) and per-form-factor budgets per [C44 §1.12](C44-MOBILE-AND-TABLET.md).

### §1.4 — WebGL2 is the baseline; WebGPU is opt-in

The 3D renderer ([C04](C04-RENDERING-AND-SCHEDULING.md) via `packages/renderer-three`) targets WebGL2 as the baseline. WebGPU is opt-in:

- Where available (Chrome 113+ on desktop, Safari 17+ on macOS, etc.) the renderer SHALL detect + offer WebGPU as an experimental mode (gated behind the `renderer.webgpu` entitlement during preview)
- Customers MAY toggle WebGPU on (per-session preference); the preference persists across sessions
- The renderer falls back to WebGL2 silently if WebGPU initialisation fails
- Pre-WebGL2 browsers (very old) fall back to a read-only 2D mode + "upgrade your browser" landing

The WebGPU rollout is gradual; full default-on switchover is gated on (a) > 80 % browser-side support and (b) two-quarters of zero-regression metric per [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md).

### §1.5 — Assistive-technology compatibility matrix

Per [C43](C43-ACCESSIBILITY.md), the product targets WCAG 2.2 AA across major assistive tech:

| AT | OS | Browsers (Tier 1) | Notes |
|---|---|---|---|
| **NVDA** | Windows 10/11 | Chrome, Edge, Firefox | The default screen-reader-of-record for testing |
| **JAWS** | Windows 10/11 | Chrome, Edge | Enterprise screen reader; tested at release |
| **VoiceOver** | macOS 12+ | Safari, Chrome | Apple's screen reader |
| **VoiceOver** | iOS 17+ | Safari | Mobile screen reader |
| **TalkBack** | Android 11+ | Chrome | Mobile screen reader |
| **Windows Narrator** | Windows 10/11 | Edge, Chrome | Built-in; lower priority |
| **Orca** | Linux | Firefox | Lowest priority |

Per [C43 §1.13](C43-ACCESSIBILITY.md), external annual audit covers these combinations. CI does not auto-test screen readers (they're not headless-runnable); manual QA is the gate per release.

### §1.6 — Feature detection over user-agent sniffing

The product detects features (`'gpu' in navigator`, `'WebGL2RenderingContext' in window`, `CSS.supports('color', 'oklch(0% 0 0)')`, etc.) NOT user-agent strings. User-agent sniffing is forbidden (`check-no-ua-sniff`).

Rationale: UA strings are unreliable (Brave reports as Chrome; many embedded browsers spoof their UA). Feature detection is robust and works for new browsers the product hasn't yet been tested against.

A single exception: the unsupported-browser landing (§5.1) MAY consult the UA string to render a browser-specific upgrade link (e.g. linking to the Chrome download page vs. the Safari support page). This is a presentation concern, not a behavioural gate.

### §1.7 — Polyfill posture

PRYZM's posture: **no polyfills for evergreen browsers** (Chrome, Edge, Safari, Firefox latest 2 versions). The product uses native APIs and assumes they are present.

For Tier 2 outliers (Samsung Internet, Vivaldi, certain corporate-environment Chromium forks), the product SHALL polyfill ONLY where:

- The missing API is feature-detected at boot (per §1.6)
- The polyfill payload is < 10 KB gzip
- The polyfill is well-maintained (e.g. `core-js`, `intersection-observer`)

Polyfills are loaded conditionally — never shipped as part of the always-on bundle. The polyfill registry lives in `packages/browser-support/polyfills/manifest.ts`.

### §1.8 — Unsupported-browser landing

A browser detected as Tier 3 hits `apps/editor/src/ui/unsupported-browser/`. The landing renders:

- Headline: "PRYZM needs a modern browser"
- The customer's detected browser + version
- A list of supported browsers with download links (Chrome, Edge, Safari, Firefox)
- "Continue anyway" CTA (gated to a confirm — proceeding voids the SLA)
- "Email me a link to open elsewhere" CTA (calls `formfactor.requestDesktopLink`)

The landing is itself robustness-tested across the broadest browser range — it's the surface a non-Tier-1 user sees first, so it MUST render correctly even on an old Edge / pre-Chromium browser.

### §1.9 — Customer-facing browser-support page

`pryzm.app/supported-browsers` is the public commitment. Generated from `BrowserSupportRegistry` at build time. Carries:

- Tier 1 / Tier 2 / Tier 3 explanations
- The matrix from §1.2 in HTML
- The hardware floor from §1.3
- The AT support matrix from §1.5
- WebGPU rollout status
- "What does it mean if my browser isn't supported?" FAQ
- Link to file a browser-support request via support per [C42](C42-CUSTOMER-SUPPORT-TIER.md)

### §1.10 — Per-release device-fleet QA pass

Every PRYZM release (typically monthly) runs a QA pass across a published device fleet:

| Device | OS | Browser(s) | Status |
|---|---|---|---|
| MacBook Pro 14" (M3) | macOS 14.4+ | Safari, Chrome, Firefox | Required |
| MacBook Pro 16" (M1 Pro) | macOS 14.4+ | Safari, Chrome | Required |
| Windows desktop (i7 + RTX 4060) | Windows 11 | Chrome, Edge, Firefox | Required |
| Windows laptop (i5 + Iris Xe) | Windows 11 | Chrome, Edge | Required |
| Ubuntu desktop (Ryzen 7 + RTX 3070) | Ubuntu 24.04 | Chrome, Firefox | Required |
| iPad Pro 12.9" (M2) | iPadOS 17 | Safari | Required |
| iPad Air 5 | iPadOS 17 | Safari | Required |
| iPhone 15 Pro | iOS 17 | Safari | Required |
| Samsung Galaxy S24 | Android 14 | Chrome, Samsung Internet | Required |
| Surface Pro 9 | Windows 11 | Edge, Chrome | Recommended |
| Chromebook (mid-range) | ChromeOS | Chrome | Recommended |

Required = release blocker on regression. Recommended = noted but not blocking.

Device-farm vendors (BrowserStack, Sauce Labs, LambdaTest) provide the breadth coverage for Tier 2 versions; the in-house device fleet covers Tier 1. The release manager runs the smoke suite manually + the playwright suite headlessly on each.

### §1.11 — Every browser-related decision emits a span

Per P8:

- `pryzm.browser.detected` — `{ name, version, engine, tier, formFactor }` (one per session)
- `pryzm.browser.unsupported_landing` — `{ name, version, tier, source: 'direct_nav' \| 'shared_link' \| 'oauth_callback' }`
- `pryzm.browser.webgpu_fallback` — `{ name, version, reason: 'init_failed' \| 'not_supported' \| 'user_opted_out' }`
- `pryzm.browser.polyfill_loaded` — `{ polyfillId, sizeKB, browser }`
- `pryzm.browser.feature_detect.failure` — `{ feature, browser }` (when feature-detection comes up negative for a non-fallback path)

Spans MUST open at the public boundary of `packages/browser-support/`.

### §1.12 — Version cut-off notices

When a TIER 2 → TIER 3 transition is scheduled (e.g. "Chrome 110 will move to Tier 3 in 30 days"):

- A banner surfaces in-product to affected users 30 days before
- The browser-support page lists the deprecation date
- After the cut-off, affected users see the unsupported-browser landing
- TIER 1 → TIER 2 transitions are silent (Tier 2 is still supported)

Cut-offs run monthly with the new-release cadence; a single ADR per quarter records material cut-offs.

### §1.13 — Browser-extension interference disclaimer

Many browser extensions (ad-blockers, privacy tools, password managers) inject DOM + intercept fetch + sandbox iframes. PRYZM's contract: the product works with the default set of standard extensions (uBlock Origin, 1Password, LastPass) but cannot guarantee compatibility with all. When a customer reports a bug that reproduces only with a specific extension, the support team identifies the extension + (a) works around it where reasonable, (b) documents the incompatibility, or (c) explains the limitation.

The contract does NOT obligate PRYZM to work around all extension behaviours; it does obligate honest acknowledgement.

### §1.14 — Discipline-neutrality

The browser + device support matrix MUST NOT vary by customer discipline or jurisdiction (subject to the per-jurisdiction connectivity reality already acknowledged in [C44](C44-MOBILE-AND-TABLET.md) §10 OQ-3). Per the C00 governance discipline-neutrality bar.

### §1.15 — In-product browser-update prompt

When the customer's browser is on Tier 2 + within 60 days of a likely Tier 3 transition (per a forecast in the registry), the product surfaces a non-intrusive banner: "Your browser version is older — upgrade for the best experience". Dismissable for the session; resurfaces at next session start until the version updates OR the cut-off lands (whichever first).

---

## §2 — Schema (in `packages/schemas/src/browser/`)

L0-pure. No I/O, no THREE, no DOM.

### §2.1 — Top-level types

| Schema | Owns |
|---|---|
| `BrowserName` | `'chrome' \| 'edge' \| 'safari' \| 'firefox' \| 'samsung-internet' \| 'brave' \| 'vivaldi' \| 'opera' \| 'ie' \| 'other'` |
| `BrowserEngine` | `'blink' \| 'gecko' \| 'webkit' \| 'edgehtml' \| 'trident' \| 'other'` |
| `BrowserTier` | `1 \| 2 \| 3` |
| `BrowserDetection` | `{ name: BrowserName, version: string, engine: BrowserEngine, tier: BrowserTier, isMobile: boolean, isTablet: boolean, isDesktop: boolean, supportsWebGL2: boolean, supportsWebGPU: boolean, supportsOPFS: boolean, supportsServiceWorker: boolean, detectedAt }` |
| `BrowserSupportRegistry` | `Record<BrowserName, BrowserTierSpec>` |
| `BrowserTierSpec` | `{ name, tier1MinVersion, tier2MinVersion, tier3CutoffVersion, weeklyShareEstimate: number, cutoffSchedule: CutoffScheduleEntry[] }` |
| `CutoffScheduleEntry` | `{ versionRange: string, currentTier: BrowserTier, newTier: BrowserTier, effectiveDate: ISODate, announcedAt: ISODate }` |
| `HardwareFloor` | `{ minCpuCores: 4, minRamGB: 8, gpuRequirement: 'webgl2' \| 'webgpu_optional' \| 'webgl1' }` (compile-time constant) |
| `PolyfillManifestEntry` | `{ id, conditionalLoad: () => boolean, esmSrc: URL, sizeKB: number, supportedTiers: BrowserTier[] }` |
| `FeatureDetectionResult` | `{ feature: string, present: boolean, browserName, browserVersion }` |
| `DeviceFleetEntry` | `{ device, os, browser, browserVersion, required: boolean }` |

### §2.2 — Field-level constraints

| Field | Constraint |
|---|---|
| `BrowserTier` | `1`, `2`, or `3` — no other values |
| `BrowserTierSpec.weeklyShareEstimate` | `number ∈ [0, 1]`; sum across all browsers should equal ~1 (validated at registry build) |
| `CutoffScheduleEntry.effectiveDate` | MUST be ≥ `announcedAt + 30 days` (per §1.12) |
| `PolyfillManifestEntry.sizeKB` | `<= 10` (per §1.7) |
| `BrowserDetection.tier` | derived from registry lookup at detection time; not stored |

### §2.3 — Reserved feature detection IDs

| Feature | Used by |
|---|---|
| `webgl2` | [C04](C04-RENDERING-AND-SCHEDULING.md) renderer; mandatory above Tier 3 |
| `webgpu` | [C04](C04-RENDERING-AND-SCHEDULING.md) renderer; opt-in |
| `serviceWorker` | [C44](C44-MOBILE-AND-TABLET.md) PWA install + offline queue |
| `opfs` | [C05](C05-PERSISTENCE-AND-FILE-FORMAT.md) local persistence (when available) |
| `webtransport` | Future sync surface |
| `intersectionObserver` | Lazy-render in panels |
| `prefersReducedMotion` | [C43](C43-ACCESSIBILITY.md) animation policy |
| `oklch` / `oklab` | Theme tokens — fallback to `rgb()` |
| `containerQueries` | Layout — fallback to `min-width` media |
| `prefersContrast` | [C43](C43-ACCESSIBILITY.md) high-contrast |

---

## §3 — Stores

### §3.1 — `BrowserSupportStore` (`packages/browser-support/src/store.ts`)

Client-side. Holds the current session's `BrowserDetection`. Read-only after boot.

### §3.2 — `FeatureDetectionStore` (`packages/browser-support/src/featureDetection.ts`)

Client-side. Holds the per-feature detection results for the current session. Components read via `useFeature(featureId)`.

### §3.3 — `BrowserSupportRegistry` (`packages/browser-support/src/registry.ts`)

Server-side authoritative + client-side cached. The canonical matrix from §1.2; updated monthly by an ops PR. Generated public support page reads this.

### §3.4 — `PolyfillManifestStore` (`packages/browser-support/src/polyfillManifest.ts`)

Client-side. Holds the per-polyfill conditional-load decisions for the current session.

### §3.5 — Persistence

Stores are session-scoped. The registry is bundled at build time + refreshed when a new build deploys.

### §3.6 — Boot pipeline

```
client boot:
   │
   ▼  detect browser via UA parsing + capability sniff (one-time)
   │     - emit pryzm.browser.detected
   │
   ▼  lookup tier in BrowserSupportRegistry
   │     - Tier 3 → redirect to /unsupported-browser
   │     - Tier 2 → continue + show in-product update prompt if within 60d of cutoff
   │     - Tier 1 → continue silently
   │
   ▼  feature detection sweep (~15 features)
   │     - cache results in FeatureDetectionStore
   │
   ▼  load conditional polyfills (per PolyfillManifest)
   │     - emit pryzm.browser.polyfill_loaded per polyfill
   │
   ▼  init renderer:
   │     - if supportsWebGPU AND user opted in → WebGPU renderer
   │     - else → WebGL2 renderer
   │     - fallback chain logs pryzm.browser.webgpu_fallback if applicable
   │
   ▼  proceed to normal composeRuntime() boot
```

---

## §4 — Commands

All commands route through `commandBus` per P6 + [C16](C16-COMMAND-AUTHORING-PROTOCOL.md). All open OTel spans per §1.11.

### §4.1 — User-facing

| Command | Effect |
|---|---|
| `browser.toggleWebGPU` | Toggle WebGPU preference; persists in localStorage; takes effect on next session |
| `browser.dismissUpdatePrompt` | Dismiss the "your browser is older" prompt for this session |
| `browser.dismissUnsupportedBanner` | Dismiss the unsupported-browser banner ("Continue anyway") |
| `browser.requestDesktopLink` | Send a magic-link email (shared with [C44](C44-MOBILE-AND-TABLET.md) §4.1) |

### §4.2 — Admin / sales-ops-facing

| Command | Effect |
|---|---|
| `browser.publishRegistry` | Publish a new `BrowserSupportRegistry` version (typically monthly); CI verifies + announces cutoffs |
| `browser.scheduleCutoff` | Schedule a Tier 2 → Tier 3 transition (with announceDate ≥ effectiveDate − 30d per §1.12) |
| `browser.cancelCutoff` | Cancel a scheduled cutoff |

### §4.3 — Server-only

| Command | Effect |
|---|---|
| `browser.recordSession` | TIER-2 telemetry — record per-session browser distribution (per [C41](C41-TELEMETRY-AND-ANALYTICS.md)) |
| `browser.aggregateWeekly` | Cron — aggregates browser-share + WebGPU adoption rate for the trust-report |
| `browser.runReleaseSmoke` | Triggered at release — fires the device-fleet smoke suite |
| `browser.cutoffNoticeDispatch` | Cron — dispatches the 30-day cutoff banner to affected sessions |

---

## §5 — UI

### §5.1 — Unsupported-browser landing

`apps/editor/src/ui/unsupported-browser/` — the landing for Tier 3. Components:

- Header logo + reassurance copy
- Detected browser badge (e.g. "We see you're on Internet Explorer 11")
- Tier 1 browser cards (Chrome / Edge / Safari / Firefox) with download links + version-required
- Hardware-floor reminder (small print, expandable for details)
- "Continue anyway" CTA + confirmation modal (proceeding voids the SLA)
- "Email me a link to open on a supported browser" CTA

This landing is the most cross-browser-tested surface in the codebase — it must render on IE11, on old Edge, on minimal-CSS clients.

### §5.2 — Browser-support page (public)

`apps/docs-site/src/supported-browsers.tsx` — generated from the `BrowserSupportRegistry`. Components:

- Headline + Tier 1 / 2 / 3 explanations
- The matrix table
- The hardware floor
- The AT compatibility matrix
- The current WebGPU rollout status
- FAQs
- A "Last updated" timestamp + a "Subscribe to changes" CTA (email signup)

### §5.3 — In-product browser-update prompt

A persistent dismissible banner at the top of the editor shell when `tier === 2 AND within 60d of cutoff`. Reads "Your browser is on the older side — upgrade for the best experience" + a "Learn more" link to §5.2.

### §5.4 — WebGPU opt-in preference (settings)

In `apps/editor/src/ui/settings/rendering/` — a toggle "Use WebGPU (experimental — improved performance on supported devices)". Default off. Persists across sessions.

### §5.5 — Browser-detection display in account

In the customer's account page, a "Your browser" section shows the detected name + version + tier + (if Tier 2) the scheduled cutoff date. Helpful for support diagnostics.

### §5.6 — Keyboard surface

The browser-related surfaces are all primarily form / link interactions; keyboard support is standard per [C43](C43-ACCESSIBILITY.md). No special browser-specific keyboard surfaces.

---

## §6 — CI gates

| Gate | Path | What it checks |
|---|---|---|
| `check-no-ua-sniff` | `tools/ga-gate/check-no-ua-sniff.ts` | No source file inspects `navigator.userAgent` or `navigator.userAgentData` for behavioural branching (per §1.6); exceptions list for the unsupported-browser landing |
| `check-browser-support-registry-coverage` | `tools/ga-gate/check-browser-support-registry-coverage.ts` | Every `BrowserName` in detection code has a matching `BrowserTierSpec` in the registry |
| `check-cutoff-30d-notice` | runtime — schema validator | Every `CutoffScheduleEntry.effectiveDate >= announcedAt + 30 days` (per §1.12) |
| `check-polyfill-size-budget` | `tools/ga-gate/check-polyfill-size-budget.ts` | Every `PolyfillManifestEntry.sizeKB <= 10` (per §1.7) |
| `check-feature-detection-fallback` | runtime — boundary | Every feature-gated code path has a documented fallback (per §1.6) |
| `check-browser-support-spans` | extends `check-spans.ts` | Every public `packages/browser-support/` boundary function carries an OTel span (per §1.11) |
| `check-browser-support-schemas-pure` | extends schema-purity check | `packages/schemas/src/browser/` has zero I/O, zero THREE, zero DOM (per P5) |
| `check-device-fleet-matrix-current` | `tools/ga-gate/check-device-fleet-matrix-current.ts` | The published device-fleet matrix has been refreshed within the last 90 days |
| `check-public-page-derived` | `tools/ga-gate/check-public-page-derived.ts` | `apps/docs-site/src/supported-browsers.tsx` is derived from the registry, not hand-edited |
| `check-discipline-neutral-browser` | manual review | Browser tier matrix does not vary by customer discipline (per §1.14) |

### §6.2 — Conformance suites

| Suite | Path | Asserts |
|---|---|---|
| Browser detection | `packages/browser-support/__tests__/detection.test.ts` | 30 UA-string fixtures correctly classify to `(name, version, engine, tier)` |
| Feature detection | `packages/browser-support/__tests__/feature-detection.test.ts` | Per-feature detection works on jsdom + on real-browser playwright fixtures |
| WebGPU fallback | `packages/browser-support/__tests__/webgpu-fallback.test.ts` | When WebGPU init fails, renderer falls back to WebGL2 silently + emits span |
| Polyfill conditional loading | `packages/browser-support/__tests__/polyfill-conditional.test.ts` | Polyfills load only when feature detection fails; never loaded on evergreen Tier 1 |
| Cut-off notice | `packages/browser-support/__tests__/cutoff-notice.test.ts` | 30-day advance notice surface fires correctly |
| Unsupported landing | `tests/e2e/unsupported-browser.spec.ts` | The landing renders on a Tier 3 UA (simulated via playwright launch options) |
| Device fleet smoke (playwright matrix) | `tests/e2e/device-fleet/*.spec.ts` | Each device-fleet entry has at least one passing smoke test in the matrix run |

---

## §7 — NFT targets

| NFT | Target | Bench |
|---|---|---|
| Browser detection at boot | < 10 ms | `browser-detection.bench.ts` (new) |
| Feature detection sweep (15 features) | < 20 ms | `feature-detection-sweep.bench.ts` (new) |
| Polyfill conditional load (per polyfill ≤ 10 KB) | < 200 ms each on 4G | `polyfill-load.bench.ts` (new) |
| Unsupported-browser landing FCP | < 1.5 s even on Tier 3 simulation | `unsupported-fcp.bench.ts` (new) |
| WebGPU init attempt + fallback | < 500 ms | `webgpu-init.bench.ts` (new) |
| Device-fleet smoke suite (full run) | < 30 min total wall-time | `device-fleet-smoke.bench.ts` (new) |

---

## §8 — Migration plan

### §8.1 — New package `packages/browser-support/`

```
packages/browser-support/
  src/
    index.ts                       — composeBrowserSupport() boundary
    detection.ts                   — UA + feature detection
    registry.ts                    — BrowserSupportRegistry
    polyfillManifest.ts            — conditional-load polyfills
    cutoffNotice.ts                — 30-day notice surfaces
    unsupportedRouter.ts           — Tier 3 redirect handler
    featureDetectionStore.ts       — per-session feature cache
    publicPageGenerator.ts         — emits apps/docs-site/src/supported-browsers.tsx
    schemas/                       — re-exports
```

Wired into `composeRuntime()` at L3 (very early — feature detection gates downstream loaders).

### §8.2 — Phased rollout

| Phase | Deliverable | Estimate |
|---|---|---|
| BRW-α-1 | `packages/schemas/src/browser/` + zod | 0.3 wk |
| BRW-α-2 | `packages/browser-support/` detector + feature detection | 0.5 wk |
| BRW-α-3 | `BrowserSupportRegistry` first cut + the canonical matrix | 0.3 wk |
| BRW-β-1 | Unsupported-browser landing + Tier-detection routing | 0.5 wk |
| BRW-β-2 | Polyfill manifest + conditional loader | 0.5 wk |
| BRW-β-3 | Public support page generator | 0.5 wk |
| BRW-β-4 | WebGPU opt-in surface + fallback wiring | 0.5 wk |
| BRW-γ-1 | Device-fleet QA process + checklists | 0.5 wk |
| BRW-γ-2 | Playwright matrix for Tier 1 + sampled Tier 2 | 1 wk |
| BRW-γ-3 | BrowserStack / Sauce Labs integration for Tier 2 breadth | 1 wk |
| BRW-γ-4 | In-product update prompt + cutoff notice surface | 0.5 wk |
| BRW-δ-1 | CI gates (§6) all green | 0.5 wk |

**Total: ~6.5 wk** (within the master plan's Phase 6.3 budget when paralleled with C43 + C44).

### §8.3 — Backward compatibility

The product today works on evergreen Tier 1 browsers without an explicit registry. The migration codifies what already works + adds the polite-degradation surface for Tier 2 + 3. No customer migration required.

### §8.4 — Test plan

Per [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) test convention. Every UA-string in the fixture set has a unit test. Per-release manual QA across the device fleet. CI playwright matrix covers Tier 1 browsers; quarterly Tier 2 sampled via BrowserStack.

---

## §9 — What is NOT in this contract

- **Native mobile apps** — out of scope; see [C44](C44-MOBILE-AND-TABLET.md) §1.10.
- **Embedded webviews (Cordova / Capacitor / Electron)** — out of scope. If a third-party product embeds PRYZM in a webview, the underlying Chromium engine determines tier; PRYZM does not directly support webviews.
- **Headless browsers for screenshot / scraping** — out of scope. The product is interactive; headless use is unsupported.
- **Specific GPU model compatibility** — the §1.3 GPU floor is WebGL2-capable. Sub-GPU-model issues (e.g. specific Intel HD 3000-era issues) are case-by-case via support, not a contracted matrix.
- **Hardware-floor enforcement** — the floor is documented; the product does NOT block below-floor hardware. It simply degrades gracefully (per [C04](C04-RENDERING-AND-SCHEDULING.md) renderer fallbacks + [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md) NFT degradation paths).
- **Browser extensions** — see §1.13. Disclaimer-only.
- **Plugin browser compatibility** — plugins (per [C07](C07-PLUGIN-SDK-AND-MARKETPLACE.md)) inherit the host's browser support; plugins authoring browser-specific code are flagged in marketplace curation.
- **DRM playback / EME** — out of scope (no protected content).
- **OAuth provider compatibility** — covered by [C08](C08-COLLABORATION-AND-SECURITY.md) auth.
- **Print-rendering across browsers** — sheets are exported as PDF per [C29](C29-PDF-VECTOR-EXPORT.md); browser print is a fallback, not a contracted path.
- **Webview-based screenshot APIs** (e.g. window.print() embedded) — out of scope.

---

## §10 — Open questions (DRAFT-stage)

1. **WebGPU rollout default switchover**. Currently opt-in. Target ≥ 80 % browser-side support + 2 quarters of zero-regression metric. Forecast: WebGPU becomes default-on in Q2 2027.
2. **Firefox ESR**. ESR runs on a slower cadence. Currently Tier 1 alongside the standard release. Some Firefox-specific features (`OffscreenCanvas`, `WebTransport`) lag in ESR. Worth differentiating?
3. **iOS Safari WebGL2 quirks**. iOS Safari is notably slower at WebGL2 vs. macOS Safari. Should the per-form-factor NFT (per [C44 §1.12](C44-MOBILE-AND-TABLET.md)) be looser for iOS Safari specifically?
4. **Brave + privacy extensions**. Brave disables some features (storage partitioning, fingerprinting protection) that affect PRYZM. Tier 1 commitment is conditional on default Brave settings; aggressive privacy settings may fall to "best effort" — needs to be documented.
5. **Vivaldi / Opera Tier**. Both report as Chrome via UA but have customisations. Currently Tier 2; some customers ask for Tier 1. Decision pending — adoption-data-driven.
6. **Samsung Internet versioning cadence**. Samsung Internet updates slower than upstream Chromium; SI 23 may equal Chrome 117. The version-cutoff policy needs Samsung-specific handling.
7. **ChromeOS recommendation status**. Currently "Recommended" not "Required". Educational customers ask why. Decision: bump to Required when adoption-data shows > 5 % of weekly users.
8. **Browser-engine-only vs full-browser distinction**. Some embedders use the same Chromium engine as Chrome but ship as a different brand (e.g. Arc browser). UA detection sees them as Chrome; feature behaviour is identical; tier should match Chrome.

---

## §11 — Cross-reference summary

| Contract | Relationship |
|---|---|
| [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) | P6 — every browser mutation through commandBus; schemas L0-pure |
| [C04](C04-RENDERING-AND-SCHEDULING.md) | WebGL2 baseline + WebGPU rollout; fallback chain |
| [C05](C05-PERSISTENCE-AND-FILE-FORMAT.md) | OPFS feature detection gates local-persistence pathway |
| [C06](C06-UI-SHELL-AND-TOOLS.md) | UI shell hosts the unsupported-browser landing + the update prompt |
| [C07](C07-PLUGIN-SDK-AND-MARKETPLACE.md) | Plugins inherit browser support from the host |
| [C08](C08-COLLABORATION-AND-SECURITY.md) | OAuth provider compatibility per browser |
| [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md) | Per-browser-version perf budgets in NFTs |
| [C16](C16-COMMAND-AUTHORING-PROTOCOL.md) | All `browser.*` commands follow the protocol |
| [C41](C41-TELEMETRY-AND-ANALYTICS.md) | TIER-2 browser-session distribution telemetry |
| [C42](C42-CUSTOMER-SUPPORT-TIER.md) | Customer-reported browser issues routed via support |
| [C43](C43-ACCESSIBILITY.md) | AT × browser × OS compatibility matrix |
| [C44](C44-MOBILE-AND-TABLET.md) | Sibling — form-factor × browser combinations |

---

*End — C45 Browser & Device Matrix, 2026-06-01 — DRAFT.*
