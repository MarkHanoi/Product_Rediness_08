# C44 — Mobile & Tablet

> **Stamp**: 2026-06-01 · **Status**: DRAFT
> **Scope**: governs the **mobile + tablet experience** — what works, what doesn't, the breakpoint matrix, the gesture vocabulary, the touch-target sizing, the per-surface rendering strategy (full editor / read-only viewer / form-only / blocked), the offline-capable subset, the install-as-PWA story, and the explicit non-goals. **PRYZM's primary target is desktop + large-tablet (≥ 1024 px wide); smaller form factors are read-only viewer + select admin surfaces.** Codifies the BreakpointMatrix, the SurfaceCapability map (per surface × form-factor → "full" / "read-only" / "form-only" / "blocked"), the touch gesture registry, the orientation-lock policy, and the in-product messaging for unsupported form-factors. Differs from [C45](C45-BROWSER-AND-DEVICE-MATRIX.md) which deals with browser-engine compatibility regardless of form-factor.
> **Depends on**: [C04](C04-RENDERING-AND-SCHEDULING.md) (3D canvas perf budget — tablet GPU constraints), [C06](C06-UI-SHELL-AND-TOOLS.md) (UI shell breakpoint hooks), [C43](C43-ACCESSIBILITY.md) (touch-target sizing aligns with WCAG 2.5.8), [C45](C45-BROWSER-AND-DEVICE-MATRIX.md) (browser-engine compatibility per OS), [C46](C46-I18N-AND-L10N.md) (RTL layouts on mobile).
> **Sibling**: [C43](C43-ACCESSIBILITY.md), [C45](C45-BROWSER-AND-DEVICE-MATRIX.md), [C46](C46-I18N-AND-L10N.md).
> **Downstream**: viewport meta tag · PWA manifest · per-surface route-level capability declarations · in-product "best on desktop" messaging · share-link recipient experience (an architect shares a link → recipient opens on phone → gets the viewer surface).
> **Key principles**: **P6** (single command surface, regardless of form-factor — the same `wall.create` command flows whether the source is mouse or touch), **P3** (single frame scheduler — touch input is just another input source), **P5** (form-factor detection is a pure schema decision, not behavioural), **P8** (every form-factor downgrade emits a span).
> **Master plan**: [PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md §13 (Phase 6.3 accessibility & device)](../03-execution/plans/master-implementation-plan.md).
> **Audit-source**: [MISSING-CONTRACTS-AUDIT-2026-06-01.md §3.4](../MISSING-CONTRACTS-AUDIT-2026-06-01.md).

---

## §1 — Invariants

### §1.1 — Primary form-factor is desktop + large-tablet (≥ 1024 px wide)

The editor — the 3D canvas, the panels, the tool registry — is designed for cursor + keyboard interaction on a screen ≥ 1024 px wide. This is a deliberate scope choice: BIM is a precision-intensive activity that benefits from the desktop pointing-device + keyboard + sustained-attention interaction model. Phones and small tablets are NOT primary devices for authoring.

The contract codifies the trade-off rather than papering over it. On smaller form-factors, the product offers carefully-curated read-only viewer + form-only admin surfaces — useful for an architect reviewing on the train, a client viewing a shared link on their phone, or a site supervisor checking dimensions on a tablet — but NOT for new authoring.

### §1.2 — Four breakpoints

```
phone        : width <   600 px        (mobile portrait + small landscape)
phablet      : width 600-768 px        (large phone / small tablet portrait)
tablet       : width 768-1024 px       (tablet landscape / small laptop)
desktop      : width >= 1024 px        (laptop / desktop)
```

Breakpoints align with material-design + Tailwind defaults; the exact pixel values are configurable per surface but the four-tier classification is invariant.

Detection: `window.matchMedia` at boot + on resize. The `FormFactor` value is reactive — surfaces re-render on transition. A surface MAY override its capability per-breakpoint (e.g. `editor.canvas` is `full` at desktop, `read-only` at tablet, `blocked` at phablet + phone).

### §1.3 — Four capability levels per surface × form-factor

Every surface declares one of four capability levels per form-factor:

- **`full`** — the surface is fully functional with all features
- **`read-only`** — the surface renders content but no mutations (e.g. customer can view a shared sheet on phone but not edit)
- **`form-only`** — input-form surfaces work (billing settings, support ticket reply, marketplace purchase confirmation) but spatial-editing does not
- **`blocked`** — the surface refuses to render at this form-factor; in-product messaging suggests the customer return on a wider device

The full matrix lives in `packages/ui-base/src/surfaceCapability.ts` and is consulted by the router on every navigation.

### §1.4 — The canonical surface matrix

| Surface | phone | phablet | tablet | desktop |
|---|---|---|---|---|
| `editor.canvas` (3D) | blocked | blocked | read-only | full |
| `editor.canvas` (plan-view 2D) | read-only | read-only | full | full |
| `editor.panels.create` | blocked | blocked | read-only | full |
| `editor.panels.property` | read-only | read-only | full | full |
| `editor.panels.inspect` | read-only | read-only | full | full |
| `editor.panels.data` | read-only | read-only | full | full |
| `editor.panels.cost` | read-only | read-only | full | full |
| `editor.panels.schedule` | read-only | read-only | full | full |
| `editor.panels.sheet` (preview) | read-only | read-only | full | full |
| `editor.modal.apartment-layout` | blocked | blocked | full | full |
| `editor.modal.create-element` | blocked | blocked | full | full |
| `editor.modal.export-ifc` | form-only | form-only | full | full |
| `editor.modal.export-pdf` | form-only | form-only | full | full |
| `marketing.<page>` | full | full | full | full |
| `auth.signup` | full | full | full | full |
| `auth.signin` | full | full | full | full |
| `billing.<page>` | full | full | full | full |
| `support.help-search` | full | full | full | full |
| `support.ticket-detail` | full | full | full | full |
| `share-link.viewer` | full | full | full | full |
| `developer.dashboard.<*>` | read-only | read-only | full | full |
| `admin.<*>` | blocked | blocked | full | full |
| `pricing` | full | full | full | full |
| `status` | full | full | full | full |
| `accessibility` | full | full | full | full |

This is the binding source of truth; surfaces that drift fail CI.

### §1.5 — Touch-target sizing meets WCAG 2.5.8

Every interactive target (button, link, tab, list-row CTA, etc.) on touch-primary surfaces (any form-factor < desktop) MUST be ≥ 44×44 CSS pixels per WCAG 2.5.8 + Apple HIG. On `desktop` form-factor, the minimum is 24×24 (cursor-precision threshold). The `<Button>` and `<TouchableArea>` components in `packages/ui-base/` derive the size from the current form-factor.

Spacing between adjacent touch targets MUST be ≥ 8 CSS pixels on touch surfaces. Stacked toolbar buttons that would be 4-wide on desktop collapse to 2-wide + a swipe-affordance on touch.

### §1.6 — Gesture vocabulary is bounded + documented

The product uses ONLY the following touch gestures:

- **Tap** — equivalent to click
- **Long-press** (≥ 500 ms) — equivalent to right-click / context menu
- **Pinch + spread** — zoom (in 2D plan view; in 3D viewer where applicable)
- **Two-finger drag** — pan
- **Single-finger drag** (in viewer mode) — orbit the 3D camera
- **Swipe-left / swipe-right** — navigate carousels / dismiss bottom-sheet
- **Pull-to-refresh** — refresh the data on list surfaces (developer dashboard, support ticket list)

Out of scope: 3-finger gestures, drawing-with-finger geometry creation (a known hard surface for BIM precision), accelerometer-driven controls.

Custom plugin-emitted gestures are NOT supported; plugins use the standard gesture set or the UI primitives.

### §1.7 — Orientation policy

| Form-factor | Allowed orientations |
|---|---|
| phone | portrait (preferred) + landscape (read-only / form-only) |
| phablet | portrait + landscape |
| tablet | portrait + landscape (landscape preferred for `full` surfaces) |
| desktop | landscape only |

On phones in landscape, surfaces that don't support landscape render an "rotate device" hint. Surfaces declare their orientation tolerance in the manifest (per §3).

### §1.8 — The shared-link viewer works on every form-factor

A customer sharing a link (a published sheet, a 3D view, an apartment layout export) MUST receive a functional viewer regardless of form-factor. This is a strict invariant — the recipient of a share link cannot be told "this works best on desktop"; that ruins the customer's promise to their client.

The shared-link viewer is a separate route (`/share/:token`) with its own scoped capabilities:

- 3D viewer (rotate / pan / zoom + dimension hover) — works on phone + phablet + tablet + desktop
- Sheet viewer — works on every form-factor
- Apartment-layout viewer — works on every form-factor

The viewer is read-only by definition; no mutations are accepted from share-link routes.

### §1.9 — Offline subset works on every form-factor

A subset of the product works offline (via service worker + IndexedDB):

- Read-only viewing of recently-opened projects
- Drafting a support ticket (queued for send when online)
- Drafting an apartment layout in the deterministic engine (D-TGL — already offline-capable per [SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE](../../03-execution/specs/SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE.md))
- Reading documentation
- Viewing the customer's billing history

Authoring requires online — the CRDT sync layer needs the server. Offline-detected state surfaces an in-app banner with "Offline — drafts queued" + the queue size.

### §1.10 — PWA install is supported but not mandatory

The product is installable as a Progressive Web App on every form-factor via the standard browser "Install" prompt. The manifest declares:

- Icon (PRYZM purple `#6600FF` on white, all required sizes)
- Standalone display mode
- Theme + background colour
- Scope = root

The PWA install is a goodwill feature, not a primary distribution channel. We do NOT ship a wrapped-native app via App Store / Play Store (out of scope; would require a separate native investment).

### §1.11 — Every form-factor decision emits a span

Per P8:

- `pryzm.formfactor.detected` — `{ width, height, formFactor, orientation, pixelRatio }` (one per session)
- `pryzm.formfactor.surfaceDowngrade` — `{ surface, formFactor, capability, fromCapability }` (when a surface auto-degrades)
- `pryzm.formfactor.blockedRouteAccess` — `{ surface, formFactor, source: 'direct_nav' \| 'shared_link' \| 'oauth_callback' }`
- `pryzm.formfactor.gestureUsed` — `{ surface, gesture, success }` (TIER-2 telemetry per [C41](C41-TELEMETRY-AND-ANALYTICS.md))
- `pryzm.formfactor.orientationChange` — `{ surface, from, to }`

Spans MUST open at the public boundary of `packages/form-factor/`.

### §1.12 — Performance budgets per form-factor

| Budget | phone | tablet | desktop |
|---|---|---|---|
| First contentful paint (FCP) | < 2.0 s on 4G | < 1.5 s on Wi-Fi | < 1.0 s |
| Interactive (TTI) | < 5.0 s on 4G | < 3.5 s on Wi-Fi | < 2.5 s |
| 3D canvas first-paint (if applicable) | n/a (blocked) | < 3.0 s | < 1.5 s |
| Plan-view zoom (60fps) | maintained | maintained | maintained |
| Memory budget | 250 MB | 600 MB | 2 GB |
| Bundle gzip on first load | 250 KB | 800 KB | 1.5 MB |

The phone budget is aggressive because phone surfaces are read-only viewer / form-only — they don't need to ship the 3D engine. Bundle splitting per form-factor is implemented via per-route code-splitting + the form-factor detector at boot.

### §1.13 — Surfaces that are NOT mobile-installable

Some surfaces SHALL never run on mobile:

- The developer dashboard `developer.dashboard.curation` (admin-only on mobile devices is risky — accidental decisions on a small screen)
- The admin telemetry dashboard
- The plugin SDK testing harness (developer tooling)
- The `admin.<*>` surfaces broadly

These surfaces return `blocked` on `phone` + `phablet` + `tablet` form-factors. Desktop-only.

### §1.14 — Discipline-neutrality

The form-factor matrix MUST NOT depend on the customer's discipline. Per the C00 governance discipline-neutrality bar.

### §1.15 — In-product "best on desktop" messaging

When a `blocked` surface is accessed on an unsupported form-factor, the user sees a friendly page with:

- The PRYZM logo + reassurance ("Hi, PRYZM works best on desktop for design work.")
- A summary of what the user CAN do on their current device (per the surface matrix)
- A magic-link option ("Send a link to my email to open on my laptop")
- A direct download link (not visible — see §1.10; we don't ship a native app)

The messaging is NOT a 404. Customers reach this page via direct nav (a saved link) or accidental tap. They deserve a clear next-step.

---

## §2 — Schema (in `packages/schemas/src/form-factor/`)

L0-pure. No I/O, no THREE, no DOM.

### §2.1 — Top-level types

| Schema | Owns |
|---|---|
| `FormFactor` | `'phone' \| 'phablet' \| 'tablet' \| 'desktop'` |
| `Orientation` | `'portrait' \| 'landscape'` |
| `SurfaceCapability` | `'full' \| 'read-only' \| 'form-only' \| 'blocked'` |
| `SurfaceCapabilityMatrix` | `Record<SurfaceId, Record<FormFactor, SurfaceCapability>>` |
| `SurfaceId` | branded string — e.g. `'editor.canvas'`, `'billing.invoices'` |
| `Gesture` | `'tap' \| 'long_press' \| 'pinch' \| 'spread' \| 'pan' \| 'orbit' \| 'swipe_left' \| 'swipe_right' \| 'pull_refresh'` |
| `FormFactorDetection` | `{ formFactor, orientation, width, height, pixelRatio, touchPrimary: boolean, detectedAt }` |
| `BreakpointConfig` | `{ phoneMax: 600, phabletMax: 768, tabletMax: 1024 }` (compile-time constant) |
| `TouchTargetMinSize` | `{ formFactor, minWidth: number, minHeight: number }` (44×44 on touch, 24×24 on desktop) |
| `OrientationLock` | `{ surface: SurfaceId, allowedOrientations: Orientation[] }` |

### §2.2 — Field-level constraints

| Field | Constraint |
|---|---|
| `BreakpointConfig` | strict order: `phoneMax < phabletMax < tabletMax` |
| `SurfaceCapability` for `share-link.viewer` | MUST NOT be `blocked` on any form-factor (per §1.8) |
| `SurfaceCapability` for `marketing.*` + `auth.*` + `billing.*` + `support.help-search` | MUST be `full` on every form-factor (always-reachable surfaces) |
| `TouchTargetMinSize.minWidth` | `>= 44` for non-desktop, `>= 24` for desktop |

### §2.3 — Reserved surface paths

Surface IDs follow `<area>.<subarea>` patterns from §1.4. New surfaces MUST register in the matrix at composition time; CI fails if a surface routes without a matrix entry.

---

## §3 — Stores

### §3.1 — `FormFactorStore` (`packages/form-factor/src/store.ts`)

Client-side. Holds the current `FormFactorDetection`. Updates on resize + orientation change (debounced 200 ms). Reactive — components subscribe via `useFormFactor()`.

### §3.2 — `SurfaceCapabilityRegistry` (`packages/ui-base/src/surfaceCapability.ts`)

Client-side. Holds the canonical capability matrix. Composed at boot from the per-surface declarations.

### §3.3 — `OrientationLockRegistry` (`packages/form-factor/src/orientationLock.ts`)

Client-side. Per-surface orientation tolerance.

### §3.4 — `OfflineQueueStore` (`packages/form-factor/src/offlineQueue.ts`)

Client-side, IndexedDB-backed. Holds the queue of mutations to ship on reconnection. Per §1.9.

### §3.5 — Persistence

Most stores are session-scoped. The offline queue persists across sessions in IndexedDB. The PWA manifest itself is a static file served by `apps/editor`.

### §3.6 — Routing pipeline

```
router enter: SurfaceId
   │
   ▼  read current FormFactor + Orientation
   │
   ▼  lookup capability in SurfaceCapabilityRegistry
   │
   ▼  branch:
   │     - full       → render full surface
   │     - read-only  → render the read-only variant (component selects variant via the capability prop)
   │     - form-only  → render the form-only variant
   │     - blocked    → redirect to /unsupported-form-factor?surface=<id>
   │
   ▼  emit pryzm.formfactor.surfaceDowngrade if capability < full
   │
   ▼  validate orientation lock; show rotate-device hint if violated
```

---

## §4 — Commands

All commands route through `commandBus` per P6 + [C16](C16-COMMAND-AUTHORING-PROTOCOL.md). All open OTel spans per §1.11.

### §4.1 — User-facing

| Command | Effect |
|---|---|
| `formfactor.requestDesktopLink` | Customer-initiated — send a magic-link email to open the current URL on a desktop browser |
| `formfactor.installPWA` | Trigger the browser's PWA install prompt (where supported) |
| `formfactor.dismissBestOnDesktopBanner` | Remember the user's "don't show this again" preference (per-session) |

### §4.2 — Server-only

| Command | Effect |
|---|---|
| `formfactor.recordSession` | TIER-2 telemetry — record per-session form-factor distribution (per [C41](C41-TELEMETRY-AND-ANALYTICS.md)) |
| `formfactor.aggregateMonthly` | Cron — aggregate form-factor distribution for the monthly trust-report |

---

## §5 — UI

### §5.1 — "Best on desktop" landing for blocked surfaces

`apps/editor/src/ui/unsupported-form-factor/` — the landing page for `blocked` surface access. Renders:

- Friendly headline ("This works best on desktop")
- A summary of what works at the current form-factor (read-only viewer; billing; support; etc.)
- "Email me a link to open on my laptop" CTA (calls `formfactor.requestDesktopLink`)
- "Continue to mobile-friendly version" CTA (links to the equivalent surface that DOES work)

### §5.2 — Read-only banner on `read-only` surfaces

When a surface renders in `read-only` capability, a banner at the top reads "Viewing in read-only — switch to desktop to edit". The banner is non-dismissable (re-renders on every navigation to a read-only surface).

### §5.3 — Bottom-sheet pattern for mobile panels

On `phone` + `phablet`, panels that on desktop render as a right-side dock render as a bottom sheet (swipe-up to expand, swipe-down to dismiss). This is the standard mobile UX pattern.

The bottom-sheet implementation is in `packages/ui-base/src/mobile/bottomSheet.ts`; all panels that have a mobile variant share the same component.

### §5.4 — Mobile-first plan-view (2D)

The 2D plan view DOES work fully on phone + phablet (per §1.4). The touch gesture set is:

- Pinch + spread → zoom (around the focal point of the pinch)
- Two-finger drag → pan
- Tap → select element
- Long-press → context menu
- Single-finger drag (on selected element) → move (snap-grid honoured)
- Swipe (on a level) → switch active level

This is the closest PRYZM gets to "BIM authoring on mobile" — and only in 2D, with constrained operations. It is intentionally limited.

### §5.5 — Rotate-device hint

When the device orientation violates the current surface's orientation lock, a centred modal renders an animated icon (a phone rotating) + "Rotate your device to continue". The modal is auto-dismissing on rotation.

### §5.6 — PWA install banner

When the browser signals PWA install eligibility (`beforeinstallprompt` event), the product shows a subtle bottom-of-page banner: "Install PRYZM for faster access". Dismissable for 30 days. Tapping the install CTA calls `formfactor.installPWA`.

### §5.7 — Offline banner

When `navigator.onLine === false` is detected, the editor shell renders a top-of-page status bar in amber: "Offline — your changes will save when you reconnect (N pending)". The N updates as the queue grows / drains.

### §5.8 — Keyboard surface

Touch surfaces do NOT typically have a keyboard; bluetooth + on-screen keyboards are honoured per [C43](C43-ACCESSIBILITY.md). The on-screen keyboard is auto-detected (resize event) + the UI re-flows above it.

WCAG 2.5.5 / 2.5.8 touch-target sizing per [C43 §1.5](C43-ACCESSIBILITY.md).

---

## §6 — CI gates

| Gate | Path | What it checks |
|---|---|---|
| `check-surface-matrix-coverage` | `tools/ga-gate/check-surface-matrix-coverage.ts` | Every routed `SurfaceId` has an entry in the capability matrix (per §1.4) |
| `check-share-link-always-renders` | `tools/ga-gate/check-share-link-always-renders.ts` | Share-link viewer surfaces have NO `blocked` capability on any form-factor (per §1.8) |
| `check-touch-target-size` | `tools/ga-gate/check-touch-target-size.ts` | Every `<Button>` / `<TouchableArea>` snapshot renders at ≥ 44 px on touch form-factors (per §1.5) |
| `check-gesture-vocabulary` | `tools/ga-gate/check-gesture-vocabulary.ts` | No code path registers a gesture outside the §1.6 vocabulary |
| `check-form-factor-spans` | extends `check-spans.ts` | Every public `packages/form-factor/` boundary function carries an OTel span (per §1.11) |
| `check-form-factor-schemas-pure` | extends schema-purity check | `packages/schemas/src/form-factor/` has zero I/O, zero THREE, zero DOM (per P5) |
| `check-orientation-lock-defined` | `tools/ga-gate/check-orientation-lock-defined.ts` | Every surface registered in the matrix has an orientation-lock entry (default: both allowed) |
| `check-mobile-bundle-budget` | extends `verify-bundle-size.mjs` | The phone-form-factor entry bundle ships < 250 KB gzip on first load (per §1.12) |
| `check-pwa-manifest` | `tools/ga-gate/check-pwa-manifest.ts` | The PWA manifest references all required icon sizes + scope = root |
| `check-mobile-tested-routes` | scheduled job — playwright | Every route in the matrix has a passing playwright test for its declared capability per form-factor |
| `check-no-direct-store-write` | eslint rule | UI code under `apps/editor/src/ui/unsupported-form-factor/` MUST NOT import `FormFactorStore` directly for mutation; only via `commandBus` (per P6) |

### §6.2 — Conformance suites

| Suite | Path | Asserts |
|---|---|---|
| Surface capability | `packages/form-factor/__tests__/surface-capability.test.ts` | Each (surface × form-factor) pair renders the documented capability variant |
| Touch-target sizing | `packages/ui-base/__tests__/touch-target-size.test.ts` | Random sample of 100 buttons + links + tabs renders ≥ 44 px on touch form-factors |
| Gesture handler | `packages/ui-base/__tests__/gesture-handler.test.ts` | Every documented gesture (tap, long-press, pinch, etc.) fires the registered handler |
| Orientation lock | `packages/form-factor/__tests__/orientation-lock.test.ts` | Surfaces with portrait-only lock surface the rotate-device hint in landscape |
| Offline queue | `packages/form-factor/__tests__/offline-queue.test.ts` | Mutations queue on offline + flush on reconnection in original order |
| PWA install | `tests/e2e/pwa-install.spec.ts` | beforeinstallprompt fires + the install CTA is reachable |
| Share-link viewer mobile | `tests/e2e/share-link-mobile.spec.ts` | Share-link viewer functional on phone + phablet + tablet + desktop |

---

## §7 — NFT targets

| NFT | Target | Bench |
|---|---|---|
| FCP on phone (4G) | < 2.0 s | `mobile-fcp-4g.bench.ts` (new) |
| TTI on phone (4G) | < 5.0 s | `mobile-tti-4g.bench.ts` (new) |
| 3D viewer cold mount on tablet | < 3.0 s | `tablet-3d-cold.bench.ts` (new) |
| Plan-view pinch-zoom 60 fps on tablet | maintained for 10 s | `plan-pinch-zoom.bench.ts` (new) |
| Bottom-sheet open animation | < 250 ms | `bottom-sheet-open.bench.ts` (new) |
| Form-factor detection on boot | < 5 ms | `form-factor-detect.bench.ts` (new) |
| Surface capability lookup | < 0.1 ms (in-memory) | inherited from registry budget |
| Offline-queue persist (single mutation) | < 100 ms | `offline-queue-persist.bench.ts` (new) |
| Service-worker registration on first visit | < 1 s | `sw-register.bench.ts` (new) |

---

## §8 — Migration plan

### §8.1 — New package `packages/form-factor/`

```
packages/form-factor/
  src/
    index.ts                       — composeFormFactor() boundary
    store.ts                       — FormFactorStore
    detector.ts                    — matchMedia + orientation listener
    orientationLock.ts             — OrientationLockRegistry
    offlineQueue.ts                — IndexedDB-backed queue
    bestOnDesktopMessenger.ts      — magic-link sender
    pwaInstall.ts                  — wrapper around beforeinstallprompt
    serviceWorker/
      register.ts                  — SW registration
      strategy.ts                  — cache-first for static, network-first for API
    schemas/                       — re-exports
```

Wired into `composeRuntime()` at L3. The `packages/ui-base/` package gains a `mobile/` sub-tree with the BottomSheet + TouchableArea components.

### §8.2 — Phased rollout

| Phase | Deliverable | Estimate |
|---|---|---|
| MOBILE-α-1 | `packages/schemas/src/form-factor/` + zod | 0.3 wk |
| MOBILE-α-2 | `packages/form-factor/` detector + store | 0.5 wk |
| MOBILE-α-3 | `SurfaceCapabilityRegistry` + matrix declaration | 0.5 wk |
| MOBILE-α-4 | Router integration: capability-aware route resolution | 0.5 wk |
| MOBILE-β-1 | "Best on desktop" landing + magic-link sender | 0.5 wk |
| MOBILE-β-2 | Read-only banner + bottom-sheet pattern + rotate-device hint | 1 wk |
| MOBILE-β-3 | Touch-target size adjustments across ui-base | 1 wk |
| MOBILE-β-4 | Share-link viewer mobile testing + fixes | 1.5 wk |
| MOBILE-β-5 | 2D plan-view touch gestures | 1 wk |
| MOBILE-γ-1 | PWA manifest + service worker + offline queue | 1.5 wk |
| MOBILE-γ-2 | Bundle splitting per form-factor | 1 wk |
| MOBILE-γ-3 | Mobile playwright suite (every route × form-factor) | 1.5 wk |
| MOBILE-δ-1 | CI gates (§6) all green | 0.5 wk |

**Total: ~11 wk** (within the master plan's Phase 6.3 budget when paralleled with C43).

### §8.3 — Backward compatibility

The product today works on tablet + desktop. Phone access exists but is degraded (panels overlap, touch targets too small, no proper gesture support). The migration progressively improves; existing customers on phone gain a useable viewer + form-only surface.

### §8.4 — Test plan

Per [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) test convention. Every (surface × form-factor) pair has a playwright test. Manual QA on real devices (iPhone 14 + Pixel 7 + iPad Pro + iPad Mini + Surface laptop) at each release. Real-device matrix is documented in [C45](C45-BROWSER-AND-DEVICE-MATRIX.md).

---

## §9 — What is NOT in this contract

- **Native mobile app (App Store / Play Store)** — explicitly out per §1.10. The PWA fills this role.
- **Smartwatch / wearable surfaces** — out of scope; no compelling BIM use case.
- **Apple Pencil / S Pen precision drawing** — interesting but out of scope (the canvas's bounded-responsibility for stylus precision is significant work).
- **3D authoring on phone** — explicitly blocked per §1.4. Not in scope.
- **AR / VR walkthrough on mobile** — separate forthcoming track (Family Platform + AR/VR future scope per memory).
- **Push notifications** — out of scope (no compelling use case yet; email + in-product banner suffices).
- **Background sync** — beyond the offline queue, no background work.
- **Mobile-specific marketing pages** — the marketing site renders identically on mobile (responsive); no separate mobile microsite.
- **Browser-engine compatibility** — covered by [C45](C45-BROWSER-AND-DEVICE-MATRIX.md).
- **Right-to-left layouts on mobile** — covered by [C46](C46-I18N-AND-L10N.md).
- **Accessibility specifics for touch surfaces** — covered by [C43](C43-ACCESSIBILITY.md) §1.5 + WCAG 2.5.8.

---

## §10 — Open questions (DRAFT-stage)

1. **iPad Pro 12.9" classification**. At 1024 px landscape it crosses into desktop classification by §1.2 width-threshold, BUT it has touch-primary input. Currently the form-factor is `tablet` regardless of size; should we add a "large-tablet" tier? Decision pending.
2. **Foldable phones**. Galaxy Fold + Pixel Fold cross from phone → small-tablet on unfold. The matchMedia listener catches this. The current breakpoint matrix handles it correctly; verify on real device.
3. **3G + 2G performance budget**. §1.12 lists 4G. Customers in markets with predominant 3G (parts of India, SEA) will not meet the budgets. Decision pending whether to provide a "lite" mode or accept the geography limitation.
4. **PWA notifications**. Browsers increasingly support notifications via PWA. Out of scope today but reconsider in 12 months if a clear use case emerges (e.g. SEV-1 ticket alerts for support engineers).
5. **2D plan-view authoring on phone**. §5.4 lists tap-to-select + drag-to-move on phone but the capability matrix puts editor.canvas (plan-view) at `read-only` for phone. Inconsistency — fix one of: matrix or §5.4 narrative. Decision pending.
6. **Per-form-factor pricing**. Is a "phone-viewer-only" cheap tier compelling for site supervisors? Today the entitlement is uniform per [C39](C39-PRICING-AND-PLAN-TIERS.md). Could be a future "Field" tier.
7. **Long-press conflict with native browser long-press menu**. iOS Safari's long-press on text opens its own menu by default. The contract's `long-press` gesture maps to context-menu — overlapping with native. Need a per-platform conflict-resolution strategy.
8. **Bluetooth keyboard on tablet**. A user with a Bluetooth keyboard on iPad gets some keyboard surface but the form-factor still resolves to `tablet`. Should a keyboard-detected tablet upgrade to desktop-grade surfaces? Trade-off: ergonomics of small screen + keyboard vs. capability uplift. Defer to operational data.

---

## §11 — Cross-reference summary

| Contract | Relationship |
|---|---|
| [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) | P6 — every form-factor mutation through commandBus; schemas L0-pure |
| [C04](C04-RENDERING-AND-SCHEDULING.md) | Per-form-factor perf budget; 3D viewer mobile rendering strategy |
| [C06](C06-UI-SHELL-AND-TOOLS.md) | UI shell hosts the breakpoint detection + the read-only banner + bottom-sheet pattern |
| [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md) | P8 spans for every form-factor decision |
| [C16](C16-COMMAND-AUTHORING-PROTOCOL.md) | All `formfactor.*` commands follow the protocol |
| [C39](C39-PRICING-AND-PLAN-TIERS.md) | "Field tier" potential follow-on for site-supervisor mobile-viewer-only access |
| [C41](C41-TELEMETRY-AND-ANALYTICS.md) | TIER-2 form-factor session distribution telemetry |
| [C43](C43-ACCESSIBILITY.md) | Touch-target sizing aligns with WCAG 2.5.8 |
| [C45](C45-BROWSER-AND-DEVICE-MATRIX.md) | Sibling — browser-engine compatibility per OS / form-factor |
| [C46](C46-I18N-AND-L10N.md) | Sibling — RTL on mobile + locale-aware mobile breakpoints |

---

*End — C44 Mobile & Tablet, 2026-06-01 — DRAFT.*
