# SPEC — Architectural Program Rules (the room rule database)

- **Status:** v1.0 — IMPLEMENTED (offline D-TGL + D-FLE)
- **Owner:** AI / generative design
- **Implements:** the user requirement — *"clear rules, architecturally sound: every room needs ≥1 door; a bedroom needs a bed, 2 bedside tables, lighting, a wardrobe and a door onto a corridor/living/dining; a bathroom connects only to one bedroom or corridor and has a toilet, washbasin, shower/bath."*
- **Single source of truth (code):** [`packages/ai-host/src/workflows/apartmentLayout/rules/programRules.ts`](../../../../packages/ai-host/src/workflows/apartmentLayout/rules/programRules.ts)
- **Governs / is consumed by:** `tgl/bubbleGraph.ts` (sizing + program), `tgl/wallsAndDoors.ts` (door permission + caps), `tgl/enumerate.ts` (legality gate), `validate.ts` (V1–V9), `tgl/emitGeometry.ts` (occupancy), `furnishLayout/archetypes.ts` (furniture program).
- **Conflict order:** VISION → ARCHITECTURE → C-contracts → this SPEC → code. When code disagrees with this table, **the code is wrong** — fix the code or supersede this SPEC.
- **Related:** [SPEC-LAYOUT-CONSTRAINT-DATABASE](./SPEC-LAYOUT-CONSTRAINT-DATABASE.md) (248 normative constraints — UK Building Regs / London Plan / HQI / BS / BRE / CIBSE / NKBA / IEE / ISO 16739; this SPEC is the connectivity + program subset that drives the engine today), [SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE](./SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE.md), [SPEC-FURNITURE-LAYOUT-ENGINE](./SPEC-FURNITURE-LAYOUT-ENGINE.md), [C09](../../../00_Contracts/C09-AI-AND-VISIBILITY-INTENT.md), [C15](../../../00_Contracts/C15-HOSTED-ELEMENTS.md).

---

## 1. Why this exists

The deterministic layout engine (D-TGL) used to guarantee **reachability** ("no sealed
room") but not **logic**: with an awkward placement it could connect a bedroom only
through *another* bedroom, or hang a bathroom off a kitchen. The user reported exactly
this ("one bedroom accessible only by another bedroom"). The fix is a **normative,
machine-readable rule database**: one table that says, for every room type, how big it
must be, what it must contain, and — crucially — **which other rooms a door may connect
it to**. Every stage of the engine reads from this one table, so the rules cannot drift
between the planner, the door solver, the validator and the furniture engine.

The database is **pure data + pure predicates** (zero I/O, zero THREE, zero DOM) and is
pinned by the test suite (`programRules.test.ts`, `furnishRules.test.ts`,
`tglWallsAndDoors.test.ts`).

---

## 2. Room program table

`occupancy` is the editor `RoomOccupancyType` (colour/tag). `area` is the hard minimum
net floor area (m²); `0` = no minimum. `short` is the minimum shortest plan side (m).
`window`: `M` = legally mandatory (validate V2 rejects if absent), `h` = habitable
(daylight scoring only), `–` = none. `cap` = privacy door cap.

| Room | occupancy | privacy | weight | area | short | window | cap |
|------|-----------|---------|:--:|:--:|:--:|:--:|:--:|
| Living | `living-room` | public | 1.70 | 18 | 2.7 | M | ∞ |
| Kitchen | `kitchen` | public | 0.95 | 8 | 1.8 | M | ∞ |
| Dining | `dining-room` | public | 0.90 | 6 | 2.4 | h | ∞ |
| Hall (entrance) | `entrance-lobby` | circulation | 0.50 | 0 | 1.2 | – | ∞ |
| Corridor | `corridor` | circulation | 0.45 | 0 | 0.9 | – | ∞ |
| Master bedroom | `bedroom` | private | 1.30 | 12 | 2.6 | M | 2 |
| Bedroom | `bedroom` | private | 1.00 | 9 | 2.1 | M | 1 |
| Study | `private-office` | private | 0.85 | 5 | 2.0 | h | 1 |
| Bathroom | `bathroom` | private | 0.45 | 4 | 1.5 | – | 1 |
| En-suite | `bathroom` | private | 0.40 | 4 | 1.2 | – | 1 |
| Utility | `utility-room` | service | 0.40 | 0 | 1.5 | – | 1 |

**Privacy gradient** (space-syntax depth): `public` (shallow, near the entrance) →
`circulation` → `private` / `service` (deep). The daylight + circulation objectives
(P7) reward layouts that honour this gradient.

---

## 3. Connectivity matrix — which doors are PERMITTED

Each room lists the room types a **door** into it may connect to (`accessFrom`). The
permission is **symmetric**: a door `A↔B` is allowed when `B ∈ accessFrom(A)` **OR**
`A ∈ accessFrom(B)`. Everything else is **FORBIDDEN**.

| Room | door may connect to … |
|------|------------------------|
| Living | hall, corridor, kitchen, dining |
| Kitchen | hall, corridor, living, dining, utility |
| Dining | hall, corridor, living, kitchen |
| Hall | living, corridor, kitchen, dining, bedroom, master, bathroom, study, utility |
| Corridor | hall, living, kitchen, dining, bedroom, master, bathroom, study, utility |
| Master | corridor, hall, living, dining, **en-suite** |
| Bedroom | corridor, hall, living, dining |
| Study | corridor, hall, living |
| Bathroom | corridor, hall, bedroom, master |
| En-suite | **master only** |
| Utility | corridor, hall, kitchen |

**The user's rules, as they fall out of the matrix:**

- ✅ A bedroom door lands on a corridor, living or dining — **never another bedroom**
  (`bedroom ∉ accessFrom(bedroom)`), never a kitchen.
- ✅ A bathroom connects **only** to a corridor/hall or a bedroom — never a kitchen,
  living or dining — and `cap = 1` means **exactly one** door ("only with one").
- ✅ An en-suite is reached **only** through its master bedroom.
- ✅ Every room has at least one legal access type (no orphan), so "every room ≥1 door"
  is always achievable.

---

## 4. Door reconciliation (how the matrix is enforced) — `wallsAndDoors.ts` P4

1. **Intended doors.** The bubble graph's `via:'door'` edges (corridor→bedroom,
   master↔en-suite, corridor→bathroom) are placed first. They are legal by
   construction and seed the per-room door cap.
2. **Permitted reconcile (2a).** Spanning-tree (Kruskal, circulation-first) over the
   shared walls, **restricted to `doorAllowedBetween(a,b)` pairs that are still under
   their cap** — so every room becomes reachable through *architecturally legal* doors.
3. **Last-resort reconcile (2b).** If a room is *still* sealed (the placement boxed it
   in with only-forbidden neighbours), it gets a door across whatever wall reconnects
   it — a room is **never** left door-less — and each such door is counted as a
   **compromise**.
4. **Legality gate (P8, `enumerate.ts`).** The 8 strategy candidates are filtered to
   the best legality tier — **legal** (reachable, 0 compromises) → **reachable** →
   *anything* — and Pareto-ranked within it. So whenever *any* of the 8 strategies
   yields a fully-legal plan, **only legal plans are offered to the user**. This is the
   closed loop that fixes "bedroom-through-bedroom".

> A compromise is therefore the engine's honest signal that *this shell could not be
> laid out legally with the current (rectilinear) placement*. The deeper structural fix
> — adjacency-aware placement so private rooms always land on the corridor (P3c) — is
> tracked in [PLAN-GENERATIVE-DESIGN-SPRINTS](./PLAN-GENERATIVE-DESIGN-SPRINTS.md).

---

## 5. Validation rules (`validate.ts`)

Hard rules; any failure rejects an option (and is fed back into the AI retry prompt).

| # | Rule |
|---|------|
| V1 | Net floor area ≥ the room's `minAreaM2`. |
| V2 | A `windowMandatory` room has ≥1 window. |
| V3 | Direct access — reachable without passing through another room (en-suite via its master is allowed). |
| V4 | Narrowest corridor ≥ the project minimum corridor width. |
| V5 | Every door clear width ≥ 600 mm. |
| V6 | En-suite adjacent to a master; open-plan kitchen adjacent to a dining area. |
| V7 | Program satisfied (bedroom / bathroom counts, en-suite, living room present). |
| **V8** | **Connectivity legality** — every non-circulation room has ≥1 *permitted* access neighbour (a room boxed in by only-forbidden neighbours is rejected). |
| **V9** | **Access target** — a bedroom is adjacent to a corridor/hall/living/dining; a bathroom to a corridor/hall or a bedroom. |

---

## 6. Program — required contents per room

`furniture` = renderable `geometry-furniture` kinds the D-FLE places. `fixtures` =
the architectural wet-room checklist; some (the washbasin) are sourced from the
**Plumbing** system rather than the furniture catalogue, so they are listed here as the
spec and placed at the wiring layer.

| Room | required furniture | optional | required fixtures |
|------|--------------------|----------|-------------------|
| Bedroom / Master | **bed, 2× bedside table, wardrobe, lamp (lighting)** | — | — |
| Living | sofa | coffee table, lamp | — |
| Kitchen | kitchen run (L-shape) | — | sink |
| Dining | dining table, chairs | lamp | — |
| Bathroom / En-suite | toilet, shower | — | **toilet, washbasin, shower/bath** |
| Study | desk | chair, lamp | — |
| Hall | — | entrance table | — |
| Utility | — | — | sink |
| Corridor | — | — | — |

The furniture **archetypes** (`furnishLayout/archetypes.ts`) carry the *placement*
intelligence (anchor / facing / grouping); the rule database carries the *program*
(what must exist). `furnishRules.test.ts` asserts every archetype contains the
database's required furniture for its occupancy, so the two can never drift.

> **Placement caveat (best-effort).** The solver places what fits and skips the rest;
> in a wide-but-shallow bedroom the wardrobe (longest wall) can crowd out the second
> bedside table. The *program* (this table + the archetype) always specifies the full
> set; delivering it in every room geometry is a placement-quality goal (D-FLE P3c).

---

## 7. Worked example (the user's brief)

> *"Every bedroom requires a bed, 2 bedside tables, lighting, one wardrobe and a door;
> the door connects to a corridor / living / dining. The bathroom connects only to one
> bedroom or corridor and has a shower/bath, a toilet, a sink."*

| Brief | Where it lives | Enforced by |
|-------|----------------|-------------|
| bedroom door → corridor/living/dining | `bedroom.accessFrom` | wallsAndDoors 2a + validate V9 |
| bedroom **not** through another bedroom | `bedroom ∉ accessFrom(bedroom)` | wallsAndDoors permission + enumerate legality gate |
| bedroom = bed + 2 bedside + lamp + wardrobe | `bedroom.requiredFurniture` | archetype + furnishRoom |
| bathroom → only one bedroom or corridor | `bathroom.accessFrom` + `cap = 1` | wallsAndDoors permission + cap |
| bathroom = toilet + washbasin + shower | `bathroom.requiredFixtures/Furniture` | archetype (toilet, shower) + plumbing (washbasin) |
| every room ≥ 1 door | matrix has no orphan type | reconciliation (2a→2b never seals a room) |

---

## 7.5 — Dimensional + topological pre-furnishing validators (2026-05-29)

Beyond the per-room *permission* matrix above, two sister validator layers now run
between subdivision (D-TGL P3) and furnishing (D-FLE):

### 7.5.1 — Dimensional validators (Part A)

Per-room envelope check (`packages/ai-host/src/workflows/apartmentLayout/dimensions/`):

| File | Validates | Severity |
|------|-----------|----------|
| `roomDimensions.ts` | per-RoomType envelope: area min/max, width min/max, length max, aspect max, usable wall min | DATA |
| `validateRoomShape.ts` | G1 area + G2 width + G3 length + G4 aspect + G6 wall, against `RoomDimensions` | HARD + SOFT |
| `validateApartmentEnvelope.ts` | apartment gross area vs the §3.1 by-bedroom-count table | HARD + SOFT |

Hard findings (e.g. `bathroom.areaHardMax = 14 m²` → "20 m² bathroom rejected") drop
the candidate from the pool BEFORE Pareto. Soft findings feed
`objectives.shapeQuality`, an axis Pareto ranks against.

### 7.5.2 — Topology validators (Part B)

Per-pair / per-cluster adjacency check (`packages/ai-host/src/workflows/apartmentLayout/topology/`):

| File | Validates | Severity |
|------|-----------|----------|
| `adjacencyRules.ts` | mandatory-adjacency derivation from program; wet + acoustic classifications | DATA |
| `validateMandatoryAdjacencies.ts` | every declared mandatory (master↔ensuite, hall↔corridor, hall↔living) has a realised door | HARD |
| `validateForbiddenAdjacencies.ts` | every door is a permitted pair per `doorAllowedBetween` | HARD |
| `validateWetCluster.ts` | wet rooms cluster into a single plumbing stack | SOFT |
| `validateAcousticZoning.ts` | acoustic sources (living / dining / kitchen / utility) don't share a wall with receivers (master / bedroom / study) | SOFT |

Hard findings drop the candidate; soft findings feed `objectives.topologyQuality`.

### 7.5.3 — Gate semantics

`enumerate.ts` extends the legality gate to a 5-tier fallback that AND's all
admissibility flags:

```
clean (shape + topology) + legal      ← best
clean (shape + topology) + connected
legal                                  ← rule-legal but a soft finding
connected                              ← reachable; multiple compromises
anything                               ← last resort
```

Pareto ranks within the chosen tier over 8 axes:
`efficiency · adjacency · daylight · circulation · regularity · hierarchy · shapeQuality · topologyQuality`.

### 7.5.4 — How to extend

Adding a new constraint (e.g. "kitchen needs 900 mm uninterrupted prep wall"):

- If it's a per-room dimensional envelope → extend `RoomDimensions` (`roomDimensions.ts`) + an existing or new check in `validateRoomShape.ts`.
- If it's an adjacency / clustering rule → add a new `validate*.ts` in `topology/` and accumulate findings via the same `TopologyFinding` shape.

The validator MUST:
1. Be pure (no THREE / DOM / RNG).
2. Return `{ admissible, hardFindings, softFindings }`.
3. Have unit tests that pin both happy paths AND failure cases.

The enumerate gate consumes the result via `topologyAdmissible && shapeAdmissible`; no other file needs editing for new soft-only validators.

---

## 8. Change control

Edit `programRules.ts` **and** this table together (they are the same data in two
forms). The tests will fail if the matrix loses a user-stated rule. Adding a room type
fails compilation until its rule is authored (`Record<RoomType, RoomRule>` is
exhaustive). Never fork a second copy of these constants — the previous duplicates in
`bubbleGraph.ts`, `validate.ts` and `emitGeometry.ts` were collapsed into this database.
