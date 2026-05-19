# ADR-006 — Default Render Mode

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-04-27 |
| Closes | `05-IMPLEMENTATION-PLAN.md §17` row ADR-006 |
| Required by | Sprint S01 (Phase 1A — first triangle on screen) |
| Owner | Architecture lead |
| Implementation | `packages/renderer/` (mode selector); `packages/scene-committer/` (mode-agnostic). |
| Spec dependency | `08-VISION §3` P3 |

---

## Context

PRYZM 2 must render BIM scenes at interactive frame-rates from M12 alpha (5,000 walls / 60 fps target). Two viable web rendering APIs exist today:

- **WebGL2** — universal browser support (Chrome/Edge/Firefox/Safari ≥ 16). Mature, well-instrumented, well-debugged.
- **WebGPU** — modern explicit API. Strong performance gains for our access pattern (compute shaders for edge projection; bindless-style instanced draws for chunk rendering). Browser support: Chrome/Edge ≥ 113 enabled by default; Safari 18+ behind flag (broader rollout 2026); Firefox in active rollout.

`05-IMPLEMENTATION-PLAN.md §17` proposed "WebGL2 default for v1, WebGPU opt-in; flip in v2." `10-MASTER-IMPLEMENTATION-PLAN-36M.md` row ADR-006 amended this to "WebGPU when available, WebGL2 fallback. Visual diff CI gate enforces parity." This ADR ratifies the **amended** position.

The amendment is justified because: (a) compute-shader edge projection (SPEC-04) materially benefits from WebGPU; (b) M36 GA is 24+ months out, by which time WebGPU is the universal default; (c) a parity CI gate makes the dual-path safe.

---

## Decision

**WebGPU when available; WebGL2 fallback. Both paths are first-class.**

### Mode selection (boot-time)
```ts
async function selectRenderMode(): Promise<'webgpu' | 'webgl2'> {
  if (navigator.gpu) {
    const adapter = await navigator.gpu.requestAdapter();
    if (adapter && !knownBrokenAdapters.has(adapter.info?.architecture)) {
      return 'webgpu';
    }
  }
  return 'webgl2';
}
```

- `knownBrokenAdapters` is a small allow-list-based deny set, updated as bug reports arrive (Phase 2D ops process).
- The user can override via Settings → Advanced → Force render mode (`auto` | `webgpu` | `webgl2`).

### Mode-agnostic committer
- `packages/scene-committer/` produces `BufferGeometryDescriptor`s only. No mode-specific code.
- `packages/renderer/` has two backends: `RendererWebGPU` and `RendererWebGL2`, both behind the same `Renderer` interface (`createScene`, `addElement`, `removeElement`, `setView`, `frame`).

### Visual-diff CI gate (P10)
- Test corpus: 24 reference scenes (single-wall, multi-wall miter, room, slab+columns, full Phase-1B scene, full Phase-2A scene, …).
- Each scene rendered in both modes at 1920×1080.
- Diff threshold: SSIM ≥ 0.998 per scene.
- A drift below the threshold blocks the PR. Required from S22 (warning at S08).

### Feature parity matrix
| Feature | WebGPU | WebGL2 | Notes |
|---|---|---|---|
| PBR materials | ✓ | ✓ | Same shader source compiled to WGSL / GLSL via shared HLSL-style headers in `packages/shader-source/`. |
| Instanced chunk rendering | ✓ (bindless-style) | ✓ (instanced VAOs) | WebGPU has lower CPU overhead. |
| Edge projection (compute) | ✓ (compute shader) | Fallback to CPU pass | The CPU fallback runs in a kernel worker; ~3× slower but correct. |
| Selection outlines | ✓ | ✓ | Stencil + post pass. |
| Plan-view direct draw | n/a | n/a | Plan view is Canvas2D (per ADR-016), not WebGL/WebGPU. |
| HDR / Lookahead lighting | ✓ | Limited | Phase 3+ feature; WebGL2 ships a tone-mapped LDR fallback. |

### Telemetry
- `renderer.mode.selected { mode, adapter, reason }` at boot.
- `renderer.frame { mode, durationMs, drawCalls, triangles }` per frame, sampled at 1 Hz to limit volume.
- `renderer.fallback.engaged { from: 'webgpu', to: 'webgl2', reason }` when a WebGPU session is downgraded mid-session (rare; usually device-lost).

---

## Consequences

**Positive:**
- Future-proof: as WebGPU support broadens (Safari, Firefox), most users get the better path automatically.
- Performance ceiling raised: compute-shader edge projection is materially faster, key for plan-view interactivity.
- WebGL2 fallback is first-class, not a degraded mode — supported through GA.
- Visual parity is enforced (P10), so a regression in either path is caught at PR time.

**Negative:**
- Two render backends to maintain. Mitigated by sharing shader source in `packages/shader-source/` and by a thin `Renderer` interface.
- Visual-diff CI gate adds ~4 minutes to PR time at the corpus size described; mitigated by parallelising on workers.
- Edge cases on flaky drivers (Intel UHD on Linux, some Android adapters) require deny-list maintenance.

---

## Alternatives considered

### WebGL2-only (defer WebGPU to v2)
- Rejected: defers the largest single performance win we have; by the time we'd flip, the WebGPU code path would not exist and would be a 6-month rewrite.

### WebGPU-only
- Rejected: shipping in 2026/2027 still leaves Safari and Firefox cohorts on a fallback. Refusing to render for them is a non-starter for D8 (CAD parity) — those users are architects.

### Babylon.js / PlayCanvas
- Rejected: the renderer is a small, well-bounded part of the stack; using a full framework couples us to its lifecycle, asset pipeline, and update cadence.

### Three.js as the shared abstraction
- Considered. We use THREE inside `packages/scene-committer/` for its scene-graph and material conventions, but the lowest-level draw layer is our own. THREE's WebGPU backend is acceptable but evolving; we keep flexibility by isolating it behind `Renderer`.

---

## Phase rollout
- S01 — `packages/renderer/` skeleton; WebGL2 backend renders first colored quad.
- S04 — WebGPU backend renders the same; mode selector live.
- S08 — visual-diff CI gate (warning).
- S22 (M12 alpha) — visual-diff CI gate at error level; 24-scene corpus complete.
- S29 — compute-shader edge projection lands in WebGPU; CPU fallback in WebGL2.
- S48 (M24 beta) — telemetry surfaced in ops dashboard; deny-list process documented.
- S72 (M36 GA) — both paths supported; deprecation of WebGL2 NOT scheduled within v1.
