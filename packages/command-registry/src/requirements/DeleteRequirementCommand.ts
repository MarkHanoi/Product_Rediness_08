/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command layer (Class A — new command)
 * File:             src/commands/requirements/DeleteRequirementCommand.ts
 * Contract:         01-BIM-ENGINE-CORE-CONTRACT §2.1, §2.8
 *
 * Removes a RoomRequirement from the RequirementStore.
 * Captures a structuredClone snapshot for full undo support.
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
import { RoomRequirement } from '@pryzm/core-app-model';
import { requirementStore } from '@pryzm/core-app-model';

export class DeleteRequirementCommand implements Command {
    readonly affectedStores = ["requirement"] as const;
  readonly id: string;
  readonly type = CommandType.DELETE_REQUIREMENT;
  readonly timestamp: number;
  targetIds: string[];

  private _snapshot: Readonly<RoomRequirement> | undefined;

  constructor(private readonly requirementId: string) {
    this.id = `cmd-req-delete-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.timestamp = Date.now();
    this.targetIds = [requirementId];
  }

  canExecute(_ctx: CommandContext): CommandValidationResult {
    if (!this.requirementId) {
      return { ok: false, reason: 'DeleteRequirementCommand: requirementId is required' };
    }
    if (!requirementStore.has(this.requirementId)) {
      return {
        ok: false,
        reason: `DeleteRequirementCommand: requirement '${this.requirementId}' not found`,
      };
    }
    return { ok: true };
  }

  execute(_ctx: CommandContext): CommandResult {
    try {
      // Capture snapshot before deletion
      this._snapshot = structuredClone(requirementStore.get(this.requirementId)!);
      requirementStore.remove(this.requirementId);

      console.log(`[DeleteRequirementCommand] Deleted: ${this.requirementId}`);
      return { success: true, affectedElementIds: [this.requirementId] };

    } catch (err) {
      console.error('[DeleteRequirementCommand] execute failed:', err);
      return {
        success: false,
        affectedElementIds: [],
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  undo(_ctx: CommandContext): CommandResult {
    try {
      if (!this._snapshot) {
        return {
          success: false,
          affectedElementIds: [],
          error: 'DeleteRequirementCommand: no snapshot to restore',
        };
      }

      requirementStore.add(structuredClone(this._snapshot));

      console.log(`[DeleteRequirementCommand] Undone (restored): ${this.requirementId}`);
      return { success: true, affectedElementIds: [this.requirementId] };

    } catch (err) {
      console.error('[DeleteRequirementCommand] undo failed:', err);
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
      payload:   { requirementId: this.requirementId },
      targetIds: [...this.targetIds],
      timestamp: this.timestamp,
      version:   1,
    };
  }
}
