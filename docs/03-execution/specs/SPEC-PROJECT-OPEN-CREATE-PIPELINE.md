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
| **b** | rAF-slice / defer the O5 (`initBuilders`) + O7 (`initDataPlatform`) LONGTASKs. | 🔍 Open (needs profiler) |
| **c** | O-INV-1 (no re-bootstrap per open) is **already satisfied** (engine is a `_bootstrapped`-guarded tab singleton — verified 2026-05-24). Remaining lever: defer non-critical subsystems (DataWorkbench, Portfolio, AI panels) off the **cold-boot** critical path so the one-time boot is lighter. | 🔍 Open (cold-boot deferral only) |
| **d** | `RenderPipelineManager` phase-ramp churn (`§I2 pipeline.usedTimes` dispose/recreate during SSGI/outline activation). | 🔍 Open |
| **e** | O10 hydrate: batch commands + incremental projection (`EdgeProjector` 0% cache hit on rapid create — see OI-054). | 🔍 Open |

---

## §6 — Verification checklist (for each OI-053 sub-item)

1. `npm run dev`, open the browser console, open a project. Record the LONGTASK list + FPS lows.
2. Confirm **zero** `handler already registered` lines (O-INV-2). ✅ after §4.
3. Open a **second** project in the same tab — confirm the full engine bootstrap (O2/O4–O9) does NOT re-run (O-INV-1); only teardown + O10.
4. Compare LONGTASK count/duration + time-to-interactive against the baseline in §5.
5. Element creation, undo (OI-054), and plan re-projection still work after each change.
