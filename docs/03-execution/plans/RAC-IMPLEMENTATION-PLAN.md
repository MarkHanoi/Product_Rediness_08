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

## Phase U1 — Liveness verdicts + dead-edit fixes ✅ (§FIX-DIMS-REACH-RECORD, L-815)

| Sub | What | Status |
|---|---|---|
| U1.1 | `wall.updateDimensions` production-liveness verdict | ✅ verdict: **DEAD** (detached plugin store; founder-approved fix) |
| U1.2 | Re-route wall height/thickness | ✅ same-verb bridge in initBusHandlers → `UpdateWallDimensionsCommand` vs geometry wallStore + ring-parity undo pair |
| U1.3 | Property-Inspector dead-edit verbs (window.setSize/setSillHeight, door.setWidth/setHeight/setSillHeight) | ✅ five bridges → `UpdateElementParameterCommand` (production-proven Inspector route); plugin handlers retired; ISSUE-LOG **L-815** |
| U1.4 | Sweep remaining chat-adjacent verbs | ✅ `PLUGIN_LIVE_ALLOWLIST` emptied — gate 3d now proves route liveness with zero exemptions; 13 dead verbs pinned in DEAD_VERBS |

🧪 After U1 (now TESTABLE): *"make this wall 3 m tall"*, *"make this wall 30 cm
thick"*, and the Inspector's window/door width & sill edits are **guaranteed**
real — geometry store, render, persistence, and one truthful undo step each.

## Founder capability asks (2026-08-10) — interleaved with U3

| # | Ask | Status |
|---|---|---|
| 1 | Wall rake by degrees ("make all walls angled by 120 degrees") | ✅ `set-wall-rake` — batch command (8dcaf00d) + grammar/NL/registry; scopes all·selection·level·room; per-wall `rakeAuthorability` refusals reported honestly |
| 2 | Add finish layer to a wall type | ✅ `add-wall-layer` — `wall.addLayerBatch` (one undo, instance-scoped via UpdateWallSystemTypeCommand, exterior-first array semantics, raked walls skip honestly); finishRef.ts = the ONE finish vocabulary |
| 3 | Parametric window creation (count / spacing) | ✅ `create-windows-parametric` — `window.parametricCreate` (one undo, CreateWallOpeningCommand children w/ occupancy gate, §WINDOW-CORNER-OVERFLOW capping, Confirm card, honest created/skipped report); scopes all·selection·level |
| 4 | Change window type by catalogue name | ✅ `set-window-type` — `window.updateSystemTypeBatch` batch (one undo, L-620-proven child, host-wall reveal nudge); scopes all·selection; catalogue-listed refusals |

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
| U2.5 ✅ | `CapabilityScopeMode` (level/room/orientation) + optional `scopeModes` on capabilities (gate-validated: known modes only, must include default scope) + value sources `project-rooms`/`orientation`/`level-range` with probe shapes. Vocabulary only — first consumers land with U3; declaring a spatial mode before the resolver honours it would be the ElementCapabilities lie | gates U3 |

🧪 After U2: no new sentences yet (U3 consumes these), but `describeGraph`/room
queries become chat-answerable data.

## Phase U3 — ScopeDescriptor + ScopeResolver ✅ (all five arms live) → the big sentence unlock

| Sub | What | Status |
|---|---|---|
| U3.1 ✅ | `ScopeDescriptor` union + ScopeResolution/ScopeError contracts (selection/ids/all/level/room/orientation) | all forms consumed |
| U3.2 ✅ | Injected resolver: all/level/ids + room (boundingWallIds + roomQueryService) + ORIENTATION (θ-threaded facadesByOrientation, exterior-only, detect-rooms-first refusal) | ✅ |
| U3.3 ✅ | Phrases live: "on level N" · "in the kitchen" · "all south-facing (exterior) walls" across the colour + rake grammars | ✅ |
| U3.4 | ids-only store accessors (kill `getAll()` deep-clones on scope paths) | ⬜ |
| U3.5 | In-repo scope benchmarks in CI (level/type < 0.5 ms @5k; orientation < 2 ms @5k) | ⬜ |

🧪 After U3:
*"Make all doors on Level 2 900 mm wide"* ·
*"Make all walls on Level 2 white"* (scope × existing colour batch) ·
*"Delete all furniture in the kitchen"* (scope × delete, with count + confirm) ·
*"Make all south-facing exterior walls 3 m"* (needs U2.1).
Refusals name skipped kinds: "7 found, 2 are curtain walls — nothing changed there".

## Phase U4 — Spec-driven capability interpreter ✅ 2026-08-10 → scaling wall removed

| Sub | What |
|---|---|
| U4.1 | ✅ cea504cf — `CapabilityExecutionSpec` + the ONE generic arm (`applyExecutionSpec`, the switch's default); set-wall-type first table entry. |
| U4.2 | ✅ 1fc83042 · a14409e3 · 657f3aa5 · be4e550a — the batch-shaped family (set-wall-color, set-wall-rake, set-window-type, add-wall-layer) migrated one commit each, refusal copy byte-pinned by the 257-test suite; irregular arms (creation, level-query, rhino, selection-fan-out) documented as deliberately hand-written in the spec header. |
| U4.3 | ✅ set-door-type shipped purely via metadata (spec table entry + registry entry; zero new resolver case code) riding new `door.updateSystemTypeBatch` → L-620-proven `UpdateDoorSystemTypeCommand` children, ONE undo. Gate: 27 capabilities, undeclared 0/0. |

🧪 After U4: no new sentences — but the NEXT 50 capabilities cost metadata +
proofs + acceptance families only. Gate maturity counts become the roadmap dial.

## Phase U5b — GenerationRequest adapters (Dimension B core) ✅

| Sub | What | Test unlock |
|---|---|---|
| U5b.1 ✅ | `GenerationRequest` union + brief mappers (`houseRequestFromBrief`, `officeRequestFromBrief`, `apartmentRequestFromBrief`, `residentialGenerationFromBrief`) + the route-keyed `generationRequestFromBrief` dispatcher; `residentialRequestFromBrief` lifted to the pure `residentialBriefMapper.ts` (`c30fbc8f`, 10 tests) | — |
| U5b.2 ✅ | Two chat capabilities, two bus verbs, ZERO new pipelines (`671153df`). `generation.building` → the SAME controller entry points the onboarding modal calls (`ResidentialBuildingController.request{autoBuild}`, new `HouseLayoutController.buildDirect`, shipped `OfficeBuildingController.buildDirect`); `generation.apartment` → the shared `apartmentLayoutTrigger` the AI-panel leaf already uses. `autoBuild` suppresses the MODAL only — the executors' own `beginBuildingGeneration` lease still coalesces each build into ONE undo entry. `destructive:true` ⇒ Confirm card states typology + floors (or bedrooms/bathrooms + "fills the EXISTING shell") | 29 capabilities, undeclared 0/0 |
| U5b.3 ✅ | `maxHeightM` enforcement — `checkMaxHeightGate` (§GEN-MAXHEIGHT-GATE, `8bb9dac8`) on all three building paths incl. the new house `buildDirect`; U5b.2 CONSUMES it rather than redoing it | honest "that exceeds the permitted height", both numbers quoted |
| U5b.4 ✅ | Engine honesty relayed on `'pryzm-generation-report'` through the existing `BATCH_REPORT_EVENTS` mechanism — resi floors/apartments-per-floor/plate-fill + per-cell rejects with the packer's own reason, house scored-variant + room/stair counts, office as-built storeys/desks + auto-fit notes verbatim. Refusals carry `success:false` so they render "Nothing was changed — …" and can never read like a build | §RESI-ZERO-APARTMENTS-REFUSE and the height gate reach the transcript unedited |

**Founder P0 folded into U5b.2 (2026-08-10).** "Create 3 bedroom apparment"
(his spelling) returned *"I'm not sure how to help with that yet"* while the
apartment-layout engine had been shipping for months — the `c1902a5a` failure
the coverage gate exists to prevent, recurring. Fixed by the
`generate-apartment-layout` capability, whose noun matcher is deliberately
spelling-tolerant: **a capability that cannot be spelled at is a capability
that does not exist.** The two generation grammars are disjoint — any building
word ("building" / "block" / "tower" / a storey count) routes to
`generate-building`; everything else fills the walls already drawn.

🧪 After U5b — all founder-testable today:
*"generate a 3-storey residential building"* · *"generate a 2-storey house"* ·
*"generate an office building with 5 floors"* ·
*"create a residential building with 2-bed and 3-bed apartments"* ·
*"create a 3 bedroom apartment"* (fills the drawn shell) ·
*"make a 3-bedroom apartment with 2 bathrooms"*.

**Deferred, deliberately:** chat OPTION-CARDS in place of the modal. The
building arms need no picker (the Confirm card stands in for the preview and
the best-scored variant is built), and the apartment arm still opens the
shipped §11 layout picker — that modal IS the post-run report on that path.
Headless apartment auto-pick belongs with U5c's auto-chain.

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
