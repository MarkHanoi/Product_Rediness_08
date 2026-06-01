# PRYZM — Contract Suite Index (C00)

> **Stamp**: 2026-05-31 · **Refreshed**: 2026-06-01 (folder restructure) · **Status**: CANONICAL
> **Authority**: these contracts govern every implementation decision in PRYZM.
> When code disagrees with a contract, the code is wrong — fix the code **or** open an ADR that supersedes the contract section; never do both.
>
> **Brand note**: "PRYZM 3" appears in some legacy contract bodies to mean "the current architectural epoch". The product name is **PRYZM** (no version suffix) — see [../../NAMING-CONVENTIONS.md §1](../../NAMING-CONVENTIONS.md). The internal epoch label survives only where historical context is the point.

---

## Conflict resolution order (strongest → weakest)

1. `docs/01-strategy/product-vision.md` — product + business vision (foundation)
2. `docs/01-strategy/engineering-vision.md` — engineering intent and principles (P1–P8)
3. `docs/01-strategy/architecture.md` — system shape, lint gates, convergence booleans
4. **This contract suite** — per-subsystem binding contracts (C01–C30)
5. `docs/02-decisions/adrs/` — per-decision rationale (45+ ADRs)
6. `docs/03-execution/specs/` — per-system normative specs (40+ SPECs)
7. `docs/02-decisions/contracts/archive/superseded-pryzm1-pryzm2/` — archived PRYZM1/2 contracts (informational only)

Cross-cutting docs that govern the contract suite as a whole:
- `docs/03-execution/plans/master-implementation-plan.md` — end-to-end synthesis + delivery plan
- `docs/03-execution/status/prior-art-audit-2026-05-31.md` — code-state audit grounding the master plan

If a contract and an ADR disagree, **the contract wins**; the ADR must be updated or a new ADR raised. If a contract and the Vision/Architecture docs disagree, **Vision/Architecture wins**; amend the contract.

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
| **C12** | [Geospatial & Coordinate Systems](./C12-GEOSPATIAL.md) | LTP-ENU rebasing (1 km recentre trigger), proj4js integration, IfcProjectedCRS read/write, logarithmic depth buffer for large-scale infrastructure projects | P1, P3, P8 |
| **C13** | [Project Lifecycle and Isolation](./C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) | Normative project session model (open/active/close/switch); isolation invariants preventing per-project state (BatchCoordinator, wall-rebuild flags, pending wall events, rAF handles) from leaking across project boundaries; teardown sequence; E2E testability gates; OTel span requirement. **AS-IS gaps**: 7 gaps (C13-G1–G7) — `pryzm-project-switch` only resets `_levelCamReady`; no `forceReset()` on BatchCoordinator; no teardown surface for closure-private flags. Implementation plan: `04-PLAN-FORWARD/35-PROJECT-ISOLATION-WAVE.md`. | P1, P3, P8 |
| **C14** | [Legacy Elimination & PRYZM3 Enforcement](./C14-LEGACY-ELIMINATION-AND-PRYZM3-ENFORCEMENT.md) | Deep audit of `packages/` (80), `plugins/` (46), `scripts/` (27), and `tools/ga-gate/` (15 gates). Catalogues 10 legacy-pattern categories (LP-01–LP-10) found during the 2026-05-16 audit. Classifies every package as COMPLIANT / TRANSITIONAL-ZONE / LEGACY-ZONE. Prohibits all PRYZM1/2 patterns in new code. Maps each pattern to a migration phase. Identifies 5 GA gate gaps (G-NEW-01–G-NEW-05) not yet covered by existing gates. **Key legacy zones**: `@pryzm/ai-host` (44 window-store reads, 20 CustomEvent dispatches), `@pryzm/command-registry` (165 structuredClone undo snapshots, global-bridge.ts), `@pryzm/core-app-model` (92 window accesses, active StoreEventBus), `plugins/annotations` (12 commands using window.xStore fallback). | P4, P5, P6 |
| **C15** | [Hosted Element / Host-Wall Contract](./C15-HOSTED-ELEMENT-CONTRACT.md) | Parametric offset model for doors and windows; opening void geometry lifecycle; wall baseline update dual-write invariant for void correctness; drag constraint (single-axis, HostedElementDragController); OpeningsChildrenMismatch guard; BaselineReversal guard; OTel requirements. **Added**: 2026-05-17, REGRESSION-DIAGNOSIS.md §R2. | P3, P5, P6 |
| **C16** | [Command Authoring Protocol](./C16-COMMAND-AUTHORING-PROTOCOL.md) | The single **front door** for authoring a new command: command anatomy (the two transitional backends — bus handler vs legacy `Command`); the §3 command taxonomy → reference exemplar; the 16 authoring invariants (CA-1…CA-16) and the copy-paste checklist (§10); batch coalescing performance contract (§8); AI-initiated commands (§9). Codifies two **binding doctrines**: **CA-DOCTRINE-L (level-oriented)** — every element command resolves/stamps/registers a `levelId` across the spatial, view, and render-visibility authorities; **CA-DOCTRINE-S (semantic-first)** — the semantic record is canonical and registered before geometry. Substrate contract for the Semantic Design Assistant (§9). **AS-IS**: OI-057 (post-batch wall-join correct but timing-implicit + untested; plugin-store retains pre-miter baselines); G-CA-L/G-CA-S CI gates pending. **Added**: 2026-05-25. | P5, P6, P7, P8 |
| **C17** | [Batch Creation Catalogue & Panel Binding](./C17-BATCH-CREATION-CATALOGUE-AND-PANEL-BINDING.md) | The single **registry** of batch-creation prompts: (a) the canonical catalogue (§4) of every batch command organised in the live `CREATE › Discipline › System › ⚡Batch › item` form (mirrors `CreatePanelLayout.ts CREATE_CONFIG`), (b) one shared NL **prompt string** per entry driving both the CREATE panel label and the AI prompt (§6), (c) the **panel-binding** rules CB-1…CB-8 (batch leaves are additive, dispatch a C16 batch command via `runBatch`, feasibility-gated with "Phase N" tooltips, scope-resolution in the command not the panel). Defines the batch **scope vocabulary** (§3: on-all-slabs, from-level-to-all-floors, per-room, per-facade, per-compartment, project…). Feasible-today (Phase 1, ✅) rows map to existing commands (`CREATE_WALLS_ON_ALL_SLABS`, `CREATE_SLABS_ON_ALL_FLOORS`, `CREATE_MULTIPLE_LEVELS`, `DUPLICATE_FLOOR_PLAN`, `CREATE_GRID_SYSTEM`, detect-rooms, roof-by-region); ⏳ rows unlock per `SPEC-SEMANTIC-DESIGN-ASSISTANT` phases. **§10–§11 = the AS-IS dispatch reference** (analysed 2026-05-25 before implementation): live path is `commandManager.execute` (Path A, the AIPanel path), per-command class + constructor args + bus-type + scope/selection resolution + preconditions + gaps (G-D1 DELETE_ALL_GRIDS has no command class; G-D2 DuplicateFloorPlan needs a target picker). Governed by C16. **Added**: 2026-05-25. | P6, P8 |
| **C24** | [Sheet Composition Engine](./C24-SHEET-COMPOSITION-ENGINE.md) | Governs the existing `plugins/sheets/` (PRYZM 2 S37 / ADR-0031) plus gap-fill to migrate it under the PRYZM 3 layered model. Codifies invariants for SheetStore, viewports, title blocks, widgets, book/sheet-set, and the rendering pipeline that produces vector output. Audit verdict: **AUDIT + EXTEND** (SheetStore + 11+ handlers + viewport + title-block + view-renderer + 6 widget types + book-exporter IMPLEMENTED; gaps are vector PDF backend, DXF backend, sheet UI in editor, dimension+annotation integration into sheets, section/elevation viewports). **Added**: 2026-05-31. | P2, P3, P5, P6, P8 |
| **C25** | [IFC Export (Production-Grade)](./C25-IFC-EXPORT-PRODUCTION.md) | Governs the existing `plugins/ifc-export/` (PRYZM 2 Phase 3-B Sprint S56) plus gap-fill to reach production-grade IFC4X3 coverage. Codifies invariants for `IFC4X3Exporter`, per-entity exporters, `IFCMetaStore` round-trip, Pset authoring, spatial structure completeness, classification, COBie. Audit verdict: **AUDIT + EXTEND** (IFC4X3Exporter + 6 element exporters + Pset round-trip IMPLEMENTED; gaps are IfcSite/IfcSpace/IfcZone/IfcFurniture coverage, IfcAnnotation, classification, COBie). **Added**: 2026-05-31. | P5, P8 |
| **C26** | [Revit Round-Trip](./C26-REVIT-ROUND-TRIP.md) | Bi-directional `.rvt`/`.rfa` ↔ `.pryzm` via IFC4 as canonical interchange, plus an optional external Python adapter for Revit-API-specific extensions (phasing / worksets / design options). No `.rvt` parsing in monorepo. Family mapping table, parameter translation via `IfcPropertySet`, level/view/sheet translation, 10-project reference suite for round-trip diff testing. Audit verdict: **GENUINELY NEW** — no Revit code in monorepo. **Added**: 2026-05-31. | P5, P8 |
| **C27** | [BIM 3.0 Inspect Model](./C27-BIM3-INSPECT-MODEL.md) | Spatial-intelligence inspection surface: master tree (Site → Building → Level → Apartment → Room → ElementType → ElementInstance), selection-driven isolation via `packages/visibility/` (P7), graphical dashboards per node type. `InspectSelectionStore` + `IsolationVisibilityIntent` + `SpatialRelationshipResolver` + `IsolationAnimator`. Coexists with `plugins/ifc-inspector/` (becomes element-instance sub-panel) and supersedes the flat `apps/editor/src/ui/PropertyInspector.ts` with documented migration plan. Audit verdict: **GENUINELY NEW** with migration of existing 80-file flat inspector. **Added**: 2026-05-31. | P3, P6, P7, P8 |
| **C28** | [Data Panel & Automation](./C28-DATA-PANEL-AND-AUTOMATION.md) | Live data layer for `check / automate / update / review`. Wraps the existing `plugins/schedules/` (PRYZM 2 S41 / ADR-0032) and adds: (a) unified grid across all element types, (b) quality-rules engine sourcing 266+ rules from the 248+ constraint DB + dimensional G-classes + topology A-classes, (c) bulk-edit commands through commandBus (P6). Tier 1/2/3 rule execution (on-edit / on-save / on-demand). Export to Excel/CSV/JSON/IFC-Pset/SQL. Cron scheduling + email-on-violation. Audit verdict: **AUDIT + EXTEND** (Schedule store + 6 handlers + formula DSL + reactive table + CSV/XLSX IMPLEMENTED; quality-rules + bulk-edit + unified grid are the gaps). **Added**: 2026-05-31. | P5, P6, P8 |
| **C29** | [PDF Vector Export](./C29-PDF-VECTOR-EXPORT.md) | Fills the typed-stub `packages/drawing-primitives/src/backends/pdf.ts` (PRYZM 2 ADR-0029) with a true vector PDF writer via `pdf-lib`. Font embedding, line-weight calibration, PDF/A-3 compliance, optional IFC-embed (single-deliverable PDF + IFC). Print-calibration test harness (1m × 1m validation). Audit verdict: **FILL TYPED STUB**. **Added**: 2026-05-31. | P5, P8 |
| **C30** | [Drawing Set Management](./C30-DRAWING-SET-MANAGEMENT.md) | Aggregates Sheets ([C24](./C24-SHEET-COMPOSITION-ENGINE.md)) into SheetSets with revision tracking, issue register, transmittal package (single PDF/A-3 cover + drawing register + N sheets via [C29](./C29-PDF-VECTOR-EXPORT.md)), automatic sheet numbering. Revision status state machine (`draft → issued → superseded`, one-way). Revision-cloud annotations bound to revision ids. Audit verdict: **AUDIT + EXTEND** (`plugins/sheets/src/book/book-exporter.ts` PRYZM 2 S37 implements multi-sheet composition; revision tracking + issue register + transmittal generator are gaps). **Added**: 2026-05-31. | P6, P8 |
| **C31** | [Documentation Authoring Protocol](./C31-DOCUMENTATION-AUTHORING-PROTOCOL.md) | The binding rules for how every document in `docs/` is written, named, structured, versioned, and superseded. Anatomies for contract / ADR / spec / plan / status / guide / reference. Filename patterns enforced by `check-doc-naming.ts`. Immutability of sealed docs enforced by `check-{adr,contract,snapshot}-immutability.ts`. **Added**: 2026-06-01. | (cross-cutting — all P) |
| **C19** | (reserved) Site Model & Parcel | Site / parcel / building footprint / context-buildings schemas. **Status**: PROPOSED — see [MISSING-CONTRACTS-AUDIT-2026-06-01.md §3.1](../MISSING-CONTRACTS-AUDIT-2026-06-01.md). | TBD |
| **C20** | (reserved) Building & Apartment Aggregates | Building → level → apartment → room hierarchy formalisation. **Status**: PROPOSED. | TBD |
| **C21** | (reserved) Climate Ingestion | EPW reader · NOAA climate normals · solar+wind+temp aggregates · per-site cache. **Status**: PROPOSED. | TBD |
| **C22** | (reserved) Privacy & PII Tier | What gets stored where, with what retention. GDPR / CCPA / BYOK boundaries. **Status**: PROPOSED. | TBD |
| **C23** | (reserved) Provenance & AI Audit | Every AI-generated artefact traces inputs · prompts · model · cost · timestamp. **Status**: PROPOSED. | TBD |

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
2. If the change alters a CI gate or convergence boolean, update `docs/01-strategy/architecture.md §8` and `03-CURRENT-STATE.md §1` in the same commit.
3. If the change reverses an ADR decision, raise a superseding ADR first; then amend the contract to cite the new ADR.

---

## What is NOT a contract

- Sprint plans → `docs/archive/pryzm3-internal/04-PLAN-FORWARD/`
- Current status → `docs/archive/pryzm3-internal/03-CURRENT-STATE.md`
- Per-decision rationale → [`../adrs/`](../adrs/)
- Per-system normative spec → [`../../03-execution/specs/`](../../03-execution/specs/)
- Implementation plans → [`../../03-execution/plans/`](../../03-execution/plans/)

## Gaps + roadmap

- **18 contracts proposed but not yet written**. See [MISSING-CONTRACTS-AUDIT-2026-06-01.md](../MISSING-CONTRACTS-AUDIT-2026-06-01.md) — gap analysis covering site model, climate, privacy, provenance, DXF/Rhino interchange, print standards, COBie FM, clash detection, 4D/5D, pricing tiers, marketplace economics, telemetry consent, accessibility, mobile, i18n, file-format versioning, backup/DR, multi-region.
- **C31 is DRAFT** and ratifies on first PR after stakeholder sign-off.
- C19-C23 reserved slots are top-priority. See the audit doc for proposed sequence.
- Per-decision rationale → `docs/02-decisions/adrs/`
- Per-system normative spec (wire format, schema tables) → `docs/03-execution/specs/`
