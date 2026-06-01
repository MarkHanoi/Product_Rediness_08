# PRYZM03 — Geospatial Foundation Review (Platform Architecture)

Status: **Platform-level architecture review, 2026-05-30.** This document operates at PRYZM03 platform scale, not at apartment-generation scale. The earlier `PRYZM-GEOSPATIAL-FOUNDATION-AND-SITE-INTELLIGENCE-REVIEW.md` was scoped to one consumer (apartment generation); this doc is the parent and treats apartment generation as one case study among many.

This is **architectural understanding first**, not an implementation plan. The closing strategic recommendation proposes one of three options without assuming the outcome.

Sibling strategy docs (read these as orthogonal axes):

- [APARTMENT-BIM2-BIM3-DATA-MANAGEMENT-AND-LIVE-PARAMETRIC-SYSTEM.md](APARTMENT-BIM2-BIM3-DATA-MANAGEMENT-AND-LIVE-PARAMETRIC-SYSTEM.md) — WHAT-EDITABLE axis
- [APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md](APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md) — WHAT-KINDS-EXIST axis
- [PRYZM-GEOSPATIAL-FOUNDATION-AND-SITE-INTELLIGENCE-REVIEW.md](PRYZM-GEOSPATIAL-FOUNDATION-AND-SITE-INTELLIGENCE-REVIEW.md) — the apartment-consumer-scoped sibling of this doc (kept for the apartment-specific implications)

Governing contracts (binding):

- [C00 Contract Index](../00_Contracts/C00-INDEX.md)
- [C12 Geospatial](../00_Contracts/C12-GEOSPATIAL.md) — current CRS/LTP-ENU contract
- [C03 Schemas, Commands & State](../00_Contracts/C03-SCHEMAS-COMMANDS-AND-STATE.md)
- [C09 AI & Visibility Intent](../00_Contracts/C09-AI-AND-VISIBILITY-INTENT.md)
- [C11 Element Creation Pipeline](../00_Contracts/C11-ELEMENT-CREATION-PIPELINE.md)

---

## §0 — The reframed question

The question is **not** "should apartment generation become site-aware?" The question is:

> **What is the correct architectural role of geospatial intelligence within PRYZM03 itself?**

The answer affects every discipline PRYZM ever serves (residential, office, hospitality, retail, healthcare, industrial, urban planning, civil infrastructure, MEP, digital twins, BIM 2.0/3.0 simulation). Apartment generation is the first deeply-built consumer, but the architectural decision must be made for the platform, not for the consumer.

Three candidate options are evaluated in §13. The doc deliberately does NOT assume the answer in §1–§12.

---

## §1 — Architectural understanding

### What geospatial intelligence IS in a BIM platform context

Geospatial intelligence is the system's ability to know:

1. **WHERE** anything is in absolute (Earth-fixed) coordinates
2. **WHAT IS AROUND IT** in the real world (neighbours, terrain, infrastructure, jurisdiction)
3. **HOW THE ENVIRONMENT BEHAVES THERE** (sun path, climate, wind, water, light, sound, magnetic / true-north divergence)
4. **WHAT RULES APPLY** by virtue of being there (codes, zoning, FAR caps, height limits, conservation areas, fire jurisdictions)
5. **HOW IT CHANGES OVER TIME** (seasons, climate, future projections, urban evolution)

A BIM platform without (1) is a geometric editor.
A BIM platform with (1) but without (2)–(5) is georeferenced geometry — what most BIM platforms today are.
A BIM platform with (1)–(5) is **operationally intelligent infrastructure** — what the industry calls Digital Twin platforms.

### Where PRYZM03 sits today

- **(1) WHERE** — ✅ via `ProjectLocation` (lat/lon/trueNorth/basePoint) + LTP-ENU rebasing + IfcProjectedCRS round-trip
- **(2) WHAT IS AROUND IT** — ❌ Cesium can render context tiles but PRYZM doesn't ingest them as authoritative data
- **(3) HOW THE ENVIRONMENT BEHAVES** — 🟨 partial: NOAA solar path computed live, BRE daylight depth in apartment engine. No climate. No wind. No noise. No urban canyon.
- **(4) WHAT RULES APPLY** — ❌ no jurisdiction model, no code-database link
- **(5) HOW IT CHANGES OVER TIME** — ❌ static snapshot only

PRYZM is between "georeferenced geometry" (1+partial-3) and "operationally intelligent infrastructure" (1-5). The strategic question is whether the gap closes by **incremental opt-in** (each tool adds geospatial awareness as needed) or **foundational reframing** (the project IS a site; the building is what we put on it).

---

## §2 — Platform-level implications

The platform implications of each option compound across every PRYZM discipline. Below: what each domain needs **at platform scale**.

### Spatial Domain

| Concept | Today | Platform need |
|---|---|---|
| Project | First-class | Stays first-class |
| Site (parcel + bounds + jurisdiction) | ❌ | First-class element OR project-attribute |
| Context (neighbours / streets / water / green) | ❌ | First-class as Site-children OR external read-only data tier |
| Building (single tower / volume) | ❌ implicit | First-class — needed by ALL multi-building disciplines (campus / hospital / hotel resort / urban) |
| Floor / Level | ✅ | Stays |
| Apartment / Unit / Suite / Tenant Area | ❌ implicit | First-class — needed by ALL residential / commercial / hospitality |
| Room / Space | ✅ | Stays |
| Zone (HVAC / fire / security / activity) | ❌ partial | First-class — orthogonal to room hierarchy |
| Element | ✅ | Stays |

Today the spine is `Project → Level → Room/Element`. Every additional discipline forces an implicit aggregate (apartment for residential, suite for hospitality, ward for healthcare) that lives in metadata rather than the schema.

### Design Domain

| Capability | Today | Geospatial requirement |
|---|---|---|
| Layout generation | apartment-only | Generic needs site/context for any discipline |
| Adjacency / circulation | apartment | All disciplines need same primitives + room-program semantics; context only ADDS biases |
| Furnishing | apartment + plumbing | Independent of site (mostly) |
| Facade generation | shell-driven | Needs orientation + climate + neighbours to be production-grade |
| Opening generation | room-program | Same — production-grade needs climate / view / privacy / acoustic |
| Vertical circulation | manual today | Multi-storey needs grade + access from site |
| Massing | not yet implemented | **Cannot exist without site** — massing is the design of a building VOLUME within a parcel envelope |

Most design generators can be authored without site, but reach a quality ceiling. Massing genuinely **cannot exist** without site.

### Environmental Domain

Currently FacadeValueField + DaylightDepthField + NOAA RealSunService cover ~10 % of the environmental surface. The remaining 90 % requires data sources PRYZM doesn't ingest today:

- Solar: ✅ closed-form NOAA; ❌ no diffuse-irradiance tables; ❌ no shadow analysis under neighbours
- Climate: ❌ no temperature / humidity / precipitation / wind / EPW
- Acoustic: ❌ no road / rail / industrial noise contours
- Air quality: ❌ no pollution data
- Hydrology: ❌ no flood / drainage / water-table data
- Geology: ❌ no soil / bearing capacity
- Seismic / wind hazard: ❌ no hazard maps

Each is a different upstream data source with different licensing / format / API contracts. A **platform decision** about how environmental data flows into PRYZM is more fundamental than any individual consumer's needs.

### BIM Domain

The BIM impact is uneven:

| BIM artefact | Geospatial dependency |
|---|---|
| Schedules / quantities | Mostly geometry — geospatial-independent |
| Specifications | Mostly material/component — geospatial-independent for selection, geospatial-DEPENDENT for code compliance (which spec is allowed where) |
| Classifications (Uniclass / OmniClass) | Independent |
| IFC export geometry | Independent |
| IFC export `IfcSite` / `IfcMapConversion` | DEPENDENT (cannot populate without site) |
| Operational data / digital twin | FULLY DEPENDENT (a twin without coordinates isn't a twin) |
| Energy / daylight / thermal sim | FULLY DEPENDENT |
| Carbon analysis | FULLY DEPENDENT (grid emissions factors are regional) |
| Cost roll-ups | DEPENDENT (regional cost databases) |

The closer PRYZM moves to BIM 3.0 (live data + simulation + twin), the more BIM artefacts shift from "independent" to "dependent."

### AI Domain

AI workflows today (apartment-layout, furnish-layout, ceiling, lighting) consume program + shell + constraints. They are GEOSPATIAL-NEUTRAL by design.

A geospatially-aware AI tier would:

- Read site context as an additional input (climate / neighbours / orientation / hazards)
- Adjust outputs accordingly (window types, fixture catalogues, layout biases)
- Compose generation + simulation (place + score + iterate based on real environmental outputs)

This is not a NEW workflow per discipline — it's an INPUT extension to every existing workflow. The cost is mostly contract-level (every AI workflow's input schema gains an optional `siteRef`).

### Data Domain

Geospatial data raises platform concerns that don't exist for geometric data:

- **Privacy.** A project's real coordinates are PII (residential), commercially sensitive (commercial), or strategically sensitive (government / defence). Storage + replication + share-link permissions need geospatial-aware gating.
- **Licensing.** Climate, parcel, terrain, satellite imagery come with licenses that constrain WHO can see WHAT WHEN. The platform needs a license-aware data tier.
- **Versioning.** Tile data updates (Cesium ion versions, OSM revisions). A project saved against tile v1 must still load when v2 is current — either freeze the snapshot or re-resolve.
- **Caching.** Tile fetches are slow + metered. A cache layer + offline mode are platform concerns, not consumer concerns.
- **Auditability.** "What climate file did you use to make this carbon claim?" — every site-derived number needs a provenance trail.

These are not problems any single consumer can solve. They are **platform infrastructure**.

### Visualization Domain

Cesium today is one rendering backend among potentially many (the editor primarily uses Three.js via `@pryzm/renderer-three`; Cesium runs alongside via `CesiumThreeBridge`). The platform question:

| Role | Owner today | Should it stay? |
|---|---|---|
| BIM scene rendering | Three.js (renderer-three) | Yes — well-suited |
| Globe / map / terrain rendering | Cesium | Yes — well-suited |
| Site data authority | nobody (no Site model) | Open question — could be Cesium tiles, could be PRYZM stores |
| Context data authority (neighbours) | nobody | Open question |
| Tile streaming / caching | Cesium ion | Yes — purpose-built |
| Sun / shadow simulation | RealSunService (PRYZM-internal) | Yes — closed-form NOAA |

Cesium as **VISUALIZATION infrastructure** is settled. Cesium as **DATA infrastructure** is the open question. See §10 for the analysis.

---

## §3 — Contract implications

The current contracts treat geospatial as a narrow concern of C12 (CRS / LTP-ENU rebasing). Platform-level geospatial intelligence requires:

| Contract | Status | Change |
|---|---|---|
| **C12 Geospatial** | exists, narrow | EXTEND: distinguish CRS substrate (today's scope) from Site-data substrate (new) |
| **C03 Schemas, Commands, State** | binding | NO CHANGE in principle (P5/P6 still apply); ADD Site / Context / Building / Apartment schemas under existing rules |
| **C09 AI & Visibility Intent** | binding | EXTEND: Phase A workflow inputs gain optional `siteRef`; Phase B outputs can reference site context |
| **C11 Element Creation Pipeline** | binding | NO CHANGE (pipeline is element-type-agnostic; new element kinds just register) |
| **C18 Site (NEW)** | propose | Site lifecycle, parcel boundary, jurisdiction binding |
| **C19 Environment & Climate (NEW)** | propose | Climate / weather / hazard data ingestion, licensing, caching, provenance |
| **C20 Building / Apartment / Aggregate (NEW)** | propose | First-class aggregates above Level / below Project |
| **C21 Jurisdiction & Codes (NEW)** | propose | Code-database binding by location |
| **C22 Privacy & Sensitive Data (NEW)** | propose | Geospatial PII handling; share-link permissions; encryption-at-rest tier |
| **C23 External Data Provenance (NEW)** | propose | Every site-derived datum carries source + version + license |

Five new contracts. Each is **smaller in scope** than C03 / C09 / C11, but their **interactions** define the platform's geospatial maturity.

---

## §4 — Data-model implications

The current data model (per [C03](../00_Contracts/C03-SCHEMAS-COMMANDS-AND-STATE.md)):

```
Project (lat/lon/trueNorth as flat fields)
  ↓
Level (elevation, name, ftf height)
  ↓
Room / Wall / Slab / Furniture / …
```

The candidate target (per §1 + §2):

```
Project (governance, ownership, permissions, sharing)
  ↓
Site (parcel + jurisdiction + climate-ref + context-refs)
  ├── Context (neighbours, streets, water, green, terrain) — multi-source
  ↓
Building (single volume + envelope + massing)
  ↓
Floor / Level (existing)
  ↓
Apartment / Unit / Tenant Area (NEW first-class aggregate)
  ├── (or: Suite / Ward / Wing / Department — discipline-specific aliases)
  ↓
Room / Space (existing)
  ↓
Zone (HVAC / fire / security / activity / acoustic) (NEW, ORTHOGONAL)
  ↓
Element (wall / opening / furniture / MEP / structural / custom family)
```

Two key shifts:

1. **Vertical aggregates** (Site, Building, Apartment) become explicit rather than implicit. Today's apartment-as-room-set is a fragile convention; making it a schema element supports multi-tenant, multi-building, and discipline-specific aliases.
2. **Orthogonal zones** (HVAC / fire / security / activity / acoustic) are cross-cutting concerns that don't fit the spatial spine. They're set-of-rooms-with-policy. Making them first-class accommodates Multi-discipline workflows without forcing them into the spatial tree.

**Backward compat.** Auto-promotion at load time produces a default Site/Building/Apartment for legacy projects (single Site at ProjectLocation, single Building, one Apartment per Level). Existing snapshots load unchanged.

---

## §5 — AI implications

Today's AI workflows ([C09 §3.4](../00_Contracts/C09-AI-AND-VISIBILITY-INTENT.md)) are geospatial-neutral. The implications of geospatial maturity are uneven across workflows:

| AI surface | Geospatial impact |
|---|---|
| Apartment layout generation | LOW today; HIGH with climate (window types, room placement biases) |
| Multi-apartment floor-plate | MEDIUM (orientation, shared facade allocation) |
| Furnishing | LOW (furniture is climate-mostly-independent) |
| Lighting | MEDIUM (sun-path-aware scenes, latitude-aware fixtures) |
| Future massing | CRITICAL — massing IS a site-bound problem |
| Future facade design | CRITICAL — envelope IS a climate + orientation problem |
| Future MEP sizing | HIGH (heating/cooling loads need climate) |
| Future structural | HIGH (wind / seismic / snow loads need site hazard data) |
| Future cost / programme | HIGH (regional cost & schedule databases) |
| Future code compliance | CRITICAL — codes are jurisdiction-bound |

**Architectural principle.** AI workflows should not each separately ingest geospatial data. The platform should provide a **Site-Context Service** that every workflow queries by `siteRef`. The service handles licensing / caching / provenance once; consumers see a clean API.

This is the same pattern Family Platform proposes for element families (FamilyRegistry) and BIM 2/3 proposes for live editing (Data Graph): centralised substrate, polymorphic consumers.

---

## §6 — BIM implications

BIM-2.0 / BIM-3.0 trajectory:

- BIM 1.0: geometry as truth → no geospatial dependency
- BIM 2.0: semantic data as truth → geospatial OPTIONAL but useful (georeferenced quantities, regional specs)
- BIM 3.0: live building graph as truth + simulation + twin → geospatial **PREREQUISITE**

The reason: simulation + twin require **real-world context**. An energy simulation without a real climate file is fictional. A daylight simulation without real overshadowing is fictional. A digital twin without real coordinates is just a model.

PRYZM is mid-transition to BIM 2.0; the BIM 1/2/3 strategic axis ([sibling doc](APARTMENT-BIM2-BIM3-DATA-MANAGEMENT-AND-LIVE-PARAMETRIC-SYSTEM.md)) is the framework. Geospatial intelligence is a **prerequisite** for the BIM-3.0 milestone, not a feature of it.

**Architectural read.** Either PRYZM treats geospatial as foundational (Option C in §13) and arrives at BIM 3.0 coherently, or it treats it as opt-in (Options A / B) and arrives with a fragmented twin layer that's hard to retrofit.

---

## §7 — Cesium implications

Cesium is currently three things in one project:

1. **A rendering library** (Three.js bridge for BIM scenes overlaid on a globe)
2. **A tile-streaming SDK** (terrain + imagery + 3D Tiles)
3. **A potential data source** (Cesium ion serves real-world geometry / imagery)

The platform decision is whether (3) becomes authoritative:

| Cesium role | Argument for | Argument against |
|---|---|---|
| **Visualization only** (status quo) | Simple, contained scope; PRYZM remains rendering-agnostic | Cesium tile data is INVISIBLE to PRYZM — schedules, simulations, exports can't reference it |
| **Visualization + ingestion adapter** | PRYZM authority on its own data; Cesium provides read-only context that's snapshotted at site-design time | Snapshots can age; resync is a workflow not a default |
| **Authoritative geospatial backbone** | Single source of truth for site context; live updates from Cesium propagate | Couples PRYZM to Cesium; pricing / availability risk; harder to add MapLibre / self-host fallback later |

**The right answer depends on the strategic option chosen in §13.** All three roles are technically viable; the choice is platform-level.

### Specific Cesium evaluation

What Cesium provides today that would matter at platform scale:

- ✅ World-scale terrain tiles (sub-metre resolution in many regions)
- ✅ World-scale imagery
- ✅ 3D Tiles for neighbouring buildings (variable coverage)
- ✅ Globe / camera / projection / coordinate handling
- ✅ Atmosphere / sun / shadow rendering
- ✅ Time-aware (animatable sun, satellite orbits)
- ❌ Climate data (no temperature / precipitation tiles in ion)
- ❌ Code / jurisdiction data
- ❌ Soil / hazard data

For (climate / code / hazard), additional data sources are needed regardless of Cesium's role.

---

## §8 — Migration implications

Regardless of which option is chosen, migration of existing projects must be **silent and deterministic**:

1. **Load-time auto-promotion.** Projects without a Site auto-receive a default Site (boundary = convex hull of geometry; location = today's ProjectLocation or origin; climate = empty).
2. **Site-less mode preserved indefinitely.** Workflows that don't request site context receive `undefined` and use today's defaults.
3. **No snapshot rewrite at load time.** Auto-promotion is in-memory; the snapshot is rewritten only on save.
4. **Permission to opt out.** Some users / projects will never want site data (concept design, fictional projects, educational). The Site element is OPTIONAL.

The risk profile differs by option:

- **Option A (optional):** zero migration risk; geospatial features are gated to specific tools
- **Option B (first-class subsystem):** low-medium migration risk; new aggregates need careful default promotion
- **Option C (foundational layer):** medium-high migration risk; the data spine changes; every consumer adjusts

---

## §9 — Roadmap implications

The roadmap impact is **proportional to chosen option**:

| Option | Roadmap delta |
|---|---|
| **A — Optional** | Apartment generation adds optional site-aware overloads. Other disciplines opt in. No platform-wide phase. |
| **B — First-class subsystem** | New PG0 (Platform Geospatial 0) phase parallel to existing strategic axes. ~20-25 dev-weeks. Adds Site / Context schemas + climate ingestion + Cesium ingestion adapter. Most existing workflows untouched. |
| **C — Foundational layer** | Major refactor. Project spine changes; many contracts revised; ~50-80 dev-weeks. All future work converges into the site-aware spine. |

The earlier `PRYZM-GEOSPATIAL-FOUNDATION-AND-SITE-INTELLIGENCE-REVIEW.md` document and its proposed `GS0` 19-week phase implicitly assumed **Option B** scoped to the apartment consumer. At platform scale, **Option B reads as PG0** with a broader scope (~22-27 weeks) covering Site/Context/Building/Apartment aggregates AND the data infrastructure (privacy, licensing, provenance) AND the Site-Context Service.

---

## §10 — The three strategic options (neutral analysis)

### Option A — Geospatial as opt-in tool feature

Each tool / workflow that wants geospatial awareness adds it itself. No platform-level substrate. The apartment generator gets a `siteAware` overload; the lighting engine gets a `solarPath` overload; etc.

**Pros.**

- Minimal platform churn
- Tools that don't need site data don't pay any cost
- Backward compat is trivial
- Fast to land per-consumer

**Cons.**

- Each tool re-implements coordinate handling, licensing, caching, provenance
- Site data is invisible across tools (schedules can't query "what climate did this layout assume?")
- Digital-twin / simulation tier is forever fragmented
- BIM-3.0 milestone is unreachable
- Cost of retrofit to Option B or C grows over time

**Verdict.** Acceptable as a tactical bridge; unacceptable as a long-term architecture. Mostly chosen by accident (by not deciding).

### Option B — Geospatial as a first-class subsystem

PRYZM has a Site-Context Service + Site / Building / Apartment aggregates as first-class elements. Workflows opt IN to consuming the service. Projects without a Site keep working in legacy mode.

**Pros.**

- Single source of truth for site data (one cache, one license layer, one provenance tier)
- All disciplines benefit incrementally — no big-bang migration
- Reuses today's substrate (CRS, LTP-ENU, Cesium viewer, NOAA solar)
- BIM-3.0 milestone reachable
- Project hierarchy gains explicit Building/Apartment aggregates that current disciplines need

**Cons.**

- Adds a substantial substrate (~20-27 dev-weeks for PG0)
- Requires 5 new contracts (C18-C22) + extensions to C12/C09
- Privacy + licensing infrastructure are platform commitments
- Some legacy code paths (e.g. assuming Project → Level directly) need adapter layers

**Verdict.** The pragmatic centre. Adds the substrate; doesn't force every consumer to adopt; preserves legacy.

### Option C — Geospatial as foundational layer

Every PRYZM project IS a georeferenced site model. There is no "site-less" mode. Project / Site / Building / Floor / Apartment / Room is the immutable spine. Concept-design / educational / fictional projects still get a Site (placeholder coordinates / abstract boundary), but they go through the same flow.

**Pros.**

- Conceptual clarity: PRYZM is unambiguously a digital-twin-grade platform
- Marketing / positioning: "every PRYZM project is BIM 3.0 ready"
- Most coherent path to operational data, environmental simulation, urban-scale workflows
- Forces every discipline to participate in the substrate (no fragmentation)

**Cons.**

- Major refactor of the data spine
- Breaks existing site-less workflows (the apartment generator today doesn't have a parcel; what does it generate against?)
- Concept-design users hit friction (they don't have a location yet)
- Migration is non-trivial
- High commitment cost

**Verdict.** The vision-pure choice. Right if PRYZM's destiny is unambiguously digital-twin / urban / operational. Premature if PRYZM also serves concept / education / pedagogical workflows.

---

## §11 — Risks (cross-option)

Regardless of which option is chosen, certain platform-level risks remain:

| Risk | Mitigation |
|---|---|
| **Scope creep** — geospatial touches everything | Strict contract gates per consumer adoption |
| **Climate data licensing** | License-aware data tier (C23); fall back to closed-form NOAA where licensed data isn't available |
| **Cesium ion pricing** | Multi-source pluggable tile layer; MapLibre / self-hosted fallback |
| **CRS edge cases** | Proj4 is well-tested; LTP-ENU is the safety net |
| **Locale neutrality** | First-class N/S hemisphere + latitude-aware defaults |
| **Privacy (PII)** | C22 dedicated contract; per-project encryption tier; share-link gating |
| **External data versioning** | Snapshot data sources at use; re-resolve on demand |
| **Backward compat** | Load-time auto-promotion; site-less mode preserved (Options A & B); Option C requires migration path |
| **Vendor lock-in (Cesium)** | Abstract the ingestion adapter; second backend provable before declaring stable |
| **Discipline neutrality** | Site / Building / Apartment must work for residential, commercial, hospitality, healthcare, industrial without bias |

---

## §12 — Strategic recommendation

This doc recommends **Option B** as the architecturally correct choice for PRYZM03's current trajectory.

**Reasoning:**

1. **Today's substrate is already at Option B's starting line.** Cesium viewer + LTP-ENU + ProjectLocation + NOAA solar already exist. Option B builds on existing pieces rather than reframing them.
2. **Option A is a tactical retreat.** It works short-term but accumulates fragmentation debt the platform has to pay later. The cost grows.
3. **Option C is premature.** PRYZM today serves concept-design / apartment-fiction users who don't have a location. Forcing them to provide one is friction without value. Once the platform demonstrably serves real-project workflows at scale, the case for Option C strengthens.
4. **Option B is reversible.** If experience shows Option C is needed, the substrate built under B is the substrate that C consumes. The work isn't wasted.

**Option B in concrete terms:**

- Phase **PG0** (Platform Geospatial 0) parallel to BIM 2/3 + P0 + the existing F-tier / cognition tiers
- 9 deliverables across ~22-27 dev-weeks (a refinement of the apartment-scoped GS0)
- New contracts C18 (Site) + C19 (Environment) + C20 (Aggregates) + C22 (Privacy) + C23 (Provenance)
- C12 extended to distinguish CRS substrate from Site-data substrate
- Apartment-specific consumer details continue to live in the earlier `PRYZM-GEOSPATIAL-FOUNDATION-AND-SITE-INTELLIGENCE-REVIEW.md` doc

**Caveat.** This recommendation is from a platform-architecture lens. Product strategy may justify Option C (commitment to digital-twin positioning) or Option A (tactical apartment-only focus for one release cycle). The choice is leadership's; this doc's job is to make the trade-offs explicit.

---

## §13 — Proposed PG0 phase (if Option B is chosen)

Refinement of the apartment-scoped GS0 (in the apartment plan §4.−1) — broader scope, platform-level positioning, more contracts.

| ID | Deliverable | Est |
|---|---|---|
| **PG0.1** | Site / Context / Building / Apartment schemas (L0 schemas, P5 pure) + legacy-promotion loader | 3 wk |
| **PG0.2** | `SiteModel` + `BuildingModel` + `ApartmentModel` runtime stores + `site.*` / `building.*` / `apartment.*` commands (C16-compliant) | 2 wk |
| **PG0.3** | Site-Context Service — single platform-level read API for every workflow; handles licensing / caching / provenance | 2 wk |
| **PG0.4** | Cesium ingestion adapter — terrain + neighbour 3D Tiles → PRYZM Context (snapshot at site-design time; resync on demand) | 3 wk |
| **PG0.5** | Climate ingestion — EPW reader + NOAA / IWEC / WeatherKit API + cache layer | 2 wk |
| **PG0.6** | Privacy + PII tier — encryption-at-rest for site coordinates; share-link permissions; audit trail | 2 wk |
| **PG0.7** | Site authoring UI — Cesium-backed parcel drawing + location picker + neighbour curation; integrates with PG0.6 permission tier | 4 wk |
| **PG0.8** | Site-aware AI workflow extension — `siteRef` flows into every existing AI workflow input schema (apartment, furnish, lighting, ceiling) | 2 wk |
| **PG0.9** | Site-aware environmental fields — FacadeValueField / DaylightDepthField / future fields consume Site-Context Service | 2 wk |
| **PG0.10** | Full IfcSite + IfcMapConversion round-trip with Site model populated; IFC4X3 site-attribute coverage | 1 wk |
| **PG0.11** | C12 contract revision + new C18 / C19 / C20 / C22 / C23 contracts authored | 2 wk |
| **PG0.12** | Discipline-neutrality audit — verify Site / Building / Apartment schema doesn't bias residential vs commercial vs healthcare; revise if so | 1 wk |

**PG0 total: ~26 dev-weeks (≈ 6 months single-contributor; 3 months at two parallel).**

Compared to the apartment-scoped GS0 (19 wk): platform-level adds PG0.3 (Service), PG0.6 (Privacy), PG0.8 (AI extension across ALL workflows not just apartment), PG0.12 (discipline neutrality), and broader contract scope.

---

## §14 — How this doc relates to the apartment-scoped sibling

| Doc | Scope | Authority |
|---|---|---|
| **THIS doc** (`PRYZM03-GEOSPATIAL-FOUNDATION-REVIEW.md`) | Platform — affects every PRYZM discipline | Platform architecture |
| Apartment-scoped sibling (`PRYZM-GEOSPATIAL-FOUNDATION-AND-SITE-INTELLIGENCE-REVIEW.md`) | Apartment-generation consumer of the platform substrate | Consumer implementation details |

The apartment-scoped doc remains useful — it documents the apartment-specific implications (climate-aware window types, sun-path-aware lighting scenes, facade allocator). Those are CONSUMER details of the platform substrate this doc describes.

**Apartment plan integration:** the GS0 row in the apartment plan stays, but its scope is narrowed to "apartment-consumer of PG0." PG0 itself moves to a platform-level roadmap (TBD location — likely a new `docs/03_PRYZM3/PLATFORM-ROADMAP.md` or a section of the existing PRYZM3-MASTER-STATUS.md).

---

## §15 — Open questions for leadership

This is an architectural review; the recommendation in §12 is Option B. Leadership owns the final choice. Questions to settle:

1. **Strategic positioning.** Is PRYZM positioned as a BIM-1.5 / BIM-2.0 design tool, or as a BIM-3.0 / digital-twin platform? The answer biases A → B → C.
2. **Discipline scope.** Are residential + apartment generation the primary commercial focus for the next 12 months, or is the platform expanding to commercial / healthcare / urban in that window? Discipline neutrality (PG0.12) becomes load-bearing if so.
3. **Cesium commitment.** Is PRYZM committing to Cesium as a long-term partner, or hedging with an abstraction layer for MapLibre / self-hosted alternatives?
4. **Privacy posture.** Are PRYZM projects acceptable to store in cloud with default coordinates, or does the platform need a zero-trust / encrypted-at-rest tier from day one?
5. **Code-compliance scope.** Does PRYZM aim to ingest jurisdiction-specific Building Regs / code databases (UK Approved Documents, IBC, NCC) as part of geospatial maturity, or is that out of scope?
6. **Budget commitment.** A 26-week platform substrate is a serious investment. Other strategic phases (P0 ~28 wk, BIM 2/3 ~17 wk) compete for the same resources.

---

## §16 — Memory + roadmap integration

After this doc lands:

1. Memory note `geospatial-foundation-strategic-direction.md` — UPDATED to reflect platform-level scope; existing apartment-scoped note kept as historical context
2. New phase PG0 in a forthcoming platform-roadmap doc (currently TBD)
3. The apartment plan's GS0 row is repositioned as "apartment-consumer of PG0"
4. C12 revision + C18 / C19 / C20 / C22 / C23 contracts queued under PG0.11
5. Each future strategic doc declares its position on the geospatial axis (Option A / B / C consumer model)

---

## §17 — What this doc is NOT saying

- **Not pre-empting the strategic decision.** §12 recommends Option B; the choice is leadership's.
- **Not blocking apartment work.** F-tier continues each session. Apartment-consumer of PG0 (today's GS0) can proceed under any of the three options.
- **Not committing to Cesium.** The platform decision is whether Cesium plays the data role or the visualization role; the implementation can still be replaced.
- **Not redefining BIM 2.0 / 3.0.** Those terms are anchored in the sibling doc; this doc maps geospatial PREREQUISITES for them.
- **Not opening a new strategic axis on top of the three already documented.** Geospatial is the *substrate* on which the three axes (BIM 2/3 / Family Platform / Cognition Stack) eventually sit at scale.

---

*End — PRYZM03-GEOSPATIAL-FOUNDATION-REVIEW (platform architecture, 2026-05-30).*
