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
import { panelManager, PANEL_PIN_ICON_SVG } from '../PanelManager';
// §LIVESCHED151 (E) — the SAME rate-book reader the Data › MEDICIONES 5D tab
// uses (same localStorage key, same EUR-default fallback) — never a second
// reader with its own key derivation (see MedicionesBucket.ts's own note on
// why it is exported). This is the ONLY place SchedulePanel touches the 5D
// subsystem; the actual take-off + costing runs inside `ScheduleExtractor`
// (packages/core-app-model), which never reads browser storage itself.
import { loadRateBook } from '../dataworkbench/buckets/MedicionesBucket';
// §LIVESCHED151 — the panel becomes movable/resizable using the SAME shared
// utilities RACChatbotPanel/OverridePanel/VGGovernancePanel already use (no
// third drag/resize implementation), and persists its geometry through the
// SAME app-global UI-chrome funnel PropertyPanel already uses for its own
// position ('bim-pp-pos') / size ('pryzm-pp-size') — see uiPrefStorage.ts's
// own header for why writes must never throw on a full quota.
import { makeDraggable } from '../makeDraggable';
import { makeResizable } from '../makeResizable';
import { readUiPreference, writeUiPreference } from '../uiPrefStorage';

/** PR-12 (C72 §1.1) — the geometry events an OPEN schedule must re-render on.
 *  Copied from the canonical families in `engine/initScene.ts` (`_vptEditEvents`,
 *  `_rpcGeomEvents`) rather than invented, so the schedule follows the same signal
 *  the rest of the application already treats as "the model changed". `added` and
 *  `removed` are here alongside `updated` because a schedule's ROW COUNT moves on
 *  those, not only its quantities.
 *
 * §LIVESCHED151 (D) — ⭐ FIVE FAMILIES ADDED, and neither "canonical" list in
 * `initScene.ts` actually names all of them, so this is NOT a re-copy.
 * MEASURED (not read) against `ScheduleRegistry`'s own categories, which is the
 * vocabulary this file is supposed to stay in step with: `Floors`/`Ceilings`
 * read `floorStore`/`ceilingStore` (their `bim-floor-*`/`bim-ceiling-*` events
 * exist — `packages/core-app-model/src/stores/FloorStore.ts` /
 * `CeilingStore.ts` — and are even in `_rpcGeomEvents`, but PR-12's copy
 * DROPPED them); `Handrails`/`Plumbing` read `handrailStore`/`plumbingStore`
 * (their events exist in `HandrailStore.ts`/`PlumbingStore.ts` + the
 * `event-bus` catalog, consumed elsewhere — `SelectionManager.ts`,
 * `registerTransformDragHandler.ts`, `SaveOrchestrator.ts` — but never listed
 * in EITHER canonical family here); and `Rooms` — the founder's own demo
 * schedule (his "Floors Schedule" is `Rooms Schedule`, category `Rooms`,
 * user-renamed — its columns are byte-for-byte `ScheduleRegistry`'s Rooms
 * definition) — reads `roomStore`, whose `bim-room-*` events
 * (`packages/room-topology/src/RoomStore.ts`) are real, dispatched, and
 * consumed by half a dozen OTHER subsystems, yet are in NEITHER canonical
 * list — a gap in `initScene.ts`'s own families, not only in this copy of
 * them. Without this, moving a partition would recompute `room.computed.area`
 * (via `RoomTopologyObserver`'s 150 ms debounce → re-detect → `roomStore`
 * update → `bim-room-updated`) and the open schedule would never learn — the
 * exact demo the founder wants to give would show a STALE flooring area next
 * to a wall that had visibly moved. */
const SCHEDULE_GEOMETRY_EVENTS = [
  'bim-wall-added',        'bim-wall-updated',        'bim-wall-removed',
  'bim-slab-added',        'bim-slab-updated',        'bim-slab-removed',
  'bim-door-added',        'bim-door-updated',        'bim-door-removed',
  'bim-window-added',      'bim-window-updated',      'bim-window-removed',
  'bim-roof-added',        'bim-roof-updated',        'bim-roof-removed',
  'bim-stair-added',       'bim-stair-updated',       'bim-stair-removed',
  'bim-column-added',      'bim-column-updated',      'bim-column-removed',
  'bim-beam-added',        'bim-beam-updated',        'bim-beam-removed',
  'bim-furniture-added',   'bim-furniture-updated',   'bim-furniture-removed',
  'bim-curtainwall-added', 'bim-curtainwall-updated', 'bim-curtainwall-removed',
  // §LIVESCHED151 (D) — see the note above for why each of these five is real,
  // consumed elsewhere, and was nonetheless absent here.
  'bim-room-added',        'bim-room-updated',        'bim-room-removed',
  'bim-floor-added',       'bim-floor-updated',       'bim-floor-removed',
  'bim-ceiling-added',     'bim-ceiling-updated',     'bim-ceiling-removed',
  'bim-handrail-added',    'bim-handrail-updated',    'bim-handrail-removed',
  'bim-plumbing-added',    'bim-plumbing-updated',    'bim-plumbing-removed',
] as const;
import {
  resolveVisibleColumns,
  allColumns,
  storeFields,
  scheduleName,
  toggleFieldPatch,
  dispatchScheduleUpdate,
  computeColumnTotal,
} from './scheduleViewModel';

/**
 * §LIVESCHED151 (reuses §PIN146) — whether the schedule panel survives
 * PanelManager's exclusivity close. Global, browser-local, NOT per-project —
 * same scope and shape as `AI_CHAT_PIN_STORAGE_KEY` (AIPanel.ts) and
 * RailPanelController's `rp-panel-pinned`. The pinned STATE itself lives in
 * `panelManager` (the one shared authority, C84 EI-9); this key exists only to
 * remember the user's choice across a reload, exactly like the other two.
 */
export const SCHEDULE_PANEL_PIN_STORAGE_KEY = 'pryzm-sched-panel-pinned';

function _loadSchedPinned(): boolean {
  try { return localStorage.getItem(SCHEDULE_PANEL_PIN_STORAGE_KEY) === 'true'; } catch { return false; }
}
function _saveSchedPinned(value: boolean): void {
  try { localStorage.setItem(SCHEDULE_PANEL_PIN_STORAGE_KEY, String(value)); } catch { /* ignore */ }
}

/** §LIVESCHED151 — panel position/size, app-global UI chrome (never project
 *  content), through the SAME quota-safe funnel PropertyPanel already uses. */
const SCHED_POS_KEY  = 'pryzm-sched-pos';
const SCHED_SIZE_KEY = 'pryzm-sched-size';

export class SchedulePanel {
  private _element: HTMLElement;
  /** §LIVESCHED151 — the sub-tree `render()` clears/rebuilds each call. The
   *  drag handle (`.sched-header`, rebuilt every render) is found inside this
   *  by SELECTOR (makeDraggable re-queries on each mousedown), but the resize
   *  grip is a persistent NODE `makeResizable` attaches listeners to directly —
   *  it must live OUTSIDE what render() clears, or every re-render (which
   *  happens on every live geometry event, §LIVESCHED151 part D) would destroy
   *  it and leak a fresh pair of document-level mousemove/mouseup listeners. */
  private _contentEl: HTMLElement;
  private _panelPinned: boolean;
  /** §LIVESCHED151 (E) — "totals as an option at the bottom" (founder). A
   *  session-only toggle (not persisted, not per-schedule): the founder asked
   *  for an option, not a remembered preference, and it defaults off so an
   *  architect opening a schedule mid-review is not shown numbers they never
   *  asked to see. */
  private _showTotals = false;
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

    // §LIVESCHED151 — `render()` clears/rebuilds ONLY this inner node from now
    // on, so the resize grip (appended directly to `_element`, below) survives
    // every re-render. `.sched-content` mirrors `.sched-panel`'s own
    // flex column so header+layout keep filling the panel exactly as before —
    // see the CSS file for the rule.
    this._contentEl = document.createElement('div');
    this._contentEl.className = 'sched-content';
    this._element.appendChild(this._contentEl);

    panelManager.register('panel:schedule', () => this.hide());

    // §LIVESCHED151 (C) — capability C ("select a row, zoom, but the schedule
    // stays open") needs NO new close-guarding logic here. The only thing that
    // closes this panel today is PanelManager's own exclusivity: selecting any
    // element opens the Properties Panel (PropertyPanel._makeVisible() calls
    // `panelManager.notifyOpened('panel:property')`), and `_closeOthers` force-
    // closes every OTHER registered panel — including 'panel:schedule' — UNLESS
    // it is pinned (§PIN146). So capability C reduces entirely to capability B:
    // once this panel reports itself pinned, the SAME conditional this repo
    // already ships (`PanelManager._closeOthers`'s `if (this._pinned.has(id))
    // continue;`) is what leaves it open through a row-click zoom. No third
    // mechanism (C84 EI-9) — see the founder brief's own instruction to reuse
    // §PIN146 rather than add a second "stay open" path.
    this._panelPinned = _loadSchedPinned();
    panelManager.setPinned('panel:schedule', this._panelPinned);

    // §LIVESCHED151 (A) — restore a previously-saved position/size BEFORE the
    // panel is ever shown, mirroring PropertyPanel._initPosition/_initSize.
    this._restoreGeometry();

    // §LIVESCHED151 (A) — drag by the header, resize via a corner grip. Same
    // shared utilities RACChatbotPanel / OverridePanel / VGGovernancePanel use
    // (no new drag/resize implementation). Interactive header children are
    // excluded so clicking Edit/Pin/Close or typing a rename never starts a drag.
    makeDraggable(this._element, '.sched-header', ['.sched-close', '.sched-fields-btn', '.sched-pin-btn', 'input']);
    const resizeGrip = document.createElement('div');
    resizeGrip.className = 'sched-resize-grip';
    resizeGrip.setAttribute('aria-hidden', 'true');
    resizeGrip.title = 'Drag to resize the panel';
    this._element.appendChild(resizeGrip);
    makeResizable(this._element, resizeGrip, { minWidth: 480, minHeight: 320 });

    // §LIVESCHED151 (A) — persist geometry after a drag or resize ends. Neither
    // utility exposes a drag-end/resize-end callback, so this reads back
    // whatever the utility just settled the panel at; visible-gated so a
    // mouseup anywhere else in the app while the panel is closed is a no-op,
    // and idempotent so an unrelated mouseup while it IS open just re-saves the
    // same numbers (cheap: two small JSON writes through the quota-safe funnel).
    document.addEventListener('mouseup', () => this._persistGeometryIfVisible());

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

    // PR-12 (C72 §1.1) — RE-RENDER ON A GEOMETRY CHANGE, NOT ONLY ON A DEFINITION EDIT.
    //
    // The two subscriptions above are DEFINITION events: they fire when the schedule
    // itself is edited or loaded. Nothing above fires when the MODEL changes, so an
    // OPEN schedule kept painting pre-change quantities indefinitely. Measured, not
    // read (commit `b10828ff`): an open panel showed 24.00 m² while the slab was
    // 40.00 m². A schedule whose numbers disagree with the geometry is the exact
    // failure the BIM 3.0 programme exists to close — the model was right and the
    // surface that an architect actually reads was wrong.
    //
    // ⚠ WHY THIS IS A FAMILY AND NOT THE ONE EVENT THE TEST HAPPENED TO DISPATCH.
    // The PR-12 spec announces `bim-slab-updated`, `bim-element-updated` and
    // `pryzm-geometry-changed`. Measured at HEAD: only `bim-slab-updated` is a real
    // production event with real listeners; `pryzm-geometry-changed` is dispatched
    // NOWHERE in the tree and `bim-element-updated` only appears in one renderer's
    // list. Subscribing to just the slab event would have turned the test green while
    // leaving every wall, door, roof, stair and column schedule exactly as stale —
    // a fix shaped to the fixture rather than to the defect (C74 §3.4).
    //
    // The set below is the geometry-event family this application already treats as
    // canonical (`initScene.ts` `_vptEditEvents` / `_rpcGeomEvents`); it is copied
    // from there rather than invented, and `added`/`removed` are included alongside
    // `updated` because a schedule's ROW COUNT changes on those, not just its numbers.
    const onGeometryChange = (): void => {
      // Same guard as the definition path: a hidden panel re-renders when it is next
      // shown, so re-rendering here would be work nobody can see.
      if (this._currentScheduleId && this._element.style.display !== 'none') this.render();
    };
    for (const evt of SCHEDULE_GEOMETRY_EVENTS) {
      window.addEventListener(evt, onGeometryChange);
    }
  }

  // ── Geometry persistence (A) ─────────────────────────────────────────────

  /** Restore a saved position/size, or leave the CSS default (centred, 80%×70%)
   *  untouched when nothing was ever saved. Malformed/missing data is ignored —
   *  a broken preference must never block the panel from opening. */
  private _restoreGeometry(): void {
    try {
      const posRaw = readUiPreference(SCHED_POS_KEY);
      if (posRaw) {
        const { x, y } = JSON.parse(posRaw) as { x?: number; y?: number };
        if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
          this._element.style.left = `${x}px`;
          this._element.style.top = `${y}px`;
          this._element.style.right = 'auto';
          this._element.style.bottom = 'auto';
          this._element.style.margin = '0';
          this._element.style.transform = 'none';
        }
      }
    } catch { /* malformed — CSS default applies */ }
    try {
      const sizeRaw = readUiPreference(SCHED_SIZE_KEY);
      if (sizeRaw) {
        const { w, h } = JSON.parse(sizeRaw) as { w?: number; h?: number };
        if (typeof w === 'number' && w > 0) this._element.style.width = `${w}px`;
        if (typeof h === 'number' && h > 0) this._element.style.height = `${h}px`;
      }
    } catch { /* malformed — CSS default applies */ }
  }

  /** Persist the panel's current on-screen box. UI chrome — never project
   *  content, so it goes through the app-global `uiPrefStorage` funnel, exactly
   *  like PropertyPanel's own 'bim-pp-pos' / 'pryzm-pp-size'. */
  private _persistGeometryIfVisible(): void {
    if (this._element.style.display === 'none') return;
    const rect = this._element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return; // not actually laid out
    writeUiPreference(SCHED_POS_KEY, JSON.stringify({ x: rect.left, y: rect.top }));
    writeUiPreference(SCHED_SIZE_KEY, JSON.stringify({ w: rect.width, h: rect.height }));
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

    // §LIVESCHED151 (E) — the take-off is real work, so `ScheduleExtractor`
    // only does it when THIS schedule's persisted columns actually include
    // 'cost'. A schedule with Cost hidden, or a category the 5D engine does
    // not cover (Floors/Roofs/Slabs/Ceilings/Furniture/Plumbing — see
    // ScheduleExtractor's own `COST_COVERED_CATEGORIES`), computes nothing
    // extra: `costContext` stays `undefined` and `attachCost()` is a no-op.
    const wantsCost = (storeFields(schedule.id) ?? []).includes('cost');
    const costContext = wantsCost ? { rateBook: loadRateBook(this.runtime) } : undefined;
    const rows = ScheduleExtractor.getRows(schedule.category, costContext);
    console.log(`[SchedulePanel] Rendering ${schedule.id} — ${rows.length} rows`);

    this._contentEl.innerHTML = '';
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

    // §LIVESCHED151 (E) — "totals as an option at the bottom" (founder).
    // Reuses the existing `.sched-fields-btn` toggle-button look (Edit's own
    // class) rather than inventing a second button style.
    const totalsBtn = document.createElement('button');
    totalsBtn.type = 'button';
    totalsBtn.className = `sched-fields-btn${this._showTotals ? ' sched-fields-btn--active' : ''}`;
    totalsBtn.setAttribute('aria-pressed', String(this._showTotals));
    totalsBtn.textContent = 'Totals';
    totalsBtn.title = this._showTotals ? 'Hide the totals row' : 'Show a totals row at the bottom';
    totalsBtn.addEventListener('click', () => {
      this._showTotals = !this._showTotals;
      this.render();
    });

    // §LIVESCHED151 (B) — the ONE pin control (PANEL_PIN_ICON_SVG), wired
    // purely through panelManager's shared pin registry (§PIN146) exactly like
    // AIPanel's chat pin — no second local flag. Pinning is what lets
    // capability C (row-select zooms without closing the schedule) hold: see
    // the constructor's note on PanelManager._closeOthers.
    const pinBtn = document.createElement('button');
    pinBtn.type = 'button';
    pinBtn.className = `sched-pin-btn${this._panelPinned ? ' sched-pin-btn--active' : ''}`;
    pinBtn.title = this._panelPinned ? 'Unpin panel' : 'Pin panel (stays open while you navigate/select)';
    pinBtn.setAttribute('aria-label', pinBtn.title);
    pinBtn.setAttribute('aria-pressed', String(this._panelPinned));
    pinBtn.innerHTML = PANEL_PIN_ICON_SVG;
    pinBtn.addEventListener('click', () => {
      this._panelPinned = !this._panelPinned;
      _saveSchedPinned(this._panelPinned);
      panelManager.setPinned('panel:schedule', this._panelPinned);
      pinBtn.classList.toggle('sched-pin-btn--active', this._panelPinned);
      pinBtn.title = this._panelPinned ? 'Unpin panel' : 'Pin panel (stays open while you navigate/select)';
      pinBtn.setAttribute('aria-label', pinBtn.title);
      pinBtn.setAttribute('aria-pressed', String(this._panelPinned));
    });

    const closeBtn = document.createElement('button');
    closeBtn.className = 'sched-close';
    closeBtn.setAttribute('aria-label', 'Close schedule panel');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => this.hide());

    header.appendChild(titleEl);
    header.appendChild(countBadge);
    header.appendChild(editBtn);
    header.appendChild(totalsBtn);
    header.appendChild(pinBtn);
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

      // §LIVESCHED151 (E) — "totals as an option at the bottom" (founder).
      // One footer row, one cell per VISIBLE column — never a second, richer
      // total nobody asked for. Each cell is `computeColumnTotal` (pure,
      // scheduleViewModel.ts): `null` for a non-numeric column (blank cell),
      // a plain sum for a fully-measured numeric column, or a `≥`-prefixed
      // LOWER BOUND the instant any contributing row was unmeasured/unpriced
      // — the Cost column's own per-row honesty rule, applied once more here
      // rather than a second rule for the total.
      if (this._showTotals && rows.length > 0) {
        const tfoot = document.createElement('tfoot');
        const totalsRow = document.createElement('tr');
        totalsRow.className = 'sched-totals-row';
        visibleCols.forEach((col, idx) => {
          const td = document.createElement('td');
          if (idx === 0) {
            td.textContent = `Totals — ${rows.length} item${rows.length !== 1 ? 's' : ''}`;
          } else {
            td.textContent = computeColumnTotal(col, rows) ?? '';
          }
          totalsRow.appendChild(td);
        });
        tfoot.appendChild(totalsRow);
        table.appendChild(tfoot);
      }

      tableWrap.appendChild(table);
      body.appendChild(tableWrap);
    }

    layout.appendChild(body);

    this._contentEl.appendChild(header);
    this._contentEl.appendChild(layout);
  }
}
