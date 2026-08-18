# C97 — ELEMENT: FURNITURE

> **Stamp**: 2026-08-18 · **Status**: CANONICAL — binding on every PR touching the furniture family
> **Parent**: [C84 §6](C84-ELEMENT-INTEGRITY.md). C84 owns `EI-1…EI-13`; C97 owns their application to
> furniture. **Structure**: C84 §6's twelve mandatory sections, **AS-IS** (measured, `file:line`, HEAD
> `3384f076`) beside **TO-BE** (normative).
> **Cites, does not restate**: [C03 §4.6 U-2/U-2b](C03-SCHEMAS-COMMANDS-AND-STATE.md) owns
> `affectedStores` · [ADR-0319 §2](../adrs/ADR-0319-audit-fields-are-derived-not-authored.md) owns audit
> fields across undo (**NOT C75**) · [C11 §5.4](C11-ELEMENT-CREATION-PIPELINE.md) owns the seating datum ·
> [C16 CA-17…CA-21](C16-COMMAND-AUTHORING-PROTOCOL.md) owns authoring and refusal ·
> [C82](C82-RIBBON-CAPABILITY-SURFACE.md) owns whether a control is offered.
> **Why this family is severity #3 in [C84 §4](C84-ELEMENT-INTEGRITY.md)**: the dispatched payload and
> the Zod record share **no geometry field at all**, every `??` default fires, **`Furniture.parse`
> SUCCEEDS**, and the store receives `catalogId:''`, `origin:{0,0,0}`, `representations:{}` for every
> item. No throw, no warn. **Four `as any` casts are why `tsc` never saw it.**

---

## 0. WHY IT LOOKS FINE — and that is the whole defect

> **Furniture renders correctly in 3D and in plan. It saves and reloads. It exports to IFC. And the
> record that `Furniture.parse` validated is garbage for every single item.**

Both facts are true because **they are not the same record.** The renderer never reads the parsed one.

```
 dispatch payload ──▶ CreateFurnitureHandler ──▶ Furniture.parse ──▶ plugin DTO store
 {furnitureType,             (reads catalogId,     SUCCEEDS with        catalogId:''
  position, width,            origin, size…        every ?? default     origin:{0,0,0}
  length, height,             — all undefined)     fired               representations:{}
  material, color,                                                     ⇒ ZERO READERS
  kitchenConfig, …}
        │
        └──▶ CommandEventBridge reads record.payload RAW ──▶ 'furniture.created' ──▶ legacy store
             (CommandEventBridge.ts:742 — the REQUEST, not the handler's output)        │
                                                                                        ▼
                                                            renderer · plan · persistence · IFC
```

**The load-bearing measurement is `packages/runtime-composer/src/CommandEventBridge.ts:742`:**
`const p = record.payload as {…}` — and the file states the principle itself at `:63` and `:218-219`:
*"The payload is derived from `record.payload` (what the caller passed to `executeCommand`)."*
Contrast `wall.create` at `:227-231`, which **explicitly prefers the Immer `add` patch value over the
request payload**. **Furniture has no such preference.** So the bridge routes around the handler, and
the mangling is invisible.

> ⛔ **§C97-DO-NOT-FIX-THE-BRIDGE-FIRST.** The obvious repair — make the bridge prefer the parsed
> record, as `wall.create` does — would **turn a silent defect into an instant total regression**:
> every furniture item would render at the origin with no size. **The payload↔schema vocabulary must be
> reconciled BEFORE the bridge is made faithful.** This ordering is normative. It is
> [C84 §8.h](C84-ELEMENT-INTEGRITY.md) — *fixing a symptom whose mechanism you have not measured* —
> pre-empted.

---

## 1. Identity

| Axis | AS-IS (measured) | TO-BE |
|---|---|---|
| Canonical tag | **`'Furniture'`** — `packages/geometry-furniture/src/FurnitureFragmentBuilder.ts:98`, **frozen** via `Object.defineProperty` at `:117` | **`'Furniture'`, frozen**; consumers normalise per [C15 §12](C15-HOSTED-ELEMENT-CONTRACT.md) |
| **Other spellings** | ⛔ **SEVENTEEN distinct values** — see §1.1 | ⛔ **VIOLATION.** One family tag + declared sub-parts |
| L0 Zod schema | `packages/schemas/src/elements/Furniture.ts:49`; `FurnitureRepresentation` `:17`, `FurnitureLod` `:36`; registry `registry.ts:55`; `FurnitureId` `types/Id.ts:31` | unchanged |
| Bus verb namespace | `furniture.*` — but **only 3 verbs are TYPED** on the bus (`commands.ts:755,764,765`) while the plugin registers **10** (`plugins/furniture/src/handlers/index.ts:15-26`) | all 10 typed; all in [C69](C69-API-VERB-REGISTER.md) |

⛔ **Seven verbs (`delete`, `move`, `rotate`, `setScale`, `setActiveLod`, `setRepresentation`,
`setMaterial`) are registered handlers with NO payload type in `commands.ts`.** A verb with no declared
payload cannot be gated by a field-coverage check — it is invisible to the very gate C84 §7 specifies.

### 1.1 ⛔ Seventeen `elementType` spellings — the worst tag sprawl measured

`'Furniture'` `:98` · `'FurniturePart'` `:249` · **`'furniture'` lowercase** (`CornerSofaBuilder.ts:330`,
`WhiteSofaBuilder.ts:289`) · `'KitchenCabinetUnit'` (`KitchenCabinetEngine.ts:612`) ·
`'KitchenCabinetPart'` (`:663,1320,1348,1357,1378,1409,1428,1457`) · `'KitchenCountertop'` (`:181,453`) ·
`'kitchen_unit'` (`:32`, doc only) · `'WardrobeTopModule'` (`WardrobeCabinetEngine.ts:220`) ·
`'WardrobeSection'` (`:283`) · `'wardrobe_unit'` · `'ParametricTree'` (`ParametricTreeEngine.ts:96`) ·
`'TreeTrunk'` (`:144,155`) · `'TreeBranch'` (`:175,329`) · `'TreeFoliageCluster'` (`:209,421`) ·
`'TreeFoliageBlob'` (`:289,299,355,365,387,405,448,459,487`) · `'TreeCanopy'` (`foliageCards.ts:221`) ·
`'TreeFoliageCard'` (`:242`) · `'TreeCanopyShell'` (`:255`).

⛔ **The plan-view layer map resolves only THREE of them** — `EdgeProjectorService.ts:158`:
`Furniture` / `FurniturePart` / `GenericComponent` → `'A-FURN'`. **The fourteen Kitchen / Wardrobe /
Tree tags are absent from that table**, so those sub-meshes have no declared plan layer.

Per [C84 §4E](C84-ELEMENT-INTEGRITY.md): *multiple spellings of one family are the violation; multiple
casings of one spelling are not.* `'furniture'` vs `'Furniture'` is a casing (fine, C15 §12). The other
fifteen are **spellings**. **TO-BE:** one family tag; every sub-mesh declares
`userData.role = 'geometry'` + `parentId` — C15 §12's existing mechanism — rather than minting a tag.

⚠ **A FOURTH identity namespace exists and is NOT MEASURED**:
`packages/geometry-furniture/src/AIElementConfig.ts:116-117` declares its own `elementType` slug
registry (e.g. `"ai_floor_lamp"`), validated at `AIElementValidator.ts:44-45` and referenced by
`ProjectLoader.ts:106-108`. Its production wiring was not measured.

---

## 2. Stores

| # | Representation | Path | Writers | Readers | Verdict |
|---|---|---|---|---|---|
| 1 | L0 Zod schema | `packages/schemas/src/elements/Furniture.ts:49` | the bus payload | `CreateFurniture.ts:80` | shape β (§5) |
| 2 | **Plugin DTO store** | `plugins/furniture/src/store.ts:10`, key `'furniture'` `:11`; built fresh at `PluginRegistry.ts:344-350` | all 10 handlers | ⛔ **ZERO in production** | **write-only, and it holds GARBAGE** |
| 3 | **Legacy geometry store** | `packages/geometry-furniture/src/FurnitureStore.ts:7`, live as `window.furnitureStore` (`initBuilders.ts:741`, `initTools.ts:996`) | `initTools.ts:2079`, `CreateFurnitureCommand`, `DeleteElementCommand.ts:503`, `UpdateElementParameterCommand.ts:507` | **everything real** | 🟢 **THE AUTHORITY** |
| 3′ | *duplicate of #3* | `packages/core-app-model/src/stores/FurnitureStore.ts:7` — **verbatim duplicate** | — | — | ⚠ **EI-9 violation** |
| 4 | Scene `userData` | `FurnitureFragmentBuilder.ts:96-115` + 17 engines | the builders | plan layers, IFC `findMesh`, picking | derived |
| 5 | Kernel producer | `packages/geometry-kernel/src/producers/furniture.ts:186` | `FurnitureCommitter` | ⛔ **never instantiated** | **DEAD — not deletable** |

> ### EI-1 — THE AUTHORITY IS `packages/geometry-furniture/src/FurnitureStore.ts` (`window.furnitureStore`)

**EI-1a — the `'furniture'` key resolves to two objects.** WRITE (bus verb) → the plugin DTO snapshot;
UNDO → `performUndoRedo.ts:322` `furniture: w.furnitureStore` — the **legacy geometry** store. Declared
per EI-1a / [C03 §4.6 U-2b](C03-SCHEMAS-COMMANDS-AND-STATE.md). `MoveFurniture.ts:51-56` names this
hazard in its own header, and it is pinned by `apps/editor/__tests__/deadMoveVerbAuthoritativeState.test.ts`.

**EI-5a — the DTO store is a write-only shadow AND its contents are meaningless.**
⛔ Do not mirror or reconcile ([C84 §8.c](C84-ELEMENT-INTEGRITY.md)). **Furniture sharpens EI-5a: for
most families a reconciliation would at least copy correct data. Here it would propagate
`catalogId:''` / `origin:{0,0,0}` into the authority and destroy the model.** **TO-BE:** declare on the
`plugins/rooms/src/store.ts:1-29` model — winner, 0 readers, 10 writers, retirement path (ADR-0331 §D2).

---

## 3. Consumers — no split-brain, one absence

| Consumer | Reads | Evidence | Verdict |
|---|---|---|---|
| Renderer (3D) | legacy | `FurnitureFragmentBuilder.ts:74` `updateFurniture(data)` via `bim-furniture-added/updated` | ✅ |
| Plan view | legacy | `EdgeProjectorService.ts:56-67,157-158,1951`; symbols read `window._pryzmStores` (`SofaPlanSymbolBuilder.ts:25`) | ✅ |
| **Persistence — SAVE** | legacy | **LIVE pair** `apps/editor/src/engine/persistence/ProjectSerializer.ts:44,136,696,1021,1104` | ✅ |
| **Persistence — LOAD** | legacy | **LIVE pair** `ProjectLoader.ts:105,1141-1193`, `:1154` `new CreateFurnitureCommand({…})` | ✅ |
| IFC export | legacy | `packages/file-format/src/export/ifc/readers/FurnitureReader.ts:6,9,11`; wired `FragmentReader.ts:42,111-113`; `'IfcFurnishingElement'` `:36` | ⚠ **lossy — §3.1** |
| GLB export | scene meshes | `GLBExporter.ts:392` is a comment only — **no furniture-specific path** | ⚠ generic |
| **Bake worker** | — | `grep -rn "urniture" apps/bake-worker/src` → **ZERO hits** | ⛔ **ABSENT** |

**EI-1 verdict: ✅ CLEAN — every consumer that reads anything reads legacy.** Recorded per **EI-1b**.
⚠ **The DEAD pair also carries furniture** (`packages/persistence-client/src/loader/ProjectSerializer.ts:44,100,563,712`)
— a second persistence path, EI-9, **not deletable** (C84 §3.5 `OTHER-HOST-LIVE`).

### 3.1 ⛔ IFC export hard-zeroes rotation

`FurnitureReader.ts:41` — `rotation: { x:0, y:0, z:0 }`. **Furniture yaw does not survive IFC export.**
The pset `'Pset_FurnitureTypeCommon'` (`:28`) carries only `FurnitureType / Width / Height / Length`
(`:23-26`) — no material, no colour, no catalogue reference. **EI-2(a) at the export hop.**
**TO-BE:** carry the rotation, or declare it dropped in the export and say so to the user.

---

## 4. Plugin ↔ DTO ↔ command ↔ builder — 7 of 10 handlers are dead

| Handler | `type` | Registered | UI-reachable | Verdict |
|---|---|---|---|---|
| `CreateFurniture.ts:37` | `furniture.create` | ✅ | ✅ **5 dispatchers** | **LIVE — and totally mangling (§5)** |
| `CreateFurnitureBatch.ts:61` | `furniture.batch.create` | ✅ | ✅ D-FLE | **LIVE** |
| `DeleteFurniture.ts:20` | `furniture.delete` | ✅ | ⛔ 0 | **DORMANT** |
| `MoveFurniture.ts:75` | `furniture.move` | ✅ | ⛔ refuses `:111` | ✅ **CA-18 conformant** |
| `RotateFurniture.ts:78` | `furniture.rotate` | ✅ | ⛔ refuses `:114` | ✅ **CA-18 conformant** |
| `SetFurnitureScale.ts:26` | `furniture.setScale` | ✅ | ⛔ 0 | ⛔ **DEAD AND ACCEPTS** — see below |
| `SetActiveLod.ts:28` | `furniture.setActiveLod` | ✅ | ⛔ 0 | ⛔ **DEAD AND ACCEPTS** |
| `SetFurnitureRepresentation.ts:36` | `furniture.setRepresentation` | ✅ | ⛔ 0 | ⛔ **DEAD AND ACCEPTS** |
| `UpdateFurnitureParameters.ts:64` | `furniture.updateParameters` | ✅ | ✅ **12 dispatchers** | 🟢 **THE LIVE MUTATION PATH** |
| `SetFurnitureMaterial.ts:59` | `furniture.setMaterial` | ✅ | ⛔ refuses `:83` | ✅ **CA-18 conformant** |

⛔ **Three handlers are dead AND return success** — `setScale`, `setActiveLod`, `setRepresentation`
accept, write the unread store, and report `success: true` over nothing. **That is precisely what
[C16 CA-18](C16-COMMAND-AUTHORING-PROTOCOL.md)'s `CA-DOCTRINE-A` forbids**: *"a refusal that names its
reason is strictly better than a silent lie, and both are better than a `success: true` over nothing."*
Their three refusing siblings show the compliant shape. **TO-BE: refuse, with a named reason.**

⛔ **`setRepresentation` is not merely dead — the schema depends on it.** `Furniture.ts:104` states
`representations` are populated *"from the catalogue at create-time per ADR-0024 §2"* **by this verb**.
Nothing calls it. **The field the L0 schema declares as populated is populated by nobody** — which is
why `representations: {}` in §5 is not a transient default but the permanent state.

**Also dead-but-exported:** `plugins/furniture/src/tool.ts:36` `FurniturePlacementTool`;
`committer/furniture-committer.ts:60` `FurnitureCommitter`; `catalogue/seed.ts` `SEED_FURNITURE_CATALOGUE`.

---

## 5. THE BRIDGE FIELD MAP — the total-loss table (EI-2)

### 5.1 The dispatched payload — every field, and where it goes

Bus type `packages/command-bus/src/commands.ts:755`:
`{ furnitureType: string; position: {x,y,z}; levelId?: string; [k: string]: unknown }` — **3 typed
fields and an open index signature.** The index signature is what lets a 28-field object type-check.

| Dispatched field | Read by `CreateFurniture.ts:64-77`? | Reaches Zod record? | Reaches LEGACY store (`initTools.ts:2080-2102`)? | Disposition |
|---|---|---|---|---|
| `id` | ✅ `:64` `?? createId('furniture')` | ✅ | ✅ `:2080` | **CARRIED (both)** |
| `levelId` | ✅ `:67` `?? ''` | ✅ | ✅ `:2088` | **CARRIED (both)** |
| `rotation` | ✅ `:70` `?? 0` | ✅ scalar | ✅ `:2086` lifted to Euler `.y` | **CARRIED (both)** |
| **`furnitureType`** | ⛔ **NEVER READ** — the handler reads `catalogId` | ⛔ `catalogId: ''` | ✅ `:2082` | ⛔ **LOST to the DTO** |
| **`position`** | ⛔ **NEVER READ** — the handler reads `origin` | ⛔ `origin: {0,0,0}` | ✅ `:2083-2085` (Y re-seated) | ⛔ **LOST to the DTO** |
| **`width`** | ⛔ **NEVER READ** — the handler reads `size: Vec3` | ⛔ absent | ✅ `:2091` `?? 0.6` | ⛔ **LOST to the DTO** |
| **`length`** | ⛔ NEVER READ | ⛔ absent | ✅ `:2092` `?? 0.6` | ⛔ **LOST to the DTO** |
| **`height`** | ⛔ NEVER READ | ⛔ absent | ✅ `:2093` `?? 0.9` | ⛔ **LOST to the DTO** |
| **`baseOffset`** | ⛔ NEVER READ | ⛔ **no such schema field** | ✅ `:2090` `?? 0` | ⛔ **DROPPED from the DTO entirely** |
| **`material`** | ⛔ NEVER READ — handler reads `materialId`/`materialSlots` | ⛔ absent | ✅ `:2094` `?? 'wood'` | ⛔ **LOST to the DTO** |
| **`color`** | ⛔ NEVER READ | ⛔ absent | ✅ `:2099` | ⛔ **LOST to the DTO** |
| **`furnitureCategory`** | ⛔ NEVER READ | ⛔ **no such schema field** | ✅ `:2100` | ⛔ **DROPPED from the DTO entirely** |
| **`kitchenConfig`** | ⛔ NEVER READ | ⛔ **no such schema field** | ✅ `:2101` | ⛔ **DROPPED from the DTO entirely** |
| **`wardrobeCabinetConfig`** | ⛔ NEVER READ | ⛔ **no such schema field** | ✅ `:2102` | ⛔ **DROPPED from the DTO entirely** |
| `catalogId` | ✅ `:68` `?? ''` | ✅ | ⛔ no legacy field | **nobody dispatches it** |
| `origin` | ✅ `:69` `?? {0,0,0}` | ✅ | ⛔ | **nobody dispatches it** |
| `scale` | ✅ `:71` `?? 1` | ✅ | ⛔ **no legacy field** | **nobody dispatches it** |
| `size` | ✅ `:72` (no default) | ✅ | ⛔ | **nobody dispatches it** |
| `activeLod` | ✅ `:73` `?? 2` | ✅ | ⛔ | **nobody dispatches it** |
| `representations` | ✅ `:74` `?? {}` | ✅ | ⛔ | **nobody dispatches it** |
| `materialSlots` | ✅ `:75` `?? {}` | ✅ | ⛔ | **nobody dispatches it** |
| `materialId` | ✅ `:76` (no default) | ✅ | ⛔ | **nobody dispatches it** |

**11 `cmd.*` reads · 9 `??` defaults · and only `id`, `levelId`, `rotation` are read from a field any
dispatcher actually sends.**

> ### ⭐ THE MEASUREMENT THAT NAMES THE MECHANISM
> **Only `levelId` and `rotation` cross by the same name.** Every geometry and identity field is a
> **rename**: `furnitureType`→`catalogId`, `position`→`origin`, `width`/`length`/`height`→`size: Vec3`,
> `material`/`color`→`materialId`/`materialSlots`. And four dispatched fields — `baseOffset`,
> `furnitureCategory`, `kitchenConfig`, `wardrobeCabinetConfig` — **have no schema counterpart at all.**
>
> ⛔ **Zod's `strip` mode is the enabling mechanism** — the same one the Roof schema names at `:91-94`:
> *"Zod's default `strip` mode deleted it in transit while `parse()` reported success."* Every renamed
> field is stripped as unknown; every target field takes its `??` default; **`parse` succeeds.**

### 5.2 The four `as any` casts — why `tsc` never saw it

| # | Site | Cast |
|---|---|---|
| 1 | `apps/editor/src/ui/furniture-carousel/FurnitureDragDropHandler.ts:490` | `} as any)` closing the literal opened at `:475` |
| 2 | `apps/editor/src/ui/kitchen/KitchenCabinetTool.ts:410` | `executeCommand('furniture.create', payload as any)` |
| 3 | `apps/editor/src/ui/wardrobe/WardrobeCabinetTool.ts:384` | `executeCommand('furniture.create', payload as any)` |
| 4 | `apps/editor/src/engine/views/plantools/FurniturePlanToolHandler.ts:412` | `payload as unknown as Record<string, unknown>` — a **double-cast**, same type-erasure at the same seam |

⚠ **A fifth and a sixth site erase types WITHOUT a cast:** `FurnishLayoutExecutor.ts:584` (`as unknown`)
and `CopyPlanToolHandler.ts:477`, which dispatches a **28-field inline literal with no cast at all** —
it type-checks **purely because of the `[k: string]: unknown` index signature at `commands.ts:755`.**

> ⛔ **Removing the four casts is NOT the fix and would not surface the defect.** The index signature
> makes the payload structurally assignable regardless. **The index signature must go first**, or the
> gate C84 §7 specifies must read the declared field map rather than the type. This is
> [C84 EI-2(c)](C84-ELEMENT-INTEGRITY.md) with an extra floor beneath it.

**All six exist because `buildFurnitureCreatePayload`'s output (`furnitureCreatePayload.ts:133-149`) is
structurally incompatible with the declared bus payload.** ⚠ That module's header `:9-14` claims three
surfaces converge on it; **measured, two more surfaces bypass it** (`FurnitureDragDropHandler.ts:475`,
`CopyPlanToolHandler.ts:477`). A convergence claim that is 3-of-5 true is C84 §8.d in prose form.

### 5.3 The `.created` bridge — the one hop that works

`CommandEventBridge.ts:737-775`. **13 fields destructured at `:742-757`, 14 emitted at `:758-775`** —
`id, levelId, furnitureType, position, rotation, baseOffset, width, length, height, material, color,
furnitureCategory, kitchenConfig, wardrobeCabinetConfig` (+ `commandId`, `commandType`).
Batch: `:779-827`, per-entry emit `:809`, guard `:808`, `commandType` rewritten to `'furniture.create'`
at `:811` — the [C84 §4B](C84-ELEMENT-INTEGRITY.md) batch-rewrite, confirmed for this family.

Subscriber `initTools.ts:2031-2116`: guard `:2032`, dedup `:2035`, level lookup `:2068-2072`, **FFL
datum `:2073-2078`** (`resolveFloorSeatingDatumFrom`), write `:2079-2103`, then `:2106` VDT, `:2107`
`bimManager.registerElement`, `:2116` `elementRegistry.registerSemanticOrReplace`.

⚠ **Silent geometric defaults at the bridge**: `:2091-2093` supply `0.6 / 0.6 / 0.9` when a dispatcher
omits dimensions. **A dispatcher bug becomes a plausible-looking box**, not an error. EI-2(a).

---

## 6. Verbs

| Verb | Lineage | Handler | `affectedStores` | WRITTEN | RESTORED | Equal? |
|---|---|---|---|---|---|---|
| `furniture.create` | **L1** | `CreateFurniture.ts:40`, `produceCommand :83` | `:41` `['furniture']` | plugin DTO (**garbage**) | legacy | ⛔ **disjoint** |
| `furniture.batch.create` | **L1** | `CreateFurnitureBatch.ts:64`, one `produceCommand` `:132` | `:65` `['furniture']` | plugin DTO | legacy | ⛔ disjoint — ✅ **one patch pair for N items is correct** |
| `furniture.delete` | **L1** | `DeleteFurniture.ts:23` | `:24` | plugin DTO | legacy | ⛔ **DORMANT** |
| **DELETE (live)** | **L2** | `DeleteElementCommand.ts:464-508` | `:55` includes `"furniture"` | legacy + children | ✅ `:874-910` | ✅ **and it cascades — §8** |
| `furniture.move` | **L1** | `MoveFurniture.ts:78` | `:79` | **nothing — refuses `:111`** | n/a | ✅ **CA-18** |
| `furniture.rotate` | **L1** | `RotateFurniture.ts:81` | `:82` | **nothing — refuses `:114`** | n/a | ✅ **CA-18** |
| `furniture.setScale` | **L1** | `SetFurnitureScale.ts:29` | `:30` | plugin DTO | legacy | ⛔ **DEAD AND ACCEPTS** |
| `furniture.setActiveLod` | **L1** | `SetActiveLod.ts:31` | `:32` | plugin DTO | legacy | ⛔ **DEAD AND ACCEPTS** |
| `furniture.setRepresentation` | **L1** | `SetFurnitureRepresentation.ts:39` | `:40` | plugin DTO | legacy | ⛔ **DEAD AND ACCEPTS** |
| `furniture.setMaterial` | **L1** | `SetFurnitureMaterial.ts:62` | `:63` | **nothing — refuses `:83`** | n/a | ✅ **CA-18** |
| **`furniture.updateParameters`** | **L4 + L2 hybrid** | `UpdateFurnitureParameters.ts:64` (object literal) | `:74` `['furniture']` | legacy, via `window.commandManager.execute(new UpdateFurnitureParametersCommand(…))` `:99-106` | hand-forged `PatchPair` `:50-62`, **gated on `cmd._recordUndo` `:96`** | ⚠ **§6.1** |
| `UPDATE_FURNITURE_PARAMETERS` (replay) | **L3** | `initBusHandlers.ts:1032` | `:1033` `[]` | legacy via `_cmExec` | L2's stack | ✅ |
| LEVEL CHANGE | — | **NOT MEASURED** | — | — | — | — |

### 6.1 ⛔ The live mutation path records undo for the gizmo and NOT for the panel

`UpdateFurnitureParameters.ts` builds a store-relative `PatchPair` at `:50-62`
(`{op:'replace', path:[cmd.id,'position'|'rotation']}`) **only when `cmd._recordUndo` is set (`:96`)**;
otherwise it returns `{forward: [], inverse: []}` (`:97`).

**⇒ The 3-D gizmo and plan drag get a ring-buffer entry. The property panel, the Kitchen/Wardrobe
inspectors, `MaterialDispatch` and the AI edits do NOT.** Of the twelve dispatchers —
`registerTransformDragHandler.ts:291`; `transforms/elementMove.ts:113,242`; `elementYawRotate.ts:137,236`;
`AlignPlanToolHandler.ts:381`; `RotatePlanToolHandler.ts:273-274`; `KitchenRunInspector.ts:444`;
`KitchenUnitInspector.ts:556`; `MaterialDispatch.ts:132`; `PropertyInspectorApply.ts:241,416`;
`WardrobeRunInspector.ts:381`; `WardrobeSectionInspector.ts:406` — **the panel-side callers rely
entirely on the L2 command's own history entry.**

⚠ **NOT MEASURED: whether the L2 `UpdateFurnitureParametersCommand` entry is pushed on
`commandManager.history` for those callers, i.e. whether panel edits are undoable at all.** This is the
single highest-value open question for this family and is **owed before DELTA #4.**

**Refusal strings — both exemplary:**

`MoveFurniture.ts:73` — *"furniture.move writes the detached plugin furniture store that nothing
renders, exports or persists, and no production surface dispatches it. **Moving furniture commits
through `furniture.updateParameters`** (payload key: `id`, plus the changed parameters) →
`UpdateFurnitureParametersCommand` → the geometry `furnitureStore`, which is what `MOVE_COMMAND_BY_TYPE`
and the 3-D gizmo already dispatch."*

`SetFurnitureMaterial.ts:57` — *"It writes the plugin DTO store, which is a FRESH instance built by
PluginRegistry and is read by no renderer, no 2-D projector, no IFC exporter and no persistence path —
only `<family>.created` is ever mirrored to the geometry store, **never updates**
(§FIX-MATERIAL-DEAD-DISPATCH). Use `furniture.updateParameters` instead… (its colour field is `color`)."*

✅ Both name the mechanism **and** the live alternative **and** its exact payload key. This is the C16
CA-18 model, and it is also independent in-repo corroboration of §2 and §5.

---

## 7. Undo / redo

### 7.1 Coverage — ✅ clean on both tables

`buildUndoStoreMap` — `performUndoRedo.ts:322` `furniture: w.furnitureStore` (singular only; the bus
key is `'furniture'`, so it matches). **Furniture is not among EI-7c's seven stranded families.**
`createSnapshot` — `CommandManagerImpl.ts:614` `['furniture','furnitureStore',…]` in `optionalStores`
(`:609-625`); scoped restore `:686`. **Furniture is NOT among L-953's twelve unrecognised keys.**
✅ Both recorded per **EI-1b**.

### 7.2 EI-7a — the inequality, and why it is contained

All ten bus verbs write the DTO store; the inverse patch goes to the legacy store. Four refuse, three
are dormant, two create (re-done into legacy by the bridge), one is the L4/L2 hybrid. **The inequality
is real on every verb and currently unreachable through the UI except via create** — a containment, not
a fix.

### 7.3 Audit envelope across undo — **furniture IS affected (L-952)**

`UpdateElementParameterCommand.captureWallAudit` (`:405-427`) gates at `:410-414` on
`wall` / `door` / `window`; **furniture returns `null`.** Its own concession `:216` names
*"slab, stair, roof, furniture, …"* as **NOT covered and not claimed to be.** Furniture **is** routed for
the write — `ELEMENT_STORE_ROUTES:128-135` maps `furniture, bed, table, chair, sofa, wardrobe,
wardrobe_glass_door, corner_wardrobe` all to `FURNITURE_STORE` (`:105-108`), applied `:507`, event
`:699-700`.

**⇒ a furniture parameter undo ratchets `metadata.version` and does not restore `_renderVersion`.**
Governed by [ADR-0319 §2](../adrs/ADR-0319-audit-fields-are-derived-not-authored.md) DERIVED-BUT-CAUSAL
— *"a counter that ratchets through an undo/redo cycle means the model is not the same model … a real
defect, not a tolerance candidate."* **NOT C75.** Furniture is one of L-952's **eight**.

⚠ **Eight aliases route to one store (`:128-135`).** `bed`, `table`, `chair`, `sofa`, `wardrobe`,
`corner_wardrobe`, `wardrobe_glass_door` are `elementType` values that are **not** among §1.1's
seventeen tags — a **ninth** naming surface. Whether any producer stamps them is **NOT MEASURED**.

---

## 8. Cascades

| Cascade | Reversed? | Evidence |
|---|---|---|
| **parent → child furniture on DELETE** | ✅ **YES** | `DeleteElementCommand.ts:486-496` collects `properties.parentFurnitureId === id` (e.g. dining chairs, `:485`); restored `:901-910` |
| create | — **none** | `FurnishLayoutExecutor.ts:590` **suppresses** cascades: `{skipRedetectRooms:true, skipPbrUpgrade:true}`, rationale `:574-576` (*"furniture isn't a room-bounding element"*) — ✅ **correct and declared** |
| move / rotate | — none | `UpdateElementParameterCommand.ts:700` emits `bim-furniture-updated` only |
| **`CascadeRunner`** | n/a | **zero furniture rules**, and **not registered in production**. Disposition recorded at `MoveFurniture.ts:40-47`: *"PROMOTED as the cascade branch of the future ConsequencePlanner (BIM30-REASONING-LOOP-PLAN R2). It stays unregistered until R2 wires it."* — ✅ **EI-12 compliant: it declares itself dormant with the condition** |
| workflow chain `ceiling → furnish → lighting` | ⚠ trigger outside patch capture | `houseFanoutGuard.ts:6`; `furnishLayoutTrigger.ts:357`; `ResidentialBuildingExecutor.ts:3086` |

⭐ **The parent→child delete cascade is a genuine EI-5 pass and is recorded as such per EI-1b** — it is
one of the few cascades in the repo that is both captured and restored.

---

## 9. Vocabularies

### 9.1 Material — furniture speaks **THREE of C84's five, plus TWO more**

| Vocab | Spoken? | Evidence |
|---|---|---|
| **V1** `STANDARD_MATERIAL_LIBRARY` | ✅ **but only Kitchen / Wardrobe** | `KitchenCabinetEngine.ts:55,71`; `WardrobeCabinetEngine.ts:46,66`; fields `KitchenTypes.ts:80,136,140,144`, `WardrobeCabinetTypes.ts:68,107,111` |
| **V2** `RENDER_MATERIAL_LIBRARY` | ⛔ no | zero references in either package |
| **V3** per-plugin palette | ✅ **but DEAD** | `plugins/furniture/src/committer/material-bridge.ts:16-19` |
| **V4** `FINISHES` | ⛔ no | zero references |
| **V5** `materialName` | ⛔ no | handrail-only |
| **V6 (new)** `FurnitureMaterial` free-string union | ✅ **LIVE** | `packages/geometry-furniture/src/FurnitureTypes.ts:266-272` (`'wood'\|'metal'\|'fabric'\|'glass'\|…mirror…`), consumed `:314`, defaulted `'wood'` at `initTools.ts:2094` and `furnitureCreatePayload.ts:196` |
| **V7 (new)** raw hex `color` | ✅ **LIVE** | `initTools.ts:2099`; `MaterialDispatch.ts:132` `colorField:'color'`; resolved by `packages/geometry-furniture/src/MaterialService.ts:20` `getMaterial(color:number, type)` with three ad-hoc caches `:10-12` |

⛔ **C84 EI-8 counts five material vocabularies. Furniture alone reveals a SIXTH and a SEVENTH, and they
are the two the live path actually uses.** Reported to lane ZA (§11 item 12); C97 does **not** design the
unification.

**V3, the dead one, is the `hashMaterialId` case the brief names — and it is worse than "derived":**
`plugins/furniture/src/committer/material-bridge.ts` — `hashMaterialId` **defined `:21-28`** (djb2-xor:
`h = 5381; h = ((h<<5)+h) ^ charCodeAt(i)`), **called `:34`**, indexing a hard-coded 8-entry `PALETTE`
`:16-19` (`#a78b6e, #b9a48b, #7d8c8c, #a3bca3, #8fa6c4, #c69ea3, #caa56b, #9b8eb0`), fallback `:14`.
Header `:5-8` self-describes as *"a fallback colour from the materialId hash (good-enough placeholder
until the dynamic material editor in S58)."*

> **Colour is not a vocabulary here at all — it is a HASH BUCKET.** Two unrelated materials collide onto
> one colour with probability ~1/8, and one material's colour changes if its id is ever renamed.
> **It is dead today (the committer is never instantiated) and MUST NOT be revived as-is.**
> ⚠ *(The brief cites `:34` for `hashMaterialId`; measured, `:34` is the call site and `:21` the
> definition. Both recorded.)*

⛔ **The DTO-schema fields `materialId` / `materialSlots` (`Furniture.ts:115-117`) reach ONLY the dead
V3 hash.** No live path consumes them — consistent with §5: nobody dispatches them either.

### 9.2 EI-3 — enums the pipeline cannot carry

Not a member-level mismatch (as lighting has) but a **whole-field** one: `kitchenConfig`,
`wardrobeCabinetConfig`, `furnitureCategory` and `baseOffset` are offered by the tools, carried to the
legacy store, and **have no schema representation at all**. **TO-BE:** add them to the schema or declare
them legacy-only in the field map — never both offer and omit.

---

## 10. Geometry

| Axis | AS-IS |
|---|---|
| **Stack A (live)** | `FurnitureFragmentBuilder.ts:44`, `updateFurniture` `:74` — **fully procedural**: `FurnitureFactory` `:15`, `WardrobeEngine` `:16`, ~60 builders in `src/builders/`, engines `KitchenCabinetEngine`, `WardrobeCabinetEngine`, `ParametricTreeEngine`, `foliageCards`. Instancing bridge `:31-42`, injected `:71` |
| **⚠ NO GLB / catalogue LOADING** | `grep GLTFLoader\|loadAsync\|\.glb` over `packages/geometry-furniture/src` → **zero loader hits**. `FurnitureTypes.ts:226`'s *"GLB catalog imports"* names furniture **types**, not asset loading. **The `representations` / `activeLod` machinery has no runtime consumer** |
| **Stack B (dead)** | `producers/furniture.ts:186` `produceFurniture`; LOD ladder `:35` `['2','3','1','4','0']`; `selectActiveRepresentation` `:37-57`; key `:66-69`; transforms `:76-98`, `:105-120` |
| **Proven to agree?** | ⛔ **NO.** `packages/geometry-kernel/__tests__/produceFurniture.parity.test.ts:109` self-describes at `:1-5` as *"the producer's shape contract… derivable from the input DTO + chosen catalogue stub geometry"* — **analytic self-parity.** No test compares `FurnitureFragmentBuilder` to `produceFurniture`. **[C84 §8.e](C84-ELEMENT-INTEGRITY.md)** |
| **Why unprovable today** | Stack A is procedural from `furnitureType` + w/l/h; Stack B is representation-driven from `catalogId` + `representations`. **The `representations` map is `{}` for every item (§5), so Stack B has no geometry to produce.** The parity harness is blocked behind the §5 fix |
| **Datum** | ✅ **The one genuinely clean axis.** `packages/geometry-furniture/src/furnitureElevation.ts:4-6` — **`worldY = floorY + mountOffset`, applied EXACTLY ONCE**; helper `:33-35`; `floorY` `:8-11`; `mountOffset = baseOffset`, 0 = floor-standing `:12-15`; the historic double-apply bug documented `:17-23`. Enforced at `FurnitureFragmentBuilder.ts:83-89` (`?? 0`, was 0.2 — §FIX-FURNITURE-BASE-OFFSET / L-86) and `initTools.ts:2037-2078`, which resolves the **FINISHED floor level** via `resolveFloorSeatingDatumFrom` `:2073` (§FIX-SEATING-ONE-AUTHORITY `:2051-2060`), authority `packages/command-registry/src/seating/SeatingDatumResolver.ts:132` |

⛔ **Stack B does not share the datum contract**: `produceFurniture(furniture, joinData, worldY)` takes
`worldY` as a third argument (`:25-29`), computing `sy + origin.y + worldYOffset` at `:94` — **with no
`baseOffset` concept at all.** Declare under EI-10(c) or converge.

⭐ **`furnitureElevation.ts` is the model this repo should copy** — a named datum authority, the
contract in the header, the historic bug recorded, and one helper. **C84 §10's wall-Y problem is ten
sites; furniture's is one.** Recorded per EI-1b as an explicit clean result.

---

## 11. THE DELTA

| # | Fix | Invariant | Proof required |
|---|---|---|---|
| **1** | ⛔ **ORDERING IS NORMATIVE: reconcile the payload↔schema vocabulary BEFORE making the bridge faithful.** Reversing these ships a total regression (§0) | **EI-2**, C84 §8.h | the ordering is stated in the PR description and reviewed |
| **2** | **Reconcile the vocabulary.** Either the schema adopts `furnitureType`/`position`/`width`/`length`/`height`, or every dispatcher and `buildFurnitureCreatePayload` adopt `catalogId`/`origin`/`size` | **EI-2(a)**, **EI-8** | **watched-RED**: dispatch a real payload, `parse`, assert `catalogId !== ''` and `origin !== {0,0,0}`. **It must FAIL first** |
| **3** | **Delete the `[k: string]: unknown` index signature at `commands.ts:755`**, then the four casts. ⛔ Casts first achieves nothing (§5.2) | **EI-2(c)** | `tsc` fails on all six dispatch sites before they are fixed |
| **4** | **Measure whether panel-side `updateParameters` edits are undoable at all** (§6.1), then fix | **EI-7** | an executed read-back per [C16 CA-21](C16-COMMAND-AUTHORING-PROTOCOL.md) |
| **5** | **The three DEAD-AND-ACCEPTING verbs must REFUSE** — `setScale`, `setActiveLod`, `setRepresentation` | **C16 CA-18** | each `canExecute` returns `{valid:false, reason}` naming the mechanism, as their three siblings do |
| **6** | **`setRepresentation` has no caller and the schema depends on it** (`Furniture.ts:104`) — wire it or declare `representations` unpopulated | **EI-12 / EI-13** | either a production dispatcher, or the schema comment corrected |
| **7** | **Collapse the seventeen `elementType` spellings** to `'Furniture'` + declared sub-parts (`role` + `parentId`, C15 §12); add the missing plan-layer rows | **C84 §4E** | one tag per family; every sub-mesh resolves a plan layer |
| **8** | **IFC: carry rotation** (`FurnitureReader.ts:41` hard-zeroes it) | **EI-2(a)** | round-trip preserves yaw |
| **9** | **Route the two bypassing dispatchers through `buildFurnitureCreatePayload`** (`FurnitureDragDropHandler.ts:475`, `CopyPlanToolHandler.ts:477`); correct its header's 3-of-5 convergence claim | **EI-9**, C84 §8.d | one payload builder, asserted |
| **10** | **Audit-neutral undo for furniture parameters** | **ADR-0319 §2**, L-952 | watched-RED: `metadata.version` byte-equal across undo |
| **11** | **Declare the DTO store retired** (EI-5a) — ⛔ **never mirror it; its contents would corrupt the authority** | **EI-5a** | header on the `plugins/rooms/src/store.ts:1-29` model |
| **12** | **Report V6 and V7 to lane ZA.** C84 EI-8 counts five; furniture uses two more, and they are the live ones | **EI-8** | ZA's inventory carries seven |
| **13** | **Declare the duplicate `FurnitureStore`** (`core-app-model` vs `geometry-furniture`) and the duplicate persistence pair | **EI-9 / EI-10** | named reason + EI-8a equality test, or retirement |
| **14** | **A/B parity harness** — blocked behind #2 | **EI-11** | a real A-vs-B comparison; the analytic test does not count |
| **15** | **Remove the silent `0.6/0.6/0.9` bridge defaults** (`initTools.ts:2091-2093`) — refuse instead | **EI-2(a)** | a dispatcher omitting dimensions produces a named refusal |

---

## 12. REFUSALS

| # | Refusal | Named where | Verdict |
|---|---|---|---|
| **R1** | **`furniture.move` is unreachable; use `furniture.updateParameters`** | `MoveFurniture.ts:72-73` | ✅ **EXEMPLARY** — mechanism, live alternative, exact payload key |
| **R2** | **`furniture.rotate` is unreachable** | `RotateFurniture.ts:75` (`FURNITURE_ROTATE_UNREACHABLE`) | ✅ — ⚠ **the string body was NOT MEASURED** |
| **R3** | **`furniture.setMaterial` is unreachable; the colour field is `color`** | `SetFurnitureMaterial.ts:56-57` | ✅ **EXEMPLARY** |
| **R4** | **Furniture triggers no create cascade** — it is not room-bounding | `FurnishLayoutExecutor.ts:574-576,590` | ✅ **DECLARED and reasoned** |
| **R5** | **`CascadeRunner` holds no furniture rules and is unregistered until BIM30 R2** | `MoveFurniture.ts:40-47` | ✅ **EI-12 model** — declares dormancy *and* the condition that ends it |
| **R6** | **The ten `<kind>.delete` verbs are DORMANT** | [C84 §3.5.3](C84-ELEMENT-INTEGRITY.md) | ✅ ⛔ **not deletable** |
| **R7** | **Furniture is absent from the bake worker** | nowhere | ⛔ **NOT A REFUSAL — an undeclared absence.** Blocked behind ADR-0331 §D5 |
| **R8** | **No GLB / catalogue asset loading exists** despite `representations` / `activeLod` / `FurnitureLod` | nowhere | ⛔ **NOT A REFUSAL — an undeclared capability gap.** Declare the machinery aspirational or wire it |
| **R9** | **IFC drops furniture rotation** | nowhere | ⛔ **NOT A REFUSAL — a silent loss.** DELTA #8 |

---

## 13. NOT MEASURED

1. **Whether panel-side `furniture.updateParameters` edits are undoable at all** (§6.1) — the single
   highest-value open question; **blocks DELTA #4.**
2. **`'wardrobe_unit'` exact `file:line`** — present in the `geometry-furniture/src` value scan; the site
   was not isolated.
3. **`RotateFurniture.ts:75`'s `FURNITURE_ROTATE_UNREACHABLE` string body.**
4. **`CreateFurnitureBatch.ts`'s per-entry field map** — `affectedStores`, `produceCommand :132` and the
   refusals were measured; the `cmd.*` / `??` census per entry was not. **It is presumed to share
   `CreateFurniture`'s defect and MUST be measured before DELTA #2 is called done.**
5. **Whether `apps/bake-worker` is reachable in production at all** — only its zero furniture references
   were measured.
6. **`packages/snapping/src/providers/FurnitureSnapProvider.ts:31,47,51`** — exists; registration and
   liveness unmeasured.
7. **Whether any interactive surface still calls the L2 `CreateFurnitureCommand`** (`:191,262`) — it is
   used by `ProjectLoader.ts:1154` on load.
8. **`ChangeFurnitureTypeCommand.ts:19`** and **`UpdateAIElementParametersCommand.ts:4`** — lineage and
   liveness.
9. **The `AIElementConfig` slug registry** (`:116-117`, e.g. `"ai_floor_lamp"`; validator
   `AIElementValidator.ts:44-45`) — a **fourth identity namespace**, referenced by
   `ProjectLoader.ts:106-108`; wiring unmeasured.
10. **Whether any producer stamps the eight `ELEMENT_STORE_ROUTES` aliases** (`bed`, `table`, `chair`,
    `sofa`, `wardrobe`, `corner_wardrobe`, `wardrobe_glass_door`) as `elementType` — a **ninth** naming
    surface (§7.3).
11. **Whether `runtime.stores.furniture` is read by any dev/debug surface** — the ~20 `window.furnitureStore`
    reads all carry `// TODO(E.furniture.S): replace with runtime.stores.furniture`, confirming the
    migration has not happened but not proving the negative for non-`window` access paths.
12. **`plugins/furniture/src/committer/geometry-bridge.ts`** and **`intent.ts`** — contents.
13. **`furniture` level-change** — whether `element.changeLevel` has a branch.
