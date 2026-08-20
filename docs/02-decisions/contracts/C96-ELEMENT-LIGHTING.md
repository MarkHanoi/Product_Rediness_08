# C96 — ELEMENT: LIGHTING

> **Stamp**: 2026-08-18 · **Status**: CANONICAL — binding on every PR touching the lighting family
> **Parent**: [C84 §6](C84-ELEMENT-INTEGRITY.md) — this is one of the fifteen per-element contracts
> C84 spawns. C84 owns the invariants `EI-1…EI-13`; C96 owns **only** their application to lighting.
> **Structure**: the twelve mandatory sections of [C84 §6](C84-ELEMENT-INTEGRITY.md), in order. Each
> carries **AS-IS** (measured, `file:line`, 2026-08-18 at `3384f076`) beside **TO-BE** (normative).
> **Cites, does not restate**: [C03 §4.6 U-2/U-2b](C03-SCHEMAS-COMMANDS-AND-STATE.md) owns
> `affectedStores` · [ADR-0319 §2](../adrs/ADR-0319-audit-fields-are-derived-not-authored.md) owns
> audit fields across undo (**NOT C75**) · [C11](C11-ELEMENT-CREATION-PIPELINE.md) owns creation ·
> [C16 CA-17…CA-21](C16-COMMAND-AUTHORING-PROTOCOL.md) owns command authoring and refusal ·
> [C05](C05-PERSISTENCE-AND-FILE-FORMAT.md) owns the persistence format ·
> [C82](C82-RIBBON-CAPABILITY-SURFACE.md) owns whether a control is still offered.
> **Key finding**: **C84's headline lighting defect — *"lighting is never persisted"* — is FALSE and is
> RETRACTED here (§3.1).** The real defect is narrower, still live, and was invisible while the false
> one held the attention: **13 authored fields round-trip to disk and are discarded on restore.**

---

## 0. THE RETRACTION — and why it is the most valuable paragraph in this contract

⛔ **C84 ranked *"Lighting never persisted"* as severity #1 of the entire element-integrity
programme — *"Loses: the work itself, on every save"* ([C84 §4](C84-ELEMENT-INTEGRITY.md) severity
table, row 1). It is not true. It has not been true since 2026-05-22.**

| Claim | Where C84 states it | Measured 2026-08-18 | Verdict |
|---|---|---|---|
| `ProjectSerializer.ts` → **0** matches for `lighting` *and* for the broader `light` | C84 §1.2, §4 row `lighting`, EI-6 | **`packages/persistence-client/src/loader/ProjectSerializer.ts` → `grep -ic lighting` = 0, `grep -ic light` = 0** | ✅ **the number is right** |
| …therefore *"Every light the user places is destroyed on save"* | C84 §1.2 | **`apps/editor/src/engine/persistence/ProjectSerializer.ts` → `grep -ic lighting` = 9** | ⛔ **FALSE** |
| `ProjectLoader.ts` → 18 hits, so *"the LOAD half exists and the SAVE half does not"* | C84 §0, third table; commit `d5b8d82f` | **LIVE loader = 21 `light` / 18 `lighting`; LIVE serializer = 9. BOTH halves exist.** | ⛔ **FALSE** |

**Both sides of C84 §0's third disagreement measured the same DEAD file.** The four-audit sweep and
the Z8 draft argued about whether the loader had 0 or 18 hits; neither noticed that the *serializer*
they were both grepping was `packages/persistence-client/`, which is not on any editor save path.
**The commit that "corrected" C84's lighting reading (`d5b8d82f`, *"the LOAD half exists, the SAVE
half does not"*) is itself wrong, and it is wrong in the same way, for the same reason.**

### 0.1 The save block, verbatim, and its date

`apps/editor/src/engine/persistence/ProjectSerializer.ts:1025-1031`:

```ts
// §PERSIST-LIGHTING (2026-05-22) — lighting fixtures were NEVER serialized,
// so every light the user placed was silently lost on reload. The lighting
// store is window-managed (initBuilders sets window.lightingStore; the same
// ref CreateLightingCommand reads), so we source it from there rather than
// threading it through the `stores` param.
const lighting = (((window as { lightingStore?: { getAll?: () => unknown[] } }).lightingStore?.getAll?.()) ?? [])
    .map((l) => deepStrip(l));
```

Declared on the snapshot type at `:140-141`, counted at `:1095`, written at `:1106`. Restored at
`ProjectLoader.ts:1273-1301` (*Step 10b: Lighting fixtures*), import at `:112`, completeness check at
`:2432-2448`. **Introduced by `5c8c8791`, 2026-05-23** (`git log -S lighting --oneline --
apps/editor/src/engine/persistence/ProjectSerializer.ts`). **C84 described as an open catastrophe a
defect that had been closed for very nearly three months.**

### 0.2 ⛔ THE REPO ALREADY KNEW, IN TWO PLACES, AND SAID SO IN PROSE

This is not a subtle file. Two independent in-repo sources state the correct fact:

1. **`plugins/lighting/src/handlers/MoveLighting.ts:71-72`** — the refusal string of a *different*
   verb names the geometry store as the one **"that `initBuilders` constructs and `ProjectSerializer`
   persists"**. A refusal message written to explain why lighting *cannot* move states, in passing,
   that lighting *does* save.
2. **`apps/editor/src/engine/initPersistence.ts:88-94`** — a comment recording a **prior casualty of
   this exact mistake**:

   > *"…which is exactly the state PV-05 was recorded closed in, because the fix at `8cab70c1` landed
   > on the persistence-client copy of `ProjectSerializer` **that this file does not import**."*

   **A fix for the C23 provenance store had already been shipped into the dead copy once, and the AI
   audit log was destroyed on every reload as a result.** C84 then repeated the identical error
   against the identical file pair, three months later, and ranked the result severity #1.

**Normative consequence, and it generalises beyond lighting —**

> **§C96-GREP-BOTH-HALVES.** Two `ProjectSerializer`/`ProjectLoader` pairs exist. The **LIVE** pair is
> `apps/editor/src/engine/persistence/` — it is the one `initPersistence.ts:41-43` imports and the one
> the save delegate at `:107-111` calls. The **other** pair, `packages/persistence-client/src/loader/`,
> is **not on the editor save path**. Any persistence claim in any contract, ADR, spec or issue-log
> entry MUST name which pair it measured. A claim that does not name the pair is **NOT MEASURED**,
> regardless of how many `grep` counts it quotes.

⚠ **`packages/persistence-client`'s deadness is NOT self-declared — NOT MEASURED.** Its header
(`ProjectSerializer.ts:1-23`) reads as a live *"MODIFICATION DECLARATION … read-only store observer"*.
Its non-participation in the editor save path is measured (no editor importer; `initPersistence.ts:94`
says so explicitly); a *declaration* inside the file does not exist and is **owed** (§11 item 7).
It is also **not unreferenced** — `tools/rac-conformance/certification/gates/check-provenance-slice-persisted.ts`,
`check-ubg-snapshot-derived.ts` and its own `__tests__/` import it, so it is **NOT deletable** under
[C84 §3.5](C84-ELEMENT-INTEGRITY.md) (`RENDER-DEAD / OTHER-HOST-LIVE`).

---

## 1. Identity

| Axis | AS-IS (measured) | TO-BE (normative) |
|---|---|---|
| Canonical `userData.elementType` | **`'Lighting'`** — `packages/geometry-lighting/src/LightingFragmentBuilder.ts:334` (non-writable, non-configurable property descriptor) and `:356` (`child.userData.elementType = 'Lighting'`) | **`'Lighting'`, frozen.** One spelling. Per [C15 §12](C15-HOSTED-ELEMENT-CONTRACT.md) every comparing consumer normalises with `.toLowerCase()`; the stored casing does **not** change |
| Other spellings in use | `'lighting'` lowercase appears **only** in a test (`apps/editor/src/ui/property-panel/__tests__/elementTypePickerRegistry.spec.ts:172`) and as the already-lowercased comparison target at `plugins/view/src/handlers/DeleteElement.ts:54` | ✅ **CONFORMANT** — one producer spelling, consumers normalise. Unlike slab (four spellings) and door (two), lighting has **no** C15 §12 violation |
| L0 Zod schema | `packages/schemas/src/elements/Lighting.ts:55` `defineElement('lighting', {…})`; type export `:140`; registry `packages/schemas/src/registry.ts:63` | unchanged |
| Branded id | `packages/schemas/src/types/Id.ts:39` `LightingId = Id<'lighting'>`; regex `^lighting_<ulid>$` (`BaseNode.ts:35`) | unchanged |
| Bus verb namespace | `lighting.*` — **6 verbs**, `plugins/lighting/src/handlers/index.ts:11-18`: `create` `:12` · `delete` `:13` · `move` `:14` · `setIntensity` `:15` · `setEmergency` `:16` · `setMaterial` `:17` | unchanged; new verbs join [C69](C69-API-VERB-REGISTER.md) in the same PR |
| Sub-part tags | **NOT MEASURED** — whether `LightingFragmentBuilder` tags child meshes with a `role`/`parentId` per [C15 §12](C15-HOSTED-ELEMENT-CONTRACT.md) was not read | measure, then declare |

⚠ **Runtime id space does not match the schema.** `CreateLightingCommand.ts:80` mints
`` `light_${Date.now()}_${…}` ``, which **fails** the `^lighting_<ULID>$` brand at `BaseNode.ts:35,41`.
The two halves of the family use the same field name for two incompatible value spaces (§5).

---

## 2. Stores — five representations, and the authority is NAMED

| # | Representation | Path | Written by | Read by | Verdict |
|---|---|---|---|---|---|
| 1 | **L0 Zod schema** | `packages/schemas/src/elements/Lighting.ts:55` | the bus payload | `Lighting.parse` at `plugins/lighting/src/handlers/CreateLighting.ts:86` | shape β (§5) |
| 2 | **Plugin DTO store** | `plugins/lighting/src/store.ts:10` (`Store<LightingData>`, key `'lighting'`) | all 6 bus verbs | **NOTHING in production** | **write-only shadow** |
| 3 | **Legacy geometry store** | `packages/geometry-lighting/src/LightingStore.ts:16`, live as `window.lightingStore` | `CreateLightingCommand.ts:121`, `initTools.ts:1969` | renderer, plan, persistence, undo | 🟢 **THE AUTHORITY** |
| 3′ | *duplicate of #3* | `packages/core-app-model/src/stores/LightingStore.ts:16` | — | — | ⚠ byte-identical rival (§9.2) |
| 4 | **Scene `userData`** | `LightingFragmentBuilder.ts:320-356` | the builder | picking, GLB, keyboard delete routing | derived |
| 5 | **Kernel producer** | `packages/geometry-kernel/src/producers/lighting.ts` `produceLighting` | committer | **bake worker only — NOT MEASURED whether the bake worker handles lighting at all** | see §10 |

> ### EI-1 — THE AUTHORITY IS `window.lightingStore` (`packages/geometry-lighting/src/LightingStore.ts:16`)
>
> **Every** consumer MUST read it. Measured: renderer, plan view, persistence (`ProjectSerializer.ts:1030`)
> and undo (`performUndoRedo.ts:333`) all do. **Lighting is NOT split-brain on the authority axis.**

**EI-1a — the store KEY resolves to two different objects, and the divergence is DECLARED here.**
Per [C03 §4.6 U-2b](C03-SCHEMAS-COMMANDS-AND-STATE.md):

| Time | `'lighting'` resolves to | Site |
|---|---|---|
| **WRITE** (bus verb) | the plugin DTO `Store` snapshot | `bootstrap.ts:94` → `storesAsRecordView` → `attachStores` |
| **UNDO** | `window.lightingStore` — the **legacy geometry** store | `performUndoRedo.ts:333` `lighting: w.lightingStore,` |

**These are not the same object.** Every bus verb therefore satisfies C03 U-2b's corrupting case.
**TO-BE:** the six bus verbs route through the authority (C16 **CA-17**) or declare
`affectedStores: [] as const` (C16 **CA-19** exit (b)). Two of the six already refuse (§6).

**EI-5a — the DTO store is a DECLARED write-only shadow, and MUST NOT be reconciled.**
⛔ Do not add a mirror or purge ([C84 §8.c](C84-ELEMENT-INTEGRITY.md)). `plugins/lighting/src/store.ts:1`
reads only `// LightingStore — pure DTO store for fixture bodies (S26 / ADR-0023).` **TO-BE:** rewrite
that header on the `plugins/rooms/src/store.ts:1-29` model — name the winner (`window.lightingStore`),
state reader count (**0**) and writer count (**6 bus verbs**), and give the retirement path
(ADR-0331 §D2). ⚠ Inverts the moment any consumer is found reading it.

---

## 3. Consumers — no split-brain, one absence, one unknown

| Consumer | Reads | Evidence | Verdict |
|---|---|---|---|
| **Renderer (3D)** | legacy | `packages/geometry-lighting/src/LightingFragmentBuilder.ts` (via `bim-lighting-added`, `LightingStore.ts:21`) | ✅ |
| **Plan view** | legacy | `apps/editor/src/engine/views/plantools/LightingPlanToolHandler.ts` | ✅ |
| **Persistence — SAVE** | legacy | `apps/editor/src/engine/persistence/ProjectSerializer.ts:1030` (**LIVE pair**) | ✅ |
| **Persistence — LOAD** | legacy | `apps/editor/src/engine/persistence/ProjectLoader.ts:1273-1301` (**LIVE pair**) | ⚠ **lossy — §5** |
| **IFC export** | — | `packages/file-format/src/export/ifc/readers/` lists 13 files; **no `LightingReader.ts`** | ⛔ **ABSENT** |
| **GLB export** | scene `userData` | **NOT MEASURED** — no lighting-specific GLB path was read | **NOT MEASURED** |
| **Bake worker** | — | **NOT MEASURED** — whether `HeadlessBakeSession` invokes `produceLighting` was not read | **NOT MEASURED** |

**EI-1 verdict: ✅ CLEAN on every consumer that reads anything.** Recorded explicitly per **EI-1b** —
this is a pass, not an absence of looking. **The defect is not WHICH store they read; it is WHAT
survives the round-trip (§5).**

⛔ **EI-6 — the IFC absence is a silent vanishing and MUST become loud.** Lighting, ceiling and floor
have no IFC reader. **TO-BE:** either author `LightingReader.ts`, or IFC export MUST emit a named
refusal enumerating the fixtures it is dropping. Silent omission is forbidden.

---

## 4. Plugin ↔ DTO ↔ command ↔ builder

### 4.1 Bus handlers — `plugins/lighting/src/handlers/`

| Handler | `type` | Registered? | Reachable from a UI control? | Verdict |
|---|---|---|---|---|
| `CreateLighting.ts:38` | `lighting.create` | ✅ `index.ts:22-36` | ✅ `LightingPlanToolHandler.ts:129`; `LightingLayoutExecutor` (batched) | **LIVE.** ⚠ The EI-3 breach used to live here — **CLOSED 2026-08-19 (L-1331)**; this handler's `Lighting.parse` now accepts all 32 families (§9.1) |
| `DeleteLighting.ts:21` | `lighting.delete` | ✅ | ⛔ **ZERO dispatchers repo-wide** — only 2 hits, both declarations (`index.ts:13`, `DeleteLighting.ts:21`) | **DORMANT** (C84 §3.5.3) — ⛔ do not delete |
| `MoveLighting.ts:77` | `lighting.move` | ✅ | ⛔ refuses unconditionally `:110` | **C16 CA-18 CONFORMANT** |
| `SetLightingIntensity.ts` | `lighting.setIntensity` | ✅ | **NOT MEASURED** | — |
| `SetLightingEmergency.ts` | `lighting.setEmergency` | ✅ | **NOT MEASURED** | — |
| `SetLightingMaterial.ts:62` | `lighting.setMaterial` | ✅ | ⛔ refuses unconditionally `:83` | **C16 CA-18 CONFORMANT** |

**⚠ Reachability was measured on BOTH axes** ([C84 §3.5.1](C84-ELEMENT-INTEGRITY.md)) — the import
axis *and* the bus axis. `lighting.delete` has a registered handler and a live registration and **no
dispatcher**: it is [C84 §3.5](C84-ELEMENT-INTEGRITY.md) **DORMANT**, the PRYZM-3 target vocabulary,
and is **not** deletable.

### 4.2 Legacy commands — `packages/command-registry/src/lighting/` — these are the live path

| Command | `affectedStores` | Note |
|---|---|---|
| `CreateLightingCommand.ts:50` | **`:51` `['level']`** | comment: *"lighting store snapshot is window-managed"* |
| `DeleteLightingCommand.ts:10` | **`:11` `['level']`** | reached only from `DeleteElement.ts:55` |
| `MoveLightingCommand.ts:16` | **`:17` `['level']`** | **NOT MEASURED** whether any surface dispatches it — `MoveLighting.ts:72` states lighting is absent from `MOVE_COMMAND_BY_TYPE` and every `dragDispatch` site |
| `UpdateLightingParametersCommand.ts:40` | **`:46` `['lighting']`** | the only writer of the 13 fields (§5) |
| `CreateLightingByRoomCommand.ts:35` | **`:36` `['lighting']`** | — |

⛔ **ONE FAMILY, THREE `affectedStores` ANSWERS — an EI-9 violation inside a single directory.**
Three commands declare `['level']`, two declare `['lighting']`, and the six bus verbs declare
`['lighting']` against a different object again (§2). `UpdateLightingParametersCommand.ts:43-45`
already records that its own former `['level']` *"told the lock graph and every `affectedStores`-driven
consumer the wrong write-set"* — **the same diagnosis, unapplied to its three siblings.**
**TO-BE:** one answer. `['lighting']` everywhere, and `createSnapshot` MUST learn the key (§7).

### 4.3 Builder

`LightingFragmentBuilder` (`packages/geometry-lighting/src/`), driven by `bim-lighting-added/updated/removed`
(`LightingStore.ts:21,29,35`). It consumes the 12 parametric blocks at `:457, 524, 560, 1329, 1340`,
each as `{ ...DEFAULTS, ...data.<x>Params }`.

---

## 5. THE BRIDGE FIELD MAP — load-bearing, omission forbidden (EI-2)

### 5.1 First, the correction: the two shapes are NOT "disjoint"

⚠ **RETRACTED, and the truth is worse.** It has been said that the persisted shape and the plugin
bus shape *"share NO field names"*. **Measured: they share FOUR — `id`, `type`, `levelId`,
`rotation`** — and two of those four are **type collisions**, which is strictly more dangerous than
disjointness because a hand-written re-emit will carry them and corrupt the value:

| Shared name | α persisted (`geometry-lighting/src/LightingTypes.ts`) | β bus (`packages/schemas/src/elements/Lighting.ts`) | Verdict |
|---|---|---|---|
| `id` | free string `light_<ms>_<rand>` (`CreateLightingCommand.ts:80`) | brand-enforced `^lighting_<ULID>$` (`BaseNode.ts:35,41`) | ⛔ **same name, incompatible value space** |
| `rotation` | `EulerDTO` **object** (`:203`) | `z.number()` **radians** (`Lighting.ts:93`) | ⛔ **same name, different kind** |
| `type` | `'lighting'` (`:199`) | `'lighting'` (`BaseNode.ts:48`) | ✅ compatible |
| `levelId` | `string` (`:200`) | `string` (`Lighting.ts:88`) | ✅ compatible |

**The narrower claim holds exactly and is the one to carry:** the *parametric* sets
`{fixtureType, position, *Params ×12, emission}` and `{kind, origin, width, depth, thickness,
dropLength, range, lumens, kelvin, beamAngleDeg, intensity, color, materialId}` **overlap in zero
members.** Two vocabularies for one fixture, with no translation anywhere.

### 5.2 THE PERSISTENCE ROUND-TRIP — every α field, and its fate on reload

> **This is the defect. It is live at HEAD, and it was invisible for as long as the false
> "never persisted" claim held the attention.**
>
> `ProjectSerializer.ts:1030` writes the record with `deepStrip(l)` — **a deep clone with no field
> list, so all 23 fields reach the disk.** Both restore paths rebuild through
> `CreateLightingPayload` (`CreateLightingCommand.ts:25-48`), which has **10 slots**.

| # | α field | `LightingTypes.ts` | Serialised? | Restored? | Disposition |
|---|---|---|---|---|---|
| 1 | `id` | :198 | ✅ | ✅ `:1286` | **CARRIED** |
| 2 | `type` | :199 | ✅ | ✅ reconstructed | **CARRIED** |
| 3 | `levelId` | :200 | ✅ | ✅ `:1290` | **CARRIED** |
| 4 | `fixtureType` | :201 | ✅ | ✅ `:1287` | **CARRIED** |
| 5 | `position` | :202 | ✅ | ✅ `:1288` | ⚠ **CARRIED BUT RE-DERIVED — see §5.3** |
| 6 | `rotation` | :203 | ✅ | ✅ `:1289` | **CARRIED** |
| 7 | `downlightParams` | :207 | ✅ | ⛔ | **DROPPED BY OMISSION** |
| 8 | `pendantParams` | :208 | ✅ | ⛔ | **DROPPED BY OMISSION** |
| 9 | `linearLedParams` | :209 | ✅ | ⛔ | **DROPPED BY OMISSION** |
| 10 | `pendantPebbleParams` | :210 | ✅ | ⛔ | **DROPPED BY OMISSION** |
| 11 | `pendantCeramicBellParams` | :211 | ✅ | ⛔ | **DROPPED BY OMISSION** |
| 12 | `pendantConicalParams` | :212 | ✅ | ⛔ | **DROPPED BY OMISSION** |
| 13 | `floorWoodPostParams` | :215 | ✅ | ⛔ | **DROPPED BY OMISSION** |
| 14 | `floorArcBrassParams` | :216 | ✅ | ⛔ | **DROPPED BY OMISSION** |
| 15 | `tableTerracottaParams` | :217 | ✅ | ⛔ | **DROPPED BY OMISSION** |
| 16 | `floorTripodBlackParams` | :218 | ✅ | ⛔ | **DROPPED BY OMISSION** |
| 17 | `mirrorLightParams` | :221 | ✅ | ⛔ | **DROPPED BY OMISSION** |
| 18 | `pendantClusterParams` | :224 | ✅ | ⛔ | **DROPPED BY OMISSION** |
| 19 | `emission` | :227 | ✅ | ⛔ | **DROPPED BY OMISSION** |
| 20 | `properties` | :229 | ✅ | ✅ `:1294` | **CARRIED** |
| 21 | `roomId` | :233 | ✅ | ✅ `:1291` | **CARRIED** |
| 22 | `hostId` | :235 | ✅ | ✅ `:1292` | **CARRIED** |
| 23 | `tags` | :237 | ✅ | ✅ `:1293` | **CARRIED** |

**13 of 23 fields — rows 7-19 — are written to disk and discarded on restore.** Both paths:
`ProjectLoader.ts:1285-1295` (Step 10b) and `projectLoaderUtils.ts:350-374`
(`buildLightingRestorePayload`, the fast-load path). Neither has a slot; there is **no warning, no
throw, no counter** — pure EI-2(a) **named-subset re-emit**.

⚠ **STATUS: NOT FIXED at HEAD — the brief that commissioned this contract said "now fixed"; that is
REFUTED.** `CreateLightingPayload` (`:25-48`) has ten slots and none is a `*Params` or `emission`.

⚠ **SEVERITY: LATENT, not live — and say so honestly.** The 13 blocks are consumed by the renderer
(`LightingFragmentBuilder.ts:457,524,560,1329,1340`) as `{...DEFAULTS, ...data.<x>Params}`, so an
absent block is indistinguishable from an unmodified one. Their **only** writer is
`UpdateLightingParametersCommand` (`:33-37`), whose **only** production dispatcher is
`initBusHandlers.ts:1989` — the `element.changeType` branch, which patches `fixtureType` **and
`fixtureType` IS carried**. So **no production UI authors a `*Params` block or `emission` today, and
no user has yet lost one.** It is a loaded gun: the first per-fixture colour control (the one
`SetLightingMaterial.ts:57` says is *"tracked under Gate G7"*) makes it live and silent on the same day.

> **The compliant fix is stated verbatim 20 lines below the defect, for another family.**
> `ProjectLoader.ts:1317-1319`, §PERSIST-L1 for curtain walls: *"every field the serializer wrote is
> threaded back through the command so the snapshot round-trips bit-identically."* **TO-BE: apply
> that sentence to lighting.** Add the 13 slots to `CreateLightingPayload`, thread them through both
> restore paths, and pin with a watched-RED byte-equality round-trip test.

### 5.3 The `seating` slot exists, is documented for exactly this caller, and neither caller passes it

`CreateLightingPayload.seating` (`:47`) is documented at `:39-45`:

> *`'auto'` (**DEFAULT, and what an omitted field means**): `position.y` is **IGNORED** and the
> command derives it… `'explicit'`: `position.y` is stated geometry and is stored VERBATIM. **Used by
> the persistence-restore and project-import paths**, which replay a Y the user already has.*

**Measured: neither restore path passes it.** `ProjectLoader.ts:1285-1295` — absent.
`projectLoaderUtils.ts:354-373` — absent. **So both take `'auto'`, and both discard the saved
`position.y` and re-derive it**, in direct contradiction of the field's own documentation naming them
as its consumers. **NEW FINDING, not previously logged.** A fixture whose Y was authored, or whose
level geometry changed since the save, does not reload where it was saved. **TO-BE:** both restore
paths MUST pass `seating: 'explicit'`.

### 5.4 THE `.created` BRIDGE — `lighting.create` → `lighting.created`

`packages/runtime-composer/src/CommandEventBridge.ts:831-849`. Only **4 of β's 24 fields** are so
much as *read* (`:835-840`), and the emit at `:841-848` carries 6 keys, 2 of them envelope:

| β field | line | Bridge disposition |
|---|---|---|
| `id` | `BaseNode.ts:45` | **CARRIED** `:845` |
| `levelId` | `Lighting.ts:88` | **CARRIED** `:844` (`?? ''` — an empty levelId is indistinguishable from an absent one) |
| `kind` | `:89` | **CARRIED** `:846` |
| `origin` | `:91` | **CARRIED** `:847` |
| `rotation` | `:93` | ⛔ **DROPPED BY OMISSION** |
| `width` | `:95` | ⛔ **DROPPED BY OMISSION** |
| `depth` | `:97` | ⛔ **DROPPED BY OMISSION** |
| `thickness` | `:99` | ⛔ **DROPPED BY OMISSION** |
| `dropLength` | `:101` | ⛔ **DROPPED BY OMISSION** |
| `range` | `:103` | ⛔ **DROPPED BY OMISSION** |
| `lumens` | `:111` | ⛔ **DROPPED BY OMISSION** — real photometry |
| `kelvin` | `:117` | ⛔ **DROPPED BY OMISSION** — real photometry |
| `beamAngleDeg` | `:124` | ⛔ **DROPPED BY OMISSION** |
| `intensity` | `:132` | ⛔ **DROPPED BY OMISSION** |
| `color` | `:134` | ⛔ **DROPPED BY OMISSION** |
| `isEmergency` | `:136` | ⛔ **DROPPED BY OMISSION** — a life-safety attribute |
| `materialId` | `:137` | ⛔ **DROPPED BY OMISSION** |
| `provenance` | `:71` | ⛔ **DROPPED** — [C75](C75-PROVENANCE.md) |
| `confidence` | `:87` | ⛔ **DROPPED** |
| `metadata` | `BaseNode.ts:18` | ⛔ **DROPPED** |
| `ifcData` | `BaseNode.ts:19` | ⛔ **DROPPED** |
| `parentId` | `BaseNode.ts:12` | ⛔ **DROPPED** |
| `childrenIds` | `BaseNode.ts:13` | ⛔ **DROPPED** |
| `type` | `BaseNode.ts:48` | ⛔ **DROPPED** (implicit in the event name) |

**4 of 24 survive — 20 dropped by omission.** The subscriber is `initTools.ts:1967-2016`, which
writes the legacy store, re-seats Y at `:1974-1983` and stamps `type: 'lighting'` at `:2005`.

⚠ **CORRECTION to [C84 EI-2(a)](C84-ELEMENT-INTEGRITY.md)**, which reads *"all ten of `lighting`'s
fields `CEB:841-848`"*. **The line range is right; "ten" is wrong** — the emit carries **6 keys, 4 of
them element fields**, and **20** are dropped.

⚠ **CORRECTION to the claim that this is "the thinnest `.created` of the twelve."** Measured in the
same file: `plumbing.create` (`:851-858`) and `structural.create` (`:861-868`) each emit **3 keys, 1
of them a field**. **Lighting is the thinnest bridge that forwards any geometry at all** — a real
distinction, and a weaker claim than the one retracted.

**There is NO `lighting.deleted` and NO `lighting.moved` bridge — create-only.** Recorded per EI-13.

---

## 6. Verbs

Lineages per [C84 §4A](C84-ELEMENT-INTEGRITY.md). **"Stores RESTORED"** is what an undo actually
re-applies, not what is declared.

| Verb | Lineage | Handler | `affectedStores` | Stores WRITTEN | Stores RESTORED | Equal? |
|---|---|---|---|---|---|---|
| `lighting.create` | **L1** | `CreateLighting.ts:38`, `produceCommand :89` | `:39` `['lighting']` (DTO) | plugin DTO | `window.lightingStore` (legacy) | ⛔ **disjoint** |
| **CREATE (live path)** | **L2** | `CreateLightingCommand.ts:50` | `:51` **`['level']`** | legacy store + BimManager + SemanticGraph | own `undo()` `:164-167` | ⚠ declared set ≠ written set |
| `lighting.batch.create` | — | **DOES NOT EXIST** | — | — | — | — (batching is done by `runBatch` around N `lighting.create`, `LightingLayoutExecutor.ts:6`) |
| `lighting.delete` | **L1** | `DeleteLighting.ts:21` | `:22` `['lighting']` | plugin DTO | legacy | ⛔ **disjoint — and DORMANT (0 dispatchers)** |
| **DELETE (live path)** | **L3** | `plugins/view/src/handlers/DeleteElement.ts:30` `affectedStores: [] as const` → `:55` `DeleteLightingCommand` | `['level']` on the legacy command | legacy store | legacy command's own undo | ⚠ see §7 |
| `lighting.move` | **L1** | `MoveLighting.ts:77` | `:78` `['lighting']` | **nothing — refuses `:110`** | n/a | ✅ **C16 CA-18 conformant** |
| **MOVE (legacy)** | **L2** | `MoveLightingCommand.ts:16` | `:17` `['level']` | legacy store | own undo | ⚠ **NOT MEASURED whether any surface dispatches it** |
| ROTATE | — | **NO ROTATE VERB EXISTS** | — | — | — | — `rotation` is authored only at create |
| PARAMETER / DIMENSION | **L2** | `UpdateLightingParametersCommand.ts:40` | `:46` `['lighting']` | legacy store | **own `_prior` deep clone `:74`** | ✅ **self-snapshotting — sound** |
| `lighting.setIntensity` | **L1** | `SetLightingIntensity.ts` | `:27` `['lighting']` | plugin DTO | legacy | ⛔ **disjoint** |
| `lighting.setEmergency` | **L1** | `SetLightingEmergency.ts` | `:25` `['lighting']` | plugin DTO | legacy | ⛔ **disjoint** |
| MATERIAL / COLOUR | **L1** | `SetLightingMaterial.ts:62` | `:63` `['lighting']` | **nothing — refuses `:83`** | n/a | ✅ **C16 CA-18 conformant** |
| LEVEL CHANGE | — | **NO LIGHTING LEVEL-CHANGE VERB** | — | — | — | **NOT MEASURED** whether `element.changeLevel` has a lighting branch |
| CREATE-BY-ROOM | **L2** | `CreateLightingByRoomCommand.ts:35` | `:36` `['lighting']` | legacy store | **`createSnapshot` returns `{}` — §7** | ⛔ |
| TYPE CHANGE | **L3** | `initBusHandlers.ts:1989` `_cmExec(new UpdateLightingParametersCommand(…))` | delegated | legacy store | delegated `_prior` | ✅ |

**Only ONE verb in this family has an equal write/restore set by design** —
`UpdateLightingParametersCommand`, and only because it deep-clones its own prior state at `:74`
rather than trusting the snapshot machinery. **That is the shape the rest must reach.**

---

## 7. Undo / redo

### 7.1 `affectedStores` vs the measured write set (EI-7 / C03 §4.6 U-2)

| Command | Declared | Actually writes | Verdict |
|---|---|---|---|
| `CreateLightingCommand` | `['level']` | `window.lightingStore` + BimManager + SemanticGraph | ⛔ **U-2 violation** — declares a store it does not write, omits the one it does |
| `DeleteLightingCommand` | `['level']` | `window.lightingStore` | ⛔ **U-2 violation** |
| `MoveLightingCommand` | `['level']` | `window.lightingStore` | ⛔ **U-2 violation** |
| `UpdateLightingParametersCommand` | `['lighting']` | `window.lightingStore` | ✅ name correct — but see §7.2 |
| `CreateLightingByRoomCommand` | `['lighting']` | `window.lightingStore` | ✅ name correct — but see §7.2 |
| the 6 bus verbs | `['lighting']` | the **plugin DTO** store | ⛔ **U-2b violation** — right name, wrong object (§2) |

### 7.2 EI-7d — `createSnapshot` does not know `lighting` (**L-953**)

`CommandManagerImpl.createSnapshot()` (`:578-636`) recognises `wall` `:589`, `slab` `:593`,
`level` `:598` and the `optionalStores` array at **`:609-625`** (`column`, `beam`, `roof`,
`curtainWall`, `furniture`, `handrail`, `stair`, `ceiling`, `floor`, `door`, `window`,
`visibility-intent`, `view-intent-instance`). **`'lighting'` appears nowhere.** The membership test at
`:628` has **no `else`, no warning, no throw**; because a declared scope is non-null the all-stores
fallback at `:582-584` does not engage.

**⇒ `UpdateLightingParametersCommand` and `CreateLightingByRoomCommand` receive a snapshot of `{}`
and `restoreSnapshot` restores nothing.** They survive only because the first keeps its own `_prior`
clone; **`CreateLightingByRoomCommand` has no such fallback and is UNPROTECTED on a failed execute.**

> ⚠ **Discrepancy recorded, not resolved.** [ISSUE-LOG L-953](../../04-reference/ISSUE-LOG.md) states
> `createSnapshot` *"recognises **14** store keys"*; counting distinct `storeKey` strings at
> `:589,593,598,610-624` gives **16**. **The set-membership finding — `lighting` is absent — is
> CONFIRMED and is the load-bearing half. The count is NOT RECONCILED.**

### 7.3 EI-7c — is lighting stranded from Ctrl+Z? **No.**

`performUndoRedo.ts:333` — `lighting: w.lightingStore,`. The key **is** in `buildUndoStoreMap()`
(`:308-347`). Lighting is **not** one of the seven stranded families. ✅ Recorded per **EI-1b**.

### 7.4 EI-7e — does undo restore, or recompute?

**Restores.** No lighting service consults `isReverting()`; none needs to — nothing downstream of a
light re-derives (§8). ✅

### 7.5 Audit envelope across undo — **ADR-0319 §2**

`UpdateElementParameterCommand`'s audit-neutral restore is gated on `t === 'wall'|'door'|'window'`
(~`:410-414`). **Lighting is not routed through `UpdateElementParameterCommand` at all** — it has its
own `UpdateLightingParametersCommand`, which restores `_prior` verbatim (`:74`), audit fields
included. **⇒ lighting is NOT among L-952's eight affected families.** ✅ Recorded as a clean
negative per **EI-1b**. *Governed by [ADR-0319 §2](../adrs/ADR-0319-audit-fields-are-derived-not-authored.md),
not C75.*

---

## 8. Cascades

| Cascade | Direction | Trigger | Reversed by undo? | Evidence |
|---|---|---|---|---|
| **furnish → lighting auto-layout** | inbound | `furnish.layout-executed` → `lighting.layout-execute` | ⚠ **the N creates are ONE batch and undo as one** (`LightingLayoutExecutor.ts:6`); the **trigger** is a `runtime.events` emission outside patch capture and is not itself reversible | `lightingLayoutTrigger.ts:32,114,125`; §CHAIN-TIMEOUT `:112`; §CHAIN-NO-DOUBLE-FIRE `:174-186` |
| lighting create → BimManager register | outbound | create | ✅ `CreateLightingCommand.ts:164-167` | `:128` |
| lighting create → SemanticGraph `sitsOn` | outbound | create | ✅ `removeAllRelationshipsForElement` `:164-167` | `:132-138` |
| lighting create → `bim-lighting-placed` | outbound | create | n/a — notification | `:146` |
| store add/update/remove → fragment rebuild | outbound | any store write | ✅ follows the store | `LightingStore.ts:21,29,35` |
| lighting move → anything | — | **no live move path exists** | n/a | `MoveLighting.ts:72` |
| **room binding re-resolution** | — | ⛔ **NEVER RE-RESOLVED** | n/a | `roomId` is resolved once at create (`CreateLightingCommand.ts:84-89`); moving a wall so the fixture falls in a different room does **not** update it |

**Nothing downstream of a lighting element re-derives.** Lighting is a **leaf**: it consumes a level
datum and a room binding and produces nothing any other family reads. That is why §7.4 is clean, and
it is the single strongest structural property this family has.

⛔ **The stale `roomId` is a declared gap, not a clean cell.** Room-scoped lighting schedules and the
emergency-lighting count read a binding that no cascade maintains. **TO-BE:** either re-resolve on
the room-topology change event, or declare `roomId` as an as-placed historical stamp. Today it is
neither, and it reads as live.

---

## 9. Vocabularies

### 9.1 EI-3 — the offer/accept gap. ✅ **CLOSED 2026-08-19 (L-1331, lane LIGHT1) — exit (a) taken.**

> ⚠ **This section previously read *"10 of 12 fixture types the UI offers CANNOT be placed.
> CONFIRMED"* and named two exits without taking either. The count first got WORSE — twenty
> LOD-200 families (L-1330) made it **30 of 32** — and then the gap was closed. The AS-WAS analysis
> below is retained verbatim because it is how the bug was reasoned into existence; the resolution
> follows it. ⛔ Do not re-read the AS-WAS as current state.**

#### AS-WAS (retained — this is the diagnosis, not the state)

| Vocabulary | Members | Site |
|---|---|---|
| `LightingFixtureType` (**what the tool offers**) | **12** — `downlight` `:34`, `pendant` `:35`, `linear_led` `:36`, `pendant_pebble` `:37`, `pendant_ceramic_bell` `:38`, `pendant_conical` `:39`, `floor_wood_post` `:40`, `floor_arc_brass` `:41`, `table_terracotta` `:42`, `floor_tripod_black` `:43`, `mirror_light` `:44`, `pendant_cluster` `:45` | `packages/geometry-lighting/src/LightingTypes.ts:33-45` |
| `LightingKind` (**what the bus accepted**) | **5** — `downlight`, `pendant`, `strip`, `wall-sconce`, `emergency` | `packages/schemas/src/elements/Lighting.ts` |

**OVERLAP = `{downlight, pendant}` — exactly 2.**

`LightingPlanToolHandler.ts:135` sends a `LightingFixtureType` as `kind`. Because
`LightingKind.default('downlight')` is a `z.enum` default — which fires on `undefined`, **never** on
an out-of-enum literal — the other **10** reached `Lighting.parse` (`CreateLighting.ts:86-87`) as
invalid and it **threw**, rethrown as `LightingSchemaError`.

⛔ **The root is a stated false premise, and it is worth quoting because it is how the bug was
reasoned into existence.** `LightingPlanToolHandler.ts:123-128`:

> *"CreateLightingHandler's payload is `kind` + `origin` — NOT `fixtureType`/`position`. The two field
> names were a pure rename (LightingFixtureType and the schema LightingKind **share the value
> space**…)"*

**They shared 2 of 12.** A rename was performed on the strength of a value-space claim that was never
measured — EI-2(b)'s sibling: not a comparison against an impossible value, but a **cast justified by
an asserted equivalence**.

#### ⭐ THE MEASUREMENT THAT DECIDED THE EXIT

**Every other stage of the plan pipeline already handled a fixture family in that slot.** Measured
2026-08-19:

- `initTools.ts:2152` — the `§FT-LIGHTING` bridge does
  `const _fixtureType = (ev.kind ?? 'downlight') as LightingFixtureType;` — it **casts `kind`
  straight back into `fixtureType`** for the legacy store.
- `CopyPlanToolHandler.ts:625` records the same cast from the other direction.
- `geometry-kernel/producers/lighting.ts` reads `kind` only for the material key and one
  `circular`-vs-`rectangular` choice — **non-exhaustive, with a fallback**.
- 3-D placement (`LightingTool` → `CreateLightingCommand`) and project reopen
  (`ImportProjectCommand`) worked for **all 32**.

**So the capability existed at every stage but one.** This was a **transcription gap, not a missing
capability** — which is exactly the condition under which C84 EI-3's direction (**UI offers ⇒
pipeline accepts**) requires widening the pipeline rather than narrowing the UI.

#### THE RESOLUTION — exit (a), and it CLOSES THE CLASS

**Exit (b) was rejected on measurement, not taste:** narrowing the picker would have hidden **30
working fixtures** to satisfy a stale enum. That is the silent-narrowing failure **EI-2** forbids —
it makes the picker lie in the other direction, and a user who picks *Bollard* and receives a pendant
is worse served than one who receives a loud refusal (C16 CA-18).

⭐ **The fix is not "add 30 values to the enum" — that is the same remembered-not-derived defect one
layer down, and it would reopen at fixture 33.** Instead:

1. **The LOD-200 matrix MOVED to L0** — `packages/schemas/src/lighting/Lod200FixtureCatalogue.ts`.
   It is pure data (no Zod, no THREE, no DOM, no I/O; its only import is the sibling material
   catalogue), so L0 is a legal home, and the **P5 purity gate confirms it**:
   `check-domain-purity.ts` → **RC=0, 0 impurities across 177 files, hard-fail-at-zero**.
   ⭐ **The move is the fix.** While the matrix sat at L2 the schema could not read it — schemas may
   not import upward — so it carried a transcription instead. That is *why* the enum existed.
2. **`packages/schemas/src/lighting/fixtureVocabulary.ts`** COMPOSES the accepted set from three
   named sources: `LEGACY_CONSTRUCTION_FORMS` (5, for records already on disk) ∪
   `NAMED_FIXTURE_IDS` (12) ∪ `LOD200_FIXTURE_IDS` (20, read straight off the matrix), de-duplicated
   over the two-value overlap → **35 accepted values**.
3. **`LightingKind` is now `z.enum(ACCEPTED_LIGHTING_KINDS)`.**
   ⛔ **This is NOT "widen the parse to accept anything"** — the forbidden third exit. The union
   stays **closed and enumerated**; only its membership grew, and an unknown family is still
   refused (asserted by test). The runtime array is asserted to a composed **literal union type**,
   not `readonly string[]` — spreading a `Set` erases literals, and that spelling would have made
   `Lighting['kind']` infer as plain `string`, silently destroying exhaustiveness checking for every
   consumer. **A real regression wearing the costume of a widening.**
4. **ZERO changes in `apps/editor`.** The plan handler, the `§FT-LIGHTING` bridge and the copy path
   are untouched — they were already correct for a fixture family in that slot. The only thing that
   was wrong was the set the schema would accept.

**`NAMED_FIXTURE_IDS` (12) is the single hand-written member**, because those families have no matrix
behind them. Per **EI-8a** it is therefore **PINNED BY AN EXECUTED TEST**, not by a comment — *a
comment is the mechanism that has already failed twice* (C84 §8.d):

> `core-app-model/src/lighting/Lod200FixtureCatalogue.test.ts` asserts the accepted set covers
> **every key of `LIGHTING_FIXTURE_PHOTOMETRY`** — i.e. everything the tool can actually place — and
> parses all 32 through the **real `Lighting.parse`**, the exact call `CreateLightingHandler` makes.

⭐ **A 33rd luminaire is ONE matrix row and is accepted by construction. A 33rd *named* family that
forgot the vocabulary fails the BUILD, not a user's click.** That is the difference between closing
the instance and closing the class.

**Status:** `LIGHTING_FIXTURE_PHOTOMETRY` **32 families · 0 refused** · `Lighting.parse` accepts all
32 · unknown families still throw · the legacy 5 still parse, so records on disk keep loading.

### 9.2 EI-9 — THREE copies of `LightingTypes.ts`, and TWO of `LightingStore.ts`

| Copy | Path | Divergence from its siblings |
|---|---|---|
| A | `packages/core-app-model/src/lighting/LightingTypes.ts` | 351 lines |
| B | `packages/core-app-model/src/stores/LightingTypes.ts` | 351 lines — differs from A **only in a two-line comment wrap at `:175-176`** |
| C | `packages/geometry-lighting/src/LightingTypes.ts` | 351 lines — differs from B **only at `:29`**, `import … from '@pryzm/core-app-model'` vs `'../types/GeometryDTO'` |

Confirmed by `md5sum` (three distinct hashes) and `diff` (the two hunks above are the complete
difference). All three declare the same 12-member union, the same 12 `*Params`, the same
`LightEmissionConfig` `:188-193` and the same `LightingData` `:197-238`.

Likewise `LightingStore.ts` exists at `packages/core-app-model/src/stores/:16` and
`packages/geometry-lighting/src/:16`, **byte-identical but for the event-comment tag** (`// F.events.17`
vs `// F.events.18` at `:21,29,35`).

**Verdict under [C84 §3.5](C84-ELEMENT-INTEGRITY.md):** copy C **could** earn an EI-10(a) layer
licence — it is the L2 `geometry-lighting` package's local declaration. **A and B cannot: they are two
copies in ONE package, in sibling directories, with no boundary between them.** No copy carries a
named reason, an equivalence proof, a divergence list or a retirement condition — **EI-10 fails on all
four.** ⚠ **None of the three self-declares DEAD — NOT MEASURED, because no such declaration exists**;
their relative liveness is inferred from importers (`CreateLightingCommand.ts:14` → C).

**TO-BE:** one declaration. B is deleted; A re-exports or C re-exports A, per whichever direction the
L2 boundary permits. Until then, per **EI-8a**, the copies MUST be pinned by an executed test
comparing every member — **a comment is the mechanism that has already failed twice** (C84 §8.d).

### 9.3 Material vocabulary — lighting speaks **V3, and only V3**

Per [C84 EI-8](C84-ELEMENT-INTEGRITY.md)'s five: **V1** `STANDARD_MATERIAL_LIBRARY` (204) · **V2**
`RENDER_MATERIAL_LIBRARY` (16) · **V3** the 18 per-plugin `material-bridge.ts` palettes · **V4**
`FINISHES` in `finishRef.ts` (15) · **V5** the 6-value `materialName` enum at `HandrailTypeStore.ts:28`.

`plugins/lighting/src/committer/material-bridge.ts` imports none of V1/V2/V4/V5. It parses a colour
out of **slot 3 of the material key** (`:33-37`) — accepting `#rrggbb`, bare hex, or an `"r,g,b"`
tuple (`:15-31`) — and builds a `MeshStandardMaterial` with five hard-coded PBR constants (`:39-49`).

⚠ **It is NOT one of C84's "three that take `_key` and DISCARD it"** — it genuinely reads the key.
**Recorded as a clean negative per EI-1b.** But it is still an independent palette: the emissive
model, `emissiveIntensity: 0.4`, `roughness: 0.4`, `metalness: 0.1` are stated nowhere else.

⛔ **A live doc/code divergence at the two ends of one key.** `material-bridge.ts:5-8` documents slot 4
as `<lumens>@<kelvin>[!<intensity>]` per §FEAT-FIXTURE-PHOTOMETRY (2026-08-06); the composer
`packages/geometry-kernel/src/producers/lighting.ts:49-57` still documents it as `<intensity>`. Slot
**indices** are unchanged so `colorOfLightingMaterialKey` (slot 3) is unaffected and nothing is broken
today — but the two halves of one wire format disagree in writing. **TO-BE:** one description; **do
NOT design the unification of V1-V5 here — lane ZA owns it.**

⛔ **`materialId` is a field lighting cannot honour.** β carries `materialId` (`Lighting.ts:137`); α
has no such field. `SetLightingMaterial.ts:56-57` refuses and names the mechanism exactly:

> *"LightingData has no materialId/materialColor. A light fixture's colour lives in its per-fixture
> parameter blocks (`downlightParams.color`, `pendantParams.shadeColor`, `emission.color`, …) — a
> different field name per fixture type — so there is nothing a single material verb can write."*

**That is a model refusal** — it names the mechanism, cites the tracking gate, and does not lie.
`apps/editor/src/ui/property-inspector/MaterialDispatch.ts:183` carries the same text for the panel.
✅ **C16 CA-18 CONFORMANT.**

---

## 10. Geometry

| Axis | AS-IS |
|---|---|
| **Stack A** (viewport, persisted) | `packages/geometry-lighting/src/LightingFragmentBuilder.ts` — 12 fixture bodies, one branch per `LightingFixtureType`; real photometry (§FEAT-FIXTURE-PHOTOMETRY `:22-37`), `FIXTURE_NIGHT_MULTIPLIER`, budget in `LiveLightBudget.ts` |
| **Stack B** (kernel) | `packages/geometry-kernel/src/producers/lighting.ts` `produceLighting` — header `:1-20`: *the visible fixture body only*, every variant a vertical extrusion of `width × depth × thickness` at `origin + dropLength` downward, via `buildLinearExtrusion` |
| **Proven to agree?** | ⛔ **NO — and a parity test is NOT EXPRESSIBLE.** `packages/geometry-kernel/__tests__/produceLighting.parity.test.ts` is **analytic parity only** — Stack B against closed-form bounds (`:24-51`), constructed via `Lighting.parse` (`:15`). It never imports `LightingFragmentBuilder`. **[C84 §8.e](C84-ELEMENT-INTEGRITY.md): a parity test that compares a stack to itself does not satisfy EI-11.** |
| **Why not expressible** | ⚠ **PARTLY CORRECTED 2026-08-19 (L-1331) — the stated BLOCKER is gone; the gap is not.** This read *"the A/B parity harness is blocked behind the §9.1 EI-3 fix — there is no input on which both stacks are defined for 10 of 12 fixtures"*. §9.1 is now **CLOSED**: `Lighting.parse` accepts all **32** families, so an input on which BOTH stacks are defined now exists for every one of them and the harness is **EXPRESSIBLE**. ⛔ It is still **NOT WRITTEN**, and the shape mismatch remains real — A keys on 32 `LightingFixtureType` values with 13 parametric blocks (12 named + the one LOD-200 override), B keys on `width/depth/thickness/dropLength` and reads `kind` only for the material key and a circular-vs-rectangular choice. **Do not read this row as "blocked" — read it as OWED.** |
| **Datum** | ⛔ **THREE seating sites for ONE datum.** (1) `CreateLightingCommand.ts:100-106` — the declared chokepoint, `resolveFloorSeatingDatum` for `FLOOR_MOUNTED_FIXTURES` / `resolveCeilingSeatingDatum` otherwise (§FIX-INTERIOR-FFL-SEATING, C11 §5.4). (2) `LightingPlanToolHandler.ts:52-69` `_resolveY()`, with a hard fallback at `:68` `return FLOOR_MOUNTED_FIXTURES.has(type) ? 0.0 : 3.0;` — its own header `:34-49` concedes the plan tool *"dispatches `lighting.create` on the BUS and never runs that command — so the fix never reached plan-view placement."* (3) `initTools.ts:1974-1983` re-seats a **third** time. Stack B has **no datum** — `worldY` is a caller parameter (`lighting.ts:39`) |

⛔ **The three seating sites are an EI-9 violation with a hard-coded magic constant** (`3.0` m at
`LightingPlanToolHandler.ts:68`) as one of the three answers. **TO-BE:** one seating authority
(`SeatingDatumResolver`), reached by all three; the `0.0 / 3.0` fallback deleted, not defaulted.

---

## 11. THE DELTA — ordered fix list

Ordered by **what a user loses**, not by site count. Each item names its invariant and the proof that
closes it. Per `§RATCHET-EXCEEDED-IS-NEVER-DEBT (R7)`: **never raise a threshold to pass.**

| # | Fix | Invariant | Proof required |
|---|---|---|---|
| **1** | **Correct C84.** Its §1.2, §0 third table, EI-6 measurement and §4 row `lighting` all cite the DEAD serializer and rank a closed defect severity #1. §12 carries the proposed banner | governance | the banner lands; C84 §4's `lighting / EI-6` cell reads `✅ (LIVE pair) / ⚠ lossy restore` |
| **2** | **Restore the 13 parametric fields.** Add slots to `CreateLightingPayload` (`:25-48`); thread them through `ProjectLoader.ts:1285-1295` **and** `projectLoaderUtils.ts:354-373`, on the §PERSIST-L1 model stated at `ProjectLoader.ts:1317-1319` | **EI-2(a)**, EI-6 | **watched-RED** byte-equality round-trip: author a `downlightParams.radius`, save, load, assert equal. It must FAIL first |
| **3** | **Pass `seating: 'explicit'` from both restore paths.** The field's own doc `:39-45` names them as its consumers and neither passes it, so every reload re-derives `position.y` | **EI-2(a)** | watched-RED: save a fixture at a non-derived Y, reload, assert Y unchanged |
| **4** | **Close the delete path-dependence.** `BimService.ts:169` still constructs `DeleteElementCommand(id)` directly; `DeleteElementCommand` has **no** lighting branch (`grep -c lighting` → **0**) and falls to `:650` `success:false`. The keyboard route works (`initUI.ts:2450` → `DeleteElement.ts:55` → `DeleteLightingCommand`) | **EI-4 / EI-4a** | `OneDeletePathAcrossSurfaces.test.ts` **on `main`** — it is **NOT on `main` today** (`git ls-files` → no match). ⛔ **Delete the second route; do NOT copy the `elementType` switch into it** |
| ~~**5**~~ | ✅ **DONE 2026-08-19 (L-1331)** — EI-3 closed by **widening the pipeline**, not narrowing the UI (C84 EI-3 is directional: UI offers ⇒ pipeline accepts). `LightingKind` now DERIVES its accepted set from the LOD-200 matrix, moved to L0 for exactly that purpose — so a 33rd fixture cannot reopen it. ⚠ The false *"share the value space"* premise at `LightingPlanToolHandler.ts:123-128` **is still in the tree**: the comment is now harmless (the value spaces really do overlap) but it still records a claim that was never measured. **Correcting that comment is the residue of this row.** | **EI-3** | ✅ **SHIPPED** — `Lod200FixtureCatalogue.test.ts` asserts the accepted set covers every key of `LIGHTING_FIXTURE_PHOTOMETRY` **and** parses all 32 through the real `Lighting.parse` |
| **6** | **One `affectedStores` answer.** Three commands say `['level']`, two say `['lighting']`, six bus verbs say `['lighting']` against a different object | **EI-9**, C03 U-2/U-2b | `check-affected-stores.ts` (C84 §5) green for the lighting family |
| **7** | **Teach `createSnapshot` the `lighting` key** (`CommandManagerImpl.ts:609-625`). `CreateLightingByRoomCommand` is unprotected on a failed execute today | **EI-7d**, L-953 | the C84 §5 table-driven sweep; ⛔ **do not** narrow the declaration to `['level']` to dodge it |
| **8** | **Collapse the three `LightingTypes.ts` and two `LightingStore.ts` copies.** A and B are in one package and can carry no licence | **EI-9 / EI-10** | delete B; pin the survivors with an EI-8a every-member equality test |
| **9** | **One seating datum.** Three sites, one of them a hard-coded `0.0 / 3.0` | **EI-9** | all three call `SeatingDatumResolver`; the literal is deleted |
| **10** | **Declare the DTO store's disposition** in `plugins/lighting/src/store.ts:1` on the `plugins/rooms/src/store.ts:1-29` model — winner, reader count 0, writer count 6, retirement path | **EI-5a** | header lands; ⛔ **no mirror, no purge** |
| **11** | **IFC: author `LightingReader.ts` or refuse loudly.** Lighting vanishes from IFC with no message | **EI-6** | `check-persistence-coverage.ts` (C84 §5) |
| **12** | **Resolve or declare the stale `roomId`** — no cascade maintains it | **EI-12** | re-resolution wired, or the field declared an as-placed stamp |
| **13** | **Reconcile the `<intensity>` vs `<lumens>@<kelvin>` key-slot documentation** between `material-bridge.ts:5-8` and `producers/lighting.ts:49-57` | **EI-9** | one description |
| **14** | **A/B parity harness** — blocked behind #5 | **EI-11** | a real A-vs-B comparison; ⛔ the existing `produceLighting.parity.test.ts` does **not** count (C84 §8.e) |

---

## 12. REFUSALS — what lighting deliberately does NOT support

**A refusal is a correct answer; an undocumented one is not.** These are declared, not defects.

| # | Refusal | Named where | Verdict |
|---|---|---|---|
| **R1** | **A light cannot be MOVED.** No surface offers it; the bus verb refuses | `MoveLighting.ts:71-72` — names the detached store, states lighting is absent from `MOVE_COMMAND_BY_TYPE` and every `dragDispatch` site, cites `MOVE_UNSUPPORTED_REASON` and Gate G7, and confirms the Move button is capability-gated OFF | ✅ **EXEMPLARY.** Names mechanism, alternative (none), and exit condition. **And the control is disabled**, so it satisfies the C84 EI-7a correction that the residual defect is the still-offered control |
| **R2** | **A light has no single MATERIAL.** Colour lives in a differently-named field per fixture type | `SetLightingMaterial.ts:56-57`; `MaterialDispatch.ts:183` | ✅ **EXEMPLARY** — a representational truth, correctly refused rather than faked. ⛔ Do **not** close this by adding a `materialId` that nothing reads |
| **R3** | **A light has no ROTATE verb.** `rotation` is authored at create and never edited | — | ⚠ **UNDOCUMENTED.** No refusal string, no disabled control census. **TO-BE:** declare it or build it. **NOT MEASURED** whether a rotate control is offered |
| **R4** | **`lighting.delete` is DORMANT by design** — registered, never dispatched; deletion goes through `DeleteLightingCommand` | [C84 §3.5.3](C84-ELEMENT-INTEGRITY.md) rules the ten `<kind>.delete` verbs DORMANT | ✅ ⛔ **NOT deletable** — PRYZM-3 target vocabulary |
| **R5** | **Lighting has no BATCH-CREATE verb.** N fixtures are N `lighting.create` calls inside one `runBatch` | `LightingLayoutExecutor.ts:6,165` (§FIX-RUNBATCH-NESTING-DROPS-GUARDS, L-209) | ✅ **DECLARED** — one undo entry for N fixtures is the C84 §4B-correct outcome |
| **R6** | **Lighting is a LEAF: nothing re-derives from it** | §8 | ✅ **DECLARED** — the reason §7.4 is clean |
| **R7** | **Lighting is not exported to IFC** | nowhere | ⛔ **NOT A REFUSAL — A SILENT VANISHING.** See DELTA #11. Recorded here so it is never mistaken for a declared boundary |

---

## 13. NOT MEASURED — the honest register

⛔ **Gaps, not clearances. None may be recorded `✅` until measured** (EI-1b: a blank reads as *"fine"*
and is indistinguishable from *"nobody looked"*).

1. **GLB export** — no lighting-specific GLB path was read.
2. **Bake worker** — whether `HeadlessBakeSession` invokes `produceLighting` at all. Until measured,
   ⛔ **nothing in `packages/geometry-kernel/src/producers/` may be deleted** (C84 §3.5.2, ADR-0331 §D5).
3. **UI reachability of `lighting.setIntensity` and `lighting.setEmergency`** — registered; whether any
   control dispatches them was not measured. Both write the DTO store, so if reachable they are
   silent no-ops on the authority.
4. **Whether `MoveLightingCommand` (L2) has any dispatcher** — `MoveLighting.ts:72` implies none.
5. **`element.changeLevel`** — whether it has a lighting branch.
6. **Sub-part `userData` tagging** — whether child fixture meshes carry `role`/`parentId` per C15 §12.
7. **A deadness self-declaration in `packages/persistence-client/src/loader/`** — **none exists.** Its
   non-participation is measured; a declaration is **owed** (§0.2).
8. **`ROTATE` control census (R3)** and the general still-offered-control census — owned by
   [C82](C82-RIBBON-CAPABILITY-SURFACE.md).
9. **`packages/room-topology/src/LightingRoomResolver.ts` vs `packages/geometry-lighting/src/LightingRoomResolver.ts`** —
   a possible fourth duplication pair; both files exist, contents **not compared**.
10. **`packages/geometry-lighting/src/LightingTypeDefinitions.ts` (`BUILT_IN_LIGHTING_TYPES`)** —
    referenced by `Lighting.ts:24`, not opened. It may be a **sixth** vocabulary.
11. **`SetViewLightingCommand`** (`packages/command-registry/src/views/`) — view-scoped scene lighting,
    judged outside this family; not opened.
12. **`plugins/lighting/src/committer/` dirtying sets** (`GEOMETRY_FIELDS` / `MATERIAL_FIELDS` /
    `LIGHT_FIELDS`, referenced at `lighting-committer.ts:136-138`).
13. **The `createSnapshot` recognised-key COUNT** — L-953 says 14; this contract measures 16. The
    membership finding is confirmed; the count is **NOT RECONCILED**.
14. **Whether `lighting` is a member of the 26-value `StoreKey` union** (`command-registry/src/types.ts:557-584`)
    — asserted by L-953 and consistent with `UpdateLightingParametersCommand.ts:46` type-checking, but
    the union was not opened.


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

### THE VERB — `lighting.changeLevel` ✅ LIVE

| | |
|---|---|
| **Payload** | `{ lightingId, levelId }` — declared at `packages/command-bus/src/levelChangeVerbs.ts` |
| **Handler** | `plugins/lighting/src/handlers/ChangeLightingLevel.ts` |
| **Registered** | `plugins/lighting/src/handlers/index.ts:27` |
| **Legacy move** | `packages/geometry-lighting/src/LightingStore.ts` — `changeLevel(id, newLevelId)` |
| **Mirror row** | `apps/editor/src/engine/elementLevelChangedMirror.ts` — `LEGACY_LEVEL_MOVERS.lighting` |
| **Undo** | `elementUndoStoreAdapter.ts` §L-946 arm: a depth-2 `[id,'levelId']` inverse patch routes to `store.changeLevel()`, and re-registers bimManager + the view-dependency tracker with it |

### WHY THE STORE NEEDED ITS OWN `changeLevel`, FOR THIS FAMILY SPECIFICALLY

`LightingStore.update()` is a MERGE, so it would *tolerate* a `{levelId}` write — but
tolerating is not the same as being the right operation, and two family-specific facts make the
dedicated method necessary rather than merely tidy:

1. **`LightingStore.update` emits only the legacy `_bus` event `bim-lighting-updated` and never
   touches `storeEventBus`** (measured 2026-08-19). Anything subscribing to the semantic bus does
   not see lighting updates at all. A storey move that no semantic subscriber hears cannot dirty
   the plan views it needs to.
2. `elementUndoStoreAdapter` routes a `levelId` inverse patch **only** when
   `typeof store.changeLevel === 'function'`. Without the method, Ctrl+Z takes the generic branch.

> ⚠ **UNRESOLVED AND DECLARED:** `LightingTypes.ts` carries an optional **`hostId`**. A light
> hosted on a ceiling arguably has no independent storey — the C15 §2 argument, one family over. This
> contract does **not** settle it. If hosted lights must refuse, that refusal belongs in
> `LEVEL_CHANGE_REFUSALS` with the clause that decides it, not in an unstated assumption here.

### THE FOUR-PART CHAIN, AND WHY ALL FOUR ARE THIS CONTRACT'S BUSINESS

A level change is not one write. Omit any part and the command reports success over a void:

1. **the bus verb** — rewrites `levelId` in the plugin DTO store and produces the patch pair;
2. **the legacy mirror** — moves the record the renderer, plan view, persistence and IFC export
   actually read (§2 THE AUTHORITY). Skip this and you have L-946: *"the command succeeded, the
   plugin store was right, and the layer the user experiences kept its own unchanged copy"*;
3. **spatial re-registration** — `bimManager.registerElement` (exclusive-containment, so
   re-registering IS the move) and the view-dependency element→level map;
4. **both storeys re-project** — the one being LEFT as well as the one being joined. Dirty only the
   destination and the source storey's plan view keeps drawing an element that has gone.

### ⚠ THE CAP ON THIS FEATURE — L-1085, OPEN

`canExecute` validates the element's existence against the **plugin DTO store**, and
[C84 EI-5a](C84-ELEMENT-INTEGRITY.md) records that *"after any project load, every plugin DTO store
is EMPTY."* So the control works on elements authored **in the current session** and **refuses, by
name, on anything restored from a saved project**. The refusal is C16 CA-18 conformant and is
strictly better than the alternative — relaxing the check would make the forward move work while
producing an empty inverse patch, i.e. an authoritative mutation with no Ctrl+Z (C84 EI-7). **The
real fix is ADR-0331 §D2/§D3 and is not per-family.** Do not work around it here.

### DUPLICATE-TO-LEVEL

A **separate verb**, never a flag on the level change: it mints new ids and must not collide with
the source. Its per-family disposition is declared alongside the copy-payload mapping in
`apps/editor/src/engine/views/plantools/`, which is the one place a legacy record is translated into
a create payload — L-978 is what a second copy of that mapping costs (four field names the receiver
did not accept, so every copied curtain wall was minted at the schema's default origin, silently).

---

## RAC — the chat surface for this family (added 2026-08-19, lane RAC1)

> **Mandated by C84 §6**, measured against the **C67 §1.0 seven-verdict vector** (V1 RESOLVE ·
> V2 DISPATCH · V3 STATE · V4 PERSIST · V5 UNDO · V6 SYNC · V7 REPORT). Cross-family summary:
> **C84 §4F**. Capability surface: **C67 §1.8**. Decisions: **ADR-0334**. Rows: **L-1140 … L-1147**.
> ⛔ **No cell is left blank — a blank reads as "fine" (EI-1b). Unknown reads `NOT MEASURED`.**

### Status — **⛔ DARK — and it is READY**

| | Measured 2026-08-19 |
|---|---|
| **`element.changeType` tag(s)** | `lighting` · `light` · `lightfixture` |
| **Branch** | `apps/editor/src/engine/initBusHandlers.ts`:1991 |
| **Type catalogue** | ✅ `BUILT_IN_LIGHTING_TYPES` — **12** entries with `{id, name, mount}` (`packages/geometry-lighting/src/LightingTypeDefinitions.ts:54`) |
| **Type field on the record** | ✅ `fixtureType` (`LightingTypes.ts:201`) |
| **Executor the chat must use** | ✅ `element.changeType` `:1991` → `UpdateLightingParametersCommand`, ring-parity. ⭐ **It VALIDATES the id at `:2004`** and refuses an unknown one rather than writing it. |
| **Chat capabilities published TODAY** | ⛔ **NOTHING.** Lighting appears only in the probe set, and is deliberately **excluded** from `set-height` (`ChatCapabilityRegistry.ts:301`). |
| **Retiring condition** | Inject the 12-entry catalogue as `ctx.catalogues.lighting`. **Nothing else.** |

### Scoping — what a published capability for this family MUST accept

The founder's ask is *"BY LEVEL, BY ROOM, ETC"*. The shared grammar
(`makeHostedTypeParser`, `ZeroTokenResolver.ts:3340`) **already** captures `on level N` and
`in the <room>`, and `FilterScope.ts` lifts property/type predicates out before it runs — so
`all` · `selection` · `level` · `room` (· `orientation` where the family has a façade) are the
target, and **the work is the DECLARATION, not the reach** (L-1142).

| Scope | Target | AS-IS for this family |
|---|---|---|
| `all` | ✅ required | ⛔ no capability |
| `selection` | ✅ required | ⛔ no capability |
| `level` | ✅ required | ⛔ no capability |
| `room` | ✅ required | ⛔ no capability |
| **selection as a GEOMETRY SOURCE** | family-dependent | see C84 §4F.5 — selection **is** available to the RAC (`ResolverContext.selection`, non-optional, id **and** kind, rebuilt every message); `create-wall` is the one capability that declares no subject axis |

### Findings

- ⭐ **Lighting has the STRONGEST executor of any dark family and the WEAKEST chat surface — literally zero capabilities.** Its branch already refuses an unknown `fixtureType` by name (`:2004`), which is the exact discipline `resolveCatalogueRef` provides on the chat side; the comment there warns that an unvalidated id makes `LightingFragmentBuilder` *"render nothing, silently"*.
- ⚠ **Carried from C84 §4 — this family's persistence is the risk, not its dispatch.** C84's AS-IS table records lighting as *"renders, never saves · 10 fields dropped · EI-3 10-of-12 · DTO orphaned"*. ⚠ **Two of those four are now STALE and C84's row should be re-measured**: `EI-3 10-of-12` is **CLOSED** (L-1331, §9.1) and the authored-params drop is **CLOSED** (§PERSIST-LIGHTING-PARAMS + L-1330's round-trip through `ImportProjectCommand`). ⛔ **A chat type-change published here would be V3-true and V4-false**: the user would see the fixture change and lose it on reload. **That must be measured BEFORE publication, not after** — C16 CA-21, ADR-0334's proof requirement.
- **NOT MEASURED**: whether `fixtureType` specifically survives save/load. **This is the gating measurement for this family.**

### NOT MEASURED for this family (explicit — EI-1b)

- **No utterance was typed into a live editor.** Every verdict above is source-measured.
- **V6 SYNC** — inherited FAIL from C67 §1.0 (the CRDT read-back leg does not exist; the transport
  defaults OFF). **Not re-derived here**, and not a defect of this family.
- **V3 / V4 / V5 under a CHAT driver** — where this family is dark, they cannot be measured through
  chat at all; where it is published, they are measured only as C67 §1.0 records. ⛔ **The panel's
  passing is NOT transferable evidence** (ADR-0334): publication requires an **executed read-back**
  of this family's geometry store (C16 CA-21), never a `success: true`.

---

## §FEAT-LOD200-LUMINAIRES — the twenty LOD-200 families (added 2026-08-19, lane LIGHT1, **L-1330**)

### The founder ask, and the measurement that had to come first

> *"Can you create 20 more LOD 200 lighting fixtures? All with LUMEN values. All kinds.
> Architecturally sound?"*

⭐ **THE QUESTION THAT DECIDED WHETHER THIS WAS A DATA FEATURE OR A RENDERING ONE:
does anything actually READ a lumen value? Measured before a line was written.**

**ANSWER: YES on the RENDER path. NO on every ANALYSIS path.** Both halves are load-bearing and
neither may be quoted without the other.

| Consumer | Reads lumens? | Evidence |
|---|---|---|
| `LightingFragmentBuilder._attachLight` | ✅ **YES** | `:1244-1250` — `sceneIntensityFor(photometryForFixture(t))` → `PointLight.intensity`; `kelvinToHex(photo.kelvin)` → colour; `photo.reachM` → `distance` |
| `LightingFragmentBuilder._syncLens` | ✅ **YES** | `:1199` — `lensEmissiveFor(photometryForFixture(t))` drives the emissive lens |
| `LampBuilder` / `BedEngine` (furniture lamps) | ✅ **YES** | `LampBuilder.ts:44-57`, `BedEngine.ts:737-750` |
| `geometry-kernel/producers/lighting.ts` | ✅ **YES** | `:94-98` — lumens@kelvin is part of the **material key**, so two fixtures differing only in lumens get different materials |
| **`pryzmLightAllRooms()` / D-LE lighting engine** | ⛔ **NO** | `workflows/lightingLayout/archetypes.ts` — placement is **occupancy + a coarse area bucket**, first-fit on `minAreaM2`. Zero lumen, lux or illuminance reads in the whole directory. |
| **`pryzmComputeDaylight()`** | ⛔ **NO** | `workflows/daylight/daylightAnalysis.ts:52` — natural light only, and its own header says it is *"a defensible RELATIVE metric"*, **not absolute lux** |
| **`pryzmComputeSunHours()` / `@pryzm/solar-analysis`** | ⛔ **NO** | solar geometry only; no artificial-light term exists in the package |

**What this means, stated so it cannot be over-claimed:**

- ✅ **The numbers are REAL, not metadata.** A lumen value changes what the user sees: it sets the
  `PointLight` intensity through a documented candela conversion, and it sets the lens emissive.
  A wrong number is a visibly wrong render, which is why the efficacy band below is a build gate
  rather than a comment.
- ⛔ **No lighting-DESIGN calculation consumes them.** There is **no illuminance (lux) calculation
  anywhere in this repository** — no working-plane grid, no lumen-method estimate, no
  EN 12464-1 task-level check, no uniformity or UGR. **The D-LE engine that auto-fires on
  `furnish.layout-executed` places ONE fixture per room by occupancy and area and never asks how
  bright it is.** A 22 000 lm high bay and a 60 lm exit sign are placed by the identical rule.
- ⛔ Therefore: *"PRYZM computes lighting levels"* is **FALSE** and must not be written anywhere.
  The correct claim is *"PRYZM renders photometrically-derived fixture brightness."*

⭐ **This is the answer to "authored but unwired": the lumens are WIRED — to the renderer. The
DESIGN consumer is the thing that does not exist.** Naming which half is which is the deliverable.

### What existed before

**12** fixture families (`LightingFixtureType`), spelled out in **four** places per family — the
union (×3 duplicate files, §9.2), a `*_DEFAULTS` const, a `LIGHTING_FIXTURE_PHOTOMETRY` row and a
`BUILT_IN_LIGHTING_TYPES` row — and almost all of them decorative residential pieces: six pendants,
three floor lamps, a table lamp, a vanity strip, one surface canister. **The catalogue could not
describe a single recessed fixture, and had no panel, no track, no cove, no exterior fixture and no
life-safety fixture at all.**

Fields carried per family: `lumens`, `kelvin`, `beamAngleDeg`, `reachM`, `mount`, `form`,
`suspended?`. **No wattage, no CRI, no IP rating** — so efficacy, the one arithmetic check that
falsifies a bad photometric set, could not even be computed.

### What was added

**Twenty families, derived from ONE matrix** — `packages/core-app-model/src/lighting/Lod200FixtureCatalogue.ts`.

A row authors only what cannot be computed (`id · name · use · archetype · mount · face ·
location · lumens · watts · kelvin · cri · beamAngleDeg · ipRating · bodyMaterialId · dimensions`).
Everything else is DERIVED:

| Derived | From | Rule |
|---|---|---|
| `reachM` | `lumens` | `√(lm / 4π·E_min)`, `E_min = 2 lx`, clamped `[2.5, 9]`, rounded to 0.5 m |
| `form` (`point`/`linear`) | face dimensions | long ≥ 3 × short ⇒ `linear` |
| `suspended` | `dropMm` | `dropMm > 0` |
| `efficacyLmPerW` | `lumens / watts` | — |
| `efficacyClass` | archetype + duty + size + output | ordered: duty → decorative → miniature → architectural |
| minimum IP | `location` | interior 20 · wet 44 · exterior 65 |
| floor-seating | `mount === 'floor'` | feeds `FLOOR_MOUNTED_FIXTURES` |
| `LightingKind` construction form | photometry | the pre-existing `constructionFormFor()`, unchanged |
| the photometry rows | the matrix | `photometryRowsForLod200()`, spread into `LIGHTING_FIXTURE_PHOTOMETRY` |
| the type-picker rows | the matrix | `lod200TypeDefinitionRows()`, spread into `BUILT_IN_LIGHTING_TYPES` |
| the 3-D mass | `archetype` + dims | eight generic builders in `LightingFragmentBuilder` |

⭐ **Adding a twenty-first luminaire is ONE ROW and zero lines anywhere else.** It cannot arrive
missing a field because there are no other fields to miss — and because
`LightingFixtureType` is itself widened by `Lod200FixtureId` (a union derived from the row array),
a row without photometry is a **compile error**, not a runtime surprise.

**The twenty:** `recessed_downlight` · `adjustable_downlight` · `wall_washer_recessed` ·
`recessed_linear` · `troffer_panel` · `surface_linear` · `linear_pendant` · `surface_ceiling_disc` ·
`cove_indirect` · `undercabinet_strip` · `track_head` · `high_bay` · `wall_sconce_up_down` ·
`chandelier_decorative` · `emergency_downlight` · `exit_sign` · `step_marker_light` ·
`bollard_light` · `exterior_wall_pack` · `flood_spot`.

**Deliberately EXCLUDED, with reasons** (⛔ never re-add without reading these):

- **Pendants, floor lamps, table lamps, vanity strips** — already in the catalogue. A LOD-200
  duplicate would be a rival row for one fixture, the exact drift this file prevents.
- **Track RUN** (as distinct from `track_head`) — an ASSEMBLY: a track extrusion of user-chosen
  length carrying N heads at user-chosen positions. **No layer in this repo composes multi-part
  luminaire assemblies**, and the placement tool has no length parameter. **NOT YET.**
- **Pool/immersion lights, in-ground uplights, gobo projectors, fibre-optic, neon-flex, tape light
  by the metre** — their defining parameter (immersion depth, run length per metre) has no schema
  field. **NOT YET.**

### Architecturally sound — what is asserted, and by what

`Lod200FixtureCatalogue.test.ts` (28 tests) + `FixtureEmission.test.ts` + `FixturePhotometry.test.ts`.

- ⭐ **ARM A — every shipped type resolves its `materialId` against the LIVE `MATERIAL_CATALOG`.**
  The real catalogue is imported, never a stub — *a fake built from the same header cannot falsify
  the header* — and the suite additionally asserts the catalogue under test IS the real one
  (`length > 100`, a known id present) so the substitution cannot happen silently.
- ⭐ **ARM B — every type lands in a plausible lm/W band for its DERIVED class**
  (architectural 65–170 · decorative 30–110 · miniature 30–95 · signalling 8–50). A dedicated test
  proves the band **rejects** a 6 W / 3000 lm downlight (500 lm/W). The class is derived, so a row
  cannot select the lenient band for its own numbers.
- CCT ∈ [2200, 6500] K · CRI ∈ [70, 100] · beam ∈ (0, 360]. Asserted **relationally** where the
  axis carries meaning: the accent `track_head` must out-render the service `exterior_wall_pack` on
  CRI, and `adjustable_downlight` must be narrower than `wall_washer_recessed` on beam — *a spot and
  a wall washer differ by exactly that field*, so a copied-across value would collapse two rows into
  one.
- IP ≥ the location minimum. **An IP20 bollard is the named defect this arm catches.**
- Mount ↔ seating coherence, checked against the set the tool actually reads.

### ⛔ Capabilities NOT claimed

- ⛔ **NO IES / photometric data file.** No field, no loader, no such capability anywhere in this
  repository. A beam angle and a lumen output are the LOD-200 photometric facts; an IES distribution
  is LOD 350+. Claiming one would be a capability that does not exist.
- ⛔ **NO UGR/glare rating, maintenance factor, lamp-lumen depreciation, driver/dimming protocol,
  circuit, or emergency-battery duration.** **NOT YET** — the schema has no field for any of them.
- ⚠ **NO COMPLIANCE EVALUATION.** EN 1838, EN 12464-1, ISO 7010 and IEC 60529 are cited in the
  source as the reason numbers were chosen; **nothing evaluates them.** Consistent with the measured
  finding that **no layer in this repo evaluates a guard or code rule for any element family**
  (2026-08-19), the efficacy and IP bounds ship as **ADVISORY**, with that measurement stated at the
  point of use. ⛔ A passing test is **not** conformance and must never be reported as such.
- The exit sign draws a **luminous panel, not the ISO 7010 pictogram** — there is no texture/decal
  path for fixtures in this builder, and a blank panel is honest where a fake glyph would not be.

### Materials — zero minted

Every row names an **existing** `MATERIAL_CATALOG` id (C100/C84 §1.1); the test asserts the minted
set is `[]`. Colour **and** metalness/roughness are resolved from the master row, so a luminaire body
cannot drift from the material it claims to be made of.

⛔ **No row carries a hex colour, and there is deliberately no colour field on `Lod200FixtureRow`.**
A hand-typed hex resolves BEFORE the material id in every builder here, which makes the material a
silent no-op that the UI still reports as applied (C100 §2.1). A test scans every string field on
every row for anything hex-shaped. An id that resolves to nothing renders the **C100 §5 magenta
marker** — a lost material must never look like a finish.

**Per-instance materials added: ZERO.** All eight archetypes draw from the module-level `sharedMat` /
`sharedLensMat` pools, including the high bay, which takes a double-sided variant **from the pool**
rather than cloning (a `.copy()` there would mint one material per fixture — the defect that cost
this project its instancing once).

### Persistence — ONE new key, through the DEFAULT-ON path

`LightingData` gains **one** optional block, `lod200Params` (`lengthMm · widthMm · depthMm · dropMm ·
tiltDeg · armCount · bodyMaterialId`), and `LIGHTING_AUTHORED_PARAM_KEYS` gains **one** entry.

⭐ **Twenty families, one key — deliberately.** The twelve named families each brought their own
`*Params` block, which is why the loader could drop one (§PERSIST-LIGHTING-PARAMS). Twenty more
blocks would have been twenty more chances to repeat it. At LOD 200 the catalogue row **is** the
specification, so the only per-instance state is a generic size/drop/aim override.

⚠ **Round-tripped through `ImportProjectCommand` — the DEFAULT-ON restore path**, via the real
exported `buildLightingRestorePayload` its Step 10b calls. The legacy `ProjectLoader` arm and the
`persistence-client` copy are the dead twins and are **not** exercised. Five save/load holes were
found in one week, one of them because a family's fields were dropped by the default path while the
control tested the twin. Asserted: all twenty round-trip by `fixtureType`; every override survives
by **value** (a 2.4 m brass pendant must not reopen 1.5 m and white); absence stays absence.

The old control's hand-copied 13-key list — a **rival** list that could not have noticed a
fourteenth key — now imports the production one.

### ⚠ Two invariants were RE-SCOPED, and that is a finding, not an accommodation

*"Every fixture family is at least 2× the legacy flat intensity"* and *"every fixture dominates the
scene ambient floor at 2.5 m"* were true **only while every family was a room light of ≥ 450 lm**.
The LOD-200 set introduces the first fixtures whose **purpose is to be dim**: a maintained emergency
downlight (180 lm), an exit sign (60 lm) and a 2 W step marker (90 lm). **EN 1838 asks for on the
order of 1 lx on an escape-route centre line** — an emergency luminaire bright enough to clear a
general-lighting floor would be the **defect**, not the fix.

Both invariants now bind over `isGeneralLightingFixture()` — **DERIVED** from the efficacy class,
never a lumen threshold chosen to make a test pass — and the excluded three get the assertion that
is actually true of them: **they emit, and they emit LESS than general lighting.** Both claims are
checked; neither was relaxed. A floor assertion guards the exclusion from swallowing the population.

### ✅ THE LIMIT THAT WAS — EI-3, inherited then CLOSED (L-1331)

The twenty initially inherited **C96 §9.1 / EI-3**: placement worked on the LIVE path and threw on
the PLAN path, moving the arithmetic from **10 of 12** to **30 of 32**. That gap is now **closed** —
see §9.1 above for the resolution and the measurement that chose exit (a).

| Path | Route | Twenty LOD-200 families |
|---|---|---|
| 3-D placement (`LightingTool`) | → `CreateLightingCommand` → `LightingStore` → builder | ✅ WORKS |
| Project reopen (`ImportProjectCommand`) | → `buildLightingRestorePayload` → `CreateLightingCommand` | ✅ WORKS (tested) |
| Plan placement (`LightingPlanToolHandler`) | → bus `lighting.create` → `Lighting.parse` | ✅ **NOW WORKS** (L-1331) |

⭐ **The fix was made at the layer that closes the class**, not at the call site: the LOD-200 matrix
moved to L0 so `LightingKind` could DERIVE its accepted set from the same array, rather than gaining
thirty hand-typed values that would reopen the gap at fixture 33. **Zero changes in `apps/editor`.**

### NOT YET — the honest register for this feature

| # | Gap | Why it is not "done" |
|---|---|---|
| 1 | **No illuminance calculation exists.** | There is no lux, working-plane or lumen-method layer anywhere. The lumens drive RENDER brightness only. ⛔ Never describe this as lighting analysis. |
| 2 | **D-LE does not read lumens.** | `pryzmLightAllRooms()` still places one fixture per room by occupancy + area. The twenty are available to it but it asks nothing about them. |
| 3 | ~~Plan-view placement throws (EI-3).~~ | ✅ **CLOSED — L-1331.** `LightingKind` now derives its accepted set from the matrix at L0. All 32 parse; unknown families still refused. |
| 4 | **No bespoke plan symbols.** | `LightingPlanSymbolRenderer` has a `default:` arm, so all twenty render a GENERIC symbol. They appear in plan; they are not distinguishable there. L-1332. |
| 5 | **Beam angle still does not narrow the PointLight.** | Pre-existing and documented (`FixturePhotometry` §Beam angle): every fixture is a `PointLight`. So `flood_spot` at 30° and `exterior_wall_pack` at 120° differ in LENS treatment, not in throw. A `SpotLight` upgrade would read `beamAngleDeg` directly. L-1333. |
| 6 | **`watts` / `cri` / `ipRating` are absent on the twelve named families.** | Optional by design: back-filling a wattage nobody measured would be inventing data. They stay **absent** rather than plausible. |
| 7 | **Three copies of `LightingTypes.ts` remain (§9.2).** | The union widens from ONE derived source and that source is now at **L0**, so schemas, core-app-model and geometry-lighting all read the same array — but the three `LightingTypes.ts` files still each carry the same one-line import. Not the single-declaration fix §9.2 asks for. |
