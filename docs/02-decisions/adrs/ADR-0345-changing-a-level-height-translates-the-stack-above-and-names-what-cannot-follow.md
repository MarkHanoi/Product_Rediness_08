# ADR-0345 — Changing a level's HEIGHT translates the stack above it, as one undo, and names by family whatever cannot follow

- **Status:** Accepted
- **Date:** 2026-08-23
- **Lane:** LEVEL36
- **Supersedes:** nothing. **Amends in place:** `C11` (§ level-height edit), `C16`
  (§ the command table), `C84` (§EI-PROP — the level-move row), `C72` (§5.1 — the
  stranded set shrinks from six kinds to three).
  **Adds:** `packages/command-registry/src/levels/SetLevelHeightCommand.ts`;
  `packages/command-registry/__tests__/setLevelHeightCascade.test.ts`;
  `packages/core-app-model/src/__tests__/SpatialAuthorityArming.test.ts`;
  `showLevel` in `apps/editor/src/ui/property-panel/PropertyPanelAnnotations.ts`.
- **Commits:** `32bbe8b2` (cascade + command), `cb32a33f` (tests), `d7accc26` (UI)
- **Contracts:** **C11** (element creation pipeline), **C16** (command authoring),
  C03 §2.1 (one mutation path), C05 (persistence), C72 (propagation & prevState —
  the governing contract for the reconcile), C74 (constraint honesty — *an honest
  refusal is an answer*), C78 §1.4 (`NO-EMPTY-MEANS-UNKNOWN`), C81 (a cascade is
  ONE undo), **C84 + C85–C99** (element integrity, per-element block), P1/P6/P8.
- **Issue-log:** L-7200 … L-7205.
- **Builds on:** **ADR-0344** ("when a host moves, every dependent either ADAPTS
  or REFUSES BY NAME — silence is a defect, not a default"). This ADR applies that
  rule to the *level* as host, which ADR-0344 explicitly left to a later lane.

---

## 1 · Context — the founder asked for 2.9 and got nothing

> *"In the **Level & Grid** — I want to be able to easily change the level elevation. In this
> case the **height of Ground level, instead of 3 I want it to be 2.9**. I would like to
> **select the level, access the level properties** and easily change the elements needed. As
> per **BIM 3.0**, if I change the level elevation/height, **all elements connected to it —
> basically all elements in above levels and below levels — shall adapt.**"*

His screenshot shows rows reading `Ground · 3.0m · 0.000` and `Level 1 · 3.0m · 3.000`. The
`3.0m` is floor-to-floor **height**; the `0.000` / `3.000` are **elevations**. He wants to edit
the first and see the second follow.

**Three separate things were wrong, and they had three different fixes.** Naming them
separately matters, because two of them look identical from the outside — "nothing moved" —
and one of them was not a missing feature at all.

## 2 · What was measured — including one refuted assumption

### 2.1 · The height cell was not editable, and writing it would not have helped

`LevelManagerPanel.ts` rendered height as a `<span class="lm-height-tag">`. There was no code
path from the UI to a height change at all.

But making the span an input would **not** have been the fix, because
`UpdateLevelCommand({ updates: { height } })` writes the number and fires nothing:
`BimKernel.updateLevel()` dispatches `spatial-authority-reconcile` **only** when `elevation`
changes (`BimKernel.ts:370-375`). The height field was decorative in the strongest sense —
writing it changed no geometry anywhere in the product.

### 2.2 · ⭐ The cascade was UNREACHABLE, not absent — and this was the root cause

The lane brief flagged **L-2409** ("the entire cross-element cascade layer is AUTHORED AND
UNWIRED") and asked whether the level cascade was the same shape.

**It is not — L-2409 is a different layer** (`plugins/cross`, the slab→wall pin cascade). The
level reconcile has a real production consumer:
`apps/editor/src/engine/initWallLevelSubscribers.ts:48` registers the rebuild callback, and
`engineLauncher.ts:909` calls that function in production. So *"the callback is wired"* is
true, and stopping there would have been the wrong answer.

**The defect is one level down.** The window listener that turns the event into rebuilds is
installed by `SpatialAuthority.ensureReconciliationListener()`, and that had exactly **one**
caller: the tail of `resolveWorldTransform()` (`SpatialAuthority.ts:172`).

Measured with ripgrep **and** `grep -rn`, cross-checked because a single grep is not proof:
`resolveWorldTransform` has **one** production call site in the entire repository —
`packages/geometry-wall/src/WallFragmentBuilder.ts:1256` — and it sits in the `else` arm of
`if (worldY !== undefined)`. The authoritative path, `updateWall()`, **computes `worldY`
itself** (`WallFragmentBuilder.ts:861`: `level.elevation + slabBaseOffset + wall.baseOffset`)
and passes it into `buildWall()`, precisely so the builder does not reach back into
SpatialAuthority — that was the §13/§4 cross-layer fix.

**Therefore, on the normal path, the resolver is never called, the listener is never added,
and every `spatial-authority-reconcile` dispatch fires into a void.** Arming was *incidental*:
it happened only when something called `buildWall()` without a `worldY` (a miter-adjust
rebuild) — i.e. only if the user happened to have drawn intersecting walls first. On a fresh
project the entire level-elevation cascade was dead.

This is the **ABSENT vs UNREACHABLE** distinction (C01 §6 rule 6) and the two have opposite
fixes. The machinery was fully authored and correct; it needed switching on, not building.

> ⚠ **Why a thorough existing suite never caught it.**
> `SpatialAuthority.reconcile.test.ts` has six cases covering this exact listener. Every one
> of them calls `armReconcile()`, whose second line is `spatialAuthority.resolveWorldTransform(IDS.wall)`
> — *"registers the window listener"*. The helper arms the very thing whose arming was broken.
> `SpatialAuthority` is a process singleton and `_reconciliationListenerRegistered` never
> resets, so inside that file the listener is **always already installed** and the defect is
> structurally invisible. The regression pin therefore lives in its **own file**
> (`SpatialAuthorityArming.test.ts`), because Vitest isolates module registries per file and
> that is the only place the singleton is genuinely fresh. Merging it back would silently
> convert it into a tautology; its header says so.

### 2.3 · The cascade carried two families out of eight

`RECONCILABLE_TYPES` was `{Wall, Slab}` — correctly narrowed by an earlier lane to the truth
(C72 §7, "narrowing a claim to the truth is a fix"). Everything else classified
`DETERMINED-STRANDED` and kept its old elevation behind a `console.warn`.

### 2.4 · There was no level-properties surface, and one event was already shouting into a void

No inspector state for a level existed anywhere. Meanwhile `pryzm-level-selected` was **already
declared** in the runtime catalog (`runtime-composer/src/types.ts:1018`) and **already emitted**
from two production sites — `PlanViewInteraction.ts:1081` (level-head click) and `:1093`
(level-line click) — with **zero subscribers** in the repository. Clicking a level in a section
or elevation view announced a selection nothing received (L-7205).

## 3 · Decision — the cascade rule (NORMATIVE)

Let **δ = newHeight − oldHeight** for the edited level *L*.

1. **Every level strictly above *L* moves by exactly δ.** Its own `height` is untouched.
2. **The edited level and everything below it do not move.**
3. Consequently **every other level's floor-to-floor height is preserved exactly** — the stack
   above rides up or down rigidly.

Ground `3.0 → 2.9` lowers Level 1 from `3.000` to `2.900` and Level 2 from `6.000` to `5.900`;
both keep their 3.0 m storey heights.

**The rejected alternative** was to recompute every elevation as the cumulative sum of the
heights below it. It gives the same answer on a perfectly stacked model and a *different,
destructive* one on any model with a mezzanine, a split level, a plant deck or an imported
non-uniform stack: one height edit would silently re-proportion the whole tower. Rule 1 is the
only rule under which a single edit cannot change something the user did not point at.

### 3.1 · ⭐ On "below levels shall adapt"

Under this rule a **basement does not move** when Ground's height changes. **That is correct,
not a shortfall.** Ground's floor-to-floor governs the gap *above* Ground; nothing below it is
a function of that number. Moving it would be inventing a change the user did not ask for.

What *does* adapt at and below the edit is the **edited level's own ceiling-hung content**: the
ceiling datum is `elevation + height` (`SeatingDatumResolver`), so pendants and downlights on
the edited level re-hang. This is recorded explicitly because *"nothing moved"* and *"nothing
should have moved"* are different facts, and the UI must not leave the user guessing which one
happened. The rail legend and the panel tooltip both say "Levels below are unaffected".

## 4 · Decision — per-family, ADAPT or REFUSE BY NAME (ADR-0344 applied to levels)

Membership was decided by **one measured question**: does the family's build path *re-derive*
world Y from `level.elevation`, or was Y baked in absolutely at create time? Only a re-deriving
builder can follow a level move by being re-invoked.

| family | follows? | mechanism / measured reason |
|---|---|---|
| **Wall** | ✅ | reconcile → `builder.updateWall` (pre-existing) |
| **Slab** | ✅ | reconcile → `slabStore.triggerRebuild` (pre-existing) |
| **Column** | ✅ **new** | `ColumnFragmentBuilder.ts:225,234` re-derives → `columnBuilder.updateColumn` |
| **Roof** | ✅ **new** | `RoofFragmentBuilder.ts:305` re-derives → `roofBuilder.updateRoof` |
| **Door / Window** | ✅ | hosted (C15) — re-rendered by the host wall's rebuild via `resolveOpeningRenderMap` |
| **Furniture** | ✅ **new** | `ReseatLevelElementsCommand`, composed into this command's undo |
| **Plumbing** | ✅ **new** | as above (`position.y` absolute + `baseOffset`) |
| **Lighting** | ✅ **new** | as above; floor-mounted re-stand on FFL, hung re-hang from the soffit — so a **height** edit moves ceiling lights on the *edited* level too |
| **CurtainWall** | ❌ REFUSES | `CurtainWallBuilder.ts:1094,1801` **does** re-derive, so it is wirable in principle. Stranded only because its builder is constructed at `initUI.ts:2302`, *after* this wiring seam runs. **A build-order problem, not a geometry one.** |
| **Beam** | ❌ REFUSES | **MEASURED ABSENT:** `packages/geometry-beam/src/` contains **zero** `elevation` references (ripgrep + `grep -rn`). Nothing in the beam build path consults level elevation, so re-invoking it would rebuild the beam **in the same place**. Wiring it would be a lie, not a fix. |
| **Stair** | ❌ REFUSES | bakes absolute geometry at create time **and spans two levels**. A stair from Ground to Level 1 cannot *translate* when the gap between them changes — it must **re-solve** its riser count, going and landing. That is a design task, not a missing call. See §6. |

### 4.1 · Why furniture/plumbing/lighting are NOT wired into the reconcile callback

Their `position.y` is **persisted absolute state**, so re-seating them is a **store write**.
P6 makes commands the only mutation path, and the reconcile callback runs at *render* time — a
write there would be both un-undoable and a P6 breach. They are therefore re-seated by
`SetLevelHeightCommand` composing the existing `ReseatLevelElementsCommand`, which lands in the
same undo unit. The callback's header now states this boundary so the next lane does not "fix"
it by adding a store write.

### 4.2 · The refusal reaches a person

`SetLevelHeightCommand` censuses the three stranded families across every affected level and
returns a line beginning `⚠` in `result.info`. Both surfaces render it: the rail panel toasts
it, the property panel shows it inline under the field. An unreadable store is skipped as
**UNKNOWN, never counted as zero** (C78 §1.4) — under-reporting beats inventing a clean bill of
health.

## 5 · Decision — ONE undo, and it counts what LANDED

The cascade is one user gesture, so it is one history entry (C81).

⛔ **It deliberately does NOT use `CompositeCommand`.** That class (L-2401) returns
`success: true` **unconditionally in both directions** and counts children *attempted*, not
landed. Inheriting it would mean telling the user a forty-level cascade undid cleanly when half
of it did not.

`SetLevelHeightCommand` therefore owns its own snapshot and its own reverse, and — the load
-bearing detail — **verifies every write by re-reading it back out of `BimManager`**, because
`updateLevel()` returns `void` and silently no-ops on an unknown id. `success` is
`landed === attempted`. The regression test deletes a level between `execute` and `undo` and
asserts `success: false` with `"2 of 3"`.

## 6 · What this ADR does NOT establish — the named remainder

- **Stairs spanning a changed gap.** The hard case, and deliberately unsolved. A stair's rise
  is determined by the storey height; changing that height invalidates its riser count. The
  correct behaviour is to **re-solve** the flight (and possibly refuse if no riser count
  satisfies the code rule), not to translate it. Today it refuses by name.
- **Curtain walls.** Blocked only by builder construction order (`initUI.ts:2302` runs after
  `initWallLevelSubscribers`). One registry entry once that is resolved.
- **Beams.** Require a real change: their builder must consult `level.elevation` at all.
- **`level.order`.** Left in sync-by-convention. Measured: **no production reader** of
  `level.order` exists, and a rigid translation preserves relative ordering, so nothing
  observes the divergence. Recorded rather than silently "fixed".
- **Persistence (C05).** Elevations and heights are ordinary level fields already covered by
  the existing level persistence path; no new schema. **Not separately re-measured by this
  lane** — stated as inherited, not as verified.
- **Multi-user (C66/P8).** A concurrent height edit from two clients is not modelled here.

## 7 · Consequences

- The Level & Grid row's third cell is an **input**, not a tag, and dispatches a *different*
  command from the elevation cell beside it. Both files carry a comment saying they must not be
  merged.
- Selecting a level — from the rail row **or** from a level head/line in a section or elevation
  view — opens the **standard Property Inspector**, reusing the `showGrid` precedent. A second
  properties idiom was explicitly rejected: it is the defect this repo repeats most often.
- `RECONCILABLE_TYPES` widened `{Wall, Slab}` → `{Wall, Slab, Column, Roof}`. C72 §5.1 permits
  re-widening **only with a consumer that handles the type**, so the two consumers landed in the
  same commit and the test asserts delivery in both directions.
- The `roofWallClashAnnouncer` (PR-10) is **retained**. It was built because roofs never moved;
  now that they follow, a pure level move should produce **no** clash and the check correctly
  says nothing. It still catches the case it was built for — a roof whose own `baseOffset`
  strands it. The roof rebuild is ordered **before** the check so it sees the new position.
