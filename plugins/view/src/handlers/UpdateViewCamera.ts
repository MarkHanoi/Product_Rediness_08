// UpdateViewCamera handler (S17-T6e).
//
// Spec: PHASE-1C §S17 lines 793-795 (D6).
// ADR: docs/02-decisions/adrs/0016-view-state-command-driven.md.
//
// Persists the camera pose back into the ViewDefinition.  Called when
// the user stops orbiting so "save this camera position to the view"
// is supported.
// affectedStores: ['view']

import type { CommandHandler, HandlerContext, HandlerResult, ValidationResult } from '@pryzm/plugin-sdk';
import { withHandlerSpan } from '@pryzm/plugin-sdk';
import type { ViewRegistry, ViewDefinition } from '@pryzm/plugin-sdk';
import type { ViewId } from '@pryzm/plugin-sdk';
import { ViewNotFoundError } from '../errors.js';

export interface UpdateViewCameraPayload {
  readonly viewId: ViewId;
  readonly camera: ViewDefinition['camera'];
}

export type UpdateViewCameraStores = { readonly view: ViewRegistry };

export const UpdateViewCameraHandler: CommandHandler<UpdateViewCameraPayload, UpdateViewCameraStores> = {
  type: 'view.updateCamera',
  affectedStores: ['view'],

  canExecute(ctx: HandlerContext<UpdateViewCameraStores>, cmd: UpdateViewCameraPayload): ValidationResult {
    if (!ctx.stores.view.getState().has(cmd.viewId)) {
      return { valid: false, reason: `View "${cmd.viewId}" not found.` };
    }
    return { valid: true };
  },

  execute(ctx: HandlerContext<UpdateViewCameraStores>, cmd: UpdateViewCameraPayload): HandlerResult {
    return withHandlerSpan('view.updateCamera.handler', { 'pryzm.command.type': 'view.updateCamera' }, () => {
    const existing = ctx.stores.view.getState().get(cmd.viewId) as ViewDefinition | undefined;
    if (!existing) throw new ViewNotFoundError(cmd.viewId);

    return {
      forward: [{ op: 'replace', path: [cmd.viewId, 'camera'], value: cmd.camera }],
      inverse: [{ op: 'replace', path: [cmd.viewId, 'camera'], value: existing.camera }],
    };
    }); // withHandlerSpan — C10 §2
  },
};
