// HideElementInViewHandler — F-1.3 migration bridge.
// TODO(F-1.4): replace with authoritative view-definition store update.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { HideElementInViewCommand  } from '@pryzm/command-registry';

export interface HideElementInViewPayload {
  readonly viewId: string;
  readonly elementId: string;
  readonly source?: string;
}

export const HideElementInViewHandler: CommandHandler<HideElementInViewPayload, Record<string, unknown>> = {
  type: 'element.hideInView',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: HideElementInViewPayload,
  ): ValidationResult {
    if (!cmd.viewId || !cmd.elementId) return { valid: false, reason: 'viewId and elementId are required' };
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: HideElementInViewPayload,
  ): HandlerResult {
    return withHandlerSpan('element.hideInView.handler', { 'pryzm.command.type': 'element.hideInView' }, () => {
      const cm = window.commandManager as { execute(cmd: unknown, options?: unknown): void } | undefined;
      if (cm) {
        try {
          cm.execute(new HideElementInViewCommand(cmd.viewId, cmd.elementId), { source: cmd.source ?? 'BUS' });
        } catch (e) {
          console.error('[element.hideInView.handler] bridge failed:', e);
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  },
};
