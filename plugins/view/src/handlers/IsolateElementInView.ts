// IsolateElementInViewHandler — F-1.3 migration bridge.
// TODO(F-1.4): replace with authoritative view-definition store update.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { IsolateElementInViewCommand  } from '@pryzm/command-registry';

export interface IsolateElementInViewPayload {
  readonly viewId: string;
  readonly elementId: string;
  readonly source?: string;
}

export const IsolateElementInViewHandler: CommandHandler<IsolateElementInViewPayload, Record<string, unknown>> = {
  type: 'element.isolateInView',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: IsolateElementInViewPayload,
  ): ValidationResult {
    if (!cmd.viewId || !cmd.elementId) return { valid: false, reason: 'viewId and elementId are required' };
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: IsolateElementInViewPayload,
  ): HandlerResult {
    return withHandlerSpan('element.isolateInView.handler', { 'pryzm.command.type': 'element.isolateInView' }, () => {
      const cm = window.commandManager as { execute(cmd: unknown, options?: unknown): void } | undefined;
      if (cm) {
        try {
          cm.execute(new IsolateElementInViewCommand(cmd.viewId, cmd.elementId), { source: cmd.source ?? 'BUS' });
        } catch (e) {
          console.error('[element.isolateInView.handler] bridge failed:', e);
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  },
};
