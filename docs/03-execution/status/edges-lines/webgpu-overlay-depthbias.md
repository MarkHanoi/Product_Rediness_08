# WebGPU Edge Overlay — depthBias / ShadowDepthTexture Error Analysis

**Document:** `22-WEBGPU-EDGE-OVERLAY-DEPTHBIAS-ANALYSIS.md`  
**Status:** ANALYSIS ONLY — implementation pending  
**Relates to:** Doc 20 (Edge Line Flicker Fix)  
**Errors under analysis:**

```
THREE.depthBias must be 0 when using PrimitiveTopology::LineList.
 - While validating depthStencil state.
 - While calling [Device].CreateRenderPipeline([RenderPipelineDescriptor "renderPipeline_LineBasicMaterial_260"]).

[Invalid RenderPipeline "renderPipeline_LineBasicMaterial_260"] is invalid due to a previous error.
 - While encoding [RenderPassEncoder (unlabeled)].SetPipeline(...)
 - While finishing [CommandEncoder "renderContext_1"].

[Invalid CommandBuffer from CommandEncoder "renderContext_1"] is invalid due to a previous error.
 - While calling [Queue].Submit([...])

Destroyed texture [Texture "ShadowDepthTexture"] used in a submit.
 - While calling [Queue].Submit([[CommandBuffer from CommandEncoder "renderContext_10"]])

THREE.WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead.
```

---

## 1. SUMMARY

Doc 20 successfully eliminated the `THREE.NodeMaterial: Material "LineMaterial" is not compatible` error and the continuous frame-rate flicker that it caused. However, it introduced a **new** WebGPU pipeline validation error by applying `polygonOffset: true` to `THREE.LineBasicMaterial` on `THREE.LineSegments` objects.

WebGPU's specification explicitly forbids non-zero `depthBias` on `line-list` topology. Three.js maps `polygonOffset` directly to `depthBias` in the pipeline descriptor without checking whether the primitive topology is `line-list`. The mismatch causes `device.createRenderPipeline()` to fail on every frame that a wall or slab edge overlay is present in the scene.

The `Destroyed texture [Texture "ShadowDepthTexture"]` error is a cascading consequence of the failed pipeline, plus a separate pre-existing issue with `PCFSoftShadowMap` deprecation.

---

## 2. ERROR 1 — `depthBias must be 0 when using PrimitiveTopology::LineList`

### 2.1 Root cause

**File:** `src/elements/walls/WallEdgeOverlayBuilder.ts` and `src/elements/slabs/SlabFragmentBuilder.ts`

Doc 20 replaced `LineSegments2` + `LineMaterial` with `THREE.LineSegments` + `THREE.LineBasicMaterial`. To prevent Z-fighting (coplanar edge lines fighting with the solid face in the depth buffer), the fix added polygon offset to the material:

```typescript
const lineMat = new THREE.LineBasicMaterial({
    color: colorHex,
    depthTest: true,
    polygonOffset: true,        // ← triggers depthBias in WebGPU pipeline
    polygonOffsetFactor: -1,    // ← becomes depthBiasSlopeScale = -1
    polygonOffsetUnits:  -1,    // ← becomes depthBias = -1
});
```

### 2.2 The WebGPU translation chain

**Step 1 — topology assignment** (`WebGPUUtils.js:179`):

```javascript
// node_modules/three/src/renderers/webgpu/utils/WebGPUUtils.js
getPrimitiveTopology( object, material ) {
    if ( object.isPoints ) return GPUPrimitiveTopology.PointList;
    else if ( object.isLineSegments || ( object.isMesh && material.wireframe === true ) )
        return GPUPrimitiveTopology.LineList;  // ← 'line-list'
    else if ( object.isLine ) return GPUPrimitiveTopology.LineStrip;
    else if ( object.isMesh ) return GPUPrimitiveTopology.TriangleList;
}
```

`THREE.LineSegments.isLineSegments = true`. So all edge overlay objects get topology `'line-list'`.

**Step 2 — depthBias assignment** (`WebGPUPipelineUtils.js:259–263`):

```javascript
// node_modules/three/src/renderers/webgpu/utils/WebGPUPipelineUtils.js
if ( material.polygonOffset === true ) {
    depthStencil.depthBias          = material.polygonOffsetUnits;   // -1
    depthStencil.depthBiasSlopeScale = material.polygonOffsetFactor; // -1
    depthStencil.depthBiasClamp     = 0;
}
pipelineDescriptor.depthStencil = depthStencil;
```

There is **no guard** in Three.js that prevents `depthBias` from being set when the topology is `line-list`. The pipeline descriptor is assembled with both non-zero `depthBias` and `topology: 'line-list'`.

**Step 3 — WebGPU spec violation**:

The WebGPU specification (§DepthStencilState) states:

> `depthBias`, `depthBiasSlopeScale`, and `depthBiasClamp` are only defined for triangles.
> If the primitive topology is `line-list`, `line-strip`, or `point-list`, these values MUST all be 0.

The device rejects the pipeline descriptor:

```
THREE.depthBias must be 0 when using PrimitiveTopology::LineList.
 - While validating depthStencil state.
 - While calling [Device].CreateRenderPipeline("renderPipeline_LineBasicMaterial_260")
```

### 2.3 Why it fires on every frame

Unlike the `LineMaterial` error (which fired because the TSL compiler could not build a shader at all), this error fires at the **pipeline creation** stage. Three.js's WebGPU backend caches compiled pipelines in a `WeakMap` keyed by the material's node builder state. Because `createRenderPipeline()` fails, no pipeline is stored in the cache. On the next frame, Three.js's `needsRefresh` check finds no cached pipeline, attempts `createRenderPipeline()` again, fails again. The cycle repeats on every frame for every edge overlay object in the scene.

### 2.4 Why the pipeline is named `renderPipeline_LineBasicMaterial_260`

The `260` suffix is an internal object ID assigned by the Three.js WebGPU backend — it is the ID of the `LineBasicMaterial` instance created for the edge overlay. The name confirms the error is coming from exactly the `LineBasicMaterial` that was introduced by Doc 20.

---

## 3. ERROR 2 — Invalid RenderPipeline / Invalid CommandBuffer (cascade)

Once `createRenderPipeline()` fails, the WebGPU device returns an `[Invalid RenderPipeline]` handle (not null — WebGPU uses an opaque invalid handle rather than throwing). Three.js calls `renderPassEncoder.setPipeline(invalidPipeline)`, which immediately invalidates the `RenderPassEncoder`. All subsequent commands recorded into that encoder are also invalid. When `commandEncoder.finish()` is called, the resulting `CommandBuffer` is also invalid. `queue.submit([invalidCommandBuffer])` emits the second warning.

This is a pure cascade — no independent root cause beyond Error 1.

---

## 4. ERROR 3 — `Destroyed texture [Texture "ShadowDepthTexture"] used in a submit`

This error has two concurrent contributing causes. Both must be understood independently.

### 4.1 Cause A — cascade from the invalid command buffer (renderContext_1)

The shadow depth texture is allocated by `ShadowNode.setupRenderTarget()`:

```javascript
// node_modules/three/src/nodes/lighting/ShadowNode.js
setupRenderTarget( shadow, builder ) {
    const depthTexture = new DepthTexture( shadow.mapSize.width, shadow.mapSize.height );
    depthTexture.name = 'ShadowDepthTexture';   // ← the named texture in the error
    // ...
    shadowMap.depthTexture = depthTexture;
    return { shadowMap, depthTexture };
}
```

The shadow render pass uses `renderContext_10`, a different command encoder from `renderContext_1` (the line pipeline encoder). However, when `renderContext_1`'s command buffer is submitted as `[Invalid]`, the WebGPU device's error handling may trigger resource cleanup. Specifically, if Three.js's WebGPU backend tracks "in-flight" GPU textures and uses the invalid submit as a signal that the frame has completed abnormally, it may release GPU memory for textures it believes are no longer needed — including the shadow depth texture — before the GPU has finished executing `renderContext_10`. The subsequent submit of `renderContext_10` then finds the `ShadowDepthTexture` already destroyed.

### 4.2 Cause B — PCFSoftShadowMap deprecation (pre-existing, independent)

**File:** `src/core/BimWorld.ts`

```typescript
world.renderer.three.shadowMap.type = THREE.PCFSoftShadowMap;
```

Three.js's `WebGLShadowMap.js` (used as the shadow render path even under some WebGPU configurations) detects `PCFSoftShadowMap` on the first shadow render call and mutates the type in place:

```javascript
// node_modules/three/src/renderers/webgl/WebGLShadowMap.js:99–103
if ( this.type === PCFSoftShadowMap ) {
    warn( 'WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead.' );
    this.type = PCFShadowMap;   // ← mutated on the first shadow render
}
```

This mutation happens at JavaScript runtime during the first frame that renders shadows. At the point of mutation, the `ShadowDepthTexture` GPU allocation may already be recorded into a pending command buffer. The type change can cause the shadow render target to be re-evaluated and partially recreated (filter mode change at `ShadowNode.js:425–434`). If the old `ShadowDepthTexture` GPU allocation is destroyed during recreation while the GPU is still executing a previous-frame command buffer that references it, the `Destroyed texture used in a submit` error results.

This cause is independent of Doc 20 and Doc 19 — it was likely already occurring before those changes but may have been masked by other errors.

### 4.3 Why the two causes are difficult to separate

Both causes produce identical error text. The key differentiator is the `renderContext` number:

- `renderContext_1` = command encoder for the geometry/line pass (line pipeline failure)
- `renderContext_10` = command encoder for the shadow pass (shadow depth texture submit)

The shadow depth texture error referencing `renderContext_10` points to the shadow pass itself, which is consistent with Cause B (PCFSoftShadowMap recreation). However, the invalid `renderContext_1` submission occurring before `renderContext_10`'s submit is consistent with Cause A (cascade). Both mechanisms may be active simultaneously.

---

## 5. ERROR 4 — `THREE.WebGLShadowMap: PCFSoftShadowMap has been deprecated`

**File:** `src/core/BimWorld.ts` line ~40:

```typescript
world.renderer.three.shadowMap.type = THREE.PCFSoftShadowMap;
```

Three.js WebGPU and modern Three.js have deprecated `PCFSoftShadowMap`. The warning is emitted once per session on the first shadow render. The type is then silently changed to `PCFShadowMap`. This is a separate, pre-existing issue from the edge overlay errors.

---

## 6. COMPLETE CALL CHAIN (PER FRAME, when walls/slabs are present)

```
RAF loop (requestAnimationFrame)
  └─ renderer.render(scene, camera)
       ├─ shadow pass  → commandEncoder "renderContext_10"
       │     └─ ShadowNode: render depth map for directional lights
       │          └─ references ShadowDepthTexture (GPU allocation)
       │
       ├─ main pass   → commandEncoder "renderContext_1"
       │     ├─ render solid meshes        → OK
       │     └─ render LineSegments (edge overlays)
       │           └─ getPrimitiveTopology() → 'line-list'
       │           └─ material.polygonOffset → depthBias = -1
       │           └─ createRenderPipeline() → FAILS (depthBias + LineList)
       │           └─ setPipeline(invalid)   → encoder invalidated
       │           └─ commandEncoder.finish() → [Invalid CommandBuffer]
       │
       ├─ queue.submit([Invalid CommandBuffer renderContext_1])
       │     └─ GPU: validation error logged, partial frame submitted
       │     └─ Three.js WebGPU backend: error handling → possible resource cleanup
       │           └─ ShadowDepthTexture GPU allocation destroyed prematurely?
       │
       └─ queue.submit([CommandBuffer renderContext_10])
             └─ GPU: ShadowDepthTexture already destroyed
             └─ "Destroyed texture [ShadowDepthTexture] used in a submit"
```

---

## 7. WHAT POLYGONOFFSET DOES ON TRIANGLES (for reference)

On `TriangleList` topology, polygon offset works correctly. The GPU applies a depth bias to each triangle fragment based on its slope, pushing the depth value toward the camera so that coplanar geometry (like a line drawn on a surface) passes the depth test without fighting. WebGPU inherits this from the underlying graphics API (Vulkan/Metal/D3D12), all of which define depth bias only for rasterised triangles — lines and points are single-pixel primitives with no slope component, making the depth bias formula undefined and therefore prohibited.

---

## 8. WHY Z-FIGHTING CANNOT BE SOLVED WITH POLYGONOFFSET ON LINES (in WebGPU)

The alternative approaches available for line primitive Z-fighting on WebGPU are:

| Approach | Mechanism | WebGPU safe? |
|---|---|---|
| `polygonOffset` on `LineBasicMaterial` | Sets `depthBias` in pipeline | ❌ Forbidden for `line-list` |
| `renderOrder` (already applied) | Draws lines after triangles | ✅ Safe — render order only |
| `depthWrite: false` on line material | Lines don't write to depth | ✅ Safe — may cause other issues |
| Small `position` offset in geometry | Push vertices along face normal | ✅ Safe — GPU-agnostic |
| Custom TSL node material | Override depth in shader | ✅ Safe — complex |
| `THREE.Line` with `LineStrip` topology | Also `line-strip`, also forbidden | ❌ Same spec constraint |

`renderOrder = 1` (already applied in Doc 20) provides partial protection by ensuring edge lines are drawn after the solid mesh in the render queue. However, `renderOrder` does not adjust depth buffer values — it only controls draw ordering within the same render pass. Coplanar geometry still races in the depth buffer when `depthTest: true`.

---

## 9. FILES IMPLICATED (analysis only — no changes in this document)

| File | Issue |
|---|---|
| `src/elements/walls/WallEdgeOverlayBuilder.ts` | `polygonOffset: true` on `LineBasicMaterial` → invalid WebGPU pipeline |
| `src/elements/slabs/SlabFragmentBuilder.ts` | Same |
| `src/core/BimWorld.ts` | `shadowMap.type = PCFSoftShadowMap` → deprecated, triggers shadow texture recreation |
| `node_modules/three/src/renderers/webgpu/utils/WebGPUPipelineUtils.js:259` | No topology guard before applying `depthBias` — Three.js upstream bug |
| `node_modules/three/src/renderers/webgpu/utils/WebGPUUtils.js:179` | `isLineSegments` → `LineList` — correct behaviour, not a bug |

---

## 10. THREE.JS UPSTREAM STATUS

The missing topology guard in `WebGPUPipelineUtils.js` (applying `depthBias` to `line-list` without checking) is an upstream Three.js bug. Three.js should guard the `polygonOffset` block:

```javascript
// Missing guard (upstream fix needed):
if ( material.polygonOffset === true && primitiveTopology === GPUPrimitiveTopology.TriangleList ) {
    depthStencil.depthBias = material.polygonOffsetUnits;
    // ...
}
```

Until Three.js fixes this upstream, any Three.js WebGPU project that applies `polygonOffset` to line or point materials will hit the same validation error.
