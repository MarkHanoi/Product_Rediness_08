import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { HandrailData } from '@pryzm/core-app-model';
import { serializeHandrailSnapshot, deserializeHandrailSnapshot } from '@pryzm/core-app-model';
import { semanticGraphManager } from '@pryzm/core-app-model';
import type { Relationship } from '@pryzm/core-app-model';

export class DeleteHandrailCommand implements Command {
    readonly affectedStores = ["handrail"] as const;
    readonly id = crypto.randomUUID();
    readonly type = CommandType.DELETE_HANDRAIL;
    readonly timestamp = Date.now();
    targetIds: string[];
    private snapshot: string | undefined;
    /**
     * §FIX-HANDRAIL-DELETE-LEAVES-GRAPH-EDGES (BIM 3.0 C71 §5.6) — this delete
     * never purged the SemanticGraph, while DeleteElementCommand's handrail
     * branch did: two producers, two behaviours, which is exactly the divergence
     * the gate exists to catch. CreateHandrailCommand:111 writes a real
     * `sitsOn` (handrail → level), so this path stranded a real edge, and a
     * stranded edge is not self-erasing — it survives serialize()/deserialize()
     * and persists forever.
     *
     * Undo restores VERBATIM from a pre-delete capture rather than re-authoring
     * `sitsOn` from the snapshot, per C71 §5.6 and the 3ee632f6 reference shape.
     * The handrail snapshot carries levelId, so `sitsOn` alone LOOKS
     * reconstructible — but reconstruction would restore only the edge this
     * element knows about and silently drop anything another command authored
     * against it (a stair's `contains`, a room's `boundedBy`), converting
     * "stale edges forever" into "undo silently loses topology", which is worse.
     */
    private _removedRelationships: Relationship[] | null = null;

    constructor(private handrailId: string) {
        this.targetIds = [handrailId];
    }

    /**
     * §FIX-HANDRAIL-DELETE-LEAVES-GRAPH-EDGES — capture every edge touching the
     * handrail (source OR target), deduped by relationship id. Mirrors
     * 3ee632f6's `_captureRelationships`. MUST run before removal.
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
     * §FIX-HANDRAIL-DELETE-LEAVES-GRAPH-EDGES — undo side: re-add the captured
     * edges verbatim. addRelationship() re-mints ids but is idempotent on
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
            } catch { /* noop — graph write is non-fatal, as in CreateHandrailCommand */ }
        }
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const handrail = ctx.stores.handrailStore.getById(this.handrailId);
        if (!handrail) return { ok: false, reason: `Handrail ${this.handrailId} not found` };
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const handrail = ctx.stores.handrailStore.getById(this.handrailId);
        if (!handrail) return { success: false, affectedElementIds: [] };

        this.snapshot = serializeHandrailSnapshot(handrail);
        // §FIX-HANDRAIL-DELETE-LEAVES-GRAPH-EDGES — capture BEFORE removal…
        this._captureRelationships([this.handrailId]);
        ctx.bimManager.unregisterElement(this.handrailId);
        // …then purge, mirroring DeleteElementCommand's handrail branch.
        try { semanticGraphManager.removeAllRelationshipsForElement(this.handrailId); } catch { /* noop */ }
        ctx.stores.handrailStore.remove(this.handrailId);

        return { success: true, affectedElementIds: [this.handrailId] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.snapshot) return { success: false, affectedElementIds: [] };

        const handrail: HandrailData = deserializeHandrailSnapshot(this.snapshot);
        ctx.stores.handrailStore.add(handrail);
        ctx.bimManager.registerElement(handrail.id, handrail.levelId);
        // §FIX-HANDRAIL-DELETE-LEAVES-GRAPH-EDGES — restore the exact edges
        // execute() captured and purged, verbatim (not re-authored from levelId).
        this._restoreRelationships();

        return { success: true, affectedElementIds: [this.handrailId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { handrailId: this.handrailId },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}
