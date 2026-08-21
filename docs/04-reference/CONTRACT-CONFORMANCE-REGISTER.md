# CONTRACT CONFORMANCE REGISTER — the per-element block and the BIM 3.0 block

- **Status**: LIVING REGISTER — regenerate the measurements, never re-transcribe them
- **Stamp**: 2026-08-21 · HEAD `83192c66` · lane **AUD-6**
- **Scope, stated by ENUMERATION rather than a range.** A range written as a literal has rotted
  five times in this repository (`CLAUDE.md`, Governance) — once demoting **C84 itself** below an
  ADR — so this register names its subjects instead of bounding them:
  - **Per-element block** — `C84` · `C85` `C86` `C87` `C88` `C89` `C90` `C91` `C92` `C93` `C94`
    `C95` `C96` `C97` `C98` `C99` · `C100`
  - **BIM 3.0 block** — `C70` `C71` `C72` `C73` `C74` `C75` `C76` `C77` `C78` `C79` `C80` `C81`
    `C82` `C83`
  - Enumerated from `ls docs/02-decisions/contracts/` at HEAD, **not** from prose.
- **Method**: READ-ONLY. No source changed. `tsc` deliberately not run. Every verdict cites either
  code read at HEAD (`file:line`) or a gate **executed** with its exit code recorded.

---

## 0. The rule this register is written under

> **Every ✅ cites the CODE that makes it true, or a gate that was RUN with its output.**
> A clause that was not traced is **UNMEASURED**. UNMEASURED is an honest verdict and appears here
> in large numbers by design.

Four verdicts, and nothing else:

| verdict | means |
|---|---|
| **CONFORMS** | traced to `file:line`, or to an executed gate with its exit code |
| **VIOLATED** | traced to `file:line`, **and** the user-visible consequence is named |
| **UNENFORCED** | true in the code today, but **nothing prevents regression** — the missing gate is named |
| **UNMEASURED** | not traced. An honest blank |

⭐ **UNENFORCED is the verdict this repository most needs and most rarely records.** `CLAUDE.md`
had to be corrected because it flattened *"enforced"* and *"true"* into one claim for four of its
eight principles. A large share of what looks green below is UNENFORCED, not CONFORMS.

### 0.1 Totals per contract

| contract | CONFORMS | VIOLATED | UNENFORCED | UNMEASURED | rotted citations found |
|---|---|---|---|---|---|
| **C84** ELEMENT INTEGRITY | 1 | 6 | **9** | 4 | 1 (+1 delegated to PROP1) |
| **C85** WALL | 17 | **18** | 4 | 8+ | ~20 line-rot · **4 pessimistic** |
| **C86** WALL.OPENING | 14 | **14** | 4 | 6+ | ~12 line-rot · **3 pessimistic** |
| **C87** CURTAIN WALL | 11 | 4 | 2 | 13 | 4 |
| **C88–C94** horizontal + structural | — | — | — | — | *not delivered — see §3.3* |
| **C95** HANDRAIL | 9 | 1 | 2 | 10 | 0 |
| **C96** LIGHTING | 2 | 3 | 0 | 2 | 1 |
| **C97** FURNITURE | 4 | 2 | 0 | 2 | 3 |
| **C98** STAIR | 10 | 3 | 0 | 14 | 2 (**both pessimistic**) |
| **C99** PLUMBING | 2 | 2 | 0 | 3 | 0 |
| **C100** MASTER MATERIAL DB | 11 | 2 | 3 | 7 | 1 |
| **C70–C83** BIM 3.0 (clauses reached) | 6 | 11 | 2 | 7 blocks untouched | — |
| **TOTAL (reached)** | **87** | **66** | **26** | **76+** | **~50** |

⭐ **Read the UNENFORCED column, not the CONFORMS column.** 26 clauses are true today with nothing
holding them there — and **9 of those 26 are C84's**, the contract binding on every element-family
PR (§2.1).

⭐ **~50 rotted citations, and roughly a dozen rot PESSIMISTICALLY** — the contract describes a
defect that is already fixed (§1, §3.1a, §3.2a). Those are the dangerous ones: they send a repair
lane at a closed defect and they discredit the rows that are still true.

---

## 1. HEADLINE — C84's own headline defect #2 is FALSE, and the mechanism is a duplicate FILENAME

**C84 §1 defect 2 reads:** *"Lighting is never persisted. `grep -ci "lighting"` over
`ProjectSerializer.ts` returns **0** — and `grep -in "light"` over the same file returns **0
matches**, so it is not a spelling artefact. Every light the user places is destroyed on save."*

**Measured at HEAD — it is not true, and it was not true when C84 was written.**

There are **TWO** files named `ProjectSerializer.ts` and **TWO** named `ProjectLoader.ts`:

| file | `grep -ci lighting` |
|---|---|
| `apps/editor/src/engine/persistence/ProjectSerializer.ts` | **10** |
| `apps/editor/src/engine/persistence/ProjectLoader.ts` | **21** |
| `packages/persistence-client/src/loader/ProjectSerializer.ts` | **0** |
| `packages/persistence-client/src/loader/ProjectLoader.ts` | **0** |

**Which one is production?** `apps/editor/src/engine/initPersistence.ts:41` imports
`./persistence/ProjectSerializer`, and `:109` calls `ProjectSerializer.serialize(...)` as the save
delegate. **The production save path is the `apps/editor` copy** — the one that persists lighting.

`apps/editor/src/engine/persistence/ProjectSerializer.ts:1258-1263` carries the fix and names
itself — `§PERSIST-LIGHTING (2026-05-22) — lighting fixtures were NEVER serialized` — sourcing the
store and emitting it at `:1344` (`lighting: lighting.length > 0 ? lighting : undefined`).

**Dated with git, not with a comment:**

```
lighting-serialize added in: 5c8c8791  2026-05-23
C84 added in:               c0c144b2  2026-08-18
git merge-base --is-ancestor 5c8c8791 c0c144b2  ->  0  (YES, ancestor)
```

**The fix predates the claim by 87 days.**

### Why BOTH derivations measured 0

C84 §0 records a "disagreement" between the four-audit sweep (*serializer 0, loader 0*) and the Z8
draft (*serializer 0, loader 18*), and resolves it **in favour of Z8**. Both readings are
reproducible — **against different files**:

- the sweep's *"0 and 0"* is exactly `packages/persistence-client/` (0 and 0);
- Z8's *"0 and 18"* is the persistence-client **serializer** and the apps/editor **loader**.

**Neither reading named its path.** C84 adjudicated a file-identity ambiguity as though it were a
factual disagreement, and the conclusion it drew — *"The LOAD half exists and the SAVE half does
not"* — describes the **twin**, not the product. This is `CLAUDE.md`'s *"Name the gate you ran, or
do not quote a number"* in its file-path form: **name the FILE you grepped.**

### ⭐ The twin has ALREADY caused a real regression — in the opposite direction

`apps/editor/src/engine/initPersistence.ts:88-94` says so in its own words:

> *"…the AI audit log is destroyed on every reload — which is exactly the state PV-05 was recorded
> closed in, **because the fix at `8cab70c1` landed on the persistence-client copy of
> `ProjectSerializer` that this file does not import.**"*

So one duplicate basename has produced **two failures in opposite directions**:

| # | direction | outcome |
|---|---|---|
| PV-05 | a **fix** landed on the dead twin | a row was recorded **CLOSED** while the product still lost data |
| C84 §1.2 | a **measurement** read the dead twin | a contract recorded a **defect** the product had not had for 87 days |

**One root: two files, one basename, and nothing that declares which is authoritative.**

**Missing gate — `check-persistence-twin-authority.ts`:** assert that exactly one
`ProjectSerializer`/`ProjectLoader` pair is reachable from `initPersistence.ts`, and that any field
persisted by the production copy is either present in the twin or the twin is declared
non-production at its head. Today `tools/ga-gate/check-material-id-required.ts:98` hard-codes
`SERIALIZER_REL = 'apps/editor/src/engine/persistence/ProjectSerializer.ts'` — a **single** path —
so its ARM D and ARM E cannot see the twin at all.

> **Correction discipline.** This finding is *stale-PESSIMISTIC* — C84 named a defect the product
> did not have. `CLAUDE.md` records the same shape for P4 (*"said RED when re-running the gate said
> GREEN"*) and P7 (*"wrong, and wrong pessimistically"*). It is recorded rather than quietly
> amended, per C84 §0's own rule that a merge hiding which side was wrong destroys the evidence.

---

## 2. C84 — ELEMENT INTEGRITY: the enforcement ledger

### 2.1 ⭐ Nine of the gates C84 §5 names DO NOT EXIST at HEAD

`find . -name '<gate>*' -not -path '*/node_modules/*'` for each, at HEAD `83192c66`:

| gate C84 §5 names | enforces | found at HEAD |
|---|---|---|
| `check-element-authority.ts` | EI-1 | **0** |
| `check-bridge-field-coverage.ts` | EI-2 — C84 calls it *"the load-bearing one"* | **0** |
| `check-delete-symmetry.ts` | EI-4 / EI-5 | **0** |
| `check-persistence-coverage.ts` | EI-6 | **0** |
| `check-affected-stores.ts` | EI-7d — C84 calls it *"highest value single check"* | **0** |
| `check-undo-store-coverage.ts` | EI-7c | **0** |
| `check-emitter-has-consumer.ts` | EI-13 | **0** |
| `check-constant-copy-pinned.ts` | EI-8a | **0** |
| `check-trigger-has-dispatcher.ts` | EI-12 | **0** |

**C84 is binding on every PR that touches an element family, and it has ZERO dedicated mechanical
enforcement.** C84 concedes part of this — *"Nine of the eighteen invariants have no gate… C84 is
therefore CANONICAL, not ACTIVE"* — but it lists the other nine as **TO BUILD**, and **none of the
nine has been built**. The correct reading is: **eighteen of eighteen invariants are review
judgements today.**

### 2.2 Both `[Z8]` tests C84 §5 marks "NOT ON `main`" are still not on `main`

C84 §5 carries a ⛔ correction stating both files exist only in the lane worktree
`C:/ClaudeWorktrees/Product_Rediness_08/z8-dupaudit`, and rules: *"A row may read `EXISTS` only
after the file is on `main`."* Re-measured at HEAD:

| file | status |
|---|---|
| `tests/parity/wall/stackAB-miter-parity.test.ts` | **ABSENT** |
| `apps/editor/__tests__/OneDeletePathAcrossSurfaces.test.ts` | **ABSENT** |

Three days on, EI-11 and EI-4a remain gated by nothing. The C85/C86 sub-lane independently
confirmed `git ls-files tests/parity/wall/` contains no `stackAB*` file of any kind.

### 2.3 C84 §1 defect 3 (path-dependent delete) — CONFIRMED STILL LIVE

| claim | HEAD |
|---|---|
| the delete **button** never reads `elementType` | **CONFIRMED.** `grep -n elementType apps/editor/src/engine/BimService.ts` → **0 matches**. `BimService.ts:183` constructs `new DeleteElementCommand(id)` from `userData.id` alone |
| `DeleteElementCommand` has no `lighting` branch | **CONFIRMED.** `grep -ci lighting packages/command-registry/src/walls/DeleteElementCommand.ts` → **0** |
| …no `room` branch | **CONFIRMED.** `grep -c roomStore` → **0** |
| the fall-through is at `:650` | **CONFIRMED, unrotted** — `:650` is `return { success: false, affectedElementIds: [], info: ['Element not found in any store'] };` |

**And the refusal is discarded.** `BimService.ts` runs `manager.execute(command);` and **never
inspects the result**, then calls `this.selectionManager.unselectAll()` unconditionally.
`canExecute` does produce a reason (`Element ${id} not found in any store`) — it reaches nobody.

**User-visible consequence:** select a light, a room, or a bare opening and press the delete
**button** — the element stays, the selection is cleared, and no message appears. The same element
deletes from the **keyboard**. This is C70 **L-INV-1** (`[]`/`null`/`0` must not mean *"I could not
answer"*) and **L-INV-3** (*refusals speak … reaching the user verbatim*).

### 2.4 A gate C84 §5 flags as BUGGY is still buggy — and its blast radius is now measured

C84 §5 records: *"`check-verb-register.ts` **BUG**: `TYPE_DECL_RE` (`:135-139`) anchors on
`type\s*` and so misses `{ type: '…'`. `stair.batch.create` is declared at `CreateStairBatch.ts:61`
**and** `initBusHandlers.ts:445`, so **SHADOWED reads 0 and should read 1**."*

**The regex is unchanged at HEAD** (`tools/ga-gate/check-verb-register.ts:135-139`). Its anchor
`(?:^|\n)\s*` requires `type` to be the first token on its line, so a **single-line** BridgeSpec is
invisible. Measured in `apps/editor/src/engine/initBusHandlers.ts`:

| measurement | count |
|---|---|
| single-line `{ type: '<dotted verb>'` entries | **1** |
| …of those, also carrying a `stores:` list on the same line (the gate's own STRICT evidence) | **1** |
| declarations the regex CAN see (`^\s*(modifiers)*type`) | **94** |

**The one invisible declaration is `initBusHandlers.ts:461`** — exactly the one C84 named:

```
{ type: 'stair.batch.create',   stores: ['stair']   },  // DEFERRED: stairs migration pending
```

It sits in `__batchTypes`, and the loop below it skips types already registered (`§OI-053`), so it
**is** a dead second route — a genuine SHADOWED entry. `CreateStairBatch.ts:61` carries the live
`readonly type = 'stair.batch.create';`.

- **Blast radius: 1 of 95 declarations in that file** — narrow, but it is the specific one C84
  called out, and it is still missed.
- **The gate now reports `SHADOWED (dead route): 1`** — that 1 is **`sheet.create`**, a different
  verb. So the true count is **at least 2**, and the gate under-reports.
- ⚠ **C84's citation has ROTTED**: it says `initBusHandlers.ts:445`; the line is now **`:461`**.

> *"A gate that under-detects converts unmeasured into a green tick."* Here it converts a real
> shadow into a silent zero, inside the very gate whose job is to find shadows.

### 2.5 C84 clause-level table

| clause | verdict | evidence |
|---|---|---|
| **§2** canonical pipeline — *"Every element family MUST travel exactly this path"* | UNENFORCED | No gate traverses the pipeline; `check-bridge-field-coverage.ts` (its named enforcer) does not exist |
| **EI-1** one authority per family, and it is NAMED | UNENFORCED | `check-element-authority.ts` absent. `check-verb-liveness.ts` RC=0 but proves only **7 of 337** verbs (§4.2) |
| **EI-1a** store-owner arm | UNMEASURED | not traced |
| **EI-1b** NOT-MEASURED must be declared | UNMEASURED | not traced |
| **EI-2** no silent narrowing at any hop | UNENFORCED | `check-bridge-field-coverage.ts` absent. C85 sub-lane: `joinIntent`, `childrenIds`, `parentId`, `metadata`, `provenance`, `confidence` still dropped silently at `packages/runtime-composer/src/CommandEventBridge.ts:49-66` |
| **EI-3** what the UI offers, the pipeline must accept | UNMEASURED | not traced by this lane |
| **EI-4** ONE delete path, `elementType`-aware | **VIOLATED** | §2.3 — `BimService.ts:183`; `elementType` 0 matches; lighting/room have no branch; refusal discarded |
| **EI-4a** one delete route across surfaces | UNENFORCED | named pin `apps/editor/__tests__/OneDeletePathAcrossSurfaces.test.ts` **not on `main`** (§2.2) |
| **EI-PROP** host moves → dependent adapts or refuses BY NAME | delegated | measured by lane **PROP1**: ADR-0344 + `tools/rac-conformance/certification/gates/check-dependent-adapts-on-host-move.ts` (present at HEAD). 64 cells, 39 SILENT. **Not re-measured by AUD-6** |
| **EI-5** create/delete symmetric across stores | UNENFORCED | `check-delete-symmetry.ts` absent |
| **EI-6** persistence is not optional, and absence must be LOUD | **VIOLATED (the "LOUD" half)** | `check-persistence-coverage.ts` absent; and C84's own EI-6 evidence is the false lighting claim (§1) |
| **EI-7** undo restores every store the edit wrote | UNENFORCED | C84: *"every family fails it"*. `check-affected-stores.ts` + `check-undo-store-coverage.ts` both absent |
| **EI-7d** a declared rollback must exist | **VIOLATED** | C85 sub-lane: `DeleteElementCommand.ts:55` declares `"plumbing"`; `CommandManagerImpl.ts:689-757` recognises 17 keys, **none of them `plumbing`** — a promised rollback that cannot happen |
| **EI-8** one vocabulary per concept | UNMEASURED | not traced |
| **EI-8a** constant copies pinned | UNENFORCED | `check-constant-copy-pinned.ts` absent |
| **EI-9** one answer per question | **VIOLATED** | §1 — `ProjectSerializer.ts`/`ProjectLoader.ts` exist **twice**, differ in what they persist, and the duplication has already produced two opposite failures |
| **EI-10** what a second implementation must earn | **VIOLATED** | the persistence twin carries no EI-10 licence at its head (§1) |
| **EI-11** user-visible and exported must be the same code | UNENFORCED | named pin `stackAB-miter-parity.test.ts` **not on `main`** (§2.2) |
| **EI-12** a registered trigger must have a proven dispatcher | **VIOLATED** | `packages/core-app-model/src/DependencyResolver.ts:196` and `:263-264` both state `setRebuildDispatcher()` is *"Called by EngineBootstrap"*. Repo-wide `rg setRebuildDispatcher` → **2 hits: the declaration and its own comment. Zero callers.** The default window-CustomEvent path is what actually runs; the comment names a caller that does not exist |
| **EI-13** an emitter with no consumer is a declared gap | **CONFORMS** | §4.1 — three unconsumed cascade events were DELETED with their dispatch and tombstoned at `DependencyResolver.ts:176-177`; the fourth gained a real listener |
| **§6** the per-element structure is MANDATORY and IDENTICAL across all fifteen | see §3 | measured by the C88–C94 sub-lane |

**C84 totals — CONFORMS 1 · VIOLATED 6 · UNENFORCED 9 · UNMEASURED 4 · delegated 1.**

---

## 3. The per-element block — C85 … C99, and C100

*(Filled from the AUD-6 sub-lanes. Each sub-lane ran under the same evidence rule as §0.)*

### 3.1 C85 — WALL and C86 — WALL.OPENING

**Totals — C85: CONFORMS 17 · VIOLATED 18 · UNENFORCED 4 · UNMEASURED 8+.
C86: CONFORMS 14 · VIOLATED 14 · UNENFORCED 4 · UNMEASURED 6+.**

The full clause tables are recorded in the AUD-6 sub-lane transcript. The load-bearing findings:

| clause | verdict | evidence |
|---|---|---|
| **W-B-2** (`joinIntent` half) | **VIOLATED** | `grep -n joinIntent packages/runtime-composer/src/CommandEventBridge.ts` → **0**. A bus-created wall carries no `joinIntent`; `ProjectSerializer.ts:645` persists it and calls it unreconstructable. **The founder's mitred corner reverts to square on the create path** |
| **W-X-1 / WO-X-1** `wall.delete` must delegate | **VIOLATED** | `plugins/wall/src/handlers/DeleteWall.ts:61` is a bare `delete draft[cmd.id]`; its header still says doors/windows *"land when the door + window plugins arrive"* — both plugins exist. **Deleting a wall leaves orphaned door/window records and orphaned meshes** |
| **WO-B-1** no silent narrowing at creation | **VIOLATED** | `packages/command-registry/src/walls/CreateWallOpeningCommand.ts:183-215` drops `frameThickness`, `frameWidth`, `fireRating`, `accessibilityType`, `provenance`, `confidence`. **A fire-rated door is created as an ordinary one; the schedule reports blank** |
| **W-ID-2 / WO-ID-2** `'WallPart'` must carry `parentId` | **VIOLATED** | `packages/geometry-wall/src/WallFragmentBuilder.ts` — **12** `elementType: 'WallPart'` sites; only **2** carry `parentId`. Picking and GLB export cannot resolve 10 of 12 sub-part meshes to their host |
| **W-U-2n** declared rollback must exist | **VIOLATED** | see EI-7d above; and `check-affected-stores.ts`, the gate named to catch it, does not exist |
| **WO-V-1 / WO-P-3** batch verbs must refuse as their single twins do | **VIOLATED** | `plugins/door/src/handlers/CreateDoorBatch.ts:87` returns `{ valid: true }`. **A caller routes around `door.create`'s refusal by calling `door.batch.create` with one door** |
| **W-S-5** `window.wallStore` must have ONE assignment site | **VIOLATED** | **two** — `apps/editor/src/engine/initBuilders.ts:553` and `apps/editor/src/engine/initTools.ts:1062`, with no declared ordering |
| **WO-B-2** default divergences must collapse | **VIOLATED** | door width schema `.default(0.9)` (`packages/schemas/src/elements/Door.ts:52`) vs command `?? 1.0` (`CreateWallOpeningCommand.ts:188`); window sill `.default(0.9)` vs `?? 1.0` |
| **WO-S-4** the dual-write obligation is a GATE | **CONFORMS** | `tools/ga-gate/check-hosted-dual-write.ts` **RC=0**, `OK: 3 unpaired = baseline 3 (shrink-only)` |
| **C85-JOIN-1…4** restore-time join recompute | **CONFORMS** | `apps/editor/src/engine/WallRebuildCoordinator.ts:382, :641, :777, :1676-1684, :2531-2540, :846-882` |
| **§10.5** level-scoped recompute invalidated only by inputs it reads | **CONFORMS — by construction** | `packages/geometry-wall/src/WallJoinResolveMemo.ts:142-173` hashes exactly the declared dependency set; `height`, `openings`, `rakeAngleDeg`, `layers` are correctly absent |

#### ⭐ 3.1a Four C85/C86 AS-IS rows are stale in the PESSIMISTIC direction

The same class as §1 — a contract describing a defect that is **already fixed**:

| the contract says | HEAD says |
|---|---|
| C85 §5 row 12 + DELTA #4: `materialId` is **DROPPED (SILENT)** at the bridge | **FALSE.** `CommandEventBridge.ts:57` declares it, `:334` emits it, `initTools.ts:1273` consumes it. **DELTA row #4 — ranked 4th of 20 — is closed and the contract does not know** |
| C86 §7 WO-U-3: the `openings` patch ternary falls to `[]` and *"every opening is stripped"* | **FALSE.** `apps/editor/src/engine/undo/elementUndoStoreAdapter.ts:588-597` refuses (`§EI-7b REFUSED`) and routes arrays to a hosted-aware reconciler |
| C86 §11 #21: `OpeningSchema` carries *"neither `doorType` nor `windowType`"* | **FALSE.** `packages/geometry-wall/src/WallDataSchema.ts:112-113` declares both; the header at `:76-101` explicitly retracts the claim |
| C85 §8: `buildWallRoomCascadeRule` has *"zero non-test call sites"* | **FALSE.** `plugins/cross/src/handlers/index.ts:47, :112` |

#### ⭐ 3.1b Citation rot is systematic, and re-measuring line numbers does not fix it

The sub-lane re-measured 60+ AS-IS citations. **Roughly two-thirds had rotted.** The pattern is
sharp and worth recording as a rule:

- Citations into **plugin handler** files (small, one verb each) **held** — `MoveWall.ts:115`,
  `CreateDoor.ts:154`, `CreateWindow.ts:98`, `MoveDoor.ts:109`, `MoveWindow.ts:108`,
  `DeleteWall.ts:61`, all nine `affectedStores: []` wall handlers, `material-bridge.ts:34-35`.
- Citations into the four large integration files — `initTools.ts`, `ProjectSerializer.ts`,
  `CommandManagerImpl.ts`, `performUndoRedo.ts` — and the two big builders (`WindowBuilder.ts`,
  `DoorBuilder.ts`) **rotted by 40–180 lines**, **including every one already re-measured on
  2026-08-18/19**.

Worst cases: `WallFragmentBuilder.ts:2332` for `'WallPart'` is cited by **both** contracts as **one**
site; it is **12 sites and none is at `:2332`**. A verbatim block quote of `performUndoRedo.ts:345-351`
in C86 quotes text that no longer exists in the file.

> **Rule:** re-measuring a line number in a file that moves 100 lines a week buys about one day.
> The `§`-tag discipline C85 R-8 and C86 §10 both prescribe is the only citation form that survived
> — and neither contract applies it to its own AS-IS tables.

### 3.2 C87 · C95 · C98 — the assembly families (curtain wall, handrail, stair)

**Totals — C87: CONFORMS 11 · VIOLATED 4 · UNENFORCED 2 · UNMEASURED 13.
C95: CONFORMS 9 · VIOLATED 1 · UNENFORCED 2 · UNMEASURED 10.
C98: CONFORMS 10 · VIOLATED 3 · UNENFORCED 0 · UNMEASURED 14.**

| clause | verdict | evidence |
|---|---|---|
| **C87 CW-P-D** a lost override MUST be reported by name, never silently dropped | **VIOLATED** | The report is built (`ProjectLoader.ts:1499`, pushed to `result.warnings` at `:1466`) — **and `LoadResult.warnings` reaches no UI.** The only shell consumer, `apps/editor/src/ui/platform/PlatformVersionController.ts:420-426`, reads `result.errors`; the other four `loadAdapter.load()` call sites discard the result. **User-visible: reload a project whose grid was re-spaced and an authored door panel is simply gone, with nothing on screen saying so** |
| **C87 CW-U-4n** curtain-wall must join `restoreWallAudit`'s gate | **VIOLATED** | `packages/command-registry/src/generic/UpdateElementParameterCommand.ts:528-535` — `captureWallAudit` returns `null` unless the type is `wall`/`door`/`window`. **`metadata.version` ratchets forward on every curtain-wall undo — the model after undo is not the model before the edit** |
| **C87 CW-U-3n** redo stash must cover the field arm, or refuse for renamed-field families | **VIOLATED** | The refusal machinery exists (`elementUndoStoreAdapter.ts:636-646`) but `curtainwall` declares no `divergentL1Fields` (`legacyStoreUpdateSemantics.ts:176-180`; contrast `roof:` at `:171-174`). L1 writes `bayWidth`; the builder reads `cw.gridXSpacing`. Undo writes a phantom key and reports success |
| **C87 CW-Sel-1** TAB order derived from the grid, never scene-graph child order | **VIOLATED** | `packages/input-host/src/SelectionManager.ts:2817-2828` builds the mullion half with `cwGroup.children.forEach(...)` — no sort by `mullionAxis`/`mullionT`. Panels (`:2799-2803`) are correctly grid-sorted. **TAB focus lands on a different mullion after a rebuild** |
| **C87 CW-P-A…E** authored panel deltas survive save/load, keyed on line ids | **CONFORMS (4 of 5)** | `ProjectSerializer.ts:1217-1240`, `:1347`; `ProjectLoader.ts:1455-1471`; `packages/geometry-curtain-wall/src/curtainPanelOverrides.ts:128-141, :157-178, :284-312`. **This family has BOTH persistence legs** — the counter-example to §1's twin failure |
| **C87 CW-U-1n** no flattening a patch deeper than `[id,field]` | **CONFORMS** | `elementUndoStoreAdapter.ts:333`, `:363-371`; refusal at `:564-572`. **C84 EI-7b's worked example now truncates the array instead of assigning a number — that defect is CLOSED** |
| **C87 CW-Voc-5** `PanelType` is master; `PanelKind` a generated projection | **UNENFORCED** | `packages/schemas/src/elements/CurtainPanelVocabulary.ts:102-127` is a **hand-written literal map** (L0 cannot import geometry). Adding a 14th `PanelType` member compiles. **Missing gate: vocabulary-equivalence over `PanelType` ↔ `CURTAIN_PANEL_TYPES`** |
| **C95 §15.1** a hosted railing's DERIVED property edit MUST refuse by name | **VIOLATED** | `packages/command-registry/src/handrails/UpdateHandrailCommand.ts` contains **zero** occurrences of `hostId`; `execute` writes `baseLine` unconditionally at `:177-181`. **Edit a stair-hosted railing's line and it reports success, with nothing saying the stair owns that value** |
| **C95 §15.1** `hostId`/`hostKind` carried by every creation path and persisted | **CONFORMS** | `packages/core-app-model/src/stores/HandrailTypes.ts:132, :144`; `CreateHandrailCommand.ts:57-58,171-172`; `CreateHandrailRunCommand.ts:86-87,134-135`; `CreateHandrailRunOnSlabCommand.ts:294-295`; `handrailPersistence.ts` `CARRIED_FIELDS` |
| **C95 §15.1 (EI-5)** deleting the host deletes hosted railings in the SAME undo entry | **CONFORMS** | `packages/command-registry/src/stair/DeleteStairCommand.ts:54, :219-223, :257-262, :395-408` — one command, one undo entry |
| **C95 §15.6** the projection MUST emit `materialColor: def.materialColor ?? null` | **CONFORMS** | `packages/geometry-handrail/src/handrailTypeProjection.ts:99` (typed `string \| null`, never optional), `:127` |
| **C95 §15.5 R6** `HandrailData.panels?` | **UNENFORCED** | 0 declarations; the subject is not built, so nothing violates it — and nothing would catch it landing without the round trip the clause specifies |
| **C98 N6** `StairGeometryLimits.ts` is the ONE authority; ⛔ no private tread/riser constant | **VIOLATED** | **Three** rival `STAIR_CONSTRAINTS`: `packages/geometry-stair/src/StairTypes.ts:222` (12 keys, the authority's source), `packages/core-app-model/src/stores/StairTypes.ts:194` (**10 keys — missing `MAX_TREAD_DEPTH` and `MAX_RISERS_PER_FLIGHT`**), and `packages/constraint-solver/src/stair-constraint-engine.ts:7-18` (**private, inlined**, plus a bare `0.220` literal at `:68`). The third is **live** — reached from `UpdateStairFlightsCommand.ts:78`, `ChangeStairShapeCommand.ts:68`, `StairCommandPlan.ts:53`. **The overlapping values agree today, which is exactly the coincidence N6 exists to stop** |
| **C98 §L-1441.3.a** `UpdateStairParametersCommand` must call `checkStairGeometry` | **VIOLATED** | It does not import it; the three mentions (`:328,:330,:341`) are in a doc-comment on a different method. `canExecute` hand-tests constants at `:127-131` (riser) and `:150-151` (**tread min only**). **`MAX_TREAD_DEPTH` is never referenced. "Change the tread to 500 mm" is written and reported as done against a 360 mm declared maximum** |
| **C98 §L-1441.6.a** a bulk capability MUST NOT accept what its one-element form refuses | **VIOLATED** | `UpdateElementParameterCommand.ts:892-908` — `validateParameters(parameters, _elementType)` **discards the element type** and checks only `isNaN` and positivity. The single-stair route enforces `MIN_WIDTH` 0.9 m. **The same ask spoken over three stairs writes a 0.1 m stair and reports success** |
| **C98 §16.1.a-c, §16.6.a-c, N1, N11, N12, §8.2** | **CONFORMS (8)** | `elementCreationMatrix.ts:109,131,427,434,441,560-570`; `stairByWalls.ts:49,76-79,85-87,174-180,268-288`; `StairHorizontalHostPiercing.ts:342`; `stairOpeningId.ts:35,44-51,61-64`; `CreateStairCommand.ts:679-690, :747-762` |
| **C87 / C72 §2** the emitter must carry `prevState` | **VIOLATED** | `tools/ga-gate/check-prevstate-contract.ts` **RC=3**: *"`packages/geometry-curtain-wall/src/CurtainWallStore.ts:478` emits `'update'` with 2 argument(s) — no prevState"*, and it is **NOT ON THE LEDGER** |

#### 3.2a Two more PESSIMISTIC rot findings, and one measurement without a clause

- **C98 §8.2's cited defect is CLOSED.** The contract cites `CreateStairCommand.ts:502` emitting
  `bim-stair-railing-proposal` and a listener at `initTools.ts:2270-2283`, producing *"three presses
  to undo one gesture"*. **No emitter exists** — `CreateStairCommand.ts:659` says so itself, and
  `:679-690`/`:747-762` execute the railings inside the create's own `execute`/`undo`. The listener
  survives at `initTools.ts:2493-2514` as **dead code with no emitter**.
- **C87 CW-U-1n's worked example is CLOSED.** C84 EI-7b's
  `{op:'replace', path:[id,'panels','length'], value:0}` now truncates rather than assigning.
- ⭐ **A measurement with no clause to hang it on:** `isSubElement` is set by
  `geometry-curtain-wall` (7 sites), `geometry-furniture` and `geometry-lighting` — and by
  **neither `packages/geometry-stair/src/` nor `packages/geometry-handrail/src/`**. So handrail
  posts/balusters and stair treads/risers are **not individually addressable at HEAD**. Only C87
  states a MUST here (CW-Sel-1/2); C95 and C98 do not. Recorded as a measurement, not a verdict —
  and as a **gap in the contracts**, not only in the code.

### 3.3 C88 · C89 · C90 · C91 · C92 · C93 · C94 — horizontal and structural families

*Sub-lane result pending at the time of writing; see the AUD-6 report for the delivered table,
including the C84 §6 structural-compliance measurement (which mandatory sections each contract
omits, and how many cells are BLANK rather than `NOT MEASURED`).*

**A structural observation that stands independently of that sub-lane:** five of these seven
contracts carry almost no normative prose. Measured with
`grep -cE '\b(MUST NOT|MUST|SHALL NOT|SHALL)\b'`:

| contract | lines | normative clause lines |
|---|---|---|
| C88 CEILING | 581 | **7** |
| C89 FLOOR | 668 | **9** |
| C91 COLUMN | 451 | **5** |
| C93 BEAM | 441 | **5** |
| C94 ROOM/SPACE | 851 | **7** |
| C90 ROOF | 836 | 39 |
| C92 SLAB | 1001 | 33 |

Five contracts averaging **6.6 normative lines per ~600 lines of document**. Whatever those
documents are doing, they are not primarily binding behaviour.

### 3.4 C96 · C97 · C99 · C100 — lighting, furniture, plumbing, materials

**Totals — C100: CONFORMS 11 · VIOLATED 2 · UNENFORCED 3 · UNMEASURED 7.
C96: CONFORMS 2 · VIOLATED 3 · UNMEASURED 2.
C97: CONFORMS 4 · VIOLATED 2 · UNMEASURED 2.
C99: CONFORMS 2 · VIOLATED 2 · UNMEASURED 3.** Five ROTTED citations across the four.

| clause | verdict | evidence |
|---|---|---|
| **C99 R8** `plumbing.create` MUST refuse in `canExecute`, naming the mechanism | **VIOLATED — the worst in this register** | `plugins/plumbing/src/handlers/CreatePlumbing.ts:39-53` returns `{ valid: true }`; `:55-80` writes the DTO and returns `success: true`. And there is **no consumer**: `CommandEventBridge.ts:1030-1034` emits `plumbing.created`, but `grep "plumbing.created"` over `initTools.ts` + `initBusHandlers.ts` → **0 hits** (the `§FT-` bridges are HANDRAIL, LIGHTING, FURNITURE only). **User-visible: the user draws a pipe and gets no error, no mesh, no plan symbol, and nothing on save. Silence, not refusal — precisely what C84's governing sentence forbids** |
| **C100 §10.4** MUST NOT ship `maps` while nothing can load them | **VIOLATED (default build)** | 16 rows ship `/items/textures/…`. The 74 verified `.webp` files exist **only** under `tools/texture-pipeline/out/dist/`; `public/items/textures`, `client/public/items/textures` and `dist/items/textures` are all **MISSING** (`find … -name '*.webp'` → **0**). `catalogAssetUrl.ts:108-112` returns `/items/…` unchanged when `VITE_GLB_URL` is unset. **User-visible: pick "Oak Parquet Plank" and get a flat colour.** Production delivery is UNMEASURED — `verify-delivery.mts` ARM C is skipped without `--base`, and CORS is browser-only (L-578) |
| **C100 §10.10 / S33** the 24 procedural patterns | **CONFORMS as contracted — but two artefacts lie about it** | `MaterialResolver.ts:418-421` gates generation on `__pryzmProceduralTexturesV1`, default **OFF** (`:394-406` gives the reason: 150–830 ms of blocked main thread; *"The founder's demo project froze"*). C100 §10.10 and S33 state this correctly. **`MaterialResolver.ts:444-450` says the opposite** (*"24 parquet and tile patterns are reachable today"*) twelve lines above the code that makes them unreachable, **and `check-material-maps-tiling.ts:204-205` asserts a complete disjunction that is false** |
| **C96 §4.2 EI-9** ONE `affectedStores` answer per family | **VIOLATED** | `['level']` at `CreateLightingCommand.ts:65`, `DeleteLightingCommand.ts:11`, `MoveLightingCommand.ts:17`; `['lighting']` at `CreateLightingByRoomCommand.ts:36`, `UpdateLightingParametersCommand.ts:46`. A 3-vs-2 split inside one directory; `UpdateLightingParametersCommand.ts:43-45` diagnoses it for itself and the diagnosis was never applied to its siblings |
| **C97 §5.1** the furniture field map | **VIOLATED — CONFIRMED** | `commands.ts:755` + `CreateFurniture.ts:64-77` (11 reads, 9 `??` defaults). **0 of 7 dispatch sites send `catalogId` or `origin`.** `Furniture.ts:82-115` defaults every target field, so `parse` succeeds. **Every furniture item in the plugin DTO store is `catalogId:''`, `origin:{0,0,0}`, `representations:{}`** |
| **C97 §5.3** silent geometric defaults at the bridge | **VIOLATED** | `initTools.ts:~2307-2309` — `width ?? 0.6`, `length ?? 0.6`, `height ?? 0.9`. Turns a dispatcher bug into a plausible-looking box |
| **C100 §2.1** `materialId` is PERSIST-OR-LOSE | **VIOLATED** | ARM D: `ProjectSerializer.ts serializePlumbing()` writes no `materialId`. **A plumbing fixture's material is correct until reload, then wrong** |
| **C100 §9.6.a/b** every producer's colour slot routes through `resolveMaterialColorSlot` | **VIOLATED** | ARM C: **7 of 17** unrouted — `buildMullions.ts`, `buildPanels.ts`, `buildTransoms.ts`, `_shared/linear-structural.ts`, `dimension.ts`, `room.ts`, `slab.ts` |
| **C100 §9.7** runtime record and schema must agree | **VIOLATED** | ARM F: `LightingTypes.ts`, `PlumbingTypes.ts`, `StairTypes.ts` declare **no** `materialId` while their L0 schemas do. The gate states the distinction exactly: *"'the serializer drops it' and 'there is no field to drop' are different defects with different fixes"* |
| **C100 §1.1 / §1.2** one enumeration, no literals in the projection | **CONFORMS** | `check-material-single-source.ts` RC=0 — 329 rows / 329 unique ids; `0 '#rrggbb'`, `0/0 '0x'`; 3 rivals declared with owning slices |
| **C100 §5** failure produces a value MARKED unresolved, carrying the failing id; never throws | **CONFORMS** | `MaterialResolver.ts:461-467`, `:566-575`, `:586-588` — all return `{ unavailable: string }` naming the id |
| **C100 §10.2.c** maps imply usable tiling, rewritable path, decodable format | **CONFORMS** | `check-material-maps-tiling.ts` RC=0, hard-fail-at-zero, no baseline; prefix and extensions **read from the seam, not transcribed** |
| **C100 §1.3 / §4.2 / §8.3** designated accessors; no rival table in an adapter | **UNENFORCED** | no gate has an accessor arm, and `check-material-single-source` scans **two named files only**. **Missing gate: a repo-wide arm over `MATERIAL_CATALOG.find(`/`.filter(` outside `materialCatalog.ts`, and over adapter directories** |
| **C85 W-Voc-1** the material-library id must be consumed | **VIOLATED** | `plugins/wall/src/committer/material-bridge.ts:34-35` reads `parts[3]` (the hex); **`parts[2]`, the `materialId`, is parsed past and discarded** |

#### ⭐ 3.4a C84's furniture ROOT CAUSE is wrong — and C97 states it correctly

C84 §1 defect 1 ends: *"Four `as any` casts at the dispatch sites are why `tsc` never saw it."*
Measured at the five dispatch sites: **3 `as any` + 1 double-cast (`as unknown as
Record<string, unknown>`) + 1 site with no cast at all.**

⭐ **`CopyPlanToolHandler.ts:502-505` dispatches a full payload with NO cast** and type-checks
purely on the `[k: string]: unknown` index signature at `commands.ts:755`. **Removing all four
casts would surface nothing.** C97 §5.2 says exactly this — the index signature must go first —
and C84 §1's summary flattens it into the wrong fix.

**A contract that names the wrong root cause is worse than one that names none**: it directs the
repair at a symptom, and the repair will be recorded as closing the defect.

#### 3.4b The furniture defect is MASKED, which is why it has survived

`initTools.ts:2239-2351` (`§FT-FURNITURE`) rebuilds a legacy `FurnitureData` from the *original*
event fields, so **a mesh appears and looks right**. The mangled record is the plugin DTO store
copy. `initTools.ts:2228-2234` states the mismatch verbatim in a comment. **Any consumer that
migrates off the legacy store inherits a store full of blanks** — this is a latent migration
landmine, not a visible bug.

---

## 4. BIM 3.0 — C70 … C83: what is promised, and what is built

### 4.1 The five defects C70 §0 names — re-measured

C70 §0 grounds the whole contract in five measured failures. Re-measured at HEAD:

| # | C70 §0's claim | HEAD |
|---|---|---|
| 4 | *"The 'FreeCAD-grade constraint solver' is a mock."* | **STILL A MOCK — and now HONESTLY DECLARED.** `packages/constraint-solver/src/engine.ts:85-86`: *"No such solver ships in this repo (C74 §4.5)."* `MockSolver` declares `readonly kind = 'mock'` at `:94`. `check-solver-is-real.ts` **RC=0**, hard-0 |
| 5 | *"Four typed cascade events have zero listeners… `setRebuildDispatcher` is never called."* | **CLOSED, 4 of 4 — but not as written.** `pryzm-dep-cascade` gained a real listener at `apps/editor/src/engine/initDependencyCascade.ts:43` (dispatched from `packages/core-app-model/src/DependencyResolver.ts:172`). The other three — `pryzm-room-reval`, `pryzm-hosted-reval`, `pryzm-structural-cascade` — were **DELETED with their dispatch** on 2026-08-12, tombstoned at `DependencyResolver.ts:176-177`, removed from `packages/event-bus/src/catalog.ts:230, :247, :251`, and recorded in `tools/rac-conformance/certification/gates/cascade-events.json`. **`addEventListener` sites for all three: 0. Dispatch sites: 0.** Deleting the emitter is the correct EI-13 close |

⚠ **The `setRebuildDispatcher` half of #5 is NOT closed** — see EI-12 in §2.5. Two comments name
`EngineBootstrap` as the caller; there are zero callers.

> Recorded as a **correction in the optimistic direction**: C70 §0's cascade claim reads worse than
> HEAD. Per `CLAUDE.md`'s P4/P7 precedent, a stale-pessimistic line is the same defect class as a
> stale-optimistic one, and must be corrected with the same force.

### 4.2 Gates executed — actual output, exit codes, and blind spots

Every gate below was run at HEAD `83192c66` via `npx tsx tools/ga-gate/<name>.ts`. Exit codes are
this repo's four-code contract (C70 §5): **0** clean · **1** at declared level · **3** ratchet
exceeded / stale ledger.

| gate | RC | reading | pillar |
|---|---|---|---|
| `check-solver-is-real` | **0** | 0 findings, hard-0. **173 manifests · 4773 files.** Runs a **planted negative control** and watches R1/R2/R3 fire | G-INV-1 |
| `check-constraint-honesty` | **0** | 0 findings, hard-0. Each family REAL at its declared strength | G-INV-2 |
| `check-provenance-coverage` | **0** | 0 findings, hard-0 | H |
| `check-derived-not-authored` | **0** | 0 findings, hard-0; 5 arms watched firing on a planted tree | H-INV-2 |
| `check-scene-graph` | **0** | `0 NME proxy-add-to-scene violations`; 5155 files scanned, floor 3000 | — |
| `check-cross-process-determinism` | **0** | `4 fixture(s) byte-identical across 3 processes` | E-INV |
| `check-hosted-dual-write` | **0** | `3 unpaired = baseline 3 (shrink-only)` | C15 §8.1 |
| `check-material-single-source` | **0** | PASS — *"one material vocabulary; the rivals are declared, not silent"* | C100 |
| `check-material-id-required` | **0** | at baseline: ARM C **7/7** · ARM D **1/1** · ARM F **3/3** | C100 |
| `check-material-maps-tiling` | **0** | PASS, hard-fail-at-zero | C100 |
| `check-verb-liveness` | **0** | **PROVEN 7**, UNPROVABLE-NO-STORE **116**, UNKNOWN **214** | A-INV / EI-1 |
| `check-triangulation-canonical` | **1** | 2 findings, at declared level 2 | E-INV-2 |
| `check-property-rac-matrix` | **1** | **75 SILENT + 1 EXECUTE-ONLY** at declared level | C67/C68 |
| `check-verb-register` | **1** | **4 failures** (see below) | C69 |
| `check-prevstate-contract` | **3** | **2 findings vs declared 0** — RATCHET EXCEEDED | F-INV-1 |
| `check-graph-write-coverage` | **3** | **4 findings vs declared 0** — RATCHET EXCEEDED | C-INV-1 |
| `check-provenance-not-invented` | **3** | 2 findings **+ STALE LEDGER** | H-INV-1 |
| `check-deterministic-regeneration` | **3** | **STALE LEDGER** — 3 declared entries no longer measured | E-INV-1 / I-INV-1 |
| `check-epsilon-policy` | **3** | **345 findings against a declared level of 318** — RATCHET EXCEEDED | E-INV-2 |
| `check-refusal-identity` | **3** | RATCHET EXCEEDED | L-INV-3 |
| `check-secrets-register` | **3** | **13 vs declared 12**, plus `docs/04-reference/SECRETS-REGISTER.md` is **STALE (DRIFT)** | C77 |

**Rollup: 10 at RC=0 · 4 at RC=1 · 7 at RC=3.** Seven gates are in breach of their own shrink-only
ratchets at HEAD.

#### The RC=3 breaches, in full

- **`check-epsilon-policy` — 345 vs 318.** The ledger is shrink-only and the count has **grown by
  27**. E-INV-2 (*one canonical predicate family under one declared epsilon policy*) is not merely
  unmet — it is moving away.
- **`check-graph-write-coverage` — 4 vs 0.** REQUIRED relationship families **`hosts`**,
  **`boundedBy`**, **`connectedTo`**, **`contains`** have **no typed production reader** —
  *"write-only state nobody can query"*. The gate explicitly rejects the near-miss:
  *"an allowlist for a dynamic reader is not a typed reader (C71 §1.3)"*, naming
  `packages/ai-host/src/graph/GraphQueryService.ts:143, :145, :147, :148`. **This is C70 C-INV-1,
  and it is the centre of the BIM 3.0 story: the topology is written and cannot be read back.**
- **`check-prevstate-contract` — 2 vs 0.** `packages/geometry-curtain-wall/src/CurtainWallStore.ts:478`
  emits `'update'` with two arguments. **NOT ON THE LEDGER.**
- **`check-provenance-not-invented` — 2 findings + STALE LEDGER.** `packages/schemas/src/family-registry/from-pipeline.ts:268`
  (`opts.origin ?? 'user'`) and `packages/site-parcel-data/src/ZoningRulesEngine.ts:181`
  (`packProvenance ?? 'estimated'`). The ledger still names `:163` for the second — **the debt moved
  18 lines and the ledger did not follow**, which is §3.1b's citation rot appearing inside a gate's
  own ledger.
- **`check-deterministic-regeneration` — STALE LEDGER**, 3 entries no longer measured. It also
  states its own hard limit: *"0 of the classified field paths name GEOMETRY… the GEOMETRY half of
  C73 §1.3 has no classification input in this repo today."*
- **`check-refusal-identity` — RATCHET EXCEEDED.** L-INV-3 (*refusals speak*) is in breach — the
  same invariant §2.3's delete button violates.
- **`check-secrets-register` — 13 vs 12 + DRIFT.** `WORKER_CONCURRENCY` is read at
  `apps/bake-worker/Dockerfile:32` with no declaration row.

#### ⭐ Gate blind spots — what these instruments structurally CANNOT see

A gate that under-detects converts *unmeasured* into a green tick. Each of these was read in
source or taken from the gate's own printed self-limitation:

| gate | blind spot |
|---|---|
| `check-verb-register` | **§2.4** — `TYPE_DECL_RE` anchors on line-start, so a single-line `{ type: 'x.y', stores: [...] }` is invisible. Measured: 1 of 95 in `initBusHandlers.ts`, and it is the one C84 named. Separately, it classifies REFUSES by **slicing source from `canExecute` to the next `execute(`** — a `validatePayload` in between mis-reports the verb. Two files now carry an *"ORDER IS LOAD-BEARING"* comment (`MoveWall.ts:100-102`, `CreateDoor.ts:102`): **the code has been shaped to satisfy the parser.** A gate that classifies by POSITION is satisfied by re-ordering |
| `check-material-single-source` | **PASSES while declaring its four load-bearing arms NOT CHECKED** — and says so: *"ARM A colour-without-id · ARM B a stored materialId that resolves to NOTHING · ARM C a producer that mints a key without the master resolver · ARM D persistence round-trip. Those four were listed here as NOT CHECKED and are where **every measured material loss in L-1038** lives."* **The gate is green precisely where the defects are** |
| `check-material-id-required` | **RC=0 while carrying 11 real findings as baseline** (7 ARM C + 1 ARM D + 3 ARM F). Green ≠ conformant. Four further blind spots read from source: ⭐ **ARM C sees exactly ONE directory** — `PRODUCER_DIR_REL = 'packages/geometry-kernel/src/producers'` (`:97`) — so it **cannot see any `geometry-*/src/*FragmentBuilder.ts`, the live editor render path**; the gate's own `BASELINE_D` comment (`:83`) records that this confusion already produced a wrong finding once, so **it reproduces the error it documents**. ARM C's minter test `/asMaterialKey\(\s*\`/` (`:314`) needs a template literal immediately after the paren. ARM C's `routed` test checks the **IMPORT, not the CALL** (`:318-320`) — the name-based-classifier class. ARM D's escape hatch `Object\.(entries\|keys)\s*\(` (`:467`) lets **any** `Object.keys(` in a serializer body prove it persists the id. ARM F's pairing is a **hand-frozen table** (`:744`) that **pointed at a DEAD RIVAL** until L-1463. Additionally `:98` hard-codes a **single** `SERIALIZER_REL`, so ARM D/E cannot see the `packages/persistence-client` twin (§1) |
| `check-material-maps-tiling` | ⭐ **ARM D is ONE-DIRECTIONAL while its own comment claims both.** `:129-134` says *"⚠ COMPARED AS SETS, IN BOTH DIRECTIONS"*; the code at `:140-157` iterates `manifest.materials` **only** — there is no loop over catalogue rows. Latent today (16 = 16); a hand-added file-backed row tomorrow is invisible. **The exact defect class, inside the comment that names it.** ⭐ **ARM D self-disables silently** — `if (existsSync(MANIFEST))` at `:136` with **no `else`**, while every other missing input exits 2. ⭐ **Its closing summary is FALSE** — `:204-205` asserts the procedural rows *"can only be wrong about SCALE"*; `MaterialResolver.ts:418-421` and `:566-575` falsify it. **289 of 329 rows are outside ARMs B–E entirely**, so C100 §10.3.b's original defect (*"a row without a map is a brown rectangle"*) has no arm |
| `check-material-single-source` | the rival ledger is **hand-declared** — a fourth rival is caught only if it types a hex in one of **two** scanned files; a rival storing ids as `const` strings, a TS enum or a JSON import is invisible. `RenderMaterialLibrary.ts` is declared with *"8 of its 16 ids have no master row"* and **no arm shrinks that 8** — declared debt with no ratchet is not enforcement |
| `check-hosted-dual-write` | judges pairing at **FILE** granularity (its own declared unsoundness) — a file with 9 write sites and 1 paired write reads PAIRED. Keys on the **names** `wallStore.updateDoor/updateWindow`; a rename or an aliased call is invisible |
| `check-verb-liveness` | **GROW-ONLY** ratchet at baseline 7. It passes while the unproven set expands: C84 §5 recorded *"PROVEN 7 / 326 · UNPROVABLE 109 · UNKNOWN 210"*; HEAD reads **PROVEN 7 · UNPROVABLE 116 · UNKNOWN 214** — denominator **326 → 337**, proven unchanged. Its own words: *"Neither is a pass; both are the work"* |
| `check-cross-process-determinism` | states it: *"does NOT prove cross-MACHINE determinism (C73 §5.4b) — every replica ran on one CPU and one V8 build — and it cannot reach GPU-side geometry (§5.4c) at all. GE-08 stays UNPROVEN for both"* |
| `check-triangulation-canonical` | states it: *"NOT PROVEN: correctness of any surviving body — counting gates are blind to it by design; and the `THREE.ShapeUtils.triangulateShape` call-site axis, which no body count can see"* |
| `check-derived-not-authored` | states it: cannot see *"a semantically false `authoredProvenance()` call around machine output; an origin decided at runtime by a branch; cross-session overwrites"* |
| `check-property-rac-matrix` | names **5 panels OUTSIDE its denominator** that can rot — the Room panel, curtain sub-element panels, wall/slab layer editors, curtain grid editors, and `PlacementEditor.ts` (where wall LENGTH is editable and *"is in NO family table, so it is outside this denominator entirely"*) |
| `check-deterministic-regeneration` | **0 of its classified field paths name GEOMETRY** — the geometry half of C73 §1.3 has no classification input at all |

**The honest ones are the good ones.** `check-solver-is-real` and `check-derived-not-authored` both
run **planted negative controls** and watch their arms fire before reporting — that is C70 §0.1's
standard (*"an executed run whose comparator has been watched go red"*), and it is the pattern the
nine missing C84 gates should be built to.

### 4.3 The BIM 3.0 completion picture — with a defensible denominator

There are two candidate denominators. Both are named, because a completion percentage without its
denominator is not a measurement.

**Denominator A — C70's own invariants.** C70 §2 fixes **12 pillars** carrying **39 stable
invariant ids** (A 3 · B 3 · C 4 · D 3 · E 3 · F 3 · G 4 · H 3 · I 3 · J 3 · K 3 · L 4). This is the
contract's own normative unit and cannot rot, because the ids are declared stable.

**Denominator B — the live instrument.** `tools/bim30-status/bim30-status.ts` grades the tracker row
by row against a deciding gate. **It was re-run at HEAD by this lane** (`npx tsx
tools/bim30-status/bim30-status.ts`, RC=0), because the recorded artefact was **766 commits stale**
(`git rev-list --count a296069d..HEAD` → 766). Both readings are given, because the drift between
them is itself the finding:

| | recorded `a296069d` | **fresh, HEAD `83192c66`** |
|---|---|---|
| rowsParsed / counted | 84 / 82 | 84 / 82 |
| measured | 54 | **62** |
| **carried** (no deciding instrument) | 27 | **19** |
| closedOfMeasured | 43 | **47** |
| **ratchetBreaches** | 3 | **11** |
| CLOSED + MEASURED | 39 | **47** |
| **…of which the gate is RED** | 5 | **7** |

**The completion picture at HEAD:**

| category | rows | of 82 |
|---|---|---|
| **CLOSED and verified GREEN by an executed gate** | **40** | **49 %** |
| CLOSED but its deciding gate exits NON-ZERO | **7** | 9 % |
| measured, not declared closed | 15 | 18 % |
| **CARRIED — "no deciding instrument declared"** | **19** | **23 %** |
| not determined | 1 | 1 % |

⭐ **The defensible statement is: 40 of 82 rows (49 %) are closed AND proven by a gate that ran.**
Not 47/82 (57 %), which is what `closedOfMeasured` reads if the seven red rows are not subtracted.

**The drift is genuinely two-sided, and both directions matter:**

- **Instrumentation improved.** `carried` fell **27 → 19**: eight rows that were taken on a
  declaration now have a deciding gate. That is real progress and is recorded as such.
- **Conformance degraded.** `ratchetBreaches` rose **3 → 11**, and CLOSED-but-RED rose **5 → 7**.

**⛔ Seven rows declare CLOSED while their own deciding gate exits non-zero (fresh, HEAD):**

| row | block | exit at `a296069d` | **exit at HEAD** | gate |
|---|---|---|---|---|
| **GR-01** | Graph & topology | 1 | **3** | `check-graph-write-coverage` |
| **GR-05** | Graph & topology | 1 | **3** | `check-graph-write-coverage` |
| **PV-01** | Provenance | 1 | **3** | `check-provenance-not-invented` |
| **PV-03** | Provenance | 1 | **3** | `check-provenance-not-invented` |
| **PR-09** | Propagation & prevState | 1 | 1 | `check-propagation-trackers-reach` |
| **PR-03** | Propagation & prevState | — | **3** *(newly red)* | `check-prevstate-contract` |
| **MT-02** | Model truth, verbs & identity | — | **1** *(newly red)* | `check-verb-register` |

**Four rows degraded from *at declared level* to *ratchet exceeded*, and two more turned red.** The
contradiction is live and widening. PR-03's gate is the `CurtainWallStore.ts:478` finding in §3.2;
MT-02's is the `check-verb-register` failure whose own regex bug is §2.4.

**Per-block completion at HEAD:**

| block | rows | measured | carried | CLOSED-green | CLOSED-but-RED |
|---|---|---|---|---|---|
| Graph & topology | 18 | 16 | 2 | 11 | **2** |
| Propagation & prevState | 13 | 12 | 1 | 8 | **2** |
| Geometry determinism & tolerance | 12 | 11 | 1 | 5 | 0 |
| Constraint honesty | 12 | 10 | 2 | 9 | 0 |
| Provenance | 8 | 8 | 0 | 6 | **2** |
| **Model truth, verbs & identity** | 10 | 3 | **7** | **0** | **1** |
| Collaboration | 5 | 2 | **3** | 1 | 0 |
| **Certification & gates** | 6 | **0** | **6** | **0** | 0 |

⚠ **Two more honesty findings the fresh run printed itself:**

- **8 rows take their deciding gate from `tools/bim30-status/row-gate-registry.json`, NOT from
  their tracker cell** — *"the markdown still reads as it did"* (CO-05, CO-07, CO-10, GE-04, GE-05,
  GE-10, PV-05, PV-06). A reader of the tracker sees a different instrument from the one that
  decides the row.
- **Certification & gates remains 0 of 6 measured**, and the tool names why: CE-05's instrument is
  *"a gesture-reachability instrument — **does not exist**"*; CE-06's is *"a real user project as
  certification subject"*. **The block that grades the graders is graded by nothing.**

> The tool states its own ceiling, and it is the right one: *"This reads the deciding instrument's
> exit code and is exactly as strong as that gate. **A gate passing while measuring the wrong
> subject still passes here.**"* §4.2's blind-spot table is the necessary companion to this number.

Two blocks stand out and both are honest-but-unbuilt rather than broken:

- **Certification & gates: 0 of 6 rows measured.** The block that grades the graders is graded by
  nothing.
- **Model truth, verbs & identity: 7 of 10 CARRIED**, and **Collaboration: 3 of 5 CARRIED.**
  Collaboration is UNPROVEN *by construction* — C70 §2.2 and K-INV-3 record that no transport is
  deployed and that this is a founder decision, not an engineering task. That is a correct
  UNPROVEN, not a failure.

**⭐ The single most important number here is 27 CARRIED — 33 % of the tracker has no deciding
instrument at all.** C70 §2.2 is explicit that the right entry then is **UNPROVEN**, and that
UNPROVEN *"is neither a pass nor a fail — it is 'nobody looked', and it must read differently from
both."* A third of BIM 3.0 currently reads as progress on the strength of a declaration.

### 4.4 BIM 3.0 clause-level table (C70 …C83, the clauses this lane reached)

| contract | clause | verdict | evidence |
|---|---|---|---|
| C70 | **§0.1** no capability claimed on source-reading; BY-READ is never an award | **UNENFORCED** | The rule binds authors, not code. 27 of 82 tracker rows are CARRIED on a declaration (§4.3). Missing gate: nothing refuses a CLOSED row that names no instrument |
| C70 | **§0.2** no document may restate a measured count | **VIOLATED** | C84 §5 restates `check-verb-liveness` as *"PROVEN 7 / 326 · 109 · 210"*; HEAD reads **7 / 337 · 116 · 214** |
| C70 | **§1.2** no UI acknowledgement counts as success | UNMEASURED | not traced |
| C70 | **§1.3** removing the AI box must cost no capability except conversation | UNMEASURED | not traced |
| C70 | **§2.1** a pillar may not be scored from a neighbouring pillar | **CONFORMS** | `bim30-status.ts` grades row-by-row against a named gate; blocks are reported separately (§4.3) |
| C70 | **§2.2** unmeasured ⇒ UNPROVEN, readable as neither pass nor fail | **CONFORMS** | the instrument emits a distinct `CARRIED` kind with the note *"no deciding instrument declared"* |
| C70 | **A-INV-1** one authoritative store per kind, nameable by the composition root | UNENFORCED | `check-element-authority.ts` absent; `check-verb-liveness` proves 7 of 337 |
| C70 | **C-INV-1** every REQUIRED relationship has ≥1 writer AND ≥1 typed production reader | **VIOLATED** | `check-graph-write-coverage` **RC=3** — `hosts`, `boundedBy`, `connectedTo`, `contains` have no typed reader. **User-visible: the model records what bounds a room and nothing can ask it** |
| C70 | **C-INV-4** the declared-but-unwritten count never grows | **VIOLATED** | same gate, 4 findings **not on the ledger** |
| C70 | **E-INV-1** regenerating from a restored snapshot equals regenerating pre-save | **UNMEASURED — and unmeasurable today** | `check-deterministic-regeneration`: *"0 of the classified field paths name GEOMETRY … Closing it needs an A1→A2→A3 harness that compares BUILT GEOMETRY across a save/reload, which does not exist"* |
| C70 | **E-INV-2** one canonical predicate family under one declared epsilon policy | **VIOLATED** | `check-epsilon-policy` **RC=3, 345 vs 318 — growing** |
| C70 | **F-INV-1** every declared cascade event has ≥1 live listener AND carries `prevState` | **VIOLATED (prevState half)** | listener half CONFORMS (§4.1). `check-prevstate-contract` **RC=3** — `CurtainWallStore.ts:478` |
| C70 | **F-INV-3** host mutation re-validates hosted state | delegated | lane PROP1 / ADR-0344 — 64 cells, 39 SILENT |
| C70 | **G-INV-1** no adapter reports a solve it did not perform; a mock must announce itself | **CONFORMS** | `check-solver-is-real` **RC=0**, hard-0, with executed negative control. `engine.ts:94` `readonly kind = 'mock'` |
| C70 | **G-INV-2** every constraint family carries a declared strength + executable evidence at that strength | **CONFORMS** | `check-constraint-honesty` **RC=0**, hard-0; each family REAL at its strength with a cited test |
| C70 | **H-INV-1** no code path stamps an origin it did not observe | **VIOLATED** | `check-provenance-not-invented` **RC=3** — `from-pipeline.ts:268`, `ZoningRulesEngine.ts:181` |
| C70 | **H-INV-2** repair is legible; provenance is never invented | **CONFORMS** | `check-derived-not-authored` **RC=0**, hard-0, 5 arms watched firing |
| C70 | **I-INV-2** the persist-or-lose list is enumerated by name and shrink-only | **VIOLATED** | `check-material-id-required` ARM D — `serializePlumbing()` drops `materialId`, which C100 §2.1 declares PERSIST-OR-LOSE |
| C70 | **K-INV-3** no capacity tier described as supported while C66 §1 marks it CLAIMED | **CONFORMS (as UNPROVEN)** | Collaboration is 3 of 5 CARRIED and declared UNPROVEN by construction — the correct entry per §2.2 |
| C70 | **L-INV-1** no production API returns `[]`/`null`/`0` to mean *"I could not answer"* | **VIOLATED** | `DeleteElementCommand.ts:650` returns `success:false` + empty array for lighting/room/opening, and `BimService.ts` discards it (§2.3) |
| C70 | **L-INV-2** every gate obeys the four-exit-code contract with a declared floor | **CONFORMS** | all 21 gates run emitted 0/1/3 with declared levels; `check-solver-is-real` prints explicit floors (`manifests ≥100`, `files ≥500`, `controls ≥1`) |
| C70 | **L-INV-3** refusals speak: rule, both numbers, reaching the user verbatim | **VIOLATED** | `check-refusal-identity` **RC=3**; and §2.3 — the delete refusal reaches nobody |
| C71 | §1.3 an allowlist for a dynamic reader is not a typed reader | **VIOLATED** | `check-graph-write-coverage` names `GraphQueryService.ts:143,145,147,148` as allowlist-only |
| C72 | §2 emitters carry `prevState` | **VIOLATED** | `CurtainWallStore.ts:478` |
| C73 | §2.2/§2.3 tolerances are named, not call-site literals | **VIOLATED** | `check-epsilon-policy` 345 vs 318; e.g. `packages/geometry-handrail/src/postStations.ts:EPS`, `packages/geometry-wall/src/WallProfileBodyBuilder.ts:TOL`, `packages/geometry-window/src/WindowBuilder.ts:EPS` |
| C74 | §4.5 no real solver ships, and it is declared | **CONFORMS** | `engine.ts:85-86` states it in source; gate hard-0 |
| C75 | provenance vocabulary + coverage | **CONFORMS** | `check-provenance-coverage` **RC=0**, hard-0 |
| C77 | every read configuration key has a declaration row | **VIOLATED** | `check-secrets-register` **RC=3**, 13 vs 12; `WORKER_CONCURRENCY` read at `apps/bake-worker/Dockerfile:32` with no row; `SECRETS-REGISTER.md` in DRIFT |
| C76 · C78 · C79 · C80 · C81 · C82 · C83 | — | **UNMEASURED** | not reached by this lane (§6) |

---

## 5. Ranked — the VIOLATED clauses by user-visible risk

1. ⛔ **C99 R8 — a pipe reports `success: true` over nothing.** `CreatePlumbing.ts:39-53` accepts,
   `:55-80` writes the DTO, and **no subscriber exists** (`plumbing.created` has 0 hits in
   `initTools.ts`/`initBusHandlers.ts`). **The user draws a pipe and gets no error, no mesh, no
   plan symbol, and nothing on save.** Silence where a refusal was required.
2. **C70 C-INV-1 — four REQUIRED relationship families are write-only.** `hosts`, `boundedBy`,
   `connectedTo`, `contains` have no typed production reader (`check-graph-write-coverage` RC=3).
   **The model records what bounds a room and nothing can ask it.** This is the centre of the BIM
   3.0 claim, and GR-01/GR-05 are rows the tracker declares CLOSED.
3. **C87 CW-P-D — silent data loss on project load.** An authored curtain-wall panel (a door in a
   façade) whose bounding grid lines moved is dropped; the report naming it is built
   (`ProjectLoader.ts:1466, :1499`) and **`LoadResult.warnings` reaches no UI** — the shell reads
   `result.errors` (`PlatformVersionController.ts:423`) and four call sites discard the result.
4. **C100 §10.4 — 16 textured materials 404 in any build without `VITE_GLB_URL`.** 74 verified
   `.webp` files sit in `tools/texture-pipeline/out/dist/` and in **no served static root**.
5. **C85 W-B-2 — `joinIntent` is dropped at the bridge.** `CommandEventBridge.ts` has zero
   occurrences of the word. **The founder's mitred corner reverts to square on every bus-created
   wall**, and the serializer's own note says it cannot be reconstructed.
6. **C85 W-X-1 / C86 WO-X-1 — `wall.delete` has no hosted cascade.** `DeleteWall.ts:61` is a bare
   `delete draft[cmd.id]`. **Delete a wall; its doors and windows remain as orphaned meshes with
   orphaned records.**
7. **C98 §L-1441.6.a — a bulk edit writes what its single form refuses.**
   `UpdateElementParameterCommand.ts:892-908` **discards the element type** and checks only
   positivity. **The same ask spoken over three stairs writes a 0.1 m stair and reports success**,
   against a 0.9 m minimum.
8. **C86 WO-B-1 — four authored door/window properties silently discarded at creation.**
   `CreateWallOpeningCommand.ts:183-215`. **A fire-rated door is created as an ordinary one and the
   schedule reports blank** — a safety-relevant attribute lost with a `success` result.
9. **C98 §L-1441.3.a — a 500 mm tread is accepted** against a 360 mm declared maximum.
   `UpdateStairParametersCommand.ts:150-151` tests the minimum only; `MAX_TREAD_DEPTH` never
   appears in the file.
10. **C84 EI-4 / C70 L-INV-1 + L-INV-3 — the delete button silently refuses.** `BimService.ts:183`;
    lighting, room and bare openings. **The element stays, the selection clears, nothing is said.**
11. **C97 §5.1 — the plugin DTO store is full of blanks.** Every furniture record is
    `catalogId:''`, `origin:{0,0,0}`, `representations:{}`. **Masked** by the `§FT-FURNITURE`
    bridge, so the mesh looks right — a latent migration landmine, and **C84's stated fix would not
    surface it** (§3.4a).
12. **C98 N6 — three rival `STAIR_CONSTRAINTS`, one live in validation.**
    `stair-constraint-engine.ts:7-18` is private and inlined, reached from three commands; the
    `core-app-model` copy is **missing `MAX_TREAD_DEPTH` and `MAX_RISERS_PER_FLIGHT`**. **They agree
    today, which is a coincidence, not a property.**
13. **C100 §2.1 / C70 I-INV-2 — `serializePlumbing()` drops `materialId`.** The material is right
    until reload and wrong after. **C100 §9.7** is the different, adjacent defect: Lighting,
    Plumbing and Stair runtime records have **no `materialId` field at all** while their schemas do.
14. **C84 EI-7d / C85 W-U-2n — a promised rollback that cannot happen.** `DeleteElementCommand.ts:55`
    declares `"plumbing"`; `createSnapshot` cannot roll it back. **A failed wall delete rolls back
    everything except the plumbing it removed.**
15. **C86 WO-V-1 — the batch verbs route around the single verbs' refusals.**
    `CreateDoorBatch.ts:87` returns `{ valid: true }`. The refusal architecture is one call away
    from being bypassed.
16. **C95 §15.1 — a hosted railing's DERIVED line is authorable with no refusal.**
    `UpdateHandrailCommand.ts` has **zero** `hostId` awareness; the edit reports success.
17. **C70 E-INV-2 — `check-epsilon-policy` 345 vs 318 and GROWING.** Geometric predicates drifting
    apart under uncoordinated tolerances; the observable end of this is seams and gaps.
18. **C87 CW-U-4n — `metadata.version` ratchets forward on every curtain-wall undo.** The model
    after undo is not the model before the edit.
19. **C85 W-ID-2 — 10 of 12 `'WallPart'` meshes carry no `parentId`.** Picking and GLB export cannot
    resolve a wall sub-part to its host.
20. **C96 §4.2 EI-9 — a 3-vs-2 `affectedStores` split inside one directory**, feeding the wrong
    write-set to the lock graph.
21. **C70 H-INV-1 — provenance invented by fallback** at `from-pipeline.ts:268` and
    `ZoningRulesEngine.ts:181`. A default that presents as observed **is exported as observed**.
22. **C87 CW-Sel-1 — TAB mullion focus is build-order-dependent** (`SelectionManager.ts:2817-2828`).
23. **C85 W-S-5 — `window.wallStore` assigned from two sites** with no declared ordering.
24. **C77 — `WORKER_CONCURRENCY` is unowned config**; `SECRETS-REGISTER.md` in drift.
25. **C86 WO-B-2 — two defaults for one field, twice** (`0.9` vs `1.0`).

---

## 6. What this lane did NOT reach — the honest register

Recorded per C70 §0.2 and EI-1b: silence must never be read as coverage.

- **C76, C78, C79, C80, C81, C82, C83 — entirely UNMEASURED.** Seven of the fourteen BIM 3.0
  contracts were not opened. The block's *completion* was measured via C70's pillars and the
  `bim30-status` instrument; its *clauses* were not.
- **C71, C72, C73, C74, C75, C77** were measured **only through their gates**, not clause by clause.
  A gate is evidence for the clause it implements and for no other.
- **`check-propagation-trackers-reach`** (PR-09's deciding gate) was **not run directly** by this
  lane; its exit 1 in §4.3 comes from the `bim30-status` run, not from a separate invocation.
- **The `bim30-status` re-run regenerated `tools/bim30-status/results/latest.json`** (and, as a
  side-effect of its certification gates, `tools/rac-conformance/certification/results/graphruntime.json`
  and `two-client-convergence.json`). These are **generated measurement artefacts, not source**;
  replacing a 766-commit-stale reading with a HEAD reading is the point of the tool. Recorded here
  so the diff is not mistaken for hand-editing.
- **EI-PROP / F-INV-3** were deliberately not re-measured — lane PROP1 owns them (ADR-0344).
- **C84 EI-1a, EI-1b, EI-3, EI-8** — not traced.
- **The RAC sections of C85 and C86**, and roughly **30 geometry clauses of C86 §10.1–§10.4**
  (opening profile PR-1…PR-9, elevation WO-G-9…WO-G-15, tessellation seam, instance slots) —
  these need a running builder; source-reading cannot falsify a 71 mm corner gap.
- **No control was executed for `check-hosted-dual-write`'s three UNPAIRED files.** WO-B-3's
  *"⛔ control first, watched RED"* remains unexecuted.
- **Cross-machine determinism (C73 §5.4b) and GPU-side geometry (§5.4c)** are UNPROVEN and cannot be
  closed on this machine.

---

## 7. The five gates worth building next, in order

Each is named because a clause above is currently a review judgement:

1. **`check-persistence-twin-authority.ts`** — §1. One root cause, two opposite failures already
   realised, zero detection.
2. **`check-affected-stores.ts`** — C84 EI-7d. C84 calls it *"the highest value single check"*; it
   generalises one existing test from 1 command to ~190, and it would have caught #8 above.
3. **`check-bridge-field-coverage.ts`** — C84 EI-2, *"the load-bearing one"*. It would have caught
   #2 and #4 above, which are ranked 2nd and 4th by user-visible risk.
4. **`check-delete-symmetry.ts`** — C84 EI-4/EI-5. Would have caught #3 and #5.
5. **A CARRIED-row refusal in `bim30-status`** — a row may not read CLOSED while naming no deciding
   instrument, and may not read CLOSED while its instrument exits non-zero. That single rule
   converts 5 false greens and 27 declarations into honest UNPROVENs.

**Build them the way `check-solver-is-real` is built**: with a planted negative control, watched
firing, printed on every run. C70 §0.1 requires it, and it is the only thing separating the gates
above that are worth their exit code from the ones that are not.
