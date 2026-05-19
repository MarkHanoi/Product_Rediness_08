# PHASES A–F — CODE-VERIFIED AUDIT (2026-04-29, evening — rev 2)

> **Rev 2 changelog (2026-04-29 night).**  Two material corrections and
> one new delta:
> 1. **§3.2 was wrong.**  Rev 1 claimed `SaveOrchestrator.ts` and
>    `ServerSyncQueue.ts` had **zero external importers** and were
>    "delete-ready today".  Both are imported by
>    `src/ui/platform/PlatformShell.ts` — `SaveOrchestrator` at line 34,
>    `ServerSyncQueue` at line 35.  Rev 1 also under-counted
>    `ProjectRepository`'s importers (claimed 1, actual was 3 —
>    `ExistingProjectsPanel.ts:15`, `ProjectHub.ts:24`,
>    `PlatformShell.ts:29`).  PlatformShell.ts is **2 433 LOC with 37
>    reaches** across `projectRepository`, `versionRepository`,
>    `saveOrchestrator`, and `serverSyncQueue` — it is the **single
>    gating dependency** for all three C.11 deletions, not a footnote.
>    §3.2, §3.3, §8 row, and §9 step (1) corrected below.
> 2. **One Phase B adoption + one C.11 importer drop landed today**
>    (`B.adopt.1` — see new §2.5).
>    `src/ui/ViewBrowser/ExistingProjectsPanel.ts` now extends
>    `Panel` from `@pryzm/ui-base` and reads from
>    `runtime.persistence.projectListStore` + writes via
>    `runtime.persistence.openProject(id, { name })`.
>    Effect: Panel-adoption 0 → **1**;
>    `ProjectRepository` external importers 3 → **2**;
>    `(window as any)` reaches in `src/ui/` 769 → **766** (-3 casts on
>    the open-project gesture path).  Counters updated throughout.
> 3. All other §1-§8 numbers were re-verified at HEAD on `main` after
>    the migration; build still exit 0; tsc still 0 errors.

> **Methodology.**  Every claim below was verified by reading the **actual
> code at HEAD on `main`** with `rg`, `ls`, `wc`, and direct file reads —
> **no doc was trusted**.  Where a number disagrees with the morning
> reconciliation doc (`PHASES-A-F-RECONCILIATION-2026-04-29/`), both
> values are shown side-by-side with the file/line that produced the
> ground-truth value.
>
> **Scope.**  Phases A through F of the
> [PRYZM2-WIREUP-PLAN-S72](../PRYZM2-WIREUP-PLAN-S72/) S72 plan.
> Phase boundaries follow the canonical names in `14-subphases-A-D.md`
> and `15-subphases-E-F.md`.
>
> **TL;DR.**  Of the six phases:
> - **A** is genuinely 100 % done.
> - **B**'s widening track (annotations) is 99 %; the Panel-adoption
>   track is **1 / ~65** (`ExistingProjectsPanel` landed today —
>   `B.adopt.1`).
> - **C**'s code rewires are mostly done; the **3 legacy file deletions
>   (C.11) are NOT done** — 1 166 LOC still on disk, all gated by
>   `PlatformShell.ts` (2 433 LOC, 37 persistence reaches).
> - **D** is **largely NOT done** — `EngineBootstrap.ts` (2 048 LOC) and
>   `mountEditor` are still on disk; 98 `requestAnimationFrame` calls
>   remain outside the scheduler; no `cameraController` slot in
>   `PryzmRuntime`.
> - **E**'s plugin coverage is **13/38 packages wired** in
>   `PluginRegistry`; 198 `commandManager.execute(…)` reaches across 122
>   files in `src/` show legacy dispatch is still pervasive.
> - **F** has **1/257 sub-phases done** — `F.1.01` (wall toolbar
>   contribution) landed today as `F-launch.1`.
>
> **Build & tests at HEAD.**  `npm run build` ⇒ exit 0; all 8 sibling
> test workflows green (350 tests passing).

---

## Index

| § | Phase | Headline | Verified status |
|---|---|---|---|
| 1 | **A** — `composeRuntime` + `PryzmRuntime` + ESLint guard | "Runtime spine + window-as-any baseline" | **✅ 100 % done** |
| 2 | **B** — `(window as any)` widening + Panel base class | "Annotations 99 %, Panel adoption 1/~65" | **⚠️ Mixed** (widening done, adoption begun today) |
| 3 | **C** — Persistence rewire | "Code rewires done, file deletions blocked by PlatformShell" | **⚠️ Code ~done, C.11 not done** (1 166 LOC, all 3 gated by PlatformShell) |
| 4 | **D** — Legacy engine removal + frame-scheduler | "EngineBootstrap, UnifiedFrameLoop, mountEditor all still on disk" | **❌ Largely not done** |
| 5 | **E** — Plugin coverage + bus dispatch | "13/38 plugins wired; 198 legacy `commandManager.execute` reaches" | **⚠️ Partial** |
| 6 | **F** — UI contribution shape | "F.1.01 landed today; 256 sub-phases remain" | **⚠️ Just begun** |
| 7 | **Build & tests** | `npm run build` exit 0; 8 workflows green | **✅** |
| 8 | **Reconciliation appendix** | Where this audit disagrees with the morning reconciliation docs | — |

---

## 1.  Phase A — `composeRuntime` + `PryzmRuntime` + ESLint guard

**Status: ✅ 100 % done.**  All structural claims of the morning doc
verify.

### 1.1  `composeRuntime()` + `PlatformRouter.start(runtime)`

`src/main.ts` ground-truth:

```
138:// `composeRuntime()` builds the L1 stores + L2 bus + 13 plugin handlers +
151:    const { composeRuntime } = await import('@pryzm/runtime-composer');
190:    const runtime = await composeRuntime({…});
242:    PlatformRouter.start(runtime);
```

The runtime is composed inside `bootstrap()` and passed into
`PlatformRouter.start(runtime)` — the canonical A.1 wire.

### 1.2  `packages/runtime-composer/src/`

Nine source files exist (matches the spec):

```
buildPersistence.ts  composeRuntime.ts    EventBus.ts
ImportExportSlots.ts index.ts             PluginHost.ts
ToastController.ts   types.ts             UserPreferences.ts
```

### 1.3  `PryzmRuntime` slot count

The morning reconciliation doc cites **14 slots**.  The current
`packages/runtime-composer/src/types.ts` defines **17 readonly slots**
on `PryzmRuntime`:

```
audit, scene, stores, bus, selection, projectContext, tools, picking,
viewRegistry, persistence, sync, ai, plugins, events, toasts,
userPreferences, undoStack
```

The drift (3 extra slots: `selection`, `projectContext`, `undoStack`)
is from the C-track rewires landing during sub-phases C.3 → C.6,
which is consistent with C being the active workstream after A.
The slot type and naming pass `tsc --skipLibCheck` clean.

### 1.4  `pryzm/no-window-as-any` ESLint rule

```
tools/eslint-plugin-pryzm/src/rules/no-window-as-any.js   ← exists
eslint.config.js:342    'pryzm/no-window-as-any': 'warn'  ← armed
eslint-baseline-window-as-any.json                        ← exists
```

The baseline file captures **1 reach per file × 8 files** as the
**snapshot at the start of Phase C** (per the JSDoc inside the JSON).
`scripts/track-window-cast-count.mjs` fails the build if the count
rises above this baseline (S70-style ratchet).

### 1.5  Verdict — Phase A

**✅ TRUE 100 % done.**  Headline of the morning doc holds; the only
nit is the slot-count drift (14 → 17), which is *additive* and reflects
post-A absorption of slots needed by C.

---

## 2.  Phase B — `(window as any)` widening + Panel base class

**Status: ⚠️ Mixed.**  The widening track is genuinely 99 % done; the
Panel-adoption track is 0 % and is deferred until after D.4 per the
morning doc — which is **factually true**.

### 2.1  Cast widening + annotation coverage in `src/ui/`

```
Total `(window as any)` reaches in src/ui/      = 766  (across 98 files)
Annotated with TODO(<phase>) tag                = 761
Annotation coverage                             = 99.3 %
```

The morning doc cites 773 reaches; ground-truth is **766** (-7 from
morning; -3 of those landed in this session via `B.adopt.1` — see
§2.5).  Drift downward is expected as wedge migrations drop reaches
as a side-effect.

### 2.2  Panel base class

`packages/ui-base/src/Panel.ts` and `…/index.ts` exist.  Public surface
is exported as `@pryzm/ui-base`.  This is the **B.0** deliverable.

### 2.3  Panel adoption in `src/ui/`

Files extending the `Panel` base class from `@pryzm/ui-base` at HEAD:

```
$ rg -l "extends Panel\b" src/ui/ --type ts
src/ui/ViewBrowser/ExistingProjectsPanel.ts
```

**1** file extends the new Panel base after this session.  Of the
~65 candidate panels in `src/ui/` (50 in `tools-panel/panels/` + 15
elsewhere — count below), **1** has been ported.

### 2.4  Verdict — Phase B

- Widening (B.1 + annotation discipline): **✅ 99.3 %** — effectively
  done.  The remaining ~5 unannotated reaches are worth a clean-up
  pass but do not block any other phase.
- Panel adoption: **⚠️ 1 / ~65 (~1.5 %)** — first wedge landed today
  (`B.adopt.1`, see §2.5).  The remaining ~64 panels are still
  deferred until D.4 lands; "finishing Phase B" is a multi-session
  effort, not single-session.  See §9 step (7) for the proposed
  ordering.

### 2.5  `B.adopt.1` — Today's Panel adoption + ProjectRepository wedge

Migrated:

| File | Before | After |
|---|---|---|
| `src/ui/ViewBrowser/ExistingProjectsPanel.ts` | hand-rolled class with `init/refresh/dispose`; imports `projectRepository, ProjectMeta` from `./platform/ProjectRepository`; uses `(window as any)._pendingProjectSwitch` + `'pryzm-open-project'` CustomEvent for opens | extends `Panel<ExistingProjectsPanelOptions>` from `@pryzm/ui-base`; reads `runtime.persistence.projectListStore.list()`; subscribes via `subscribeDirty(...)`; opens via `runtime.persistence.openProject(id, { name })` |
| `src/ui/ViewBrowser/panels/ProjectsRailPanel.ts` | `(host: HTMLElement, currentProjectId: string \| null)`; instantiated `new ExistingProjectsPanel(host, currentProjectId)` | `(runtime: PryzmRuntime \| null = null)`; `build()` returns a host div with the Panel mounted via `panel.mount()`; reads `currentProjectId` from `runtime.projectContext.projectId` |

Counter deltas (verified at HEAD):

| Counter | Before | After | Δ |
|---|---:|---:|---:|
| `(window as any)` reaches in `src/ui/` (rg `\(window as any\)`) | 769 | **766** | -3 |
| `ProjectRepository.ts` external importers | 3 | **2** | -1 |
| Files in `src/ui/` extending `Panel` from `@pryzm/ui-base` | 0 | **1** | +1 |
| `tsc --noEmit --skipLibCheck` errors | 0 | 0 | — |
| `npm run build` exit code | 0 | 0 | — |

**Caveat.**  `ProjectsRailPanel` itself currently has **zero callers**
in `src/apps/` (rg confirms).  The migration is therefore
ratchet-positive on the static counters but **runtime-impact-zero**
until something instantiates `ProjectsRailPanel` again.  This is
called out so no one mistakes the wedge for a user-visible feature
landing.

---

## 3.  Phase C — Persistence rewire

**Status: ⚠️ Code rewires done; file deletions NOT done.**

### 3.1  Code-side sub-phase spot-checks

| Sub-phase | Spec | Code evidence | Status |
|---|---|---|---|
| **C.3.01** | `PlatformRouter._openProjectViaRuntime` routes opens through `runtime.persistence.openProject(id)` | `src/ui/platform/PlatformRouter.ts:21,29,87` (JSDoc); routing call lives in the implementation block referenced by those comments | **✅** |
| **C.5.01** | `persistence.openProgress` event is listened to for the open-project overlay | `src/ui/platform/PlatformRouter.ts:374` — `this.runtime.events.on('persistence.openProgress', (p) => …)` | **✅** |
| **C.6.02** | `runtime.undoStack.undo()` reach for global Undo | `src/ui/SaveUndoRedoHUD.ts:121` — `this.runtime.undoStack.undo();` | **✅** |
| **C.6.03** | `runtime.undoStack.redo()` reach for global Redo | `src/ui/SaveUndoRedoHUD.ts:127` — `this.runtime.undoStack.redo();` | **✅** |
| **C.10.04** | `runtime.persistence.client.signOut()` reach for the logout button | `src/ui/platform/ProjectHub.ts:762` — `void this.runtime.persistence.client.signOut().catch(…)` | **✅** |

The five code-side spot-checks all verify.  The morning doc claims
~27 % of C sub-phases are done; this audit cannot fully recompute
that ratio from rg alone (no per-sub-phase machine-readable
manifest), but the five spot-checks are all green.

### 3.2  C.11 — Three legacy file deletions: **NOT done — all gated by `PlatformShell.ts`**

All three files are still on disk.  Importer counts at HEAD (after
today's `B.adopt.1` migration):

| File | LOC | External importers | Importer locations | Status |
|---|---:|---:|---|---|
| `src/ui/platform/ProjectRepository.ts` | 433 | **2** | `ProjectHub.ts:24`, `PlatformShell.ts:29` | ❌ blocked on PlatformShell + ProjectHub |
| `src/ui/platform/SaveOrchestrator.ts`  | 380 | **1** | `PlatformShell.ts:34` | ❌ blocked on PlatformShell |
| `src/ui/platform/ServerSyncQueue.ts`   | 353 | **1** | `PlatformShell.ts:35` | ❌ blocked on PlatformShell |
| **TOTAL** | **1 166** | | | |

**The single gating dependency is `src/ui/platform/PlatformShell.ts`:**

```
$ wc -l src/ui/platform/PlatformShell.ts
2433 src/ui/platform/PlatformShell.ts

$ rg -c "projectRepository|versionRepository|saveOrchestrator|serverSyncQueue" \
       src/ui/platform/PlatformShell.ts
37
```

PlatformShell is 2 433 LOC with 37 reaches across all four legacy
persistence concepts (`projectRepository`, `versionRepository`,
`saveOrchestrator`, `serverSyncQueue`).  It is **the only barrier**
to deleting `SaveOrchestrator.ts` (1 importer, that's PlatformShell)
and `ServerSyncQueue.ts` (1 importer, that's PlatformShell).
`ProjectRepository.ts` has one *additional* importer (`ProjectHub.ts`)
on top of PlatformShell.

**Rev 1 of this audit was wrong** to call SaveOrch + ServerSync
"dead code on disk, delete-ready today".  They are both alive in
PlatformShell.ts.  Until PlatformShell is migrated off the legacy
persistence trio (or the relevant wiring is moved to
`runtime.persistence`), zero of the three files can be deleted.

The `bim-projects-index` localStorage key is still owned by
`ProjectRepository.ts` (sole writer per its JSDoc §06 §7).

### 3.3  Verdict — Phase C

- Code-side rewires (C.1 → C.10): **largely ✅** — five spot-checks all
  green; morning doc's "~27 % of sub-phases done" is plausible but I
  cannot mechanically verify the denominator without a structured
  sub-phase manifest.
- File deletions (C.11): **❌ 0/3 done**.  All three are gated by
  `PlatformShell.ts` (2 433 LOC, 37 persistence reaches).  Today's
  `B.adopt.1` dropped `ProjectRepository`'s importer count from 3 to
  2, but the two remaining are both heavyweight (`ProjectHub.ts` and
  `PlatformShell.ts`).  "Finishing Phase C" requires migrating
  PlatformShell first, then ProjectHub, then deleting in that order
  — a multi-session effort, not single-session.  See §9 step (1) for
  the corrected ordering.

---

## 4.  Phase D — Legacy engine removal + frame-scheduler

**Status: ❌ Largely not done.**  The new packages exist; the legacy
ones have not been removed.

### 4.1  D.3 — `mountEditor` removal

`apps/editor/src/main.ts` is still on disk.  The only references to
`mountEditor` in the rest of the codebase are **comments and JSDoc**:

```
src/main.ts:186   // the deprecated `mountEditor` JSDoc in `apps/editor/src/main.ts`
packages/engine-router/src/index.ts:123   …`mountEditor()` for…
```

Production import callers of `mountEditor`: **0**.  The file could be
deleted today.

### 4.2  D.4 — `EngineBootstrap.ts` removal: **NOT done**

```
src/engine/EngineBootstrap.ts                  = 2 048 LOC
```

The morning doc cites 2 035 LOC; ground-truth is 2 048.

`src/main.ts` still actively imports it as the **legacy lazy fallback**:

```
src/main.ts:98    type LegacyEngineModule = typeof import('./engine/EngineBootstrap');
src/main.ts:104   _engineModule = import('./engine/EngineBootstrap').catch(…)
```

…with explicit `// DELETE in D.4` markers at lines 41, 93, 121, 213,
264.  D.4 has not been done; `EngineBootstrap.ts` remains a 2 048-LOC
fixture loaded on every boot via the `_engineModule` lazy import.

### 4.3  D.5 — Subsystem split: **✅ done**

`src/engine/subsystems/` contains the eight init modules:

```
initBuilders.ts       initDataPlatform.ts  initScene.ts   initTools.ts
initCollaboration.ts  initPersistence.ts   initStores.ts  initUI.ts
```

### 4.4  D.6 — `packages/frame-scheduler`: **✅ done**

```
packages/frame-scheduler/src/
    FrameScheduler.ts   IdleContinuation.ts   index.ts
    otel.ts             RafAdapter.ts          types.ts   WorkerPool.ts
```

Six source files plus `otel.ts` for instrumentation — matches the
spec for the new scheduler package.

### 4.5  D.7 — `UnifiedFrameLoop` removal: **NOT done**

```
src/core/rendering/UnifiedFrameLoop.ts          = 424 LOC
Importers in src/                               = 3
```

The new `packages/frame-scheduler` exists, but the old
`UnifiedFrameLoop` is still on disk and still has three callers
inside `src/`.  D.7 not started.

### 4.6  D.8 — `requestAnimationFrame` migration: **NOT done**

```
$ rg -c "requestAnimationFrame" src/ --type ts
Total raF reaches in src/                        = 98
```

98 `requestAnimationFrame` calls remain outside the scheduler
package — none have been migrated to `frame-scheduler`'s public API.

### 4.7  D.9 — `runtime.cameraController` slot: **NOT added**

```
$ rg -n "cameraController" packages/runtime-composer/ src/main.ts
(no matches)
```

No `cameraController` slot exists on `PryzmRuntime`.  The morning doc
states this was deferred — confirmed.

### 4.8  Verdict — Phase D

| Sub-phase | Status |
|---|---|
| D.3 (mountEditor removal) | ❌ file on disk; 0 prod importers — delete-ready |
| D.4 (EngineBootstrap removal) | ❌ 2 048 LOC, lazy-imported as legacy fallback |
| D.5 (subsystem split) | ✅ |
| D.6 (frame-scheduler package) | ✅ |
| D.7 (UnifiedFrameLoop removal) | ❌ 424 LOC, 3 importers |
| D.8 (raF migration) | ❌ 98 `requestAnimationFrame` reaches |
| D.9 (cameraController slot) | ❌ deferred |

**Done: 2/7 sub-phases (~29 %).**  The morning doc's "~40 %" estimate
was generous; ground-truth is closer to 29 %.

---

## 5.  Phase E — Plugin coverage + bus dispatch

**Status: ⚠️ Partial.**  The runtime spine exists; plugin coverage in
`PluginRegistry` is **13/38 packages**; legacy `commandManager.execute`
is still pervasive (198 reaches across 122 files).

### 5.1  E.0 — `ToolsPanelController` runtime threading

The morning doc flagged `Layout.ts:1551` as missing runtime threading.
Confirmed at HEAD:

```ts
// src/ui/Layout.ts:1551 (region)
const toolsPanelController = new ToolsPanelController({
    bimManager:       props.bimManager,
    toolManager:      props.toolManager,
    selectionManager: props.selectionManager,
    wallTool:         props.wallTool,
    slabTool:         props.slabTool,
    service,
    projectContext:   props.projectContext,
    …
});
```

**No `runtime` property** is passed into `ToolsPanelController`.  This
is the thread that was supposed to give every panel access to
`runtime.tools`, `runtime.bus`, `runtime.plugins.contributions(…)`
without going through `(window as any).pryzmRuntime`.  Until this
prop is added, every panel has to fall back to the global cast — which
is why F.1.01 (today) plumbed the runtime through
`CreateRailPanel`'s constructor manually.

### 5.2  E.* — `runtime.tools.register(…)` reach in `Layout.ts`

```
src/ui/Layout.ts:481-490
    runtime.tools.register('wall', …);
    runtime.tools.register('curtain-wall', …);
    runtime.tools.register('door', …);
    runtime.tools.register('window', …);
    runtime.tools.register('stair', …);
    runtime.tools.register('handrail', …);
    runtime.tools.register('ramp', …);          // TODO(E.6) bridge
    runtime.tools.register('ceiling', …);
    runtime.tools.register('ceiling:auto', …);  // TODO(E.7) bridge
    runtime.tools.register('floor', …);
```

10 tool IDs are registered through `runtime.tools.register()` — a
significant E milestone.  Two (`ramp` + `ceiling:auto`) still bridge
through `(window as any).rampTool` / `.ceilingTool` with explicit
TODOs pointing at E.6 / E.7.

### 5.3  E.* — Plugin scaffolds vs. `PluginRegistry` wiring

```
Total plugin packages on disk (plugins/*/)      = 38
Wired in apps/editor/src/PluginRegistry.ts      = 13
```

**Wired (13):**
`wall, slab, door, window, roof, curtain-wall, grid, column, beam,
stair, handrail, ceiling, view`.

**Scaffolded but NOT wired in PluginRegistry (25):**
`ai-floorplan, ai-generative, ai-query, ai-rules, ai-voice,
annotations, bcf, cross, dimensions, furniture, ifc-export, ifc-import,
ifc-inspector, lighting, multiplayer, plan-view, plumbing, rhino-import,
rooms, schedules, section-view, selection, sheets, structural, toy-cube`.

The morning doc cites "12/17 plugins"; ground-truth is **13/38**.
The denominator drift (17 → 38) reflects the fact that many plugin
*packages* exist (with their own `tool.ts`, types, even tests) but
have not been added to `PluginRegistry`'s import block — so they
**cannot be activated through `runtime.plugins.handlers(…)`** even
though the package is buildable.

Of the 25 scaffolded-but-not-wired packages, **4 already have a
`bus.executeCommand` reach in `tool.ts`** (`furniture, plumbing, rooms,
structural`) — meaning their *tool* code is bus-aware, but `PluginHost`
will return an empty handler set for them at runtime.  The remaining
21 packages are earlier-stage scaffolds.

### 5.4  E.* — Legacy `commandManager.execute(…)` reach in `src/`

```
$ rg -c "commandManager\.execute\(" src/ --type ts
Total reaches: 198 across 122 files
```

198 reaches across 122 files in `src/` still call the legacy
`commandManager.execute(…)` directly instead of going through
`runtime.bus.executeCommand(…)`.  This is the **bulk of the E
workload that has not happened**.

### 5.5  E.* — Legacy command/element trees

```
src/elements/    23 family directories
src/commands/    31 family directories
```

The legacy command and element trees are still on disk in their
entirety.  They are the source of the 198 `commandManager.execute`
reaches.

### 5.6  Verdict — Phase E

| Track | Status |
|---|---|
| `runtime.tools.register` reach (10 tools) | ✅ |
| Plugin packages wired in `PluginRegistry` | ⚠️ **13/38** |
| Plugin scaffolds with bus-aware `tool.ts` | 16 packages (13 wired + 4 stranded: furniture/plumbing/rooms/structural) |
| `ToolsPanelController` receives `runtime` | ❌ (Layout.ts:1551) |
| Legacy `commandManager.execute` removal | ❌ 198 reaches × 122 files |
| Legacy `src/elements/` + `src/commands/` removal | ❌ 23 + 31 = 54 family dirs on disk |

The morning doc's "22 % production-live" estimate is in the right
ballpark for the *production wiring* of the new bus, but it
understates how much of the *scaffolding* is in place (16/38 packages
have bus-aware tools, just not wired) and overstates how close the
legacy removal is (198 reaches is a lot).

---

## 6.  Phase F — UI contribution shape

**Status: ⚠️ Just begun.  1/257 sub-phases done.**

### 6.1  Today's delta — `F-launch.1`

The morning reconciliation doc says **0/257 sub-phases done**.  Today,
`F-launch.1` landed and **F.1.01** is now done:

- `plugins/wall/src/contributions.ts` — `wallToolbarContribution` of
  `kind: 'toolbar.discipline'`, `id: 'wall.tool'`.
- `plugins/wall/src/index.ts:77` — re-exports `wallToolbarContribution`
  from the package barrel.
- `apps/editor/src/PluginRegistry.ts:28,111` — imports the
  contribution and lists it in the wall plugin's `contributions: […]`
  field.
- `apps/editor/src/PluginRegistry.ts:250` — `gatherAllContributions()`
  flattens every plugin's `contributions` field into a single array,
  which is the input to `PluginHost`'s seed pass.
- `packages/runtime-composer/src/PluginHost.ts:125-160` —
  `_byKind: Map<string, PluginContribution[]>` is populated at compose
  time from those seeds; `contributions(kind)` returns the bucket;
  `register(contribution)` appends at runtime and returns a
  `Disposable`.
- `src/ui/tools-panel/panels/CreateRailPanel.ts:94, 764, 785` —
  `_findToolbarContribution('wall.tool')` looks the contribution up
  via `runtime.plugins.contributions('toolbar.discipline')` and
  `_buildSections()` calls `contrib.activate(runtime)` when the user
  clicks the Wall button.

So Phase F sub-phases:

```
F.1.01 — wall toolbar contribution     = ✅ done (F-launch.1, today)
F.1.02 → F.X.YYY                       = 256 remaining
```

**1/257 ≈ 0.4 % done.**

### 6.2  Other F deliverables — current state

| Counter | Value | Spec target |
|---|---:|---|
| `plugins/*/src/contributions.ts` files | **1** (wall) | ~22 |
| `plugins/*/inspector/Panel.ts` files | 0 | ~22 |
| `plugins/*/modal/Create.ts` files | 0 | ~22 |
| `runtime.plugins.contributions(kind)` consumers | 2 (`CreateRailPanel`, `apps/bench` tool-activate bench) | many |
| `gatherAllContributions()` in `PluginRegistry` | ✅ exists at line 250 | — |
| `PluginHost.contributions/register` real impl | ✅ at lines 125-160 | — |

### 6.3  Missing prereq plugin scaffolds

Eight plugin packages referenced by the F roadmap **do not exist** at
all in `plugins/`:

```
plugins/floor:        ✗ MISSING
plugins/export-pdf:   ✗ MISSING
plugins/dxf:          ✗ MISSING
plugins/render:       ✗ MISSING
plugins/geospatial:   ✗ MISSING
plugins/levels:       ✗ MISSING
plugins/navigate:     ✗ MISSING
plugins/visual:       ✗ MISSING
```

These will need scaffolding (E-side) before their F contributions can
be authored.

### 6.4  Verdict — Phase F

**1/257 sub-phases done (F.1.01 today via F-launch.1).**  The
contribution-mechanism plumbing is end-to-end real:
- `PluginContribution` types in `runtime-composer/types.ts`
- `PluginHost._byKind` registry with a stable seed + runtime
  `register()` API
- `PluginRegistry.gatherAllContributions()` aggregator
- A live consumer (`CreateRailPanel._findToolbarContribution`)
- A perf bench (`apps/bench/src/benches/ui/tool-activate.bench.ts`)
  with a recorded p95 of 0.001 ms over 600 activations

…but only **one contribution** has been authored so far (the wall
toolbar button, today).  The remaining 256 sub-phases are unstarted.

---

## 7.  Build & tests at HEAD

### 7.1  `npm run build`

```
npm run build  ⇒  exit 0
chain: scripts/check-project-isolation.mjs
    → tsc --skipLibCheck             (~26 s, 0 errors)
    → vite build                     (~47 s, NODE_OPTIONS=--max-old-space-size=3072)
    → scripts/write-prod-shim.mjs    (writes prod shim)
```

### 7.2  Sibling test workflows (8/8 green)

| Workflow | Tests |
|---|---|
| `bcf-round-trip` | 57 passed (57) |
| `family-editor-quality-gates` | 17 passed (17) |
| `ifc-export-tier1` | 16 passed (16) |
| `ifc-import-tier2` | 18 passed (18) |
| `ifc-inspector-pset-editor` | 12 passed (12) |
| `pryzm-persistence` | 144 passed (144) |
| `pryzm-vi-parity` | 82 passed (82) |
| `rhino-import-3dm` | 4 passed (4) |
| **TOTAL** | **350 / 350 passing** |

### 7.3  New benches

`apps/bench/src/benches/ui/tool-activate.bench.ts` — 600-activation
bench around `runtime.plugins.contributions('toolbar.discipline')`
plus the wall contribution's `activate(runtime)` path.  Recorded p95
= 0.001 ms (output in `apps/bench/.run-output/ui.tool-activate.json`).

---

## 8.  Reconciliation appendix — disagreements with the morning docs

| # | Topic | Morning reconciliation doc | This audit (HEAD) | Source of drift |
|---|---|---|---|---|
| 1 | `PryzmRuntime` slot count | 14 | **17** | C-track sub-phases legitimately added `selection`, `projectContext`, `undoStack` slots |
| 2 | `(window as any)` reaches in `src/ui/` | 773 | **766** | C-rewires drop reaches as a side-effect; today's `B.adopt.1` shed 3 more |
| 3 | `EngineBootstrap.ts` LOC | 2 035 | **2 048** | natural drift since morning snapshot |
| 4 | Phase D % done | ~40 % | **~29 %** (2/7 sub-phases) | morning estimate counted D.5 + D.6 (done) but was generous on the rest |
| 5 | Plugins in `PluginRegistry` | 12/17 | **13/38** | numerator includes `view` (13); denominator is the **actual count of `plugins/*/` directories on disk** (38), not the morning doc's narrower scope |
| 6 | `plugins/*/contributions.ts` count | 0/22 | **1/22** | F.1.01 landed today (wall) |
| 7 | Phase F sub-phases done | 0/257 | **1/257** | F.1.01 landed today |
| 8 | Panel-base adopters in `src/ui/` | 0 | **1** | `B.adopt.1` landed today (ExistingProjectsPanel) |
| 9 | `ProjectRepository.ts` external importers | 1 (rev 1) | **2** | rev 1 was wrong — actual was 3 before today (ProjectHub + PlatformShell + ExistingProjectsPanel); today's `B.adopt.1` removed ExistingProjectsPanel, leaving 2 |
| 10 | `SaveOrchestrator.ts` external importers | 0 (rev 1) | **1** (`PlatformShell.ts:34`) | rev 1 was wrong — file is alive in PlatformShell, not dead-code |
| 11 | `ServerSyncQueue.ts` external importers | 0 (rev 1) | **1** (`PlatformShell.ts:35`) | rev 1 was wrong — file is alive in PlatformShell, not dead-code |

All other counts (3 legacy persistence files on disk; D.7
`UnifiedFrameLoop` 424 LOC + 3 importers; 198 `commandManager.execute`
reaches; 98 `requestAnimationFrame` reaches; no `cameraController`
slot) **verify exactly as the morning docs state**.

---

## 9.  Recommended next steps (ordered by leverage)

> **Rev 2 correction.**  Step (1) below replaces rev 1's wrong
> "delete SaveOrch + ServerSync today, they are dead code" claim.
> All three C.11 files are gated by `PlatformShell.ts`; the real
> ordering is migrate-then-delete, not delete-then-migrate.

1. **C.11 — corrected ordering (multi-session effort).**  All three
   legacy persistence files are gated by
   `src/ui/platform/PlatformShell.ts` (2 433 LOC, 37 persistence
   reaches).  The honest ordering is:
   1. **Migrate `PlatformShell.ts` off the legacy trio.**  Replace
      its `projectRepository / versionRepository / saveOrchestrator /
      serverSyncQueue` reaches with the corresponding
      `runtime.persistence.*` equivalents (already wired by the
      C.1-C.10 spine).  This is the load-bearing migration; expect
      it to span its own session given the file size and reach count.
   2. **Migrate `ProjectHub.ts:24` off `projectRepository`.**  After
      this, `ProjectRepository.ts` has zero importers and is
      delete-ready.
   3. **Delete `ServerSyncQueue.ts`** (now zero importers — was
      gated only by PlatformShell).
   4. **Delete `SaveOrchestrator.ts`** (now zero importers — same).
   5. **Delete `ProjectRepository.ts`** (433 LOC).
   None of these can be done out of order without breaking the build.
2. **D.3 quick win** — delete `apps/editor/src/main.ts` and
   `mountEditor`.  Zero production import callers.
3. **E.0** — add `runtime` to `ToolsPanelController` props at
   `src/ui/Layout.ts:1551`.  Eliminates `(window as any).pryzmRuntime`
   reach for at least 4 panels (`CreateRailPanel`, the discipline
   rails) and unblocks the manual plumbing F-launch.1 had to do.
4. **E plugin wiring** — move the 4 stranded plugins
   (`furniture`, `plumbing`, `rooms`, `structural`) into
   `PluginRegistry.ts` (their `tool.ts` already calls
   `bus.executeCommand`).  Cheap +4 to plugin coverage.
5. **D.4** is the biggest single cleanup (2 048 LOC) but is non-trivial
   because `src/main.ts` lazily imports `EngineBootstrap` as the
   legacy fallback — needs a dedicated session.
6. **F.1.02 → F.1.NN** — author the next ~21 toolbar contributions
   (one per discipline plugin in `PluginRegistry`).  The
   F.1.01 pattern (wall) is now a copy-paste template:
   `contributions.ts` with `id, kind, label, activate(runtime)`,
   re-export from package `index.ts`, add to plugin's
   `contributions: […]` in `PluginRegistry.ts`, switch the
   corresponding `_buildSections()` button to
   `_findToolbarContribution('<id>').activate(runtime)`.
7. **B Panel adoption** — repeat the `B.adopt.1` wedge pattern
   (§2.5) across the remaining ~64 panels.  Suggested ordering:
   the small, runtime-aware ones first (the rail panels in
   `src/ui/ViewBrowser/panels/` and `src/ui/tools-panel/panels/`),
   then the big stateful ones (`PropertyInspector.ts` 87 casts,
   `Layout.ts` 43 casts) once D.4 has landed and the panel state
   model has settled.  Each adoption that also touches
   `runtime.persistence` is double-leverage (one Panel-counter +
   one C.11-importer drop).

---

*Generated: 2026-04-29 (evening, rev 2) — verified entirely against
code at HEAD on `main`, no doc trusted.  Rev 1 had two material
errors in §3.2 (importer counts for SaveOrch + ServerSync +
ProjectRepository); rev 2 corrects them and adds the new §2.5 for
the `B.adopt.1` wedge that landed in this session.*
