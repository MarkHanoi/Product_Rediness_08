# ADR-0071 — Room-and-Module Rule Engine: constraint-satisfaction + scoring, per-room ontology

- **Status:** Accepted (2026-06-11)
- **Deciders:** Founder + Claude
- **Supersedes (consolidates):** SPEC-KITCHEN-WARDROBE-APPLIANCES, SPEC-KITCHEN-WARDROBE-WALL-DRIVEN
  (their content folds into the new SPEC as the kitchen instance of the general engine)
- **Related:** [SPEC-ROOM-MODULE-RULE-ENGINE](../../03-execution/specs/SPEC-ROOM-MODULE-RULE-ENGINE.md) ·
  SPEC-FURNITURE-LAYOUT-ENGINE (the D-FLE engine this extends) · SPEC-ARCHITECTURAL-PROGRAM-RULES
  (`programRules.ts`, the room-level DB) · C16 (command authoring / semantic engine)

## Context

PRYZM already auto-furnishes rooms (the **D-FLE** engine, `packages/ai-host/src/workflows/furnishLayout/`:
`kitchenLayout.ts`, `furnishRoom.ts`, `placeSolver.ts`, `collision.ts`, `footprints.ts`, `archetypes.ts`,
`wallAnalysis.ts`, `validate.ts`). Today it places furniture **parametrically** — archetype footprints solved
against the room with collision avoidance — and is correct but not *intelligent*: it does not model appliance
clearances, the kitchen work-triangle, MEP clustering, window/door constraints, ergonomics, or cabinet-internal
configuration, and it does not generate-and-rank multiple candidate layouts by an architectural score.

The founder supplied a professional kitchen-planner rule corpus (~300–500 rules across hard constraints,
workflow, adjacency, modules, shape-specific I/L/U/Island/Peninsula, MEP, ergonomics, accessibility, natural
light, visual design, storage, cleaning, construction, door/drawer-swing simulation, and cabinet taxonomy) plus
the explicit ask: model every module with metadata, solve the room as a **constraint-satisfaction + scoring
optimization problem**, and make the schema **per-room** (kitchen first, then every other room type).

## Decision

Adopt a **Room-and-Module Rule Engine** as a first-class subsystem layered on D-FLE. Five layers:

1. **Module Ontology (data).** Every placeable module — appliance, base/tall/corner cabinet, sink/hob unit,
   island, seating, pantry, extractor — is described by typed metadata: dimensions, required services
   (water/drain/power/duct), front/side/top clearances, door/drawer swing footprint, `preferredAdjacent`,
   `forbiddenAdjacent`, storage volume, ergonomic/workflow/cost/visual weights, and the cabinet-internal
   options it can host (Level-2 configuration). Pure data; no geometry math.

2. **Rule Layer (data + pure predicates).** Two rule kinds: **HARD** (must-never-violate: collision, clearance,
   corner-forbidden appliances, hob/sink safety, door-swing, window conflicts, MEP-blocking) → a candidate that
   violates one is **invalid**; and **SCORING** (graded: work-triangle, adjacency, circulation, MEP length,
   natural light, storage, ergonomics, visual balance, buildability, cost) → contribute to a weighted score.
   Rules are organised by category and are **pure functions** over a candidate placement + the room context
   (walls classified by `wallAnalysis`, doors, windows, columns, MEP points).

3. **Solver (constraint-satisfaction + scoring).** Detect room → classify walls (eligible length, window/door,
   services) → determine shape candidates (I/L/U/Island/Peninsula) from proportion rules → place modules in the
   founder's canonical order (corner → tall → sink → dishwasher → hob → fridge → fill storage) honouring every
   HARD rule → score with the weighted scorecard → **generate N alternatives and keep the highest score.**

4. **Intelligence Layer.** The generation strategy + the **scorecard** (Workflow / Circulation / Storage / MEP /
   Natural-light / Buildability / Cost / Aesthetics, weights in the SPEC) + alternative generation + a record of
   each layout's sub-scores for future learning. The AI **guides** the engine (chooses shape, weights, brief);
   it does not replace the deterministic solver (ADR-0060 bind-don't-fork; matches the apartment cognition stack).

5. **Per-Room Generalisation.** The ontology + rule schema are **room-agnostic containers**; each room type
   ships its own module ontology + rule set + scorecard weights. **Kitchen is the reference implementation.**
   Bathroom, bedroom (wardrobe — partly exists), living, utility, etc. follow the same schema.

**Two configuration levels** (the founder's L1/L2): **L1 = where each module goes** (placement) and **L2 = what
is inside each module** (cabinet/drawer selection + internal storage allocation). The engine optimises both;
two geometrically-identical layouts can score very differently on L2.

## Consequences

- **Architecturally sound separation:** ontology (data) ⟂ rules (pure predicates) ⟂ solver (orchestration) ⟂
  intelligence (strategy). Each layer is independently testable and L0/L2-pure (no THREE/DOM; ADR-0061 purity).
- **Extends, not forks, D-FLE:** the solver reuses `wallAnalysis` (→ the §BIM04 wall classification), `collision`,
  `footprints`, `placeSolver`; it adds the ontology + rule + scoring layers and the generate-and-rank loop.
- **Governed + incremental:** the SPEC enumerates the full rule corpus + the schema; the tracker (§59) phases it
  (schema + kitchen ontology seed → hard-rule pass → scoring → alternatives → L2 → per-room rollout). Each phase
  is shippable and test-gated. A mature engine reaches 300–500 rules; we land it in slices, kitchen first.
- **Single source of truth:** module metadata + rules live in versioned data files (the schema), so the engine,
  the validators (`validateKitchenFromFurniture`), the property panel, and the cost/MEP estimators all read the
  same definitions — no drift.
- **Cost:** large scope. Mitigated by phasing + the existing D-FLE substrate; the first slice (schema + ontology +
  the HARD kitchen rules wired into the existing kitchen placement) is self-contained.
