import { WallData } from '@pryzm/geometry-wall';
import { SlabStore } from '@pryzm/geometry-slab';
import { SlabData } from '@pryzm/geometry-slab';
import { HostReferenceEdge, SketchEdge } from '@pryzm/geometry-slab';
import { WallFaceResolver } from './WallFaceResolver';
// §FIX-SLAB-POLYGON-WRITEBACK — relative import, NOT the package barrel: the
// builder never imports this tracker, so the edge is acyclic (§SCC rule).
import { SlabFragmentBuilder } from './SlabFragmentBuilder';
import { polygonBoundingBox } from './SlabGeomUtils';
import { DegradeSlabSketchCommand } from '@pryzm/command-registry';
import { CommandManager } from '@pryzm/command-registry';

type WallEventType = 'add' | 'update' | 'remove';
type WallStoreRef = { subscribe: (cb: (e: WallEventType, w: WallData) => void) => () => void };

/**
 * CommandManagerRef
 *
 * FIX-7 §01 §2.1: SlabDependencyTracker must execute sketch-degradation
 * through the command layer (not by calling slabStore.update() directly).
 *
 * A ref object is used rather than passing commandManager directly so that
 * the tracker can be instantiated in EngineBootstrap before commandManager
 * is constructed, while still resolving the live instance at event-fire time.
 */
export interface CommandManagerRef {
    current: CommandManager | undefined;
}

/**
 * §FIX-SLAB-POLYGON-WRITEBACK — are two rings the same closed boundary?
 *
 * Cyclic comparison: true iff `a` matches `b` under SOME rotation of the start
 * vertex, every vertex within `eps`. Deliberately NOT reflection-invariant: a
 * winding flip (an inverting move) is a real change and must be persisted so
 * the record keeps agreeing with the mesh. Pure; O(n·k) for k anchor candidates
 * (n is a handful for any real slab).
 */
function ringsEqualCyclic(
    a: { x: number; y: number }[],
    b: { x: number; y: number }[],
    eps = 1e-9,
): boolean {
    if (a.length !== b.length) return false;
    const n = a.length;
    if (n === 0) return true;
    const first = a[0]!;
    for (let k = 0; k < n; k++) {
        const cand = b[k]!;
        if (Math.abs(first.x - cand.x) >= eps || Math.abs(first.y - cand.y) >= eps) continue;
        let all = true;
        for (let i = 1; i < n; i++) {
            const p = a[i]!;
            const q = b[(k + i) % n]!;
            if (Math.abs(p.x - q.x) >= eps || Math.abs(p.y - q.y) >= eps) { all = false; break; }
        }
        if (all) return true;
    }
    return false;
}

/**
 * SlabDependencyTracker
 *
 * Maintains a live dependency graph: wallId → Set<slabId>.
 *
 * Responsibilities:
 * 1. Register dependencies when slabs with HostReferenceEdges are added or updated.
 * 2. On wall update: trigger geometry re-projection for all dependent slabs.
 * 3. On wall removal: degrade any HostReferenceEdge referencing the deleted wall
 *    to a FreeLineEdge using the last known fallback geometry, through the
 *    command layer (DegradeSlabSketchCommand) so the operation is undoable.
 *
 * Contract compliance:
 * - §01 §2.1 Command-First FIX-7: onWallRemoved() now executes
 *   DegradeSlabSketchCommand via commandManager.execute() instead of
 *   calling slabStore.update() directly. Sketch degradation is now undoable:
 *   Ctrl+Z on a wall deletion also restores the slab's HostReferenceEdges.
 * - §02 Projection-Only: Re-projections triggered via slabStore.triggerRebuild().
 * - §03 Single Source of Truth — the tracker reads stores read-only and has
 *   exactly TWO write shapes, distinguished by what the write is:
 *     · DEGRADATION (wall removed) is INFORMATION-LOSING — a hostReference
 *       becomes a freeLine and nothing can re-derive it back. C79 §4.2 therefore
 *       mandates an undoable command (DegradeSlabSketchCommand, above).
 *     · POLYGON RE-PROJECTION (wall moved) is INFORMATION-NEUTRAL — the polygon
 *       is DERIVED state (SlabTypes.ts: with a sketch present, geometry is
 *       resolved from the sketch at projection time; the polygon mirrors it),
 *       deterministically re-derivable per C79 §5.1. reprojectStoredPolygon()
 *       persists it through slabStore.update() as a STRUCTURAL CASCADE — the
 *       same documented pattern as SlabWallConnectivityService ("§01 §2.1
 *       structural cascade") — deliberately NOT a command: a derived write on
 *       the undo stack would let one Ctrl+Z restore the PRE-move polygon
 *       against POST-move walls, recreating the drawn≠recorded divergence the
 *       write-back exists to remove. Undo of the WALL move re-fires this
 *       cascade and re-derives the old ring exactly (§5.1 determinism), so the
 *       cascade is undo-NEUTRAL by construction. P6 ("no direct store writes
 *       from UI code") is not in play: this is engine propagation, not UI.
 */
export class SlabDependencyTracker {
    /** wallId → slabIds that reference it */
    private graph = new Map<string, Set<string>>();
    private unsubscribeWall?: () => void;

    constructor(
        private slabStore: SlabStore,
        wallStore: WallStoreRef,
        private commandManagerRef: CommandManagerRef
    ) {
        // §FIX-SLAB-TRACKER-EVENT-SHAPE (GR-12 · C78 §6) —────────────────────
        // These three listeners guarded on `e.detail.slab` / `e.detail.slabId`,
        // which the store HAS NEVER SENT. `SlabStore.emit` fires all three with
        // the F.events.18 payload `{ id }` (event-bus/src/catalog.ts:95-97), so
        // every guard was `undefined` and `registerSlab()` was UNREACHABLE from
        // the event path. Only `bootstrap()` (initTools.ts:828, run ONCE at
        // wiring) ever filled the dependency graph — so any slab created OR
        // LOADED after boot was invisible to it, and moving its bounding wall
        // produced ZERO rebuilds. Measured by check-move-propagation: the
        // re-projection maths is correct and was simply never reached.
        //
        // `initBuilders.ts:367-383` was fixed for this EXACT mismatch
        // (§DOM-EVENT-LISTENER-AUDIT-2026-05-18); these two trackers were not.
        //
        // Both shapes are accepted deliberately: `{ id }` is what the store
        // sends today, and an object payload is tolerated so that a future or
        // out-of-tree emitter passing the record cannot silently re-break this.
        // The lookup is the same `slabStore.getById` this class already uses at
        // its wall-rebuild path, so no new reachability assumption is added.
        const slabFromDetail = (detail: any): SlabData | undefined => {
            if (detail?.slab) return detail.slab as SlabData;
            const id: string | undefined = detail?.id ?? detail?.slabId;
            return id ? this.slabStore.getById(id) : undefined;
        };

        window.addEventListener('bim-slab-added', (e: any) => {
            const slab = slabFromDetail(e.detail);
            if (slab) this.registerSlab(slab);
        });

        window.addEventListener('bim-slab-updated', (e: any) => {
            const slab = slabFromDetail(e.detail);
            if (slab) this.registerSlab(slab);
        });

        window.addEventListener('bim-slab-removed', (e: any) => {
            // Removal cannot look the record up — it is already gone from the
            // store by the time the event fires — so take the id directly.
            const slabId: string | undefined = e.detail?.slabId ?? e.detail?.id;
            if (slabId) this.unregisterSlab(slabId);
        });

        this.unsubscribeWall = wallStore.subscribe((event, wall) => {
            if (event === 'update') {
                this.onWallUpdated(wall.id);
            } else if (event === 'remove') {
                this.onWallRemoved(wall);
            }
        });
    }

    /** Register all HostReferenceEdges of a slab into the dependency graph. */
    private registerSlab(slab: SlabData): void {
        if (!slab.sketch) return;

        const allLoops = [slab.sketch.outerLoop, ...(slab.sketch.innerLoops ?? [])];

        for (const loop of allLoops) {
            for (const edge of loop.edges) {
                if (edge.type === 'hostReference') {
                    this.addDep(edge.hostId, slab.id);
                }
            }
        }
    }

    /** Remove all dependency graph entries for a slab. */
    private unregisterSlab(slabId: string): void {
        this.graph.forEach((slabIds) => slabIds.delete(slabId));
    }

    private addDep(wallId: string, slabId: string): void {
        if (!this.graph.has(wallId)) this.graph.set(wallId, new Set());
        this.graph.get(wallId)!.add(slabId);
    }

    /**
     * Wall was updated — re-project all slabs that reference it.
     * The builder will call WallFaceResolver.resolve() fresh on the next rebuild.
     *
     * §FIX-SLAB-POLYGON-WRITEBACK: the stored record is re-projected FIRST, then
     * the builder is signalled — so any consumer reacting to either event reads
     * a record that already agrees with the line the mesh will be drawn on.
     * When the ring actually changed, the store update itself also emits
     * `bim-slab-updated`, so the mesh is rebuilt twice per committed wall move
     * (once per event). Accepted: both builds are idempotent projections of the
     * same record, and the alternative — suppressing one of the two emissions —
     * would be a parallel mutation path.
     */
    private onWallUpdated(wallId: string): void {
        const dependents = this.graph.get(wallId);
        if (!dependents || dependents.size === 0) return;

        dependents.forEach(slabId => {
            this.reprojectStoredPolygon(slabId);
            this.slabStore.triggerRebuild(slabId);
        });
    }

    /**
     * §FIX-SLAB-POLYGON-WRITEBACK (GR-12 · C79 §5.1 · check-move-propagation A2,
     * 2026-08-13) — persist the re-derived ring into `SlabData.polygon`.
     *
     * THE DEFECT THIS CLOSES, as the gate measured it: after a wall move, the
     * builder draws the slab from `data.sketch` (createSlabMeshWithEdges prefers
     * the sketch — 36.000 m² after a 2 m move) while `SlabData.polygon` kept the
     * authoring-time ring (24.000 m²). Every consumer that reads the POLYGON —
     * root.userData.polygon, schedules, area take-off, IFC/DXF export, and any
     * downstream region detection — saw the PRE-move shape. "It follows" was
     * true of the picture and false of the record.
     *
     * THE FIX: the SAME production resolution the mesh path uses
     * (SlabFragmentBuilder.resolveLoop — never a re-composition, so record and
     * mesh cannot diverge), written back through the store's sanctioned
     * full-replacement update(). Width/depth AABB metadata is kept in sync,
     * mirroring UpdateSlabPolygonCommand §03 — the sanctioned polygon-write
     * path this cascade is modelled on. Why a store write and not a command:
     * see §03 in the class header (derived state; a command here would make
     * Ctrl+Z itself recreate the divergence).
     *
     * C79 §5.2 states, honestly: this method distinguishes THREE of the five
     * recomputation outcomes at its own boundary — `preserved` (ring unchanged:
     * no write), a changed ring (`resized`/`regenerated`, persisted; nothing on
     * the move path can yet tell those two apart), and `undetermined` (resolution
     * failed: no write, audible warn — NEVER silently collapsed into `preserved`,
     * per §5.2.1). It does NOT implement §5.2's reporting channel — no value is
     * returned to a caller and `conflicted` has no refusal here (an inverting
     * move persists the winding-flipped ring the mesh also draws, keeping
     * record≡mesh; the §5.2.2 refusal belongs at resolveLoop, where BOTH
     * consumers would inherit it). That design remains the open
     * check-move-propagation A4 finding, owned by C79 §5's implementers.
     */
    private reprojectStoredPolygon(slabId: string): void {
        const slab = this.slabStore.getById(slabId);
        // No sketch → the polygon IS the authored boundary; nothing to re-derive.
        if (!slab?.sketch) return;

        const ring = SlabFragmentBuilder.resolveLoop(slab.sketch.outerLoop);
        if (!ring || ring.length < 3) {
            // C79 §5.2 `undetermined` — a host failed to resolve (resolveLoop has
            // already warned per-edge). §5.2.1: not silently `preserved` — say so,
            // and keep the last successfully derived ring rather than writing a
            // fiction over it (§2.3: no answer beats a wrong answer).
            console.warn(
                `[SlabDependencyTracker] §FIX-SLAB-POLYGON-WRITEBACK slab "${slabId}": ` +
                `re-derivation after a wall move is UNDETERMINED (sketch outer loop did ` +
                `not resolve). SlabData.polygon was NOT updated and still holds the last ` +
                `successfully derived ring. (C79 §5.2.1 — this is not 'preserved'.)`
            );
            return;
        }

        // `preserved` — re-derived and nothing moved (within 1e-9 m, far below any
        // real wall move). No write: an update event claiming a change that did not
        // happen would be noise to every diff-based subscriber (C72 §3.1).
        //
        // The comparison is CYCLIC: the creation-time ring (SlabRegionTracer) and the
        // re-derived ring (SketchLoopIntersector, via resolveLoop) walk the SAME
        // boundary but may start at a DIFFERENT vertex — measured on the reference
        // fixture: [(0,0),(6,0),(6,4),(0,4)] stored vs [(6,0),(6,4),(0,4),(0,0)]
        // re-derived, over a ZERO move. A per-index compare called that "changed" and
        // fired a spurious update (caught by the §4 `preserved` test). A rotation is
        // the same boundary; a WINDING FLIP is not — an inverted cycle never matches
        // any rotation of the original, so an inverting move is still persisted and
        // the record keeps agreeing with what the mesh draws.
        if (slab.polygon && ringsEqualCyclic(ring, slab.polygon)) return;

        // Full-replacement update through the store's sanctioned path (§01 §3.4):
        // clone the frozen record, swap the derived fields, hand it back whole.
        const next = structuredClone(slab) as SlabData;
        next.polygon = ring;
        const { width, depth } = polygonBoundingBox(ring);
        next.width = parseFloat(width.toFixed(6));
        next.depth = parseFloat(depth.toFixed(6));
        this.slabStore.update(slabId, next);
    }

    /**
     * Wall was removed — degrade any HostReferenceEdge referencing it to a
     * FreeLineEdge using the last known fallback geometry.
     *
     * FIX-7 §01 §2.1: Instead of calling slabStore.update() directly (which
     * bypassed the command layer and made the degradation non-undoable), this
     * method now constructs a DegradeSlabSketchCommand for each affected slab
     * and executes it via commandManager.execute().
     *
     * Result: Ctrl+Z on a wall deletion now also restores the slab's
     * HostReferenceEdges (the DegradeSlabSketchCommand.undo() snapshots the
     * pre-degradation SlabData and re-applies it on undo).
     *
     * Fallback: If commandManager is not yet available (should never happen in
     * normal operation since this event fires only after EngineBootstrap wires
     * commandManager), we fall back to the direct store update and log a warning
     * so the gap is immediately visible.
     */
    private onWallRemoved(wall: WallData): void {
        const dependents = this.graph.get(wall.id);
        if (!dependents || dependents.size === 0) return;

        dependents.forEach(slabId => {
            const slab = this.slabStore.getById(slabId);
            if (!slab || !slab.sketch) return;

            let changed = false;
            const degradeLoop = (edges: SketchEdge[]): SketchEdge[] =>
                edges.map(edge => {
                    if (edge.type !== 'hostReference' || edge.hostId !== wall.id) return edge;
                    const freeEdge = WallFaceResolver.degrade(edge as HostReferenceEdge);
                    if (!freeEdge) return edge;
                    changed = true;
                    return freeEdge;
                });

            const nextSketch = {
                outerLoop: { edges: degradeLoop(slab.sketch.outerLoop.edges) },
                innerLoops: slab.sketch.innerLoops?.map(loop => ({
                    edges: degradeLoop(loop.edges)
                }))
            };

            if (!changed) return;

            const degradedSlab = { ...slab, sketch: nextSketch } as SlabData;

            const cm = this.commandManagerRef.current;
            if (!cm) {
                console.warn(
                    '[SlabDependencyTracker] §01 §2.1 FIX-7: commandManager not yet available. ' +
                    'Falling back to direct slabStore.update() for sketch degradation on wall removal. ' +
                    'This degradation will NOT be undoable. This should never happen in normal operation.'
                );
                this.slabStore.update(slabId, degradedSlab);
                return;
            }

            const cmd = new DegradeSlabSketchCommand({
                slabId,
                degradedSlab,
                removedWallId: wall.id,
            });

            const validation = cmd.canExecute(cm.getContext());
            if (!validation.ok) {
                console.warn(
                    `[SlabDependencyTracker] DegradeSlabSketchCommand.canExecute() failed ` +
                    `for slab "${slabId}": ${validation.reason}`
                );
                return;
            }

            cm.execute(cmd);
        });

        this.graph.delete(wall.id);
    }

    /** Build an initial dependency graph snapshot from all existing slabs. */
    bootstrap(): void {
        const slabs = this.slabStore.getAll();
        slabs.forEach(slab => this.registerSlab(slab));
    }

    dispose(): void {
        this.unsubscribeWall?.();
    }
}
