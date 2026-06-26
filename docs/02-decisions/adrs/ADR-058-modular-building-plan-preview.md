# ADR-058 — Modular building-plan preview (typology-agnostic preview kit)

- **Status:** ACCEPTED (2026-06-26) — IMPLEMENTED for the residential-building modal; the
  per-typology descriptor is the standing extension point for future typologies.
- **Owner:** editor onboarding/generate modals (`apps/editor/src/ui/preview-kit/`,
  `apps/editor/src/ui/residential-building/`, `apps/editor/src/ui/onboarding/`).
- **Affects:** `residentialPlanThumbnail.ts` (now an adapter), the onboarding façade-colour
  picker, and every FUTURE typology's generate-modal plan preview.
- **References:**
  [C50-TYPOLOGY-PIPELINE](../contracts/C50-TYPOLOGY-PIPELINE.md) (the multi-typology substrate
  this preview serves — "the user-facing dispatch surface"),
  [C20-BUILDING-AND-APARTMENT-AGGREGATES](../contracts/C20-BUILDING-AND-APARTMENT-AGGREGATES.md)
  (the building/footprint/cell aggregates the descriptor projects),
  [C18-ELEMENT-PREVIEW-VISUAL-CONTRACT](../contracts/C18-ELEMENT-PREVIEW-VISUAL-CONTRACT.md)
  (§41 — the brand-unified preview visual language: white + `#6600FF`, NO black),
  [C53-GENERATIVE-LAYOUT-ENGINE-ARCHITECTURE](../contracts/C53-GENERATIVE-LAYOUT-ENGINE-ARCHITECTURE.md)
  (the engine results the preview reads).
- **Spec:** [SPEC-BUILDING-PLAN-PREVIEW-DESCRIPTOR](../../03-execution/specs/SPEC-BUILDING-PLAN-PREVIEW-DESCRIPTOR.md).

## Context

PRYZM is becoming a **multi-typology** generative platform (C50): apartment, house, residential
building today; commercial, transport, school, car-park, … next. Each typology's *generate
modal* shows a **floor-plan preview** of the result. Today those previews are **bespoke per
typology**:

- The **house / apartment** modal renders a polished **room-level** plan
  (`apartment-layout/layoutThumbnail.ts` — `buildLayoutThumbnailSvg` + `computePlanTransform`):
  graded line weights, room fills keyed to the shared occupancy palette, door/window marks, a
  scale bar, and — crucially — it already honours a **real perimeter polygon**
  (`perimeterRingMm`, §PREVIEW-PREDICTS-BUILD) so the drawn boundary matches the built shell.
- The **residential-building** modal had a **separate, less-developed** building-level renderer
  (`residentialPlanThumbnail.ts`) that drew the footprint as the **bounding-box rectangle** of
  the placed cells — so an **L-shaped plot rendered as a rectangle** (the founder's report), and
  it duplicated (rather than reused) the legend / scale-bar / north-arrow / core-glyph logic.

Two problems compound as typologies multiply: (1) **duplication** — every new typology would
re-implement the same plan chrome; (2) **drift** — each copy diverges in aesthetic and in
correctness (the bbox-vs-polygon bug is exactly this).

Separately, the residential generate modal offers a **façade-colour** picker. Its 7-swatch
pastel set was defined inline in the onboarding controller — another per-surface copy that a
future typology's modal would have to re-declare.

## Decision

**Introduce a shared, building-type-AGNOSTIC plan-preview kit** in
`apps/editor/src/ui/preview-kit/`, parameterised by a typed **descriptor**. Every typology's
*building-level* generate-modal preview is produced by ONE renderer from ONE descriptor shape;
a new typology supplies a descriptor (an *adapter*), never a new renderer.

### D1 — `BuildingPlanDescriptor` is the single extension point

`buildingPlanDescriptor.ts` defines a pure, typology-agnostic descriptor:

- `footprint: PlanPt[]` — **the REAL footprint outline** (the drawn polygon / clip boundary),
  ≥3 points, drawn as the heavy shell boundary. **This is the L-shape fix**: pass the actual
  polygon, never a bbox rect.
- `cells: PlanCell[]` — unit/room footprints. Each cell may carry an axis-aligned `rect` AND an
  optional real `polygon` (drawn in preference to the rect, so a non-rectilinear unit renders
  truthfully), a `fillKey` into the descriptor `palette`, labels, a `muted` (no-fit) flag, and a
  circulation-facing `doorEdge` (→ a door tick).
- `corridors: PlanCorridor[]` — circulation bands, drawn as a **continuous** fill under the
  cells (preserves §RESI-PREVIEW-CORRIDOR-CONTINUOUS — abutting bands share one fill, no seams).
- `core: PlanCore | null` — the vertical-core lift+stair glyph, or null (a single house / an
  office floor has no core).
- `palette`, `legend`, `levelLabel`, and `northArrow` / `scaleBar` toggles.

A typology adds a preview by writing `buildXxxPlanDescriptor(result) → BuildingPlanDescriptor`.
No renderer code is touched.

### D2 — `buildBuildingPlanSvg(descriptor)` is the single renderer

`buildingPlanSvg.ts` is a PURE function (no DOM, no THREE) returning an SVG string. It ports the
residential preview's good bits — graded line weights (heavy shell / medium party / thin
partition), a real lift+stair core glyph, per-cell door ticks, a wrapping colour legend, a north
arrow, a scale bar, calm brand-tinted hatch for no-fit cells — and renders the **footprint
polygon** (not a rect). Brand-locked to C18 §41: white + `#6600FF`, deep-indigo ink, **no black**.

### D3 — the residential modal ADOPTS the kit; the house room-level thumbnail stays

`residentialPlanThumbnail.ts` becomes a thin **adapter**: `buildResidentialPlanDescriptor` maps
`ResidentialBuildingOk` → descriptor, **de-rotating the WORLD `levels[i].footprint` into the
LOCAL plan frame** (via `result.transform`'s `−θ`-about-pivot) so the L-shape boundary aligns
with the LOCAL cells; `buildResidentialPlanSvg` is a one-line wrapper over the kit. The house /
apartment **room-level** thumbnail (`buildLayoutThumbnailSvg`) is a *different granularity*
(rooms, walls, doors, windows of ONE unit/storey) and **already** honours a real perimeter
polygon — it is NOT folded into the building-level kit (that would be a regression). The two
levels are complementary: the **building-level kit** (this ADR) draws the whole-plate plan
(footprint + unit cells + core + corridor); the **room-level thumbnail** draws inside one unit.

### D4 — one shared FAÇADE palette

The façade-skin tints the generate modal offers move into the kit
(`FACADE_PALETTE` + `DEFAULT_FACADE_HEX` + `isHexColor`) as the single source of truth. The
original 7 swatches are **preserved at the head** (so any already-persisted pick still resolves)
and the set is expanded to ~21 tasteful pastels (soft neutrals · warm · cool · earth). Every
typology modal that offers a façade colour reads `FACADE_PALETTE` — no inline copies.

## Alignment with the contracts

- **C50** names the generate/onboarding modal as the typology pipeline's user-facing dispatch
  surface; a per-typology *preview descriptor* is the natural preview analogue of C50's
  per-typology `TypologyStageBundle` — additive, no change to the pipeline contract.
- **C20** owns the building/footprint/cell aggregates; the descriptor is a *projection* of those
  aggregates to a 2D plan, not a new source of truth.
- **C18 §41** governs preview *visual language*; the kit inherits it (white + `#6600FF`, no
  black). C18's scope is the 3D/2D creation-*ghost*; this modal *result* preview is a sibling
  surface, so C18 needs **no edit** — the ADR records that the kit conforms to its palette.

No canonical contract requires a clause change for this work; this ADR + the SPEC are the
governing documents (per CLAUDE.md: an ADR may stand without editing a contract when no contract
clause is contradicted).

## Consequences

- **Positive:** one renderer + one descriptor for every building-level preview → reuse over
  duplication; a new typology preview is an adapter; the L-shape bug is fixed at the boundary
  (real polygon); the façade palette is single-source; brand consistency is structural.
- **Scope guard:** the kit is **building-level**. Room-level unit plans keep their richer
  dedicated renderer; this ADR does not merge the two (different data, different detail).
- **Migration:** residential adopts the kit now (this change). House's building/site-level
  preview, if/when one is added, SHOULD adopt the kit; its room-level thumbnail need not.
- **Determinism / purity:** kit + adapter are pure (geometry → SVG string), unit-testable
  headless (no DOM/THREE), consistent with C53's pure-engine doctrine.

## Alternatives considered

- **Fold the house room-level thumbnail into the kit.** Rejected: it is a finer granularity
  (rooms/walls/doors of one unit) with its own proven §PREVIEW-PREDICTS-BUILD perimeter support;
  forcing it through a building-level descriptor would lose detail (a regression).
- **Keep per-typology renderers, just fix the resi bbox bug.** Rejected: fixes the symptom, not
  the duplication/drift that multiplies with every new typology (the stated direction).
- **Put the kit in a shared package (e.g. `@pryzm/ui-base`).** Deferred: the previews consume
  editor-side typology result types and run editor-side; an `apps/editor/src/ui/preview-kit/`
  module keeps the dependency direction clean today. Promotion to a package is a later step if a
  non-editor surface needs it.
