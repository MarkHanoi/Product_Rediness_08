# SPEC — Room-and-Module Rule Engine (kitchen reference, per-room general)

- **Status:** Draft → scaffolding (2026-06-11)
- **Governs:** [ADR-0071](../../02-decisions/adrs/0071-room-and-module-rule-engine.md)
- **Extends:** SPEC-FURNITURE-LAYOUT-ENGINE (D-FLE) · SPEC-ARCHITECTURAL-PROGRAM-RULES (`programRules.ts`)
- **Consolidates:** SPEC-KITCHEN-WARDROBE-APPLIANCES, SPEC-KITCHEN-WARDROBE-WALL-DRIVEN
- **Source corpus:** the founder's 2026-06-11 kitchen rule specification (~300–500 rules) — captured below.

This spec turns furnishing from *parametric placement* into a **constraint-satisfaction + scoring optimisation**:
generate multiple candidate layouts, reject any that break a HARD rule, score the rest, keep the best. Kitchen is
the reference room; the schema is room-agnostic so every room type follows it.

## 1. Architecture (5 layers)

| Layer | Owns | Purity | Files (target) |
|---|---|---|---|
| **L1 Ontology** | module metadata (data) | pure data | `furnishLayout/rules/moduleOntology.ts` (+ per-room) |
| **L2 Rules** | HARD predicates + SCORING functions, by category | pure fns | `furnishLayout/rules/ruleSchema.ts` + `kitchenRules.ts` |
| **L3 Solver** | wall-classify → shape → place (canonical order) → validate(HARD) → score | orchestration | `furnishLayout/rules/solveRoom.ts` (extends `placeSolver`/`kitchenLayout`) |
| **L4 Intelligence** | generate N alternatives, rank by scorecard, record sub-scores | strategy | `solveRoom` loop + `scorecard.ts` |
| **L5 Per-room** | room-agnostic containers; each room ships its own ontology+rules+weights | data | `rules/<roomType>/*` |

**Two optimisation levels:** **Level 1** = *where* each module goes (placement); **Level 2** = *what is inside*
each module (cabinet type / drawer config / internal storage allocation). The engine optimises both.

## 2. Module ontology schema (L1)

Every module is one record (the founder's metadata, typed):

```ts
interface ModuleMeta {
  moduleType: string;            // 'Dishwasher' | 'SinkUnit' | 'HobUnit' | 'Fridge' | 'OvenTower' | 'BaseCabinet' | 'TallUnit' | 'CornerUnit' | 'Island' | 'Seating' | 'Pantry' | 'Extractor' | …
  widthMm: number; depthMm: number; heightMm: number;
  services: { water?: boolean; drain?: boolean; power?: boolean; duct?: boolean; gas?: boolean };
  clearance: { frontMm?: number; sideMm?: number; topMm?: number; openSwingMm?: number };  // door/drawer swing footprint
  preferredAdjacent: string[];   // e.g. Dishwasher → ['SinkUnit']
  forbiddenAdjacent: string[];   // e.g. ['Corner']
  forbiddenZones?: ('corner'|'underWindow'|'doorSwing'|'roomEnd')[];
  storageVolumeL?: number;
  weights: { workflow: number; ergonomic: number; cost: number; visual: number; scoreWeight: number };
  cabinetOptions?: CabinetOption[];   // Level-2: drawers/doors/glass/shelves/pullout + internal allocation
}
```

The kitchen seed (clearances/thresholds from the corpus): Dishwasher (w600, water+drain+power, front≥900, adjacent
Sink ≤1200/ideal≤600, never corner), Fridge (front≥1000, side-gap≥25/ideal≥100, top≥50, never corner/under-window,
near-entry bonus, filler-panel if wall-touch), Hob (to-tall≥300, to-wall≥300, sink-to-hob≥400/ideal600-1200,
landing each side ≥300/ideal600, never corner/room-end/under-window, upper only with extractor), Sink (landing each
side ≥300/ideal600, ≥300 from corner, under-window bonus, drain-run ≤3000/ideal≤1500), Oven (tall tower, centreline
900-1200, not beside fridge), Microwave (eye-level 1100-1400, near fridge, never above hob), Corner units
(magic/lemans/blind/lazySusan; never appliances), Island (room-width ≥3600, aisle ≥900/pref1200/lux1400, seat 600/
person, overhang ≥300/pref350-450, with-sink⇒dishwasher-adjacent, with-hob⇒landing≥300 each side, must justify).

## 3. Rule catalogue (L2)

**HARD (invalid if violated):** appliance collision · door/drawer swing clearance · corner-forbidden appliances ·
hob safety (≥300 to tall/wall) · sink-to-hob ≥400 · fridge ventilation (side≥25, top≥50) · island aisle ≥900 ·
window: no hob-under-window, no tall/cabinet over window, sill ≥950 vs 900 counter, no cabinet-depth into window ·
door: nothing in door-swing, landing ≥900 after entry · MEP: never block panel/valves · construction: filler ≥25
on wall-touch, appliances removable, drawer/door open-simulation collision-free · clear-height: no tall where
height <2200.

**SCORING (graded 0–100 per axis):** work-triangle (legs 1.2–2.7 m, perimeter 4–7.9 m; no path crossing island;
Fridge→Sink→Hob sequence) · adjacency (dishwasher↔sink, bin↔sink, prep between sink+hob 600/ideal900-1200,
fridge-near-entry, microwave↔fridge, cutlery↔dishwasher, pans↔hob, plates↔dishwasher, pantry↔fridge) ·
circulation (aisles, two/three-cook widths 1200-1400/1400-1600) · MEP (wet cluster sink+dishwasher+washer on one
wall, electrical cluster oven+hob+micro, drain/duct/pipe length) · natural-light (sink-under-window +10, prep near
daylight ≤1500, tall-unit window-shadow penalty, preserve visible window area) · storage (diversity drawers/
shelves/pantry, drawer-preference +10%, deep storage near hob, capacity by family size: single≥1200L / couple
≥1800L / family4≥2500L) · ergonomic (counter height by user height, reach ≤2100, frequent storage 600-1800,
accessibility 1500 turn / knee 700) · visual (hob centred, balanced tall units `T C C T` not `T T T T`, single
focal point, avoid fragmentation, drawer/handle alignment, glass symmetry, ≤30% glass uppers) · buildability ·
cost (corner ×1.5, tall +, island +, plumbing-relocation ∝ pipe length).

**Shape-specific:** I (≥3000, seq Fridge-Prep-Sink-Prep-Hob) · L (sink-leg≠hob-leg, corner=storage) ·
U (width 2400-3600, one triangle item per side, avoid opposing tall units / tunnel) · Island/Peninsula (proportion
+ justification + termination = storage/seating not appliances).

## 4. Solver + generation order (L3/L4)

Canonical sequence: `detect room → detect doors → windows → columns → MEP points → §BIM04 classify walls (eligible
length, hasWindow/Door, services, score) → determine kitchen shape (proportion rules) → place corner modules →
tall units → sink → dishwasher → hob → fridge → fill storage → evaluate circulation → score → generate
alternatives → keep highest`.

## 5. Scorecard (L4)

`Workflow 25 · Circulation 20 · Storage 15 · MEP 10 · NaturalLight 10 · Buildability 10 · Cost 5 · Aesthetics 5`
(= 100). HARD rules gate first; SCORING ranks the survivors; the engine emits N candidates and keeps the max.
Each candidate records its sub-scores (for future learning + the UI "why this layout" panel).

## 6. Per-room generalisation (L5)

The ontology + rule schema are containers. **Kitchen** is the reference. Each subsequent room ships its own
`rules/<roomType>/` (ontology + rules + weights): **bathroom** (wet cluster, fixture clearances, door swing,
WC/basin/shower/bath adjacency), **bedroom/wardrobe** (partly in `wardrobeLayout.ts`), **living**, **utility**
(plumbing cluster), **dining**, **study**. Same solver, different data. `programRules.ts` already declares the
per-room *program* (which fixtures a room gets); this engine declares *how they are arranged*.

## 7. Phased plan (tracker §59)

- **P1 (scaffold, this turn):** the schema types (`ruleSchema.ts`) + the kitchen module ontology seed
  (`moduleOntology.ts`) + the scorecard type — typed, exported, unit-testable; not yet wired into placement.
- **P2:** wire the HARD kitchen rules (collision, clearance, corner-forbidden, hob/sink safety, door/window) as a
  validation pass over the existing `kitchenLayout` output — reject invalid placements.
- **P3:** the scorecard + generate-N-and-rank loop (work-triangle + adjacency + circulation first).
- **P4:** §BIM04 wall classification + shape selection (I/L/U/Island) from the room boundary + windows/doors/MEP.
- **P5:** Level-2 cabinet selection + internal storage allocation + the cabinet taxonomy.
- **P6:** per-room rollout (bathroom → bedroom → utility → …) on the same schema.

Each phase is shippable + test-gated; the full corpus (300–500 rules) accretes across P2–P5.
