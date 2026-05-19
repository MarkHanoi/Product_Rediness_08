// UpdateStairParametersHandler — F-1.3 migration bridge.
// Exfiltrates commandManager.execute(UpdateStairParametersCommand) from apps/editor/src/.
// TODO(F-1.4): replace with authoritative stair-store Immer update.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { UpdateStairParametersCommand  } from '@pryzm/command-registry';

export interface UpdateStairParametersPayload {
  readonly stairId: string;
  readonly updates: Record<string, unknown>;
}

export const UpdateStairParametersHandler: CommandHandler<UpdateStairParametersPayload, Record<string, unknown>> = {
  type: 'stair.updateParameters',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateStairParametersPayload,
  ): ValidationResult {
    if (!cmd.stairId) return { valid: false, reason: 'stairId is required' };
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateStairParametersPayload,
  ): HandlerResult {
    return withHandlerSpan('stair.updateParameters.handler', { 'pryzm.command.type': 'stair.updateParameters' }, () => {
      const cm = window.commandManager as { execute(cmd: unknown, options?: unknown): void } | undefined;
      if (cm) {
        try {
          cm.execute(new UpdateStairParametersCommand({ stairId: cmd.stairId, updates: cmd.updates }));
        } catch (e) {
          console.error('[stair.updateParameters.handler] bridge failed:', e);
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  },
};
