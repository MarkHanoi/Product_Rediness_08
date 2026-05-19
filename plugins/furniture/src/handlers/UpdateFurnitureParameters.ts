// UpdateFurnitureParametersHandler — F-1.3 migration bridge.
// Exfiltrates commandManager.execute(UpdateFurnitureParametersCommand) from apps/editor/src/.
// TODO(F-1.4): replace with authoritative furniture-store Immer update.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { UpdateFurnitureParametersCommand  } from '@pryzm/command-registry';

export interface UpdateFurnitureParametersPayload {
  readonly id: string;
  readonly [k: string]: unknown;
}

export const UpdateFurnitureParametersHandler: CommandHandler<UpdateFurnitureParametersPayload, Record<string, unknown>> = {
  type: 'furniture.updateParameters',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateFurnitureParametersPayload,
  ): ValidationResult {
    if (!cmd.id) return { valid: false, reason: 'furniture id is required' };
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateFurnitureParametersPayload,
  ): HandlerResult {
    return withHandlerSpan('furniture.updateParameters.handler', { 'pryzm.command.type': 'furniture.updateParameters' }, () => {
      const cm = window.commandManager as { execute(cmd: unknown, options?: unknown): void } | undefined;
      if (cm) {
        try {
          cm.execute(new UpdateFurnitureParametersCommand(cmd as any));
        } catch (e) {
          console.error('[furniture.updateParameters.handler] bridge failed:', e);
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  },
};
