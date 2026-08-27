/**
 * @file src/ui/SchedulePanel/scheduleViewModel.ts
 * @description §FEAT-SCHEDULE-VIEW-EDIT (L-80) — pure, DOM-free view-model for
 *              the Schedule panel's VIEW and EDIT modes.
 *
 * Splits the testable schedule logic out of `SchedulePanel.ts` (which is a heavy
 * DOM class) so both the read-only render and the bus-dispatched edit path can be
 * unit-tested under the `node` vitest environment.
 *
 * CONTRACT
 * ─────────────────────────────────────────────────────────────────────────────
 * • VIEW columns come from the authoritative, PERSISTED `scheduleStore` (the
 *   `[main] Schedule Store initialized and default schedules seeded` store) —
 *   the schedule's `fields` list, resolved against the `ScheduleRegistry`
 *   rendering columns (whose ids match the store field ids 1:1). This is what
 *   makes VIEW "render a schedule from the store" rather than from a
 *   session-only registry snapshot.
 * • EDIT never writes the store directly. Every definition edit (rename, add /
 *   remove a column/field) is dispatched through the command bus as
 *   `schedule.update` (→ `UpdateScheduleCommand`, P6, undoable) — see the
 *   `schedule.update` bridge in `apps/editor/src/engine/initBusHandlers.ts`.
 *
 * Governance: C03 (command-first mutation / P6), C28 (data panel), C37 (schedule).
 */

import { ScheduleRegistry, scheduleStore } from '@pryzm/core-app-model';
import type { ScheduleColumn } from '@pryzm/core-app-model';

/** Minimal runtime surface this module needs — the typed command bus. */
export interface ScheduleBusHost {
  readonly bus?: {
    executeCommand(type: string, payload: unknown, opts?: unknown): unknown;
  };
}

/** The mutable slice of a schedule definition the panel can edit. */
export interface ScheduleUpdatePatch {
  readonly name?: string;
  readonly fields?: string[];
}

/** A projected display row: the source element id plus one cell per column. */
export interface ScheduleDisplayRow {
  readonly id: string | undefined;
  readonly cells: ReadonlyArray<string | number>;
}

/** Read the persisted field list for a schedule, or `null` if the store has no
 *  definition for it (e.g. a registry-only Data-Platform schedule). */
export function storeFields(scheduleId: string): string[] | null {
  const def = scheduleStore.get(scheduleId);
  return def ? [...def.fields] : null;
}

/** The persisted display name for a schedule (store name → registry label). */
export function scheduleName(scheduleId: string): string {
  const def = scheduleStore.get(scheduleId);
  if (def?.name) return def.name;
  return ScheduleRegistry.get(scheduleId)?.label ?? scheduleId;
}

/** All rendering columns the registry knows for a schedule (the full palette
 *  offered in EDIT mode's column picker). */
export function allColumns(scheduleId: string): ScheduleColumn[] {
  return ScheduleRegistry.get(scheduleId)?.columns ?? [];
}

/**
 * The columns VIEW mode renders, sourced from the PERSISTED store definition.
 *
 * The store's `fields` list is the source of truth for both membership AND
 * order; each field id is resolved to its `ScheduleRegistry` column (for the
 * label + value accessor). Fields with no matching registry column are skipped.
 * When the store has no definition for the schedule (registry-only schedules),
 * we fall back to the registry's full column set so those still render.
 */
export function resolveVisibleColumns(scheduleId: string): ScheduleColumn[] {
  const cols = allColumns(scheduleId);
  const fields = storeFields(scheduleId);
  if (!fields || fields.length === 0) {
    // No persisted definition (registry-only) → show the full registry set.
    // An explicitly-empty persisted field list is honoured as "no columns".
    return fields === null ? cols : [];
  }
  const byId = new Map(cols.map((c) => [c.id, c]));
  const out: ScheduleColumn[] = [];
  for (const fieldId of fields) {
    const col = byId.get(fieldId);
    if (col) out.push(col);
  }
  return out;
}

/**
 * Project raw schedule elements into display rows using the given columns'
 * value accessors — exactly the cell values VIEW mode paints. Pure, so the
 * panel's row rendering can be asserted without a DOM.
 */
export function projectRows(
  columns: ReadonlyArray<ScheduleColumn>,
  elements: ReadonlyArray<Record<string, unknown>>,
): ScheduleDisplayRow[] {
  return elements.map((el) => ({
    id: typeof el.id === 'string' ? el.id : undefined,
    cells: columns.map((col) => {
      const raw = col.value(el);
      return raw ?? '—';
    }),
  }));
}

/** A plain numeric string, and NOTHING else — never "3 room(s)" or an
 *  "⚠ cannot determine" sentinel. Deliberately strict: a loose numeric parse
 *  (`parseFloat`) would silently sum the "3" out of "3 room(s)" and call that
 *  a total. */
const PLAIN_NUMBER_RE = /^-?\d+(\.\d+)?$/;

/**
 * §LIVESCHED151 (E) — one column's total over the CURRENTLY VISIBLE rows.
 * `null` ⇒ this column has no meaningful total (e.g. Name, Level — every row
 * read as non-numeric) and the totals row leaves its cell blank.
 *
 * §CONTEXT-DATA-HONESTY / C78 §8.1 — the Cost column is handled SEPARATELY
 * from every other numeric column, because "total cost" cannot be read off
 * the already-formatted display string (`'≥ EUR 800.00'`, `'NO RATE'`,
 * `'not costed'`): it must sum the RAW `row.cost`, and it is a LOWER BOUND
 * ('≥ …') the instant any contributing row is `!costComplete` OR
 * `!costMeasured` — exactly the same rule the row-level cell already
 * follows, applied once more at the total.
 */
export function computeColumnTotal(
  col: ScheduleColumn,
  rows: ReadonlyArray<Record<string, unknown>>,
): string | null {
  if (rows.length === 0) return null;

  if (col.id === 'cost') {
    let sum = 0;
    let anyPriced = false;
    let anyMeasured = false;
    let complete = true;
    let currency = '';
    for (const r of rows) {
      if (!r.costMeasured) { complete = false; continue; } // excluded, not zero
      anyMeasured = true;
      if (typeof r.costCurrency === 'string' && r.costCurrency) currency = r.costCurrency;
      if (!r.costComplete) complete = false;
      if (typeof r.cost === 'number') { sum += r.cost; anyPriced = true; }
    }
    if (!anyMeasured) return null; // nothing in view is even measured
    if (!anyPriced) return 'NO RATE';
    const amount = `${currency ? currency + ' ' : ''}${sum.toFixed(2)}`;
    return complete ? amount : `≥ ${amount}`;
  }

  let sum = 0;
  let sawNumber = false;
  let sawNonNumber = false;
  for (const r of rows) {
    const raw = col.value(r);
    const text = String(raw ?? '').trim();
    if (PLAIN_NUMBER_RE.test(text)) { sum += Number(text); sawNumber = true; }
    else sawNonNumber = true;
  }
  if (!sawNumber) return null; // not a numeric column at all (Name, Level, Type, …)
  const total = sum.toFixed(2);
  // A total over a column where SOME rows could not be read as a plain number
  // (an undetermined sentinel, a blank) is a LOWER BOUND on the true sum,
  // exactly like an unpriced Cost row — the same glyph says the same thing.
  return sawNonNumber ? `≥ ${total}` : total;
}

// ── Filtering (§SCHED156-FILTER, L-12606) ──────────────────────────────────
//
// The founder: "Also allow to filter the data in the schedule, by level, by
// room." Both facts already render on most schedules (Walls has Level and
// Room Side A/B; Doors has Level, Room From, Room To; Windows has Level,
// Room, Adjacent Room; Rooms has Level) — this is a UI affordance over data
// already extracted, not new extraction, per the founder's own framing.
//
// Generic over a column where cheap (a schedule offers an axis only when its
// palette actually carries a matching column id), rather than a bespoke
// filter per schedule. Two axes ship — LEVEL and ROOM — rather than a fully
// generic per-column filter engine nobody asked for yet.

/** The column ids checked for the ROOM axis, in no particular priority — a
 *  row matches if ANY of these (whichever the schedule's palette carries)
 *  equals the selected value. Doors carry the fact under `roomFrom`/`roomTo`,
 *  Windows under `room`/`adjacentRoom`, Walls under `roomSideA`/`roomSideB` —
 *  one filter axis, several vocabularies, because the schedules themselves
 *  already disagree on the column id for "the room this row touches". */
const ROOM_FILTER_COLUMN_IDS = ['room', 'roomFrom', 'roomTo', 'roomSideA', 'roomSideB', 'adjacentRoom'] as const;

export type ScheduleFilterAxis = 'level' | 'room';

/** `null` (not `'—'`, not `''`) ⇒ "show every row" — the same "absence is a
 *  real value, not a sentinel string" discipline the honesty columns use. */
export interface ScheduleFilterState {
  readonly level: string | null;
  readonly room: string | null;
}

export const EMPTY_SCHEDULE_FILTER: ScheduleFilterState = { level: null, room: null };

function axisColumnIds(axis: ScheduleFilterAxis): readonly string[] {
  return axis === 'level' ? ['level'] : ROOM_FILTER_COLUMN_IDS;
}

/** Which axes this schedule's column PALETTE supports — an axis with no
 *  matching column id contributes no filter control, rather than an empty
 *  dropdown nobody could ever use. Checked against the full palette
 *  (`allColumns`), not the currently-visible subset, so hiding the Level
 *  column in EDIT mode does not also remove the ability to filter by it. */
export function supportedFilterAxes(cols: ReadonlyArray<ScheduleColumn>): ScheduleFilterAxis[] {
  const ids = new Set(cols.map((c) => c.id));
  const axes: ScheduleFilterAxis[] = [];
  if (ids.has('level')) axes.push('level');
  if (ROOM_FILTER_COLUMN_IDS.some((id) => ids.has(id))) axes.push('room');
  return axes;
}

/** Distinct, sorted values an axis could be set to — read off the given row
 *  set. Callers pass the FULL unfiltered rows so a dropdown always offers
 *  every option, never only the options that survive today's OTHER filter. */
export function distinctAxisValues(
  axis: ScheduleFilterAxis,
  cols: ReadonlyArray<ScheduleColumn>,
  rows: ReadonlyArray<Record<string, unknown>>,
): string[] {
  const relevantCols = cols.filter((c) => axisColumnIds(axis).includes(c.id));
  const values = new Set<string>();
  for (const row of rows) {
    for (const col of relevantCols) {
      const v = String(col.value(row) ?? '').trim();
      if (v && v !== '—') values.add(v);
    }
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}

/**
 * The rows matching the given filter state — BOTH axes apply together (AND),
 * each axis itself an OR across its candidate columns (a door matches the
 * "101" room filter whether "101" is its Room From or its Room To).
 * `{ level: null, room: null }` (or any all-null state) returns every row,
 * unfiltered — a fresh array, never the same reference, so a caller cannot
 * mistake "no filter" for "mutate freely".
 */
export function applyScheduleFilters(
  cols: ReadonlyArray<ScheduleColumn>,
  rows: ReadonlyArray<Record<string, unknown>>,
  filters: ScheduleFilterState,
): Record<string, unknown>[] {
  const matchesAxis = (axis: ScheduleFilterAxis, selected: string | null, row: Record<string, unknown>): boolean => {
    if (!selected) return true;
    const relevantCols = cols.filter((c) => axisColumnIds(axis).includes(c.id));
    return relevantCols.some((col) => String(col.value(row) ?? '').trim() === selected);
  };
  return rows.filter((row) => matchesAxis('level', filters.level, row) && matchesAxis('room', filters.room, row));
}

/**
 * Compute the new `fields` array after toggling a single column's membership.
 * Membership order always follows the registry column order (`orderedColumnIds`)
 * so a re-added column lands back in its canonical position rather than at the
 * end. Returns a fresh array; never mutates `currentFields`.
 */
export function toggleFieldPatch(
  currentFields: ReadonlyArray<string>,
  columnId: string,
  orderedColumnIds: ReadonlyArray<string>,
): string[] {
  const present = new Set(currentFields);
  if (present.has(columnId)) present.delete(columnId);
  else present.add(columnId);
  // Re-serialise in canonical registry order.
  return orderedColumnIds.filter((id) => present.has(id));
}

/**
 * Dispatch a schedule-definition edit through the command bus (P6, undoable).
 * NEVER writes `scheduleStore` directly — the `schedule.update` bridge routes
 * this to `UpdateScheduleCommand`. Fire-and-forget with a guarded catch so a
 * bus error never throws into the DOM render path.
 */
export function dispatchScheduleUpdate(
  runtime: ScheduleBusHost | null | undefined,
  scheduleId: string,
  patch: ScheduleUpdatePatch,
): boolean {
  const bus = runtime?.bus;
  if (!bus || typeof bus.executeCommand !== 'function') {
    console.warn('[scheduleViewModel] command bus unavailable — edit dropped');
    return false;
  }
  try {
    const r = bus.executeCommand('schedule.update', { scheduleId, patch }) as
      | Promise<unknown>
      | unknown;
    if (r && typeof (r as Promise<unknown>).catch === 'function') {
      (r as Promise<unknown>).catch((e: unknown) =>
        console.error('[scheduleViewModel] schedule.update failed:', e),
      );
    }
    return true;
  } catch (e) {
    console.error('[scheduleViewModel] schedule.update dispatch threw:', e);
    return false;
  }
}
