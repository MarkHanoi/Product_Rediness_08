import { WallData } from '@pryzm/geometry-wall';
import { SlabStore } from '@pryzm/geometry-slab';
import { SlabData } from '@pryzm/geometry-slab';
import { HostReferenceEdge, SketchEdge } from '@pryzm/geometry-slab';
import { WallFaceResolver } from './WallFaceResolver';
// §FIX-SLAB-POLYGON-WRITEBACK — relative import, NOT the package barrel: the
// builder never imports this tracker, so the edge is acyclic (§SCC rule).
import { SlabFragmentBuilder } from './SlabFragmentBuilder';
import { polygonBoundingBox } from './SlabGeomUtils';
// §C79-5.2-SLAB-STATES — the five-state reporting channel. `ringsEqualCyclic`
// moved into that module UNCHANGED so the `preserved` VERDICT and the
// write-back SUPPRESSION are decided by one predicate: two copies could report
// "preserved" while persisting a change, or the reverse.
import {
    classifySlabRecompute,
    type SlabRecomputeVerdict,
} from './slabRecomputeVerdict';
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
    private onWallUpdated(wallId: string): SlabRecomputeVerdict[] {
        const dependents = this.graph.get(wallId);
        if (!dependents || dependents.size === 0) return [];

        const verdicts: SlabRecomputeVerdict[] = [];
        dependents.forEach(slabId => {
            const verdict = this.reprojectStoredPolygon(slabId);
            if (verdict) verdicts.push(verdict);
            this.slabStore.triggerRebuild(slabId);
        });
        return verdicts;
    }

    /**
     * §C79-5.2-SLAB-STATES — re-derive every slab bounded by `wallId` and REPORT
     * one of C79 §5.2's five states per slab.
     *
     * This is the public entry point the move path did not have. Before it,
     * check-move-propagation A4 measured the whole chain as stateless —
     * *"SlabStore.triggerRebuild → void, SlabDependencyTracker.onWallUpdated →
     * void, SlabFragmentBuilder.resolveLoop → a bare ring | null,
     * WallFaceResolver.resolveOrFallback → Segment2D | null"* — so no caller
     * could tell a slab that followed from one that had nothing to follow.
     *
     * Identical in effect to the wall-store subscription: the subscription calls
     * this same method, so the reported verdict is the one the live path
     * produced, never a re-run under different rules.
     */
    recomputeForWall(wallId: string): SlabRecomputeVerdict[] {
        return this.onWallUpdated(wallId);
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
     * §C79-5.2-SLAB-STATES (2026-08-14) — THIS METHOD NOW REPORTS A VERDICT.
     *
     * The header used to end: *"It does NOT implement §5.2's reporting channel —
     * no value is returned to a caller."* That is what
     * check-move-propagation A4 measured, and it is what changes here. The
     * method returns exactly one of C79 §5.2's five states, with the reason
     * (a C78 §8.1 member), the per-edge outcomes (§5.3) and BOTH area numbers
     * (§5.2.2 / C73 §4). `classifySlabRecompute` is the pure decision; this
     * method is the one that holds the record and the store.
     *
     * WHICH FOUR ARE REACHABLE FROM A WALL MOVE, and which one is not, is stated
     * in `slabRecomputeVerdict.ts`'s header rather than implied here.
     *
     * NOTHING THAT WAS WRITTEN BEFORE IS WRITTEN DIFFERENTLY. The write rule is
     * now stated in the verdict's own terms — persist iff the ring was re-derived
     * from LIVE walls and the verdict is not `preserved` — which is the same
     * decision the previous `ringsEqualCyclic` guard made, plus one refusal it
     * made only by accident: a ring assembled from a STALE FALLBACK is never
     * written over the record, because a memory is not a measurement.
     *
     * `conflicted` is REPORTED, and the derived ring is still persisted. That is
     * deliberate and is not a §5.2.2 breach: §5.2.2 forbids resolving a conflict
     * by SUBSTITUTING a value that is not the derived one, and the derived ring
     * is exactly what is stored — record ≡ mesh, the A2 property. Refusing the
     * write here would put the record back out of step with the picture, which
     * is the defect A2 closed. The refusal owed to the USER is the surface C79
     * §10.6 names as absent; a `console.warn` is a developer trace and IS NOT a
     * user-facing message. That surface is NOT claimed closed by this change.
     *
     * @returns the verdict, or `undefined` for a slab with no sketch — nothing
     *          was re-derived, which is a different fact from every state below.
     */
    private reprojectStoredPolygon(slabId: string): SlabRecomputeVerdict | undefined {
        const slab = this.slabStore.getById(slabId);
        // No sketch → the polygon IS the authored boundary; nothing to re-derive.
        if (!slab?.sketch) return undefined;

        // THE production resolution, with per-edge provenance. Same ring the mesh
        // path draws from — never a re-composition, so record and mesh cannot
        // diverge (C79 §0/§7.4).
        const resolution = SlabFragmentBuilder.resolveLoopVerdict(slab.sketch.outerLoop);
        const verdict = classifySlabRecompute({
            slabId,
            previousRing: slab.polygon,
            resolution,
        });

        const ring = resolution.ring;
        // The write rule. `fullyLive` is what makes the ring a MEASUREMENT: a
        // fallback-sourced ring is the authoring-time memory kept per §4.3, and
        // writing it back would launder a stale value into the record as if it
        // had been re-derived.
        //
        // The `preserved` half of the rule is CYCLIC (inside `ringsEqualCyclic`):
        // the creation-time ring (SlabRegionTracer) and the re-derived ring
        // (SketchLoopIntersector) walk the SAME boundary but may start at a
        // DIFFERENT vertex — measured on the reference fixture:
        // [(0,0),(6,0),(6,4),(0,4)] stored vs [(6,0),(6,4),(0,4),(0,0)] re-derived,
        // over a ZERO move. A per-index compare called that "changed" and fired a
        // spurious update. A rotation is the same boundary; a WINDING FLIP is not,
        // so an inverting move is still persisted and the record keeps agreeing
        // with what the mesh draws.
        const writable = resolution.fullyLive && !!ring && ring.length >= 3;
        if (writable && verdict.state !== 'preserved') {
            // Full-replacement update through the store's sanctioned path (§01 §3.4):
            // clone the frozen record, swap the derived fields, hand it back whole.
            const next = structuredClone(slab) as SlabData;
            next.polygon = ring!;
            const { width, depth } = polygonBoundingBox(ring!);
            next.width = parseFloat(width.toFixed(6));
            next.depth = parseFloat(depth.toFixed(6));

            // §REGION-ANNULUS (ADR-0329 D5) — the HOLES are re-derived alongside the
            // outer ring, for the same reason the outer ring is written at all.
            //
            // WITHOUT THIS the record would claim the whole parcel (1600 m² on the
            // reference fixture) while the mesh drew the garden (1200), which is
            // precisely the record-vs-mesh divergence §FIX-SLAB-POLYGON-WRITEBACK
            // exists to close — *"'it follows' was true of the picture and false of
            // the record"* — reproduced one field along. Every consumer that reads
            // POLYGON without HOLES (schedules, area take-off, IFC/DXF export) would
            // over-report the slab by the footprint of the building standing on it.
            //
            // SAME WRITE RULE AS THE RING, deliberately: only a `fullyLive` loop is
            // persisted, so a hole assembled from a stale authoring-time fallback is
            // never laundered into the record as though it had been re-measured. A
            // loop that will not resolve live is OMITTED rather than kept at its old
            // coordinates — C79 §2.3, a wrong hole is worse than no hole.
            //
            // THIS DOES NOT TOUCH `sketch`. That is the L-943 property: the authored
            // references — outer and inner — are never rewritten by a move, so the
            // reverse pass has no authored value to reconstruct differently. Undo
            // restores the wall; the hole re-resolves to where it was. Pinned by
            // executed control, on the stored sketch, byte-for-byte.
            const innerLoops = slab.sketch.innerLoops ?? [];
            if (innerLoops.length > 0) {
                const derivedHoles: { x: number; y: number }[][] = [];
                for (const loop of innerLoops) {
                    const holeRes = SlabFragmentBuilder.resolveLoopVerdict(loop);
                    if (holeRes.fullyLive && holeRes.ring && holeRes.ring.length >= 3) {
                        derivedHoles.push(holeRes.ring);
                    }
                }
                next.holes = derivedHoles;
            }

            this.slabStore.update(slabId, next);
        }

        // §5.2.1 — `undetermined` is never silently collapsed into `preserved`,
        // and `conflicted` never passes without both numbers. Audible for a
        // developer; NOT the user-facing surface (C79 §10.6, still absent).
        //
        // Inside this branch `state` is `'undetermined' | 'conflicted'`, so the
        // write rule above reduces to `writable` alone — the `!== 'preserved'`
        // conjunct was dead here and TS2367 said so. Both outcomes are still
        // REAL and must be distinguishable in the trace:
        //   · `conflicted`   → live ring, written (record ≡ mesh, the A2 property)
        //   · `undetermined` via a stale fallback → not live, NOT written
        //   · `undetermined` via no previously derived ring → live, written
        if (verdict.state === 'undetermined' || verdict.state === 'conflicted') {
            console.warn(
                `[SlabDependencyTracker] §C79-5.2 ${verdict.state}` +
                `${verdict.reason ? ` (${verdict.reason})` : ''}: slab "${slabId}" — ` +
                `${verdict.subReason}. SlabData.polygon ` +
                `${writable ? 'WAS updated to the derived ring' : 'was NOT updated'}.`
            );
        }

        return verdict;
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
