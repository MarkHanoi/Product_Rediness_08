# RESI-BUILDING GENERATION AUDIT

**Scope:** Residential-building batch-AI generation (6 floors, 20 apartments, ~160 elements),
live Fly build, WebGL fallback (`webgl-fallback` active after the L-367 proactive swap).
**Audit date:** 2026-07-17 · **Base issue ID:** L-375 · **Auditor:** Principal Rendering/Architecture review.

This document is a standalone audit. It does **not** re-diagnose already-tracked items — it references
them: **L-369** (per-element log gating: BimManager / WallOccupancyStore / RoomFinishSync /
WallFragmentBuilder), **L-372** (transmission-on-fallback + whole-generation shadow suppression),
**L-367** (proactive start-of-gen WebGL swap + continuous overlay), **furniture GLB 404**
(tracker `OBJECT-STORAGE-GLB` — re-host on object storage).

Every finding below is grounded to `file:line` in the repo at audit time.

---

## Exec summary

The generation **succeeded** and is architecturally sound in its spine: one `runBatch`, walls
coalesced to one `wall.batch.create` per level (L-131 P2), the apartment engine's PURE
`buildLayoutCommands` reused verbatim, graph-authoritative rooms decided once (ADR-0069 GR1),
deferred openings reading the committed store. The residual issues are (a) **one real silent
degradation** (CRDT applier never wired), (b) **two console-log floods the L-369 pass missed**
(stair `canExecute`, and the per-command `CommandManager` logs), and (c) **one structural perf
gap** — every element type EXCEPT walls (slab/stair/lift/curtain-wall/roof) is still dispatched as
an individual command with its own snapshot, so the proven wall-batch coalescing is only half applied.

**Top 3 errors**
1. **CRDT applier is never wired** — `engineLauncher.ts:825` reads `(runtime as any).inner.bus`, but the
   composed runtime (`composeRuntime.ts:1463`) exposes no `inner` property → the warn at `:833` fires
   **every** session and `CommandBus._crdtApplier` stays `null`. Solo generation is unaffected;
   multi-user real-time replication is silently degraded. (P2)
2. **Stair `canExecute` store-dump flood** — `CreateStairCommand.ts:121` + `:123` dump 37 store names +
   the full levels array on **every** stair (5-7/gen), ungated by `__pryzmBuildingGenActive`. An
   L-369-class miss. (P2, quick win)
3. **`CommandManager` EXECUTE + snapshot logs ungated during gen** — `CommandManagerImpl.ts:108` +
   `:126` log per individual command (slab/stair/lift/curtain/roof); only `PROJECT_LOAD` is
   fast-pathed, not generation. Another L-369-class miss. (P2, quick win)

**Top 3 perf wins (beyond L-369/L-372)**
1. **Batch the non-wall element commands.** Slabs, stairs, lifts, curtain walls and roofs each pay a
   `CommandManagerImpl.createSnapshot` (`structuredClone` over `affectedStores`) + full validation +
   logs. Route them through batch handlers (a `stair.batch.create` handler **already exists** but is
   unused here) — one `produceCommand`/snapshot instead of N. Extends L-131's wall coalescing to the
   rest of the element types.
2. **Kill the two log floods (errors 2 + 3).** With DevTools open each `console.log` blocks the main
   thread — L-369 already measured this as material at scale. Cheapest possible win.
3. **The ~493 ms render-suppress + first-render shader/PSO tail** — already the L-372/Batch-2 residual;
   quantified here (~0.5 s one-shot on WebGL), **not** re-logged.

**Biggest architecture concern:** the CRDT-applier bug is a *typed-slot / P1 / P4 regression*, not just
a missing feature — `engineLauncher` reaches runtime internals through an `any` cast that the composed
runtime no longer satisfies, and it failed **silently**. The fix belongs in the composition root
(`composeRuntime`), not in another `any` reach-through from the app layer.

---

## A. Errors / robustness

| # (L-375x) | Symptom (from live log) | File:line | Class | Sev | Impact | Fix approach |
|---|---|---|---|---|---|---|
| **A1 / L-375a** | `G3-T2: runtime.inner.bus not accessible — CRDT applier not wired` | `apps/editor/src/engine/engineLauncher.ts:825` (read) → `:833` (warn); target `packages/command-bus/src/CommandBus.ts:185` `setCrdtApplier`, `:408` `if (this._crdtApplier)` | **Bug** (silent degradation) | **P2** | The composed `runtime` object (`packages/runtime-composer/src/composeRuntime.ts:1463-1548`) has **no `inner` property** — `inner` is a local const, never placed on the returned handle. So `(runtime as any)?.inner?.bus` is always `undefined`, the warn fires every boot, and `setCrdtApplier` is **never** called → `CommandBus._crdtApplier` stays `null` → the per-command CRDT replication (`CommandBus.ts:408-413`, the path G3-T2 built to kill the 11.4 s batch blackout) never runs. **Solo generation: benign** (no second editor, applier is null-safe). **Multi-user: real-time collaboration is silently degraded** — concurrent edits do not replicate through the applier. Also a **P4 / typed-slot regression**: the `any` reach-through into runtime internals broke when the internal shape changed and failed silently. | Wire the applier inside `composeRuntime()` (P1 single composition root — it already owns `inner.bus`), OR expose a typed `setCrdtApplier` on the public `bus` slot (`composeRuntime.ts:~1340`) and call `runtime.bus.setCrdtApplier(...)`. Remove the `(runtime as any).inner` access entirely. Add a boot assertion so a null applier is loud, not a warn. |
| **A2 / L-375b** | `[CreateStairCommand.canExecute] ctx.stores: (37) [...]` + `levels: (7) [...]` per stair | `packages/command-registry/src/stair/CreateStairCommand.ts:121` + `:123` (also `:385` create log, `:410/:421/:436/:473/:483` auto-opening logs) | **Bug** (log flood — L-369-class miss) | **P2** (quick win) | Two unconditional `console.log` per stair dumping `Object.keys(ctx.stores)` (37 names) and the entire `levels` array. Fires **per `CreateStairCommand`**, and the resi executor creates one stair per adjacent level pair (`ResidentialBuildingExecutor.ts:2465`) → 5-7 heavy dumps/gen + the create/opening lines. Not gated by `__pryzmBuildingGenActive`. Main-thread block per dump with DevTools open. | Gate behind the L-369 helper pattern (`__pryzmProjectLoadActive === true \|\| __pryzmBuildingGenActive === true`, see `BimKernel.ts:28-37`), or delete outright — these are dev diagnostics that never should have shipped in `canExecute`. |
| **A3 / L-375c** | `[CommandManager] EXECUTE: …` + `[CommandManager] snapshot commandType="…" scope=[…] elapsed=…ms` per element | `packages/command-registry/src/CommandManagerImpl.ts:108` + `:126` | **Bug** (log flood — L-369-class miss) | **P2** (quick win) | Every individual `cm.execute` (slab/stair/lift/curtain-wall/roof — see B1) logs two lines. Only `metadata.source === 'PROJECT_LOAD'` is fast-pathed (`:105`), **not** `__pryzmBuildingGenActive`. So generation floods the console with EXECUTE/snapshot lines exactly as a bulk restore would. The `snapshot elapsed` line also surfaces the real per-command `structuredClone` cost (see B1). | Extend the `isLoad` fast-path guard (`:105-127`) to also short-circuit the **log lines** when `__pryzmBuildingGenActive` (keep the snapshot itself — it is undo-correctness, not noise). Better: route these elements through batch handlers so the individual `cm.execute` path is not hit N times (B1). |
| **A4** | `§SS-FIX-TSL-NOT-LOADED-BEFORE-SCENEPASS _fullRebuild deferred` (via autoEnablePerf→_setSsgi) | `packages/renderer-three/src/pipeline/RenderPipelineManager.ts:3009-3012` (also `_buildPipeline:2186`, `_buildPhase3Pipeline:2269`) | **Benign** (intended L-319 guard) | **P3** | This is the **intended** L-319 guard: `_setSsgi → _fullRebuild` can fire from a batch's `autoEnablePerf` before `initTSL()` resolves; `createScenePass()` throws when TSL is absent, so the guard defers. On `webgl-fallback` `_tslLoaded` is permanently false, so the guard **always** fires when perf-mode toggles SSGI — correct, not an ordering bug. Minor observation: perf-mode toggling drives no-op pipeline-rebuild attempts on WebGL. | No fix needed. Optionally lower the log to `debug`, or short-circuit `_setSsgi` when the backend is not real-WebGPU (the backend gate already forces SSGI off there — the rebuild attempt is pure waste). |
| **A5 / L-375e** | `FIRST-RENDER-POST-SUPPRESS totalSuppressedMs=493ms … WebGPU PSO compile LONGTASK begins here` on a `webgl-fallback` run | `packages/core-app-model/src/rendering/UnifiedFrameLoop.ts:506-511` | **Diagnostic inaccuracy** | **P3** | The 493 ms suppressed tail is real (first-render shader-compile + draw of the whole building's meshes — the L-372/Batch-2 residual, **cross-ref, not duplicated**). But the log **hardcodes** "WebGPU PSO compile LONGTASK" regardless of backend; on WebGL there is no PSO (it is GLSL program link), which misled the founder into reading a WebGPU cost on a WebGL run. | Branch the label on the authoritative backend flag (`RenderPipelineManager.isRealWebGPUBackend()`): "WebGPU PSO compile" vs "WebGL program link". Pure diagnostic edit. |

**Correctness note (no silent-data-loss found in the generation path):** the sealed-room / graph-authority
path is decided **once, up front** via `decideAndPreMarkGraphAuthority` (`ResidentialBuildingExecutor.ts:570`,
ADR-0069 GR1) and the stair `canExecute` **hard-checks** its result and logs loudly on reject
(`ResidentialBuildingExecutor.ts:2488-2494`, `2540-2547` regression assertion) — so a rejected stair
cannot vanish silently. The only silent degradation is **A1** (CRDT), and only for multi-user.

---

## B. Performance findings (ranked by real impact)

### B1 — Non-wall element commands are not batched (top structural win)
**Where:** `ResidentialBuildingExecutor.ts` — slabs `_createSlab` (`:650`, `:1746`), stairs
`CreateStairCommand` (`:2465`), lifts `CreateVerticalCirculationCommand` (`:2575`), curtain walls
(`:622`), roof `_createRoof` (`:658`). All via `cm.execute(new XxxCommand(...))`
(`getCommandManager()`, `:139-141`).
**Cost:** each individual `cm.execute` runs `CommandManagerImpl.execute` →
`command.canExecute(...)` + `createSnapshot(command)` (`CommandManagerImpl.ts:123`, a `structuredClone`
over the command's `affectedStores`) + two logs. Walls **avoid** this — they are coalesced to one
`wall.batch.create` per level (L-131 P2, `ResidentialBuildingExecutor.ts:594-647`) through the bus. The
other element types are **not**. For a 6-floor + roof (+ optional garden) building: ~7 slabs + 5-7 stairs
+ 5-7 lifts + N curtain walls + 1-2 roofs = **~25-40 individual snapshotted commands**. The stair's
`affectedStores = ["stair","opening","slab"]` (`CreateStairCommand.ts:91`) means each per-stair snapshot
`structuredClone`s the **growing slab store** → an O(N·M) tail as the build progresses.
**Win:** route stairs through the **existing** `stair.batch.create` handler
(`plugins/stair/src/handlers/CreateStairBatch.ts`, `CreateStairBatchHandler`, registered by
`registerStairHandlers`) — one `produceCommand` + one snapshot for all stairs. Do the same for
slabs/lifts/curtain-walls (add batch handlers mirroring the wall path). This is the natural extension of
L-131's coalescing to the remaining element types. **Note:** `registerStairHandlers` does **not** appear
in `engineLauncher.ts`'s handler-registration block — confirm the `stair.batch.create` verb is actually
wired at bootstrap before depending on it (UNVERIFIED — likely not currently registered in the editor app;
if so, the batch command must be added to command-registry as a `StairBatch` command, or the handler wired).

### B2 — The two console-log floods (errors A2 + A3)
Quantified above. With DevTools open each `console.log` is a synchronous main-thread block; L-369 already
established this is material at 500+ elements. Cheapest win in the whole audit — a few lines each.

### B3 — ~493 ms render-suppress + first-render shader/PSO tail
`FIRST-RENDER-POST-SUPPRESS totalSuppressedMs=493ms`. This is the **already-tracked** L-372/Batch-2
residual TSL/first-render cost, quantified here as a ~0.5 s one-shot stall at generation end on WebGL
(`UnifiedFrameLoop.ts:482-512`). **Not re-logged as a new item.** Only the misleading WebGPU/WebGL label
(A5) is new.

### B4 — SceneQualityTier `71 meshes → tier=cinematic (shadows=standard)` — sane, negligible
`packages/core-app-model/src/rendering/SceneQualityTierManager.ts`. 71 meshes < 1200 large-scene cap
(`:118`) < 1500 cinematic bound (`:87`) → `cinematic` is correct. On `webgl-fallback` the backend gate
(`applyBackendGate`, `:272-300`) forces `ssgi/traa/reflectionProbes/decorativeFurnitureShadows` off and
caps `shadowLevel` to `standard` — hence the "shadows=standard" in the log. Residual cinematic settings
that survive the gate: `fullScenePbrTraverse: true` (`:193`) — but over 71 meshes the PBR re-traverse is
trivial (the 38.7 s figure in the source comment is for a 4073-mesh scene). **Verdict: heuristic is sane,
cost on an empty scene is negligible; no action.** Minor readability nit: the log prints the *nominal*
tier, not the *gated* settings, which is why "cinematic" looks alarming on a bare scene — consider logging
the post-gate settings. (Folded into L-375e as a diagnostic nit; not a separate row.)

### B5 — Ancillary per-command/per-level chatter (low impact)
- `"Refreshing Spatial Tree..."` (`apps/editor/src/ui/SpatialTree.ts:90`) — **already coalesced** to a
  single microtask rebuild (`:260-264`), so not per-element. OK.
- `[RuleEngine] Model updated…` (`packages/ai-host/src/RuleEngine.ts:29`) fires on every
  `ai-model-update` window event, which `CreateStairCommand.execute` emits per stair (`:381`) — minor
  console noise, no store work. Low.
- `IntentStylePrewarmer … slots` (`VGToIntentMigration.ts:374`) is a **one-shot** prewarm, not per-gen. Not
  a generation cost.
Rank: all low; do not prioritize over B1/B2.

---

## C. Architecture review + contract alignment

**What the executor does right (C11 / C16 / C03 / P-principles):**
- **P6 (command-only mutation):** every mutation flows through a `Command` — walls via the bus
  `wall.batch.create`, other elements via `cm.execute(new XxxCommand())`. No direct store writes.
- **P2 / P3 / P8:** no THREE import, no `requestAnimationFrame`, exactly one OpenTelemetry span at the
  `execute` boundary (`ResidentialBuildingExecutor.ts:224`). Compliant.
- **Proven-pattern reuse (memory: "reuse residential+house pipeline patterns"):** reuses the apartment
  engine's **PURE** `buildLayoutCommands` verbatim (`:520`) — identical path to the apartment executor;
  graph-authoritative rooms decided **once** via `decideAndPreMarkGraphAuthority` (`:570`, ADR-0069 GR1),
  mirroring the house pre-mark chokepoint; deferred openings/doors/windows pass reads the committed store
  (`:738`), same as the apartment executor.
- **L-131 batch coalescing (C16 batch authoring):** shell + core-perimeter + cell-perimeter + partitions
  are accumulated and dispatched as **one `wall.batch.create` per level** (`:594-647`) inside a single
  `runBatch` → one undo unit. Correct.

**Deviations / one-off paths:**
1. **Half-applied batch coalescing (the B1 root).** Walls are coalesced; slabs, stairs, lifts, curtain
   walls and roofs are **individual** `cm.execute` calls inside the batch (`:650, :622, :658, :2465,
   :2575`). A `stair.batch.create` handler already exists but is not used. This is a one-off relative to
   the wall batch pattern and the direct cause of the per-command snapshot cost. **C16 / L-131 not fully
   extended to these element types.**
2. **Legacy `window.commandManager.execute` surface.** The executor obtains the command manager via
   `getCommandManager()` = `(window as unknown as { commandManager })` (`:139-141`) and calls
   `cm.execute(...)`. P6 is *technically* satisfied (mutation is still a Command), and it is a **typed
   cast, not `window as any`** — so **P4 is not tripped**. But it bypasses the composed
   `runtime.bus.executeCommand` (P1 prefers the single composition root's bus), and it is exactly the
   legacy `commandManager.execute()` surface the `check:commandmanager` CI guard targets. **This matches
   the sibling apartment/house executors — an established pattern, not a NEW violation** — but it warrants
   a contract note: the executor family should migrate off `window.commandManager` onto `runtime.bus`.
3. **CRDT applier wiring reaches runtime internals via `any` (A1).** `engineLauncher.ts:825`
   `(runtime as any)?.inner?.bus` is precisely the kind of internal reach-through the typed-slot design
   (P1/P4) exists to prevent, and it silently broke. The wiring belongs in `composeRuntime()`.

**Contract "Known Violations" candidates (for the human contract owner — do NOT edit contracts here):**
- **C16 / L-131** — batch-authoring coalescing is applied to walls only; slab/stair/lift/curtain-wall/roof
  in the resi (and, by inheritance, office/house) executors remain per-element `cm.execute`. Note as a
  gap, not a regression.
- **C08 (real-time collaboration) / G3-T2** — the CRDT applier is not wired in the live runtime
  (A1/L-375a); the E2E marker comment `tests/e2e/crdt-batch-conflict.spec.ts:15` ("✅ engineLauncher.ts
  L388") is **stale** (actual site is `:825`, and it is broken). C08 §3.1's "CRDT failure must not break
  local execution" still holds (null-safe), but the applier being unconditionally null means the
  per-command replication guarantee is not met.

---

## Prioritized fix backlog (quick wins first)

| Order | Item | ID | Effort | Why first |
|---|---|---|---|---|
| 1 | Gate `CreateStairCommand.canExecute` dumps (`:121,:123`) + create/opening logs behind the L-369 `__pryzm…Active` helper (or delete) | L-375b | ~5 lines | Pure win, zero risk, kills the most obvious flood the founder saw |
| 2 | Extend `CommandManagerImpl` log fast-path (`:105-127`) to also skip the EXECUTE/snapshot **log lines** under `__pryzmBuildingGenActive` | L-375c | ~5 lines | Same class, zero behaviour change (snapshot itself untouched) |
| 3 | Fix the WebGPU/WebGL label in `FIRST-RENDER-POST-SUPPRESS` (`UnifiedFrameLoop.ts:506`) | L-375e | tiny | Removes a recurring diagnostic red herring |
| 4 | Wire the CRDT applier through `composeRuntime()` / a typed `bus.setCrdtApplier`, remove the `(runtime as any).inner` reach-through; fix stale E2E marker | L-375a | medium | Restores multi-user replication correctness + closes a P1/P4 regression |
| 5 | Batch stairs (+ slabs/lifts/curtain-walls/roofs) through batch handlers (reuse existing `stair.batch.create`; add siblings) — extend L-131 coalescing | L-375d | larger | Biggest structural perf win; O(N·M) snapshot tail → O(N) |

---

## Step-6 summary (for the orchestrator)

| ID | Title | Sev | Class | Contracts / ADRs touched | Queue | Conflicts needing a human decision |
|---|---|---|---|---|---|---|
| **L-375** | Resi-building generation audit (umbrella) | — | audit | C11, C16, C03, C08, ADR-0069 | editor / renderer / command | none |
| **L-375a** | CRDT applier never wired (`runtime.inner.bus` undefined) | P2 | bug (silent collab degradation) | C08 §3.1/G3-T2; P1, P4 | runtime-composer / command-bus / editor-engine | **Decide fix locus:** wire in `composeRuntime` (preferred, P1) vs typed `bus.setCrdtApplier` slot — needs runtime-composer owner sign-off |
| **L-375b** | Stair `canExecute` store-dump log flood | P2 | bug (L-369-class) | L-369 pattern | command-registry (stair) | none (gate-or-delete; delete is cleaner) |
| **L-375c** | `CommandManager` EXECUTE/snapshot logs ungated during gen | P2 | bug (L-369-class) | L-369 pattern; C01 §2.2 (snapshot) | command-registry | none |
| **L-375d** | Batch stair/slab/lift/curtain/roof creation (extend L-131 coalescing) | P2 | perf / arch gap | C16, L-131; ADR-worthy | command-registry + editor executor + plugins/stair | **Confirm `stair.batch.create` is registered at bootstrap** (UNVERIFIED — likely not in editor app); may need a command-registry `StairBatch` command |
| **L-375e** | `FIRST-RENDER-POST-SUPPRESS` mislabels WebGPU on webgl-fallback | P3 | diagnostic accuracy | (cross-ref L-372, do not duplicate cost) | core-app-model / rendering | none |

**Cross-refs (not re-logged):** L-369 (log gating), L-372 (transmission + shadow suppression, the 493 ms
tail), L-367 (proactive swap), `OBJECT-STORAGE-GLB` (furniture 404). **A4** (§SS-FIX `_fullRebuild
deferred`) confirmed **benign** (intended L-319 guard) — no L-375 row, optional debug-log downgrade only.
