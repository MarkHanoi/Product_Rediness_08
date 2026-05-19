// UpdateElementMarkHandler — F-1.3 migration bridge.
// Exfiltrates commandManager.execute(UpdateElementMarkCommand) from apps/editor/src/.
// TODO(F-1.4): replace with authoritative element-registry store update.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { UpdateElementMarkCommand  } from '@pryzm/command-registry';

export interface UpdateElementMarkPayload {
  readonly elementId: string;
  readonly elementType?: string;
  readonly newMark: string;
}

export const UpdateElementMarkHandler: CommandHandler<UpdateElementMarkPayload, Record<string, unknown>> = {
  type: 'element.updateMark',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateElementMarkPayload,
  ): ValidationResult {
    if (!cmd.elementId) return { valid: false, reason: 'elementId is required' };
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateElementMarkPayload,
  ): HandlerResult {
    return withHandlerSpan('element.updateMark.handler', { 'pryzm.command.type': 'element.updateMark' }, () => {
      const cm = window.commandManager as { execute(cmd: unknown, options?: unknown): void } | undefined;
      if (cm) {
        try {
          cm.execute(new UpdateElementMarkCommand({
            elementId: cmd.elementId,
            elementType: cmd.elementType as any,
            newMark: cmd.newMark,
          }));
        } catch (e) {
          console.error('[element.updateMark.handler] bridge failed:', e);
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  },
};
