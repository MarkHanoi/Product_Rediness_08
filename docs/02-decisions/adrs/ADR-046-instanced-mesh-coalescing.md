# ADR-046 — InstancedMesh Post-Batch Coalescing Strategy

| Field | Value |
|---|---|
| Status | **Proposed** — 2026-05-08 |
| Closes | Phase J.1 (45-CW-SLAB-BATCH-IMPLEMENTATION-PLAN.md) |
| Required by | 1M-element milestone (quarterly) |
| Owner | Engine lead |
| Constraint reference | C10 NFT-4, C11 §6.1, C04 §3.5 |

---

## Context

At 294 curtain walls (the current batch size), per-element geometry works: each `CurtainWallInstanceManager` produces one `InstancedMesh` per material type (glass, spandrel, framing). GPU draw-call count grows as `O(walls × materialTypes)`.

At 1M elements, `O(n × m)` draw calls produce two problems:

1. **VRAM pressure**: 2.2 GB geometry buffer at 1M elements (doc 48 §6.2.1). GPU stalls when geometry exceeds VRAM budget.
2. **CPU batching overhead**: `renderer.render()` iterates every draw call per frame. At 1M draw calls, CPU overhead at 60fps becomes `60 × 1M × ~40ns = 2.4s/frame` — unusable.

The existing `B.1` panel geometry cache (`_panelGeoCache`) already deduplicates *within* a single wall. The gap is *across* walls and *across* levels: two walls on different levels with identical glass panels each allocate their own `InstancedMesh`.

### Current state

`CurtainWallBuilder._buildOne()` creates one `InstancedMesh` per `(wallId, materialType)`. After a 294-wall batch:
- Glass panels: 294 separate `InstancedMesh` instances (each with its own GPU buffer)
- Spandrel panels: 294 separate `InstancedMesh` instances
- Framing mullions: 294 separate `Object3D` containers

Total post-batch draw calls: `294 × 3 material types = 882`. At 1M walls this extrapolates to **3M draw calls** — GPU budget exceeded.

### Options evaluated

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A** | Post-batch coalescing: merge same-material `InstancedMesh` across walls into one | O(materialTypes) draw calls; zero per-wall GPU buffers | Requires re-encoding instance matrices after batch; undo must de-coalesce |
| **B** | Static LOD instancing: one global `InstancedMesh` per material type, filled lazily | Fewest draw calls; GPU-optimal | Instance slot management complexity; hard undo |
| **C** | Explicit batch grouping: group CW elements by level+material at build time | Avoids post-batch merge; simpler undo | Requires builder refactor; not backward-compatible with per-wall commands |
| **D** | No change until GPU budget actually exceeded | Zero refactor cost | Scales to ~5,000 walls max before GPU stall |

---

## Decision

**Option A — Post-batch coalescing pass**: after `BatchCoordinator.onComplete()` fires and `_isBatching = false`, run a single `coalesceCurtainWallMeshes(levelIds)` pass that:

1. Groups all `CurtainWallInstanceManager` instances by `(levelId, materialType)`.
2. Merges instance matrices from per-wall `InstancedMesh` into a single level-scoped `InstancedMesh`.
3. Disposes the per-wall `InstancedMesh` GPU buffers (calls `geometry.dispose()` + `material.dispose()` where material is not shared).
4. Registers the coalesced mesh under `scene.getObjectByName('cwCoalesced-${levelId}-${materialType}')` — a stable name for undo reverse-coalescing.

**Undo path**: `uncoalesceCurtainWallMeshes(levelIds)` re-expands from the coalesced buffer back to per-wall meshes. Triggered by `CommandManager.undo()` for any batch command. The per-wall instance data is retained in a `Map<wallId, Float32Array>` before the coalescing pass.

---

## Consequences

### Positive

- Draw calls: `882` (294 walls) → `3 × nLevels` (3 per level regardless of wall count). At 5 levels: 15 draw calls.
- VRAM: `294 × 3 GPU buffers` → `1 GPU buffer per (level, materialType)`. 294× reduction.
- CPU render loop: `O(walls)` → `O(levels × materialTypes)`. Scales to 1M elements.

### Negative / constraints

- **Undo cost**: de-coalescing requires re-expanding instance matrices. Acceptable because undo is rare relative to batch frequency.
- **Per-wall selection**: `SelectionManager` GPU pick must map from coalesced instance index back to `wallId`. Requires `_instanceIndexToWallId: Map<number, string>` on the coalesced mesh.
- **I-5 compliance**: coalescing pass MUST be scheduled via `getFrameScheduler().scheduleOnce('post-render', ...)` — never raw `requestAnimationFrame`.
- **I-7 compliance**: coalescing operates on `THREE.InstancedMesh` in `NativeElementMeshExporter` (L7.5) — same layer as existing geometry operations. No L7 boundary violation.

---

## Implementation gate

ADR-046 is **Proposed**. Before implementation begins:

1. Prototype `coalesceCurtainWallMeshes()` on a 294-wall batch and verify GPU draw call count with `renderer.info.render.calls`.
2. Verify undo round-trip: coalesce → undo → re-coalesce produces identical geometry.
3. Verify `SelectionManager` hit-test still resolves to correct `wallId` after coalescing.
4. Update to **Accepted** and merge prototype.

---

## References

- doc 48 §6.2.1 (1M-element geometry analysis)
- `packages/renderer-three/src/NativeElementMeshExporter.ts` (coalescing target)
- `src/engine/subsystems/curtainwalls/CurtainWallBuilder.ts` (per-wall mesh creation)
- C10 NFT-4 (≤16.6ms frame budget), C11 §6.1 (FrameScheduler mandate)
