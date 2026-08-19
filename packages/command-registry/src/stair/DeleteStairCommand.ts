// §03-STAIR-COMMAND-PIPELINE-CONTRACT — Phase 3: Task 3.3
// Full snapshot-based undo. Sub-elements removed before stair. No window-global reads.

import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext
} from '../types';
import { StairData } from '@pryzm/geometry-stair';
import { StairRailingConfig } from '@pryzm/geometry-stair';
import { StairLandingEntity } from '@pryzm/geometry-stair';

import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import type { OpeningData } from '@pryzm/core-app-model';
// §FIX-STAIR-DELETE-ORPHANS-HANDRAILS — the REAL record type, not a structural
// stand-in. `ctx.stores.handrailStore` is already declared as `HandrailStore`, so
// a hand-written shape here would be strictly weaker: it would keep compiling if
// the store's surface changed underneath it, which is the L-972/L-973 seam defect.
import type { HandrailData } from '@pryzm/core-app-model/stores';
import { semanticGraphManager } from '@pryzm/core-app-model';
import type { Relationship } from '@pryzm/core-app-model';
import { stairAutoOpeningId } from './stairOpeningId';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export interface DeleteStairInput {
    stairId: string;
}

export class DeleteStairCommand implements Command {
    // §FIX-STAIR-DELETE-LEAVES-HOLE (L-298) — the delete really does write three
    // stores, because it must HEAL the auto-opening CreateStairCommand punched:
    // the stair store, the opening store (remove the hole), and the host slab
    // (rebuild it without the hole). The lock-graph must reflect that write-set —
    // it now mirrors CreateStairCommand.affectedStores exactly.
    // §FIX-STAIR-DELETE-ORPHANS-HANDRAILS — 'handrail' joins the declaration
    // because this command now REMOVES hosted handrails. A cascade that mutates a
    // store it does not declare is invisible to the scoped snapshot (C03 §4.6
    // U-2), which is precisely how an undo silently stops covering a family.
    readonly affectedStores = ["stair", "opening", "slab", "handrail"] as const;
    readonly id: string;
    readonly type = CommandType.DELETE_STAIR;
    readonly timestamp: number;
    readonly targetIds: string[];

    private stairId: string;
    private _stairSnapshot?: StairData;
    private _railingSnapshots: StairRailingConfig[] = [];
    /**
     * §FIX-STAIR-DELETE-ORPHANS-HANDRAILS (C95 §8.2) — the FREE-STANDING handrails
     * hosted on this stair.
     *
     * ⚠ A DIFFERENT FAMILY FROM `_railingSnapshots`, and conflating the two is the
     * mistake this comment exists to prevent. `StairRailingConfig` is the stair's
     * OWN railing (`stairRailingStore`, built by `StairRailingBuilder`); these are
     * `HandrailData` records in the authoritative `handrailStore`, built by
     * `HandrailFragmentBuilder`. C95 §1.1 measures them as three distinct railing
     * concepts; only one of them was ever cleaned up here.
     */
    private _hostedHandrailSnapshots: HandrailData[] = [];
    private _landingSnapshots: StairLandingEntity[] = [];
    // §FIX-STAIR-DELETE-LEAVES-HOLE (L-298) — snapshot of the auto-opening removed by
    // execute(), so undo() can restore the EXACT hole (same store, same field, same
    // coord space) and Ctrl-Z returns the pre-delete state byte-for-byte.
    private _openingSnapshot?: OpeningData;
    private _openingHostSlabId?: string;
    /**
     * §FIX-STAIR-DELETE-LEAVES-GRAPH-EDGES (BIM 3.0 C71 §5.6) — the stair delete
     * never purged the SemanticGraph, and BOTH delete paths delegate here since
     * L-298, so a deleted stair stranded EVERY edge it owned.
     *
     * THE STRAND SET is real and three edges wide: CreateStairCommand writes
     * `sitsOn` (stair → baseLevel) plus BOTH directions of `connectedByStair`
     * (baseLevel ↔ topLevel, the level graph being bidirectional for egress
     * routing). A well-formed edge pointing at a deleted id is NOT self-erasing:
     * it survives serialize()/deserialize() and persists forever, so every
     * deleted stair left DependencyResolver believing two levels were still
     * connected by a stair that no longer exists — an egress-routing lie.
     *
     * THE UNDO SIDE follows 3ee632f6 (the wall family) rather than the
     * reconstruct-from-snapshot pattern, and C71 §5.6 requires it: the
     * `connectedByStair` edges are keyed on the LEVEL pair, not the stair, so an
     * undo that re-authored them from the stair snapshot would rebuild only what
     * this stair knows about and silently drop any edge another command authored
     * against the same stair (e.g. a `sitsOn` re-pointed by a level move). So the
     * pre-delete edge set is captured VERBATIM and re-added on undo.
     */
    private _removedRelationships: Relationship[] | null = null;

    constructor(input: DeleteStairInput) {
        this.id = crypto.randomUUID();
        this.timestamp = Date.now();
        this.stairId = input.stairId;
        this.targetIds = [input.stairId];
    }

    /**
     * §FIX-STAIR-DELETE-LEAVES-GRAPH-EDGES — capture every graph edge touching
     * any of `ids` (source OR target), deduped by relationship id. Mirrors
     * 3ee632f6's `_captureRelationships`. MUST run before any removal.
     *
     * The id set is deliberately WIDER than the stair: `connectedByStair` is a
     * level→level edge that names the stair only in metadata, so a capture
     * scoped to the stair id alone would miss both directions of it.
     */
    private _captureRelationships(ids: string[]): void {
        const byRelId = new Map<string, Relationship>();
        for (const eid of ids) {
            if (!eid) continue;
            for (const rel of semanticGraphManager.getRelationships(eid)) {
                byRelId.set(rel.id, { ...rel });
            }
        }
        this._removedRelationships = [...byRelId.values()];
    }

    /**
     * §FIX-STAIR-DELETE-LEAVES-GRAPH-EDGES — undo side: re-add the captured
     * edges verbatim. addRelationship() regenerates ids but is idempotent on
     * (source, target, type), so redo→undo cycles cannot duplicate.
     */
    private _restoreRelationships(): void {
        if (!this._removedRelationships) return;
        for (const rel of this._removedRelationships) {
            try {
                semanticGraphManager.addRelationship({
                    type: rel.type,
                    sourceId: rel.sourceId,
                    targetId: rel.targetId,
                    createdBy: rel.createdBy,
                    // §FIX-CONNECTEDBY-EDGE-KEYING — `authoredBy` is part of the
                    // edge's IDENTITY, so it must be carried through verbatim.
                    // Dropping it here would restore the stair's connectedByStair
                    // pair UNKEYED, which then collides with a rival stair's edge
                    // on the same level pair and re-creates the very collapse this
                    // fix closes — undo would silently eat the survivor's edge.
                    ...(rel.authoredBy !== undefined ? { authoredBy: rel.authoredBy } : {}),
                    ...(rel.metadata ? { metadata: rel.metadata } : {}),
                });
            } catch { /* noop — graph write is non-fatal, as in CreateStairCommand */ }
        }
    }

    /**
     * §FIX-STAIR-DELETE-LEAVES-GRAPH-EDGES — the level→level `connectedByStair`
     * edges this stair authored. They are found by METADATA (stairId), because
     * the edge's endpoints are the two levels, not the stair: purging by
     * endpoint id would tear down every OTHER stair's connection between the
     * same two levels, which is exactly the over-purge C71 §5.6 warns against.
     *
     * §UPSTREAM-LIMITATION (NOT fixed here, asserted in
     * stairDeleteLeavesGraphEdges.test.ts): addRelationship() is idempotent on
     * (sourceId, targetId, type) and IGNORES metadata (SemanticGraph.ts
     * `_findExact`), so two stairs joining the SAME level pair collapse onto ONE
     * connectedByStair edge — the second create is a silent no-op. Deleting
     * either stair therefore removes the only edge that exists, leaving the
     * survivor unlinked. That is a keying defect in the edge model, not in this
     * delete: with one edge present there is nothing here to preserve. Fixing it
     * means keying the edge on the stair (or making idempotency metadata-aware)
     * in CreateStairCommand + SemanticGraph, and belongs in its own lane.
     */
    private _stairAuthoredLevelEdges(levelIds: string[]): Relationship[] {
        const out = new Map<string, Relationship>();
        for (const lid of levelIds) {
            if (!lid) continue;
            for (const rel of semanticGraphManager.getRelationships(lid)) {
                if (rel.type === 'connectedByStair' && rel.metadata?.stairId === this.stairId) {
                    out.set(rel.id, rel);
                }
            }
        }
        return [...out.values()];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const stair = ctx.stores.stairStore.getById(this.stairId);
        if (!stair) {
            return { ok: false, reason: `Stair "${this.stairId}" not found`, blockingIssues: [`Stair ${this.stairId} not found`] };
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const stair = ctx.stores.stairStore.getById(this.stairId);
        if (!stair) {
            return { success: false, affectedElementIds: [], info: [`Stair "${this.stairId}" not found`] };
        }

        // Capture full snapshot before any deletion (for undo)
        this._stairSnapshot = structuredClone(stair as StairData);

        // Capture railing snapshots
        if (ctx.stores.stairRailingStore) {
            this._railingSnapshots = ctx.stores.stairRailingStore
                .getByStairId(this.stairId)
                .map(r => structuredClone(r));
        }

        // §FIX-STAIR-DELETE-ORPHANS-HANDRAILS — capture the hosted handrails.
        // Keyed on `hostId`, which is the field that made this answerable at all
        // (C95 §15.1); before it, "which handrails belong to this stair?" had no
        // answer in the model and the orphans could not even be found.
        const handrailStore = ctx.stores.handrailStore;
        if (handrailStore) {
            this._hostedHandrailSnapshots = handrailStore
                .getAll()
                .filter(h => h.hostId === this.stairId)
                .map(h => structuredClone(h));
        }

        // Capture landing snapshots
        if (ctx.stores.stairLandingStore) {
            this._landingSnapshots = ctx.stores.stairLandingStore
                .getByStairId(this.stairId)
                .map(l => structuredClone(l));
        }

        // §FIX-STAIR-DELETE-LEAVES-GRAPH-EDGES — capture BEFORE any removal.
        // The id set spans the stair, its railings/landings (any of which may
        // carry edges of their own) and BOTH levels, because the two
        // `connectedByStair` edges are stored on the level pair.
        const baseLevelId = (stair as StairData).baseLevelId;
        const topLevelId = (stair as StairData).topLevelId;
        const levelEdges = this._stairAuthoredLevelEdges([baseLevelId, topLevelId]);
        this._captureRelationships([
            this.stairId,
            ...this._railingSnapshots.map(r => r.id),
            ...this._landingSnapshots.map(l => l.id),
        ]);
        // Merge in the level→level edges this stair authored: they touch neither
        // the stair nor its children by ENDPOINT, only by metadata, so the
        // id-scoped capture above cannot see them.
        {
            const merged = new Map<string, Relationship>(
                (this._removedRelationships ?? []).map(r => [r.id, r]),
            );
            for (const rel of levelEdges) merged.set(rel.id, { ...rel });
            this._removedRelationships = [...merged.values()];
        }

        // §FIX-STAIR-DELETE-ORPHANS-HANDRAILS — remove the hosted handrails.
        // `HandrailStore.remove` emits `bim-handrail-removed`, so the fragment
        // builder tears the mesh down as well: the record AND the geometry go, which
        // is the difference between this and a store-only purge (C84 EI-4a).
        for (const h of this._hostedHandrailSnapshots) {
            handrailStore?.remove(h.id);
            try { ctx.bimManager.unregisterElement(h.id); } catch (_) { /* noop */ }
            try { elementRegistry.unregister(h.id); } catch (_) { /* noop */ }
        }

        // Remove sub-elements first (eventBus triggers builder cleanup)
        ctx.stores.stairRailingStore?.removeByStairId(this.stairId);
        ctx.stores.stairLandingStore?.removeByStairId(this.stairId);
        this._railingSnapshots.forEach(r => {
            try { ctx.bimManager.unregisterElement(r.id); } catch (_) { /* noop */ }
            try { elementRegistry.unregister(r.id); } catch (_) { /* noop */ }
        });

        // Remove stair (eventBus triggers stairMeshBuilder.removeStair)
        ctx.stores.stairStore.remove(this.stairId);

        // Unregister from BIM manager and elementRegistry
        try { ctx.bimManager.unregisterElement(this.stairId); } catch (_) { /* noop */ }
        try { elementRegistry.unregister(this.stairId); } catch (_) { /* noop */ }

        // §FIX-STAIR-DELETE-LEAVES-GRAPH-EDGES — PURGE. Mirrors 3ee632f6.
        // ① Every edge whose endpoint is the stair or one of its sub-elements
        //    (`sitsOn` stair→baseLevel, plus anything authored against them).
        try { semanticGraphManager.removeAllRelationshipsForElement(this.stairId); } catch (_) { /* noop */ }
        this._railingSnapshots.forEach(r => {
            try { semanticGraphManager.removeAllRelationshipsForElement(r.id); } catch (_) { /* noop */ }
        });
        this._landingSnapshots.forEach(l => {
            try { semanticGraphManager.removeAllRelationshipsForElement(l.id); } catch (_) { /* noop */ }
        });
        // §FIX-STAIR-DELETE-ORPHANS-HANDRAILS — and the hosted handrails' edges
        // (`sitsOn` to the level, plus the `hosts`/`hostedBy` pair to this stair).
        // A well-formed edge pointing at a deleted id is not self-erasing.
        this._hostedHandrailSnapshots.forEach(h => {
            try { semanticGraphManager.removeAllRelationshipsForElement(h.id); } catch (_) { /* noop */ }
        });
        // ② The level→level `connectedByStair` pair, removed EDGE-WISE rather
        //    than by endpoint: removeAllRelationshipsForElement(levelId) would
        //    also destroy every other element's sitsOn edge to that level.
        for (const rel of levelEdges) {
            try { semanticGraphManager.removeRelationship(rel.id); } catch (_) { /* noop */ }
        }

        // §FIX-STAIR-DELETE-LEAVES-HOLE (L-298) — HEAL THE SLAB.
        // CreateStairCommand punched an opening on the slab above (createAutoOpening)
        // and its undo() removes that opening. A straight (non-undo) delete was NOT
        // removing it, so the void stayed in the floor forever. Symmetry demands the
        // forward delete remove precisely what the create added — the same opening in
        // the same openingStore — and undo() restore it. Mirrors DeleteSlabCommand's
        // hosted-opening cleanup and the C15 window/door → wall-opening heal.
        this._healHostSlab(ctx);

        _bus.emit('ai-model-update', {}); // F.events.17

        console.log(`[DeleteStairCommand] Deleted stair ${this.stairId}`);

        return { success: true, affectedElementIds: [this.stairId], info: ['Stair deleted'] };
    }

    /**
     * §FIX-STAIR-DELETE-LEAVES-HOLE (L-298) — remove the auto-opening this stair
     * punched on the slab above and rebuild that slab so the void closes.
     *
     * The opening is identified by the SHARED id convention (stairAutoOpeningId) —
     * the same id CreateStairCommand.createAutoOpening() wrote. Using the exact id
     * (not a host-scoped sweep) is deliberate: it heals ONLY this stair's hole and
     * leaves any sibling opening on the same slab (a second stair, a pool) untouched.
     * A snapshot is captured first so undo() can restore the hole precisely.
     */
    private _healHostSlab(ctx: CommandContext): void {
        const stores = ctx.stores as any;
        const openingStore = stores.openingStore;
        const slabStore = stores.slabStore;
        if (!openingStore) return;

        const openingId = stairAutoOpeningId(this.stairId);
        // getById() returns a structuredClone (OpeningStore §3.7) — safe to retain.
        const opening: OpeningData | undefined = openingStore.getById(openingId);
        if (!opening) return; // no auto-opening (autoCreateOpening:false or no host slab)

        this._openingSnapshot = opening;
        this._openingHostSlabId = opening.hostId;

        openingStore.remove(openingId);
        try { ctx.bimManager.unregisterElement(openingId); } catch (_) { /* noop */ }
        try { elementRegistry.unregister(openingId); } catch (_) { /* noop */ }
        // Rebuild the host slab so SlabFragmentBuilder re-triangulates WITHOUT this hole.
        if (slabStore && opening.hostId) slabStore.triggerRebuild(opening.hostId);
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this._stairSnapshot) {
            return { success: false, affectedElementIds: [], info: ['No snapshot — cannot undo'] };
        }

        // Re-register with BIM manager and elementRegistry
        try {
            ctx.bimManager.registerElement(this._stairSnapshot.id, this._stairSnapshot.baseLevelId);
        } catch (_) { /* already registered or level gone */ }
        try { elementRegistry.registerSemantic(this._stairSnapshot.id, 'stair'); } catch (_) { /* already registered */ }

        // Restore stair (eventBus triggers stairMeshBuilder.buildStair)
        ctx.stores.stairStore.restoreSnapshot(this._stairSnapshot);

        // Restore railings
        this._railingSnapshots.forEach(r => {
            try { ctx.bimManager.registerElement(r.id, this._stairSnapshot!.baseLevelId); } catch (_) { /* already registered or level gone */ }
            try { elementRegistry.registerSemantic(r.id, 'stair-railing'); } catch (_) { /* already registered */ }
            ctx.stores.stairRailingStore?.add(r);
        });

        // §FIX-STAIR-DELETE-ORPHANS-HANDRAILS — restore the hosted handrails.
        // Same undo entry as the stair, so ONE Ctrl+Z brings back exactly what one
        // delete removed (C84 EI-5 create/delete symmetry). `add` re-emits
        // `bim-handrail-added`, so the meshes come back with the records.
        // The graph edges are restored by `_restoreRelationships` below, which
        // already replays the whole captured set verbatim.
        {
            const handrailStore = ctx.stores.handrailStore;
            this._hostedHandrailSnapshots.forEach(h => {
                try { ctx.bimManager.registerElement(h.id, h.levelId); } catch (_) { /* noop */ }
                // Clone on the way IN as well: `HandrailStore.add` mutates the object
                // it is handed (levelId / parentId / properties.mark) before cloning,
                // so passing the snapshot itself would corrupt it for a later redo.
                handrailStore?.add(structuredClone(h));
            });
        }

        // Restore landings
        this._landingSnapshots.forEach(l => {
            ctx.stores.stairLandingStore?.add(l);
        });

        // §FIX-STAIR-DELETE-LEAVES-HOLE (L-298) — RE-OPEN THE HOLE.
        // Symmetric with execute()'s _healHostSlab: restore the exact auto-opening we
        // removed so a single Ctrl-Z after a delete brings back BOTH the stair AND its
        // hole — one gesture, one undo, pre-delete state exactly (C16 / C03 §4.5-4.8).
        if (this._openingSnapshot && this._openingHostSlabId) {
            const stores = ctx.stores as any;
            const openingStore = stores.openingStore;
            const slabStore = stores.slabStore;
            if (openingStore) {
                try { ctx.bimManager.registerElement(this._openingSnapshot.id, this._openingSnapshot.levelId); } catch (_) { /* noop */ }
                try { elementRegistry.registerSemantic(this._openingSnapshot.id, 'opening'); } catch (_) { /* noop */ }
                openingStore.add(this._openingSnapshot);
                if (slabStore) slabStore.triggerRebuild(this._openingHostSlabId);
            }
            this._openingSnapshot = undefined;
            this._openingHostSlabId = undefined;
        }

        // §FIX-STAIR-DELETE-LEAVES-GRAPH-EDGES — restore the exact edges execute()
        // captured and purged: the stair's `sitsOn` AND both directions of the
        // level→level `connectedByStair`. VERBATIM from the pre-delete capture,
        // not re-authored from the stair snapshot — C71 §5.6 is explicit that a
        // reconstruction can differ from what was there, and here it would: the
        // level-pair edges are not derivable from the stair's own fields alone.
        this._restoreRelationships();

        _bus.emit('ai-model-update', {}); // F.events.17

        console.log(`[DeleteStairCommand] Restored stair ${this.stairId}`);

        return { success: true, affectedElementIds: [this.stairId], info: ['Stair deletion undone'] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { stairId: this.stairId },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}
