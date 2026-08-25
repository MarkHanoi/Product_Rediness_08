# ADR-0372 — A small plate is a LANDING building, not a corridor one — the single-core landing typology, selected by measurement

- **Status:** ACCEPTED (decisions 1–4) · OPEN (the §5 decisions, named)
- **Date:** 2026-08-25
- **Lane:** SMALLPLATE68 · **Issue:** [L-11190..L-11199](../../04-reference/ISSUE-LOG.md)
- **Governed by:** `C53` (generative engine) · `C50 §1.7` (soft-fail, never throw) · `C74` (name what
  you measured) · `C106` (the boundary line is the plate) · `C11` + `C16` + P6 (the executor builds
  through the bus — untouched) · `C73` (determinism)
- **Prior art re-used, not re-derived:** [ADR-0075](ADR-0075-resi-corner-preserving-perimeter-fill.md)
  (corner units), [ADR-0081](ADR-0081-resi-rectilinear-rect-decomposition-l-plate.md) (L plates),
  `§RESI-NARROW-PLATE-SIDE-CORE` (the side-core fallback: "the missing piece was an alternative
  ARRANGEMENT, not a smaller number")
- **Code:** `packages/ai-host/src/workflows/residentialBuilding/singleCoreLanding.ts` (new) ·
  `residentialBuildingOrchestrator.ts` (`_orchestrate` ladder, `'corner'` mode) ·
  `platePartition.ts` (`strategy`, `stranded`, L-11191)

---

## 1. Context — the refusal, and what the plate actually is

The founder drew a ~13 × 16 m boundary line and got, verbatim (production, 2026-08-25):

> `[resi-building] controller: rejected — level 1 partition placed zero apartments on a 13.1753 m ×
> 16.0623 m plate (core/corridor leave no usable band runs (placed 0/6))`

The plate is EXACTLY the building in his reference photograph — a Barcelona corner block: one
compact stair/lift core against the party walls, one or two apartments per floor whose front doors
open straight off the landing. **No corridor.** The generator knew one circulation typology — a
core + a public corridor band + apartment band runs (`platePartition.ts`) — and on that plate it
measured its own runs at 8.5 m against an 8.55 m minimum and refused. The refusal was honest by its
own rules. The gap was a missing typology.

**Measured before any change** (`orchestrateResidentialBuilding`, the onboarding defaults 60–100 m²,
T2 + T3, 6 × 4 core, 1.5 m corridor):

| plate | result |
|---|---|
| 13.1753 × 16.0623 m, axis-aligned rectangle | **did not refuse** — ONE 187 m² "apartment": the whole floor absorbed as a single residual polygon around a 4.68 × 2.6 m side core; corridor 12 m²; `coreReached 0/1`; 87 m² over the user's maximum |
| the same rectangle rotated 27° (what a drawn boundary line is) | **refused** — `core is not contained in the footprint` (L-11191: `round4` core vs un-rounded bbox, tolerance 1e-6) |
| a hand-drawn quad of the same size | **refused** — same |
| 20 × 25 m (the founder's other run) | 4 cells × 84 m² per floor, fill 0.6973, corridor 71.85 m², core `{8.5,9.345}-{11.5,15.655}` — × 7 floors = the 28 apartments he reported |

Neither of the first two results is the building he photographed. The refusal is the honest one of
the two; the 187 m² "success" is worse, because nothing said it was wrong.

---

## 2. Decision 1 — a SECOND pure planner, returning the SAME result shape

**ACCEPTED.** `singleCoreLanding.ts` is a second partition planner beside `platePartition.ts`, not a
branch inside it. It returns `PlatePartitionResult` unchanged in shape: the landing rides in
`publicCorridor`, every cell is an axis-aligned rect carrying `doorEdge`, `coreDoorOffset`,
`coreDoorWidth`, `coreReachable`, `polygon` — so the orchestrator's per-cell D-TGL run, the
executor (`_buildCellPerimeter`, `_createCore`, `_buildCorePerimeter`, `_collectCorridorBoundaries`),
the preview graph and the honesty card consume it without a new code path. Nothing was forked.

The geometry, in the frame where the plate's long axis is Z (the executor's core has its lobby/fire
door on −Z and its solid back wall on +Z, so this is the only orientation a rear core can face a
landing in):

```
z1 ┌──────┬────────────────────┐
   │ CORE │   REAR cell (B)    │   B's door: its x0 edge, on the landing's x1 face
   │ 4.28 ├────────────────────┤
   │×6.31 │                    │
   ├──────┤ ← landing z1 = core.z0
   │LANDG.│                    │   landing = [core.x0, core.x1] × [zA, core.z0]
   ├──────┴────────────────────┤ ← zA
   │     FRONT cell (A)        │   A's door: its z1 edge, on the landing's z0 face
   │  full width, 3 façades    │
z0 └───────────────────────────┘
   x0                          x1
```

Two arrangements are tried — `front-rear` (above) and `side-pocket` (one full-depth cell beside the
core column + the pocket in front of the landing). The landing depth is the ONE free parameter,
scanned upward from the core's own approach clearance (`APPROACH_CLEAR_M` = 1.2 m) by ≤ 2 m; deeper
is a hall, which this typology does not have. Every cell touches ≥ 1 plate edge — the daylight rule.

**Rejected alternative — an L-shaped single apartment wrapping the core column.** It is the honest
N = 1 answer and the D-TGL engine can lay out a polygon cell, but every downstream consumer keys the
front door on a bbox edge (`cellDoorOnConnectedCorridor`, `computeCoreDoorPlacement`, the executor's
`_buildPolygonCellPerimeter` "door side of the bbox"). Loosening that invariant is a separate lane
(L-11197); this one strands the bay and SAYS so (§4).

---

## 3. Decision 2 — selected by MEASUREMENT, never by a plate-size threshold

**ACCEPTED.** The ladder in `_orchestrate` is centred → side → `'corner'`. The landing typology is
planned only after the corridor typology has measured itself unable to do a corridor's job on some
upper level — it refused on capacity; it placed fewer than two cells (the founder's 187 m² blob is
one cell); or a cell it placed overlaps the core or a circulation band (L-11192). Then the two
results are compared by `preferByMeasurement`, in strict order: clean geometry → apartments that
actually laid out (the per-cell engine has run) → cells → placed area − λ·circulation (λ = 1, the
corridor-economy charge). **Ties keep the corridor result.**

Consequences that were verified rather than hoped:

- every plate the corridor typology double-loads cleanly is byte-identical — the
  `residentialNarrowPlate` R-CENTRE sweep (16.5 × 16.5 … 20 × 33.7 m) and the 20 × 25 m run above
  (28 apartments, same fill, same corridor area, same core) are pinned;
- on the founder's rectangle the corridor result is 1 cell → the landing's 2 win by count;
- on the founder's plate rotated 27° the side path (once L-11191 let it run) minted two rect cells
  over the core → the landing's clean pair wins on geometry;
- 12 × 12.5 m keeps its side-core single-loaded unit (1 vs 1 cell, the corridor's is larger).

**Why not a width or area threshold.** `§RESI-NARROW-PLATE-SIDE-CORE` already recorded that there is
no plot-area gate in this engine and that its width floor (`MIN_PLATE_WIDTH_M` = 11.1 m) is DERIVED
for one arrangement. A second arrangement invalidates that floor as an absolute (11 × 20 m now
builds one apartment off a landing — L-11195) without changing it as a corridor fact. The only
honest switch is the corridor typology's own measured output.

**Rejected alternative — plan the landing inside `platePartition._partition` at the
`placements.length === 0` site.** The core is an INPUT to that partitioner (the orchestrator sizes
and places it); the landing typology needs a different core (compact, rear corner). The seam that
owns the core is the orchestrator's strategy ladder — the same seam the side-core fallback lives at.

---

## 4. Decisions 3 & 4 — the compact core; honesty about what was not placed

**ACCEPTED.** The `'corner'` mode builds the clearance-derived functional minimum core
(`deriveCoreSizing`: 4.28 × 6.31 m at a 4.5 m ground storey) — never the modal's 6 × 4 default and
never `effectiveCoreSize`'s run-preserving shrink below the minimum. On a small plate every m² the
core does not need belongs to an apartment, and a core that cannot hold its stair is not a core.
The local frame is turned a quarter turn when the principal axis put the long side on X; the same
rigid transform carries it back. On a hand-drawn quad whose bbox corner falls outside the slanted
edge, the plate is narrowed to the largest axis-aligned rectangle inside the drawn line (the
`§RESI-CORE-IN-BOUNDARY` decomposition) so nothing sits outside the boundary. `computeGroundFloor`
never hosts the entrance on a façade the core is flush to (the lobby would be zero-deep and the front
door would open into the core's back wall).

**ACCEPTED.** N ∈ {1, 2} is not chosen — it falls out of the corridor partitioner's OWN feasibility
numbers (`ENGINE_MIN_ROW_DEPTH_M` 7.5 m, `MAX_RECT_ASPECT` 3.5 : 1, the per-depth engine width
calibration, the user's stated minimum). A bay no cell can take is returned as `stranded` with its
width, depth, area and the measured reason, threaded to the preview card ("On each apartment floor
the rear bay 6.72 × 7.51 m (50 m²) is left unassigned: short side 6.72 m is under the 7.5 m engine
floor"). A refusal quotes BOTH arrangements' cells with their verdicts, and the orchestrator's
composed refusal names both typologies (C74). The typology is named on the result
(`circulationTypology`) and on the card, so a landing is never captioned as a corridor.

**The founder's plate, measured after:** 2 apartments per floor — front T3 ≈ 100 m² (13.18 × 7.55),
rear T2 ≈ 76 m² (8.9 × 8.51), landing 4.28 × 2.2 m (the scan deepened it by 1 m so both cells sit
inside the 60–100 m² band; at 1.2 m the front cell is 113 m²), core 4.28 × 6.31 m in the rear corner,
fill 0.949, entrance on the front façade. Identical as a rectangle, rotated 27°, and as an irregular
quad; deterministic.

---

## 5. Not decided — named so nobody mistakes them for settled

1. **Ranking on "the core holds its stair".** The corridor typology's `§RESI-SMALL-PLATE-CORE-SCALE`
   shrinks the core to 2.6 × 2.6 m on 16.5–18 m plates (a U-stair needs 4.71 m of run; the executor
   warns `core too small to fully contain the stair`). The landing typology builds the real minimum.
   Making that a comparison criterion would move R-CENTRE plates that double-load cleanly today; it
   was deliberately left out (L-11196). **Founder decision.**
2. **N = 1 as an L-shaped apartment** instead of a rect + a stranded bay (L-11197) — needs the
   executor's polygon door placement to accept an interior door edge.
3. **Wide-shallow plates** (depth < core 6.31 + landing 1.2 + 7.5 = 15.0 m in the landing frame)
   have no landing arrangement here — a left/right split around a rear-centre core needs an L cell
   or a hall (L-11198). The founder's plate clears the line by 1 m.
4. **Two corridor-path defects this lane exposed and out-ranked rather than fixed:** the
   residual-absorption pass minting a whole-floor blob that is not core-reachable (L-11193) and,
   on rotated small plates, rect cells over the core (L-11192).
