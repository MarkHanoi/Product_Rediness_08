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
import { ScheduleRegistry } from '@pryzm/core-app-model';
import { ScheduleExtractor } from '@pryzm/core-app-model';
import { panelManager } from '../PanelManager';

export class SchedulePanel {
  private _element: HTMLElement;
  private _currentScheduleId: string | null = null;
  private _tbody: HTMLTableSectionElement | null = null;

  /** columnId → hidden: per-schedule hidden-column sets. Session-only. */
  private _hiddenColumns: Map<string, Set<string>> = new Map();

  /** Whether the column-picker sidebar is currently open. */
  private _fieldsOpen = false;

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
  }

  show(scheduleId: string) {
    this._currentScheduleId = scheduleId;
    this._fieldsOpen = false;
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

  // ── Column visibility helpers ────────────────────────────────────────────

  private _getHidden(scheduleId: string): Set<string> {
    if (!this._hiddenColumns.has(scheduleId)) {
      this._hiddenColumns.set(scheduleId, new Set());
    }
    return this._hiddenColumns.get(scheduleId)!;
  }

  private _toggleColumn(scheduleId: string, columnId: string): void {
    const hidden = this._getHidden(scheduleId);
    if (hidden.has(columnId)) {
      hidden.delete(columnId);
    } else {
      hidden.add(columnId);
    }
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

    const hidden = this._getHidden(schedule.id);
    const visibleCols = schedule.columns.filter(c => !hidden.has(c.id));
    const totalCols   = schedule.columns.length;
    const visibleCount = visibleCols.length;

    // ── Header ──────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'sched-header';

    const title = document.createElement('h2');
    title.className = 'sched-title';
    title.textContent = schedule.label;

    // Fields toggle button
    const fieldsBtn = document.createElement('button');
    fieldsBtn.className = `sched-fields-btn${this._fieldsOpen ? ' sched-fields-btn--active' : ''}`;
    fieldsBtn.setAttribute('aria-label', 'Toggle column visibility');
    fieldsBtn.setAttribute('aria-pressed', String(this._fieldsOpen));
    fieldsBtn.title = 'Include / exclude columns';
    fieldsBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="3" height="12" rx="1" fill="currentColor"/>
        <rect x="5.5" y="1" width="3" height="12" rx="1" fill="currentColor" opacity="0.6"/>
        <rect x="10" y="1" width="3" height="12" rx="1" fill="currentColor" opacity="0.35"/>
      </svg>
      Fields
      <span class="sched-fields-badge">${visibleCount}/${totalCols}</span>
    `;
    fieldsBtn.addEventListener('click', () => {
      this._fieldsOpen = !this._fieldsOpen;
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

    header.appendChild(title);
    header.appendChild(countBadge);
    header.appendChild(fieldsBtn);
    header.appendChild(closeBtn);

    // ── Layout container ─────────────────────────────────────────────────────
    const layout = document.createElement('div');
    layout.className = 'sched-layout';

    // ── Fields sidebar ───────────────────────────────────────────────────────
    if (this._fieldsOpen) {
      const sidebar = document.createElement('div');
      sidebar.className = 'sched-fields-sidebar';

      const sidebarTitle = document.createElement('div');
      sidebarTitle.className = 'sched-fields-sidebar-title';
      sidebarTitle.textContent = 'Columns';

      const quickActions = document.createElement('div');
      quickActions.className = 'sched-fields-quick';

      const showAllBtn = document.createElement('button');
      showAllBtn.className = 'sched-fields-quick-btn';
      showAllBtn.textContent = 'Show all';
      showAllBtn.addEventListener('click', () => {
        this._getHidden(schedule.id).clear();
        this.render();
      });

      const hideAllBtn = document.createElement('button');
      hideAllBtn.className = 'sched-fields-quick-btn';
      hideAllBtn.textContent = 'Hide all';
      hideAllBtn.addEventListener('click', () => {
        // Always keep at least the first column visible
        const h = this._getHidden(schedule.id);
        schedule.columns.slice(1).forEach(c => h.add(c.id));
        this.render();
      });

      quickActions.appendChild(showAllBtn);
      quickActions.appendChild(hideAllBtn);

      const fieldList = document.createElement('ul');
      fieldList.className = 'sched-fields-list';

      schedule.columns.forEach(col => {
        const isVisible = !hidden.has(col.id);
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
          this._toggleColumn(schedule.id, col.id);
          this.render();
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
      emptyMsg.textContent = 'All columns are hidden. Use the Fields button to show columns.';
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
