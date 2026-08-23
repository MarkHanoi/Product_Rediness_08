# C16 — Command Authoring Protocol (Level-Oriented, Semantic-First)

> **Stamp**: 2026-05-25 · **Revised**: 2026-08-11 (rev 2 — §5.1 LIVENESS, `CA-17`…`CA-21`) · **Status**: CANONICAL

> ⚠ **Revision 2026-08-11 — the third doctrine, and why it is an AMENDMENT rather than a new contract.**
> Across one session the same defect was found in five independent places: 17 verbs that reported
> SUCCESS while writing a plugin DTO store nothing renders, persists or exports; `roof.update`,
> whose plugin handler SHADOWS the editor bridge at registration (**L-839**); `wall.move`,
> `wall.transform`, `door.move`, `window.move`, `slab.move`, the same defect still unfixed for five
> element kinds; `room.setMaterial`, which accepted a catalogue id and wrote nothing (**L-842**);
> and five P7 visibility handlers that were `console.debug` and nothing else (ISSUE-LOG §8.4).
> **None of them violated any written contract.** They passed CI.
>
> The rule everybody assumed — *a command that reports success has changed the model* — existed in
> exactly two places, both narrower than the defect: **C03 §4.9** states it for the **annotation**
> family alone (*"reading the ledger to render, persist, export … is a defect"*), and **C68 §5.a**
> states it for verbs that carry a **declared chat capability**, enforced by
> `tools/ga-gate/check-chat-capability-coverage.ts` checks 3d/3e over each capability's
> `commandProof`. A verb with no chat capability — which is most of the five above — was inspected
> by neither. C16 is the contract that binds **every** command author, so §5.1 generalises the rule
> here rather than minting a rival document. §5's roster grows `CA-1…CA-16` → `CA-1…CA-21`; nothing
> was relaxed and nothing was deleted. **CA-8 was CORRECTED, not replaced** — as written it blessed
> `produceCommand()` alone as sufficient store mutation, which is the authority the dead verbs were
> written under.
>
> **Enumeration is NOT this contract's job.** *Which* verbs exist and what each one reaches is the
> generated API verb register (`tools/ga-gate/check-verb-register.ts` → `docs/04-reference/API-VERB-REGISTER.md`,
> minted as **C69** by a concurrent stream). C16 states what is REQUIRED; the register measures what
> IS. Cite the register; never transcribe its rows.
> **Authority**: this contract governs **how a new command is created** in PRYZM 3 — the anatomy, the pipeline it must obey, and the two doctrines (level-oriented, semantic-first) every command MUST honour. It is the single **front door** for command authoring; it does not restate the depth held by the contracts it cites.
> **Tier**: contract (C00-INDEX tier 3). Where the Vision or Architecture disagree, they win — amend this contract. ⛔ **CORRECTED 2026-08-18: the two files this contract named as its own superiors DO NOT EXIST.** `find . -name '01-VISION.md' -o -name '02-ARCHITECTURE.md' -not -path '*/node_modules/*'` → **0 matches**, in `docs/archive/pryzm3-internal/` or anywhere else. **The live authorities are [`docs/01-strategy/STR-03-engineering-vision.md`](../../01-strategy/STR-03-engineering-vision.md) and [`docs/01-strategy/STR-04-architecture.md`](../../01-strategy/STR-04-architecture.md)**, per the governance order in [README](./README.md). A contract that cannot resolve its own tie-breaker has no tie-breaker — which is worse than having the wrong one, because the failure is silent.

> **Anchors (read alongside, do not duplicate):**
> - ~~`01-VISION.md §2`~~ → **`docs/01-strategy/STR-03-engineering-vision.md` §2** (the cited file does not exist — see the Tier note) — the 8 principles (P1–P8); this contract operationalises **P6** (commands are the only mutation path) and **P8** (every new exported fn ≥ 1 OTel span).
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

> **There is now a THIRD doctrine — `CA-DOCTRINE-A` (LIVENESS), and it lives in [§5.1](#51--ca-doctrine-a--liveness-ca-17--ca-21-added-2026-08-11)**, next to the invariants that carry it, added 2026-08-11. §2 keeps its title honestly: L and S are about *what an element must be reachable BY* (level, semantics) and are properties of the element you author. A is about whether your write **arrives at all** — the failure mode is not an element that is hard to find, it is a `success: true` over nothing. It is stated at doctrine tier for the same reason as these two: five independent instances in one session, none of which violated any written rule.

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

## §5 — Authoring invariants (`CA-1` … `CA-21`) — binding

Every create command MUST satisfy CA-1…CA-11 + CA-13 + CA-14 + CA-16; batch adds CA-12; serialisable/syncable adds CA-15. **`CA-17`…`CA-21` (§5.1) bind EVERY command of EVERY kind in §3, including update, delete, transform and non-geometry verbs** — the five defects that produced them were all non-create verbs.

> ⚠ **`CA-22` (§5.2) is OPTIONAL and binds nothing** — the heading above says "`CA-1` … `CA-21` — binding" for that reason, and the range in it MUST NOT be widened to `CA-22` without a gate to widen it *to*. The rot shape this repo keeps re-minting (CLAUDE.md's five contract-range recurrences) is a range written as a literal that outlives the fact it described; here the range is narrower than the numbering ON PURPOSE. Read §5.2's own NOT-YET-TRUE box, never this line.

- **CA-1 — Type registration.** Add the type to the canonical registry (bus `commands.ts`, or `CommandType` enum for legacy). No magic-string dispatch.
- **CA-2 — Deterministic, stable IDs.** Pre-generate element ids in the tool/handler entry, not deep inside `execute()`. Ids MUST be **identical across redo** (e.g. `wall-slab-${cmdId}-${i}`), and ifcGuid pre-generated and stable (so IFC export is stable across undo/redo). C11 §11.4/§11.5.
- **CA-3 — `canExecute` validation.** Validate domain invariants **before any mutation**: referenced level(s) exist, payload in bounds, no duplicate id, geometry non-degenerate (e.g. `signedAreaXZ` ≠ 0, min length/width). Fail with a `reason`; never silently succeed. (Throw a typed `DomainError` on the bus path.)
- **CA-4 — Level resolution & assignment** *(CA-DOCTRINE-L)*. Resolve `levelId` per §2.1 order; stamp it on the element entity and on the scene object's `userData.levelId`.
- **CA-5 — Semantic registration** *(CA-DOCTRINE-S)*. `elementRegistry.registerSemantic(id, storeType)` on first execute; `registerSemanticOrReplace` on redo. Precedes store `add()`.
- **CA-6 — Spatial registration.** `bimManager.registerElement(id, levelId)` (or `registerMany` in batch). The **command** owns this call — `SpatialAuthority` will throw later if it is missing (stores no longer do it implicitly; see `BeamStore`/`HandrailStore` §3.5 notes).
- **CA-7 — View registration.** For geometry elements with plan/elevation representation: `viewDependencyTracker.registerElement(id, levelId)`, and the element's `elementType` MUST be in `GEOMETRY_ELEMENT_TYPES` (`ViewDependencyTracker.ts`).
- **CA-8 — Store mutation.** Bus: `produceCommand()` Immer patch pair. Legacy: `store.add()` (prefer `addMany` in batch). The store `add()` MUST emit `storeEventBus` with `{ elementType, operation, elementId }` (C11 §11.2 step 4).
  > ⚠ **Corrected 2026-08-11.** This bullet, read alone, says a `produceCommand()` patch pair *is*
  > the mutation. **It is not sufficient, and it was the written authority the dead verbs were
  > authored under.** `ctx.stores` on the bus path is the **L1 Immer store** (C03 §4.4), which does
  > not drive the mesh and is not what `ProjectSerializer` reads. A `produceCommand()` with no
  > committer, bridge or `commandManager` delegation carrying it onward mutates nothing anyone
  > reads. CA-8 is satisfied only together with **CA-17**.
- **CA-9 — Geometry is frame-deferred.** MUST NOT build geometry synchronously in the handler/`execute`. Defer via `FrameScheduler` (P3). For walls, the store event → `WallRebuildCoordinator` flush owns the build.
- **CA-10 — Event emission.** Bus: CEB emits `X.created` with the **full geometry payload** (id, levelId, all coordinates) — never a bare `{id}` unless the builder resolves from the store by id (the authoritative-store convention, e.g. stair). MUST use `runtime.events.emit`, never `window.dispatchEvent` (C11 §5.3).
- **CA-11 — Undo / redo.** The command MUST be reversible through the **single unified path** `performUndoRedo` (C03 §4.5). Bus: ring-buffer patch pair. Legacy: snapshot `undo()`. If the element family is in the ring-buffer store map, ensure its `storeType` key is present (`buildUndoStoreMap`); redo MUST restore the *captured legacy shape* (REDO-SHAPE-FIX) and use `registerSemanticOrReplace`. Background side-effect commands (e.g. `REDETECT_ROOMS`) MUST set `nonUndoable` and provide a no-op `undo()`.
- **CA-12 — Batch coalescing** *(batch kinds only)*. Wrap the mutation loop in `batchCoordinator.runBatch(fn, { levelIds, totalElementCount, skipPbrUpgrade?, skipRedetectRooms? })` on **first** execute (run `fn()` directly on redo when `createdCommands.length > 0`); register per-level via `bimManager.registerMany(ids, levelId)` queued through `batchCoordinator.trackRegistration` (§REG-MANY-P1). Never the deprecated `beginBatch`. See §8.
- **CA-13 — Preview.** Any creation preview/ghost MUST be unified PRYZM purple `#6600FF` via `PreviewStyle.ts` (§41). No bespoke preview colour.
- **CA-14 — Observability.** Wrap the handler/execute body in ≥ 1 OpenTelemetry span (`withHandlerSpan`) — **P8 / C10, merge-blocking**. No span = no merge.
- **CA-15 — Serialisation.** Provide `serialize()` (legacy) or a serialisable payload (bus) — no class instances/functions in payload (C03 §2.2) — so the command round-trips through sync (`source:'remote'`, C03 §2.4) and persistence.
- **CA-16 — Cross-element effects via events only.** A handler MUST NOT write another family's store (a wall handler MUST NOT touch the room store). Cross-element reactions (room redetect after walls) are **event subscribers**, frame-yielded, never a synchronous imperative loop (C11 §4.2/§6.3).

### §5.1 — `CA-DOCTRINE-A` — LIVENESS (`CA-17` … `CA-21`), added 2026-08-11

> **A command that reports success MUST have changed AUTHORITATIVE state. A command that cannot
> reach authoritative state MUST REFUSE, naming why. A refusal that names its reason is strictly
> better than a silent lie, and both are better than a `success: true` over nothing.**

This is the third doctrine, and it is *older in practice than in writing*: CA-DOCTRINE-L says an
element must be reachable **by level**, CA-DOCTRINE-S says it must be reachable **semantically**,
and CA-DOCTRINE-A says the write must **arrive** at all. It is stated at the doctrine tier for the
same reason as the other two — five independent instances in one session, none of which violated
any written rule.

**Definition — AUTHORITATIVE STATE.** The state that at least one of these three readers consults:

| Reader | Concretely |
|---|---|
| **RENDER** | the fragment builders / `InstancedElementRenderer` / the plan projector — i.e. the legacy `window.<x>Store` layer of C03 §4.4, the row whose "Drives the 3D mesh?" cell reads **Yes** |
| **PERSIST** | `ProjectSerializer` / `ProjectLoader` — what survives save→reload (C05) |
| **EXPORT** | IFC (C25), DXF (C32), schedules (C28), COBie (C35) |

The **L1 bus store** (`ctx.stores`, `storesProvider`) is **not** in this list. C03 §4.4 already says
so — it has `applyPatch`, it drives no mesh, and serialization reads the legacy store. C03 §4.9 says
the same thing for annotations in the strongest available words: the schema-level store is a
**derived patch ledger**, and reading it to render, persist, export, tag, schedule or select is a
defect. §5.1 generalises that sentence from one family to every family.

- **CA-17 — AUTHORITATIVE-STATE LIVENESS.** A handler that returns success MUST have written state
  a RENDER, PERSIST or EXPORT reader above consults — directly, or through a committer, an editor
  bridge, or `commandManager` delegation that runs **within the same dispatch**. A `produceCommand()`
  against `ctx.stores` with nothing carrying it onward is a **write-only sink**, and per
  **C68 §5.a** it is **presumed DEAD until proven otherwise, because that presumption has been right
  13/13 times** (§FIX-CHAT-DEAD-ROUTES, L-620, L-815). An event emitted to a bridge that mirrors
  into the legacy store satisfies CA-17 *only if that bridge is registered on the live path* — the
  `roof.update` defect (L-839) is precisely a bridge that was written and never registered.
- **CA-18 — REFUSE WITH A NAMED REASON, NEVER SUCCEED SILENTLY.** A verb that cannot reach
  authoritative state MUST fail `canExecute` with a `reason` naming the mechanism
  (`"roof.update reaches only the plugin DTO store; no committer carries it — L-839"`), or return an
  explicit failure. **Three shapes are PROHIBITED as the whole of a handler's effect:** (a) a bare
  `success: true`; (b) `{ forward: [], inverse: [] }` returned as the outcome of a mutation the user
  asked for — C03 §4.6 U-3 already refuses to *push* that pair to the ring buffer, and this clause
  refuses to *report* it as done; (c) silence — a `console.debug` body, an empty `execute`, or a
  swallowed throw. Precedent, already binding for one family: **ADR-0299 / C03 §4.9**, where
  `annotation.update` carrying no field to change is REFUSED rather than reported done. The refusal
  text obeys the C67 §4.6 honesty invariants — real names, real numbers, real units.
- **CA-19 — `affectedStores` MUST NAME THE STORE ACTUALLY WRITTEN.** C03 §4.6 **U-2** already
  requires a command to declare every store it mutates, and it is **satisfied by the corrupting
  case**: the five move/transform handlers declare `['wall']` and do write `ctx.stores.wall`. The
  hazard is that the key is **overloaded across time** — at write time `'wall'` is the L1 DTO store;
  at undo time `buildUndoStoreMap()` (`apps/editor/src/engine/undo/performUndoRedo.ts:271`) resolves
  the same key to `window.wallStore`, the GEOMETRY store. The entry is therefore "covered", the
  ring-buffer path runs, and **an inverse patch is applied to a store that never received the
  forward.** A command MUST NOT declare a key whose `buildUndoStoreMap` target is a different store
  from the one it wrote; if the two differ, either route the write to the mapped store (CA-17) or
  declare `affectedStores: [] as const` and carry undo on the legacy stack — the bridge signature
  C68 §5.a accepts as LIVE. See **C03 §4.6 U-2b**.
- **CA-20 — REGISTRATION ORDER IS PART OF THE CONTRACT.** `CommandBus.register()` throws on a
  duplicate type (`packages/command-bus/src/CommandBus.ts:95`), so the editor's bridge table guards
  itself with a skip — `if (runtime.bus.registry?.has?.(spec.type)) continue;`
  (`apps/editor/src/engine/initBusHandlers.ts:2202`). The bus is therefore
  **first-registration-wins**, and a plugin handler registered during `composeRuntime` **silently
  shadows** a bridge registered later by `initBusHandlers` or `engineLauncher`. A verb with **more
  than one declaring site** MUST have the winner stated — in the generated register's SHADOWED
  column — and the loser removed or justified in the same commit. **Authoring a bridge is not
  wiring it**; boot order decides, and boot order is not visible in the file you are editing.
- **CA-21 — LIVENESS IS PROVEN BY AN EXECUTED READ-BACK, NEVER DECLARED.** The proof is: **dispatch
  the verb, then read the property back out of the authoritative store.** These do **NOT** satisfy
  CA-21: `result.success === true`; a call count or a spy assertion; a patch-pair shape; a read-back
  from the same DTO store the handler wrote; a reviewer's inspection of a mapping (C03 §4.8
  §ANN-UNDO-ARITY: *"reading a mapping is not exercising a call"*). **A declaration without an
  executed proof does not satisfy this contract** — the idiom is C68 §6.3's, where check 4b replaced
  a grep for a capability id with an execution of its example through the real ladder, and every new
  check was negative-tested by injecting the fault it exists to catch.
  **A dead verb's tests MUST NOT pin the lie.** A test that asserts the plugin DTO store mutated is
  measuring the wrong store and is not evidence of anything; a test whose name concedes the verb
  *"no-ops (does not throw)"* is a passing proof that the verb does nothing. Where the read-back
  cannot run without a browser, the honest verdict is **UNPROVEN** with the expected live path named
  — never PASS (ISSUE-LOG §9.6).

### §5.2 — `CA-22` — human-readable command label (**OPTIONAL — NOT-YET-TRUE as enforcement**), added 2026-08-21

> Added by **ADR-0341** (lane UNDO1, L-1880…L-1884) for the undo/redo history dropdown. It is
> stated here at the authoring tier because the label belongs to the command author, not to a UI —
> but it is **OPTIONAL and gated by nothing**, and this heading says so rather than joining the
> CA-1…CA-21 list and implying otherwise.

- **CA-22 — A COMMAND MAY NAME WHAT IT DID, IN THE USER'S WORDS.** A command MAY implement
  `describe(): string`, returning a one-line present-tense sentence naming what it did, with real
  names, numbers and units — `"Set wall height to 3.2 m"`, `"Move 3 walls"` (the C67 §4.6 honesty
  invariants apply to it exactly as to a refusal). It MUST be **pure**, MUST NOT throw, MUST NOT
  read stores (it is called while a menu renders, possibly long after the command executed), and
  it carries **no undo semantics whatsoever** — nothing in `performUndoRedo` or
  `CommandManager.undo()` reads it.

  **WHY IT IS OPTIONAL, AND WHY THAT IS NOT A GAP.** A command with no `describe()` is never
  *unnamed*: `describeCommandToken(type)`
  (`apps/editor/src/engine/undo/undoHistoryTimeline.ts`) derives a label from the type token and
  is a **TOTAL transform**, not a lookup table — `wall.create` → *Create wall*,
  `UPDATE_VIEWPORT_SCALE` → *Update viewport scale*, and a token never seen before still yields a
  sentence. A UI-side lookup TABLE was rejected precisely because it is a *partial* function:
  every command authored after it falls through to the raw enum and **nothing fails**. A thrown or
  empty `describe()` is treated as absent and falls back to the derivation (`_safeDescribe`), so
  an author's bug degrades one label, never the toolbar.

  **NOT-YET-TRUE as enforcement, deliberately.** There is no gate requiring `describe()`, and at
  ~200 legacy command classes a repo-wide hard rule would be satisfied by 200 perfunctory strings
  — which is worse than 200 honest derivations, because a perfunctory string *displaces* the
  derivation while adding nothing. **Implemented by ZERO commands today** (measured 2026-08-21):
  the plumbing, the fallback and the throw-safety are gated
  (`packages/command-registry/__tests__/undoHistoryView.test.ts`); the feature they enable is
  unused.
  *Exit condition:* once the highest-traffic families (wall, slab, door, window, level) carry
  `describe()`, promote CA-22 to a **shrink-only ratchet over that named set** — never to a
  repo-wide hard-0 in one step.

**Applicability.** CA-17…CA-21 bind every §3 kind. For a **non-geometry / semantic** verb the
authoritative reader is its own canonical store plus PERSIST — the ledger/derived-store exclusion of
C03 §4.9 applies unchanged. For a **`nonUndoable` background side-effect** command CA-19 is
satisfied by `affectedStores: [] as const`; CA-17 and CA-18 still bind.

---

## §6 — Level-orientation in detail

1. **One element, one level (or a declared span).** The `levelId` is part of the element's identity, not a render hint.
2. **Resolution order is normative** (§2.1). A command that cannot resolve a level fails `canExecute`.
3. **Register against all three authorities** (§2.1 table). The §INSTANCED-LEVEL-VIS bug was a render-visibility miss: the instanced group key included `levelId` but the group mesh's `userData.levelId` was never stamped, so plain (instanced) walls ignored hide-by-level while non-instanced walls obeyed it. Fix: stamp `group.mesh.userData.levelId` in `InstancedElementRenderer.register()`. **Lesson encoded as CA-4.**
   - **§INSTANCED-ISOLATE-FIX (2026-05-25) — render visibility must cover *both* hide and isolate.** An instanced/aggregated group (one `InstancedMesh` per geometry×material×level for plain batch walls) carries `userData.levelId` + `userData.elementType` but **no per-element `userData.id`** — it stands in for many elements. The hide path matches `userData.levelId` (works), but the **isolate / per-element re-apply / reset** traverses are **id-keyed** and skip id-less objects, so isolation left batch walls visible on every level. A command whose elements may be instanced MUST therefore (a) stamp the real `elementType` on the group (not a generic placeholder), and the visibility layer MUST (b) resolve instanced aggregates **by level (+ type)** in *every* visibility traverse — hide, isolate, re-apply, reset — not only the hide path. Curtain walls were unaffected because their group carries a real id. Fix: `WallInstanceBridge`/`InstancedElementRenderer` stamp `elementType='wall'`; `ProjectVisibilitySection.applyIsolate`/re-apply/`resetAllVisibility` handle `userData.isInstancedGroup` by level/type.
4. **Re-parenting** (`CHANGE_WALL_LEVEL`, `UPDATE_SLAB_LEVEL`) MUST update **all three** authorities and the render `userData.levelId`, and re-key any instanced membership.
5. **Level lifecycle** (C13): registrations MUST be torn down on project switch; no per-level state may leak across projects.
6. **⭐ Editing the LEVEL itself is two different commands — do not merge them** (added 2026-08-23,
   lane LEVEL36, **ADR-0345**, L-7201). The distinction is not cosmetic; it is the difference
   between a property write and a cascade:
   - **`UPDATE_LEVEL`** — name, colour, visibility, or an **explicit elevation**. Single level.
     `BimKernel.updateLevel()` dispatches `spatial-authority-reconcile` for **that one level**.
   - **`SET_LEVEL_HEIGHT`** — floor-to-floor **height**, i.e. the GAP to the level above. This is
     **a rigid translation of every level ABOVE by δ**, not a field write. Levels at or below do
     not move, and every other level's own height is preserved exactly.

   ⚠ **`UPDATE_LEVEL({ height })` writes the number and fires NOTHING** — `BimKernel.updateLevel`
   dispatches only on an `elevation` change. A command that sets `height` and expects geometry to
   follow is authoring a no-op. **This was live in the product**: the Level & Grid panel showed a
   height tag that no code path could change, and the command that would have changed it moved
   nothing.

   ⭐ **The general lesson for authors: when a field's meaning is a RELATION between two records
   (a gap, a span, an offset-from), editing it is a cascade over the relation, not an assignment
   to the field.** Ask what the number *means* before choosing `UPDATE_*`.

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

### §8.6 — What actually buys "one gesture = one undo entry"

**A batch is not an undo unit.** This is the single most-misunderstood point in this contract, and it
was measured (not assumed) under `§FIX-NESTED-BATCH-DROPS-GUARDS`, L-271:

> `CommandBus.executeCommand()` pushes **exactly one ring-buffer entry per DISPATCH**, gated only on
> `suppressUndo` and the empty-patch check. It **never reads `batchCoordinator`**. Therefore
> **`runBatch()` is UNDO-NEUTRAL**: opening, nesting, or dropping a batch cannot change the number of
> undo entries a gesture produces.

Binding consequences:

- **B-6** — "One gesture = one undo entry" is bought by **dispatching ONE `*.batch.create` command**
  (one `produceCommand` → one Immer patch pair → one ring entry). It is **NEVER** bought by holding a
  batch open. An executor that dispatches N `foo.create` commands inside a `runBatch` produces **N**
  undo entries, and the batch does not, and cannot, merge them.
- **B-7** — `runBatch()` exists for the **GUARDS** (builder pauses, `ViewDependencyTracker`
  suppression, room-redetect suppression, the CRDT blackout window, the registration queue, the
  loading overlay), not for undo. Author for the guards; author the undo unit separately, per B-6.

Pinned by `apps/editor/__tests__/batchNestingUndo.test.ts` (I-N1…I-N4) — the nesting half of gate G10.

> ### ⛔ B-8 — a cascade command MUST report what LANDED, not what it attempted
>
> Added 2026-08-23 (lane LEVEL36, **ADR-0345** §5, L-7201; the defect is **L-2401**).
>
> `CompositeCommand` — the legacy one-undo wrapper — returns `success: true`
> **unconditionally in BOTH directions** and its `info` counts `this.children.length`, i.e.
> commands **attempted**, never landed. Generate a building, press Ctrl+Z, and if any child
> fails to revert the user is told it was undone, half the building remains, and Redo is
> offered for a state that never existed.
>
> **A new multi-target command MUST NOT inherit that shape.** The binding rule:
>
> - **Own the snapshot.** Record enough per target to restore it exactly.
> - **VERIFY BY RE-READING.** Many mutators return `void` and **silently no-op on an unknown
>   id** — `BimManager.updateLevel()` is literally `if (!level) return;`. A command that trusts
>   its own writes reports a clean result over a model it did not change. Read the value back
>   out of the authority and compare.
> - **`success = landed === attempted`**, and say both numbers in the failure.
>
> ⭐ **The regression test must make a target vanish between `execute()` and `undo()`** — that
> is the case an unconditional `true` passes and an honest command fails. Presence tests cannot
> tell the two implementations apart.
> Pinned by `packages/command-registry/__tests__/setLevelHeightCascade.test.ts`.

### §8.7 — Re-entrancy: `runBatch()` called while a batch is live (binding)

`runBatch()` **is** re-entered in production (the resi/house/office post-gen fan-outs). It previously
detected that case, printed *"nesting not supported — running fn() without batch guards"*, and then
ran `fn()` **with the guards off**, silently discarding the inner call's `BatchOptions`.

> **A warning is not a guard.** Detect-warn-and-carry-on-unguarded is **NOT** an acceptable state and
> MUST NOT be reintroduced. Likewise, a caller-side `if (isBatching) …` check is **not** a guard — it
> is a check-then-act race (two deferrals released by the same settle both pass it). **Re-entrancy
> safety is the COORDINATOR's invariant, never the caller's.**

`BatchCoordinator.runBatch()` therefore has **four** states and no silent fifth way. This follows the
existing `StoreEventBus.beginBatch()` depth-counting precedent rather than inventing a second model:

| # | State | Behaviour |
|---|---|---|
| **N1** | IDLE | Open a batch (unchanged). |
| **N2** | Live batch, inside its **synchronous** phase (`_syncDepth > 0`) | **JOIN** by depth-counting. It is the SAME logical batch: options MERGE, guards are inherited (the outer bus bracket already buffers, the builder pauses already hold, `trackRegistration()` already queues), and **nothing releases until depth returns to 0**. No second bus bracket. |
| **N3** | Live batch, **settling**, final sweep NOT yet begun | **EXTEND** the live batch: re-apply the builder pauses for the new work, MERGE the options, run `fn` inside the still-open bus bracket, and **re-arm completion** so the grown batch cannot complete on the stale drain signal. Still ONE batch — one overlay, one CRDT blackout, one final sweep. |
| **N4** | Live batch, final sweep **has begun** | **DEFER** into a clean, fully-guarded batch on settle. Joining here is unsafe for a concrete reason: the registration queue has already drained, so a `trackRegistration()` pushed now would sit in a queue nobody drains again and the element would never reach `BimManager`. Never run unguarded; never dropped (`forceReset()` flushes the settle listeners, so a project switch cannot strand it). |

**Option merge rules** (N2/N3) — the inner call's options were previously dropped on the floor:

- `levelIds` — **UNION.** Every level any participant touched MUST be swept by the final REDETECT.
- `totalElementCount` — **SUM.** The overlay's denominator must cover the whole batch.
- `skipRedetectRooms`, `skipPbrUpgrade` — **AND.** A skip is a promise made to *every* participant; it
  may only hold if *every* participant opted out. If one participant needs the pass, the batch runs it.
  (Fail-safe direction: doing the work is correct-but-slower; skipping it is **wrong**.)

Binding rules:

- **B-8** — Authors MUST NOT hand-roll `if (batchCoordinator.isBatching) { onNextSettle(…) }` as a
  correctness guard. Re-entering `runBatch` is safe by construction (N2–N4). Deferring remains a
  legitimate **performance** choice (do not grow a settling batch indefinitely), never a correctness one.
- **B-9** — In the **N4** path `runBatch` returns `undefined` (the work has not run yet); its signature
  is `T | undefined`. A caller that needs the return value, or must act strictly after the commit, MUST
  await `batchCoordinator.onNextSettle()` itself.
- **B-10 — Serialise fan-outs; advance on a REAL signal.** A post-gen orchestrator that fans out
  per-level passes MUST process levels **one at a time**, advancing on the downstream **commit event**
  (e.g. `ceiling.layout-executed`) with a timeout only as a *backstop against wedging* — never as the
  primary advance. Parallel per-level pollers both pile up overlapping batches **and** race on the
  shared `projectContext.activeLevelId` that the downstream cascade reads, landing the cascade on the
  wrong level. Precedent: `runHousePostGenChain`. (L-271 fixed `ResidentialBuildingExecutor._ceilRoomsPerLevel`,
  which armed one independent poller per level.)

Pinned by `packages/core-app-model/src/batch/BatchCoordinator.nesting.test.ts` (N2…N4).

---

## §9 — AI-initiated command authoring

AI is an *entry point* (C11 §4), not a parallel pipeline. An AI command converges at the same bus and obeys §5.

- **Intent → command mapping.** An AI prompt resolves to a typed `AIIntentType` (`packages/ai-host/src/intents.ts`) → a `CommandProposal` (`command-registry/types.ts`) → a real command. New AI-reachable capability requires (a) an intent enum entry, (b) a proposal builder, (c) the underlying command satisfying §5.
- **`source:'ai'` MUST NOT push to the undo buffer** (C03 §4.2 / C11 §4.1); the user undoes the *gesture* that asked the AI, per product decision.
- **Multi-element AI output MUST batch** (§8 / C11 §4.2): dispatch one `X.batch.create`, not a per-element loop.
- **Semantic-first is what makes semantic prompts possible.** "Add windows to every south façade", "place a WC in every bathroom", "columns on grid intersections" are only answerable because rooms, façades, grids, and tags are semantic records (§7). The **Semantic Design Assistant** build (the 50-prompt catalogue) is specified in `docs/03-execution/specs/SPEC-SEMANTIC-DESIGN-ASSISTANT.md` (forthcoming) and is **governed by this contract** — every capability it adds ships as a §5-compliant command.

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
□ CA-17 the write REACHES render / persist / export — name the reader                      [DOCTRINE-A]
□ CA-18 if it cannot reach it, canExecute REFUSES with a named reason (no bare success, no empty pair, no silence)
□ CA-19 affectedStores names the store actually written == its buildUndoStoreMap target (C03 §4.6 U-2b)
□ CA-20 ONE declaring site, or the shadow winner is stated (bus is first-registration-wins)
□ CA-21 proof = dispatch, then read the property back out of the AUTHORITATIVE store; no DTO-store test
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

### §11.1 — Where `CA-17`…`CA-21` are enforced TODAY — and where they are **NOT-YET-TRUE**

Every path below was verified to exist on 2026-08-11 (`ls`). **Do not add a row here without doing
the same** — STR-03 §2 once cited four gate files that do not exist, all marked "hard-fail ✅".

| Invariant | Enforced today by | Reach — stated honestly |
|---|---|---|
| **CA-17** liveness | `tools/ga-gate/check-verb-register.ts` — the `liveness` column (`LIVE` / `REFUSES` / `SHADOWED` / `UNKNOWN`) and the `authoritative store` column, with **named** shrink-only baselines (`SHADOWED_BASELINE`, `UNKNOWN_LIVENESS_BASELINE`) diffed against the regenerated `docs/04-reference/API-VERB-REGISTER.md`. Independently, `tools/ga-gate/check-chat-capability-coverage.ts` checks **3d / 3e** prove route liveness for verbs carrying a chat capability. | 🔶 **PARTLY.** The register classifies **statically**: `LIVE` means *declared in an execution-authority root or delegating to `commandManager`*, not *observed to write*. `UNKNOWN` is an honest verdict, not a pass — and it is populated, by name, with the five move/transform verbs this clause was written for. The chat gate reaches only declared capabilities. |
| **CA-18** refusal | `tools/ga-gate/check-refusal-identity.ts` (refusals carry an identifying code) · the register's `REFUSES` verdict, derived from a `canExecute` ending in an unconditional `{valid:false}` (§FIX-DEAD-VERB-REFUSE) | 🔶 **PARTLY.** Both see a refusal that IS written. **Nothing detects a verb that should refuse and instead returns success** — that is CA-17's `UNKNOWN` class, and closing it is the same work. |
| **CA-19** `affectedStores` | `apps/editor/__tests__/performUndoRedo.test.ts` — "coverage of every create-handler affectedStores key" (C03 §4.8) | 🔶 **PARTLY.** It proves every declared key **resolves** in `buildUndoStoreMap`. It does **not** prove the resolved store is the one the handler wrote — which is exactly the corrupting case (C03 §4.6 U-2b). |
| **CA-20** registration order | the register's `SHADOWED` verdict + `SHADOWED_BASELINE`, named and shrink-only in both directions | ✅ for verbs with two **statically discoverable** declaring sites. Blind to runtime-only registration — the gate's own header says so. |
| **CA-21** executed read-back | ⚠ ~~❌ **NOT ENFORCED.**~~ → **A GATE NOW EXISTS AND PASSES, and it quotes THIS ROW as its reason for existing.** `tools/ga-gate/check-verb-liveness.ts`, registered at `tools/ga-gate/run-all.ts:215` as *"verb-liveness (C16 §5.1 CA-21)"*. Measured 2026-08-18: `npx tsx tools/ga-gate/check-verb-liveness.ts > /tmp/vl.txt 2>&1; echo "RC=$?" >> /tmp/vl.txt` → **RC=0** — `✅ PASS — all 7 baseline verbs still prove their write by an executed read-back` (**GROW-ONLY** ratchet, baseline 7, measured 7). | ❌ **STILL NOT-YET-TRUE — and the gate says so itself.** `register verbs **326**` · `PROVEN **7**` (executed dispatch + executed read-back) · **109 UNPROVABLE-NO-STORE** · **210 UNKNOWN**, and its own line: *"Neither is a pass; both are the work."* **7 of 326 is 2%.** The verdict is unchanged; only its *reason* is — it is no longer "no gate", it is "a gate proving 2%". |

**Exit conditions — named, so this table can be closed rather than admired:**

- **G-CA-A1 (CA-17/CA-18).** `UNKNOWN_LIVENESS_BASELINE` in `check-verb-register.ts` reaches **zero**
  — every verb classified `LIVE`, `REFUSES`, or removed. Because the baseline is a **named list**
  checked in both directions, a verb cannot leave the class without leaving the list in the same
  commit.
- **G-CA-A2 (CA-20).** `SHADOWED_BASELINE` reaches **zero** — every shadowed verb either loses its
  duplicate site or states its winner.
- **G-CA-A3 (CA-19).** A gate that compares, per handler, each declared `affectedStores` key against
  the store the handler's `produceCommand` actually writes, and fails when `buildUndoStoreMap`
  resolves that key to a different store. **Does not exist today.** Until it does, CA-19 is
  review-enforced and the reviewer's question is fixed: *"which store does this key resolve to at
  UNDO time, and is it the store this handler wrote?"*
- **G-CA-A4 (CA-21).** The runtime harness under `tools/rac-conformance/runtime-harness` dispatches
  a verb and reads the property back out of the authoritative store in a real browser, so V3/V4 can
  read PASS instead of UNPROVEN. **ISSUE-LOG §9.6 names this as the single largest outstanding piece
  of work identified by the RAC conformance exercise**, and this contract agrees with that ranking.
  > ⚠ **UPDATED 2026-08-18 — PARTLY BUILT, and the exit condition is now MEASURABLE rather than
  > absent.** `check-verb-liveness.ts` exists, is registered, and **PASSES (RC=0)** with **PROVEN = 7
  > of 326**. The exit condition should now be read numerically: **G-CA-A4 closes when PROVEN
  > approaches 326**, i.e. when the **109 UNPROVABLE-NO-STORE** verbs acquire an authoritative store
  > and the **210 UNKNOWN** are classified. The ratchet is **GROW-ONLY** — PROVEN may only increase,
  > so a regression that un-proves a verb fails the gate. **Do not lower the baseline of 7.**
  >
  > ⭐ **A caution, because this gate has misreported before.** A run earlier on 2026-08-18 exited
  > **2** with *"MISCONFIGURED — the read-back harness exited 1"* and **emitted no counts at all**,
  > caused by a vitest fork-worker timeout on
  > `tools/rac-conformance/runtime-harness/__tests__/liveness.probe.ts` — an environmental flake, not
  > a finding. **This gate can fail for reasons that have nothing to do with its subject.** Always
  > read its terminal line: `MISCONFIGURED` means *the question was not asked*, which is neither a
  > pass nor a fail, and **quoting counts from a MISCONFIGURED run — or concluding from one that the
  > figures are irreproducible — are both errors.**

Until all four exit conditions are met, **§5.1 is CANONICAL but NOT ACTIVE** in the C00 status
ladder: it is binding intent with partial machine coverage, and it does **not** certify that shipped
verbs satisfy it. Nothing in §5.1 may be described as "CI-enforced" flatly — that is the L-812
defect, and this contract will not repeat it.

**Runtime (browser observation):**
- C11 §8.3 single create; §8.4 plan-view ≤ 400 ms; §8.2 batch (no LONGTASK).
- **Level-visibility gate** — create N elements across 2 levels, hide one level: only the other level's elements remain (covers §INSTANCED-LEVEL-VIS). 
- **Undo/redo gate** — create → undo → redo restores identical geometry + semantics (C03 §4.5).

**Suite (G10 — undo/redo at scale, incl. its NESTING half):**
- `apps/editor/__tests__/undoRedoAtScale.test.ts` — "one gesture = one undo entry" from an IDLE coordinator.
- `apps/editor/__tests__/batchNestingUndo.test.ts` — **the same invariant under a NESTED `runBatch`** (I-N1…I-N4).
  G10 was previously green while the invariant was still breakable under nesting: it pinned the flat case only.
  A gate that does not cover the reachable state is not a gate. **Any change to `runBatch`'s re-entrancy
  behaviour MUST keep both halves green.**
- `packages/core-app-model/src/batch/BatchCoordinator.nesting.test.ts` — the §8.7 N2/N3/N4 state machine
  (option merge, builder re-pause on EXTEND, deferral after the sweep, depth balance on throw).

---

## §12 — AS-IS gaps / backlog

- **OI-057 — Post-batch wall-join is correct but timing-implicit & untested.** *Diagnosis (2026-05-25):* batch-wall joins **are** resolved post-batch — `CreateWallsOnAllSlabsCommand` wraps in `runBatch`; `_setupBatch` pauses the wall builder; the deferred `resume()` schedules `WallRebuildCoordinator._flush()`, which runs `WallJoinResolver.resolveLevel(store.getAll().filter(levelId))` over the **complete** wall set per level. Single-slab `CreateWallsFromSlabCommand` (no `runBatch`) coalesces to one `_flush` with the same effect. This is why adding a door/window later "fixes" joins — a `wallStore.update` re-triggers the *same* level-wide `resolveLevel` pass. **Two real residual gaps, neither fixed (low-risk-fix or backlog per owner):** (a) the ordering invariant "`resume()→_flush()` runs before `_executeFinalSweep()`'s `discardAndSuppress()` drops events" is **implicit** — guaranteed today only because the build queue cannot drain before `_flush` runs, with **no test** guarding it; (b) the event-sourced **plugin `WallsState`** (from `wall.batch.create`) retains **pre-miter baselines** — the join trim is written only to the legacy `wallStore.baseLine`; a rebuild purely from the plugin store (without a flush) would show untrimmed joins. *Recommended:* add the B-5 invariant test (assert one `resolveLevel` per level post-batch with all walls) before any change to the batch timing; do **not** alter the delicate `runBatch` ordering without it. Tracked here; promote to a SPEC task if the plugin-store baseline divergence surfaces on reload.
- **Backend duality.** Path A (legacy `Command`) remains for stair, several on-all, annotation/view families (C03 §4.3). New commands SHOULD be Path B; the migration end-state is ADR-0251 (store unification).
- **G-CA-L / G-CA-S** are counters today; they become hard-fail when the create-command surface is fully bus-native.
- **CA-DOCTRINE-A debt (added 2026-08-11).** The live instances are **not enumerated here** — C64
  §2.13 binds `docs/` to citing a generated artefact rather than transcribing a number, and a list
  in this file would rot the way `CLAUDE.md`'s "C01–C15" did. The inventory is
  `docs/04-reference/API-VERB-REGISTER.md` and the two named baselines in
  `tools/ga-gate/check-verb-register.ts`. **Re-run the gate rather than trusting any count in
  prose.** What is recorded here is the *shape* and its worst instance: `roof.update` is P0 —
  every roof property change from the panel, the inspector and the 3-D gizmo reaches nothing
  (L-839, ISSUE-LOG §9.1), and `wall.move` / `wall.transform` / `door.move` / `window.move` /
  `slab.move` are the same defect across five element kinds, additionally carrying the CA-19
  undo hazard. **The instances are debt; the doctrine is permanent** — draining the baselines does
  not discharge §5.1, exactly as C68 §5.j is not discharged by fixing its 29.

---

## §13 — Cross-references

- C03 §2 (interface), §4.4 (the three store layers — the definition CA-17 rests on), §4.5 (`performUndoRedo`), §4.6 (binding undo invariants, incl. **U-2b**), §4.9 (the derived-ledger rule §5.1 generalises).
- **C67 §4.6/§4.10** (honesty invariants; *"Done" only after a command reports success* — §5.1 is the rule UNDER that one, which makes the command's own success truthful) · **C68 §5.a** (the same liveness obligation, scoped to chat-declared capabilities, with the 13/13 dead-route presumption) · **C69** — the generated API verb register (`tools/ga-gate/check-verb-register.ts`), which enumerates what exists while C16 states what is required. **These are complements, not rivals: never restate the register's rows here.**
- C11 §2 (pipeline), §5 (handler contract), §10 (two-layer bridge), §11.2 (add element type), §11.5 (wall = reference).
- C15 (hosted two-part commands). C09 (AI). C10 (NFTs/OTel). C13 (project isolation). §41 (preview).
- **C17** (Batch Creation Catalogue & Panel Binding) — the registry of batch prompts that each resolve to a §8/CA-12 command and surface in the CREATE panel.
- ~~`01-VISION.md §2`~~ → **`docs/01-strategy/STR-03-engineering-vision.md` §2** (P1–P8; the cited file does not exist). Memory: `batch-creation-perf-pattern`, `undo-architecture-three-stores`, `gpu-pick-resolution-and-highlight`.
