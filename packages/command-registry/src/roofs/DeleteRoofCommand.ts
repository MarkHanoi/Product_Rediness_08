import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { RoofData } from '@pryzm/geometry-roof';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { cloneRoofData } from '@pryzm/geometry-roof';
import { semanticGraphManager } from '@pryzm/core-app-model';
import type { Relationship } from '@pryzm/core-app-model';

export class DeleteRoofCommand implements Command {
    readonly affectedStores = ["roof"] as const;
    readonly id: string;
    readonly type = CommandType.DELETE_ROOF;
    readonly timestamp: number;
    targetIds: string[];

    private snapshot: RoofData | null = null;
    /**
     * §FIX-ROOF-DELETE-LEAVES-GRAPH-EDGES (BIM 3.0 C71 §5.6) — this delete never
     * purged the SemanticGraph, while DeleteElementCommand's roof branch did:
     * two producers, two behaviours. CreateRoofCommand:236 writes a real
     * `sitsOn` (roof → level), so this path stranded a real edge on every
     * delete, and a stranded edge is not self-erasing — it survives
     * serialize()/deserialize() and persists forever.
     *
     * NOTE the pre-existing asymmetry this makes visible: execute() already
     * called topologyGraph.removeNode(roofId), so the roof was being torn out of
     * the TOPOLOGY graph while its SEMANTIC edges were left behind. Two graphs,
     * one delete, opposite behaviours.
     *
     * Undo restores VERBATIM from a pre-delete capture rather than re-authoring
     * `sitsOn` from the snapshot, per C71 §5.6 and the 3ee632f6 reference shape:
     * reconstruction would restore only the edge the roof itself knows about and
     * silently drop anything another command authored against it.
     */
    private _removedRelationships: Relationship[] | null = null;

    constructor(private roofId: string) {
        this.id = `cmd-delete-roof-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.timestamp = Date.now();
        this.targetIds = [roofId];
    }

    /**
     * §FIX-ROOF-DELETE-LEAVES-GRAPH-EDGES — capture every edge touching the roof
     * (source OR target), deduped by relationship id. Mirrors 3ee632f6's
     * `_captureRelationships`. MUST run before removal.
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
     * §FIX-ROOF-DELETE-LEAVES-GRAPH-EDGES — undo side: re-add the captured edges
     * verbatim. addRelationship() re-mints ids but is idempotent on
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
                    ...(rel.metadata ? { metadata: rel.metadata } : {}),
                });
            } catch { /* noop — graph write is non-fatal, as in CreateRoofCommand */ }
        }
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const roof = context.stores.roofStore.getById(this.roofId);
        if (!roof) return { ok: false, reason: `Roof ${this.roofId} not found` };
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const roof = context.stores.roofStore.getById(this.roofId);
        if (!roof) throw new Error(`Roof ${this.roofId} not found`);

        this.snapshot = cloneRoofData(roof);

        // §FIX-ROOF-DELETE-LEAVES-GRAPH-EDGES — capture BEFORE removal…
        this._captureRelationships([this.roofId]);

        elementRegistry.unregister(this.roofId);
        context.bimManager.unregisterElement(this.roofId);
        // …then purge the SEMANTIC graph, alongside the topology removeNode
        // below. Mirrors DeleteElementCommand's roof branch.
        try { semanticGraphManager.removeAllRelationshipsForElement(this.roofId); } catch { /* noop */ }
        context.stores.roofStore.remove(this.roofId);

        // P3.6 — Topology Layer stub (no-op until Core team delivers TopologyGraph)
        context.topologyGraph?.removeNode(this.roofId);

        return { success: true, affectedElementIds: [this.roofId] };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.snapshot) return { success: false, affectedElementIds: [] };

        context.stores.roofStore.add(this.snapshot);
        context.bimManager.registerElement(this.snapshot.id, this.snapshot.levelId);
        elementRegistry.registerSemantic(this.snapshot.id, 'roof');
        // §FIX-ROOF-DELETE-LEAVES-GRAPH-EDGES — restore the exact edges execute()
        // captured and purged, verbatim (not re-authored from snapshot.levelId).
        this._restoreRelationships();

        return { success: true, affectedElementIds: [this.snapshot.id] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { roofId: this.roofId },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}
