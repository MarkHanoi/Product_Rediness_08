// CreateTemplateHandler — F-1.3 migration bridge.
// Exfiltrates commandManager.execute(CreateTemplateCommand) from apps/editor/src/.
// TODO(F-1.4): replace with authoritative template-registry store update.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { CreateTemplateCommand  } from '@pryzm/command-registry';

export interface CreateTemplatePayload {
  readonly id: string;
  readonly name: string;
  readonly scope: string;
  readonly [k: string]: unknown;
}

export const CreateTemplateHandler: CommandHandler<CreateTemplatePayload, Record<string, unknown>> = {
  type: 'template.create',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: CreateTemplatePayload,
  ): ValidationResult {
    if (!cmd.id || !cmd.name) return { valid: false, reason: 'id and name are required' };
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: CreateTemplatePayload,
  ): HandlerResult {
    return withHandlerSpan('template.create.handler', { 'pryzm.command.type': 'template.create' }, () => {
      const cm = window.commandManager as { execute(cmd: unknown, options?: unknown): void } | undefined;
      if (cm) {
        try {
          cm.execute(new CreateTemplateCommand(cmd as any));
        } catch (e) {
          console.error('[template.create.handler] bridge failed:', e);
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  },
};
