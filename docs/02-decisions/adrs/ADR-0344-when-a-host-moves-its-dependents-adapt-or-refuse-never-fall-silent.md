# ADR-0344 — When a host moves, every dependent either ADAPTS or REFUSES BY NAME. Silence is a defect, not a default

- **Status:** Accepted
- **Date:** 2026-08-21
- **Lane:** PROP1
- **Supersedes:** nothing. **Amends in place:** `C72` (§9, new), `C84` (§EI-PROP, new),
  `C88`/`C89` (the finish-follow section of each).
  **Adds:** `tools/rac-conformance/certification/gates/check-dependent-adapts-on-host-move.ts`
  + `host-move-propagation-matrix.json`; `apps/editor/src/engine/finishLateAttribution.ts`;
  `apps/editor/src/engine/__tests__/finishFollowsWallWithNoRecordedRelationship.spec.ts`.
- **Commits:** `b5b276b7` (the fix), `e2a615c1` (the gate)
- **Contracts:** C70 (BIM 3.0 target — L-INV / F-INV), C71 (graph & topology), **C72
  (propagation & prevState — the governing contract)**, C73 (determinism & tolerance),
  C74 (constraint honesty — *an honest refusal is an answer*), C78 §1.4
  (`NO-EMPTY-MEANS-UNKNOWN`), C79 (region semantics §5 — the five recompute states),
  C81 (intent preservation — a cascade is ONE undo), C83 (spatial validity),
  C84 + C85–C99 (element integrity and the per-element block), P1/P6/P8.
- **Issue-log:** L-2090 … L-2093.

---

## 1 · Context — the founder moved one wall, and four things happened

> "Check this bug — as per the concept of **BIM 3.0** check **all contracts from C70 to C83**.
> **Elements should propagate when one moves — all contexts.** Please **audit all elements against
> this principle** — and **document, review, plan and fix** whatever is needed. In this case:
> ground level — **the floor finish did not adapt to the change**."

He moved `wall_01M0D7Z3SGD4FGPGRNZH12K6PG` (`WA-00-006`, Ground, 19.444 m). His console, verbatim:

```
[CommandManager] EXECUTE: UPDATE_WALL_BASELINE
[CommandManager] EXECUTE: CASCADE_WALL_BASELINE
[CascadeWallBaselineCommand] §HOSTED-OPENING-HOST-MOVE re-seated window 83990963… 5.984 → 5.987 m
   … ×5 windows, all re-seated
[WallMoveReweldService] §MOVE-REWELD-EMPTY-PLAN … 0 re-weld entries and 0 refusals
[UpdateWallBaselineCommand] §GR12-BOUNDARY-INVALIDATION — room(s) 20ce37c3… invalidated
[CommandManager] EXECUTE: REDETECT_ROOMS → Detected 1 room(s) on level 'L0'
[RoomTagAutoPopulator] … 1 refreshed
```

Hosted openings ✅ · room boundaries ✅ · room tags ✅ · wall re-weld ✅ (considered, correctly a
no-op, and it **said so**). **The floor finish: not one line.** The beige slab stayed on the old
footprint and nothing in the product acknowledged that it had.

**That absence is the whole ADR.** The floor did not refuse. It did not report a conflict. It did
not say the relationship was unrecorded. Nothing happened, and nothing was said.

## 2 · The root cause, measured — and it is a data defect, not a missing feature

`FinishHostDependencyTracker` exists, is constructed in production (`initTools.ts`), subscribes to
the real `WallStore`, re-projects through the real `reprojectFinishBoundary`, and writes back
through `UpdateFloorBoundaryCommand`. All of it works. It indexes by
`sketch.outerLoop` **host-reference edges**, and there are **three floor-creation paths in this
tree, of which exactly one mints them**:

| path | mints `sketch` host references? |
|---|---|
| `packages/command-registry/src/floors/CreateFloorCommand.ts` (`_buildBoundarySketch`) | **YES** |
| `plugins/floor/src/handlers/CreateFloor.ts` (bus verb `floor.create`) | **NO** — `boundingWallIds: []`, no `sketch` key at all |
| `apps/editor/src/engine/initTools.ts` §P3.2-FL bus→legacy mirror | **NO** — same, and this is the record that reaches the store the tracker watches |

A finish created by either of the last two is **structurally incapable of following a wall**. And
`onWallUpdated` handled that case like this:

```ts
const dependents = this.graph.get(wall.id);
if (!dependents || dependents.size === 0) return;      // ← no log, no verdict, nothing
```

So **two entirely different facts arrived at the user as the same value**:

- *"this wall bounds no finish"* — nothing to do, correct; and
- *"every finish this wall bounds was created by a path that records no relationship"* — a defect.

That is `NO-EMPTY-MEANS-UNKNOWN` (C78 §1.4), the failure-as-emptiness shape this repository has
now measured in envelope data, context data, GetCapabilities inventories and store reads. **This
is the same defect in the propagation layer**, and the audit below shows it is not one cell — it
is the dominant shape across the whole matrix.

## 3 · Decision — the three-verdict rule

> **§1 — MUST.** When a host element moves, every dependent family with a relationship to it
> reaches exactly one of two terminal states, and the product can say which:
>
> - **PROPAGATES** — the dependent is adapted, through a **command** (P6), composed into the
>   spawning gesture as a `STRUCTURAL_CASCADE` child so the user pays **ONE undo** (C81 /
>   ADR-0121).
> - **REFUSES** — the dependent is **not** adapted, and the product says so **by name**, with a
>   reason from a closed vocabulary and, where geometry is involved, **both numbers** (C74,
>   C79 §5.2.2). *An honest refusal is a correct answer.* A stranded beam that announces itself
>   stranded is a shipped, honest product; a stranded beam nobody mentions is a data-loss bug the
>   user finds three weeks later in a schedule.
>
> **§2 — MUST NOT.** **SILENT** — neither adapting nor refusing — is not a permitted third state.
> An early `return` on an empty dependent set, a `if (x) { … }` with no `else`, a fail-open
> classification delivered to a consumer that drops it: each of these makes "nothing to do" and
> "never wired" indistinguishable, and is a **finding**.
>
> **§3 — MUST.** *Reducing a cell from SILENT to REFUSES is a legitimate and often the correct
> fix.* Narrowing a claim to the truth is a fix; leaving it silent is not. A lane that cannot
> build the adaptation can still close the defect by building the refusal.
>
> **§4 — MUST.** The matrix is a **ledger a gate reads**, never prose. See §6.

### 3.1 · Why "propagate everything" was rejected as the decision

The founder's words are *"elements should propagate when one moves"*, and the tempting reading is
"wire every cell". That was rejected, for a measured reason and a design reason.

**Measured:** several SILENT cells have **no relationship to propagate along**.
`FurnitureData` carries no `wallId`, no `hostId` and no `roomId`. `PlumbingFixtureData` carries no
host field either. `CurtainWallTypes` declares no host-wall field. Wiring a subscriber to those is
not a small task — it is a schema change, a migration, a persistence round-trip, an IFC mapping
and a UI affordance per family. Promising it in one lane would be the authored-but-unwired hazard
one level up.

**Design:** some cells *should* refuse. A column whose supporting slab moves 3 m sideways should
not silently teleport — C83's `IMPOSSIBLE / INADVISABLE / FINE` split and the founder's own
standing direction (*"always ASK, never auto-edit"*) say the product asks. **REFUSES is therefore
not a consolation prize; for a whole class of cells it is the target state.**

## 4 · The audit — 64 cells, measured at HEAD 2026-08-21

Verdicts are as defined in §3. Every cell was read in source; nothing here is inferred. The
machine-readable form, with the evidence markers a gate checks, is
`tools/rac-conformance/certification/gates/host-move-propagation-matrix.json`.

**Reading: 19 PROPAGATES · 6 REFUSES · 39 SILENT.**

| dependent ↓ / host → | **wall** | **slab** | **level** | **room boundary** | **stair** |
|---|---|---|---|---|---|
| **floor finish** | ✅ **PROPAGATES** | ⛔ SILENT | ⛔ SILENT | (via room re-detect) | — |
| **ceiling finish** | ✅ **PROPAGATES** | ⛔ SILENT | ⛔ SILENT | ⛔ SILENT | — |
| **slab** | ✅ **PROPAGATES** ×2 | ⛔ SILENT | ✅ **PROPAGATES** | ⛔ SILENT | ✅ **PROPAGATES** (void only) |
| **wall** | — | — | ✅ **PROPAGATES** | — | — |
| **roof** | ✅ **PROPAGATES** | ⛔ SILENT | 🟡 **REFUSES** (toast) | ⛔ SILENT | ⛔ SILENT |
| **room** | ✅ **PROPAGATES** | ✅ PROPAGATES (untested) | ⛔ SILENT | ✅ PROPAGATES (untested) | — |
| **room tag** | ⛔ SILENT (position) | — | ⛔ SILENT | ⛔ SILENT (position) | — |
| **hosted opening (door/window)** | ✅ **PROPAGATES** | ✅ PROPAGATES (base-offset term only) | ✅ **PROPAGATES** | ⛔ SILENT | — |
| **standalone opening** | ✅ **PROPAGATES** | — | ⛔ SILENT | — | ✅ **PROPAGATES** |
| **stair railing** | ⛔ SILENT | — | (host stair refuses) | — | ✅ **PROPAGATES** |
| **handrail** | ⛔ SILENT | ⛔ SILENT | ⛔ SILENT | — | ⛔ **SILENT — authored, unwired** |
| **stair** | ⛔ SILENT | ⛔ SILENT | 🟡 **REFUSES** | — | — |
| **beam** | ⛔ SILENT | ⛔ SILENT | 🟡 **REFUSES** | — | ⛔ SILENT |
| **column** | ⛔ SILENT | ⛔ SILENT | 🟡 **REFUSES** | — | ⛔ SILENT |
| **curtain wall / panel** | ⛔ SILENT | ⛔ SILENT | 🟡 **REFUSES** | — | ⛔ SILENT |
| **furniture** | ⛔ SILENT | ⛔ SILENT | 🟡 **REFUSES** | ⛔ SILENT | — |
| **lighting** | ⛔ SILENT | — | ⛔ SILENT | ⛔ SILENT | — |
| **plumbing** | ⛔ SILENT | — | ⛔ SILENT | — | — |
| **annotation / dimension** | ✅ **PROPAGATES** | ⛔ SILENT | ⛔ SILENT | ⛔ SILENT | — |

### 4.1 · The evidence behind the ✅ cells

- **floor / ceiling finish × wall** — `FinishHostDependencyTracker.ts:200` (`wallStore.subscribe`
  with the §STEP7 `prevState` third argument), re-projection at `:333`, verdict reporting at
  `:346` across C79 §5's five states, write-back at `:451` through
  `Update{Floor,Ceiling}BoundaryCommand` with `{ source: 'STRUCTURAL_CASCADE' }`. Constructed
  `initTools.ts` (both trackers, both bootstrapped). **Closed by this lane for the unattributed
  case — see §5.**
- **slab × wall** — two live paths. `SlabDependencyTracker.ts:130` re-resolves the region sketch;
  `SlabWallConnectivityService.ts:998` → `:1204` dispatches `CascadeWallBaselineCommand` as a
  `STRUCTURAL_CASCADE`. Refusal vocabulary is real and reaches chat:
  `WELD_COLLAPSES_PARTNER`, `WELD_REFUSED_BY_CASCADE`, `WELD_FAILED`, `SLAB_WELD_UNDETERMINED`.
- **slab / wall × level** — `initWallLevelSubscribers.ts:47` `registerLevelRebuildCallback`;
  walls rebuilt per delivered id (`:50-59`), slabs per level query (`:60-61`). These are the
  **only two kinds** the reconcile reaches.
- **roof × wall** — `RoofDependencyTracker.ts:269` → `recomputeForWall` at `:325`, writing
  `UpdateRoofBoundaryCommand` at `:375`.
- **room × wall** — `RoomTopologyObserver.ts:363` schedules a debounced re-detect;
  `UpdateWallBaselineCommand.ts:481` invalidates the boundary conclusions in the same gesture, so
  a stale ring is never read as current.
- **hosted opening × wall** — `DoorDependencyTracker.ts:82` / `WindowDependencyTracker.ts:49`,
  covering baseline, **height** and **thickness**; the executed gate
  `check-propagation-trackers-reach` drives all three branches with four negative controls. This
  is the best-wired pair in the product and the reference implementation.
- **hosted opening × slab** — the **base-offset term only**
  (`DoorDependencyTracker.ts:145 onWallBaseYChanged`); a slab **polygon** change reaches no
  opening.
- **standalone opening × wall / × stair** — `UpdateWallBaselineCommand.ts:327` `planOpeningRefit`;
  `CascadeWallBaselineCommand.ts:568`; `MoveStairCommand.ts:137` `cascadeStairVoids`, undone in
  the same `undo()` at `:160`.
- **stair railing × stair** — `StairRailingBuilder.ts:117/:125` on `bim-stair-updated`; the rail
  path is re-sampled from the host, so no record write-back is needed and none happens.
- **annotation / dimension × wall** — `AnnotationDependencyGraph.ts:77` subscribes to
  `StoreEventBus` and re-resolves every wall reference on flush. `WallStore.ts:1785` is the **only
  emitter in the estate that forwards `prevState`** onto that bus.

### 4.2 · The 🟡 REFUSES cells — and why they are the model, not the shortfall

All six live at one seam, `SpatialAuthority.classifyForReconcile`, and they refuse with a named
reason and a per-level aggregate line:

> `"${kind}" has no reconcile consumer — the level-rebuild callback rebuilds Wall (per delivered
> id) and Slab (per level query) only. A "${kind}" on a re-elevated level keeps its old elevation
> until a per-kind rebuild entry point exists (C72 §5.1, gap register PR-07).`

The roof goes further and is **the best-behaved cell in the entire matrix**, because its refusal
reaches the **user**, not the console (`roofWallClashAnnouncer.ts:194`):

> `Level "${levelId}" moved ${sign}${delta} m but roof "${r.id}" did not follow … Rebuild the roof
> or adjust its base offset. (PR-10)`

**Every ⛔ cell in this matrix should be brought to at least this standard before it is brought to
✅.** That is §3's rule and it is the cheapest correct move available for most of them.

### 4.3 · The ⛔ cells, grouped by WHY — the grouping is the plan

1. **The relationship cannot be expressed at all** (schema gap). `FurnitureData` has no host
   field; `PlumbingFixtureData` has none; `CurtainWallTypes` declares no host wall;
   `HandrailData.hostKind` is `'stair' | 'slab'` and cannot be `'wall'`. **Nothing can propagate
   along an edge the data model cannot hold.** Fixing these is a schema + migration + IFC +
   round-trip change per family.
2. **The relationship exists and NOTHING READS IT** — C70 §4.2, machinery present / capability
   unreachable. `BeamData.startSupportId` / `startSupportType: 'wall'` is written by
   `AssignBeamSupportsCommand` and read by the AI read-model and the rule engine. **No mover reads
   it.** `LightingData.hostId` has one writer and one loader-reader, and no placement path sets
   it.
3. **AUTHORED-BUT-UNWIRED** — the clearest case in the repo is **handrail × stair**.
   `plugins/cross/src/stair-handrail.ts:99 buildStairHandrailCascadeRule` is fully written and
   synthesises `handrail.recompute` on `stair.move`. Its only caller is `registerCrossHandlers`,
   which has **zero production callers**, and `new CascadeRunner()` appears **only in test files**
   repo-wide (C72 §2.5 records this). `MoveStairCommand.affectedStores` does not name `handrail`.
   Deleting a stair *does* orphan-clean its handrails; **moving one does nothing.**
4. **A handler exists and early-returns with no log** — ⭐ **the most dangerous shape here,
   because it reads as handled.** `lighting`, `plumbing`, `ceiling`, `floor` and
   `standalone opening` ids are all *delivered* to the level-rebuild callback (they classify
   `UNDETERMINED` and fail open), and are then dropped at
   `initWallLevelSubscribers.ts:51-52`:
   ```ts
   const wall = store.getById(id);
   if (wall) { … }          // no else. no log.
   ```
   `window.openingStore` is populated and reachable — it simply is not probed.
5. **Partial adaptation misread as adaptation** — **room tag**. `populate()` *is* reached on a
   wall move, and the refresh writes **only `parameters`** (`RoomTagAutoPopulator.ts:115-131`), so
   the label and the area update while the **anchor strands at the old centroid**. The tag is
   bound to a baked point reference (`:171 makePointRef`) and
   `AnnotationDependencyGraph.ts:150` explicitly skips point refs — it is not in the
   associativity index at all. **A cell that updates its text and not its position is classified
   SILENT here, deliberately: the thing the user is looking at did not adapt.**
6. **No graph edge is ever minted** — the `SemanticGraph`'s closed union has 26 kinds; **13 have
   zero production writers**. `boundedBy` has exactly two writers, both room detection.
   Annotations, dimensions, room tags, ceilings and floors have **no creating
   `addRelationship` call anywhere** — the only mentions are undo-restores. So even a working
   generic cascade could not reach them: there is nothing to walk.

### 4.4 · Three cross-cutting findings the matrix surfaced

- **There is no registry mapping element kind → cascade handler.** Every family is hand-wired:
  five trackers in `initTools.ts`, two in `initBuilders.ts`, plus `RoomFinishSyncService` —
  **eight**, each with a bespoke subscription surface, none discoverable from a kind. That is why
  a new family's absence is invisible: nothing enumerates what *should* be there. `RoofDependency
  Tracker.ts:40-45` states this in its own header.
- **The one surviving generic channel routes ONE relationship pair.**
  `initDependencyCascade.ts:59` handles `sitsOn` / `supports` and drops priorities 2–5 on the
  floor *by design* (the bespoke trackers own them, and double-routing would double-rebuild —
  C72 §2.4). Correct, and worth stating plainly: **the generic cascade is not a fallback for any
  cell in this matrix.**
- **P6 / one-undo is not uniform across the ✅ cells.** `STRUCTURAL_CASCADE` has exactly three
  production sites: `FinishHostDependencyTracker`, `SlabWallConnectivityService`,
  `WallMoveReweldService`. **`SlabDependencyTracker` writes DIRECTLY to the store** (not a
  command — a P6 breach), and **`RoofDependencyTracker` dispatches its command with no `source`
  metadata**, so a roof following a wall costs the user a **second undo**. Both are logged
  (L-2093) and deferred, not fixed here.

## 5 · What this lane FIXED

**§FINISH-FOLLOW-LATE-ATTRIBUTION (L-2090), commit `b5b276b7`.** Two halves, because either alone
would have been theatre:

- **Honesty.** `registerRecord` now *counts* the finishes it can attribute to nothing (a second
  index, maintained by the identical lifecycle, so it cannot drift from the dependency graph), and
  **every exit from the wall-move path prints**: `RELATIONSHIP_NOT_RECORDED` when nothing can be
  done, `STALE_DERIVED_STATE` on a missing `prevState`, or
  *"checked N unattributed floor(s) on level L — none is bounded by it"* when it looked and found
  nothing. **There is no silent exit left in that method.**
- **Repair.** An injected `attributeLate` hook re-attributes an unattributed finish against the
  **one wall that moved**, in its **pre-move** state, then re-projects through the existing
  `reprojectFinishBoundary` and writes back through `UpdateFloorBoundaryCommand` as a
  `STRUCTURAL_CASCADE` child. **It repairs records already on disk**, which no creation-path fix
  can do — and the founder's project is full of them.

**Why this is not the proximity search C79 §2.2 forbids.** §2.2's own distinction is not *whether
geometry is consulted* but whether the **candidate set is closed by construction**. Here it is a
**singleton** — the wall the user just moved — so the question is not the forbidden *"which wall
bounds this edge?"* (whose wrong answer is §2.3's wrong host) but *"did THIS wall bound this
edge?"*. `ambiguous` is unreachable: `_attributeEdge` can only report it when two **different**
candidates satisfy one edge. Two finishes on opposite faces of the same wall both matching is the
**correct** answer, not a collision. The pass is scoped to the moved wall's storey, and an
UNKNOWN storey on either side declines rather than guesses.

**Why the attribution lives at the composition root.** It runs
`buildRoomFinishBoundarySketch` — the **same builder creation uses** (C79 §7.4: no per-path
divergence). `finish-host-tracker` depends on two packages by design, so the dependency is
**inverted** (the tracker declares a hook, `initTools.ts` fills it) rather than duplicated. It is
an extracted module, not a closure in `initTools.ts`, for the measured reason
`beamCreatedMirror.ts` was extracted: a closure there is unreachable from every suite.

**Executed:** 6 specs, **4 of them negative controls** — no hook → 22.04 m² *and a printed report*
(both halves watched); a non-bounding same-storey wall → nothing attributed and *said so*; another
storey → nothing; an already-attributed record → never re-attributed, with the bare twin proving
the null is the guard and not a broken fixture.

## 6 · The gate — because a matrix in prose decays

`tools/rac-conformance/certification/gates/check-dependent-adapts-on-host-move.ts`, ledger
`host-move-propagation-matrix.json`, registered in `run-all.ts` and `gate-newly-measured.json`.
**First reading: exit 1 DECLARED-LEVEL — 64 cells, 19/6/39, 259 production files read.**

This repository's own history is the argument for it: C72 §5.1 asserted `RECONCILABLE_TYPES` had
"zero consumers" **after it acquired one**, and the BIM30 roadmap still says so at two line
numbers. The ADR you are reading will rot the same way. The ledger will not, because:

- **ARM A (hard-0)** — every PROPAGATES cell's wiring evidence must still resolve. Delete a
  tracker, comment out a `subscribe`, remove a composition-root construction: the cell has
  **REGRESSED TO SILENT** and the gate says so **in the commit that does it**. This is the arm
  that earns the gate its keep — `finishHostTrackerWiring.spec.ts` §FACT-4 records, measured, that
  deleting the finish-tracker wiring block would turn **nothing** in this estate red.
- **ARM B (hard-0)** — every REFUSES cell's refusal string must still exist. **Deleting a refusal
  is a regression wearing the appearance of a cleanup.**
- **ARM C (ratchet, named, both directions)** — every SILENT cell is a finding; a SILENT cell
  whose probe says the defect is **gone** is STALE and exits 3. Debt that has been paid leaves the
  ledger in the commit that pays it.

**Negative control, executed before the ledger was trusted** (C74 §6.2): the `floor finish × wall`
marker was replaced with a symbol that does not exist → **RC=3, `REGRESSED-TO-SILENT`, 40 vs 39**;
restored → RC=1 at 39. ARM A discriminates; it is not reading its own ledger back to itself.

> ⚠ The ledger's own header was hand-typed as *"52 cells / 27 SILENT"* and **the gate caught it on
> the first run** (64 / 39). Recorded in the ledger rather than quietly corrected: *"the prose
> number was transcribed instead of counted"* is this repository's most-logged defect shape, and it
> happened **inside the artefact built to stop it**.

## 7 · What was DEFERRED, and why

| deferred | why | owner |
|---|---|---|
| The two floor-creation paths that mint no `sketch` (L-2091) | `plugins/floor`'s handler has no wall or room store in its `HandlerContext`; giving it one is a composition change. The §P3.2-FL mirror in `initTools.ts` *can* be fixed cheaply and should be — but the late attribution repairs the symptom for existing AND new records, so this is a correctness-of-record fix (schedules, IFC, `boundingWallIds`), not a follow fix. | next finish lane |
| Every schema-gap cell — furniture, plumbing, curtain wall, handrail×wall (L-2093 group 1) | A host field per family is a schema + migration + persistence + IFC + UI change. Four families in one lane would be the authored-but-unwired hazard one level up. | per-element lanes, C97/C99/C87/C95 |
| handrail × stair (L-2093 group 3) | The rule is written. What is missing is a **production `CascadeRunner`**, which C72 §2.5 escalates as a **composition-root (P1) decision, founder-visible, not a task a handler lane may absorb**. | founder decision |
| The five fail-open drops at `initWallLevelSubscribers.ts:52` (L-2093 group 4) | ⭐ **This is the cheapest high-value fix left in the matrix**: add the missing stores to `SpatialAuthority`'s probe list so they classify `DETERMINED-STRANDED` and inherit the existing named refusal. Five SILENT cells → five REFUSES cells for roughly the cost of five lines. Deferred only because `initWallLevelSubscribers.ts` is being edited by another lane today. | next propagation lane |
| Room-tag anchor stranding (L-2093 group 5) | Needs the tag to carry a room reference rather than a baked point, plus a resolver branch for it. Touches the annotation associativity index. | annotation lane |
| `SlabDependencyTracker`'s direct store write (P6) and `RoofDependencyTracker`'s missing `STRUCTURAL_CASCADE` (two undos) | Both are in other lanes' files today. | slab / roof lanes |

## 8 · Consequences

- **C72 gains §9** (this matrix, by reference to the gate) and its §5.1 stale claim is corrected
  in place: `RECONCILABLE_TYPES` **has** a consumer (`isReconcilable` ← `classifyForReconcile` ←
  the reconcile listener) and is now narrowed to `['Wall', 'Slab']`. The *behavioural* half of
  §5.1 — only walls and slabs re-elevate — remains **true**.
- **C84 gains §EI-PROP**: a PR that adds or changes an element family must state that family's
  row in this matrix. A new family that arrives SILENT arrives as a declared finding, not as
  silence.
- **C88 / C89** record the late-attribution repair and its standing limit.
- **The exit condition is not "everything propagates".** It is: **every cell is PROPAGATES or
  REFUSES.** `declaredSilent` reaching `[]` is the measure, and a cell closed by building an
  honest refusal counts fully.

## 9 · What remains UNPROVEN

- Arm A is **presence of wiring, never behaviour** (C72 §6.1.2(b)). A tracker whose `subscribe` is
  intact and whose write-back is commented out passes it.
- **Three ✅ cells have no test at all**: `room × slab` and `room × room boundary` are wired and
  undriven, and **zero test files anywhere reference `AnnotationDependencyGraph`** — the
  dimension *resolver* is pinned, the *subscription* is not.
- Nothing here measures propagation under **collaboration merge**, across a **save/reload**, or
  through **undo/redo** beyond the single one-undo assertion in the new spec.
- Whether a SILENT cell **should** propagate is a design question per family (§3.1). The matrix
  records what the tree does; C83 and the founder's *"always ASK"* direction decide what it ought
  to do.
