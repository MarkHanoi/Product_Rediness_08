# ADR-008 — Wall handler triage (22 → 14)

* **Status:** Accepted
* **Sprint:** S07 (`phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S07-T1)
* **Date:** 2026-04-26
* **Supersedes:** —
* **Superseded by:** —

## Context

PRYZM 1's wall command surface in `src/commands/walls/` lists **22**
distinct command classes (count from `ls src/commands/walls/`). Several
of these are micro-commands that exist only because PRYZM 1's command
dispatch was not parametric — `SetWallWidthCommand`, `UpdateWallHeight
Command`, and `UpdateWallDimensionsCommand` are all just thin wrappers
around the same "patch one or two scalar fields on a wall" mutation.

PRYZM 2's `CommandHandler<TPayload, TStores>` (ADR-002) is parametric
in `TPayload`, so several PRYZM 1 commands collapse into a single
PRYZM 2 handler with an optional-fields payload. This ADR records the
**exact** 22 → 14 mapping we ship and the deferral schedule for the
14 handlers across S07, S08, and S10.

## Decision

The PRYZM 2 wall plugin ships **14 handlers** total, in three waves:

### Wave 1 — S07 (this sprint, 5 handlers)

The simplest cross-section of the wall command surface — together they
exercise every `Store<WallData>` mutation primitive (add / replace /
nested-replace / remove) so the L2 ↔ L1 wiring is proven before any
producer / committer code lands.

| # | PRYZM 2 handler | PRYZM 1 commands collapsed | LOC ratio (1 → 2) |
|---|---|---|---|
| 1 | `wall.create`         | `CreateWallCommand`             | 349 → ~115 |
| 2 | `wall.delete`         | `DeleteElementCommand` (wall slice) | 783 → ~75 |
| 3 | `wall.move`           | `UpdateWallBaselineCommand`     | 191 → ~95 |
| 4 | `wall.setDimensions`  | `UpdateWallDimensions` + `SetWallWidth` + `UpdateWallHeight` | 257 + 71 + 109 → ~110 |
| 5 | `wall.setColor`       | `UpdateWallColorCommand`        | 71 → ~95 |

LOC ratio is the headline win: **2,328 → ~490** (≈ 4.7× reduction)
even before the 9 wave-2/wave-3 handlers land.

### Wave 2 — S08 (after producer)

| # | PRYZM 2 handler | PRYZM 1 commands collapsed |
|---|---|---|
| 6 | `wall.transform` (rotate + translate)         | `TranslateElementCommand` + `RotateElementCommand` (wall slice) |
| 7 | `wall.setSystemType`                          | `SetWallSystemTypeCommand` |
| 8 | `wall.setLayers`                              | `SetWallLayersCommand` + `UpdateWallLayerMaterialCommand` |
| 9 | `wall.bulkSetVisuals` (n-row materialColor)   | `BulkSetWallMaterialColorCommand` + `BulkSetWallTypeCommand` |

### Wave 3 — S10 (after committer + cascade infra)

| # | PRYZM 2 handler | PRYZM 1 commands collapsed |
|---|---|---|
| 10 | `wall.opening.create`              | `CreateWallOpeningCommand` |
| 11 | `wall.createBetweenMarks`          | `CreateWallBetweenMarksCommand` |
| 12 | `wall.createFromSlab`              | `CreateWallsFromSlabEdgesCommand` |
| 13 | `wall.changeLevel` (cascades children) | `ChangeWallLevelCommand` (with door/window cascade lifted to L4) |
| 14 | `wall.join` / `wall.cut`           | `JoinWallsCommand` + `CutWallCommand` |

### Dropped from PRYZM 2 (8 commands, 22 − 14 = 8)

| PRYZM 1 command | Reason for drop |
|---|---|
| `SetWallStartCommand` / `SetWallEndCommand` | Subsumed by `wall.move` (full baseLine replacement, no implicit-null endpoint sugar). |
| `LockWallCommand` | Lock state moves from per-wall flag to the SelectionStore + a project-wide `locked` set (S16). |
| `RecomputeWallJoinsCommand` | Joins are derived state recomputed by the L4 producer on-demand — no command needed. |
| `RebuildWallGeometryCommand` | Same — geometry is committer state, recomputed by `bindStore` dispatcher. |
| `ToggleWallVisibilityCommand` | View-state concern — moves to the V-state store in S17. |
| `SetWallProfileCommand` | Profile system did not survive PRYZM 1 — no carry-forward. |
| `MigrateWallSchemaCommand` | One-shot legacy migration — runs once at PRYZM-1→2 import time, not as a runtime command. |
| `SetWallIdCommand` | IDs are immutable in PRYZM 2 — id-rewrite only happens during sync conflict resolution (server side). |

## Deviations from PRYZM 1 (called out in handler JSDoc)

These are intentional contract changes from the PRYZM 1 commands; each
is documented in the corresponding handler's JSDoc and replicated in
the parity input fixtures under `tests/fixtures/pryzm-1/wall/`.

### A. ULID id minting

PRYZM 1's `CreateWallCommand` line 32 calls `crypto.randomUUID()`. The
PRYZM 2 handler calls `createId('wall')` from
`@pryzm/schemas/factory/createId.ts`, producing `wall_<ulid>` per the
typed-id brand contract (ADR-001). Parity capture normalises both to
the literal `'<id>'` placeholder before comparison.

### B. No `_neighbourSnapshot` capture

PRYZM 1's `CreateWallCommand` walks every wall on the level and snapshots
neighbour join state for undo (lines 165–214). The PRYZM 2 handler does
**not** — the join cascade lives in the L4 cascade infrastructure that
lands with the producer in S08. Local undo is the inverse Immer patch
only; cross-element undo is the cascade's responsibility from S08 onward.

### C. No DOM error event dispatch

PRYZM 1's `WallSystemError` constructor dispatches a DOM `CustomEvent`
(`bim-wall-system-error`) for the toast UI. The PRYZM 2 hierarchy
(`plugins/wall/src/errors.ts`) does **not** — error fan-out belongs to
the L7 presentation layer, which subscribes to the bus's `EventRecord`
emit channel instead (DOM-free per ADR-002 §3).

### D. `affectedStores: ['wall']` (not `['wall', 'level']`)

PRYZM 1's `CreateWallCommand:51` declares `['wall', 'level']` defensively.
The PRYZM 2 handler declares only `['wall']` because:

1. The handler **writes** only to the wall store; level access (when the
   LevelStore lands in 1C) is read-only.
2. The bus's multi-store patch filter at `CommandBus.ts` `executeCommand`
   currently routes per-store patches by `path[0] === storeKey`, which
   requires patches to carry the store-key prefix. PRYZM 2 handlers
   produce patches via Immer's `produceCommand` against
   `Record<id, Dto>`, which does **not** prefix paths with the store
   key — so any multi-store handler today would silently drop patches
   for every secondary store.
3. The single-store branch in the bus (`stores.length === 1`) takes
   `forwardPatches: result.forward` verbatim and routes correctly.
4. Once the LevelStore lands in 1C alongside a small bus refactor that
   teaches `produceWithPatchesPerStore` to emit per-store envelopes,
   `wall.create` (and the wave-3 cascade-aware handlers) will be
   re-declared `['wall', 'level']` without a payload contract change.

### E. `wall.setDimensions` is the 3 → 1 collapse

`UpdateWallDimensionsCommand` (height + thickness),
`SetWallWidthCommand` (thickness alone), and `UpdateWallHeightCommand`
(height alone, with PRYZM 1 height-cascade to attached doors / windows)
collapse into a single payload-optional handler. The cascade lifts to
the L4 cascade infra in S10 D6 — for S07 it is explicitly out of scope.

## Consequences

* The 5-handler wave-1 surface ships behind kill-switch K1B-4: PRYZM 1
  wall code under `src/commands/walls/**` and `src/elements/walls/**`
  is **byte-for-byte unchanged** until S12 D9 (1B demo + flag flip).
* Parity capture inputs live under `tests/fixtures/pryzm-1/wall/{create,
  delete, move, dimensions, color}.json`; the post-execute snapshot
  side of parity capture lands in S08 with the producer (geometry +
  DTO snapshots together).
* The 9 deferred handlers (waves 2 + 3) inherit the same JSDoc
  conventions, error hierarchy, and OTel span ownership as the wave-1
  set; no further triage ADR is needed for them.
* The 8 dropped PRYZM 1 commands are listed verbatim above so any
  future audit can re-confirm none of them carry behaviour we depend on
  outside the PRYZM 1 kill-switch perimeter.

## References

* `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S07-T1 — triage owner
* `docs/architecture/element-recipe.md` — the recipe this ADR seeds
* `docs/architecture/adr/0002-command-handler-signature.md` — the
  parametric handler contract that makes the collapses possible
* `src/commands/walls/` — the 22-class PRYZM 1 surface this ADR triages

---

## Amendment — 2026-04-28 (PHASE-1 close-out audit, W-05)

The original ADR enumerated **14** wall handlers across waves 1–3.
Two refactors landed before the Phase-1 audit closed:

1. **S07-T4 — `CutWall` extracted from `TransformWall`.**  The PRYZM 1
   `TransformWallCommand` carried two distinct intents (geometric
   transform vs. boolean cut against a slab edge).  Splitting them
   produced a dedicated `CutWallHandler` so the cascade rule registered
   in S10 D6 only fires on cut intents — half the cascade work, no
   behavioural change.
2. **S08-T2 — `JoinWall` extracted from `TransformWall`.**  Mirror of
   the cut-extraction.  Joins now carry their own audit type
   (`pryzm.wall.join`), which the parity matrix (W-12) keys off.

Net handler count therefore is **15**, not 14.  The full set in
`plugins/wall/src/handlers/` after the amendments:

| # | Handler                       | Wave | Notes                          |
|---|-------------------------------|------|--------------------------------|
| 1 | `CreateWallHandler`           | 1    | original triage entry          |
| 2 | `CreateWallBetweenMarksHandler`| 2   | original triage entry          |
| 3 | `CreateWallsFromSlabHandler`  | 2    | original triage entry          |
| 4 | `CreateWallOpeningHandler`    | 2    | original triage entry          |
| 5 | `DeleteWallHandler`           | 1    | original triage entry          |
| 6 | `MoveWallHandler`             | 1    | original triage entry          |
| 7 | `TransformWallHandler`        | 2    | residual after Cut/Join split  |
| 8 | **`CutWallHandler`**          | 2    | **W-05 amendment — split S07** |
| 9 | **`JoinWallHandler`**         | 2    | **W-05 amendment — split S08** |
|10 | `ChangeWallLevelHandler`      | 3    | original triage entry          |
|11 | `SetWallDimensionsHandler`    | 1    | collapses original 3-handler set |
|12 | `SetWallColorHandler`         | 1    | original triage entry          |
|13 | `SetWallLayersHandler`        | 2    | original triage entry          |
|14 | `SetWallSystemTypeHandler`    | 2    | original triage entry          |
|15 | `BulkSetWallVisualsHandler`   | 3    | added at S10 for ribbon ops    |

The 5-handler wave-1 surface, the K1B-4 kill-switch, and every
JSDoc/OTel convention from the original ADR remain unchanged — the two
extractions are pure refactors with byte-for-byte identical observable
behaviour, captured by the existing parity fixtures under
`tests/fixtures/pryzm-1/wall/{transform,cut,join}.json`.
