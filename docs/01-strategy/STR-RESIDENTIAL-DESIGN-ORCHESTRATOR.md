# STR-RESIDENTIAL-DESIGN-ORCHESTRATOR — PRYZM: Human-Driven Residential Design Orchestrator

> **Provenance.** Founder-authored product specification, captured **2026-09-03**.
> This document is a **verbatim capture of founder intent**, reconstructed faithfully into 23
> sections. It is a *strategy* document in the sense of the conflict-resolution order in
> `CLAUDE.md` — it states **what the product must do**, not how it is built and not what is
> currently true of the code.
>
> ⛔ **Nothing in this document is a claim about the current state of the repository.** Every
> section describes a target. The measured, per-section inventory of what already exists —
> EXISTS-AND-WIRED / EXISTS-BUT-UNWIRED / PARTIAL / ABSENT — lives in
> [`docs/03-execution/plans/RESI-ORCHESTRATOR-PLAN.md`](../03-execution/plans/RESI-ORCHESTRATOR-PLAN.md),
> which is the authority on state. Read the plan for state; read this for intent.
>
> **Status:** captured, not yet ratified as a contract. Where this spec and an existing contract
> (`C63`, `C84`, `C11`, `C16`, `C03`) disagree on mechanism, the contract governs mechanism and
> this document governs the product goal; raise an ADR to reconcile.

---

## §Role — the PRYZM Residential Design Orchestrator

PRYZM is **not** a "design a house in one click" product.

The role is to **help a human** — an architect, a builder, a designer, a developer, or a
non-specialist homeowner — go from

> *"I have this parcel"*

to

> *"I understand what I can build, what I want, and how to develop it"*

through a **guided, interactive, data-driven process**.

The orchestrator's job is to **orchestrate EXISTING capabilities** and **expose them through
excellent UX**. It continuously connects:

- planning / parcel law
- real site data
- 3D context
- sun and shadow
- buildable envelopes
- user requirements
- room relationships
- 2D plan
- 3D design
- BIM elements
- quantities
- cost
- compliance

— as **ONE connected live design system**.

---

## §1 — Philosophy: guide the human, do not replace the human

**GUIDE THE HUMAN — DO NOT REPLACE THE HUMAN.**

The system advances through **progressive levels**:

```
Parcel
  → Law
    → Buildable Potential
      → Massing
        → Requirements
          → Spatial Relationships
            → Room Envelopes
              → Architectural Elements
                → BIM Building
                  → Detailed Design
```

**At every stage the user stays in control.**

At every stage the AI must:

- explain what is possible
- explain **why**
- highlight constraints
- suggest alternatives
- visualize consequences
- allow modification
- recalculate immediately
- maintain consistency across data, 2D, 3D, and relationships

**Never hide important decisions behind automation.**

---

## §2 — Start with the parcel

The entry point is a **rich Parcel / Planning Law workspace**. It must present three clearly
separated groups.

**PARCEL**
- area
- perimeter
- bounding box
- boundary edges
- street frontage
- cadastral boundary
- cadastral info

**PLANNING**
- max height
- max storeys
- max FAR
- max site coverage
- max implementation / footprint area
- max gross buildable area
- other constraints
- **a SOURCE / CITATION for each regulatory value**

**MASSING POTENTIAL**
- max buildable footprint
- footprint / parcel ratio
- max GFA
- study volume
- buildable area per level
- max height
- number of possible levels

**Clearly distinguish REGULATORY values from PRYZM STUDY / CALCULATED values.**
**Never present a study calculation as an approved permit.**

---

## §3 — Connect the data to the 3D site

The panel and the 3D site are **bidirectionally highlighted**. Selecting a value highlights the
geometry it describes:

| Select | Highlights |
| --- | --- |
| Area | the parcel |
| Perimeter | the boundary |
| Street frontage | the relevant edges |
| Max footprint | the buildable envelope |
| Max height | the vertical limit |
| Max GFA | the resulting potential |

The user must **always understand "what does this number mean physically?"**

---

## §4 — Contextual site intelligence

The workspace must know and use:

- surrounding buildings
- LOD100 / LOD200 context
- existing buildings on the parcel
- proximity
- street relationships
- views
- sea views
- open views
- orientation
- sun exposure
- shadows
- privacy / visibility
- parking and access

**Use this intelligence to DRIVE recommendations, not merely to display it.**

---

## §5 — The buildable envelope comes BEFORE architecture

Establish the envelope before any architectural commitment.

**Worked example.**

- parcel: **1,200 m²**
- max ground implementation: **200 m²**
- max total GFA: **320 m²**

The user says: *"I want about 120 m² on the ground floor."*

PRYZM then:

1. shows the **200 m² maximum envelope**
2. creates a **proposed 120 m² ground-floor envelope**
3. visualizes it in **3D**
4. shows it in **plan**
5. shows the **remaining potential**
6. explains the **effect on upper floors**
7. **continuously checks against constraints**

**Geometry updates live.**

---

## §6 — Natural intent

Intent may arrive through any of:

- chat / RAC
- structured attributes
- direct manipulation
- UI controls

**Example instruction:**

> *"About 180 m² gross on the ground floor, ideally L-shaped, oriented south, with the best
> possible sea view."*

This is parsed into **objectives**:

- target area
- preferred geometry
- orientation
- view priority
- optimize against constraints

The output is a set of **CANDIDATE ENVELOPES — not a finished house.**

---

## §7 — Multiple massing options

Options are driven by:

- sun
- orientation
- sea / open views
- street access
- parking
- existing and neighbouring buildings
- privacy
- parcel geometry
- planning constraints

Admissible geometries include: **I**, **L**, **U**, **irregular-L**, **non-90°**, and other forms.

**Each option EXPLAINS WHY it was proposed.**

The user **selects, rejects, or modifies**.

---

## §8 — House requirements

A **residential space library**:

> living · kitchen · dining · bedroom · ensuite · bathroom · WC · hall · corridor · studio ·
> office · laundry · storage · stair · garage · other

**Example ground floor:** living, open kitchen, ensuite bedroom, bathroom, staircase.

Spaces are added by **DRAG AND DROP into the design environment**.

---

## §9 — The relationship graph

Rooms carry explicit relationships:

- Living ↔ Kitchen
- Living ↔ Garden
- Bedroom ↔ Ensuite
- Bedroom ↔ Bathroom
- Kitchen ↔ Dining
- Entrance ↔ Hall
- Hall ↔ Living

The user can:

- add / remove rooms
- add / remove relationships
- change priorities
- drag nodes
- modify the organization

**The graph, the plan, and the 3D stay synchronized.**

---

## §10 — Generate SPATIAL ENVELOPES, not walls

The generative step produces:

- level envelopes
- room envelopes
- relationships only

It displays:

- room volumes in 3D
- boundaries in plan
- names
- areas
- levels
- colour-coded categories
- the graph

**Establish sound spatial organization BEFORE committing to architecture.**

---

## §11 — Fully editable layout

Select a room envelope, then:

- move
- stretch
- resize
- modify footprint
- change relationships

**Surrounding rooms intelligently adapt.**

Reuse the **existing PRYZM Move → Replace → Recompute behaviour**, preserving constraints and
relationships.

---

## §12 — Direct 3D profile editing

Double-click a room or level envelope and edit its footprint **in 3D**, reusing the **existing
Edit Profile interaction** (the one used for walls and windows) applied to spatial envelopes:

- move vertices
- create vertices
- delete / modify vertices

**Rules:**

- editing a **LEVEL** envelope → **all rooms inside adapt**
- editing a **ROOM** envelope → **it stays constrained within the level envelope**
- when a room changes → **adjacent rooms adapt**

The result is a **flexible responsive spatial model**, not a static generated layout.

---

## §13 — ONE LIVING DESIGN SYSTEM

All of the following are **synchronized**:

```
planning data ↔ 3D ↔ plan ↔ room envelopes ↔ relationship graph ↔ quantities ↔ cost ↔ compliance
```

**Worked example — a room goes from 18 m² to 25 m²:**

1. the room envelope changes
2. adjacent rooms adapt
3. the plan changes
4. the 3D changes
5. level GFA is recalculated
6. total GFA is recalculated
7. the cost estimate is recalculated
8. planning compliance is recalculated
9. the graph updates

---

## §14 — Show data continuously

The panel **evolves** with the stage.

**Initially:** parcel info, constraints, maximum potential.

**Later:** proposed footprint, GFA per level, total GFA, room areas, net area, gross area,
remaining potential, height, storeys, compliance, approximate cost, quantities.

It must **always answer**:

- What am I allowed to build?
- What am I proposing?
- How much capacity remains?
- What constraints am I approaching or exceeding?

---

## §15 — Cost estimation at the envelope stage

An approximate **cost per m²**, **user-adjustable**.

Example: *estimated GFA 220 m² × €X/m² = indicative construction cost.*

- **Label clearly as an ESTIMATE, not a quotation.**
- **Auto-update on every design change.**

---

## §16 — Envelope → BIM

**Only when the user is satisfied**, they select **CREATE HOUSE**.

PRYZM converts the validated envelopes into **BIM elements**:

- floors
- slabs
- columns
- beams
- floor finishes
- walls
- ceilings
- other required elements

**The envelope is the foundation of the detailed BIM model.**

---

## §17 — Detailed AI / RAC design after creation

After the BIM model exists, detailed design proceeds via **UI, RAC, or AI**.

**Examples:**

- *"Create a window 4 m wide and 3 m high with a 0.1 m sill height on the south-facing
  living-room wall."*
- *"Create doors connecting the rooms according to the relationship graph."*
- *"Add 2 m wide windows with 1.5 m height and 0.5 m sill height to rooms facing south,
  otherwise east, otherwise west."*
- *"Create an L-shaped kitchen along the north and west walls of the kitchen."*
- *"Create a bedroom layout with a queen-size bed."*

These execute **against the existing BIM model**, respecting:

- geometry
- room boundaries
- relationships
- planning constraints
- existing elements
- user intent

---

## §18 — Compliance always visible

A continuous **DESIGN vs LAW** surface showing:

- compliant conditions
- potential conflicts
- exceeded limits
- remaining capacity
- relevant assumptions
- uncertain or unavailable regulatory information

**NEVER pretend an automatic study is a legal approval.**

- Planning-law values **identify their source**.
- PRYZM-calculated values are **clearly identified as calculated**.

---

## §19 — UX principle

**Make it feel simple, though it is technically sophisticated.**

The user should not need to understand BIM, planning law, geometry engines, or generative design.

The interface must **repeatedly answer**:

- **Where am I?** (Parcel / Massing / Requirements / Layout / BIM / Detail)
- **What can I do?**
- **What is possible?**
- **What happens if I change this?**
- **Why is PRYZM suggesting this?**
- **Am I still compliant?**

---

## §20 — Do not over-automate

**Never assume the first generated result is correct.**

Prefer:

```
Generate → Explain → Compare → Edit → Recompute → Confirm
```

over:

```
Generate → Done
```

The AI is an **orchestrator and design partner**, not an autonomous architect. **The human
remains responsible for creative decisions.**

---

## §21 — Primary UX structure

Evolve the **existing Parcel panel** into a **PARCEL LAW / DESIGN workspace**:

- **LEFT** — interactive 3D / site / globe / plan
- **RIGHT** — dynamic analysis + design panel
- **switchable views** — 3D site / 3D globe / plan / analysis
- the right panel **exposes the controls relevant to the current stage**

---

## §22 — Agent behaviour on every design instruction

On **every** design instruction the agent must:

1. understand intent
2. check parcel + planning data
3. check design state
4. check constraints
5. determine which **EXISTING engine capabilities** execute it
6. generate the **SMALLEST USEFUL design change**
7. update the model
8. update the plan + 3D
9. update the data + quantities
10. recalculate compliance
11. explain
12. highlight trade-offs / conflicts
13. ask for the next meaningful human decision

**Do not make unnecessary decisions for the user.**

---

## §23 — The success criterion

The measure is **NOT**:

> *"How quickly can PRYZM generate a house?"*

The measure **IS**:

> *"How quickly can PRYZM help a human understand a parcel, understand what can legally and
> physically be built, explore meaningful alternatives, define what they want, and progressively
> turn that intent into a reliable BIM building?"*

The system must be:

**Understandable → Interactive → Visual → Data-driven → Explainable → Editable → Compliant →
Human-controlled.**

**The existing engine is the foundation. The orchestration layer brings it together into one
continuous residential-design workflow.**

---

## Traceability

| § | Nearest existing governance | Note |
| --- | --- | --- |
| §2, §18 | `C63` (study vs regulatory denominator), envelope sufficiency / withheld discipline | The "distinguish regulatory from study" requirement is an **existing, ratified discipline**, not a new one. Do not re-invent it. |
| §5, §7 | `STR-ENVELOPE-PARAMETER-REFERENCE.md`, `BUILDABLE-ENVELOPE-GAP-MASTER.md` | Envelope computation is existing machinery. |
| §9, §13 | `STR-14` (PRYZM Building Graph), BIM 2.0/3.0 tracker | The living-graph direction is already stated strategy. |
| §11, §12 | `C11` (element creation pipeline), `C16` (command authoring) | Editing must go through the command bus (P6), not direct store writes. |
| §16, §17 | `C11`, `C15` (hosted elements), `C84`+`C85–C99` (element integrity) | Envelope→BIM emits element families; C84 is **mandatory** for that work. |
| §22 | `C16`, RAC capability-parity architecture (ADR-0314) | "smallest useful change" + one-undo is the existing `runBatch` discipline. |
