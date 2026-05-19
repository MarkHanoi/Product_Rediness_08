// CreateView handler (S17-T6a).
//
// Spec: PHASE-1C §S17 lines 793-795 (D6).
// ADR: docs/architecture/adr/0016-view-state-command-driven.md.
//
// Validates + adds a new ViewDefinition to the ViewRegistry.
// affectedStores: ['view']

import type { CommandHandler, HandlerContext, HandlerResult, ValidationResult } from '@pryzm/plugin-sdk';
import { withHandlerSpan } from '@pryzm/plugin-sdk';
import { ViewDefinitionSchema, type ViewDefinition, type ViewId } from '@pryzm/plugin-sdk';
import type { ViewRegistry } from '@pryzm/plugin-sdk';
import { ViewAlreadyExistsError, ViewValidationError } from '../errors.js';

export interface CreateViewPayload {
  readonly definition: Omit<ViewDefinition, 'id'> & { readonly id?: ViewId };
}

export type CreateViewStores = { readonly view: ViewRegistry };

export const CreateViewHandler: CommandHandler<CreateViewPayload, CreateViewStores> = {
  type: 'view.create',
  affectedStores: ['view'],

  canExecute(ctx: HandlerContext<CreateViewStores>, cmd: CreateViewPayload): ValidationResult {
    const id = cmd.definition.id ?? '';
    if (id && ctx.stores.view.getState().has(id)) {
      return { valid: false, reason: `View "${id}" already exists.` };
    }
    return { valid: true };
  },

  execute(ctx: HandlerContext<CreateViewStores>, cmd: CreateViewPayload): HandlerResult {
    return withHandlerSpan('view.create.handler', { 'pryzm.command.type': 'view.create' }, () => {
    const raw = cmd.definition as ViewDefinition;
    const parsed = ViewDefinitionSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ViewValidationError(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const def = parsed.data as ViewDefinition;

    if (ctx.stores.view.getState().has(def.id)) {
      throw new ViewAlreadyExistsError(def.id);
    }

    return {
      forward: [{ op: 'add', path: [def.id], value: def }],
      inverse: [{ op: 'remove', path: [def.id] }],
    };
    }); // withHandlerSpan — C10 §2
  },
};
