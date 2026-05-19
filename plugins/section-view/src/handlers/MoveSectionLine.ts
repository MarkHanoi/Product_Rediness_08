// MoveSectionLineHandler — update a section's line endpoints (W-09).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { SectionsState } from '@pryzm/plugin-sdk';

export interface MoveSectionLinePayload {
  readonly id: string;
  readonly a: { readonly x: number; readonly y: number };
  readonly b: { readonly x: number; readonly y: number };
}

type Stores = Readonly<{ section: SectionsState } & Record<string, unknown>>;

export class MoveSectionLineHandler implements CommandHandler<MoveSectionLinePayload, Stores> {
  readonly type = 'section.moveLine';
  readonly affectedStores = ['section'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: MoveSectionLinePayload): ValidationResult {
    if (typeof cmd.id !== 'string' || cmd.id.length === 0) {
      return { valid: false, reason: 'id must be a non-empty string' };
    }
    if (!ctx.stores.section[cmd.id]) {
      return { valid: false, reason: `no section with id "${cmd.id}"` };
    }
    if (!cmd.a || !cmd.b) return { valid: false, reason: 'a and b are required' };
    for (const [k, v] of Object.entries({ 'a.x': cmd.a.x, 'a.y': cmd.a.y, 'b.x': cmd.b.x, 'b.y': cmd.b.y })) {
      if (!Number.isFinite(v)) return { valid: false, reason: `${k} must be finite` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: MoveSectionLinePayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const [next, forward, inverse] = produceCommand<SectionsState>(ctx.stores.section, (draft) => {
      const cur = draft[cmd.id]!;
      draft[cmd.id] = {
        ...cur,
        line: { a: { x: cmd.a.x, y: cmd.a.y }, b: { x: cmd.b.x, y: cmd.b.y }, lookDepth: cur.line.lookDepth },
      };
    });
    return { forward, inverse, nextStates: { section: next } };
    }); // withHandlerSpan — C10 §2
  }
}
