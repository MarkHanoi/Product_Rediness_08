# PRYZM — Site & Cognition Strategy

> **Stamp**: 2026-06-01 · **Status**: CANONICAL
> **Authority**: this doc owns **the two strategic substrates that distinguish PRYZM from a generic AI-BIM tool**: (1) **the site / geospatial substrate** — every building is anchored to a real place with real climate, real terrain, real regulatory context; and (2) **the cognition substrate** — the platform reasons about a building across seven layers (environmental, spatial, semantic, compositional, perceptual, behavioural, typological), not just geometry. Both substrates exist in code today (the geospatial primitives in `packages/geospatial/`, the apartment-layout cognition stack in `ai-host/workflows/`, the constraint database in `rules/`) but their strategic role has not been codified.
> **Foundation above**: [manifesto.md](./manifesto.md) → [positioning.md](./positioning.md)
> **Cross-cut**: [platform-strategy.md](./platform-strategy.md) (the surface third parties extend over these substrates) · [product-vision.md](./product-vision.md) (the user journey these substrates enable)

---

## §1 — The substrate thesis in one paragraph

Most BIM tools treat a building as **abstract geometry in empty space**. The model is "a wall here, a slab there." The site is a backdrop. The climate is somebody else's problem. The cognitive layer (does this layout make sense?) lives in the architect's head, never in the file. PRYZM rejects this. **A building is information about a place.** The site is constitutive — orientation, sun, wind, terrain, planning context, neighbouring buildings, regulatory regime — and the platform carries that information as a first-class substrate. **A building is also information about itself** — adjacencies, circulation, programmatic intent, daylight performance, thermal behaviour, perceptual quality — and the platform reasons about it across seven cognitive layers, not one geometric one. The two substrates compound: site-aware spatial reasoning is materially more powerful than spatial reasoning alone.

---

## §2 — Substrate 1: site / geospatial

### §2.1 — What lives at the site substrate

Every PRYZM project begins with a **Site**:

| Element | Owns |
|---|---|
| **Plot boundary** | The legal extent of the site, from cadastral / GIS data |
| **Coordinates** | Latitude + longitude (WGS84) + a project-local Cartesian frame (LTP-ENU per [C12 §3](../02-decisions/contracts/C12-GEOSPATIAL.md) — Local Tangent Plane East-North-Up) |
| **CRS** | An `IfcProjectedCRS` record so IFC4X3 export carries the projection — survey-grade georeferencing |
| **Terrain** | Elevation grid; topography; level changes; contour lines |
| **Orientation** | True north + project north (the architect's working axis usually differs) |
| **Climate** | EPW file (priority) or NOAA normals (fallback) per [C21 Climate Ingestion](../02-decisions/contracts/C21-CLIMATE-INGESTION.md) — temperature, humidity, wind, solar, precipitation |
| **Sun paths** | Computed from latitude + longitude — every season + every hour |
| **Context buildings** | Neighbouring buildings as fetched from OpenStreetMap or per-region equivalents — drive shadow analysis + privacy / overlooking analysis |
| **Regulatory context** | Planning code + setback rules + height envelopes + use-class per [C19 Site Model & Parcel](../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md) |

The Site is a domain element with its own schema, store, and persistence — codified by [C19](../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md). It is not a backdrop. Mutations to the Site propagate to building geometry that depends on it (e.g. moving the plot boundary triggers re-evaluation of setback compliance).

### §2.2 — What exists in code today (verified 2026-06-01)

| Capability | Status | Location |
|---|---|---|
| LTP-ENU rebasing (1 km recenter trigger) | ✅ Shipped | `packages/geospatial/src/LTPENURebase.ts` |
| Proj4js integration (WGS84 ↔ project CRS) | ✅ Shipped | `packages/geospatial/src/GeospatialAdapter.ts` |
| `IfcProjectedCRS` record + IFC4X3 export | ✅ Shipped | `packages/geospatial/src/IfcProjectedCRSRecord.ts` |
| Cesium viewer for site visualisation | ✅ Shipped | `plugins/geospatial/src/CesiumThreeBridge.ts` |
| LTPENUCameraService (camera + perspective tied to site) | ✅ Shipped | `packages/renderer-three/src/LTPENUCameraService.ts` |
| Logarithmic depth buffer for large-scale rendering | ✅ Shipped | `packages/renderer-three/` |
| Site element (first-class [C19](../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md) schema) | ⬜ DRAFT contract; implementation in flight | `packages/schemas/src/site/` (per C19 §2) |
| Climate ingestion (EPW + NOAA per [C21](../02-decisions/contracts/C21-CLIMATE-INGESTION.md)) | ⬜ DRAFT contract; implementation in flight | `packages/climate/` (per C21 §3) |
| Building / Apartment aggregates (per [C20](../02-decisions/contracts/C20-BUILDING-AND-APARTMENT-AGGREGATES.md)) | ⬜ DRAFT contract; implementation in flight | `packages/schemas/src/aggregates/` (per C20 §2) |

The **infrastructure substrate exists** (the plumbing — CRS, coordinate transforms, Cesium); the **design substrate is being authored** (Site as first-class element, climate ingestion, aggregates). The contracts ([C19](../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md), [C20](../02-decisions/contracts/C20-BUILDING-AND-APARTMENT-AGGREGATES.md), [C21](../02-decisions/contracts/C21-CLIMATE-INGESTION.md)) precede the code.

### §2.3 — Why site-as-substrate matters competitively

A BIM tool without the site substrate cannot:

- Validate setback compliance at design-time (it can validate it as a post-process check — but by then the layout is fixed)
- Drive solar-orientation suggestions during apartment layout (the AI suggests "place the master bedroom on the south side" — but only if it knows where south is)
- Suggest natural-ventilation strategies based on prevailing wind (we can if the climate substrate is loaded)
- Pre-warn about overlooking from neighbours (we can if the context-buildings substrate is loaded)
- Pre-warn about flood zones / wildfire zones / seismic zones (we can if the regulatory + climate substrates carry them)

These are not "Phase 3 future features." They are **how an AI-native BIM tool earns the right to call itself design intelligence**. A BIM tool that does not know which way is south is not intelligent in any meaningful sense.

### §2.4 — Site-substrate roadmap (PG0)

The Site substrate work is organised as **Phase PG0** (per the [Geospatial Foundation strategic doc](../03-execution/plans/master-implementation-plan.md)). PG0 contains 12 deliverables:

| Deliverable | Owns |
|---|---|
| PG0.1 Site element + parcel + footprint + context-buildings schemas | [C19](../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md) |
| PG0.2 Building / Apartment aggregates | [C20](../02-decisions/contracts/C20-BUILDING-AND-APARTMENT-AGGREGATES.md) |
| PG0.3 Site-Context Service (orchestrator) | (cross-cuts C19/C20) |
| PG0.4 EPW + NOAA climate ingestion | [C21](../02-decisions/contracts/C21-CLIMATE-INGESTION.md) |
| PG0.5 Solar + sun-path computation against the site | extends C12 |
| PG0.6 Privacy / PII tier for site data (a customer's plot location IS PII) | [C22](../02-decisions/contracts/C22-PRIVACY-AND-PII-TIER.md) |
| PG0.7 Provenance for AI-generated site-related artefacts | [C23](../02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md) |
| PG0.8 Site-aware AI workflow extensions (apartment-layout consumes site context) | extends C09 |
| PG0.9 IFC export of Site + Climate metadata | extends C25 |
| PG0.10 Site authoring UI (the cream/light Cesium aesthetic per product-vision §5) | extends C06 |
| PG0.11 Regulatory-data ingestion (planning code, zoning, etc.) | extends C19 |
| PG0.12 Discipline-neutrality audit (PG0 works for residential, commercial, public, etc.) | C00 governance |

Total estimated effort: ~26 dev-weeks. Sequenced as PG0.1 → PG0.2 → PG0.3 → PG0.4 → PG0.5 first (the data plumbing); PG0.6 → PG0.7 (the compliance + provenance); PG0.8 → PG0.9 → PG0.10 (the user-facing surfaces); PG0.11 → PG0.12 (the polish + regulatory expansion).

### §2.5 — Why we ship the substrate work before fancier AI

The temptation in an AI-native product is to ship more AI workflows. The discipline is: **AI workflows compound on substrate; substrate doesn't compound on AI workflows**. Shipping a hospital-layout AI workflow before the Site substrate means the hospital workflow knows nothing about the actual hospital site. Shipping the Site substrate first means every AI workflow PRYZM ever ships is automatically site-aware.

This is the inversion of the typical AI-product roadmap. Most teams ship more model. We ship more substrate the model reasons over.

---

## §3 — Substrate 2: cognition

### §3.1 — The seven-layer cognition stack

Per the cognition-stack framework noted in MEMORY + the apartment-cognition-stack-and-implementation-plan-2026-05-29 doc:

```
                          ┌────────────────────────────────────┐
                          │  L7 Typology Priors                 │
                          │  Apartment / office / hospital      │
                          │  programmatic conventions           │
                          └────────────────┬──────────────────┘
                                           │
                          ┌────────────────▼──────────────────┐
                          │  L6 Behavioural Simulation         │
                          │  Pedestrian flow, occupancy patterns│
                          │  ("Will people walk through this?")│
                          └────────────────┬──────────────────┘
                                           │
                          ┌────────────────▼──────────────────┐
                          │  L5 Perceptual Simulation          │
                          │  Daylight, acoustics, sightlines   │
                          │  ("Does this room feel right?")    │
                          └────────────────┬──────────────────┘
                                           │
                          ┌────────────────▼──────────────────┐
                          │  L4 Compositional Geometry         │
                          │  Geometric assembly + parametrics  │
                          │  ("Walls, slabs, doors, windows")  │
                          └────────────────┬──────────────────┘
                                           │
                          ┌────────────────▼──────────────────┐
                          │  L3 Semantic Topology              │
                          │  Adjacencies, circulation graph    │
                          │  ("Bedroom-private adjacent to     │
                          │  bathroom; kitchen-public to       │
                          │  living-public")                   │
                          └────────────────┬──────────────────┘
                                           │
                          ┌────────────────▼──────────────────┐
                          │  L2 Spatial Hierarchy              │
                          │  Site → Building → Level →         │
                          │  Apartment → Room → Element        │
                          └────────────────┬──────────────────┘
                                           │
                          ┌────────────────▼──────────────────┐
                          │  L1 Environmental Intelligence     │
                          │  Sun, wind, climate, terrain,      │
                          │  regulatory context (the Site      │
                          │  substrate from §2)                │
                          └────────────────────────────────────┘
```

Each layer is a body of knowledge the platform carries. Each is queryable. Each constrains the layer above.

### §3.2 — Where each layer lives in code today

| Layer | Status | Location |
|---|---|---|
| **L1 Environmental Intelligence** | Substrate exists; first-class element pending (PG0) | `packages/geospatial/`, `plugins/geospatial/` |
| **L2 Spatial Hierarchy** | Mid-implementation per [C20](../02-decisions/contracts/C20-BUILDING-AND-APARTMENT-AGGREGATES.md) | `packages/stores/` + `packages/spatial-index/` + apartment-data-panel |
| **L3 Semantic Topology** | Shipped per the constraint DB | `rules/programRules.ts` (248-rule architectural program rules) + `packages/spatial-index/src/RoomGraphService.ts` |
| **L4 Compositional Geometry** | Shipped (the geometry kernel + element types) | `packages/geometry-kernel/` (12k LOC) + 13 `packages/geometry-*` |
| **L5 Perceptual Simulation** | Partial — daylight rule-checking shipped; acoustic / sightline pending | `ai-host/workflows/apartmentLayout/` + futures |
| **L6 Behavioural Simulation** | Pending | (planned per cognition-stack doc) |
| **L7 Typology Priors** | Mid-implementation — apartment typology priors live; office/hospital/retail pending | `ai-host/workflows/apartmentLayout/` + `rules/programRules.ts` |

The bottom layers are mature; the higher layers (L5–L7) are where the next-generation work happens.

### §3.3 — Why the cognition substrate matters competitively

A BIM tool with **only L4 (compositional geometry)** is what Revit + ArchiCAD ship. The model is bricks. The architect's brain is the only place where L1–L3, L5–L7 live. Every conversation between architect + consultant + client is the architect's brain trying to compress L1–L7 knowledge into L4 marks-on-paper.

A BIM tool with **L1–L7 all carried by the platform** is a new product. The conversation between architect + AI host is **at the appropriate layer**:

- Architect: "The master bedroom needs to face south." (L1 + L7 — environmental + typology)
- AI: routes to apartment-layout workflow, which queries the climate substrate (L1), the typology priors (L7), produces a layout, validates against semantic topology (L3), commits compositional geometry (L4)
- Architect: "The corridor feels narrow." (L5 — perceptual)
- AI: routes to perceptual-simulation workflow, which evaluates corridor width vs occupancy norms, suggests widening

The conversation works because both sides understand the same layered model. The platform's job is to maintain consistency across L1–L7; the architect's job is to make decisions at the layer that matters for their question.

### §3.4 — Cognition-substrate roadmap

**Year 1**: L1–L4 mature (PG0 ships L1; apartment workflow extends L3/L7; geometry kernel L4 is done). L5 daylight rule-checking ships. L7 apartment typology priors mature.

**Year 2**: L5 perceptual simulation expands (acoustic, sightlines, thermal-comfort). L7 typology priors expand to office + retail + hospital (each typology gets its own rules pack — possibly community-authored per [platform-strategy.md §3](./platform-strategy.md)).

**Year 3**: L6 behavioural simulation lands. Multi-modal AI (vision + text + spatial) used to read existing-buildings via [PDF-to-BIM workflow](../02-decisions/contracts/) — out of scope today, deferred to year 3.

**Year 4+**: Cognition substrate becomes a published API — third parties can query "what does PRYZM know about this site / building / room?" + train their own models on the structured output.

### §3.5 — How the cognition substrate is governed

Per [C03 Schemas, Commands & State](../02-decisions/contracts/C03-SCHEMAS-COMMANDS-AND-STATE.md), every layer's data is in L0 schemas (compile-time validated). Per [C09 AI & Visibility Intent](../02-decisions/contracts/C09-AI-AND-VISIBILITY-INTENT.md), every AI workflow that reads / writes a layer goes through the AI plane. Per [C23 Provenance & AI Audit](../02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md), every AI-generated artefact carries its provenance back to the cognition layer it reasoned over.

This means: the platform is **end-to-end auditable** across the cognition stack. A customer asking "why did the AI suggest the master bedroom face south?" can trace back through the workflow → the apartment-layout engine → the climate substrate query → the latitude / longitude / sun-path data → the EPW file → the date the climate ingestion ran. Every step is provenance-recorded.

This is the long-term enterprise + government + healthcare moat. Customers in regulated industries need this audit trail. We provide it as substrate, not as bolt-on.

---

## §4 — Why these substrates are NOT in the contract suite

A clarification: [C19](../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md) + [C20](../02-decisions/contracts/C20-BUILDING-AND-APARTMENT-AGGREGATES.md) + [C21](../02-decisions/contracts/C21-CLIMATE-INGESTION.md) + [C22](../02-decisions/contracts/C22-PRIVACY-AND-PII-TIER.md) + [C23](../02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md) — these are contracts that codify aspects of the site substrate. **The strategy substrate is the broader bet** — it spans contracts, code, AI workflows, and the long-run vision. The contracts are the binding rules; this doc is the strategy that drives why those contracts exist.

Similarly, the cognition substrate is not "a single contract." It is the unifying frame for [C09 AI](../02-decisions/contracts/C09-AI-AND-VISIBILITY-INTENT.md), the program rules database, the spatial-index, and many other code paths. The contracts each codify a fragment; this doc names the whole.

---

## §5 — The competitive consequence

Competitors entering "the design intelligence" category face two structural disadvantages:

### §5.1 — Site substrate is not a feature; it's an architecture

A competitor's BIM tool with a "site mode" tacked on is not a substrate. The architect has to switch context, transfer data, mind the gap between "site mode" and "design mode." PRYZM's site is constitutive: every element knows its place. Building this in retroactively requires a foundational refactor; we have it from year 1.

### §5.2 — Cognition stack is incompressible by competitors

The constraint database (248 rules), the program rules (per room type + adjacency matrix), the apartment-layout engine, the perceptual evaluators — these are years of curation work. A competitor cannot ship a comparable cognition layer in 6 months of effort, even with unlimited AI assistance. The substrate is the moat that AI alone cannot reproduce.

Both substrates compound: as we add more rules + more typologies + more climate data + more provenance, the substrate gets richer. A competitor catching up has to catch up the substrate; the surface API alone is not enough.

---

## §6 — The constraint database (the substrate's data core)

The architectural-rules constraint database is the **most asymmetric asset PRYZM owns**. State at 2026-06-01:

- **Spec total**: 248 constraints across 14 categories (Area Ratios, Room Sizes, Door Topology, Furniture, Daylighting, Acoustic, Structural, Services, Fire, Thermal, Space Syntax, Accessibility, IFC, Outdoor) — documented in `docs/03-execution/specs/SPEC-LAYOUT-CONSTRAINT-DATABASE.md`
- **Code-enforced subset**: ~40 % (area / dimensions / adjacency / programmatic furniture / IFC) live in `packages/ai-host/src/workflows/apartmentLayout/rules/programRules.ts` (627 LOC) — the remaining categories (daylight simulation, acoustic scoring, fire, thermal) are documented but not yet evaluated at runtime
- **Room types**: 14 (`living`, `kitchen`, `dining`, `bathroom`, `ensuite`, `wc`, `hall`, `corridor`, `master`, `bedroom`, `study`, `utility`, + 2 more)
- **Furniture specs**: 53+ FurnitureSpec objects across room types
- **Drives**: the apartment-layout engine (D-TGL when AI unavailable; AI-routed when LLM accessible), the room validation, door / wall / connectivity rules
- **Hand-curated by architects** over multiple years; cross-checked against published architectural literature

The platform's value is partly the editor + the AI + the marketplace; but the **constraint database is the cognitive heart**. Marketplace authors can extend it (region-specific rules; typology-specific rules per [platform-strategy §3.3](./platform-strategy.md)). PRYZM curates the open-source core.

The constraint database is published — competitors can read it. But to use it operationally requires the platform's substrate + the workflows + the editor. The published rules are themselves a marketing surface ("this is what we know about architecture"). Architects reading the rules database see a level of care that gives them credibility in the platform.

---

## §7 — Open questions

Like any DRAFT-stage strategic substrate, open questions:

1. **PG0 sequencing within the 18-week budget**. Site + climate + aggregates all want to ship together but are 18-26 weeks total. Prioritisation: §2.4 lists 1→2→3→4→5 first; tighten further to ship the minimum that unlocks site-aware AI workflows.
2. **L5 daylight engine: ship internally vs use a library**. Radiance (the OSS daylight standard) is mature; we may consume rather than re-implement. Decision pending ADR.
3. **L6 behavioural simulation depth**. Sketch-level pedestrian flow is feasible. Full evacuation simulation is its own product. We aim at the simpler end; SeenSim / Massmotion are the higher-end tools we round-trip to.
4. **L7 typology marketplace**. Are typology priors PRYZM-first-party (we curate the canonical ones) or marketplace-only (anyone can publish)? Decision: PRYZM ships canonical apartment + canonical office + canonical hospital; marketplace authors fill the long tail (museum, prison, school, retail, etc.).
5. **Cognition substrate API surface**. When does §3.4 year-4-ship-as-API happen? Customer demand-driven; not a year-1 priority.
6. **Per-typology constraint database authorship**. Currently PRYZM-curated. Should marketplace authors be able to publish their own typology-rules packs? Yes, per [platform-strategy.md](./platform-strategy.md); the curation surface gates this for regulated content.

---

## §8 — Cross-references

| Doc | Relationship |
|---|---|
| [manifesto.md](./manifesto.md) | The "design intelligence" claim depends on these substrates |
| [positioning.md](./positioning.md) | The moats §4.1 derive from these substrates |
| [product-vision.md](./product-vision.md) | The user journey runs across the substrate (esp Step 3 site definition) |
| [platform-strategy.md](./platform-strategy.md) | Marketplace authors extend these substrates with typology / regional content |
| [risks-and-assumptions.md](./risks-and-assumptions.md) | Site + cognition risks (e.g. climate-data licensing) |
| [../02-decisions/contracts/C09-AI-AND-VISIBILITY-INTENT.md](../02-decisions/contracts/C09-AI-AND-VISIBILITY-INTENT.md) | AI plane reasoning across the cognition stack |
| [../02-decisions/contracts/C12-GEOSPATIAL.md](../02-decisions/contracts/C12-GEOSPATIAL.md) | LTP-ENU + Proj4 + IfcProjectedCRS — the L1 plumbing |
| [../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md](../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md) | The Site element + parcel + context |
| [../02-decisions/contracts/C20-BUILDING-AND-APARTMENT-AGGREGATES.md](../02-decisions/contracts/C20-BUILDING-AND-APARTMENT-AGGREGATES.md) | The L2 hierarchy formalisation |
| [../02-decisions/contracts/C21-CLIMATE-INGESTION.md](../02-decisions/contracts/C21-CLIMATE-INGESTION.md) | EPW + NOAA + cache |
| [../02-decisions/contracts/C22-PRIVACY-AND-PII-TIER.md](../02-decisions/contracts/C22-PRIVACY-AND-PII-TIER.md) | Site data is PII; tier separation matters |
| [../02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md](../02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md) | Cognition-stack provenance audit |

---

*End — PRYZM Site & Cognition Strategy, 2026-06-01 — CANONICAL.*
