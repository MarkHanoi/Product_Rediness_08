// Book — an ordered set of sheets exported as a single PDF / DXF set
// (S40 / Phase 2C / ADR-0031).
//
// In Revit/Archicad parlance: a "sheet set" or "issue".  PRYZM 2 calls
// it a "book" because it's the unit a contractor receives — one PDF
// with the cover sheet first, then plans, then schedules, then details.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Pure data — no DOM, no command bus, no exporter dependency.
// • Order matters: `sheetIds[i]` becomes page (i+1) in the exported
//   PDF, and DXF file `i.dxf` in the exported zip.  No two entries may
//   reference the same sheetId (the validator rejects it).
// • A book MAY reference a sheet that's been deleted — the exporter is
//   responsible for skipping (and reporting) missing sheets, the data
//   shape doesn't enforce referential integrity (sheets live in a
//   different store).

import { z } from 'zod';

export const BookSchema = z.object({
  /** Stable book id (e.g. "book-iss-2026-04-28"). */
  id: z.string().min(1),
  /** Human-readable book name (e.g. "For Construction — 2026-04-28"). */
  name: z.string().min(1),
  /** Ordered sheet ids.  Page N of the exported PDF is sheetIds[N-1]. */
  sheetIds: z.array(z.string().min(1))
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'sheetIds must not contain duplicates',
    }),
  /** Free-form revision tag stamped into the exported title block
   *  (e.g. "P1", "C1").  Empty string when unrevised. */
  revision: z.string().default(''),
  /** Free-form issue label (e.g. "FOR CONSTRUCTION", "FOR TENDER"). */
  issuedFor: z.string().default(''),
  /** Optional ISO-8601 date the book was issued (informational). */
  issuedDate: z.string().default(''),
});

export type BookData = z.infer<typeof BookSchema>;

// ── Pure helpers ───────────────────────────────────────────────────────────

/** Append `sheetId` if it isn't already present.  Returns a new array
 *  — never mutates the input. */
export function addSheetToBook(book: BookData, sheetId: string): BookData {
  if (book.sheetIds.includes(sheetId)) return book;
  return { ...book, sheetIds: [...book.sheetIds, sheetId] };
}

/** Remove every occurrence of `sheetId` (defensive — there should only
 *  be one).  Returns a new book; never mutates. */
export function removeSheetFromBook(book: BookData, sheetId: string): BookData {
  if (!book.sheetIds.includes(sheetId)) return book;
  return { ...book, sheetIds: book.sheetIds.filter((id) => id !== sheetId) };
}

/** Move `sheetId` to position `to` (0-based).  No-op when the id is
 *  missing or already at `to`.  `to` is clamped to `[0, length-1]`. */
export function moveSheetInBook(book: BookData, sheetId: string, to: number): BookData {
  const from = book.sheetIds.indexOf(sheetId);
  if (from < 0) return book;
  const clamped = Math.max(0, Math.min(book.sheetIds.length - 1, Math.floor(to)));
  if (from === clamped) return book;
  const next = book.sheetIds.slice();
  next.splice(from, 1);
  next.splice(clamped, 0, sheetId);
  return { ...book, sheetIds: next };
}

/** Convenience — make a new empty book.  Throws on invalid input via
 *  Zod parse so the caller can't construct a book with a duplicate
 *  starter sheet id. */
export function createBook(input: Partial<BookData> & Pick<BookData, 'id' | 'name'>): BookData {
  return BookSchema.parse({
    sheetIds: [],
    revision: '',
    issuedFor: '',
    issuedDate: '',
    ...input,
  });
}
