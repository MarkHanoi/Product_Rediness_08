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

---

## RAC — the chat surface for this family (added 2026-08-19, lane RAC1)

> **Mandated by C84 §6**, measured against the **C67 §1.0 seven-verdict vector** (V1 RESOLVE ·
> V2 DISPATCH · V3 STATE · V4 PERSIST · V5 UNDO · V6 SYNC · V7 REPORT). Cross-family summary:
> **C84 §4F**. Capability surface: **C67 §1.8**. Decisions: **ADR-0334**. Rows: **L-1140 … L-1147**.
> ⛔ **No cell is left blank — a blank reads as "fine" (EI-1b). Unknown reads `NOT MEASURED`.**

### Status — ~~**⛔ DARK for type — blocked by ONE METHOD**~~ ⭐ **SUPERSEDED 2026-08-20 — SEE [§L-1441](#l-1441--the-chat-surface-for-stairs-is-lit-added-2026-08-20-lane-rac2)**

> ⚠ **The table below is the 2026-08-19 measurement and its Status row is NO LONGER TRUE.** Stair
> type, stair-railing type and stair width are all published; the retiring condition
> (`StairTypeStore.getById`) was met by L-1435, **and the chat shipped without waiting for it**
> because the blocker was correctly diagnosed and wrongly scoped — see §L-1441.2. The **Findings**
> and **NOT MEASURED** rows below still stand. ⛔ Do not quote the Status row.


| | Measured 2026-08-19 |
|---|---|
| **`element.changeType` tag(s)** | `stair` · `stairs` |
| **Branch** | `apps/editor/src/engine/initBusHandlers.ts`:1850 |
| **Type catalogue** | ⚠ **EXISTS BUT DOES NOT SATISFY `CatalogueReader`.** `StairTypeDefinitions.ts` ships **5** `{id, name}` types — but `StairTypeStore.ts:24` exposes **`get()`** where `resolveCatalogueRef.ts:39-42` requires **`getById()`**. |
| **Type field on the record** | ✅ a real `typeId: string` on the record (`StairTypes.ts:109`) |
| **Executor the chat must use** | ✅ `element.changeType` `:1850` → `UpdateStairParametersCommand`, ring-parity |
| **Chat capabilities published TODAY** | ~~`set-riser-height` · `set-tread-depth` · `set-width`~~ — **as of 2026-08-20 also `set-stair-type` · `set-stair-dimensions` (width), and `set-stair-railing-type` for the railings. §L-1441.1** |
| **Retiring condition** | ~~**`StairTypeStore` gains `getById()`** (or a two-line adapter). Then inject. — **L-1147**~~ ✅ **MET 2026-08-20** (`getById` alias, L-1435). ⚠ The *injection* half is still open — `buildCatalogueChannel` carries `slab` + `ceiling` only, so a PROJECT-AUTHORED stair type is still unreachable from chat and the refusal says so. **§L-1441.2.a · §13 DELTA #26** |

### Scoping — what a published capability for this family MUST accept

The founder's ask is *"BY LEVEL, BY ROOM, ETC"*. The shared grammar
(`makeHostedTypeParser`, `ZeroTokenResolver.ts:3340`) **already** captures `on level N` and
`in the <room>`, and `FilterScope.ts` lifts property/type predicates out before it runs — so
`all` · `selection` · `level` · `room` (· `orientation` where the family has a façade) are the
target, and **the work is the DECLARATION, not the reach** (L-1142).

| Scope | Target | AS-IS for this family |
|---|---|---|
| `all` | ✅ required | ~~⛔ no capability~~ ✅ **LIVE 2026-08-20** (§L-1441.1) |
| `selection` | ✅ required | ~~⛔ no capability~~ ✅ **LIVE 2026-08-20** |
| `level` | ✅ required | ~~⛔ no capability~~ ✅ **declared + reached** (the shared spatial tail; `scopeModes` on both stair capabilities) |
| `room` | ✅ required | ~~⛔ no capability~~ ✅ **declared + reached** |
| **selection as a GEOMETRY SOURCE** | family-dependent | see C84 §4F.5 — selection **is** available to the RAC (`ResolverContext.selection`, non-optional, id **and** kind, rebuilt every message); `create-wall` is the one capability that declares no subject axis |

### Findings

- ⭐⭐ **L-1147 — RESOLVED 2026-08-20, AND THE RESOLUTION SHARPENS THE LESSON.** This finding said
  *"the smallest blocker in the whole audit … measured, it is a method name"*, and that was right.
  ⚠ **But it was still scoped one layer too wide:** the missing `getById` blocks
  `resolveCatalogueRef`, which blocks the EDITOR BRIDGE's catalogue channel — **it never blocked the
  family**, because `BUILT_IN_STAIR_TYPES` is the same array the store is built from and reading it
  needs no adapter. ⭐ *"Measure reachability, not existence"* applies to the BLOCKER too: a
  correctly measured blocker can still be on the wrong path. §L-1441.2.
- ⭐ **L-1147 is the smallest blocker in the whole audit and it reads like an architectural one.** *"The stair catalogue does not satisfy the resolver contract"* sounds like a redesign; measured, it is a method name. **This is why the audit brief said measure reachability, not existence** — the shape of a blocker is not visible from its description.
- ⚠ **Carried from C84 §4B:** `stair.rotate` (L1) writes the DTO view only, and `UpdateElementParameterCommand`'s audit-neutral restore covers `wall`/`door`/`window` **only** — stair **stamps a fresh `metadata.version` on undo** (`:213-218`). A published stair type-change inherits that non-neutrality unless it goes through `element.changeType`'s ring-parity path, **which it must**.
- ⭐ **`stair-railing` is a SEPARATE branch (`:1901`) and it is the reference implementation for ADR-0334 D2** — it already resolves its fields **from `newTypeId` alone** via `resolveStairRailingTypeFields`, reusing `handrailTypeStore`. **Handrail is being changed to match it, not the other way round.**
- **NOT MEASURED**: V3/V4/V5 under a chat driver.

### NOT MEASURED for this family (explicit — EI-1b)

- **No utterance was typed into a live editor.** Every verdict above is source-measured.
- **V6 SYNC** — inherited FAIL from C67 §1.0 (the CRDT read-back leg does not exist; the transport
  defaults OFF). **Not re-derived here**, and not a defect of this family.
- **V3 / V4 / V5 under a CHAT driver** — where this family is dark, they cannot be measured through
  chat at all; where it is published, they are measured only as C67 §1.0 records. ⛔ **The panel's
  passing is NOT transferable evidence** (ADR-0334): publication requires an **executed read-back**
  of this family's geometry store (C16 CA-21), never a `success: true`.

---

## §16 — CREATION AXES: **SHAPE and MODE are two different axes** (added 2026-08-20, lane STAIRUX1)

> **Founder, verbatim (2026-08-19):** *"I want the stairs to have the possibility to decide if the
> creation is **orthogonal** or **line**, or **select 2 walls** [and] create the stair in **L shape
> against the walls** etc. This needs to be possible — **use the UI/UX as the walls: MODE + STAIR
> TYPE.**"*

### §16.1 — NORMATIVE. The two axes, and the prohibition on merging them

| Axis | Values | Question it answers | Authority |
|---|---|---|---|
| **SHAPE** | `I` · `L` · `U` · `C` | *What geometry RESULTS?* | `StairShapeChoice` / `STAIR_SHAPES` (`stairPath/StairShapeRegistry.ts`) |
| **MODE** | `linear` · `ortho` | *HOW is it SKETCHED?* | `StairDrawMode` (`StairToolConfigStore.ts`) |

> **§16.1.a — MUST.** These are **orthogonal**. An **L-shaped** stair drawn in **Orthogonal** mode is
> still an L-shaped stair, exactly as a wall drawn in Orthogonal mode is still one wall. **Neither
> axis may be expressed in the other's control**, and the two must not be concatenated onto one
> strip. The UI presents **MODE as the top-centre strip** (the shared `DrawingModeBar`) and **SHAPE
> + STAIR TYPE in the card beside it** (`StairPathParamPanel`) — the wall tool's idiom, which is
> what the founder pointed at.

> **§16.1.b — MUST NOT.** No `curved` MODE. `C` is a **SHAPE**, authored by the stair-path arc
> gesture. A `curved` mode alongside a `C` shape puts one letter on one bar meaning two different
> things. **See §16.4 — this is recorded as an OPEN QUESTION, not as a settled absence.**

> **§16.1.c — MUST.** `apps/editor/src/engine/views/plantools/elementCreationMatrix.ts` declares the
> two axes in **separate fields** — `modes` and `shapes` — and `creationShapes()` /
> `twoAxisCapabilities()` are their readers. ⛔ **Never concatenate `creationModes(tool)` with
> `creationShapes(tool)`.** Stair and stair-path are the only two-axis rows in the matrix; a spec
> asserts that, so a third cannot appear unnoticed.

### §16.2 — ⭐ AS-WAS: this was a **REACHABILITY** defect, not a missing feature

**The most important fact in this section, because it inverts the obvious reading of the founder's
report.** Both modes were **already built, on both surfaces**, before any of this work:

| Fact | Measured at |
|---|---|
| 3-D snapped to 90° **BY DEFAULT** | `StairCreationController.ts` — `_drawingMode: 'linear' \| 'ortho' = 'ortho'`, comment *"matches WallTool ortho"* |
| Plan ran the **identical** snap, gated on **SHIFT HELD** | `stairPath/StairPathToolController.ts` — `_snapTo90`, called only when `_shiftDown` |
| The config field already existed | `StairToolConfigStore.ts` — `mode?: 'linear' \| 'ortho'`, *"Drawing mode hint carried by the 3D setup panel"* |
| It was already read in 3-D | `StairTool.ts` — `controller.setDrawingMode(config.mode)` |
| Its **only** writer was a 3-D confirm dialog | `BimService.ts` — `StairSetupPanel.onConfirm` → `setStairToolConfig({ …, mode })` |
| ⛔ **No plan handler read `.mode` at all** | `StairPathPlanToolHandler` / `StairPlanToolHandler` pulled `shape`, `width` and `typeId` off the very same object |
| ⛔ **No picker existed on either surface** | `ToolsAreaLayout.ts` mounted a `DrawingModeBar` for wall, floor, ceiling, slab and railing — and **no stair branch** |
| ⛔ The matrix rows **claimed `modeSource: 'shared'`** | …while declaring the four SHAPES in the MODE slot |

**This is `§FIX-FINISH-MODE-PLAN-UNREACHABLE` reproduced verbatim in a second family** — and the
`elementCreationMatrix` header documents that exact defect, twelve lines above the stair rows that
were carrying it. *Committed, shipped, reachable by nobody.*

### §16.3 — ⚠ THE TWO SURFACES HAD **OPPOSITE DEFAULTS**, and the unification is a real behaviour change

3-D defaulted to **ortho**; plan defaulted to **free-hand**, with ortho available only while a key
was held. **One element, two surfaces, opposite defaults, and no control on either** — so "what mode
is this stair being drawn in?" had two answers and no way to ask.

`DEFAULT_STAIR_DRAW_MODE = 'ortho'` is now the single answer. **Taking the 3-D default changes no
shipped 3-D behaviour**, and it converts the plan surface's hold-a-key transient into a visible mode
one click from Linear. **SHIFT still forces ortho inside Linear mode**, unchanged — so Linear keeps
its escape hatch and making ortho the default takes nothing away. There is deliberately **no
inverse** (SHIFT does not *un*-snap in ortho mode): a modifier meaning "constrain" in one mode and
"release" in the other is a control whose meaning depends on invisible state.

⚠ **Stated plainly rather than buried: the PLAN surface now snaps by default where it previously did
not.**

### §16.4 — OPEN QUESTION (not a settled absence): should CURVED also be a MODE?

`C` is a shape today. Whether a stair should *also* be sketchable by an **arc-constrained mode** —
the way a wall's `curved` mode constrains a segment without changing what a wall is — is
**undecided**. It is recorded here as open because the alternative was to guess, and a bar where one
letter means two things is worse than a bar with two honest modes and a written NOT-YET.

### §16.5 — Gate

`apps/editor/src/engine/views/plantools/__tests__/stairCreationModes.spec.ts` — **11 tests**. It
drives the real `DrawingModeBar` pill → the production `onSelect` → `StairToolConfigStore` → the real
`StairPathToolController` → the real `CreateStairCommand`, and asserts **the dispatched stair's
flight directions**. ⛔ It never asserts that a picker rendered. It also pins the other five
families' mode sets as **unchanged** by the axis split, because the matrix is a shared enumerated
authority and that is precisely where one refactor becomes five regressions.

---

## §L-1431 — THE VOID SET IS **DERIVED**, NOT ENUMERATED (added 2026-08-20, lane STAIR1)

**Founder, production:** *"STAIR CREATION — FIRST THE STAIR CREATES AN OPENING ON THE SLAB — BUT NOT
ON THE FLOOR FINISH — THIS NEEDS TO BE AUTOMATIC."*

### The measurement that came first

The create's declared scope `[stair, opening, slab]` **was honest.** The floor-finish void was not
mutated-outside-scope; it was **never created**. Three horizontal families each carry their own void
mechanism, and until L-1431 the stair reached exactly one of them:

| Family | Contract | Void mechanism | Authority | Stair reached it? |
|---|---|---|---|---|
| slab | [C92](C92-ELEMENT-SLAB.md) | first-class `opening` ELEMENT in `openingStore` (`hostId`) | `SlabStore` (`geometry-slab`) | ✅ `StairSlabOpeningReconciler` |
| **floor finish** | [C89](C89-ELEMENT-FLOOR.md) | `FloorData.serviceHoles[]` (embedded) | `FloorStore` (`core-app-model`) | ⛔ **NO** — `addServiceHole` had **ZERO callers repo-wide** |
| **ceiling** | [C88](C88-ELEMENT-CEILING.md) | `CeilingData.holeElements[]` (embedded) | `CeilingStore` | ⛔ **NO** — `addHoleElement` unreached from any stair |

⚠ **The floor finish is NOT a layer of the slab.** `FloorData.hostSlabId` is an *optional* binding
between two independent records; C89 §2 names `FloorStore` the single authority for the finish. Any
fix premised on "cut the slab harder" is aimed at the wrong family.

### The second axis, on the same defect

`carveStairOpening` filtered `s.levelId === stair.topLevelId`, while
`LevelTraversalPolicy.canTraverse` returns **`ok: true` with a warning** for a level-skipping stair.
⭐ **A Ground→L5 stair is therefore ACCEPTED and its ~15 m run passes through four INTACT decks.**
Reachable by hand — the user need only pick a Top level more than one storey up.

### NORMATIVE

> **N1 — The set of hosts a stair pierces is DERIVED, never enumerated.**
> ```
> hosts = { h : h.family ∈ HORIZONTAL_HOST_PIERCERS
>             ∧ h.levelId ∈ levelsTheStairRisesThrough(base, top)
>             ∧ h.outline CONTAINS the stair footprint }
> ```
> Owner: `packages/command-registry/src/stair/StairHorizontalHostPiercing.ts`.
> ⛔ **No stair command may name a host family or a level id.** A fourth horizontal family joins by
> appending ONE registry entry. This is [C04 §3.1.2a](C04-RENDERING-AND-SCHEDULING.md) applied to a
> generic verb: *an enumeration cannot cover it.*

> **N2 — The level set is `baseElevation < elevation ≤ topElevation`.** The base level's own deck is
> **excluded** — the stair stands on it, and piercing it cuts the floor from under the bottom riser.
> When the level table cannot be read the resolver returns `[topLevelId]` **and reports
> `basis: 'fallback-top-only'`** — the pre-L-1431 behaviour, labelled as a fallback rather than
> presented as a derived span ([C74](C74-CONSTRAINT-HONESTY.md)).

> **N3 — Containment is ONE rule across every family.** The centre probe outranks any number of
> corner probes; a host whose outline cannot be resolved is **UNKNOWN, never "outside"**. Identical
> to §14 R3's slab rule, deliberately, so two families can never disagree about what *contains*
> means. **One difference is normative:** the piercer returns **every** containing host, not a
> winner — a level legitimately carries one finish per room, and a landing straddling two must
> pierce both. Picking a winner there leaves a real void half-cut.

> **N4 — Create and delete are symmetric ([C84](C84-ELEMENT-INTEGRITY.md) EI-5).** The delete finds
> the voids **by the id convention** (`stairHostPierceId`), never by re-deriving containment, so a
> stair moved after creation has the void it ACTUALLY cut healed rather than the one it would cut
> now. Undo **re-runs the piercer on the restored stair** instead of replaying a snapshot: these
> voids are DERIVED, and snapshotting a derived value is how a stale copy gets restored over a live
> host. A count shortfall is **reported**, never swallowed.

> **N5 — `autoCreateOpening: false` suppresses EVERY family.** A user who declines the automatic
> opening declines it in every host, not only in the slab.

**Proof:** `packages/command-registry/__tests__/stairPiercesEveryHorizontalHost.test.ts` — 9 cases
against the **production** `FloorStore` / `CeilingStore`, reading
`floorStore.getById(id).serviceHoles`, the exact array `FloorPanelBuilder` feeds to
`THREE.Shape.holes`. ⛔ Never a spy on a call.

### ⛔ STILL OPEN, named here so a blank is not read as "fine"

| # | Gap | L-row | Severity |
|---|---|---|---|
| 1 | ✅ **CLOSED 2026-08-20 — see [§L-1433](#l-1433--the-slabs-level-axis-is-closed-and-the-id-is-the-half-that-could-destroy-data-added-2026-08-20-lane-stair1).** ~~The SLAB's own level axis is still top-level-only.~~ A Ground→L5 stair still passes through four structurally intact slabs. Folding slab into the registry would mean a **second implementation** of the opening-element lifecycle (id convention, Immer undo patches, slab-side symmetry, delete heal) — the drift `StairSlabOpeningReconciler`'s header exists to forbid. The correct fix is to generalise `carveStairOpening`/`reconcileStairOpening` over `stairPiercedLevelIds()`, with the top level keeping today's exact id string. | **L-1433** | **P1** |
| 2 | ⚠ **NARROWED 2026-08-20 — the SLAB voids now follow a move on every deck (§L-1433); the FLOOR-FINISH and CEILING voids still do not.** **Move / parameter change does not follow the new voids** — `MoveStairCommand` and `UpdateStairParametersCommand` call the SLAB reconciler only, so a moved stair strands its floor and ceiling voids at the old footprint (the `§FIX-STAIR-MOVE-STRANDS-VOID` shape, one family over). | **L-1432** | P2 |
| 3 | **Persistence NOT MEASURED.** Whether `ProjectSerializer` round-trips `serviceHoles` / `holeElements` was not verified in this pass. If it does not, a saved project reopens with the finish solid. | — | ⚠ |

---

## §L-1430 — STAIR GEOMETRY LIMITS HAVE **ONE** AUTHORITY, AND **NO** SOURCE OF LAW (added 2026-08-20, lane STAIR1)

**Founder-reported by log:** the sketch tool refused at *"tread 218 mm (min 220 mm)"* and the command
refused the same drawing at *"Tread depth 222mm is below minimum 250mm"*.

### Two thresholds — [C84](C84-ELEMENT-INTEGRITY.md) EI-3 breached at four sites (AS-WAS)

| Layer | Site | riser min/max | tread min/max |
|---|---|---|---|
| sketch solver | `StairSolver2D.ts:103-106` | 100 / 220 | 220 / 360 |
| curved solver | `CurvedStairSolver.ts:74-77` | 100 / 220 | 220 (walking line) |
| param panel | `StairPathParamPanel.ts:357,377` | 100 – 220 | 220 – 360 |
| **the command** | `CreateStairCommand.canExecute` → `STAIR_CONSTRAINTS` | **150 / 190** | **250 / —** |

### Two QUANTITIES — the sharper half

The tool measured the **per-run** tread `seg.flightLength / seg.stepCount`; the command measured the
**averaged scalar** `Σ seg.length / totalSteps` that `StairPathAdapter` commits. They differ by the
landing consumption on every L and U. ⭐ **And the per-run tread — the value `StairMeshBuilder`
actually builds with — was validated by NOBODY on the command side.** Two layers disagreeing about a
NUMBER were disagreeing about the DEFINITION.

### NORMATIVE

> **N6 — `packages/geometry-stair/src/StairGeometryLimits.ts` is the ONE authority** for stair tread
> and riser limits. It owns the numbers (`resolveStairGeometryLimits`), the predicate
> (`checkStairGeometry`) and the **quantity** (`deriveCommittedTreadDepth`). ⛔ No layer may declare
> a private tread or riser constant. A limit measured on a quantity the command never sees
> (`MIN_SEG_LEN`; the curved solver's inner-edge, outer-edge and radius limits) **may** stay local
> and **must** say so at its declaration.

> **N7 — A stair candidate carries BOTH tread quantities** — the scalar and every
> `flights[i].treadDepth` — and the predicate checks both. Validating either alone leaves the other
> unchecked, which is precisely how the founder's stair passed one layer and failed the next.

> **N8 — Equality is PINNED, not asserted.**
> `packages/geometry-stair/src/__tests__/StairAcceptSetParity.spec.ts` drives
> `StairSolver2D.solve()` and `CreateStairCommand.canExecute()` — the real layers, bridged by the
> production adapter — over swept straight and L grids, and fails on any disagreement. It also fails
> on a re-introduced private constant **even when that constant happens to agree**.

### ⛔ THIS CONTRACT NAMES NO SOURCE OF AUTHORITY FOR STAIR GEOMETRY LIMITS — recorded, not invented

Tread and riser minima are **code-dependent** (jurisdiction, occupancy, private vs common stair).
**C98 has never named a source of law for them, and does not now.** The repo's only gesture toward
one is `STAIR_CONSTRAINTS_REGIONS` (`StairValidationAuthority.ts:36-43`), which:

- aliases `'AS-1657'` and `'EUROPEAN'` to the **same object**; and
- gives `'IBC-USA'` a `MIN_TREAD_DEPTH: 0.250` "override" **identical to the default it overrides**.

**The region hook is decorative.** 250 mm is now the single effective minimum **because it is what
the pipeline already enforced** — lowering a code minimum is not a defect fix. ⚠ It is very likely
**wrong for residential Spain**: CTE DB-SUA permits a 220 mm *huella* in private dwellings, which is
plausibly where the tool's 220 came from. **This is a founder decision**, and thanks to N6 it is now
a one-line change in one place. **§13 DELTA #18.**

### ⛔ `MAX_RISERS_PER_FLIGHT: 16` IS DECLARED THREE TIMES AND READ BY NOBODY

`grep -rn "MAX_RISERS_PER_FLIGHT"` over `packages plugins apps src` (tests excluded) → **5 hits,
every one a declaration** (`geometry-stair/src/StairTypes.ts:216,231`,
`core-app-model/src/stores/StairTypes.ts:189,203`,
`constraint-solver/src/stair-constraint-engine.ts:15`). **Zero readers on any path.** A Ground→L5
stair at 175 mm risers is ~86 risers in one or two flights; the constant that exists to forbid that
runs nowhere. Same class as the tread pair, and it closes the same way. **L-1434, §13 DELTA #19.**

### §13 DELTA — rows added by this lane

| # | Fix | Invariant | Proof required |
|---|---|---|---|
| **18** | **Decide 250 mm vs 220 mm and name the source of authority** for stair geometry limits | this section N6 | a cited instrument, and a region record whose entries actually differ |
| ~~**19**~~ | ~~**Enforce `MAX_RISERS_PER_FLIGHT` (or retire it)** through `StairGeometryLimits`~~ ✅ **CLOSED 2026-08-20 (L-1434)** — enforced on **RISE**, not count, because enforcing the declared COUNT would have refused an ordinary 3.0 m storey (17 risers at the 175 mm default). ⭐ *Only trying to enforce it revealed that.* The refusal is chosen, not defaulted: it names both numbers and the action, and landing GENERATION stays declined. | C84 EI-3 | ✅ met |
| **20** | **Generalise the slab void over the derived level set** (§L-1431 gap 1) | §L-1431 N1/N2 | a Ground→L2 stair leaves no intact slab between its endpoints |
| **21** | **Make move/param-change reconcile the horizontal-host voids** (§L-1431 gap 2) | §L-1431 N4 | move a stair, assert the OLD floor void is gone and a new one exists |
| **22** | **Measure whether `serviceHoles` / `holeElements` survive save/load** | C84 EI-6 | round-trip a project with a stair void in a finish |

### §14 REFUSALS — rows added by this lane

| # | Refusal | Named where | Verdict |
|---|---|---|---|
| **R11** | **A horizontal host that does not CONTAIN the footprint is not pierced** — and the nearest one is never pierced instead | `StairHorizontalHostPiercing.ts` — `hostsContainingFootprint`, log names the measured/unmeasurable counts | ✅ the L-949 rule, generalised to two more families |
| **R12** | **The derived level span DECLARES when it is a fallback** (`basis: 'fallback-top-only'`) rather than reporting a span it did not derive | same file, `stairPiercedLevelIds` | ✅ C74 — an unresolved input is not drawn as a value |
| **R13** | **An undo record naming an unregistered family leaves the void and SAYS SO** | `unpierceStairHorizontalHosts` | ✅ a visible void beats a silent one |

### §16.6 — `By Walls`: the third axis-member, its refusals, and the arm that closed it

> **Founder, verbatim:** *"…or **select 2 walls** [and] create the stair in **L shape against
> the walls**."*

**It is `By Slab`, for stairs — not a new idea.** The wall tool (`elementCreationMatrix` :248) and
the railing (:390) already ship `{ id: 'byslab', …, isAction: true }`: a pill that DERIVES the sketch
from geometry that exists instead of from clicks. The stair's member is therefore **`bywall`** — same
lowercase no-hyphen id form, same `isAction`, same pre-activation **selection SNAPSHOT**, for the
reason **L-1103** records: `ToolManager.activateTool` calls `selectionManager.setEnabled(false)`, so a
By-* mode that reads the LIVE selection *after* activation asks a question activation destroyed —
**unsatisfiable, not flaky**.

#### §16.6.a — MUST. **No relationship is recorded on the created stair** — and this is the contract's answer, not a shortcut

⭐ **Measured, not assumed.** Neither wall's nor railing's `byslab` records an edge back to its source
slab: `handrailAuthoring.setHandrailBySlabTarget` holds a transient `_pendingBySlabId`, consumed at
creation and discarded, and the created elements carry no `sourceSlabId`. **By Slab is an
authoring-time derivation, not a persisted association.**

The contract route confirms it, and **the hop is written down here so the next lane does not
re-derive it**: [C78](C78-UNIVERSAL-RELATIONSHIP-CONTRACT.md) **§3.1** states that
**[C71](C71-GRAPH-AND-TOPOLOGY.md) owns the relationship vocabulary and C78 owns nothing of it** — so
the question is answered in **C71 §2**, not in C78. Of C71 §2.1's REQUIRED nine, **none is "the walls
this stair was authored against"**: `boundedBy` is room ↔ wall, `hostedBy` is the opening-in-host
pair, `sitsOn` is dependency scheduling. Minting a new member falls under **C71 §2.6** — writer,
**typed reader**, rebuild disposition and delete behaviour **in one PR** — and **C71 §2.5** rules a
writer-first addition *"a defect, not progress."* **There is no reader for this edge, so the correct
action is to record nothing.** ⛔ A `sourceWallIds` field with nothing honouring it would be
**C78 §3.3's forbidden third state**.

#### §16.6.b — MUST. Four refusals, each carrying **BOTH numbers**

`apps/editor/src/engine/views/plantools/stairByWalls.ts` · `planStairByWalls()` — pure, no DOM, no
store reads. Every refusal carries machine-readable `found` / `required` / `unit` **and** states both
in prose:

| Code | Found vs required | Why it refuses rather than approximating |
|---|---|---|
| `WALL_COUNT` | walls selected vs **2** | Also names the trap: activation clears the selection, so both walls must be picked first (L-1103) |
| `NOT_PERPENDICULAR` | the angle measured vs **90° ± 5°** | *"An L-stair's landing is a rectangle: against walls 63.43° apart there is no square corner for it to sit in, so the run that turns would leave the wall it is meant to follow."* |
| `NO_SHARED_CORNER` | the miss in metres vs **0.5 m** | Two perpendicular walls at opposite ends of a room still intersect **as lines**. That is not a corner, and "perpendicular" alone would have accepted them |
| `RUN_TOO_SHORT` | wall available vs run needed | Shows its working: risers, goings, and the minimum tread the numbers came from |

⚠ **Both tolerances are DOMAIN BANDS, not epsilons (C73 §2.1).** A wall drawn in LINEAR mode is never
exactly 90°, and a 3 mm tremor over 6 m is ~0.03°; 5° tolerates the hand and refuses the intent.

#### §16.6.c — MUST. The limits come from the **one** authority

`planStairByWalls` calls **`resolveStairGeometryLimits()`** (§STAIR-ONE-LIMIT-AUTHORITY, L-1430) and
⛔ **re-declares no minimum of its own.** That is the module `CreateStairCommand.canExecute` and the
sketch solver read, so a plan this function accepts cannot be refused downstream for a tread the two
layers measured differently — the live **C84 EI-3** breach this family carried the same night.

#### §16.6.d — The second run's side is **DERIVED**

Against two walls there is exactly one quadrant the stair can occupy, so `secondRunSide` follows from
the corner's handedness rather than from the param panel's Left/Right control. **A picker offering a
choice the geometry has already made is a control that lies.** Pinned by mirroring the corner and
asserting the handedness flips.

#### §16.6.e — ⭐ **`bywall` IS on the mode strip. The member landed WITH its arm, in one commit (`0ac94491`, L-1456).**

> ⚠ **CORRECTED 2026-08-20, same day.** This section previously read *"`bywall` is NOT on the mode
> strip yet, and that is the ruling, not an oversight"*, and stated an exit condition. **The exit
> condition was met hours later and this paragraph was briefly FALSE while the feature shipped.** It
> is recorded rather than silently rewritten, because a contract describing behaviour the code does
> not have is the defect this suite exists to prevent — and it does not become acceptable when the
> error runs in the *pessimistic* direction.

**The blocker that was withdrawn, and why it did not bind.** The withholding rested on a measured
fact: there is **no multi-select id accessor** (`selectionManager.selectedObject` is singular;
`selectedElementIds` exists only in a Zod schema). ⭐⭐ **That measurement is TRUE and it answered a
question the feature never asked.** It blocks reading two *already-selected* walls; it does not block
**picking two walls in sequence**. `_pickSlabThen` is a `bim-selection-changed` listener that cleans
up after **one** pick — generalised to `_pickElementsThen(kind, count, …)`, with `_pickSlabThen`
retained as a delegating wrapper so wall's and railing's `byslab` carry zero risk (pinned: the
one-wall pick still completes on the first valid click).

> ⭐ **The lesson, stated so it outlives this section: a measurement that is true can still be the
> wrong measurement.** This is the same shape as `isHeavyModel` being credited as a trigger while
> having zero call sites (C04 §1.4, L-1413), and as a coverage proof aimed at a file nothing renders
> from (C100 §9.3). **The number was right; the subject was wrong.**

**MUST — duplicate rejection is LOAD-BEARING, not defensive.** `bim-selection-changed` re-fires on
re-selection, so one wall clicked twice would fill both slots — and `planStairByWalls` would then
refuse that wall paired with **itself** as `NOT_PERPENDICULAR` at **0°**. ⭐⭐ **That refusal is *true*
and *completely misleading*: the architect picked one wall, not two crooked ones.** The pick count
therefore means **two DISTINCT walls or it means nothing**, and it is pinned by test.

> ⭐ **A gate that refuses correctly for the WRONG REASON is worse than one that refuses bluntly.**
> A blunt refusal sends the user looking; a precise, confident, wrong-subject refusal sends them
> looking in the wrong place. This is a distinct defect class from a missing check or a wrong
> threshold, and it is recorded here as one.

**MUST — the plan reaches the tool as POINTS, never as a hand-built command.** The three planned
points are replayed through `feedClick` by `StairPathPlanToolHandler`, mirroring its own
`_pendingShapeHint`. ⛔ **Constructing a `CreateStairCommand` at the call site would mean a second
copy of `StairPathAdapter` — which is precisely how this family acquired its 220 mm/250 mm EI-3
breach (§16.5, L-1430).** By Walls is therefore byte-identical to the architect clicking, and
inherits the solver, the limits, the refusals and the undo grouping for free.
**MUST:** the handoff is one-shot **and a refusal CLEARS it** — otherwise a gate says no and the tool
silently draws the *previous* stair.

**The id is `bywall`, not `byslab`.** It is an ACTION (never takes the highlight), keyed `W`. ⭐ The
source geometry is walls, and **one vocabulary per concept means the id says WHICH** (C84 EI-8).

**⚠ PROVISIONAL-PENDING-FOUNDER — the limit, stated rather than implied.** 28 tests pass, including
two picks → plan → arm → replay → a **real `CreateStairCommand`** with two flights and zero
`onInvalid` refusals. **What Node CANNOT prove is the DOM pick overlay and the tool re-entry
timing.** The verification route is the founder: activate the stair tool → click **`W  By Walls`** →
click one wall → click a second wall meeting it at 90° → an L-stair appears in the corner. A
non-perpendicular pair must refuse with **both numbers**.
⭐ **The EI-3 line is not "unverified in a browser" — it is "the limit is undeclared."** A member
whose residual risk is written down is honest; a member whose arm silently does nothing is the breach.

---

## §L-1441 — THE CHAT SURFACE FOR STAIRS IS **LIT** (added 2026-08-20, lane RAC2)

> **Supersedes the status line in "RAC — the chat surface for this family" above.** That table read
> **⛔ DARK for type — blocked by ONE METHOD**, with a retiring condition of *"`StairTypeStore` gains
> `getById()`"*. Both halves are now resolved: STAIR1 added the `getById` alias (**L-1435**), and the
> chat shipped **without waiting for it** — see §L-1441.2. ⛔ Do not read the older table's Status
> row as current; its **Findings** and **NOT MEASURED** rows still stand.

**Founder, verbatim (2026-08-19):** *"Make all the stairs type X" · "Make all the stair railings type
X" · "change tread to X" · "Change width of all stairs to X" · "Change first run of all stairs to X
meters"* — plus *"I want to select a wall — and say create a stair from ground to level 5 connected
to this wall — in L shape."*

### §L-1441.1 — What is published, and what refuses

| Sentence | Verdict | Capability | Route |
|---|---|---|---|
| "make all the stairs type X" | ✅ **LIVE** | `set-stair-type` | `stair.updateParameters` → `UpdateStairParametersCommand` (fan-out) |
| "make all the stair railings type X" | ✅ **LIVE** | `set-stair-railing-type` | `element.changeType` `:1901` → `UpdateStairRailingCommand` (fan-out) — see [C95](C95-ELEMENT-HANDRAIL.md) §15.17 |
| "change width of all stairs to X" | ✅ **LIVE** | `set-stair-dimensions` | `element.updateDimensionsBatch` (ONE dispatch) |
| "change tread to X" | ✅ **LIVE** | `set-tread-depth` | `stair.updateParameters`, selection-scoped |
| "create a stair from ground to level 5 connected to this wall — in L shape" | ⛔ **REFUSED, by design** | `create-stair-span` | no command exists — §L-1441.4 |
| "change first run of all stairs to X meters" | ⛔ **REFUSED, by design** | `set-stair-part` | no addressable component — §L-1441.5 |

> **§L-1441.1.a — MUST.** Both refusals **NAME THE LIVE REPLACEMENT** ([C16](C16-COMMAND-AUTHORING-PROTOCOL.md)
> CA-18) and both are pinned by test to do so. ⛔ A bare *"I didn't understand"* on either sentence
> is a regression, not a copy nit: without the grammar these are MISSES, and a miss falls through to
> an LLM production does not have configured.

### §L-1441.2 — ⭐ The catalogue blocker was real and was **not** on the critical path

The older table's retiring condition — *"`StairTypeStore` gains `getById()`"* — was **correctly
diagnosed and wrongly scoped**. The missing method blocks `resolveCatalogueRef`, which blocks the
**editor bridge's** catalogue channel. It never blocked the family: `BUILT_IN_STAIR_TYPES` is the
same array that store is constructed from, and reading it needs no adapter.

⚠ **The bridge channel is still two rows wide.** `buildCatalogueChannel`
(`apps/editor/src/ui/ai/ZeroTokenChatBridge.ts:923`) injects **`slab` and `ceiling` only**, against
sixteen families `element.changeType` routes. So the chat resolves stair types from the **published
built-in table**, not from the project's store, and:

> **§L-1441.2.a — MUST.** A **project-authored** stair type is **NOT resolvable from chat**, and the
> refusal **says so in the user's own words**: *"These are the built-in stair types. A stair type
> authored in this project is not readable from chat yet — pick it in the Properties panel, or use a
> built-in here."* ⛔ It must never be reported as *"no such type"*. Failure and absence-from-the-
> source-I-could-read are different values (§CONTEXT-DATA-HONESTY), and so are *"not in this
> project"* and *"not in the table I can see"*.
>
> **Retiring condition:** a `stair` row (and a `stair-railing` row) in `buildCatalogueChannel`, now
> unblocked by L-1435. Then the note disappears on its own, because the injected lookup wins.

Railings have **no** such limit: the chat reads the **live `handrailTypeStore` singleton** — the same
object `element.changeType`'s stair-railing branch calls `getById()` on before it will accept a type
— so a name the chat resolves is a name that branch acts on, and user-authored railing types are
visible. Pinned by test rather than argued.

### §L-1441.3 — ⭐⭐ TWO COMMAND-SIDE FINDINGS, and the second is a live founder decision

#### (a) `UpdateStairParametersCommand` validates `treadDepth` against **MIN ONLY**

Measured 2026-08-20 at `UpdateStairParametersCommand.canExecute`:

| field | min | max |
|---|---|---|
| `riserHeight` | ✅ `:83-86` | ✅ `:87-90` |
| `treadDepth` | ✅ `:107-109` | ⛔ **absent** |

So *"change tread to 500 mm"* was **written and reported as done**. `checkStairGeometry` refuses it
(`STAIR-TREAD-TOO-DEEP` against `MAX_TREAD_DEPTH` 360 mm) — the command never calls it.

⭐ **The chat now refuses it and the command still does not.** That asymmetry is written down here
rather than left in a commit message, because it is the **third instance tonight of one shape**: two
layers with an opinion about the same quantity, where the stricter layer is not the one the write
goes through. The other two were the 220/250 tread pair (§L-1430) and the bulk-vs-single width gate
(§L-1441.6).

> **§L-1441.3.a — MUST.** `UpdateStairParametersCommand` calls `checkStairGeometry` rather than
> re-testing individual constants, per **N6**. Until it does, the chat's stricter behaviour is a
> **containment**, not a fix, and this row stays open. **§13 DELTA #23.**

#### (b) ⛔ THE BUILT-IN TYPES **LOOSEN** THE MINIMA — and enforcing a default would mint a FALSE REFUSAL

`resolveStairGeometryLimits(constraints, typeRules)` lets a stair TYPE replace `maxRiserHeight` and
`minTreadDepth`. Measured over `BUILT_IN_STAIR_TYPES`:

| type | `maxRiserHeight` | `minTreadDepth` |
|---|---|---|
| `monolithic` · `steel-open` · `marble-luxury` | 0.190 (= default) | 0.250 / 0.280 |
| **`timber-closed`** | **0.220** ⬆ | **0.220** ⬇ |
| **`residential-timber`** | **0.220** ⬆ | **0.220** ⬇ |

**Two of five built-ins are LOOSER than `STAIR_CONSTRAINTS`.** And `ResolverContext.selection` carries
`{elementId, elementType}` — **no `typeId`** — so the chat cannot resolve per-type limits.

> **§L-1441.3.b — MUST NOT.** The chat **MUST NOT** enforce `minTreadDepth` or `maxRiserHeight`
> against the DEFAULT limits. Refusing a 230 mm tread on a `timber-closed` stair — where 220 mm is
> the type's own minimum — is **a false refusal minted by a safety check**, which is worse than not
> checking: it tells the user the model forbids something the model permits, and it does it with the
> authority of a validation message.
>
> **§L-1441.3.c — MAY.** The chat **MAY** enforce `maxTreadDepth`, and does. It is the one bound
> `StairGeometryLimits` states no type can move (*"A type may tighten (or loosen) tread and riser; it
> has no say over max tread"*) — so it is exactly the bound reachable without a `typeId`, **and
> exactly the one the command misses** (a).
>
> **§L-1441.3.d — the structural fix, NAMED.** A `stairTypeIdOf?: (elementId: string) => string |
> undefined` on `ResolverContext`, filled by the editor bridge — the **`resolveWallSystemType`
> precedent**, which is how every other project-specific lookup reaches this pure layer. ⛔ It was
> deliberately NOT added by lane RAC2: the injection site is outside that lane's seam, and a channel
> nobody fills is authored-but-unwired. **§13 DELTA #24.**

> ### ⭐ THIS ROW BEARS ON THE OPEN 250-vs-220 DECISION — [§L-1430](#l-1430--stair-geometry-limits-have-one-authority-and-no-source-of-law-added-2026-08-20-lane-stair1), §13 DELTA #18
>
> §L-1430 records that 250 mm is the effective minimum *"because it is what the pipeline already
> enforced"*, and is **very likely wrong for residential Spain** (CTE DB-SUA permits a 220 mm
> *huella* in private dwellings). **This row is evidence for that decision, from a second
> direction:** the product **already ships two built-in types whose own `minTreadDepth` is 220 mm**,
> and both are the residential ones. The 220 in `timber-closed` / `residential-timber` is not a
> stray constant — it is the per-type override mechanism expressing exactly the distinction CTE
> DB-SUA draws. ⭐ **Whatever is decided for the default, the per-type override is the mechanism that
> already models "private dwelling", and a decision that ignores it will re-open as an EI-3 breach.**

### §L-1441.4 — The Ground→L5 stair: **three** blockers, and two are already on the books

> ⭐⭐ **RE-MEASURED 2026-08-20, HOURS AFTER THIS SECTION WAS FIRST WRITTEN. TWO OF THE THREE
> BLOCKERS CLOSED WHILE IT WAS BEING WRITTEN, AND THE VERDICT DID NOT MOVE.** Lane STAIR1 landed
> §STAIR-VOID-EVERY-DECK (**L-1433 + L-1434**) in the same session. The table below is the CURRENT
> state; the struck rows are kept because *what changed* is the finding.

| # | Blocker | State |
|---|---|---|
| 1 | **No geometry reaches the language layer.** `ResolverContext.selection` is `{elementId, elementType}`; `CreateStairInput` requires `startPosition: Vec3` **and** per-flight `direction: Vec3`. "Connected to this wall" cannot become those numbers. | ⛔ **OPEN** — [C67](C67-RAC-CAPABILITY-CONTROL-PLANE.md) §4 rule 20 |
| 2 | **One command, one stair, and no way to split it into storeys.** ~~`MAX_RISERS_PER_FLIGHT` does not catch it — 5 declarations, ZERO readers~~ | ⭐ **ENFORCED (L-1434)** — `CreateStairCommand:222-223` now calls `checkStairGeometry`, which caps a flight's **RISE** at `maxFlightRise` **3.04 m**. **The command REFUSES this stair, naming both numbers and the action.** ⛔ It is still unsatisfiable from chat — see §L-1441.4.a |
| 3 | ~~**The slab opening is punched on `topLevelId` ONLY**, so levels 1–4 stay solid~~ | ✅ **CLOSED (L-1433)** — `carveStairOpening` / `reconcileStairOpening` LOOP `stairPiercedLevelIds()`; every pierced deck is carved |

⭐ **Blocker 3 was reached independently by two lanes from opposite ends within one session** —
STAIR1 from the geometry (§L-1431, *"A Ground→L5 stair still passes through four structurally intact
slabs"*) and RAC2 from the founder's sentence. **The agreement is worth more than either measurement
alone**, and it is why the fix landed the same day.

> ### ⛔ §L-1441.4.a — MUST. THE REFUSAL SURVIVES ITS OWN REASONS, AND THAT IS THE POINT
>
> The chat still **REFUSES**, and the ground has become **stronger**, not weaker. The flight-rise cap
> is satisfiable in exactly one way — **a LANDING per storey** — and **there is no landing-generation
> verb**. STAIR1 declined to build one, explicitly and in writing: *"⛔ NOT a landing-generation
> verb. Refusing an 86-riser flight honestly is the job; producing the landings is not, and stays
> declined."* ⭐ **So the chat cannot author an input that would succeed**, and the two layers now
> refuse the same set for the same reason.
>
> ⛔ It must not create a single-storey stair as a partial result: *a gate whose "yes" branch awaits
> a decision is a regression with a contract citation attached* (L-942).
>
> ⛔ **AND THE COPY MUST BE RE-MEASURED WITH THE REASONS.** The shipped refusal told the founder the
> in-between storeys *"would stay solid"*. After L-1433 that became **a false statement about his
> model** — quoted with authority and sounding like a measurement. It was corrected in place, and
> the acceptance test now asserts the retired claim **cannot come back**.
>
> ⭐ **THE STANDING LESSON, worth more than this family:** three blockers went to one in a few hours
> and **nothing failed** — the refusal stayed right while two of its three reasons stopped being
> true. **A refusal must be re-measured on the same schedule as a feature**, because a stale reason
> ships as confidently as a fresh one. This is the ROT-IN-A-JUSTIFICATION shape CLAUDE.md records for
> contract ranges and gate readings, landing in user-facing copy.
>
> ⚠ **`maxFlightRise` 3.04 m is a DERIVATION** (`MAX_RISERS_PER_FLIGHT × MAX_RISER_HEIGHT`), **not a
> cited code value** — the SAME open question as 250-vs-220, and both close when the founder's
> jurisdiction answer lands. **§13 DELTA #18.**

### §L-1441.5 — ⭐⭐ THE VOCABULARY CANNOT ADDRESS A COMPONENT OF AN ELEMENT — stated, not implied

> **§L-1441.5.a — the honest general limit.** Every scope this product's chat can produce
> (`all` · `selection` · `level` · `room` · `orientation` · `filter`) resolves to **a set of element
> IDs**. There is **no** "the first flight of each stair", no "the top rail of each railing", no
> "the third layer of each wall". **This is a property of the scope algebra, not a stair gap.**

Stair **railings** look like a counter-example and are not: they are separate ELEMENTS with their own
store and command, which is precisely why `set-stair-railing-type` could ship as an ordinary family.
⭐ **That is the general shape of the answer: a "part" becomes addressable by becoming an element.**

The stair-specific gap, measured: `UpdateStairParametersInput.updates` carries `{width, fireRating,
accessibilityType, riserHeight, treadDepth, typeId, properties}` — **`stepsBeforeLanding` is not
among them** — and the only flight verb, `UpdateStairFlightsCommand`, requires an explicit
`direction: Vec3` per flight (blocker 1 again).

> **§L-1441.5.b — MUST NOT.** The chat **MUST NOT** derive `stepsBeforeLanding = round(runLength /
> treadDepth)`. It is one line, and it would be a **second authority** for a quantity
> `StairParameterReconciler` owns, computed from a tread the user did not name, written through a
> field the command does not accept. **Refusing is the correct answer, not the lesser one.**

### §L-1441.6 — The bulk route accepted what the single route refused

`set-stair-dimensions` rides `element.updateDimensionsBatch` → `UpdateElementParameterCommand`, whose
`validateParameters` checks **positivity and nothing else**. The one-stair route
(`stair.updateParameters`) enforces `MIN_WIDTH` 0.9 m / `MIN_ACCESSIBLE_WIDTH` 1.2 m. **So the same
capability, spoken over three stairs instead of one, would accept 0.1 m and report success.**

> **§L-1441.6.a — MUST.** A bulk capability **MUST NOT** accept a value its one-element form refuses.
> The chat contains this by calling `checkStairGeometry` and quoting **its** refusal verbatim —
> *"Stair width 100mm is below minimum 900mm. The one-stair version of this ask refuses it too, so I
> will not do it in bulk. Nothing was changed."* One sentence, one source, and it states what did
> **not** happen.
>
> ⚠ **Containment, not a fix.** STAIR1 closed the command-side divergence at L-1435, but the **seam
> is open**: `element.updateDimensionsBatch` has no per-family dispatch, so the generic carrier never
> reaches the predicate. **§13 DELTA #25.**

### §L-1441.7 — NOT MEASURED / NOT BUILT for this family (explicit — EI-1b)

- **No utterance was typed into a live editor.** Every verdict is source-measured plus test-driven
  through `applySemanticIntent`; V3/V4/V5 under a chat driver remain unmeasured, exactly as the
  older RAC table says.
- **Selection as a GEOMETRY source is NOT BUILT.** See [C67](C67-RAC-CAPABILITY-CONTROL-PLANE.md)
  §4 rule 20 — "this wall" is a *selection reference*, and the resolver has the element's **identity**,
  never its **position**.
- **Undo granularity for the two type families is N steps, not one** — a **[C78](C78-UNIVERSAL-RELATIONSHIP-CONTRACT.md)
  §12.1 breach**, recorded at C67 §4 rule 18. ⛔ Not a stair-specific decision and not closable here.

### §13 DELTA — rows added by this lane

| # | Fix | Invariant | Proof required |
|---|---|---|---|
| **23** | **`UpdateStairParametersCommand` calls `checkStairGeometry`** instead of re-testing constants (closes the missing max-tread check) | §L-1430 N6 · §L-1441.3.a | a 500 mm tread is refused **by the command**, with the predicate's own message |
| **24** | **`stairTypeIdOf` on `ResolverContext`**, filled by the editor bridge | §L-1441.3.d | a 230 mm tread is ACCEPTED on a `timber-closed` stair and REFUSED on a `monolithic` one, through chat |
| **25** | **Per-family dispatch for `element.updateDimensionsBatch`** so the bulk route reaches each family's predicate | §L-1441.6.a | the batch command itself refuses a 0.1 m stair width, with no chat-side containment |
| **26** | **A `stair` row in `buildCatalogueChannel`** (unblocked by L-1435) | §L-1441.2.a | a project-authored stair type resolves from chat, and the built-ins note disappears |

---

## §L-1433 — THE SLAB'S LEVEL AXIS IS CLOSED, AND THE ID IS THE HALF THAT COULD DESTROY DATA (added 2026-08-20, lane STAIR1)

§L-1431 derived the void set across FAMILIES and across LEVELS for the floor-finish and ceiling
families, and left the slab's level axis open as gap 1. **It is now closed.** That gap entry and
§13 DELTA #20 are **DONE**.

### What was wrong

`carveStairOpening` filtered `s.levelId === stair.topLevelId`, while
`LevelTraversalPolicy.canTraverse` returns **`ok: true` with a warning** for a level-skipping stair.
⭐ **A Ground→L5 stair was ACCEPTED and its ~15 m run passed through four INTACT slabs.**
Founder-reachable **by hand** — the stair parameters panel offers Top level as a dropdown, so no
chat surface and no AI path is needed to hit it. After §L-1431 the asymmetry was *worse*, not
better: the finishes above a deck were cut while the deck itself stayed solid.

### How it was fixed — and why NOT through the §L-1431 registry

The registry was **not** extended to the slab, and §L-1431's reason for that stands: a slab's void is
a first-class `opening` ELEMENT with its own id convention, Immer undo patches, slab-side symmetry
and delete-heal, and a second implementation of that lifecycle is the drift
`StairSlabOpeningReconciler`'s header exists to forbid.

Instead `carveStairOpening` and `reconcileStairOpening` **loop the derived deck set**, with
`carveOneDeck` / `reconcileOneDeck` holding the pre-L-1433 bodies **verbatim** — containment rule,
refusal, profile frame, registration sequence and the L-581 never-delete-on-a-failed-measure
asymmetry are untouched, because the level axis was the only thing wrong with them.

> **N9 — `stairPiercedLevelIds` is owned by NEITHER void owner.** It lives in
> `stair/stairPiercedLevels.ts`. Both owners must derive the same decks from the same code, and the
> two already reference each other (the piercer imports `StairFootprintSource` as a *type*), so
> putting the derivation in either would create a real runtime import cycle. A third module owned by
> neither is the honest shape, and it is why the families cannot drift into piercing different decks.

> **N10 — DIRECTION B moved with it.** A slab created on an **intermediate** deck of an existing
> multi-storey stair was carved by nobody — the same enumeration seen from the other side. Both
> directions now ask the same function.

### ⭐⭐ NORMATIVE — THE ID IS PERSISTED, AND IT DOES NOT MOVE

> **N11 — `opening-stair-<stairId>` is the TOP deck's id, forever.** That string is **on disk**:
> every saved project carries its stair void under it, and `DeleteStairCommand` resolves it by it.
> Re-keying the top deck would leave every existing project's void **UNOWNED** — the delete would
> stop healing it, leaving a permanent hole in a building with no stair in it, and the reconcile
> would carve a **second** void beside the orphan. Only **additional** decks take the `--<levelId>`
> suffix. ⛔ **This is a data-compatibility fact, not a preference.** It lives in `stairOpeningId.ts`
> and is pinned as a **literal** by `__tests__/stairOpeningIdStability.test.ts`. A future change to
> that string requires a migration **first**.

> **N12 — the delete matches by predicate, and the predicate is not a bare prefix test.**
> `isStairAutoOpeningId` accepts the legacy id exactly, or the legacy id followed by `--`. A bare
> `startsWith` would also match a different stair whose id *extends* this one's (`st-1` / `st-10`).

**Falsified:** with `stairPiercedLevelIds` forced back to the top-only enumeration, **six** cases go
RED — *"INTERMEDIATE slab left solid — the stair drives through it: expected +0 to be 1"*, direction
B, the undo and delete counts, and §L-1431's floor-finish equivalent. ⭐ **The six id-stability cases
stay GREEN under that same patch** — they pin the persisted string independently of the level loop,
so a rename fails them even when everything else passes.

---

## §L-1434 — THE CAP ON ONE FLIGHT: A CATEGORY ERROR, NOT A MISSING READER (added 2026-08-20, lane STAIR1)

**§13 DELTA #19 is DONE, but not in the form it was written.**

`MAX_RISERS_PER_FLIGHT: 16` was declared in **three** files and **read by nobody** — five grep hits,
every one a declaration, zero readers on create, update, validate or the sketch tool. §L-1433 made
it urgent: a Ground→L5 stair is ~86 risers, and as an I- or L-shape that is one or two flights.

### ⭐⭐ ENFORCING THE DECLARED NUMBER WOULD HAVE SHIPPED A WORSE DEFECT THAN THE ONE IT CLOSES

Measured 2026-08-20: an **ordinary 3.0 m storey** at the 175 mm comfort default solves to
**SEVENTEEN risers** (`round(3.0 / 0.175)`, actual riser 176.5 mm). **A hard cap of 16 refuses the
single most common stair in the product.**

⭐ **A limit nobody reads is a limit nobody has ever validated** — and this one is wrong in the
direction that refuses legal stairs. That is only discoverable by *trying* to enforce it, which is
the general lesson worth keeping: an unenforced constant is not a dormant correct rule, it is an
**unverified** one, and "switch it on" is never a safe instruction on its own.

### The reason is a CATEGORY ERROR

What codes regulate is the **vertical RISE between landings** — CTE DB-SUA (residential: a flight
saves at most 3.20 m), IBC 1011.8 (12 ft ≈ 3.66 m). A riser **count** is that rule divided by an
*assumed* riser height: 16 × 200 mm = 3.20 m. Our own `MAX_RISER_HEIGHT` is **190 mm** and the
typical solved riser is **176 mm**, so the count form silently **tightens** as risers get shallower —
which is backwards, because a shallower riser makes a flight *more* comfortable, not less.

> **N13 — the flight cap is measured as RISE, and the threshold is DERIVED.**
> `maxFlightRise = MAX_RISERS_PER_FLIGHT × MAX_RISER_HEIGHT` = 16 × 0.190 = **3.04 m**.
> ⛔ **No new number is invented.** Derived this way the gate can never refuse anything the declared
> (unread) count would have allowed, so switching enforcement on cannot regress a project that was
> legal under the old rule. The 3.0 m storey passes at 3.00 m; a Ground→L2 span drawn as one run
> (34 risers, 6.0 m) refuses at **both** layers.

> **N14 — the refusal names BOTH numbers AND the action** ([C16](C16-COMMAND-AUTHORING-PROTOCOL.md)
> CA-18): *"Run 1 climbs 6.00 m in one flight (34 risers), above the maximum 3.04 m without a
> landing — add a landing to split it, or reduce the levels this stair spans"*. A user told only
> *"too tall"* cannot act; one told only *"max 3.04 m"* does not know how far over they are.

> **N15 — `StairSolver2D` passes `riserCount` through.** Without it the tool would offer a flight the
> command refuses — the exact EI-3 breach §L-1430 closed, reopened by its own fix.

**Two dead declarations deleted** (`core-app-model/stores/StairTypes`,
`constraint-solver/stair-constraint-engine`). **One** declaration survives, in
`geometry-stair/StairTypes`, and it now has exactly one reader.

⛔ **This is NOT a landing-generation verb.** Refusing an 86-riser flight honestly is in scope;
*producing* the landings is not, and remains declined. **§13 DELTA #23.**

---

## §L-1430b — ⛔ THE REGIONAL HOOK IS **DECORATIVE**, AND THAT IS WHY THIS CONTRACT NAMES NO SOURCE OF LAW (added 2026-08-20, lane STAIR1)

§L-1430 recorded that C98 names no source of authority for stair geometry limits. **This section
states the mechanism, because the repo's one apparent counter-example is not one.**

`STAIR_CONSTRAINTS_REGIONS` (`StairValidationAuthority.ts:36-43`) *looks* like jurisdictional
support. Measured, it is not:

| Key | What it declares | Verdict |
|---|---|---|
| `'AS-1657'` | `STAIR_CONSTRAINTS` | — |
| `'EUROPEAN'` | **the SAME object**, aliased | ⛔ two names, one rule |
| `'IBC-USA'` | spreads the default and "overrides" `MIN_TREAD_DEPTH: 0.250`… | ⛔ **which is the value the default already holds** |

⭐ **Its only non-alias override overrides nothing.** Australian, European and American stairs
resolve to **identical** limits, and always have. This is a **gate that could never have failed**:
selecting a region cannot change a single number, so no region has ever been *wrong*, and no test
could ever have caught it.

> **N16 — ⛔ NOT-YET-TRUE: PRYZM has NO jurisdictional stair limits.** `STAIR_CONSTRAINTS_REGIONS` is
> **unimplemented** and must not be cited, in code or in a capability description, as evidence that
> a region's rules are honoured. Whoever implements it must make the entries **differ** and name the
> instrument each one encodes, or delete it.

**Two open values ride on this and close together**, when the founder's jurisdiction answer lands:

1. **`MIN_TREAD_DEPTH` = 250 mm.** Held unchanged deliberately — it is what the pipeline already
   enforced, and lowering a code minimum is not a defect fix. ⚠ **CTE DB-SUA permits a 220 mm
   *huella* in private dwellings**, which is plausibly where the sketch tool's retired 220 came
   from. The founder is building in **Barcelona**.
2. **`maxFlightRise` = 3.04 m** (§L-1434 N13) — a **derivation**, not a cited code value. CTE's
   residential figure is **3.20 m**; IBC's is **12 ft**.

⭐ Both now move in **one place** (`StairGeometryLimits.ts`), so each is a one-line change once the
decision is taken. **That is the whole return on §L-1430: the question became answerable cheaply
instead of being spread across four layers.**

### §13 DELTA — this lane's rows, updated

| # | Fix | State |
|---|---|---|
| **18** | Decide 250 mm vs 220 mm and **name the source of authority** | ⛔ **OPEN — with the founder.** Sharpened by §L-1430b: the region hook is decorative, so there is no partial support to build on |
| **19** | Enforce `MAX_RISERS_PER_FLIGHT` (or retire it) | ✅ **DONE, in the RISE form** (§L-1434). ⚠ The declared count was **wrong**; see N13 |
| **20** | Generalise the slab void over the derived level set | ✅ **DONE** (§L-1433) |
| **21** | Make move/param-change reconcile the horizontal-host voids | ⛔ **OPEN — L-1432.** Move now follows the **slab** voids on every deck; the **floor-finish and ceiling** voids still do not follow a move |
| **22** | Measure whether `serviceHoles` / `holeElements` survive save/load | ⛔ **OPEN — still NOT MEASURED** |
| **23** | Decide whether an over-tall flight should be **refused** or have a landing **auto-inserted** | ⛔ **OPEN.** Refusal ships today (N14); generation is a design decision, deliberately not taken |

### §14 REFUSALS — this lane's rows, updated

| # | Refusal | Verdict |
|---|---|---|
| **R14** | **A flight may not climb more than `maxFlightRise` without a landing** — `checkStairGeometry`, both layers | ✅ names both numbers **and** the action (C16 CA-18) |
| **R15** | **The top deck's opening id NEVER changes** — `stairOpeningId.ts` | ✅ a data-compatibility refusal, pinned as a literal |
