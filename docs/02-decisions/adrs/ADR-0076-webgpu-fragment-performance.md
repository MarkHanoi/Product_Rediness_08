# ADR-0076 — WebGPU Fragment-Engine Performance (§PERF-WEBGPU-FRAGMENT)

| Field | Value |
|---|---|
| Status | **Proposed** — 2026-06-24 · reload-on-toggle sub-decision **SUPERSEDED by [ADR-0077](./ADR-0077-live-renderer-backend-swap.md)** (§RENDERER-LIVE-SWAP, 2026-06-26) — the corner GPU pill now performs a live, in-place renderer swap instead of persist+reload; the rest of this ADR stands. |
| Tag | §PERF-WEBGPU-FRAGMENT · 2026-06-24 |
| Owner | Graphics / Engine lead |
| Closes | Founder #1 issue: "3D viewport slow under WebGPU on populated scenes" |
| Extends | [ADR-0246](./ADR-0246-instanced-mesh-coalescing.md) (instancing), [ADR-0206](./ADR-0206-default-render-mode.md) (WebGPU default), [ADR-0222](./ADR-0222-renderer-topology-backend-runtime.md), [ADR-0257](./ADR-0257-realtime-geometry-and-view-interactivity.md) |
| Constraint reference | C04 (Rendering & Scheduling), C10 NFT-4/16 (frame budget, memory), C01 P1/P2/P3/P8 |

---

## Context

PRYZM's element geometry is produced by a family of **fragment builders**
(`WallFragmentBuilder`, `SlabFragmentBuilder`, `FurnitureFragmentBuilder`,
`RoofFragmentBuilder`, `HandrailFragmentBuilder`, `Column/Beam/Lighting/Plumbing`
fragment builders). Each element becomes **N independent `THREE.Mesh` objects**
inside a `THREE.Group`. This is the WebGL-era model: WebGL draw calls are cheap
state changes, so "many small meshes" is acceptable, and the per-element group
makes selection, per-level visibility, disposal, and edge overlays trivial.

Under **WebGPU** (now the default boot backend per ADR-0206 / C04 §1.4 once the P2
gate closed) the cost profile inverts:

- Every distinct `(geometry, material)` pair forces a **pipeline state object
  (PSO)** + **bind group**. Thousands of unique materials → thousands of PSOs to
  compile and bind. PSO compilation and per-draw bind-group churn dominate the
  frame and the first-paint.
- The TSL post-FX pipeline (`RenderPipelineManager`: SSGI → Denoise → Outlines →
  TRAA) runs **per frame over the full MRT scene pass**, independent of whether a
  scene has 50 or 13,000 meshes — but its absolute cost and its rebuild cost
  (shader recompile on shadow-map / camera changes) scale with scene complexity.
- Shadow-map generation re-renders **every `castShadow` mesh** from the light's
  POV each update. Fragment builders set `castShadow = true` on essentially every
  mesh, including decorative furniture.

### Hard evidence (audited 2026-06-24, file:line)

| # | Finding | Magnitude | Source |
|---|---|---|---|
| 1 | **Furniture is the dominant mesh source and is NOT instanced.** Each furniture piece is a multi-mesh `THREE.Group` (chair ≈ 6, table 5–12, kitchen 5–50+, lighting 3–12, plumbing 6–10). ~676 furniture pieces ⇒ the bulk of ~13,048 meshes. | thousands of meshes / thousands of PSOs | `packages/geometry-furniture/src/FurnitureFragmentBuilder.ts`; `builders/*`; FrustumCulling audit |
| 2 | **All furniture meshes cast + receive shadows.** `child.castShadow = true; child.receiveShadow = true` set on every furniture sub-mesh. | shadow pass re-renders ~all furniture meshes per update | `FurnitureFragmentBuilder.ts:189-190` |
| 3 | **A complete, contract-aligned GPU-instancing renderer already exists but only walls use it.** `InstancedElementRenderer` groups by `(levelId, geometryHash, materialUuid)`, preserves per-instance pick via `userData.getInstanceElementId(slot)` and per-level visibility via `userData.levelId` / `elementType`. SelectionManager already resolves it (`isInstancedGroup` + `getInstanceElementId`). | infra present; furniture/columns/beams gap | `packages/core-app-model/src/rendering/InstancedElementRenderer.ts:106-193`; `InstanceGroup.ts`; `packages/input-host/src/SelectionManager.ts:830-834,1198-1206`; wall path `WallInstanceBridge.ts`, wired `engineLauncher.ts:339-346` |
| 4 | **ADR-0246 coalescer is scoped to curtain walls only.** `InstancedMeshCoalescer` merges per-wall CW `InstancedMesh` by `(levelId, geo, mat)` post-batch; it does not touch the per-element fragment meshes that make up the mesh-count bulk. | partial coverage | `packages/scene-committer/src/InstancedMeshCoalescer.ts` |
| 5 | **PBR upgrade is a whole-scene traverse on activation.** `PBRSceneUpgrader.apply()` traverses the entire scene and mutates every `MeshStandardMaterial`. Batches can pass `skipPbrUpgrade`, but the activation/HDRI-change paths re-traverse unconditionally. | O(meshes) traverse + `needsUpdate` (PSO invalidation) | `PBRSceneUpgrader.ts:76-162`; `RenderingPipelineCoordinator.ts:184-227` |
| 6 | **Post-FX pipeline rebuilds recompile shaders.** Shadow-map texture churn forces `RenderPipelineManager` full rebuilds; the largest project-open LONGTASK is the pipeline rebuild (≈768 ms), not PBR. | rebuild = shader recompile stalls | `RenderPipelineManager.ts:scheduleShadowRebuild/_fullRebuild`; analysis `perf-project-open-and-batch-2026-06-03.md` |
| 7 | **WebGPU device-lost + `usedTimes` dispose race exist and are handled reactively.** Device-lost → reset CW prewarm → 5 s cooldown → 2 s wait → recreate renderer → rebind RPM. `usedTimes`/`ShadowDepthTexture used in a submit` are suppressed/deferred. | recovery exists but is reactive | `apps/editor/src/rendering/createRenderer.ts:120-186`; `WebGPURendererAdapter.ts:163-178`; `ViewportCrashGuard.ts:38-53`; `ShadowQualityUpgrader §SHADOW-DISPOSE-DEFER` |

### Root cause

The fragment model multiplies **mesh count → draw count → PSO/bind-group count →
shadow-caster count → PBR-traverse cost**. WebGL hid this; WebGPU exposes it. The
single biggest unexploited lever is that the bulk of meshes (repeated furniture,
columns, beams) are *exactly the repeated `(geometry, material)` shapes that the
existing `InstancedElementRenderer` was built to collapse* — yet only walls route
through it.

---

## Decision

Adopt a **four-axis** strategy, phased quick-wins → structural, every axis
reversible and gated, none regressing per-element picking or per-level visibility.

### Axis 1 — Scene-size render quality tiers (quick win, this ADR)

Introduce a **pure decision service** `SceneQualityTierManager`
(`packages/core-app-model/src/rendering/`) that maps the live mesh count (already
counted by `FrustumCullingService`) + backend to a `SceneQualityTier`:

| Tier | Mesh count | SSGI | TRAA | Reflection probes | Shadow level | Decorative-furniture shadows | Whole-scene PBR re-traverse |
|---|---|---|---|---|---|---|---|
| `cinematic` | ≤ 1,500 | on | on | on (ultra) | high/ultra | on | on |
| `balanced` | ≤ 6,000 | on | on | off | high | on | on |
| `performance` | ≤ 15,000 | off | on | off | standard | **off** | deferred |
| `survival` | > 15,000 | off | off | off | standard | **off** | skipped |

The service is **pure** (no THREE handle, no rAF) — it returns a recommendation
object. The wiring layer (`RenderingPipelineCoordinator` / `RenderPipelineManager`
/ `RenderPerformanceService`, all of which already own the THREE side) consults it
and applies the existing `activateSSGI/deactivateSSGI`, `activateTRAA`,
`ShadowQualityUpgrader.setLevel`, and `RenderPerformanceService.setQualityLevel`
calls. Re-using those existing, already-tested mutators is what keeps this low-risk.

### Axis 2 — Furniture shadow budget (quick win, this ADR)

A static, **default-preserving** shadow budget on `FurnitureFragmentBuilder`. When
the budget is set to a non-default tier by the wiring layer, **decorative** furniture
(plants, lamps, rugs/carpets, wall decor, curtains — items whose shadow contributes
nothing to spatial reading) build with `castShadow = false`, cutting shadow-caster
count without affecting the big architectural pieces (sofas, beds, kitchens). The
default budget keeps **today's exact behaviour** (all furniture casts shadows), so
shipping the code changes nothing until the tier wiring opts in.

### Axis 3 — Extend instancing to repeated furniture / columns / beams (structural, Phase 2)

Generalise the wall `WallInstanceBridge` pattern into an **element-agnostic
instancing bridge** over the existing `InstancedElementRenderer`. Repeated
single-geometry elements (columns, beams, and *leaf furniture sub-meshes with a
stable `(geometry, material)` fingerprint*) register as instances. This preserves:

- **Per-element picking** — `InstancedElementRenderer` already stamps
  `userData.getInstanceElementId(slot)`; SelectionManager already resolves it. Each
  instance carries its element id; selection is byte-for-byte unchanged.
- **Per-level visibility** — `userData.levelId` + `elementType` are stamped per
  group; the Project Browser isolate/hide-by-level/by-type traverses already match
  them (`§INSTANCED-LEVEL-VIS`, `§INSTANCED-ISOLATE-FIX`).

Multi-mesh furniture (kitchens, wardrobes) stays on the fragment path; only the
*repeated leaf shapes* are instanced. This is the largest draw-call win but is
correctness-sensitive (geometry fingerprinting, material sharing, undo), hence
Phase 2 behind a default-off flag mirroring `__pryzmWallPipelineV2`.

### Axis 4 — Material sharing + WebGPU device-lost hardening (structural, Phase 2)

- **Material sharing:** route fragment builders through a shared material cache
  keyed by visual signature so identical walls/slabs/furniture share one material
  ⇒ one PSO. (`MaterialService` already does this for furniture; extend the
  pattern to walls/slabs, whose builders allocate a fresh `MeshStandardMaterial`
  per element — see `WallInstanceBridge.ts:81-83`, `WallFragmentBuilder.ts:887-889`.)
- **Lazy / cheaper PBR:** make `PBRSceneUpgrader` incremental-only at `performance`
  and above (operate on newly-added meshes via `upgradeNewMeshes`, never a full
  re-traverse) — the snapshot map already supports this.
- **Device-lost hardening:** keep the WebGL2 fallback first-class (C04 §1.4); make
  device-lost recovery proactively *lower the tier* (Axis 1) on the recreated
  renderer so a recovery on a heavy scene doesn't immediately re-lose the device.

---

## Consequences

### Positive
- Quick wins (Axis 1 + 2) are pure / default-preserving and reversible: they ship
  dark and only change behaviour when the wiring layer raises the tier.
- Axis 3 reuses the **already-correct** picking + visibility plumbing of
  `InstancedElementRenderer`, so the two known instancing hazards (instanced-GPU-pick
  gap; instanced-aggregate-visibility gap) are pre-solved, not re-opened.
- Targets: at `performance` tier on a ~13k-mesh scene, expect draw calls to fall by
  the furniture/column/beam instancing factor (repeated shapes collapse to one draw
  per `(geo, mat, level)`), shadow casters to drop by the decorative-furniture share,
  and per-frame post-FX cost to fall (SSGI off) — moving the frame toward the C10
  NFT-4 16.6 ms budget.

### Negative / risk
- Tier transitions must be **hysteretic** (a scene hovering at a threshold must not
  thrash SSGI on/off). The decision service exposes a hysteresis band; the wiring
  layer debounces.
- Axis 3 geometry fingerprinting can mis-group visually-distinct shapes that share a
  fingerprint; mitigated by the existing `_hashGeometry` (`indexCount_vertexCount_
  firstVertex_materialUuid`) plus material-uuid disambiguation, and gated behind a
  default-off flag with a visual-diff check (ADR-0206 P10 corpus).

### Alignment with principles / contracts
- **P1 (single composition root):** no new runtime wiring; services are consulted
  from the existing coordinator owned by the one `composeRuntime()` boot.
- **P2 (single THREE owner):** new code imports THREE only via
  `@pryzm/renderer-three/three` (the sanctioned barrel) inside the existing
  `core-app-model/rendering` + `renderer-three` layers; `check-three-imports.ts`
  stays green. The pure decision service imports **no** THREE at all.
- **P3 (single rAF):** no new `requestAnimationFrame`; tier application is invoked
  from existing event/commit hooks and the existing frame-scheduler.
- **P8 (spans):** every new exported function carries an OpenTelemetry span.
- **C04 §1.4 / §3.5 / ADR-0206:** WebGL2 fallback stays first-class; LOD/quality
  scaling is the contract's sanctioned large-model lever.
- **C10 NFT-4 / NFT-16:** the quality tiers are the mechanism to hold the 16.6 ms
  frame budget and the 1.5 GB memory ceiling as element counts grow.

---

## Phased rollout

- **Phase 1 (this ADR, shipped 2026-06-24):**
  - `SceneQualityTierManager` — pure tier decision service (+ unit tests), imports no
    THREE, hysteresis band built in.
  - **Wired default-on conservatively.** The tier is consulted from the existing
    `RenderingPipelineCoordinator` (which already owns the THREE side and the tested
    `activateSSGI/deactivateSSGI`, `ShadowQualityUpgrader.setLevel`, … mutators). On
    small/normal scenes the count stays in `cinematic`/`balanced` ⇒ **today's exact
    behaviour, zero change**. Only scenes that are *already* heavy (>6k / >15k meshes)
    step down SSGI/TRAA/shadow. Degrading an already-overloaded scene is strictly safer
    than leaving it overloaded. Transitions are hysteretic + debounced so they cannot
    thrash. Tier application is invoked from existing event/commit hooks (no new rAF).
  - `FurnitureFragmentBuilder` decorative-shadow budget — auto-engages at `performance`+
    tier (decorative furniture stops casting shadows); at `cinematic`/`balanced` the
    default preserves current behaviour exactly (all furniture casts shadows).
  - **Caveat (no-test session):** the wiring is reversible and conservative, but the
    visible effect of a mid-session tier step-down on a heavy scene has NOT been
    browser-verified. The pure decision logic IS unit-tested; the THREE-side mutators
    it calls are pre-existing and previously tested.
- **Phase 2 (structural, backlogged):**
  - Wire `SceneQualityTierManager` into `RenderingPipelineCoordinator` /
    `RenderPipelineManager` with hysteresis + debounce; re-tier on device-lost.
  - `ElementInstanceBridge` generalising `WallInstanceBridge` to columns / beams /
    repeated furniture leaves, behind a default-off flag; visual-diff gate.
  - Shared material cache for wall/slab fragment builders (one PSO per signature).
  - Incremental-only PBR at `performance`+ tiers.

## Acceptance criteria
- `npx tsc -p apps/editor/tsconfig.json --noEmit` adds **zero** new errors on touched files.
- `SceneQualityTierManager` unit tests green (tier boundaries + hysteresis).
- With the furniture shadow budget at default, a furniture rebuild is byte-identical
  to pre-ADR (all sub-meshes still `castShadow=true`).
- No regression to per-element selection or per-level isolate/hide (Axis 3 gate).
