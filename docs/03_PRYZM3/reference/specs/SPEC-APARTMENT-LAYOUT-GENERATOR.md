# SPEC — Apartment Layout Generator (`apartment.generate-layout`) · the "50 + 1" capstone

| Field | Value |
|---|---|
| Status | **Draft — normative target.** Capstone of SPEC-SEMANTIC-DESIGN-ASSISTANT (prompt #51). Buildable on the current stack; depends on the §15 "small pieces". |
| Version | 0.1 (2026-05-25) |
| Owner | Architecture lead |
| Governed by | **C16** (command authoring), **C17** (batch catalogue + panel), **C09** (AI L7.5 + cost), **SPEC-07** (AI surfaces + approval queue), **SPEC-28** (cost meter), **SPEC-47** (Generate-3-Options — the direct architectural precedent) |
| Cross-refs | C11 (creation pipeline), SPEC-06 (rooms/levels), SPEC-46 (plan critique), C15 (hosted doors/windows), SPEC-SEMANTIC-DESIGN-ASSISTANT (SL-1…SL-3 services this consumes) |

> The capstone of the Semantic Design Assistant: given an apartment **shell** (perimeter walls + entrance door + windows already in the model), the AI generates **N ranked interior layout options** — internal walls + doors — that satisfy hard space-planning rules, scores them, and (on the user's pick) commits the chosen option as **one undoable batch**. It is a **two-phase, generative L7.5 workflow** (SPEC-47 pattern): *generate → preview/approve → execute*. It **invents no new infrastructure** — it composes CommandBus, BatchCoordinator, the AI relay, Zod validation, the approval queue, PlanarTopologyEngine, and the SL-1…SL-3 services. The only genuinely new pieces are the **space-planning prompt template**, the **pre-execution validator**, and the **scorer** (§8/§9 — all pure + unit-tested).

---

## §1 — Goals & relationship to the catalogue

1. One prompt — *"generate 3 interior layouts for this apartment shell"* — produces 3 validated, scored options; the user picks one; PRYZM builds it in <2 s, fully undoable.
2. **Capstone, not a piece.** It composes the per-element pieces (the catalogue's small commands) + the SL services. It is the 50+1 prompt: feasible only once the shell-analysis (SL-3) and hosted-opening (C15) building blocks exist — which they now do (Phase 3 ✅).
3. **Two-phase, never auto-mutate.** Generation is read-only + proposes; nothing touches the model until the user confirms an option (SPEC-07 §4, ADR-014). Step 11 of the handler is explicit: *do NOT execute any wall.create/door.create yet.*

## §2 — Two-phase architecture

```
Phase A — GENERATE (read-only, proposes)
  user prompt → ai-host workflow 'apartment-layout-generate'
    1. OTel span 'pryzm.ai-host.apartment-layout-generate' (P8)
    2-5. Shell analysis (read shell walls/door/windows → area, dims, face classes) — SL-3
    6.  AI proxy call (space-planning prompt + shell + program + constraints)
    7.  Zod-parse + HARD validate each option (§8); reject failures
    8.  retry ≤3 with failed constraints fed back
    9.  score each valid option (§9)
    10. keep exactly options.count, ranked by weighted score
    11. DO NOT execute anything
    12. AIStore['pendingLayoutOptions'] = scored options
    13. emit 'apartment.layout-options-ready' { options }
    14. close span
        ↓
  UI modal: N cards (2D thumbnail via FrameScheduler, room areas, score breakdown, /100)
        ↓
Phase B — EXECUTE (mutates, on user pick)
  dispatch 'apartment.layout-execute' { optionIndex }
    1. read AIStore.pendingLayoutOptions[optionIndex]
    2. BatchCoordinator.runBatch(() => {
    3.    wall.batch.create  (all internal walls)
    4.    door.batch.create  (all internal doors)
    5. })  → ONE undo entry for the whole layout
    6. emit 'apartment.layout-executed'
    7. PlanarTopologyEngine auto-detects rooms from the new wall graph
  (or 'apartment.layout-cancel' → clear AIStore, no mutation)
```

## §3 — Generate payload (Zod, L0 — `packages/schemas`)

```ts
const ApartmentGenerateLayoutPayload = z.object({
  levelId: z.string(),
  shellWallIds: z.array(z.string()).min(3),     // perimeter walls already in the model
  entranceDoorId: z.string(),
  windowIds: z.array(z.string()),
  program: z.object({
    bedrooms: z.number().int().min(0),
    bathrooms: z.number().int().min(0),
    masterEnSuite: z.boolean(),
    openPlanKitchenDining: z.boolean(),
    livingRoom: z.boolean(),
    entranceHall: z.boolean(),
  }),
  constraints: z.object({
    minCorridorWidth: z.number().positive(),    // mm
    wallThickness:    z.number().positive(),    // mm
    floorToCeiling:   z.number().positive(),    // mm
    wallTypeId:       z.string(),
  }),
  options: z.object({
    count: z.number().int().min(1).max(5),
    scoringWeights: z.object({
      naturalLight:        z.number().min(0).max(1),
      privacy:             z.number().min(0).max(1),
      kitchenWorkflow:     z.number().min(0).max(1),
      corridorEfficiency:  z.number().min(0).max(1),
    }),
  }),
});
```
Units: the payload uses **mm** (architect-facing); the shell geometry read from stores is in **m** (world X-Z). Conversion happens once at the analysis boundary (§5) — documented, single place.

## §4 — Generate handler — the 14 steps (normative)

The handler ships as an `@pryzm/ai-host` workflow (SPEC-47 factory pattern), `kind: 'generative'`. Steps map 1:1 to the architect's list:

1. **OTel span** `pryzm.ai-host.apartment-layout-generate` (P8); namespace `pryzm.ai.workflow`, attribute `pryzm.ai.workflow.id=apartment-layout-generate`.
2. **Read shell walls** from the element store by `shellWallIds` (baseLine, thickness, levelId).
3. **Read** `entranceDoorId` position + all `windowIds` positions (offset along host wall → world point).
4. **Compute** total floor area + shell bounding dimensions from wall coordinates (shoelace over the perimeter polygon; net area).
5. **Classify each wall face** — `entrance-side | best-light | secondary-light | blind` — reusing **SL-3 `FacadeOrientationService`** (exterior + orientation) + window counts per wall (best-light = most window area; entrance-side = wall hosting the entrance door).
6. **AI proxy call** `/api/anthropic/v1/messages` via the SPEC-47 relay (`MockAnthropicRelay` until the CF relay lands — SPEC-47 §7), with the §6 space-planning prompt (shell geometry, program, constraints, face classes).
7. **Zod-parse + HARD-validate** each returned option (§7 schema + §8 rules); drop invalid (loud telemetry).
8. **Retry ≤3** — on a fully-failed batch, re-call with the failed rule reasons appended to the prompt ("the previous attempt failed: <reasons>; fix them").
9. **Score** each valid option (§9).
10. **Rank + truncate** to exactly `options.count` by weighted score.
11. **No mutation** — assert zero command dispatch in Phase A.
12. **AIStore** `pendingLayoutOptions = options` (keyed by a `runId`).
13. **Emit** `apartment.layout-options-ready` `{ runId, options }`.
14. **Close span** (record `optionCount`, `retries`, `actualCostUsd`).

Cost: per SPEC-28 — estimated `count × $0.05`, per-call ceiling $0.18, refund-on-overshoot (SPEC-47 §2).

## §5 — Shell analysis (reuses SL-3)

- Perimeter polygon from `shellWallIds` baselines (ordered); net area via shoelace; bbox dims.
- Face classification consumes **`FacadeOrientationService.getFacades(levelId, trueNorth)`** (orientation + exterior) — `best-light` = exterior wall(s) with the most window area; `entrance-side` = wall hosting `entranceDoorId`; remaining exterior = `secondary-light`; interior/no-window exterior = `blind`. **No new geometry service** — SL-3 already computes orientation + exterior.

## §6 — AI proxy + prompt template (NEW)

The single new "AI surface" piece: a deterministic **space-planning system prompt** that frames the shell + program + constraints + face classes and demands a JSON-only response matching §7. Mirrors SPEC-47's JSON-only, command-emitting contract; capped command count; loud-fail-soft `parseOption`. The internal walls/doors are emitted as **coordinates** (the AI's job: *where*), to be turned into `wall.batch.create` / `door.batch.create` payloads at execute time.

## §7 — Layout-option response schema (Zod)

```ts
const LayoutRoom = z.object({
  name: z.string(), type: z.enum(['master','bedroom','living','kitchen','dining',
    'bathroom','ensuite','hall','corridor','study','utility']),
  area: z.number().positive(),            // m²
  polygon: z.array(z.object({ x: z.number(), z: z.number() })).min(3),
  windowCount: z.number().int().min(0),
  hasDirectAccess: z.boolean(),           // reachable without passing through another room
  adjacentTo: z.array(z.string()),        // room names
});
const LayoutWall = z.object({ start: Vec2mm, end: Vec2mm });  // mm, internal partitions
const LayoutDoor = z.object({ wallRef: z.number().int(), offset: z.number(), width: z.number() });
const LayoutOption = z.object({
  summary: z.string().max(80),
  rooms: z.array(LayoutRoom), walls: z.array(LayoutWall), doors: z.array(LayoutDoor),
  corridorWidthMin: z.number(),           // mm
});
```

## §8 — Validation layer (pure, unit-tested) — `validateLayout(option, constraints)`

Hard rules (any failure ⇒ option rejected; reasons returned for the retry feed-back):
| # | Rule |
|---|---|
| V1 | min area: master ≥ 12 m², bedroom ≥ 9, living ≥ 18, kitchen ≥ 8, bathroom ≥ 4, ensuite ≥ 4 |
| V2 | every `master`/`bedroom`/`living`/`kitchen` has `windowCount ≥ 1` |
| V3 | every room `hasDirectAccess === true` (no room entered only through another, except `ensuite` via `master`) |
| V4 | `corridorWidthMin ≥ constraints.minCorridorWidth` |
| V5 | door clearance ≥ 600 mm |
| V6 | adjacency: `ensuite` adjacentTo `master`; `kitchen` adjacentTo `dining` (when open-plan) |
| V7 | program satisfied: room counts match `program` (bedrooms, bathrooms, en-suite, etc.) |

Returns `{ valid: boolean; failures: string[] }`. Pure — no stores, no DOM, no THREE → unit-testable in plain Node (scc-no-barrel discipline).

## §9 — Scoring (pure, unit-tested) — `scoreLayout(option, weights)`

| Score (0–1) | Formula |
|---|---|
| naturalLight | Σ(area of rooms with `windowCount ≥ 1`) / total area |
| privacy | normalised mean graph-distance of bedrooms from the entrance hall (further = higher) |
| kitchenWorkflow | kitchen↔dining adjacency (0/1) + kitchen-has-exterior-wall (0/1), normalised |
| corridorEfficiency | 1 − (corridor area / total floor area) (less corridor = higher) |

Overall (0–100) = `round(100 × Σ(score_i × weight_i) / Σ weight_i)`. Returns `{ overall, breakdown }`. Pure.

## §10 — Retry loop

Up to **3** attempts. After a fully-invalid batch, the next prompt appends the concrete failure reasons (V-rules) so the model corrects them. A retry that still yields < `count` valid options returns whatever validated (≥1), or rejects the run with a clear reason if zero.

## §11 — UI (modal)

On `apartment.layout-options-ready`: a modal with `count` cards, each: a **2D plan thumbnail** rendered via **FrameScheduler** (P3 — never a raw rAF), the room list with areas, the 4-axis score breakdown, and the overall /100. **Select** → dispatch `apartment.layout-execute { optionIndex }`. **Cancel** → `apartment.layout-cancel` (clears AIStore). Thumbnail uses the bake-worker render (SPEC-47 §7 placeholder until it lands).

## §12 — Execute handler `apartment.layout-execute`

1. read `AIStore.pendingLayoutOptions[optionIndex]`.
2. `batchCoordinator.runBatch(fn, { levelIds:[levelId], totalElementCount, skipRedetectRooms:false })` — rooms MUST redetect after (this is the one batch that DOES want redetect).
3. inside `fn`: `wall.batch.create` for all internal walls (mm→m; wallTypeId from constraints).
4. then `door.batch.create` (or per-door `CreateWallOpeningCommand` — §15 dependency note) for all internal doors, resolving each door's host wall from the just-created walls.
5. close batch → **ONE undo entry** for the whole layout (C16 §8 / CA-12).
6. emit `apartment.layout-executed`.
7. PlanarTopologyEngine auto-detects rooms from the new wall graph (the existing post-batch REDETECT_ROOMS sweep).

## §13 — Events & AIStore keys

- AIStore: `pendingLayoutOptions: ScoredLayoutOption[] | null` (+ `runId`).
- Events: `apartment.layout-options-ready` `{runId, options}` · `apartment.layout-execute` `{optionIndex}` · `apartment.layout-executed` · `apartment.layout-cancel`. All via `runtime.events` (P4 — no `window.dispatchEvent`).

## §14 — P1–P8 compliance

- **P1** runtime via composeRuntime; **P2** no THREE outside renderer-three (analysis is pure coords); **P3** thumbnails + builds via FrameScheduler; **P4** events via runtime.events, no `window as any`; **P5** schemas pure (L0); **P6** all mutation through commandBus (Phase B only); **P7** n/a; **P8** OTel span (§4.1) + every new exported fn ≥1 span. Generation is read-only (ADR-014); execution is one batch (C16 §8).

## §15 — Dependencies (the "small pieces") + what's NEW

**Reused (must exist first):** CommandBus + BatchCoordinator (✅); `wall.batch.create` (✅); **`door.batch.create`** (⚠ verify — else compose per-door `CreateWallOpeningCommand`, the hosted recipe used by #7/#11); AI relay + cost meter (SPEC-47/28, MockRelay until CF relay); approval queue (SPEC-07); PlanarTopologyEngine (✅); AIStore (✅); **SL-3 `FacadeOrientationService`** (✅ — face classification); SL-1 room tags + SL-2 adjacency (✅ — for the prompt's program reasoning). The per-element catalogue commands (#34/#28/#41/#11/#7) are the *furnishing* follow-on once the shell layout exists.

**NEW (this spec):** (a) the space-planning **prompt template** (§6); (b) the pure **validator** (§8); (c) the pure **scorer** (§9); (d) the two command types + the modal (§11); (e) the layout-option Zod schema (§7).

## §16 — Phased build plan

| Step | Scope | Gate |
|---|---|---|
| **A1** ✅ | TS types (§3/§7); runtime Zod parse lands with A4 | types compile; used by A2 |
| **A2** ✅ | pure `validateLayout` (§8) + `scoreLayout` (§9) — `apartmentLayout/{validate,score}.ts`, 11 tests | rules + scores correct on fixtures |
| **A3** ✅ | shell analysis (§5) reusing SL-3 — `apartmentLayout/shellAnalysis.ts` (`wallsToPolygon` + `polygonAreaM2` + `analyseShell`), 5 tests | area/dims + face classes correct on a known shell |
| **A4-core** ✅ | generation orchestrator — `apartmentLayout/generate.ts`: `buildLayoutPrompt` + loud-fail-soft `parseLayoutOptions` + `generateLayoutOptions` (relay→parse→validate→retry≤3→score→rank→truncate); RelayPorter injected (Mock in tests). 7 tests. **0 mutation.** | returns ≥1 ranked scored option; retries on invalid; never throws |
| **A4-wire** ✅ | `WorkflowDescriptor` (`apartment-layout-generate`, generative, ≤$0.18) + `createApartmentLayoutImpl(deps)` factory — `apartmentLayout/workflow.ts` (mirrors `createGenerate3OptionsImpl`); deps injected (relay/shellReader/setPendingLayouts/emit); runs the orchestrator → on ok persists + emits `apartment.layout-options-ready`; returns json preview; **0 proposedCommands** (read-only). 4 tests. | impl persists+emits on ok; no commands; rejects junk/missing input without throw |
| **A4-register** ✅ (plane binding) | `registerApartmentLayoutWorkflow(plane, deps)` — `apartmentLayout/register.ts`: binds `apartmentLayoutDescriptor` + `createApartmentLayoutImpl(deps)` onto a real `AiPlane` `WorkflowRegistry`; relay defaults to `MockAnthropicRelay` (SPEC-47 §7), now extended with a deterministic 3-bed `DEFAULT_LAYOUT_FIXTURE` (valid against the §8 worked-example program) so the in-process path yields scored options. Workflow surfaced on the `@pryzm/ai-host` barrel. **4 tests** drive the WHOLE binding through `plane.submit()` (budget gate → impl → cost record → enqueue): default mock relay → status `ok` + AIStore persist + `apartment.layout-options-ready` emit + **0 proposedCommands**; injected-relay override; budget-deny rejects pre-flight. | a real (mock-backed) run surfaces options through the AI plane ✅ |
| **A4-register (live editor wiring)** ⏳ A5 | the **editor-side** deps the binding consumes do not exist yet: there is NO live in-process AiPlane registration site for ANY workflow (Generate3Options included — `getAiHost().submit()` POSTs to a worker endpoint, registry constructed empty), and `AIStore.pendingLayoutOptions` + the `runtime.events` emitter + the store-backed `shellReader` (A3 wrapper over stores + SL-3 + FacadeOrientationService) are not built. These land with A5 (they share the editor app + modal surface). The binding unit is ready to receive them. | folded into A5 |
| **A5** | AIStore (`pendingLayoutOptions`) + `runtime.events` emitter + store-backed `shellReader` + live registration site; modal UI (§11) — cards, FrameScheduler thumbnail, score breakdown | renders N options |
| **A6** | execute handler (§12) — runBatch wall+door, one undo, redetect | one undo unit; rooms detected |
| **A7** | swap MockRelay → live CF relay (SPEC-47 §7 dependency) | real generations |

**Landed (A1–A4-register):** the pure foundation (types + validator + scorer + shell analysis, 16 tests) + the generate orchestrator (7 tests) + the AiPlane workflow impl factory (4 tests) + the **plane binding** `registerApartmentLayoutWorkflow` proven end-to-end through a real `AiPlane.submit()` on the deterministic `MockAnthropicRelay` layout fixture (4 tests) — **31 tests, 0 mutation, read-only.** **Next (A5):** the editor-side surface — AIStore `pendingLayoutOptions`, the `runtime.events` emitter, the store-backed `shellReader`, the live registration call, and the modal — which is also where the (currently-absent) in-process AiPlane registration path for the editor gets built.

## §17 — Cross-references

SPEC-47 (precedent — read first), C16 §8 (batch), C17 (catalogue entry #51), C09 (AI L7.5), SPEC-28 (cost), SPEC-07 (approval queue), C15 (hosted doors), SPEC-SEMANTIC-DESIGN-ASSISTANT §10 (#51), PlanarTopologyEngine (room detection).
