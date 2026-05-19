/**
 * RoomPathfinderPanel.ts
 *
 * ## MODIFICATION DECLARATION
 * Phase: B.1
 * Contract: 18-BIM30-ROOM-INTELLIGENCE-ANALYSIS.md §2.2 Feature 2
 *           07-BIM-SECURITY-CONTRACT §1 (no AI calls)
 *           05-BIM-UI-ARCHITECTURE-CONTRACT §1 (no direct store writes)
 *
 * PURPOSE:
 *   Singleton floating panel for BFS door-traversal pathfinding between rooms.
 *
 * DATA FLOW (read-only):
 *   window.roomStore.getAll()           → populate dropdowns // TODO(TASK-08)
 *   window.roomQueryService.findPath()  → PathResult
 *   window.roomBoundaryBuilder          → highlightPath() / clearHighlight()
 *
 * RULES:
 *   - No store writes anywhere in this file.
 *   - No Anthropic / fetch AI calls.
 *   - Colours resolved via RoomColourSystem.resolve() — never hardcoded per-room.
 *   - Highlight state lives only in RoomBoundaryBuilder (not persisted).
 */

import { RoomColourSystem } from '@pryzm/room-topology';

// ── Types (mirrors RoomQueryService.PathResult — no import to avoid coupling) ─

interface PathResult {
    found: boolean;
    path: string[];
    hopCount: number;
    roomNames: string[];
}

// ── Singleton references ──────────────────────────────────────────────────────

let _panel: HTMLElement | null = null;
let _fromSelect: HTMLSelectElement | null = null;
/**
 * Phase B.6-d (S73-WIRE) — module-scope runtime slot.
 * All 6 window-global reaches in this module (typed Window interface) are annotated with their
 * replacement phase (E.rooms.X / E.rooms.S / D.13).
 * Populated by `setRoomPathfinderRuntime()` (called by PropertyInspector
 * once the runtime is composed in Phase D/E).  Currently unused — the
 * window-cast fallback runs until Phase E.rooms lands.
 * TODO(E.rooms.X/S): replace window casts with _runtime.stores.rooms.*
 */
let _runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null;

/**
 * Phase B.6-d (S73-WIRE) — setter so the parent (PropertyInspector) can inject
 * the runtime after composeRuntime resolves.  Kept as a module-scope setter
 * (rather than a function parameter) because openRoomPathfinderPanel is called
 * from multiple sites that do not own the runtime handle.
 */
export function setRoomPathfinderRuntime(
    rt: import('@pryzm/runtime-composer/types').PryzmRuntime | null,
): void {
    _runtime = rt;
}
let _toSelect: HTMLSelectElement | null = null;
let _resultArea: HTMLElement | null = null;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Open the Pathfinder panel, creating it on first call.
 * Optionally pre-seeds the "From" dropdown with a known room ID.
 */
export function openRoomPathfinderPanel(preSelectFromId?: string): void {
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
export function closeRoomPathfinderPanel(): void {
    if (_panel) _panel.style.display = 'none';
    _clearHighlight();
}

/** True if the panel is currently visible. */
export function isRoomPathfinderPanelOpen(): boolean {
    return !!_panel && _panel.style.display !== 'none';
}

// ── Private ───────────────────────────────────────────────────────────────────

function _clearHighlight(): void {
    // Phase B.6-d: _runtime slot is wired but unused until E.rooms.X lands.
    // TODO(E.rooms.X): replace window cast with _runtime?.bus?.getService?.('rooms.boundaryBuilder')
    const builder = _runtime
        ? (null as any) /* TODO(E.rooms.X): _runtime.bus.getService('rooms.boundaryBuilder') */
        : window.roomBoundaryBuilder; // TODO(E.rooms.X): replace with runtime.bus.executeCommand(rooms.build) — Phase E.rooms.X
    if (builder?.clearHighlight) builder.clearHighlight();
}

function _refreshDropdowns(): void {
    if (!_fromSelect || !_toSelect) return;

    const rooms: any[] = window.roomStore?.getAll?.() ?? []; // TODO(E.rooms.S): replace with runtime.stores.rooms — Phase E.rooms.S
    const prevFrom = _fromSelect.value;
    const prevTo   = _toSelect.value;

    for (const sel of [_fromSelect, _toSelect]) {
        while (sel.firstChild) sel.removeChild(sel.firstChild);

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '— Select room —';
        sel.appendChild(placeholder);

        rooms.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.id;
            opt.textContent = r.name || `Room ${r.id.substring(0, 6)}`;
            sel.appendChild(opt);
        });
    }

    // Restore previous selections when rooms still exist
    if (rooms.some(r => r.id === prevFrom)) _fromSelect!.value = prevFrom;
    if (rooms.some(r => r.id === prevTo))   _toSelect!.value   = prevTo;
}

// ── DOM ───────────────────────────────────────────────────────────────────────

function _buildPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.id = 'room-pathfinder-panel';
    panel.style.cssText = [
        'position:fixed;top:72px;right:306px;',
        'width:272px;',
        'background:#fff;',
        'border:1px solid #dde;',
        'border-radius:10px;',
        'box-shadow:0 6px 28px rgba(63,81,181,0.13),0 1px 6px rgba(0,0,0,0.07);',
        'z-index:2100;',
        'display:none;flex-direction:column;',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
        'overflow:hidden;',
    ].join('');

    panel.appendChild(_buildHeader());

    const body = document.createElement('div');
    body.style.cssText = 'padding:10px 12px 12px;display:flex;flex-direction:column;gap:7px;';

    // From dropdown
    body.appendChild(_buildDropdownRow('From', sel => { _fromSelect = sel; }));

    // Swap button row
    const swapRow = document.createElement('div');
    swapRow.style.cssText = 'display:flex;justify-content:center;';
    const swapBtn = document.createElement('button');
    swapBtn.textContent = '⇅';
    swapBtn.title = 'Swap start and end';
    swapBtn.style.cssText = 'background:#f0f2ff;border:1px solid #c5cae9;border-radius:50%;width:26px;height:26px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;color:#3f51b5;';
    swapBtn.addEventListener('click', () => {
        if (!_fromSelect || !_toSelect) return;
        const tmp = _fromSelect.value;
        _fromSelect.value = _toSelect.value;
        _toSelect.value = tmp;
    });
    swapRow.appendChild(swapBtn);
    body.appendChild(swapRow);

    // To dropdown
    body.appendChild(_buildDropdownRow('To', sel => { _toSelect = sel; }));

    // Find Path button
    const findBtn = document.createElement('button');
    findBtn.textContent = 'Find Path';
    findBtn.style.cssText = [
        'width:100%;padding:7px 0;font-size:12px;font-weight:600;',
        'background:#3f51b5;color:#fff;border:none;border-radius:6px;cursor:pointer;',
        'letter-spacing:0.02em;transition:background 0.1s;',
    ].join('');
    findBtn.addEventListener('mouseenter', () => { findBtn.style.background = '#303f9f'; });
    findBtn.addEventListener('mouseleave', () => { findBtn.style.background = '#3f51b5'; });
    findBtn.addEventListener('click', _onFindPath);
    body.appendChild(findBtn);

    // Refresh rooms button (tiny secondary)
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
        'background:linear-gradient(135deg,#f3f4ff 0%,#f8f9ff 100%);',
        'border-bottom:1px solid #e0e4f4;',
        'cursor:grab;',
    ].join('');

    const left = document.createElement('div');
    left.style.cssText = 'display:flex;align-items:center;gap:6px;';
    const icon = document.createElement('span');
    icon.style.cssText = 'font-size:14px;';
    icon.textContent = '⬡';
    const title = document.createElement('span');
    title.style.cssText = 'font-size:12px;font-weight:700;color:#1a237e;letter-spacing:0.01em;';
    title.textContent = 'Find Path';
    left.appendChild(icon);
    left.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = 'background:none;border:none;font-size:17px;cursor:pointer;color:#9e9e9e;line-height:1;padding:0 2px;';
    closeBtn.addEventListener('click', closeRoomPathfinderPanel);

    header.appendChild(left);
    header.appendChild(closeBtn);

    // Simple drag support
    _makeDraggable(header, () => _panel!);

    return header;
}

function _buildDropdownRow(labelText: string, onCreated: (sel: HTMLSelectElement) => void): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:column;gap:3px;';

    const lbl = document.createElement('label');
    lbl.style.cssText = 'font-size:9px;font-weight:700;color:#7986cb;text-transform:uppercase;letter-spacing:0.07em;';
    lbl.textContent = labelText;

    const sel = document.createElement('select');
    sel.style.cssText = [
        'width:100%;padding:5px 8px;font-size:11px;',
        'border:1px solid #c5cae9;border-radius:5px;',
        'background:#f8f9ff;color:#222;cursor:pointer;',
        'outline:none;',
    ].join('');

    row.appendChild(lbl);
    row.appendChild(sel);
    onCreated(sel);
    return row;
}

function _onFindPath(): void {
    if (!_fromSelect || !_toSelect || !_resultArea) return;

    const fromId = _fromSelect.value;
    const toId   = _toSelect.value;

    if (!fromId || !toId) {
        _renderError('Please select both a start and end room.');
        return;
    }
    if (fromId === toId) {
        _renderError('Start and end room must be different.');
        return;
    }

    const queryService = window.roomQueryService; // TODO(E.rooms.S): replace with runtime.stores.rooms (query service) — Phase E.rooms.S
    if (!queryService?.findPath) {
        _renderError('Spatial query service is not ready yet. Try again in a moment.');
        return;
    }

    let result: PathResult;
    try {
        result = queryService.findPath(fromId, toId);
    } catch (err) {
        _renderError(`Pathfinding error: ${(err as Error).message}`);
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
        _renderError('No path found — rooms may not be connected by any door.');
        return;
    }

    // Status badge
    const statusRow = document.createElement('div');
    statusRow.style.cssText = 'display:flex;align-items:center;gap:6px;padding:5px 8px;background:#f0f4f8;border-radius:5px;border:1px solid #c8d6e5;';
    const statusIcon = document.createElement('span');
    statusIcon.style.cssText = 'font-size:12px;';
    statusIcon.textContent = '✓';
    const statusText = document.createElement('span');
    statusText.style.cssText = 'font-size:11px;color:#1b5e20;font-weight:600;';
    statusText.textContent = `Path found — ${result.path.length} room${result.path.length === 1 ? '' : 's'}, ${result.hopCount} door${result.hopCount === 1 ? '' : 's'}`;
    statusRow.appendChild(statusIcon);
    statusRow.appendChild(statusText);
    _resultArea.appendChild(statusRow);

    // Breadcrumb trail
    const crumbWrap = document.createElement('div');
    crumbWrap.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:4px 0;';

    result.path.forEach((roomId, idx) => {
        const roomStore = window.roomStore; // TODO(E.rooms.S): replace with runtime.stores.rooms — Phase E.rooms.S
        const r = roomStore?.getById?.(roomId);
        const colour = r ? RoomColourSystem.resolve(r) : '#bbb';
        const name = result.roomNames[idx] ?? `Room ${roomId.substring(0, 6)}`;

        const chip = document.createElement('button');
        chip.style.cssText = [
            'display:flex;align-items:center;gap:3px;',
            'padding:3px 8px;font-size:10px;',
            'border:1px solid #ddd;border-radius:12px;',
            'background:#fafafa;cursor:pointer;',
        ].join('');
        chip.title = `Go to ${name}`;

        const swatch = document.createElement('span');
        swatch.style.cssText = `width:7px;height:7px;border-radius:2px;flex-shrink:0;background:${colour};border:1px solid rgba(0,0,0,0.12);`;
        const nameSp = document.createElement('span');
        nameSp.style.cssText = 'color:#333;font-weight:500;';
        nameSp.textContent = name;

        chip.appendChild(swatch);
        chip.appendChild(nameSp);

        chip.addEventListener('click', () => {
            const sm = window.selectionManager; // TODO(D.13): replace with runtime.picking.select — Phase D.13
            if (sm?.selectById) sm.selectById(roomId);
        });

        crumbWrap.appendChild(chip);

        if (idx < result.path.length - 1) {
            const arrow = document.createElement('span');
            arrow.style.cssText = 'font-size:11px;color:#aaa;user-select:none;';
            arrow.textContent = '→';
            crumbWrap.appendChild(arrow);
        }
    });

    _resultArea.appendChild(crumbWrap);

    // Action buttons: Highlight in viewport | Clear
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:6px;';

    const highlightBtn = document.createElement('button');
    highlightBtn.textContent = '◈  Highlight';
    highlightBtn.style.cssText = [
        'flex:1;padding:6px 0;font-size:11px;font-weight:600;',
        'background:#ff9800;color:#fff;border:none;border-radius:5px;cursor:pointer;',
    ].join('');
    highlightBtn.addEventListener('click', () => {
        const builder = window.roomBoundaryBuilder; // TODO(E.rooms.X): replace with runtime.bus.executeCommand(rooms.build) — Phase E.rooms.X
        if (builder?.highlightPath) {
            builder.highlightPath(result.path);
            highlightBtn.textContent = '◈  Highlighted';
            highlightBtn.style.background = '#e65100';
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
        highlightBtn.textContent = '◈  Highlight';
        highlightBtn.style.background = '#ff9800';
    });

    btnRow.appendChild(highlightBtn);
    btnRow.appendChild(clearBtn);
    _resultArea.appendChild(btnRow);
}

// ── Drag helper ───────────────────────────────────────────────────────────────

function _makeDraggable(handle: HTMLElement, getPanelFn: () => HTMLElement): void {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startRight = 0;
    let startTop = 0;

    handle.addEventListener('mousedown', (e: MouseEvent) => {
        const panel = getPanelFn();
        const rect = panel.getBoundingClientRect();
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startRight = window.innerWidth - rect.right;
        startTop = rect.top;
        handle.style.cursor = 'grabbing';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
        if (!dragging) return;
        const panel = getPanelFn();
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        panel.style.right = `${startRight - dx}px`;
        panel.style.top   = `${startTop  + dy}px`;
    });

    document.addEventListener('mouseup', () => {
        dragging = false;
        handle.style.cursor = 'grab';
    });
}
