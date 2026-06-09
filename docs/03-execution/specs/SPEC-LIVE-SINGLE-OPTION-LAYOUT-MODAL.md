# SPEC-LIVE-SINGLE-OPTION-LAYOUT-MODAL — one best layout, living graph, live slider/graph editing

**Status:** DRAFT (2026-06-09) — founder feedback, house-layout modal.
**Owner:** Generative design / editor UI · `@MarkHanoi`.
**Governs:** the **"Choose a house layout"** modal (`apps/editor/src/ui/house-layout/*`) —
its transition from an N-variant card grid to a **single best option** preview that pairs
the **plan thumbnail** with the **living graph** (room-adjacency bubble diagram), at **better
visibility** (bigger plan, well-defined perimeter shell, windows clamped to the shell), and
that **re-renders LIVE** when the user changes a **brief slider** OR edits the **living graph**
(room area / type) — debounced re-run of the existing deterministic engine.

**Conflict-resolution order (strongest first):**
[product-vision](../../01-strategy/product-vision.md) →
[architecture](../../01-strategy/architecture.md) →
[C52-EDITABLE-BUILDING-GRAPH](../../02-decisions/contracts/C52-EDITABLE-BUILDING-GRAPH.md) →
[C50-TYPOLOGY-PIPELINE](../../02-decisions/contracts/C50-TYPOLOGY-PIPELINE.md) →
[ADR-0061 building-graph bidirectional edit](../../02-decisions/adrs/0061-building-graph-bidirectional-edit-substrate.md) →
[ADR-0060 living design parameters](../../02-decisions/adrs/0060-living-design-parameters.md) →
[ADR-0056 typology-declared brief](../../02-decisions/adrs/0056-typology-declared-brief.md) →
this SPEC.

Sibling references:
[SPEC-LIVING-DESIGN-PARAMETERS](./SPEC-LIVING-DESIGN-PARAMETERS.md) (the GLOBAL slider seam this modal reuses),
[SPEC-LIVING-BUILDING-GRAPH](./SPEC-LIVING-BUILDING-GRAPH.md) (the editable graph overlay this modal embeds the renderer of),
[SPEC-CASA-UNIFAMILIAR-TYPOLOGY](./SPEC-CASA-UNIFAMILIAR-TYPOLOGY.md) (the multi-storey house engine),
[SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE](./SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE.md) (the engine re-run),
[SPEC-GENERATE-3-OPTIONS-WORKFLOW](./SPEC-47-GENERATE-3-OPTIONS-WORKFLOW.md) (the N-option predecessor this supersedes for the house modal).

---

## §1 — The founder directive (verbatim)

> *"the modal preview image is not accurate — the wall perimeter shell should be better
> defined — it appears like windows going out of the perimeter shell already on the preview —
> let's do something — i want only ONE option in the modal preview + living graph — but better
> visibility — the user could change data in slider + living graph and the modal preview of the
> floor plan should change LIVE accordingly. analyse this implementation — review it — document
> it in the master execution plan and implement it."*

Four requirements, decomposed:

1. **R1 — ONE option only.** The modal shows the single best whole-house layout, not 3 variant cards.
2. **R2 — Living graph included.** The room-adjacency bubble diagram sits alongside the plan.
3. **R3 — Better visibility.** Bigger/clearer plan, a well-defined perimeter shell ring, windows
   drawn **on** the shell (not poking out).
4. **R4 — LIVE editing.** Changing a brief slider OR editing the living graph (room area/type)
   re-renders the plan + graph live (debounced re-generate).

---

## §2 — How the modal works TODAY (as-is, verified 2026-06-09)

### §2.1 — The house modal stack

| File | Role | Key fact |
|---|---|---|
| `apps/editor/src/ui/house-layout/HouseLayoutController.ts` | wiring controller | Computes `HOUSE_OPTION_COUNT = 3` variants (`:42`) via `generateHouseLayoutOptions(...)` (`:208`), opens the modal with **all 3** (`:175`). Caches a `_regen` context (`:116`) so the inline form can re-run the engine (`:231 _regenerate`). On pick → `executor.execute(... variantIndex ...)` (`:255`). |
| `apps/editor/src/ui/house-layout/HouseLayoutModal.ts` | DOM shell | `show(options, cb, formState)` (`:89`) renders **one card per variant** (`:192 _cards`). Already has the §MODAL-DYNAMIC inline program-edit form + 250 ms debounce (`:43,:214`), `refresh()` (`:150`), `setBusy()` (`:169`). `_storeyThumbs` (`:196`) builds per-storey plan SVGs sharing one footprint bound (§SHARED-FLOOR-BOUNDS, `:50 unionStoreyBoundsMm`). **No bubble graph.** |
| `apps/editor/src/ui/house-layout/houseModalHtml.ts` | pure HTML | `buildHouseModalHtml` (`:169`) = header + program form (`buildHouseProgramEditFormHtml :80`, has Floors/Bedrooms/Bathrooms + 3 checkboxes + 4 weight sliders `WEIGHT_SLIDERS :61`) + occupancy legend + card grid (`buildHouseCardGridHtml :152`). `cardHtml :124` renders a per-storey strip of plan thumbnails only — **no Plan/Graph toggle, no bubble graph**. |
| `apps/editor/src/ui/house-layout/houseCardModel.ts` | pure view-model | `buildHouseCardModel :96` → `{ overall, storeys[] }`, each storey carries its `ScoredLayoutOption` (`:36`). |
| `apps/editor/src/ui/house-layout/houseLayoutTrigger.ts` | console trigger | `pryzmGenerateHouse` / `…FromBoundary` → `houseFromBoundary.ts` → `_controller.request(...)`. |

### §2.2 — The renderers (shared with the apartment modal)

- `apps/editor/src/ui/apartment-layout/layoutThumbnail.ts` — `buildLayoutThumbnailSvg(option, opts)`
  (`:137`). Default size **320×240** (`:63`). Fits to room-polygon union or wall endpoints
  (`:160`), or to an externally-supplied `boundsMm` (`:165`, §SHARED-FLOOR-BOUNDS). Renders room
  fills, labels, walls, doors (swing arcs), perimeter window/door symbols (`:288 renderSpanSymbol`),
  engine-emitted `option.windows` (`:317`), a scale bar (`:341`).
  **Gap (R3):** there is **no dedicated perimeter-shell stroke** — the outer boundary is only
  implied by the per-wall `<line>` strokes (`:242`). Window symbols are positioned from world-XZ
  spans (`windowSpansWorld`) or `option.windows.offset/width` and **are not clamped to the host
  wall extent** — a span slightly off the wall reads as "poking out of the shell".
- `apps/editor/src/ui/apartment-layout/layoutBubbleGraph.ts` — `buildLayoutBubbleGraphSvg(option, opts)`
  (`:119`). Pure SVG: one occupancy-coloured circle per room at its centroid (`:96 roomCentreMm`),
  one line per `adjacentTo` edge (`:202`), short labels. Default 160×160 (`:33`). **Already exists,
  already used by the apartment modal — the house modal just doesn't call it.**

### §2.3 — The generation entry the modal calls

`packages/ai-host/src/workflows/houseLayout/houseOrchestrator.ts`:
- `generateHouseLayoutOptions(shell, program, constraints, weights, opts, count=3)` (`:237`) →
  `ScoredHouseLayoutOption[]`, best-first by aggregate score (`:295`). **Variant 0 is the single
  best** (the A.21.D18 equality invariant, `:288`): variant 0 selects the max-`overall` option on
  every storey (`bestStoreyOptionIndex :127`).
- `generateHouseLayout(...)` (`:180`) → the single `HouseLayoutResult` that is **byte-identical to
  `generateHouseLayoutOptions(...)[0].result`** (the equality invariant, `:191`). Pure, deterministic,
  L2, span-free (spans live at the AiPlane boundary, `:12`).

**Key consequence for R1:** "show only the best option" = take `generateHouseLayoutOptions(...)[0]`
(or call `generateHouseLayout` and wrap it as a one-element `ScoredHouseLayoutOption[]`). No engine
change needed; the best option already sorts first.

---

## §3 — Does a reusable LIVE-edit loop already exist? YES (two halves)

### §3.1 — Slider → re-render (modal-internal) — ALREADY IN THE HOUSE MODAL

`HouseLayoutModal` + `HouseLayoutController` **already implement R4 for sliders**:

1. The form fires `input`/`change` → `_scheduleProgramChange(form)` (`HouseLayoutModal.ts:214`),
   debounced 250 ms.
2. The debounce reads the form into a `HouseProgramFormState` (`:227`), calls `setBusy(true)`
   (`:219`) + `onProgramChange(state)`.
3. The controller's `_regenerate(state)` (`HouseLayoutController.ts:231`) re-runs the **PURE**
   `generateHouseLayoutOptions(...)` synchronously against the cached `_regen.shell` and calls
   `modal.refresh(variants)` (`:240`).

This is the GLOBAL-slider seam of [ADR-0060](../../02-decisions/adrs/0060-living-design-parameters.md):
the house engine is an **offline deterministic L2 call** (no async relay), so the re-run is
synchronous and fast — **this is why the house live-edit can be even simpler than the apartment's.**
We REUSE this loop verbatim; the work is to (a) collapse the refresh to one card, (b) add the graph,
(c) widen the plan, (d) add brief sliders to the form.

### §3.2 — Graph edit → re-generate (apartment substrate) — REUSE, do not reinvent

The apartment editable Living Graph (A.26 / C52 / ADR-0061) is the canonical
**"edit a node → re-run the engine → re-project the graph"** loop. Quoting the substrate:

- `apps/editor/src/ui/apartment-layout/activeRoomAreaOverrides.ts` — a session stash of
  `{ name → m² }`: `setRoomAreaOverride(name, m²)` (`:30`), `getRoomAreaOverrides()` (`:47`).
  Empty ⇒ no override ⇒ byte-identical baseline (C52 **I2**). Header (`:1`): *"the card writes the
  per-room area override HERE, and `gatherLayoutPayload` reads THIS stash … The card then fires the
  SAME debounced `triggerApartmentLayout` re-generate the sliders use."*
- `activeRoomTypeOverrides.ts` — the sibling `{ name → RoomType }` stash (C52 **E2**).
- `apps/editor/src/ui/living-graph/LivingGraphOverlay.ts` — the overlay wires it end-to-end:
  node click → inspect card → AREA/TYPE edit → `setRoomAreaOverride` / `setRoomTypeOverride`
  (`:36–48`) → debounced `triggerApartmentLayout` (`:49`, `areaRegenTimer :218`) → a
  **"Regenerating layout…"** indicator (§DEMO-3, `regenToastEl :223`) → the engine commits +
  emits `apartment.layout-executed` (`LAYOUT_EXECUTED_EVENT :94`) → `rebuildGraphFromModel()`
  (`:800`) → `pryzm:building-graph-rebuilt` → the graph re-binds (`resync :711`).

**The C52 write-path discipline (normative, §3 of C52):** a node edit MUST be a per-node override
in a session stash (§3.1), MUST re-run via the EXISTING trigger (§3.2), the inverse projection MUST
be the EXISTING rebuild (§3.3), and there MUST be no parallel mutator / scorer (§3.4).

### §3.3 — The gap this SPEC closes

| Capability | Apartment | House modal (today) | This SPEC |
|---|---|---|---|
| Slider → live re-render | ✅ (modal form) | ✅ (modal form) | keep |
| Brief sliders in the modal form | partial (weights) | weights only | add bedroom/area/storey + typology-brief sliders |
| Living graph in the modal | ✅ (per-card Plan/Graph toggle) | ❌ | **add** (reuse `buildLayoutBubbleGraphSvg`) |
| ONE option only | N cards | N cards | **collapse to best** |
| Graph node edit → re-generate | ✅ (overlay) | ❌ | **embed the override→re-run loop into the modal graph** |
| Well-defined perimeter shell | implied | implied | **draw a shell ring** |
| Windows clamped to shell | ❌ | ❌ | **clamp** |

---

## §4 — The single-option, live, graph-paired modal (to-be)

### §4.1 — Layout (R1 + R2 + R3)

The modal renders **one** card (the best whole-house variant, `options[0]`), at "better
visibility" size:

```
┌─ Choose your house layout ────────────────────────────────── [✕] ┐
│  ┌─ Brief ─────────────────────────────────────────────────────┐ │
│  │ Floors[2] Bedrooms[3] Bathrooms[2]  ☑Living ☑Open-plan …    │ │
│  │ Daylight ▭▭▭●▭  Privacy ▭▭●▭▭  Kitchen ▭●▭▭▭  Compact ▭▭▭●▭ │ │  ← sliders (R4)
│  └─────────────────────────────────────────────────────────────┘ │
│  [ Plan ] [ Graph ]            score 86/100 · 2 storeys · gable   │  ← per-storey tabs OR view toggle
│  ┌──────────────── Ground floor ─────────────────┐ ┌─ Living graph ─┐
│  │  (LARGE plan SVG — shell ring, rooms, windows)  │ │  (bubble graph) │  ← R2 + R3
│  └─────────────────────────────────────────────────┘ └────────────────┘
│  ┌──────────────── First floor ─────────────────┐                      │
│  │  (LARGE plan SVG)                              │                      │
│  └────────────────────────────────────────────────┘                    │
│  [legend swatches]                          [ Use this layout ]         │
└──────────────────────────────────────────────────────────────────────┘
```

- **Single card.** `cardHtml` renders one `HouseCardModel`. The header drops "N options".
- **Plan + Graph side by side** (preferred) OR a per-card Plan/Graph toggle reusing the apartment
  CSS (`.alm-view-toggle` / `.alm-card--graph`, `apartmentLayoutModal.ts:266–283`). House plan is
  multi-storey, so the graph is **per-storey** (one bubble graph per storey, mirroring the
  per-storey plan strip) — or one combined whole-house graph if a storey carries < 2 rooms.
- **Bigger plan.** Per-storey thumbnail grows from `160×120` (`apartmentLayoutModal.ts:249-250`)
  to a "hero" size (target ≥ `420×300`); the grid becomes a single wide column
  (`.alm-grid:has(.hlm-card)` already special-cased at `:238`).
- **Better visibility (R3):** the thumbnail gains an explicit **perimeter shell ring** (see §4.4).

### §4.2 — The brief sliders (R4 input #1)

The form already carries the 4 ScoringWeights sliders (`WEIGHT_SLIDERS`, `houseModalHtml.ts:61`).
This SPEC adds the **brief-numeric** controls as sliders/steppers (Floors 1–3, Bedrooms 0–5,
Bathrooms 1–3 — already number inputs at `:88-93`) and, where a typology brief schema is declared
([ADR-0056](../../02-decisions/adrs/0056-typology-declared-brief.md) / SPEC-TYPOLOGY-BRIEF-SCHEMA),
seeds them from `activeBrief` (`apps/editor/src/ui/apartment-layout/activeBrief.ts`,
`getActiveBriefMetadata`) so the modal and the onboarding RAC agree (O.12). All wiring already
exists — `_readFormState` (`HouseLayoutModal.ts:227`) reads them; no new read path.

### §4.3 — The living-graph edit (R4 input #2) — the C52 loop, inside the modal

The bubble graph in the modal becomes **editable**, reusing the C52 substrate (§3.2) WITHOUT the
floating overlay:

1. Each graph node carries `data-room-name` (the deterministic minted name). A click on a node
   opens a tiny inline editor (area number + type select) — the same two attributes C52 E1/E2
   define. (The plan thumbnail already emits `data-room-name` on room polygons, `layoutThumbnail.ts:216`,
   and the apartment modal already wires polygon-click → area-input focus, `ApartmentLayoutModal.ts:300`.)
2. An edit calls `setRoomAreaOverride(name, m²)` / `setRoomTypeOverride(name, type)` — the EXISTING
   stash (C52 §3.1). **No new stash.**
3. The edit then **debounced-fires the SAME modal re-render path as a slider** — i.e. it calls the
   controller's `_regenerate(...)`. For the house engine this is the **synchronous offline call**
   (§3.1), so the override must be threaded into `_computeVariants` (see §5.3): the controller reads
   `getRoomAreaOverrides()` / type overrides and merges them into `program.roomAreasByName` /
   `roomTypesByName` before calling `generateHouseLayoutOptions`. This is exactly what
   `gatherLayoutPayload` does for the apartment async path — the house path inlines the merge because
   it re-runs the engine directly, not via `triggerApartmentLayout`.
4. `modal.refresh(best)` re-renders the plan + graph. Because the engine is deterministic and the
   override defaults to a no-op (C52 **I2**), an un-edited graph reproduces the byte-identical best.

> **Governance note (C52 §3.4):** the modal graph re-weights/overrides an engine input and re-runs
> the ONE deterministic engine; it MUST NOT resize geometry directly. The house path re-runs
> `generateHouseLayoutOptions` (the same engine the modal already calls) — no parallel mutator.

### §4.4 — Better-visibility rendering (R3) — `buildLayoutThumbnailSvg`

Two additive, opt-in rendering features (default-off so the apartment modal is byte-identical
until it opts in):

- **R3a — perimeter shell ring.** A new `ThumbnailOptions.shellPolygonMm?: {x,y}[]` (or
  `drawShellRing?: boolean` deriving the ring from the room-polygon union / wall loop). When present,
  draw a single thick closed `<polyline>`/`<path>` in `wallColor` (≈ `wallWidth + 1.5`) BENEATH the
  per-wall lines, so the outer boundary reads as one crisp shell. The house modal passes the storey
  footprint (`StoreyPlate.footprint`, already shared via `unionStoreyBoundsMm`,
  `HouseLayoutModal.ts:50`) as the ring.
- **R3b — clamp window/door spans to the host wall.** In `renderSpanSymbol` (`layoutThumbnail.ts:288`)
  and the `option.windows` block (`:317`), project the span endpoints onto the host wall segment and
  clamp the parametric `[t0,t1]` to `[0,1]` (and drop the symbol if the projected midpoint is > a
  small tolerance off the wall line). This guarantees a window can never render outside the shell —
  it is geometrically pinned to a wall. This is the direct cure for *"windows going out of the
  perimeter shell"*.

> **Cross-ref:** R3b is the modal-render twin of the parallel engine-side window-emission fidelity
> work; the SVG clamp is a render-time safety net so the preview is always faithful even if an
> upstream span is slightly off.

### §4.5 — The regenerating indicator (R4 feedback)

Reuse `setBusy(true/false)` (`HouseLayoutModal.ts:169`) — it already adds `.alm-busy` (dims the grid,
`apartmentLayoutModal.ts:139`) and writes a "Regenerating house layouts…" hint. Because the house
re-run is synchronous, the busy state is momentary; keep it for graph edits (which may briefly
re-run twice if the user drags) and as the visible analogue of the apartment §DEMO-3 toast.

---

## §5 — Data-flow design

### §5.1 — Slider edit (synchronous)

```
form input/change
  → HouseLayoutModal._scheduleProgramChange (debounce 250 ms)          [exists]
  → onProgramChange(state)
  → HouseLayoutController._regenerate(state)                            [exists]
      → mutate _regen.{storeyCount,program,weights}
      → _computeVariants(...) → generateHouseLayoutOptions(...)         [PURE, sync]
      → modal.refresh( [best] )                                        [CHANGE: pass best only]
  → re-render single card: plan SVGs (+ shell ring) + per-storey graphs
```

### §5.2 — Graph node edit (synchronous, C52)

```
graph node click → inline area/type editor
  → setRoomAreaOverride(name, m²) | setRoomTypeOverride(name, type)    [exists, C52 §3.1]
  → HouseLayoutModal._scheduleGraphEdit (debounce 250 ms)              [NEW, mirrors slider]
  → onGraphEdit() → HouseLayoutController._regenerate(currentState)    [reuse]
      → _computeVariants merges getRoomAreaOverrides()/types into       [NEW merge, §5.3]
        program.roomAreasByName / roomTypesByName
      → generateHouseLayoutOptions(...) → modal.refresh([best])
```

### §5.3 — The override merge (the only engine-input change)

`generateHouseLayoutOptions` already accepts a `program: ApartmentProgram`, and the apartment engine
already honours `program.roomAreasByName` / `roomTypesByName` per-instance (C52 E1/E2). The house
orchestrator passes `program` straight through to each per-storey `generateDeterministicLayouts`
call (`houseOrchestrator.ts:501`), so **no engine change is required** — the controller just merges
the override stash into the program before the call (`_computeVariants`, `HouseLayoutController.ts:201`).

### §5.4 — Determinism + state held

- **Determinism (C52 I1):** the engine is pure; same overrides + brief + shell ⇒ same best option.
- **State held in the controller `_regen`** (`HouseLayoutController.ts:116`): `shell` (immutable for
  the modal's lifetime), `constraints`, build opts, and the **mutable** `storeyCount/program/weights`.
  Overrides are read from the global C52 stash at re-run time (not copied into `_regen`), so a stale
  closure can never desync from the stash. On pick, the executor builds the EDITED variant (`_build`
  reads the latest cached state + the stash via the program merge).

### §5.5 — Risks + mitigations

| Risk | Mitigation |
|---|---|
| Re-generate latency on every keystroke/drag | 250 ms debounce already present (`DEBOUNCE_MS`); the house engine is sync + offline (no relay), so a full re-run is single-digit-ms-to-low-tens. Coalesce graph + slider edits onto ONE debounce timer. |
| Modal holds a live generation closure | The controller caches `_regen` (data only, no promise); the engine call is synchronous, so there is no in-flight async closure to leak. `dismiss()` clears the debounce timer (`:182`) + nulls `_regen` (`onCancel :179`). |
| Override stash leaks across modals/projects | Clear overrides on cancel/commit if the founder wants a fresh modal each open (the apartment clears on project close); decision deferred — default is to keep them (matches the overlay). |
| Graph + plan diverge after edit | Both re-render from the SAME `options[0]` in `refresh()`; single source. |
| Apartment modal regression from shared-renderer changes | R3a/R3b are opt-in flags, default-off → apartment paths byte-identical until they opt in; guard with the existing layoutThumbnail unit tests. |

---

## §6 — Governance + contracts

- **C52 (Editable Building Graph)** — the modal graph edit is a C52 E1/E2 per-node override; MUST
  obey §3.1–§3.4 (stash → existing engine re-run → re-project; no parallel mutator). This SPEC adds
  **no new editable axis** and **no new stash**.
- **ADR-0061** — the bidirectional substrate C52 normalises; this SPEC is a NEW consumer surface
  (the modal) of the SAME substrate.
- **ADR-0060 / SPEC-LIVING-DESIGN-PARAMETERS** — the GLOBAL slider seam; the modal's brief sliders
  are the in-modal expression of it.
- **C50 / SPEC-TGL** — the ONE deterministic engine; both edit kinds re-run it, unforked.
- **P3 (single rAF):** the modal renders declarative SVG strings — no `requestAnimationFrame`. ✅
- **P6 (commands are the only mutation path):** the modal never writes a store; the executor
  dispatches on pick. ✅
- **P8 (spans):** no new exported engine function; spans stay at the AiPlane boundary.
- **C17 (batch catalogue):** not directly touched; the modal is a generate-surface, not a batch entry.

---

## §7 — File-by-file implementation plan

Smallest safe slices, sequenced. **[P]** = parallelisable with other [P] in the same slice group.

### Slice A — single option (R1) — sequential first (smallest, lowest-risk)
1. `HouseLayoutController.ts` — `request()` (`:175`): pass only the best variant to `modal.show`
   (`variants.slice(0,1)` — `variants[0]` is already the best, `houseOrchestrator.ts:295`).
   `_regenerate()` (`:240`): `modal.refresh(variants.slice(0,1))`.
2. `houseModalHtml.ts` — `buildHouseModalHtml` (`:169`): drop the `headerCount` "N options" suffix;
   reword header to "Choose your house layout".
   *(No view-model change — `buildHouseCardModel` already produces one card.)*

### Slice B — living graph in the modal (R2) — [P] with Slice C
3. `houseModalHtml.ts` — `cardHtml` (`:124`): add the apartment `.alm-view-toggle` Plan/Graph
   buttons (copy from `layoutModalHtml.ts:244-247`) and a `.alm-view--graph` container per storey;
   accept a `storeyGraphs: string[]` param parallel to `storeyThumbs`.
4. `HouseLayoutModal.ts` — `_storeyGraphs(options)`: new helper mirroring `_storeyThumbs` (`:196`)
   that calls `buildLayoutBubbleGraphSvg(s.option, { background:'#ffffff' })` per storey; thread it
   into `buildHouseModalHtml` + `buildHouseCardGridHtml` calls (`:101`, `:155`). Add the
   Plan/Graph click toggle in the overlay click handler (copy `ApartmentLayoutModal.ts:117-129`).
5. `houseModalHtml.ts` — import `buildLayoutBubbleGraphSvg`? **No** — keep the renderer call in the
   DOM controller (`HouseLayoutModal`), pass SVG strings in (matches the existing `storeyThumbs`
   pattern so `houseModalHtml` stays a pure string builder).

### Slice C — better visibility (R3) — [P] with Slice B
6. `layoutThumbnail.ts` — add `ThumbnailOptions.shellPolygonMm?` + `drawShellRing?` (`:28`); render
   the ring beneath walls (R3a). Default-off.
7. `layoutThumbnail.ts` — clamp `renderSpanSymbol` (`:288`) + `option.windows` (`:317`) spans to the
   host wall (R3b). Add a `clampSpansToWall?: boolean` flag default-off for apartment parity, ON for
   the house modal.
8. `HouseLayoutModal.ts` — `_storeyThumbs` (`:196`): pass `shellPolygonMm` = the storey footprint
   (already have `unionStoreyBoundsMm`; the per-storey `StoreyPlate.footprint` is the ring) +
   `clampSpansToWall: true`; widen size to the hero dimensions.
9. `apps/editor/src/ui/styles/panels/apartmentLayoutModal.ts` — bump `.hlm-storey-thumb` size
   (`:249`) for the single-card hero; ensure `.alm-grid:has(.hlm-card)` (`:238`) renders one wide
   column when only one card.

### Slice D — editable modal graph (R4 graph half) — sequential after B
10. `houseModalHtml.ts` — make graph nodes clickable: ensure `buildLayoutBubbleGraphSvg` nodes
    carry `data-room-name` (currently nodes are `pointer-events:none`, `layoutBubbleGraph.ts:224`).
    **Add an opt-in `interactive?: boolean`** to `BubbleGraphOptions` that emits `data-room-name` +
    `class="alm-graph-node"` + `pointer-events:auto` so a click can land. Default-off (apartment
    overlay unaffected).
11. `HouseLayoutModal.ts` — new `HouseLayoutModalCallbacks.onGraphEdit?(): void`; wire a node-click
    → tiny inline area/type editor → `setRoomAreaOverride`/`setRoomTypeOverride` (import from
    `apartment-layout/activeRoom*Overrides`) → `_scheduleGraphEdit()` (mirror `_scheduleProgramChange`,
    SAME debounce timer to coalesce). Reuse `setBusy(true)`.
12. `HouseLayoutController.ts` — `_computeVariants` (`:201`): before calling
    `generateHouseLayoutOptions`, merge `getRoomAreaOverrides()` / type overrides into
    `program.roomAreasByName` / `roomTypesByName`. Pass `onGraphEdit: () => this._regenerate(currentState)`
    into `modal.show`.

### Slice E — brief sliders + brief seeding (R4 slider half) — [P] with D
13. `houseModalHtml.ts` — `buildHouseProgramEditFormHtml` (`:80`): present Floors/Bedrooms/Bathrooms
    as range sliders (or keep number inputs); optionally render typology-brief sliders when a brief
    schema is declared.
14. `HouseLayoutController.ts` — `request()`: seed initial `formState` from `activeBrief`
    (`getActiveBriefMetadata`) so the modal agrees with the RAC brief (O.12).

### Slice F — tests + docs
15. `apps/editor/__tests__/` — extend `layoutModalHtml.test.ts` patterns: a house single-card test,
    a graph-present test, a window-clamp test on `layoutThumbnail`, a shell-ring test.
16. `packages/ai-host/__tests__/` — assert `generateHouseLayoutOptions(...)[0]` equals
    `generateHouseLayout(...)` (the equality invariant is already asserted; reuse) and that an empty
    override set reproduces the baseline (C52 I2, reuse `roomAreaOverride.test.ts` pattern for the
    house program).

**Parallelisation:** Slice A is the gate (everyone builds on one-card). B + C are independent ([P]).
D depends on B (graph must exist before it's editable). E is independent of B/C/D ([P]). F last.

**Critical path:** A → B → D → F. Off-critical: C and E in parallel.

---

## §8 — Acceptance criteria

- **AC1 (R1):** the house modal shows exactly ONE card (the best variant); editing the brief keeps
  it one card.
- **AC2 (R2):** the card shows the living graph (per storey), toggleable with the plan, occupancy
  colours matching the plan + legend.
- **AC3 (R3):** the plan is visibly larger; the perimeter shell reads as one crisp ring; no window
  or door symbol renders outside the shell on any storey.
- **AC4 (R4-slider):** dragging a brief/weight slider re-renders the plan + graph within ~½ s, with
  a momentary "Regenerating…" state.
- **AC5 (R4-graph):** clicking a graph node + changing its area/type re-renders the plan + graph;
  the override is the C52 stash; an un-edited graph reproduces the byte-identical best (C52 I2).
- **AC6 (governance):** no new mutation path, no engine fork, no new stash; P3/P6/P8 + C52 §3 hold;
  the apartment modal is byte-identical until it opts into R3a/R3b.

---

## §9 — Concatenated cross-floor living graph (plan-LEFT / graph-RIGHT) — `XFLOOR-GRAPH`

**Status:** DRAFT (2026-06-09) — founder follow-up, the next evolution of the §4 modal.
**Builds on:** the §2–§8 single-option modal (the per-storey Plan/Graph TOGGLE + the interactive
C52 living-graph nodes, both SHIPPED as `LIVE-MODAL.*` / tracker §25).

### §9.1 — The founder directive (verbatim)

> *"the goal will be to have the graph NEXT TO the plan view — also we should have a CONCATENATED
> graph in case we want to move a bedroom from upstairs to downstairs — it should work like
> mural/miro the graphs — we should have the plan views to the LEFT and the graphs to the RIGHT —
> the graphs are connected as a SINGLE LIVING ENTITY — and the plan view reflects graphically the
> data. the graphs are the SEMANTIC TRUTH; the UI should be more dynamic — on the fly the user can
> easily change data with sliders."*

Decomposed into five requirements:

1. **X1 — Side-by-side, not a toggle.** Plan views on the LEFT, living graph on the RIGHT,
   simultaneously visible (replacing the per-storey Plan/Graph toggle shipped as §LIVE-MODAL.B).
2. **X2 — ONE concatenated graph spanning ALL storeys** — a single connected entity (storey-
   clustered visual lanes), not one graph per floor. Inter-floor edges = the stair / vertical
   circulation link.
3. **X3 — Move a room between floors** — drag a node from one floor-cluster to another → the
   program/layout re-generates with that room moved between storeys.
4. **X4 — Miro/Mural canvas** — pan / zoom / draggable nodes; the graph is the SEMANTIC TRUTH and
   the plan is a projection of it.
5. **X5 — On-the-fly sliders** — editing the graph OR a slider re-runs the engine and the plan
   re-renders (extends the §5 live loop, already partly shipped).

### §9.2 — What is shipped TODAY vs the target (verified 2026-06-09)

| Capability | Shipped today (§LIVE-MODAL / §25) | Target (this §9) |
|---|---|---|
| Plan ↔ graph | per-storey **TOGGLE** (`.alm-view-toggle`, `houseModalHtml.ts:124`; click handler `HouseLayoutModal.ts:134-146`) | **side-by-side** plan-LEFT / graph-RIGHT |
| Graph scope | **one SVG per storey** (`_storeyGraphs`, `HouseLayoutModal.ts:272`; `buildLayoutBubbleGraphSvg` per `card.storeys[i]`) | **ONE concatenated** graph, storey-clustered, with inter-floor stair edges |
| Graph renderer | static **SVG string** (`layoutBubbleGraph.ts`) — no pan/zoom/drag | **Canvas2D Miro/Mural** field (reuse `LivingGraphCanvas`/`LivingGraphOverlay`) |
| Node edit | click → inline area/type popover → C52 stash → debounced regen (`_openGraphNodeEditor`, `HouseLayoutModal.ts:311`) | keep + **drag a node across a floor-cluster boundary → room→floor override** |
| Room→floor override | **DOES NOT EXIST** (see §9.4) | **NEW `roomFloorByName` stash + orchestrator honour** |
| Sliders → live regen | SHIPPED (`_scheduleProgramChange` → `_regenerate`, sync offline engine) | keep, unchanged |

So the modal today is plan-OR-graph (per storey, toggled), with editable but STATIC per-storey
SVG graphs. The target is plan-AND-graph (side by side), with ONE pannable/zoomable/draggable
canvas graph spanning every storey, where dragging a node between floor-clusters re-allocates the
room to a different storey.

### §9.3 — The concatenated graph data model (X2) — the single semantic truth

The orchestrator already returns everything needed: `HouseLayoutResult.perStoreyLayout[i]` is the
`ScoredLayoutOption` for `storeys[i]` (strictly index-aligned, `houseOrchestrator.ts:725`,
`types.ts:176`), and `HouseLayoutResult.stairs[]` carries `{ fromLevelId, toLevelId }` per adjacent
storey pair (`houseOrchestrator.ts:759`, `types.ts:77`).

**Build ONE `LiveGraph`** (the `livingGraphSchema` shape the `LivingGraphCanvas` already renders)
from the whole `ScoredHouseLayoutOption`, NOT per storey:

- **Nodes.** For every storey `s`, for every room in `perStoreyLayout[s].rooms`, emit one node.
  - `id` = a deterministic composite `storey:<s>/<roomName>` (room names are unique *within* a
    storey, not across — "Bathroom" can exist on ground AND first; the storey prefix disambiguates).
  - Carry `storeyIndex` + `levelId` on the node so the canvas can lane-cluster it.
  - `label` / `type` / `areaSqm` / occupancy / centroid map exactly as the per-storey SVG does
    today (`layoutBubbleGraph.ts:103 roomCentreMm`, `:115 roomFill`, `:121 roomShort`).
- **Intra-floor edges.** `room.adjacentTo` (room NAMES, deduped symmetric) — the same edge source
  the per-storey SVG uses (`layoutBubbleGraph.ts:204-224`), resolved *within* the storey's name set.
- **Inter-floor edges (the stair link).** For each `HouseLayoutResult.stairs[k]`, add an edge
  between the stair-arrival node on `fromLevelId` and on `toLevelId` (the storey's `corridor` /
  `Landing` circulation seed — the room the stair lands at, per §LANDING-NOT-HALL,
  `storeyAllocation.ts:133`). Tag it `layer: 'structural'` (the riser-cluster layer the canvas
  already dashes, `LivingGraphCanvas.ts:35`). This is what makes the graph **one connected entity**
  rather than N disjoint floor-graphs.
- **Storey clustering / lanes (X2 visual).** The canvas is currently a free force-field. For the
  concatenated graph we constrain each storey to a horizontal LANE (a y-band per `storeyIndex`,
  ground at the bottom — matching the plan stacking in §9.6) by adding a per-node lane-anchor force
  to `forceSimulation` (a soft spring toward `y = laneBandFor(storeyIndex)`), so floors read as
  stacked bands while still being one field. The stair edges then visibly bridge the bands.

This graph IS the semantic truth (X4): the plan thumbnails are a read-only projection of the SAME
`perStoreyLayout` the graph nodes come from. No separate plan model.

### §9.4 — Room→floor override (X3) — **must be ADDED** (does not exist today)

**Finding (verified):** room→storey assignment today is **by COUNT, not by named instance.**
`allocateProgramToStoreys(program, storeyCount)` (`storeyAllocation.ts:44`) splits the whole-house
`ApartmentProgram` into per-storey `StoreyProgram`s purely by integer counts — e.g.:

```ts
// storeyAllocation.ts:80-86
const groundBedrooms = totalBedrooms >= 2 ? 1 : 0;     // a guest bedroom downstairs
const upperBedrooms  = totalBedrooms - groundBedrooms; // the rest upstairs
const groundBathrooms = totalBathrooms > 0 ? 1 : 0;    // one WC on the ground
const upperBathrooms  = totalBathrooms - groundBathrooms;
```

The per-storey program then carries `bedrooms: groundBedrooms` etc. (`:104`, `:127`) — there is **no
per-instance "which floor does Bedroom 2 live on" field.** The `ApartmentProgram` has
`roomAreasByName` (`apartmentLayout/types.ts:143`) and `roomTypesByName` (`:164`) — per-instance
AREA and TYPE overrides — but **no `roomFloorByName`** (grep-confirmed: only those two name-keyed
maps exist). Therefore moving a specific room between floors is **not expressible today** and a new
override + an orchestrator change are required.

**Design (note it; do NOT build it in this analysis pass):**

**(a) The session stash — `activeRoomFloorOverrides.ts`** (sibling of `activeRoomAreaOverrides.ts` /
`activeRoomTypeOverrides.ts`, in `apps/editor/src/ui/apartment-layout/`):

```ts
// name → target storeyIndex (0 = ground). Empty ⇒ no override ⇒ byte-identical baseline (C52 I2).
let _overrides: Record<string, number> = {};
export function setRoomFloorOverride(roomName: string, storeyIndex: number | null): void { … }
export function getRoomFloorOverrides(): Record<string, number> | null { … }
export function clearRoomFloorOverrides(): void { … }
```

Keyed by the room's display name exactly as the area/type stashes are. Empty ⇒ no override ⇒ the
C52 **I2** baseline-identity invariant holds (un-edited graph reproduces the byte-identical best).

**(b) The `ApartmentProgram` field** — add `roomFloorByName?: Partial<Record<string, number>>` to
`apartmentLayout/types.ts` (alongside `roomAreasByName`/`roomTypesByName`). Pure type; L0/L2 only.

**(c) The orchestrator honour — the single engine change.** `allocateProgramToStoreys` is the ONE
place that decides which storey a room belongs to. It currently assigns by count; it must become
override-AWARE. The minimal sound design (count-based default + named exceptions, deterministic):

1. Compute the count-based default allocation exactly as today.
2. After the default split, apply `program.roomFloorByName`: for each `(name → targetStorey)`, if
   the named room is currently allocated to a different storey, DECREMENT the source storey's count
   for that room's type and INCREMENT the target storey's count — i.e. the override moves the room's
   *count budget* between storeys, then the per-storey D-TGL engine re-mints the room set on the new
   storey (room re-minting is name-deterministic, so the moved room keeps its name).
3. Re-validate each storey against the house envelope (`validateHouseStorey`, already injected at
   `houseOrchestrator.ts:698`) — a move that over/under-fills a storey is soft-handled the same way
   a sparse storey is today (`§HOUSE-PLATE-PROGRAM-FLOOR` enrichment, `houseOrchestrator.ts:643`).
4. Keep the §LANDING-NOT-HALL / kitchen-on-ground invariants (`storeyAllocation.ts:130,143`) HARD —
   an override that tries to move the kitchen upstairs is clamped (kitchen stays ground) and the
   modal surfaces a non-blocking notice. (Bedrooms/baths/study are freely movable; the entrance
   hall + kitchen are floor-pinned by typology.)

Because step (1) is unchanged and an empty `roomFloorByName` skips steps (2)–(4) entirely, the
no-override path is **byte-identical** (C52 I2). The controller merges the stash into the program in
`_computeVariants._mergeOverrides` (`HouseLayoutController.ts:249`) exactly as it already merges
area/type, and `_build` merges it too so the BUILT house honours the move (mirrors the existing
area/type merge at `:325`).

> **Naming caveat (risk).** Room names are unique *within* a storey but not *across* (a "Bathroom"
> on each floor). `roomFloorByName` is whole-house, so a bare "Bathroom" key is ambiguous. The
> graph node id is the disambiguated `storey:<s>/<name>`, so the stash should key on the **node id
> (storey-qualified name)**, and the orchestrator resolves the source storey from the id prefix —
> NOT a bare name. This is the one place the house override diverges from the apartment area/type
> stashes (which are single-storey, so a bare name is unambiguous there).

### §9.5 — The move-room-between-floors interaction (X3)

Reusing the canvas drag already shipped in `LivingGraphOverlay` (`onCanvasPointerDown :1153` →
`onCanvasPointerMove :1180` pins the node under the cursor → `onCanvasPointerUp :1202`):

1. The user drags a node. While dragging, the node is pinned under the cursor (existing behaviour).
2. On drop, the canvas computes which storey LANE (§9.3) the node's final y falls in (`laneFor(y)`).
3. If the drop lane's `storeyIndex` differs from the node's `storeyIndex`, fire a **move**:
   `setRoomFloorOverride(nodeId, dropStoreyIndex)` → the SAME debounced re-generate the slider/area
   edit uses (`_scheduleGraphEdit`, `HouseLayoutModal.ts:295`, coalesced on the one 250 ms timer).
4. The controller `_regenerate` re-runs `generateHouseLayoutOptions` with the merged program (now
   carrying `roomFloorByName`) → `allocateProgramToStoreys` honours the move (§9.4c) → the plan
   thumbnails AND the concatenated graph both re-render from the new `perStoreyLayout` (single
   source — §5.5 "graph + plan diverge" risk is structurally avoided).
5. A within-lane drop (no storey change) is a plain reposition — no override, no regen (the canvas
   already re-anneals the field, `LivingGraphOverlay.ts:1210`).

### §9.6 — Side-by-side layout (X1) + plan stacking

Replace the per-storey Plan/Graph toggle (`.alm-view-toggle`, shipped §LIVE-MODAL.B) with a two-
column flex body inside `.alm-card`:

```
┌─ Choose your house layout ─────────────────────────────────── [✕] ┐
│  ┌─ Brief sliders … ───────────────────────────────────────────┐ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌── PLAN (left) ───────────────┐ ┌── CONCATENATED GRAPH (right) ┐│
│  │  ┌ First floor  (plan SVG) ┐ │ │   ╭ first-floor lane ╮        ││
│  │  └─────────────────────────┘ │ │   ● Bed ─ ● Bath              ││
│  │  ┌ Ground floor (plan SVG) ┐ │ │     │ (stair edge)            ││
│  │  └─────────────────────────┘ │ │   ╰ ground-floor lane ╯        ││
│  │                              │ │   ● Living ─ ● Kitchen         ││
│  └──────────────────────────────┘ └──── (pan / zoom / drag) ──────┘│
│  [legend]                                    [ Use this layout ]   │
└────────────────────────────────────────────────────────────────────┘
```

- **Plan column (LEFT).** Stack the per-storey plan thumbnails vertically, **top floor at the top,
  ground at the bottom** (so the visual order matches the graph lanes in §9.3). The `_storeyThumbs`
  helper (`HouseLayoutModal.ts:244`) already builds one SVG per storey at hero size with a SHARED
  footprint bound (`unionStoreyBoundsMm :60`); reverse the storey order for top-down stacking.
- **Graph column (RIGHT).** ONE `LivingGraphCanvas` mounted in the card (not the floating overlay)
  rendering the §9.3 concatenated `LiveGraph`. The graph column gets the larger share (~55–60 %).
- **Brand.** Reuse the `.alm-*`/`.hlm-*` classes (white + #6600FF, no black) — the canvas already
  paints a white field with a lavender wash (`LivingGraphCanvas.ts:108-114`).

### §9.7 — Which existing canvas to REUSE (X4) — `LivingGraphCanvas` + `LivingGraphOverlay`

**Do NOT reinvent the canvas.** The Miro/Mural behaviours the founder asks for are ALL already
implemented in `apps/editor/src/ui/living-graph/` (the A.21.D17 / A.21.D37 Living Building Graph):

| Behaviour | Where it lives today |
|---|---|
| Pan (drag empty canvas) | `LivingGraphOverlay.onCanvasPointerDown :1153` (empty → `panning`) / `…Move :1194` |
| Zoom toward cursor (wheel) | `onCanvasWheel :1132` (clamped 0.25×–4×, keeps layout point under pointer) |
| Drag a node | `onCanvasPointerDown :1157` (hit a node → `nodeDragId`) / `…Move :1181` pins it |
| Hit-test | `LivingGraphCanvas.pick :78` |
| Force-directed layout | `forceSimulation.ts` (`simulateStep`/`scatterNodes`/`fitToCanvas`/`reheat`) |
| Auto-fit + manual-nav suspend | `autoFit :997` / `userNavigated :197` (don't fight the user) |
| Render (nodes √area, layered dashed edges, sun halo, labels) | `LivingGraphCanvas.draw :98` |
| P3-safe ticker (frame-bus first, guarded `setInterval` fallback, stops on settle) | `ensureTicking :1007` / `frame :1037` |
| Node edit → C52 stash → debounced regen | `areaField :1492` / `occupancyField` → `setRoomAreaOverride`/`setRoomTypeOverride` → `scheduleAreaRegen` |

**The reuse strategy (two options, pick at build time):**

- **Option A (preferred) — embed the renderer + interaction primitives.** Mount a bare
  `LivingGraphCanvas` in the modal card and lift the pan/zoom/drag pointer handlers
  (`onCanvasWheel`/`onCanvasPointerDown/Move/Up`) into a small shared `MiroCanvasController` (extract
  from `LivingGraphOverlay` so both the overlay and the modal use ONE copy — avoids a fork). The
  modal feeds it the §9.3 concatenated `LiveGraph` (built from `ScoredHouseLayoutOption`, not the
  live UBG) and wires node-drop → `setRoomFloorOverride` (§9.5) + node-click → the existing inline
  area/type editor.
- **Option B (lighter, more divergence) — keep the static SVG bubble graph** (`layoutBubbleGraph.ts`)
  but render ONE concatenated SVG with lane bands and add HTML-level pan/zoom (CSS transform on a
  wrapper) + SVG node drag. Cheaper but re-implements pan/zoom/drag that already exist in the canvas,
  so it duplicates §9.7's table. **Not recommended** — it contradicts "reuse rather than reinvent".

The §9.7 reuse keeps the canvas the single Miro/Mural surface; the modal becomes a SECOND mount of
it (the overlay is the first), fed a different graph source.

### §9.8 — Live slider + on-the-fly regen (X5) — extends §5, already partly shipped

No new mechanism. The slider → debounced `_regenerate` loop is SHIPPED (§3.1 / §5.1). This §9 adds
ONE more override kind (`roomFloorByName`) to the SAME merge in `_computeVariants._mergeOverrides`
(`HouseLayoutController.ts:249`), and the graph drag fires the SAME `_scheduleGraphEdit` debounce
(`HouseLayoutModal.ts:295`) the area/type edit already uses. The plan + graph both re-render from
the one `options[0]`. The only genuinely new engine work is §9.4c (the orchestrator move honour).

### §9.9 — File-by-file implementation plan (parallelisable slices + risks)

**[P]** = parallelisable within its group. Sequenced smallest-first.

- **Slice XA — the room→floor override substrate (X3 core, the engine change).** *Sequential gate.*
  1. `apps/editor/src/ui/apartment-layout/activeRoomFloorOverrides.ts` — NEW stash (§9.4a),
     keyed by the storey-qualified node id; `get/set/clear` + `getRoomFloorOverrides()`.
  2. `packages/ai-host/src/workflows/apartmentLayout/types.ts` — add
     `roomFloorByName?: Partial<Record<string, number>>` to `ApartmentProgram` (§9.4b).
  3. `packages/ai-host/src/workflows/houseLayout/storeyAllocation.ts` — make
     `allocateProgramToStoreys` override-aware (§9.4c): default split → apply moves → re-validate →
     clamp floor-pinned rooms. Empty override ⇒ byte-identical (C52 I2). Pure, deterministic, span-free.
  4. `packages/ai-host/__tests__/houseLayout.test.ts` — count-based default unchanged; a
     `roomFloorByName` move shifts the room's count between storeys; empty ⇒ baseline (I2); a
     kitchen-move-up is clamped.

- **Slice XB — the concatenated graph builder (X2).** *[P] with XC.*
  5. NEW `apps/editor/src/ui/house-layout/buildConcatenatedHouseGraph.ts` — pure
     `(option: ScoredHouseLayoutOption) → LiveGraph` (§9.3): storey-prefixed node ids, intra-floor
     `adjacentTo` edges, inter-floor stair edges from `result.stairs[].from/toLevelId`, `storeyIndex`
     + `levelId` on each node. Node-testable (no DOM).
  6. `apps/editor/src/ui/living-graph/forceSimulation.ts` — add an OPTIONAL per-node lane-anchor
     spring (toward `laneBandFor(storeyIndex)`), default-off so the overlay's free field is unchanged.

- **Slice XC — extract the Miro canvas controller (X4 reuse).** *[P] with XB.*
  7. NEW `apps/editor/src/ui/living-graph/MiroCanvasController.ts` — lift `onCanvasWheel` /
     `onCanvasPointerDown/Move/Up` / `clientToCanvas` / `canvasToLayout` / `autoFit` / `userNavigated`
     out of `LivingGraphOverlay` into a reusable controller over a `LivingGraphCanvas` + a `LiveGraph`.
  8. `LivingGraphOverlay.ts` — refactor to USE `MiroCanvasController` (no behaviour change; the
     overlay's existing tests guard parity). This is the only touch to the shipped overlay.

- **Slice XD — the side-by-side modal body (X1) + mount the canvas.** *Sequential after XB+XC.*
  9. `apps/editor/src/ui/house-layout/houseModalHtml.ts` — replace the per-storey `.alm-view-toggle`
     (`storeyHtml :118`) with a two-column `.hlm-body` (plan column + graph-canvas mount point);
     stack plan thumbnails top-floor-first.
  10. `apps/editor/src/ui/house-layout/HouseLayoutModal.ts` — on `show`/`refresh`, build the §9.3
      graph (`buildConcatenatedHouseGraph(options[0])`), mount a `LivingGraphCanvas` +
      `MiroCanvasController` into the graph column, wire node-drop → `setRoomFloorOverride` +
      `_scheduleGraphEdit`, node-click → the EXISTING `_openGraphNodeEditor` (area/type). Replace
      `_storeyGraphs` (the per-storey SVGs) with the single canvas. Dispose the canvas on `dismiss`.
  11. `apps/editor/src/ui/styles/panels/apartmentLayoutModal.ts` — `.hlm-body` two-column flex
      (plan ~40 %, graph ~60 %); the graph column gets a fixed-height canvas box.

- **Slice XE — wire the floor override through the controller (X3 wiring).** *After XA+XD.*
  12. `apps/editor/src/ui/house-layout/HouseLayoutController.ts` — `_mergeOverrides` (`:249`): also
      merge `getRoomFloorOverrides()` into `program.roomFloorByName`. (`_computeVariants` + `_build`
      already call `_mergeOverrides`, so the move flows to both preview AND build with no other change.)

- **Slice XF — tests + docs.** *Last.*
  13. `apps/editor/__tests__/buildConcatenatedHouseGraph.test.ts` — one graph for a 2-storey option;
      stair edge present; node ids storey-qualified; empty/blank storey handled.
  14. Extend `houseModalHtml.liveModal.test.ts` — side-by-side body (no toggle); graph mount point.
  15. This SPEC + tracker §26.

**Critical path:** XA → XD → XE → XF. Off-critical (parallel): XB, XC (both feed XD).

**Risks + mitigations:**

| Risk | Mitigation |
|---|---|
| **Cross-floor re-allocation correctness** (§9.4c) — moving a count between storeys can over/under-fill the target and starve the source. | Re-validate per storey via the existing `validateHouseStorey` + `§HOUSE-PLATE-PROGRAM-FLOOR` enrichment (`houseOrchestrator.ts:643,698`); a move that breaks the envelope surfaces a non-blocking modal notice and is rejected (no silent bad layout). |
| **Graph layout stability when nodes move** — a re-generate could reshuffle the whole field, losing the user's mental map. | Reuse the overlay's position-preservation (`resync` carries forward `x/y/vx/vy` for surviving nodes, `LivingGraphOverlay.ts:715-728`) + lane anchoring (§9.3) so floors stay banded; only re-scatter on an explicit Rerun. |
| **Re-gen latency** on every drag/slider. | The 250 ms debounce + the sync offline house engine (no relay) — same envelope as the shipped slider path (§5.5); a within-lane drag fires NO regen (§9.5.5). |
| **Name ambiguity across storeys** (a "Bathroom" per floor). | Key `roomFloorByName` on the storey-qualified node id, NOT a bare name (§9.4 caveat); the orchestrator resolves the source storey from the id prefix. |
| **Forking the canvas** (two copies of pan/zoom/drag). | Slice XC extracts ONE `MiroCanvasController`; the overlay refactors to use it (XC.8) so there is a single copy guarded by the overlay's existing tests. |
| **Apartment / overlay regression** from shared-code changes. | The lane-anchor spring (XB.6) is default-off; the `MiroCanvasController` extraction is behaviour-preserving (overlay tests guard it); the override field + stash default to a no-op (C52 I2). |

### §9.10 — Acceptance criteria (X1–X5)

- **AX1 (X1):** the modal shows plan thumbnails on the LEFT and ONE graph on the RIGHT, both visible
  at once (no Plan/Graph toggle); top floor stacks above ground in both columns.
- **AX2 (X2):** the graph is ONE connected field spanning every storey, storey-clustered into lanes,
  with a visible stair/structural edge bridging adjacent floors.
- **AX3 (X3):** dragging a movable room node (bedroom/bath/study) across a floor-lane boundary re-
  allocates it to that storey and re-renders the plan + graph; floor-pinned rooms (kitchen, entrance
  hall) snap back with a notice; an un-moved graph reproduces the byte-identical baseline (C52 I2).
- **AX4 (X4):** the graph canvas pans (drag empty), zooms (wheel, toward cursor), and lets nodes be
  dragged — reusing `LivingGraphCanvas`/`MiroCanvasController` (no reinvented canvas).
- **AX5 (X5):** a brief/weight slider OR a graph edit re-runs the engine within ~½ s and the plan +
  graph re-render from the one best option (single source — they never diverge).
- **AX6 (governance):** new `roomFloorByName` is a per-instance C52-style override + a session stash;
  the ONLY engine change is `allocateProgramToStoreys` becoming override-aware; no parallel mutator,
  no second engine; P3/P6/P8 + C52 §3 hold; empty overrides ⇒ byte-identical baseline.

---

*§1–§8 authored 2026-06-09 (founder house-modal feedback). §9 authored 2026-06-09 (founder cross-
floor living-graph follow-up). Tracker: master-execution-tracker §25 (§1–§8) + §26 (§9).*
