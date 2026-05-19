/**
 * CreateViewTemplateCommand — Phase VII
 *
 * Creates a new ViewTemplate entity in the ViewTemplateStore.
 * Undo removes the created template.
 *
 * Contract compliance:
 *   §01 §2, §4 — Mutation via CommandManager, undo/redo supported
 *   §02         — PlanOrdering priority 5
 *   §03 §1.1   — ViewTemplate is schema-stable
 *   §05        — Pure command; no DOM, no Three.js
 *   §07        — Client-side only
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext,
} from '../types';
import { viewTemplateStore } from '@pryzm/core-app-model';
import type { ViewTemplate } from '@pryzm/core-app-model';
import type {
    ViewTemplateLock,
    ViewOutputSettings,
    ViewTemporalContext,
    AnnotationVisibilitySettings,
    VisibilityRuleStub,
} from '@pryzm/core-app-model';

export interface CreateViewTemplateParams {
    id:           string;
    name:         string;
    description?: string;
    discipline?:  ViewTemplate['discipline'];
    vgTemplateId?: string;
    output?:      ViewOutputSettings;
    temporal?:    ViewTemporalContext;
    annotationOverrides?: AnnotationVisibilitySettings;
    rules?:       VisibilityRuleStub[];
    lockedFields?: (keyof ViewTemplateLock)[];
    intent?:      string;
    createdBy?:   string;
}

export class CreateViewTemplateCommand implements Command {
    readonly affectedStores = ["view"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.CREATE_VIEW_TEMPLATE;
    timestamp = Date.now();
    targetIds: string[];

    private _params:  CreateViewTemplateParams;
    private _created: ViewTemplate | null = null;

    constructor(params: CreateViewTemplateParams) {
        this._params  = params;
        this.targetIds = [params.id];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!this._params.id || !this._params.name) {
            return { ok: false, reason: 'id and name are required.' };
        }
        if (viewTemplateStore.has(this._params.id)) {
            return { ok: false, reason: `ViewTemplate '${this._params.id}' already exists.` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        this._created = viewTemplateStore.create(this._params);
        if (!this._created) {
            return { success: false, affectedElementIds: [], error: `Template id="${this._params.id}" already exists.` };
        }
        console.log(`[CreateViewTemplateCommand] Created template "${this._params.name}" (${this._params.id})`);
        return { success: true, affectedElementIds: [this._params.id] };
    }

    undo(_ctx: CommandContext): CommandResult {
        if (this._created) {
            viewTemplateStore.delete(this._created.id);
            console.log(`[CreateViewTemplateCommand.undo] Deleted template "${this._created.id}"`);
        }
        return { success: true, affectedElementIds: this.targetIds };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { params: this._params },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}
