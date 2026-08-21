# THE MUTATION SPINE — COMMANDS, STORES, BUS (measured state)

> **Status:** MEASURED INVENTORY · **Lane:** AUD-2 · **Measured:** 2026-08-21 · **Method:** source only
> **Governance:** this is an inventory of measured state, NOT a `*-AUDIT.md` contract-derivative. It
> references `C03` (schemas/commands/state), `C16` (command authoring), `C66` (concurrency & scale),
> `C81`/`ADR-0121` (one gesture = one undo) and never redefines them. Defects are logged in
> `docs/04-reference/ISSUE-LOG.md` as **L-2400 … L-2419**.

> ⛔ **READ THE CODE, NOT THIS FILE.** Every number below is a command you can re-run. Where this
> document and the code disagree, **the code wins** — that is the whole reason this file records the
> command next to the number. Two of my own intermediate findings were **wrong** and are recorded as
> corrections in §2.3 and §6.1 rather than deleted, because the shape of the error is the lesson.

---

## 0. THE ONE-PARAGRAPH ANSWER TO THE FOUNDER'S QUESTION

> *"Are the stores robust? Are there any legacy stores, commands, API, builders?"*

**Yes, there is a large legacy surface, and it is REACHABLE — but that is not the top risk.** Five
things outrank it, and every one is a case of *success being reported for a write that did not land*:

1. **The undo half of the command spine cannot report failure.** 65 of 279 commands have an `undo()`
   that does real work and has no code path returning `success:false` — including `CompositeCommand`,
   the single entry a whole generated building collapses into. The manager decides whether to offer
   redo by reading exactly that boolean (`CommandManagerImpl.ts:913`) and pops the history entry
   *before* it asks (`:873`). §2.1–§2.2.
2. **`_cmExec` throws away the refusal the legacy layer already made.** The bus bridge helper
   declares `: void` (`initBusHandlers.ts:611`) and discards `CommandManagerImpl.execute()`'s result.
   **89 of 90 call sites use it.** The file's own comment states the defect verbatim. §11.1.
3. **73 of 78 bus bridges return empty undo patches** and are therefore never pushed to the ring
   buffer (`CommandBus.ts:577`). §11.
4. **170 of 288 command types have no remote-replay factory** and are dropped on a collaborator's
   machine with a `console.info` (`RemoteCommandDispatcher.ts:337`). Independently, **201 of 330 bus
   verbs are declared `not-synced`**. §2.7.
5. **Two proven new dead writes** — ceiling and curtain-wall material edits write keys their records
   do not declare; the mesh repaints, the user is told it applied, and it evaporates on reload. §10.2.

The "new" plugin-handler layer is **37 verbs that can only refuse** — honestly declared, but it means
production mutation still runs through the legacy L2 registry.

⭐ **Two independent measurements agree on that 37**: my own terminal-statement analysis of the
handler sources (§3.1, 35 + the 2 room verbs I missed) and the live gate
`tools/ga-gate/check-verb-register.ts` (§11.0, `REFUSES : 37`). Where this document has one number
from one method, it says so.

---

## 1. INVENTORY AND DENOMINATORS

Every figure re-runnable. Scripts used are throwaway scanners; the greps are the audit trail.

| Quantity | Value | How measured |
|---|---|---|
| Files in `packages/command-registry/src` | **333** `.ts` | `find packages/command-registry/src -name '*.ts' \| wc -l` → 334 incl. 1 `.d.ts` |
| Classes `implements Command` | **279** | AST-ish scan of `export class X … implements … Command` |
| `CommandType` enum members | **288** | `sed -n '/export enum CommandType/,/^}/p' packages/command-registry/src/types.ts \| grep -cE "^\s+[A-Z_0-9]+ *= *'"` |
| Plugin `CommandHandler` files | **48 plugins**, handlers under `plugins/*/src/handlers/` | `ls plugins/ \| wc -l` |
| Store files in `packages/stores/src` | **47** | `ls packages/stores/src/*.ts \| wc -l` |
| Bus verb dispositions declared for sync | **330** | `packages/sync-client/src/syncDisposition.ts` |

**The `Command` contract** is `packages/command-registry/src/types.ts:611-668`:
`id`, `type`, `timestamp`, `targetIds`, `affectedStores` (REQUIRED), optional `nonUndoable`,
optional `describe()`, and four methods — `canExecute`, `execute`, `undo`, `serialize`.

### 1.1 Contract conformance — 279 commands against their own interface

| Obligation | Conforming | Denominator | Non-conforming |
|---|---|---|---|
| `canExecute` present | 278 | 279 | `AddObjectCommand` — `UndoManager.ts:8` |
| `execute` present | 279 | 279 | — |
| `undo` present | 279 | 279 | — |
| `serialize` present | 278 | 279 | `AddObjectCommand` — `UndoManager.ts:8` |
| `affectedStores` declared non-empty | 278 | 279 | `AddObjectCommand` declares `[] as const` |
| `describe()` implemented | **0** | 279 | **all 279** — see §2.6 |

`AddObjectCommand` is the legacy THREE-scene command; it implements a *different*, 2-method `Command`
interface declared locally at `UndoManager.ts:3-6`. It is **SOUND as declared** (its `affectedStores
= []` comment is explicitly truthful) but it is a **second, incompatible `Command` type in the same
package under the same name** — see §5.

---

## 2. COMMANDS — the defect matrix

### 2.1 ⭐ DEFECT L-2400 — 65 of 279 `undo()` implementations CANNOT report failure

**Measured:** 65 commands have an `undo()` that performs a mutating call
(`.update/.remove/.add/.set/.delete/.restore/.create/.insert/.clear`) and whose body contains
`success: true` with **no `success: false` path and no conditional success expression at all**.

| Sub-class | Count | Denominator |
|---|---|---|
| `undo()` does work, can only return `success:true` | **65** | 279 |
| …of which loop over child commands' `undo()` | **31** | 65 |
| …of which **read `r.success` and then discard it** | **24** | 31 |

**Why the boolean is load-bearing.** `CommandManagerImpl.undo()`:

```
873:        const entry = this.history.pop();          // pops FIRST, unconditionally
...
911:                const result = entry.command.undo(this.context);
913:                if (result.success) {
914:                    this.redoStack.push(entry);
915:                }
```

A hard-coded `true` therefore *always* pushes to redo. And because the pop at :873 already happened,
a hard-coded `false` **destroys the entry from both stacks** — the press is consumed and the entry
can never be redone.

**Largest single instance:** `packages/command-registry/src/walls/DeleteElementCommand.ts:653` — a
**383-line** `undo()` restoring walls, slabs, columns, stairs and openings whose only terminal return
is `{ success: true, affectedElementIds: [this.elementId] }` at `:1034`. (It correctly *delegates*
for the slab/column/stair arms at `:852`, `:860`, `:1030`, so those propagate; the wall and opening
arms do not.)

**The 24 that inspect and discard are the sharpest**, because the author clearly knew the child could
fail. Canonical example, `walls/UpdateWallsSystemTypeBatchCommand.ts:333-344`:

```ts
    undo(ctx: CommandContext): CommandResult {
        const affected: string[] = [];
        for (let i = this.executedChildren.length - 1; i >= 0; i--) {
            const child = this.executedChildren[i];
            if (!child) continue;
            const r = child.undo(ctx);
            if (r.success) affected.push(...r.affectedElementIds);   // ← failure filtered out
        }
        return { success: true, affectedElementIds: affected };      // ← and never reported
    }
```

⭐ **This is the §WALL-FINISH-READBACK defect (L-1670) with the fix applied to only one half.** The
`execute()` side of this exact command is *exemplary* — `walls/UpdateWallsSystemTypeBatchCommand.ts:292-322`
computes `changed = affected.length` against `total = ids.length`, emits
`` `Changed ${changed} of ${total} walls` ``, groups skip reasons, sets three OTel attributes, and
returns `success: changed > 0`. **The hardening stopped at `execute()`.** The same asymmetry holds in
the slab (`:283`), ceiling (`:272`) and window (`:248`) siblings.

**User-visible consequence:** press Ctrl+Z after a batch retype; some walls silently do not revert;
the app offers Redo as though the undo had succeeded; the model and the history disagree from then on.

**Full list of the 31 child-undo aggregators** (all `packages/command-registry/src/`):
`walls/DeleteElementCommand.ts:653` · `levels/DuplicateFloorPlanCommand.ts:655` ·
`floors/CreateFloorCommand.ts:529` · `walls/CreateWallsOnAllSlabsCommand.ts:304` ·
`slabs/CreateSlabsOnAllFloorsCommand.ts:160` · `slabs/CreateSlabOnLevelSimilarToSelectedCommand.ts:103` ·
`generic/UpdateElementDimensionsBatchCommand.ts:323` · `walls/CreateWallOpeningsBatchCommand.ts:106` ·
`composite/CompositeCommand.ts:126` · `roomBoundingLines/CreateRoomBoundingLinesBatchCommand.ts:59` ·
`walls/UpdateWallsRakeBatchCommand.ts:304` · `doors/UpdateDoorsSystemTypeBatchCommand.ts:250` ·
`floors/SetFloorFinishCommand.ts:452` · `generic/DeleteElementsBatchCommand.ts:202` ·
`walls/AddWallLayerBatchCommand.ts:292` · `walls/SetWallSideFinishCommand.ts:451` ·
`walls/UpdateWallsColorBatchCommand.ts:226` · `walls/UpdateWallsSystemTypeBatchCommand.ts:333` ·
`windows/UpdateWindowsSystemTypeBatchCommand.ts:248` · `windows/CreateWindowsParametricBatchCommand.ts:357` ·
`ceilings/UpdateCeilingsSystemTypeBatchCommand.ts:272` · `slabs/CreateAllSlabsFromLevelToAllFloorsCommand.ts:143` ·
`slabs/CreateAllSlabsFromLevelToTopLevelCommand.ts:107` · `slabs/UpdateSlabsSystemTypeBatchCommand.ts:283` ·
`walls/CreateDoorsBetweenAdjacentRoomsCommand.ts:128` · `walls/CreateWindowsOnWallsCommand.ts:140` ·
`windows/CreateWindowInAllWindowsCommand.ts:84` · `ceilings/CreateCeilingsByRoomCommand.ts:126` ·
`floors/CreateFloorsByRoomTypeCommand.ts:415` · `handrails/CreateHandrailRunCommand.ts:214` ·
`lighting/CreateLightingByRoomCommand.ts:113`

---

### 2.2 ⭐ DEFECT L-2401 — `CompositeCommand` is the ONE-UNDO mechanism and it is unconditionally true in BOTH directions

`packages/command-registry/src/composite/CompositeCommand.ts`. This is the class
`CommandManagerImpl.endGenerationBatch()` (`:1143-1152`) wraps an entire building generation into as
**one** history entry (`§GEN-UNDO-COALESCE`, C16 §8.6).

```
104:    execute(ctx) {                                   // = REDO
110:            if (r && r.success === false) {
111:                console.warn(`[CompositeCommand:${this.label}] child redo returned failure:`, …);
112:            }
117:        return { success: true, affectedElementIds, info: [`Redid ${this.children.length} command(s) …`] };

126:    undo(ctx) {
131:                const r = child.undo(ctx);
132:                if (r?.affectedElementIds) affectedElementIds.push(...r.affectedElementIds);
133:            } catch (err) { console.warn(…'child undo threw (non-fatal):'…); }
137:        return { success: true, affectedElementIds, info: [`Undid ${this.children.length} command(s) …`] };
```

Three separate defects in twelve lines:
1. **`execute()`** reads `r.success === false`, logs it, and returns `true` anyway (`:110` → `:117`).
2. **`undo()` never reads `r.success` at all** — a child that returns `{success:false}` is
   indistinguishable from one that worked. A child that *throws* is caught and skipped (`:133`).
3. **Both `info` strings count `this.children.length`** — commands *attempted*, never commands that
   landed. This is the L-1670 count-vs-calls shape at the highest-leverage point in the product.

**User-visible consequence:** generate a building, press Ctrl+Z. If any child fails to revert, the
user is told the generation was undone, half the building remains, and Redo is offered for a state
that was never reached. Nothing surfaces but a `console.warn`.

**Cheapest credible fix:** thread the child outcomes — `success: failures === 0`, and change the
`info` string to `` `Undid ${undone} of ${this.children.length}` ``. ~6 lines, no signature change.
**Blast radius:** `CommandManagerImpl.undo():913` starts refusing to push genuinely-failed undos onto
the redo stack — which is the correct behaviour and is why this fix must ship with a test.

---

### 2.3 DEFECT L-2402 — `CreateMultipleLevelsCommand` is on the undo stack and its undo is a stub

`packages/command-registry/src/levels/CreateMultipleLevelsCommand.ts`:

```
84:    undo(_context: CommandContext): CommandResult {
85:        return { success: false, affectedElementIds: [], info: ["Undo not implemented for batch level creation"] };
86:    }
```

`nonUndoable` is **not declared** on the class (`:14-19` — `affectedStores`, `id`, `type`,
`timestamp`, `targetIds`, and nothing else), so `CommandManagerImpl.ts:493`
(`if (!command.nonUndoable && !isRemoteOrigin && !isLoad)`) **pushes it onto the history**. Ctrl+Z
then pops it (`:873`), gets `success:false`, does not push to redo (`:913`) — the entry is gone, the
levels remain, and the only trace is `console.log`.

⭐ **This is the mechanism behind the separately-reported "9 presses for 7 levels".** Each generated
level also runs `CreatePlanViewCommand` (`:64`) whose result is **not checked at all**, so plan-view
creation failures are invisible too.

**Same file, second defect — a reported count that is the REQUEST, not the RESULT:**

```
57:            if (result.success) {
58:                affectedIds.push(...result.affectedElementIds);   // failures skipped silently
...
80:            info: [`Successfully created ${this.payload.count} levels`, ...info]
```

`this.payload.count` is what the user *asked for*. If three of seven `AddLevelCommand.execute()`
calls fail, the command still reports *"Successfully created 7 levels"* and returns `success: true`.
**Fix:** report `affectedIds.length`, and set `success: affectedIds.length > 0`.

---

### 2.4 DEFECT L-2403 — `ClearProjectCommand.undo()` returns false and the class does not declare `nonUndoable`

`packages/command-registry/src/project/ClearProjectCommand.ts:288-291` returns
`{ success: false, …, info: ['ClearProject is not undoable'] }`. The class header (`:9-11`) asserts
*"ClearProjectCommand is intentionally NOT undoable. It is always issued as part of a
LoadProjectSnapshot sequence which replaces the history stack."*

**That is a hypothesis stated as a fact, and the class does not encode it.** `nonUndoable` is absent
from the declaration block (`:43-48`). The only thing keeping it off the history is the `isLoad`
arm of `CommandManagerImpl.ts:493`. If it is ever dispatched outside a load scope it lands on the
undo stack as an entry that eats a Ctrl+Z and reverts nothing — and, because it clears **ten** stores
(`affectedStores` at `:44`), that press is the user's only chance to recover.

**Fix:** `readonly nonUndoable = true;` — one line, and it makes the header comment true.
**UNMEASURED:** I did not trace every dispatcher of `CLEAR_PROJECT` to confirm the load scope always
holds; that is the check this fix removes the need for.

---

### 2.5 DEFECT L-2404 — commands that report an INPUT count as an OUTCOME

The `Update*SystemTypeBatch` family is the **correct** pattern (`changed of total` + grouped skip
reasons + `success: changed > 0`). These are the ones that still report the request:

| Site | Reported string | What the number actually is |
|---|---|---|
| `levels/CreateMultipleLevelsCommand.ts:80` | `Successfully created ${this.payload.count} levels` | the REQUESTED count (§2.3) |
| `composite/CompositeCommand.ts:117,137` | `Redid/Undid ${this.children.length} command(s)` | children ATTEMPTED (§2.2) |
| `slabs/UpdateAllSlabsCommand.ts:61` | `Updated ${this.targetIds.length} slabs` | `slabStore.update()` **CALLS** — the store method returns `void` (`packages/geometry-slab/src/SlabStore.ts:259-262`, `if (slab) { … }` with no `else`), so a call against a missing id is a silent no-op that still counts |
| `stair/UpdateStairFlightsCommand.ts:114` | `Updated ${this.flights.length} flights` | the INPUT payload length |
| `walls/CreateWindowsOnWallsCommand.ts:136` | `${affectedIds.length} window(s) across ${this.payload.wallIds.length} façade wall(s)` | first number honest; second is INPUT walls, not walls that received a window |
| `walls/CreateWallsOnAllSlabsCommand.ts:279` | `Created ${wallIds.length} walls across ${slabs.length} slabs` | same shape |
| `curtainwall/CreateCurtainWallsOnAllSlabsCommand.ts:666` | `Created ${allCreatedIds.length} curtain walls across ${slabs.length} slabs` | same shape |

⭐ **The general rule this repo keeps re-learning:** a store `update()` that returns `void` makes
call-counting the *only* thing a caller can do. The readback defect is not really in the command —
it is in the store method's signature.

---

### 2.6 DEFECT L-2405 — `describe()` is specified at length and implemented ZERO times

`packages/command-registry/src/types.ts:640-660` carries a **21-line rationale** for `describe?()`
(ADR-0341, C16 §5 `CA-22`), including an explicit argument for why a UI-side lookup table was
*rejected*: *"it degrades silently to the raw enum for every command added after it was written, and
nothing fails."*

**Measured: `describe()` is implemented by 0 of 279 commands.**

```
$ rg "^\s*(public\s+)?describe\s*\(\s*\)\s*:" --glob '**/*.ts'
apps\editor\src\ui\layout\GISAreaLayout.ts:95:    describe(): Record<string, unknown>;   ← unrelated interface
```

So the undo-history dropdown renders the **derived fallback for 100% of entries** — the very
"degrades silently to the raw enum" outcome the design note was written to avoid. The transform is
total so nothing is *unnamed*; but the whole reason `describe()` exists — *"only a command holds
'3.2 m'; a UI table never can"* — delivers nothing today. **This is a documentation/behaviour
mismatch, not a crash:** severity LOW, but it is exactly the class of defect this repo flags,
so it is logged.

---

### 2.7 ⭐ DEFECT L-2406 — 170 of 288 command types have NO remote-replay factory

`apps/editor/src/engine/CommandRegistry.ts` holds `REGISTRY`, a `Map<string, CommandFactory>`
(`:217`) with **119 entries**. `CommandRegistry.create()` (`:496-505`) returns `null` for anything
else, and `RemoteCommandDispatcher.ts:337-343` then does:

```ts
        if (!command) {
            console.info('[RemoteCommandDispatcher] No factory for type:', serialized.type, '— toast-only');
            return 'unknown-type';
        }
```

**The remote command is discarded. There is no user-facing error — a `console.info`.**

```
$ grep -cE "^\s*\['[A-Z_0-9]+'," apps/editor/src/engine/CommandRegistry.ts     → 119
$ (CommandType members)                                                        → 288
                                                                     MISSING   → 170
```

Not in the replay registry, among others: **`COMPOSITE`** (the whole-building generation entry),
`LOAD_PROJECT_SNAPSHOT`, `IMPORT_PROJECT`, `CLEAR_PROJECT`, **every** `*_SYSTEM_TYPE_BATCH`,
`DELETE_ELEMENTS_BATCH`, `UPDATE_WALLS_COLOR_BATCH`, `ADD_WALL_LAYER_BATCH`, `SET_WALL_SIDE_FINISH`,
`SET_FLOOR_FINISH`, all 8 `VG_*`, all 11 sheet commands, all 3 schedule commands, all 9 view-template
commands, all 6 visibility-intent commands, `DETECT_ALL_ROOMS`, `REDETECT_ROOMS`,
`APPLY_GENERATIVE_LAYOUT`, `JOIN_WALLS`, `CUT_WALL`, `MIRROR_ELEMENT`, `COPY_ELEMENT`,
`SCALE_ELEMENT`, `OFFSET_ELEMENT`, all 22 hierarchy/template/requirement commands.

⚠ **Stated precisely, because there are TWO sync paths and I measured both:**
this is the **legacy CommandType replay** path only. The bus path has its own register,
`packages/sync-client/src/syncDisposition.ts` (1100 lines, **330 verb dispositions**), and it reads:

```
$ grep -oE "kind:\s*'[a-z-]+'" packages/sync-client/src/syncDisposition.ts | sort | uniq -c
    201 kind: 'not-synced'
    129 kind: 'element-property'
```

**201 of 330 bus verbs are declared `not-synced`.** The two paths are independent measurements and
they agree in direction: **most of the mutation surface does not reach a collaborator.**
`syncDisposition.ts` is *honest* — it names each one with a reason — and that honesty is the reason
this is a scoping fact rather than a silent lie. But **C66's capacity claims must not describe
multi-user editing as supported on this evidence.**

**UNMEASURED:** I did not cross-join the 170 missing CommandTypes against the 330 bus dispositions to
produce a single per-family verdict. That join is the next measurement and it is cheap.

---

### 2.8 FINDING (SOUND, with one trap) — `affectedStores` and the snapshot scope

`affectedStores` drives scoped rollback (`CommandManagerImpl.ts:694-695`). Two commands compute it
dynamically in the constructor rather than hard-coding it — `generic/UpdateElementParameterCommand.ts:186`
(`readonly affectedStores: readonly StoreKey[]`, derived from the same descriptor row as the write,
so *"they cannot disagree"*) and `operations/CopyElementCommand.ts:72`. **Both are SOUND and are the
better pattern.**

**The trap (L-2407, LOW):** `CommandManagerImpl.ts:694`:

```ts
const scope = command.affectedStores && command.affectedStores.length > 0
    ? new Set(command.affectedStores)
    : null;               // null ⇒ snapshot ALL stores
```

An **empty** `affectedStores` means *"snapshot everything"* — the exact opposite of what an author
writing `[]` to mean *"I touch no stores"* intends. Only `AddObjectCommand` declares `[]` today and
it never reaches this manager, so this is **latent, not live**. It is logged because the honest
declaration is punished with the most expensive path.

---

## 3. DEAD AND REFUSING VERBS — the plugin handler layer

### 3.1 ⭐ 35 registered bus verbs whose `canExecute` unconditionally refuses

The founder's named example (`plugins/floor/src/handlers/SetFloorMaterial.ts:85`) is **not one dead
verb — it is one of thirty-five**, and the pattern was applied deliberately and family-wide
(`§FIX-DEAD-VERB-REFUSE`, `§FIX-DEAD-MOVE-VERB-REFUSE`, `§FIX-CREATE-LIVENESS-LIE`).

**Method:** for each handler, extract the `canExecute` body and test whether its *terminal executable
statement* is `return { valid: false, … }` — i.e. no input can reach a `valid: true`.

| Verb | Handler `canExecute` |
|---|---|
| `beam.move` | `plugins/beam/src/handlers/MoveBeam.ts:101` |
| `beam.setMaterial` | `plugins/beam/src/handlers/SetBeamMaterial.ts:98` |
| `ceiling.setMaterial` | `plugins/ceiling/src/handlers/SetCeilingMaterial.ts:65` |
| `column.move` | `plugins/column/src/handlers/MoveColumn.ts:105` |
| `column.setMaterial` | `plugins/column/src/handlers/SetColumnMaterial.ts:65` |
| `curtainwall.setMaterial` | `plugins/curtain-wall/src/handlers/SetCurtainWallMaterial.ts:67` |
| `dimension.move` | `plugins/dimensions/src/handlers/MoveDimension.ts:111` |
| `door.create` | `plugins/door/src/handlers/CreateDoor.ts:149` |
| `door.move` | `plugins/door/src/handlers/MoveDoor.ts:104` |
| `floor.setMaterial` | `plugins/floor/src/handlers/SetFloorMaterial.ts:64` |
| `furniture.move` | `plugins/furniture/src/handlers/MoveFurniture.ts:106` |
| `furniture.rotate` | `plugins/furniture/src/handlers/RotateFurniture.ts:109` |
| `furniture.setMaterial` | `plugins/furniture/src/handlers/SetFurnitureMaterial.ts:65` |
| `handrail.setMaterial` | `plugins/handrail/src/handlers/SetHandrailMaterial.ts:65` |
| `lighting.move` | `plugins/lighting/src/handlers/MoveLighting.ts:105` |
| `lighting.setMaterial` | `plugins/lighting/src/handlers/SetLightingMaterial.ts:65` |
| `plumbing.move` | `plugins/plumbing/src/handlers/MovePlumbing.ts:105` |
| `plumbing.setMaterial` | `plugins/plumbing/src/handlers/SetPlumbingMaterial.ts:65` |
| `roof.move` | `plugins/roof/src/handlers/MoveRoof.ts:103` |
| `roof.setMaterial` | `plugins/roof/src/handlers/SetRoofMaterial.ts:65` |
| `section.moveLine` | `plugins/section-view/src/handlers/MoveSectionLine.ts:104` |
| `slab.move` | `plugins/slab/src/handlers/MoveSlab.ts:108` |
| `slab.setMaterial` | `plugins/slab/src/handlers/SetSlabMaterial.ts:65` |
| `stair.rotate` | `plugins/stair/src/handlers/RotateStair.ts:94` |
| `stair.setMaterial` | `plugins/stair/src/handlers/SetStairMaterial.ts:65` |
| `structural.move` | `plugins/structural/src/handlers/MoveStructural.ts:105` |
| `structural.setMaterial` | `plugins/structural/src/handlers/SetStructuralMaterial.ts:59` |
| `wall.bulkSetVisuals` | `plugins/wall/src/handlers/BulkSetWallVisuals.ts:84` |
| `wall.move` | `plugins/wall/src/handlers/MoveWall.ts:110` |
| `wall.setColor` | `plugins/wall/src/handlers/SetWallColor.ts:75` |
| `wall.setDimensions` | `plugins/wall/src/handlers/SetWallDimensions.ts:77` |
| `wall.setLayers` | `plugins/wall/src/handlers/SetWallLayers.ts:123` |
| `wall.transform` | `plugins/wall/src/handlers/TransformWall.ts:375` |
| `window.create` | `plugins/window/src/handlers/CreateWindow.ts:93` |
| `window.move` | `plugins/window/src/handlers/MoveWindow.ts:103` |

**This is NOT a defect list.** Each refusal carries a named reason constant explaining that the
handler would write the detached plugin DTO store — *"A command that reports success while
authoritative state is unchanged is the worst failure mode in a BIM system"*
(`SetFloorMaterial.ts:38-41`). Refusing was chosen over retiring so that
`CapabilityRefusal`/`CHAT_UNAVAILABLE` keep naming a registered verb. **That reasoning is sound and
the honesty is real.**

**What it means for the founder's question:** the L6 plugin-handler layer — the *new* architecture —
**is not carrying production mutation for these 35 verbs.** Editing still runs through the legacy L2
`packages/command-registry`. That is the single largest piece of "legacy still in charge" in the
codebase, and it is structural, not accidental.

### 3.2 ⚠ CORRECTION — `wall.create` and `slab.create` are NOT dead, and my first scan said they were

My initial scanner reported **37** unconditional refusals. **Two were wrong**, and the way they were
wrong is worth recording. `plugins/wall/src/handlers/CreateWall.ts:126` contains

```ts
  return WALL_CREATE_UNREACHABLE;
```

which *looks* like a refusal but is the tail of a **three-valued runtime probe**,
`authoritativeWallStoreRefusal()` (`:114-127`): it returns `null` when no authoritative store is
registered, `null` when the store is registered *and engine-attached*, and the reason **only** when
registered-but-not-attached. In the browser `initBuilders.ts` calls `wallStore.attachEngine(...)`, so
`canExecute` reaches `return { valid: true }` at `CreateWall.ts:181`. `slab.create` has the same
probe (`plugins/slab/src/handlers/CreateSlab.ts:126`).

⭐ **The lesson is the brief's own rule turned on my own tooling: a pattern match is a hypothesis
until you read the enclosing function.** The corrected count is **35 dead + 2 probe-gated**.

**Latent risk worth naming (L-2408, MEDIUM):** the create verbs were hardened **asymmetrically**.
`wall.create` and `slab.create` got the three-valued probe; **`door.create` (`CreateDoor.ts:149`) and
`window.create` (`CreateWindow.ts:93`) got a flat unconditional refusal** with the identical
`§FIX-CREATE-LIVENESS-LIE` tag. Whatever makes the probe correct for walls and slabs was not applied
to doors and windows, and nothing records why.

### 3.3 ⭐ DEFECT L-2409 — the entire cross-element cascade layer is AUTHORED AND UNWIRED

`plugins/cross/src/slab-wall.ts:155-200` synthesises `wall.transform` cascade commands so that walls
pinned to a slab follow when the slab is moved, re-based or thickened. Its own comment (`:157-159`)
says: *"The wall plugin's TransformWallHandler accepts `{ wallId, kind:'move', delta }` per
plugins/wall/src/handlers/TransformWall.ts"* — **that claim is stale**; `TransformWall.ts:375`
unconditionally refuses (§3.1).

**But the cascade never runs at all.** Measured:

```
$ rg "registerCrossHandlers|new CascadeRunner" --glob '**/*.{ts,tsx}'
plugins\cross\src\index.ts:34            (export)
plugins\cross\src\handlers\index.ts:105  (definition)
plugins\cross\__tests__\handlers.test.ts:22,38,41,54,77,78,93,110   ← ALL CALLERS
packages\command-bus\__tests__\cascade*.test.ts                     ← ALL CascadeRunner instantiations
```

**`registerCrossHandlers` has ZERO production callers. `new CascadeRunner()` appears only in tests.**
The slab→wall, wall→room and stair→handrail cascades are fully written, fully tested, and never
wired into the composed runtime.

**User-visible consequence:** move a slab, change its base offset, or change its thickness — the
walls pinned to it **do not follow**. Same for room boundaries after a wall edit, and handrails after
a stair move. (The stair→handrail case is independently recorded in
`tools/rac-conformance/certification/gates/host-move-propagation-matrix.json:532` as
*"AUTHORED-BUT-UNWIRED, and the clearest case in the repo"*.)

**Cheapest credible fix is NOT to wire it** — wiring it would dispatch `wall.transform`, which
refuses. The honest first step is to make the gap *visible*: this layer should either be deleted or
carry a registered refusal, because right now the only signal is silence.

---

## 4. RIVAL MUTATION PATHS (P6 — commands are the only mutation path)

### 4.1 `CommandManagerImpl.getHistory()` — the documented escape

`packages/command-registry/src/CommandManagerImpl.ts:995-997` returns `[...this.history]` — a shallow
copy holding **live `Command` instances**. The class's own doc at `:135-145` states the hazard
verbatim: *"A caller that takes one can call `.execute(ctx)` or `.undo(ctx)` on it directly, out of
band, with no dispatcher, no snapshot and no history bookkeeping."* Safe alternatives exist and are
`Object.freeze`d — `getUndoHistoryView()` (`:1018`) and `getRedoHistoryView()` (`:1043`).

**Callers, measured:** exactly **one production caller** —
`packages/ai-host/src/AmbientIntelligence.ts:281,292`, which reads
`.getHistory().slice(-10).map(e => e.command?.constructor?.name)`. It reads constructor names only
and never invokes `.execute`/`.undo`, and it reaches the manager through `window`, not an import.
Every other caller is a test (10 files in `packages/command-registry/__tests__`, 2 in
`tools/rac-conformance`). **Verdict: the escape is real and documented; no production caller abuses
it today.** Logged as L-2410 (LOW, latent).

### 4.2 Other live-internal escapes of the same shape

| Site | Hands out | Guard |
|---|---|---|
| `packages/stores/src/LRUElementMap.ts:230` `asReadonlyMap()` | the live `_valueMap` | TypeScript only — own doc says *"the caller receives a live view"* |
| `packages/command-bus/src/CommandBus.ts:198` `get registry()` | the live handler `Map` | TypeScript only; a cast can re-bind or delete **any verb handler** |
| `packages/command-bus/src/CommandBus.ts:202` `get undo()` | the live undo ring buffer | none |
| `packages/geometry-wall/src/WallTool.ts:349` `getWallStore()` | the live `WallStore` | none — result is published at `apps/editor/src/engine/initTools.ts:1062` as `window.wallStore` |
| `packages/renderer/src/passes/Pipeline.ts:42` `get passes()` | the live pass array | TypeScript only |

### 4.3 ⭐ 57 live stores published on `window`

**Measured: 420 `window.<x> = …` assignment lines repo-wide, 405 outside tests/tooling, of which 57
are `window.<something>Store = <live store instance>`** — each an unguarded, unlogged,
undo-invisible write path onto committed model state. Concentrated in
`apps/editor/src/engine/initBuilders.ts` (**25**: `columnStore:290`, `curtainWallStore:330`,
`slabStore:344`, `ceilingStore:389`, `floorStore:420`, `roomStore:456`, `doorStore:538`,
`windowStore:539`, `wallStore:553`, `furnitureStore:760`, `lightingStore:866`, `stairStore:941`,
`beamStore:993`, `gridStore:1040`, … ), `initTools.ts` (**10**, several *re-assigning* stores already
set in `initBuilders.ts`), `initUI.ts` (**11**, including the two `@deprecated` Contract-25b stores
`window.viewTemplateStore:491` and `window.vgGovernanceStore:644`), `initDataPlatform.ts` (6).

**This dwarfs the P6 gate's tracked surface.** `tools/ga-gate/check-no-direct-store-writes.ts` passes
at a baseline of **37** direct UI writes; forced to threshold 0 it prints exactly those 37 (listed in
§7). The gate's own header (`:33-45`) concedes it is syntactic and only sees receivers *named*
`*Store`. **37 is a floor, not a census, and it does not count these 57 globals at all.**

### 4.4 The legacy `UndoManager` — a one-way sink that leaks

`packages/command-registry/src/UndoManager.ts` exports a module singleton
`export const undoManager = new UndoManager()` (`:53`) and `AddObjectCommand` (`:8`), both re-exported
from the package barrel (`packages/command-registry/src/index.ts:440`).

`apps/editor/src/engine/BimService.ts:28-30` says:

```
        // §OI-054 — undoManager field removed: undo()/redo() now delegate to the
        // single unified path (performUndoRedo.ts); the legacy UndoManager is no
        // longer referenced here.
```

**That claim is true for `BimService` and false for the app.** Measured — 3 production `add()` calls:
- `apps/editor/src/engine/initFurnitureInteraction.ts:42` — `undoManager.add(new AddObjectCommand(world.scene.three, box))`
- `apps/editor/src/engine/initFurnitureInteraction.ts:71` — same, for GLB furniture
- `apps/editor/src/engine/initUI.ts:2646` — `undoManager.add({execute,undo})` on the non-BIM `Object3D` delete path

Both files are on live paths (`engineLauncher.ts:110` imports `createAddFurniture`;
`engineLauncher.ts:18,1030` passes `undoManager` into `initUI`).

⭐ **There is no `undoManager.undo()` or `.redo()` call anywhere in the repository.** All four Ctrl+Z
entry points route to `performUndoRedo.ts` (`SaveUndoRedoHUD.ts:321,325`;
`NavigationAreaLayout.ts:154`; `DockingLayout.ts:55`; `ZeroTokenChatBridge.ts:1583,1597`).

**DEFECT L-2411 — two consequences, both from source:**
1. **Furniture placement and non-BIM deletes are silently NOT undoable.** They are pushed to a stack
   nothing pops.
2. **It is an unbounded retained-object leak.** `private history: Command[]` (`:25`) grows for the
   whole session; every entry holds a strong reference to a THREE `Object3D` that is never released.

**Cheapest credible fix:** route both call sites through the bus/command path, or — if that is a
larger job — have `UndoManager.add()` cap its history. **Blast radius:** furniture placement, GLB
import, `initUI` delete.

---

## 5. TWO INCOMPATIBLE `Command` TYPES IN ONE PACKAGE

`packages/command-registry` exports **two different things called `Command`**:
- `types.ts:611` — the 4-method contract (`canExecute`/`execute`/`undo`/`serialize`) used by all 279.
- `UndoManager.ts:3-6` — a local 2-method interface (`execute()`/`undo()`, **no context argument**).

`AddObjectCommand` implements the second. The barrel (`index.ts:440`) exports it alongside the first.
This is why `AddObjectCommand` appears as the sole violator in every row of §1.1 — it is not a
non-conforming command, it is a **different kind of object with a colliding name**. Logged as
**L-2412 (LOW)**: rename the local interface (e.g. `SceneCommand`) so the collision cannot mislead a
future author or a name-based gate. ⭐ This repo has already been burned by name-based gates
(`SYNC_COLOURS`/`SYNC_COLORS`); a duplicated *type* name is the same hazard one level up.

---

## 6. LEGACY INVENTORY — what is still REACHABLE from production

Reachability = an import/construction/registration edge from a production entry point. **No runtime
execution was performed.**

**Denominators:** `@deprecated` → **100 occurrences / 50 files**. `legacy|LEGACY|Legacy` →
**4259 hits / 1197 files**; excluding tests/tools/scripts/docs → **3050 hits / 833 production files**.
Files/dirs with `legacy` in the NAME (excl. `node_modules`) → **23**.

| # | Artefact | file:line | Reachable? | Production caller |
|---|---|---|---|---|
| 1 | `CommandManagerImpl` — the legacy dispatcher | `CommandManagerImpl.ts:99` `@deprecated TODO(E-finish.3)` | **YES, massively** | 57 non-comment `commandManager.execute(` sites; 130 executable `window.commandManager` refs |
| 2 | `UndoManager` + singleton | `UndoManager.ts:24,53` | **YES for `add()`, dead for `undo()`** | §4.4 |
| 3 | `AddObjectCommand` | `UndoManager.ts:8` | **YES** | the same 2 furniture sites |
| 4 | `WallOpeningLegacyAdapterHandler` | `plugins/wall/src/handlers/CreateWallOpeningLegacyAdapter.ts` | **YES — registered on the bus** | `plugins/wall/src/handlers/index.ts:19,137` |
| 5 | legacy `WallTool` | `packages/geometry-wall/src/WallTool.ts:94` `@deprecated TODO(E.1)` | **YES — constructed at boot** | `initTools.ts:837`; store published `initTools.ts:1062` |
| 6 | legacy `SlabTool` | `packages/geometry-slab/src/SlabTool.ts:80` `@deprecated TODO(E.2)` | **YES — constructed at boot** | `initTools.ts:548` |
| 7 | `UnifiedFrameLoop` — "PRYZM 1 leftover", **rival of the P3 frame scheduler** | `packages/core-app-model/src/rendering/UnifiedFrameLoop.ts:622` | **YES** | `initBatchLifecycle.ts:3,48,78`; `ViewTechnicalDrawingCache.ts:26`; `ViewDependencyTracker.ts:35` |
| 8 | `vgGovernanceStore` (Contract-25b) | `packages/visibility/src/legacyGovernanceStore.ts:8` | **YES — and on `window`** | `initUI.ts:637,644` |
| 9 | `VGGovernanceStore` (**second copy**) | `packages/core-app-model/src/presentation/VGGovernanceStore.ts:24` | **YES** | `PlanViewCanvas.ts:48`; `VisibilityRuleEngine.ts:41`; `VGSceneApplicator.ts:40` |
| 10 | `VGSceneApplicator` | `.../VGSceneApplicator.ts:45` | **YES — boot** | `initUI.ts:638-643` |
| 11 | `viewTemplateStore` (`@deprecated readable`) | `packages/core-app-model/src/views/ViewTemplateStore.ts:4` | **YES — and still WRITABLE** | `{Create,Update,Delete}ViewTemplateCommand.ts`; `window.viewTemplateStore` at `initUI.ts:491` |
| 12 | `RoomsPluginStore` "⚠ DEPRECATED SHIM … zero readers and zero writers" | `plugins/rooms/src/store.ts:1,49,81` | **YES — contributed as bus store `'rooms'`** | `plugins/rooms/src/index.ts:13-17` |
| 13 | `plugins/rooms/.../legacyCommands.ts` seam | `§ROOM-ONE-LEGACY-SEAM` | **YES — 11 production handlers** | `CreateRoom.ts:80`, `DeleteRoom.ts:24`, `MoveRoom.ts:29`, +9 |
| 14 | `plugins/annotations/src/legacy-command-protocol.ts` — inline copy of the Command protocol | file header | **YES — 10 annotation command classes** | re-exported `plugins/annotations/src/index.ts:221` |
| 15 | `ProjectRepository` (+Local repos) | `apps/editor/src/ui/platform/ProjectRepository.ts:641,818,921,1515` `@deprecated` | **YES — 5 importers** | `ProjectHub.ts:26`, `PlatformRouter.ts:42`, `PlatformShell.ts:43`, `PlatformSaveController.ts:19`, `PlatformVersionController.ts:18` |
| 16 | `SaveOrchestrator` / `ServerSyncQueue` | `SaveOrchestrator.ts:84`, `ServerSyncQueue.ts:221` `@deprecated` | **YES** | `PlatformSaveController.ts:29,30` |
| 17 | `PropertyInspectorApply` `@deprecated … direct store writes` | `apps/editor/src/ui/property-inspector/PropertyInspectorApply.ts:93,137` | **YES** | `apps/editor/src/ui/PropertyInspector.ts:14` |
| 18 | `WallRegionExtractor` | `packages/ai-host/src/WallRegionExtractor.ts:4,85` `@deprecated` | **YES** | `AIService.ts:45,312` |
| 19 | `packages/legacy-shim` | `packages/legacy-shim/package.json` | **NO — by design** (fixture-only) | consumed only by `tools/scripts/check-lint-fixtures.mjs:40` |

### 6.1 ⭐ DEFECT L-2413 — `apiFetch` exists THREE times, DIVERGED, and the timeout fix landed in the copy the app does NOT use

| Copy | LOC | Production importers | Request timeout? |
|---|---|---|---|
| `packages/core-app-model/src/apiFetch.ts` | 66 | **~20 sites** — `initUI.ts:41`, `initCollaboration.ts:45`, `engineLauncher.ts:64`, `ServerSyncQueue.ts:26`, `ProjectHub.ts:40`, `PlatformShell.ts:47`, `thumbnailUpload.ts:27`, `ProjectRepository.ts:27`, … | **NO** |
| `packages/persistence-client/src/apiFetch.ts` | 103 | **1** — `command-registry/src/annotations/AnnotateViewCommand.ts:17,241` | **YES** — 30 s `AbortController` + `NetworkTimeoutError` |
| `packages/protocol/src/apiFetch.ts` | 68 | **none found** | NO |

The persistence-client copy documents the fix at `:55-61`: *"§H14 (audit) — default request timeout.
Without this every apiFetch caller (project load, catch-up replay, visibility-intent sync, etc.) hung
indefinitely on a stalled server connection, leaving the UI permanently 'loading' with no feedback."*

⭐ **The fix is in the one copy almost nothing imports.** Project load, collaboration catch-up,
visibility-intent sync, thumbnail upload and `ServerSyncQueue` all use the **untimed 66-line copy** —
i.e. the exact callers the fix note names. A **fourth**, local `apiFetch` is defined inside
`packages/ai-host/src/rooms/RoomAIAssistant.ts:38`. Two clients hit the same endpoint with different
timeout behaviour: `/api/anthropic/v1/messages` via `AIElementFactory.ts:436` (untimed) and via
`AnnotateViewCommand.ts:241` (30 s).

**User-visible consequence:** a stalled server connection leaves the editor permanently "loading"
with no feedback — the precise symptom the H14 note says was fixed.
**Cheapest credible fix:** re-export the persistence-client implementation from `core-app-model`, or
port the 40-line `AbortController` block. **Blast radius:** every network call in the editor — needs
a deliberate timeout value and a test, but it is a small, contained change.

### 6.2 DEFECT L-2414 — three rival project-restore paths, two reachable

1. `packages/persistence-client/src/loader/ProjectLoader.ts` (1633 L) — **no production importer**;
   not exported from `loader/index.ts`.
2. `apps/editor/src/engine/persistence/ProjectLoader.ts` (2853 L) — **the legacy path, still
   reachable**: imported at `initPersistence.ts:43`, taken whenever `_useImportCommandPath()`
   (`:2794`) is false, i.e. when `localStorage['PRYZM_USE_IMPORT_COMMAND']` /
   `VITE_PRYZM_USE_IMPORT_COMMAND` is falsy.
3. `packages/command-registry/src/project/ImportProjectCommand.ts` — the default path.

Six files are duplicated between `apps/editor/src/engine/persistence/` and
`packages/persistence-client/src/loader/`. Measured by `cmp`: `ProjectLoader` **DIVERGED**
(2853 vs 1633 L) · `ProjectSerializer` **DIVERGED** (1561 vs 986) · `SnapshotStreaming` **DIVERGED**
(425 vs 398) · `MigrationEngine` IDENTICAL (289) · `GeometryCacheStore` IDENTICAL (330) ·
`ViewTemplateToIntentMigration` IDENTICAL (252). The `apps/editor` loader's own header (`:165-177`)
says one rule now exists in **three** copies and closes: *"Three copies of one rule is itself the
C11 §5.4 defect … If you edit one, edit all three."*

### 6.3 Legacy API surface — measured CLEAN

`server.js` declares **72** `app.<verb>('/api…')` routes. A case-insensitive sweep for
`legacy|deprecated|no longer|superseded|back-compat|alias|old path|kept for` returns **6 hits and not
one is a route marked legacy or deprecated** — they are a CommonJS note (`:110`), a decommissioned
model id with a loud-fail guard (`:131,141`), a Node-14 note (`:217`), the `ANTHROPIC_API_KEY`
fallback (`:1008`), and `/api/auth/me` described as *"kept as a thin alias"* (`:1989`) — an
intentional alias, not dead. Same sweep over `server/**` returns backwards-compatible **data**
handling only. **No legacy or deprecated route is mounted.** This is the one part of the domain that
came back clean.

**UNMEASURED:** I did not diff the 72 route declarations against client call sites, so *"mounted but
nothing calls it"* is unanswered.

---

## 7. THE P6 DIRECT-STORE-WRITE SURFACE

`tools/ga-gate/check-no-direct-store-writes.ts` passes at a baseline of **37**. Forced to threshold 0
(env override only, no file changed):

```
$ PRYZM_P6_MAX_WRITES=0 npx tsx tools/ga-gate/check-no-direct-store-writes.ts
[no-direct-store-writes] FAIL — 37 direct store write(s) from UI, baseline 0.
RC=3
```

The 37, by file: `ui/ai/AIPanel.ts` (4) · `ui/ai/ValidatePanel.ts` (6) · `ui/ai/AICreatePanel.ts` (1)
· `ui/ai/floorplan-import/Step6CommitView.ts` (2) · `ui/canvas/IntentPrompt.ts` (1) ·
`ui/dataworkbench/buckets/AuditBucket.ts` (1) · `ui/dataworkbench/buckets/MaterialsBucket.ts` (3) ·
`ui/geospatial/FormaSiteAnalysisControls.ts` (1) · `ui/import/DxfImportPanel.ts` (12) ·
`ui/SheetEditor/SheetEditorSidebar.ts` (4) · `ui/views/ViewHeaderButtons.ts` (2).

**Read this number with §4.3.** The gate sees 37 UI writes; it does not see the **57 live stores
published on `window`**, which give *any* code the same unguarded write.

---

## 10. STORES

### 10.0 ⚠ CORRECTION — "37 registered stores" is a CEILING assembled from two mechanisms

The bootstrap log is `apps/editor/src/engine/initStores.ts:136-139`, printing `storeRegistry.count()`
— a **runtime** value. Statically:

| Source | Keys |
|---|---|
| `initStores.ts:101-134` | **21 unconditional + 4 conditional = 25 max** (conditional: `stair-type` `:112`, `verticalCirculation` `:116`, `lift-type` `:117`, `lighting` `:127`) |
| `packages/core-app-model/src/**` — **module-load side effects**, not called by bootstrap | **12** (`ViewTemplateStore.ts:278`, `ViewDefinitionStore.ts:690`, `TitleBlockStore.ts:120`, `SheetStore.ts:422`, `ScheduleStore.ts:292`, `PhaseFilterStore.ts:298`, `UserMaterialStore.ts:208`, `RequirementStore.ts:207`, `AssetCatalogStore.ts:207`, `VisibilityIntentStore.ts:133`, `ViewIntentInstanceStore.ts:193`, `VGGovernanceStore.ts:675`) |
| `composeRuntime.ts:1554-1558` | 5 — **all duplicates** of initStores keys, 0 new |

**25 + 12 = 37 — matches the log, but drop the four optional stores and it is 33.** And it is not
"37 stores registered by initStores": **12 of the 37 arrive as import side-effects** and would be
present even if `registerAllStores()` never ran. `initStores.ts:4` and `:95` both say *"all 21
element stores"* while the function can register 25 — **stale comment, L-2415**.
**UNMEASURED:** `composeRuntime.ts:1577` registers under a *dynamic* key, invisible to grep.

### 10.1 ⭐ CORRECTION — `ElementStore`'s LRU bound is real, and it has ZERO instances

The brief's hypothesis was that `ElementStore.getState()` is LRU-bounded at 50 000 while typing as
`ReadonlyMap`, and that its consumers silently truncate. **The type defect is REAL. The consumer
matrix is EMPTY.**

Verified lines: cap `packages/stores/src/ElementStore.ts:141` (`capacity: options.capacity ?? 50_000`)
· eviction `packages/stores/src/LRUElementMap.ts:170-172`, `_valueMap.delete(evictKey)` `:306` ·
signature `ElementStore.ts:163` `getState(): ReadonlyMap<Id, T>` → `LRUElementMap.asReadonlyMap()`
`:230-232` returning the raw map · honest comment `:157-159` *"Elements evicted to IndexedDB are NOT
present here."* (`size()` `:168` is documented honestly; **the type is not**.) Already logged as
**L-2132** and ADR-0343 §C.3.2/§D.4.

| Metric | Value |
|---|---|
| **Production `new ElementStore(` sites** | **0** |
| Test instantiations | 2 — `packages/stores/__tests__/ElementStore.test.ts:91,195` |
| **Production callers of the bounded `getState()`** | **0 of 0** |
| Classified | **2 of 2**, both tests → neither user-visible |

What production actually uses is the **unbounded base**: `packages/stores/src/Store.ts:50`
(`protected readonly state = new Map<Id, T>()`), `getState()` `:63` — no cap, no eviction. All 22
plugin DTO stores extend it. **107 `.getState()` production call sites; none on the bounded class.**

**Verdict: `ElementStore` is authored, tested, ADR'd — and unreachable.** The truncated-scan defect
cannot fire today because nothing constructs it; ADR-0343 §D.4's ban on widgets reaching `getState()`
is enforcing against a class with no instances. ⭐ This is the *"audit REACHABILITY, not existence"*
rule catching a hypothesis I would otherwise have reported as a live defect.

### 10.2 ⭐ DEFECT L-2416 — TWO new proven dead writes and one silently-dropped field

Dispatcher: `apps/editor/src/ui/property-inspector/MaterialDispatch.ts`, reachable from the property
panel at `PropertyInspectorApply.ts:351`. Two lines decide the payload — `:317` adds `materialId`
unless `supportsMaterialId:false`; `:322` writes `fields[route.colorField ?? 'materialColor']`.

**The reported FLOOR case is ALREADY FIXED** — `MaterialDispatch.ts:130` now carries
`colorField: 'colour'`, and `FloorData` declares `colour?` (`FloorTypes.ts:325`) which
`resolveFloorColor` (`FloorColourSystem.ts:88-106`) reads. **SOUND.** The defect moved next door:

| Family | Write | Lands on the record via | PROOF of no reader |
|---|---|---|---|
| **CEILING** | `MaterialDispatch.ts:112` — no `colorField`, no `supportsMaterialId:false` ⇒ writes **`materialColor` + `materialId`** | `initBusHandlers.ts:961` → `UpdateCeilingCommand` → **`CeilingStore.ts:193 Object.assign(clone, updates)`**, frozen `:223` | `CeilingData` (`CeilingTypes.ts:175-211`) declares **neither** key. Resolvers `getSoffitColor` (`CeilingColourSystem.ts:35-42`) and `getPlanFillColor` `:44-46` read **`ceiling.colour`**. Repo-wide `ceiling*.materialColor` → 5 hits, **none a read of `CeilingData`** |
| **CURTAIN WALL** | `MaterialDispatch.ts:132` ⇒ writes **`materialColor` + `materialId`** | `initBusHandlers.ts:1001` → `UpdateCurtainWallCommand:165` → **`CurtainWallStore.ts:365-370 { ...existing, ...updates }`** | `CurtainWallData` (`CurtainWallTypes.ts:18-85`) declares `mullionColor?`, `glazingColor?`, `mullionMaterialId?`, `glazingMaterialId?` — **no `materialColor`, no `materialId`**. `grep materialColor packages/geometry-curtain-wall/src` → **0 hits** |
| **FURNITURE** (a *drop*, not a dead key) | `MaterialDispatch.ts:149` sets `colorField:'color'` but omits `supportsMaterialId:false` ⇒ sends `materialId` | `plugins/furniture/.../UpdateFurnitureParameters.ts:100` passes `cmd as any` | `UpdateFurnitureParametersCommand`'s payload (`:10-33`) has **no `materialId`**, and `newData` `:65-95` is a field-by-field whitelist that never copies it. `dispatchSetMaterial` returns **`true`** |

**User-visible consequence (ceiling / curtain wall):** the inspector repaints the mesh live, so the
user sees the colour apply; the key is `Object.assign`'d onto the record, serialised, and resolved by
nothing — **it evaporates on rebuild or reload.** Both records' real colour field is `colour` /
`mullionColor`+`glazingColor`.

⚠ **The irony worth recording:** `initBusHandlers.ts:981-982` re-bridged `wall.updateCurtainWall`
*specifically* so `MaterialDispatch` would reach the record. **It reaches the record. The record has
no field for it.** The bridge fixed the transport and left the payload wrong.

**SOUND families checked:** column, roof, wall, slab, handrail (already `supportsMaterialId:false`),
room (`SetRoomMaterial.ts:124` translates → `{ colour }`, and `:86-88` refuses a `materialId` aloud).

**Second dead-write shape — a handler nothing dispatches (L-2417).**
`plugins/floor/src/handlers/UpdateFloorLayers.ts:29-58` (`floor.updateLayers`) produces patches
against the detached DTO store with **no refusal**. Its documented dispatcher (header `:3`) no longer
dispatches it — `PropertyPanelTypeSelector.ts:110,135` now sends `element.changeType`.
`executeCommand('floor.updateLayers'` → **0 matches repo-wide.** Its sibling `floor.setMaterial` got
the loud refusal; this one did not.

### 10.3 DEFECT L-2418 — `IsolationStateStore` is constructed THREE times independently

`createIsolationStateStore()` (`packages/stores/src/IsolationStateStore.ts:203`) returns a **fresh
store on every call**, and production calls it three times:
`apps/editor/src/ui/inspect/InspectPanel.ts:132` · `apps/editor/src/ui/living-graph/livingGraphSelection.ts:336`
· `apps/editor/src/ui/dev/modelTreeTestModal.ts:183`. **Nothing syncs them.**

**User-visible consequence:** isolating from the Inspect panel and isolating from the Living Graph
are two disjoint states over the same meshes. Exiting isolation in one does not clear the other.

### 10.4 Duplicate-fact pairs — mostly NON-EXISTENCE, not divergence

| Fact | Winner | Rival | Synced by |
|---|---|---|---|
| A room | `packages/room-topology/src/RoomStore.ts:625` (`storeRegistry` key `'room'`, serialised) | `packages/stores/src/RoomStore.ts` `AggregateRoomStore`, built at `composeRuntime.ts:1041` as `runtime.stores.roomStore`; **plus** the `plugins/rooms` DTO | **NOTHING.** Its own header (`:3-21`, measured 2026-08-14) says the slot has *"ZERO readers anywhere in the repo"*. Three classes, one name, no bridge. |
| Sheets / Schedules / Title blocks | `core-app-model/src/views/{Sheet,Schedule,TitleBlock}Store.ts:411/:280/:115` (`…Impl` singletons, deserialised) | `packages/stores/src/{Sheet,Schedule,TitleBlock}Store.ts`, barrel-exported | **nothing needs to** — rival has **0 production instantiations**. A parallel API surface that is never built. |
| Isolation state | — | three independent instances | **NOTHING** — §10.3, the one live divergence |
| Visibility intent | `VisibilityIntentStore.ts:133` | `packages/stores/src/PerViewOverridesStore.ts:78` | dead module — **0 consumers and not exported from `packages/stores/src/index.ts`** |
| Selection | `SelectionStore` (DTO, `PluginRegistry.ts:431`) | `InspectSelectionStore.ts:29` | **0 production instantiations, 0 consumers** outside its own package |

⭐ **The pattern:** `packages/stores` contains a **second, unbuilt implementation of much of the
store layer.** That is not drift — it is a parallel surface someone could wire by accident.

### 10.5 Snapshot round-trip — healthier than a naive grep says, with real gaps

⚠ **A correction the store lane made and reported rather than hid:** a first pass grepping
`snapshot.<key>` produced *"31 keys with zero readers"*. **That was wrong** — the loader reads most
optional slices as `(snapshot as any).<key>`. ⭐ *A count from a regex that does not match the code's
idiom is not a measurement.*

Snapshot: `ProjectSerializer.ts:126-519`, **64 declared keys**. Loader: `ProjectLoader.ts:371`.
**SOUND (save + restore both traced):** all 14 element families (`:139-153` → `ProjectLoader.ts:181-336`)
· ceilings/floors/rooms/lighting · `curtainPanels` · all 7 `*SystemTypes` (`:1640`–`:1923`) ·
`roomBoundingLines` · the 6 VG/view/visibility slices (`:1948`–`:2009`) · hierarchy/templates/
elementCodes/semanticGraph/temporalGraph/decisionRecords · `provenance` (`:2220`) · `site`/`siteCapture`
· `ifcElementMeta` · requirements/assetCatalog/dxfOverlays/userMaterials · sheets/schedules · the 5
annotation slices.

| Gap | Verdict |
|---|---|
| `ifcImports` (`ProjectSerializer.ts:444`) | **UNMEASURED / suspected SAVED-NOT-RESTORED** — a save leg and a `SnapshotStreaming` pass-through exist; no rehydrate call found, but `ProjectLoader.ts` was not read in full |
| `lifecycle` (`:339`) | DEFECT-BY-DESIGN, documented tombstone — *"no writer populates it from S70 D8+"* |
| **`ApartmentStore`, `BuildingStore`, `LevelStore`** (C20 aggregates, built at `composeRuntime.ts:1031,1032,1040`) | **NO SNAPSHOT KEY EXISTS — neither saved nor restored** |
| **`ClimateStore`, `FamilyRegistryStore`, `ApartmentParametersStore`, `RoomParametersStore`, `ProjectOriginStore`, `AiApprovalQueueStore`, `LayoutOptionsStore`, `DataStore`, `DrawingSetStore`, `IsolationStateStore`** | **NO KEY — every one constructed in production, every one lost on reload** |

**DEFECT L-2419.** Whether each loss is correct (ephemeral UI state) or a defect (authored intent)
is a **per-store contract question this lane did not resolve**. But **`ProjectOriginStore` and
`ClimateStore` are the least defensible — a project datum and a climate binding are not session
state**, and `RoomParametersStore` holds user *intent*, not derived geometry.

---

## 11. THE BUS

### 11.0 The register is STALE and its gate is RED — run the gate, never the doc

```
$ npx tsx tools/ga-gate/check-verb-register.ts
Handler files read                 : 1307  (floor 900)
Verbs discovered                   : 340  (floor 250)
  LIVE                             : 133
  REFUSES                          : 37
  SHADOWED (dead route)            : 1
  UNKNOWN                          : 169
Authoritative store NONE / UNKNOWN : 207
Sync UNDECLARED (property verbs)   : 2
Chat UNDECLARED                    : 6

✗ 4 failure(s):
   • V1 3 registered bus command(s) have NO row in docs/04-reference/API-VERB-REGISTER.md:
     floor.setFinishBatch, room.setColourMode, view.setCategoryVisibility.
   • V4 1 NEW SHADOWED verb(s): sheet.create.
   • V4 1 NEW UNKNOWN-liveness verb(s): room.setColourMode.
   • V4 5 UNKNOWN-liveness verb(s) on the baseline no longer qualify:
     beam.changeLevel, furniture.changeLevel, lighting.changeLevel, plumbing.changeLevel, sheet.create.
RC=1
```

**Every headline number in `docs/04-reference/API-VERB-REGISTER.md` disagrees with the code**
(doc: 337 / 127 LIVE / 0 SHADOWED / 173 UNKNOWN / 1285 files / 0 sync-undeclared / 4 chat-undeclared).
**L-2420 — do not cite that doc.**

⭐ **`REFUSES : 37` independently confirms §3.1.** The gate's names add `room.recomputeBoundary` and
`room.regenerate` (which do not use the `*_UNREACHABLE` constant my scan keyed on) and correctly
exclude `wall.create`/`slab.create` — exactly the correction in §3.2. **Two methods, two sources,
one number.**

**Also: 169 of 340 verbs are UNKNOWN-liveness and 207 have NO/UNKNOWN authoritative store.** By the
gate's own definition, nobody has proven either way whether they reach authoritative state.

### 11.1 ⭐ DEFECT L-2421 — `_cmExec` declares `: void` and 89 of 90 call sites discard a refusal

`apps/editor/src/engine/initBusHandlers.ts:611` — `function _cmExec(cmd, meta): void`. The file's own
comment at `:634-645` states the defect verbatim:

> *"`CommandManagerImpl.execute()` DOES refuse an absent target correctly … RETURNS
> `{ success:false, affectedElementIds: [], info:[reason] }` … `_cmExec` above declares `: void` and
> drops that object on the floor — so a bridge calling it reports success for a command the legacy
> layer just refused BY NAME."*

**Measured: `_cmExec(` → 90 occurrences, 1 the definition ⇒ 89 call sites.
`_cmExecOrRefuse(` → 2 occurrences, 1 the definition ⇒ 1 call site (`roof.update`, `:930`).**
`element.updateParameters` and `element.updateMark` are both on the 89.

**This is the highest-leverage single fix in the whole audit**: the refusal already exists, is already
correct, and is already computed — it is thrown away at one function. **Blast radius:** widening the
return type surfaces refusals that 89 bridges currently swallow; expect previously-silent operations
to start reporting failure, which is the point, and which is why it needs a staged rollout.

### 11.2 Bridge inventory and the ring-buffer gap

**78 bridge verbs** (`initBusHandlers.ts:915` table; registered `:2838-2844`; logged `(bridge)` at
`:2901`). Plus 1 batch stub, 2 project-origin, 4 generation, 3 delegated graph = **88 in
`initBusHandlers`**. The brief's "~90 marked (bridge)" is right on total, wrong on label: **78** carry
that log line.

| Class | Count | Denominator |
|---|---|---|
| **THIN** — one-line `fn` mapping payload → one legacy `Command` → `_cmExec` | **57** | 78 |
| **THICK** — multi-line body (store read, branching, patch, consequence) | **21** | 78 |
| declare `validate` (payload-shape only, store-free by design) | 77 | 78 |
| **declare `undoPatch`** | **5** | 78 |

⭐ **The other 73 return `{forward:[],inverse:[]}`** → `isEmptyPatchRecord` (`CommandBus.ts:577`) →
`skipRingBuffer` → **never pushed to the ring buffer**. Undo for those verbs depends entirely on the
legacy stack. **L-2422.**

**Boot order, measured:** `initBusHandlers(runtime)` runs at `engineLauncher.ts:543`, *before* every
`registerXHandlers(_bus)` (`:613-727`), and each loop guards with `if (registry?.has?.(type)) continue`.
**On a verb declared twice, the bridge wins, not the plugin.**

⚠ **The gate's one SHADOWED verdict names the wrong dead site.** It reports `sheet.create` shadowed
*by* `initBusHandlers.ts:2202`. Measured: `registerSheetHandlers` has **zero production callers**, and
the bridge registers first — so **the bridge at `:2582` is live and the plugin declaration at
`plugins/sheets/src/handlers/index.ts:17` is the dead one**, which the bridge's own comment
(`:2573-2580`) states deliberately. The gate's static two-sites→plugin-wins inference is inverted
here. **L-2423 (gate defect, not a code defect).**

**THICK ≠ honest:** `element.updateParameters` (`:2216`) is multi-line but forwards `cmd.parameters`
**verbatim** — a pass-through with a longer comment.

### 11.3 ⭐ THE WHITELIST MATRIX — the four-field whitelist is in `WallStore`, not the bridge

The brief's report was correct in substance and wrong in location. The chain:
bridge `initBusHandlers.ts:2216` (`validate` checks only `elementId`/`elementType`/non-empty
`parameters`) → `UpdateElementParameterCommand.ts:216` routes window/door to `HOST_WALL_STORE` →
`:605`/`:611` call `store.updateWindow?.()` / `store.updateDoor?.()` **optional-chained, so an absent
method is a silent no-op** → `:494` returns `{ success: true }` **unconditionally, with no read-back**.

| # | Location | Allowed | Dropped | Caller told? | User-visible consequence |
|---|---|---|---|---|---|
| **W1** | `packages/geometry-wall/src/WallStore.ts:1543-1551` `updateWindow` | `width`, `height`, `sillHeight`, `offset` — **4** | of `interface Opening` (`WallTypes.ts:49-87`, 10 fields): **`windowType`**, **`openingProfile`** | **NO** — returns `void` | Change a window to *double* or an *arch* profile → panel says applied → the frame changes (rich `windowStore` got everything, `:608`) but **the wall keeps cutting the old rectangle**. Frame and void diverge (C86 §11 #1) |
| **W2** | `WallStore.ts:1651-1662` `updateDoor` | same **4** | **`doorType`**, **`openingProfile`** | **NO** | same, for doors: single→double leaf shows on the leaf, not the hole |
| **W3** | `WallStore.ts:1513` `if (!existingWin) return;` · `:1643` `if (!door) return;` — both inside `if (wall) {` with **no `else`** | — | **the entire write**, when the opening or host wall is absent | **NO** — void, no log, no throw | a total silent no-op reported as success |
| **W4** | `WallStore.ts:940-1001` `updateWall` | 13 wall fields + `_renderVersion` | anything unnamed — absent ⇒ **left standing**, so fields become immovable by snapshot restore | **NO** | **This is the L-995 mechanism, with its scar tissue in the file** (`:997`): *"this whitelist did not name the field, so the store silently dropped it and the command still returned `{success:true}`. The chat then said 'Set the interior finish of all 17 walls… Done — undo with Ctrl+Z' over a model nothing had touched."* `sideFinishes`/`rakeAngleDeg` are now named; **any 14th field repeats it** |
| **W5** | `UpdateElementDimensionsBatchCommand.ts:108` `BATCH_DIMENSION_KEYS` | 4 | other dimension keys | **PARTIAL** — refuses when *none* of the 4 given (`:180-186`), names applied dims (`:294-300`), `skipped[]` carries reasons; but `{height, depth}` applies `height` and drops `depth` **unnamed** | low — closed payload type, internal callers |
| **W6** | `plugins/view/src/handlers/UpdateElementDimensionsBatch.ts:101` | 4 | same | **PARTIAL, plus `sayNothingRan()` (`:170-190`) emits an explicit `outcome:'indeterminate'`.** ⭐ **The best-behaved bridge in this audit** | — |
| **W7** | `packages/command-bus/src/CommandBus.ts:526-527` | patches whose `path[0]` is a **declared** `affectedStores` key | patches to undeclared stores, dropped from per-store undo routing | **console only** — `:478-495` `console.error("§U-B6 UNDO-ROUTING BUG…")`; the `EventRecord` carries no `dropped` field | Ctrl+Z applies an **incomplete inverse** → orphaned state. Mitigated: flat `record.forward/inverse` keep everything |
| **W8** | `apps/editor/src/engine/initRemoteElementSync.ts:110-116` | everything but `_`-prefix/`id`/`levelId` | routing keys | **YES — counted.** `stats.emptyAfterFilter++` `:117`, `stats.unappliedRemoteCreates++` `:114`, exposed via `stats()` `:181`. ⭐ **This is the pattern the others should copy** | — |

**Sweep coverage stated:** `initBusHandlers.ts` has **no key whitelist** (its one destructure-discard,
`:1051 const { id, ...rest }`, spreads everything — clean). `packages/command-bus/**` → one (W7).
`plugins/*/src/handlers/**` → **exactly one** (W6). `packages/command-registry/**` → W5 plus three
*benign* key-lists that gate behaviour rather than drop data —
`stair/UpdateStairParametersCommand.ts:306`, `grids/UpdateGridCommand.ts:96` (**refuses by name with
the blocked keys listed — the correct shape**), `lighting/lightingAuthoredParams.ts:41`. Two further
self-declared whitelists already carry warnings in-code: `walls/CreateWallCommand.ts:416` and
`walls/SetWallSideFinishCommand.ts:351`.

### 11.4 ⭐ DEFECT L-2424 — `element.changeType` has SEVEN branches that warn and then succeed

`initBusHandlers.ts:1526-2205`. Each is `console.warn(…); return;` inside `fn`, so the wrapper returns
`{forward:[],inverse:[]}` and **the bus promise resolves**:
`:1928`, `:1973` (*no railing type … — ignored.*) · `:2037` (*no lighting fixture type …*) ·
`:2084` (*no curtain wall type …*) · `:2109` (*curtain wall not in the geometry store …*) ·
and `:2204`, **the terminal fall-through**: *no change-type route for elementType="<t>" — ignored.*

The routed set is 16 `if (elType === …)` branches (`:1544,1557,1608,1659,1715,1764,1810,1842,1866,1891,1909,1944,2011,2023,2054`).
**Every unlisted element type reaches `:2204` and reports success** — a switch with no `default:`
falling through to success.

⭐ **The same author fixed the identical shape one verb over**, by *throwing*, at `:1315-1319`
(`wall.updateDimensions`, §FIX-S4-VOICE-ABSENT-TARGET). **The fix was applied to one verb and not to
`element.changeType`.**

### 11.5 L-1670 is CLOSED in one command and OPEN in eight

**Closed, and this is the reference implementation:**
`packages/command-registry/src/walls/SetWallSideFinishCommand.ts:365-379` **re-reads the record** and
asks `resolveWallSideFinish` whether the value landed; a wall that fails is not counted and is named
as a skip. **That is a read-back, not a return-value check.**

**Still counting the child's `r.success` — a return value, never a read-back:**
`walls/UpdateWallsColorBatchCommand.ts:179` · `walls/UpdateWallsSystemTypeBatchCommand.ts:279` ·
`walls/UpdateWallsRakeBatchCommand.ts:257` · `walls/AddWallLayerBatchCommand.ts:242` ·
`windows/UpdateWindowsSystemTypeBatchCommand.ts:199` · `ceilings/UpdateCeilingsSystemTypeBatchCommand.ts:226` ·
`windows/CreateWindowsParametricBatchCommand.ts:313`.

**The worst instance counts nothing at all — L-2425.**
`packages/command-registry/src/walls/SetAllWallsWidthCommand.ts:58-60`:

```ts
const nextState: any = { ...serializeWallSnapshot(wall), thickness: this.newWidth };
ctx.stores.wallStore.updateWall(nextState);   // returns void — and goes through whitelist W4
affected.push(id);                            // unconditional
```

then `:64-69` returns `{ success: true, affectedElementIds: affected }`. **No success check, not even
`r.success`.** Its own comment (`:55-56`) calls `updateWall` *"full-replacement semantics"* — it is
the 14-field projection of W4.

### 11.6 Other bus-level silent degradations

- **`CommandBus.executeCommand` has no success field at all** (`CommandBus.ts:427-643`). It resolves
  iff `canExecute` passed and `execute` did not throw. For the 73 empty-patch bridges, *"resolved"*
  carries **zero** evidence any store was written.
- **Ring-buffer push failure** `:619-621` — `console.error`, dispatch still resolves.
- **CRDT applier failure** `:634-639` — `console.error`, dispatch still resolves ⇒ **the local write
  succeeds and no collaborator ever sees it.** Declared deliberate per C08 §3.1; recorded here
  because it compounds §2.7.
- **`stair.batch.create`** (`initBusHandlers.ts:461`) — `canExecute: () => ({valid:true})`,
  `execute: async () => ({ patches: [], … })`, marked *"DEFERRED: stairs migration pending"*.
  **Registered, inert, reports success, writes nothing.**
- **11 of 12 clash verbs are pure refusals** — `clashCapability.ts:97` declares 12 ids, `:239`
  implements one (`clash-run`); and if detector registration throws, `engineLauncher.ts:773-775`
  empties the pairs so **`clash-run` refuses too — 12 of 12**.
- **Authored-but-never-registered:** `plugins/navigate/src/handlers/index.ts:36-74` (4 handlers) and
  `plugins/geospatial/src/handlers/index.ts:27-71` (4 handlers) are `console.debug` only and use a
  `{commandType, handle}` shape `CommandBus.register` would **reject** at `:101-105`.

`packages/command-registry/src/refusal/` contains **one file**, `childRefusalText.ts` — a refusal
*renderer*, not a registry. There is no refusal-handler set there.

---

## 12. PRIORITISED RISK LIST

Highest user-visible risk first. Each: cheapest credible fix + blast radius.

| # | Risk | Evidence | Cheapest fix | Blast radius |
|---|---|---|---|---|
| **0** | ⭐ **`_cmExec` throws away a refusal that is already computed and already correct.** 89 of 90 bus-bridge call sites report success for commands the legacy layer refused **by name**. | §11.1 · `initBusHandlers.ts:611`, own comment `:634-645` | Widen the return type and propagate — `_cmExecOrRefuse` **already exists** and is used once (`:930`). The refusal text is already built. | Wide but shallow: previously-silent operations start reporting failure. That is the point. **Stage it** — migrate bridges in batches with a count of newly-surfaced refusals per batch. |
| **1** | **Undo silently half-succeeds and still offers Redo.** 65 of 279 undos cannot report failure; `CompositeCommand` — the whole-building one-undo entry — is hard-`true` in both directions and counts children *attempted*. | §2.1, §2.2 · `CompositeCommand.ts:117,137` · `CommandManagerImpl.ts:873,913` | Thread child outcomes in `CompositeCommand` (~6 lines): `success: failures === 0`, `Undid ${undone} of ${n}`. Then the 24 inspect-and-discard batch undos, which are 1 line each. | `CommandManagerImpl.undo():913` starts refusing failed undos onto the redo stack — correct, but ship with a test. |
| **1b** | ⭐ **Window/door type and profile changes never reach the wall.** The four-field whitelist drops `windowType`/`doorType`/`openingProfile`; the caller is told success. Frame and void diverge. | §11.3 W1–W3 · `WallStore.ts:1543,1651,1513,1643` · `UpdateElementParameterCommand.ts:494` | Add the two keys to both projections, and make `updateWindow`/`updateDoor` return a boolean the command reads back. | Wall opening geometry — the C86 §11 #1 defect. Needs a read-back test per §11.5's reference implementation. |
| **1c** | ⭐ **Ceiling and curtain-wall material edits evaporate on reload.** Undeclared keys are `Object.assign`'d onto records nothing resolves; the mesh repaints so the user believes it applied. | §10.2 · `MaterialDispatch.ts:112,132` · `CeilingStore.ts:193` · `CurtainWallStore.ts:365` | `colorField:'colour'` for ceiling (the floor fix, one family over) and the correct mullion/glazing fields for curtain wall; `supportsMaterialId:false` where unsupported. | Two property-panel routes. **A dispatch-then-read-back probe should ship first** — this is a static proof, not a measured one (§13). |
| **1d** | ⭐ **`element.changeType` reports success for seven unroutable cases**, including a terminal fall-through that catches every unlisted element type. | §11.4 · `initBusHandlers.ts:2204` (+ `:1928,1973,2037,2084,2109`) | Throw, exactly as the same file already does at `:1315-1319`. | Type-change UI + chat. Surfaces failures that are currently invisible. |
| **2** | **170 of 288 command types never reach a collaborator**, dropped with a `console.info`. Independently, 201 of 330 bus verbs are declared `not-synced`. | §2.7 · `RemoteCommandDispatcher.ts:337-343` · `CommandRegistry.ts:217` · `syncDisposition.ts` | Do not add 170 factories. **Make the drop visible**: turn the `console.info` into a surfaced, counted "not replicated" signal, and cross-join the two registers into ONE per-family verdict. | Collaboration UX + C66 capacity claims. **C66 §1 must not describe multi-user editing as supported on this evidence.** |
| **3** | **Editor hangs forever on a stalled connection.** The `apiFetch` timeout fix lives in the copy the app does not import. | §6.1 · `persistence-client/src/apiFetch.ts:55-61` vs `core-app-model/src/apiFetch.ts` | Re-export the persistence-client implementation from `core-app-model`, or port the `AbortController` block. | Every editor network call — project load, catch-up, sync, thumbnails. Needs a deliberate timeout + test. |
| **4** | **Batch level creation eats Ctrl+Z and reverts nothing**; reports the requested count as the achieved count. | §2.3 · `CreateMultipleLevelsCommand.ts:57,80,84` | Implement `undo()` (reverse the collected `affectedIds`) **or** declare `nonUndoable = true`; report `affectedIds.length`. | Level creation + the plan views it spawns. |
| **5** | **Slab moves do not carry their pinned walls; wall edits do not recompute rooms; stair moves orphan handrails.** The cascade layer is authored, tested, and has zero production callers. | §3.3 · `rg registerCrossHandlers` · `host-move-propagation-matrix.json:532` | Do **not** wire it — its target verb `wall.transform` refuses. Make the gap visible (registered refusal) or delete the layer. | Currently zero, because it never runs. Wiring it is a real project. |
| **6** | **Furniture placement is not undoable, and leaks.** 3 production `undoManager.add()` calls into a stack nothing pops; unbounded `Object3D` retention. | §4.4 · `initFurnitureInteraction.ts:42,71` · `initUI.ts:2646` · `UndoManager.ts:25` | Route the 3 sites through the bus/command path; failing that, cap `UndoManager.add()`. | Furniture placement, GLB import, `initUI` delete. |
| **7** | **`ClearProjectCommand` relies on an unencoded invariant** to stay off the undo stack, and it clears 10 stores. | §2.4 · `ClearProjectCommand.ts:43-48,288` | `readonly nonUndoable = true;` — one line. | None; it makes the header comment true. |
| **8** | **57 live stores on `window`** — a write path wider than the P6 gate measures (37). | §4.3, §7 | Not a quick fix. **First step is honesty:** record the 57 next to the gate's 37 so the baseline is not read as the census. | Architectural; do not attempt in one pass. |
| **9** | **`door.create` / `window.create` flatly refuse while `wall.create` / `slab.create` probe.** Asymmetric hardening, no recorded reason. | §3.2 | Apply the `authoritativeWallStoreRefusal()` three-valued probe to the door/window handlers, or record why it does not apply. | Door/window creation via the bus. |
| **10** | **`describe()`: 21 lines of specification, 0 of 279 implementations.** | §2.6 | Implement on the ~20 highest-traffic commands, or amend the spec to say it is aspirational. | Undo-history dropdown labels only. |
| **11** | **Two incompatible types named `Command`** exported from one barrel. | §5 · `types.ts:611` vs `UndoManager.ts:3` | Rename the local one to `SceneCommand`. | Two importers. |
| **12** | **`affectedStores: []` means "snapshot ALL stores"** — the opposite of the honest reading. Latent. | §2.8 · `CommandManagerImpl.ts:694` | Treat `[]` as an explicit empty scope; require `undefined` for "unknown". | One command declares `[]` today and it never reaches this manager. |
| **13** | **73 of 78 bridges contribute no undo patch** — their undo depends entirely on the legacy stack. | §11.2 · `CommandBus.ts:577` | Not a quick fix. First step: record which 73, so "the bus has undo" is not read as true for them. | Architectural. |
| **14** | **`IsolationStateStore` built 3× independently** — Inspect and Living Graph isolate into disjoint states. | §10.3 · `IsolationStateStore.ts:203` + 3 call sites | Make `createIsolationStateStore()` a memoised singleton, or hang one instance off the runtime. | Two panels. Small and contained. |
| **15** | **`SetAllWallsWidthCommand` counts nothing** — pushes ids unconditionally after a `void` store call routed through whitelist W4. | §11.5 · `SetAllWallsWidthCommand.ts:58-60` | Copy the read-back from `SetWallSideFinishCommand.ts:365-379`. | One command; the pattern to copy already exists in the repo. |
| **16** | **10+ production stores are never saved and never restored** — `ProjectOriginStore` and `ClimateStore` most questionably. | §10.5 | Per-store contract decision first, then a snapshot key for the ones that hold authored intent. | Persistence format — needs a migration. **Do not batch this with anything else.** |
| **17** | **`API-VERB-REGISTER.md` is stale on every headline number and its gate is RED.** | §11.0 · `check-verb-register.ts` RC=1 | Regenerate the doc (the generator has a `--write` mode this lane deliberately did not run). | Documentation only — but agents read it as truth. |

---

## 13. WHAT THIS LANE DID **NOT** REACH — honest blanks

- **No runtime execution whatsoever.** No browser, no `tsc`, no build (memory-constrained machine, per
  the lane brief). Every "reachable" verdict means *an import/construction/registration edge exists
  from a production entry point* — **not** *observed executing*.
- **The 170 missing replay factories were not cross-joined against the 330 bus dispositions.** So
  "family X does not sync at all" is **not** established for any individual family — only the two
  path-level totals are. This join is the single most valuable next measurement.
- **The 65 hard-true undos were classified statically, not exercised.** I did not determine, for any
  of them, how often the underlying restore actually fails. The defect is that the failure *cannot be
  reported*; its *frequency* is unmeasured.
- **13 of the 21 THICK bridges were not read in full** (8 were). Their classification as "does real
  work" stands; *what* work is UNMEASURED.
- **The 169 UNKNOWN-liveness verbs and the 207 with NO/UNKNOWN authoritative store were not touched.**
  By the gate's own definition nobody has proven either way whether they reach authoritative state.
  **This is the largest single unmeasured area in the domain.**
- **Per-plugin verb attribution could not be measured cleanly** — repo-wide `grep -r` over `plugins/**`
  timed out twice at 120 s, and barrel-literal counting undercounts because several barrels (`view`,
  `schedules`, `plan-view`, `multiplayer`, `bcf`, `cross`) declare `type` in the handler files.
- **§10.2's two dead writes are STATIC proofs, not measured ones** — the write site, the
  `Object.assign`/spread, the absent field, the absent reader. ⭐ **A dispatch-then-read-back probe
  against `ceilingStore` and `curtainWallStore` would turn "very well-evidenced" into "measured", and
  it does not exist.** Ship the probe before the fix.
- **`ifcImports` restore** — no rehydrate call found, but `ProjectLoader.ts` (2853 lines) was not read
  in full. Reported as UNMEASURED, **not** as a defect.
- **The 22 plugin DTO stores were not individually audited.** The topology is proven (fresh instance
  at `PluginRegistry.ts`, `<family>.created`-only mirror) and three consequences are named; a
  per-family sweep of which verbs still write them would likely find more of the §10.2(g) shape.
- **`ProvenanceStore` (23.6 KB), `DrawingSetStore` (17 KB), `ClimateStore`, `IndexedDBStore`,
  `seedCoreFamilies.ts` (71 KB)** were opened only at their construction sites — internal soundness
  UNMEASURED. **`composeRuntime.ts:1577`** registers under a *dynamic* key, invisible to grep.
- **The `persistence-client` serializer twin was not diffed** against the app copy, though
  `ProjectSerializer.ts:305-315` says they must be kept in lock-step.
- **`CommandProposalStore` / `CommandProposalFactory` / `PatchSnapshot` / `StableCreatedId`** in
  `packages/command-registry/src` were **not audited**.
- **`packages/command-registry/src/**` outside `generic/`, `walls/`, `windows/`, `ceilings/`,
  `grids/`, `stair/`, `lighting/` was not swept for whitelists** — ~35 subdirectories remain.
- **Whether any of the 37 REFUSES verbs still refuses was confirmed by count, not by re-reading all
  37 handlers.** I read 35 terminal statements myself (§3.1); the gate agrees on 37 (§11.0); the two
  extra names (`room.recomputeBoundary`, `room.regenerate`) come from the **stale** register doc and
  are **UNCONFIRMED against today's code**.
- **The three rival `commandManager` gates were not re-run.** §6 row 1's counts are an independent
  measurement with its own denominator; **do not reconcile them against any gate's number without
  naming the gate.**
- **`packages/command-registry/src/refusal/`** was not opened.
- **The ~3050 production `legacy` mentions were triaged, not enumerated** — the densest files
  (`initTools.ts` 110, `initBusHandlers.ts` 75, `runtime-composer/src/types.ts` 47,
  `WallFragmentBuilder.ts` 42) are prose describing legacy seams and were not individually classified.
- **Unused-but-mounted server routes are UNMEASURED** (§6.3).
- **Five sibling audit lanes** (elements/builders, performance, robustness, plugins/API, contracts)
  own their domains; cross-domain observations here are flagged, not adjudicated.
