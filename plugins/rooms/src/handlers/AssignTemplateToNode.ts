// AssignTemplateToNodeHandler — F-1.3 migration bridge.
// Exfiltrates commandManager.execute(AssignTemplateToNodeCommand) from apps/editor/src/.
// TODO(F-1.4): replace with authoritative template-node-assignment store update.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { AssignTemplateToNodeCommand  } from '@pryzm/command-registry';

export interface AssignTemplateToNodePayload {
  readonly nodeId: string;
  readonly nodeType: string;
  readonly templateId: string;
  readonly assignedBy?: string;
}

export const AssignTemplateToNodeHandler: CommandHandler<AssignTemplateToNodePayload, Record<string, unknown>> = {
  type: 'template.assignToNode',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: AssignTemplateToNodePayload,
  ): ValidationResult {
    if (!cmd.nodeId || !cmd.templateId) return { valid: false, reason: 'nodeId and templateId are required' };
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: AssignTemplateToNodePayload,
  ): HandlerResult {
    return withHandlerSpan('template.assignToNode.handler', { 'pryzm.command.type': 'template.assignToNode' }, () => {
      const cm = window.commandManager as { execute(cmd: unknown, options?: unknown): void } | undefined;
      if (cm) {
        try {
          cm.execute(new AssignTemplateToNodeCommand(cmd as any));
        } catch (e) {
          console.error('[template.assignToNode.handler] bridge failed:', e);
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  },
};
