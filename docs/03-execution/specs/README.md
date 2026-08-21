# Specs — per-system normative specifications

> ⚠ **Re-measured 2026-08-21 (lane ANLZ1): 98 spec files — 43 numbered `SPEC-NN` + 55 special-named
> — plus 1 legacy `PLAN-*`.** This line read *"82 spec files (39 numbered + 43 special-named)"*, and
> the "Reconciled 2026-07-16" note below still carries that stale trio. **Both halves were wrong and
> the special-named count was wrong by 12.** This is the count-rot shape CLAUDE.md records against
> the contract range: a hand-copied census that nobody re-runs. **Re-run it, never re-transcribe it:**
> `ls docs/03-execution/specs/ | grep -c '^SPEC-'` → **98** ·
> `ls docs/03-execution/specs/ | grep -cE '^SPEC-[0-9]'` → **43**. Highest numbered is **SPEC-50**.
> The §2 table below is the authority; this line is a convenience and it has rotted twice.
> **Updated 2026-08-14**: **SPEC-50-RIBBON-HANDLER-BACKLOG** minted (the per-toolbar handler
> backlog surfaced by the founder's ribbon mount decision, ADR-0326/C82 — explicitly a BACKLOG,
> NOT A PROMISE; every count cited from the H6 census `ae659c96`). Highest numbered is now
> **SPEC-50**.
>
> **Updated 2026-08-13**: **SPEC-49-CIRCULATION-INTEGRITY** minted (generator output quality —
> the founder's unreachable-room / doorless-room / furniture-blocking-door report, measured at
> HEAD per typology).
>
> **Reconciled 2026-07-16**: count refreshed (39 numbered + 43 special-named = 82; highest numbered is **SPEC-48**; 14, 16–20, 22, 23, 25 remain unassigned/absent).

## §1 — What a spec is

A spec is the **engineering charter for a single capability**. It defines:

- **Wire format** — bytes / JSON / IFC entity shape
- **Schema tables** — Zod schemas, fields, defaults, validation
- **Algorithm** — pseudocode, step-by-step
- **Public API** — function signatures, types
- **Test obligations** — what the conformance suite checks
- **Performance targets** — if any (per [C10](../../02-decisions/contracts/C10-PERFORMANCE-AND-OBSERVABILITY.md))

A spec is NORMATIVE — code MUST conform to it. But specs sit BELOW contracts in the authority order; if a contract changes, the spec is updated to match.

## §2 — Numbering

Monotonic `SPEC-NN` (2-digit). Once assigned, never moves. Currently assigned through **SPEC-50** (with 14, 16–20, 22, 23, 25 unassigned) + a number of special-purpose SPEC-* without numbers (e.g. SPEC-APARTMENT-LAYOUT-GENERATOR).

The legacy plan `PLAN-GENERATIVE-DESIGN-SPRINTS.md` lives here too as a historical artefact.

## §3 — Anatomy

```markdown
# SPEC-NN — <Capability>

> **Stamp**: YYYY-MM-DD · **Status**: DRAFT | ACTIVE | SUPERSEDED
> **Depends on**: C03, C11, ADR-…
> **Owner**: <package or team>

## §1 — Scope
What this spec covers. What it does NOT cover (out-of-scope).

## §2 — Invariants
The rules code MUST obey.

## §3 — Schema
Tables, field types, defaults.

## §4 — Algorithm
Step-by-step pseudocode.

## §5 — API surface
Public functions + types.

## §6 — Conformance tests
What the test suite checks.

## §7 — Performance targets
If any.

## §8 — Migration
How to evolve when this spec changes.
```

## §4 — Full index (auto-generated 2026-07-16 from the file listing — regenerate with the script in DOCS-AUDIT-FINDINGS §8)

All spec files, sorted by filename. Numbered `SPEC-NN` (gaps: 14, 16–20, 22, 23, 25) + special-named `SPEC-*` + one historical `PLAN-*`.

| File | Title (linked) |
|---|---|
| `PLAN-GENERATIVE-DESIGN-SPRINTS` | [PLAN — Generative Design: parallel sprints (layout quality · performance · furniture)](./PLAN-GENERATIVE-DESIGN-SPRINTS.md) |
| `SPEC-01-GEOMETRY-KERNEL` | [SPEC-01 — Geometry Kernel (L4)](./SPEC-01-GEOMETRY-KERNEL.md) |
| `SPEC-02-PERSISTENCE` | [SPEC-02 — Persistence (L0) & `.pryzm` File Format](./SPEC-02-PERSISTENCE.md) |
| `SPEC-03-SYNC-CRDT` | [SPEC-03 — Sync, CRDT & Multi-User Semantics (L3)](./SPEC-03-SYNC-CRDT.md) |
| `SPEC-04-DRAWING-ENGINE` | [SPEC-04 — Drawing Engine, Plan View, Sections, View Templates](./SPEC-04-DRAWING-ENGINE.md) |
| `SPEC-05-TYPE-CATALOG` | [SPEC-05 — Element Type Catalog & Material Library](./SPEC-05-TYPE-CATALOG.md) |
| `SPEC-06-ROOMS-LEVELS` | [SPEC-06 — Rooms, Levels, Elevations & Spatial Hierarchy](./SPEC-06-ROOMS-LEVELS.md) |
| `SPEC-07-AI-LAYER` | [SPEC-07 — AI Layer (L7.5)](./SPEC-07-AI-LAYER.md) |
| `SPEC-08-SECURITY-COLLAB` | [SPEC-08 — Security, Multi-Tenancy & Collaboration](./SPEC-08-SECURITY-COLLAB.md) |
| `SPEC-09-PLUGIN-SDK` | [SPEC-09 — Plugin SDK & Marketplace (L6, D4)](./SPEC-09-PLUGIN-SDK.md) |
| `SPEC-10-OBSERVABILITY` | [SPEC-10 — Observability (P8, OTel)](./SPEC-10-OBSERVABILITY.md) |
| `SPEC-11-TESTING` | [SPEC-11 — Testing Strategy](./SPEC-11-TESTING.md) |
| `SPEC-12-BUNDLE-SPLITTING` | [SPEC-12 — Bundle Splitting & First-Paint Budget](./SPEC-12-BUNDLE-SPLITTING.md) |
| `SPEC-13-CONTEXT-ENVELOPES` | [SPEC-13 — Context Envelopes (Per-Family Pure-Kernel Inputs)](./SPEC-13-CONTEXT-ENVELOPES.md) |
| `SPEC-15-DEPLOYMENT-TOPOLOGY` | [SPEC-15 — Deployment Topology (Replit + External Cloud)](./SPEC-15-DEPLOYMENT-TOPOLOGY.md) |
| `SPEC-21-ELEMENT-CREATION-PROTOCOL` | [SPEC-21 — Element Creation Protocol (the canonical recipe)](./SPEC-21-ELEMENT-CREATION-PROTOCOL.md) |
| `SPEC-24-DATA-STORE-MAP` | [SPEC-24 — Data Store Map](./SPEC-24-DATA-STORE-MAP.md) |
| `SPEC-26-PRYZM-FILE-FORMAT` | [SPEC-26 — `.pryzm` File Format v1 (Binary, Portable, Versioned)](./SPEC-26-PRYZM-FILE-FORMAT.md) |
| `SPEC-27-MIGRATION-ROLLBACK` | [SPEC-27 — Migration & Rollback](./SPEC-27-MIGRATION-ROLLBACK.md) |
| `SPEC-28-AI-COST-MODEL` | [SPEC-28 — AI Cost Model & Budget Enforcement](./SPEC-28-AI-COST-MODEL.md) |
| `SPEC-29-VECTOR-PRIMITIVES` | [SPEC-29 — Vector Primitives & PDF Backend](./SPEC-29-VECTOR-PRIMITIVES.md) |
| `SPEC-30-PLAN-VIEW-PERFORMANCE` | [SPEC-30 — Plan-View Performance Budget & Architecture](./SPEC-30-PLAN-VIEW-PERFORMANCE.md) |
| `SPEC-31-LOAD-BENCH-AND-BACKPRESSURE` | [SPEC-31 — End-to-End Batch-Creation Bench, AI-Batch Back-Pressure, and Production-Scale Fixture Schedule](./SPEC-31-LOAD-BENCH-AND-BACKPRESSURE.md) |
| `SPEC-32-CDE-MODULE` | [SPEC-32 — CDE Module (ISO 19650 Status Codes + Approval Workflow)](./SPEC-32-CDE-MODULE.md) |
| `SPEC-33-STAKEHOLDER-REVIEW-WEDGE` | [SPEC-33 — Stakeholder Review Wedge (Viewer + Redline + Approval)](./SPEC-33-STAKEHOLDER-REVIEW-WEDGE.md) |
| `SPEC-34-HYBRID-DATA-SOVEREIGNTY` | [SPEC-34 — Hybrid Data Sovereignty (Local / Cloud / Hybrid Sync)](./SPEC-34-HYBRID-DATA-SOVEREIGNTY.md) |
| `SPEC-35-BROWSER-SECURITY-ENTERPRISE-HARDENING` | [SPEC-35 — Browser Security & Enterprise Hardening (BYOK + CSP/COOP/COEP + SOC2 + FedRAMP)](./SPEC-35-BROWSER-SECURITY-ENTERPRISE-HARDENING.md) |
| `SPEC-36-COBIE-EXPORT` | [SPEC-36 — COBie 2.4 Export](./SPEC-36-COBIE-EXPORT.md) |
| `SPEC-37-FEDERATED-CLASH-DETECTION` | [SPEC-37 — Federated Clash Detection](./SPEC-37-FEDERATED-CLASH-DETECTION.md) |
| `SPEC-38-MEP-SYSTEMS` | [SPEC-38 — MEP Systems (HVAC + Electrical + Plumbing-System + Sprinkler + Gas)](./SPEC-38-MEP-SYSTEMS.md) |
| `SPEC-39-EIR-BEP-TIDP-MIDP` | [SPEC-39 — EIR / BEP / TIDP / MIDP Document Chain](./SPEC-39-EIR-BEP-TIDP-MIDP.md) |
| `SPEC-3D-ANALYTICS-FIXES-AND-OVERLAYS` | [SPEC — 3D analytics fixes + climate overlays (code-grounded, 2026-06-17)](./SPEC-3D-ANALYTICS-FIXES-AND-OVERLAYS.md) |
| `SPEC-40-BUILDINGSMART-IFC4-CERTIFICATION` | [SPEC-40 — buildingSMART IFC4 Certification (Reference View + Design Transfer View)](./SPEC-40-BUILDINGSMART-IFC4-CERTIFICATION.md) |
| `SPEC-41-SHEET-SCHEDULE-4D-5D-EXTENSIONS` | [SPEC-41 — Sheet & Schedule Extensions for 4D / 5D](./SPEC-41-SHEET-SCHEDULE-4D-5D-EXTENSIONS.md) |
| `SPEC-42-ANALYSIS-BRIDGE-PROTOCOL` | [SPEC-42 — Analysis Bridge Protocol](./SPEC-42-ANALYSIS-BRIDGE-PROTOCOL.md) |
| `SPEC-43-SUSTAINABILITY-LCA-CARBON` | [SPEC-43 — Sustainability: LCA / Embodied + Operational Carbon / EPDs / BREEAM-LEED-WELL-Passivhaus](./SPEC-43-SUSTAINABILITY-LCA-CARBON.md) |
| `SPEC-44-CLOUD-BAKED-RENDERING` | [SPEC-44 — Cloud-Baked Rendering (Cycles + Mitsuba 3)](./SPEC-44-CLOUD-BAKED-RENDERING.md) |
| `SPEC-45-PDF-TO-BIM-PIPELINE` | [SPEC-45 — PDF-to-BIM Pipeline](./SPEC-45-PDF-TO-BIM-PIPELINE.md) |
| `SPEC-46-PLAN-CRITIQUE-WORKFLOW` | [SPEC-46 — Plan Critique Workflow](./SPEC-46-PLAN-CRITIQUE-WORKFLOW.md) |
| `SPEC-47-GENERATE-3-OPTIONS-WORKFLOW` | [SPEC-47 — Generate-3-Options Workflow](./SPEC-47-GENERATE-3-OPTIONS-WORKFLOW.md) |
| `SPEC-48-CONSTRAINT-SOLVER` | [SPEC-48 — Constraint Solver](./SPEC-48-CONSTRAINT-SOLVER.md) |
| `SPEC-49-CIRCULATION-INTEGRITY` | [SPEC-49 — Circulation Integrity (generator output quality)](./SPEC-49-CIRCULATION-INTEGRITY.md) |
| `SPEC-50-RIBBON-HANDLER-BACKLOG` | [SPEC-50 — Ribbon Handler Backlog (a backlog, not a promise)](./SPEC-50-RIBBON-HANDLER-BACKLOG.md) |
| `SPEC-ACCESS-GRAPH-AND-SPATIAL-GRAMMAR` | [SPEC — Access Graph & Spatial Grammar (residential generative layout)](./SPEC-ACCESS-GRAPH-AND-SPATIAL-GRAMMAR.md) |
| `SPEC-ANALYSIS-SURFACE-AND-WIDGETS` | [SPEC — Analysis Surface & Widget Catalogue](./SPEC-ANALYSIS-SURFACE-AND-WIDGETS.md) |
| `SPEC-APARTMENT-LAYOUT-GENERATOR` | [SPEC — Apartment Layout Generator (`apartment.generate-layout`) · the "50 + 1" capstone](./SPEC-APARTMENT-LAYOUT-GENERATOR.md) |
| `SPEC-ARCHITECTURAL-PROGRAM-RULES` | [SPEC — Architectural Program Rules (the room rule database)](./SPEC-ARCHITECTURAL-PROGRAM-RULES.md) |
| `SPEC-AUTODIMENSION` | [SPEC-AUTODIMENSION — Deterministic AutoDimension Engine](./SPEC-AUTODIMENSION.md) |
| `SPEC-BUILDING-PLAN-PREVIEW-DESCRIPTOR` | [SPEC — Building-plan preview descriptor (typology-agnostic preview kit)](./SPEC-BUILDING-PLAN-PREVIEW-DESCRIPTOR.md) |
| `SPEC-CANVAS-FLOATING-PANELS` | [SPEC — "Canvas" Floating Panel Cards (movable, glass, preview-inside)](./SPEC-CANVAS-FLOATING-PANELS.md) |
| `SPEC-CASA-UNIFAMILIAR-TYPOLOGY` | [SPEC-CASA-UNIFAMILIAR-TYPOLOGY — Single-Family House (the second typology)](./SPEC-CASA-UNIFAMILIAR-TYPOLOGY.md) |
| `SPEC-CEILING-LAYOUT-ENGINE` | [SPEC — Ceiling Layout Engine (D-CE) v1.0](./SPEC-CEILING-LAYOUT-ENGINE.md) |
| `SPEC-CIRCULATION-GRAPH` | [SPEC-CIRCULATION-GRAPH — Graph-theory residential circulation (founder, 2026-06-17)](./SPEC-CIRCULATION-GRAPH.md) |
| `SPEC-DYNAMIC-PROGRAM-CANVAS` | [SPEC-DYNAMIC-PROGRAM-CANVAS — the live, multi-view, direct-manipulation Program Canvas](./SPEC-DYNAMIC-PROGRAM-CANVAS.md) |
| `SPEC-ENVIRONMENTAL-DESIGN-DRIVERS` | [SPEC — Environmental & Architectural Design Drivers (house/typology layout)](./SPEC-ENVIRONMENTAL-DESIGN-DRIVERS.md) |
| `SPEC-FAMILY-EDITOR` | [SPEC — The PRYZM Family Editor (a.k.a. the Component Editor)](./SPEC-FAMILY-EDITOR.md) |
| `SPEC-FORMA-SITE-VIEW` | [SPEC — Forma-Style Site View (2D MapLibre ⇄ 3D Cesium, georeferenced)](./SPEC-FORMA-SITE-VIEW.md) |
| `SPEC-FURNISHING-STYLES` | [SPEC-FURNISHING-STYLES — Furnishing Style System (A.21.D19)](./SPEC-FURNISHING-STYLES.md) |
| `SPEC-FURNITURE-LAYOUT-ENGINE` | [SPEC — Deterministic Furniture Layout Engine (D-FLE) · BIM3.0](./SPEC-FURNITURE-LAYOUT-ENGINE.md) |
| `SPEC-GEODATA-ANALYTICAL-LAYERS` | [SPEC — Geodata Analytical Layers (Forma/Cesium draped layers, pluggable providers)](./SPEC-GEODATA-ANALYTICAL-LAYERS.md) |
| `SPEC-INTERIOR-STYLE-SYSTEM` | [SPEC-INTERIOR-STYLE-SYSTEM — Platform-wide Interior Design Style System](./SPEC-INTERIOR-STYLE-SYSTEM.md) |
| `SPEC-KITCHEN-WARDROBE-APPLIANCES` | [SPEC — Kitchen + Wardrobe I/L/U Runs & First-Class Kitchen Appliances](./SPEC-KITCHEN-WARDROBE-APPLIANCES.md) |
| `SPEC-KITCHEN-WARDROBE-WALL-DRIVEN` | [SPEC — Smart Kitchen & Wardrobe (Wall-Driven Generation)](./SPEC-KITCHEN-WARDROBE-WALL-DRIVEN.md) |
| `SPEC-LAYOUT-ALGORITHM-MASTER` | [MASTER — Residential Layout Algorithm, Engine & Orchestration (the unifying ruler)](./SPEC-LAYOUT-ALGORITHM-MASTER.md) |
| `SPEC-LAYOUT-CONSTRAINT-DATABASE` | [SPEC — Apartment Layout Constraint Database (BIM 3.0)](./SPEC-LAYOUT-CONSTRAINT-DATABASE.md) |
| `SPEC-LAYOUT-QUALITY-IMPROVEMENT` | [SPEC — D-TGL Layout Generation Quality Improvement](./SPEC-LAYOUT-QUALITY-IMPROVEMENT.md) |
| `SPEC-LIGHTING-LAYOUT-ENGINE` | [SPEC — Lighting Layout Engine (D-LE) v1.0](./SPEC-LIGHTING-LAYOUT-ENGINE.md) |
| `SPEC-LIVE-SINGLE-OPTION-LAYOUT-MODAL` | [SPEC-LIVE-SINGLE-OPTION-LAYOUT-MODAL — one best layout, living graph, live slider/graph editing](./SPEC-LIVE-SINGLE-OPTION-LAYOUT-MODAL.md) |
| `SPEC-LIVING-BUILDING-GRAPH` | [SPEC — Living Building Graph (A.21.D17) v1.1](./SPEC-LIVING-BUILDING-GRAPH.md) |
| `SPEC-LIVING-DESIGN-PARAMETERS` | [SPEC-LIVING-DESIGN-PARAMETERS — slider-driven, live-regenerating design parameters](./SPEC-LIVING-DESIGN-PARAMETERS.md) |
| `SPEC-MATERIALS-REPOSITORY` | [SPEC — Materials Repository (central, user-managed, element-fed)](./SPEC-MATERIALS-REPOSITORY.md) |
| `SPEC-NONRECT-APARTMENTS-CORRIDOR-FIRST` | [SPEC — Non-rectangular apartments (corridor-first reshape-not-drop)](./SPEC-NONRECT-APARTMENTS-CORRIDOR-FIRST.md) |
| `SPEC-OFFICE-GENERATION-ENGINE` | [SPEC — Office Generation Engine](./SPEC-OFFICE-GENERATION-ENGINE.md) |
| `SPEC-PARTY-WALL-AWARENESS` | [SPEC — Party-Wall Awareness (blind façades against neighbouring buildings)](./SPEC-PARTY-WALL-AWARENESS.md) |
| `SPEC-PROJECT-NORTH-AUTHORING-FRAME` | [SPEC — Project North authoring frame (RIGID-TRANSFORM-LAST)](./SPEC-PROJECT-NORTH-AUTHORING-FRAME.md) |
| `SPEC-PROJECT-OPEN-CREATE-PIPELINE` | [SPEC — Project Open / Create Pipeline](./SPEC-PROJECT-OPEN-CREATE-PIPELINE.md) |
| `SPEC-RECTANGULAR-DUAL-LAYOUT-SOLVER` | [SPEC — Rectangular Dual-Graph Layout Solver (Tier-4 geometric solver upgrade)](./SPEC-RECTANGULAR-DUAL-LAYOUT-SOLVER.md) |
| `SPEC-RENDER-TIERS-MASSING-AND-PRESENTATION` | [SPEC — Dual render tiers: Massing (Forma) + Presentation (Spacio)](./SPEC-RENDER-TIERS-MASSING-AND-PRESENTATION.md) |
| `SPEC-ROOM-MODULE-RULE-ENGINE` | [SPEC — Room-and-Module Rule Engine (kitchen reference, per-room general)](./SPEC-ROOM-MODULE-RULE-ENGINE.md) |
| `SPEC-ROOM-PLACEMENT-RULES` | [SPEC — Room-Placement Rules (Residential)](./SPEC-ROOM-PLACEMENT-RULES.md) |
| `SPEC-SEMANTIC-DESIGN-ASSISTANT` | [SPEC — Semantic Design Assistant (full semantic engine)](./SPEC-SEMANTIC-DESIGN-ASSISTANT.md) |
| `SPEC-SITE-PLAN-OVERLAY` | [SPEC — Site-plan overlay (georeferenced PDF/image boundary-capture aid)](./SPEC-SITE-PLAN-OVERLAY.md) |
| `SPEC-SPINE-FIRST-RESIDENTIAL-ENGINE-2026-06-21` | [SPEC — Spine-First Residential Layout Engine](./SPEC-SPINE-FIRST-RESIDENTIAL-ENGINE-2026-06-21.md) |
| `SPEC-STAIR-3D-CREATION` | [SPEC — Stair Creation in the 3D View](./SPEC-STAIR-3D-CREATION.md) |
| `SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE` | [SPEC — Deterministic Topological Generative Layout (D‑TGL) Engine · BIM3.0](./SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE.md) |
| `SPEC-TYPOLOGY-BRIEF-SCHEMA` | [SPEC — Typology Brief Schema + Dynamic Brief UI](./SPEC-TYPOLOGY-BRIEF-SCHEMA.md) |
| `SPEC-WALL-MOVEMENT-STUDY` | [SPEC — Wall Movement & Endpoint-Handle Study](./SPEC-WALL-MOVEMENT-STUDY.md) |
| `SPEC-WALL-SINGLE-VOLUME-CSG` | [SPEC — Wall as a Single Boolean-Void Solid (no abutting segments)](./SPEC-WALL-SINGLE-VOLUME-CSG.md) |
| `SPEC-WIND-CFD-LBM` | [SPEC — In-Browser Wind CFD (WebGPU Lattice-Boltzmann)](./SPEC-WIND-CFD-LBM.md) |

## §5 — When to write a new spec

You're writing a spec when:

- You're defining the **wire format** for a new file type or message.
- You're defining the **algorithm contract** for a new engine (apartment generator, sheet renderer, IFC exporter).
- You're defining the **schema** for a new domain type.

You're NOT writing a spec when:

- It's a UI / UX decision → `03-execution/plans/` or `05-guides/`
- It's a one-time roadmap → `03-execution/plans/`
- It's a per-decision rationale → `02-decisions/adrs/`
- It's a binding rule for everyone → `02-decisions/contracts/`

## §6 — Cross-reference

- Contracts that govern spec authoring: [C16 Command Authoring Protocol](../../02-decisions/contracts/C16-COMMAND-AUTHORING-PROTOCOL.md)
- Performance targets: [C10 Performance & Observability](../../02-decisions/contracts/C10-PERFORMANCE-AND-OBSERVABILITY.md)
- Schema purity (L0): [P5 in 01-strategy/STR-03-engineering-vision.md §2](../../01-strategy/STR-03-engineering-vision.md)
