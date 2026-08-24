/**
 * TitleBlockTemplateCommands — §TITLE-BLOCK-EDIT-FORKS (L-10690)
 *
 * The founder's ask #4: *"user-configurable field placement"*.
 *
 * ⛔ THE BINDING RULE, and it is a rule rather than a note: EDITING A BUILT-IN
 * FORKS IT. `a1-standard` is never mutated in place. Every sheet already issued
 * references its template BY ID, so mutating a built-in would silently redraw
 * drawings that have gone out to a client, a contractor or a planning authority.
 * `ForkTitleBlockTemplateCommand` is the only door into user editing, and the
 * store refuses a built-in id independently — the guard is not carried by the
 * UI's good manners.
 *
 * Contract compliance:
 *   §01 §2   — Command-first; the sheet editor never writes the store directly (P6)
 *   §04 §2.1 — Class A commands (fully undoable)
 *   §07      — No server routes
 */

import {
    Command, CommandType, CommandValidationResult, CommandResult,
    SerializedCommand, CommandContext,
} from '../types';
import { titleBlockStore } from '@pryzm/core-app-model';
import type { TitleBlockTemplate } from '@pryzm/core-app-model';

// ── Fork ──────────────────────────────────────────────────────────────────────

export interface ForkTitleBlockTemplateParams {
    /** Template to copy — a built-in or another user template. */
    sourceId: string;
    /** Id for the copy. Must not already exist. */
    newId:    string;
    /** Display name shown in the Title Block dropdown. */
    newName:  string;
}

export class ForkTitleBlockTemplateCommand implements Command {
    readonly affectedStores = ['title-block'] as const;
    id        = crypto.randomUUID();
    type      = CommandType.FORK_TITLE_BLOCK_TEMPLATE;
    timestamp = Date.now();
    targetIds: string[];

    constructor(private params: ForkTitleBlockTemplateParams) {
        this.targetIds = [params.newId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!titleBlockStore.has(this.params.sourceId)) {
            return { ok: false, reason: `Title block '${this.params.sourceId}' does not exist.` };
        }
        if (titleBlockStore.has(this.params.newId)) {
            return { ok: false, reason: `Title block '${this.params.newId}' already exists.` };
        }
        if (!this.params.newName.trim()) {
            return { ok: false, reason: 'A forked title block needs a name.' };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const made = titleBlockStore.fork(this.params.sourceId, this.params.newId, this.params.newName);
        return { success: made !== null, affectedElementIds: made ? [made.id] : [] };
    }

    undo(_ctx: CommandContext): CommandResult {
        // Deleting the fork is the exact inverse: it did not exist before.
        const ok = titleBlockStore.delete(this.params.newId);
        return { success: ok, affectedElementIds: [this.params.newId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type, payload: { params: this.params },
            targetIds: this.targetIds, timestamp: this.timestamp, version: 1,
        };
    }
}

// ── Field placement ───────────────────────────────────────────────────────────

export interface TitleBlockFieldPlacementMm {
    /** Offset from the STRIP's left edge (mm) — block-local, not paper-absolute. */
    localX?: number;
    /** Distance from the paper bottom (mm). */
    y?:      number;
    width?:  number;
    height?: number;
}

export interface SetTitleBlockFieldPlacementParams {
    templateId: string;
    fieldKey:   string;
    placement:  TitleBlockFieldPlacementMm;
}

/**
 * Move or resize ONE field of a USER template, in block-local millimetres.
 *
 * ⭐ It is a one-field write rather than a new coordinate system because the
 * block-local work already shipped (L-10688/L-10684): `buildStripTitleBlock`
 * authors in block-local mm and `titleBlockFieldsOnPaper` re-anchors to whatever
 * paper the sheet resolves to. A layout the user draws on an A3 is the same
 * layout on an A0.
 */
export class SetTitleBlockFieldPlacementCommand implements Command {
    readonly affectedStores = ['title-block'] as const;
    id        = crypto.randomUUID();
    type      = CommandType.SET_TITLE_BLOCK_FIELD_PLACEMENT;
    timestamp = Date.now();
    targetIds: string[];

    /** The four numbers as they were, so undo restores the millimetres and not
     *  an approximation of them. */
    private _previous: TitleBlockFieldPlacementMm | null = null;

    constructor(private params: SetTitleBlockFieldPlacementParams) {
        this.targetIds = [params.templateId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        const t = titleBlockStore.get(this.params.templateId);
        if (!t) return { ok: false, reason: `Title block '${this.params.templateId}' does not exist.` };
        if (titleBlockStore.isBuiltin(this.params.templateId)) {
            return {
                ok: false,
                reason:
                    `'${t.name}' is a built-in title block and is never edited in place — sheets ` +
                    `already issued reference it by id. Duplicate it first, then edit the copy.`,
            };
        }
        if (!t.fields.some(f => f.key === this.params.fieldKey)) {
            return { ok: false, reason: `Field '${this.params.fieldKey}' is not on '${t.name}'.` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const t = titleBlockStore.get(this.params.templateId);
        const f = t?.fields.find(x => x.key === this.params.fieldKey);
        if (!t || !f) return { success: false, affectedElementIds: [] };

        this._previous = {
            localX: f.x - (t.paperWidth - t.borderWidth),
            y:      f.y,
            width:  f.width,
            height: f.height,
        };

        const ok = titleBlockStore.setFieldPlacement(
            this.params.templateId, this.params.fieldKey, this.params.placement,
        );
        return { success: ok, affectedElementIds: [this.params.templateId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        if (!this._previous) return { success: false, affectedElementIds: [] };
        const ok = titleBlockStore.setFieldPlacement(
            this.params.templateId, this.params.fieldKey, this._previous,
        );
        return { success: ok, affectedElementIds: [this.params.templateId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { params: this.params, previous: this._previous },
            targetIds: this.targetIds, timestamp: this.timestamp, version: 1,
        };
    }
}

// ── Delete ────────────────────────────────────────────────────────────────────

export class DeleteTitleBlockTemplateCommand implements Command {
    readonly affectedStores = ['title-block'] as const;
    id        = crypto.randomUUID();
    type      = CommandType.DELETE_TITLE_BLOCK_TEMPLATE;
    timestamp = Date.now();
    targetIds: string[];

    /** The whole template, so undo restores it rather than an empty shell.
     *  ⛔ "Do not delete anything — it might be in use" is why this snapshot is
     *  taken before the delete rather than reconstructed after it. */
    private _snapshot: TitleBlockTemplate | null = null;

    constructor(private templateId: string) {
        this.targetIds = [templateId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!titleBlockStore.has(this.templateId)) {
            return { ok: false, reason: `Title block '${this.templateId}' does not exist.` };
        }
        if (titleBlockStore.isBuiltin(this.templateId)) {
            return { ok: false, reason: 'Built-in title blocks cannot be deleted.' };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        this._snapshot = titleBlockStore.get(this.templateId) ?? null;
        const ok = titleBlockStore.delete(this.templateId);
        return { success: ok, affectedElementIds: [this.templateId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        const snap = this._snapshot;
        if (!snap) return { success: false, affectedElementIds: [] };
        const ok = titleBlockStore.restore(snap);
        return { success: ok, affectedElementIds: [snap.id] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { templateId: this.templateId, snapshot: this._snapshot },
            targetIds: this.targetIds, timestamp: this.timestamp, version: 1,
        };
    }
}
