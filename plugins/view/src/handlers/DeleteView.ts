// DeleteView handler (S17-T6b).
//
// Spec: PHASE-1C §S17 lines 793-795 (D6).
// ADR: docs/architecture/adr/0016-view-state-command-driven.md.
//
// Removes a ViewDefinition from the registry.
// affectedStores: ['view']

import type { CommandHandler, HandlerContext, HandlerResult, ValidationResult } from '@pryzm/plugin-sdk';
import { withHandlerSpan } from '@pryzm/plugin-sdk';
import type { ViewRegistry } from '@pryzm/plugin-sdk';
import type { ViewId } from '@pryzm/plugin-sdk';
import { ViewNotFoundError } from '../errors.js';

export interface DeleteViewPayload {
  readonly viewId: ViewId;
}

export type DeleteViewStores = { readonly view: ViewRegistry };

export const DeleteViewHandler: CommandHandler<DeleteViewPayload, DeleteViewStores> = {
  type: 'view.delete',
  affectedStores: ['view'],

  canExecute(ctx: HandlerContext<DeleteViewStores>, cmd: DeleteViewPayload): ValidationResult {
    if (!ctx.stores.view.getState().has(cmd.viewId)) {
      return { valid: false, reason: `View "${cmd.viewId}" not found.` };
    }
    return { valid: true };
  },

  execute(ctx: HandlerContext<DeleteViewStores>, cmd: DeleteViewPayload): HandlerResult {
    return withHandlerSpan('view.delete.handler', { 'pryzm.command.type': 'view.delete' }, () => {
    const existing = ctx.stores.view.getState().get(cmd.viewId);
    if (!existing) throw new ViewNotFoundError(cmd.viewId);

    return {
      forward: [{ op: 'remove', path: [cmd.viewId] }],
      inverse: [{ op: 'add', path: [cmd.viewId], value: existing }],
    };
    }); // withHandlerSpan — C10 §2
  },
};
