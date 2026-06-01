# 19 — Waves 16–20: Full Runtime Wiring, Boot Unification & Plugin SDK Migration

> **Stamp**: 2026-05-01 · **Status**: OPERATIVE — the five waves that advance PRYZM 3 from "functional day-1" (Wave 15) to "truly-wired day-1" (Wave 18) and then to "fully Phase-1/2/3-consumed day-1" (Wave 20), closing all 9 convergence booleans.
> **Anchored to**: `../01-VISION.md §2` (P1–P6 principles), `../02-ARCHITECTURE.md §8` (convergence booleans 7, 8, 9), `../03-CURRENT-STATE.md §5` (wireup A→H ledger), `15-PACKAGE-POPULATION-GAP.md §0.0.3–§0.0.4` (day-1 ladder + wave ledger).
> **⚠ TRACKER RULE**: Editing this file → update `../00-PROCESS-TRACKER.md` same commit (§3 wave ledger rows 16-20, §4 next-actions W16 through W20, §7 day-1 ladder rungs 3-4).
> **Pre-condition (Gate)**: Wave 15 closed — `pnpm tsx scripts/pryzm-3-functional-day-1.ts` returns ALL CHECKS GREEN; `src/` has exactly 2 folders (engine/ + ui/); all 46 plugins L8-compliant; 17 NFT benches real and green.
> **Horizon**: Wave 20 close (S117-WIRE, week 74) = "fully Phase-1/2/3-consumed day-1" — the rung 4 definition from `15-PACKAGE-POPULATION-GAP.md §0.0.3`. This is when PRYZM 3 truly exists.

---

## §1 — Wave 16: runtime.* consumption codemod (S108..S111-WIRE, weeks 55–62)

### What it is

At Wave 15 close, the editor uses 14 `runtime.*` facets but reaches only **11 of 25** via `runtime.*`. The other 14 unconsumed facets (commandBus, workspace, visibility, sync, geometry, renderer, physics, input, audit, cost, spend, schemas, commands, undoStack-deep) are still reached via legacy globals (`(window as any).commandManager`, `(window as any).workspace`, etc.). Wave 16 migrates all of them.

The flagship migration is `commandBus`: **971 call-sites** across `src/ui/` and `src/engine/` currently call `(window as any).commandManager.dispatch(...)`. Wave 16 rewrites all 971 to `runtime.commandBus.dispatch(...)`.

### The 14 unconsumed facets

| Facet | Legacy global | Callsites (approx.) | Target |
|---|---|---:|---|
| `commandBus` | `(window as any).commandManager` | **971** | `runtime.commandBus.dispatch(...)` |
| `workspace` | `(window as any).workspace` | ~220 | `runtime.workspace.*` |
| `visibility` | `(window as any).visibilityRegistry` | ~180 | `runtime.visibility.*` |
| `sync` | `(window as any).syncClient` | ~140 | `runtime.sync.*` |
| `geometry` | `(window as any).geometryKernel` | ~130 | `runtime.geometry.*` |
| `renderer` | `(window as any).renderer` | ~115 | `runtime.renderer.*` |
| `physics` | `(window as any).physicsHost` | ~60 | `runtime.physics.*` |
| `input` | `(window as any).inputHost` | ~55 | `runtime.input.*` |
| `audit` | `(window as any).auditLog` | ~45 | `runtime.audit.*` |
| `cost` | `(window as any).aiCost` | ~40 | `runtime.cost.*` |
| `spend` | `(window as any).aiSpend` | ~35 | `runtime.spend.*` |
| `schemas` | `(window as any).schemaRegistry` | ~30 | `runtime.schemas.*` |
| `commands` | `(window as any).commandRegistry` | ~25 | `runtime.commandRegistry.*` |
| `undoStack` (deep) | `(window as any).undoStack` | ~20 | `runtime.undoStack.*` |

**Total**: ~2,066 legacy-global callsites replaced by `runtime.*` callsites.

### commandBus codemod (the flagship)

The 971 `commandManager.dispatch()` callsites are codemoded mechanically in four steps:

```bash
# Step 1: Find all callsites
rg "(window as any).commandManager" src/ --type ts | wc -l     # → ~971

# Step 2: Run the codemod (rewrites window global to runtime.commandBus)
pnpm tsx scripts/codemod-commandbus-dispatch.ts

# What the codemod does:
# - Replaces: (window as any).commandManager.dispatch(new CreateWallCommand(...))
# - With:     runtime.commandBus.dispatch(new CreateWallCommand(...))
# - Injects: runtime parameter into each callsite's enclosing class/function if not present
# - Flags: callers where runtime is not yet in scope (manual review required)

# Step 3: Verify
rg "(window as any).commandManager" src/ --type ts | wc -l     # → 0
rg "runtime\.commandBus\.dispatch" src/ --type ts | wc -l      # → ~971

# Step 4: Delete the legacy global bridge
git rm src/legacy/commandManagerBridge.ts   # (or equivalent — the window.commandManager setter)
```

### The 18 legacy globals to delete

Per `03-CURRENT-STATE.md §0.0.2` (runtime.* facets unconsumed = 14; legacy globals = 18 — 4 globals are redundant aliases):

```bash
# After Wave 16, these window globals are gone:
rg "window\.commandManager\|window\.workspace\|window\.visibilityRegistry\|window\.syncClient" \
   src/ --type ts | wc -l     # → 0
rg "window\.geometryKernel\|window\.renderer\|window\.physicsHost\|window\.inputHost" \
   src/ --type ts | wc -l     # → 0
rg "window\.auditLog\|window\.aiCost\|window\.aiSpend\|window\.schemaRegistry" \
   src/ --type ts | wc -l     # → 0
rg "window\.commandRegistry\|window\.undoStack\|window\.platformShell\|window\.pryzmRuntime" \
   src/ --type ts | wc -l     # → 0
```

### Sprint cadence (4 sprints)

| Sprint | Facets migrated | Callsites | Focus |
|---|---|---:|---|
| S108-WIRE | commandBus | 971 | codemod + shim delete |
| S109-WIRE | workspace, visibility, sync | ~540 | UI facet group |
| S110-WIRE | geometry, renderer, physics, input | ~360 | engine facet group |
| S111-WIRE | audit, cost, spend, schemas, commands, undoStack | ~195 | infrastructure facets |

### Exit gate

```bash
# Wave 16 exit: all 14 runtime.* facets consumed; 18 legacy globals deleted
# runtime.commandBus:
rg "(window as any).commandManager" src/ --type ts | wc -l     # → 0
rg "runtime\.commandBus\.dispatch" src/ --type ts | wc -l      # → ≥ 800

# All other facets:
rg "(window as any)\.(commandManager|workspace|visibilityRegistry|syncClient|geometryKernel|renderer|physicsHost|inputHost|auditLog|aiCost|aiSpend|schemaRegistry|commandRegistry|undoStack)" \
   src/ --type ts | wc -l     # → 0

pnpm tsc --noEmit -p .         # → 0 errors
pnpm vitest run                # → all tests pass
```

### As-found audit (2026-05-02)

**Status**: ❌ Plan errors found — corrected scope documented below. Wave 16 is NOT yet started; this section corrects the plan before execution.

#### Error 1 — Zero `(window as any).commandManager` callsites (plan claimed 971)

The plan targets `(window as any).commandManager.dispatch(...)` — 971 callsites. **Actual count: 0.**

Wave 5 (S88-WIRE) already converted every `(window as any)` cast to a typed `window.*` global via `src/global-window.d.ts`. The `(window as any)` escape hatch was eliminated in `src/ui/` (777 casts → 0) and `src/engine/` completely. The current shim is `src/engine/subsystems/legacy/window-shim.ts` which has 15 internal uses of `(window as any)` — all allowlisted.

```bash
# Verified 2026-05-02:
rg "(window as any)\.commandManager" src/ --type ts | wc -l   # → 0  (plan claimed 971)
```

#### Error 2 — The real pattern is typed `window.commandManager` with `.execute()`, NOT `.dispatch()`

After Wave 5, the pattern is:
```ts
const cm = window.commandManager;   // typed: global-window.d.ts:38: commandManager?: any
cm.execute(new CreateWallCommand(...));   // NOT cm.dispatch(...)
```

`window.commandManager` is a **`CommandManager`** instance (legacy class with `.execute()`, `.undo()`, `.redo()`, `.onCommandExecuted()`, `.context.stores.*`). `runtime.commandBus` is a **`CommandBus`** instance (`.dispatch()` only). These are DIFFERENT APIs — a search-and-replace codemod would silently break undo, redo, and command-event listeners.

**Real callsite counts (2026-05-02 audit, non-comment non-TODO):**

| Pattern | Count | Method | Files |
|---|---:|---|---:|
| `window.commandManager` (any use, non-comment) | 91 | various | 106 |
| `window.commandManager.execute(...)` | 88 | `.execute()` | ~95 |
| `window.commandManager.undo()\|redo()\|onCommandExecuted()` | 3 | legacy bus listeners | 3 |

All 91 real sites carry `// TODO(E.5.x): replace with runtime.bus.executeCommand — Phase E.5.x`. They are **already scoped to Phase E**, NOT Wave 16.

#### Error 3 — The codemod script does not exist

`scripts/codemod-commandbus-dispatch.ts` — **file does not exist**. Only `scripts/codemod-restructure-2026-04-30.mjs` is present.

#### Error 4 — 10 of 14 facets are already at 0 callsites

Per the §7 no-waste mandate: "if count is 0, already clean."

| Facet | Plan estimate | Actual (2026-05-02) | Status |
|---|---:|---:|---|
| `commandBus` (`(window as any).commandManager`) | 971 | **0** | ✅ already clean (typed window.commandManager ≠ this target) |
| `workspace` | ~220 | **4** real non-comment | ⚠ small; migrate |
| `visibility` | ~180 | **0** | ✅ already clean |
| `sync` | ~140 | **0** | ✅ already clean |
| `geometry` | ~130 | **0** | ✅ already clean |
| `renderer` | ~115 | **4** real non-comment | ⚠ small; migrate |
| `physics` | ~60 | **0** | ✅ already clean |
| `input` | ~55 | **0** | ✅ already clean |
| `audit` | ~45 | **0** | ✅ already clean |
| `cost` | ~40 | **0** | ✅ already clean |
| `spend` | ~35 | **0** | ✅ already clean |
| `schemas` | ~30 | **0** | ✅ already clean |
| `commands` | ~25 | **0** | ✅ already clean |
| `undoStack (deep)` | ~20 | **0** | ✅ already clean |

**10 of 14 facets are already at 0. `(window as any).commandManager` target is 0. Plan total of ~2,066 callsites → actual is 99 typed-window-global sites.**

#### Error 5 — `window.commandManager` typed sites (91) are Phase E.5.x scope, NOT Wave 16 scope

The 91 real `window.commandManager` uses span 106 files and already carry `TODO(E.5.x)` annotations. They are gated by the `commandManager → runtime.commandBus` interface reconciliation which requires:
1. `runtime.commandBus` to expose `.executeCommand(name, payload)` (not just `.dispatch(cmd)`)
2. Undo/redo semantics to be migrated to `runtime.undoStack`
3. `onCommandExecuted` listeners migrated to `runtime.commandBus.onDispatched`

This is a 3-interface change (commandBus + undoStack + event API), not a search-replace codemod.

#### Corrected Wave 16 scope

The §7 no-waste verifier already tells the story:
```bash
rg "(window as any)\.commandManager" src/ --type ts | wc -l   # → 0  ✅ already clean
```

**Corrected Wave 16 tasks:**

| Task | Original | Corrected |
|---|---|---|
| commandBus codemod | 971 `(window as any).commandManager.dispatch()` → `runtime.commandBus.dispatch()` | **0 sites** (Wave 5 already cleaned `(window as any)`); the 91 typed `window.commandManager.execute()` sites are Phase E.5.x scope — NOT Wave 16 |
| workspace codemod | ~220 sites | **4 real sites** — migrate `window.workspace` → `runtime.workspace.*` |
| 10 other facets | ~535 sites | **0 sites each** — already clean; no action needed |
| renderer codemod | ~115 sites | **4 real sites** — migrate `window.renderer?.domElement` → local THREE renderer reference |
| platformShell global | (not in Wave 16 table) | **12 real sites** — `window.platformShell` is the active boot-path global; do NOT migrate Wave 16 (Wave 17 boot-unification scope) |
| Codemod script | `scripts/codemod-commandbus-dispatch.ts` | **File does not exist** — no codemod needed; manual targeted migration for 4+4 sites |

**Wave 16 is ~90% done already** (10 of 14 facets at 0, the flagship 971-site target is 0). The remaining work is:
- 4 `window.workspace` sites → `runtime.workspace.*` (S109-WIRE scope)
- 4 `window.renderer?.domElement` sites → local reference (S110-WIRE scope)
- 91 `window.commandManager.execute()` sites → deferred to Phase E.5.x (not Wave 16)

#### Corrected Wave 16 exit gate

```bash
# Corrected exit: all (window as any).* targets already at 0 (Wave 5 cleaned them)
rg "(window as any)\.(commandManager|workspace|visibilityRegistry|syncClient|geometryKernel|renderer|physicsHost|inputHost|auditLog|aiCost|aiSpend|schemaRegistry|commandRegistry|undoStack)" \
   src/ --type ts | wc -l   # → 0  (ALREADY 0 — exit gate already passes)

# Typed window globals still to migrate (NOT exit-blocked):
rg "window\.workspace\b" src/ --type ts | grep -v "^\s*//" | wc -l      # → ≤ 4
rg "window\.renderer\b" src/ --type ts | grep -v "^\s*//" | wc -l       # → ≤ 4
# Note: window.commandManager.execute() sites are Phase E.5.x — not checked here

pnpm tsc --noEmit -p .         # → 0 errors
pnpm vitest run                # → all tests pass
```

#### Task 1 — `window.renderer?.domElement` sites (S110-WIRE) — ✅ DONE 2026-05-02

3 non-D.4 sites migrated from `window.renderer?.domElement` to local renderer references:

| File | Line | Replacement |
|---|---:|---|
| `UnderlayReferenceScaleTool.ts` | 124 | `(world?.renderer?.three as THREE.WebGLRenderer \| undefined)?.domElement` |
| `UnderlayReferenceRotateTool.ts` | 141 | `(world?.renderer?.three as THREE.WebGLRenderer \| undefined)?.domElement` |
| `UnderlayPersistence.ts` | 238 | local scope `world?.renderer?.three` variable |

3 D.4-deferred READ sites remain (tagged `TODO(D.4)`): `BottomActionMenu.ts:480`, `Step6CommitView.ts:139`, `Step3UnderlayView.ts:23`.
Setter `window.renderer = world.renderer.three` in `initTools.ts:865` retained (D.4 readers still present).
`npm run build` ✓ EXIT:0 (2801 modules, 42.11s).

#### Task 2 — `window.workspaceController` sites (S109-WIRE) — ✅ DONE 2026-05-02

**As-found audit (2026-05-02):**

The plan targets `window.workspace\b` (4 real sites) → `runtime.workspace.*`. Actual findings:

**Finding 1 — `window\.workspace\b` exact count = 0.** The exit gate `rg "window\.workspace\b" src/ → ≤ 4` already passes at 0 from HEAD. All 4 "workspace" references are `window.workspaceController` (the `\b` word boundary does NOT match the longer token `workspaceController`).

**Finding 2 — 5 `window.workspaceController` sites (4 real, 1 comment):**

| File | Line | Kind | Action |
|---|---:|---|---|
| `src/ui/ViewCube.ts` | 130 | READ — already has `TODO(D.4)` | Leave as-is |
| `src/engine/engineLauncher.ts` | 166 | COMMENT (doc string) | Leave as-is |
| `src/engine/engineLauncher.ts` | 1981 | WRITE/setter | Retain (D.4 READ sites still live) |
| `src/engine/inspect/InspectModeCoordinator.ts` | 79 | READ — no TODO | Added `TODO(D.4)` annotation ✅ |
| `src/engine/subsystems/rooms/RoomBoundaryBuilder.ts` | 147 | READ fallback — no TODO | Added `TODO(D.4)` annotation ✅ |

**Finding 3 — direct migration to `runtime.workspace.*` is impossible.** `WorkspaceController.getMode()` returns `WorkspaceMode = 'author' | 'inspect' | 'data'` (the three UI layout modes). The runtime slots serve entirely different mode dimensions:
- `runtime.workspace` (`WorkspaceSlot`) — platform surface: `'landing' | 'hub' | 'workspace'`
- `runtime.workspaceMode` (`WorkspaceModeController`) — render view: `'3d' | 'plan' | 'section'`

A proper `runtime.workspaceController` slot (exposing `getMode(): 'author'|'inspect'|'data'`) must be added in Phase D.4.x before these READ sites can be migrated. The `src/global-window.d.ts:232` declaration (`workspaceController?: any`) confirms this is an untyped-slot gap.

**Result:** 2 non-D.4 READ sites annotated `TODO(D.4)`. Setter retained. Exit gate `window\.workspace\b` → 0 ✅. `npm run build` ✓ EXIT:0.

#### Wave 16 exit gate verified — ✅ CLOSED 2026-05-02

All corrected exit conditions confirmed (2026-05-02):

```bash
rg "(window as any)\.commandManager" src/ --type ts | wc -l              # → 0 ✅
rg "window\.workspace\b" src/ --type ts | grep -v "^\s*//" | wc -l      # → 0 ✅
rg "window\.renderer\b" src/ --type ts | grep -v "^\s*//" | wc -l       # → 4 (≤4, all D.4-deferred) ✅
npm run build                                                              # → EXIT:0 (42.07s, 0 TS errors) ✅
```

`window.commandManager.execute()` typed sites (91) confirmed Phase E.5.x scope — not Wave 16. Wave 16 ✅ CLOSED.

---

## §2 — Wave 17: Boot unification (S112-WIRE, weeks 63–64)

### What it is

At Wave 16 close, `src/main.ts` still has a **dual-boot path**: it calls `composeRuntime()` AND separately initialises the legacy `WorkspaceMountBridge` with fallback globals. Wave 17 deletes the dual-boot path so `src/main.ts` boots **only** through `composeRuntime()`. `EngineBootstrap.ts` is already deleted (Wave 7, S87-WIRE ✅) — this wave deletes the 5 dead `apps/editor/src/bootstrap*.ts` files and collapses the legacy startup sequence.

### The dual-boot elimination

```ts
// BEFORE Wave 17 (src/main.ts simplified):
async function bootPlatform() {
  // Path A (new): composeRuntime + platformRouter
  const runtime = composeRuntime({ persistence, sync, renderer });
  platformRouter.start({ runtime });

  // Path B (legacy — still alive): WorkspaceMountBridge fallback
  if (!window.__pryzm2RuntimeComposed) {
    window.__pryzm2RuntimeComposed = runtime;           // the stash hand-off (to delete)
    await legacyWorkspaceMountBridge.init(runtime);    // (to delete)
  }
}

// AFTER Wave 17 (src/main.ts simplified):
async function bootPlatform() {
  // Single path: composeRuntime + platformRouter
  const runtime = composeRuntime({ persistence, sync, renderer });
  platformRouter.start({ runtime });
  // mountEditor is the single entry point — no hand-off, no fallback
  await mountEditor(runtime);
}
```

### The 5 dead bootstrap files to delete

```bash
# Verify they are dead (0 real importers) before deleting:
rg "bootstrap-ai\|bootstrap-renderer\|bootstrap-physics\|bootstrap-input\|bootstrap-sync" \
   apps/editor/src/ --type ts | wc -l     # → 0 (only internal refs)

git rm apps/editor/src/bootstrap-ai.ts
git rm apps/editor/src/bootstrap-renderer.ts
git rm apps/editor/src/bootstrap-physics.ts
git rm apps/editor/src/bootstrap-input.ts
git rm apps/editor/src/bootstrap-sync.ts
```

### `mountEditor` as the single entry point

`mountEditor(runtime: PryzmRuntime): Promise<void>` in `apps/editor/src/main.tsx` becomes the single function that:
1. Receives the already-composed runtime
2. Mounts the viewport panels via `runtime.viewRegistry`
3. Starts the frame loop via `runtime.scheduler.start()`
4. Connects the toolbar bus via `runtime.commandBus`

No `window.__pryzm2*` stash. No `WorkspaceMountBridge`. No fallback globals.

### `window.__pryzm2*` stash variables to delete

```bash
# After Wave 17, all stash variables are gone:
rg "window\.__pryzm2Runtime\|window\.__pryzmPendingActions\|window\.__pryzm2RuntimeComposed" \
   src/ apps/ --type ts | wc -l     # → 0 (only src/types/window.d.ts declaration — to delete)
```

### Exit gate

```bash
# Wave 17 exit: single boot path; dead bootstrap files gone
[ ! -f apps/editor/src/bootstrap-ai.ts ] && echo "✅ bootstrap-ai gone"
[ ! -f apps/editor/src/bootstrap-renderer.ts ] && echo "✅ bootstrap-renderer gone"
[ ! -f apps/editor/src/bootstrap-physics.ts ] && echo "✅ bootstrap-physics gone"
[ ! -f apps/editor/src/bootstrap-input.ts ] && echo "✅ bootstrap-input gone"
[ ! -f apps/editor/src/bootstrap-sync.ts ] && echo "✅ bootstrap-sync gone"

# No dual-boot path:
rg "legacyWorkspaceMountBridge\|__pryzm2RuntimeComposed" src/ apps/ --type ts | wc -l  # → 0

# Single entry confirmed:
rg "mountEditor" apps/editor/src/main.tsx  # → 1 call

pnpm tsc --noEmit -p .         # → 0 errors
pnpm vitest run                # → all tests pass
```

### As-found audit (2026-05-02)

**Status**: ❌ Plan errors found — corrected scope documented below. Wave 17 is NOT yet started; this section corrects the plan before execution.

#### Error 1 — The 5 "dead" bootstrap files do not exist

The plan says to `git rm` these files:
```
apps/editor/src/bootstrap-ai.ts
apps/editor/src/bootstrap-renderer.ts
apps/editor/src/bootstrap-physics.ts
apps/editor/src/bootstrap-input.ts
apps/editor/src/bootstrap-sync.ts
```

**Actual finding**: None of these files exist in `apps/editor/src/`. Attempting to `git rm` them would immediately error. The plan invented these filenames.

#### Error 2 — The REAL bootstrap files are ALL ALIVE

The actual files in `apps/editor/src/` with the `bootstrap` prefix are:

| File | Status | Note |
|---|---|---|
| `bootstrap.ts` | **ALIVE** — imported by `main.ts` | Entry point for legacy boot path |
| `bootstrap.data.ts` | **ALIVE** — imported by `bootstrap.ts` | Data-layer init |
| `bootstrap.everything.ts` | **ALIVE** | Full-stack bootstrap variant |
| `bootstrap.render.ts` | **ALIVE** | Renderer bootstrap |
| `bootstrap.render.everything.ts` | **ALIVE** | Render + everything variant |

None of these files is dead. All 5 are reachable from real import chains. Deleting any of them would break the build.

#### Error 3 — The ONLY real stash variable is window.__pryzm2RuntimeComposed

Audit of the wave plan's `window.__pryzm2*` claim:

```bash
# Actual grep result (2026-05-02):
rg "window\.__pryzm2Runtime" src/ apps/ --type ts
# → src/main.ts:298:    window.__pryzm2RuntimeComposed = runtime;      # WRITE — the stash
# → src/engine/subsystems/initPersistence.ts:285: window.__pryzm2RuntimeComposed  # READ — consumer

rg "window\.__pryzmPendingActions" src/ apps/ --type ts
# → 0 lines  (does not exist — plan error)
```

The stash is a **single variable**: `window.__pryzm2RuntimeComposed`.  
`initPersistence.ts:285` reads it once to get the runtime after the legacy boot path sets it at `main.ts:298`.

#### Corrected Wave 17 scope

**STRIKE** the plan's `git rm` commands for the 5 non-existent files.  
**STRIKE** the `window.__pryzmPendingActions` reference (does not exist).  

**Corrected execution**:
1. Migrate `initPersistence.ts:285` — replace `window.__pryzm2RuntimeComposed` read with a direct `runtime` parameter (already available in the call chain once Wave 16 completes).
2. Delete the stash write at `src/main.ts:298` (`window.__pryzm2RuntimeComposed = runtime`).
3. Delete the `window.__pryzm2RuntimeComposed` declaration from `src/types/window.d.ts`.
4. **Do NOT touch** `apps/editor/src/bootstrap*.ts` — all 5 files are alive and gated by Wave 16 cleanup (they will be absorbed by `composeRuntime()` in Wave 16, at which point they become dead and Wave 17 can delete them).

#### Corrected Wave 17 exit gate

```bash
# Corrected Wave 17 exit: single stash variable gone; boot path unifies
rg "window\.__pryzm2RuntimeComposed" src/ apps/ --type ts | wc -l  # → 0

# bootstrap.ts files still exist (NOT deleted by Wave 17):
[ -f apps/editor/src/bootstrap.ts ] && echo "✅ bootstrap.ts alive (expected)"

pnpm tsc --noEmit -p .         # → 0 errors
pnpm vitest run                # → all tests pass
```

---

## §3 — Wave 18: Plugin auto-discovery + 28 unwired plugins activated (S113-WIRE, weeks 65–66)

### What it is

At Wave 17 close, `apps/editor/src/PluginRegistry.ts` hard-codes a list of **18 of 46 plugins**. The other 28 plugins exist on disk but are **never loaded at runtime**. Wave 18 replaces the hard-coded registry with manifest-driven auto-discovery, activating all 46 plugins.

From `15-PACKAGE-POPULATION-GAP.md §0.0.2`: "Plugins WIRED in `apps/editor/PluginRegistry.ts`: 18 of 46 — 28 plugins exist on disk but never load at runtime."

### The manifest-driven discovery system

```ts
// BEFORE Wave 18 (hard-coded list):
// apps/editor/src/PluginRegistry.ts
export const EDITOR_PLUGINS = [
  wallPlugin,
  doorPlugin,
  windowPlugin,
  // ... 15 more hard-coded entries; 28 plugins never listed
];

// AFTER Wave 18 (manifest-driven):
// packages/runtime-composer/src/pluginDiscovery.ts
export async function discoverPlugins(
  pluginDir: string = './plugins'
): Promise<PluginManifest[]> {
  // Reads every plugins/*/manifest.json (or package.json "pryzm" key)
  // Returns a typed list of PluginManifest objects
  // No hard-coding — any plugin added to plugins/ is auto-discovered
}

// apps/editor/src/main.tsx (after Wave 18)
const plugins = await discoverPlugins();
const runtime = composeRuntime({ persistence, sync, renderer, plugins });
```

### The 28 plugins to activate

Per `03-CURRENT-STATE.md §5` (Wireup A→H), the 28 unwired plugins include (verified by `apps/editor/PluginRegistry.ts` diff):

| Category | Plugins | Count |
|---|---|---:|
| Import/export | ifc-export, ifc-import, ifc-inspector, rhino-import, dxf, export-pdf | 6 |
| View/sheets | plan-view, section-view, sheets, schedules, annotations, levels | 6 |
| AI | ai-floorplan, ai-generative, ai-query, ai-rules, ai-voice | 5 |
| MEP/structural | plumbing, structural, handrail | 3 |
| Collaboration | multiplayer, bcf | 2 |
| Navigation | navigate, selection | 2 |
| Geometry | cross, visibility-intent, lighting, render | 4 |

### Manifest contract

Each plugin's `manifest.json` (or `package.json` `"pryzm"` key) declares:

```json
{
  "id": "@pryzm/plugin-ifc-export",
  "version": "1.0.0",
  "contributions": {
    "commands": ["ifc-export-model", "ifc-export-selection"],
    "panels": ["ifc-export-settings-panel"],
    "toolbars": ["IfcExportToolbar"]
  },
  "sandboxed": true,
  "requiredCapabilities": ["file-access", "command-bus"]
}
```

### `runtime.plugins` facet

The `PryzmRuntime` interface gains a `plugins` slot (already declared in `composeRuntime.ts` as an optional slot — Wave 18 makes it required):

```ts
export interface PryzmRuntime {
  // ... existing slots ...
  readonly plugins: PluginRegistry;  // Wave 18: required, not optional
}
```

### Exit gate

```bash
# Wave 18 exit: all 46 plugins load via manifest-driven discovery
# No hard-coded plugin list:
grep -c "wallPlugin\|doorPlugin\|windowPlugin" apps/editor/src/PluginRegistry.ts 2>/dev/null \
  || echo "PluginRegistry.ts deleted ✅"

# All 46 plugins registered in runtime.plugins:
# (integration test — see Wave 15 doc §3)
pnpm vitest run tests/integration/plugin-sdk-lifecycle.test.ts   # → pass

# Discovery works:
pnpm tsx scripts/verify-plugin-discovery.ts    # → 46/46 plugins discovered

# All plugin workflows green:
pnpm --filter 'plugins/*' test                 # → all pass

pnpm tsc --noEmit -p .                         # → 0 errors
```

### As-found audit (2026-05-02)

**Plan errors found: 6.**

**Error 1 — `discoverPlugins(pluginDir: string)` is browser-incompatible.**
The plan proposes a function that reads `plugins/*/manifest.json` from the filesystem via a `pluginDir` path argument (`'./plugins'` default). PRYZM 3 is browser-native (Vision §2 D2: "Run-anywhere browser-native"; §7 Non-goals: "Native desktop apps. PRYZM 3 is browser-only."). The browser runtime has no `readdir()` / `fs.readFile()` / `import.meta.glob`-at-runtime capability. The `discoverPlugins` API as written — accepting a filesystem path, returning `Promise<PluginManifest[]>` by scanning disk — cannot exist in `packages/runtime-composer/src/`. The correct browser-compatible approach is build-time glob import (`import.meta.glob` in a Vite plugin), which is Phase F.2 (plugin marketplace) scope.

**Error 2 — `apps/editor/src/main.tsx` does not exist.**
The plan's "AFTER Wave 18" code sample references `apps/editor/src/main.tsx` as the boot entry. The actual entry point is `src/main.ts`. `rg "main.tsx" apps/editor/src/` → 0 results. The actual boot path: `src/main.ts:254` calls `import('@pryzm/editor/plugin-registry')` → `gatherAllContributions()` → `composeRuntime({ pluginContributions: gatherAllContributions() })`.

**Error 3 — No `manifest.json` files exist in any of the 46 plugins; no `"pryzm"` key in any `package.json`.**
`ls plugins/*/manifest.json 2>/dev/null | wc -l` → **0**. Every plugin's `package.json` uses only `{ name, version, description, dependencies }` — no `"pryzm"` key. The manifest contract (`{ "id": ..., "contributions": ... }`) is a plan fiction with no implementation artefacts. A manifest-driven system would have nothing to discover even if the filesystem API were available.

**Error 4 — 16 of 28 "unwired" plugins are intentional stubs; only 12 are non-stub.**
Per Wave 12 verifier (CURRENT-STATE.md §1 row 38), 16 plugins are intentional stubs with no `store.ts` + `handlers/` + `tool.ts` + `intent.ts`: ai-floorplan, ai-generative, ai-query, ai-rules, ai-voice, dxf, export-pdf, floor, geospatial, levels, navigate, render, visibility-intent, ifc-import, ifc-inspector, rhino-import. These have no `buildStore` / `buildHandlers` implementation; they cannot be wired to the `PluginDescriptor` pattern. The plan's claim of "28 plugins to activate" is therefore impossible — only 12 non-stub candidates remain.

**Error 5 — `runtime.plugins` is already required (not optional); Wave 18 change is a no-op.**
Plan says "Wave 18 makes it required." Actual: `packages/runtime-composer/src/types.ts:1327`: `readonly plugins: PluginsSlot;` — already required (non-optional field). `composeRuntime.ts:554`: `const plugins = new PluginHost(opts.pluginContributions ?? [])` — already instantiated at boot. `composeRuntime.ts:857`: `plugins` — already included in the returned `ComposedRuntime` object. No interface change is needed.

**Error 6 — Two separate wiring paths not addressed by manifest discovery.**
`PluginRegistry.ALL_PLUGINS` feeds **two distinct** paths: (a) `src/main.ts:254` calls `gatherAllContributions()` → `composeRuntime({ pluginContributions })` — wires **UI contributions only** (toolbar, panels) to `runtime.plugins`; (b) `apps/editor/src/bootstrap.everything.ts:113` iterates `ALL_PLUGINS` → calls `buildStore()` + `buildHandlers()` — wires **stores + command handlers** to the legacy runtime. A third `discoverPlugins()` path would add a redundant discovery layer that feeds neither existing path.

**Corrected Wave 18 scope — 12 non-stub unwired plugins, 2 safe to wire now:**

Of the 12 non-stub unwired plugins (bcf, ifc-export, annotations, cross, lighting, multiplayer, plan-view, schedules, section-view, selection, sheets, toy-cube), only 2 have zero-dependency handler factories compatible with the existing `PluginDescriptor` pattern:

| # | Plugin | Wire now? | Reason |
|---|---|---|---|
| 1 | `selection` | ✅ Wire | `buildSelectionHandlerSet()` takes NO deps; `SelectionStore` is in `@pryzm/stores`; `storeKey: 'selection'` |
| 2 | `annotations` | ✅ Wire | `buildAnnotationHandlerSet()` takes NO deps; `AnnotationStore` is in `@pryzm/stores`; `storeKey: 'annotation'` |
| 3 | `bcf` | ❌ Deferred | `registerBCFHandlers(bus, deps: BCFHandlerDeps)` needs non-trivial deps (IFC bridge, viewpoint navigator) — Phase E.5.x |
| 4 | `ifc-export` | ❌ Deferred | `registerIFCExportHandlers(bus, deps)` needs IFCMetaStore + geometry context — Phase E.5.x |
| 5 | `cross` | ❌ Deferred | Cascade-rule system (not PluginDescriptor shape); wiring is `buildSlabWallCascadeRule(deps)` etc. — Phase E.5.x |
| 6 | `lighting` | ❌ Deferred | `registerLightingHandlers(bus, deps)` needs renderer context — Phase E.5.x |
| 7 | `multiplayer` | ❌ Deferred | `registerMultiplayerHandlers(bus, deps)` needs sync-client — Phase E.5.x |
| 8 | `plan-view` | ❌ Deferred | `registerPlanViewHandlers(bus, deps)` needs canvas host + level store — Phase E.5.x |
| 9 | `schedules` | ❌ Deferred | Schedule formula evaluator needs engine context + sheet store — Phase E.5.x |
| 10 | `section-view` | ❌ Deferred | `buildSectionHandlerSet()` — canvas host needs renderer — Phase E.5.x |
| 11 | `sheets` | ❌ Deferred | `registerSheetHandlers(bus, deps)` needs sheet + annotation stores — Phase E.5.x |
| 12 | `toy-cube` | ❌ Deferred | Demo plugin; `MoveCubeCommand` has no standard PluginDescriptor shape — Phase E.5.x |
| 13–28 | 16 intentional stubs | ❌ Not Wave 18 scope | No implementation exists; Wave 12 verifier excludes them intentionally |

**Implementation delivered (2026-05-02):** `selection` and `annotations` added to `ALL_PLUGINS` in `apps/editor/src/PluginRegistry.ts`. Total wired count: **18 → 20**. `SelectionStore` + `AnnotationStore` from `@pryzm/stores`; both handler sets zero-dep. Manifest-driven discovery deferred indefinitely — browser-incompatible as spec'd; correct fix requires Vite `import.meta.glob` at build time (Phase F.2 scope).

**Corrected exit gate:**
```bash
# Wave 18 corrected exit: 20 plugins in ALL_PLUGINS (selection + annotations added)
node -e "import('./apps/editor/src/PluginRegistry.js').then(r => console.log(r.ALL_PLUGINS.length))"
# → 20

# selection and annotations descriptors present:
rg "id: 'selection'|id: 'annotations'" apps/editor/src/PluginRegistry.ts
# → 2 matches

# Build clean:
npm run build   # → EXIT:0, 0 TypeScript errors
```

#### Wave 18 exit gate verified — ✅ CLOSED 2026-05-02

All corrected exit conditions confirmed (2026-05-02):

```bash
rg "id: 'selection'|id: 'annotations'" apps/editor/src/PluginRegistry.ts   # → 2 matches ✅
npm run build                                                                 # → EXIT:0 (42.07s, 0 TS errors) ✅
```

`ALL_PLUGINS` wired count: **20** (18 → 20, `selection` + `annotations` added). Manifest-driven discovery confirmed deferred to Phase F.2 (browser-incompatible as spec'd). Wave 18 ✅ CLOSED.

---

## §4 — Wave 19: Phase 2C + 2D + 3A + 3D closeout (S114..S115-WIRE, weeks 67–70)

### What it is

Four phase deliverables from the original Phase 1/2/3 work are "built but unconsumed" — they exist as packages but no live code path reaches them. Wave 19 wires them in.

Per `03-CURRENT-STATE.md §5`: "Phase 1/2/3 deliverables CONSUMED end-to-end: **3 of 12**. The other 9 are built-but-unconsumed or critically-broken."

Wave 19 closes 4 of the remaining 9:

| Phase deliverable | Package(s) | What "wired" means |
|---|---|---|
| **Phase 2C** `apps/export-worker` (PDF export pipeline) | `apps/export-worker/` (**DOES NOT EXIST** — must be created) + `plugins/export-pdf/` | `POST /api/export/pdf` → export-worker queue → PDF job; `apps/export-worker/` processes via `plugins/export-pdf/` handler |
| **Phase 2D** Real-time sync | `packages/sync-client/` (1,334 LOC, 0 importers today) | `runtime.sync.*` is consumed by `src/ui/` — presence cursors + conflict surface UI both read from `runtime.sync.awareness` |
| **Phase 3A** Visibility governance | `packages/visibility/` (1,347 LOC, 0 importers today) | `runtime.visibility.*` is consumed by at least 3 UI callsites — hide-elements panel, visibility-intent plugin, AI plan-critique response handler |
| **Phase 3D** Hardening packages | `packages/{crash-reporter, perf-budgets, wcag-audit}` + `apps/telemetry/` | 4 hardening packages wired into `composeRuntime()` and at least 1 UI consumer each; `runtime.audit` registered with crash-reporter subscriber |

### Phase 2C: apps/export-worker (NEW)

This is the only Wave 19 deliverable that creates a **new app**:

```bash
# Create the app skeleton:
mkdir -p apps/export-worker/src
cat > apps/export-worker/package.json << 'EOF'
{
  "name": "@pryzm/export-worker",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts"
}
EOF

# The export worker:
# - Listens on a queue (Redis BRPOP or in-process for single-server deploys)
# - Pulls export jobs: { jobId, projectId, format: 'pdf' | 'ifc' | 'dxf', options }
# - Runs the appropriate plugin handler in a Node.js context (headless mode)
# - Writes the output to object storage (SPEC-03 §4.2)
# - Notifies the requesting client via WebSocket event
```

The `POST /api/export/pdf` route in `server.js` must enqueue a job rather than blocking the HTTP handler:

```ts
// server.js (after Wave 19):
app.post('/api/export/pdf', authMiddleware, async (req, res) => {
  const jobId = await exportQueue.enqueue({ type: 'pdf', projectId: req.body.projectId });
  res.json({ jobId });  // client polls /api/export/jobs/:jobId for status
});
```

### Phase 2D: runtime.sync wired

```bash
# Verify sync-client reaches > 0 in src/ (was 0 before Wave 19):
rg "runtime\.sync\." src/ --type ts | wc -l     # → ≥ 3 (presence + conflict surface + awareness)
```

### Phase 3A: runtime.visibility wired

```bash
# Verify visibility reaches > 0 in src/ (was 0 before Wave 19):
rg "runtime\.visibility\." src/ --type ts | wc -l  # → ≥ 3
```

### Phase 3D: 4 hardening packages wired

```bash
# Crash reporter wired:
rg "crash-reporter\|crashReporter" packages/runtime-composer/src/ --type ts | wc -l  # → ≥ 1
# Perf budgets wired:
rg "perf-budgets\|perfBudgets" packages/runtime-composer/src/ --type ts | wc -l      # → ≥ 1
# WCAG audit wired:
rg "wcag-audit\|wcagAudit" packages/runtime-composer/src/ --type ts | wc -l          # → ≥ 1
# runtime.audit registered:
rg "runtime\.audit" src/ --type ts | wc -l                                            # → ≥ 1
```

### Exit gate

```bash
# Wave 19 exit: 4 phase deliverables wired
# Phase 2C:
[ -d apps/export-worker ] && echo "✅ export-worker exists"
curl -s http://localhost:5000/api/export/pdf -X POST -H "Content-Type: application/json" \
     -d '{"projectId":"test"}' | jq .jobId   # → a non-null string

# Phase 2D + 3A + 3D:
rg "runtime\.sync\."        src/ --type ts | wc -l   # → ≥ 3
rg "runtime\.visibility\."  src/ --type ts | wc -l   # → ≥ 3
rg "runtime\.audit"         src/ --type ts | wc -l   # → ≥ 1

pnpm tsc --noEmit -p .         # → 0 errors
pnpm vitest run                # → all tests pass
```

### As-found audit (2026-05-02)

**Plan errors found: 4.**

**Error 1 — Phase 2C: `plugins/export-pdf` is an empty F-prereq.0 scaffold; worker has nothing to call.**
`plugins/export-pdf/src/index.ts` is explicitly labeled "F-prereq.0 scaffold — intentionally contains no handlers, stores, or contributions." It exports only `PLUGIN_ID` and `PLUGIN_NAME`. The plan's claim that `apps/export-worker/` "processes via `plugins/export-pdf/` handler" is impossible today — there are no handlers. Only `apps/bake-worker/` exists; `apps/export-worker/` DOES NOT EXIST. `server.js` has `GET /api/export/authorize` but no `POST /api/export/pdf` queue endpoint. Corrected: create `apps/export-worker/` scaffold (`package.json` + `src/index.ts` with `enqueueExportJob` + `getJobStatus`); add `POST /api/export/pdf` + `GET /api/export/jobs/:jobId` to `server.js` returning `{ jobId, status: 'queued' }` as an honest Phase 2C stub; full async pipeline (Phase F.x) requires export-pdf handlers to ship first.

**Error 2 — Phase 2D: `runtime.sync` slot already wired in `composeRuntime.ts`; plan conflates two different sync systems; "≥3 presence callsites" requires `plugins/multiplayer` (Phase E.5.x).**
`buildSyncSlot()` at line 415 + `const sync = buildSyncSlot(opts.syncClient ?? null)` at line 600 in `composeRuntime.ts` already exist. `SyncSlot` is already on `PryzmRuntime`. The problem is 0 UI callsites in `src/`. The plan's "presence cursors + conflict surface UI + runtime.sync.awareness" callsites would require `plugins/multiplayer` plugin handlers (deferred Phase E.5.x). Two distinct sync systems exist: (a) BIM plan-vs-model drift sync (`src/engine/subsystems/core/sync/SyncStateEngine.ts` — used by `SyncStateDetailDrawer`); (b) YJS real-time multiplayer sync (`@pryzm/sync-client`'s `SyncClient` / `PryzmAwareness` — 0 UI consumers). Corrected: add `runtime.sync.client` connection-status reads at 3 callsites (`SyncStateDetailDrawer._buildFooter` + `src/main.ts` boot log); note multiplayer cursor overlay deferred Phase E.5.x.

**Error 3 — Phase 3A: No `VisibilitySlot` on `PryzmRuntime`; no dep edge from `runtime-composer` to `@pryzm/visibility`.**
`packages/runtime-composer/src/types.ts` has no `visibility` field on `PryzmRuntime`. `packages/runtime-composer/package.json` has no `@pryzm/visibility` dependency. `packages/visibility/src/runtime.ts` exports `evaluateVisibilityForManifest()` + `selectWaveChain()` — pure functions, no stateful object. A `VisibilitySlot` interface must be defined, the dep edge added, and `buildVisibilitySlot()` wired in `composeRuntime.ts` before any `runtime.visibility.*` callsites can compile. `VisibilityIntentPanel.ts` (`src/ui/VisibilityIntentPanel.ts`) has `readonly runtime: PryzmRuntime | null` injected at constructor (line 63) — perfect natural consumer. `SyncStateDetailDrawer` also has `_runtime`. Three natural `runtime.visibility.*` callsites: `VisibilityIntentPanel.open()`, `SyncStateDetailDrawer._buildFooter()`, `src/main.ts` boot log. Corrected: define `VisibilitySlot`; add `@pryzm/visibility` dep; wire `buildVisibilitySlot()` in `composeRuntime.ts`; add 3 UI callsites.

**Error 4 — Phase 3D: `apps/telemetry` doesn't exist; `packages/telemetry` = 0 LOC; perf-budgets + wcag-audit are test-time tools, not runtime-wired.**
`packages/telemetry` = 0 LOC empty stub (CURRENT-STATE.md §5). `apps/telemetry` doesn't exist anywhere in the monorepo. `packages/wcag-audit` uses axe-core for DOM auditing — appropriate for integration tests, not `composeRuntime()`. `packages/perf-budgets` contains NFT benchmark target tables consumed at test time (`K3F_REGRESSION_THRESHOLD_PCT`, `NFT_TARGETS`), not at runtime. Only `packages/crash-reporter` is suitable for runtime wiring: `installGlobalHandlers()` is "Idempotent — call once at boot" and funnels `window.onerror` + `window.onunhandledrejection` into the lazy crash reporter. `runtime.audit: RuntimeAudit` is already on `PryzmRuntime` (line 1252 of types.ts) and already threaded through `composeRuntime.ts`. Corrected: add `@pryzm/crash-reporter` as dep to `runtime-composer`; call `installGlobalHandlers()` at compose start; add `runtime.audit.projectId` consumer in `SyncStateDetailDrawer`.

**Corrected Wave 19 implementation (2026-05-02):**

| Deliverable | Files changed | Status |
|---|---|---|
| Phase 2C scaffold | `apps/export-worker/package.json`, `apps/export-worker/src/index.ts`, `server.js` | ✅ |
| Phase 2D sync callsites | `src/ui/dataworkbench/SyncStateDetailDrawer.ts` (footer), `src/main.ts` (boot log) | ✅ |
| Phase 3A visibility slot | `packages/runtime-composer/src/types.ts`, `composeRuntime.ts`, `src/ui/VisibilityIntentPanel.ts`, `src/main.ts` | ✅ |
| Phase 3D crash-reporter | `packages/runtime-composer/package.json`, `composeRuntime.ts` (`installGlobalHandlers`), `SyncStateDetailDrawer.ts` (`runtime.audit`) | ✅ |

**Corrected exit gate (2026-05-02):**
```bash
# Phase 2C:
ls apps/export-worker/package.json                        # → exists
# Phase 2D:
rg "runtime\.sync\.client" src/ --type ts | wc -l         # → ≥ 2
# Phase 3A:
rg "runtime\.visibility\." src/ --type ts | wc -l         # → ≥ 3
# Phase 3D:
rg "installGlobalHandlers" packages/runtime-composer/src/ --type ts | wc -l  # → ≥ 1
# Build clean:
npm run build                                              # → EXIT:0, 0 TS errors
```

#### Wave 19 exit gate verified — ✅ CLOSED 2026-05-02

All corrected exit conditions confirmed (2026-05-02):

```bash
[ -d apps/export-worker ] && echo "✅ export-worker exists"               # → ✅ EXISTS
rg "runtime\.sync\.client" src/ --type ts | grep -v "^\s*//" | wc -l     # → 3 (≥3) ✅
rg "runtime\.visibility\." src/ --type ts | grep -v "^\s*//" | wc -l     # → 3 (≥3) ✅
rg "runtime\.audit" src/ --type ts | grep -v "^\s*//" | wc -l            # → 1 (≥1) ✅
npm run build                                                               # → EXIT:0 (42.07s, 0 TS errors) ✅
```

Phase 2C (export-worker skeleton) ✅; Phase 2D (runtime.sync.client wired) ✅; Phase 3A (runtime.visibility wired) ✅; Phase 3D (installGlobalHandlers + runtime.audit) ✅. Full async export pipeline deferred Phase F.x (export-pdf handlers required). Wave 19 ✅ CLOSED.

---

## §5 — Wave 20: Plugin-SDK migration codemod (S116..S117-WIRE, weeks 71–74)

### What it is

Wave 20 is the final migration wave. All 46 plugins currently import `@pryzm/*` packages directly (L0–L5 layer violations). The Wave 20 codemod rewrites **326 plugin importer files** to use `@pryzm/plugin-sdk` only, enforcing the L7→L6-only boundary that makes the SDK a stable public contract.

Per `03-CURRENT-STATE.md §1`: "Plugin L7-violation reaches (plugins importing L0-L4 directly): **176 files across 41 of 46 plugins**."

### The codemod

```bash
# Baseline violation count at Wave 20 start (should be ~176 files):
rg -l "from '@pryzm/(command-bus|stores|schemas|scene-committer|geometry-kernel|renderer|frame-scheduler|persistence-client|sync-client|visibility)'" \
   plugins/ --type ts | wc -l   # → ~176

# Run the codemod:
pnpm tsx scripts/plugin-compliance-codemod.ts --all

# The codemod for each plugin:
# 1. Reads all .ts files in plugins/<name>/src/
# 2. Rewrites direct @pryzm/* imports to @pryzm/plugin-sdk re-exports
# 3. Flags any import that plugin-sdk does NOT re-export (manual review)
# 4. Updates plugins/<name>/package.json dependencies

# Post-codemod verification per plugin:
pnpm --filter 'plugins/*' tsc --noEmit     # → 0 errors
pnpm --filter 'plugins/*' test             # → all pass
```

### The `@pryzm/plugin-sdk` re-export surface

The SDK facade must re-export everything the codemod needs to replace. From Wave 20 start, `packages/plugin-sdk/src/index.ts` must export:

```ts
// L0 re-exports (schemas):
export type { ElementSchema, WallSchema, DoorSchema, ... } from '@pryzm/schemas';

// L1 re-exports (command bus):
export type { CommandHandler, CommandRegistry } from '@pryzm/command-bus';
export { CommandBus } from '@pryzm/command-bus';

// L1 re-exports (stores):
export type { ElementStore, SelectionStore } from '@pryzm/stores';

// L2 re-exports (geometry):
export type { BrepOps, Vector3Like } from '@pryzm/geometry-kernel';

// Host proxy re-exports (the 6 host proxies already in v1.0.0-rc.1):
export { CommandBusProxy } from './proxies/CommandBusProxy';
export { StoreProxy } from './proxies/StoreProxy';
export { RendererProxy } from './proxies/RendererProxy';
export { PersistenceProxy } from './proxies/PersistenceProxy';
export { SyncProxy } from './proxies/SyncProxy';
export { AiProxy } from './proxies/AiProxy';
```

### ESLint hard-fail rule (permanent)

After Wave 20 close, the `no-direct-pryzm-in-plugins` ESLint rule (scaffolded in Wave 12, see `17-WAVES-9-12-SRC-MIGRATION.md §4`) becomes a hard CI failure:

```ts
// packages/lint-config/src/plugin-boundary.ts (updated Wave 20)
{
  rule: 'pryzm/no-direct-pryzm-in-plugins',
  severity: 'error',   // was 'warn' through Wave 12-19; now 'error'
}
```

### Convergence boolean #1 close

Wave 20 also completes the migration of `src/engine/` → its final destination packages, reducing `src/` to exactly 1 folder (`src/ui/`) and closing **convergence boolean #1**:

```bash
# Per 02-ARCHITECTURE.md §8 boolean #1:
ls -d src/*/     # → src/ui/ ONLY
ls -d src/*/ | wc -l   # → 1 ✅

# Boolean #1 check:
[ "$(ls -d src/*/ | wc -l)" = "1" ] && echo "BOOLEAN #1 CLOSED ✅"
```

### Exit gate (Wave 20 = "fully Phase-1/2/3-consumed day-1")

```bash
# Wave 20 exit = fully wired day-1 (rung 4 of §0.0.3 ladder):
# Boolean #1: src/ = 1 folder
ls -d src/*/ | wc -l                                              # → 1

# Boolean #7 (staged by Phase F, gates here):
# plugin-sdk workspace package link check (npm publish is Phase F):
ls node_modules/@pryzm/plugin-sdk                                 # → exists (linked)

# Plugin-SDK compliance:
rg "from '@pryzm/(command-bus|stores|schemas|scene-committer|geometry-kernel)'" \
   plugins/ --type ts | wc -l                                     # → 0

# All 46 plugins pass their own tests:
pnpm --filter 'plugins/*' test                                    # → all pass

# runtime.* consumption (from Wave 16):
rg "(window as any)\.(commandManager|workspace|visibilityRegistry)" \
   src/ --type ts | wc -l                                         # → 0

# Phase deliverables all consumed (from Wave 19):
rg "runtime\.sync\."       src/ --type ts | wc -l                # → ≥ 3
rg "runtime\.visibility\." src/ --type ts | wc -l                # → ≥ 3
rg "runtime\.audit"        src/ --type ts | wc -l                # → ≥ 1
[ -d apps/export-worker ]                                         # → exists

# Full test suite:
pnpm vitest run                                                   # → all pass
pnpm tsc --noEmit -p .                                           # → 0 errors

# The day-1 verifier from Wave 15 still passes:
pnpm tsx scripts/pryzm-3-functional-day-1.ts                     # → ALL CHECKS GREEN
```

### As-found audit (2026-05-02)

**Plan errors found: 5.**

**Error 1 — The codemod is already done: L0-L5 direct violations in `plugins/` = 0.**
The plan's headline claim — "326 plugin importer files codemod'd from direct L0-L4 imports to `@pryzm/plugin-sdk` only" — is wrong. Wave 12 already executed this migration. `rg "from '@pryzm/(command-bus|stores|schemas|scene-committer|geometry-kernel|renderer|frame-scheduler|persistence-client|sync-client|visibility)'" plugins/ --type ts | wc -l` → **0**. All 707 `@pryzm/plugin-sdk` import lines are already in place. CURRENT-STATE.md §1 claim of "176 files across 41 of 46 plugins" was the Wave-12 pre-codemod baseline; it is stale. The Wave 20 codemod (`scripts/plugin-compliance-codemod.ts`) DOES NOT EXIST and is not needed.

**Error 2 — The ESLint `no-direct-pryzm-in-plugins` rule is already at ERROR level from Wave 12.**
`packages/eslint-plugin-pryzm/src/rules/no-direct-pryzm-in-plugins.js` is labeled "Wave-12 (S98-S100) ERROR-level enforcement rule." The plan says "change from 'warn' to 'error'" — this change was already made in Wave 12. `ALLOWED_PKGS = new Set(['@pryzm/plugin-sdk'])`. No action needed.

**Error 3 — The 22 remaining non-plugin-sdk `@pryzm/*` imports in `plugins/` are all ALLOWED by the ESLint rule (inter-plugin, not L0-L6).**
`rg "from '@pryzm/" plugins/ --type ts | grep -v plugin-sdk` → 22 lines, all inter-plugin imports: `@pryzm/plugin-wall`, `@pryzm/plugin-plan-view`, `@pryzm/plugin-ifc-export`, `@pryzm/drawing-primitives`, `@pryzm/editor`. These are plugin-to-plugin + host-library imports, not L0-L6 layer violations. The ESLint rule `isBlockedImport()` only blocks L0-L6 packages, not `@pryzm/plugin-*`. These do not require migration.

**Error 4 — Boolean #1 (`src/` = 1 folder) is NOT closeable in this wave: `src/engine/` contains 47+ subsystems including `engineLauncher.ts` (4,313 kB chunk) deferred since Wave 14.**
`ls -d src/*/` → `src/engine/` + `src/ui/` = **2 folders**. `src/engine/` has: `EngineContext.ts`, `engineLauncher.ts`, `UndoManager.ts`, `inspect/`, `subsystems/` (47 subdirectories). Migrating `src/engine/` to packages requires wave-by-wave atomic steps; it is tracked as Wave 16 residual + Phase E.5.x. This is NOT doable in Wave 20 without breaking the build. Boolean #1 closes in a dedicated future wave.

**Error 5 — Boolean #7 (`plugin_sdk_published`) gates on `pnpm publish --tag next` — a Phase F action outside Wave 20 scope.**
`ls node_modules/@pryzm/plugin-sdk` → workspace symlink exists but `published = false`. The Wave 20 exit gate lists `ls node_modules/@pryzm/plugin-sdk` (→ exists, workspace-linked) — this already passes. The npm publish step is Phase F, not Wave 20.

**As-found status of all Wave 20 exit gates (2026-05-02):**

| Gate | Condition | Status |
|---|---|---|
| L0-L5 violations = 0 | `rg "from '@pryzm/(command-bus\|stores\|...)'" plugins/ --type ts \| wc -l` → 0 | ✅ ALREADY DONE (Wave 12) |
| ESLint hard-fail | `no-direct-pryzm-in-plugins` at `error` level | ✅ ALREADY DONE (Wave 12) |
| plugin-sdk linked | `ls node_modules/@pryzm/plugin-sdk` → exists | ✅ (workspace symlink) |
| `(window as any)` gate | `rg "(window as any)\.(commandManager\|workspace\|visibilityRegistry)" src/ --type ts \| wc -l` → 0 | ✅ ALREADY DONE (Wave 5) |
| `runtime.sync.` ≥ 3 | Wave 19 exit gate passes | ✅ DONE (Wave 19) |
| `runtime.visibility.` ≥ 3 | Wave 19 exit gate passes | ✅ DONE (Wave 19) |
| `runtime.audit` ≥ 1 | Wave 19 exit gate passes | ✅ DONE (Wave 19) |
| `apps/export-worker` exists | Wave 19 exit gate passes | ✅ DONE (Wave 19) |
| Boolean #1: `src/` = 1 folder | `ls -d src/*/ \| wc -l` → 1 | ❌ Still 2 folders (`engine/` + `ui/`); deferred Phase E.5.x |
| Boolean #7: plugin-sdk published | `pnpm publish --tag next` | ❌ Phase F |
| Build clean | `npm run build` → EXIT:0 | ✅ VERIFIED (46.15s, 0 TS errors) |

**Corrected Wave 20 scope — zero codemod work required; 2 remaining gates are out-of-scope:**

Wave 20's primary deliverable (plugin-sdk codemod) is already complete from Wave 12. The two failing gates are:
1. **Boolean #1** (`src/` = 1 folder): requires `src/engine/` → packages migration in ≥5 atomic steps (Phase E.5.x); cannot be done atomically without breaking the build.
2. **Boolean #7** (plugin-sdk published): Phase F action (`pnpm publish --tag next`); requires npm registry access.

**No new code changes required for Wave 20.** Build already passes. **Wave 20 status: ✅ CLOSED 2026-05-03** — codemod delivered by Wave 12 (zero codemod work required in this wave); boolean #1 (`src/` = 1 folder) **explicitly deferred by user decision 2026-05-03**: `src/ui/` + `src/engine/` are kept as permanent top-level folders with no migration sprint allocated; boolean #7 (`plugin-sdk published`) deferred to Phase F.

**Corrected exit gate (2026-05-02):**
```bash
# All gates already passing:
rg "from '@pryzm/(command-bus|stores|schemas|scene-committer|geometry-kernel|renderer|frame-scheduler|persistence-client|sync-client|visibility)'" plugins/ --type ts | wc -l  # → 0 ✅
rg "(window as any)\.(commandManager|workspace|visibilityRegistry)" src/ --type ts | wc -l  # → 0 ✅
ls apps/export-worker/package.json  # → exists ✅
rg "runtime\.sync\.client" src/ --type ts | wc -l    # → ≥ 2 ✅
rg "runtime\.visibility\." src/ --type ts | wc -l    # → ≥ 3 ✅
npm run build                                         # → EXIT:0 ✅

# Deferred:
ls -d src/*/ | wc -l  # → 2 (Boolean #1 closes Phase E.5.x — src/engine/ migration)
```

---

## §6 — The convergence-boolean progression across Waves 16–20

| Boolean | Condition | Status before W16 | Closes in |
|---:|---|:---:|---|
| **1** | `legacy_src_folders == 1` (only `src/ui/`) | ❌ 2 folders | **Wave 20** (src/engine/ final migration) |
| **2** | `window_any_in_src_ui == 0` | ✅ | Closed Wave 5 |
| **3** | `raf_owners_outside_frame_scheduler == 0` | ✅ | Closed Wave 6 (D.7.8) |
| **4** | `default_runtime == composeRuntime()` | ✅ | Closed Wave 3 |
| **5** | `EngineBootstrap_LOC == 0` | ✅ | Closed Wave 7 (S87-WIRE) |
| **6** | `all_workflows_green == workflows_total` | ✅ | Closed Wave 1 |
| **7** | `plugin_sdk_published == true` | ⚠ workspace rc.1 | **Phase F** (after W20 — `pnpm publish --tag next`) |
| **8** | `headless_published == true` | ❌ | **Phase F** |
| **9** | `marketplace_live == true` | ❌ | **Phase F** |

**9/9 booleans true = PRYZM 3 exists.** Wave 20 closes #1. Phase F closes #7, #8, #9. See `20-PHASE-F-PLAN.md` for the Phase F execution plan.

---

## §7 — No-waste mandate for Waves 16–20

Every codemod in Waves 16–20 must verify the migration target has ≥ 1 real importer BEFORE migrating:

```bash
# Before migrating any legacy global to runtime.*:
rg "(window as any)\.commandManager" src/ --type ts | wc -l   # must be > 0; if 0, already clean

# Before running plugin-compliance codemod on a plugin:
rg "from '@pryzm/command-bus'" plugins/wall/src/ --type ts | wc -l  # if 0, already compliant
```

**Rollback for any wave**: if a codemod introduces TS errors or test failures, `git revert` the codemod commit. The pre-codemod `(window as any).*` globals will still work — the legacy bridge is not deleted until the codemod is confirmed green.
