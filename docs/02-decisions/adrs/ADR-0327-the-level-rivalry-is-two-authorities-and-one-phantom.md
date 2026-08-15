# ADR-0327 — The level rivalry is TWO authorities and one phantom; MT-07's census counted three kinds of thing as one

- **Status**: ACCEPTED for the phantom half · **ESCALATED to the founder for the substrate half**
- **Date**: 2026-08-15
- **Records, does not make, the decision**: the founder decided on **2026-08-14** that
  **`hierarchyStore` + `parentId` is the SOLE hierarchy substrate**. That decision is transcribed
  in [ADR-0325](ADR-0325-hierarchy-store-is-the-sole-hierarchy-substrate.md), which applied it to
  one question — *are hierarchy nodes graph citizens?* — and answered no. **This ADR applies the
  same decision to the other question the register's MT-07 row actually asks: which STORE owns
  levels.** The two are not the same question, and MT-07 stayed open because only the first was
  written down.
- **Evidence**: a source census at HEAD `da855d83` (lane C6), reported inline below. Every count
  in this ADR is a measured file/call-site count, not an estimate.
- **Constrains**: `packages/core-app-model/src/hierarchy/HierarchyStore.ts` ·
  `packages/core-app-model/src/BimKernel.ts` · `packages/stores/src/LevelStore.ts` ·
  `plugins/plan-view/src/LevelStore.ts` · `src/global-window.d.ts`
- **Subordinate to**: ADR-0325 (the substrate decision) and §WALL-AUDIT-2026-M3 (*"Levels are
  owned exclusively by BimKernel"*) — **which this ADR shows are in unresolved conflict.**

## Context — the row undercounts itself, but not in the way the recount thought

`BIM30-MASTER-COMPLETION-TRACKER.md` MT-07 reads *"three rival level records"*. A 2026-08-15
recount amended it to *"⚠ **FOUR** rivals, not three — `plugins/plan-view/src/LevelStore.ts` is a
fourth the row never counted."*

**Measurement refutes the recount and the row alike.** They are both counting *files whose name
contains "Level"*, and those files are three different KINDS of object. Sorted by what they
actually hold:

| Candidate | Holds | Prod importers | Persists? | Membership authority? |
|---|---|---|---|---|
| `core-app-model/src/hierarchy/HierarchyStore.ts` | `parentId` graph over site/building/level/unit | **12** (read in **27** files) | **YES** | **YES** |
| `core-app-model/src/BimKernel.ts` (`bimManager`) | `Level.childrenIds[]` + `getLevelForElement()` | singleton, ~41 files touch its level API | **YES** | **YES** |
| `packages/stores/src/LevelStore.ts` | `Map<LevelId, Level>` — entities only | 11 (9 type-only) | **NO** | No — entity store |
| `plugins/plan-view/src/LevelStore.ts` | `{id,name,elevation,isActive}` — which level the viewport shows | 3 (2 re-exports) | **NO** (`ephemeral = true`) | No — view state |
| **`window.levelStore`** | **nothing — never assigned** | **6 read sites / 4 files** | n/a | **PHANTOM** |

Three findings follow, and only the third is actionable today.

**1 — The genuine rivalry is TWO, not three or four, and both halves are load-bearing.**
Only `hierarchyStore` and `BimKernel` hold an element→parent/level *membership* map, and **both
are serialized into the snapshot** — `ProjectSerializer.ts:792` writes `hierarchyStore.serialize()`,
and `ProjectSerializer.ts:685` writes `wallStore.getLevels()`, which
`geometry-wall/src/WallStore.ts:272–284` proves is a pure proxy over `this._bim.getLevels()`
carrying `childrenIds` through. The codebase already *acknowledges* the split rather than
resolving it: `HierarchyTypes.ts:119` documents `LevelData.bimLevelId` as
*"bridges to the BimManager level system"* — a declared foreign key between two records of one
fact. This is the MT-06 / L-916 shape exactly, and it is on the persisted path.

**2 — The recount's "fourth rival" is refuted in kind, not in existence.**
`plugins/plan-view/src/LevelStore.ts` exists, but it is `static readonly ephemeral = true`, is not
serialized, holds no element→level mapping of any sort, and **is never constructed in production**
— `new PlanViewCanvasHost(...)` occurs only in two test files. It is view state. Counting it as a
hierarchy rival inflates the row. Likewise `packages/stores/src/LevelStore.ts` is a level *entity*
store whose referential checks (`roomCreate.ts:50`, `apartmentCreate.ts:48`) read it to validate a
`levelId` field — the membership lives on the element aggregate, not in the store. Its own
aggregate-command surface (`levelCreate` / `levelSetActive` / `levelDelete` / `levelUpdate`) has
**zero production callers**; it is reachable only from `index.ts` re-exports and four test files.

**3 — There is a FIFTH level authority nobody counted, and it is empty.**
`src/global-window.d.ts:93` declares `levelStore?: any` on the window. **Nothing in production
ever assigns it.** The sole assignment in the repository is
`apps/editor/__tests__/annotationPlanToolCommit.test.ts:109`. Six production sites read it:

| Site | Consequence in production |
|---|---|
| `AnnotationPlanToolHandlers.ts:323` `_levelForView` | guard `if (!levelStore?.getAll) return null` — **always returns null**; annotation plan views never resolve a level name or elevation |
| `RoomGraphPanel.ts:246` (panel title) | `getById` never fires — title renders the raw `levelId` instead of the level name |
| `RoomGraphPanel.ts:487` (level dropdown) | same — the picker lists raw ids instead of names |
| `RoomGraphPanel.ts:96` `_resolveActiveLevel` | `window.levelStore ?? window.bimManager?.levelStore`; **neither exists** (`bimManager` has no `levelStore` property) — survives only on the `rooms[0]?.levelId` fallback |
| `StairPlanToolHandler.ts:273`, `StairPathPlanToolHandler.ts:255` | phantom sits behind a working `wallStore.getLevels()` primary, then `?? []` — masked, but the `[]` is "no store" and "no levels" as one value |

The test at `annotationPlanToolCommit.test.ts:109` **stubs the phantom**, so a suite passes green
over a branch that cannot execute in production. That is the defect that hides the defect.

## Decision

1. **The substrate decision stands as ADR-0325 states it:** `hierarchyStore` + `parentId` is the
   sole hierarchy substrate.
2. **`window.levelStore` is deleted** — the declaration and all six reads. Its readers migrate to
   the live authority `window.bimManager` (assigned in production at
   `apps/editor/src/engine/initScene.ts:757`), whose `getLevels(): Level[]` and
   `getLevelById(id)` return the `{id, name, elevation, …}` shape every one of these call sites
   already expects. This is a **phantom, not a rival**: it has zero writers, so no behaviour can
   depend on its contents, and migrating its readers can only turn dead paths live.
3. **`plugins/plan-view/src/LevelStore.ts` and `packages/stores/src/LevelStore.ts` are NOT
   deleted, and are struck from MT-07's rival list** — as view state and as an entity store
   respectively, neither is a hierarchy authority. MT-07 should count rivals by *what they hold*,
   not by filename.
4. **`BimKernel`'s level ownership is ESCALATED, not resolved.** See below.

## The escalation — this is a founder decision, and it has not been made

MT-07 asks for the losers to be deleted. **`BimKernel` cannot be deleted, and the 2026-08-14
decision does not authorize it.** Measured, its level API is consumed by the level-scoped culling
service (`LevelScoped3DCullingService.ts:624`, `initScene.ts:945` binds
`getLevelForElement` as the level resolver), IFC import (`IfcLevelImporter`,
`IfcStoreyLevelMapper`, `IfcConversionCoordinator`), wall and opening creation, the AI read model,
undo snapshots (`CommandManagerImpl.ts:508`), and the persisted snapshot itself.

**Two standing declarations conflict, and neither was written knowing about the other:**

- **§WALL-AUDIT-2026-M3** — *"Levels are owned exclusively by BimKernel"*
  (`geometry-wall/src/WallStore.ts:269`; `AddLevelCommand.ts:58`).
- **ADR-0325 / the 2026-08-14 founder decision** — `hierarchyStore` + `parentId` is the sole
  hierarchy substrate, and `hierarchyStore.getLevels()` returns level nodes.

Both are live in the codebase today. The founder decision was made about **graph citizenship**;
there is no evidence it was made about **BimKernel**, which is not named in ADR-0325. Choosing
between them is a migration of a persisted, snapshot-bearing membership map across ~41 call
sites including the render cull path — **and a wrong guess desyncs level membership the way L-916
desynced a window frame from its wall void.** Per the standing instruction that a rival which
turns out load-bearing in a way the decision did not anticipate is *"a finding for the founder,
not something to force"*, this ADR records the conflict and stops.

**MT-07 therefore cannot close.** It can be *narrowed*, accurately, from "three rivals" to
**"two real authorities (`hierarchyStore` / `BimKernel`), one phantom (deleted here), and two
miscounted non-rivals"**.

## Consequences

- Three user-visible surfaces that silently degraded — annotation plan-view level labels, the
  room-graph panel title, and the room-graph level picker — resolve real level names once their
  reads point at `bimManager`.
- `levelStore?: any` leaves `src/global-window.d.ts`, so the phantom cannot acquire a seventh
  reader.
- `annotationPlanToolCommit.test.ts` stubs `window.bimManager` instead of the phantom, so the
  suite exercises the path production actually takes.
- The register's MT-07 row and the recount note both need amending to the corrected census. That
  is the orchestrator's territory, listed here so it is not forgotten.

## Alternatives rejected

**Delete `BimKernel`'s levels now, on the strength of ADR-0325.** Rejected: ADR-0325 does not name
BimKernel, §WALL-AUDIT-2026-M3 declares the opposite, and the map is persisted and feeds the cull
path. Deleting a load-bearing authority on an inferred mandate is the defect this row exists to
close, committed in the row's own name.

**Delete `plugins/plan-view/src/LevelStore.ts` to make the count come out at "rivals removed".**
Rejected: it is not a rival, so removing it would close the row by redefining it rather than by
fixing anything — and it would take `PlanViewCanvasHost`'s active-level redraw with it.

**Leave `window.levelStore` alone as harmless dead code.** Rejected: it is *declared* as a level
authority, six production sites read it as one, and it degrades three surfaces today. A declared
authority with zero writers is the emptiest possible rival, and the `?? []` at two of its sites is
the §CONTEXT-DATA-HONESTY defect — "no store" and "no levels" arriving as one value.
