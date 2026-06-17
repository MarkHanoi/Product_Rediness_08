# SPEC-CIRCULATION-GRAPH — Graph-theory residential circulation (founder, 2026-06-17)

Status: **canonical brief**. This governs the D-TGL house generator's circulation. A
layout that fails **any** invariant below is INVALID and must be rejected *before* scoring —
not down-weighted. Origin: founder message "§CIRCULATION-GRAPH — COMPLETE ARCHITECTURAL
REBUILD" (2026-06-17). Implementation lives in `packages/ai-host/src/workflows/houseLayout/`
(stair) + `apartmentLayout/tgl/` (subdivide, enumerate, wallsAndDoors) + `rules/programRules.ts`.

## PART 1 — The access-graph model (DAG)

Circulation is a DAG; an edge = "has a door into", direction = reachable-from-entry. Every
habitable room has **exactly one parent**:
- Public rooms → parent = entrance hall (GF) or corridor (FF)
- Private rooms → parent = corridor (both floors)
- En-suite → parent = master bedroom ONLY

Three valid topologies:
- **A — Ground floor (public zone present):** FRONT DOOR → ENTRANCE HALL (root) → {stair, living, GF corridor}. living ══(open weld)══ kitchen ══ dining. GF corridor exists ONLY if a GF bedroom exists; it serves {bedroom, bathroom}.
- **B — Upper floor (no public zone):** STAIR KEEP-OUT → STAIR LANDING (root) = corridor start → {bathrooms, bedrooms, master}; master → en-suite.
- **C — Single storey:** entrance hall serves everything directly.

**G0** — every habitable room has exactly one parent; no orphan (no door); none reachable only
through another private room; none with >1 corridor-level parent.

## PART 2 — Stair as a vertical graph edge
- **S1 (GF):** sharedWall(stairKeepOut, entranceHall) ≥ 0.9m — the only permitted GF stair connection.
- **S2 (FF):** sharedWall(stairKeepOut, corridor) ≥ 0.9m; corridor originates at the stair.
- **S3:** stair position determines corridor axis — abuts RIGHT→corridor runs left(x); BACK→forward(z); LEFT→right(x); CENTRE→plate long axis.
- **S4:** stair keep-out overlaps no habitable cell; opens onto corridor (FF) / hall (GF) only.

## PART 3 — Ground-floor graph rules
- **GF-R1** entrance hall is the only front-door node; on street-facing shell edge; area 8–18m²; width ≥1.8m, depth ≥2.0m.
- **GF-R2** living/kitchen/dining are children of the hall (or of each other via open-plan weld).
- **GF-R3** open-plan weld is NOT a door: kitchen↔dining → openZone=true, no wall, maxDoors=0; dining reaches circulation via kitchen → not sealed.
- **GF-R4** GF corridor is ONE door off the hall; never connects to living/kitchen/dining.
- **GF-R5** GF bedroom & bathroom are children of the corridor only (no door to hall).
- **GF-R6** corridor exists ⟺ GF bedroom exists.
- **GF-R7** no public room touches the corridor (no door or open-zone threshold).

## PART 4 — Upper-floor graph rules
- **FF-R1** corridor is the root; corridor cell shares ≥0.9m wall with stair keep-out; corridorReachM > 0.
- **FF-R2** corridor length ≥ Σ(served room widths along corridor axis) × 0.90.
- **FF-R3** every bedroom (incl. master) has a direct corridor door; never reached through another bedroom/bathroom.
- **FF-R4** every non-ensuite bathroom has a corridor door; bathrooms sit ALONG the corridor, not blocking the landing.
- **FF-R5** en-suite shares a wall ONLY with master; any corridor-shared wall is SOLID (accessFrom = ['masterBedroom'] only).
- **FF-R6** placement order from stair outward: landing(1.5m) → bathrooms(mid) → bedrooms(outer) → master(terminus) → en-suite(off master).

## PART 5 — Hard rejection gates (ORDERED; first failure = reject, no scoring)
0 stair lands on circulation only · 1 GF root exists (8–18m²) · 2 root on perimeter · 3 stair touches root ≥0.9m · 4 GF corridor attached to root ≥0.9m · 5 NO public room on corridor · 6 GF bedroom on corridor only · 7 GF bathroom on corridor only · 8 FF corridor touches stair ≥0.9m · 9 every FF bedroom on corridor · 10 every FF bathroom on corridor · 11 en-suite NOT on corridor (solid wall) · 12 no sealed room · 13 open-plan weld is open (dining not sealed by a solid weld).

## PART 6 — Corridor carve: axis selection (FF)
Axis chosen relative to STAIR position, not plate long axis. minDist to each dominant-rect edge;
EDGE_THRESHOLD=2.0m. >threshold → central → plate long axis. Else corridor runs ALONG the stair's
wall, stair-end edge touching the keep-out. HARD GATE: if resulting corridor doesn't share ≥0.9m
with stairKeepOut → return null (wrong axis, try fallback). **Do NOT inject a corridorStub when the
gap > 0.5m** — a large gap means the wrong axis was chosen.

## PART 7 — Open-plan weld (dining seal fix)
`programRules`: when `openPlanKitchenDining`, kitchen↔dining pairRule { openZone:true,
dividerPermitted:false, maxDoors:0 }; ensure dining.accessFrom includes 'kitchen'.
`wallsAndDoors` MERGE-DIVIDER: if pair is kitchen↔dining && openPlanKitchenDining && dividerPresent
&& !openZone → force openZone=true, weldDropped=true.

## PART 8 — Verification checklist (run after every layout)
GF: hall exists & 8–18m² · hall perimeterAdjacent · stair↔hall ≥0.9 · corridor⟺bedroom · corridor↔hall
≥0.9 · bedroom.parent=corridor · bathroom.parent=corridor · no public↔corridor door · openPlanKD ⇒
kitchen↔dining openZone & dining not sealed · GF sealed=[].
FF: corridor↔stair ≥0.9 · corridorReachM>0 · every bedroom↔corridor ≥0.9 · every bathroom↔corridor
≥0.9 · ensuite.accessFrom=['masterBedroom'] · ensuite↔corridor <0.9 (solid) · FF sealed=[].
Both: stair overlaps no room · corridor aspect ≥3:1 (spine not blob) · no bedroom reached only through another bedroom.
Any failure ⇒ hardValid=false ⇒ REJECT, try next enumeration.

---
### Implementation status (2026-06-17)
- **Stair anti-fragment (PART 2/S3 upstream):** DONE on HEAD — `chooseStairCorePosition`
  penalises central (`PERIMETER_PREFERENCE=1.0`) and fragmenting mid-edge (`FRAGMENT_PENALTY=0.5`,
  `MID_EDGE_NO_CORNER_PENALTY=2.0`). Verified: for plate 16958×14446 it picks a back-corner stair,
  NOT central. A production log showing `kind=central <-- WINNER` is a STALE bundle (hard-refresh).
- **FF axis (PART 6):** `§STAIR-FACE-AXIS` shipped (`00de6362`). Remaining: drop corridorStub when gap>0.5m.
- **PART 5 gates:** the framework exists in `enumerate.ts` (corridorStairGap/corridorHallGap/publicOnCorr/corrBlob). Gates reject; they don't PRODUCE a valid candidate — that's the carve's job.
- **PART 7 weld:** not yet wired at the real divider site (MERGE-DIVIDER line is pre-weld diagnostic only).
- **GF structured carve (PART 3 topology):** the hall-hinge carve (`tryHallHingeCarve`) encodes it but only fires when `dominantFrac ≥ 0.4`; a corner stair (now selected) should restore a high dominantFrac so it fires.
- **FF-R5 en-suite off corridor:** SHIPPED (`5baafcd7`) — `tryCarveEnsuiteFromMaster` takes the corridor rect, carves the en-suite on the master face away from it.
- **PART 6 stub gap-cap:** SHIPPED (`c55d0823`) — upper-floor `findCorridorStubToKeepOut` capped at 0.5 m gap; ground floor uncapped.

### FF-R1 remaining: the polygon L-corridor (next workstream, EXECUTE-READY)
**Why blocked:** the founder's own test (`stairPosition.test.ts §STAIR-DEFAULT-BIAS`) asserts a **corner** stair for 2-storey (protects the GF hall-hinge). A corner stair (2.0×2.8 m, deeper than a 1.2 m corridor) makes any straight rect corridor on the stair wall **poke into an adjacent room** (GATE 0), and a central double-loaded spine sits too far to touch it. Empirically: mid-edge stair breaks 6 GF tests (reverted); 1:1-rect placement model can't express an L room.
**The fix:** emit the corridor as an **L-polygon** (thin spine + landing bump at the stair) via the EXISTING `cellPolygonById` channel — `wallsAndDoors` (line ~947 `cellOverride`) + `semanticGraph` (line ~110) already consume it; only the rect path is exercised today. Steps: (1) in the upper-floor no-public carve, build the double-loaded spine on the FULL plate bbox (fits all rooms, every room abuts — FF-R3/R4) + a perpendicular landing leg through the empty band to the stair; (2) emit the corridor placement rect = spine, plus a `cellPolygonById[corridor] = spine∪leg` L-polygon; (3) verify `evaluateCorridorPurity` / `corridorStairGapFor` read the polygon (they currently use the rect — may need the union bbox or polygon-aware shared-wall); (4) self-validate (0 drops, no stair overlap, corridor↔stair ≥0.9, ensuite off corridor) → return null to fall back (strictly non-regressing). Needs in-browser validation (geometry reshape).
