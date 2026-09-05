# PRYZM — UNIVERSAL AI-NATIVE SYSTEM & COMPONENT EDITOR (MASTER SPEC)

**Status:** ACTIVE MASTER SPECIFICATION · **Captured:** 2026-09-01 from the founder's master prompt
(per the standing capture-founder-research-to-repo rule). **Scope:** the canonical parametric model,
geometric model, BIM 3.0, World Model, AI/RAC and code-native authoring for programmable building
objects. **Execution rule set by the founder:** *"first check what is already done — then audit,
plan and implement — but don't stop."* The spec's own §1 forbids coding before repository
archaeology; the founder's execution note requires the first deliverable to be an
**Architecture & Contract Audit** (the 12 items in §81 below), and only then the implementation plan.

---

## §0 MISSION
Design and progressively implement the **PRYZM Universal System & Component Editor** — NOT "a Revit
Family Editor in the browser" (too narrow), but the authoring environment for **programmable,
semantic, parametric building objects and systems** inside the PRYZM World Model.

Required properties: AI-native · browser-native · semantic-first · parametric · geometry-capable ·
contract-first · deterministic · versionable · composable · interoperable · World-Model ready ·
BIM 3.0 ready · openBIM aware · code-native · extensible.

A user must be able to create essentially any building component or system through **(1) visual
modelling, (2) AI/RAC, (3) code, or any combination** — all three producing the SAME canonical
PRYZM model.

## §1 FIRST RULE — DO NOT CODE YET
Repository archaeology first. Inspect and document the EXISTING architecture for: World Model ·
semantic model · element model · geometry model · geometry kernel · parameter system · formulas ·
constraints · commands · transactions · undo/redo · persistence · versioning · materials · types ·
instances · relationships · hosting · connectors · visibility · representations · AI/RAC ·
tool/function calling · contracts · schemas · validation · Window Editor · Wall Profile Editor ·
the existing 3D editor/viewport · IFC/openBIM · project insertion.
**Do not create duplicate concepts if PRYZM already has an equivalent. Do not introduce a new
abstraction merely because it is locally convenient. Existing PRYZM contracts and architecture take
precedence.** Produce an architecture assessment before implementation.

## §2 THE CORE PRINCIPLE
> **A PRYZM component is NOT geometry.** Geometry is one representation of a richer object.

The canonical component contains or references: semantic meaning + spatial context + relationships +
parameters + constraints + design intent + feature definition + geometry definition + materials +
types + behaviour + hosting + connectors + visibility + provenance + version.
Geometry is GENERATED from this model. **Never a mesh-first system with BIM metadata attached after.**

## §3–4 THE FIVE MODEL DOMAINS (explicitly distinguished)
- **4.1 Semantic** — *what is this?* class · category · definition · classification · properties ·
  materials · units · external references · IFC mapping · bSDD.
- **4.2 Spatial / World Model** — *where is it, what relates to it?* Project · Site · Building ·
  Storey · Space · Zone · Host · Location · CRS · orientation · transform · containment · adjacency ·
  connection · boundary · opening · composition. The component is a first-class World-Model participant.
- **4.3 Parametric** — *how does it behave when inputs change?* parameters · formulas · constraints ·
  dependencies · types · variants · instance overrides · derived values · conditional rules · scopes ·
  design intent.
- **4.4 Geometric** — *what exact geometry does this produce?* points · CRS · reference planes/lines/
  points · axes · curves · lines · arcs · circles · ellipses · polygons · splines · NURBS where
  supported · sketches · profiles · surfaces · solids · B-Rep · topology · extrusions · revolutions ·
  sweeps · lofts · booleans · offsets · fillets · chamfers · shell/thicken · patterns · arrays.
- **4.5 Behavioural** — *how does it behave in the building?* host rules · insertion rules ·
  connectors · openings · snapping · orientation · attachment · compatibility · visibility ·
  replacement · connection · interaction · contextual behaviour.

## §5 CANONICAL MODEL — exactly one authoritative model
No divergent UI state / AI state / CAD state / BIM state / database state. Visual UI, AI/RAC and Code
all pass through **PRYZM Contracts** into ONE canonical model.

## §6 DEFINITION HIERARCHY — never collapsed
`ComponentDefinition → ComponentType → ComponentInstance`
(e.g. `WindowDefinition → W-1200 → WindowInstance-482`): reusable design intent → named
configuration → occurrence in the project.

## §7 IDENTITY
Stable identity for Definition · Type · Instance · Parameter · Constraint · Feature · Geometry ·
Relationship · Material · Connector · Reference. IDs survive recomputation, save/load, undo/redo, AI
modification, parameter changes, type changes. **Never use renderer ids, mesh indices or transient
topology indices as semantic identity.**

## §8 PROPERTIES vs PARAMETERS — not collapsed
Parameter controls generation/behaviour (`FrameWidth = 75 mm`); Property describes
(`FrameMaterial = Aluminium`); derived property e.g. `ClearOpeningWidth = Width − 2 × FrameWidth`.

## §9–11 PARAMETERS · UNITS · EXPRESSIONS
Parameters are first-class objects (identity, semantic meaning, name, datatype, unit, default,
current value, scope, formula, dependencies, constraints, editable, visible, provenance); scopes =
Definition/Type/Instance/Derived; resolution deterministic. **Units are semantic and typed** (length,
area, volume, angle, mass, temperature, pressure, energy, power, …) — never bare `Width = 1200`. A
**typed expression engine** supports formulas and detects circular dependencies, undefined
references, unit mismatch, invalid expressions/types. **No unsafe arbitrary string substitution.**

## §12 PARAMETRIC AFTER PLACEMENT — non-negotiable
Components do not bake on placement. One instance may take `Width = 1800 mm` without changing the
other 19; changing the TYPE updates its instances. Order: definition defaults → type values →
instance overrides → derived parameters → geometry.

## §13 PROGRESSIVE PARAMETRISATION
Fixed geometry may be authored first and design intent added later (draw → extrude → parameterise →
symmetry → formula → type). AI must do this too: *"make this symmetrical"* creates a real
symmetry/equality relationship, never nudged vertices.

## §14–15 CONSTRAINTS · DESIGN INTENT
Support where feasible: coincident, horizontal, vertical, parallel, perpendicular, tangent,
concentric, equal, symmetric, aligned, fixed, distance, angle, radius, diameter; reference planes/
lines/points/axes/origins/work planes. **Constraints are persistent semantic objects.** Prefer
`Equal(A,B)` over `MoveFace(...)`, `Extrude(Profile, Depth)` over `SetMeshVertices(...)`,
`GlassWidth = OpeningWidth − 2×FrameWidth` over `GlassWidth = 1050`. **The model retains WHY the
geometry has its shape.**

## §16 FEATURE / HISTORY GRAPH
Deterministic, replayable feature graph (reference plane → sketch{line, arc, dimension, constraint} →
profile → extrusion → boolean → sweep → material → visibility). Each feature: stable identity,
inputs, parameters, dependencies, outputs, provenance, validation state.

## §17–20 GEOMETRY KERNEL · ABSTRACTION · EXACT-vs-MESH · TOPOLOGY
**Do not build a kernel from scratch without compelling reason.** Evaluate OpenCascade/OCCT (+WASM),
OpenGeometry, PlaneGCS, SolveSpace-derived, Three.js, WebGPU and other actively maintained browser
CAD tech on licence · browser/WASM · exact geometry · B-Rep · booleans · topology · constraints ·
sweeps/lofts · performance · maintenance · extensibility. **Never auto-select the newest project;
produce a recommendation before committing.** The canonical model must NOT couple to one kernel:
`PRYZM canonical geometry → geometry adapter → kernel → exact geometry → tessellation → Three.js/
WebGPU`; the kernel is an EVALUATOR. Prefer exact geometry as canonical-derived
(`profile → curve → surface → B-Rep solid → render mesh`); **the mesh is a projection/cache, never
authoritative.** Topology matters but is NOT permanent identity — no canonical `Face 381`/`Edge 27`
references; use stable feature lineage and semantic references. **If a reference becomes ambiguous:
FAIL CLOSED — never silently attach to a different face.**

## §21–22 REPRESENTATIONS · VIEWS
One canonical semantic/parametric definition with DERIVED representations: exact geometry · render
mesh · plan · elevation · section · symbolic · analysis. The editor supports PLAN / FRONT / SIDE /
SECTION / 3D as views of ONE model — **never separate independent geometry systems**; sketch in plan,
constrain in elevation, inspect in 3D, edit parameters in any view.

## §23–25 MATERIALS · TYPES · NESTING
**Materials are semantic**, not renderer colour: identity, classification, definition, manufacturer/
product, physical/thermal properties, appearance, layer info, thickness, constituents; components
expose material parameters (FrameMaterial, GlassMaterial, …); the renderer consumes a visual
projection. **Multiple types per definition** (W-1200/W-1500/W-1800) overriding dimensions, materials,
geometry parameters, properties, visibility, behaviour — types and instances stay distinct.
**Components compose** (Window → frame, glass, mullion, handle, seal), nested objects may themselves
be reusable components, with explicit parent/child/transform/parameter inheritance/overrides/material
inheritance/visibility inheritance/semantic relationships — **never copied mesh geometry.**

## §26–28 HOSTING · CONNECTORS · VISIBILITY
Hosting is a semantic capability (Window: host=Wall, insertion=opening, orientation=host normal;
Door: opening required, handing, swing; Furniture: host=floor, insertion=bottom, free rotation;
Curtain panel: host=curtain grid, width/height = host bay). **Connectors are first-class** (MEP,
structural, facade, attachment points, openings, insertion points) with identity, position,
orientation, type, allowed connections, dimensions, direction, compatibility — enabling machine
reasoning over systems. **Visibility is semantic** (`visible when DetailLevel ≥ Fine`,
`visible when PanelCount > 2`), differing per representation and detail level — not renderer state.

## §29–33 SEMANTIC STANDARDS · IFC · bSDD · IDS · CLASSIFICATIONS
Map to external standards WITHOUT making them canonical:
`PRYZM semantic model → standards mapping → IFC / bSDD / IDS / classification`. **The internal model
is NOT IfcWindow/IfcPropertySet/IfcRelDefinesByType** — IFC is an interoperability representation and
PRYZM may be richer internally. Semantic classes may reference local identity + external semantic URI
+ name + definition + parent class + external mappings; properties may reference standardised
property definitions rather than display strings. Support machine-readable information requirements
(IDS-style: required FireRating, enumeration EI30/EI60/EI90; required UValue, unit W/m²K) surfaced as
*✓ Complete / ⚠ Missing required information* inside the semantic system, not export-only. Support
multiple classification REFERENCES (IFC, bSDD URI, Uniclass, OmniClass, PRYZM-local) — never
uncontrolled text.

## §34–38 WORLD MODEL · QUERYABILITY · PROVENANCE · VERSIONING · EVENTS
**Relationships are first-class**: hostedBy, contains, containedIn, adjacentTo, connectedTo, supports,
supportedBy, opensIn, fills, composedOf, instantiates, specializes, references, derivedFrom,
classifiedAs, locatedIn — never meaningful relationships as arbitrary strings. The model must answer,
without inspecting rendered geometry: *all windows with aluminium frames · all windows on Level 02 ·
which windows use W-1200 · which facade panels depend on this definition · components missing fire
rating · replace all instances of this type · components connected to this MEP connector · what this
wall hosts.* **Provenance** (author, source, AI-generated, manual, imported, derived, version,
revision, source definition/document, command history) — critical for AI-generated World Model
content. **Versioning** of definitions and types with explicit behaviour for existing instances, new
instances, upgrades, breaking changes and overrides — **never silently destroy historical meaning.**
**Semantic change events** (ParameterChanged, TypeChanged, ConstraintAdded/Removed, FeatureAdded/
Modified, MaterialChanged, HostChanged, RelationshipAdded/Removed, DefinitionChanged) reusing the
existing PRYZM event architecture where present.

## §39–45 AI / RAC AS A FIRST-CLASS AUTHORING SYSTEM
AI is not a chatbot beside the editor — it is **the element creator, modeller, parametric author and
World Model assistant**. Flow: `USER → {Visual | AI/RAC} → intent/command → contract validation →
transaction → canonical model → recompute → derived representations`. **AI must NOT directly mutate
the database, scene graph, renderer or arbitrary kernel objects.** AI creates INTENT
(`CreateEqualityConstraint(leftFrame, rightFrame)`, `GlassWidth = OpeningWidth − 2×FrameWidth`), and
**distinguishes a value change** (*"make it 1200 wide"* → `Width = 1200 mm`) **from rule creation**
(*"make the width twice the height"* → `Width = Height × 2`). AI has contract-controlled access to
the current definition, selection, parameters, constraints, feature graph, types, materials, geometry
status, host and World-Model context — it should not infer from a screenshot. **Failures return
structured diagnostics** (e.g. *"the requested 500 mm arc conflicts with the current endpoint and
tangent constraints"*) with options; never hidden. The repair loop
`proposal → validation → failure → structured diagnostic → repair proposal → validation → commit`
is a reusable pattern.

## §46–56 CODE-NATIVE AUTHORING
Code is a first-class authoring surface; visual, AI and code produce ONE canonical component — **no
separate Visual/AI/Code component architectures**. Investigate whether PRYZM should expose a stable
**Component API / DSL** (illustrative, syntax NOT prescribed: `component Window { category =
Architecture.Opening; parameter width = 1200mm; … profile = createWindowProfile(width, height,
topRadius); frame = extrude(profile, frameWidth); property frameMaterial = Aluminium; host = Wall }`)
— **first evaluate TypeScript/JavaScript/Python/a constrained DSL/a declarative geometry language;
do not invent a language without compelling architectural reason.** Code compiles to contracts
(`component code → parser/runtime → PRYZM Component API → validated contracts → canonical
definition`) and must NOT touch Three.js, meshes, the database, the renderer or kernel objects
directly; it uses the same primitives as UI and AI. Code expresses INTENT (`frameWidth = width×0.05`,
`constrainEqual(left, right)`, `extrude(profile, depth)`). Code-defined components are visually
inspectable and vice versa where possible — **do not promise textual round-trip fidelity the
architecture cannot provide; distinguish textual / structural / semantic equivalence.** AI may
generate component code as an intermediate representation, with the canonical model still
authoritative. **Security:** capability-based API, no filesystem/network/credentials/secrets/
arbitrary DB/app internals. **Determinism:** same code + inputs + API version → same result (for
caching, testing, collaboration, AI, World Model, reproducibility). **Versioning:** code targets a
stable Component API version; internal APIs are not the public surface. **Dependencies** between
components carry stable identity, explicit version, compatibility rules, deterministic resolution.
Code expressing semantic relationships creates a NORMAL World-Model object, never a "code object".

## §57–62 EDITOR UX · VIEWPORT · CREATION FLOW · TEMPLATES · EXISTING EDITORS
A hybrid of Rhino / modern parametric CAD / Revit Family Editor / modern browser CAD / PRYZM's
existing Window Editor — copying none blindly. Tool groups: **Create** (select, line, polyline, arc,
circle, ellipse, rectangle, polygon, spline, NURBS, point, plane) · **Modify** (move, rotate, scale,
mirror, offset, trim, extend, fillet, chamfer, join, split) · **Solid** (extrude, revolve, sweep,
loft, boolean ∪/−/∩, shell, thicken, pattern, array) · **Parametric** (parameter, formula, dimension,
constraint, reference plane/line/point) · **Semantic** (property, material, type, classification,
host, connector, visibility). The **existing Window Editor 3D viewport is reused/evolved** (orbit,
pan, zoom, section, isolate, selection incl. face/edge/feature, parameter and dimension manipulation,
material preview, host preview) — 3D is a first-class authoring environment. Creation flow:
**Create → System / Component** → category modal (Wall, Window, Door, Floor, Roof, Ceiling, Curtain
Wall, Column, Beam, Stair, Railing, Furniture, Equipment, MEP Component, Generic Component, Custom
System) → the UNIVERSAL editor, where the category supplies semantic defaults/templates, **not a
separate geometry engine**. Window/Wall/Door/Facade are TEMPLATES of one universal engine. **The
existing Window Editor is the first migration/proving ground — do not throw it away**: inspect its
profile architecture, rectangular profiles, arcs, polygons, rhomboids, 3D preview, parameters,
persistence, materials, placement and types, and extract reusable capabilities; likewise the **Wall
Profile Editor**, whose profile/sketch functionality becomes generic infrastructure.

## §63–70 THE REQUIRED TESTS
**First vertical slice = Window**, end-to-end: semantic definition · type · instance · parameters ·
formulas · profile · sketch · constraints · exact geometry · materials · visibility · host ·
placement · 2D representation · 3D representation · persistence · AI creation · AI modification ·
World Model registration · code representation where feasible.
**AI test (§64):** create a 1200×1500 window with 75 mm aluminium frame, arched top, two equal glass
panels → make the frame 100 mm → make both side frames equal → make glass width always opening width
− 2×frame width → create Small/Medium/Large types → place 20 instances → make THIS instance 1800 mm →
make the Medium type 1600 mm → replace glass material for all Large windows → *which windows on Level
02 use Large?* The resulting state must be canonical and queryable.
**Code test (§65)**, **parametric test (§66)** (20 instances; one instance changes alone; type change
propagates; definition change follows explicit version/type rules; formula change recomputes
dependents; **no stale derived geometry may overwrite newer state**), **geometric test (§67)**
(rectangular, arched, polygon, rhomboid, multi-curve, extrusion, sweep, boolean, parameter-driven
regeneration, exact geometry where supported), **constraint test (§68)** (equal, symmetric,
horizontal, vertical, tangent, distance, radius — preserved across parameter changes), **World Model
test (§69)** (instance exposes identity, category, definition, type, parameters, properties,
materials, host, location, orientation, relationships, geometry, representations, provenance —
**without inspecting a mesh**), **IFC/semantic test (§70)** (`PRYZM Window → semantic mapping → IFC
window`, properties mapped to standardised definitions, IFC never internal).

## §71–73 PERFORMANCE · CACHING · INVALID GEOMETRY
Browser-viable: Web Workers, WASM, incremental recomputation, dependency graphs, lazy evaluation,
geometry/mesh caching, background computation, WebGPU where appropriate — **never recompute the whole
model unnecessarily.** Cache identity = canonical definition hash + parameter state + kernel version +
representation settings; **never let stale geometry overwrite newer state.** If geometry cannot be
generated: `GeometryStatus = Invalid` with structured diagnostics — **never silently produce
approximate geometry marked valid**; the semantic/parametric component survives a geometry failure.

## §74 TESTING PHILOSOPHY
Validate MODEL BEHAVIOUR, not UI appearance: data (identities, persistence, versioning,
relationships) · parameters (types, units, formulas, dependencies, overrides) · geometry (profiles,
sketches, exact solids, features, recomputation) · constraints (valid, conflicting,
under/over-constrained) · components (definition, type, instance, nesting, hosting, connectors) ·
AI (create, modify, constrain, parameterise, type, query) · code (compile, validate, execute,
determinism, security) · World Model (semantic identity, relationships, spatial context,
queryability) · **regression: the existing Window Editor and Wall Profile Editor must keep working.**

## §75 DO NOT FAKE CAPABILITIES
If the UI says *Sweep* it performs a real sweep; *Constraint Equal* creates a real constraint;
*Parameter* creates a persistent parameter; if AI says *"the width is now proportional to the
height"* a real formula exists. **No demo-only geometry, no visual-only state, no hardcoded fake
behaviour.**

## §76 ARCHITECTURAL QUALITY GATES (between phases)
A existing contracts reused · B no duplicate source of truth · C semantic/parametric/geometric models
remain distinguishable · D AI uses the same command/contract system as the UI · E code uses the same
Component API/contracts · F geometry derived from canonical intent · G placed instances remain
parametric · H World Model understands components without meshes · I IFC stays an interoperability
mapping · J existing Window and Wall functionality still works.

## §77 IMPLEMENTATION PHASES
**0 Repository archaeology** (architecture map, existing contracts, model types, geometry pipeline,
AI/RAC pipeline, Window Editor analysis, Wall Profile Editor analysis, reuse opportunities,
architectural gaps — DO NOT IMPLEMENT) → **1 Canonical model proposal** (entity relationships,
ownership, references, lifecycle, persistence, versioning, dependency graph across
ComponentDefinition, ComponentType, ComponentInstance, SemanticClass, Property, Parameter, Formula,
Constraint, Feature, Geometry, Representation, Material, Relationship, Host, Connector, Visibility,
Provenance, Version) → **2 Technology investigation** (OCCT/OCCT-WASM, OpenGeometry, PlaneGCS,
ToubkalCAD, OpenZCAD, Three.js, WebGPU, OpenUSD concepts, IFC, bSDD, IDS — each with purpose,
licence, maturity, browser/WASM suitability, geometry capability, constraint capability, performance,
risks, fit, recommendation; **do not adopt blindly**) → **3 Contract design** (define/extend canonical
contracts; no UI before the model/contract architecture is clear) → **4 Window vertical slice**
(create → parameterise → constrain → generate geometry → materialise → type → place → modify instance
→ modify type → AI → World Model) → **5 Code authoring** (`code → contract → canonical model →
geometry → World Model`) → **6 Generic component** (prove with Door or Generic; **if the second
category needs excessive special cases, refactor the architecture before continuing**) → **7 Existing
editor migration** (Window Editor + Wall Profile Editor into the universal engine) → **8 Advanced
geometry** (sweeps, lofts, booleans, complex profiles, nested components, patterns, advanced
constraints, surface modelling).

## §78–80 LONG-TERM CAPABILITY AND FINAL PRINCIPLE
The architecture must eventually support: *"create a south-facing facade system with 30% glazing,
size shading by solar exposure, use a compliant low-carbon material, create S/M/L types, and make the
panel compatible with the project's curtain wall grid"* — through World Model + semantic model +
parametric model + geometry engine + rules + AI/RAC + component code, with AI creating the DEFINITION,
not merely drawing geometry.
> **A PRYZM component is a semantic, spatial, parametric, geometric and behavioural object that can be
> instantiated into the World Model and continuously recomputed as its inputs change.**
Authored through VISUAL / AI / CODE, all operating through **PRYZM CONTRACTS**, producing the
**CANONICAL PRYZM MODEL**, which produces the World Model + geometry + 3D + 2D + IFC + analysis +
documentation + AI queryability.
**Do not build a better Revit Family Editor. Build the authoring engine for programmable building
objects in the PRYZM World Model.** Geometry is a projection · IFC is an interoperability projection ·
meshes are a rendering projection · AI is an authoring and reasoning interface · code is an authoring
representation · **the canonical World Model is the source of truth.**

---

## §81 THE FOUNDER'S EXECUTION ORDER — the first deliverable
Not implementation: an **Architecture & Contract Audit** containing, in this order —
1. what PRYZM already has · 2. what can be reused · 3. what is missing · 4. proposed canonical data
model · 5. proposed geometric model · 6. proposed contract changes · 7. open-source technology
recommendation · 8. how the Window Editor and Wall Profile Editor map into it · 9. AI/RAC integration
architecture · 10. code API/DSL recommendation · 11. risks and unresolved architectural decisions ·
12. **only then** — the implementation plan.

> *"The biggest risk here isn't that the editor won't be powerful enough; it's that you accidentally
> create a beautiful editor whose internal model is too weak to become the PRYZM World Model."*

## §82 THE FOUNDER'S DEFINITION OF DONE — captured 2026-09-05, verbatim first, then made testable

> *"The edit component / creation is NOT finished — we need to be able to create reference lines,
> planes, geometry shapes, dimensions, both in 2D and 3D, etc. It is like a Revit family editor /
> creator for the new BIM 3.0 world / world-models-ready."* — founder, 2026-09-05, after the
> 2026-09-04 fleet reported the lane closed.

**Baseline the day this was written** (`docs/03-execution/plans/UCE-REACHABILITY-AUDIT.md`, measured):
the MODEL layer works end to end through the ordinary pipeline; a PLACED component draws NOTHING
(`ComponentCommitter` unmounted); an authored DEFINITION dies on reload; ONE solid kind bakes
(`extrude` along +Y, plus `box`) while `sweep`/`loft`/`revolve`/`boolean` refuse honestly; five real
constraint creators and a 2-D sketcher (`apps/component-editor/src/sketch/`, coincident · distance ·
fixed · parallel · perpendicular) exist **on an application no user can open** — no server route, absent
from the production bundle; code authoring (§46–56) absent. **So "not finished" is measured, not felt.**

**Done means all of the following are REACHABLE by a user in the product, not authored in a package:**

| # | Capability the founder named | Spec home | Acceptance (a test a user could perform) |
|---|---|---|---|
| 82.1 | **Reference planes** — named, on any work plane, carrying parameters | §14–15, §57–62 | Create a reference plane in a 2-D view; it is visible in the 3-D view; rename it; dimension to it. |
| 82.2 | **Reference lines** — sketched, angle-parametrisable | §14–15 | Sketch a reference line; constrain a form edge to it; change its angle parameter; the form follows. |
| 82.3 | **Dimensions that DRIVE** — a dimension between two references is labelled with a parameter; the parameter regenerates geometry (§12 parametric after placement) | §9–12, §14 | Dimension two reference planes, label it `W`; set `W=1200`; the extrusion between them is 1200 mm in 3-D. |
| 82.4 | **Geometry forms** — extrusion on ANY work plane (not +Y only), revolve, sweep, blend/loft, and a VOID cut; sketch-based | §16–20 | Each form kind bakes to a mesh the viewport draws; `boolean` void subtracts; a refused kind still refuses honestly (§75) but there is no kind left refusing. |
| 82.5 | **2-D AND 3-D** of the SAME definition — plan / elevation / section views plus the 3-D view, inside PRYZM (not a separate app) | §21–22, §57 | Switch views of one family; a reference plane edited in elevation moves in plan and 3-D. |
| 82.6 | **A placed instance renders** with true parametric geometry | §21, ADR-0376 D10 | Place; it draws; change a type parameter; it regenerates in place; undo works (C03). |
| 82.7 | **The definition persists** across reload and travels with the project | §34–38 | Author, reload, the family is still in the catalogue and its instances still resolve. |
| 82.8 | **SYSTEM families** — layered/typed systems (wall types, curtain systems) authored in the same editor | §23–25 | Author a layered wall type; place a wall of that type; the layers are real geometry (C84 EI). |

**Ordering rule.** 82.6 and 82.7 unblock everything a user can SEE, so they come first; 82.1–82.4 are one
program (the sketch + constraint + form pipeline the unreachable app already half-holds); 82.5 rides on
the view system the editor already has; 82.8 is last because it needs C84's per-family contracts.
**§75 still binds: a form kind that cannot bake refuses with the kind named; no capability is faked.**
