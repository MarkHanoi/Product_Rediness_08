// SetViewRange handler — Phase F-1.1 (fully promoted from bridge-observability stub).
//
// Performs an authoritative Immer-patch mutation on the ViewRegistry.
// The legacy SetViewRangeCommand / commandManager.execute() dual-write in
// ViewPropertiesPanel.ts has been removed as of Phase F-1.1; this handler
// is now the sole state-mutation path for view.setRange.
//
// Contract compliance:
//   §01 §2     — Command-first mutation via bus handler; no direct store write from UI
//   §01 §2.7   — No builders; no Three.js scene access
//   §03 §1.1   — ViewRangeSettings fields are serialisable primitives
//   §07        — No server routes; client-side only
//
// Undo: the inverse patch restores the previous ViewDefinition snapshot.

import type { CommandHandler, HandlerContext, HandlerResult, ValidationResult } from '@pryzm/plugin-sdk';
import { withHandlerSpan } from '@pryzm/plugin-sdk';
import type { ViewRegistry } from '@pryzm/plugin-sdk';

export interface SetViewRangePayload {
  readonly viewId: string;
  readonly viewRange: Record<string, unknown> | null;
}

type Stores = Readonly<{ view: ViewRegistry }>;

export const SetViewRangeHandler: CommandHandler<SetViewRangePayload, Stores> = {
  type: 'view.setRange',
  affectedStores: ['view'],

  canExecute(ctx: HandlerContext<Stores>, cmd: SetViewRangePayload): ValidationResult {
    if (!cmd.viewId) return { valid: false, reason: 'viewId required' };
    if (!ctx.stores.view.getState().has(cmd.viewId)) {
      return { valid: false, reason: `ViewDefinition '${cmd.viewId}' does not exist.` };
    }
    return { valid: true };
  },

  execute(ctx: HandlerContext<Stores>, cmd: SetViewRangePayload): HandlerResult {
    return withHandlerSpan('view.setRange.handler', { 'pryzm.command.type': 'view.setRange' }, () => {
      const existing = ctx.stores.view.getState().get(cmd.viewId);
      if (!existing) throw new Error(`ViewDefinition '${cmd.viewId}' not found during execute.`);

      const updated = { ...existing } as Record<string, unknown>;
      if (cmd.viewRange !== null) {
        updated['viewRange'] = cmd.viewRange;
      } else {
        delete updated['viewRange'];
      }

      console.log(`[CommandBus] view.setRange — viewId=${cmd.viewId} viewRange=${cmd.viewRange === null ? 'cleared' : 'set'}`);

      return {
        forward: [{ op: 'replace', path: [cmd.viewId], value: updated }],
        inverse: [{ op: 'replace', path: [cmd.viewId], value: existing }],
      };
    }); // withHandlerSpan — C10 §2
  },
};
