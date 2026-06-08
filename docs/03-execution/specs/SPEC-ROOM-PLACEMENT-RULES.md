# SPEC — Room-Placement Rules (Residential)

**Status:** DRAFT v1.0 · 2026-06-08
**Owner:** layout engine (`packages/ai-host`) + executor (`apps/editor/src/ui/house-layout`)
**Scope:** the conceptual rules that decide **where each room goes, how rooms connect,
and what every room must contain** in a generated single-family house / apartment.

> This document is **only** about room placement — the *composition logic* that arranges
> rooms into a coherent plan. It is the spec the generator must satisfy. It does **not**
> cover wall-join geometry, rendering, or the GIS/site pipeline.

## 0. Why this document exists

The per-room database already exists and is rich:
[`packages/ai-host/src/workflows/apartmentLayout/rules/programRules.ts`](../../../packages/ai-host/src/workflows/apartmentLayout/rules/programRules.ts)
(governed by [SPEC-ARCHITECTURAL-PROGRAM-RULES.md](SPEC-ARCHITECTURAL-PROGRAM-RULES.md)).
It encodes, per room type: privacy class, area minima/weights, the door-permission matrix
(`accessFrom`), door caps (`maxDoors`), door-width floors, window mandates, adjacency
preferences, and the furniture program.

**The problem is not the per-room data — it is the COMPOSITION.** Test results
(2026-06-08) show plans where:

- a single 90 m² space is labelled **"Living Room / Bedroom 1"** — two rooms that must
  never merge are one room (an open-plan-ineligible pair was not separated by a sealed wall);
- a space is labelled **"Bathroom / Entrance Hall"** — the entrance lobby merged into a wet
  room, which the rules explicitly forbid (`hall.accessFrom = ['living','corridor']`);
- **no entrance door** exists (the front door was requested on a shell wall already occupied
  by a window → `Opening overlaps existing opening` → skipped);
- a generic **"Room 00-006"** appears with no clear program role.

So the realized geometry **violates rules that the database already states**. This spec
makes the *placement* rules explicit, states the **distance/proximity** rule that does **not
yet exist**, and audits exactly where the engine diverges so each gap is a tracked work item.

---

## 1. The organising principle — the privacy gradient

A house is organised as a **depth gradient from the entrance**, in four zones:

| Zone | Rooms | Role |
|---|---|---|
| **Public / social** | living, kitchen, dining | shallow — close to the entrance, daylit, may be open-plan among themselves |
| **Circulation** | hall, corridor | the connective tissue; the hall is the pivot, the corridor is the private-zone spine |
| **Private** | master, bedroom, study | deep — buffered from the entrance by circulation; sleeping/work |
| **Service / wet** | bathroom, ensuite, wc, utility | reached off circulation (or, for ensuite, off the master) |

**Placement rule P1 — depth ordering.** Walking in from the front door, the sequence is
`entrance → social → (corridor) → private`. A private room must **never** be shallower than
(in front of) the social cluster, and a bedroom must **never** be the first room you meet
through the front door.

**Placement rule P2 — open-plan is social-only.** Only the living/kitchen/dining cluster may
share a wall-less open threshold. Any wall between an open-plan-eligible room and a
non-eligible room (or between two non-eligible rooms) is **never** suppressed. This is the
hard guarantee against the "one big blob labelled Living / Bedroom / Corridor" defect.
→ already coded: `isOpenPlanEligible()` (living/kitchen/dining only). The realized geometry
must honour it (see §8 gap G1: it currently fails because *walls don't close*, not because
the rule is wrong).

---

## 2. The entrance sequence (the rule the test most visibly broke)

The front (perimeter) door lands in the **entrance hall**. The hall is a **clean lobby** that
forks two ways:

```
          ┌─→ SOCIAL:  living  (→ kitchen / dining, open-plan)
front door ─→ HALL ─┤
          └─→ PRIVATE: corridor (→ bedrooms, bathroom, wc, utility)
```

**Placement rule P3 — hall connectivity (HARD).** The entrance hall connects **only** to:
- the **living room**, and/or
- a **corridor**, and/or
- (permitted, see note) a **dining room** or **WC** ("cloakroom by the front door").

The hall **must never** open **directly** to a **bedroom**, a **bathroom/ensuite**, or a
**kitchen**. You reach a bedroom via `hall → corridor → bedroom`; you reach the kitchen via
`hall → living/dining → kitchen`.

> Founder's note, 2026-06-08: *"The entrance hall should connect always to the living room
> and/or kitchen and/or corridor and/or dining room. Never directly to a bedroom or to a
> kitchen."* The phrasing lists kitchen on both sides. This spec resolves it the
> architecturally-standard way: **kitchen is reached via the social cluster, not straight off
> the lobby** — so the hard rule is *hall never opens directly onto kitchen, bedroom, or a wet
> room*. If the founder wants a direct hall→kitchen permitted, change `hall.accessFrom` to add
> `kitchen` and update this clause. (Currently `hall.accessFrom = ['living','corridor']`.)

**Placement rule P4 — the entrance door must exist and be reachable.** Exactly one front door,
on a perimeter (shell) wall, opening into the hall. It must:
- land on a shell-wall segment that **fronts the hall room** (already coded: §HALL-NO-ENTRANCE
  `wallBoundsRoom`), and
- **not collide** with a window already placed on that shell wall (see §8 gap G4 — this is the
  concrete cause of "no entrance door" in the test: the door overlapped a shell window and was
  skipped). The entrance door must be reserved on the shell **before** shell windows are placed,
  or shell windows must yield the door's span.

---

## 3. Connectivity rules (the door-permission matrix)

A door between two rooms is legal **iff** one lists the other in `accessFrom` (symmetric).
Restated for placement:

| Room | A door may connect it to | Never to |
|---|---|---|
| living | hall, corridor, kitchen, dining | bedroom*, bath/wet |
| kitchen | corridor, living, dining, utility | **hall (direct)**, bedroom, bath |
| dining | corridor, living, kitchen | bedroom, bath |
| hall | living, corridor | bedroom, kitchen, bath/wc-as-only-route |
| corridor | hall + every private/service room | (it is the spine — broadly connective) |
| master | corridor, living, dining, **ensuite** | hall, another bedroom |
| bedroom | corridor, living, dining | hall, another bedroom, bath (direct) |
| bathroom | corridor **only** | hall, bedroom (that's an ensuite), kitchen |
| ensuite | master **only** | corridor, hall |
| wc | corridor, hall | bedroom, kitchen, living, dining |
| utility | corridor, kitchen | bedroom, bath |

\* a bedroom may open onto living/dining only in loft/studio layouts; off the corridor is canonical.

→ all of the above is already coded in `accessFrom`. **The realized geometry must not create a
door, OR a wall-less merge, that violates it.** The test's "Bathroom / Entrance Hall" merge is
a violation produced by a *wall that failed to close*, not by an illegal door — but the result
is the same prohibited adjacency, so the wall-closing fix (§8 G1) is part of *enforcing this rule*.

---

## 4. Door rules

**D1 — every room has at least one door.** No sealed room. Already enforced by
`§SEALED-ROOMS` + `§CIRCULATION-REROUTE` in `wallsAndDoors.ts`. A room the subdivision leaves
with no legal host wall must trigger a re-route, not ship sealed.

**D2 — normally at most two doors per room.** Door caps (`maxDoors`): bedroom 1, study 1,
bathroom 1, ensuite 1, wc 1, utility 1; master 2 (circulation + ensuite); living/kitchen/
dining/hall/corridor uncapped (they are connective). A room exceeding its cap is a placement
error — prefer fewer, well-placed openings.

**D3 — minimum clear width per room.** Habitable/service 0.80 m, entrance 0.90 m, wet rooms
0.70 m (Part M). A wall too short to host the floor width is a wall the room must **not** door
onto — pick a longer wall; never shrink the door below its floor. Already coded
(`MIN_DOOR_WIDTH_BY_TYPE`, `minDoorWidthBetween`). The test logged
`Opening … extends beyond wall length 0.977 m` — a door requested on a wall shorter than the
door — which is exactly the D3 violation: the host-wall selection must reject sub-floor walls.

---

## 5. Proximity / distance rules — **NEW (does not exist yet)**

Founder, 2026-06-08: *"We need to calculate the distance from the hall to key areas — like the
kitchen and living, dining room — and should not be too much."*

There is currently **no** distance metric in the engine. Define one:

**D-PROX — entrance-to-core walking distance.** For the realized plan, compute the
**topological walking distance** (sum of room-to-room centroid hops along the *door graph*, not
straight-line) from the hall to each of: living, kitchen, dining.

| Path | Target (soft) | Hard ceiling |
|---|---|---|
| hall → living | ≤ 1 hop, ≤ 6 m | ≤ 2 hops |
| hall → kitchen | ≤ 2 hops, ≤ 10 m | ≤ 3 hops |
| hall → dining | ≤ 2 hops, ≤ 10 m | ≤ 3 hops |
| hall → any bedroom | ≥ 1 corridor hop (privacy buffer — *farther is better here*) | — |

- **Soft** targets feed a new scoring axis (`entranceProximity`) so a plan that puts the living
  room straight off the hall scores higher than one that buries it behind three rooms.
- **Hard** ceilings are a validation reject: a kitchen 4 door-hops from the entrance is a failed
  layout.
- Note the **inverse** for bedrooms: distance from the entrance is *desirable* (privacy) — the
  metric rewards a corridor buffer, not penalises it.

Implementation sketch: build the door graph after `wallsAndDoors`, BFS from the hall node,
emit `{room → hops, metres}`; add the `entranceProximity` axis to `objectives.ts` and the hard
ceiling to `validateCirculationSequence.ts`.

---

## 6. Window rules

**W1 — every habitable room has at least one window.** Habitable = living, kitchen, dining,
master, bedroom, study. `windowMandatory: true` currently set for living, kitchen, master,
bedroom; **dining and study are `false`** and should be reconsidered (a dining room with no
daylight is poor). A layout where a `windowMandatory` room has no window is **rejected**.

**W2 — wet/service rooms: window preferred, not mandatory.** bathroom, ensuite, wc, utility —
daylight desirable (obscure-glazed, raised sill) but a fully-interior one is legal as a
last-resort (soft frontage penalty only). → coded as `frontage: 'preferred'` + A.21.D55.

**W3 — windows live on perimeter (shell) walls only**, never on an interior partition. Window
emission must target shell-fronting walls, and must **not** collide with the entrance door
(see §2 P4 / §8 G4).

**W4 — a room that needs a window must touch the perimeter.** Frontage allocation: every
`frontage: 'required'` room (living, kitchen, master, bedroom) must be placed with at least one
wall on the external shell. A bedroom with no shell wall is a failed placement (it can't get its
mandatory window). This couples placement (§1 depth) with the window rule.

---

## 7. The placement pipeline (how the rules are applied, in order)

1. **Program resolution** — choose the room set from the brief (bedroom count → +bathrooms,
   +kitchen, +living, +hall, +corridor, optional dining/study/wc/utility).
2. **Zoning** — split the shell into a **public band** (entrance-facing) and a **private band**
   (deep), with the **corridor** as the spine between them (`tryCarveCorridor` / single-rect carve).
3. **Bubble graph** — area-weighted sizing + required adjacencies (`buildBubbleGraph`), honouring
   area minima/fractions and adjacency preferences.
4. **Spatial allocation** — squarify each zone into room rectangles; **frontage allocation** pulls
   `frontage: required` rooms onto the shell (§6 W4); master-surplus, ensuite-from-master carve.
5. **Circulation spine** — the corridor must physically span **every** private room it serves
   (the §EVERY-ROOM-ACCESS invariant) so each bedroom/bath shares a wall with it.
6. **Opening emission** — doors (honouring §3 matrix, §4 caps/widths), then **entrance door on the
   shell into the hall** (§2 P4), then **shell windows** on remaining perimeter span (§6 W3), with
   the entrance door reserved first so they never collide (§8 G4).
7. **Validation** — run the gates in §8 over the realized plan; reject hard failures, score soft.

---

## 8. Current-state audit & gaps (what to fix, in priority order)

| ID | Gap | Symptom in 2026-06-08 test | Where | Status |
|---|---|---|---|---|
| **G1** | Interior walls don't fully close → open-plan-ineligible rooms merge | "Living Room / Bedroom 1" (90 m²); "Bathroom / Entrance Hall" | `WallJoinResolver` consensus-trim; partition-to-shell weld | **partially fixed** v66 §CONSENSUS-PROXIMITY-GUARD (merges reduced; residual `trimmed=3` + upper-floor `§WJR-INVALID self-cluster` remain) |
| **G2** | Entrance sequence not realized | hall merged into bathroom; no clean lobby | follows from G1 + no explicit hall-first placement | open — needs §2 enforced post-detect |
| **G3** | Entrance hall placement not pinned to the social fork | hall ends up adjacent to wrong rooms | zoning step §7.2 | open |
| **G4** | Entrance door collides with shell window → skipped | "no entrance door"; `Opening overlaps existing opening` | opening emission order §7.6 | open — **high (demo-visible)**: reserve door span before shell windows |
| **G5** | Door requested on too-short wall | `Opening … extends beyond wall length 0.977 m` | host-wall selection §4 D3 | open — reject sub-floor host walls |
| **G6** | No entrance→core distance metric | (rule absent) | §5 D-PROX | open — **new** axis + hard ceiling |
| **G7** | Dining/study windows not mandatory | rooms can ship dark | §6 W1 | open — flip `windowMandatory` after review |
| **G8** | Stair still slightly outside shell on some plates | stair proud of perimeter | `stairCore` L/U overrun (I-run fixed v66 §STAIR-RUN-BOUND) | open — extend run-bound to L/U |
| **G9** | Generic unnamed room ("Room 00-006") | room had no resolved program role | room naming / program assignment | open — every detected room must map to a program role |

**Hard validation gates (reject the layout):**
- any `windowMandatory` room without a window (W1);
- any illegal door or prohibited merge (§3 / P2 / P3);
- any sealed room (D1);
- hall opening directly to bedroom / kitchen / wet room (P3);
- hall→kitchen or hall→dining over the §5 hard hop ceiling (D-PROX);
- a `frontage: required` room with no shell wall (W4);
- the entrance door missing (P4).

**Soft scoring axes (rank legal layouts):** adjacency preference, `entranceProximity` (NEW),
frontage quality, acoustic zoning, corridor compactness, daylight.

---

## 9. Acceptance criteria (a "good" plan)

1. One front door on the shell, into a distinct hall. ✔ P4
2. Hall forks to living (social) and corridor (private); never opens onto a bedroom/kitchen/wet
   room. ✔ P3
3. Every room is a **distinct** detected room (no "A / B" merged labels). ✔ P2 + G1
4. Every room has 1–2 doors, all legal, all ≥ the width floor. ✔ D1–D3
5. Every habitable room has a window on a shell wall. ✔ W1/W3/W4
6. Living/kitchen/dining are shallow (near the entrance); bedrooms are deep (behind a corridor).
   ✔ P1
7. hall→living ≤ ~6 m, hall→kitchen/dining ≤ ~10 m; bedrooms buffered by a corridor hop. ✔ D-PROX
8. The stair sits fully inside the shell. ✔ G8

---

## 10. Relationship to other specs

- [SPEC-ARCHITECTURAL-PROGRAM-RULES.md](SPEC-ARCHITECTURAL-PROGRAM-RULES.md) — the per-room
  database (privacy, minima, `accessFrom`, door caps, furniture). **This spec composes those rooms.**
- APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK — the dimensional/topology
  validators (G-classes, A-classes) that the §8 gates draw on.
- APARTMENT-COGNITION-STACK — the longer-horizon spatial-intelligence roadmap; the D-PROX metric
  and entrance-sequence enforcement are concrete Phase-2 ("spatial intelligence") deliverables.
