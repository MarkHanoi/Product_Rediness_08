// SetSectionScaleHandler — update drafting scale (W-09).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { SectionsState } from '@pryzm/plugin-sdk';

export interface SetSectionScalePayload {
  readonly id: string;
  readonly scale: number;
}

type Stores = Readonly<{ section: SectionsState } & Record<string, unknown>>;

export class SetSectionScaleHandler implements CommandHandler<SetSectionScalePayload, Stores> {
  readonly type = 'section.setScale';
  readonly affectedStores = ['section'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: SetSectionScalePayload): ValidationResult {
    if (typeof cmd.id !== 'string' || cmd.id.length === 0) {
      return { valid: false, reason: 'id must be a non-empty string' };
    }
    if (!ctx.stores.section[cmd.id]) {
      return { valid: false, reason: `no section with id "${cmd.id}"` };
    }
    if (!Number.isFinite(cmd.scale) || cmd.scale <= 0) {
      return { valid: false, reason: 'scale must be a positive finite number' };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: SetSectionScalePayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const [next, forward, inverse] = produceCommand<SectionsState>(ctx.stores.section, (draft) => {
      const cur = draft[cmd.id]!;
      draft[cmd.id] = { ...cur, scale: cmd.scale };
    });
    return { forward, inverse, nextStates: { section: next } };
    }); // withHandlerSpan — C10 §2
  }
}
