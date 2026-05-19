// ReorderSheetHandler — move a sheet to a new ordinal position in the
// sheet list (S37 / ADR-0031 / Phase 2C).
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Payload shape: `{ sheetId, newIndex }`.  `newIndex` is a 0-based
//   index into the canonical list (`SheetStore.list()`), AFTER the
//   sheet has been removed from its current position — i.e. the Drag
//   API "drop between item N and N+1" semantics.
// • The handler computes the next ordered list, then assigns dense
//   `seq` values 0..N-1 in that order.  Patches are emitted ONLY for
//   sheets whose `seq` actually changes; a no-op reorder (newIndex
//   matches current position) returns empty patches.
// • This guarantees that after every reorder, the sheet store's `seq`
//   field is a perfect 0..N-1 dense sequence (the renderer can rely on
//   it without re-densifying client-side).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { SheetsState } from '@pryzm/plugin-sdk';
import type { SheetData } from '@pryzm/plugin-sdk';
import { SheetNotFoundError } from '../errors.js';
import { withSheetSpan } from '../tracing.js';

export interface ReorderSheetPayload {
  readonly sheetId: string;
  /** New 0-based ordinal in the post-move list. */
  readonly newIndex: number;
}

type Stores = Readonly<{ sheet: SheetsState } & Record<string, unknown>>;

export class ReorderSheetHandler implements CommandHandler<ReorderSheetPayload, Stores> {
  readonly type = 'sheet.reorder';
  readonly affectedStores = ['sheet'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: ReorderSheetPayload): ValidationResult {
    if (typeof cmd.sheetId !== 'string' || cmd.sheetId.length === 0) {
      return { valid: false, reason: 'sheetId must be a non-empty string' };
    }
    if (!ctx.stores.sheet[cmd.sheetId]) {
      return { valid: false, reason: `sheet not found: ${cmd.sheetId}` };
    }
    if (!Number.isInteger(cmd.newIndex) || cmd.newIndex < 0) {
      return { valid: false, reason: 'newIndex must be a non-negative integer' };
    }
    const total = Object.keys(ctx.stores.sheet).length;
    if (cmd.newIndex >= total) {
      return { valid: false, reason: `newIndex ${cmd.newIndex} is out of range (have ${total} sheets)` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: ReorderSheetPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    return withSheetSpan('pryzm.sheet.reorder', () => {
      if (!ctx.stores.sheet[cmd.sheetId]) throw new SheetNotFoundError(cmd.sheetId);

      // 1. Build the current sorted list (by `seq`, tie-break id) — same
      //    deterministic ordering as `SheetStore.list()`.
      const sorted: SheetData[] = Object.values(ctx.stores.sheet)
        .slice()
        .sort((a, b) => a.seq - b.seq || a.id.localeCompare(b.id));

      const fromIndex = sorted.findIndex((s) => s.id === cmd.sheetId);
      // findIndex must succeed — we checked existence above.
      // Clamp newIndex to valid range as a safety net (canExecute already did this).
      const targetIndex = Math.min(Math.max(cmd.newIndex, 0), sorted.length - 1);

      // 2. Splice in the new order.
      const reordered = sorted.slice();
      const [moved] = reordered.splice(fromIndex, 1);
      if (!moved) throw new SheetNotFoundError(cmd.sheetId);
      reordered.splice(targetIndex, 0, moved);

      // 3. Compute dense seqs and the diff.  Only emit a patch when seq
      //    actually changes for that sheet.
      const newSeqs = new Map<string, number>();
      for (let i = 0; i < reordered.length; i++) {
        const sheet = reordered[i];
        if (!sheet) continue;
        if (sheet.seq !== i) newSeqs.set(sheet.id, i);
      }

      const [next, forward, inverse] = produceCommand<SheetsState>(ctx.stores.sheet, (draft) => {
        for (const [id, seq] of newSeqs) {
          const s = draft[id];
          if (s) s.seq = seq;
        }
      });
      return { forward, inverse, nextStates: { sheet: next } };
    });
    }); // withHandlerSpan — C10 §2
  }
}
