# SPEC-LIVING-SOCIAL-ZONE — pre-flight verification + restatement (2026-06-21)

Per the spec's mandatory §0 pre-flight + "restate the merge-vs-zoning distinction and flag conflicts
before writing any code." No code yet — this gates the build.

## Restated: the two decisions at two stages (kept separate)
- **Merge-or-split (P2, bubble graph)** — a room-GRAPH decision made ONCE per generate: collapse
  living/dining/family into one `social-combined` node (combined target area = sum, area-neutral) OR
  keep them separate (today's behaviour, strictly unchanged). Auto-decidable by plate size / room
  pressure / open-plan flag / adjacency; brief-overridable. Changes node count, cells, walls.
- **Zoning-within-the-room (furnish layer)** — a FURNITURE decision made AFTER the room exists with
  fixed walls: how many seating/dining/snug zones + a circulation spine go inside. Changes NO graph.
  "Too big → multiple zones" lives here, gated by area/short-span (like the kitchen island gate).
The merge path is **strictly additive** — the split case must stay byte-identical.

## ✅ §0 daylight pre-flight — a REAL system exists (consume it, adapted)
- `environment/daylightDepthField.ts` → **`computeDaylightDepthField`** (real, populated; `DAYLIGHT_
  DEPTH_M=7`), threaded into `bubbleGraph` (`daylightField`), plus enumerate's
  **`objectives.solarOrientation`** with site latitude (E.2). The `§DIAG-ENUM daylight=…` /
  `daylightReach=…` are real computed scores, not stubs.
- ⚠ BUT it is a **per-POSITION spatial FIELD** (sample at an x,z), NOT a room-level scalar
  `room.daylightScore`. So **§3 must SAMPLE the field** at window/wall/seating positions — do NOT
  build the §3.1 minimal fallback (the system is mature), but DO adapt: there is no pre-baked room
  scalar to "read a field" from; the planner samples `daylightField` at candidate positions. Also
  reuse `solarOrientation`/site-latitude for the south-facing bias rather than inventing a north.

## 🚩 FurnitureKind CONFLICT — the spec's "confirmed inputs" are partly WRONG
The real `FurnitureKind` union (`furnishLayout/types.ts`) has:
`sofa`, **`corner_sofa`** (the L-sofa — NOT `sofa_l_shape`), `coffee_table`, `dining_table`,
`dining_chair`, `tv`, `tv_unit`, `console_table`, `rug`, `lamp`, `bookshelf`, `bookshelf_glass`,
`sideboard`, `buffet`, `wall_art`, `wall_mirror`, `desk`/`desk_chair`, … (+ kitchen/bath/utility).

The spec assumed these exist — they DO NOT (verify-before-build caught it):
| spec assumes | reality |
|---|---|
| `sofa_l_shape` | **`corner_sofa`** (use this name) |
| `sofa_unit` (modular) | **does NOT exist** — no modular sofa kind |
| `floor_lamp` | **`lamp`** (no floor-specific kind) |
| `fireplace` / `chimney` | **does NOT exist** — no fireplace kind anywhere |
| `armchair` | **does NOT exist** |
| `side_table` | **does NOT exist** (only `console_table`, `entrance_table`, `bedside_table`) |
| `tv_stand` | use **`tv_unit`** (combined) |

**Decision needed before coding (founder):** for the missing kinds —
(a) **map to existing** where possible (`sofa_l_shape`→`corner_sofa`, `floor_lamp`→`lamp`,
    `tv_stand`→`tv_unit`), and
(b) for genuinely-absent kinds (`armchair`, `side_table`, `fireplace`, modular `sofa_unit`) — ADD them
    to `FurnitureKind` + `footprints.ts` + the `furnishRules` spec↔footprint pin test (the test that
    pins every kind's dims), OR scope them OUT of v1 (e.g. v1 uses `sofa`/`corner_sofa` + `coffee_
    table` + `tv_unit` + `rug` + `lamp` only; armchair/fireplace are a follow-up).
The spec's whole §4.1 furniture sub-order (seating→coffee→rug→TV→floor_lamp→fireplace) is built on
kinds half of which don't exist — so this MUST be resolved first. Note: `corner_sofa` already exists
because the living archetype picks it when the room is large (§67.3) — so the L-vs-straight sofa
choice is partly precedented.

## ✅ §2.2 modal toggle — the reusable component EXISTS
`houseModalHtml.ts` uses **`triStateSelect('s{i}.openPlanKitchenDining', 'Kitchen+Dining', …)`** —
a reusable auto/on/off tri-state control. So §2.2's assumption HOLDS: `socialMerge` and the
`familyRoom` toggle reuse `triStateSelect` (and the per-storey override plumbing
`applyPerStoreyOverrides`), NOT a bespoke second UI. The "engine suggests, brief overrides" pattern
already has its shared primitive. (The live-recompute inline suggestion text is the only genuinely
new UI bit.)

## Verdict — what to resolve before any code
1. **Furniture kinds (BLOCKING):** founder picks map-to-existing vs add-new vs scope-out for
   `armchair` / `side_table` / `fireplace` / modular sofa. Until then §4.1 can't be written correctly.
2. **Daylight:** consume `computeDaylightDepthField` by SAMPLING (no §3.1 fallback); reuse
   `solarOrientation` + site latitude. (Resolved — proceed on the real system.)
3. **Modal:** reuse `triStateSelect` + per-storey override plumbing. (Resolved — no new primitive.)

Lowest-risk build order once (1) is answered: **§3 merge-or-split in bubbleGraph** (pure, additive,
the split case stays byte-identical — fully unit-testable, no browser) FIRST; then the furnish-layer
`livingSocialPlanner` zoning (browser-verified, like the kitchen). The merge decision is the closet-
style "pure core first" slice — safe to build now once the family-room/socialMerge brief fields land.
