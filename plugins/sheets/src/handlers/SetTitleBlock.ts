// SetTitleBlockHandler — bind a sheet to a title-block template
// (S38 / Phase 2C / ADR-0031).
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Payload: `{ sheetId, titleBlockId }`.
// • The handler verifies the template id is registered in the
//   `TitleBlockStore` BEFORE producing patches — binding to a missing
//   template would render the sheet's title block as empty and is a
//   common configuration mistake worth catching early.
// • The TitleBlockStore is read through an OPTIONAL declaration in
//   `affectedStores` (we only mutate `sheet`); we look it up via
//   `ctx.stores['title-block']` for validation.  When the title-block
//   store is absent (legacy boot path) we skip the existence check —
//   the handler still runs, matching the "fail open if the registry
//   isn't wired" contract documented in `attachStores`.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { SheetsState, TitleBlocksState } from '@pryzm/plugin-sdk';
import { SheetNotFoundError, TitleBlockTemplateNotFoundError } from '../errors.js';
import { withSheetSpan } from '../tracing.js';

export interface SetTitleBlockPayload {
  readonly sheetId: string;
  readonly titleBlockId: string;
}

type Stores = Readonly<
  { sheet: SheetsState; 'title-block'?: TitleBlocksState } & Record<string, unknown>
>;

export class SetTitleBlockHandler implements CommandHandler<SetTitleBlockPayload, Stores> {
  readonly type = 'sheet.setTitleBlock';
  readonly affectedStores = ['sheet'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: SetTitleBlockPayload): ValidationResult {
    if (typeof cmd.sheetId !== 'string' || cmd.sheetId.length === 0) {
      return { valid: false, reason: 'sheetId must be a non-empty string' };
    }
    if (!ctx.stores.sheet[cmd.sheetId]) {
      return { valid: false, reason: `sheet not found: ${cmd.sheetId}` };
    }
    if (typeof cmd.titleBlockId !== 'string' || cmd.titleBlockId.length === 0) {
      return { valid: false, reason: 'titleBlockId must be a non-empty string' };
    }
    const registry = ctx.stores['title-block'];
    if (registry !== undefined && !registry[cmd.titleBlockId]) {
      return { valid: false, reason: `title-block template not registered: ${cmd.titleBlockId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: SetTitleBlockPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    return withSheetSpan('pryzm.sheet.titleblock.set', () => {
      if (!ctx.stores.sheet[cmd.sheetId]) throw new SheetNotFoundError(cmd.sheetId);
      const registry = ctx.stores['title-block'];
      if (registry !== undefined && !registry[cmd.titleBlockId]) {
        throw new TitleBlockTemplateNotFoundError(cmd.titleBlockId);
      }
      const [next, forward, inverse] = produceCommand<SheetsState>(ctx.stores.sheet, (draft) => {
        const s = draft[cmd.sheetId];
        if (!s) return;
        s.titleBlockId = cmd.titleBlockId;
      });
      return { forward, inverse, nextStates: { sheet: next } };
    });
    }); // withHandlerSpan — C10 §2
  }
}
