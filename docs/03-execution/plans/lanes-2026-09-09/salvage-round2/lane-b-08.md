{
  "defectId": "envelope-face-drag-not-working-on-3d-site",
  "rootCauseFound": true,
  "rootCause": "The 3-D Site face-drag gesture is INSTALLED EXACTLY ONCE PER TAB and is TORN DOWN UNCONDITIONALLY by the project-scope clear, with no re-install path anywhere in the codebase. The install lives inside `ensureGisInitialized`, which is one-shot: `GISAreaLayout.ts:1006` `if (gisInitPromise) return gisInitPromise;` (reset only at `:1451`, inside the `.catch` of a FAILED mount) and the wiring body is further nested in `:1042` `if (!cesiumViewport) {`. `mountGISArea` itself runs once per tab (`declaredProjectScopes.ts:251`: \"mountGISArea() runs once per tab, so every `let` inside it is app-lifetime CLOSURE state\"), so there is no second mount that could re-wire. Meanwhile the teardown is reached on EVERY project switch and EVERY project load: `PlatformShell.setProjectContext` emits `pryzm-project-switch` (`PlatformShell.ts:248`), `siteProjectScope.ts:287` runs `projectScopeRegistry.clearScopes(GIS_SWITCH_SCOPES)` (which includes `gis.areaLayout`, declared at `declaredProjectScopes.ts:249`), and `ClearProjectCommand.ts:246` runs `projectScopeRegistry.clearAll()` as \"the first step of ProjectLoader.load()\" (`ClearProjectCommand.ts:21`). Both routes call the `gis.areaLayout` scope's `clear`, which is `clearLayoutProjectState` (`GISAreaLayout.ts:159` -> `:8526` -> `:8479`), and that function does `envelopeFaceDrag3dDispose?.()` (`:8504`, removes all six pointer listeners from the Cesium canvas) and `envelopeFaceDrag3dUnregister?.()` (`:8509`, removes the only registered face-drag surface — no other module calls `registerSpaceEnvelopeFaceDragSurface`, so the count drops to 0). `projectScopeRegistry.reseedAll()` runs immediately after `clearAll()` but the `gis.areaLayout` registration declares only a `clear` (`GISAreaLayout.ts:156-161`), no `reseed`. Result: after the first project-scope clear that follows the install, the 3-D Site has no face-drag listeners and no face-drag registration for the rest of the tab. The DRAW path deliberately survives the same teardown — `:8498` calls only `envelopeDraw3d?.disarm()` and never `envelopeDraw3dUnregister` — which is exactly the founder's asymmetry: \"I just created the envelopes\" still works, dragging their faces does not. Two concrete orderings put the clear AFTER the install: (1) DETERMINISTIC — the second and every later project opened in one browser tab: the engine (and `mountGISArea`) boots only on the first open, so a later open's `pryzm-project-switch` destroys a gesture that can never be re-installed; (2) RACY BUT LIKELY — the onboarding/new-project path, where `PlatformRouter.showOnboarding` calls `requestEagerGlobeStart()` + `prewarmGlobe()` (`PlatformRouter.ts:734,758`), so `ensureGisInitialized('eager')` (`GISAreaLayout.ts:2612`) ADOPTS an already-mounted viewport (`:1076`, skipping the `await mount()`) and can complete its wiring during `initUI`, i.e. before `setProjectContext` fires the switch.",
  "evidence": [
    {
      "file": "apps/editor/src/ui/layout/GISAreaLayout.ts",
      "line": 1006,
      "quote": "if (gisInitPromise) return gisInitPromise;",
      "why": "The install is inside this one-shot. `gisInitPromise` is nulled only at :1451, inside the `.catch` of a failed Cesium mount — so a SUCCESSFUL init can never re-run, and the face-drag wiring at :1336 can never be re-executed."
    },
    {
      "file": "apps/editor/src/ui/layout/GISAreaLayout.ts",
      "line": 1336,
      "quote": "envelopeFaceDrag3dDispose = installSpaceEnvelopeFaceDragOnSurface({",
      "why": "The ONLY site in the repo that binds the face-drag pointer listeners to the Cesium canvas (`domElement: dragCanvas` = `viewer.scene.canvas` via `dragDomElement()` at :1284). It exists nowhere else, so once its disposer runs the gesture is gone."
    },
    {
      "file": "apps/editor/src/ui/layout/GISAreaLayout.ts",
      "line": 8504,
      "quote": "try { envelopeFaceDrag3dDispose?.(); envelopeFaceDrag3dDispose = null; }",
      "why": "Inside `clearLayoutProjectState` (:8479). This removes pointerdown/move/up/cancel/leave/dblclick from the canvas. Nothing re-adds them: `ensureGisInitialized` is already settled and `mountGISArea` runs once per tab."
    },
    {
      "file": "apps/editor/src/ui/layout/GISAreaLayout.ts",
      "line": 8509,
      "quote": "try { envelopeFaceDrag3dUnregister?.(); envelopeFaceDrag3dUnregister = null; }",
      "why": "Drops the ONLY face-drag surface registration. `registerSpaceEnvelopeFaceDragSurface` is called from exactly one production site (GISAreaLayout.ts:1273) — grep confirms BIM 3-D never registers — so `registeredSpaceEnvelopeFaceDragSurfaces()` becomes 0 and the panel's Drag face button falls to SPACE_ENVELOPE_FACE_DRAG_NO_SURFACE_REASON."
    },
    {
      "file": "apps/editor/src/ui/layout/GISAreaLayout.ts",
      "line": 8498,
      "quote": "try { envelopeDraw3d?.disarm(); }",
      "why": "THE ASYMMETRY. The same teardown only DISARMS the perimeter-draw surface and never calls `envelopeDraw3dUnregister`, so creating envelopes on the 3-D Site keeps working after the clear while face-drag is destroyed — exactly the founder's report."
    },
    {
      "file": "apps/editor/src/ui/layout/GISAreaLayout.ts",
      "line": 159,
      "quote": "clear: () => { _gisLayoutDelegate?.clear(); },",
      "why": "Module-scope registration of the `gis.areaLayout` project scope. It declares ONLY `clear` — no `reseed` — so `projectScopeRegistry.reseedAll()` (ClearProjectCommand.ts:249) cannot restore anything this clear destroyed."
    },
    {
      "file": "packages/command-registry/src/project/ClearProjectCommand.ts",
      "line": 246,
      "quote": "const report = projectScopeRegistry.clearAll();",
      "why": "Runs the `gis.areaLayout` clear. The file's own header (:21) states 'Required as the first step of ProjectLoader.load()', so EVERY project load / version restore executes the face-drag teardown."
    },
    {
      "file": "apps/editor/src/ui/site/siteProjectScope.ts",
      "line": 287,
      "quote": "const gis = projectScopeRegistry.clearScopes(GIS_SWITCH_SCOPES);",
      "why": "The C13 §3.7 synchronous teardown on `pryzm-project-switch` (subscribed at :441). GIS_SWITCH_SCOPES is derived from DECLARED_PROJECT_SCOPES and therefore includes `gis.areaLayout`, so the clear fires even earlier than ClearProjectCommand."
    },
    {
      "file": "apps/editor/src/ui/platform/PlatformShell.ts",
      "line": 248,
      "quote": "window.runtime?.events?.emit('pryzm-project-switch', { projectId: id, projectName: name }); // F.events.15",
      "why": "Fired on every project open (guarded only against re-opening the SAME id). It runs after the engine boot — the file's own marker at :231 says 'Everything after this mark is per-project work; everything before it is boot' — i.e. after `mountGISArea`/`initUI`."
    },
    {
      "file": "packages/core-app-model/src/persistence/declaredProjectScopes.ts",
      "line": 251,
      "quote": "why: 'mountGISArea() runs once per tab, so every `let` inside it is app-lifetime '",
      "why": "Establishes that there is no second `mountGISArea` to re-create the closure and re-run `ensureGisInitialized`. The teardown is therefore permanent for the tab."
    },
    {
      "file": "apps/editor/src/ui/geospatial/CesiumViewport.ts",
      "line": 18483,
      "quote": "paneEl.appendChild(this.container); // moves the single node — no clone, no 2nd viewer.",
      "why": "RULES OUT the re-parenting hypothesis (a). A DOM move preserves listeners, and the listeners are on `viewer.scene.canvas` inside the moved node. Re-parenting cannot kill the drag."
    },
    {
      "file": "apps/editor/src/ui/geospatial/CesiumViewport.ts",
      "line": 8755,
      "quote": "const origin = this.formaMassingOrigin;\n    if (!origin) return null;",
      "why": "`getSpaceEnvelopeSceneFrame()` and `renderSpaceEnvelopes()` (:8833-8842) read the SAME field, so 'prisms visible on the 3-D Site' and 'a frame exists for the pick' cannot disagree. If the founder can see the envelopes, the frame gate (hypothesis b) is not the failure."
    },
    {
      "file": "apps/editor/src/engine/spaceEnvelopeDragSurface.ts",
      "line": 580,
      "quote": "if (focus !== null && focus.spaceEnvelopeId !== picked.id) return null;",
      "why": "Answers (c): the core does NOT require a subject (`readFocus` returning null is permissive), but a focus that names a DELETED/replaced envelope silently makes every face un-grabbable. Nothing clears the focus on envelope deletion — only the panel's dispose (parcelLawEnvelopeAuthoring.ts:1618) and the last surface unregistering (spaceEnvelopeFaceDragSurfaces.ts:74) do."
    },
    {
      "file": "apps/editor/src/engine/spaceEnvelopeDragSurface.ts",
      "line": 586,
      "quote": "const picked = pick(ev);\n        if (!picked) return;",
      "why": "DIAGNOSABILITY GAP: a pointerdown that resolves no face returns in total silence — no console line, no toast, no span. There is no way for the founder (or a log) to distinguish 'listener not installed' from 'pick missed' from 'focus restricted'."
    },
    {
      "file": "apps/editor/src/ui/site/siteEnvelopeDrawCesium.ts",
      "line": 254,
      "quote": "private readonly viewer: CesiumNS.Viewer;",
      "why": "SECOND, INDEPENDENT LATENT BUG (rival e): the adapter captures the viewer BY VALUE at construction (GISAreaLayout.ts:1209), while the CesiumThreeBridge two lines earlier (:1101) is given a PROVIDER precisely because of §FIX-GLOBE-ACTIVATE-STALE-VIEWER (L-313). After the device-loss recovery at CesiumViewport.ts:6477-6482 (`this.dispose(); … await this.mount();`) the viewer and canvas are new and this adapter is permanently stale."
    }
  ],
  "proposedFix": "Two changes, plus one probe.\n\n(1) THE FIX — stop destroying a gesture that has no re-install, and make the wiring re-establishable.\nExtract the whole block at `GISAreaLayout.ts:1197-1436` (construct `SiteEnvelopeDrawCesium`, `registerEnvelopeDrawSurface`, `registerSpaceEnvelopeFaceDragSurface`, `installSpaceEnvelopeFaceDragOnSurface`) into a named closure `wireSiteEnvelopeSurfaces(viewer)`, then EITHER:\n (a) preferred — stop tearing the face drag down in `clearLayoutProjectState`. The listeners are bound to a viewer that is explicitly NOT destroyed on a project switch (`CesiumViewport.resetProjectScopedState` header: \"the viewer STAYS LIVE\"), so they are not per-project state. What IS per-project is the in-flight drag, the previews and the per-storey focus — cancel those (`envelopeFaceDrag3dDispose` already hands the camera back; call a new `cancelActiveDrag()` instead, plus `releaseSpaceEnvelopeFaceDragFocus()` and `disposeFaceDragAffordance()`), and leave the listeners and the register row in place. This makes the face-drag teardown symmetric with the DRAW teardown at `:8498`, which already only disarms.\n OR (b) keep the teardown and add `reseed: () => { if (cesiumViewport?.getViewer()) wireSiteEnvelopeSurfaces(cesiumViewport.getViewer()); }` to the `projectScopeRegistry.register({ scopeName: GIS_LAYOUT_SCOPE, … })` call at `GISAreaLayout.ts:156-161` (the registry already invokes `reseedAll()` at `ClearProjectCommand.ts:249`). ⚠ (b) alone does NOT cover the `pryzm-project-switch` path, which calls `clearScopes` with no reseed — so if you take (b) you must also reseed from `siteProjectScope.runSiteProjectTeardown`.\n\n(2) THE INDEPENDENT BUG — give `SiteEnvelopeDrawCesium` a viewer PROVIDER (`getViewer: () => cesiumViewport?.getViewer() ?? null`) instead of the captured `deps.viewer`, exactly as `CesiumThreeBridge` is constructed ten lines above it, so a device-loss re-mount does not leave the adapter permanently answering \"the 3D Site view is being torn down\".\n\n(3) THE PROBE (ship it before or with the fix) — a one-line answer to \"why can't I drag?\": `window.pryzmProbeEnvelopeFaceDrag()` printing { installed: envelopeFaceDrag3dDispose !== null, registeredSurfaces: registeredSpaceEnvelopeFaceDragSurfaces(), cannotDragReason: envelopeDraw3d?.cannotDragReason(), sceneFrame: cesiumViewport?.getSpaceEnvelopeSceneFrame(), envelopes: readAuthoredEnvelopes().length, focus: getSpaceEnvelopeFaceDragFocus(), drawArmed: isEnvelopeDrawArmed(), canvasIsLive: envelopeDraw3d?.dragDomElement()?.isConnected }. Today a failed pick is completely silent (`spaceEnvelopeDragSurface.ts:586`), which is why this defect has now been reported twice without a mechanism.",
  "filesToChange": [
    "apps/editor/src/ui/layout/GISAreaLayout.ts",
    "apps/editor/src/ui/site/siteEnvelopeDrawCesium.ts",
    "apps/editor/src/ui/site/spaceEnvelopeFaceDragSurfaces.ts",
    "apps/editor/src/ui/layout/__tests__/siteFaceDragWire.spec.ts"
  ],
  "confidence": "medium",
  "rivalHypothesesRuledOut": [
    "(a) 'The listener died because the Cesium container was RE-PARENTED into a pane' — RULED OUT. `CesiumViewport.reparentContainerTo` (:18480-18483) does `paneEl.appendChild(this.container)` and its own comment says 'moves the single node — no clone, no 2nd viewer'. A DOM move preserves event listeners, and the listeners are on `viewer.scene.canvas` inside the moved node. There is exactly one `new Cesium.Viewer(...)` in the file (:3522), so no ordinary path recreates the canvas.",
    "(b) 'formaMassingOrigin is null so getSceneFrame() refuses' — RULED OUT CONDITIONALLY (only if the founder can SEE the prisms). `getSpaceEnvelopeSceneFrame()` (:8755) and `renderSpaceEnvelopes()` (:8833-8842) read the SAME `this.formaMassingOrigin`, so 'nothing on screen' and 'nothing to pick' cannot disagree — that equivalence is stated in the method's own doc. I could not observe his screen, so this is ruled out by construction, not by observation.",
    "(c) 'The per-storey Drag face button is required to select a subject' — RULED OUT as a REQUIREMENT: `readFocus` returning null is explicitly permissive (`spaceEnvelopeDragSurface.ts:559-574`, 'NO FOCUS => NO RESTRICTION'). NOT ruled out as a HAZARD: a focus naming an envelope that was deleted or replaced silently kills every pick (`:580`), and nothing clears the focus on envelope deletion — only the panel's own dispose and the last surface unregistering do. This is a genuine second candidate I could not eliminate.",
    "(d) 'A perimeter draw is still armed, so pickFace is deaf' — NOT FULLY RULED OUT. `pickFace` returns null while `this.sink !== null` (`siteEnvelopeDrawCesium.ts:735-737`). A completed draw does disarm (`siteEnvelopeDrawArming.ts:571-572` `resetGesture(); disarmAll();`), so this only bites if he pressed Draw and never closed the ring — a state the panel's Draw button shows as pressed.",
    "(e) 'The adapter's captured viewer went stale after a GPU device-loss re-mount' — REAL AND UNCONFIRMED. `CesiumViewport.ts:6477-6482` disposes and re-mounts, minting a new viewer + canvas, while `SiteEnvelopeDrawCesium` holds `private readonly viewer` (:254). I could not establish that a device loss occurred in his session, but this is a second, independent way the same symptom is produced and should be fixed regardless.",
    "(f) 'The preview never paints because Cesium runs in requestRenderMode' — RULED OUT. `renderSpaceEnvelopes()` ends with `viewer.scene.requestRender();` (CesiumViewport.ts:8930) and `paintHandleEntities` calls `viewer.scene?.requestRender?.()` too, so a preview written during the drag does force a frame.",
    "(g) 'The command is not registered so the commit silently fails' — RULED OUT. `spaceEnvelope.moveFace` is a registered handler (`plugins/space-envelope/src/handlers/index.ts:33`, `MutateSpaceEnvelope.ts:187`), and the dispatch travels on the single shared dispatcher (`GISAreaLayout.ts:1372`)."
  ],
  "whatWouldFalsifyThis": "In the failing session, open DevTools and look for these two console lines IN ORDER: `[gis] §ENVELOPE-FACE-DRAG the 3D Site is now a FACE-DRAG surface — grab a face...` (GISAreaLayout.ts:1434, the install) and then `[gis] §L-676-B GIS layout project scope cleared (geocode frame + placement caches dropped).` (GISAreaLayout.ts:8514, the teardown). If the teardown line does NOT appear after the install line, my root cause is WRONG. Equivalently: if the per-storey \"Drag face\" button in the envelope panel is LIVE (not greyed) at the moment the drag fails, then `registeredSpaceEnvelopeFaceDragSurfaces()` is still > 0, the unregister at :8509 did not run, and this diagnosis is falsified — the failure is then in the pick (stale focus, armed draw, or a frame/ray mismatch), not in the teardown. Conversely, if the button IS disabled and its tooltip reads \"Dragging a face needs a 3-D view under the pointer, and none is attached right now\" WHILE the 3-D Site is plainly on screen, that is the confirming signature of this root cause."
}