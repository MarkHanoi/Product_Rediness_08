# ADR-0266 — Does an editable DIMENSION drive the model, or override the text?

- **Status:** **ACCEPTED — OPTION A. THE FOUNDER WAS ASKED EXPLICITLY AND CHOSE: AN EDITED
  DIMENSION DRIVES THE MODEL.** Implemented under §FIX-DIMENSION-DRIVES-MODEL (L-291b).
- **Date:** 2026-07-13 · **Decided:** 2026-07-14
- **Tag:** `§FIX-DIMENSION-SELECTABLE-EDITABLE-CONFORMANCE` (L-256)
- **Contracts:** C03 (schemas/commands/state), C16 (command authoring CA-1…16), C06 (selection),
  Contract-23 (pen table), C24/C24.1 (sheet composition, auto-documentation), P6, P8
- **Related:** L-256, L-263 (`§FEAT-AUTO-DIMENSION-ELEVATION-VIEWS`), L-262 (LOD study),
  ADR-0119 (annotation subsystem store is the render sink)

---

## The question

The founder asked for the dimension element to be **selectable and editable**. Selection is a
mechanical problem and it is fixed (see "What was closed", below). **Editing is not mechanical.**

Changing a dimension's **value** is not a text edit. A dimension is a *measurement of geometry*.
So "edit the dimension to 3000" can mean exactly one of two things, and they are **different
products**:

- **Option A — DRIVE (Revit-style).** The dimension is a **constraint**. Typing 3000 **moves the
  wall** so that the measured distance really becomes 3000. The number on the drawing is always
  the truth because the model was changed to make it true.
- **Option B — OVERRIDE (documentation-only).** The dimension is an **annotation**. Typing 3000
  changes the **displayed text** and nothing else. The wall stays where it is. The drawing now
  says 3000 where the model says something else.

**This ADR does not choose.** It sets out both, and the consequences, so the founder can.
**Neither has been implemented in this work.**

---

## What the code does TODAY (and this is the part that matters)

Both options are **already partially present**, which is worse than either.

### A drive path already ships, quietly

`apps/editor/src/ui/property-panel/PropertyPanelAnnotations.ts` → `showLinearDimension()` renders a
**"MOVE WALL"** button. When a dimension references a wall **and that same wall is separately
selected in 3D**, the panel offers a "Move wall to" input and dispatches `wall.updateBaseline`,
translating the **whole wall** by the delta.

This is a drive-dimension. It is also **not a sound one**:

- it **translates both endpoints** of the wall — no junction re-solve, so neighbouring walls do not
  follow and the corners break;
- it fires **outside any batch**, so it is not one undo unit with anything it disturbs;
- it is gated behind `selectedWallId`, i.e. the user must *also* have the wall selected in 3D, which
  is why almost nobody has ever seen the button;
- **auto-dimensions can never trigger it at all.** `applyAutoDimensions` builds its annotations with
  `makePointRef(...)` — **point** references with no `elementId`. The panel's drivability test is
  `refs.find(r => r.elementId === selectedWallId && r.elementType === 'wall')`, which no
  auto-dimension can ever satisfy. So on the founder's fully-dimensioned plan, **every** dimension
  falls to the read-only "Measured" branch.

That is the honest explanation of "I cannot edit it": the drive path exists, is unsound, and is
unreachable from the dimensions he actually has.

### An override field already exists in the schema

`packages/schemas/src/elements/Dimension.ts` carries `overridden: boolean` + `overrideText?: string`,
and `plugins/dimensions/src/handlers/SetDimensionText.ts` is a complete, C16-shaped,
span-instrumented handler for it. The annotation-side panel also has an `override` parameter.
**Neither is wired to the thing that renders.**

So the platform currently has: an unsound drive, an unwired override, and a schema for each. **The
decision has been made twice, by accident, in opposite directions.** That is what this ADR exists to
stop.

---

## Option A — DIMENSION DRIVES THE MODEL

**What it means.** A dimension is a first-class **constraint** between two references. Editing its
value re-solves the geometry.

**What it would require — and none of it is optional:**

1. **Real element references, not point refs.** A driving dimension must know *what* it measures
   (`wallId` + anchor `face-inner`/`centerline`/`start`…). The `DimensionString` schema already
   models this (`DimensionReferenceSchema`), but the **rendered** annotation does not — auto-dims
   carry `makePointRef` cached positions. Every auto-dimension would have to be re-anchored to
   element references. This is the single biggest piece of work and it is unavoidable.
2. **A solve, not a translate.** "Move the wall so this becomes 3000" is under-determined: *which*
   wall moves, which end, and what happens to everything joined to it? It needs the
   **constraint-solver** (`packages/constraint-solver`) and the junction resolver — not a
   `baseLine += delta`. Otherwise you get today's broken corners.
3. **Locks / degrees of freedom.** Revit's model is that a dimension can be **locked**, and locked
   dimensions constrain future edits. The panel already renders a `Lock constraint` checkbox and a
   soft/hard `constraintType` — **entirely decorative today**. If we drive, they must become real,
   because a driving dimension that cannot be locked is a foot-gun: the user moves a wall and
   silently invalidates a dimension he thought was holding it.
4. **Conflict + failure UX.** Over-constrained models must fail *loudly and recoverably* ("this
   would break 3 other locked dimensions"), never silently.
5. **One undo entry** for the whole re-solve, across every element it moved (C16).

**Consequences.**
- This is what an architect means by a BIM dimension. It is the product the founder is implicitly
  comparing to.
- It is a **large** piece of work — it pulls in the constraint solver, junction resolution and the
  re-anchoring of every auto-dimension. It is not a panel change.
- Risk: a half-built drive is **far worse than none**. A dimension that moves a wall but does not
  re-solve its junctions produces a model that is *silently wrong* — the drawing says one thing, the
  geometry says another, and the user trusts the drawing. **The current "MOVE WALL" button is
  already in this state.**

---

## Option B — DIMENSION OVERRIDES THE TEXT ONLY

**What it means.** A dimension is documentation. The value is always derived from the geometry
(L-127); the user may replace the *displayed string*, and that is all.

**What it would require:**

1. Wire the **existing** `overridden` / `overrideText` fields to the renderer (the annotation path
   already has an `override` parameter that `formatDimension` reads).
2. **Flag every override, visibly.** `EvaluatedDimension` already reserves `isOverride` and
   `isFlagged` ("geometry and override disagree by > 5 %"). An override that looks identical to a
   measured value is a lie waiting to be built.
3. Optionally: refuse to export/issue a sheet carrying a flagged override without an explicit
   acknowledgement.

**Consequences.**
- Small, safe, and can ship immediately — most of it already exists.
- It is **honest about what it is**: the drawing may deliberately differ from the model, and says so.
- It does **not** give the founder what he is probably picturing when he says "editable".
- Real precedent: this is how a drafting tool behaves, and every BIM tool also supports it *in
  addition to* driving, precisely for the "±5, verify on site" case.

---

## The recommendation (a recommendation, not a decision)

**Ship B, plan A, and remove the accidental half-A now.**

- **B is not a lesser A — it is a different, legitimate feature**, and both mature products have it.
- **A is a real commitment** (constraint solver + re-anchoring + locks + conflict UX). It should be
  scheduled deliberately, not arrived at through a button.
- **The "MOVE WALL" button should be removed or gated behind a feature flag until A is done
  properly.** It is a drive-dimension without a solver. It is the most dangerous code in this
  subsystem, because it silently produces a model whose corners no longer meet.

**No part of this was implemented.** The value-edit path is untouched, in either direction, exactly
as the ticket required. The `MOVE WALL` button is left **exactly as it was found** — removing it is
itself a product decision and is not mine to take.

---

## What WAS closed under L-256 (mechanical, no product question attached)

The six-point conformance matrix and its gaps are reported with the work; the code changes were:

- **Pick corridor** (`§FIX-DIMENSION-PICK-CORRIDOR`). Root cause of "very hard to select": the
  hit-test measured the distance to the **reference line** (which lies *on the wall*), while the user
  sees and aims at the **dimension line**, offset 0.5–2.0 m away (`§FIX-AUTODIM-OFFSET-WORLD-SCALE`,
  L-155) — tens to hundreds of pixels at any usable zoom. Render and pick now share one geometry
  authority (`_linearDimViewGeometry`), and the corridor covers the dim line, the extension lines,
  the endpoint handles **and the label box**.
  *This refutes the standing hypothesis that annotations had no pick representation: they have had
  one since L-161. It was aimed at the wrong line.*
- **Projection parity** (`§FIX-DIM-ELEV-PROJECTION`). The hit-test hard-coded the **plan**
  projection `(pt.x, pt.z)` while the renderer projected through `_ptH`/`_ptV`. In a plan the two
  agree by coincidence; in an **elevation** they do not — so a dimension on an elevation was drawn in
  one place and picked in another, i.e. **not selectable at all**. Also: the annotation renderer
  never applied the view's `hSign`, so annotations on a mirrored elevation were drawn on the wrong
  side of the building from the geometry they annotate.

Both are prerequisites for L-263 (auto-dimension on elevations) and neither touches the value-edit
question.

---

# DECISION (2026-07-14) — **OPTION A. AN EDITED DIMENSION DRIVES THE MODEL.**

The founder was asked explicitly and chose Option A. **Type 3200 on a wall dimension and the wall
moves to 3200.** There is **no override field, and no escape hatch.**

## The rule this settles, product-wide

> ### AN EDITED ANNOTATION WRITES TO THE MODEL. NEVER TO THE DRAWING.
> **The drawing can never lie about the model, because it is only ever a READOUT of it.**

This is coherent, unqualified, across both annotation families:

| | What the user edits | What it writes |
|---|---|---|
| **Dimension** (this ADR) | the measured value | the **geometry** (the wall moves) |
| **Tag** (ADR-0123) | the displayed mark | `element.mark` — and therefore the **schedule** (C28) |

## Option B (override) was CONSIDERED AND REJECTED

Not "not yet" — **rejected**. A dimension that displays a number the model does not hold is a
drawing a builder builds from. Producing exactly that artefact is the failure this product exists to
prevent, and it is the same failure class as every defect closed this week (L-287: a drawing that is
*confidently wrong* is worse than one that is obviously broken). The `overridden` / `overrideText`
fields in `packages/schemas/src/elements/Dimension.ts` are therefore **dead by decision**: they must
not be wired to the renderer, and no `override` parameter may be honoured on an annotation. **Assert
their absence** — an escape hatch that arrives through the back door (e.g. as a "fallback" when a
drive fails) is the rejected option wearing a disguise.

## What the drive must do (binding on the implementation)

1. **It must resolve WHICH ELEMENT MOVES, deliberately — never per-case guesswork.** A dimension
   references *two* things (L-287). Typing one number is under-determined. The rule is stated in
   §FIX-DIMENSION-DRIVES-MODEL and is: **the user's selected element moves, if the dimension
   references it; otherwise the SECOND reference (the "to" end) moves and the "from" end is held.**
   Predictable beats clever: a user who cannot predict which wall moves will not use it twice.
2. **It dispatches the SAME command the drag already uses** (`wall.updateBaseline`) — P6, one
   gesture, **one undo entry** (C16). Not a new mutation path, so junction re-solve, hosted-opening
   re-anchoring and the tracker all fire exactly as they do for a drag. This is what closes the
   "half-built drive is worse than none" risk recorded above: there is no second path to be
   half-built.
3. **It must FAIL LOUDLY, and leave the model untouched.** A locked element, an over-constrained
   chain, a dimension that references no movable element, or a command the validator rejects — all
   of these must **surface the reason to the user in the panel**. Silently swallowing a rejection
   (`console.warn` and hide the panel) is the L-214/218/220 class: the user believes it worked. And
   **it must never fall back to overriding the text** — that is the rejected option, arriving through
   the back door.
4. **It must terminate.** Driving the model fires `ViewDependencyTracker`, which re-runs the Set-Out
   reconcile (L-286), which re-derives the annotations — including the one that was just edited. One
   edit ⇒ one model mutation ⇒ one reconcile ⇒ settled. Assert it.
