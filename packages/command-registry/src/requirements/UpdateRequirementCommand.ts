/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command layer (Class A — new command)
 * File:             src/commands/requirements/UpdateRequirementCommand.ts
 * Contract:         01-BIM-ENGINE-CORE-CONTRACT §2.1, §2.8
 *
 * Applies a partial update to an existing RoomRequirement.
 * Captures a structuredClone snapshot before mutation for full undo support.
 * Used by: Strategize spreadsheet cell edits, Template Propagation, AI Auto-Briefer.
 *
 * NEVER called directly from UI — always dispatched via commandManager.execute().
 */

import {
  Command,
  CommandType,
  CommandValidationResult,
  CommandResult,
  SerializedCommand,
  CommandContext,
} from '../types';
import { RequirementParamUpdate, RoomRequirement } from '@pryzm/core-app-model';
import { requirementStore } from '@pryzm/core-app-model';

export interface UpdateRequirementPayload {
  id: string;
  patch: RequirementParamUpdate;
  /** If true, the field being updated is added to overriddenFields list. */
  markAsOverride?: boolean;
  /** Field path for override tracking, e.g. 'parameters.spatial.targetArea_m2' */
  overrideField?: string;
}

export class UpdateRequirementCommand implements Command {
    readonly affectedStores = ["requirement"] as const;
  readonly id: string;
  readonly type = CommandType.UPDATE_REQUIREMENT;
  readonly timestamp: number;
  targetIds: string[];

  private _prevSnapshot: Readonly<RoomRequirement> | undefined;

  constructor(private readonly payload: UpdateRequirementPayload) {
    this.id = `cmd-req-update-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.timestamp = Date.now();
    this.targetIds = [payload.id];
  }

  canExecute(_ctx: CommandContext): CommandValidationResult {
    if (!this.payload.id) {
      return { ok: false, reason: 'UpdateRequirementCommand: id is required' };
    }
    if (!requirementStore.has(this.payload.id)) {
      return {
        ok: false,
        reason: `UpdateRequirementCommand: requirement '${this.payload.id}' not found`,
      };
    }
    return { ok: true };
  }

  execute(_ctx: CommandContext): CommandResult {
    try {
      // Step 1 — capture pre-state
      const existing = requirementStore.get(this.payload.id)!;
      this._prevSnapshot = structuredClone(existing);

      // Step 2 — build patch (append override field if requested)
      let patch = { ...this.payload.patch };
      if (this.payload.markAsOverride && this.payload.overrideField) {
        const current = existing.overriddenFields ?? [];
        if (!current.includes(this.payload.overrideField)) {
          patch = {
            ...patch,
            overriddenFields: [...current, this.payload.overrideField],
          };
        }
      }

      // Step 3 — write to store
      requirementStore.update(this.payload.id, patch);

      return { success: true, affectedElementIds: [this.payload.id] };

    } catch (err) {
      console.error('[UpdateRequirementCommand] execute failed:', err);
      return {
        success: false,
        affectedElementIds: [],
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  undo(_ctx: CommandContext): CommandResult {
    try {
      if (!this._prevSnapshot) {
        return { success: false, affectedElementIds: [], error: 'No snapshot to restore' };
      }

      requirementStore.remove(this.payload.id);
      requirementStore.add(structuredClone(this._prevSnapshot));

      return { success: true, affectedElementIds: [this.payload.id] };

    } catch (err) {
      console.error('[UpdateRequirementCommand] undo failed:', err);
      return {
        success: false,
        affectedElementIds: [],
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  serialize(): SerializedCommand {
    return {
      type:      this.type,
      payload:   structuredClone(this.payload),
      targetIds: [...this.targetIds],
      timestamp: this.timestamp,
      version:   1,
    };
  }
}
