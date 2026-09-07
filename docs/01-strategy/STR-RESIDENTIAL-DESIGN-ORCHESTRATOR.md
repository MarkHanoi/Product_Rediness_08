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

#### §25.3.1 — Amended 2026-09-07 (lane MASSING-SHAPES · L-13037 / L-13039 / §26.6 rule 4)

Founder, verbatim: *"MASSING OPTIONS SHOULD ALLOW ME TO CHOOSE DIFFERENT SHAPES — I, L, U, ANGLED
SHAPES — COHERENT SHAPES … WHEN I SELECT ANOTHER MASSING OPTION THE PREVIOUS ONE SHALL BE REMOVED —
BUT MORE IMPORTANT I NEED TO HAVE CREATE MYSELF MASSING OPTION! IN WHICH CASE I DESIGN I SHALL BE
ABLE TO SEE THE ROOMS PER LEVEL HERE."* Five rules, each with its owner in code:

1. **A shape is chosen BEFORE a size.** The option list leads with the shape families (I · L ·
   angled L · U); the four plate fractions follow as one shape's size ladder
   (`massingOptionModel.ts`). ⭐ **When no ground-floor area has been named the shapes are NOT
   withheld** — each is solved at the LARGEST outline of its family that fits the permitted
   footprint at the stated wing depth (`whenNoTarget: 'largest-fit'`, `massingShapeOptions.ts`).
   That is the family's own ceiling, the same fact "Full plate" states, and **not a default**:
   the option says `sized-to-largest-fit` with both numbers and names the action that sizes it.
   ⚠ *Why this rule exists:* at HEAD before it, the card's Generate button read the §5
   target-area channel, found it empty on any parcel where the user had not first typed an area
   into a different section, and withheld every shape — the four-plates screenshot behind
   L-13037 was that branch, not a missing engine.
2. **"COHERENT" is measured, not assumed.** Every solved placement's wings are measured on the
   BUILT ring (the template ∩ the permitted outline), at stations along each wing's body with
   the tip zones excluded. A body thinner than 2 m excludes the placement; a family with no
   survivor is **refused** `family-wings-sliver` with the narrowest width, where it was measured,
   and the minimum (C58 §1.13). An L or U whose built ring has no re-entrant corner is refused
   `family-collapses-to-bar` rather than listed as a rectangle wearing a letter. Every shape is
   `template ∩ buildableFootprint`, so containment in the permitted envelope holds by
   construction (C58 §1.19 clause 4, §1.20).
3. **ONE massing at a time — mint AND preview.** Keeping an option REPLACES the generated level
   envelope on that storey in one command (`supersedes` on `spaceEnvelope.batch.create`,
   L-13047); a shape option rides the SAME `TargetFootprintProposal` channel and the SAME adopt
   planner as a plate, so there is no second commit path (P6). The candidate PREVIEW is a single
   session slot (`targetFootprintAreaState`): choosing another option replaces what is drawn, by
   construction. ⚠ Today that preview draws on the THREE plan scene only
   (`ParcelBoundarySceneRenderer`); the 2D Site Map and the 3D Site do not subscribe to it
   (L-13022, OPEN).
4. **The study massing is a pale white-grey SOLID** (§26.6.3), fill `#e8e8ee` with a slate ink
   rim, more solid than before (`toBeBuiltEnvelopeStyle.ts` — the ONE owner; the adopted level
   prism reads it too). It is distinct from the permitted envelope's confidence hues by a
   measured lightness gap, and the three-line legend stays. ⚠ Open tension for the founder:
   a fully opaque massing would hide the rooms per level inside it; the level is kept below the
   room's weight so the rooms stay readable.
5. **"Create it myself" is a first-class entry** in the option list, on both arms of the fold
   (`massingAuthoredOptionSection.ts`). It opens the ONE site envelope tool
   (`window.pryzmOpenSiteEnvelopeTool`). Once the user's own level envelope
   (`provenance.origin: 'authored'`) is on the ground storey, the entry reads *"Your own — N m² ·
   chosen"*, and every generated option states BEFORE any click that keeping it would be refused
   — the supersession rule's own sentence, one producer. An envelope whose origin PRYZM cannot
   establish is a third state: it blocks, and is described as exactly that, never as yours.
   ⚠ **Precondition not yet met in code:** the site envelope tool's `batch.create` payload carries
   no `provenance`, so a drawn envelope lands as `predates-provenance` and reads as the third
   state. The stamp belongs in `envelopeAuthoringPlan.ts` (lane ENVELOPE-DRAW).
6. **Rooms per level.** The project's rooms are grouped by the storey they sit on, each storey
   joined to its level envelope (one · none · rivals · unreadable — four facts, kept apart), and
   mounted beneath the room programme in the Parcel Law tab (`roomsPerLevelModel.ts` — pure —
   and `roomsPerLevelSection.ts`). ⛔ A room with no resolvable storey is listed under an explicit
   *"level not known"* group with its reason — never dropped, never put on Ground. An unknown area
   is `null`, excluded from the storey sum and counted beside it. Rooms DRAWING on the view is
   §26.6.4's rule 2 (`siteGeometryHighlight`), not a second path from this section.

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
3. The user clicks the **Site** pill in the mode bar — the first pill, left of Author.
   > ⚠ **AMENDED IN PLACE 2026-09-07 · lane SITE-TAB · `L-13180` · C115 §0.3.** This step read
   > *"The user clicks **Analysis → Parcel Law**"*. The founder's 2026-09-07 transmission makes the
   > Parcel Law panel a **top-level workspace mode rendered left of Author**, not a sub-tab of
   > Analysis, so that route no longer exists. This document outranks the contract suite; leaving
   > the sentence stale would have made the strongest document in the stack describe a route the
   > shell does not have. **The rest of §26.1 is unchanged and still binding as written** — in
   > particular steps 4–7, which describe the arrangement the `site` row's `canvas: 'half'` claim
   > produces (C59 §2.10: the mode declares a claim and writes no box; the region owner places the
   > split pane BESIDE the panel). ⛔ The mode is entered by the user, not automatically on
   > location selection — that half is `L-13183`, OPEN, and C115 `C115-160` records why it is a
   > separate change.
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

---

## §26.6 — THE COMPLETE PARCEL LAW CARD SPEC (founder, 2026-09-07, with seven screenshots)

He opened with *"COMPLETE SPEC OF THE CARD: ANALYSIS PARCEL LAW"* and closed with *"DO IT SOUND —
ARCHITECTURALLY SOUND — NO SHORT CUTS"*. **This section is the specification for that card and
supersedes any local arrangement of it.** It is written section by section because he gave it that
way, but ⭐ **the four CROSS-CUTTING RULES below are the architecture; the section list is only where
they land.**

### §26.6.0 — The four cross-cutting rules (normative — read these first)

1. ⛔ **NOTHING IS DUPLICATED. ONE FIGURE, ONE PLACE.** His sharpest and most repeated complaint.
   *"ALL THIS DATA IS DUPLICATED"* (of the `Full site & massing data` block) and *"IMAGE 6 SHOULD NOT
   BE DUPLICATED … NOT DUPLICATED NOT THERE"*. The `ORDINANCE LIMITS` / `MASSING POTENTIAL` /
   `CAPACITY` triple currently renders **twice** — inside the collapsed *Full site & massing data*
   fold AND again lower down. One of them goes. **A figure appears in the section that OWNS it, and
   everywhere else links to it.**
2. ⭐ **EVERY FIGURE IS A HYPERLINK, AND FOLLOWING IT HIGHLIGHTS THE THING ON WHICHEVER VIEW IS
   OPEN, IN PRYZM VIOLET.** *"IF THE USER SELECTS AREA IT WORKS LIKE A HYPERLINK … THE AREA IN THE
   LEFT HAND SIDE 2D MAP VIEW OR 3D SITE VIEW SHOULD HIGHLIGHT THE AREA (IN PRYZM VIOLET COLOUR)."*
   ⚠ **HALF OF THIS IS ALREADY BUILT AND IS THE REASON THE RULE IS CHEAP:** the figures inside
   *Full site & massing data* are **already selectable** — his words, *"IN THIS SECTION IS ALREADY
   HYPERLINKED — ALTHOUGH DOESN'T RENDER ON THE VIEWS — BUT IT IS SELECTABLE"* — and the card's own
   banner already promises *"Every figure traceable to elements — click any of them."* **So the work
   is (a) move that behaviour up to §1 where the figure lives, and (b) make following it actually
   paint on the view.** (b) is the `siteGeometryHighlight` wiring closed for parcels in `9dd3cf55` —
   **reuse it, do not build a second one** (C58 §1.19 clause 2).
   Applies to: `Area`, `Perimeter`, `Bounding box`, `Boundary edges`, and every setback vector.
3. ⭐ **EVERY INTENT SITS SIDE BY SIDE WITH ITS CEILING, AND CAN NEVER EXCEED IT.** *"I ALWAYS HAVE A
   WAY TO CHECK AGAINST THE TOTAL … SAME PRINCIPLE SIDE BY SIDE — USER CAN SEE HOW MUCH IS TRYING TO
   BUILD AGAINST THE MAXIMUM … CAN NEVER GO BEYOND."* Total height beside maximum height; ground area
   beside maximum implantation area; per level, the same. ⛔ **"Can never go beyond" is a REFUSAL,
   not a clamp** — C58 §1.13 and the §RAC-HARD-STOPPERS doctrine: state **both numbers** and refuse,
   never silently trim the user's figure. The product already does this correctly in one place —
   *"Ground: you asked for 875 m², but no storey may overhang the buildable footprint, which is
   431 m² — 444 m² less than you asked for. Nothing was allocated here."* **That sentence is the
   model; generalise it, do not replace it.**
4. ⛔ **ONE MASSING RENDERS AT A TIME.** *"THE MASSING OPTIONS SHOULD RENDER — ONE AT A TIME — CANNOT
   HAVE MULTIPLE RENDERING."* This is L-13038 stated as a rendering rule as well as a mint rule, and
   his own screenshots show the product refusing because of it, twice — *"3 level envelopes are
   candidates … PRYZM will not choose for you"* and *"Two level envelopes sit at the same base height
   (0 m) with different footprints — 430.9 m² and 300.6 m²."*

### §26.6.1 — Section 1: "What is this plot?" — *"generally correct, but"*

- **Move the hyperlink behaviour here** from the duplicated block (rule 2).
- **`Area computed from the ring (shoelace); the source publishes no legal area` must sit ON THE SAME
  LINE as the Area**, not as an orphaned caption beneath it.
- **`Perimeter`, `Bounding box`, `Boundary edges` are hyperlinks too**, each highlighting its own
  geometry — the perimeter as a ring, the bounding box as a box, an edge as that edge.
- ⭐ **What is already right and must not be lost:** the amber `⚠ Building footprint (OSM) — NOT a
  legal cadastral parcel … carries no cadastral reference`, the `Match: low` row, the source line and
  the retrieval timestamp. Those are C57 §1.5/§1.9 attribution and they stay.

### §26.6.2 — Section 2: "What CAN I build here?" — renamed, and the setback register lands here

- **RENAME** from *"What may I build here?"* to **"What can I build here?"** (his words).
- **REMOVE the `×` in the top-right corner of the Buildable envelope card** (2.1, explicit).
- ⭐ **THE SETBACK REGISTER — the biggest single addition in this spec.** *"WE SHOULD HAVE DATA ABOUT
  THE DEPTH — BUT GENERALLY ABOUT EVERY SETBACK — AND WHY — AND IT SHOULD BE SELECTABLE AND
  HYPERLINK — I WANT TO KNOW FOR EVERY VECTOR OF THE PERIMETER THE SETBACK — THIS SHOULD BE DROPDOWN
  AS IT CAN GET A LOT OF DATA."* So: **per perimeter edge, the setback applied, the rule that
  produced it, and a link that highlights THAT EDGE on the view** — collapsed into a dropdown because
  it scales with edge count. ⚠ This is C58 §1.3 (*every constraint cites its source rule*) rendered
  per-edge instead of per-parcel, and it depends on C19 §2.3 `edgeClassifications`, whose authoring
  is C19 §10.1-pending — **so where an edge's class is unknown, say so per edge; do not infer one.**
- **FOUR FIGURES MUST BE UNAMBIGUOUS AND NAMED AS HE NAMES THEM:**
  | His term | Meaning |
  |---|---|
  | **Maximum buildable area** | across ALL floors (GFA) |
  | **Maximum implantation area** | in plan, GROUND floor only |
  | **Maximum height** | |
  | **Maximum levels** | |
  ⚠ Today three of those read `not derived` for Barcelona Zone 13a, and the card correctly explains
  why (*"Values marked not derived were not produced by the rule pack for this zone. PRYZM does not
  infer them — an inferred value would be indistinguishable from a derived one on this card."*).
  ⭐ **That refusal is correct and stays** — the requirement is that the four are NAMED and PRESENT
  as rows, not that they are filled.

### §26.6.3 — Section 3: "What I WANT to build" — intent, against the ceiling

*"HERE IS WHERE I DEFINE WHAT DO I WANT TO BUILD BASED ON OR AGAINST WHAT I CAN."* Order:
**first the envelope perimeter, then what is inside it.**

- **3.1 — Levels and heights.** How many levels; height of each level and of all levels. **Total
  height renders beside Maximum height** (rule 3), then a per-level breakdown concatenated beneath.
- **3.2 — Areas.** Ground area I want, beside the **Maximum implantation area**; then per level, the
  same pairing. Never exceed — refuse with both numbers (rule 3).
- **3.3 — Massing options.** One renders at a time (rule 4). ⭐ **AND THE APPEARANCE IS SPECIFIED
  BY REFERENCE:** *"THE MASSING SHOULD BE MORE SOLID AND SLIGHTLY WHITE-GREY LIKE IN HEKTAR"* — his
  image 3 is a white/pale-grey solid massing model with cast shadows and a sun control. ⚠ **This is
  a study volume, so it must not read as a permitted envelope**: C58 §1.19 clause 3 and C58 §5.2 keep
  the CONFIDENCE hues for the permitted envelope (violet solved / grey estimated / amber unreviewed).
  A white-grey solid is available precisely *because* it is not one of those — but the two must stay
  visually distinguishable, and the card's existing legend (`Permitted envelope` / `To-be-built
  envelope` / `Room envelopes`, each with its sentence) is how that is explained. **Keep the legend.**

### §26.6.4 — Section 4: Built vs permitted, then the interior

- **The breakdown he means is his image 5** — the existing `Designed vs permitted` table: per metric
  (`Footprint · ocupación`, `Gross floor area · superficie construida`, `Net floor area · superficie
  útil`, `Height · altura reguladora`, `Storeys · plantas`), the designed figure, the permitted
  figure, and a `NOT CHECKED` state with its reason. ⭐ **That table is already right** — including
  *"Designed figures are measured from the authored model — nothing is inferred, and a metric PRYZM
  cannot measure reads as not checked. This compares only the metrics PRYZM holds a limit for; it is
  not a building-code review."* **Keep it; it is the answer to "a clear breakdown".**
- **Then the interior: rooms.** His image 7 — the relationship graph plus `PROGRAMME — 6 ROOMS,
  64.0 M²`. *"THAT SHOULD BE THERE — AND SHALL RENDER ON THE VIEWS."* The panel is already hosted
  here (L-13024, `5a791767`); ⛔ **the new requirement is that the rooms DRAW on whichever view is
  open** — the same `siteGeometryHighlight` wiring as rule 2, and the same one-wiring-for-all rule.

### §26.6.5 — Section 5 and after

- **Image 6's `ORDINANCE LIMITS` / `MASSING POTENTIAL` / `CAPACITY` block is the DUPLICATE and it
  goes** (rule 1). Its figures live in §2 and are reachable from anywhere by the hyperlink.
- **Keep the last three sections with the relevant numbers** — allowance used, cost, and Take me into
  BIM. ⭐ **Their refusals are exemplary and stay**: *"not known — PRYZM will not guess"* on the
  allowance, *"PRYZM ships a published, cited rate for one place only, so outside that the honest
  answer is a refusal. Type what YOU assume"* on cost, and the two-rival-envelopes refusal on Create
  house.

### §26.6.6 — What this spec does NOT license

⛔ A second highlight mechanism (reuse `siteGeometryHighlight`) · a second option table
(`viewPanelOptions.ts` stays the one definition) · inferring `not derived` values to fill the four
named figures · clamping a user's intent instead of refusing with both numbers · removing any
existing refusal sentence in order to tidy the card. **Every refusal quoted in this section is load-
bearing and was hard-won; the restructure moves them, it does not delete them.**

### §26.6.7 — Implementation record (lane CARD-26.6, 2026-09-07) — what landed, what the spec got wrong, what is still open

⭐ **Read this before re-litigating any of the four rules.** It is the record of the first
implementation pass, written so the next reader finds decisions and measurements rather than
re-deriving them.

**The rule-2 finding, with lines (why "selectable but doesn't render on the views" was true).**
Three separate facts, not one:

1. **Question 1's figures were never controls at all.** `parcelCard.ts:361-381` (`appendExtraFacts`)
   emitted a plain `.pryzm-parcel-card-key` with no `data-site-highlight`, and the only
   `wireSiteHighlightRows` call in the repo was `GISAreaLayout.ts:4877` on the envelope card's own
   `panel` — never on the tab. The founder's *"already hyperlinked"* was the fold inside the card;
   §1 had nothing to click.
2. **Both view subscribers EXIST at HEAD and are UNDEPLOYED.** `CesiumViewport.ts:2043` and
   `SiteBoundaryMap2D.ts:3627` subscribe and register (`9dd3cf55`, 2026-09-06 22:57), 145 commits
   past LIVE `6cc8ed80`. His screenshots show the deployed build, where only
   `ParcelBoundarySceneRenderer` (BIM 3D) subscribed. §26.6.0 rule 2's *"(b) make following it
   actually paint"* was therefore already closed in code for the six original subjects; what was
   missing in code was (1) above and (3) below.
3. **Two of his named subjects had no vocabulary.** `Bounding box` had no subject
   (`GISAreaLayout.ts:3669` passed none) and a single EDGE could not be named — the union at
   `siteGeometryHighlight.ts:74` was six fixed members. The spec's *"half of this is already
   built"* undercounted: the per-edge half of rule 2 (and all of the setback register's links)
   needed a new, parametrised subject.

**What landed (commits `27d3c93b` + the register/rule-3 commit that follows it):**

- **Rule 1** — the tab's second rendering of ORDINANCE LIMITS · MASSING POTENTIAL · PER STOREY ·
  CAPACITY (`buildParcelLawFacts` scope `law`) is gone; question 2's slot is stamped
  `data-duplicate-removed="envelope-card-site-data-fold"`. The owner is the card's fold. No refusal
  was deleted — the refusal and absence arms live on the card (C58 §1.13 · L-13048). A spec counts
  the triple in the mounted tab's DOM and requires exactly one.
- **Rule 2** — `bbox` (seventh fixed subject) and `edge:<n>` (parametrised; one constructor, one
  parser) through the ONE store; cue arms in all three renderers; `buildSiteHighlightLabelEl` as
  THE control builder (DOM, so the card keeps C08 §3.1); question 1's rows carry a highlight
  DECISION from `parcelRingMeasuredFacts`; the tab wires every control under its root and keeps the
  ◉ painted from the store (`keepSiteHighlightRowsPainted`).
- **Rule 3** — `beyondCeilingStatement` in `brutAreaAllocation.ts` is now the ONE producer of the
  founder's sentence (the allocation arm calls it; byte-identical, pinned); `intentAgainstCeilingModel.ts`
  pairs levels · total height · ground area · per-level area · total area with Maximum levels ·
  Maximum height · Maximum implantation area · Maximum buildable area, each ceiling a hyperlink to
  its owner; `parcelLawIntentAgainstCeiling.ts` mounts it live in question 3 on the store's dirty
  channel. An intent over its ceiling is REFUSED with both numbers and left untouched; a ceiling the
  pack did not derive reads *not checkable*, never a pass. `collectIntendedAreas` now carries each
  storey's height (`heightM`, `baseOffsetM`) so the total height is measured from the same records
  as the areas.
- **§26.6.1** — the shoelace note is an inline cell of the area ROW (same testid); the OSM warning,
  Match, source and timestamp are pinned by spec.
- **§26.6.2** — renamed to *"What can I build here?"*; the card's ✕ is withheld INSIDE the tab by a
  scoped stylesheet rule (`.anl-parcel-law [data-testid="envelope-close"]`) — the producer is
  untouched, so the GIS hosts with a launcher pill keep theirs (C19 §5.7: no host branch inside the
  singleton's renderer); the fold's four figures are named as he names them; **the setback
  register** (`setbackRegisterModel.ts` + `setbackRegisterSection.ts`) renders one row per edge
  with six verdict arms — `applied` · `alignment-governed` · `not-derived` · `class-unknown` ·
  `no-determination` · `refused` — where an unknown class is said PER EDGE in two spellings
  (never recorded vs recorded as `unclassified`) and never inferred (C19 §10.1 pending).
  `ParcelLawModel` carries `geometry.edges` and `ordinance.rules` (each setback constraint with
  ITS OWN citation, C58 §1.3) as the register's inputs.

**STATUS LEDGER — re-measured 2026-09-07 by lane HEADLINE-CLOSE (L-13085). ⛔ READ THIS BEFORE
THE LIST BELOW.** This list was headed *"Open, and why"* and, by the time it was read again, held
**nothing that was open**: one standing architectural CONSTRAINT (which is not work), one bullet
struck out as closed, one shipped, and one belonging to another lane. That is the exact defect the
`Rooms DRAW` bullet below names in its own words — *"an 'Open' list that outlives the work it
describes sends the next lane to rebuild something that is already on disk"* — recurring inside the
section that recorded it. So each row now carries its state, and the heading no longer claims a
state for all of them:

| Row | State (2026-09-07) |
|---|---|
| Card-vs-tab ownership (§26.6.3 3.3 · §26.6.4) | **STANDING CONSTRAINT, not open work.** The founder's lift question inside it was DECIDED and SHIPPED. |
| The four ceilings in the headline | **CLOSED** — `c8c62c51` lifted them, `954162ec` built the seam and the spec, `cb978592` pinned the rule-1/rule-3 boundary. |
| Rules 1 · 2 · absence arms, end to end | **CLOSED AND RE-VERIFIED** — see the HEADLINE-CLOSE record below; no fix was needed and none was manufactured. |
| Rooms DRAW on the open view | **CLOSED** (`1fa54287`) — and the bullet was stale when written. |
| Rooms drawn by their party walls | **SHIPPED** (§DRAW-THEM, L-13096). |
| Rule 4 (one massing at a time) | **NOT THIS SECTION'S** — MASSING-SHAPES owns it (`905b655f`). |
| Pixels | ⚠ **GENUINELY OPEN.** Every arm above is measured in a real DOM or at its producer; **none of it has been seen in a browser.** This is the one row a spec cannot close. |

**The rows, and why each is where it is (this is the architecture, not a lane's convenience):**

- **§26.6.3 (3.3) massing options and §26.6.4's `Designed vs permitted` table stay INSIDE the
  singleton card, which sits in question 2.** The card is one element re-homed between hosts and
  re-rendered as one `innerHTML`; its folds cannot be parented into questions 3 and 4 without a
  MutationObserver re-moving nodes on every render — a shortcut — or a host arbiter that renders
  the card's sections as separately mountable producers (C19 §5.7 clause 1's prescribed fix). The
  founder's section list is honoured where the tab owns the producer and NOT where the card does.
  ⭐ **DECIDED 2026-09-07 by the founder — LIFT THEM. Implemented by lane CARD-POLISH-3 (L-13085);
  this paragraph read *"Founder decision pending"* until then, and the question it asked is
  recorded below so the next reader finds the decision rather than re-litigating it.**
  *The question was:* lift the four named figures to the card's HEADLINE (replacing
  `Setbacks (F/S/R) · Max height · Max FAR · Buildable`) and drop them from the fold, or keep the
  headline as is.
  **What landed:** the headline is now `Maximum levels · Maximum height · Maximum implantation
  area (ground, plan) · Maximum buildable area (all floors, GFA)`, with their values, built by
  `buildSiteDataBlock`'s `ceilingHeadline` — which now returns `{ headline, fold }` so both halves
  come from ONE read of one envelope. The four rows are **DELETED** from the fold, not copied:
  lifting without removing would re-create the duplication rule 1 exists to end, one edit after
  applying the rule.
  · ⭐ **RULE 2 SURVIVED THE LIFT — VERIFIED 2026-09-07 (lane HEADLINE-VERIFY, L-13085), not
  asserted.** `c8c62c51` shipped with its own warning — *"NOT VERIFIED HERE: that the lifted figures
  keep their rule-2 behaviour … a figure that becomes plain text in the headline is a rule-2
  regression"* — and the verification came back **CLEAN**. Read at that commit: the four are built
  by `buildSiteDataBlock`'s own `row()` (`GISAreaLayout.ts:4065`), whose 4th argument is the
  highlight subject and which renders the label through `buildSiteHighlightLabelHtml`
  (`GISAreaLayout.ts:4076`) whenever a subject and an availability exist; the headline is
  interpolated into the panel as `safeRows` (`GISAreaLayout.ts:5406`) **before**
  `wireSiteHighlightRows(panel)` runs (`GISAreaLayout.ts:5429`), which takes the whole panel; and
  the Parcel Law tab re-wires (`parcelLawTab.ts:687`) and keeps the ◉ painted from the store
  (`parcelLawTab.ts:989`). `height` / `footprint` / `gfa` kept their subjects; `Maximum levels`
  carries none — there is no geometry for "storeys" to light, and §3 forbids rendering a dead
  control. **No fix was needed and none was manufactured.**
  · ⛔ **WHAT WAS BROKEN WAS THE PROOF, AND THAT IS WHAT THIS LANE FIXED.** The headline was
  assembled inside `buildSiteDataBlock`, an arrow in `mountGISArea` — a ~5,500-line closure no spec
  can render — so the strongest available check was a **grep of the card's source for the SHAPE of
  a call**, and `parcelLawTab.spec.ts` said so in its own words. A grep cannot tell a `<button>`
  from a `<span>`, cannot click, and cannot count what a browser would show. So the producer moved
  next door to **`apps/editor/src/ui/site/ceilingHeadlineSection.ts`** —
  `buildCeilingHeadlineHtml` plus `buildEnvelopeCardRowHtml`, the **ONE** row markup for headline
  and fold alike (the card's `row` is now a one-line delegation, and `num` / `NOT_DERIVED` are
  aliases of the moved constants, so the two halves of one card cannot drift). **`ceilingHeadline.spec.ts`
  (14 cases) mounts the REAL headline** and pins, in a real DOM: rule 1 — each of the four exactly
  once, by key AND by the label the reader sees, four rows never three; rule 2 — three REAL buttons
  carrying `height` / `footprint` / `gfa`, `wireSiteHighlightRows` returning **3**, a click writing
  the ONE store, the ◉ repainted from that store when ANOTHER surface writes it, and `Maximum
  levels` not a control; all three renderers — `limit-plane` · `inset-ring` · `envelope-volume`
  arms present in `ParcelBoundarySceneRenderer` · `CesiumViewport` · `SiteBoundaryMap2D`, all three
  registering so the row can say where the click will show; and every absence arm.
  · **The names come from `CEILING_LABEL`** (`intentAgainstCeilingModel.ts`), which already owned
  them for question 3 — so the headline and the intent/ceiling pairs cannot drift apart.
  · **ONE headline for all three hosts** (GIS rail PARCEL panel · floating GIS card · Parcel Law
  tab question 2). C19 §5.7 forbids a host branch inside the singleton's renderer and there is
  none.
  · **Absence and refusal arms survive — VERIFIED, arm by arm.** A ceiling the pack did not derive
  prints `not derived` in the headline exactly as it did in the fold (C58 §1.4 · L-13048): the
  headline renders **four rows, never three**, each carrying `data-derived="not-derived"` and the
  sentence that refuses the *"unbounded"* completion (L-616), and a **zero** footprint reads as an
  absence rather than as `0 m²` — a ceiling of nothing is a claim about the user's land that
  nothing derived. The **degenerate** arm keeps its
  refusal sentence *instead* of the four — setbacks that consume the parcel mean there is no
  buildable envelope, so printing a footprint and a buildable area for it would be a claim about
  the user's land. The **alignment-zone** arm (§L-518c) keeps `Buildable depth` + `Alignment
  offset` + its caveat *in addition to* the four, because such a zone has null setbacks/height/FAR
  by design and the four alone would read as the "empty / not filled in" complaint that arm exists
  to answer.
  · **The setback triple was RELOCATED, not deleted.** It was in the replaced headline and appears
  nowhere else on the card, so it moved into the fold's ordinance block, behind ONE producer
  (`setbackTriple`); the per-call local `setback()` is gone.
  · ⭐ **The lift also corrected a mislabel the duplication was hiding:** the old headline's
  `Buildable` rendered `gfaTxt`, i.e. `"<insetArea> m² footprint"` — a FOOTPRINT under a label a
  reader takes for buildable floor area. Three of the old headline's four lines were already
  duplicates of fold rows under different names, so the lift removed a duplication that predated
  it. ⚠ **Pixels unverified — not deployed.**
  · ⭐ **RE-VERIFIED END TO END 2026-09-07 (lane HEADLINE-CLOSE, `cb978592`) — AND THE VERDICT IS
  THAT NOTHING WAS OPEN.** Four things were re-measured against the code rather than against this
  record, because a clean bill of health backed by a spec is a deliverable and a manufactured change
  is not (C84 §9: the prose-justified verdicts were the wrong ones; the honest blanks were safe).
  **(1) Rule 2 end to end** — the three subjects are real buttons, `wireSiteHighlightRows` returns
  3, a click writes the ONE store, `keepSiteHighlightRowsPainted` repaints from it, and all three
  renderers genuinely subscribe AND register AND carry both cues:
  `ParcelBoundarySceneRenderer.ts:273/281/631-634`, `CesiumViewport.ts:2813/2822/7885/8045/8061`,
  `SiteBoundaryMap2D.ts:4102/4107/1763/1766/1872`. **(2) Rule 1** — the fold's remaining rows are
  `Buildable depth` · `Setbacks (F/S/R)` · `Max FAR` · `Max site coverage` · `Footprint / parcel` ·
  `Footprint perimeter` · `Study volume` (`GISAreaLayout.ts:4134-4177`); **not one of them is one of
  the four under another name**, which is the failure mode the lift itself corrected. **(3) The
  absence arms** — four rows never three, `not derived` with its *"MISSING LOOKUP, not a finding"*
  clause, and a zero footprint read as an absence. **(4)** the two §26.6.7 rows above.
  · ⛔ **WHAT *WAS* OPEN WAS THE SEAM BETWEEN RULE 1 AND RULE 3, AND NOTHING SAID SO.** Both rules
  bind ONE number in the Parcel Law tab: `Maximum height` is in the card's headline (question 2) and
  again beside the declared total height (question 3, rule 3's *"side by side"*). A lane executing
  rule 1 literally — count the label in the mounted TAB, require exactly one — finds **two** and
  repairs rule 1 by deleting the founder's most repeated requirement. ⭐ **Rule 1 resolves it in its
  own words** — *"a figure appears in the section that OWNS it, and everywhere else LINKS to it"*:
  the card OWNS the four, question 3 LINKS to them, its ceiling NAME built by
  `buildSiteHighlightLabelEl`, the same ONE control builder, writing the same store. **Rule 1's
  "exactly one" is therefore scoped to the OWNER surface**, and that scoping is now pinned rather
  than inferred.
  · ⭐ **AND THE PIN CAUGHT A REAL DRIFT RISK: TWO TABLES, ONE BINDING.** The two surfaces share the
  four NAMES (`CEILING_LABEL`, one owner) but **not the four SUBJECTS** — the headline reads
  `CEILING_SUBJECT` (`ceilingHeadlineSection.ts:86`) while `intentAgainstCeilingModel.ts` passes
  `null` / `'height'` / `'footprint'` / `'footprint'` / `'gfa'` as **literals at five `pair(...)`
  call sites** (`:176 :202 :218 :227 :236`). Change either and one named ceiling lights two different
  geometries on two surfaces, with nothing red anywhere. `ceilingHeadline.spec.ts` now builds the
  real `ParcelLawModel`, runs the real `buildIntentAgainstCeiling`, matches each pair to a ceiling by
  **the founder's word** (never by list position) and requires the subjects to agree — executable
  agreement between two live producers, not a grep. ⭐ **Scramble control run:** flipping
  `CEILING_SUBJECT.buildable` to `'footprint'` fails it and the message names both sides.
  ⚠ **The one-table follow-up is NOT taken and is named here rather than left implied:** the honest
  end state is `CEILING_SUBJECT` living beside `CEILING_LABEL` in `intentAgainstCeilingModel.ts` (the
  import already runs that way, so there is no cycle) with question 3 reading it. That file was
  outside this lane's territory while three siblings ran; **until it moves, the agreement is
  MEASURED, not structural.**
- ~~**Rooms DRAW on the open view (§26.6.4).** Not done. It needs a `room:<id>` parametrised
  subject and a cue arm in the three renderers…~~ ⭐ **CLOSED — and this bullet was STALE WHEN IT
  WAS WRITTEN.** `1fa54287` had already landed both halves: `roomHighlightSubject` /
  `parseRoomHighlightSubject` are THE constructor and THE parser
  (`siteGeometryHighlight.ts:165` / `:177`, carried through the SAME store and attribute as the
  fixed seven and `edge:<n>` — no second mechanism), and the cue arm exists in **all three**
  renderers: `CesiumViewport.ts:7797`, `SiteBoundaryMap2D.ts:1811`,
  `ParcelBoundarySceneRenderer.ts:637`. Verified 2026-09-07 by lane ROOMS-DRAW
  (`grep -rn parseRoomHighlightSubject` → 3 renderers + the vocabulary + its spec).
  ⚠ **The recurrence is the point, not the fix:** an “Open” list that outlives the work it
  describes sends the next lane to rebuild something that is already on disk — the same
  count/range rot CLAUDE.md logs five recurrences of, one bullet down.
- **Rooms are DRAWN — by their party walls (§9 · §25.5). SHIPPED 2026-09-07, lane ROOMS-DRAW,
  L-13096 — and the SCOPE is the finding.** The founder asked to *“reorganize also the rooms on
  the plan view — draw them etc.”* `2f75a364` gave him the ORDER (§ROOM-PIN); this gives him the
  FOOTPRINT. **Dragging the wall between two rooms moves floor area across it**
  (`programme.resize-pair` → `programmeSharedWalls` → `drawSeams`).
  ⛔ **A FREEHAND ROOM BOUNDARY WAS NOT BUILT, AND IS NOT EXPRESSIBLE HERE.**
  `solveProgrammeLayout` **partitions** a plate — a cell's ring is a pure function of
  `(levelRing, areas, order)` — so an authored ring has nowhere to live: it would be re-solved
  away on the user's next keystroke, which is the defect L-13079 calls *“worse than not
  shipping”*. A party-wall move is the **largest footprint edit this solver can KEEP**, because
  moving a shared wall IS a transfer of area and area is the currency the bisection consumes —
  the same argument `RoomProgrammeEntry.pinnedOrder` records for why a pin is an ordinal and not
  an `{x,z}`. ⚠ So L-13079's planned ENVELOPE-DRAW port (`BoundaryPathAuthor` +
  `EnvelopeDrawSurface`) was **not needed and not taken**; its two blockers — the closed
  two-member `EnvelopeDrawSurfaceId` and the module-singleton sink hard-wired to
  `setDrawnEnvelopeFootprint` — **still stand**, and a future freehand tool still meets them.
  ⭐ The areas are the truth and the wall is the consequence: the ghost line follows the pointer,
  the wall lands where the plan re-solves it, and **the hint text says so** rather than shipping a
  control that looks live and is not. A move under a room's floor is **refused with both numbers
  and the largest move that IS allowed** (C83 §1.2 + L-942), never clamped. ⚠ It writes the
  session BRIEF, not the bus — P6 as `roomProgrammeModel.ts` argues it — so **Ctrl+Z does not
  take it back, and the panel says that too.**
- **A room that does not exist yet is DRAWN — §ROOM-DRAW-NEW. SHIPPED 2026-09-07, lane
  ROOMS-DRAW-2, L-13120. This CLOSES the *“draw them”* half the bullet above left open**, and the
  taxonomy is the finding. The three plan gestures now cover the founder's sentence in the three
  currencies `solveProgrammeLayout` can keep: §ROOM-PIN gives the ORDER, §ROOM-WALL-DRAG the
  FOOTPRINT of rooms that already exist, and this the room that does not. **Arm “Draw a room”,
  drag a rectangle, and one room is added at the area it measures** (`programme.draw-room` →
  `describeDrawnRoom` → `wireDrawRoot`).
  ⭐ **THE GESTURE WAS NEVER THE HARD PART.** The bullet above scoped to a party wall precisely
  because that preserves the tiling invariant for free — what one room gains the other loses. A
  drawn rectangle has no such guarantee, so the deliverable is mostly the **founder's own
  taxonomy** (§SPATIAL-VALIDITY-RULES, 2026-08-14 — IMPOSSIBLE ≠ INADVISABLE ≠ FINE, keyed on
  MEANING, and it ASKS rather than silently correcting):
  **(1) off the plate = IMPOSSIBLE** (C114 §12) — refused with both numbers, and a half-outside
  rectangle is refused WHOLE, because quietly keeping the part that fits reports a room the user
  did not draw as one he did and he cannot see the difference (the rectangle is not stored);
  **(2) under the kind's floor = IMPOSSIBLE**, refused at the INTENT rather than at the solve, so
  one bad rectangle cannot replace the plan he was drawing on with a `room-below-minimum` refusal
  card; **(3) bigger than the unallocated plate = IMPOSSIBLE** — and this is the clause that
  **defines the gesture: a drawn room takes its floor from what the storey has NOT allocated,
  never from its neighbours.** That is this gesture's conservation invariant and the counterpart
  of the wall drag's, and between them neither gesture can silently shrink a room the user did not
  touch; **(4) drawn over existing rooms = INADVISABLE, NOT IMPOSSIBLE, therefore NOT REFUSED** —
  the solver PARTITIONS, so nothing overlaps in its output and a straddling rectangle is a request
  whose RESULT will not look like the rectangle. The live message says so, names the rooms, and
  points at the gesture that does the other thing he may have meant. He decides by releasing.
  ⛔ **Every refusal carries a REACHABLE way out (L-942).** `largestDrawableM2` is the biggest room
  the asker would accept right now, floored to a cm² so the number is one he can hit — and a spec
  **takes that number, draws exactly it, and asserts it is accepted.** A dead end reads **0, not
  the free area**, and names the three gestures that open it, because a number there would invite
  a drawing refused for a second reason.
  ⭐ **“One asker” is achieved LITERALLY, not by discipline (C84 EI-8a):** `describeDrawnRoom`
  reduces the very intent the panel will dispatch, runs `solveProgrammeLayout` on the result,
  returns the SOLVER'S OWN statement verbatim on a refusal, and **returns the INTENT** — so the
  panel cannot authorise a drawing the verdict refused, because the panel never builds one. A
  refusal the solver learns tomorrow is inherited for free.
  ⛔ **STILL NOT A FREEHAND BOUNDARY, and still for the reason the bullet above gives.** A
  rectangle contributes the two things the solver CAN keep — an AREA and a POSITION IN THE ORDER
  — and the position is taken only when a MAJORITY of it sits on one cell; below that the room is
  added unpinned and the sentence says so, because seating it anyway would be *“a position you did
  not choose, presented as one you did”*. The hint says the room lands where those two put it
  **“not on the rectangle you drew”**. L-13079's ENVELOPE-DRAW port is still **not needed and not
  taken**, and its two blockers still stand.
  ⚠ Session BRIEF, not the bus — so **Ctrl+Z does not take a drawn room back, and the panel says
  so** and names the list as the way to remove it.
- **Rule 4** is MASSING-SHAPES' (`905b655f`); this lane's card does not contradict it and the
  two-rival-storeys refusal is pinned at its producer.
