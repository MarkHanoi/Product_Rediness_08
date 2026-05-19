/**
 * EvacuationSimulatorPanel.ts
 *
 * ## MODIFICATION DECLARATION
 * Phase:     C — Feature 9 (Evacuation Simulation)
 * Contract:  18-BIM30-ROOM-INTELLIGENCE-ANALYSIS.md §2.9
 *            05-BIM-UI-ARCHITECTURE-CONTRACT §1 (no store writes from UI)
 *            07-BIM-SECURITY-CONTRACT §1 (no Anthropic calls)
 *
 * PURPOSE:
 *   Singleton floating panel for accessible evacuation pathfinding.
 *   Uses RoomQueryService.findAccessiblePath() — BFS that only traverses
 *   doors with doorWidth >= 0.775 m (Part M / ADA compliant).
 *
 * DATA FLOW (read-only):
 *   window.roomStore.getAll()                            → populate dropdowns // TODO(TASK-08)
 *   window.roomQueryService.findAccessiblePath()         → PathResult
 *   window.roomBoundaryBuilder.highlightPath()           → 3D highlight
 *   window.selectionManager.selectById()                 → room selection
 *   RoomColourSystem.resolve(room)                       → node colours
 *
 * RULES:
 *   - No store writes anywhere.
 *   - No THREE.js imports.
 *   - No Anthropic / fetch AI calls.
 *   - All reads via window.* at call time.
 */

import { RoomColourSystem } from '@pryzm/room-topology';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PathResult {
    found: boolean;
    path: string[];
    hopCount: number;
    roomNames: string[];
    /** Only present when using findAccessiblePath */
    inaccessibleCount?: number;
}

// ── Singleton state ───────────────────────────────────────────────────────────

let _panel:      HTMLElement      | null = null;
let _fromSelect: HTMLSelectElement | null = null;
let _toSelect:   HTMLSelectElement | null = null;
let _resultArea: HTMLElement      | null = null;

/**
 * Phase B.37 (S73-WIRE) — module-load singleton runtime injection.
 * Per the established pattern (PanelManager / UiPreferences /
 * gridDrawingHUD / dataCommandCenter / syncStateDetailDrawer / IntentPrompt).
 * Consumed once `runtime.rooms.queryService` lands in C.x — the legacy
 * `window.roomQueryService` reads in this file then route through
 * `_runtime.rooms.queryService.findAccessiblePath(...)`.
 */
let _runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null;
export function wireRuntime(rt: import('@pryzm/runtime-composer/types').PryzmRuntime | null): void {
    _runtime = rt;
}
/** Phase B.37 — exposed accessor so future C-phase consumers can read the
 * captured runtime without circular imports.  Also keeps `_runtime` referenced
 * for tsc's `noUnusedLocals` until the legacy window-cast paths migrate. */
export function getRuntime(): import('@pryzm/runtime-composer/types').PryzmRuntime | null {
    return _runtime;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Open the Evacuation Simulator panel.
 * Optionally pre-seeds the "Start" dropdown with a known room ID.
 */
export function openEvacuationSimulatorPanel(preSelectFromId?: string, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime openEvacuationSimulatorPanel */): void {
    if (runtime) _runtime = runtime; /* B-runtime-capture openEvacuationSimulatorPanel — TODO(C.x): once runtime.rooms.queryService is wired, replace _refreshDropdowns / pathfinding window reads with _runtime.rooms.queryService */
    if (!_panel) {
        _panel = _buildPanel();
        document.body.appendChild(_panel);
    }
    _panel.style.display = 'flex';
    _refreshDropdowns();

    if (preSelectFromId && _fromSelect) {
        _fromSelect.value = preSelectFromId;
    }
}

/** Hide the panel and clear any active path highlight. */
export function closeEvacuationSimulatorPanel(): void {
    if (_panel) _panel.style.display = 'none';
    _clearHighlight();
}

/** True if the panel is currently visible. */
export function isEvacuationSimulatorPanelOpen(): boolean {
    return !!_panel && _panel.style.display !== 'none';
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _clearHighlight(): void {
    const builder = window.roomBoundaryBuilder; // TODO(E.18-R): legacy roomBoundaryBuilder — replace with runtime.rooms.boundaryBuilder
    if (builder?.clearHighlight) builder.clearHighlight();
}

function _refreshDropdowns(): void {
    if (!_fromSelect || !_toSelect) return;

    const rooms: any[] = window.roomStore?.getAll?.() ?? []; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
    const prevFrom = _fromSelect.value;
    const prevTo   = _toSelect.value;

    for (const sel of [_fromSelect, _toSelect]) {
        while (sel.firstChild) sel.removeChild(sel.firstChild);

        const ph = document.createElement('option');
        ph.value = '';
        ph.textContent = '— Select room —';
        sel.appendChild(ph);

        rooms.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.id;
            opt.textContent = r.name || `Room ${r.id.substring(0, 6)}`;
            sel.appendChild(opt);
        });
    }

    if (rooms.some(r => r.id === prevFrom)) _fromSelect!.value = prevFrom;
    if (rooms.some(r => r.id === prevTo))   _toSelect!.value   = prevTo;
}

// ── DOM builder ───────────────────────────────────────────────────────────────

function _buildPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.id = 'evacuation-simulator-panel';
    panel.style.cssText = [
        'position:fixed;top:72px;right:306px;',
        'width:282px;',
        'background:#fff;',
        'border:1px solid #dde;',
        'border-radius:10px;',
        'box-shadow:0 6px 28px rgba(239,83,80,0.12),0 1px 6px rgba(0,0,0,0.07);',
        'z-index:2100;',
        'display:none;flex-direction:column;',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
        'overflow:hidden;',
    ].join('');

    panel.appendChild(_buildHeader());

    const body = document.createElement('div');
    body.style.cssText = 'padding:10px 12px 12px;display:flex;flex-direction:column;gap:7px;';

    // Info chip
    const info = document.createElement('div');
    info.style.cssText = 'font-size:10px;color:#b71c1c;background:#fff5f5;border:1px solid #ffcdd2;border-radius:5px;padding:5px 7px;line-height:1.4;';
    info.textContent = 'Finds the shortest accessible route — only doors ≥ 0.775 m wide (Part M / ADA) are used.';
    body.appendChild(info);

    // Start dropdown
    body.appendChild(_buildDropdownRow('Start Room', sel => { _fromSelect = sel; }));

    // Swap button
    const swapRow = document.createElement('div');
    swapRow.style.cssText = 'display:flex;justify-content:center;';
    const swapBtn = document.createElement('button');
    swapBtn.textContent = '⇅';
    swapBtn.title = 'Swap start and end';
    swapBtn.style.cssText = 'background:#fff5f5;border:1px solid #ffcdd2;border-radius:50%;width:26px;height:26px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;color:#c62828;';
    swapBtn.addEventListener('click', () => {
        if (!_fromSelect || !_toSelect) return;
        const tmp = _fromSelect.value;
        _fromSelect.value = _toSelect.value;
        _toSelect.value = tmp;
    });
    swapRow.appendChild(swapBtn);
    body.appendChild(swapRow);

    // End dropdown
    body.appendChild(_buildDropdownRow('Exit / Destination Room', sel => { _toSelect = sel; }));

    // Find Route button
    const findBtn = document.createElement('button');
    findBtn.textContent = '🚨  Find Evacuation Route';
    findBtn.style.cssText = [
        'width:100%;padding:8px 0;font-size:12px;font-weight:700;',
        'background:#d32f2f;color:#fff;border:none;border-radius:6px;cursor:pointer;',
        'letter-spacing:0.02em;transition:background 0.1s;',
    ].join('');
    findBtn.addEventListener('mouseenter', () => { findBtn.style.background = '#b71c1c'; });
    findBtn.addEventListener('mouseleave', () => { findBtn.style.background = '#d32f2f'; });
    findBtn.addEventListener('click', _onFindRoute);
    body.appendChild(findBtn);

    // Refresh button
    const refreshBtn = document.createElement('button');
    refreshBtn.textContent = '↻ Refresh room list';
    refreshBtn.style.cssText = 'background:none;border:none;font-size:10px;color:#aaa;cursor:pointer;text-align:center;padding:0;';
    refreshBtn.addEventListener('click', _refreshDropdowns);
    body.appendChild(refreshBtn);

    // Result area
    _resultArea = document.createElement('div');
    _resultArea.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
    body.appendChild(_resultArea);

    panel.appendChild(body);
    return panel;
}

function _buildHeader(): HTMLElement {
    const header = document.createElement('div');
    header.style.cssText = [
        'display:flex;align-items:center;justify-content:space-between;',
        'padding:10px 12px 8px;',
        'background:linear-gradient(135deg,#fff5f5 0%,#fff8f8 100%);',
        'border-bottom:1px solid #ffcdd2;cursor:grab;',
    ].join('');

    const left = document.createElement('div');
    left.style.cssText = 'display:flex;align-items:center;gap:6px;';
    const icon = document.createElement('span');
    icon.style.cssText = 'font-size:14px;';
    icon.textContent = '🚨';
    const title = document.createElement('span');
    title.style.cssText = 'font-size:12px;font-weight:700;color:#b71c1c;letter-spacing:0.01em;';
    title.textContent = 'Evacuation Simulation';
    left.appendChild(icon);
    left.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = 'background:none;border:none;font-size:17px;cursor:pointer;color:#9e9e9e;line-height:1;padding:0 2px;';
    closeBtn.addEventListener('click', closeEvacuationSimulatorPanel);

    header.appendChild(left);
    header.appendChild(closeBtn);
    _makeDraggable(header, () => _panel!);
    return header;
}

function _buildDropdownRow(labelText: string, onCreated: (sel: HTMLSelectElement) => void): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:column;gap:3px;';

    const lbl = document.createElement('label');
    lbl.style.cssText = 'font-size:9px;font-weight:700;color:#e57373;text-transform:uppercase;letter-spacing:0.07em;';
    lbl.textContent = labelText;

    const sel = document.createElement('select');
    sel.style.cssText = [
        'width:100%;padding:5px 8px;font-size:11px;',
        'border:1px solid #ffcdd2;border-radius:5px;',
        'background:#fff8f8;color:#222;cursor:pointer;outline:none;',
    ].join('');

    row.appendChild(lbl);
    row.appendChild(sel);
    onCreated(sel);
    return row;
}

// ── Route finding ─────────────────────────────────────────────────────────────

function _onFindRoute(): void {
    if (!_fromSelect || !_toSelect || !_resultArea) return;

    const fromId = _fromSelect.value;
    const toId   = _toSelect.value;

    if (!fromId || !toId)     { _renderError('Please select both a start and exit room.');  return; }
    if (fromId === toId)      { _renderError('Start and exit room must be different.');      return; }

    const qs = window.roomQueryService; // TODO(E.18-R): legacy roomQueryService — replace with runtime.rooms.queryService
    if (!qs?.findAccessiblePath) { _renderError('Spatial service not ready. Try again shortly.'); return; }

    let result: PathResult;
    try {
        result = qs.findAccessiblePath(fromId, toId);
    } catch (err) {
        _renderError(`Route error: ${(err as Error).message}`);
        return;
    }

    _renderResult(result);
}

// ── Result renderers ──────────────────────────────────────────────────────────

function _renderError(msg: string): void {
    if (!_resultArea) return;
    _resultArea.innerHTML = '';
    const div = document.createElement('div');
    div.style.cssText = 'font-size:11px;color:#c62828;padding:7px 9px;background:#fff5f5;border-radius:5px;border:1px solid #ffcdd2;line-height:1.4;';
    div.textContent = msg;
    _resultArea.appendChild(div);
}

function _renderResult(result: PathResult): void {
    if (!_resultArea) return;
    _resultArea.innerHTML = '';

    if (!result.found || result.path.length === 0) {
        _renderError(
            'No accessible route found — all connecting doors may be narrower than 0.775 m, ' +
            'or rooms are not connected by doors.',
        );
        return;
    }

    // Time estimate: 15 s per door traversal on average
    const estimatedSec = result.hopCount * 15;
    const timeStr = estimatedSec >= 60
        ? `${Math.floor(estimatedSec / 60)}m ${estimatedSec % 60}s`
        : `${estimatedSec}s`;

    // Status badge
    const badge = document.createElement('div');
    badge.style.cssText = 'display:flex;align-items:flex-start;gap:6px;padding:6px 9px;background:#fff3e0;border-radius:6px;border:1px solid #ffcc80;';
    badge.innerHTML = `
        <span style="font-size:14px;flex-shrink:0;">✅</span>
        <div style="font-size:11px;line-height:1.5;">
            <div style="font-weight:700;color:#e65100;">Route found — ${result.path.length} room${result.path.length === 1 ? '' : 's'}, ${result.hopCount} door${result.hopCount === 1 ? '' : 's'}</div>
            <div style="color:#bf360c;">Estimated evacuation time: <strong>${timeStr}</strong></div>
        </div>`;
    _resultArea.appendChild(badge);

    // Inaccessible warning
    if ((result.inaccessibleCount ?? 0) > 0) {
        const warn = document.createElement('div');
        warn.style.cssText = 'font-size:10px;color:#b71c1c;background:#fff5f5;padding:5px 7px;border-radius:5px;border:1px solid #ffcdd2;';
        warn.textContent = `⚠️ ${result.inaccessibleCount} door(s) on this level are too narrow for accessible evacuation.`;
        _resultArea.appendChild(warn);
    }

    // Breadcrumb trail
    const crumbWrap = document.createElement('div');
    crumbWrap.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:2px 0;';

    result.path.forEach((roomId, idx) => {
        const rs = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
        const r  = rs?.getById?.(roomId);
        const colour = r ? RoomColourSystem.resolve(r) : '#bbb';
        const name   = result.roomNames[idx] ?? `Room ${roomId.substring(0, 6)}`;

        const chip = document.createElement('button');
        chip.style.cssText = [
            'display:flex;align-items:center;gap:3px;',
            'padding:3px 8px;font-size:10px;',
            'border:1px solid #ffcdd2;border-radius:12px;',
            'background:#fff8f8;cursor:pointer;',
        ].join('');
        chip.title = `Go to ${name}`;

        const swatch = document.createElement('span');
        swatch.style.cssText = `width:7px;height:7px;border-radius:2px;flex-shrink:0;background:${colour};border:1px solid rgba(0,0,0,0.12);`;
        const nameSp = document.createElement('span');
        nameSp.style.cssText = 'color:#c62828;font-weight:500;';
        nameSp.textContent = name;

        chip.appendChild(swatch);
        chip.appendChild(nameSp);
        chip.addEventListener('click', () => {
            const sm = window.selectionManager; // TODO(D.13): legacy selectionManager — replace with runtime.selection
            if (sm?.selectById) sm.selectById(roomId);
        });

        crumbWrap.appendChild(chip);
        if (idx < result.path.length - 1) {
            const arrow = document.createElement('span');
            arrow.style.cssText = 'font-size:11px;color:#e57373;user-select:none;';
            arrow.textContent = '→';
            crumbWrap.appendChild(arrow);
        }
    });
    _resultArea.appendChild(crumbWrap);

    // Action buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:6px;';

    const hlBtn = document.createElement('button');
    hlBtn.textContent = '◈  Highlight Route';
    hlBtn.style.cssText = [
        'flex:1;padding:6px 0;font-size:11px;font-weight:600;',
        'background:#d32f2f;color:#fff;border:none;border-radius:5px;cursor:pointer;',
    ].join('');
    hlBtn.addEventListener('click', () => {
        const builder = window.roomBoundaryBuilder; // TODO(E.18-R): legacy roomBoundaryBuilder — replace with runtime.rooms.boundaryBuilder
        if (builder?.highlightPath) {
            builder.highlightPath(result.path);
            hlBtn.textContent = '◈  Highlighted';
            hlBtn.style.background = '#b71c1c';
        }
    });

    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    clearBtn.style.cssText = [
        'flex:1;padding:6px 0;font-size:11px;font-weight:600;',
        'background:#f5f5f5;color:#555;border:1px solid #ddd;border-radius:5px;cursor:pointer;',
    ].join('');
    clearBtn.addEventListener('click', () => {
        _clearHighlight();
        hlBtn.textContent = '◈  Highlight Route';
        hlBtn.style.background = '#d32f2f';
    });

    btnRow.appendChild(hlBtn);
    btnRow.appendChild(clearBtn);
    _resultArea.appendChild(btnRow);
}

// ── Drag helper ───────────────────────────────────────────────────────────────

function _makeDraggable(handle: HTMLElement, getPanelFn: () => HTMLElement): void {
    let dragging = false;
    let sx = 0, sy = 0, sr = 0, st = 0;

    handle.addEventListener('mousedown', (e: MouseEvent) => {
        const p = getPanelFn();
        const rect = p.getBoundingClientRect();
        dragging = true;
        sx = e.clientX; sy = e.clientY;
        sr = window.innerWidth - rect.right; st = rect.top;
        handle.style.cursor = 'grabbing';
        e.preventDefault();
    });
    document.addEventListener('mousemove', (e: MouseEvent) => {
        if (!dragging) return;
        const p = getPanelFn();
        p.style.right = `${sr - (e.clientX - sx)}px`;
        p.style.top   = `${st + (e.clientY - sy)}px`;
    });
    document.addEventListener('mouseup', () => {
        dragging = false;
        handle.style.cursor = 'grab';
    });
}
