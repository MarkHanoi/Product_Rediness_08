/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command layer (Class A — new command)
 * File:             src/commands/requirements/SetRoomRequirementCommand.ts
 * Contract:         01-BIM-ENGINE-CORE-CONTRACT §2.1, §2.8
 *
 * Creates a brand-new RoomRequirement in the RequirementStore.
 * Uses structuredClone for all snapshots. Fully undo-able.
 *
 * Flow: CommandManager → SetRoomRequirementCommand → RequirementStore → StoreEventBus // TODO(TASK-08)
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
import { buildDefaultRequirement } from './requirementDefaults';

export interface SetRoomRequirementPayload {
  id: string;            // stable UUID — supplied by caller, never generated here
  roomId: string;
  levelId: string;
  name: string;
  department?: string;
  templateId?: string;
  /** Partial override of default parameters. */
  parameters?: Partial<RoomRequirement['parameters']>;
}

export class SetRoomRequirementCommand implements Command {
    readonly affectedStores = ["requirement"] as const;
  readonly id: string;
  readonly type = CommandType.SET_ROOM_REQUIREMENT;
  readonly timestamp: number;
  targetIds: string[];

  private _snapshot: Readonly<RoomRequirement> | undefined;

  constructor(private readonly payload: SetRoomRequirementPayload) {
    this.id = `cmd-req-set-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.timestamp = Date.now();
    this.targetIds = [payload.id];
  }

  canExecute(_ctx: CommandContext): CommandValidationResult {
    if (!this.payload.id) {
      return { ok: false, reason: 'SetRoomRequirementCommand: id is required' };
    }
    if (!this.payload.roomId) {
      return { ok: false, reason: 'SetRoomRequirementCommand: roomId is required' };
    }
    if (!this.payload.levelId) {
      return { ok: false, reason: 'SetRoomRequirementCommand: levelId is required' };
    }
    if (!this.payload.name || this.payload.name.trim() === '') {
      return { ok: false, reason: 'SetRoomRequirementCommand: name is required' };
    }
    return { ok: true };
  }

  execute(_ctx: CommandContext): CommandResult {
    try {
      // Step 1 — capture pre-state snapshot for undo
      this._snapshot = requirementStore.has(this.payload.id)
        ? structuredClone(requirementStore.get(this.payload.id)!)
        : undefined;

      // Step 2 — build the requirement (use defaults, apply payload parameters)
      const base = buildDefaultRequirement(
        this.payload.id,
        this.payload.roomId,
        this.payload.levelId,
        this.payload.name,
      );

      const requirement: RoomRequirement = {
        ...base,
        department: this.payload.department,
        templateId: this.payload.templateId,
        parameters: this.payload.parameters
          ? mergeParameters(base.parameters, this.payload.parameters)
          : base.parameters,
      };

      // Step 3 — write to store (triggers StoreEventBus + DOM event)
      if (this._snapshot) {
        // Updating an existing entry: remove then re-add (simpler than update path)
        requirementStore.remove(this.payload.id);
      }
      requirementStore.add(requirement);

      console.log(`[SetRoomRequirementCommand] Created requirement: ${this.payload.id}`);
      return { success: true, affectedElementIds: [this.payload.id] };

    } catch (err) {
      console.error('[SetRoomRequirementCommand] execute failed:', err);
      return {
        success: false,
        affectedElementIds: [],
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  undo(_ctx: CommandContext): CommandResult {
    try {
      requirementStore.remove(this.payload.id);

      if (this._snapshot) {
        // Restore the previous state that was overwritten
        requirementStore.add(structuredClone(this._snapshot));
      }

      console.log(`[SetRoomRequirementCommand] Undone: ${this.payload.id}`);
      return { success: true, affectedElementIds: [this.payload.id] };

    } catch (err) {
      console.error('[SetRoomRequirementCommand] undo failed:', err);
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

// ── Deep-merge helper ─────────────────────────────────────────────────────────

function mergeParameters(
  base: RoomRequirement['parameters'],
  overrides: Partial<RoomRequirement['parameters']>,
): RoomRequirement['parameters'] {
  return {
    spatial:  { ...base.spatial,  ...(overrides.spatial  ?? {}) },
    physics:  { ...base.physics,  ...(overrides.physics  ?? {}) },
    finishes: { ...base.finishes, ...(overrides.finishes ?? {}) },
    assets: {
      ...base.assets,
      ...(overrides.assets ?? {}),
      requiredAssets: overrides.assets?.requiredAssets
        ? [...overrides.assets.requiredAssets]
        : [...base.assets.requiredAssets],
    },
    safety: { ...base.safety, ...(overrides.safety ?? {}) },
  };
}
