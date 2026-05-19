/**
 * TagElementCommand — Attaches or removes semantic tags on a BIM element.
 *
 * Contract compliance:
 *   §01 §2    — Mutations to SemanticIndex go through this command, never direct calls.
 *   §03 §1.1  — Tags live in SemanticIndex (separate from element stores).
 *               Does not mutate any ElementStore or call any builder.
 *   §04       — AI must route tag operations through AIApprovalStore → this command.
 *   §07       — No server route involved; client-side store mutation only.
 *
 * Undo strategy:
 *   On execute(): captures the element's full tag snapshot before mutation.
 *   On undo(): restores the exact pre-execute snapshot.
 *
 * Event emitted:
 *   'semantic:tags-changed' — detail: { elementId: string }
 *   Consumed by: AIReadModel (cache invalidation), VGGovernancePanel (future tag filter UI).
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from './types';
import { semanticIndex } from '@pryzm/core-app-model';
import { isRecognizedTag } from '@pryzm/core-app-model';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export class TagElementCommand implements Command {
    /** F4.4 — Mutates SemanticIndex (registered as 'semantic-index' in StoreRegistry). */
    readonly affectedStores = ['semantic-index'] as const;
    id        = crypto.randomUUID();
    type      = CommandType.TAG_ELEMENT;
    timestamp = Date.now();
    targetIds: string[];

    /** Full tag set on the element before execute() ran. Populated at execution time. */
    private _snapshotBefore: string[] = [];

    /**
     * @param elementId   The stable ID of the BIM element to tag.
     * @param tagsToAdd   Tags to add. Unrecognised tags are accepted with a console warning.
     * @param tagsToRemove  Tags to remove. No-op for tags not currently present.
     */
    constructor(
        private elementId: string,
        private tagsToAdd: string[],
        private tagsToRemove: string[],
    ) {
        this.targetIds = [elementId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!this.elementId || this.elementId.trim() === '') {
            return { ok: false, reason: 'elementId is required and must be non-empty.' };
        }
        if (!this.tagsToAdd.length && !this.tagsToRemove.length) {
            return { ok: false, reason: 'At least one tag must be specified in tagsToAdd or tagsToRemove.' };
        }
        const unknownAdds = this.tagsToAdd.filter(t => !isRecognizedTag(t.trim().toLowerCase()));
        if (unknownAdds.length > 0) {
            console.warn(
                `[TagElementCommand] Unrecognised tags will be accepted but are not in the vocabulary: ${unknownAdds.join(', ')}`
            );
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        this._snapshotBefore = [...semanticIndex.getTags(this.elementId)];

        semanticIndex.addTags(this.elementId, this.tagsToAdd);
        semanticIndex.removeTags(this.elementId, this.tagsToRemove);

        _bus.emit('semantic:tags-changed', { elementId: this.elementId }); // F.events.17

        return { success: true, affectedElementIds: [this.elementId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        const currentTags = [...semanticIndex.getTags(this.elementId)];

        semanticIndex.removeTags(this.elementId, currentTags);
        semanticIndex.addTags(this.elementId, this._snapshotBefore);

        _bus.emit('semantic:tags-changed', { elementId: this.elementId }); // F.events.17

        return { success: true, affectedElementIds: [this.elementId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   {
                elementId:      this.elementId,
                tagsToAdd:      this.tagsToAdd,
                tagsToRemove:   this.tagsToRemove,
                snapshotBefore: this._snapshotBefore,
            },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}
