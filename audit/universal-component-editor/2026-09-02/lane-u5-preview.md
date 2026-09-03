# Lane U5-PREVIEW — the live 3-D preview for the component editor

**Date:** 2026-09-03 · **Status:** SHIPPED (no commit, per brief) · all scoped suites green,
root tsc clean (verification transcript at the bottom).
**Surface touched:** `apps/editor/src/ui/component-preview/` (new) ·
`apps/editor/src/ui/element-preview/` (two additive edits) ·
`ComponentDefinitionWorkspace.ts` · `ComponentBrowserPanel.ts` · root `vitest.config.ts`
(allowlist line) · tests. ⛔ `packages/site-parcel-data`, `server/`, SceneQualityTier /
material-traverse renderer internals: untouched.

## The gap

The §64 authoring loop ran end to end (U0–U4, U-SEED, U6) but the user could not SEE the
component — no 3-D preview anywhere on the authoring surfaces. The founder's demo
(`GlassWidth = Width - 2 * FrameWidth`) was a number in a table.

## What pattern was reused (grep-for-the-existing-solver-first — both halves)

1. **The evaluator is `bakeFamilyInstance`** (`@pryzm/family-instance`) — the SAME call the
   placed component's committer makes (PluginRegistry's 4E wiring: `entry(id).family` →
   `bakeFamilyInstance`). The preview module computes **no dimension of its own**: it forwards
   the bake's `BufferGeometryDescriptor` buffers verbatim and derives only the centring offset
   (from the descriptors' own bounds) and a rebuild key. That is **L-127** — *"preview and
   placement MUST both call the resolver so preview ≡ placed"* — applied to components:
   `preview ≡ placed` holds **by construction**, because both surfaces draw the same buffers
   (the committer through `plugins/component/src/committer/geometry-bridge.ts`, the preview
   through the new mesh-part arm below).
2. **The renderer is the shared element-preview rig** (`§OPENING-SHOWROOM-PREVIEW`,
   `ElementPreviewRenderer.ts` / `ElementPreviewCanvas.ts`) — ONE offscreen WebGL context for
   every preview in the application, draws on-demand through
   `getFrameScheduler().scheduleOnce` (P3: no rAF, no loop — an idle preview is not running),
   THREE only behind the `@pryzm/renderer-three/three` P2-legal path, honest draw-failure
   vocabulary (`PreviewDrawResult`), orbit + keyboard + a11y already built.
   ⛔ **Deliberately NOT the `FurnitureThumbnailService` pattern** — its dedicated offscreen
   `WebGLRenderer` is the exact context-leak shape the rig's header documents (browsers cap
   live contexts and evict the OLDEST — the main viewport). Zero scene-wide cost: nothing here
   touches the main scene, its materials, or its quality tiers.

## What shipped

### 1. `PreviewMeshPart` — a third, additive member of the subject union
`OpeningPreviewSubject.ts`: `{kind:'mesh', position, normal, index, center, …}` — baked
buffers, THREE-free (typed arrays are ECMAScript). `isMeshPart` predicate added; **`isBoxPart`
rewritten to `!('kind' in part)`** — its old body (`!isExtrudedOutlinePart`) would have passed
a mesh part as a box, and TS does not check predicate bodies. `ElementPreviewRenderer.ts`
`buildContent` gained the mesh arm (`meshPartGeometry` — wrap, never copy, no crease welding,
no normal recompute: the same contract `buildComponentBufferGeometry` states). Both edits
follow the §OUTLINE81 precedent that added the `extrudedOutline` member.

### 2. `apps/editor/src/ui/component-preview/` — the new module (4 files)
- **`componentPreviewSubject.ts`** — THREE-free: `(family, typeId, overrides)` →
  `bakeFamilyInstance` → `PreviewSubject` of mesh parts, or a **typed refusal**
  (`no-type | unknown-type | resolver-failed | no-solids | nothing-baked | bake-threw`)
  carrying the evaluator's own sentences + resolver diagnostics + per-solid refusals. A
  PARTIAL bake is `ok` with non-empty `unsupported` and a caption that COUNTS
  (`"2 of 3 solid(s) shown — 1 refused"`) — a partial render can never read as complete.
  Subject key = djb2 over the bake-relevant content (parameters/profiles/solids/type
  values/typeId/overrides), so an UNSAVED workspace draft re-keys on every accepted op even
  though its stored `schemaHash` is stale.
- **`ComponentPreview.ts`** — the mountable live widget: `mountComponentPreview(host)` →
  `{update, lastResult, lastDrawResult, dispose}`. Composes `mountElementPreview` (it owns
  canvas/orbit/failure overlay). Adds: newest-wins token on `update` (a superseded bake paints
  nothing); the refusal surface; the partial strip. ⛔ **Stale-shape rule:** on refusal the
  inner showroom is **disposed** — the previous geometry is gone, not covered, and the claim
  on the shared rig is released while the refusal stands.
- **`componentThumbnails.ts`** — `getComponentThumbnail(req)` → dataURL, cached
  `schemaHash:typeId:sizePx` (schemaHash IS the loader's content hash → no manual
  invalidation). Only DEFINITION-level outcomes are cached (image / evaluation refusal);
  DRAW-level failures (`no-webgl`/`context-lost`/`no-2d-context`) are reported but NOT cached
  — a driver hiccup must not freeze into "this definition has no preview".
  `holdComponentThumbnailRig()` lets a panel keep one rig claim for its open lifetime.
- **`index.ts`** — the barrel.

### 3. Mount (a): the U3 workspace — LIVE
`ComponentDefinitionWorkspace.ts`: a persistent `data-cdw-preview-host` (the chat-host
pattern — same node re-appended across the card's full-rebuild renders, so the canvas, orbit
state and rig mount survive), a "Preview" section under the scope selector, and
`refreshPreview()` at the end of every `render()` — i.e. after **every accepted op** and every
scope switch, evaluating the CURRENT draft under the CURRENT scope. Handle additions:
`previewSettled()` (awaits the latest refresh) and `previewResult()` (the applied evaluation).
`close()` disposes. The preview follows the scope honestly: "Definition defaults (no type)"
refuses by name (`no-type`) instead of inventing a scope.

### 4. Mount (b): the U1 browser cards — static thumbnails
`ComponentBrowserPanel.ts`: each definition card carries a 56 px `data-component-browser-thumb`
box (card restructured to thumb + body columns; all existing `data-component-browser-*`
selectors preserved as descendants). Async fill via `getComponentThumbnail` (first type);
three named states on the DOM: `ok`/`partial` (img, `partial` titled), `refused`
(compact "no 3-D preview" + the full sentence on `title` + the typed reason in
`data-component-browser-thumb-reason`), `not-loaded`. The panel holds the rig for its open
lifetime (`open()` → `holdComponentThumbnailRig()`, `close()` → release).

### 5. The §64 demo is now VISUAL (proven, not asserted)
`apps/editor/__tests__/componentPreviewLiveSurfaces.test.ts` (real packFamily → the ONE
catalogue → the real workspace opener; no verb dispatched — stated in its header):
glass mesh **1.000 m** (default) → `applyExpression('Width - 2 * FrameWidth')` →
**1.050 m** → scope W-1400 → **1.250 m** — measured off the bake's own position buffers.
Honest arm: a formula naming a missing parameter flips the preview to `refused` with
`unknown-identifier` in the resolver's own words and **no canvas in the DOM**; deleting the
bad edit recovers. Browser arm: under happy-dom (no WebGL) the card names the DRAW-level
cause (`no-webgl`) — which simultaneously proves evaluation succeeded, because an unevaluable
definition names its resolver reason instead.

## Tests (all mine; suites named for re-run)

| Suite | Result |
|---|---|
| `apps/editor/src/ui/component-preview/__tests__/componentPreviewSubject.spec.ts` — the pure half: **Window seed shape at Width 1200 → glass 1.050 m; 1400 → 1.250 m** (mm→m across `§4D-ONE-LENGTH-SEAM`), topology invariance, union extent, caption counts, all six refusal arms | 6/6 |
| `componentPreviewMount.spec.ts` — widget states (empty/ok/refused/partial), stale-shape teardown + recovery, newest-wins, rig-claim balance, thumbnail cache discipline, source-level wiring of both mounts | 9/9 |
| `apps/editor/__tests__/componentPreviewLiveSurfaces.test.ts` — the §64 visual loop + honest degradation + browser thumbnail, at the layer the user experiences | 5/5 |
| Root allowlist: `vitest.config.ts` gained `component-preview/__tests__` **in the same change as the files** (§L-851 — a spec outside the allowlist is never discovered) | — |

Neighbours re-run (union change + mounts): element-preview 4 specs, component 3, workspace 1,
type-catalog 1 → **9 files / 92 tests green**. Composed component suites + root tsc: see
the verification section below.

## Fixture honesty note
The U-SEED starter Window's PROFILE is a static rect (`makeRectProfile` literals) — only its
extrusion length is parameter-bound (`'Height'`). The preview renders that document as it IS.
The test fixtures bind the glazing profile coordinates to `GlassWidth` via expression strings —
a capability `profileToPolygon` already ships (§4D-ENTITY-READ-CONTRACT, spec §67, no schema
change) — which is what makes the glass measurably shrink. **OWED (server lane, not mine —
`server/familySeeds.js` is out of my surface):** bind the starter Window's glazing the same way
so the shipped seed's preview shrinks too; today the seed previews as its true static-profile
geometry (honest, just less demonstrative — changing Height DOES visibly re-extrude).

## OWED / follow-ups
1. **Materials.** `MaterialSlotSchema` carries no material identity (`{id, name,
   defaultCategory}`), so parts render a neutral schematic hex (`#aeb6c2`) via `fallbackHex` —
   deliberately NOT the C100 §5 magenta (nothing was LOST; the document declares no material).
   When slots gain ids, thread `materialId` through `partName`'s slot lookup and delete the hex.
2. **Orbit-state persistence per definition** — the workspace preview keeps its orbit across
   re-renders (persistent mount) but a close/reopen resets to `DEFAULT_ORBIT`. Fine for v1.
3. **Thumbnail re-render on save** — cache keys on `schemaHash`, so a saved edit re-thumbnails
   automatically; a REFUSED draw (e.g. context-lost) is retried on the next `_renderList` but
   there is no push-refresh mid-open. Acceptable: the subscribe loop re-renders on every
   catalogue event.
4. **`@pryzm/family-instance` is not in `apps/editor/package.json`** — inherited state (lane 4F's
   `ComponentParameterTable` already imports it; it resolves via the ROOT manifest's
   `workspace:*` dep). Flagged, not fixed here — a manifest edit desyncs `pnpm-lock.yaml` for
   every concurrent lane ([[agent-packagejson-breaks-frozen-lockfile]]).
5. **Concurrent thumbnail requests for one key** both bake (last write wins, same value) — a
   promise-keyed cache would dedupe; not worth it at card counts.
6. **The composed-runtime suites do not start the frame scheduler**, so real draws never tick
   there; `componentPreviewLiveSurfaces.test.ts` starts it exactly the way
   `bootstrap.render.everything.ts:258` does. If a future suite mounts the browser panel and
   awaits thumbnail states, it must do the same or the state attribute never lands.

## Verification (executed in the foreground, this lane)
- `npx vitest run apps/editor/src/ui/component-preview/__tests__/` → **2 files / 15 tests, green**.
- `npx vitest run apps/editor/src/ui/{element-preview,component,component-editor-workspace,component-type-catalog}/__tests__/` → **9 files / 92 tests, green**.
- `apps/editor: npx vitest run __tests__/componentPreviewLiveSurfaces.test.ts` → **5/5 green**
  (the `ECONNREFUSED 127.0.0.1:3000` stderr is the browser's starter auto-discovery fetch,
  caught inside `listMarketplace` — the documented U-SEED behaviour, not a failure).
- Composed component suites (apps/editor config): batch 1 — starter-library/new-component +
  workspace + type-catalog + catalogue-seam → **4 files / 28 tests, green**; batch 2 —
  placement + property-section + join + authoring-chat + ai-slice → **5 files / 39 tests,
  green**. Every existing component suite stays green.
- **Root tsc** (`NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p tsconfig.json --noEmit
  --skipLibCheck`): **RC=2 with exactly 11 errors, ALL in
  `packages/site-parcel-data/src/countryAdapters/ro/index.ts` + `sk/index.ts`** — the
  concurrent countryAdapters wave's untracked files, the IDENTICAL pre-existing set lane
  U-SEED recorded at HEAD. Grep of the full tsc transcript for every file this lane touched
  (`component-preview|element-preview|ComponentDefinitionWorkspace|ComponentBrowserPanel|
  componentPreview*`) → **zero hits: my files are tsc-clean**. (⚠ an earlier probe of this
  lane piped tsc through `tail` and echoed `RC=0` — that was TAIL's exit code, the
  trailing-error trap; the honest run above redirects first and reads tsc's own RC.)
- `npx eslint` over every touched file → **0 findings**.
- **P2 gate** `check-three-imports.ts` → OK, 0 importers outside `packages/renderer-three/`
  (my module has zero THREE; the mesh arm lives on the rig's existing P2-legal path).
- **P3 gate** `check-raf-count.ts` → **RC=1, PRE-EXISTING and NOT this lane**: 2 owners —
  `packages/frame-scheduler/src/RafAdapter.ts` (the sanctioned one) and
  `tools/perf/outer/outer-baseline.spec.ts`, COMMITTED by the perf lane (`7fa60a2b`,
  §FOUR-AXES). No component-preview or element-preview file appears in the owner list
  (BimWorld/RenderingPipelineCoordinator are comment-only mentions), and a direct grep of
  `apps/editor/src/ui/component-preview/` for `requestAnimationFrame` is empty. Flagged for
  the orchestrator/perf lane; fixing a perf-lane file is outside this lane's surface.
