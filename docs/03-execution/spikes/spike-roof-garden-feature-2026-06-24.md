# SPIKE — "Roof garden" amenity deck for the residential-building generator (2026-06-24)

**Status:** Spike (investigation + staged design). No production code changed.
**Scope:** a "Roof garden" toggle on the residential preview modal. When ON: the
central CORE extends ONE level higher (roof access), and the existing flat roof
(§RESI-ROOF / §RESI-ROOF-LEVEL) becomes a walkable amenity DECK with a perimeter
guard railing, benches, an open kitchen, a swimming pool, outdoor chairs + tables,
BBQ areas, garden/planting areas, and small trees/plants.

> **TL;DR** — Most of the deck is a *composition of primitives that already exist*.
> The roof LEVEL and flat roof SLAB are already minted today (`ResidentialBuildingExecutor`
> §RESI-ROOF-LEVEL `:165-174` + `_createRoof` `:707-733`). The perimeter railing is the
> balcony spike's handrail (`CreateHandrailCommand`, glass guard) ringing the roof footprint.
> Benches, tables, chairs, lounge chairs, trees and potted plants are all EXISTING
> `FurnitureType` members placed via `CreateFurnitureCommand`. **The only genuinely NEW
> furniture types are `swimming_pool`, `bbq`/`grill`, and an outdoor counter/`open_kitchen`**
> (a generic kitchen-run can stand in for the last). **Smallest first slice = toggle +
> extend core/lift one level to the roof + perimeter glass railing + a handful of benches +
> potted plants/trees from existing types — defer pool/BBQ to a follow-on that adds the new
> types.** No schema change for the first slice (furniture/handrail/slab verbs only) ⇒ P5
> untouched.

---

## (A) Amenity-primitive inventory — EXISTS vs NEW

### A.0 The deck itself — ALREADY BUILT

- **Roof LEVEL** — `apps/editor/src/ui/residential-building/ResidentialBuildingExecutor.ts:165-174`
  (§RESI-ROOF-LEVEL): a dedicated `'Roof'` level is minted via `AddLevelCommand` at
  `elevation = baseElevationM + result.levels.length × floorToFloorM`. `roofLevelId` is
  captured `:169`.
- **Flat roof SLAB** — `_createRoof` `:707-733` dispatches `CreateRoofCommand` (`roofType:'flat'`,
  `THICK=0.25`, `baseOffset=THICK` so the slab bottom rests on the top-storey wall head). This
  is the **deck floor** the amenities stand on. For a roof garden nothing about the slab needs
  to change — the same flat slab is the walkable deck (founder's point 4 confirmed).

### A.1 Perimeter guard railing — FULLY BUILT (reuse the balcony inventory)

- **Command** — `packages/command-registry/src/handrails/CreateHandrailCommand.ts:5`. Payload
  `{ id, start:{x,z}, end:{x,z}, height, thickness, levelId?, baseOffset?, fillType?, railProfile?, … }`
  (`:13-28`). `fillType ∈ {glass,panel}` ⇒ IFC `GUARDRAIL` (`:57`); `canExecute` enforces
  length ≥ 0.1 m and height 0.3–2.5 m (`:38-42`).
- **Generator copy-pattern** — the house void-guard rails N edges leaving one open:
  `apps/editor/src/ui/house-layout/HouseLayoutExecutor.ts:2664-2674` (`_railVoidGuardrail`,
  imports `CreateHandrailCommand` at `:39`). The roof railing is the SAME shape: ring all
  footprint edges with a 1.1 m glass guard, leaving a gap only at the core-access opening.

### A.2 Furniture amenities — `FurnitureType` union + `CreateFurnitureCommand`

- **Union** — `packages/geometry-furniture/src/FurnitureTypes.ts:49-264` (`export type FurnitureType`).
  It is a **hard-coded TS string union** (NOT a dynamic registry today — see (D)).
- **Command** — `packages/command-registry/src/furniture/CreateFurnitureCommand.ts:52`,
  payload `CreateFurniturePayload` `:7-36`: `{ furnitureType, position:{x,y,z}, rotation, levelId,
  baseOffset, width, length, height, material, color?, metadata? }`. **GOTCHA (risk E1):**
  `execute` FORCES `position.y = level.elevation` (`:106-110`) and applies the mount height as
  `baseOffset` downstream — so furniture sits on the **roof level's floor datum** automatically
  (good — it lands on the deck), but you cannot raise an item off the deck via `position.y`,
  only via `baseOffset`.
- **Furnish engine catalogue** — `packages/ai-host/src/workflows/furnishLayout/archetypes.ts`
  places `lounge_chair` (`:54,101,111`), `sofa`, `coffee_table`, `rug`, `wall_art` etc. into rooms;
  this is the placement-rules reference (anchor/facing/group) a roof-deck "furnish" pass would mirror.

### A.3 EXISTS / NEW table (with the exact reusable member + file:line)

| Amenity | Status | Reusable member / note |
| --- | --- | --- |
| **Bench** | **REUSE (approx)** | `entry_bench` (`FurnitureTypes.ts:138`) is an indoor entry bench — usable as a slab-on-legs bench; a dedicated outdoor `bench` is a nice-to-have NEW type but not required for slice 1. |
| **Table (outdoor)** | **EXISTS** | generic `table` (`:52`), `coffee_table` (`:94`), `dining_table` (`:73`), `side_table` (`:92`). |
| **Chair (outdoor)** | **EXISTS** | `lounge_chair` (`:173`), `armchair` (`:90`), `chair` (`:51`), many `chair_*` variants (`:58-71`). `lounge_chair` is the natural outdoor seat (already in the furnish engine). |
| **Tree / plant** | **EXISTS** | Full parametric tree library `arbol_t_01..arbol_t_25` (`FurnitureTypes.ts:260-264`; defs `geometry-furniture/src/TreeTypes.ts:23-60`, 25 species / 12 archetypes, with 2D plan symbols). Potted plants `plant_01..plant_08` (`:192-199`). |
| **Garden / planting area** | **REUSE (composition)** | No "planter box" type; compose from a low slab/curb (`CreateSlabCommand`) + `plant_0x`/`arbol_*` clusters. A dedicated `planter` NEW type is optional polish. |
| **Open kitchen / outdoor counter** | **REUSE (approx) / NEW (polish)** | Parametric kitchen runs `kitchen_straight` (`:229`), `kitchen_island` (`:232`) + appliance modules `base_unit`/`wall_unit`/`sink`/`hob` (`:243-251`) can stand in as an outdoor counter/island. A first-class `open_kitchen`/`outdoor_counter` is NEW polish. |
| **Swimming pool** | **NEW** | No `pool`/`water`/`swimming` element anywhere (`grep` over `geometry-furniture/` + `schemas/` = none). Needs a NEW `FurnitureType` (`swimming_pool`) + a builder (a recessed/raised water box), OR a thin composite (slab basin + a translucent water plane). |
| **BBQ / grill** | **NEW** | No `bbq`/`grill`/`barbecue` anywhere. Needs a NEW `FurnitureType` (`bbq`) + a simple box builder. |

**No existing pool / water / vegetation-bed / BBQ / landscape element** exists (verified by grep
over `packages/geometry-furniture/src` and `packages/schemas/src`). Trees and potted plants DO
exist as first-class furniture.

---

## (B) The data-model thread — `roofGarden` flag (modal → orchestrator input → executor)

The residential request already threads cleanly through six typed hops. A `roofGarden?: boolean`
rides the SAME path (each hop is a small additive field):

1. **Modal UI** — `apps/editor/src/ui/onboarding/OnboardingStepController.ts` residential program
   step (`:776-1029`, "Set up your residential building"). Add a toggle chip next to the
   typology chips (`:880-911`); on submit it writes into `this.briefMetadata` (`:1016-1022`)
   alongside `floors`/`minApartmentAreaM2`/`T1..T4`, e.g. `roofGarden: true`.
2. **Brief → request** — `residentialFromBoundary.ts` `residentialRequestFromBrief` (`:82-115`)
   reads brief metadata via `readBool` (`:63-74`, already present) → add `roofGarden` to the
   returned `ResidentialBuildingRequest`.
3. **Request type** — `ResidentialBuildingController.ts` `ResidentialBuildingRequest` (`:52-72`):
   add `readonly roofGarden?: boolean;`.
4. **Request → orchestrator input** — `buildOrchestratorInput` (`:122-147`): pass `roofGarden`
   into `ResidentialBuildingOrchestratorInput`.
5. **Orchestrator input + result** — `residentialBuildingOrchestrator.ts`
   `ResidentialBuildingOrchestratorInput` (`:77-106`) gains `roofGarden?: boolean`. The pure
   orchestrator can simply ECHO it onto the OK result (`ResidentialBuildingOk` `:196-209`) as
   `readonly roofGarden?: boolean` so the executor + preview both read one authoritative flag.
   (No geometry change in the orchestrator for slice 1 — the deck is executor-emitted.)
6. **Executor** — `ResidentialBuildingExecutor.execute(runtime, result, input)` (`:110-129`)
   reads `result.roofGarden` (or thread it via `ResidentialExecuteInput` `:80-83`) and runs the
   new roof-deck pass.

**Live preview** (`OnboardingStepController.ts:950-990` → `residentialPlanThumbnail.ts`): the
live preview re-runs the pure orchestrator on every slider change. The thumbnail draws a
representative UPPER floor (`pickLevelIndex` `residentialPlanThumbnail.ts:36-48`). For a roof
garden, when the toggle is ON, render an extra mini-plan of the ROOF level: the plate outline +
the perimeter railing ring + the core-access box + a few amenity dots (pool/bench/tree glyphs).

---

## (C) Staged plan

### Slice 1 — SMALLEST VISIBLE (no new FurnitureType, no schema change)

Renders a recognizable roof garden using only existing verbs.

1. **Flag thread** — add `roofGarden` through the six hops in (B). Default OFF.
2. **Extend the CORE one level to the roof** — in `_createCore`
   (`ResidentialBuildingExecutor.ts:740-838`):
   - The roof level already exists (`roofLevelId`, `:169`) and is ABOVE `topIndex`. Today the
     **stair** loop runs `idx < topIndex` (`:770`) and the **lift** loop runs `idx <= topIndex`
     (`:817`). When `roofGarden`, register `roofLevelId` in `levelIdByIndex` at index
     `result.levels.length` and **extend both loops by one** so a final stair pair
     `(topIndex → roof)` and a lift cab `(top → roof)` are emitted — giving real roof access
     from the circulation core. (Risk E2 — verify the stair `startY`/elevation math uses the roof
     level's elevation, which equals `baseElevationM + result.levels.length × floorToFloorM`,
     matching §RESI-ROOF-LEVEL `:171`.)
   - Also emit the core PERIMETER walls (`_buildCorePerimeter` `:564-604`) + the two fire doors
     for the roof level so the stair/lift arrive in an enclosed core "headhouse" with a door onto
     the deck (reuse `corePerimeterPayloads` + `coreDoorSpecs`, push a roof-level entry).
3. **Perimeter glass railing** — a new `_createRoofGuardrail(cm, roofFootprintWorld, roofLevelId, coreRectWorld)`:
   ring the roof footprint edges (`_cleanRing` `:652-664`) with `CreateHandrailCommand`
   (`height≈1.1`, `thickness≈0.05`, `fillType:'glass'`, `railProfile:'rectangular'`,
   `levelId: roofLevelId`), copying `HouseLayoutExecutor.ts:2664-2674`. Leave the edge segment
   nearest the core-access door open (or just ring all edges for slice 1 — the access is via the
   core headhouse, interior to the footprint, so no edge gap is strictly needed).
4. **A few amenities from existing types** — a new `_furnishRoofDeck(cm, roofLevelId, deckRectWorld, coreRectWorld, xf)`:
   place a deterministic handful inside `deckRect` minus the core keep-out, all via
   `CreateFurnitureCommand` (`levelId: roofLevelId`):
   - 2–4 `lounge_chair` + 1 `coffee_table` clusters (seating),
   - 2 `entry_bench` (benches) along an edge,
   - 4–6 `plant_0x` + 2–3 `arbol_t_xx` trees (greenery).
   Positions are world-XZ (apply the `xf` rotate `:1129-1134` if you compute them in the LOCAL
   core frame; or compute directly from the WORLD roof footprint which needs no transform).
5. **Run inside the structural `runBatch`** (`:312-363`) or a deferred post-pass like the core
   doors (`_finishCoreDoors` `:610-648`), source-tagged `RESI_PIPELINE_ROOF_GARDEN`. Furniture
   needs the roof level to exist (it does, minted at `:172`) — no host-wall readiness gate needed
   (furniture is level-hosted, not wall-hosted).

**Result:** a roofed core that reaches the roof, a glass-railed walkable deck, and visible
seating + greenery — all with existing commands. Zero schema, zero new FurnitureType, zero
orchestrator geometry change.

### Slice 2 — pool + BBQ + outdoor kitchen (adds NEW FurnitureTypes)

- Add `'swimming_pool'`, `'bbq'`, and optionally `'open_kitchen'`/`'outdoor_counter'` to the
  `FurnitureType` union (`FurnitureTypes.ts:49-264`) + the `FurnitureCategoryMap` + a builder each
  in `geometry-furniture/src/builders/`. Pool = a recessed/raised water box (basin slab + a
  translucent THREE plane in the builder — THREE stays inside the geometry-furniture builder, NOT
  the executor, so P2 holds). BBQ = a simple counter box. For the outdoor kitchen, slice 1 can
  already stand in `kitchen_island`/`kitchen_straight`.
- Place them in `_furnishRoofDeck` once the types exist.

### Slice 3 — orchestrator-decided amenity layout + roof-garden preview plan

- Move deck zoning (pool zone / seating zone / planting zone / BBQ zone, core keep-out) into the
  PURE orchestrator so the layout is deterministic + previewable, exposing a
  `result.roofDeck?: { railing, zones[] }`. Render it in `residentialPlanThumbnail.ts` and add the
  roof mini-plan to the live preview.

### Slice 4 — polish

- Dedicated outdoor `bench`/`planter` types, pergola/shade, per-style finishes, undo-grouping
  audit, IFC mapping for pool (`IfcSpace`/`IfcCovering` or a custom proxy).

---

## (D) Which amenities need NEW `FurnitureType` entries — and effort

`FurnitureType` is a **hard-coded TS union** (`FurnitureTypes.ts:49-264`) — adding a type means:
(1) extend the union, (2) add a `FurnitureCategoryMap` entry, (3) write a builder in
`geometry-furniture/src/builders/` (+ optional 2D plan symbol), (4) optional default dimensions in
`CreateFurnitureCommand` (`FURNITURE_DEFAULTS` `:39-50`). The Family-Platform memory note flags this
union as a known dynamic-registry extension point, but it is NOT dynamic today.

| Amenity | New type? | Effort |
| --- | --- | --- |
| Bench, table, chair, lounge chair | **No** — reuse existing | none |
| Trees, potted plants | **No** — `arbol_t_*`, `plant_0x` exist | none |
| Planting/garden bed | **No for slice 1** (compose slab + plants); optional `planter` later | low (polish) |
| Outdoor kitchen / counter | **No for slice 1** (`kitchen_island`/`kitchen_straight`); optional `open_kitchen` later | low–med (polish) |
| **Swimming pool** | **YES** (`swimming_pool`) | **med** — union + category + a water-box builder (translucent material) + dims |
| **BBQ / grill** | **YES** (`bbq`) | **low–med** — union + category + a simple box builder + dims |

So only **2 (–3) NEW types** are required, all deferrable to Slice 2.

---

## (E) Risks + open questions

1. **E1 — furniture Z is forced to the level floor.** `CreateFurnitureCommand.execute` sets
   `position.y = level.elevation` (`:106-110`) and uses `baseOffset` for mount height. Because the
   amenities are hosted on the **roof level** (`roofLevelId`, elevation = top wall head), they land
   ON the deck automatically — but the deck SLAB has its own `THICK=0.25` and `baseOffset=THICK`
   (`_createRoof :726-729`), so the slab TOP is ~0.25 m above the roof-level elevation datum.
   Confirm furniture sits on the slab top, not the level datum (may need a small `baseOffset` of
   ~0.25 m on the amenities, OR confirm the slab top is flush with the level elevation). Same
   caveat for the railing `baseOffset` (`CreateHandrailCommand` `:54`).
2. **E2 — core/lift roof-span elevation.** §RESI-LIFT-TOP-CAB (`:811-834`) already handles the
   `base===top` degenerate cab; extending the stair to the roof needs the roof level's elevation
   to equal the §RESI-ROOF-LEVEL value (`baseElevationM + result.levels.length × floorToFloorM`,
   `:171`) and `levelIdByIndex` to include `roofLevelId` at the right index. Off-by-one here puts
   the stair flight one storey wrong.
3. **E3 — roof-garden vs §RESI-ROOF slab.** The deck IS the flat roof slab; nothing about the slab
   changes (founder point 4). The only deltas are: railing + furniture on `roofLevelId`, the
   core extension, and an OPTIONAL roof FINISH (a deck/timber finish vs bare slab — the per-room
   floor-finish trigger `_finishFloorsPerLevel :981-991` is room-driven and there are no rooms on
   the roof, so a roof finish would be a separate flat-finish call if wanted).
4. **E4 — centroid-local frame / placement.** The roof FOOTPRINT (`result.levels[].footprint`) is
   WORLD (no transform). The CORE rect is LOCAL (`result.core`) and must be rotated via
   `_rotate(...,xf)` (`:1129-1134`) before using it as a keep-out for amenity placement, exactly
   like every other core consumer in the executor. Mixing frames = furniture inside the core or off
   the plate.
5. **E5 — P5 schema purity.** Slice 1 adds NO schema (handrail/slab/furniture verbs only) ⇒ P5
   intact. Slice 2's new `FurnitureType`s touch `packages/geometry-furniture` (an L-low DTO module,
   `TreeTypes.ts` header asserts "no THREE.js, no store logic") — keep the new type DTOs pure; put
   the water/box geometry in the BUILDER (`geometry-furniture/src/builders/`), and keep
   `import * as THREE` out of the executor (P2 — it dispatches commands only).
6. **E6 — P8 spans.** Any new exported function (a roof-deck orchestrator stage in Slice 3, or a
   new exported executor helper) needs ≥1 OpenTelemetry span. The executor's single `execute` span
   (`:115`) covers slice-1 private helpers.
7. **E7 — stacked deck vs parcel.** Unlike balconies, the roof deck is WITHIN the building
   footprint, so no parcel-overhang concern — simpler than the balcony spike's S5.
8. **Open question — preview fidelity.** Slice 1 ships without a roof preview plan (the toggle just
   changes the built result). Decide whether the live preview must show the roof deck immediately
   (Slice 3) or whether a caption ("+ roof garden") on the existing preview is enough for v1.

---

## Reuse vs new — one-line summary

Deck floor + roof level: **already built**. Railing: **reuse** `CreateHandrailCommand`. Benches /
chairs / tables / lounge chairs / trees / potted plants: **reuse** existing `FurnitureType`s.
Outdoor kitchen + garden bed: **reuse by composition** (kitchen-run + slab + plants). **Swimming
pool and BBQ are the only genuinely NEW elements** (new `FurnitureType` + builder, ~low–med each),
and both are deferrable to Slice 2.
