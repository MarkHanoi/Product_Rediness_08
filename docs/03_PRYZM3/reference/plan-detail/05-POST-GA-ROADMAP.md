# 12 — BIM 2.0 & BIM 3.0 Post-GA Roadmap (M37 → M72)

| Field | Value |
|---|---|
| Status | Active — strategic |
| Version | 1.0 |
| Date | 2026-04-27 |
| Authority | Founder + Architecture lead |
| Hypothesis | **PRYZM 2.0.0 GA shipped today**: every M36 deliverable per `08-VISION.md §6`, `10-MASTER-IMPLEMENTATION-PLAN-36M.md` and SPECs 01–31 is in production. This document specifies what comes next. |
| Conflict order | This doc is subordinate to: `08-VISION.md` → `10-MASTER-IMPLEMENTATION-PLAN-36M.md` → `04-PRODUCTION-PARITY.md`. New SPECs introduced here (SPEC-32 through SPEC-50) are normative for their phase windows. |
| Phases | Phase 4 (M37–M42), Phase 5 (M43–M48), Phase 6 (M49–M54), Phase 7 (M55–M60), Phase 8 (M61–M72) |

> The 36-month plan delivers PRYZM 2 to **BIM-Level-2-substrate parity**: web-native authoring + multi-user + IFC4 + sheets/schedules + headless + plugin SDK + portable file. It does **not** deliver: full ISO 19650 information management, COBie data drops, federated CDE workflows, MEP system networks, code compliance, semantic linked data, digital-twin operational continuity, or AI-as-design-partner. Those are BIM 2.0 contractual closure (Phase 4) and BIM 3.0 leadership (Phases 5–8). This document is the binding 36-month post-GA roadmap that takes PRYZM from "best web BIM substrate" to "the BIM operating system the industry adopts as a category."

---

## §0 Reading conventions

- **Sprint numbering continues**: M36 closes at S72 D9 (per PHASE-3D §S72). Post-GA sprints continue at **S73**. Each post-GA quarter holds 12 sprints (S73–S84 = M37–M42, etc.).
- **SPEC numbering continues**: SPECs 01–31 are pre-GA. SPECs introduced in this document run **SPEC-32 through SPEC-50**. Each SPEC referenced below is a normative deliverable; the SPEC file itself is created at the sprint cited in the §"SPEC creation" column.
- **ADR numbering continues**: strategic ADRs 001–030 are pre-GA. Post-GA strategic ADRs run **ADR-031 through ADR-080**.
- **Family count**: M36 GA ships 18 element families. This roadmap adds 14 more (taking the total to 32) plus 9 system families (HVAC, electrical, plumbing-system, sprinkler, gas, drainage, communications, security, vertical-transport).
- **Citation format**: `[strategic ADR-NNN]` for strategic ADRs; `SPEC-NN §X.Y` for specs; sprint-scoped ADRs at `docs/architecture/adr/NNNN-*.md` cited as `[ADR NNNN-slug]`.

---

## §1 The frame — what BIM 2.0 and BIM 3.0 actually are

### §1.1 BIM 1.0 (the era we are leaving behind)

Single-discipline 3D modeling. Revit, ArchiCAD, MicroStation, Vectorworks. File-based exchange (DWG, RVT, PLN). One model per discipline, manually federated by exchanging files. PDFs are the construction-document deliverable. Owner: 1990s–early 2010s.

### §1.2 BIM 2.0 — the contractually-mandated federation era (where we are now)

Defined by:
- **ISO 19650-1:2018** (Concepts and principles) and **ISO 19650-2:2018** (Delivery phase of the assets).
- **PAS 1192-2:2013** (UK origin; superseded by ISO 19650 but still cited).
- **buildingSMART IFC4 / IFC4.3** (open exchange).
- **COBie** (asset handover schema, NIBS).
- **Common Data Environment (CDE)** with WIP / Shared / Published / Archived states and S0–S7 suitability codes.
- **Soft Landings / Government Soft Landings (GSL)** for asset handover.

The BIM 2.0 deliverable is a **federated information model** with auditable status codes, COBie drops at PIM gates (S2/S3/S4/S6), and an Asset Information Model (AIM) at handover. The mandate exists in: UK (since 2016 government work), Singapore (BCA), France, Germany (BIM Cluster), Spain (es.BIM), Netherlands, Australia (NATSPEC), Hong Kong, UAE, Saudi Arabia (SBC), Brazil. In the US, GSA + USACE + DoD mandate IFC + COBie on federal work.

**The BIM 2.0 software market today**: Autodesk Construction Cloud + BIM 360 + Navisworks (Autodesk stack), Trimble Connect, Bentley iTwin, Asite, Aconex (Oracle), Viewpoint, Procore, Bluebeam Studio, Revizto. None of these is web-native authoring + CDE in one product. Every BIM 2.0 stack today is "Revit (or equivalent) for authoring + a separate cloud CDE for federation." That fragmentation is PRYZM 2's wedge.

### §1.3 BIM 3.0 — the emerging post-2026 era PRYZM 2 must define

BIM 3.0 is not yet a contractual standard. It is the convergence of seven trends already shipping in research, pilots, and manifestos:

| Trend | Where it lives today | What BIM 3.0 makes contractual |
|---|---|---|
| 1. **Cloud-native, web-first authoring** | Pascal, Snaptrude, Forma, Qonic, Motif, PRYZM 2 | Replaces desktop-installed BIM. No more "send me the .rvt." |
| 2. **Real-time multi-user (CRDT-based)** | Snaptrude, Qonic, PRYZM 2 (M24 beta) | Federation collapses from "exchange files via CDE" to "one live document, N peers." |
| 3. **AI-native** (generative, semantic, code-checking, design-partnered) | Snaptrude, Forma, PRYZM 2 (M27), Solibri (code-check) | AI participates at every LOD — program → massing → schematic → DD → CD → handover. |
| 4. **Linked data / semantic web** (W3C RDF + IFC + bSDD + DBO) | buildingSMART Data Dictionary, ICDD (ISO 21597), LinkedBuildingData (LBD-W3C) | Building data becomes queryable across projects, organisations, jurisdictions. SPARQL replaces "what does this column code mean in this firm." |
| 5. **Digital-twin continuity** (BIM + IoT + sensors + operational data) | Bentley iTwin, Microsoft Digital Twin Definition Language (DTDL), CityGML, IFC for FM | The BIM model is alive after handover. PIM → AIM → operational DT → predictive maintenance. |
| 6. **Programmatic / headless / agentic** (every operation is API + scriptable + AI-callable) | PRYZM 2 (`@pryzm/headless` from S08), Speckle, Rhino.Compute | "Design by typing" or "design by prompting an agent" replaces "design by clicking." |
| 7. **Open standards + decentralised data ownership** | Open BIM (buildingSMART), IDS (Information Delivery Specification), Solid Pods (Tim Berners-Lee) | The owner of a project owns its data; the software is interchangeable; vendor lock-in is structurally impossible. |

**The candidate BIM 3.0 standards already in flight** (any of which becomes contractual mandate by 2030):
- **ISO 21597-1:2020 Information Container for Linked Document Delivery (ICDD)** — semantic federation of IFC + linked documents.
- **buildingSMART IDS (Information Delivery Specification) 1.0** — machine-readable EIR (Employer Information Requirements).
- **W3C LBD (Linked Building Data) Community Group** — RDF vocabulary for IFC + BOT (Building Topology Ontology).
- **DTDL 2.0 (Microsoft / Azure Digital Twin)** — owner-side operational ontology.
- **bSDD (buildingSMART Data Dictionary)** — multilingual, cross-jurisdiction property mapping.
- **ISO 23386 / 23387** — property templates for BIM.
- **CDE 2.0 (TUM, Fraunhofer, RIBA Plan-of-Work 2025)** — federated, decentralised, blockchain-receipt-anchored CDEs.

**PRYZM 2 in BIM 3.0 terms today (M36 GA)**: ships 1, 2, 3 (partial), 6 (best-in-class). Does not ship 4, 5, 7. **This roadmap closes 4, 5, 7 and deepens 3.**

### §1.4 Where PRYZM 2 GA actually sits (the brutal map)

| BIM 2.0 contractual deliverable | PRYZM 2 M36 GA status | Gap to close |
|---|---|---|
| Federated CDE with ISO 19650 status codes (S0–S7) and suitability | partial (`apps/sync-server` is collaboration, not CDE) | Phase 4 §3 |
| IFC4 read+write + buildingSMART certification (Reference View + Design Transfer View) | shipped (`[strategic ADR-008]`); no certification | Phase 4 §4 |
| COBie 2.4 export (17 sheets) | not shipped | Phase 4 §5 |
| Federated clash detection (architectural ↔ structural ↔ MEP) | not shipped | Phase 4 §6 |
| MEP system networks (HVAC ducts, electrical conduits, plumbing systems with flow direction, sizing, system inheritance) | partial — fixtures only at S25–S27; no system propagation | Phase 4 §7 |
| 4D (programme link) and 5D (cost link) | not shipped | Phase 4 §8 + Phase 5 §3 |
| EIR / BEP / TIDP / MIDP document chain | not shipped | Phase 4 §9 |
| Soft Landings / GSL handover with operational data continuity | not shipped | Phase 5 §6 |
| **BIM 3.0 emerging deliverables** | | |
| Linked-data RDF/SPARQL endpoint over the BIM model | not shipped | Phase 6 §2 |
| IDS (Information Delivery Specification) read + validate + author | not shipped | Phase 6 §3 |
| ICDD (ISO 21597) container support | not shipped | Phase 6 §4 |
| Digital-twin operational continuity (IoT bridge, DTDL export) | not shipped | Phase 7 §3 |
| AI design partner (program → massing → schematic → DD → CD progression) | partial — element creation only (S50–S54) | Phase 7 §4 |
| Code-compliance check (jurisdictional ruleset → model violations) | not shipped | Phase 7 §5 |
| Open marketplace + Solid-Pod-style decentralised project ownership | partial — marketplace at S62; not decentralised | Phase 8 §4 |

This is the gap PRYZM must close to define BIM 3.0 the way Revit defined BIM 1.0.

---

## §2 The post-GA five-phase plan at a glance

| Phase | Window | Sprint range | Theme | Outcome | New SPECs |
|---|---|---|---|---|---|
| **Phase 4** | M37–M42 (6 mo) | S73–S84 | **BIM 2.0 contractual closure** — close every gap in §1.4 BIM 2.0 row | Only web BIM tool with full ISO 19650 + IFC4 certification + COBie + federated clash + MEP systems. UK / EU / Singapore / Australia government work unblocked. | SPEC-32 to SPEC-37 |
| **Phase 5** | M43–M48 (6 mo) | S85–S96 | **Analysis ecosystem + 4D/5D bridges** — federation hub for design + analysis + render | Bridge to Karamba3D / OpenSees / EnergyPlus / Cycles / Blender / MS Project / Asta / NBS Chorus. Path-traced rendering server-side. | SPEC-38 to SPEC-41 |
| **Phase 6** | M49–M54 (6 mo) | S97–S108 | **BIM 3.0 foundations: linked data + IDS + ICDD + bSDD** | First commercial linked-data BIM. SPARQL endpoint per project. IDS-driven validation. Multi-jurisdiction property mapping. | SPEC-42 to SPEC-45 |
| **Phase 7** | M55–M60 (6 mo) | S109–S120 | **AI design partner + code compliance + digital-twin continuity** | AI participates at every LOD. Code compliance for IBC / Approved Documents / EUROCODE / SBC. DTDL export to Azure Digital Twin. | SPEC-46 to SPEC-49 |
| **Phase 8** | M61–M72 (12 mo) | S121–S144 | **Category definition: BIM OS, decentralised data, vertical packs, acquisition integration** | PRYZM is positioned as "BIM OS"; three vertical packs (healthcare, education, infrastructure); rendering company acquired; Pascal absorbed; one strategic acquisition integrated; $100M ARR path. | SPEC-50 |

---

## §3 Phase 4 — BIM 2.0 contractual closure (M37–M42, S73–S84)

**Goal**: at end of M42, PRYZM 2 ships the **only** web BIM platform that satisfies every line of an ISO 19650 / PAS 1192 / Singapore BCA / GSA RFP without external tools. This unlocks the entire UK + EU + Singapore + Australia government-mandated market (estimated TAM: $3.2B / year per Stantec 2024 report).

### §3.1 New SPECs in Phase 4

| SPEC | Scope | Sprint creation |
|---|---|---|
| SPEC-32 | CDE module (`apps/cde/`) — ISO 19650 status codes, suitability codes, approval workflow, immutable revisions, audit log | S73 D1 |
| SPEC-33 | COBie 2.4 export (`packages/cobie-mapper/`) — 17 sheets, parameter mapping, PIM/AIM gate triggers | S75 D1 |
| SPEC-34 | Federated clash detection (`apps/clash-engine/`) — server-side BVH on union of N projects, rule-based classification, approval queue | S76 D1 |
| SPEC-35 | MEP systems (`plugins/mep-hvac/`, `plugins/mep-electrical/`, `plugins/mep-plumbing-system/`, `plugins/mep-sprinkler/`, `plugins/mep-gas/`) — system networks with flow direction, sizing, equipment | S78 D1 |
| SPEC-36 | EIR/BEP/TIDP/MIDP document chain (`packages/iso-19650-docs/`) — generator, parser, validator | S81 D1 |
| SPEC-37 | buildingSMART IFC4 certification programme — Reference View + Design Transfer View test suites + submission | S73 D1 (background work to S84) |

### §3.2 New strategic ADRs

| ADR | Decision | Sprint |
|---|---|---|
| ADR-031 | CDE storage topology — does the CDE share the L0 event log + R2 chunk store, or is it a separate Postgres + R2 namespace? | S73 D1 |
| ADR-032 | Clash classification rule language — DSL vs Python-in-sandbox vs SPARQL | S76 D1 |
| ADR-033 | MEP system propagation algorithm — graph traversal vs constraint solver | S78 D1 |
| ADR-034 | COBie mapping policy when an element has no required Pset value — fallback to type vs error vs synthesised | S75 D1 |
| ADR-035 | buildingSMART certification scope — Reference View only vs RV + Design Transfer View vs RV + DTV + Coordination View 2.0 | S73 D1 |

### §3.3 Sprint-by-sprint detail

#### S73 — CDE foundations + IFC certification kickoff
- **Track A**: `apps/cde/` skeleton (Express + Postgres tables `cde_states`, `cde_revisions`, `cde_suitability`); ISO 19650 status state machine (S0 Work In Progress → S1 Suitable for Coordination → S2 Suitable for Information → S3 Suitable for Review and Comment → S4 Suitable for Stage Approval → S5 Suitable for Construction → S6 As Constructed → S7 Suitable for Asset Management); SPEC-32 lands; ADR-031 + ADR-035 lands.
- **Track B**: CDE UI in `apps/editor/src/cde/`; status badges per project; revision history viewer; submit-for-approval flow; reviewer comment threads.
- **Joint**: buildingSMART certification submission package starts (test fixtures, official IFC4 RV + DTV import suite execution; gap report filed).
- **Bench**: `apps/bench/src/benches/cde-status-transition.bench.ts` — 1,000 status transitions/s p95 < 10 ms.
- **Exit**: `[ ]` PRYZM 2 projects can be submitted for review and pass through S0 → S5 with full audit trail; IFC4 RV import pass rate ≥ 95% on buildingSMART fixtures.

#### S74 — CDE comment threads + version control + tag-based release
- **Track A**: `cde_comments`, `cde_tags`, `cde_releases` tables; tag-based release semantics (immutable hash, signed by issuer); per-issuer signing keys (per `[strategic ADR-021]`).
- **Track B**: comment-on-element overlay in canvas; release history sidebar; "compare two releases" diff view (re-uses S31 plan-view rendering).
- **Bench**: `cde-release-diff.bench.ts` — 10K-element project release diff < 5 s p95.

#### S75 — COBie 2.4 export + mapping editor
- **Track A**: SPEC-33 lands; ADR-034 lands; `packages/cobie-mapper/` with the 17 COBie sheets (Contact, Facility, Floor, Space, Zone, Type, Component, System, Assembly, Connection, Spare, Resource, Job, Document, Attribute, Coordinate, Issue); per-family parameter mapping config.
- **Track B**: COBie mapping editor UI (`plugins/cobie-mapper-ui/`) — per-family table view of which IFC Pset/parameter feeds which COBie column; live preview of generated COBie.xlsx and COBie.csv.
- **Bench**: `cobie-export.bench.ts` — 5K-element project COBie export < 30 s p95; output file passes the official COBie validator (NIBS).
- **Exit**: `[ ]` 5K-element project produces a valid COBie 2.4 .xlsx that opens in NIBS COBie Toolkit without errors.

#### S76 — Federated clash detection (architectural pass)
- **Track A**: SPEC-34 lands; ADR-032 lands; `apps/clash-engine/` skeleton (Node, headless, BVH-accelerated using `@pryzm/picking` extracted into a shared lib); rule DSL v1 (hard / soft / clearance / penetration); first 20 rules (column-vs-wall, beam-vs-duct stub, slab-vs-pipe stub, etc.).
- **Track B**: clash result browser UI — list, filter by rule, group by element, status (open / approved / rejected / resolved), screenshot capture.
- **Bench**: `clash-engine.bench.ts` — 10K-element federation clash run < 60 s p95.

#### S77 — Federated clash detection (MEP pass) + auto-classification
- **Track A**: rule DSL v1.1 — auto-classification (LLM-assisted via the AI host emission curve from SPEC-31 §3); 50 additional rules; per-discipline rule packs (Architectural, Structural, MEP-HVAC, MEP-Electrical, MEP-Plumbing).
- **Track B**: clash approval workflow — assign-to-discipline, comment thread per clash, mark-resolved flow, re-clash on re-publish.
- **Bench**: `clash-engine-large.bench.ts` — 50K-element federation (3 disciplines) clash run < 5 minutes p95.

#### S78 — MEP HVAC (ducts + system networks)
- **Track A**: SPEC-35 lands; ADR-033 lands; `plugins/mep-hvac/` (store, handlers, producer, committer, tool); duct geometry (rectangular + round + flat-oval); system inheritance graph; sizing engine v1 (ASHRAE 1.A constant-friction); equipment connection (AHU, VAV, diffuser, return); fitting library (elbow, tee, transition, reducer, takeoff).
- **Track B**: HVAC system viewer (system colour-coding, flow-direction arrows, sizing badges); HVAC system panel (per-system supply/return/exhaust mode, design conditions).
- **Bench**: `produce-hvac-system.bench.ts` — 200-fitting HVAC system bake < 1.5 s p95.
- **Joint**: ADR-033 confirms graph-traversal algorithm; sprint-scoped ADR `0040-hvac-sizing-engine.md`.

#### S79 — MEP Electrical (circuits + panel schedules)
- **Track A**: `plugins/mep-electrical/` (store, handlers, producer, committer, tool); cable tray + conduit geometry; circuit logic (panel → circuit → device); panel-schedule generation (NEC + IEC standards optional); load calculation v1.
- **Track B**: panel-schedule viewer (re-uses sheet-engine from S38); circuit-by-circuit colour overlay.
- **Bench**: `produce-electrical-system.bench.ts` — 50-circuit panel bake < 800 ms p95.

#### S80 — MEP Plumbing-System + Sprinkler + Gas
- **Track A**: `plugins/mep-plumbing-system/`, `plugins/mep-sprinkler/`, `plugins/mep-gas/` (each: store, handlers, producer, committer, tool); pipe geometry; flow direction; sizing v1 (Hazen-Williams for water; sprinkler hydraulic calc per NFPA 13 stub); gas line sizing per IGE/UP/2.
- **Track B**: cross-MEP system viewer ("show all wet systems," "show all electrical").
- **Bench**: `produce-plumbing-system.bench.ts` — 100-fitting plumbing system bake < 1.2 s p95.

#### S81 — EIR / BEP / TIDP / MIDP document chain
- **Track A**: SPEC-36 lands; `packages/iso-19650-docs/`: EIR parser (text → structured EIR JSON); BEP generator (EIR JSON + project metadata → draft BEP markdown); TIDP/MIDP scheduler (responsibility matrix + delivery dates).
- **Track B**: document chain UI in `apps/editor/src/iso-19650/`: EIR upload, BEP draft + edit, TIDP/MIDP table editor, status-gate enforcement (cannot enter S2 without approved BEP).
- **Bench**: `eir-to-bep.bench.ts` — 50-page EIR → BEP draft < 30 s p95 (LLM-assisted).

#### S82 — Soft Landings v1 + GSL gates
- **Track A**: `packages/soft-landings/` — gate definitions per RIBA Plan of Work 2020 (Stage 0 Strategic Definition through Stage 7 Use); GSL champion role assignment; client engagement log; POE (Post-Occupancy Evaluation) survey scaffolding.
- **Track B**: Soft Landings dashboard per project; gate-readiness checklist UI.
- **Bench**: none — workflow feature.

#### S83 — buildingSMART certification submission + 4D bridge skeleton
- **Track A**: complete buildingSMART submission package (RV + DTV); engage independent IFC test lab (TUM or KIT); fix every red item from preliminary tests in S73–S82.
- **Track B**: 4D bridge skeleton — `packages/four-d-bridge/` with importers for MS Project XML, Asta P3 XER, Synchro JSON; Gantt sidebar in editor; programme-to-element link table.
- **Bench**: `four-d-link-resolution.bench.ts` — 1,000-element programme link < 200 ms p95.

#### S84 — Phase 4 closeout: cert green, large-fixture re-bench, M42 demo
- buildingSMART certification GREEN (independent lab confirmation) — **non-negotiable Phase 4 exit gate**.
- SPEC-31 §4 Phase-4 checkpoint (largest fixture re-bench): 10K-wall × 50-level + 5,000-MEP-element + federated clash run completes within all M36 baselines + 10% headroom.
- 8-min M42 demo: full ISO 19650 workflow on a real public-sector pilot project (1 case study customer secured by S78 D1 deadline).
- Press: "PRYZM 2 is the first web BIM tool with buildingSMART IFC4 certification + ISO 19650 native CDE + COBie 2.4 export + federated MEP clash."

### §3.4 Phase 4 NFT targets (binding)

| Workload | Cold open | Operation | Target |
|---|---|---|---|
| 10K-element + 5K-MEP federation, 3 disciplines | < 5 s | Full clash run | < 60 s p95 |
| 50K-element + 10K-MEP federation, 3 disciplines | < 12 s | Full clash run | < 5 min p95 |
| COBie export, 5K-element | n/a | Export → valid .xlsx | < 30 s p95 |
| EIR → BEP draft, 50-page EIR | n/a | LLM-assisted draft | < 30 s p95 |
| ISO 19650 status transition | n/a | S0 → S5 | < 10 ms p95 |

Per K3-F: > 10% regression on any of the above halts forward Phase 4 work.

### §3.5 Phase 4 capacity envelope and cut list (per `[strategic ADR-018]` extension)

12 sprints. Cut order if behind by > 3 sprints at S78 D9 retro:
1. Soft Landings v1 (S82) → defer to Phase 5.
2. 4D bridge skeleton (S83) → defer to Phase 5 §3.
3. MEP Gas + Sprinkler (S80 partial) → defer to Phase 5.
4. (Last resort) buildingSMART DTV submission (S83) → keep RV only; DTV submitted in Phase 5.

The non-negotiable items at Phase 4 exit: CDE (S73–S74), COBie (S75), federated clash architectural + MEP (S76–S77), MEP HVAC + Electrical (S78–S79), buildingSMART RV certification (S73–S84).

---

## §4 Phase 5 — Analysis ecosystem + 4D/5D bridges (M43–M48, S85–S96)

**Goal**: at end of M48, PRYZM 2 is the **federation hub for the entire AEC analysis stack**. Customers can author in PRYZM 2 OR import from Revit / Pascal / IFC, then bridge to the best-in-class structural, energy, lighting, and visualisation engines without leaving PRYZM. This collapses 8 separate licences into one workflow.

### §4.1 New SPECs in Phase 5

| SPEC | Scope | Sprint creation |
|---|---|---|
| SPEC-38 | Sheet & schedule extensions for 4D/5D (Gantt sheets, BoQ sheets, cost views) | S85 D1 |
| SPEC-39 | Analysis bridge protocol (`packages/analysis-bridge/`) — uniform IO contract for structural / energy / lighting / acoustic engines | S87 D1 |
| SPEC-40 | Cloud-baked rendering (`apps/render-worker/`) — Cycles + Mitsuba 3 in headless Node; per-frame R2 cache | S91 D1 |
| SPEC-41 | 5D cost integration (`packages/qs-integration/`) — NBS Chorus + RICS NRM2 + Uniclass-keyed rate libraries | S93 D1 |

### §4.2 New strategic ADRs

| ADR | Decision | Sprint |
|---|---|---|
| ADR-036 | Analysis bridge data contract — IFC4 + JSON-LD vs gbXML vs custom MessagePack | S87 D1 |
| ADR-037 | Render-worker engine selection — Cycles only vs Cycles + Mitsuba (research) vs Cycles + LuxCore | S91 D1 |
| ADR-038 | Cost rate library plug-in model — bring-your-own vs marketplace verified vs both | S93 D1 |
| ADR-039 | 4D simulation playback — server-side video render vs client-side timeline replay | S86 D1 |

### §4.3 Sprint-by-sprint (compressed view)

| Sprint | Theme | Key deliverables |
|---|---|---|
| S85 | 4D programme link + Gantt sheets | SPEC-38; programme link finalised; Gantt sheet template; per-element programme-id; multi-programme support |
| S86 | 4D simulation viewer | ADR-039; time-slider; element appearance/disappearance per programme; export-to-MP4 (server) |
| S87 | Analysis bridge protocol | SPEC-39; ADR-036; `packages/analysis-bridge/` with the uniform contract; first integration: Karamba3D (structural) |
| S88 | OpenSees + Code_Aster bridges (structural FEA) | OpenSees Tcl-script generation + result import (.out parsing); Code_Aster MED-format I/O |
| S89 | EnergyPlus bridge (energy + thermal) | gbXML export from PRYZM 2 model; EnergyPlus runner in Docker on bake-worker pod; result overlay (heatmap on elements) |
| S90 | Radiance + DIVA bridges (lighting + daylight) | Radiance .rad export; HDR result import; daylight-factor overlay |
| S91 | Cloud-baked rendering | SPEC-40; ADR-037; `apps/render-worker/` Cycles integration; first photorealistic render < 2 min on M instance |
| S92 | Render UI + presets | preset library (interior / exterior / aerial / dawn / dusk); batch-render queue; per-frame R2 cache; render-history viewer |
| S93 | 5D cost — NBS Chorus + RICS NRM2 | SPEC-41; ADR-038; `packages/qs-integration/`; NBS Chorus REST integration; NRM2-keyed take-off rules |
| S94 | 5D cost — Uniclass mapping + per-element BoQ | element-to-Uniclass-2015 mapping table; per-element BoQ row generation; cost view (sheet template) |
| S95 | Acoustic + CFD bridge skeletons | OpenFOAM CFD bridge stub (research); acoustic bridge stub (Olive Tree Lab Suite optional integration) |
| S96 | Phase 5 closeout: 5-engine integrated demo | one project, one PRYZM 2 model, 5 analysis engines (Karamba3D + EnergyPlus + Radiance + Cycles + NBS Chorus) producing 5 outputs in parallel; 8-min demo screencast |

### §4.4 Phase 5 NFT targets

| Workload | Target |
|---|---|
| Karamba3D structural analysis on 1K-element model | < 30 s end-to-end (PRYZM → Karamba → result back) |
| EnergyPlus thermal analysis on 5K-zone model | < 5 min end-to-end |
| Cycles photorealistic render at 1920×1080, 256 samples | < 2 min on M-instance |
| 5D BoQ generation, 10K-element project | < 30 s |
| 4D simulation MP4 export, 10K-element + 200-task programme | < 90 s for 30-second clip |

### §4.5 Strategic acquisition window (during Phase 5)

| Target | Rationale | Estimated cost | Outcome |
|---|---|---|---|
| **Pascal** (acquisition or talent acquihire) | Absorb the best WebGPU rendering team; eliminate the open-source competitor by making them the free tier | $5M–$15M (early-stage) | "Pascal is now PRYZM Lite, the free tier" — funnel to paid PRYZM. WebGPU expertise into `packages/render-runtime/`. |
| **A small render company** (Lumion alternative or Twinmotion-equivalent open-source like Three Studio) | Path-traced + real-time bridge | $10M–$30M | PRYZM 2 ships native real-time photoreal in `apps/editor` (not just baked render in `apps/render-worker`). |
| **A BIM consultancy** (10–20 people, ISO 19650 specialist) | Standards templates + delivery experience + first 50 enterprise customers | $3M–$8M | "PRYZM Professional Services" arm; instant credibility on UK/EU public sector. |

These three are sequenced — Pascal first (M44), render company second (M46), consultancy third (M48). Total acquisition spend ~$30M–$50M; funded by Series A or revenue (depending on M42 ARR).

---

## §5 Phase 6 — BIM 3.0 foundations: Linked Data + IDS + ICDD + bSDD (M49–M54, S97–S108)

**Goal**: at end of M54, PRYZM 2 is **the first commercial linked-data BIM platform**. Every project has a SPARQL endpoint. Every IDS document validates against the live model. Every property maps via bSDD across jurisdictions. This is the BIM 3.0 leadership claim that no other competitor can match within 12 months because none of them has the open-data architecture to build on.

### §5.1 New SPECs in Phase 6

| SPEC | Scope | Sprint creation |
|---|---|---|
| SPEC-42 | Linked-data layer (`packages/linked-data/`) — RDF triple store backed by Postgres; W3C LBD + BOT vocabularies; SPARQL 1.1 endpoint per project | S97 D1 |
| SPEC-43 | IDS (Information Delivery Specification) 1.0 reader, validator, authoring (`packages/ids-engine/`) | S99 D1 |
| SPEC-44 | ICDD (ISO 21597) Information Container support — read + write `.icdd` files | S101 D1 |
| SPEC-45 | bSDD (buildingSMART Data Dictionary) integration — multilingual property mapping; jurisdiction packs | S104 D1 |

### §5.2 New strategic ADRs

| ADR | Decision | Sprint |
|---|---|---|
| ADR-040 | Triple-store implementation — Apache Jena (Java sidecar) vs Oxigraph (Rust, embeddable) vs custom Postgres-on-Apache-AGE | S97 D1 |
| ADR-041 | SPARQL endpoint authn — anonymous public read vs project-token vs OAuth2-bearer | S98 D1 |
| ADR-042 | IDS authoring UX — visual rule editor vs YAML editor vs both | S99 D1 |
| ADR-043 | bSDD sync policy — pull on edit vs nightly mirror vs hybrid with cache | S104 D1 |

### §5.3 Sprint-by-sprint (compressed)

| Sprint | Theme | Key deliverables |
|---|---|---|
| S97 | Linked-data layer foundation | SPEC-42; ADR-040 (Oxigraph Rust embeddable chosen unless ADR overturns); `packages/linked-data/` triple store wrapping Postgres; W3C LBD + BOT + DICOM imports |
| S98 | SPARQL endpoint per project | ADR-041; `apps/sparql/` Express + Oxigraph; per-project endpoint at `https://{project}.pryzm.app/sparql`; rate-limited; OTel-instrumented |
| S99 | IDS 1.0 reader + validator | SPEC-43; ADR-042; `packages/ids-engine/` reads buildingSMART IDS XML; validates project against IDS specifications; produces violation report with element pointers |
| S100 | IDS authoring UI | visual IDS editor (`plugins/ids-author/`) — drag-drop entity / Pset / property selectors; live-preview validation against current model |
| S101 | ICDD container support | SPEC-44; `packages/icdd-container/` reads + writes `.icdd` files (ZIP + RDF index + linked documents); used as the export bundle for federated handover |
| S102 | ICDD viewer + linked-document overlay | UI: ICDD container viewer; linked-document graph (which doc references which IFC element); cross-document navigation |
| S103 | LBD + BOT enrichment of PRYZM model | every PRYZM 2 element automatically emitted to the triple store as RDF (BOT:Building, BOT:Storey, BOT:Space, LBD:Wall, etc.); change-driven update via committer hook |
| S104 | bSDD integration — read | SPEC-45; ADR-043; pull bSDD vocabularies; map PRYZM 2 properties to bSDD GUIDs; multilingual property labels |
| S105 | bSDD integration — write + jurisdiction packs | ship 10 jurisdiction packs (UK / DE / FR / NL / SG / AU / US-IBC / SA / AE / BR); per-jurisdiction property requirements gate |
| S106 | Linked-data query UI for non-developers | "Show me all walls > 4m thick on level 3" → SPARQL behind the scenes; saved-query library; LLM-assisted query authoring |
| S107 | Federation across N projects via SPARQL | cross-project SPARQL queries (with OAuth2 cross-project consent); use case: "across all my firm's projects, what's the average wall thickness for fire-rated partitions?" |
| S108 | Phase 6 closeout: BIM 3.0 leadership claim | SPARQL endpoint, IDS validation, ICDD export, bSDD mapping all live on a real customer project; press: "first commercial linked-data BIM"; submit talk to buildingSMART International Summit |

### §5.4 Phase 6 NFT targets

| Workload | Target |
|---|---|
| Triple count per project | up to 10M triples without query degradation |
| SPARQL query, simple selection | < 100 ms p95 |
| SPARQL query, federated 3-project join | < 2 s p95 |
| IDS validation on 10K-element model | < 30 s p95 |
| ICDD container export, 50K-element + 100 linked docs | < 60 s p95 |
| bSDD property mapping resolution | < 50 ms p95 (cached) |

### §5.5 Standards leadership work in Phase 6

- **Chair the W3C LBD Community Group** working track on SPARQL-over-IFC (M50–M54).
- **Submit reference IFC4.3 implementation** as MIT-licensed `@pryzm/ifc-reference` to buildingSMART (M51).
- **Co-author the ISO 21597-2:2025 update** with TUM + Fraunhofer on ICDD container linking (M52–M54).
- **Sponsor a buildingSMART Awards 2027 category**: "Best Linked-Data BIM Implementation" (M53).

These four moves position PRYZM as the *reference* implementation for BIM 3.0 standards. Revit cannot match this — they are proprietary; their participation in open standards is performative. PRYZM becomes the Linux of BIM in the same window that Linux became the reference for cloud OS (2003–2008).

---

## §6 Phase 7 — AI design partner + code compliance + digital-twin continuity (M55–M60, S109–S120)

**Goal**: at end of M60, PRYZM 2 is the **only** BIM tool where AI participates at every LOD, code compliance is automated for 4 jurisdictions, and the model continues into operational digital twin via DTDL export. This converts PRYZM from "design tool" to "lifecycle tool" — the Soft Landings + GSL + DT continuity story.

### §6.1 New SPECs in Phase 7

| SPEC | Scope | Sprint creation |
|---|---|---|
| SPEC-46 | AI design partner (`packages/ai-design-partner/`) — staged LOD progression; constraint propagation; rationale graph | S109 D1 |
| SPEC-47 | Code compliance engine (`packages/code-compliance/`) — rule-set DSL; jurisdictional packs (IBC, AD-B, EUROCODE, SBC); violation report | S113 D1 |
| SPEC-48 | DTDL export + IoT bridge (`packages/dtdl-bridge/`) — Azure Digital Twin Definition Language + Azure DT API + open MQTT bridge | S116 D1 |
| SPEC-49 | Specification writer (`packages/spec-writer/`) — element schedule + standard library → NBS Chorus / SpecLink output | S118 D1 |

### §6.2 Sprint-by-sprint (compressed)

| Sprint | Theme | Key deliverables |
|---|---|---|
| S109 | Design partner — Stage 0 → 1 (Strategic → Preparation) | SPEC-46; AI ingests EIR + project brief; produces Stage 1 deliverable (project execution plan + initial massing constraints) |
| S110 | Design partner — Stage 2 (Concept Design / massing) | AI proposes 5–10 massing options against site constraints; Forma-killer feature; integrates Phase 5 environmental analysis |
| S111 | Design partner — Stage 3 (Spatial Coordination) | AI proposes spatial layout; coordinates with structural + MEP system stubs; produces clash-aware schematic |
| S112 | Design partner — Stage 4 (Technical Design / DD + CD) | AI promotes massing → schematic → DD → CD with constraint preservation; rationale graph at every promotion |
| S113 | Code compliance — IBC (US) | SPEC-47; `packages/code-compliance/` rule-set DSL; IBC ruleset (egress, occupancy, fire-rating, accessibility); violation overlay |
| S114 | Code compliance — Approved Documents (UK) | AD-B (fire), AD-K (protection from falling), AD-M (access), AD-O (overheating), AD-Q (security) rulesets |
| S115 | Code compliance — EUROCODE (EU) + SBC (Saudi) | EUROCODE structural compliance; SBC general code; jurisdiction selector per project |
| S116 | Digital-twin: DTDL export | SPEC-48; `packages/dtdl-bridge/` produces DTDL 2.0 from PRYZM model; Azure DT REST API push; round-trip operational property updates back into model |
| S117 | Digital-twin: IoT bridge | open MQTT bridge — sensor data flows in via MQTT topic per element; element property updates per sensor reading; alerting on threshold breach |
| S118 | Specification writer — NBS Chorus | SPEC-49; element schedule + library → NBS Chorus REST POST → spec section creation; per-element spec preview |
| S119 | Specification writer — SpecLink + MasterFormat | US-side: SpecLink / SpecsIntact / MasterFormat output |
| S120 | Phase 7 closeout: lifecycle demo | one project, full lifecycle: EIR → AI-proposed massing → coordinated DD → code-compliant CD → DTDL handover → live IoT data flowing into operational dashboard; 8-min demo |

### §6.3 Phase 7 NFT targets

| Workload | Target |
|---|---|
| AI Stage 1 → 2 (massing proposal, 5 options) | < 90 s p95 |
| AI Stage 3 (spatial coordination, 1K-element) | < 5 min p95 |
| Code compliance scan, full IBC, 10K-element | < 60 s p95 |
| DTDL export, 10K-element | < 30 s p95 |
| MQTT sensor → element-property update | < 200 ms p99 |

---

## §7 Phase 8 — Category definition: BIM OS, decentralised data, vertical packs (M61–M72, S121–S144)

**Goal**: at end of M72, PRYZM is positioned as **the BIM operating system**: editor + CDE + clash + analysis + AI + linked-data + DT continuity + marketplace, on top of which a vertical ecosystem builds. Three vertical packs (healthcare, education, infrastructure) ship. Decentralised data ownership via Solid-Pod-style integration. $100M ARR path locked. Optional Series B/C — or stay independent.

### §7.1 New SPECs in Phase 8

| SPEC | Scope | Sprint creation |
|---|---|---|
| SPEC-50 | Decentralised data ownership (`packages/solid-pod-integration/`) — Solid (Tim Berners-Lee) integration; per-owner WebID; project data hosted in owner's pod; PRYZM is the application, not the storage | S121 D1 |

### §7.2 Vertical packs

| Pack | Sprint window | Scope |
|---|---|---|
| **Healthcare BIM pack** (`plugins/vertical-healthcare/`) | S125–S128 | HBN (Health Building Notes), HTM (Health Technical Memoranda), CDC FGI, room-by-room healthcare programme, infection-control isolation rooms, medical-gas systems |
| **Education BIM pack** (`plugins/vertical-education/`) | S129–S132 | DfE BB103, BB104; LEED for Schools; ESFA gateway; classroom acoustic standards (BB93); accessibility WCAG-built |
| **Infrastructure BIM pack** (`plugins/vertical-infrastructure/`) | S133–S140 | IFC4.3 (rail / road / port / tunnel / bridge); CESMM4 cost; OS-grid coordinate; LandXML; CityGML 3.0 import |

### §7.3 Acquisition integration window (M61–M70)

The Pascal + render-co + consultancy acquisitions from Phase 5 §4.5 complete integration. Plus one more strategic move:

- **A small specification / standards content company** (e.g., NBS-equivalent in a non-UK market): instant content for Spec Writer in 5 jurisdictions. Estimated $10M–$25M.

### §7.4 Pricing model finalisation

| Tier | Price | Target |
|---|---|---|
| **Free / PRYZM Lite** (was Pascal Community) | $0 | Single user, < 5 projects, watermarked exports — *funnel*. |
| **Pro per-seat** | $49/mo or $490/yr | Independent architects, small studios. *Snaptrude-competitive*. |
| **Per-m²** | $0.10/m² of project area, billed at PIM gate | Contractors, engineers. *Qonic-competitive*. |
| **Per-project** | $199/project, unlimited seats, 90-day window | Freelancers, one-off. |
| **Enterprise** | $35,000/yr base + per-seat metered | SSO, audit, self-host, SLA. *Revit-replacement priced 50% below Autodesk*. |
| **Public-sector / Government** | TBD per RFP | UK / EU / Singapore / AU / US federal. |
| **API call pricing** | $0.001/call after 100K free/mo | Headless / public API consumers. |
| **AI metering** | per LLM call, 30% margin pass-through | Founder's auto-grant remains the only exception (per `server/planStore.ts`). |
| **Marketplace take rate** | 20% on plugin/template sales | Compete with Apple App Store on terms (smaller take); winner-take-most network effect. |

### §7.5 Phase 8 NFT targets

| Workload | Target |
|---|---|
| Vertical pack instantiation | new project from healthcare template < 5 s |
| Solid-Pod read/write, per-element | < 100 ms p95 |
| Marketplace plugin install (verified, < 5 MB) | < 10 s |
| Cross-project linked-data query, 50 projects, 50M triples | < 5 s p95 |
| Multi-jurisdiction property auto-mapping (bSDD) | < 200 ms p95 |

---

## §8 Cross-cutting — standards, partnerships, GTM, hires

### §8.1 Standards leadership timeline

| When | Move | Outcome |
|---|---|---|
| M37 | Submit IFC4 RV + DTV certification (buildingSMART) | M42: certification GREEN |
| M44 | Co-author ISO 19650-3:2025 amendment proposal (PIM/AIM transition, with PRYZM as reference) | M48: proposal accepted |
| M50 | Chair W3C LBD CG SPARQL-over-IFC working track | M54: published recommendation |
| M51 | Submit `@pryzm/ifc-reference` MIT to buildingSMART | M52: adopted as reference implementation |
| M52 | Co-author ISO 21597-2:2025 ICDD update with TUM + Fraunhofer | M55: ISO ballot pass |
| M55 | Sponsor buildingSMART Awards 2027 "Best Linked-Data BIM" category | M57: PRYZM-built submissions sweep |
| M58 | Co-found Open BIM 3.0 Consortium with Pascal-absorbed team + bS + W3C | M60: published BIM 3.0 charter |
| M65 | Push BIM 3.0 contractual mandate proposal to UK Cabinet Office | M70: pilot mandate on next 5 government projects |

### §8.2 Hires (cumulative by phase)

| Phase | Critical hires | Total team |
|---|---|---|
| Phase 4 (M37–M42) | 2 senior engineers (CDE + clash); 1 IFC certification specialist; 1 MEP domain expert; 1 enterprise sales | 6 + founder |
| Phase 5 (M43–M48) | 2 analysis-bridge engineers; 1 render engineer; 1 BIM standards lead; 1 acquisitions/BD; Pascal + render-co + consultancy team integration (~25 people) | ~35 |
| Phase 6 (M49–M54) | 2 linked-data / SPARQL engineers (rare hire); 1 W3C standards engineer; 1 IDS author UX designer | ~45 |
| Phase 7 (M55–M60) | 3 AI/ML engineers (design partner); 2 code-compliance engineers per jurisdiction (8 total over 6 months); 1 DT integrator; 1 enterprise CSM | ~65 |
| Phase 8 (M61–M72) | 3 vertical pack leads (healthcare, education, infrastructure); 2 marketplace operations; 4 enterprise sales (regional); 2 product marketing | ~85 |

### §8.3 GTM by phase and region

| Phase | Region | Wedge | Customer count target |
|---|---|---|---|
| Phase 4 (M37–M42) | UK + Singapore | ISO 19650 + buildingSMART certification | 50 paying customers, $5M ARR |
| Phase 5 (M43–M48) | EU (DE/FR/NL) + Australia | Open BIM + analysis bridges | 200 paying customers, $15M ARR |
| Phase 6 (M49–M54) | EU expansion + US enterprise | Linked-data BIM + SOC2 Type 2 | 500 paying customers, $35M ARR |
| Phase 7 (M55–M60) | US enterprise + Saudi/UAE | AI design partner + code compliance | 1,200 paying customers, $60M ARR |
| Phase 8 (M61–M72) | Global verticals + India | BIM OS + vertical packs + marketplace | 4,000 paying customers, $100M ARR |

### §8.4 Funding scenarios

| Scenario | When | Source | Amount | Dilution | Use of funds |
|---|---|---|---|---|---|
| **Bootstrapped path** | Continuous | Revenue | M42 $5M ARR → M48 $15M → M54 $35M | 0% | All hires + acquisitions self-funded after Phase 5 |
| **Series A** | M40 (pre-Phase-5 acquisitions) | VC | $30M–$50M at $200M–$400M valuation | 15–20% | Phase 5 acquisitions (Pascal + render co + consultancy); accelerates GTM |
| **Series B** | M58 (pre-Phase-8 vertical expansion) | VC | $80M–$150M at $1B–$2B valuation | 10–15% | Vertical pack engineering; global GTM; one major strategic acquisition |
| **Strategic exit** | M72+ | Acquisition by Bentley / Trimble / Procore / Hexagon | $1.5B–$5B | 100% | Optional |
| **Independent / IPO** | M84+ | Direct listing or traditional IPO | n/a | Public | If $200M+ ARR achieved |

The bootstrapped path is feasible if Phase 4 hits $5M ARR by M42 — which depends on UK government-pilot conversion. Series A is the safer route; it accelerates Phase 5 acquisitions which would otherwise stretch Phase 5 to 9 months instead of 6.

---

## §9 The four bets that make this work (and the four that kill it)

### §9.1 Bets that make this work

1. **buildingSMART certification before any competitor.** First-mover advantage on the certification badge is permanent; once "PRYZM is buildingSMART-certified" is on the website, every RFP that requires it goes to PRYZM. Phase 4 §3.3 S83.
2. **Linked data as the BIM 3.0 wedge.** No competitor has open-data architecture. By M54 PRYZM is the only commercial linked-data BIM platform. By M58 the standards (W3C LBD CG, ISO 21597, bSDD) are being shaped by PRYZM-affiliated chairs. Phase 6 §5.5.
3. **Federation > authoring.** PRYZM does not need to beat Revit on familiarity; it needs to be the layer above Revit + ArchiCAD + Snaptrude + Pascal. Every competitor's user becomes a feeder. Phase 5 §4.3 + Phase 6 §5.3 S107.
4. **AI as design partner, not element creator.** S50–S54 ships AI as element creator (everyone copies this in 12 months). S109–S112 ships AI as staged-LOD design partner (nobody can copy this in 24 months because none of them has the rationale-graph + constraint-propagation substrate).

### §9.2 Bets that kill this if mismanaged

1. **buildingSMART certification slips past Phase 4 close.** If S83 doesn't ship green certification by M42, the Phase 4 GTM story collapses and Phase 5 acquisitions become unfundable. **Mitigation**: start the cert work at M37 (S73), not M40; engage independent test lab by M38 (S75).
2. **Pascal acquires us instead of vice versa.** If Pascal raises a $40M Series A in 2027 with bS partnership and ships IFC + plan view + marketplace by M48, they could leapfrog PRYZM 2's GA-era moats. **Mitigation**: open acquisition conversations with Pascal team by M40; if no deal, consider a partnership/marketplace integration that absorbs them slower.
3. **Autodesk launches "Revit Web" before M48.** Rumored but not confirmed. If Revit Web ships with native CDE + multi-user + IFC4 in 2028, PRYZM's "first web BIM" wedge weakens. **Mitigation**: Phase 4 §3.4 NFT targets that beat Revit Web before it launches; standards leadership in Phase 6 makes Autodesk's closed-stack Revit Web look anachronistic.
4. **Founder + Replit Agent capacity wall.** Phases 4–8 need 6 → 35 → 45 → 65 → 85 people. If hiring stalls or culture breaks at the 35-person Phase 5 transition, everything downstream slips. **Mitigation**: Phase 5 includes the BIM consultancy acquihire which brings 10–20 senior people in one move; pre-load engineering hires at the start of each phase; first head-of-people hire at M37.

---

## §10 Cross-references

- `08-VISION.md` §6 — PRYZM 2 GA NFT targets that this roadmap extends.
- `10-MASTER-IMPLEMENTATION-PLAN-36M.md` §17 — pre-GA decision table; this roadmap continues the same conventions.
- `04-PRODUCTION-PARITY.md` §6 — definition of production-ready that M36 GA satisfies; Phase 4–8 each define their own definition-of-done in their respective §3.4 / §4.4 / §5.4 / §6.3 / §7.5.
- SPEC-31 §4 — large-fixture checkpoints; Phase 4 §3.4 + Phase 6 §5.4 + Phase 8 §7.5 each add new checkpoints to extend SPEC-31's schedule.
- `[strategic ADR-008]` IFC scope — Phase 4 §3.1 SPEC-37 extends this to certification.
- `[strategic ADR-014]` AI L7.5 operational — Phase 7 §6.1 SPEC-46 extends from element creator to design partner.
- `[strategic ADR-018]` capacity cut list — Phase 4 §3.5 + Phase 5 §4.4 + each subsequent phase define their own cut list using the same ranking discipline.
- `[strategic ADR-024]` constraint solver — Phase 7 §6.1 SPEC-46 design partner depends on this for constraint propagation.

---

## §11 Definition of done for this roadmap

This roadmap (12-BIM-2-AND-3-POST-GA-ROADMAP.md) is **complete** when:

1. SPEC-32 through SPEC-50 (19 SPECs) are written and shipped at the sprints cited in §3 / §4 / §5 / §6 / §7.
2. ADR-031 through ADR-080 are ratified (ADR-031 to ADR-043 are explicitly named here; the remainder are reserved for sprint-scoped decisions discovered during execution).
3. Phase 4 NFT targets (§3.4) GREEN by M42; M42 demo recorded.
4. Phase 5 NFT targets (§4.4) GREEN by M48; 5-engine integration demo recorded.
5. Phase 6 NFT targets (§5.4) GREEN by M54; first commercial linked-data BIM customer in production.
6. Phase 7 NFT targets (§6.3) GREEN by M60; AI-design-partner lifecycle demo recorded.
7. Phase 8 NFT targets (§7.5) GREEN by M72; three vertical packs live; $100M ARR path locked.
8. The four "bets that make this work" (§9.1) all delivered; the four "bets that kill this" (§9.2) all mitigated.

If any of the above slips, the cut list per the relevant phase §X.5 governs the response — never improvise scope reduction.
