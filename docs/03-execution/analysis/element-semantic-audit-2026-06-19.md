# Element Semantic-Nature Audit — full vertical, all element types

- **Status:** LIVE TRACKER — opened 2026-06-19 (founder directive). Seeded with this session's confirmed findings; rows filled in as each element's vertical is audited.
- **Author:** Claude Opus 4.8 (code-reading audit + live-fix log).
- **Scope:** every authored element type, audited end-to-end against its *semantic nature* — i.e. the BIM-engine contract that an element is a **persistent, identified, command-mutated, replayable, undoable** thing, not just a mesh.
- **Method:** for each element, open and read its builder, command set, store, the create/update/delete pipeline, the orchestration (bus handlers + RemoteCommandDispatcher replay), and check against the governing contracts. Every claim cites `file:line`. Nothing paraphrased from memory.

---

## 0. What "semantic nature" means here (the per-element invariants)

Every element MUST satisfy all of these. The audit checks each as a column.

| # | Invariant | Why | Contract |
|---|---|---|---|
| **S1 — Identified** | Has a stable `id` minted once (`createId('<type>')` / ULID), never re-minted on edit. | Selection, undo, collab, schedules, IFC GUID all key on it. | C03 §schemas; §07 §3.4 |
| **S2 — Command-mutated** | All state changes (create/move/rotate/resize/delete) flow through a `Command` on the bus; no direct store writes from UI/tools. | P6 (commands are the only mutation path). | C03; §01-BIM-ENGINE-CORE §2.1 |
| **S3 — Replayable** | Every mutating command has a `CommandRegistry` factory so collaboration catch-up / reconnect re-applies it. | Lose this → element reverts to its created state on every socket reconnect (the "sofa rotates back to origin"). | §30-REAL-TIME-COLLABORATION §3.1; P8 |
| **S4 — Transformable** | Gizmo (TransformControls) commit reads AND sends BOTH position and rotation (and scale where applicable), firing on either change. | Rotate-only drags were silently dropped (no position delta) → lost on rebuild + plan never re-projects. | C04; ADR-0257 |
| **S5 — Undo/Redo** | The command implements `undo()` restoring the prior snapshot; redo re-applies. | Founder requirement; C03 §4.5–§4.8. | C03 |
| **S6 — View-coherent** | A mutation marks dependent views dirty → plan/section re-project so the 2D symbol matches 3D. | "Rotate in 3D, plan doesn't update." | C04; DOC-1.x |
| **S7 — Persisted** | Serialised into the project snapshot + restored byte-faithfully on open. | (Blocked at the platform level by the volatile-DB issue — see §5.) | C03; ADR-0075 |
| **S8 — Contract-clean** | Builder/command/store obey the layer + P1–P8 principles (THREE only in renderer-three, ≥1 OTel span per exported fn, etc.). | CI-enforced. | CLAUDE.md §8 principles |
| **S9 — Edit-surface honest** | The contextual edit toolbar (on selection) exposes ONLY the operations valid for the element's semantic nature, and every exposed op actually commits (round-trips). | "Edit modes are not all the same per element" — and a button that doesn't commit is a lie. | `ElementCapabilities.canDo()`; SELECTION-TOOLBAR-TOOLS plan |

---

## 1. The architectural keystone found this session (applies to ALL elements)

`RemoteCommandDispatcher` (apps/editor/src/engine/RemoteCommandDispatcher.ts) was the systemic root of S3 failures. After F-1.4 it ONLY did `bus.dispatch(command.type)`, and families whose bus handler is NOT keyed by the CommandType silently no-op'd on replay ("~221 families" per its own comment) → every move/rotate/delete done before a socket reconnect was dropped.

**Fixed — §REMOTE-EXEC-FALLBACK** (commit `497f9d54`): the dispatcher already holds the typed command reconstructed by `CommandRegistry`; when the bus dispatch rejects (no handler) it now **executes that command directly** through the authoritative command path. So **a registry factory alone now makes any family replayable** — this is the lever the per-element audit pulls (just ensure each mutating command has a factory).

---

## 2. Master task table (element × invariant)

Legend: ✅ done/verified-in-code · 🟡 partial / needs browser confirm · ❌ gap (fix needed) · ⬜ not yet audited · N/A not applicable.

| Element | S1 id | S2 cmd | S3 replay | S4 gizmo rot | S5 undo | S6 view-sync | S8 contract | Notes / commits |
|---|---|---|---|---|---|---|---|---|
| **Furniture** | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | ⬜ | UPDATE replay added `7c7491e3`; gizmo rotation commit `5572555d`. View-sync should now follow store update — confirm in browser. |
| **Column** | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | ⬜ | Replay factory present; gizmo rotation commit `0dc4be05` (rotation is radians). |
| **Plumbing** | ✅ | ✅ | ✅ (+ MOVE_PLUMBING `2026-06-20`) | 🟡 | 🟡 | ⬜ | ⬜ | UPDATE_PLUMBING_PARAMETERS factory `497f9d54`. **MovePlumbingCommand AUTHORED 2026-06-20** (new MOVE_PLUMBING CommandType + factory; clones position Vector3 + translates bath start/end by the delta; fully undoable; mirrors MoveLighting). The command now exists + replays, with a behavior test (move + bath-delta + undo, 4 tests). **Gizmo wiring LANDED 2026-06-20:** `plumbing.move` bus handler (→ MovePlumbingCommand) + a drag-commit branch in registerTransformDragHandler (handles `plumbingfixture`+`plumbing`, position-anchored/delta like furniture). `move` capability already present (POINT_OPS); no `rotate` (the command is position-only). **ONLY remaining:** in-browser confirmation the gizmo actually attaches to a selected fixture (harmless no-op if not). |
| **Lighting** | ✅ | ✅ | ✅ | ❌ | 🟡 | ⬜ | ⬜ | CREATE/UPDATE/MOVE_LIGHTING factories `497f9d54`. **2026-06-20 finding: MoveLightingCommand is position-only (no rotation), and there are TWO lighting stores** — command-registry `window.lightingStore` (LightingData.position; builds the mesh tagged `elementType='Lighting'`) vs the plugin `lighting` store (`origin`, served by bus `lighting.move`). **Deeper 2026-06-20 finding:** the auto-layout executor (`LightingLayoutExecutor.ts:139`) dispatches `lighting.create` — the **plugin** bus handler → **plugin** store (`lighting[id].origin`), NOT `CreateLightingCommand`/`window.lightingStore`. So the *visible* auto-placed lights are plugin-store-backed and `lighting.move` (plugin handler, `origin += delta`) is the **likely-correct** mover — the reverse of the first read. BUT a grep for the gizmo/SelectionManager recognising `elementType='Lighting'` found **nothing**, so it's unconfirmed the TransformControls gizmo even attaches to a light. **Hard-blocked on browser inspection:** must confirm (a) which store backs the selected mesh, (b) whether the gizmo attaches, before wiring — either store written blind risks a silent no-op. |
| **Stair** | ✅ | ✅ | ✅ | N/A | 🟡 | ⬜ | ⬜ | MOVE_STAIR factory `497f9d54`; **CHANGE_STAIR_SHAPE / UPDATE_STAIR_FLIGHTS / DELETE_STAIR factories added 2026-06-20** (+ lossless `levelHeight` serialize fix on reshape). Rotation is anchor/direction-based (move path handles it), not euler. |
| **Wall** | ✅ | ✅ | ✅ (+ CASCADE_WALL_BASELINE `2026-06-20`, fwd-replay only) | N/A (baseline) | ✅ | ✅ | ⬜ | **Type-on-create ROOT CAUSE FOUND** (`2026-06-20`) — `registerWallHandlers(_bus)` wires NO systemTypeStore → thickness never resolved from the type (stored systemTypeId but default thickness). See Phase 4 effort row. Fix = wire a populated plugin-wall store, browser-verified. |
| **Door** | ✅ | ✅ | ✅ (MOVE_DOOR + UPDATE_DOOR_*) | N/A (hosted) | ✅ | ✅ | ⬜ | Hosted in wall; move = offset. Looks complete — verify. |
| **Window** | ✅ | ✅ | ✅ (MOVE_WINDOW + UPDATE_WINDOW_* + CENTER_WINDOW_IN_WALL `2026-06-20`) | N/A (hosted) | ✅ | ✅ | ⬜ | As door. Verify. |
| **Slab** | ✅ | ✅ | ✅ (full slab factory set) | N/A | ✅ | ✅ | ⬜ | Registry well-covered (slab audit W1). Verify gizmo move. |
| **Beam** | ✅ | ✅ | ✅ | N/A (2-point) | ✅ | ⬜ | ⬜ | Move = translate both endpoints. Rotation = endpoint move. Verify. |
| **Curtain wall** | ✅ | ✅ | ✅ (+ ADD/REMOVE_CURTAIN_GRID_LINE, UPDATE_ALL_CURTAIN_WALLS `2026-06-20`) | N/A (baseline) | ✅ | ⬜ | ⬜ | Move = baseLine translate. REPLACE_CURTAIN_PANEL_TYPE/WITH_DOOR have no registry class (gap). |
| **Roof** | ✅ | ✅ | ✅ (DELETE_ROOF added `1db3b0b4`) | N/A | 🟡 | ⬜ | ⬜ | Phase 1 done. |
| **Floor (finish)** | ✅ | ✅ | ✅ (REMOVE_FLOOR `1db3b0b4`; UPDATE_FLOOR_LAYERS `2026-06-20`) | N/A | 🟡 | ⬜ | ⬜ | UPDATE_FLOOR_BOUNDARY has no registry class (no Command exists yet). |
| **Ceiling** | ✅ | ✅ | 🟡 (REMOVE_CEILING added `1db3b0b4`; **UPDATE_CEILING_BOUNDARY/LAYERS still no factory**) | N/A | 🟡 | ⬜ | ⬜ | Boundary/layers factories remain. |
| **Handrail** | ✅ | ✅ | 🟡 (CREATE/UPDATE/DELETE yes; MOVE_HANDRAIL has no command-registry class) | ❌ | 🟡 | ⬜ | ⬜ | In transform handler (line ~418) — audit rotation; MOVE_HANDRAIL is not a class. |
| **Grid** | ✅ | ✅ | ✅ (UPDATE_GRID + REMOVE_GRID `1db3b0b4`; CREATE_GRID_SYSTEM + TOGGLE_PIN_GRID `2026-06-20`) | N/A | 🟡 | ⬜ | ⬜ | CREATE_GRID / DELETE_ALL_GRIDS have no registry class. |
| **Room** | ✅ | ✅ | ✅ (CREATE/DELETE/UPDATE/RENAME/SET_OCCUPANCY + UPDATE_ROOM_BOUNDARY `2026-06-20`) | N/A | ✅ | ✅ | ⬜ | UPDATE_ROOM_FINISHES has no registry class (no Command exists). |
| **Annotation** | ✅ | ✅ | 🟡 (**CREATE/UPDATE/DELETE_ANNOTATION no CommandRegistry factory**; UPDATE_ANNOTATION has a bus handler) | N/A | 🟡 | ⬜ | ⬜ | Add registry factories so annotations replay. |

### Confirmed registry-factory gaps (S3) from the diff audit
`UPDATE_ANNOTATION`, `CREATE_ANNOTATION`, `DELETE_ANNOTATION`, `CREATE_GRID`, `UPDATE_GRID`, `REMOVE_GRID`, `DELETE_ROOF`, `REMOVE_FLOOR`, `REMOVE_CEILING`, `UPDATE_FLOOR_BOUNDARY`, `UPDATE_FLOOR_LAYERS`, `UPDATE_CEILING_BOUNDARY`, `UPDATE_CEILING_LAYERS`, `UPDATE_ROOM_BOUNDARY`, `UPDATE_ROOM_FINISHES`, `MOVE_HANDRAIL`, `UPDATE_WALL_PROPERTIES`, `UPDATE_DOOR_PARAMETER`, `UPDATE_WINDOW_PARAMETER`, `UPDATE_ELEMENT_PARAMETER`. (Documentation/data-platform commands — views/sheets/schedules/templates/visibility — are intentionally out of scope for the *element* audit.)

---

## 2b. S9 — Edit-operation surface (the contextual edit toolbar)

When an element is selected, `ContextualEditBar` (apps/editor/src/ui/ContextualEditBar.ts) shows a row of edit buttons. They are NOT uniform — `_refreshButtonVisibility()` (line 468) gates each button via `canDo(elementType, opId)` from `ElementCapabilities` (packages/input-host/src/operations/ElementCapabilities.ts), the single source of truth.

**Capability groups (post-fix):**
- `LINEAR_OPS` (wall, curtain-wall, beam, slab, floor, ceiling) = join, cut, mirror, copy, move, align, scale, offset, reference-edit.
- `AREA_OPS` (roof) = mirror, copy, move, align, scale.
- `POINT_OPS` (door, window, plumbing) = mirror, copy, move.
- `RAIL_OPS` (railing, stair, handrail) = mirror, copy, move, offset, reference-edit.
- `column` = mirror, copy, move, **rotate**, align, scale.
- `furniture` = mirror, copy, move, **rotate**, align.
- `floor_plan_underlay` = move, **rotate** (3-point reference), scale.

**Finding (FIXED `fb5e4f59`):** `rotate` and `delete` had **no `operationId`**, so they bypassed `canDo` and were shown **for every element**. Rotate therefore appeared on line/area/baseline elements (wall/beam/slab/roof/curtain-wall) where rotation isn't in the data model and the gizmo commit silently ignores it (`registerTransformDragHandler` only persists rotation for furniture/column). It was a button that did nothing. Now `rotate` is a real `OperationId` gated to the elements that actually rotate-and-commit; `delete` stays universal (correct — everything is deletable).

**Open S9 follow-ups:**
- **plumbing / lighting** are point-rotatable in principle but are NOT wired into `registerTransformDragHandler`, so they get neither move nor rotate commit from the gizmo. Decide: wire them in (then grant `rotate`), or confirm they're parameter/host-edited only.
- **scale on linear walls/beams** (in `LINEAR_OPS`) — is "scale a wall" a real operation, or should walls drop `scale`? Semantic review pending.
- **join/cut on slab/floor/ceiling** (they use `LINEAR_OPS`, not `AREA_OPS`) — intentional for poly-boundary editing, but verify each actually executes.
- Per-element verification that EACH shown op commits (round-trips) — needs the durable DB (S7 gate).

The master table's **S9 column** is added below; ✅ = capability set reviewed and the shown ops confirmed valid-and-committing in code.

## 3. Implementation plan (phased, fix one-by-one)

**Phase 0 — DONE this session.** §REMOTE-EXEC-FALLBACK keystone + furniture/column/plumbing/lighting/stair replay + furniture/column gizmo rotation + wall-type diagnostic. Commits `7c7491e3` `497f9d54` `5572555d` `0dc4be05` `dcb047ca`.

**Phase 1 — Close the S3 registry-factory gaps** (cheap, mechanical, made safe by §REMOTE-EXEC-FALLBACK): add a `CommandRegistry` factory for each command in §2's gap list. One import + one map entry each; verify constructor signature first. No bus handler needed.

**Phase 2 — Close the S4 gizmo-rotation gaps:** extend the rotation-commit pattern (`§FURNITURE-DRAG-ROTATION`) to handrail; decide whether plumbing/lighting should be gizmo-movable and wire them into `registerTransformDragHandler` if so.

**Phase 3 — S6 view-sync verification:** confirm each element's mutation marks the plan view dirty (ViewDependencyTracker tracks the store type) and the 2D symbol re-projects. Add the missing plan-symbol re-inject for any that don't.

**Phase 4 — Wall-type-on-create** (`§DIAG-WALL-TYPE`): browser-repro with the diagnostic → fix the pinpointed link.

**Phase 5 — S8 contract pass:** per-element check of the 8 principles (THREE ownership, OTel spans, layer boundaries) — lowest user-visible value, do last.

> **GATE:** Phases 3–4 (and verification of Phase 0–2) require a durable server DB. Today every deploy wipes the volatile in-memory store, so no test project survives to confirm a fix. **Set `DATABASE_URL` (durable Postgres) on the deploy before claiming any S6/S7-dependent row verified.** See `persistence-cannot-open-project-2026-06-03.md`.

---

## 4. Effort tracking

| Phase | Scope | Est. | Status |
|---|---|---|---|
| 0 | Keystone + 5 elements' replay/rotation + diagnostic | — | ✅ shipped |
| 1 | registry-factory gaps | ~1 day | 🟡 **11 done.** `1db3b0b4`: DELETE_ROOF, REMOVE_FLOOR, REMOVE_CEILING, UPDATE_GRID, REMOVE_GRID. **2026-06-20:** UPDATE_ELEMENT_PARAMETER (generic PropertyPanel apply — ALL types), UPDATE_ELEMENT_MARK, CENTER_WINDOW_IN_WALL, CHANGE_STAIR_SHAPE (+ lossless `levelHeight` serialize fix), UPDATE_STAIR_FLIGHTS, DELETE_STAIR. **Remaining enum gaps are deliberately NOT factory-able:** UPDATE_WALL_PROPERTIES / MOVE_HANDRAIL / REMOVE_OPENING / ASSIGN_ELEMENT_TO_LEVEL have **no command-registry class** (served by PRYZM3 plugin bus handlers, not the registry); CLEAR_PROJECT / IMPORT_PROJECT / LOAD_PROJECT_SNAPSHOT are project-lifecycle (not element replay); CREATE_*_ON_ALL_SLABS / CREATE_GRID_SYSTEM / CREATE_DOORS_BETWEEN_ADJACENT_ROOMS are batch fan-out (the per-element children replay, not the batch); VALIDATE_* / GENERATE_STAIR_GEOMETRY are compute-only. **Cluster 2 (2026-06-20) — 8 more:** ADD_CURTAIN_GRID_LINE, REMOVE_CURTAIN_GRID_LINE, UPDATE_ALL_CURTAIN_WALLS, CASCADE_WALL_BASELINE (forward-replay only — serialize drops per-entry prevBaseLine), TOGGLE_PIN_GRID, CREATE_GRID_SYSTEM, UPDATE_FLOOR_LAYERS, UPDATE_ROOM_BOUNDARY. **= 19 factories total.** **Genuinely-no-class (can't register):** REPLACE_CURTAIN_PANEL_TYPE/WITH_DOOR, CREATE_GRID, DELETE_ALL_GRIDS, ASSIGN_ELEMENT_TO_LEVEL, UPDATE_FLOOR_BOUNDARY, UPDATE_CEILING_BOUNDARY/LAYERS, UPDATE_ROOM_FINISHES, CREATE/UPDATE/DELETE_ANNOTATION — these CommandTypes have no command-registry class (the audit doc's earlier floor/ceiling/room boundary+layers "gaps" were partly speculative; only UPDATE_FLOOR_LAYERS + UPDATE_ROOM_BOUNDARY actually exist as classes). Annotation + the no-class edits need NEW command classes before they can replay — a separate authoring task, not a factory sweep. |
| 2 | handrail rotation + plumbing/lighting drag wiring | ~0.5 day | 🟡 **Investigated 2026-06-20 — blocked, not skipped.** Plumbing needs a NEW MovePlumbingCommand (no position field today); lighting needs a NEW bus bridge to the command-registry `window.lightingStore` (existing `lighting.move` hits the OTHER store) + has no rotation command. Both deferred to a browser-verifiable session. |
| 3 | view-sync verify across 18 elements | ~1–2 days (needs DB) | ⬜ |
| 4 | wall-type-on-create fix | ~0.5 day (needs browser verify) | 🟢 **FIX LANDED TEST-FIRST 2026-06-20 (`56f709b9`).** §WALL-TYPE-WIRE wires a permissive-`has` adapter over `window.wallSystemTypeStore` into `registerWallHandlers` so plan thickness resolves from the chosen type; 2 unit tests prove resolve-vs-placeholder under happy-dom. Pending in-browser confirmation. Prior analysis: **ROOT CAUSE FOUND 2026-06-20.** `engineLauncher.ts:411` calls `registerWallHandlers(_bus)` with **no `systemTypeStore`** → `CreateWallHandler` gets `undefined` → the type→thickness resolution (`CreateWall.ts` §WALL-TYPE-THICKNESS) is skipped and the wall is stored with its `systemTypeId` but rendered at the **default** thickness (plan view). The 3D builder re-resolves from `systemTypeId` so 3D may look right while plan is wrong. **Not a blind one-liner:** the editor's available `wallSystemTypeStore` is `@pryzm/geometry-wall`'s class (`.getById()`), but the handler needs `@pryzm/plugin-wall`'s interface (`.has()`/`.get()`) — passing the wrong one makes `canExecute` throw and **reject every typed wall**, and the PreDraw selector's id-namespace must match the wired catalogue. Added §DIAG-WALL-TYPE-RESOLVE warns in the handler to pin the exact missing link on the next browser test. **Fix = wire a populated plugin-wall `WallSystemTypeStore` (id-matched to the PreDraw selector) into `registerWallHandlers`, browser-verified.** |
| 5 | contract/principles pass | ~2 days | ⬜ |
| 6 (S9) | edit-surface (contextual toolbar) per-element honesty | ~1 day | 🟡 rotate-gating done (`fb5e4f59`); remaining: plumbing/lighting drag decision, scale-on-wall review, verify each shown op commits (needs DB). |

---

## 5. Cross-cutting blocker (not an element bug, but it gates verification)

The server runs a **volatile in-memory project store** when Postgres is unreachable; it is wiped on every restart, and every `git push` redeploys/restarts. So freshly-created projects return `404` on open and load empty. This makes S7 (persistence) untestable and silently undoes the founder's work between deploys. **Durable `DATABASE_URL` is prerequisite to verifying this whole audit.**
