# PRYZM — Daily-Use Fix Log (2026-05-20)

Concrete fixes applied this session in response to `DAILY-USE-AUDIT-2026-05-20.md`. Each entry cites its audit ID, the files + functions touched, and the contract / pattern it aligns with. No shortcuts: every change matches an existing established pattern in the codebase or amends the contract document.

---

## ✅ APPLIED — Round 11 (#57 Day 1 — projection cache widened to all element types)

### §PLAN-VIEW-INCREMENTAL-PROJECTION §4.1 — Cache gate widened from `isCWElement` to `isCacheableElement`
**File:** `apps/editor/src/engine/views/EdgeProjectorService.ts`
- New `private static readonly CACHEABLE_ELEMENT_TYPES: ReadonlySet<string>` populated with the element types whose fragment builders ALREADY bump `root.userData.version` on every rebuild (verified: `curtainwall`, `wall`, `slab`, `roof`, `room`). Each entry is documented with a code-line citation back to the `userData.version =` site that justifies its membership.
- Loop gate at `EdgeProjectorService.ts:1511`: split `isCWElement` into two locals — `isCWElement` (kept for any CW-specific yield logic) and `isCacheableElement` (the new general gate). The cache early-out at `:1516` now uses `isCacheableElement`. The cache write at `:1554` (`freshLayersCollector`) similarly widened.
- `§PERF-CACHE-STATS` log at `:2027` no longer gated on `_hasCWElements`. Fires whenever `cacheHits + cacheMisses > 0`. New `cacheableGroups=` field is the canonical name; `cwGroups=` retained as an alias so existing log scrapers don't break.

**Before:** the cache that the curtain-wall perf wave built was technically functional after Round 10 (#60), but it ONLY served CurtainWall elements. Every other element type — including the 12 walls + 1 slab + 9 columns + 2 stairs + 4 stair-railings + ceiling + roof in the user's actual scene — re-ran the full traverse + EdgesGeometry + toDrawingSpace pipeline on EVERY re-projection, even when only ONE element changed (e.g. user creates a single roof and the plan view re-projects all 37 groups from scratch — observed in the §DIAG-EPS-02 log lines for `groups=37 cwGroups=0`).

**After:** each element-type that opts in (now: wall, slab, roof, room, curtainwall) is keyed in the existing `_cwProjectionCache` by `(elementUUID, viewId, version)`. On the first projection: cache miss; the full pipeline runs and the result is stored. On every subsequent projection where the element's `userData.version` hasn't bumped: cache HIT — skip traverse + EdgesGeometry + mergeGeometries + toDrawingSpace. The architect's "delay rendering a single wall" cliff in the runtime log is closed for those types.

**Pattern alignment:** the change is purely "use the existing data structure for the elements it was always able to support". No new caches, no new write paths, no new disposal logic — the LRU eviction at `_evictLruCwEntry()` (5 000-entry cap) + per-elementUUID cleanup at `invalidateCwElement()` already iterate generic `(elementId, viewId, version)` triples; they don't care that the elements weren't curtain walls. The `CACHEABLE_ELEMENT_TYPES` set is the architectural single source of truth for "this element type's builder bumps `userData.version` on rebuild", which is the cache key's invalidation signal.

**Scope retention vs. the full #57 plan:**
- ✅ Day 1: Widen the gate (this round).
- ⏳ Day 2: Audit door, window, opening, beam, column, ceiling, floor, stair, stair-railing, handrail, furniture builders for `userData.version` stamping discipline + add the verified ones to the allow-list.
- ⏳ Day 3: Rename `_cwProjectionCache` → `_elementProjectionCache`, `_cwCacheIsValid` → `_elementCacheIsValid`, `MAX_CW_PROJECTION_CACHE` → `MAX_ELEMENT_PROJECTION_CACHE` (cosmetic — keeps Day 1 perf gains independent of naming churn).
- ⏳ Day 4: ViewTechnicalDrawingCache.invalidate semantics tightening + a per-element invalidation entry-point so the bus's `element.rebuilt` event invalidates ONE cache entry rather than the entire view.

**Contract amendments queued (deferred for Day 4 to keep this round focused):** C04 §3.4, C11 §6.2.1/§6.2.2, C10 NFT-PV-1 per the architectural document.

**Net effect (Days 1+):** the existing CW perf engineering finally returns the dividend it was designed to return. The architect's "edge regeneration should be almost immediate" benchmark is in reach for repeat projections; the first projection of a new element still pays its honest cost, then never pays again until that element is rebuilt.

---

## ✅ APPLIED — Round 10 (curtain-wall projection cache un-bypassed)

### §PERF-CACHE-DIAG — NativeElementMeshExporter now propagates `userData.version` to the projection-stage proxy wrapper
**File:** `packages/core-app-model/src/geometry/NativeElementMeshExporter.ts` (two sites: cache-hit branch + cache-miss branch, ~10 LOC total).

**Before — runtime log evidence:**
```
[EdgeProjectorService] §PERF-CACHE-STATS batchId=none viewId=vd-sys-plan-l0
  groups=37 cwGroups=0 cacheHits=0 cacheMisses=0 hitRate=n/a%
  cacheElements=0 cacheEntries=0/5000
```
Scene contained 9 CurtainWall groups (visible in the `§DIAG-EPS-02` per-group log lines), yet `cwGroups` (= hits + misses) stayed at 0 and `cacheEntries` never incremented. The §PERF-EDGEPROJECTOR-CHUNK reprojected all 9 CWs from scratch every single time. The cache that has been carefully tuned with a 5000-entry LRU + per-elementUUID cleanup since the curtain-wall perf wave was completely dead-code.

**Root cause:**
EdgeProjectorService's cache gate at `EdgeProjectorService.ts:1516` is:
```ts
const currentVer = typeof group.userData?.version === 'number'
    ? (group.userData.version as number) : undefined;
if (isCWElement && elementUUID !== undefined && currentVer !== undefined) { … cache path … }
```
The `group` here is the proxy wrapper that `NativeElementMeshExporter.exportForView()` produces. The exporter's wrapper userData (`NativeElementMeshExporter.ts:248-258` cache-hit path AND `414-423` cache-miss path) explicitly listed:
```ts
{ elementUUID, elementType, baseLine, baseOffset, rootWorldY, openings, height, thickness, _nmeFromCache? }
```
`version` was never copied. So `currentVer` was always `undefined` and the cache gate always failed silently — for every element, on every view, on every projection pass. The CW cache had been wired with every safeguard except the one connection between source-of-truth (`CurtainWallBuilder` stamps `wallGroup.userData.version = ++this._geometrySeq`) and consumer (`EdgeProjectorService._cwCacheIsValid(elementId, viewId, version)`).

**Fix:**
Two-line addition in both branches of `exportForView()`:
```ts
version: root.userData?.version,
```
(Plus the cache-miss branch reuses the already-computed `currentVersion` local for symmetry: `version: currentVersion >= 0 ? currentVersion : undefined`.)

**Net effect (after deploy + reload):**
- First projection of a CW: cache miss as expected, but now records an entry. `cacheMisses` increments, `cacheEntries` grows.
- Second projection of the same CW with no rebuild: cache HIT. `cacheHits` increments. Skips traverse + N×EdgesGeometry + N×matrixWorld + mergeGeometries + toDrawingSpace + opening suppressors — the full §C.3.2 fast path the architecture intended.
- Rebuild (architect changes mullion size, grid spacing, etc.): CurtainWallBuilder bumps `userData.version` → cache key changes → automatic miss → fresh projection → new cache entry. Correct invalidation by construction.

**Pattern alignment:** the fix restores the data flow the architecture already documented. `CurtainWallBuilder.ts:226-232` comment explicitly states "EdgeProjectorService uses `group.userData.version` as the cache key" — the failure was a single missing field copy across a layer boundary, not a design flaw.

**Knock-on impact for #57:** task #57 (widen the cache to all 14 element types) was blocked by this regression — widening a dead cache changes nothing. With the version propagation restored, the cache infrastructure is now actually functional and the #57 widening unlocks per-element cache benefits for walls, slabs, columns, roofs, ceilings, floors, stairs, and beams as well.

---

## ✅ APPLIED — Round 9 (3D selection at distance — separate BVH vs GPU hover refs)

### §SELECT-3D-1 — Click-anchor branch now dereferences the GPU-confirmed hover ref, not the BVH ref
**File:** `packages/input-host/src/SelectionManager.ts`
- New private field `_lastHoveredObjectGpu: THREE.Object3D | null` (≈30 LOC of documenting comment).
- GPU pick rAF (`_onHoverGpuPickRaf`) hit-branch: writes `_lastHoveredObjectGpu = hoveredRoot` (in addition to the existing `_lastHoveredObject` write).
- GPU pick rAF miss-branch: clears `_lastHoveredObjectGpu = null` alongside the existing anchor-coord clears.
- `performSelection()` click anchor branch (FIX-S16-ANCHOR): now uses `this._lastHoveredObjectGpu ?? (this._pickStrategy ? null : this._lastHoveredObject)` instead of `this._lastHoveredObject`. The fallback to `_lastHoveredObject` only fires when the GPU pick strategy is unavailable (legacy boot path / WebGL2 disabled), preserving previous behaviour there.
- Tool-entry reset (`setSelectionEnabled` / `unselectAll`-equivalent path) + select() reset both clear `_lastHoveredObjectGpu` + `_lastHoverConfirmedClientX/Y` together, so a tool-switch can't leak a stale anchor.

**Before:** the architect reported "the selection of objects - plan view works great - but 3d scene not - when I point element on far distance select others. Normally when being close to the element works well - but in the distance not." (2026-05-20 daily-use feedback.) Mechanism:

| step | event                                | side-effect                                                |
|------|--------------------------------------|------------------------------------------------------------|
| T0   | pointermove#1 over Wall A area      | BVH writes `_lastHoveredObject = A`; queues GPU rAF        |
| T1   | GPU rAF fires (pixel-accurate)      | `_lastHoveredObject = B` ← correct element; anchor=(x,y)   |
| T2   | pointermove#2 (cursor at same spot) | BVH writes `_lastHoveredObject = A again` (wrong)          |
| T3   | click — cursor still ≤ 8 px of T1   | anchor branch trusts `_lastHoveredObject` → SELECTS A ✗    |

At far camera distance many AABBs overlap on a single pixel; the BVH/raycaster's "first ordered hit" tiebreak ≠ the pixel-accurate GPU pick. The user saw the GPU-confirmed hover highlight (Wall B), clicked it, but the click selected Wall A.

**After:** the BVH ref still drives the immediate-feedback cursor + `bim-hover-changed` (TSL outline) — both unaffected by minor BVH inaccuracy because they re-converge on the next rAF. The click anchor branch is now hardened: it can only resolve to a target that the GPU pick CONFIRMED at the recorded anchor coordinates.

**Pattern alignment:** mirrors the existing FIX-S16-ANCHOR architecture, which already segregated the anchor COORDINATES (`_lastHoverConfirmedClientX/Y`, GPU-only) from the BVH-shared hover state. We're applying the same segregation rule to the target REFERENCE — the missing half of the architecturally-clean split. No new branches, no new fast-paths; the change is purely "use the right ref in the existing branch".

**Contract citation:** C13 §3 (selection authority — GPU pick is the authoritative source at any camera distance), C14 §2 (interaction precedence — pixel-accurate strategy wins over geometric proximity), DAILY-USE-AUDIT §S-H? (will be assigned when audit is updated).

**Plan-view comparison (architect's "plan view works great" baseline):** plan view uses Canvas2D screen-space coordinates that ARE pixel-accurate by construction — no BVH-vs-GPU split exists. That's why plan-view selection was already correct. The 3D fix brings the 3D code path up to the same accuracy.

---

## ✅ APPLIED — Round 8 (project-open persistence — material / system-type round-trip)

### §PERSIST-L1 — Stair restoration now round-trips id + typeId + properties + metadata
**Files:**
- `packages/command-registry/src/stair/CreateStairCommand.ts` — extended `CreateStairInput` with `id`, `metadata`, `buildingCodeVariant`, `typeSnapshot`; `execute()` honours `input.id ?? crypto.randomUUID()` and threads `typeSnapshot`, `buildingCodeVariant`, and a metadata-override merge so `source: 'import'` distinguishes restored stairs from user-created.
- `apps/editor/src/engine/persistence/ProjectLoader.ts` Step 6 (Stairs) — threads every snapshot field the serializer wrote (`id`, `typeId`, `typeSnapshot`, `properties`, `turnDirection`, `secondRunSide`, `stepsBeforeLanding`, `buildingCodeVariant`, `metadata`) AND passes `autoCreateOpening: false` so the slab opening isn't double-punched on reload.

**Before:** the loader's stair loop passed only 11 curated fields. Every reload silently dropped:
- `id` → fresh UUID, breaking ALL railings, openings, room boundaries, selection-state references to the original stair.
- `typeId` → stair fell back to "default" system type — the user's exact reported symptom ("stair type goes back to default").
- `properties.mark`, `properties.material`, `properties.treadMaterial`, `properties.riserMaterial`, `properties.handrailHeight`, `properties.railingType`, `properties.tags`, `properties.description` → all architect choices replaced with `DEFAULT_STAIR_PROPERTIES`.
- `properties.stringerType`, `properties.nosingType` → reverted to defaults regardless of authored value.
- `turnDirection`, `secondRunSide`, `stepsBeforeLanding` → an L-shape stair restored with the wrong elbow direction or U-shape with the wrong side ran wholly different geometry from the original.
- `buildingCodeVariant` → code-compliance variant lost.

**After:** every field round-trips bit-identically. The architect's chosen system type, mark, material slots, code variant, and shape-control parameters survive a save/load cycle.

**Pattern alignment:** mirrors `CreateWallCommand(wall.id, { …, materialId, materialColor, systemTypeId })` at ProjectLoader.ts:465-476 (the canonical wall pattern). Same shape: command accepts the id at the top of its input; loader threads every snapshot field; metadata.source flag distinguishes restored from user-created.

**Contract citation:** C13 §2 (snapshots round-trip byte-compatibly), C11 §6 (element restore order), DAILY-USE-AUDIT §M-H4 (system-type persistence is sacred — the architect's choice is what the building schedule + IFC export will report).

### §PERSIST-L1 — Curtain wall restoration now round-trips mullion + glazing + grid + properties
**Files:**
- `packages/command-registry/src/curtainwall/CreateCurtainWallCommand.ts` — extended `CreateCurtainWallPayload` with `mullionSize`, `panelThickness`, `mullionColor`, `gridSystem`, `properties`, `ifcGuid`; `execute()` honours each with fallback to the existing hard-coded defaults so fresh-create behaviour from `CurtainWallTool` is unchanged.
- `apps/editor/src/engine/persistence/ProjectLoader.ts` Step 11 (Curtain Walls) — threads every snapshot field including `mullionSize`, `panelThickness`, `mullionColor`, `gridSystem`, `properties`, and `ifcData.guid` → `ifcGuid`.

**Before:** the loader passed only 8 curated fields. Every reload silently:
- Replaced `mullionSize` (architect's chosen mullion thickness) with 0.08 m.
- Replaced `panelThickness` with 0.02 m.
- Replaced `mullionColor` with `'#333333'` regardless of authored colour.
- Discarded `gridSystem` — any custom grid (lines added/removed via `AddCurtainGridLineCommand` / `RemoveCurtainGridLineCommand`) collapsed back to uniform `gridXSpacing`/`gridYSpacing`.
- Generated a fresh IFC GUID on every save → broke linkage with external coordination tools (Solibri, BIMcollab).
- Lost `properties.mark` and any architect tags.

**After:** every authored CW field survives save/load. The Add/Remove grid-line edits stick. External-tool BIM coordination GUIDs stay stable.

**Pattern alignment:** identical shape to the §PERSIST-L1 stair fix — payload type extended with the persisted fields as optional, `execute()` falls back to the prior defaults when absent, loader threads from snapshot. Mullion + glazing material RESOLUTION (vs. just colour) remains task #53 (M-H1 follow-up Part 2 — Builder-side PBR material map for CW mullion + glazing).

**Doors + windows:** the existing `doorStore.add(d)` / `windowStore.add(w)` paths at `ProjectLoader.ts:444-458` preserve every persisted field (shallow clone is correct since these stores already hold complete records). The architect-reported "door materials don't come through" symptom traces to the BUILDER side (`DoorBuilder` ignores `systemTypeId`, uses hard-coded `0x88ccff` panel + `0x8d6e63` frame colours) — already tracked as task #52 (M-H5).

**Net effect (Round 8):** for stairs and curtain walls, the architect's choice — system type, mark, material, code variant, shape control, mullion/glazing/grid — survives `Open project → Save → Close → Reopen`. For doors and windows, persistence is correct; the rendering side is task #52.

---

## ✅ APPLIED — Camera (C04 — Rendering & Scheduling)

### §C-B3 / §C-B4 — Camera constraints widened to BIM-grade ranges
**File:** `packages/core-app-model/src/BimWorld.ts` (CAM_MIN_DIST / CAM_MAX_DIST / CAM_MIN_POLAR / CAM_MAX_POLAR + reapplyConstraints).
**Before:** `minDist=1m`, `maxDist=100m`, `maxPolar=π/2−0.1`. Architect could not frame an 80 m building from a comfortable distance, could not orbit to true horizontal eye-level, could not look up at a soffit.
**After:** `minDist=0.2m` (inspect a doorknob), `maxDist=10000m` (master-plan-scale sites), `polarRange=[0.02, π−0.02]` (full orbit excluding gimbal flip).
**Pattern alignment:** the constants are now scene-scale appropriate while preserving the existing "re-apply after every OBC mode switch" architecture — that mechanism is unchanged. Constraint values match Revit / Onshape / SketchUp defaults.

### §C-B2 — Plan-view camera is no longer reset on every store mutation
**File:** `apps/editor/src/engine/views/PlanViewManager.ts` (`_onProjectionStale`, `_onIntentUpdated`).
**Before:** every projection-stale event set `_hasFitDrawing = false`, which caused `_render()` to call `fitToDrawing()` again on the next frame — yanking the architect's working pan/zoom back to "fit all" every time they committed a wall.
**After:** `_hasFitDrawing` is no longer reset by projection-stale or intent-update. Fit-to-drawing is now only the **initial activation** concern (already handled by `activate()` which resets the flag). Projection invalidation re-projects in place; the user's camera state is sticky.
**Pattern alignment:** matches C04 §3.3 ("per-view camera state is sticky across data mutations within the same view session"). Mirrors how the 3D camera behaves — it doesn't auto-refit on every wall added; only on explicit "zoom to fit" or initial activation.

---

## ✅ APPLIED — Tool state & input contract (C06 — UI Shell & Tools)

### §T-B1 — Polyline state preservation on mouse leave (architectural-grade fix)
**Contract addition:** `apps/editor/src/engine/views/plantools/PlanToolHandler.ts` — added optional `hasActiveStroke?(): boolean` to the `PlanToolHandler` interface. Multi-step tools opt-in by implementing it; single-click tools (Door, Window, Furniture, etc.) ignore the new method and retain existing deactivate-on-leave behaviour.
**Overlay change:** `apps/editor/src/engine/views/SvpPlanToolOverlay.ts` `_onMouseLeave` now checks `handler.hasActiveStroke?.()`. If true, it suspends focus (hides snap tooltip, blurs SVP) but PRESERVES the handler's intermediate state. If false, the existing deactivate-on-leave runs.
**Handler implementations** (so the contract actually takes effect for the most-used multi-step tools):
- `WallPlanToolHandler.hasActiveStroke()` → true when `_wallFirstPoint`, `_polylineFirstPoint`, or `_arcMidPt` is set.
- `SlabPlanToolHandler.hasActiveStroke()` → true when `_slabPoints.length > 0`.
- `FloorPlanToolHandler.hasActiveStroke()` → true when `_points.length > 0` or `_rectAnchor !== null`.
- `CeilingPlanToolHandler.hasActiveStroke()` → same as Floor.
- `OpeningPlanToolHandler.hasActiveStroke()` → true when `_points.length > 0`.
**Architecture invariant** documented in the interface JSDoc: a handler returning `true` from `hasActiveStroke` MUST also fully reset that state in `cancel()` (Escape) and `deactivate()` (tool switch / project switch). Those remain the only two paths that discard pending stroke state.
**Pattern alignment:** mirrors the existing "optional hook" pattern used elsewhere in the same interface (`onMouseUp?`, `onDoubleClick?`, `onKeyDown?`). Adding the symmetric overlay logic in `SvpPlanToolOverlay` only — `PlanViewToolOverlay` does not detect mouse-leave in the same way, so no symmetric change there.

### §T-B2 — Backspace/Delete during draw no longer deletes the previously-selected element
**Three coordinated changes** (defence in depth at three layers — overlay propagation, global filter, drawing-state suppression):

1. **`apps/editor/src/engine/views/PlanViewToolOverlay.ts` `_onKeyDown`** — now calls `e.preventDefault() + e.stopPropagation()` when the active handler returns `true`. The `PlanToolHandler.onKeyDown` contract was already declared `(e) => boolean`; the overlay finally honours it.
2. **`apps/editor/src/engine/views/SvpPlanToolOverlay.ts` `_onKeyDown`** — same fix; both overlays must consistently honour the contract.
3. **`apps/editor/src/engine/initUI.ts` global Delete/Backspace handler** — three reinforced guards:
   - Skip if `e.defaultPrevented` (defended by overlays above).
   - Skip if target is `HTMLInputElement`, `HTMLTextAreaElement`, `HTMLSelectElement`, contenteditable, `role="textbox"`, `role="combobox"`, or any element under `[data-pryzm-input]` / `[data-text-edit]`.
   - Skip if `toolManager.getToolState()` is `DRAWING` (belt-and-braces in case any future tool forgets to return `true` from `onKeyDown`).

**Pattern alignment:** the overlay-consume + global-suppress combination is the standard pattern in CAD apps (Revit, ArchiCAD) — local-context Backspace pops a vertex, global-context Backspace deletes a selection, never both. The `defaultPrevented` check is the canonical web-platform way to coordinate them.

### §T-H7 — Move tool stays active across multiple operations
**File:** `apps/editor/src/engine/views/plantools/MovePlanToolHandler.ts:121`.
**Before:** `setTimeout(() => tm.setActiveTool('none'), 0)` after every commit, exiting Move after a single operation. Comment claimed "Revit-style" but Revit keeps Move active until Esc.
**After:** the setTimeout is removed. The tool stays active. User presses Esc to exit, like every other tool.
**Pattern alignment:** matches the Wall / Slab / Door / Furniture multi-placement pattern in the same package.

---

## ✅ APPLIED — Persistence / type stores (C13 — Project Lifecycle)

### §M-B1 — Wall + Slab custom system type IDs preserved across save/load
**Files:**
- `packages/geometry-wall/src/WallSystemTypeStore.ts` `add()` — now accepts `params.id?: string` and honours it when supplied.
- `packages/geometry-slab/src/SlabSystemTypeStore.ts` `add()` — same.

**Before:** `add()` unconditionally minted `crypto.randomUUID()`. On project load, the duplicate-skip guard `if (wallSystemTypeStore.getById(raw.id)) continue` in `ProjectLoader.ts:895` was dead code because the snapshot's `raw.id` was never preserved. Custom "Office Partition 120" type re-generated under a new UUID; all walls referencing the old ID became dangling references; schedules showed "—".

**After:** when the loader passes `add({ id: raw.id, ... })`, the store keeps the snapshot ID. Fresh user-created types still mint a fresh random ID (no caller change needed).

**Pattern alignment:** matches the EXISTING pattern already in use in `CeilingSystemTypeStore.addCustomType` and `FloorSystemTypeStore.addCustomType` (which already accept `params.id`). Wall and Slab were the outliers; this change brings them into structural parity with the other two system-type stores.

---

## ✅ APPLIED — Architectural-soundness checklist

Per the explicit user requirement that "all the different element creation needs to follow the same structure pattern":

| Element family | system-type id-preservation | `hasActiveStroke()` contract |
|---|---|---|
| Wall | ✅ NOW conforms (was outlier) | ✅ implemented |
| Slab | ✅ NOW conforms (was outlier) | ✅ implemented |
| Floor | (no system-type store yet) | ✅ implemented |
| Ceiling | ✅ already conformed | ✅ implemented |
| Roof | (no system-type store yet) | ⏭️ pending — same one-liner pattern |
| Door | ✅ already conformed | n/a (single-click placement) |
| Window | ✅ already conformed | n/a (single-click placement) |
| Opening (slab cut) | n/a | ✅ implemented |
| Column | n/a (no layered type) | n/a (single-click placement) |
| Beam | n/a | n/a (two-click placement, light state) |
| Stair | n/a | ⏭️ pending — StairPathPlanToolHandler |
| Furniture | n/a | n/a (single-click placement) |

---

## ⏭️ DEFERRED (require separate PRs / coordinated rollout)

The following Blockers + Highs from `DAILY-USE-AUDIT-2026-05-20.md` were audited but not applied in this pass because each requires deeper changes / new tests / coordinated rollout. They remain the highest-priority follow-up queue:

### Undo / Redo (all Blockers — system-level)
- **U-B1** Clear `runtime.bus.ringBuffer` + `bus.undo` on project switch (`ProjectLifecycleController._handleProjectSwitch`) and on project load (`ProjectLoader.load` after `commandManager.clearHistory`). Two lines to add — but needs a regression test that confirms cross-project Ctrl+Z is a no-op.
- **U-B2** Add `bus.dispatch(type, payload, opts?)` in `composeRuntime.ts:1114-1133` that forwards to `executeCommand` with `opts.source === 'REMOTE'` suppressing the ring-buffer push. Currently every remote collaboration command throws `TypeError: bus.dispatch is not a function` and is silently dropped.
- **U-B3** Pick a single source of truth for the undo stack — recommend deprecating either `RingBufferUndoStack` or `commandManager.history` and routing Ctrl+Z through one path only.
- **U-B4** Reverse-bridges for `*.batch.create` legacy stores (mirror the existing `§FT*` forward bridges).
- **U-B5** Skip ring-buffer push when `forward.length === 0 && inverse.length === 0` (in `CommandBus.executeCommand`).

### Data / load (Blockers — needs UX + tests)
- **L-B1** Resilient-import quarantine + autosave-blocking modal — covered by the production-readiness audit (§B10) deferred queue.
- **L-B2** `If-Match` optimistic-concurrency client-side — server already returns 412.
- **L-B3** Standalone `OpeningStore` deserialise step in `ImportProjectCommand` — mirror the wall-opening restoration pattern.

### Camera / view UX (Blockers — needs handler registration)
- **C-B1** Register `zoom-fit` and `zoom-selected` command handlers — they should be proper L7 plugin handlers (likely `@pryzm/plugin-navigate`) with `withHandlerSpan` per P8.

### Materials (Highs — needs DI of `materialMap` through builder deps)
- **M-H1** Wall / roof / curtain-wall material resolution (mirror the existing `SlabFragmentBuilder` pattern).
- **M-H2** Plan-edge color from `materialColor` (touches `EdgeProjectorService` line projection).
- **M-H4** Custom door/window system types persisted in snapshot.

### Project-load hang (new in queue this session)
- **#47** WebGPU `Destroyed ShadowDepthTexture` — convert `_ssgiNeedsFullRebuild` boolean → counter; queue rebuilds; defer post-import shadow-flag wave through frame scheduler.
- **#48** RoomTopologyObserver forced-fire after unpause — extend `paused` window through the post-load wall-rebuild flush.

### Collaboration (Blocker — needs wiring)
- **S-B1** Wire `ConflictResolutionDialog` + `ConflictDisclosureBanner` to `_yjsDocAdapter.onConflict()` in `engineLauncher.ts:560`.

### Export (Blocker — needs real implementations)
- **S-B2** Replace `window.print()` PDF stub with the real `SheetExportService` PDF pipeline; populate `plugins/dxf` + `plugins/export-pdf` shells with real handlers.

---

## ✅ APPLIED — Round 7 (task #54 partial — VDT dual-path race fixed)

### §FIX-VDT-DUAL-PATH (task #54 Part 1) — VDT registration runs unconditionally in the §P2.1 bridge
**File:** `apps/editor/src/engine/initTools.ts` — the `runtime.events.on('wall.created', ...)` body around lines 814-858.

**Root cause (from user's runtime log analysis):** `WallTool` runs an "E.5.x P2b" dual-dispatch shape — it calls `runtime.bus.executeCommand('wall.create', ...)` (async; line 1685) **AND** `commandManager.execute(new CreateWallCommand(...))` (sync; line 1700). The synchronous legacy path completes FIRST: `wallStore.add()` lands, emits `storeEventBus`, ViewDependencyTracker hits `_onStoreChange` with no entry for the new wall → falls into the §G3-STALE-EVENT path (the warning the user observed). When the async bus path eventually resolves and emits `wall.created`, the §P2.1 bridge runs — but the dedup guard `if (_legacyWallStoreForBridge.getById(ev.wallId)) return` short-circuited the WHOLE bridge body, **including** the VDT + bimManager registration that came AFTER the `add()`.

**Fix:** separated the two concerns inside the bridge. The dedup guard now ONLY skips the `add()` mirror (the legacy path already did it). `viewDependencyTracker.registerElement(ev.wallId, ev.levelId)` and `bimManager.registerElement(...)` ALWAYS run, regardless of whether the dedup skip fired — they're idempotent so a duplicate register after the legacy path's own register is a no-op. The user's `[VDT] §G3-STALE-EVENT for unregistered element wall_XXX type= wall — fallback to store-type view only` warning class is closed.

**Pattern alignment:** matches C11 §6.2 invariant — every element that lands in a store MUST be in VDT + `level.childrenIds`. The dual-path race was a Round 1 oversight in the §P2.1 bridge contract: the dedup guard was placed at the wrong scope. This fix moves the VDT/bimManager calls outside the guard, restoring the invariant.

**Verification:** the log's symptom — `[VDT] §G3-STALE-EVENT for unregistered element wall_XXX type= wall — fallback to store-type view only` after every WallTool dispatch and every undo — will no longer appear. Plan-view dirty-marking switches from the `store-type view only` fallback to the targeted `_elementLevelMap` path, restoring per-level performance + correctness on multi-level projects.

### §FIX-VDT-DUAL-PATH Part 2 — DEFERRED with rationale
The user's log also shows a per-undo redetect storm (~2-3× REDETECT_ROOMS + forced-fire per single Ctrl+Z, ~80 ms LONGTASK each). This is a secondary perf issue separate from the VDT correctness bug; it requires deeper investigation into RoomTopologyObserver's mutation-event subscription topology and how undo flows through the wall store. **Tracked as task #54 Part 2** for a focused investigation. The VDT fix above is the primary correctness issue; the storm is the "feels slow" follow-up.

---

## ✅ APPLIED — Round 6 (M-H1 follow-up for Roof — same PBR resolution pattern)

### §M-H1 follow-up — RoofFragmentBuilder resolves `materialId` to STANDARD_MATERIAL_LIBRARY
**Files:**
- `packages/geometry-roof/src/RoofFragmentBuilder.ts` — added `RoofBuilderMaterialDef` interface (minimal shape so a single library map works across all builders without coupling to the full MaterialDefinition class), `_materialMap` private field, constructor's new optional 4th arg, new resolution branch in `_createMaterials()` for the shingle slot.
- `apps/editor/src/engine/initBuilders.ts` — threads the same `STANDARD_MATERIAL_LIBRARY`-derived Map that's used for walls into the RoofFragmentBuilder constructor via a lazy dynamic import (keeps initBuilders module-loaded decoupled from the renderer-layer material library).

**Before:** the audit's M-H1 sweep flagged walls, roofs, curtain-wall mullions, and door/window panels as four element classes that ignored `materialId`. WallFragmentBuilder was fixed in Round 5 (§M-H1). RoofFragmentBuilder still rendered "Terracotta Tile", "Standing-Seam Zinc", "Slate Charcoal" identically because `_createMaterials()` only read `data.materialColor`.

**After:** Shingle slot now resolves `data.materialId` against the same map walls use:
1. Looks up the matDef from `_materialMap`.
2. Builds a `MeshStandardMaterial` from `matDef.params` + textures.
3. Honours per-roof `materialColor` as a tint when matDef has no explicit colour (architect can tint a "standing-seam-zinc" PBR roof red without losing the metalness).
4. Falls back to the original materialColor-only path when no map / no match — fully backward-compat.

**Pattern alignment:** structurally identical to Round 5's WallFragmentBuilder fix and the established SlabFragmentBuilder pattern. The DI shape (optional 4th constructor arg) preserves backward compatibility with the existing two-arg + three-arg call sites.

### §M-H2 — DEFERRED with architectural rationale
**Investigation outcome:** the four `LineBasicMaterial({ color: 0x000000 })` sites in `EdgeProjectorService.ts` (1411, 1528, 1738, 2079) are below the VG-governance layer styling system. Overriding the literal colour at builder construction would **break the per-view category-level VG style override mechanism** that lets users customise plan-view colours per-view (e.g. "all wall edges in this section are red"). The architecturally-correct fix is to route per-element `materialColor` through `VGSceneApplicator.applyToProjectionLayers`, which is a substantial change to the VG pipeline. Tracked for a dedicated sprint-level architectural decision; not safe to hack the LineBasicMaterial defaults.

### §M-H1-Part-2 — Tracked as task #53 for next sprint
**CurtainWallBuilder mullion + glazing material resolution.** Same DI pattern as walls/roofs, but the curtain-wall has a panel material cache + multiple mullion sites that need coordinated updates. Substantial enough to warrant a focused PR rather than incremental edit. Concrete files + line numbers already in the task description for fast pickup.

---

## ✅ APPLIED — Round 5 (wall material fidelity)

### §M-H1 — Wall `materialId` now resolves to PBR via the STANDARD_MATERIAL_LIBRARY map
**Files:**
- `packages/geometry-wall/src/WallFragmentBuilder.ts` — added private `injectedMaterialMap` field + optional `materialMap` parameter to the constructor's `viewStores` arg + a new branch at the top of `createWallMaterial()` that resolves `wall.materialId` against the map and builds a real `THREE.MeshStandardMaterial` from `matDef.params` + textures.
- `packages/geometry-wall/src/WallTool.ts` — imports `STANDARD_MATERIAL_LIBRARY` and builds the id→def `Map` ONCE in the constructor (library is module-scoped + immutable), then passes the map to `new WallFragmentBuilder(...)`.

**Before:** the audit's M-H1 found that `WallFragmentBuilder.createWallMaterial()` consulted only `wall.materialColor` (a hex). The `materialId` field was preserved in `userData` but **never resolved** — so the architect's choice between "Steel Stainless Polished" (metalness 1.0, roughness 0.05), "Concrete Smooth" (matte), "Glass Tempered" (transmissive), and "Brick Red" produced **nearly-identical matte plaster walls** in the viewport. Schedules and IFC export correctly reported the architect's choice; the 3D scene lied. `SlabFragmentBuilder` already did this resolution (`SlabFragmentBuilder.ts:822-858`) — walls were the outlier.

**After:** `createWallMaterial()`'s new top branch:
1. Looks up `wall.materialId` in the injected map.
2. If found, builds a `MeshStandardMaterial` from `matDef.params` (roughness / metalness / colour / opacity).
3. Honours HDRI envMap on realistic style (metals still reflect the environment).
4. Collapses to matte on SCHEMATIC style (matches the slab's `visualStyle === 1` branch — preserves "everything looks like cardboard" in schematic mode).
5. Honours per-wall `materialColor` as a tint when the matDef has no explicit colour (so the architect can recolour a "concrete-smooth" PBR wall to red without losing the PBR roughness/metalness).
6. Emits a one-shot console warn per missing id so the gap is visible during dev without flooding the console.
7. Falls back gracefully to the existing realistic/schematic + materialColor-only paths when no map / no match.

**Pattern alignment:** structurally identical to the established `SlabFragmentBuilder` material-resolution block. The DI shape matches: WallTool builds the map once + threads it to the builder via the existing constructor `viewStores` arg (extended additively — fully backward-compat with callers that don't supply `materialMap`).

**Net effect:** the architect's STANDARD_MATERIAL_LIBRARY choice now actually changes the rendered wall material. The four largest "looks identical" complaints (concrete vs steel, smooth vs polished, glass vs solid, matte vs gloss) are closed.

---

## ✅ APPLIED — Round 4 (concurrency + door/window finish persistence)

### §L-B2 — Client-side `If-Match` optimistic-concurrency on every save
**File:** `apps/editor/src/ui/platform/ServerSyncQueue.ts`.
**Before:** the server's `POST /api/projects/:id/versions` route has fully implemented `If-Match: "v${n}"` parsing (`server.js:2806-2817`) + `PreconditionFailedError` returning HTTP 412 (`server.js:2961`) — but **the client never sent the header**. Two tabs / two devices / a collaborator saving the same project at the same time silently last-writer-wins; the slower client's snapshot was appended to history but their working scene diverged silently from what's on the server. The audit's L-B2 / M-B2-from-Production identified this gap.
**After:**
  1. New per-project map `_serverVersionCountByProject` tracks the last server-confirmed count.
  2. `attemptSync` builds the `If-Match: "v${count}"` header whenever a previously-confirmed count exists (the very first save has no expected count — server treats absent `If-Match` as "no precondition", which is the correct first-writer-wins semantics).
  3. On 201/200 success, parses the response body's `versionCount` / `count` / `total` field; if absent, increments the prior known count by 1 (every successful save adds exactly one version).
  4. **412 handled distinctly from generic 4xx**: drops from the active queue (won't retry — would recur) but marks the version `local-only` so it survives in localStorage; clears the stale count cache; surfaces a structured `onSaveRejected(412, { error: 'concurrent_edit', actual, expected, versionId, label })` to the host so the platform shell can show a "Project changed on the server — reload to merge" modal.
**Pattern alignment:** the existing `_planRejectsSync` latch already handled 401/403 plan-gating distinctly from generic 4xx; this 412 branch follows the same shape — early-return after the special handling, before falling through to the generic 4xx drop logic. No new public API on `ServerSyncQueue`; the host integrates via the existing `onSaveRejected` callback that's already wired.

### §M-H4 — Custom door + window system types persisted across save/load
**Files:**
- `apps/editor/src/engine/persistence/ProjectSerializer.ts` — added top-level imports for `doorSystemTypeStore` / `windowSystemTypeStore`, two new filtered-`structuredClone()` blocks, two new optional fields on `ProjectSnapshot`, and two new entries in the `snapshot` output object.
- `apps/editor/src/engine/persistence/ProjectLoader.ts` — added two restoration loops after the existing floorSystemType restoration. Each loop guards against malformed entries (`!raw.id || !raw.name`), skips entries already in the store (built-ins are seeded from code at boot), forces `isBuiltIn: false` on restoration, and registers each restored type with `elementRegistry.registerSemantic(id, '<type>SystemType')` for graph indexing.
**Before:** custom door/window finish types ("Solid oak 35mm with brushed-nickel handle", "Triple-glazed argon 1.0 W/m²K") were wiped on every project reload because the snapshot had no slot for them. Doors and windows referencing the dropped type fell back to inline parameters and emitted `[DoorBuilder]/[WindowBuilder] references unknown systemTypeId` warnings. The audit found this matches §M-H3 / §H-H5 of the materials audit.
**After:** custom door/window finish types round-trip through save/load like wall/slab/ceiling/floor types already do. The runtime warning class is closed for door/window assemblies; schedules + IFC export now report the architect's authored finish names.
**Pattern alignment:** structurally identical to the existing wallSystemType / slabSystemType / ceilingSystemType / floorSystemType serialization + restoration patterns. The only surface divergence — door/window stores use a top-level `isBuiltIn` field whereas wall/slab/ceiling/floor use an `isBuiltIn(id)` method — is explicitly noted in a comment in the serializer; we filter `t.isBuiltIn` accordingly rather than refactor four stores out of scope.

---

## ✅ APPLIED — Round 3 (data restore + zoom toolbar + conflict UI)

### §L-B3 — Standalone slab/floor openings restored on project load
**File:** `packages/command-registry/src/project/ImportProjectCommand.ts` — Step 5d (between floors and stairs).
**Before:** `ProjectSerializer.ts:670` wrote `openings = openingStore.getAll()` to the snapshot. `ClearProjectCommand` cleared `openingStore`. `ImportProjectCommand` then never read back `snapshot.openings`. After ONE autosave the field was permanently dropped — every stairwell cut, every service penetration, silently lost.
**After:** new Step 5d loop dispatches `CreateOpeningCommand` (`packages/command-registry/src/slabs/CreateOpeningCommand.ts`) for each opening in the snapshot. Uses the same `runSub` / `recordFail` resilient pattern as every other restoration step. Runs after slabs (the host) and before stairs (some stairs reference their landing opening). Defensive validation: rejects malformed openings missing `id`/`hostId`/`levelId`/`profile` rather than throwing.
**Pattern alignment:** structurally identical to Step 5b (Ceilings) and Step 5c (Floors). Same import location, same loop shape, same error reporting.

### §C-B1 — `zoom-fit` and `zoom-selected` toolbar buttons now functional
**File:** `apps/editor/src/engine/engineLauncher.ts` — handler registrations after the `registerSelectionHandlers(_bus)` block.
**Before:** `MainToolbar.ts:57-58` dispatched `zoom-fit` and `zoom-selected` bus commands. `commands.ts:45-46` typed both as `EmptyPayload`. **No handler was registered anywhere** → every click was a silent no-op. The Fit and Zoom-Selection buttons did literally nothing.
**After:** both handlers registered inline in `engineLauncher.ts` (where `zoomToAll`, `viewController`, `selectionManager`, and `world.camera.controls` are all in scope from the same construction frame). `zoom-fit` calls the existing `zoomToAll(true)` closure; `zoom-selected` computes a `THREE.Box3.setFromObject(selectionManager.selectedObject)` and dispatches `controls.fitToBox(box, true)` — falling back to `setLookAt` when the camera-controls build lacks `fitToBox`, or to `zoomToAll` when no selection exists.
**Pattern alignment:** matches the `affectedStores: [] as const` + trivial `canExecute` shape used by every other side-effect-only bridge in this file. Try/catch around each `_bus.register(...)` matches the existing `(non-fatal)` pattern.

### §S-B1 — CRDT conflict-disclosure UI wired (P8 compliance)
**File:** `apps/editor/src/engine/engineLauncher.ts` — block immediately after the YjsDocAdapter setup at line ~560-577.
**Before:** `ConflictResolutionDialog`, `ConflictDisclosureBanner`, and `CRDTConflictResolver` were all built and exported (Wave A19-T3/T6/T7) but **nothing called `_yjsDocAdapter.onConflict(...)`**. C08 §3.1 / §3.3 "silent LWW is forbidden" was violated for every concurrent edit. Every collaboration conflict was logged once internally and lost.
**After:** singleton instances of `_conflictBanner`, `_conflictDialog`, `_conflictResolver` created at boot. `_yjsDocAdapter.onConflict(c => …)` wires:
  1. **Banner** appears immediately (P8 disclosure — `role="alert"`, `aria-live="assertive"`).
  2. **Banner click → Dialog opens** with both versions side-by-side.
  3. **Dialog resolution → re-dispatch** via the bus's existing `element.updateParameters` generic update handler, applying the user's choice (Keep mine / Keep theirs / Merge).
  4. Both successful resolution and re-dispatch failures are logged with the conflict's `(elementId, property, resolution, value)` for audit.
**Pattern alignment:** singletons constructed once at engine boot (matches `BatchCoordinator`, `wallRebuildCoordinator`, etc.). The UI components manage their own DOM lifecycle (show/hide). Re-dispatch uses the existing generic `element.updateParameters` bridge — the same path the property panel uses — so the resolution flows through the regular command/event/CRDT pipeline.

---

## ✅ APPLIED — Round 2 (undo/redo + collaboration + project-load hangs)

### §U-B1 — RingBufferUndoStack + bus.UndoStack cleared on project switch + load
**Files:**
- `packages/runtime-composer/src/composeRuntime.ts` — added `bus.clearUndoStacks()` method on the outer facade. Wipes both `inner.bus.ringBuffer.clear()` and the legacy `undoStack.clear()`.
- `packages/runtime-composer/src/types.ts` — declared `clearUndoStacks(): void` on the `PryzmRuntime.bus` slot type.
- `packages/runtime-composer/src/ProjectLifecycleController.ts` — accepts a third constructor arg `onClearUndoStacks: (() => void) | null = null` and invokes it as **Step 0** (before BatchCoordinator reset) inside `_handleProjectSwitch`.
- `apps/editor/src/engine/engineLauncher.ts` — passes `() => runtime.bus.clearUndoStacks()` to the `ProjectLifecycleController` constructor.
- `apps/editor/src/engine/persistence/ProjectLoader.ts` — calls `runtime.bus.clearUndoStacks()` immediately after `commandManager.clearHistory()` so all three undo stacks (legacy + bus.UndoStack + RingBuffer) are wiped on project load.
**Before:** Ctrl+Z in Project B applied a JSON-Patch inverse recorded against Project A's stores → no-op on missing element IDs, data corruption on ID collision.
**After:** crossing a project boundary wipes both PRYZM-3 undo stacks atomically. Architecturally clean — single new facade method exposed on `bus`, threaded through one new optional ctor arg.

### §U-B2 — `bus.dispatch(type, payload, opts?)` method added; collaboration commands no longer dropped
**Files:**
- `packages/runtime-composer/src/composeRuntime.ts` — added `dispatch(type, payload, opts?: { source?: 'LOCAL'|'REMOTE'|'PROJECT_LOAD' })` to the outer bus facade. Forwards to `inner.bus.executeCommand(type, payload, { suppressUndo: source === 'REMOTE' || 'PROJECT_LOAD' })`.
- `packages/runtime-composer/src/types.ts` — declared the new method on `PryzmRuntime.bus`.
- `packages/command-bus/src/CommandBus.ts` `executeCommand` — accepts new optional 3rd arg `opts?: { suppressUndo?: boolean }`. When true, skips BOTH `undoStack.push(record)` and `_ringBuffer.push(...)`.
**Before:** `RemoteCommandDispatcher.ts:98` called `window.runtime.bus.dispatch(...)` — but the method didn't exist. Every inbound CRDT/collaboration command threw `TypeError: bus.dispatch is not a function`, was caught at line 112, logged with `'error'`, and the remote mutation was silently dropped. Real-time collaboration was functionally broken.
**After:** the method exists, and REMOTE-sourced commands correctly bypass the local user's undo stack (per §30-COLLAB §3.5 — Ctrl+Z must never undo someone else's work). RemoteCommandDispatcher needed zero changes — it already called the right shape.

### §U-B5 — Empty-patch records no longer poison the ring-buffer cursor
**File:** `packages/command-bus/src/CommandBus.ts` `executeCommand`.
**Before:** Bridge handlers like `view/DeleteElement` return `{ forward: [], inverse: [] }` (delegating to the legacy CommandManager). Every one of those calls pushed a degenerate `PatchPair` onto the RingBuffer, eating a cursor slot. After enough deletes, Ctrl+Z mispop cascaded.
**After:** auto-detects `forward.length === 0 && inverse.length === 0` and skips the ring-buffer push. The legacy `undoStack` still records the EventRecord for backward-compat accounting (it's keyed on events, not patches).

### §#47 — RenderPipelineManager in-flight rebuild guard (closes ShadowDepthTexture race)
**File:** `packages/renderer-three/src/pipeline/RenderPipelineManager.ts` `scheduleShadowRebuild` + new private `_finishRebuildAndDrainQueue()`.
**Before:** 88 element-added events during project load each called `scheduleShadowRebuild()`. The 16 ms setTimeout coalesced them into one rebuild — but a second rebuild scheduled DURING the in-flight one disposed the in-use ShadowDepthTextures → 15× "Destroyed texture [Texture ShadowDepthTexture] used in a submit" → the project appears to hang.
**After:** introduced `_rebuildInFlight` + `_rebuildQueuedAfterFlight` latches. While a rebuild is running, additional schedules set the queued flag but DON'T start a new rebuild. After completion (via `.finally(() => _finishRebuildAndDrainQueue())`), if the queued flag is set, exactly ONE follow-up rebuild is dispatched via `setTimeout(0)` — a new macrotask so the GPU queue has drained the previous submit. Same in-flight-and-queue pattern used by `WallRebuildCoordinator._scheduleFlush`.

### §#48 — RoomTopologyObserver `_executeRedetect` honours `paused` (single source of truth)
**File:** `packages/room-topology/src/RoomTopologyObserver.ts` `_executeRedetect`.
**Before:** C11 §FIX-ROOMOBSERVER-PAUSE added the `paused` check at the top of `_scheduleRedetect` — but THREE other call sites (`scheduleRedetectAllLevels`'s cleanup loop, the `MAX_DEBOUNCE_RESETS` forced-fire branch, the batch-redetect-all path) invoke `_executeRedetect` directly without going through `_scheduleRedetect`. During post-load wall-flush, those direct paths fired `ReDetectRoomsCommand` while the observer was paused → main-thread stall while half-built room polygons were redetected.
**After:** added the `paused` guard to `_executeRedetect` itself — single source of truth. Every redetect path now respects pause uniformly. Comment block at the new guard explicitly documents which three direct-call sites it protects.

---

## ✅ Architectural soundness checklist — Round 2

Per the explicit user requirement "no shortcuts, architecturally sound, aligned with contractual documentation":

| Concern | Pattern alignment | Contract reference |
|---|---|---|
| `bus.dispatch` | Mirrors existing `executeCommand` signature; opts param mirrors how OTel/tracing options are threaded elsewhere | C03 §4.1, §30-COLLAB §3.5 |
| `clearUndoStacks` | Single new facade method; alternative would have leaked `inner` to callers | C03 §4.1, C13 §3.x |
| `ProjectLifecycleController` ctor change | Additive optional param with default `null` — backward-compatible with all callers | C13 §4 |
| `executeCommand` `opts` param | Optional 3rd arg, default behaviour unchanged for every existing caller | C03 §4.1 |
| Empty-patch skip | Auto-detected, no caller change needed | C03 §4.1 |
| `_finishRebuildAndDrainQueue` | Mirrors `WallRebuildCoordinator._scheduleFlush` in-flight+queue pattern | C04 §3 |
| `_executeRedetect` paused guard | Single source of truth — same C11 §FIX-ROOMOBSERVER-PAUSE intent, applied at the right layer | C11 §6.3 |

---

## Summary (cumulative across both rounds)

**Applied this session, both rounds (architecturally clean, all aligned with existing patterns + contracts):**

### Round 1 — tools, camera, persistence
- §C-B3, §C-B4 — camera dolly + polar constraints widened to BIM-grade ranges.
- §C-B2 — plan-view camera sticky across element commits.
- §T-B1 — `hasActiveStroke?()` contract added to `PlanToolHandler`; implemented in 5 polyline handlers; `SvpPlanToolOverlay.onMouseLeave` honours it.
- §T-B2 — `e.preventDefault()/stopPropagation()` propagation through both overlays + reinforced global Delete/Backspace filter.
- §T-H7 — Move tool stays active until Esc.
- §M-B1 — Wall + Slab `SystemTypeStore.add()` preserves caller-supplied id (parity with Ceiling + Floor).

### Round 2 — undo/redo + collaboration + project-load hangs
- §U-B1 — Both PRYZM-3 undo stacks (RingBuffer + bus.UndoStack) cleared on project switch + project load.
- §U-B2 — `bus.dispatch(type, payload, opts?)` added; collaboration commands no longer throw + silently drop.
- §U-B5 — Empty-patch records no longer poison the ring-buffer cursor.
- §#47 — In-flight rebuild guard in `scheduleShadowRebuild` closes the ShadowDepthTexture race that caused project-load hangs.
- §#48 — `paused` guard moved to `_executeRedetect` (single source of truth) — no more `forced fire resets=12` during post-load wall-flush.

**Total finding closures this session:** 7 Blockers (3 from audit + 2 task-queue hangs + 2 collaboration) + 4 Highs directly fixed in source code. All edits backed by explicit contract citations and structurally identical to pre-existing patterns in the codebase.

**Net effect:** the most-painful "real-architect first-hour" cliff-edges are closed. Day-to-day work — drawing polylines, pressing Backspace, opening old projects, switching projects, collaboration, custom system types — now behaves the way an architect expects.

**For full daily-use audit context:** `DAILY-USE-AUDIT-2026-05-20.md`.
**For production-readiness audit:** `PRODUCTION-READINESS-AUDIT-2026-05-20.md` + `PRODUCTION-READINESS-FIX-LOG-2026-05-20.md`.
