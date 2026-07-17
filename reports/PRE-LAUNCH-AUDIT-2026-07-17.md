# PRE-LAUNCH AUDIT — 2026-07-17

> **Scope**: Read-only pre-launch audit of the PRYZM BIM SaaS monorepo ahead of a September 2026 public launch.
> **Mode**: REPORT ONLY — no code or existing docs were modified. Only files under `reports/` were created.
> **Auditor run**: commands were executed read-only (`pnpm audit`, `npm run build`, `npm run test:server`, `npx vitest run`, greps). Raw output is pasted verbatim where available.
> **SPLIT NOTICE**: The two largest verbatim doc dumps (§1.1 V1-LAUNCH-READINESS-AUDIT ≈1.18 MB, §1.2 V1-LAUNCH-IMPLEMENTATION-PLAN ≈447 KB) and the master tracker (§1.3 ≈677 KB) EXCEED a single-file budget. They are copied **verbatim** into companion part-files (byte-identical `cp` of the source) and referenced below. All analysis (§2–§6) and the smaller docs (§1.4–§1.7) are inline in this main file.
>
> Companion files (same `reports/` dir):
> - `PRE-LAUNCH-AUDIT-2026-07-17-part1-V1-audit.md` — verbatim copy of `docs/04-reference/V1-LAUNCH-READINESS-AUDIT.md` (1,182,712 bytes)
> - `PRE-LAUNCH-AUDIT-2026-07-17-part2-V1-plan.md` — verbatim copy of `docs/04-reference/V1-LAUNCH-IMPLEMENTATION-PLAN.md` (446,527 bytes)
> - `PRE-LAUNCH-AUDIT-2026-07-17-part3-master-tracker.md` — verbatim copy of `docs/03-execution/plans/master-execution-tracker.md` (677,162 bytes)

---

## 1. Docs — full raw content

### 1.1 `docs/04-reference/V1-LAUNCH-READINESS-AUDIT.md`
**LARGE — pasted verbatim into `PRE-LAUNCH-AUDIT-2026-07-17-part1-V1-audit.md`** (byte-identical copy, 1,182,712 bytes). It contains 413 `| L-NNN |` issue-log rows (lettered lessons L-A..L-L plus numbered L-01..L-382 with sub-items a–g). Triage of the security/data-loss/unfixed subset is in §2 below.

### 1.2 `docs/04-reference/V1-LAUNCH-IMPLEMENTATION-PLAN.md`
**LARGE — pasted verbatim into `PRE-LAUNCH-AUDIT-2026-07-17-part2-V1-plan.md`** (byte-identical copy, 446,527 bytes).

### 1.3 `docs/03-execution/plans/master-execution-tracker.md`
**FOUND** at `docs/03-execution/plans/master-execution-tracker.md` (677,162 bytes). **LARGE — pasted verbatim into `PRE-LAUNCH-AUDIT-2026-07-17-part3-master-tracker.md`** (byte-identical copy). Note: many other plan/tracker docs also live in `docs/03-execution/plans/` (annual-2026, quarterly-2026-q3/q4, roadmap-phase-1/2/3, residential-building-implementation-tracker, phase-a-completion-snapshot, etc.).

---

### 1.4 `docs/02-decisions/contracts/README.md` (C00 index) — full content

```markdown
# PRYZM — Contract Suite Index (C00)

> **Stamp**: 2026-05-31 · **Refreshed**: 2026-06-01 (folder restructure) · **Status**: CANONICAL
> **Authority**: these contracts govern every implementation decision in PRYZM.
> When code disagrees with a contract, the code is wrong — fix the code **or** open an ADR that supersedes the contract section; never do both.
>
> **Brand note**: "PRYZM 3" appears in some legacy contract bodies to mean "the current architectural epoch". The product name is **PRYZM** (no version suffix) — see [../../NAMING-CONVENTIONS.md §1](../../NAMING-CONVENTIONS.md). The internal epoch label survives only where historical context is the point.

---

## Conflict resolution order (strongest → weakest)

1. `docs/01-strategy/STR-02-product-vision.md` — product + business vision (foundation)
2. `docs/01-strategy/STR-03-engineering-vision.md` — engineering intent and principles (P1–P8)
3. `docs/01-strategy/STR-04-architecture.md` — system shape, lint gates, convergence booleans
4. **This contract suite** — per-subsystem binding contracts (C01–C56 + C24.1)
5. `docs/02-decisions/adrs/` — per-decision rationale (196 ADRs)
6. `docs/03-execution/specs/` — per-system normative specs (82 SPECs)
7. `docs/archive/pryzm3-internal/` — archived PRYZM1/2 planning + contracts (informational only)

Cross-cutting docs that govern the contract suite as a whole:
- `docs/03-execution/plans/master-execution-tracker.md` — the live day-to-day delivery tracker (the former `master-implementation-plan.md` is archived at `plans/legacy/superseded-2026-06-01/master-implementation-plan-2026-05-31.md`)
- `docs/03-execution/status/prior-art-audit-2026-05-31.md` — code-state audit grounding the master plan

If a contract and an ADR disagree, **the contract wins**; the ADR must be updated or a new ADR raised. If a contract and the Vision/Architecture docs disagree, **Vision/Architecture wins**; amend the contract.

---

## Contract status vocabulary + Tier-1 launch gate (L-347)

> Added 2026-07-16 to close the L-347 vocabulary gap: prior to this, contracts were only `DRAFT` or `CANONICAL`, and neither certified that the **shipping code matches** — so a contract could read CANONICAL while prod contradicts it (C08 silent-LWW, C10 un-wired benches). Instructions like "do not launch until C08/C13 are ACTIVE" were therefore un-actionable. This section defines the missing vocabulary.

**Status ladder (each status is strictly stronger than the one above):**

| Status | Meaning |
|---|---|
| **DRAFT** | Authored, not yet ratified. Content MAY be aspirational (describe intended, not-yet-built behavior). A DRAFT contract binds nothing. |
| **CANONICAL** | Ratified + binding as the authority. The contract wins over code and ADRs. **CANONICAL does NOT assert the code conforms** — it asserts the *intent* is settled. A contract can be CANONICAL while prod contradicts it (that is a Known-Violation, logged as an L-item). |
| **ACTIVE** | CANONICAL **AND** the shipping code demonstrably matches the contract **AND** its §6 CI gate (where one exists) is green. **ACTIVE is the only status that certifies code-conformance.** Flipping to ACTIVE requires a passing test as evidence, never inspection. |

**Tier-1 (launch-blocking) contracts.** These govern the properties this product category is judged on (data integrity, collaboration correctness, isolation, performance, durability, privacy). **Launch is blocked until every Tier-1 contract is ACTIVE:**

| Tier-1 contract | Governs | Today |
|---|---|---|
| **C05** Persistence & File Format | save/load integrity, canonical format | CANONICAL (L-334 shipped; L-337 canonical-format decision open) |
| **C08** Collaboration & Security | conflict-safe sync (P8), auth/roles | CANONICAL, **NOT ACTIVE** — code ships silent LWW (L-53/L-335); non-owner access fixed (L-336) |
| **C10** Performance & Observability | NFT budgets, CI-gated benches | CANONICAL, **NOT ACTIVE** — benches not wired into CI (L-341) |
| **C13** Project Lifecycle & Isolation | per-project isolation invariants | CANONICAL, **NOT ACTIVE** — C13-G1…G7 teardown gaps open (L-342) |
| **C48-min** Backup & DR (minimum) | tested restore of a lost project | DRAFT, unimplemented (L-344) |
| **C22-min** Privacy & PII (minimum) | DSAR + residency honesty (EU) | DRAFT, unimplemented (L-345) |

The launch gate that enforces this is **G0-CONTRACTS** on the V1 launch gate board (`docs/04-reference/V1-LAUNCH-IMPLEMENTATION-PLAN.md`): it does not go green until every Tier-1 contract above is ACTIVE. New contracts are classified Tier-1 only by an explicit decision recorded here.

---

## Contract suite

| # | Contract | Governs | Key principle |
|---|---|---|---|
| **C00** | **Index** (this file) | Hierarchy, conflict resolution · Last updated 2026-05-31 (added C24–C30) | — |
| **C01** | [Architecture & Governance](./C01-ARCHITECTURE-AND-GOVERNANCE.md) | 8-layer model, boundary matrix, CI gates, convergence booleans | P1–P8 |
| **C02** | [Composition Root & Boot](./C02-COMPOSITION-ROOT-AND-BOOT.md) | `composeRuntime()`, `PryzmRuntime`, 3-stage boot, disposal. §3.1 F.events Bootstrap Invariant. §3.2 F-1.2 creation dual-write. §3.3 F-1.2 baseline-update dual-write (hosted-element void correctness). | P1, P3 |
| **C03** | [Schemas, Commands & State](./C03-SCHEMAS-COMMANDS-AND-STATE.md) | L0 schemas, command bus, Zustand stores, CQRS + undo. Hosted element schema: see C15. | P5, P6 |
| **C04** | [Rendering & Scheduling](./C04-RENDERING-AND-SCHEDULING.md) | `renderer-three` (single THREE owner), frame scheduler (single rAF), scene-committer | P2, P3 |
| **C05** | [Persistence & File Format](./C05-PERSISTENCE-AND-FILE-FORMAT.md) | `persistence-client`, `.pryzm` file format, project lifecycle, isolation | P6 |
| **C06** | [UI Shell & Tools](./C06-UI-SHELL-AND-TOOLS.md) | `PlatformRouter`, panels, tool registration, camera, keyboard | P1, P4, P6 |
| **C07** | [Plugin SDK & Marketplace](./C07-PLUGIN-SDK-AND-MARKETPLACE.md) | L6 SDK facade, L7 plugin structure, sandbox, Ed25519, marketplace | P1 |
| **C08** | [Collaboration & Security](./C08-COLLABORATION-AND-SECURITY.md) | CRDT sync, explicit conflicts, JWT auth, rate limiting, CORS, ISO 19650 | P8 |
| **C09** | [AI & Visibility Intent](./C09-AI-AND-VISIBILITY-INTENT.md) | AI host (L2), visibility intent (P7), plan critique, cost governance | P7 |
| **C10** | [Performance & Observability](./C10-PERFORMANCE-AND-OBSERVABILITY.md) | 17 NFTs, OpenTelemetry spans, CI gate inventory, DR runbook | P8 |
| **C11** | [Element Creation Pipeline](./C11-ELEMENT-CREATION-PIPELINE.md) | End-to-end orchestration of element creation for both UI-initiated (user gesture → tool → command) and AI-initiated (AI response → ai-host → command) paths; geometry build lifecycle; event-driven room redetection; batch coalescing. **Covers all three views (3D, plan, elevation) and all element types.** **AS-IS gaps updated 2026-05-04**: 5,627ms LONGTASK eliminated ✅; 117/120 `commandManager.execute()` sites bridged ✅; 2 remaining in `engineLauncher` + `RemoteCommandDispatcher`; 4 systematic interior-protocol gaps (OTel, `runtime.events.emit`, `produceWithPatches`, FrameScheduler) apply universally to all 177 handlers — S03 scope. **2026-05-19 amendments**: §6.2 rewritten with real plan-view trigger chain (5-stage storeEventBus mechanism); §6.3 hardened with RedetectRooms infinite-loop anti-pattern; §7.0 documents 3 critical bugs fixed (F-1.4-REDETECT-LOOP, P3.1-CW-PLAN, FT1-C11-SLAB-BOUNDARY); §10 Transitional Bridge Architecture; §11 Per-Element Compliance Matrix with checklist for new element types. Companion gap analysis: `04-PLAN-FORWARD/34-HANDLER-PROTOCOL-GAP-ANALYSIS.md`. | P3, P6, P8 |
| **C12** | [Geospatial & Coordinate Systems](./C12-GEOSPATIAL.md) | LTP-ENU rebasing (1 km recentre trigger), proj4js integration, IfcProjectedCRS read/write, logarithmic depth buffer for large-scale infrastructure projects. **§1.4** the ONE vertical datum boundary (photoreal-globe anchoring, L-259). **§7** (added 2026-07-17, Known-good ACTIVE — [ADR-0268](../adrs/ADR-0268-cesium-3d-tiles-georeferenced-building-placement.md)): georeferenced building placement on the photoreal 3D-Tiles globe (anchor == LTP-ENU origin; photoreal-tile-clamp ground datum, ELLIPSOIDAL WGS-84; seat-and-reveal; §FORMA-FULL-HEIGHT; CesiumThreeBridge camera-only coexistence) — verified live 2026-07-17, baseline `snapshot-cesium-3d-globe-working-2026-07-17`. | P1, P3, P8 |
| **C13** | [Project Lifecycle and Isolation](./C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) | Normative project session model (open/active/close/switch); isolation invariants preventing per-project state (BatchCoordinator, wall-rebuild flags, pending wall events, rAF handles) from leaking across project boundaries; teardown sequence; E2E testability gates; OTel span requirement. **AS-IS gaps**: 7 gaps (C13-G1–G7) — `pryzm-project-switch` only resets `_levelCamReady`; no `forceReset()` on BatchCoordinator; no teardown surface for closure-private flags. Implementation plan: `04-PLAN-FORWARD/35-PROJECT-ISOLATION-WAVE.md`. | P1, P3, P8 |
| **C14** | [Legacy Elimination & PRYZM3 Enforcement](./C14-LEGACY-ELIMINATION-AND-PRYZM3-ENFORCEMENT.md) | Deep audit of `packages/` (80), `plugins/` (46), `scripts/` (27), and `tools/ga-gate/` (15 gates). Catalogues 10 legacy-pattern categories (LP-01–LP-10) found during the 2026-05-16 audit. Classifies every package as COMPLIANT / TRANSITIONAL-ZONE / LEGACY-ZONE. Prohibits all PRYZM1/2 patterns in new code. Maps each pattern to a migration phase. Identifies 5 GA gate gaps (G-NEW-01–G-NEW-05) not yet covered by existing gates. **Key legacy zones**: `@pryzm/ai-host` (44 window-store reads, 20 CustomEvent dispatches), `@pryzm/command-registry` (165 structuredClone undo snapshots, global-bridge.ts), `@pryzm/core-app-model` (92 window accesses, active StoreEventBus), `plugins/annotations` (12 commands using window.xStore fallback). | P4, P5, P6 |
| **C15** | [Hosted Element / Host-Wall Contract](./C15-HOSTED-ELEMENT-CONTRACT.md) | Parametric offset model for doors and windows; opening void geometry lifecycle; wall baseline update dual-write invariant for void correctness; drag constraint (single-axis, HostedElementDragController); OpeningsChildrenMismatch guard; BaselineReversal guard; OTel requirements. **Added**: 2026-05-17, REGRESSION-DIAGNOSIS.md §R2. | P3, P5, P6 |
| **C16** | [Command Authoring Protocol](./C16-COMMAND-AUTHORING-PROTOCOL.md) | The single **front door** for authoring a new command: command anatomy (the two transitional backends — bus handler vs legacy `Command`); the §3 command taxonomy → reference exemplar; the 16 authoring invariants (CA-1…CA-16) and the copy-paste checklist (§10); batch coalescing performance contract (§8); AI-initiated commands (§9). Codifies two **binding doctrines**: **CA-DOCTRINE-L (level-oriented)** — every element command resolves/stamps/registers a `levelId` across the spatial, view, and render-visibility authorities; **CA-DOCTRINE-S (semantic-first)** — the semantic record is canonical and registered before geometry. Substrate contract for the Semantic Design Assistant (§9). **AS-IS**: OI-057 (post-batch wall-join correct but timing-implicit + untested; plugin-store retains pre-miter baselines); G-CA-L/G-CA-S CI gates pending. **Added**: 2026-05-25. | P5, P6, P7, P8 |
| **C17** | [Batch Creation Catalogue & Panel Binding](./C17-BATCH-CREATION-CATALOGUE-AND-PANEL-BINDING.md) | The single **registry** of batch-creation prompts: (a) the canonical catalogue (§4) of every batch command organised in the live `CREATE › Discipline › System › ⚡Batch › item` form (mirrors `CreatePanelLayout.ts CREATE_CONFIG`), (b) one shared NL **prompt string** per entry driving both the CREATE panel label and the AI prompt (§6), (c) the **panel-binding** rules CB-1…CB-8 (batch leaves are additive, dispatch a C16 batch command via `runBatch`, feasibility-gated with "Phase N" tooltips, scope-resolution in the command not the panel). Defines the batch **scope vocabulary** (§3: on-all-slabs, from-level-to-all-floors, per-room, per-facade, per-compartment, project…). Feasible-today (Phase 1, ✅) rows map to existing commands (`CREATE_WALLS_ON_ALL_SLABS`, `CREATE_SLABS_ON_ALL_FLOORS`, `CREATE_MULTIPLE_LEVELS`, `DUPLICATE_FLOOR_PLAN`, `CREATE_GRID_SYSTEM`, detect-rooms, roof-by-region); ⏳ rows unlock per `SPEC-SEMANTIC-DESIGN-ASSISTANT` phases. **§10–§11 = the AS-IS dispatch reference** (analysed 2026-05-25 before implementation): live path is `commandManager.execute` (Path A, the AIPanel path), per-command class + constructor args + bus-type + scope/selection resolution + preconditions + gaps (G-D1 DELETE_ALL_GRIDS has no command class; G-D2 DuplicateFloorPlan needs a target picker). Governed by C16. **Added**: 2026-05-25. | P6, P8 |
| **C18** | [Element Preview Visual Contract](./C18-ELEMENT-PREVIEW-VISUAL-CONTRACT.md) | The visual appearance of every creation / placement **preview** ("ghost") shown while drawing or placing an element, in all views (3D, plan, elevation/section, split). Unifies preview colour via `PREVIEW_COLOR` (3D) + `PREVIEW_CSS` (2D `<canvas>` handlers + snap markers), records out-of-scope colours (§2.4), preview parity (§5). Companion to C04/C06/C11. **Status**: CANONICAL. **Added**: 2026-05-22. | P4, P6 |
| **C24** | [Sheet Composition Engine](./C24-SHEET-COMPOSITION-ENGINE.md) | Governs the existing `plugins/sheets/` (PRYZM 2 S37 / ADR-0031) plus gap-fill to migrate it under the PRYZM 3 layered model. Codifies invariants for SheetStore, viewports, title blocks, widgets, book/sheet-set, and the rendering pipeline that produces vector output. Audit verdict: **AUDIT + EXTEND** (SheetStore + 11+ handlers + viewport + title-block + view-renderer + 6 widget types + book-exporter IMPLEMENTED; gaps are vector PDF backend, DXF backend, sheet UI in editor, dimension+annotation integration into sheets, section/elevation viewports). **Added**: 2026-05-31. | P2, P3, P5, P6, P8 |
| **C24.1** | [Auto-Documentation Sheets Protocol](./C24.1-AUTO-DOCUMENTATION-SHEETS-PROTOCOL.md) | The AUTO sibling of C24: governs AUTOMATIC generation of a documentation SET (per-level plans · 4 building elevations · per-level set-out plans · per-room cropped plan + interior elevations) auto-placed on numbered sheets, PDF-ready. PURE deterministic decision layer `DS1`–`DS6` (`buildSheetFromViews` · `computeBuildingElevationMarks` · `roomCropRegion`/`computeRoomInteriorElevationMarks` · `set-out` dim mode · `planDocumentationSet`) IMPLEMENTED + tested (ai-host 2082/2082); editor wiring (docSheets executor + `sheet.export.pdf`) pending. Coverage rule (no silent room omission), `A-1xx/2xx/3xx/4xx` numbering, rule-based label placement (force-directed deferred), C34 styles, C29 vector PDF. **Status**: DRAFT 2026-06-09. | P5, P6, P8 |
| **C25** | [IFC Export (Production-Grade)](./C25-IFC-EXPORT-PRODUCTION.md) | Governs the existing `plugins/ifc-export/` (PRYZM 2 Phase 3-B Sprint S56) plus gap-fill to reach production-grade IFC4X3 coverage. Codifies invariants for `IFC4X3Exporter`, per-entity exporters, `IFCMetaStore` round-trip, Pset authoring, spatial structure completeness, classification, COBie. Audit verdict: **AUDIT + EXTEND** (IFC4X3Exporter + 6 element exporters + Pset round-trip IMPLEMENTED; gaps are IfcSite/IfcSpace/IfcZone/IfcFurniture coverage, IfcAnnotation, classification, COBie). **Added**: 2026-05-31. | P5, P8 |
| **C26** | [Revit Round-Trip](./C26-REVIT-ROUND-TRIP.md) | Bi-directional `.rvt`/`.rfa` ↔ `.pryzm` via IFC4 as canonical interchange, plus an optional external Python adapter for Revit-API-specific extensions (phasing / worksets / design options). No `.rvt` parsing in monorepo. Family mapping table, parameter translation via `IfcPropertySet`, level/view/sheet translation, 10-project reference suite for round-trip diff testing. Audit verdict: **GENUINELY NEW** — no Revit code in monorepo. **Added**: 2026-05-31. | P5, P8 |
| **C27** | [BIM 3.0 Inspect Model](./C27-BIM3-INSPECT-MODEL.md) | Spatial-intelligence inspection surface: master tree (Site → Building → Level → Apartment → Room → ElementType → ElementInstance), selection-driven isolation via `packages/visibility/` (P7), graphical dashboards per node type. `InspectSelectionStore` + `IsolationVisibilityIntent` + `SpatialRelationshipResolver` + `IsolationAnimator`. Coexists with `plugins/ifc-inspector/` (becomes element-instance sub-panel) and supersedes the flat `apps/editor/src/ui/PropertyInspector.ts` with documented migration plan. Audit verdict: **GENUINELY NEW** with migration of existing 80-file flat inspector. **Added**: 2026-05-31. | P3, P6, P7, P8 |
| **C28** | [Data Panel & Automation](./C28-DATA-PANEL-AND-AUTOMATION.md) | Live data layer for `check / automate / update / review`. Wraps the existing `plugins/schedules/` (PRYZM 2 S41 / ADR-0032) and adds: (a) unified grid across all element types, (b) quality-rules engine sourcing 266+ rules from the 248+ constraint DB + dimensional G-classes + topology A-classes, (c) bulk-edit commands through commandBus (P6). Tier 1/2/3 rule execution (on-edit / on-save / on-demand). Export to Excel/CSV/JSON/IFC-Pset/SQL. Cron scheduling + email-on-violation. Audit verdict: **AUDIT + EXTEND** (Schedule store + 6 handlers + formula DSL + reactive table + CSV/XLSX IMPLEMENTED; quality-rules + bulk-edit + unified grid are the gaps). **Added**: 2026-05-31. | P5, P6, P8 |
| **C29** | [PDF Vector Export](./C29-PDF-VECTOR-EXPORT.md) | Fills the typed-stub `packages/drawing-primitives/src/backends/pdf.ts` (PRYZM 2 ADR-0029) with a true vector PDF writer via `pdf-lib`. Font embedding, line-weight calibration, PDF/A-3 compliance, optional IFC-embed (single-deliverable PDF + IFC). Print-calibration test harness (1m × 1m validation). Audit verdict: **FILL TYPED STUB**. **Added**: 2026-05-31. | P5, P8 |
| **C30** | [Drawing Set Management](./C30-DRAWING-SET-MANAGEMENT.md) | Aggregates Sheets ([C24](./C24-SHEET-COMPOSITION-ENGINE.md)) into SheetSets with revision tracking, issue register, transmittal package (single PDF/A-3 cover + drawing register + N sheets via [C29](./C29-PDF-VECTOR-EXPORT.md)), automatic sheet numbering. Revision status state machine (`draft → issued → superseded`, one-way). Revision-cloud annotations bound to revision ids. Audit verdict: **AUDIT + EXTEND** (`plugins/sheets/src/book/book-exporter.ts` PRYZM 2 S37 implements multi-sheet composition; revision tracking + issue register + transmittal generator are gaps). **Added**: 2026-05-31. | P6, P8 |
| **C31** | [Documentation Authoring Protocol](./C31-DOCUMENTATION-AUTHORING-PROTOCOL.md) | The binding rules for how every document in `docs/` is written, named, structured, versioned, and superseded. Anatomies for contract / ADR / spec / plan / status / guide / reference. Filename patterns enforced by `check-doc-naming.ts`. Immutability of sealed docs enforced by `check-{adr,contract,snapshot}-immutability.ts`. **Added**: 2026-06-01. | (cross-cutting — all P) |
| **C19** | [Site Model & Parcel](./C19-SITE-MODEL-AND-PARCEL.md) | Site · parcel · building-footprint · context-buildings · zoning. One Site per Project. Site is read-only outside dedicated edit commands. Footprint MUST lie inside parcel minus setbacks. Companion to C12 (which owns coordinate transforms). **Status**: CANONICAL (ratified 2026-07-16). 11 invariants. | P5, P6, P8 |
| **C20** | [Building & Apartment Aggregates](./C20-BUILDING-AND-APARTMENT-AGGREGATES.md) | Building → Level → Apartment → Room hierarchy formalisation. Today single-Building + single-Level apartments (multi-Building deferred to C20.1, multi-Level apartments to C20.2). Parameter propagation via D-α-3. Wraps C13 lifecycle with architectural hierarchy. **Status**: CANONICAL (ratified 2026-07-16). 13 invariants. | P5, P6, P8 |
| **C21** | [Climate Ingestion](./C21-CLIMATE-INGESTION.md) | EPW (priority 1) · NOAA normals (fallback) · solar position (recomputed) · wind rose · temp/humidity/precipitation. Per-site cache keyed at 0.01° rounded lat/lon. Climate is read-only — only ingestion replaces. Companion to C12 + C19. **Status**: CANONICAL (ratified 2026-07-16). 12 invariants. | P5, P8 |
| **C22** | [Privacy & PII Tier](./C22-PRIVACY-AND-PII-TIER.md) | DataTier separation: PII · PROJECT · TELEMETRY · DERIVED. GDPR · CCPA · DSAR ≤ 30 d · right-to-delete ≤ 90 d cascade. BYOK deny-default. Region residency. Breach notification ≤ 72 h. Companion to C08 (auth) + C23 (provenance). **Status**: DRAFT 2026-06-01. 12 invariants. | P5, P6, P8 |
| **C23** | [Provenance & AI Audit](./C23-PROVENANCE-AND-AI-AUDIT.md) | Every AI artefact records model · prompt · context-hash · cost · timestamp · user · project. Provenance graph links AI calls to produced elements. 7-year retention. Append-only. PII redaction in prompts. Reproducibility status (deterministic + seed, or non-deterministic flagged). Companion to C09 (AI cost) + C22 (PII redaction) + C10 (OTel). **Status**: DRAFT 2026-06-01. 13 invariants. | P5, P6, P8 |
| **C32** | [DXF / DWG Round-Trip](./C32-DXF-DWG-ROUND-TRIP.md) | Bi-directional AutoCAD DXF + DWG interchange. ASCII DXF for canonical write; ODA DWG conversion via licensed library. Layer mapping + linetype + block library. Reference suite of 10 third-party DXFs for round-trip diff testing. **Status**: DRAFT 2026-06-01. | P5, P8 |
| **C33** | [Rhino Interchange](./C33-RHINO-INTERCHANGE.md) | 3DM round-trip + Grasshopper bridge (definitions consumable from PRYZM AI host). NURBS preservation through interchange; mesh fallback for non-NURBS-capable consumers. **Status**: DRAFT 2026-06-01. | P5, P8 |
| **C34** | [Print & Drawing Standards](./C34-PRINT-AND-DRAWING-STANDARDS.md) | Sheet sizes · linetypes · scales · north arrow · title-block conventions per AIA / RIBA / DIN / NF / JIS / UNE / ABNT / GB / ISO 19650. Companion to C24 (sheet engine) + C46 (locale defaults). **Status**: DRAFT 2026-06-01. | P5 |
| **C35** | [COBie FM Handover](./C35-COBIE-FM-HANDOVER.md) | Facility-management handover export. Equipment lists · maintenance schedules · asset tagging · Tier-1 IFC + COBie Pset coverage. Companion to C25 (IFC). **Status**: DRAFT 2026-06-01. | P5, P8 |
| **C36** | [Clash Detection & Coordination](./C36-CLASH-DETECTION-AND-COORDINATION.md) | Federated clash detection across multi-discipline models. BCF round-trip companion. Tolerance-based intersection tests. Per-clash severity + workflow assignment. **Status**: DRAFT 2026-06-01. | P5, P8 |
| **C37** | [Schedule / 4D](./C37-SCHEDULE-4D.md) | Construction-phase scheduling export. Gantt visualisation + time-based phasing + animation. Phase model shared with C38. **Status**: DRAFT 2026-06-01. | P5, P6, P8 |
| **C38** | [Cost / 5D](./C38-COST-5D.md) | Quantity takeoff (from C25 Qto Psets) × pricing tables (RSMeans / BCIS / Spon's / custom) → cost estimate. Roll-up per CSI / NRM2 / Uniformat II. Excel / CostX / Bluebeam / SAP exports. **Status**: DRAFT 2026-06-01. 14 invariants. | P5, P6, P8 |
| **C39** | [Pricing & Plan Tiers](./C39-PRICING-AND-PLAN-TIERS.md) | Solo / Studio / Mid-firm / Enterprise tiers · entitlement registry · quota counters · billing state machine · trial / dunning / pause. Every feature gate flows through one resolver. Companion to C40 (developer payouts) + C42 (support SLA). **Status**: DRAFT 2026-06-01. 14 invariants. | P1, P5, P6, P8 |
| **C40** | [Marketplace Economics](./C40-MARKETPLACE-ECONOMICS.md) | Developer 70 % / PRYZM 30 % split · monthly payout via Stripe Connect · 14-day refund reserve · chargeback handling · tax-form gating · review-fraud + payout-laundering detection · established-developer status · curated vs. open categories. Companion to C39 + C07. **Status**: DRAFT 2026-06-01. 15 invariants. | P5, P6, P8 |
| **C41** | [Telemetry & Analytics](./C41-TELEMETRY-AND-ANALYTICS.md) | Three event tiers (Essential / Product / Marketing) · jurisdiction-aware consent defaults · pseudonymous ids via PII bridge · DSAR export + 90-day erasure cascade · retention schedule per tier · sampling for high-volume events. Sibling to C10 (operational spans). **Status**: DRAFT 2026-06-01. 15 invariants. | P5, P6, P8 |
| **C42** | [Customer Support Tier](./C42-CUSTOMER-SUPPORT-TIER.md) | Four channels (in-product / email / priority email / named CSM) · severity-tier SLAs · break-glass PII access with audit · refund/credit authority · SEV-1 post-mortem within 5 days · CSAT + NPS measurement · status page + monthly trust report. **Status**: DRAFT 2026-06-01. 15 invariants. | P5, P6, P8 |
| **C43** | [Accessibility (WCAG 2.2 AA)](./C43-ACCESSIBILITY.md) | Every UI surface meets WCAG 2.2 AA · 3D canvas bounded-responsibility (alternatives via property panel + inspect tree) · keyboard exhaustive · ARIA via single announcer service · reduced-motion + contrast policy · annual external audit + quarterly VPAT · documents carry accessibility metadata. Siblings C44 / C45 / C46. **Status**: DRAFT 2026-06-01. 15 invariants. | P5, P6, P8 |
| **C44** | [Mobile & Tablet](./C44-MOBILE-AND-TABLET.md) | Desktop + large-tablet primary; smaller form-factors are read-only viewer + form-only admin. Four breakpoints, four capability levels per surface. Bounded gesture vocabulary. Share-link viewer works on every form-factor. PWA install (no native app). **Status**: DRAFT 2026-06-01. 15 invariants. | P3, P5, P6, P8 |
| **C45** | [Browser & Device Matrix](./C45-BROWSER-AND-DEVICE-MATRIX.md) | Three browser tiers (fully tested / best-effort / unsupported) · per-version cutoff schedule with 30-day notice · hardware floor (WebGL2 / 8 GB RAM) · WebGPU opt-in rollout · AT compatibility matrix · per-release device-fleet QA · public support page. **Status**: DRAFT 2026-06-01. 15 invariants. | P5, P6, P8 |
| **C46** | [i18n & L10n](./C46-I18N-AND-L10N.md) | Eight TIER 1/2/3 locales · per-app messages/<locale>.json with en-US baseline · Intl-only formatting · RTL via CSS logical properties · architectural-units doctrine (project unitSystem vs. user display preference) · AI host locale-aware · IFC export's locale-aware units · per-locale drawing standards. **Status**: DRAFT 2026-06-01. 15 invariants. | P5, P6, P8 |
| **C47** | [File-Format Versioning](./C47-FILE-FORMAT-VERSIONING.md) | `.pryzm` formatVersion (SemVer) · 24-month backward-compat commitment · MAJOR-boundary migration runners · forward-only-fields tracking · writer signature attestation · per-element schema versioning · pre-migration originals preserved in backup tier. Companion to C05 (file content); C47 = lifecycle. **Status**: DRAFT 2026-06-01. 15 invariants. | P5, P6, P8 |
| **C48** | [Backup & Disaster Recovery](./C48-BACKUP-AND-DR.md) | Three data classes (Project / Billing / Telemetry) with class-specific RPO + RTO · hot / warm / cold tier retention · cross-region replication (sovereignty-bounded) · self-serve version history (90 days) · per-failure-mode runbooks · quarterly DR drill · continuous backup integrity verification. **Status**: DRAFT 2026-06-01. 15 invariants. | P5, P6, P8 |
| **C49** | [Multi-Region & Sovereignty](./C49-MULTI-REGION-AND-SOVEREIGNTY.md) | Four regions (EU / US / AP / UK) · per-org primary region binding · sovereignty-bounded failover (never cross sovereignty) · cross-region access gate (3 documented scenarios: DR / break-glass / migration) · region-scoped auth tokens · customer-initiated migration workflow · trust-page sovereignty section. Sibling to C48. **Status**: DRAFT 2026-06-01. 15 invariants. | P5, P6, P8 |
| **C50** | [Typology Pipeline](./C50-TYPOLOGY-PIPELINE.md) | The multi-typology generative-AI pipeline substrate. `TypologyRegistry` (one per runtime) + 7-stage `PipelineRouter` (brief → site → constraints → generative → validators → cognition → bim-emit). Stage 4 mandatory; others default to no-ops. AI-vs-deterministic engine selection deterministic per input. Plan-tier gate is soft-fail; programmer errors throw. Pure orchestration (no I/O); pack adapters live in apps/editor. Codifies the invariants A.1 implements (`packages/typology-pipeline/`, commit `172fc8c`, 54 tests). **Status**: DRAFT 2026-06-01. 14 invariants. | P1, P5, P6, P8 |
| **C52** | [Editable Building Graph](./C52-EDITABLE-BUILDING-GRAPH.md) | The normative form of [ADR-0061](../adrs/ADR-0061-building-graph-bidirectional-edit-substrate.md). The Living Building Graph as a **bidirectional edit substrate** (tracker A.26, "BIM 2.0/3.0"): a graph-node edit produces a structured PER-NODE layout-constraint delta that re-runs the EXISTING deterministic engine through the EXISTING generate trigger; the regenerated layout re-projects back into the graph. §2 editable attributes (area E1 ✅ · occupancy/type E2 ✅ · adjacency-pref E3 · sun/acoustic E4) each bind to an engine input the layout engine already consumes (no parallel knob). §3 write-path discipline (stash → `gatherLayoutPayload` merge → `triggerApartmentLayout`; P6; no parallel mutator/scorer). §4 invariants I1–I4 (deterministic · per-node override defaults to a no-op ⇒ byte-identical baseline · all mutation via command bus · cause/effect direction). Sibling of C20 (the read-only aggregate hierarchy made editable) + C50 (the engine the edits re-run). **Status**: CANONICAL 2026-06-08. | P1, P5, P6, P8 |
| **C53** | [Generative Layout Engine Architecture](./C53-GENERATIVE-LAYOUT-ENGINE-ARCHITECTURE.md) | The binding AS-IS→TO-BE architecture of the deterministic generative residential layout engine. **L-PRINCIPLE** (merge-blocking): strict separation of **Topological Graph Logic** (dimensionless rooms/adjacencies/program) from **Geometric Solvers** (walls/coordinates) — topology is truth, geometry a pure projection (invariants L1–L4). 6-tier pipeline (boundary → topology → vertical-stack → geometric-solver → emission → evaluation), typed data contract (`SemanticLayoutGraph` topology vs `ParametricBIMElement` geometry), determinism (ADR-0061) + **slider-as-intent** (UI controls modify graph weights, NEVER absolute dimensions — the reactivity-bug cure, §6), 3 deterministic variants (Core-Centric / Perimeter-Spread / Courtyard), Pareto scoring (circulation/acoustic/environmental), 5 CI gates, M0–M9 migration (M0/M1 shipped v69/v70). Governs SPEC-TGL / SPEC-APARTMENT-LAYOUT-GENERATOR / MASTER + the founder SPEC v3.0. **Status**: DRAFT 2026-06-08. | P1, P5, P6, P8 |
| **C51** | [Apex/App Deployment Split](./C51-APEX-APP-DEPLOYMENT-SPLIT.md) | The normative form of [ADR-0255](../adrs/ADR-0255-one-pryzm-cloudflare-supabase.md) §0. ONE codebase (`apps/editor/`) → TWO deploy artifacts: **apex** (`pryzm.so`, static pre-rendered marketing, sub-100 ms first paint, NO auth/DB/PII) + **app** (`app.pryzm.so`, SPA + server, strict CSP, EU region in Phase A, cookies scoped to `Domain=app.pryzm.so`, Supabase Pro PITR for paying customers). Codifies the DNS map (§4), the route table (§5), the build contract (§6: `pnpm build:apex` ≤ 200 KB + `pnpm build:app`), and 5 planned CI gates (§7) so the ADR-0252 drift trap cannot recur. **Status**: CANONICAL 2026-06-02. | P1, P5, P6, P8 |
| **C55** | [Geodata Analytical Layers](./C55-GEODATA-ANALYTICAL-LAYERS.md) | The normative form of [ADR-0065](../adrs/ADR-0065-geodata-analytical-layers-pluggable-provider.md). The Hektar-style **analytical geodata layer subsystem** on the Forma 3D site view — national open-data layers (flood 100/200/max · landslide · slope · terrain shading · soil · ground coverage · property/detail plans · ancient monuments · drainage basins · population per km² · noise · Natura 2000) **draped** over the Cesium terrain + white massing, each a **toggle + opacity slider**, grouped by country, sourced through a **pluggable `GeodataProvider` abstraction** (reference adapter = Sweden Lantmäteriet + SGU; generic OGC fallback). 9 invariants: declarative descriptor (§1.1); layers DRAPE never become BIM (§1.2); pluggable providers — no country hardcoded in core (§1.3); graceful per-layer absence (§1.4); mandatory per-source **attribution** as provenance (§1.5, C23); C22 **PII tier** on population/noise (§1.6); lazy-load + tile + **opacity-without-re-fetch** perf (§1.7); feeds analysis via EXISTING consumers, no parallel objective (§1.8, future flood/landslide-keep-out seam); L1/L2 `geodata-layers` package + renderer-three drape + editor panel via `geodata.*` commands (§1.9). Companion to C19 (Site) + C21 (Climate) + C54 (wind CFD sibling layer) + C12 (coords); cross-refs C22/C23/C45/C49. **Status**: DRAFT 2026-06-09. | P2, P3, P4, P5, P6, P8 |
| **C56** | [AutoDimension Engine](./C56-AUTODIMENSION.md) | The normative form of [ADR-0118](../adrs/ADR-0118-autodimension-engine.md). PRYZM's **deterministic AutoDimension engine** — the missing intelligence layer between the existing output half (`DimensionString` schema + `produceDimensions` + `evaluateDimensions` + plan-view render loop) and input half (`JunctionResolverV2` graph + `PlanarTopologyEngine` perimeter/room rings + `WallOccupancyStore` opening spans). A new **L2 PURE** package `@pryzm/auto-dimension` runs a deterministic **8-stage pipeline** (connectivity graph → segmentation → opening analysis → chain planning → chain geometry → placement → conflict resolution → QA) and returns a complete, deduplicated, stacked, QA'd `DimensionString[]`. 8 invariants: same geometry → byte-identical output, **NO AI/ML/LLM** (§1.1); the 8-stage pipeline + string-planner registry (§1.2); completeness DI-1…DI-6 — overall dims exist, every opening located+sized, every wall break ticked, **never dimension the same distance twice**, no avoidable overlap/crossing, QA rejects incomplete docs (§1.3); package boundary — L2 pure (no THREE/DOM/I-O/RNG), consumes L0 `@pryzm/schemas` + pure wall-graph algorithms, returns `DimensionString[]`, editor executor the only impure surface dispatching via command bus (P6) in one `runBatch` for single-undo (§1.4); rule-based placement, v1 overlap OK but RNG never (§1.5); determinism mechanics — stable ordering + ULID tie-breaks per ADR-0061 (§1.6); OTel span per exported fn (§1.7, P8); layered placement (§1.8). Companion to C24.1 (this is its missing dimension provider) + C34 (injected styles); cross-refs C03/C11/C15/C24 + ADR-0055/0061. **Status**: DRAFT 2026-07-06 (L-138). | P2, P4, P5, P6, P8 |
| **C54** | [In-Browser Wind CFD](./C54-IN-BROWSER-WIND-CFD.md) | The normative form of [ADR-0064](../adrs/ADR-0064-in-browser-wind-cfd-webgpu-lbm.md). An in-browser pedestrian-wind / wind-comfort solver — a WebGPU Lattice-Boltzmann (LBM) flow simulation around the site's buildings, client-side (no cloud/queue), tens of seconds, for early-stage comfort assessment (recirculation, roof-edge separation, corner accelerations). 8 invariants: the **honesty rule** (BETA + sheltered-zone calibration status MUST be surfaced, §1.1); WebGPU compute boundary with graceful no-WebGPU soft-fallback to the wind-rose overlay (§1.2); determinism per config (§1.3); **AIJ benchmark validation as a CI release gate** (Case-B r ≥ committed ≈0.84, §1.4); domain/inlet from the C19 Site + C21 wind rose, not hand-authored (§1.5); results refine the EXISTING wind driver / E.4 `naturalVentilation` input, no parallel objective (§1.6); tens-of-seconds perf + client-side privacy (§1.7); new L1/L2 compute package rendered via renderer-three, launched via `windcfd.*` commands (§1.8). Companion to C19 (Site) + C21 (Climate) + C12 (geospatial); cross-references SPEC-ENVIRONMENTAL-DESIGN-DRIVERS §3/§5 + SPEC-FORMA-SITE-VIEW §6. **Status**: DRAFT 2026-06-09. | P2, P3, P5, P6, P8 |

---

## Conventions used across all contracts

- **MUST / MUST NOT / SHALL / MAY** — RFC 2119 normative terms.
- **[ADR-NNN]** — links to `docs/02-decisions/adrs/ADR-NNN-*.md`.
- **[SPEC-NN]** — links to `docs/03-execution/specs/SPEC-NN-*.md`.
- **CI gate: hard-fail** — a merge-blocking lint or test failure.
- **CI gate: soft-fail** — a counter tripwire; becomes hard-fail at the stated phase exit.

---

## How to amend a contract

1. Edit the relevant `C0N-*.md` directly. Do NOT create a new `*-AUDIT.md` alongside it.
2. If the change alters a CI gate or convergence boolean, update `docs/01-strategy/STR-04-architecture.md §8` and `03-CURRENT-STATE.md §1` in the same commit.
3. If the change reverses an ADR decision, raise a superseding ADR first; then amend the contract to cite the new ADR.

---

## What is NOT a contract

- Sprint plans → `docs/archive/pryzm3-internal/04-PLAN-FORWARD/`
- Current status → `docs/archive/pryzm3-internal/03-CURRENT-STATE.md`
- Per-decision rationale → [`../adrs/`](../adrs/)
- Per-system normative spec → [`../../03-execution/specs/`](../../03-execution/specs/)
- Implementation plans → [`../../03-execution/plans/`](../../03-execution/plans/)

## Gaps + roadmap

- **57 contract files exist (C01–C56 + C24.1), no numbering gaps** (refreshed 2026-07-16). C01–C18 CANONICAL; C19–C23 + C32–C56 largely DRAFT pending stakeholder sign-off; C24–C31 + C50–C55 a mix (see each file's Status line). The full enterprise-grade contract suite proposed by [MISSING-CONTRACTS-AUDIT-2026-06-01.md](../MISSING-CONTRACTS-AUDIT-2026-06-01.md) (18 gaps C18–C49) is now **entirely built** — that audit is RESOLVED.
- **DRAFT → CANONICAL** transitions ratify on first PR after stakeholder sign-off + the implementation has passed the contract's §6 CI gates.
- Per-decision rationale → `docs/02-decisions/adrs/`
- Per-system normative spec (wire format, schema tables) → `docs/03-execution/specs/`
```

---

### 1.5 `docs/02-decisions/MISSING-CONTRACTS-AUDIT-2026-06-01.md` — full content
(glob `docs/02-decisions/MISSING-CONTRACTS-AUDIT*.md` matched exactly one file)

```markdown
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
```

---

### 1.6 Architecture doc — full content
`docs/01-strategy/architecture.md` and `docs/03_PRYZM3/02-ARCHITECTURE.md` do NOT exist. The real architecture doc is `docs/01-strategy/STR-04-architecture.md` (pasted below verbatim). A companion `docs/01-strategy/STR-05-architecture-breakdown.md` also exists (not pasted — see repo).

```markdown
# PRYZM — Architecture

> **Stamp**: 2026-06-01 · **Status**: CANONICAL · **Rewrite basis**: full code audit, 2026-06-01.
> **Authority**: this doc owns the system shape, the boundary lint matrix, the composition root contract, the convergence definition, and the CI gates. **When code disagrees with this doc, the code is canonical** — this doc is the description, not the law; if it drifts from code, this doc is updated.
> **Foundation above**: [STR-01-manifesto.md](./STR-01-manifesto.md) → [STR-02-product-vision.md](./STR-02-product-vision.md) → [STR-03-engineering-vision.md](./STR-03-engineering-vision.md)
> **Per-package detail**: [STR-05-architecture-breakdown.md](./STR-05-architecture-breakdown.md)
> **Contracts**: [../02-decisions/contracts/](../02-decisions/contracts/) — 49 ratified contracts (C01–C49)

---

## §0 — How to read this doc

This doc describes PRYZM's architecture **as it exists in code at 2026-06-01**. The counts, file paths, and behaviours below are auditable against the repository. When the code changes, this doc must change in the same commit (per [operating-principles O4 + O5](./STR-06-operating-principles.md)).

The doc is intentionally short. Per-package detail lives in [STR-05-architecture-breakdown.md](./STR-05-architecture-breakdown.md); per-decision rationale in [02-decisions/adrs/](../02-decisions/adrs/); per-subsystem rules in [02-decisions/contracts/](../02-decisions/contracts/).

---

## §1 — The layered model

PRYZM organises code into **nine production layers** (L0–L9) plus a transitional legacy zone (L7.5). Each layer has owner packages, a clear responsibility, and an enforced import allowlist.

```
┌──────────────────────────────────────────────────────────────────────┐
│  L7.5  src/  (7 files, 0 subdirs)  — TRANSITIONAL                    │
│         monotonically shrinking; current state = boot-shell.d.ts,    │
│         browser-entry.tsx, browser.css, familyCreatorPlaceholder.ts, │
│         global-window.d.ts, main.ts, three-addons.d.ts               │
│                                                                       │
│  L9    plugins/* (47)            ← may only import L8                │
│  L8    packages/plugin-sdk/      ← public SDK facade (@pryzm/sdk v1) │
│  L7    apps/* (13)               ← per-app UI surfaces                │
│  L6    packages/runtime-composer/, packages/ui-base/                  │
│  L5    packages/file-format/, packages/view-state/                    │
│  L4    packages/renderer/, render-runtime/, scene-committer/,         │
│         persistence-client/, sync-client/                             │
│  L3    packages/stores/                                               │
│  L2    packages/geometry-kernel/, packages/ai-host/,                  │
│         packages/constraint-solver/, packages/types-builtin/          │
│  L1    packages/command-bus/, frame-scheduler/, picking/,             │
│         visibility/, snapping/, spatial-index/, ai-cost/,             │
│         renderer-three/, input-host/, physics-host/,                  │
│         runtime-undo-stack/, drawing-primitives/, protocol/           │
│  L0    packages/schemas/         ← Zod schemas; no I/O, no THREE,    │
│                                    no DOM                             │
└──────────────────────────────────────────────────────────────────────┘
```

The **dependency rule** (CI-enforced via `eslint-plugin-boundaries`): a layer may import from any lower layer; never from a higher one. L7.5 is the only zone permitted to import from any other; this is the legacy concession and shrinks toward zero.

### §1.1 — Repository counts (verified 2026-06-01)

| Surface | Count | Path |
|---|---:|---|
| Packages | **79** | `packages/*/` |
| Apps | **13** | `apps/*/` |
| Plugins | **47** | `plugins/*/` |
| Contracts | **49** | `docs/02-decisions/contracts/C*.md` (C01–C49) |
| ADRs | **108** | `docs/02-decisions/adrs/*.md` |
| Specs | **56** | `docs/03-execution/specs/*.md` |
| Benchmarks | **68** | `apps/bench/src/benches/*.bench.ts` |
| CI gates | **21** | `tools/ga-gate/check-*.ts` |
| `src/` files | **7** | `src/` (no subdirs) |

The deep per-package inventory is in [STR-05-architecture-breakdown.md §4](./STR-05-architecture-breakdown.md).

---

## §2 — The boundary lint matrix

What each layer is allowed to import. CI-enforced via `eslint-plugin-boundaries` (configured in `eslint.config.js`).

| From ↓ → To | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| L0 (schemas) | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| L1 (infra) | ✅ | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| L2 (domain) | ✅ | ✅ | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| L3 (stores) | ✅ | ✅ | ✅ | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| L4 (scene+persist) | ✅ | ✅ | ✅ | ✅ | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| L5 (file+view) | ✅ | ✅ | ✅ | ✅ | ✅ | — | ❌ | ❌ | ❌ | ❌ |
| L6 (composer+ui-base) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ❌ | ❌ | ❌ |
| L7 (apps) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ❌ | ❌ |
| L8 (plugin-sdk) | ✅ subset | ✅ subset | ✅ subset | ✅ subset | ✅ subset | ✅ subset | ✅ subset | ❌ | — | ❌ |
| L9 (plugins) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | — |

The L8 "subset" means `packages/plugin-sdk/` re-exports a curated subset of lower layers — plugins get the subset, never direct lower-layer access. This is the stable plugin contract: internals refactor freely; the L8 facade does not.

---

## §3 — The composition root contract

**One** entry point produces a runtime handle. Production code uses only this entry point. Implementation: `packages/runtime-composer/src/composeRuntime.ts` returns `Promise<ComposedRuntime>` (where `ComposedRuntime extends PryzmRuntime` adds `sceneReady: Promise<void>`).

The canonical interface (verified 2026-06-01 against `packages/runtime-composer/src/types.ts:3213`) is **~29 named slots + `audit` metadata + 2 phase-specific extensions** organised by addition phase:

### §3.1 — Wave-4 core slots (Slots 1–14 — the original typed surface)

```ts
interface PryzmRuntime {
  readonly audit:           RuntimeAudit;          // stamped on every command

  readonly scene:           SceneSlot;             // 1  — renderer + scheduler + host + materialPool
  readonly stores:          StoresSlot;            // 2  — typed stores umbrella
  readonly bus:             { dispatch, execute,   // 3  — CommandBus + registry + ringBuffer
                              register, registry,
                              ringBuffer,
                              setRingBuffer,
                              clearUndoStacks };
  readonly selection:       SelectionSlot;         // 4a
  readonly hover:           HoverSlot;             // 4b
  readonly projectContext:  ProjectContextSlot;    // 4c
  readonly tools:           ToolsSlot;             // 5  — tool state machine
  readonly picking:         PickingSlot;           // 6
  readonly physicsHost:     PhysicsHostSlot;       // 6b — broad-phase spatial query
  readonly inputHost:       InputHostSlot;         // 6c — pointer + wheel + keyboard
  readonly viewRegistry:    ViewRegistrySlot;      // 7
  readonly persistence:     PersistenceSlot;       // 8
  readonly sync:            SyncSlot;              // 9
  readonly visibility:      VisibilitySlot;        //    — wave-chain evaluator
  readonly ai:              AiSlot;                // 10
  readonly plugins:         PluginsSlot;           // 11 — contribution host
  readonly events:          TypedEventEmitter<RuntimeEvents>; // 12
  readonly toasts:          ToastsSlot;            // 13
  readonly userPreferences: UserPreferencesSlot;   // 14
```

### §3.2 — Phase C–D additions

```ts
  readonly undoStack:        UndoStackSlot;        // drives SaveUndoRedoHUD
  readonly workspace:        WorkspaceSlot;        // landing | hub | workspace surface
  readonly workspaceMode:    WorkspaceModeController; // 3d | plan | section
  readonly cameraController: CameraControllerSlot;
```

### §3.3 — Phase F slots 15–29 (S81 F.12 + Wave 14)

```ts
  readonly ifc:           IfcSlot;            // 15 — import/export/inspector
  readonly rhino:         RhinoSlot;          // 16 — .3dm reader
  readonly bcf:           BcfSlot;            // 17 — BCF 3.0 reader/writer
  readonly pdf:           PdfSlot;            // 18 — importer/exporter
  readonly auth:          AuthSlot;           // 19
  readonly shortcuts:     ShortcutsSlot;      // 20 — global keyboard
  readonly toast:         ToastSlot;          // 21 (canonical Wave-14)
  readonly debug:         DebugSlot;          // 22 — renderer dev overlay
  readonly export:        ExportSlot;         // 23 — ifc | glb | pdf | csv | panorama
  readonly entitlements:  EntitlementsSlot;   // 24 — gate
  readonly cde:           CdeSlot;            // 25 — CDE naming adapter
  readonly geospatial:    GeospatialSlot;     // 26 — projection
  readonly physics:       PhysicsDevSlot;     // 27 — dev-overlay metrics
  readonly structural:    StructuralSlot;     // 28 — analysis
  readonly search:        SearchSlot;         // 29 — full-text
```

### §3.4 — Domain-specific extensions

```ts
  readonly apartmentParameterPropagator: ApartmentParameterPropagator; // D-α-3 P3
  readonly familyRegistryStore:          FamilyRegistryStore;          // P0.3 slice B

  tearDown(): void;       // idempotent disposer in reverse order
}
```

**All slots typed.** No `unknown`. No `(window as ...)` reads. The contract is codified in [C02 — Composition Root & Boot](../02-decisions/contracts/C02-COMPOSITION-ROOT-AND-BOOT.md). The slot count has grown from the original 14 (Wave 4) through Phase F (15–29) and now Phase D-α / P0.3 (apartment propagator + family registry) — the interface is the single source of truth.

The composer entry point:

```ts
export interface ComposeRuntimeInput {
  readonly audit: RuntimeAudit;
  // optional dependencies injected by the host environment
  readonly persistence?: PersistenceClient;
  readonly sync?: SyncClient;
  readonly renderer?: RendererHandle;
  readonly registries?: PluginRegistries;
}

export function composeRuntime(
  input: ComposeRuntimeInput
): Promise<ComposedRuntime>;
```

### §3.1 — Headless mode

`packages/headless/` (v1.0.0-rc.1, npm-publishable) exposes `headlessRuntime({ audit })` which calls `composeRuntime({ canvas: null })`. In headless mode `runtime.renderer === null` and `runtime.scene.canvas === null`; all data-half slots remain present (commands, stores, plugins, persistence, sync, AI, audit). Use cases: CI pipelines, Node.js integrations, IFC export automation.

---

## §4 — The eight architectural principles (P1–P8)

These are the binding rules. Each has a CI gate. Violations block merge. Detailed in [engineering-vision §2](./STR-03-engineering-vision.md).

| # | Principle | Enforcement | Status |
|---|---|---|---|
| **P1** | Single composition root — production code obtains runtime via `composeRuntime()` only | `scripts/ci-check-single-compose.ts` | Soft-fail tripwire |
| **P2** | Single THREE owner — `import * as THREE` only in `packages/renderer-three/` (specifically `three-re-export.ts`) | `tools/ga-gate/check-three-imports.ts` + `eslint-plugin-boundaries` | Hard-fail ✅ |
| **P3** | Single rAF — `requestAnimationFrame()` called only in `packages/frame-scheduler/src/RafAdapter.ts` | `tools/ga-gate/check-raf-count.ts` | Hard-fail ✅ |
| **P4** | No `(window as any)` outside the allowlisted shim | `eslint-baseline-window-as-any.json` cast counter | Soft-fail tripwire |
| **P5** | Schemas are pure — `packages/schemas/` has zero I/O, zero THREE, zero DOM | `scripts/ci-check-domain-purity.ts` | Hard-fail ✅ |
| **P6** | Commands are the only mutation path — UI dispatches via `commandBus`; no direct store writes | `scripts/ci-check-no-direct-store-writes.ts` | Hard-fail ✅ |
| **P7** | Visibility intent ≠ UI state — `packages/visibility/` is domain, not UI | per-package contract test | Hard-fail ✅ |
| **P8** | Explicit sync conflicts + every public function has ≥ 1 OTel span | `tools/ga-gate/check-otel-spans.ts` | Hard-fail ✅ |

**Today**: 6 of 8 hard-fail. P1 + P4 are soft-fail tripwires (counter must not increase) moving to hard-fail at the relevant phase exits.

---

## §5 — The 21 CI gates

Located in `tools/ga-gate/check-*.ts`. Run by `tools/ga-gate/run-all.ts` and blocking on merge to main.

| Gate | What it checks |
|---|---|
| `check-apps-editor-ghost-dirs.ts` | Stale `apps/editor/src/app*/` dirs absent |
| `check-cast-count.ts` | Cast-count tripwire (no increase) |
| `check-commandmanager-any.ts` | Legacy `commandManager.any` absent |
| `check-ctrl-z-wired.ts` | Ctrl-Z undo path wired |
| `check-custom-event-apps.ts` | CustomEvent usage in apps bounded |
| `check-custom-event-packages.ts` | CustomEvent usage in packages bounded |
| `check-engine-bootstrap-loc.ts` | Bootstrap LOC budget |
| `check-geometry-ceiling.ts` | Ceiling geometry producer present |
| `check-l7-boundary.ts` | L7 (apps) boundary enforcement |
| `check-motion-gate-coverage.ts` | Motion animation coverage |
| `check-no-commandmanager.ts` | Legacy CommandManager absence |
| `check-no-workspacemountbridge.ts` | Deleted WorkspaceMountBridge absence |
| `check-otel-spans.ts` | OTel span audit per public function (P8) |
| `check-per-package-compile.ts` | Per-package isolated typecheck |
| `check-project-isolation.ts` | Project store isolation across switches |
| `check-raf-count.ts` | Single rAF call site (P3) |
| `check-scene-graph.ts` | Scene graph invariants |
| `check-structuredclone-new-commands.ts` | `structuredClone` usage in command snapshots |
| `check-three-imports.ts` | Single THREE owner (P2) |
| `check-window-store-in-packages.ts` | `window.<store>` absent in packages |
| `check-xss-guards.ts` | XSS sanitisation enforced |

The contract suite [C01–C49](../02-decisions/contracts/) introduces additional per-contract gates (e.g. `check-vector-pdf.ts` for C24+C29, `check-payout-formula.ts` for C40); those land per contract implementation.

---

## §6 — The 68 benchmarks (NFTs)

Located in `apps/bench/src/benches/*.bench.ts`. Run by `npx vitest` (Node) against fixture data. Per-bench JSON output; baseline regression gate. Categories:

| Category | Count | Examples |
|---|---:|---|
| Element geometry producers | 12 | `produce-wall.bench.ts`, `produce-door.bench.ts`, … |
| Pipeline gates | ~5 | `cold-boot.bench.ts`, `frame-budget.bench.ts`, `cmd-execute-latency.bench.ts`, … |
| Load perf | 4 | `load-small/medium/large`, `cold-load-real` |
| Interchange | 3 | `ifc-import-tier1`, `ifc-export-tier1`, `bcf-roundtrip` |
| Constraint/snap/pick | 3 | `constraint-solve`, `snap-latency`, `pick-latency` |
| Memory/CPU | ~3 | `memory-ceiling`, `cpu-idle`, … |
| Persistence | ~4 | `save`, `restore`, `undo`, … |
| UI overhead | ~3 | `auth-modal-open`, `tool-activate`, `panel-base-overhead` |
| Other | ~31 | `ai-cost`, `awareness-throughput`, `pdf-to-bim`, `sync-merge`, … |

The "17 headline NFTs" referenced in earlier docs was a curated subset for sprint-close review; the actual benchmark count is **68** and growing.

NFT targets are codified in [C10 — Performance & Observability](../02-decisions/contracts/C10-PERFORMANCE-AND-OBSERVABILITY.md).

---

## §7 — Production startup flow

PRYZM boots in three stages. Stage 0 (App-Shell first paint) and Stage 2 (engine init on project open) serve NFT 1 (cold-boot to first paint < 2.5 s). Stage 1 is the runtime composition.

### Stage 0 — App-Shell first paint (< 100 ms, HTML parse only)

`index.html` contains inline `<style>` skeleton, inline `<script>` for auth-state detection (`localStorage` check), and `<script>window.__pryzmPendingActions = []</script>` for pre-boot CTA replay. The skeleton paints landing navbar + hero card + CTA before any module script runs. CSS prefix `lp-skel-*` is the carve-out from the AppTheme injection rule.

### Stage 1 — Runtime composition + landing/hub mount (Vite resolves dep graph)

```
src/main.ts
  → bootPlatform() Phase A (paint-fast):
      const runtime = await composeRuntime({ persistence, sync, renderer, registries, audit })
      panelManager.setRuntime(runtime)
      PlatformRouter.start(runtime)
  → bootPlatform() Phase B (deferred, post-paint):
      UiPreferences.setRuntime(runtime)
      gridDrawingHUD.setRuntime(runtime)
      dataCommandCenter.setRuntime(runtime)
      new PlatformShell(deferredSave, deferredLoad, runtime)
  → workspaceMount.{ensure,show}() awaits Phase B before Stage 2
```

### Stage 2 — Engine init (lazy; only on project-open click)

```
workspaceMount.ensure() → loadEngine() → apps/editor/src/engine/engineLauncher.ts
  → reads composed runtime via PryzmRuntime injection
  → wires scheduler (FrameScheduler)
  → instantiates scene-committer + renderer (renderer-three)
  → apps/editor/src/ui/app.ts mounts viewport panels
```

The engine half of L7.5 has migrated to `apps/editor/src/{engine,ui}/` (already done — `src/` root no longer has these subdirs, only the 7 transitional files). The pre-Wave-7 `src/engine/EngineBootstrap.ts` is deleted.

---

## §8 — The convergence definition

PRYZM as a single coherent product exists when these booleans hold at the same git SHA:

```
( legacy_src_files ≤ 7 )                            // src/ shrinks toward 0
AND ( window_any_in_apps ≤ baseline )               // cast tripwire holds
AND ( raf_owners_outside_frame_scheduler == 0 )     // P3
AND ( default_runtime === composeRuntime() )        // P1
AND ( EngineBootstrap_LOC == 0 )                    // legacy god file gone
AND ( all_ga_gate_workflows_green == true )         // 21 CI gates pass
AND ( plugin_sdk_published == true )                // @pryzm/sdk npm
AND ( headless_published == true )                  // @pryzm/headless npm
AND ( marketplace_live == true )                    // marketplace.pryzm.app
```

**Current state (verified 2026-06-01)**:
- legacy src files: 7 (down from 35+)
- raf owners outside frame-scheduler: 0 ✅
- composeRuntime is the default ✅
- EngineBootstrap.ts deleted ✅
- 21 CI gates green ✅
- @pryzm/sdk v1.0.0 in `packages/plugin-sdk/package.json` with publishConfig (pending `pnpm publish`)
- @pryzm/headless v1.0.0-rc.1 ready (pending `pnpm publish`)
- `apps/marketplace/` + `apps/marketplace-web/` shipped; marketplace.pryzm.app DNS pending

The remaining work is operational (npm publish + DNS), not architectural.

---

## §9 — The 49 contracts (binding rules)

Every binding architectural rule lives in a numbered contract. The suite is indexed in [02-decisions/contracts/README.md](../02-decisions/contracts/README.md). Summary by domain:

| Domain | Contracts | Status |
|---|---|---|
| **Core platform** (architecture, composition, schemas, rendering, persistence, UI, plugin SDK, security) | C01–C08 | CANONICAL |
| **Platform extensions** (AI, perf+obs, element creation, geospatial, project lifecycle, legacy elimination) | C09–C14 | CANONICAL |
| **Element semantics** (hosted elements, command authoring, batch catalogue, element preview) | C15–C18 | CANONICAL |
| **Site + climate + privacy + provenance** | C19–C23 | DRAFT 2026-06-01 |
| **Output + interchange** (sheets, IFC, Revit, inspect, data, PDF, drawing-set) | C24–C30 | DRAFT |
| **Documentation authoring protocol** | C31 | DRAFT |
| **Interchange + production** (DXF, Rhino, print, COBie, clash, schedule, cost) | C32–C38 | DRAFT |
| **Commerce** (pricing, marketplace, telemetry, support) | C39–C42 | DRAFT |
| **Accessibility + device** (WCAG, mobile, browser-matrix, i18n) | C43–C46 | DRAFT |
| **Operational** (versioning, backup+DR, multi-region) | C47–C49 | DRAFT |

The CANONICAL suite (C01–C18) is enforced today. The DRAFT suite (C19–C49) is the published implementation roadmap.

---

## §10 — Cross-cutting subsystems (by contract)

Reading the contracts is the way to understand a subsystem. The following table maps every major subsystem to its binding contract + primary owner code:

| Subsystem | Contract | Owner code |
|---|---|---|
| Composition root | [C02](../02-decisions/contracts/C02-COMPOSITION-ROOT-AND-BOOT.md) | `packages/runtime-composer/` |
| Commands + stores | [C03](../02-decisions/contracts/C03-SCHEMAS-COMMANDS-AND-STATE.md) | `packages/command-bus/`, `packages/stores/`, `packages/schemas/` |
| Rendering | [C04](../02-decisions/contracts/C04-RENDERING-AND-SCHEDULING.md) | `packages/renderer-three/`, `packages/frame-scheduler/`, `packages/scene-committer/` |
| Persistence + file format | [C05](../02-decisions/contracts/C05-PERSISTENCE-AND-FILE-FORMAT.md) | `packages/persistence-client/`, `packages/file-format/` (`.pryzm` ZIP) |
| UI shell + tools | [C06](../02-decisions/contracts/C06-UI-SHELL-AND-TOOLS.md) | `packages/ui-base/`, `packages/ui/`, `apps/editor/src/ui/` |
| Plugin SDK + marketplace | [C07](../02-decisions/contracts/C07-PLUGIN-SDK-AND-MARKETPLACE.md) | `packages/plugin-sdk/` (v1.0.0), `apps/marketplace/`, `apps/marketplace-web/` |
| Collab + security | [C08](../02-decisions/contracts/C08-COLLABORATION-AND-SECURITY.md) | `packages/sync-client/`, `apps/sync-server/`, server.js auth+OAuth |
| AI host | [C09](../02-decisions/contracts/C09-AI-AND-VISIBILITY-INTENT.md) | `packages/ai-host/` (7 workflows), `packages/visibility/`, `packages/ai-cost/` |
| Perf + observability | [C10](../02-decisions/contracts/C10-PERFORMANCE-AND-OBSERVABILITY.md) | `apps/bench/` (68 benches), OTel via `@opentelemetry/*` |
| Element creation pipeline | [C11](../02-decisions/contracts/C11-ELEMENT-CREATION-PIPELINE.md) | command-bus → handlers → stores → scene-committer → renderer-three |
| Geospatial | [C12](../02-decisions/contracts/C12-GEOSPATIAL.md) | `packages/geospatial/` (LTP-ENU, IfcProjectedCRS, proj4), `plugins/geospatial/` (Cesium bridge) |
| Project lifecycle + isolation | [C13](../02-decisions/contracts/C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) | `server/projectStore.js`, `packages/persistence-client/` |
| Legacy elimination | [C14](../02-decisions/contracts/C14-LEGACY-ELIMINATION-AND-PRYZM3-ENFORCEMENT.md) | The cast tripwire baseline; the L7.5 src/ shrinkage |
| Hosted elements (door/window in wall) | [C15](../02-decisions/contracts/C15-HOSTED-ELEMENT-CONTRACT.md) | `packages/geometry-wall/`, `packages/geometry-door/`, `packages/geometry-window/` |
| Command authoring protocol | [C16](../02-decisions/contracts/C16-COMMAND-AUTHORING-PROTOCOL.md) | Every `plugins/*/src/handlers/*` |
| Batch creation catalogue | [C17](../02-decisions/contracts/C17-BATCH-CREATION-CATALOGUE-AND-PANEL-BINDING.md) | `apps/editor/src/ui/CreatePanelLayout.ts` + per-element batch handlers |
| Element preview visual | [C18](../02-decisions/contracts/C18-ELEMENT-PREVIEW-VISUAL-CONTRACT.md) | `packages/core-app-model/src/preview/PreviewStyle.ts` (canonical `#6600FF`) |

---

## §11 — Element creation pipeline

All element creation — whether from a user gesture (click tool, draw segment), an AI workflow (generate floor plan from prompt), or remote sync (collaborator's mutation) — follows the same pipeline. The three paths converge at the command bus; from there the flow is identical.

```
USER GESTURE             AI WORKFLOW              REMOTE SYNC
─────────────────        ─────────────────        ─────────────────
Tool.onPointerUp()       ai-host/ workflow        sync-client/ replay
     │                        │                        │
     │ commandBus.dispatch    │ commandBus.dispatch    │ commandBus.dispatch
     │  ('wall.create',       │  ('wall.batch.         │  ('wall.create',
     │   { …,                 │    create', { …,       │   { …,
     │   source:'user' })     │   source:'ai' })       │   source:'remote' })
     └────────────────────────┴────────────────────────┘
                              │
                              ▼
                  ┌───────────────────────┐
                  │  packages/command-bus/│  (L1)
                  │  dispatch(typeId,     │
                  │    payload, meta)     │
                  └───────────┬───────────┘
                              │
                              ▼
                  ┌───────────────────────┐
                  │  Command Handler      │
                  │  plugins/*/handlers/  │
                  │  • validates domain   │
                  │  • Immer draft →      │
                  │    packages/stores/   │
                  │  • schedules geometry │
                  │    via FrameScheduler │
                  │  • emits typed event  │
                  └───────────┬───────────┘
                              │
                  ┌───────────┴───────────┐
                  ▼                       ▼
       ┌──────────────────┐   ┌───────────────────────┐
       │ Geometry build   │   │ Event subscribers     │
       │ FrameScheduler   │   │ e.g. plugins/rooms/   │
       │ pre-render slot  │   │ → rooms.redetect      │
       │ → geometry-      │   │   (async, per-level,  │
       │   kernel produce │   │    frame-yielded)     │
       │ → scene-committer│   └───────────────────────┘
       │ → SceneRegistry  │
       │ → InstancedMesh  │
       └──────────────────┘
```

Full contract: [C11](../02-decisions/contracts/C11-ELEMENT-CREATION-PIPELINE.md). The pipeline is identical across all 14 element types (wall, door, window, slab, ceiling, floor, roof, column, beam, stair, handrail, curtain-wall, lighting, plumbing, structural, furniture).

---

## §12 — Public API surface (post-GA)

What plugin developers, headless integrators, and customers consume:

1. **`@pryzm/sdk`** — `packages/plugin-sdk/` v1.0.0; 2067+ LOC; descriptor, lifecycle, Ed25519 signing, 6 host proxies (Command, Store, View, File, AI, Network), iframe sandbox with CSP, `pryzm dev` CLI, bSDD lookup client. `publishConfig.name=@pryzm/sdk`. Manual step: `pnpm --filter @pryzm/plugin-sdk publish --access public`.
2. **`@pryzm/headless`** — `packages/headless/` v1.0.0-rc.1; `composeHeadlessRuntime` alias + vitest tests. Manual step: publish to npm.
3. **REST + WebSocket API** — server.js routes (45+ endpoints across `/api/auth`, `/api/projects`, `/api/ai`, `/api/stripe`, `/marketplace/api`, `/api/v1/families`); Socket.io for real-time.
4. **`.pryzm` file format** — ZIP container; manifest.json + events/*.evt.bin (MessagePack) + chunks/<sha256>.glb (content-addressed); SPEC-26 normative.
5. **`.pryzm-family` file format** — ZIP container; manifest.json + document.json + event-log.ndjson + ifc-mapping.json + signing/{schema-hash,signature}; SPEC-FAMILY-FORMAT normative.
6. **IFC4X3 export** — `plugins/ifc-export/` + `packages/file-format/src/ifc/`; round-trip tested nightly against 10 reference projects.
7. **Marketplace** — `marketplace.pryzm.app` (DNS pending); plugin browse/install/purchase + family browse/download.

---

## §13 — What this document is NOT

- Not the strategic intent → [STR-01-manifesto.md](./STR-01-manifesto.md), [STR-02-product-vision.md](./STR-02-product-vision.md), [STR-07-positioning.md](./STR-07-positioning.md)
- Not the engineering principles narrative → [STR-03-engineering-vision.md](./STR-03-engineering-vision.md)
- Not the per-file inventory → [STR-05-architecture-breakdown.md](./STR-05-architecture-breakdown.md)
- Not the per-decision rationale → [02-decisions/adrs/](../02-decisions/adrs/) (108 ADRs)
- Not the per-system normative spec → [03-execution/specs/](../03-execution/specs/) (56 specs)
- Not the sprint plan or roadmap → [03-execution/plans/](../03-execution/plans/)
- Not the live status snapshot → [03-execution/status/](../03-execution/status/)
- Not the customer-facing brand surface → [apps/docs-site/](../../apps/docs-site/)

This document is **the shape of the system, the binding rules, the lint gates, and the convergence definition** — kept short on purpose. Per-decision detail belongs in ADRs; per-contract detail belongs in contracts; per-package detail belongs in the breakdown.

---

## §14 — When to update this doc

This doc updates when **the code changes its shape**. Specifically:

- New layer or layer-renumbering → update §1 + §2
- New CI gate added → update §5
- New principle added → update §4 (and engineering-vision §2)
- Convergence boolean added/removed → update §8
- Composition root signature change → update §3
- Repository count drift > 5 % from §1.1 — update §1.1

For drift, the discipline is: **edit this canonical doc; do not write a `*-AUDIT-YYYY-MM-DD.md` alongside it** (per [C31 §1.2](../02-decisions/contracts/C31-DOCUMENTATION-AUTHORING-PROTOCOL.md) + [operating-principles O5](./STR-06-operating-principles.md)).

---

*End — PRYZM Architecture, 2026-06-01 — CANONICAL.*
```

---

### 1.7 `docs/03_PRYZM3/` inventory

**FINDING — the directory `docs/03_PRYZM3/` DOES NOT EXIST.** `CLAUDE.md` and several contracts reference paths like `docs/03_PRYZM3/01-VISION.md` and `docs/03_PRYZM3/02-ARCHITECTURE.md`, and the audit's bench JSONs cite `01-VISION.md §5` / `02-ARCHITECTURE §6`. These paths are **stale/dead** — a doc-drift defect (see §6). The PRYZM 3 vision/architecture content was migrated to `docs/01-strategy/` (`STR-01…STR-15`) and `docs/02-decisions/contracts/` (`C01…C56`); the old `03_PRYZM3` tree was archived under `docs/archive/pryzm3-internal/`.

**Archive inventory — `docs/archive/pryzm3-internal/` (169 files, ALL documentation; NO live executing code — zero `.ts/.js/.mjs/.tsx` files found):**

| File | Status |
|---|---|
| `00-PROCESS-TRACKER-ARCHIVED-2026-05-16.md` | stale (archived) |
| `03-CURRENT-STATE-ARCHIVED-2026-05-16.md` | stale (archived) |
| `04-PLAN-FORWARD/` (dir) | stale (archived) |
| `07-OPEN-ITEMS-ARCHIVED-2026-05-16.md` | stale (archived) |
| `CONTRACT-SYNC-AUDIT-2026-05-29-APPLIED.md` | stale (applied) |
| `DAILY-USE-AUDIT-2026-05-20-ARCHIVED.md` | stale (archived) |
| `DAILY-USE-FIX-LOG-2026-05-20-ARCHIVED.md` | stale (archived) |
| `DOM-EVENT-LISTENER-AUDIT-2026-05-18.md` | stale |
| `ELEMENT-FUNCTIONAL-AUDIT-FULL-2026-05-18.md` | stale |
| `ELEMENT-FUNCTIONAL-FIX-PLAN-2026-05-18.md` | stale |
| `ELEMENT-OPERATIONS-AUDIT-2026-05-17.md` | stale |
| `ELEMENT-OPERATIONS-IMPL-PLAN-2026-05-17.md` | stale |
| `InterviewDAR.docx` (19 MB binary) | stale (interview artifact) |
| `MASTER-IMPL-PLAN-FUNCTIONAL-2026-05-18-ARCHIVED.md` | stale (archived) |
| `MASTER-IMPLEMENTATION-TRACKER-ARCHIVED-2026-05-16.md` | stale (archived) |
| `PLAN-VIEW-INCREMENTAL-PROJECTION-ARCHITECTURE-2026-05-20-ARCHIVED.md` | stale (archived) |
| `PRODUCTION-READINESS-AUDIT-2026-05-20-ARCHIVED.md` | stale (archived) |
| `PRODUCTION-READINESS-FIX-LOG-2026-05-20-ARCHIVED.md` | stale (archived) |
| `PRYZM3-MASTER-STATUS-2026-05-16-ARCHIVED.md` | stale (archived) |
| `PRYZM3-MASTER-STATUS-2026-05-29-ARCHIVED.md` | stale (archived) |
| `Pryzmselectionfiximplementationplan.md` | stale |
| `pryzm3-overview-legacy.md` | stale (explicitly "legacy") |
| `duplicates/` (dir) | stale (archived) |
| `restructure-2026-04-30/` (dir) | stale (archived) |
| `shrapnel/` (dir) | stale (archived) |
| `superseded-2026-04-30/` (dir, contains `00_VISION/02-VISION.md`) | stale (superseded) |
| `superseded-amendments/` (dir) | stale (superseded) |
| `superseded-audits/` (dir) | stale (superseded) |
| `superseded-plans/` (dir) | stale (superseded) |

**Live-code check:** `find docs/archive/pryzm3-internal -type f \( -name '*.ts' -o -name '*.js' -o -name '*.mjs' -o -name '*.tsx' \)` returned **zero results**. The archive is documentation only — no executing code. **Recommendation (should-migrate):** update `CLAUDE.md` + contract cross-refs to point at `docs/01-strategy/STR-04-architecture.md` and the C-contracts instead of the non-existent `docs/03_PRYZM3/` paths, or the governance breadcrumbs mislead every new agent.

---

## 2. Open issues triage (from V1-LAUNCH-READINESS-AUDIT.md)

**Method + caveat.** The audit is a LIVING founder log of 413 `L-NNN` rows. Its row schema is `| id | reporter | description | area | status | route/owner |` — there is **no dedicated "owner" or "target-date" column**; the last column mixes a `Q#`/agent route with fix commits. So "no owner / no target date" is TRUE for essentially every row by schema (there are no per-row dates/owners), and the launch target for all is "v1 launch (next week)" per the doc header. The table below therefore filters to the rows that are **security / data-loss / auth / persistence-corruption / collab-data-integrity** AND still show an **unfixed or unconfirmed** status. Pure UX/rendering/geometry rows (the large majority) are excluded by this filter — they are in the verbatim part-1 file. **This triage is a best-effort keyword+status scan of all 413 rows; it is not a guarantee every latent data-loss row was caught → treat as UNVERIFIED-COMPLETE.**

Severity legend: **P0** launch-blocking data-loss/security · **P1** high · **P2** medium.

| L-NNN | Description | Severity | Owner | Target date | Status |
|---|---|---|---|---|---|
| L-53 | **Concurrent wall baseline move is silent LWW — collab DATA LOSS.** `YjsDocAdapter.applyCommand` writes each command field into a per-elementId `Y.Map` key; a wall `baseLine` edited concurrently is last-writer-wins with no conflict surfaced. Direct **P8 violation** (CRDT merges that lose data must surface as user-resolvable conflicts). | **P0** | none (route: audit) | v1 (none) | OPEN (unfixed) |
| L-375a | **CRDT applier is never wired** — per-command real-time replication silently degraded; P1/P4 regression. Marked partially addressed by commit 7c4ac204 (composition-root wiring) but flagged still-degraded. | **P1** | none (L-375 audit) | v1 (none) | PARTIAL/unconfirmed |
| L-376g | EngineBootstrap O.8 CRDT wiring deferred to idle — office path affected if applier never wired (ties to L-375a). | **P2** | none | v1 (none) | OPEN |
| L-18 | **Duplicate furniture on open** — collab catch-up re-creates already-placed furniture; dedup covers rooms/slabs/floors but not furniture → silent duplication on every reopen. | **P1** | none (founder) | v1 (none) | OPEN |
| L-85 | **Kitchen/wardrobe/lighting elements MISSING after project re-open** — present after creation, GONE after close→reopen (persistence data-loss for those element kinds). | **P0** | none (founder) | v1 (none) | OPEN |
| L-3 | **Heavy project load fails ("timeout 30s") + autosave-during-load** — autosave firing mid-load can persist a partial/empty scene over good data (data-loss risk). P2 shipped, confirm pending. | **P1** | Q3/ADR-0098 F2 | v1 (none) | BROKEN (confirm pending) |
| L-81 | **Project DUPLICATION doesn't work** — duplicate opens broken/empty (data-integrity on copy path). | **P1** | none (founder) | v1 (none) | OPEN |
| L-83 | **Opening a project doesn't work** — prod `/api/projects/<id>/latest-version` 404 → streamLoad fails (load path). | **P1** | none (founder) | v1 (none) | OPEN |
| L-88 | Import Manager persistence — imported PDF/Image underlays must persist + re-list on reopen; every row action sound after close→reopen. | **P2** | none (founder) | v1 (none) | OPEN |
| L-45 | Underlay bugs — `DELETE_UNDERLAY` has no handler (throws); `QuotaExceededError` persisting underlay to storage (localStorage quota → persistence failure). | **P2** | none (audit) | v1 (none) | OPEN |
| L-376a | **~30 local-only projects with unsaved local versions pile up in IndexedDB, never flushed to server, no eviction cap** — unbounded local growth + unsynced work at risk (persistence). | **P1** | none (2026-07-17) | v1 (none) | OPEN |
| L-72 | **[CRITICAL, SYSTEMIC] Undo does not capture element MOVE/ROTATE/property-change in 3D** — data-integrity: edits silently unrecoverable via undo. | **P1** | none (founder) | v1 (none) | OPEN (partially addressed L-63/L-97) |
| L-136 | Selecting another project won't open — server access-check FAILED CLOSED on transient DB error (auth/availability). | **P1** | founder | v1 | FIXED `§FIX-ACCESS-CHECK-TRANSIENT-RETRYABLE` (verified in `server/projectAccess.js`) |
| L-137 | Create+open+save+slowness all trace to a SATURATED/DEGRADED prod Supabase pooler (infra availability, not code). | **P1** | founder | v1 | INFRA — mitigations shipped, root is capacity |
| L-132 | Project creation HANGS on 'PREPARING WORKSPACE' — create POST has no client timeout (availability, no data-loss). | **P1** | founder | v1 | OPEN/partly |
| L-134 | Create fails during server boot — client doesn't retry server's `migrations_in_progress` 503 signal. | **P1** | founder | v1 | addressed (§migration gate) |
| L-133 | Every deploy causes ~30–60s full 503 outage (no zero-downtime rollout) — availability at launch. | **P1** | founder | v1 | OPEN (infra) |
| L-373a | **Wind Comfort / Temperature 3D-Site heatmaps render a HEURISTIC field presented as analytical — TRUST/DATA-CREDIBILITY risk** at launch (misleading users). | **P1** | none (audit) | v1 (none) | OPEN |
| L-117 | Big circular tower (2000+ elements) CRASHES on first 3D navigation (device-loss/crash — potential unsaved-work loss). | **P1** | founder | v1 | partly (WebGPU device-loss work) |
| L-139 | Large office (1366 elems/40 levels) — WebGPU device-loss cascade → renderer dies (crash → potential work loss). | **P1** | founder | v1 | partly (§SHADOW-DEVICE-LOSS-FIX) |

**Auth/permission rows:** the only clearly auth-classified founder rows are L-136 (fail-closed access check, FIXED) and the `§AUTH-SESSION-LEAK` / `§AUTH-SESSION-LEAK-2` hardening referenced in `server.js` (cross-user cache leak, fixed per memory + code comments). No OPEN auth-bypass row was found in the log. The server-side auth surface is otherwise well-hardened (see §3 and §5).

---

## 3. Code audit (RAW command output)

### 3.1 Dependency audit

`npm audit` is **NOT USABLE** here — this is a pnpm monorepo with no root `package-lock.json`:
```
npm error code ENOLOCK
npm error audit This command requires an existing lockfile.
npm error audit Try creating one first with: npm i --package-lock-only
npm error audit Original error: loadVirtual requires existing shrinkwrap file
```

`pnpm audit` RAW summary (full table saved to `reports/.pnpm-audit.txt`):
```
93 vulnerabilities found
Severity: 9 low | 49 moderate | 28 high | 7 critical
```

**Critical (7) — titles:**
```
critical  Happy DOM: VM Context Escape can lead to Remote Code Execution   (dev/test dep — happy-dom)
critical  jsPDF has Local File Inclusion/Path Traversal                    (RUNTIME — packages/file-format > jspdf)
critical  jsPDF has HTML Injection in New Window paths                     (RUNTIME — jspdf)
critical  When Vitest UI server is listening, arbitrary file ...           (dev/test dep — vitest UI)
```
(The pnpm table lists 7 critical advisories; jsPDF accounts for several of the critical+high because it is pulled through `packages/file-format`.)

**High (28) — titles (deduped sample):**
```
high  jsPDF Bypass ReDoS / DoS / PDF Injection (AcroForm/FreeText) / Object Injection  (RUNTIME — jspdf, multiple advisories)
high  Happy DOM fetch credentials use page-origin (dev)
high  Happy DOM ECMAScriptModuleCompiler unsanitized export (dev)
high  fast-uri path traversal / host confusion
high  fast-xml-builder attribute values with unwanted ...
high  Svelte devalue DoS via sparse array deserialization
high  tmp Path Traversal via unsanitized prefix/postfix
high  form-data CRLF injection via unescaped ...        (RUNTIME-adjacent — multipart)
high  Astro Reflected XSS via unescaped slot name / Host header SSRF  (apex/marketing build)
high  Multer DoS via deeply nested ...                  (RUNTIME — server upload middleware)
high  ws Memory exhaustion DoS from tiny fragments      (RUNTIME — websockets)
high  protobufjs DoS through unbounded Any              (RUNTIME)
high  vite server.fs.deny bypass on Windows alternate data streams (dev server)
```

**Assessment:** Many critical/high are **dev/test-only** (happy-dom, vitest UI, vite dev-server, astro build) — not shipped in the runtime bundle, lower launch risk but should still be bumped. The **runtime-relevant** ones that matter for a public launch are: **jsPDF** (critical LFI/path-traversal + HTML injection + multiple PDF-injection/DoS — this is the PDF/vector export path, C29), **Multer** (server upload DoS), **ws** (websocket memory-exhaustion DoS — collab transport), **form-data** (CRLF), **protobufjs** (DoS). **None auto-fixed** — 93 open advisories is a genuine pre-launch hygiene gap. **Recommend a `pnpm audit --fix` / dependency-bump pass before launch.** (Raw full table: `reports/.pnpm-audit.txt`.)

### 3.2 Test suites

**`npm run test:server`** (vitest, Node env) — **PASS**:
```
 Test Files  6 passed (6)
      Tests  89 passed (89)
   Duration  8.02s
 exit=0
```

**`npx vitest run`** (root config — src/ui panel + toolbar + package specs) — **FAIL (exit 1)**:
```
 Test Files  3 failed | 18 passed (21)
      Tests  212 passed (212)
   Duration  133.75s
 exit=1
```
The 3 failed files are **collection/module-load failures, not assertion failures** — they import a chain that hits `packages/geometry-door/src/DoorStore.ts:227` where `projectScopeRegistry.register({...})` runs **at module top-level** (barrel-at-module-load), throwing during import:
```
 ❯ apps/editor/src/engine/__tests__/dimensionSelectionPanel.spec.ts (0 test)
 ❯ apps/editor/src/engine/views/plantools/__tests__/DoorHostResolution.slab.spec.ts (0 test)
 ❯ apps/editor/src/engine/views/plantools/__tests__/DoorFlipOnSpace.spec.ts (0 test)
 ❯ packages/geometry-door/src/DoorStore.ts:227:1
 ❯ packages/geometry-door/src/index.ts:9:1
```
This matches the known "SCC: no barrel access at module load" hazard (see MEMORY). **The root `npx vitest run` gate is RED.** These 3 files register **0 tests** (they never get to run), so the "212 passed" masks a real breakage in the door/dimension test surface. **Must be fixed before relying on this gate as green.**

**`pnpm -r run test:ci`** (per-workspace) — **UNVERIFIED — NOT RUN** (full recursive workspace suite is long; not executed in this session to stay within time budget). A human must run `pnpm -r run test:ci` (concurrency 1) to confirm the per-package suites.

**Coverage %:** **UNVERIFIED — no coverage tooling wired** into the documented scripts (`test:server`, root vitest, `test:pryzm1`, `test:ci` have no `--coverage` flag or coverage config surfaced). No coverage number can be stated.

**E2E (`npx playwright test`):** **UNVERIFIED — NOT RUN** (browser E2E; localhost dev is documented as unusable on this box → cannot drive reliably here).

### 3.3 Auth / session / permission code paths

The server auth surface is centralized and mature. `authMiddleware` is defined at `server.js:720`; 92 `app.<method>` routes; auth applied per-route + on `/api/v1`, `/v1/ai`, `/api/stripe` mounts. Ownership scoping (`owner_id`/`ownerId`) is enforced on project routes. Modules: `server/authStore.js`, `server/oauthService.js`, `server/permissions.js` (ISO-19650 role matrix), `server/projectAccess.js` (Socket.io join gate), `server/securityHeaders.js` (helmet), rate limiters (`globalLimiter`, `apiLimiter`, `aiLimiter`).

| File path | What it guards | Test exists? |
|---|---|---|
| `server.js:720` `authMiddleware` | Resolves `req.auth.userId` from JWT/session; gates all `/api/*` protected routes | Yes — `server/__tests__/permissions.test.ts` + others (89 server tests pass) |
| `server.js:385` `app.use('/api/v1', apiLimiter, authMiddleware, v1Router)` | Public v1 API surface | Partial (server suite) |
| `server.js:394` `app.use('/v1/ai', authMiddleware, ...)` | AI public API | Partial |
| `server.js:2103` `app.use('/api/stripe', authMiddleware, stripeRouter)` | Billing | UNVERIFIED (no stripe-specific test seen) |
| `server.js:2847` `GET /api/projects/:id` | Project read — validates ID allowlist (`isValidProjectId`), scopes `owner_id`/`ownerId`, 403 on mismatch (`§AUTH-SESSION-LEAK-2`) | Yes (permissions/project tests) |
| `server.js:2918` `DELETE /api/projects/:id` | Project delete — ownership enforced | Partial |
| `server.js:2988` `PATCH /api/projects/:id/thumbnail` | Ownership enforced | UNVERIFIED |
| `server.js:3172` `POST /api/projects/:id/versions` | Version write — auth + (assumed) ownership | UNVERIFIED |
| `server/projectAccess.js` `canUserAccessProject` | **Socket.io `join-project` gate** — Supabase→PG→in-memory, fail-closed, anonymous always denied | **Yes — `server/__tests__/permissions.test.ts` imports it** |
| `server.js:480` `socket.on('join-project')` | Room join — calls `canUserAccessProject`, denies+returns on `!allowed` | Partial (permissions test covers the gate fn) |
| `server.js:541` `socket.on('command-executed')` | Rejects payload if socket not in project room (`§B2`) + `isValidCommandPayload` (H4) | UNVERIFIED (guard present in code) |
| `server/permissions.js` `hasPermission` | ISO-19650 role→action matrix; owner-plan bypass | Yes — `permissions.test.ts` |

**Verdict:** auth is fail-closed, ID-validated, ownership-scoped, and the socket layer requires an authorized join before accepting mutations. This is a strong posture. Gaps are **test coverage** on individual write routes (versions/thumbnail/stripe), not obvious missing guards.

### 3.4 User input → sink table (validation present?)

**SQL:** grep for query string-interpolation (`query(` + backtick + `${`) in `server.js`/`server/` returned **0 hits** — all DB access uses parameterized `pool.query(text, params)` / Supabase query builder. **No SQL-injection sink found.**

| File:line | Sink | Validation / sanitization |
|---|---|---|
| `server.js:2847` `GET /api/projects/:id` | DB read by `:id` | **Yes** — `pgProjectStore.isValidProjectId(id)` allowlist → 400 before any DB call |
| `server.js` `pool.query(...)` ×dozens (3696, 3739, 3794, 3836, 4715…) | Postgres write/read | **Yes** — parameterized queries; no interpolation |
| `server.js:541` `command-executed` socket payload → `project_command_log` insert | DB write (CRDT log) | **Yes** — `isValidCommandPayload(data)` (H4) + room-membership (§B2) + parameterized insert |
| `server.js:888` `/api/anthropic/v1/messages` etc. | AI proxy → Cloudflare Worker / Anthropic | Auth + `aiLimiter` rate limit; body forwarded (schema validation UNVERIFIED per endpoint) |
| `server.js:2359` `POST /api/import/dwg` (multer) | File upload → parse | Multer size limits (assumed); **Multer DoS advisory open** (§3.1) |
| `server.js:2415` `POST /api/projects/:projectId/ifc-uploads` (multer) | File upload | Auth + multer; validation UNVERIFIED |
| `server.js:2211/2275` render/panorama image upload | File → object storage | Auth + multer single-file |
| `packages/schemas/*` (Zod) | Command/element payloads client-side | **Yes** — Zod schemas are the mutation contract (C03/P5); e.g. `annotation.create` Zod-rejects bad ids (L-145) — proves schema validation is live |
| **Client rendering**: `.innerHTML=` / `dangerouslySetInnerHTML` / `eval(` / `new Function(` | DOM/exec | **781 occurrences** across `apps/*`, `src/*`, `packages/*` (excluding node_modules/dist/tests). Sampled `apps/marketplace-web/*` uses `escapeHtml()` on interpolated values (good); many `root.innerHTML = '<static>'` are static strings (safe). **A minority interpolate values** — full per-site XSS review is **UNVERIFIED** (781 is too many to audit by hand here). Marketplace/user-generated-content pages (family names, descriptions) are the highest risk and should get a focused XSS pass. |

### 3.5 Secrets check

**No hardcoded real secrets found in tracked source.**

Broad key-pattern scan (stripe/aws/anthropic/google/github token prefixes):
```
$ rg -n -o "(sk_live_[A-Za-z0-9]{16,}|sk-ant-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,}|ghp_[A-Za-z0-9]{20,}|xoxb-[0-9A-Za-z-]{20,})" --glob '!node_modules' --glob '!*.lock' -g '!reports/**'
(no output — none found)
```

Generic secret-assignment scan (`(api_key|secret|password|token) = "16+ chars"`):
```
$ rg -n -i "(api[_-]?key|secret|password|token)\s*[:=]\s*['\"][A-Za-z0-9_\-]{16,}['\"]" --glob '!node_modules' --glob '!*.lock' --glob '!dist*' --glob '!*.map' -g '!reports/**'
docs/03-execution/plans/b2b-implementation-plan.md:144:    apiKey: 'pk_live_kavehome_xxxxx',
```
→ single hit, a **placeholder** (`pk_live_kavehome_xxxxx`) inside a planning doc, **not a real key**. Private-key-block scan (`BEGIN … PRIVATE KEY`) returned **no output**.

`.env` handling:
```
$ git check-ignore .env
.env                       # exit 0 → IS gitignored
$ git log --all --full-history -- .env
(empty)                    # → never committed to history
```
`.gitignore` contains `.env`, `.env.local`, `.env.*.local`, `!.env.example`. **Clean.**

### 3.6 TODO / FIXME / HACK

The 90-day changed-file set is **9,401 files** — effectively the entire tree (per-file intersection loop timed out; treat 90-day ∩ TODO ≈ all TODOs in code). Total across tracked TS/JS code (excl. node_modules/dist):
```
TODO|FIXME|HACK occurrences: 1734
```
Top files by count:
```
apps/editor/src/ui/ViewBrowser/panels/unified-browser/BrowserDataHelpers.ts   63
apps/editor/src/ui/rendering/VisualizationEnginePanel.ts                       42
apps/editor/src/ui/PropertyInspector.ts                                        39
packages/core-app-model/src/schedules/ScheduleExtractor.ts                     37
scripts/migrate/migrate-custom-events-f17.mjs                                  31
apps/editor/src/engine/initBuilders.ts                                         26
apps/editor/src/engine/initTools.ts                                            25
apps/editor/src/engine/views/plantools/AlignPlanToolHandler.ts                 24
apps/editor/src/ui/bottom-menu/BottomActionMenu.ts                             23
apps/editor/src/ui/SpatialTree.ts                                              23
packages/core-app-model/src/StoreEventBus.ts                                   20
packages/ai-host/src/QueryEngine.ts                                            20
```
**Caveat:** counts include some false positives (the substring "TODO" inside identifiers/strings). 1,734 markers is high but not itself launch-blocking; no automated triage of which are "must-fix-before-launch" was performed → **UNVERIFIED which TODOs are release-critical.**

---

## 4. Performance

### 4.1 Client bundle size (`npm run build`)

Build **SUCCEEDED** (`exit=0`, `built in 3m 16s`; C13 isolation guard passed: 27 serialized singletons / 54 registered scopes / 0 dead listeners; `tsc --skipLibCheck` passed). **Raw sizes only — this vite config does NOT report gzip/compressed size**, so figures below are uncompressed. Total `dist/` = **242 MB** (includes static `/items` + `/mosaic` asset catalogs, not just JS). 77 JS chunks.

Largest JS chunks (uncompressed):
```
dist/assets/vendor-web-ifc-DPjc2peB.js               3,555.53 kB
dist/assets/domain-engine-BpHDx7nO.js                3,281.32 kB
dist/assets/engineLauncher-BQZgDcnT.js               3,230.49 kB
dist/assets/main-C_OIfB7m.js                         2,450.05 kB
dist/assets/vendor-thatopen-KnogTKIt.js              1,988.17 kB
dist/assets/vendor-three-nL0F7Y4L.js                 1,865.81 kB
dist/assets/SiteBoundaryMap2D-DF61GFyg.js            1,100.47 kB
dist/assets/vendor-pdfjs-B-yXWhnR.js                   748.57 kB
dist/assets/index-CXdObROR.js                          547.51 kB
dist/assets/ProjectLifecycleController-c2C9Ofur.js     330.92 kB
```
**Assessment:** `main` (2.45 MB) and `engineLauncher` (3.23 MB) are eager-ish entry chunks — heavy for first paint even after gzip (roughly ~600–800 KB gzipped for `main` by typical 3–4× JS ratio; **UNVERIFIED — not measured**). `vendor-web-ifc` (3.55 MB), `vendor-thatopen`, `vendor-three`, `vendor-pdfjs`, `SiteBoundaryMap2D` are large but are (or should be) lazy vendor chunks. A rollup warning flags `RoomAutoOrganiser.ts` being both statically and dynamically imported (defeats a code-split). The gzipped app-shell budget proxy (`bundle-size.json`) is 0.31 KB gzip of the schema export manifest — a **proxy**, not the real shell size; the real production bundle is not gate-measured (notes say the browser `@pryzm/perf-budgets` gate is "post-Wave-13").

### 4.2 Perf budgets (C10) — MET vs UNVERIFIED

C10 defines these budgets; measured numbers come from `apps/bench/.run-output/*.json` (headless proxies — the JSON `notes` explicitly say the FULL browser/GPU numbers are "Wave 13, apps/editor-bench", which is **not present/not run**):

| # | C10 budget | Target | Measured (headless proxy) | Verdict |
|---|---|---|---|---|
| 1 | Cold boot (composeRuntime) | NFT-1 <2.5 s wall-clock in-browser | `cold-boot.json` p95 = 18.3 ms (headless composeRuntime only) | **UNVERIFIED** for real wall-clock (proxy only) |
| 3 | Tool latency (click→visible) | <50 ms p95 | `tool-latency.json` p95 = 10.5 ms, p99 = 27.3 ms (command pipeline only, no renderer) | proxy MET; **real (with renderer) UNVERIFIED** |
| 4 | Frame budget (interactive) | 16.6 ms p95 (60 FPS) | `frame-budget.json` p95 = 0.0075 ms (FrameScheduler drain only, no GPU) | proxy MET; **real 60 FPS with GPU UNVERIFIED** (and L-02/L-117/L-139 report heavy-scene nav is BROKEN) |
| 5 | Plan-view re-render | <100 ms p95 | `plan-view-redraw.json` p95 = 0.033 ms (store notify only, no canvas draw) | proxy MET; **real UNVERIFIED** |
| 7 | CRDT merge (2 users) | <80 ms p95 | `crdt-merge.json` p95 = 0.32 ms, 9,433 ops/s (**REAL Y.Doc merge**) | **MET (real)** |
| — | Cold load small/med/large | 80/800/1500 ms | `cold-load-real.json` cold = 7.1 / 257 / 336 ms | **MET (real, headless)** |
| 12 | Family load (200 params) | <200 ms | not located in run-output | **UNVERIFIED** |
| 13 | Schedule rebuild (10k rows) | <500 ms p95 | not located in run-output | **UNVERIFIED** |

**Bottom line:** the pure-compute/store budgets are met with real or proxy numbers, and CRDT-merge + cold-load are met with REAL measurements. **The two budgets that matter most for a public launch — real in-browser 60 FPS frame budget and tool-latency-with-renderer — are UNVERIFIED (no browser bench captured), and the founder log directly contradicts them on heavy scenes (L-02, L-117, L-131, L-139, L-372, L-377, L-382).**

### 4.3 Known slow paths (from audit + code)

- **L-02** — heavy 40-storey nav slow; root cause element instancing DEFAULT-OFF (`__pryzmElementInstancingV1`) → thousands of un-instanced draw calls; **FIX PENDING**.
- **L-131** — large multi-family (80-apartment Paris) initial generation too slow; independent-agent perf mandate.
- **L-369 / L-375b/c / L-376e** — generation **log-flood**: `CreateStairCommand.canExecute` dumps 37 store names + full levels array per stair; `CommandManager` EXECUTE/snapshot logs fire per command — ungated console spam degrading generation.
- **L-376d** — office core emits ~78 stairs + ~40–80 lifts per-element OUTSIDE `runBatch`, each an **O(N·M) structuredClone** snapshot; **P1 PERF**. (Partly addressed by 8e4f7f25 batch-non-wall-creation per MEMORY/commits.)
- **L-377** — building appears in 2–3 s then "takes way longer to FINISH" (post-geometry tail).
- **L-382** — "Finishing up / Compiling GPU shaders" appears NON-STOP even while navigating — WebGPU shader-compile tail on the auto-WebGL path (L-372: auto-WebGL heuristic still invokes WebGPU for shades).
- **L-372** — `[P1 - PERF + RENDER]` Auto-WebGL heuristic still drags WebGPU in for shadows/shades → slow. **This is a just-pushed area (Batch-2 renderer) — see working-tree note below.**
- General O(N²): L-03 load did `scene.traverse()` twice per add over a growing scene (fixed `§FIX-LOAD-TRAVERSE-BATCH`); OI-058 Scene Registry (id→Object3D) still pending to replace O(n) `scene.traverse`.

**Working-tree / Batch-2 renderer note.** `git status` at report time shows: `M apps/editor/src/rendering/createRenderer.ts` (uncommitted), deleted `docs/03-execution/queue/README.md` + one queue doc, and untracked `docs/04-reference/DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md`. Branch = `feat/wall-move-dimensions`. The coordinator noted the L-372 Batch-2 renderer change (createRenderer / RendererHandleFactory / initScene) was just pushed; `createRenderer.ts` is currently **modified in the working tree** (a renderer edit is in flight). The build + tests above were run against this working-tree state. Snapshot only — not evaluated for correctness.

---

## 5. Contract compliance cross-check (security / data-integrity / reliability contracts)

Evidence is from ACTUAL code, not the contracts' self-claims.

| Contract | Verdict | Evidence (file:line) |
|---|---|---|
| **C08 — Collaboration & Security** (Socket.io auth, room isolation) | **COMPLIANT** | `server.js:480` `join-project` calls `canUserAccessProject` (`server/projectAccess.js`), denies+`return` on `!allowed`, anonymous always denied; `server.js:541` `command-executed` requires `_socketInProjectRoom` (§B2) + `isValidCommandPayload` (H4). Fail-closed. Tested via `server/__tests__/permissions.test.ts`. |
| **C08 / P8 — Explicit sync conflicts** | **PARTIAL / NOT IMPLEMENTED** | L-53: `YjsDocAdapter.applyCommand` per-field `Y.Map` writes are silent LWW — concurrent `baseLine` edits lose data with **no user-resolvable conflict surfaced**, violating P8. L-375a: CRDT applier wiring partial. Real Y.Doc merge works for convergence (`crdt-merge.json`) but the **conflict-surfacing** half of P8 is not met. |
| **C13 — Project Lifecycle & Isolation** | **COMPLIANT (build-gate)** | Build isolation guard passes: 27 serialized singletons all registered, 54 scopes, 0 dead project-lifecycle DOM listeners (build output). BUT the same registry machinery causes 3 root-vitest files to fail at module load (`DoorStore.ts:227` barrel-at-load) — a reliability crack, not an isolation-correctness break. |
| **C05 — Persistence & File Format** | **PARTIAL** | Save/load path works for the happy path (`cold-load-real.json` real numbers), but multiple OPEN data rows: L-85 (elements missing after reopen), L-81 (duplication broken), L-83 (open 404), L-3 (autosave-during-load), L-376a (unbounded unsynced IndexedDB projects). Persistence round-trip integrity is **not launch-clean**. |
| **C03 — Schemas, Commands & State** (P5 pure schemas, P6 command-only mutation) | **COMPLIANT (enforced)** | CI guards exist: `check:commandmanager` (`scripts/check/ci-check-no-commandmanager.mjs`) forbids legacy `commandManager.execute()`; `check:isolation`; boundaries eslint plugin. Zod schemas gate mutations (annotation.create Zod-rejects bad ids, L-145). Build runs `tsc` + isolation before vite. |
| **C10 — Performance & Observability** (P8 spans, budgets) | **PARTIAL** | Budgets defined + bench harness exists (`apps/bench/.run-output/`), but real in-browser frame/tool-latency budgets are UNVERIFIED and heavy-scene perf is BROKEN per founder (L-02/117/139/372/382). P8 "every new exported function must add ≥1 OTel span" — **UNVERIFIED** (no scan run to confirm span coverage on new exports). |
| **C22 — Privacy & PII Tier** | **UNVERIFIED** | Not code-audited in this pass. A human must confirm PII handling in `server/` + AI proxy paths. |
| **C48 — Backup & DR** | **UNVERIFIED** | Not audited; L-133 (30–60s 503 per deploy, no zero-downtime) and L-137 (pooler saturation) are reliability concerns adjacent to DR. |

---

## 6. Summary table (one row per finding)

| Area | Severity | File/Location | One-line description |
|---|---|---|---|
| Deps | **P1** | `pnpm audit` (`reports/.pnpm-audit.txt`) | 93 vulns (7 critical / 28 high); runtime-relevant: jsPDF (LFI+injection+DoS), Multer, ws, form-data, protobufjs — none fixed |
| Tests | **P1** | root `npx vitest run` | Gate RED (exit 1): 3 door/dimension spec files fail at module load via `DoorStore.ts:227` barrel-at-load (register 0 tests) |
| Tests | **P2** | test scripts | No coverage tooling wired — coverage % UNVERIFIED; `pnpm -r test:ci` + Playwright E2E NOT RUN |
| Collab data-loss | **P0** | `YjsDocAdapter.applyCommand` (L-53) | Concurrent wall baseLine edit is silent LWW → data loss; violates P8 (no conflict surfaced) |
| Persistence | **P0** | reopen path (L-85) | Kitchen/wardrobe/lighting elements missing after project close→reopen |
| Persistence | **P1** | project copy/open (L-81, L-83) | Project duplication broken; opening project 404s latest-version |
| Persistence | **P1** | IndexedDB (L-376a) | ~30 local-only unsaved projects pile up, never flushed, no eviction cap |
| Persistence | **P1** | load path (L-3) | Heavy load times out + autosave-during-load can persist partial scene over good data |
| Collab | **P1** | CRDT applier (L-375a, L-376g) | Per-command real-time replication applier not fully wired (silent degrade) |
| Collab | **P1** | furniture dedup (L-18) | Collab catch-up re-creates furniture → duplicates on every reopen |
| Data integrity | **P1** | 3D undo (L-72) | Undo doesn't capture MOVE/ROTATE/property-change in 3D — edits unrecoverable |
| Perf | **P1** | heavy-scene nav (L-02/117/139/372/382) | 40-storey nav slow / device-loss crash / WebGPU shader tail non-stop; real 60 FPS UNVERIFIED |
| Perf | **P1** | office gen (L-376d) | ~78 stairs + lifts emitted per-element outside runBatch, each O(N·M) structuredClone |
| Perf | **P2** | gen log-flood (L-369/375b/c/376e) | Ungated per-command/per-stair console logging degrades generation |
| Bundle | **P2** | vite build | main 2.45 MB + engineLauncher 3.23 MB uncompressed; gzip never gate-measured (Wave-13 pending); RoomAutoOrganiser static+dynamic import defeats a split |
| GIS trust | **P1** | 3D-Site heatmaps (L-373a) | Wind/Temperature heatmaps render a heuristic field presented as analytical — misleading at launch |
| Infra | **P1** | deploy (L-133) | Every deploy = 30–60s full 503 outage (no zero-downtime rollout) |
| XSS surface | **P2** | 781× innerHTML/eval/dangerouslySetInnerHTML | Mostly static/escaped; UGC marketplace pages need a focused XSS pass (UNVERIFIED) |
| Auth | INFO/OK | `server/projectAccess.js`, `server.js:480/541/2847` | Auth fail-closed, ID-validated, ownership-scoped, socket-room gated — strong; gaps are route-level test coverage |
| Secrets | OK | repo-wide grep | No real secrets committed; `.env` gitignored + never in history; one placeholder in a docs file |
| SQL | OK | `server.js` `pool.query` | All parameterized; zero string-interpolation sinks found |
| Doc drift | **P2** | `CLAUDE.md`, contracts, bench notes | Cite `docs/03_PRYZM3/01-VISION.md` / `02-ARCHITECTURE.md` — directory does not exist (moved to `docs/01-strategy/` + archived) |
| Contract P8 | **P1** | C08/C10 | P8 conflict-surfacing not implemented (L-53); P8 "≥1 OTel span per new export" UNVERIFIED |
| Working tree | INFO | `apps/editor/src/rendering/createRenderer.ts` | L-372 Batch-2 renderer edit in flight (modified, uncommitted) at audit time — snapshot only |
