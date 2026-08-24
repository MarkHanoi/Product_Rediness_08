# SPEC — Project Open / Create Pipeline

> **Stamp**: 2026-05-24 · **Status**: NORMATIVE (reference spec under C02 + C13)
> **Authority**: governed by `C02-COMPOSITION-ROOT-AND-BOOT.md` (boot) and
> `C13-PROJECT-LIFECYCLE-AND-ISOLATION.md` (session lifecycle). When this spec and a
> contract disagree, the contract wins — amend this spec. When code disagrees with this
> spec, the code is wrong (or raise an ADR).
> **Why this exists**: the architect asked for canonical how/why/what documentation of
> project **creation** and **opening** before/while the OI-053 performance work lands, so
> the pipeline is understood and the perf targets are anchored to a written baseline.
> **Companion perf item**: `PRYZM3-MASTER-STATUS.md §11 → OI-053`. **Related**: the
> create-path DB resilience is `DAILY-USE-FIX-LOG-2026-05-20.md Round 50` (§SERVER-503-…).
>
> ⭐ **AMENDED 2026-08-24** (lane EARTH31 · [L-10560](../../04-reference/ISSUE-LOG.md) ·
> [ADR-0369](../../02-decisions/adrs/ADR-0369-the-onboarding-globe-is-built-before-the-engine-boot-not-after-it.md)):
> §3 gains row **O3b — globe pre-warm**, and §5 gains subs **f** (done: the boot now NAMES its own
> stages, so §5-b's *"needs profiler"* is retired), **g** (done: O3b), **h** and **i** (open: the
> globe's REVEAL is still gated on `pryzm-project-loaded`, and `AppPhase` still does not gate the
> boot). §6 gains check **3b**. ⛔ The founder's ask is *"PRYZM Earth should come INSTANTLY"* —
> **O3b guarantees the globe is READY by the reveal; sub h is what moves the reveal itself.**

---

## §1 — Scope + the two pipelines

This spec covers two distinct user actions and their end-to-end execution:

1. **CREATE** — "New project" in the Project Hub → a row exists server-side → the editor opens it.
2. **OPEN** — selecting an existing project → the engine + the project's data become live in the editor.

They overlap: **create ends by invoking open.** The expensive work is almost entirely in OPEN.

The full client call chain (verified from runtime stack traces + `main.ts`):

```
ProjectHub (UI)
  └─ create:  ProjectListController.create → ProjectListClient.create
  └─ open:    PlatformRouter.openProject → _openProjectViaRuntime
                 └─ buildPersistence (runtime-composer)
                       └─ startEngine (main.ts)            ← idempotent; engine is a tab singleton
                             └─ composeRuntime()           ← stores + bus + AUTHORITATIVE handlers
                             └─ engineLauncher.bootstrap() ← initScene → initBuilders → initTools
                                                              → initDataPlatform → initUI
                                                              → handler (re)registration
                       └─ ProjectLoader.load(snapshot)     ← hydrate stores via commands → re-project
```

---

## §2 — CREATE pipeline (NORMATIVE)

| # | Stage | Component | Notes |
|---|-------|-----------|-------|
| C1 | User clicks "New project" | `ProjectHub` | Collects a name (1–200 chars). |
| C2 | `create(name)` | `ProjectListController` → `ProjectListClient.create` | `POST /api/v1/projects { name }`. Client retries 503 with exponential backoff. |
| C3 | Server insert | `server/api/v1/routes.js` `POST /projects` → `pgProjectStore.createProject` | Real PG INSERT, **or** the `§SERVER-PG-DEGRADE` in-memory fallback when the pool is absent/unreachable. Returns a `ProjectSummary` `{ id, name, ownerId, updatedAt, versionCount }`. |
| C4 | Gate | v1 `v1Router.use` migration gate | 503 `migrations_in_progress` ONLY during the brief boot race (keyed on **settled**, not ready — Round 50 D1). MUST NOT permanently block (else create is bricked). |
| C5 | Open the new project | `PlatformRouter.openProject(id)` | Hands off to the OPEN pipeline (§3). |

**CREATE invariants (binding):**
- **C-INV-1** A configured-but-unreachable DB MUST degrade to in-memory, never wall off create (C13; Round 50 D1).
- **C-INV-2** Create latency is dominated by the subsequent OPEN; optimise OPEN, not the INSERT.

---

## §3 — OPEN pipeline (NORMATIVE) — stage breakdown

A project session is the period between `pryzm-project-switch` events (C13 §2). The engine and its
panels are **tab singletons** (`main.ts`): `engineLauncher` bootstrap runs **once per tab (cold boot)**.

| # | Stage | Component(s) | Cost profile (AS-IS) | Target |
|---|-------|--------------|----------------------|--------|
| O1 | Resolve + fetch project | `PlatformRouter._openProjectViaRuntime`, `ProjectListClient.list/get` | Network; gated by §2 C4. | — |
| O2 | Compose runtime | `composeRuntime()` | Builds L1 stores + L2 `CommandBus` + **registers the authoritative plugin handlers** + view-registry. Once per tab. | Once per tab. |
| O3 | Renderer pre-warm | `rendererPrewarm`, `initScene` Phase-5 | **Already optimised** — prewarm ≈200–300 ms; Phase-5 consume skips a ~2.4 s LONGTASK. | Keep. |
| O3b | **Globe pre-warm** | `eagerGlobeStart.prewarmGlobe`, `GISAreaLayout.ensureGisInitialized` | **Added 2026-08-24 (ADR-0369 / L-10560).** The Cesium analogue of O3: `PlatformRouter.showOnboarding` constructs + mounts the ONE `CesiumViewport` **warm-hidden** before O4 begins; `consumePrewarmedGlobe()` hands it to the boot. Was measured at `globe:eager-init-start +2633ms` — i.e. **after O4–O8** — because its only consumer was inside O8. `null` from the consumer means "construct cold" and is a first-class path. | Keep. **Stage 2 (ADR-0369 §7) still owes the REVEAL**, which is gated on `pryzm-project-loaded`. |
| O4 | Scene init | `initScene` | TopologyLayer, FrustumCulling, ViewRenderCache, frame loop, RenderPipelineManager phase ramp (SSGI/outlines). Several 100–1000 ms LONGTASKs. `§I2 usedTimes` dispose/recreate churn. | Slice / defer. |
| O5 | Builder init | `initBuilders` | ALL element subsystems (wall, slab, ceiling, floor, room, roof, plumbing, opening, door/window, furniture, lighting, handrail, stair, beam, grid, …) initialised **serially**. A prime LONGTASK suspect. | rAF-slice / lazy per-type. |
| O6 | Tool init | `initTools` | Tools + the `§P2.1/§P3.x` bus→legacy-store **event bridges** (`wall.created` listeners, etc.). | — |
| O7 | Data platform | `initDataPlatform` | SemanticGraph, TemporalGraph, ConstraintEngine, PhysicsEngine, DecisionRecord, 34-store registry. LONGTASK suspect. | Defer non-critical (Portfolio, AI panels). |
| O8 | UI init | `initUI` | VG governance, view ranges, sheets, schedules, default views, exporters (lazy), curtain-wall wiring, etc. | Defer lazy surfaces. |
| O9 | Handler registration | `engineLauncher` F-1.3/§P3.x + `initBusHandlers` | **Redundant with O2** — composeRuntime already registered the authoritative handlers; this re-registers the same ~25–50 types. See §4. | Idempotent (OI-053a ✅). |
| O10 | Hydrate snapshot | `ProjectLoader.load` | Replays the project snapshot through `Create*Command`s per element type (walls, slabs, curtain walls, …), then triggers plan/3D re-projection (`EdgeProjectorService`). | Batch + incremental projection. |

**OPEN invariants (binding):**
- **O-INV-1 (singleton)** `engineLauncher` bootstrap (O2/O4–O9) MUST run **once per tab**, not once per open. Subsequent opens in a session run ONLY teardown (C13) + O10 hydrate. **✅ Satisfied (verified 2026-05-24):** `startEngine()` is guarded by the module-level `_bootstrapped` flag ([`src/main.ts`](../../../../src/main.ts) §170–191) — set true only after `bootstrap()` resolves (so a failed boot stays retryable). A second open returns early; only `workspaceMount.show()` → `setProjectContext()` + `ProjectLoader` run. **Consequence:** the heavy O4–O8 LONGTASKs are a **one-time cold-boot cost per tab**, not a per-open cost.
- **O-INV-2 (single registrar; idempotent interim)** The **canonical** rule (C02 §1) is that plugin handlers are registered **once**, via `composeRuntime()`'s `registries` input. The O9 re-registration (`engineLauncher` F-1.3/§P3.x + `initBusHandlers`) is a **migration-phase bridge** (C02 §3 family) whose **exit** is its own deletion once every type is proven covered by `composeRuntime`. **Until that exit**, registration MUST be idempotent — registering an already-present type MUST be a silent no-op, never a thrown+caught error ("first registration wins" = composeRuntime's). **(OI-053a — idempotent guard implemented 2026-05-24; see §4. The retirement is the follow-up.)**
- **O-INV-3 (P6)** Hydration MUST flow through commands (`ProjectLoader` → `Create*Command`), never direct store writes (C03/C11).
- **O-INV-4 (isolation)** All per-project mutable state MUST be torn down on `pryzm-project-switch` before the next project loads (C13 §3).
- **O-INV-5 (no blocking main-thread > 1 frame on the critical path)** Long init blocks SHOULD be rAF-sliced or deferred so FPS does not collapse during open (C10).

---

## §4 — Handler registration: the triple-registration problem (OI-053a)

**AS-IS (root cause):** `composeRuntime()` (O2) registers the authoritative plugin handlers.
Then `initBusHandlers()` and the `engineLauncher` F-1.3/§P3.x block (O9) re-register the **same**
command types. `CommandBus.register()` throws `handler already registered: <type>` on a duplicate
([`packages/command-bus/src/CommandBus.ts`]), so O9 previously threw ~25–50× per boot — each caught
and logged as a **red `console.error` with a stack trace** (a real cost with DevTools open, and it
buried genuine errors).

**FIX (2026-05-24, behaviour-preserving):** registration is now **idempotent** —
- `engineLauncher.ts` wraps the bus in a `Proxy` whose `register()` skips when
  `bus.registry.has(type)` (covers the F-1.3/§P3.x calls + CRDT-applier + zoom-fit wiring, and the
  internal `register()` calls inside the plugin `registerXxxHandlers()`);
- `initBusHandlers.ts` `continue`s past any `type` already in `bus.registry` (batch-stub loop +
  §E.5.x bridge loop).

Because the duplicate **always threw and was discarded**, "first registration wins" (composeRuntime's)
is exactly the shipped behaviour — so this removes the throw/catch/stack-trace spam **without changing
which handler is active**, and makes registration safe to re-run on project re-open (O-INV-2). Genuine
handler-shape errors (bad `affectedStores`, missing `execute`) still throw and surface.

**Follow-up:** the redundant O9 calls could be deleted outright once it is proven composeRuntime
registers every type O9 covers; the idempotent guard is the safe interim that also documents the
overlap. The success `console.log` lines in O9 remain (benign) and could be collapsed to one summary.

---

## §5 — Performance work items (OI-053)

Tracked in `PRYZM3-MASTER-STATUS.md §11 → OI-053`. Live boot log (2026-05-24, empty project):
LONGTASKs of **844 ms** + **1008 ms** (plus 6× 130–280 ms) during O4–O8; FPS **1 → 7 → 19 → 25**.

| Sub | Item | Status |
|-----|------|--------|
| **a** | Idempotent handler registration (§4) — kill the ~25–50 duplicate-register throws/logs. | ✅ **Done 2026-05-24** |
| **b** | rAF-slice / defer the O5 (`initBuilders`) + O7 (`initDataPlatform`) LONGTASKs. | 🔍 Open — **⚠ "needs profiler" is no longer true**: `boot:*` marks (sub **f**) name each stage. Read them before slicing. |
| **c** | O-INV-1 (no re-bootstrap per open) is **already satisfied** (engine is a `_bootstrapped`-guarded tab singleton — verified 2026-05-24). Remaining lever: defer non-critical subsystems (DataWorkbench, Portfolio, AI panels) off the **cold-boot** critical path so the one-time boot is lighter. | 🔍 Open (cold-boot deferral only) |
| **d** | `RenderPipelineManager` phase-ramp churn (`§I2 pipeline.usedTimes` dispose/recreate during SSGI/outline activation). | 🔍 Open |
| **e** | O10 hydrate: batch commands + incremental projection (`EdgeProjector` 0% cache hit on rapid create — see OI-054). | 🔍 Open |
| **f** | **Name the boot's stages on the EXISTING instrument.** `boot:engine-start` · `boot:scene-done` · `boot:builders-done` · `boot:tools-done` · `boot:bus-handlers-done` · `boot:data-platform-done` · `boot:ui-done` — mapping 1:1 onto O4/O5/O6/O9/O7/O8 above, so a §STARTUP-BUDGET reading is quotable against THIS table. Before them, the founder's run showed `onboarding:shown +0ms` followed by `globe:eager-init-start +2633ms` with **nothing named in between**. | ✅ **Done 2026-08-24** (lane EARTH31, L-10560) |
| **g** | **Move the onboarding globe's construction off the critical path** — O3b above. | ✅ **Done 2026-08-24** (ADR-0369 Stage 1) |
| **h** | ~~**Ungate the location step from `pryzm-project-loaded`**~~ — ⛔ **REDIRECTED 2026-08-24 (lane STARTUP37, L-10723).** The location step calls `window.pryzmToggleGIS(true)` to REVEAL the globe, and `pryzmToggleGIS` is installed by `mountGISArea` **inside `initUI`** — the LAST boot stage (`boot:ui-done`). `GlobeHeroSearch` calls it optionally (`w.pryzmToggleGIS?.(…)`), so ungating the step alone would render the location card with the reveal SILENTLY NO-OPPED: a card over a black screen, which is worse than the wait. ⭐ The goal is better served by sub **i**: defer O5/O6/O9/O7 and `initUI` arrives right after `initScene`, so the reveal chain is unchanged and the wait collapses anyway. | 🔻 **Demoted** — worth doing ONLY if a reading shows O10 (not the boot) owns the time, and it then needs a reveal verb independent of `mountGISArea`. See ADR-0369 §7 amendment. |
| **i** | **Phase-gate the boot on `AppPhase`** (`panelDefaults.ts` already declares `'onboarding-globe' \| 'canvas'` at the open gesture, §L-1186, and already gates panel defaults + element authoring — it does NOT gate the engine boot). Defer O5/O6/O9/O7 in the globe phase behind a guaranteed `ensureEngineReady()`. ⭐ **PROMOTED 2026-08-24 (STARTUP37): this is now the PRIMARY answer to the mandate, not the last resort** — because the reveal verb itself lives in O8, deferring the stages in front of O8 shortens the wait *without touching the reveal chain at all*. | 🔍 Open — **ADR-0369 §7 Stage 3**; precondition is ONE founder-run `boot:*` + `open:*` table (sub **f** / **j**), **not a guess** |
| **j** | **Name the THREE remaining unnamed legs on the same instrument** — `runtime:composed` (O2), `boot:ensure-requested` / `boot:heavy-wiring-done` (⭐ the Wave-1.5 `_heavyWiringDone` await inside `workspaceMount.ensure()`, which builds `PlatformShell` + four singleton hand-offs BEFORE `startEngine()` and was being charged to the engine boot by everyone reading the log), and `open:project-loaded` (⭐ THE GATE — `briefBootstrap`'s one-shot handler, the instant the location step may open). With sub **f** these span the founder's whole "location → split view" interval. | ✅ **Done 2026-08-24** (lane STARTUP37, L-10722) |
| **k** | **The `reveal:split-mounted` resize burst** — four logged `[gis][cesium] resize` lines in one transition (949→1910→1920→1070). MEASURED FROM SOURCE: three come from ONE function (`cesiumMounter.mount` runs `reparentContainerTo` → `setVisible(true)` → `reparentContainerTo`), the fourth from the store subscriber; `SiteAuthoringPaneShell` calls `controller.resize()` from **four uncoordinated sites** with no debounce (its header states the no-rAF intent deliberately); and each logged call queues a SILENT second `viewer.resize()` via `scheduler.scheduleOnce('cesium-force-resize', …)` whose id is **unique per call** (`FrameScheduler.onceSeq` → `once:<reason>:<seq>`), so *"once"* does **not** coalesce and N calls schedule N passes. ⚠ The four sizes DIFFER, so this is container LAYOUT thrash, not a redundant call on a stable size — debouncing inside `CesiumViewport` would hide the log without removing the work. | 🔍 Open — mechanism recorded, **cost NOT measured**; the fix belongs in the pane shell's resize fan-out, not in the viewport |

---

## §6 — Verification checklist (for each OI-053 sub-item)

1. `npm run dev`, open the browser console, open a project. Record the LONGTASK list + FPS lows.
2. Confirm **zero** `handler already registered` lines (O-INV-2). ✅ after §4.
3. Open a **second** project in the same tab — confirm the full engine bootstrap (O2/O4–O9) does NOT re-run (O-INV-1); only teardown + O10.
3b. **(added 2026-08-24, ADR-0369)** Confirm the second open did not regress from the globe pre-warm: it must take the **cold** path — `showOnboarding` is not on it, so no prewarm is requested and `consumePrewarmedGlobe()` returns `null`. Expect **no** `§STARTUP-GLOBE-PREWARM — ADOPTED` line on a hub open.
4. Compare LONGTASK count/duration + time-to-interactive against the baseline in §5.
5. Element creation, undo (OI-054), and plan re-projection still work after each change.
6. **(added 2026-08-24, lane STARTUP37 — §ONBOARDING-STEP-PINS-ITS-SURFACE, L-10720/L-10721)**
   ⛔ **THE ONBOARDING FLOW MUST HAVE NO DEAD END.** At "STEP 2 OF 4 · DRAW YOUR PLOT", click
   every control the UI offers — `◉ 3D Site`, `⊕ 3D Globe`, `◧ Split`, both per-pane
   `PaneViewPicker`s, and the result / Forma view bars. **After each one the user must still be
   able to draw a plot.** The founder's 2026-08-24 report was a single click on `◉ 3D Site`
   soloing the right pane, which disposed the MapLibre map (`[gis] map2d: disposed`) and deleted
   `window.pryzmBoundaryDrawSurfaceReadyAt`; the wizard then answered `draw idle tick — waiting
   (surface-not-ready)` forever with no way back.
   **THE RULE, and it is normative:** *a view a step DECLARES load-bearing may not be VACATED
   from the pane layout — it may be moved, and everything that does not vacate it stays fully
   available.* It is enforced in `PaneLayoutStore.dispatch` (the ONE seam all three
   layout-moving surfaces cross), surfaced by DISABLE-AND-EXPLAIN in the quick toggle and the
   pane pickers, and backed by a wizard-side escape hatch (`§DRAW-SURFACE-IS-RECOVERABLE`) for
   the routes that tear the shell down WITHOUT dispatching. ⚠ The pin guards `dispatch` only, so
   generate-time and project-close teardown are deliberately untouched.
   ⛔ **Do NOT "fix" this by suppressing the honest "nothing to show yet" diagnostics**
   (`no authored walls and no parcel boundary yet`, `§ENVELOPE-RESOLVE-DIAG — NO ring available`,
   `massing rendered: 0 wall(s)`). All three are CORRECT at that step and are how the failure was
   diagnosable at all. The defect was the reachable dead end, never the reporting.
