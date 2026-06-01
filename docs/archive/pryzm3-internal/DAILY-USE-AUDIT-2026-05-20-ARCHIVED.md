# PRYZM — Daily-Use Master Audit (2026-05-20)

Companion to `PRODUCTION-READINESS-AUDIT-2026-05-20.md`. That audit covered "is the platform safe to launch?" (security, infra, reliability). **This audit covers "will an architect want to use it for 8 hours straight?"** — tools, undo/redo, project load, camera, materials, snapping, annotations, collaboration, error handling.

Six parallel deep-dive agents read the actual code. Consolidated findings below. **Verdict: a real architect will hit a frustrating, evidenced bug within the first hour of work.** The fixes are concentrated and tractable — roughly 4–8 days of focused engineering closes every Blocker.

---

## §1 — Tool use (creation / move / rotate / delete state)

### Blockers
- **T-B1 Polyline state evaporates when mouse leaves the active canvas in Split View.** `SvpPlanToolOverlay.ts:384` `_onMouseLeave` calls `_deactivateHandler()`, which wipes `_wallFirstPoint` / `_points`. Reach for the toolbar mid-polyline → entire wall/slab/floor sequence gone.
- **T-B2 Backspace silently deletes another selected element mid-draw.** Plan-tool handlers pop the last vertex on Backspace and return `true`, but `PlanViewToolOverlay._onKeyDown:577-585` discards the return value (no `preventDefault`) so the global `deleteSelected` Backspace handler in `initUI.ts:2871` fires too. Result: backspace = "drop the last vertex AND delete the wall that was selected before I started the slab tool."
- **T-B3 Stair / handrail 3D gizmo drag silently no-ops.** `registerTransformDragHandler.ts:369-392` snaps the mesh back with only a console.warn — no toast, no UI cue. User drags 5 m and watches it pop back.
- **T-B4 Click-while-tools-loading is dropped silently.** On a fresh project load, tool buttons can be clicked before `__pryzmInitComplete` flips — the click is consumed (button highlights), no tool armed, next canvas click does nothing.

### Highs
- **T-H1** `WallTransformController` proxy leak on view switch with wall selected → occasional "object must be part of scene graph" red-screen.
- **T-H2** Backspace handler exists only in *some* tool handlers — inconsistent UX across element types.
- **T-H3** Multi-select transform impossible: `SelectionManager.selectedObject` is singular. Ctrl-click 5 columns to move them → only the last-clicked moves.
- **T-H4** Door/window placement: no preview of the host wall; 1.5 m search radius means clicks 1.4 m from a wall snap to a wall across the room.
- **T-H5** Furniture rotation hard-coded to 0 at placement; no R-key or Space to rotate during placement → sofa back always faces the room until placed-and-re-rotated.
- **T-H6** Column plan tool ignores the column-type configured in 3D (always 30×30 generic rectangle).
- **T-H7** Move tool exits to selection mode after ONE move (`MovePlanToolHandler.ts:121` `setTimeout(() => tm.setActiveTool('none'), 0)`). Revit keeps Move active until Esc; PRYZM doesn't.
- **T-H8** `StairPathPlanToolHandler` leaks window event listeners per instance.
- **T-H9** Wall ortho mode overrides explicit endpoint snaps without telling the user the indicator was misleading.
- **T-H10** Furniture/column store `get` vs `getById` inconsistency in drag handler.

### Mediums (selected)
- Snap tooltip outlives mouseleave on SVP overlay (stale "Endpoint" label hovers).
- `_pryzmActiveFurnitureType` window global → race on rapid tool flips (bed→sofa within 50ms loses the type).
- Wall plan tool reads system-type for preview thickness but uses generic 0.2 m at commit.
- Door placement on curved walls silently refused (no toast — feels broken).
- Stair refuses 2nd corner click if only one level exists — but consumes the 1st corner click first.
- Snap pre-warm only at activate; new walls aren't snap targets until the next view refresh.

---

## §2 — Undo / Redo / Lifecycle

### Blockers
- **U-B1 RingBufferUndoStack is never cleared on project switch or load.** Ctrl+Z in project B applies an inverse patch from project A's edit. JSON-pointer no-ops or corrupts B.
- **U-B2 `runtime.bus.dispatch(...)` doesn't exist.** `RemoteCommandDispatcher.ts:98` calls it; the bus exposes `executeCommand`/`register`/`registry`/`ringBuffer` only. **Every inbound CRDT/collaboration command throws.** Caught at line 112, silently logged, the remote mutation is **dropped**. Real-time collaboration is functionally broken.
- **U-B3 Three undo stacks diverge after the first ring-buffer undo of a bus command.** `commandManager.history`, `bus.undo` (EventRecord), `runtime.bus.ringBuffer` (PatchPair) — none of the three is the source of truth; Ctrl+Z eventually pops the wrong stack and elements ghost between states.
- **U-B4 `*.batch.create` (wall/slab/curtain-wall) writes only the plugin store; the legacy store retains the rendered geometry.** No reverse-bridge means Ctrl+Z silently does nothing (button greys-out, walls stay on screen). The applyPatch call into the legacy store throws and is swallowed.
- **U-B5 `element.delete` (DeleteElement bridge) pushes an empty `PatchPair`.** Eats a ring-buffer slot, mis-aligns the cursor, causes cascading mis-pops on subsequent Ctrl+Z.

### Highs
- **U-H6** Multi-select Delete impossible — `selectionManager.selectedObject` is singular; Delete only deletes the most-recently-clicked.
- **U-H7** `DeleteSlabCommand` doesn't cascade to curtain walls / walls hosted on the slab — orphans persist in the snapshot.
- **U-H8** `runtime.bus.undo` (EventRecord stack) also never cleared on project switch.
- **U-H9** `bim-level-removed` event shape mismatch — BimKernel sends `{levelId}`, DeleteLevelCommand sends `{id}` — cleanup handlers read `detail.levelId`, get undefined, skip.
- **U-H10** Stair sub-stores (railing/landing) not snapshotted in legacy command rollback — failed delete leaves a stair without its railings.
- **U-H11** `furnitureFragmentBuilder` still reads window global in delete/undo paths — race with `ProjectScopeRegistry.clearAll`.

### Mediums (selected)
- `bus.UndoStack` cap 100 vs `RingBuffer` cap 200 vs `commandManager.history` uncapped → silent state drift + memory leak.
- Undo of hosted door may not close the wall opening's geometric hole (descriptor lingers).
- Redo after a failed handler corrupts the redo stack invariant.
- Room store not in ring-buffer map — undo of wall delete brings the wall back but the room doesn't reappear until next mutation.
- `ClearProjectCommand` clears stores but doesn't dispatch `selection.clear` or `gizmo.detach` → stale gizmo handles.

---

## §3 — Project load / save / restore

### Blockers
- **L-B1 Resilient import silently drops invalid elements; autosave then permanently overwrites the source snapshot.** Every element type can fail-and-drop. The 5-second "see console" toast is the only signal. After ≤20 autosaves the dropped data is gone from local AND server.
- **L-B2 No optimistic concurrency on server saves.** Server supports `If-Match`/412; client never sends it. Two tabs / two collaborators → last writer silently wins; the slower client's edits go into the void.
- **L-B3 Standalone slab/floor openings (`OpeningStore`) serialize but never restore.** Cut a stairwell hole, save, reopen → solid slab. Next autosave permanently drops the field.

### Highs
- **L-H1** Wall baseline-trim drift across load cycles — walls progressively shorten across save/load/save round-trips (`_sourceBaseLine` written by serializer but never plumbed through `CreateWallCommand`).
- **L-H2** `beforeunload` emergency save writes only to localStorage; the server save is `fetch` (cancelled by browser tab-close), no `navigator.sendBeacon`.
- **L-H3** `setLoading` depth race — nested true/true/false/false can autosave a partially-loaded scene.
- **L-H4** A→B→A rapid project switch within 1s drops A's unsynced edits.
- **L-H5** Old snapshot rooms with `boundingWallIds` pointing at dropped walls leave stale relationships in semantic graph forever.
- **L-H6** Schema forward-compat is a `console.warn` + pass-through (older client opens newer snapshot, autosave then downgrades, data lost).
- **L-H7** `MigrationEngine` never validates outputs against target schema — a buggy migration silently drops fields.
- **L-H8** Project-load failures emit only console + toast; no "Show last load report" UI.
- **L-H9** Autosave failures emit only a status-pill change; no banner. localStorage quota exhausted mid-session = silent total-work loss.

### Mediums (selected)
- Idempotency key collision risk (5-char random + millisecond — collisions probable for two simultaneous collaborators).
- `requestIdleCallback` Safari fallback is no-delay → thumbnail capture LONGTASK on Safari.
- 4-second post-load settle window too short for 1000-element projects.
- `ClearProjectCommand` named-loop + `projectScopeRegistry.clearAll()` duplicate-clears + may miss future stores.
- Version preview "Restore Working State" path serializes the entire scene synchronously before showing the spinner → 1+ s UI freeze.
- Server "latest-version" auto-restore overwrites local version-count to 1 regardless of actual server count.
- Annotation dependency-graph rebuild failures continue silently — stale dimensions persist.
- `_planRejectsSync` latch drops EVERY queued version on a single bad-version 400 — loses good queued versions too.

---

## §4 — Camera, view switching, selection, picking

### Blockers
- **C-B1 `zoom-fit` and `zoom-selected` toolbar buttons are dead.** No handler registered. Clicks do nothing.
- **C-B2 Plan view yanks camera back to "fit all" after every element commit.** `PlanViewManager._onProjectionStale:517` resets `_hasFitDrawing=false`. User zooms into a corner to draw walls → loses position on every wall.
- **C-B3 100 m maxDistance hard cap.** Cannot frame buildings >80 m or step out for a site view.
- **C-B4 maxPolarAngle clamp blocks horizontal and below-horizon views.** No true eye-level elevations; no looking up at a soffit.

### Highs
- **C-H1** Triple-dispatch of `bim-canvas-world-click` (hover + GPU + BVH all dispatch on one click) → operation tools (Join/Cut/Mirror) double-fire their state machines.
- **C-H2** Per-view camera save drops zoom on ortho cameras → switch L0↔L1↔L0 loses working zoom.
- **C-H3** `_currentViewDefinitionId` fallback guesses first plan view when caller omits it — wrong-key persistence.
- **C-H4** Hover stays armed during camera drag → after orbiting, click within 8 px of OLD hover position selects the wrong element.
- **C-H5** Stuck `isTransitioning` silently drops view-tab clicks for 5 seconds.
- **C-H6** `zoomToAll()` type-whitelist filters out lighting/plumbing/opening/dimension/annotation → projects with only those get framed by fallback (tiny far-away camera).
- **C-H7** Marquee box-select is 3D-only; not implemented in plan view or SVP. Revit's most-used selection action.
- **C-H8** Section view always animates while plan/elev snap → noticeably laggier section open.

### Mediums (selected)
- Split-view 3D first-element framing is one-shot AND regex-limited (doors/windows/furniture don't trigger).
- Plan view pan/zoom NEVER persisted (no `PlanViewCameraStateStore`) — plan↔3D↔plan wipes it.
- Marquee highlights persist briefly across view switch.
- **Selection cleared on every view switch** (`ViewController.activate:845` `unselectAll`). Revit/ArchiCAD preserve.
- `SplitViewManager.refitCamera()` exists but never called from any creation handler.

---

## §5 — Colors, materials, system types, finishes, visibility

### Blockers
- **M-B1 Custom Wall and Slab System Type IDs are regenerated on save/load.** `WallSystemTypeStore.add()` does `id: crypto.randomUUID()`. Architect creates "Brick 350 Custom", assigns to 40 walls, reopens project → all 40 walls reference a UUID nobody has. Walls fall back to built-in defaults; schedules show "—". Ceiling/Floor already accept explicit `id`; Wall/Slab don't.
- **M-B2 `vgInstanceOverrideStore` per-element-per-view graphic overrides are NEVER persisted.** Architect overrides one wall to red in Plan-GF only → saves → reopens → override is gone. Modern intent path persists; legacy bridge doesn't.

### Highs
- **M-H1** Walls / roofs / curtain-wall mullions / door+window glazing never resolve `materialId` against `STANDARD_MATERIAL_LIBRARY` — only `materialColor` (hex) is read. "Steel Stainless Polished" looks identical to "Concrete Smooth" in the viewport. Slabs are the only element that does it right.
- **M-H2** Plan-view symbols and edges are hard-coded **black** (`0x000000`). A red feature wall is a black line in plan. Furniture symbols are grey regardless of upholstery.
- **M-H3** Duplicate `doorSystemTypeStore` singleton in two packages (geometry-door AND core-app-model). State-drift trap once anyone imports the other.
- **M-H4** "unknown systemTypeId `dt-solid-timber`" warning — door/window custom system types are NOT serialized to the snapshot at all. Custom door types wiped on every reload (built-ins survive via code re-seed).
- **M-H5** Window glass + door panel inner-material colors are hard-coded (`0x88ccff` glass, `0x8d6e63` panel) — system-type tint never applied.
- **M-H6** `wall.setColor` + `wall.updateDimensions` dispatched separately by inspector — race causes color flicker / revert on combined edits.
- **M-H7** `vgInstanceOverrideStore.deserialize()` (if fix lands) emits per-entry → N applyAll → 2-5s freeze on 500-override projects.

### Mediums
- Zod schemas omit fields the runtime depends on (door `systemTypeId`/`frameFinish`, window same, curtain-wall `mullionColor`, furniture `color`, stair/beam `materialColor`) — silent strip when migration to `*.parse(snapshot)` lands.
- `windowSystemTypeStore`/`doorSystemTypeStore` register `clearCustomTypes` for project switch but no restore (= permanent loss).
- Phase 5 SSGI `_ssgiNeedsFullRebuild` flag race under heavy load.

---

## §6 — Snapping, annotations, plan symbols, collaboration UX

### Blockers
- **S-B1 Concurrent-edit conflict UI is built but never wired.** `ConflictResolutionDialog`, `ConflictDisclosureBanner`, `CRDTConflictResolver` all exist; `YjsDocAdapter.onConflict(...)` is never registered. P8 violated.
- **S-B2 DXF and PDF export plugins are empty stubs.** Real DXF/PDF only accessible via the sheet editor; toolbar "Export PDF" calls `window.print()`.
- **S-B3 `@pryzm/plugin-multiplayer` (Yjs-awareness cursor / peer-list / lock UI) is orphaned.** `apps/editor` uses a simpler socket.io DOM overlay with no view-awareness or lock UI.

### Highs
- **S-H1** Remote selection broadcast is a no-op (`AwarenessSelectionLayer._subscribeToSelections` early-returns). Two collaborators never see each other's selections.
- **S-H2** Door / Window placement bypasses SnapManager entirely (1.5 m fixed proximity; no midpoint / endpoint / centerline snap).
- **S-H3** Dimension / annotation tools bypass SnapManager → cannot dimension between a grid intersection and an endpoint.
- **S-H4** Snap indicator pinned to `y = 0.1` → invisible behind the slab on upper levels.
- **S-H5** 3D snap visualizer uses Three.js scene objects; plan snap uses Canvas2D overlay → two parallel UIs that drift in look and feel.
- **S-H6** `(window as any).wallStore` in SnapManager — P4 violation; coupled to window contract.
- **S-H7** `OBCAnnotationAdapter` + `LinearDimensionAnnotationTool` still call `window.commandManager` (`TODO(TASK-06)`).
- **S-H8** Two parallel dimension systems (`plugin-dimensions` L7 vs `plugin-annotations`); only annotations persists.

### Mediums
- No parallel-line snap provider.
- Default 0.5 m snap radius regardless of camera zoom.
- Catch-up replay uses `sessionStorage.lastSync` (per-tab, lost on browser close).
- `REDETECT_ROOMS` + AI batch commands explicitly NOT broadcast to collaborators — AI floor-plan invisible until reload.
- Snap candidates silently dropped during element mutation.
- Annotation `_orphaned` flag set but no UI renders it.
- Yjs batch-conflict descriptor opaque ("remote-change-during-blackout", no values).

---

## §7 — Prioritised fix queue (sequenced for least re-work)

**Sprint 1 — daily-use cliff-edges (2–3 days):**
T-B1, T-B2, T-B7 (move tool), C-B1 (zoom-fit/sel), C-B2 (sticky plan zoom), C-B3 (camera cap), C-B4 (polar angle), M-B1 (wall+slab type ID), T-H5 (furniture rotation), T-H7 (door radius), L-B3 (slab opening restore).

**Sprint 2 — undo/redo + collab silent-loss (3–4 days):**
U-B1, U-B2, U-B5 (undo stack hygiene), L-B2 (If-Match), L-B1 (load quarantine + blocking modal — also `PRODUCTION-READINESS-AUDIT §B10`), S-B1 (wire conflict UI), L-H2 (sendBeacon).

**Sprint 3 — material fidelity + view UX (3–4 days):**
M-H1 (walls/roofs/CW materialId resolution), M-H2 (plan-edge color), M-H4 (door/window types persist), C-M6 (preserve selection across views), C-H1 (triple-dispatch), C-H7 (marquee in plan).

**Sprint 4 — polish + completeness (1+ week):**
T-H3 (stair gizmo UX), T-H6 (column type), H-2-H3 snap reach, U-H6 multi-select delete, U-H7 slab cascade, view template / view creation / section, S-B2 export PDF/DXF, S-B3 multiplayer cursor.

---

A live fix-log is in `DAILY-USE-FIX-LOG-2026-05-20.md` (companion document).
