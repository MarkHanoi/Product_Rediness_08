// CreateSheetHandler — mint a new sheet (S37 / ADR-0031 / Phase 2C).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import {
  SheetSchema,
  PLACEHOLDER_TITLE_BLOCK_ID,
  type SheetData,
} from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import type { SheetsState } from '@pryzm/plugin-sdk';
import {
  DuplicateSheetIdError,
  DuplicateSheetNumberError,
  SheetSchemaError,
} from '../errors.js';
import {
  isPaperSize,
  isOrientation,
  isSheetName,
  isSheetNumberFormat,
  formatAutoSheetNumber,
} from '../intent.js';
import { withSheetSpan } from '../tracing.js';

export interface CreateSheetPayload {
  readonly id?: string;
  readonly name?: string;
  readonly number?: string;
  readonly size?: SheetData['size'];
  readonly orientation?: SheetData['orientation'];
  readonly titleBlockId?: string;
  readonly revision?: string;
  readonly issue?: string;
  readonly approvedBy?: string;
  /** Optional explicit display order; default = append (`store.nextSeq() + 1`). */
  readonly seq?: number;
  /** Optional auto-number prefix (default `'A'`).  Used only when
   *  `number` is omitted. */
  readonly autoNumberPrefix?: string;
}

type Stores = Readonly<{ sheet: SheetsState } & Record<string, unknown>>;

export class CreateSheetHandler implements CommandHandler<CreateSheetPayload, Stores> {
  readonly type = 'sheet.create';
  readonly affectedStores = ['sheet'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: CreateSheetPayload): ValidationResult {
    if (cmd.id !== undefined && (typeof cmd.id !== 'string' || cmd.id.length === 0)) {
      return { valid: false, reason: 'id, when supplied, must be a non-empty string' };
    }
    if (cmd.id !== undefined && ctx.stores.sheet[cmd.id]) {
      return { valid: false, reason: `sheet id "${cmd.id}" already exists` };
    }
    if (cmd.name !== undefined && !isSheetName(cmd.name)) {
      return { valid: false, reason: 'name must be a non-empty string ≤ 200 chars' };
    }
    if (cmd.size !== undefined && !isPaperSize(cmd.size)) {
      return { valid: false, reason: `size must be one of the PaperSize enum, got: ${String(cmd.size)}` };
    }
    if (cmd.orientation !== undefined && !isOrientation(cmd.orientation)) {
      return { valid: false, reason: `orientation must be 'landscape' or 'portrait', got: ${String(cmd.orientation)}` };
    }
    if (cmd.number !== undefined && !isSheetNumberFormat(cmd.number)) {
      return { valid: false, reason: `number must match ${'/^[A-Z]+-[A-Z0-9]+$/'} (got "${String(cmd.number)}")` };
    }
    if (cmd.number !== undefined) {
      for (const s of Object.values(ctx.stores.sheet)) {
        if (s.number === cmd.number) {
          return { valid: false, reason: `sheet number "${cmd.number}" is already in use` };
        }
      }
    }
    if (cmd.seq !== undefined && (!Number.isInteger(cmd.seq) || cmd.seq < 0)) {
      return { valid: false, reason: 'seq must be a non-negative integer' };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: CreateSheetPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    return withSheetSpan('pryzm.sheet.create', () => {
      // ID and number assignment.
      const id = (cmd.id ?? createId('sheet')) as SheetData['id'];
      if (ctx.stores.sheet[id]) throw new DuplicateSheetIdError(id);

      // Auto-number: scan existing sheets sharing the prefix and pick
      // `(maxIndex + 1)`.  Robust against gaps from manual numbering.
      const prefix = cmd.autoNumberPrefix ?? 'A';
      let number = cmd.number;
      if (!number) {
        const re = new RegExp(`^${prefix.toUpperCase()}-(\\d+)$`);
        let maxIdx = 0;
        for (const s of Object.values(ctx.stores.sheet)) {
          const m = re.exec(s.number);
          if (m) {
            const n = Number.parseInt(m[1] ?? '', 10);
            if (Number.isFinite(n) && n > maxIdx) maxIdx = n;
          }
        }
        number = formatAutoSheetNumber(prefix, maxIdx + 1);
      }
      // Validate auto-generated number does not collide (paranoia).
      if (Object.values(ctx.stores.sheet).some((s) => s.number === number)) {
        throw new DuplicateSheetNumberError(number);
      }

      // Compute next-seq if caller didn't supply one.
      let nextSeq = cmd.seq;
      if (nextSeq === undefined) {
        let max = -1;
        for (const s of Object.values(ctx.stores.sheet)) if (s.seq > max) max = s.seq;
        nextSeq = max + 1;
      }

      const seed: Partial<SheetData> = {
        id,
        name: cmd.name ?? `Sheet ${number}`,
        number,
        size: cmd.size ?? 'A1',
        orientation: cmd.orientation ?? 'landscape',
        titleBlockId: cmd.titleBlockId ?? PLACEHOLDER_TITLE_BLOCK_ID,
        viewports: [],
        widgets: [],
        revision: cmd.revision ?? '',
        issue: cmd.issue ?? '',
        approvedBy: cmd.approvedBy,
        seq: nextSeq,
      };

      let s: SheetData;
      try { s = SheetSchema.parse(seed); }
      catch (err) { throw new SheetSchemaError(err); }

      const [next, forward, inverse] = produceCommand<SheetsState>(ctx.stores.sheet, (draft) => {
        draft[s.id] = s;
      });
      return { forward, inverse, nextStates: { sheet: next } };
    });
    }); // withHandlerSpan — C10 §2
  }
}
