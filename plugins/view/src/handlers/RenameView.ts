// RenameView handler (S17-T6c).
//
// Spec: PHASE-1C §S17 lines 793-795 (D6).
// ADR: docs/02-decisions/adrs/0016-view-state-command-driven.md.
//
// Renames an existing view (updates the `name` field only).
// affectedStores: ['view']

import type { CommandHandler, HandlerContext, HandlerResult, ValidationResult } from '@pryzm/plugin-sdk';
import { withHandlerSpan } from '@pryzm/plugin-sdk';
import type { ViewRegistry } from '@pryzm/plugin-sdk';
import type { ViewId } from '@pryzm/plugin-sdk';
import { ViewNotFoundError, ViewValidationError } from '../errors.js';

export interface RenameViewPayload {
  readonly viewId: ViewId;
  readonly name: string;
}

export type RenameViewStores = { readonly view: ViewRegistry };

export const RenameViewHandler: CommandHandler<RenameViewPayload, RenameViewStores> = {
  type: 'view.rename',
  affectedStores: ['view'],

  canExecute(ctx: HandlerContext<RenameViewStores>, cmd: RenameViewPayload): ValidationResult {
    if (!ctx.stores.view.getState().has(cmd.viewId)) {
      return { valid: false, reason: `View "${cmd.viewId}" not found.` };
    }
    if (!cmd.name || cmd.name.trim().length === 0) {
      return { valid: false, reason: 'View name must be non-empty.' };
    }
    return { valid: true };
  },

  execute(ctx: HandlerContext<RenameViewStores>, cmd: RenameViewPayload): HandlerResult {
    return withHandlerSpan('view.rename.handler', { 'pryzm.command.type': 'view.rename' }, () => {
    const existing = ctx.stores.view.getState().get(cmd.viewId);
    if (!existing) throw new ViewNotFoundError(cmd.viewId);

    const trimmed = cmd.name.trim();
    if (!trimmed) throw new ViewValidationError('View name must be non-empty.');

    return {
      forward: [{ op: 'replace', path: [cmd.viewId, 'name'], value: trimmed }],
      inverse: [{ op: 'replace', path: [cmd.viewId, 'name'], value: existing.name }],
    };
    }); // withHandlerSpan — C10 §2
  },
};
