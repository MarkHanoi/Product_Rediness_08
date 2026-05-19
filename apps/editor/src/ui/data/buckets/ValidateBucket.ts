/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    UI — F3 Data Mode, Bucket 3 (Phase 2.4)
 * File:             src/ui/data/buckets/ValidateBucket.ts
 * Contract:         05-BIM-UI-ARCHITECTURE-CONTRACT §3 (CSS prefix: val-)
 *                   01-BIM-ENGINE-CORE-CONTRACT §2 (Read-only — no commands fired)
 *
 * ValidateBucket — Engineering compliance view.
 * Three sub-tabs: Acoustic | Luminous | Air Quality
 * Strictly read-only. No store mutations. No commands dispatched.
 *
 * Updates on 'pryzm-delta-updated' event.
 */

import { requirementStore } from '@pryzm/core-app-model';

// ── STC lookup table ──────────────────────────────────────────────────────────

const STC_TABLE: Record<string, number> = {
  'Single stud, 13mm GWB':    35,
  'Double stud, 2× 13mm GWB': 50,
  'CMU 200mm':                 52,
  'CLT 175mm':                 46,
};

type SubTab = 'acoustic' | 'luminous' | 'airquality';

// ── ValidateBucket ────────────────────────────────────────────────────────────

export class ValidateBucket {
  private _el!:          HTMLElement;
  private _tabBar!:      HTMLElement;
  private _body!:        HTMLElement;
  private _activeTab:    SubTab = 'acoustic';
  private _selectedRooms: Set<string> = new Set();

  /** Phase B (S73-WIRE) — runtime threaded by parent. */
  public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

  constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
      this.runtime = runtime;
    this._buildDOM();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get element(): HTMLElement { return this._el; }

  setSelectedRooms(roomIds: Set<string>): void {
    this._selectedRooms = roomIds;
    this._renderBody();
  }

  refresh(): void { this._renderBody(); }

  // ── DOM construction ───────────────────────────────────────────────────────

  private _buildDOM(): void {
    this._el = document.createElement('div');
    this._el.className = 'val-shell';
    this._el.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;';

    const header = document.createElement('div');
    header.className = 'val-header';
    header.textContent = '⚗️  VALIDATE — Engineering Compliance';
    this._el.appendChild(header);

    this._tabBar = document.createElement('div');
    this._tabBar.className = 'val-tab-bar';
    this._buildTabBar();
    this._el.appendChild(this._tabBar);

    this._body = document.createElement('div');
    this._body.className = 'val-body';
    this._body.style.cssText = 'flex:1;overflow:auto;';
    this._el.appendChild(this._body);

    this._renderBody();
  }

  private _buildTabBar(): void {
    const tabs: { id: SubTab; label: string }[] = [
      { id: 'acoustic',   label: '🔊 Acoustic' },
      { id: 'luminous',   label: '💡 Luminous' },
      { id: 'airquality', label: '🌬️  Air Quality' },
    ];
    this._tabBar.innerHTML = '';
    for (const tab of tabs) {
      const btn = document.createElement('button');
      btn.className = `val-tab-btn${this._activeTab === tab.id ? ' val-tab-active' : ''}`;
      btn.textContent = tab.label;
      btn.addEventListener('click', () => {
        this._activeTab = tab.id;
        this._buildTabBar();
        this._renderBody();
      });
      this._tabBar.appendChild(btn);
    }
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  private _renderBody(): void {
    switch (this._activeTab) {
      case 'acoustic':   this._renderAcoustic();   break;
      case 'luminous':   this._renderLuminous();   break;
      case 'airquality': this._renderAirQuality(); break;
    }
  }

  private _renderAcoustic(): void {
    const requirements = requirementStore.getAll();
    const filtered = this._selectedRooms.size > 0
      ? requirements.filter(r => this._selectedRooms.has(r.roomId))
      : requirements;

    if (filtered.length === 0) {
      this._body.innerHTML = this._emptyState('No requirements defined. Add room requirements in Strategize.');
      return;
    }

    const rs = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
    const rows = filtered.map(req => {
      const roomName = this._getRoomName(req.roomId, rs);
      const reqStc   = req.parameters.physics.stc_db;

      const wallType  = this._inferWallType(req.roomId);
      const actualStc = STC_TABLE[wallType] ?? 0;
      const pass      = actualStc >= reqStc;

      return { roomName, wallType, actualStc, reqStc, pass };
    });

    this._body.innerHTML = `
      <table class="val-table">
        <thead>
          <tr>
            <th>Room</th>
            <th>Wall Type</th>
            <th>Partition STC</th>
            <th>Required STC</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${r.roomName}</td>
              <td>${r.wallType}</td>
              <td>${r.actualStc}</td>
              <td>${r.reqStc}</td>
              <td><span class="val-badge val-badge--${r.pass ? 'pass' : 'fail'}">${r.pass ? 'PASS' : 'FAIL'}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  private _renderLuminous(): void {
    const requirements = requirementStore.getAll();
    const filtered = this._selectedRooms.size > 0
      ? requirements.filter(r => this._selectedRooms.has(r.roomId))
      : requirements;

    if (filtered.length === 0) {
      this._body.innerHTML = this._emptyState('No requirements defined.');
      return;
    }

    const rs = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
    const rows = filtered.map(req => {
      const roomName   = this._getRoomName(req.roomId, rs);
      const reqLux     = req.parameters.physics.lux_task;
      const floorArea  = req.parameters.spatial.targetArea_m2;
      const windowArea = this._estimateWindowArea(req.roomId);
      const wwr        = floorArea > 0 ? (windowArea / floorArea) * 100 : 0;
      const estLux     = Math.round(wwr * 500);
      const pass       = estLux >= reqLux;

      return { roomName, windowArea: windowArea.toFixed(1), floorArea: floorArea.toFixed(1), wwr: wwr.toFixed(0), estLux, reqLux, pass };
    });

    this._body.innerHTML = `
      <table class="val-table">
        <thead>
          <tr>
            <th>Room</th>
            <th>Window Area m²</th>
            <th>Room Area m²</th>
            <th>WWR %</th>
            <th>Est. Lux</th>
            <th>Required Lux</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${r.roomName}</td>
              <td>${r.windowArea}</td>
              <td>${r.floorArea}</td>
              <td>${r.wwr}%</td>
              <td>${r.estLux}</td>
              <td>${r.reqLux}</td>
              <td><span class="val-badge val-badge--${r.pass ? 'pass' : 'fail'}">${r.pass ? 'PASS' : 'FAIL'}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  private _renderAirQuality(): void {
    const requirements = requirementStore.getAll();
    const filtered = this._selectedRooms.size > 0
      ? requirements.filter(r => this._selectedRooms.has(r.roomId))
      : requirements;

    if (filtered.length === 0) {
      this._body.innerHTML = this._emptyState('No requirements defined.');
      return;
    }

    const rs = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
    const rows = filtered.map(req => {
      const roomName  = this._getRoomName(req.roomId, rs);
      const reqAch    = req.parameters.physics.ach;
      const area      = req.parameters.spatial.targetArea_m2;
      const height    = (req.parameters.spatial.clearHeight_mm ?? 2700) / 1000;
      const volume    = area * height;
      const reqM3h    = Math.round(volume * reqAch);

      return { roomName, volume: volume.toFixed(1), reqAch, reqM3h };
    });

    this._body.innerHTML = `
      <table class="val-table">
        <thead>
          <tr>
            <th>Room</th>
            <th>Volume m³</th>
            <th>Required ACH</th>
            <th>Required m³/h</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${r.roomName}</td>
              <td>${r.volume}</td>
              <td>${r.reqAch}</td>
              <td>${r.reqM3h}</td>
              <td><span class="val-badge val-badge--info">INFO</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private _emptyState(msg: string): string {
    return `<div style="padding:24px 16px;text-align:center;color:var(--app-text-muted);font-size:12px;">${msg}</div>`;
  }

  private _getRoomName(roomId: string, rs: any): string {
    if (!rs) return roomId;
    try {
      const all: any[] = rs.getAll?.() ?? [];
      const room = all.find((r: any) => r.id === roomId);
      return room?.name || room?.label || roomId;
    } catch { return roomId; }
  }

  private _inferWallType(_roomId: string): string {
    return 'Single stud, 13mm GWB';
  }

  private _estimateWindowArea(_roomId: string): number {
    return 2.5;
  }
}
