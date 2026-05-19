// SetElementGraphicOverrideHandler — F-1.3 migration bridge.
// TODO(F-1.4): replace with authoritative view-definition store update.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { SetGraphicOverrideCommand  } from '@pryzm/command-registry';

export interface SetElementGraphicOverridePayload {
  readonly viewId: string;
  readonly scope: string;
  readonly elementId: string;
  readonly category: string;
  readonly overrides: Record<string, unknown>;
  readonly source?: string;
}

export const SetElementGraphicOverrideHandler: CommandHandler<SetElementGraphicOverridePayload, Record<string, unknown>> = {
  type: 'element.setGraphicOverride',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: SetElementGraphicOverridePayload,
  ): ValidationResult {
    if (!cmd.viewId || !cmd.elementId) return { valid: false, reason: 'viewId and elementId are required' };
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: SetElementGraphicOverridePayload,
  ): HandlerResult {
    return withHandlerSpan('element.setGraphicOverride.handler', { 'pryzm.command.type': 'element.setGraphicOverride' }, () => {
      const cm = window.commandManager as { execute(cmd: unknown, options?: unknown): void } | undefined;
      if (cm) {
        try {
          cm.execute(
            new SetGraphicOverrideCommand(cmd.viewId, cmd.scope as any, cmd.elementId, cmd.category as any, cmd.overrides as any),
            { source: cmd.source ?? 'BUS' },
          );
        } catch (e) {
          console.error('[element.setGraphicOverride.handler] bridge failed:', e);
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  },
};
