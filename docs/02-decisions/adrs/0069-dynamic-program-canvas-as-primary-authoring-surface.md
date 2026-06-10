# 0069 — The Dynamic Program Canvas is the primary program-authoring surface

**Status:** PROPOSED
**Date:** 2026-06-10
**Deciders:** architecture team (founder-driven — §Context verbatim)
**Tracker:** A.26 family (editable Living Graph / BIM 2.0–3.0 differentiator), house-layout modal line.

**Related contracts:** [C50 — Typology Pipeline](../contracts/C50-TYPOLOGY-PIPELINE.md) (the deterministic engine the canvas drives; typology-agnostic seams), [C52 — Editable Building Graph](../contracts/C52-EDITABLE-BUILDING-GRAPH.md) (the per-node-override → existing-engine-re-run write-path the canvas obeys).
**Related ADRs:** [ADR-0061](./0061-building-graph-bidirectional-edit-substrate.md) (graph is a bidirectional edit substrate — the determinism doctrine this generalises), [ADR-0058](./0058-unified-building-graph.md) (specialised graphs are projections of one model), [ADR-0060](./0060-living-design-parameters.md) (sliders bind to the existing substrate, not a parallel scorer), [ADR-0067](./0067-graph-ir-intent-first-building-graph-bim3.md) (graph-IR / intent-first BIM 3.0 — geometry is a DERIVED projection, never user-authored), [ADR-0056](./0056-typology-declared-brief.md) (typology-declared brief — the brief schema the canvas absorbs).
**Spec source:** [SPEC-DYNAMIC-PROGRAM-CANVAS](../../03-execution/specs/SPEC-DYNAMIC-PROGRAM-CANVAS.md), [SPEC-LIVE-SINGLE-OPTION-LAYOUT-MODAL](../../03-execution/specs/SPEC-LIVE-SINGLE-OPTION-LAYOUT-MODAL.md).

---

## Context

The founder's direction (2026-06-10, verbatim):

> *"The modal for the residential house (and will extrapolate to apartment and other typologies)
> needs to be better. The tools need to be more dynamic — we need to use sliders. We should have
> like 'boxes with curved angles' for each room in the graphs AND in the plan view — this will be
> in the [tools] area — user can add bedrooms easily, change the area of each bedroom, MOVE the
> boxes with curved angles like cards from level ground to level 1 — could be like a mural / Miro
> dynamic — and the graph and layout will change. The user will see ALL the plan views and graphs
> at the same time and changes will dynamically show on the screen instantly. User could add levels
> on the fly, etc. This will also REPLACE the original 'project brief' panel — it should go."*

Today the program is authored in **two disconnected one-shot forms**: the onboarding **Project
Brief** panel (`apps/editor/src/ui/onboarding/BriefSchemaForm.ts`, a typology-declared slider/stepper
form) and the generation **modal form** (`apps/editor/src/ui/house-layout/houseModalHtml.ts`
`buildHouseProgramEditFormHtml`, the apartment sibling). The modal already re-runs the deterministic
engine live on every change (§MODAL-DYNAMIC, `HouseLayoutController._regenerate:328`), and the Living
Graph already lets a user edit a room's area/type and re-runs the engine (C52). But the user authors
*program intent through a `<form>`* — abstract numbers — and **sees one preview at a time** inside a
transient modal. There is no spatial, direct-manipulation surface, and the two forms duplicate the
program-capture role.

The substrate for the founder's surface already exists and is the per-node-override family of
ADR-0061/C52 plus the live regenerate loop of the modal:

- area override → `roomAreasByName` (`activeRoomAreaOverrides.ts:30`, C52 E1);
- type override → `roomTypesByName` (`activeRoomTypeOverrides.ts`, C52 E2);
- **floor (storey) move** → `roomFloorByName` (`activeRoomFloorOverrides.ts:40`, keyed by
  `storey:<s>/<roomName>`) — the engine seam for "move a bedroom from upstairs to downstairs"
  **already exists**;
- whole-house program → per-storey split (`allocateProgramToStoreys`, `storeyAllocation.ts:44`);
- rounded-node renderer with hit-test + drag (`LivingGraphCanvas.ts:120,98`);
- synchronous live regenerate (`HouseLayoutController._computeVariants:249`).

What is missing is the **authoring surface**: a draggable board of rounded room **cards** bound to
that program, shown beside **all** plans and **all** graphs, regenerating instantly.

---

## Decision

**Program intent is authored on a live, multi-view, direct-manipulation Program Canvas — a
Miro-/mural-like board of rounded room *cards* arranged in *storey lanes*. The canvas is the single
editable source of program intent. Every card edit (add room, resize → area, drag between lanes →
storey, add level, slider) writes the smallest typed delta to the existing per-node-override stashes
/ program fields and re-runs the EXISTING deterministic engine through the EXISTING trigger. The plan
view(s) and graph(s) are DERIVED projections of the regenerated result that update in lock-step,
instantly, and are shown simultaneously alongside the canvas. The canvas REPLACES both the
generation-modal program form and the onboarding Project Brief panel, and generalises across
typologies.**

Concretely, the canvas is bound by **C52 §1 / ADR-0061** with no relaxation:

1. **Card edit → per-node delta**, never a geometry-store write (P6). Resize → `roomAreasByName`;
   re-type → `roomTypesByName`; cross-lane drag → `roomFloorByName`; add-room → program count;
   add-level → `storeyCount`; slider → `ScoringWeights` / brief field.
2. **Re-run via the existing engine** (`generateHouseLayoutOptions` / the apartment trigger). No new
   generate path.
3. **Plan + graph are derived projections** — rebuilt from the regenerated result. The canvas never
   paints geometry it authored (ADR-0067: geometry is derived, never user-authored).
4. **Baseline identity** — an un-edited canvas reproduces the byte-identical baseline (C52 I2).
5. **Typology-agnostic core** — every seam is `{ name → value }` / a count / a weight; the canvas
   core carries no typology-specific knob, so it extrapolates per C50.

---

## Alternatives considered

### A. Keep the static slider/stepper form (status quo)
Keep `BriefSchemaForm` + the modal `<form>`. Rejected: the founder explicitly directed a spatial,
direct-manipulation surface ("boxes with curved angles … like a mural / Miro dynamic … the project
brief panel should go"). A form cannot express "drag a bedroom from ground to level 1" or "see all
plans and graphs at once"; and the two forms duplicate the program-capture role. The form is the
*least-effort* answer, not the directed one.

### B. A wizard (multi-step guided flow)
A stepper wizard (floors → rooms → sizes → generate). Rejected: a wizard is **sequential and modal**;
the founder wants a **persistent, simultaneous, always-live** board where the program, every plan,
and every graph are visible and editable at once. A wizard also re-introduces the one-preview-at-a-time
constraint the founder is removing.

### C. A parallel canvas mutator (the corrosive shortcut)
Have card drags reach into the element stores and directly resize/move geometry. Rejected for exactly
the reason ADR-0061 rejected the parallel graph mutator: it forks the generator, duplicates the
program-rules + dimensional clamps, bypasses the command bus (P6), and makes the canvas and the
engine two competing sources of truth that will drift. The canvas is a **program editor**, not a
geometry editor.

### D. The chosen option — the canvas as the program editor, re-running the one engine
Wins because it is **fusion, not new infrastructure**: it reuses the modal's live regenerate loop,
the three override stashes (incl. the already-built floor-move seam), the rounded-node renderer, and
the per-storey plan/graph renderers — adding only the card-board UI, the storey-lane drop targets,
the multi-pane layout, and add-level. It satisfies every founder requirement, preserves one engine /
one scorer / one mutation path, keeps geometry a derived projection (ADR-0067), and generalises
across typologies (C50).

---

## Consequences

**Positive.** One authoring surface replaces two forms; the program becomes spatial + direct-manipulation;
plan + graph update live and simultaneously; the determinism + P6 guarantees are inherited unchanged
from C52/ADR-0061; the feature is mostly wiring of shipped parts. The onboarding flow simplifies
(open the canvas seeded from the typology default brief).

**Negative / risks.** (1) The **infeasible-edit UX** (a card resized/added past what the shell holds)
is a genuinely new, unresolved decision — the engine HARD-rejects (`validateApartmentEnvelope`,
memory `envelope-reject-silent-fallback`), and the canvas must show that gracefully (clamp-and-snap
vs. red "won't fit" card vs. soft warning) — SPEC §11 OQ1, founder to weigh in. (2) "Instantly" sets
a **regenerate-latency budget** (SPEC §6: synchronous engine, debounce ≤ ~120 ms, refresh under a
frame) that must hold for the worst-case residential program. (3) Removing the brief panel touches
the onboarding flow (Phase 3) and must not regress the auth-first/guided onboarding.

---

## Governance ties

- **C50** — the engine the canvas drives must stay typology-agnostic; the canvas core carries no
  per-typology knob, so apartment + future typologies reuse it (SPEC §9 Phase 4).
- **C52 / ADR-0061** — the canvas IS the per-node-override write-path with a spatial UI; it inherits
  the MUST/MUST-NOT discipline (per-node delta, existing trigger, inverse projection, baseline
  identity, P6) verbatim.
- **ADR-0058** — plan + graph remain projections of one model; the canvas adds a third projection
  (the card board) of the same regenerated result.
- **ADR-0060** — the canvas sliders bind to the existing `ScoringWeights` axes / brief fields, never
  a parallel scorer.
- **ADR-0067 (BIM 3.0 graph-IR manifesto, PROPOSED)** — the canvas honours "geometry is a DERIVED
  projection, never user-authored": cards author *intent* (program), the engine derives geometry.
  The canvas is the user-facing front-end of the intent layer that ADR-0067 formalises.
