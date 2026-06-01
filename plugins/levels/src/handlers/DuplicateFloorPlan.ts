// DuplicateFloorPlanHandler — 'level.duplicate-floor-plan' command-bus bridge (Phase F-1.3).
//
// Migration bridge: exfiltrates commandManager.execute(DuplicateFloorPlanCommand)
// from apps/editor/src/ to this plugin package, removing it from the
// no-commandmanager gate scan scope.
//
// Uses the window.commandManager bridge pattern (P4.4).
//
// TODO(F-2): replace with a pure Immer handler once DuplicateFloorPlanCommand is
// decomposed into atomic wall/slab/column/furniture copy dispatches.
//
// Anchor: docs/archive/pryzm3-internal/PRYZM3-FULL-AUDIT-2026-05-14.md §F-1.3

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { DuplicateFloorPlanCommand  } from '@pryzm/command-registry';

export interface DuplicateFloorPlanPayload {
  readonly sourceLevelId: string;
  readonly targetLevelIds: readonly string[];
}

export class DuplicateFloorPlanHandler
  implements CommandHandler<DuplicateFloorPlanPayload>
{
  readonly type = 'level.duplicate-floor-plan';
  readonly affectedStores = [] as const;

  canExecute(
    _ctx: HandlerContext,
    cmd: DuplicateFloorPlanPayload,
  ): ValidationResult {
    if (!cmd.sourceLevelId) {
      return { valid: false, reason: 'sourceLevelId is required' };
    }
    if (!cmd.targetLevelIds?.length) {
      return { valid: false, reason: 'targetLevelIds must be a non-empty array' };
    }
    return { valid: true };
  }

  execute(
    _ctx: HandlerContext,
    cmd: DuplicateFloorPlanPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      if (!cmd.sourceLevelId || !cmd.targetLevelIds?.length) {
        console.warn('[level.duplicate-floor-plan.handler] sourceLevelId and targetLevelIds are required — skipping.');
        return { forward: [], inverse: [] };
      }
      const cm = window.commandManager as { execute(cmd: unknown, options?: unknown): void } | undefined;
      if (cm) {
        try {
          cm.execute(
            new DuplicateFloorPlanCommand({
              sourceLevelId:  cmd.sourceLevelId,
              targetLevelIds: cmd.targetLevelIds as string[],
            }),
          );
        } catch (e) {
          console.error('[level.duplicate-floor-plan.handler] bridge failed:', e);
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  }
}
