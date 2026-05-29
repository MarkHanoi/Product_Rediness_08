# Plan-View Element Creation — Architectural Audit + Redesign Proposal (2026-05-20)

**Author**: Senior architecture review, in response to user-observed "every wall create regenerates the whole plan view" performance issue.

**Scope**: PRYZM-3 plan-view projection pipeline. The 5-step trace from `wallStore.add()` to a rendered Canvas2D line, the cost analysis, the comparison to Pascal's dirty-node pattern, the proposed PRYZM-3 incremental-projection redesign, and the required amendments to contracts C04 / C11.

**TL;DR**: PRYZM-3's plan-view pipeline correctly invalidates at the VIEW level on every element mutation and **re-projects every element from scratch on every flush**. A per-element projection cache exists but only for CURTAIN WALLS (`_cwProjectionCache`). Walls, slabs, doors, columns, beams, roofs, furniture, etc. have **no projection cache** — each one re-projected on every neighbour's mutation. Generalising the existing CW cache to all element types closes this in a single contract amendment + ~1-day implementation. Pascal Editor's `dirty-node tracking` pattern is the same idea; PRYZM is one cache-generalisation away from matching it.

---

## §1 — The current pipeline (5-step trace, with line refs)

Sequence on a single `wall.create` dispatch:

```
1. CreateWallCommand.execute() → wallStore.add(wallData)
                                       ↓ emits
2. storeEventBus.emit({ elementType: 'wall', operation: 'create', elementId })
                                       ↓
3. ViewDependencyTracker._onStoreChange    [packages/views/.../ViewDependencyTracker.ts]
       → looks up affected views from _elementLevelMap[wallId]
       → marks views dirty (or falls into §G3-STALE-EVENT fallback marking
         ALL plan views dirty — the task #54 bug, now fixed)
                                       ↓
4. ViewDependencyTracker.flush()
       → for each dirty view: emit 'vd:projection-stale'
                                       ↓
5. PlanViewManager._onProjectionStale  [apps/editor/.../PlanViewManager.ts:507]
       → viewTechnicalDrawingCache.invalidate(viewId)   ◄── drops WHOLE drawing
       → activePlanDrawingRef.drawing = null
       → _ensureProjection(viewDef) → triggers a fresh EdgeProjectorService.project()
                                       ↓
6. EdgeProjectorService.project(viewDef)   [EdgeProjectorService.ts:1374]
       → NativeElementMeshExporter.exportForView(viewDef)  ◄── exports ALL elements
       → for each element group (1..N):
           • build THREE.EdgesGeometry from each mesh        (DIAG-EPS-01)
           • traverse + collect per-layer geometries         (DIAG-EPS-02)
           • mergeGeometries per layer                        (DIAG-EPS-03)
           • toDrawingSpace (camera transform)               (DIAG-EPS-04)
                                       ↓
7. drawing.addProjectionLines() per layer → Canvas2D renders the layers
```

**The key invariant violation**: step 5 drops the cached TechnicalDrawing wholesale, step 6 then re-projects EVERY element. So a 1-wall-added mutation pays the cost of N+1 element projections, not 1.

## §2 — Cost analysis from the user's runtime log

From the user's session (12 walls added in sequence):

| Walls in view | NME export | EdgeProjector groups processed | NME cache hit rate | LONGTASK |
|---|---|---|---|---|
| 1st add | 4 elements | 4 groups | 25% | 75 ms |
| 5th add | 8 elements | 8 groups | 17% | 50 ms |
| 9th add | 12 elements | 12 groups | 10% | varies |
| 12th add | 13 elements (incl. annotation) | 13 groups | 8% | ~80 ms |

Each `[EdgeProjectorService] §DIAG-EPS-01 edgesGeo group=...` line is a re-projection of a wall's edge geometry. **For a 100-wall building, every wall create costs 100× edge-geometry rebuild + 100× toDrawingSpace pass** — quadratic accumulation in a "draw one wall" workflow that should be constant-time.

The NME (NativeElementMeshExporter) cache (`§H2-NME-CACHE`) caches mesh-export results, but its hit rate degrades to ~10% because every wall geometry change invalidates the export cache for the level (NME caches by level snapshot, not per-element).

The `_cwProjectionCache` (lines 1167-1314 of EdgeProjectorService) successfully caches per-element projections for **curtain walls only** — by `(elementUUID, viewId, version)`. In projects without curtain walls (the user's case) it contributes zero hits.

## §3 — Pascal Editor's pattern for comparison

Pascal Editor (the upstream open-source project PRYZM is derived from — `github.com/pascalorg/editor`) is documented in its `CLAUDE.md` as using a **dirty-node tracking pattern**:

> "When data changes, affected nodes are marked dirty, and systems process them during the render loop using Three.js object references stored in a registry."

In Pascal:
- Each element type has its own React Three Fiber renderer component.
- `useScene` (Zustand store) holds nodes; mutating a node flags it dirty.
- A WallSystem / SlabSystem / etc. processes only DIRTY nodes per render frame.
- Three.js objects for unchanged nodes are reused via `useMemo` references stored in a registry.

**Net effect**: adding one wall touches only one Wall component's reconciliation. Unchanged walls don't re-render. Plan view updates are near-instant.

PRYZM-3's architecture has the same conceptual ingredients (`ViewDependencyTracker`, `_elementLevelMap`, the CW projection cache), but the projection step at the end of the pipeline collapses them all back to "rebuild the whole view." The dirty-tracking layer is doing its job; the **projection layer is not honouring element-level dirtiness**.

## §4 — Proposed PRYZM-3 architecture: per-element projection cache (generalise the CW pattern)

The fix has three pieces, mirroring the existing CW cache structure.

### §4.1 — Generalise `_cwProjectionCache` → `_elementProjectionCache`

Current shape (EdgeProjectorService.ts:1167-1310):
```ts
private _cwProjectionCache: Map<elementUUID, Map<viewId, {
  layers: Map<sublayerName, BufferGeometry>,
  version: number,
}>>
```

Proposed: rename + widen the type discriminator so walls / slabs / doors / columns / beams / roofs / furniture / handrails / plumbing all participate:

```ts
private _elementProjectionCache: Map<elementUUID, Map<viewId, {
  elementType: 'wall' | 'slab' | 'door' | 'window' | 'column' | 'beam'
             | 'curtainwall' | 'roof' | 'furniture' | 'handrail' | 'plumbing'
             | 'opening' | 'stair-railing' | 'stair-landing',
  layers: Map<sublayerName, BufferGeometry>,
  version: number,
}>>
```

The cache-lookup pattern at line 1517 (`_cwCacheIsValid` + `_getCwCached`) already exists — only the early branch on `elemType === 'curtainwall'` needs widening to any cacheable type.

### §4.2 — Add an element version stamp on every mutating command

Each element type's store needs a `version` field that increments on any mutation. The CW pattern (which uses a single `currentVer` per element) shows this already works.

Proposed canonical shape (added to all element data DTOs):
```ts
interface ElementVersionable {
  /** Monotonic per-element revision; ++1 on every mutation. */
  readonly version: number;
}
```

Concrete sites that need to bump version:
- `WallStore.add() / update() / removeOpening()` — bumps the wall's version + any openings'.
- `SlabStore.add() / update()`
- `DoorStore.add() / setOffset() / update()`
- `WindowStore.add() / setOffset() / update()`
- Similarly for ceiling/floor/column/beam/roof/furniture/handrail/plumbing/opening.

Cost: one new field on each DTO, one `version++` line on each mutating method. Minimal churn.

### §4.3 — Change `ViewTechnicalDrawingCache.invalidate(viewId)` semantics

Today: drops the whole TechnicalDrawing.

Proposed: drops only the **drawing assembly** (the merged-layers TechnicalDrawing object) but **preserves the underlying per-element projections**. On the next `EdgeProjectorService.project()` call:

```
for each element in NME.exportForView(viewDef):
    let projection = _elementProjectionCache.get(elementUUID, viewId, element.version);
    if (projection):
        cacheHits++
        reuse projection.layers — clone for the new TechnicalDrawing
    else:
        cacheMisses++
        compute fresh edges, store in cache, use them
assemble TechnicalDrawing from all element projections
```

This is exactly what the CW cache path does today (lines 1517-1536). Generalising to all elements turns the N-element re-projection into a 1-element re-projection.

### §4.4 — Expected performance

For the user's 100-wall scenario adding wall #101:
- Today: 101× edge-geometry rebuilds + 101× toDrawingSpace = ~500-1000 ms of plan-view work.
- After fix: 1× new wall edge-geometry rebuild + 100× cache lookups + 1× TechnicalDrawing reassemble = ~5-15 ms.

For element MUTATION (e.g. wall thickness change):
- Today: full N-element rebuild.
- After fix: 1× edge-geometry rebuild for the mutated wall + cache-hit on N-1 unchanged walls.

Element DELETE is symmetric: drop from cache + reassemble.

### §4.5 — Memory cost

Current CW cache: `MAX_CW_PROJECTION_CACHE = 5000` entries (line 1255). At ~5-10 KB per cached BufferGeometry × layers (typically 1-3 layers per element) × 100 elements × 1-3 views = ~3-30 MB peak. Bounded; acceptable for a desktop BIM editor.

The cache is already LRU-evicted (the CW code at lines 1255-1280); the same eviction policy applies.

## §5 — Required contract amendments

### §5.1 — C04 (Rendering & Scheduling)

Current C04 §3 implies whole-view re-render on mutation. **Amend §3 to introduce element-level dirty contract**:

> §3.4 — **Element-level dirty contract**. Every element data DTO carries a `version: number` that monotonically increases on every mutating command. Per-view projection caches are keyed by `(elementUUID, viewId, version)`. Stale projections are reused; mismatched versions trigger a per-element re-projection. `ViewTechnicalDrawingCache.invalidate(viewId)` MUST preserve per-element projection caches and drop only the drawing assembly. Whole-view rebuild is a degenerate case (e.g. view-definition change) and not the per-mutation path.

### §5.2 — C11 (Element Creation Pipeline)

Amend §6.2 (plan-view dirty propagation):

> §6.2.1 — **Per-element projection cache**. `EdgeProjectorService` MUST consult `_elementProjectionCache` by `(elementUUID, viewId, element.version)` before computing fresh edges for any cacheable element type. The CW cache (introduced in §C-CW-CACHE) is the canonical pattern; all element types in §6.2.0 (wall, slab, door, window, column, beam, roof, curtainwall, furniture, handrail, plumbing, opening, stair-railing, stair-landing) MUST participate. The cache is LRU-bounded at `MAX_PROJECTION_CACHE = 5000` entries; eviction is per-entry, not per-element.

> §6.2.2 — **Version-stamp invariant**. Every store mutation method (`add`, `update`, `removeOpening`, etc.) MUST increment the element's `version` field as part of the same Immer patch. Tests in C11 §10 are extended to verify that `wallStore.update(id, {...})` increments `version` and that `_elementProjectionCache.get(id, vid, oldVersion)` returns undefined after such a mutation.

### §5.3 — C10 (Performance & Observability)

Amend NFT (non-functional target) table:

> NFT-PV-1 — **Plan-view element-add latency**: ≤ 16 ms p95 from `store.add()` resolved to the new element's line visible on the Canvas2D plan, on a project with up to 500 elements. Measured by the `pryzm.planview.element_add` OTel span; today's value is ~50-100 ms degrading to ~500 ms+ at 100 walls. Post-fix target is invariant to project size.

## §6 — Implementation plan (sequenced)

**Day 1 — Wide the cache** (`EdgeProjectorService.ts`):
- Rename `_cwProjectionCache` → `_elementProjectionCache`. Update private field types + lookup methods.
- Update `_cwCacheIsValid(elementId, viewId, version)` → `_elementCacheIsValid(elementId, viewId, version)`.
- Replace the `elemType === 'curtainwall'` early-branch at line 1517 with `if (CACHEABLE_ELEMENT_TYPES.has(elemType))` where the set covers all 14 element types listed in §4.1.
- Update telemetry: `cwGroups` / `cwCached` → `cachedGroups` / `cachedElements`. Preserve `cacheHits` / `cacheMisses` / `hitRate`.
- Verify CW behaviour is unchanged (regression-test the 5000-entry LRU + the per-elementUUID cleanup paths at lines 1235-1280).

**Day 2 — Version-stamp all stores**:
- Add `version: number` to `WallData`, `SlabData`, `DoorData`, `WindowData`, `ColumnData`, `BeamData`, `RoofData`, `FurnitureData`, `HandrailData`, `PlumbingData`, `OpeningData`, `StairRailingConfig`, `StairLandingEntity` (matches the audit § set).
- Each store's `add()` initialises `version = 1`; each `update()`/`set*()` increments it via the Immer patch.
- Add `version` to the snapshot serialisation (already structurally compatible since it's just an extra number field on each element).

**Day 3 — Change ViewTechnicalDrawingCache.invalidate(viewId) semantics**:
- The method currently drops the whole drawing. Change to: drop the drawing assembly, but the per-element cache survives.
- `EdgeProjectorService.project()` then reads each NME-exported group, queries `_elementProjectionCache.get(elementUUID, viewId, element.version)`, and either reuses or re-projects.

**Day 4 — Tests + observability**:
- Unit tests: cache hit/miss for each element type, version bump on each store mutation, LRU eviction at the boundary.
- OTel spans: `pryzm.planview.element_add` measuring store→drawing latency.
- Re-baseline NFT-PV-1.

**Total**: ~4 days of focused engineering work. Architecturally additive (existing CW cache pattern unchanged, just wider).

## §7 — Risk assessment

| Risk | Mitigation |
|---|---|
| Cache stale after element mutation that doesn't bump version | Version-bump invariant enforced by test in every store's `update()`; failure is loud (test red, not silent corruption). |
| LRU eviction during heavy edit thrashes the cache | LRU bound 5000 entries × 14 types = ~70k cached projections capacity → exceeds any realistic project. Bound is already in CW path. |
| Mutation-during-projection race (the wall changes between cache lookup and TechnicalDrawing assembly) | The cache key includes `version`; a mid-flight mutation produces a fresh version → next projection cycle misses → re-projects. No data loss; one frame of latency. |
| Cache memory growth | Per-entry size is bounded by the element's edge count (~24 verts for a typical wall). 10k entries × 1 KB = 10 MB peak. Acceptable. |
| Element types not in the cacheable set (annotations, dimensions, IFC fragments) | These already bypass `_cwProjectionCache` today; they continue to follow the IFC/native legacy path at lines 1397-1428. No change. |

## §8 — Comparison to Pascal in one sentence

Pascal's "dirty-node tracking" treats every node's renderer as the dirty unit; PRYZM-3 today treats every VIEW as the dirty unit but caches projections per ELEMENT only for curtain walls. Generalising the existing CW cache to all element types brings PRYZM-3 to architectural parity with Pascal's pattern — without adopting React Three Fiber or restructuring the renderer.

## §9 — Open question

The user's evidence shows ~80 ms LONGTASKs per wall create at only 12 walls in view. The proposed fix targets a constant-time per-mutation cost (~5-15 ms). If a downstream consumer (e.g. `HiddenLineRemoval.v1 pass`, line 302 in the log: "1520/4460 segments removed") becomes the new bottleneck after this fix lands, that's a separate but related optimization (HLR could become incremental too, by intersecting only the dirty element's segments against neighbours instead of the full N×N pass).

---

**End of audit.** This document is the canonical reference for the proposed redesign. The fix is implementable; the contract amendments are minimal and additive; the pattern is already in the codebase (CW cache) — we just need to widen its scope. Ready for review / approval / sprint scheduling.
