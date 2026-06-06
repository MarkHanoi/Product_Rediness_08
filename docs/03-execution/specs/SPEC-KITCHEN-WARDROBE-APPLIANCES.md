# SPEC — Kitchen + Wardrobe I/L/U Runs & First-Class Kitchen Appliances

**Tracker:** A.21.D20 · **Status:** ✅ shipped 2026-06-06 (in-browser verify + appliance-picker polish pending)
**Founder request (2026-06-06):** kitchen + wardrobe get I / L / U run layouts, and the kitchen gets
REAL appliances (oven, hob/cooktop, fridge, dishwasher, washing machine, sink, extractor) as
first-class furniture.

This is the largest of three parallel A.21.D features — it crosses **L0 schemas → geometry builders
→ furnish archetypes/engine → UI**.

---

## 1. Goals

1. The kitchen is laid out as a real **I** (one wall) / **L** (two adjacent walls) / **U** (three
   walls) cabinet **run**, chosen automatically by the room's aspect + free-wall count, or forced by
   a brief field.
2. The kitchen carries **first-class appliances** placed **IN the run** — sink, hob, oven,
   dishwasher, fridge (+ washing machine when there's no utility room), with an **extractor** mounted
   over the hob — honouring the NKBA **sink↔hob↔fridge work-triangle**.
3. The **wardrobe** gets the same I / L / U run treatment along the bedroom's free wall(s).
4. The new appliance kinds are first-class `FurnitureType`s: they validate, render, schedule, and
   appear in the furniture picker like any other furniture.

## 2. Layered design (no cross-layer violations)

| Layer | What changed |
|---|---|
| **L0 schemas / pure types** | `geometry-furniture/FurnitureTypes` `FurnitureType` union + the pure `ai-host/furnishLayout/types` `FurnitureKind` gain `fridge, oven, hob, dishwasher, washing_machine, sink, extractor, base_unit, wall_unit`. Exhaustive `FurnitureCategoryMap` (→ `'kitchen'`) + `FurnitureMaterialIntent` maps extended (the `Record<FurnitureType,…>` types make completeness a **compile-time** gate). Standard 600 mm footprints in `furnishLayout/footprints`. No THREE/DOM in these. |
| **Geometry / renderer** | NEW `geometry-furniture/builders/ApplianceBuilders.ts` — one lightweight, correctly-**sized** + **front-faced** box proxy per appliance (`Sink/Hob/Oven/Dishwasher/WashingMachine/Fridge/Extractor/BaseUnit/WallUnit`), registered in `FurnitureFactory` (fridge promoted from the pantry proxy to its own `FridgeBuilder`) and re-exported from the package index. |
| **ai-host (pure engine)** | NEW `furnishLayout/kitchenLayout.ts` (`planKitchen`) + `furnishLayout/wardrobeLayout.ts` (`planWardrobe`). `furnishRoom`/`furnishRoomCompound` gain `FurnishOptions` and route kitchen → `planKitchen`, bedroom wardrobe → `planWardrobe`. `validateKitchenFromFurniture` reads explicit sink/hob/fridge. |
| **editor (UI / wiring)** | `kitchenLayout` select field on the apartment manifest brief; `FurnishLayoutExecutor` reads `kitchenLayout`/`wardrobeLayout` from the active brief + adds a kitchen washing machine when there's no utility room. New appliance types listed in the **Kitchen** picker category (`FurnitureCategoryDataB`). |

## 3. New `FurnitureType` / `FurnitureKind` members + dimensions

| Kind | w (m) | l/depth (m) | h (m) | baseOffset (m) | clearFront | Notes |
|---|---|---|---|---|---|---|
| `sink` | 0.60 | 0.60 | 0.90 | 0 | 0.90 | Worktop module + recessed basin + tap. |
| `hob` | 0.60 | 0.60 | 0.90 | 0 | 0.90 | Cooktop; extractor mounts above. |
| `oven` | 0.60 | 0.60 | 0.90 | 0 | 0.90 | Under-counter built-in. |
| `dishwasher` | 0.60 | 0.60 | 0.90 | 0 | 0.90 | Integrated 600. |
| `washing_machine` | 0.60 | 0.60 | 0.90 | 0 | 0.90 | Kitchen-mounted (distinct from `washing_machine_standalone` → utility). |
| `fridge` | 0.60 | 0.65 | 1.80 | 0 | 1.00 | Tall free-standing; promoted to a first-class type + `FridgeBuilder`. |
| `extractor` | 0.60 | 0.45 | 0.45 | 1.50 | 0 | Wall-mounted hood over the hob. |
| `base_unit` | 0.60 | 0.60 | 0.90 | 0 | 0.90 | Generic 600 base cabinet + worktop. |
| `wall_unit` | 0.60 | 0.35 | 0.70 | 1.45 | 0 | 600 wall cabinet above the worktop. |

`FurnitureCategoryMap` → all `'kitchen'`. `FurnitureMaterialIntent`: appliances → `metal-cool` /
`plastic-utility`; cabinet modules → `mixed-kitchen`.

## 4. Shape selection (`planKitchen` / `planWardrobe`)

- **Arms** are perpendicular-chained walls (`buildChain`): L = end→back, U = end→back→other-end.
  Door walls are excluded outright (a run sliding past the door is unusable + the swing fouls the
  working zone).
- **AUTO doctrine:** the **L** is the default for typical kitchens — it is the reliable
  work-triangle (sink+hob on one wall, fridge on the perpendicular wall, every leg short). A **U** is
  chosen only when the room is compact (back wall ≤ ~3.3 m, 6–11 m²) so the cross-U fridge↔hob leg
  stays workable; long thin galleys → **I**. The brief override (`I`/`L`/`U`) is honoured, degrading
  gracefully when the geometry can't host the requested shape.

## 5. Work-triangle placement

The three primary stations are kept **compact around the arms' shared corner**: the spine arm carries
`sink → (dishwasher) → hob → oven` near the corner; a perpendicular arm carries the `fridge` one cell
off the corner (a base unit leads so it's a short walk, not crammed). The extractor is stacked
directly above the hob. This keeps every triangle leg inside the NKBA **1.2–2.7 m** window for the
auto (L) choice. A single-wall **I** kitchen is inherently linear — its triangle is the best one wall
allows and the validator soft/hard-flags it for the UI. `kitchenTrianglePoints()` exposes the
explicit sink/hob/fridge for `validateKitchenFromFurniture` (now NKBA-accurate, retiring the old
run-centre heuristic).

Determinism: no `Math.random`; fixed wall sort + module order.

## 6. Brief / UI

- Apartment manifest brief: NEW `select` field `kitchenLayout` — `Auto` (default) / `Single run (I)` /
  `L-shape` / `U-shape`. (The `style` field is owned separately — untouched.)
- `FurnishLayoutExecutor` reads `kitchenLayout` (and `wardrobeLayout`, if a future manifest declares
  it) from the active brief and passes `FurnishOptions` to `furnishRoom`/`furnishRoomCompound`; it
  also sets `kitchenWashingMachine = !hasUtilityRoom`.
- Furniture picker: the 9 new types are listed under the **Kitchen** category (procedural box
  proxies), so the user can drop individual appliances. Per-room default appliance selection in the
  auto-pipeline (e.g. tilt-turn-vent kitchen) remains a follow-up.

## 7. Styling / finishes

Appliances + cabinet modules read their colour/material from the SAME `styleFinish` category resolver
as the rest of D-FLE (owned by another agent — untouched). Unknown appliance kinds fall back to the
style's neutral tone gracefully; `ApplianceBuilders` read `data.color`/`data.material` where it reads
well (steel/grey appliances, timber cabinets).

## 8. Tests

- NEW `ai-host/__tests__/kitchenWardrobeAppliances.test.ts` (18): appliance presence; extractor over
  hob; in-polygon + non-overlap; I/L/U chosen by aspect + forced by brief; NKBA-sane auto triangle;
  U places three-wall stations; washing-machine toggle; determinism; no door-wall module; wardrobe
  I/L/U + no-overlap; normalisers.
- Updated `furnishSolver.test.ts` kitchen cases for the appliance-based output.
- **1602 ai-host tests green.** ai-host + the touched geometry-furniture files typecheck clean.

## 9. Known follow-ups

- **In-browser verification** of the live furnish run (kitchen L/U with appliances; bedroom
  wardrobe).
- A **U-shape NKBA triangle** is borderline by geometry; auto prefers L. A future refinement could
  place the fridge nearer the corner for wide U rooms.
- **Dedicated detailed appliance models** (recessed handles, brushed metal) — current proxies are
  demo-grade.
- **Per-room default appliance variants** (privacy/obscure glazing logic is in a sibling queue).
