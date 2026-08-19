# C98 — ELEMENT: STAIR

> **Stamp**: 2026-08-18 · **Status**: CANONICAL — binding on every PR touching the stair family
> **Parent**: [C84 §6](C84-ELEMENT-INTEGRITY.md). C84 owns `EI-1…EI-13`; C98 owns their application to
> stair. **Structure**: C84 §6's twelve mandatory sections, **AS-IS** (measured, `file:line`, HEAD
> `3384f076`) beside **TO-BE** (normative).
> **Cites, does not restate**: [C03 §4.6 U-2/U-2b](C03-SCHEMAS-COMMANDS-AND-STATE.md) owns
> `affectedStores` · [ADR-0319 §2](../adrs/ADR-0319-audit-fields-are-derived-not-authored.md) owns audit
> fields across undo (**NOT C75**) · [C16 CA-17…CA-21](C16-COMMAND-AUTHORING-PROTOCOL.md) owns authoring
> and refusal · [C73 §3.1](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) owns predicate canonicity.
> **Headline**: stair is [C84 §4B](C84-ELEMENT-INTEGRITY.md)'s named `.created`-bridge absence and
> **EI-7a's starkest instance** — `stair.batch.create` writes the plugin DTO store while undo routes the
> inverse to the geometry store, **with nothing in between and no refusal.**
> **And one large piece of good news: [L-951 IS FIXED](#8--slab-opening-reconciliation--l-951-is-fixed).**

---

## 0. TWO CORRECTIONS

### 0.1 ⭐ L-951 IS CLOSED — and it was filed twice under two numbers

[ISSUE-LOG L-951](../../04-reference/ISSUE-LOG.md) describes the stair void being carved into the wrong
slab by **nearest centroid**, citing `StairSlabOpeningReconciler.ts:124`, `:148`, `:78-88`.
**Measured at HEAD: the point-in-polygon containment fix HAS LANDED**, in commit
**`a6e4d513` — `fix(L-949): the stair void was cut into the WRONG slab — determine the host by
CONTAINMENT`.** The cited line numbers are pre-fix and no longer resolve; the file grew from ~200 to 700
lines.

> ⛔ **L-949 and L-951 are the same defect, reported twice, under two numbers.** A search keyed on L-951
> finds nothing and concludes the fix is outstanding. **Recorded so the next lane does not re-fix it.**
> The issue log should cross-reference them; C98 does not edit the issue log.

### 0.2 ⛔ "Stair delete does not clean hosted railings" — HALF FALSE, and the true half is sharper

`DeleteStairCommand` **does** clean `stair-railing` and `stair-landing` — snapshot `:174-186`, removal
`:212-213`, restore `:304-308`. What it does **not** clean is the **`handrail` family**:
`grep -n "handrail\|Handrail" packages/command-registry/src/stair/DeleteStairCommand.ts` → **0 hits.**

⭐ **The defect is invisible precisely because a near-identically-named sibling IS handled.** A reviewer
sees railing cleanup and stops. **Two families whose names differ by a prefix, one handled and one not,
is [C84 §8.a](C84-ELEMENT-INTEGRITY.md) (*counting files whose names are similar*) inverted** — the name
similarity hid an absence rather than manufacturing a duplicate. See [C95 §8.2](C95-ELEMENT-HANDRAIL.md).

---

## 1. Identity

| Axis | AS-IS | TO-BE |
|---|---|---|
| 3D mesh tag | **`'Stair'`** — `packages/geometry-stair/src/StairMeshBuilder.ts:155` (with `type:'stair'` at `:156`) | **`'Stair'` frozen**; consumers normalise per [C15 §12](C15-HOSTED-ELEMENT-CONTRACT.md) |
| **Other spellings** | ⛔ **EIGHT, across four sub-families** — §1.1 | ⛔ **VIOLATION** |
| L0 Zod schema | `packages/schemas/src/elements/Stair.ts:12`; `StairShape = z.enum(['straight','l-shape','u-shape','spiral'])` `:7`; refine `:62-65` (`numRisers ≥ 2`) | see §1.2 |
| Bus verb namespace | `stair.*` — **6 typed** in `commands.ts` (`:859,861,867-883,884,885,891`), **12 registered** in `plugins/stair/src/handlers/index.ts:17-53` | all typed; all in [C69](C69-API-VERB-REGISTER.md) |

⛔ **`stair.delete`, `stair.rotate`, `stair.setType/setShape/setTreadCount/setRiserHeight/setWidth/setMaterial`
have NO typed payload row.** And `commands.ts:861` types the live create as
**`'stair.create': { [k: string]: unknown }`** — a fully open bag. **A verb with no declared payload
cannot be gated by C84 §7's field-coverage check.**

### 1.1 ⛔ Eight `elementType` spellings

`'Stair'` (`StairMeshBuilder.ts:155`) · `'stair'` (`StairStore.ts:185`) · `'stairs'`
(`initBusHandlers.ts:1826`, `PropertyPanelTypeSelector.ts:359`) · `'stair-landing'`
(`StairLandingBuilder.ts:65`) · `'stairLanding'` (`StairLandingStore.ts:42,66,90`) · **`'stair-railing'`**
(`StairRailingBuilder.ts` — **17 mesh stamps**) · `'stairRailing'` (`StairRailingStore.ts:34,61,79,90`) ·
`'stair-type'` (`StairTypeStore.ts:68`).

**The mesh says `Stair`, its store says `stair`, the railing mesh says `stair-railing`, the railing store
says `stairRailing`.** `apps/editor/src/engine/__tests__/elementChangeTypeCoverage.spec.ts:240,246,277`
exercises `'stair-railing'`, `'stairRailing'` and `'stairs'` as **three separate strings** — the test
encodes the sprawl rather than catching it. **`.toLowerCase()` collapses `Stair`/`stair` and
`stairRailing`/`stair-railing`... no: `'stairrailing' ≠ 'stair-railing'`.** **TO-BE:** one tag per
family; sub-parts via `role` + `parentId` (C15 §12).

### 1.2 ⛔ The L0 schema and the legacy record are structurally different elements

| Concept | L0 (`Stair.ts`) | Legacy (`StairTypes.ts:142-171`) |
|---|---|---|
| level | `levelId:45` + `topLevelId:47` | **`baseLevelId:149`** + `topLevelId:150` |
| position | `origin:50` (Vec3) | `startPosition:156` |
| steps | `numRisers:60` | `flights:163` + `landings:164` |
| shape | 4 members `:7` | `shape:155` — **includes `'I'`**, plus `turnDirection:167`, `secondRunSide:169`, `stepsBeforeLanding:171` |

`plugins/stair/src/handlers/index.ts:26` records the measured consequence: the plugin arm *"refused the
live `StairPlanToolHandler` payload (shape `'I'` is not in the plugin Zod enum)"*.
`StairMeshBuilder.ts:160` papers over the level fork: `levelId: stair.levelId || stair.baseLevelId`.

> ⛔ **The L0 schema cannot express a real stair from this product.** A multi-flight L-stair with a
> landing has no representation in `Stair.ts`. **This is not a field-mapping bug (as furniture's is) — it
> is a modelling gap**, and it is why §5's field map is short and §10's parity is impossible.

---

## 2. Stores

| # | Representation | Path | Status |
|---|---|---|---|
| 1 | L0 Zod schema | `packages/schemas/src/elements/Stair.ts:12` | parsed **only** by `CreateStairBatch.ts:119` |
| 2 | **Plugin DTO store** | `plugins/stair/src/store.ts:22-45`; built at `PluginRegistry.ts:312` | **detached — nothing renders/exports/persists it** |
| 3 | **Legacy geometry store** | `packages/geometry-stair/src/StairStore.ts:22`, built `initBuilders.ts:910`, `window.stairStore` (`initTools.ts:995`) | 🟢 **THE AUTHORITY** |
| 3′ | duplicate class | `packages/core-app-model/src/stores/StairStore.ts:24` — **byte-identical body**, same `§STAIR-AUDIT-2026` header; emits at `:90,110` vs #3's `:89,109` | ⛔ **EI-9.** Not instantiated in production, not exported from `core-app-model/src/index.ts`; referenced only by `StorePrevStateSeam.test.ts:225,242` |
| 4 | Scene `userData` | `StairMeshBuilder.ts:152-166` | derived |
| 5 | Kernel producer | `packages/geometry-kernel/src/producers/stair.ts:118` | ⛔ **DEAD** — every non-test caller is the committer |
| 5′ | `StairCommitter` | `plugins/stair/src/committer/stair-committer.ts:52` | ⛔ **`grep "new StairCommitter"` → 0 hits** |
| 6 | Side stores | `StairTypeStore`, `StairLandingStore`, `StairRailingStore`, `StairToolConfigStore` — `initTools.ts:216-219` | live |

> ### EI-1 — THE AUTHORITY IS `packages/geometry-stair/src/StairStore.ts` (`window.stairStore`)
> ⭐ **Declared in-code THREE times**, which is why this family's authority question is settled:
> `MoveStair.ts:17-20` (*"the plugin's DETACHED Immer DTO store, which nothing writes in production"*),
> `MoveStair.ts:80-88` (*"the store `StairMeshBuilder` / `StairRailingBuilder` / persistence actually
> read"*), and `plugins/stair/src/handlers/index.ts:18-31` (§FIX-STAIR-CREATE-SHADOW: *"Authority
> declared: the bridge"*). **This is what EI-1 asks every family to do, done voluntarily.**

**Bake worker: MEASURED ABSENT.** The only workers are `apps/editor/src/workers/{compress,geometry,solar}.worker.ts`;
`grep -rln "stair" --include=*worker*.ts` → **0**. There is no stair bake path.

---

## 3. Consumers

| Consumer | Reads | Evidence | Verdict |
|---|---|---|---|
| Renderer (3D) | legacy | `StairMeshBuilder.ts:27,43-53`; **event-driven only** — `:91` `window.addEventListener('bim-stair-updated')`, `:92` runtime twin. **There is no `StairFragmentBuilder`** | ✅ |
| Plan view | legacy | `StairPlanRepresentation.ts:4`, built at `StairMeshBuilder.ts:53`; symbols registered `:201,208,215`, unregistered `:269`; registry `packages/scene-committer/src/StairPlanSymbolRegistry.ts`. ⚠ `plugins/plan-view/src` has **zero** stair hits | ✅ |
| **Persistence — SAVE** | legacy | **LIVE pair** `apps/editor/src/engine/persistence/ProjectSerializer.ts:39,777,1017,1104`; `serializeStair` `:619` | ⚠ **§3.1** |
| **Persistence — LOAD** | legacy | **LIVE pair** `ProjectLoader.ts:1070-1098` — reconstructs the LEGACY shape (`baseLevelId:1081`, `startPosition:1087`, `flights:1088`, `landings:1089`, `turnDirection:1094`, `secondRunSide:1095`, `stepsBeforeLanding:1096`) | ✅ |
| IFC export | legacy | `packages/file-format/src/export/ifc/readers/StairReader.ts:6,7,11`; wired `ExportIFC.ts:47`; `'IfcStair'` `:36`; pset `:31` | ⚠ **§3.2** |
| GLB export | scene meshes | `GLBExporter.ts:436` is a **comment** about a below-grade landing — **no stair-specific path** | ⚠ generic |
| Bake worker | — | none exists | ⛔ **ABSENT** |

**EI-1 verdict: ✅ CLEAN — every consumer reads the legacy store.** Recorded per **EI-1b**.
⚠ **The DEAD pair carries a STRICTLY SMALLER copy**: `packages/persistence-client/src/loader/ProjectLoader.ts:636-656`
lacks `turnDirection` / `secondRunSide` / `stepsBeforeLanding`. **A divergent duplicate, not a verbatim
one** — so the two paths would produce *different stairs* from one file. EI-9; **not deletable** (used by
`apps/cli`, `apps/bench`). **TO-BE:** declare which pair serves which host and pin with an EI-8a test.

### 3.1 ⛔ Custom stair types are silently lost on save

`ProjectSerializer.ts:1211` records it in its own words: custom stair types in `stairTypeStore` are
*"silently lost on"* save. **EI-6.** The stair persists; **its type definition does not.** **TO-BE:**
serialise `stairTypeStore` or refuse to create a custom type.

### 3.2 ⛔ A stair with no built mesh vanishes from IFC

`StairReader.ts:17` — `if (!mesh) continue;`. **Silent.** A stair that failed to build, or one on a
hidden level, is dropped from the export with no diagnostic. **EI-2 / EI-6.** **TO-BE:** count and
report the skips.

---

## 4. NO `.created` BRIDGE — the deliberate absence, and what replaced it

### 4.1 The removal is recorded (EI-13 done right)

`packages/runtime-composer/src/CommandEventBridge.ts:626-631`, verbatim:

```
// TASK-13 (…RISK-3): door/window/stair CEB cases removed — no initTools.ts subscribers exist for
// 'door.created', 'window.created', or 'stair.created' (confirmed grep returned 0 hits).
//  • door / window: use the Committer architecture (Path A) — no CEB bridge needed.
//  • stair: uses Path C (legacy commandManager bridge) — no CEB bridge needed.
// Pre-removal grep: … → 0 matches outside CEB.
```

⭐ **This is the model [C94 §5](C94-ELEMENT-ROOM-SPACE.md) and C84 EI-13 point at**: an unconsumed emitter
was **deleted**, the census that justified it was **recorded**, and the replacement path was **named**.
Confirmed independently: `initTools.ts` carries twelve `.created` subscribers (`:1059, 1260, 1408, 1511,
1591, 1636, 1708, 1773, 1824, 1919, 1967, 2031`) and **none is stair**.

### 4.2 What replaced it — `initBusHandlers.ts:2259-2264`, verbatim

```ts
{
    type: 'stair.create',
    stores: [] as const,
    validate: (cmd) => (!cmd.baseLevelId ? 'baseLevelId is required' : null),
    fn: (cmd) => { _cmExec(new CreateStairCommand(cmd)); },
},
```

**Lineage L3.** `affectedStores` is `[] as const`, so the ring buffer records nothing and undo falls
through to `commandManager` — **correct by C16 CA-19 exit (b)**. `BridgeSpec` at `:541-547` types
`fn: (cmd: any) => void`. Bus payload is `{ [k: string]: unknown }` (`commands.ts:861`); `baseLevelId` is
validated at runtime only.

⭐ **A deleted `stair.move` bridge is documented at `:2265-2278`** (§FIX-STAIR-MOVE-SHADOW, MT-03) — it
was dead on every boot and was merged into the plugin handler. **A second recorded deletion.**

---

## 5. THE BRIDGE FIELD MAP

⚠ **There is no `.created` bridge, so there is no named-subset re-emit to audit** — the create payload
travels as an opaque bag straight into `CreateStairCommand`. **Recorded per EI-1b as a clean negative:
stair cannot lose a field the way furniture does, because nothing re-emits a subset.**

**The field-loss risk moved elsewhere, and it is worse:**

| Hop | Field disposition | Verdict |
|---|---|---|
| UI → `stair.create` (L3) | `{ [k: string]: unknown }` — **every field carried, none typed** | ⚠ **no loss, no checking.** A typo'd field is silently ignored by `CreateStairCommand` |
| UI → `stair.batch.create` (L1) | `Stair.parse` at `CreateStairBatch.ts:119` — **the L0 schema cannot express flights, landings, `turnDirection` or shape `'I'`** (§1.2) | ⛔ **TOTAL for the batch path** — Zod `strip` deletes what it cannot express |
| legacy record → persistence | full, both directions (`ProjectLoader.ts:1070-1098`) | ✅ |
| legacy record → **the DEAD loader** | **3 fields short** (§3) | ⛔ |
| legacy record → IFC | pset `Pset_StairCommon` `:31`; **mesh-gated `:17`** | ⚠ §3.2 |
| `stairTypeStore` → persistence | ⛔ **not serialised** | ⛔ §3.1 |

⛔ **TO-BE:** `stair.create`'s payload MUST be typed. An index-signature payload is the same
gate-invisibility furniture achieves with `as any` ([C97 §5.2](C97-ELEMENT-FURNITURE.md)) — reached by a
different route.

---

## 6. EI-7a — the starkest instance in the repo

### 6.1 `stair.batch.create` — disjoint write and restore sets, and it does NOT refuse

**WRITE — `plugins/stair/src/handlers/CreateStairBatch.ts:125-132`:**
`produceCommand<StairsState>(ctx.stores.stair, draft => { …[stair.id] = stair; })`, returned `:133` with
`nextStates: { stair: next }`. **The PLUGIN DTO store only.** `affectedStores = ['stair']` at `:62`.
No `window.commandManager`, no `window.stairStore` anywhere in the file.

**RESTORE — `apps/editor/src/engine/undo/performUndoRedo.ts:325`:**
`stair: w.stairStore, stairs: w.stairStore` — the **GEOMETRY** store.

> ⛔ **The bus pushes `'stair'` onto the ring buffer; `buildUndoStoreMap()` resolves `'stair'` to
> `window.stairStore`; the forward patch was computed against `ctx.stores.stair`. Undo therefore applies
> an inverse patch to a store that never received the forward.**
> [C03 §4.6 U-2b](C03-SCHEMAS-COMMANDS-AND-STATE.md) names exactly this: *"not a failed undo; it is a
> mutation of authoritative state derived from a different store's history."*

⭐ **The repo already knows.** `RotateStair.ts:47-52` spells out the identical hazard for its own verb —
*"a ring-first Ctrl+Z handed the geometry store an INVERSE carrying the plugin store's stale prior value,
for a forward write geometry never saw"* — and **`stair.rotate` REFUSES in `canExecute` because of it.**
**`stair.batch.create` does not.** *One family, one hazard, two responses.*

**TO-BE, and only two exits ([C16 CA-17/CA-19](C16-COMMAND-AUTHORING-PROTOCOL.md)):** (a) route the write
to the authority, or (b) declare `affectedStores: [] as const` as the L3 create bridge already does.
⛔ **Do not "fix" it by removing the `buildUndoStoreMap` entry** — that strands the family (EI-7c).

### 6.2 ⛔ `stair.batch.create` is declared in THREE places

`CreateStairBatch.ts:61` (the real handler) · `initBusHandlers.ts:445` (`{ type:'stair.batch.create',
stores:['stair'] }, // DEFERRED: stairs migration pending` — registered `:447-464` as a **no-op stub with
the same `affectedStores`**) · `plugins/stair/src/handlers/index.ts:32`.

The plugin wins — `:450` `if (runtime.bus.registry?.has?.(type as any)) continue;` and `PluginRegistry`
contributes before `initBusHandlers`. **So the stub is dead.**

⚠ **[C84 §5](C84-ELEMENT-INTEGRITY.md) predicted this**: `check-verb-register.ts`'s `TYPE_DECL_RE`
(`:135-139`) anchors on `type\s*` and misses `{ type: '…'`, so **`SHADOWED` reads 0 and should read 1**.
**Confirmed for this verb, with three declaration sites rather than the two C84 names.**
⚠ **The gate's actual output was NOT MEASURED** — the shadow is proven structurally.

⛔ **A no-op stub that declares `affectedStores: ['stair']` is a loaded gun**: if registration order ever
changes, the family gains a verb that returns `{patches:[], affectedStores:['stair']}` — success over
nothing, with an undo scope. **TO-BE: delete the stub.**

---

## 7. Verbs

| Verb | Lineage | Handler | `affectedStores` | WRITTEN | RESTORED | Equal? |
|---|---|---|---|---|---|---|
| `stair.create` | **L3** | `initBusHandlers.ts:2260` | `:2261` `[]` | legacy via `_cmExec` | L2's stack | ✅ |
| `stair.batch.create` | **L1** | `CreateStairBatch.ts:61` (+2 shadows) | `:62` `['stair']` | **plugin DTO** | **geometry** | ⛔ **§6.1** |
| `stair.delete` | **L1** | `DeleteStair.ts:19` | `:20` | plugin DTO | geometry | ⛔ **DORMANT** |
| **DELETE (live)** | **L2** | `DeleteElementCommand.ts:642-646` → `DeleteStairCommand` | `:34` `["stair","opening","slab"]` | legacy + openings + railings + landings + graph | ✅ `:1024-1030`, `:304-327` | ✅ **§9** |
| `stair.move` | **L2 + L1 hybrid** | `MoveStair.ts:121` | `:122` `['stair']` | **BOTH** (`:112` legacy, `:149` draft) | both stacks | ⚠ **§8** |
| `stair.rotate` | **L1, DTO only** | `RotateStair.ts:72` | `:73` | **nothing — refuses `:99`** | n/a | ✅ **CA-18** |
| `stair.setMaterial` | **L1** | `SetStairMaterial.ts:62` | `:63` | **nothing — refuses `:83`** | n/a | ✅ **CA-18** |
| `stair.setType` | **L1** | `SetStairType.ts:22` | `:23` | plugin DTO | geometry | ⛔ **DEAD AND ACCEPTS** |
| `stair.setShape` | **L1** | `SetStairShape.ts:21` | `:22` | plugin DTO | geometry | ⛔ **DEAD AND ACCEPTS** |
| `stair.setTreadCount` | **L1** | `SetTreadCount.ts:19` | `:20` | plugin DTO | geometry | ⛔ **DEAD AND ACCEPTS** |
| `stair.setRiserHeight` | **L1** | `SetRiserHeight.ts:19` | `:20` | plugin DTO | geometry | ⛔ **DEAD AND ACCEPTS** |
| `stair.setWidth` | **L1** | `SetWidth.ts:19` | `:20` | plugin DTO | geometry | ⛔ **DEAD AND ACCEPTS** |
| `stair.updateParameters` | **L3** | `UpdateStairParameters.ts:20` | `:21` `[]` | legacy `:39` | L2's stack | ✅ |
| `stair.createRailing` | **L3** | `CreateStairRailing.ts:28` | `:29` `[]` | legacy `:86` | L2's stack | ✅ — ⭐ **§7.1** |
| `stair.executeApprovedPlan` | — | **NO HANDLER FOUND** | — | — | — | **NOT MEASURED** |

⛔ **FIVE verbs are DEAD AND ACCEPT** — `setType`, `setShape`, `setTreadCount`, `setRiserHeight`,
`setWidth` write the detached store and report `success: true` over nothing. **Their two refusing
siblings, in the same directory, show the compliant shape.** [C16 CA-18](C16-COMMAND-AUTHORING-PROTOCOL.md)
`CA-DOCTRINE-A`: *"both are better than a `success: true` over nothing."* **TO-BE: refuse.**

### 7.1 ⭐ `CreateStairRailing` validates against the AUTHORITY

`CreateStairRailing.ts:60` —
`` `Stair ID '…' does not exist in stairStore — railing cannot be built` `` — **the only plugin handler in
this family whose `canExecute` checks the authoritative store rather than `ctx.stores`.** Every other
handler validates against the detached DTO store, so they pass on ghosts and fail on real stairs.
**Recorded per EI-1b: this is the shape the other eleven need.**

**Refusal strings — both name the mechanism and the exit:**

`RotateStair.ts:69` — *"`stair.rotate` writes the detached plugin stair store that nothing renders,
exports or persists… **stair TRANSLATION is live (`stair.move`), but stair ROTATION has NO live route on
any surface**… tracked under Gate G7."* Rationale `:18-67`; measured absence from `MOVE_COMMAND_BY_TYPE`
and all 13 `dragDispatch` sites at `:29-35`. ⚠ **`:83-93` records that method ORDER is load-bearing for
`tools/ga-gate/check-verb-register.ts`** — a gate that reads source position, which is fragile and worth
knowing.

`SetStairMaterial.ts:57` — *"`StairData` has no `materialId`/`materialColor`. Its only material field is
`properties.material`, a fixed ENUM (`concrete|steel|timber|marble|glass|composite`)… so a catalogue
material cannot be expressed on a stair."*

---

## 8. Move — the dual-write, and why it is CONDITIONAL

`plugins/stair/src/handlers/MoveStair.ts` does **both**:

- **L2** — `:112` `cm.execute(new MoveStairCommand({ stairId, delta }))`, via `bridgeLegacyMove` (`:103-118`),
  called from `execute()` at `:138`.
- **L1** — `:149-160` `produceCommand<StairsState>(ctx.stores.stair, …)`, returned `:161`.

> ⚠ **CORRECTION TO THE PREMISE — it is not double-recorded TODAY.** `:140-146` is an escape valve: when
> the DTO store lacks the stair — **the actual production state** — the handler returns
> `{ forward: [], inverse: [] }` and only the legacy entry exists. Its own comment `:141-143` says so:
> *"undo is owned by the commandManager entry `MoveStairCommand` pushed."*
>
> ⛔ **So the double-record fires exactly when the migration completes.** It is a defect **armed to
> trigger on the fix**, not one firing now. **That is more dangerous than a live one**: it will appear
> during the migration PR, be attributed to that PR, and look like a regression the migration caused.
> **TO-BE: resolve the dual-write BEFORE the DTO store is populated**, not after.

### 8.1 The railing re-sample cascade — event-driven, outside patch capture, NEVER REVERSED

`MoveStair.ts:96-102` states the design: the legacy command fires `bim-stair-updated`
*"(→ `StairMeshBuilder` rebuild → every `StairRailingBuilder` railing of this stair re-sampled at the new
anchor)"*.

**Emitter:** `packages/geometry-stair/src/StairStore.ts:89` (`_mutate`) and **`:109` (`restoreSnapshot`)** —
a `DOMEventBus` (`:8-9`), **not a patch**. Catalogued `packages/event-bus/src/catalog.ts:120`.

**Subscribers:** `StairRailingBuilder.ts:117` (runtime bus, re-samples `:122-124`) **and `:125`**
(`window.addEventListener`, same body `:130-132`) — ⚠ **registered twice on two buses**;
`StairMeshBuilder.ts:91,92`; `initScene.ts:2250,2551,3557`; `SchedulePanel.ts:41`;
`SelectionManager.ts:912`.

> ⭐ **"NEVER REVERSED" is true, and the reason is subtler than C84 §4C states.**
> `MoveStairCommand.undo():139` calls `restoreSnapshot`, which **re-emits `bim-stair-updated` at
> `StairStore.ts:109`** — so the railing IS rebuilt on undo. But it is rebuilt as a **fresh forward
> re-derivation from the restored host**, not as an inverse. There is no patch, no snapshot, no undo
> entry. **Correctness rests entirely on the rebuild being a pure function of the host** — i.e. on
> [C73 §1.1](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md)'s determinism, which is **not asserted anywhere
> for this path.**
>
> ⭐ **This is a DEFENSIBLE design and `MoveStair.ts:49-53` argues for it explicitly**: *"no 'if stair,
> also move the railings' branch … hard-coding co-movement would introduce a SECOND representation."*
> **C98 endorses it and adds the missing obligation: the purity it depends on must be ASSERTED, not
> assumed.** **TO-BE:** a determinism test — move a stair, undo, assert railing geometry is byte-equal to
> the pre-move geometry.

### 8.2 ⛔ Stair create produces railings on a SEPARATE undo stack

`CreateStairCommand.ts:502` emits `bim-stair-railing-proposal` → listener `initTools.ts:2270-2283` →
`runtime.bus.executeCommand('stair.createRailing', …)` (`:2274`) → **L3** `CreateStairRailingCommand`
(`CreateStairRailing.ts:86`, `affectedStores: []` at `:29`). **Two railings are proposed per stair**
(`initTools.ts:2264-2265`), each becoming its **own** `commandManager` entry.

> ⛔ **Ctrl+Z after drawing a stair pops ONE RAILING, not the stair.** Then again. Then the stair.
> **Three presses to undo one gesture.** This is [C84 §4B](C84-ELEMENT-INTEGRITY.md)'s *"one gesture
> produces two undo entries on two different stacks"*, measured here as **three entries.**
> **TO-BE:** the proposal must execute inside the create's batch, per the
> [batch-creation pattern](C17-BATCH-CREATION-CATALOGUE-AND-PANEL-BINDING.md) — one gesture, one undo.

---

## 9. Cascades

| # | Cascade | Mechanism | Reversed? |
|---|---|---|---|
| 1 | stair → slab opening (**create**) | `CreateStairCommand.ts:482` `carveStairOpening`, inside scope `["stair","opening","slab"]` | ✅ `undo()` + `removeStairOpenings` (`Reconciler:678-699`) |
| 2 | stair → slab opening (**move/param**) | `MoveStairCommand.ts:121` `reconcileStairOpening`, scope `:51` | ✅ `:141` `undoStairOpeningReconcile` → `Reconciler:621-671` (Immer inverse patches, G-NEW-05); pinned `stairOpeningReconcileUndoRoundtrip.test.ts` |
| 3 | slab → stair openings (slab authored second) | `Reconciler:396`, from `CreateSlabCommand` | ✅ via the owning command |
| 4 | stair → slab opening (**delete**) | `DeleteStairCommand.ts:250` `_healHostSlab` → `:283` | ✅ `:317-327` |
| 5 | **stair → stair-railing re-sample** | **L5 CustomEvent**, outside patch capture | ⚠ **§8.1 — re-derived, not reversed** |
| 6 | **stair → railing proposal (create)** | CustomEvent → separate bus command | ⛔ **SEPARATE UNDO UNITS — §8.2** |
| 7 | stair → railings/landings (**delete**) | `DeleteStairCommand.ts:212-213` | ✅ `:304-308` |
| 8 | stair → semantic graph (`sitsOn`, `connectedByStair` ×2) | `CreateStairCommand.ts:396,411,420` | ✅ `:534`; delete side `_captureRelationships:88-97` called **`:195-199`**, restore `:104-124`; authored level edges `:144-155` |
| 9 | **stair → hosted HANDRAILS** | — | ⛔ **NO CASCADE — ORPHANED (§0.2)** |
| 10 | stair fragmenting a floor plate | `packages/ai-host/src/workflows/houseLayout/stairCore.ts` — a **generative-time keep-out**, ADR-0072 | **N/A** — never enters the undo stack |
| 11 | `element.changeType` on a stair | **L4** hand-built whole-element `replace` PatchPair (`initBusHandlers.ts:1826-1845`, `_swapWithRingParity`) | ✅ — ⭐ its comment `:1836-1841` records the bug it closed: because `stair.updateParameters` has `affectedStores: []` while `stair` IS in `buildUndoStoreMap`, Ctrl+Z after a type swap **popped the stair's CREATE** |

⭐ **Cascades 1-4 and 7-8 are a genuinely strong result** — captured, scoped and restored, with a
dedicated round-trip test. **Stair's opening cascade is the best-reversed cascade measured in this lane.**
Recorded per EI-1b.

⚠ **A known graph limitation is declared at `DeleteStairCommand.ts:133-142`**: `addRelationship()` is
idempotent on `(source,target,type)` and ignores metadata, so **two stairs joining the same level pair
collapse onto ONE `connectedByStair` edge, and deleting either unlinks the survivor.** ✅ **Declared, not
hidden** — but open.

---

## 10. Undo / redo

### 10.1 Coverage — ✅ both tables

`buildUndoStoreMap` — `performUndoRedo.ts:325` (`stair` **and** `stairs`), plus `stairRailing:326`,
`stairLanding:327`. `createSnapshot` — `CommandManagerImpl.ts:616` `['stair','stairStore',…]`.
**Stair is NOT among L-953's twelve.** ✅ Recorded per **EI-1b**.
`ELEMENT_STORE_ROUTES` — `UpdateElementParameterCommand.ts:121-122` (`stair` and `stairs`); the nested
`GenerateStairGeometryCommand` rebuild is covered by the same scope (`:118-120`).

⚠ **But `stairRailing` is absent from `createSnapshot`'s `optionalStores`** — see
[C95 §7.1](C95-ELEMENT-HANDRAIL.md). A stair-railing edit is not snapshot-scoped.

### 10.2 Audit envelope — **stair IS one of L-952's eight**

`UpdateElementParameterCommand.undo()` is a **forward replay, not a restore**: `:379-383` constructs a
fresh command from `previousValues` and `:385` executes it. Audit-neutrality is delivered **solely** by
`:390` `restoreWallAudit`, whose capture gate `:410-414` is:

```ts
const t = elementType.toLowerCase().trim();
if (t === 'wall') wallId = element?.id;
else if (t === 'door' || t === 'window') wallId = element?.wallId;
if (!wallId) return null;
```

**Stair returns `null`.** The concession `:213-218` names it: *"Element types whose stores stamp their
own audit fields (slab, **stair**, roof, furniture, …) are NOT covered here and are not claimed to be."*

**⇒ a stair parameter undo ratchets `metadata.version`.** Governed by
[ADR-0319 §2](../adrs/ADR-0319-audit-fields-are-derived-not-authored.md) DERIVED-BUT-CAUSAL —
*"a real defect, not a tolerance candidate."* **NOT C75.**

---

## 11. Vocabularies

### 11.1 Material — stair speaks **V3 (dead)** and a **sixth vocabulary (live)**

**V3 — `plugins/stair/src/committer/material-bridge.ts`** (32 lines): key `stair|<materialId>|<slot>`
(`:3-4`); `TREAD_FALLBACK = '#b58a5e'` `:7`, `RISER_FALLBACK = '#9a7a52'` `:8`; `slotOfStairMaterialKey`
`:13-16`; `colorOfStairMaterialKey` `:18-20`; factory `:22-32` (`roughness` 0.85 riser / 0.7 tread).

⛔ **`colorOfStairMaterialKey` reads `parts[2]` — the SLOT — and DISCARDS `parts[1]`, the `materialId`.**
The key encodes *which material*, and the bridge answers *which slot*. **This is one of
[C84 EI-8](C84-ELEMENT-INTEGRITY.md)'s "three of which take `_key` and discard it, so they cannot express
a material at all"** — measured here precisely: the materialId is parsed into `parts` and never read.
Two hexes, in neither V1 nor V2. **Dead — the committer is never instantiated.**

**V8 (new) — the LIVE enum**: `packages/geometry-stair/src/StairMaterialResolver.ts:14-22` —
`concrete 0xaaaaaa · timber 0x8B5E3C · steel 0x888899 · marble 0xf0ece0 · glass 0xbfd8e0 (transparent,
opacity .35) · composite 0x5a5f66 · default 0x888888`. Field `StairTypes.ts:95` `material?: StairMaterial`.
⭐ Its header `:5-10` records that three of the six (`timber`, `glass`, `composite`) **previously had no
preset and silently resolved to default** — a fixed EI-2 defect, recorded.

⛔ **The two do not intersect** — V3's tread `#b58a5e` is not a member of the resolver enum.
`stair.setMaterial` refuses precisely because no catalogue id can be expressed on either.
**Reported to lane ZA: C84 EI-8 counts five; C97 found V6 and V7, and stair adds V8.** C98 does not
design the unification.

### 11.2 EI-3 — shape enums that disagree

L0 `StairShape` has 4 members (`Stair.ts:7`); the legacy `StairShape` **includes `'I'`**
(`StairTypes.ts:155`). `plugins/stair/src/handlers/index.ts:26` records that the plugin arm **refused the
live plan-tool payload** for exactly this reason. ✅ **It refused rather than substituted** — EI-3, not
EI-2. **TO-BE:** one shape vocabulary.

---

## 12. Geometry

| Axis | AS-IS |
|---|---|
| **Stack A (live)** | `packages/geometry-stair/src/StairMeshBuilder.ts:27` — builds `THREE.Group` roots (`:29`), **not a `*FragmentBuilder`**. Sub-builders: `StairStringerBuilder` `:52`, `StairPlanRepresentation` `:53`, `StairMaterialResolver` `:51`. Interface `StairMeshData` `:20-25`. Consumes the LEGACY shape |
| **Stack B (dead)** | `packages/geometry-kernel/src/producers/stair.ts:118` `produceStair` — consumes the **L0** DTO; guard `:119-124` throws `DescriptorInvariantError` on `numRisers < 2`; `planSteps` `~:75-117` |
| **Proven to agree?** | ⛔ **NO.** `tests/parity/stair/cw-snapshot.test.ts:1-8` self-describes as *"Stair self-snapshot (S14-T3)… the 'kernel-side' parity gate. **Cross-engine PRYZM 1 capture script lands alongside the façade harness in S15**"* — it imports only `produceStair` `:15`. **Stack B against itself. [C84 §8.e](C84-ELEMENT-INTEGRITY.md)** |
| **Why unprovable** | §1.2 — the L0 schema cannot express flights, landings or shape `'I'`. **The two stacks do not model the same object**, so parity is not merely missing, it is undefined |
| **Datum** | ⛔ **The two stacks differ.** **Stack B** (`producers/stair.ts:139-141,158-161`): `wy = worldY + origin.y + step.topY − TREAD_THICKNESS/2`, i.e. `topY` is the **tread TOP** and geometry is offset DOWN by half-thickness; landing top `:96`; rotation about `origin` in XZ `:135-137,144-147`. **Stack A**: a two-level span (`baseLevelId` + `topLevelId`), position from `startPosition` + per-flight `startOverride` + per-landing `center`; resolver `StairVerticalSpanResolver.ts`. **`baseLevelId` vs `levelId` is a naming fork papered over at `StairMeshBuilder.ts:160`** |

⚠ **`ADR-0098` and `ADR-0127` share a title** (*stair authored by height, implied level above*) — a
**duplicate ADR number pair**, reported here, not fixed.

**C84 §3.5.3's CO-LIVING ruling — VERIFIED, with a one-line drift:** `StairPreviewRenderer.ts` `getContext('2d')`
is at **`:76`** (C84 says `:77`); `CurvedStairRenderer.ts` at **`:48`** (C84 says `:49`). **Both are `'2d'`
overlay renderers, so the verdict HOLDS**; only the pointers drifted.

---

## 13. THE DELTA

| # | Fix | Invariant | Proof required |
|---|---|---|---|
| **1** | **Record that L-951 = L-949 and is CLOSED** (§0.1) | governance | the issue log cross-references; no lane re-fixes it |
| **2** | **Resolve `stair.batch.create`'s disjoint sets — BEFORE the DTO migration**, not after (§6.1, §8) | **EI-7a**, C03 U-2b, C16 CA-17/CA-19 | **watched-RED**: dispatch the batch, `performUndo()`, assert the geometry store is unchanged by the inverse |
| **3** | **Delete the no-op `stair.batch.create` stub** at `initBusHandlers.ts:445` — it declares an undo scope over nothing (§6.2) | **EI-9** | one declaration site |
| **4** | **The five DEAD-AND-ACCEPTING verbs must REFUSE** — `setType`, `setShape`, `setTreadCount`, `setRiserHeight`, `setWidth` | **C16 CA-18** | each names its mechanism, as `rotate`/`setMaterial` do |
| **5** | **Stair delete must clean hosted HANDRAILS** (§0.2) | **EI-5** | a stair delete leaves no orphaned handrail |
| **6** | **One gesture, one undo** — fold the railing proposal into the create batch (§8.2) | **C84 §4B**, [C17](C17-BATCH-CREATION-CATALOGUE-AND-PANEL-BINDING.md) | one Ctrl+Z removes stair **and** both railings |
| **7** | **Assert the railing re-derivation is deterministic** (§8.1) — the design depends on a purity nothing tests | **C73 §1.1** | move → undo → railing geometry byte-equal |
| **8** | **Type `stair.create`'s payload** — `{ [k: string]: unknown }` is gate-invisible (§5) | **EI-2** | `check-bridge-field-coverage` can see the family |
| **9** | **Serialise `stairTypeStore`** — custom stair types are silently lost on save (§3.1) | **EI-6** | round-trip preserves a custom type |
| **10** | **IFC: report mesh-gated skips** instead of `continue` (§3.2) | **EI-2 / EI-6** | a skipped stair produces a named diagnostic |
| **11** | **Reconcile the L0 schema with the legacy record** — flights, landings, `turnDirection`, shape `'I'` (§1.2) | **EI-8**, **EI-3** | one shape vocabulary; the batch path can express a real stair |
| **12** | **Collapse the eight `elementType` spellings**; declare sub-parts via `role`+`parentId` | **C84 §4E**, C15 §12 | one tag per family |
| **13** | **Audit-neutral undo for stair parameters** | **ADR-0319 §2**, L-952 | watched-RED: `metadata.version` byte-equal across undo |
| **14** | **Declare or retire the duplicate `StairStore`** and the **divergent** dead persistence copy (§3) | **EI-9 / EI-10** | named reason + EI-8a test, or retirement |
| **15** | **Fix `check-verb-register.ts`'s `TYPE_DECL_RE`** — it reports SHADOWED 0 where stair reads ≥1 (§6.2) | instrument correctness | the gate reports the shadow |
| **16** | **Report V8 to lane ZA** (§11.1) | **EI-8** | ZA's inventory carries it |
| **17** | **Resolve the duplicate ADR pair `ADR-0098` / `ADR-0127`** | governance | one ADR per decision |

---

## 14. REFUSALS

| # | Refusal | Named where | Verdict |
|---|---|---|---|
| **R1** | **A stair cannot be ROTATED** — translation is live, rotation has no route on any surface | `RotateStair.ts:69`, rationale `:18-67`, absence measured `:29-35` | ✅ **EXEMPLARY** — names the live sibling, the measured absence, and Gate G7 |
| **R2** | **A stair has no `materialId`** — its only material field is a fixed 6-member enum | `SetStairMaterial.ts:57` | ✅ **EXEMPLARY** — a representational truth, refused not faked |
| **R3** | **The stair void refuses when no slab CONTAINS the footprint** | `StairSlabOpeningReconciler.ts:261` `basis:'none-contains'` → `warnNoContainingSlab:265-279`: *"Carving the NEAREST slab instead would cut a void through a slab the stair does not pass through — that is the L-949 defect."* | ⭐ **THE BEST REFUSAL MEASURED IN THIS LANE** — names the alternative it rejects and why |
| **R4** | **On a failed measure, an existing void is LEFT UNTOUCHED, never deleted** | `Reconciler:554-562` (L-581) | ✅ **the correct asymmetry** |
| **R5** | **The reconciler does not do true polygon-clip, and does not subtract slab `holes`** | `Reconciler:122-128` — *"a stair standing over an existing hole is a void inside a void and needs its own decision"* | ✅ **DECLARED with its reason** |
| **R6** | **Stair railings are NOT co-moved by a branch** — they re-derive from the host | `MoveStair.ts:49-53` | ✅ **ARCHITECTURALLY CORRECT** — ⛔ its purity must be asserted (DELTA #7) |
| **R7** | **`stair.delete` is DORMANT** | [C84 §3.5.3](C84-ELEMENT-INTEGRITY.md); `syncDisposition.ts:891` | ✅ ⛔ **not deletable** |
| **R8** | **Two stairs joining one level pair collapse onto one graph edge** | `DeleteStairCommand.ts:133-142` | ✅ **DECLARED**, open |
| **R9** | **Stair is absent from any bake path** | nowhere | ⛔ **NOT A REFUSAL — an undeclared absence.** Blocked behind ADR-0331 §D5 |
| **R10** | **Custom stair types do not persist** | `ProjectSerializer.ts:1211` says *"silently lost"* | ⛔ **NOT A REFUSAL — a named silent loss.** DELTA #9 |

---

## 15. NOT MEASURED

1. **`stair.executeApprovedPlan`** (`commands.ts:859`) — declared payload, **no handler located**.
   Candidates not opened: `packages/command-registry/src/plans/StairCommandPlan.ts`, `StairShapeAdvisor.ts`.
2. **Whether `CommandBus` actually APPLIES a stair PatchPair to the geometry store on ring-first undo** —
   §6.1's routing is proven **statically**; the runtime consequence is asserted by `RotateStair.ts:47-52`
   citing `deadMoveVerbAuthoritativeState.test.ts`, which was not run. **Per
   [C16 CA-21](C16-COMMAND-AUTHORING-PROTOCOL.md) this needs an executed read-back. Blocks DELTA #2's proof.**
3. **`ChangeStairShapeCommand`, `UpdateStairFlightsCommand`, `ValidateStairCommand`, `GenerateStairGeometryCommand`** —
   `affectedStores`, dispatchers, undo (except `GenerateStairGeometryCommand`, covered by the `['stair']` scope).
4. **`StairDataSchema.ts`** — may be a **FOURTH** schema representation alongside `Stair.ts`,
   `StairTypes.ts` and `plugins/stair/src/store.ts`. Unverified. Also unopened: `StairSnapshotSerializer.ts`,
   `StairParameterReconciler.ts`, `StairValidationAuthority.ts`, `StairScheduleExtractor.ts`,
   `StairIfcExporter.ts`, `LevelTraversalPolicy.ts`, `StairCreationController.ts`.
5. **`packages/types-builtin/src/stair/index.ts`** — a possible fifth type surface.
6. **`packages/constraint-solver/src/stair-constraint-engine.ts`** — a further consumer.
7. **`check-verb-register.ts`'s actual output for `stair.batch.create`** — the shadow is proven
   structurally (three declaration sites); the gate was not run.
8. **Exhaustive proof that nothing constructs `packages/core-app-model/src/stores/StairStore.ts`** —
   `initBuilders.ts:910` imports from `@pryzm/geometry-stair` and `core-app-model/src/index.ts` does not
   export it, but no repo-wide constructor sweep was completed.
9. **L-951's pre-fix line citations** — unverifiable at HEAD; `a6e4d513` rewrote the file and the parent
   commit was not checked out.
10. **Stair `element.changeLevel`** — whether a branch exists.


---

## §L-1032 — THE STOREY AXIS: change level, and duplicate to level

> **Added 2026-08-19 by lane EL1**, from the founder's request logged as
> [L-1032](../../04-reference/ISSUE-LOG.md): *"Every element needs to be possible to be changed the
> level via properties panel … and via chat."* The honest end state that request asks for is **not**
> *"every family has a dropdown"* — it is **every family either offers the control or declares, in
> its contract, why it must not**. This section is that declaration for this family.
>
> **THE REGISTER IS THE AUTHORITY, NOT THIS SECTION.**
> `packages/command-bus/src/levelChangeVerbs.ts` holds `LEVEL_CHANGE_VERBS` and
> `LEVEL_CHANGE_REFUSALS`, and the L3 event bridge, the L7 property panel and the chat registration
> all read those rows. Re-deriving the answer here would be the fourth copy and the thing C84 EI-9
> forbids. If this section and the register disagree, **the register wins and this section is
> stale** — which is a defect, not a discrepancy to live with.

### THE VERB — ⛔ **DECLARED REFUSAL. THIS FAMILY MUST NOT GET A LEVEL DROPDOWN.**

| | |
|---|---|
| **Declared at** | `packages/command-bus/src/levelChangeVerbs.ts` — `LEVEL_CHANGE_REFUSALS.stair` |
| **Disposition** | `deferred` |
| **Deciding clause** | [C16 CA-18](C16-COMMAND-AUTHORING-PROTOCOL.md) — a verb that cannot commit must REFUSE and name the mechanism |
| **Evidence** | `packages/geometry-stair/src/StairTypes.ts:148-150` — `levelId` **and** `baseLevelId` **and** `topLevelId` |
| **Shown to the user** | *"A stair spans two storeys. Which end a "change level" should move is not decided yet, so the control is withheld rather than guessing."* |

**A stair is the only family in this suite — with lift — whose storey membership is not one
value.** It carries three: `levelId`, `baseLevelId` and `topLevelId` (`StairTypes.ts:148-150`). A
single-target `changeLevel(id, newLevelId)` is therefore **ambiguous by construction**, and the
ambiguity is not a naming problem:

- move `baseLevelId` alone → the stair stretches, and its rise/going no longer match its tread count;
- move both ends together → a translation, which is a different verb (`stair.move`);
- move `levelId` alone → the record's three storey fields now disagree with each other.

**The last option is what a copied-from-slab implementation would have done**, and it would have
type-checked, dispatched, reported success and left the stair claiming three storeys at once. This
is exactly the case the founder's *"absolutely architecturally sound … no shortcuts"* rules out.

**WHAT WOULD SETTLE IT** — a founder or design decision on the SEMANTICS, not more code: does
*"move this stair to Level 2"* mean *re-seat its base on Level 2 and keep its rise* (so `topLevelId`
follows), or *keep its base and re-target its top*? Once that sentence exists, the verb is one row
in `LEVEL_CHANGE_VERBS` and one `StairStore.changeLevel`. **Until it exists, the refusal is the
correct answer** and is recorded here so the blank is not read as an oversight (C84 EI-1b).

### THIS IS A FEATURE OF THE DESIGN, NOT A GAP IN IT

The property panel renders **three** distinct outcomes and never collapses them into two: a
dropdown, the declared refusal sentence, or nothing at all when no one has decided. Rendering
nothing for a family that MUST NOT move would be indistinguishable from a family nobody looked at —
the blank-reads-as-fine failure [C84 EI-1b](C84-ELEMENT-INTEGRITY.md) names, and the same shape as
§context-data-honesty, where failure and emptiness are the same value. **The user is owed the
sentence.**

`apps/editor/__tests__/SlabLevelChangeReachesLegacyStore.test.ts` ARM 5 enforces this: every panel
family must resolve to a verb **XOR** a declared refusal — never to neither, never to both.

### DUPLICATE-TO-LEVEL

⚠ **Also deferred, and for the same undecided reason** — a duplicate must be given a base and a
top, and nothing yet says which storeys those are. Note the two questions are **separable**:
duplicate-to-level could be settled first by requiring the caller to supply BOTH ends explicitly,
since a duplicate has no prior position to preserve. That is a smaller decision than the move, and
it is the one to take first.
