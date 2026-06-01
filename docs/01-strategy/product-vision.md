# PRYZM — Product Vision, Business Strategy, Workflow Architecture & Operating Model

> **Version 1.0** — Foundation Document
> **Domain**: `pryzm.so`
> **Status**: CANONICAL — Internal · Confidential
> **Authority**: This document is the **foundational vision** for PRYZM. It sits above `01-VISION.md` (the engineering-vision sibling) and below no other doc. Any conflict between this doc and a downstream contract/spec is resolved in favour of this doc, then `01-VISION.md`, then `02-ARCHITECTURE.md`, then C-contracts. See [PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md](PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md) for how this vision maps to delivery.

---

## NORTH STAR

> **PRYZM is the design intelligence platform for the built environment** — the first tool where a single conversation can take a project from raw site to coordinated building model, with every spatial, environmental, and regulatory constraint baked in from the first prompt.

---

## 1. Executive summary

Architecture and design today is broken at the workflow level. Software has become more powerful but harder to use. BIM systems store geometry; they do not store intent. AI tools generate images; they do not generate buildings. Environmental data sits in separate systems. Regulatory constraints live in PDFs. Generative tools produce objects, not places.

PRYZM exists to fix this. It is a **design intelligence platform** — an AI-native environment where architects, developers, and designers author buildings through conversation and constraint, not through manual modelling alone. Every layer of the platform — from geolocation to furniture placement — is connected into a single coherent workflow.

This document defines the **why**, the **how**, and the **what** of PRYZM. It is the foundational vision for all development decisions over the next five to ten years.

### What PRYZM is — in one sentence

| | |
|---|---|
| **WHAT** | PRYZM is an AI-native design intelligence platform that takes a project from site selection to coordinated BIM model — through conversation, generative design, and real-time environmental intelligence. |

---

## 2. Why PRYZM exists — the problem

### 2.1 The industry pain

Architecture and construction is a **$13 trillion global industry** running on fragmented, disconnected software. The problems are structural:

| Problem | Detail |
|---|---|
| **BIM complexity** | Revit and ArchiCAD have 30-year-old interaction paradigms. Learning curves of months. Every project starts from scratch. |
| **No design intelligence** | Current tools store shapes. They do not know what a living room is, what adjacency rules apply, or whether a layout is compliant. |
| **Disconnected environmental data** | Sun, wind, climate, and shadow analysis live in separate specialist tools that most architects never open. |
| **Manual modelling dominates** | A skilled architect can spend weeks drawing something an AI could generate in minutes — if the AI understood buildings. |
| **Poor interoperability** | IFC is the universal format but BIM-to-BIM workflows are routinely broken. Data is lost at every handover. |
| **No conversational interface** | You cannot tell Revit "add a second bedroom and push the living room to face south." You draw. Always manually. |
| **Generative tools miss the point** | Image generation produces pictures of buildings, not buildings. There is no constraint, no regulation, no geometry. |

### 2.2 The opportunity

The convergence of **large language models**, **constraint-based generative design**, and **real-time 3D rendering** creates a window that did not exist before 2023. PRYZM enters that window with:

- A proprietary **constraint database** (248+ architectural rules) that gives AI spatial intelligence
- A working **generative apartment and multi-apartment layout engine**
- A **furniture placement engine** with door-vector-aware spatial reasoning
- An **IFC authoring pipeline** for real BIM output
- A **command bus** and contract architecture designed for AI-first workflows
- An existing domain (`pryzm.so`) and working development environment

---

## 3. How PRYZM solves it — the platform philosophy

PRYZM is built on **five principles** that distinguish it from every existing tool:

| Principle | What it means in practice |
|---|---|
| **Conversation-first authoring** | Every workflow begins with a natural language prompt. The RAC (Rapid Authoring Chatbot) drives project initiation. Batch AI commands drive generation. Users author buildings the way they brief architects — by describing intent. |
| **Site-grounded design** | Before any geometry is created, PRYZM anchors the project to a real plot. Geolocation drives orientation, sun paths, wind, shadows, and context — automatically. Design intelligence begins at latitude and longitude. |
| **Constraint-aware generation** | The platform carries 248+ architectural, regulatory, and spatial constraints. Generated layouts are valid by construction — not fixed after the fact. The ROOM_RULES database is the single source of truth for spatial logic. |
| **Living BIM model** | PRYZM does not store geometry alone. It stores intent, constraints, relationships, and performance targets alongside geometry. Changing a room's target area adapts the layout dynamically. |
| **Human + AI collaboration** | AI generates, humans review and refine. Manual authoring, batch AI commands, and conversational authoring coexist in the same session. The human is always in control. |

### 3.1 The technical philosophy

- **AI commands are routed through a command bus** — every action is auditable and reversible
- **Contracts (not scripts) define the relationship between systems** — predictable, testable interfaces
- **The constraint database is the law** — no generated output bypasses it
- **IFC is the canonical output format** — PRYZM exports real, interoperable BIM
- **The platform is layered** — each layer can evolve independently without breaking others

---

## 4. What PRYZM is — the product

### 4.1 Current working systems (as of 2025–2026)

The following systems are partially or fully implemented. They form the core of Phase 1:

| System | Status / capability |
|---|---|
| AI command engine | Natural language to design action. Routing, parsing, execution. |
| RAC workflow | Conversational project initiation chatbot. |
| Apartment generation | Single-unit layout from brief — rooms, adjacency, furniture. |
| Multi-apartment generation | Full floor-plate: core, lift, stairs, corridor, multiple units. |
| Furniture placement (D-FLE) | Door-vector-aware furniture layout per room archetype. |
| ROOM_RULES database | 11 room types, 248+ constraints, privacy gradient, adjacency rules. |
| BIM authoring | IFC-compliant geometry creation and export. |
| IFC import / export | Interoperability with Revit, ArchiCAD, and other BIM tools. |
| Cesium integration | Real-world terrain, site context, and 3D globe visualisation. |
| Command bus | Auditable, reversible action pipeline for all AI and manual commands. |
| Contract architecture | Typed interfaces between all platform subsystems. |
| Geometry engines | Polygon, mesh, and plan geometry for all room and building types. |
| Rendering engines | Real-time visual output of generated and authored models. |
| Activity systems | User activity tracking within the design session. |

### 4.2 The platform in nine layers

PRYZM organises its capabilities into **nine platform layers**, ordered from foundation to delivery:

| Phase | Name | Horizon | Priority focus |
|---|---|---|---|
| Layer 1 | Site intelligence | Available now | Cesium, GIS, plot boundary, sun/wind/climate data derivation |
| Layer 2 | Project definition | Available now | RAC chatbot, typology selection, brief capture, constraint activation |
| Layer 3 | Existing conditions | Partial | IFC import working; PDF/image-to-BIM needs robustness work |
| Layer 4 | Design authoring | Available now | Manual, batch AI, conversational, hybrid modes all operational |
| Layer 5 | Generative design | Available now | Apartment + multi-apartment + furniture generation working |
| Layer 6 | Design intelligence | Partial | Constraint validation working; daylight, energy analysis planned |
| Layer 7 | Living BIM model | In progress | Geometry + constraints stored; intent + performance targets next |
| Layer 8 | Collaboration & delivery | Planned | Drawing production, export, handover workflows |
| Layer 9 | Digital twin | Phase 3 | Live sensor integration, building operations, FM data |

> **Mapping to engineering layers**: the 9 product layers above describe **user-facing capability tiers**. The engineering 8-layer model in `02-ARCHITECTURE.md` (L0 schemas → L7.5 transitional) describes **package dependency tiers**. The two models are orthogonal. The master implementation plan ([PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md](PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md)) reconciles them.

---

## 5. The ideal user journey

The following describes the **target end-to-end workflow** for a first-time PRYZM user creating a new residential project. This is the workflow PRYZM must deliver by the end of Phase 1.

### Step 1 — Enter PRYZM (`pryzm.so`)

The user navigates to `pryzm.so`. They are greeted by a clean, minimal interface. No toolbar. No palette. A single conversational input and a three-dimensional site view.

New users are **not** asked to log in immediately. The first interaction is always the chatbot. Account creation happens **after** the first project is initiated — reducing friction to near zero.

| | |
|---|---|
| **UX INTENT** | The first screen communicates: "Tell us what you want to build." Everything else is secondary. No onboarding wizard. No empty canvas. The conversation starts immediately. |

### Step 2 — RAC: project initiation chatbot

The **RAC (Rapid Authoring Chatbot)** drives the entire initiation sequence. It asks structured questions in natural language, adapting based on answers. The sequence is:

| Question | Purpose |
|---|---|
| **Q1: Project type** | "What do you want to create?" — Apartment / house / residential building / office / school / refurbishment / extension / fit-out / commercial / other |
| **Q2: Site location** | "Where is the project?" — Address, city, or plot coordinates. Triggers automatic geolocation and site model generation. |
| **Q3: Scale** | "How large is the project?" — Single unit / multiple units / floor area target / number of bedrooms |
| **Q4: Existing conditions** | "Is there anything existing on site?" — Empty plot / existing building / drawings / IFC file / photos |
| **Q5: Regulatory context** | "Which standards apply?" — Detected automatically from geolocation; user confirms or overrides |
| **Q6: Brief summary** | RAC summarises the brief back to the user and asks for confirmation before generating anything |

### Step 3 — Site definition & geolocation

Once the location is confirmed, PRYZM **automatically** generates a site model. This is a mandatory foundation layer — all subsequent design is anchored to real-world geography.

The site model derives automatically:

- Plot boundaries from GIS/cadastral data
- Latitude and longitude for accurate solar calculations
- Orientation and cardinal directions
- Sun paths for every season
- Prevailing wind direction and exposure
- Climate zone and weather data
- Shadow analysis from context buildings
- Topography and level changes
- Street context and access points

| | |
|---|---|
| **DESIGN NOTE** | The site UI must be clean and light — **not** the heavy dark globe of Cesium by default. A cream/warm-white map aesthetic (similar to Hektar or Felt) with a clear plot selection tool. The user defines the plot boundary; PRYZM derives everything else silently. |

### Step 4 — Existing conditions

Based on the RAC's Q4 answer, the workflow branches into one of four paths:

| Entry point | Workflow |
|---|---|
| **Empty site** | Skip directly to Step 5. The outer envelope is generated from the plot boundary and planning constraints. |
| **IFC import** | User uploads an IFC file. PRYZM parses it, extracts room geometry and data, and populates the living BIM model. The designer reviews and proceeds from the imported baseline. |
| **PDF / DWG / image import** | User uploads drawings. PRYZM attempts to extract geometry using OCR and line-detection. **NOTE**: this workflow requires significant robustness work — it is not production-ready and should be clearly marked as beta. |
| **Existing building (refurbishment)** | User describes or photographs the existing building. RAC captures key dimensions and constraints. A simplified existing conditions model is generated as the baseline. |

### Step 5 — Design authoring

With site and existing conditions established, the user begins authoring. PRYZM offers **four co-existing modes**:

- **Manual authoring** — traditional BIM tools, wall drawing, room placement, door/window insertion
- **AI conversational authoring** — *"add a master bedroom facing south with an ensuite"* — single commands
- **Batch AI authoring** — structured multi-step generation requests (full apartment, full floor plate)
- **Hybrid authoring** — AI generates a base layout; human refines room by room

For residential projects, the generative design engine activates in batch mode. The ROOM_RULES database enforces spatial logic. Generated layouts are valid by construction.

### Step 6 — Design intelligence layer

After initial layout generation, the **design intelligence layer** activates. It runs in the background and flags issues in real time:

- **Constraint validation** — all 248 rules checked; violations highlighted with DB-xxx reference
- **Daylight analysis** — rooms checked against mandatory window requirements
- **Adjacency quality score** — preferred adjacencies scored; improvements suggested
- **Circulation efficiency** — corridor length, dead ends, accessibility checked
- **Code compliance** — regulatory minimums checked per jurisdiction

Future analysis systems (energy, wind, acoustic) are added in Phase 2.

### Step 7 — Living BIM model

The generated design is stored not as static geometry but as a **living BIM model**. Every element carries:

- **Geometry** — polygon/mesh representation
- **Type and intent** — room type, occupancy, programme
- **Constraints** — which rules apply and whether they pass
- **Relationships** — adjacency, access, structural, service
- **Performance targets** — daylight target, area target, occupancy

Changing a performance target adapts the layout dynamically. The model is always internally consistent.

---

## 6. Deployment & environment strategy

### 6.1 Environments

PRYZM runs across **four environments**. Each has a distinct purpose and access level:

| Environment | Purpose |
|---|---|
| **Local (dev)** | Each developer's local machine. Hot reload. Full debug access. No real user data. Runs against a local DB and a mocked Cesium tile server. |
| **Test** | Automated CI environment. Runs the full test suite including constraint DB tests, layout engine tests, and contract validation. No UI required. |
| **Staging (`stage.pryzm.so`)** | Pre-production mirror. Full stack. Real Cesium tiles. Used for QA, stakeholder demos, and regression testing. Not indexed by search engines. |
| **Production (`pryzm.so`)** | Live environment. Monitored, rate-limited, backed up. Feature flags gate unreleased features. Zero-downtime deployments. |

### 6.2 Release process

- All changes go through a pull request — **no direct commits to main**
- Feature branches: `feature/[ticket-id]-short-description`
- Merges to `main` trigger the test environment automatically
- Staging is promoted manually after QA sign-off
- Production releases are tagged with semantic versioning (`vMAJOR.MINOR.PATCH`)
- Hotfixes follow a `hotfix/[description]` branch pattern, merged directly to `main` and backported

The release checklist for any production deployment includes: all tests passing, constraint DB consistency test passing, staging smoke test signed off, rollback plan documented.

---

## 7. Market positioning

### 7.1 Who is the customer?

PRYZM serves a **tiered customer base**, entered in this order:

| Segment | Profile |
|---|---|
| **Phase 1 — Architects (SME)** | Practices of 2–20 people. Currently using Revit or ArchiCAD. Frustrated by complexity and cost. Willing to try AI tools. Primary use case: residential design. |
| **Phase 1 — Residential developers** | Small and mid-size developers who commission residential schemes. Need fast feasibility layouts and compliance checking. High value per project. |
| **Phase 2 — Interior designers** | Fit-out, refurbishment, and FF&E design. Need furniture placement, space planning, and client presentation tools. |
| **Phase 2 — Homeowners / self-builders** | High volume, lower value per user. Self-service design for extensions, conversions, and new builds. |
| **Phase 3 — Large practices / contractors** | Enterprise accounts. Need full BIM authoring, IFC interoperability, and collaboration workflows. |
| **Phase 3 — Building operators** | Digital twin and FM use cases. Long-term recurring revenue. |

### 7.2 Competitive positioning

| Competitor | How PRYZM differs |
|---|---|
| **vs Revit / ArchiCAD** | PRYZM is not a replacement BIM tool. It is an AI-native front-end that outputs IFC — interoperable with both. Architects use PRYZM to generate and PRYZM or Revit to produce. |
| **vs Autodesk Forma** | Forma is site-level massing. PRYZM goes to room level, furniture level, and regulatory compliance. Different depth. |
| **vs Midjourney / AI image tools** | Image generators produce pictures, not buildings. PRYZM produces geometry, constraints, and BIM data. |
| **vs Hypar / Viktor** | Parametric generation platforms for developers. PRYZM is user-facing — no coding required. |
| **vs Spacemaker (acquired by Autodesk)** | Site planning focus. PRYZM covers the full project lifecycle from site to interior. |

---

## 8. Gap analysis — current vs target

### 8.1 Critical gaps (Phase 1 blockers)

| Gap | Description |
|---|---|
| **PDF/image-to-BIM** | Current implementation is not robust or precise. Geometry extraction from scanned drawings is unreliable. Must be reworked or clearly gated as beta with user expectation management. |
| **Site UI aesthetic** | Cesium default dark globe UI is not appropriate for a design-audience product. Needs a cream/light map UI with clean plot selection tools. |
| **Multi-apartment validation** | The floor-plate generator needs a complete validation pass: core dimensions, Part M compliance, flat entrance door directions. |
| **RAC integration** | The chatbot initiation flow needs to be connected end-to-end to the generation engine. Currently separate. |
| **End-to-end workflow test** | There is no documented test that takes a user from "new project" to "exported IFC" in a single session. This must exist. |

### 8.2 Phase 2 priorities

- Energy analysis integration
- Daylight simulation (beyond rule-checking)
- Drawing production and annotation
- Collaboration and multi-user sessions
- Extended typology support (offices, schools, retail)
- Robust PDF/DWG import with human-in-the-loop correction

### 8.3 Critical gaps inserted by [PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md](PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md) (this revision)

| Gap | Addressed by |
|---|---|
| **Architecturally sound Sheet & PDF export** (current PDF is a raster screenshot — not a publication-grade drawing sheet) | Master Plan Part IV §8 — Sheet Composition Engine (SCE) + Contract `C24` |
| **Production-grade IFC export** (IfcSite/IfcSpace/IfcZone incomplete; Psets partial; no IFC4X3 validation gate) | Master Plan Part IV §7 + Contract `C25` |
| **Native Revit round-trip** (no documented import/export path; consultant hand-off broken) | Master Plan Part IV §9 + Contract `C26` |
| **Author / Inspect / Data panel** (current panel is a flat property list with no model awareness, no isolation mode, no data automation) | Master Plan Parts V–VI + Contracts `C27`, `C28` |
| **Drawing set management** (no sheet set, no revisions, no transmittals) | Master Plan Part IV §8 + Contract `C30` |

---

## 9. Phased roadmap

| Phase | Name | Horizon | Priority focus |
|---|---|---|---|
| **Phase 0** | Foundation | Done | Constraint DB, ROOM_RULES, apartment engine, D-FLE, command bus, IFC, Cesium |
| **Phase 1** | Connected workflow | 0–6 months | RAC end-to-end, site UI, multi-apt validation, environments, `pryzm.so` launch |
| **Phase 1b** | Intelligence layer | 3–9 months | Daylight, compliance, adjacency scoring, performance-driven adaptation |
| **Phase 2** | Platform breadth | 6–18 months | New typologies, drawing production, collaboration, PDF import robustness |
| **Phase 2b** | Market expansion | 12–24 months | Interior designer tools, homeowner self-service, developer feasibility |
| **Phase 3** | Enterprise & twin | 18–36 months | Large practice BIM, contractor workflows, digital twin, FM integration |

> **Cross-link**: the master implementation plan ([PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md](PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md)) overlays four new delivery tracks (IFC-α/β/γ/δ, SCE-α/β/γ/δ, RVT-α/β/γ, INS-α/β/γ + DAT-α/β/γ) onto this phased roadmap.

---

## 10. Guiding principles for all future development

Every decision about what to build next should be tested against these principles:

- **The constraint database is law.** No generated output bypasses it. Adding a new typology means adding its rules first.
- **Conversation before UI.** Every new capability should be accessible via a natural language command before a graphical control is built.
- **Site first.** Any feature that ignores real-world geography is a temporary measure. All design should eventually be site-grounded.
- **BIM output is non-negotiable.** PRYZM produces real interoperable geometry. Image generation is never a substitute.
- **Fail loudly on constraints.** When a layout violates a rule, the system must tell the user which rule, why it was violated, and what to do about it.
- **The human is always in control.** AI generates proposals. Humans approve them. No autonomous action without confirmation.
- **Environments are always clean.** Local, test, staging, and production are always in a known state. No "it works on my machine."

---

## Document control

| | |
|---|---|
| **Version** | 1.0 |
| **Status** | Foundation draft — CANONICAL for internal review |
| **Domain** | `pryzm.so` |
| **Next review** | After Phase 1 RAC integration complete |
| **Downstream** | [01-VISION.md](01-VISION.md) (engineering vision) · [02-ARCHITECTURE.md](02-ARCHITECTURE.md) (8-layer model) · [PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md](PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md) (delivery plan) |
