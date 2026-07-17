# SPIKE — Ground-shadow map accuracy vs. performance (`§SPIKE-SHADOW-MAP-ACCURACY`)

- **Status:** DESIGN / RECOMMENDATION — spike-first (a trivially-safe change was ALSO implemented; see §7)
- **Logged:** founder 2026-07-08 · Issue Log **L-165** (see `docs/04-reference/V1-LAUNCH-READINESS-AUDIT.md`)
- **Governs / touches:** C04 (rendering & scheduling), C10 (performance budgets),
  ADR-0076 (SceneQualityTier), ADR-0094 (large-scene tier cap), ADR-0106 (real-environment sun /
  single caster), ADR-0111 + §SHADOW-DEVICE-LOSS-FIX (mid-submit shadow realloc = WebGPU device loss)
- **Memory anchors:** `[[render-tiers-massing-and-presentation]]`, `[[webgpu-heavy-scene-crash-and-instancing]]`
- **Format siblings:** `spike-autodimension-engine.md`, `spike-genrecon-generative-reconstruction.md`

> **One-line thesis.** The founder's stair-stepped ground shadow is not a filtering bug and not a
> device-loss risk — it is a **texel-density** symptom of one specific tier decision: on any scene
> heavy enough to reach the `performance` tier (≥ 1 200 meshes, which is *every real generated
> building*), `ShadowQualityUpgrader`'s `standard` config sets the sole key-light shadow map to
> **512 px**, and `RealSunService` fits that map's ortho frustum to the *whole building* (up to
> ±80 m). 512 px spread over ~100–160 m ≈ **0.2–0.3 m per texel** — coarse enough to read as
> stair-stepping on a ground contact shadow. The cheapest, device-loss-proof, tier-scaled fix is a
> **one-value bump of the `standard` shadow config from 512→1024 px** (with a small PCF-radius
> bump for edge smoothing). It changes only an already-guarded realloc's *target size*, adds
> ~3 MB of GPU for a single map, and by construction never touches the survival tier (shadows OFF)
> or the >8 000-mesh device-loss ceiling. CSM and PCSS are analysed and **rejected** for V1.

---

## 0. The exact symptom and its provenance

Founder log line:

```
[ShadowQualityUpgrader] Applied "standard" — map: 512px radius:1
```

That log is emitted by `ShadowQualityUpgrader.apply()`
(`packages/core-app-model/src/rendering/ShadowQualityUpgrader.ts:195-199`). `"standard"` is the
quality level the `performance` render tier maps to
(`SceneQualityTierManager.ts` → `TIER_SETTINGS.performance.shadowLevel = 'standard'`), and
`standard` in `QUALITY_CONFIGS` is `{ mapWidth: 512, mapHeight: 512, radius: 1, … }`
(`ShadowQualityUpgrader.ts:49-57`). So the log tells us **the founder's scene is on the
`performance` tier** — which, per ADR-0094 (`LARGE_SCENE_PERFORMANCE_CAP_MESH_COUNT = 1_200`,
`SceneQualityTierManager.ts:118`), is *where every generated building of ≥ 1 200 meshes lands.*

### Who actually renders that shadow

There is exactly **one** real shadow caster in the live scene (this is a deliberate,
load-bearing invariant — ADR-0106):

- `PascalSceneLighting` creates `pascal-key-light`, a `DirectionalLight` with
  `castShadow=true`, `shadow.mapSize = 1024` by default, ortho frustum `±50`, near 1 / far 100
  (`PascalSceneLighting.ts:173-193`, `DEFAULT_CONFIG` at `:56-65`). This is the *sole default
  caster*, and every heavy-scene lever (`§PERF-HEAVY-SHADOW-OFF`, `setShadowsSuppressed`) depends
  on there being exactly one (`PascalSceneLighting.ts:84-110, 276-287`).
- `RealSunService` (ADR-0106) does **not** add a competing light when a `KeyLightHost` is bound —
  it *drives* the Pascal key light's direction/colour/intensity from the real solar position
  (`RealSunService.ts:75-77, 406-420, 438-446`), and on a large scene it **fits the key light's
  ortho shadow frustum to the whole building** via `refitShadowToScene`
  (`RealEnvironmentService.ts:120-149`, `RealSunService.ts:519-529, 598-641`). Critically, it
  changes only the shadow *camera* (bounds + light position) — **never `shadow.mapSize`** — so it
  never reallocates the ShadowDepthTexture (its own comments hammer this: `RealSunService.ts:264-265,
  299, 365`).
- `ShadowQualityUpgrader` traverses the scene, finds every `castShadow` directional light
  (**including the Pascal key light**) and overwrites its `mapSize`/`radius`/`bias` with the
  tier's config (`ShadowQualityUpgrader.ts:160-192`). It is nominally bound to the *silenced* OBC
  WebGL renderer, but because the scene (and thus the key light) is shared, the `mapSize` it writes
  is exactly the one the live PRYZM WebGPU renderer rasterises (this cross-wiring is documented at
  `RenderingPipelineCoordinator.ts:486-497` and `:656-663`).

### The texel-density arithmetic (the actual root cause)

Shadow-edge crispness = **world-metres of frustum span ÷ shadow-map pixels** = metres per texel.
Stair-stepping becomes visible on a ground contact shadow at roughly ≳ 0.10–0.15 m/texel.

| map px | frustum span | m / texel | reads as |
|-------:|-------------:|----------:|:---------|
| **512** (today, `performance`) | ±50 → 100 m | **0.195** | stair-stepped ❌ |
| 512 | ±80 fitted → 160 m | **0.313** | worse ❌ (RealSun fits to building) |
| **1024** (proposed `standard`) | 100 m | **0.098** | acceptable ✅ |
| 1024 | 160 m | 0.156 | borderline ⚠️ |
| 2048 (`high`, cinematic/balanced) | 100 m | 0.049 | crisp ✅ |
| 2048 | 160 m | 0.078 | crisp ✅ |

Two compounding facts make `performance` the *worst* tier for shadow quality:

1. `performance.shadowLevel = 'standard'` **downgrades** the key light from its Pascal default
   of 1024 → **512** — i.e. the heavy-scene tier makes shadows *coarser*, not finer.
2. On exactly those heavy scenes, `RealSunService.refitShadowToScene` **widens** the frustum to
   enclose the whole building — spreading the now-512 map over an even larger span.

`balanced`/`cinematic` scenes never show this because they use `high` = 2048. So the defect is
narrowly scoped to the `performance` band (1 200 ≤ meshes < 8 000 — above 8 000 shadows are
turned OFF entirely, see §4).

---

## 1. The hard constraint that frames every option (device loss)

Per `[[webgpu-heavy-scene-crash-and-instancing]]` / §SHADOW-DEVICE-LOSS-FIX / ADR-0111: **any
change to `shadow.mapSize` is a ShadowDepthTexture reallocation**, and performing that realloc
while the WebGPU command buffer still references the old texture triggers *"Destroyed texture
[ShadowDepthTexture] used in a submit" → device lost → "Rendering has stopped".* The codebase
already defends this with two mechanisms that any resolution proposal MUST ride, never bypass:

- **`_deferReleaseShadowMap`** (`ShadowQualityUpgrader.ts:123-128`) — nulls `shadow.map` now so
  THREE regenerates it, but defers the GPU `.dispose()` of the old texture past the current submit
  via `setTimeout(0)`. Used by `apply()`, `setLevel()`, `restore()`, `setShadowsEnabled()`.
- **`_reallocShadow` guard** (`RenderingPipelineCoordinator.ts:564-585`, wired in initScene to
  `renderPipelineManager.setShadowReallocFrozen(...)` + deferred thaw) — freezes the *live*
  renderer's shadow map while the mapSize mutation runs, thawing deferred past the in-flight
  submit, so the single regen lands on an idle frame (`RenderingPipelineCoordinator.ts:702-726`).

**Rule for this spike:** we may change *what size an existing, already-guarded realloc targets*,
but we must not (a) introduce a *new* runtime realloc path, (b) trigger a realloc mid-frame outside
the guard, or (c) raise the map on the survival tier / >8 000-mesh path where shadows are off by
design. A change to a **static config constant** consumed by the already-guarded `apply/setLevel`
satisfies this — it is device-loss-*proof by construction* because it adds no new realloc surface.

---

## 2. Option (a) — Resolution bump 512 → 1024 / 2048

### Where 512 lives and how it is tier-gated
`QUALITY_CONFIGS.standard.mapWidth/Height = 512` (`ShadowQualityUpgrader.ts:50-57`). The mapping
chain is:

```
meshCount → SceneQualityTierManager.computeTier → tier
tier → TIER_SETTINGS[tier].shadowLevel  (performance→'standard', balanced/cinematic→'high', survival→'standard' but shadows=false)
shadowLevel → RenderingPipelineCoordinator → ShadowQualityUpgrader.apply/setLevel → QUALITY_CONFIGS[level].mapWidth
```

So a change to `QUALITY_CONFIGS.standard` automatically only affects scenes whose tier resolves to
`standard` — i.e. the `performance` band — and is *inherently tier-scaled*. `high` (2048) and
`ultra` (4096) are untouched.

### Cost analysis

**GPU memory** — a single directional depth shadow map. Depth texture ≈ `w × h × 4 B`:
- 512² ≈ **1.0 MB**, 1024² ≈ **4.0 MB**, 2048² ≈ **16.0 MB**.
  Because there is exactly ONE caster (ADR-0106), the *total* shadow-map budget is that single
  figure. Against a heavy scene's multi-hundred-MB mesh+material+PBR budget (the 40-storey office),
  the 512→1024 delta of **~3 MB is negligible**; even 2048 (16 MB) is affordable in isolation.
  Memory is categorically **not** the limiting factor for a single-caster scene.

**Per-frame GPU time** — the shadow *pass* re-rasterises every shadow-caster's geometry into the
depth map. Its dominant cost is **caster vertex/primitive throughput** (12.7 k casters on the
office), which is **independent of map resolution**. Raising the map only increases depth-pass
**fill** (4× the depth fragments for one map) — cheap, coherent, early-Z, no shading. So a
512→1024 bump adds a small constant fill cost and **zero** extra caster cost. The expensive lever
(number of casters) is untouched. This is why the tier system attacks *caster count*
(`decorativeFurnitureShadows`, `setShadowsSuppressed`, shadows-OFF) and not map resolution — the
resolution was never the perf problem; it was set to 512 as a blunt default, not a measured budget.

**Quality** — 512→1024 halves the texel size (0.195→0.098 m/texel at ±50; 0.313→0.156 at ±80),
directly removing the visible stair-step. 1024→2048 would remove it entirely even at the fitted
±80 frustum, at 16 MB and 16× the fill of 512.

### Device-loss safety
Changing `QUALITY_CONFIGS.standard.mapWidth` introduces **no new realloc path**. The only place a
mapSize mutation is applied is the *already-guarded* `apply()`/`setLevel()` inside
`_reallocShadow(...)` on a **tier transition** (`RenderingPipelineCoordinator.ts:696-730`), with
`_deferReleaseShadowMap` handling the old-texture dispose post-submit. The realloc that already
happens on a `high`→`standard`/`standard`→`high` tier flip simply targets 1024 instead of 512. No
mid-submit realloc is created. ✅

**Verdict on (a): the correct lever.** A **512→1024** bump is the right accuracy/cost trade for
V1. 2048-on-performance is *possible* (memory/perf both affordable) but is a larger visual and
budget step than the founder's "fine to leave as-is if costly" framing warrants; 1024 fixes the
reported symptom at ~3 MB and is the conservative choice. `high`/`ultra` stay 2048/4096.

---

## 3. Option (b) — Cascaded Shadow Maps (CSM)

**What it buys:** CSM splits the *view* frustum into N depth slices, each with its own shadow map
sized to its slice, so near geometry gets dense texels without one enormous single map — the
textbook fix for large outdoor scenes.

**Feasibility on PRYZM's single-caster Pascal key light — REJECTED for V1:**

1. **It breaks the single-caster invariant (ADR-0106).** CSM replaces the one
   `DirectionalLight.shadow` with **N cascade maps / passes** (typically 3–4). Every heavy-scene
   lever in this codebase — `§PERF-HEAVY-SHADOW-OFF` (`keyLight.castShadow` as the *one* switch,
   `PascalSceneLighting.ts:276-287`), `ShadowQualityUpgrader.setShadowsEnabled`, the RealSun
   frustum-fit — assumes exactly one caster/one map. CSM would multiply the shadow-pass caster
   cost by N *and* invalidate the single-lever suppression that keeps the 40-storey office alive.
   That is a direct regression of `[[webgpu-heavy-scene-crash-and-instancing]]`.
2. **WebGPU/TSL maturity + device-loss surface.** `CSMShadowNode` is a *jsm/examples* addon
   (not THREE core), relatively new on the WebGPU/TSL path. Each cascade split re-computes and can
   *reallocate* its own map on camera motion — i.e. a **new, per-cascade, per-frame realloc
   surface** on the exact backend that already loses the device on a single mid-submit realloc.
   Wrapping N cascades in the `_reallocShadow` freeze/thaw guard is a substantial new integration.
3. **The problem CSM solves isn't PRYZM's problem.** CSM shines on *unbounded* terrain where no
   single frustum can cover both foreground and horizon. PRYZM's shadow subject is a **bounded
   building** whose extent `RealSunService.refitShadowToScene` *already* fits with one ortho
   frustum. A single 1024/2048 map over a fitted building bound already yields acceptable texel
   density (§0 table) — CSM's dynamic range advantage is largely wasted here.
4. **Scope.** The brief explicitly says *do not add a new shadow system*; CSM is precisely that.

**Verdict on (b): reject** for V1. Revisit only if PRYZM adds true site-scale/terrain shadowing
(a Massing-tier concern per `[[render-tiers-massing-and-presentation]]`), and only behind the
existing tier gate with the single-caster invariant explicitly retired via a superseding ADR.

---

## 4. Option (c) — PCF / PCSS soft-shadow filtering

**Current state.** `renderer.shadowMap.type = THREE.PCFSoftShadowMap` on every quality level
(`QUALITY_CONFIGS.*.shadowType`, `ShadowQualityUpgrader.ts:53,61,69`), with a per-level PCF kernel
`radius` (standard 1, high 4, ultra 8). So **PCF soft filtering is already on** — the founder's
"PCFShadowMap" log confirms it. The stair-step is *not* a missing-filter problem; a PCF kernel
blurs the penumbra but a 512-px map's edge still **steps** because each texel is 0.2 m of ground.

- **PCF radius bump (cheap, complementary).** Raising `standard.radius` from **1 → 2** widens the
  percentage-closer kernel a touch, softening the residual stair-step of the (now 1024) map at
  effectively zero cost (a couple of extra samples per shadowed fragment, no realloc, no memory).
  This is a pure filtering tweak and pairs naturally with the resolution bump. Adopted in §7.
- **PCSS (percentage-closer *soft* shadows) — reject for V1.** PCSS gives physically-plausible
  contact-hardening penumbra (sharp at contact, soft far away) but is **not** in THREE core for the
  WebGPU/TSL backend — it would be a **custom TSL shader node**: a new, unbudgeted, device-loss-
  surface-bearing subsystem. And it does **not** fix stair-stepping (a low-res map still steps
  under PCSS). Wrong tool for this symptom, wrong cost for V1.

**Verdict on (c):** keep PCFSoft; bump `standard.radius` 1→2 as a free complement to the
resolution fix. PCSS is out of scope.

---

## 5. Option (d) — Tying the change into SceneQualityTier (scale-down safety)

This is already the mechanism, and it makes the fix *self-limiting*:

| tier | meshes | shadowLevel | map (after fix) | shadows enabled? |
|:-----|:-------|:------------|:----------------|:-----------------|
| cinematic | ≤ 1 500 | `high` | 2048 (unchanged) | yes |
| balanced | ≤ 2 500 | `high` | 2048 (unchanged) | yes |
| **performance** | 1 200 – 8 000 | `standard` | **512 → 1024 (fixed here)** | yes |
| performance | 8 000 – 15 000 | `standard` | (1024) but **map OFF** | **no** — `_LARGE_SCENE_SHADOWS_OFF_MESH_COUNT = 8000` |
| survival | > 15 000 | `standard` | — **map OFF** | **no** — `TIER_SETTINGS.survival.shadows = false` |

Two independent gates guarantee the bump **never** costs anything on the heaviest scenes:

1. `TIER_SETTINGS.survival.shadows === false` (`SceneQualityTierManager.ts:219-231`) →
   `setShadowsEnabled(false)` → the shadow map is **disabled**, so even though `survival.shadowLevel`
   is nominally `'standard'`, **no depth texture is allocated at 1024** — zero survival cost.
2. `_LARGE_SCENE_SHADOWS_OFF_MESH_COUNT = 8000` (`RenderingPipelineCoordinator.ts:527,646-648`) →
   any scene ≥ 8 000 meshes has shadows forced OFF regardless of tier.

⇒ The 1024 map is only ever *allocated* for scenes in the **1 200–8 000 mesh** band on
`performance` — exactly the mid-weight generated buildings that (a) suffer the pixelation and (b)
can trivially afford a 4 MB single map. The **>8 000-mesh survival tier and the 40-storey WebGPU
budget (L-139 / L-150) are provably untouched** because their shadow map is *disabled*, not
resized. This is the crux of why the change is safe.

---

## 6. Recommendation

**Adopt a tier-aware default bump (Option a + the Option c radius tweak); reject CSM and PCSS.**

Concretely: raise `QUALITY_CONFIGS.standard` from **512→1024 px** and **radius 1→2**, leaving
`high` (2048) and `ultra` (4096) unchanged. Rationale:

- **Fixes the reported symptom** — halves texel size on exactly the `performance`-tier scenes that
  logged `512px`, removing the visible stair-step; the radius tweak smooths the residue.
- **Trivial cost** — ~3 MB extra GPU for a single map; only depth-pass *fill* rises (caster cost,
  the real budget, is unchanged); memory/perf both far inside C10 budgets.
- **Device-loss-proof by construction** — it is a static-config change consumed only by the
  *already-guarded* `apply/setLevel` on a tier transition (`_reallocShadow` freeze/thaw +
  `_deferReleaseShadowMap` post-submit dispose). No new realloc path, nothing mid-submit.
- **Provably scale-down-safe** — two gates (survival `shadows=false`; >8 000 shadows-OFF) mean the
  1024 map is only allocated in the 1 200–8 000 band; the survival tier and 40-storey WebGPU budget
  are untouched (their map is *disabled*, not resized).
- **No new subsystem** — reuses the existing `ShadowQualityUpgrader` tiers, honouring the brief's
  "do not add a new shadow system" and ADR-0106's single-caster invariant.

If, on real hardware, 1024 at the fitted ±80 building frustum still reads as slightly stepped
(0.156 m/texel, "borderline" in §0), the next conservative step is `standard` → **1536 or 2048**
(same code path, same guards, still a single map ≤ 16 MB, still device-loss-proof). Escalating the
map — not adopting CSM/PCSS — is the correct next lever.

**Explicitly rejected:** CSM (breaks the single-caster invariant + new device-loss surface, wrong
tool for a bounded building), PCSS (custom TSL node, doesn't fix stair-stepping, out of V1 scope),
any runtime mapSize realloc **not** routed through the tier-transition `_reallocShadow` guard.

---

## 7. Implemented change (trivially-safe subset)

Because the analysis proves the resolution bump is device-loss-proof, tier-scaled, and applied only
at a tier transition (never mid-submit), the **minimal** subset was implemented under
`§SPIKE-SHADOW-MAP-ACCURACY`:

- `packages/core-app-model/src/rendering/ShadowQualityUpgrader.ts` — `QUALITY_CONFIGS.standard`
  `mapWidth/mapHeight` **512 → 1024**, `radius` **1 → 2** (a one-object data change). `high`/`ultra`
  unchanged. No behavioural/API change; the value flows through the existing guarded realloc.
- `packages/core-app-model/src/rendering/ShadowQualityUpgrader.mapAccuracy.test.ts` — asserts the
  `standard` level now applies a 1024² map + radius 2 to a `castShadow` directional light, that
  `high`/`ultra` remain 2048/4096, and that the survival gate (`setShadowsEnabled(false)`) still
  disables the map so the bump costs nothing on the heaviest scenes.

**Not implemented (correctly out of scope):** CSM, PCSS, any new realloc path, any change to
`SceneQualityTierManager` gating (the existing performance→`standard` mapping already targets the
right band), any change to the survival / >8 000 shadows-OFF ceilings.
