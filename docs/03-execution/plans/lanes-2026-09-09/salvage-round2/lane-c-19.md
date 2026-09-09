{
  "dimension": "Legacy and dead code on the project-open path",
  "summary": "The founder's paste contains NO `[§STARTUP-BUDGET]` marks and no `[ProjectLoader] PHASE_TIMINGS` line, so nothing in this dimension is MEASURED on his machine — every millisecond below is read-from-code or estimated, and I have labelled them that way. What I did establish by reading code: (1) every open awaits a full server fetch of the latest-version snapshot (`buildPersistence.ts:316`) whose result is thrown away whenever local IndexedDB history exists, because `PlatformShell` reads `prefetchedVersion` only in the branch that runs when there is NO local version (`PlatformShell.ts:322`, inside the `else` at :320) — superseded plumbing that was never retired; (2) opening an unedited project performs TWO full-model `ProjectSerializer.serialize()+stringify()` passes plus a deflate, an IndexedDB version write and a thumbnail capture — the founder's own log lines `Snapshot created: 503 elements`, `6 version(s) persisted (~1.4 MB)`, `Version saved: \"Auto-save\" (503 elements)` are that path; (3) the thumbnail is captured twice per open (`PlatformSaveController.ts:357` and `:551`), matching the two `[captureThumbnail]` lines; (4) two independent socket.io clients each connect and each emit `join-project`, matching the two join lines — the `PlatformCollabPill` one is tagged `TODO(C.3.x): legacy io`. Separately, `packages/persistence-client/src/loader/{ProjectSerializer,ProjectLoader,MigrationEngine}.ts` (~2,970 lines) is provably dead in production — not barrel-exported, imported only by `tools/rac-conformance` cert tests — and its `MigrationEngine.ts` is byte-identical (modulo whitespace) to the editor's copy.",
  "findings": [
    {
      "title": "Every open awaits a full server snapshot fetch whose result is discarded when local history exists",
      "mechanism": "`buildPersistence.openProject` step 3 does `const bundle = hint?.isNewProject ? null : await tier.streamLoad(projectId)` — a serial `fetch('/api/projects/<id>/latest-version')` plus a main-thread `res.json()` of the WHOLE latest snapshot — and only then calls step 4 `await attachedSurface.setProjectContext(id, name, { prefetchedVersion: bundle })`. `PlatformShell.setProjectContext` reads local IndexedDB history FIRST (`const latest = versionRepository.getLatestVersion(id)`, :297) and, if it finds any, calls `this.versionCtrl.loadVersion(latest)` and returns. `prefetchedVersion` is destructured only at :322, inside the `else` branch opened at :320 (\"No local versions\"). So for any returning user — the founder has 6 local versions per his own log — the awaited download + parse is pure serial latency on the critical path, and the engine's load cannot begin until it completes. This is supersession without retirement: the Wave-7 tier leg was added so PlatformShell could \"skip its own loadLatestVersionFromServer() round-trip\" (buildPersistence.ts:321), but the older local-first branch predates it and wins.",
      "evidence": [
        "packages/runtime-composer/src/buildPersistence.ts:316 — `const bundle = hint?.isNewProject ? null : await tier.streamLoad(projectId);`",
        "packages/runtime-composer/src/buildPersistence.ts:153-156 — `streamLoad: async (projectId) => { ... await fetch(`/api/projects/${projectId}/latest-version`, ...)`",
        "apps/editor/src/ui/platform/PlatformShell.ts:297-301 — `const latest = versionRepository.getLatestVersion(id);` / `if (latest) { console.log('[PlatformShell] Auto-restoring latest local version:', latest.label); this.versionCtrl.loadVersion(latest); }`",
        "apps/editor/src/ui/platform/PlatformShell.ts:320-322 — `// No local versions: clear the scene, then fetch from server.` ... `const prefetched = opts?.prefetchedVersion as ({`",
        "grep for `prefetchedVersion` across **/*.ts — exactly ONE consumer in production: PlatformShell.ts:322 (the rest are the type signature, buildPersistence's producer, WorkspaceSurface's doc comment, and apps/bench)",
        "server.js:3513-3535 — the endpoint returns the whole record: `.select('id,project_id,label,created_at,element_count,snapshot')` → `res.json({ version: data })`"
      ],
      "estimatedCostMs": 800,
      "costBasis": "estimated",
      "fix": "Do not fetch what the caller will not read. Either (a) move the local-history probe UP into `buildPersistence.openProject` and skip `tier.streamLoad` when a local version already satisfies the open, or (b) make step 3 non-blocking (fire it, hand `setProjectContext` a promise, and let the local branch cancel it). (a) is smaller and matches the existing `hint.isNewProject` skip already in that line. Add a `markStartupPhase('open:stream-load-start'/'-done')` pair around it first — no mark brackets this leg today, which is why it has never appeared in a founder trace.",
      "risk": "low",
      "confidence": "high",
      "whatItWouldBreak": "The fetch is also the freshness check: a project edited on another device has a newer SERVER version than the local mirror, and today the local-first branch already ignores it (the discarded bundle is never compared), so skipping the fetch removes no behaviour that exists. Confirm before changing: `_loadLatestVersionFromServer` (PlatformShell.ts:465) remains the fallback for the no-local-version path and must keep working.",
      "filesToChange": [
        "packages/runtime-composer/src/buildPersistence.ts",
        "apps/editor/src/ui/platform/PlatformShell.ts"
      ]
    },
    {
      "title": "Opening an unedited project writes a brand-new saved version: full serialize + deflate + IndexedDB write + server queue",
      "mechanism": "`ProjectLoader` opens an autosave-suppression window for the whole load and its deferred sweep, then closes it (`__closeAutosaveSuppress`, :649-651). `SaveOrchestrator.handleLoadSuppressEnd()` re-arms exactly one debounced save if the post-load sweep marked the model dirty; `executeSave()` then calls `getHash()` (a full `ProjectSerializer.serialize()` + `stringify()`) and `onAutoSave('Auto-save')`, which deflates and writes the version container. The founder's log is that sequence verbatim: `Snapshot created: 503 elements` → `6 version(s) persisted to IndexedDB (~1.4 MB ...)` → `Version saved: \"Auto-save\" (503 elements)`. The model was not edited — the post-load sweep (wall-rebuild flush, per-level room redetect) mutates it, which is what arms the save. The skip-guard cannot help on a cold open: `if (this.lastHash !== '' && currentHash === this.lastHash)` — `lastHash` starts `''`, so the first save of a session is unconditional.",
      "evidence": [
        "apps/editor/src/ui/platform/SaveOrchestrator.ts:531-541 — `private handleLoadSuppressEnd(): void { this._loadSuppressActive = false; ... if (this.hasDirtyChanges || this.pendingSave) { this.pendingSave = false; this.scheduleDebounce(); } }`",
        "apps/editor/src/ui/platform/SaveOrchestrator.ts:382-386 — `const currentHash = this.getHash(); if (this.lastHash !== '' && currentHash === this.lastHash) { console.log('[SaveOrchestrator] Content hash unchanged — save skipped');`",
        "apps/editor/src/ui/platform/SaveOrchestrator.ts:244-247 (the code's OWN size measurement) — `// §PERF-AUTOSAVE-DEBOUNCE (2026-06-27) — autosave does a FULL-project serialize (793 elements → ~16.6 MB) TWICE per fire`",
        "apps/editor/src/engine/initPersistence.ts:161-163 — `// captureThumbnail is called synchronously during autosave (which fires right after project load)`",
        "founder log — `[VersionRepository] reason=save-version - 6 version(s) persisted to IndexedDB (~1.4 MB (1,465,135 chars) compressed ...)` and `[PlatformSaveController] Version saved: \"Auto-save\" (503 elements)`"
      ],
      "estimatedCostMs": 1200,
      "costBasis": "estimated",
      "fix": "Do not mint a version for a load. Two independent halves: (1) seed `lastHash` from the snapshot the loader just consumed — the loader already has the exact bytes, and `computeSnapshotChecksum` (packages/persistence-client/src/loader/SnapshotIntegrity.ts, already computed and verified at load) is a cheaper baseline than re-serialising the live stores; (2) have the post-load sweep dispatch with a `source: 'PROJECT_LOAD'`-equivalent tag so its mutations do not set `hasDirtyChanges` — the sweep re-derives state the snapshot already carried (rooms, joins), so its output is by definition not a user edit. Either half alone removes the write.",
      "risk": "medium",
      "confidence": "high",
      "whatItWouldBreak": "The load-settle save is the safety net for a sweep that legitimately HEALS a snapshot (the §LOAD-HEAL-DEGENERATE-POLYGON path at ProjectLoader.ts:2984-2989 drops degenerate rooms and re-detects). If the sweep's repair is never persisted, the same heal re-runs on every open. Fix (2) must therefore keep an explicit 'the loader healed something' signal that still arms one save; fix (1) is safe on its own.",
      "filesToChange": [
        "apps/editor/src/ui/platform/SaveOrchestrator.ts",
        "apps/editor/src/ui/platform/PlatformSaveController.ts",
        "apps/editor/src/engine/persistence/ProjectLoader.ts"
      ]
    },
    {
      "title": "The whole model is serialized a SECOND time on the open path just to produce a dirty-check baseline",
      "mechanism": "`orchestrator.resetDirtyAfterLoad()` is called in `loadVersion`'s `.then` on every open. Its body is `const hash = this.getHash(); this.markClean(hash);` and `getHash` is `ctx.saveAdapter.serialize({...})` followed by `ctx.saveAdapter.stringify(snapshot)` — a full walk of every element store, `deepStrip`, ~30 sub-store serializes, then a stringify of the result. This produces no persisted artefact; it exists solely so the NEXT save can compare a string. It runs in addition to the serialize inside the autosave described above, so an unedited open pays the walk twice. The canonical, already-computed alternative is in the snapshot the loader just read: `verifySnapshotChecksum` / `computeSnapshotChecksum` are imported by `ProjectLoader.ts:68` and run at load.",
      "evidence": [
        "apps/editor/src/ui/platform/SaveOrchestrator.ts:589-596 — `resetDirtyAfterLoad(): void { try { const hash = this.getHash(); this.markClean(hash); } catch { this.markClean(); } }`",
        "apps/editor/src/ui/platform/PlatformSaveController.ts:104-118 — `getHash: () => { ... const snapshot = ctx.saveAdapter.serialize({ projectName: ctx.projectName, projectId: ctx.projectId }); const json = ctx.saveAdapter.stringify(snapshot); this._autosaveSerialization = { snapshot, json }; return json; }`",
        "apps/editor/src/ui/platform/PlatformSaveController.ts:63-67 — `An auto-save previously walked every store THREE times per fire ... At 80-apartment scale each pass is O(all elements) + deepStrip + ~30 sub-store serializes — the dominant save cost.`",
        "apps/editor/src/ui/platform/PlatformVersionController.ts:412 — `this.saveCtrl.orchestrator.resetDirtyAfterLoad();` (in loadVersion's completion path)",
        "apps/editor/src/engine/persistence/ProjectLoader.ts:68 — `import { verifySnapshotChecksum } from '@pryzm/persistence-client';`"
      ],
      "estimatedCostMs": 450,
      "costBasis": "estimated",
      "fix": "Give `resetDirtyAfterLoad` an optional `hash` argument and have the load caller pass the checksum/JSON the loader already holds, instead of re-deriving it from the live stores. `markClean(hash?)` already accepts one — the plumbing exists, only `resetDirtyAfterLoad` refuses to use it.",
      "risk": "low",
      "confidence": "high",
      "whatItWouldBreak": "The re-serialize is not purely redundant: it captures the model AFTER hydrate-time normalisation (defaults filled in, ids minted), so a baseline taken from the raw snapshot bytes could differ from what the next serialize produces and cause one spurious save. That is one save instead of one save — no regression — but it must be verified, not assumed.",
      "filesToChange": [
        "apps/editor/src/ui/platform/SaveOrchestrator.ts",
        "apps/editor/src/ui/platform/PlatformVersionController.ts",
        "apps/editor/src/ui/platform/PlatformShell.ts"
      ]
    },
    {
      "title": "The project thumbnail is captured twice per open, and one of the two is on the critical path",
      "mechanism": "`schedulePostLoadThumbnailCapture(id)` (called unconditionally from `setProjectContext`, PlatformShell.ts:255) arms a capture 3500 ms after `pryzm-project-loaded`, deliberately deferred to `requestIdleCallback` and writing ONLY the thumbnail field — its stated purpose is that hub cards stay current 'even for projects that have never been manually saved or auto-saved'. Independently, the post-load autosave path calls `this.ctx.saveAdapter.captureThumbnail?.()` inline at PlatformSaveController.ts:357, with no idle deferral. Each capture forces a synchronous `rpm.render()` of the whole scene (3762 meshes on the founder's run), then `ctx.getImageData(...)` — a GPU→CPU readback that stalls the pipeline — then a `toDataURL` encode ladder of up to six rungs. The founder's log shows `[captureThumbnail]` twice. Given the deferred capture exists and always runs, the inline one is redundant work at exactly the wrong moment.",
      "evidence": [
        "apps/editor/src/ui/platform/PlatformSaveController.ts:355-357 — `const capturedThumb = planBlocksSync ? null : (this.ctx.saveAdapter.captureThumbnail?.() ?? null);`",
        "apps/editor/src/ui/platform/PlatformSaveController.ts:551 — `const thumb = this.ctx.saveAdapter.captureThumbnail?.() ?? null;` (inside `runCapture` of schedulePostLoadThumbnailCapture)",
        "apps/editor/src/ui/platform/PlatformSaveController.ts:524-527 — `PERF-FIX (Apr 2026): Wait an extra second AND yield to idle before capturing. The capture path serializes the WebGPU/Canvas2D framebuffer to a base64 WebP, which historically caused a ~2.5 s LONGTASK right after first paint.`",
        "apps/editor/src/engine/initPersistence.ts:175-178 — `if (pryzmCanvas) { try { const rpm = window.renderPipelineManager; if (rpm) rpm.render(); } catch {} }`",
        "apps/editor/src/engine/initPersistence.ts:220 — `const { data } = ctx.getImageData(sampleX, sampleY, sampleW, sampleH);`",
        "packages/core-app-model/src/preview/thumbnailBudget.ts:68-75 — `THUMBNAIL_ENCODE_LADDER` = six rungs, each a fresh `toDataURL`",
        "founder log — `[captureThumbnail] Thumbnail captured ...` appears TWICE"
      ],
      "estimatedCostMs": 400,
      "costBasis": "estimated",
      "fix": "Skip the inline capture on the AUTOSAVE path when a post-load capture is already armed for this project (the controller owns both — a single `_postLoadCaptureArmed` boolean suffices). The save already falls back to `capturedThumb ?? existingMeta?.thumbnail`, so a null capture is a supported outcome and the deferred capture writes the fresh tile 3.5 s later.",
      "risk": "low",
      "confidence": "high",
      "whatItWouldBreak": "On the plan-rejected path (`planBlocksSync`) the inline capture is already skipped and the code comment says 'The renderer still captures a fresh thumbnail on the post-load path so the hub preview stays current' — so the deferred capture is already the sole source in one configuration. Nothing else reads the inline result except the version record's thumbnail field.",
      "filesToChange": [
        "apps/editor/src/ui/platform/PlatformSaveController.ts"
      ]
    },
    {
      "title": "Two socket.io clients connect and both emit join-project on every open — one is tagged legacy",
      "mechanism": "`PlatformShell.setProjectContext` calls `initSocketCollaboration(this.ctx, id)` at :250, which loads the socket.io client, opens a connection and emits `join-project` on connect. Independently, `initCollaboration` (wired from `engineLauncher.ts:1202`) opens its OWN socket and emits `join-project` on connect. They do different things (the pill's socket listens only for `version-saved` to show a toast; initCollaboration carries presence + command sync), but they are two transports for one room. Server-side each `join-project` costs `await getSupabaseClient()` plus `await canUserAccessProject(...)` — a DB access check — so the check is paid twice per open. The pill's version carries its own retirement note.",
      "evidence": [
        "apps/editor/src/ui/platform/PlatformShell.ts:250 — `initSocketCollaboration(this.ctx, id);`",
        "apps/editor/src/ui/platform/PlatformCollabPill.ts:166 — `TODO(C.3.x): legacy io — replace with runtime.transport.socket`",
        "apps/editor/src/ui/platform/PlatformCollabPill.ts:189-192 — `ctx.socket.on('connect', () => { console.log('[PlatformCollabPill] Socket connected — joining project room:', projectId); ctx.socket.emit('join-project', projectId); });`",
        "apps/editor/src/engine/initCollaboration.ts:588-593 — `console.log('[initCollaboration] Socket connected — joining project room:', projectId);` ... `socket.emit('join-project', projectId);`",
        "server.js:576-587 — `const supabase = await getSupabaseClient().catch(() => null); const access = await canUserAccessProject(socket.data.userId, projectId, {...});`",
        "founder log — both `[PlatformCollabPill] Socket connected - joining project room` and `[initCollaboration] Socket connected - joining project room` appear"
      ],
      "estimatedCostMs": 50,
      "costBasis": "estimated",
      "fix": "Retire the pill's socket: move its single `version-saved` listener onto the `initCollaboration` socket and delete `initSocketCollaboration`'s connect half (keep `mountPresenceStrip`). That is what the file's own TODO(C.3.x) asks for, and it halves the server-side access check per open.",
      "risk": "medium",
      "confidence": "high",
      "whatItWouldBreak": "Ordering: the pill's socket is created in `setProjectContext` (before load) while initCollaboration's connects on `pryzm-project-loaded` (after). A collaborator's `version-saved` emitted in that window would be missed if the listener simply moves. Also `ctx.socket` is a typed field on ShellCtx (PlatformShellTypes.ts:168) with other readers — check them before deleting it.",
      "filesToChange": [
        "apps/editor/src/ui/platform/PlatformCollabPill.ts",
        "apps/editor/src/ui/platform/PlatformShell.ts",
        "apps/editor/src/engine/initCollaboration.ts"
      ]
    },
    {
      "title": "ProjectIsolationAudit flattens the entire THREE scene on every project load — and the comment that says otherwise is stale",
      "mechanism": "`installProjectIsolationAudit()` runs unconditionally in `initTools`. On every `pryzm-project-loaded` it schedules one frame later and runs `runAudit`, which calls `collectSceneObjects(window.scene)` — a full `scene.traverse` that pushes one object literal per node and, for every non-root node, walks the parent chain via `hasIdBearingAncestor(o, scene)` — plus `getAll()` on 15 store globals. On the founder's run the scene held 3762 meshes. This is diagnostic-only work: the audit never repairs, it reports. The call site's comment still describes the SUPERSEDED behaviour ('runs once on every empty-project load'), which the audit's own header explicitly reverses.",
      "evidence": [
        "apps/editor/src/engine/initTools.ts:3890-3896 — `// 2. ProjectIsolationAudit: runtime tripwire that runs once on every //    empty-project load.` ... `installProjectIsolationAudit();`",
        "packages/core-app-model/src/persistence/ProjectIsolationAudit.ts:24-25 — `(2) RUNS ON EVERY LOAD, not only \\`empty:true\\`. The previous audit only ran on empty loads because it could not tell ...`",
        "packages/core-app-model/src/persistence/ProjectIsolationAudit.ts:1277-1290 — `scene.traverse((o) => { ... out.push({ name: o.name, userData: o.userData, type: o.type, isRoot, attributedByAncestor: isRoot ? false : hasIdBearingAncestor(o, scene) }); });`",
        "packages/core-app-model/src/persistence/ProjectIsolationAudit.ts:1168-1173 — `AUDITED_STORE_GLOBALS` = 15 store names, each `getAll()`-ed",
        "packages/core-app-model/src/persistence/ProjectIsolationAudit.ts:1404-1412 — `_dispose = bus.on('pryzm-project-loaded', ...` → `getFrameScheduler().scheduleOnce('project-isolation-audit', () => { const { report, coverage } = runAudit(...)`",
        "founder log — `3762 meshes (ARM TRIPPED)`"
      ],
      "estimatedCostMs": 30,
      "costBasis": "estimated",
      "fix": "Two options, and the choice is a product call, not a technical one: (a) keep it always-on but chunk the traverse through the FrameScheduler the way the redetect sweep already is, or (b) gate it behind the same diagnostics switch the perf console uses and run it on project SWITCH only (A→B, where a leak is actually possible) rather than on cold open (where there is no prior project to leak from). Fix the stale comment at initTools.ts:3890 either way — it currently tells a reader this costs nothing on a real project.",
      "risk": "low",
      "confidence": "medium",
      "whatItWouldBreak": "The audit is the C13/ADR-0298 tripwire for cross-project 'reminiscencia' leaks and the founder has hit that class before. Option (b) narrows its coverage: a cold open after a hard reload could in principle still carry leftovers from a service-worker-restored scene. Do not delete it; only re-scope or chunk it.",
      "filesToChange": [
        "apps/editor/src/engine/initTools.ts",
        "packages/core-app-model/src/persistence/ProjectIsolationAudit.ts"
      ]
    },
    {
      "title": "lineworkProbe does a second full-scene traverse on every 3-D activation, installed unconditionally in production",
      "mechanism": "`installLineworkProbe()` is called unconditionally from `initUI` (:709). It subscribes to `view-activated` and, on `{ mode: '3D' }`, runs `runLineworkProbe` via `setTimeout(..., 0)`, which censuses the scene. The module's own header states the cost: 'one scene traverse per 3D activation'. Entering the canvas at open fires exactly that event, so an open pays this traverse in addition to the ProjectIsolationAudit traverse. It is a diagnostic census whose only output is a console line.",
      "evidence": [
        "apps/editor/src/engine/initUI.ts:709 — `installLineworkProbe();` (no flag, no environment guard)",
        "apps/editor/src/engine/lineworkProbe.ts:65 — `// Cost: one scene traverse per 3D activation, i.e. the same order as the three`",
        "apps/editor/src/engine/lineworkProbe.ts:413-416 — `w.runtime?.events?.on?.('view-activated', (payload: unknown) => { ... setTimeout(() => { try { runLineworkProbe('view-activated'); } catch { } }, 0); });`",
        "apps/editor/src/engine/lineworkProbe.ts:260 — `export function censusLinework(root: ObjLike | null | undefined): LineworkCensus {`"
      ],
      "estimatedCostMs": 20,
      "costBasis": "estimated",
      "fix": "Gate the install on the same diagnostics switch that `pryzmPerfConsole` uses (that instrument already made the right call — its header says 'ONE traverse, at report time only, on an explicit console command ... an instrument that walks the scene on a timer'). Keep `installLineworkProbe` exported so a console command can arm it on demand.",
      "risk": "low",
      "confidence": "medium",
      "whatItWouldBreak": "The probe's baseline/last census is the only instrument that catches the linework-visible-in-3D regression family; arming it on demand means the FIRST 3-D entry after arming has no baseline to compare against. State that in the console line rather than leaving it always-on.",
      "filesToChange": [
        "apps/editor/src/engine/initUI.ts",
        "apps/editor/src/engine/lineworkProbe.ts"
      ]
    },
    {
      "title": "DEAD: a second complete ProjectSerializer + ProjectLoader + MigrationEngine (~2,970 lines) that no production file imports",
      "mechanism": "`packages/persistence-client/src/loader/ProjectSerializer.ts` (1,034 lines), `.../ProjectLoader.ts` (1,647 lines) and `.../MigrationEngine.ts` (289 lines) are NOT re-exported by `packages/persistence-client/src/loader/index.ts` nor by the package barrel `src/index.ts` (which exports TierStreamedLoader, Tier1/2/3, HistoryStreamer, rebuildSemanticGraph, SnapshotIntegrity, JournalSidecar — and none of these three). The only importers anywhere in the tree are `tools/rac-conformance/**` cert tests via deep relative paths, plus `audit/` JSON and `tools/tracker/row-paths.json`. The browser open path uses `apps/editor/src/engine/persistence/ProjectLoader.ts` (`initPersistence.ts:43,398`). `MigrationEngine.ts` is byte-identical to the editor's copy modulo whitespace (verified by diff). Runtime cost on the open path is ZERO — this is a maintenance hazard (`[[same-rule-two-implementations]]`: both files print the identical `[ProjectSerializer] Snapshot created:` line, so a console paste cannot tell you which one ran), not a latency cost.",
      "evidence": [
        "packages/persistence-client/src/loader/index.ts — exports TierStreamedLoader, Tier1Manifest, Tier2Visible, Tier3Background, HistoryStreamer, rebuildSemanticGraphFromSnapshot, SnapshotIntegrity, JournalSidecar. `ProjectSerializer` and `ProjectLoader` appear nowhere in it.",
        "apps/editor/src/engine/initPersistence.ts:43 — `import { ProjectLoader } from './persistence/ProjectLoader';` (the editor copy, the one that runs)",
        "packages/persistence-client/src/loader/ProjectSerializer.ts:1001 and apps/editor/src/engine/persistence/ProjectSerializer.ts:2082 — BOTH emit `` `[ProjectSerializer] Snapshot created: ${elementCount} elements, ` ``",
        "`diff <(sed 's/[[:space:]]//g' packages/persistence-client/src/loader/MigrationEngine.ts) <(sed 's/[[:space:]]//g' apps/editor/src/engine/persistence/MigrationEngine.ts)` → empty output (identical)",
        "apps/editor/src/engine/persistence/ProjectLoader.ts:3245-3249 — `// GR-06 / GR-08 — the SemanticGraph pre-graph rebuild used to live here as a private method AND as a byte-identical copy in persistence-client's ProjectLoader.` (the same de-duplication was already done for ONE function; the rest of the file was left)"
      ],
      "estimatedCostMs": 0,
      "costBasis": "read-from-code",
      "fix": "Point the four `tools/rac-conformance` cert tests at `apps/editor/src/engine/persistence/*` (they already load by relative path, so it is a path change) and delete the three files. If a cert test cannot reach L7 by design, extract the shared half rather than keeping a copy — `rebuildSemanticGraph.ts` is the precedent already in this tree. At minimum, make the two `Snapshot created` log lines distinguishable today so a founder paste names which serializer ran.",
      "risk": "low",
      "confidence": "high",
      "whatItWouldBreak": "`tools/rac-conformance/certification/gates/check-provenance-slice-persisted.ts:81,85` and `check-ubg-snapshot-derived.ts:71` name these paths as literal strings and will fail if the files vanish without those gates being updated in the same commit.",
      "filesToChange": [
        "packages/persistence-client/src/loader/ProjectSerializer.ts",
        "packages/persistence-client/src/loader/ProjectLoader.ts",
        "packages/persistence-client/src/loader/MigrationEngine.ts",
        "tools/rac-conformance/certification/gates/check-provenance-slice-persisted.ts",
        "tools/rac-conformance/certification/gates/check-ubg-snapshot-derived.ts"
      ]
    },
    {
      "title": "DEAD BY DEFAULT: a 945-line legacy per-element load branch preserved inside the open-path loader",
      "mechanism": "`ProjectLoader.load()` selects between two complete element-hydration implementations on a runtime flag. The default is the ImportProjectCommand path; the `else` branch (lines 959–1904, ~945 lines) is the pre-2026 per-command path, reachable only by setting `localStorage.PRYZM_USE_IMPORT_COMMAND='false'` or `VITE_PRYZM_USE_IMPORT_COMMAND=false`. It never executes in production, so its open-time cost is ZERO; the cost is bundle bytes and parse time in the 8.5 MB main chunk, and the maintenance tax of keeping two hydration orders in step (the file already carries a note that 'BatchCreateRoomsCommand — Step 13 in the legacy path' has to be mirrored).",
      "evidence": [
        "apps/editor/src/engine/persistence/ProjectLoader.ts:762-769 — `// Default-on: dispatch a single ImportProjectCommand instead of N per-element CreateXCommands. The legacy path is kept verbatim in the \\`else\\` branch as a rollback for the rare regression` / `const useImportCmd = this._useImportCommandPath();`",
        "apps/editor/src/engine/persistence/ProjectLoader.ts:959-960 — `} else {` / `// ── Legacy per-command path (preserved verbatim for rollback) ─`",
        "apps/editor/src/engine/persistence/ProjectLoader.ts:1904 — `} // end legacy per-command path (PROJECT-LOAD-PERFORMANCE-13 §2)`",
        "apps/editor/src/engine/persistence/ProjectLoader.ts:3274 — `private _useImportCommandPath(): boolean {` (localStorage / import.meta.env override resolver)",
        "apps/editor/src/engine/startupBudget.ts:340-345 — `the cost BEFORE t0 (main-chunk download + parse/eval — 8.5 MB \\`main\\` at last build) was invisible in every paste`"
      ],
      "estimatedCostMs": 0,
      "costBasis": "read-from-code",
      "fix": "The rollback flag has been default-on since PROJECT-LOAD-PERFORMANCE-13 §2. Delete the else branch and `_useImportCommandPath()`, or — if the rollback is still wanted — move it behind a dynamic `import()` so it is not in the main chunk. Do NOT report this as an open-time latency win; it is bundle weight only, and claiming otherwise is exactly the estimate-labelled-as-measurement failure this repo keeps paying for.",
      "risk": "medium",
      "confidence": "high",
      "whatItWouldBreak": "The branch is the documented escape hatch for an ImportProjectCommand regression on a real user's project. Deleting it removes the ability to recover a broken open without a deploy. The dynamic-import variant keeps that ability at no main-chunk cost and is the safer of the two.",
      "filesToChange": [
        "apps/editor/src/engine/persistence/ProjectLoader.ts"
      ]
    },
    {
      "title": "Gate-debt ledger: the two ledgered gates both name legacy channels that run on the open path, and one is now WORSE THAN DECLARED",
      "mechanism": "`tools/ga-gate/gate-debt.json` declares exactly two failing gates: `check-no-commandmanager.ts` and `check-custom-event-apps.ts`. Both name the legacy half of a two-implementation pair that the open path uses. I re-ran both rather than transcribing. (1) `check-custom-event-apps.ts` measured TODAY: `FAIL (ratchet): 30 > baseline 4` and `❌ WORSE THAN DECLARED (exit 3): 30 > ledgered level 20` — exit 3 is never absorbable by the ledger (§RATCHET-EXCEEDED-IS-NEVER-DEBT). Four of the 30 dispatches are literally the legacy channel fired alongside the new one in one statement (`window.runtime?.events?.emit('pryzm-go-hub', {}); window.dispatchEvent(new Event('pryzm-go-hub'));`), and four more are in `ProjectLoader` itself (`pryzm-load-progress` ×2, `pryzm-load-suppress-begin`/`-end`) — the open path. (2) `scripts/check/ci-check-no-commandmanager.mjs` measured TODAY: `PASS -- count 134 <= threshold 134`, `0 headroom remaining` — and `ProjectLoader.ts:665` dispatches every load command through that legacy executor (`const exec = (cmd: any) => this.commandManager.execute(cmd, LOAD_META);`). Neither gate's count is itself a latency cost; the point is that the ledger's own entries are the open path's legacy plumbing, and one of them is currently breached.",
      "evidence": [
        "tools/ga-gate/gate-debt.json — `\"failing\": [\"check-no-commandmanager.ts\", \"check-custom-event-apps.ts\"]`",
        "`npx tsx tools/ga-gate/check-custom-event-apps.ts` (run 2026-09-09) — `[custom-event-apps] FAIL (ratchet): 30 > baseline 4.` and `[custom-event-apps] ❌ WORSE THAN DECLARED (exit 3): 30 > ledgered level 20.`",
        "gate output — `apps/editor/src/ui/platform/EngineLoadingOverlay.ts:183  window.runtime?.events?.emit('pryzm-go-hub', {}); window.dispatchEvent(new Event('pryzm-go-hub'));` (the dual-dispatch pattern, 4 sites)",
        "gate output — `apps/editor/src/engine/persistence/ProjectLoader.ts:527 / :622 / :651 / :656` (open-path dispatches)",
        "`node scripts/check/ci-check-no-commandmanager.mjs` (run 2026-09-09) — `Arms: literal 39 · alias 81 · indirect 14` / `Non-comment call count: 134` / `Threshold: 134` / `PASS -- count 134 <= threshold 134` / `0 headroom remaining.`",
        "apps/editor/src/engine/persistence/ProjectLoader.ts:665 — `const exec = (cmd: any) => this.commandManager.execute(cmd, LOAD_META);`",
        "tools/ga-gate/gate-debt.json `$comment` rule 3 — `NOTHING may be ADDED here without an explicit founder/architect decision.`"
      ],
      "estimatedCostMs": -1,
      "costBasis": "measured-from-log",
      "fix": "Two separate actions, and only the first is urgent. (1) `check-custom-event-apps` is at exit 3 — remove the 10 new dispatches (start with the 4 dual-dispatch one-liners, which are pure duplication: the `runtime.events.emit` on the same line already does the job), and do NOT raise LEDGERED_LEVEL. (2) `commandmanager` is at 134/134 with zero headroom, so the next legacy `execute()` added anywhere fails CI; the loader's `exec` at :665 is 21 of those call sites and is the single largest cluster on the open path — migrating it to the bus would buy the most headroom.",
      "risk": "low",
      "confidence": "high",
      "whatItWouldBreak": "Nothing, for action (1) — the removed `window.dispatchEvent` half is redundant with the `runtime.events.emit` on the same line ONLY if every listener has migrated; grep each event name for `addEventListener` before deleting its dispatch. Action (2) is not a perf change and must not be sold as one: `LOAD_META = { source: 'PROJECT_LOAD' }` is what makes the loader skip per-command snapshots and undo pushes, and any bus migration must preserve that fast path or the open gets slower, not faster.",
      "filesToChange": [
        "apps/editor/src/ui/platform/EngineLoadingOverlay.ts",
        "apps/editor/src/ui/platform/PlatformProjectBrowser.ts",
        "apps/editor/src/ui/ViewBrowser/ExistingProjectsPanel.ts",
        "apps/editor/src/ui/ViewBrowser/ProjectBrowserPanel.ts",
        "tools/ga-gate/gate-debt.json"
      ]
    }
  ],
  "whatIcouldNotEstablish": "1. ANY MILLISECOND ATTRIBUTION ON THE FOUNDER'S MACHINE. His paste contains no `[§STARTUP-BUDGET]` marks and no `[ProjectLoader] PHASE_TIMINGS total=… setup=… hydrate=… event_flush=… wall_rebuild_flush=… redetect_sweep=…` line, both of which this repo already emits on every open. Every number I gave except the two gate readings is `estimated` or `read-from-code`. The single highest-value next step is not a fix — it is asking for one more console paste that includes those two lines, which would rank these findings against each other instead of leaving them as a list.\n\n2. WHETHER THE EDGEPROJECTOR PASS AT OPEN IS FOR A VISIBLE PANE. The log shows one projection (69 groups, 410 edge geometries, 63 ISO layers, work=109ms) plus `HiddenLineRemoval v3` and `VGSceneApplicator.applyToProjectionLayers() styledLayers=22`. I traced the `project()` call sites (PlanViewManager:880/1044/1137, SectionViewService:194, ViewController:693/2292) and none of them is unconditionally invoked at open — they run on view activation. Whether the founder's open lands in a split view with a live plan pane (making this legitimate work) or projects a pane he cannot see, I could not determine from the code or the paste. Do not report it as eager work without that.\n\n3. ⛔ THE 0% CACHE HIT RATE IS NOT A DEFECT — do not chase it. `cacheHits=0 cacheMisses=63 hitRate=0% cacheEntries=63/5000` is a COLD in-memory per-element cache keyed on geometry version (`_putCwCache`, EdgeProjectorService.ts:3515). 0% on the first projection of a session is the arithmetically only possible reading. The `cwGroups=63 cacheableGroups=63` pair in that same line is one number printed twice under a legacy and a current field name (:3688-3695), which is the only legacy thing about it.\n\n4. WHETHER THE POST-LOAD SWEEP IS WHAT MARKS THE PROJECT DIRTY. I established that the autosave fired (his log) and that `executeSave`'s hash guard cannot skip a session's first save (`lastHash === ''`). I did NOT establish which mutation armed it — `resetDirtyAfterLoad()` runs in `loadVersion`'s `.then` and the chunked redetect drain closes the suppression window later, so the sweep is the likely source, but his paste has no `§LOAD-REDETECT-FREEZE` or `§LOAD-REDETECT-CHUNKED` line to confirm it ran at all. Finding 2's fix half (2) depends on this; fix half (1) does not.\n\n5. THE SIZE OF THE DISCARDED `streamLoad` PAYLOAD. No mark brackets that fetch, and I did not measure a response. My 800 ms is scaled from the code's own `793 elements → ~16.6 MB` serialize figure and the founder's 503 elements; the true cost is dominated by his network and by whether the server snapshot carries the 2,366 temporal-journal mutations whole (the journal sidecar that shrinks them is a CLIENT-side IndexedDB optimisation and does not apply to the server row). Add the mark before quoting a number.\n\n6. WHETHER THE WEBGPU→WEBGL BACKEND SWAP FIRED BEFORE OR AFTER THE HYDRATE. `WebGPU device lost: reason=\"destroyed\"` during open, and `3762 meshes (ARM TRIPPED)` at only `162 elements`, mean the perf report was taken mid-build — but that report is manual (`pryzmPerfConsole.ts:421-422`: \"ONE traverse, at report time only, on an explicit console command\"), so its timestamp is the founder's keystroke, not a pipeline event. Ordering is not recoverable from this paste, and this belongs to the rendering dimension, not mine."
}