// SetSheetMetadataHandler — update revision, issue, and approver fields
// on a sheet (S38 / Phase 2C / ADR-0031).
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Payload: `{ sheetId, revision?, issue?, approvedBy? }`.  At least
//   one of the three update fields must be present.
// • `revision` and `issue` are free-form strings (max 60 chars — long
//   enough for "FOR CONSTRUCTION REV C" but short enough to fit a
//   title-block field without truncation).
// • `approvedBy` may be `null` to clear the field (sheet returns to
//   "unapproved").  `undefined` leaves it unchanged.
//
// Why this is a separate handler from RenameSheet: rename mutates
// identity (name + number) which has uniqueness implications (sheet
// number must be unique).  Metadata is purely descriptive — different
// validation surface, different audit category in the event log.

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

export interface SetSheetMetadataPayload {
  readonly sheetId: string;
  readonly revision?: string;
  readonly issue?: string;
  /** `undefined` = leave unchanged.  `null` = clear the approver. */
  readonly approvedBy?: string | null;
}

type Stores = Readonly<{ sheet: SheetsState } & Record<string, unknown>>;

export const SHEET_METADATA_FIELD_MAX_LEN = 60;

function isMetadataString(v: unknown): v is string {
  return typeof v === 'string' && v.length <= SHEET_METADATA_FIELD_MAX_LEN;
}

function hasAnyUpdate(p: SetSheetMetadataPayload): boolean {
  return p.revision !== undefined || p.issue !== undefined || p.approvedBy !== undefined;
}

export class SetSheetMetadataHandler implements CommandHandler<SetSheetMetadataPayload, Stores> {
  readonly type = 'sheet.setSheetMetadata';
  readonly affectedStores = ['sheet'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: SetSheetMetadataPayload): ValidationResult {
    if (typeof cmd.sheetId !== 'string' || cmd.sheetId.length === 0) {
      return { valid: false, reason: 'sheetId must be a non-empty string' };
    }
    if (!ctx.stores.sheet[cmd.sheetId]) {
      return { valid: false, reason: `sheet not found: ${cmd.sheetId}` };
    }
    if (!hasAnyUpdate(cmd)) {
      return { valid: false, reason: 'at least one of revision / issue / approvedBy must be supplied' };
    }
    if (cmd.revision !== undefined && !isMetadataString(cmd.revision)) {
      return { valid: false, reason: `revision must be a string ≤ ${SHEET_METADATA_FIELD_MAX_LEN} chars` };
    }
    if (cmd.issue !== undefined && !isMetadataString(cmd.issue)) {
      return { valid: false, reason: `issue must be a string ≤ ${SHEET_METADATA_FIELD_MAX_LEN} chars` };
    }
    if (cmd.approvedBy !== undefined && cmd.approvedBy !== null && !isMetadataString(cmd.approvedBy)) {
      return { valid: false, reason: `approvedBy must be a string ≤ ${SHEET_METADATA_FIELD_MAX_LEN} chars (or null to clear)` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: SetSheetMetadataPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    return withSheetSpan('pryzm.sheet.metadata.set', () => {
      if (!ctx.stores.sheet[cmd.sheetId]) throw new SheetNotFoundError(cmd.sheetId);
      const [next, forward, inverse] = produceCommand<SheetsState>(ctx.stores.sheet, (draft) => {
        const s = draft[cmd.sheetId];
        if (!s) return;
        if (cmd.revision !== undefined) s.revision = cmd.revision;
        if (cmd.issue !== undefined) s.issue = cmd.issue;
        if (cmd.approvedBy === null) {
          delete s.approvedBy;
        } else if (cmd.approvedBy !== undefined) {
          s.approvedBy = cmd.approvedBy;
        }
      });
      return { forward, inverse, nextStates: { sheet: next } };
    });
    }); // withHandlerSpan — C10 §2
  }
}
