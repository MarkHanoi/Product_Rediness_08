# RAC Generative-Infrastructure Inventory (Dimension B evidence)

**Status: living audit.** Compiled 2026-08-10 (universal-capability phase). Evidence for
ADR-0315/next-phase design. Every claim was read from source; file:line cited.

## 0. The shape

Every generator follows one split: **PURE engine** (`packages/ai-host/src/workflows/<domain>/`,
deterministic, node-testable) → **CONTROLLER** (`apps/editor/src/ui/<domain>/`, gathers store
inputs, opens preview modal) → **EXECUTOR** (dispatches inside `batchCoordinator.runBatch`).
The controllers already accept **typed request objects** (`ResidentialBuildingRequest`,
`OfficeBuildingRequest`, `HouseLayoutRequest`/`HouseExecuteInput`,
`ApartmentGenerateLayoutPayload`). **A chat GenerationRequest adapter needs a mapper into
these five request types + a headless variant of the modal step — not new engine plumbing.**

## 1. Per-generator facts

| Generator | Executor | Input | Undo | Headless? | LLM? |
|---|---|---|---|---|---|
| Apartment | `ApartmentLayoutExecutor.ts:57` | `ApartmentGenerateLayoutPayload` via `gatherLayoutPayload` (store-derived); event carries only `{optionIndex}` | **≥2 undo units** (wall batch, then openings/boundaries/rooms) + naming — does NOT use beginGenerationBatch | `triggerApartmentLayout(runtime, programOverride)` but always opens modal | **LLM-first** (haiku, `generate.ts:29`), D-TGL fallback (`proceduralFallback` opt-in `register.ts:126`) |
| House | `HouseLayoutExecutor.ts:329` | `HouseExecuteInput` (`:301-327`: storeyCount, roofKind, program, perStoreyPrograms) | **One composite legacy entry** via `beginBuildingGeneration('house')` `:1321` + N bus batches | **Best in class**: `generateHouseFromBoundary(runtime, n, opts)` (`houseFromBoundary.ts:77`), still modal-ending | Deterministic (`houseOrchestrator.ts`) |
| Office | `OfficeBuildingExecutor.ts:207` | `OfficeBuildingRequest` (`OfficeBuildingController.ts:35`); engine takes circle (centroid+fit-radius from parcel) | One composite (`:380`) + N bus batches | Yes — `generateOfficeBuilding(null, {})` (AIPanel `:210`) | Deterministic |
| Residential | `ResidentialBuildingExecutor.ts:214` | `ResidentialBuildingRequest` (`:52-85`, incl. `footprint`, typology mix T1–T4); **pure brief mapper `residentialRequestFromBrief(md, footprint)` (`residentialFromBoundary.ts:97`)** — THE chat-adapter template | One composite (`:588`) + N bus batches | Yes, brief-driven; flag-gated console | Deterministic |
| Ceiling (D-CE) | `CeilingLayoutExecutor.ts:70` | zero-payload event; reads stores | **ONE undo** (`:198`, ceiling.batch.create) | `triggerCeilingLayout()` / emit event | Deterministic |
| Furnish (D-FLE) | `FurnishLayoutExecutor.ts:144` | `{levelId?}`; consumes cached subZones | **ONE undo** (`:499`) | emit `furnish.layout-execute`; all-floors driver exists | Deterministic |
| Lighting (D-LE) | `LightingLayoutExecutor.ts:51` | event | ONE undo (`:162`) | `pryzmLightAllRooms()` | Deterministic |
| Floor finish | `floorLayoutTrigger.ts:93` | auto-chained | — | `pryzmFloorAllRooms()` | Deterministic |

**The auto-chain (one intent, not four):** `apartment.layout-executed` → floor + ceiling →
`ceiling.layout-executed` → furnish → `furnish.layout-executed` → lighting. Chat must emit ONE
`apartment.layout-execute` for "a furnished apartment" or downstream stages double-fire.

## 2. ai-host stack facts

- **WorkflowRegistry**: cost ceiling $0.18 enforced at registration; invoked via
  `AiPlane.submit({workflow: 'apartment-layout-generate', …})` — **only the apartment
  workflow is registered**; house/office/residential bypass the registry (inconsistency).
- **`executePlan.buildLayoutCommands(option, opts, mintId)` is PURE** — returns
  `{wallBatch, wallIds, openingCommands, boundaryCommands, roomCommands, warnings}` before
  any dispatch → **the ready-made preview seam** ("this will create 47 walls, 12 doors,
  9 rooms") for both chat cards and the E-class preview blocker.
- Engine honesty already structured (must be piped into chat replies): bedroom
  auto-iteration (`generate.ts:298-334`), office storey auto-fit
  (`requestedStories`+`autoFit`), per-cell `PlacedApartment.status:'rejected'`+reason.
- `generative/LayoutGenerator.ts` (seeded 10-variant solver) — **no live call site; dormant**.
- `Generate3Options` (LLM fan-out, $0.15) and `PlanCritique` (LLM, diagnostic-only,
  never mutates) are the LLM workflow precedents.

## 3. TypologyPipeline — NOT wired to generation

`PipelineRouter.dispatch` exists with a 7-stage contract, but the packs' generative stages
are **stubs** (`typology-pack-apartment/.../generative.ts:20-43` delegates by name), and
**apps/editor never imports PipelineRouter** — editor consumers use it only for typology
selection/brief capture (TypologyPickerPanel, RACChatbotPanel). The real dispatcher is
`resolveGenerateRoute(typologyId)` (`OnboardingStepController.ts:2958-2981`), unit-tested.
**Do not build the chat adapter on TypologyPipeline; reuse resolveGenerateRoute.**

## 4. buildingGenerationLifecycle — the reusable generation bracket

`beginBuildingGeneration(reason, opts)` / `endBuildingGeneration()`
(`buildingGenerationLifecycle.ts:256/:293`) owns: WebGPU→WebGL proactive swap, one loading
overlay, `__pryzmBuildingGenActive` flag, **`commandManager.beginGenerationBatch()` undo
coalescing**, shadow-pass suppression; settle/lease semantics (6 s quiet, 20 s grace,
6 min cap; mutually exclusive generations). **Any chat-driven generation MUST open this
lease.** Callers today: house/office/residential only — the apartment path's ≥3 undo units
are a pre-existing rough edge.

## 5. Envelope/boundary flow (compliance seam)

`siteModelStore.getParcelBoundary()` → **`resolveBuildableFootprint(raw)`
(`siteDispatch.ts:872`)** → `{polygon, source:'envelope'|'parcel', maxHeightM}` — returns
the C58 inset ring when cached ("compliant by construction"). ⚠ `maxHeightM` is
**enforced by NO generator today** — a chat floor-count is the natural first check.
⚠ `isZoningResponseStale` (`:910`, L-644) guards a zoning-fetch race chat inherits.
Apartment/house consume SHELL WALLS (`facadeOrientationService.isExterior`), not the
envelope; residential/office take the footprint directly.

## 6. E-class bulk generators

`wall.create-on-all-slabs` / `slab.create-on-all-floors` / `curtain-wall.create-on-all-slabs`
— commandManager bridges (`affectedStores: []`, undo in legacy Command). Blocker =
preview-before-execute; counts are knowable pre-dispatch from the stores, and the
ToolsAreaLayout call site already passes a de-facto single-slab `slabId` scoping
(`ToolsAreaLayout.ts:154,194`) — the safe chat variant.

## 7. Level duplication — SHIPPED command, ZERO working UI ★

`DuplicateFloorPlanCommand` (`packages/command-registry/src/levels/`): payload
`{sourceLevelId, targetLevelIds[]}`; clones walls+openings+doors+windows, slabs (holes),
columns, furniture; elevation-shifted; **deterministic dup-ids (redo-idempotent)**; full
undo; validated. Bus route `level.duplicate-floor-plan` (bridge). UI: a DISABLED batch
catalogue leaf ("Needs a target-level picker"). **Not cloned: rooms, room-bounding lines,
ceilings, roofs, stairs, curtain walls, lighting** → duplicated floors need re-detect +
(optionally) the ceiling/furnish chain. **Highest value-to-effort chat win in the map:
its B-class blocker (a target-level picker) is exactly what conversation does natively.**

## 8. Chat-adapter recommendations (R1–R9, adopted into the assessment)

R1 model on `residentialRequestFromBrief`; R2 discriminated `GenerationRequest` union +
reuse `resolveGenerateRoute`; R3 headless/chat-card variant of the option modal (card
models exist: `houseCardModel.ts:111`, `layoutThumbnail.ts`); R4 always
`beginBuildingGeneration` (extend to apartment path); R5 `buildLayoutCommands` as the
preview seam; **R6 ship level-duplication first**; R7 auto-chain = one intent; R8 pipe
engine honesty strings into replies; R9 enforce `maxHeightM`, treat LayoutGenerator as
dormant. `pryzmShowApartmentHelp()` (`apartmentLayoutTrigger.ts:84-104`) is a ready-made
tool catalogue.
