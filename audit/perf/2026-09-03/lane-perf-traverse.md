# LANE PERF-TRAVERSE — the "~38.7s whole-scene PBR re-traverse" (2026-09-03)

Marker: **§PERF-TRAVERSE-RECOMPILE-SCOPE**. Predecessor row: **L-11562** (the traverse-cap
question this lane's founder paste was solicited to answer). NO commit — orchestrator commits.

## 0. Verdict in one paragraph

The founder's `fullScenePbrTraverse=ON ⚠ (the ~38.7s ... ARMED)` line on a 71-mesh boot was a
**stale claim in a log, not a live 38.7s cost** — the synchronous whole-scene pass that figure
measures was dismantled in 2026-05 (§A.21.D40 PBR-SCOPE: new-meshes-only; §FIX-POST-BATCH-PBR-CHUNK:
120 meshes/frame; PERF-DEFER-PBR-IDLE: requestIdleCallback). What remained genuinely armed was the
pass's **cost mechanism**: `PBRSceneUpgrader` set `material.needsUpdate = true` **unconditionally**
on every MeshStandardMaterial it touched, and `needsUpdate` forces a full shader-program (WebGL) /
PSO (WebGPU) recompile. The 38.7s was never the traverse — it was 4073 × recompile. That mechanism
is now removed: `needsUpdate` fires **only when a program-cache-key property actually changed**
(env-map binding identity, or a `toneMapped` flip). On the founder's exact configuration
(Phase 5, real-WebGPU, `scene.environment = null`, three's `toneMapped` default `true`) the armed
cinematic pass is now **recompile-free uniform writes, ~ms**, and the misleading log line now
states facts.

## 1. WHAT the traverse does, WHEN it fires, WHY it cost ~38.7s

**Owner:** `packages/core-app-model/src/rendering/PBRSceneUpgrader.ts` (core-app-model L2
rendering; THREE via the sanctioned `@pryzm/renderer-three/three` re-export — P2 intact).
Decision service: `packages/core-app-model/src/rendering/SceneQualityTierManager.ts`
(`fullScenePbrTraverse: true` **only** at `cinematic`, ≤1,500 meshes — the 71-mesh scene lands
there, which is why the founder's line read ON). Wiring:
`packages/core-app-model/src/rendering/RenderingPipelineCoordinator.ts` +
`apps/editor/src/engine/initScene.ts`.

**What it does:** cosmetic PBR tuning — per material category (glass/metal/rough/polished/
mid-gloss) it raises `envMapIntensity`, floors glass roughness, forces `toneMapped = true`, and
binds a per-material HDRI `envMap` when one is passed. It never touches semantic state.

**When it fires (all paths mapped):**
1. **Boot auto-activate** — `initScene.ts:3301` calls
   `activateRealtimeEnhancements('standard')` → sync whole-scene `apply()`. Runs on the
   near-empty boot scene (~ms) and arms `applied=true` so the incremental path works.
2. **Post-batch** (`initScene.ts:3107`, `setPostBatchCallback`) — tier-gated
   (`shouldRunFullPbrUpgrade()`), **new meshes only** (`collectNewPbrMeshes` WeakSet,
   initScene.ts:2880), **chunked 120/frame** on the frame-scheduler post-render slot,
   **idle-deferred** (`requestIdleCallback` timeout 5000).
3. **Per-add events** (`runTierPbrPass`, initScene.ts:2946) — incremental
   `upgradeNewMeshes` on new meshes; skipped during batches/loads (consolidated pass at end).
4. **User paths** — `activateRealtimeEnhancements(level)` (VisualizationEnginePanel,
   PerformanceModePanel) and `setHdriPreset` → sync whole-scene `apply()` (env rebind is
   load-bearing here).
5. **Project switch** — `dispose()`/`_deactivateAll()` → `restore()` whole-scene walk.

**Why 38.7s:** the tier-manager's own docblock and L-11562 record it: a 2026-05 measurement of
the then-synchronous pass on a real 785-element/4073-mesh building — "4073 meshes trickle
through needsUpdate → WebGPU PSO recompiles". Of the five properties the pass writes, only TWO
are program-cache keys in three r0.183 (`envMap` binding; `toneMapped`); `envMapIntensity`,
`roughness`, `metalness` are per-frame uniforms. The unconditional `needsUpdate` bought
recompiles for uniform-only changes — worst on Phase 5 where there is **no env map at all**, so
the pass could not change a single visible pixel yet recompiled every material.

## 2. MEASUREMENT — where 38.7s comes from; what this scene actually pays

- The 38.7s figure is **stamped, not live**: `PBRSceneUpgrader.ts` header ("RECORDED 38.7 s …
  RenderingPipelineCoordinator.ts:852, ADR-0076"), the tier-manager `fullScenePbrTraverse`
  docblock ("Measured cost (founder, real 785-element / 4073-mesh building)"), and ISSUE-LOG
  **L-11562** ("the '38.7 s' justification is a 2026-05 measurement of a synchronous pass that
  no longer exists"). No number was invented in this lane.
- Live instrumentation already exists and was kept: `PERF_KEYS.TRAVERSE_PBR_UPGRADER` /
  `PERF_KEYS.PHASE_PBR_UPGRADE` (`packages/frame-scheduler/src/PerfCounters.ts:285,295`,
  surfaced by `pryzmPerfConsole.ts`), plus the §TRACE `totalPbrMs` chunk lines in initScene.
- On the founder's 71-mesh session, the armed work was: one `collectNewPbrMeshes` walk +
  ≤1 chunk of `upgradeNewMeshes` per batch — ms-scale — **plus** up to ~71 materials'
  needsUpdate→PSO recompiles under the old code (the part now eliminated). The 76,753ms
  `hub:mount-start` in the same log is **upstream of the editor scene entirely**
  (§STARTUP-BUDGET, project-hub mount) and is NOT this traverse — separate lane (see OWED).

## 3. THE FIX — recompile-relevance scoping (candidate (c), plus honest logging)

`packages/core-app-model/src/rendering/PBRSceneUpgrader.ts`:
- New private `_tuneMaterial(mat, envMap, stats)` — single implementation of the category
  tuning used by `apply()` AND `upgradeNewMeshes()` (they had drifted copies). It sets
  `needsUpdate = true` **only** when (a) an env map was passed and `mat.envMap !== envMap`
  (identity change), or (b) `toneMapped` actually flips false→true. All uniform-level writes
  (envMapIntensity / roughness floor) happen unconditionally, recompile-free.
- `restore()` mirrored: scalar restores are uniform-level; `needsUpdate` only on a real
  `envMap` unbind or `toneMapped` flip-back.
- `PBRUpgradeStats.recompiledMaterials` added and printed:
  `[PBRSceneUpgrader] Applied — meshes: N materials: M recompiles: K (…)` — "the pass ran but
  recompiled nothing" is now a fact in the log (ADR-0292 doctrine).

`packages/core-app-model/src/rendering/RenderingPipelineCoordinator.ts`:
- The tier line's ON parenthetical no longer claims a ~38.7s traverse is armed; it now reads
  `fullScenePbrTraverse=ON (scoped+chunked+idle; recompiles only real material changes — see
  [PBRSceneUpgrader] recompiles:N; the 38.7s sync pass was dismantled 2026-05)`. The
  grep-stable `fullScenePbrTraverse=ON/off` token and every other field (chosenBy/backend/…)
  are unchanged — L-11562's diagnostic purpose is preserved.
- `shouldRunFullPbrUpgrade()` docblock corrected ("was 38.7s", dated): the tier gate stands as
  **policy** (cosmetic tuning not worth even a cheap pass on big scenes), no longer as the
  firewall in front of a 38.7s stall.

`packages/core-app-model/src/rendering/SceneQualityTierManager.ts`:
- `fullScenePbrTraverse` docblock: dated correction note; **no settings/thresholds changed**
  (the per-tier values and the backend-gate independence are pinned by tests and untouched).

**What was deliberately NOT done:**
- `fullScenePbrTraverse` was NOT capped on WebGL2 — L-11562 backed that out as correlational
  and this lane's evidence (a real-WebGPU paste) does not answer the WebGL2 question either.
- The boot `apply()` / `setHdriPreset` whole-scene walks were NOT tier-gated or removed: the
  env-map (re)bind is **load-bearing** for the HDRI/IBL path (memory: reconstruction-boundary
  env binding), and with changed-only `needsUpdate` a same-binding re-walk is now ms-scale.
  Scene-level `scene.environment` changes need no help — both renderers detect the
  materialProperties/render-object cache-key change themselves.

## 4. MEASURED / EXPECTED EFFECT

- **Founder's exact configuration** (Phase 5 real-WebGPU, `scene.environment=null`, cinematic):
  the armed pass performs **zero recompiles** — pinned by test ("Phase-5 shape → ZERO
  recompiles"). Worst-case cinematic (1,500 meshes) drops from ~1,500 needsUpdate→PSO
  recompiles to 0; what remains is the O(new-meshes) walk + uniform writes (ms).
- **Load-bearing cases still fire** (falsification, pinned by tests): HDRI env map newly
  bound → recompile; material authored `toneMapped:false` → recompile (that one only);
  `restore()` after an env-map apply → unbind + recompile. Tier-gating, chunking, and the
  38.7s-era skip at `balanced`+ all behave exactly as before.

## 5. PROOFS

- `packages/core-app-model/src/rendering/PBRSceneUpgrader.test.ts` — **NEW**, 11 tests, all
  green (both directions pinned: no-recompile on unchanged; recompile on real change).
- `npx vitest run` in `packages/core-app-model` — **153 files / 1,747 tests, all passed**
  (includes SceneQualityTierManager, heavyShadowGate, tierCasterOrdering suites).
- `apps/editor` `npx vitest run src/rendering/renderQualityPin.test.ts` — **9/9 passed**.
- Root tsc `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --skipLibCheck -p
  tsconfig.json` — **RC=2, with exactly 4 errors, ALL pre-existing in ANOTHER lane's in-flight
  file** (`packages/site-parcel-data/src/jurisdiction/nationalJurisdictionResolver.ts:125-128`,
  TS6133 unused `isInSlovenia`/`isInCroatia`/`isInGreece`/`isInBulgaria` imports —
  site-parcel-data was already modified in the git snapshot before this lane started).
  **Zero errors reference any file this lane touched** (grepped the full output).
- No test anywhere asserted on the old log string (grepped).

## 6. OWED FOLLOW-UPS

1. **The founder's 76.7s boot is NOT this traverse.** `hub:mount-start +76753ms` is upstream of
   the editor scene (§STARTUP-BUDGET, L-10722 legs). A separate lane should walk the marks
   before `hub:mount-start` in that same paste.
2. **L-11562 stays open on its own terms** — the WebGL2 traverse-cap question is still
   unanswered (this paste was real-WebGPU). The new `recompiles:N` log makes the next WebGL2
   paste decisive: if a WebGL2 cinematic boot is slow with `recompiles: 0`, the traverse is
   exonerated entirely.
3. `RenderRailPanel.ts:231` note text still warns a cinematic pin costs "~39 s … the last time
   it was measured" — historically phrased so not false, but worth softening once a
   post-fix measurement exists.
4. `PBRSceneUpgrader.dispose()` does not reset `_stats` (pre-existing; cosmetic).
5. ISSUE-LOG: orchestrator should append the §PERF-TRAVERSE-RECOMPILE-SCOPE close (this file is
   the evidence) and cross-link L-11562.
