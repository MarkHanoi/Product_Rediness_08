/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    UI — F3 Data Mode, Bucket 2 (Phase 2.3)
 * File:             src/ui/data/buckets/AuditBucket.ts
 * Contract:         05-BIM-UI-ARCHITECTURE-CONTRACT §3 (CSS prefix: audit-)
 *                   01-BIM-ENGINE-CORE-CONTRACT §2 (bi-directional heartbeat)
 *
 * AuditBucket — Global delta grid across all rooms and levels.
 * Lives in F3/Data mode. Subscribes to 'pryzm-delta-updated' for live updates.
 *
 * Row click → fires 'pryzm-workbench-select' (queued when canvas is hidden).
 * [Sync to Brief] → batch AutoRemediateCommand via the legacy command manager batch API.
 *
 * CONTRACT RULES:
 *   - No Three.js imports
 *   - Mutations only via the legacy command manager / executeBatch()
 *   - Read-only store access
 */

import { comparisonEngine, DeltaEntry } from '@pryzm/core-app-model';
import { AutoRemediateCommand } from '@pryzm/core-app-model';

// ── Helpers ────────────────────────────────────────────────────────────────────

function computeOverallStatus(entries: readonly DeltaEntry[]): { label: string; cls: string } {
  if (entries.length === 0) return { label: 'NO DATA', cls: 'audit-badge--info' };
  const fails = entries.filter(e => e.status === 'FAIL').length;
  const warns  = entries.filter(e => e.status === 'WARN').length;
  if (fails > 0) return { label: `FAIL (${fails})`, cls: 'audit-badge--fail' };
  if (warns > 0) return { label: `WARN (${warns})`, cls: 'audit-badge--warn' };
  return { label: 'PASS', cls: 'audit-badge--pass' };
}

function getAreaDelta(entries: readonly DeltaEntry[]): string {
  const e = entries.find(x => x.metric === 'Area');
  if (!e) return '—';
  const d = typeof e.delta === 'number' ? e.delta : 0;
  return (d > 0 ? '+' : '') + d.toFixed(1) + ' m²';
}

function getMissingAssetCount(entries: readonly DeltaEntry[]): number {
  return entries.filter(e => e.category === 'assets' && e.status === 'MISSING').length;
}

// ── AuditBucket ───────────────────────────────────────────────────────────────

export class AuditBucket {
  private _el!:           HTMLElement;
  private _toolbar!:      HTMLElement;
  private _tableBody!:    HTMLTableSectionElement;
  private _statusBar!:    HTMLElement;
  private _selectedRooms: Set<string> = new Set();
  private _prevSnapshot:  Map<string, string> = new Map();

  private _unsubDeltaHandler: (() => void) | null = null;

  /** Phase B (S73-WIRE) — runtime threaded by parent. */
  public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

  constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
      this.runtime = runtime;
    this._buildDOM();
    this._bindEvents();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get element(): HTMLElement { return this._el; }

  setSelectedRooms(roomIds: Set<string>): void {
    this._selectedRooms = roomIds;
    this._renderRows();
  }

  refresh(): void { this._renderRows(); }

  dispose(): void {
    // F.events.6 — pryzm-delta-updated migrated to runtime.events typed bus.
    this._unsubDeltaHandler?.();
    this._unsubDeltaHandler = null;
  }

  // ── DOM construction ───────────────────────────────────────────────────────

  private _buildDOM(): void {
    this._el = document.createElement('div');
    this._el.className = 'audit-shell';
    this._el.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;';

    const header = document.createElement('div');
    header.className = 'audit-header';
    header.innerHTML = '<span>🔍  AUDIT — Global Delta Grid</span>';
    this._el.appendChild(header);

    this._toolbar = document.createElement('div');
    this._toolbar.className = 'audit-toolbar';
    this._buildToolbar();
    this._el.appendChild(this._toolbar);

    const tableWrap = document.createElement('div');
    tableWrap.style.cssText = 'flex:1;overflow:auto;';

    const table = document.createElement('table');
    table.className = 'audit-table';

    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>Room ID</th>
        <th>Room Name</th>
        <th>Δ Area m²</th>
        <th>Δ Height</th>
        <th>Δ STC dB</th>
        <th>Δ Lux</th>
        <th>Δ Floor Finish</th>
        <th>Missing Assets</th>
        <th>Status</th>
        <th></th>
      </tr>
    `;
    table.appendChild(thead);

    this._tableBody = document.createElement('tbody');
    table.appendChild(this._tableBody);
    tableWrap.appendChild(table);
    this._el.appendChild(tableWrap);

    this._statusBar = document.createElement('div');
    this._statusBar.className = 'audit-status-bar';
    this._el.appendChild(this._statusBar);

    this._renderRows();
  }

  private _buildToolbar(): void {
    this._toolbar.innerHTML = '';

    const syncBtn = document.createElement('button');
    syncBtn.className = 'audit-sync-btn';
    syncBtn.innerHTML = '🛠️ Sync Model to Brief';
    syncBtn.title = 'Auto-remediate all FAIL rooms';
    syncBtn.addEventListener('click', () => this._onSyncAll());
    this._toolbar.appendChild(syncBtn);

    const hint = document.createElement('span');
    hint.className = 'audit-toolbar-hint';
    hint.textContent = 'Click any row to navigate to that room in 3D view';
    this._toolbar.appendChild(hint);
  }

  // ── Event binding ──────────────────────────────────────────────────────────

  private _bindEvents(): void {
    // F.events.6 — pryzm-delta-updated migrated to runtime.events typed bus.
    // Uses window.runtime (globals.d.ts) so on() returns () => void (not Disposable).
    this._unsubDeltaHandler = window.runtime?.events?.on('pryzm-delta-updated', () => {
      this._renderRowsDiff();
    }) ?? null;
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  private _renderRows(): void {
    const deltaMap = comparisonEngine.getDeltaMap();
    const rs       = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot

    this._tableBody.innerHTML = '';
    this._prevSnapshot.clear();

    let totalRooms = 0, failRooms = 0;

    deltaMap.forEach((entries, roomId) => {
      if (this._selectedRooms.size > 0 && !this._selectedRooms.has(roomId)) return;
      totalRooms++;

      const status = computeOverallStatus(entries);
      if (status.cls === 'audit-badge--fail') failRooms++;

      const row = this._buildRow(roomId, entries, rs, status);
      this._tableBody.appendChild(row);
      this._prevSnapshot.set(roomId, status.label);
    });

    if (totalRooms === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 10;
      td.style.cssText = 'text-align:center;padding:32px;color:var(--app-text-muted);font-size:12px;';
      td.textContent = 'No requirements defined. Use Strategize to set room requirements.';
      tr.appendChild(td);
      this._tableBody.appendChild(tr);
    }

    this._statusBar.textContent = `${totalRooms} rooms  |  ${failRooms} failing  |  ${totalRooms - failRooms} passing`;
  }

  private _renderRowsDiff(): void {
    const deltaMap = comparisonEngine.getDeltaMap();
    const rs       = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
    const seenIds  = new Set<string>();

    deltaMap.forEach((entries, roomId) => {
      if (this._selectedRooms.size > 0 && !this._selectedRooms.has(roomId)) return;
      seenIds.add(roomId);

      const status    = computeOverallStatus(entries);
      const prevLabel = this._prevSnapshot.get(roomId);

      if (prevLabel === status.label) {
        const existingRow = this._tableBody.querySelector(`[data-room-id="${roomId}"]`);
        if (existingRow) return;
      }

      const existingRow = this._tableBody.querySelector(`[data-room-id="${roomId}"]`) as HTMLTableRowElement | null;
      const newRow = this._buildRow(roomId, entries, rs, status);

      if (existingRow) {
        this._tableBody.replaceChild(newRow, existingRow);
      } else {
        this._tableBody.appendChild(newRow);
      }

      this._prevSnapshot.set(roomId, status.label);
    });

    const allRows = Array.from(this._tableBody.querySelectorAll('[data-room-id]'));
    for (const row of allRows) {
      const id = (row as HTMLElement).dataset.roomId;
      if (id && !seenIds.has(id)) row.remove();
    }

    const totalRooms = this._tableBody.querySelectorAll('[data-room-id]').length;
    const failRows   = this._tableBody.querySelectorAll('.audit-row--fail').length;
    this._statusBar.textContent = `${totalRooms} rooms  |  ${failRows} failing  |  ${totalRooms - failRows} passing`;
  }

  private _buildRow(
    roomId: string,
    entries: readonly DeltaEntry[],
    rs: any,
    status: { label: string; cls: string },
  ): HTMLTableRowElement {
    const tr = document.createElement('tr');
    tr.dataset.roomId = roomId;

    const isFail = status.cls === 'audit-badge--fail';
    if (isFail) tr.classList.add('audit-row--fail');

    const roomName   = this._getRoomName(roomId, rs);
    const areaDelta  = getAreaDelta(entries);
    const heightDelta = this._getDeltaStr(entries, 'Height');
    const stcDelta   = this._getDeltaStr(entries, 'STC');
    const luxDelta   = this._getDeltaStr(entries, 'Lux');
    const floorFinish = this._getFinishStatus(entries, 'Floor Finish');
    const missingAssets = getMissingAssetCount(entries);

    tr.innerHTML = `
      <td style="font-family:monospace;font-size:10px;">${roomId.substring(0, 12)}</td>
      <td>${roomName}</td>
      <td class="${this._deltaClass(areaDelta)}">${areaDelta}</td>
      <td>${heightDelta}</td>
      <td>${stcDelta}</td>
      <td>${luxDelta}</td>
      <td>${floorFinish}</td>
      <td>${missingAssets > 0 ? `<span class="audit-badge audit-badge--fail">${missingAssets} missing</span>` : '—'}</td>
      <td><span class="audit-badge ${status.cls}">${status.label}</span></td>
      <td></td>
    `;

    if (isFail) {
      const fixTd = tr.querySelector('td:last-child')!;
      const fixBtn = document.createElement('button');
      fixBtn.className = 'audit-fix-btn';
      fixBtn.textContent = '🛠️ FIX';
      fixBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._remediateRoom(roomId, entries);
      });
      fixTd.appendChild(fixBtn);
    }

    tr.addEventListener('click', () => {
      // F.events.7 — pryzm-workbench-select migrated to runtime.events typed bus.
      window.runtime?.events?.emit('pryzm-workbench-select', { roomId, source: 'audit-bucket' });
      console.log(`[AuditBucket] Room selected: ${roomId}`);
    });

    return tr;
  }

  // ── Remediation ────────────────────────────────────────────────────────────

  private _onSyncAll(): void {
    const deltaMap = comparisonEngine.getDeltaMap();
    const cmdManager = window.commandManager; // TODO(E.5.x): legacy commandManager — replace with runtime.bus.executeCommand(name, payload)
    if (!cmdManager) {
      console.warn('[AuditBucket] commandManager unavailable');
      return;
    }

    const cmds: AutoRemediateCommand[] = [];
    deltaMap.forEach((entries, roomId) => {
      if (this._selectedRooms.size > 0 && !this._selectedRooms.has(roomId)) return;
      const fails = entries.filter(e => e.status === 'FAIL');
      if (fails.length === 0) return;

      const cmd = new AutoRemediateCommand({ roomId, entries: fails });
      const v   = cmd.canExecute(cmdManager.getContext?.() ?? {});
      if (v.ok) cmds.push(cmd);
    });

    if (cmds.length === 0) {
      console.log('[AuditBucket] No rooms to remediate');
      return;
    }

    if (cmdManager.executeBatch) {
      cmdManager.executeBatch(cmds, { source: 'HUMAN_DIRECT' });
      console.log(`[AuditBucket] Bulk-fix: dispatched ${cmds.length} AutoRemediateCommand(s)`);
    } else {
      for (const cmd of cmds) cmdManager.execute(cmd, { source: 'HUMAN_DIRECT' });
    }

    this._updateSyncProgress(cmds.length);
  }

  private _remediateRoom(roomId: string, entries: readonly DeltaEntry[]): void {
    const cmdManager = window.commandManager; // TODO(E.5.x): legacy commandManager — replace with runtime.bus.executeCommand(name, payload)
    if (!cmdManager) return;

    const fails = entries.filter(e => e.status === 'FAIL') as DeltaEntry[];
    if (fails.length === 0) return;

    const cmd = new AutoRemediateCommand({ roomId, entries: fails });
    const v   = cmd.canExecute(cmdManager.getContext?.() ?? {});
    if (!v.ok) {
      console.warn(`[AuditBucket] canExecute failed: ${v.reason}`);
      return;
    }

    cmdManager.execute(cmd, { source: 'HUMAN_DIRECT' });
    console.log(`[AuditBucket] AutoRemediateCommand dispatched for room ${roomId}`);
  }

  private _updateSyncProgress(count: number): void {
    this._statusBar.textContent = `Fixing ${count} room(s)…`;
    setTimeout(() => this._renderRows(), 300);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private _getRoomName(roomId: string, rs: any): string {
    if (!rs) return roomId;
    try {
      const all: any[] = rs.getAll?.() ?? [];
      const room = all.find((r: any) => r.id === roomId);
      return room?.name || room?.label || roomId;
    } catch { return roomId; }
  }

  private _getDeltaStr(entries: readonly DeltaEntry[], metric: string): string {
    const e = entries.find(x => x.metric === metric);
    if (!e) return '—';
    if (typeof e.delta === 'number') {
      return (e.delta > 0 ? '+' : '') + e.delta.toFixed(1);
    }
    return String(e.delta);
  }

  private _getFinishStatus(entries: readonly DeltaEntry[], metric: string): string {
    const e = entries.find(x => x.metric === metric);
    if (!e) return '—';
    return e.status === 'PASS'
      ? '<span class="audit-badge audit-badge--pass">PASS</span>'
      : '<span class="audit-badge audit-badge--fail">MISMATCH</span>';
  }

  private _deltaClass(val: string): string {
    if (val === '—') return '';
    const n = parseFloat(val);
    if (isNaN(n) || n === 0) return '';
    return n < 0 ? 'audit-cell--neg' : 'audit-cell--pos';
  }
}
