# Phase E — Per-family element migration · Audit + Plan (2026-04-29, REVISION 3)

> **Spec**: [`PRYZM2-WIREUP-PLAN-S72/15-subphases-E-families.md` §16.5](../PRYZM2-WIREUP-PLAN-S72/15-subphases-E-families.md) — 18 sub-phases (E.1–E.17 + E.6.0 scaffold).
> **Tracker claim** ([PROCESS-TRACKER.md §3 line 194+](../../03_STATUS/01-PROCESS-TRACKER.md)): *"Phase E gesture routing landed for 15/18 families. Bus dispatch ALL queued. Legacy deletion ALL queued."*
> **Verdict (REVISION 3)**: ⚠️ The tracker's framing is closer to ground truth than either of the prior revisions reported, but it conceals **two distinct, separately-actionable blockers**:
> 1. ❌ A **one-line wiring gap** (`Layout.ts:1551` does not thread `runtime` into `ToolsPanelController`), which makes the 20 already-registered routing activators dead in production today.
> 2. ❌ A **registry gap** (`apps/editor/src/PluginRegistry.ts` enumerates only **12 of the 17 existing plugin scaffolds**), which means 5 plugins that already ship handler sets and bus dispatch (`furniture`, `plumbing`, `rooms`, `structural`, `dimensions`/`lighting`/`annotations` companions) are **never wired into the runtime command bus** even though they look complete on disk.
>
> ❌ Legacy deletion lane really is flat 0.
> 🟢 Bus dispatch in plugins is **16/18 families**, not 4/18 as REVISION 2 stated — the prior revisions used the wrong regex and missed the correct production pattern (injected `CommandBus` via PluginRegistry, not `runtime.bus.executeCommand` directly).

---

## REVISION 3 — Corrections to REVISION 2

REVISION 2 corrected three errors in the original audit's addendum. Re-running every `rg` sweep that backed REVISION 2's claims surfaces five further errors plus one new finding REVISION 2 missed entirely. All numbers below are reproducible by running the verification script in [§ Hard counts (re-verified 2026-04-29 R3)](#hard-counts-re-verified-2026-04-29-r3) at HEAD `main`.

### Error 1 — Plugin scaffold coverage understated

REVISION 2's per-family table reported plugin scaffolds for 15/18 families (missing `floor`, `opening`, `room-bounding`). **Actual scaffold coverage is 17/18 once cross-family hosting is reconciled with the spec:**

```
$ ls plugins/ | wc -l
38
```

The 38 directories include 17 of the 18 element-family plugins the spec calls out (the only true gap is `plugins/floor` — the E.6.0 scaffold). The other two REVISION 2 flagged are not real gaps:

- `plugins/opening` (E.14) — the spec explicitly defines E.14 as **cross-family (hosted in wall + slab)**, so the opening verbs live under `plugins/wall` and `plugins/slab` handler sets. A standalone `plugins/opening/` is not required by §16.5.
- `plugins/room-bounding` (E.17) — the spec's E.17 sub-phase migrates room-bounding-line gestures, which are co-located in `plugins/rooms/` (the single rooms plugin handles both `room` and `room-bounding` activators per `Layout.ts:492–503`).

Verified per-family scaffold matrix:

```
✓ plugins/wall          ✓ plugins/handrail
✓ plugins/slab          ✓ plugins/column
✓ plugins/door          ✓ plugins/beam
✓ plugins/window        ✓ plugins/grid
✓ plugins/curtain-wall  ✗ plugins/opening    (cross-family per spec — wall+slab host the verbs)
✗ plugins/floor         ✓ plugins/furniture
✓ plugins/ceiling       ✓ plugins/plumbing
✓ plugins/roof          ✓ plugins/rooms      (also hosts room-bounding gestures)
✓ plugins/stair         ✓ plugins/structural
```

**Net: 17/18 scaffolded once spec wording is honoured. Only E.6.0 (`plugins/floor/`) is a true scaffold gap.**

### Error 2 — Bus dispatch coverage drastically understated

REVISION 2 reported `runtime.bus.executeCommand` reaches as **4/18 production families** (wall, window, structural, toy-cube). The regex was wrong: production plugins do **not** dial `runtime.bus.executeCommand` — they consume an **injected `CommandBus`** sourced from `@pryzm/command-bus` and reach it via `this.deps.commandBus.executeCommand(...)` or `this.bus.executeCommand(...)`. This is the strict-injection contract documented in `plugins/wall/src/tool.ts:7,47,97,139–141` and mirrored across every L4 plugin.

Re-counted with the correct pattern:

```
$ for p in wall slab door window curtain-wall ceiling roof stair handrail \
           column beam grid furniture plumbing rooms structural; do
    c=$(rg -c "(commandBus|bus)\.executeCommand" plugins/$p/src/tool.ts 2>/dev/null || echo 0)
    echo "$p/src/tool.ts: $c"
  done
```

| Family | `tool.ts` bus reaches | Plugin handler files reaching the bus elsewhere |
|---|---:|---|
| wall | 3 | + `__tests__/*` (≥75 reaches) |
| slab | 1 | apps/headless/src/commands/addSlab.ts: 1 |
| door | 2 | + `plugins/door/src/handlers/CreateDoor.ts`: 2 |
| window | 2 | + `__tests__/{tool,handlers}.test.ts`: 22 |
| curtain-wall | 1 | + `__tests__/handlers/SwapPanel.test.ts`: 9 |
| ceiling | 1 | + `__tests__/handlers.test.ts`: 8 |
| roof | 1 | + `__tests__/handlers.test.ts`: 27 |
| stair | 1 | — |
| handrail | 1 | + `__tests__/handlers.test.ts`: 7 |
| column | 1 | — |
| beam | 1 | + `__tests__/handlers.test.ts`: 10 |
| grid | 1 | + `__tests__/handlers.test.ts`: 9 |
| furniture | 1 | + `__tests__/handlers.test.ts`: 34 |
| plumbing | 1 | + `__tests__/handlers.test.ts`: 9 |
| rooms | 1 | + `__tests__/handlers.test.ts`: 22 |
| structural | 1 | + `__tests__/handlers.test.ts`: 17 |
| **Total production B-plugin coverage** | **16/18 families** | floor + opening are the only gaps |

**Net: bus dispatch in plugins is 16/18 production families, not 4/18.** What hasn't moved is the *legacy* `commandManager.execute` lane (198 reaches across 122 files in `src/`).

### Error 3 — `Layout.ts:481–540` register-call span overstated

REVISION 2 cited the register block as `Layout.ts:481–540`. Actual span is **481–509** (20 calls in 29 contiguous lines), with the post-block `console.log('[Layout] Phase E (S78-WIRE) — 21 tool activators registered with runtime.tools')` at line 510 carrying a stale `21` count (must be amended to `20` in the same PR that completes E-finish.0.A). Lines 510–540 are unrelated picker/HUD setup.

The single-fact correction matters because reviewers grep for `tools.register` in the cited range and need an accurate window. Authoritative table of what is registered:

| Family / mode | Layout.ts line | Activator | TODO bridge marker |
|---|---:|---|---|
| `wall` | 481 | `service.activateWallTool((m as WallDrawingMode) ?? POLYLINE_ORTHO)` | none |
| `curtain-wall` | 482 | `tm.activateCurtainWall?.(m ?? 'SINGLE')` | none |
| `door` | 483 | `tm.activateDoor?.(m ?? 'single')` | none |
| `window` | 484 | `tm.activateWindow?.(m ?? 'single')` | none |
| `stair` | 485 | `service.activateStairPathTool((m as 'I'\|'L'\|'U') ?? 'I')` | none |
| `handrail` | 486 | `service.activateHandrailTool(m)` | none |
| `ramp` | 487 | `(window as any).rampTool?.activate?.()` | TODO(E.6) — `plugins/ramp` not in spec; legacy bridge stays until ramp gets its own sub-phase |
| `ceiling` | 488 | `service.activateCeilingTool()` | none |
| `ceiling:auto` | 489 | `(window as any).ceilingTool?.setMode('AUTO_FROM_ROOM')` + service call | TODO(E.7) — bridge to legacy ceilingTool until handler covers AUTO_FROM_ROOM mode |
| `floor` | 490 | `service.activateFloorTool()` | (E.6 — works only via service since plugins/floor missing) |
| `floor:auto` | 491 | `(window as any).floorTool?.setMode('AUTO_FROM_ROOM')` + service call | TODO(E.6.0) — hard bridge until plugins/floor lands |
| `room` | 492 | `(window as any).roomTool?.activate?.() ?? tm.activateRoom?.()` | TODO(E.16) — actually points at E.17 work; comment is wrong, fix in same PR |
| `room:level` | 493 | multi-line: `(window as any).roomTool.detectRoomsForLevel(...)` or `t.activate()` | TODO(E.16) — same comment-pointer bug |
| `room-bounding` | 499 | multi-line: `(window as any).roomBoundingLineTool.activate?.()` | TODO(E.16) — same comment-pointer bug |
| `column` | 504 | `tm.activateColumn?.(m ? JSON.parse(m) : {})` | none |
| `beam` | 505 | `tm.activateBeam?.(m ? JSON.parse(m) : {})` | none |
| `slab` | 506 | `service.activateSlabTool((m as any) ?? '2point')` | none |
| `roof` | 507 | `service.activateRoofTool((m as any) ?? '2point')` | none |
| `opening` | 508 | `tm.activateOpeningTool?.(m ?? '2point')` | none (legacy `tm` route; no plugin per spec) |
| `plumbing` | 509 | `service.activatePlumbingTool((m as any) ?? 'toilet')` | none |

**Missing register calls (must be added in E-finish.0.C–E):** `grid`, `furniture-place`. Verified zero hits for each at HEAD:

```
$ rg -n "tools\.register\(.*grid"     src/ui/Layout.ts   # 0 hits
$ rg -n "tools\.register\(.*furniture" src/ui/Layout.ts  # 0 hits
```

### Error 4 — `src/commands/` entry inventory misclassified

REVISION 2 reported `src/commands/` as **31 entries** (18 family dirs + 13 framework files/dirs). Actual count is **39 entries**:

```
$ ls src/commands/ | wc -l
39
$ ls -d src/commands/*/ | wc -l
31    # of which 19 are family-named, 12 are framework-named
```

Authoritative breakdown:

- **19 family directories** (one per element family that legacy code recognises): `annotations`, `beam`, `ceilings`, `columns`, `curtainwall`, `doors`, `floors`, `furniture`, `grids`, `handrails`, `lighting`, `plumbing`, `roofs`, `roomBoundingLines`, `rooms`, `slabs`, `stair`, `walls`, `windows`. (REVISION 2 said 18; it omitted `lighting`.)
- **12 framework directories**: `catalog`, `generic`, `geospatial`, `hierarchy`, `levels`, `operations`, `plans`, `project`, `requirements`, `templates`, `vg`, `views`.
- **8 framework files**: `CommandManager.ts`, `CommandProposalFactory.ts`, `CommandProposalStore.ts`, `PatchSnapshot.ts`, `TagElementCommand.ts`, `UpdateElementMarkCommand.ts`, `index.ts`, `types.ts`.

E-finish.2 must therefore delete **19 family directories**, not 18. `lighting` is a hidden 19th family the prior audits classified as framework.

### Error 5 — `src/elements/` listing typo

REVISION 2 listed 23 element directories including `previews`. The actual directory name is **`preview`** (singular), and there are **23 directories + 1 `index.ts` file** = 24 entries:

```
$ ls -d src/elements/*/ | wc -l
23
$ ls src/elements/preview/ | head    # not "previews"
```

Inventory: `annotations`, `beams`, `ceilings`, `columns`, `curtainwalls`, `dimensions`, `doors`, `floors`, `furniture`, `grids`, `handrails`, `lighting`, `openings`, `plumbing`, `preview`, `roofs`, `roomBoundingLines`, `rooms`, `slabs`, `stairs`, `structural`, `walls`, `windows` (23 dirs).

### NEW finding — PluginRegistry coverage gap (REVISION 2 missed this entirely)

`apps/editor/src/PluginRegistry.ts:23–46` enumerates exactly **12 element-family plugins + 1 view plugin**:

```
imports from @pryzm/plugin-{wall,slab,door,window,roof,curtain-wall,
  grid,column,beam,stair,handrail,ceiling,view}
```

But `plugins/` ships **5 additional production plugin scaffolds with handler sets and bus dispatch already implemented**:

| Plugin | tool.ts bus reaches | Handlers | In PluginRegistry? |
|---|---:|---|---|
| `plugins/furniture` | 1 | ≥34 test reaches | ❌ NOT REGISTERED |
| `plugins/plumbing` | 1 | ≥9 test reaches | ❌ NOT REGISTERED |
| `plugins/rooms` | 1 | ≥22 test reaches | ❌ NOT REGISTERED |
| `plugins/structural` | 1 | ≥17 test reaches | ❌ NOT REGISTERED |
| `plugins/dimensions` | (no tool.ts) | ≥25 test reaches | ❌ NOT REGISTERED |

This is the **second blocker** that gates Phase E completion and that REVISION 2 missed. The Layout.ts:1551 threading PR alone will *not* make the furniture / plumbing / rooms / structural plugins live in production: their handler sets are never bound to `runtime.bus`, so even with routing fixed, `runtime.bus.executeCommand('furniture.create', …)` will throw `NoHandlerForCommand` until PluginRegistry imports and contributes them.

---

## What the prior audits got *right*

The original addendum's analytical conclusion — *"production routing through `runtime.tools` is dead code today"* — is still correct. REVISION 2's identification of the one-line `Layout.ts:1551` gap is also correct. What changes in REVISION 3 is the **shape** of the plan that follows from those facts:

### Blocker 1: routing is dead at runtime (REVISION 2 was right about this)

`src/ui/tools-panel/ToolsPanelController.ts:44`:

```ts
constructor(
    private readonly _props: ToolsPanelProps,
    runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null
) {
    this.runtime = runtime;
    this._rail = new ToolsRailController();
    const createPanel = new CreateRailPanel(this._props, this._rail);
    // …
}
```

`Layout.ts:1551` (verified verbatim at HEAD):

```ts
const toolsPanelController = new ToolsPanelController({
    bimManager:       props.bimManager,
    toolManager:      props.toolManager,
    selectionManager: props.selectionManager,
    wallTool:         props.wallTool,
    slabTool:         props.slabTool,
    service,
    projectContext:   props.projectContext,
    toggleShadows,
    toggleBimVisibility,
    applyVisualStyle: props.applyVisualStyle,
    getCommandManager: () => props.toolManager?.commandManager ?? null,
    gisToggle:            (active) => toggleGIS(active),
    gisFlyTo:             () => flyToCremornePoint(),
    gisPlaceBim:          () => placeBimOnEarth(),
    gisGizmoMode:         (mode) => { if (cesiumViewport?.gizmo) cesiumViewport.gizmo.setMode(mode); },
    gisResetGeoreference: () => { const m = props.toolManager?.commandManager; if (m) m.undo(); },
});
```

`createMainLayout` already accepts `runtime` as its second positional arg (`Layout.ts:117 — export function createMainLayout(props: UIProps, runtime: PryzmRuntime | null = null)`), so threading is genuinely a one-line change. `_activateTool` returns `false` today, the legacy fallback branch runs, and Wall/Door/Window/Stair/Slab buttons all work normally — but never through `runtime.tools`.

### Blocker 2: PluginRegistry coverage gap (NEW — REVISION 2 missed this)

Even if Blocker 1 is resolved tomorrow, calling `runtime.bus.executeCommand('furniture.create', …)` will throw because `apps/editor/src/PluginRegistry.ts` does not import or contribute the furniture handler set. This is independent of the routing wiring and must be closed before any of E.15 (furniture), E.16 (structural per spec), or E.17 (rooms / room-bounding) bus-dispatch work can graduate from "works in tests" to "works in production".

---

## Per-family verification (re-graded, REVISION 3)

The spec splits each family into 3 lanes:
- **Routing**: hotkey + right-rail click → `runtime.tools.activate(family, mode?)`.
- **Bus dispatch**: tool action → handler bound on `runtime.bus` via `PluginRegistry` → handler executes the command.
- **Legacy deletion**: `src/elements/<family>/` + `src/commands/<family>/` directories removed.

Routing lane sub-status legend:
- 🟢 **R-act**: activator registered in `Layout.ts` AND runtime threaded into ToolsPanelController.
- 🟡 **R-thread**: activator registered, runtime not yet threaded (blocked on E-finish.0.A).
- 🔴 **R-gone**: no register call exists in `Layout.ts`.

Bus dispatch lane sub-status legend:
- 🟢 **B-live**: plugin is in `PluginRegistry.ts` AND its `tool.ts` dispatches via injected `CommandBus`.
- 🟡 **B-orphan**: plugin scaffolded with bus dispatch in `tool.ts` but NOT registered in `PluginRegistry.ts` (handler never bound).
- 🔴 **B-legacy**: still served by `src/elements/<family>/` calling `commandManager.execute`.

Legacy deletion lane: 🔴 = both directories present; 🟡 = one of two deleted; 🟢 = both deleted.

| Sub-phase | Family | Plugin scaffold | In PluginRegistry | Routing | Bus dispatch | Legacy deletion |
|---|---|---|---|---|---|---|
| E.1 | Wall | ✅ `plugins/wall/` | ✅ | 🟡 R-thread (L481) | 🟢 B-live (3 reaches) + 🔴 B-legacy (`src/elements/walls/WallTool.ts:1508,1578` — 3 reaches) | 🔴 walls + walls |
| E.2 | Slab | ✅ `plugins/slab/` | ✅ | 🟡 R-thread (L506) | 🟢 B-live (1) + 🔴 B-legacy (`src/elements/slabs/SlabTool.ts` — 6 reaches) | 🔴 slabs + slabs |
| E.3 | Door | ✅ `plugins/door/` | ✅ | 🟡 R-thread (L483) | 🟢 B-live (2 in tool.ts + 2 in handlers/CreateDoor.ts) | 🔴 doors + doors (0 cmdMgr reaches in src/elements/doors) |
| E.4 | Window | ✅ `plugins/window/` | ✅ | 🟡 R-thread (L484) | 🟢 B-live (2) | 🔴 windows + windows (0 reaches) |
| E.5 | Curtain Wall | ✅ `plugins/curtain-wall/` | ✅ | 🟡 R-thread (L482) | 🟢 B-live (1) + 🔴 B-legacy (2 reaches in `src/elements/curtainwalls/`) | 🔴 curtainwalls + curtainwall |
| E.6.0 | `plugins/floor/` scaffold | ❌ **MISSING** | n/a | n/a | n/a | n/a |
| E.6 | Floor | ❌ no plugin | ❌ | 🟡 R-thread (L490 + bridge L491) | 🔴 B-legacy (0 cmdMgr reaches in `src/elements/floors` but service.activateFloorTool routes via legacy) | 🔴 floors + floors |
| E.7 | Ceiling | ✅ `plugins/ceiling/` | ✅ | 🟡 R-thread (L488 + bridge L489) | 🟢 B-live (1) | 🔴 ceilings + ceilings (0 reaches) |
| E.8 | Roof | ✅ `plugins/roof/` | ✅ | 🟡 R-thread (L507) | 🟢 B-live (1) + 🔴 B-legacy (2 reaches) | 🔴 roofs + roofs |
| E.9 | Stair | ✅ `plugins/stair/` | ✅ | 🟡 R-thread (L485) | 🟢 B-live (1) + 🔴 B-legacy (3 reaches: `StairTool.ts:281`, `StairPathToolController.ts:603,699`) | 🔴 stairs + stair |
| E.10 | Handrail | ✅ `plugins/handrail/` | ✅ | 🟡 R-thread (L486) | 🟢 B-live (1) + 🔴 B-legacy (1 reach) | 🔴 handrails + handrails |
| E.11 | Column | ✅ `plugins/column/` | ✅ | 🟡 R-thread (L504) | 🟢 B-live (1) | 🔴 columns + columns (0 reaches) |
| E.12 | Beam | ✅ `plugins/beam/` | ✅ | 🟡 R-thread (L505) | 🟢 B-live (1) | 🔴 beams + beam (0 reaches) |
| E.13 | Grid | ✅ `plugins/grid/` | ✅ | 🔴 R-gone (no register call for `grid`) | 🟢 B-live (1) | 🔴 grids + grids (0 reaches) |
| E.14 | Opening | ⚠️ cross-family per spec | n/a (verbs in wall+slab) | 🟡 R-thread (L508 via `tm.activateOpeningTool`) | 🔴 B-legacy (0 reaches in `src/elements/openings` — verbs route through wall+slab handlers) | 🔴 openings + (no command dir) |
| E.15 | Furniture | ✅ `plugins/furniture/` | 🔴 **NOT REGISTERED** | 🔴 R-gone (no register call for `furniture-place`) | 🟡 B-orphan (1 reach in plugin tool.ts; 34 in tests) + 🔴 B-legacy (`PropertyInspector.ts:2172,2592` + `WardrobeCabinetTool.ts:307` — 3 reaches) | 🔴 furniture + furniture |
| E.16 | Structural (per spec line 9) | ✅ `plugins/structural/` | 🔴 **NOT REGISTERED** | 🟡 R-thread for `column` (L504) + `beam` (L505); no `structural` register | 🟡 B-orphan (1 reach in tool.ts; 17 in tests) | 🔴 structural + (no command dir) |
| E.17 | Plumbing + Room Bounding (per spec) | ✅ `plugins/plumbing/`, ✅ `plugins/rooms/` (hosts room-bounding) | 🔴 **NEITHER REGISTERED** | 🟡 R-thread plumbing (L509), `room-bounding` (L499), `room` (L492), `room:level` (L493) | 🟡 B-orphan (plumbing: 1 + rooms: 1) + 🔴 B-legacy (`src/elements/plumbing` 2 + `src/elements/rooms` 9 + `RoomPropertySection.ts` 11 + `RoomTool.ts` 5 = 27 reaches) | 🔴 plumbing + plumbing, rooms + rooms, roomBoundingLines (cmd dir) |

### Aggregate (re-graded, REVISION 3)

| Lane | Original audit | REVISION 2 | REVISION 3 (verified) |
|---|---|---|---|
| Routing — code path | "15/18" | 🟡 16/18 R-thread + 🔴 2/18 R-gone | 🟡 **16/18 R-thread** + 🔴 **2/18 R-gone** (E.13 grid, E.15 furniture-place) |
| Routing — observable in production | (implied yes) | 🔴 0/18 | 🔴 **0/18** (until Layout.ts:1551 threading lands; **one-line PR**) |
| Plugin scaffold | (not graded) | 🟢 15/18 | 🟢 **17/18** (only E.6.0 `plugins/floor` truly missing; opening is cross-family per spec; rooms hosts room-bounding) |
| Plugin REGISTERED in PluginRegistry.ts | (not graded) | (not graded) | 🟡 **12/17** (missing: furniture, plumbing, rooms, structural, plus dimensions/lighting/annotations companions) |
| Bus dispatch in plugins (B-live) | 0/18 | 🟢 4/18 | 🟢 **12/18** B-live + 🟡 **4/18** B-orphan (furniture, plumbing, rooms, structural — handlers exist but not in registry) |
| Legacy `commandManager.execute` reaches | 202 / 121 files | 202 / 121 files | **198 / 122 files** (slight drift since prior count) |
| Legacy deletion | 0/18 | 0/18 | 🔴 **0/18** (23 family dirs in `src/elements/`, 19 family dirs in `src/commands/`) |

**True Phase E completion (re-graded with all four lanes weighted equally):**

```
routing:           16 / 18  (89% scaffolded; 0% live until 1-line PR)
plugin scaffold:   17 / 18  (94%)
plugin registered: 12 / 17  (71%)
bus dispatch live: 12 / 18  (67%)
legacy deletion:    0 / 18  (0%)
                  ──────────
average:           ~64% scaffolded, ~37% production-live
```

The spec measures completion against the **production-live** column (routing observable + bus dispatch live + legacy deleted), so by that bar Phase E is **~22% complete** (one-third of routing observable post-PR + two-thirds of bus dispatch live + zero deletion). REVISION 2's "35% complete" framing over-credited B-orphan plugins as B-live.

---

## Hard counts (re-verified 2026-04-29 R3)

All counts reproducible at HEAD `main` with the verification script in [§ Verification commands](#verification-commands). Numbers that drifted from REVISION 2 are bolded.

| Check | Count | Notes |
|---|---:|---|
| `runtime.tools.register(...)` reaches in `src/ui/Layout.ts` | **20** | Lines 481, 482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 492, 493, 499, 504, 505, 506, 507, 508, 509. The post-block console.log at L510 mistakenly says "21" — a stale count to fix in E-finish.0.A. |
| Register-call line span | **481–509** (not 481–540) | Lines 510–540 are picker/HUD setup, not register calls |
| `(commandBus|bus)\.executeCommand(...)` reaches in `plugins/*/src/tool.ts` | **22** across 16 production plugin tool.ts files | wall:3, slab:1, door:2, window:2, curtain-wall:1, ceiling:1, roof:1, stair:1, handrail:1, column:1, beam:1, grid:1, furniture:1, plumbing:1, rooms:1, structural:1 = 20; +door/handlers/CreateDoor.ts:2 = 22 |
| `(commandBus|bus)\.executeCommand(...)` reaches across all plugin sources + tests | **541** total in `plugins/` | Per `rg -c "(commandBus|bus)\.executeCommand|deps\.bus\.execute" plugins/ --type ts \| awk -F: '{s+=$NF} END {print s}'` |
| `runtime.bus.executeCommand` reaches in `src/` (the wrong pattern REV 2 used) | **3** | `src/elements/walls/WallTool.ts:2`, `src/elements/slabs/SlabTool.ts:1`. Plus `src/commands/CommandManager.ts:1` (definition site). The src tree never adopted the runtime.bus convention; production plugins use injected `CommandBus`. |
| `commandManager.execute(...)` reaches | **198 across 122 files** | Drifted down from REV 2's "202/121" — net +1 file, –4 reaches. Top file: `src/ui/PropertyInspector.ts` (17 reaches) |
| Element directories under `src/elements/` | **23** dirs + 1 `index.ts` = 24 entries | `annotations, beams, ceilings, columns, curtainwalls, dimensions, doors, floors, furniture, grids, handrails, lighting, openings, plumbing, preview, roofs, roomBoundingLines, rooms, slabs, stairs, structural, walls, windows` — note `preview` (singular), not `previews` as REV 2 stated |
| `src/commands/` directories | **31** (19 family + 12 framework) | Family dirs: `annotations, beam, ceilings, columns, curtainwall, doors, floors, furniture, grids, handrails, lighting, plumbing, roofs, roomBoundingLines, rooms, slabs, stair, walls, windows` (REV 2 omitted `lighting`, said 18). Framework: `catalog, generic, geospatial, hierarchy, levels, operations, plans, project, requirements, templates, vg, views`. |
| `src/commands/` files | **8** | `CommandManager.ts, CommandProposalFactory.ts, CommandProposalStore.ts, PatchSnapshot.ts, TagElementCommand.ts, UpdateElementMarkCommand.ts, index.ts, types.ts` |
| `src/commands/` total entries | **39** | 31 dirs + 8 files. REV 2 reported 31 entries — conflated dirs with total. |
| Plugin directories under `plugins/` | **38** (REV 2 said 30) | Full list: ai-floorplan, ai-generative, ai-query, ai-rules, ai-voice, annotations, bcf, beam, ceiling, column, cross, curtain-wall, dimensions, door, furniture, grid, handrail, ifc-export, ifc-import, ifc-inspector, lighting, multiplayer, plan-view, plumbing, rhino-import, roof, rooms, schedules, section-view, selection, sheets, slab, stair, structural, toy-cube, view, wall, window |
| Plugins imported by `apps/editor/src/PluginRegistry.ts` | **13** (12 element-family + view) | wall, slab, door, window, roof, curtain-wall, grid, column, beam, stair, handrail, ceiling, view |
| Plugins NOT in PluginRegistry (B-orphan) | **5+** production element plugins | furniture, plumbing, rooms, structural, dimensions (also lighting, annotations as companions) |

---

## Phase E exit-criteria check (against [spec line 152](../PRYZM2-WIREUP-PLAN-S72/15-subphases-E-families.md))

> *All 18 sub-phases have gesture routing ✓, bus dispatch ✓, legacy deletion ✓. `src/elements/<family>/` and `src/commands/<family>/` directories deleted for all 18 families.*

| Clause | Status | Evidence |
|---|---|---|
| Routing 18/18 | 🟡 16/18 R-thread (dead until L1551) + 🔴 2/18 R-gone (grid, furniture) | Layout.ts:481–509, ToolsPanelController.ts:44, CreateRailPanel.ts:93–96 |
| Bus dispatch 18/18 (live + bound) | 🔴 12/18 live + 4/18 orphan + 2/18 missing-plugin | PluginRegistry.ts:23–46 (12 imports); plugins/{furniture,plumbing,rooms,structural}/src/tool.ts (orphaned); plugins/{floor,opening} absent |
| Legacy deletion 18/18 | 🔴 0/18 | `ls src/elements/`, `ls src/commands/` |
| `src/elements/<family>/` deleted | 🔴 0/23 | All 23 family dirs present |
| `src/commands/<family>/` deleted | 🔴 0/19 family dirs | All 19 family dirs present (REV 2 said 18 — missed `lighting`) |

**Phase E true completion against spec measure: ~22% production-live, ~64% scaffolded.** REVISION 2's "35% complete" framing collapses scaffolded + live; REVISION 3 separates them because the production gap is the only one that matters for users.

---

## Plan: E-finish batches (re-sized to honour both blockers)

Both Blocker 1 (routing wire) and Blocker 2 (PluginRegistry coverage) must close before any E-finish.2 deletion can land. The plan below is sized to **3 sprints (S79–S81-WIRE)** and uses the architectural rule that **routing, registration, and dispatch land per family in lockstep, then deletion is the final step per family**.

### E-finish.0 — Close both blockers + scaffold gap (S79-WIRE D1, 7 PRs)

**E-finish.0.A — Thread runtime into ToolsPanelController** (1 PR, 2-line change):

- `src/ui/Layout.ts:1551` — pass `runtime` as positional arg #2 to `new ToolsPanelController({...}, runtime)`.
- `src/ui/Layout.ts:510` — amend the stale `console.log('[Layout] Phase E (S78-WIRE) — 21 tool activators registered ...')` to read `20` (or, after E-finish.0.C–D, `22`).
- Manual smoke-test all 16 R-thread tool buttons. Each must visibly activate, and `runtime.tools.activeToolId` must update (per spec line 36 acceptance).
- Bench: run all `bench/ui/<family>-*.bench.ts` against pre-PR and post-PR builds. Both must pass; no perf regression > 5%.
- **Risk gate**: keep the `if (!this._activateTool(...)) { /* legacy fallback */ }` pattern in `CreateRailPanel.ts` for one more sprint. The fallback only runs when `_activateTool` returns `false`, which after this PR happens *only* if an activator is genuinely broken. Removing the fallback is sequenced as the last step of each E-bus.<n>.

**E-finish.0.B — Scaffold `plugins/floor/`** (1 PR, E.6.0):

- Mirror `plugins/wall/` structure: `src/{tool,store,handlers,committer,index,intent,occupancy,errors}.ts` + `__tests__/`.
- Replace the `(window as any).floorTool` bridge in `Layout.ts:491` with a real plugin import.
- Move `service.activateFloorTool` invocation in `Layout.ts:490` to dispatch through the new plugin's tool activator.

**E-finish.0.C — Wire E.13 grid gesture** (1 PR):

- Add `runtime.tools.register('grid', (m?) => /* delegate to plugin tool.ts */)` in `Layout.ts` (currently missing, verified by zero hits for `tools\.register\(.*grid` in src/).
- Wire the Levels/Grids panel button click + the GridDrawingHUD path through `runtime.tools.activate('grid', mode?)`.
- Bump the L510 console.log count to `21`.

**E-finish.0.D — Wire E.15 furniture-place gesture** (1 PR):

- Add `runtime.tools.register('furniture-place', (m?) => /* delegate to plugin tool.ts */)` in `Layout.ts`.
- Wire the furniture carousel item click in `CreateRailPanel.ts` through `runtime.tools.activate('furniture-place', { itemId })`.
- Bump the L510 console.log count to `22`.

**E-finish.0.E — Add furniture, plumbing, rooms, structural to PluginRegistry** (1 PR per pair to keep blast radius small; 2 PRs total):

  - **E-finish.0.E.1** — furniture + plumbing
    - `apps/editor/src/PluginRegistry.ts` — import `{ FurnitureStore, buildFurnitureHandlerSet }` from `@pryzm/plugin-furniture` and `{ PlumbingStore, buildPlumbingHandlerSet }` from `@pryzm/plugin-plumbing`.
    - Add corresponding `PluginDescriptor` records to `ALL_PLUGINS`.
    - Verify `apps/editor/__tests__/bootstrap.everything.test.ts` exercises both new plugins; add coverage if absent.
  - **E-finish.0.E.2** — rooms + structural
    - Mirror E.0.E.1 for `@pryzm/plugin-rooms` and `@pryzm/plugin-structural`.
    - Verify `runtime.bus.executeCommand('rooms.create', …)` and `('structural.create', …)` resolve at boot (no `NoHandlerForCommand` throws).

**E-finish.0 exit gate**: routing 18/18 observable in production; PluginRegistry covers 16/16 production element plugins (12 originals + 4 new); the L510 count comment is correct; all `bench/ui/<family>-*.bench.ts` benches green.

### E-finish.1 — Bus dispatch retirement, one family per PR (S79-D3 → S80-D5)

For each family X with non-zero `commandManager.execute('X.*')` reaches in `src/`, the work is:

1. Identify all legacy reach sites (per [ledger 28](../PRYZM2-WIREUP-PLAN-S72/28-commandManager-execute-migration.md) and the per-family `rg -n "commandManager\.execute" src/elements/X/ src/ui/` sweep).
2. Confirm that `plugins/X/src/handlers/` covers every verb the legacy site dispatches. If a verb is missing, add a handler in the same PR — do not create stub handlers.
3. Replace each call site with `runtime.bus.executeCommand('X.<verb>', payload)` (or, where the call site has access to an injected `commandBus`, `commandBus.executeCommand`).
4. Verify `runtime.undoStack` integration: the bus integrates with the undo stack via `command-bus`'s `Disposable` contract. Each migrated call must produce an entry that undoes correctly.
5. Run the family's full bench suite and Playwright integration spec (e.g., `plugins/wall/__tests__/playwright/integration.spec.ts`) against pre/post.

**Order of families** (architecture rail first per Phase F.1 priority):

- **E-bus.1** Wall, Slab (group 1) — S79
  - Wall: 3 reaches in `src/elements/walls/WallTool.ts` (incl. lines 1508, 1578) — already partially migrated via `plugins/wall/`
  - Slab: 6 reaches in `src/elements/slabs/SlabTool.ts`
- **E-bus.2** Door, Window, Curtain Wall (group 2) — S79
  - Door: 0 reaches in `src/elements/doors/` — already migrated; just verify
  - Window: 0 reaches in `src/elements/windows/` — already migrated; just verify
  - Curtain Wall: 2 reaches in `src/elements/curtainwalls/`
- **E-bus.3** Floor, Ceiling, Roof (group 3) — S79
  - Floor: blocked on E-finish.0.B (plugins/floor scaffold)
  - Ceiling: 0 reaches in `src/elements/ceilings/` — verify only
  - Roof: 2 reaches in `src/elements/roofs/`
- **E-bus.4** Stair, Handrail, Column, Beam (group 4) — S80
  - Stair: 3 reaches (`StairTool.ts:281`, `StairPathToolController.ts:603,699`)
  - Handrail: 1 reach
  - Column / Beam: 0 reaches each in `src/elements/`; PropertyInspector reaches handled in E-bus.6
- **E-bus.5** Grid, Opening, Furniture, Plumbing, Room Bounding (group 5) — S80
  - Grid: 0 reaches in `src/elements/grids/` — verify only
  - Opening: 0 reaches in `src/elements/openings/` (cross-family — wall + slab handlers absorb)
  - Furniture: 3 reaches in `src/ui/PropertyInspector.ts:2172,2592` + `src/ui/wardrobe/WardrobeCabinetTool.ts:307`
  - Plumbing: 2 reaches in `src/elements/plumbing/`
  - Rooms / Room-Bounding: 9 reaches in `src/elements/rooms/` + 11 in `src/ui/property-inspector/RoomPropertySection.ts` + 5 in `src/elements/rooms/RoomTool.ts` + 4 in `src/spatial/RoomAutoOrganiser.ts` + 4 in `src/ai/rooms/RoomAIAssistant.ts`. **Largest single bus-migration PR** — sized as a 2-day spike, not one PR.
- **E-bus.6** PropertyInspector mass migration (separate PR) — S80
  - `src/ui/PropertyInspector.ts` alone holds **17 `commandManager.execute` reaches** spanning multiple families. Bundled into a single PR after all 18 families have plugin handlers, so each replacement targets a known-bound bus handler.

### E-finish.2 — Legacy deletion, one family per PR (S80 → S81)

For each family X (run only after the matching E-bus.<n> has merged):

1. Confirm `rg -n "commandManager\.execute\('X\." src/` returns 0.
2. Confirm `rg -n "(window as any)\.X(Tool|Store|Builder)" src/` returns 0 (Phase B carry-over).
3. Confirm `plugins/X/__tests__/` covers every gesture the deleted code used to handle (compare bench coverage matrix).
4. Delete `src/elements/X/` and `src/commands/X/` in a single PR.
5. Delete the matching `(window as any).XTool` bridge from `Layout.ts:487–492` (where present).
6. Delete the corresponding fallback branch in `CreateRailPanel.ts` (the `if (!this._activateTool('X', …)) { /* legacy fallback */ }` block — keep the early-return guard, drop the fallback).
7. Run all 9 validation workflows green; the only consumers should be the new plugin's tests.

After all 18 families: `src/elements/` retains only `preview/` (shared rendering helpers) + `index.ts`; `src/commands/` retains only the 12 framework dirs + 8 framework files.

### E-finish.3 — Retire `commandManager` (final, S81-WIRE)

Once all 18 families have completed E-bus + E-finish.2:

1. Confirm `rg -n "commandManager\.execute\(" src/ --type ts` returns 0.
2. Confirm every consumer of `commandManager.undo() / .redo() / .execute()` has been migrated to `runtime.undoStack` and `runtime.bus`.
3. Delete `src/commands/CommandManager.ts`, `src/commands/CommandProposalFactory.ts`, `src/commands/CommandProposalStore.ts`.
4. Keep `src/commands/PatchSnapshot.ts` (it is the on-disk patch format consumed by the bus's history slice; not legacy).
5. Keep `src/commands/index.ts` and `src/commands/types.ts` for the exported `Command` interface used by `runtime.bus` adapters.
6. Final smoke-test: every UI gesture, every undo, every redo, every plugin handler — full regression matrix per `bench/ui/`.

### Acceptance criteria (verbatim from spec line 152, with verification commands)

1. ✅ `rg "(commandBus|bus|runtime\.bus)\.executeCommand\(" src/ plugins/ apps/ --type ts | wc -l` ≥ **300** (currently ~544, of which most are tests; production reaches must increase as `src/` migrations land).
2. ✅ `rg "commandManager\.execute\(" src/ --type ts | wc -l` = **0** (currently 198).
3. ✅ `ls src/elements/` returns only `preview/` + `index.ts` (currently 23 family dirs + dimensions + lighting).
4. ✅ `ls src/commands/` returns only 12 framework dirs + 5 framework files (currently 19 family dirs + 12 framework + 8 files).
5. ✅ All E-* gesture-coverage benches green (one bench per family per gesture, per spec col 5).
6. ✅ `apps/editor/src/PluginRegistry.ts` imports all 17 production element plugins (currently 12 + view).

---

## Verification commands

Reproducible at HEAD `main`. Each command is the source of truth for the count it backs in this audit.

```bash
# Routing register calls in Layout.ts
rg -c "runtime\.tools\.register" src/ui/Layout.ts                        # → 20
rg -n "runtime\.tools\.register" src/ui/Layout.ts                        # → 20 lines: 481–509

# Threading gap at the call site
rg -n "new ToolsPanelController" src/ui/Layout.ts                        # → 1551
sed -n '1551,1571p' src/ui/Layout.ts                                     # 2nd positional arg absent

# Bus dispatch in production plugin tool.ts
for p in wall slab door window curtain-wall floor ceiling roof stair handrail \
         column beam grid opening furniture plumbing rooms structural; do
  c=$(rg -c "(commandBus|bus)\.executeCommand|deps\.bus\.execute" plugins/$p/src/tool.ts 2>/dev/null || echo 0)
  echo "$p/src/tool.ts: $c"
done                                                                      # → 16 of 18 ≥ 1

# Bus dispatch across all plugin sources (incl. tests)
rg -c "(commandBus|bus)\.executeCommand|deps\.bus\.execute" plugins/ --type ts \
  | awk -F: '{s+=$NF} END {print s}'                                     # → 541

# Legacy commandManager.execute reaches
rg -c "commandManager\.execute\(" src/ --type ts | awk -F: '{s+=$NF; n++} END {print s, n}'   # → 198 122

# Per-family commandManager.execute reaches in src/elements
for f in walls slabs doors windows curtainwalls floors ceilings roofs stairs \
         handrails columns beams grids openings furniture plumbing rooms structural; do
  c=$(rg -c "commandManager\.execute\(" src/elements/$f/ 2>/dev/null | awk -F: '{s+=$NF} END {print s+0}')
  echo "$f: $c"
done

# Plugin scaffold coverage
for fam in wall slab door window curtain-wall floor ceiling roof stair handrail \
           column beam grid opening furniture plumbing rooms structural; do
  [ -d "plugins/$fam" ] && echo "✓ $fam" || echo "✗ $fam"
done                                                                     # → 17/18 (✗ floor; cross-family: opening)

# PluginRegistry coverage
rg -n "from '@pryzm/plugin-" apps/editor/src/PluginRegistry.ts | wc -l   # → 13 (12 element + view)

# src/elements directory inventory
ls -d src/elements/*/ | wc -l                                            # → 23
ls src/elements/                                                          # → 24 entries (23 dirs + index.ts)

# src/commands directory inventory
ls -d src/commands/*/ | wc -l                                            # → 31 (19 family + 12 framework)
ls src/commands/ | wc -l                                                 # → 39 (31 dirs + 8 files)

# plugins/ inventory
ls plugins/ | wc -l                                                       # → 38
```

---

## Lessons learned (recorded for future audits)

1. **Always verify file paths AND directory contents before citing them.** REVISION 2 corrected the original audit's `CreateRailPanel.ts` path error but introduced its own inventory errors (omitting `lighting` from family dirs, mis-spelling `previews` for `preview`, undercounting `plugins/` by 8). REVISION 3 cross-checks every `ls` and `rg` against HEAD.
2. **Always verify the regex matches the production pattern before drawing a conclusion.** REVISION 2's `runtime\.bus\.executeCommand|runtime\.commandBus\.execute` matched 0 hits in `plugins/`, leading to the "4/18 bus dispatch" finding. The actual production pattern (after reading `plugins/wall/src/tool.ts:7`) is **injected `CommandBus` via PluginRegistry**, reached as `this.deps.commandBus.executeCommand(...)`. Counting that pattern shows 16/18 families dispatch via the bus today.
3. **Distinguish "scaffolded" from "registered" from "live".** Phase E migration has at least four conceptually distinct states a family can occupy: (a) scaffolded only — `plugins/X/` exists; (b) scaffolded + handler-bound — also imported by `PluginRegistry.ts`; (c) scaffolded + handler-bound + routing-wired — also has a `runtime.tools.register('X', …)` in `Layout.ts`; (d) production-live — also has `runtime` threaded into `ToolsPanelController`. REVISION 2 conflated (a)–(d) into one column.
4. **The `(window as any).<x>Tool` bridges in `Layout.ts:487–500` are correctly marked with `TODO(E.<n>)` comments** — but three of them (`room`, `room:level`, `room-bounding` at lines 492, 493, 499) point at `E.16` when they should point at `E.17` per spec line 9 (E.16 = structural, E.17 = plumbing + rooms / room-bounding). Fix the comment pointers in the same PR that lands the room migration.
5. **PluginRegistry.ts is a per-PR ledger, not an automated discovery.** The registry is hand-edited and grew by addition: 1 plugin at S07, 12 by Phase 1C, 13 by Phase 2A. Five plugins (`furniture`, `plumbing`, `rooms`, `structural`, `dimensions`) shipped scaffolds + handlers + bus dispatch in plugin sub-PRs but never had the registry update PR open. This is a documentation + checklist gap for the per-family plugin authors, not a code defect.
6. **Multi-PR rescues should be split into "fix the wiring" + "fix the registration" + "fix the data" + "fix the deletion".** The original `E-prereq.0` PR conflated the first three. REVISION 2's "one-line PR" framing was correct for the wiring lane but missed the registration lane entirely. REVISION 3 separates them: E-finish.0.A is the one-line wiring; E-finish.0.E.{1,2} are the registration; E-finish.1 is the data migration; E-finish.2 is the deletion.
7. **Bus dispatch test coverage is high in plugins (~520 test reaches) but production `src/` usage is still on the legacy lane (198 reaches across 122 files).** The migration *is being practiced* heavily in plugins but hasn't been rolled out across the rest of `src/`. The `commandManager.execute` retirement (E-finish.3) is the rollout step and depends on E-finish.0.A + 0.E + E-finish.1 closing first.
8. **The L510 stale console.log (`"21 tool activators registered"`) is a small but telling artefact.** It was never updated when a register call was removed (or never updated when one was planned but not added). Future PRs that change the L481–509 register block must touch L510 in the same diff. Add an ESLint rule or a pre-commit grep guard if this drifts again.

---

## Feedback (REVISION 3 author's note)

This audit was reconstructed against the live tree at HEAD `main` on 2026-04-29. The architecture-correct framing is:

- **One-line PR + registry-completion PR + 18 per-family migration PRs + 18 per-family deletion PRs = ~38 PRs across S79–S81-WIRE** to close Phase E. REVISION 2's "single-PR rescue + bus migration in batches" framing under-shaped the plan because it missed the registry coverage gap. REVISION 1 over-shaped it because it claimed register calls were missing when 20/22 were already in place.
- **The biggest hidden risk** is that 4 plugins (`furniture`, `plumbing`, `rooms`, `structural`) carry full handler sets, full test coverage, and live bus-dispatch in their `tool.ts` — but are never bound to `runtime.bus` because `PluginRegistry.ts` doesn't import them. A reviewer skimming `plugins/` will see "this looks done"; a reviewer skimming `PluginRegistry.ts` will see "12 plugins listed, like the spec says"; only a reviewer who runs `apps/editor/__tests__/hello-12-elements.test.ts` against the production runtime will discover the orphan binding. Add a CI check: every `plugins/*/src/index.ts` that exports `build*HandlerSet` must be referenced by `apps/editor/src/PluginRegistry.ts`. This is a sub-100-line script and would have caught the gap in REVISION 2.
- **The two-blocker structure** (wiring + registry) means routing fixes alone won't make Phase E observable. Sequencing E-finish.0.A before E-finish.0.E.* is acceptable, but neither is sufficient on its own.
- **The "no shortcut" architectural reading of REVISION 3**: do not delete the `_activateTool`/legacy-fallback pattern in `CreateRailPanel.ts` until the per-family E-finish.2 deletion lands. The fallback is the correct safety net during a multi-sprint migration. Deleting it before the matching family's bus + deletion lanes are green would couple two unrelated lanes' risk surfaces — exactly the kind of patch-fix the prior revisions correctly warned against.
- **What changed between REV 2 and REV 3 in the per-family table** (`E-bus.5` row in particular): REV 2 listed E.15 furniture as B-legacy and E.17 rooms as B-legacy. REV 3 promotes them to B-orphan because their plugin handlers exist and their bus dispatch is implemented in `tool.ts` — they only need PluginRegistry binding to be production-live. Distinguishing B-orphan from B-legacy is what makes the registry-completion PR a small, low-risk fix instead of a multi-sprint plugin-build effort.

The plan above is intentionally **not** sized smaller than 3 sprints. The L1551 wiring PR is 2 lines, but the bus-migration lane (E-finish.1) is genuinely ~100–200 line edits per family across `src/` plus per-family bench validation. Compressing it would skip the spec's per-family bench gating and risk silent regressions during the `commandManager` retirement. Keep the cadence; don't merge multiple families' bus PRs into one.
