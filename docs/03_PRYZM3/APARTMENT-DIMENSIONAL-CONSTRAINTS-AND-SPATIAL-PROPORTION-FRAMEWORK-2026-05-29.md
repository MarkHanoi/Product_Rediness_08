# Apartment — Dimensional + Topological Pre-Furnishing Validators (2026-05-29)

**Part A — Dimensional Constraints & Spatial-Proportion Framework**
**Part B — Adjacency & Spatial-Relationship Framework**

**Fifth companion** to the apartment doc set. Together the two parts form the missing pre-furnishing validator stack: Part A validates *shape*, Part B validates *connectivity*. Both run between D-TGL subdivision and D-FLE furnishing; both are pure.

**Reading order:**

1. `APARTMENT-LAYOUT-STATUS-2026-05-29.md` (history + tactical tiers + 5-layer strategic framework)
2. `APARTMENT-DRIVING-PRINCIPLES-AND-ROOM-ELEMENT-MATRIX-2026-05-29.md` (per-room principles + element × room matrix)
3. `APARTMENT-COGNITION-STACK-AND-IMPLEMENTATION-PLAN-2026-05-29.md` (7-layer cognition stack + 6-stage optimisation)
4. `APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN-2026-05-29.md` (contract-exhaustive furniture programme)
5. **THIS doc** — the dimensional-constraints layer that sits BELOW furnishing, BELOW archetypes, BELOW activity systems.

## The core principle this doc formalises

> **Furniture placement should not compensate for bad room geometry.**

The new layer sits **between topology generation and furnishing** — exactly where the constraints belong architecturally AND computationally. Without it, the engine generates rooms that are technically valid polygons but architecturally absurd: 2 m² bathrooms, 20 m² bathrooms, 900 mm-wide living rooms, 40-metre corridors, bedrooms with impossible furniture fit, kitchens with no work triangle, rooms with pathological aspect ratios, circulation that collapses under furnishing.

---

## §1 — The missing layer: architectural geometric intelligence

The current pipeline evaluates topology + adjacency + area targets + furnishing possibility + optimisation score. **It does not evaluate room SHAPE quality.**

A room can satisfy area targets while still being unusable:

```
Bathroom = 5.5 m²        ← Solver accepts (area legal)
Shape = 1.1 m × 5.0 m    ← BUT: tunnel-like
                         → Impossible vanity/shower layout
                         → No turning circle
                         → Architecturally unacceptable
```

PRYZM today: this layout passes every existing constraint (areaWeight, minAreaM2, minShortSideM = 1.5 m for ensuite — but the 5.0 m length is unbounded). The §4.5 strategic gaps already named **proportional elegance** as a gap; this doc formalises the data.

**Architecturally, the missing intelligence is:**

- Proportion (aspect ratios)
- Wall usability (uninterrupted furnishing surface)
- Circulation quality (clear movement paths)
- Furnishing geometry (fixture clearances pre-validated)
- Depth (how far from windows)
- Frontage (which rooms get exterior wall)
- Spatial hierarchy (living dominates hall)
- Daylight geometry (penetration depth)
- Visual compression / release

**Computationally, the new layer is a pure validator + scorer that runs AFTER subdivision + BEFORE furnishing.** Failed layouts are rejected (hard) or penalised (soft) before the furnishing solver wastes effort on them.

---

## §2 — Constraint taxonomy (10 classes)

All room-geometry constraints fall into 10 classes. Each constraint declares its **severity tier**:

- **HARD-REJECT** — layout fails validation; solver MUST drop it.
- **SOFT-PENALTY** — layout is admissible but scores lower; Pareto rank handles it.

| ID | Class | Example | Severity |
|---|---|---|---|
| **G1** | Area constraints | bathroom 3.5–8 m² | HARD min, SOFT max |
| **G2** | Width constraints | corridor 1.0–1.4 m | HARD min, SOFT max |
| **G3** | Length constraints | corridor max 12 m | SOFT |
| **G4** | Aspect-ratio constraints | bedroom max 1:2.2 | HARD beyond threshold, SOFT below |
| **G5** | Furniture-fit constraints | bed + circulation fits | HARD-REJECT if no valid placement |
| **G6** | Wall usability constraints | min uninterrupted wall | HARD per-room |
| **G7** | Circulation constraints | clear movement paths | HARD min, SOFT optimum |
| **G8** | Daylight / frontage | living requires exterior frontage | HARD for habitable + windowMandatory |
| **G9** | Spatial hierarchy | living must dominate hall | SOFT-PENALTY |
| **G10** | Activity-fit constraints | kitchen work triangle | HARD-REJECT if triangle illegal |

These constraints apply at:
- Room generation (D-TGL subdivide pass)
- Room mutation (during enumerate iteration)
- Room splitting
- Furnishing pre-check (D-FLE)
- Optimisation scoring
- Rejection filtering

---

## §3 — Global apartment constraints (apply BEFORE room-specific logic)

### §3.1 — Apartment gross-area sanity

| Apartment type | Min | Target | Max |
|---|---|---|---|
| Studio | 28 m² | 38 m² | 55 m² |
| 1-bedroom | 42 m² | 58 m² | 80 m² |
| 2-bedroom | 60 m² | 85 m² | 120 m² |
| 3-bedroom | 85 m² | 115 m² | 160 m² |
| 4-bedroom | 115 m² | 150 m² | 220 m² |

**PRYZM today:** No gross-area sanity check. A 200 m² 1-bedroom would pass.

### §3.2 — Net-to-gross efficiency

| Metric | Constraint | Severity |
|---|---|---|
| Circulation area | ≤ 12 % ideal, ≤ 15 % hard max | SOFT 12 %, HARD 15 % |
| Bathrooms + utility combined | ≤ 18 % | SOFT |
| Hall + corridor combined | ≤ 10 % | SOFT |
| Storage | 4–10 % | SOFT |
| Exterior-wall frontage utilisation | maximise | SOFT |

**PRYZM today:** §AREA-FRACTIONS (`4e2d444`) added `corridor.maxAreaFrac = 0.10` — partially covers hall+corridor cap. No bath+utility combined cap. No storage tracking.

### §3.3 — Exterior frontage allocation

Highest-value rooms receive daylight priority.

**Priority order** (highest first): `living` → `dining` → `master` → `secondary bedrooms` → `study` → `kitchen` → `bathroom` → `utility` → `corridor`.

**Rules:**
- Corridor should almost never consume prime exterior frontage.
- Bathrooms should not monopolise façade length.
- Living should receive the best frontage GEOMETRY (not just length — south-facing + corner > north + flat).
- Bedrooms should not borrow daylight through living spaces.

**PRYZM today:** Frontage allocation is *implicit* via `windowMandatory: true/false` only. No competitive priority enforcement — if the squarify pass places the corridor against the south façade, nothing rejects it.

---

## §4 — Universal room constraints (apply to ALL habitable rooms)

### §4.1 — Minimum clear width

| Room class | Minimum clear width |
|---|---|
| Habitable room | 2.4 m |
| Bedroom | 2.7 m |
| Living room | 3.2 m |
| Kitchen | 2.1 m |
| Bathroom | 1.5 m |
| Corridor | 1.0 m |

**Definition.** Clear width = smallest navigable dimension after accounting for permanent fixtures.

**PRYZM today:** `programRules.minShortSideM` covers this. Values aligned (living 3.2, master 2.75, bedroom 2.6, kitchen 1.8, bathroom 1.8, corridor 1.0). The 1.8 m kitchen value is more permissive than the 2.1 m in §4.1; review gap.

### §4.2 — Maximum aspect ratio

Pathological tunnel rooms must be rejected.

| Room type | Max ratio |
|---|---|
| Living | 1 : 2.2 |
| Bedroom | 1 : 2.2 |
| Study | 1 : 2.4 |
| Kitchen | 1 : 3 |
| Bathroom | 1 : 2.5 |
| Corridor | exempt |

`ratio = long / short`. Penalty escalates nonlinearly after threshold.

**PRYZM today:** ❌ NOT enforced. `objectives.ts.regularity` rewards aspect → 1 but doesn't HARD-reject pathological cases. The 1.1 m × 5.0 m bathroom example would pass.

### §4.3 — Minimum uninterrupted wall segment

Every room requires at least one uninterrupted furnishing wall.

| Room | Min uninterrupted wall |
|---|---|
| Living | 2.8 m |
| Bedroom | 2.4 m |
| Study | 2.0 m |
| Dining | 2.4 m |
| Bathroom | 1.2 m |
| Kitchen | 2.4 m |

**Interrupted by:** door, window, opening, structural shaft, built-in obstruction.

Without this: TV walls impossible, wardrobes impossible, desks impossible, vanities impossible.

**PRYZM today:** ❌ NOT enforced. D-FLE attempts to find a wall-longest anchor but if every wall is fragmented by openings, the required `bed` / `sofa` silently drops.

### §4.4 — Door conflict constraints

- Avoid doors centred on dominant furnishing walls.
- Avoid opposing doors in narrow rooms.
- Avoid door swing collision zones.
- Preserve corner integrity for furniture anchoring.

**PRYZM today:** Partial. §FURNITURE-SPEC `excludeDoorSwing` honours door-swing avoidance in furniture placement. The PRE-furnish room-shape decisions don't consider it.

### §4.5 — Corner integrity

Every habitable room should preserve ≥ 2 usable corners (3 preferred).

**Corner destruction occurs via:** diagonal cuts, excessive openings, awkward geometry, fragmented walls.

**PRYZM today:** ❌ NOT enforced. D-TGL `§COLLINEAR-MERGE` reduces corner fragmentation but doesn't count usable corners.

---

## §5 — Per-room constraints

### §5.1 — Living room — spatial anchor

**Area.** Min 14 m² · Comfortable 18–30 m² · Luxury threshold 35 m² · Soft max 45 m².

**Geometry.** Min width 3.2 m · Preferred 3.8–5.5 m · Max ratio 1:2.2 · Width ≤ 2 × ceiling height (perception).

**Wall logic.** Requires: 1× TV-capable wall ≥ 2.4 m, 1× sofa-capable wall, 1× daylight frontage. Avoid: through-circulation cutting seating, > 2 door penetrations, central openings consuming furniture walls.

**Circulation.** Main path ≥ 900 mm · Sofa-to-TV 2.0–4.5 m · Around coffee table ≥ 450 mm.

**Hierarchy.** Must exceed hall area, dominate circulation, receive best daylight, visually terminate major arrival axis where possible.

### §5.2 — Kitchen — work triangle

**Area.** Min 5.5 m² · Comfortable 7–14 m² · Large family 14–22 m².

**Geometry.** Min width 2.1 m · Galley min width 1.8 m clear between counters · Max ratio 1:3.

**Work triangle (CRITICAL).** Sink ↔ hob 1.2–2.7 m · Hob ↔ fridge 1.2–2.7 m · Fridge ↔ sink 1.2–2.7 m · Triangle perimeter 4–8 m. **HARD-REJECT** if no triangle is buildable.

**Counter requirements.** Continuous prep ≥ 900 mm · Counter depth 600 mm · Island passage 1000–1200 mm.

**Reject if:** fridge blocks circulation; oven blocks corner; no landing space beside hob/sink; island blocks movement.

### §5.3 — Dining room

**Area.** Min 8 m² · Comfortable 10–18 m².

**Geometry.** Min width 2.8 m · Max ratio 1:2.5.

**Table fit.** 4-seat → 750 mm around · 6-seat → 900 mm around · 8-seat → 1000 mm around. **HARD-REJECT** if chair pullback collides with circulation.

### §5.4 — Bedroom / master bedroom

**Area.**

| Type | Min | Comfortable | Max |
|---|---|---|---|
| Secondary bedroom | 9 m² | 11–16 m² | 22 m² |
| Master bedroom | 12 m² | 16–24 m² | 35 m² |

**Geometry.** Min width 2.7 m · Preferred 3.2–4.5 m · Max ratio 1:2.2.

**Double-bed constraints.** Side clearance ≥ 600 mm one side · Preferred both sides ≥ 600 mm · Foot clearance ≥ 750 mm · Bedside-table allowance 400–500 mm. **HARD-REJECT** if bed + minimum circulation does not fit.

**Wardrobe constraints.** Depth 600 mm · Clearance in front ≥ 900 mm · Min uninterrupted wardrobe wall ≥ 1.8 m. **HARD-REJECT** if no qualifying wall.

**Psychological geometry.** Avoid: bed directly aligned with entry door · bed under low window sill · excessive room depth · bed trapped against one wall unless compact unit.

### §5.5 — Bathroom — geometry-sensitive

**Area.**

| Type | Min | Comfortable | Soft max |
|---|---|---|---|
| Compact WC | 1.8 m² | 2.2–3 m² | 4 m² |
| Bathroom | 3.5 m² | 4.5–8 m² | 10 m² |
| Ensuite | 3 m² | 4–6 m² | 8 m² |

**Rule.** A 20 m² bathroom in a normal apartment is almost always a planning failure. Implement SOFT-PENALTY scaling above soft max; HARD-REJECT above 2× soft max.

**Geometry.** Min width 1.5 m · Comfortable 1.8–2.6 m · Max ratio 1:2.5.

**Fixture clearances (all HARD).**

| Fixture | Constraint |
|---|---|
| Toilet | Side clearance ≥ 200 mm each side; front ≥ 600 mm (comfortable ≥ 750 mm) |
| Vanity | Depth 500–600 mm; front clearance ≥ 750 mm |
| Shower | Minimum 800 × 800 mm; comfortable 900 × 1200 mm |
| Bathtub | Typical 1700 × 700 mm; front clearance ≥ 700 mm |

**Wet-zone logic.** Cluster plumbing walls + drainage stacks + vertical shafts. Avoid fragmented wet walls / isolated fixtures / excessive pipe runs.

### §5.6 — WC

**Area.** Min 1.8 m² · Comfortable 2.2–3 m² · Soft max 4 m².

**Geometry.** Min width 900 mm · Preferred 1.1–1.5 m · Max ratio 1:2.2.

Must fit: toilet + small basin + front turning clearance.

### §5.7 — Study

**Area.** Min 6 m² · Comfortable 8–14 m² · Soft max 20 m².

**Geometry.** Min width 2.4 m · Preferred 2.8–4 m · Max ratio 1:2.4.

**Desk logic.** Desk width 1200–1800 mm · Desk depth 700–800 mm · Chair pullback ≥ 900 mm · Bookshelf wall ≥ 2.0 m. **HARD-REJECT** if no desk + chair envelope fits.

### §5.8 — Hall / entrance lobby

**Area.** Min 2.5 m² · Comfortable 4–8 m² · Soft max 10 m².

**Geometry.** Min width 1.2 m · Min clear circle 1.5 m diameter for accessibility · Max ratio 1:2.

**Door fit.** Front door swing 0.9 × 0.9 m clear arc inside the lobby. **HARD-REJECT** if swing arc clips a wall.

### §5.9 — Corridor (apartment-internal)

**Length.** Min 1.5 m (otherwise it's not a corridor — fold into hall) · Soft max 8 m · HARD max 12 m.

**Width.** Min 1.0 m (Part M mandatory) · Preferred 1.0–1.4 m · **Soft maximum 1.4 m** (above this it's a hallway / room, not circulation).

**Length × width ratio.** Min 1.5:1 (otherwise it's a vestibule, not a spine) · Max 12:1 (beyond this it's a fire-corridor not a residential one).

**Branching.** Max 3 branches (3-way junctions); no dead-end branches serving < 2 rooms.

**Termination.** Each end SHOULD terminate on either a door, a window, or a room (not a blank wall).

### §5.10 — Utility

**Area.** Min 3.5 m² · Comfortable 4–6 m² · Soft max 8 m².

**Geometry.** Min width 1.5 m · Max ratio 1:2.5.

**Fixture fit.** Washer + dryer + utility sink + storage cabinet + front clearance ≥ 700 mm.

---

## §6 — Gap analysis vs current PRYZM

How each constraint maps to today's `programRules.ts` + the cognition-stack roadmap.

| Constraint | PRYZM today | Gap | Implementation home |
|---|---|---|---|
| **G1 Min area** | `programRules.minAreaM2` | ✅ Aligned | `programRules.ts` |
| **G1 Max area** | ❌ Absent | ALL — no soft/hard max enforced | Add `maxAreaM2` field to `RoomRule`; clamp in bubbleGraph allocator |
| **G2 Min width** | `programRules.minShortSideM` | ✅ Aligned (kitchen 1.8 vs framework 2.1 — review) | `programRules.ts` |
| **G2 Max width** (corridor 1.4 m) | ❌ Absent | Corridor can be 2 m+ | Add `maxShortSideM`; D-TGL subdivide bounds |
| **G3 Max length** | ❌ Absent | Corridor can be 40 m | Add `maxLongSideM`; subdivide bounds |
| **G4 Max aspect ratio** | ❌ Absent | Tunnel rooms pass | New validator + `objectives.regularity` HARD threshold |
| **G5 Furniture fit** | ❌ Partial (`§HARD-MIN-SIDE-2M`) | Bed-fit / vanity-fit / desk-fit not pre-checked | NEW geometric validator BEFORE D-FLE |
| **G6 Min uninterrupted wall** | ❌ Absent | Fragmented walls produce silent furniture drops | NEW validator; reads wall+opening list per room |
| **G7 Circulation paths** | 🟡 `§F-Sprint-5` post-furnish circulation gate | Pre-furnish path-fit not checked | Extend §F-Sprint-5 to pre-furnish; share validator code |
| **G8 Frontage allocation** | 🟡 `windowMandatory` flag only | No competitive priority | NEW `FrontagePriorityAllocator` in D-TGL P3 |
| **G9 Spatial hierarchy** | ❌ Absent | Living can be smaller than hall | New `hierarchy` axis (already queued as L2-β-1 in cognition-stack) |
| **G10 Kitchen work triangle** | ❌ Absent | Engine emits kitchen with no triangle | NEW `KitchenTriangleValidator` consumed by D-FLE |
| **Apartment gross-area sanity** | ❌ Absent | Unbounded | New `validateApartmentEnvelope` pre-D-TGL |
| **Net-to-gross efficiency** | 🟡 §AREA-FRACTIONS partial | Bath+util combined / storage not tracked | Extend `§AREA-FRACTIONS` |
| **Corner integrity** | ❌ Absent | Diagonal cuts produce 1-corner rooms | NEW validator after subdivide |
| **Psychological geometry (bed-aligned-with-door)** | ❌ Absent | Bed lands aligned with door | New scoring axis in D-FLE |

**Summary.** ~70 % of the framework is NEW work; ~25 % is gap-extension (existing fields need new sibling fields); ~5 % is already aligned.

---

## §7 — Implementation architecture & pipeline placement

The dimensional layer is a **pure validator + scorer** that sits between D-TGL subdivision and D-FLE furnishing.

```
shell + program
    │
    ▼
D-TGL subdivide (P1–P3)
    │
    ▼  ←─────────── NEW ───────────┐
ROOM-SHAPE VALIDATOR              │
  • G1 area max     • G6 walls    │   Returns ⟨admissible, penalties[], rejections[]⟩
  • G2 width max    • G7 paths    │   HARD-REJECT failures drop the candidate.
  • G3 length max   • G8 frontage │   SOFT-PENALTY failures lower the score.
  • G4 aspect       • G10 kitchen │
  • Corner integrity              │
    │  (admissible candidates)    │
    ▼  ←─────────── NEW ───────────┘
D-TGL doors + windows
    │
    ▼
ROOM-FIT VALIDATOR (G5)
  • Bed envelope fits
  • Vanity envelope fits
  • Desk envelope fits
  • Sofa + clearance fits
    │  (per-room HARD-REJECT)
    ▼
D-FLE furnishing
    │
    ▼
§F-Sprint-5 post-furnish circulation gate
    │
    ▼
Pareto rank (objectives.ts with new axes)
```

**Two validators**, not one — because room-SHAPE is checked before doors are placed (so we can iterate subdivision), while room-FIT requires the door positions.

### §7.1 — File layout

| Layer | New file |
|---|---|
| Pure types | `packages/ai-host/src/workflows/apartmentLayout/dimensions/types.ts` |
| Per-room dimension table | `packages/ai-host/src/workflows/apartmentLayout/dimensions/roomDimensions.ts` (extends `programRules` with the framework values from §3–§5) |
| Shape validator | `packages/ai-host/src/workflows/apartmentLayout/dimensions/validateRoomShape.ts` |
| Fit validator | `packages/ai-host/src/workflows/apartmentLayout/dimensions/validateRoomFit.ts` |
| Kitchen triangle | `packages/ai-host/src/workflows/apartmentLayout/dimensions/kitchenTriangle.ts` |
| Frontage priority allocator | `packages/ai-host/src/workflows/apartmentLayout/tgl/frontageAllocator.ts` (extends D-TGL P3) |
| Objective: new axes | `packages/ai-host/src/workflows/apartmentLayout/tgl/objectives.ts` (add `shapeQuality` + `fitQuality`) |
| Enumerate: gate | `packages/ai-host/src/workflows/apartmentLayout/tgl/enumerate.ts` (filter candidates through validators before Pareto) |
| Tests | `packages/ai-host/__tests__/dimensionalConstraints.test.ts` per validator |

---

## §8 — Severity tiers (HARD vs SOFT)

Every constraint in §3–§5 carries a severity. The validator returns:

```ts
interface DimensionalValidation {
    readonly admissible: boolean;          // false ⇒ HARD failure
    readonly hardRejections: readonly string[];  // [room: reason]
    readonly softPenalties: readonly { metric: string; delta: number }[];
}
```

The Pareto rank treats `softPenalties.delta` as a sum subtracted from the relevant axis.

**HARD-REJECT triggers** (the candidate is dropped, not penalised):

- G1 area below absolute min.
- G2 width below absolute min.
- G4 aspect ratio above the "tunnel threshold" (typically 1.5× the soft max).
- G5 furniture-fit failure for a REQUIRED item (bed in bedroom; vanity in bathroom; desk in study).
- G6 no uninterrupted wall ≥ the required length for any REQUIRED furniture.
- G7 no circulation path exists from door to centroid clearance ≥ 800 mm.
- G8 a `windowMandatory` room has no exterior wall.
- G10 no buildable kitchen work-triangle.
- Apartment gross-area outside the type's hard range.

**SOFT-PENALTY triggers** (the candidate stays but scores lower):

- G1 area above soft max.
- G2 / G3 dimension above soft max.
- G4 aspect ratio between soft max and tunnel threshold.
- G7 circulation pinch-points (< 900 mm).
- G8 sub-optimal frontage assignment.
- G9 hierarchy inversion (e.g. hall larger than living).
- §3.2 net-to-gross efficiency above soft cap.
- Psychological geometry violations (bed aligned with door, etc.).

---

## §9 — Status-tracked implementation plan

Sub-deliverables ordered by priority + dependency. Each row pays the contract obligation ladder per the furniture plan §0.1 (Zod + tests + integration + docs).

Legend: ⬜ Not started · 🟦 Planning / spec · 🟨 In progress · ✅ Complete · 🟥 Blocked.

### §9.1 — Phase D1 — Data: room dimension table

| ID | Subphase | What | Estimate | Status |
|---|---|---|---|---|
| **D1.1** | Define `RoomDimensions` schema | TypeScript interface + Zod schema for all per-room constraints from §5: `areaMin`, `areaComfortableMin`, `areaComfortableMax`, `areaSoftMax`, `areaHardMax`, `widthMin`, `widthPreferred`, `widthMax`, `aspectMax`, `aspectHardMax`, `usableWallMin`, plus per-room overrides (kitchen `workTriangleMinPerimeter`, etc.). | 1 day | ⬜ |
| **D1.2** | Populate `roomDimensions.ts` | One entry per `RoomType` from the §5 tables. Reviewed against UK Building Regs + HQI minima already in `programRules.ts`. Reconcile the kitchen min-width discrepancy (1.8 vs 2.1) — pick one with a documented rationale. | 1 day | ⬜ |
| **D1.3** | Extend `RoomRule` with optional `maxAreaM2` + `maxShortSideM` + `maxLongSideM` | Backward-compatible (missing values = no clamp) — same pattern as `maxAreaFrac` / `minAreaFrac`. | 0.5 day | ⬜ |
| **D1.4** | Apartment-type sanity table | `apartmentDimensions.ts` per §3.1 (bedroom-count → gross min/target/max). | 0.5 day | ⬜ |
| **D1.5** | Tests | Pin every value with a snapshot test so changes are deliberate. | 1 day | ⬜ |

### §9.2 — Phase D2 — Validators

| ID | Subphase | What | Estimate | Status |
|---|---|---|---|---|
| **D2.1** | `validateRoomShape` | Per room: G1 max, G2 max, G3 max, G4 aspect, G6 uninterrupted wall, corner integrity. Returns `DimensionalValidation`. Pure; no THREE/DOM/RNG. | 2 days | ⬜ |
| **D2.2** | `validateRoomFit` | Per room (post-doors): G5 furniture envelopes. Reads `programRules.requiredFurniture` + footprint catalogue; computes whether each required item has a placeable anchor with required clearances. | 3 days | ⬜ |
| **D2.3** | `kitchenTriangleValidator` | G10. Walk the kitchen unit chain; identify sink + hob + fridge positions; verify triangle distances 1.2–2.7 m each side, perimeter 4–8 m. | 1 day | ⬜ |
| **D2.4** | Apartment-envelope validator | `validateApartmentEnvelope(grossM2, bedrooms) → ok / soft-penalty / hard-reject` per §3.1 table. | 0.5 day | ⬜ |
| **D2.5** | Frontage-priority allocator | New D-TGL P3 step: rank exterior edges by orientation × view × noise (uses cognition-stack L1-α-1); allocate to rooms by §3.3 priority. | 3 days | ⬜ |
| **D2.6** | Tests | Per validator: contradictory layout → HARD; borderline → SOFT; ideal → clean pass. | 2 days | ⬜ |

### §9.3 — Phase D3 — Pipeline integration

| ID | Subphase | What | Estimate | Status |
|---|---|---|---|---|
| **D3.1** | `enumerate.ts` gate | Run `validateRoomShape` after each candidate's subdivide; drop HARD-rejections from the pool BEFORE Pareto. SOFT penalties accumulate. | 1 day | ⬜ |
| **D3.2** | `enumerate.ts` post-door gate | Run `validateRoomFit` after doors are placed; same drop-vs-penalise logic. | 0.5 day | ⬜ |
| **D3.3** | Per-occupancy kitchen triangle | Run `kitchenTriangleValidator` after D-FLE's kitchen run is placed; on failure, re-anchor + retry once; if still failing, HARD-REJECT the candidate. | 1 day | ⬜ |
| **D3.4** | New objective axes | Add `shapeQuality` + `fitQuality` to `ObjectiveVector`. Compute as `1 - sum(softPenalties.delta) / total-checks`. | 1 day | ⬜ |
| **D3.5** | Apartment-envelope pre-D-TGL | Block layout generation if the apartment is outside the §3.1 hard range — toast the user with a clear explanation. | 0.5 day | ⬜ |
| **D3.6** | Tests + integration | Three end-to-end fixtures: tiny shell (envelope-reject), tunnel bathroom (shape-reject), no-bed-fit bedroom (fit-reject). | 2 days | ⬜ |

### §9.4 — Phase D4 — Modal surfacing

| ID | Subphase | What | Estimate | Status |
|---|---|---|---|---|
| **D4.1** | Card score breakdown adds `Shape` + `Fit` | Two new bars in the §11 modal score breakdown. | 0.5 day | ⬜ |
| **D4.2** | Per-room warning surfacing | When a candidate is admissible but carries SOFT penalties, show them under the thumbnail as small badges ("Tunnel kitchen", "No corner for sofa"). | 1 day | ⬜ |
| **D4.3** | HARD-REJECT visibility | When the engine returns < 3 candidates because too many were HARD-rejected, surface a clear modal-level explanation ("Shell too narrow for 2 bedrooms — try widening or fewer bedrooms"). | 1 day | ⬜ |
| **D4.4** | Tests | Modal renders new bars + badges; toast on under-3 candidates. | 1 day | ⬜ |

### §9.5 — Phase D5 — Documentation

| ID | Subphase | What | Estimate | Status |
|---|---|---|---|---|
| **D5.1** | Update `programRules` SPEC | SPEC-ARCHITECTURAL-PROGRAM-RULES gains a §Dimensions section pointing at `roomDimensions.ts`. | 0.5 day | ⬜ |
| **D5.2** | Update `C09 §3.4` contract | Add §3.4.3 "Dimensional validators" naming the two validators + their pipeline position. | 0.5 day | ⬜ |
| **D5.3** | User-guide entry | Brief: "Why a 20 m² bathroom won't generate." | 0.5 day | ⬜ |

### §9.6 — Phase D6 — Tightening

| ID | Subphase | What | Estimate | Status |
|---|---|---|---|---|
| **D6.1** | Tighten existing minima against the framework | Reconcile every existing `programRules.minAreaM2` / `minShortSideM` against the §5 framework. Discrepancies (kitchen 1.8 vs 2.1, bathroom 5 vs 3.5) audited + resolved with documented rationale. | 1 day | ⬜ |
| **D6.2** | Psychological-geometry axis | New SOFT axis `psychological`: bed-aligned-with-door, bath-direct-from-entry, kitchen-visible-from-front-door. Heads toward cognition-stack §3.E. | 2 days | ⬜ |
| **D6.3** | Hierarchy axis | Living > hall area constraint (§3.3); already partially in cognition-stack L2-β-1. Cross-link. | inherited | ⬜ |

### §9.7 — Rollup

| Phase | Total estimate | Blocked by |
|---|---|---|
| **D1 — Data** | ~4 days | — |
| **D2 — Validators** | ~11.5 days | D1 |
| **D3 — Pipeline integration** | ~6 days | D2 |
| **D4 — Modal surfacing** | ~3.5 days | D3 + modal pipeline |
| **D5 — Documentation** | ~1.5 days | D2 |
| **D6 — Tightening** | ~3 days | D1 + cognition-stack L2-β-1 |
| **TOTAL** | **~29 dev-days** (~6 weeks single-contributor) | — |

This is a self-contained tier — does NOT block the furniture plan F1–F8, does NOT block the cognition-stack L1–L7. It can ship in parallel.

---

## §10 — Why this layer comes BEFORE furniture (the architectural insight)

> Furniture placement should not compensate for bad room geometry.

The current pipeline pushes geometry quality issues DOWN into the furnishing engine: a tunnel bathroom passes subdivide, the D-FLE solver tries every wall, fails to find an anchor for the vanity, drops it silently. The visible defect is "vanity missing" — but the real defect is "room shape is wrong." Fixing it in the furnishing engine produces brittle compensation logic.

**The right place to enforce dimensional sanity is between subdivide and furnish.** A room that can't accommodate its required program is REJECTED at this layer — the apartment regenerates with a different subdivision. By the time the furnishing engine sees a layout, every room has already been geometrically vetted.

This is a clean separation:

- **D-TGL** owns *which room is where + how big*.
- **THIS layer** owns *is the room SHAPE legal*.
- **D-FLE** owns *where each piece of furniture goes*.

Mixing these produces compensation logic in D-FLE. Separating them produces clean, debuggable, contract-compliant code.

---

## §11 — Plan-level gaps THIS doc closes in the other apartment docs

| Other doc | Gap THIS doc closes |
|---|---|
| `APARTMENT-LAYOUT-STATUS-2026-05-29.md` §3 Tier 1B "Corridor connectivity validator" | The corridor-width / length / ratio rules in §5.9 are the dimensional input; the validator becomes "shape + connectivity" combined. |
| `APARTMENT-DRIVING-PRINCIPLES…matrix.md` Part B (Room × Element matrix) | The matrix says WHAT element goes in WHICH room; this doc says WHETHER THE ROOM CAN ACCOMMODATE IT geometrically. |
| `APARTMENT-COGNITION-STACK…plan.md` L2-β-1 (`hierarchy` axis) | Hierarchy needs G9 (living > hall area). This doc supplies the data. |
| `APARTMENT-COGNITION-STACK…plan.md` L4-δ-4 (Proportional elegance) | This doc supplies the per-room aspect-ratio limits + corner-integrity rules — the engine for §L4-δ-4. |
| `APARTMENT-FURNITURE-AND-ACTIVITY…plan.md` F4 (Activity systems) | Activity systems assume the room CAN accommodate them. THIS doc is the precondition. |
| `single-apartment-fix-pass-spec.md` queue | Fail #1 (kitchen-merged), #4 (doors-missing), implicit #5 (no windows) all have a dimensional component — this doc's validators catch the geometric class of failures. |

---

---

# Part B — Adjacency & Spatial-Relationship Framework

> **The missing semantic-topology layer that sits BEFORE geometry and furnishing.** Together with Part A above, this completes the pre-furnishing validator stack: Part A validates *shape*, Part B validates *connectivity / relationships*. Both run before D-FLE; both are pure.

PRYZM today has a partial implementation: `programRules.accessFrom` enforces door-legality (post §BATH-CORRIDOR-ONLY closure) and `§ADJACENCY-PREFERENCE` provides soft preference weights for the Pareto scoring. The framework below subsumes both into a richer **8-category adjacency taxonomy** with explicit privacy / acoustic / wet-service / frontage / circulation layers.

---

## §13 — Adjacency taxonomy

Eight categories, each enforced at a different pipeline stage.

| ID | Category | What it controls | Stage | Today |
|---|---|---|---|---|
| **A1** | Mandatory adjacency | Two rooms MUST share a wall or door (e.g. master ↔ ensuite). | Bubble graph build | 🟡 Hard-coded for ensuite |
| **A2** | Preferred adjacency | SOFT-PENALTY when missing (e.g. kitchen ↔ dining). | Pareto scoring | ✅ `§ADJACENCY-PREFERENCE` (`587f7b0`) |
| **A3** | Forbidden / penalised | HARD-REJECT (e.g. bedroom ↔ bedroom direct door) OR severe penalty for proximity. | Walls + doors emit | ✅ `doorAllowedBetween()` |
| **A4** | Privacy gradient | Public → semi-public → private → intimate distance from entrance. | Subdivide + score | 🟡 `circulation` axis partial |
| **A5** | Acoustic zoning | Acoustic-sensitive rooms (master, study) separated from acoustic-generating rooms (living, kitchen) by ≥ 1 buffer room or insulated wall. | Score + wall-type | ❌ Absent |
| **A6** | Wet-service clustering | All wet rooms (bathroom + ensuite + WC + kitchen + utility) cluster around a common vertical stack. | Score | ❌ Absent |
| **A7** | Frontage hierarchy | Highest-priority rooms claim the best façade edges (cross-ref §3.3). | D-TGL P3 | ❌ Absent (planned as D2.5 frontage allocator) |
| **A8** | Circulation sequencing | The arrival sequence is ordered: entry → hall → social → private. No backtracking through private zones to reach public zones. | Score | ❌ Absent (cognition-stack L2-β-3 covers this) |

---

## §14 — Per-room adjacency matrices

For each of the 10 room types, the matrix declares: **mandatory** · **preferred** · **forbidden/penalised** · **behavioural rule**. Severity in brackets.

### §14.1 — Living room

- **Mandatory.** Direct or open access from `hall` OR `corridor` [A1-HARD]. At least one exterior wall [G8-HARD].
- **Preferred.** Adjacent / open to `kitchen` (1.0) + `dining` (1.0) + `hall` (0.8). Sightline to entry [A4-SOFT].
- **Forbidden.** Direct door from `bathroom` / `ensuite` / `wc` [A3-HARD]. Direct adjacency to `utility` (acoustic / smell) [A5-SOFT].
- **Behavioural.** Spatial climax — dominates hall area (G9-SOFT). Receives best façade (A7-SOFT). Visually terminates arrival axis.

### §14.2 — Kitchen

- **Mandatory.** Door OR open threshold to `dining` OR `living` (must be reachable via the social cluster, NEVER directly off hall) [A1-HARD; codified post `§KITCHEN-DISTINCT`].
- **Preferred.** Open-plan with `dining` (1.0) + `living` (0.8) + adjacent `utility` (0.6) for service flow.
- **Forbidden.** Direct adjacency to `bathroom` / `ensuite` / `wc` (food-prep + sanitary cross-zone) [A3-HARD]. Direct door from `hall` (codified).
- **Behavioural.** Wet-zone cluster member [A6]. Work triangle internal (§5.2 G10). Window preferred over sink (Part A §A.2).

### §14.3 — Dining

- **Mandatory.** Adjacent to `kitchen` (cooking → serving flow) [A1-HARD when both present].
- **Preferred.** Open to `living` (1.0 / 0.9 depending on toggle); window for daylight (SOFT).
- **Forbidden.** Direct door from `bathroom` / `ensuite` / `wc` [A3-HARD]. Through-circulation to private zones [A8-SOFT].
- **Behavioural.** May merge with living in lounge-diner pattern (open-plan toggle).

### §14.4 — Master bedroom

- **Mandatory.** Access from `corridor` (codified) [A1-HARD]. Ensuite (when present in program) directly accessible from master ONLY [A1-HARD + A3-HARD-elsewhere].
- **Preferred.** Adjacent to `wardrobe`/`dressing` zone (1.0); window mandatory (G8-HARD); exterior wall, ideally corner (A7-SOFT).
- **Forbidden.** Direct door from any other bedroom [A3-HARD]. Direct door from social zones (living / dining / kitchen) without a buffer [A4-SOFT-PENALTY]. Adjacency to noisy walls (kitchen / utility) without acoustic insulation [A5-SOFT].
- **Behavioural.** Deepest in privacy gradient (A4 depth ≥ 3 from entry). Acoustically buffered from living (A5).

### §14.5 — Secondary bedroom

- **Mandatory.** Access from `corridor` [A1-HARD]. Window (G8-HARD).
- **Preferred.** Exterior wall (G8-SOFT); proximity to shared `bathroom` (A1-SOFT).
- **Forbidden.** Direct bedroom-to-bedroom door [A3-HARD]. Direct access from kitchen / living [A3-HARD]. Direct access from hall [A3-HARD].
- **Behavioural.** Privacy depth ≥ 3 from entry. Acoustically buffered from living.

### §14.6 — Bathroom (shared)

- **Mandatory.** ONE door, from `corridor` ONLY (post §BATH-CORRIDOR-ONLY) [A1-HARD + A3-HARD-elsewhere].
- **Preferred.** Wet-stack cluster with `ensuite` + `kitchen` + `utility` (1.0 within cluster) [A6-SOFT]; near bedroom cluster (1.0).
- **Forbidden.** Direct door from `bedroom` / `master` (that's the ensuite semantic) [A3-HARD]. Direct door from `hall` (codified) [A3-HARD]. Direct door from `kitchen` / `living` / `dining` [A3-HARD].
- **Behavioural.** Sightline from entry to bathroom door SOFT-PENALISED [A8/cognition-stack L2-β-2]. Wet-zone member [A6]. Privacy depth ≥ 3.

### §14.7 — Ensuite

- **Mandatory.** ONE door, from `master` ONLY [A1-HARD + A3-HARD-elsewhere; codified `accessFrom: ['master']`].
- **Preferred.** Wet-stack cluster [A6]. Adjacent to bathroom if both exist (plumbing economy) [A6].
- **Forbidden.** ANY other door [A3-HARD].
- **Behavioural.** Highest privacy depth (intimate tier in A4).

### §14.8 — WC

- **Mandatory.** ONE door, from `corridor` OR `hall` (cloakroom pattern) [A1-HARD].
- **Preferred.** Wet-stack cluster [A6]. Near `hall` (cloakroom-by-the-front-door pattern, A7-SOFT-bonus).
- **Forbidden.** Direct door from `bedroom` / `master` / `kitchen` / `living` / `dining` / `bathroom` (no wet-to-wet through-room) [A3-HARD].
- **Behavioural.** SOFT-PENALTY when sightline-from-entry hits the WC door.

### §14.9 — Study

- **Mandatory.** Access from `corridor` OR `living` [A1-HARD].
- **Preferred.** Window for daylight (G8); acoustic buffer from kitchen / living [A5-SOFT].
- **Forbidden.** Adjacency to acoustic-generating rooms (kitchen / living) without buffer [A5-SOFT].
- **Behavioural.** Quiet-zone tier in A4.

### §14.10 — Hall (entrance)

- **Mandatory.** Hosts the front door [A1-HARD]. Direct access to `corridor` AND/OR `living` [A1-HARD]. Front door swing-arc fits inside hall (G5-HARD per §5.8).
- **Preferred.** Sightline terminates on daylight (living window) not on bath/wc/bedroom doors [A4 + A8-SOFT].
- **Forbidden.** Direct door from `bedroom` / `bathroom` / `kitchen` / `wc` (clean lobby rule, codified) [A3-HARD]. WC adjacency is the SINGLE exception (cloakroom-by-front-door pattern) [A1-permitted].
- **Behavioural.** Public tier in A4. Compressed threshold (cognition-stack L2-β-3 arrival sequence).

### §14.11 — Corridor

- **Mandatory.** Connects to `hall` at one end (codified A1). Serves at least 2 rooms (cognition-stack L2-β-1 dead-end avoidance) [A1-HARD].
- **Preferred.** Straight, not branching (corridor morphology, cognition-stack §5.3 Layer 4). Terminates on a window or daylit room, not a blank wall [A8-SOFT].
- **Forbidden.** Direct exterior-frontage allocation when other rooms need it [A7-SOFT-PENALTY]. Dead-end serving only 1 room [A1-HARD-REJECT in cognition-stack L2-β-1].
- **Behavioural.** Circulation tier in A4. The private-zone spine.

### §14.12 — Utility

- **Mandatory.** Access from `corridor` OR `kitchen` [A1-HARD].
- **Preferred.** Wet-stack cluster with kitchen [A6]. Direct adjacency to kitchen for service flow [A1-SOFT].
- **Forbidden.** Direct door from `bedroom` / `living` / `dining` / `bathroom` [A3-HARD].
- **Behavioural.** Wet/service tier. Acoustic source — buffer from sleeping zones [A5-SOFT].

---

## §15 — Adjacency matrix (full grid)

Every pair (RoomType × RoomType). `M` = mandatory · `P` = preferred · `F` = forbidden · `–` = neutral / case-dependent. Symmetric.

|  | hall | corridor | living | dining | kitchen | master | bedroom | bath | ensuite | wc | study | utility |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **hall** | – | M | M | F | F | F | F | F | F | P | F | F |
| **corridor** | M | – | – | – | – | M | M | M | F | M | M | M |
| **living** | M | – | – | P | P | – | – | F | F | F | – | F |
| **dining** | F | – | P | – | M | – | – | F | F | F | – | – |
| **kitchen** | F | – | P | M | – | F | F | F | F | F | F | P |
| **master** | F | M | – | – | F | – | F | F | M | F | – | F |
| **bedroom** | F | M | – | – | F | F | – | F | F | F | – | F |
| **bath** | F | M | F | F | F | F | F | – | – | F | F | F |
| **ensuite** | F | F | F | F | F | M | F | – | – | F | F | F |
| **wc** | P | M | F | F | F | F | F | F | F | – | F | F |
| **study** | F | M | – | – | F | – | – | F | F | F | – | F |
| **utility** | F | M | F | – | P | F | F | F | F | F | F | – |

Reading: row × column. `M` = at least one side declares as mandatory; `F` = at least one side forbids; `P` = at least one side prefers. (More-precise per-direction matrices live in §14.)

---

## §16 — Graph-scoring penalties

Each violation contributes a delta to the `adjacency` axis (or a new `topology` axis). Same severity scheme as Part A.

| Violation | Severity |
|---|---|
| Mandatory adjacency missing (e.g. master without ensuite when program requests it) | HARD-REJECT |
| Forbidden adjacency realised (e.g. bedroom ↔ bedroom direct door) | HARD-REJECT |
| Preferred adjacency missing (e.g. kitchen ↔ dining not adjacent) | SOFT-PENALTY, scaled by preference weight (post `§ADJACENCY-PREFERENCE`) |
| Privacy depth inversion (bedroom shallower than living from entry) | SOFT-PENALTY (cognition-stack L2-β-1) |
| Acoustic adjacency without buffer | SOFT-PENALTY scaled by source/receiver pair |
| Wet-zone fragmentation (bath + ensuite + wc not in shared cluster) | SOFT-PENALTY (rises with shaft count) |
| Frontage misallocation (corridor on south, bedroom interior) | SOFT-PENALTY scaled by façade value (cognition-stack L1-α-1) |
| Arrival sequence violation (must enter through living to reach hall) | SOFT-PENALTY (cognition-stack L2-β-3) |
| Dead-end corridor (serves 1 room) | HARD-REJECT |

---

## §17 — Implementation architecture

### §17.1 — Pure validators (`packages/ai-host/src/workflows/apartmentLayout/topology/`)

| File | What |
|---|---|
| `types.ts` | `AdjacencyCategory` enum + `AdjacencyRule` types + `TopologyValidation` result. |
| `adjacencyRules.ts` | The per-room MUST / PREFERRED / FORBIDDEN matrices from §14, machine-readable. |
| `validateMandatoryAdjacencies.ts` | Walks the bubble graph + room placements; checks every A1 entry. Returns hard-rejections. |
| `validateForbiddenAdjacencies.ts` | A3 grid + door-set check. Returns hard-rejections. |
| `validateAcousticZoning.ts` | A5 — for each (source, receiver) pair, verifies buffer-room count OR insulated-wall flag. |
| `validateWetCluster.ts` | A6 — counts distinct vertical-stack groups across bath / ensuite / wc / kitchen / utility. |
| `validateFrontageAllocation.ts` | A7 — pulls façade values from cognition-stack L1-α-1; verifies priority order. |
| `scoreCirculationSequence.ts` | A8 — from entry, BFS through doors; penalises out-of-order privacy hops. |

### §17.2 — Solver integration order

Slot every validator into the existing pipeline at the correct stage:

```
shell + program
    │
    ▼
D-TGL bubble graph build
    │
    ▼   ←──── A1 mandatory adjacencies (build-time required edges)
D-TGL subdivide
    │
    ▼   ←──── Part A: shape validators (G1–G7)
D-TGL doors + windows
    │
    ▼   ←──── A3 forbidden adjacencies (door-pair gate, today's doorAllowedBetween)
    ▼   ←──── A5 acoustic zoning, A6 wet cluster (room-position checks)
    ▼   ←──── A7 frontage allocation (façade-value × priority)
    ▼   ←──── A8 circulation sequence
    ▼   ←──── Part A: fit validators (G5, G10)
D-FLE furnishing
    │
    ▼
§F-Sprint-5 post-furnish circulation gate
    │
    ▼
Pareto rank (with `topology` and `shape`/`fit` axes from Parts A + B)
```

### §17.3 — New objective axes

Add to `ObjectiveVector`:

- `shapeQuality` (Part A) — 1 − Σ shape-penalties / total checks.
- `fitQuality` (Part A) — 1 − Σ fit-penalties / total checks.
- `topologyQuality` (Part B) — 1 − Σ topology-penalties / total checks.

Pareto rank already handles per-axis dominance — these add three new orthogonal axes.

---

## §18 — Gap analysis: current PRYZM vs framework

| Category | Today | Gap |
|---|---|---|
| A1 Mandatory | 🟡 Hard-coded edges in `bubbleGraph` for master↔ensuite + spine↔bedrooms | Generalise to a declarative rule table |
| A2 Preferred | ✅ `§ADJACENCY-PREFERENCE` weights (`587f7b0`) | None |
| A3 Forbidden | ✅ `doorAllowedBetween()` + per-room `accessFrom` | None |
| A4 Privacy gradient | 🟡 `circulation` axis partial | Codify as discrete depth-tier targets |
| A5 Acoustic zoning | ❌ Absent | Full new validator |
| A6 Wet cluster | ❌ Absent | Full new validator |
| A7 Frontage hierarchy | ❌ Absent | Same as Part A D2.5 (shared with façade allocator) |
| A8 Circulation sequence | ❌ Absent | Cognition-stack L2-β-3 (arrival sequence) |

---

## §19 — Status-tracked implementation plan (Part B)

### §19.1 — Phase T1 — Data: adjacency rules

| ID | Subphase | What | Estimate | Status |
|---|---|---|---|---|
| **T1.1** | `AdjacencyRule` types + `TopologyValidation` result | TypeScript types + Zod schemas. | 0.5 day | ⬜ |
| **T1.2** | Machine-readable adjacency matrices | §14 per-room rules into `adjacencyRules.ts`. | 1 day | ⬜ |
| **T1.3** | Full pair grid (§15) as a derived table | One declarative table; tests verify symmetry + completeness. | 0.5 day | ⬜ |
| **T1.4** | Acoustic zoning data | Source/receiver pair table; buffer-room types acceptable per pair. | 0.5 day | ⬜ |
| **T1.5** | Wet-cluster data | Which room types are wet; preferred cluster sizes. | 0.5 day | ⬜ |
| **T1.6** | Tests | Snapshot tests pin every value. | 0.5 day | ⬜ |

### §19.2 — Phase T2 — Validators

| ID | Subphase | What | Estimate | Status |
|---|---|---|---|---|
| **T2.1** | `validateMandatoryAdjacencies` | Pure; reads bubble-graph + room placements. | 1 day | ⬜ |
| **T2.2** | `validateForbiddenAdjacencies` | Pure; reads door set. Largely already covered by `doorAllowedBetween` — wrap with the new result shape. | 0.5 day | ⬜ |
| **T2.3** | `validateAcousticZoning` | BFS distance from source to receiver; counts intervening rooms. | 1 day | ⬜ |
| **T2.4** | `validateWetCluster` | Vertical-stack grouping by shared-wall analysis. | 1 day | ⬜ |
| **T2.5** | `validateFrontageAllocation` | Shares the §3.3 allocator from Part A D2.5 — folds into one impl. | inherited | ⬜ |
| **T2.6** | `scoreCirculationSequence` | Arrival-sequence BFS, codified from cognition-stack L2-β-3. | 1.5 days | ⬜ |
| **T2.7** | Tests | Per validator — happy / failing / borderline. | 2 days | ⬜ |

### §19.3 — Phase T3 — Pipeline integration

| ID | Subphase | What | Estimate | Status |
|---|---|---|---|---|
| **T3.1** | `bubbleGraph.ts` reads A1 declarative rules | Replace hard-coded master↔ensuite + spine↔bedroom edges with a generic rule walker. | 1 day | ⬜ |
| **T3.2** | `enumerate.ts` gate for A1 + A3 + acoustic + wet + sequence | Same drop-vs-penalise logic as Part A D3.1 + D3.2. | 1 day | ⬜ |
| **T3.3** | New `topologyQuality` axis in `ObjectiveVector` | Computed as 1 − Σ-penalties / total. | 0.5 day | ⬜ |
| **T3.4** | Tests + integration | End-to-end fixtures: forbidden door realised, acoustic adjacency, fragmented wet. | 2 days | ⬜ |

### §19.4 — Phase T4 — Modal surfacing

| ID | Subphase | What | Estimate | Status |
|---|---|---|---|---|
| **T4.1** | `Topology` axis bar in score breakdown | 4th bar (after Shape, Fit, Topology). | 0.5 day | ⬜ |
| **T4.2** | Per-violation badges | "Bath visible from entry", "Master beside kitchen — acoustic risk". | 1 day | ⬜ |
| **T4.3** | Tests | UI + snapshot. | 0.5 day | ⬜ |

### §19.5 — Phase T5 — Documentation

| ID | Subphase | What | Estimate | Status |
|---|---|---|---|---|
| **T5.1** | Update `SPEC-ARCHITECTURAL-PROGRAM-RULES` | Add §Adjacency section pointing at `adjacencyRules.ts`. | 0.5 day | ⬜ |
| **T5.2** | Update `C09 §3.4` contract | Append §3.4.4 "Topology validators". | 0.5 day | ⬜ |
| **T5.3** | User-guide | "Why your layout has a Topology bar." | 0.5 day | ⬜ |

### §19.6 — Rollup (Part B)

| Phase | Total estimate | Blocked by |
|---|---|---|
| **T1 — Data** | ~3 days | — |
| **T2 — Validators** | ~7 days | T1 + Part A D2.5 (shared frontage allocator) |
| **T3 — Pipeline integration** | ~5 days | T2 + Part A D3.4 (shared objective axis pattern) |
| **T4 — Modal surfacing** | ~2 days | T3 + modal pipeline |
| **T5 — Documentation** | ~1.5 days | T2 |
| **TOTAL Part B** | **~18 dev-days** (~3.5 weeks) | — |

### §19.7 — Combined Part A + Part B rollup

| Layer | Part A (dimensional) | Part B (topology) | Combined |
|---|---|---|---|
| Data | 4 days | 3 days | 7 days |
| Validators | 11.5 days | 7 days | 18.5 days |
| Pipeline integration | 6 days | 5 days | 11 days |
| Modal surfacing | 3.5 days | 2 days | 5.5 days |
| Documentation | 1.5 days | 1.5 days | 3 days |
| Tightening | 3 days | – | 3 days |
| **TOTAL** | **29 days** | **18 days** | **~47 dev-days (~9–10 weeks single-contributor)** |

Both Parts can interleave (D2.5 frontage allocator is shared); parallel two-contributor delivery brings it to ~4–5 weeks.

---

## §12 — Pointers

- `packages/ai-host/src/workflows/apartmentLayout/rules/programRules.ts` — current room-level rules (this doc extends).
- `packages/ai-host/src/workflows/apartmentLayout/tgl/subdivide.ts` — where shape validation gates plug in.
- `packages/ai-host/src/workflows/apartmentLayout/tgl/enumerate.ts` — where the gates run per candidate.
- `packages/ai-host/src/workflows/apartmentLayout/tgl/objectives.ts` — where `shapeQuality` + `fitQuality` axes land.
- `packages/ai-host/src/workflows/furnishLayout/footprints.ts` — fixture clearances consumed by D2.2 / D2.3 / D3.3.
- SPEC-ARCHITECTURAL-PROGRAM-RULES.md — to be amended (D5.1).
- C09 §3.4 — to be amended (D5.2) with a new §3.4.3.
