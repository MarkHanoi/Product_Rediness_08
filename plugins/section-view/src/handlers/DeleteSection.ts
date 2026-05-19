// DeleteSectionHandler — drop a section by id (W-09).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { SectionsState } from '@pryzm/plugin-sdk';

export interface DeleteSectionPayload {
  readonly id: string;
}

type Stores = Readonly<{ section: SectionsState } & Record<string, unknown>>;

export class DeleteSectionHandler implements CommandHandler<DeleteSectionPayload, Stores> {
  readonly type = 'section.delete';
  readonly affectedStores = ['section'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: DeleteSectionPayload): ValidationResult {
    if (typeof cmd.id !== 'string' || cmd.id.length === 0) {
      return { valid: false, reason: 'id must be a non-empty string' };
    }
    if (!ctx.stores.section[cmd.id]) {
      return { valid: false, reason: `no section with id "${cmd.id}"` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: DeleteSectionPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const [next, forward, inverse] = produceCommand<SectionsState>(ctx.stores.section, (draft) => {
      delete draft[cmd.id];
    });
    return { forward, inverse, nextStates: { section: next } };
    }); // withHandlerSpan — C10 §2
  }
}
