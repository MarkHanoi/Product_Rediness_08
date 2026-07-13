# 03 — Three.js / WebGL playbook

The ad's exact words: *"rendering optimization for complex 3D models."* This document is that answer.

---

## The framing that wins

> **"Rendering optimisation is two questions: how many draw calls, and how much work am I doing that I didn't need to do? Almost everything I've shipped is one of those two."**

Then produce the taxonomy. Then produce a number.

---

## 1. Draw calls — collapse them

**GPU instancing.** One unit `BoxGeometry(1,1,1)` is shared across every instance of a `(kind, material, level)` group; the *real dimensions live entirely in the per-instance matrix* via `makeScale()`. So a thousand differently-sized columns become **one `InstancedMesh`, one draw call**.
→ `packages/core-app-model/src/rendering/ElementInstanceBridge.ts`

**The trap you hit, and the reason to mention it:** instancing dies silently if every element gets its own material. You fixed that with a **content-hashed, ref-counted material pool** (`MaterialPool.ts`, implements TC39 `[Symbol.dispose]`).
> *"Instancing is easy to think you've done. If each element makes its own material, you're back to N draw calls and nothing warns you."*

**Instanced-mesh coalescing.** Merge per-wall instanced meshes into one per `(levelId, geometry, material)`:
> **5 levels × 10 walls × 3 IM = 150 draw calls → 15.**
→ `packages/scene-committer/src/InstancedMeshCoalescer.ts`

**And the subtlety that proves you've shipped it:** instancing normally *destroys picking*, because an instanced group has no per-element id. You solved it by stamping `userData.getInstanceElementId(slot) → elementId` at registration, so the pick path can resolve a hit back to a real element.

---

## 2. Don't do the work — culling, LOD, tiers

| Technique | What you did | Where |
|---|---|---|
| **Frustum culling** | Builders default `frustumCulled = false` (bad bounding spheres); above **500 elements** a service recomputes bounding spheres and turns culling back on. A `WeakSet` skip-set makes the audit **O(new geometries)** instead of rescanning 1,200–2,400 vertices every pass. | `FrustumCullingService.ts` |
| **Level-scoped culling** ⭐ | A **40-storey, 1,366-element tower lost the WebGPU device.** Scoping the 3D view to *active level ± 1* renders **3 storeys instead of 40 ≈ 13× fewer draw calls, PSOs, GPU memory and shadow casters.** Visibility-only — never deletes. Stands down in ortho plan. | `LevelScoped3DCullingService.ts` |
| **Massing LOD** | The floors you culled still need to *exist* visually — so every out-of-scope level draws as **one instanced box scaled to its bounding box**. The silhouette survives; the cost doesn't. | `LevelMassingRenderer.ts` |
| **Distance LOD** | tier 0 full < 100 m · tier 1 simplified 100–500 m · tier 2 bounding box ≥ 500 m | `LODManager.ts` |
| **Quality tiers + hysteresis** | `cinematic ≤1,500 meshes │ balanced ≤2,500 │ performance ≤15,000 │ survival ∞` — switches SSGI, TRAA, reflection probes, shadow quality. A **symmetric guard band prevents thrash** at the boundary. The service imports **zero THREE** — it's a pure decision function. | `SceneQualityTierManager.ts` |
| **Shadow budget** | ~676 furniture pieces dominate the shadow-caster population. A `'decorative-off'` budget strips `castShadow` from plants, lamps, rugs, curtains — while sofas, beds and kitchens keep theirs. **Shadows are a budget, not a boolean.** | `furnitureShadowBudget.ts` |

---

## 3. Don't block the main thread

- **A 7,046 ms freeze** — projecting ~595 geometry groups at ~11–12 ms each, in one task. Fixed by **yielding every N groups** across frames. `EdgeProjectorService.ts` (§PERF-EDGEPROJECTOR-CHUNK)
- **A 14,175 ms cold-start stall** — ~1,000 shader pipelines (**PSOs**) compiling in a single drain frame. Fixed with an **offscreen prewarm**: draw them at `scale = 0.0001` so they are *real* draw calls (forcing compilation) but invisible. Cost ≈450 ms; **removed a 6,644 ms freeze.**
- **Workers** for solar/sun-hours raycasting. `SolarWorkerPool.ts`
- **Idle cost is zero fps.** Rendering is input-driven: a `dirtyFlags` set; `markDirty('camera')`; no dirt → no frame.

> This last one is a great senior signal: *"A 3D app that renders 60 fps while nothing is happening is burning a laptop battery to display a static image."*

---

## 4. Architecture as performance

- **Single rAF.** The *only* `requestAnimationFrame` call site in the codebase is `packages/frame-scheduler/src/RafAdapter.ts`; everything else subscribes to a frame bus with a **priority queue** (`interaction | idle | background`) and **per-frame budget tokens**. Enforced by a **lint rule** (`pryzm/no-raf`) that fails CI.
  > *"Every library wants its own rAF. Three of them and you've got three uncoordinated loops competing for one frame. So there's exactly one, it's a lint rule, and everything else subscribes."*
- **Single THREE owner.** `import * as THREE` is legal in exactly one package. Everything else imports a re-export. CI-enforced.
- **Dirty-checking** everywhere: `_lastBuiltVersion` on the wall builder; cache hit/miss stats on projection.

---

## 5. The backends — WebGPU and the fallback chain

- **WebGPU-first**, falling back **WebGPU → WebGL2 → WebGL**, plus a **live backend swap at runtime with no reload**.
- **A real war story:** on fallback you must **mint a fresh `<canvas>`** — a canvas that has already held a WebGPU context *will refuse* a WebGL2 context. That's the kind of detail you only know if you shipped it.
- **TSL / node-material pipeline** (WebGPU only): ScenePass with **MRT** (output, diffuse, normal, velocity) → SSGI + denoise → outline nodes → **TRAA**. The WebGL2 path deliberately no-ops the whole pipeline.
- **Failure handling:** 3 retries → raw scene render; a shader-compile error **downgrades** to a lightweight pipeline instead of tripping Three's fatal "Rendering has stopped" latch.
- **Device loss:** a `ShadowDepthTexture` destroyed mid-submit killed the device on heavy scenes. Fixed by deferring disposal.

---

## The three numbers to memorise

1. **150 → 15 draw calls** (instanced-mesh coalescing).
2. **40 storeys → 3, ≈13× fewer draw calls** (level-scoped culling + massing LOD).
3. **A 14-second cold-start stall** from ~1,000 shader compiles → **offscreen prewarm at 0.0001 scale**, costing 450 ms.

If you say nothing else about rendering, say these.

---

## Likely question: *"Scene is at 5 fps with 100k objects. Go."*

**Answer in order — the order is the answer:**

1. **Measure before guessing.** Is it CPU or GPU? `renderer.info` gives draw calls, triangles, programs. A frame capture (Spector.js / browser GPU profiler) tells you if you're fill-bound or submit-bound. *Don't optimise a hypothesis.*
2. **Draw calls** → instancing, merging, shared materials, coalescing.
3. **Don't draw what you can't see** → frustum culling, then domain culling (in my case: level-scoped).
4. **Don't draw detail you can't resolve** → LOD, massing proxies.
5. **Shadows and post-FX are usually the real cost** → budget them, tier them, drop them under load.
6. **Get off the main thread** → chunk long work across frames, use workers.
7. **Stop redrawing static scenes** → dirty-flag rendering.
8. **Picking:** if selection is slow, stop raycasting — render an id buffer.

Finish with: *"And then I'd re-measure, because the second bottleneck is never where you think the first one was."*
