# RAC Universal Capability Architecture — Dimension A (UI parity) + Dimension B (beyond-UI)

**Date:** 2026-08-10 · **Status:** architecture assessment; supersedes the roadmap section of
`RAC-ARCHITECTURE-CAPABILITY-PARITY-ASSESSMENT.md` (whose §1–§12 remain valid).
**Evidence:** `RAC-CAPABILITY-PARITY-INVENTORY.md` (UI⇄command⇄chat),
`RAC-GENERATIVE-INFRA-INVENTORY.md` (generators, plans, duplication),
`RAC-SITE-CONTEXT-INVENTORY.md` (geo/solar/spatial), commits `8447911f`/`ba17c2b4`
(dead-route truth-fixes; 20 live capabilities; all gates green).

---

## 1. What is already possible today (the honest ledger)

- **Exposed to RAC (20 capabilities):** dimensions (height/thickness/width/sill/riser/tread/
  room-offset/pitch), wall type + colour (true batches, one undo), delete, create-wall(coords),
  levels (go/add), room rename/number, undo/redo/zoom — all on verified-live routes.
- **In infrastructure but NOT exposed:** the whole generative fleet (apartment/house/office/
  residential + ceiling/furnish/floor/lighting chain — headless-callable, typed request
  objects, deterministic except apartment's LLM-first stage); `DuplicateFloorPlanCommand`
  (production-quality, disabled UI); facade orientation (`facadesByOrientation` — the AI
  pills already use it); room adjacency/paths (`roomQueryService`, window-exposed);
  parcel/buildableRing/setbacks (schema-complete); solar sun-samples/sun-hours (pure);
  E-class bulk creators (single-slab scoping exists de facto).
- **Only through Generative Design today:** generate apartment/house/office/residential;
  ceiling/furnish/floor/light all-rooms; from-boundary variants. Each has a console trigger
  and (mostly) a typed request — the gap is a chat adapter + headless option-pick.
- **Data exists, executor missing:** per-room solar heat (`accumulateRoomHeatGain`, zero
  consumers); `maxHeightM` (no generator enforces); element near/within queries.
- **Genuinely missing editor primitives:** stair tread-count carrier; roof overhang /
  lighting intensity live carriers; bus-side composite; scope→ids resolver; room-name/area
  predicates; headless SiteQueryService; liveness gate.

## 2. The §21 answer — the smallest coherent architecture

**One semantic front door, four execution classes, five context services.** Everything in
both dimensions reduces to:

```
Utterance / LLM proposal
        ↓
SemanticIntent  ∪  ScopeDescriptor  ∪  ValueRefs        (pure, ai-host)
        ↓ applySemanticIntent (the ONE authority, spec-driven per F4)
        ├─ EXEC-1 Command        (single/batch verb, proven-live)         → bus/CM
        ├─ EXEC-2 Fan-out        (N commands, honest N-undo summary)      → bus/CM
        ├─ EXEC-3 Plan           (ordered steps, PlanValidator dry-run,
        │                         generation-batch bracket = one undo)    → CM composite
        └─ EXEC-4 GenerationRequest (typed union → existing controllers,
                                  beginBuildingGeneration lease,
                                  option-cards → confirm → executor)      → generators
        ↑ context services, INJECTED into ResolverContext:
          ScopeResolver · ValueResolvers · SiteQuery (θ, parcel, envelope)
          · RoomQuery (existing) · FacadeOrientation (θ-threaded)
```

Nothing new executes anything: EXEC-1/2 are today's paths; EXEC-3 is the existing
`CompositeCommand`+`beginGenerationBatch` with a parameterised label + `PlanValidator`;
EXEC-4 is a **mapper** onto the five existing request types + `resolveGenerateRoute` +
`beginBuildingGeneration`. The LLM (last) emits the same three pure inputs, never more.
Adding a capability at any level is metadata + proof; adding a scope is one resolver arm;
adding a generator is one union variant + one brief-mapper (the
`residentialRequestFromBrief` template).

## 3. Capability maturity taxonomy (M0–M8) — adopted

M0 command exists · M1 UI-proven-live · M2 direct · M3 selection · M4 semantic scope
(level/type/room/filter/orientation) · M5 true batch (one undo) · M6 deterministic plan ·
M7 generative workflow (typed request → existing generator) · M8 context-aware generation
(site/solar/constraints). Gate 31 gains a maturity report line; **M1 becomes a HARD gate**
(liveness, §6). Today: M2/M3 = 20 · M4 ≈ pills-only · M5 = 2 · M6 = 0 · M7 = 0 (all
generators reachable but not from chat) · M8 = 0.

## 4. Batch architecture (mutation vs creation — deliberately different)

- **Batch mutation** = one batch command (the wall type/colour pattern) or honest fan-out
  until a primitive exists. Unchanged from ADR-0314 D2.
- **Batch creation** = a GENERATION problem, not a loop: repetition/spacing/host/room
  semantics live in engines. Route: small parametric cases (columns every 6 m, windows on
  south walls) become **plan-built creation steps** over existing `*.create`/opening
  commands with `buildLayoutCommands`-style pure preview; large cases route to EXEC-4.
  Never expose `create-on-all-*` without the pre-dispatch count preview (cheap — counts
  are knowable from stores; single-slab variant ships first).
- **Duplication** = its own class: `DuplicateFloorPlanCommand` + conversational target-level
  clarification + post-run room-redetect (+ optional finish chain), with the not-cloned
  kinds stated in the report.

## 5. Scope architecture — from "all south-facing bedrooms on floors 2–4" to ids

ScopeDescriptor grows: `orientation('N|E|S|W')`, `roomRef(name|occupancy|id)`,
`levelRange`, `exterior`, `filter(SemanticQueryExpression)`, composable by intersection.
Resolution order: levels (LevelStore range) → kind stores (`getByLevel` indexed) →
orientation (θ-threaded FacadeOrientationService roll-up) → room membership
(RoomStore predicates + completed `getElementsInRoom`) → filter (ElementProjection +
`evaluateQuery`). Result always carries `{ids, kindCounts, skipped[], diagnostics}` so
refusals can say "7 found, 2 unsupported". Prerequisite wirings = the five in
`RAC-SITE-CONTEXT-INVENTORY.md §7` + the CapabilityScope/value-source extension that
currently gates everything.

## 6. Liveness architecture (the 8447911f prevention)

New gate check **3d — route liveness**: every capability route's proof file must be one of
(i) a legacy command in `packages/command-registry` (geometry stores by construction),
(ii) an `initBusHandlers` bridge, (iii) a plugin handler on an ALLOWLIST of proven-live
plugin stores (currently: wall create-path only), or (iv) a generator executor. A proof
pointing at a plugin `produceCommand` store not on the allowlist FAILS. DEAD_VERBS stays as
the test-level pin; the classification's D-dead family is the ledger. Runtime half (later):
a dev-mode dispatch probe asserting a store generation-counter change after execute.

## 7. Site-aware + generative flows (worked examples)

- *"Put larger windows on south-facing bedrooms, floors 2–4"* → scope: levelRange ∩
  roomRef(occupancy=bedroom) ∩ orientation(S, θ-threaded) → EXEC-3 plan over window
  resize/create steps → preview counts → confirm → one generation-batch undo.
- *"Duplicate Level 1 to 2–4"* → clarify targets → `level.duplicate-floor-plan` → report
  cloned/not-cloned → offer redetect+chain.
- *"Create a 4-bed two-storey house in this envelope"* → `GenerationRequest{kind:'house',
  storeyCount:2, program:{bedrooms:4}}` → `resolveBuildableFootprint()` (+ NEW maxHeightM
  check) → `generateHouseFromBoundary` → option cards in chat → executor under
  `beginBuildingGeneration` → honesty strings relayed ("built 3-bed: envelope rejected 4").
- *"Furnish every bedroom"* → today: chain via ONE apartment/furnish event (level-scoped);
  later: room-scoped furnish (engine already room-wise).
- *"Maximise south exposure"* → M8; needs sun-samples + facade roll-up + an evaluation
  loop — deferred until M7 is real; `accumulateRoomHeatGain` wiring is the first metric.

## 8. Revised dependency-ordered roadmap (supersedes P1–P11 numbering)

```
U0  liveness gate 3d + maturity report in gate 31                       [small, now]
U1  wall.updateDimensions & remaining-route liveness verdicts (auditor) [in flight]
U2  θ-threading + facade roll-up + room predicates + getElementsInRoom
    completion + SiteQueryService  (the five context wirings)           [enables M4]
U3  ScopeDescriptor/ScopeResolver + CapabilityScope/value-source
    extension + ids-only accessors + benchmarks                         [M4 core]
U4  F4 spec interpreter + migrate the 20 (unchanged from prior plan)
U5  GenerationRequest union + brief mappers + headless option-cards +
    beginBuildingGeneration for ALL chat generation + level-duplication
    conversation  ★ level-duplication ships FIRST (highest value/effort) [M7]
U6  EXEC-3 plan executor (parameterised generation bracket +
    PlanValidator + impact preview + confirm)                           [M6]
U7  property vocabulary + catalogue families (prior P2/P5 content)
U8  filter scopes (ElementProjection) + spatial near/within service
U9  batch-creation parametrics + E-class with preview
U10 QueryEngine drain; LLM planner emitting SemanticIntent/Scope/
    GenerationRequest (same validation path)                            [M8 seed]
```
Ordering rationale: U2/U3 unlock the largest sentence space; U5 is cheap because the
generators are finished (adapters only) and level-duplication needs zero new execution
code; plans (U6) before broad property vocabulary because compound asks arrive as soon as
scopes work.

## 9. Performance & benchmarks

Language layer: settled (µs). CI benchmarks added with U3/U8: level/type scope < 0.5 ms
@5k; orientation scope < 2 ms @5k (needs θ roll-up cache keyed on wall-store generation);
filter < 5 ms @5k first-pass; generation previews are engine-bound (already interactive).
No cache without a generation-counter invalidation test. 50k-element target: ids-only
accessors + projection incrementality (U8), measured before optimized.

## 10. Safety

Destructive/large ops: impact preview from pure seams (`buildLayoutCommands`, pre-dispatch
counts, PlanValidator dry-run) → confirm card → execute → truthful report (planned/
executed/skipped/failed/undo semantics). Reuses existing confirm + undo authorities; no
second confirmation system. Generation honesty strings are part of the contract (§7).
