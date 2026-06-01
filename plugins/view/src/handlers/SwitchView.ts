// SwitchView handler (S17-T6d).
//
// Spec: PHASE-1C §S17 lines 793-795 (D6), typed contract lines 856-862.
// ADR: docs/02-decisions/adrs/0016-view-state-command-driven.md.
//
// Updates ActiveViewStore to point to the given viewId.
// The view MUST exist in ViewRegistry.
// affectedStores: ['active-view']
//
// Note: `view.switch` mutates ONLY `active-view` (ephemeral).  The
// ViewDefinition itself is NOT mutated by a switch — only by
// CreateView / DeleteView / RenameView / UpdateViewCamera.
//
// Camera animation is driven by ViewController.switchTo() at L5 —
// this handler owns only the store mutation and event record.

import type { CommandHandler, HandlerContext, HandlerResult, ValidationResult } from '@pryzm/plugin-sdk';
import { withHandlerSpan } from '@pryzm/plugin-sdk';
import type { ViewRegistry } from '@pryzm/plugin-sdk';
import type { ViewId } from '@pryzm/plugin-sdk';
import type { ActiveViewStore } from '@pryzm/plugin-sdk';
import { ViewNotFoundError } from '../errors.js';

export interface SwitchViewPayload {
  readonly viewId: ViewId;
}

export type SwitchViewStores = {
  readonly view: ViewRegistry;
  readonly 'active-view': ActiveViewStore;
};

export const SwitchViewHandler: CommandHandler<SwitchViewPayload, SwitchViewStores> = {
  type: 'view.switch',
  affectedStores: ['active-view'],

  canExecute(ctx: HandlerContext<SwitchViewStores>, cmd: SwitchViewPayload): ValidationResult {
    if (!ctx.stores.view.getState().has(cmd.viewId)) {
      return { valid: false, reason: `View "${cmd.viewId}" not found.` };
    }
    return { valid: true };
  },

  execute(ctx: HandlerContext<SwitchViewStores>, cmd: SwitchViewPayload): HandlerResult {
    return withHandlerSpan('view.switch.handler', { 'pryzm.command.type': 'view.switch' }, () => {
    if (!ctx.stores.view.getState().has(cmd.viewId)) {
      throw new ViewNotFoundError(cmd.viewId);
    }

    const prev = ctx.stores['active-view'].getActive();

    return {
      forward: [{ op: 'replace', path: ['active', 'activeViewId'], value: cmd.viewId }],
      inverse: [{ op: 'replace', path: ['active', 'activeViewId'], value: prev.activeViewId }],
    };
    }); // withHandlerSpan — C10 §2
  },
};
