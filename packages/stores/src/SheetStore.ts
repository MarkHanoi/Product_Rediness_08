// SheetStore — domain store for sheets (S37 / Phase 2C).
//
// Spec: `phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md` §S37 lines
// 88–131 ("Implementation Detail — SheetStore.ts").  4 handlers in S37
// (CreateSheet, DeleteSheet, RenameSheet, ReorderSheet).
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// Mirrors `AnnotationStore` / `DimensionStore`:
//   • Map<SheetId, SheetData> indexed by the sheet's stable id.
//   • Mutations land via `applyPatch(immerPatches)` only.
//   • Display order is the canonical `SheetData.seq` field — `list()`
//     returns sheets sorted by `seq` ascending.
//   • Active-sheet tracking lives in the SEPARATE `ActiveSheetStore`
//     (singleton-on-Store pattern matching `ActiveViewStore`) so the
//     `view.switch`-style ephemeral semantics apply uniformly.
//
// The handler layer (`plugins/sheets/src/handlers/*`) is the only legal
// mutation surface; this file exposes pure read selectors only.

import { Store } from './Store.js';
import type { SheetData, SheetId } from '@pryzm/schemas/sheet';

export type SheetsState = Record<string, SheetData>;

export class SheetStore extends Store<SheetData> {
  constructor() { super('sheet'); }

  ids(): readonly SheetId[] { return [...this.state.keys()]; }

  get(id: SheetId): Readonly<SheetData> | undefined { return this.state.get(id); }

  /** All sheets in canonical display order (ascending `seq`).  Returns
   *  a fresh frozen array on every call — listeners use `subscribeDirty`
   *  to know when to re-fetch. */
  list(): ReadonlyArray<SheetData> {
    const arr = [...this.state.values()];
    arr.sort((a, b) => a.seq - b.seq || a.id.localeCompare(b.id));
    return Object.freeze(arr);
  }

  /** Maximum `seq` value in the store, or `-1` if the store is empty.
   *  CreateSheet uses `nextSeq() + 1` to append at the end. */
  nextSeq(): number {
    let max = -1;
    for (const s of this.state.values()) if (s.seq > max) max = s.seq;
    return max;
  }

  /** Find a sheet by user-facing sheet number (e.g. 'A-001').  Returns
   *  `undefined` if no sheet with that number exists.  Matches are
   *  case-sensitive (sheet numbers are conventionally uppercase but
   *  the store does not enforce a casing policy). */
  byNumber(number: string): Readonly<SheetData> | undefined {
    for (const s of this.state.values()) if (s.number === number) return s;
    return undefined;
  }
}
