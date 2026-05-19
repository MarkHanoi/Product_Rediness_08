// UpdateWallSystemTypeHandler — F-1.3 migration bridge.
// Covers both UpdateWallSystemTypeCommand (full type change) and
// UpdateWallLayersCommand (layer-only edit that fires wall.updateSystemType bus type).
// Exfiltrates commandManager.execute() from apps/editor/src/.
// TODO(F-1.4): merge into SetWallSystemTypeHandler + SetWallLayersHandler with
//              proper payload routing.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { UpdateWallSystemTypeCommand, UpdateWallLayersCommand  } from '@pryzm/command-registry';

export interface UpdateWallSystemTypePayload {
  readonly wallId: string;
  readonly systemTypeId?: string | null;
  readonly layers?: unknown[];
  readonly thickness?: number;
}

export const UpdateWallSystemTypeHandler: CommandHandler<UpdateWallSystemTypePayload, Record<string, unknown>> = {
  type: 'wall.updateSystemType',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateWallSystemTypePayload,
  ): ValidationResult {
    if (!cmd.wallId) return { valid: false, reason: 'wallId is required' };
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateWallSystemTypePayload,
  ): HandlerResult {
    return withHandlerSpan('wall.updateSystemType.handler', { 'pryzm.command.type': 'wall.updateSystemType' }, () => {
      const cm = window.commandManager as { execute(cmd: unknown, options?: unknown): void } | undefined;
      if (cm) {
        try {
          if (cmd.systemTypeId !== undefined && cmd.systemTypeId !== null) {
            cm.execute(new UpdateWallSystemTypeCommand({
              wallId: cmd.wallId,
              systemTypeId: cmd.systemTypeId,
              layers: (cmd.layers ?? null) as any,
              thickness: cmd.thickness,
            }));
          } else {
            cm.execute(new UpdateWallLayersCommand({
              wallId: cmd.wallId,
              layers: (cmd.layers ?? []) as any,
              thickness: cmd.thickness ?? 0,
              systemTypeId: cmd.systemTypeId ?? null,
            }));
          }
        } catch (e) {
          console.error('[wall.updateSystemType.handler] bridge failed:', e);
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  },
};
