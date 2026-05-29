# Apartment — Furniture & Activity-System Implementation Plan (2026-05-29)

**Fourth companion** to the apartment doc set:

- `APARTMENT-LAYOUT-STATUS-2026-05-29.md` (tactical history + 5-layer strategic framework)
- `APARTMENT-DRIVING-PRINCIPLES-AND-ROOM-ELEMENT-MATRIX-2026-05-29.md` (local-rule + room × element matrix)
- `APARTMENT-COGNITION-STACK-AND-IMPLEMENTATION-PLAN-2026-05-29.md` (7-layer cognition stack + 6-stage optimisation)
- **THIS doc** — every furniture / activity / room-program gap, broken down into ordered phase/subphase with tracked status.

**Purpose.** The cognition-stack plan covers the *engine* layers. This doc covers the *contents* — what an architect would actually place inside the rooms once the spatial intelligence is in place. **Every single phase + subphase enumerated, in precise execution order**, with file-level pointers.

---

## §0 — IMPORTANT: every subphase MUST be contract-exhaustive

**The discipline.** This plan does not accept "half-shipped" elements. Each new renderable type (F1.x), each new archetype edit (F3.x), each new activity system (F4.x) MUST close ALL of its contract obligations *in the same delivery* — not in a follow-up sweep. If a subphase cannot close all the obligations in one ship, it is **not ready** and the table-row stays ⬜ until it can.

**Why.** A half-shipped element produces emergent contradictions: it appears in archetypes, is dispatched as a command, lands in a snapshot, but has no IFC export / no Zod parse / no proper builder / no plan symbol / no undo. Those gaps surface later as silent corruption (snapshot loads a `desk` field that the loader doesn't recognise → fallback → data loss) or hard runtime throws.

### §0.1 — The contract-obligation ladder

Each NEW RENDERABLE FURNITURE TYPE (F1.x) MUST close every row below before the row in §5 flips ⬜ → ✅.

| # | Obligation | Contract | File / surface |
|---|---|---|---|
| 1 | **Zod schema** entry (L0 purity, P5) | C03 §2.1 | `packages/schemas/src/furniture/*Schema.ts` |
| 2 | `FurnitureType` union member | C03 §2.2 | `packages/geometry-furniture/src/FurnitureTypes.ts` |
| 3 | `FurnitureCategory` mapping (`FurnitureCategoryMap.ts`) | C03 | `packages/geometry-furniture/src/FurnitureCategoryMap.ts` |
| 4 | Geometry **Builder** (3D mesh) | C04 §2 | `packages/geometry-furniture/src/builders/<Kind>Builder.ts` |
| 5 | **PlanSymbolBuilder** (2D plan-view symbol) | C04 §3 / C06 §4 | `packages/geometry-furniture/src/builders/<Kind>PlanSymbolBuilder.ts` |
| 6 | `FurnitureFactory.create()` switch arm | C11 §3 | `packages/geometry-furniture/src/builders/FurnitureFactory.ts` |
| 7 | **Command bus** create / update / remove paths (P6) | C03 §4 / C11 §5 | `packages/command-registry/src/furniture/` (if a parametric type) — most furniture goes via `furniture.create` already registered |
| 8 | Plan-view projection cache entry (16/18 already covered) | C11 §6 / `PLAN-VIEW-…-ARCHIVED` archive | `packages/core-app-model/src/views/ViewRenderCache.ts` |
| 9 | **Snapshot save/load** round-trip | C05 §1.2.2 | `packages/persistence-client/src/snapshot/*` — driven by Zod schema (row 1) |
| 10 | **CRDT replication** (Yjs) | C08 §2 | inherited from `furniture.create` registration if the command is on the bus (row 7) |
| 11 | **ADR-051 single-store undo** (P6 + ADR-051) | C03 §4.5 | inherited from `furnitureStore` if the command takes that path |
| 12 | **IFC export** mapping (IfcFurniture predefined type) | C12 §3 | `packages/file-format/src/ifc/IfcFurnitureWriter.ts` |
| 13 | **Selection + hover** behaviour | C06 §5 | `packages/picking/`, no per-kind code needed if it uses standard furniture pipeline |
| 14 | **Visibility intent** rules (P7) | C09 §4 | `packages/visibility/src/intents/`, inherits furniture defaults unless explicitly overridden |
| 15 | **Material** + system-type registration | C03 §4 / C11 §3 | `packages/geometry-furniture/src/builders/FurnitureMaterialResolver.ts` |
| 16 | **OpenTelemetry span** (P8) at the create boundary | C10 §2 | `tracer.startSpan('furniture.create.<kind>')` in builder or command handler |
| 17 | **Typed window globals** if any (P4) | C06 §1.2 | usually nothing — furniture rarely escapes to `window.*` |
| 18 | **Pure-engine `FurnitureKind` union** (`packages/ai-host`) | C09 §3.4 (the auto-pipeline) | `packages/ai-host/src/workflows/furnishLayout/types.ts` — comes AFTER 1–17 |
| 19 | **Footprint** entry (placement metadata) | SPEC-FURNITURE-LAYOUT-ENGINE | `packages/ai-host/src/workflows/furnishLayout/footprints.ts` |
| 20 | **Archetype** wiring (where the engine places it) | SPEC-FURNITURE-LAYOUT-ENGINE | `packages/ai-host/src/workflows/furnishLayout/archetypes.ts` |
| 21 | **`programRules.requiredFurniture` / `optionalFurniture`** | SPEC-ARCHITECTURAL-PROGRAM-RULES | `packages/ai-host/src/workflows/apartmentLayout/rules/programRules.ts` |
| 22 | **`furnishRules.test.ts`** archetype-vs-rules consistency check passes | — | `packages/ai-host/__tests__/furnishRules.test.ts` |
| 23 | **Unit tests** — builder geometry sanity + plan symbol render + factory dispatch + Zod round-trip + IFC round-trip | C04 §4 / C11 §4 / C12 §4 | per-builder `__tests__/` |
| 24 | **User-guide entry** (if user-facing in the CREATE panel) | C00 / docs | `docs/guides/` |

**That is 24 obligations per new renderable type.** F1.1 (`desk`) alone is ~3–5 days of careful work across 6 packages — not "half a day" as the v1 plan estimated. The v1 plan was the user-visible diagnosis; THIS revision is the developmentally-sound delivery contract.

### §0.2 — The workaround discipline

If a single subphase cannot close rows 1–24 in one ship, the rule is:

> Keep the workaround in place EXPLICITLY. Do not partially admit the new kind. A half-typed element shipped to the engine + scene is worse than a documented workaround.

Concrete example (recorded in code): F0 in v1 attempted to admit `desk` + `desk_chair` to `FurnitureKind` while the geometry-furniture / Zod / builder / factory / IFC layers were still pending. That ships a *fictional* element — it appears in archetypes, it lands as a `furniture.create` command, the renderer falls back to a default, the snapshot can't round-trip, the IFC writer drops it. **Reverted 2026-05-29.** The dining-table-as-desk workaround stays until F1.1 ships every row above green.

### §0.3 — Which contracts each phase touches (quick reference)

| Phase | Contracts touched |
|---|---|
| F1 (renderable types) | C03 (schemas), C04 (rendering), C05 (persistence), C08 (CRDT), C09 §4 (visibility intent), C10 §2 (P8 spans), C11 (creation pipeline), C12 (IFC), C15 (no half-typed) |
| F2 (footprints + plan symbols) | C04 §3, SPEC-FURNITURE-LAYOUT-ENGINE |
| F3 (archetypes) | C09 §3.4, SPEC-ARCHITECTURAL-PROGRAM-RULES, SPEC-FURNITURE-LAYOUT-ENGINE |
| F4 (activity systems) | C09 §3.4 (extension), SPEC-FURNITURE-LAYOUT-ENGINE (new "activity archetype" pattern) |
| F5 (lighting scenes) | SPEC-LIGHTING-LAYOUT-ENGINE, C09 §3.4.1 (auto-pipeline) |
| F6 (built-in joinery) | C03, C04, C11, C12, **+ C15 (hosted on walls)** — crosses geometry-wall pipeline |
| F7 (soft furnishings) | Same as F1 + auto-placement |
| F8 (housekeeping) | All |

**Every phase ships its full obligation ladder. No exceptions.** Plan revisions BELOW now reflect this discipline — estimates corrected upward; the cheap-half-day items are gone.

---

## §1 — Diagnosis: four categories of gap

The gaps fall into four orthogonal classes. Each is fixed differently; mixing them creates dependency tangles.

| Category | Symptom | Fix lives in |
|---|---|---|
| **A — Missing renderable types** | The FurnitureKind union doesn't include the object at all. Nothing to place. | `packages/geometry-furniture/src/FurnitureTypes.ts` (`FurnitureType`) + a new builder. |
| **B — Manual-only elements** | The type exists in the catalogue but no archetype declares it. User must drag it in. | `packages/ai-host/src/workflows/furnishLayout/archetypes.ts`. |
| **C — Not auto-placed yet** | The type is in an archetype but `required: false` + always drops because solver can't find an anchor. | `placeSolver.ts` anchor heuristics; or new sub-zone logic. |
| **D — Missing architectural activity system** | Multiple objects compose an activity (TV wall = TV + console + speakers + cable run). No system-level placement logic. | New layer on top of archetypes — an "activity archetype" that places a composed group. |

**Reading guide.** A single gap can be in one category or several. Example: `desk` is currently A+B+C+D — no renderable type, no archetype, no anchor, no study activity system. `rug` is C — exists as `parametric_*_carpet`, no archetype includes it.

---

## §2 — The seven cross-room activity systems (the big missing layer)

These are not isolated objects — they are **whole activity clusters** that compose multiple objects into a coherent function. Today PRYZM has none of them implemented as activity systems; the closest is `kitchen_*` which is itself an early activity system (cabinetry + appliances + counter as one composition).

| # | Activity system | What it composes | Lives in |
|---|---|---|---|
| **S1** | **Media / TV wall** | TV + TV unit / console + (optional) sound bar + (optional) shelving + cable management | living |
| **S2** | **Entry storage** | Console + shoe cabinet + coat rack + key bowl + (optional) bench | hall |
| **S3** | **Study workstation** | Desk + desk chair + task lamp + bookshelf + (optional) filing | study + (optional) bedroom corner |
| **S4** | **Bathroom vanity** | Vanity unit (basin + countertop + drawers) + mirror + sconce / mirror light + storage tower | bathroom + ensuite |
| **S5** | **Utility / laundry workflow** | Washer + dryer (or W/D combo) + utility sink + counter / folding surface + drying rack | utility |
| **S6** | **Bedroom dressing area** | Wardrobe + drawers + mirror + (optional) vanity / dressing table | master + bedroom (if room) |
| **S7** | **Window dressing (curtains / shading)** | Curtain rod + curtain panels (or roller blind / Venetian / Roman) per exterior window | every room with a window |

§4 phases each of these into their own subphase block with all the parts ordered.

---

## §3 — Per-room program audit (current state vs target)

For each of the 12 room types: what's present, what's missing, which gap category, which activity system.

### §3.1 — Living room (`living`)

**Present.** sofa, coffee_table, lamp.

**Missing / partial.**

- **Media / TV wall (S1)** — entire activity system absent. **Cat A+D.**
- **Rug under sofa** — `parametric_*_carpet` exists; not in archetype. **Cat C.**
- **Curtains** on windows (S7). **Cat A+D.**
- **Wall art** — no renderable type. **Cat A.**
- **Bookshelf** — no renderable type. **Cat A.**
- **Armchair** — `chair_barcelona_*` etc. exist; archetype only requires sofa. **Cat B.**
- **Accent / floor lamp** beyond the corner `lamp`. `floor_arc_brass`, `floor_tripod_black`, `floor_wood_post` exist (Cat B). **Cat B.**

### §3.2 — Kitchen (`kitchen`)

**Present.** `kitchen_straight` (now with default sink + hob + fridge appliances `77416c0`), optional second `kitchen_straight` (L-shape), optional `kitchen_island` (`550e30a`).

**Missing / partial.**

- **Bar / island seating** — `chair_3leg_*` exist; not composed with `kitchen_island`. **Cat C+D.**
- **Pendant cluster over island** — single ambient light only (D-LE). **Cat C+D.**
- **Under-cabinet task lighting** — `linear_led` exists; not in archetype. **Cat C.**
- **Range hood / extractor** — not catalogued as a distinct element (`hob` includes the extractor). **Cat A** (low priority).
- **Pantry cabinet** — no distinct type. **Cat A.**
- **Built-in oven tower** — not a distinct element from the kitchen units. **Cat A** (low priority).

### §3.3 — Dining (`dining`)

**Present.** dining_table, dining_chair × 4, optional lamp.

**Missing / partial.**

- **Pendant over the dining table** — D-LE places one `pendant` per room; not specifically over the dining table. **Cat C.**
- **Buffet / sideboard** — no renderable type. **Cat A.**
- **Rug under the dining table** — exists; not in archetype. **Cat C.**

### §3.4 — Hall / entrance (`hall`)

**Present.** `entrance_table` (optional).

**Missing / partial.**

- **Entry storage system (S2)** — entire system absent. **Cat A+D.**
- **Shoe cabinet** — no renderable type. **Cat A.**
- **Coat rack / hooks** — no renderable type. **Cat A.**
- **Mirror** — no renderable type. **Cat A.**
- **Bench** for putting on shoes — no specific type. **Cat A.**
- **Runner rug** — exists; not in archetype. **Cat C.**

### §3.5 — Corridor (`corridor`)

**Present.** Empty (by design — circulation kept clear).

**Missing / partial.**

- **Linear LED ceiling strip** — `linear_led` exists; not in archetype. **Cat C.**
- **Wall art / runner** — same as hall. **Cat A.**

### §3.6 — Master / bedroom (`master`, `bedroom`)

**Present.** bed, bedside_table × 2, wardrobe, lamp.

**Missing / partial.**

- **Dressing area (S6)** — wardrobe is present; dressers, mirror, vanity not composed. **Cat C+D.**
- **Bedside lamp on the table** — `table_terracotta` exists; lamp anchor is "corner" instead of "on-bedside". **Cat C.**
- **Curtains** (S7). **Cat A+D.**
- **Rug under the bed** — exists; not in archetype. **Cat C.**
- **Reading chair + floor lamp** — chair types exist; no archetype slot. **Cat C.**
- **TV on opposite wall** (master suite media). **Cat C+D.**
- **Wall art behind the bed** — no renderable type. **Cat A.**
- **Built-in headboard / wall-mounted lights** — no built-in element type. **Cat A+D.**

### §3.7 — Bathroom (`bathroom`)

**Present.** toilet_radiator (toilet + heated rail), shower_glass_panel.

**Missing / partial.**

- **Vanity system (S4)** — basin + countertop + storage + mirror + lighting absent as a composed unit. **Cat A+D.**
- **Standalone basin** — no renderable type beyond the integrated toilet_radiator. **Cat A.**
- **Mirror + mirror light** — no renderable type. **Cat A.**
- **Full bathtub** — only shower_glass_panel exists; no `bath` renderable. **Cat A.**
- **Towel rail / radiator** — separate from toilet_radiator. **Cat A.**
- **Toilet brush + paper holder + accessories** — `BathroomAccessoryVariant` enum exists in `geometry-plumbing` (Cat C). **Cat C.**
- **Bath mat / rug** — moisture-resistant variant. **Cat A.**

### §3.8 — Ensuite (`ensuite`)

Same as bathroom but with a tighter envelope. All §3.7 gaps apply identically.

### §3.9 — WC (`wc`) — new room type 2026-05-29

**Present.** toilet_radiator. Washbasin in `requiredFixtures` but no renderable type.

**Missing / partial.**

- **WC washbasin renderable type** (`wc_washbasin`) — small wall-hung basin distinct from `vanity_unit`. **Cat A.**
- **WC mirror** — no renderable type. **Cat A.**
- **Towel hook / toilet roll holder** — `BathroomAccessoryVariant` items. **Cat C.**

### §3.10 — Study (`study`) — WEAKEST SEMANTICALLY

**Present.** Uses `dining_table` + `dining_chair` as desk + chair workaround (explicitly noted in code comments).

**Missing / partial.**

- **Desk (`desk`)** — no renderable type. **Cat A.** Highest semantic-clarity win in the entire furniture catalogue.
- **Desk chair (`desk_chair`)** — no renderable type. **Cat A.**
- **Bookshelf** — no renderable type. **Cat A.**
- **Task lamp on desk** — `linear_led` exists; no `desk_lamp` specifically. **Cat A.**
- **Filing cabinet** — no renderable type. **Cat A.**
- **Pin board / whiteboard** — no renderable type. **Cat A** (low priority).
- **Reading armchair + floor lamp** — chair types exist; not in archetype. **Cat C.**

**Diagnosis.** Study is fully gap-blocked at Cat A — until `desk` + `desk_chair` exist as renderable types, no progress is possible at higher layers.

### §3.11 — Utility (`utility`)

**Present.** Empty.

**Missing / partial.**

- **Utility / laundry workflow system (S5)** — entire activity absent. **Cat A+D.**
- **Washing machine renderable type** — `washing_machine_dark`/`white` exist as `KitchenApplianceType` (kitchen-unit-mounted), NOT as standalone furniture. **Cat A** (variant).
- **Tumble dryer** — same gap. **Cat A.**
- **Utility sink** — `plumbingFixtureType: sink` exists generically. **Cat C.**
- **Counter / folding surface** — no specific type. **Cat A.**
- **Drying rack** — no renderable type. **Cat A.**
- **Storage cabinets** — `wardrobe` could be used (Cat C workaround); a proper `utility_cabinet` is missing. **Cat A.**

---

## §4 — Phased implementation plan (precise order)

**Ordering principle.** Each phase BLOCKS the next where a downstream phase depends on a renderable type from an earlier phase. The order below is the strict execution order — running F3 before F1 would compose activity systems out of objects that don't yet exist.

Legend (Status column):

- ⬜ Not started · 🟦 Planning / spec · 🟨 In progress · ✅ Complete · 🟥 Blocked

### §4.1 — Phase F0 — RETIRED (was: workaround "first win")

**Retired 2026-05-29 after a live revert.** The original F0 attempted to partially admit `desk` + `desk_chair` to `FurnitureKind` without closing rows 1–17 of the §0.1 obligation ladder (no `FurnitureType` extension, no builder, no plan symbol, no factory arm, no Zod schema, no IFC). It shipped a fictional element — present in the pure engine, dispatched as a command, rendered as a fallback, un-round-trippable through snapshot or IFC. **Code reverted; 424/424 ai-host tests restored.**

**The lesson, codified in §0.2.** The dining-table-as-desk workaround stays explicit-and-commented in `archetypes.ts` until F1.1 ships every contract obligation green. There is no longer a "smaller first win." The first real win is F1.1 itself.

### §4.2 — Phase F1 — Missing renderable types (Cat A) — CONTRACT-EXHAUSTIVE

The "no type exists" gap. Every downstream phase depends on these. **Each row below is a full delivery: rows 1–24 of the §0.1 obligation ladder green before the row flips ✅.**

Each F1.x is broken into the sub-deliverable ladder. Estimates re-grounded against contract scope; **a single new renderable furniture type is ~3–5 dev-days of careful work across 6 packages**, not half a day. Order within F1: most semantically important first.

For brevity the sub-ladder is enumerated once below; every F1.x row inherits it implicitly.

#### §4.2.0 — The per-type sub-deliverable ladder (applies to every F1.x)

For one new `FurnitureType` (e.g. `desk`):

| Sub | What | File | Est |
|---|---|---|---|
| .a | Zod schema + factory test | `packages/schemas/src/furniture/DeskSchema.ts` | 0.25 day |
| .b | `FurnitureType` union extension + `FurnitureCategoryMap` entry | `geometry-furniture/src/FurnitureTypes.ts` + `FurnitureCategoryMap.ts` | 0.25 day |
| .c | 3D `DeskBuilder` (parametric mesh) + sanity tests | `geometry-furniture/src/builders/DeskBuilder.ts` + `__tests__/` | 1 day |
| .d | 2D `DeskPlanSymbolBuilder` (plan view) + tests | `geometry-furniture/src/builders/DeskPlanSymbolBuilder.ts` + `__tests__/` | 0.5 day |
| .e | `FurnitureFactory.create()` switch arm + dispatch test | `geometry-furniture/src/builders/FurnitureFactory.ts` | 0.25 day |
| .f | `FurnitureMaterialResolver` mapping (default materialId + per-part overrides) | `FurnitureMaterialResolver.ts` | 0.25 day |
| .g | Plan-view projection cache entry (per `PLAN-VIEW-…-ARCHIVED` policy — version-stamp + LRU) | `core-app-model/src/views/ViewRenderCache.ts` | 0.25 day |
| .h | Persistence: Zod parse → snapshot round-trip test (write + read + assert) | `persistence-client/src/snapshot/` + per-test | 0.25 day |
| .i | CRDT: `furniture.create` already on the bus inherits Yjs replication — verify with a happy-path test (existing furniture path) | `persistence-client/__tests__/` | 0.25 day |
| .j | ADR-051 single-store undo: verify via `furnitureStore` — usually inherited; assert with a per-type undo + redo test | `__tests__/` | 0.25 day |
| .k | IFC export: `IfcFurnitureWriter` predefined-type mapping + round-trip test | `file-format/src/ifc/IfcFurnitureWriter.ts` + `__tests__/` | 0.5 day |
| .l | Visibility intent default + tests | `packages/visibility/src/intents/` | 0.25 day |
| .m | OpenTelemetry span at the create boundary | builder or command handler | 0.1 day |
| .n | Pure-engine `FurnitureKind` union extension | `ai-host/src/workflows/furnishLayout/types.ts` | 0.1 day |
| .o | `footprints.ts` entry + per-kind footprint test | `ai-host/src/workflows/furnishLayout/footprints.ts` | 0.25 day |
| .p | `archetypes.ts` wiring (which rooms place it) | `ai-host/src/workflows/furnishLayout/archetypes.ts` | 0.25 day |
| .q | `programRules.requiredFurniture` / `optionalFurniture` update | `ai-host/src/workflows/apartmentLayout/rules/programRules.ts` | 0.1 day |
| .r | `furnishRules.test.ts` archetype-vs-rules consistency check | `ai-host/__tests__/furnishRules.test.ts` | 0.1 day |
| .s | CREATE-panel catalogue entry (if user-facing) | `apps/editor/src/ui/create/batchCatalogue.ts` | 0.25 day |
| .t | User-guide entry | `docs/guides/` | 0.1 day |

**Per-type total: ~5 dev-days.** Each of the F1.x rows below pays this full cost.

#### §4.2.1 — F1.1 Desk + desk_chair

| ID | New `FurnitureType` | Architectural notes | Estimate | Status |
|---|---|---|---|---|
| **F1.1** | `desk` (1400 × 700 × 750 mm, parametric width 1200/1400/1600) + `desk_chair` (550 × 600 × 900 mm, swivel base) | Desk anchors at the window in the study archetype (`anchor: 'wall-window'`); chair pulls out 0.9 m. Replaces the dining-table-as-desk workaround end-to-end. Two types × the §4.2.0 ladder. | 2 × 5 days = **10 dev-days** | ⬜ |

Subphases: F1.1.a through F1.1.t per element × 2. The Zod schemas live alongside `BedSchema.ts`. The 3D mesh is a parametric box-stretcher (top slab + 4 legs); the 2D plan symbol is a rectangle with a chair half-circle. IFC export: `IfcFurniture` with `predefinedType: 'DESK'` (IFC 4 standard).

#### §4.2.2 — F1.2 Bookshelf

| ID | New `FurnitureType` | Architectural notes | Estimate | Status |
|---|---|---|---|---|
| **F1.2** | `bookshelf` (open shelves, parametric height + bays) + `bookshelf_glass` (glass-front variant) | Cross-room. Anchored on `wall-longest`, excludes window wall. IFC `IfcFurniture` predefinedType `SHELF`. | 2 × 5 days = **10 dev-days** | ⬜ |

#### §4.2.3 — F1.3 TV + TV unit

| ID | New `FurnitureType` | Architectural notes | Estimate | Status |
|---|---|---|---|---|
| **F1.3** | `tv` (wall-mounted screen — child of wall like a hosted element OR free-standing) + `tv_unit` (low cabinet) | TV is the trickier of the two — if wall-mounted it semantically resembles a hosted element (cf. C15). Decision required at F1.3.a: full hosted-element treatment (more work) vs free-standing furniture (simpler, no wall anchoring). **Recommendation: free-standing furniture with an `anchor: 'wall-mounted'` placement hint, NOT a C15 hosted element.** That keeps the geometry-wall pipeline untouched. | 2 × 5 days = **10 dev-days** | ⬜ |

#### §4.2.4 — F1.4 Entry storage primitives

| ID | New `FurnitureType` | Architectural notes | Estimate | Status |
|---|---|---|---|---|
| **F1.4** | `shoe_cabinet`, `coat_rack`, `console_table` (distinct from existing `entrance_table` — taller / narrower), `entry_bench` | 4 types × 5 days = **20 dev-days**. Composes with S2 activity system. | **20 dev-days** | ⬜ |

#### §4.2.5 — F1.5 Bathroom vanity primitives

| ID | New `FurnitureType` | Architectural notes | Estimate | Status |
|---|---|---|---|---|
| **F1.5** | `vanity_unit` (countertop + integrated basin + drawers), `bathroom_mirror`, `mirror_light` (acts as a `LightingFixtureType` — coordinate with `geometry-lighting`), `towel_rail` | `mirror_light` straddles geometry-furniture vs geometry-lighting. Decision: it is a `LightingFixtureType` member, not a `FurnitureType` — moves the cost into `geometry-lighting` (same ladder). Composes with S4 activity system. | 3 furniture + 1 lighting × 5 days = **20 dev-days** | ⬜ |

#### §4.2.6 — F1.6 Full bathtub

| ID | New `FurnitureType` | Architectural notes | Estimate | Status |
|---|---|---|---|---|
| **F1.6** | `bath` (drop-in 1700 × 700 × 500 mm; freestanding clawfoot 1800 × 800 × 600 mm) — TWO variants | Plumbing fixture-adjacent (cf. `PlumbingFixtureType: bath` which is already in `geometry-plumbing`). Decision: live in `geometry-plumbing`, NOT `geometry-furniture` — it is a wet fixture by IFC classification (`IfcSanitaryTerminal` predefinedType `BATH`). This row drops out of F1 (furniture) and is owned by F1.6' below. | — | retired |
| **F1.6'** | `BathGeometry` in `geometry-plumbing` + Zod schema in `packages/schemas/src/plumbing/` | Same ladder but a different package owner. ~5 dev-days × 2 variants = **10 dev-days**. | **10 dev-days** | ⬜ |

#### §4.2.7 — F1.7 WC primitives

| ID | New types | Architectural notes | Estimate | Status |
|---|---|---|---|---|
| **F1.7** | `wc_washbasin` (small wall-hung) in `geometry-plumbing`; `wc_mirror` in `geometry-furniture` | Same package split as F1.6'. | 2 × 5 days = **10 dev-days** | ⬜ |

#### §4.2.8 — F1.8 Utility / laundry primitives

| ID | New types | Architectural notes | Estimate | Status |
|---|---|---|---|---|
| **F1.8** | `washing_machine_standalone`, `tumble_dryer`, `utility_sink` (in `geometry-plumbing`), `utility_cabinet`, `drying_rack` | The kitchen-mounted `washing_machine_*` variants in `KitchenApplianceType` stay; these are the distinct standalone utility-room versions. | 5 × 5 days = **25 dev-days** | ⬜ |

#### §4.2.9 — F1.9 Buffet / sideboard

| ID | New types | Architectural notes | Estimate | Status |
|---|---|---|---|---|
| **F1.9** | `buffet`, `sideboard` | Dining + living. | 2 × 5 days = **10 dev-days** | ⬜ |

#### §4.2.10 — F1.10 Wall art + wall mirror

| ID | New types | Architectural notes | Estimate | Status |
|---|---|---|---|---|
| **F1.10** | `wall_art` (parametric framed picture), `wall_mirror` (distinct from `bathroom_mirror`) | Implemented as parametric wall-mounted plane. Like F1.3 TV — recommend free-standing furniture with wall-mounted anchor hint, not C15 hosted. | 2 × 5 days = **10 dev-days** | ⬜ |

#### §4.2.11 — F1.11 Curtain primitives

| ID | New types | Architectural notes | Estimate | Status |
|---|---|---|---|---|
| **F1.11** | `curtain_rod`, `curtain_panel`, `roller_blind`, `venetian_blind` | Composes with S7. Curtain panels are *parametric* — width tracks the window they cover. The placement engine must read window geometry from `wall.openings`. | 4 × 5 days = **20 dev-days** | ⬜ |

#### §4.2.12 — F1.12 Bedroom dressing

| ID | New types | Architectural notes | Estimate | Status |
|---|---|---|---|---|
| **F1.12** | `dresser` (chest of drawers), `vanity_table` (dressing table with mirror) | Composes with S6. | 2 × 5 days = **10 dev-days** | ⬜ |

#### §4.2.13 — F1.13 Lounge chair alias

| ID | What | Notes | Estimate | Status |
|---|---|---|---|---|
| **F1.13** | Add a `lounge_chair` semantic alias to `FurnitureCategoryMap` that resolves to one of the existing `chair_barcelona_*` / `chair_oak_curved_uph` variants per a deterministic style preference. Pure mapping; no new builder. | One-day. Does NOT pay the full §4.2.0 ladder because no new builder is created. | **1 dev-day** | ⬜ |

#### §4.2.14 — F1.14 Pantry cabinet

| ID | New types | Architectural notes | Estimate | Status |
|---|---|---|---|---|
| **F1.14** | `pantry_cabinet` (kitchen storage tower) | Composes with kitchen archetype. | 5 dev-days | ⬜ |

#### §4.2.15 — F1.15 Pendant cluster (LightingFixtureType, not FurnitureType)

| ID | New types | Architectural notes | Estimate | Status |
|---|---|---|---|---|
| **F1.15** | `pendant_cluster` in `geometry-lighting` (multi-pendant fixture) | Owner: `geometry-lighting`, not `geometry-furniture`. Full ladder applies but in the lighting package. | 5 dev-days | ⬜ |

**Total F1.** 15 deliverables × ~5 dev-days each (a few cheaper, a few in `geometry-plumbing` / `geometry-lighting`) = **~150 dev-days** (~7.5 months at 1 contributor, 3–4 months at 2 parallel contributors). Each subphase is full-ladder; nothing is "0.5 day."

This is **dramatically more honest** than the v1 estimate. The v1 plan undercounted by a factor of ~10× because it ignored the contract obligation ladder.

### §4.3 — Phase F2 — Footprint catalogue + plan symbols

Every F1 type also needs a footprint entry + a plan symbol. Track these as a follow-up sub-sweep AFTER F1 ships the type unions, OR fold into each F1 subphase. Treating as a separate phase makes status easier to track when multiple authors work in parallel.

| ID | Subphase | What | Status |
|---|---|---|---|
| **F2.1** | Footprints for F1.1–F1.5 | `footprints.ts` entries | ⬜ |
| **F2.2** | Footprints for F1.6–F1.10 | same | ⬜ |
| **F2.3** | Footprints for F1.11–F1.15 | same | ⬜ |
| **F2.4** | Plan symbols for F1.1–F1.5 | `*PlanSymbolBuilder` files | ⬜ |
| **F2.5** | Plan symbols for F1.6–F1.10 | same | ⬜ |
| **F2.6** | Plan symbols for F1.11–F1.15 | same | ⬜ |

**Total F2.** ~5 days. Pure data + symbol-builder work.

### §4.4 — Phase F3 — Archetype wiring (Cat B → C closures)

Once F1 + F2 land, the existing archetypes can REFERENCE the new types. This is the smallest possible step from "type exists" → "type appears in generated apartments." Subphases ordered by room-type weakness.

| ID | Subphase | Archetype edits | Status |
|---|---|---|---|
| **F3.1** | Study | Add `desk` (required) + `desk_chair` (required) + `bookshelf` (optional) + `lamp` (existing) + `lounge_chair` (optional). Remove dining-as-desk workaround. | ⬜ |
| **F3.2** | Living | Add `armchair` × 1 (optional), `bookshelf` (optional), `rug` (optional, anchor: 'beneath-sofa-group'), `lamp` variants (corner + floor). | ⬜ |
| **F3.3** | Master / bedroom | Add `dresser` (optional), `rug` (optional, anchor: 'beneath-bed'), `lounge_chair` (optional in master only — area-gated). Switch lamp anchor from 'corner' to 'on-bedside' (uses `table_terracotta`). | ⬜ |
| **F3.4** | Bathroom + ensuite | Add `vanity_unit` (required if room ≥ 5 m², replaces toilet_radiator's integrated basin), `bathroom_mirror` (required, anchor: 'on-vanity'), `mirror_light` (required), `towel_rail` (required), `bath` (optional, area-gated). | ⬜ |
| **F3.5** | WC | Add `wc_washbasin` (required) + `wc_mirror` (required) + accessory set (paper, brush). | ⬜ |
| **F3.6** | Utility | Add `washing_machine_standalone` (required) + `utility_cabinet` (required) + `utility_sink` (optional) + `drying_rack` (optional). | ⬜ |
| **F3.7** | Dining | Add `buffet` (optional, area-gated > 12 m²) + `rug` (optional, anchor: 'beneath-table-group'). | ⬜ |
| **F3.8** | Hall | Add `console_table` (optional) + `shoe_cabinet` (required if area ≥ 4 m²) + `coat_rack` (required) + `wall_mirror` (optional). | ⬜ |
| **F3.9** | Corridor | Add `linear_led` ceiling strip (auto-fired by D-LE, not by furnish engine — track in `lightingLayout/archetypes.ts`). | ⬜ |
| **F3.10** | Kitchen | Add `pendant_cluster` (optional, anchor: 'above-island' — composes with `kitchen_island`); update D-LE to emit it when island present. | ⬜ |

**Total F3.** ~5 days across the 10 subphases.

### §4.5 — Phase F4 — Activity systems (S1–S7)

The big one. Each activity system is a **composed group**: multiple objects placed with relative-to-each-other anchors. Today's solver places each item independently; activity systems need a group-leader pattern (already partially used for bed → bedside tables; needs generalising).

Order: smallest / cleanest first.

| ID | System | What | Estimate | Status |
|---|---|---|---|---|
| **F4.1** | **S7 Window dressing** | Per exterior window: place `curtain_rod` (anchor: 'above-window'), `curtain_panel` × 2 (anchor: 'beside-window'). Living/master = floor-length; bathroom/kitchen = `roller_blind`; study = `venetian_blind`. | 3 days | ⬜ |
| **F4.2** | **S2 Entry storage** | Hall: `console_table` (longest free wall) + `shoe_cabinet` (under it OR adjacent low) + `coat_rack` (door wall) + `wall_mirror` (above console). | 3 days | ⬜ |
| **F4.3** | **S3 Study workstation** | Study: `desk` (anchor: 'wall-window' — desk faces window) + `desk_chair` (beside desk) + `desk_lamp` (on desk) + `bookshelf` (longest solid wall). | 3 days | ⬜ |
| **F4.4** | **S4 Bathroom vanity** | Bathroom/ensuite: `vanity_unit` (wet wall, replaces standalone basin), `bathroom_mirror` (above vanity), `mirror_light` (above mirror), `towel_rail` (adjacent free wall). | 4 days | ⬜ |
| **F4.5** | **S5 Utility / laundry workflow** | Utility: `washing_machine_standalone` + `tumble_dryer` (stacked or side-by-side on plumbing wall), `utility_cabinet` (above), `utility_sink` (adjacent), optional `drying_rack` ceiling-mounted. | 4 days | ⬜ |
| **F4.6** | **S6 Bedroom dressing area** | Master + bedroom: `wardrobe` (existing) + `dresser` (beside wardrobe) + `vanity_table` (master only, area-gated, opposite wall to bed). | 3 days | ⬜ |
| **F4.7** | **S1 Media / TV wall** | Living: `tv_unit` (longest free wall, NOT the door wall, NOT the window wall) + `tv` (on the wall behind/above tv_unit) + optional `bookshelf` flanking. Sofa anchor flips to face the TV wall. | 5 days | ⬜ |

**Total F4.** ~25 days. The "Activity Archetype Pattern" — a group leader with relative-to-leader children — is a small extension of the existing `group: 'bed'` mechanism in `archetypes.ts`. Build it once in F4.1, reuse in F4.2–F4.7.

### §4.6 — Phase F5 — Lighting scenes (depends on F1 fixtures)

Today's D-LE places ONE fixture per room. Lighting design layers ambient + task + accent. Sub-phases ordered by ambient-first.

| ID | Subphase | What | Status |
|---|---|---|---|
| **F5.1** | Task lighting wiring | Kitchen under-cabinet `linear_led` (S1.10); bedside `table_terracotta` (F3.3); bathroom mirror `mirror_light` (F4.4); study desk lamp (F4.3). All declared in archetypes; D-LE composes per occupancy. | ⬜ |
| **F5.2** | Accent lighting | Living `floor_arc_brass` or `floor_tripod_black` in corners; corridor `linear_led` ceiling strip; corner accents in bedroom. | ⬜ |
| **F5.3** | Pendant cluster over island/table | Multi-pendant fixture, archetype + D-LE wiring (depends on F1.15 + F3.10). | ⬜ |
| **F5.4** | Lighting scenes presets | Per-room "Evening / Day / Task" scene declarations (data-only — switches are out of scope today). | ⬜ |

**Total F5.** ~5 days. Depends on F1.15 and F3 wiring.

### §4.7 — Phase F6 — Built-in joinery

The most complex tier. Built-ins reference wall geometry directly + extend interior partitions. Hardest because they cross-cut the wall + furniture pipelines.

| ID | Subphase | What | Status |
|---|---|---|---|
| **F6.1** | Built-in wardrobe variants | Wall-to-ceiling, wall-to-wall wardrobe (parametric). Replaces standalone `wardrobe` in master where the long wall allows. | ⬜ |
| **F6.2** | Built-in shelving | Floor-to-ceiling shelving along a wall (living + study). | ⬜ |
| **F6.3** | Window seat / niche | Bench seat fitted under a window. Adds bench geometry + reads window position from `wall.openings`. | ⬜ |
| **F6.4** | Built-in headboard with sconces | Wall-mounted parametric headboard with integrated reading lamps (replaces freestanding lamp anchor 'on-bedside'). | ⬜ |

**Total F6.** ~10–15 days. Genuinely new mechanism — built-ins live on the boundary between `geometry-furniture` and `geometry-wall`.

### §4.8 — Phase F7 — Soft furnishings + textiles (Cat C closures)

Smaller but very visible polish.

| ID | Subphase | What | Status |
|---|---|---|---|
| **F7.1** | Rug auto-placement | `rug` anchor types (`beneath-sofa-group`, `beneath-bed`, `beneath-table-group`, `runner-along-corridor`). Solver respects them; selects variant by room (`parametric_chevron_carpet` / `_patchwork` / `_stripe`). | ⬜ |
| **F7.2** | Throw + pillows | Sofa cushions, bed throw. Decorative; auto-placed as soft children of sofa / bed group leaders. | ⬜ |
| **F7.3** | Indoor plant placement | `plant_01..08` anchored in corners or beside windows. Optional, area-gated. | ⬜ |

**Total F7.** ~4 days.

### §4.9 — Phase F8 — Catalogue housekeeping

| ID | Subphase | What | Status |
|---|---|---|---|
| **F8.1** | `FurnitureType` audit | After F1–F7, sweep `FurnitureType` for orphans (types no archetype references). Either retire or add to a "manual-only" tier. | ⬜ |
| **F8.2** | Per-room default door/window types | The AI-creation default resolver from the matrix doc §D (per-room defaults for door + window system types). | ⬜ |
| **F8.3** | Material intent labels | Pin each `FurnitureType` with a `materialIntent` field (`timber-warm` / `metal-cool` / `fabric-soft` / etc.) so future material-intelligence layers (cognition-stack §3.A/D) have a substrate. | ⬜ |

**Total F8.** ~3 days.

---

## §5 — Cross-phase tracking table (CONTRACT-EXHAUSTIVE estimates)

The same plan flattened into a single tracking table. **Estimates corrected upward — every row pays the full §0.1 obligation ladder.** Sub-deliverable accounting in F2 is folded into F1 (footprints + plan symbols are rows .d and .o of the §4.2.0 ladder).

| Phase | Total subphases | Corrected estimate | Blocked by | Status (rollup) |
|---|---|---|---|---|
| ~~F0~~ | — | **Retired 2026-05-29 after revert** (see §4.1) | — | ⛔ |
| **F1 — Renderable types** (15 deliverables × full §4.2.0 ladder) | 15 | **~150 dev-days** (vs v1's wrong "10–14") | — | ⬜ |
| ~~F2~~ — Footprints + plan symbols | — | folded into F1.x sub-deliverables .d + .o | — | merged |
| **F3 — Archetype wiring** | 10 | ~5 dev-days **once F1 substantially landed** — blocked rows ⬜ until prerequisites green | F1.x for each new kind referenced | ⬜ |
| **F4 — Activity systems** | 7 | ~25 dev-days **plus** the activity-archetype pattern (new solver layer ~5 dev-days) = **~30 dev-days** | F1 + F3 | ⬜ |
| **F5 — Lighting scenes** | 4 | ~5 dev-days (D-LE archetype edits; the new fixture types ride F1.15 + F1.5's `mirror_light`) | F1.15 + F1.5 | ⬜ |
| **F6 — Built-in joinery** | 4 | **~30 dev-days** — full §0.1 ladder *plus* C15 hosted-element semantics on walls (new sub-ladder) | F1 + geometry-wall extension | ⬜ |
| **F7 — Soft furnishings** | 3 | ~5 dev-days (rugs reuse existing `parametric_*_carpet`; throws / pillows are minor cosmetic adds) | F3 archetypes for anchor types | ⬜ |
| **F8 — Housekeeping** | 3 | ~3 dev-days | F1–F7 substantially done | ⬜ |

**Total commitment, corrected.** ~225 dev-days (≈ 11 months single-contributor; 5–6 months at two parallel contributors). This is the **honest** cost. The v1 estimate was off by ~3× because it ignored the per-element contract obligation ladder.

**Why this matters.** If a sponsor reads v1 thinking F1 is 14 days, then sees Q1 budget burn through and only `desk` is *fully* shipped, the entire programme loses credibility. The corrected estimate is conservative across all 24 obligations + their tests. Under-estimating the same scope by 3× is exactly the dynamic that produces brittle systems (rows shipped half-done because the timeline forces them).

---

## §6 — How this fits with the other apartment docs

| This doc | Cognition-stack doc (`APARTMENT-COGNITION-STACK-AND-IMPLEMENTATION-PLAN-2026-05-29.md`) |
|---|---|
| Contents — what objects exist + go in which rooms + how they compose | Engine — how the global spatial intelligence ranks layouts |
| Closes Cat A/B/C/D gaps inside Layer 1 (functional topology) | Opens Layers 2–7 (Spatial Hierarchy → Typology Priors) |
| Phases F0–F8 = ~3.5 months tactical | Phases L1–L7 = ~30 weeks strategic |
| Visible per-room polish per commit | Per-axis ranking jumps + emergent quality |
| Driven by: an architect inhabits this apartment | Driven by: an architect *designs* this apartment |

**Both tracks run in parallel.** F0/F1/F3 closes visible furniture gaps the user sees per session. The cognition-stack phases produce the deeper "this feels designed" jumps. Don't pick one over the other — sequence so each round ships visible Tier 1 progress AND structural Tier 2 progress.

## §7 — Recommended near-term sequencing

If the next 2 weeks are the target window, ship in this exact order (highest semantic-clarity-per-day first):

1. **F0 (study workaround retirement)** — 2 days. Single biggest semantic-clarity win in the catalogue. Removes the most-commented workaround.
2. **F1.1 + F1.2** (`desk` / `desk_chair` / `bookshelf` proper geometry) — 2 days. Lets F3.1 land.
3. **F3.1** (study archetype proper) — 0.5 day. Closes the loop opened by F0.
4. **F1.3 + F4.7** (TV + TV unit + S1 media wall) — 6 days. Biggest visible jump in living rooms.
5. **F1.5 + F1.6 + F3.4 + F4.4** (vanity primitives + bathroom + S4 vanity system) — 6 days. Visible bathroom completeness.

**End-of-fortnight state.** Study reads as a real study; living has a media wall; bathroom has a proper vanity. Three of the seven activity systems lit up. Strong perceptual leap with one contributor in 2 weeks. The remaining S2/S5/S6/S7 ship over the following weeks.

---

## §8 — Pointers

- `APARTMENT-LAYOUT-STATUS-2026-05-29.md` — pipeline history + tactical tiers + 5-layer strategic framework.
- `APARTMENT-DRIVING-PRINCIPLES-AND-ROOM-ELEMENT-MATRIX-2026-05-29.md` — local-rule layer + matrix; Part E framing this doc as the Layer-1 furnishing programme.
- `APARTMENT-COGNITION-STACK-AND-IMPLEMENTATION-PLAN-2026-05-29.md` — engine layers + 6-stage optimisation + L1–L7 status-tracked engine plan.
- `packages/geometry-furniture/src/FurnitureTypes.ts` — the `FurnitureType` enum (F1 lives here).
- `packages/geometry-furniture/src/builders/*` — geometry + plan-symbol builders (F2 lives here).
- `packages/geometry-furniture/src/KitchenTypes.ts` — kitchen-specific (already includes appliances).
- `packages/ai-host/src/workflows/furnishLayout/archetypes.ts` — archetypes (F3 lives here).
- `packages/ai-host/src/workflows/furnishLayout/placeSolver.ts` — solver (F4 activity-system extensions live here).
- `packages/ai-host/src/workflows/furnishLayout/footprints.ts` — footprints (F2 lives here).
- `packages/ai-host/src/workflows/lightingLayout/archetypes.ts` — D-LE (F5 lives here).
- `packages/geometry-plumbing/src/PlumbingTypes.ts` — bathroom fixture variants (S4 reuses).
