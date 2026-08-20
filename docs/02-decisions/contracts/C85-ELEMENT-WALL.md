# C85 — ELEMENT: WALL

- **Status**: CANONICAL — binding on every PR that touches the wall family
- **Date**: 2026-08-18
- **Spawned by**: [C84 §6](C84-ELEMENT-INTEGRITY.md). The **twelve mandatory sections** below are
  C84 §6's, in C84 §6's order.
- **Constrained by** (these own the mechanisms; C85 only APPLIES them per family, per C84 EI-9 —
  *one answer per question*): [C03 §4.4/§4.5/§4.6](C03-SCHEMAS-COMMANDS-AND-STATE.md) ·
  [C11](C11-ELEMENT-CREATION-PIPELINE.md) · [C15](C15-HOSTED-ELEMENT-CONTRACT.md) (the openings
  this wall hosts — owned by [C86](C86-ELEMENT-WALL-OPENING.md)) ·
  [C16](C16-COMMAND-AUTHORING-PROTOCOL.md) (CA-17/CA-18/CA-19/CA-21) ·
  [C73](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) · [ADR-0319 §2](../adrs/) (audit fields across
  undo — **NOT C75**) · [C82](C82-RIBBON-CAPABILITY-SURFACE.md) (the UI-control census)
- **Evidence**: measured in the MAIN worktree on 2026-08-18 by `grep -n` / line-numbered `Read`.
  Every claim carries `file:line`. Unverifiable cells read the literal string **NOT MEASURED** —
  a finding, not a gap. **No cell is blank** (C84 §6).
- **Persistence pair measured**: `apps/editor/src/engine/persistence/` — the **LIVE** one.
  `packages/persistence-client/src/loader/` was NOT measured; it is the DEAD copy the app never
  builds. Both directories were confirmed to exist; only the live pair was read.
- **Reachability axes** (C84 §3.5.1): axis **(a)** importer/constructor was run in full. Axis **(b)**
  — which production surface dispatches each of the 45 `wall.*` verbs — was run only where a handler
  asserts it in source. **A complete axis-(b) enumeration is NOT MEASURED** (§4).

> **THE TWO ONE-LINE VERDICTS.**
> **(1) Wall is the repo's canonical SPLIT-BRAIN.** The viewport reads the `geometry-wall`
> singleton; the bake worker reads a plugin DTO `WallStore` — *different type, different package,
> different process* (C84 EI-1). Confirmed here at `initBuilders.ts:77, :551-553` versus
> `HeadlessBakeSession.ts:31, :43, :53, :131`.
> **(2) The rake does not exist above the geometry layer.** `grep -rn rake packages/schemas/src`
> → **ZERO hits**. `rakeAngleDeg` lives only on the legacy record (`packages/geometry-wall/src/WallTypes.ts:312` — re-measured 2026-08-18; this read `:311`), the
> serializer (`ProjectSerializer.ts:559`) and `packages/geometry-wall`. **That is the structural
> reason [L-955](../../04-reference/ISSUE-LOG.md)'s three body builders diverged at the corner: there
> is no schema-level authority above them to diverge from.**

> ## REVISION — 2026-08-18 (later the same day)
>
> C85 was authored in the morning and **four of its statements were overtaken by measurement before
> the day ended.** They are corrected in place, with the retraction visible, per C84 §6.
>
> **The correction that matters most is §10's.** It recorded the wall-Y delta as **LATENT**, and
> justified that with *"nothing authors either offset non-zero today"*. **Nobody had tested that
> clause.** Both offsets are editable from the property panel and settable from a shipped chat
> capability; the defect was **LIVE**, and one *"set the base offset to 150 mm"* put every door and
> window on that wall outside its own hole ([L-968](../../04-reference/ISSUE-LOG.md)).
>
> That is the failure mode this whole contract suite exists to catch, and C85 committed it: **a
> rationale written in prose reads like evidence and stops the next reader from measuring.** An
> honest *NOT MEASURED* would have been safer than a justified *LATENT*. Where this document says a
> thing is latent, dormant, unreachable or harmless **because nothing does X**, treat that as the
> first claim to attack, not the last.
>
> Corrected: **§10 wall-Y datum** (LATENT → LIVE, now RESOLVED — `8f63fb6f`) · **W-G-4** (satisfied) ·
> **R-8** (line numbers re-measured; **its stated reason is now half stale**) · **DELTA rows 1 and 10**
> (closed) and **row 11** (re-verified still open — the parity harness is *still* absent from `main`).
>
> Re-verified and **unchanged**: both headline verdicts below. `grep -rn rake packages/schemas/src`
> → **0** (run 2026-08-18, later pass), so the rake still has no authority above the geometry layer.
> Verdict 2's citation was corrected from `WallTypes.ts:311` to
> `packages/geometry-wall/src/WallTypes.ts:312`.
>
> **CITATION RESOLVABILITY — measured, and clean.** C85 cites **67 distinct `Filename.ts:line`
> basenames**. Every one resolves to **exactly one** file in the repo:
>
> ```
> grep -oE '`[A-Za-z][A-Za-z0-9_]+\.ts:' C85-ELEMENT-WALL.md | tr -d '`:' | sort -u   # -> 67
> # each name: find packages apps plugins -name "<name>.ts" -not -path '*/node_modules/*' | wc -l  -> 1
> ```
>
> This is recorded because it is **not** true suite-wide: C78 carries 34 bare-filename citations
> that a reader cannot resolve. A bare basename is only safe while it stays unique, so this is a
> property to re-check, not a permanent guarantee — if a second `WallTypes.ts` or
> `MoveWall.ts` is ever added, every citation here silently becomes ambiguous.

---

## 1. IDENTITY

### AS-IS — measured

| Axis | Measured |
|---|---|
| L0 schema | `packages/schemas/src/elements/Wall.ts:57` — `defineElement('wall', {…})`; refinements `:141, :151, :158`; type export `:167` |
| Plugin DTO storeKey | `'wall'` — `plugins/wall/src/store.ts:29` (`super('wall')`) |
| Legacy record discriminator | `type: 'wall'` — `packages/geometry-wall/src/WallTypes.ts:249` (`:248` is the `interface WallData` line — off by one, corrected 2026-08-18); written by the bridge at `apps/editor/src/engine/initTools.ts:1192` (was `:1149`; the file grew by §FIX-ANY-STORE-SEAM, `9f14b795`) |
| Runtime store-registry key | `'wall'` — `packages/runtime-composer/src/composeRuntime.ts:1556` (`storeRegistry.register('wall', wallStore)`) |
| Bus verb namespace | `wall.*` — the plugin registers **28** verbs: `WALL_HANDLER_TYPES` is **27** entries (`plugins/wall/src/handlers/index.ts:64-107`) and `WALL_HANDLER_TYPES_WITH_CATALOGUE` (`:110-113`) adds `wall.setSystemType` when a catalogue is wired. ⚠ **This row read "45 verb strings" until 2026-08-18 and that number is RETRACTED: no command derives it.** Repo-wide `grep -rhoE "'wall\.[a-zA-Z][a-zA-Z.-]*'" --include=*.ts packages plugins apps src \| sort -u \| wc -l` → **60**, and that set is not the verb set — it includes 10 `*.handler` registration ids, the `wall.created` / `wall.opening.created` EVENTS, and non-verb tokens (`wall.tool`, `wall.draw`, `wall.noop`, `wall.lengthMin`, `wall.thicknessMin`, `wall.baseline`). **Quote 28 with the allowlist, or 60 with the grep — never a third number with no derivation.** |
| `createSnapshot` key | `'wall'` — `packages/command-registry/src/CommandManagerImpl.ts:590-591` |
| `buildUndoStoreMap` keys | `wall`, `walls` — `apps/editor/src/engine/undo/performUndoRedo.ts:312`, both → `window.wallStore` (the **legacy** singleton) |

**`userData.elementType` — ONE family spelling. Wall is CLEAN on C84 §4E, and is recorded `✅`
explicitly per EI-1b** so it is distinguishable from *nobody looked*:

| Literal | Producer sites |
|---|---|
| `'wall'` | `WallFragmentBuilder.ts:560`, `:896`; `WallLayerPlanSymbolBuilder.ts:125`; `WallStore.ts:1683` (storeEventBus); `AlignPlanToolHandler.ts:238`; `roomContentsFacets.ts:227`; `PropertyPanelBodyRenderer.ts:243`; `PropertyPanelPreDraw.ts:214`; `PropertyPanelTypeSelector.ts:86` |
| `'wallSystemType'` | `WallSystemTypeStore.ts:263, :289, :301, :314` — a **type-library** tag, not an instance tag |
| `'WallPart'` | `WallFragmentBuilder.ts:2332` — the header/lintel mesh around an opening void |

### TO-BE — normative

- **W-ID-1.** The canonical `userData.elementType` is **`'wall'`**, frozen, compared
  case-insensitively per [C15 §12](C15-HOSTED-ELEMENT-CONTRACT.md). Wall already satisfies this.
- **W-ID-2.** `'WallPart'` is a **sub-part**, not a family tag, and MUST carry C15 §12's
  `userData.role = 'geometry'` + `parentId` rather than being read as an element type.
  `'wallSystemType'` names a *type library entry* and MUST NOT be conflated with an instance.
- **W-ID-3.** The 45-verb namespace is the widest of any family. **No new `wall.*` verb may be
  minted without adding its row to §6**, including its lineage and its write/restore sets.

---

## 2. STORES — and which is THE AUTHORITY

### AS-IS — measured. FIVE representations.

| # | Representation | File:line | Notes |
|---|---|---|---|
| 1 | **L0 Zod schema** | `packages/schemas/src/elements/Wall.ts:57` | `provenance:73`, `confidence:89`, `levelId:91`, `baseLine:92`, `curve:98` (`WallCurve:48` — `control:50`, `segments:52`), `height:100`, `thickness:102`, `baseOffset:104`, `openings:105` (`Opening:35` — `id:36`, `type:37`, `doorType:38`, `windowType:39`, `offset:41`, `width:42`, `height:43`, `sillHeight:44`, `elementId:45`), `materialId:106`, `materialColor:107`, `systemTypeId:108`, `layers:109` (`WallLayer:26` — `name:27`, `function:28`, `thickness:30`, `materialId:31`, `materialColor:32`), `frontSide:110`, `backSide:111`, `joinIntent:130` (`start:132`, `end:133`) + BaseNode `id`, `type`, `parentId`, `childrenIds`, `metadata`, `ifcData` (`base/BaseNode.ts:11-20, :45-48`) |
| 2 | **Plugin DTO store** | `plugins/wall/src/store.ts:27` (`class WallStore extends Store<WallData>`), key `:29`; `WallData = WallSchemaInfer` `:18`; `WallsState` `:25` | Shape is identical to (1). **This is the store the BAKE WORKER reads.** |
| 3 | **Legacy geometry store** | `packages/geometry-wall/src/WallStore.ts:138` (class), **singleton `:1747`** (`export const wallStore = new WallStore()`); record `WallTypes.ts:247` | Superset of (1): adds `rakeAngleDeg:311`, `sideFinishes:414`, `_renderVersion:424`, `_sourceBaseLine:438`, `properties`, `loadBearing`; keeps `ifcData:333`, `metadata:330` |
| 4 | **Kernel producer** | `packages/geometry-kernel/src/producers/wall.ts:73` (`produceWall`), type `:48`, degenerate refusal `:78-81`; companion `wallVoids.ts` | Reads the **L0** shape |
| 5 | **Scene `userData`** | `WallFragmentBuilder.ts:560, :896, :2332`; group openings mirror `:966` | see §1 |

**`window.*` globals:** `initBuilders.ts:552` (`window.wallStore = wallStore`), `:566`
(`window.wallSystemTypeStore`), and a **second assignment** at `initTools.ts:1020`
(`window.wallStore = wallTool.getWallStore()`) — cited as `:977` until 2026-08-18; the line moved with
`9f14b795`, the assignment did not.

**Fields the L0 schema CANNOT express** (present on the legacy record, absent from
`packages/schemas/src/elements/Wall.ts`): **`rakeAngleDeg`**, `sideFinishes`, `_sourceBaseLine`,
`_renderVersion`, `properties`, `loadBearing`.

> ⚠ **`grep -rn "rake" packages/schemas/src/` → ZERO hits.** The rake is unrepresentable at L0. It
> is authored only through `wall.updateRakeBatch` (`UpdateWallsRakeBatch.ts:67`), whose
> `affectedStores` is **`[] as const`** (`:68`) — lineage L3, bridging to a legacy command. It is
> persisted (`ProjectSerializer.ts:559-560`, restored `ProjectLoader.ts:891`) and consumed by seven
> geometry modules (§10). **It exists everywhere except the layer that is supposed to be the
> authority for element shape.**

**Two fields are declared and provably unused.** `WallTypes.ts:396-404` states, in-file, that
`frontSide` (`:394`) and `backSide` (`:395`) have *"ZERO write sites and ZERO read sites in the
entire repo"* — while the L0 schema also declares them (`Wall.ts:110-111`). A field declared twice
and written nowhere is not a gap; it is a declared dead affordance and is recorded as such.

### THE AUTHORITY

> **`packages/geometry-wall`'s `wallStore` singleton (representation 3) is the AUTHORITY.**

Every editor-side consumer reads it (§3). **But it is not universal, and that is the split-brain**:
the bake worker reads representation 2. See §3.

### TO-BE — normative

- **W-S-1 (EI-1).** `geometry-wall`'s `wallStore` is the declared authority for every **editor**
  consumer. **The bake worker's use of the plugin DTO store is a DECLARED SPLIT (§3 W-C-2), not an
  accident**, and it is bounded by ADR-0331 §D5 — *"what is Stack B for?"* — which C84 §9 escalates
  to the founder. ⛔ **No lane may close this split unilaterally.**
- **W-S-2 (EI-1a / C03 §4.6 U-2b).** The key `'wall'` resolves at WRITE time to the plugin DTO
  snapshot and at UNDO time to `window.wallStore` (`performUndoRedo.ts:312`). **They are not the
  same object.** DECLARED. Seven handlers already respond correctly by refusing (§4); the rest do
  not.
- **W-S-3.** `rakeAngleDeg` MUST be added to the L0 schema, or the rake MUST be declared a
  legacy-only concept that no bus verb may author. **Today it is neither**, and §11 #1 is the
  consequence.
- **W-S-4.** `frontSide` / `backSide` MUST be removed from both schemas, or given a writer.
  `WallTypes.ts:396-404` already measured them dead; a contract may not leave that recorded and
  unactioned.
- **W-S-5.** `window.wallStore` MUST have ONE assignment site. Two (`initBuilders.ts:552`,
  `initTools.ts:977`) is EI-9 — one answer, two writers, and no declared ordering.

---

## 3. CONSUMERS — the split-brain, at the top as C84 §6 requires

`✅` reads the authority · `⚠️` reads something else · `?` NOT MEASURED

| Consumer | Reads | Evidence |
|---|---|---|
| **Renderer — store wiring** | ✅ legacy singleton | `apps/editor/src/engine/initBuilders.ts:77` (`import { wallStore as wallStoreSingleton } from '@pryzm/geometry-wall/store'`), `:551` `attachEngine(projectContext, bimManager)`, `:552` global, `:557` `installWallLayerPlanSymbolBuilder(wallStore)` |
| **Renderer — mesh build** | ✅ legacy | `WallFragmentBuilder.ts:148`; driven by `WallRebuildCoordinator.ts:31` (`resolveOpeningRenderMap(wall: WallData, store: WallStore)`), store subscriber `:470` |
| **Plan view (editor)** | ✅ legacy | `WallLayerPlanSymbolBuilder.ts:106` (`window.wallStore` fallback), `:125`; plan tools read `window.wallStore` — `DoorPlanToolHandler.ts:475, :523`, `WindowPlanToolHandler.ts:392`, `LinearDimPlanToolHandler.ts:564`, `AnnotationPlanToolHandlers.ts:179, :211, :242`; overlays `PlanViewToolOverlay.ts:446`, `SvpPlanToolOverlay.ts:502` |
| **Persistence — save** | ✅ legacy | LIVE `ProjectSerializer.ts:1010` (`wallStore.getAll().map(serializeWall)`); `serializeWall` `:535-581`; import `:35`; ctx field `:773`; snapshot field `:127` |
| **Persistence — load** | ✅ legacy (via L2) | LIVE `ProjectLoader.ts:874` loop, `:876` `new CreateWallCommand(...)`; hydration guard `:867-871`, `:940`; openings `:920-931` |
| **IFC export** | ✅ legacy | `packages/file-format/src/export/ifc/readers/WallReader.ts:1` (import), `:6` class, `:7` ctor, `:11` `this.store.getAll()` |
| **GLB export** | ✅ scene graph | `GLBExporter.ts:139` `selectElementsForExport(scene)`, `:143` `scene.traverse(...)`, `:332`, `:356`. **No wall-store reference in the file** |
| **BAKE WORKER** | ⚠️ **plugin DTO store — THE SPLIT** | `apps/bake-worker/src/session/HeadlessBakeSession.ts:31` (`import { WallStore } from '@pryzm/plugin-wall'`), `:43` `readonly walls: WallStore`, `:53` `new WallStore()`, `:66` `snap.wall = Object.fromEntries(walls.getState())`, `:84-85` `entry.storeKey === 'wall'` → `walls.applyPatch`, `:124` `produceWallDescriptors`, `:129` `walls.byLevel(levelId)`, `:131` `produceWall(w, NO_JOINS, 0)` |
| **Plugin committer path** | ⚠️ plugin DTO | `apps/editor/src/bootstrap.render.everything.ts:61`, `:135` `new WallCommitter(materialPool)`; class `plugins/wall/src/committer/wall-committer.ts:158`. ⚠ This is a **separate bootstrap file**, not `initBuilders` — C84 §4D records `bootstrapRenderEverything` as unreachable in production (`main.ts:407` passes `canvas: null`) |
| **`plugins/plan-view`** | ⚠️ plugin DTO | `PlanViewCanvasHost.ts:152, :235, :268, :291`, read `:417` `this.wallStore.getState()`. **Construction sites measured: TEST FILES ONLY** — `plan-view-canvas-host.test.ts:125`, `plan-view-auto-dim.test.ts:147, :292`. **No production `new PlanViewCanvasHost` measured** |

### THE SPLIT-BRAIN, stated precisely

> The viewport, the plan view, persistence and IFC export all read
> `packages/geometry-wall`'s `wallStore` singleton. **The bake worker reads
> `@pryzm/plugin-wall`'s `WallStore` — a different class, in a different package, in a different
> process** (`HeadlessBakeSession.ts:31, :53`), fed by **patch replay** (`:84-85`) rather than by
> the legacy store. It then calls `produceWall(w, NO_JOINS, 0)` at `:131`.

**C84 EI-11a names the second half of this and it is confirmed verbatim**: neighbour joins are
discarded (`NO_JOINS`) and level elevation is forced to zero. **Identical code with substituted
inputs is not the same answer.** A self-hosted bake therefore produces walls with square,
unjoined ends at Y=0 — for a model the editor renders mitred at storey elevation.

### TO-BE — normative

- **W-C-1.** Editor-side, the authority is closed at the geometry singleton. A new editor consumer
  reading the plugin DTO store is a merge blocker.
- **W-C-2 — THE SPLIT IS DECLARED, NOT TOLERATED SILENTLY.** The bake worker's use of
  representation 2 MUST be recorded in `HeadlessBakeSession.ts`'s header as a declared divergence
  with (i) the field set it can and cannot see, and (ii) its retirement condition — which is
  ADR-0331 §D5. ⛔ Until that founder question is answered, **nothing in
  `packages/geometry-kernel/src/producers/` may be deleted as dead** (C84 §3.5.2).
- **W-C-3 (EI-11a).** `produceWall(w, NO_JOINS, 0)` MUST refuse loudly, or declare the substitution
  under EI-10(c), rather than bake a plausible wall at the wrong height with the wrong ends.
- **W-C-4.** `plugins/plan-view`'s `PlanViewCanvasHost` has **no measured production constructor**.
  It MUST be declared PARKED (C84 §3.5 — *"loaded gun — log it, do not delete"*) with the condition
  that makes it live, or wired. ⛔ It MUST NOT be deleted on this census alone: axis (b) was not run.

---

## 4. PLUGIN ↔ DTO ↔ COMMAND ↔ BUILDER

### AS-IS — 28 bus handlers in `plugins/wall/src/handlers/`

⚠ **This heading read "30" until 2026-08-18 and contradicted its own table.** Measured:
`ls plugins/wall/src/handlers/*.ts | grep -v index.ts | wc -l` → **28**, the table below has **28**
rows, and the two sets are identical in both directions (`comm` on the sorted basenames → empty
both ways). Registered allowlist `index.ts:64-107` (27 verbs) + `:110-113` (adds
`wall.setSystemType` with a catalogue) = **28 verbs**. The old `:65-112` range was off at both ends.

| Handler | Verb (line) | `affectedStores` (line) | Lineage (C84 §4A) | Refuses? |
|---|---|---|---|---|
| `CreateWall.ts` | `wall.create` `:165` | `['wall']` `:166` | L1 | ⚠ **CONDITIONAL** `:217` — three-valued (§12 R-1) |
| `CreateWallBatch.ts` | `wall.batch.create` `:58` | `['wall']` `:59` | L1 | no (bounds `:66`) |
| `CreateWallBetweenMarks.ts` | `wall.createBetweenMarks` `:63` | `['wall']` `:64` | L1 | no `:68` |
| `CreateWallOpening.ts` | `wall.createOpening` `:106` | `['wall']` `:107` | L1 | no `:109` |
| `CreateWallOpeningLegacyAdapter.ts` | `wall.opening.create` `:47` | `['wall']` `:48` | L1 adapter | no `:50` |
| `CreateWallsFromSlab.ts` | `wall.createFromSlab` `:74` | `['wall']` `:75` | L1 | no `:79` |
| `CreateWallsOnAllSlabs.ts` | `wall.create-on-all-slabs` `:34` | **`[]`** `:35` | fan-out | no `:37` |
| `CutWall.ts` | `wall.cut` `:87` (overridable verb `:99-101`) | `['wall']` `:88` | L1 | no `:105` |
| `SplitWall.ts` | `wall.split` `:46` | `['wall']` `:47` | L1 (subclass of `CutWall`, `:16`) | NOT MEASURED |
| `DeleteWall.ts` | `wall.delete` `:40` | `['wall']` `:41` | L1 | conditional `:45, :48` |
| `JoinWall.ts` | `wall.join` `:53` | `['wall']` `:54` | L1 | no `:56` |
| `ChangeWallLevel.ts` | `wall.changeLevel` `:37` | `['wall']` `:38` | L1 | no `:40` |
| **`MoveWall.ts`** | `wall.move` `:83` | `['wall']` `:84` | L1 | ⛔ **YES, unconditional** `:115` |
| **`TransformWall.ts`** | `wall.transform` `:297` | `['wall']` `:298` | L1 | ⛔ **YES** `:381` |
| **`SetWallColor.ts`** | `wall.setColor` `:72` | `['wall']` `:73` | L1 | ⛔ **YES** `:100` |
| **`SetWallDimensions.ts`** | `wall.setDimensions` `:74` | `['wall']` `:75` | L1 | ⛔ **YES** `:101` |
| **`SetWallLayers.ts`** | `wall.setLayers` `:120` | `['wall']` `:121` | L1 | ⛔ **YES** `:146` |
| **`BulkSetWallVisuals.ts`** | `wall.bulkSetVisuals` `:81` | `['wall']` `:82` | L1 | ⛔ **YES** `:121` |
| `SetWallSystemType.ts` | `wall.setSystemType` `:45` | `['wall']` `:46` | L1 | NOT MEASURED |
| **`UpdateWallBaseline.ts`** | `wall.updateBaseline` `:72` | `['wall']` `:83` | **L4 — hand-forged `PatchPair`** (C84 §4A) | NOT MEASURED |
| **`CascadeWallBaseline.ts`** | `wall.cascadeBaseline` `:34` | **`[]`** `:35` | **L3** — `_skipBridge` short-circuit `:52-54`, legacy bridge via `window.commandManager` `:55-61`, always returns `{forward:[],inverse:[]}` `:66` | conditional (empty entries) `:41` |
| `AddWallLayerBatch.ts` | `wall.addLayerBatch` `:70` | **`[]`** `:71` | L3 | no `:73` |
| `SetWallSideFinishBatch.ts` | `wall.setSideFinishBatch` `:129` | **`[]`** `:130` | L3 | NOT MEASURED |
| `UpdateWallSystemType.ts` | `wall.updateSystemType` `:25` | **`[]`** `:26` | L3 | NOT MEASURED |
| `UpdateWallsColorBatch.ts` | `wall.updateColorBatch` `:75` | **`[]`** `:76` | L3 | NOT MEASURED |
| `UpdateWallsHeightBatch.ts` | `wall.updateHeightBatch` `:117` | **`[]`** `:119` (rationale `:45`) | L3 | NOT MEASURED |
| **`UpdateWallsRakeBatch.ts`** | `wall.updateRakeBatch` `:67` | **`[]`** `:68` | **L3 — the ONLY way to author a rake** | NOT MEASURED |
| `UpdateWallsSystemTypeBatch.ts` | `wall.updateSystemTypeBatch` `:69` | **`[]`** `:70` | L3 | NOT MEASURED |

**Seven verbs carry a categorical `*_UNREACHABLE` refusal** — `wall.move`, `wall.transform`,
`wall.setColor`, `wall.setDimensions`, `wall.setLayers`, `wall.bulkSetVisuals`, plus the conditional
`wall.create`. Each names its live replacement in its reason string; e.g. `MoveWall.ts:79-80`:

> *"wall.move writes the detached plugin wall store that nothing renders, exports or persists, and
> no production surface dispatches it. Moving a wall commits through wall.updateBaseline (payload
> keys: wallId, newBaseLine, prevBaseLine) — the live bridge to UpdateWallBaselineCommand and the
> geometry wallStore, pinned by L-49 — which is what both the 3-D gizmo and the plan Move tool
> already dispatch."*

`SetWallLayers.ts:114-115` states what the refusal repaired: *"a layer edit was written faithfully,
was invisible in the viewport, and was gone after reload (§FIX-WALL-LAYER-EDIT-DETACHED-STORE)."*

### 29 L2 legacy commands — `packages/command-registry/src/walls/`

`AddWallLayerBatchCommand` · `CascadeWallBaselineCommand` · `ChangeWallLevelCommand` ·
`CreateDoorsBetweenAdjacentRoomsCommand` · `CreateWallBetweenMarksCommand` · `CreateWallCommand` ·
`CreateWallOpeningCommand` · `CreateWallOpeningsBatchCommand` · `CreateWallsFromSlabCommand` ·
`CreateWallsOnAllSlabsCommand` · `CreateWindowsOnWallsCommand` · `DeleteElementCommand` ·
`GenericCommands` · `SetAllWallsVisualPropertiesCommand` · `SetAllWallsWidthCommand` ·
`SetWallSideFinishCommand` · `SetWallWidthCommand` · `UpdateWallBaselineCommand` ·
`UpdateWallColorCommand` · `UpdateWallDimensionsCommand` · `UpdateWallHeightCommand` ·
`UpdateWallLayersCommand` · `UpdateWallSystemTypeCommand` · `UpdateWallsColorBatchCommand` ·
`UpdateWallsRakeBatchCommand` · `UpdateWallsSystemTypeBatchCommand` · `hostedOpeningFrameSync` ·
`moveReweldPreflight` · `wallSnapshotUtils`.
Also in `operations/`: `CutWallCommand.ts:45`, `JoinWallsCommand.ts:31`, `MirrorElementCommand.ts:60`,
`OffsetElementCommand.ts:59`, `ScaleElementCommand.ts:42`, `CopyElementCommand.ts:72` — all
`['wall']`.

### TO-BE — normative

- **W-P-1.** The seven refusals **SATISFY [C16 CA-18](C16-COMMAND-AUTHORING-PROTOCOL.md) and MUST
  NOT be "fixed" by restoring silent success** (C84 EI-7a, as corrected). The residual defect is the
  still-offered UI control. **NOT MEASURED**, owned by [C82](C82-RIBBON-CAPABILITY-SURFACE.md).
- **W-P-2.** **NINE verbs declare `affectedStores: []` and are NOT refusals** — this bullet said
  *"Eight"* while its own list enumerated nine; corrected 2026-08-18 by
  `grep -rn affectedStores plugins/wall/src/handlers/*.ts` → **9 distinct files** (note
  `CreateWallsOnAllSlabs.ts` declares it as a static `affectedStores = [] as const;`, which a grep
  written for the object-literal form misses — that is why the count was low) —
  `wall.addLayerBatch`, `wall.cascadeBaseline`, `wall.create-on-all-slabs`,
  `wall.setSideFinishBatch`, `wall.updateSystemType`, `wall.updateColorBatch`,
  `wall.updateHeightBatch`, `wall.updateRakeBatch`, `wall.updateSystemTypeBatch`. Each MUST carry, in
  its header, either the L2 command whose stack owns its undo, or a CA-18 refusal. `_covered()`
  (`performUndoRedo.ts:362`) treats an empty set as **not covered**, so these route to
  `commandManager` — which is correct **only if** an L2 entry was actually pushed.
- **W-P-3.** `wall.cascadeBaseline` (L3, `[]`) is the reweld half of a wall move whose forward half
  is `wall.updateBaseline` (L4, `['wall']`). **One user gesture, two lineages, two undo stacks**
  (C84 §4B). This MUST become one entry.
- **W-P-4.** A complete axis-(b) dispatcher census for all **28** registered verbs is **OWED**
  (§NOT MEASURED). *(Was "45 verbs" — see §1: that number has no derivation and is retracted.)*

---

## 5. THE BRIDGE FIELD MAP — **THE LOAD-BEARING SECTION**

One row per field. Every field has a declared destination: **CARRIED**, **TRANSFORMED**, or
**DROPPED**. Omission is forbidden (C84 EI-2). This is the table `check-bridge-field-coverage.ts`
consumes.

**Hops measured:** `wall.create` payload → `packages/runtime-composer/src/CommandEventBridge.ts:223`
(arm), `:236-256` (emit) → `apps/editor/src/engine/initTools.ts:1059` subscriber (record written
`:1147-1183`) → legacy `wallStore` → `ProjectSerializer.ts:535-581` → `ProjectLoader.ts:876-915`.
The bridge prefers the **committed** Immer patch value over the request payload
(`indexCommittedWalls` `:80-92`; source type `CommittedWall` `:42-56`) — §FIX-WALL-LAYERS L-239.

| # | Field | CEB reads | CEB emits | initTools → legacy | Serialised | Reloaded | **Disposition** |
|---|---|---|---|---|---|---|---|
| 1 | `id` | ✅ `:43` | `wallId` `:241` | `id` `:1148` | ✅ `:542` | ✅ `:876` | **CARRIED** |
| 2 | `type` | ⛔ | `commandType` (literal) `:238` | literal `'wall'` `:1149` | ✅ `:543` | — | **TRANSFORMED** |
| 3 | `levelId` | ✅ `:44` | ✅ `:239` | `:1154` | ✅ `:544` | ✅ `:881` | **CARRIED (LOSSY)** — `levelId === ''` ⇒ `resolvedLevelId = null` `:1129-1130`, **spatial registration SKIPPED** with a warn `:1131-1136`, record stored with `levelId: ''` `:1154` |
| 4 | `baseLine` | ✅ `:45` | ✅ `:242` | `:1155-1158` | ✅ `:540, :546` (prefers `_sourceBaseLine`) | ✅ `start:877`/`end:878` | **TRANSFORMED (LOSSY)** — `y` coerced `?? 0` at `:1156-1157`; the level-elevation convention (`WallTypes.ts:252-270`) is **not preserved on this path** |
| 5 | `curve` | ✅ `:55` | ✅ `:255` | `:1182` (conditional) | ✅ `:556` | ✅ `:885` | **CARRIED** — §FIX-WALL-CURVE-PLAN-VS-3D (2026-08-06); plan-created curved walls previously drew the chord |
| 6 | `height` | ✅ `:46` | ✅ `:243` | `?? 2.7` `:1159` | ✅ `:547` | ✅ `:879` | **CARRIED (DEFAULTED)** |
| 7 | `thickness` | ✅ `:47` | ✅ `:244` | `?? 0.2` `:1160` | ✅ `:548` | ✅ `:880` | **CARRIED (DEFAULTED)** |
| 8 | `baseOffset` | ✅ `:48` | ✅ `:245` | conditional `:1161` | ✅ `:549` | ✅ `:882` | **CARRIED** |
| 9 | `systemTypeId` | ✅ `:49` | ✅ `:246` | conditional `:1162` | ✅ `:555` | ✅ `:892` | **CARRIED** |
| 10 | `materialColor` | ✅ `:50` | ✅ `:249` | conditional `:1169` | ✅ `:551` | ✅ `:884` | **CARRIED** — §RESI-FACADE-COLOUR-PERSIST (2026-06-24); *"the field was dropped here before"* |
| 11 | `layers` | ✅ `:51` | ✅ `:252` | conditional `:1173` | ✅ `:554` | ✅ `:902` | **CARRIED** — §RESI-FACADE-INTERIOR-WHITE |
| 11a | ↳ `layers[].materialId` | ✅ `:51` (nested) | ✅ (nested) | ✅ (nested) | ✅ (nested) | ✅ | **CARRIED** — the ONLY `materialId` the bridge carries |
| **12** | **`materialId`** (element-level) `Wall.ts:106` | ⛔ **absent from `CommittedWall:42-56`** | ⛔ | ⛔ | ✅ `:550` | ✅ `:883` | ⛔ **DROPPED (SILENT)** — C84 EI-2(a) confirmed. Both ends hold the field; the bridge does not. `initBusHandlers.ts:1160` records that *"WallFragmentBuilder reads `materialId` (library lookup) + `materialColor`"*. **Slab (`:367`, `:406`), ceiling (`:511`, `:551`) and beam (`:583`, `:620`) arms all carry it. Wall's does not.** |
| **13** | **`openings`** `Wall.ts:105` | ⛔ | ⛔ | ⛔ | ✅ `:552` | ✅ separately `:920-931` | ⛔ **DROPPED (SILENT)** — deliberate in effect: openings arrive by `wall.createOpening`, never on `wall.create`. **Owned by [C86](C86-ELEMENT-WALL-OPENING.md)** |
| **14** | **`joinIntent`** `Wall.ts:130` | ⛔ | ⛔ | ⛔ | ✅ `:575` | ✅ `:912` | ⛔ **DROPPED (SILENT) — AND IT IS THE ONE FIELD THE SCHEMA SAYS IS IRRECOVERABLE.** `ProjectSerializer.ts:559-573` verbatim: *"This is the ONLY field on a wall that cannot be recovered if it is dropped … L-923 proved no predicate over geometry, type, thickness or createdAt can reconstruct it."* The serializer learned that lesson; **the bridge has not.** A bus-created wall carries no `joinIntent` at all |
| **15** | **`rakeAngleDeg`** (legacy-only, `WallTypes.ts:311`) | ⛔ | ⛔ | ⛔ | ✅ `:560` | ✅ `:891` | ⛔ **STRUCTURALLY ABSENT** — no L0 field exists to carry it (§2) |
| 16 | `childrenIds` | ⛔ | ⛔ | ⛔ | ✅ `:553` | ⛔ | **DROPPED (SILENT)** both ways |
| 17 | `parentId` | ⛔ | ⛔ | ⛔ | ✅ `:545` | ⛔ | **DROPPED (SILENT)** both ways |
| 18 | `metadata` | ⛔ | ⛔ | ⛔ | ✅ `:578` | ⛔ | **DROPPED (SILENT)** — see ADR-0319 §2 and §7 W-U-3 |
| 19 | `ifcData` | ⛔ | ⛔ | ⛔ | ✅ `:577` | ⚠ `ifcGuid` only `:888`; **`ifcClass` not restored** | **DROPPED (SILENT)** in flight; **PARTIAL** on reload |
| 20 | `provenance` `:73` | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ **DROPPED (SILENT)** — a C75 §2.4 field that never reaches the record persistence writes |
| 21 | `confidence` `:89` | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ **DROPPED (SILENT)** |
| 22 | `frontSide` / `backSide` `:110-111` | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | **DECLARED DEAD** — `WallTypes.ts:396-404`: zero writers, zero readers |
| 23 | `sideFinishes` (legacy-only `:414`) | ⛔ | ⛔ | ⛔ | ⛔ | ✅ | ✅ **SERIALISED 2026-08-19 (L-999, lane WF1)** — ⛔ this row read **NEVER SERIALISED** and was true when written. Closing it took **FOUR** hand-written whitelists (two serializers + two loaders) plus `CreateWallCommand`'s option literal. ⚠ **And the write leg was broken too, which this row never suspected**: `WallStore.updateWall()` projects onto a **12-field whitelist** that omitted `sideFinishes`, so the store discarded it while the command returned `{success:true}` — and `restoreSnapshot()` carried the identical omission (C84 **EI-7a**). **`sideFinishes` still has NO L0 representation** — the same shape as §11 row 2's rake |
| 24 | `_renderVersion` `:424` | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | **DELIBERATE** — transient render bookkeeping |
| 25 | `properties`, `loadBearing` | ⛔ | ⛔ | ⛔ | ✅ `:576`, `:579` | ⛔ | **DROPPED (SILENT)** on reload |
| — | `commandId` `:237`, `wallCount` `:240` | — | ✅ | ⛔ **never read** | — | — | **EMITTED, UNCONSUMED** — EI-13 shape |

**Batch arm (`:259-300`) emits the identical 13 fields per element** (`:281-299`) with
`commandType` forced to `'wall.create'` at `:282` — so the downstream
`ev.commandType !== 'wall.batch.create'` guards are dead code (C84 §4B).

**One more silent exit, not a field:** `initTools.ts:1144-1145` skips the entire legacy mirror when
`_legacyWallStoreForBridge.getById(ev.wallId)` is truthy. An id collision therefore drops the wall
from the authority with no error.

### TO-BE — normative

- **W-B-1 (EI-2).** Every **DROPPED (SILENT)** row MUST become CARRIED or **DROPPED (DECLARED)** —
  named at the drop site with its reason. Silence is the defect.
- **W-B-2.** Rows **12** (`materialId`) and **14** (`joinIntent`) are the priority: both ends hold
  them, only the bridge does not, and row 14 is unreconstructable by the serializer's own measured
  proof (L-923).
- ~~**W-B-3.** Row 23 (`sideFinishes`) MUST be serialised or the `wall.setSideFinishBatch` affordance
  MUST be removed~~ — ✅ **DISCHARGED 2026-08-19 (L-999).** It is serialised, and the round-trip is
  pinned. The clause it rests on stands and is restated because it will bind the next field:
  C84 **EI-6** — *"every family that can be created MUST round-trip, or the creation affordance MUST
  be removed."* Applied here to a field rather than a family. **What remains is narrower and is NOT
  discharged: `sideFinishes` has no L0 schema representation**, so the authority for this field is
  still the legacy record alone (W-S-3's problem, one field over).
- **W-B-4.** Row 4's `?? 0` on `baseLine.y` MUST be replaced by the declared elevation convention or
  MUST refuse. A datum defaulted at a bridge is C84 §1's `??`-default mechanism.
- **W-B-5.** `initTools.ts:1144-1145`'s silent skip MUST warn, and `commandId`/`wallCount` MUST be
  consumed or removed from the emit (EI-13).

---

## 6. VERBS

`W` = stores WRITTEN · `R` = stores RESTORED on undo · **`=`** = equal.

| Verb | Lineage | W | R | `=`? | Note |
|---|---|---|---|---|---|
| `wall.create` | L1 | DTO + legacy (via CEB→initTools) | legacy only | ⛔ | EI-7a. Refuses when the authority is registered-but-detached (§12 R-1) |
| `wall.batch.create` | L1 | same | same | ⛔ | one patch pair covers N — correct |
| `wall.createOpening` / `wall.opening.create` | L1 | wall `openings[]` + `doorStore`/`windowStore` | legacy | ⛔ | **C86 owns this** |
| `wall.delete` | L1 | DTO `delete draft[cmd.id]` `:61` | legacy | ⛔ | ⛔ **NO CASCADE** — §8 |
| `wall.cut` / `wall.split` | L1 | DTO | legacy | ⛔ | — |
| `wall.join` | L1 | DTO | legacy | ⛔ | — |
| `wall.changeLevel` | L1 | DTO | legacy via `changeLevel()` `elementUndoStoreAdapter.ts:321-332` (§L-946) | ⚠ partial | **Neither side writes a LevelStore** — `ChangeWallLevel.ts:8-13` |
| **`wall.move`** | L1 | — refuses `:115` | n/a | ✅ vacuously | CA-18 conformant |
| **`wall.transform`** | L1 | — refuses `:381` | n/a | ✅ vacuously | CA-18 conformant |
| **`wall.updateBaseline`** | **L4** — hand-forged `PatchPair` | legacy | ring buffer | ⚠ | **THE LIVE MOVE PATH.** C84 §4B: *"correct by accident, not by design"* |
| **`wall.cascadeBaseline`** | **L3**, `[]` | legacy via `window.commandManager` `:55-61` | L2 stack | ⛔ | **The reweld half. One gesture, two undo entries, two stacks** |
| `wall.setColor` / `wall.setDimensions` / `wall.setLayers` / `wall.bulkSetVisuals` | L1 | — all refuse | n/a | ✅ vacuously | each names its live replacement |
| `wall.updateColor` / `wall.updateColorBatch` | L3 | legacy | L2 stack | ⚠ | the live colour path |
| `wall.updateDimensions` | L3 | legacy | L2 stack | ⚠ | §FIX-DIMS-REACH-RECORD (ADR-0315 U1 / L-815) |
| `wall.updateLayers` / `wall.addLayerBatch` | L3 | legacy | L2 stack | ⚠ | the live layer path |
| `wall.updateHeightBatch` | L3, `[]` | legacy | L2 stack | ⚠ | rationale `UpdateWallsHeightBatch.ts:45` |
| **`wall.updateRakeBatch`** | **L3**, `[]` | legacy `rakeAngleDeg` | L2 stack | ⚠ | **the ONLY rake author; no L0 representation** |
| `wall.setSideFinishBatch` | L3, `[]` | legacy `sideFinishes` | L2 stack | ⚠ | ✅ **persisted since 2026-08-19** (§5 row 23, L-999). ⛔ **This row said the verb wrote `sideFinishes`. It did not write anything** — `WallStore.updateWall()`'s 12-field whitelist dropped it silently while the command reported success. Fixed with the persistence half |
| `wall.setSystemType` / `wall.updateSystemType` / `wall.updateSystemTypeBatch` | L1 / L3 | mixed | mixed | ⛔ | — |
| `wall.create-on-all-slabs` / `wall.createFromSlab` / `wall.createBetweenMarks` | L1 | DTO | legacy | ⛔ | — |
| `wall.updateCurtainWall` | L3 | legacy `curtainWallStore` | L2 stack | ✅ | **Owned by [C87](C87-ELEMENT-CURTAIN-WALL.md)**; namespaced `wall.*` for historical reasons |
| **ROTATE** | — | — | — | — | ⛔ **NO ROTATE VERB EXISTS.** Rotation is expressed as a baseline edit. Declared, not omitted |
| **MATERIAL / COLOUR** | see above | — | — | — | `wall.setColor` refuses; `wall.updateColor*` is live. **`materialId` cannot be set through any bus verb that reaches the authority** — §5 row 12 |

### TO-BE — normative

- **W-V-1.** Every row must reach `=` ✅. Interim: the refusals are correct; the `[]` L3 verbs MUST
  name their L2 owner (W-P-2).
- **W-V-2.** `wall.updateBaseline` (L4) + `wall.cascadeBaseline` (L3) MUST become ONE undo entry.
- **W-V-3.** A `wall.setMaterial`-shaped verb that reaches the authority is **OWED**; today no path
  sets element-level `materialId` through the bus.

---

## 7. UNDO / REDO

### W-U-1 — the repo-wide inequality holds here (EI-7a)

Every `['wall']` bus verb writes the plugin DTO snapshot; `performUndoRedo.ts:312` routes the inverse
to `window.wallStore` — the **legacy** singleton. `WRITES ⊋ RESTORES` on every one. Undo a
`wall.create`: the wall leaves the viewport and **stays in the plugin store forever**.
`MoveWall.ts:58-63` names this hazard verbatim and cites its pin,
`apps/editor/__tests__/deadMoveVerbAuthoritativeState.test.ts`.

### W-U-2 — `createSnapshot` covers `'wall'`

`CommandManagerImpl.ts:590-591` — `if (wants('wall')) { snap.wallStore = structuredClone(ctx.stores.wallStore.getAll()); }`.
`wants()` `:587` is exact-match; `'wall'` matches. Snapshot taken `:286`; all-stores fallback when
`affectedStores` is absent or empty `:582-584`.

> ⚠ **But `DeleteElementCommand.ts:55` declares FIFTEEN keys** — `["wall","slab","column",
> "curtainWall","furniture","handrail","roof","floor","ceiling","beam","plumbing","stair","level",
> "window","door"]` — and `createSnapshot`'s recognised set is `wall`/`slab`/`level` (`:590-600`) plus
> the 13 `optionalStores` (`:609-625`). **`'plumbing'` is in neither.** A wall delete therefore
> promises a plumbing rollback it cannot deliver — C84 **EI-7d**, silently, with no warning
> (L-953's class).

### W-U-3 — audit envelope (ADR-0319 §2)

Wall is the **one** family `restoreWallAudit` covers.
`UpdateElementParameterCommand.ts:410-413` gates on `t === 'wall' | 'door' | 'window'`, and only
`WallStore` carries the `preserveMetadata` contract (`:213-218`, `:428`, `:436-445`). So a wall
parameter undo **is** audit-neutral — and that is exactly why the other eight routed families
(L-952) are not: **the mechanism exists, on one store, and was never generalised.**

### W-U-4 — the openings trapdoor lives on wall's undo path

`elementUndoStoreAdapter.ts:295-297` routes a field-level `openings` patch to
`_reconcileWallOpenings(store, id, Array.isArray(p.value) ? … : [])`. When the patch value is a
*single* opening object — exactly what a `[wallId,'openings',N]` index patch carries — the ternary
falls to `[]` and **every opening is stripped from the wall** (C84 EI-7b). `childrenIds` gets an
explicit skip `:301`; `levelId` a routed path `:321-332`.

### TO-BE — normative

- **W-U-1n.** ADR-0331 §D3 (route the forward patch through `elementUndoStoreAdapter`) is the named
  exit for W-U-1. ⚠ C84 §9 records it as **never executed**; the SPEC sequences a one-verb probe
  first. Pinned by `busCreateUndoLeavesPluginStore.test.ts` (C84 §5 #1) — **which will pass today
  and must be watched doing so.**
- **W-U-2n.** `DeleteElementCommand`'s 15 declared keys MUST all be recognised by `createSnapshot`,
  or the declaration MUST shrink. Gated by `check-affected-stores.ts` (C84 §5).
- **W-U-3n.** `preserveMetadata` MUST be generalised off `WallStore` so ADR-0319 §2 holds for every
  routed family (L-952's stated fix). **C85 is the source of the mechanism; C90/C92 are its
  first debtors.**
- **W-U-4n.** `_reconcileWallOpenings`'s `: []` fallback MUST refuse rather than default. Stripping
  every opening is not a safe interpretation of an unrecognised patch shape.

---

## 8. CASCADES

| Cascade | Trigger | Reversed? | Evidence |
|---|---|---|---|
| **Hosted openings on wall delete (L2)** | `DeleteElementCommand` | ✅ | `:243` `childrenIds`, loop `:250-267`: `elementRegistry.unregister` `:251`, `bimMgr.unregisterElement` `:253`, `semanticGraphManager.removeAllRelationshipsForElement` `:258`, **`doorStore.remove(childId)` `:265`, `windowStore.remove(childId)` `:266`**. Graph capture `:248`; store removal `:269`; restore `:792, :812, :824, :838`. ⚠ `:264` — *"idempotent — safe to call for every child id"*: the command reconciles C86's split-brain **by brute force**, not by knowing which child is a door |
| **Hosted openings on wall delete (L1 `wall.delete`)** | `wall.delete` | ⛔ **NO CASCADE AT ALL** | `DeleteWall.ts:15-17` verbatim: *"does NOT cascade to door/window/opening stores (those land when the door + window plugins arrive in S11…)"*. **The door and window plugins now exist** (`plugins/door`, `plugins/window`) — the promised S11 cascade was never added. Execute is a bare `delete draft[cmd.id]` `:61` |
| **Wall joins on delete** | `DeleteElementCommand` | ⚠ snapshot only | Neighbour-baseline capture `:218-232` (`id:221`, `baseLine:222-225`, `_sourceBaseLine:226-231`); field decl `:44-45`; rationale `:34-40`, `:213-217` — the header concedes the resolver *"cannot guarantee the EXACT pre-delete trim"* |
| **Wall move → reweld** | `WallMoveReweldService` | ⚠ separate stack | `WallMoveReweldService.ts:298` — one of only **THREE** `isReverting()` consumers repo-wide (with `SlabWallConnectivityService.ts:1047` and `FinishHostDependencyTracker.ts:297`; definition `CommandManagerImpl.ts:741`). Preflight `packages/command-registry/src/walls/moveReweldPreflight.ts`. Cascade command `CascadeWallBaselineCommand.ts:112`, re-entrancy guard `isCascadeWallBaselineApplying()` `:73`, atomicity note `:210` |
| **Wall → room topology after undo** | `RoomTopologyObserver` | ⛔ **RECOMPUTED, NOT RESTORED** | C84 EI-7e — `RoomTopologyObserver.ts:513-520` discharges suppressed commits on `resume()`. Whether user-authored room name/number/finish survive is **NOT MEASURED** and is C84 §9's highest-value open question |
| **Wall → slab connectivity** | `SlabWallConnectivityService` | ⚠ guarded | `:1041` `isCascadeWallBaselineApplying()`, `:1047` `isReverting()`. **Owned by [C92](C92-ELEMENT-SLAB.md)** |
| **Wall → roof (`boundingWallIds`)** | region-traced roof | ⚠ one-way | **Owned by [C90](C90-ELEMENT-ROOF.md)** |
| **`plugins/cross` wall→room rule** | registers `wall.delete` | ⛔ **DORMANT** | C84 EI-12's worked example: `plugins/cross/src/wall-room.ts:53, :61` registers the trigger; nothing dispatches `wall.delete`; `buildWallRoomCascadeRule` has **zero** non-test call sites; the registration example at `:45` is commented out. ⛔ **Do not "fix" by dispatching `wall.delete`** — C84 §8.h |

### TO-BE — normative

- **W-X-1.** `wall.delete`'s missing cascade is a **live divergence**: deleting a wall by the L2 path
  removes hosted door/window records; deleting it by the L1 bus verb leaves them and their 3-D
  meshes orphaned. Per **EI-4a — ONE ROUTE PER USER INTENT** — the exit is to make `wall.delete`
  delegate to the one route, **not** to copy the cascade into it.
- **W-X-2 (EI-12).** `plugins/cross/src/wall-room.ts` MUST declare itself **dormant** with the
  condition that makes it live (BIM30 R2 / ADR-0322), rather than reading as wired.
- **W-X-3.** Every cascade above that runs outside patch capture MUST be named in its command's
  header. `WallMoveReweldService` and `CascadeWallBaselineCommand` already do; the room recompute
  does not.

---

## 9. VOCABULARIES

### Material — a FOUR-slot vocabulary

| Slot | Site |
|---|---|
| element `materialId` (catalogue id) | `Wall.ts:106`; legacy `WallTypes.ts:323`; catalogue note `:151` — *"references the `@pryzm/core-app-model` material library"* |
| element `materialColor` (hex tint) | `Wall.ts:107`; `WallTypes.ts:324` |
| per-layer `materialId` / `materialColor` | `Wall.ts:31-32`; `WallTypes.ts:120` |
| per-side `sideFinishes` (rung-1 override) | `WallTypes.ts:414`, rationale `:407-413` |

Both element-level slots are read by the renderer — `initBusHandlers.ts:1160`: *"WallFragmentBuilder
reads `materialId` (library lookup) + `materialColor`."* **Only `materialColor` crosses the bridge**
(§5 row 12).

**`plugins/wall/src/committer/material-bridge.ts`** — note the path: under `committer/`, not
directly under `src/`. Key format `:7-10`: `wall|<systemTypeId>|<materialId>|<color>|<layerName>`,
minted by `packages/geometry-kernel/src/producers/_internal/composeMaterialKey.ts`. Parse `:33-36`
(guard `parts.length < 5 || parts[0] !== 'wall'`; colour slot index **3**). Constants
`PRYZM1_WALL_ROUGHNESS = 0.85` `:23`, `PRYZM1_WALL_METALNESS = 0.05` `:24`,
`FALLBACK_COLOR = '#d4c5b0'` `:25`.

> ⚠ **It reads slot 3 (colour) and never slot 2 (`materialId`).** This is the **same measured defect
> as curtain-wall's** ([C87 §9](C87-ELEMENT-CURTAIN-WALL.md)): the material-library id is parsed past
> and discarded, so only the raw hex survives. Two families, one shape — **EI-9: one question
> answered twice, wrongly, in two places.**

### Enum vocabularies

- `WallLayerFunction` — `Wall.ts:17`. **NOT MEASURED**: whether every member survives to the builder.
- `WallSide` — `Wall.ts:55`, consumed by `frontSide`/`backSide`, which are **declared dead**
  (`WallTypes.ts:396-404`).
- `joinIntent` — `'butt' | 'through'` (`Wall.ts:132-133`). Deliberately **without a default**
  (`Wall.ts:118-129`): absent means *unknown/legacy*, and the resolver branches on presence. ✅
  correct by design. **The bridge's silent drop (§5 row 14) defeats it.**
- Rake bounds — `WallRake.ts`: `RAKE_VERTICAL_DEG:182`, `RAKE_MIN_DEG:191`, `RAKE_MAX_DEG:192`,
  `RAKE_VERTICAL_EPS_DEG:195`, `rakeAuthorability:368`, `RakeAuthorability:349`.

**No EI-3 violation measured for wall** — no wall enum member was found that the UI offers and the
pipeline cannot carry. Recorded `✅` explicitly per EI-1b, with the caveat that the
`WallLayerFunction` sweep is NOT MEASURED.

### TO-BE — normative

- **W-Voc-1.** `material-bridge.ts` MUST consume `parts[2]`, or MUST refuse a key carrying a
  `materialId` it will ignore. **Fix it once, for wall and curtain-wall together** — EI-9.
- **W-Voc-2.** `WallLayerFunction` member-by-member carriage MUST be measured (see NOT MEASURED).

---

## 10. GEOMETRY

### Stack A — `packages/geometry-wall` (the viewport)

`WallFragmentBuilder.ts:148` (class); `SingleVolumeWallParams:82`, `SingleVolumeWallDescriptor:90`,
`SingleVolumeWallProducer:97`, `WallFragment:136`. Layer builders:
`CurvedWallLayerBuilder.ts:36` (`buildCurvedLayerGeometry`), `:224` (`computeStations`), `Station:17`.
Corner: `MiterPrismBuilder.ts:53` (`buildMiterPrism`).

### Stack B — `packages/geometry-kernel/src/producers/wall.ts:73` (`produceWall`)

Type `:48`; implicit single layer `:54-64`; degenerate-length refusal `:78-81`. Companion
`wallVoids.ts` — **deliberately unwired**, its own `:10-15` declaring phase 3 behind a flag.

### Proven to agree? — the ONE case measured, and it diverges

C84 §4D / EI-11: `tests/parity/wall/stackAB-miter-parity.test.ts` — **9 of 10 cases agree with an
observed worst spread of 2.2e-7 m; `curved-MITERED-both-ends` diverges by 9.774 m.** Stack A
projects the miter plane into the corner table its face loops consume
(`CurvedWallLayerBuilder.ts:69-83`, §FIX-CURVED-WALL-MITER-WATERTIGHT); Stack B projects the cap
quad only and its loops consume unprojected stations (`buildCurvedLayer.ts:133-137, :159-165`).

> ⛔ **THREE THINGS C85 MUST NOT LET A READER ASSUME.**
> **(a) The harness is NOT on `main`.** C84 §5, corrected: it exists only in the lane worktree
> `z8-dupaudit`. **A gate that exists in a worktree gates nothing at HEAD.**
> **(b) `2.2e-7` is an OBSERVATION, not the gate.** The harness threshold is `const TOL = 1e-4`
> (`:107`) plus `toBeCloseTo(…, 4)` = 5e-5 — three orders looser. It MUST consume C73's declared
> tolerance module (`packages/geometry-kernel/src/tolerance.ts`, shipped 2026-08-13 per **L-954**)
> before it lands.
> **(c) [C73 §3.7](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md)'s declaration is OWED.** C84 records
> the divergence and pins it; **it never declares which stack is right.** Stack A carries the fix tag
> and Stack B predates it — evidence, not a declaration.

**`buildCurvedLayerGeometry` exists THREE times** (C84 EI-9): `CurvedWallLayerBuilder.ts:36`; an
inline near-verbatim duplicate at `WallFragmentBuilder.ts:1607-1838`, both live and split by a
layer-count branch (verdict **LIVE FORK**, C84 §3.5.3); and
`producers/_internal/buildCurvedLayer.ts:56`. `buildMiterPrism` exists twice
(`MiterPrismBuilder.ts:53`, `producers/_internal/buildMiterPrism.ts:21`).

### The rake authority — ONE definition, ~~seven~~ **EIGHT** consumers

> ⚠ **RE-MEASURED 2026-08-19 (lane RK1). Every citation in this subsection was ~18 lines stale**, and
> the consumer count had grown by one. **`LayeredWallOpeningBuilder.ts` joined the set** via
> `rakedPlanThickness`. ⛔ **Cite the `§`-tags, not the line numbers** — this file moved ~200 lines in a
> single day across two lanes. The durable anchors are `§FEAT-RAKE-LAYERED-OPENINGS`,
> `§L955-ONE-CORNER-RULE`, `§WALL-RAKE-JOINT-STALE-CACHE` and `§96-OPT-IN`.

**`rakeShearPerMetre` — `packages/geometry-wall/src/WallRake.ts:245`** *(was `:227`; its five siblings moved by the same ~18 lines).* Authority stated `:117`;
internal reuse `:253`, `:267`. Consumers:
`WallFragmentBuilder.ts:66` (comment: *"the ONE place cot(rake) is computed"*), `:72`, `:2205`,
`:2510`, `:2544` · `WallLayerPlanLines.ts:31, :35, :72, :101, :179` · `DoorBuilder.ts:17, :520` ·
`WindowBuilder.ts:14, :619, :851` · `HandrailRunGeometry.ts:61, :220, :226`.
Sibling helpers: `rakeTopOffset:248`, `rakeLateralShift:265`, `perpendicularThickness:275`,
`rakedPlanThickness:300`, `openingFaceHeight:332`.

### The wall-Y datum — ~~TEN sites, ONE measured~~ ✅ **RESOLVED 2026-08-18, `8f63fb6f`**

⚠ **This section previously recorded the delta as LATENT, on the ground that "nothing authors either
offset non-zero today". That ground was never tested and it was FALSE.** Both `wall.baseOffset` and
`slab.baseOffset` are editable from the property panel (`PropertyDescriptorGenerator.ts:64` wall,
`:89` slab — argument 4 of `NUMBER` is `editable`, `:30`, and both pass `true`) and settable from the
shipped `set-base-offset` chat capability (`ChatCapabilityRegistry.ts:1097`). Both reach the geometry
stores via `UpdateElementParameterCommand.ts:113-114`, and both serializers persist them. The defect
was **LIVE**: one *"set the base offset to 150 mm"* displaced every door and window on that wall from
its own hole. See [L-968](../../04-reference/ISSUE-LOG.md).

**The root cause was not a datum disagreement — it was the absence of a datum.** Six expressions
computed a wall-related world Y and **none of them was the authority**.

**THE AUTHORITY is now `packages/geometry-wall/src/WallVerticalDatum.ts`**, which declares two planes:

| plane | value | meaning |
|---|---|---|
| **SEAT** — `wallSeatY():86` | `level.elevation + slabBaseOffset` | the wall GROUP's origin |
| **BASE** — `wallBaseY():103` | SEAT + `wall.baseOffset` | the body underside; what every world-space consumer reads |

Hosted leaves **cannot** re-derive `slabBaseOffset` — it lives on the slab store, which neither
`geometry-door` nor `geometry-window` depends on and which `SlabWallCoupling`'s own contract forbids
builders to read. So the one site that already resolves it **publishes** it
(`publishWallBaseY`, called at `WallFragmentBuilder.ts:1150`) and the leaf builders read it back
(`resolveWallBaseYOrLevel` + `hostedLeafCentreY` — `DoorBuilder.ts:620,625`,
`WindowBuilder.ts:~943`). ⚠ **That publish/resolve pair is a process-global side channel, not a
parameter.** It is the shape the package boundary permits; it is declared here so no reader mistakes
it for ordinary dependency injection, and so the ordering requirement (the wall must build before its
leaves) is visible rather than discovered.

**The doubling is gone, and NOT by stripping the group-local term.** Five files document the
convention `y ∈ [baseOffset, baseOffset+height]` and `SpatialAuthority`'s fallback returns
`elevation + baseOffset`; stripping it would have rewritten a convention across five files and broken
a fallback in order to fix a doubling. Seating the GROUP on the SEAT plane makes `baseOffset` land
exactly once. `WallRebuildCoordinator.ts:546` required **no edit** — its formula was always the BASE
plane and was always correct.

**A FOURTH defect surfaced, on no register:** `_wallGeometryChanged` in **both** dependency trackers
omitted `baseOffset` — **the edit that moved a hole never re-anchored what fills it.** Both now also
subscribe to base-plane changes, the only channel that can carry a `slabBaseOffset` edit to a leaf,
which additionally closes an ordering race between the `wallStore` cascade and the geometry flush.

**Eleven datums now agree; leaf-vs-hole delta = 0** — wall group · layered arm · miter-prism arm ·
hole band · in-wall frames · instanced arm · hit proxy · junction infill · door leaf · window leaf ·
rake pivot. Pinned by `packages/geometry-wall/__tests__/WallYDatumAgreement.test.ts` (10/10, every
pre-fix reading retained as the paired negative so the doubling cannot return silently) and by
`geometry-window/__tests__/HostedLeafSitsInItsHole.test.ts` + the `geometry-door` twin (4/4 each,
comparing built geometry to built geometry — the hole read as a real y-break in the wall's vertex
buffers).

**FOUR divergences remain, named rather than quietly left** (`§STILL-DIVERGENT` at the foot of the
ledger):

1. `SpatialAuthority.resolveWorldTransform` (`SpatialAuthority.ts:159`) never sees `slabBaseOffset`.
   Delta = `slabBaseOffset`. In `@pryzm/core-app-model`; closing it means **deciding whether the
   spatial authority may read the slab store** — a design decision, not a patch.
2. The baseline-Y double meaning: `CreateWallCommand.ts:341` stamps `elevation + baseOffset`, the
   plugin bridge stamps `0`. **Two writers, one field, two meanings.** No render datum depends on it
   any more, so it is no longer load-bearing — but it is still ambiguous.
3. `WallLayerPlanSymbolBuilder.ts:143` places the plan cut line on the baseline datum. Delta =
   `slabBaseOffset`; nothing visible moves (its sibling at `:134` is correctly base-relative).
   Re-seating a plan cut plane is a draughting decision with its own baselines.
4. Cosmetic: the gizmo now sits at the SEAT rather than the BASE on a plinth wall. Drag is
   delta-based, so behaviour is unchanged.

`slabBaseOffset` remains a **wall-side and column-side** concept — it appears nowhere in
`geometry-slab/src/SlabFragmentBuilder.ts` or `producers/slab.ts`.

### TO-BE — normative

- **W-G-1 (EI-11).** `stackAB-miter-parity.test.ts` MUST land on `main` and MUST consume C73's
  tolerance module. Until then EI-11 is **unenforced for wall**.
- **W-G-2 (C73 §3.7).** The declaration of which stack is canonical for the curved miter is
  **OWED**. *"A silent pick is a behaviour change shipped as a refactor."*
- **W-G-3 (EI-9 / EI-10).** The three `buildCurvedLayerGeometry` copies and two `buildMiterPrism`
  copies MUST each earn an EI-10 licence — (a) named reason, (b) **executed** equivalence proof,
  (c) declared divergence list, (d) retirement condition — or converge.
- ~~**W-G-4.** ONE wall-Y authority.~~ ✅ **SATISFIED 2026-08-18, `8f63fb6f`** —
  `WallVerticalDatum.ts` is that single datum function, and C84 §4D's judgement was right: the fix
  was **not** deduping the extrusion builders (measured bit-identical, mutually exclusive by
  construction) but declaring the datum. Four divergences remain, each named above with its delta;
  the largest (`SpatialAuthority.ts:159`) is a design decision, not a patch.

---

## 10.5 INVALIDATION KEYS — what re-runs a wall recompute, and what must not

> **Added 2026-08-19, lane WJ2 (L-1159/L-1160), from three founder-reported production stalls on
> deployed build `e17d9c2e`.** This section is NORMATIVE. It exists because the same defect
> appeared three times in one day wearing three different costumes.

### The rule

> ⭐ **A level-scoped recompute may be invalidated ONLY by a change to an input it actually
> reads. "An element on this level changed" is NOT an invalidation key — it is the absence of
> one.**

Written this way round on purpose. The tempting phrasing — *"invalidate when the wall changes"* —
is what shipped, and it is how a **window came to re-solve wall joins**. If a future reader
cannot name the field the recompute reads, the correct move is to MEASURE the dependency, never
to widen the key "to be safe": a key widened for safety is indistinguishable from no key at all.

### The dependency table — MEASURED, not asserted

Census method: `grep -c` for each identifier across the whole implementation file, plus a
**behavioural** probe that runs the real function twice over one plate varying one field and
compares the full serialised output at float precision — with controls that DO diverge, so the
comparison is known to be capable of failing. See
`packages/geometry-wall/__tests__/WJ2HeightEditJoinInvalidation.measure.test.ts`.

| input | `resolveLevel`<br>(T-joins, mitres, clusters) | `refreshV2Cache`<br>(ADR-0055 miter cache) | `computeJunctionInfills` | `buildWall`<br>(the body) |
|---|:---:|:---:|:---:|:---:|
| `baseLine` / `_sourceBaseLine` | ✅ **reads** | ✅ | ✅ | ✅ |
| `thickness` | ✅ **reads** | ✅ | ✅ | ✅ |
| `curve` | ✅ **reads** | ✅ | ✅ | ✅ |
| `systemTypeId` | ✅ **reads** | ✅ | — | ✅ |
| `joinIntent` | ✅ **reads** | — | — | — |
| wall ADD / DELETE | ✅ **reads** (the set) | ✅ | ✅ | ✅ |
| `snapRadius` (camera zoom) | ✅ **reads** | — | — | — |
| **`height`** | ⛔ **0 occurrences** | ⛔ not in the spec | ⚠ **extrusion ONLY** | ✅ |
| **`openings`** | ⛔ **0 occurrences** | ⛔ not in the spec | ⛔ 0 occurrences | ✅ |
| `rakeAngleDeg` | ⛔ **0 occurrences** | ✅ (ADR-0312 twin-solve) | — | ✅ |
| `wallProfile` | ⛔ **0 occurrences** | — | — | ✅ |
| `baseOffset` | ⛔ **0 occurrences** | — | — | ✅ |
| `materialColor` / `properties` | ⛔ **0 occurrences** | — | — | ✅ (colour only) |
| `layers` | ⛔ **0 occurrences** | ✅ (`layered` flag) | — | ✅ |

**Reading the two ⛔ rows that matter:** `WallJoinResolver.ts` is 3236 lines and the strings
`height` and `openings` appear in it **zero times and five times respectively — and all five
`opening` hits are prose in comments.** The plan solve is a function of centrelines, thickness
and angles. **It is geometrically incapable of depending on a height or an opening.**

⚠ **The ONE genuine height dependency, named so nobody concludes "height never matters":**
`WallJunctionInfill.ts:190` reads `(w as any).height ?? 2.8` and `:71-72` declares it *"Extrusion
height (average of wall heights in cluster)"*. So a height edit **must re-extrude the junction
infill** — and must **not** re-run the plan solve. The dependency is on the EXTRUSION, not on the
topology. `rakeAngleDeg` is the mirror case: invisible to `resolveLevel`, load-bearing for
`refreshV2Cache` since ADR-0312 (§WALL-RAKE-JOINT-ONE-EDIT-BEHIND).

### How the rule is enforced — a MEMO, not a hand-maintained list

`packages/geometry-wall/src/WallJoinResolveMemo.ts` (`§WJ2-JOIN-MEMO`). `resolveLevel` is
content-addressed on exactly the fields above, so **a field the solve does not read cannot enter
the key, and therefore cannot invalidate.** The table is enforced by construction rather than by
a reviewer remembering it.

> ⭐ **Why a memo and not a widened `classifyWallDelta` guard.** `WallDeltaClassifier`'s own
> header states the doctrine, earned by `§CLAMP-COSHARE-WELD`'s reverted "seemed local, wasn't":
> *"a MEMOIZATION rather than an approximation"*. A cache hit is a statement about **bytes** — the
> inputs were identical, so the answer is. A widened guard is a statement about **geometry**,
> which the next unanticipated topology can falsify. **Prefer the claim that cannot be wrong.**

**Measured effect** (323 walls/level × 6 levels): 372.6 ms → **3.9 ms** for a bulk height change
(95×) and **1.8 ms** for a bulk window create (208×). Key build is 0.16 ms against a 54.9 ms
solve — **0.3 % tax on a miss**.

### Still open — UNBUILT, not impossible

| # | What | Kind |
|---|---|---|
| A | **The flush RE-ARMS.** `tick → scheduleNext → rAF`, 200+ frames. The memo makes each pass ~free; it does not stop the passes. Lives in `WallRebuildCoordinator`, not in this package | **UNBUILT** |
| B | `classifyWallDelta` returns `whole-level / multi-level-batch` for an edit spanning levels, **even when the per-wall delta is provably join-irrelevant.** A PLUMBING limit — `_flushOpeningsOnly` takes one `levelId` — **not a geometric one.** This is exactly the founder's height case | **UNBUILT** |
| C | `whole-level / opening-set-changed` for an opening CREATE. The stated reason (*"a created opening can abut a junction"*) is not supported by the table above: the solve does not read openings | **UNBUILT** |
| D | One batch entry without `prevState` poisons the whole batch to `whole-level` | **UNBUILT** |

⚠ **B, C and D all live in the FLUSH layer.** They are named here because C85 owns the rule; the
edit belongs to whoever owns `WallRebuildCoordinator`.

### Join classification — `§FIX-T-JOIN-PENETRATION`, and what its refusal MEANS

The founder's production log: `penetrates host=… by 100.0 mm (depth cap 201.5 mm) with an axial
retreat of 316.3 mm (grazing cap 201.0 mm)` → classified **"grazing"**, left un-trimmed. The same
pair-shapes appeared on a **different gesture** (walls-by-slab) in a **different project**, so
this is **systemic, not incidental**.

> ⛔ **NO CAP WAS WIDENED, and none should be to quiet a log.** A cap moved to silence a warning
> becomes an unexplainable constant. If a cap is wrong, DERIVE the right value and say what it is
> derived FROM.

> ⭐ **The upstream question comes first.** If **our own generator** emits walls the resolver
> cannot join, the defect is upstream of the resolver. Establish which end is wrong before
> touching a threshold.

Per the `c9715b8a` rule, the message now names its own kind: **`Left UNHANDLED (§C85-REFUSAL-KIND:
UNBUILT, not impossible — this shape has no trim implementation yet)`**. The previous wording,
*"Left un-trimmed"*, read as a considered decision and meant *"unhandled shape"* — the precise
failure that rule exists to prevent.

---

## 11. THE DELTA

Ordered by what the user loses.

| # | Defect | User loses | Invariant | Proof required |
|---|---|---|---|---|
| **1** ✅ **CLOSED** | **[L-955](../../04-reference/ISSUE-LOG.md) — a raked wall joins soundly ONLY when plain.** Three body builders — the plain sheared prism (`WallFragmentBuilder.ts:1584-1600`), the V2 layered band slicer (§FEAT-RAKE-LAYERED, `WallRebuildCoordinator.ts:1642`), the opening-bearing body (§RAKE-HOSTED-OPENING, `WallFragmentBuilder.ts:66`, `WindowBuilder.ts:611, :838, :845`) — and **one miter that predates two of them**. `WallFragmentBuilder.ts:1594` verbatim: *"`buildMiterPrism` extrudes straight up; left alone, a raked …"*. The existing accommodation at `:1545` — *"a layer band failed the spike guard — falling back to legacy MiterPrism for the whole stack"* — is a fallback, and *"spike"* is what the founder's screenshots show | **the corner**, visibly, on both features that shipped in `d5b8d82f` | C84 **EI-9** (one question — *"where is the end face?"* — three answers) + **§4D** (several builders agreeing on the body, diverging at the boundary) | ⛔ **Pin plain↔plain FIRST, watched RED against a deliberately broken shear**, then the two failing combinations. **⛔ Do NOT re-refuse the two combinations** — the bodies are correct and the founder has confirmed them; re-refusing withdraws two shipped features to hide a corner defect | <br>✅ **CLOSED 2026-08-18** — lane J1 landed and is in production. One corner rule now serves all three body paths. Retained rather than deleted, per C84 §6 (*record retractions*), because R-9 below still binds: the two combinations must NOT be re-refused.
| **2** | **The rake has no L0 representation** — `grep rake packages/schemas/src` → 0. Authored only by `wall.updateRakeBatch` (L3, `affectedStores: []`) | nothing today — **but it is the structural reason #1 was possible**: no authority above the geometry layer to diverge from | C84 **EI-2**, **§4A** | add `rakeAngleDeg` to `Wall.ts`, or declare the rake legacy-only and remove the bus verb |
| **3** | `joinIntent` is dropped at the bridge (§5 row 14) though the serializer's own `:559-573` calls it *"the ONLY field on a wall that cannot be recovered if it is dropped"* | **the author's corner gesture** — the founder's mitred L reverts to square | C84 **EI-2(a)** · L-923 / L-927 | create through the bus with a `joinIntent`, save, reload, assert |
| **4** | `materialId` dropped at `CEB:236-256` though both ends hold it and slab/ceiling/beam arms carry it | **the specified material**; the wall renders its fallback | C84 **EI-2(a)** | round-trip a `materialId` through `wall.create` |
| **5** | `wall.delete` (L1) has **no cascade**; the L2 path does. `DeleteWall.ts:15-17` blames an S11 that has arrived | orphaned door/window records **and their 3-D meshes** | C84 **EI-4a**, **EI-5** | one route per intent — delegate, do not copy |
| **6** ✅ **CLOSED** | ~~`sideFinishes` is authored (`wall.setSideFinishBatch`) and **never serialised**~~ — **CLOSED 2026-08-19 (L-999, lane WF1)**, and it was worse than this row stated: the field never reached the store either, because `WallStore.updateWall()` projects onto a **12-field whitelist** it was not on, and `restoreSnapshot()` shared the omission. **The row described the persistence leg of a three-leg failure** — write / render / persist — of which write and persist were broken and render was already sound. ⚠ **Why it went unseen: L-960 "proved" the write against a store fake whose `updateWall` accepted EVERY field, while the real store accepts twelve.** A fake more capable than the real thing proves nothing | **the side finish**, on every save | C84 **EI-6**, **EI-7a** | ✅ round-trip pinned, 8/8 |
| **7** | `DeleteElementCommand.ts:55` declares 15 keys; `createSnapshot` recognises `'plumbing'` nowhere | **a rollback that was promised** | C84 **EI-7d** · L-953 | `check-affected-stores.ts` |
| **8** | `WRITES ⊋ RESTORES` on every `['wall']` bus verb (W-U-1) | the DTO record survives undo forever | C84 **EI-7a** | `busCreateUndoLeavesPluginStore.test.ts` — **will pass today; watch it** |
| **9** | Bake worker reads the plugin DTO store and calls `produceWall(w, NO_JOINS, 0)` | in self-host bake: **unjoined ends at Y=0** | C84 **EI-1**, **EI-11a** | declare in `HeadlessBakeSession`'s header; refuse the substitution |
| **10** ✅ **CLOSED** | ~~`elementUndoStoreAdapter.ts:295-297`'s `: []` fallback strips every opening~~ — the naive `wallStore.update(wallId, {openings})` is gone; a **hosted-aware reconciler** now diffs the wall's current openings against the undo target and routes removals through `removeOpening` (dropping and snapshotting the door/window record) rather than overwriting the array. The old trapdoor is documented in place at `elementUndoStoreAdapter.ts:540` so it cannot be reintroduced by someone reading the array write as harmless. | **every opening on the wall** | C84 **EI-7b** | ✅ pinned; and see [L-977](../../04-reference/ISSUE-LOG.md) — the same adapter's field arm was **destroying slabs on Ctrl+Z** until `81e1e9c0`, because `SlabStore.update` REPLACES rather than merges. The write shape is now declared per store. |
| **11** | `curved-MITERED-both-ends` diverges by **9.774 m** between stacks, pinned `it.fails` — **in a worktree, not on `main`** <br>⚠ **RE-MEASURED 2026-08-18: `tests/parity/wall/stackAB-miter-parity.test.ts` is STILL ABSENT from `main`.** This row is unchanged and still open — a gate that lives in a worktree gates nothing at HEAD | nothing today; every future kernel divergence ships unseen | C84 **EI-11**, **§8.f** | land the harness; consume C73's tolerance; make the §3.7 declaration |
| **12** | `material-bridge.ts` reads slot 3 and never slot 2 | the material-library id | C84 **EI-2(a)**, **EI-9** | ⛔ **"fix once for both families" is NOT ACHIEVABLE AS STATED — corrected 2026-08-19 (lane CW1).** There is no shared `material-bridge.ts`: there are **18 separate files, one per plugin**, each with its own format. `plugins/wall/src/committer/material-bridge.ts`'s colour index **does** match its own composer, so wall has the narrow slot defect **and NOT** curtain-wall's layout mismatch (L-1053, where a bridge parsed a key layout **nothing mints** and every mullion was built as glass). **Two defects, two files, two fixes.** ⚠ And the deeper finding is the 18: one concept, eighteen implementations, is C84 **EI-9** at a scale neither contract had noticed |
| **13** | `baseLine.y` coerced `?? 0` at `initTools.ts:1199-1200` (was `:1156-1157`; moved by `9f14b795`) | the elevation convention on the bus path | C84 **EI-2** | assert against `WallTypes.ts:252-270` |
| **14** | `window.wallStore` assigned twice (`initBuilders.ts:552`, `initTools.ts:1020`); `initTools.ts:1186-1187` (`alreadyMirrored` → `if (!alreadyMirrored)`) silently skips the mirror on id collision. Both citations re-measured 2026-08-18 (were `:977` / `:1144-1145`) | non-determinism nobody can see | C84 **EI-9** | one assignment; warn on skip |
| **15** | `frontSide`/`backSide` declared in two schemas with zero writers and zero readers (`WallTypes.ts:396-404`) | nothing — but it is a measured dead affordance left standing | C84 **EI-3** | remove, or give a writer |
| **16** | `commandId` / `wallCount` emitted, never consumed | nothing | C84 **EI-13** | consume or remove |
| **17** ⛔ **NEW** | **[L-1066](../../04-reference/ISSUE-LOG.md) — a curved raked wall's JOINTS are floor-exact only.** Bodies lean correctly and `baseSep = 0.000` at every neighbour, but `topSep` measures **0.555 m** against a same-lean neighbour. **Cause: the ADR-0312 twin-solve loft never runs for an arc** — `rakeJointCapDrift` is gated `!wall.curve`, and `WallPipelineV2Cache.refresh` takes straight `startXZ`/`endXZ` specs. So a curved raked wall places its shared top corner by **ADR-0310's** rule while its straight neighbour uses the **lofted** one | **the corner**, at the top edge, on exactly the combination the founder asked for | C84 **EI-9** — ⚠ **two rules at one corner: verbatim the L-955 defect class, one shape further out** | pinned `it.fails`. Closing it means teaching the V2 probe-solve about arcs — **larger than the cone sweep itself**, and deliberately not attempted inside it |
| **18** ✅ **CLOSED** | ~~**[L-1068](../../04-reference/ISSUE-LOG.md) — a hosted leaf on a curved raked wall used the wall's CHORD**, not its local tangent frame.~~ Correct while a raked host could not be curved; wrong the moment the cone shipped. ⚠ **The instructive part: `hostedElementFrame`'s own header forbids re-deriving direction from `baseLine` — *"a fourth copy of this rule is the mistake that produced the defect in the first place."* This was the FIFTH copy, sixty lines below that warning, in the same file.** A rule written down is not a rule enforced | the leaf's placement on every curved raked host | C84 **EI-9** | ✅ fixed to `_hf.frame.tx/tz`; `RakedHostWindowLeaf`, `HostedLeafSitsInItsHole` and `StraightHostLeafByteIdentical` all pass |
| **19** ✅ **CLOSED** | **[L-1226](../../04-reference/ISSUE-LOG.md) — the rake was **frozen**, not dropped, by BOTH of `WallStore`'s snapshot projections.** `updateWall()` and `restoreSnapshot()` are hand-written `Partial<WallData>` literals fed to `update()`, which merges `{...wall, ...safeUpdates}`. ⭐ **A key NAMED with `undefined` CLEARS the field; a key ABSENT leaves the record's value standing** — so the omission never destroyed a rake, it made one **immovable by any snapshot restore**. Lean a wall, Ctrl+Z, and it stays leaning while undo returns `{success:true}`. **It was already PINNED as a known defect** (`WallProfileNonRegressionBaseline` §B1a) and still cost a lane a day, because a pin is legible only to someone already reading that file. ⚠ **This is the SECOND rake-loss hole and NOT the founder's reported one** — the save/open half is [L-1211](../../04-reference/ISSUE-LOG.md) (`ImportProjectCommand` never passed `rakeAngleDeg` to `CreateWallCommand`). One field, two independent hand-written lists, two lanes | **the lean**, on every undo that crosses a rake edit | C84 **EI-7a** (WRITES ⊇ RESTORES) — the identical clause row 6 cites for `sideFinishes`, **one field earlier in the same literal** | ✅ `L1226RakeSurvivesRestore.test.ts`, **7 tests**, driving the REAL `WallStore` (no fake — row 6 records what a fake more capable than the real store proves) |

| **20** ⚠ **OPEN — PARTIALLY CLOSED** | **[L-1270](../../04-reference/ISSUE-LOG.md) — the ADR-0312 loft is REFUSED per-wall, and the fallback is the very geometry the loft replaced.** Founder, 2026-08-19, three screenshots: `WA-03-002`, Level 3, 9.237 m, plain type, open wedges at its junctions — **closed at the bottom, opening toward the top**. ⛔ **The leading hypothesis — *"the join is 2-D and the rake is a later 3-D transform, so the mitre is right at the base and wrong above it"* — is FALSIFIED.** Measured through the real store→join→build path: the twin-solve loft closes the corner to **0 mm at corner drifts up to 7.348 m** (`L=9.237, rake 30/30`). ⭐ **The wedge is `loftOffsets`' own orientation guard.** When a wall's lofted TOP polygon inverts, `loftOffsets` returns `null` and the caller substitutes the **ADR-0310 uniform shear — the pre-ADR-0312 geometry whose top corner is KNOWN OPEN**. And the decision is **PER WALL**, while a mitre corner belongs to TWO. ⭐⭐ **It is the SHORT wall that refuses**, because a top face inverts exactly when the corner drift exceeds the wall's own length — so the founder's 9.237 m wall is built CORRECTLY and its short return is not, and the hole is on the corner they share. Measured: **9.237 m @80° beside a 0.5 m return = 71 mm at the top, 0 mm at the floor**; at H=4 m, **105 mm**. At 60° with a 0.5 m return, **1.13 m** | **the corner**, on every raked wall with a short neighbour — which is every curved building, whose returns are short by construction | C84 **EI-9** — ⚠ **two rules at one corner, for the THIRD recorded time**: row 1 (L-955) was three BODY BUILDERS, row 17 (L-1066) was straight-vs-arc, this is **two WALLS**. The unit of agreement keeps being assumed and keeps being wrong | ✅ **The SILENCE is closed** — `RakeJointRefusalReason` / `WallPipelineV2Cache.rakeJointRefusals()` / one bounded warn per wall per refresh name the wall, the reason and both numbers. `L1270RakedJoinShortNeighbour.test.ts`, **14 tests**, real builder, no stub. ⛔ **The GEOMETRY is NOT closed** — see **R-13**, which states what may and may not be done about it |

⚠ **Non-regression, binding on #1.** plain↔plain is **CONFIRMED GOOD by the founder**. Any change to
`buildMiterPrism` must be proven not to move it. And the shear must become a **single authority**,
not a fourth copy — `rakeShearPerMetre` (`WallRake.ts:245`) is already declared the one place
`cot(rake)` is computed, and §10 shows **eight** modules already honour it.

> ⭐ **RK1 caught itself about to mint that fourth copy, 2026-08-19**, and the near-miss is the best
> evidence this rule earns its place: it had hand-rolled a staleness test that `20d21d25` had already
> folded onto the cache as `rakeIsFreshFor`. The duplicate was removed before it landed.

> **Lane note (C84 §6 discipline):** lane J1 is fixing **#1** as this contract is written. The DELTA
> above states C85's **normative requirement**, not a work order. When J1 lands, #1's row moves to
> a `✅ CLOSED` with the pin named — it is not deleted (C84 §6 — *record retractions*).

---

## 12. REFUSALS

| # | Refusal | Where | Status |
|---|---|---|---|
| **R-1** | `wall.create` refuses **conditionally**, on a three-valued predicate: no authoritative store in this process → proceed (unit tests, headless DTO loops); registered **and** engine-attached → proceed (the browser, byte-for-byte unchanged); registered **and NOT attached** → refuse and name why | `CreateWall.ts:102-110` (reason), `:118-131` (`authoritativeWallStoreRefusal()`), `:217` | ✅ **EXEMPLARY.** The §CONTEXT-DATA-HONESTY shape: *"unjudgeable ≠ failure"* (`:127`). This is the pattern the other families' create verbs should copy |
| **R-2** | `wall.move` refuses unconditionally, naming `wall.updateBaseline` and its exact payload keys | `MoveWall.ts:79-80`, `:115` | ✅ **CORRECT AND REQUIRED** under [C16 CA-18](C16-COMMAND-AUTHORING-PROTOCOL.md). ⛔ MUST NOT be "fixed" into silent success |
| **R-3** | `wall.transform` refuses, with its **own** reason rather than routing to `wall.move`'s | `TransformWall.ts:291-292`, `:381`; the reason for not sharing is at `MoveWall.ts:86-91` | ✅ correct — *"Each verb must state its OWN reason"* |
| **R-4** | `wall.setColor` / `wall.setDimensions` / `wall.setLayers` / `wall.bulkSetVisuals` refuse, each naming its live replacement | `:66-67, :100` · `:68-69, :101` · `:114-115, :146` · `:75-76, :121` | ✅ correct |
| **R-5** | **`canExecute` MUST be the LAST method before `execute`** | `MoveWall.ts:94-103` | ⚠ **A GATE'S PARSER SHAPING THE SOURCE.** `tools/ga-gate/check-verb-register.ts` classifies REFUSES by slicing source from `canExecute` to the next `execute(`; `validatePayload` in between mis-reports the verb as UNKNOWN. C84 §7B.5's shape — *a gate that classifies by NAME can be satisfied by RENAMING*. Declared, not hidden |
| **R-6** | `produceWall` refuses a degenerate baseline | `producers/wall.ts:78-81` | ✅ correct |
| **R-7** | `wallVoids.ts` is **deliberately not wired** into `WallFragmentBuilder`/`LayeredWallOpeningBuilder` | `wallVoids.ts:10-15` | ✅ **DECLARED PARKED**, with the phase, the flag and the fallback named. The compliant form of C84 §3.5's PARKED verdict |
| **R-8** | The CSG single-volume arm is switched off (`§96-OPT-IN`, 2026-05-24) | `WallFragmentBuilder.ts` **§96-OPT-IN** — ⚠ the `:2683-2692` citation was stale again by 2026-08-19; **cite the tag**. The stale-blocker correction R-8 demanded IS now made in code, and the **arm remains OFF**, `:2883` (*"CSG failed — keep the segmented mesh (SPEC §4: never an empty wall)"*) | ✅ declared, with its incident cited. ⚠ **BUT ITS STATED REASON IS NOW HALF STALE.** The comment cites two blockers, and the second — *"DoorBuilder/WindowBuilder place the leaf at `level.elevation + sillHeight` without slab/baseOffset"* — was **closed by `8f63fb6f`** (see §10). The first, whether the `geometry-kernel` producer honours `baseOffset` the way `WallHoleBodyBuilder` does, is **NOT MEASURED**. ⛔ **The arm stays OFF, and must not be re-enabled on the strength of the closed half** — that inference is exactly what C84 exists to prevent. The code comment needs correcting so it stops asserting a blocker that no longer exists |
| **R-9** | ⛔ **DO NOT re-refuse layered-raked or opening-on-raked walls** | [L-955](../../04-reference/ISSUE-LOG.md) | ✅ **BINDING.** The bodies are correct and founder-confirmed. Re-refusing withdraws two shipped features to hide a corner defect |
| **R-10** | No `wall.rotate` verb | §6 | ⚠ **DECLARED HERE**: rotation is expressed as a baseline edit. Previously an undeclared absence |
| **R-11** | The ten `<kind>.delete` bus verbs are **DORMANT, not broken** | C84 §3.5.3 | ✅ ⛔ do not delete — PRYZM 3 target vocabulary |
| **R-12** | ✅ **LIFTED — THIS ROW IS RETRACTED, NOT DELETED (C84 §6)** | `WallRake.ts` `rakeAuthorability` | ⭐ **The arm is GONE at HEAD.** This row read *"INCOHERENT — the layered-raked-with-openings refusal now states a reason that is MEASURABLY FALSE … RK1 measured the combination SOUND and deliberately did NOT lift the gate … RK1 recommends lifting it."* The recommendation was taken: [L-1064](../../04-reference/ISSUE-LOG.md) lifted the `layered` arm on 2026-08-19, §RAKE-HOSTED-OPENING had already lifted `hosted-openings` on 2026-08-18, and the off-by-one (`layers.length > 1` guarding a path entered on `> 0`) was closed **by removing the boundary rather than moving it** — the only fix that cannot be off by one again. ⭐ **RE-MEASURED 2026-08-19 (lane RAKE1) through the REAL store**, not from these comments: raked × 3-layer × hosting a window at 75° passes `rakeAuthorability`, `WallStore.add()` and `WallStore.addOpening()`, and reads back `75`. Pinned in `L1226RakeSurvivesRestore.test.ts`. ⛔ **What SURVIVES in `rakeAuthorability` is narrower and geometric**: the angle range, and `curved-collapse` (a top ring pushed inward further than the wall's own turn radius). Those are real; do not read this retraction as *"the gate went away"*. ⛔ And do not restore the blanket arms — **R-9 binds** |
| **R-13** | ⭐ **§RAKE-JOINT-OVERTRIM — a raked wall whose mitre corner drifts further than the wall is LONG cannot be closed by two prisms, and the refusal MUST be named.** | `WallPipelineV2.ts` **§JOIN1-DEGRADATION-IS-NOT-SILENT**; `rakeJointRefusals()`; [L-1270](../../04-reference/ISSUE-LOG.md) | ⚠ **PARTIAL — the refusal is now HONEST, the geometry is still WRONG, and both halves are binding.** ⭐ THE INVARIANT: *a mitre corner belongs to TWO walls, so the decision to loft it is a property of the CORNER, never of one wall.* Today it is decided per wall and they can disagree; when they do, the corner is exact at the floor and open at the top by the difference. ⛔ **DO NOT delete the orientation guard.** It measurably closes the gap to 0 in every case — and does so with a self-intersecting bow-tie top face. A negative top area is REAL geometry, not float noise: **the joint has consumed the wall's top**. Trading a visible hole for an inside-out solid is not a fix. ⛔ **DO NOT close the gap cosmetically** — stretching or re-anchoring geometry to hide a wedge is the same class as clamping a malformed elevation to horizontal, and [§CLAMP-COSHARE-WELD](../../04-reference/ISSUE-LOG.md) records that **moving a shared baseline surfaced doubled walls**. ⛔ **DO NOT add a second rake rule** — `WallRake.rakeAuthorability` is the ONE authority and this condition is not expressible there anyway: it depends on the wall's NEIGHBOURS and HEIGHT, and it would wrongly refuse a rake that renders perfectly on an unjoined wall. ⭐ **THE ONE ADMISSIBLE FIX** is the height-varying mitre this contract has already named twice (row 17): the wall is **clipped at the elevation where its top face degenerates**, so two leaning walls meet along a LINE rather than a vertical edge. That changes `WallPolygonExtruder`'s contract — a wall whose top is a line, not a face — and is deliberately NOT attempted inside L-1270 |

### Explicitly NOT REFUSED, and that is a finding

The **nine** `affectedStores: []` L3 verbs (W-P-2 — corrected from *eight* 2026-08-18) execute and report success while contributing
nothing to the ring buffer. That is correct **only if** an L2 entry was pushed — and for
`wall.cascadeBaseline` the handler returns `{forward:[],inverse:[]}` unconditionally (`:66`) with a
`_skipBridge` short-circuit at `:52-54` that can skip the legacy bridge too. **NOT MEASURED**:
whether `_skipBridge` is ever true in production.

---

## NOT MEASURED — the honest register for this family

⛔ Gaps, not clearances (C84 EI-1b).

1. **Axis (b) for all 45 `wall.*` verbs** — which production surface dispatches each. Measured only
   where a handler asserts it in its own refusal text.
2. **`canExecute` behaviour of 10 handlers** — `SplitWall`, `SetWallSystemType`, `UpdateWallBaseline`,
   `SetWallSideFinishBatch`, `UpdateWallSystemType`, `UpdateWallsColorBatch`, `UpdateWallsHeightBatch`,
   `UpdateWallsRakeBatch`, `UpdateWallsSystemTypeBatch`, and `AddWallLayerBatch` beyond `:73`.
3. ~~**Six of the ten wall-Y datum sites** (§10) — C84 §9's list, unchanged.~~ ⚠ **STALE, CLOSED
   2026-08-18 — this row outlived its subject by a day.** §10 of this contract already records the
   datum as **RESOLVED** (`8f63fb6f`, `WallVerticalDatum.ts`: eleven datums agree, leaf-vs-hole
   delta **0**) and C84 §9 records the same. What actually remains is narrower and is named in
   `§STILL-DIVERGENT`: **four** divergences, the largest `SpatialAuthority.ts:159`, which cannot see
   `slabBaseOffset` and whose closure is a design decision, not a patch. **Read §10, not this
   line.**
4. **Whether `WallLayerFunction` members all survive to the builder** (EI-3 sweep).
5. **Whether the UI still offers the seven refusing verbs** — the EI-3 control census, owned by
   [C82](C82-RIBBON-CAPABILITY-SURFACE.md).
6. **Whether `_skipBridge` (`CascadeWallBaseline.ts:30, :52-54`) is ever true in production.**
7. **`plugins/plan-view`'s production constructor** — none measured; axis (b) not run, so it is
   PARKED, not dead.
8. ~~**Whether user-authored room name/number/finish survive `RoomTopologyObserver.resume()`** after a
   wall undo — C84 §9's highest-value open question, unchanged.~~ ⚠ **STALE, MEASURED 2026-08-18
   (`7bab78ff`).** `name` and `finishes` survived (`RoomDetectionEngine.ts:962,968`); **`roomNumber`
   did NOT** — `assignUniqueRoomNumbers` inferred authorship **by regex** and overwrote a user's
   `'101'` with a generated `'00-001'` on any undo. Fixed by RECORDING authorship
   (`metadata.roomNumberAuthored`) rather than inferring it. [L-975](../../04-reference/ISSUE-LOG.md).
   **Two registers carried this row; only C84's was updated.**
9. **ADR-0331 §D5 — *"what is Stack B for?"*** — an escalated **founder** question. ⛔ Not to be
   resolved by any lane.
10. **`packages/persistence-client/src/loader/`** — deliberately not measured; declared DEAD.
11. ✅ ~~**PROFILE × RAKE geometry has never been built**~~ — **CLOSED 2026-08-19 (lane WJ1).**
    The RK1 reading this row carried is superseded and is kept because the sequence is the lesson.
    RK1 found the hole was *"not profile×rake; it is profile, full stop"* — no body builder read
    the ring — and built `WallProfileBodyBuilder`. WJ1 closed the three things that left open:
    - **The MITRE** (L-1071, `§FEAT-WALL-PROFILE-MITRE`). The stated constraint — *"an
      `ExtrudeGeometry` outline has no per-end plane to project onto"* — was about the wrong
      FRAME. A wall mitre plane is VERTICAL, so in the builder's own local frame it is
      `x = x0 − (n_lat/n_axial)·z`, with **no `y` in it**: a per-vertex shear an extruded outline
      of any shape absorbs. The same formula `MiterPrismBuilder` already uses.
    - **PROFILE × RAKE was ALREADY BUILT and merely UNASSERTED.** Nothing was written to open it;
      a test was. The composition works because the ring is authored in the un-sheared frame and
      the caller shears the built group — by construction, not by arithmetic written twice.
    - **PROFILE × CURVED** (L-1072, `§FEAT-WALL-PROFILE-CURVED`). See item 11a.
    Offered per shape today: plain vertical **OFFERED** · plain raked **OFFERED** · curved
    **OFFERED** · curved+raked **OFFERED** · layered / hosted-openings **REFUSED (unbuilt)**.
    The per-variant gate is `WallProfileVariants.WALL_PROFILE_AXES` — a data table, one row per
    axis, availability being the conjunction over a wall's active axes.

11a. ⭐ **REFUSED-BECAUSE-UNBUILT vs REFUSED-BECAUSE-IMPOSSIBLE — BINDING ON THIS FAMILY, and it
    has now cost it FOUR wrong refusals.** Founder, 2026-08-19.

    | refusal | argued as | actually was | outcome |
    |---|---|---|---|
    | rake × curve | *"ILL-POSED … this one never lifts"* | unbuilt | ships as a CONE (L-1062) |
    | the profile mitre | *"no per-end plane to project onto"* | the wrong frame | built (L-1071) |
    | profile × curve | *"a straight edge is not straight in space … no per-station top"* | unbuilt | built (L-1072) |
    | X-junction separation | *"either unsound, or the metric is wrong"* | the metric | fixed (item 12) |

    **THE RULE THIS ESTABLISHES.** A refusal MUST state which kind it is **in the text the author
    reads**, not only in the module header. `WallProfile.ts`'s header had said *"A profile on a
    curve is NOT ill-posed … it is refused because it is UNBUILT … This one CAN lift"* from the
    day the arm was written, **and the arm still held for months**, because downstream readers
    — lanes, briefs, and the ISSUE-LOG itself — quote the user-facing STRING. **A refusal that
    names a missing mechanism is a TODO wearing the costume of a law.**

    **A STALE REFUSAL IS NOT INERT — IT GETS BORROWED AS EVIDENCE.** `WallRake.ts`'s
    *"ILL-POSED … never lifts"* outlived its own arm by a day, and in that time `WallProfile.ts`
    cited it as its contrast case and `WallProfileSlice1.test.ts` cited it **by line number**.
    Both borrowers were then wrong too. Retracted text must be marked retracted **where it lives**,
    not merely superseded elsewhere. Read that dead line again — *"the correct construction is a
    swept per-station frame"* — it was never a refusal, it was the implementation note for the fix.

    **WHAT IS STILL REFUSED, EACH WITH ITS KIND AND ITS MACHINERY NAMED:**
    - `layered` — **UNBUILT.** *"The bands have no per-station top"* is demonstrably a description
      of absent code: `CurvedWallLayerBuilder` had exactly that gap and it closed in eight lines
      (`CurvedProfileHeights`). **Machinery:** the V2 band slicer extrudes each band between two
      HORIZONTAL Y planes and needs the same scalar→accessor change, plus the rule for how one ring
      divides across a stack (almost certainly *"every band takes the same (u,v) ring, clipped to
      its own [yLo,yHi]"* — the bands are concentric and share the elevation frame).
    - `hosted-openings` — **UNBUILT, and the dangerous one.** *"The occupancy check is purely
      horizontal"*, so nothing would notice an opening left floating in material the profile
      removed. **Machinery:** a vertical term in `WallOccupancyStore.canPlace()` consulting
      `wallProfileExtentAt(ring, u)` over the opening's `u` span, and the same in the gate for the
      reverse authoring order. The geometry half is comparatively easy —
      `buildWallHoleBodyGeometry` already takes a `THREE.Shape` outline plus holes.
    - `curved-multi-interval` — **the narrowest one, and still NOT `impossible`.** A swept solid
      carries ONE vertical span per station, so a ring empty in its MIDDLE at some `u` would render
      solid where the author drew a void. **Machinery:** a per-station multi-interval sweep.
      Refused rather than approximated; the same ring on a STRAIGHT wall is admitted, which is what
      makes this a statement about the sweep and not about the ring.
    ⚠ **`WallProfileVariantStatus` carries `'impossible'` and NOTHING USES IT**, with a test
    asserting the set is empty. Adding one requires saying so out loud. **Keep it that way.**

12. ✅ **X-junctions** — **EXPLAINED AND FIXED 2026-08-19 (WJ1, §WJ1-CROSSING-HULLS-SHARE-NO-VERTEX).**
    RK1's hull metric returned an arithmetically impossible 2.4 m for overlapping rectangles; it
    printed the number, marked it **UNEXPLAINED**, and drew **no conclusion** — which is the only
    reason no lane spent a day fixing geometry that was already correct.
    **The cause was the METRIC.** `hullSeparation` decided overlap by asking whether any VERTEX of
    one convex hull lay inside the other. **Two convex polygons crossing in a PLUS SIGN overlap
    with no vertex of either inside the other** — and a plus sign is exactly what an X junction
    is. The 2.400 was `2.5 − 0.1`: half the TEST wall's length minus half its thickness, a fact
    about the fixture. Replaced with a separating-axis test.
    ⭐ **THE CONTROL IS WHAT CAUGHT IT** — running `plain@90 vs plain@90`, two upright walls
    crossing at the origin with nothing to get wrong, through the same metric made it unarguable.
    ⚠ **The plausible readings were the dangerous ones.** Beside the 2.400 the same metric
    reported `openUp` of 0.019 and 0.040 m, which read as small real defects worth chasing, and a
    negative opening of −0.529, which is not a thing. After the fix **every X row reads 0.000,
    control included.** T and X for curved-raked are now ASSERTED (48 cells, AXIS 4c).
13. **Not reached by RK1's matrix, each stated rather than implied:** 3+ wall junctions ·
    `baseOffset ≠ 0` × rake · Stack B under rake · a persistence round-trip of a raked wall ·
    move-time re-weld (WM1's) · the `ContextualEditBar` button on a raked wall.
14. ⛔ **FOUNDER QUESTION — what IS a raked curved wall?** All four curved cells measured
    `lean = 0.000`: **a rake on an arc does nothing today**, and layers and openings change nothing
    because the shear never applies. `WallRake`'s vocabulary takes a single `direction`, and **an arc
    has none** — so a rake on an arc is a **conical surface, not a shear**. Does a raked curved wall
    **keep its radius** (lean about the chord) or **change it** (conical sweep)? Both are "a raked
    curved wall"; **they are different solids**, and this cannot be decided by measurement.
    ⚠ Do not quote RK1's `openUp ≈ 0.72` for the curved cells — that is the *neighbour* leaning away
    from an upright arc, not a joint measurement.

---

## Appendix — C84 claims this contract CONFIRMED, REFINED or REFUTED

| C84 claim | Verdict |
|---|---|
| wall is SPLIT: viewport reads the geometry singleton (`initBuilders.ts:77, :553`); the bake worker reads a plugin DTO `WallStore` (`HeadlessBakeSession.ts:31, :51, :131`) | **CONFIRMED.** Measured `:31`, `:43`, `:53`, `:66`, `:84-85`, `:124`, `:129`, `:131`. C84's `:51` is the nearest measured line `:53` (`new WallStore()`) |
| `wall.materialId` dropped at `CEB:236-256` though both ends hold it | **CONFIRMED** — absent from `CommittedWall:42-56`, absent from the emit `:236-256` |
| `wall.move`, `wall.transform` refuse in `canExecute` | **CONFIRMED** — `:115`, `:381`. **Five more measured**: `setColor:100`, `setDimensions:101`, `setLayers:146`, `bulkSetVisuals:121`, and the conditional `create:217` |
| the live move path is L4 `UpdateWallBaseline`, its reweld a separate L3 verb, one gesture → two undo entries | **CONFIRMED** — `UpdateWallBaseline.ts:83` (L4), `CascadeWallBaseline.ts:35` (L3, `[]`) |
| `DeleteWall.ts:14-17` — L1 bus delete has no cascade | **CONFIRMED** verbatim, and **sharpened**: the header blames "when the door + window plugins arrive in S11"; **they have arrived** |
| only three services consult `isReverting()` | **CONFIRMED** — `WallMoveReweldService.ts:298`, `SlabWallConnectivityService.ts:1047`, `FinishHostDependencyTracker.ts:297`; definition `CommandManagerImpl.ts:741` |
| wall `elementType` spellings | **CLEAN — one family spelling `'wall'`.** Recorded `✅` per EI-1b. `'WallPart'` is a sub-part; `'wallSystemType'` is a type-library tag |
| wall EI-6 persists `✅` (§4) | **CONFIRMED for the family, REFINED for two fields** — `sideFinishes` is never serialised; `ifcData.ifcClass` is serialised but not reloaded |
| — (not in C84) | **NEW:** the rake has **zero** representation in `packages/schemas/src`; `joinIntent` is dropped at the bridge; `DeleteElementCommand`'s `'plumbing'` key has no `createSnapshot` branch; `material-bridge.ts` discards slot 2 exactly as curtain-wall's does |

---

## §FEAT-WALL-SHAPE-MODES — CLOSED-LOOP WALL RUNS (founder, 2026-08-19, lane SHAPE1)

> **The founder:** *"Can you add mode 'eclipse', 'circular' and 'rectangular' mode options in WALL,
> CURTAIN WALLS, SLABS, CEILINGS and FLOORS?"* — ⭐ **"eclipse" read as ELLIPSE, visibly**: the
> label is `Elliptical` everywhere a user can see it.

### ⭐ WS-1 — "CIRCULAR WALL" MEANT THREE THINGS, AND TWO OF THEM ALREADY SHIPPED

**This is the load-bearing paragraph of this section.** Before any code, the phrase was decomposed:

| Reading | What it is | State |
|---|---|---|
| **(a) plan curvature** | the wall RUNS along an arc | ✅ **EXISTS** — `wall.curve`, a quadratic Bézier (`WallTypes.ts:304-309`) |
| **(b) elevation profile** | the wall's FACE is a circle rather than a rectangle | ✅ **EXISTS** — `wallProfile`, and it is **authorable**: `WallProfileEditor.ts` + `WallTool.enterProfileEditMode` (`WallTool.ts:2072`) |
| **(c) closed run in plan** | N walls forming a rectangular / circular / elliptical ROOM | ⬅ **THIS. Did not exist. Now shipped.** |

**The word that settles it is "rectangular."** The founder listed the three as PEERS. Under (a)
*rectangular* is incoherent — an arc is not rectangular. Under (b) it is the **absent** profile,
i.e. asking for nothing (`WallProfile.ts`: *"`wallProfile` absent ⇒ the implicit rectangle"*). Only
under **(c)** are all three real, distinct and useful. It is also the same word-for-word list the
founder used for RAILINGS on 2026-08-18, which shipped as closed loops.

⚠ **A prior brief recorded `wallProfile` as *"INERT TODAY … nothing in the repo authors it."* That
is STALE at HEAD** — WPE1 shipped the editor and WJ1 flipped `raked` and `curved` to `available` in
`WallProfileVariants.ts` on 2026-08-19. Only `layered` and `hosted-openings` remain `unbuilt`.
**Reading (b) is a live feature, not a gap**, and this lane deliberately did not disturb it.

### WS-2 — WHAT SHIPPED, AND WHAT IT DELIBERATELY DOES NOT DO

`WallPlanToolHandler._commitLoopRun` walks the ring calling the handler's own `_commitWall` once per
edge. ⭐ **It dispatches nothing of its own**, so the C83 spatial gate, system-type resolution, layer
stamping, id minting and the `wall.create` dispatch are all INHERITED. `_commitWall` already chains
start→end, so closing the loop needs no special case.

This is the structural claim `handrailRunGenerators` already makes: **a multi-segment run IS N
two-point elements.** ⛔ No second wall record shape is minted, and none may be.

⚠ **A per-edge spatial refusal is NOT fatal to the run.** The edge is skipped with the gate's own
sentence (§REFUSAL-IDENTITY — no rival account) and the remaining edges still build. Abandoning a
whole drum because one edge crossed a door would be a worse answer than a partial the author can see.

### ⭐ WS-3 — THE TESSELLATION DENSITY IS A WALL DECISION, NOT A PLATE ONE (binding)

A plate boundary is ONE mesh handed to earcut. **A wall chord is a REAL ELEMENT** — id, system type,
layers, a schedule row, two junctions and a pass through the join resolver. At the plate's 20 mm
chord tolerance a 4 m circle emits **~64 walls of ~390 mm**: a nonsense model, a nonsense schedule,
and 64 junction clusters for the solver.

So wall runs use **`WALL_LOOP_DENSITY`** (`boundaryLoops.ts`) — ~16 walls of ~1.55 m at r = 4 m,
floored at 8 and capped at 24. ⛔ **A future lane MUST NOT "improve" wall smoothness by lowering
this toward the plate value without answering the schedule and junction cost**, which is the same
argument `handrailRunGenerators` makes in its own words (*"a schedule full of 100 mm rails"*).

### ✅ WS-4 — BOTH SURFACES (L-1325, closed 2026-08-20)

This section read **"PLAN-ONLY, DECLARED"**, and that was the right state to ship in: the 3-D
`WallTool` drives its state machine off the **`WallDrawingMode` ENUM**, which had no member for a
closed-loop run, and ⛔ **minting a member to satisfy a bar is precisely how a UI ends up offering
what the pipeline cannot accept (C84 EI-3)**.

**The arm now exists**, so the declaration is retired rather than left standing. `WallDrawingMode`
carries `RECTANGULAR_LOOP | CIRCULAR_LOOP | ELLIPTICAL_LOOP`, and `WallTool.commitLoopRun` walks the
ring calling **the tool's own `createWall`** once per edge — so level resolution, id minting,
system-type stamping and its dual-write are INHERITED. A test requires `createWall` in that body and
**forbids `executeCommand`**, because dispatching separately would silently skip all of it.

⭐ **AND THE BAR NOW DRIVES BOTH SURFACES, WHICH IT HAD TO.** The plan handler reads
`wallModePicker`'s STRING; the 3-D tool reads the ENUM. Two vocabularies for one concept — L-1322's
shape, one layer out — so arming only one leaves the other surface silently in its previous mode:
the author picks Circular, switches view, and draws a straight wall.

⚠ Re-entering the tool is safe for a LOOP in a way it is not for linear/ortho/curved: a closed loop
starts from a fresh anchor by definition, so there is no in-progress polyline to destroy (the defect
§FEAT-PERSISTENT-MODE-BAR exists to prevent).

⛔ **Readings (a) and (b) are untouched** and remain available in both surfaces.

### WS-5 — REFUSALS (C16 CA-18)

A degenerate gesture yields an **empty ring** and a sentence naming the limit and the next action.
⛔ Never a silent fall-back to a rectangle (§L955 / C86 PR-9).

---

## RAC — the chat surface for this family (added 2026-08-19, lane RAC1)

> **Mandated by C84 §6**, measured against the **C67 §1.0 seven-verdict vector** (V1 RESOLVE ·
> V2 DISPATCH · V3 STATE · V4 PERSIST · V5 UNDO · V6 SYNC · V7 REPORT). Cross-family summary:
> **C84 §4F**. Capability surface: **C67 §1.8**. Decisions: **ADR-0334**. Rows: **L-1140 … L-1147**.
> ⛔ **No cell is left blank — a blank reads as "fine" (EI-1b). Unknown reads `NOT MEASURED`.**

### Status — **PUBLISHED — the richest chat surface of any family**

| | Measured 2026-08-19 |
|---|---|
| **`element.changeType` tag(s)** | `wall` |
| **Branch** | `apps/editor/src/engine/initBusHandlers.ts`:1536 |
| **Type catalogue** | ✅ `wallSystemTypeStore` — injected today via the NAMED legacy fields `resolveWallSystemType` / `wallSystemTypeNames` (`ZeroTokenChatBridge.ts:855, 928-930`), not via `ctx.catalogues` |
| **Type field on the record** | ✅ `systemTypeId` + `layers` on the geometry record |
| **Executor the chat must use** | `wall.updateSystemTypeBatch` → `UpdateWallsSystemTypeBatchCommand` → geometry `wallStore` (`:176`) |
| **Chat capabilities published TODAY** | `set-wall-type` · `set-wall-color` · `set-wall-rake` · `set-wall-side-finish` · `add-wall-layer` · `set-wall-dimensions` · `set-height` · `set-thickness` · `set-base-offset` · `create-windows-parametric` |
| **Retiring condition** | n/a — published. The open items are L-1141 (bus-boundary honesty) and L-1142 (undeclared scope modes). |

### Scoping — what a published capability for this family MUST accept

The founder's ask is *"BY LEVEL, BY ROOM, ETC"*. The shared grammar
(`makeHostedTypeParser`, `ZeroTokenResolver.ts:3340`) **already** captures `on level N` and
`in the <room>`, and `FilterScope.ts` lifts property/type predicates out before it runs — so
`all` · `selection` · `level` · `room` (· `orientation` where the family has a façade) are the
target, and **the work is the DECLARATION, not the reach** (L-1142).

| Scope | Target | AS-IS for this family |
|---|---|---|
| `all` | ✅ required | ✅ works |
| `selection` | ✅ required | ✅ works |
| `level` | ✅ required | ⚠ **works, UNDECLARED** (L-1142) |
| `room` | ✅ required | ⚠ **works, UNDECLARED** (L-1142) |
| **selection as a GEOMETRY SOURCE** | family-dependent | see C84 §4F.5 — selection **is** available to the RAC (`ResolverContext.selection`, non-optional, id **and** kind, rebuilt every message); `create-wall` is the one capability that declares no subject axis |

### Findings

- ⛔ **L-1141 — `wall.updateSystemTypeBatch` reports success when it changed nothing.** `plugins/wall/src/handlers/UpdateWallsSystemTypeBatch.ts:169` returns an unconditional `{forward: [], inverse: []}`, reached identically when N walls changed, when the command **refused everything**, when the bridge **threw**, and when there was no command manager. The chat transcript is rescued by the `BATCH_REPORT_EVENTS` subscription; **no other caller is**. `slab`'s handler is the fixed sibling and its header quotes C16 CA-18.
- ⚠ **L-1142 — `set-wall-type` declares NO `scopeModes` at all** yet the arm honours `level`, `room` AND `orientation` (gate output, 2026-08-19). The user is told less than the system does.
- ⛔ **L-1143 — the Wall tool's By Slab mode walls EVERY slab.** `ToolsAreaLayout.ts:285` sends `{slabId}` to `wall.create-on-all-slabs`, whose payload has no `slabId`, whose handler ignores it, and whose command calls `slabStore.getAll()`. **Silent and destructive.** The RAC must route to `wall.createFromSlab`, not to this mode — and the tool should be repointed at the same verb (C84 §4F.6, P6, EI-4a).
- ⛔ **L-1144 — `create-wall` declares `scope:'global'` and has no subject axis.** `ZeroTokenResolver.ts:678-684` carries `start`/`end`/`height`/`thickness` and nothing else; the grammar never inspects the token *"slab"*. A selected slab cannot be a geometry source. **THE WRONG-REFUSAL class** — CA-18-shaped, denying an ask the system can satisfy.

### §FIX-RAKE-… — the founder's *"make all walls on level 3 raked 90 dregress"* (2026-08-20, lane RAC1)

**What he got back:** *"There is no wall type called **“on level 3 raked 90 dregres”** in this
project. The wall types here are: Monolithic (Default), …"* — a sentence carrying the word
**"raked"** and a number, answered **confidently** as a wall-TYPE catalogue lookup. Four separable
defects stacked into that one answer; each is fixed and each is falsified separately by
`packages/ai-host/__tests__/wall-rake-near-miss.test.ts` (a single end-to-end assertion would have
gone green as soon as any one of them were fixed).

| # | Defect | Fix | Where the rule lives |
|---|---|---|---|
| **L-1370** | `parseWallTypeIntent` guarded DIMENSION words and **not** rake words, so the rake near-miss became a catalogue miss. The asymmetry was the proof: `DimensionFamilies` has declined rake words since it was written (*"rake/pitch carry numbers too"*) | the SAME `OTHER_CAPABILITY_WORD` is now **imported** by the type, hosted-type and colour grammars — derived, not transcribed (C84 **EI-8a**), pinned by test | **C67 §4 rule 17a** + the audit matrix there |
| **L-1371** | `raked 90 dregress` is **recognised-but-underspecified** (rake word ✓, number ✓, unit unknown) and FELL THROUGH instead of refusing | the rake grammar CLAIMS it and refuses by name: *"I don't recognise the unit “dregress” — did you mean degrees? Nothing was changed."* ⛔ not auto-corrected, and the unit pattern is **not** widened to absorb typos | **C67 §4 rule 17b**; the doctrine is `parseWallSideFinishIntent`'s UNRECOGNISED TAIL |
| **L-1372** | `WALL_RAKE_SCOPE` was the **FOURTH** hand-written spelling of the spatial tail — `on`→level, `in`→room — so *"in level 3"* never reached the rake grammar at all | folded into the shared `SpatialScopeTail.SPATIAL_TAIL_SRC`; the level arm, the room arm and the ALL-scope-only rule are preserved by test, and an **unusable** place now DECLINES rather than widening | **C67 §4 rule 16** (its own "no gate sees a fourth spelling" note, now with the instance) |
| **L-1373** | ⭐ **90° IS VERTICAL in this codebase**, so *"raked 90 degrees"* **STRAIGHTENS** the walls — the number's meaning inverts what the sentence reads as | see the ruling below | this section |

#### ⭐ THE RULING — the Confirm card MUST state the resulting ORIENTATION in words

`RAKE_VERTICAL_DEG` is **90** (`geometry-wall/src/WallRake.ts:222` — re-measured 2026-08-20; §10 of this contract cites `:182`, which has moved); an unraked wall is 90, and
`vertical` / `upright` / `straight` all map to 90. So a user who says *"rake these 90 degrees"*
expecting a tilt gets the **opposite of his intent**, and the old Confirm copy — `Lean … to 90°
(vertical)` — **contradicted itself in one line**: the verb said lean, the parenthesis said vertical.

**DECIDED, and binding for this family:** a rake Confirm card **MUST** state the resulting
orientation in words, not only the number, because the Confirm card is the last honest moment before
a mass edit and this is precisely the case where a number's meaning inverts the ask.

- `90` → **"Make all 12 walls VERTICAL — 90° is upright, not a lean"**
- any other angle → **"Lean all 12 walls to 70° (90° = vertical)"** — the reference point travels
  with the number, so the user can tell which way 70 leans without leaving the card.

⛔ **The number is NOT reinterpreted.** 90 still means 90; the product does not guess that he meant
*"lean by 90 from vertical"*. It says what it is about to do and lets him decide — the same
discipline as refusing the unit rather than correcting it.

### NOT MEASURED for this family (explicit — EI-1b)

- **No utterance was typed into a live editor.** Every verdict above is source-measured.
- **V6 SYNC** — inherited FAIL from C67 §1.0 (the CRDT read-back leg does not exist; the transport
  defaults OFF). **Not re-derived here**, and not a defect of this family.
- **V3 / V4 / V5 under a CHAT driver** — where this family is dark, they cannot be measured through
  chat at all; where it is published, they are measured only as C67 §1.0 records. ⛔ **The panel's
  passing is NOT transferable evidence** (ADR-0334): publication requires an **executed read-back**
  of this family's geometry store (C16 CA-21), never a `success: true`.
