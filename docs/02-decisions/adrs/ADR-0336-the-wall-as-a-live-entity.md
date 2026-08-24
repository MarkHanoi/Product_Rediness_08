# ADR-0336 — The wall as a LIVE ENTITY: what a wall knows, what it does not, and the staged plan to close the gap

- **Status**: PROPOSED — stages 1–4 are NOT implemented. Stage 0 shipped 2026-08-24.
- **Date**: 2026-08-24
- **Lane**: WALLDEEP32
- **Founder's ask, verbatim**: *"review the wall element in great level of detail — **the wall needs
  to be a LIVE ENTITY AWARE OF ALL ELEMENTS AROUND IT**."* And, five reports later:
  *"maybe the algorithm priority is wrong really — because the first step always should be to
  **EXTEND** — instead of **CREATE**."*
- **Binds**: [C85 §10.7](../contracts/C85-ELEMENT-WALL.md) (W-M-1..W-M-12) ·
  [C84 EI-1 / EI-9](../contracts/C84-ELEMENT-INTEGRITY.md) · C83 §10 · C73 §2.2
- **Issue log**: L-10600 … L-10606

---

## 1. Why an ADR and not a fix

The founder asked for an architectural property, not a bug fix, and this document exists because
**the honest answer to his question is that a costed staged plan is worth more than a rushed
rewrite three days before production.** Four of the five defects he reported were closed in the
same session (see §5). The fifth — the property he actually named — is not one change.

---

## 2. ⭐ WHAT A WALL CURRENTLY KNOWS — measured, not asserted

A "live entity aware of everything around it" is, concretely, a question about which relationships
a wall can *read* at the moment it moves. Measured 2026-08-24:

| Relationship | Recorded where | Read on a wall MOVE? |
|---|---|---|
| **wall ↔ wall join** | `SemanticGraph` `joinedTo`, written per level by `WallRebuildCoordinator.writeJoinedToEdgesForLevel` | ✅ **YES** — `WallMoveReweldService` reads it and re-welds |
| **wall ↔ hosted opening** | `Wall.openings[]`, an owned array | ✅ **YES** — `CascadeWallBaselineCommand` re-bases every opening via `planOpeningRebase` |
| **wall ↔ slab edge** | `SlabSketch` `HostReferenceEdge.hostId` | ✅ **YES** — `SlabDependencyTracker` re-projects the slab polygon; `SlabWallConnectivityService` re-welds neighbours. ⛔ **The founder's belief that this is recorded-and-never-consumed is REFUTED** |
| **wall ↔ room** | `RoomDetectionEngine`'s local `WallGraph`, ids `wall_cN[_sM]` | ⚠ **RE-DERIVED**, never read as a relationship. The room is recomputed from scratch |
| **wall ↔ adjacency** | `TopologyLayer`, from scene bounds | ⚠ observational only — nothing acts on it |
| **wall ↔ its own CURVE** | `Wall.curve.control` | ⛔ **NO.** `MoveReweldPartner` has no `curve` field. The weld engine sees a chord |
| **wall ↔ level / storey** | `levelId` | ✅ yes |
| **wall ↔ column, beam, roof, stair, furniture** | — | ⛔ **NO relationship is recorded at all** |
| **wall ↔ its own topology findings** | nowhere durable | ⛔ **NO.** `auditWallTopology` writes a `console.warn` and nothing else |

### ⭐ The one-sentence answer to the founder

**A wall knows about its joins, its openings and the slabs that reference it — and it is blind to
its own curvature, to every non-slab element, and to the record of its own damage.** The gap he
felt is real, and it is *narrower and more specific* than "the wall knows nothing": three of the
nine axes are live and correct, and the failures he hit came from the **quality** of the reasoning
on the live axes, not from their absence.

---

## 3. ⛔ THE THREE STRUCTURAL FAULTS BEHIND HIS FIVE REPORTS

### 3.1 A curved wall is a CHORD to every reasoning engine that matters

`MoveReweldPartner` carries `baseLine` and nothing else. A curved wall therefore enters the weld
engine as **the straight line between its ends**. The wall the user sees leaves that endpoint along
its **tangent** — typically near-perpendicular to its neighbour, which is why the corner *looks*
square. The chord's angle is unrelated.

⭐ **This is how a perimeter made of ordinary square-looking corners contains an 8° junction**, and
it is why the founder's curve is entangled with a defect that is not about curves: at 8° the weld
engine's `1/sin θ` reach permitted a **14.14 m** follow from a **2 m** drag.

⚠ It also means a slab can never follow a curved edge at all: `SlabRegionTracer` sets
`hostId = isStraight && w.id ? w.id : null`, so **curvature is excluded at the mint site**. His
`curved=38` free edges were frozen by construction.

### 3.2 Three id vocabularies, three graphs, no reconciliation

| Graph | Vocabulary | A curved wall is |
|---|---|---|
| `joinedTo` (SemanticGraph) | real wall ids | **1 node** |
| Adjacency (`TopologyLayer`) | real element ids | **1 node** |
| Room detection (`RoomDetectionEngine`) | `wall_cN[_sM]` sub-segments | **N nodes** |

Nothing maps a `_cN` sub-segment back into `joinedTo`. `PlanarTopologyEngine.boundaryWallIds` leaks
raw sub-segment ids into `RoomDetectionEngine._polygonFromBoundaryWalls`, which looks them up in a
map keyed by **real** ids and silently drops every miss.

### 3.3 A repair channel that can only CREATE will always CREATE

`OpenedRegionDetector` proposes segments. It has no capability to EXTEND an existing wall, so the
ladder the founder named — **EXTEND → JOIN/TRIM → CREATE** — collapses to its third rung, and the
system reports success for having done the most destructive available thing.

---

## 4. ⭐ THE STAGED PLAN

Ordered by *(damage prevented) ÷ (risk of the change)*. Stage 0 is done; 1–4 are not.

### Stage 0 — BOUND THE DAMAGE ✅ SHIPPED 2026-08-24

Refuse what cannot be defended, and name what cannot be acted on. **No new capability, no
widening.** C85 W-M-1, W-M-2, W-M-3, W-M-5, W-M-8, W-M-9. See §5.

### Stage 1 — TEACH THE WELD ENGINE ABOUT CURVATURE  *(est. 3–5 days)*

Add the arc to `MoveReweldPartner` and reason about the **tangent at the welded endpoint**, not the
chord; re-fit or refuse `curve.control` when an arc endpoint moves (C85 W-M-6, W-M-7).

- **Why first:** it removes the *cause* of §3.1 rather than bounding its effect, and it is a pure
  addition to a pure module with a large existing fixture set.
- **Risk:** low — no store access, no new authority. Every existing straight-wall fixture is
  unaffected by construction (a straight wall's tangent IS its chord).
- **Exit:** the `ARC-2` and `D-c` fixtures in `WALLDEEP32DirectionInversion.measure.test.ts` weld at
  their true tangent angle instead of being refused by the gain bound.

### Stage 2 — THE REPAIR LADDER  *(est. 1–2 weeks)*

Make EXTEND a first-class repair, tried before CREATE, with the rungs attempted recorded on the
proposal (C85 W-M-12). Then reconsider W-M-4: whether a declared `joinedTo` edge the geometry
cannot corroborate should drive an extend attempt.

- **Why second:** it is the founder's own stated priority, and it is what stops a topology gap from
  becoming a corrupt element.
- ⛔ **Risk: HIGH, and this is why it is not stage 1.** W-M-4 moves walls on the strength of a graph
  edge, and `L936ReweldEmitterHonesty.test.ts` demonstrates the graph over-reports by design. This
  stage needs its own measurement pass before any widening.
- **Exit:** an opened region whose gap is reachable by extending one wall extends it, and the
  CREATE rung logs that rungs 1 and 2 were tried and why they were refused.

### Stage 3 — MAKE TOPOLOGY FINDINGS DURABLE  *(est. 1 week)*

A finding must survive reload — a field, a schema slot, or a re-derivation on load (C85 W-M-10).

- **Why:** the founder's model carries `13 finding(s) across 19 wall(s)` **and forgets them on
  every reload.** A corner that lies to the drawing and forgets it was reported is worse than one
  that merely lies. This also unblocks the unanswered question in C85 §10.7 — *what does an
  unrepaired junction cost IFC / DXF / quantities?* — which cannot be measured while the finding is
  transient.

### Stage 4 — ONE JOIN GRAPH  *(est. 3–4 weeks)*

Reconcile the three vocabularies of §3.2 behind one addressable identity, so a curved wall is one
entity with N addressable endpoints rather than one entity in two graphs and N in a third.

- ⛔ **NOT before production.** This is a foundational change with no bounded blast radius.

---

## 5. WHAT SHIPPED WITH THIS ADR (stage 0)

| # | Change | Founder report closed |
|---|---|---|
| L-10601 | `CORNER_FOLLOW_GAIN_EXCEEDED` — a follow is bounded at 3× the drag | #1 *"extended in the WRONG DIRECTION"* |
| L-10602 | `CORNER_RETRACTED_SUBJECT_DECLINED` — a corner only one wall reaches is retracted | #2 *"are the mitres still connected?"* |
| L-10600 | `PARTNER_ALREADY_WELDED_TO_NEW_SEGMENT` / `DECLARED_JOIN_NOT_FOUND_AT_EITHER_POSE` — one distance no longer answers a three-way question | #3, #5 (the misleading `2259/500` line) |
| L-10603 | `gap-not-anchored-at-both-ends` — a half-anchored repair is refused, not offered | #4 *"a random wall not connected to any other"* |
| L-10604 | the opened-region offer mints its own `wall.create` id | #4's silent replication failure |

## 6. ⚠ WHAT THIS ADR DOES NOT CLAIM

- It does **not** claim the founder's five reports share one root. Measured: **#1 and #2 are the
  weld engine's reach and its guards; #4 is the repair channel; #3 and #5 are a reporting failure
  over a state (`already followed`) that the repository's own L-945 fixture had already
  documented and mis-named.** The brief's hypothesis that *"any move larger than the weld tolerance
  loses the join"* is **REFUTED** by executed control — a 2.26 m move against a 500 mm tolerance
  welds both partners, because a stationary partner welded at the old corner is at distance ZERO
  from the pre-move segment however far the subject then travels.
- It does **not** claim the `§OPENED-REGION` offer auto-applies. `presentOpenedRegion` awaits
  `chatConfirm` and dispatches only on a truthy answer; an auto-accept was **not reproduced**.
- It does **not** measure what an unrepaired junction costs IFC / DXF / quantity take-off. That is
  named as an open question in C85 §10.7 and is blocked on stage 3.
