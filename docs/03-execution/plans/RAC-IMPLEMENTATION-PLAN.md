# RAC Implementation Plan — phases, subphases, and what you can TEST when

**Status: living plan.** Created 2026-08-10. The execution companion to
`RAC-UNIVERSAL-CAPABILITY-ARCHITECTURE.md` (which owns the WHY and the design;
this doc owns sequencing, granular subphases, and per-phase acceptance sentences).
Evidence base: the three RAC inventories in `docs/04-reference/`.
**Update the Status column in the same commit as the work — a stale plan is a lie.**

Legend: ✅ shipped · 🔶 partial · ⬜ not started · 🧪 = "you can type this into AI
Chat and it must work" (the phase's founder-testable acceptance).

---

## Phase U0 — Liveness gate + maturity metrics ✅ (`56e0c5e3`)

| Sub | What | Status |
|---|---|---|
| U0.1 | Gate 31 check 3d: proof files classified by execution authority; plugin DTO stores presumed dead; dated allowlist | ✅ |
| U0.2 | DEAD_VERBS pin test (13 verbs) | ✅ (`8447911f`/`ba17c2b4`) |
| U0.3 | M-maturity report line in gate output | ✅ |
| U0.4 | Runtime liveness probe (dev-mode store-generation assertion after dispatch) | ⬜ later hardening |

🧪 Nothing new to type — this phase guarantees every FUTURE sentence is real.
CI now prints: `maturity: M2/M3 21 · M4 2 · M5 2 · M6 0 · M7 0`.

## Phase U1 — Liveness verdicts + dead-edit fixes 🔶 (auditor in flight)

| Sub | What | Status |
|---|---|---|
| U1.1 | `wall.updateDimensions` production-liveness verdict (allowlisted PENDING) | 🔶 auditor running |
| U1.2 | If dead: re-route wall height/thickness; if live: annotate allowlist as proven | ⬜ |
| U1.3 | Property-Inspector dead-edit findings (window.setSize etc. from the legacy panel) → ISSUE-LOG L-815 + fix or hand-off | ⬜ |
| U1.4 | Sweep remaining chat-adjacent verbs per auditor report | ⬜ |

🧪 After U1: *"make this wall 3 m tall"* is **guaranteed** real (today it is
believed-but-unproven on the plugin wall store), and the legacy inspector's
width/sill edits are fixed or logged.

## Phase U5a — Conversational level duplication ✅ (`9d7ffaeb`) *(pulled ahead — zero new execution code)*

| Sub | What | Status |
|---|---|---|
| U5a.1 | `duplicate-level` intent + all-or-nothing target resolution + honest not-cloned summary + Confirm card | ✅ |
| U5a.2 | NL/polite forms via shared parse (tier-0 + NL) | ✅ |
| U5a.3 | Post-duplicate offer: re-detect rooms + finishing chain (conversational follow-up) | ⬜ with U5c |
| U5a.4 | "the next three floors" / auto-create missing target levels | ⬜ |

🧪 NOW (after current deploy): *"Duplicate level 0 to levels 1 and 2"* →
Confirm card that names what is NOT copied → one undo.
❌ Not yet: *"duplicate to the next three floors"* (targets must exist and be named).

## Phase U2 — Context wirings (the five) ⬜ → unlocks true spatial language

| Sub | What | Test unlock |
|---|---|---|
| U2.1 ✅ | θ-provider injected (initTools ← `runtime.siteModelStore.trueNorth`; explicit θ still wins, failures degrade to 0) + `getFacadesAllLevels` roll-up + zero-rooms footprint-centroid fallback (per level) + AIPanel literal-0 removed. Tests: spatial-index 20/20 (pure math) + editor spec (service/provider) | "south-facing" is TRUE south |
| U2.2 ✅ | Room predicates on RoomStore: `findByName` (exact-first, ci-substring) / `findByOccupancy` / `findByArea` (no-metric ≠ 0), level-filterable, clone-returning; room-topology 81/81 | "rooms named Bedroom", "rooms > 15 m²" |
| U2.3 ✅ | `getElementsInRoom` completed: windows (via host-wall membership, both `wallId`/`hostWallId`), columns/lighting/stairs (centroid containment); the lying doc comment fixed; `getBoundaryElements` reports real `curtain-wall` kind. Editor spec green. (Beams: no reliable centroid on record — deferred to U8 spatial service, noted honestly) | "the windows in the living room" |
| U2.4 ✅ | Headless `SiteQueryService` in @pryzm/stores (provider-injected; θ/lat-lng/parcel/buildableRing-wins/setbacks null≠0/maxHeightM null="no cap recorded"/point-in-footprint with unknown≠outside); wired in initTools + `window.siteQueryService`; 6/6 tests | envelope/height answers for U5b |
| U2.5 | Extend `CapabilityScope` + value sources (orientation, room-ref, level-range) — the gate currently REJECTS spatial capabilities | gates U3 |

🧪 After U2: no new sentences yet (U3 consumes these), but `describeGraph`/room
queries become chat-answerable data.

## Phase U3 — ScopeDescriptor + ScopeResolver ⬜ → the big sentence unlock

| Sub | What | Status |
|---|---|---|
| U3.1 | `ScopeDescriptor` union (selection · all(kind) · ids · level(range) · type · room · orientation · exterior) | ⬜ |
| U3.2 | Injected `ScopeResolver` over indexed paths, result = `{ids, kindCounts, skipped[], diagnostics}` | ⬜ |
| U3.3 | Grammar/NL scope phrases ("on level 2", "on floors 2–4", "exterior", "south-facing", "in the kitchen") | ⬜ |
| U3.4 | ids-only store accessors (kill `getAll()` deep-clones on scope paths) | ⬜ |
| U3.5 | In-repo scope benchmarks in CI (level/type < 0.5 ms @5k; orientation < 2 ms @5k) | ⬜ |

🧪 After U3:
*"Make all doors on Level 2 900 mm wide"* ·
*"Make all walls on Level 2 white"* (scope × existing colour batch) ·
*"Delete all furniture in the kitchen"* (scope × delete, with count + confirm) ·
*"Make all south-facing exterior walls 3 m"* (needs U2.1).
Refusals name skipped kinds: "7 found, 2 are curtain walls — nothing changed there".

## Phase U4 — Spec-driven capability interpreter ⬜ → scaling wall removed

| Sub | What |
|---|---|
| U4.1 | `CapabilityExecutionSpec` (routes per kind, scopeModes, params) + ONE generic arm in `applySemanticIntent` |
| U4.2 | Migrate the 21 existing capabilities one at a time (refusal copy pinned by tests) |
| U4.3 | Extension test: add a capability purely via metadata (the §56 proof) |

🧪 After U4: no new sentences — but the NEXT 50 capabilities cost metadata +
proofs + acceptance families only. Gate maturity counts become the roadmap dial.

## Phase U5b — GenerationRequest adapters (Dimension B core) ⬜

| Sub | What | Test unlock |
|---|---|---|
| U5b.1 | `GenerationRequest` union + brief mappers (`houseRequestFromBrief`, `officeRequestFromBrief`, `apartmentProgramFromBrief` — the `residentialRequestFromBrief` template) | — |
| U5b.2 | Chat option-cards instead of the modal (card models exist) + `beginBuildingGeneration` lease for ALL chat generation (incl. apartment path's undo coalescing) | — |
| U5b.3 | `maxHeightM` enforcement from `resolveBuildableFootprint` (first envelope compliance check) | honest "that exceeds the permitted height" |
| U5b.4 | Engine honesty relayed (bedroom auto-iteration, storey auto-fit, per-cell rejects) | "I built a 3-bed — the envelope rejected 4" |

🧪 After U5b:
*"Create a four-bedroom house over two floors inside this envelope"* →
option cards → pick → build (one coherent undo) ·
*"Create an office building on this site"* ·
*"Create a residential building with 12 apartments, mostly T2/T3"*.

## Phase U5c — Room-scale generation + chain ⬜

| Sub | What | Test unlock |
|---|---|---|
| U5c.1 | Chain intent ("furnished apartment" = ONE apartment event; never double-fire the auto-chain) | *"Generate a furnished apartment layout on this floor"* |
| U5c.2 | Level-scoped ceiling/furnish/floor/lighting intents | *"Furnish this floor"*, *"add ceilings to level 2"* |
| U5c.3 | Room-scoped furnish (engine is room-wise already) + U2 room scopes | *"Furnish every bedroom"*, *"add kitchen furniture to all kitchens"* |
| U5c.4 | Duplicate-then-chain follow-up (closes U5a.3) | *"…and re-detect rooms + furnish the new floors"* |

## Phase U6 — Plan executor (compound sentences) ⬜

| Sub | What |
|---|---|
| U6.1 | Parameterise `beginGenerationBatch` label; plan = ordered steps over legacy/bridge commands |
| U6.2 | `PlanValidator` dry-run + impact preview card (counts per step) + confirm |
| U6.3 | Truthful report: planned/executed/skipped/failed + real undo semantics per domain |

🧪 After U6: *"Make all exterior walls 3 m, change them to Interior Partition,
and make them white"* → ONE preview card → confirm → one coherent history entry
(legacy domain) → honest per-step report.

## Phase U7 — Property vocabulary + catalogue families ⬜

U7.1 top-20 panel fields (per-kind proven routes, bounds from L2 authorities,
gate-pinned vs PropertyDescriptorGenerator) · U7.2 `element.changeType` +
door/window types via `resolveCatalogueRef` · U7.3 enums (swing, accessibility,
fire ratings) · U7.4 marks, frame colours, room occupancy/fill.

🧪 *"Set the base offset to 150 mm"* · *"change these doors to fire doors"* ·
*"make this door accessible"* · *"set the mark to W-101"*.

## Phase U8 — Filter scopes + spatial service ⬜

U8.1 `ElementProjection` (versioned, cheap) · U8.2 filter scope over
`SemanticQueryExpression` · U8.3 near/within element service + `adjacentTo`
traversal · U8.4 50k-element benchmarks.

🧪 *"…all windows with sill below 900 mm"* · *"walls thicker than 200 mm"* ·
*"furniture near the entrance"*.

## Phase U9 — Batch-creation parametrics + safe E-class ⬜

U9.1 parametric creation plans (columns every N m, windows on scoped walls)
with pure preview counts · U9.2 E-class (`create-on-all-*`) behind
count-preview; single-slab variant first.

🧪 *"Create a row of columns every 6 metres along this wall"* ·
*"add walls on this slab"* → "this will create 14 columns — proceed?".

## Phase U10 — Drain + LLM planner ⬜ (last, deliberately)

U10.1 QueryEngine drain + duplicate maps collapse · U10.2 LLM planner emitting
`SemanticIntent | ScopeDescriptor | ValueRefs | GenerationRequest` through the
SAME validation/refusal path · U10.3 M8 seed: solar-aware objectives
(sun-samples + θ + `accumulateRoomHeatGain` wiring).

🧪 *"Put larger windows on the south-facing bedrooms"* end-to-end from free
phrasing · *"orient the living spaces for the best south exposure"* (M8).

---

## What you can test TODAY (after the current deploy, SHA `b9ea47ae`)

- All 21 capabilities: dimensions (height/thickness/width/sill/riser/tread/
  room-offset/pitch), *"make all walls white"*, *"make all walls interior
  partition"*, delete/undo/redo/zoom, levels, room rename/number,
  **"Duplicate level 0 to levels 1 and 2"** (Confirm + honest not-cloned list).
- Multi-selection fan-outs with honest "(N steps)" undo summaries.

## Explicitly NOT ready yet (do not expect these to work)

Level/room/orientation/filter scopes (U3/U8) · any "create a building/house/
office" sentence (U5b) · furnish/ceiling by sentence (U5c) · compound plans
(U6) · property-panel breadth (U7) · parametric creation (U9) · free-phrasing
LLM planning and solar objectives (U10). Tread COUNT has no live carrier at
all (editor gap). `wall.updateDimensions` liveness is PENDING the auditor (U1).
