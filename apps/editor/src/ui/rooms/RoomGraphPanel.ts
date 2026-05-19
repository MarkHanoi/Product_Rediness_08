/**
 * RoomGraphPanel.ts
 *
 * ## MODIFICATION DECLARATION
 * Phase:     C — Feature 8 (Room Graph View)
 * Contract:  18-BIM30-ROOM-INTELLIGENCE-ANALYSIS.md §2.8
 *            05-BIM-UI-ARCHITECTURE-CONTRACT §1 (no store writes from UI)
 *            07-BIM-SECURITY-CONTRACT §1 (no Anthropic calls)
 *
 * PURPOSE:
 *   Singleton floating panel that renders the room connectivity graph as an
 *   interactive SVG diagram. Rooms are nodes, door connections are edges.
 *   Clicking a node selects the room via SelectionManager.
 *
 * DATA FLOW (read-only):
 *   window.roomGraphService.getGraph(levelId)  → graph nodes + edges
 *   window.roomStore.getAll()                   → room data (names, occupancy) // TODO(TASK-08)
 *   window.selectionManager.selectById()        → selection (no store write)
 *   RoomColourSystem.resolve(room)              → node colours
 *
 * RULES:
 *   - No store writes anywhere.
 *   - No THREE.js imports.
 *   - No Anthropic / fetch AI calls.
 *   - Graph is read from window.roomGraphService — never from stores directly.
 */

import { RoomColourSystem } from '@pryzm/room-topology';

// ── SVG namespace ─────────────────────────────────────────────────────────────

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── Singleton state ───────────────────────────────────────────────────────────

let _panel: HTMLElement | null = null;
let _svg: SVGSVGElement | null = null;
let _activeLevelId: string | null = null;
let _titleSpan: HTMLElement | null = null;

/**
 * Phase B.37 (S73-WIRE) — module-load singleton runtime injection.
 * Per the established pattern (PanelManager / UiPreferences /
 * gridDrawingHUD / dataCommandCenter / syncStateDetailDrawer / IntentPrompt /
 * EvacuationSimulatorPanel). Consumed once `runtime.rooms.graphService`
 * lands in C.x — the legacy `window.roomGraphService` reads in
 * this file then route through `_runtime.rooms.graphService.getGraph(...)`.
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
 * Open the Room Graph Panel for the given level.
 * Creates the panel on first call; subsequent calls just show and refresh it.
 */
export function openRoomGraphPanel(levelId?: string, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime openRoomGraphPanel */): void {
    if (runtime) _runtime = runtime; /* B-runtime-capture openRoomGraphPanel — TODO(C.x): once runtime.rooms.graphService is wired, replace _resolveActiveLevel / _render window reads with _runtime.rooms.graphService */
    if (!_panel) {
        _panel = _buildPanel();
        document.body.appendChild(_panel);
        _listenForRoomEvents();
    }

    _panel.style.display = 'flex';

    // Determine the level to show
    const targetLevel = levelId ?? _resolveActiveLevel();
    _activeLevelId = targetLevel;

    _render();
}

/** Hide the panel. */
export function closeRoomGraphPanel(): void {
    if (_panel) _panel.style.display = 'none';
}

/** True if the panel is currently visible. */
export function isRoomGraphPanelOpen(): boolean {
    return !!_panel && _panel.style.display !== 'none';
}

// ── Private: Level resolution ─────────────────────────────────────────────────

function _resolveActiveLevel(): string | null {
    const levelStore = window.levelStore ?? window.bimManager?.levelStore; // TODO(D.4): legacy bimManager — replace with runtime.scene.renderer / runtime.tools
    if (levelStore?.getAll) {
        const levels: any[] = levelStore.getAll();
        if (levels.length > 0) return levels[0].id;
    }
    const rooms: any[] = window.roomStore?.getAll?.() ?? []; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
    return rooms[0]?.levelId ?? null;
}

// ── Private: Event listeners ──────────────────────────────────────────────────

function _listenForRoomEvents(): void {
    const refresh = () => { if (_panel?.style.display !== 'none') _render(); };
    window.addEventListener('bim-room-added',   refresh);
    window.addEventListener('bim-room-updated', refresh);
    window.addEventListener('bim-room-removed', refresh);
}

// ── Private: Force-directed layout ────────────────────────────────────────────

interface NodePos { id: string; x: number; y: number; vx: number; vy: number; }

function _forceLayout(
    nodeIds: string[],
    edgePairs: Array<[string, string]>,
    W: number,
    H: number,
    iterations = 160,
): Map<string, { x: number; y: number }> {
    if (nodeIds.length === 0) return new Map();

    const padding = 48;
    const positions = new Map<string, NodePos>();

    // Seed deterministically (no Math.random in render paths)
    nodeIds.forEach((id, i) => {
        const angle = (2 * Math.PI * i) / nodeIds.length;
        const rx = (W / 2 - padding) * 0.7;
        const ry = (H / 2 - padding) * 0.7;
        positions.set(id, {
            id,
            x: W / 2 + rx * Math.cos(angle),
            y: H / 2 + ry * Math.sin(angle),
            vx: 0, vy: 0,
        });
    });

    const k2 = (W * H) / Math.max(nodeIds.length, 1);
    const repulsion = k2;
    const attraction = 0.05;

    for (let iter = 0; iter < iterations; iter++) {
        const cooling = 1 - iter / iterations;

        // Repulsion between all pairs
        const ids = nodeIds;
        for (let i = 0; i < ids.length; i++) {
            const u = positions.get(ids[i])!;
            for (let j = i + 1; j < ids.length; j++) {
                const v = positions.get(ids[j])!;
                const dx = u.x - v.x;
                const dy = u.y - v.y;
                const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
                const force = repulsion / (dist * dist);
                u.vx += (dx / dist) * force;
                u.vy += (dy / dist) * force;
                v.vx -= (dx / dist) * force;
                v.vy -= (dy / dist) * force;
            }
        }

        // Attraction along edges
        for (const [a, b] of edgePairs) {
            const u = positions.get(a);
            const v = positions.get(b);
            if (!u || !v) continue;
            const dx = v.x - u.x;
            const dy = v.y - u.y;
            const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
            const force = dist * attraction;
            u.vx += (dx / dist) * force;
            u.vy += (dy / dist) * force;
            v.vx -= (dx / dist) * force;
            v.vy -= (dy / dist) * force;
        }

        // Apply velocities + clamp to bounds
        for (const node of positions.values()) {
            const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
            const maxStep = 15 * cooling + 2;
            if (speed > maxStep) {
                node.vx = (node.vx / speed) * maxStep;
                node.vy = (node.vy / speed) * maxStep;
            }
            node.x = Math.max(padding, Math.min(W - padding, node.x + node.vx));
            node.y = Math.max(padding, Math.min(H - padding, node.y + node.vy));
            node.vx *= 0.7;
            node.vy *= 0.7;
        }
    }

    const result = new Map<string, { x: number; y: number }>();
    for (const [id, pos] of positions.entries()) {
        result.set(id, { x: pos.x, y: pos.y });
    }
    return result;
}

// ── Private: SVG render ───────────────────────────────────────────────────────

function _render(): void {
    if (!_svg) return;

    // Clear SVG
    while (_svg.firstChild) _svg.removeChild(_svg.firstChild);

    const levelId = _activeLevelId ?? _resolveActiveLevel();
    if (!levelId) {
        _renderEmpty('No level found. Draw some rooms first.');
        return;
    }

    const graphService = window.roomGraphService; // TODO(E.18-R): legacy roomGraphService — replace with runtime.rooms.graphService
    const roomStore    = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
    if (!graphService || !roomStore) {
        _renderEmpty('Spatial services not ready.');
        return;
    }

    let graph: any;
    try { graph = graphService.getGraph(levelId); } catch { _renderEmpty('Graph build error.'); return; }

    if (!graph.nodes || graph.nodes.size === 0) {
        _renderEmpty('No rooms on this level yet.');
        return;
    }

    const W = _svg.clientWidth  || 380;
    const H = _svg.clientHeight || 280;

    const nodeIds: string[] = Array.from(graph.nodes.keys()) as string[];
    const edgePairs: Array<[string, string]> = [];
    for (const edge of graph.edges.values() as IterableIterator<any>) {
        edgePairs.push([edge.fromRoomId, edge.toRoomId]);
    }

    const layout = _forceLayout(nodeIds, edgePairs, W, H);

    // Update level title
    if (_titleSpan) {
        const levelStore = window.levelStore; // TODO(F.6.x): legacy levelStore — replace with runtime.viewRegistry levels
        let lvlName = levelId;
        if (levelStore?.getById) {
            const lvl = levelStore.getById(levelId);
            lvlName = lvl?.name ?? levelId;
        }
        _titleSpan.textContent = `Room Graph — ${lvlName}`;
    }

    // Draw edges first (behind nodes)
    const edgeGroup = document.createElementNS(SVG_NS, 'g');
    for (const edge of graph.edges.values() as IterableIterator<any>) {
        const aPos = layout.get(edge.fromRoomId);
        const bPos = layout.get(edge.toRoomId);
        if (!aPos || !bPos) continue;

        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', String(aPos.x));
        line.setAttribute('y1', String(aPos.y));
        line.setAttribute('x2', String(bPos.x));
        line.setAttribute('y2', String(bPos.y));
        line.setAttribute('stroke', edge.isAccessible ? '#7986cb' : '#bbb');
        line.setAttribute('stroke-width', edge.isAccessible ? '2' : '1.5');
        line.setAttribute('stroke-dasharray', edge.isAccessible ? 'none' : '4 3');
        line.setAttribute('opacity', '0.7');
        edgeGroup.appendChild(line);
    }
    _svg.appendChild(edgeGroup);

    // Draw nodes on top
    const nodeGroup = document.createElementNS(SVG_NS, 'g');
    for (const roomId of nodeIds) {
        const pos = layout.get(roomId);
        if (!pos) continue;

        const room = roomStore.getById(roomId);
        const colour = room ? RoomColourSystem.resolve(room) : '#bdbdbd';
        const label  = room?.name || `Rm ${roomId.substring(0, 5)}`;
        const node   = graph.nodes.get(roomId);
        const degree = node?.connectedRooms?.length ?? 0;
        const radius = 12 + Math.min(degree * 2, 8);

        // Circle
        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', String(pos.x));
        circle.setAttribute('cy', String(pos.y));
        circle.setAttribute('r', String(radius));
        circle.setAttribute('fill', colour);
        circle.setAttribute('stroke', '#fff');
        circle.setAttribute('stroke-width', '2');
        circle.style.cursor = 'pointer';
        circle.style.transition = 'r 0.1s';

        circle.addEventListener('mouseenter', () => {
            circle.setAttribute('r', String(radius + 3));
            circle.setAttribute('stroke', '#3f51b5');
        });
        circle.addEventListener('mouseleave', () => {
            circle.setAttribute('r', String(radius));
            circle.setAttribute('stroke', '#fff');
        });
        circle.addEventListener('click', () => {
            const sm = window.selectionManager; // TODO(D.13): legacy selectionManager — replace with runtime.selection
            if (sm?.selectById) sm.selectById(roomId);
        });

        // Text label
        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('x', String(pos.x));
        text.setAttribute('y', String(pos.y + radius + 11));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '9');
        text.setAttribute('font-family', '-apple-system,BlinkMacSystemFont,sans-serif');
        text.setAttribute('fill', '#333');
        text.setAttribute('font-weight', '500');
        text.setAttribute('pointer-events', 'none');
        // Truncate long names
        const maxChars = 12;
        text.textContent = label.length > maxChars ? label.substring(0, maxChars - 1) + '…' : label;

        nodeGroup.appendChild(circle);
        nodeGroup.appendChild(text);
    }
    _svg.appendChild(nodeGroup);

    // Legend
    _renderLegend();
}

function _renderEmpty(msg: string): void {
    if (!_svg) return;
    const text = document.createElementNS(SVG_NS, 'text');
    const W = _svg.clientWidth  || 380;
    const H = _svg.clientHeight || 280;
    text.setAttribute('x', String(W / 2));
    text.setAttribute('y', String(H / 2));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', '11');
    text.setAttribute('fill', '#aaa');
    text.setAttribute('font-family', '-apple-system,BlinkMacSystemFont,sans-serif');
    text.textContent = msg;
    _svg.appendChild(text);
}

function _renderLegend(): void {
    if (!_svg) return;
    const g = document.createElementNS(SVG_NS, 'g');

    const items = [
        { colour: '#7986cb', label: 'Accessible door', dash: false },
        { colour: '#bbb',    label: 'Narrow door',     dash: true  },
    ];
    items.forEach((item, i) => {
        const y = 10 + i * 14;
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', '8');
        line.setAttribute('y1', String(y + 5));
        line.setAttribute('x2', '24');
        line.setAttribute('y2', String(y + 5));
        line.setAttribute('stroke', item.colour);
        line.setAttribute('stroke-width', '2');
        if (item.dash) line.setAttribute('stroke-dasharray', '4 3');

        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('x', '28');
        text.setAttribute('y', String(y + 9));
        text.setAttribute('font-size', '8');
        text.setAttribute('fill', '#666');
        text.setAttribute('font-family', '-apple-system,BlinkMacSystemFont,sans-serif');
        text.textContent = item.label;

        g.appendChild(line);
        g.appendChild(text);
    });

    _svg.appendChild(g);
}

// ── Private: DOM ──────────────────────────────────────────────────────────────

function _buildPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.id = 'room-graph-panel';
    panel.style.cssText = [
        'position:fixed;top:72px;left:64px;',
        'width:420px;',
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

    // Level selector bar
    const levelBar = _buildLevelBar();
    panel.appendChild(levelBar);

    // SVG canvas
    const svgEl = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    svgEl.style.cssText = 'width:100%;height:280px;background:#f7f8fc;display:block;';
    _svg = svgEl;
    panel.appendChild(svgEl);

    // Footer
    const footer = document.createElement('div');
    footer.style.cssText = 'padding:6px 12px;font-size:9px;color:#aaa;border-top:1px solid #eee;background:#fafbff;';
    footer.textContent = 'Click a room node to select it • Solid lines = accessible doors • Dashed = narrow (<0.775 m)';
    panel.appendChild(footer);

    return panel;
}

function _buildHeader(): HTMLElement {
    const header = document.createElement('div');
    header.style.cssText = [
        'display:flex;align-items:center;justify-content:space-between;',
        'padding:10px 12px 8px;',
        'background:linear-gradient(135deg,#f3f4ff 0%,#f8f9ff 100%);',
        'border-bottom:1px solid #e0e4f4;cursor:grab;',
    ].join('');

    const left = document.createElement('div');
    left.style.cssText = 'display:flex;align-items:center;gap:7px;';

    const icon = document.createElement('span');
    icon.style.cssText = 'font-size:15px;';
    icon.textContent = '⬡';

    _titleSpan = document.createElement('span');
    _titleSpan.style.cssText = 'font-size:12px;font-weight:700;color:#1a237e;';
    _titleSpan.textContent = 'Room Graph';

    left.appendChild(icon);
    left.appendChild(_titleSpan);

    const right = document.createElement('div');
    right.style.cssText = 'display:flex;gap:6px;align-items:center;';

    const refreshBtn = document.createElement('button');
    refreshBtn.textContent = '↻';
    refreshBtn.title = 'Refresh graph';
    refreshBtn.style.cssText = 'background:none;border:1px solid #c5cae9;border-radius:4px;font-size:12px;cursor:pointer;padding:2px 6px;color:#3f51b5;';
    refreshBtn.addEventListener('click', _render);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = 'background:none;border:none;font-size:17px;cursor:pointer;color:#9e9e9e;line-height:1;padding:0 2px;';
    closeBtn.addEventListener('click', closeRoomGraphPanel);

    right.appendChild(refreshBtn);
    right.appendChild(closeBtn);
    header.appendChild(left);
    header.appendChild(right);

    _makeDraggable(header, () => _panel!);
    return header;
}

function _buildLevelBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 10px;background:#f0f2ff;border-bottom:1px solid #e0e4f4;';

    const lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:9px;font-weight:700;color:#7986cb;text-transform:uppercase;letter-spacing:0.06em;flex-shrink:0;';
    lbl.textContent = 'Level';

    const sel = document.createElement('select');
    sel.style.cssText = 'flex:1;font-size:11px;border:1px solid #c5cae9;border-radius:4px;padding:2px 6px;background:#fff;color:#222;cursor:pointer;';
    sel.addEventListener('change', () => {
        _activeLevelId = sel.value || null;
        _render();
    });

    // Populate with levels
    const populateLevels = () => {
        while (sel.firstChild) sel.removeChild(sel.firstChild);
        const levelStore = window.levelStore; // TODO(F.6.x): legacy levelStore — replace with runtime.viewRegistry levels
        const rooms: any[] = window.roomStore?.getAll?.() ?? []; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot

        // Get unique level IDs from rooms
        const levelIds = Array.from(new Set(rooms.map((r: any) => r.levelId).filter(Boolean)));

        levelIds.forEach(id => {
            const opt = document.createElement('option');
            opt.value = id;
            let name = id;
            if (levelStore?.getById) {
                const lvl = levelStore.getById(id);
                name = lvl?.name ?? id;
            }
            opt.textContent = name;
            if (id === _activeLevelId) opt.selected = true;
            sel.appendChild(opt);
        });

        if (levelIds.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = '— no rooms yet —';
            sel.appendChild(opt);
        }
    };

    populateLevels();

    window.addEventListener('bim-room-added',   populateLevels);
    window.addEventListener('bim-room-removed', populateLevels);

    bar.appendChild(lbl);
    bar.appendChild(sel);
    return bar;
}

// ── Drag helper ───────────────────────────────────────────────────────────────

function _makeDraggable(handle: HTMLElement, getPanelFn: () => HTMLElement): void {
    let dragging = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;

    handle.addEventListener('mousedown', (e: MouseEvent) => {
        const panel = getPanelFn();
        const rect  = panel.getBoundingClientRect();
        dragging = true;
        startX   = e.clientX;
        startY   = e.clientY;
        startLeft = rect.left;
        startTop  = rect.top;
        handle.style.cursor = 'grabbing';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
        if (!dragging) return;
        const panel = getPanelFn();
        panel.style.left = `${startLeft + (e.clientX - startX)}px`;
        panel.style.top  = `${startTop  + (e.clientY - startY)}px`;
    });

    document.addEventListener('mouseup', () => {
        dragging = false;
        handle.style.cursor = 'grab';
    });
}
