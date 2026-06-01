# Research — pascalorg/editor (Pascal Editor) ↔ PRYZM 3

> **Stamp**: 2026-05-25 · **Source**: https://github.com/pascalorg/editor (README + repo page, fetched 2026-05-25). **Status**: reference research — not a contract. PRYZM already cites pascalorg as the alignment target for undo (ADR-051 "pascalorg-aligned"); this note widens that comparison to architecture / orchestration / performance / robustness and extracts actionable keys.
> **Caveat**: derived from the public README/repo page; "not mentioned" ≠ "absent". The repo's `wiki/architecture/` folder is the deeper source for a follow-up read.

## §1 — What Pascal Editor is

A browser 3D architectural editor. **Turborepo monorepo**, 3 packages:
- **`@pascal-app/core`** — Zod node schemas, Zustand scene state, geometry **systems**, spatial queries, event bus.
- **`@pascal-app/viewer`** — React-Three-Fiber rendering (Three.js **WebGPU**), camera/controls, level/scan/guide visibility.
- **`apps/editor`** — Next.js UI, tools, selection.

Stack: React 19, Next 16, Three.js (WebGPU), R3F + Drei, **Zustand + Zundo** (temporal undo), **Zod**, **three-bvh-csg**, Turborepo, Bun.

Core model: a **flat node dictionary** `Record<id, Node>`; `BaseNode {id, type, parentId, visible, metadata}`; hierarchy Site→Building→Level→{Wall,Slab,Ceiling,Roof,Zone,Scan,Guide}→(Door/Window/Light/Furniture attached). Three Zustand stores: `useScene` (data + IndexedDB persist + Zundo 50-step undo), `useViewer` (selection/display modes), `useEditor` (tools/panels). **Systems** are R3F `useFrame` components that process a **dirty-node set** → regenerate geometry next frame (WallSystem does mitering + CSG cutouts, SlabSystem, etc.). A **Scene Registry** maps `id → Object3D` (+ `byType` sets) for O(1) lookup with **no scene-graph traversal**. Typed **mitt** event bus (`wall:click`, `item:enter`, `grid:click`) with `NodeEvent{node,position,normal,stopPropagation}`. Spatial placement via `SpatialGridManager` (`canPlaceOnFloor/Wall`, `getSlabElevationAt`). Client-only (no CRDT/sync).

## §2 — Pascal ↔ PRYZM mapping

| Concern | Pascal Editor | PRYZM 3 | Verdict |
|---|---|---|---|
| Monorepo + layered packages | Turborepo, 3 packages | pnpm, 8-layer (L0…L7.5) | ✅ aligned (PRYZM stricter — CI boundaries) |
| Schemas | Zod nodes | Zod L0 (`packages/schemas`, P5 pure) | ✅ aligned |
| State | 3 Zustand stores | many stores + L1/legacy split | ⚠ PRYZM fragmented (the undo pain) |
| Undo | **Zundo temporal middleware** on the store (automatic, 50-step) | `performUndoRedo` over ring-buffer + legacy CM (OI-054) | ⚠ **Pascal is the target** — validates ADR-051 |
| Mutation path | direct `updateNode()` store writes | **command bus only (P6)** + patches | ✅ **PRYZM ahead** (undo/sync/AI/remote sources) |
| Rendering | R3F `NodeRenderer` type-dispatch | per-element builders + CEB fan-out | ≈ parity (PRYZM more granular) |
| Frame loop | systems in `useFrame` | single rAF FrameScheduler (P3) | ✅ aligned (same dirty→build idea) |
| Dirty tracking | `dirtyNodes` set, systems regen | WallRebuildCoordinator + per-type flush | ⚠ Pascal **uniform**; PRYZM per-type (more code) |
| **id → object lookup** | **Scene Registry `Map<id,Object3D>` + byType, NO traverse** | `scene.traverse` + `userData.id`/`levelId` match (O(n)) | ❌ **GAP — key takeaway (§3.1)** |
| Openings CSG | three-bvh-csg cutouts | CSG single-volume (#96, wall-opening seam) | ✅ aligned (validates the choice) |
| Spatial placement | SpatialGridManager | `wallOccupancyStore`, `spatial-index` (SpatialGrid/BVH), SL-1/2/3 | ✅ PRYZM ahead (semantic services) |
| GPU instancing | not mentioned | `InstancedElementRenderer` + WallInstanceBridge | ✅ **PRYZM ahead** |
| Multi-view (plan/elev/section) | 3D-focused | EdgeProjector + projection cache | ✅ **PRYZM ahead** |
| Collaboration | none (client-only) | Yjs CRDT, explicit conflicts (P8) | ✅ **PRYZM ahead** |
| IFC / interop | "not a traditional BIM engine" | IFC4/Revit/DXF/Rhino | ✅ **PRYZM ahead** |
| Observability | — | OpenTelemetry spans (P8) | ✅ **PRYZM ahead** |

## §3 — Actionable keys for PRYZM

### §3.1 — KEY: a Scene Registry to replace `scene.traverse` (perf + robustness) — **highest-value takeaway**

Pascal keeps `Map<id → Object3D>` + `byType: { wall: Set<id>, … }` and **never traverses the scene graph** for lookup/visibility/selection. PRYZM's visibility ops (the `applyLevelVisibility` / `applyIsolate` / re-apply / reset I just hardened in §INSTANCED-ISOLATE-FIX) and selection all do **full `scene.traverse` with `userData` matching** — O(n) per operation, and they break for instanced aggregates that lack a per-element `userData.id` (the exact bug I patched). A registry (`id → Object3D`, `byType`, **and `byLevel: Map<levelId, Set<id>>`**) would make hide/isolate/visibility **O(k)** over the affected set, eliminate the traverse, and make the instanced-aggregate case natural (the group is registered under its level). **Recommendation:** introduce a SceneRegistry (PRYZM partially has the pieces — `elementRegistry` semantic + `ViewDependencyTracker._elementLevelMap` + `InstancedElementRenderer._elements`) and route `ProjectVisibilitySection` through it instead of `scene.traverse`. Raise as an OI/ADR; it directly improves C16 CA-DOCTRINE-L (level visibility) and the perf NFTs.

### §3.2 — KEY: undo end-state validation (ADR-051)

Pascal's undo is **one Zustand store + Zundo temporal middleware (50-step), automatic on every mutation** — exactly the single-source-of-truth model ADR-051 proposes. PRYZM's OI-054 pain (trigger divergence, 3 store layers, dual backends) is precisely what this avoids. **Recommendation:** keep converging undo onto the ADR-051 single-store + temporal-middleware end-state; Pascal is the working proof. No new work now — this is confirmation the direction is right.

### §3.3 — KEY: uniform dirty-node → systems frame pass

Pascal runs **one dirty-node set** drained by a uniform set of `useFrame` systems (Wall/Slab/Ceiling/…). PRYZM has many bespoke per-element rebuild coordinators (WallRebuildCoordinator, the per-builder queues, BatchCoordinator). A **uniform "dirty element → typed system" frame pass** (on the existing FrameScheduler, P3) could fold these into one orchestrator, reducing the per-type duplication and the timing-implicit ordering (e.g. the OI-057 wall-join fragility). **Recommendation:** longer-term refactor; capture as a design note, don't disrupt the working pipeline now.

### §3.4 — Validations (PRYZM directions confirmed by an independent build)

`three-bvh-csg` for wall openings (PRYZM #96 CSG ✅), spatial grid for placement (`spatial-index` ✅), flat id-keyed stores + Zod schemas (✅), WebGPU Three.js (✅), systems-on-frame (FrameScheduler ✅). **Do not regress** the places PRYZM is ahead (command-bus-only mutation P6, CRDT, GPU instancing, multi-view projection, IFC interop, OTel) — Pascal omits all of these, so it is not a reference for them.

## §4 — Recommended follow-ups (backlog, not started)

1. **OI — SceneRegistry for visibility/selection** (§3.1): add `byLevel`/`byType`/`id→Object3D` registry; route `ProjectVisibilitySection` + selection off `scene.traverse`. Perf (NFT) + robustness (instanced aggregates). **Highest value.**
2. Read `wiki/architecture/` in the pascal repo for deeper detail (systems lifecycle, registry API) before acting on §3.1/§3.3.
3. Keep undo convergence on ADR-051 (§3.2) — no change, confirmation.

## §5 — Cross-references

ADR-051 (undo single-source — pascalorg-aligned), C16 §6 (level visibility / §INSTANCED-ISOLATE-FIX — the registry would supersede the traverse), C04 (rendering/scheduling), `spatial-index` (SpatialGrid/BVH ≈ SpatialGridManager), memory `instanced-aggregate-level-visibility` (the traverse-based bug the registry fixes structurally).
