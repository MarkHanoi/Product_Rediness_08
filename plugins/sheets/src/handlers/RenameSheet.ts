// RenameSheetHandler — change a sheet's display name and/or sheet
// number (S37 / ADR-0031 / Phase 2C).
//
// Why one handler covers both: the user-facing "rename" operation in
// the sheet list edits both fields simultaneously (name + number) and
// the validation rules are the same kind (string formats + uniqueness
// for `number`).  A single command keeps the event log compact.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { SheetsState } from '@pryzm/plugin-sdk';
import { SheetNotFoundError, DuplicateSheetNumberError } from '../errors.js';
import { isSheetName, isSheetNumberFormat } from '../intent.js';
import { withSheetSpan } from '../tracing.js';

export interface RenameSheetPayload {
  readonly sheetId: string;
  /** Optional new display name.  Omit to leave unchanged. */
  readonly name?: string;
  /** Optional new sheet number (e.g. 'A-002').  Omit to leave unchanged. */
  readonly number?: string;
}

type Stores = Readonly<{ sheet: SheetsState } & Record<string, unknown>>;

export class RenameSheetHandler implements CommandHandler<RenameSheetPayload, Stores> {
  readonly type = 'sheet.rename';
  readonly affectedStores = ['sheet'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: RenameSheetPayload): ValidationResult {
    if (typeof cmd.sheetId !== 'string' || cmd.sheetId.length === 0) {
      return { valid: false, reason: 'sheetId must be a non-empty string' };
    }
    if (!ctx.stores.sheet[cmd.sheetId]) {
      return { valid: false, reason: `sheet not found: ${cmd.sheetId}` };
    }
    if (cmd.name === undefined && cmd.number === undefined) {
      return { valid: false, reason: 'rename requires at least one of `name` or `number`' };
    }
    if (cmd.name !== undefined && !isSheetName(cmd.name)) {
      return { valid: false, reason: 'name must be a non-empty string ≤ 200 chars' };
    }
    if (cmd.number !== undefined) {
      if (!isSheetNumberFormat(cmd.number)) {
        return { valid: false, reason: `number must match /^[A-Z]+-[A-Z0-9]+$/ (got "${String(cmd.number)}")` };
      }
      for (const [otherId, s] of Object.entries(ctx.stores.sheet)) {
        if (otherId !== cmd.sheetId && s.number === cmd.number) {
          return { valid: false, reason: `sheet number "${cmd.number}" is already in use` };
        }
      }
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: RenameSheetPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    return withSheetSpan('pryzm.sheet.rename', () => {
      if (!ctx.stores.sheet[cmd.sheetId]) throw new SheetNotFoundError(cmd.sheetId);
      // Defensive uniqueness re-check (canExecute may not have run).
      if (cmd.number !== undefined) {
        for (const [otherId, s] of Object.entries(ctx.stores.sheet)) {
          if (otherId !== cmd.sheetId && s.number === cmd.number) {
            throw new DuplicateSheetNumberError(cmd.number);
          }
        }
      }
      const [next, forward, inverse] = produceCommand<SheetsState>(ctx.stores.sheet, (draft) => {
        const s = draft[cmd.sheetId];
        if (!s) return;
        if (cmd.name !== undefined) s.name = cmd.name;
        if (cmd.number !== undefined) s.number = cmd.number;
      });
      return { forward, inverse, nextStates: { sheet: next } };
    });
    }); // withHandlerSpan — C10 §2
  }
}
