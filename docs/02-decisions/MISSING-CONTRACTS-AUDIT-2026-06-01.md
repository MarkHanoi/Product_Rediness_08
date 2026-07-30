# Missing Contracts — Enterprise BIM/AEC Gap Audit

> **Stamp**: 2026-06-01 · **Status**: AUTHORED 2026-07-16 — all 18 proposed gaps (C18–C49) now EXIST AS CONTRACT FILES (the full C01–C56 suite is present). See the [C00 contract index](./contracts/README.md). This doc is retained as the historical gap analysis; the live contract inventory is the C00 index, not this file.
>
> ⚠️ **"Authored" ≠ "implemented" (corrected 2026-07-16, L-343).** The earlier "RESOLVED / all built" wording was misleading: writing a contract file is not building the feature. Several of these contracts remain **DRAFT with unbuilt code** — notably **C22** (Privacy/PII), **C48** (Backup/DR), and **C49** — whose implementation paths are entirely "(to be created)". Do NOT read this doc as feature-complete. Per-contract implementation status (DRAFT / CANONICAL / **ACTIVE**) lives in the [C00 index](./contracts/README.md) status vocabulary.
> **Scope**: identify every binding rule an enterprise BIM/AEC SaaS must codify · compare to the current contract suite · propose the gaps.
> **Method**: walked the Autodesk Forma + Revit + ArchiCAD + Stripe + Linear · checked against PRYZM's current 30 ratified contracts (C00–C18 + C24–C30 + draft C31) · cross-referenced with planning docs.
> **Result**: 18 contract gaps identified across 5 categories. Numbering proposed. **All 18 subsequently created (C19–C49 + C32–C49) — see C00 index.**

---

## §1 — What we have today (30 contracts)

| Category | Contracts | Status |
|---|---|---|
| Core platform (8) | C01 Arch · C02 Composition · C03 Schemas/Commands/State · C04 Rendering · C05 Persistence · C06 UI · C07 Plugin SDK · C08 Collab+Sec | All CANONICAL |
| Platform extensions (6) | C09 AI · C10 Perf+Obs · C11 Element creation · C12 Geospatial · C13 Project lifecycle · C14 Legacy elimination | All CANONICAL |
| Element semantics (4) | C15 Hosted elements · C16 Command authoring · C17 Batch creation · C18 Element preview visual | All CANONICAL |
| Output / interchange (5) | C24 Sheet · C25 IFC export · C26 Revit · C29 PDF · C30 Drawing set | All DRAFT |
| Inspect / data (2) | C27 BIM 3.0 Inspect · C28 Data panel | All DRAFT |
| Documentation (1) | C31 Documentation Authoring Protocol | DRAFT (this turn) |
| **Reserved gaps** | C19–C23 | UNFILLED |

## §2 — What an enterprise BIM/AEC SaaS must codify (checklist)

Walking the canonical list of binding rules a mature enterprise design platform needs:

### §2.1 — Foundation (have it)
✅ Architecture layered model · ✅ Composition root · ✅ Schemas/state · ✅ Rendering · ✅ Persistence · ✅ UI shell · ✅ Plugin SDK · ✅ Collaboration · ✅ Performance · ✅ AI

### §2.2 — Design & semantics (have it)
✅ Element creation pipeline · ✅ Hosted elements · ✅ Command authoring · ✅ Batch creation · ✅ Element preview visual

### §2.3 — Output & interchange (have most; some incomplete)
✅ Sheet composition · ✅ IFC export · ✅ Revit round-trip · ✅ PDF vector export · ✅ Drawing set management · ⬜ DXF/DWG round-trip · ⬜ Rhino interchange · ⬜ Print spec (drawing standards) · ⬜ COBie FM handover

### §2.4 — Site, environment, climate (partial)
✅ Geospatial coordinates (C12) · ⬜ Site model + parcel + context (C19) · ⬜ Building / Apartment aggregates (C20) · ⬜ Climate ingestion EPW + NOAA (C21) · ⬜ Sustainability + carbon · ⬜ Daylight + sun analysis

### §2.5 — Project lifecycle (have most)
✅ Project lifecycle + isolation (C13) · ✅ Legacy elimination (C14) · ⬜ Version & migration (.pryzm file versioning, breaking-change policy) · ⬜ Backup & DR · ⬜ Multi-region / sovereignty

### §2.6 — Security & compliance (have some)
✅ Auth + roles + ISO 19650 phase 1+2 (C08) · ⬜ Privacy / PII tier (C22) · ⬜ Provenance / audit trail for AI outputs (C23) · ⬜ GDPR / CCPA / data residency · ⬜ SOC 2 + audit log compliance · ⬜ Plugin trust & revocation (in C07, may need extraction)

### §2.7 — Inspect & data (have it, draft)
✅ BIM 3.0 Inspect (C27) · ✅ Data panel & automation (C28)

### §2.8 — Cross-cutting / commerce (missing)
⬜ Pricing + plan tiers contract · ⬜ Quotas + rate limits · ⬜ Marketplace economics (revenue share, payouts) · ⬜ Customer support tier · ⬜ Telemetry + analytics opt-in/opt-out (separate from C10 observability)

### §2.9 — Accessibility & device (missing)
⬜ WCAG 2.2 AA accessibility contract · ⬜ Mobile + tablet contract · ⬜ Browser/device compatibility matrix · ⬜ Internationalisation (i18n) + localisation (L10n)

### §2.10 — Documentation (have it now)
✅ Documentation authoring protocol (C31)

### §2.11 — Coordination & federated workflows (have BCF; need more)
✅ BCF round-trip (in plugins/bcf, contract-less today) · ⬜ Clash detection contract · ⬜ Schedule / 4D contract · ⬜ Cost / 5D contract · ⬜ Issue tracking integration

---

## §3 — Proposed missing contracts

Numbering plan: fill the C19–C23 reserved slots first (already informally named in PG0 / GS0 work), then continue with C32+ for new gaps.

### §3.1 — High priority (fill reserved slots C19–C23)

| Proposed | Title | Scope | Why now |
|---|---|---|---|
| **C19** | Site Model & Parcel | Site / parcel / building footprint / context-buildings schemas + commands + storage + IFC mapping. Companion to C12 Geospatial (which owns coordinate transforms only). | Apartment plan PG0 / GS0 (~19 wk) waits on this. Multi-apartment Tier 16 needs Site as a first-class element. |
| **C20** | Building & Apartment Aggregates | Building → level → apartment → room aggregation. Schema relationships + invariants. Wraps C13 Project lifecycle with the architectural hierarchy. | The Inspect tree (C27) implements this implicitly; needs codification. |
| **C21** | Climate Ingestion | EPW format reader · NOAA climate normals · solar + wind + temperature aggregates · per-site cache + invalidation. | GS0.4 deliverable. Climate-aware AI workflows wait on this. |
| **C22** | Privacy & PII Tier | What gets stored where, with what retention. PII vs project data vs telemetry. GDPR / CCPA compliance surface. BYOK boundaries. | Already referenced in PG0.6. SOC 2 audit waits on this. |
| **C23** | Provenance & AI Audit | Every AI-generated artefact traces its inputs · prompts · model · cost · timestamp. Output reproducibility. | C09 §6 mentions cost governance; provenance is a separate concern. Customer audit logs need this. |

### §3.2 — Medium priority (interchange + commerce)

| Proposed | Title | Scope |
|---|---|---|
| **C32** | DXF / DWG Round-Trip | Existing `plugins/dxf` is a stub. Needs the full contract for AutoCAD interchange. |
| **C33** | Rhino Interchange | Existing `plugins/rhino-import` covers import; round-trip + Grasshopper bridge contract missing. |
| **C34** | Print & Drawing Standards | Sheet size · linetypes · scales · north arrow conventions · drawing stamps per AIA + RIBA conventions. Companion to C24 Sheet (which is the engine; this is the standards). |
| **C35** | COBie FM Handover | Facility-management export — equipment lists, maintenance schedules. Tier-1 IFC + additional Pset coverage. |
| **C36** | Clash Detection & Coordination | Federated clash detection contract. Companion to BCF round-trip (which is the format). |
| **C37** | Schedule / 4D | Construction-phase scheduling export. Time-based phasing + animation. |
| **C38** | Cost / 5D | Cost estimation export. Quantity takeoffs + pricing tables. Companion to C28 Data + C25 Qto Psets. |

### §3.3 — Lower priority (cross-cutting + commerce)

| Proposed | Title | Scope |
|---|---|---|
| **C39** | Pricing & Plan Tiers | Solo / Studio / Mid-firm / Enterprise plan tiers · quotas · entitlements. Binding rules for what each tier sees. |
| **C40** | Marketplace Economics | Plugin payouts · revenue share · refund policy · published-author obligations. Binding rules for the marketplace SLA. |
| **C41** | Telemetry & Analytics | What we collect, how it's anonymised, opt-out surface. Separate from C10 Observability which is about debugging. |
| **C42** | Customer Support Tier | What support level each plan tier gets. SLAs. Escalation paths. |

### §3.4 — Accessibility + device (high-priority for enterprise readiness)

| Proposed | Title | Scope |
|---|---|---|
| **C43** | Accessibility (WCAG 2.2 AA) | Every UI surface conforms. Keyboard nav · screen reader · contrast · focus management. `packages/wcag-audit` is the implementation; needs the contract. |
| **C44** | Mobile & Tablet | What works on mobile · what doesn't · breakpoints · gesture conventions. `docs/05-guides/mobile/contract.md` exists as a guide; needs to be ratcheted to a contract. |
| **C45** | Browser & Device Matrix | Supported browsers · OS · hardware floor · WebGPU fallback policy. |
| **C46** | Internationalisation (i18n) & Localisation (L10n) | String externalisation · RTL support · locale-aware date/number/unit (architectural units especially: m vs ft).  |

### §3.5 — Versioning + DR (operational)

| Proposed | Title | Scope |
|---|---|---|
| **C47** | File-Format Versioning | `.pryzm` version evolution · breaking-change policy · forward/backward compatibility · migration runners. Companion to C05 Persistence. |
| **C48** | Backup & Disaster Recovery | RTO + RPO targets · backup cadence · restore procedure · DR drill schedule. |
| **C49** | Multi-Region & Sovereignty | EU/US/AP region routing · customer-managed data residency · BYOK boundaries. |

---

## §4 — Recommended sequence

### Phase 3.5 — fill reserved slots (C19–C23) — 5 contracts × ~3 days each = ~3 sprints

These are blocking on real work today:

1. **C19 Site Model** — unblocks GS0 multi-apartment + Site authoring UI
2. **C20 Building & Apartment Aggregates** — unblocks C27 Inspect tree formalization
3. **C21 Climate Ingestion** — unblocks climate-aware AI workflows
4. **C22 Privacy & PII** — unblocks SOC 2 audit prep
5. **C23 Provenance & AI Audit** — unblocks customer audit log requirements

### Phase 6.1 — interchange + commerce (C32–C38) — 7 contracts × ~2 days each = ~3 sprints

Unlocks the "production-grade BIM platform" capability gap:

6. C32 DXF/DWG
7. C33 Rhino
8. C34 Print & Drawing Standards
9. C35 COBie FM
10. C36 Clash Detection & Coordination
11. C37 Schedule / 4D
12. C38 Cost / 5D

### Phase 6.2 — cross-cutting commerce (C39–C42) — 4 contracts × ~2 days each

13. C39 Pricing & Plan Tiers
14. C40 Marketplace Economics
15. C41 Telemetry & Analytics (consent)
16. C42 Customer Support Tier

### Phase 6.3 — accessibility & device (C43–C46) — 4 contracts × ~2 days each

17. C43 Accessibility (WCAG 2.2 AA)
18. C44 Mobile & Tablet
19. C45 Browser & Device Matrix
20. C46 i18n/L10n

### Phase 6.4 — operational (C47–C49) — 3 contracts × ~2 days each

21. C47 File-Format Versioning
22. C48 Backup & DR
23. C49 Multi-Region & Sovereignty

---

## §5 — Total scope

- **18 missing contracts** (across 4 prioritised phases).
- **~46 contract-days** of pure writing (~9–10 weeks single-contributor; ~5 weeks at two parallel).
- **No code work** — these contracts encode rules that mostly already exist in code but aren't codified.

After this is done, PRYZM has **49 ratified contracts** covering every binding architectural surface an enterprise BIM/AEC SaaS needs.

---

## §6 — How to write each new contract

Per [C31 Documentation Authoring Protocol §2.1 Contract anatomy](./contracts/C31-DOCUMENTATION-AUTHORING-PROTOCOL.md). Every new contract:

1. Filename: `CNN-<UPPERCASE-HYPHENATED-TITLE>.md`
2. Stamp + Status: DRAFT initially
3. §1 Invariants (the binding rules — numbered §1.N)
4. §2 Schema (tables + types)
5. §3 Stores / API surface
6. §4 Commands
7. §5 UI (if applicable)
8. §6 Tests / CI gates
9. §7 NFT targets (if perf is at stake)
10. §8 Migration plan
11. §9 What is NOT in this contract
12. Cross-link from the C00 INDEX (`contracts/README.md`) on merge

---

## §7 — How we know we're done

When all 49 contracts (C00–C30 + C19–C23 + C31 + C32–C49) are CANONICAL and the documentation CI gates (per [DOCUMENTATION-GAPS-AND-NEXT-PHASES.md §7](../DOCUMENTATION-GAPS-AND-NEXT-PHASES.md)) are all hard-fail at green.

**Test**: a new joiner to the architecture team can answer "what rule binds X behaviour?" by reading exactly one contract, in under 5 minutes. If they can't, the contract is incomplete.

---

## §8 — Living doc

This audit is not a one-shot. As new domains emerge (e.g. embodied carbon, generative envelope design, AR/VR walkthrough), new contracts are needed. Append to §3 with a proposed CNN.

When a proposed contract is RATIFIED, its row in §3 moves to §1 of this doc and the contract list above grows.


---

## GAP (added 2026-07-16, via L-352) — Project-hub / dashboard hydration is un-contracted
**Discovered by:** L-352 (projects-hub stale-flash on first paint).
**The gap:** No contract or spec governs the **project hub's hydration / first-paint CORRECTNESS**. C02 §2/§115 covers boot stages + skeleton removal; C10 §1 NFT-1 covers first-paint TIMING (<2.5 s) — but **nothing requires the hub's first paint to render correct (non-stale) content, persist thumbnails, or reconcile the server list IN PLACE** rather than via a full-swap re-render. There is also no `SPEC-*` for the ProjectHub/dashboard surface at all (grep: none found).
**Proposed resolution (needs founder/architect decision):** EITHER add a hub-hydration clause to **C02** (first paint on the hub route MUST render last-known-good cached content + reconcile server diffs in place; no flash-of-stale), OR author a dedicated **SPEC-PROJECT-HUB** covering the hub's data hydration, thumbnail persistence, and reconcile discipline. Until then the behavior is un-governed and each render path invents its own.


---

## GAP (added 2026-07-16, via L-353) — Reality-capture / Gaussian-Splat assets are un-contracted
**Discovered by:** L-353 (Gaussian Splatting product-strategy review).
**The gap:** PRYZM has geospatial + Cesium + site-analysis capability and existing spikes (`spike-gaussian-splatting-photoreal-3d.md`, `spike-genrecon`) + a pluggable geodata provider (ADR-0065), but **no contract governs reality-capture assets** (point clouds, photogrammetry meshes, Gaussian Splats) as first-class GEOREFERENCED PROJECT ASSETS: their persistence/versioning (C05-adjacent), render path + budget (C04/C10 — a splat scene is millions of gaussians vs the 10k-element budget), isolation (C13), and how they overlay BIM/GIS. Each capture type would otherwise invent its own asset model.
**Proposed resolution (post-V1, needs founder/architect decision):** author a **C-REALITY-CAPTURE-ASSETS** contract (or extend the geospatial-foundation contract set) covering reality-capture asset lifecycle, render-through-renderer-three (P2), streaming/tiling + perf budget, georeferencing, and BIM/GIS overlay — BEFORE Gaussian Splatting (or any capture type) ships as a core capability. Sequenced by the L-353 research recommendation.


---

## GAP (added 2026-07-16, via L-354) — Analysis-layer provenance/confidence is un-contracted
**Discovered by:** L-354. **The gap:** no contract governs what METADATA every site-analysis layer must carry (source, method measured/simulated/interpolated/estimated, spatial+temporal resolution, accuracy, units, confidence, decision-grade vs indicative). C21 covers climate ingestion + ADR-0074 covers real solar, but wind/temperature/population have no provenance/confidence requirement — so undefensible numbers can be shown as if authoritative. **Proposed:** an analysis-provenance clause (extend C21 or SPEC-GEODATA-ANALYTICAL-LAYERS) mandating per-layer metadata + honest decision-grade-vs-indicative labeling in the UI.

## GAP (added 2026-07-16, via L-355) — Provider-agnostic Context Engine is un-contracted
**Discovered by:** L-355. **The gap:** contextual GIS data (terrain, imagery, buildings, vegetation, roads) is fetched ad-hoc (OSM via Overpass, Cesium tiles) with no provider-agnostic contract, no fidelity-tier definition (LOD1 vs LOD2/3, DEM/DTM/DSM), and no perf budget for context streaming — and the Forma 'real model' path re-exports a 71 MB GLB per activation (C10 heavy-scene risk). **Proposed:** a **C-CONTEXT-ENGINE** contract defining Terrain/Imagery/Building/Vegetation/Road provider interfaces (extending ADR-0065), fidelity tiers, streaming/tiling + perf budget (C10), render-through-renderer-three (P2), and EPSG georeferencing — before context fidelity is upgraded. Adjacent to the L-353 reality-capture-assets gap.


## GAP (added 2026-07-16, via L-357) — GIS-maturity target + coordinate-system authority are un-contracted
**Discovered by:** L-357 (Canvas GIS-awareness review). **The gap:** no contract defines (a) PRYZM's target GIS-awareness maturity (Level 0-5) or whether Cesium is essential vs optional, and (b) the COORDINATE-SYSTEM AUTHORITY — how local engineering coords, projected coords, WGS84, ECEF and ENU relate, and whether PRYZM operates in a local tangent plane while storing a global georef. The Cesium path already does LTP-ENU/ECEF georef ad-hoc, but it is not contracted, so a native-Three.js GIS engine would have no authoritative coordinate model to build on. **Proposed:** fold into the **C-CONTEXT-ENGINE** contract (L-355) a coordinate-authority clause + a GIS-maturity target, decided by the L-357 architecture review. Parent to the L-353/L-355 gaps.


---

## GAP CONSOLIDATION (2026-07-16, via L-359) — name it C-CONTEXT-ENGINE
**Discovered by:** L-357 spike; **consolidates** the two earlier notes filed via L-355 ("Provider-agnostic Context Engine un-contracted") and L-357 ("GIS-maturity target + coordinate-system authority un-contracted"). Those two are the SAME gap; this entry names the single contract to author.
**The contract to author — C-CONTEXT-ENGINE (P3 backlog, NO launch pressure):** owns (a) the coordinate authority (LTP-ENU local tangent plane + stored global georef), (b) GIS fidelity tiers (LOD1/LOD2/3, DEM/DTM/DSM), (c) the ADR-0065-aligned provider model (Terrain/Imagery/Building/Vegetation/Road), (d) the provenance/credibility bar (L-354), and (e) a context-streaming perf budget + a view-activation NFT (the C10 gap surfaced by L-358). Documentation only — implementation is the spike's Phases 1–4, out of scope here. This gap gates L-353/L-355/L-356.


---

## GAP (added 2026-07-17, via L-405) — the view-mode-switcher SET / registry is un-contracted
**Discovered by:** L-405 (founder — make the 2D parcel-select map a first-class switcher option + wire an enhanced-Forma/LOD200 forward slot).
**The gap:** The editor's peer view-mode switcher — `mountResultToggleBar` (`GISAreaLayout.ts:789`) with segments `◧ 3D + plan` / `◉ 3D globe` / `◉ 3D Site` (Forma) — is an **ad-hoc segmented bar keyed on a local `activeSegment` string**, NOT a declared, `viewRegistry`-driven set. **C06 §7** governs the launcher-layer STACKING/z-index and slot accounting, and **C06 §1** requires PlatformRouter *routes* to be `viewRegistry`-driven — but **nothing governs the SET of in-editor view-mode segments, how a new surface is registered as a first-class view, or which view owns the 2D parcel-SELECT map** (today mounted only from the onboarding draw path). Because there is no registry, each new surface (parcel-select, the enhanced-Forma `▤ Context` view of L-374g) risks a one-off toggle that bypasses per-view camera state (`MultiViewCameraManager`/`ViewCameraStateStore`, incl. the L-378 globe-scale pose guard), the L-270 view-activation overlay, and view persistence. Adjacent proposed-but-unauthored governance: **SPEC-CONTEXT-VIEW** (the `▤ Context` peer-segment lifecycle + no-Forma-regression guarantee, called for by `CONTEXT-VIEW-DESIGN.md §7`) and **SPEC-PARCEL-SELECTION** (the parcel-select interaction, referenced as proposed by C57 §5 / §6.1).
**Proposed resolution (needs founder/architect decision):** EITHER add a **view-mode-switcher clause to C06** (§7 or a new §8) that defines a declared view-mode registry — each segment a first-class entry carrying camera-state, activation-overlay, and persistence hooks, with the parcel-select surface named as a registrable view — OR author **SPEC-CONTEXT-VIEW** + **SPEC-PARCEL-SELECTION** and have C06 reference them. Until then the switcher set is un-governed and each new surface invents its own mount path. Ties L-374g (Context View), L-380/C57 (parcel-select), L-384 (site-authoring step UX).


---

## GAP (added 2026-07-18, via L-414) — interactive BIM/IFC data interrogation in the Cesium/geospatial view is un-contracted
**Discovered by:** L-414 (founder — SPIKE, QUEUED/NOT priority: *"if in the future we want to manipulate / interrogate the DATA in the Cesium views … how IFC data in Cesium could adapt to a super-performant and flexible process"*).
**The gap:** **No contract governs interrogating / selecting / manipulating BIM or IFC DATA inside the Cesium / Forma geospatial view.** Today that view is a **passive context surface** — the BIM scene is baked in as a whole-scene glTF `Cesium.Model` (`CesiumViewport.ts` `realModelOnGlobe`/`realModelOnForma`) with no per-element feature IDs, so `scene.pick` resolves only the whole model. **C27** (BIM 3.0 Inspect) + **C28** (Data panel / Pset) govern BIM-data interrogation but only on the editor canvas; **C55 §1.2** governs analytical drape *layers* and frames the Cesium surface as **context-only** (layers drape, never BIM); **C12** governs only the coordinate substrate. Making the BIM/IFC data interactive in the geospatial view (per-feature 3D-Tiles metadata `EXT_mesh_features`/`EXT_structural_metadata`, ThatOpen fragment-ID → Cesium feature-ID picking, a selection bridge into C27/C28) sits in **forward tension** with C55's context-only stance — a coverage gap, **not a present violation** (C55 §1.2 is about drape layers, not picking the BIM model already in the view).
**Resolution — FOUNDER DECISION MADE 2026-07-18 (direction chosen, deferred):** the founder resolved the direction — the geospatial view **should eventually become a first-class interactive BIM/IFC surface** (*"definitely nice to have"*), NOT stay permanently context-only — but explicitly **queued, not-priority (post-September)**. So the gap-close is scheduled, not open-ended: when L-414 is picked up, author a governing contract (amend C55 §1.2 + extend C27/C28 to the geospatial surface, or a new geospatial-interrogation contract) **before** any code — spanning the BIM data model (C03), IFC/ThatOpen interop (C25/C26), the Cesium render + bridge (C12/C55/CesiumViewport), and the C10 perf budget. **C55 remains context-only (as written) until that contract lands.** Cross-referenced from C55 §4.1 + the L-414 spike stub (`docs/03-execution/spikes/spike-bim-ifc-data-interrogation-in-cesium.md`). Adjacent to the L-355/L-357/L-359 C-CONTEXT-ENGINE gap.


---

## Added 2026-07-20 (from L-442 / L-443)

### GAP-A — No contract governs the RUNTIME BOOT BUDGET  (L-442)
The production container transpiles ~100 workspace TypeScript packages on every cold boot
(`dist/index.cjs` re-spawns `server.js` under `--import tsx`). Nothing anywhere states a
maximum acceptable boot time, and nothing prevents an added package from pushing boot past
the platform's health-check ceiling. It did exactly that on 2026-07-20 and broke every
deploy — intermittently for ~3 weeks, then deterministically.

**Needed:** a stated boot-time budget with a CI guard, in the same spirit as the existing
performance budgets. Without it, deploy breakage from package growth is unbounded and only
discoverable in production.

### GAP-B — SPEC-PARCEL-SELECTION was recommended but never authored  (L-380 / L-443)
`PARCEL-ZONING-FEATURE-SCOPING.md` §9.4 called for `SPEC-PARCEL-SELECTION` covering the map
interaction, envelope render, fallback states and provenance chips. **The file does not
exist.** Parcel-select shipped without it (Catastro live in production), so the behaviour is
governed by code alone.

### GAP-C — PORTUGAL has no contract, ADR, spec or verified endpoint  (L-443)
The founder has named Portugal (Seixal, Aroeira) as target territory. Portugal appears in NO
governance document. PDM ≠ PGOU; 308 municipalities; different infrastructure (DGT / SNIG).
Nothing in C57/C58/ADR-0269 was written with it in mind, and no endpoint has been verified.

**Risk:** treating Portugal as "more of the Spain work" would import assumptions
(Catastro-style national parcels, PGOU-shaped ordinances) that have not been checked and may
not hold. It needs its own live-verification pass before any estimate.

---

## Gap — graded / source-tagged CONTEXT-DATA provenance (L-511 / L-512)

**Found:** 2026-07-21, during the Spain 3D-context-data deep-dive (L-512).

**The gap:** PRYZM's provenance model today is effectively a **binary REAL vs ESTIMATED badge**
(the zoning "Why these numbers?" panel, the closest thing C23 governs). The context-data work needs
something richer that no contract currently describes:
- **Graded confidence**, not binary — a LiDAR-measured height on a PNOA 1st-coverage tile (~20-40 cm
  RMSE) and on a 3rd-coverage tile (<10 cm) are BOTH "REAL" but carry different confidence.
- **Multi-field provenance for one value** — a building height is `floor_count` (Catastro, real count)
  + `measured_height_m` (LiDAR nDSM, cycle-tagged) + `height_confidence` (agreement + point count).
  Collapsing these into one "REAL" is dishonest.
- **"reconstructed" as a distinct tier** — Spanish pitched roofs would be OUR RANSAC reconstruction
  from LiDAR, not a government LOD2 model; that is neither "REAL — official" nor "ESTIMATED".
- **Per-feature, per-layer** — buildings, roads, water, parks, trees each resolve to a different
  source/tier within one scene.

**Not a present violation** — C23 governs AI-audit provenance and does not *claim* to cover graded
context-layer provenance; it simply doesn't reach here yet. **Decision needed:** extend **C23** to
carry graded + source-tagged + multi-field provenance, OR write a new context-provenance spec
(SPEC-CONTEXT-PROVENANCE). Must land BEFORE the context provenance badge ships (L-512a). Owner:
UNASSIGNED. Related: C12/C19/C21/C55, L-511, L-512.

**Also governs L-514 (Portugal) — an EVEN MORE ACUTE case (added 2026-07-21):** Portugal has DGT
national LiDAR height but **no national floor-count** (no Catastro-ALTURAS equivalent), so the
measured height stands **single-source with no second field to cross-check** — the graded provenance
model must carry `measured_height_m` + `height_confidence` AND honestly record the *absence* of a
floor-count field, never collapsing to one "REAL". Same decision, same owner; no separate gap entry.

---

## Gap — C58 confidence tier for block-CONSTRUCTED real determinations (L-518)

**Found:** 2026-07-21, founder testing the real Barcelona envelope.

C58 §1.2's confidence model has `structured` (real per-parcel published fields) and
`estimated-ruleset` (curated default pack). The Barcelona envelope is NEITHER cleanly: its depth is a
REAL determination CONSTRUCTED from a real Catastro block + PGM Art. 242.2 via the rule pack, with
each derivation row carrying *published* fieldProvenance (the panel renders PUB), yet the top-level
`confidence` lands on `estimated-ruleset` → the panel shows an ESTIMATED badge + "Default rule pack"
over data that is real and cited (L-518). **Decision needed:** add a confidence tier (e.g.
`constructed-published` / `block-derived`) for "real, cited determination constructed from real
geometry + an accepted rule", and assign it to the catastro-muc BCN path — reconciled with §1.2/§1.4
and the founder-signed L-449 source acceptance. Owner: UNASSIGNED. Related: C58, ADR-0270/0271, L-518.

## Gap — data↔geometry bidirectional link (zoning report ↔ envelope geometry) (L-519)

**Found:** 2026-07-21, founder feature request.

No contract governs clicking a zoning/envelope report row to SELECT the geometry it derives from (or
the reverse: hover geometry → highlight the row). C27 (Inspect) covers element selection, C28 (Data
panel) covers data surfacing, C58 owns the envelope + derivation — but none defines the
`constraint → geometry-selector` map or the bidirectional highlight contract that L-519 needs. This
is the same shape as the Editable Living Graph ambition (bidirectional data↔model). **Decision
needed:** extend C58 to expose a stable per-derivation-row geometry selector, and define the
selection/highlight contract (C27/C28 extension or a new SPEC-EXPLAINABLE-GEOMETRY). Owner:
UNASSIGNED. Related: C58, C27, C28, C03, L-519.

---

## Gap — MULTI-CITY / MULTI-JURISDICTION rule-pack SCALING is un-contracted (L-535 / L-537 / L-538 / L-539)

**Found:** 2026-07-21, while measuring how the Barcelona buildable-envelope engine transfers to
other Spanish cities.

**What exists.** C57 governs *fetching a parcel* per jurisdiction (an adapter each). C58 governs
*one* jurisdiction's rule pack and, since 2026-07-21, the registry that resolves a zone code to a
pack or a refusal (§1.13). ADR-0269 argues the strategy at the level of "adapter + pack swap".

**What no contract governs — and it is now the dominant cost.** Nothing defines:

1. **What a jurisdiction must SUPPLY to be supportable.** The street-width work (ADR-0275) had to
   invent this ad hoc: a region supplies its own height table, its own quantisation set **derived
   from its own probe**, and optionally a declared-width override list — and it supplies **no
   geometry**. That separation is real and measured (Barcelona `{20,30}`, Madrid `{15,30}`,
   Valencia `{25,50}`, **Córdoba/Sevilla `[]`**), but it lives in a source-file header, not in a
   contract.
2. **The per-jurisdiction SOURCE-ACCEPTANCE gate.** The L-449 founder-signature pattern is the only
   thing standing between a transcribed PDF and a compliance number — and it **failed once
   already**: Barcelona's first accepted source (2026-07-20, "the AMB Dec 2010 PDF") proved stale,
   anachronistic and mis-attributed, and had to be **re-signed** on 2026-07-21 against the
   consolidated RPUC/NUMAMB refós (`L-526-LEGAL-FINDINGS.md`). **A wrong source passes a gate just
   as easily as a right one.** The metropolitan PGM is republished by dozens of municipalities in
   versions that differ from Barcelona's consolidation, and those republications are the easiest
   documents to find. No contract states that the gate is **per-source, not per-jurisdiction**, or
   what must be recorded about what was actually read.
3. **The ordering constraint between geometry and rules.** Measured (L-535): outside Barcelona the
   *geometry* stage failed before any rule was consulted (Madrid 2/4, Córdoba 0/3), so rule work
   would have landed on a pipeline that could not feed it. ADR-0274 removed the geometry blocker,
   but nothing codifies "measure the pipeline before authoring the pack".
4. **Coverage as a governed, published number.** L-538 measured Barcelona at **24.0 %** of private
   buildable land with **44 distinct claus** live. There is no contract requiring a jurisdiction's
   coverage to be measured, published, or honestly tiered before it is offered to users, and no
   definition of what "we support city X" means — a question with a legally-loaded answer, since
   for ~22.5 % of Barcelona the *correct* output is a reasoned refusal, not an envelope.
5. **Where a rule KIND belongs.** ADR-0270/0271/0272 each added a kind because a real ordinance
   needed one. Nothing says when a new kind is warranted versus when a pack should refuse — the
   distinction the founder's standing ranking ("legal fidelity first, standardisation second; a
   shared abstraction that flattens a real legal difference is worse than N specific packs") turns
   on.

**Not a present violation of any contract** — it is simply un-governed territory that four audit
rows and one 21-week plan now depend on. **Decision needed:** extend C58 with a
`§Jurisdiction Onboarding` section, or write **C60 — Multi-Jurisdiction Rule-Pack Scaling**.
Owner: UNASSIGNED. Related: C57, C58, C23 §11, ADR-0269/0270/0271/0272/0274/0275, L-449, L-535,
L-537, L-538, L-539, `BARCELONA-COMPLETE-COVERAGE-PLAN.md`.

---

## Gap — CADASTRAL / UPSTREAM DATA-QUALITY ASSUMPTIONS are un-contracted (L-539)

**Found:** 2026-07-21, when a probe demolished an assumption that had been written into a
production source file's header and believed for weeks.

**The gap.** PRYZM consumes government geometry as if its properties were known. They were not
written down anywhere, and the one place they *were* stated —
`packages/site-parcel-data/src/geometry/blockRing.ts`'s own header, which blamed "T-junctions and
slivers" — was **measured to be wrong about half of it**: across 250,646 real parcel edges there
are **ZERO slivers** (no edge below 0.0835 m, exactly one 1e-6° grid step) and **nothing to weld**
(a weld at ε ≤ 0.05 m moves 0.0000 m and changes 0 outcomes).

No contract states, for any upstream geodata source:

- **Its coordinate QUANTUM**, which is the only defensible upper bound on any repair tolerance
  (Catastro: 1e-6° = 0.083 m E / 0.111 m N — see C57 §1.11).
- **Which quantity a tolerance must be justified against.** The intuitive candidate — cadastral
  survey accuracy — is the **wrong** one: both sides of a shared boundary come from the same
  digitisation, so the relevant quantity is the RELATIVE displacement, whose only source is the
  publication rounding. Getting this backwards produces a defensible-sounding number that is
  unrelated to the defect.
- **What the parser silently drops.** `parseParcelGml` discards `<gml:interior>` rings (30 of
  33,865 features). Real, tiny, latent — and it was found by accident while investigating something
  else (C57 §13 KV-2).
- **The obligation to publish a failure DISTRIBUTION before repairing anything.** The rule that
  produced the only two trustworthy fixes in this subsystem — *characterise first, derive the
  tolerance from the data, do not tune a number until it passes* — exists in ADR-0274 §7 and in
  three probe documents, and is enforced by nothing.
- **Sampling honesty.** A WFS bbox returns parcels that merely *intersect* it, so a straddling
  block arrives truncated and fails for **our** reason; 1,682 such manzanas had to be excluded by
  hand or the baseline would have been flattered. Nothing requires this.

**Why it matters beyond Spain.** The same class of assumption underlies the context-data pipeline
(L-511/L-512 heights), the terrain work (L-522) and every future national adapter. The failure mode
is uniform: *an assumption about upstream data, stated once in a code comment, believed
indefinitely, and expensive when wrong.*

**Decision needed:** a **C61 — Upstream Geodata Quality & Repair** contract (or a C57 extension)
requiring, per source: a stated quantum, a measured failure taxonomy before any repair, a tolerance
derived from at least two independent bounds, a `quality`/provenance record on every repaired
artefact, and an explicit list of what the parser discards. Owner: UNASSIGNED. Related: C57
§1.11/§1.12/§13, C12, C55, ADR-0274, L-511/L-512, L-535, L-539.

---

## Gap — CI / TEST ENFORCEMENT is un-contracted (L-540 / L-542)

**Found:** 2026-07-21, during the launch-readiness sweep.

**The gap.** C01 §Governance and the 8 principles are described as "CI-enforced and merge-blocking",
and many contracts (C57 §6, C58 §6, C19 §6) list gates with a "ratchet" column. **No contract
governs the enforcement mechanism itself** — what must be green, for which trigger, before code
reaches production, and what it means for a gate to be advisory.

Two concrete, measured instances:

1. **The deploy workflow did not depend on CI at all.** `deploy-fly.yml` triggered on
   `push: [main]` with no `needs:` and no `workflow_run:` on `ci.yml`; the two ran side by side and
   never spoke, so **every push to `main` deployed regardless of CI** — v256–v265 all shipped
   ungated while `test-unit` was red. `ci.yml`'s own header describes itself as protecting merges
   via required status checks on **PRs**, a mechanism that is **inert** in a push-to-`main`
   workflow, which is the founder's actual workflow. **A §L-540-CI-GATE job has since been added**
   (verified present in `deploy-fly.yml` at the time of writing, with `needs: ci-gate` on the
   deploy job). *This gap entry is not closed by that fix* — the fix is one workflow's
   implementation detail with no contract behind it, and nothing prevents the dependency being
   dropped again.
2. **`pnpm -r --if-present run test:ci` silently skips most of the monorepo (L-543).** Counted
   independently here, 2026-07-21, across `packages/`, `apps/` and `plugins/`: **139 workspaces
   define a `test` script and only 17 define `test:ci`** — so **122 workspaces' suites are skipped
   without a warning** by the root `test:ci` script (`package.json:47`). (Audit row L-543 states
   130 of 166 over a wider workspace set; the two counts differ only in denominator and agree on
   the finding.) `--if-present` converts a missing script into a silent pass, which is the same
   shape as every honesty defect in this repo's audit: **an absence rendering identically to a
   success.**

Also un-governed: `ga-gate` and `a11y` carry `continue-on-error: true` and therefore cannot turn a
run red — a documented advisory choice with no contract stating when a gate may be advisory, who
may make it so, or how it ratchets to blocking (L-542).

**Decision needed:** a **C62 — CI, Test Enforcement & Release Gating** contract stating: which
suites are required for which trigger (PR vs push-to-main vs deploy); that a *deploy* must be
gated on the same evidence as a *merge*; that a missing test script is a **failure**, not a skip;
and the lifecycle by which an advisory gate becomes blocking. Owner: UNASSIGNED. Related: C01,
C10, C14, C57 §6, C58 §6, C19 §6, `tools/ga-gate/`, L-540, L-542,
`docs/04-reference/launch/STATUS-REPORT-2026-07-21.md` §5.


---

## Added 2026-07-22 — two coverage gaps found by the L-592 / L-593 spikes

### GAP — the 3D-Site scene has NO contracted SELECTION model (L-592)

BIM selection is contracted and implemented (`SelectionBus`, `SelectionManager`, `gpu-pick`). The
Cesium 3D-Site scene has its **own** ad-hoc `ScreenSpaceEventHandler` (`CesiumViewport.ts:1899`)
branching on `Cesium.Model` / `Cesium3DTileFeature`. **Two selection models coexist and neither is
contracted for the 3D-Site scene.** C12 covers context buildings as rendered geometry only; C19
owns parcel selection but context buildings are not site-model objects.

⚠ This is the same shape as the pre-C59 situation (three uncontracted view mechanisms). **Adding a
third selection path without a contract is how that recurs.** See `SPIKE-L592-L593-*.md`.

### GAP — no contract or spec owns the SITE-ENTRY / onboarding navigation flow (L-593)

The shipped sequence (location → draw/select boundary → generate) lives in `onboarding-bootstrap`,
`PlatformRouter` and `siteDispatch`, plus session notes — **not in any contract or spec.**
`SPEC-FORMA-SITE-VIEW.md` covers the Forma view once a site exists; nothing covers how a user
ARRIVES at one. The L-593 globe proposal has therefore no contract to conform to, which is exactly
the condition under which a fourth ad-hoc mechanism gets built.

⇒ **Recommend a `C60 — SITE ENTRY & JURISDICTION COVERAGE` contract**, owning the entry state
machine AND the honest answer to *"where can PRYZM actually answer?"* — which today exists only as
`REGISTRATIONS` in `rulepacks/registry.ts` plus the `isInBarcelona()` bbox.

> ✅ **CLOSED 2026-07-22 — [`C60-SITE-ENTRY-AND-JURISDICTION-COVERAGE.md`](./contracts/C60-SITE-ENTRY-AND-JURISDICTION-COVERAGE.md)
> written and Phase 1 implemented.** It owns both halves, as recommended. The coverage half was
> resolved by making the registry itself able to answer *where*: `JurisdictionRegistration` gained
> **required** extent/country/summary fields whose Barcelona values are the **imported
> `BARCELONA_BBOX` constant and `isInBarcelona` predicate the dispatcher already routes on** (not
> copies — identity is asserted by test), plus `listJurisdictionCoverage()`. A hand-maintained
> coverage layer is now forbidden by C60 §2 and structurally unnecessary. The entry half is a pure,
> unit-tested reducer (C60 §1.1 explicitly forbids the `camera.moveEnd` altitude sniffer). **Live
> wiring is NOT done and is sequenced behind C59 Phase 3** (C60 §8).

---

## GAP — no contract owns an **INTROSPECTIVE** geodata layer (L-601, 2026-07-22)

`C55 — Geodata Analytical Layers` is the closest home for the answerability layer (colour + select
land by *what PRYZM can say about it*), and two of its invariants fit exactly: **§1.2** (layers
drape; they never become BIM geometry) and **§1.4** (graceful absence is a quiet no-op).

**But §1.1 and §1.3 model a layer as an EXTERNAL national registry** — a `GeodataProvider` with
`fetchTile(layerId, bbox, z)`, a country grouping, C23 attribution and an opacity slider, explicitly
so "adding Norway is registering a new provider, never editing the core". The answerability layer has
**no external source at all**: it is derived from `resolveZoneDisposition` + the refusal vocabulary —
*our own engine describing what it can and cannot answer*. It is the first **introspective** layer in
the system.

⇒ **This is a genuine contract question, deliberately NOT resolved here.** Two candidate answers,
both defensible:

- **Extend C55 §1.3** to admit an *internal* provider whose `attribution()` is the ordinance citation
  rather than a registry credit. Cheapest, and keeps one Layers panel.
- **Own it in C58/C57 instead**, on the grounds that the class is a **zoning determination** that
  merely happens to be rendered — the same reasoning that put jurisdiction coverage in the rule-pack
  registry (C60 §2) rather than in the UI layer.

⚠ The C60 precedent leans toward the second: coverage was made a property of the *engine*, not of the
*display*, precisely so a hand-maintained copy could not drift. The same argument applies here and
should be weighed before defaulting to C55.

**Whichever is chosen, C58 §1.4 binds the palette**: a *correct refusal* (systems land, clau 18) and
an *owned gap* (zone unencoded) are OPPOSITE claims and must never share a colour —
§CONTEXT-DATA-HONESTY, "failure and empty are the same VALUE and must never be the same ANSWER".

Logged as **L-601**. See `docs/04-reference/V1-LAUNCH-IMPLEMENTATION-PLAN.md` task 8.

---

## GAP — nothing owns the **DATUM → GEOMETRY** binding (L-603, 2026-07-22)

PRYZM can already say *which article produced a number*. It cannot say *which piece of geometry
expresses it*. `DerivationEntry` (C58 §2.4, `BuildableEnvelope.ts:92`) carries
`constraint · value · zoneCode · source · fieldProvenance · ordinanceRef` — complete **legal**
provenance and **no geometric reference** at all.

So "click *Buildable depth 19.0 m* and highlight the depth in the model" has nothing to bind to.

**Searched, and the direction is the problem:**

- **C27** (BIM3 Inspect) and **C28** (Data Panel) establish **selection → data** — click geometry, the
  grid filters. C28 §Depends states it outright: *"Inspect selection drives data filter"*.
- **This request is the INVERSE — data → geometry.** Neither contract covers it, and it is not a
  symmetric case: a BIM element has an id, whereas *"the buildable depth"* is a **scalar produced by
  a solver**, whose geometric expression (which edge of which ring, at which storey) is knowledge the
  solver has and currently discards.
- **C56 AutoDimension** owns *drawing* a measured distance and should be the render path — but it
  governs a dimension SET planned from a wall graph, not a datum highlight.
- **C09/P7** places a highlight in visibility intent. **C58** owns the numbers. **No ADR, no spec.**

⚠ **Second, distinct gap in the same request: C59 has no vocabulary for PER-VIEW CAPABILITY.** The
founder asked for this in *"all views apart from 3D globe"*. C59 models a view as a mountable pane
surface; it cannot express *"view X does not support capability Y"*. Today that exclusion could only
be an `if (viewType === 'site-3d')` somewhere — exactly the ad-hoc branching C59 §0 exists to stop.

⇒ **Recommend a contract (or a C58 §2.4 + C56 extension) owning the binding**, with one rule
non-negotiable from day one: **a datum with no geometric expression must be REPRESENTABLE as such**.
`Max FAR`, `max site coverage`, the 80 m² dwelling module and `max dwellings ≈ 34` have no shape.
Highlighting *something approximate* for them would be §CONTEXT-DATA-HONESTY's failure in a new
costume — *failure and empty are the same VALUE and must never be the same ANSWER*.

Logged as **L-603**. See `docs/04-reference/V1-LAUNCH-IMPLEMENTATION-PLAN.md`.

---

## L-600 (2026-07-22) — CROSS-RENDERER CAMERA STATE: **gap CLOSED IN PLACE, not a new contract**

**Searched, and reported honestly rather than assumed.** The founder asked for one shared camera
angle across the 3D globe, the 3D Site and the 3D BIM view. Enumerating what governs it:

- **C59** owned *which view is hosted in which pane* and explicitly deferred *"per-pane view state
  **+ camera state**"* to Phase 3 — so this was **under-specified, not unowned**.
- **C60** owns the globe entry stages and their camera as a **projection of the stage**
  (`cameraForState`), but scopes that to the entry flow only.
- **C04** owns scheduling (single rAF), **C12** the coordinate frames, **ADR-0115/ADR-0070** the
  dual-north θ. None of them says whether two renderers may share a camera pose, or how.
- **`ViewCameraStateStore` / `MultiViewCameraManager`** are implementation, contracted nowhere
  beyond C59's Phase-3 one-liner and the L-405 recommendation.

⇒ **No new contract was created, and that is the finding.** The failure mode here — a camera
feedback loop between two renderers, and a θ applied zero or twice — is **not distinct from C59's
domain**; it is the camera half of the per-pane view state C59 already claimed. A separate
contract would have split one subject across two documents, which is precisely the disease C59 §0
was written to cure. The gap is closed **in place** as **C59 §2.7** (+ a new §2 invariant 7),
following C60 §7's own test for when a separate contract IS warranted (*different question,
different failure mode*) and failing it.

⚠ **What remains genuinely uncontracted, and is NOT filled by §2.7:** whether a *shared camera*
should also cover the 2D surfaces (plan/section/elevation). C59 §2.7.6 states they are excluded
and why, but that is a scoping decision recorded in passing, not a contracted position on
cross-view camera semantics generally. If a future request asks for a linked 2D↔3D camera, this
should be revisited rather than extended by analogy.

## L-604 (2026-07-22) — ECEF IN THE BIM SCENE GRAPH: **NOT a missing contract — an existing one is VIOLATED**

Recorded here only to close the search: this looked like a coverage gap and is not one. **C12
§1.1** already mandates a local LTP-ENU scene frame recentred within 1 km, with the `float32`
precision rationale stated. `CesiumThreeBridge.setAnchor()` contradicts it. The contract is
correct and the code is wrong (C01 conflict-resolution order), so this is logged as a **Known
Violation in C12 §1.5**, not as a missing contract. No new document.

## L-607 (2026-07-24) — 3D-SITE CONTEXT-TILE PIPELINE: **a genuine coverage gap — an already-named reserved slot**

The 3D-Site context-building pipeline — bake regional coverage (`tools/context-bake/bake.mjs` +
`context-bake.yml`), serve PMTiles from R2, and the client reader's honest
`ok`/`aborted`/`unavailable`/`disabled` discriminator (`contextTiles.ts`, L-513b/L-578) — is
governed by **no ratified C-contract**. Verified, not assumed:

- **C57 §scope (line 292)** explicitly maps *"LOD2 context buildings + terrain ingestion (Cesium
  3D-Tiles / quantized-mesh)"* to *"[C19 §1.8] (context snapshot) + the Denmark reference
  architecture (offline-bake); **a future context-engine contract**"* — i.e. C57 deliberately
  scopes context-building ingestion OUT of itself and names the missing contract.
- **C12** owns the coordinate frame the tiles render in, not the bake/serve/coverage pipeline.
- The de-facto authority today is the **reference** doc
  `docs/04-reference/geospatial/CONTEXT-3D-PERFORMANCE-ARCHITECTURE.md` + **ADR-0268** (Cesium georeferenced
  placement) + the **L-513** issue chain. A reference doc + ADR is not a contract.

⇒ **This is NOT a violation (nothing is claimed that the code contradicts) and NOT closeable in an
existing contract's domain.** It is the "future context-engine contract" C57 reserved, now with a
concrete forcing case: **which jurisdictions are baked** and **how the reader distinguishes
*out-of-baked-coverage* from a *genuinely-empty tile*** (the §CONTEXT-DATA-HONESTY line — audit
L-607 layer 2) have no contracted position. When L-607's implementation is scoped, that contract
(provisional name **C-CONTEXT-ENGINE**) should be authored to own: regional coverage policy, the
tile-format + provenance (C23 badge), the honest empty-vs-unavailable-vs-out-of-coverage
trichotomy, and the Overpass-fallback demotion rule. **No new contract authored in this pass** —
logged as the reserved slot it is, per C60 §7's "different question, different failure mode" test
(which this passes: bake/serve/coverage is a distinct subject from C57's parcel ingestion).

## Gap (L-617) — "schema defaults must satisfy their own refinements" is uncontracted

Surfaced by 3 failing `@pryzm/schemas` round-trip tests (audit **L-617**): `WaterSchema.parse({})`
throws because both elevation defaults are `0` while `.refine(surface > bottom)` rejects it; a
`ViewTemplate` default also drifted. The invariant that **a schema's default object must itself be
valid under the schema's refinements** (so `parse({})` round-trips deterministically) lives ONLY in
`round-trip.test.ts`, not in any contract. It belongs in **C03** (schema shape) or **C05**
(persistence round-trip determinism). **No contract authored in this pass** — logged as the
reserved slot, per the "different question, different failure mode" test. Owner: UNASSIGNED · TARGET: TBD.

---

## §GAP (L-642) — the 3D-Site (Forma) CONTEXT render system has NO governing contract

Surfaced by the founder's "make 3D-Site production-ready & beautiful at zoom-out" feature (audit **L-642**).
The 3D-Site context LOD / extent / layer system — concentric near/far LOD rings, the context radius, which
OSM layers are draped (buildings/roads/water/parks/landuse, and the requested rail/trees), the always-on
terrain + sea, and the ADR-0094 large-scene performance budget — is real and substantial code
(`CesiumViewport.ts` `§FEAT-FORMA-CONTEXT-EXTENT-LOD` + `§FEAT-FORMA-CONTEXT-NEAR-CAP` L-454) but is
governed ONLY by reference docs (`CONTEXT-3D-PERFORMANCE-ARCHITECTURE`, `CONTEXT-LOD-BUILD-PLAN`,
`CONTEXT-VIEW-DESIGN`) + `SPEC-FORMA-SITE-VIEW`. No C-contract binds its invariants (the render is a pure
total function of the data; the perf budget; the honest-degradation of a missing layer; the LOD-tier
rules). It sits adjacent to **C12** (geospatial substrate), **C58 §1.14** (massing render is a pure
function), **C59** (Forma pane view) and **C10** (perf budget) but none of them own it. **Candidate: a new
contract "3D-Site Context Render (LOD, Extent, Layers & Budget)"**, ratifying the new
`SPEC-3D-SITE-PRODUCTION-CONTEXT.md`. No contract authored in this pass — logged as the coverage gap per
the process. Owner: UNASSIGNED · TARGET: TBD.

---

## §GAP-RESOLVED (L-648) — "no contract owns CITY COMPLETENESS + the dossier shape" → **CLOSED by C63**

Surfaced by the founder's city-completion-scorecard directive (audit **L-648**). PRYZM replicates cities
one at a time but had **no single, comparable, honest, machine-derivable measure of "how complete is city
X"** across the eight replication layers, and **no enforced dossier folder shape** — completeness lived in
prose, one per-country `RATE.md` number, and tribal memory, and any hand-typed completeness number was a
§CONTEXT-DATA-HONESTY fabrication hazard. This sat adjacent to C57 (parcel), C58 (envelope), C60
(coverage) and C62 (confidence vocabulary) but none of them owned the *cross-layer completeness measure*
or the *dossier standard*. **RESOLVED this pass** by minting **[C63 — City Completion Scorecard & Dossier
Standard](./contracts/C63-CITY-COMPLETION-AND-DOSSIER.md)** (ratified by
[ADR-0281](./adrs/ADR-0281-city-completion-scorecard-and-dossier-standard.md), specced by
[SPEC-CITY-COMPLETION-SCORECARD](../03-execution/specs/SPEC-CITY-COMPLETION-SCORECARD.md)): a 7-axis
scorecard that is a *total function of state* (never hand-typed) composing C62, plus the fixed dossier
shape (`_TEMPLATE/_CITY/`) and the master per-city completion matrix. Passes the C60 §7 "different
question, different failure mode" test (cross-layer completeness + evidence-container shape is a distinct
subject from any single-layer contract). Owner: UNASSIGNED · schedule: schema/function + CI gate sequenced
after founder weighting sign-off (C63 §4/§8).
