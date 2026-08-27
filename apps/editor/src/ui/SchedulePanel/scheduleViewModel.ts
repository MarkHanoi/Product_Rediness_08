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
