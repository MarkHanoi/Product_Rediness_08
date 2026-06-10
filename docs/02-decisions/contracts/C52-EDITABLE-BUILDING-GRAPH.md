# C52 — Editable Building Graph (bidirectional edit substrate)

> **Stamp**: 2026-06-08 · **Status**: CANONICAL (ratified 2026-06-08 via [ADR-0061](../adrs/0061-building-graph-bidirectional-edit-substrate.md))
> **Authority**: this contract is the **normative form** of [ADR-0061](../adrs/0061-building-graph-bidirectional-edit-substrate.md). When ADR-0061 and this contract disagree, **this contract wins** (per the conflict-resolution hierarchy in [CLAUDE.md](../../../CLAUDE.md) + [README.md](./README.md): contract suite > ADR).
> **Scope**: governs the **Living Building Graph as an editable Inspect surface** (tracker **A.26**, the founder's "BIM 2.0/3.0" differentiator). Codifies WHICH graph-node attributes are editable, the per-node-override → existing-engine-re-run write-path, the baseline-identity invariant (an un-edited graph ⇒ byte-identical layout), the inverse projection (regenerated layout → UBG rebuild → graph), and the P6 mutation discipline. The sibling-by-design of [C20](./C20-BUILDING-AND-APARTMENT-AGGREGATES.md) (the read-only aggregate hierarchy this contract makes editable) + [C50](./C50-TYPOLOGY-PIPELINE.md) (the deterministic engine the edits re-run).
> **Constraint reference**: [ADR-0058](../adrs/0058-unified-building-graph.md) (UBG — specialised graphs are projections of one node/edge model) · [ADR-0060](../adrs/0060-living-design-parameters.md) (Living Design Parameters bind to the existing substrate, not a parallel scorer — the GLOBAL-slider sibling of this PER-NODE decision) · [C09](./C09-AI-AND-VISIBILITY-INTENT.md) §2.4 (in-process AI plane) · [C50](./C50-TYPOLOGY-PIPELINE.md) (Stage-4 generative engine) · [SPEC-LIVING-BUILDING-GRAPH](../../03-execution/specs/SPEC-LIVING-BUILDING-GRAPH.md) · [SPEC-LIVING-DESIGN-PARAMETERS](../../03-execution/specs/SPEC-LIVING-DESIGN-PARAMETERS.md) · [SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE](../../03-execution/specs/SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE.md).
> **Owner**: Generative design · `@MarkHanoi`.
> **Parent ADR**: [ADR-0061](../adrs/0061-building-graph-bidirectional-edit-substrate.md) (ratified 2026-06-08).

---

## §1 — The architectural invariant

The Unified Building Graph (UBG, [ADR-0058](../adrs/0058-unified-building-graph.md)) is a **read-only projection** of the model: the specialised graphs (room topology, semantic graph, sightline/bubble graph) are projected into one queryable node/edge model that the Living Graph overlay renders and interrogates. C52 makes that graph **bidirectional**:

**A graph-node edit produces a structured, PER-NODE layout-constraint delta that re-runs the EXISTING deterministic layout engine through the EXISTING generate trigger; the regenerated layout is re-projected back into the graph. The graph never mutates the model directly and never forks the engine.**

The graph is the **cause** (the user's intent), the deterministic engine is the **mechanism**, the model is the **effect**. There is exactly one engine, one scorer, one mutation path — the edit is just another input to the already-tested engine.

This is the per-node analogue of [ADR-0060](../adrs/0060-living-design-parameters.md)'s GLOBAL sliders: where a slider re-weights an engine input for the whole layout, a node edit overrides an engine input for one room. Both seams are the same: write a session stash → `gatherLayoutPayload` merges it into the program → the existing `triggerApartmentLayout` re-runs `generateDeterministicLayouts`.

---

## §2 — The editable node attributes

A node attribute is **editable** under C52 only when it can bind to an engine input the deterministic layout engine **already consumes**. Each editable attribute MUST name its existing substrate; inventing a new engine knob to make an attribute editable is a §3 violation.

| # | Attribute | Engine substrate it binds to | Status |
|---|---|---|---|
| **E1** | **Area** (m², per room) | `ApartmentProgram.roomAreasByName[<name>]` — per-instance area target the bubble graph already honours, clamped to the room's architectural minimum + `minAreaFrac`/`maxAreaFrac`. | ✅ **A.26.3 shipped** (v53) |
| **E2** | **Occupancy / type** (per room) | `ApartmentProgram.roomTypesByName[<name>]` — per-instance type override the bubble graph applies by re-typing the minted room of that name, re-deriving its area weight / minima / habitability / adjacency rules from the single-source-of-truth `roomRule`. Sibling of E1. | ✅ **A.26.4 shipped** (this contract) |
| **E3** | **Adjacency preference** (per room) | The program-rules `adjacencyPreference` matrix the `objectives.adjacency` scorer axis reads (+ the A.25.3 `EngineTuning.adjacencyStrictness` multiplier). A per-node preference delta re-weights one room's preferred neighbours. | ⚪ planned (A.26.4 follow-on) |
| **E4** | **Sun / acoustic target** (per room) | The `objectives.solarOrientation` / `objectives.acousticZoning` env-driver axes (the same axes the A.25.3 climate slider drives globally via `SolarBias.weight`). A per-node target biases one room's placement. | ⚪ planned (A.26.4 follow-on) |

E1 + E2 are LIVE. E3 + E4 are tracked but NOT yet implemented; they MUST follow the same per-node-override discipline (§3) when they land — find the existing axis, bind to it, never add a parallel scorer.

### §2.1 — The per-instance-by-name override family

E1 + E2 share ONE mechanism family: a **name-keyed per-instance override** on `ApartmentProgram`, consumed in `buildBubbleGraph`, defaulting to a no-op. The room **display name** (the deterministic name the bubble graph mints — "Master Bedroom", "Bedroom 1", "Kitchen") is the key. There MUST be exactly one per-room-area path (`roomAreasByName`) and exactly one per-room-type path (`roomTypesByName`); a second field for the same axis is a §3 violation.

A re-type (E2) re-types an **existing** room slot — it never adds, removes, or re-orders a room. The room id + name are preserved; only `type` (and the `needsWindow` / `isPrivate` re-derived from the new type's rule) change. A name with no minted room, an invalid type value, or a value equal to the room's existing type is a no-op.

### §2.2 — The Dynamic Program Canvas is the canvas-driven authoring surface for this family (ADR-0069)

The per-node-override family (E1–E4) + the cross-storey move are authored, as of 2026-06-10, on the **Dynamic Program Canvas** ([ADR-0069](../adrs/0069-dynamic-program-canvas-as-primary-authoring-surface.md) / [SPEC-DYNAMIC-PROGRAM-CANVAS](../../03-execution/specs/SPEC-DYNAMIC-PROGRAM-CANVAS.md)) — a **single, pre-execution, three-pane panel** (plan LEFT · graph CENTER · tools RIGHT) where the user manipulates the program **before** geometry is committed to the main canvas. The canvas is a spatial UI over **exactly this contract's write-path** — it adds **no** new mutation mechanism (it would otherwise be the §3.4 parallel-mutator trap). The mapping:

| Canvas interaction (SPEC) | This contract's seam |
|---|---|
| Resize a room card / size slider (R4, §5.2) | **E1** `roomAreasByName` |
| Re-type a card (bedroom→study) | **E2** `roomTypesByName` |
| **Connect two rooms** in the graph (R10, §5.6) | **E3** adjacency preference (the drawn edge raises the `adjacencyPreference` for that pair, gated by `doorAllowedBetween` — never forces a forbidden pair) |
| **Drag a room from the palette / drag between storeys** (R5/R11, §5.3/§5.7) | the **storey-move** override `roomFloorByName` (keyed `storey:<s>/<roomName>`, the XFLOOR-GRAPH seam — a name-keyed sibling of §2.1; default-no-op, §3 discipline) + the program count for add-room |
| Add level (R6) / sliders (R7) | `storeyCount` / `ScoringWeights` (program-level, not per-node — the ADR-0060 global seam) |
| **Selection sync** (R12, §5.8) | NONE — a **read-only** projection (`window.selectionBus`), not an override; unconstrained by §3 |

`roomFloorByName` and the E3 adjacency override, when implemented, MUST obey §2.1 (name-keyed, default-no-op) + §3 (per-node delta → existing trigger → no geometry write) + I2 (baseline identity) exactly as E1/E2 do. The terminal **Execute** action is the ONE place geometry lands on the scene (via `HouseLayoutExecutor`, P6, one undoable batch).

---

## §3 — The write-path discipline (MUST / MUST NOT)

### §3.1 — MUST: edit → per-node delta, not a direct mutation

A node edit MUST be recorded as a per-node override on an engine input — a typed value in a **session stash** (`apps/editor/src/ui/apartment-layout/activeRoom*Overrides.ts`, sibling to `activeDesignParams.ts`), keyed by the room display name. It MUST NOT write to a geometry / element store.

### §3.2 — MUST: re-run via the EXISTING trigger

The edit MUST (debounced) call the **existing** §11 apartment-layout trigger (`triggerApartmentLayout`). `gatherLayoutPayload` reads the stash and merges it into the program it builds. No new generate path may be invented; the same trigger every other entry-point uses re-runs the deterministic engine.

### §3.3 — MUST: inverse projection is the EXISTING rebuild

The regenerated layout rebuilds the UBG and emits `pryzm:building-graph-rebuilt` (via `apartment.layout-executed` → the overlay's `rebuildGraphFromModel`); the Living Graph already re-binds on that event (re-entry guarded, node positions preserved). The "graph re-lays-out after the layout changes" loop MUST be this existing projection running in reverse — no new read-back code path. The graph MUST NOT read model geometry to mutate itself.

### §3.4 — MUST NOT: no parallel mutator, no parallel scorer

There is exactly one layout engine (D-TGL, [C50](./C50-TYPOLOGY-PIPELINE.md) / SPEC-TGL), one mutation path (the command bus the executor dispatches through, **P6**), and one mechanism per editable axis. The graph re-weights / overrides engine inputs; it MUST NOT add a second mutation engine that resizes / moves geometry directly. (This is the option-1 trap ADR-0061 rejected: it forks the engine, duplicates the program-rules + dimensional clamps, bypasses P6, and creates two competing sources of truth.)

---

## §4 — Invariants (normative)

- **I1 — Deterministic.** A given set of per-node overrides + shell + brief always yields the same ranked layouts (SPEC-TGL §6). The override path adds no RNG, no time dependence.
- **I2 — Per-node override defaults to a no-op (baseline identity).** Every per-node override is absent until the user edits that node. An un-edited graph passes an empty / neutral override set, so generation reproduces the **byte-identical** baseline (Pareto-equality). This is the safety contract that lets the write-path ship without regressing any existing generate path; it MUST be test-guarded at the engine boundary (`packages/ai-host/__tests__/roomAreaOverride.test.ts`, `roomTypeOverride.test.ts`).
- **I3 — All model mutation via the command bus (P6).** The graph edit sets a stash + calls the existing trigger; the trigger's executor dispatches commands. The graph never writes a store directly. Overrides MUST be clamped to the architectural minimum / validated against the rules DB so an illegal edit (an area below the legal floor, a phantom room type) can never ship — the override re-runs the gates, it does not bypass them.
- **I4 — Cause/effect direction.** The graph is the cause, the deterministic engine the mechanism, the model the effect. The inverse projection (regenerated layout → graph) is the existing UBG rebuild; the graph never reads back model geometry to mutate itself.

---

## §5 — Implementation map (AS-IS, A.26.1–A.26.4)

| Slice | Surface | Files |
|---|---|---|
| **A.26.1** select-room-in-graph → 3D (✅ already shipped via GRAPH.4) | overlay | `apps/editor/src/ui/living-graph/livingGraphSelection.ts` (`RoomFocusController` select / isolate-in-3D). |
| **A.26.2** Living Graph adopts the Inspect-tab chrome (one movable/zoomable panel) | overlay | `apps/editor/src/ui/living-graph/LivingGraphOverlay.ts` (`buildHeader` purple gradient `#6600ff → #8b2fe0` + white body; resize/zoom/pan kept). |
| **A.26.3** edit room AREA (E1) | engine + stash + payload + UI | `packages/ai-host/.../types.ts` (`roomAreasByName`) · `.../tgl/bubbleGraph.ts` (consume) · `apps/editor/.../activeRoomAreaOverrides.ts` · `.../gatherLayoutPayload.ts` (merge) · `.../LivingGraphOverlay.ts` (`areaField`). Tests: `roomAreaOverride.test.ts`. |
| **A.26.4** edit room OCCUPANCY/TYPE (E2) | engine + stash + payload + UI | `packages/ai-host/.../types.ts` (`roomTypesByName`) · `.../tgl/bubbleGraph.ts` (re-type minted rooms) · `apps/editor/.../activeRoomTypeOverrides.ts` · `.../gatherLayoutPayload.ts` (merge) · `.../LivingGraphOverlay.ts` (`occupancyField` select). Tests: `roomTypeOverride.test.ts`. |
| **A.26.5** inverse — model edit → graph live (✅ A.26.5 shipped 2026-06-08) | overlay + selection | The §3.3 rebuild re-projects engine-driven changes; A.26.5 adds the DIRECT model-edit reflection in two slices. **A.26.5a** (`LivingGraphOverlay.wireModelEdits` / `scheduleModelEditRebuild`): while OPEN, subscribe to the existing `bim-{room,wall,door,window}-{added,updated,removed}` window events + the `bim-wall-mutation-committed` runtime event → DEBOUNCED (~400 ms) + COALESCED `rebuildGraphFromModel()` (the EXISTING §3.3 rebuild — no parallel builder, P6 read-only; cancelled on hide + dispose). **A.26.5b** (`LivingGraphOverlay.wireSelectionReflect` / `reflectGraphFocusFromModel` + `livingGraphSelection.roomIdForElement`): a 3D/plan pick on the `selectionBus` → map element → room (the exact inverse of `elementIdsForRoom`, same `buildModelElementLocations` projection) → focus + inspect card + pan the matching node; lightweight, no isolation/model-write; graph-origin echoes (`inspect-panel`) ignored. Tests: `apps/editor/__tests__/livingGraphSelectionReverse.test.ts`. |

---

## §6 — CI gates (planned)

Declared here, authored in a follow-up PR (mirrors the C51 §7 pattern):

- `check-graph-edit-uses-existing-trigger.mjs` — fail if a Living-Graph edit handler writes a store / dispatches a command directly instead of setting a stash + calling `triggerApartmentLayout` (§3.1/§3.2).
- `check-per-node-override-baseline-identity.mjs` — assert the `roomAreaOverride` + `roomTypeOverride` baseline-identity (I2) tests exist + pass in the ai-host suite.
- `check-no-parallel-room-axis-field.mjs` — fail on a second per-room-area or per-room-type field beside `roomAreasByName` / `roomTypesByName` (§2.1).

Until authored, I2 is guarded by the ai-host unit tests (`roomAreaOverride.test.ts`, `roomTypeOverride.test.ts`), which are merge-blocking via the ai-host suite gate.

---

## §7 — Conventions

- **MUST / MUST NOT / SHALL / MAY** — RFC 2119 normative terms.
- **[ADR-NNNN]** — links to `docs/02-decisions/adrs/`.
- **[SPEC-…]** — links to `docs/03-execution/specs/`.
- **EN** — an editable node attribute (§2).
- **IN** — a normative invariant (§4).
