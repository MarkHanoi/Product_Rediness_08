// SetViewProjectionHandler — F-1.3 migration bridge.
// TODO(F-1.4): replace with authoritative view-definition store update.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { SetViewProjectionCommand  } from '@pryzm/command-registry';

export interface SetViewProjectionPayload {
  readonly viewDefinitionId: string;
  readonly projection: {
    readonly type: string;
    readonly camera: {
      readonly position: [number, number, number];
      readonly target: [number, number, number];
      readonly up: [number, number, number];
      readonly fov?: number;
      readonly zoom?: number;
    };
  };
}

export const SetViewProjectionHandler: CommandHandler<SetViewProjectionPayload, Record<string, unknown>> = {
  type: 'view.setProjection',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: SetViewProjectionPayload,
  ): ValidationResult {
    if (!cmd.viewDefinitionId) return { valid: false, reason: 'viewDefinitionId is required' };
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: SetViewProjectionPayload,
  ): HandlerResult {
    return withHandlerSpan('view.setProjection.handler', { 'pryzm.command.type': 'view.setProjection' }, () => {
      const cm = window.commandManager as { execute(cmd: unknown, options?: unknown): void } | undefined;
      if (cm) {
        try {
          cm.execute(new SetViewProjectionCommand(cmd as any));
        } catch (e) {
          console.error('[view.setProjection.handler] bridge failed:', e);
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  },
};
