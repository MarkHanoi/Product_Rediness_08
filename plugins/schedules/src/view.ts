// view.ts — DOM table renderer for the live schedules editor
// (S41 / Phase 2C / ADR-0032).
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Pure DOM (no React) — mirrors `plugins/sheets/src/sheet-editor-host`
//   philosophy: a vanilla mount/unmount/render trio that the host page
//   wires to a `ScheduleStore.subscribeDirty(...)` callback.
// • One renderer instance ↔ one schedule.  When the active schedule
//   changes, the host disposes the old renderer and constructs a new
//   one (cheap: just clears the DOM tree).
// • Sort state (column id + direction) lives on the renderer
//   instance, NOT in any store — sort is a view concern, not a
//   document concern.  This matches Excel / Numbers / Sheets UX.
// • The renderer NEVER mutates the schedule.  Column adds / removes
//   / formula edits go through the bus.

import type { ScheduleData, ScheduleRow } from '@pryzm/plugin-sdk';
import { CELL_CIRCULAR, CELL_ERR, CELL_UNDEF } from '@pryzm/plugin-sdk';
import { evaluateSchedule } from './evaluate-schedule.js';
import type { EvalElement } from './formula-evaluator.js';
import { sortRows, type SortDirection } from './sort.js';
import { withScheduleSpan } from './tracing.js';

export interface ScheduleViewState {
  readonly sortColumnId: string | null;
  readonly sortDirection: SortDirection;
}

/** Mount-time options.  `getElements` is the ONLY data source — the
 *  renderer pulls a fresh element list on every render so it stays in
 *  sync with whatever upstream store fan-out fires `render()`. */
export interface ScheduleViewOptions {
  readonly schedule: ScheduleData;
  readonly getElements: () => ReadonlyArray<EvalElement & { id: string }>;
  /** Optional hook fired when the user clicks a sortable header.  The
   *  host can persist the sort preference per schedule if desired. */
  readonly onSortChanged?: (state: ScheduleViewState) => void;
}

/** A mounted schedule table view.  Lifecycle: `mount(host)` →
 *  `render()` → `unmount()`. */
export class ScheduleView {
  private host: HTMLElement | null = null;
  private root: HTMLDivElement | null = null;
  private state: ScheduleViewState = { sortColumnId: null, sortDirection: 'asc' };
  /** Reusable element pool: <table> / <thead> / <tbody> are kept
   *  across renders so we patch in place rather than blowing the DOM
   *  away every frame. */
  private table: HTMLTableElement | null = null;
  private thead: HTMLTableSectionElement | null = null;
  private tbody: HTMLTableSectionElement | null = null;
  private summaryEl: HTMLDivElement | null = null;

  constructor(public options: ScheduleViewOptions) {}

  /** Mount the view into `host` (replaces all children).  Idempotent —
   *  remounting on the same host re-uses the existing DOM. */
  mount(host: HTMLElement): void {
    if (this.host === host && this.root) return;
    this.unmount();
    this.host = host;
    this.root = host.ownerDocument!.createElement('div');
    this.root.className = 'pryzm-schedule-view';
    this.summaryEl = host.ownerDocument!.createElement('div');
    this.summaryEl.className = 'pryzm-schedule-summary';
    this.table = host.ownerDocument!.createElement('table');
    this.table.className = 'pryzm-schedule-table';
    this.thead = host.ownerDocument!.createElement('thead');
    this.tbody = host.ownerDocument!.createElement('tbody');
    this.table.appendChild(this.thead);
    this.table.appendChild(this.tbody);
    this.root.appendChild(this.summaryEl);
    this.root.appendChild(this.table);
    host.replaceChildren(this.root);
  }

  /** Detach from the host, dropping all DOM references.  Idempotent. */
  unmount(): void {
    if (this.root && this.host && this.root.parentNode === this.host) {
      this.host.removeChild(this.root);
    }
    this.host = null;
    this.root = null;
    this.table = null;
    this.thead = null;
    this.tbody = null;
    this.summaryEl = null;
  }

  /** Replace the schedule (e.g. after the active-schedule changes).
   *  Resets sort state. */
  setSchedule(schedule: ScheduleData): void {
    this.options = { ...this.options, schedule };
    this.state = { sortColumnId: null, sortDirection: 'asc' };
  }

  /** Returns the current sort state (defensive copy). */
  getState(): ScheduleViewState { return { ...this.state }; }

  /** Re-evaluate the schedule and patch the DOM.  Cheap on stable
   *  inputs: only innerHTML of cells changes (header row is rebuilt
   *  on column changes — see `renderHeader`). */
  render(): void {
    if (!this.tbody || !this.thead || !this.summaryEl) return;
    const schedule = this.options.schedule;
    withScheduleSpan('pryzm.schedule.render', () => {
      const elements = this.options.getElements();
      const rawRows = evaluateSchedule(schedule, elements);
      const rows = this.state.sortColumnId
        ? sortRows(rawRows, schedule.columns, this.state.sortColumnId, this.state.sortDirection)
        : rawRows;

      this.renderSummary(schedule, rows.length, elements.length);
      this.renderHeader(schedule);
      this.renderBody(schedule, rows);
    }, { scheduleId: schedule.id });
  }

  // ── private renderers ────────────────────────────────────────────────────

  private renderSummary(schedule: ScheduleData, rowCount: number, sourceCount: number): void {
    if (!this.summaryEl) return;
    const grouped = schedule.groupBy ? ` (grouped by ${schedule.groupBy})` : '';
    const filtered = schedule.filter ? ` · filter active` : '';
    this.summaryEl.textContent = `${schedule.name} — ${rowCount} row${rowCount === 1 ? '' : 's'} of ${sourceCount} ${schedule.elementType}${grouped}${filtered}`;
  }

  private renderHeader(schedule: ScheduleData): void {
    if (!this.thead) return;
    const doc = this.thead.ownerDocument;
    this.thead.replaceChildren();
    const tr = doc.createElement('tr');
    for (const col of schedule.columns) {
      const th = doc.createElement('th');
      const headerText = col.unit ? `${col.header} (${col.unit})` : col.header;
      th.textContent = headerText;
      th.dataset.columnId = col.id;
      th.dataset.columnType = col.type;
      th.style.cursor = 'pointer';
      // Sort indicator.
      if (this.state.sortColumnId === col.id) {
        th.dataset.sort = this.state.sortDirection;
        th.textContent = `${headerText} ${this.state.sortDirection === 'asc' ? '▲' : '▼'}`;
      }
      th.addEventListener('click', () => this.onHeaderClick(col.id));
      tr.appendChild(th);
    }
    if (schedule.groupBy) {
      // Add a synthetic "Count" column when grouping is active so the
      // group size is visible without forcing the user to add a
      // COUNT() column manually.
      const th = doc.createElement('th');
      th.textContent = 'Count';
      th.dataset.columnId = '__group_count__';
      th.dataset.columnType = 'number';
      tr.appendChild(th);
    }
    this.thead.appendChild(tr);
  }

  private renderBody(schedule: ScheduleData, rows: readonly ScheduleRow[]): void {
    if (!this.tbody) return;
    const doc = this.tbody.ownerDocument;
    this.tbody.replaceChildren();
    if (rows.length === 0) {
      const tr = doc.createElement('tr');
      const td = doc.createElement('td');
      td.colSpan = schedule.columns.length + (schedule.groupBy ? 1 : 0);
      td.className = 'pryzm-schedule-empty';
      td.textContent = `No ${schedule.elementType} elements${schedule.filter ? ' match the filter' : ''}.`;
      tr.appendChild(td);
      this.tbody.appendChild(tr);
      return;
    }
    for (const row of rows) {
      const tr = doc.createElement('tr');
      tr.dataset.elementId = row.elementId;
      for (const col of schedule.columns) {
        const td = doc.createElement('td');
        const value = row.cells[col.id] ?? null;
        td.dataset.columnId = col.id;
        td.dataset.columnType = col.type;
        if (typeof value === 'string' && (value === CELL_ERR || value === CELL_UNDEF || value === CELL_CIRCULAR)) {
          td.dataset.error = value.replace('#', '').toLowerCase();
        }
        td.textContent = formatCell(value, col.type);
        if (col.type === 'number') td.style.textAlign = 'right';
        else if (col.type === 'boolean') td.style.textAlign = 'center';
        tr.appendChild(td);
      }
      if (schedule.groupBy) {
        const td = doc.createElement('td');
        td.dataset.columnId = '__group_count__';
        td.style.textAlign = 'right';
        td.textContent = String(row.groupSize ?? 1);
        tr.appendChild(td);
      }
      this.tbody.appendChild(tr);
    }
  }

  private onHeaderClick(columnId: string): void {
    const next: ScheduleViewState = (() => {
      if (this.state.sortColumnId !== columnId) {
        return { sortColumnId: columnId, sortDirection: 'asc' };
      }
      if (this.state.sortDirection === 'asc') {
        return { sortColumnId: columnId, sortDirection: 'desc' };
      }
      // Third click clears the sort.
      return { sortColumnId: null, sortDirection: 'asc' };
    })();
    this.state = next;
    this.options.onSortChanged?.(next);
    this.render();
  }
}

function formatCell(value: import('@pryzm/schemas/schedule').FormulaResult, type: 'number' | 'string' | 'boolean'): string {
  if (value === null || value === undefined) return '';
  if (type === 'number' && typeof value === 'number') {
    // Trim trailing zeros for nicer display, but keep up to 4 dp.
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(4).replace(/\.?0+$/, '');
  }
  if (type === 'boolean') return value ? '✓' : '';
  return String(value);
}
