# C16 — Command Authoring Protocol (Level-Oriented, Semantic-First)

> **Stamp**: 2026-05-25 · **Status**: CANONICAL
> **Authority**: this contract governs **how a new command is created** in PRYZM 3 — the anatomy, the pipeline it must obey, and the two doctrines (level-oriented, semantic-first) every command MUST honour. It is the single **front door** for command authoring; it does not restate the depth held by the contracts it cites.
> **Tier**: contract (C00-INDEX tier 3). Where the Vision (`03_PRYZM3/01-VISION.md`) or Architecture (`02-ARCHITECTURE.md`) disagree, they win — amend this contract.

> **Anchors (read alongside, do not duplicate):**
> - `01-VISION.md §2` — the 8 principles (P1–P8); this contract operationalises **P6** (commands are the only mutation path) and **P8** (every new exported fn ≥ 1 OTel span).
> - **C03** — the command **interface**, store model, and undo/redo (`§2`, `§4.5` `performUndoRedo`).
> - **C11** — the end-to-end **creation pipeline** (UI / AI / remote entry → bus → handler → geometry → room redetect), the per-element compliance matrix, and the §11.2 "add a new element type" checklist.
> - **C15** — hosted elements (doors/windows in walls) author a *two-part* command (host + opening).
> - **C09** — AI-initiated commands (intent → command), cost governance.
> - **C10** — NFTs + OTel span requirement (CI gate).
> - **§41** (`41-ELEMENT-PREVIEW-VISUAL-CONTRACT.md`) — creation previews are unified PRYZM purple.

---

## §1 — Why this contract exists

PRYZM had no single document that answers *"I am adding a new command — what, exactly, must I do?"* The knowledge was spread:

- **C03 §2** defines the command **interface** and the CQRS rule.
- **C11 §5 / §11.2** defines the creation **pipeline** and a per-element-type checklist.
- **C03 §4.5** defines **undo/redo** (`performUndoRedo`).
- Performance lore (batch coalescing, `runBatch`, `registerMany`) lived only in fix-log rounds and memory notes.

Two cross-cutting properties were **assumed but never codified as binding**:

1. **Level-orientation** — every BIM element belongs to exactly one level (or a level *span*); a command that does not resolve, assign, and register a `levelId` produces an element that is invisible to level filtering, mis-projected in plan, and unreachable by per-level batch/instancing. This was the live root cause of the 2026-05-25 *"hide-by-level shows all walls"* bug (§INSTANCED-LEVEL-VIS).
2. **Semantic-first** — geometry is a *projection* of the semantic model, never its source of truth. A command that builds a mesh before (or instead of) registering the element in the **semantic registry** (`elementRegistry`) creates an element the schedule, AI query, IFC export, and visibility-intent layers cannot see. This is the foundation the **Semantic Design Assistant** (SPEC, see §9) is built on.

C16 makes both **binding doctrines** and gives the one authoritative authoring checklist (§10).

---

## §2 — The two governing doctrines

These are command-authoring doctrines at the contract tier. They **refine**, and never contradict, P1–P8. Both are merge-blocking once their CI gates land (§11); until then they are review-blocking.

### §2.1 — `CA-DOCTRINE-L` — Level-Oriented

> **Every command that creates, moves, or re-parents a BIM element MUST resolve a canonical `levelId`, stamp it on the element, and register the element against that level in all three level-keyed authorities.**

The three level-keyed authorities (all real, all in `packages/core-app-model`):

| Authority | API | Purpose | Failure mode if skipped |
|---|---|---|---|
| **Spatial** (`BimManager` / `BimKernel`) | `bimManager.registerElement(id, levelId)` · `registerMany(ids, levelId)` | the spatial tree; level elevation resolution; `SpatialAuthority` throws if a builder asks for an element's level and it was never registered | wall placed at elevation 0; `SpatialResolutionError` |
| **View** (`ViewDependencyTracker`) | `viewDependencyTracker.registerElement(id, levelId)` | drives plan/elevation reprojection per level (`EdgeProjectorService`); `_elementLevelMap` | element never re-projected into the floor plan; stale 2D |
| **Render visibility** | `obj.userData.levelId = levelId` on the scene object **and** the per-level instancing key (`InstancedElementRenderer._hashGeometry(geo, mat, levelId)`) | Project-Browser hide-by-level (`applyLevelVisibility` matches `userData.levelId`) | element stays visible when its level is hidden (the §INSTANCED-LEVEL-VIS bug) |

**`levelId` resolution order (normative):** explicit payload `levelId` → the source element's `levelId` (e.g. walls-from-slab inherit the slab's level) → the active level (`bimManager` active level). A command MUST NOT default a missing `levelId` to `0`/elevation-0 silently; it MUST fail `canExecute()` with a reason.

**Multi-level elements.** A *span* element (e.g. a stair: `baseLevelId → topLevelId`, see C11 §11.3) MUST register against its base level and MUST validate the second level exists in `canExecute()`. It is a deliberate no-op (with a user toast), not a defect, when the required second level is absent.

Anchors: P6; C11 §10.2 Bridge Invariants 1/4/7; C13 (level state must not leak across projects).

### §2.2 — `CA-DOCTRINE-S` — Semantic-First

> **A command MUST establish the element's identity in the semantic model before, or atomically with, any geometry. Geometry is derived; the semantic record is canonical.**

The semantic authority is `elementRegistry` (`packages/core-app-model/src/ElementRegistry.ts`):

- `elementRegistry.registerSemantic(id, storeType)` — first creation; **throws on duplicate id**.
- `elementRegistry.registerSemanticOrReplace(id, storeType)` — **redo-safe**; use on the redo path so re-execution after undo does not crash (this throw was historically the single most common redo crash — C03 §4).

Ordering rule (normative): within a create command the sequence is **semantic register → spatial register → store mutation (which triggers deferred geometry) → view register → event emit**. Two of these (semantic, spatial) MUST precede the store `add()` so that a builder firing synchronously off the store event can resolve the element's level and type.

A command whose element has **no geometry** (e.g. a room requirement, a tag, an underlay, a view definition) still has a semantic record or declares `affectedStores` against a non-geometry store; it does **not** register with `ViewDependencyTracker` or stamp a render `levelId`.

Why this is a doctrine and not a nicety: the schedule engine, IFC4 export (D1 — lossless round-trip), AI query/critique (C09), and visibility-intent (P7) **all read the semantic registry, never the THREE scene**. An element that exists only as a mesh is invisible to every one of them. The Semantic Design Assistant (§9) is *only* possible because every element is semantic-first.

Anchors: P5 (schemas pure — the semantic shape is an L0 Zod entity); P7; D1; C03 §1.

---

## §3 — Command taxonomy — decide what you are authoring

Pick the row that matches; it fixes your exemplar and your obligations.

| Kind | Example types | Reference exemplar | Key obligations |
|---|---|---|---|
| **Single-element create** | `CREATE_WALL`, `CREATE_SLAB`, `CREATE_COLUMN` | `plugins/wall/src/handlers/CreateWall.ts` (C11 §11.5 — the **reference** handler) | CA-1…CA-11, CA-13, CA-14 |
| **Batch / "on-all" create** | `CREATE_WALLS_ON_ALL_SLABS`, `CREATE_CURTAIN_WALLS_ON_ALL_SLABS`, `CREATE_SLABS_ON_ALL_FLOORS` | `CreateCurtainWallsOnAllSlabsCommand` (grade A+) | all of the above **+ CA-12** (runBatch + registerMany) |
| **Bus batch handler** | `wall.batch.create`, `slab.batch.create` | `plugins/wall/src/handlers/CreateWallBatch.ts` | ONE `produceCommand` over the whole set → one PatchPair → one undo entry; CEB fans out one `X.created` per element (by design) |
| **Hosted (two-part)** | doors/windows in walls | C15 + `_reconcileWallOpenings` | host update **and** opening lifecycle in one undo unit (C15) |
| **Update / transform** | `UPDATE_WALL_BASELINE`, `MOVE_DOOR`, `SCALE_ELEMENT` | C11 §11.14–§11.16 | CA-3, CA-8, CA-9, CA-11, CA-14; re-register only if `levelId` changes |
| **Delete / lifecycle** | `DELETE_ELEMENT`, `REMOVE_COLUMNS_ON_LEVEL` | C11 §11.18 | unregister from **all three** level authorities **and** the semantic registry; undo re-registers |
| **Semantic / non-geometry** | `TAG_ELEMENT`, `SET_ROOM_REQUIREMENT`, `CREATE_VIEW_DEFINITION`, underlay | — | semantic/store record only; **no** VDT/render levelId |
| **AI-initiated** | any of the above with `source:'ai'` | C09 + C11 §4 | as the underlying kind **+ §9** (intent mapping, no-undo, batch) |

---

## §4 — Command anatomy: the two backends (transitional reality)

PRYZM 3 is mid-migration; two command shapes coexist (C03 §4.3). **Author new commands on the bus path** unless you are extending an element family that is still legacy-only.

**Path B — Bus handler (TARGET).** Register a typed handler with `runtime.commandBus`; mutate the **L1 Immer store** via `produceCommand()` → forward/inverse `PatchPair`; the `CommandEventBridge` (CEB) emits `X.created`; the `initTools` `§P*.1` bridge mirrors into the legacy store that drives the mesh (C11 §10.1 two-layer bridge). Undo is patch-based via the ring buffer. This is C11 §5's contract.

**Path A — Legacy `Command` (TRANSITIONAL).** Implement the `Command` interface (C03 §2.2 / `command-registry/src/types.ts`): `canExecute` / `execute` / `undo` / `serialize`, with `readonly affectedStores` (**REQUIRED** — `StoreKey[]`) and optional `nonUndoable`. Snapshot-based undo via `CommandManager`. Still authoritative for stair, several "on-all" commands, and annotation/view families.

**Dual-dispatch** (8 tools today) write **both** — bus *and* commandManager — so the shadow-drop in `performUndoRedo` (`CommandManager.dropEntriesForTargets`) removes the twin. If you add a dual-dispatch command, it MUST be drop-covered (C03 §4.6).

Both paths MUST satisfy the §5 invariants. The doctrines (§2) are backend-independent.

---

## §5 — Authoring invariants (`CA-1` … `CA-16`) — binding

Every create command MUST satisfy CA-1…CA-11 + CA-13 + CA-14 + CA-16; batch adds CA-12; serialisable/syncable adds CA-15.

- **CA-1 — Type registration.** Add the type to the canonical registry (bus `commands.ts`, or `CommandType` enum for legacy). No magic-string dispatch.
- **CA-2 — Deterministic, stable IDs.** Pre-generate element ids in the tool/handler entry, not deep inside `execute()`. Ids MUST be **identical across redo** (e.g. `wall-slab-${cmdId}-${i}`), and ifcGuid pre-generated and stable (so IFC export is stable across undo/redo). C11 §11.4/§11.5.
- **CA-3 — `canExecute` validation.** Validate domain invariants **before any mutation**: referenced level(s) exist, payload in bounds, no duplicate id, geometry non-degenerate (e.g. `signedAreaXZ` ≠ 0, min length/width). Fail with a `reason`; never silently succeed. (Throw a typed `DomainError` on the bus path.)
- **CA-4 — Level resolution & assignment** *(CA-DOCTRINE-L)*. Resolve `levelId` per §2.1 order; stamp it on the element entity and on the scene object's `userData.levelId`.
- **CA-5 — Semantic registration** *(CA-DOCTRINE-S)*. `elementRegistry.registerSemantic(id, storeType)` on first execute; `registerSemanticOrReplace` on redo. Precedes store `add()`.
- **CA-6 — Spatial registration.** `bimManager.registerElement(id, levelId)` (or `registerMany` in batch). The **command** owns this call — `SpatialAuthority` will throw later if it is missing (stores no longer do it implicitly; see `BeamStore`/`HandrailStore` §3.5 notes).
- **CA-7 — View registration.** For geometry elements with plan/elevation representation: `viewDependencyTracker.registerElement(id, levelId)`, and the element's `elementType` MUST be in `GEOMETRY_ELEMENT_TYPES` (`ViewDependencyTracker.ts`).
- **CA-8 — Store mutation.** Bus: `produceCommand()` Immer patch pair. Legacy: `store.add()` (prefer `addMany` in batch). The store `add()` MUST emit `storeEventBus` with `{ elementType, operation, elementId }` (C11 §11.2 step 4).
- **CA-9 — Geometry is frame-deferred.** MUST NOT build geometry synchronously in the handler/`execute`. Defer via `FrameScheduler` (P3). For walls, the store event → `WallRebuildCoordinator` flush owns the build.
- **CA-10 — Event emission.** Bus: CEB emits `X.created` with the **full geometry payload** (id, levelId, all coordinates) — never a bare `{id}` unless the builder resolves from the store by id (the authoritative-store convention, e.g. stair). MUST use `runtime.events.emit`, never `window.dispatchEvent` (C11 §5.3).
- **CA-11 — Undo / redo.** The command MUST be reversible through the **single unified path** `performUndoRedo` (C03 §4.5). Bus: ring-buffer patch pair. Legacy: snapshot `undo()`. If the element family is in the ring-buffer store map, ensure its `storeType` key is present (`buildUndoStoreMap`); redo MUST restore the *captured legacy shape* (REDO-SHAPE-FIX) and use `registerSemanticOrReplace`. Background side-effect commands (e.g. `REDETECT_ROOMS`) MUST set `nonUndoable` and provide a no-op `undo()`.
- **CA-12 — Batch coalescing** *(batch kinds only)*. Wrap the mutation loop in `batchCoordinator.runBatch(fn, { levelIds, totalElementCount, skipPbrUpgrade?, skipRedetectRooms? })` on **first** execute (run `fn()` directly on redo when `createdCommands.length > 0`); register per-level via `bimManager.registerMany(ids, levelId)` queued through `batchCoordinator.trackRegistration` (§REG-MANY-P1). Never the deprecated `beginBatch`. See §8.
- **CA-13 — Preview.** Any creation preview/ghost MUST be unified PRYZM purple `#6600FF` via `PreviewStyle.ts` (§41). No bespoke preview colour.
- **CA-14 — Observability.** Wrap the handler/execute body in ≥ 1 OpenTelemetry span (`withHandlerSpan`) — **P8 / C10, merge-blocking**. No span = no merge.
- **CA-15 — Serialisation.** Provide `serialize()` (legacy) or a serialisable payload (bus) — no class instances/functions in payload (C03 §2.2) — so the command round-trips through sync (`source:'remote'`, C03 §2.4) and persistence.
- **CA-16 — Cross-element effects via events only.** A handler MUST NOT write another family's store (a wall handler MUST NOT touch the room store). Cross-element reactions (room redetect after walls) are **event subscribers**, frame-yielded, never a synchronous imperative loop (C11 §4.2/§6.3).

---

## §6 — Level-orientation in detail

1. **One element, one level (or a declared span).** The `levelId` is part of the element's identity, not a render hint.
2. **Resolution order is normative** (§2.1). A command that cannot resolve a level fails `canExecute`.
3. **Register against all three authorities** (§2.1 table). The §INSTANCED-LEVEL-VIS bug was a render-visibility miss: the instanced group key included `levelId` but the group mesh's `userData.levelId` was never stamped, so plain (instanced) walls ignored hide-by-level while non-instanced walls obeyed it. Fix: stamp `group.mesh.userData.levelId` in `InstancedElementRenderer.register()`. **Lesson encoded as CA-4.**
   - **§INSTANCED-ISOLATE-FIX (2026-05-25) — render visibility must cover *both* hide and isolate.** An instanced/aggregated group (one `InstancedMesh` per geometry×material×level for plain batch walls) carries `userData.levelId` + `userData.elementType` but **no per-element `userData.id`** — it stands in for many elements. The hide path matches `userData.levelId` (works), but the **isolate / per-element re-apply / reset** traverses are **id-keyed** and skip id-less objects, so isolation left batch walls visible on every level. A command whose elements may be instanced MUST therefore (a) stamp the real `elementType` on the group (not a generic placeholder), and the visibility layer MUST (b) resolve instanced aggregates **by level (+ type)** in *every* visibility traverse — hide, isolate, re-apply, reset — not only the hide path. Curtain walls were unaffected because their group carries a real id. Fix: `WallInstanceBridge`/`InstancedElementRenderer` stamp `elementType='wall'`; `ProjectVisibilitySection.applyIsolate`/re-apply/`resetAllVisibility` handle `userData.isInstancedGroup` by level/type.
4. **Re-parenting** (`CHANGE_WALL_LEVEL`, `UPDATE_SLAB_LEVEL`) MUST update **all three** authorities and the render `userData.levelId`, and re-key any instanced membership.
5. **Level lifecycle** (C13): registrations MUST be torn down on project switch; no per-level state may leak across projects.

---

## §7 — Semantic-first in detail

1. **The semantic record is canonical; geometry is its projection.** Never read geometry back into the semantic model (C04/C11; "geometry only, never read back into stores").
2. **Register before geometry** (§2.2 ordering). Builders that fire synchronously off a store event resolve type+level from the registries.
3. **Redo-safe semantics.** Redo paths use `registerSemanticOrReplace`; delete-undo re-registers.
4. **Semantic consumers** (must all be able to see your element): schedules, IFC4 export (D1), AI query/critique (C09), visibility-intent (P7), the spatial tree.
5. **Non-geometry elements** are still semantic-first via their store/registry record but skip view + render-level registration (§3 row "semantic/non-geometry").
6. **This is the substrate for the Semantic Design Assistant** — room tags, adjacency graph, facade orientation, fire compartments, furniture rules — every one queries the semantic registry. See §9 + the SPEC.

---

## §8 — Batch command authoring (performance contract)

Canonical pattern (audited 2026-05-25, fix-log Round 62; memory `batch-creation-perf-pattern`):

```
batchCoordinator.runBatch(fn, { levelIds, totalElementCount, skipPbrUpgrade?, skipRedetectRooms? })
  · _setupBatch → pauses wall/CW/slab builders + suppresses ViewDependencyTracker
  · fn() runs: store.add() per element (buffered by StoreEventBus at depth 2)
  · per-level bimManager.registerMany(ids, levelId) via trackRegistration  (§REG-MANY-P1)
  · deferred resume() (next pre-render) → ONE coalesced builder flush
  · build queue drains → signalBuildQueueDrained → _executeFinalSweep
       → ONE endBatchYielded drain (≤200 events/frame) → ONE REDETECT_ROOMS per level
```

Binding rules:

- **B-1** Use `runBatch`, never `beginBatch` (the latter can leave the bus stuck on throw).
- **B-2** `skipRedetectRooms: true` for element families that cannot bound a room (curtain walls, slabs-as-decks, furniture, beams).
- **B-3** `skipPbrUpgrade: true` for families whose materials are already PBR-ready.
- **B-4** Hoist any duplicate-scan out of the inner loop (the `CreateAllSlabsFromLevelToAllFloors` O(N²) laggard; commit `8919f20`).
- **B-5 — Post-batch wall-join invariant (NEW, see §12 OI-057).** After a wall batch, exactly one `WallJoinResolver.resolveLevel(levelWalls)` pass MUST run per affected level **with all walls present**. In the current architecture this is delivered by the deferred `resume() → WallRebuildCoordinator._flush()` path (which reads `store.getAll().filter(levelId)` at flush time, i.e. the complete set). Authors of new batch-wall paths MUST route through this flush and MUST NOT mark walls built without a level join pass. This invariant is currently **timing-implicit and untested** — see §12.

---

## §9 — AI-initiated command authoring

AI is an *entry point* (C11 §4), not a parallel pipeline. An AI command converges at the same bus and obeys §5.

- **Intent → command mapping.** An AI prompt resolves to a typed `AIIntentType` (`packages/ai-host/src/intents.ts`) → a `CommandProposal` (`command-registry/types.ts`) → a real command. New AI-reachable capability requires (a) an intent enum entry, (b) a proposal builder, (c) the underlying command satisfying §5.
- **`source:'ai'` MUST NOT push to the undo buffer** (C03 §4.2 / C11 §4.1); the user undoes the *gesture* that asked the AI, per product decision.
- **Multi-element AI output MUST batch** (§8 / C11 §4.2): dispatch one `X.batch.create`, not a per-element loop.
- **Semantic-first is what makes semantic prompts possible.** "Add windows to every south façade", "place a WC in every bathroom", "columns on grid intersections" are only answerable because rooms, façades, grids, and tags are semantic records (§7). The **Semantic Design Assistant** build (the 50-prompt catalogue) is specified in `docs/03_PRYZM3/reference/specs/SPEC-SEMANTIC-DESIGN-ASSISTANT.md` (forthcoming) and is **governed by this contract** — every capability it adds ships as a §5-compliant command.

---

## §10 — The authoring checklist (single source — copy when adding a command)

```
COMMAND: <type>   KIND (§3): <single | batch | bus-batch | hosted | update | delete | semantic | ai>

□ CA-1  Type registered (bus commands.ts / CommandType enum)
□ CA-2  Deterministic ids + ifcGuid, stable across redo
□ CA-3  canExecute: level(s) exist, payload in bounds, geometry non-degenerate, no dup id
□ CA-4  levelId resolved (§2.1 order) + stamped on entity AND scene userData.levelId      [DOCTRINE-L]
□ CA-5  elementRegistry.registerSemantic (registerSemanticOrReplace on redo) BEFORE store add [DOCTRINE-S]
□ CA-6  bimManager.registerElement(id, levelId)  (registerMany in batch)
□ CA-7  viewDependencyTracker.registerElement(id, levelId); elementType ∈ GEOMETRY_ELEMENT_TYPES  (geometry only)
□ CA-8  store mutation: produceCommand patch pair (bus) / store.add(+addMany) (legacy); emits storeEventBus
□ CA-9  geometry build frame-deferred (FrameScheduler) — never synchronous
□ CA-10 runtime.events.emit('X.created', {full geometry}); CEB case + initTools bridge (new element type)
□ CA-11 reversible via performUndoRedo; store key in buildUndoStoreMap; redo restores legacy shape; nonUndoable for side-effects
□ CA-12 batch: runBatch + registerMany + trackRegistration; redo runs fn() directly  (batch kinds)
□ CA-13 preview = #6600FF via PreviewStyle (§41)
□ CA-14 ≥1 OTel span (withHandlerSpan) — P8, merge-blocking
□ CA-15 serialize()/serialisable payload — round-trips sync + persistence
□ CA-16 no cross-family store writes; cross-element effects via event subscribers (frame-yielded)
□ C11 §11.2 followed for a NEW element type (CEB case + initTools bridge + legacy store event + GEOMETRY_ELEMENT_TYPES)
□ C15 followed if hosted (two-part: host update + opening lifecycle in one undo unit)
□ Update C11 §11 per-element matrix; verify C11 §8.4 runtime gate (appears in plan ≤ 400 ms in split-view)
```

---

## §11 — Verification gates

**Static (CI, hard-fail — existing):**
- `ci-check-no-direct-store-writes` (P6) · `ci-check-no-window-any` (P4) · `ci-check-single-raf` (P3) · `check:commandmanager` (no new `commandManager.execute()` in src/) · boundary lint (C01).
- Per-PR OTel span check (P8 / CA-14).

**Static (CI, NEW — to land with this contract; soft-fail → hard-fail):**
- **G-CA-L** — a create command's handler that calls `store.add`/`produceCommand` for a geometry family MUST also reference `registerElement`/`registerMany` (level registration present). Soft-fail counter today.
- **G-CA-S** — a create command for a geometry family MUST reference `registerSemantic`/`registerSemanticOrReplace`. Soft-fail counter today.

**Runtime (browser observation):**
- C11 §8.3 single create; §8.4 plan-view ≤ 400 ms; §8.2 batch (no LONGTASK).
- **Level-visibility gate** — create N elements across 2 levels, hide one level: only the other level's elements remain (covers §INSTANCED-LEVEL-VIS). 
- **Undo/redo gate** — create → undo → redo restores identical geometry + semantics (C03 §4.5).

---

## §12 — AS-IS gaps / backlog

- **OI-057 — Post-batch wall-join is correct but timing-implicit & untested.** *Diagnosis (2026-05-25):* batch-wall joins **are** resolved post-batch — `CreateWallsOnAllSlabsCommand` wraps in `runBatch`; `_setupBatch` pauses the wall builder; the deferred `resume()` schedules `WallRebuildCoordinator._flush()`, which runs `WallJoinResolver.resolveLevel(store.getAll().filter(levelId))` over the **complete** wall set per level. Single-slab `CreateWallsFromSlabCommand` (no `runBatch`) coalesces to one `_flush` with the same effect. This is why adding a door/window later "fixes" joins — a `wallStore.update` re-triggers the *same* level-wide `resolveLevel` pass. **Two real residual gaps, neither fixed (low-risk-fix or backlog per owner):** (a) the ordering invariant "`resume()→_flush()` runs before `_executeFinalSweep()`'s `discardAndSuppress()` drops events" is **implicit** — guaranteed today only because the build queue cannot drain before `_flush` runs, with **no test** guarding it; (b) the event-sourced **plugin `WallsState`** (from `wall.batch.create`) retains **pre-miter baselines** — the join trim is written only to the legacy `wallStore.baseLine`; a rebuild purely from the plugin store (without a flush) would show untrimmed joins. *Recommended:* add the B-5 invariant test (assert one `resolveLevel` per level post-batch with all walls) before any change to the batch timing; do **not** alter the delicate `runBatch` ordering without it. Tracked here; promote to a SPEC task if the plugin-store baseline divergence surfaces on reload.
- **Backend duality.** Path A (legacy `Command`) remains for stair, several on-all, annotation/view families (C03 §4.3). New commands SHOULD be Path B; the migration end-state is ADR-051 (store unification).
- **G-CA-L / G-CA-S** are counters today; they become hard-fail when the create-command surface is fully bus-native.

---

## §13 — Cross-references

- C03 §2 (interface), §4.5 (`performUndoRedo`), §4.6 (binding undo invariants).
- C11 §2 (pipeline), §5 (handler contract), §10 (two-layer bridge), §11.2 (add element type), §11.5 (wall = reference).
- C15 (hosted two-part commands). C09 (AI). C10 (NFTs/OTel). C13 (project isolation). §41 (preview).
- **C17** (Batch Creation Catalogue & Panel Binding) — the registry of batch prompts that each resolve to a §8/CA-12 command and surface in the CREATE panel.
- `01-VISION.md §2` (P1–P8). Memory: `batch-creation-perf-pattern`, `undo-architecture-three-stores`, `gpu-pick-resolution-and-highlight`.
