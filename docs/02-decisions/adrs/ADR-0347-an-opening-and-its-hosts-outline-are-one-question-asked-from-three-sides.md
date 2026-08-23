# ADR-0347 — An opening and its host's outline are ONE question, asked from three sides; the outline never edits the opening

- **Status:** Accepted
- **Date:** 2026-08-23
- **Lane:** OPEN38
- **Supersedes:** nothing. **Amends in place:** `C85` (§NOT MEASURED item 11 — the
  `hosted-openings` and `layered` rows), `C86` (§12 — R-17 … R-21), `C84`
  (§EI-9, §EI-2 — the wall and wall-opening rows).
  **Adds:** `wallProfileChains`, `wallProfileRectFit`, `profileOpeningRectOf`,
  `PROFILE_FIT_TOL_M` in `packages/geometry-wall/src/WallProfile.ts`;
  `OCC_OUTSIDE_HOST_PROFILE` in `WallOccupancyStore`; `outerRing` in
  `WallHoleBodyParams`; `openings`/`length`/`height` in `WallProfileBodyParams`;
  `'built-not-reachable'` in `WallProfileVariantStatus`.
- **Commits:** `a77a4c86` (the gate, alone), `27b9836a` (the geometry),
  `6d0390a7` (elevation + quantities)
- **Contracts:** **C84** (element integrity — EI-2, EI-3, EI-9, §6), **C85**
  (wall), **C86** (wall opening, §10.1), C11, C16 CA-18, C58 §1.13
  (refusal identity), C65 §3.9, C74 §2, C83 (spatial validity).
- **Issue-log:** L-7400 … L-7413, L-7480.
- **Builds on:** `§FEAT-WALL-PROFILE-CURVED` (L-1072) and `§RAKE-HOSTED-OPENING`
  (2026-08-18), both of which lifted a refusal whose stated mechanism was a
  description of absent code. This is the fourth in that sequence, and the first
  where the refusal also **named the order its own lifting had to happen in**.

---

## Context

A wall can carry an authored elevation outline (`wallProfile` — a gable, a stepped
top, a raked top). A wall can host doors and windows. Until this ADR it could not do
both: `profileAuthorability` refused the combination outright, in these words —

> *"wall.wallProfile is not supported on a wall that HOSTS DOORS OR WINDOWS: the
> opening-bearing body is built as a rectangle minus voids and assumes that outer
> rectangle, and the occupancy check that guards openings is purely horizontal — so
> nothing would notice an opening left floating in material the profile removed.
> Remove the openings first, or leave the profile unset."*

Both clauses were **true**, and both described **absent code** rather than an
impossibility. That is now a documented pattern in this family (C85 §NOT MEASURED
item 11 tabulates four instances), and the pattern's cost is that downstream readers
quote the user-facing **string**, not the module header — so a TODO in the grammar of
a law gets cited as evidence and the borrowers are wrong too.

## Decision

### 1. The fit question is asked ONCE and answered in ONE place

`wallProfileRectFit(ring, rect)` decides whether an opening's rectangle lies inside
the material a ring encloses. It is consulted by:

| Asker | The question it is really asking |
|---|---|
| `WallOccupancyStore.canPlace` | *may this opening go here?* |
| `profileAuthorability` | *may this ring be applied to this wall?* |
| `buildWallHoleBodyGeometry` | *can this solid be built?* |

These are **one question from three sides**. Answering them in three places is how a
gate and its geometry drift apart, which C84 EI-9 forbids and which
`PropertyDescriptorGenerator.ts:19-20` records the cost of.

### 2. The refusal names the edge and the metres — never a category

Not *"not supported on a wall that hosts openings"* but *"the outline falls to
1.600 m across this opening and the head is at 2.100 m — 0.500 m would be outside the
wall."* `overshootM` is on the result as well as in the sentence, so a caller can
offer a nudge without re-deriving it.

⛔ **It must never be "fixed" into a clamp.** A clamped opening ships a wall whose
model and drawing disagree while reporting success — indistinguishable, from the
author's side, from one that worked.

### 3. ⭐ THE OUTLINE NEVER EDITS THE OPENING. The EDIT refuses.

When an author drags a profile vertex **down through an existing window**, the
**outline edit is refused**, naming the window and the metres. The window is not
moved, not clipped, not deleted.

The alternative — relocate or trim the opening to suit the new ring — was considered
and rejected. It edits an element the author **did not select** in order to honour one
they **did**, which is C84 EI-2 (refuse, do not narrow) and the founder's standing
direction that a spatial conflict is always **asked**, never silently resolved.

⚠ This obligation is **bidirectional**, and that is the half most easily omitted: a
gate wired only into the create path lets an author reach the same bad state by doing
the two operations in the other order. `WallStore.addOpening` exists to close exactly
that trapdoor and consults the same gate.

### 4. A DOOR needs a level foot; a WINDOW does not

A door is **carved out of the outer boundary** — a notch, not a closed hole — which is
what gives it continuous reveals with no T-junction. So the boundary has to *be* where
the door's foot is. On a wall over an archway there is nothing at floor level to carve
and the walk would emit a jamb starting in mid-air; that refuses (`uneven-foot`). A
window in the same place is fine, because a `THREE.Path` hole is valid inside any
simple outline. **The asymmetry is structural, not stylistic.**

### 5. The gate lands BEFORE the feature, in its own commit

`canPlace` was 1-D and vertical-blind, and the refusal **named that** as the reason it
could not lift. So the vertical arm (`OCC_OUTSIDE_HOST_PROFILE`) shipped **alone** in
`a77a4c86` — reachable and correct, yet unreachable in practice, because the
authorability gate still refused every wall that could reach it. Only then did the
geometry and the refusal move.

⭐ **Generalise this:** a refusal that names its own precondition is telling you the
order to work in. Do not relax it in the same commit that satisfies it.

## Consequences

### What now works

**Draw a wall → Edit Profile → pull it into a gable or a stepped top → Apply → place
windows and doors in it.** That is the founder's request read literally, and it is
live. A raked profiled wall hosts openings too, with **no term written for it**: the
ring is authored in the un-sheared frame and `_applyRakeShearToChildren` leans the
built group, so profile × rake × openings composes by construction.

### What still refuses, and why

| | Reason | Kind |
|---|---|---|
| an opening outside the ring | measured, per-opening, with the metres | fixable by the author |
| a door on an uneven foot | the notch has no boundary to be carved from | fixable by the author |
| curve × outline × openings | two builders; the one that cuts openings never reads the ring, so the outline would be **silently discarded** | **NOT YET** — needs a per-station carve |
| MULTI-layer × outline | the V2 band slicer extrudes between two **horizontal** planes; there is no per-station top | **NOT YET** — a real structural gap |

⛔ The last one is **refused rather than approximated**. A legal drawing showing a
rectangle where the author cut a gable is the silently-wrong wall `WallRake.ts:102`
forbids. The **single-layer** case, which is what a "Plain Wall" actually is, ships.

### The status a table did not have

`WallProfileVariantStatus` gained **`'built-not-reachable'`**. The geometry is
measured end to end; the *editor's entry probe* still uses a synthetic triangle that an
ordinary window cannot fit under (L-7410, one line, in another lane's file). Calling
that `'unbuilt'` would be a lie about the geometry and `'available'` a lie about the
button — and this module's own rule is that an offered-but-unbuilt cell is worse than a
closed one.

⭐ The member earns its place because it names a **class** of defect in this repo —
*capability shipped, reachability not* — that a two-valued table cannot record. A cell
in that state is CLOSED, and its reason **owes the author a working order of
operations**, because there always is one. That obligation is asserted, not left to
convention.

### Instrument note, recorded because it cost the first design

`wallProfileExtentAt` — which already existed, and which C85's own *"Machinery"*
prediction named as the tool for this job — **is the wrong function**. It takes the
extreme of every crossing **at a station**, which is right for a sweep and wrong for an
opening: an opening occupies a **span**. At a step, a station query reports the high
side and admits a head that pokes out of the wall over half its width — and the number
a refusal must quote is not visible to it at all. The predicate is the ring's two
**chains**, evaluated segment by segment, with a vertical segment contributing **both**
its ends.
