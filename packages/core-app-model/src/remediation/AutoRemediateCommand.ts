/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command layer (Class A — composite orchestrator command)
 * File:             src/core/remediation/AutoRemediateCommand.ts
 * Contract:         01-BIM-ENGINE-CORE-CONTRACT §2.1, §2.8
 *                   05-BIM-UI-ARCHITECTURE-CONTRACT §3 (aud- prefix for UI interactions)
 *
 * Orchestrates auto-remediation of failing DeltaEntry records for a given room.
 * Dispatches individual UpdateRequirementCommand sub-commands through CommandManager.
 * Each sub-command lands on the undo stack individually (nonUndoable: false per sub-cmd).
 *
 * CONTRACT RULES:
 *   - NEVER mutates stores directly — delegates to UpdateRequirementCommand
 *   - nonUndoable: true (sub-commands carry the undo granularity)
 *   - undo() is a deliberate no-op with an explanatory message
 *   - Accepts the current actual value as the new accepted requirement (tolerances)
 *   - Only handles spatial/finishes metrics — logs skip for unsupported metrics
 */

import {
  Command,
  CommandType,
  CommandValidationResult,
  CommandResult,
  SerializedCommand,
  CommandContext,
} from '@pryzm/command-registry';
import { DeltaEntry } from '../comparison/ComparisonEngine';
import { UpdateRequirementCommand } from '@pryzm/command-registry';
import { requirementStore } from '../requirements/RequirementStore';

export interface AutoRemediatePayload {
  roomId:  string;
  entries: readonly DeltaEntry[];
}

export class AutoRemediateCommand implements Command {
  /**
   * VIEW-SYSTEM-AUDIT-2026 F4.4 — declares the union of all sub-commands it
   * dispatches.  Currently only UpdateRequirementCommand → 'requirement'
   * (not in StoreKey union; declared as string literal — unknown keys are
   * a runtime no-op for snapshot but still satisfy the required field).
   */
  readonly affectedStores = ['requirement'] as const;
  readonly id:        string;
  readonly type       = CommandType.AUTO_REMEDIATE;
  readonly timestamp: number;
  readonly targetIds: string[];
  readonly nonUndoable = true;

  private _remediatedCount = 0;
  private _skippedMetrics:  string[] = [];

  constructor(private readonly payload: AutoRemediatePayload) {
    this.id        = `cmd-auto-rem-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.timestamp = Date.now();
    this.targetIds = [payload.roomId];
  }

  canExecute(_ctx: CommandContext): CommandValidationResult {
    if (!this.payload.roomId) {
      return { ok: false, reason: 'AutoRemediateCommand: roomId is required' };
    }
    if (!this.payload.entries || this.payload.entries.length === 0) {
      return { ok: false, reason: 'AutoRemediateCommand: no delta entries provided' };
    }
    const failingEntries = this.payload.entries.filter(e => e.status === 'FAIL');
    if (failingEntries.length === 0) {
      return { ok: false, reason: 'AutoRemediateCommand: no FAIL entries to remediate' };
    }
    return { ok: true };
  }

  execute(_ctx: CommandContext): CommandResult {
    const cmdManager = window.commandManager; // TODO(TASK-06)
    if (!cmdManager) {
      return { success: false, affectedElementIds: [], error: 'AutoRemediateCommand: commandManager not available on window' };
    }

    const failingEntries = this.payload.entries.filter(e => e.status === 'FAIL');
    const reqs = requirementStore.getByRoomId(this.payload.roomId);
    const req = reqs[0]; // Use first requirement for this room (typical case: 1 per room)

    for (const entry of failingEntries) {
      const subCmd = this._buildSubCommand(entry, req);
      if (subCmd) {
        cmdManager.execute(subCmd, { source: 'HUMAN_DIRECT' });
        this._remediatedCount++;
      } else {
        this._skippedMetrics.push(entry.metric);
      }
    }

    const msg = [
      `AutoRemediate: ${this._remediatedCount} fix(es) applied to room ${this.payload.roomId}`,
      this._skippedMetrics.length > 0
        ? `Skipped (manual review needed): ${this._skippedMetrics.join(', ')}`
        : null,
    ].filter(Boolean).join(' | ');

    console.log(`[AutoRemediateCommand] ${msg}`);
    return { success: true, affectedElementIds: [], info: [msg] };
  }

  undo(_ctx: CommandContext): CommandResult {
    return {
      success: true,
      affectedElementIds: [],
      info: ['AutoRemediateCommand is non-undoable. Use Ctrl+Z to undo each sub-command individually.'],
    };
  }

  serialize(): SerializedCommand {
    return {
      type:      this.type,
      timestamp: this.timestamp,
      targetIds: this.targetIds,
      version:   1,
      payload:   { roomId: this.payload.roomId, entryCount: this.payload.entries.length },
    };
  }

  // ── Sub-command builder ────────────────────────────────────────────────────

  private _buildSubCommand(entry: DeltaEntry, req: any): UpdateRequirementCommand | null {
    if (!req) return null;

    switch (entry.metric) {
      case 'Area (m²)': {
        const actual = typeof entry.actual === 'number' ? entry.actual : parseFloat(entry.actual as string);
        if (isNaN(actual)) return null;
        return new UpdateRequirementCommand({
          id:             req.id,
          patch:          { parameters: { spatial: { targetArea_m2: actual } } },
          markAsOverride: true,
          overrideField:  'parameters.spatial.targetArea_m2',
        });
      }

      case 'Floor Finish':
      case 'Wall Finish':
      case 'Ceiling Type': {
        const actualFinish = entry.actual as string;
        if (!actualFinish || actualFinish === 'N/A') return null;
        const finishKey = entry.metric === 'Floor Finish' ? 'floorFinish'
                        : entry.metric === 'Wall Finish'  ? 'wallFinish'
                        :                                   'ceilingType';
        return new UpdateRequirementCommand({
          id:             req.id,
          patch:          { parameters: { finishes: { [finishKey]: actualFinish } } } as any,
          markAsOverride: true,
          overrideField:  `parameters.finishes.${finishKey}`,
        });
      }

      default:
        return null;
    }
  }
}
