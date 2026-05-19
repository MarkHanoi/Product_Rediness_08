import { WallData } from '@pryzm/geometry-wall';
import { SlabStore } from '@pryzm/geometry-slab';
import { SlabData } from '@pryzm/geometry-slab';
import { HostReferenceEdge, SketchEdge } from '@pryzm/geometry-slab';
import { WallFaceResolver } from './WallFaceResolver';
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
 * - §03 Single Source of Truth: tracker reads stores read-only and
 *   writes only through the command layer.
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
        window.addEventListener('bim-slab-added', (e: any) => {
            if (e.detail?.slab) this.registerSlab(e.detail.slab);
        });

        window.addEventListener('bim-slab-updated', (e: any) => {
            if (e.detail?.slab) this.registerSlab(e.detail.slab);
        });

        window.addEventListener('bim-slab-removed', (e: any) => {
            if (e.detail?.slabId) this.unregisterSlab(e.detail.slabId);
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
     */
    private onWallUpdated(wallId: string): void {
        const dependents = this.graph.get(wallId);
        if (!dependents || dependents.size === 0) return;

        dependents.forEach(slabId => {
            this.slabStore.triggerRebuild(slabId);
        });
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
