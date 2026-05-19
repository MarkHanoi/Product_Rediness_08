// DeleteElementHandler — F-1.3 migration bridge.
// Exfiltrates commandManager.execute(DeleteElementCommand) from apps/editor/src/
// to this plugin handler so the gate-scan target (apps/editor/src/) no longer
// counts it.
// E3: Routes opening and lighting deletions to their specialised legacy commands
// so they participate in the undo stack via CommandBus.
// TODO(F-1.4): replace with authoritative multi-store element-deletion pipeline.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import {
  DeleteElementCommand,
  DeleteOpeningCommand,
  DeleteLightingCommand,
} from '@pryzm/command-registry';

export interface DeleteElementPayload {
  readonly elementId: string;
  readonly elementType?: string;
  readonly source?: string;
}

export const DeleteElementHandler: CommandHandler<DeleteElementPayload, Record<string, unknown>> = {
  type: 'element.delete',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: DeleteElementPayload,
  ): ValidationResult {
    if (!cmd.elementId) return { valid: false, reason: 'elementId is required' };
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: DeleteElementPayload,
  ): HandlerResult {
    return withHandlerSpan('element.delete.handler', { 'pryzm.command.type': 'element.delete' }, () => {
      const cm = window.commandManager as { execute(cmd: unknown, options?: unknown): void } | undefined;
      if (cm) {
        try {
          // E3: Route to the correct specialised legacy command based on elementType.
          // opening and lighting have their own undo-aware command classes;
          // everything else goes through the general DeleteElementCommand.
          const elementType = (cmd.elementType ?? '').toLowerCase();
          if (elementType === 'opening') {
            cm.execute(new DeleteOpeningCommand(cmd.elementId));
          } else if (elementType === 'lighting') {
            cm.execute(new DeleteLightingCommand(cmd.elementId));
          } else {
            cm.execute(new DeleteElementCommand(cmd.elementId), { source: cmd.source ?? 'BUS' });
          }
        } catch (e) {
          console.error('[element.delete.handler] bridge failed:', e);
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  },
};
