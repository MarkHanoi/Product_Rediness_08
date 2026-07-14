# ADR-0121 — Associative dimensions, the presentation split, and what Ctrl-Z does to a re-derived drawing

- **Status:** Accepted
- **Date:** 2026-07-14
- **Tag:** §FIX-DIM-ASSOCIATIVE-REFERENCES (L-287)
- **Contracts:** C03 (an annotation is an ELEMENT), C16 (its edit is a COMMAND), C09/P7 (view
  intent), C24.1 (auto-documentation sets), C28 (schedules), Contract-23 (pen table)
- **Supersedes nothing. Blocks:** L-286 (Set Out), L-283 (elevation chains)

---

## 1. The finding (measured, not argued)

**The product's dimensions were already non-associative, before anyone dragged anything.**

The pure engine (`@pryzm/auto-dimension`) plans *element-anchored* dimensions: every
`DimensionString.reference` is `{ elementId, anchor }` — "the left jamb of door_7", "the end of
wall_3". That is the associative query, and it was computed correctly.

The **executor threw it away.** `applyAutoDimensions` evaluated those references to world points
and emitted `makePointRef(...)`: `elementType: 'point'`, a fresh random UUID, the position **baked
into `cachedPosition`**. And:

- `resolveReferenceToPoint()` resolves a point ref **to its own cache** — forever;
- `AnnotationDependencyGraph` **explicitly excludes** point refs from orphan detection ("free-
  floating point refs have no host element to lose").

⇒ Move a wall and every auto-dimension keeps its **old position and its old number**. Delete the
wall and the dimension survives, still quoting it. *A drawing that is confidently wrong is worse
than one that is obviously broken — a builder builds from it.*

Two further defects fell out of the same investigation:

1. **The drag edited the measurement.** `PlanViewInteraction` translated every `modelPoint` by the
   drag delta **and stamped the dragged position into `references[i].cachedPosition`** — a gesture
   meaning "move this out of my way" silently changed *what the dimension measured*. For an
   associative dim the dependency graph re-resolves and snaps it back (the drag looks ignored); for
   a baked one it sticks (the drawing now lies). The presentation slots that *should* absorb a drag
   — `geometry2D.offset` and `screenOverride` — already existed and were already honoured by the
   renderer, and the drag touched neither.
2. **The resolver misread the opening offset.** `resolveHostedOpeningPoint` treated the store's
   `offset` as the opening **centre**; project-wide (§OPENING-OFFSET-LEFTEDGE-UNIFY) it is the
   **left edge**. Every opening anchor would have landed half a width off — the *second* instance of
   the L-180 disease. It was invisible only because nothing resolved an opening reference yet.

## 2. Decision

**A dimension holds two kinds of fact, and one gesture may never edit both.**

| | Fact about | Fields | Who may change it |
|---|---|---|---|
| **(1) What it measures** | the MODEL | `references` (and, for a dimension, `modelPoints` — which are only a **cache** of them) | a model edit; re-derived by `AnnotationDependencyGraph` |
| **(2) How it is shown** | the DRAWING | `geometry2D.offset` (the line's perpendicular standoff), `screenOverride` (the text), a tag's symbol point | the user, by dragging |

Enforced **structurally, not by discipline**:

- **Producer** — `applyAutoDimensions` emits the engine's `{elementId, anchor}` as a real
  `StableReference` (`dimensionReferences.ts`). No new resolver capability was needed: the
  vocabulary (`start`/`end`/`face:exterior`/`wall:centerline`, hosted-opening anchor codes) already
  existed and simply was not used. Anchors with no unambiguous mapping fall back to a point ref
  **for that string alone**, and the executor **reports the count** — it never invents the reference
  a point "probably" meant.
- **Drag** — goes through `UpdateAnnotationPresentationCommand`, whose patch type is
  `{ offset?, screenOverride?, symbolPoint? }`. **There is no field through which a drag can reach a
  reference.** `UpdateAnnotationCommand` is no longer imported by the drag path at all.
- **Record** — `parameters.associative` states, in the data, whether a dim re-derives or is a
  snapshot. A baked dim is indistinguishable from a live one on screen; that silence is precisely
  how the whole product became non-associative without anyone noticing.

## 3. Migration: regenerate, do not reverse-engineer

Saved projects contain baked auto-dims whose element identity was **destroyed** (random point-ref
UUIDs). Reconstructing which wall face a bare point "probably" meant is exactly the clever guess
this ticket exists to prevent.

- **Auto-generated dimensions are DERIVED, REGENERABLE artefacts** (one button today; a live intent
  under L-286). A baked auto-dim carries **no user intent worth preserving**. On load, a
  non-associative auto dim is **regenerated, not migrated**. Cheap, honest, converges to the truth.
- **Hand-placed dimensions DO carry user intent.** They must **never** be silently deleted. Where a
  baked hand-placed dim exists, it is **surfaced** (P8 span + user-visible count), and re-associated
  **only** where the anchor is unambiguous. Never guessed.

> **The founder must be told: existing auto-dimensions may regenerate on load.** This is stated here
> rather than buried in a commit body, because it is a visible change to a saved drawing.

## 4. Ctrl-Z when a model edit causes an annotation reconcile

**Decision: the reconcile is EXCLUDED from undo (`suppressUndo`) and RE-DERIVED after any undo.**

The drawing is a **pure function of the model**. If references are associative and the reconcile is
idempotent (L-265's `reconcileTagSet` is, by construction), then re-deriving after an undo is
*always* correct — and the user never spends an undo step on bookkeeping they did not ask for.

The alternative — folding the reconcile into the user's undo entry — is defensible, and it is what
L-265's *batch button* does (one button press = one undo entry, C16). But that is a **user-initiated
batch**, not a reflex to someone else's edit. Making every edit command fold in the annotation layer
would couple `wall.move` to the documentation layer **forever**, and every new element command would
have to remember to do it.

The two rules are therefore:

- **user asks for annotations** (auto-tag / auto-dimension button) → **one batch = one undo** (C16);
- **the model changes underneath them** (move a wall, delete a door) → the reconcile is a
  **re-derivation**, `suppressUndo`, and it re-runs after undo/redo like any other projection.

*Accepted as proposed by the coordinator; I found no evidence against it, and the associativity work
in this ADR is precisely what makes its precondition true.*

## 5. Guards (all in CI)

- an anchor maps to a live `StableReference`, or returns `null` — **never a guess**;
- **move the wall** → the reference resolves to the new point (asserted through the *real* resolver,
  not a mock); **slide the door** → its jamb references follow;
- a **point ref does not follow** (the bug, pinned as a test, so it cannot come back);
- an opening's `left`/`center`/`right` land on the **real jambs** (4.0 / 4.5 / 5.0 for a 1 m door at
  left-edge offset 4) — the L-180 regression;
- a **drag produces `{offset}` only** — `Object.keys(patch) === ['offset']`, no reference field
  exists; dragging *along* the measured axis moves the line **not at all**;
- a **tag drag** moves the bubble and leaves the leader anchor on the element.
