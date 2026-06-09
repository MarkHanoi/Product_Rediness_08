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

*Authored 2026-06-09 (founder house-modal feedback). Tracker: master-execution-tracker §25.*
