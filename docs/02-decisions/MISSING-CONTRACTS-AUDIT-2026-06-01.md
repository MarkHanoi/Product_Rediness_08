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
