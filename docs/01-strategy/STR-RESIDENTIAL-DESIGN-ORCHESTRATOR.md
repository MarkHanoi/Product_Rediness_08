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

---

## §24 — Founder transmission 2026-09-05: WHERE the parcel data lives, and the envelope must RENDER

> **Provenance.** Captured verbatim the same turn (2026-09-05, session product-rediness-08-47),
> per the standing capture rule. The founder re-sent the §1–§23 specification in full (its text
> matches the 2026-09-03 capture above — no section changed) with two additions and two
> screenshots of the deployed app (Dubai, First Al Khail Street; the PARCEL rail panel open
> beside the BIM 3D view, then beside the Analysis "Relationships" tab).

Verbatim, the two additions:

> *"the data under parcel should be in the form the analysis panel - the user could interact with
> the 2d/3d/3d site and 3d globe with the envelope as proposed"*

> *"also this is mostly started but it should be in another panel like analyses panel - and the
> envelope data should render - which doesn't atm - check for completion"*

And, from the re-sent body, the sentence that fixes §21's home (emphasis original):

> *"WE NEED A NEW MODAL PANEL – COULD BE THE EXISTING "PARCEL" PANEL ON THE LEFT HAND SIDE RAIL
> PANEL. … I THINK WE SHOULD USE THE EXISTING "ANALYSIS" TOP TAB VIEW OPTION. BASICALLY WE NEED
> TO HAVE A PARCEL LAW / OR SIMILAR NAME TAB WITH: ALL THE Parcel data. + to be intention. On the
> right (as analysis works) and the 3d view on the left (with option to switch to 3d site or 3d
> globe or plan view)."*

### §24.1 — What this changes in the target (and what it does not)

1. **§21 acquires a concrete home.** The right-hand "dynamic analysis + design panel" is a **tab
   of the existing Analysis surface** — working name **PARCEL LAW** — not (only) the left-rail
   PARCEL panel. The rail panel keeps its route (C19 §5.6 clause 4: a route is added, never
   removed); the Analysis tab is where the stage-driven controls live.
2. **The left pane of that workspace must switch between four views** — plan · BIM 3D · 3D Site
   (Forma) · 3D Globe — while the tab stays open. Today the three-segment switcher (`'2D' ·
   '3D' · 'forma'`) belongs to the GIS layout, and the Analysis surface's left pane is the BIM 3D
   view only.
3. **The envelope must be visibly rendered in every one of those views** — the permitted
   (zoning) envelope, the proposed level envelope, and later the room envelopes — with a
   legend. "Renders at 6 % fill because its footprint is an upper bound" is an honesty signal
   the founder does not read as rendered. The honesty must survive (C58 §1.2 / L-619 badge and
   hue), the invisibility must not.
4. Everything else in the re-sent body is already §1–§23. No new engine is asked for here; the
   ask is placement, reachability and legibility.

### §24.2 — Where the measured state lives

The per-section EXISTS / PARTIAL / ABSENT inventory stays in
[`RESI-ORCHESTRATOR-PLAN.md`](../03-execution/plans/RESI-ORCHESTRATOR-PLAN.md) — see its **§8
(re-measure 2026-09-05)** for what shipped between the two transmissions, the two defects the
screenshots exposed (**L-12915** the missing Parcel Law tab; **L-12916** the envelope that does
not render), and the stage that now closes §24.1 items 1–3.

## §25 — Founder transmission 2026-09-06: the Parcel Law tab, specified to the row

> **Provenance.** Captured the same turn (2026-09-06, session product-rediness-08-08), per the
> standing capture rule. This is the THIRD transmission of the orchestrator vision. It arrived in
> answer to a lane-status report that offered "Generative Resi" as a generator-quality lane, and
> it corrects that framing: *"FOR GENERATIVE RESI - I MEAN: THIS WHICH A LOT IS DONE - BUT IT
> SHOULD HAVE THE ENVELOPE RENDERING - BEING MODIFIABLE - ON THE ANALYSE TAB.... CALLED PARCEL
> LAW"*. §1–§24 are unchanged and are not restated here; this section records only what is NEW
> or newly PINNED, because a re-transmission that gets summarised loses exactly the specificity
> that makes it buildable.

### §25.0 — The framing, restated by the founder and binding on every lane

> *"the layouts are not great and won't be — a human can and will be able to create better
> layouts for now vs AI. So given that PRYZM has a proven creation engine — I would like to use
> it on the benefit of a Human driven / orchestrator for housing creation."*

> *"The user have also the possibility to build automatically (automatically atm is non-sense
> since it is too basic or manually either via UI/RAC — which would take too long time) …
> I want pryzm to guide this process without building the house in one click — because it would
> never be the wanted outcome."*

⛔ **This is a standing constraint, not a preference.** A lane that raises a generator's
auto-quality score is not working on this vision. The deliverable is the ORCHESTRATION surface —
data, envelopes, graph, gizmos — that lets a human decide fast. Read §20 (do not over-automate)
together with this.

### §25.1 — The Parcel Law data card, pinned to the row

§2 and §14 said "start with the parcel" and "show data continuously". This transmission pins the
**exact taxonomy and the exact rows**, with the founder's own worked example. Four blocks:

| Block | Rows (founder's worked example in parentheses) |
|---|---|
| **A · PARCEL** | Area (612 m²) · Perimeter (107.9 m) · Bounding box (37.8 × 16.4 m) · Boundary edges (9, **of which 3 street frontage**) · provenance line: *"Cadastral boundary as committed to this project (Catastro / drawn), measured in scene metres."* |
| **B · ORDINANCE LIMITS** | Max height (12.0 m) · Storeys (4) · Max FAR (2.00) · Max site coverage (50 %) · Zone (generic-urban) · **citation held per row** in a *"Why these numbers?"* affordance |
| **C · MASSING POTENTIAL** | Buildable footprint (355 m²) · Footprint / parcel (58 %) · Footprint perimeter (89.9 m) · Max buildable area GFA (1,421 m²) · Study volume (3,672 m³) · caveat: *"Computed from the inset footprint this card solved. A STUDY, not a permit."* |
| **D · PER STOREY** | one row per storey — Ground 0.0–3.0 m 355 m² · Level 1 3.0–6.0 m · Level 2 6.0–9.0 m · Level 3 9.0–12.0 m · caveat: *"Even floor-to-floor from max height ÷ storeys — an EQUAL DIVISION for study, not a regulated storey height."* |

Plus, **when a building already stands on the parcel, rich data about that building** — the
founder's own house is the driving case (see L-12939; the parcel resolves, the building does not
render, because context footprints are OSM and OSM never mapped it).

**Every row is interactive:** *"If user clicks area – the area highlights. Perimeter, bounding
box etc… everything is dynamic."* Area, perimeter, bounding box and edge classification each
highlight their own geometry in the live view. This is Stage C, and §25.1 fixes its scope.

### §25.2 — BRUT vs NET, and the remaining-area arithmetic the user must be TOLD

The sharpest new requirement. §5 said the envelope precedes architecture; this says what the
envelope must *compute and disclose*, with the founder's worked example:

> *"Imagine there is a plot of 1200 sqm. The maximum implantation area in ground is 200 sqm. The
> maximum total buildable area BRUT is 320. We should let the user know that only in first floor
> he will be able to build 120 sqm."*

So the loop is: **ask the user how much of the ground-floor allowance they want** → subtract from
the total BRUT allowance → **state the remainder for the floors above** → let the user allocate
it (the founder's example: *"how much to build on first floor. 120 sqm or 100 sqm?"*) → and
render each decision immediately.

> *"on the 3d canvas the user will see a TO-BE-BUILT ENVELOPE OF 200 SQM IN THE BUILDABLE
> FOOTPRINT OF THE PLOT (ANOTHER COLOUR OF ENVELOPE). AT THIS STAGE WILL BE ORIENTATIVE."*

⚠ **Three distinct envelopes now exist and must be visually distinguishable, with a legend:**
the PERMITTED (zoning upper-bound) envelope, the **TO-BE-BUILT** envelope (the user's chosen
area, "another colour", explicitly *orientative*), and later the ROOM envelopes. The C58 §1.2
confidence hues govern the permitted one; the to-be-built one is an INTENT, not a measurement,
and must never inherit a confidence badge that implies it was derived from law.

### §25.3 — Massing options: the optimisation criteria and the shape vocabulary, named

§7 said "multiple massing options". Today names what they optimise for and what they may be:

- **Criteria:** sun exposure · orientation to sea view or open view · entrance from the street ·
  parking area · **visibility from surrounding buildings** (overlooking).
- **Shape vocabulary:** I · L · U · **L non-90-degree** · etc.
- *"THIS NEEDS TO BE BUILT WITHIN PRYZM."* — the founder's own note that this one is not a
  wiring job.

Worked instruction the engine must satisfy: *"I want initially as a value attribute 180 sqm brut
in ground floor – ideally L shape – south facing oriented – and pryzm will create a logical
TO-BE BUILT ENVELOPE. SAME FOR FIRST FLOOR."*

### §25.4 — A chat surface ON the Parcel Law panel

> *"WE NEED A CHAT BOT ON THE PARCEL LAW PANEL – SO USER CAN CHAT VIA RAC OR DEFINE VIA DATA
> MANUALLY INPUT."*

Both input paths are first-class and must agree: a value typed into a field and the same value
asked for in natural language produce the same envelope. This is the RAC free-form doctrine
(open language; safety via rule gates that refuse with BOTH numbers) applied to the design stage.

### §25.5 — The room programme, the graph, and drag-and-drop

§8/§9/§10 exist; this pins the interaction:

- A **library of all possible rooms in a residential house**, from which the user **drags and
  drops** onto the graph and/or the 2D/3D scene. The user may add rooms not in the initial
  programme — corridor, hall, studio — the same way.
- *"the graph should drive the initial layout generation"* — the graph is the INPUT, not a
  read-out. Plugging and unplugging a relationship re-generates the layout in plan AND 3D.
- Output at this stage is **envelopes only** — *"not yet walls, floor, slabs etc… just spaces —
  envelopes"* — with **colours and a legend**, level envelope plus room envelopes.
- *"until this is sound we would not generate walls, doors etc…"* — an explicit gate on
  proceeding to elements.

### §25.6 — The two editing gestures, specified precisely

1. **Per-face gizmo.** *"the room envelope shall have for each face a little arrow (gizmo) that
   shall allow the user to move only in two directions perpendicular to the face."* Movement is
   constrained to the face normal — one axis, two directions. Neighbours adapt, as BIM 3.0
   move→recompute already does for walls/floors/partitions.
2. **Double-click → profile edit, in 3D.** *"use the edit profile we have built for walls +
   windows – but in 3d environment"* — double-click an envelope, then either move the existing
   vectors defining its footprint or author a new footprint. ⛔ **Reuse the shipped profile
   editor; a second profile editor is a defect.**

**Containment is bidirectional and must hold both ways:** editing the LEVEL envelope makes the
room envelopes inside it adapt; a ROOM envelope is CONSTRAINED to the level envelope, may move
freely inside it, and its neighbours adapt to fit. (C114 §12's `room ⊂ level` row is now
ENFORCEMENT — see C114 §14c — so the refusal path already exists to build on.)

### §25.7 — Live quantities, cost, and one living system

At the envelope stage, live in the panel: **room names · room net surface · brut surface per
level · total**. Plus **an adjustable cost per m²** giving a cost estimate *before* going into
detail.

> *"The graph shall monitor and represent that data and the plan view, the 3d scene and the graph
> shall talk to each other as a single living entity. Everything shall be live."*

This is §13's synchronization contract; §25 adds the graph as a third live participant and the
cost figure as a live output.

### §25.8 — "Create House", and what it must produce

The envelope stage ends at an explicit user action — **CREATE HOUSE** — which produces
**floors, slabs, columns, beams, floor finishes, walls, ceilings** automatically. Before that
point the ENVELOPE element carries the design; the founder asks that it be extended *"sound and
as per the contracts as if it is a room, wall etc…"* — i.e. a first-class element family, not a
preview object.

### §25.9 — RAC detailing after creation, with the founder's own test set

These five instructions are the acceptance set for §17:

1. *"Create a window of 0.1 sill height, 4 metres wide and 3 metres height in the south facing
   wall in the living room."*
2. *"Create doors that communicate the rooms as per the graph."*
3. *"Create windows of 0.5 sill height, 2 metres wide and 1.5 metres height in all rooms facing
   south when possible otherwise east or west in this order."*
4. *"Create a L shape kitchen in the kitchen room on the north facing and west facing walls."*
5. *"Create bedrooms layout with queen beds etc."*

Note #3 carries a PREFERENCE ORDER with a fallback chain, and #2 reads the graph as design
input — neither is a simple parameterised create.

### §25.10 — What §25 does NOT change

The engine inventory, the stage ladder and the honest EXISTS / PARTIAL / ABSENT measurements stay
in [`RESI-ORCHESTRATOR-PLAN.md`](../03-execution/plans/RESI-ORCHESTRATOR-PLAN.md). §25 adds
specificity to §2, §5, §7, §9, §10, §11, §12, §14, §15, §16 and §17 — it does not add a stage and
it does not reorder the ladder. The founder's own estimate stands and should be tested rather
than assumed: *"I believe most of the engine already exists – just needs to be put things
together."* Where that turns out to be false for a given row, say so by name.

### §25.11 — The rail panel's data MIGRATES and EXTENDS into the tab

Founder, same session, 2026-09-06:

> *"UNDER THE PARCEL PANEL ON THE LEFT HAND SIDE RAIL PANEL YOU HAVE ALREADY A LOT OF THE DATA FOR
> THE 'GENERATIVE ENGINE RESI' — THIS SHOULD MIGRATE AND EXTEND TO THE NEW PARCEL LAW TAB."*

**Measured 2026-09-06 — the assets this names already exist and are committed:**

| Artefact | Committed | Carries |
|---|---|---|
| `apps/editor/src/ui/analysis/parcelLawTab.ts` | `01bb1937` 2026-09-05 — *"the fifth Analysis tab is a HOST"* | the tab host itself |
| `apps/editor/src/ui/site/parcel/parcelRailPanel.ts` | `d12608fb` 2026-08-22 — §PARCEL-ALL-INFO + §ENVELOPE-AXES-CONTROL (L-6900..L-6916) | the rail panel and its sections |
| `apps/editor/src/ui/site/parcel/parcelCard.ts` | maintained through 2026-09-05 | the fact rows — Ref/refcat, Addr, Area, Zone pack, Source CRS, Match tier, provenance label |
| `apps/editor/src/ui/site/envelopeCardSections.ts` | `8dd10fce` §RESI-STAGE-G | the envelope card sections, incl. the intended-area fold listing rooms by name |

So §25.1's card is substantially **an assembly job over shipped parts**, which matches the
founder's standing estimate. Build accordingly: reuse these, do not re-author them.

**How "MIGRATE" reconciles with §24.1 clause 1 (the rail panel keeps its route).** These are not in
conflict, and the resolution is binding:

1. **The DATA MODEL migrates** — it is extracted to ONE shared source of truth that both surfaces
   render from. ⛔ Two independently-computed parcel models is the defect this clause exists to
   prevent; a copy-paste of the rail panel's rows into the tab is a FAILURE even if it looks right.
2. **The TAB becomes the primary surface** — it is where the stage-driven controls, the to-be
   envelope and the design decisions live (§25.2–§25.8). It EXTENDS the rail panel's content; it is
   not a re-skin of it.
3. **The rail panel keeps working**, rendering from that same shared model, per C19 §5.6 clause 4
   (a route is added, never removed). If the founder later wants the rail panel retired, that is a
   deliberate separate removal with its own decision — not a side effect of this work.

---

## §26 — THE ORGANISATION IS THE WORK NOW (founder transmission, 2026-09-06)

> ⭐ **READ THIS BEFORE BUILDING ANYTHING ELSE ON THE PARCEL LAW TAB.** The founder's verdict on the
> state of §25 as shipped, in his own words:
>
> *"honestly a lot is done — i can see most of the pieces working and i am impressed — is just that
> is not well organize."*
>
> That sentence is the whole brief. **The capability gap is closed; the INFORMATION-ARCHITECTURE gap
> is open.** Do not respond to §26 by building more cards, more figures or more determinations —
> every number he lists below already exists and he can see it. Respond by ORGANISING what is there.
> A lane that adds a new computed fact to this tab has misread this section.

### §26.1 — The layout he expects, stated as a sequence

He gave the flow as a walkthrough. It is binding as written:

1. The user selects the location (his example: **Paris**).
2. The user lands on **the usual split view — 2D view LEFT, 3D site view RIGHT**. (This is the
   §L-412 site-authoring split and it already exists.)
3. The user clicks **Analysis → Parcel Law**.
4. **At that moment the RIGHT pane becomes Parcel Law, and the LEFT pane holds the views.** This is
   the inversion that is currently wrong: the panel takes the right, the view work moves left.
5. **The user can split the LEFT side further.** The left half is itself splittable.
6. ⭐ **It must be sound BOTH ways — whether the left side is ONE view or a SPLIT view.** Both
   arrangements are first-class; neither is a degraded mode of the other.
7. ⭐ **In every one of those panes the user chooses which view renders**, from the four he named:
   **2D map view · 2D satellite view · 3D site view · 3D globe**.

> ⛔ **What this section does NOT license.** It is not permission to mint a second Cesium viewer or a
> second MapLibre map per pane. §L-412 is unchanged: ONE Cesium container and ONE MapLibre map,
> RE-TARGETED between panes. A nested split makes the re-targeting harder, not optional — see
> L-12988 (placement and layout disagreeing across a mode switch) and L-12992 (the 2D map has no
> re-target path at all, so it always lands left). **Those two defects are prerequisites of §26.1,
> not separate work**: a nested, user-assignable pane tree cannot be built on a surface where one of
> the two view types cannot move between panes.


### §26.1.1 — FOUNDER RULING, 2026-09-06: the two Cesium views are MUTUALLY EXCLUSIVE

I put the §L-412 tension to the founder directly — that §26.1's *"in every pane the user picks from
2D map / 2D satellite / 3D site / 3D globe"* permits **3D site LEFT and 3D globe RIGHT at the same
time**, that both are Cesium-backed, that there is exactly ONE Cesium container by design, and that
honouring it literally would mean minting a second viewer.

**His ruling, verbatim:**

> *"if this is really expensive to build or architecturally not cheap - then keep it so if one of the
> cesium bview is open the other can not - but both of them could if only one is meant to be active"*

**This is DECIDED. Build to it; do not re-open it, and do not spend a lane re-deriving the
trade-off.**

What it means, stated so an implementer cannot get it wrong:

1. **Both 3D Site and 3D Globe remain OFFERED in every pane's picker.** Neither is removed from the
   six-option set, and neither is second-class. §26.1's "the user decides which view renders in each
   pane" survives intact for all four view kinds.
2. **At most ONE Cesium-backed view is ACTIVE at any moment**, across the whole pane tree. §L-412
   stands unchanged: ONE Cesium container, re-targeted — never a second viewer, never a second
   MapLibre map.
3. **Choosing a Cesium view in pane B while one is live in pane A is a legal, expected action** —
   not an error state. It must therefore have a defined, non-destructive outcome.
4. **The other pane must not be left blank.** L-12992 is the standing lesson here: a pane whose only
   surface was disposed is the black rectangle the founder photographed. Whatever happens to pane A
   when pane B claims Cesium, pane A must end holding *something* it can state — a 2D view, or an
   honest placeholder that says why it is not showing 3D and what to press to get it back.

> ⛔ **The refusal must SPEAK, and it must be recoverable.** A silently greyed-out segment is the
> wrong implementation of this ruling — it tells the user nothing and reads as a bug, which is
> exactly how the founder has read three defects this session. If PRYZM declines to run two Cesium
> views, it says so in one sentence naming the reason, and offers the action that resolves it
> (swap the panes, or move 3D here and put 2D there). See [[refusing-half-needs-its-escape-hatch]]:
> a gate whose "yes" branch is unreachable is a regression with a citation attached.

⭐ **Why this ruling is good, recorded so it is not "fixed" later by someone who thinks they are
helping:** two simultaneous Cesium viewers would mean two terrain streams, two tile caches and two
GPU contexts on a page that already runs a WebGPU BIM renderer beside it. The founder chose the
cheap, honest constraint over the expensive, fragile capability. A future lane that "restores" the
second viewer is undoing a deliberate decision, not fixing a limitation.

### §26.1.2 — FOUNDER RULING, 2026-09-06: SPLIT DIVIDES THE VIEW REGION, NOT THE WINDOW

His words, given after testing the deployed build and finding the behaviour *"mixed up"*:

> *"We need to have a sound and really robust system for the split view / and the analysis / inspect
> panels — because SPLIT VIEW SHOULD ALWAYS SPLIT THE VIEW OF THE SECTION OF THE VIEWS. So if in
> AUTHOR, then split view will divide the view in 2. But in ANALYSE view, then split view will
> divide THE LEFT HAND SIDE VIEW in 2 — and this is not robust at the moment, is mixed up, not
> architecturally sound."*

⭐ **THIS IS THE GOVERNING MODEL FOR THE ENTIRE PANE SYSTEM AND IT SUPERSEDES ANY LOCAL RULE THAT
CONTRADICTS IT.** State it once, implement it once:

1. **There is a VIEW REGION.** It is the part of the shell that holds views. It is not the window.
2. **A workspace mode decides how big the view region is.** In **Author** the view region is the
   whole canvas. In **Analysis** (and Inspect, and Data) a panel claims part of the shell, and the
   view region is what remains.
3. **SPLIT divides the VIEW REGION — always, and only.** Author: the canvas splits in two.
   Analysis: the remaining left area splits in two. The panel is never one half of a split.
4. **Every pane control belongs to a pane inside that region** — the view dropdown, the split
   toggle, the drag handle. None of them is positioned against the window or the canvas.

⛔ **WHY THE CURRENT BEHAVIOUR IS "MIXED UP", stated so the fix targets the cause and not the
symptoms.** Today the split and the panel are SIBLINGS competing for the same shell: the workspace
mode sets `#container` to 50 %, the split view separately claims its own pane, and the switcher
positions itself from CANVAS-relative variables (`--shell-canvas-cx` / `--shell-canvas-w`). Three
independent owners of one geometry. Every symptom the founder has reported in this area is that
same collision wearing a different hat:

| Symptom | Row | The collision |
|---|---|---|
| Right half blank after Analysis → Author | L-12988 | placement and layout disagreed across the transition |
| Onboarding globe halved, empty pane beside it | L-13000 | a mode wrote `width:50%` onto the full-bleed globe |
| Switcher spans the window, wraps to two rows | L-13003 | segments sized against a rail row, not a pane |
| Bar centres itself over a viewless region | L-13027 | anchored to the canvas after the canvas stopped being the view |
| Pane blanked when a singleton view moved | L-12999 | a move vacated instead of swapping |
| Map displaced, then re-asserted, repeatedly | L-13025 | the mount and the placement disagree on ordering |

**Six rows, one cause.** They have been fixed one at a time; §26.1.2 is the statement that makes
them one fix.

⭐ **THE TEST THAT SETTLES IT** — a lane may not claim §26.1.2 without it: from Author, split → two
views. Switch to Analysis → the panel takes its share and **the split survives inside the remaining
region**, still two views, now narrower. Switch back to Author → the panel yields and the two views
expand. At no point does a pane blank, a control leave its pane, or the count of views change.

⛔ **NOT LICENSED BY THIS SECTION:** a second Cesium viewer or a second MapLibre map (§L-412 — one
of each, re-targeted); a rival option table (`viewPanelOptions.ts` stays the one definition); or
losing the mutual-exclusion ruling in §26.1.1 — at most one Cesium-backed view is ACTIVE across the
whole region however that region is divided.
### §26.2 — "Properly displayed" — the presentation standard

His words: *"then on the analysis it needs to be more intuitive and way easier better displayed —
basically the user wants most of the data you provided but properly displayed… structure better —
with pryzm standards the data on parcel law — do it sound — architecturally sound and ui / ux
sound."*

Three separable requirements, and they are not the same job:

- **KEEP THE DATA.** *"most of the data you provided"* — the cadastral card, the buildable envelope
  with its citations, designed-vs-permitted, how these were measured, built area by storey, intended
  area, massing options, the volume legend, ground-floor fit, the allowance ledger, live quantities,
  cost, Create house. He is not asking for less. ⛔ **Do not delete determinations to make the tab
  look tidier** — the honesty apparatus (each card stating its own source, confidence and citations
  on its face) is a C57/C58 obligation and survives any re-organisation.
- **CHANGE THE ORDER AND THE WEIGHT.** Today the tab is a flat vertical stack of roughly fifteen
  peer-level sections, every one of them expanded, with no hierarchy between "what is this plot"
  and "what may I build" and "what have I drawn" and "what will it cost". That flatness IS the
  complaint.
- **HOLD PRYZM'S OWN UI STANDARD.** White + purple `#6600FF`, never black
  ([[preview-color-unified-pryzm-purple]], [[onboarding-site-generate-view-flow]]).

### §26.3 — Design it from the persona, not from the data model

His instruction: *"thing as a persona architect of land developer how it would go thoutght the
workflow."*

⭐ **This is the actual design constraint and it is the one most likely to be skipped.** The current
tab is ordered the way the MODEL is ordered — parcel facts, then ordinance, then massing, then
authoring, then quantities, then cost — which is the order a programmer discovers them in. An
architect or land developer arrives with a QUESTION, and the questions have a natural sequence:

1. *What is this plot?* (ref, address, area, source, retrieved-at)
2. *What may I build here, and who says so?* (the envelope, its citations, its confidence)
3. *What do I want to build?* (ground-floor fit, storeys, the drawn perimeter)
4. *How much of my allowance have I used, and what is left?* (the BRUT/NET ledger — §25.2)
5. *What does it cost?*
6. *Take me into BIM.* (Create house)

A lane restructuring this tab must be able to say which of those six questions each section answers,
and any section that answers none of them is in the wrong place or belongs behind a disclosure.

### §26.4 — The envelope must be creatable in 3D SITE, not only in PRYZM view

His words: *"also the envelope renders great on pryzm view — but on 3d site vie not on 2d map view —
i would like the user to be able to create the envelope in 3d site if this is possible as we can do
on pryzm view — check if this is possible and structure better."*

**Read as: it renders in the PRYZM (BIM/WebGPU) view — and it does NOT render in the 3D site view,
nor on the 2D map view.** His screenshot bears this out: the purple envelope volume is drawn in the
WebGPU BIM view (the GPU pill reads `WebGPU`), while the Cesium 3D site view and the MapLibre 2D map
show no envelope.

Two requirements, and the second is the hard one:

- **RENDER** the envelope in the 3D site view and on the 2D map view. The 2D map already renders the
  parcel ring and the context; the envelope footprint is the same class of geometry.
- ⭐ **CREATE** it there — *"be able to create the envelope in 3d site … as we can do on pryzm view"*.
  He explicitly says *"check if this is possible"*, so the honest answer may be "partly", and a
  measured "here is what is possible, here is what is not, and why" is an acceptable deliverable.
  What is NOT acceptable is silently delivering the render half and calling the section done.

> ⚠ **The known obstacle, so nobody rediscovers it as a surprise.** The BIM/WebGPU view and the
> Cesium site view are different renderers with different frames — the 2D plan draws the AUTHORING
> frame, de-rotated by θ from the 2D map BY DESIGN (ADR-0115). Any authoring gesture made in the
> Cesium view has to land in the same command path the PRYZM-view gesture uses (P6: commands are the
> only mutation path), not a parallel one. **One command path, two input surfaces** — never two
> authoring implementations that can drift.

### §26.5 — What "sound" means here, since he used the word three times

*"it should work sound"* · *"do it sound"* · *"architecturally sound and ui / ux sound"*.

- **Architecturally sound** — P1 one composition root, P6 commands as the only mutation path, §L-412
  one viewer re-targeted, one shared parcel-law model behind both the tab and the rail panel
  (§25.11), no `any` seams, no second implementation of an existing solver.
- **UI/UX sound** — the persona sequence of §26.3, PRYZM's palette, and every figure still carrying
  its own source and confidence on its face.
- **And measurable** — a claim that the tab is "better organised" is not verifiable. A lane taking
  §26 must state what it is optimising and how it knows it improved: which of the six questions each
  section serves, what is above the fold, what moved behind a disclosure, and what a user must click
  to reach an envelope from a cold start.
