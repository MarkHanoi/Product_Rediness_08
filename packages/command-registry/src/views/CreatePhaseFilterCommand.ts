/**
 * CreatePhaseFilterCommand — Phase VII
 *
 * Creates a new user-defined PhaseFilter entity in the PhaseFilterStore.
 * Built-in filter IDs are rejected by the store.
 * Undo removes the created filter.
 *
 * Contract compliance:
 *   §01 §2, §4 — Mutation via CommandManager, undo/redo supported
 *   §02         — PlanOrdering priority 5
 *   §05         — Pure command; no DOM, no Three.js
 *   §07         — Client-side only
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext,
} from '../types';
import { phaseFilterStore } from '@pryzm/core-app-model';
import type { PhaseFilter, PhaseFilterRule } from '@pryzm/core-app-model';
import { BUILT_IN_PHASE_FILTER_IDS } from '@pryzm/core-app-model';

export interface CreatePhaseFilterParams {
    id:           string;
    name:         string;
    description?: string;
    rules?:       PhaseFilterRule[];
    intent?:      string;
    createdBy?:   string;
}

const BUILT_IN_IDS = new Set<string>(Object.values(BUILT_IN_PHASE_FILTER_IDS));

export class CreatePhaseFilterCommand implements Command {
    readonly affectedStores = ["view"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.CREATE_PHASE_FILTER;
    timestamp = Date.now();
    targetIds: string[];

    private _params:  CreatePhaseFilterParams;
    private _created: PhaseFilter | null = null;

    constructor(params: CreatePhaseFilterParams) {
        this._params  = params;
        this.targetIds = [params.id];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!this._params.id || !this._params.name) {
            return { ok: false, reason: 'id and name are required.' };
        }
        if (BUILT_IN_IDS.has(this._params.id)) {
            return { ok: false, reason: `'${this._params.id}' is a reserved built-in phase filter ID.` };
        }
        if (phaseFilterStore.has(this._params.id)) {
            return { ok: false, reason: `PhaseFilter '${this._params.id}' already exists.` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        this._created = phaseFilterStore.create(this._params);
        if (!this._created) {
            return {
                success: false,
                affectedElementIds: [],
                error: `Filter id="${this._params.id}" already exists or is a built-in.`,
            };
        }
        console.log(`[CreatePhaseFilterCommand] Created filter "${this._params.name}" (${this._params.id})`);
        return { success: true, affectedElementIds: [this._params.id] };
    }

    undo(_ctx: CommandContext): CommandResult {
        if (this._created) {
            phaseFilterStore.delete(this._created.id);
            console.log(`[CreatePhaseFilterCommand.undo] Deleted filter "${this._created.id}"`);
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
