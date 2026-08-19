# ADR-0335 — Snap references are level-scoped in THREE tiers: a datum is project-wide, another storey is SUBORDINATE, and an undeclared level is left alone

> **Status**: ACCEPTED · **Date**: 2026-08-19 · **Lane**: SNAP1
> **Supersedes**: nothing. **Extends**:
> [ADR-0112](ADR-0112-cross-level-slab-corner-snap-reference.md) — its level gate was correct for
> slabs and is left intact; this ADR generalises the idea it introduced from one provider to the
> whole pipeline, and rejects its *mechanism* (a hard filter) as the general rule.
> **Binding contracts**: [C06](../contracts/C06-UI-SHELL-AND-TOOLS.md) **§9** (added by this ADR —
> the normative statement), [C15](../contracts/C15-HOSTED-ELEMENT-CONTRACT.md) (a hosted opening's
> level IS its host wall's), [C73](../contracts/C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) §2
> (the tolerance bands this defect hid behind),
> [C19](../contracts/C19-SITE-MODEL-AND-PARCEL.md) (parcel/setback as reference geometry).
> **Issue**: [L-1108](../../04-reference/ISSUE-LOG.md) · **Prior**: L-31.

---

## Context — the measurement, not the impression

Founder, production, 2026-08-19: *"WHEN A USER IS CREATING AN ELEMENT NOT ON THE GROUND FLOOR, THE
REFERENCE POINTS (SUCH AS GRID A, WALL JOIN T, END POINT…) ALWAYS REFERENCE TO GROUND FLOOR."*

He also said it had probably been raised before. It had: **L-31**, closed FIXED via ADR-0112 on
2026-07-02. That work was real. It was also **one provider out of twelve.**

### What was actually measured (2026-08-19)

`SnapManager` fans candidate generation out to **twelve** `ISnapProvider`s. **Exactly one read a
level id** — `SlabSnapProvider`, taught to by ADR-0112. Wall, wall-join, curtain-wall, door, window,
column, beam, stair, furniture, grid and site-context had **no concept of a storey**.

Yet cross-level snapping was intermittent rather than constant, which is why this survived. Three
unrelated accidents were standing in for a level filter:

1. **Fine tests that happened to be 3-D.** `queryPoint.distanceTo(segment.start)` includes the
   elevation gap. At a 3 m storey against a tolerance clamped to `MAX_WORLD_TOLERANCE_M = 1.0 m`,
   another floor's endpoint falls out. That is **arithmetic, not a rule**: it holds at 3 m and fails
   at a mezzanine.
2. **Broad phases that happened to be bounded** — `radius × 2`. Except `WallJoinSnapProvider`'s,
   which is `cursor-to-start-distance × 1.2` and therefore **unbounded**: every wall in the building
   enters it once the drawn segment exceeds the storey height. That is why the founder named
   **WALL JOIN T** first.
3. **Providers that overwrite the candidate's Y with the cursor's** (`hitPoint.y = queryPoint.y`),
   which launders a ground-floor reference into one indistinguishable from an active-level one.

### The deeper root — a condition that could never be true

`GeometryUtils.pointToLineDistance2D` projected in XZ, then set `closestPoint.y = 0` and measured in
**full 3-D**: `sqrt(dxz² + point.y²)`, against a point pinned to the world origin plane. Compared to
a ≤ 1 m tolerance, `distance <= radius` is **UNSATISFIABLE at any storey elevation above ~1 m**.

Consequence: on every floor above the ground, wall **CENTERLINE / EDGE / FACE** and curtain-wall
**CENTERLINE / EDGE** never fired at all. `lineLineIntersection2D` (hard-coded `y: 0`) killed
**INTERSECTION** identically. Five families were not mis-ranked; they were **absent**. On the ground
floor `point.y = 0` makes the two forms bit-identical — which is why it shipped, and why correcting
it cannot regress the ground floor.

Separately, `SnapVisualizer.show()` set `position.y = 0.1` **unconditionally**, drawing every snap
indicator on the world origin plane whatever storey the user was on — the most literal possible
reading of the founder's sentence, in one line.

---

## Decision

### D1 — Level scope is a property of the CANDIDATE, declared by the provider

`SnapCandidate` carries `levelId` and `levelScope`. A provider that knows the storey of the element
it read says so. It does **not** decide what to do about it.

### D2 — There are THREE scopes, not two, and a fourth "silence" value

| scope | members | rule |
|---|---|---|
| **DATUM** | `GRID`, `GRID_LINE`, `GRID_INTERSECTION`, the parcel boundary and the buildable-envelope setback line | **project-wide by design.** Offered on every storey at full priority. Never demoted. Never filtered — not even by the hard-filter opt-out. |
| **ACTIVE** | an element on the storey being drawn on | full priority — primary |
| **OTHER** | an element on a different storey | **offered, SUBORDINATE.** Priority demoted by `OTHER_LEVEL_DEMOTION = 1000`, tagged `metadata.crossLevel`, drawn muted, labelled with its storey. |
| **UNKNOWN** | a candidate whose provider declares no `levelId`, or when no active level is known | **left alone.** Never inferred from `point.y`. |

**Why UNKNOWN must be leave-alone, not a guess:** a column's TOP vertex on Level 0 sits at y = 3.0.
Inferring level from elevation would file it under Level 1. L-1087 already measured that level
handling is inconsistent across this codebase; a policy that guesses would inherit every one of
those inconsistencies as a silent mis-scope. Declaring `levelId` is what opts a provider in.

### D3 — The policy is APPLIED in exactly one place

`SnapManager.rankCandidates()`. Providers classify; the manager ranks. Twelve providers cannot
answer *"is this on my floor?"* twelve ways.

### D4 — SUBORDINATE, not filtered

**This is the load-bearing choice.** A hard filter would close the founder's bug by deleting the
capability ADR-0112 exists to provide: aligning a Level-1 wall to the Level-0 wall below is a
deliberate BIM gesture, performed constantly.

The demotion is **1000**, against a priority band that tops out at 200 + 10 proximity bonus = 210.
An other-storey candidate therefore **cannot outrank any active-storey candidate or any datum**,
however much closer to the cursor it is — but it still wins when it is the only thing in range,
which is exactly the align-to-the-floor-below case.

`setCrossLevelReferences(false)` provides the hard filter for callers that genuinely want a
single-storey world. It is **off by default**, and it still cannot drop a datum.

### D5 — The subordinate candidate must be LEGIBLE

The reported defect was not that a ground-floor reference existed. It was that it won **silently**,
looking identical to a real one. A demotion alone would only make that rarer. So the candidate is
also tagged, muted in colour, and labelled `Endpoint · level L0`.

### D6 — Grids are project-wide, and that must not be "fixed"

A structural grid is a **datum**: grid A is grid A on every storey. Grid bubbles appearing while
drawing on Level 1 are **CORRECT**. Conflating that with a Level-0 wall endpoint winning on Level 1
would have broken grids in the name of fixing this bug. The two cases have different right answers
and are now separated by type, and pinned by test.

### D7 — Parcel boundary and setback line STAY on every storey

Explicitly decided rather than inherited. They are ground-referenced geometry, so "drop them above
Level 0" was a live option. **Rejected:** a setback constrains a third-floor balcony exactly as it
constrains the ground floor — arguably more, since overhangs are where it is breached — and §L-432
added them precisely so compliance-by-construction would hold on the *manual* authoring path. A
setback that vanished above the ground floor would still read as enforced while enforcing nothing.

### D8 — The active-storey source is an ACCESSOR, installed in the constructor

Read on every `snap()` so a level switch takes effect on the next pointer-move with no
re-registration. Installed in the **constructor**, not the factory, because `CurtainWallTool` builds
its manager with `new SnapManager()` and never calls `createWithDefaults()`. The policy must not
depend on which constructor a tool happened to call.

The default reads `window.projectContext.activeLevelId` — the same guarded lazy-global seam
ADR-0112 established and that `gatherCandidates()` already used, because `@pryzm/snapping` sits
below the layer that owns `ProjectContext`. It is one function, so the day panes acquire independent
active levels (L-1107: *"the view is PLURAL"*) there is exactly one thing to change.

### D9 — The plan helpers are corrected to mean what they are named

`pointToLineDistance2D` measures in XZ and reports the closest point on the **caller's** plane.
`lineLineIntersection2D` reports on the plane of the lines that produced it. Ground-floor output is
unchanged bit-for-bit.

---

## Consequences

- Drawing on an upper storey, an active-level reference always beats a lower-storey one; the
  lower-storey one remains reachable, visibly marked as such.
- **Five snap families come back to life above Level 0** — they had been dead, not merely
  mis-ranked. Users on upper floors will see MORE snapping than before, which is the correct
  behaviour and should not be mistaken for a regression.
- `BeamTool`, which returns the snapped point verbatim without re-stamping the elevation, stops
  placing grid-snapped beams on the ground floor.
- Snap indicators render on the storey being drawn on.
- Any new provider that omits `levelId` degrades to UNKNOWN — the old behaviour — rather than
  mis-scoping. The register of which providers declare it is C06 §9.4.

## Alternatives rejected

- **Hard filter to the active level.** Rejected by D4: it deletes ADR-0112's capability. It survives
  as an explicit opt-out, not as the default.
- **Infer the level from `point.y`.** Rejected by D2: a column top on Level 0 is not a Level-1
  reference, and openings/joins deliberately rewrite Y.
- **Filter grids by level.** Rejected by D6 — it would break a correct behaviour.
- **Fix `WallJoinSnapProvider` alone.** It is the loudest leak, not the root. Fixing it would have
  left ten level-blind providers and the unsatisfiable-distance defect in place.
- **Bound `WallJoinSnapProvider`'s broad phase in Y.** Tempting and cheap, but it re-encodes level
  scoping as arithmetic — the exact failure mode being removed.

## Not decided here

- **Level BANDS.** "Other storey" is binary. Revit ranks the floor immediately below above one six
  floors away. Deferred; the classifier is the one place to extend.
- **`PlanSnapEngine`** (`packages/core-app-model/src/views/PlanSnapEngine.ts`, 562 lines, **zero**
  occurrences of `level`/`elevation`). It is level-scoped only as a *consequence* of snapping to a
  `TechnicalDrawing` that `EdgeProjectorService.resolveClipRange()` clips to
  `[levelElevation, levelElevation + farOffset]`. Real, but undeclared, and it belongs to the
  plan-view lane. Named so it is not assumed covered.
- **Per-pane active level.** Single global today; D8 names the seam.

## Verification

`packages/snapping/__tests__/levelScopedSnapping.test.ts` — 18 cases against the real `SnapManager`
and the real providers (only the stores are fakes, and those are data). Package suite 67/67.
Reachability is evidenced in the live console, not by the test:

```
[SnapManager] §SNAP-LEVEL-SCOPE (L-1108) active level "L1" — N other-storey snap candidate(s) demoted by 1000 …
```
