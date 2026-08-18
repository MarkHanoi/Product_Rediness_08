# C99 — ELEMENT: PLUMBING

- **Status**: CANONICAL — binding on every PR touching the plumbing family
- **Date**: 2026-08-18
- **Parent**: [C84 §6](C84-ELEMENT-INTEGRITY.md) — the twelve mandatory sections. **C84's
  EI-1…EI-13 are applied, not restated.**
- **Cites, does not restate**: [C03 §4.5/§4.6 U-2/U-2b](C03-SCHEMAS-COMMANDS-AND-STATE.md) ·
  [C11 §11.11](C11-ELEMENT-CREATION-PIPELINE.md) (the fixture-vs-pipe routing fix) ·
  [C16](C16-COMMAND-AUTHORING-PROTOCOL.md) (**CA-17**/**CA-18**) ·
  [C73](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) (tolerance) · [ADR-0319 §2](../adrs/) (audit
  fields across undo — **not C75**) · [C15 §12](C15-HOSTED-ELEMENT-CONTRACT.md) (`elementType`
  casing) · [C74](C74-CONSTRAINT-HONESTY.md) (failure and empty may not be the same value) ·
  [C82](C82-RIBBON-CAPABILITY-SURFACE.md) (UI-control census).
- **Measured**: 2026-08-18, main worktree `Product_Rediness_08`, HEAD `18eab722`.
- **Which persistence half was checked**: the **LIVE**
  `apps/editor/src/engine/persistence/{ProjectSerializer,ProjectLoader}.ts`.
  `packages/persistence-client/src/loader/` is the dead copy (the live files say so at
  `ProjectSerializer.ts:268-271` / `ProjectLoader.ts:328-331`).

> ⛔ **READ THIS FIRST. "PLUMBING" IS TWO DIFFERENT ELEMENTS SHARING ONE VERB NAMESPACE, ONE STORE
> NAME AND ONE `elementType`, AND EVERY OTHER FINDING IN THIS CONTRACT FOLLOWS FROM IT.**
>
> | | **PIPE** | **FIXTURE** |
> |---|---|---|
> | Verb | `plumbing.create` | `plumbing.createFixture` |
> | Handler | `CreatePlumbingHandler` (`plugins/plumbing/src/handlers/CreatePlumbing.ts:36`) | `CreatePlumbingFixtureHandler` (`.../CreatePlumbingFixture.ts:31`) |
> | Model | `kind`, `origin`, `diameter`, `wallThickness`, `length`, `bendRadius`, `systemTag` | `fixtureType`, `position`, `width`/`length`/`height`, `toiletVariant`, `showerVariant` |
> | Lineage | **L1** — writes the plugin DTO store | **L3** — `_cmExec`-style bridge to the legacy `CreatePlumbingFixtureCommand`, `affectedStores: [] as const` (`:32`) |
> | Reaches the viewport? | ⛔ **NO** | ✅ **YES** — legacy `PlumbingStore` → `PlumbingFragmentBuilder` |
>
> `PlumbingPlanToolHandler.ts:167-174` states it verbatim: *"this tool creates a **fixture**
> (toilet/shower/bath/sink), so it MUST dispatch `plumbing.createFixture`… The old
> `plumbing.create` target is the **pipe** handler (`CreatePlumbingHandler` models a pipe:
> kind/diameter/bendRadius) — **it silently dropped every fixture field** (fixtureType, position,
> variants)."* That is `§FIX-PLUMBING-FIXTURE-CMD`, [C11 §11.11](C11-ELEMENT-CREATION-PIPELINE.md),
> and it is **closed for the plan tool only**. The 3-D tool still does the old thing (§4).

---

## 1. Identity

| Axis | AS-IS (measured) | TO-BE |
|---|---|---|
| `userData.elementType` on the mesh | **`'PlumbingFixture'`** — `packages/geometry-plumbing/src/PlumbingFragmentBuilder.ts:28,66` | see below |
| `elementType` on the store-event bus and in the delete command | **`'plumbing'`** — `packages/geometry-plumbing/src/PlumbingStore.ts:12,24,30`; `packages/core-app-model/src/stores/PlumbingStore.ts:12,24,30`; `DeleteElementCommand.ts:626` | — |
| ⛔ **VERDICT: TWO SPELLINGS, AND THEY ARE NOT CASE VARIANTS** | `'PlumbingFixture'.toLowerCase()` = `'plumbingfixture'` ≠ `'plumbing'`. **[C15 §12](C15-HOSTED-ELEMENT-CONTRACT.md)'s `.toLowerCase()` normalisation CANNOT collapse them.** This is the *slab-four / door-two* defect C84 §4E names, in a family C84 did not measure for it | **ONE canonical tag per family.** `'PlumbingFixture'` is a **sub-part** of a plumbing element and MUST be declared as one via C15 §12's existing `userData.role` + `parentId` mechanism — **not a new tag** |
| ⚠ measured mitigation, and its cost | `registerTransformDragHandler.ts:313-317` handles it by hand: *"The fragment builder tags the mesh `elementType='PlumbingFixture'` → lowercases to `'plumbingfixture'`; **accept the bare `'plumbing'` alias too**."* Delete is unaffected — `plugins/view/src/handlers/DeleteElement.ts:51-57` branches only on `'opening'`/`'lighting'` and routes everything else to `DeleteElementCommand` | **every new consumer must remember the alias.** That is C84 §8.d — *a comment as the synchronisation mechanism* — applied to a tag |
| L0 Zod schema | `Plumbing`, re-exported through `@pryzm/plugin-sdk`; `Plumbing.parse(seed)` at `CreatePlumbing.ts:74` | — |
| Bus verb namespace | `plumbing.*` — **six** registered: `create`, `delete`, `move`, `setSystem`, `createFixture`, `setMaterial` (`plugins/plumbing/src/handlers/index.ts:12-17` ). **No `plumbing.batch.create`** | see §12 R6 |
| ⛔ **`PlumbingStore` NAMES THREE DIFFERENT CLASSES** | (a) `plugins/plumbing/src/store.ts:10` — the DTO `Store<PlumbingData>`; (b) `packages/geometry-plumbing/src/PlumbingStore.ts` — **the live legacy store**; (c) `packages/core-app-model/src/stores/PlumbingStore.ts` — a **40-line near-copy** | **EI-9 / C84 §8.a** — see §2 |

---

## 2. Stores — and which one is the AUTHORITY

| # | Representation | Where | Written by | Read by |
|---|---|---|---|---|
| 1 | L0 Zod schema | `Plumbing` (plugin-SDK re-export) | the `plumbing.create` payload | `Plumbing.parse` at `CreatePlumbing.ts:74` |
| 2 | **Plugin DTO store** | `plugins/plumbing/src/store.ts:10`; registered `apps/editor/src/PluginRegistry.ts:356` `buildStore: () => new PlumbingStore() as unknown as Store<object>` | `plumbing.create`, `delete`, `move`, `setSystem`, `setMaterial` | **measured: nobody.** `SetPlumbingMaterial.ts:57` says so verbatim |
| 3 | **LEGACY geometry store — ⭐ THE AUTHORITY** | `packages/geometry-plumbing/src/PlumbingStore.ts`; instantiated `initBuilders.ts:627` `new PlumbingStore()`, imported `:85`; typed onto `CommandContext` at `packages/command-registry/src/types.ts:456` `import('@pryzm/geometry-plumbing').PlumbingStore` | legacy `CreatePlumbingFixtureCommand`, `MovePlumbingCommand` | `PlumbingFragmentBuilder`, `PlumbingPlanSymbolBuilder`, `PlumbingElevationSymbolBuilder`, `ProjectSerializer.ts:1023`, `readers/PlumbingReader.ts`, `DeleteElementCommand.ts:622-635` |
| 3b | ⛔ **A SECOND, NEAR-IDENTICAL LEGACY STORE** | `packages/core-app-model/src/stores/PlumbingStore.ts` — **40 lines, same class name, exported from `core-app-model/src/stores/index.ts`** | — | `NOT MEASURED` — no production importer surfaced |
| 4 | THREE scene `userData` | `PlumbingFragmentBuilder.ts:28,66` | fragment builder | GLB export, picking, delete routing |
| 5 | Kernel producer record | `packages/geometry-kernel/src/producers/plumbing.ts` + `plugins/plumbing/src/committer/plumbing-committer.ts` | committer | **bake worker does NOT read it** — `HeadlessBakeSession.ts:23,31,43,53,124-131` is `WallStore` + `produceWall` only |

**EI-1 verdict: ✅ SINGLE AUTHORITY at runtime — the `@pryzm/geometry-plumbing` store (#3).** Every
measured consumer reads it. **Recorded as clean on the consumer axis** (EI-1b).

### ⭐ EI-9 — THE TWO LEGACY STORES ARE A LIVE FORK WITH AN UNDECLARED DIVERGENCE

Both files are **40 lines**. `diff` returns **three** differences:

| Line | `core-app-model/src/stores/PlumbingStore.ts` | `geometry-plumbing/src/PlumbingStore.ts` |
|---|---|---|
| `:2` | `import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)` | `import { storeEventBus } from '@pryzm/core-app-model';` |
| `:11`, `:23`, `:29` | comment tag `// F.events.17` | comment tag `// F.events.18` |
| **`:29`** | `_bus.emit('bim-plumbing-updated', **{ id }**)` | `_bus.emit('bim-plumbing-updated', **{ id: data.id }**)` |

**The third row is a BEHAVIOURAL divergence, not cosmetic.** In the `core-app-model` copy the
update event carries the **method parameter** `id`; in the live copy it carries **the record's own
id**. `initBuilders.ts:634-635` already documents the surrounding event contract, and the
ceiling/floor listeners at `initBuilders.ts:398,428` guard on `e.detail?.id` **precisely because a
mismatched detail shape once made those listeners never fire** (`§DOM-EVENT-LISTENER-AUDIT-2026-05-18`).

**§3.5 classification: LIVE FORK if both are reachable, TRULY DEAD if only one is.**
`NOT MEASURED` on both axes — no production importer of the `core-app-model` copy surfaced, but a
**deletion claim requires the full two-axis census** (C84 §3.5.1) and the bus axis is unmeasured.
⛔ **Do not delete on this reading.** Either way it needs an **EI-10** licence (named reason,
executed equivalence proof, declared divergence list, retirement condition) or a convergence.

**EI-1a — `'plumbing'` names two objects across one command's lifecycle:**

| Moment | Resolves to | Site |
|---|---|---|
| WRITE | plugin DTO snapshot view | `apps/editor/src/bootstrap.ts:94,148-159` |
| UNDO | `window.plumbingStore` (legacy) | `performUndoRedo.ts` `buildUndoStoreMap()` — entry `plumbing: w.plumbingStore` |

`MovePlumbing.ts:50-56` states the consequence in its own header, in the same words `MoveColumn.ts`
and `MoveBeam.ts` use.

---

## 3. Consumers

| Consumer | Reads | Evidence | Verdict |
|---|---|---|---|
| Renderer (3-D) | LEGACY | `initBuilders.ts:85` imports `PlumbingFragmentBuilder`; `:627` constructs the store; `:626-635` is the subsystem block | ✅ |
| Plan view | LEGACY — **and plumbing has TWO dedicated symbol builders**, the only family in this cohort that does | `packages/geometry-plumbing/src/PlumbingPlanSymbolBuilder.ts` and `PlumbingElevationSymbolBuilder.ts` | ✅ **the richest 2-D answer of the five** |
| Persistence (save) | LEGACY | `ProjectSerializer.ts:43` imports from `@pryzm/geometry-plumbing`; `:781` `plumbingStore: PlumbingStore` is **REQUIRED**; `:1023` `plumbingStore.getAll().map(serializePlumbing)` | ✅ **no silent-empty hazard** (contrast ceiling/floor) |
| Persistence (load) | LEGACY, **via the legacy command** | `ProjectLoader.ts:1251` `new CreatePlumbingFixtureCommand({…})` (priority 25, `:43`) — **no bus event.** After any load the plugin DTO store is **EMPTY while the legacy store holds N** (C84 EI-5a) | ⚠ |
| IFC export | LEGACY | `packages/file-format/src/export/ifc/FragmentReader.ts:32` imports `PlumbingStore`, `:119-122` `new PlumbingReader(this.stores.plumbingStore, this).read()` | ✅ **plumbing DOES export** |
| GLB export | scene `userData` | `PlumbingFragmentBuilder.ts:28,66` | ✅ |
| Bake worker | **ABSENT** | `HeadlessBakeSession.ts:31,43,53` — wall-only | ✅ no split |
| Sync | `plumbing.create` synced — `{kind:'element-property', subject:'id', conflict:'disclose'}` | `packages/sync-client/src/syncDisposition.ts:827` | ⚠ **it syncs the PIPE verb — the one nothing renders.** `NOT MEASURED`: whether `plumbing.createFixture` has a disposition entry at all |

---

## 4. Plugin ↔ DTO ↔ command ↔ builder

| Handler | Verb | Registered? | UI-reachable? | State |
|---|---|---|---|---|
| `CreatePlumbingHandler` (**PIPE**) | `plumbing.create` | ✅ `handlers/index.ts:12`; `engineLauncher.ts:595` `registerPlumbingHandlers(_bus)` | ⚠ **reachable ONLY as an empty-payload telemetry ping** — see below | **LIVE BUT PHANTOM** |
| `CreatePlumbingFixtureHandler` (**FIXTURE**) | `plumbing.createFixture` | ✅ `:16` | ✅ `PlumbingPlanToolHandler.ts:175` — full, correct payload | **LIVE, L3** |
| `DeletePlumbingHandler` | `plumbing.delete` | ✅ `:13` | ⛔ **NO** | **DORMANT** (C84 §3.5.3) — ⛔ do not delete |
| **`MovePlumbingHandler`** | `plumbing.move` | ✅ `:14` | ⛔ **NO** — **REFUSES** at `MovePlumbing.ts:110` | §6 |
| `SetPlumbingSystemHandler` | `plumbing.setSystem` | ✅ `:15` | `NOT MEASURED` | — |
| `SetPlumbingMaterialHandler` | `plumbing.setMaterial` | ✅ `:17` | ⚠ **REFUSES** at `SetPlumbingMaterial.ts:83` | §6 |
| `PlumbingPlacementTool` | dispatches `plumbing.create` **with a real payload** (`plugins/plumbing/src/tool.ts:51-54`) | exported at `plugins/plumbing/src/index.ts:22-24` | ⛔ **CONSTRUCTED NOWHERE.** `grep "PlumbingPlacementTool"` repo-wide → the definition, the export, and **zero `new` sites** | ⛔ **TRULY DEAD on the import axis; the only tool that would send a correct pipe payload** |
| Legacy `CreatePlumbingFixtureCommand` / `MovePlumbingCommand` | — | `packages/command-registry/src/` | ✅ plan tool (via L3), 3-D tool (directly), load path | **L2 — the real mutation path** |

### ⭐ THE PHANTOM PIPE — a `success: true` over nothing, dispatched twice per fixture

`packages/geometry-plumbing/src/PlumbingTool.ts:402` and `:436`, both labelled
*"[E.5.x] Bus telemetry — fire-and-forget; legacy commandManager drives state during migration"*:

```ts
if (window.runtime?.bus) { window.runtime.bus.executeCommand('plumbing.create', {}).catch(() => {}); }
commandManager.execute(new CreatePlumbingFixtureCommand({ fixtureType: 'bath', position: …, … }));
```

**The bus payload is `{}`.** `CreatePlumbingHandler.execute` (`:57-71`) then defaults **every**
field — a fresh `createId('plumbing')`, `kind: 'straight'`, `origin: {0,0,0}`, `diameter: 0.05`,
`length: 1`, `systemTag: 'cold-water'` — `Plumbing.parse(seed)` **succeeds** (`:74`), and a
**1 m straight cold-water pipe at the world origin** is written into the plugin DTO store for every
bath, toilet, sink and shower the user places in 3-D.

**This is C84 §1.1's furniture defect in a second family, and it is worse than furniture's:**
furniture's payload was *mismatched*; plumbing's is *empty*. The record has **no relationship
whatsoever** to the fixture the user drew — not a wrong value, an unrelated element.

⚠ **It is contained today only because store #2 has zero readers.** C84 **EI-5a** is explicit that
its disposition *"is sound ONLY while the reader count is zero"*. The moment any consumer reads the
plugin plumbing store, every project acquires one phantom pipe per fixture ever placed in 3-D.

**And the registry declaration makes it type-check.** `packages/command-bus/src/commands.ts:766`
declares `'plumbing.create': { fixtureType: string; position: {x,y,z}; levelId?: string; [k: string]: unknown }`
— **FIXTURE fields**, for the **PIPE** handler. `CreatePlumbingPayload` (`CreatePlumbing.ts:16-29`)
declares `id, levelId, kind, origin, diameter, wallThickness, length, bendRadius, rotation,
baseOffset, systemTag, materialId`. **The two share exactly ONE field name: `levelId`.** The
`[k: string]: unknown` index signature is what lets `{}` — and anything else — compile. Compare
`'plumbing.createFixture'` at `:767`, which matches its handler field-for-field. **The registry
entry for `plumbing.create` describes the element it does not create.**

**Reachability measured on BOTH axes** (C84 §3.5.1): (a) import — `PlumbingPlacementTool` has zero
construction sites; (b) bus — `plumbing.create` has exactly two production dispatchers, both
sending `{}`.

---

## 5. THE BRIDGE FIELD MAP

### 5a. `plumbing.create` (PIPE) — ⛔ **THERE IS NO BRIDGE**

`CommandEventBridge.ts:852-860` is the whole of it:

```ts
case 'plumbing.create': {
  const p = record.payload as { levelId?: string };
  events.emit('plumbing.created', { commandId: record.id, commandType: 'plumbing.create', levelId: p.levelId ?? '' });
  break;
}
```

| Payload field | CEB | initTools | Destination | Disposition |
|---|---|---|---|---|
| `levelId` | carried `:857` | — | — | **CARRIED INTO AN EVENT NOBODY RECEIVES** |
| `id`, `kind`, `origin`, `diameter`, `wallThickness`, `length`, `bendRadius`, `rotation`, `baseOffset`, `systemTag`, `materialId` | ⛔ **NOT IN THE CAST** (`:853` casts to `{ levelId?: string }` and nothing else) | — | — | ⛔ **ALL ELEVEN DROPPED BY OMISSION — EI-2(a)** |
| the event itself | `plumbing.created` emitted at `:854` | ⛔ **NO SUBSCRIBER.** `grep "plumbing" apps/editor/src/engine/initTools.ts` returns store/builder/tool wiring only — **no `runtime.events.on('plumbing.created', …)`** | — | ⛔ **EI-13** — one of C84's nine unconsumed emitters (`plumbing.created:854`) |

**So the pipe path terminates in the plugin DTO store. Nothing bridges it to geometry, and the
event announcing it has no listener.** ⭐ **Dropping eleven fields into an event nobody receives is
not, today, a data-loss defect — it is a defect of ARCHITECTURE, and stating it that way is the
point.** Repairing the field list without wiring a subscriber would be C84 §8.h exactly: *fixing a
symptom whose mechanism you have not measured*.

### 5b. `plumbing.createFixture` (FIXTURE) — ⛔ **THERE IS NO CEB CASE EITHER**

`grep "case 'plumbing" CommandEventBridge.ts` → **one** hit, `:852`. The fixture verb has **no CEB
case and needs none**: it is **L3**, and `CreatePlumbingFixtureHandler.execute` (`:41-56`) hands the
payload straight to `new CreatePlumbingFixtureCommand(cmd as any)` on `window.commandManager`.

| Payload field | Reaches the legacy command? | Site |
|---|---|---|
| `fixtureType`, `position`, `levelId`, `baseOffset`, `width`, `length`, `height`, `rotation`, `toiletVariant`, `showerVariant`, `accessoryVariant` | ✅ **ALL CARRIED** — passed as one object | `CreatePlumbingFixture.ts:16-27` (payload) → `:50` (`new CreatePlumbingFixtureCommand(cmd as any)`) |
| ⚠ the mechanism | `cmd as any` at `:50` | **the whole payload crosses on an `as any` — EI-2(c).** It happens to be correct because `CreatePlumbingFixturePayload` and the registry entry `commands.ts:767` were written to match verbatim (`PlumbingPlanToolHandler.ts:173` says so: *"already matches `CreatePlumbingFixturePayload` (`commands.ts:672`) verbatim"*). **Correct-by-hand-maintenance, unpinned by any test — C84 §8.d** |
| the `.created` event | ⛔ **none** — the fixture verb emits nothing | so no downstream consumer can observe a fixture creation on the bus at all |

**TO-BE.** Either (a) `plumbing.create` gets a real CEB case and an `initTools` bridge, and the
registry entry at `commands.ts:766` is corrected to the pipe's fields; or (b) `plumbing.create` is
declared **PIPE-ONLY AND UNRENDERED**, `PlumbingTool.ts:402,436` stop dispatching `{}`, and the
`plumbing.created` emitter is deleted per `CommandEventBridge.ts:627-631`'s own precedent.
⛔ **What must NOT happen is enriching the CEB cast and calling it fixed.**

---

## 6. Verbs

| Verb | Lineage (C84 §4A) | Stores WRITTEN | Stores RESTORED on undo | Equal? |
|---|---|---|---|---|
| `plumbing.create` (PIPE) | **L1** | plugin DTO `plumbing` **only** — no bridge (§5a) | legacy `PlumbingStore` (`buildUndoStoreMap`: `plumbing → w.plumbingStore`) | ⛔ **NO — and this is the WORST shape of EI-1a in the cohort: the forward write and the inverse apply touch two stores with NO overlap at all** |
| `plumbing.createFixture` (FIXTURE) | **L3** | legacy `PlumbingStore`, via `commandManager` | L2's own stack | ✅ **`affectedStores: [] as const` (`:32`) — the C03 U-2b exit (b), correctly taken.** The only verb in this family that is right |
| `plumbing.delete` | L1 | plugin DTO only | — | **DORMANT** |
| **`element.delete`** (the real delete) | **L2** | `PlumbingStore.remove` `:633`, `bimManager.unregisterElement` `:630`, `semanticGraphManager.removeAllRelationshipsForElement` `:631`, `elementRegistry.unregister` `:632`; `deletedData` cloned `:625` | ⛔ **`createSnapshot` DOES NOT COVER `'plumbing'`** — see §7. Undo relies entirely on the branch's own `deletedData` clone + the restore case at `:1013-1021` | ⚠ **the declared rollback is EMPTY; the actual undo works by a different mechanism** |
| **`plumbing.move`** | — | **NONE — REFUSES** `MovePlumbing.ts:110` | — | ✅ **C16 CA-18 CONFORMANT** |
| `plumbing.setSystem` | L1 | plugin DTO only | legacy (**wrong object**) | ⛔ NO |
| **`plumbing.setMaterial`** | — | **NONE — REFUSES** `SetPlumbingMaterial.ts:83` | — | ✅ **CA-18 CONFORMANT** |
| **MOVE, the live path** | **L2** | `MovePlumbingCommand` → legacy store | legacy | ✅ — see the L-220 note below |
| **ROTATE** | `NOT MEASURED` | the fixture payload carries `rotation: {x,y,z}` (`CreatePlumbingFixture.ts:24`); no rotate verb surfaced | | `NOT MEASURED` |
| **PARAMETER / DIMENSION** via `element.updateParameters` | — | **REFUSES** — `ELEMENT_STORE_ROUTES` (`UpdateElementParameterCommand.ts:112-148`) has **no `plumbing` route**; `:159-161` documents that an unrouted type *"refuses immediately… without writing anything"* | — | ✅ conformant, **undeclared until now** |
| **BATCH CREATE** | — | **CAPABILITY ABSENT** — no `plumbing.batch.create` | — | §12 R6 |
| **LEVEL CHANGE** | `NOT MEASURED` | — | — | `NOT MEASURED` |

### ⭐ L-220 — the two-payload collision, ALREADY DIAGNOSED IN CODE, recorded so it is not re-opened

`registerTransformDragHandler.ts:319-327`, verbatim: *"§FIX-TRANSFORM-DRAG-PAYLOAD-AUDIT (L-220) —
the founder moved a toilet in 3D and the 2D plan did not update. Root cause: this dispatched
`plumbing.move { id, to }`, but the plugin `MovePlumbingHandler` (**registered first**) claims
`'plumbing.move'`, wants `{ plumbingId, delta }`, and rejected the payload at `canExecute` — so the
store was never written and the plan (which re-projects FROM the geometry store) kept drawing the
toilet where it was. Worse, that plugin handler mutates a DETACHED plugin [store]."*

**Three C84 invariants in one incident**: EI-1a (two objects, one key), EI-2 (payload mismatch at a
dispatch site), and **registration order deciding which of two handlers claims a verb** — which C84
does not name and which is the mechanism that turned a mismatch into a **silent no-op with a
success-shaped log line**.

**⚠ EI-3 residual.** Two verbs refuse. **Whether a control still offers those gestures is
`NOT MEASURED`**; the census is [C82](C82-RIBBON-CAPABILITY-SURFACE.md)'s. The refusals are
**required interim conformance** per the C84 EI-7a correction and must not be reverted to silent
success.

---

## 7. Undo / redo

| Verb | `affectedStores` declared | Measured write set | Equal? |
|---|---|---|---|
| `plumbing.create` | `['plumbing']` (`CreatePlumbing.ts:37`) | plugin DTO only | ✅ as a **set**, ⛔ as an **object** (EI-1a) — and the two stores share **no records** |
| `plumbing.createFixture` | `[]` (`CreatePlumbingFixture.ts:32`) | legacy, via L2 | ✅ **correct exit** |
| `plumbing.delete` | `['plumbing']` (`DeletePlumbing.ts:22`) | plugin DTO only | ✅ (dormant) |
| `plumbing.move` | `['plumbing']` (`MovePlumbing.ts:78`) | **none — refuses** | ✅ |
| `plumbing.setSystem` | `['plumbing']` (`:25`) | plugin DTO only | ✅ set / ⛔ object |
| `plumbing.setMaterial` | `['plumbing']` (`:63`) | none — refuses | ✅ |
| **`element.delete` (L2)** | 15 keys **including `'plumbing'`** — `DeleteElementCommand.ts:55` | legacy `PlumbingStore` + 3 side registries | ⛔ **THE DECLARED ROLLBACK IS EMPTY** |

### ⭐ EI-7d — `'plumbing'` IS THE L-953 HOLE IN THIS COHORT

**Measured against the two authorities:**

| Set | Contains `'plumbing'`? | Evidence |
|---|---|---|
| `StoreKey` union (26 members) | ⛔ **NO** | `packages/command-registry/src/types.ts:557-584` — wall, slab, level, column, beam, roof, curtainWall, furniture, lighting, handrail, stair, door, window + 13 view keys |
| `createSnapshot`'s recognised set (16 keys) | ⛔ **NO** | `CommandManagerImpl.ts:578-638`; the `optionalStores` table `:609-625` lists column, beam, roof, curtainWall, furniture, handrail, stair, ceiling, floor, door, window, visibility-intent, view-intent-instance — **no plumbing** |
| `buildUndoStoreMap()` | ✅ **YES** | `performUndoRedo.ts` — `plumbing: w.plumbingStore` |

**So `DeleteElementCommand` declares `'plumbing'`, `createSnapshot` has no branch for it, `scope`
is non-null so the all-stores fallback (`:583-585`) does **not** engage, and the command receives
`{}`. `restoreSnapshot` then restores nothing — with no `else`, no warning, no throw.** That is
**L-953** exactly, in this family. It compiles because `Command.affectedStores` is typed
`ReadonlyArray<string>`, not `ReadonlyArray<StoreKey>` (`types.ts:605`) — so even a typo'd key
would pass; `types.ts:597-598` documents the silence as deliberate *"fail safe"*, which is the
**failure-as-emptiness** shape [C74](C74-CONSTRAINT-HONESTY.md) governs.

⚠ **THE PRECISE, NON-ALARMIST READING, because over-reporting costs the audit its credibility
(C84 §8.g):** the **rollback-on-failed-execute** promise is empty. **Ordinary undo of a plumbing
delete is not broken** — `DeleteElementCommand.ts:625` clones `deletedData` and the restore case at
`:1013-1021` re-adds it and re-registers `elementRegistry.registerSemantic(snap.id,
'plumbing-fixture')`. **Two mechanisms, one declared and empty, one undeclared and working.** The
defect is that the declaration lies, and that a lane reading `affectedStores` would conclude the
opposite of the truth.

⭐ **And the fix has a trap, newly measured.** L-953 proposes retyping the field to
`ReadonlyArray<StoreKey>`. **That would fail to compile `DeleteElementCommand.ts:55`, which also
declares `'ceiling'` and `'floor'` — two keys `createSnapshot` recognises but the `StoreKey` union
does not contain** (`recognised ∖ union` = 2; see [C88 §7](C88-ELEMENT-CEILING.md) /
[C89 §7](C89-ELEMENT-FLOOR.md)). **The union must gain `'plumbing'`, `'ceiling'` and `'floor'` in
the same commit** — and `createSnapshot` must gain a `plumbing` branch. *Reported to the C84 lane;
C84 §5's `check-affected-stores.ts` needs the reverse arm.*

**L-952 does NOT apply to plumbing, and the negative is a finding.** Its eight audit-ratcheting
families are exactly those `ELEMENT_STORE_ROUTES` routes; **plumbing has no route**
(`UpdateElementParameterCommand.ts:112-148`), so parameter edits refuse rather than ratchet.
`NOT MEASURED`: whether `CreatePlumbingFixtureCommand` writes a `metadata` envelope at all, and
therefore whether plumbing even has a counter to ratchet.

**EI-7e — restore or recompute?** Only three services consult `isReverting()` (C84 §4C, cited).
**None is a plumbing service.**

---

## 8. Cascades

| Trigger | Reversed by undo? | Evidence |
|---|---|---|
| plumbing delete → `bimManager` + `elementRegistry` + semantic graph | ⚠ **purged; restored by the `deletedData` path, not by a snapshot** | `DeleteElementCommand.ts:630-632` purge; `:1013-1021` restores the store record and re-registers `elementRegistry.registerSemantic(snap.id, 'plumbing-fixture' as any)` |
| ⛔ **and the branch has NO `_captureRelationships`** | ⛔ | `:621-635` — no capture call, unlike floor `:569` and ceiling `:597`, each added under `§FIX-<FAMILY>-DELETE-LEAVES-GRAPH-EDGES` with the note that *"undo restored NOTHING, which C71 §5.6 rates worse than no purge because it looks correct."* **Plumbing and beam are the two families that fix did not reach** |
| …the graph **UNDO** half generally | **`NOT MEASURED`** | [C71 §5.8](C71-GRAPH-AND-TOPOLOGY.md) requires executed read-back, not a restore call's presence |
| ⚠ **the `as any` on the semantic kind** | — | `:1021` `registerSemantic(snap.id, 'plumbing-fixture' as any)` — the semantic kind is **outside the declared union** and is cast in. **EI-2(c) inside a restore path.** `NOT MEASURED` what the canonical kind should be |
| **fixture → host wall** | ⛔ **NOT MODELLED** | `PlumbingTool.ts:421-432` (`§PLUMBING-NO-WALL-FALLBACK`) snaps a fixture's back to a wall within range but stores **no host reference** — the founder-reported *"I cant create toilets"* fix deliberately made the wall **optional**. So a toilet snapped to a wall does **not** move when that wall moves, and does not know the wall was deleted. ⛔ **Undeclared before this contract** |
| **pipe → fixture connectivity** | ⛔ **NOT MODELLED** | `PlumbingData` (pipe) carries `systemTag` and nothing linking it to a fixture | this is what a plumbing *system* would need |
| `plumbing.created` event → consumers | ⛔ **ZERO SUBSCRIBERS** | C84 **EI-13**: `CommandEventBridge.ts:854`, one of the nine. Wire a consumer or delete the emitter |
| level change → cleanup | `NOT MEASURED` | no plumbing equivalent of `BeamLevelCleanupHandler` surfaced |

**TO-BE.** (1) The delete branch captures relationships before purging (parity with floor/ceiling).
(2) `'plumbing-fixture'` joins the semantic-kind union, or the cast is replaced by a declared
member. (3) Wall-hosting is **modelled or declared absent** — today it is neither, and the snap
makes it *look* hosted.

---

## 9. Vocabularies

| Concept | Vocabulary | Members the pipeline cannot carry (EI-3) |
|---|---|---|
| **Element kind** | ⛔ **TWO INCOMPATIBLE MODELS UNDER ONE NAMESPACE.** (V-a) pipe `kind` — `'straight' \| …` (`CreatePlumbing.ts:61` defaults `'straight'`). (V-b) fixture `fixtureType` — `'toilet' \| 'sink' \| 'shower' \| 'bath' \| …` (`PlumbingTool.ts:390,420`; `PlumbingPlanToolHandler.ts:177`) | **all fixture types are invisible to `plumbing.create`; all pipe kinds are invisible to `plumbing.createFixture`.** The registry entry `commands.ts:766` declares the *fixture* vocabulary on the *pipe* verb |
| **System tag** | `'cold-water' \| 'hot-water' \| 'waste' \| 'vent' \| 'gas'` — `plugins/plumbing/src/committer/material-bridge.ts:8-14`; default `'cold-water'` (`CreatePlumbing.ts:69`) | ✅ carried on the pipe path; ⛔ **no fixture payload field carries a system tag** |
| ⭐ **the vent/fallback collision** | `SYSTEM_COLORS['vent'] = '#9aa3b0'` (`material-bridge.ts:12`) and `FALLBACK_COLOR = '#9aa3b0'` (`:16`) — **the same value** | ⛔ **A VENT PIPE AND A PIPE WHOSE SYSTEM DID NOT RESOLVE ARE THE SAME COLOUR.** Failure and a value are indistinguishable on screen — `[[context-data-honesty-family]]`, and precisely what [C74](C74-CONSTRAINT-HONESTY.md) forbids. **A one-character fix; the finding is that nothing would have caught it** |
| **Material / colour** | ⚠ **TWO.** (V-a) the committer palette above. (V-b) `materialId` on the pipe payload (`CreatePlumbing.ts:28`), carried into the DTO record `:70` and **nowhere else** | everything `plumbing.setMaterial` offers (it refuses) |
| ⚠ the key format is **declared and unpinned** | `material-bridge.ts:3-4`: *"Material key shape (from `producers/plumbing.ts`): `plumbing\|<kind>\|<systemTag>\|<color>\|<materialId>\|body`"* — a comment describing a format produced in **another package**, parsed here by index (`:19-27`) | **C84 §8.d exactly — a comment as the synchronisation mechanism.** A reordering in `producers/plumbing.ts` silently recolours every pipe. **EI-8a: pin it by a test** |
| **Semantic kind** | `'plumbing-fixture'`, cast with `as any` at `DeleteElementCommand.ts:1021` | the value is **outside the declared union** |
| **Fixture variants** | `toiletVariant`, `showerVariant`, `accessoryVariant` — free-form `string` (`CreatePlumbingFixture.ts:25-27`) | ⚠ **no enum anywhere.** `NOT MEASURED` whether a canonical variant list exists; a typo is unrepresentable-as-an-error |

⚠ **The committer palette is Stack-B-only** — reachable only via `bootstrapRenderEverything`, and
production boot passes `canvas: null` (C84 §4D, cited). ⛔ **Nothing in
`plugins/*/src/committer/` may be deleted**: ADR-0331 §D5 is an escalated founder question.

---

## 10. Geometry

| Axis | AS-IS | TO-BE |
|---|---|---|
| **Stack A** | `packages/geometry-plumbing/src/PlumbingFragmentBuilder.ts` (3-D) + `PlumbingPlanSymbolBuilder.ts` + `PlumbingElevationSymbolBuilder.ts` (2-D). The two symbol builders are **CO-LIVING**, not duplicates — C84 §3.5.3's `StairPreviewRenderer`/`CurvedStairRenderer` reasoning applies: different question, different output | unchanged; the verdict is recorded so nobody "dedupes" them |
| **Stack B** | `packages/geometry-kernel/src/producers/plumbing.ts` + `plugins/plumbing/src/committer/plumbing-committer.ts` | ⛔ not deletable — ADR-0331 §D5 |
| **Proven to agree?** | ⛔ **NO HARNESS**, and **structurally the least comparable of the five**: Stack B produces a **pipe** from `kind`/`diameter`/`bendRadius`; Stack A meshes a **fixture** from `fixtureType`/`width`/`length`/`height`. **They do not model the same object**, so a naive A/B harness would compare two different elements and report divergence that means nothing | resolve §1's two-element split **first**. A parity harness before that is C84 §8.e in a new costume — *a parity test that compares the wrong pair* |
| **Datum convention** | fixture Y: `PlumbingPlanToolHandler.ts:179` dispatches `position: {x, y: 0, z}` with `baseOffset: 0` (`:183`); the 3-D tool sets `finalPos.y = Math.max(slabPoint.y, finalPos.y)` (`PlumbingTool.ts:432`). ⛔ **TWO DIFFERENT VERTICAL RULES FOR ONE FIXTURE TYPE, depending on which surface placed it** — the plan tool floors it at 0, the 3-D tool snaps it to the slab | **ONE plumbing-Y authority, named here.** Measuring which is correct is Delta 8 |
| **Wall snapping** | `PlumbingTool.ts:427-431` — `getNearestWall`, offset `0.02` along the normal when a wall is in range, free placement otherwise (`§PLUMBING-NO-WALL-FALLBACK`) | the `0.02` is an unnamed call-site literal — [C73 §2.2/§2.3](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md)'s subject. It should come from a declared, unit-qualified constant |

---

## 11. THE DELTA

| # | Item | Invariant | Proof (⛔ watched RED first) |
|---|---|---|---|
| **1** | **`plumbing.create` is dispatched with `{}` twice per 3-D fixture placement** (`PlumbingTool.ts:402,436`), minting a phantom default pipe at the world origin (`CreatePlumbing.ts:57-79`) | **EI-2 / C11** — the furniture defect, second family | Place a bath in 3-D; assert the plugin plumbing store gained **zero** records, or one that describes the bath. Today: one 1 m cold-water pipe at `{0,0,0}` |
| **2** | **`'plumbing'` is declared in `affectedStores` and absent from `createSnapshot`** — the declared rollback is `{}` | **L-953 / C03 §4.6 U-2** | Add a `plumbing` branch to `optionalStores` (`CommandManagerImpl.ts:609-625`) **and** add `'plumbing'`, `'ceiling'`, `'floor'` to the `StoreKey` union **in the same commit** that retypes `affectedStores` to `ReadonlyArray<StoreKey>` |
| **3** | **`plumbing.create`'s registry entry declares FIXTURE fields for the PIPE handler** — `commands.ts:766` vs `CreatePlumbing.ts:16-29`; **one shared field name**, and `[k: string]: unknown` is what makes it compile | **EI-2(c) / EI-8** | correct the entry; assert `{}` no longer type-checks |
| **4** | **Two `elementType` spellings that `.toLowerCase()` cannot collapse** — `'PlumbingFixture'` (`PlumbingFragmentBuilder.ts:28,66`) vs `'plumbing'` | **C84 §4E / [C15 §12](C15-HOSTED-ELEMENT-CONTRACT.md)** | declare `'PlumbingFixture'` a **sub-part** via `userData.role` + `parentId`; assert one canonical tag |
| **5** | **`plumbing.created` (`CommandEventBridge.ts:854`) drops eleven payload fields into an event with zero subscribers** | **EI-2(a) + EI-13** | wire a bridge **or** delete the emitter — `CommandEventBridge.ts:627-631` is the in-file precedent. ⛔ **Do not enrich the cast alone (C84 §8.h)** |
| **6** | **TWO 40-line `PlumbingStore` classes diverging at `:29`** on the update event's payload shape | **EI-9 / EI-10** | run the two-axis census (C84 §3.5.1); then converge, or issue an EI-10 licence with an executed equivalence proof |
| **7** | **A vent pipe and a colour-resolution failure are the same hex `'#9aa3b0'`** — `material-bridge.ts:12,16` | [C74](C74-CONSTRAINT-HONESTY.md) | give the fallback a distinct value; assert an unresolved system is visually distinguishable |
| **8** | **Two vertical rules for one fixture** — plan tool `y: 0` (`PlumbingPlanToolHandler.ts:179`), 3-D tool `max(slabPoint.y, …)` (`PlumbingTool.ts:432`) | **EI-9 / EI-11** — one route per user intent (C84 EI-4a generalised) | one seating helper, both callers; assert byte-equal Y for one input |
| **9** | **The plumbing delete branch does not `_captureRelationships`** (`:621-635`), while floor `:569` and ceiling `:597` do | EI-5 + [C71 §5.6](C71-GRAPH-AND-TOPOLOGY.md) | delete a fixture with graph edges, undo, assert the edges return |
| **10** | **`registerSemantic(id, 'plumbing-fixture' as any)`** (`:1021`) — a semantic kind outside the union | **EI-2(c)** | add the member, or use a declared one |
| **11** | **`PlumbingPlacementTool` — the only correct pipe dispatcher — is constructed nowhere** (`plugins/plumbing/src/index.ts:22-24`, zero `new` sites) | **EI-12** — *a trigger with no dispatcher and a dispatcher with no runner fail identically* | wire it, or declare it dormant with the condition that makes it live |
| **12** | **The material-key format is a comment describing another package's output**, parsed by index (`material-bridge.ts:3-4,19-27`) | **EI-8a / C84 §8.d** | pin by an executed test against `producers/plumbing.ts` |
| **13** | **Fixture↔wall hosting is not modelled** — the snap makes it look hosted (`PlumbingTool.ts:427-431`) | [C78](C78-UNIVERSAL-RELATIONSHIP-CONTRACT.md) / [C79 §7.2](C79-REGION-SEMANTICS.md) | POPULATE, REMOVE or DECLARE |
| **14** | No Stack A/B parity harness — **and Delta 1/3 must land first**, or the harness compares a pipe to a fixture | **EI-11 / C84 §8.e** | resolve the two-element split, then build `tests/parity/plumbing/` consuming `geometry-kernel/src/tolerance.ts` (**L-954**), never a bare `TOL` |
| **15** | The `0.02` wall offset is an unnamed, unit-unqualified call-site literal (`PlumbingTool.ts:429`) | [C73 §2.2/§2.3](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) | a declared constant |

---

## 12. REFUSALS

| # | Not supported | Status | Instead |
|---|---|---|---|
| **R1** | **`plumbing.move` does not reach authoritative state** | ✅ **DECLARED, C16 CA-18 conformant** — `MovePlumbing.ts:110`; mechanism `:28-70`, the same form as `MoveColumn.ts` / `MoveBeam.ts` | the legacy `MovePlumbingCommand`, which the 3-D drag path reaches (`registerTransformDragHandler.ts:312-330`, `§FIX-TRANSFORM-DRAG-PAYLOAD-AUDIT` / L-220) |
| **R2** | **`plumbing.setMaterial` does not reach authoritative state** | ✅ **DECLARED, CA-18 conformant** — `SetPlumbingMaterial.ts:83`, reason `:57` | the legacy update path |
| **R3** | ⛔ **`plumbing.move` / `plumbing.delete` MUST NOT BE RETIRED** despite having no dispatcher | ✅ **DECLARED** — `tools/ga-gate/check-chat-capability-coverage.ts` requires every `CapabilityRefusal` / `CHAT_UNAVAILABLE` / `ChatCommandClassification` name to be a **registered** bus command. C84 §3.5.3 independently grades the `<kind>.delete` verbs **DORMANT — do not delete** | leave registered; refuse in `canExecute` |
| **R4** | `element.updateParameters` **refuses for plumbing** — no `ELEMENT_STORE_ROUTES` entry (`UpdateElementParameterCommand.ts:112-148`, refusal documented `:159-161`) | ✅ conformant, ⛔ **UNDECLARED before this contract** | `plumbing.setSystem`, or the legacy update path |
| **R5** | **A plumbing FIXTURE cannot be created through `plumbing.create`** — that verb models a **pipe** | ✅ **DECLARED IN CODE** — `PlumbingPlanToolHandler.ts:167-174`, `§FIX-PLUMBING-FIXTURE-CMD`, [C11 §11.11](C11-ELEMENT-CREATION-PIPELINE.md) | `plumbing.createFixture`. ⚠ **The declaration is in a tool comment, not in a refusal**: `plumbing.create` still **accepts** a fixture payload and silently drops every fixture field (Delta 3) |
| **R6** | **There is no `plumbing.batch.create`** | ⛔ **UNDECLARED before this contract — now DECLARED** | dispatch N singles. A batch verb would need the `subject`-key work `syncDisposition.ts:914-925` describes |
| **R7** | Plumbing is **absent from the bake worker** | ✅ **DECLARED HERE** — `HeadlessBakeSession.ts:31,43,53` is wall-only by construction | not a defect; scope is ADR-0331 §D5, a founder question |
| **R8** | **A PIPE CREATED ON THE BUS IS NEVER RENDERED, EXPORTED OR PERSISTED** — `plumbing.create` terminates in the DTO store; there is no bridge (§5a) | ⛔ **NOT A REFUSAL — SILENCE, AND IT RETURNS `success: true`** | until a bridge exists, `plumbing.create` MUST refuse in `canExecute` naming the mechanism, exactly as its own `move` and `setMaterial` siblings already do (Delta 1) |
| **R9** | **A FIXTURE SNAPPED TO A WALL IS NOT HOSTED BY IT** — no reference is stored | ⛔ **UNDECLARED before this contract — now DECLARED AS ABSENT.** The 0.02 m snap makes it look hosted; move the wall and the toilet stays | model the relationship, or state in the UI that fixtures are free-standing (Delta 13) |
| **R10** | **Fixture variants are unvalidated free-form strings** (`CreatePlumbingFixture.ts:25-27`) | ⛔ **NOT A REFUSAL — SILENCE.** A typo'd variant is indistinguishable from a valid one | an enum, or an explicit refusal on an unknown variant |

> *"No affordance without an implementation… A refusal is a correct answer; a silently-wrong wall
> is not."* — `packages/geometry-wall/src/WallRake.ts:50-62`.
> **R8 is this family's worst state and the one to fix first: a verb that returns `success: true`,
> writes a record, and creates nothing the user will ever see. Plumbing already knows how to refuse
> — `move` and `setMaterial` do it well. `create` does not.**
