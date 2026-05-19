// DeleteSheetHandler — S37 / ADR-0031 / Phase 2C.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { SheetsState } from '@pryzm/plugin-sdk';
import { SheetNotFoundError } from '../errors.js';
import { withSheetSpan } from '../tracing.js';

export interface DeleteSheetPayload {
  readonly sheetId: string;
}

type Stores = Readonly<{ sheet: SheetsState } & Record<string, unknown>>;

export class DeleteSheetHandler implements CommandHandler<DeleteSheetPayload, Stores> {
  readonly type = 'sheet.delete';
  readonly affectedStores = ['sheet'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: DeleteSheetPayload): ValidationResult {
    if (typeof cmd.sheetId !== 'string' || cmd.sheetId.length === 0) {
      return { valid: false, reason: 'sheetId must be a non-empty string' };
    }
    if (!ctx.stores.sheet[cmd.sheetId]) {
      return { valid: false, reason: `sheet not found: ${cmd.sheetId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: DeleteSheetPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    return withSheetSpan('pryzm.sheet.delete', () => {
      if (!ctx.stores.sheet[cmd.sheetId]) throw new SheetNotFoundError(cmd.sheetId);
      const [next, forward, inverse] = produceCommand<SheetsState>(ctx.stores.sheet, (draft) => {
        delete draft[cmd.sheetId];
      });
      return { forward, inverse, nextStates: { sheet: next } };
    });
    }); // withHandlerSpan — C10 §2
  }
}
