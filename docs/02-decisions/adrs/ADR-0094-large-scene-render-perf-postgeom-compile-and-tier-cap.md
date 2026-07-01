# ADR-0094 — Large-scene render perf: no synchronous post-geometry compile + hard tier cap + auto-skip PBR

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-01 |
| Owner | Render/scheduling engine (`packages/core-app-model` · `apps/editor/src/engine/initScene`) |
| Tags | §PERF-POSTGEOM-COMPILE-NO-SYNC-BLOCK · §PERF-LARGE-SCENE-TIER-CAP · §PERF-LARGE-BATCH-SKIP-PBR |
| Builds on | §FIX-POST-GEOMETRY-COMPILE-V2 (BatchCoordinator), ADR-0076 / §PERF-WEBGPU-FRAGMENT (SceneQualityTier), §FIX-SKIP-PBR-UPGRADE |
| Contracts | C04 (rendering/scheduling), P2 (no THREE outside renderer-three), P3 (single rAF), P8 (≥1 span / exported fn) |

## Context

Live logs from a large generated **office tower** build surfaced three engine-side render
performance defects. None are in the generators — they are in the shared render/scheduling engine.

**#1 — a single synchronous `rpm.render()` froze the main thread ~50s.** The BatchCoordinator's
post-geometry compile block (`§FIX-POST-GEOMETRY-COMPILE-V2`) decides "small batch vs large batch"
and, for small batches, runs ONE synchronous `rpm.render()` to warm PSOs. The log showed:

```
[BatchCoordinator] §FIX-POST-GEOMETRY-COMPILE-V2 1 rpm.render() pass (small batch ≤32 elements)
[BatchCoordinator] §FIX-POST-GEOMETRY-COMPILE-V2 WARN: single pass took 49942.9ms > 100ms
```

**Root cause.** The small-vs-large test used the batch's **EXPECTED** element count
(`totalElementCount`). Office/resi/apartment geometry arrives via the **bus, uncounted**, so a
1200+-mesh tower batch reports `totalElementCount ≈ 0/≤32` and was misclassified as "small". The
single synchronous render then ran over the **actual** 1200+-mesh scene and blocked the main thread
~50s — freezing the viewport on **both** WebGPU and WebGL. The existing 100ms guard only *warns
after the fact*; the render has already blocked.

**#2 — `[SceneQualityTier] 1211 meshes → tier=cinematic (SSGI/TRAA/shadow=high)` on a tower.** The
nominal `cinematic` ceiling was 1500 meshes, so a ~1211-mesh tower stayed cinematic and ran the full
heavy post-FX pipeline (SSGI + TRAA + high shadows) → terrible interaction. `balanced` (the next
tier) *also* keeps SSGI/TRAA/high-shadow on, so simply lowering the cinematic ceiling into
`balanced` would not have helped.

**#3 — the cosmetic whole-scene PBR upgrade (~6.6s in the log) ran unless each generator remembered
to set `skipPbrUpgrade`.** That is fragile: every new typology generator must opt out by hand.

## Decision

All three fixes live in the **engine only** (`packages/core-app-model` +
`apps/editor/src/engine/initScene.ts`, the THREE owner). No generator, Cesium/Forma, ProjectLoader,
selection or gpu-pick code is touched. Normal/small scenes are provably unchanged.

### §PERF-POSTGEOM-COMPILE-NO-SYNC-BLOCK — base the compile decision on the ACTUAL scene

- BatchCoordinator gains an app-injected `setSceneMeshCountProvider(() => number)` returning the
  **live** scene mesh count (Mesh + InstancedMesh). `initScene` (the THREE owner) injects it, so
  core-app-model still imports no THREE (**P2**).
- The small-vs-large decision is now the pure static
  `BatchCoordinator.shouldSkipPostGeometrySyncCompile({ skipPbrUpgrade, expectedElements,
  sceneMeshCount })`. It SKIPS the synchronous render when `skipPbrUpgrade`, OR
  `expectedElements > 32`, OR **`sceneMeshCount > POSTGEOM_SYNC_COMPILE_MAX_SCENE_MESHES` (= 200)**.
- When skipped, no synchronous `rpm.render()` runs at all — the normal frame loop compiles PSOs
  lazily, frame-by-frame, so a single synchronous pass can never block ~50s again. `sceneMeshCount
  = -1` (provider unwired) falls back to the old expected-count behaviour (no regression).

### §PERF-LARGE-SCENE-TIER-CAP — cap very large scenes at `performance`

- `SceneQualityTierManager` gains a **hard, one-directional** mesh-count cap:
  `LARGE_SCENE_PERFORMANCE_CAP_MESH_COUNT = 1_200` (cites the 1211-mesh tower evidence). At/above
  1200 meshes the tier is capped at **`performance`** (SSGI OFF, TRAA OFF, shadow = standard, no
  decorative-furniture shadows), regardless of the nominal cinematic/balanced band.
- The cap is **decisive**, not subject to the ±10% cinematic step-down band — otherwise a scene that
  *grew* through cinematic up to ~1211 meshes would be held at cinematic (bound 1500 × 1.1 = 1650 >
  1211) and never take the cap. The cap has its **own** release hysteresis (releases below 1200 ×
  0.9 ≈ 1080) so a scene wobbling around 1200 meshes does not thrash cinematic↔performance.
- Genuinely small / normal scenes (**< 1200 meshes**: a showcase room, a house, one apartment) keep
  cinematic/balanced **exactly as before — zero change**. Only heavy scenes step down.
- The tier is already resolved once per batch settle (`initScene` post-batch callback) and only
  re-applied on a real tier change (the `changed` flag), and the per-event tier apply is skipped
  during a batch (`isBatching` guard) — so the §I2 dispose/rebuild pipeline churn does not repeat
  during one build.

### §PERF-LARGE-BATCH-SKIP-PBR — auto-default `skipPbrUpgrade` for large batches

- In `_setupBatch`, when a batch is not already `skipPbrUpgrade` and the **actual** scene exceeds
  `LARGE_BATCH_SKIP_PBR_SCENE_MESHES` (= 1200, aligned with the tier cap) **or** the expected
  element count exceeds `LARGE_BATCH_SKIP_PBR_ELEMENTS` (= 400), `skipPbrUpgrade` is auto-enabled.
  Generators no longer need to remember. (The tier cap already makes
  `shouldRunFullPbrUpgrade()` return false for ≥1200-mesh scenes; this belt-and-braces also
  short-circuits the CW/slab prewarm branch and the post-geometry compile.)

## Consequences

- The ~50s viewport freeze on large office/resi builds is eliminated: large scenes never run a
  single synchronous compile pass; PSOs warm lazily on the frame loop.
- Large towers interact smoothly (performance tier: no SSGI/TRAA, standard shadows) instead of
  running the cinematic pipeline they cannot afford.
- The cosmetic PBR upgrade is skipped automatically on large scenes without per-generator opt-in.
- **Small/normal scenes are unchanged** — the cap and both thresholds only ever *lower* quality /
  skip work for heavy scenes; every existing small-scene tier/compile path is preserved (locked by
  unit tests).

## Testing

- `SceneQualityTierManager.test.ts` — the cap is decisive, has release hysteresis, does not thrash
  around 1200 meshes, and leaves < 1200-mesh scenes cinematic.
- `BatchCoordinator.perf.test.ts` — the pure `shouldSkipPostGeometrySyncCompile` decision: small
  batches run the pass; a large ACTUAL scene with ~0 expected elements SKIPS it (the bug); the cap
  boundary and the unknown (-1) fallback behave.
