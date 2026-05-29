# Apartment Layout — Driving Principles + Room × Element Matrix (2026-05-29)

**Companion to** `APARTMENT-LAYOUT-STATUS-2026-05-29.md` and `REMAINING-WORK-CONSOLIDATED-2026-05-29.md`.

**Purpose.** Two halves:

- **Part A — Driving principles.** For each room type, the architectural rationale + the engine rules that encode it (sizing, connectivity, daylight, privacy, furniture program). Reading this should answer "WHY would the engine ever produce a kitchen like that?"
- **Part B — Room × Element matrix.** Every PRYZM element category cross-referenced against every room type — must-have, recommended, permitted, forbidden. Architecturally sound, no opinions left implicit.

**Sources.** `packages/ai-host/src/workflows/apartmentLayout/rules/programRules.ts` (the rules DB), `packages/geometry-*` (the 12 element categories), the UK Building Regs + HQI constraints (DB-001 to DB-248), and the architect's stated preferences from the modal feedback rounds.

---

# Part A — Driving principles per room type

Each block lists, in order: **architectural intent → sizing → connectivity → daylight → contents program → adjacency preferences**. The engine encodes the first three as hard rules and the last three as preferences (see `§ADJACENCY-PREFERENCE`).

---

## §A.1 — Living room (`living`)

**Intent.** Primary social / receive space. Front of the privacy gradient. Where the household watches, reads, hosts. The single largest habitable room.

**Sizing.** DB-047 minAreaM2 14 m² (HQI mandatory). DB-049 minShortSide 3.2 m (so the sofa wall has a usable opposing face). `areaWeight 1.7` (largest weight in the DB). `minAreaFrac 0.15` — must be at least 15 % of the apartment so it scales with size.

**Connectivity.** Reachable from `hall`, `corridor`, `kitchen`, `dining`. Uncapped doors. Open-plan threshold to hall is allowed (the lounge IS the lobby in small flats); kitchen↔living always now has a wall + door (post-§KITCHEN-DISTINCT) — the open-plan toggle controls living↔dining only.

**Daylight.** `needsWindow: true`, `windowMandatory: true`. Dual-aspect preferred where the plan allows (south + east is the European default).

**Furniture program.**
- **Required.** `sofa` (UK standard 2000 × 900 mm).
- **Optional.** `coffee_table` (1100 × 600), `lamp` (floor or table).
- **Place rules.** Sofa on the LONGEST FREE WALL, NEVER on the door wall (the door wall is the entry path), facing INTO the room. Coffee table BESIDE the sofa group. Lamp anchored in a CORNER.

**Adjacency preferences.** `kitchen 1.0` · `dining 1.0` · `hall 0.8` · `corridor 0.5`. The living room belongs adjacent to the social cluster; corridor adjacency is acceptable but unloved.

---

## §A.2 — Kitchen (`kitchen`)

**Intent.** Food prep. Works open-plan with dining; reached via the living/dining zone. NEVER directly off the entrance hall (you don't want guests walking into the working zone).

**Sizing.** DB-052 minAreaM2 6 m² (galley HQI mandatory). DB-054 min galley aisle 1.0 m + counter depth 600 mm → minShortSide 1.8 m. `areaWeight 0.95`. `minAreaFrac 0.07` — at least 7 % of the apartment.

**Connectivity.** Reachable from `corridor`, `living`, `dining`, `utility`. Door-only — `kitchen` is ALWAYS an enclosed room (§KITCHEN-DISTINCT). `kitchen.accessFrom` deliberately excludes `hall`.

**Daylight.** `needsWindow: true`, `windowMandatory: true`. Sink prefers the window wall (prep tasks under daylight); kitchen runs prefer to avoid the window wall (no upper cabinets blocking light).

**Furniture program.**
- **Required.** `kitchen_straight` (3000 mm minimum run, 600 mm deep, 900 mm high).
- **Optional second run.** A second `kitchen_straight` perpendicular to the first ⇒ L-shape kitchen wrapping two adjacent walls.
- **Optional island.** `kitchen_island` (2000 × 900 mm, 0.9 m clearance each side) anchored at the room centroid — only fits when the kitchen sub-zone is ≥ ~14 m² with the wall run on a short wall (small kitchens drop the island automatically because the run's clearFront covers the centroid).
- **Default appliances** (post-§KITCHEN-DEFAULT-APPLIANCES). Main arm slot N → `fridge_combi_silver` (185 cm tall, replaces carcass). Slot 1 → `sink_inox` (countertop inset). Slot 2 → `hob` (countertop, between sink + fridge when there's room).
- **Required fixture.** `sink` (plumbed).

**Place rules.** `kitchen_straight` on `wall-longest`, `excludeDoorSwing: true` (the door arc must not clip the working zone). For the L-shape, the cascading anchor resolver puts the second run on a perpendicular wall once the first claims the longest, naturally forming an L at the corner.

**Adjacency preferences.** `dining 1.0` (the classic open-plan pair) · `living 0.8` · `utility 0.6` · `corridor 0.3`. The kitchen wants to be near food + cleanup, not near circulation.

---

## §A.3 — Dining (`dining`)

**Intent.** Eating space. Typically open to kitchen + living; reached via the living/kitchen zone, never directly off the hall.

**Sizing.** DB-060 minAreaM2 9 m² (HQI separate-dining mandatory). minShortSide 2.4 m. `areaWeight 0.9`.

**Connectivity.** Reachable from `corridor`, `living`, `kitchen`. Uncapped doors. The `openPlanKitchenDining` toggle controls whether dining↔living merges into one detected room (lounge-diner pattern). Dining↔kitchen is now ALWAYS a door (§KITCHEN-DISTINCT).

**Daylight.** `needsWindow: true`, `windowMandatory: false` (you can dine under artificial light if needed, but daylight wins).

**Furniture program.**
- **Required.** `dining_table` (1400 × 900, 900 mm clear each side) anchored at the room CENTRE.
- **Optional.** `dining_chair` × 4 placed AROUND the table group (the engine flips yaw so chairs face the table — `4f16748` fix).
- **Optional.** `lamp` in a corner.

**Place rules.** Table centre-anchored, faces INTO the room (room centroid + facing rotation). The §COMPOUND-ORDER ensures that in an open-plan compound (living + kitchen + dining), the dining table claims the centroid BEFORE the kitchen island tries.

**Adjacency preferences.** `kitchen 1.0` · `living 0.9` · `corridor 0.4`.

---

## §A.4 — Entrance hall (`hall`)

**Intent.** Clean transition lobby — the front door lands here. Distributes ONLY to the living space and the corridor (private-zone spine). The architectural rule: no bedroom, no bathroom, no kitchen DIRECTLY off the hall. The hall is for hanging coats and choosing left (social) or right (private).

**Sizing.** DB-065 minAreaM2 2.5 m² (HQI mandatory). DB-062 main corridor clear 1.0 m → minShortSide 1.2 m. `areaWeight 0.5`.

**Connectivity.** `accessFrom: ['living', 'corridor']`. Uncapped doors but the symmetric `accessFrom` walls of the other room types keep bathroom / kitchen / bedrooms out.

**Daylight.** Not required. Halls are often interior.

**Furniture program.**
- **Optional.** `entrance_table` (1000 × 400) on the LONGEST FREE WALL, never clipping the front-door swing.

**Adjacency preferences.** `living 1.0` (the lounge-as-lobby pattern) · `corridor 0.9` (the corridor-spine pattern).

---

## §A.5 — Corridor (`corridor`)

**Intent.** The private-zone CIRCULATION SPINE. Serves bedrooms, bathrooms, study, utility. Every private door hangs off the corridor. It exists so each bedroom shares a wall with it; without a corridor that physically spans the bedrooms, you get the dreaded "bedroom-to-bedroom-only" defect.

**Sizing.** DB-062 main corridor clear 1.0 m (Part M mandatory); 1.2 m HQI recommended; DB-064 secondary 0.9 m. minShortSide 1.0 m. `areaWeight 0.85` (bumped from 0.45 to physically span all bedrooms). **§AREA-FRACTIONS `maxAreaFrac 0.10`** — capped at 10 % of the apartment so the high weight doesn't eat 20 %+ of a 60 m² studio.

**Connectivity.** `accessFrom: ['hall', 'living', 'kitchen', 'dining', 'bedroom', 'master', 'bathroom', 'study', 'utility']`. Reaches everything except ensuite + WC (those go through their host room). Uncapped doors.

**Daylight.** Not required.

**Furniture program.** Empty by design. Circulation kept clear.

**Adjacency preferences.** `hall 1.0` · `bedroom 0.9` · `master 0.9` · `bathroom 0.9` · `study 0.8` · `utility 0.6` · `kitchen 0.3` · `living 0.3` · `dining 0.3`. The corridor wants to cluster the PRIVATE rooms; social rooms prefer to cluster off the hall directly.

---

## §A.6 — Master bedroom (`master`)

**Intent.** The owner's bedroom. Reached from the corridor; connects to its ensuite. Never directly off the entrance hall.

**Sizing.** DB-020 minAreaM2 12 m² (Building Regs mandatory). DB-022 min clear width 2.75 m (double bed + circulation both sides). DB-023 length 3.2 m HQI recommended. DB-021 recommended 16–20 m². `areaWeight 1.3`. **§AREA-FRACTIONS `maxAreaFrac 0.20`** — capped at 20 % of the apartment (the over-allocation bug fix).

**Connectivity.** `accessFrom: ['corridor', 'living', 'dining', 'ensuite']`. `maxDoors 2` (one to circulation, one to the ensuite).

**Daylight.** `windowMandatory: true`.

**Furniture program.**
- **Required.** `bed` (UK double 1350 × 1900, 600 mm circulation each side, 800 mm clearFoot), `bedside_table` × 2, `wardrobe` (1200 × 600), `lamp`.
- **Place rules.** Bed OPPOSITE the door, on a SOLID wall (`excludeWindowWall: true` — privacy + thermal envelope, no headboard against single-glazed glass; `excludeDoorSwing: true` — no sleeping next to the door arc). Bedside tables `flank_group` on the bed group. Wardrobe on `wall-longest`, `excludeWindowWall: true` (tall furniture blocks daylight) and `excludeDoorSwing: true`. Lamp in a CORNER.

**Adjacency preferences.** `ensuite 1.0` (the defining adjacency) · `corridor 0.9` (the architectural entry) · `living 0.4` · `dining 0.3`.

---

## §A.7 — Secondary bedroom (`bedroom`)

**Intent.** Kids / guest / second occupant. Door to CIRCULATION — never another bedroom, never directly off the hall.

**Sizing.** DB-026 minAreaM2 11.5 m² (Building Regs mandatory double-capable). DB-028 min clear width 2.6 m. `areaWeight 1.0`. **§AREA-FRACTIONS `maxAreaFrac 0.16`** — each secondary bedroom ≤ 16 % of the apartment.

**Connectivity.** `accessFrom: ['corridor', 'living', 'dining']`. `maxDoors 1`. Bedroom↔bedroom is FORBIDDEN.

**Daylight.** `windowMandatory: true`.

**Furniture program.** Identical to `master` — bed + 2 bedside tables + wardrobe + lamp. Same placement rules (bed opposite door, wardrobe on solid wall, etc.).

**Adjacency preferences.** `corridor 1.0` · `living 0.4` · `dining 0.3`.

---

## §A.8 — Bathroom (shared, `bathroom`)

**Intent.** Shared wet room. ONE door — to the corridor. Post-§BATH-CORRIDOR-ONLY: never off a bedroom (that semantic is the `ensuite`), never off the hall (the user's explicit "the entrance door connected to a bathroom is not possible" rule).

**Sizing.** DB-035 minAreaM2 5 m² (BS 8300 mandatory). DB-037 min clear width 1.8 m. `areaWeight 0.45`. **`minAreaFrac 0.05`** — each bathroom ≥ 5 % of the apartment.

**Connectivity.** `accessFrom: ['corridor']` only. `maxDoors 1`.

**Daylight.** Not required (mechanical ventilation per Building Regs).

**Furniture program.**
- **Required.** `toilet_radiator` (toilet on the wet wall + heated rail), `shower_glass_panel` (900 × 900 corner shower).
- **Required fixtures.** `toilet`, `washbasin`, `shower`.
- **Place rules.** Toilet on `wet_wall` (plumbing stack), `excludeDoorSwing: true` (toilet behind the door is awkward). Shower in the CORNER farthest from the door, `excludeDoorSwing: true` (a shower behind the door is dangerous when wet).

**Adjacency preferences.** `corridor 1.0` (only legal access).

---

## §A.9 — Ensuite (`ensuite`)

**Intent.** Master bathroom. ONE door, ONLY to the master bedroom.

**Sizing.** DB-039 minAreaM2 3.5 m² (BS 8300 shower-room mandatory). DB-040 min width 1.5 m. `areaWeight 0.4`.

**Connectivity.** `accessFrom: ['master']` only. `maxDoors 1`.

**Daylight.** Not required.

**Furniture program.** Same as `bathroom` — `toilet_radiator` + `shower_glass_panel` + toilet/washbasin/shower fixtures. Tighter envelope so layout is more compact.

**Adjacency preferences.** `master 1.0` (defining adjacency).

---

## §A.10 — WC (`wc` — separate toilet) ✨ NEW 2026-05-29

**Intent.** Separate WC / cloakroom. Extremely common in French / European F3+ layouts. Off the corridor or hall — NEVER a bedroom (that's the ensuite), NEVER kitchen / living / dining.

**Sizing.** 1.2 m² minimum, 0.9 m short side. `areaWeight 0.25`.

**Connectivity.** `accessFrom: ['corridor', 'hall']`. `maxDoors 1`. WC↔WC forbidden, WC↔bathroom forbidden (per the user's "off internal corridor — not off main bathroom" rule).

**Daylight.** Not required.

**Furniture program.** `toilet_radiator` only on the wet wall + a small washbasin (the engine has a `washbasin` fixture entry but no renderable `wc_washbasin` FurnitureKind yet — queued).

**Adjacency preferences.** `corridor 1.0` · `hall 0.9` (the classic cloakroom-by-the-front-door pattern).

---

## §A.11 — Study / private office (`study`)

**Intent.** Home office. One door to the corridor or the living space.

**Sizing.** Defaults from `programRules.ts` (no Building Regs minima — study is not classed as a habitable room in HQI).

**Connectivity.** `accessFrom: ['corridor', 'living']`. `maxDoors 1`.

**Daylight.** `needsWindow: true`.

**Furniture program.** Currently uses `dining_table` + `dining_chair` as desk + chair (the comment explicitly flags this as a workaround). Queue item #4: add `desk` + `desk_chair` FurnitureKind stubs.

**Adjacency preferences.** None declared yet (preference defaults to 1.0 — fully required).

---

## §A.12 — Utility (`utility`)

**Intent.** Laundry / mechanical / storage. One door to corridor or kitchen.

**Sizing.** DB-068 minAreaM2 3.5 m² (HQI washer + dryer side-by-side). `areaWeight 0.4`.

**Connectivity.** `accessFrom: ['corridor', 'kitchen']`. `maxDoors 1`.

**Daylight.** Not required.

**Furniture program.** Empty (washer/dryer not yet catalogued as renderable furniture).

**Adjacency preferences.** Not declared — defaults to 1.0.

---

# Part B — Room × Element matrix

Every PRYZM element category cross-referenced against every room type. Legend:

- **■ Must** — engine MUST place at least one of this element type when furnishing this room.
- **● Recommended** — included when space allows; the `optional` flag in the rule.
- **○ Permitted** — architecturally fine but not in any current archetype; manual placement only.
- **— Forbidden** — must NEVER appear in this room type.
- **N/A** — not applicable (e.g. roof in an apartment room).

The list follows the 12 PRYZM element categories from the geometry catalogue + the architecturally-meaningful subdivisions of furniture.

---

## §B.1 — Architectural shell categories

| Element | living | kitchen | dining | hall | corridor | master | bedroom | bathroom | ensuite | wc | study | utility |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Wall** (interior partition) | ■ | ■ | ■ | ■ | ■ | ■ | ■ | ■ | ■ | ■ | ■ | ■ |
| **Wall** (exterior — shell) | ■ | ■ | ●* | ○ | — | ■ | ■ | ○ | — | — | ■ | — |
| **Door** (single, solid timber) | ●† | ■ | ●† | ●† | — | ■ | ■ | ■ | ■ | ■ | ■ | ■ |
| **Door** (double — sliding/French) | ● | ○ | ● | ○ | — | ○ | — | — | — | — | — | — |
| **Door** (glazed half-light) | ● | ○ | ● | ● | — | — | — | — | — | — | ● | — |
| **Door** (fire-rated FD30) | — | — | — | ○ | ○ | — | — | — | — | — | — | — |
| **Window** (single pane) | ■ | ■ | ● | — | — | ■ | ■ | ○ | — | — | ■ | — |
| **Window** (timber casement) | ● | ● | ● | — | — | ● | ● | — | — | — | ● | — |
| **Window** (tilt-turn uPVC) | ● | ● | — | — | — | ● | ● | ● | — | — | — | — |
| **Window** (Crittal steel) | ● | — | — | — | — | — | — | — | — | — | — | — |
| **Slab** (RC monolithic 200 mm) | ■ | ■ | ■ | ■ | ■ | ■ | ■ | ■ | ■ | ■ | ■ | ■ |
| **Slab** (composite deck) | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| **Floor finish** — timber | ■ | — | ■ | ● | ● | ■ | ■ | — | — | — | ● | — |
| **Floor finish** — tile / stone | — | ■ | ○ | ● | ● | — | — | ■ | ■ | ■ | — | ■ |
| **Floor finish** — carpet | ● | — | ● | — | — | ● | ● | — | — | — | ● | — |
| **Floor finish** — vinyl / poured | ○ | ● | ○ | ● | ● | ○ | ○ | ● | ● | ● | ○ | ● |
| **Ceiling** (slab — `D-CE`) | ■ | ■ | ■ | ■ | ■ | ■ | ■ | ■ | ■ | ■ | ■ | ■ |
| **Roof** | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| **Stair** | N/A | N/A | N/A | ○‡ | ○‡ | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| **Column** | ○ | ○ | ○ | ○ | — | ○ | ○ | — | — | — | ○ | — |
| **Beam** | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| **Curtain wall** | ● | ○ | ● | — | — | — | — | — | — | — | ○ | — |

Notes:
- *Dining without a window is permitted but daylight is preferred (HQI not mandatory for separate dining).
- †Door to circulation. Living / dining / hall typically open to one another via no-door open-plan boundary lines; doors are recommended only when separating from a corridor.
- ‡Stairs only in multi-floor apartments (duplex / maisonette) — typically off the hall or corridor.

## §B.2 — Furniture by functional category

### Beds & bedroom storage
| Furniture type | master | bedroom | study | other |
|---|---|---|---|---|
| `bed` (UK double 1350 × 1900) | ■ | ■ | — | — |
| `japanese_platform_bed`, `nordic_bed`, `solid_wood_bed` | ● | ● | — | — |
| `bedside_table` × 2 | ■ | ■ | — | — |
| `wardrobe`, `wardrobe_straight`, `*_tall` | ■ | ■ | ○ | — (other) |
| `wardrobe_l_shape`, `wardrobe_u_shape` | ● (large master) | ● (large) | — | — |
| `corner_wardrobe`, `wardrobe_glass_door` | ● | ● | — | — |

### Living / lounge
| Furniture type | living | dining | master | bedroom | study | other |
|---|---|---|---|---|---|---|
| `sofa` / `sofa_1seat` … `sofa_3seat` | ■ | — | — | — | ● | — |
| `barcelona_sofa_*` (designer variants) | ○ | — | — | — | — | — |
| `corner_sofa`, `white_corner_sofa` | ● (large) | — | — | — | — | — |
| `chair_*` (Barcelona, Cesca, oak, terracotta) | ● | ● | — | — | ● | — |
| `coffee_table` | ● | — | — | — | — | — |
| `table_marble_cone`, `table_glass_wood_cylinder`, `table_ceramic_curve` | ● | — | — | — | — | — |

### Dining
| Furniture type | dining | kitchen (open) | living (open) | other |
|---|---|---|---|---|
| `dining_table` | ■ | ● (open-plan compound) | ● (open-plan) | — |
| `dining_table_marble_brass` | ● | ● | ● | — |
| `dining_chair` × 4 | ● | ● | ● | — |

### Kitchen
| Furniture type | kitchen | utility | other |
|---|---|---|---|
| `kitchen_straight` (3 m run) | ■ | — | — |
| `kitchen_l_shape` / 2× `kitchen_straight` perpendicular | ● | — | — |
| `kitchen_u_shape` | ● (large) | — | — |
| `kitchen_island` (2 × 0.9 m) | ● (large open-plan) | — | — |
| `kitchen_straight_tall`, `kitchen_l_shape_tall`, `kitchen_u_shape_tall` | ● | — | — |
| **Kitchen appliances** (`KitchenApplianceType`) | | | |
| `fridge_combi_silver` (default) | ■ | — | — |
| `fridge_compact_silver`/`dark`, `fridge_combi_dark`, `fridge_side_*` | ● | — | — |
| `sink_inox` (default) | ■ | ● | — |
| `sink_dark` | ● | ● | — |
| `hob` (induction + extractor) | ● | — | — |
| `washing_machine_dark`/`white` | ○ | ■ | — |

### Bathroom / WC
| Plumbing fixture | bathroom | ensuite | wc | other |
|---|---|---|---|---|
| `toilet` (`PlumbingFixtureType: toilet`) | ■ | ■ | ■ | — |
| `wall_hung_square`/`round`, `close_coupled_*` variants | ● | ● | ● | — |
| `sink` (= washbasin, `PlumbingFixtureType: sink`) | ■ | ■ | ■ (small) | — |
| `bath` | ● (full bath) | ○ | — | — |
| `shower` (`ShowerVariant`) | ■ | ■ | — | — |
| `shower_system_shelf`, `shower_cabinet_sliding`, `shower_cabinet_open` | ● | ● | — | — |
| `bidet` | ○ | ○ | — | — |
| `urinal` | — | — | — | — (non-residential) |
| **Bathroom accessories** | | | | |
| `washing_machine` (accessory variant) | ○ | — | — | ■ (utility) |
| `toilet_brush`, `toilet_paper`, `laundry_bag` | ● | ● | ● | — |
| `iron`, `ironing_board` | — | — | — | ● (utility) |
| **Furniture-side equivalents** | | | | |
| `toilet_radiator` (furniture kind, includes toilet + heated rail) | ■ | ■ | ■ | — |
| `shower_glass_panel` (furniture corner panel) | ■ | ■ | — | — |

### Lighting (`LightingFixtureType`)

| Light type | living | kitchen | dining | hall | corridor | master | bedroom | bathroom | ensuite | wc | study | utility |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `downlight` (recessed canister) | ● | ■ | ● | ● | ● | ● | ● | ■ | ■ | ■ | ● | ● |
| `pendant` (hanging cylinder) | ● | ● | ■ | ○ | — | ○ | ○ | — | — | — | ○ | — |
| `linear_led` (LED bar) | ○ | ● (under-cabinet) | — | — | ● | — | — | ● (mirror) | ● (mirror) | — | ● (desk) | ● |
| `pendant_pebble` / `_ceramic_bell` / `_conical` | ● | ● | ● | — | — | — | — | — | — | — | — | — |
| `floor_wood_post` / `_arc_brass` / `_tripod_black` | ● | — | ○ | ○ | — | ● | ● | — | — | — | ● | — |
| `table_terracotta` (bedside) | — | — | — | — | — | ● | ● | — | — | — | — | — |

(D-LE currently places one `pendant` or `downlight` per ceilable room. The fuller program above is the wishlist "proper lighting" tier item.)

### Soft furnishings (carpets) — `parametric_*_carpet`

| Type | living | dining | master | bedroom | study | hall | other |
|---|---|---|---|---|---|---|---|
| `parametric_chevron_carpet` | ● | ● | ○ | ○ | ○ | ● | — |
| `parametric_patchwork_carpet` | ● | ○ | ○ | ○ | ○ | ● | — |
| `parametric_stripe_carpet` | ● | ● | ○ | ○ | ○ | ● | — |

(All forbidden in kitchen / bathroom / WC / utility — wet or mess-prone rooms.)

### Decor & misc

| Type | Where it belongs |
|---|---|
| `chimney` | living (focal feature wall) — sometimes master suite. Forbidden in wet rooms + kitchens for safety. |
| `entrance_table` | hall — longest free wall, NEVER blocking front-door swing. |
| `lamp` (generic floor lamp) | living / master / bedroom / study corners. |

### Plants — indoor

`plant_01` … `plant_08` — recommended in living / hall / study; permitted in master / bedroom / dining. Forbidden in wet rooms (humidity / drainage). Permitted in kitchen (herbs by window).

### Trees — outdoor (`arbol_t_01` … `arbol_t_25`)

N/A inside an apartment. Used for site / external context only.

### Extensibility hatches

- `ai_element` — AI-generated parametric mesh. Permitted anywhere user drops; engine never auto-places.
- `glb_import` — Kave Home GLB drag-and-drop. Same — user-driven only.

---

## §B.3 — Curtain wall

Curtain walls aren't a residential element except in luxury / penthouse `living` and `dining`. Permitted but not auto-placed by D-TGL. `master` is the architectural edge case — floor-to-ceiling glazing is acceptable if a curtain provides privacy + the thermal envelope is rated.

Forbidden in `bathroom`, `ensuite`, `wc`, `utility`, `corridor`.

## §B.4 — Column / beam

Structural. Auto-placed by the structural layout engine (out of scope for D-TGL); D-TGL must respect column positions when subdividing (they pin the bubble graph). Forbidden in wet rooms only because they crowd small envelopes — there's no semantic ban.

## §B.5 — Stair / railing

Only for multi-floor apartments (duplex / maisonette). Stairs always live in `hall` or `corridor`; sub-elements (`stair-railing`, `stair-landing`) follow the parent stair. Railing variants: `flat-bar` for utility stairs, `glass-panel` for living-space stairs, `circular` (handrail) on accessibility-grade stairs.

---

# Part C — Cross-check + remaining gaps

The matrix above is the architecturally-sound TARGET. Cross-checked against what the engine actually emits today:

| Element category | Today | Wishlist gap |
|---|---|---|
| Walls (interior partitions) | ✅ Per-room subdivide | None |
| Walls (exterior) | ✅ User-drawn shell | None |
| Doors | ✅ Per bubble-graph edge with `via='door'` | Width per room type — wet-room 0.8 m vs 0.9 m standard (single-apartment-fix-pass-spec) |
| Windows | ❌ Only user-placed; no auto-emission | **The single biggest gap — Tier 1A in remaining-work** |
| Slab | ✅ Single per level | None |
| **Floor finish by type** | ✅ Shipped `§FLOOR-FINISH` | None |
| Ceiling | ✅ `D-CE` engine | None |
| Lighting | 🟡 `D-LE` places ONE fixture per room | Task lighting (kitchen under-cabinet, bedside, bathroom mirror) — Tier 2D |
| Kitchen — straight run | ✅ Shipped | None |
| Kitchen — L-shape | ✅ Two perpendicular straights | A true `kitchen_l_shape` archetype (geometry-furniture has the type) — would unify into one parametric element |
| Kitchen — island | ✅ `§KITCHEN-ISLAND` shipped | None |
| Kitchen — fridge / hob / sink defaults | ✅ `§KITCHEN-DEFAULT-APPLIANCES` shipped | None |
| Bedroom — bed + bedsides + wardrobe + lamp | ✅ All shipped | Wardrobe variants (sliding-door, prefer-corner) — Tier 2E |
| Dining — table + chairs | ✅ Shipped | None |
| Bathroom — toilet + shower | ✅ `toilet_radiator` + `shower_glass_panel` | A renderable `bath` variant for full baths (not just shower) — queued |
| Plumbing fixtures | ✅ Toilet + washbasin in spec | `wc_washbasin` renderable kind for the WC (currently fixture-only) |
| Carpets | ❌ Not auto-placed | Wishlist for living / bedroom — low priority |
| Plants | ❌ Not auto-placed | Wishlist polish — low priority |
| Chimney | ❌ Not auto-placed | Manual only — low priority |
| Entrance table | ✅ Hall archetype shipped | None |
| Curtain wall | ❌ Not auto-placed | Not in any archetype — manual only |
| Column / beam | ❌ Not respected by D-TGL subdivider | Future structural integration item |
| Stair | ❌ Not in single-floor scope | Multi-floor apartment is a separate feature |

---

## §C.1 — The matrix says PRYZM is closer to "architecturally complete" than it feels

Reading the matrix top-to-bottom: ~75 % of the must-have cells are GREEN at HEAD. The most visible gaps are the **window emission engine** (one big new sub-engine) and **task lighting variants** (per-archetype lighting program). Everything else is polish, manual placement, or out-of-scope-for-now (stairs / structural).

The recommendation in `APARTMENT-LAYOUT-STATUS-2026-05-29.md` §4 holds: **ship the window engine next**, then close the corridor connectivity validator. After that, the matrix is essentially full for single-apartment residential — at the TACTICAL tier.

## §C.2 — But "architecturally complete" ≠ "architecturally excellent"

The matrix above measures the **WHAT** — which elements end up in which rooms. It says nothing about the **HOW** — whether those elements are placed in a way that feels *considered* rather than *correct*. The driving principles in Part A encode local rules: bed opposite the door, sofa on the longest wall, sink near the window, kitchen runs on the longest wall. They produce **valid** rooms.

What they don't encode (yet) is the global spatial intent that makes architecture *emotionally convincing*:

- **Arrival sequence.** Does the front door open into a compressed threshold that releases into the living daylight, or does it dump directly onto a corridor stub? The rules above don't optimise for this.
- **Sightline composition.** When the user opens the front door, do they see the living-room window (good), the bathroom door (bad), or another bedroom door (worst)? The bubble graph doesn't score visibility.
- **Façade value distribution.** Which exterior edge has the best sun / view / quiet? The rules above don't know — they just place a window on whichever exterior wall happens to be present.
- **Compositional alignment.** Do wet walls stack? Do opening rhythms repeat across the façade? Are corridor walls aligned with structural lines? Today's subdivider has no opinion.
- **Activity-centred furnishing.** Does the sofa face the TV wall, the window view, or just "into the room"? The current rules say the latter.

These gaps belong to the **STRATEGIC tier**, fully documented in `APARTMENT-LAYOUT-STATUS-2026-05-29.md` **§4.5 — The next leap**. Read alongside this matrix:

| Driving principle in Part A | Strategic gap it doesn't yet address (see §4.5) |
|---|---|
| Living: sofa on longest wall, away from door | Sofa-to-window / sofa-to-view logic (gap #12 activity-centred) |
| Living: optimal connectivity to kitchen + dining | Façade value distribution (gap #1) — does living claim the best façade? |
| Kitchen: sink near window | Daylight quality scoring (gap #1 + #5 dual-aspect) |
| Kitchen: open-plan threshold to dining | Spatial expansion / compression sequence (gap #2 hierarchy) |
| Hall: distributes to living + corridor | Arrival-sequence composition (gap #2) — what does the user see on entry? |
| Corridor: spans private rooms | Corridor morphology (gap #3) — straight vs branching, sightline blocking |
| Master: bed opposite door, wardrobe on solid wall | Privacy depth from entry (gap #2) — is master genuinely *deep* in the plan? |
| Bathroom: corridor-only access | Sightline blocking from entry (gap #5) — is the bath door visible from the front door? |
| All bedrooms: window-mandatory | Façade per-edge scoring (gap #1) — which bedroom gets the best façade? |
| All rooms: respect minAreaM2 / minShortSide | Proportional elegance (gap #11) — penalties for long-thin / over-articulated shapes |
| All adjacencies: legality + soft preferences (§ADJACENCY-PREFERENCE) | Typed edge semantics (gap #9) — social-flow vs privacy-access vs intimate |

**Reading guide.** This matrix tells the architect *which elements belong where*. The strategic gaps in §4.5 tell the architect *why the engine's plans don't yet feel excellent*. Both are required reading; neither is complete alone.

## §C.3 — When to escalate from Part A rules to §4.5 strategic work

A rule belongs in Part A when it can be encoded as a **local constraint on one room**. Examples already shipped: kitchen sink near window, bed away from door wall, bathroom toilet on wet wall.

A rule belongs in §4.5 when it requires **global reasoning across multiple rooms or the whole apartment**. Examples not yet built:

- "The best-rated façade edge should be allocated to a habitable room" — needs façade scoring across all edges + a competition between living/master/bedroom for the prize.
- "The arrival sightline should terminate on daylight, not on a bathroom door" — needs visibility ray-casting from the entry into every adjacent room.
- "Wet walls should stack" — needs cross-room alignment scoring.
- "Long-thin notched corridors are penalised even if legal" — needs corridor morphology scoring.

When the next round of tactical work pushes into a constraint that can't be expressed per-room, **STOP and escalate to §4.5** — adding it to the local rules layer will plateau the engine instead of advancing it.

---

## §D — Per-room default door + window system types (queued)

User-flagged 2026-05-29: the NEW DOOR / NEW WINDOW pickers in the AI Create panel default GLOBALLY to `dt-solid-timber` / `wt-timber-casement`. The defaults are sensible but architecturally naive — different room types prefer different door + window types.

### §D.1 — Door system type per room (recommended defaults)

| Room type | Default door system type | Rationale |
|---|---|---|
| `hall` (front door) | `dt-fire-rated-60` (FD60) in multi-apartment; `dt-solid-timber` in single-family | Fire-compartmentation in flats; full-mass timber otherwise |
| `master` / `bedroom` | `dt-white-primed` (developer default) or `dt-solid-timber` | Privacy + acoustic |
| `bathroom` / `ensuite` / `wc` | `dt-white-primed`; `dt-fire-rated-30` where statutory | Opaque + sealable; never glazed |
| `kitchen` | `dt-glazed-timber` (half-light) | Borrows daylight to back-of-flat kitchen |
| `living` / `dining` | `dt-glazed-timber` or `dt-glazed-aluminium` | Maximises spatial flow + light |
| `study` | `dt-solid-timber` | Privacy for concentration |
| `utility` | `dt-white-primed` | Service room — cheap + functional |

### §D.2 — Window system type per room (recommended defaults)

| Room type | Default window system type | Rationale |
|---|---|---|
| `living` / `dining` | `wt-timber-casement` or `wt-aluminium-triple-glazed` | Generous opening + thermal class |
| `kitchen` | `wt-upvc-tilt-turn` | Tilt-vent for cooking moisture; cleanable both sides |
| `master` / `bedroom` | `wt-timber-casement` or `wt-timber-double-hung` | Soft acoustic + bedroom privacy class |
| `bathroom` / `ensuite` | `wt-upvc-tilt-turn` with obscure glazing | Privacy + vent + cleanable |
| `wc` | (typically interior; window only if exterior) | Same as bathroom if present |
| `study` | `wt-timber-casement` | Acoustic + traditional reading-room look |
| `utility` | `wt-upvc-casement` | Cheap + functional |

### §D.3 — Implementation paths

1. **AI-pipeline-side default override (preferred).** Add `defaultDoorSystemTypeFor(roomType)` + `defaultWindowSystemTypeFor(roomType)` resolvers consumed by `buildLayoutCommands.ts` so every auto-generated door/window carries the room-appropriate `systemTypeId`. Closes the entire gap in one commit.
2. **Editor-side per-room default selector.** When the NEW DOOR / NEW WINDOW flow opens with a hosted-room context, the picker defaults swap to the room-appropriate type. Polishes the manual flow.
3. **Picker label width fix.** Truncation visible in the screenshots: `Solid Timber (Default) (solid-t...)`. Either widen the dropdown or drop the redundant id-in-parens suffix when the name is unique.

Queue file: `ai-creation-default-element-types-queue.md`.

---

# Part E — The 5-Layer Architectural Intelligence Model

Everything in Parts A–D answers *"what's in each room and why"* — the **functional topology** layer. That layer is necessary but not sufficient. Architectural excellence emerges from five layers working together; PRYZM today has **≈ 2.5 of 5**. This Part frames where the matrix sits in the larger model and what's missing above it.

> **One-sentence diagnosis (`APARTMENT-LAYOUT-STATUS-2026-05-29.md` §5.1):** PRYZM understands adjacency but not significance. Today's engine *distributes constraints*. Architecture *distributes importance*. Adding more local rules will not close that gap.

## §E.1 — Where the matrix lives in the model

| Layer | Name | Status | What this doc covers |
|---|---|---|---|
| **1** | Functional topology | ✅ Strong | **All of Parts A–D.** Adjacency + access legality + program + dimensions + per-room element matrix + per-room default door/window types. |
| **2** | Geometric rationalisation | 🟡 Partial | Touched implicitly in Part A's placement rules ("sofa on longest wall", "kitchen run on longest wall"). Missing: compositional alignment, proportional elegance, structural rhythm, façade rhythm. |
| **3** | Environmental intelligence | ❌ Absent | Touched only at the "windowMandatory true/false" flag (Part A). Missing: solar analysis, daylight depth, seasonal light, thermal, ventilation paths, acoustic exposure, façade quality scoring. |
| **4** | Perceptual choreography | ❌ Absent | NOT in this doc. Sightlines, reveal sequencing, compression / release, threshold compression, light termination, emotional climax — what the eye sees, where the body pauses. |
| **5** | Cultural / typological intelligence | ❌ Absent | NOT in this doc. The matrix today produces *generic modernist legality*. Parisian / Nordic / Japanese / NYC-loft priors are separate typology overlays. |

**Reading guide.** The matrix in Part B + the driving principles in Part A constitute the LOCAL-RULE layer. Anything that requires **global reasoning across multiple rooms or the whole apartment** (Layers 2–5) does not belong here — it belongs in `APARTMENT-LAYOUT-STATUS-2026-05-29.md` §5 (the strategic framework).

## §E.2 — Why "more rules" is the wrong next move

> Do NOT continue solving this by adding local rules forever. Beyond a point, more local constraints, more furniture rules, more adjacency weights will produce **brittle mediocrity** because architecture quality is increasingly an emergent *global* property, not a local one.

When the next round of work pushes into a constraint that can't be expressed per-room, **escalate to STATUS §5** instead of adding it to Parts A–D here. Concrete examples of constraints that should NOT come into this matrix:

- "The best-rated façade edge should be allocated to a habitable room" — Layer 3 (needs façade scoring across all edges).
- "The arrival sightline should terminate on daylight, not on a bathroom door" — Layer 4 (needs visibility ray-casting from the entry).
- "Wet walls should stack" — Layer 2 (cross-room alignment scoring).
- "Long-thin notched corridors are penalised even if legal" — Layer 2 (morphology scoring).
- "The compression-then-release sequence at the entry produces a positive emotional reading" — Layer 4 (perceptual choreography).
- "A Parisian-typology layout separates the WC from the bathroom and isolates the kitchen by default" — Layer 5 (typology priors).

## §E.3 — Kuma vs Foster lens

The matrix in Parts A–D is **Foster-shaped** — systems-rational, repeatable grammars, deterministic subdivision, optimisation-ready. PRYZM today is closer to Foster than to Kuma because the matrix encodes *what belongs* (functional categories), not *what an inhabitant experiences* (gradients, ambiguity, temporal occupation).

For the matrix to absorb Kuma-shaped intelligence, three categories of upgrade are needed in adjacent docs (NOT in this matrix):

- **Gradient conditions** — the matrix today is binary (must / recommended / permitted / forbidden). Real architecture is gradients (semi-private, visually open but acoustically closed, compressed-then-expanded). A future row "**filtered light from corridor**" or "**partial concealment of kitchen**" cannot be expressed in a must/permitted/forbidden cell.
- **Temporal perception** — the matrix is static (this furniture goes in this room). Architecture is movement through time (waking at 3 am, sunlight at 7 am, sound drift at night). The matrix needs a *temporal occupancy* overlay that scores how the apartment performs at second 1, 5, 20, 300.
- **Material as psychological instrument** — Part B treats materials as finish categories (`timber` / `tile` / `carpet`). Architects treat them as psychological instruments (grain direction, acoustic softness, thermal perception, reflected light warmth). A future "**material intent**" layer overlays the finish-category cells.

## §E.4 — What architects actually optimise (beyond the matrix)

The matrix optimises **fit + legality + program coverage**. Architects also optimise these (none of which are in Part B):

- **Latent tension** — slightly compressed entry before large living reveal; partial concealment of kitchen; asymmetry balanced by light; offset circulation for privacy. Pure optimisation *erases* tension. The matrix has no concept of intentional asymmetry.
- **Memory** — humans remember arrival, corner window, morning light, long sightline, threshold sequence. The matrix has no concept of *what an inhabitant will remember*.
- **Hierarchy** — dominant space, servant spaces, supporting spaces, silent zones, active zones. The matrix gives every required cell equal weight; it has no concept of a *dominant* space.
- **Ambiguity** — good architecture allows multiple readings, flexible use, interpretive openness. The matrix over-specifies (must / forbidden binaries).

These belong in `STATUS §5.4`, NOT here. The matrix is the *necessary* layer; these are the *significance* layer.

## §E.5 — The escalation triggers

When the next round of work pushes into one of these constraint shapes, the work has crossed out of the matrix's scope:

| Trigger | Belongs in |
|---|---|
| "Score every exterior wall by orientation / view / noise; assign rooms by score" | STATUS §5.5 Phase 2 (façade intelligence) |
| "Ray-cast from the entry door; penalise direct bath-door visibility" | STATUS §5.5 Phase 1 (sightline scoring) |
| "Living + master both get an exterior corner; second bedroom does not" | STATUS §5.5 Phase 2 (façade) + Phase 4 (hierarchy enforcement) |
| "Wet walls stack vertically across rooms" | STATUS §5.5 Phase 4 (structural inevitability) |
| "The kitchen→dining edge is a *social-flow* edge with a wide opening; bedroom→corridor is a *privacy-access* edge with a narrow door" | STATUS §5.5 Phase 3 (semantic edge typing) |
| "Simulate the resident walking from bedroom to bathroom at 3 am" | STATUS §5.5 Phase 5 (human movement simulation) |
| "A French-typology apartment isolates the kitchen by default" | STATUS §5.5 Phase 6 (typology priors) |
| "The sofa faces the TV wall, not just 'into the room'" | STATUS §5.5 Phase 7 (activity-centred furnishing) |

When a future commit hits any of these triggers, the matrix gets a *cross-reference back to the STATUS doc*, NOT a new row.

## §E.6 — The transition

> Today PRYZM mostly answers: **"Can this apartment work?"** Architects answer: **"What should this apartment FEEL like to inhabit?"**

The matrix in Part B answers the first question completely. The strategic phases in STATUS §5.5 are what answer the second. This Part exists so future editors understand that *adding more rows to Part B will plateau the engine* — the next leap is in adjacent docs.

## §E.7 — The 7-Layer Cognition Stack (target architecture)

§E.1 maps the matrix to a **5-layer** intelligence model — that's the perceptual framing. The deeper *implementation* model is a **7-layer cognition stack** (Environmental Intelligence + Spatial Hierarchy + Semantic Topology + Compositional Geometry + Perceptual Simulation + Human Behavioural Simulation + Typology Priors), executed as **6 staged optimisation steps** rather than one giant solver. The stack, the staged-optimisation discipline, the Spatial Intent Field substrate, the AI-guides-engine rule, and a status-tracked implementation plan with per-deliverable IDs (L1-α-1, L2-β-1, …) live in the third companion doc:

> **`APARTMENT-COGNITION-STACK-AND-IMPLEMENTATION-PLAN-2026-05-29.md`** — the plan of record.

When a future edit to THIS matrix surfaces a constraint that can't be expressed per-room (an L4 or L5 trigger per §E.5), cross-reference the relevant cognition-stack deliverable (e.g. *"see L2-β-2 Entry sightline score"*) rather than encoding it locally.

---

## §C.4 — Pointers

- Element catalogue raw source: `packages/geometry-*/src/*Types.ts` (12 categories).
- Room rules: `packages/ai-host/src/workflows/apartmentLayout/rules/programRules.ts`.
- Bubble graph builder: `packages/ai-host/src/workflows/apartmentLayout/tgl/bubbleGraph.ts`.
- Furniture solver: `packages/ai-host/src/workflows/furnishLayout/placeSolver.ts` + `archetypes.ts` + `footprints.ts`.
- Companion docs: `APARTMENT-LAYOUT-STATUS-2026-05-29.md`, `REMAINING-WORK-CONSOLIDATED-2026-05-29.md`.
