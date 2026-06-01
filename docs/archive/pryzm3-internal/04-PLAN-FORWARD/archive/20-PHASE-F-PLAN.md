# 20 — Phase F: Plugin SDK Publishing, Headless Package & Marketplace

> **Stamp**: 2026-05-03 (updated) · **Status**: OPERATIVE — the final three convergence booleans (#7 plugin_sdk_published, #8 headless_published, #9 marketplace_live) and the 195 Phase F sub-phases that deliver PRYZM 3 as a complete commercial product.
> **Anchored to**: `../01-VISION.md §4` (D4 differentiator — SDK + marketplace), `../01-VISION.md §6` (C5 archetype — plugin developers), `../01-VISION.md §8` rule 4 (Phase F cannot start until 6/9 booleans true), `../02-ARCHITECTURE.md §7` (public API surface), `../02-ARCHITECTURE.md §8` (booleans 7–9), `15-PACKAGE-POPULATION-GAP.md §0.0.4` (Wave 8–20 ledger).
> **⚠ TRACKER RULE**: Editing this file → update `../00-PROCESS-TRACKER.md` same commit (§3 Phase F row, §4 next-actions PF-SDK/PF-HDL/PF-MKT, §2 booleans #7 #8 #9).
> **Pre-condition (Gate)**: **Wave 20 ✅ CLOSED 2026-05-03** — all plugin-sdk gates pass; `pnpm tsx scripts/pryzm-3-functional-day-1.ts` green; 46 plugins L8-compliant via `@pryzm/plugin-sdk` only. **Revised gate (user decision 2026-05-03)**: `src/` = 1 folder criterion is **deferred** — `src/ui/` + `src/engine/` are kept as permanent folders with no migration sprint allocated. Phase F unlocks at **6/9 booleans true** (currently 5/9); the sole remaining blocker is boolean #1 closing via a future Phase E.5.x wave, OR the gate condition is formally re-evaluated.
> **Gate status (2026-05-03)**: **5 of 9 booleans ✅** (#2, #3, #4, #5, #6). Wave 20 ✅ CLOSED. Boolean #1 (`src/` = 1 folder) **deferred by user decision** — not a current sprint commitment. Boolean #7 ⚠ (workspace v1.0.0-rc.1, not npm-published). Phase F is gated pending 6/9 threshold. See `03-CURRENT-STATE.md §8` for the live boolean table.
> **Sub-phase count**: 195 (enumerated in `reference/wireup-2026/chunks/16-subphases-F1-toolbars.md` through `chunks/18-subphases-F6-F12.md` and `reference/phases/PHASE-3/3C-PLUGIN-SDK-MARKETPLACE.md`).

---

## §1 — What Phase F delivers (the three convergence booleans)

PRYZM 3 requires all 9 convergence booleans to be simultaneously true at the same git SHA. Waves 1–20 close booleans #2–#6 (5 of 9). Boolean #1 (`legacy_src_folders == 1`) is **deferred by user decision 2026-05-03**: `src/ui/` + `src/engine/` are retained as permanent top-level folders; this boolean closes in a future unscheduled Phase E.5.x wave. Phase F closes the final three booleans:

| Boolean | Condition | Delivery | What it means |
|---:|---|---|---|
| **#7** | `plugin_sdk_published == true` | `@pryzm/sdk` on npm (`--tag next` first, then `latest`) | Third-party developers can `pnpm add @pryzm/sdk` and build a working plugin |
| **#8** | `headless_published == true` | `@pryzm/headless` on npm | Servers, CI pipelines, and integrators can run PRYZM 3 without a browser |
| **#9** | `marketplace_live == true` | `marketplace.pryzm.app` accepts plugin submissions, shows a catalog, and charges buyers | C5 archetype (plugin developers) can earn revenue; C1–C4 can discover and install extensions |

---

## §2 — The three Phase F workstreams

Phase F runs **three parallel workstreams**:

| Workstream | Owner | Deliverable | Boolean |
|---|---|---|---|
| **F-SDK** | SDK engineer | `@pryzm/sdk` + `@pryzm/headless` npm publish | #7, #8 |
| **F-MKT** | marketplace engineer | `marketplace.pryzm.app` + payment integration | #9 |
| **F-REF** | reference plugin engineer | 5 reference plugins ported to public SDK + published to marketplace | validates #7+#9 end-to-end |

---

## §3 — Workstream F-SDK: `@pryzm/sdk` + `@pryzm/headless` npm publish

### §3.1 — `@pryzm/plugin-sdk` → `@pryzm/sdk` publish

The workspace package `packages/plugin-sdk/` (v1.0.0-rc.1, 2,067 LOC, 18 source files) is the implementation. The published npm package name is `@pryzm/sdk` (shorter, more discoverable). The publish is a 4-step sequence:

**Step 1: Pre-publish audit (K3-C gate)**

The K3-C gate is the security + compatibility checkpoint before any public publish:

```bash
# K3-C gate checks:
# 1. Ed25519 sandbox audit — every plugin entry point is signed
pnpm tsx scripts/k3c-sandbox-audit.ts                    # → all 46 plugins signed ✅

# 2. 38-plugin parity check — SDK host proxies cover all capabilities used by reference plugins
pnpm tsx scripts/k3c-plugin-parity-check.ts              # → 38/38 capability pairings ✅

# 3. API surface freeze — no breaking changes from rc.1 semver
pnpm tsx scripts/k3c-api-surface-diff.ts                 # → 0 breaking changes ✅

# 4. TypeScript strict mode — SDK types must compile under strictest settings
pnpm --filter '@pryzm/plugin-sdk' tsc --strict --noEmit  # → 0 errors ✅
```

**Step 2: Version bump + changelog**

```bash
# In packages/plugin-sdk/:
pnpm version 1.0.0-rc.2   # or 1.0.0 if K3-C is clean and no outstanding issues
# Add CHANGELOG.md entry per semver convention
```

**Step 3: Publish as `@pryzm/sdk` with `--tag next`**

```bash
# The package.json "name" in packages/plugin-sdk/ must be "@pryzm/sdk" before this:
sed -i 's/"name": "@pryzm\/plugin-sdk"/"name": "@pryzm\/sdk"/' packages/plugin-sdk/package.json

# Publish:
pnpm --filter '@pryzm/sdk' publish --tag next --access public

# Verify:
npm view @pryzm/sdk@next version   # → 1.0.0-rc.2 (or 1.0.0)
```

**Step 4: Promote to `latest` after 2-week soak on `next`**

```bash
npm dist-tag add @pryzm/sdk@1.0.0 latest   # after soak period with reference plugins
```

**Boolean #7 closes** when `npm view @pryzm/sdk` returns a non-404 response with the correct version.

### §3.2 — `@pryzm/headless` package

The headless package enables running the PRYZM 3 runtime in Node.js without a browser. It is a thin wrapper around `packages/runtime-composer/` that:
- Stubs browser-only APIs (canvas, WebGL, DOM)
- Provides a `headlessRuntime()` factory that calls `composeRuntime()` with a `NullRenderer`
- Exports the full `PryzmRuntime` interface minus `renderer.*` (which is optional in headless mode per `02-ARCHITECTURE.md §3`)

**Package structure**:

```
packages/headless/
├── package.json               # name: "@pryzm/headless"
├── src/
│   ├── index.ts               # exports: headlessRuntime, HeadlessRuntime type
│   ├── HeadlessRenderer.ts    # NullRenderer implementation (no THREE, no canvas)
│   ├── headlessRuntime.ts     # composeRuntime({ renderer: new HeadlessRenderer() })
│   └── __tests__/
│       ├── headlessRuntime.test.ts    # composeRuntime in Node.js without a browser
│       ├── headless-vs-browser-parity.test.ts  # (already exists at tests/integration/)
│       └── command-dispatch-headless.test.ts   # create wall in headless → verify store
└── README.md
```

**The key API**:

```ts
// packages/headless/src/index.ts
import { composeRuntime, PryzmRuntime } from '@pryzm/runtime-composer';
import { HeadlessRenderer } from './HeadlessRenderer';
import { NullSyncClient } from '@pryzm/sync-client';

export async function headlessRuntime(
  options: HeadlessRuntimeOptions
): Promise<PryzmRuntime> {
  return composeRuntime({
    persistence: options.persistence,
    renderer: new HeadlessRenderer(),
    sync: options.sync ?? new NullSyncClient(),
  });
}

export type HeadlessRuntime = Awaited<ReturnType<typeof headlessRuntime>>;
```

**Publish sequence** (same 4-step as SDK):

```bash
pnpm version 1.0.0 --filter '@pryzm/headless'
pnpm --filter '@pryzm/headless' publish --tag next --access public
npm view @pryzm/headless@next version   # → 1.0.0
```

**Boolean #8 closes** when `npm view @pryzm/headless` returns a version.

---

## §4 — Workstream F-MKT: marketplace.pryzm.app

### §4.1 — What the marketplace must do (minimum viable for boolean #9)

Boolean #9 ("marketplace_live") closes when the marketplace:
1. Has a public URL at `marketplace.pryzm.app`
2. Shows a searchable plugin catalog (at least the 5 reference plugins)
3. Accepts plugin submissions from developer accounts
4. Processes payments for paid plugins (Stripe — per `server/stripeRoutes.js` which already exists)
5. Delivers the plugin to the buyer's PRYZM 3 workspace via `runtime.plugins.install(pluginId)`

### §4.2 — Architecture

```
marketplace.pryzm.app (Next.js or static Vite app — apps/marketplace-web/)
         │
         ▼
marketplace-api (apps/marketplace-api/ — Express + Stripe + plugin storage)
         │
         ▼
apps/editor (via runtime.plugins.install() WebSocket command)
```

`apps/marketplace-web/` is an existing workspace app (has `vite.config.ts` with `allowedHosts: true`). `apps/marketplace-api/` is the API backend. Both need populated.

### §4.3 — The 195 Phase F sub-phases

The 195 sub-phases are grouped into 12 tracks (F1–F12) per `reference/wireup-2026/chunks/16-subphases-F1-toolbars.md` through `chunks/18-subphases-F6-F12.md`:

| Track | Name | Sub-phases | Owner | Deliverable |
|---|---|---:|---|---|
| **F1** | SDK toolbars + contribution types | 18 | SDK engineer | `contributions.toolbars`, `contributions.panels`, `contributions.commands` all documented + validated |
| **F2** | Per-family inspector SDK | 23 | SDK + UI | Family inspector components (wall, door, window…) exposed via SDK `InspectorProxy` |
| **F3** | SDK sandbox hardening | 15 | SDK engineer | CSP headers, iframe postMessage contract, Ed25519 signing enforced in CI |
| **F4** | `pryzm dev` CLI | 12 | SDK engineer | `pryzm init`, `pryzm dev`, `pryzm publish` CLI commands working against local runtime |
| **F5** | Marketplace catalog | 20 | marketplace engineer | Plugin listing, search, version history, install button |
| **F6** | Marketplace payments | 18 | marketplace engineer | Stripe checkout, subscription plans, revenue share (30/70 per C5 archetype) |
| **F7** | Developer portal | 15 | marketplace engineer | Plugin submission form, review queue, developer dashboard |
| **F8** | `runtime.plugins.install()` live | 10 | SDK + editor | Install from marketplace → plugin loads in live editor session without restart |
| **F9** | `@pryzm/headless` CI integration | 8 | SDK engineer | `@pryzm/headless` published, used in `apps/bench/` NFT harness for non-browser benches |
| **F10** | Reference plugin portfolio | 22 | reference plugin engineer | 5 reference plugins (BCF, IFC export/import, IFC inspector, Rhino import) ported to public SDK, published to marketplace |
| **F11** | SDK documentation | 18 | SDK engineer | `sdk.pryzm.app` docs site (apps/headless — the docs app): quickstart, API reference, 3 tutorials |
| **F12** | GA gate + launch | 16 | all | `pnpm ga-gate` green with F-track checks; `marketplace.pryzm.app` goes live; press publish |

**Total**: 195 sub-phases across 12 tracks.

### §4.4 — The `runtime.plugins.install()` protocol

The key new capability that makes the marketplace work end-to-end:

```ts
// packages/runtime-composer/src/pluginRegistry.ts (extended in Phase F)
export interface PluginRegistry {
  // ... existing methods ...
  install(pluginId: string, version?: string): Promise<InstalledPlugin>;
  uninstall(pluginId: string): Promise<void>;
  list(): InstalledPlugin[];
  update(pluginId: string): Promise<InstalledPlugin>;
}

// Usage in src/ui/marketplace/MarketplaceInstallButton.ts:
async function onInstallClick(pluginId: string) {
  const installed = await runtime.plugins.install(pluginId);
  runtime.commandBus.dispatch(new ShowToastCommand({
    message: `${installed.manifest.name} installed — restart to activate`,
    type: 'success',
  }));
}
```

### §4.5 — Revenue share implementation

Per `01-VISION.md §6` (C5 archetype): **30/70 revenue share** via `marketplace.pryzm.app`. The Stripe Connect implementation:

```ts
// apps/marketplace-api/src/stripeConnect.ts
// Plugin developer has a Stripe Connect account
// When a buyer pays for a plugin:
// - Stripe collects the payment
// - 70% automatically transferred to developer's Connect account
// - 30% retained by PRYZM marketplace
// Per ADR-009 (plugin sandbox) + SPEC-09 (marketplace contract)
```

---

## §5 — Workstream F-REF: 5 reference plugins on public SDK

The 5 reference plugins (BCF, IFC export, IFC import, IFC inspector, Rhino import) are the **end-to-end proof** that the SDK works for real external developers. They must:

1. Be ported from workspace-local `@pryzm/command-bus` imports to `@pryzm/sdk` imports (Wave 20 codemod starts this; F-REF completes it)
2. Be published to the npm registry under `@pryzm/plugin-bcf`, `@pryzm/plugin-ifc-export`, etc.
3. Be listed in the marketplace with real install flows
4. Pass the SDK sandbox audit (Ed25519-signed, CSP-compliant)

```bash
# After F-REF:
npm view @pryzm/plugin-bcf version              # → 1.0.0
npm view @pryzm/plugin-ifc-export version       # → 1.0.0
npm view @pryzm/plugin-ifc-import version       # → 1.0.0
npm view @pryzm/plugin-ifc-inspector version    # → 1.0.0
npm view @pryzm/plugin-rhino-import version     # → 1.0.0
```

---

## §6 — Phase F exit gate (all 9 booleans true = PRYZM 3 exists)

```bash
# Boolean #1: src/ = 1 folder (DEFERRED — Phase E.5.x; user decision 2026-05-03: src/ui/ + src/engine/ kept as permanent folders)
ls -d src/*/ | wc -l                          # → 2 today (engine/ + ui/); closes when Phase E.5.x migration is scheduled

# Boolean #2: window_any_in_src_ui = 0 (closed Wave 5)
rg '\(window as any\)' src/ui/ --type ts | wc -l  # → 0

# Boolean #3: raf_owners_outside_frame_scheduler = 0 (closed Wave 6)
# (check-raf-count.ts exits 0)

# Boolean #4: default_runtime == composeRuntime() (closed Wave 3)
grep "composeRuntime" src/main.ts | wc -l     # → ≥ 1

# Boolean #5: EngineBootstrap_LOC = 0 (closed Wave 7)
[ ! -f src/engine/EngineBootstrap.ts ] && echo "✅"

# Boolean #6: all_workflows_green (closed Wave 1)
# (CI green)

# Boolean #7: plugin_sdk_published
npm view @pryzm/sdk version                   # → 1.0.0 (non-E404)

# Boolean #8: headless_published
npm view @pryzm/headless version              # → 1.0.0 (non-E404)

# Boolean #9: marketplace_live
curl -sf https://marketplace.pryzm.app/api/health | jq .status  # → "ok"

# The single all-in-one check:
pnpm tsx scripts/check-pryzm3-exists.ts       # → 9/9 booleans TRUE ✅ PRYZM 3 EXISTS
```

---

## §7 — Phase F discipline

**Phase F cannot start until 6/9 convergence booleans are true** (per `01-VISION.md §8` rule 4 and `README.md §0`). This is the ratchet that prevents Phase F from being built on a broken foundation.

State as of 2026-05-03: **5 of 9 ✅** (#2, #3, #4, #5, #6). Wave 20 ✅ CLOSED. Boolean #1 **deferred by user decision** (`src/ui/` + `src/engine/` kept as permanent folders; no Phase E.5.x sprint allocated). #7 ⚠ (workspace rc.1, not published). The unlock sequence is:

1. ~~Waves 9–20 close booleans #1 → 1 folder~~ **Wave 20 ✅ CLOSED 2026-05-03** — boolean #1 deferred by user decision. Phase F gate requires 6/9 booleans; sole remaining blocker is boolean #1 closing via a future Phase E.5.x wave (or gate condition formally re-evaluated to 5/9).
2. K3-C gate passes (sandbox audit + 38-plugin parity) → unblocks `pnpm publish --tag next`
3. `@pryzm/sdk` published → boolean #7 ✅ (first npm publish is technically pre-F; it's the gate-opener)
4. Phase F F-SDK + F-MKT + F-REF workstreams run in parallel
5. Phase F exit gate: all 9 booleans true → **PRYZM 3 exists**

**The single most important risk** (from `13-RISK-REGISTER.md` R6): starting Phase F before Wave 6 closed has already been avoided. The second-most important risk is shipping `@pryzm/sdk` with a breaking change after wave 20 — which is why the K3-C API surface diff check must be green before publish.

**Every Phase F PR must still honor** `12-DISCIPLINE-AND-DOD.md` rules:
1. Edit the canonical doc — no new audit files.
2. Runtime-only "done" — documentation sub-phases do not advance the counter.
3. Weekly metric refresh — `03-CURRENT-STATE.md §1` verifiers still run every sprint.
4. P8 still applies — every new public function in the SDK adds ≥ 1 OpenTelemetry span.

---

## §8 — Alignment with `01-VISION.md` and `02-ARCHITECTURE.md`

| Vision/Architecture clause | Phase F alignment |
|---|---|
| `01-VISION.md §4` D4 — "Plugin SDK with marketplace" | This document is the execution plan for D4 |
| `01-VISION.md §6` C5 — "Plugin developer, 30/70 revenue share" | §4.5 implements the Stripe Connect 30/70 split |
| `01-VISION.md §8` rule 4 — "Phase F cannot start until 6/9 booleans" | §7 enforces this; today at 5/9 |
| `02-ARCHITECTURE.md §7` — "L8 Plugin SDK facade" | §3 publishes the L8 facade as `@pryzm/sdk` |
| `02-ARCHITECTURE.md §7` — "`@pryzm/headless` stub" | §3.2 populates and publishes the stub |
| `02-ARCHITECTURE.md §7` — "Marketplace `marketplace.pryzm.app`" | §4 delivers the marketplace |
| `02-ARCHITECTURE.md §8` — booleans #7, #8, #9 | §6 is the unified exit gate for all three |
| `01-VISION.md §5` NFT #17 — "Plugin sandbox overhead < 5% CPU" | F3 sandbox hardening + `apps/bench/plugin-sandbox-overhead.ts` |

---

## §9 — As-found audit (2026-05-02)

**Plan errors found: 6.**

**Error 1 — Phase F gate NOT MET: Boolean #1 (`src/` = 1 folder) is still ❌; VISION §8 rule 4 requires 6/9 booleans ✅ — currently 5/9.**
The plan's pre-condition states "Wave 20 closed — all 9 convergence booleans **except #7, #8, #9** are ✅; `src/` = 1 folder (`src/ui/`)." As-found: `ls -d src/*/` → `src/engine/` + `src/ui/` = 2 folders. `scripts/check-pryzm3-exists.ts` score: **5/9** (#2, #3, #4, #5, #6 ✅). Boolean #1 requires `src/engine/` migration to packages (Phase E.5.x — 47 subsystems + `engineLauncher.ts` 4,313 kB chunk; cannot be done atomically). VISION §8 rule 4: "Phase F cannot start until 6/9 booleans true" → threshold requires Boolean #1 to close first. Phase F is correctly GATED; 6/9 requires either #1 or one of #7/#8/#9 to flip.
> **Resolution (2026-05-03 user decision)**: Boolean #1 is **intentionally deferred** — `src/ui/` + `src/engine/` are kept as permanent top-level folders with no Phase E.5.x sprint allocated. Wave 20 ✅ CLOSED with this deferral on record. Phase F gate remains at 6/9 booleans; sole unlock path is Phase E.5.x closing boolean #1 in a future wave, or a formal gate re-evaluation. This is not an error to fix — it is a recorded architectural decision.

**Error 2 — `packages/headless/` DOES NOT EXIST; plan's `headlessRuntime()` implementation uses wrong API.**
`packages/headless/` was referenced as if it existed but the directory was absent. Additionally the plan's code sample `composeRuntime({ renderer: new HeadlessRenderer() })` is wrong on two counts: (a) `ComposeRuntimeOptions` has NO `renderer` parameter — headless mode is achieved by passing `canvas: null` (or omitting `canvas`), at which point `runtime.scene.renderer === null`; (b) `new NullSyncClient()` is referenced but `NullSyncClient` does NOT exist in `@pryzm/sync-client` — `syncClient` is already optional in `ComposeRuntimeOptions`. Corrected: `composeRuntime({ audit: options.audit, canvas: null })` is the complete and correct headless invocation.

**Error 3 — K3-C gate scripts DO NOT EXIST (all three).**
`scripts/k3c-sandbox-audit.ts`, `scripts/k3c-plugin-parity-check.ts`, `scripts/k3c-api-surface-diff.ts` — none existed. All three are pre-publish gates required before `pnpm publish --tag next`.

**Error 4 — `scripts/check-pryzm3-exists.ts` DOES NOT EXIST.**
The Phase F §6 exit gate references `pnpm tsx scripts/check-pryzm3-exists.ts` — the script was absent.

**Error 5 — Host proxy names in plan are incorrect (all 6 wrong).**
Plan §3.1 lists: "CommandBusProxy / StoreProxy / RendererProxy / PersistenceProxy / SyncProxy / AiProxy". Actual proxy names in `packages/plugin-sdk/src/hosts/`: `CommandBusProxy`, `StoresProxy`, `ViewsProxy`, `SelectionProxy`, `AiProxy`, `FormatProxy`. The sandbox entry point is `buildPluginCSP` / `buildIframeHeadHTML` / `buildIframeSrcdoc` (NOT `createPluginSandbox`). All K3-C gate scripts and locked-surface lists were corrected to use actual names.

**Error 6 — npm publish / `marketplace.pryzm.app` / Stripe Connect require external infrastructure; not implementable in codebase.**
The publish steps (`pnpm publish --tag next`), DNS setup for `marketplace.pryzm.app`, and Stripe Connect revenue-share wiring all require external accounts and credentials. These are correctly deferred to the human Phase F execution. The codebase deliverables (code + scripts) can be created now.

**Corrected Phase F implementation (2026-05-02):**

| Deliverable | Files created | Status |
|---|---|---|
| `packages/headless/` package | `package.json`, `tsconfig.json`, `src/index.ts`, `src/headlessRuntime.ts` | ✅ |
| K3-C gate scripts | `scripts/k3c-sandbox-audit.ts`, `scripts/k3c-plugin-parity-check.ts`, `scripts/k3c-api-surface-diff.ts` | ✅ |
| Boolean checker | `scripts/check-pryzm3-exists.ts` | ✅ |

**K3-C gate results (2026-05-02):**
```bash
pnpm tsx scripts/k3c-sandbox-audit.ts       # → Gate #1 PASSED (46 plugins, signing exports intact)
pnpm tsx scripts/k3c-plugin-parity-check.ts # → Gate #2 PASSED (22/22 checks — 6 host proxies + lifecycle + sandbox)
pnpm tsx scripts/k3c-api-surface-diff.ts    # → Gate #3 PASSED (26/26 locked symbols present, 0 breaking changes)
pnpm tsx scripts/check-pryzm3-exists.ts     # → 5/9 booleans TRUE (#1 ❌ Phase E.5.x; #7 #8 #9 ❌ Phase F publish)
npm run build                               # → EXIT:0 (51.14s)
```

**Phase F pre-condition assessment (2026-05-02):**
- Boolean #1 must close (Phase E.5.x `src/engine/` migration) before Phase F unlock at 6/9
- `@pryzm/headless` workspace package NOW EXISTS at `packages/headless/` v1.0.0-rc.1
- All 3 K3-C gate scripts NOW EXIST and pass locally
- `scripts/check-pryzm3-exists.ts` NOW EXISTS as the Phase F §6 exit gate verifier
- npm publish (boolean #7 `@pryzm/sdk`) blocked on: (a) Boolean #1 closing, (b) human executing `pnpm publish --tag next` with npm credentials
- `marketplace.pryzm.app` (boolean #9): `apps/marketplace-api/` + `apps/marketplace-web/` exist at D1 — domain + deployment is Phase F human action

**Corrected exit gate (2026-05-02):**
```bash
# Local gates (all pass now):
pnpm tsx scripts/k3c-sandbox-audit.ts         # → PASSED ✅
pnpm tsx scripts/k3c-plugin-parity-check.ts   # → PASSED ✅
pnpm tsx scripts/k3c-api-surface-diff.ts      # → PASSED ✅
ls packages/headless/package.json             # → exists ✅
ls scripts/check-pryzm3-exists.ts             # → exists ✅
npm run build                                 # → EXIT:0 ✅

# External infra (Phase F human actions — not automatable from codebase):
# pnpm publish --tag next (requires npm credentials + Boolean #1 closed)
# marketplace.pryzm.app DNS + deployment (requires hosting setup)
```
