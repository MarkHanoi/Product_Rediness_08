# SPEC — Spine-First Residential Layout Engine

Status: ACTIVE (operationalises ADR-0072/ADR-0073 HAG). Author target: the D-TGL house engine.
Founder mandate (2026-06-21): "the core corridor needs to be the SPINE — provide an architecturally
sound algorithm and engine for the residential house." This spec is that algorithm + engine, end to
end, for ANY footprint. It supersedes the area-first carve family for residential generation.

---

## 0. The thesis (why this is sound, and area-first is not)

A residential plan is an **access graph**: rooms are nodes, doors are edges, and the plan is good iff
**every room is reachable from the entrance without passing through another habitable room.** The
*only* structure that guarantees that is a **circulation spine** every room hangs off.

The current engine is **area-first**: it sizes rooms by area-weight, packs them (squarify/treemap/
carve), then *retrofits* doors and *rejects* the circulation-broken results. Circulation is a
**consequence** of packing — so it breaks on any plate the packing doesn't happen to suit. Measured:
the §CIRCULATION-ROBUSTNESS-SWEEP runs 108 random (shell × program) combos through the real engine and
finds it ships a fully circulation-sound layout only **~53%** of the time (dominant defect `window` —
a habitable room buried with no façade — then circulation, then reach).

**Spine-first inverts the order:** derive the corridor spine from the footprint FIRST, then pack rooms
into the residual so every room borders the spine (and the façade) **by construction**. Proven: the
spine-first core scores **100% (36/36)** on the same set. Circulation stops being something we check
and becomes something the geometry cannot violate.

---

## 1. Inputs & room classification

```
deriveResidentialFloor(shellPolygon, program, { stairKeepOut?, entry?, corridorWidthM=1.2 })
```
- `shellPolygon` — the storey's real (possibly skewed/convex) perimeter, plan frame, metres.
- `program` — the storey's rooms, each with `{ type, targetAreaM2, minShortSideM, needsWindow }`.
- `stairKeepOut` — the vertical stair core rect (present on every multi-storey floor).
- `entry` — the front-door anchor on the perimeter (ground floor only).

Classify each room by **privacy** (from `programRules`): `public` (living/kitchen/dining), `private`
(bedroom/master/bath/ensuite), `circulation` (hall/corridor). This split drives the whole algorithm.

A floor is **ALL-PRIVATE** (typical upper storey) when it has no public rooms; otherwise **MIXED**
(typical ground storey).

---

## 2. The algorithm

### 2.1 Doctrine (founder-locked, 2026-06-21): "hall for public, spine for private"

The derived central corridor serves the **private wing only**. **Public rooms cluster off the
entrance HALL**, never the corridor. The hall is the single seam connecting the public cluster to the
spine (`hall.accessFrom = ['living','corridor']`). This is architecturally correct (a house's social
zone is an entry-fronted cluster; bedrooms are a corridor-served private wing) and it keeps the public
rooms — which have their own façade frontage — off the circulation spine.

### 2.2 ALL-PRIVATE floor (upper storey)

The whole floor is the private wing:

1. **Derive the spine** — `deriveCorridorSpine(shell, {stairKeepOut})`: a centre-line along the
   shell's LONG axis (computed as the chord through the cross-centre, so it adapts to skewed/convex
   plates), centred on the short axis, width `corridorWidthM`. If the stair keep-out is on an edge the
   straight run can't reach, add a perpendicular **leg** so the spine is an L/T that touches the stair.
2. **Pack rooms off the spine** — `packRoomsAlongSpine`: split the residual into the two bands either
   side of the spine; deal rooms into the two bands area-balanced; comb each band so every room spans
   the FULL band depth (touches the spine on the inner edge, the **façade** on the outer edge) and
   takes a share of the band length PROPORTIONAL to its target area (so the band tiles exactly — no
   "corridor competes for area" drops).
3. **Ensuite carve** — any ensuite is carved FROM its master's slice (ensuite↔master door, never the
   corridor), reusing `tryCarveEnsuiteFromMaster`.

→ Every private room borders the spine (I1) and the façade (I2); the stair is on the spine (I4); the
ensuite is off its master (I5). This is the founder's first-floor target by construction.

### 2.3 MIXED floor (ground storey)

Split the social zone off, then run §2.2 on the private remainder:

1. **Split `[public zone | private wing]`** along the long axis (the proven `tryHallHingeCarve` split),
   sized so the public zone holds the public rooms' target area and the private wing holds the rest.
2. **Place the HALL at the seam** between the two zones, spanning the full cross — the hinge.
3. **Public zone** — reserve the hall-adjacent edge for the **LIVING room** (so `living↔hall` is a
   door-width wall BY CONSTRUCTION — the §HALL-HINGE bail "living↔hall not a door-width wall" the
   ground floor keeps hitting), then squarify kitchen/dining into the remainder, façade-first.
4. **Private wing** — derive the spine (§2.2 step 1) within the wing, anchored at the hall end and
   reaching the stair; pack the private rooms off it (§2.2 steps 2–3).
5. The hall borders public zone + spine → the public cluster reaches the entrance via `living→hall`
   and the private wing via `hall→corridor`.

→ Public rooms front the hall (not the corridor); every private room fronts the spine; the spine
reaches the stair; nothing is sealed. The ground-floor defects (bedroom-onto-living, dining sealed,
corner corridor) are impossible because the private rooms are packed off a spine, not squarified into
the leftover.

### 2.4 Doors (realisation)

One door per access-graph edge, each guaranteed a door-width shared wall by the packing:
`hall ⇢ living` (open/door) · `living ⇢ kitchen ⇢ dining` (open-plan cluster) · `hall ⇢ corridor` ·
`corridor ⇢ {each private room}` · `corridor ⇢ stair` · `master ⇢ ensuite` · wet-room fallback last.
The door pipeline (`wallsAndDoors`) is unchanged — it simply finds the walls already there.

### 2.5 The topology gate becomes a SAFETY NET

`enumerate`'s hard gate (`circulation`/`reach`/`window`/`corridor-public`/`corridor-stair`) stops
being the primary quality filter and becomes a rare backstop: a spine-first floor satisfies the
invariants by construction, so the gate should pass first try. When it doesn't, that's a real bug to
fix in the packer — not a "ship the least-bad" event.

---

## 3. Engine structure (modules + wiring)

```
L2 pure (packages/ai-host/src/workflows/apartmentLayout/tgl/)
  deriveCorridorSpine.ts     P1 ✅  shell → spine centre-line (+stair leg). 8 tests.
  packRoomsAlongSpine.ts     P2 ✅  spine + rooms → bands (I1/I2 + proportional fill + leg cells). 9 tests.
  subdivideViaSpine.ts       P3 ✅  bubbleGraph adapter composing P1+P2. Head-to-head 100% vs 53%.
  splitPublicPrivateWing.ts  P5 ⏳  MIXED-floor [public+hall | private wing] split + living-on-hall.
  (ensuite carve)            P7 ⏳  reuse tryCarveEnsuiteFromMaster after packing.
  (skew clip)                P6 ⏳  clip bands to the real shell polygon (not bbox) for skewed plates.

wiring
  subdivide.ts               P4 ✅  SubdivideOptions.spineFirst → early-return (no-public). Default off.
  enumerate.ts               P4 ✅  EnumerateInput.spineFirst passthrough.
  runDeterministicLayout.ts  P4 ✅  spineFirst param → enumerate.
  houseOrchestrator.ts       P4 ✅  HouseLayoutOptions.spineFirst → per-storey (self-gates).
  HouseLayoutController.ts   P4 ✅  reads window.__pryzmSpineFirst → preview opts.

acceptance
  circulationRobustnessSweep.test.ts  P0 ✅  area-first baseline 53% (regression tripwire).
  spineFirstRobustnessSweep.test.ts   P3 ✅  spine-first 100% on the same set.
```

---

## 4. Invariants (guaranteed by construction, asserted by the sweep)

| | invariant |
|---|---|
| I1 | every private room shares a ≥0.8 m wall with the corridor spine |
| I2 | every window-needing room touches the shell façade |
| I3 | the hall borders BOTH the public zone and the spine (public reaches entry; private reaches the wing) |
| I4 | the stair shares a door-width wall with the spine (via the leg) |
| I5 | every ensuite shares a wall with its master and NOT the corridor |
| I6 | no room overlaps another or the corridor; the residual is tiled (no silent drops) |

Acceptance = the §CIRCULATION-ROBUSTNESS-SWEEP fully-sound rate → ~100% with the flag ON (drive it up
P5/P6/P7), at which point spineFirst flips to the default and the area-first carve is retired for
residential.

---

## 5. Migration plan (each step test-first + sweep-gated + browser-verified)

- **P0–P4 ✅ DONE** — the yardstick + the pure spine core (derive → pack → adapter), proven 100% vs
  53%, flag-wired end-to-end (default off = byte-identical), browser-toggle live (`window.__pryzm
  SpineFirst`). Upper/all-private storeys already get the central spine.
- **P5 — MIXED-floor split (the ground floor).** Two roots, found by investigating the regression
  (houseResidualFill §65.2 "no cavern blob", cap 48 m²):
  - **P5a — living OVER-ALLOCATION (the deeper root, do FIRST).** The bubble graph area-weights living
    to **54.5 m² on a 191 m² ground plate** (§AREA-FRACTIONS / fillGroundPlate enrichment). That alone
    makes ANY clean public-zone cell cavernous and leaves zero slack for the hall-hinge — it is why the
    bedrooms get doored onto living. Cap the ground living nearer a real living-room size (~36–42 m²)
    in the area model so the public zone has slack. This is a bubble-graph/enrichment change (global) —
    do it test-first, watch the §65.2 + §AREA-FRACTIONS tests, and it improves the LEGACY path today
    (flag off) too.
  - **P5b — living-on-hall as a CORNER reservation.** The earlier full-cross living strip is inherently
    cavernous on a wide public zone (living min-depth 3.2 m × 16 m cross = 51 m² > the 48 m² cap), so it
    shipped a cavern and regressed §65.2. The correct primitive is a CORNER reservation: living occupies
    a target-sized rect in the hall-adjacent corner (partial cross-width, ≥ door-width shared with the
    hall), kitchen/dining fill the L-shaped remainder. Needs P5a first so living is small enough to
    corner cleanly. Then `living↔hall` holds and the hall-hinge stops bailing.
  Together P5a+P5b give the ground floor the `[public off hall | private wing on spine]` plan.
- **P6 — skew clip.** Clip the spine bands to the real shell polygon (reuse the engine's
  `§POLYGON-NATIVE-ROUTE` projection) so spine-first renders cleanly on the skewed GIS-boundary plates
  the founder actually draws (today the P2 core packs into the bbox → edge overhang on a sheared quad).
- **P7 — ensuite carve** in the spine path (close the `ensuiteOnCorr` gate).
- **P8 — flip the default** once the sweep clears ~95/108 AND the full house+tgl suite is green AND
  the founder browser-verifies; retire the area-first carve for residential, keep it for apartments
  until they migrate too.

---

## 6. Why this resolves the founder's recurring defects

| recurring defect (area-first) | spine-first resolution |
|---|---|
| bedroom doored onto the living room (privacy) | private rooms packed off the spine; public off the hall (§2.3) |
| Bedroom-3 reached through Bedroom-2 (depth-2) | every private room spans a full band → on the spine (I1) |
| stair isolated / behind a room | spine leg reaches the stair keep-out by construction (I4) |
| corridor a corner stub | corridor IS the derived central spine, not a leftover cell |
| dining sealed | residual tiled, every room a door-width wall — nothing sealed (I6) |
| room with no window | façade-first banding (I2) |
| "ship the least-bad" compromises | the gate is a backstop, not the primary filter (§2.5) |

The throughline: **whenever circulation is derived first and rooms hang off it, the plan is sound for
any footprint; whenever it is a by-product of area packing, it breaks.** This spec makes the former the
engine.

---

## 7. §SPINE-CONCAVE-ARMS — the spine BRANCHES on a concave (L/T/U/cross) footprint (2026-06-28)

The P1–P8 core derives a *straight* primary run from the shell's long axis (plus stair/entry legs).
On a **concave axis-rectilinear** footprint (an L / T / U / cross house plate) that single run is
wrong in three coupled ways the founder hit ("I never saw a corridor branch on a shape other than I
really connecting all rooms; the graph is never all-blue, rooms always red"):

1. **`deriveCorridorSpine`** computed ONE bbox-cross-centre chord. On an L that chord can lie in ONE
   arm only (or cross the notch), so the run never traverses the perpendicular arm — no branch.
2. **`packRoomsAlongSpineTree`** built the corridor strip + residual room bands against the **bbox**,
   so a band (and the rooms in it) spilled into the **notch** (outside the building).
3. The **§SPINE-TREE consumer** (`subdivide`) convex-clamped the corridor cells
   (`clampRectToConvexShell` is convex-only); on a concave shell that collapsed them so the L/T
   corridor **ring** was lost → the corridor lifted as one rect → most rooms shipped SEALED.

The result: a straight corridor + notch/sealed rooms = the red graph.

**The fix (all in `apartmentLayout/tgl/`, gated to concave axis-rectilinear shells ⇒ rectangles &
sheared quads byte-identical):**

- `deriveCorridorSpine` decomposes a concave axis-rectilinear shell into its **arm rects**
  (`decomposeToRects`) and routes a corridor segment along **each arm**; a secondary arm's strip is
  **offset toward the junction edge** it shares with the host arm, so the arm's full remaining depth
  is ONE façade band (a window AND a corridor wall for every room) and the perpendicular strips
  **overlap at the junction** — a clean orthogonal **L / T / +** corridor, no diagonal connectors.
- `packRoomsAlongSpineTree` tiles the **arm rects** (never the bbox) for the residual room bands, so
  no room is ever placed in the notch; the corridor cells are the arm segment strips (no
  bbox-spanning primary).
- the §SPINE-TREE consumer **skips the convex clamp** on a concave shell (the arm-spine keeps every
  cell in-shell by construction) so the L/T corridor ring survives → every room shares a corridor
  wall → reachable.
- the **single-loaded** attempt (one straight peripheral band) is **skipped** for a concave shell —
  it cannot traverse a perpendicular arm — so the branching multi-leg tree is used.

**Result** (the founder's gate): the shipped winner on an L / T / U footprint no longer fails the
`circulation` or `reach` rule — every private room reaches circulation and every habitable room is
reachable from the entrance (graph all-blue). Pinned by `spineConcaveArmsBranching.test.ts`
(geometry: a real branching corridor, no drops, all in-shell, all corridor-adjacent) and
`spineConcaveArmsReach.test.ts` (the live `enumerateLayouts` gate). Window/quality refinement of the
banding on tight concave plates remains follow-up (a `window`-axis quality concern, not circulation).
