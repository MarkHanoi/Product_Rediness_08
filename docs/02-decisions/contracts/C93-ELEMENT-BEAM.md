# C93 — ELEMENT: BEAM

- **Status**: CANONICAL — binding on every PR touching the beam family
- **Date**: 2026-08-18
- **Parent**: [C84 §6](C84-ELEMENT-INTEGRITY.md) — the twelve mandatory sections. **C84's
  EI-1…EI-13 are applied, not restated.**
- **Cites, does not restate**: [C03 §4.5/§4.6 U-2/U-2b](C03-SCHEMAS-COMMANDS-AND-STATE.md) ·
  [C11](C11-ELEMENT-CREATION-PIPELINE.md) · [C16](C16-COMMAND-AUTHORING-PROTOCOL.md) (**CA-17**/
  **CA-18**) · [C73](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) (tolerance) ·
  [ADR-0319 §2](../adrs/) (audit fields across undo — **not C75**) ·
  [C15 §12](C15-HOSTED-ELEMENT-CONTRACT.md) (`elementType` casing) ·
  [C82](C82-RIBBON-CAPABILITY-SURFACE.md) (UI-control census) ·
  [C91](C91-ELEMENT-COLUMN.md) (the sibling structural family — cross-referenced, never duplicated).
- **Measured**: 2026-08-18, main worktree `Product_Rediness_08`, HEAD `18eab722`.
- **Which persistence half was checked**: the **LIVE**
  `apps/editor/src/engine/persistence/{ProjectSerializer,ProjectLoader}.ts`.
  `packages/persistence-client/src/loader/` is the dead copy, per the live files' own headers at
  `ProjectSerializer.ts:268-271` / `ProjectLoader.ts:328-331`.

> ⭐ **BEAM'S SIGNATURE DEFECT IS A GENUINE REPRESENTATIONAL GAP, NOT AN OMISSION — AND THE
> DISTINCTION IS THE POINT.** `rotation` exists on the L0 schema (`Beam.ts:54`), is validated by
> the plugin handler (`CreateBeam.ts:79`), and **`BeamData` — the legacy geometry record every
> renderer, exporter and serializer reads — has no rotation field at all**
> (`packages/core-app-model/src/stores/BeamTypes.ts:1-46`, `grep rotation` → **0 matches**).
> **A rotated beam un-rotates.** Column's identical field survives end-to-end
> ([C91 §5](C91-ELEMENT-COLUMN.md)); beam's has nowhere to land.

---

## 1. Identity

| Axis | AS-IS (measured) | TO-BE |
|---|---|---|
| Canonical `userData.elementType` | **`'beam'`** (lowercase) — `packages/geometry-beam/src/BeamFragmentBuilder.ts:274,381`. **One spelling.** | freeze `'beam'`; consumers normalise per [C15 §12](C15-HOSTED-ELEMENT-CONTRACT.md) |
| Other spellings | **NONE.** `BeamStore` emits `elementType: 'beam'` at `packages/core-app-model/src/stores/BeamStore.ts:63,91,105,253`; `DeleteElementCommand.ts:610` sets `'beam'`. ⚠ `BeamStore.ts:193` emits `elementType: 'column'` — that is a **support-reference** event about a *column*, not a beam spelling | ✅ conformant — note the near-miss so the next auditor does not read `:193` as a rival tag |
| ⛔ **`BeamData` NAMES TWO DIFFERENT TYPES** | (a) the **plugin/L0** `BeamData = BeamSchemaInfer` (`plugins/beam/src/store.ts:6`) — has `baseLine`, `shape`, `rotation`, `materialId`. (b) the **legacy geometry** `BeamData` (`packages/core-app-model/src/stores/BeamTypes.ts:1-46`) — has `startPoint`/`endPoint`, `sectionType`, `material`, **no rotation**. Different field names, different vocabularies, one identifier | **EI-9 / C84 §8.a** — *"counting files whose names are similar"*, here **types**. Rename one, or every reader must state which |
| L0 Zod schema | `packages/schemas/src/elements/Beam.ts`; `BeamShape = z.enum(['rectangular','i-section','t-section'])` `:7`; `baseLine: z.tuple([Vec3,Vec3])` `:46`; `rotation: z.number().default(0)` `:54`; `materialId` `:55` | see §9 |
| Bus verb namespace | `beam.*` — **seven** registered: `create`, `batch.create`, `delete`, `move`, `setType`, `setSection`, `setMaterial` (`plugins/beam/src/handlers/index.ts:13-19`) | unchanged |
| Legacy geometry type | `BeamData` — `packages/core-app-model/src/stores/BeamTypes.ts` | unchanged |

---

## 2. Stores — and which one is the AUTHORITY

| # | Representation | Where | Written by | Read by |
|---|---|---|---|---|
| 1 | L0 Zod schema | `packages/schemas/src/elements/Beam.ts` | the bus payload | `Beam.parse(seed)` at `CreateBeam.ts:88` |
| 2 | **Plugin DTO store** | `plugins/beam/src/store.ts:10` `class BeamStore extends Store<BeamData>` | all seven `beam.*` verbs | **measured: nobody.** `SetBeamMaterial.ts:57` says so |
| 3 | **LEGACY geometry store — ⭐ THE AUTHORITY** | `packages/core-app-model/src/stores/BeamStore.ts`; instantiated `initBuilders.ts:955` `new BeamStore(projectContext)`, published `window.beamStore` `:956` | the `beam.created` bridge (`initTools.ts:1772-1809`) + legacy `CreateBeamCommand` | `BeamFragmentBuilder` (`initBuilders.ts:959`, wired via `beamStore.setBuilder(beamBuilder)` `:970`), `ProjectSerializer.ts:1018`, `readers/BeamReader.ts`, `DeleteElementCommand.ts:606-619` |
| 4 | THREE scene `userData` | `BeamFragmentBuilder.ts:274,381` | fragment builder | GLB export, picking, delete routing |
| 5 | Kernel producer record | `packages/geometry-kernel/src/producers/beam.ts` + `plugins/beam/src/committer/beam-committer.ts` | committer | **bake worker does NOT read it** — `HeadlessBakeSession.ts:23,31,43,53,124-131` is `WallStore` + `produceWall` only |

**EI-1 verdict: ✅ SINGLE AUTHORITY — the legacy `BeamStore` (#3).** No split-brain. Recorded as
clean (EI-1b).

⚠ **Beam has an EXTRA coupling the other four families do not: `beamStore.setBuilder(beamBuilder)`
(`initBuilders.ts:970`), plus `new BeamLevelCleanupHandler(beamStore)` (`:957`).** The store holds a
direct reference to its renderer. `NOT MEASURED`: whether that path bypasses the DOM-event
mechanism the ceiling/floor stores use, and therefore whether a beam write can reach the scene
without passing the events any observer subscribes to.

**EI-1a — `'beam'` names two objects across one command's lifecycle:**

| Moment | Resolves to | Site |
|---|---|---|
| WRITE | plugin DTO snapshot view | `apps/editor/src/bootstrap.ts:94,148-159` |
| UNDO | `window.beamStore` (legacy) | `performUndoRedo.ts` `buildUndoStoreMap()` — `beam: w.beamStore, beams: w.beamStore` |

`MoveBeam.ts:50-56` states the consequence in its own header, in the same words `MoveColumn.ts` uses.
**The pin exists**: `apps/editor/__tests__/deadMoveVerbAuthoritativeState.test.ts`, verified present
on `main` by direct stat. ⚠ `NOT MEASURED`: whether that test covers the **beam** case or only the
column case.

---

## 3. Consumers

| Consumer | Reads | Evidence | Verdict |
|---|---|---|---|
| Renderer (3-D) | LEGACY | `initBuilders.ts:959` `new BeamFragmentBuilder(scene)`; `:970` `beamStore.setBuilder(beamBuilder)` | ✅ |
| Plan view | LEGACY, **via the bridge's explicit registration** | `initTools.ts:1798-1799`. Its comment `:1796-1797` is load-bearing: *"`BeamStore.ts` §3.5 explicitly documents `bimManager.registerElement` was removed from the store — **the bridge is the only registration site for the bus creation path**"* | ⚠ **SINGLE POINT OF FAILURE.** If the bridge does not fire, a bus-created beam is invisible in plan **and** absent from `level.childrenIds` |
| Persistence (save) | LEGACY | `ProjectSerializer.ts:1018` `beamStore.getAll().map(serializeBeam)`; `beamStore` is **REQUIRED** on `ProjectStores` (`:778`) | ✅ **no silent-empty hazard** (contrast ceiling/floor, [C88 §3](C88-ELEMENT-CEILING.md)/[C89 §3](C89-ELEMENT-FLOOR.md)) |
| Persistence (load) | LEGACY, **via the legacy command** | `ProjectLoader.ts:1366` `new CreateBeamCommand({…})` — **no bus event.** After any load the plugin DTO beam store is **EMPTY while the legacy store holds N** (C84 EI-5a) | ⚠ |
| IFC export | LEGACY | `packages/file-format/src/export/ifc/readers/BeamReader.ts`; `ifcClass: 'IfcBeam'` (`BeamTypes.ts:41-43`) | ✅ **beams DO export** |
| GLB export | scene `userData` | `BeamFragmentBuilder.ts:274,381` | ✅ |
| Bake worker | **ABSENT** | `HeadlessBakeSession.ts:31,43,53` | ✅ no split |
| Sync | `beam.batch.create` **NOT SYNCED** — declared, and it is the **reference entry** the other ten multi-subject verbs point at | `packages/sync-client/src/syncDisposition.ts:914` — *"payload is `{beams: CreateBeamPayload[]}` applied in ONE produceCommand; no singular create is re-dispatched. One `subject` key cannot name an array"* | ✅ declared |

---

## 4. Plugin ↔ DTO ↔ command ↔ builder

| Handler | Verb | Registered? | UI-reachable? | State |
|---|---|---|---|---|
| `CreateBeamHandler` | `beam.create` | ✅ `handlers/index.ts:13` | ✅ **two dispatchers**: `BeamPlanToolHandler.ts:95` and `CopyPlanToolHandler.ts:444` | **LIVE** |
| `CreateBeamBatchHandler` | `beam.batch.create` | ✅ `:14` | generators / AI | LIVE (non-UI) |
| `DeleteBeamHandler` | `beam.delete` | ✅ `:15` | ⛔ **NO** | **DORMANT** (C84 §3.5.3) — ⛔ do not delete |
| **`MoveBeamHandler`** | `beam.move` | ✅ `:16` | ⛔ **NO** — **REFUSES** at `MoveBeam.ts:106` | §6 |
| `SetBeamTypeHandler` | `beam.setType` | ✅ `:17` | `PropertyPanelTypeSelector.ts:235` | LIVE |
| `SetBeamSectionHandler` | `beam.setSection` | ✅ `:18` | `NOT MEASURED` | — |
| `SetBeamMaterialHandler` | `beam.setMaterial` | ✅ `:19` | ⚠ **REFUSES** at `SetBeamMaterial.ts:83` | §6 |
| Legacy `CreateBeamCommand` | — | `packages/command-registry/src/beams/` | ✅ the load path (`ProjectLoader.ts:1366`) | **L2, LIVE** |

⭐ **`§FIX-BEAM-PAYLOAD` — a payload mismatch of the FURNITURE class, ALREADY CLOSED, recorded so
it is not re-opened.** `BeamPlanToolHandler.ts:96-97` dispatches `startPoint` / `endPoint`; the
handler's canonical field is `baseLine`. `CreateBeam.ts:20-25` accepts both, and
`resolveBaseLine()` (`:41-48`) folds the alias, *"`baseLine` (when supplied) always wins"*. **Had
the alias not been added, `Beam.parse` would have succeeded on an all-defaults record and every
plan-drawn beam would have been a 4 m beam at the origin — C84 §1.1's furniture defect, exactly.**
The alias is an EI-2 exit taken correctly: the field is **carried**, not dropped. ⚠ It is
**unpinned** — no test asserts the alias survives a refactor. **EI-8a's shape applied to a
translation rather than a constant.**

**Reachability measured on BOTH axes** (C84 §3.5.1): (a) import — `buildBeamHandlerSet`;
(b) bus — `grep "beam.create'"` over `apps/` less `__tests__` → two production dispatchers, named
above. Neither `MOVE_COMMAND_BY_TYPE` (`elementMove.ts:102-127`) nor the 13 `dragDispatch` sites in
`registerTransformDragHandler.ts` names `beam.move` (`MoveBeam.ts:33-36`).

---

## 5. THE BRIDGE FIELD MAP — every field, no omission

**The bridge**: `beam.create` / `beam.batch.create` → `CommandEventBridge.ts:557-624` →
`initTools.ts:1772-1809` → legacy `BeamStore.add()`.

| Payload field | CEB | initTools | Destination in legacy `BeamData` | Disposition |
|---|---|---|---|---|
| `id` | `:577` / `:614` | `:1783` | `id` | **CARRIED** |
| `levelId` | `:575` / `:612` | `:1784` | `levelId` | **CARRIED**. ⚠ **no `parentId`** — ceiling, floor and column all write one (`initTools.ts:1528`, `:1844`, `:1660`); beam does not. `NOT MEASURED` whether any consumer needs it |
| `baseLine` (`[Vec3,Vec3]`) | **batch**: split at `:615-616` `b.baseLine[0]` / `b.baseLine[1]`. **single-create**: the cast at `:565-566` reads `startPoint`/`endPoint` directly | `:1785`, `:1786` | `startPoint`, `endPoint` (`BeamTypes.ts:6-7`) | ✅ **CARRIED, TRANSFORMED** — tuple → two named fields. The batch case documents it at `:591-592` |
| **`shape`** | `:580` / `:617` | `:1787` **`sectionType: (ev.shape ?? 'rectangular') as any`** | `sectionType?: 'rectangular' \| 'UB' \| 'UC'` (`BeamTypes.ts:34`) | ⛔ **UNCHECKED CAST — EI-2(c).** `BeamShape` is `'rectangular' \| 'i-section' \| 't-section'` (`Beam.ts:7`). **BOTH non-rectangular members are outside the destination union** and land as unmodelled strings. `as any` blinds `tsc`; a second `as any` on the whole object at `:1793` blinds it again |
| **…and the batch registry declares a THIRD, near-disjoint vocabulary** | — | — | — | ⛔ `packages/command-bus/src/commands.ts:1065` declares `beam.batch.create`'s `shape?: 'rectangular' \| 'I' \| 'T' \| 'L'`. **ONE member — `'rectangular'` — is shared with the real `BeamShape` enum.** `'I'`, `'T'`, `'L'` exist in no other beam vocabulary in the repo; `'i-section'` and `'t-section'` exist in no batch payload. **EI-8: three vocabularies for one concept, pairwise near-disjoint** |
| **…and the reverse gap** | — | — | `'UB'` / `'UC'` + `steelProfileName` (`BeamTypes.ts:22-34`) | ⛔ **UNREACHABLE from any bus verb.** `BeamFragmentBuilder.ts:120,253` gate the entire parametric steel path on `(sectionType === 'UB' \|\| sectionType === 'UC') && !!steelProfileName` — **so no bus-created beam can ever be steel.** EI-3 inverse, and it is the same shape as EI-2(b): a branch whose condition the bus vocabulary cannot satisfy |
| `width` | `:581` / `:618` | `:1788` `?? 0.2` | `width` | **CARRIED** |
| `depth` | `:582` / `:619` | `:1789` `?? 0.4` | `depth` | **CARRIED** |
| **`rotation`** | ⛔ **NOT IN EITHER CEB CAST** — `:562-571` and `:593-605` have no `rotation` key | never seen | ⛔ **NO FIELD EXISTS** — `BeamTypes.ts:1-46`, `grep rotation` → **0 matches** | ⛔ **LOST TWICE. (a) DROPPED BY OMISSION at CEB — EI-2(a); (b) NO DESTINATION — a genuine representational gap.** The L0 schema declares it (`Beam.ts:54`, *"Rotation of the profile about the beam axis, in radians"*) and `CreateBeam.ts:79` writes it into the DTO record. **The user's rotated profile reaches the DTO store nobody reads and stops there.** ⭐ **Fixing (a) alone changes nothing** — that is C84 §8.h, *fixing a symptom whose mechanism you have not measured* |
| `materialId` | `:583`; batch `:620` `b.materialId ?? b.systemTypeId` | `:1792` conditional spread `...(ev.materialId ? {material: ev.materialId} : {})` | **`material?: string`** (`BeamTypes.ts:17`) | ⚠ **CARRIED INTO A DECLARED FIELD THAT NO CONSUMER READS.** The field exists; `BeamFragmentBuilder` never reads it — `:120,:253,:279,:386` read `sectionType` and `steelProfileName` only. **`SetBeamMaterial.ts:57` states the stronger claim — *"`BeamData` carries neither `materialId` nor `materialColor`"* — which is TRUE OF THOSE EXACT NAMES and understates the real state: `material` exists and is INERT.** Recorded here rather than corrected in that file, per this contract's no-edit scope |
| `systemTypeId` | **batch only** (`:602`), folded into `materialId` at `:620` | → `material` | `material` | ⚠ **CONFLATED**, and **absent from the single-create cast** (`:562-571`). Identical to column's defect ([C91 §5](C91-ELEMENT-COLUMN.md)) — **EI-8** |
| — | — | `:1790` `loadBearing: false` | `loadBearing` (**required**, `BeamTypes.ts:18`) | ⛔ **HARD-CODED `false` FOR EVERY BUS-CREATED BEAM.** No payload field can set it. A structural beam is recorded as non-load-bearing — a **semantically wrong value**, not a missing one. `NOT MEASURED`: which consumers read `loadBearing` |
| — | — | `:1791` `properties: {}` | `properties` | **HARD-CODED EMPTY** |
| — | — | ⛔ **NO `ifcData` BLOCK** (contrast column `:1670-1673`, floor `:1878-1882`) | `ifcData?: {guid, ifcClass:'IfcBeam'}` (`BeamTypes.ts:40-43`) | ⛔ **NOT WRITTEN AT ALL.** A bus-created beam has **no IFC GUID**. `NOT MEASURED`: whether `BeamStore.add()` supplies one, and whether `BeamReader` skips a beam without one |
| — | — | ⛔ **NO `metadata` BLOCK** | `metadata?` (`BeamTypes.ts:45`) | ⛔ **NOT WRITTEN** — a bus-created beam has no audit envelope |
| — | — | never written | `startSupportId` / `endSupportId` / `startSupportType` / `endSupportType` (`BeamTypes.ts:12-15`) | ⛔ **NO SOURCE, NO WRITER.** The structural connectivity model exists on the type and nothing populates it — see §8 |
| — | — | never written | `fireRating` (`BeamTypes.ts:19`) | ⛔ **NO SOURCE** |
| ⚠ the guard | — | `:1775` accepts **`beam.create` ONLY**, not `beam.batch.create` | — | ✅ **CORRECT BY A NON-OBVIOUS MECHANISM**: CEB rewrites the batch `commandType` to the single spelling at `:611`, so batch events pass. Column's bridge accepts both explicitly (`:1644`) and ceiling's accepts one (`:1513`). **Three bridges, three different guard conventions, for one rewrite rule.** The `!== '*.batch.create'` guards C84 §4B calls dead code are this same rule seen from the other side |

**TO-BE.** Every row reads **CARRIED** or **DECLARED DROPPED with a named reason**. Specifically:
`rotation` gets a destination field **or** `canExecute` refuses a non-zero rotation and says why;
`loadBearing` becomes a payload field; `ifcData` and `metadata` are written; `sectionType` is
**translated at a named, tested point**, never cast.

---

## 6. Verbs

| Verb | Lineage (C84 §4A) | Stores WRITTEN | Stores RESTORED on undo | Equal? |
|---|---|---|---|---|
| `beam.create` | **L1** | plugin DTO `beam` (`CreateBeam.ts:92-95`) + legacy `BeamStore` + `bimManager` + `viewDependencyTracker` (`:1798-1799`) | legacy `BeamStore` only | ⛔ **NO — WRITES ⊋ RESTORES** (C84 EI-7a) |
| `beam.batch.create` | **L1** | as above ×N; **one** patch pair for N beams | as above | ⛔ NO |
| `beam.delete` | L1 | plugin DTO only | — | **DORMANT** |
| **`element.delete`** (the real delete) | **L2** | `BeamStore.remove` `:617`, `bimManager.unregisterElement` `:614`, `semanticGraphManager.removeAllRelationshipsForElement` `:615`, `elementRegistry.unregister` `:616` | `createSnapshot` covers `'beam'` (`CommandManagerImpl.ts:611`) | ⚠ **INLINE, NOT DELEGATED.** Column delegates to `DeleteColumnCommand` so all four effects restore together (`DeleteElementCommand.ts:436-438`); beam's branch is inline and has **no `_captureRelationships` call** — contrast the floor `:569` and ceiling `:597` branches, which do |
| **`beam.move`** | — | **NONE — REFUSES** `MoveBeam.ts:106` | — | ✅ **C16 CA-18 CONFORMANT** |
| `beam.setType` | L1 | plugin DTO only | legacy (**wrong object** — EI-1a) | ⛔ NO |
| `beam.setSection` | L1 | plugin DTO only | legacy (wrong object) | ⛔ NO. ⚠ Note `SetBeamSection.ts:41` validates a **`rotation`** parameter — so the *section* verb accepts a rotation the record cannot hold |
| **`beam.setMaterial`** | — | **NONE — REFUSES** `SetBeamMaterial.ts:83` | — | ✅ **CA-18 CONFORMANT**, and its reason is the most specific of the six: *"Beams have no per-beam material at all: `BeamFragmentBuilder` picks between two module-scoped shared materials (`_steelMat` / `_concreteMat`) from `sectionType` and never reads a material field… Change the beam SECTION TYPE, or track the per-beam material under Gate G7"* (`:57`) |
| **ROTATE** | — | ⛔ **NO VERB, AND NO FIELD.** `beam.setSection` accepts a `rotation` argument (`:41`) that has nowhere to land | — | ⛔ **the family's headline gap** — §5, Delta 1 |
| **PARAMETER / DIMENSION** via `element.updateParameters` | **L2** | `ELEMENT_STORE_ROUTES` routes `beam → ['beam'], c.stores.beamStore` (`UpdateElementParameterCommand.ts:116`) | `createSnapshot` covers `'beam'` | ✅ store-correct, ⛔ **NOT audit-neutral** — §7 |
| **LEVEL CHANGE** | ⚠ **beam has a DEDICATED handler no other family in this cohort has** — `BeamLevelCleanupHandler` (`packages/geometry-beam/src/BeamLevelCleanupHandler.ts`), constructed at `initBuilders.ts:957` | `NOT MEASURED` what it writes | `NOT MEASURED` whether its writes are undoable | `NOT MEASURED` — flagged, not assumed clean |

**⚠ EI-3 residual.** Two beam verbs refuse. **Whether a control still offers those gestures is
`NOT MEASURED`**; the census is [C82](C82-RIBBON-CAPABILITY-SURFACE.md)'s. Per the C84 EI-7a
correction the refusals are **required interim conformance** and must not be "fixed" into silent
success.

---

## 7. Undo / redo

| Verb | `affectedStores` declared | Measured write set | Equal? |
|---|---|---|---|
| `beam.create` | `['beam']` (`CreateBeam.ts:38`) | DTO + legacy + `bimManager` + `viewDependencyTracker` | ⛔ **NO** |
| `beam.batch.create` | `['beam']` (`:52`) | as above | ⛔ NO |
| `beam.delete` | `['beam']` (`DeleteBeam.ts:20`) | DTO only | ✅ (dormant) |
| `beam.move` | `['beam']` (`MoveBeam.ts:76`) | **none — refuses** | ✅ |
| `beam.setType` / `setSection` | `['beam']` (`:27`, `:28`) | DTO only | ✅ as a **set**, ⛔ as an **object** (EI-1a) |
| `beam.setMaterial` | `['beam']` (`:63`) | none — refuses | ✅ |
| `element.updateParameters` | `snapshotScopeForElementType('beam')` → `['beam']` (`UpdateElementParameterCommand.ts:116,167`) | `beamStore` | ✅ — **L-947 closed for beam** |
| `element.delete` (L2) | 15 keys incl. `'beam'` (`DeleteElementCommand.ts:55`) | `BeamStore` | ✅ |

**EI-7d — `createSnapshot` coverage: ✅ FULLY CLEAN.** `'beam'` is **both** a `StoreKey` union
member (`packages/command-registry/src/types.ts:562`) **and** recognised by `createSnapshot`'s
`optionalStores` (`CommandManagerImpl.ts:611`). It is in **neither** of L-953's holes — not in the
twelve `union ∖ recognised`, and not in the two `recognised ∖ union` (`ceiling`, `floor` — newly
measured, [C88 §7](C88-ELEMENT-CEILING.md)). **Recorded explicitly: a clean result nobody writes
down is indistinguishable from an unchecked one** (EI-1b).

**⭐ EI-7e / L-952 — BEAM IS ONE OF THE EIGHT AUDIT-RATCHETING FAMILIES.**

`UpdateElementParameterCommand.undo()` (`:379-385`) reverts by **constructing a fresh forward
command and executing it**. Audit-neutrality comes only from `restoreWallAudit`, hard-gated at
`:410-414` on `t === 'wall' | 'door' | 'window'`; `captureWallAudit` (`:400-420`) returns `null`
for everything else. The file concedes the scope itself at `:205-218`: *"only `WallStore` carries
the `preserveMetadata` contract today."*

**So a beam parameter change ratchets `metadata.version` forward on undo.** L-952's eight:
`slab, stair, roof, furniture, column, **beam**, curtainwall, handrail`. *(C84 §4B said four;
eight is the measured figure.)* Governed by **[ADR-0319 §2](../adrs/) DERIVED-BUT-CAUSAL** — *"may
differ across a restore; may NOT differ across an undo."* ⚠ **NOT C75** (its scope line disclaims
ADR-0319's classification; §2.9 forbids restating it).

⚠ **AND FOR BEAM THE DEFECT IS SHARPER THAN L-952 STATES.** L-952 assumes a `metadata` envelope
exists to ratchet. **The bus create path writes none** (§5): `initTools.ts:1782-1793` has no
`metadata` key and no `ifcData` key. So a beam's audit state depends on **which path created it** —
loaded beams (via `CreateBeamCommand`) have an envelope, bus-created beams may not. `NOT MEASURED`:
whether `BeamStore.add()` supplies defaults. **Until that is measured, "the version ratchets" and
"there is no version" are indistinguishable — the `[[context-data-honesty-family]]` shape.**

**Fix (L-952's):** extend `preserveMetadata` to `BeamStore` and consume it in the undo replay.
⛔ **Control first, watched RED:** undo a beam parameter change and assert `metadata.version` is
byte-equal to pre-edit. **An assertion that passes before the fix is testing nothing.**

**EI-7e — restore or recompute?** Only three services consult `isReverting()` (C84 §4C, cited).
**None is a beam service.** `NOT MEASURED`: whether `BeamLevelCleanupHandler` runs forward during
an undo.

---

## 8. Cascades

| Trigger | Reversed by undo? | Evidence |
|---|---|---|
| beam delete → `bimManager` + `elementRegistry` + semantic graph | ⚠ **purged, NOT captured** | `DeleteElementCommand.ts:614-616`. ⛔ **The beam branch has NO `_captureRelationships([id])` call**, while the floor branch (`:569`) and ceiling branch (`:597`) both do — each added under `§FIX-<FAMILY>-DELETE-LEAVES-GRAPH-EDGES` with the note that *"undo restored NOTHING, which C71 §5.6 rates worse than no purge because it looks correct."* **Beam is the family that fix did not reach.** `NOT MEASURED`: whether `_captureRelationships` is invoked for beam elsewhere in the command |
| …the graph **UNDO** half generally | **`NOT MEASURED`** | [C71 §5.8](C71-GRAPH-AND-TOPOLOGY.md) requires executed read-back, not the presence of a restore call. C84 §4C records itself being wrong for awarding this by read |
| **beam → its SUPPORTS** | ⛔ **MODELLED AND UNPOPULATED** | `startSupportId` / `endSupportId` / `startSupportType` / `endSupportType` (`BeamTypes.ts:12-15`) and the `BeamSupport` interface (`:48-52`) exist. **No creation path writes them** (§5). So the structural connectivity graph is declared in the type system and empty at runtime — [C74](C74-CONSTRAINT-HONESTY.md)'s shape: *an UNKNOWN drawn as a value*, here as an absent one |
| **column delete → this beam's support refs** | ⛔ **not cleared** | the reciprocal of the above; owned by [C91 §8](C91-ELEMENT-COLUMN.md) and stated once, there |
| beam level change → cleanup | ⚠ **a dedicated handler exists** — `BeamLevelCleanupHandler`, `initBuilders.ts:957` | `NOT MEASURED` what it does, whether it is undoable, or whether it consults `isReverting()`. **The only family in this cohort with such a handler; flagged rather than assumed benign** |
| `beam.created` event → consumers | ✅ **HAS a subscriber** — `initTools.ts:1773` | beam is **not** one of C84 EI-13's nine unconsumed emitters. Recorded as clean |
| beam ↔ slab / wall hosting | ⛔ **not modelled** | `BeamData` has no host field beyond the support refs | `NOT MEASURED` whether any consumer expects one |

**TO-BE.** (1) The beam delete branch captures relationships before purging, matching floor and
ceiling. (2) The support refs are **populated at create** or the fields are **declared derived and
computed on read** — [C79 §7.2](C79-REGION-SEMANTICS.md)'s *POPULATE, REMOVE or DECLARE*.
(3) `BeamLevelCleanupHandler` is measured and its undo behaviour declared.

---

## 9. Vocabularies

| Concept | Vocabulary | Members the pipeline cannot carry (EI-3) |
|---|---|---|
| **Section / shape** | ⛔ **THREE, PAIRWISE NEAR-DISJOINT.** (V-a) L0 `BeamShape = 'rectangular' \| 'i-section' \| 't-section'` (`Beam.ts:7`). (V-b) bus batch registry `'rectangular' \| 'I' \| 'T' \| 'L'` (`commands.ts:1065`). (V-c) destination `sectionType = 'rectangular' \| 'UB' \| 'UC'` (`BeamTypes.ts:34`) | **`'rectangular'` is the ONLY member present in all three.** `'i-section'`/`'t-section'` die at the cast; `'I'`/`'T'`/`'L'` exist nowhere else in the repo; `'UB'`/`'UC'` are unreachable from any bus verb — **so no bus-created beam can be steel**, because `BeamFragmentBuilder.ts:120,253` gates the steel path on exactly those two values |
| **Rotation** | L0 `rotation: z.number()` (`Beam.ts:54`); plugin DTO carries it (`CreateBeam.ts:79`); `beam.setSection` validates it (`:41`) | ⛔ **THE ENTIRE VOCABULARY.** No CEB cast carries it; `BeamData` has no field. **A genuine representational gap** |
| **Material / colour** | ⚠ **TWO, plus an inert third.** (V-a) `BeamFragmentBuilder`'s two module-scoped shared materials `_steelMat` / `_concreteMat`, selected from `sectionType` — quoted at `SetBeamMaterial.ts:57`. (V-b) the committer palette `plugins/beam/src/committer/material-bridge.ts`. (V-c) `BeamData.material` (`BeamTypes.ts:17`) — **written by the bridge at `initTools.ts:1792` and read by nobody** | everything `beam.setMaterial` offers (it refuses); `materialColor` does not exist at all |
| ⭐ **the shared fallback hex** | **`'#9b9b9b'` — `plugins/beam/src/committer/material-bridge.ts:7` AND `plugins/column/src/committer/material-bridge.ts:12`. Same value, two files, no shared constant, no pin** | **EI-8a**: pin a licensed copy by an executed **test**, never by a comment. Stated once here and once in [C91 §9](C91-ELEMENT-COLUMN.md); the fix is one change |
| **System type** | `systemTypeId` — batch verb only, then **collapsed into `material`** (`CommandEventBridge.ts:620`) | the whole concept on single-create. **EI-8 — one vocabulary per concept, violated by merging two** |
| **Load bearing** | `loadBearing: boolean` (**required**, `BeamTypes.ts:18`) | ⛔ **the entire vocabulary** — hard-coded `false` at `initTools.ts:1790`, no payload field |
| **Fire rating** | `fireRating?: string` (`BeamTypes.ts:19`) — free-form, no enum | **no source.** ⚠ a free-form string where wall/door families use enums — `NOT MEASURED` whether a canonical fire-rating vocabulary exists elsewhere |
| **Constraints** | `BEAM_CONSTRAINTS` (`BeamTypes.ts:54-63`) — `MIN_WIDTH 0.15`, `MAX_WIDTH 1.0`, `MIN_DEPTH 0.20`, `MAX_DEPTH 2.0`, `MIN_SPAN 0.5` | ⚠ **`CreateBeam.ts:60-66` validates only `> 0`, NOT against `BEAM_CONSTRAINTS`.** A 5 m-wide beam passes `canExecute`. A declared constraint table that no validator consults is [C74](C74-CONSTRAINT-HONESTY.md)'s exact subject |

**TO-BE.** ONE section vocabulary across payload, batch registry and store, with translation at a
named, tested point. **A cast is not a translation.**

---

## 10. Geometry

| Axis | AS-IS | TO-BE |
|---|---|---|
| **Stack A** | `packages/geometry-beam/src/BeamFragmentBuilder.ts`, live `initBuilders.ts:959`, wired back into the store at `:970` | unchanged |
| **Stack B** | `packages/geometry-kernel/src/producers/beam.ts` + `plugins/beam/src/committer/beam-committer.ts` | ⛔ not deletable — ADR-0331 §D5 (*"what is Stack B for?"*) is an escalated **founder** question |
| **Proven to agree?** | ⛔ **NO HARNESS.** The repo's only A/B parity harness is wall's, and C84 §5 records it as **not on `main`** | build `tests/parity/beam/`; MUST consume `packages/geometry-kernel/src/tolerance.ts` — shipped 2026-08-13, barrel-exported `index.ts:22-34` (**L-954**). ⛔ **MUST NOT ship a bare `const TOL`** ([C73 §2.2/§2.3](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md)) |
| **Datum convention** | beam Y comes **entirely from `startPoint.y` / `endPoint.y`** — `BeamPlanToolHandler.ts:93` computes `beamY = this._beamElevation(levelId)` and stamps it on both endpoints (`:96-97`). **There is no `baseOffset` on `BeamData`.** ⭐ **This is the cleanest datum of the five families: ONE input, one site** | ✅ **name it and keep it.** ⚠ `NOT MEASURED`: whether `_beamElevation` and `BeamFragmentBuilder` agree on whether `level.elevation` is already included — the wall-Y double-add shape (C84 §4D) applied to beam |
| **Section orientation** | ⛔ **NOT REPRESENTABLE** — see `rotation`, §5 | a rotated profile round-trips, or `canExecute` refuses |
| **Instancing** | `BeamFragmentBuilder.ts:118` `_instanceKindFor(beam): 'box' \| null` — only non-steel beams instance | ⚠ `NOT MEASURED` whether instanced beams carry a per-element id in `userData` — the known instanced-pick gap (`[[3d-selection-instanced-gpu-pick-gap]]`) |

---

## 11. THE DELTA

| # | Item | Invariant | Proof (⛔ watched RED first) |
|---|---|---|---|
| **1** | **`rotation` has NO destination field** — a rotated beam un-rotates. Lost twice: omitted from both CEB casts (`:562-571`, `:593-605`) **and** absent from `BeamTypes.ts` | **EI-2(a) + a representational gap** | Create a beam with `rotation: π/4`; assert the rendered profile is rotated, **or** that `canExecute` refused naming the limit. ⚠ **Fixing only the CEB omission changes nothing — C84 §8.h** |
| **2** | **Three near-disjoint section vocabularies**, sharing one member — `Beam.ts:7` / `commands.ts:1065` / `BeamTypes.ts:34` | **EI-8 + EI-3** | one vocabulary; translation at a named, tested point; **no `as any`** |
| **3** | **No bus-created beam can be steel** — `'UB'`/`'UC'` unreachable, and `BeamFragmentBuilder.ts:120,253` gates the whole steel path on them | **EI-3 inverse** | extend the vocabulary, or declare steel beams L2-only |
| **4** | **BEAM IS ONE OF L-952's EIGHT** — `metadata.version` ratchets on undo (`UpdateElementParameterCommand.ts:379-385,410-414`) — **and the bus create path may write no `metadata` at all** (`initTools.ts:1782-1793`) | **L-952 / ADR-0319 §2** | undo a beam parameter change; assert `metadata.version` is byte-equal. **First measure whether the envelope exists** — otherwise "ratcheted" and "absent" are the same reading |
| **5** | `loadBearing` **hard-coded `false`** for every bus-created beam (`initTools.ts:1790`) — a required field given a semantically wrong value | **EI-2(a)** | add the payload field; assert a load-bearing beam round-trips |
| **6** | The **beam delete branch does not `_captureRelationships`** while floor `:569` and ceiling `:597` do | EI-5 + [C71 §5.6](C71-GRAPH-AND-TOPOLOGY.md) | delete a beam with graph edges, undo, assert the edges return |
| **7** | `startSupportId`/`endSupportId` **modelled and never populated** (`BeamTypes.ts:12-15`) | [C79 §7.2](C79-REGION-SEMANTICS.md) — *POPULATE, REMOVE or DECLARE* | populate at create, or declare derived |
| **8** | Six verbs write the DTO while `'beam'` restores the legacy store | EI-1a / **C03 §4.6 U-2b** | extend `deadMoveVerbAuthoritativeState.test.ts` to the beam case — **`NOT MEASURED` whether it already covers it** |
| **9** | No `ifcData` and no `metadata` written by the bridge (`initTools.ts:1782-1793`) | **EI-6 / ADR-0319 §2** | assert a bus-created beam exports to IFC with a stable GUID across undo/redo |
| **10** | `'#9b9b9b'` duplicated — `beam/committer/material-bridge.ts:7`, `column/…:12` | **EI-8a** | one executed test, or one import |
| **11** | `systemTypeId` **collapsed into `material`** on batch (`CommandEventBridge.ts:620`), **absent** from single-create | **EI-8** | two fields, two concepts |
| **12** | `BEAM_CONSTRAINTS` (`BeamTypes.ts:54-63`) is **declared and unconsulted** — `CreateBeam.ts:60-66` checks only `> 0` | [C74](C74-CONSTRAINT-HONESTY.md) | validate against the table, or delete it |
| **13** | `BeamData` names **two different types** (`plugins/beam/src/store.ts:6` vs `BeamTypes.ts:1`) | **EI-9 / C84 §8.a** | rename one |
| **14** | `§FIX-BEAM-PAYLOAD`'s `startPoint`/`endPoint` alias (`CreateBeam.ts:20-25,41-48`) is **unpinned** | **EI-8a** shape | a test asserting the alias folds; without it, the furniture defect returns on the next refactor |
| **15** | No Stack A/B parity harness | **EI-11** | `tests/parity/beam/`, consuming C73's tolerance module |

---

## 12. REFUSALS

| # | Not supported | Status | Instead |
|---|---|---|---|
| **R1** | **`beam.move` does not reach authoritative state** | ✅ **DECLARED, C16 CA-18 conformant** — `MoveBeam.ts:106`; mechanism `:28-70`, identical in shape to `MoveColumn.ts` | the legacy update path; `MOVE_COMMAND_BY_TYPE` (`elementMove.ts:102-127`) is the one table that decides what a move dispatches, and it does not name `beam.move` |
| **R2** | **`beam.setMaterial` — beams have NO per-beam material** | ✅ **DECLARED, CA-18 conformant, and the most specific refusal of the six** — `SetBeamMaterial.ts:83`, reason `:57`: *"`BeamFragmentBuilder` picks between two module-scoped shared materials (`_steelMat`/`_concreteMat`) from `sectionType` and never reads a material field"* | **change the beam SECTION TYPE.** Per-beam material is tracked under Gate G7 |
| **R3** | ⛔ **`beam.move` / `beam.delete` MUST NOT BE RETIRED** despite having no dispatcher | ✅ **DECLARED** — `tools/ga-gate/check-chat-capability-coverage.ts` requires every `CapabilityRefusal` / `CHAT_UNAVAILABLE` / `ChatCommandClassification` name to be a **registered** bus command; retiring makes chat's refusal cite a non-existent verb. C84 §3.5.3 independently grades the `<kind>.delete` verbs **DORMANT — do not delete** | leave registered; refuse in `canExecute` |
| **R4** | The `plugins/cross` cascade rules that synthesise `beam.move` **do not run** | ✅ **DECLARED** — `CascadeRunner` is registered nowhere in production; **PROMOTED** by ADR-0323 / BIM30 R0 and *"unreachable TODAY by recorded decision, not neglect"*. C84 **EI-12** satisfied by declaration | BIM30 R2 wires it |
| **R5** | `beam.batch.create` is **NOT SYNCED** | ✅ **DECLARED** — `syncDisposition.ts:914`, the reference entry the other ten multi-subject verbs cite | single `beam.create` is synced |
| **R6** | Beam is **absent from the bake worker** | ✅ **DECLARED HERE** — `HeadlessBakeSession.ts:31,43,53` is wall-only by construction | not a defect; scope is ADR-0331 §D5 |
| **R7** | **BEAM PROFILE ROTATION IS NOT SUPPORTED** | ⛔ **NOT A REFUSAL TODAY — SILENCE.** The L0 schema offers it (`Beam.ts:54`), `beam.setSection` validates it (`:41`), the DTO stores it, and it reaches nothing | until a field exists, `canExecute` MUST refuse a non-zero rotation and name the limit (Delta 1) |
| **R8** | **STEEL BEAMS CANNOT BE CREATED FROM THE BUS** — `'UB'`/`'UC'` unreachable | ⛔ **NOT A REFUSAL — SILENCE.** `'i-section'` is *accepted* and cast into a union that lacks it | refuse `'i-section'`/`'t-section'`, or map them at a named, tested point (Deltas 2–3) |
| **R9** | **A BUS-CREATED BEAM IS ALWAYS NON-LOAD-BEARING** — `initTools.ts:1790` | ⛔ **NOT A REFUSAL — A HARD-CODED WRONG VALUE**, worse than an absent one | add the payload field (Delta 5) |
| **R10** | **BEAM SUPPORTS ARE NOT COMPUTED** — the fields exist, nothing populates them | ⛔ **UNDECLARED before this contract — now DECLARED AS ABSENT** | POPULATE, REMOVE or DECLARE ([C79 §7.2](C79-REGION-SEMANTICS.md)) |

> *"No affordance without an implementation… A refusal is a correct answer; a silently-wrong wall
> is not."* — `packages/geometry-wall/src/WallRake.ts:50-62`. **R7–R10 are beam's four remaining
> silences, and R9 is the worst kind: not a missing value but a confidently wrong one.**


---

## §L-1032 — THE STOREY AXIS: change level, and duplicate to level

> **Added 2026-08-19 by lane EL1**, from [L-1032](../../04-reference/ISSUE-LOG.md). The end state
> the founder asked for is **not** *"every family has a dropdown"* — it is **every family either
> offers the control or declares, in its contract, why it must not**.
>
> **THE REGISTER IS THE AUTHORITY, NOT THIS SECTION.**
> `packages/command-bus/src/levelChangeVerbs.ts` holds `LEVEL_CHANGE_VERBS` and
> `LEVEL_CHANGE_REFUSALS`; the L3 event bridge, the L7 property panel and the chat registration all
> read those rows. If this section and the register disagree, **the register wins and this section
> is stale** — a defect, not a discrepancy to live with.

### THE VERB — `beam.changeLevel` ✅ LIVE

| | |
|---|---|
| **Payload** | `{ beamId, levelId }` |
| **Handler** | `plugins/beam/src/handlers/ChangeBeamLevel.ts` |
| **Legacy move** | `packages/core-app-model/src/stores/BeamStore.ts` — `changeLevel(id, newLevelId, {newElevation, previousElevation})` |
| **Mirror row** | `apps/editor/src/engine/elementLevelChangedMirror.ts` — `LEGACY_LEVEL_MOVERS.beam` |
| **Chat** | `move-to-level` (`packages/ai-host/src/intents/LevelChangeIntents.ts`) — *"move the beam to level 2"* |
| **Undo** | `elementUndoStoreAdapter.ts` §L-946 arm routes the depth-2 `[id,'levelId']` inverse patch to `store.changeLevel()` |

### WHY THE STORE NEEDED ITS OWN `changeLevel` — AND WHY IT TAKES ELEVATIONS

Beam is one of **four families whose 3-D height does NOT follow a storey change on its own**
([L-1087](../../04-reference/ISSUE-LOG.md)). `BeamFragmentBuilder.ts:405` seats the mesh with
`root.position.set(centre.x, centre.y, centre.z)` from the baseLine's **absolute Y**, and the file
contains **no `getLevelById` call at all**. Contrast `SlabFragmentBuilder.ts:726`, which re-derives
`topY = level.elevation + baseOffset`.

So a naive `beam.changeLevel` would have re-filed the beam onto the new storey, moved it onto the new
plan and exported it under the new IFC storey — **while the beam went on hovering at the old floor's
height**, with nothing reporting it. This family was therefore **WITHHELD from the UI for one working
day** rather than shipped: *"A refusal is a correct answer; a silently-wrong wall is not"*
(`WallRake.ts:50-62`).

It returns under the rule that withheld it. `BeamStore.changeLevel` now takes
`{ newElevation, previousElevation }` and:

- **REFUSES** — returns `undefined`, warns, leaves the record untouched — when either is missing.
  Moving the storey alone is the defect, not a partial success;
- moves `startPoint.y` **and** `endPoint.y` by the **DELTA**, not by assignment, so a beam sitting
  above its floor keeps that offset instead of being slammed to the new floor datum;
- **never reaches for a level table.** The numbers are resolved by the CALLER from the level
  authority — `elementLevelChangedMirror._elevationOf` forward, `elementUndoStoreAdapter`'s §L-946
  arm inverse — because a store that can reach for an elevation can reach for the WRONG one, and a
  silent default is §DIAG-WALL-LEVEL.

`BeamStore` also gained a `getById` alias: it was the one legacy element store spelling that read
`get`, for reasons having nothing to do with beams (L-1036 has since ruled `getById` canonical).

### ⚠ THE CAP — [L-1085](../../04-reference/ISSUE-LOG.md), OPEN

`canExecute` validates existence against the **plugin DTO store**, and C84 EI-5a records that
*"after any project load, every plugin DTO store is EMPTY."* The control therefore works on elements
authored **in the current session** and **refuses, by name, on anything restored from a saved
project**. The refusal is C16 CA-18 conformant and is better than the alternative: relaxing the check
would make the forward move work while producing an empty inverse patch — an authoritative mutation
with no Ctrl+Z (C84 EI-7). **The fix is ADR-0331 §D2/§D3 and is not per-family.**

### DUPLICATE-TO-LEVEL

A **separate verb**, never a flag on the level change — it mints new ids. Declared per family in
`apps/editor/src/engine/views/plantools/duplicateToLevel.ts`, which reuses the ONE legacy→bus payload
mapping in `copyPayloads.ts` (L-978 is what a second copy of that mapping costs). Unlike the level
change, this route reads the LEGACY store, so it is **not** subject to the L-1085 cap above.
