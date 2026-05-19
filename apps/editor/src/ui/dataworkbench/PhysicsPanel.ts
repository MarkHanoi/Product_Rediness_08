/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    UI — DataWorkbench Physics Tab (NEW FILE)
 * Phase:             Phase H — H-4 (Physics Data Sheet Panel)
 * Files Modified:    src/ui/dataworkbench/PhysicsPanel.ts (new)
 * Classification:    A
 *
 * Contract:
 *   docs/00_PRZYM/PRYZM_WORLD_MODEL_MASTER_PLAN_2026.md § H-4
 *   docs/00_Contracts/05-BIM-UI-ARCHITECTURE-CONTRACT.md — dw- CSS prefix
 *
 * Impact Assessment:
 *   Store Reads:  YES — roomStore, physicsEngine cache (both via window.*)
 *   Store Writes: NO
 *   Event Bus:    LISTEN — pryzm-physics-updated (refresh one row),
 *                          pryzm-project-loaded   (full refresh),
 *                          pryzm-physics-mode-changed (update toolbar badge)
 *   DOM:          YES — mounted into DataWorkbench Physics tab panel
 *   CSS Prefix:   dw- (all elements follow existing DataWorkbench convention)
 *
 * Features:
 *   - Per-room table: thermal load, RT60, daylight factor, compliance badge
 *   - Physics overlay mode selector (Off / Thermal / Acoustic / Daylight)
 *   - Compute All button to trigger physics for every room
 *   - CSV export button
 *   - Auto-refreshes when pryzm-physics-updated fires
 */

import type { RoomPhysicsResult, PhysicsOverlayMode } from '@pryzm/physics-host';
import { setPhysicsOverlayMode } from '@pryzm/physics-host';
import { physicsEngine } from '@pryzm/physics-host';

// ── Badge helpers ─────────────────────────────────────────────────────────────

function thermalBadge(r: RoomPhysicsResult): string {
    if (!r.thermal) return badge('—', '#94a3b8');
    const map: Record<string, string> = {
        cold: '#60a5fa', cool: '#34d399', comfortable: '#22c55e',
        warm: '#f97316', hot: '#ef4444',
    };
    const col = map[r.thermal.thermalClass] ?? '#94a3b8';
    return badge(`${r.thermal.thermalLoad_Wm2} W/m²`, col);
}

function acousticBadge(r: RoomPhysicsResult): string {
    if (!r.acoustic) return badge('—', '#94a3b8');
    const map: Record<string, string> = {
        excellent: '#22c55e', good: '#84cc16', acceptable: '#fbbf24',
        poor: '#f97316', reverberant: '#ef4444',
    };
    const col = map[r.acoustic.acousticClass] ?? '#94a3b8';
    return badge(`${r.acoustic.rt60_s}s`, col);
}

function daylightBadge(r: RoomPhysicsResult): string {
    if (!r.daylight) return badge('—', '#94a3b8');
    const map: Record<string, string> = {
        excellent: '#22c55e', good: '#84cc16', marginal: '#fbbf24', poor: '#ef4444',
    };
    const col = map[r.daylight.daylightClass] ?? '#94a3b8';
    return badge(`${r.daylight.daylightFactor_percent}%`, col);
}

function badge(text: string, colour: string): string {
    return `<span style="
        display:inline-block;
        background:${colour}22;
        color:${colour};
        border:1px solid ${colour}44;
        border-radius:4px;
        padding:1px 6px;
        font-size:10px;
        font-weight:600;
        font-family:ui-monospace,monospace;
        white-space:nowrap;
    ">${text}</span>`;
}

// ── CSV serialisation ─────────────────────────────────────────────────────────

function toCSV(rows: Array<{ name: string; occupancy: string; result: RoomPhysicsResult }>): string {
    const header = [
        'Room Name', 'Occupancy',
        'Thermal Load (W/m²)', 'Thermal Class', 'Glazing Ratio',
        'RT60 (s)', 'Acoustic Class', 'Volume (m³)',
        'Daylight Factor (%)', 'Daylight Class', 'Glazing Area (m²)',
        'Computed At',
    ].join(',');

    const lines = rows.map(({ name, occupancy, result: r }) => [
        `"${name}"`, `"${occupancy}"`,
        r.thermal?.thermalLoad_Wm2 ?? '',
        r.thermal?.thermalClass    ?? '',
        r.thermal?.glazingRatio    ?? '',
        r.acoustic?.rt60_s          ?? '',
        r.acoustic?.acousticClass   ?? '',
        r.acoustic?.volume_m3       ?? '',
        r.daylight?.daylightFactor_percent ?? '',
        r.daylight?.daylightClass          ?? '',
        r.daylight?.glazingArea_m2         ?? '',
        r.computedAt ? new Date(r.computedAt).toISOString() : '',
    ].join(','));

    return [header, ...lines].join('\n');
}

// ── PhysicsPanel ──────────────────────────────────────────────────────────────

export class PhysicsPanel {
    private _el: HTMLElement;
    private _tableBody: HTMLElement | null = null;
    private _statusEl:  HTMLElement | null = null;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(container: HTMLElement, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        // Step 5 (DATA_PANEL_AUDIT_AND_FIX_PLAN): container is the .dw-panel element —
        // do NOT set display on it. Build into an internal root wrapper instead so
        // DataWorkbench._switchTab() retains exclusive display control over container.
        this._el = document.createElement('div');
        this._el.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;';
        container.appendChild(this._el);
        this._build();
        this._bind();
    }

    refresh(): void { this._render(); }

    // ── DOM construction ──────────────────────────────────────────────────────

    private _build(): void {

        // ── Toolbar ───────────────────────────────────────────────────────────
        const toolbar = document.createElement('div');
        toolbar.className = 'dw-toolbar';
        toolbar.style.cssText = [
            'display:flex;align-items:center;gap:6px;padding:6px 8px;',
            'border-bottom:1px solid var(--app-border,#e5e7eb);flex-shrink:0;flex-wrap:wrap;',
        ].join('');

        // Mode selector
        const modeLabel = document.createElement('span');
        modeLabel.textContent = 'Overlay:';
        modeLabel.style.cssText = 'font-size:11px;color:var(--app-text-muted,#7a8aaa);';
        toolbar.appendChild(modeLabel);

        const modeSelect = document.createElement('select');
        modeSelect.className = 'dw-toolbar-select';
        modeSelect.style.cssText = 'font-size:11px;padding:2px 6px;border-radius:4px;border:1px solid var(--app-border,#dde3f0);background:var(--app-panel-bg,#fff);color:var(--app-text,#1a2035);cursor:pointer;';
        [
            { value: 'off',      label: '— Off' },
            { value: 'thermal',  label: '🌡 Thermal' },
            { value: 'acoustic', label: '🔊 Acoustic' },
            { value: 'daylight', label: '☀ Daylight' },
        ].forEach(({ value, label }) => {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = label;
            modeSelect.appendChild(opt);
        });
        modeSelect.addEventListener('change', () => {
            try {
                setPhysicsOverlayMode(modeSelect.value as PhysicsOverlayMode);
            } catch (e) {
                console.warn('[PhysicsPanel] PhysicsOverlayRenderer not ready:', e);
            }
        });
        toolbar.appendChild(modeSelect);

        // Compute All
        const computeBtn = document.createElement('button');
        computeBtn.textContent = '⚡ Compute all';
        computeBtn.className = 'dw-rail-btn';
        computeBtn.style.cssText = [
            'padding:3px 10px;border-radius:4px;border:1px solid #6366f1;',
            'background:#6366f114;color:#6366f1;font-size:11px;cursor:pointer;font-weight:600;',
        ].join('');
        computeBtn.addEventListener('click', () => {
            try {
                physicsEngine.enqueueAll();
                if (this._statusEl) this._statusEl.textContent = 'Computing…';
            } catch (e) {
                console.warn('[PhysicsPanel] PhysicsEngine not ready:', e);
            }
        });
        toolbar.appendChild(computeBtn);

        // CSV Export
        const csvBtn = document.createElement('button');
        csvBtn.textContent = '⬇ CSV';
        csvBtn.className = 'dw-rail-btn';
        csvBtn.style.cssText = [
            'padding:3px 10px;border-radius:4px;border:1px solid #059669;',
            'background:#05966914;color:#059669;font-size:11px;cursor:pointer;font-weight:600;',
            'margin-left:auto;',
        ].join('');
        csvBtn.addEventListener('click', () => this._exportCSV());
        toolbar.appendChild(csvBtn);

        this._el.appendChild(toolbar);

        // ── Status line ───────────────────────────────────────────────────────
        const status = document.createElement('div');
        status.style.cssText = 'font-size:10px;color:var(--app-text-muted,#7a8aaa);padding:4px 10px;flex-shrink:0;';
        status.textContent = 'No physics results yet — click ⚡ Compute all';
        this._statusEl = status;
        this._el.appendChild(status);

        // ── Table wrapper ─────────────────────────────────────────────────────
        const wrap = document.createElement('div');
        wrap.style.cssText = 'flex:1;overflow:auto;';

        const table = document.createElement('table');
        table.style.cssText = 'width:100%;border-collapse:collapse;font-size:11px;';

        const thead = document.createElement('thead');
        thead.innerHTML = `<tr style="background:var(--app-bg,#e8edf6);position:sticky;top:0;z-index:1;">
            <th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--app-border,#dde3f0);white-space:nowrap;color:var(--app-text-muted,#7a8aaa);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Room</th>
            <th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--app-border,#dde3f0);white-space:nowrap;color:var(--app-text-muted,#7a8aaa);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Type</th>
            <th style="text-align:center;padding:6px 8px;border-bottom:1px solid var(--app-border,#dde3f0);white-space:nowrap;color:var(--app-text-muted,#7a8aaa);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">🌡 Thermal</th>
            <th style="text-align:center;padding:6px 8px;border-bottom:1px solid var(--app-border,#dde3f0);white-space:nowrap;color:var(--app-text-muted,#7a8aaa);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">🔊 RT60</th>
            <th style="text-align:center;padding:6px 8px;border-bottom:1px solid var(--app-border,#dde3f0);white-space:nowrap;color:var(--app-text-muted,#7a8aaa);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">☀ DF%</th>
        </tr>`;
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        this._tableBody = tbody;
        table.appendChild(tbody);

        wrap.appendChild(table);
        this._el.appendChild(wrap);
    }

    private _bind(): void {
        window.addEventListener('pryzm-physics-updated', (e: Event) => {
            const { roomId } = (e as CustomEvent).detail ?? {};
            if (roomId) this._refreshRow(roomId);
            this._updateStatus();
        });
        window.runtime?.events?.on('pryzm-project-loaded', () => this._render()); // F.events.9
        window.runtime?.events?.on('pryzm-physics-mode-changed', (p: { mode: string }) => { // F.events.15
            const sel = this._el.querySelector('select');
            if (sel && p.mode) (sel as HTMLSelectElement).value = p.mode;
        });
    }

    // ── Render ────────────────────────────────────────────────────────────────

    private _render(): void {
        if (!this._tableBody) return;
        this._tableBody.innerHTML = '';

        const rooms = this._getRooms();
        if (rooms.length === 0) {
            this._tableBody.innerHTML = `<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--app-text-muted,#7a8aaa);">No rooms in this project.</td></tr>`;
            return;
        }

        for (const room of rooms) this._appendRow(room);
        this._updateStatus();
    }

    private _appendRow(room: any): void {
        if (!this._tableBody) return;
        const result = this._getResult(room.id);
        const tr = document.createElement('tr');
        tr.dataset.roomId = room.id;
        tr.style.cssText = 'border-bottom:1px solid var(--app-border,#f0f4f8);';
        tr.innerHTML = `
            <td style="padding:5px 8px;white-space:nowrap;font-weight:500;">${room.name ?? room.id}</td>
            <td style="padding:5px 8px;color:var(--app-text-muted,#7a8aaa);white-space:nowrap;">${room.occupancyType ?? '—'}</td>
            <td style="padding:5px 8px;text-align:center;">${result ? thermalBadge(result)  : '<span style="color:#94a3b8;font-size:10px;">–</span>'}</td>
            <td style="padding:5px 8px;text-align:center;">${result ? acousticBadge(result) : '<span style="color:#94a3b8;font-size:10px;">–</span>'}</td>
            <td style="padding:5px 8px;text-align:center;">${result ? daylightBadge(result) : '<span style="color:#94a3b8;font-size:10px;">–</span>'}</td>
        `;
        this._tableBody.appendChild(tr);
    }

    private _refreshRow(roomId: string): void {
        if (!this._tableBody) return;
        const tr = this._tableBody.querySelector(`[data-room-id="${roomId}"]`) as HTMLElement | null;
        if (!tr) {
            this._render();
            return;
        }
        const result = this._getResult(roomId);
        const cells  = tr.querySelectorAll('td');
        if (cells.length < 5) return;
        cells[2].innerHTML = result ? thermalBadge(result)  : '<span style="color:#94a3b8;font-size:10px;">–</span>';
        cells[3].innerHTML = result ? acousticBadge(result) : '<span style="color:#94a3b8;font-size:10px;">–</span>';
        cells[4].innerHTML = result ? daylightBadge(result) : '<span style="color:#94a3b8;font-size:10px;">–</span>';
    }

    private _updateStatus(): void {
        if (!this._statusEl) return;
        try {
            const total    = this._getRooms().length;
            const computed = physicsEngine.cache.size;
            this._statusEl.textContent = `${computed} of ${total} rooms computed`;
        } catch {
            this._statusEl.textContent = '';
        }
    }

    // ── Data helpers ──────────────────────────────────────────────────────────

    private _getRooms(): any[] {
        try {
            return window.roomStore?.getAll?.() ?? []; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
        } catch { return []; }
    }

    private _getResult(roomId: string): RoomPhysicsResult | null {
        try {
            return physicsEngine.cache.get(roomId) ?? null;
        } catch { return null; }
    }

    // ── CSV export ────────────────────────────────────────────────────────────

    private _exportCSV(): void {
        const rooms = this._getRooms();
        const rows  = rooms.map(room => ({
            name:      room.name ?? room.id,
            occupancy: room.occupancyType ?? '',
            result:    this._getResult(room.id) ?? {
                roomId: room.id, computedAt: 0,
                thermal: null, acoustic: null, daylight: null,
            } as RoomPhysicsResult,
        }));

        const csv  = toCSV(rows);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = 'pryzm_physics_results.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('[PhysicsPanel] CSV exported');
    }
}
