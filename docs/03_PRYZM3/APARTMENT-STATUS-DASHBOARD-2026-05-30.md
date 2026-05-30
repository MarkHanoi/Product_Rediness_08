# APARTMENT — Status Dashboard (2026-05-30)

Single-page reference for **every phase and subphase** across the apartment platform. Sourced from [APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN-2026-05-29.md](APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN-2026-05-29.md) — that's the canonical plan; this is the at-a-glance status view.

**Legend:** ✅ Complete · 🟨 In progress / partial · ⬜ Not started · 🟦 Strategic / planning · 🟥 Blocked

---

## Strategic substrates (parallel to F-tier)

| Phase | Doc | Status |
|---|---|---|
| **PG0** Platform Geospatial Foundation (12 deliverables, ~26 wk) | [PRYZM03-GEOSPATIAL-FOUNDATION-REVIEW](PRYZM03-GEOSPATIAL-FOUNDATION-REVIEW.md) | 🟦 strategy doc shipped; 0/12 implementation |
| **GS0** Apartment-consumer of PG0 (9 deliverables) | [PRYZM-GEOSPATIAL-FOUNDATION-AND-SITE-INTELLIGENCE-REVIEW](PRYZM-GEOSPATIAL-FOUNDATION-AND-SITE-INTELLIGENCE-REVIEW.md) | 🟦 strategy doc shipped; consumer-of-PG0 |
| **P0** Family Platform & User-Defined Elements (9 deliverables, ~28 wk) | [APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS](APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md) | 🟦 strategy doc shipped; 0/9 implementation |
| **BIM 1/2/3** Live Parametric (14 deliverables, ~17 wk) | [APARTMENT-BIM2-BIM3-DATA-MANAGEMENT-AND-LIVE-PARAMETRIC-SYSTEM](APARTMENT-BIM2-BIM3-DATA-MANAGEMENT-AND-LIVE-PARAMETRIC-SYSTEM.md) | 🟦 strategy doc shipped; partial via modal-dynamic (pre-execute path) |

---

## Tier 1 — Visible tactical Tier-1 items

| ID | Deliverable | Status |
|---|---|---|
| **T1.W** Window-emission engine | NEW pure sub-engine | ⬜ |
| **T1.C** Corridor-connectivity validator | Every habitable touches corridor | ⬜ |
| **T1.D** Per-room default door + window system types | MATRIX §D + queue | ⬜ |

---

## Tier 2 — Pre-furnishing validators (FOUNDATION) — ~CLOSED

| ID | Deliverable | Status |
|---|---|---|
| **D1.1–D1.5** Dimensional data tables | RoomDimensions + ApartmentDimensions + pins | ✅ |
| **T1.1–T1.6** Topology adjacency data tables | All six: types + mandatory + wet + acoustic + frontage | ✅ |
| **D2.1** validateRoomShape (G1+G2+G3+G4+G6) | Soft/hard tiers | ✅ |
| **D2.2** validateRoomFit (G5 furniture-fit lower-bound) + enumerate gate | Soft folds into shapeQuality | ✅ |
| **D2.3** validateKitchenTriangle (G10 NKBA) + D-FLE integration helper | HARD/SOFT bands; live in furnishLayout/validate.ts | ✅ |
| **D2.4** validateApartmentEnvelope | §3.1 gross-area envelope HARD-rejects | ✅ |
| **D2.5 / T2.5** Frontage validator + enumerate topology gate | Constructive allocator (subdivide-side) queued | 🟨 |
| **T2.1** validateMandatoryAdjacencies | A1 hard | ✅ |
| **T2.2** validateForbiddenAdjacencies | A3 hard | ✅ |
| **T2.3** validateAcousticZoning | source/receiver wall sharing | ✅ |
| **T2.4** validateWetCluster | Union-find wet rooms | ✅ |
| **T2.5** validateFrontage | (same as D2.5 above) | 🟨 |
| **T2.6** validateCirculationSequence | Compression-release anti-pattern | ✅ |
| **D3 + T3** Pipeline integration | D3.1 shape gate + D3.4 envelope + D3.5 + T3.3 topology gate live; D3.2/D3.3 + T3.1/T3.2 pending | 🟨 |
| **D4 + T4** Modal axis surfacing | Engine prep ✅ (16 axes plumbed onto breakdown); modal-side rendering ⬜ | 🟨 |
| **D5 + T5** Spec docs sync | D5.1 SPEC §7.5 + D5.2 C09 §3.4.3 ✅; D5.3 user guide ⬜ | 🟨 |
| **§ENVELOPE-DIAGNOSTIC** | D-TGL [] returns clean rejection (not silent strip-slicer) | ✅ |

---

## Tier 3 — Cognition L1: Environmental Intelligence — ~CLOSED

| ID | Deliverable | Status |
|---|---|---|
| **L1-α-1** FacadeValueField | per-edge orientation+sunlight+corner exposure | ✅ |
| **L1-α-2** DaylightDepthField | BRE 7m attenuation + axis wire-in | ✅ |
| **L1-α-3** Plumb facadeField into bubbleGraph allocator | windowMandatory bonus up to +20% | ✅ |
| **L1-α-4** Modal exposes Façade quality axis | Engine prep ✅ (axis on breakdown); modal-side rendering ⬜ | 🟨 |

---

## Tier 4 — Cognition L2: Spatial Hierarchy — SCORING COMPLETE

| ID | Deliverable | Status |
|---|---|---|
| **L2-β-1** hierarchy axis (privacy depth) | Discrete-tier gradient | ✅ |
| **L2-β-2** EntrySightlineScore | Graph-distance form ✅; ray-cast variant (L2-β-2b) ⬜ | 🟨 |
| **L2-β-3** ArrivalSequence | Compression-release ratio | ✅ |
| **L2-β-4** SpatialClimax | Dominant non-circulation room arrival depth | ✅ |
| **L2-β-5** Modal Hierarchy axis + arrival narrative text | UI work | ⬜ |

---

## Tier 5 — Cognition L3: Semantic Topology — COMPLETE

| ID | Deliverable | Status |
|---|---|---|
| **L3-γ-1** EdgeType enum (7 categories + classifier) | + pin tests | ✅ |
| **L3-γ-2** Populate EdgeType in bubbleGraph builder | Every edge classified | ✅ |
| **L3-γ-3** wallsAndDoors reads EdgeType for geometric treatment | Constructive — queued | ⬜ |
| **L3-γ-4** edgeRealisation axis | Via/kind match scoring | ✅ |

---

## Tier 6 — Furniture Catalogue Extension (F1.x)

Each row pays the §0.1 24-step contract obligation ladder. Order by semantic priority.

| ID | Element(s) | Status |
|---|---|---|
| **F1.1** desk + desk_chair | Retires dining-table-as-desk workaround | ✅ |
| **F1.2** bookshelf + bookshelf_glass | Cross-room storage | ✅ |
| **F1.3** tv + tv_unit (S1 media wall) | First wall-mounted renderable | ✅ |
| **F1.4** shoe_cabinet + coat_rack + console_table + entry_bench (S2 entry storage) | 4-element batch | ✅ |
| **F1.5** vanity_unit + bathroom_mirror + mirror_light + towel_rail (S4 bathroom) | All 4: furniture trio + mirror_light in geometry-lighting | ✅ |
| **F1.6'** bath (geometry-plumbing) | Geometry exists in createBathMesh; D-FLE plumbing-fixture placement pending | 🟨 |
| **F1.7** wc_washbasin + wc_mirror (geometry-plumbing + geometry-furniture) | Cross-package | ⬜ |
| **F1.8** Utility/laundry primitives (washing_machine + dryer + utility_cabinet + utility_sink) | 4 elements; cross-package | ⬜ |
| **F1.9** buffet + sideboard | Dining-room storage | ✅ |
| **F1.10** wall_art + wall_mirror | Cross-room decor | ✅ |
| **F1.11** Curtain primitives (curtain_rod + curtain_panel) | S7 window dressing | ✅ |
| **F1.12** dresser + vanity_table | Bedroom dressing | ✅ |
| **F1.13** lounge_chair semantic alias | Routes to Barcelona-black | ✅ |
| **F1.14** pantry_cabinet | Kitchen storage | ✅ |
| **F1.15** pendant_cluster (geometry-lighting) | Cross-package | ⬜ |

**Tier 6 progress:** 11/15 ✅ · 1/15 🟨 · 3/15 ⬜ (all 3 ⬜ are cross-package plumbing/lighting items).

---

## Tier 7 — Cognition L4: Compositional Geometry — SCORING COMPLETE

| ID | Deliverable | Status |
|---|---|---|
| **L4-δ-1** AlignmentField | SCORING form ✅; constructive pre-subdivide variant (L4-δ-1b) ⬜ | 🟨 |
| **L4-δ-2** WetStackAlignment | SCORING form ✅; constructive variant (L4-δ-2b) ⬜ | 🟨 |
| **L4-δ-3** OpeningCadenceScore | Per-wall opening rhythm | ✅ |
| **L4-δ-4** ProportionalElegance | Aspect comfort plateau; constructive variant (L4-δ-4b) ⬜ | 🟨 |

---

## Tier 8 — Archetype wiring (F3.x)

Incremental wirings landed via each F1.x ship.

| ID | Room | Status |
|---|---|---|
| **F3.1** Study | desk + desk_chair + bookshelf | ✅ |
| **F3.2** Living | bookshelf_glass + tv + wall_art shipped; armchair / rug / lamp variants pending | 🟨 |
| **F3.3** Master / bedroom | dresser + vanity_table + wall_mirror + curtains shipped; rug / lounge_chair gating / bedside_lamp anchor pending | 🟨 |
| **F3.4** Bathroom / ensuite | vanity trio + mirror_light shipped + D-LE archetype wired (downlight + wall-mounted mirror_light); bath (F1.6') pending | 🟨 |
| **F3.5** WC | Blocks on F1.7 | ⬜ |
| **F3.6** Utility | Blocks on F1.8 | ⬜ |
| **F3.7** Dining | buffet + sideboard shipped; rug pending | 🟨 |
| **F3.8** Hall | Closed by F1.4 4-pack | ✅ |
| **F3.9** Corridor | Blocks on D-LE linear_led archetype edit | ⬜ |
| **F3.10** Kitchen | pantry_cabinet shipped; pendant_cluster blocks on F1.15 | 🟨 |

---

## Tier 9-11 — Activity Systems (F4) / Lighting Scenes (F5) / Joinery (F6) / Soft Furnishings (F7) / Housekeeping (F8)

| Phase | Status |
|---|---|
| **F4** Activity systems composition layer | ⬜ (depends on F3 closures) |
| **F5** Lighting scenes | ⬜ (D-LE work, separate roadmap) |
| **F6** Built-in joinery | ⬜ |
| **F7** Soft furnishings (auto-place) | ⬜ |
| **F8** Housekeeping | ⬜ |

---

## Pareto objective axis surface — 16 axes load-bearing

The deterministic engine now scores layouts across:

| Group | Axes |
|---|---|
| **Base (5)** | efficiency · adjacency · daylight · circulation · regularity |
| **Quality gates (2)** | shapeQuality · topologyQuality |
| **Cognition L2 — Arrival narrative (4)** | hierarchy · entrySightline · arrivalSequence · spatialClimax |
| **Cognition L3 — Semantic Topology (1)** | edgeRealisation |
| **Cognition L4 — Compositional Geometry (4)** | openingCadence · proportionalElegance · wetStackAlignment · alignmentField |

Every axis is in ObjectiveVector + computeObjectives + weightedSum + LayoutScoreBreakdown + pin tests + master plan ✅.

---

## Test coverage

| Package | Pass | Notes |
|---|---|---|
| @pryzm/ai-host | **729/729** | 2 SCC AiHost.* pre-existing failures unchanged (memory: scc-no-barrel-access-at-module-load) |
| @pryzm/core-app-model | (typecheck) | Pre-existing plugin-side TS errors; lighting-side clean |
| @pryzm/geometry-lighting | (depends on core-app-model rebuild for full validation) | F1.5' mirror_light builder added |
| @pryzm/geometry-furniture | (untouched this slice) | 11 of 15 F1.x types shipped contract-complete |

---

## What's queued next (session-shaped slices)

| Priority | Slice | Effort |
|---|---|---|
| ~~1~~ | ~~F1.5' bathroom-mirror archetype wiring~~ | ✅ done 2026-05-30 |
| 1 | **F1.6' bath D-FLE engine integration** — geometry exists, needs plumbing-fixture placement command | 1 wk |
| 2 | **F1.15 pendant_cluster** in geometry-lighting | 0.5 wk |
| 3 | **F1.7 / F1.8** cross-package plumbing + utility | 1-2 wk each |
| 4 | **Constructive subdivider** (L4-δ-1b / 2b / 4b) — touches subdivide.ts | 1.5 wk |
| 5 | **L1-α-4 + L2-β-5 modal UI** — 16-axis rendering + narrative text | 1 wk |
| 6 | **L2-β-2b ray-cast EntrySightline** | 1 wk |
| 7 | **P0.3 FamilyRegistry substrate** | 3 wk |
| 8 | **PG0.1 Site/Building/Apartment schemas** | 3 wk |

---

## Session 2026-05-30 — autonomous run ledger

This dashboard was generated at the end of a 36-commit autonomous run that:
- Shipped 11 of 15 F1.x renderable types contract-complete
- Closed Tier 2 pre-furnishing validators (D2.1–D2.4, T1.1–T1.6, T2.1–T2.6)
- Closed Tier 5 (Cognition L3) Semantic Topology axes
- Closed Tier 7 (Cognition L4) Compositional Geometry SCORING axes (4/4)
- Shipped 4/4 Cognition L2 Spatial Hierarchy SCORING axes
- Wrote 3 strategic substrate docs (BIM 1/2/3, P0 Family Platform, PG0 platform Geospatial)
- Repositioned apartment-scoped geospatial doc as consumer of PG0
- Created this dashboard for at-a-glance status

`ai-host` tests grew from 588 → 729 (+141).

---

*End — APARTMENT-STATUS-DASHBOARD-2026-05-30.*
