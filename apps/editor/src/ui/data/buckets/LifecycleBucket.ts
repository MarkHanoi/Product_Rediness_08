/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    UI — F3 Data Mode, Bucket 4 (Phase 2.5)
 * File:             src/ui/data/buckets/LifecycleBucket.ts
 * Contract:         05-BIM-UI-ARCHITECTURE-CONTRACT §3 (CSS prefix: life-)
 *                   01-BIM-ENGINE-CORE-CONTRACT §2 (Read-only in Phase 1)
 *
 * LifecycleBucket — Maintenance records, warranties, asset IDs.
 * Read-only in Phase 1.
 *
 * Quick filters: Overdue | Due this month | Under Warranty
 */

type LifecycleFilter = 'all' | 'overdue' | 'due-month' | 'under-warranty';

interface AssetRecord {
  assetId:      string;
  room:         string;
  category:     string;
  installDate:  string;
  lastServiced: string;
  nextService:  string;
  warrantyExp:  string;
  status:       'OK' | 'Due' | 'Overdue';
}

// ── LifecycleBucket ───────────────────────────────────────────────────────────

export class LifecycleBucket {
  private _el!:           HTMLElement;
  private _filterBar!:    HTMLElement;
  private _body!:         HTMLElement;
  private _activeFilter:  LifecycleFilter = 'all';
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
    this._el.className = 'life-shell';
    this._el.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;';

    const header = document.createElement('div');
    header.className = 'life-header';
    header.textContent = '🔄  LIFECYCLE — Maintenance & Warranties';
    this._el.appendChild(header);

    this._filterBar = document.createElement('div');
    this._filterBar.className = 'life-filter-bar';
    this._buildFilterBar();
    this._el.appendChild(this._filterBar);

    this._body = document.createElement('div');
    this._body.className = 'life-body';
    this._body.style.cssText = 'flex:1;overflow:auto;';
    this._el.appendChild(this._body);

    this._renderBody();
  }

  private _buildFilterBar(): void {
    const filters: { id: LifecycleFilter; label: string }[] = [
      { id: 'all',             label: 'All Assets' },
      { id: 'overdue',         label: '🔴 Overdue' },
      { id: 'due-month',       label: '🟡 Due this month' },
      { id: 'under-warranty',  label: '🟢 Under Warranty' },
    ];
    this._filterBar.innerHTML = '';
    for (const f of filters) {
      const btn = document.createElement('button');
      btn.className = `life-filter-btn${this._activeFilter === f.id ? ' life-filter-active' : ''}`;
      btn.textContent = f.label;
      btn.addEventListener('click', () => {
        this._activeFilter = f.id;
        this._buildFilterBar();
        this._renderBody();
      });
      this._filterBar.appendChild(btn);
    }
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  private _renderBody(): void {
    const allAssets = this._collectAssets();
    const today       = new Date();
    const inOneMonth  = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());

    const filtered = allAssets.filter(a => {
      const next      = new Date(a.nextService);
      const warExp    = new Date(a.warrantyExp);
      if (this._activeFilter === 'overdue')        return next < today;
      if (this._activeFilter === 'due-month')      return next >= today && next <= inOneMonth;
      if (this._activeFilter === 'under-warranty') return warExp > today;
      return true;
    });

    if (filtered.length === 0) {
      this._body.innerHTML = `
        <div style="padding:24px;text-align:center;color:var(--app-text-muted);font-size:12px;">
          No assets found for the current filter.
          ${allAssets.length === 0 ? '<br><span style="font-size:11px;margin-top:8px;display:block;">Place furniture or equipment elements in the model to see lifecycle data.</span>' : ''}
        </div>
      `;
      return;
    }

    this._body.innerHTML = `
      <table class="life-table">
        <thead>
          <tr>
            <th>Asset ID</th>
            <th>Room</th>
            <th>Category</th>
            <th>Install Date</th>
            <th>Last Serviced</th>
            <th>Next Service</th>
            <th>Warranty Expiry</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(a => `
            <tr>
              <td style="font-family:monospace;font-size:10px;">${a.assetId.substring(0,12)}…</td>
              <td>${a.room}</td>
              <td>${a.category}</td>
              <td>${a.installDate || '—'}</td>
              <td>${a.lastServiced || '—'}</td>
              <td>${a.nextService || '—'}</td>
              <td>${a.warrantyExp || '—'}</td>
              <td><span class="life-badge life-badge--${a.status.toLowerCase()}">${a.status}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private _collectAssets(): AssetRecord[] {
    const records: AssetRecord[] = [];
    const today = new Date();

    try {
      const elementRegistry = window.elementRegistry; // TODO(D.4): legacy elementRegistry — replace with runtime.scene.elementRegistry
      if (!elementRegistry?.getAll) return this._demoAssets();

      const elements = elementRegistry.getAll?.() ?? [];
      const rs = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot

      for (const el of elements) {
        if (!el.userData?.roomId) continue;
        const roomId = el.userData.roomId;
        if (this._selectedRooms.size > 0 && !this._selectedRooms.has(roomId)) continue;

        const meta = el.metadata ?? {};
        const installDate  = meta.installDate  ?? '';
        const lastServiced = meta.lastServiced ?? '';
        const warrantyExp  = meta.warrantyExpiry ?? '';
        const nextSvc      = meta.nextService ?? '';

        const next = nextSvc ? new Date(nextSvc) : null;
        let status: AssetRecord['status'] = 'OK';
        if (next) {
          if (next < today) status = 'Overdue';
          else if (next <= new Date(today.getTime() + 30 * 86400000)) status = 'Due';
        }

        const roomName = this._getRoomName(roomId, rs);

        records.push({
          assetId:      el.id,
          room:         roomName,
          category:     el.parameters?.category ?? el.type ?? 'unknown',
          installDate,
          lastServiced,
          nextService:  nextSvc,
          warrantyExp,
          status,
        });
      }
    } catch (e) {
      console.warn('[LifecycleBucket] Error collecting assets:', e);
    }

    if (records.length === 0) return this._demoAssets();
    return records;
  }

  private _demoAssets(): AssetRecord[] {
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().split('T')[0];

    const overdue   = new Date(today.getTime() - 10 * 86400000);
    const dueSoon   = new Date(today.getTime() + 15 * 86400000);
    const warExpiry = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
    const warPast   = new Date(today.getTime() - 60 * 86400000);
    const installed = new Date(today.getFullYear() - 2, today.getMonth(), today.getDate());

    return [
      { assetId: 'asset-001-hvac-unit', room: 'Exam Room 01', category: 'mep',       installDate: fmt(installed), lastServiced: fmt(overdue),  nextService: fmt(overdue),  warrantyExp: fmt(warExpiry), status: 'Overdue' },
      { assetId: 'asset-002-bed',       room: 'Ward A',        category: 'furniture', installDate: fmt(installed), lastServiced: fmt(installed), nextService: fmt(dueSoon),  warrantyExp: fmt(warExpiry), status: 'Due'     },
      { assetId: 'asset-003-light-fix', room: 'Reception',     category: 'lighting',  installDate: fmt(installed), lastServiced: fmt(installed), nextService: fmt(dueSoon),  warrantyExp: fmt(warPast),   status: 'Due'     },
      { assetId: 'asset-004-sink',      room: 'Exam Room 02',  category: 'plumbing',  installDate: fmt(installed), lastServiced: fmt(installed), nextService: fmt(warExpiry),warrantyExp: fmt(warExpiry), status: 'OK'      },
      { assetId: 'asset-005-mri',       room: 'MRI Suite',     category: 'medical',   installDate: fmt(installed), lastServiced: fmt(installed), nextService: fmt(warExpiry),warrantyExp: fmt(warExpiry), status: 'OK'      },
    ];
  }

  private _getRoomName(roomId: string, rs: any): string {
    if (!rs) return roomId;
    try {
      const all: any[] = rs.getAll?.() ?? [];
      const room = all.find((r: any) => r.id === roomId);
      return room?.name || room?.label || roomId;
    } catch { return roomId; }
  }
}
