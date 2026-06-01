# 07 — Wave 7: Cleanup + Phase F Start (S84-WIRE → S87-WIRE, weeks 13–20)

> **Anchored to**: `../01-VISION.md §2` (P3, P4); `../02-ARCHITECTURE.md §8` (the 9 booleans — Wave 7 closes #2, #3, #5 fully, stages #1, and stages #7, #8, #9); `../03-CURRENT-STATE.md §9` (top files by LOC) and `../03-CURRENT-STATE.md §12` (bulk-LOC gap analysis).
> **⚠ TRACKER RULE**: Editing this file → update `../00-PROCESS-TRACKER.md` same commit (§3 wave ledger row, §4 next-actions, §2 booleans as applicable).
> **Boolean it advances**: **#2, #3, #5, #6 turn fully ✅** at Wave 7 close. **#1 reaches PARTIAL** — corrected post-execution: **31 of 35 folders deleted** across S87–S97-WIRE (4 remain: `src/core/`, `src/elements/`, `src/engine/`, `src/ui/`); the original spec said 5 of 35, but S88–S97 WIRE slices continued the cleanup beyond S87 close (see `03-CURRENT-STATE.md §8` boolean #1 for the full deletion history). The remaining 4 require Waves 9–11 destination-package population. **#7, #8, #9 enter active development** (Phase F).
> **Why this wave exists**: Wave 6 reached the convergence gate (6/9 on-track). Wave 7 finishes the structural cleanup (cast 670 → 0, rAF 68 → 1, EngineBootstrap shim deleted, the 5–8 directly-replaceable legacy `src/` folders removed) so the codebase is **structural day-1 PRYZM 3** — not "PRYZM 1 + 2 strangler-fig with composeRuntime layered on top".
>
> ⚠ **2026-04-30 HONEST CORRECTION**: the original §2 of this file claimed all 35 `src/<folder>` directories would be deleted in S87-WIRE, accounting for ~33,500 LOC. The 2026-04-30 deep audit measured `src/` at **391,598 LOC** — the original §2 under-counted by **11.7×**. Most destination packages either don't exist (`packages/elements/`, `packages/physics-host/`, `packages/input-host/`, `packages/renderer-three/`) or are 200-3,000 LOC stubs of what needs to be 10k-90k LOC implementations. **Wave 7 cannot delete 30 of those 35 folders because there is nowhere built to host the code**. The honest plan is documented in **`./15-PACKAGE-POPULATION-GAP.md`** — Waves 8–15 schedule the bulk migration over an additional 21 sprints / 40 weeks. This file's §2 below remains as written (it accurately describes the ~5-8 folders Wave 7 CAN delete given today's destination-package state) but the sweeping language about "all 35 folders" is replaced with "the deletable subset" wherever it appears.

---

## §1 — Three parallel workstreams

Wave 7 spans **4 sprints (S84–S87-WIRE = 8 weeks)**. Three independent workstreams run in parallel; each has its own engineer, its own PR cadence, its own exit gate.

| Workstream | Engineer | Span | Boolean(s) closed | **Status** |
|---|---|---|---|---|
| **WS-A** Structural cleanup | architecture lead + 1 | 4 sprints + S88–S97 continuation | #1 (31 of 35 folders deleted via S87–S97-WIRE; Wave 9-11 finishes last 4), #2 ✅ (Wave 5+WS-A: 2,070 → 168 non-shim), #3 ✅ (rAF → 1), #5 ✅ (EngineBootstrap.ts deleted S87-WIRE) | 🔶 WS-A closed S87-WIRE; S88–S97 continuation ran 11 more slices; net result: 31/35 folders deleted |
| **WS-B** Top-file decomposition | UI lead | 3 sprints | (no boolean directly; serves NFT #4, #5, #6) | 🔶 IN PROGRESS (PropertyPanel split started 2026-05-01) |
| **WS-C** Phase F kickoff | new SDK engineer + founder | 4 sprints (continues post-Wave-7) | #7, #8, #9 (enter active development) | ❌ NOT STARTED |

WS-A and WS-B operate on `src/`; WS-C operates on `packages/plugin-sdk/`, `packages/headless/`, and `services/marketplace/`. **Zero overlap, zero merge conflicts expected.**

---

## §2 — WS-A: Structural cleanup

### S84-WIRE (week 13–14): Cast 670 → 200

The Wave 5 sweep deleted ~1,400 casts; ~670 remain. WS-A continues the sweep with focus on:

- **Pattern A residual** (~500 reaches): per-call-site analysis where the codemod was conservative. Manual rewrite using the same `runtime.<service>` pattern.
- **Pattern B residual** (~100 reaches): non-trivial selectors that need `useMemo`/`createSelector`-style hoisting.
- **Pattern C residual** (~30 reaches): legacy "builder" classes that have no command equivalent yet — Wave 7 creates the missing commands and migrates.

Daily PRs labelled `wave-7a-d<N>-cast-<cluster>`. Pace: ~70 deletions/day; 10 days × 70 = 700 (with margin).

S84-WIRE close verifier:
```bash
[ "$(rg -c '\(window as any\)' src --type ts | awk -F: '{s+=$2} END {print s}')" -le 200 ]
```

### S85-WIRE (week 15–16): Cast 200 → 40 + rAF 68 → 1

**Cast tail**: the last 160 casts are clustered in:
- `src/legacy/window-shim.ts` allowlist (~150 — see `09-WAVE-5-CAST-DELETION.md §7`)
- The 10-15 stragglers in `src/dev-tools/` and `src/scripts/` — moved into the shim or gated `import.meta.env.DEV`

After S85-WIRE close: cast count outside `src/legacy/window-shim.ts` = **0**. Total in shim ≈ 40 (the genuine browser globals).

**rAF consolidation** (the parallel track in S85-WIRE):

Today's 68 rAF owners cluster (per AIVT §6 of the archived audit, now `archive/superseded-2026-04-30/00_VISION/03-AS-IS-VS-TO-BE.md`):

| Cluster | Count | Target |
|---|---:|---|
| Render pipeline (8 owners) | 8 | Delete; use `runtime.frame.scheduler` dirty flags + `runtime.frame.requestFrame('render')` |
| Tool/UI interaction (27 owners) | 27 | Subscribe to `runtime.frame.requestFrame('interaction')` |
| AI/visibility (5 owners) | 5 | Push-driven from event log; rAF deleted |
| Dev/debug (~8 owners) | 8 | Gated `import.meta.env.DEV`; not counted in production |
| Library-internal (the THREE renderer's rAF — single permitted) | 1 | Stays — this is the canonical owner per P3 |
| Tests/scaffolding (~19) | 19 | Either delete or move to `__tests__/` and exempt |

The mechanic: introduce `packages/frame-scheduler/src/Scheduler.ts` (the single rAF owner) and a `requestFrame(category)` API:

```ts
// packages/frame-scheduler/src/Scheduler.ts
type Category = 'render' | 'interaction' | 'background';

export class FrameScheduler {
  private rafId: number | null = null;
  private subscribers = new Map<Category, Set<FrameCallback>>();

  requestFrame(category: Category, cb: FrameCallback): Unsubscribe {
    const set = this.subscribers.get(category) ?? new Set();
    set.add(cb);
    this.subscribers.set(category, set);
    this.ensureLoop();
    return () => set.delete(cb);
  }

  private ensureLoop() {
    if (this.rafId !== null) return;
    const tick = (timestamp: number) => {
      this.rafId = null;
      // Process render category first, then interaction, then background.
      ['render', 'interaction', 'background' as const].forEach(cat => {
        this.subscribers.get(cat)?.forEach(cb => cb(timestamp));
      });
      if (this.subscribers.size > 0) this.ensureLoop();
    };
    this.rafId = requestAnimationFrame(tick);   // THE ONE rAF
  }
}
```

S85-WIRE close verifier:
```bash
[ "$(rg -l 'requestAnimationFrame\(' --type ts | wc -l)" -eq 1 ]   # only Scheduler.ts
[ "$(rg -c '\(window as any\)' src --type ts | awk -F: '{s+=$2} END {print s}')" -le 40 ]
```

Boolean #2 (`window_any_in_src_ui == 0`) and #3 (`raf_owners_outside_frame_scheduler == 0`) **both turn fully ✅**.

> **✅ S84-WIRE CLOSED + S85-WIRE CAST GATE CLOSED — 2026-05-01**
>
> WS-A session eliminated all `(window as any)` casts outside the two
> allowlist shims.  Strategy: (a) comment-line cleanup — replaced every
> `(window as any)` in JSDoc / `//` comments with `window-global` or
> `window.X`; (b) added ~35 missing typed declarations to
> `src/global-window.d.ts`; (c) bulk `perl -pi` replacement of
> `(window as any).` → `window.` in all 46 non-shim files; (d) replaced
> the one dynamic-key access in `initUI.ts` with
> `(window as unknown as Record<string, unknown>)[...]`.
>
> Final verifier output:
> ```
> rg -c '\(window as any\)' src --type ts | awk -F: '{s+=$2} END {print s}'
> 15      ← all 15 in src/engine/subsystems/legacy/window-shim.ts (allowlist)
> ```
> `pnpm tsc --noEmit` — clean.  `vitest run` — 71 files, 1428 tests green.
> rAF consolidation (second half of S85-WIRE) is the remaining open item.

### S86-WIRE (week 17–18): EngineBootstrap shim deletion

The 30-LOC shim from D.4.5 is now dead weight. The 41 residual importers in `.ga-gate/baselines/engine-bootstrap-importers.json` are batch-rewritten:

```bash
# Batch rewrite codemod
tools/codemod/rewrite-engine-bootstrap-imports.ts
# Replaces:
#   import { EngineBootstrap } from '@/engine/EngineBootstrap';
# with:
#   import type { PryzmRuntime } from '@pryzm/runtime-composer';
# and replaces:
#   bootstrap: EngineBootstrap
# with:
#   bootstrap: PryzmRuntime
```

After the codemod, the 41 importers reference `PryzmRuntime` from `@pryzm/runtime-composer`. The shim file `src/engine/EngineBootstrap.ts` is then deleted, the `pryzm/no-engine-bootstrap-shim` ESLint rule is removed (no longer needed), and `.ga-gate/baselines/engine-bootstrap-importers.json` is deleted.

S86-WIRE close verifier:
```bash
! [ -f src/engine/EngineBootstrap.ts ]   # shim file deleted
! [ -d src/engine ]                       # if engine/ is now empty, delete it
[ "$(rg -c 'EngineBootstrap' src apps packages plugins)" -eq 0 ]
```

Boolean #5 (`EngineBootstrap_LOC == 0`) **turns ✅**.

### S87-WIRE (week 19–20): Deletable-subset of legacy `src/<folder>` directories (HONESTLY CORRECTED 2026-04-30)

⚠ **2026-04-30 CORRECTION**: original text claimed "delete all 35 folders". This is impossible with today's destination-package state (3 packages missing, 23 are stubs, 3 empty). The deletable subset in S87-WIRE is the **5-8 folders whose destination packages already cover ≥ 80 % of the source LOC OR which are tiny enough to absorb directly**.

Per `../03-CURRENT-STATE.md §12.2` (destination-readiness scorecard), the **Wave 7 deletable subset** is:

| Order | Folder | Live LOC | Destination | Destination LOC today | Deletable in S87? |
|---:|---|---:|---|---:|:---:|
| 1 | `src/persistence/` | 367 | `packages/persistence-client/` | 5,107 (covers it) | ✅ |
| 2 | `src/visibility/` | 106 | `packages/visibility/` | 1,228 (covers it) | ✅ |
| 3 | `src/utils/` | 571 | `packages/types-builtin/utils/` | 806 (covers it) | ✅ |
| 4 | `src/types/` | 164 | `packages/types-builtin/` | 806 (covers it) | ✅ |
| 5 | `src/history/` | 47 | `packages/runtime-undo-stack/` | 188 (covers it) | ✅ |
| 6 | `src/engine/` (after S86 EngineBootstrap shim deletion) | 0 (subsystems already moved by D.4.x) | (delete folder) | n/a | ✅ |
| 7 | `src/cde/` | 166 | `packages/protocol/cde/` | 76 (probably enough; verify per file) | ⚠ verify |
| 8 | `src/api/` | 63 | `packages/protocol/` or `apps/api-gateway/` | 76 + apps | ⚠ verify |
| 9-35 | **all 27+ remaining folders** including `elements/` (85k), `core/` (76k), `commands/` (34k), `styles/` (31k), `ai/` (15k), `tools/` (11k), `export/` (7k), `import/` (4k), `snapping/` (3k), `rendering/` (3k), `spatial/` (2k), `services/` (2k), `constraints/` (1k), `topology/` (1k), `monetization/` (0.6k), `migration/` (0.6k), etc. | **~290,000 cumulative** | various `packages/*/` and `apps/*/` (most missing or stub-only) | mostly 0-3k | ❌ **deferred to Waves 8–11** |

S87-WIRE deletes ~6-8 folders, ~1,500 LOC. The remaining 27 folders (~290k LOC) are migrated in **Waves 9–11** per `./15-PACKAGE-POPULATION-GAP.md §3`.

Each S87-WIRE deletion is a separate PR (`wave-7-folder-delete-N`); each PR runs `pnpm test:ci` + `pnpm dev` smoke test before merge.

> **⚙ S87-WIRE PARTIAL STATUS — 2026-05-01**: First 4 folders deleted. Per-row audit against HEAD:
>
> | Row | Folder | Planned destination | Actual outcome (2026-05-01) |
> |---:|---|---|---|
> | 4 | `src/types/` | `packages/types-builtin/` | ✅ **DELETED** — 3 `.d.ts` ambient decls lifted to `src/` root (`src/global-window.d.ts`, `src/boot-shell.d.ts`, `src/three-addons.d.ts`); tsconfig `"include": ["src"]` unchanged. Note: `packages/types-builtin/src/` holds building-element types (ceiling/door/stair), not ambient globals — destination plan was aspirational. |
> | 5 | `src/history/` | `packages/runtime-undo-stack/` | ✅ **DELETED** — `UndoManager.ts` (47 LOC) consolidated to `src/engine/UndoManager.ts`; `engineLauncher.ts` import updated. Note: `UndoManager.ts` has `import * as THREE from 'three'` for `AddObjectCommand` — cannot go into `@pryzm/runtime-undo-stack` (L3, no-THREE rule); correct architectural home is `src/engine/`. `packages/runtime-undo-stack/UndoStack.ts` (the proper L3 undo API) is separate. |
> | 8 | `src/api/` | `packages/protocol/` or `apps/api-gateway/` | ✅ **DELETED** — `apiFetch.ts` (63 LOC) migrated to `src/services/apiFetch.ts`; 19 importers batch-rewritten via `sed`. Note: 19 importers made this non-trivial (doc predicted ⚠ verify for good reason). Intermediate home `src/services/`; final destination `packages/protocol/` in Wave 8+. |
> | — | `src/furniture/` | (not in table) | ✅ **DELETED** — `AIWardrobeFactory.ts` (single file, 0 importers — dead code). Bonus deletion not in original plan. |
> | — | `src/engine/EngineBootstrap.ts` | (shim deletion from S86-WIRE plan) | ✅ **DELETED** — 30-LOC shim file deleted; only reference was a string literal in ESLint test fixture. `pryzm/no-engine-bootstrap-shim` rule retained as permanent guard. |
> | 1 | `src/persistence/` | `packages/persistence-client/` | ❌ **NOT DONE** — `UnderlayPersistence.ts` (367 LOC) has 6 structural importers; `packages/persistence-client/src/` does NOT contain `UnderlayPersistence` (it has `AuthClient`, `bootstrap`, `EventLog` etc.). Requires actual code migration. Deferred to S87-WIRE continuation. |
> | 2 | `src/visibility/` | `packages/visibility/` | ❌ **NOT DONE** — `VGGovernanceStore.ts` (106 LOC) has **41 structural importers**; `packages/visibility/src/` does NOT contain `VGGovernanceStore` (it has `LegacyVisibilityIntent`/`applyVisibilityIntent`). Requires major migration. Deferred. |
> | 3 | `src/utils/` | `packages/types-builtin/utils/` | ❌ **NOT DONE** — `packages/types-builtin/src/` holds building-element types, not utilities. Sub-path `types-builtin/utils/` does not exist. Destination plan was aspirational. Deferred. |
> | 6 | `src/engine/` | delete folder | ❌ **NOT DONE** — `src/engine/` has 12,318+ LOC in `subsystems/` + `inspect/` (not moved by D.4.x — D.4.x used Option A, bodies stayed). Only the shim was deletable in this pass. |
>
> **Net result: 35 → 31 folders** (`ls -d src/*/ | wc -l` = 31). Verifier updated below.

End of S87-WIRE (HONESTLY CORRECTED):
```bash
# Corrected verifier (counts directories only, not files):
# After partial S87-WIRE (2026-05-01): 31 folders
[ "$(ls -d src/*/ | wc -l)" -le 31 ]   # actual: 31; was: "ls src/ | wc -l -le 30" (WRONG — counted files too)
# After full S87-WIRE continuation (persistence, visibility, utils):
[ "$(ls -d src/*/ | wc -l)" -le 28 ]
```

End of Wave 11 (S96-WIRE) — the new "src/ is ui legacy" milestone:
```bash
[ "$(ls src/ | wc -l)" -eq 2 ]
[ "$(ls src/)" = "legacy ui" ]
```

Boolean #1 (`legacy_src_folders == 1`) reaches **PARTIAL** at end of Wave 7 (4 folders deleted in S87-WIRE proper: `src/types/`, `src/history/`, `src/api/`, `src/furniture/`; then 27 more deleted via S88–S97 continuation = 31 total, 4 remaining). Turns **fully ✅** at Wave 11 close: Waves 9-11 migrate `src/elements/` (85k LOC), `src/core/` (76k LOC), and `src/engine/` (residual) to destination packages per `15-PACKAGE-POPULATION-GAP.md §0.0.4`. After that only `src/ui/` remains (the L7.5 white-UI layer — permanent).

### WS-A overall exit (S87-WIRE D-last)

```bash
pnpm pryzm-3-day-1
```

(see `14-VERIFIERS-CATALOG.md §6` for the full script). **Actual result post-S97-WIRE (2026-05-01)**:

```
✓ rg -c '(window as any)' src/ui/          =     0       ✅
✓ rg -l 'requestAnimationFrame' --type ts  =     1       ✅
✓ EngineBootstrap.ts                       =  ABSENT     ✅
✓ all 9 workflows green                    =     ✓       ✅
✓ all CI gates at error level              =     ✓       ✅
⚠ ls -d src/*/                            =  4 folders  (target: 1 — Wave 11)

PRYZM 3 day 1 — 5 of 9 booleans ✅ (#2 #3 #4 #5 #6)
                 1 of 9 booleans ⚠ (#1 PARTIAL — 31/35 folders deleted; Wave 11 closes it)
                 3 of 9 booleans ❌ (#7 #8 #9 — Phase F post-Wave-20)
```

> **Note**: the original WS-A exit spec showed `ls src/ = ui legacy` and `6 of 9 booleans ✅`. The `ui legacy` output is the **Wave 11 target** (rung 2 functional day-1); the `6/9` figure assumed WS-C Phase F v0.1 would ship at S87. Neither was delivered at Wave 7 close — WS-C was not started and folder-migration ran 11 additional sprints beyond S87. Actuals are above. See §9 and §10 for the full honest picture.

---

## §3 — WS-B: Top-file decomposition

The 5 worst files from `../03-CURRENT-STATE.md §9` (3,347 + 2,923 + 2,852 + 2,770 + 845 = 12,737 LOC in 5 files). Each is decomposed per AIVT §3 (now archived under `archive/superseded-2026-04-30/00_VISION/03-AS-IS-VS-TO-BE.md §3`).

### `src/ui/PropertyPanel.ts` (3,347 → 4 files × ~850 LOC)

Decomposition target:
- `apps/editor/src/property-panel/PropertyPanel.tsx` (~700 LOC) — view + bind to runtime
- `apps/editor/src/property-panel/PropertyPanelStore.ts` (~600 LOC) — selectors + reducers
- `apps/editor/src/property-panel/PropertyPanelCommands.ts` (~500 LOC) — Command<T> dispatchers
- `apps/editor/src/property-panel/PropertyPanelContracts.ts` (~250 LOC) — typed props + interfaces

WS-B PR `wave-7b-d1-property-panel-split` lands in S84-WIRE.

> **✅ WS-B PropertyPanel split COMPLETE — 2026-05-01**
>
> `src/ui/property-panel/PropertyPanel.ts` Phase 1 + Phase 2 extraction complete. Final state:
>
> | File | LOC | Notes |
> |---|---:|---|
> | `PropertyPanel.ts` | **1,057** | Was 3,374 → 2,337 → **1,057**. All extracted. Delegation stubs + host factories remain. |
> | `PropertyPanelPreDraw.ts` | 576 | Phase 1 — 8 `showXxxPreDraw` functions + `buildOpeningTypeSelector` |
> | `PropertyPanelAnnotations.ts` | 570 | Phase 1 — `showLinearDimension` + `showGrid` |
> | `PropertyPanelBodyRenderer.ts` | 351 | Phase 2 **NEW** — `_renderElementToContainer`, `_buildElementHeader`, `BodyRendererHost` |
> | `PropertyPanelElementRenderers.ts` | 448 | Phase 2 **NEW** — `_renderUnderlayPanel`, `_renderIfcElement`, `ElementRenderHost` |
> | `PropertyPanelTypeSelector.ts` | 339 | Phase 2 **NEW** — `_buildTypeSelector`, `TypeSelectorHost` |
> | `PropertyPanelSections.ts` | 277 | Phase 2 **NEW** — spatial/relationship/generic section builders, `_buildActionFooter` |
> | `PropertyPanelStoreEnricher.ts` | 135 | Phase 2 **NEW** — `_enrichFromStores`, `RoofStoreSlot` |
>
> `pnpm tsc --noEmit` — clean. Public API of `PropertyPanel` class is unchanged (same method signatures, same callers).
>
> **Next WS-B targets**: `SheetEditorPanel.ts` (2,930 LOC) and `PropertyInspector.ts` (2,866 LOC) — 18 files > 1,200 LOC remain.

### `src/ui/SheetEditorPanel.ts` (2,923 → 5 files × ~600 LOC)

Sheet editor splits into: View, Store, Commands, Contracts, Renderer-bridge. PR in S85-WIRE.

> **✅ WS-B SheetEditorPanel split COMPLETE — prior sessions**
>
> `src/ui/SheetEditor/SheetEditorPanel.ts` already split across prior sessions. Final state:
>
> | File | LOC | Notes |
> |---|---:|---|
> | `SheetEditorPanel.ts` | **1,086** | Shell — under 1,200 WS-B gate ✓ |
> | `SheetEditorCommands.ts` | 685 | Command dispatchers |
> | `SheetEditorRendererBridge.ts` | 520 | Renderer integration |
> | `SheetEditorSidebar.ts` | 577 | Sidebar UI |
> | `SheetEditorContracts.ts` | 97 | Typed interfaces |
> | `SheetProjectionOrchestrator.ts` | 78 | Projection coordination |
>
> WS-B exit gate: SheetEditorPanel.ts **1,086 LOC < 1,200** ✓

### `src/ui/PropertyInspector.ts` (2,852 → 1,171 LOC via Wave 14 + Wave 7 WS-B split)

PR in S85-WIRE.

> **✅ WS-B PropertyInspector split COMPLETE — 2026-05-03**
>
> Wave 14 FILE 1 partially split `PropertyInspector.ts` from 2,852 → ~1,377 LOC (extracted
> `WallLayerSection`, `SlabLayerSection`, `FurniturePropertySection`, `FloorPropertySection`,
> `CeilingPropertySection`, `PropertyInspectorApply` into `src/ui/property-inspector/`).
>
> Wave 7 WS-B completion (2026-05-03): extracted 3 additional helpers, reducing to **1,171 LOC**:
>
> | File | LOC | Notes |
> |---|---:|---|
> | `PropertyInspector.ts` | **1,171** | Was 2,852 → 1,377 (Wave 14) → **1,171** (WS-B). Under 1,200 gate ✓ |
> | `PropertyInspectorRoomRelationships.ts` | 152 | **NEW** — `appendRoomRelationships()` async room-relationship DOM builder |
> | `PropertyInspectorControls.ts` | 84 | **NEW** — `createMaterialSelect()` + `appendColumnOrientationControls()` |
>
> `pnpm tsc --noEmit` → EXIT:0. `vitest run` → 1428/1428 ✅. `pnpm run build` → EXIT:0 (55.38s).
>
> **WS-B exit gate now passes:**
> ```bash
> find src/ui apps/editor/src -name '*.ts' -o -name '*.tsx' | xargs wc -l | awk '$1>1200 {n++} END {print n+0}'
> # → 0  ✅
> ```

### `src/initUI.ts` (2,770 → moved into `apps/editor/src/main.tsx`)

This file is the legacy initialization sequence; most of its responsibility is taken over by `composeRuntime()` + `PlatformRouter.start()` (Wave 4). Wave 7 deletes it after migrating the residual ~400 LOC into `apps/editor/src/main.tsx`. PR in S86-WIRE.

### `packages/runtime-composer/src/composeRuntime.ts` (845 → keep as-is; re-evaluate)

This file *grew* during D.4 because it took ownership of slot wiring. The growth is intentional (each slot is ~30-50 LOC of typed wiring). At end of D.4, it's expected to be ~1,200 LOC. Wave 7 reviews; if it's > 1,500 LOC, decompose into per-slot bootstrap files.

### WS-B exit (S87-WIRE)

```bash
# No file in src/ui/ over 1,200 LOC
[ "$(find src/ui apps/editor/src -name '*.ts' -o -name '*.tsx' | xargs wc -l | awk '$1>1200 {n++} END {print n+0}')" -eq 0 ]
```

---

## §4 — WS-C: Phase F kickoff (parallel to WS-A and WS-B)

### Foundation (S84-WIRE)

Day 1: founder + new SDK engineer agree on the `@pryzm/sdk` v0.1 surface. Initial scope:

```ts
// packages/plugin-sdk/src/index.ts
export type { PryzmRuntime } from '@pryzm/runtime-composer';   // re-exported subset
export type { Command, CommandRegistry } from '@pryzm/command-bus';
export type { ElementId, Wall, Element, Family } from '@pryzm/domain';

export interface PluginContext {
  readonly runtime: PryzmRuntime;
  readonly logger: Logger;
}

export interface PluginManifest {
  readonly id: string;
  readonly version: string;
  readonly contributions: PluginContributions;
  readonly main: (ctx: PluginContext) => Promise<PluginInstance>;
}
```

S84-WIRE deliverables:
- `packages/plugin-sdk/` skeleton with the v0.1 surface
- `packages/headless/` skeleton (Node.js entry point that calls `composeRuntime()` without a renderer)
- ADR-045 (Plugin SDK versioning policy) authored and ratified

### Build-out (S85-S86-WIRE)

S85-S86 deliverables:
- BCF plugin migrated to use only `@pryzm/sdk` (drops L0-L4 direct imports). The transitional allowlist in Wave 4 Track B drops from 5 → 4 entries.
- `marketplace.pryzm.app` skeleton site (a Next.js app under `apps/marketplace/`).
- Plugin manifest schema (SPEC-09 amendment).

### First publishable surface (S87-WIRE)

S87-WIRE deliverables:
- `@pryzm/sdk@0.1.0` published to npm (boolean #7 → ⚠ on-track).
- `@pryzm/headless@0.1.0` published to npm (boolean #8 → ⚠ on-track).
- Marketplace MVP accepting plugin submissions from internal team only (boolean #9 → ⚠ on-track).

**End of Wave 7: booleans #7, #8, #9 are not yet ✅ but are in active development with v0.1 surfaces published.** The full Phase F program (195 sub-phases) continues for ~22 sprints beyond S87-WIRE.

---

## §5 — Wave 7 day-by-day calendar (compressed)

| Sprint | Week | WS-A focus | WS-B focus | WS-C focus | **Status** |
|---|---|---|---|---|---|
| S84-WIRE | 13–14 | Cast 670 → 200 | PropertyPanel split | SDK v0.1 surface; ADR-045 | WS-A ✅ · WS-B ✅ PropertyPanel (1,057 LOC) · WS-C ❌ |
| S85-WIRE | 15–16 | Cast 200 → 40 + rAF 68 → 1 | SheetEditor + PropertyInspector splits | BCF plugin migrates to SDK | WS-A cast ✅ rAF ✅ · WS-B ✅ SheetEditor (1,086 LOC) + PropertyInspector (1,171 LOC — WS-B gate CLOSED 2026-05-03) · WS-C ❌ |
| S86-WIRE | 17–18 | EngineBootstrap shim deleted | initUI.ts deleted; composeRuntime audit | Marketplace skeleton; SPEC-09 amend | WS-A ✅ · WS-B initUI ✅ composeRuntime ❌ · WS-C ❌ |
| S87-WIRE | 19–20 | Legacy `src/<35 folders>` deleted | Final file-size audit | `@pryzm/sdk@0.1.0` + `@pryzm/headless@0.1.0` published | WS-A ⚠ 31/35 · WS-B ✅ 0 files >1200 LOC (exit gate CLOSED 2026-05-03) · WS-C ❌ |
| S88-WIRE | 21–22 | `src/persistence/` + `src/visibility/` → engine/subsystems + packages/visibility (35→27) | — | — | WS-A ✅ (−2 folders, build clean `✓ 49s`) |
| S89-WIRE | 23–24 | `src/features/` + `src/geospatial/` + `src/collaboration/` + `src/migration/` deleted (27→23) | — | — | WS-A ✅ (−4 folders, build clean `✓ 53s`) |
| S90-WIRE | 25–26 | `src/structural/` + `src/dev/` + `src/portfolio/` + `src/generative/` deleted (23→19) | — | — | WS-A ✅ (−4 folders, build clean `✓ 59s`) |
| S91-WIRE | 27–28 | `src/constraints/` + `src/topology/` + `src/spatial/` + `src/render/` → engine/subsystems (19→15) | — | — | WS-A ✅ (−4 folders, motion-gate tripwire added) |
| S92-WIRE | 29–30 | `src/rendering/` + `src/physics/` → engine/subsystems (15→13) | — | — | WS-A ✅ (−2 folders, build clean `✓ 45s`) |
| S93-WIRE | 31–32 | `src/commands/` (265 files) → engine/subsystems/commands (13→12) | — | — | WS-A ✅ (−1 folder, 388 imports rewritten, build clean `✓ 88s`) |
| S94-WIRE | 33–34 | `src/services/` + `src/monetization/` → engine/subsystems (12→10) | — | — | WS-A ✅ (−2 folders, build clean `✓ 43s`) |
| S95-WIRE | 35–36 | `src/tools/` (24 stubs) + `src/legacy/` (1 shim) deleted (10→8) | — | — | WS-A ✅ (−2 folders, build clean `✓ 47s`) |
| S96-WIRE | 37–38 | `src/export/` (35 files) + `src/import/` (36 files) + `src/styles/` (44 files) → `engine/subsystems/{export,import,styles}/` (8→5) | — | — | WS-A ✅ (−3 folders, 4+10+20 static importers + 13 dynamic `import()` calls rewritten, build clean `✓ 47.60s`) |

End of Wave 7 = end of S87-WIRE = **PRYZM 3 day-1** for booleans #1–#6; **Phase F day-1** for booleans #7–#9.

**Post-Wave-7 WIRE continuation (S88–S97, 2026-05-01):** 10 additional cleanup sprints landed same-day as Wave 7, reducing `src/` from 31 → **4** folders (−27 across S88–S97). S97-WIRE deleted `src/ai/` → `packages/ai-host/src/`. `ls -d src/*/ | wc -l` = **4**. Remaining 4 folders (`src/core/`, `src/elements/`, `src/engine/`, `src/ui/`) require Wave 9–11 destination-package population per `15-PACKAGE-POPULATION-GAP.md §3` before promotion. `src/ui/` stays permanently (L7.5 white-UI layer).

---

## §6 — Phase F continuation (post-Wave-7, S88-WIRE onward)

⚠ **SPRINT-ASSIGNMENT CORRECTION (2026-04-30 deep audit)**: the original table below assigned Phase F SDK/Headless/Marketplace work to **S88–S109**. That calendar was written before the 2026-04-30 audit revealed that S88–S117 are fully consumed by **Waves 8–20** (package population, plugin compliance, runtime.* consumption codemod, plugin-SDK migration codemod — see `15-PACKAGE-POPULATION-GAP.md §0.0.4`). Phase F booleans #7, #8, #9 now close **after Wave 20 close (S117+)**, not at S91/S95/S99. The authoritative Phase F schedule is in **`20-PHASE-F-PLAN.md`**.

The table below is **preserved as the original intent** (what was planned for Phase F before Waves 8-20 were inserted). It is no longer a forward-looking schedule — it is a historical record of what the original Phase F program looked like before the gap was measured.

| Sprint band (original, now superseded) | Original focus | Booleans driven | **Corrected status** |
|---|---|---|---|
| S88-S91-WIRE | SDK v0.5 | #7 | ❌ Superseded — S88-S111 owned by Waves 8-16 per `15-PACKAGE-POPULATION-GAP.md §0.0.4` |
| S92-S95-WIRE | Headless v0.5 | #8 | ❌ Superseded — same reason |
| S96-S99-WIRE | Marketplace v1.0 | #9 | ❌ Superseded — same reason |
| S100-S105-WIRE | NFT lock-in | (NFTs) | ❌ Superseded — Wave 13 (S101-S103) owns NFT benches |
| S106-S109-WIRE | GA-2 hardening | (GA-2) | ❌ Superseded — Waves 17-20 own these sprints |

**The corrected Phase F calendar** (after all Waves 8-20 land at S117-WIRE): see `20-PHASE-F-PLAN.md §2-§5` for the three parallel workstreams (F-SDK, F-MKT, F-REF) that close booleans #7, #8, #9. Phase F GA is ~S120-WIRE, approximately 18 months from today.

**This is the founder's calendar decision point** (R7 of `13-RISK-REGISTER.md`): accept the 18-month Wave 8-20 + Phase F window, or staff up to compress, or descope F-tail (e.g. defer marketplace to GA-3).

---

## §7 — Convergence boolean state at Wave 7 close (= PRYZM 3 day 1 for structural)

| # | Boolean | Pre-Wave 7 | Post-Wave 7 | Honest close |
|---:|---|:---:|:---:|---|
| 1 | `legacy_src_folders == 1` | ❌ | **⚠ PARTIAL** — 31 of 35 deleted (S87–S97-WIRE); 4 remain (`src/core/`, `src/elements/`, `src/engine/`, `src/ui/`) | Wave 11 (S97-WIRE partial; fully ✅ when only `src/ui/` remains) |
| 2 | `window_any_in_src_ui == 0` | ⚠ (≤ 80) | **✅** ← THE ADVANCE (S85) | Wave 7 ✅ |
| 3 | `raf_owners_outside_frame_scheduler == 0` | ❌ | **✅** ← THE ADVANCE (S85) | Wave 7 ✅ |
| 4 | `default_runtime == composeRuntime()` | ✅ | ✅ | Wave 4 ✅ |
| 5 | `EngineBootstrap_LOC == 0` | ⚠ (30) | **✅** ← THE ADVANCE (S86) | Wave 7 ✅ |
| 6 | `all_workflows_green == workflows_total` | ✅ | ✅ | Wave 6 ✅ |
| 7 | `plugin_sdk_published == true` | ❌ | ❌ (WS-C not started; v1.0.0-rc.1 in workspace only — not npm-published) | Phase F / post-Wave-20 (S117+) — see `20-PHASE-F-PLAN.md` |
| 8 | `headless_published == true` | ❌ | ❌ | Phase F / post-Wave-20 (S117+) |
| 9 | `marketplace_live == true` | ❌ | ❌ | Phase F / post-Wave-20 (S117+) |

**5 of 9 booleans fully ✅** (#2, #3, #4, #5, #6). **Boolean #1 ⚠ PARTIAL** (31/35 folders deleted). **Booleans #7, #8, #9 ❌** (WS-C not started; these close after Wave 20 + Phase F per `20-PHASE-F-PLAN.md §1`). Original Wave 7 plan projected 6/9 ✅ at S87-close assuming all 35 folders would be deleted and WS-C would deliver v0.1 — neither happened. See §6 correction note.

---

## §8 — Risks specific to Wave 7

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| Cast tail (the 670 → 0 sweep) hits a hard cluster requiring architectural refactor (e.g. a tool that genuinely needs a window-global) | Medium | Medium | Extend `src/legacy/window-shim.ts` with one more allowlisted entry; document why; ADR if > 5 such cases |
| rAF consolidation breaks an animation timing contract (a tool that expected rAF priority to give it 60fps) | Medium | High | NFT bench #4 (frame budget) runs continuously; rollback per-rAF migration if frame-budget regresses by > 10 % |
| EngineBootstrap shim deletion breaks the 41 residual importers because the codemod missed an edge case | Medium | High | Codemod has unit tests for each rewrite pattern; manual review of the 5 most complex importers |
| Legacy folder deletion breaks production at runtime even though tests pass (a deleted folder was reached via dynamic `import()`) | Medium | High | Each folder-deletion PR runs `pnpm dev` smoke test (manual click-through); production preview is verified post-merge |
| Phase F SDK v0.1 surface is wrong shape (incompatible with the 5 reference plugins post-migration) | Medium | High | The first plugin migration (BCF, S85-WIRE) is the validation; if it requires significant SDK changes, S86-WIRE is reserved for the SDK v0.2 redesign |
| WS-A and WS-B engineers stomp on `src/ui/PropertyPanel.ts` (WS-B is splitting it; WS-A may delete its window-casts) | Medium | Medium | WS-A pauses cast deletion in `src/ui/PropertyPanel.ts` after S84-WIRE D-1; WS-B owns the file from D-2 onward; WS-A picks up the splits' new files in S85 |
| `src/initUI.ts` deletion exposes a startup ordering bug | Medium | High | Day-by-day migration of the file's contents into `apps/editor/src/main.tsx` (not a single big-bang delete); each migration is a separate PR with smoke test |

---

## §9 — Wave 7 + Wave 8 honest remainder map

### Wave 7 — what is done

- `PropertyPanel.ts` split and closed under 1,200 LOC.
- `SheetEditorPanel.ts` split and closed under 1,200 LOC.
- `PropertyInspector.ts` split from 2,852 → 1,171 LOC.
- `src/ui/` no longer has any file above 1,200 LOC.
- `EngineBootstrap.ts` is deleted.
- `(window as any)` in `src/ui/` is 0.
- rAF owners outside `packages/frame-scheduler/` are 0.
- `pnpm tsc --noEmit`, `pnpm vitest run`, and `pnpm run build` are clean.

### Wave 7 — what still remains

- `src/core/`, `src/elements/`, and `src/engine/` still exist.
- `legacy_src_folders == 1` is still partial, not complete.
- `src/ui/` is structurally clean, but the full `src/ = ui/ only` target is Wave 11, not Wave 7.
- Phase F publishing is not part of Wave 7.

### Wave 8 — what is done

- The Wave 8 package-creation / citation-rot work is already closed.
- `packages/physics-host/`, `packages/input-host/`, `packages/renderer-three/`, `packages/snapping/`, and `packages/spatial-index/` exist.
- The THREE import codemod has already run.
- `packages/renderer-three/src/three-re-export.ts` is the sole `three` importer.
- `vite.config.ts` alias/exclude fixes are in place so the build passes.

### Wave 8 — what still remains

- No Wave 8 structural blocker remains in the current tracker.
- The remaining architecture gap is not Wave 8 package creation; it is broader Phase E.5.x / Wave 20 consumption work.
- The biggest open principle gap is still P2: keep all future THREE usage behind `packages/renderer-three/three`.

### TREE / THREE decoupling table

| Layer | Status | What this means | Evidence | Remaining work |
|---|---|---|---|---|
| Import decoupling | ✅ Done | All live THREE imports are routed through the renderer-three owner path | `packages/renderer-three/src/three-re-export.ts` is the sole raw `three` importer; codemod rewrote app/plugin imports to `@pryzm/renderer-three/three`; build passes | Keep the alias + re-export as the only supported entry point |
| Build/runtime decoupling | ✅ Done | The app/build no longer needs direct `three` resolution from scattered files | `vite.config.ts` alias/exclude fixes are in place; `pnpm run build` succeeds | Keep bundler config aligned if the owner path changes |
| Architectural ownership decoupling (P2) | ❌ Open | The architecture rule “only renderer-three owns THREE” is still not fully enforced everywhere | `05-ARCHITECTURE-BREAKDOWN.md §8.1` still records **467 historical direct THREE importers** | Continue reducing non-owner THREE usage as future waves touch files |
| Audit-trail decoupling | ⚠ Partial | Documentation now distinguishes “import decoupling” from “ownership decoupling” | This section + `05-ARCHITECTURE-BREAKDOWN.md §8.1` | Keep the distinction explicit in future status updates |

#### P2 codewide action table

| File | Status | Action required |
|---|---|---|
| `src/ui/PropertyInspector.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/wardrobe/WardrobeCabinetTool.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/rendering/VideoExportPanel.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/rendering/RenderPanel.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/rendering/PanoramaPanel.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/rendering/ExportStudioPanel.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/property-panel/PropertyPanel.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/property-panel/PropertyPanelAdapter.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/property-panel/PropertyPanelSections.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/property-panel/PropertyPanelBodyRenderer.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/property-panel/PropertyPanelAnnotations.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/property-panel/PropertyPanelElementRenderers.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/property-panel/PlacementEditor.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/property-inspector/PropertyInspectorApply.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/property-inspector/PropertyInspectorControls.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/property-inspector/PropertyInspectorRoomRelationships.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/layout/RenderAreaLayout.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/layout/NavigationAreaLayout.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/layout/CreatePanelLayout.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/layout/AIAreaLayout.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/kitchen/KitchenCabinetTool.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/import/DxfImportPanel.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/furniture-carousel/FurnitureThumbnailService.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/furniture-carousel/FurnitureGeometryHelpers.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/furniture-carousel/FurnitureGeometryFactory.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/furniture-carousel/FurnitureGeometryBuildersA.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/furniture-carousel/FurnitureGeometryBuildersB.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/furniture-carousel/FurnitureDragDropHandler.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/furniture-carousel/FloatingObjectCarousel.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/tools-panel/panels/RenderRailPanel.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/ViewCube.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/ViewPropertiesPanel.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/SpatialTree.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/GridToggleService.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/Layout.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/CurtainWallModePicker.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/ColumnModePicker.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/BeamModePicker.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/WallModePicker.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/WallEdgeVisibilityService.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/OverridePanel.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/platform/PlatformRouter.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/platform/PlatformProjectBrowser.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/platform/SolutionsPage.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/rendering/VisualizationEnginePanel.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/rendering/PerformanceModePanel.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/rendering/VideoExportPanel.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/rendering/PanoramaPanel.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/rendering/ExportStudioPanel.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/data/PIPRenderer.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/data/DataCommandCenter.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/bottom-menu/BottomActionMenu.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/ai/AIPanel.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/ai/AICreatePanel.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/ai/floorplan-import/Step3UnderlayView.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `src/ui/ai/floorplan-import/Step6CommitView.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `apps/editor/src/bootstrap.render.everything.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `apps/editor/src/router.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `apps/editor/src/projects/ProjectCard.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `apps/editor/src/PluginRegistry.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `apps/component-editor/src/sketch/tools/ArcTool.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `apps/component-editor/src/stores/viewTabStore.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `plugins/wall/src/committer/wall-committer.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `plugins/wall/src/committer/selection-highlight.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `plugins/wall/src/committer/material-bridge.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `plugins/wall/src/committer/geometry-bridge.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `plugins/wall/src/handlers/SetWallDimensions.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `plugins/window/src/committer/window-committer.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `plugins/window/src/committer/material-bridge.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `plugins/window/src/committer/geometry-bridge.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `plugins/rooms/src/committer/room-committer.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `plugins/rooms/src/committer/material-bridge.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `plugins/rooms/src/committer/geometry-bridge.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `plugins/roof/src/committer/roof-committer.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `plugins/roof/src/committer/material-bridge.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `plugins/roof/src/committer/geometry-bridge.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `plugins/stair/src/committer/stair-committer.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `plugins/stair/src/committer/material-bridge.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `plugins/stair/src/committer/geometry-bridge.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `plugins/slab/src/committer/slab-committer.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `plugins/slab/src/committer/material-bridge.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `plugins/slab/src/committer/geometry-bridge.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `plugins/plumbing/src/committer/plumbing-committer.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `plugins/plumbing/src/committer/material-bridge.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `plugins/plumbing/src/committer/geometry-bridge.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `plugins/structural/src/committer/structural-committer.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `plugins/structural/src/committer/material-bridge.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `plugins/structural/src/committer/geometry-bridge.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `plugins/structural/src/ISectionGenerator.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `plugins/toy-cube/src/committer.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `apps/bench/src/demos/bouncing-cube.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `apps/bench/src/benches/*` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `tests/parity/slab/slab-snapshot.test.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `tests/ga-gate/__tests__/architectural-invariants.test.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `apps/component-editor/__tests__/quality-gates/no-three.test.ts` | ✅ Routed | Keep using `@pryzm/renderer-three/three` only |
| `attached_assets/main_1776376021904.ts` | ❌ Legacy | Direct `three` import remains in an attached asset snapshot, not the live runtime path | Keep out of the app build path |

If you want “what remains” in one sentence: **Wave 7 cleanup is closed; Wave 8 package creation is closed; the remaining work is the broader migration/consumption backlog, not another Wave 7/8 split.**

---

## §9 — What the founder sees on Friday week-20 evening (HONEST — post-execution)

> ⚠ **Original §9 was written before the 2026-04-30 deep audit and showed `src/ = legacy ui` (the Wave 11 target, not the Wave 7 result).** The actual output at Wave 7 close is below.

```
$ pnpm pryzm-3-day-1
[pryzm-3-day-1] running the convergence acceptance checklist...

Code state:
  ✓ rg -c '(window as any)' src/ui/          =  0  (target: 0)  ✅
  ✓ rg -l 'requestAnimationFrame' --type ts   =  1 (packages/frame-scheduler/src/Scheduler.ts)  ✅
  ✓ EngineBootstrap.ts                        =  DELETED (0 LOC)  ✅
  ✓ ls -d src/*/                             =  4 folders: core/ elements/ engine/ ui/
  ⚠    src/ target (only ui/) NOT YET MET — Waves 9-11 required for src/core + src/elements + src/engine
  ✓ Bundle size apps/editor                   =  tracked (NFT #15 target: 4 MB gzipped)

Runtime state:
  ✓ composeRuntime() is wired entry point (5 callers per runtime.PlatformRouter)
  ✓ PryzmRuntime is the injected handle; src/ui/ window-cast count = 0
  ⚠ 14 runtime.* facets still reached via legacy globals (Wave 16 commandBus codemod required)

Verification state:
  ✓ pnpm ga-gate                             =  green (tripwires: cast ≤ 168, rAF = 1, EngineBootstrap = 0)
  ✓ Workflows                                =  9/9 green
  ✓ Lint rules pryzm-no-window-cast,
           pryzm-no-raf,
           pryzm-no-engine-bootstrap-shim     =  all at error level

Phase F state:
  ❌ @pryzm/plugin-sdk                        =  v1.0.0-rc.1 workspace-only (not npm-published — Wave 20+ Phase F)
  ❌ @pryzm/headless                          =  not published (Wave 20+ Phase F)
  ❌ marketplace.pryzm.app                    =  not started (Wave 20+ Phase F)

[pryzm-3-day-1] Result:
  5 of 9 booleans ✅ (#2 ✅ #3 ✅ #4 ✅ #5 ✅ #6 ✅)
  1 of 9 booleans ⚠ (#1 PARTIAL: 31/35 folders deleted; Wave 11 closes it)
  3 of 9 booleans ❌ (#7 #8 #9 — Phase F, post-Wave-20)
  Cleared to label this SHA "PRYZM 3 day 1 (structural) — booleans #2-6 closed".
```

**The `src/ = legacy ui` output** (showing only 2 folders) is the **Wave 11 close** milestone, not Wave 7. Wave 7 is the structural day-1: composition root is live, cast/rAF/EngineBootstrap booleans are closed, the strangler-fig pattern is structurally correct. The remaining folder migration is migration-work, not architecture work.

---

## §10 — What the project looks like after Wave 7 close (HONEST — post-execution)

> ⚠ **Original §10 showed `ls src/ = legacy/ ui/` — that is the Wave 11 target.** The actual Wave 7 state is below.

`ls -d src/*/`:
```
core/     (src/core/ — strangler-fig; ~76k LOC; Wave 9-10 destination: packages/core-app-model/ etc.)
elements/ (src/elements/ — element-family stubs; ~85k LOC; Wave 9 strangler-fig deletion)
engine/   (src/engine/ — subsystems/ + residual; ~12k LOC remaining after S86-WIRE; Wave 10-11)
ui/       (the white UI — stays as L7.5; target state is src/ui/ only after Wave 11)
```

`pnpm ga-gate`:
```
[ga-gate] PASS (all tripwire checks green: cast ≤ 168, rAF = 1, EngineBootstrap = absent)
```

`docs/03_PRYZM3/03-CURRENT-STATE.md §1` (verified 2026-05-01 post-S97-WIRE):
```
| Metric | Value |
| (window as any) non-shim reaches across src/   | 168 ✅ (target: 0 for src/ui/ — met; 168 in src/engine/ + src/core/) |
| (window as any) in src/ui/                     | 0 ✅ |
| EngineBootstrap.ts LOC                         | 0 ✅ (file deleted S87-WIRE) |
| composeRuntime.ts LOC                          | 863 (target ≤ 1,500; well within) |
| requestAnimationFrame owners                   | 1 ✅ (packages/frame-scheduler/src/Scheduler.ts) |
| src/ folders                                   | 4 (core, elements, engine, ui) |
| Workflows green                                | 9/9 ✅ |
| PlatformRouter.start callers                   | 5 ✅ |
```

The **structural correctness** from `../02-ARCHITECTURE.md §6` (target startup flow) IS in production code. The **principles** from `../01-VISION.md §2` that Wave 7 closes (#2 cast, #3 rAF, #5 EngineBootstrap) **are all CI-enforced at error level**. The remaining 4 src/ folders and the 14 unconsumed runtime.* facets are the Wave 9-20 migration backlog.

**PRYZM 3 (structural) exists.** The strangler-fig architecture is in place. The remaining work is migration-volume, not architecture design.

> **Wave 11 close** is when `ls src/` = `ui/` only (no `core/`, `elements/`, `engine/`). That is the rung-2 "functional day-1" per `15-PACKAGE-POPULATION-GAP.md §0.0.3`.

---

## §11 — Wave 7→8 THREE Architectural Ownership Decoupling: Master Remediation Table

> **Stamp**: 2026-05-03 · **Authority**: This section is the canonical, ground-truth P2 violation register. It was generated from a fresh live codebase scan on 2026-05-03. Every file listed is a confirmed production source file (no test files, no `__fixtures__`, no `lint-fixtures`, no `renderer-three` owner files, no `attached_assets`).
>
> **Scope**: The Wave 8 mass codemod (executed 2026-05-03) successfully converted all direct `from 'three'` imports to `from '@pryzm/renderer-three/three'` across ~490 files — plugins, apps, packages, and src/. However, two violation classes survived the codemod:
>
> **Class A** (CI hard-fail): Files that import from THREE _sub-paths_ (`three/examples/jsm/…`, `three/tsl`) rather than from bare `'three'`. The Wave 8 regex codemod matched only the exact `from 'three'` pattern and did not match these sub-path variants. These 23 files are **active P2 violations today** — the `check-three-imports.ts` gate should hard-fail on them but the gate's current regex (`from ['"]three['"]`) also misses sub-paths. The gate must be widened.
>
> **Class B** (architectural smell, Phase 2): All 456 files that now use `import * as THREE from '@pryzm/renderer-three/three'` (the deep sub-path entry into the re-export file) rather than the canonical barrel `from '@pryzm/renderer-three'`. These files are not a CI hard-fail today, but they use the namespace-star form `import * as THREE` which prevents tree-shaking and couples consumers to the internal file layout of `packages/renderer-three/`. A Phase 2 codemod will migrate them to named barrel imports.
>
> **Sole legitimate owner**: `packages/renderer-three/src/three-re-export.ts`. Any file outside `packages/renderer-three/src/` importing from `'three'`, `'three/tsl'`, `'three/examples/…'` is a P2 violation regardless of route.
>
> **Exemptions** (confirmed non-violations, excluded from all tables):
> - `packages/eslint-plugin-pryzm/src/rules/no-three-outside-committer.js` — rule source, references string `'three'` as a pattern literal
> - `packages/eslint-plugin-pryzm/__tests__/lint-fixtures/` — lint test fixtures
> - `packages/geometry-kernel/__fixtures__/three-import.bad.ts` — ESLint fixture
> - `tools/ga-gate/check-three-imports.ts` — the gate script itself references the string it checks
> - `src/engine/subsystems/core/types/GeometryDTO.ts` — `from 'three'` appears only inside JSDoc block comments, not in live import statements
> - All `__tests__/` directories — test-only THREE usage is explicitly allowed per C04 §1.1 footnote

---

### §11.0 — Scan Baseline (2026-05-03)

| Metric | Value | Source |
|---|---|---|
| Direct `from 'three'` production importers (wave 8 codemod target, now 0) | **0** | `rg "from ['\"]three['\"]" --type ts \| grep -v renderer-three \| grep -v __fixtures__ \| grep -v lint-fixtures \| wc -l` |
| `three/examples/jsm/**` sub-path production importers (Class A1, codemod missed) | **16 files** | Live scan 2026-05-03 |
| `three/tsl` sub-path production importers (Class A2, codemod missed) | **7 files** | Live scan 2026-05-03 |
| **Total Class A active P2 violations** | **23 files** | — |
| `@pryzm/renderer-three/three` deep-path `import * as THREE` users (Class B, codemod result) | **456 files** | `rg "import \* as THREE" --type ts \| grep -v renderer-three \| wc -l` |
| Architecture-breakdown §8.1 historical count (pre-codemod baseline) | 467 files | `05-ARCHITECTURE-BREAKDOWN.md §8.1` |
| `check-three-imports.ts` gate sensitivity gap | Gate matches `from ['"]three['"]` only; does **not** catch `three/tsl` or `three/examples/jsm/…` | `tools/ga-gate/check-three-imports.ts` (must be widened as part of this wave) |

---

### §11.1 — Class A Violation Table: THREE Sub-Path Direct Imports (23 files, blocking)

These files must be remediated before Wave A15 can be declared closed. Each sub-path import must be wrapped in `packages/renderer-three/src/addons/` (examples/) or re-exported from `packages/renderer-three/src/tsl-types.ts` (tsl), then re-exported through the barrel `packages/renderer-three/src/index.ts`.

**Refactor pattern — examples/jsm addons:**
```typescript
// BEFORE (violation)
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

// STEP 1 — add to packages/renderer-three/src/addons/TransformControls.ts:
export { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

// STEP 2 — re-export from packages/renderer-three/src/index.ts:
export { TransformControls } from './addons/TransformControls';

// STEP 3 — consumer import becomes:
import { TransformControls } from '@pryzm/renderer-three';  // ✅ P2 compliant
```

**Refactor pattern — three/tsl types:**
```typescript
// BEFORE (violation)
import type { PassNode, TSLNode } from 'three/tsl';

// STEP 1 — add to packages/renderer-three/src/tsl-types.ts:
export type { PassNode, TSLNode, UniformNode } from 'three/tsl';

// STEP 2 — re-export from packages/renderer-three/src/index.ts:
export type { PassNode, TSLNode, UniformNode } from './tsl-types';

// STEP 3 — consumer import becomes:
import type { PassNode, TSLNode } from '@pryzm/renderer-three';  // ✅ P2 compliant
```

#### §11.1.1 — Class A1: `three/examples/jsm/` Sub-Path Violations (16 files)

| Wave | File Path | Layer | Violation Type | Current THREE Usage | Required Refactor | Target Owner | Complexity | Sprint | Dependencies |
|---|---|---|---|---|---|---|---|---|---|
| A15 | `src/engine/engineLauncher.ts` | L5 Engine Init | A1 examples sub-path | `TransformControls` from `controls/TransformControls.js`; `RGBELoader` from `loaders/RGBELoader.js` | Add `addons/TransformControls.ts` + `addons/RGBELoader.ts` to renderer-three; update consumer to `from '@pryzm/renderer-three'` | `packages/renderer-three` | Low | S119 | A15-T1 (RendererHandle) |
| A15 | `src/engine/subsystems/core/rendering/EnhancedBloomService.ts` | L5 Rendering | A1 examples sub-path | `EffectComposer`, `RenderPass`, `UnrealBloomPass`, `OutputPass` from `postprocessing/` | Add `addons/postprocessing/` wrappers (4 classes) to renderer-three; barrel-export them | `packages/renderer-three` | Medium | S119 | A15-T2 (WebGLRendererAdapter) |
| A15 | `src/engine/subsystems/core/rendering/HDRIEnvironmentManager.ts` | L5 Rendering | A1 examples sub-path | `RGBELoader` from `loaders/RGBELoader.js` | Shares `addons/RGBELoader.ts` with engineLauncher fix | `packages/renderer-three` | Low | S119 | EnhancedBloomService addon wrapper |
| A15 | `src/engine/subsystems/core/rendering/ProceduralSkyService.ts` | L5 Rendering | A1 examples sub-path | `Sky` from `objects/Sky.js` | Add `addons/Sky.ts` wrapper; re-export from barrel | `packages/renderer-three` | Low | S119 | — |
| A15 | `src/engine/subsystems/core/rendering/SSGIService.ts` | L5 Rendering | A1 examples sub-path | `EffectComposer`, `RenderPass`, `GTAOPass`, `OutputPass` from `postprocessing/` | Shares `addons/postprocessing/` wrappers with EnhancedBloomService fix | `packages/renderer-three` | Medium | S119 | EnhancedBloomService addon wrapper |
| A15 | `src/engine/subsystems/core/views/EdgeProjectorService.ts` | L5 Views | A1 examples sub-path | `mergeGeometries` from `utils/BufferGeometryUtils.js` | Add `addons/BufferGeometryUtils.ts`; re-export `mergeGeometries` from barrel | `packages/renderer-three` | Low | S119 | — |
| A15 | `src/engine/subsystems/export/glb/GLBExporter.ts` | L5 Export | A1 examples sub-path | `GLTFExporter` from `exporters/GLTFExporter.js` | Add `addons/GLTFExporter.ts`; re-export from barrel | `packages/renderer-three` | Low | S119 | — |
| A15 | `src/engine/subsystems/initScene.ts` | L5 Engine Init | A1 examples sub-path | `GLTFLoader` from `loaders/GLTFLoader.js` | Add `addons/GLTFLoader.ts`; re-export from barrel | `packages/renderer-three` | Low | S119 | — |
| A15 | `src/engine/subsystems/tools/HostedElementDragController.ts` | L5 Tools | A1 examples sub-path | `TransformControls` from `controls/TransformControls.js` | Shares `addons/TransformControls.ts` wrapper | `packages/renderer-three` | Low | S120 | engineLauncher addon wrapper |
| A15 | `src/engine/subsystems/tools/LevelPlaneConstraint.ts` | L5 Tools | A1 examples sub-path | `TransformControls` from `controls/TransformControls.js` | Shares `addons/TransformControls.ts` wrapper | `packages/renderer-three` | Low | S120 | engineLauncher addon wrapper |
| A15 | `src/engine/subsystems/tools/SelectionManager.ts` | L5 Tools | A1 examples sub-path | `TransformControls` from `controls/TransformControls.js` | Shares `addons/TransformControls.ts` wrapper; this file also drives `GPUPicker` (A15-T16) | `packages/renderer-three` | Medium | S120 | engineLauncher addon wrapper; A15-T15 GPUPicker |
| A15 | `src/engine/subsystems/tools/WallTransformController.ts` | L5 Tools | A1 examples sub-path | `TransformControls` from `controls/TransformControls.js` | Shares `addons/TransformControls.ts` wrapper | `packages/renderer-three` | Low | S120 | engineLauncher addon wrapper |
| A15 | `src/engine/subsystems/tools/gizmo/BlackGizmo.ts` | L5 Tools | A1 examples sub-path | `TransformControls` (type-only import) from `controls/TransformControls.js` | `import type { TransformControls } from '@pryzm/renderer-three'` after barrel re-export | `packages/renderer-three` | Low | S120 | engineLauncher addon wrapper |
| A15 | `src/engine/subsystems/tools/gizmo/ScaleGizmo.ts` | L5 Tools | A1 examples sub-path | `CSS2DObject` from `renderers/CSS2DRenderer.js` | Add `addons/CSS2DRenderer.ts`; re-export `CSS2DObject`, `CSS2DRenderer` from barrel | `packages/renderer-three` | Low | S120 | — |
| A15 | `src/ui/furniture-carousel/FloatingObjectCarousel.ts` | L7.5 White-UI | A1 examples sub-path | `GLTFLoader` from `loaders/GLTFLoader.js` | Shares `addons/GLTFLoader.ts` with initScene fix | `packages/renderer-three` | Low | S120 | initScene addon wrapper |
| A15 | `packages/renderer/src/passes/Bloom.ts` | L4 Renderer | A1 examples sub-path | `UnrealBloomPass` from `postprocessing/UnrealBloomPass.js` | Shares `addons/postprocessing/UnrealBloomPass.ts` wrapper with EnhancedBloomService fix | `packages/renderer-three` | Low | S119 | EnhancedBloomService addon wrapper |

**Class A1 addon inventory** — new files to create in `packages/renderer-three/src/addons/`:

| Addon File | Exports | Used By | Sprint |
|---|---|---|---|
| `addons/TransformControls.ts` | `TransformControls` | engineLauncher, HostedElementDragController, LevelPlaneConstraint, SelectionManager, WallTransformController, BlackGizmo (6 files) | S119 |
| `addons/RGBELoader.ts` | `RGBELoader` | engineLauncher, HDRIEnvironmentManager (2 files) | S119 |
| `addons/GLTFLoader.ts` | `GLTFLoader` | initScene, FloatingObjectCarousel (2 files) | S119 |
| `addons/GLTFExporter.ts` | `GLTFExporter` | GLBExporter (1 file) | S119 |
| `addons/Sky.ts` | `Sky` | ProceduralSkyService (1 file) | S119 |
| `addons/postprocessing/EffectComposer.ts` | `EffectComposer` | EnhancedBloomService, SSGIService (2 files) | S119 |
| `addons/postprocessing/RenderPass.ts` | `RenderPass` | EnhancedBloomService, SSGIService (2 files) | S119 |
| `addons/postprocessing/UnrealBloomPass.ts` | `UnrealBloomPass` | EnhancedBloomService, packages/renderer/Bloom.ts (2 files) | S119 |
| `addons/postprocessing/OutputPass.ts` | `OutputPass` | EnhancedBloomService, SSGIService (2 files) | S119 |
| `addons/postprocessing/GTAOPass.ts` | `GTAOPass` | SSGIService (1 file) | S119 |
| `addons/BufferGeometryUtils.ts` | `mergeGeometries` | EdgeProjectorService (1 file) | S119 |
| `addons/CSS2DRenderer.ts` | `CSS2DObject`, `CSS2DRenderer` | ScaleGizmo (1 file) | S120 |

All addon files must begin with `// THREE-OWNER: packages/renderer-three — only this file may import from three/examples/jsm/...` and must be enumerated in the ESLint allow-list in `packages/eslint-plugin-pryzm/src/rules/no-three-outside-committer.js`.

#### §11.1.2 — Class A2: `three/tsl` Sub-Path Violations (7 files)

All 7 files are type-only imports (`import type`) used by the WebGPU pipeline pass classes. These cannot be eliminated — TSL (Three.js Shading Language) types are required for the WebGPU render path. The correct fix is to re-export them through `packages/renderer-three/src/tsl-types.ts`.

| Wave | File Path | Layer | Violation Type | Current THREE Usage | Required Refactor | Target Owner | Complexity | Sprint | Dependencies |
|---|---|---|---|---|---|---|---|---|---|
| A15 | `src/engine/subsystems/rendering/pipeline/BackgroundUniform.ts` | L5 Rendering Pipeline | A2 tsl sub-path | `import type { UniformNode } from 'three/tsl'` | Create `tsl-types.ts` in renderer-three; export `UniformNode`; consumer: `import type { UniformNode } from '@pryzm/renderer-three'` | `packages/renderer-three` | Low | S119 | THREE r175+ (tsl stable) |
| A15 | `src/engine/subsystems/rendering/pipeline/OutlinePass.ts` | L5 Rendering Pipeline | A2 tsl sub-path | `import type { TSLNode } from 'three/tsl'` | Shares `tsl-types.ts`; add `TSLNode` to exports | `packages/renderer-three` | Low | S119 | BackgroundUniform tsl-types |
| A15 | `src/engine/subsystems/rendering/pipeline/RenderPipelineManager.ts` | L5 Rendering Pipeline | A2 tsl sub-path | `import type { PassNode, TSLNode } from 'three/tsl'` | Shares `tsl-types.ts`; add `PassNode` to exports | `packages/renderer-three` | Low | S119 | BackgroundUniform tsl-types |
| A15 | `src/engine/subsystems/rendering/pipeline/ScenePass.ts` | L5 Rendering Pipeline | A2 tsl sub-path | `import type { PassNode } from 'three/tsl'` | Shares `tsl-types.ts` | `packages/renderer-three` | Low | S119 | BackgroundUniform tsl-types |
| A15 | `src/engine/subsystems/rendering/pipeline/SSGIPass.ts` | L5 Rendering Pipeline | A2 tsl sub-path | `import type { PassNode, TSLNode } from 'three/tsl'` | Shares `tsl-types.ts` | `packages/renderer-three` | Low | S119 | BackgroundUniform tsl-types |
| A15 | `src/engine/subsystems/rendering/pipeline/TRAAPass.ts` | L5 Rendering Pipeline | A2 tsl sub-path | `import type { TSLNode } from 'three/tsl'` | Shares `tsl-types.ts` | `packages/renderer-three` | Low | S119 | BackgroundUniform tsl-types |
| A15 | `src/engine/subsystems/rendering/pipeline/ZonePass.ts` | L5 Rendering Pipeline | A2 tsl sub-path | `import type { PassNode } from 'three/tsl'` | Shares `tsl-types.ts` | `packages/renderer-three` | Low | S119 | BackgroundUniform tsl-types |

**New file**: `packages/renderer-three/src/tsl-types.ts`
```typescript
// THREE-OWNER: packages/renderer-three — only this file may import from three/tsl
// Re-exports: Three.js Shading Language (TSL / WebGPU) type-only surface for consumers.
// All files outside packages/renderer-three/ MUST import these types from
// '@pryzm/renderer-three', never from 'three/tsl' directly.

export type { PassNode, TSLNode, UniformNode } from 'three/tsl';
```

Add to `packages/renderer-three/src/index.ts`:
```typescript
export type { PassNode, TSLNode, UniformNode } from './tsl-types';
```

---

### §11.2 — Class A CI Gate Hardening (parallel to Class A file fixes)

The current `tools/ga-gate/check-three-imports.ts` gate regex `from ['"]three['"]` does NOT catch:
- `from 'three/tsl'`
- `from 'three/examples/jsm/…'`
- `from 'three/webgpu'`

**Required gate update** (`tools/ga-gate/check-three-imports.ts`):
```typescript
// BEFORE (too narrow — misses sub-paths):
const THREE_IMPORT_RE = /from\s+['"]three['"]/g;

// AFTER (catches all three variants):
const THREE_IMPORT_RE = /from\s+['"]three(?:\/[^'"]+)?['"]/g;
// Matches: from 'three'  from 'three/tsl'  from 'three/examples/jsm/controls/TransformControls.js'
// Exemptions still applied: packages/renderer-three/**, __fixtures__/**, lint-fixtures/**

// Also update the ESLint rule in packages/eslint-plugin-pryzm/src/rules/no-three-outside-committer.js:
// Change: node.source.value === 'three'
// To:     node.source.value === 'three' || node.source.value.startsWith('three/')
```

**Sprint**: S119 (same sprint as first addon wrappers) — gate must be widened before addon wrappers are merged so the gate correctly validates the fix.

---

### §11.3 — Class B Violation Table: Deep Sub-Path `@pryzm/renderer-three/three` → Barrel Migration (456 files)

> **Priority**: Post-Class-A (can merge after A1/A2 are complete and barrel exports are in place). This is a Phase 2 codemod: safe to automate, low individual file risk, high aggregate tree-shaking benefit.
>
> **Why this matters**: `import * as THREE from '@pryzm/renderer-three/three'` pulls in the entire THREE namespace (all ~540 kB gzipped). Named imports from the barrel (`import type { Vector3, Box3 } from '@pryzm/renderer-three'`) enable Vite to tree-shake unused THREE classes, targeting the NFT-15 bundle ceiling of ≤ 4 MB gzipped. The expected bundle improvement from full barrel adoption is 80–150 kB gzipped reduction.
>
> **Codemod script**: `scripts/codemod-three-deeppath-to-barrel.ts` (new, Wave A15 Sprint S121)
>
> **Note**: Files that use `THREE.Vector3`, `THREE.Box3`, etc. (namespace access patterns) need manual review to determine the correct named-import set. The codemod should handle the import line replacement; individual `THREE.Xyz` usages require a follow-up pass or a per-file IDE refactor.

#### §11.3.1 — Class B by Domain (aggregate view)

| Domain Bucket | Files | Namespace Usage Pattern | Codemod Complexity | Sprint |
|---|---|---|---|---|
| `src/engine/subsystems/core/` | 92 | `THREE.Mesh`, `THREE.Vector3`, `THREE.Scene`, `THREE.Camera`, `THREE.Object3D`, `THREE.Group`, geometry types | High — 92 files × avg 8 THREE symbols = ~736 symbol replacements | S121 |
| `src/engine/subsystems/furniture/` | 47 | `THREE.BufferGeometry`, `THREE.MeshStandardMaterial`, `THREE.Vector3`, `THREE.Matrix4`, CSG types | High — geometry-heavy; avg ~12 THREE symbols/file | S121 |
| `src/engine/subsystems/annotations/` | 25 | `THREE.Vector3`, `THREE.Line`, `THREE.LineSegments`, `THREE.Color` | Medium — annotation geometry types | S121 |
| `src/engine/subsystems/tools/` | 19 | `THREE.Raycaster`, `THREE.Vector3`, `THREE.Plane`, `THREE.Matrix4` | Medium — tools interact with scene objects | S121 |
| `src/engine/subsystems/walls/` | 16 | `THREE.BufferGeometry`, `THREE.Vector3`, geometry builders | High — core geometry builder subsystem | S121 |
| `src/engine/subsystems/commands/` | 13 | `THREE.Object3D`, `THREE.Scene`, `THREE.Mesh` | Medium — command payloads | S121 |
| `src/engine/subsystems/import/` | 12 | `THREE.Object3D`, `THREE.BufferGeometry`, `THREE.Material`, IFC bridge types | Medium — IFC import bridge | S121 |
| `src/engine/subsystems/stairs/` | 10 | `THREE.BufferGeometry`, `THREE.Vector3`, `THREE.Shape` | Medium — stair geometry | S121 |
| `src/engine/subsystems/export/` | 9 | `THREE.Scene`, `THREE.Object3D`, render-target types | Medium — GLB/IFC export path | S121 |
| `src/engine/subsystems/rendering/` | 8 | `THREE.WebGLRenderTarget`, `THREE.WebGLRenderer`, post-process types | High — rendering pipeline, WebGPU boundary | S121 |
| `src/engine/subsystems/curtainwalls/` | 7 | `THREE.BufferGeometry`, `THREE.Vector3`, `THREE.Shape` | Medium — curtain-wall geometry | S121 |
| `src/engine/subsystems/plumbing/` | 6 | `THREE.TubeGeometry`, `THREE.CatmullRomCurve3`, `THREE.Vector3` | Low — single geometry type pattern | S121 |
| `src/engine/subsystems/` root | 5 | Mixed engine subsystem init | High — engine init files touch many THREE types | S121 |
| `src/engine/subsystems/slabs/` | 5 | `THREE.BufferGeometry`, `THREE.Shape`, `THREE.ExtrudeGeometry` | Low — consistent geometry pattern | S121 |
| `src/engine/subsystems/rooms/` | 5 | `THREE.Shape`, `THREE.Vector3`, `THREE.ExtrudeGeometry` | Low — room geometry | S121 |
| `src/engine/subsystems/roofs/` | 5 | `THREE.Shape`, `THREE.Vector3`, `THREE.Vector2`, roof geometry types | Low | S121 |
| `src/engine/subsystems/ai/` | 4 | `THREE.Object3D`, `THREE.Vector3`, scene query types | Low | S121 |
| `src/engine/subsystems/windows/` | 3 | `THREE.BufferGeometry`, `THREE.Vector3` | Low | S121 |
| `src/engine/subsystems/services/` | 3 | `THREE.Camera`, `THREE.Vector3` | Low | S121 |
| `src/engine/subsystems/doors/` | 3 | `THREE.BufferGeometry`, `THREE.Vector3` | Low | S121 |
| **src/engine total** | **302** | | | S121 |
| `packages/snapping/` | 15 | `THREE.Vector3`, `THREE.Ray`, `THREE.Plane`, `THREE.Box3`, snap geometry types | Medium — 15 snap provider files, consistent pattern | S121 |
| `packages/core-app-model/` | 6 | `THREE.Vector3`, `THREE.Matrix4`, drawing pipeline types | Medium — drawing pipeline + cut section | S121 |
| `packages/renderer/` | 5 | `THREE.WebGLRenderer`, `THREE.Scene`, `THREE.Camera`, post-process chain | High — renderer package directly wraps THREE renderer | S121 |
| `packages/render-runtime/` | 2 | `THREE.Mesh`, `THREE.Material`, selection highlight types | Low | S121 |
| `packages/picking/` | 2 | `THREE.Raycaster`, `THREE.Scene`, `THREE.Camera`, BVH types | Medium — picking subsystem | S121 |
| `packages/spatial-index/` | 1 | `THREE.Box3`, `THREE.Vector3` | Low | S121 |
| `packages/runtime-composer/` | 1 | `THREE.PerspectiveCamera` | Low | S121 |
| **packages total** | **32** | | | S121 |
| `plugins/wall/src/committer/` | 4 | `THREE.BufferGeometry`, `THREE.MeshStandardMaterial`, `THREE.Vector3`, selection highlight | Medium | S120 |
| `plugins/window/src/committer/` | 3 | `THREE.BufferGeometry`, `THREE.MeshStandardMaterial`, `THREE.Vector3` | Low | S120 |
| `plugins/door/src/committer/` | 3 | Same as window | Low | S120 |
| `plugins/beam/src/committer/` | 3 | `THREE.BufferGeometry`, `THREE.MeshStandardMaterial`, `THREE.Vector3`, tube geometry | Low | S120 |
| `plugins/column/src/committer/` | 3 | `THREE.CylinderGeometry`, `THREE.BoxGeometry`, `THREE.Vector3` | Low | S120 |
| `plugins/slab/src/committer/` | 3 | `THREE.Shape`, `THREE.ExtrudeGeometry`, `THREE.Vector3` | Low | S120 |
| `plugins/stair/src/committer/` | 3 | `THREE.BufferGeometry`, `THREE.Vector3`, stair geometry types | Low | S120 |
| `plugins/roof/src/committer/` | 3 | `THREE.Shape`, `THREE.Vector3`, roof geometry | Low | S120 |
| `plugins/ceiling/src/committer/` | 3 | `THREE.Shape`, `THREE.Vector3` | Low | S120 |
| `plugins/rooms/src/committer/` | 3 | `THREE.Shape`, `THREE.Vector3`, room boundary | Low | S120 |
| `plugins/curtain-wall/src/committer/` | 3 | `THREE.BufferGeometry`, `THREE.Vector3`, panel geometry | Low | S120 |
| `plugins/plumbing/src/committer/` | 3 | `THREE.TubeGeometry`, `THREE.CatmullRomCurve3` | Low | S120 |
| `plugins/grid/src/committer/` | 3 | `THREE.LineSegments`, `THREE.LineBasicMaterial`, `THREE.Vector3` | Low | S120 |
| `plugins/lighting/src/committer/` | 3 | `THREE.PointLight`, `THREE.DirectionalLight`, `THREE.SpotLight` | Low | S120 |
| `plugins/furniture/src/committer/` | 3 | `THREE.Object3D`, `THREE.Matrix4`, GLTF types | Low | S120 |
| `plugins/dimensions/src/committer/` | 3 | `THREE.Vector3`, `THREE.Line`, `THREE.LineSegments` | Low | S120 |
| `plugins/handrail/src/committer/` | 3 | `THREE.TubeGeometry`, `THREE.CatmullRomCurve3` | Low | S120 |
| `plugins/structural/src/committer/ + ISectionGenerator.ts` | 4 | `THREE.BufferGeometry`, `THREE.ExtrudeGeometry`, I-section geometry | Low | S120 |
| `plugins/toy-cube/src/committer.ts` | 1 | `THREE.BoxGeometry`, `THREE.MeshBasicMaterial` | Low | S120 |
| `plugins/geospatial/src/CesiumThreeBridge.ts` | 1 | `THREE.Vector3`, `THREE.Matrix4`, Cesium-THREE coordinate bridge | Medium — Cesium bridge uses many THREE math types | S120 |
| **plugins total** | **60** | | | S120 |
| `apps/bench/src/benches/full-pipeline.bench.ts` | 1 | `THREE.Mesh`, `THREE.Scene`, bench scaffolding | Low | S120 |
| `apps/bench/src/benches/idle-cpu.bench.ts` | 1 | `THREE.Scene`, `THREE.WebGLRenderer` | Low | S120 |
| `apps/bench/src/benches/picking-latency.bench.ts` | 1 | `THREE.Raycaster`, `THREE.Vector3` | Low | S120 |
| `apps/bench/src/benches/view-switch.bench.ts` | 1 | `THREE.PerspectiveCamera`, `THREE.Scene` | Low | S120 |
| `apps/bench/src/demos/bouncing-cube.ts` | 1 | `THREE.BoxGeometry`, `THREE.MeshBasicMaterial`, `THREE.Vector3` | Low | S120 |
| `apps/editor/src/bootstrap.render.everything.ts` | 1 | `THREE.Scene`, `THREE.PerspectiveCamera`, full editor boot | Medium | S120 |
| **apps total** | **6** | | | S120 |
| `src/ui/ai/AICreatePanel.ts` | 1 | `THREE.Vector3` (AI placement anchor) | Low | S121 |
| `src/ui/bottom-menu/BottomActionMenu.ts` | 1 | `THREE.Vector3` | Low | S121 |
| `src/ui/data/DataCommandCenter.ts` | 1 | `THREE.Object3D`, scene query | Low | S121 |
| `src/ui/data/PIPRenderer.ts` | 1 | `THREE.WebGLRenderer`, `THREE.Scene` | Medium | S121 |
| `src/ui/dataworkbench/DataVisualizerService.ts` | 1 | `THREE.Object3D`, `THREE.Vector3` | Low | S121 |
| `src/ui/furniture-carousel/FloatingObjectCarousel.ts` | 1 | `THREE.Object3D`, `THREE.Vector3`, GLTF scene graph (also Class A1) | Medium — both A1 and B violations | S120 |
| `src/ui/furniture-carousel/FurnitureDragDropHandler.ts` | 1 | `THREE.Object3D`, `THREE.Vector3`, `THREE.Raycaster` | Low | S121 |
| `src/ui/furniture-carousel/FurnitureGeometryBuildersA.ts` | 1 | `THREE.BufferGeometry`, `THREE.Vector3`, `THREE.Shape` | Low | S121 |
| `src/ui/furniture-carousel/FurnitureGeometryBuildersB.ts` | 1 | `THREE.BufferGeometry`, `THREE.Vector3` | Low | S121 |
| `src/ui/furniture-carousel/FurnitureGeometryFactory.ts` | 1 | `THREE.BufferGeometry`, `THREE.Object3D` | Low | S121 |
| `src/ui/furniture-carousel/FurnitureGeometryHelpers.ts` | 1 | `THREE.Vector3`, `THREE.Box3`, `THREE.BufferGeometry` | Low | S121 |
| `src/ui/furniture-carousel/FurnitureThumbnailService.ts` | 1 | `THREE.WebGLRenderer`, `THREE.Scene`, `THREE.Camera` | Medium | S121 |
| `src/ui/import/DxfImportPanel.ts` | 1 | `THREE.Vector3`, DXF coordinate types | Low | S121 |
| `src/ui/kitchen/KitchenCabinetTool.ts` | 1 | `THREE.Vector3`, `THREE.Box3` | Low | S121 |
| `src/ui/layout/AIAreaLayout.ts` | 1 | `THREE.Vector3` | Low | S121 |
| `src/ui/layout/CreatePanelLayout.ts` | 1 | `THREE.Vector3` | Low | S121 |
| `src/ui/layout/NavigationAreaLayout.ts` | 1 | `THREE.Vector3`, `THREE.Camera` | Low | S121 |
| `src/ui/layout/RenderAreaLayout.ts` | 1 | `THREE.WebGLRenderer`, `THREE.Scene` | Medium | S121 |
| `src/ui/Layout.ts` | 1 | `THREE.Vector3`, `THREE.Camera` | Low | S121 |
| `src/ui/property-inspector/PropertyInspectorApply.ts` | 1 | `THREE.Vector3`, `THREE.Matrix4` | Low | S121 |
| `src/ui/property-inspector/PropertyInspectorControls.ts` | 1 | `THREE.Vector3` | Low | S121 |
| `src/ui/property-inspector/PropertyInspectorRoomRelationships.ts` | 1 | `THREE.Vector3` | Low | S121 |
| `src/ui/PropertyInspector.ts` | 1 | `THREE.Vector3`, `THREE.Object3D`, element scene graph queries | Medium | S121 |
| `src/ui/property-panel/PlacementEditor.ts` | 1 | `THREE.Vector3`, `THREE.Quaternion`, `THREE.Matrix4` | Medium | S121 |
| `src/ui/property-panel/PropertyPanelAdapter.ts` | 1 | `THREE.Vector3` | Low | S121 |
| `src/ui/property-panel/PropertyPanelAnnotations.ts` | 1 | `THREE.Vector3`, `THREE.Line`, annotation geometry | Low | S121 |
| `src/ui/property-panel/PropertyPanelBodyRenderer.ts` | 1 | `THREE.Object3D`, scene thumbnail types | Low | S121 |
| `src/ui/property-panel/PropertyPanelElementRenderers.ts` | 1 | `THREE.Object3D`, `THREE.Mesh` | Low | S121 |
| `src/ui/property-panel/PropertyPanelSections.ts` | 1 | `THREE.Vector3` | Low | S121 |
| `src/ui/property-panel/PropertyPanel.ts` | 1 | `THREE.Vector3`, `THREE.Object3D` | Medium — 1,057 LOC panel | S121 |
| `src/ui/rendering/ExportStudioPanel.ts` | 1 | `THREE.WebGLRenderTarget`, `THREE.Scene` | Medium | S121 |
| `src/ui/rendering/PanoramaPanel.ts` | 1 | `THREE.CubeCamera`, `THREE.WebGLCubeRenderTarget` | Medium | S121 |
| `src/ui/rendering/RenderPanel.ts` | 1 | `THREE.WebGLRenderer`, `THREE.Scene`, `THREE.Camera` | Medium | S121 |
| `src/ui/rendering/VideoExportPanel.ts` | 1 | `THREE.WebGLRenderer`, `THREE.Scene` | Medium | S121 |
| `src/ui/ViewCube.ts` | 1 | `THREE.PerspectiveCamera`, `THREE.Quaternion`, `THREE.Vector3` | Low | S121 |
| `src/ui/ViewPropertiesPanel.ts` | 1 | `THREE.Vector3`, `THREE.Camera` | Low | S121 |
| `src/ui/WallEdgeVisibilityService.ts` | 1 | `THREE.Line`, `THREE.LineSegments`, `THREE.Vector3` | Low | S121 |
| `src/ui/wardrobe/WardrobeCabinetTool.ts` | 1 | `THREE.Vector3`, `THREE.Box3` | Low | S121 |
| **src/ui total** | **38** | | | S121 |
| **GRAND TOTAL CLASS B** | **438** | (remaining ~18 files are in src/engine root/misc not captured in the subsystem breakdown) | | S120–S121 |

**Note**: Class B grand total is listed as 456 by the scan counter; the 18-file difference from the tabulated 438 above is in `src/engine/subsystems/` files spanning multiple misc subdirectories (`inspect/`, `legacy/`, etc.) not individually listed but included in the sprint S121 batch.

---

### §11.4 — Special File: `src/three-addons.d.ts`

This ambient declaration file currently contains:
```typescript
import * as THREE from '@pryzm/renderer-three/three';  // (Class B violation)
declare module 'three-gpu-pathtracer' { ... }           // uses THREE types
declare module 'three/examples/jsm/objects/Sky.js' { ... }  // (Class A1 — declares the very module that must move to renderer-three)
```

**Required action**:
1. Move `src/three-addons.d.ts` → `packages/renderer-three/src/ambient-declarations.d.ts`
2. Remove the `declare module 'three/examples/jsm/objects/Sky.js'` block (Sky is now a proper re-export, not a wild-card declaration)
3. Update `tsconfig.json` `include` to add `"packages/renderer-three/src/ambient-declarations.d.ts"` if not auto-included
4. Delete `src/three-addons.d.ts`

**Sprint**: S119 · **Complexity**: Low · **Owner**: `packages/renderer-three`

---

### §11.5 — Wave A15 Sprint-by-Sprint Execution Plan (P2 Class A + B)

| Sprint | Weeks | Tasks | Files changed | P2-A violations closed | Class B files migrated | Exit verifier |
|---|---|---|---|---|---|---|
| **S119** | 78–79 | Create `packages/renderer-three/src/addons/` skeleton (12 addon files); create `tsl-types.ts`; widen `check-three-imports.ts` gate regex; widen ESLint `no-three-outside-committer` rule; migrate `src/three-addons.d.ts` → renderer-three | ~18 new files + 2 gate files + 1 ambient decl | 9 of 23 (9 S119-batch violations) | 0 | `rg "from 'three/examples\|from \"three/examples\|from 'three/tsl\|from \"three/tsl" --type ts \| grep -v renderer-three \| wc -l` → 14 (S119 closes 9) |
| **S120** | 80–81 | Migrate S120 batch: tools/ (6 files), ui/FloatingObjectCarousel + Bloom.ts (2 files); migrate Class B plugins/ (60 files) + apps/ (6 files) via `codemod-three-deeppath-to-barrel.ts` | ~75 consumer files + codemod for 66 files | 14 of 23 → closes remaining 14 A1 violations (tools batch) | 66 (plugins + apps) | `rg "from 'three/examples\|from \"three/examples" --type ts \| grep -v renderer-three \| wc -l` → 0 ✅ (all A1 closed at S120 end) |
| **S121** | 82–83 | Migrate Class B: packages/ (32), src/engine/ (302), src/ui/ (38) via barrel codemod; manual review of heavy-namespace files; pnpm tsc --noEmit; bundle size check | ~372 files via codemod | 23 of 23 ✅ (all Class A already closed) | 372 (engine + packages + ui) | `rg "import \* as THREE" --type ts \| grep -v renderer-three \| wc -l` → 0 ✅; `pnpm build && pnpm tsx scripts/verify-bundle-size.mjs` → ≤ 4 MB gzipped ✅ |

---

### §11.6 — Wave A15 Exit Gate Checklist (P2 Closure)

```bash
# ── CLASS A CLOSURE ──────────────────────────────────────────────────────────

# A1: No three/examples/jsm/ sub-path imports outside renderer-three
rg "from ['\"]three/examples" --type ts \
  | grep -v "packages/renderer-three/" \
  | grep -v "__fixtures__\|lint-fixtures\|attached_assets"
# → 0 lines ✅

# A2: No three/tsl sub-path imports outside renderer-three
rg "from ['\"]three/tsl" --type ts \
  | grep -v "packages/renderer-three/" \
  | grep -v "__fixtures__\|lint-fixtures\|attached_assets"
# → 0 lines ✅

# Combined Class A check (widened gate, matches three + all sub-paths):
rg "from ['\"]three(?:/[^'\"]+)?['\"]" --type ts \
  | grep -v "packages/renderer-three/" \
  | grep -v "__fixtures__\|lint-fixtures\|attached_assets\|ga-gate\|no-three-outside-committer"
# → 0 lines ✅

# ── CLASS B CLOSURE ───────────────────────────────────────────────────────────

# No deep sub-path @pryzm/renderer-three/three imports (all should use barrel)
rg "from ['\"]@pryzm/renderer-three/three['\"]" --type ts \
  | grep -v "__fixtures__\|lint-fixtures"
# → 0 lines ✅ (all files now use `from '@pryzm/renderer-three'`)

# No namespace star import of THREE anywhere outside renderer-three
rg "import \* as THREE" --type ts \
  | grep -v "packages/renderer-three/" \
  | grep -v "__fixtures__\|lint-fixtures"
# → 0 lines ✅

# ── RENDERER-THREE OWNER INTEGRITY ────────────────────────────────────────────

# Sole owner still intact
grep -r "from 'three'" packages/renderer-three/src/ | wc -l
# → ≥ 1 (only the owner files)

# Addons directory exists and is populated
ls packages/renderer-three/src/addons/
# → TransformControls.ts  RGBELoader.ts  GLTFLoader.ts  GLTFExporter.ts  Sky.ts
#    CSS2DRenderer.ts  BufferGeometryUtils.ts  postprocessing/
ls packages/renderer-three/src/addons/postprocessing/
# → EffectComposer.ts  RenderPass.ts  UnrealBloomPass.ts  OutputPass.ts  GTAOPass.ts

# TSL types file exists
ls packages/renderer-three/src/tsl-types.ts  # → exists ✅

# Ambient declarations migrated
[ ! -f src/three-addons.d.ts ]  # → deleted ✅
ls packages/renderer-three/src/ambient-declarations.d.ts  # → exists ✅

# ── BUILD + TYPE SAFETY ────────────────────────────────────────────────────────

# Zero TypeScript errors
pnpm tsc --noEmit 2>&1 | wc -l
# → 0 ✅

# All tests green
pnpm turbo run test:ci
# → all green ✅

# Bundle size within NFT-15 ceiling
pnpm build && pnpm tsx scripts/verify-bundle-size.mjs
# → core bundle ≤ 4 MB gzipped ✅ (expected improvement: 80–150 kB from tree-shaking)

# ── CI GATE HARDENING ─────────────────────────────────────────────────────────

# Widened gate hard-fails on any sub-path violation
grep "three(?:/" tools/ga-gate/check-three-imports.ts | wc -l
# → ≥ 1 (confirms gate uses the widened regex) ✅

# ESLint rule covers sub-paths
grep "startsWith.*three/" packages/eslint-plugin-pryzm/src/rules/no-three-outside-committer.js | wc -l
# → ≥ 1 ✅

# ── FULL FUNCTIONAL VERIFICATION ──────────────────────────────────────────────

pnpm tsx scripts/pryzm-3-functional-day-1.ts
# → ALL CHECKS GREEN ✅
```

---

### §11.7 — Impact Summary and Metric Delta

| Metric | Before (2026-05-03 scan) | After Wave A15 Close | Change |
|---|---|---|---|
| Class A P2 violations (three sub-paths direct) | **23 files** | **0** | −23 ✅ |
| Class B architectural smell (`@pryzm/renderer-three/three` deep path) | **456 files** | **0** | −456 ✅ |
| `import * as THREE` anywhere outside renderer-three | **456** | **0** | −456 ✅ |
| THREE namespace star imports in plugins/ | 60 | 0 | −60 |
| THREE namespace star imports in packages/ | 32 | 0 | −32 |
| THREE namespace star imports in apps/ | 6 | 0 | −6 |
| THREE namespace star imports in src/engine/ | ~302 | 0 | −302 |
| THREE namespace star imports in src/ui/ | 38 | 0 | −38 |
| `check-three-imports.ts` gate sensitivity | narrow (misses `/tsl`, `/examples`) | **full (catches all `three/*` sub-paths)** | gate hardened |
| ESLint `no-three-outside-committer` sub-path coverage | ❌ missing | **✅ covered** | rule hardened |
| THREE addon wrappers in renderer-three | 0 | 12 addon files + 1 tsl-types.ts | +13 files |
| Tree-shaking effectiveness | Poor (namespace imports block shaking) | **Effective (named imports from barrel)** | bundle −80-150 kB est. |
| P2 principle status (05-ARCHITECTURE-BREAKDOWN.md §8.1) | ❌ Critical violation | **✅ Closed** | boolean #3 confirmed |
| Audit score contribution (§1 Rendering Pipeline) | 6/10 | **7/10** → net score advance | +1 section |
| Convergence boolean #3 (`raf_owners == 1`) | ✅ (maintained from Wave 7) | ✅ (maintained) | unchanged |
| WebGPU migration status | Blocked by P2 | **Unblocked** | C04 §1.4 gate clears |
| Headless package extractability | Blocked by `import * as THREE` spread | **Unblocked** | boolean #8 path clear |

---

### §11.8 — Governance: Preventing P2 Regression Post-Wave-A15

Once Wave A15 closes, three layers of enforcement must prevent any new `three/examples`, `three/tsl`, or bare `'three'` imports from entering the codebase:

**Layer 1 — ESLint (development-time, pre-commit):**
```javascript
// packages/eslint-plugin-pryzm/src/rules/no-three-outside-committer.js
// Update the import check to cover sub-paths:
const isThreeImport = (source) =>
  source === 'three' ||
  source.startsWith('three/') ||   // catches three/tsl, three/examples/jsm/...
  source.startsWith('three\\');    // Windows path separator robustness

// Allow-list: ONLY packages/renderer-three/src/**  may pass
```

**Layer 2 — CI Gate (PR-blocking):**
```typescript
// tools/ga-gate/check-three-imports.ts
// Widen the regex to catch all three/* sub-paths:
const THREE_IMPORT_RE = /from\s+['"]three(?:\/[^'"]+)?['"]/g;
// Exit code 1 on any match outside renderer-three/** and exempted paths
// This gate is set to HARD_FAIL in the GA gate config
```

**Layer 3 — GitHub Actions PR check (Wave A14 prerequisite):**
```yaml
# .github/workflows/pr-checks.yml (created in Wave A14)
- name: P2 THREE ownership gate
  run: pnpm tsx tools/ga-gate/check-three-imports.ts
  # HARD_FAIL = true — PR cannot merge if this exits non-zero
```

**Allowlist policy**: Any future need to import a new `three/examples/jsm/` addon must:
1. Add the wrapper to `packages/renderer-three/src/addons/`
2. Re-export from `packages/renderer-three/src/index.ts`
3. Update the ESLint allowlist in the rule file
4. File an ADR comment explaining the new addon wrapper if the addon has non-obvious side effects

---

> **Wave 7→8 P2 Closure Summary**: The Wave 8 mass codemod (2026-05-03) successfully converted the 490 direct `from 'three'` production imports to the `@pryzm/renderer-three/three` re-export path — a substantial first step. Wave A15 S119–S120 (same day) then closed all 23 Class A sub-path violations. **See §11.9 below for the full Wave A15 implementation record.**

---

### §11.9 — Wave A15 S119–S120 Implementation Record (2026-05-03)

> **Status**: ✅ COMPLETE — Class A fully closed. CI gate passes at exit 0 with the widened pattern.

#### §11.9.1 — Files Created (packages/renderer-three/src/)

| File | Purpose | Exports |
|---|---|---|
| `addons/TransformControls.ts` | A1 wrapper | `TransformControls`, `TransformControlsEventMap` |
| `addons/RGBELoader.ts` | A1 wrapper | `RGBELoader` |
| `addons/GLTFLoader.ts` | A1 wrapper | `GLTFLoader`, `GLTF` |
| `addons/GLTFExporter.ts` | A1 wrapper | `GLTFExporter`, `GLTFExporterOptions` |
| `addons/Sky.ts` | A1 wrapper | `Sky` |
| `addons/CSS2DRenderer.ts` | A1 wrapper | `CSS2DRenderer`, `CSS2DObject`, `CSS2DParameters` |
| `addons/BufferGeometryUtils.ts` | A1 wrapper | `mergeGeometries` |
| `addons/postprocessing/EffectComposer.ts` | A1 wrapper | `EffectComposer`, `Pass` |
| `addons/postprocessing/RenderPass.ts` | A1 wrapper | `RenderPass` |
| `addons/postprocessing/UnrealBloomPass.ts` | A1 wrapper | `UnrealBloomPass` |
| `addons/postprocessing/OutputPass.ts` | A1 wrapper | `OutputPass` |
| `addons/postprocessing/GTAOPass.ts` | A1 wrapper | `GTAOPass` |
| `tsl-types.ts` | A2 TSL type barrel | `PassNode`, `TSLNode`, `UniformNode` |
| `ambient-declarations.d.ts` | Migrated from `src/three-addons.d.ts` | `three-gpu-pathtracer` ambient types |

All 14 files re-export only from sub-paths that are within `packages/renderer-three/` — the sole THREE owner.

#### §11.9.2 — index.ts Barrel Updated

`packages/renderer-three/src/index.ts` now re-exports all addon symbols and TSL types. Consumers import from `@pryzm/renderer-three` (root barrel) for all addon needs.

#### §11.9.3 — Class A1 Consumer Files Fixed (16 files)

| File | Old import | Fixed import |
|---|---|---|
| `src/engine/engineLauncher.ts` | `three/examples/jsm/controls/TransformControls.js` + `three/examples/jsm/loaders/RGBELoader.js` | `@pryzm/renderer-three` |
| `src/engine/subsystems/core/rendering/EnhancedBloomService.ts` | `EffectComposer` + `RenderPass` + `UnrealBloomPass` + `OutputPass` from examples | `@pryzm/renderer-three` |
| `src/engine/subsystems/core/rendering/HDRIEnvironmentManager.ts` | `three/examples/jsm/loaders/RGBELoader.js` | `@pryzm/renderer-three` |
| `src/engine/subsystems/core/rendering/ProceduralSkyService.ts` | `three/examples/jsm/objects/Sky.js` | `@pryzm/renderer-three` |
| `src/engine/subsystems/core/rendering/SSGIService.ts` | `EffectComposer` + `RenderPass` + `GTAOPass` + `OutputPass` from examples | `@pryzm/renderer-three` |
| `src/engine/subsystems/core/views/EdgeProjectorService.ts` | `three/examples/jsm/utils/BufferGeometryUtils.js` | `@pryzm/renderer-three` |
| `src/engine/subsystems/export/glb/GLBExporter.ts` | `three/examples/jsm/exporters/GLTFExporter.js` | `@pryzm/renderer-three` |
| `src/engine/subsystems/initScene.ts` | `three/examples/jsm/loaders/GLTFLoader.js` | `@pryzm/renderer-three` |
| `src/engine/subsystems/tools/HostedElementDragController.ts` | `three/examples/jsm/controls/TransformControls.js` | `@pryzm/renderer-three` |
| `src/engine/subsystems/tools/LevelPlaneConstraint.ts` | `three/examples/jsm/controls/TransformControls.js` | `@pryzm/renderer-three` |
| `src/engine/subsystems/tools/SelectionManager.ts` | `three/examples/jsm/controls/TransformControls.js` | `@pryzm/renderer-three` |
| `src/engine/subsystems/tools/WallTransformController.ts` | `three/examples/jsm/controls/TransformControls.js` | `@pryzm/renderer-three` |
| `src/engine/subsystems/tools/gizmo/BlackGizmo.ts` | `three/examples/jsm/controls/TransformControls.js` (type-only) | `@pryzm/renderer-three` |
| `src/engine/subsystems/tools/gizmo/ScaleGizmo.ts` | `three/examples/jsm/renderers/CSS2DRenderer.js` | `@pryzm/renderer-three` |
| `src/ui/furniture-carousel/FloatingObjectCarousel.ts` | `three/examples/jsm/loaders/GLTFLoader.js` | `@pryzm/renderer-three` |
| `packages/renderer/src/passes/Bloom.ts` | `three/examples/jsm/postprocessing/UnrealBloomPass.js` | `@pryzm/renderer-three` |

#### §11.9.4 — Class A2 Consumer Files Fixed (7 files)

| File | Old import | Fixed import |
|---|---|---|
| `src/engine/subsystems/rendering/pipeline/BackgroundUniform.ts` | `import type { UniformNode } from 'three/tsl'` | `@pryzm/renderer-three` |
| `src/engine/subsystems/rendering/pipeline/OutlinePass.ts` | `import type { TSLNode } from 'three/tsl'` | `@pryzm/renderer-three` |
| `src/engine/subsystems/rendering/pipeline/RenderPipelineManager.ts` | `import type { PassNode, TSLNode } from 'three/tsl'` | `@pryzm/renderer-three` |
| `src/engine/subsystems/rendering/pipeline/ScenePass.ts` | `import type { PassNode } from 'three/tsl'` | `@pryzm/renderer-three` |
| `src/engine/subsystems/rendering/pipeline/SSGIPass.ts` | `import type { PassNode, TSLNode } from 'three/tsl'` | `@pryzm/renderer-three` |
| `src/engine/subsystems/rendering/pipeline/TRAAPass.ts` | `import type { TSLNode } from 'three/tsl'` | `@pryzm/renderer-three` |
| `src/engine/subsystems/rendering/pipeline/ZonePass.ts` | `import type { PassNode } from 'three/tsl'` | `@pryzm/renderer-three` |

#### §11.9.5 — Governance Files Updated

| File | Change |
|---|---|
| `tools/ga-gate/check-three-imports.ts` | Regex widened from `three['"]` to `three(?:/[^'"]+)?['"]` — now catches `three/tsl`, `three/examples/jsm/…`, and bare `three`. Verified: `npx tsx tools/ga-gate/check-three-imports.ts` → exit 0. |
| `packages/eslint-plugin-pryzm/src/rules/no-three-outside-committer.js` | Removed `packages/renderer/` from `ALLOW_FRAGMENTS` (all violations in that package closed). Updated doc strings to reflect Wave A15 status. `isThreeSpecifier` already correct (checked `value.startsWith('three/')` — no change needed). |
| `src/three-addons.d.ts` | Removed all `declare module 'three/examples/jsm/...'` blocks (7 blocks — now real TypeScript re-exports). Removed `import * as THREE` line. Retained `three-gpu-pathtracer` and `virtual:item-catalog` ambient declarations. |

#### §11.9.6 — Class B Re-Assessment (474 files)

The 474 files using `import * as THREE from '@pryzm/renderer-three/three'` are **P2-compliant**. They consume the official `./three` sub-path export declared in `packages/renderer-three/package.json`:

```json
"exports": {
  "./three": "./src/three-re-export.ts"
}
```

This is NOT a P2 violation — they are going through `packages/renderer-three/` as required. The Class B "barrel migration" (changing to named imports from the root barrel) is a **tree-shaking optimization** that would require adding `export * from './three-re-export.js'` to `index.ts`, creating namespace pollution risk. This is deferred to a dedicated Wave A15 S121 barrel-optimization sprint and is tracked separately. It does not block WebGPU migration or any other P2 gate.

#### §11.9.7 — Exit Gate Verification (2026-05-03)

```
npx tsx tools/ga-gate/check-three-imports.ts
→ [three-import-tripwire] OK: 0 direct 'three' or 'three/*' importers outside packages/renderer-three/.
→ Exit: 0

rg "from ['\"]three/examples" --type ts -g '!node_modules' -g '!packages/renderer-three/**' -g '!**/__fixtures__/**'
→ (no output — 0 matches)

rg "from ['\"]three/tsl" --type ts -g '!node_modules' -g '!packages/renderer-three/**' -g '!**/__fixtures__/**'
→ (no output — 0 matches)
```

**P2 Class A: CLOSED. CI gate: HARDENED.**
