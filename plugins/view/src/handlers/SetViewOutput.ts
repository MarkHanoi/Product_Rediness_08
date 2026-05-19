// SetViewOutput handler — Phase F-1.1 (fully promoted from bridge-observability stub).
//
// Performs an authoritative Immer-patch mutation on the ViewRegistry.
// The legacy SetViewOutputCommand / commandManager.execute() dual-write in
// ViewPropertiesPanel.ts has been removed as of Phase F-1.1; this handler
// is now the sole state-mutation path for view.setOutput.
//
// Contract compliance:
//   §01 §2     — Command-first mutation via bus handler; no direct store write from UI
//   §01 §2.7   — No builders; no Three.js scene access
//   §03 §1.1   — ViewOutputSettings fields are serialisable primitives
//   §07        — No server routes; client-side only
//
// Undo: the inverse patch restores the previous ViewDefinition snapshot.

import type { CommandHandler, HandlerContext, HandlerResult, ValidationResult } from '@pryzm/plugin-sdk';
import { withHandlerSpan } from '@pryzm/plugin-sdk';
import type { ViewRegistry } from '@pryzm/plugin-sdk';

export interface SetViewOutputPayload {
  readonly viewId: string;
  readonly output: Record<string, unknown> | null;
}

type Stores = Readonly<{ view: ViewRegistry }>;

export const SetViewOutputHandler: CommandHandler<SetViewOutputPayload, Stores> = {
  type: 'view.setOutput',
  affectedStores: ['view'],

  canExecute(ctx: HandlerContext<Stores>, cmd: SetViewOutputPayload): ValidationResult {
    if (!cmd.viewId) return { valid: false, reason: 'viewId is required' };
    if (!ctx.stores.view.getState().has(cmd.viewId)) {
      return { valid: false, reason: `ViewDefinition '${cmd.viewId}' does not exist.` };
    }
    return { valid: true };
  },

  execute(ctx: HandlerContext<Stores>, cmd: SetViewOutputPayload): HandlerResult {
    return withHandlerSpan('view.setOutput.handler', { 'pryzm.command.type': 'view.setOutput' }, () => {
      const existing = ctx.stores.view.getState().get(cmd.viewId);
      if (!existing) throw new Error(`ViewDefinition '${cmd.viewId}' not found during execute.`);

      const updated = { ...existing } as Record<string, unknown>;
      if (cmd.output !== null) {
        updated['output'] = cmd.output;
      } else {
        delete updated['output'];
      }

      console.log(`[CommandBus] view.setOutput — viewId=${cmd.viewId} output=${cmd.output === null ? 'cleared' : 'set'}`);

      return {
        forward: [{ op: 'replace', path: [cmd.viewId], value: updated }],
        inverse: [{ op: 'replace', path: [cmd.viewId], value: existing }],
      };
    }); // withHandlerSpan — C10 §2
  },
};
