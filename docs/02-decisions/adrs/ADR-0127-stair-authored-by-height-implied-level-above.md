> **Renumbered 2026-07-16**: originally filed as `ADR-0098`, which collided with [ADR-0098 — Element-Lifecycle Conformance Audit](./ADR-0098-element-lifecycle-conformance-audit.md). Renumbered to **ADR-0127** to resolve the duplicate. Body below is unchanged from the original. See the old→new map in [adrs/README.md §2.1](./README.md).

# ADR-0127 (formerly ADR-0098) — A stair is authored by HEIGHT; the level above is IMPLIED, not required

- **Status:** Accepted
- **Date:** 2026-07-12
- **Tag:** `§FIX-STAIR-PLAN-CREATION-BLOCKED`
- **Issue:** L-243 (re-report of L-217)
- **Contracts touched:** C11 (element-creation pipeline), C16 (command authoring), P4, P6
- **Supersedes:** the implicit "a stair requires two levels" precondition encoded in
  `BimService._ensureTwoLevelsForStair` and in the two plan stair handlers.

## Context

The founder reported: *"Stair in plan view can not yet be created."* This is a re-report —
L-217 was closed on `f52f71f0`, which fixed **which handler runs** (routing on view mode
rather than on a snap-availability predicate). That fix stands and is not reverted here. But
it never established **whether the handler could succeed**. It could not.

### What actually happens (reproduced, not assumed)

The plan-view stair tool the ribbon reaches is **`StairPathPlanToolHandler`** (tool key
`stair-path`, via `BimService.activateStairPathTool` → `ToolManager.activateStairPath`), **not**
`StairPlanToolHandler` (tool key `stair`, reachable only through the RadialMenu →
`BimService.createStair` → `StairSetupPanel` route).

Driving the real handler end-to-end in a fresh single-level project:

```
>>>PROBE ONE-LEVEL executeCalls=0
    warns=["[StairPathToolController] Cannot finish: invalid — Riser too small (0 mm — min 100 mm)"]
>>>PROBE TWO-LEVEL executeCalls=1
```

The chain of failure:

1. `StairPathPlanToolHandler._resolveAdjacentLevel()` had a **lying fallback**. When the base
   level was already the topmost level, it returned `top = base` — a **zero vertical span**.
   (When the base level was not found at all, it fabricated a top-level id of
   `${baseLevelId}:top`, an id present in no store, which `CreateStairCommand.canExecute`
   would then reject with "Top level does not exist".)
2. Zero span → `StairSolver2D` receives `totalHeight = 0` → `riserHeight = 0` → `isValid = false`.
3. `StairPathToolController._finish()` logged `console.warn` and **returned**. No stair, no
   toast, no error. **The tool silently did nothing.** That silence *is* the bug.

### Two further findings that change the design

- **`BimService._ensureTwoLevelsForStair` asks the wrong question.** It checks
  `levels.length >= 2`. A stair does not need *"two levels to exist"*; it needs *"a level
  **above the one it is drawn on**"*. The gate is therefore simultaneously **too strict** — a
  fresh project boots with one Ground level, so the tool refused to activate at all — and
  **too weak**: a two-level project with the **top** level's plan view open passes the gate
  and then dies silently inside the tool. Counting levels is not the invariant.
- **The plan path scavenged `window.activeStairConfig`**, a global that only the *3D* path's
  setup panel ever stamped. Shape / width / stair type silently failed to reach a plan-created
  stair. Same defect as L-239 (wall layers), L-213 (floor finishes), L-240 (floor inner face),
  and a live **P4** violation.

## The real invariant

The thing that must hold, and the only thing `CreateStairCommand.canExecute` actually
enforces (via `STAIR_CONSTRAINTS.HEIGHT_TOLERANCE`), is:

```
riserHeight × riserCount === height === topElevation − baseElevation
```

**The upper level is not the invariant. The HEIGHT is.** The upper level is merely where the
height is currently read from. That is the whole insight.

## Options considered

| | Option | Verdict |
|---|---|---|
| **(a)** | Author the stair by explicit **HEIGHT**; the upper level becomes optional | **Chosen** (see below) |
| **(b)** | Drawing a stair with no level above **offers to create it** — a command, not a toast | **Chosen as the mechanism** that realises (a) |
| **(c)** | Keep the hard requirement, make it a discoverable precondition | **Rejected** — it still forces the architect to hand-build a storey before they may draw a stair. It dresses up the workflow trap; it does not remove it. |

## Decision

**A stair is authored by HEIGHT. When no level exists above the base level, the stair IMPLIES
one, and the implication is realised by a COMMAND.**

Concretely — (a) and (b) are not alternatives; **(b) is how (a) is delivered without weakening
the invariant**:

1. **One chokepoint for the span.** `resolveStairVerticalSpan(levels, baseLevelId, storeyHeight)`
   (`packages/geometry-stair/src/StairVerticalSpanResolver.ts`) is the *only* place any stair
   creation path resolves its vertical extent. It is pure. It returns exactly one of:
   - `ok` — a level exists above; `height = topElevation − baseElevation`;
   - `needs-level-above` — none exists; the stair implies one at the default storey height;
   - `unresolvable` — the base level itself does not exist; a stair cannot be authored.

   It **never fabricates a level id** and **never returns a zero or negative span**. Both of
   those were live bugs.

2. **The implied level is created with `AddLevelCommand` (P6).** Not a toast. Not a dead end.
   The architect draws a stair; the storey it climbs to appears; the stair spans it; a toast
   *informs* (`"Level 1" created above to host the stair (3.00 m)`) rather than *blocks*. From
   the architect's point of view the upper level is now **optional** — which is exactly the
   intent of option (a).

3. **`riserHeight` is derived FROM the height, never the reverse.** `deriveRisers(height)` is
   shared by every path, so `riserHeight × riserCount === height` **exactly**, by construction.
   This is why the guard could be removed without weakening anything: *the guard never
   protected this invariant — `deriveRisers` and `canExecute` do.*

4. **The pre-tool `levels.length >= 2` gate is removed from `activateStairPathTool`.** Its
   removal **is** the fix. `createStair()` (the 3D `StairSetupPanel` route) **keeps** the
   `StairLevelRequiredPanel`, because that panel asks the user to *pick* a base and a top level
   from dropdowns and so genuinely needs two levels to populate.

5. **An invalid solve must reach the user.** `StairPathToolController` gains an `onInvalid`
   callback; the plan handler surfaces it as a toast. A stair that cannot be committed must say
   why. Dying in the console is not a failure mode a BIM tool may have.

6. **Config converges below the tools (P2 / P4).** `StairToolConfigStore`
   (`packages/geometry-stair/src/StairToolConfigStore.ts`) is the single source of truth for
   shape / width / `typeId` / mode. Every writer (ribbon I/L/U, `StairSetupPanel`) writes there;
   the plan handlers receive it by **dependency injection** through
   `PlanToolDrawContext.stairConfig`, matching the `WallPlanToolHandler` /
   `SlabPlanToolHandler` shape. **`window.activeStairConfig` is deleted**, clearing a P4
   violation and discharging the handler's own `TODO(STAIR-PLAN-DI)`.

## Consequences

**Positive**
- A stair can be created in a **fresh single-level project** — the founder's actual scenario.
- Plan-created and 3D-created stairs of the same shape/width/type produce **identical records**.
- The zero-span silent death is structurally impossible: the resolver cannot emit one.
- **L-216 (15 stair types) is unblocked.** `typeId` is threaded end-to-end. A type picker only
  has to call `setStairToolConfig({ typeId })` and *every* path — plan, 3D, path-tool, batch,
  AI — inherits it by construction. No further plumbing.

**Negative / accepted**
- Creating the implied level and creating the stair are **two commands, hence two undos**.
  Accepted: `AddLevelCommand` is independently meaningful, and a composite command would need a
  new transaction primitive for marginal benefit. Revisit if founder feedback says otherwise.
- A stair drawn on the top storey of an existing building now **adds a storey** rather than
  failing. This is the intended behaviour (a stair to nowhere is not a thing), and it is
  announced by a toast, but it is a behaviour change and is called out here deliberately.

## Alternatives explicitly rejected

- **Deleting the `topLevelId` guard in `CreateStairCommand.canExecute`.** Rejected outright. A
  stair whose risers do not sum to its height is a worse bug than a stair you cannot create.
  The invariant is real; this ADR preserves it exactly and merely stops *counting levels* as a
  proxy for it.
- **Making `topLevelId` optional on `CreateStairInput`.** Considered as the literal reading of
  option (a). Rejected: `topLevelId` is load-bearing for `StairLevelCleanupHandler`,
  `LevelTraversalPolicy`, IFC export and the schedule extractor. Making it optional would ripple
  through the entire stair subsystem for no user-visible gain over "imply the level and reference
  it" — which delivers the same UX with a far smaller blast radius and a *stronger* model (the
  stair always references a real storey).
