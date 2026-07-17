# Residential Building (Multi-Family) — END-TO-END FLOW PARITY PLAN

> **Status**: PLAN (no production source code changed by this doc) · **Date**: 2026-06-23
> **Author**: flow-parity audit
> **Scope**: make the **"Residential building — multi-family"** typology travel the *same guided
> onboarding flow* the proven HOUSE typology travels today — New-Project modal → BUILDING TYPE →
> "Create & guide me" → guided "Set up your project" wizard (location → draw boundary → confirm →
> generate) → a per-floor PREVIEW modal → Build — by **swapping the house generator for the
> residential orchestrator and the house preview for the residential preview** at each seam.
>
> **Companion docs (read these first / cross-linked):**
> - [`residential-building-multi-family-audit-and-plan.md`](./residential-building-multi-family-audit-and-plan.md) — the
>   engine/orchestration reuse map + 9 slices + risk register (the *generator* side).
> - [`residential-building-implementation-tracker.md`](./residential-building-implementation-tracker.md) — the living
>   P0–P10 phase tracker for the *engine + element + executor* (the orchestrator, packer,
>   plate-partition, per-cell D-TGL, lift element are mostly **DONE worktree-green** there).
>
> **What THIS doc adds that those two do not.** The two companion docs cover the *generator* and the
> *editor build seam* exhaustively. They are *light* on the **onboarding-flow seams** — the New-Project
> modal dropdown, the `_typologyForProjectType` mapping, the `GENERATOR_READY_TYPOLOGIES` gate, the
> wizard typology SWITCH POINT, and the boundary→generator→preview hand-off. This doc audits exactly
> those seams (Part 1), reviews the residential equivalent at each (Part 2), and plans the wiring to
> close them (Part 3). It is the **flow-parity** companion to the engine-parity tracker.
>
> **Honesty flags** (things determined from code vs. not): everything in Parts 1–2 is grounded in the
> files cited (file:symbol). Where a claim could not be verified from the code alone (e.g. runtime
> browser behaviour, whether the gated executor builds correctly in 3D), it is marked **UNVERIFIED**.

---

## Part 1 — The HOUSE end-to-end flow seam map (the template to mirror)

Building type **"House — single-family"** (modal value `casa-unifamiliar`) travels this exact chain
from project creation to built geometry. Each seam is **file:symbol — what it does**.

### S1 — New-Project modal + BUILDING TYPE dropdown
- **`apps/editor/src/ui/platform/ProjectHubTemplates.ts:128-166`** — the `#ph-new-type` `<select>` in the
  `#ph-new-modal` modal. The full option list (label → value):
  - Apartment → `apartment`
  - **House — single-family → `casa-unifamiliar`**
  - **Residential building — multi-family → `residential-multifamily`** *(line 143)*
  - Residential — let me choose → `residential`
  - Commercial building — office → `commercial`; Commercial space — retail → `retail`; Pharmacy →
    `pharmacy`; Hotel → `hospitality`; School → `school`; Hospital → `healthcare`; Transport →
    `transport`; Civic → `civic`; Industrial → `industrial`; Mixed Use → `mixed`; Other → `other`.
  - The in-file comment states the doctrine: *Apartment + House are wired end-to-end; every other value
    is captured as metadata + defers to the RAC conversation*.

### S2 — Modal state + button dispatch ("Create & guide me" vs "Skip — blank")
- **`apps/editor/src/ui/platform/ProjectHub.ts:1296-1301`** — reads `#ph-new-name`, `#ph-new-description`,
  `#ph-new-type` (`typeInput.value`) into local state.
- **`ProjectHub.ts:415-419`** — the **"Create & guide me"** button (`#ph-modal-create`) calls
  `handleCreate('guided')`; **"Skip — blank canvas"** (`#ph-modal-create-blank`) calls
  `handleCreate('blank')`; Enter in the name field → `handleCreate('guided')`.
- **`ProjectHub.ts:1282-1344` `handleCreate(mode)`** — `guided` → `callbacks.onStartOnboarding({ name,
  projectType })`; `blank` → legacy immediate `_createViaRuntime(...)`.

### S3 — Building-type → typology mapping (the router)
- **`apps/editor/src/ui/platform/PlatformRouter.ts:554-568` `_typologyForProjectType(projectType, registryHas)`**
  — maps the modal's `projectType` value to a *registered* typology id. **Today the switch only handles
  two values**: `apartment` → `apartment`; `casa-unifamiliar`/`house`/`casa` → `casa-unifamiliar`. Any
  other value (including `residential-multifamily`) returns `undefined` ⇒ no seeded typology.
- **`PlatformRouter.ts:570-649` `showOnboarding(seed)`** — entry from `onStartOnboarding`. Computes
  `seededTypologyId`. For an **authed user with a seeded, generator-ready typology** (line 627) it skips
  the RAC panel and **emits `pryzm:onboarding-brief-ready`** directly with `{ typologyId, metadata }`
  (line 638). Otherwise it opens the `RACChatbotPanel` seeded with the typology.

### S4 — The brief-ready event + bootstrap (RAC→scene router)
- **Event: `pryzm:onboarding-brief-ready`** — the typed runtime event that kicks off generation.
- **`apps/editor/src/ui/onboarding/briefBootstrap.ts:111-142` `installBriefBootstrap(runtime, deps)`** —
  subscribes to the event.
- **`briefBootstrap.ts:147-263` `handleBriefReady(runtime, deps, brief)`** — the gate + orchestrator:
  - **`briefBootstrap.ts:171` `GENERATOR_READY_TYPOLOGIES = new Set(['apartment','casa-unifamiliar'])`**
    — the typology gate. Anything not in this set logs *"not yet auto-wired"* and bails (line 172-179).
  - `setActiveBrief(...)` (line 192); resolves `projectName`/`address` from `brief.metadata`;
    `deps.createAndOpenProject(projectName)` (line 262); arms a one-shot `pryzm-project-loaded` listener
    (line 213) which then calls `startOnboardingStepFlow({ runtime, seedAddress, typologyId, briefMetadata })`
    (line 229-241).

### S5 — The guided "Set up your project" wizard (STEP N OF 4)
- **`apps/editor/src/ui/onboarding/OnboardingStepController.ts:119-125` `startOnboardingStepFlow(opts)`** —
  instantiates the controller and `.start()`s it. Opts carry `typologyId`, `seedAddress`, `briefMetadata`.
- **`OnboardingStepController.ts:247` step indicator** — renders **"Step N of 4 · {label}"**. Steps:
  1. **Step 1 of 4 · Location** — `renderLocationStep()` (≈ line 298) — "Where's your project?" (find / skip).
  2. **Step 2 of 4 · Your plot** — `renderSiteStep()` (≈ line 408) — "How do you want to set your plot?"
     (default footprint / **draw on map** / back). Drawing switches to a non-blocking presentation.
  3. **Step 3 of 4 · Confirm** — `renderGenerateConfirmStep()` (≈ line 700) — "Generate your {typology} with AI?"
  4. **Step 4 of 4 · Generating** — `renderGeneratingStep()` (≈ line 756) — status only.
- **Typology label resolver (≈ line 161-169)** — `'casa-unifamiliar'` → "house"; `'apartment'` →
  "apartment"; else the id / "design". Drives the typology-aware copy in steps 3 + 4.

### S6 — The wizard typology SWITCH POINT (house vs apartment generator)
- **`OnboardingStepController.ts:841-910` `generateAndFinish()`** — the only step that tears down the 2D
  map and dispatches generation. Contains the **§FUTURE-TYPOLOGY (A.21.j) SWITCH POINT** (line 860-872):
  ```ts
  if (this.typologyId === 'casa-unifamiliar') { await this.generateHouse(); }
  else { await generateApartmentFromBoundary(this.runtime, this.briefMetadata); }
  ```
  After generate it hands the viewport to `pryzmShowSiteResultView('2D')` (dual-pane result view).

### S7 — Boundary → footprint → generator hand-off (house branch)
- **`OnboardingStepController.ts:922-937` `generateHouse()`** — resolves storey count from
  `briefMetadata.floors` (default 2, clamp [1,3]) via `resolveStoreyCount()`, reads the drawn parcel
  footprint via `readParcelFootprint()`, and calls
  `generateHouseFromBoundary(runtime, storeyCount, { footprint })`.
- **Parcel storage / read-back (C19):**
  - **`packages/schemas/src/site/Parcel.ts:27-31` `ParcelBoundary`** — `{ polygon: Point[],
    edgeClassifications[] }` in XZ metres (C19, immutable post-create).
  - **`packages/stores/src/site-commands/siteSetParcelBoundary.ts:35-101` `siteSetParcelBoundary`** —
    the command that commits the drawn polygon (one-shot, validates classifications, computes area).
  - **`packages/stores/src/SiteModelStore.ts:60-65` `getParcelBoundary()`** — reactive read used by the
    generate branch (`OnboardingStepController.readParcelFootprint()` reads through the runtime's
    `siteModelStore`).

### S8 — Draw shell → ShellAnalysis (the generator front door)
- **`apps/editor/src/ui/house-layout/houseFromBoundary.ts:77-146` `generateHouseFromBoundary(runtime,
  storeyCount, opts)`** — draws one `wall.create` per footprint edge, `waitForShell(...)` until the
  exterior walls settle, `gatherLayoutPayload(levelId, programOverride)` → `{ program, constraints,
  weights }`, then opens the preview via `_controller.request(rt, {...})`.
- **`apps/editor/src/ui/house-layout/houseLayoutTrigger.ts:31 `installHouseLayoutConsoleTrigger(runtime)`**
  — also registers `window.pryzmGenerateHouse(...)` / `window.pryzmGenerateHouseFromBoundary(...)`
  console paths that call the same `generateHouseFromBoundary`. Installed from **`AIAreaLayout.ts:203`**.

### S9 — The per-floor PREVIEW modal ("Choose a house layout")
- **`apps/editor/src/ui/house-layout/HouseLayoutController.ts:142,182` `HouseLayoutController.request(runtime,
  req)`** — `analyseActiveShell(ground.id)` → `ShellAnalysis`; `generateHouseLayoutOptions(shell, program,
  constraints, weights, …)` (pure); caches `_regen`; shows the modal with the best variant.
- **`HouseLayoutController._regenerate (≈ :441)`** — §MODAL-DYNAMIC re-run on edited program/storeys.
- **`apps/editor/src/ui/house-layout/HouseLayoutModal.ts:458` + `houseModalHtml.ts:524`** — the modal DOM:
  per-storey tabs (`buildPerStoreyTabsHtml`), per-storey panes (`buildHousePanesHtml`), the "Ground floor /
  First floor" cards rendered via `buildLayoutThumbnailSvg` (ADR-0075 §17.2 faithful render).

### S10 — BUILD command sequence (the executor)
- **`apps/editor/src/ui/house-layout/HouseLayoutController._build(runtime, index) (≈ :604)`** — on the
  user's modal pick, invokes the executor with the chosen variant index.
- **`apps/editor/src/ui/house-layout/HouseLayoutExecutor.ts:334 execute(...)`** — `generateHouseLayout(...)`
  (pure) → mints storeys 1..n (`AddLevelCommand`) + roof level → **ONE `batchCoordinator.runBatch`**
  (`:1280`) emitting `wall.batch.create` + slabs (`_createStorageSlab :2341`) + stair (`_createStair :2373`)
  + stairwell `SlabVoid` + roof (`_createRoof :2907`) → deferred `_finishOpenings` (`:3059`) for doors +
  windows → post-gen chain (`runHousePostGenChain.ts:163/:269`: name → floor/ceiling → furnish → light).

**House seam summary (S1→S10):** modal dropdown → guided-or-blank dispatch → `_typologyForProjectType`
mapping → `pryzm:onboarding-brief-ready` + `GENERATOR_READY_TYPOLOGIES` gate → 4-step wizard →
typology SWITCH POINT → boundary read → `generateHouseFromBoundary` → preview modal → executor ONE-batch
build + post-gen chain.

---

## Part 2 — Residential-building equivalent at each seam (status review)

Read against `apps/editor/src/ui/residential-building/` (Controller / Executor / Modal / trigger /
cardModel / modalHtml), `packages/ai-host/src/workflows/residentialBuilding/` (orchestrator /
apartmentPacker / platePartition / runApartmentCellLayout), the lift element
(`packages/schemas/src/elements/VerticalCirculation.ts`, `packages/geometry-lift/`,
`CreateVerticalCirculationCommand`), and the typology pack
(`packages/typology-pack-residential-building/`).

**Status legend:** **DONE** = exists + wired (worktree-green per the tracker; NOT browser-validated) ·
**IN-PROGRESS** = the concurrent agent `a82b133b` is actively wiring it (building-type→guided-flow→
boundary→preview routing + coordinate-frame test + plate-partition tuning) · **NOT-STARTED** = gap.

### PARITY TABLE

| # | House seam | Residential-building equivalent | Status | File | Notes / gap |
|---|---|---|---|---|---|
| S1 | Modal dropdown option (`casa-unifamiliar`) | `residential-multifamily` option **exists** in the same `<select>` | **DONE** | `ProjectHubTemplates.ts:143` | The option ships today; no code change needed here. |
| S2 | `handleCreate('guided')` → `onStartOnboarding({projectType})` | Same path — typology-agnostic; passes `residential-multifamily` through unchanged | **DONE** | `ProjectHub.ts:1282-1344` | The button/dispatch is generic; it already forwards the value. |
| S3 | `_typologyForProjectType` maps `casa-unifamiliar` | **NO mapping** — `residential-multifamily` falls to `undefined` | **NOT-STARTED** *(agent a82b133b)* | `PlatformRouter.ts:554-568` | **GAP**: needs `else if (v==='residential-multifamily'\|\|v==='residential-building') candidate='residential-building'` AND `registry.has('residential-building')` must be true. The pack id is `residential-building` (per `typology-pack-residential-building/manifest`), so the modal value must map to that id. |
| S4 | `GENERATOR_READY_TYPOLOGIES` includes `casa-unifamiliar` | **NOT in the set** ⇒ `handleBriefReady` bails "not yet auto-wired" | **NOT-STARTED** *(agent a82b133b)* | `briefBootstrap.ts:171` | **GAP**: add `'residential-building'` to the set so the brief-ready handler proceeds to create project + start the wizard. |
| S5 | 4-step wizard (location→plot→confirm→generate) | Same wizard — typology-agnostic steps 1–3; only the label resolver needs the new noun | **DONE (steps) / minor gap (label)** | `OnboardingStepController.ts:119-125,247,~161-169` | Steps reuse as-is. The typology-label map (≈:161-169) returns "design" for an unknown id → confirm/generating copy would read "design", not "residential building". Minor copy gap. |
| S6 | Wizard SWITCH POINT (`if casa-unifamiliar → generateHouse`) | **NO branch** for residential — falls to the `else` (apartment) | **NOT-STARTED** *(agent a82b133b)* | `OnboardingStepController.ts:860-872` | **GAP**: add `else if (this.typologyId==='residential-building') await this.generateResidentialBuilding();` BEFORE the apartment `else`. Without it, picking "Residential building" would (if it reached here) run the *apartment* single-plate generator. |
| S7 | `generateHouse()` reads parcel footprint + calls `generateHouseFromBoundary` | Equivalent method **does not exist** in the controller | **NOT-STARTED** *(agent a82b133b)* | `OnboardingStepController.ts:922-937` | **GAP**: add a `generateResidentialBuilding()` method mirroring `generateHouse()`: read footprint via `readParcelFootprint()`, derive `upperLevels` from `briefMetadata.floors`, derive min/max m² + typologies from the brief, call the residential trigger/controller. Must also **flip the gate** `globalThis.__PRYZM_RESIDENTIAL_BUILDING__` for this path (or route around the gate via the controller directly). |
| S7b | Boundary storage/read (C19 ParcelBoundary, SiteModelStore) | **SHARE** — identical store + read | **DONE** | `Parcel.ts`, `siteSetParcelBoundary.ts`, `SiteModelStore.ts:60-65` | The residential `readActiveFootprint` (Controller:87) reads the wall store AABB; the onboarding path should instead feed the C19 parcel footprint like `generateHouse()` does, for parity. |
| S8 | `generateHouseFromBoundary` (draw shell → payload → preview) | `generateResidentialBuilding` trigger + `ResidentialBuildingController.request` (compute → preview) | **DONE (console) / gap (onboarding draw-shell)** | `residentialBuildingTrigger.ts:73-96`, `ResidentialBuildingController.ts:168-234` | The console entry (`window.pryzmGenerateResidentialBuilding`) is **installed** (`AIAreaLayout.ts:210`, gated OFF). BUT it reads the footprint from an **already-drawn shell** (`readActiveFootprint`) — it does NOT draw the shell from a bare parcel polygon the way `generateHouseFromBoundary` does (one `wall.create` per edge + `waitForShell`). For the onboarding path (draw boundary on map → no walls yet), a draw-shell step or a footprint-only path into the controller is needed. **GAP for the onboarding entry.** |
| S9 | Preview modal "Choose a house layout" (per-storey cards) | "Choose a residential building" modal (per-floor cards) | **DONE** | `ResidentialBuildingModal.ts`, `residentialCardModel.ts`, `residentialModalHtml.ts` | Per-floor cards render each placed apartment via the apartment `buildLayoutThumbnailSvg` + the central core. **UNVERIFIED in-browser** — the per-floor render fidelity (core + corridor + N apt plates composited) has not been browser-confirmed (companion tracker P9.2 is TODO; this Modal predates/parallels it). |
| S10 | `HouseLayoutExecutor` ONE-batch build + post-gen | `ResidentialBuildingExecutor.execute` ONE-batch build | **DONE (code) / UNVERIFIED (3D)** | `ResidentialBuildingExecutor.ts` | Mints levels + per-floor shell + per-apt cell walls (reuses `buildLayoutCommands`) + central core (stair per pair + ONE lift via `CreateVerticalCirculationCommand`) + corridor room-bounding lines + deferred openings, all in one `runBatch`. Calls `nameDetectedRooms`. **NOT browser-validated**; the full post-gen chain (floor/ceiling/furnish/light — house S10) is **not yet wired per-level** (tracker P9.1 TODO). |
| — | Engine: orchestrator + packer + plate-partition + per-cell D-TGL | `orchestrateResidentialBuilding`, `packApartments`, `partitionLevelPlate`, `runApartmentCellLayout` | **DONE (pure, tests green)** | `packages/ai-host/src/workflows/residentialBuilding/*` | All pure, exported from `@pryzm/ai-host` index (verified `index.ts:358,366,383`); 48 resi tests green per tracker. Plate-partition is a **rectangular-plate stub**; the high-risk Steiner corridor spine is tracker **P8 (TODO, gated)**. Plate-partition tuning is **IN-PROGRESS** (agent a82b133b). |
| — | Lift element (NEW category, no house equivalent) | `VerticalCirculation` schema + `geometry-lift` + `CreateVerticalCirculationCommand` | **DONE (data+command) / gap (plugin/CREATE-panel/IFC)** | `packages/schemas/src/elements/VerticalCirculation.ts`, `packages/geometry-lift/`, `command-registry/src/verticalCirculation/` | Schema + stores + create command DONE (tracker P1.B/P2). Plugin tool, CREATE-panel category, IFC export/reader are **NOT-STARTED** (tracker P2.2/P2.4/P2.5). Not on the onboarding critical path but needed for hand-placement + IFC round-trip. |
| — | Typology pack registration (C50) | `residential-building` pack registered in `composeRuntime` | **DONE but GATED-OFF** | `packages/typology-pack-residential-building/`, `composeRuntime.ts` (gated) | Registers ONLY when `globalThis.__PRYZM_RESIDENTIAL_BUILDING__===true` (tracker P1.A.4). **This is why S3's `registry.has('residential-building')` returns false in production today** — the pack is not registered unless the flag is set. The flag must be flipped (or the registration ungated behind a finer flag) for the modal mapping to resolve. |

### The five concrete answers the brief asked for

1. **Does the building-type dropdown route "Residential building — multi-family" through the SAME wizard
   as house?** — **NO (gap).** The option exists (S1) and the guided dispatch is generic (S2), but
   `_typologyForProjectType` (S3) does not map `residential-multifamily`, and `GENERATOR_READY_TYPOLOGIES`
   (S4) does not include it. So today the value is captured as metadata and **defers to the RAC
   conversation** — it never reaches the wizard's generate step as a residential build.
2. **Is there a residential program step (floors / min-max m² / T1–T4)?** — **PARTIAL.** The pack's
   `briefSchema` declares the fields (tracker P1.A.3: `minApartmentAreaM2`, `maxApartmentAreaM2`,
   `typologies` multiselect, `levels` stepper, `commercialGroundFloor` toggle), and the
   `ResidentialBuildingRequest` type carries them — but **no wizard step or modal form collects them in
   the guided flow**. The console trigger fills defaults (T2+T3, 4 floors). **GAP**: the brief→request
   wiring (read `briefMetadata` → `ResidentialBuildingRequest`) does not exist in the onboarding path.
3. **Does the boundary→footprint hand-off feed the residential orchestrator?** — **PARTIAL.** The C19
   parcel store is shared and `ResidentialBuildingController.readActiveFootprint` reads a footprint — but
   it reads from an **already-drawn wall shell** (AABB), not from the bare parcel polygon the onboarding
   draw-step produces. The house path draws the shell first (`generateHouseFromBoundary`); the residential
   onboarding path has **no draw-shell step** and **no `generateResidentialBuilding()` controller method**
   (S6/S7 gaps).
4. **Does the preview render per-floor like the house?** — **YES (code) / UNVERIFIED (browser).** The
   `ResidentialBuildingModal` renders one card per floor with per-apartment thumbnails + the central core
   (S9). Browser fidelity is unconfirmed (tracker P9.2 TODO).
5. **Is the Build command sequence wired (core / lift / corridors / apartments)?** — **YES (code) /
   UNVERIFIED (3D).** `ResidentialBuildingExecutor` mints levels + per-floor shell + per-apt cells (reusing
   `buildLayoutCommands`) + central core (stair + ONE lift) + corridor bounding-lines + deferred openings
   in one `runBatch` (S10). Not browser-validated; per-level post-gen chain (floor/ceiling/furnish/light)
   not yet wired.

---

## Part 3 — Phased plan to reach full flow parity

Ordered by **dependency** (each phase unblocks the next). The engine/element/executor work is largely
**DONE** in the companion tracker (P1–P7); this plan focuses on the **onboarding-flow wiring** that makes
the proven house chain carry the residential typology. The concurrent agent **`a82b133b`** is covering the
routing + coordinate-frame test + plate-partition tuning — those rows are marked **IN-PROGRESS (a82b133b)**.

> **Status legend (plan rows):** TODO · WIP · DONE · **a82b133b** (owned by the concurrent agent).

### Phase F0 — Pack registration unblock (prerequisite)
*Without a registered pack, `registry.has('residential-building')` is false and the modal mapping cannot
resolve. Everything downstream depends on this.*

| id | task | status | file | notes |
|---|---|---|---|---|
| F0.1 | Decide the production gate: keep `__PRYZM_RESIDENTIAL_BUILDING__` OFF (console-only) vs flip ON for guided flow | TODO | `composeRuntime.ts` (gated register), `residentialBuildingTrigger.ts:47` | Founder decision. Recommend a **dedicated finer flag** so the guided flow can be tested without ungating everything. The whole feature must stay byte-identical for existing users until validated. |
| F0.2 | Ensure the pack id used by the mapping == the registered manifest id (`residential-building`) | TODO | `typology-pack-residential-building/manifest`, `PlatformRouter.ts:554` | The MODAL value is `residential-multifamily`; the PACK id is `residential-building`. The mapping must bridge the two strings. |

### Phase F1 — Building-type → guided-flow routing  *(IN-PROGRESS — a82b133b)*
*Mirror S3 + S4 + S5-label so the modal value reaches the wizard as a residential build.*

| id | task | status | file | notes |
|---|---|---|---|---|
| F1.1 | Map `residential-multifamily` → `residential-building` in `_typologyForProjectType` | **a82b133b** | `PlatformRouter.ts:554-568` | Add the `else if` + `registry.has` guard (S3). |
| F1.2 | Add `'residential-building'` to `GENERATOR_READY_TYPOLOGIES` | **a82b133b** | `briefBootstrap.ts:171` | So `handleBriefReady` proceeds instead of bailing (S4). |
| F1.3 | Add the residential noun to the typology-label resolver | TODO | `OnboardingStepController.ts:~161-169` | "residential building" for confirm/generating copy (S5). |
| F1.4 | Thread the residential brief fields (floors / min-max m² / T1–T4 / commercial) through `briefMetadata` | TODO | `briefBootstrap.ts:191-210`, `OnboardingStepController.ts` | Brief→request mapping (Part 2 answer #2). May need a residential program micro-step or a default-then-edit-in-modal posture (like the house). |

### Phase F2 — Wizard SWITCH POINT + boundary hand-off  *(IN-PROGRESS — a82b133b)*
*Mirror S6 + S7 so generate dispatches to the residential generator on the drawn boundary.*

| id | task | status | file | notes |
|---|---|---|---|---|
| F2.1 | Add the residential branch to `generateAndFinish()` SWITCH POINT | **a82b133b** | `OnboardingStepController.ts:860-872` | `else if (typologyId==='residential-building') await this.generateResidentialBuilding();` BEFORE the apartment `else`. |
| F2.2 | New `generateResidentialBuilding()` controller method (mirror `generateHouse()`) | **a82b133b** | `OnboardingStepController.ts` (new method near :922) | Read footprint via `readParcelFootprint()`; derive `upperLevels`/min-max/typologies from `briefMetadata`; call the residential controller; flip/honour the feature gate for this path. |
| F2.3 | Onboarding draw-shell path: draw the shell from the bare parcel polygon before computing (mirror `generateHouseFromBoundary`'s `wall.create` per edge + `waitForShell`) OR pass footprint-only into the controller | TODO | `ResidentialBuildingController.ts:184-234`, new helper | The console path assumes an already-drawn shell; the onboarding path produces only a parcel polygon (S8 gap). Add a footprint→shell draw, or a footprint-direct orchestrator call that does not need wall reads. |
| F2.4 | Coordinate-frame parity test (parcel polygon XZ ↔ orchestrator footprint ↔ executed walls) | **a82b133b** | new test under `apps/editor/__tests__/` or resi workflow tests | De-risks R-coordinate-frame (see Risks). Asserts in-bounds geometry. |

### Phase F3 — Preview + build verification (browser)
*S9 + S10 exist in code; this phase validates them on the real drawn boundary.*

| id | task | status | file | notes |
|---|---|---|---|---|
| F3.1 | Browser-validate the per-floor preview modal renders core + corridor + N apartments faithfully | TODO | `ResidentialBuildingModal.ts` + `residentialCardModel.ts` | tracker P9.2; `§DIAG-PARITY` per level/cell. |
| F3.2 | Browser-validate the executor builds in-bounds geometry (levels + core + lift + corridors + apartments) in one undo | TODO | `ResidentialBuildingExecutor.ts` | tracker P3.3/P9; confirm `§DIAG-PARITY` clean. |
| F3.3 | Wire the per-level post-gen chain (name → floor/ceiling → furnish → light) | TODO | reuse `runHousePostGenChain.ts:163/:269` | tracker P9.1. |

### Phase F4 — Engine hardening (mostly tracker-owned)
*These are tracked in the companion docs; listed here for dependency completeness.*

| id | task | status | file | notes |
|---|---|---|---|---|
| F4.1 | Plate-partition tuning (rectangular-plate stub → robustness) | **a82b133b** | `platePartition.ts` | The concurrent agent is tuning this. |
| F4.2 | The corridor Steiner spine (reach every apartment door) | TODO (tracker P8, GATED) | `deriveCorridorSpine.ts` generalised | HIGH-RISK, isolated, default-OFF (the most-reverted code class). |
| F4.3 | Lift plugin tool + CREATE-panel category + IFC export/reader | TODO (tracker P2.2/P2.4/P2.5) | `plugins/lift/`, `CreatePanelLayout.ts`, `IfcModelBuilder.ts` | Off the onboarding critical path; needed for hand-placement + IFC round-trip. |

---

## Acceptance criteria — the concrete click-through that must work

A logged-in user must be able to:

1. Open the New-Project modal, set a name, choose **"Residential building — multi-family"**, click
   **"Create & guide me"**. *(S1/S2 — DONE)*
2. The project is created and the **guided "Set up your project" wizard** opens at **Step 1 of 4 ·
   Location** with the copy referencing "residential building" (not "design" / "apartment"). *(F1.1–F1.4)*
3. **Step 1** find/enter a location; **Step 2** draw a boundary polygon on the map; **Step 3** confirm
   "Generate your residential building with AI?". *(S5 — DONE; copy via F1.3)*
4. On Generate, the wizard SWITCH POINT routes to the **residential** generator (not apartment), reads the
   drawn parcel footprint, derives floors + min/max m² + enabled typologies from the brief, and computes
   the building. *(F2.1–F2.3)*
5. A **per-floor PREVIEW modal** opens showing, per floor: the **central core** (stair + lift), the
   **public corridor**, and **N apartment plates** labelled with typology + area. *(S9 — DONE in code;
   F3.1 browser-validate)*
6. On **Build**, ONE undo unit produces **in-bounds** geometry: N levels, a centred core (stair per pair +
   one full-height lift), per-floor corridor, per-apartment walls/doors/windows/rooms; the result view
   lands on the 2D plan with a 3D toggle. *(S10 — DONE in code; F3.2 browser-validate; F3.3 post-gen)*
7. Existing **House** and **Apartment** flows remain **byte-identical** (additive routing only).

---

## Known risks + how this plan de-risks each

| Risk | Why it bites | De-risk |
|---|---|---|
| **R-coord — coordinate-frame mismatch** (parcel polygon XZ ↔ orchestrator footprint ↔ executed walls drift out of bounds) | The house path goes parcel→draw-shell→`analyseShell` (principal-axis frame); the residential controller's `readActiveFootprint` takes a raw AABB of existing walls — a *different* footprint source. Feeding the onboarding parcel polygon directly risks a frame mismatch. | **F2.3** unifies the footprint source (draw the shell first OR pass the parcel footprint through the SAME frame the orchestrator expects); **F2.4** adds an explicit coordinate-frame parity test (agent a82b133b). Assert executed walls ⊆ parcel polygon. |
| **R-softfail — silent rejection** (orchestrator returns `status:'rejected'` for an infeasible plate; the user sees nothing useful) | `orchestrateResidentialBuilding` + `packApartments` + `partitionLevelPlate` all C50 soft-fail (never throw). The Controller surfaces the reason as a toast (`ResidentialBuildingController.ts:212-219`), but the *onboarding* path must propagate the same toast + not dead-end the wizard. | F2.2 routes through the Controller, which already toasts the reason; ensure `generateAndFinish`'s catch + the "Generation failed" toast (`OnboardingStepController.ts:904-909`) covers the rejection too. Test an infeasible plate (tiny plot / huge min m²). |
| **R-preview — preview ≠ execution** (ADR-0075; a floor looks right in the modal, wrong in 3D) | The modal renders thumbnails; the executor builds independently. Two code paths can diverge. | `§DIAG-PARITY` per level/cell (tracker R2); **F3.1 + F3.2** browser-validate the SAME result object drives both modal and executor (the Controller passes one `ResidentialBuildingResult` to both). |
| **R-handoff — the preview hand-off needs browser verification** | The whole onboarding→preview→build chain has only ever run in tests, never end-to-end in the browser (the feature is gated OFF). | **F3** is an explicit browser-validation phase; the feature stays gated until F3 passes. Flip the flag only after the click-through (Acceptance) is confirmed. |
| **R-corridor — corridor fails to reach every apartment** (the §18/§19 spine trap) | The Steiner spine is the single most-reverted code class (house L-carve reverted 4×). | Isolated to **F4.2 / tracker P8**, default-OFF, test-first, fresh context. The rectangular-plate stub (current) gives a double-loaded corridor that straddles the core — adequate for the v1 click-through on a rectangular plate; the general spine is a later gated slice. |
| **R-gate — pack not registered in production** | The pack registers only when `__PRYZM_RESIDENTIAL_BUILDING__===true`, so `registry.has('residential-building')` is false in prod ⇒ the F1.1 mapping returns undefined even after wiring. | **F0.1/F0.2** resolve the gate strategy (recommend a finer flag) BEFORE F1, so the mapping can resolve in a test build without ungating for all users. |

---

## Things I could not determine from the code (flagged honest)

- **Browser behaviour of the gated build** — whether `ResidentialBuildingExecutor` produces correct,
  in-bounds 3D geometry has NOT been verified; the feature is gated OFF and only tested at the pure layer.
- **The exact line numbers in `OnboardingStepController.ts`** for `renderLocationStep` / `renderSiteStep`
  / the typology-label map are reported as approximate (≈) where the explore pass rounded; the SWITCH
  POINT (`:860-872`) and `generateHouse()` (`:922-937`) were read directly and are exact.
- **Whether agent `a82b133b` has already landed any of F1/F2** — this audit reads the worktree at a
  snapshot; the routing rows are marked IN-PROGRESS per the task brief, but the live state of that agent's
  edits was not re-checked at write time. Confirm against the latest tree before implementing F1/F2 to
  avoid a collision.
- **The residential brief→request collection UX** — the pack declares a `briefSchema`, but whether the
  guided flow will collect those fields via a wizard micro-step, the RAC conversation, or a
  default-then-edit-in-modal posture (the house pattern) is a **design decision not yet made in code**.
