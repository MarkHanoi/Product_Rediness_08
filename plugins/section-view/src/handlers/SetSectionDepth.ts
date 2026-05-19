// SetSectionDepthHandler — update look-depth (W-09).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { SectionsState } from '@pryzm/plugin-sdk';

export interface SetSectionDepthPayload {
  readonly id: string;
  readonly lookDepth: number;
}

type Stores = Readonly<{ section: SectionsState } & Record<string, unknown>>;

export class SetSectionDepthHandler implements CommandHandler<SetSectionDepthPayload, Stores> {
  readonly type = 'section.setDepth';
  readonly affectedStores = ['section'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: SetSectionDepthPayload): ValidationResult {
    if (typeof cmd.id !== 'string' || cmd.id.length === 0) {
      return { valid: false, reason: 'id must be a non-empty string' };
    }
    if (!ctx.stores.section[cmd.id]) {
      return { valid: false, reason: `no section with id "${cmd.id}"` };
    }
    if (!Number.isFinite(cmd.lookDepth) || cmd.lookDepth < 0) {
      return { valid: false, reason: 'lookDepth must be a non-negative finite number' };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: SetSectionDepthPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const [next, forward, inverse] = produceCommand<SectionsState>(ctx.stores.section, (draft) => {
      const cur = draft[cmd.id]!;
      draft[cmd.id] = { ...cur, line: { ...cur.line, lookDepth: cmd.lookDepth } };
    });
    return { forward, inverse, nextStates: { section: next } };
    }); // withHandlerSpan — C10 §2
  }
}
