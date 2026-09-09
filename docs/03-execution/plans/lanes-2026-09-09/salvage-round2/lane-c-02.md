{
  "dimension": "EdgeProjectorService: 0% cache hit rate, 109ms work + 83ms frame yields, on open",
  "summary": "The 0% hit rate is NOT a defect. `_cwProjectionCache` is a plain in-memory `Map` field on the `EdgeProjectorService` instance holding live `THREE.BufferGeometry` objects (EdgeProjectorService.ts:1943); nothing persists it, and the code's own comment beside the stats line says \"hitRate=100% on second run with no changes; hitRate=0% on first run\" (EdgeProjectorService.ts:3654). A fresh open is by construction the first run. The cache key contains nothing that varies per run — walls use a content hash (WallFragmentBuilder `_versionForBuild`, L-52), and `clipSignature` is derived deterministically from the viewDef. The real findings are different: (1) `yieldCalendar≈83ms` is NOT a measurement — the code literally prints `yields × (1000/60)` (EdgeProjectorService.ts:3648), so the second-largest number in that log line is synthetic; (2) `work=109ms` covers ONLY the per-group loop and excludes `applyOcclusion`/HiddenLineRemoval (line 4207, untimed), all symbol injection, VG styling, and the caller's `nativeElementMeshExporter.exportForView()` — so the projector's true open cost is >192ms by an unmeasured margin; (3) the projection runs during open because `initScene.ts:4636-4670` deliberately auto-opens the split plan pane on every `pryzm-project-loaded` (Contract 17 §4) via `requestIdleCallback(..., {timeout: 1500})`, and `SplitViewManager.deactivate()` persists nothing, so a user who closes the pane pays this cost again on every single open forever. Against a complaint measured in seconds, ~192ms+ is a real contributor but almost certainly not the root cause.",
  "findings": [
    {
      "title": "0% hit rate on a fresh open is EXPECTED, not a defect — the cache is per-session in-memory and this was its first pass",
      "mechanism": "`private readonly _cwProjectionCache = new Map<string, Map<string, {...layers: ReadonlyMap<string, CachedProjectionLayer>...}>>()` is an instance field holding live THREE.BufferGeometry (EdgeProjectorService.ts:1943-1955). BufferGeometry cannot be serialised to IndexedDB/localStorage as-is, and no code attempts it: the only writers are `_putCwCache` (2136), and the only clears are `invalidateCwElement` (2176), `invalidateCwView` (2192, called by nothing outside the class per grep) and `clearCwProjectionCache` (2208, called once from initScene.ts:3616 on `pryzm-project-switch`, which fires BEFORE the incoming project hydrates). The service itself is lazily constructed once per session (initScene.ts:1148). So on the first projection of a session the map is empty, 63 cacheable groups all miss, and `cacheEntries=63` is the cache being POPULATED. The code says so itself.",
      "evidence": [
        "apps/editor/src/engine/views/EdgeProjectorService.ts:1943 — `private readonly _cwProjectionCache = new Map<string, Map<string, {` (plain instance Map, no persistence layer)",
        "apps/editor/src/engine/views/EdgeProjectorService.ts:3653-3654 — `// §D.5 — Cache statistics per projection run.` / `// hitRate=100% on second run with no changes; hitRate=0% on first run.`",
        "apps/editor/src/engine/views/EdgeProjectorService.ts:3670 — `cacheElements=${this._cwProjectionCache.size} cacheEntries=${this._cwCacheEntryCount}/...` — the 63 in the founder's log is the post-pass population count",
        "apps/editor/src/engine/initScene.ts:3616 — `try { (edgeProjectorService as any).clearCwProjectionCache?.(); }` inside the `pryzm-project-switch` handler, i.e. cleared before hydration by design",
        "Founder log: `cacheHits=0 cacheMisses=63 hitRate=0% cacheEntries=63/5000` — hits+misses=63=entries, the signature of a cold first pass"
      ],
      "estimatedCostMs": 0,
      "costBasis": "read-from-code",
      "fix": "No fix. Do NOT 'fix the 0% cache' — there is nothing broken. Report it as expected and spend the budget elsewhere. If someone wants first-open hits, that is a NEW feature (persisting projected drawing-space linework to IndexedDB alongside the version+clipSignature), not a repair, and it would have to serialise Float32Array positions rather than BufferGeometry.",
      "risk": "low",
      "confidence": "high",
      "whatItWouldBreak": "none known — no change proposed",
      "filesToChange": []
    },
    {
      "title": "`yieldCalendar≈83ms` is COMPUTED, not measured — it is literally `yields × 16.67`",
      "mechanism": "The log field the brief treats as a measurement is synthesised from the yield COUNT: `yieldCalendar≈${((_perLayerYieldCount + _groupYieldCount) * (1000 / 60)).toFixed(0)}ms`. 5 × 16.667 = 83.3 → \"83\". No clock is read across the yield. Each yield is `await new Promise(resolve => getFrameScheduler().scheduleOnce('eps-chunk-yield', () => resolve(), 'pre-render'))` — a rAF-driven pre-render tick. During a busy project open the next frame can land far later than 16.7ms (the main thread is competing with element build, the 1.4MB IndexedDB version write, thumbnail capture ×2, and a WebGPU device-loss recovery, all visible in the same log), so the true calendar cost could be several times 83ms. Equally, the yielded frames are NOT dead time — other open work runs in them — so the true ADDITIVE cost to open could be near zero. The log cannot distinguish these, and the `≈` is the code admitting it.",
      "evidence": [
        "apps/editor/src/engine/views/EdgeProjectorService.ts:3648 — `` `yieldCalendar≈${((_perLayerYieldCount + _groupYieldCount) * (1000 / 60)).toFixed(0)}ms, ` + ``",
        "apps/editor/src/engine/views/EdgeProjectorService.ts:3542-3547 — the yield itself: `_groupYieldCount++; _workMsTotal += performance.now() - _lastYieldAt; await new Promise<void>(resolve => getFrameScheduler().scheduleOnce('eps-chunk-yield', () => resolve(), 'pre-render')); _lastYieldAt = performance.now();` — the elapsed time ACROSS the await is discarded, never accumulated",
        "apps/editor/src/engine/views/projectionChunkPolicy.ts (GROUP_YIELD_BUDGET_MS doc) — `⚠ This is the CALENDAR cost only.` and `estimateTimedFrameYields` is explicitly an ESTIMATOR, priced at one nominal display frame per yield",
        "Founder log: `5 frame yield(s), work=109ms yieldCalendar~83ms` — 5 × 1000/60 = 83.3"
      ],
      "estimatedCostMs": -1,
      "costBasis": "read-from-code",
      "fix": "Measure it instead of pricing it. Add `_yieldMsTotal += performance.now() - _tYieldStart` around the awaited scheduleOnce and print `yieldCalendar=<measured>ms` with no `≈`. This is ~4 lines and it converts the single biggest unknown in this dimension into a fact. Until then, refuse to attribute 83ms of open time to yielding.",
      "risk": "low",
      "confidence": "high",
      "whatItWouldBreak": "Nothing functional. The number in the log changes meaning, so any log-scraper or doc that quotes the old value must be re-read (the field name should change to make the break loud, not silent).",
      "filesToChange": [
        "apps/editor/src/engine/views/EdgeProjectorService.ts"
      ]
    },
    {
      "title": "`work=109ms` is a LOWER BOUND — it excludes hidden-line removal, every symbol injector, VG styling, and the caller's mesh export",
      "mechanism": "`_workMsTotal` only accumulates inside the per-group native loop, and the §PERF-EDGEPROJECTOR-CHUNK / §PERF-CACHE-STATS lines are printed at 3633 / 3664 — i.e. BEFORE `applyOcclusion(drawing, {...})` at 4207, before the opening/wall/plumbing/stair symbol injectors, and before the caller's `vgApplicator.applyToProjectionLayers`. It also excludes `nativeElementMeshExporter.exportForView(viewDef)`, which the CALLER runs before `project()` (initScene.ts:1394) and which has its own cold cache on open (`[NME] §H2-NME-CACHE`, NativeElementMeshExporter.ts:812-819 — that line is absent from the founder's excerpt). HiddenLineRemoval is untimed: its summary (`26 occluder(s), 239.5 segment-equivalent(s) removed`) prints counts and no ms, and it is O(targets × occluders) over the 410 edge geometries in 63 layers. So the projector's contribution to the open is 109ms of loop CPU PLUS an unmeasured amount, PLUS whatever the yields really cost.",
      "evidence": [
        "apps/editor/src/engine/views/EdgeProjectorService.ts:3645-3646 — `` `work=${(_workMsTotal + (performance.now() - _lastYieldAt)).toFixed(0)}ms ` `` — accumulated only at yield points inside the group loop",
        "apps/editor/src/engine/views/EdgeProjectorService.ts:4207 — `applyOcclusion(drawing, {` — runs AFTER the summary logs, so its cost is in neither number",
        "packages/core-app-model/src/drawing/HiddenLineRemoval.ts:936-949 — the v3 summary prints occluder counts, disposition and segment-equivalents; there is no timing field anywhere in it",
        "packages/core-app-model/src/geometry/NativeElementMeshExporter.ts:812-819 — `[NME] §H2-NME-CACHE hits=... misses=... hitRate=...` — a SECOND cold-on-open cache, upstream of EPS, whose line the founder's excerpt does not contain",
        "Founder log: `Native projection done - 69 group(s) ... work=109ms` then, separately, `[HiddenLineRemoval] v3 - 26 occluder(s), 239.5 segment-equivalent(s) removed` and `[VGSceneApplicator] applyToProjectionLayers() - styledLayers=22`"
      ],
      "estimatedCostMs": -1,
      "costBasis": "read-from-code",
      "fix": "Before optimising anything here, wrap `project()` end-to-end in one `performance.now()` pair and print `total=Xms (loop=109 hlr=Y symbols=Z)`. Also surface the `[NME] §H2-NME-CACHE` line and the `exportForView` duration at the two call sites (initScene.ts:1394, PlanViewManager.ts:846). Right now nobody can say whether HLR is 5ms or 500ms, and the whole dimension is being argued from the one number that happens to be printed.",
      "risk": "low",
      "confidence": "high",
      "whatItWouldBreak": "none known — pure instrumentation",
      "filesToChange": [
        "apps/editor/src/engine/views/EdgeProjectorService.ts",
        "apps/editor/src/engine/initScene.ts",
        "apps/editor/src/engine/views/PlanViewManager.ts"
      ]
    },
    {
      "title": "The plan projection during open is DELIBERATE (Contract 17 §4 auto-opens the split plan pane) — and the user's decision to close that pane is never persisted",
      "mechanism": "This answers (c): the user does NOT land on 3D alone. On every `pryzm-project-loaded`, initScene.ts:4640 schedules `splitViewManager.activate()`. `activate()` emits `split-view-activated` and `split-view-view-changed` (SplitViewManager.ts:351-353); initScene.ts:1522 and 1526-1529 turn both into `viewDependencyTracker.notifyViewActivated(planViewId)`; the tracker's active-view predicate (initScene.ts:1508-1515 — `svm?.isActive === true && svm.activeViewId === viewId`) now reports the plan ACTIVE, so its deferred dirty state flushes into `_reprojectView` → `edgeProjectorService.project()` (initScene.ts:1453). So the projection is for a pane that IS on screen — not a false defect. The defect is that the schedule and the preference are both wrong for a user who does not want it: (a) it fires via `requestIdleCallback(_activate, { timeout: 1500 })`, and the `timeout` FORCES the callback at 1500ms even while the open is still saturating the main thread; (b) `deactivate()` (SplitViewManager.ts:401-431) writes no preference anywhere — the only persisted split-view state is `pryzm.splitView.gridVisible` (SplitViewManager.ts:2179/2187) — and the code comment says so outright: \"Users may close it via the ✕ button; re-opening a project always restores it to the open state.\"",
      "evidence": [
        "apps/editor/src/engine/initScene.ts:4636 — `// Contract 17 §4 — Auto-open the split view whenever a project loads.`",
        "apps/editor/src/engine/initScene.ts:4666 — `ric(_activate, { timeout: 1500 });` (fallback `setTimeout(_activate, 600)` at :4668)",
        "apps/editor/src/engine/initScene.ts:4659 — `splitViewManager.activate();`",
        "apps/editor/src/engine/initScene.ts:1526-1529 — `window.runtime?.events?.on('split-view-activated', () => { const svm = window.splitViewManager ...; if (svm?.activeViewId) viewDependencyTracker.notifyViewActivated(svm.activeViewId); });`",
        "apps/editor/src/engine/initScene.ts:1511-1513 — the active-view predicate: `if (svm?.isActive === true && svm.activeViewId === viewId) return true;`",
        "apps/editor/src/engine/views/SplitViewManager.ts:401-431 — `deactivate()` in full: no localStorage write, no preference emitted",
        "apps/editor/src/engine/views/siteAuthoringPaneDecisions.ts:45-47 — `return !state.isActive && !state.autoOpenSuppressed;` — the ONLY suppressor is site-authoring, never the user"
      ],
      "estimatedCostMs": 192,
      "costBasis": "estimated",
      "fix": "Two independent levers, both small. (1) PERSIST THE CLOSE: have `SplitViewManager.deactivate()` write a `pryzm.splitView.open=false` preference (same try/catch shape as the existing `_readGridPreference`/`gridVisible` pair at :2179/:2187) and fold it into `shouldAutoOpenSplitView` as a third input — that function is already a pure, unit-tested decision (siteAuthoringPaneDecisions.spec.ts), so this is a one-field change plus a test row. A founder who works in 3D then stops paying for a plan he never looks at. (2) MOVE IT OFF THE OPEN WINDOW: the `{ timeout: 1500 }` guarantees the projection lands mid-open on a saturated thread. Either drop the timeout (let genuine idle decide) or gate `_activate` on a load-settled signal rather than a wall clock. Do (1) first — it is the one that removes the cost entirely rather than moving it.",
      "risk": "medium",
      "confidence": "high",
      "whatItWouldBreak": "Contract 17 §4's stated intent — \"users immediately see both the 3D viewport and the 2D floor plan on first open\". Persisting the close changes that from an invariant to a default, so it needs the contract amended, not just the code. Removing the rIC timeout risks the pane never opening on a machine that is never idle (a real failure mode here — the same log shows a WebGPU device loss during open), which would look like the pane is broken; a load-settled signal is the safer of the two.",
      "filesToChange": [
        "apps/editor/src/engine/views/SplitViewManager.ts",
        "apps/editor/src/engine/views/siteAuthoringPaneDecisions.ts",
        "apps/editor/src/engine/initScene.ts",
        "docs/02-decisions/contracts/"
      ]
    },
    {
      "title": "Doors and windows mint a fresh cache version on EVERY build via `Date.now()`, so they can never hit after a rebuild — walls solved this with a content hash and doors did not",
      "mechanism": "This is the (b) answer, and it is NOT the cause of the 0% on open — it is the cause of avoidable misses on every projection AFTER an edit. `DoorBuilder` stamps `group.userData = Object.freeze({ ...group.userData, version: Date.now() })` unconditionally. `NativeElementMeshExporter` propagates that stamp to the proxy wrapper (NativeElementMeshExporter.ts:578), and `_cwCacheIsValid` compares it exactly (EdgeProjectorService.ts:2097). So any rebuild that touches a door — including a whole-level rebuild triggered by an unrelated neighbouring edit — re-versions it and guarantees a MISS even when the door's geometry is byte-identical. Walls fixed exactly this defect: `_versionForBuild` reuses the prior token when a content key (`_renderVersion|joinHash|worldY|rakeTag`) is unchanged, and its own docstring says the unconditional bump \"drove the plan-projection cache hit-rate to ~0%\". Furniture and lighting use `_priorVersion + 1`, which has the same weakness. This is the L-813 'hand-written cache key' shape the brief points at, but it lives in the BUILDERS, not in EPS.",
      "evidence": [
        "packages/geometry-door/src/DoorBuilder.ts:431 — `group.userData = Object.freeze({ ...group.userData, version: Date.now() });`",
        "packages/geometry-wall/src/WallFragmentBuilder.ts:394-404 — `§FIX-WALL-VERSION-CONTENT-HASH (L-52) ... The previous code bumped a monotonic _geometrySeq on EVERY buildWall() call unconditionally ... driving the plan-projection cache hit-rate to ~0 %`",
        "packages/geometry-wall/src/WallFragmentBuilder.ts:434-440 — the fix: `const key = ...; const prev = this._geomVersionKey.get(wall.id); if (prev !== undefined && prev.key === key) { return prev.seq; }`",
        "packages/geometry-furniture/src/FurnitureFragmentBuilder.ts:142 — `root.userData.version = _priorVersion + 1;` (unconditional)",
        "packages/geometry-lighting/src/LightingFragmentBuilder.ts:734 — `group.userData.version = _priorVersion + 1;` (unconditional)",
        "apps/editor/src/engine/views/EdgeProjectorService.ts:2097 — `return entry?.version === currentVersion && entry?.clipSignature === clipSignature;`",
        "apps/editor/src/engine/views/EdgeProjectorService.ts:2005-2010 — the CACHEABLE_ELEMENT_TYPES comment asserting `Date.now()` is fine because it is \"strictly monotonic\" — monotonicity is the wrong property; STABILITY under a no-op rebuild is the property the cache needs"
      ],
      "estimatedCostMs": -1,
      "costBasis": "read-from-code",
      "fix": "Apply the L-52 pattern from `WallFragmentBuilder._versionForBuild` to DoorBuilder (and then WindowBuilder, FurnitureFragmentBuilder, LightingFragmentBuilder): keep a per-element `Map<id, {key, seq}>`, build the key from the actual geometry determinants, and reuse the prior token when the key is unchanged. Do NOT do this blind — first add a temporary counter to `_putCwCache` that reports misses-by-elementType, so you fix the families that actually miss on the founder's model rather than the ones that look suspicious. This is a hit-rate fix for EDITING, not for opening; sequence it after the two levers above.",
      "risk": "medium",
      "confidence": "medium",
      "whatItWouldBreak": "The version token is the STALENESS GUARD, not just a cache key — CACHEABLE_ELEMENT_TYPES' entire membership rule is \"the builder bumps version on every geometric rebuild\" (EdgeProjectorService.ts:1966-1975). Any content key that omits a real determinant serves stale plan linework forever, silently, and only for elements that did NOT change — the failure mode the wall fix's own comment calls out as the hardest to see. Doors in particular carry swing symbols, finish colours and host relations; getting the key wrong here reintroduces the class of bug §DOOR-AUDIT-2026 W6 added the stamp to catch.",
      "filesToChange": [
        "packages/geometry-door/src/DoorBuilder.ts",
        "packages/geometry-window/src/WindowBuilder.ts",
        "packages/geometry-furniture/src/builders/FurnitureFragmentBuilder.ts",
        "packages/geometry-lighting/src/LightingFragmentBuilder.ts"
      ]
    }
  ],
  "whatIcouldNotEstablish": "1. WHICH view was projected. The founder's excerpt omits the `viewId=` field that §PERF-CACHE-STATS prints (EdgeProjectorService.ts:3666), so I inferred the plan-pane path from the auto-open chain, not from the log. It could in principle have been an elevation. The presence of cut occluders in the HLR line leans plan but is not decisive.\n\n2. WHETHER THE PROJECTION RAN MORE THAN ONCE during the open. Only one §PERF-CACHE-STATS line is in the excerpt. A second pass would read near 100%, which would itself be strong evidence the cache is healthy. There are two rival drivers for the same plan view — `initScene._reprojectView` (:1453) and `PlanViewManager._ensureProjection` (:880) — and L-11561's own comment says both re-project the same plan view on the same store change. I could not determine from the log whether both fired on this open. Ask the founder for the full unfiltered console; this is the single highest-value missing fact.\n\n3. THE ACTUAL ELAPSED COST OF THE PROJECTOR. `work=109ms` is measured but partial; `yieldCalendar≈83ms` is arithmetic, not a clock; HLR, the symbol injectors and `exportForView` are untimed. My \"192ms\" is therefore a floor with an unknown ceiling, and I have labelled it `estimated` rather than `measured-from-log` for exactly that reason.\n\n4. WHETHER THE 83ms IS ADDITIVE TO OPEN WALL-CLOCK OR OVERLAPPED. A rAF yield releases the thread; other open work runs in it. It could be near-free or much worse than 83ms. UNKNOWN, and unresolvable without the instrumentation in finding 2.\n\n5. WHAT THE 6 NON-CACHEABLE GROUPS ARE (69 groups vs 63 cacheable). Candidates not in CACHEABLE_ELEMENT_TYPES include `opening` and any space-envelope/boundary group, but the log does not name them.\n\n6. WHETHER THIS IS THE ROOT CAUSE OF \"TAKES TOO LONG TO OPEN\". On the evidence I have, no — ~192ms+ in a complaint measured in seconds. The same console shows a 2366-mutation temporal graph, a 1.4MB compressed IndexedDB version write, a thumbnail captured TWICE, a project room joined TWICE, and a WebGPU device loss DURING open. Those are other dimensions' territory, but if the goal is the founder's wall clock rather than this subsystem's tidiness, I would not spend the next fix here."
}