// SetSectionMarkHandler — update the per-section human mark (W-09).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { SectionsState } from '@pryzm/plugin-sdk';

export interface SetSectionMarkPayload {
  readonly id: string;
  readonly mark: string;
}

type Stores = Readonly<{ section: SectionsState } & Record<string, unknown>>;

export class SetSectionMarkHandler implements CommandHandler<SetSectionMarkPayload, Stores> {
  readonly type = 'section.setMark';
  readonly affectedStores = ['section'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: SetSectionMarkPayload): ValidationResult {
    if (typeof cmd.id !== 'string' || cmd.id.length === 0) {
      return { valid: false, reason: 'id must be a non-empty string' };
    }
    if (!ctx.stores.section[cmd.id]) {
      return { valid: false, reason: `no section with id "${cmd.id}"` };
    }
    if (typeof cmd.mark !== 'string' || cmd.mark.length === 0 || cmd.mark.length > 200) {
      return { valid: false, reason: 'mark must be a non-empty string ≤ 200 chars' };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: SetSectionMarkPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const [next, forward, inverse] = produceCommand<SectionsState>(ctx.stores.section, (draft) => {
      const cur = draft[cmd.id]!;
      draft[cmd.id] = { ...cur, mark: cmd.mark };
    });
    return { forward, inverse, nextStates: { section: next } };
    }); // withHandlerSpan — C10 §2
  }
}
