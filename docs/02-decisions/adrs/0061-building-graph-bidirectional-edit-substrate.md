# ADR-0061 — The building graph is a bidirectional edit substrate, not a read-only projection

**Status:** PROPOSED (DRAFT, 2026-06-08)
**Tracker:** A.26 ("editable Living Graph" — the founder's BIM 2.0/3.0 differentiator, master-execution-tracker)
**Related:** [ADR-0058](./0058-unified-building-graph.md) (UBG — specialised graphs are projections of one node/edge model), [ADR-0060](./0060-living-design-parameters.md) (Living Design Parameters bind to existing substrate, not a parallel scorer — the global-slider sibling of this per-node decision).
**Spec source:** [SPEC-LIVING-BUILDING-GRAPH.md](../../03-execution/specs/SPEC-LIVING-BUILDING-GRAPH.md), [SPEC-LIVING-DESIGN-PARAMETERS.md](../../03-execution/specs/SPEC-LIVING-DESIGN-PARAMETERS.md).

> **Numbering note:** the next free number above both ADR series (`0060` is taken by Living Design Parameters; `ADR-057`/`ADR-0055A` are the 3-digit/sub-letter strategic entries) is **0061**, in the 4-digit code-level series per the README §2 going-forward rule.

---

## Context

ADR-0058 established the **Unified Building Graph (UBG)** as a *read-only projection*: the
specialised graphs (room topology, semantic graph, sightline/bubble graph) are projected into one
queryable node/edge model the Living Graph overlay (A.21.D17) renders and interrogates. The graph
is, today, an **observation** of the model — you can select a room in it and isolate that room in
3D (A.21.D37/A.26.1), but you cannot *change* anything *through* it.

The founder's direction (2026-06-08, memory `editable-living-graph-bim2-3`) is to evolve the Living
Graph into the **editable Inspect tab**: *"the user selects rooms IN the graph, changes attributes,
and the graph adapts; changes a room's area and the LAYOUT changes automatically… should behave like
BIM 2.0 and BIM 3.0 — the graph is the cause, the model the effect."*

There are two structurally different ways to build the write-path:

1. **A parallel graph mutator** — the graph edit reaches into the element stores and directly
   resizes/moves geometry (a second mutation engine living beside the deterministic layout engine).
   Fast to demo, architecturally corrosive: it forks the generator, duplicates the program-rules and
   dimensional clamps, bypasses the command bus (P6), and makes the graph and the layout engine two
   competing sources of truth that will drift.

2. **The graph edit is a structured layout-constraint delta that re-runs the EXISTING deterministic
   engine** — exactly the per-node analogue of ADR-0060's global sliders. A node edit produces a
   typed per-node override on an input the engine already consumes; the *same* generate trigger
   re-runs `generateDeterministicLayouts`; the regenerated layout is re-projected back into the
   graph (the graph already re-binds on `pryzm:building-graph-rebuilt`). The graph is the *cause*,
   the deterministic engine is the *mechanism*, the model is the *effect* — and there is still only
   one engine, one scorer, one mutation path.

PRYZM already has the substrate for option 2: the D-TGL bubble graph honours per-room area targets
(`ApartmentProgram.roomAreas[type]` and `roomAreasByName[name]`, `bubbleGraph.ts`, fully tested),
and the A.25 live-regenerate seam (`activeDesignParams` → `gatherLayoutPayload` →
`triggerApartmentLayout` → `generateDeterministicLayouts`) already proves that re-weighting an engine
input re-runs generation live. The per-node write-path is therefore *fusion*, not new infrastructure.

## Decision

**The building graph is a bidirectional edit substrate. A graph-node edit produces a structured,
PER-NODE layout-constraint delta that re-runs the EXISTING deterministic layout engine through the
EXISTING generate trigger; the regenerated layout is re-projected back into the graph. The graph
never mutates the model directly and never forks the engine.**

Concretely:

1. **Edit → per-node delta, not a direct mutation.** A node edit is recorded as a per-node override
   on an input the engine already consumes — never a write to a geometry store. The headline slice
   (A.26.3) maps a room's **area** edit to the bubble graph's existing `roomAreasByName[<room name>]`
   per-instance area target (it reuses the `roomAreas`/`roomAreasByName` mechanism rather than adding
   a parallel `roomAreaOverrides` field — there must be exactly one per-room-area path). Future node
   edits (occupancy, adjacency preference, privacy) each bind to their own existing substrate (the
   program-rules permission matrix, the scorer axes, the dimensional validators), never a new knob.

2. **Re-run via the existing trigger.** The delta is written to a session stash (sibling to
   `activeDesignParams.ts`), which `gatherLayoutPayload` reads and merges into the program it builds;
   the edit then (debounced) calls the **existing** §11 apartment-layout trigger. No new generate
   path is invented; the same trigger every other entry-point uses re-runs the deterministic engine.

3. **Inverse projection is the existing rebuild.** The regenerated layout rebuilds the UBG and emits
   `pryzm:building-graph-rebuilt`; the Living Graph already re-binds on that event (re-entry guarded,
   positions preserved). The "graph re-lays-out after the layout changes" loop is therefore the
   existing projection running in reverse — no new code path.

4. **No parallel mutator, no parallel scorer.** There is exactly one layout engine (D-TGL,
   SPEC-TGL), one mutation path (the command bus the executor dispatches through, P6), and one
   per-room-area mechanism (`roomAreas`/`roomAreasByName`). The graph re-weights/overrides engine
   inputs; it does not add a second mutation engine.

## Invariants (normative)

- **I1 — Deterministic.** A given set of per-node overrides + shell + brief always yields the same
  ranked layouts (SPEC-TGL §6). The override path adds no RNG, no time dependence.
- **I2 — Per-node override defaults to a no-op.** Every per-node override is absent until the user
  edits that node. An un-edited graph passes an empty/neutral override set, so generation reproduces
  the **byte-identical** baseline (Pareto-equality). This is the safety contract that lets the
  write-path ship without regressing any existing generate path; it is test-guarded at the engine
  boundary (`packages/ai-host/__tests__`).
- **I3 — All model mutation via the command bus (P6).** The graph edit sets a stash + calls the
  existing trigger; the trigger's executor dispatches commands. The graph never writes a store
  directly. The override is also clamped to the architectural minimum (`roomRule.minAreaM2`) so an
  edit below the legal floor can never ship.
- **I4 — Cause/effect direction.** The graph is the cause (the user's intent), the deterministic
  engine the mechanism, the model the effect. The inverse projection (regenerated layout → graph) is
  the existing UBG rebuild; the graph never reads back model geometry to mutate itself.

## Consequences

- **Positive.** One engine, one scorer, one mutation path. The graph becomes genuinely editable
  (BIM 2.0/3.0 "edit the graph, the building follows") while every existing invariant (determinism,
  P6, the dimensional clamps, the per-room openings, the stair fix) holds untouched, because the
  edit is just another input to the already-tested engine. Adding an editable node attribute stays a
  "find the existing substrate and bind to it" change, not a new mutator.
- **Negative / cost.** Each editable attribute must find an existing engine input to bind to (area →
  `roomAreasByName`; the next ones must do the same homework). The round-trip is a full re-generate,
  not an in-place tweak — acceptable because the engine is deterministic and fast, and it keeps the
  graph and the layout in lockstep by construction.
- **Backward compatibility.** The per-node stash is empty until the user edits a node; an un-edited
  graph reproduces the baseline exactly (I2). Every existing generate path is unchanged.

## Implementation (A.26.3 — headline slice, edit room AREA → layout updates)

- `packages/ai-host` — the engine already consumes per-room area targets via
  `ApartmentProgram.roomAreasByName` (`bubbleGraph.ts`); **no new engine field is added** (reuse, not
  a parallel `roomAreaOverrides` — see Decision §1). A Pareto-equality test guards I2 (neutral/absent
  override reproduces the baseline byte-for-byte) and a growth test proves a per-room override grows
  that room's allocation.
- `apps/editor/src/ui/apartment-layout/activeRoomAreaOverrides.ts` — the session stash (sibling to
  `activeDesignParams.ts`) keyed by room display name; read by `gatherLayoutPayload` and merged into
  `program.roomAreasByName`.
- `apps/editor/src/ui/apartment-layout/gatherLayoutPayload.ts` — merges the stash into the resolved
  program (empty stash ⇒ unchanged program ⇒ I2 holds).
- `apps/editor/src/ui/living-graph/LivingGraphOverlay.ts` — the inspect card's AREA becomes an
  editable field (brand white + `#6600FF`, compact); on commit it writes the per-room override into
  the stash and fires the **existing** debounced `triggerApartmentLayout` re-generate. The graph
  re-lays-out on the resulting `pryzm:building-graph-rebuilt` (existing path).

A.26 follow-on slices (occupancy edit, adjacency-preference edit, privacy edit) are tracked
separately; this ADR governs the bidirectional-edit-substrate principle + the per-node-override
invariants (I1–I4) + the A.26.3 area slice.

## Alternatives considered

- **A parallel graph mutator that resizes geometry directly** (option 1 above) — rejected: forks
  the engine, duplicates program-rules + dimensional clamps, bypasses P6, and creates two competing
  sources of truth. Contradicts ADR-0058 (the graph is a projection of the model, not a second
  authoring engine) and ADR-0060 (bind to substrate, don't fork).
- **A new `roomAreaOverrides` field on `EnumerateInput`/the generate input** — rejected: the engine
  already has `roomAreas`/`roomAreasByName`; a second per-room-area field would be a parallel
  mechanism the bubble graph would have to reconcile, violating the "exactly one per-room-area path"
  rule. The headline slice reuses `roomAreasByName`.
