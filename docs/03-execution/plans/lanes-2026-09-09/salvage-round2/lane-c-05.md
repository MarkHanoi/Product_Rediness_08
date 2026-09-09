{
  "dimension": "The open sequence / critical path — from \"user clicks a project card\" to \"editor is interactive\"",
  "summary": "OPEN **is** instrumented — §STARTUP-BUDGET covers it end to end (`hub:open-clicked → open:router-launch → open:persistence-openProject → boot:* → open:shell-context-set → open:version-read-* → open:snapshot-loaded → open:first-interactive-frame`) — but the instrument **never prints a table on a hub-open**: `reportStartupBudget` has exactly one production call site, `enterCanvasWithSitePlan.ts:188`, the onboarding arm. That is why the founder's paste carries zero `[§STARTUP-BUDGET]` lines. The open pipeline is one strictly serial chain in `buildPersistence.openProject` (`buildPersistence.ts:268 → :308 → :316 → :337`): a server project-LIST round-trip, then the WHOLE engine boot, then a full server SNAPSHOT download, then the shell. Legs 1 and 3 need neither each other nor the boot, and leg 3's result is **thrown away** whenever local history exists (`PlatformShell.ts:299` uses the local record; `prefetchedVersion` is read only at `:322`, inside the `else`). Beyond the marks, the heaviest work happens **after the last mark**: `pryzm-project-loaded` has 35 listeners across 24 files, and one of them (`initScene.ts:3758` → `:3008`) live-swaps the renderer backend because the founder's 3,762 meshes trip the ≥1000 arm — that is the `WebGPU device lost: reason=\"destroyed\"` in his console, which `rendererRetirement.ts:404` names as a DELIBERATE teardown, not a fault. Two more instrument defects make this unmeasurable rather than merely slow: `endBootLeg` drops the untiled tail so the brand-new builders profiler cannot see `await initBuilders(...)` at all, and `open:first-interactive-frame` fires before the backend swap, the zoom-to-fit, the two thumbnail captures and the post-load autosave.",
  "whatIcouldNotEstablish": "1) **No timing from the founder's own run.** His paste contains no `[§STARTUP-BUDGET]`, no `[ProjectLoader] §LOAD-PHASE`, no `[§STARTUP-BUILDERS-LEG]` and no `[autoWebGLHeavyScene]` line, so I have no per-phase ms for HIS 503-element project. Every ms I give is either from the 2026-09-02 cpuprofile (a 300-WALL project, local prod build, different hardware), from the founder's 2026-09-07 trace as transcribed into `bootStepProfile.ts:9-13`, or an extrapolation clearly marked estimated. Do not quote my numbers as measurements of his run.\n2) **The backend swap is inferred, not observed.** `reason=\"destroyed\"` + `3762 meshes (ARM TRIPPED)` + the post-load call at `initScene.ts:3008` make the §AUTO-WEBGL-HEAVY swap the strongest explanation, but the direct proof would be the `[autoWebGLHeavyScene] §AUTO-WEBGL-HEAVY …` warn line, which is not in the paste. A renderer REBUILD from some other retirement path would produce the same two device-lost lines. Grep the full console for `autoWebGLHeavyScene` before acting on finding 4.\n3) **What triggers the EdgeProjector run at open.** `SPEC-PROJECT-OPEN-CREATE-PIPELINE.md:83` (O10) says the hydrate \"then triggers plan/3D re-projection (EdgeProjectorService)\", and the founder's log shows one full projection pass (109 ms work + ~83 ms of frame-yield calendar, 410 geometries, 63 ISO layers) plus HiddenLineRemoval and VGSceneApplicator. I could not find the call site that fires it on the open path — no `project-loaded` listener exists in `apps/editor/src/engine/views/`. Its 0% cache hit rate is EXPECTED on a first run (the code says so at `EdgeProjectorService.ts:3654`) and is not a defect.\n4) **Whether the founder's open took the `if (latest)` branch.** Finding 1's \"the download is discarded\" holds only on that branch. His log shows 6 versions in IndexedDB, which strongly implies local history existed, but the decisive line — `[PlatformShell] Auto-restoring latest local version: …` vs `[PlatformShell] Using prefetched version from persistence tier: …` — is not in the paste.\n5) **No cost measured for the two-socket duplication, the whole-corpus version warm, or the double serialize on HIS project.** I established each mechanism by reading; the ms are extrapolations from the repo's own quoted figures.",
  "findings": [
    {
      "title": "The full server snapshot is downloaded on the critical path, serially after the engine boot — and discarded whenever local history exists",
      "mechanism": "`buildPersistence.openProject` runs four legs strictly in sequence. Leg 3 (`buildPersistence.ts:316`) is `const bundle = hint?.isNewProject ? null : await tier.streamLoad(projectId);` → `fetch('/api/projects/:id/latest-version')` (`buildPersistence.ts:154`), whose server handler selects the FULL snapshot column (`server.js:3527`: `.select('id,project_id,label,created_at,element_count,snapshot')`). The bundle is threaded to the shell as `prefetchedVersion` (`buildPersistence.ts:335`). But `PlatformShell.setProjectContext` reads `opts?.prefetchedVersion` ONLY at `:322`, inside the `else` branch that begins at `:319` (\"No local versions\"). The `if (latest)` branch at `:299-301` — taken whenever `versionRepository.getLatestVersion(id)` returns a record — calls `this.versionCtrl.loadVersion(latest)` and never touches the bundle. So for a project with local IndexedDB history (the founder's: \"6 version(s) persisted to IndexedDB\"), a multi-megabyte download plus its `res.json()` parse is awaited on the critical path and the result is garbage-collected unread. It is also serial with leg 2 (`await attachedBootstrap.ensure()` at `:308`, the WHOLE engine boot) for no reason: the fetch needs only `projectId`, known at `:263`.",
      "evidence": [
        "packages/runtime-composer/src/buildPersistence.ts:308 — `await attachedBootstrap.ensure();`  (leg 2: the entire engine boot)",
        "packages/runtime-composer/src/buildPersistence.ts:316 — `const bundle = hint?.isNewProject ? null : await tier.streamLoad(projectId);`  (leg 3, strictly after leg 2)",
        "packages/runtime-composer/src/buildPersistence.ts:154 — `const res = await fetch(`/api/projects/${projectId}/latest-version`, …)`",
        "server.js:3527 — `.select('id,project_id,label,created_at,element_count,snapshot')` — the full snapshot column",
        "apps/editor/src/ui/platform/PlatformShell.ts:297-301 — `const latest = versionRepository.getLatestVersion(id); … if (latest) { … this.versionCtrl.loadVersion(latest); }` — no read of `opts.prefetchedVersion`",
        "apps/editor/src/ui/platform/PlatformShell.ts:319-322 — `} else { … const prefetched = opts?.prefetchedVersion as ({…})` — the ONLY read, in the no-local-version branch",
        "apps/editor/src/ui/platform/SaveOrchestrator.ts:245 — sizing evidence for the payload: \"a FULL-project serialize (793 elements → ~16.6 MB)\"",
        "audit/perf/2026-09-02/diagnosis.md AXIS C — measured analogue on a 300-wall project: \"fetch-latest 57 ms\" locally"
      ],
      "estimatedCostMs": 600,
      "costBasis": "estimated",
      "fix": "Two independent halves, both small. (a) DON'T FETCH WHAT YOU WILL DISCARD: before leg 3, ask the same question `PlatformShell` will ask — `versionRepository.countVersions(projectId) > 0` (already exists, cited at `PlatformSaveController.ts:141` as the narrow-read replacement for a full inflate) — and skip `tier.streamLoad` entirely when local history wins. (b) STOP SERIALISING IT BEHIND THE BOOT: hoist `const bundlePromise = hint?.isNewProject ? Promise.resolve(null) : tier.streamLoad(projectId);` to the top of the async body (before `:268`), and `await bundlePromise` at `:316`. That is behaviour-identical and removes a whole network round trip from the serial chain. Do (b) first — it is zero-risk — then (a).",
      "risk": "medium",
      "confidence": "high",
      "whatItWouldBreak": "The `else` branch at PlatformShell.ts:319 genuinely needs the bundle: a project with NO local history restores from `prefetchedVersion` and, failing that, from `_loadLatestVersionFromServer`. Half (a) must therefore key off the same predicate PlatformShell uses, or a first-open-on-a-new-machine restores empty. Half (b) breaks nothing — the await point is unchanged, only the start point moves.",
      "filesToChange": [
        "packages/runtime-composer/src/buildPersistence.ts",
        "apps/editor/src/ui/platform/PlatformShell.ts"
      ]
    },
    {
      "title": "The heavy-scene backend swap fires DURING the open and tears the renderer down — that is the \"WebGPU device lost\" in the founder's console",
      "mechanism": "On `pryzm-project-loaded`, `initScene.ts:3758` queues `setTimeout(0) → _runConsolidatedTierPbrPass()` (published at `:3038`). That pass does two full scene traversals (`collectNewPbrMeshes` at `:2951`, `countMeshes` at `:2965-2969`) over the whole scene, then calls `maybeAutoSwitchToWebGLForHeavyScene(scene, 'tier:post-load', meshCount)` at `:3008`. `isSwapWorthyHeavyScene` (`autoWebGLHeavyScene.ts:110-114`) returns true on `meshCount >= SWAP_MESH_THRESHOLD`, which is 1000 (`heavySceneSwapThreshold.ts:43`). The founder's census reads **3762 meshes — ARM TRIPPED**. `fireSwapToWebGL` then calls `window.pryzmSwapRendererBackend` → `swapRendererBackend` (`initScene.ts:4858`), which: stops the single rAF loop, `rpm.dispose()`s the TSL pipeline, mints a FRESH canvas, rebuilds the renderer, and covers the window with a \"Switching renderer…\" overlay. `rendererRetirement.ts:404-406` states that `reason=\"destroyed\"` is precisely `retireRenderer` → `renderer.dispose()` → `backend.destroy()` — OUR teardown, not a GPU fault — and the founder's log shows exactly that pair of lines during the open. So the open builds a renderer, loads 3,762 meshes into it, then throws it away and builds another, with a full shader/pipeline recompile.",
      "evidence": [
        "apps/editor/src/engine/initScene.ts:3758-3764 — `on('pryzm-project-loaded', () => { setTimeout(() => { _runConsolidatedTierPbrPass?.(); … }, 0); })`",
        "apps/editor/src/engine/initScene.ts:3008 — `maybeAutoSwitchToWebGLForHeavyScene(scene, `tier:${reason}`, meshCount);`",
        "apps/editor/src/rendering/heavySceneSwapThreshold.ts:43 — `export const SWAP_MESH_THRESHOLD = 1000;`",
        "apps/editor/src/rendering/autoWebGLHeavyScene.ts:110-114 — `if (typeof sceneMeshCount === 'number' && sceneMeshCount >= SWAP_MESH_THRESHOLD) return true;`",
        "apps/editor/src/engine/initScene.ts:4858+ — `swapRendererBackend`: stops the rAF loop (step 1), `rpm.dispose()` (step 2), `newCanvas = document.createElement('canvas')` + rebuild (step 3), `showRendererSwapOverlay('Switching renderer…')`",
        "packages/renderer-three/src/rendererRetirement.ts:404-406 — `reason = \"destroyed\" — device.destroy() was CALLED. That is US. It is the last step of retireRenderer → renderer.dispose() → backend.destroy()`",
        "FOUNDER'S LOG — `[pryzmPerf] NAV-BACKEND-SWAP-HEADROOM … NOW: 162 elements (238 to go), 3762 meshes (ARM TRIPPED).`",
        "FOUNDER'S LOG — `[renderer-three/WebGPURendererAdapter] WebGPU device lost: reason=\"destroyed\"` and `[createRenderer] WebGPU device lost: reason=\"destroyed\"  <-- DURING open`",
        "audit/perf/2026-09-02/diagnosis.md — measured analogue: \"shader/pipeline compile … ~1.2 s\" for a 300-WALL scene"
      ],
      "estimatedCostMs": 2000,
      "costBasis": "estimated",
      "fix": "Decide the backend BEFORE building a renderer, not after loading 3,762 meshes into the wrong one. The verdict is deterministic for this project on every open (mesh count is a function of the snapshot), and the swap is already once-per-session, so it can be predicted: at `PlatformShell.setProjectContext` the project index meta / the snapshot's `elementCount` are both in hand — thread a `preferClassicWebGL` hint into the FIRST `createRenderer()` call so the open builds the classic renderer once. Fallback if that is too invasive: keep the swap but move it OFF the open path — do it before the hydrate begins (the proactive entry point `proactivelySwitchToWebGLForBuildingGeneration` already exists at `autoWebGLHeavyScene.ts:283` and exists for exactly this \"we know it will be heavy\" reason; `ProjectLoader` knows the element count from the snapshot before it replays anything).",
      "risk": "medium",
      "confidence": "medium",
      "whatItWouldBreak": "ADR-0267's whole premise is that a heavy scene on WebGPU device-losses this hardware, and the once-per-session guard (`_autoSwapDone`, autoWebGLHeavyScene.ts:126) exists so the swap never thrashes. Predicting the verdict from a snapshot element/mesh estimate rather than a live scene traverse means a project whose stored count under-reports its live mesh count would boot on WebGPU and could still TDR — the reactive path must therefore stay as the net, not be deleted. Also `§HEURISTIC-MAY-OVERRIDE-A-PIN-BUT-NEVER-OVERWRITE-IT` (L-1483, initScene.ts:~4902): a boot-time choice must remain session-scoped and must not persist over the user's stored backend preference.",
      "filesToChange": [
        "apps/editor/src/engine/initScene.ts",
        "apps/editor/src/rendering/autoWebGLHeavyScene.ts",
        "apps/editor/src/rendering/createRenderer.ts"
      ]
    },
    {
      "title": "A hub-open never prints the §STARTUP-BUDGET table — one call site is missing, and that is why every open reading is a guess",
      "mechanism": "`reportStartupBudget()` is called from exactly ONE production site: `enterCanvasWithSitePlan.ts:188`, which is the ONBOARDING arm (the \"Open the canvas →\" / \"Finish\" landing). A plain hub-open never reaches it, so the run emits every individual `[§STARTUP-BUDGET] <phase> +Nms (t+Nms)` line but no `══ run complete ══` header, no total, and no sorted `console.table`. The module documents this itself at `startupBudget.ts:139-145` as a KNOWN GAP, with the stated reason: the reporter is one-shot per run and firing it from the post-scene family \"would pre-empt the onboarding table\". That fear only applies to a run that does BOTH (create-then-onboard); on a plain hub-open the onboarding arm never runs, so there is no contention — and the two cases are distinguishable exactly, because a hub-open's marks contain `hub:open-clicked` and an onboarding run's do not. Consequence: the founder's console paste in this brief carries ZERO `[§STARTUP-BUDGET]` lines, so nobody can say which phase of his open is expensive.",
      "evidence": [
        "apps/editor/src/engine/startupBudget.ts:310 — `export function reportStartupBudget(trigger: string): void` — the only definition",
        "apps/editor/src/ui/site/overlay/enterCanvasWithSitePlan.ts:188 — `reportStartupBudget('enter-canvas');` — the ONLY production call site (grep over all *.ts: the two other hits are `startupIdempotence.test.ts:91-92`)",
        "apps/editor/src/engine/startupBudget.ts:139-145 — `⚠ THE HUB-OPEN PATH STILL NEVER PRINTS THE TABLE … A hub-open therefore emits every mark line but no summary. Logged, not patched inside a marks-only change.`",
        "apps/editor/src/ui/platform/PlatformShell.ts:181-186 — `⚠ Deliberately does NOT call reportStartupBudget. … a plain hub-open still never prints the summary table, only the individual mark lines.`",
        "apps/editor/src/ui/platform/ProjectHub.ts:2268 — `markStartupPhase('hub:open-clicked');` — the mark that distinguishes a hub-open run from an onboarding run",
        "FOUNDER'S LOG — contains no `[§STARTUP-BUDGET]` line at all"
      ],
      "estimatedCostMs": -1,
      "costBasis": "read-from-code",
      "fix": "One call, guarded by one predicate. In `PlatformShell._armPostSceneMarks`'s `scheduleOnce` callback (`PlatformShell.ts:204`), after `markStartupPhase('open:first-interactive-frame')`, add: `if (getStartupBudgetMarks().some(m => m.phase === 'hub:open-clicked')) reportStartupBudget('open:first-interactive-frame');`. `getStartupBudgetMarks()` is already exported (`startupBudget.ts:298`) and the reporter's own `_reported` latch (`:313`) makes a double call a no-op, so the onboarding arm is untouched by construction — the guard is belt-and-braces, not the mechanism. This is a marks-only change: nothing is gated, delayed or skipped.",
      "risk": "low",
      "confidence": "high",
      "whatItWouldBreak": "The invariant `startupBudget.ts` protects is \"one report per run, and the onboarding arm owns its trigger\". The `hub:open-clicked` guard preserves it exactly: an onboarding run has no such mark, so this site stays silent there. If finding 5 is also taken, move this call to the LAST post-load mark instead, or the table will be printed before the work it is supposed to show.",
      "filesToChange": [
        "apps/editor/src/ui/platform/PlatformShell.ts"
      ]
    },
    {
      "title": "`endBootLeg` drops the untiled tail — the brand-new builders profiler cannot see `await initBuilders(...)`, the exact 18.6 s span it was written to explain",
      "mechanism": "`bootStepProfile.endBootLeg` computes the leg's wall time as `const wallMs = state.lastAtMs - state.startedAtMs;` (`bootStepProfile.ts:229`) and builds its table only from `state.steps`. `state.lastAtMs` is advanced ONLY inside `bootStep()` (`:170`). In `engineLauncher.ts` the final `bootStep` call is at `:418` (`'fragments.init (kickoff, not awaited)'`), and `endBootLeg('builders')` is at `:460` — with `await initBuilders({…})` at `:456` in between. That segment is therefore never pushed as a step, never appears as a row, and is excluded from `wallMs`. The module's own contract says the opposite: \"Steps tile the leg exactly\" (`:150`) and \"the leg is tiled exactly by its steps, so the table sums to the `markStartupPhase` delta and can be reconciled against it line by line\" (`:49-50`). The next founder paste will therefore show a `[§STARTUP-BUILDERS-LEG]` table totalling a few hundred ms against a `boot:builders-done +18626ms` mark, and the natural reading — \"the leg is fine, the mark is lying\" — is stale-optimistic, the failure mode the module's own header calls worse than the one it replaced.",
      "evidence": [
        "apps/editor/src/engine/bootStepProfile.ts:229 — `const wallMs = state.lastAtMs - state.startedAtMs;`",
        "apps/editor/src/engine/bootStepProfile.ts:170 — `state.lastAtMs = at;` inside `bootStep()` — the only writer",
        "apps/editor/src/engine/engineLauncher.ts:418 — `bootStep('fragments.init (kickoff, not awaited)');` — the LAST bootStep in the leg",
        "apps/editor/src/engine/engineLauncher.ts:456 — `} = await initBuilders({ scene: world.scene.three as THREE.Scene, bimManager, projectContext });`",
        "apps/editor/src/engine/engineLauncher.ts:460 — `endBootLeg('builders');`",
        "apps/editor/src/engine/bootStepProfile.ts:149-150 — `Steps tile the leg exactly: the first step runs from beginBootLeg to this call, the next from this call to the following one.`",
        "apps/editor/src/engine/bootStepProfile.ts:9-13 — the founder's own trace this module exists for: `boot:scene-done t+1 144 (+259 ms) / boot:builders-done t+19 770 (+18 626 ms) / boot:tools-done t+20 811 (+1 041 ms)  ⛔ 85 % of a 22 s startup`"
      ],
      "estimatedCostMs": -1,
      "costBasis": "read-from-code",
      "fix": "One line at the call site, plus one line of defence in the profiler. (a) In `engineLauncher.ts`, insert `bootStep('await:initBuilders');` immediately after `:456` and before `markStartupPhase('boot:builders-done')` at `:457` — the `await:` prefix is the module's own convention (`bootStepProfile.ts:98-104`) and makes the segment count toward `foreign`/`idle` rather than `own`, which is precisely the own-vs-foreign split that decides whether shortening `initBuilders` can help at all. (b) In `endBootLeg`, close an implicit final segment first — push `{ step: '(untiled tail)', startMs: state.lastAtMs, endMs: now(), awaited: true }` when `now() - state.lastAtMs` exceeds a millisecond or two — so no future caller can silently lose a leg's tail the same way.",
      "risk": "low",
      "confidence": "high",
      "whatItWouldBreak": "Nothing runs differently — both halves are pure recording. The only invariant to respect is the module's own: \"IT CHANGES NO BEHAVIOUR … no step is gated, delayed, retried or skipped because of it\" (bootStepProfile.ts:56). Adding a `bootStep` call satisfies that. Note `__tests__` may assert the current row set; `apps/editor/__tests__/` should be checked for a builders-leg spec.",
      "filesToChange": [
        "apps/editor/src/engine/engineLauncher.ts",
        "apps/editor/src/engine/bootStepProfile.ts"
      ]
    },
    {
      "title": "`open:first-interactive-frame` is the LAST open mark and it fires before the heaviest post-load work — the founder is waiting inside an unnamed interval, for the fourth time",
      "mechanism": "`PlatformShell._armPostSceneMarks` (`:192-206`) reacts to `pryzm-project-loaded` by marking `open:snapshot-loaded` and then scheduling `open:first-interactive-frame` on the very next frame-scheduler tick. But that event has 35 listeners across 24 files, and the expensive ones queue work BEHIND that frame: `initScene.ts:3762` runs the consolidated tier+PBR pass (two full traverses of 3,762 meshes) and the backend swap on `setTimeout(0)`; `engineLauncher.ts:1509` runs `zoomToAll(true)` on `setTimeout(150)`; `initUI.ts:1462` restores IFC uploads on `setTimeout(500)`; `engineLauncher.ts:1467` and `initUI.ts:836` wire the Y.Doc and the documentation subsystems on `requestIdleCallback(timeout: 3000)`; `PlatformSaveController.ts:527` captures a thumbnail at `+3500 ms`; and `SaveOrchestrator.ts:473` opens a **4000 ms** post-load settle after which a full autosave fires. So the mark named \"first interactive frame\" names a scheduler tick, not usability, and everything after it is invisible to the instrument. This is the same defect shape `startupBudget.ts` documents three times over (`hub:open-clicked`, `parcel:selected`, `enter-canvas:requested`): an interval nothing names cannot be attributed, only guessed at.",
      "evidence": [
        "apps/editor/src/ui/platform/PlatformShell.ts:200-206 — `markStartupPhase('open:snapshot-loaded'); … getFrameScheduler().scheduleOnce('perf104-first-interactive-frame', () => { markStartupPhase('open:first-interactive-frame'); });`",
        "apps/editor/src/engine/initScene.ts:3762 — `setTimeout(() => { _runConsolidatedTierPbrPass?.(); … }, 0);`",
        "apps/editor/src/engine/engineLauncher.ts:1509 — `setTimeout(() => { zoomToAll(true).catch(() => {}); }, 150);`",
        "apps/editor/src/ui/platform/SaveOrchestrator.ts:473 — `this._settleUntil = Date.now() + 4000;`",
        "apps/editor/src/ui/platform/PlatformSaveController.ts:527 — `const CAPTURE_DELAY_MS = 3500;`",
        "apps/editor/src/engine/initUI.ts:836 — `ric(_scheduleDocSubsystems, { timeout: 3000 })` on `pryzm-project-loaded`",
        "grep count: 35 `on('pryzm-project-loaded'` / `addEventListener('pryzm-project-loaded'` occurrences across 24 files",
        "apps/editor/src/engine/startupBudget.ts:171-176 — the module's own rule: `⛔ Never quote an enter-canvas delta as a cost again without enter-canvas:requested in the same run. Say which half you measured.`"
      ],
      "estimatedCostMs": -1,
      "costBasis": "read-from-code",
      "fix": "Add the marks that bound the post-load storm, then move the report to the last one. Minimum useful set, all passive: `open:post-load-pass-done` (end of `_runConsolidatedTierPbrPass`, `initScene.ts:3766`); `open:backend-swap-start` / `open:backend-swap-done` (either side of `swapRendererBackend`, `initScene.ts:4858` — this leg has NO mark on ANY family today, exactly as `enter-canvas:bim-view` had none); `open:zoom-fit-done` (`engineLauncher.ts:1509`); `open:autosave-done` (`PlatformSaveController.saveVersionInternal` tail). Then fire `reportStartupBudget('open:autosave-done')` from the last of them (see finding 3) so the table covers what the founder actually waits through. Optionally rename the existing mark to `open:first-scheduler-frame` so its name stops asserting something it cannot know.",
      "risk": "low",
      "confidence": "high",
      "whatItWouldBreak": "`startupBudget.ts:36` — \"Add phases; do not rename them\" — the vocabulary is meant to be stable so regressions stay comparable across runs. Renaming `open:first-interactive-frame` breaks comparison with every prior founder paste; if that matters more than the misleading name, keep it and just add the new marks after it.",
      "filesToChange": [
        "apps/editor/src/engine/initScene.ts",
        "apps/editor/src/engine/engineLauncher.ts",
        "apps/editor/src/ui/platform/PlatformSaveController.ts",
        "apps/editor/src/ui/platform/PlatformShell.ts"
      ]
    },
    {
      "title": "The open path re-fetches the project list the hub just fetched — and it is the FIRST thing in the serial chain, blocking the engine boot",
      "mechanism": "`buildPersistence.openProject` step 1 does `if (projectListStore.isEmpty()) { await controller.refresh(); }` (`buildPersistence.ts:267-268`), and `ProjectListController.refresh()` (`ProjectListController.ts:44-55`) is `await this.client.list(); this.store.replaceAll(list);` — a server round-trip. The project hub, moments earlier, fetched the same corpus — but through a DIFFERENT sink: `ProjectHub._fetchSummaries` calls `this.runtime.persistence.client.listAll()` (`ProjectHub.ts:840`) and reconciles into `projectRepository`, never into `projectListStore`. A repo-wide grep finds `controller.refresh()` called from exactly two places, both inside `openProject` itself. So `projectListStore.isEmpty()` is true on the first open of every session and the open pays a full list round-trip that the hub already paid, BEFORE `attachedBootstrap.ensure()` starts the engine boot. If the project is not on that page (the hub's own comment at `ProjectHub.ts:326` notes \"Every list path is capped (50 by default)\"), `:273` refreshes a SECOND time.",
      "evidence": [
        "packages/runtime-composer/src/buildPersistence.ts:267-268 — `if (projectListStore.isEmpty()) { await controller.refresh(); }`",
        "packages/runtime-composer/src/buildPersistence.ts:271-274 — `if (!summary) { // Deep-link scenario: refresh and retry once.  await controller.refresh(); … }`",
        "packages/persistence-client/src/ProjectListController.ts:44-55 — `async refresh() { … const list = await this.client.list(); this.store.replaceAll(list); … }`",
        "apps/editor/src/ui/platform/ProjectHub.ts:840 — `const all = await client.listAll() as { projects: ProjectSummary[]; complete: boolean };` — the hub's own list fetch, into a different sink",
        "grep `controller\\.refresh\\(\\)` across all src: only buildPersistence.ts:268 and :273 (plus three comment references)",
        "apps/editor/src/ui/platform/PlatformRouter.ts:1240-1243 — `open:persistence-openProject → boot:ensure-requested is buildPersistence.openProject STEP 1 alone: the project-summary resolve, which calls controller.refresh() (a server list round-trip) whenever projectListStore is still empty.`"
      ],
      "estimatedCostMs": 200,
      "costBasis": "estimated",
      "fix": "Have the hub's sync land in the composed store. `ProjectHub.syncFromServer` already has the summaries in hand at `:318` (`const reading = await this._fetchSummaries();`); add `this.runtime?.persistence.projectListStore.replaceAll(reading.summaries)` right after `markStartupPhase('hub:sync-fetch-done')` at `:319`. `openProject`'s `isEmpty()` guard then short-circuits and the open starts at the engine boot instead of a network hop. Cheaper still and orthogonal: move step 1 off the serial chain entirely — the boot at `:308` does not read `summary` (only `projectContext.set` at `:300` and `setProjectContext` at `:337` do), so the summary resolve and the boot can be a `Promise.all`.",
      "risk": "low",
      "confidence": "high",
      "whatItWouldBreak": "The `isEmpty()` guard exists so the store is populated for the OI-059 soft-fallback path at `:277-296` (a project the server has forgotten still opens from local history). Seeding from the hub's `listAll()` preserves that — it is a superset of `list()`. The one thing to preserve is `ListCompleteness`: `ProjectHub.ts:323-332` (§FIX-A-PAGE-IS-NOT-AN-INVENTORY, L-10400) is emphatic that a page is not an inventory, so seeding must not let a partial page make `!summary` mean \"absent\" — the `:271` retry-once branch already handles that and must stay.",
      "filesToChange": [
        "apps/editor/src/ui/platform/ProjectHub.ts",
        "packages/runtime-composer/src/buildPersistence.ts"
      ]
    },
    {
      "title": "Two socket.io clients connect and join the same project room on every open",
      "mechanism": "`PlatformShell.setProjectContext` calls `initSocketCollaboration(this.ctx, id)` at `:250`, which mints a socket.io client and emits `join-project` (`PlatformCollabPill.ts:183-191`). Independently, the engine boot calls `initCollaboration({…})` at `engineLauncher.ts:1202`, whose `connectSocket` mints a SECOND client against the same origin and emits `join-project` for the same room (`initCollaboration.ts:579-594`), then additionally fires `_triggerCatchUp(projectId)` — another network request. Two WebSocket handshakes, two server-side room joins (each with its own access verification), two connections held for the session. The founder's log shows both join lines. This matters beyond the handshake cost because the repo already treats the per-host connection budget as scarce on exactly this path: `ProjectHub.ts:775-783` serialises the thumbnail back-fill to ONE connection precisely so it cannot \"put dozens of base64 image uploads ahead of `controller.refresh()` and `tier.streamLoad()` — the two requests the OPEN path is waiting on\".",
      "evidence": [
        "apps/editor/src/ui/platform/PlatformShell.ts:250 — `initSocketCollaboration(this.ctx, id);`",
        "apps/editor/src/ui/platform/PlatformCollabPill.ts:182-191 — `ctx.socket = ioFn({ transports: ['websocket','polling'], … }); ctx.socket.on('connect', () => { console.log('[PlatformCollabPill] Socket connected — joining project room:', projectId); ctx.socket.emit('join-project', projectId); });`",
        "apps/editor/src/engine/engineLauncher.ts:1202 — `initCollaboration({ container, commandManager, events: runtime?.events });`",
        "apps/editor/src/engine/initCollaboration.ts:579-597 — `socket = ioFn({ transports: ['websocket','polling'], … }); socket.on('connect', () => { … socket.emit('join-project', projectId); _triggerCatchUp(projectId)… });`",
        "FOUNDER'S LOG — `[PlatformCollabPill] Socket connected - joining project room: proj-…` AND `[initCollaboration] Socket connected - joining project room: proj-…   <-- joined TWICE`",
        "apps/editor/src/ui/platform/ProjectHub.ts:775-783 — the repo's own statement that the open path's requests compete for a ~6-connection-per-host budget"
      ],
      "estimatedCostMs": 150,
      "costBasis": "estimated",
      "fix": "One socket owner. `initCollaboration`'s client is the richer of the two — it carries remote cursors, `user-joined`, `join-project-denied` with the bounded retry (`§FIX-DB-SATURATION-RESILIENCE`), and the catch-up replay — so keep it and delete the second connection. `PlatformCollabPill` needs only `version-saved` (`PlatformCollabPill.ts:194-208`); have `initCollaboration` re-emit that on the runtime event bus and have the pill subscribe, so `initSocketCollaboration` stops minting a client and only tracks `ctx.socket` for the disconnect-on-switch it already does at `:169-172`.",
      "risk": "medium",
      "confidence": "high",
      "whatItWouldBreak": "The two sockets are not redundant in lifecycle: `initSocketCollaboration` is per-PROJECT (called from `setProjectContext`, disconnecting the previous one), while `initCollaboration` is wired once at ENGINE BOOT and re-joins on project change. Collapsing them must preserve the per-project re-join, or a project switch leaves the user in the previous project's room. `ctx.socket` is also read elsewhere in the shell (the `version-saved` echo suppression via `ctx.ownSyncedVersionIds`), so the field has to keep pointing at the surviving client.",
      "filesToChange": [
        "apps/editor/src/ui/platform/PlatformCollabPill.ts",
        "apps/editor/src/engine/initCollaboration.ts",
        "apps/editor/src/ui/platform/PlatformShell.ts"
      ]
    },
    {
      "title": "Every open serialises the whole project at least twice and captures the framebuffer twice — for a project the user has not touched",
      "mechanism": "After the hydrate, `PlatformVersionController.loadVersion` calls `resetDirtyAfterLoad()` (`:412`), which calls `getHash()` (`SaveOrchestrator.ts:591`), which is a FULL `saveAdapter.serialize()` + `stringify()` of every store (`PlatformSaveController.ts:110-116`) — synchronous, on the main thread, between \"hydrate done\" and the `pryzm-project-loaded` emit at `:419`. Then `setLoading(false)` opens a 4000 ms settle (`SaveOrchestrator.ts:473`); the post-load sweep (wall joins, room redetect, view rebuilds) dirties the model, so when the settle expires `executeSave` runs `getHash()` AGAIN (`:382`) — a second full serialize — and fires `saveVersionInternal('Auto-save')`, which captures a thumbnail (`PlatformSaveController.ts:357`), deflates, and writes the version envelope. Separately, `schedulePostLoadThumbnailCapture` (armed at `PlatformShell.ts:255`) fires at `+3500 ms` + idle and captures the framebuffer a SECOND time (`:551`). The founder's log confirms all of it: one `[ProjectSerializer] Snapshot created: 503 elements`, one `Version saved: \"Auto-save\" (503 elements)`, a 1.4 MB envelope write with 2366 journal records across 2 chunks, and `[captureThumbnail] Thumbnail captured` TWICE. The code prices these itself: the serialize at \"793 elements → ~16.6 MB … TWICE per fire\" (`SaveOrchestrator.ts:245`) and the capture at \"a ~2.5 s LONGTASK\" historically (`PlatformSaveController.ts:524`).",
      "evidence": [
        "apps/editor/src/ui/platform/PlatformVersionController.ts:411-412 — `this.saveCtrl.orchestrator.setLoading(false); this.saveCtrl.orchestrator.resetDirtyAfterLoad();` — immediately before the `pryzm-project-loaded` emit at :419",
        "apps/editor/src/ui/platform/SaveOrchestrator.ts:588-594 — `resetDirtyAfterLoad() { const hash = this.getHash(); this.markClean(hash); … }`",
        "apps/editor/src/ui/platform/PlatformSaveController.ts:110-116 — `const snapshot = ctx.saveAdapter.serialize({…}); const json = ctx.saveAdapter.stringify(snapshot);` — the whole-project walk behind `getHash`",
        "apps/editor/src/ui/platform/SaveOrchestrator.ts:244-248 — `autosave does a FULL-project serialize (793 elements → ~16.6 MB) TWICE per fire (once in getHash() for the dirty-check, once in saveVersionInternal for the snapshot) plus a main-thread deflate`",
        "apps/editor/src/ui/platform/SaveOrchestrator.ts:473 — `this._settleUntil = Date.now() + 4000;`",
        "apps/editor/src/ui/platform/PlatformSaveController.ts:355-357 — the autosave-path capture; :551 — the post-load-path capture; :522-526 — `the capture path serializes the WebGPU/Canvas2D framebuffer to a base64 WebP, which historically caused a ~2.5 s LONGTASK`",
        "FOUNDER'S LOG — `[ProjectSerializer] Snapshot created: 503 elements … temporalGraph 2366 mutations`; `[VersionRepository] reason=save-version - 6 version(s) persisted … ~1.4 MB (1,465,135 chars) compressed, JOURNAL-SIDECAR: 2366 journal record(s) … in 2 chunk(s)`; `[PlatformSaveController] Version saved: \"Auto-save\" (503 elements)`; `[captureThumbnail] Thumbnail captured …  <-- appears TWICE`"
      ],
      "estimatedCostMs": 1500,
      "costBasis": "estimated",
      "fix": "Two cheap, independent halves — and DO NOT touch the save's durability semantics. (a) COALESCE THE TWO CAPTURES: `schedulePostLoadThumbnailCapture`'s `runCapture` (`PlatformSaveController.ts:544`) should stand down if `saveVersionInternal` already captured within the settle window — record the last capture timestamp on the controller and early-return, exactly the way `_drainThumbnailBackfill` already stands down on `isOpenInFlight`. (b) MOVE THE BASELINE SERIALIZE OFF THE CRITICAL PATH: `resetDirtyAfterLoad`'s only job is to set a comparison baseline, and it currently runs synchronously between the hydrate and the `pryzm-project-loaded` emit. Compute it on the frame scheduler's next idle tick instead (the settle window is 4 s wide — there is no race), so the emit that unblocks 35 listeners is not queued behind a 10 MB stringify.",
      "risk": "high",
      "confidence": "high",
      "whatItWouldBreak": "The baseline hash is what stops autosave firing on an unchanged model, and `flushBeforeUnload` (`SaveOrchestrator.ts:429-430`) reads `lastHash` synchronously on tab close. Deferring the baseline opens a window in which `lastHash === ''` and a tab close writes an emergency save of freshly-loaded data — harmless but wasteful, and it MUST NOT become a window in which a real edit is lost. Half (b) needs a spec before it ships. Half (a) is much safer: the only invariant is `§FIX-THUMBNAIL-DURABILITY` — a preview must still self-heal — and reusing the autosave's fresher capture satisfies it strictly better than capturing twice.",
      "filesToChange": [
        "apps/editor/src/ui/platform/PlatformSaveController.ts",
        "apps/editor/src/ui/platform/SaveOrchestrator.ts"
      ]
    },
    {
      "title": "`openProject` resolves and the loading overlay hides BEFORE the project is loaded — so every \"open took N ms\" measured from that promise is measuring the boot",
      "mechanism": "`PlatformShell.setProjectContext` is declared `: void` (`PlatformShell.ts:216-220`), and the surface contract says so explicitly: \"Returning `void` is the production reality\" (`WorkspaceSurface.ts:70-71`). `buildPersistence.ts:337` does `await attachedSurface.setProjectContext(...)`, which awaits a non-thenable and therefore resolves on the next microtask — i.e. as soon as `getLatestVersion` and the SYNCHRONOUS head of `loadVersion()` have run. The actual hydrate (`await this.ctx.loadAdapter.load(version.snapshot)`, `PlatformVersionController.ts:393`) is still in flight. `buildPersistence.ts:341` then emits `openProgress: done @ 100%` and `PlatformRouter.ts:1259` calls `overlay.hide()`. Visually it is seamless — `loadVersion` mounts its own \"Loading …\" overlay at `:335-345` before returning — but structurally the promise the whole open pipeline is built around does not bound the open. Any timing derived from it, and the `done` progress event any UI trusts, are both about the engine boot only.",
      "evidence": [
        "apps/editor/src/ui/platform/PlatformShell.ts:216-220 — `setProjectContext(id: string, name: string, opts?: {…}): void {`",
        "packages/renderer-three/src/WorkspaceSurface.ts:69-71 — `Returning `void` is the production reality.  We accept `void | Promise<void>` here so test doubles can be async…`",
        "packages/runtime-composer/src/buildPersistence.ts:337 — `await attachedSurface.setProjectContext(summary.id, summary.name, contextOpts);`",
        "packages/runtime-composer/src/buildPersistence.ts:340-341 — `// ── 5. Done ──  emitProgress('done', 100);`",
        "apps/editor/src/ui/platform/PlatformRouter.ts:1259 — `overlay.hide();` — immediately after the awaited openProject returns",
        "apps/editor/src/ui/platform/PlatformVersionController.ts:335-345 — loadVersion mounts its OWN `plat-overlay` before awaiting the load",
        "apps/editor/src/ui/platform/PlatformVersionController.ts:393 — `const result: ILoadResult = await Promise.race([ this.ctx.loadAdapter.load(version.snapshot), stallPromise ]);`"
      ],
      "estimatedCostMs": -1,
      "costBasis": "read-from-code",
      "fix": "The host type already permits it: return the load promise. Make `PlatformShell.setProjectContext` return `Promise<void>` that resolves when `loadVersion` (or the empty-load / server-restore branch) settles — `WorkspaceSurfaceHost.setProjectContext` is typed `void | Promise<void>` at `WorkspaceSurface.ts:76`, so no contract change is needed. Then `openProject`'s `done@100%` and the router's `overlay.hide()` describe a loaded project, and a single `performance.now()` bracket around `runtime.persistence.openProject()` becomes a real open measurement.",
      "risk": "medium",
      "confidence": "high",
      "whatItWouldBreak": "The current early hide is load-bearing for perceived latency: the router's overlay comes down and `loadVersion`'s own overlay takes over, so the user sees continuous motion. Making the promise honest means the router overlay stays up longer and the two overlays no longer hand off — decide which one owns the whole window before changing this, or the open will FEEL slower while being identical. `§FIX-OPEN-GESTURE-ONCE`'s latch is released in `finally` (`PlatformRouter.ts:1281`), so a longer-lived promise also holds the latch longer — a user clicking a second card mid-load would now be chained rather than superseded, which `decideOpenDisposition` already handles but with different timing.",
      "filesToChange": [
        "apps/editor/src/ui/platform/PlatformShell.ts",
        "packages/runtime-composer/src/buildPersistence.ts",
        "apps/editor/src/ui/platform/PlatformRouter.ts"
      ]
    },
    {
      "title": "web-ifc (3.5 MB) is still statically on the engine-boot graph via the `@pryzm/file-format` barrel — diagnosis fix #7, not applied",
      "mechanism": "`initUI.ts` does VALUE imports from the package barrel (`:57 deleteIfcImportedElement`, `:106 sheetExportService`, `:107 dxfExportService`), and `packages/file-format/src/index.ts:266-270` statically re-exports the whole IFC exporter chain (`exportIFC`, `auditIfcWorkflow`, `IfcExporter`, `exportScope`). Every one of those modules does `import * as WEBIFC from 'web-ifc'` at module scope. `initUI` runs inside the engine boot (`boot:data-platform-done → boot:ui-done`, `engineLauncher.ts:1132-1149`), so the 3.5 MB wasm-binding bundle is downloaded, parsed and evaluated before the editor can paint — for a code path nobody on the open touches. The 2026-09-02 cpuprofile measured `(program)` — JS parse/compile — at **5777 ms self across a 16.2 s cold open**, and attributed `vendor-web-ifc 3.5 MB` inside a ~25 MB boot-path total. Note this cost lands BEFORE `hub:open-clicked` (it is module evaluation), so it inflates a COLD tab's open and not a warm re-open — but the founder's complaint does not distinguish them.",
      "evidence": [
        "apps/editor/src/engine/initUI.ts:57 — `import { deleteIfcImportedElement } from '@pryzm/file-format';` (value import, not `import type`)",
        "apps/editor/src/engine/initUI.ts:106-107 — `import { sheetExportService } from '@pryzm/file-format'; import { dxfExportService } from '@pryzm/file-format';`",
        "packages/file-format/src/index.ts:266-270 — `export { exportIFC } from './export/ifc/ExportIFC.ts'; … export { IfcExporter } from './export/ifc/IfcExporter.ts'; export { getImportedIfcElementCount, showExportScopeModal } from './export/ifc/exportScope.ts';`",
        "packages/file-format/src/export/ifc/IfcExporter.ts:22 — `import * as WEBIFC from 'web-ifc';` (and 8 sibling files: auditIfc.ts:1, IfcGeometryWriter.ts:1, IfcModelBuilder.ts:12, IfcPropertyWriter.ts:1, IfcSemanticWriter.ts:31, IfcSpatialStructure.ts:1, IfcGeometryRenderer.ts:2, IfcImporter.ts:26)",
        "audit/perf/2026-09-02/diagnosis.md AXIS D — `JS parse/compile + native (program) | 5777 self, spread over all 16 s | ~25 MB of JS on the boot path: main 8.5 MB + engineLauncher 4.4 + domain-engine 4.4 + vendor-web-ifc 3.5 (statically imported via packages/file-format/src/export/ifc/* — import * as WEBIFC from 'web-ifc') … web-ifc and the IFC exporter are pure dead weight at startup.`",
        "audit/perf/2026-09-02/diagnosis.md ranked fix 7 — `PLANNED — file-format HELD by the UCE wave. Saving: parse share of (program) 5.8 s (est. 200-400 ms) + memory.`"
      ],
      "estimatedCostMs": 300,
      "costBasis": "measured-from-log",
      "fix": "Break the barrel edge, not the feature. Move the four IFC re-exports at `packages/file-format/src/index.ts:266-270` behind a dedicated subpath (`@pryzm/file-format/ifc`), the way `@pryzm/sync-client/websocket-provider` already keeps y-websocket off the base barrel (`engineLauncher.ts:165`: \"the real transport lives behind a subpath so the base barrel stays free of the y-websocket dependency\"). `initUI`'s three value imports are for DXF/sheet export and IFC element deletion, none of which need the exporter — they will resolve unchanged. Then make the IFC export/import entry points dynamic imports at their UI call sites. Note the same pattern is the fix for `packages/geometry-stair/src/index.ts`, which also pulls `IfcExporter` from a barrel.",
      "risk": "medium",
      "confidence": "medium",
      "whatItWouldBreak": "Nothing functional — every consumer of `exportIFC`/`IfcExporter` is a user-initiated export or import, none of which is on the open path. The blast radius is import-specifier churn across whoever imports those four names from the barrel, plus the layer gate: check `npx tsx tools/ga-gate/check-layer-boundaries.ts` after, since a new subpath adds a new resolvable specifier. The diagnosis flags `file-format` as HELD by the UCE wave — coordinate before touching it.",
      "filesToChange": [
        "packages/file-format/src/index.ts",
        "apps/editor/src/engine/initUI.ts",
        "packages/geometry-stair/src/index.ts"
      ]
    },
    {
      "title": "The whole-corpus version-mirror warm reads EVERY project's history, and it is awaited on the deep-link / reload open path",
      "mechanism": "`VersionCacheStore.warm()` (`:115-148`) opens an unfiltered cursor over the entire versions object store and pushes every row into a module-level `Map`: `if (typeof cursor.value === 'string') _versionMirror.set(String(cursor.key), cursor.value); cursor.continue();`. `warmVersionCache()` (`ProjectRepository.ts:971`) wraps it and additionally scans all of `localStorage` for legacy keys to migrate. `PlatformShell.setProjectContext` calls it fire-and-forget before the version read, but the no-local-version branch AWAITS it (`:329-336`) before deciding to go to the server. Nothing on the open path needs another project's history — `startupBudget.ts:104-106` says exactly that about the hub's copy of the same call. On a hub-open the hub has already paid it (`hub:warm-versions-done`) so the `_warmed` guard makes it free; on a deep-link, a hard reload, or a reopen-after-renderer-swap (which `PlatformRouter.ts:1110-1118` deliberately performs via `sessionStorage`), it is on the critical path and scales with the whole corpus, not the project.",
      "evidence": [
        "apps/editor/src/ui/platform/VersionCacheStore.ts:121-132 — `const tx = this._db!.transaction(VERSIONS_STORE, 'readonly'); … const cursorReq = store.openCursor(); … _versionMirror.set(String(cursor.key), cursor.value); cursor.continue();`",
        "apps/editor/src/ui/platform/ProjectRepository.ts:971-995 — `warmVersionCache()`: `await store.warm()` then a full `localStorage` scan for legacy `bim-project-*-versions` keys",
        "apps/editor/src/ui/platform/PlatformShell.ts:288 — `void warmVersionCache();` (fire-and-forget) and :329-336 — `const warmAttempt … = (!prefetched) ? warmVersionCache().then(…)` which the else-branch awaits",
        "apps/editor/src/engine/startupBudget.ts:104-106 — `hub:warm-versions-done is the whole-corpus version-mirror warm: it reads EVERY project's entire compressed container, and NOTHING on the open path needs another project's history.`",
        "apps/editor/src/ui/platform/VersionCacheStore.ts:156-158 — `getVersionsSync(projectId)` reads a single key from the mirror — the only thing the open path actually consumes"
      ],
      "estimatedCostMs": 250,
      "costBasis": "estimated",
      "fix": "Add a narrow warm and use it on the open path. `VersionCacheStore` already has `getVersionsSync(projectId)` reading one key; add `warmOne(projectId): Promise<void>` doing `tx.objectStore(VERSIONS_STORE).get(projectId)` into the same mirror, and have `PlatformShell.setProjectContext` (`:288` and `:329`) call that instead of the full `warmVersionCache()`. Keep the full warm where it belongs — the hub grid, which genuinely needs every project's row. The legacy-localStorage migration in `warmVersionCache` is a one-time corpus repair and should stay on the hub's copy, not the open's.",
      "risk": "low",
      "confidence": "high",
      "whatItWouldBreak": "`_warmed` is a single boolean guarding the WHOLE-corpus read; a `warmOne` must not set it, or a later hub mount would skip the full warm and paint a grid with no version chips. Give the narrow path its own per-project seen-set. Also `_reclaimRedundantLegacyVersionStores` / the quota-recovery paths assume the mirror is complete when deciding a localStorage blob is redundant (`ProjectRepository.ts:1055+`) — those must keep requiring the FULL warm, or a partially-warmed mirror could let a reclaim drop a blob it wrongly believes is already in IDB. That is data loss, so gate reclaim on `isWarmed()`.",
      "filesToChange": [
        "apps/editor/src/ui/platform/VersionCacheStore.ts",
        "apps/editor/src/ui/platform/ProjectRepository.ts",
        "apps/editor/src/ui/platform/PlatformShell.ts"
      ]
    }
  ]
}