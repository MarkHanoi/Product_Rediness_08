# Session Status — 2026-06-08

**Branch state as of 2026-06-08**
- Local `main` HEAD: `62cba8b7` (docs(tracker): A.21.D45/47/48/49 consolidated row)
- `origin/main` HEAD: `4950511c` (ci: stage v54 marker — hold push until v53-retry resolves)
- **14 commits on local `main` not yet pushed to `origin/main`** (D44, A.26.5, D50 tracker, D47, D48, D45, D49 + docs row, and the D46 corridor-physiognomy pair at the very top)
- Last confirmed Fly deploy: **v54** at `4950511c` (A.26.2 + A.26.4 + C52; v53-retry re-trigger was `36c204d1`; v54 marker states "hold push until v53-retry resolves" — deploy may be pending)

---

## ✅ DONE (merged to local `main`)

Items are code-complete and merged; those marked **DEPLOYED** are also on `origin/main` and visible on `pryzm.fly.dev`. The rest are merged locally but **PENDING DEPLOY** (the 14-commit gap described above).

### A.21.D41 — DEEPER/QUEUED close-out (v51 wave)
Four root-cause items from v50 now fixed and merged:
- **Central-blob subdivision** — `programRules.isOpenPlanEligible` guard; private/wet/circulation rooms always walled. `fd8352b3` / `569037f4`. **DEPLOYED** (origin contains v51 commits).
- **Generation perf** — room-naming sync fast-path (5–10 s saved/storey) + scoped post-batch PBR upgrade via WeakSet + `skipPbrUpgrade:true` on rename batch. `53cfccd7` / `128c5108`. **DEPLOYED**.
- **Climate-on-Forma** — dead `window.projectContext.projectId` fallback replaced by `resolveActiveProjectId` → `window.__pendingProjectId`; `ensureClimateIfMissing` repaints on already-present dataset. `5bb4316c` / `4fbea3ec`. **DEPLOYED**.
- **Wall-joins (T-junction / pass-through flush)** — `§PASS-THROUGH-FLUSH` detects near-collinear pass-through pairs → square caps at consensus point, eliminating the triangular gap. `047dc8be` / `1b0fbded`. **DEPLOYED**.

### Per-room door/window types (AI-pipeline Gap B)
`buildLayoutCommands` now stamps the real `dt-*` / `wt-*` catalogue id onto `wall.createOpening`; per-room resolver wins over the global fallback. `e424cc5f` / `72162d18`. **DEPLOYED**.

### Furnish realism — bedside lamps (D-FLE)
Bedside task lights placed on nightstands in generated bedrooms; surface-mounted accessory exempted from floor-plan overlap check. `4167c267` / `f87d51e7`. **DEPLOYED**.

### A.25.3 — Living-design sliders (adjacency / accessibility / climate / space)
Four remaining slider axes wired to the engine substrate via a new `EngineTuning` threaded payload; neutral position = byte-identical baseline; +15 tests. `6db85c9a` / `4842c196`. **DEPLOYED**.

### A.21.D42 — 7 founder defects + Cesium dedup (v52 wave)

| # | Defect | Fix | Commit | Deploy |
|---|--------|-----|--------|--------|
| #1 perimeter corners bad at end | Already in v50/v51 §rebuildWallBodies + §PASS-THROUGH-FLUSH | See D41 | DEPLOYED |
| #2 window near corner / out of shell | D40 §WINDOW-CORNER-SPAN + de-overlap | See D40 | DEPLOYED |
| #3 internal T walls not joining | D41 §PASS-THROUGH-FLUSH | See D41 | DEPLOYED |
| #4 internal L walls not joining | v50/v51 partial; regression agent confirmed | See D40/D41 | DEPLOYED |
| #5 stair-in-centre + perimeter strategy | Perimeter worst-aspect placement (north default from siteLatitude) + §STAIR-OBSTACLE-CARVE dominant-rect carve; regression-fix re-applied with 3 invariant tests fixed. ai-host 1975/1975. | `4bd38f09` / `71f9e9f7` | DEPLOYED |
| #6 boundary shadow (grey plane in plan + 3D) | Room-fill overlay (`RoomBoundaryBuilder` `isRoomOverlay`) gated out of pure 3D view | `090ec2cc` / `e3469e9a` | DEPLOYED |
| #7 wall-opening seam (vertical break at cut) | `WallHoleBodyBuilder` — one continuous `ExtrudeGeometry` (face minus hole/notch), seamless; safe fallback for mitered/overlap walls. geometry-wall 39/39. | `e35c33fc` / `60ef8df9` | DEPLOYED |
| Cesium context dedup | `photorealTilesActive` flag suppresses PRYZM's own 2069 OSM boxes when Google 3D-Tiles active | `497b348e` / `4df307e6` | DEPLOYED |
| House in real BIM colours on globe | `resolveMassFill` renders per-element BIM `materialColor` on the globe (not Forma pastel) | `497b348e` / `4df307e6` | DEPLOYED |

### A.21.D43 — Forma-view context floating + larger dataset + opaque glass (v52)
- Context float root: `applyFormaMode` resets `formaTerrainBaseHeight=0` on entry.
- Context bbox `0.005° → 0.0125°` (~2.8 km square).
- Window glazing: `outline:false` honours `FORMA_GLAZING_ALPHA`.
- `e73bbd6f` / `be2df7d2`. **DEPLOYED**.

### A.26.1 — Select room in graph → highlight in 3D
Already shipped via GRAPH.4 + `livingGraphSelection`. **DEPLOYED**.

### A.26.3 — Edit room AREA in graph → engine re-runs → layout updates (v53, THE headline demo)
Per-room area override stash (`activeRoomAreaOverrides`) → `gatherLayoutPayload` → debounced `triggerApartmentLayout` → `bubbleGraph` → layout rebuilds + graph re-lays-out. ADR-0061 PROPOSED. +7 tests, ai-host 1982. `80297cfd` / `f0a5b5ca`. **DEPLOYED**.

### A.26.2 — Living Graph adopts Inspect-tab chrome (v54)
Purple gradient header + white "Inspect · Living Graph" title + movable/zoomable/resizable; all existing editing + interrogation intact. ADR-0061 promoted ACCEPTED; **C52 contract authored** (editable-graph node/edit model). `9ca7b33b` / `7c159150`. **DEPLOYED**.

### A.26.4 — Edit room occupancy/type in graph → engine re-types → layout adapts (v54)
New `roomTypesByName` per-instance override consumed in `buildBubbleGraph`; inspect card `<select>` with "— (detected)" clear. Tests: `roomTypeOverride.test.ts`. `9ca7b33b` / `7c159150`. **DEPLOYED**.

### A.21.D44 — Floating grey plane in 3D (parcel-boundary fill)
`ParcelBoundarySceneRenderer` fill tagged `isParcelBoundaryFill=true`; gated hidden in pure 3D view (mirrors D34c/D42 #6 gates); visible in site/GIS/plan. `be895f9b` / `afdd33a7`. **PENDING DEPLOY**.

### A.26.5 — Inverse projection: model edit → graph live + select-in-3D → highlight-in-graph (C52 §3.3)
- A.26.5a: overlay subscribes to `bim-*` DOM events + debounced (~400 ms) rebuild via `rebuildGraphFromModel()`.
- A.26.5b: `selectionBus` → `roomIdForElement` → graph node emphasised (exact inverse of A.26.1).
- Bidirectional loop CLOSED. C52 fully canonical. Tests: `livingGraphSelectionReverse.test.ts` (8 cases).
- `5288ab71` / `297d7022`. **PENDING DEPLOY**.

### A.21.D45 — Window corner setback
`cornerSetbackForWall(len) = clamp(0.10·len, 0.5m, 1.2m)` at both ends; width-clamp-or-drop; D40 de-overlap + D6 solar intact. `7c8e4cd0` / `9d101188`. **PENDING DEPLOY**.

### A.21.D47 — Door minimums + every-room-access
§DOOR-MINIMUMS in programRules (habitable/circulation 0.80 m, entrance 0.90 m, wet 0.70 m); `addDoor` clamps up / refuses too-short wall; §SEALED-ROOMS every-room-access guarantee. `d18c7e12` / `03d89f53`. **PENDING DEPLOY**.

### A.21.D48 — Floor finish seated on slab top (no coincident overlap)
`resolveFinishSeating()` + `DEFAULT_FINISH_THICKNESS_M=0.015` seats finish bottom-on-slab-top → disjoint volumes (was z-fighting at coincident offset). `3eb62555` / `faa67e7e`. **PENDING DEPLOY**.

### A.21.D49 — Real BIM model on photoreal 3D tiles (glTF primitive)
`exportFragmentsToGLB` → `Cesium.Model` primitive depth-tested vs tiles, seated at v50 sampleHeight clamp; Forma study mode stays massing; failure falls back to massing. ai-host 2006/2006. `d612e5f8` / `d8001e09`. **PENDING DEPLOY**.

### A.21.D46 — Corridor physiognomy (narrow strip, not fat cell)
`programRules.corridor` gains `maxShortSideM 1.2` + `minLongSideM 2.0` + `maxLongSideM 6.0`; `tryCarveCorridor` clamps width ∈ [1.0,1.2] m and length to 6 m; `reshapeCorridorStrip` post-pass narrows fat squarified cells; freed area redistributed. 9 new tests, ai-host 1999/1999. `bbfffb5c` / `5b472cfb`. **PENDING DEPLOY** (these are the two commits at the very top of local main).

---

## 🔄 IN PROGRESS

### A.21.D50 — Forma-massing wall joints + window transparency
Tracker row added (`01ca5d52`). Sequenced behind D49 (same `CesiumViewport.ts`). Two issues:
1. Massing falls back to per-wall boxes → corner gaps; fix = ONE extruded perimeter ring per storey.
2. Forma window glazing still renders opaque despite `outline:false`; re-audit `FORMA_GLAZING_ALPHA` vs `resolveMassFill` path.
Status: **🔵 QUEUED (sequenced behind D49)** — not yet started as code; D49 is now merged so this can start.

### A.26.4 — E3 adjacency-pref + E4 sun/acoustic attributes
C52 §2 defines E3 (adjacency preference edit → adjacency-strictness scorer axis) and E4 (sun/acoustic target → existing scorer axes) but these are **not yet implemented**. A.26.4 shipped E1 (area) + E2 (occupancy); E3/E4 are the remaining follow-ons. Status: queued per tracker row.

### A.25.4 — Graph-linked "what changed + why" overlay
Not yet started; queued after A.25.1/.2/.3. Tracker status: queued.

### Deploy gap — 14 commits pending push
Local main is 14 commits ahead of `origin/main`. The v54 ci marker itself notes "hold push until v53-retry resolves". Items in the PENDING DEPLOY list above (D44, A.26.5, D45, D47, D48, D49, D46) are code-complete but not yet live on `pryzm.fly.dev`.

---

## ⬜ NOT STARTED / QUEUED

### DEEPER/QUEUED items from D41 that remain open
- **Generation perf** (PBR upgrade + PSO compile): The named D41 perf items were fixed but the D41 tracker note calls out follow-up items (D41 is ✅; any residual perf sits in the general perf queue).
- **Climate-on-Forma further** — D41 closed the dead-projectId root; wider climate viz upgrades (D35 wind streamlines / gradient heat map) remain in the queue.

### Window-per-room / maximise daylight (every room gets a window)
The D6.x solar orientation work (`A.21.D6.1/D6.2/D6.3` — climate-driven window placement + passive-solar sizing) was on the feature branch `feat/daily-use-and-production-readiness-2026-05-20` at the start of this session and has not been tracked as merged to `main` yet. The git log on `main` does not contain `A.21.D6.2` or `A.21.D6.3`. Current `main` has D36's "window-in-shell" (every generated room placed on an external wall gets a window) and D45's corner-setback. The full solar-orientation LIVE end-to-end (D6.2) is **NOT yet on main** — needs merge.

### FOUNDER token actions
- **ion asset 2275207 on `VITE_CESIUM_TOKEN`**: tracker row A.21.D31 documents the fix is purely infra — set the `VITE_CESIUM_TOKEN` repo secret to a valid Cesium ion token; the code (`Cesium3DTileset.fromIonAssetId(2275207)`) is already gated on the env var. **Action owner: founder/infra (GitHub Secrets). No code change needed.**
- **Rotate token 395639**: tracker A.21.D36 notes the hardcoded Cesium token was removed as a security fix (`1c09f78e`). Token 395639 (the old hardcoded one) should be rotated / revoked in the Cesium ion console. **Action owner: founder (Cesium ion dashboard). No code change needed.**

### A.21.D50 — Forma wall joints + window transparency (already listed above as In Progress / Queued)
See In Progress section. Sequenced behind D49; D49 is now merged so this unblocks.

### A.26.4 — E3/E4 (adjacency-pref + sun/acoustic editable in graph)
See In Progress section.

### A.25.4 — Graph-linked "what changed + why"
Not yet started.

### A.21.D38 — Wall↔slab vertical continuity (dark band at floor junctions)
Tracker status: QUEUED. Fix: level walls rise to mid-height of next slab; next level walls start from slab mid-height. No code yet.

### A.21.D37 — Living Graph UX: Miro/Mural canvas + select-to-isolate
Tracker status: QUEUED. A.26.5b (select-in-3D → highlight-in-graph) was shipped; the MIRO/MURAL free pan+zoom-to-cursor canvas and the isolate-in-view toggle are not yet done.

### C52 — Editable Building Graph (E3 adjacency + E4 sun/acoustic attributes)
C52 §2 table: E3 adjacency-pref + E4 sun/acoustic are listed as planned but not yet implemented. E1 area + E2 occupancy are ✅.

### ADR-0061 — follow-on governance
ADR-0061 is ACCEPTED (promoted in v54). C52 contract is canonical. The remaining governance item is the C-contract extension for E3/E4 attributes.

---

## Summary counts (2026-06-08 session)

| Category | Count |
|---|---|
| Merged + DEPLOYED to origin/main | ~18 items across D41/D42/D43/A.26.1/.3/.2/.4/A.25.3/furnish/per-room |
| Merged to local main, PENDING DEPLOY | 7 items (D44, A.26.5, D45, D47, D48, D49, D46) |
| In progress / partially done | 3 items (D50 queued-behind-D49-now-unblocked, A.26.4 E3/E4, A.25.4) |
| Not started / founder infra action | 4 items (window-per-room D6.x on feature branch, ion token secret, token rotate, D38 wall↔slab band, D37 Miro canvas) |
