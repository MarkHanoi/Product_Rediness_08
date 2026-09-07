# PLAN — Envelope DRAW on the site views (L-13050 · C58 §1.19 · STR §26)

> Produced 2026-09-07 by a 20-agent map + adversarial-verify pass (workflow `envelope-create-tool-on-site-views`).
> Every claim is tagged EXISTS / WIRED / REACHABLE and carries file:line. **The adversarial verdicts override the
> mapping claims wherever they disagree** — reuse claims were attacked, not accepted.

# ENVELOPE-DRAW ON THE SITE VIEWS — IMPLEMENTATION PLAN

Read-only investigation. Every claim below is tagged EXISTS (on disk) / WIRED (imported and constructed) / REACHABLE (a user can get there without DevTools).

---

## 0. THE STATE THAT CHANGES THE PLAN (correcting the brief's givens)

The brief's "CREATE is a missing entry point" is **now stale in the optimistic direction on one axis and still true on the axis that matters**:

- `apps/editor/src/ui/site/siteEnvelopeTool.ts` **EXISTS** (237 lines, L-13017 · C58 §1.19), and the CREATE-by-panel route is already **REACHABLE on both site surfaces**: the 2D Site Map renders the button at `SiteBoundaryMap2D.ts:780` (`buildSiteEnvelopeToolButton`, strip built :769-782), and `gisActionRegistry.ts:489-499` (`site.create-envelope`) dispatches `window.pryzmOpenSiteEnvelopeTool`, wired at `GISAreaLayout.ts:6200-6210` over `#container`, which hosts **both** panes. The panel is a re-targeting singleton (`siteEnvelopeTool.ts:107-119`).
- What that panel does **not** do is let the user *draw*. Its footprint comes from a three-route ladder of **solved** rings — `resolveFootprintSource` at `parcelLawEnvelopeAuthoring.ts:327-393`: (1) the fitted target plate, (2) the permitted ring, (3) the user's typed-setback study. There is **no "the perimeter you drew"** route. The module says so itself at `siteEnvelopeTool.ts:34-38`: *"THIS IS THE **CREATE** HALF. Direct manipulation — drawing the footprint vertex-by-vertex on the map … is NOT here."*
- So the gap is precisely and only: **a pointer gesture on Cesium / MapLibre that produces a ring, and a fourth `FootprintSource` route that consumes it.** Everything downstream of the ring already exists and already works.

Also confirmed still true: `envelope` has **0** rows in `planToolHandlerRegistry.ts` and **0** in `packages/input-host/src/ToolManager.ts` (`grep -c envelope` → 0, 0); `elementCreationMatrix.ts` has 3 hits, all prose, no row.

---

## 1. THE SEAM

**The slab tool has no renderer-independent seam, and you must NOT create one in this lane.**

Verified: `packages/geometry-slab/src/SlabTool.ts:161` (`export class SlabTool`, THREE-bound, its own polyline machine at `:175`, `addPolylinePoint` at `:954`) and `apps/editor/src/engine/views/plantools/SlabPlanToolHandler.ts:76` (`implements PlanToolHandler`, Canvas2D) share no interface. `PlanToolDrawContext` (`PlanToolHandler.ts:29-61`) is hard-bound to `HTMLCanvasElement` + `CanvasRenderingContext2D` + the concrete `PlanViewCanvas` class, so no Cesium/MapLibre adapter can satisfy it. Extending that seam is a multi-week refactor of 3,000+ lines that this feature does not need.

**What it needs instead is one new, narrow port — and nothing existing moves behind it.**

The reason the port can be narrow is that three of the four layers are *already* renderer-free and already shipping:

| Layer | Where it lives now | THREE/DOM-free? |
|---|---|---|
| Gesture + constraint state machine | `packages/geometry-slab/src/boundaryPath.ts:169-263` (`BoundaryPathAuthor`: `click()` :211, `previewTail()` :234, `undo()` :247, `canClose()` :257, `reset()` :260) + `boundaryLoops.ts:250/273/291/325` (rect / circle / ellipse generators) | **Yes** — stated at `boundaryPath.ts:62-64`, verified: imports are `./boundaryArc` and `@pryzm/geometry-kernel` only |
| The commit decision | `apps/editor/src/ui/site/envelopeAuthoringPlan.ts:206` `buildEnvelopeAuthoringPlan` → returns `{command:'spaceEnvelope.batch.create', payload}` (:388-390) | **Yes** — "no store, no DOM, no THREE, no bus, no clock, no RNG" (:63-66) |
| The render-back | Cesium: `CesiumViewport.ts:6938-7070` (`spaceEnvelopeSub = store.subscribeDirty`, prism entities). MapLibre: `SiteBoundaryMap2D.ts:1873` `spaceEnvelopeFeatureCollection()`, `:1955` `refreshSpaceEnvelopes()`, `:3647-3656` the subscription | n/a — already per-surface, already live |

So **the only thing that branches per renderer is the two responsibilities the adversarial pass isolated**: screen→ground point, and in-progress preview.

### The port to create (NEW file, `apps/editor/src/ui/site/envelopeDrawSurface.ts`)

```ts
export interface EnvelopeDrawSurface {
  readonly surfaceId: 'site-3d' | 'site-map-2d';
  /** Screen point → scene-XZ metres in the TRUE-NORTH frame (boundaryProjection.ts:68).
   *  null = the pointer is not over ground. */
  groundPointFromPointer(clientX: number, clientY: number): { x: number; z: number } | null;
  /** Draw the committed vertices + the rubber-band tail. Called on every move/click. */
  drawPreview(committed: readonly ArcVertex2D[], tail: readonly ArcVertex2D[]): void;
  clearPreview(): void;
  /** Arm/disarm pointer capture AND suppress camera/pan AND yield the surface's own click ladder. */
  arm(sink: EnvelopeDrawSink): void;   // sink: onPoint / onMove / onFinish / onCancel
  disarm(): void;
}
```

Three ports, one lifecycle pair. **No existing code moves behind it.** `SlabTool` and `SlabPlanToolHandler` are explicitly out of scope — do not retrofit them onto this port in this lane; that is a separate decision with its own risk.

**The scene-XZ frame is the contract of the port**, not lat/lon, because that is the frame the envelope footprint is committed in (`envelopeAuthoringPlan.ts:161-163`: *"the SAME frame as the parcel ring and the envelope's `insetPolygon`"*) and it is the frame `BoundaryPathAuthor` and `boundaryLoops` already speak. Each adapter converts at its own edge, once, using `latLonToSceneXZ` / `sceneXZToLatLon` (`boundaryProjection.ts:53`, `:70`) about `resolveSiteFrameOrigin` (`:106`).

---

## 2. THE SHARED PIECES

| Piece | Status | Where |
|---|---|---|
| **Gesture/constraint machine** | **REUSE-AS-IS** | `BoundaryPathAuthor` `boundaryPath.ts:169`. `linear`/`ortho`/`curved` with the founder-ruled perpendicular-foot ortho (`orthoConstrain` :215 → `orthoConstrainXZ` in the kernel) and the 3-click arc. `boundaryLoops.ts:325 boundaryLoopVertices` for `rectangular`/`circular`/`elliptical`. |
| **Package export gap** | **NEW (1 line)** | `packages/geometry-slab/package.json` `exports` has `./boundary-arc` and `./boundary-loops` but **no `./boundary-path`**. Importing the barrel drags `SlabTool` → THREE into the Cesium/MapLibre chunk (`index.ts:42` exports boundaryPath, `:85` exports SlabTool). Add `"./boundary-path": "./src/boundaryPath.ts"` and deep-import. |
| **The mode strip** | **REUSE-WITH-ADAPTER** | `DrawingModeBar` `apps/editor/src/ui/DrawingModeBar.ts:80`. Two adapters required, both established by the adversarial pass: (a) a `container?: HTMLElement` option — `show()` hard-codes `document.body.appendChild(bar)` at `:156` and `.wdh-bar` is `position:fixed; left:var(--shell-canvas-cx)`, which is the **shell** float budget, wrong for a pane (`SiteViewQuickToggle.ts:39-45`); (b) pass `escHint: 'ESC to cancel'` (`:151-153` already parameterises it). The gate at `:103` `refuseElementAuthoring('DrawingModeBar.show')` only fires in `appPhase()==='onboarding-globe'` (`elementAuthoringContext.ts:137-144`), so post-onboarding it renders — **but see Risk R1.** ⛔ Do **not** clone `SiteBoundaryMap2D.ts:906-953`'s hand-rolled `.wdh-bar` (it uses `innerHTML` at `:941`, the sink `DrawingModeBar.ts:50-53` exists to avoid). Move that fork onto the shared component **in the same commit that adds the container option**, or you will have three copies. |
| **Mode vocabulary** | **REUSE-AS-IS, and do NOT merge with the site one** | Use `BoundaryDrawMode` (`boundaryPath.ts:79`) + `BoundaryLoopMode` (`boundaryLoops.ts:109`). `SiteBoundaryMap2D.ts:905` declares its own `SiteBoundaryGesture = 'rectangle'\|'linear'\|'orthogonal'\|'curved'\|'circle'\|'ellipse'` and `:899-903` records L-1322 explicitly: two types, one name, different members — *"The fix here is the NAME, not a merge."* The envelope authors an **element** in model space; the site tool draws a **parcel** in lat/lon. Six envelope modes: `L linear · O ortho · C curved · R rectangular · I circular · E elliptical`. |
| **In-progress ring model** | **NEW, tiny** | The polygon lives in `BoundaryPathAuthor`. Nothing else needed. |
| **The drawn-ring hand-off store** | **NEW** — `apps/editor/src/ui/site/drawnEnvelopeFootprintState.ts` | A module-singleton `{ring, areaM2, surfaceId} \| null` + `subscribe()`, modelled **line-for-line** on `targetFootprintAreaState.ts:28-88` (`get`/`set`/`subscribe`/`clear`/`__resetForTests`). Session-only, not persisted — same argument as `targetFootprintAreaState.ts:11-17`. It must carry **ring and area together**: `buildEnvelopeAuthoringPlan` refuses to recompute area (`envelopeAuthoringPlan.ts:164-170`, *"a second area routine is how a card comes to state a figure the scene disagrees with"*). |
| **The 4th FootprintSource route** | **NEW, ~20 lines** | `resolveFootprintSource` (`parcelLawEnvelopeAuthoring.ts:327`) gains a **first** branch: the drawn ring outranks the fitted plate for the same reason the plate outranks the permitted ring (`:311-314`) — it is the most recent decision the user made. Label: `'the perimeter you drew on this view'`. |
| **Arming registry** | **NEW, ~60 lines** | `siteEnvelopeDrawArming.ts`: surfaces `register(surface)` on mount / `unregister` on dispose; `armEnvelopeDraw(mode)` arms **every registered surface**, counts how many accepted, and **refuses with a named reason and the route back** when none did. This is `activatePlanOnlyTool.ts:139-167` transposed, and it **sidesteps the L-5106 missing active-view accessor entirely** (`elementAuthoringContext.ts:67-83`) — you never ask "which view is active", you arm all attached ones and the first click wins and disarms the rest. Build `disarmEnvelopeDraw()` in the **same commit** (`activatePlanOnlyTool.ts:603-620` records L-7801: arming had a function, disarming had none, and Escape left the handler live). |
| **ESC / finish** | **NEW decision, already agreed by both site surfaces** | ⛔ Do **not** inherit the slab's four-ESC-owner layering. Both site surfaces already agree: **double-click or Enter finishes, Esc cancels** — Cesium `SiteBoundaryDrawTool.ts:83-86` (LEFT_DOUBLE_CLICK→commit), `:92-100` (Enter→commit, Escape→cancel); MapLibre `onDblClick` `:2807-2819` and `clearInProgressDraw` `:3168-3184`. Loop modes (rect/circle/ellipse) finish on the **second click**, as `boundaryLoops.ts:137 BOUNDARY_LOOP_GESTURE` already declares. Strip hint reads `ESC to cancel`. |
| **The commit** | **REUSE-AS-IS** | `buildEnvelopeAuthoringPlan` → `bus.executeCommand(plan.command, plan.payload)` at `parcelLawEnvelopeAuthoring.ts:733`. One verb, one undo (`CreateSpaceEnvelopeBatch.ts:1-10`). |
| **The panel** | **REUSE-AS-IS** | `mountParcelLawEnvelopeAuthoring` via `openSiteEnvelopeTool` (`siteEnvelopeTool.ts:104`). It already repaints off `store.subscribeDirty` (`parcelLawEnvelopeAuthoring.ts:755-762`), so the drawn ring appearing as the source is one `repaint()`. |

---

## 3. PER-SURFACE ADAPTERS

### 3a. 3D Site — Cesium (`siteEnvelopeDrawCesium.ts`, NEW, ~280 lines)

**Template: `apps/editor/src/ui/geospatial/SiteBoundaryDrawTool.ts` (370 lines) — a complete, working, same-renderer polygon-draw gesture.** Copy its *structure*, not its dispatch.

| Port | Supply from | Reuse |
|---|---|---|
| `groundPointFromPointer` | `SiteBoundaryDrawTool.ts:113-129` `pickLatLon`: `scene.pickPosition()` first, `camera.getPickRay()` + `globe.pick()` fallback, `Cartographic.fromCartesian`. Then `latLonToSceneXZ(ll, origin.lat, origin.lon)` (`boundaryProjection.ts:53`). | **Extract that method into the adapter verbatim** — it is the one function in the repo that already answers this on this renderer, including the terrain/3D-tiles-vs-ellipsoid fallback. |
| `drawPreview` | `SiteBoundaryDrawTool.ts:145-159` (violet point entities), `:161-186` `refreshLine` (`clampToGround: true` polyline), `:203-252` `refreshDimLabels` (pooled label entities, live edge length). Convert scene-XZ→lat/lon with `sceneXZToLatLon` (`boundaryProjection.ts:70`) at the draw edge only. | Structure reused; entity pooling reused. |
| Camera suppression | `CesiumViewport.setNavigationEnabled(on)` at `CesiumViewport.ts:2198-2204` (`controller.enableInputs = on`). Already plumbed to GISAreaLayout at `:1487`. | ⚠ `SiteBoundaryDrawTool` does **not** call it and works — Cesium's `ScreenSpaceEventHandler` LEFT_CLICK coexists with the camera controller. **Recommendation: do not disable navigation for click-to-place** (it would break pan-while-drawing, which is essential on a site view at parcel scale). Disable it only if a drag-gesture mode is added later. |
| Finish | `LEFT_DOUBLE_CLICK` (`:83-86`) + window `keydown` Enter/Escape (`:88-101`). | Reused. |
| Click arbitration | ⚠ **REAL CONSTRAINT, same class as MapLibre's.** `CesiumViewport` already owns a live `ScreenSpaceEventHandler` for selection at `:2998` (`setupSelectionHandler`, LEFT_CLICK → `scene.pick`). Cesium fires **both** handlers. A draw click would also run the selection pick. | **The adapter must ask the viewport to suspend the selection handler while armed** — add `setScenePickingEnabled(on)` beside `setNavigationEnabled` at `CesiumViewport.ts:2198`, or guard `setupSelectionHandler`'s callback on a module flag the arming registry owns. Do not construct a rival handler and hope. |

### 3b. 2D Site Map — MapLibre (`siteEnvelopeDrawMap2D.ts`, NEW, ~260 lines — but see the binding note)

| Port | Supply from | Reuse |
|---|---|---|
| `groundPointFromPointer` | `e.lngLat` from the map event (no raycast needed), then `latLonToSceneXZ`. Optional: the existing snap resolver at `SiteBoundaryMap2D.ts:2880-2896` (building-edge snap, violet indicator). | Snap is a stretch goal; the projection is 2 lines. |
| `drawPreview` | The map's own GeoJSON-source pattern: `refreshRing()` / `map.getSource(id).setData(...)`, exactly as `refreshSpaceEnvelopes()` does at `:1955-1958`. A new source+layer pair installed alongside the ring layers (`installRingLayers`, referenced `:1724`). | Pattern reused; new source id. |
| Camera suppression | `map.dragPan.disable()` / `.enable()` — the exact pair already used for vertex drag at `:2829` and `:2902`. | Reused. Only needed if a drag mode lands; **click-to-place should keep pan enabled.** |
| Finish | `onDblClick` (`:2807`), Enter/Escape via the overlay `keyListener` (`:2908`). | Reused. |

**⛔ THE SINGLE-CLICK-BINDING CONSTRAINT HOLDS, AND IT IS SCAR TISSUE, NOT A STYLE PREFERENCE.**
`SiteBoundaryMap2D` binds exactly one `map.on('click', onClick)` at `:3191`, and `onClick` at `:2666` is a **precedence ladder**: `disposed` → `overlayOnly` (:2678) → `overlayController?.isCalibrating?.()` (:2684) → `interactionMode === 'select'` → `handleParcelSelectClick` (:2688) → `committed` (:2691) → `draggingIdx` (:2693) → draw. Line `:2679-2683` records L-69 verbatim: a *second* map-click listener (the site-plan overlay's calibration) **did** get added independently and it caused exactly the failure you'd expect — *"this handler consumed the two clicks as parcel vertices (rectangle/circle mode even COMMITTED a boundary)"*.

**Therefore: the envelope adapter adds ONE branch to `onClick`, above the `interactionMode === 'select'` line and below the calibration yield.** It does not add `map.on('click', …)`. Same for `dblclick`, `mousemove` and the overlay `keyListener`.

**⚠ AND A GENUINE SURFACE DIFFERENCE, NOT AN ADAPTER DIFFERENCE:** after a parcel boundary is committed, `freezeDraw()` (`:3286-3340`) detaches `dblclick`/`mousemove`/`mouseup` and drops the overlay `keyListener`, keeping only `click` alive (`:3292-3297`, L-13026). **Envelope authoring happens exactly when a parcel is already committed** — so on this surface the adapter must **re-attach its own move/dblclick/key handlers when armed**, independently of `attachDrawHandlers()`. Cesium has no equivalent frozen state. This is the one place the two site surfaces genuinely differ.

---

## 4. WHAT THE DRAWN ENVELOPE COMMITS

**Verb and payload — unchanged, already correct:** `bus.executeCommand('spaceEnvelope.batch.create', {envelopes})`, one batch = one Ctrl+Z (`CreateSpaceEnvelopeBatch.ts:1-10`, C114 §6a). Per-storey spec from `envelopeAuthoringPlan.ts:319-346`: `{spaceEnvelopeId, levelId, footprint: ring.map(p => ({x, y:0, z})), baseOffset:0, height, role:'level', withinId:null, name}`.

**Level / storey:** N storeys = N `role:'level'` records, one per `levelId`, seated by `seatableStoreys()` (`envelopeAuthoringPlan.ts:190-197`, elevation ≥ −0.01, lowest first), heights from `resolveStoreyHeight` with an `assumed-3m` rung that is **named in the element's own `name` field** (`:340-345`). Refusals already carry both numbers: `not-enough-storeys` (`:277-292`) refuses rather than inventing a level; exceeding the ordinance is an **advisory, never a refusal** (`:352-368`, C114 §12). All of this is reused untouched.

### ⛔ PROVENANCE — A LIVE DEFECT THIS LANE MUST FIX, NOT MERELY AVOID

C58 §1.19 clause 3 is unambiguous: *"AN AUTHORED ENVELOPE CARRIES `confidence: 'authored'` AND MAY NEVER BORROW A SOLVED TIER … it carries no `ordinanceRef` and no `DerivationTrace`."*

**`AuthoredEnvelopeSpec` has no `provenance` field** — `envelopeAuthoringPlan.ts:114-124` lists eight members and provenance is not among them; `grep -n provenance envelopeAuthoringPlan.ts` returns only a doc comment at `:173`. The handler's spec **does** accept it (`CreateSpaceEnvelopeBatch.ts:79-93`) and states the consequence of omission: *"Omitted ⇒ the schema's own retrofit default (`predates-provenance`)."*

Two consequences that are already shipping:
1. Every envelope the founder creates from the Parcel Law tab or the site Envelope button today records **`predates-provenance`**, not `authored`. That is a C58 §1.19 clause 3 violation on the existing path, before any drawing is added.
2. `isReplaceableByGeneratedMassing` (`levelEnvelopeSupersession.ts:175-179`) returns `false` for a null/unknown origin — so those envelopes silently **block** the massing-option replace path (`:209-224`), which is the L-13038 behaviour pointed the wrong way.

**Fix, in the commit that adds the drawn route:** add `readonly provenance: ValueProvenance` to `AuthoredEnvelopeSpec` and populate it from the single sanctioned constructor `authoredProvenance(detail)` at `packages/schemas/src/provenance/ValueOrigin.ts:390-392`, with the detail naming the ring source, e.g. `authoredProvenance('user drew the envelope perimeter on the 3D Site view')` vs `'…extruded the permitted footprint'`. ⚠ `authored` is excluded **by type** from `systemProvenance` (`ValueOrigin.ts:127-130`, `:373-387`) precisely so it must be a decision — which it is here. Contrast `adoptProposalAsEnvelope.ts:306-314`, which stamps `computed`/`regenerated` correctly and is the working sibling.

**Then decide the supersession rule for a re-draw** (this is a genuine open decision, not a mechanical fix): a second drawn envelope on the same storey currently hits `resolveLevelEnvelopeSupersession`'s `blocked` arm (`:209-224`) because `authored` is protected by C75 §2.6. An **authored envelope replaced by another authored one from the same gesture** is a different question from "PRYZM's plate replaced by PRYZM's plate". Recommendation: a sibling predicate `isReplaceableByOwnAuthoring(p)` returning true only for `origin === 'authored'`, used **only** by the draw tool, with the replacement stated to the user before it happens (the sentence producer already exists at `:236`). ⛔ Do not widen `isReplaceableByGeneratedMassing` — that would let a generated plate destroy a drawing.

### L-13012 — the sync disposition gap

`spaceEnvelope.batch.create` has **no sync disposition**; `YjsDocAdapter` refuses to guess and logs *"Its properties are NOT replicated. Declare it in `packages/sync-client/src/syncDisposition.ts`"* (ISSUE-LOG L-13012, OPEN).

**Verdict: DEFER, with a stated reason — but state it in the lane's commit message and re-open the row, do not let it pass silently.**

The reason it is deferrable: L-13012 is a property of the **command**, not of the entry point. It is equally broken today for the panel route that is already REACHABLE on both site surfaces, so the drawing gesture neither creates nor worsens it — it inherits it. Closing it is a one-file declaration in a package (`sync-client`, L3) with its own review surface and its own test needs, and bundling it here would make the reachability milestone in §5 hostage to a sync review.

The reason it must not be silently deferred: the founder's ask is on the **collaboration** product, and *"the envelope the founder authors is invisible to a collaborator"* is a data-loss-shaped gap. **Land it as its own commit immediately after Commit 6, before the feature is announced.** If any part is deliberately not replicated, it gets the written reason the adapter asks for — never silence.

---

## 5. ORDER OF WORK

Each commit is independently verifiable; the `→ REACHABLE` marker is the milestone that matters.

**C1 — Export the gesture kernel without dragging THREE.**
`packages/geometry-slab/package.json`: add `"./boundary-path": "./src/boundaryPath.ts"`.
*Verify:* `pnpm --filter @pryzm/geometry-slab typecheck`; a deep import from `apps/editor/src/ui/site/` typechecks and the built site chunk does not pull `SlabTool`. Also re-run `npx tsx tools/ga-gate/check-three-imports.ts` (P2 must stay at 0 importers outside `renderer-three`).

**C2 — The port + the arming registry + disarm, with no surface implementing it.**
`envelopeDrawSurface.ts` (interface), `siteEnvelopeDrawArming.ts` (`register`/`unregister`/`armEnvelopeDraw`/`disarmEnvelopeDraw`, arm-all-attached + count + named refusal, modelled on `activatePlanOnlyTool.ts:139-167`), `drawnEnvelopeFootprintState.ts` (modelled on `targetFootprintAreaState.ts:28-88`).
*Verify:* unit spec — arming with zero registered surfaces returns a refusal naming the route back; register a fake, arm, feed three points + finish, assert the store holds ring + area; `disarm` clears both. Pure, no DOM.

**C3 — Provenance, on the path that already ships.**
Add `provenance` to `AuthoredEnvelopeSpec` (`envelopeAuthoringPlan.ts:114`) and populate via `authoredProvenance()`; add the `isReplaceableByOwnAuthoring` sibling.
*Verify:* extend the existing `envelopeAuthoringPlan` spec; assert every emitted spec carries `origin:'authored'`. **This commit fixes a live C58 §1.19 clause 3 violation on its own and is worth landing even if the rest slips.**

**C4 — The fourth `FootprintSource` route + the Draw button in the panel. → REACHABLE BY A USER.**
`resolveFootprintSource` (`parcelLawEnvelopeAuthoring.ts:327`) gains a first branch reading `drawnEnvelopeFootprintState`; `siteEnvelopeTool.ts` gains a "Draw the perimeter on this view" button that calls `armEnvelopeDraw()`, and the panel subscribes to the store so the source line updates the moment a ring lands.
*Verify:* the panel already has a spec (`apps/editor/src/ui/site/__tests__/siteEnvelopeTool.spec.ts`); add a case that seeding the drawn-ring store makes the panel's source line read *"the perimeter you drew"* and the Create button enabled. **At the end of this commit the feature is reachable from both site surfaces** (the map strip button `SiteBoundaryMap2D.ts:780` and `site.create-envelope` → `GISAreaLayout.ts:6200`) — with zero adapters, the Draw button honestly refuses by naming that no surface is attached. That refusal is the correct intermediate state, not a stub.

**C5 — The Cesium adapter. → the founder can draw on 3D Site.**
`siteEnvelopeDrawCesium.ts` implementing the port; constructed beside `boundaryTool` at `GISAreaLayout.ts:1013` and registered with the arming registry; `setScenePickingEnabled` added at `CesiumViewport.ts:2198` and called on arm/disarm.
*Verify:* the render-back already exists (`CesiumViewport.ts:6938-7070`), so the acceptance test is manual: draw → panel → 2 storeys → Create → two violet prisms appear, Ctrl+Z removes both. Unit-test the projection round-trip (`latLonToSceneXZ`/`sceneXZToLatLon`) headlessly; the pick cannot be tested without a viewer (see R4).

**C6 — The MapLibre adapter.**
`siteEnvelopeDrawMap2D.ts`; one branch added to `onClick` (`SiteBoundaryMap2D.ts:2666`) above the select dispatch; move/dblclick/key handlers re-attached on arm because `freezeDraw` detached them (`:3286-3300`); new preview source+layer.
*Verify:* spec asserting `grep -c "map.on('click'" SiteBoundaryMap2D.ts` stays at **1**. Manual: on a committed parcel, arm → click → vertices appear → dbl-click → panel populated.

**C7 — The mode strip.**
`DrawingModeBar` gains `container?: HTMLElement` + a `.wdh-bar--pane` absolute variant; mounted per pane via `SiteAuthoringPaneShell.getPaneElement(paneId)` (`SiteAuthoringPaneShell.ts:43-56`); six modes wired to a shared mode store read fresh per click (the `activeSlabDrawMode.ts:59-63` rule — never re-arm on a mode change, `DrawingModeBar.ts:68-75`). In the **same** commit, move `SiteBoundaryMap2D.ts:906-953`'s hand-rolled strip onto the shared component.
*Verify:* the existing `shellFloatBudget.spec.ts:154-186` must still pass — the pane variant is **not** in the shell budget (`SiteViewQuickToggle.ts:39-45`). Add a case asserting two simultaneously-armed panes do not stack two bars on `document.body`.

**C8 — L-13012:** declare `spaceEnvelope.batch.create` in `packages/sync-client/src/syncDisposition.ts`.

Modes ship in C7, so C5/C6 land with `linear` only — deliberate: a working single-mode draw the founder can use beats a six-mode strip that arms nothing.

---

## 6. RISKS AND UNKNOWNS

**R1 — The mode strip on a site surface is the artifact a founder complaint already suppressed.** `elementAuthoringContext.ts:9-14` quotes the founder's screenshot of *"the CEILING mode strip … rendered across the top of the 2D parcel map"*, and the module names as a future clause exactly *"block element authoring while the user is on a MapLibre parcel surface"* (`:67-83`). Post-onboarding the gate passes and the strip renders. **This is a founder decision, not an engineering task.** Ask before C7: *"an envelope mode strip on the 2D Site Map — is that the strip you asked to remove, or the one you asked for?"* The distinguishing fact is that his own strip request (`siteEnvelopeTool.ts:5-6`) is for *this* tool, and the suppressed one was for a BIM element with no business on a parcel map. C4 does not depend on the answer.

**R2 — Cesium click arbitration cannot be verified without running the app.** Whether `setupSelectionHandler` (`CesiumViewport.ts:2998`) and a second `ScreenSpaceEventHandler` both fire on one click, and in what order, is Cesium runtime behaviour. **Unknown.** Settled by: arm the tool on a live 3D Site and click once; if the selection silhouette also fires, the `setScenePickingEnabled` suspension in C5 is mandatory rather than defensive. Do not guess — `SiteBoundaryDrawTool` has shipped alongside the selection handler for months without anyone recording the interaction.

**R3 — `elementCreationMatrix` is a trap if you go near it.** `CreationView = 'plan' | '3d'` (`elementCreationMatrix.ts:56`) has no vocabulary for `site-3d`/`site-map-2d`, and the spec enforces registry membership **both ways** — a row declaring `'plan'` must have a plan handler and a row without must not, plus a `TOOL_MANAGER_TOOL_KEYS` cross-check. An envelope tool living on Cesium/MapLibre is in neither registry, so **both arms fail**. **Mitigation: this plan deliberately does not add a matrix row.** The strip takes a `CreationMode[]` literal; nothing asserts it came from `creationModes()`. Widening `CreationView` is a separate lane with its own spec updates.

**R4 — Screen→ground correctness is not unit-testable.** `scene.pickPosition` needs a real depth buffer; `globe.pick` needs a real globe. The **projection** half (`latLonToSceneXZ`/`sceneXZToLatLon`) is pure and must be round-trip tested; the **pick** half is manual-only. Accept it; do not build a fake viewer to feel covered — `[[fake-more-capable-than-real]]`: a fake built from the header cannot falsify the header.

**R5 — Frame/θ.** `boundaryProjection.ts:68` warns *"The XZ must be in the TRUE-north frame (undo any project-north θ first)"*, and `siteEnvelopeTool.ts:19-20` records that *"the 2D plan draws the AUTHORING frame de-rotated by θ from the 2D map BY DESIGN (ADR-0115)"*. The parcel ring is stored θ-free (`buildBoundaryFromLatLonRing` `:292-309` applies no rotation) and the envelope footprint shares that frame, so the site adapters are θ-free too. **The hazard is only if someone later mirrors this port onto the BIM plan surface.** Say so in the port's header.

**R6 — Origin drift.** Both adapters must project about `resolveSiteFrameOrigin` (`boundaryProjection.ts:106`), never about a re-read geocode. That function exists precisely because two competing origin authorities produced the founder's "sometimes shifted" Barcelona parcel (`:85-98`). One call, one origin, both adapters.

**R7 — Genuine surface difference (not adapter code):** the MapLibre `freezeDraw` state, §3b. Cesium has no counterpart. Do not paper over it with a shared "isFrozen" abstraction — it means different things on the two surfaces.

**R8 — Unknown: what the founder wants a *second* drawn envelope on the same storey to do.** Replace, or coexist and refuse? §4's supersession recommendation is a proposal. Settled by asking, with both behaviours named. Until then, the `blocked` arm's existing sentence (`levelEnvelopeSupersession.ts:220-224`) is the honest interim answer.

---

## 7. WHAT NOT TO DO

1. **⛔ Do not add a second `map.on('click', …)` on MapLibre.** One binding, one ladder, add a branch at `SiteBoundaryMap2D.ts:2666`. L-69 is already recorded in that file at `:2679-2683` as the cost of the alternative.
2. **⛔ Do not construct a Cesium `ScreenSpaceEventHandler` without suspending `setupSelectionHandler`** (`CesiumViewport.ts:2998`). Two live handlers on one canvas is the same defect wearing a different renderer.
3. **⛔ Do not fork the gesture.** `BoundaryPathAuthor` is the ortho rule, the arc gesture and the undo semantics for the whole slab family after a founder ruling (`boundaryPath.ts:88-118`). A fourth hand-written polyline machine is what `SlabTool.ts:175` already is, and it has **already diverged** (it applies `snapToAxisOrDiagonal` in linear mode; the plan handler does not). Do not make it 5-way.
4. **⛔ Do not build a bespoke draw surface per view.** Two adapters against one port, three methods each. If an adapter grows a `canClose()` or an area calculation, it has stolen work that belongs above it.
5. **⛔ No `import * as THREE` outside `packages/renderer-three/`** (P2, hard-fail, `tools/ga-gate/check-three-imports.ts`). And the softer version that will bite first: **no barrel import of `@pryzm/geometry-slab` from a site file** — `index.ts:85` re-exports `SlabTool`, which pulls THREE into the Cesium chunk. Use the `./boundary-path` subpath from C1.
6. **⛔ Do not mint a second mode table.** Six modes from `BoundaryDrawMode` + `BoundaryLoopMode`. And do **not** merge them with `SiteBoundaryGesture` (`SiteBoundaryMap2D.ts:905`) — L-1322 at `:899-903` is explicit that the two share three words and nothing else, and that *"merging two things because they share three words is how the five spellings happened."*
7. **⛔ Do not mint a second loop generator.** `boundaryLoops.ts:250/273/291` (scene-XZ) is the envelope's; `rectBoundary.ts:45` / `circleBoundary.ts:100` / `ellipseBoundary.ts:128` (lat/lon) stay the parcel tool's. Different frames, different subjects, no merge.
8. **⛔ Do not mint a second area routine.** The ring's producer states the area; `buildEnvelopeAuthoringPlan` echoes it and refuses to recompute (`envelopeAuthoringPlan.ts:164-170`). `SiteBoundaryDrawTool.ts:359-368`'s private `signedAreaAbs` is a third; hoist one, do not add a fourth.
9. **⛔ Do not make the mode strip re-arm the tool.** `onSelect` writes the store and returns — `DrawingModeBar.ts:68-75`. The strip's `escHint` is `'ESC to cancel'`, not the default `'ESC to finish'` (`:151-153`): on the site surfaces ESC cancels and dbl-click/Enter finishes, and shipping the slab's four-ESC-owner layering here would be inheriting a hazard by accident.
10. **⛔ Do not build a second commit path.** `buildEnvelopeAuthoringPlan` → `bus.executeCommand`, one verb, one undo. `siteEnvelopeTool.ts:16-23` and C58 §1.19 clause 1 both state this normatively, and the slab's two-producer split (`SlabPlanToolHandler.ts:419` bus vs `SlabTool.ts:483-486` legacy `commandManager`) is the chain's worst seam and the source of at least two founder-reported defects.
11. **⛔ Do not add an `elementCreationMatrix` row, a `planToolHandlerRegistry` key, or a `TOOL_MANAGER_TOOL_KEYS` entry** to "do it properly". Those three registries describe the BIM plan/3D surfaces; an envelope tool on Cesium/MapLibre is in none of them, and the specs enforce membership **both ways**. Adding a row to look complete turns a green suite red for a claim the code does not make.
12. **⛔ Do not ship the arm without the disarm** (`activatePlanOnlyTool.ts:603-620`, L-7801: Escape unwound the chrome and left the handler live, so the next click created another element). Same commit, both directions.