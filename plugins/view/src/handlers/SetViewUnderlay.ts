// SetViewUnderlay handler — Phase F-1.1 (fully promoted from bridge-observability stub).
//
// Performs an authoritative Immer-patch mutation on the ViewRegistry.
// The legacy SetViewUnderlayCommand / commandManager.execute() dual-write in
// ViewPropertiesPanel.ts has been removed as of Phase F-1.1; this handler
// is now the sole state-mutation path for view.setUnderlay.
//
// Contract compliance:
//   §01 §2     — Command-first mutation via bus handler; no direct store write from UI
//   §01 §2.7   — No builders; no Three.js scene access
//   §03 §1.1   — ViewUnderlaySettings fields are serialisable primitives
//   §07        — No server routes; client-side only
//
// Undo: the inverse patch restores the previous ViewDefinition snapshot.

import type { CommandHandler, HandlerContext, HandlerResult, ValidationResult } from '@pryzm/plugin-sdk';
import { withHandlerSpan } from '@pryzm/plugin-sdk';
import type { ViewRegistry } from '@pryzm/plugin-sdk';

export interface SetViewUnderlayPayload {
  readonly viewId: string;
  readonly underlay: Record<string, unknown> | null;
}

type Stores = Readonly<{ view: ViewRegistry }>;

export const SetViewUnderlayHandler: CommandHandler<SetViewUnderlayPayload, Stores> = {
  type: 'view.setUnderlay',
  affectedStores: ['view'],

  canExecute(ctx: HandlerContext<Stores>, cmd: SetViewUnderlayPayload): ValidationResult {
    if (!cmd.viewId) return { valid: false, reason: 'viewId required' };
    if (!ctx.stores.view.getState().has(cmd.viewId)) {
      return { valid: false, reason: `ViewDefinition '${cmd.viewId}' does not exist.` };
    }
    return { valid: true };
  },

  execute(ctx: HandlerContext<Stores>, cmd: SetViewUnderlayPayload): HandlerResult {
    return withHandlerSpan('view.setUnderlay.handler', { 'pryzm.command.type': 'view.setUnderlay' }, () => {
      const existing = ctx.stores.view.getState().get(cmd.viewId);
      if (!existing) throw new Error(`ViewDefinition '${cmd.viewId}' not found during execute.`);

      const updated = { ...existing } as Record<string, unknown>;
      if (cmd.underlay !== null) {
        updated['underlay'] = cmd.underlay;
      } else {
        delete updated['underlay'];
      }

      console.log(`[CommandBus] view.setUnderlay — viewId=${cmd.viewId} underlay=${cmd.underlay === null ? 'cleared' : 'set'}`);

      return {
        forward: [{ op: 'replace', path: [cmd.viewId], value: updated }],
        inverse: [{ op: 'replace', path: [cmd.viewId], value: existing }],
      };
    }); // withHandlerSpan — C10 §2
  },
};
