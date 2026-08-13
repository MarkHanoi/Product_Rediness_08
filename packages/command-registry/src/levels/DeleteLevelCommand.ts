/**
 * DeleteLevelCommand
 *
 * Permanently removes a level from the project.
 *
 * §01 §2.1  Single Source of Mutation.
 * §01 §2.2  Snapshot Rule — full Level snapshot captured before deletion for undo.
 * §01 §2.3  Undo re-creates the level exactly as it was.
 *
 * Safety constraints enforced in canExecute():
 *  - Cannot delete the last remaining level.
 *  - Cannot delete a level that still contains elements (childrenIds > 0).
 *    The UI must guide the user to move or delete elements first.
 *  - Cannot delete 'L0' (ground level) if it is the only remaining level.
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { Level } from '@pryzm/core-app-model';
import { semanticGraphManager } from '@pryzm/core-app-model';
import type { Relationship } from '@pryzm/core-app-model';
import { DOMEventBus } from '@pryzm/event-bus';

const _bus = new DOMEventBus();

export interface DeleteLevelPayload {
    levelId: string;
}

export class DeleteLevelCommand implements Command {
    readonly affectedStores = ["level", "wall", "slab"] as const;
    readonly id: string;
    readonly type = CommandType.DELETE_LEVEL;
    readonly timestamp: number;
    readonly targetIds: string[];

    private payload: DeleteLevelPayload;
    private prevSnapshot: Level | null = null;
    private prevActiveLevelId: string | null = null;

    /**
     * §FIX-LEVEL-DELETE-LEAVES-GRAPH-EDGES (BIM 3.0 C71 §5.6) — this delete
     * never purged the SemanticGraph at all. A well-formed edge pointing at a
     * deleted id is NOT self-erasing: it survives serialize()/deserialize() and
     * persists forever.
     *
     * WHAT ACTUALLY STRANDS, and why canExecute's guard does NOT cover it.
     * canExecute refuses when `level.childrenIds.length > 0`, which is why the
     * obvious strand set — one `sitsOn` per element on the level — is mostly
     * unreachable in the standard workflow: the user must clear the level
     * first, and clearing it deletes those elements together with their edges.
     *
     * But `childrenIds` is populated by `bimManager.registerElement`, and the
     * LEVEL-PAIR families are not registered against both of their endpoints:
     *
     *   · CreateStairCommand:289 registers the stair on the BASE level only,
     *     then writes `connectedByStair` in BOTH directions between base and
     *     TOP level (:411).
     *   · CreateVerticalCirculationCommand:195 registers the lift on the BASE
     *     level only, then writes `connectedByLift` both ways (:264).
     *
     * So the TOP level of every stair and lift in the project holds two edges
     * while its `childrenIds` stays empty. It passes the guard, deletes
     * cleanly, and leaves DependencyResolver believing a level that no longer
     * exists is still reachable by stair. That is the real, reachable strand
     * set — and it is the one the guard was never able to see.
     *
     * SCOPE — why `removeAllRelationshipsForElement(levelId)` is RIGHT here,
     * though it was wrong in DeleteStairCommand. The stair case had to purge
     * edge-wise by id because the LEVELS SURVIVED the stair's delete, so a
     * whole-endpoint purge would have destroyed every other element's edges to
     * those levels (the over-purge C71 §5.6 warns against). Here the endpoint
     * IS the thing being deleted: every edge touching it is stranded by
     * definition, and there is no surviving relationship to that id worth
     * keeping. The asymmetry is not an inconsistency — it follows from which
     * endpoint dies.
     *
     * Undo restores VERBATIM from a pre-delete capture, per the 3ee632f6
     * reference shape. Reconstruction is not merely weaker here, it is
     * IMPOSSIBLE: `Level` carries no record of the stairs and lifts that
     * connect to it, so nothing in the snapshot names the edges to rebuild.
     */
    private _removedRelationships: Relationship[] | null = null;

    constructor(payload: DeleteLevelPayload) {
        this.id = `cmd-delete-level-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.timestamp = Date.now();
        this.payload = payload;
        this.targetIds = [payload.levelId];
    }

    /**
     * §FIX-LEVEL-DELETE-LEAVES-GRAPH-EDGES — capture every edge touching the
     * level (source OR target), deduped by relationship id. Mirrors 3ee632f6's
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
     * §FIX-LEVEL-DELETE-LEAVES-GRAPH-EDGES — undo side: re-add the captured
     * edges verbatim. addRelationship() re-mints ids but is idempotent on
     * (source, target, type[, authoredBy]), so redo→undo cycles cannot
     * duplicate.
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
                    // edge's IDENTITY for the connectedByStair / connectedByLift
                    // families, which are EXACTLY the families a level delete
                    // strands. Dropping it here would restore two stairs' edges
                    // as one and silently eat the survivor's.
                    ...(rel.authoredBy !== undefined ? { authoredBy: rel.authoredBy } : {}),
                    ...(rel.metadata ? { metadata: rel.metadata } : {}),
                });
            } catch { /* noop — graph write is non-fatal, as in AddLevelCommand */ }
        }
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const { bimManager } = context;

        const level = bimManager.getLevelById(this.payload.levelId);
        if (!level) {
            return { ok: false, reason: `Level "${this.payload.levelId}" not found.` };
        }

        const allLevels = bimManager.getLevels();
        if (allLevels.length <= 1) {
            return { ok: false, reason: 'Cannot delete the last remaining level.' };
        }

        // §02 §1.3: No silent orphaning — elements must be explicitly moved first.
        if (level.childrenIds.length > 0) {
            return {
                ok: false,
                reason: `Level "${level.name}" contains ${level.childrenIds.length} element(s). Move or delete all elements before removing the level.`
            };
        }

        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const { bimManager, projectContext } = context;

        const level = bimManager.getLevelById(this.payload.levelId);
        if (!level) {
            return { success: false, affectedElementIds: [], error: `Level "${this.payload.levelId}" not found.` };
        }

        // §01 §2.2: Capture full snapshot before deletion.
        this.prevSnapshot = structuredClone(level);
        this.prevActiveLevelId = projectContext.activeLevelId;

        // §FIX-LEVEL-DELETE-LEAVES-GRAPH-EDGES — capture BEFORE removal. The
        // reachable strand set is the connectedByStair / connectedByLift pairs
        // whose TOP-level endpoint is this level: the stair and lift register
        // on their BASE level only, so those edges are invisible to the
        // childrenIds guard in canExecute().
        this._captureRelationships([this.payload.levelId]);

        bimManager.removeLevel(this.payload.levelId);

        // …then purge. Whole-endpoint scope is correct here — unlike the stair
        // case, the endpoint being purged IS the element being deleted, so every
        // edge touching it is stranded by definition (see the class doc).
        try { semanticGraphManager.removeAllRelationshipsForElement(this.payload.levelId); } catch { /* noop */ }

        // Switch active level if the deleted level was active.
        if (projectContext.activeLevelId === this.payload.levelId) {
            const remaining = bimManager.getLevels();
            if (remaining.length > 0) {
                // Pick the level immediately below by elevation, or the first one.
                const sorted = remaining.slice().sort((a, b) => a.elevation - b.elevation);
                const below = sorted.filter(l => l.elevation < level.elevation);
                projectContext.activeLevelId = below.length > 0
                    ? below[below.length - 1].id
                    : sorted[0].id;
            }
        }

        _bus.emit('update-project-ui', {});
        _bus.emit('bim-level-removed', { id: this.payload.levelId });
        _bus.emit('ai-model-update', { model: '' });

        return {
            success: true,
            affectedElementIds: [this.payload.levelId],
            info: [`Level "${level.name}" deleted.`]
        };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.prevSnapshot) {
            return { success: false, affectedElementIds: [], error: 'No snapshot available for undo.' };
        }

        const { bimManager, projectContext } = context;

        // §01 §2.3: Full restoration of the snapshot.
        bimManager.addLevel(this.prevSnapshot);

        // §FIX-LEVEL-DELETE-LEAVES-GRAPH-EDGES — restore the exact edges
        // execute() captured and purged, verbatim. There is no reconstruction
        // alternative here: `Level` carries no record of the stairs and lifts
        // that connect to it, so nothing in the snapshot names these edges.
        this._restoreRelationships();

        if (this.prevActiveLevelId) {
            projectContext.activeLevelId = this.prevActiveLevelId;
        }

        _bus.emit('update-project-ui', {});
        _bus.emit('bim-level-added', { id: this.prevSnapshot.id, elevation: this.prevSnapshot.elevation });

        return {
            success: true,
            affectedElementIds: [this.payload.levelId],
            info: [`Level "${this.prevSnapshot.name}" restored.`]
        };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: this.payload as any,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}
