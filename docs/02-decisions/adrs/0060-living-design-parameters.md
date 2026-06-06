# ADR-0060 — Living Design Parameters bind to existing substrate, not a parallel scorer

**Status:** Accepted (2026-06-06)
**Tracker:** A.25 (typology block — "Living Design Parameters", master-execution-tracker)
**Spec source:** [SPEC-LIVING-DESIGN-PARAMETERS.md](../../03-execution/specs/SPEC-LIVING-DESIGN-PARAMETERS.md)
**Contract:** [C50-TYPOLOGY-PIPELINE.md](../contracts/C50-TYPOLOGY-PIPELINE.md) §2.6.5
**Related:** [ADR-0056](./0056-typology-declared-brief.md) (typology-declared brief — the onboarding sibling).

> **Numbering note:** `0059` is already taken (`0059-monorepo-typecheck-profile-and-emit.md`) and
> `0057` exists as `ADR-057-realtime-geometry-and-view-interactivity.md`, so this ADR is **0060**.

---

## Context

The founder asked (2026-06-05) for a real-time **parameter panel** whose sliders re-influence
the generated design LIVE: *"the user should be able to interact via parameter-sliders that
could impact the design layout LIVE — via climate, space, accessibility, sun, adjacency,
location, room-connection… all parameters possible!"*

There were two structurally different ways to build this:

1. **A parallel scoring/generation path** — a new optimiser keyed off the sliders, with its
   own per-typology knobs hard-coded in the panel. This is the fast-to-demo but
   architecturally corrosive route: it forks the generator, duplicates the program-rules and
   climate logic, and makes "add a typology" require touching the slider panel.

2. **Bind sliders to the substrate that already exists** — the D-TGL scorer's
   `ScoringWeights` (SPEC-TGL §4), the D6 climate inputs (`SolarBias.weight` /
   `siteLatitudeDeg`, `windowEmission/solarOrientation.ts`), the architectural program-rules
   permission matrix, and the brief's area-fraction fields — and re-run the **existing**
   deterministic engine through the **existing** generate trigger.

PRYZM already declares per-typology metadata (`TypologyManifest`, C50) and already governs
the brief as typology-declared (ADR-0056). A design parameter is the natural live,
re-runnable sibling of a brief field: the brief declares *what you want*; a parameter
declares *how to prioritise* and re-runs generation. It belongs on the same declared,
contract-governed footing — not as a UI-hard-coded parallel engine.

## Decision

**Living design parameters are typology-declared and bind to existing generation substrate —
`ScoringWeights`, program-rules, and `SolarBias` — re-running the deterministic engine. They
do NOT introduce a parallel scoring path or hard-coded per-typology knobs.**

Concretely:

1. **Bind, don't fork.** Each slider re-weights an input the engine already consumes. The v1
   ship (A.25.1) maps four `0..1` sliders → the four D-TGL scorer axes via the pure
   `designParamsToScoringWeights(params): ScoringWeights`
   (`packages/ai-host/.../designParamsToScoringWeights.ts`): `daylight→naturalLight`,
   `privacy→privacy`, `kitchen→kitchenWorkflow`, `compactness→corridorEfficiency`. All
   sliders at the neutral midpoint (`0.5`) reproduce the legacy all-equal `DEFAULT_WEIGHTS`,
   so the panel is a strict, opt-in override of existing behaviour.

2. **Live-regenerate via the existing trigger.** A slider change writes a session stash
   (`activeDesignParams.ts`) that `gatherLayoutPayload` reads into `options.scoringWeights`,
   then (debounced) calls the **existing** §11 apartment-layout trigger. No new generate path
   is invented; the same trigger every other entry-point uses re-runs
   `generateDeterministicLayouts`.

3. **Typology-agnostic + declared.** The mapping is plain numbers; the axes exist for any
   layout the engine ranks. Future slices (A.25.3) bind additional sliders to the program-rules
   permission matrix, the dimensional-constraints validators, and the D6 climate inputs — each
   re-using its own existing substrate, declared by the typology, never a per-typology knob
   hard-coded in the panel.

4. **No parallel scorer.** There is exactly one scoring engine (D-TGL, SPEC-TGL). The panel
   re-weights its inputs; it does not add a second ranker or a stochastic search.

## Consequences

- **Positive.** One generation engine, one scorer, one trigger — the panel is a thin
  re-weight + a deterministic re-run. Adding a typology stays a pack change (the four axes
  work for any layout). Determinism is preserved (SPEC-TGL §6): a given slider configuration
  always yields the same ranked layouts. P5/P6/P8 hold (pure mapping; panel sets a stash +
  calls the trigger, never writes a store; spans live at the existing pipeline boundary).
- **Negative / cost.** v1 is **ranking-only** — the four shipped sliders re-rank existing
  generated options rather than changing room geometry/adjacency/windows directly; that
  deeper binding (space/adjacency/accessibility/climate) is A.25.3. Each future slider must
  find and bind to an existing substrate rather than inventing a knob — slightly more design
  work up front, but it is the whole point of this decision.
- **Backward compatibility.** The stash is `null` until the user touches the panel, in which
  case the payload uses `DEFAULT_WEIGHTS` — existing generate paths are unchanged.

## Implementation (A.25.1 + A.25.2, shipped 2026-06-05)

- `packages/ai-host/src/workflows/apartmentLayout/designParamsToScoringWeights.ts` — the pure
  `DesignParams` → `ScoringWeights` mapping (this ADR's subject).
- `apps/editor/src/ui/apartment-layout/activeDesignParams.ts` — the session stash
  `gatherLayoutPayload` reads.
- `apps/editor/src/ui/apartment-layout/DesignParamsPanel.ts` +
  `apps/editor/src/ui/styles/panels/designParamsPanel.ts` — the draggable slider panel +
  `pryzmToggleDesignParams()` console trigger.
- [SPEC-LIVING-DESIGN-PARAMETERS.md](../../03-execution/specs/SPEC-LIVING-DESIGN-PARAMETERS.md) —
  the design of record (parameter set, substrate bindings, planned slices).
- [C50-TYPOLOGY-PIPELINE.md](../contracts/C50-TYPOLOGY-PIPELINE.md) §2.6.5 — the
  parameter-input principle (normative).

A.25.3 (adjacency/accessibility/climate/space sliders → substrate) and A.25.4 (graph-linked
"what changed + why") are tracked separately; this ADR governs the binding principle + the
v1 substrate.
