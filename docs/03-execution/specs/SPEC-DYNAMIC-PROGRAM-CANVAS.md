# SPEC-DYNAMIC-PROGRAM-CANVAS — the live, multi-view, direct-manipulation Program Canvas

**Status:** DRAFT (2026-06-10) — founder direction (verbatim §1). The next-generation authoring
surface that **replaces both** the static generation-modal form (`apps/editor/src/ui/house-layout/houseModalHtml.ts`
`buildHouseProgramEditFormHtml`, the apartment equivalent) **and** the onboarding "Project Brief"
panel (`apps/editor/src/ui/onboarding/BriefSchemaForm.ts`).

**Owner:** Generative design / editor UI · `@MarkHanoi`.

**Governs:** the **Dynamic Program Canvas** — a Miro-/mural-like board of rounded room **cards**
the user can add / resize / drag (including dragging a room **between storeys**), shown
**simultaneously** alongside **all** plan views and **all** graphs, that re-runs the deterministic
layout engine **instantly** on every edit. The canvas is the single editable source of *program
intent*; the plan and graph are **derived projections** that update in lock-step.

**Conflict-resolution order (strongest first):**
[product-vision](../../01-strategy/product-vision.md) →
[architecture](../../01-strategy/architecture.md) →
[C50-TYPOLOGY-PIPELINE](../../02-decisions/contracts/C50-TYPOLOGY-PIPELINE.md) →
[C52-EDITABLE-BUILDING-GRAPH](../../02-decisions/contracts/C52-EDITABLE-BUILDING-GRAPH.md) →
[ADR-0069 — dynamic program canvas as primary authoring surface](../../02-decisions/adrs/0069-dynamic-program-canvas-as-primary-authoring-surface.md) →
[ADR-0061 building-graph bidirectional edit](../../02-decisions/adrs/0061-building-graph-bidirectional-edit-substrate.md) →
[ADR-0058 unified building graph](../../02-decisions/adrs/0058-unified-building-graph.md) →
[ADR-0067 graph-IR / intent-first BIM 3.0](../../02-decisions/adrs/0067-graph-ir-intent-first-building-graph-bim3.md) →
[ADR-0056 typology-declared brief](../../02-decisions/adrs/0056-typology-declared-brief.md) →
this SPEC.

**Sibling references:**
[SPEC-LIVE-SINGLE-OPTION-LAYOUT-MODAL](./SPEC-LIVE-SINGLE-OPTION-LAYOUT-MODAL.md) (the §MODAL-DYNAMIC
live-regenerate loop this canvas generalises out of the modal),
[SPEC-LIVING-BUILDING-GRAPH](./SPEC-LIVING-BUILDING-GRAPH.md) (the editable rounded-node graph
renderer this canvas reuses),
[SPEC-TYPOLOGY-BRIEF-SCHEMA](./SPEC-TYPOLOGY-BRIEF-SCHEMA.md) (the slider brief this canvas absorbs),
[SPEC-CASA-UNIFAMILIAR-TYPOLOGY](./SPEC-CASA-UNIFAMILIAR-TYPOLOGY.md) (the multi-storey house engine the canvas drives).

---

## §1 — The founder directive (verbatim)

> *"The modal for the residential house (and will extrapolate to apartment and other typologies)
> needs to be better. The tools need to be more dynamic — we need to use sliders. We should have
> like 'boxes with curved angles' for each room in the graphs AND in the plan view — this will be
> in the [tools] area — user can add bedrooms easily, change the area of each bedroom, MOVE the
> boxes with curved angles like cards from level ground to level 1 — could be like a mural / Miro
> dynamic — and the graph and layout will change. The user will see ALL the plan views and graphs
> at the same time and changes will dynamically show on the screen instantly. User could add levels
> on the fly, etc. This will also REPLACE the original 'project brief' panel — it should go."*

Decomposed into requirements:

| # | Requirement | This SPEC's section |
|---|---|---|
| **R1** | Rounded room **cards** ("boxes with curved angles") for each room, in the **graph AND the plan view** | §3 (canvas model), §4 (cards) |
| **R2** | Lives in the **[tools] area** (a dockable canvas surface, not a transient modal) | §6 (surface + layout) |
| **R3** | **Add a bedroom** (and any room) easily | §5.1 |
| **R4** | **Change the area** of each room | §5.2 |
| **R5** | **MOVE** a room card **between storeys** (ground ↔ level 1), Miro/mural-style drag | §5.3 |
| **R6** | **Add levels on the fly** | §5.4 |
| **R7** | **Sliders** — dynamic global design controls | §5.5 |
| **R8** | See **ALL plan views AND all graphs at the same time**, changes show **instantly** | §6 (multi-view) |
| **R9** | **Replaces** the project-brief panel **and** the modal form | §7 |
| **R10** | **Connect rooms** in the graph (draw an edge) → an adjacency/access edit → the plan updates | §5.6 |
| **R11** | A **room-type palette** in the tools rail → **drag a room type onto a level's graph** to add it to that storey | §5.7 |
| **R12** | **Selection sync** — select a node/card/polygon → the **same room highlights** across plan + graph + card | §5.8 |
| **R13** | **Node inspector** — select → INTERROGATE a node: information · dependencies · adjacency · circulation (read-only living-graph card above the editor) | §5.9 |

### §1.1 — The three-pane refinement (founder directive, verbatim 2026-06-10)

> *"I want to remove [the current stacked modal] and add the information in the modal as 3 sections:
> in GREEN [LEFT] the floor plans — ground and first; in RED [CENTER] the graphs — the existing
> living graph by level; when the user selects a node the room highlighted on the modal; then in BLUE
> [RIGHT] the tools bar — user can dynamically change the number of levels from 1 to 3 the screen
> updates automatically, the user can update the number of bedrooms in first floor; the tool bars
> have a section like a tool-bar canvas — the user can add elements to the graph by drag and drop —
> drag a bedroom to the ground-level graph — creates relationships — that will manifest in placing and
> distributing a new bedroom in the layout; user can connect the rooms and the plan view updates;
> increase size of room with a slider; drag a room from graph first floor to ground floor — the floor
> plan updates, etc."*

This fixes the **layout** of §6's multi-view surface into **THREE columns** (the §26.5 tracker entry):

| Column | Colour (founder annotation) | Content |
|---|---|---|
| **LEFT** | 🟩 green | **Plan view per storey**, stacked (ground + each upper) — `buildLayoutThumbnailSvg` per storey. |
| **CENTER** | 🟥 red | **The Living Graph per storey** (`LivingGraphCanvas`, one per level) — node-select highlights the room (R12). The semantic centrepiece. |
| **RIGHT** | 🟦 blue | **The tools rail** — level stepper (1→3, R6) · per-storey bedroom/bath controls (R3) · the room-type **palette** to drag onto a graph (R11) · the per-room size sliders (R4) · the global `ScoringWeights` sliders (R7). |

The graph is the SEMANTIC TRUTH (the founder's words across §26 / A.21.D37); the plan reflects it; the
right rail is where the program is authored. This **replaces** the current generate modal entirely.

### §1.2 — Pre-execution, single, canvas-driven (founder directive, verbatim 2026-06-10)

> *"The goal is to have a dynamic SINGLE panel where the user can modify on the fly BEFORE executing
> the geometry on the main PRYZM canvas — everything needs to be dynamic flowing — canvas driven."*

This fixes the **operating model** (and resolves R-D in `SPIKE-DYNAMIC-PROGRAM-CANVAS §7`):

1. **One panel, pre-execution.** The canvas is a SINGLE dynamic panel the user manipulates **before**
   any geometry lands on the main Pryzm scene. All edits drive the **pure** regenerate loop (§3.1) —
   plan + graph projections refresh live **inside the panel** — and **no** wall/door/room is written
   to the editor stores until the user hits **Execute / Use this layout**. This is exactly the
   lifecycle where `HouseLayoutController._regen` is **alive** (it is only torn down at build —
   `HouseLayoutController.ts:385`), so the live loop works by construction; the §6 dockable
   [tools]-area evolution (own shell-analysis lifecycle) is Phase 3, not the initial model.
2. **Canvas-driven, everything flowing.** Every control (cards, sliders, level stepper, palette drag,
   edge-connect) writes a program/stash delta and re-runs the engine; the three panes flow in
   lock-step. There is no static form step and no intermediate commit — the panel is continuously
   live until the single terminal **Execute** action commits the chosen result to the main canvas
   (the existing `HouseLayoutExecutor` build path, one undoable batch).
3. **OQ2 resolved.** Per this directive the panel does NOT auto-commit; it is a pre-execution
   authoring surface terminating in one explicit **Execute** → geometry on the main canvas.

---

## §2 — Where this sits in the existing architecture

This is a **fusion**, not new infrastructure. Every primitive already exists; the canvas wires them
into one direct-manipulation surface. The honest substrate audit:

| Capability the canvas needs | Already exists (file:line) | What it gives us |
|---|---|---|
| Live regenerate loop (edit → re-run pure engine → refresh) | `HouseLayoutController._regenerate` (`apps/editor/src/ui/house-layout/HouseLayoutController.ts:328`), `_computeVariants:233`, `_mergeOverrides:304`; apartment debounced sibling `ApartmentLayoutController.ts:88,127` | The §MODAL-DYNAMIC loop: a form change re-runs `generateHouseLayoutOptions(...)` **synchronously** against a cached `ShellAnalysis` and refreshes the cards. The canvas is the same loop with a card UI instead of a `<form>`. |
| Per-room **area** override | `activeRoomAreaOverrides.ts:30` (`setRoomAreaOverride(name, m²)`), bound to `ApartmentProgram.roomAreasByName` (C52 §2 E1), merged in `HouseLayoutController._mergeOverrides:304` | R4: resize a card → write the stash → regenerate. No new engine knob. |
| Per-room **type** override | `activeRoomTypeOverrides.ts` (`setRoomTypeOverride`), bound to `roomTypesByName` (C52 §2 E2) | Re-type a card (bedroom → study). |
| Per-room **floor (storey) move** | `activeRoomFloorOverrides.ts:40` (`setRoomFloorOverride(storeyQualifiedNodeId, storeyIndex)`), keyed by `storey:<s>/<roomName>`, merged into a `roomFloorByName` program field; consumed by the house orchestrator (XFLOOR-GRAPH) | **R5 already has its engine seam.** Dragging a card to another lane = `setRoomFloorOverride` + regenerate. |
| Whole-house program → per-storey split | `allocateProgramToStoreys` (`packages/ai-host/src/workflows/houseLayout/storeyAllocation.ts:44`) | The deterministic count-based storey split the floor override re-steers. |
| Rounded-node graph renderer | `LivingGraphCanvas.ts` (Canvas2D, `draw():120`, `pick():98`, `roundRect():344`, room-type colour, √area radius, drag-friendly hit-test) | R1 (graph half): the rounded "boxes" / nodes already render + hit-test + breathe. |
| Graph → regenerate wiring | `LivingGraphOverlay.ts:1786` (`triggerApartmentLayout(null)` debounced on a node edit, re-binds on `pryzm:building-graph-rebuilt:94`) | The graph-edit half of the live loop, already shipped. |
| Plan thumbnail (rounded room polygons) | `apartment-layout/layoutThumbnail.ts` (`buildLayoutThumbnailSvg`), reused per-storey in `houseModalHtml.storeyHtml:163` | R1 (plan half): the plan render the canvas shows live. |
| Slider brief (typology-declared) | `BriefSchemaForm.ts` (range/stepper/select/multiselect/toggle, `BriefSchema` from `@pryzm/schemas`) | R7 + the controls the canvas **absorbs** from the brief panel. |
| Determinism contract | C52 §1 + ADR-0061: edit → per-node delta → existing trigger → existing engine → inverse projection; un-edited ⇒ byte-identical | The canvas is bound by exactly this; it is the per-node-override family with a spatial UI. |

**Genuinely new** (everything else is reuse): (a) the **card layer as the program editor** (a
draggable rounded-rect board bound to the program, not a `<form>`); (b) **storey lanes** as drop
targets that bind to the floor-override stash; (c) the **simultaneous multi-pane layout** (canvas +
all plans + all graphs in one dockable surface); (d) **add-level on the fly** from the canvas.

---

## §3 — The canvas model

The canvas renders the **resolved program** as a set of **storey lanes**, each holding **room
cards**. It is a *view-model over the program*, never a parallel store.

```
┌─ Dynamic Program Canvas (dockable, [tools] area) ───────────────────────────┐
│  ⊕ Add level        Daylight ▭▭▭▭▭▭○──   Privacy ▭▭▭○──   Compactness ▭○──   │  ← §5.5 sliders
│ ┌─ First floor ─────────────────────────────────────────────────⊕ Add room┐ │
│ │  ╭─Bed 1─╮  ╭─Bed 2─╮  ╭─Master──╮  ╭─Bath─╮                              │ │  ← lane (storeyIndex 1)
│ │  │ 14 m² │  │ 12 m² │  │  18 m²  │  │ 6 m² │                              │ │
│ │  ╰───────╯  ╰───────╯  ╰─────────╯  ╰──────╯                              │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ Ground floor ────────────────────────────────────────────────⊕ Add room┐ │
│ │  ╭─Living──╮  ╭─Kitchen╮  ╭─Dining╮  ╭─WC─╮  ╭─Hall─╮                     │ │  ← lane (storeyIndex 0)
│ │  │  24 m²  │  │  12 m² │  │ 10 m² │  │3 m²│  │ 5 m² │                     │ │
│ │  ╰─────────╯  ╰────────╯  ╰───────╯  ╰────╯  ╰──────╯                     │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

### §3.1 — The bidirectional loop (the only data flow)

```
                  ┌──────────────────────── PROGRAM (single source of intent) ─────────────────────┐
   user edits a   │  ApartmentProgram + per-instance stashes:                                       │
   CARD  ───────► │   roomAreasByName / roomTypesByName / roomFloorByName  (+ storeyCount, weights)  │
                  └───────────────────────────────┬──────────────────────────────────────────────┘
                                                   │  (debounced, ≤ ~120 ms)
                                                   ▼
                            generateHouseLayoutOptions(shell, mergedProgram, …)   ← EXISTING pure engine
                                                   │
                          ┌────────────────────────┼────────────────────────┐
                          ▼                         ▼                        ▼
                   PLAN projection           GRAPH projection          CANVAS projection
              (buildLayoutThumbnailSvg)   (LivingGraphCanvas)      (re-resolve card sizes/labels)
                          └────────────────────────┴────────────────────────┘
                              ALL THREE refresh in lock-step, instantly
```

The card layer, the plan, and the graph are **three projections of one regenerated result**. The
user edits the **canvas** (cause); the engine is the **mechanism**; the plan + graph are **effects**
(ADR-0061 §Decision; C52 §1). There is exactly one engine, one scorer, one mutation path.

### §3.2 — Card identity (matches the existing stash keys)

A card's stable identity is its **storey-qualified node id** `storey:<s>/<roomName>` (the id
`activeRoomFloorOverrides.ts:32` already documents and the concatenated cross-floor graph already
mints). Within a single-storey typology (apartment) the bare room display name suffices (the area /
type stashes are name-keyed). This guarantees a card, a graph node, and a plan polygon all key to
the **same** room instance with **zero** new id scheme.

---

## §4 — Room cards ("boxes with curved angles")

A card is a rounded-rect tile bound to one resolved room. It renders:

- **Title** = the room display name (`Master Bedroom`, `Bedroom 1`, …), the same name the bubble
  graph mints and the stashes key on.
- **Area badge** = the resolved area (m²) — the live result, not the brief target (so the card
  mirrors the plate, exactly as `HouseLayoutController._resolvedProgramFor:273` already does for the
  modal form's seed).
- **Type chip** = room-type colour from the shared `ROOM_TYPE_COLOUR` (`LivingGraphCanvas.ts:356`),
  so cards, graph nodes, and plan fills share **one** colour source.
- **Handles** — a resize handle (R4) and a drag handle (R5).

Cards render with the **same** rounded-rect path + brand the Living Graph nodes use (`roundRect`,
`#6600FF` accent, white field). R1 is satisfied by reusing `LivingGraphCanvas` for the graph half
and a sibling Canvas2D/DOM card renderer for the lane half; they share the renderer's rounded-rect +
colour helpers so the two surfaces read as one look.

---

## §5 — Interactions

Each interaction writes the **smallest** program/stash delta and triggers the **existing** debounced
regenerate. None mutates a geometry store (P6 / C52 §3.1).

### §5.1 — Add a room (R3)
`⊕ Add room` on a lane increments the program count for the chosen room type **on that storey** (or,
for the per-instance path, mints a `roomTypesByName` entry against a new name). For bedrooms/baths
this is the existing `program.bedrooms++` / `program.bathrooms++` the modal form already drives
(`houseModalHtml.ts:130`). Regenerate; the new card appears once the engine produces it.

### §5.2 — Resize a room → area override (R4)
Dragging a card's resize handle (or a per-card area stepper) writes
`setRoomAreaOverride(roomName, m²)` (`activeRoomAreaOverrides.ts:30`) → `roomAreasByName` (C52 E1).
Blank/zero clears the override (engine default). Regenerate. The card snaps to the **resolved** area
the engine returns (clamped to the room's architectural minimum + `minAreaFrac`/`maxAreaFrac`), so
the card can never show an illegal size.

### §5.3 — Move a room between storeys → floor override (R5)
Dragging a card from one lane to another writes
`setRoomFloorOverride("storey:<src>/<roomName>", targetStoreyIndex)`
(`activeRoomFloorOverrides.ts:40`) → `roomFloorByName`. The house orchestrator resolves the room
type from the name and the source storey from the prefix, moves one count of that type to the target
storey, and re-runs `allocateProgramToStoreys`. Regenerate; the card lands in the target lane.
Dragging back to its own lane clears the override (engine default). **Apartment (single storey) has
no second lane**, so R5 is house-only by construction.

### §5.4 — Add a level on the fly (R6)
`⊕ Add level` increments `storeyCount` (the same field `houseModalHtml.ts:128` `storeys` input
drives, clamped to the engine's range). A new empty lane appears; the engine re-allocates the
whole-house program across the new storey count and regenerates. Removing the top empty level
decrements `storeyCount` (rooms on a removed level are re-allocated down by the allocator, never
dropped).

### §5.5 — Global sliders (R7)
The canvas header carries the `ScoringWeights` sliders (Daylight / Privacy / Kitchen / Compactness —
the `WEIGHT_SLIDERS` set, `houseModalHtml.ts:61`) bound to the **existing** weight inputs, plus any
typology-declared brief fields (§7). A slider change updates `weights` / the brief and regenerates —
the ADR-0060 global-slider seam, unchanged.

### §5.6 — Connect two rooms in the graph → adjacency/access edit (R10)
Drawing an edge between two graph nodes (drag from node A to node B in the CENTER pane) records a
**desired-adjacency override** for that pair and regenerates → the engine prefers a layout where A
and B share a wall/door, and the plan updates to reflect it. Mechanism: a new per-instance stash
`activeRoomAdjacencyOverrides.ts` → a program field `roomAdjacencyByName: Array<[nameA, nameB]>` that
the bubble graph reads as **extra desired edges** (it already builds an adjacency edge set —
`bubbleGraph.ts` `link()`), subject to the **permission matrix** (`doorAllowedBetween`,
`programRules.ts`): an illegal pair (e.g. bedroom↔bedroom) is rejected with a soft "not permitted"
hint, never forced. Removing the drawn edge clears the override. **Engine seam to add (XADJ):** the
`roomAdjacencyByName` field + the bubble-graph consumer; empty ⇒ byte-identical (C52 I2). New vs the
existing area/type/floor stashes — see §8.

### §5.7 — Room-type palette → drag a room onto a level's graph (R11)
The RIGHT rail carries a **palette** of room-type chips (Bedroom · Bathroom · Study · Living · …,
sourced from the typology's `ROOM_RULES`). Dragging a chip onto a storey's graph lane (or plan)
**adds one room of that type to that storey** — the spatial form of §5.1's add-room. For
count-backed types (bedroom/bath) it increments the storey's count via `roomFloorByName` semantics
(add at target storey); for the per-instance types it mints a `roomTypesByName` room. Regenerate; the
engine places + distributes the new room (e.g. "drag a bedroom onto the ground graph → a bedroom is
placed + the layout redistributes"). The drop position is a hint to the placement, not a hard pin
(geometry stays engine-derived per ADR-0067).

### §5.8 — Selection sync across the three panes (R12)
Selecting a room in ANY pane — a card (RIGHT), a graph node (CENTER), or a plan polygon (LEFT) —
highlights the **same** room instance in **all three**, via the shared storey-qualified id (§3.2) and
the editor's existing `window.selectionBus` (the §BUBBLE-SELECT-HIGHLIGHT path shipped in v112 sends
the room id as the primary selection). This is a **read-only projection** (no program edit), so it is
unconstrained by §8 and works in the live panel before execution as well as on the committed scene.

### §5.9 — Node inspector card — INTERROGATE a graph node (§54)
Selecting a living-graph node (or its twin plan polygon — both carry `data-room-name`) opens the
**node editor popover** (`HouseLayoutModal._openGraphNodeEditor`) PRECEDED by a read-only **inspector
card** (`buildNodeInspectorHtml`, `houseModalHtml.ts`) so each node reads as a selectable, interrogable
CARD rather than a bare Area/Type/Floor/Connect form. The inspector renders four labelled sections,
all **derived editor-side** from the clicked room's `LayoutRoom` + its storey's full `LayoutRoom[]`
(`HouseLayoutModal._storeyRooms(srcStorey)` ⇒ `options[0].result.perStoreyLayout[srcStorey].rooms`) —
**no ai-host rules-DB import**, pure + Node-testable:

- **Information** — `room.name`, a humanised `room.type` label, and `room.area` (m², or "auto").
- **Dependencies** — a one-line program ROLE from a small local `type → role` map (public/entry vs
  private off-the-corridor vs circulation/service) mirroring the known room roles.
- **Adjacency** — each `room.adjacentTo` neighbour as a chip; "No connected rooms" when empty.
- **Circulation** — does the room touch a `corridor`/`hall` (the `CIRCULATION_TYPES` set, resolved by
  mapping each `adjacentTo` name → its room type)? Renders **On circulation ✓ (via X)** /
  **Not on circulation ✗ (served through Y / sealed)**.

The card is **additive** — it sits ABOVE the existing edit controls; all prior behaviour is preserved:
drag-and-drop nodes, connect-to-other-nodes (`addRoomAdjacency`), move-between-floors
(`setRoomFloorOverride`), and the Area/Type/Floor edits + debounced regenerate. The popover is white +
#6600FF (brand), compact, draggable by its title (`§54-DRAG`), and dismissible. Returns `''` for a
missing room so the modal falls back to the bare editor. Covered by the `§54` test block in
`houseModalHtml.liveModal.test.ts`.

---

## §6 — The simultaneous multi-view surface (R2 + R8)

The canvas is a **dockable surface in the [tools] area** (not a transient modal). It hosts a
**multi-pane** layout showing, **at the same time**:

- the **Program Canvas** (storey lanes of cards) — the editor;
- **every plan view** — one live plan pane per storey (per-storey `buildLayoutThumbnailSvg`, the same
  renderer `houseModalHtml.storeyHtml:163` already produces per storey);
- **every graph** — one Living Graph per storey (`LivingGraphCanvas`) **and** the whole-house
  cross-floor graph.

All panes are projections of the **same** regenerated result (§3.1), so a single regenerate refreshes
**all of them at once** — satisfying "see ALL the plan views and graphs at the same time and changes
will dynamically show on the screen instantly." Pane layout reuses the editor's existing multi-view
plumbing (the views rail / floating-panel surface, `ViewsRailPanel.ts:187`,
`SPEC-CANVAS-FLOATING-PANELS`); the canvas does **not** invent a new window manager.

**Performance budget (R8 "instantly"):** the regenerate path is the **pure synchronous**
`generateHouseLayoutOptions` (`HouseLayoutController._computeVariants:249`) — no async relay, no
network, no token cost. Debounce ≤ ~120 ms; target a refresh well under one frame budget for a
typical residential program. The drag itself is rendered immediately (optimistic card move); the
regenerate lands the authoritative result a beat later.

---

## §7 — What it replaces (R9)

| Replaced surface | File | Disposition |
|---|---|---|
| House modal program-edit `<form>` | `houseModalHtml.ts` `buildHouseProgramEditFormHtml:113` | Superseded — the canvas IS the program editor. The modal's role shrinks to a final "Use this layout" confirmation (or is absorbed entirely). |
| Apartment modal program-edit form | `apartment-layout/layoutModalHtml.ts` | Same. |
| Onboarding **Project Brief** panel | `onboarding/BriefSchemaForm.ts` | **Removed.** Its typology-declared brief fields (`BriefSchema` from `@pryzm/schemas`) migrate into the canvas header as sliders/steppers (§5.5). The brief is no longer a separate one-shot form — it is the canvas's initial state. |

The brief panel "should go": after Phase 3 the onboarding flow opens the canvas directly (seeded
from the typology default brief), and the user authors the program by manipulating cards instead of
filling a form.

---

## §8 — Determinism contract (binding)

The canvas is bound by **C52 §1 + ADR-0061** verbatim:

1. **Edit → per-node delta, not a direct mutation.** Every card edit writes a typed value to a
   session stash (`activeRoom{Area,Type,Floor}Overrides.ts`) or a program count/weight — never a
   geometry-store write (C52 §3.1, P6).
2. **Re-run via the existing engine.** The canvas calls the **existing** synchronous house
   regenerate (`generateHouseLayoutOptions`) / the apartment trigger — no new generate path
   (C52 §3.2, ADR-0061 §Decision.2).
3. **Plan + graph are derived projections.** They are rebuilt from the regenerated result; the
   canvas never paints geometry it authored (ADR-0061 §Decision.3; geometry is derived, never
   user-authored — ADR-0067 manifesto).
4. **Baseline identity (I2).** An **un-edited** canvas (empty stashes) ⇒ `_mergeOverrides` returns
   the same program reference ⇒ a **byte-identical** layout (C52 §3, `HouseLayoutController._mergeOverrides:307`).
5. **Typology-agnostic.** Every seam is `{ name → value }` / a program count / a weight — no
   house-specific or apartment-specific knob in the canvas core, so it extrapolates per C50 (§9
   Phase 4).

---

## §9 — Phased delivery plan

| Phase | Scope | Acceptance |
|---|---|---|
| **Phase 0 — spike** | One storey lane of draggable rounded cards beside one live plan; resize a card → `roomAreasByName` → synchronous regenerate → plan + cards refresh. See `SPIKE-DYNAMIC-PROGRAM-CANVAS.md`. | A bedroom card resized larger → the plan's bedroom polygon grows on the next regenerate, within ~120 ms, with no geometry-store write. |
| **Phase 1 — card grid + live regen** | Full per-storey lanes; add room (R3); resize (R4); global sliders (R7); plan + graph panes per storey, refreshed in lock-step. | Edit any card or slider → all panes refresh from one regenerate; un-edited canvas reproduces the byte-identical baseline. |
| **Phase 2 — cross-storey drag + add-level** | Drag a card between lanes → `roomFloorByName` (R5); `⊕ Add/remove level` → `storeyCount` (R6); cross-floor whole-house graph pane. | A bedroom dragged ground→first appears upstairs after regenerate; +1 level adds a lane and re-allocates the program; drag-back clears the override. |
| **Phase 3 — replace the brief panel** | Dock the canvas in the [tools] area (R2); migrate `BriefSchema` fields into the canvas header; remove `BriefSchemaForm` from onboarding; onboarding opens the canvas seeded from the typology default brief (R9). | New-project onboarding shows the canvas, not the Project Brief form; the modal program form is gone or reduced to confirm-only. |
| **Phase 4 — extrapolate to apartment + other typologies** | Drive the apartment relay + any future typology engine from the same canvas core; storey lanes collapse to one for single-storey typologies; cards bind to the same stashes. | The apartment generator is authored on the identical canvas (one lane); a third typology needs only its pack's brief schema + engine binding, no canvas change (C50). |

---

## §10 — Brand (non-negotiable)

White + **#6600FF**, **compact**, **NO black** (founder rule, memory `onboarding-site-generate-view-flow`).
Cards reuse the Living Graph's rounded-rect + `#6600FF` accent + white field; sliders reuse the
`alm-program-slider` brand classes. No dark surfaces (the onboarding dark-modal violation must not
recur).

---

## §11 — Open questions (founder input — see report)

- **OQ1 (biggest):** when a card edit makes the program infeasible for the shell (e.g. resize a
  bedroom past what the plate holds, or add a level the footprint can't support), the engine
  HARD-rejects (`validateApartmentEnvelope`, memory `envelope-reject-silent-fallback`). What should
  the canvas show — a clamped card that snaps back, a red "won't fit" card state, or a soft warning
  with the over-allocated card flagged? This is the central UX decision of the whole feature.
- **OQ2:** does the canvas fully **replace** the pick-modal, or remain a pre-step that still ends in
  a "Use this layout" confirmation that commits to the scene?
- **OQ3:** single best option (the current §MODAL-DYNAMIC behaviour) vs. a small set of variants
  shown as alternative card arrangements?
