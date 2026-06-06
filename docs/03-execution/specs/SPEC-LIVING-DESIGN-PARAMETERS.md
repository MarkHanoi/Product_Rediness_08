# SPEC-LIVING-DESIGN-PARAMETERS — slider-driven, live-regenerating design parameters

**Status:** DRAFT (2026-06-06) — v1 (4 sliders) SHIPPED; A.25.3/.4 PLANNED.
**Owner:** Computational design / generative stack.
**Governs:** the **Living Design Parameters** panel + its binding into the deterministic
layout engine — the "user drags a slider → the generated layout re-ranks/regenerates
LIVE" capability the founder asked for (2026-06-05).
**Tracker:** `A.25` (typology block — "Living Design Parameters", decomposed into
`A.25.1 … A.25.4` — see §8).

**Conflict-resolution order (strongest first):**
[product-vision §5](../../01-strategy/product-vision.md) →
[architecture](../../01-strategy/architecture.md) →
[C50-TYPOLOGY-PIPELINE](../../02-decisions/contracts/C50-TYPOLOGY-PIPELINE.md) →
[ADR-0056 typology-declared brief](../../02-decisions/adrs/0056-typology-declared-brief.md) →
[ADR-0060 living design parameters](../../02-decisions/adrs/0060-living-design-parameters.md) →
this SPEC.

Sibling references:
[SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE](./SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE.md) (the engine
the sliders re-run), [SPEC-TYPOLOGY-BRIEF-SCHEMA](./SPEC-TYPOLOGY-BRIEF-SCHEMA.md) (the
typology-declared brief substrate the future slices bind to),
[SPEC-ARCHITECTURAL-PROGRAM-RULES](./SPEC-ARCHITECTURAL-PROGRAM-RULES.md) (the permission
matrix the adjacency/accessibility sliders will steer),
[SPEC-APARTMENT-LAYOUT-GENERATOR](./SPEC-APARTMENT-LAYOUT-GENERATOR.md) (the live consumer).

---

## §1 — The principle (why parameters are declared + bound, never hard-coded)

The founder directive (2026-06-05): *"the user should be able to interact via
parameter-sliders that could impact the design layout LIVE — via climate, space,
accessibility, sun, adjacency, location, room-connection… all parameters possible!"*

Three invariants make this **architecturally sound** rather than a pile of bespoke knobs:

1. **Parameters are typology-DECLARED, not UI-hard-coded.** A design parameter is the
   live, re-runnable sibling of a brief field (ADR-0056 / C50 §2.6): the brief declares
   *what you want* (2 → 4 bedrooms) at onboarding; a design parameter declares *how to
   prioritise* (favour daylight over compactness) and re-runs generation live. Both must
   be declared by the typology — so adding a typology (house, office) is a pack change,
   not new UI parse code. This keeps the panel **typology-agnostic** per
   [[platform-spine-typology-agnostic]].

2. **Parameters BIND to existing substrate; they never introduce a parallel scoring
   path.** Each slider feeds a substrate that already exists and is already
   contract-governed — the D-TGL scorer's `ScoringWeights` (SPEC-TGL §4), the
   `SolarBias.weight` / `siteLatitudeDeg` climate inputs (SPEC-TGL D6;
   `windowEmission/solarOrientation.ts`), the architectural program-rules permission
   matrix (SPEC-ARCHITECTURAL-PROGRAM-RULES), and the brief's area-fraction fields. A
   slider is a **re-weighting**, not a new generator. No hard-coded per-typology knob and
   no second scoring engine are introduced (ADR-0060).

3. **Live-regenerate via the EXISTING engine + trigger.** A slider change re-runs
   `generateDeterministicLayouts` (fast, offline, deterministic — SPEC-TGL) through the
   **same** §11 apartment-layout trigger every other generate entry-point uses. No new
   generate path is invented; the panel only sets a session stash and calls the trigger.

Pairing with the now-interrogable Building Graph (GRAPH.4 / tracker A.21.D16) is the
fourth leg: when the user moves a slider and the layout changes, the graph explains
*why* (which room moved, which adjacency/daylight axis drove it) — see §6.

---

## §2 — The founder's parameter set → substrate binding (the design of record)

Every parameter the founder named maps to a substrate that **already exists**. The table
is the canonical "what binds to what"; the AS-BUILT column states what is wired today.

| Parameter (founder) | Substrate it binds to | Where | AS-BUILT |
|---|---|---|---|
| **climate** | D6 sun/glazing weight (`SolarBias.weight`) + `climateGlazingFactor` | `windowEmission/solarOrientation.ts` | substrate LIVE (D6.1–D6.3); slider PLANNED (A.25.3) |
| **space** | room area fractions / target m² (brief `targetAreaM2`, `roomAreas`) | `ApartmentProgram.roomAreas*`, SPEC-TYPOLOGY-BRIEF-SCHEMA | substrate LIVE; slider PLANNED (A.25.3) |
| **accessibility** | corridor width / step-free / door clear-width | program-rules + dimensional validators | PLANNED (A.25.3) |
| **sun** | orientation priority — the D6 `SolarBias.weight` | `solarOrientation.ts` `solarLengthMultiplier` | substrate LIVE; slider PLANNED (A.25.3) |
| **adjacency** | program-rules strictness (preferred-vs-forbidden) | `rules/programRules.ts` permission matrix | substrate LIVE; slider PLANNED (A.25.3) |
| **location** | site lat/lon already drives D6 (`siteLatitudeDeg`) | `gatherLayoutPayload` → `getCurrentSiteOrigin().lat` | LIVE (D6.2 thread) — not yet a slider |
| **room-connection** | corridor-first vs open-plan permeability | `BubbleGraph` `via:'open'\|'door'` + scorer | substrate LIVE; slider PLANNED (A.25.3) |
| **daylight** (ranking) | `ScoringWeights.naturalLight` | `tgl/objectives.ts` `daylight` axis | **SHIPPED v1 (A.25.1)** |
| **privacy** (ranking) | `ScoringWeights.privacy` (bedrooms deep from entrance) | `tgl/spaceSyntax.ts` + `score.ts` | **SHIPPED v1 (A.25.1)** |
| **kitchen workflow** (ranking) | `ScoringWeights.kitchenWorkflow` | `score.ts` §9 | **SHIPPED v1 (A.25.1)** |
| **compactness** (ranking) | `ScoringWeights.corridorEfficiency` | `tgl/objectives.ts` `efficiency` axis | **SHIPPED v1 (A.25.1)** |

The last four rows are the **v1 ship** (A.25.1): the four scorer axes the D-TGL ranker
already blends. They re-rank WHICH generated layout the modal shows first, without
touching the generator, the program rules, or window emission. The rows above them are the
substrate that the FUTURE slices (A.25.3) bind additional sliders to.

---

## §3 — AS-BUILT v1 (A.25.1 + A.25.2) — SHIPPED 2026-06-05

The first vertical slice ships **four sliders bound to the four D-TGL scorer axes**, with a
live debounced re-generate.

### §3.1 — The pure mapping (A.25.1)

`packages/ai-host/src/workflows/apartmentLayout/designParamsToScoringWeights.ts`
(L2, pure, unit-tested in plain Node):

- **`DesignParams`** — four normalised `0..1` sliders:
  `daylight`, `privacy`, `kitchen`, `compactness`.
  `DEFAULT_DESIGN_PARAMS` = all `0.5` (the neutral midpoint).
- **`designParamsToScoringWeights(params): ScoringWeights`** — maps each slider to one
  existing scorer axis via a piecewise-linear `sliderToWeight`:
  `[0, 0.5] → [0.05, 1.0]` and `[0.5, 1] → [1.0, 3.0]`, so **0.5 reproduces the legacy
  all-equal `DEFAULT_WEIGHTS`** (every axis weight 1.0), dragging up amplifies an axis,
  dragging down attenuates it. The weight floor (0.05) is strictly positive so the scorer's
  weight-sum normalisation never divides by zero when every slider is at 0.

  | slider | → `ScoringWeights` axis | meaning |
  |---|---|---|
  | `daylight` | `naturalLight` | share of floor area in windowed/sun-facing rooms |
  | `privacy` | `privacy` | bedrooms deep from the entrance (Space-Syntax depth) |
  | `kitchen` | `kitchenWorkflow` | kitchen↔dining adjacency + exterior wall |
  | `compactness` | `corridorEfficiency` | less circulation/corridor area is better |

  Typology-agnostic: the labels are apartment-flavoured but the mapping is just numbers;
  the four axes exist for any layout the D-TGL scorer ranks.

### §3.2 — The session stash (A.25.1)

`apps/editor/src/ui/apartment-layout/activeDesignParams.ts` (L5):

- `setActiveDesignParams(params)` / `getActiveDesignParams()` — holds the last-set sliders.
- `getActiveScoringWeights()` — derives `ScoringWeights` via the pure mapping (or `null`
  when the user never touched the panel ⇒ the payload uses `DEFAULT_WEIGHTS`).
- `clearActiveDesignParams()` — project-close / re-onboard reset.

The panel sits **outside** the generate call stack (mirrors `activeBrief.ts`). The writer is
the panel; the reader is `gatherLayoutPayload`, which applies the derived `ScoringWeights`
to `options.scoringWeights` on the payload it builds. Every generate entry-point (the
panel's own re-generate, the AI panel, the console command, the modal's program-edit
re-generate) funnels through `gatherLayoutPayload`, so the sliders apply uniformly.

### §3.3 — The panel UI (A.25.2)

`apps/editor/src/ui/apartment-layout/DesignParamsPanel.ts` +
`apps/editor/src/ui/styles/panels/designParamsPanel.ts` (`DESIGN_PARAMS_PANEL_STYLES`):

- A floating, draggable card titled **"Living Design Parameters"** — brand white + `#6600FF`,
  styles in `AppTheme`, never inline `<style>`; CSP-safe (`addEventListener` only).
- Four sliders (Daylight / Privacy / Kitchen workflow / Compactness), each showing a `%`
  value, a **Live: on/off** toggle, and **Reset**.
- On `input`: writes the slider to the stash (`setActiveDesignParams`) immediately, then
  **debounces** (`REGEN_DEBOUNCE_MS = 450`) a live re-generate so dragging doesn't spam the
  pipeline — only the settled value re-runs generation.
- **Live re-generate reuses the EXISTING §11 trigger** (`triggerApartmentLayout`) end-to-end:
  `gatherLayoutPayload` reads the stash → `options.scoringWeights` → the scorer re-ranks →
  the modal shows the re-ranked options. **No new generate path is invented.**
- **P6-clean:** the panel NEVER writes a store directly — it sets the session stash + calls
  the existing trigger, which dispatches commands. No THREE imports; no `fetch`/Anthropic of
  its own.

### §3.4 — Discoverability (A.25.2)

`installDesignParamsConsoleTrigger(runtime)` registers
**`window.pryzmToggleDesignParams()`** (DevTools console) and the panel is reachable from
its discoverable button (deploy batch 2026-06-06). `toggleDesignParamsPanel` /
`openDesignParamsPanel` / `closeDesignParamsPanel` / `disposeDesignParamsPanel` round out
the lifecycle (the last for test/HMR hygiene).

---

## §4 — PLANNED slices

### §4.1 — A.25.3 — adjacency / accessibility / climate / space sliders → substrate

Bind the remaining founder parameters (§2 rows that are "substrate LIVE; slider PLANNED")
to additional sliders, each re-using its existing substrate — **no new scoring path**:

- **sun / climate** → expose the D6 `SolarBias.weight` (already `0..1`, default `0.6`) as a
  slider; thread it through the same `siteLatitudeDeg`/`solar` payload thread D6.2 built
  (no new wiring). Optionally surface `climateGlazingFactor` strength.
- **adjacency** → a "program-rules strictness" slider steering the
  preferred-vs-forbidden weighting in `rules/programRules.ts` (the permission matrix stays
  the hard gate; the slider tunes the soft preference weight only).
- **accessibility** → corridor width / step-free / door clear-width, bound to the
  dimensional-constraints validators (D.DC.* framework) once those scoring gates land.
- **space** → expose `targetAreaM2` / room area fractions as live sliders (the brief
  fields already exist).
- **room-connection** → a corridor-first ↔ open-plan permeability slider biasing the
  `BubbleGraph` `via:'open'|'door'` decision.

### §4.2 — A.25.4 — graph-linked "what changed + why"

Pair the panel with the interrogable Building Graph (GRAPH.4 / A.21.D16): after a live
re-generate, surface the per-element rationale ("this layout ranks first because daylight
weight is high → the corner bedroom moved to the south façade"). The UBG already models the
room/element relationships; A.25.4 renders the delta.

---

## §5 — Contract / principle alignment (must conform)

- **C50-TYPOLOGY-PIPELINE** — design parameters are a **Stage-4 generative input**: they
  re-weight the deterministic engine's scorer, they do not reorder/skip stages. The panel
  sits at L5 and feeds the payload the typology pack's generative stage consumes. C50 §2.6.5
  records the parameter-input principle (added 2026-06-06).
- **ADR-0056** — design parameters extend the typology-declared principle: a parameter is the
  live, re-runnable sibling of a brief field; both are declared by the typology, never
  hard-coded in the UI.
- **ADR-0060** — the design of record for this binding: parameters bind to
  `ScoringWeights` / program-rules / `SolarBias`, re-running the deterministic engine; no
  parallel scoring path, no hard-coded per-typology knob.
- **8 principles** — **P5** the pure mapping is plain numbers → `ScoringWeights` (no I/O,
  THREE, DOM); **P6** the panel sets a session stash + calls the existing trigger which
  dispatches commands — it never writes a store; **P8** the spans live at the AiPlane /
  pipeline-dispatch boundary the trigger already crosses (the pure mapping is span-free, per
  the established #51 / SPEC-TGL §11 doctrine — pure helpers carry no spans).
- **product-vision §5 / platform-spine** — typology-agnostic; the four axes (and every future
  parameter) exist for any layout the engine ranks, so the panel serves apartment, house, and
  every later typology unchanged.

---

## §6 — Determinism + live-regenerate guarantee

The deterministic engine (SPEC-TGL §6) is **byte-stable for fixed input**, so a given slider
configuration always produces the same ranked layouts — the panel is a pure re-weight + a
deterministic re-run, never a stochastic search. The debounce (§3.3) only coalesces drag
events; it does not change the result, only when it is computed.

---

## §7 — Known limitations (tracked)

1. **v1 is ranking-only.** The four shipped sliders re-RANK existing generated options; they
   do not yet change room geometry, adjacency, or window placement directly — that is A.25.3
   (space/adjacency/accessibility) + the D6 climate slider.
2. **No graph-linked explanation yet.** A.25.4 (the "why did this change?" overlay) is
   PLANNED; today the user sees the re-ranked layouts but not the per-element rationale.
3. **Apartment-flavoured labels.** The mapping is typology-agnostic but the v1 slider LABELS
   are apartment-worded; a house/office pack should declare its own label set when A.25.3
   makes parameters typology-declared end-to-end.

---

## §8 — Execution plan → tracker rows (A.25)

| ID | Slice | Status |
|---|---|---|
| **A.25.1** | parameter → `ScoringWeights` binding + live re-generate seam (`designParamsToScoringWeights` + `activeDesignParams` stash + `gatherLayoutPayload` read) | ✅ SHIPPED 2026-06-05 |
| **A.25.2** | the slider panel UI (`DesignParamsPanel`, brand white+#6600FF, draggable) + `pryzmToggleDesignParams()` + discoverable button | ✅ SHIPPED 2026-06-05 |
| **A.25.3** | adjacency / accessibility / climate / space / sun / room-connection sliders → program-rules + `SolarBias` + area fractions | 🔵 PLANNED |
| **A.25.4** | graph-linked "what changed + why" (GRAPH.4 / A.21.D16 pairing) | 🔵 PLANNED |

---

## §9 — Cross-references

SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE (the engine the sliders re-run; §4 scorer axes, D6
climate), SPEC-TYPOLOGY-BRIEF-SCHEMA (the declared-field substrate), ADR-0056
(typology-declared brief), ADR-0060 (this binding's decision record),
C50 §2.6 (briefSchema) + §2.6.5 (parameter input), SPEC-ARCHITECTURAL-PROGRAM-RULES (the
adjacency/accessibility substrate), [[platform-spine-typology-agnostic]].

---

> **Last reviewed:** 2026-06-06.
> **Author:** PRYZM core platform.
