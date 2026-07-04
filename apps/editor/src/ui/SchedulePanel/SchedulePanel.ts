/**
 * @file src/ui/SchedulePanel/SchedulePanel.ts
 * @description BIM schedule panel — displays element-category tables with
 *              per-schedule column include/exclude control.
 *
 * CONTRACT (05-BIM-UI-ARCHITECTURE-CONTRACT §1, §3, §4):
 *  - Prefix: `sched-`  (Schedule Panel — registered in contract §3 table)
 *  - NO bim-* web components (§7.8). Uses native <table> instead of bim-table,
 *    native <button> instead of bim-button.
 *  - CSS lives in AppTheme.ts (SCHEDULE_PANEL_STYLES). No inline style.cssText
 *    on the outer shell or header.
 *  - UI-only; zero direct writes to ElementStores.
 *
 * Phase 6 §6.2 — Bidirectional selection:
 *  - Each row carries data-element-id.
 *  - Row click dispatches 'pryzm-element-selected' with source: 'schedule'.
 *  - Listens to 'pryzm-element-selected' to highlight the matching row.
 *
 * Column include/exclude:
 *  - A "Fields" button in the header toggles a column-picker sidebar.
 *  - Hidden column state is stored in _hiddenColumns: Map<scheduleId, Set<columnId>>.
 *  - State is session-only (not persisted); resets when the schedule changes.
 *  - Table re-renders immediately on each toggle.
 */
import { ScheduleRegistry, scheduleStore } from '@pryzm/core-app-model';
import { ScheduleExtractor } from '@pryzm/core-app-model';
import { panelManager } from '../PanelManager';
import {
  resolveVisibleColumns,
  allColumns,
  storeFields,
  scheduleName,
  toggleFieldPatch,
  dispatchScheduleUpdate,
} from './scheduleViewModel';

export class SchedulePanel {
  private _element: HTMLElement;
  private _currentScheduleId: string | null = null;
  private _tbody: HTMLTableSectionElement | null = null;

  /**
   * §FEAT-SCHEDULE-VIEW-EDIT (L-80) — panel mode. VIEW = read-only table whose
   * columns come from the persisted `scheduleStore` definition. EDIT = rename +
   * add/remove columns, each dispatched through the command bus (`schedule.update`
   * → UpdateScheduleCommand, P6, undoable). Never a direct store write.
   */
  private _mode: 'view' | 'edit' = 'view';

  /** Phase B (S73-WIRE) — runtime threaded by parent. */
  public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

  constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
      this.runtime = runtime;
    this._element = document.createElement('div');
    this._element.className = 'sched-panel';
    document.body.appendChild(this._element);
    panelManager.register('panel:schedule', () => this.hide());

    this.runtime?.events?.on('pryzm-element-selected', (detail) => {
      if (detail.source !== 'schedule') {
        this.highlightRow(detail.elementId);
      }
    });

    // §FEAT-SCHEDULE-VIEW-EDIT (L-80) — re-render when a definition edit lands in
    // the store (via the bus → UpdateScheduleCommand, incl. undo/redo), so the
    // visible columns / name reflect the persisted state immediately.
    const onStoreChange = (e: Event) => {
      const id = (e as CustomEvent<{ scheduleId?: string }>).detail?.scheduleId;
      if (this._currentScheduleId && (!id || id === this._currentScheduleId)) {
        if (this._element.style.display !== 'none') this.render();
      }
    };
    window.addEventListener('sched:schedule-updated', onStoreChange);
    window.addEventListener('sched:store-loaded', onStoreChange);
  }

  show(scheduleId: string) {
    this._currentScheduleId = scheduleId;
    this._mode = 'view';
    this.render();
    panelManager.notifyOpened('panel:schedule');
    this._element.style.display = 'flex';
  }

  hide() {
    panelManager.notifyClosed('panel:schedule');
    this._element.style.display = 'none';
  }

  highlightRow(elementId: string): void {
    if (!this._tbody) return;
    this._tbody.querySelectorAll('tr').forEach(tr => {
      tr.classList.toggle('sched-row--selected', tr.dataset.elementId === elementId);
    });
    const selected = this._tbody.querySelector(`tr[data-element-id="${elementId}"]`) as HTMLElement | null;
    if (selected) selected.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ── Edit dispatch (P6 — via bus, never a direct store write) ─────────────

  /** Toggle a column's membership in the schedule's persisted `fields` list. */
  private _toggleField(scheduleId: string, columnId: string): void {
    const current = storeFields(scheduleId) ?? [];
    const order = allColumns(scheduleId).map(c => c.id);
    const fields = toggleFieldPatch(current, columnId, order);
    dispatchScheduleUpdate(this.runtime, scheduleId, { fields });
    // Re-render happens on the `sched:schedule-updated` store event.
  }

  private _setFields(scheduleId: string, fields: string[]): void {
    dispatchScheduleUpdate(this.runtime, scheduleId, { fields });
  }

  private _renameSchedule(scheduleId: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed || trimmed === scheduleName(scheduleId)) return;
    dispatchScheduleUpdate(this.runtime, scheduleId, { name: trimmed });
  }

  // ── Render ───────────────────────────────────────────────────────────────

  private render() {
    if (!this._currentScheduleId) return;

    const schedule = ScheduleRegistry.get(this._currentScheduleId);
    if (!schedule) return;

    const rows = ScheduleExtractor.getRows(schedule.category);
    console.log(`[SchedulePanel] Rendering ${schedule.id} — ${rows.length} rows`);

    this._element.innerHTML = '';
    this._tbody = null;

    // §FEAT-SCHEDULE-VIEW-EDIT (L-80) — visible columns come from the PERSISTED
    // store definition (fields ∩ registry columns, in stored order); the full
    // registry set is the palette offered in EDIT mode.
    const paletteCols  = allColumns(schedule.id);
    const visibleCols  = resolveVisibleColumns(schedule.id);
    const persistedIds = new Set(storeFields(schedule.id) ?? []);
    const displayName  = scheduleName(schedule.id);
    const totalCols    = paletteCols.length;
    const visibleCount = visibleCols.length;
    // Editing requires a persisted store definition to write to. Registry-only
    // schedules (e.g. Data-Platform) stay VIEW-only.
    const canEdit = scheduleStore.has(schedule.id);
    const editing = canEdit && this._mode === 'edit';

    // ── Header ──────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'sched-header';

    let titleEl: HTMLElement;
    if (editing) {
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'sched-title sched-title-input';
      nameInput.value = displayName;
      nameInput.setAttribute('aria-label', 'Schedule name');
      const commit = () => this._renameSchedule(schedule.id, nameInput.value);
      nameInput.addEventListener('change', commit);
      nameInput.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
      });
      titleEl = nameInput;
    } else {
      const title = document.createElement('h2');
      title.className = 'sched-title';
      title.textContent = displayName;
      titleEl = title;
    }

    // Edit / Done toggle
    const editBtn = document.createElement('button');
    editBtn.className = `sched-fields-btn${editing ? ' sched-fields-btn--active' : ''}`;
    editBtn.setAttribute('aria-pressed', String(editing));
    editBtn.textContent = editing ? 'Done' : 'Edit';
    editBtn.title = editing ? 'Finish editing this schedule' : 'Edit this schedule (rename, columns)';
    editBtn.style.display = canEdit ? '' : 'none';
    editBtn.addEventListener('click', () => {
      this._mode = editing ? 'view' : 'edit';
      this.render();
    });

    // Row count badge
    const countBadge = document.createElement('span');
    countBadge.className = 'sched-count-badge';
    countBadge.textContent = `${rows.length} item${rows.length !== 1 ? 's' : ''}`;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'sched-close';
    closeBtn.setAttribute('aria-label', 'Close schedule panel');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => this.hide());

    header.appendChild(titleEl);
    header.appendChild(countBadge);
    header.appendChild(editBtn);
    header.appendChild(closeBtn);

    // ── Layout container ─────────────────────────────────────────────────────
    const layout = document.createElement('div');
    layout.className = 'sched-layout';

    // ── Fields editor sidebar (EDIT mode only) ───────────────────────────────
    if (editing) {
      const sidebar = document.createElement('div');
      sidebar.className = 'sched-fields-sidebar';

      const sidebarTitle = document.createElement('div');
      sidebarTitle.className = 'sched-fields-sidebar-title';
      sidebarTitle.textContent = `Columns  ${visibleCount}/${totalCols}`;

      const quickActions = document.createElement('div');
      quickActions.className = 'sched-fields-quick';

      const showAllBtn = document.createElement('button');
      showAllBtn.className = 'sched-fields-quick-btn';
      showAllBtn.textContent = 'Show all';
      showAllBtn.addEventListener('click', () => {
        this._setFields(schedule.id, paletteCols.map(c => c.id));
      });

      const hideAllBtn = document.createElement('button');
      hideAllBtn.className = 'sched-fields-quick-btn';
      hideAllBtn.textContent = 'Hide all';
      hideAllBtn.addEventListener('click', () => {
        // Always keep at least the first column so the table is never empty.
        this._setFields(schedule.id, paletteCols.slice(0, 1).map(c => c.id));
      });

      quickActions.appendChild(showAllBtn);
      quickActions.appendChild(hideAllBtn);

      const fieldList = document.createElement('ul');
      fieldList.className = 'sched-fields-list';

      paletteCols.forEach(col => {
        const isVisible = persistedIds.has(col.id);
        const li = document.createElement('li');
        li.className = 'sched-fields-item';

        const label = document.createElement('label');
        label.className = 'sched-fields-label';
        label.setAttribute('for', `sched-col-${col.id}`);

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `sched-col-${col.id}`;
        checkbox.className = 'sched-fields-check';
        checkbox.checked = isVisible;
        checkbox.addEventListener('change', () => {
          this._toggleField(schedule.id, col.id);
        });

        const labelText = document.createElement('span');
        labelText.textContent = col.label;

        label.appendChild(checkbox);
        label.appendChild(labelText);
        li.appendChild(label);
        fieldList.appendChild(li);
      });

      sidebar.appendChild(sidebarTitle);
      sidebar.appendChild(quickActions);
      sidebar.appendChild(fieldList);
      layout.appendChild(sidebar);
    }

    // ── Body ────────────────────────────────────────────────────────────────
    const body = document.createElement('div');
    body.className = 'sched-body';

    if (visibleCols.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'sched-empty';
      emptyMsg.textContent = 'No columns in this schedule. Use Edit to add columns.';
      body.appendChild(emptyMsg);
    } else if (rows.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'sched-empty';
      emptyMsg.textContent = `No ${schedule.category.toLowerCase()} found in the model.`;
      body.appendChild(emptyMsg);
    } else {
      const tableWrap = document.createElement('div');
      tableWrap.className = 'sched-table-wrap';

      const table = document.createElement('table');
      table.className = 'sched-table';

      // ── colgroup ─────────────────────────────────────────────────────────
      const colgroup = document.createElement('colgroup');
      visibleCols.forEach(() => {
        const col = document.createElement('col');
        col.style.width = '120px';
        colgroup.appendChild(col);
      });
      table.appendChild(colgroup);

      // ── thead with resize handles ─────────────────────────────────────
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      const cols = Array.from(colgroup.querySelectorAll('col')) as HTMLElement[];

      visibleCols.forEach((col, idx) => {
        const th = document.createElement('th');
        th.className = 'sched-th-resizable';

        const labelSpan = document.createElement('span');
        labelSpan.className = 'sched-th-label';
        labelSpan.textContent = col.label;
        th.appendChild(labelSpan);

        const handle = document.createElement('div');
        handle.className = 'sched-col-resize-handle';
        handle.title = 'Drag to resize column';

        handle.addEventListener('mousedown', (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();

          const colEl = cols[idx];
          const startX = e.clientX;
          const startW = colEl.offsetWidth || th.offsetWidth || 120;

          document.body.style.cursor = 'col-resize';
          document.body.style.userSelect = 'none';

          const onMove = (me: MouseEvent) => {
            const newW = Math.max(50, startW + (me.clientX - startX));
            colEl.style.width = `${newW}px`;
          };
          const onUp = () => {
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
          };

          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });

        th.appendChild(handle);
        headerRow.appendChild(th);
      });

      thead.appendChild(headerRow);
      table.appendChild(thead);

      // ── tbody ─────────────────────────────────────────────────────────
      const tbody = document.createElement('tbody');
      this._tbody = tbody;

      rows.forEach(row => {
        const tr = document.createElement('tr');
        if (row.id) {
          tr.dataset.elementId = row.id;
          tr.style.cursor = 'pointer';
          tr.addEventListener('click', () => {
            tbody.querySelectorAll('tr').forEach(r => r.classList.remove('sched-row--selected'));
            tr.classList.add('sched-row--selected');
            this.runtime?.events?.emit('pryzm-element-selected', {
              elementId: row.id,
              elementType: schedule.category.toLowerCase().replace(/s$/, ''),
              source: 'schedule',
            });
          });
        }

        visibleCols.forEach(col => {
          const td = document.createElement('td');
          const raw = col.value(row);
          const text = String(raw ?? '—');

          if (typeof raw === 'string' && /^[DW]\d{3}(,\s*[DW]\d{3})*$/.test(raw.trim())) {
            raw.split(',').forEach(part => {
              const badge = document.createElement('span');
              badge.className = part.trim().startsWith('D')
                ? 'sched-mark-badge sched-mark-door'
                : 'sched-mark-badge sched-mark-window';
              badge.textContent = part.trim();
              td.appendChild(badge);
            });
          } else {
            td.textContent = text;
          }

          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);

      tableWrap.appendChild(table);
      body.appendChild(tableWrap);
    }

    layout.appendChild(body);

    this._element.appendChild(header);
    this._element.appendChild(layout);
  }
}
