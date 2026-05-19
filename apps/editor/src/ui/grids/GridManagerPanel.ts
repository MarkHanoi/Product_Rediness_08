/**
 * GridManagerPanel — full CRUD panel for BIM structural grids.
 *
 * §05 §7.8  No bim-* elements — all native HTML.
 * §05 §4    Registered CSS prefix: gm-  (see AppTheme.ts GRID_MANAGER_STYLES).
 * §01 §2.1  All mutations go through commands only.
 * §01 §3.8  GridStore emits StoreEventBus; panel reacts via bimManager subscription.
 *
 * Per-grid row:
 *   [axis badge] [position input] [name input] [visibility toggle] [delete]
 *
 * Live SVG preview renders X/Y grid lines below the list whenever grids exist.
 */

import { BimManager, Grid } from '@pryzm/core-app-model';
import { AddGridCommand }    from '@pryzm/command-registry';
import { UpdateGridCommand } from '@pryzm/command-registry';
import { TogglePinGridCommand } from '@pryzm/command-registry';
import { RemoveGridCommand } from '@pryzm/command-registry';

interface GridManagerPanelProps {
    bimManager:        BimManager;
    gridStore:         { getAll: () => Grid[] };
    getCommandManager: () => { execute: (cmd: any) => any } | null;
    mountTarget:       HTMLElement;
}

export class GridManagerPanel {
    private readonly root: HTMLDivElement;
    private unsubscribeBim: (() => void) | null = null;
    private readonly props: GridManagerPanelProps;

    private _addAxis:     'X' | 'Y' = 'X';
    private _addPosition: number    = 0;
    private _addName:     string    = '';

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(props: GridManagerPanelProps, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this.props = props;
        this.root  = document.createElement('div');
        this.root.className = 'gm-panel';
        props.mountTarget.appendChild(this.root);
        this._render();
        this._subscribe();
    }

    // ── Public API ─────────────────────────────────────────────────────────

    dispose(): void {
        this.unsubscribeBim?.();
        this.root.remove();
    }

    // ── Private ────────────────────────────────────────────────────────────

    private _render(): void {
        const grids = this._sortedGrids();
        this.root.innerHTML = '';

        // Grid list
        const listEl = document.createElement('div');
        listEl.className = 'gm-list';

        if (grids.length === 0) {
            const empty = document.createElement('div');
            empty.className   = 'gm-empty';
            empty.textContent = 'No structural grids defined.';
            listEl.appendChild(empty);
        } else {
            grids.forEach(grid => listEl.appendChild(this._buildRow(grid)));
        }

        // SVG preview (only when grids exist)
        const previewEl = grids.length > 0 ? this._buildPreview(grids) : null;

        // Add-grid form
        const addForm = this._buildAddForm();

        this.root.appendChild(listEl);
        if (previewEl) this.root.appendChild(previewEl);
        this.root.appendChild(addForm);
    }

    // ── SVG grid preview ─────────────────────────────────────────────────

    private _buildPreview(grids: Grid[]): HTMLElement {
        const xGrids = grids.filter(g => g.axis === 'X').sort((a, b) => a.position - b.position);
        const yGrids = grids.filter(g => g.axis === 'Y').sort((a, b) => a.position - b.position);

        const W = 180, H = 130, PAD = 18;
        const plotW = W - PAD * 2;
        const plotH = H - PAD * 2;

        // Compute data bounds
        const allX = xGrids.map(g => g.position);
        const allY = yGrids.map(g => g.position);

        const xMin = allX.length ? Math.min(...allX) : 0;
        const xMax = allX.length ? Math.max(...allX) : (allX.length ? xMin : 10);
        const yMin = allY.length ? Math.min(...allY) : 0;
        const yMax = allY.length ? Math.max(...allY) : (allY.length ? yMin : 10);

        const xRange = xMax - xMin || 1;
        const yRange = yMax - yMin || 1;

        const toSvgX = (pos: number) => PAD + ((pos - xMin) / xRange) * plotW;
        const toSvgY = (pos: number) => PAD + ((pos - yMin) / yRange) * plotH;

        const NS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        svg.setAttribute('width',  String(W));
        svg.setAttribute('height', String(H));
        svg.classList.add('gm-preview-svg');

        // Background
        const bg = document.createElementNS(NS, 'rect');
        bg.setAttribute('width',  String(W));
        bg.setAttribute('height', String(H));
        bg.setAttribute('rx',     '6');
        bg.setAttribute('fill',   'rgba(240,243,255,0.85)');
        svg.appendChild(bg);

        // Plot border
        const border = document.createElementNS(NS, 'rect');
        border.setAttribute('x',       String(PAD));
        border.setAttribute('y',       String(PAD));
        border.setAttribute('width',   String(plotW));
        border.setAttribute('height',  String(plotH));
        border.setAttribute('fill',    'none');
        border.setAttribute('stroke',  'rgba(102,0,255,0.15)');
        border.setAttribute('stroke-width', '0.8');
        svg.appendChild(border);

        // X grids → vertical lines in the plan view
        xGrids.forEach(g => {
            if (!g.isVisible) return;
            const svgX = toSvgX(g.position);
            const line = document.createElementNS(NS, 'line');
            line.setAttribute('x1',           String(svgX));
            line.setAttribute('y1',           String(PAD));
            line.setAttribute('x2',           String(svgX));
            line.setAttribute('y2',           String(PAD + plotH));
            line.setAttribute('stroke',       '#6600FF');
            line.setAttribute('stroke-width', '1');
            line.setAttribute('stroke-dasharray', '3,2');
            line.setAttribute('opacity',      '0.7');
            svg.appendChild(line);

            const lbl = document.createElementNS(NS, 'text');
            lbl.setAttribute('x',            String(svgX));
            lbl.setAttribute('y',            String(PAD - 4));
            lbl.setAttribute('text-anchor',  'middle');
            lbl.setAttribute('font-size',    '7');
            lbl.setAttribute('fill',         '#6600FF');
            lbl.setAttribute('font-family',  'var(--app-font, system-ui)');
            lbl.textContent = g.name;
            svg.appendChild(lbl);
        });

        // Y grids → horizontal lines in the plan view
        yGrids.forEach(g => {
            if (!g.isVisible) return;
            const svgY = toSvgY(g.position);
            const line = document.createElementNS(NS, 'line');
            line.setAttribute('x1',           String(PAD));
            line.setAttribute('y1',           String(svgY));
            line.setAttribute('x2',           String(PAD + plotW));
            line.setAttribute('y2',           String(svgY));
            line.setAttribute('stroke',       '#9200B2');
            line.setAttribute('stroke-width', '1');
            line.setAttribute('stroke-dasharray', '3,2');
            line.setAttribute('opacity',      '0.7');
            svg.appendChild(line);

            const lbl = document.createElementNS(NS, 'text');
            lbl.setAttribute('x',            String(PAD - 3));
            lbl.setAttribute('y',            String(svgY + 3));
            lbl.setAttribute('text-anchor',  'end');
            lbl.setAttribute('font-size',    '7');
            lbl.setAttribute('fill',         '#9200B2');
            lbl.setAttribute('font-family',  'var(--app-font, system-ui)');
            lbl.textContent = g.name;
            svg.appendChild(lbl);
        });

        // Legend
        const legendY = H - 6;
        const xDot = document.createElementNS(NS, 'circle');
        xDot.setAttribute('cx', String(PAD)); xDot.setAttribute('cy', String(legendY - 2));
        xDot.setAttribute('r', '2.5'); xDot.setAttribute('fill', '#6600FF');
        svg.appendChild(xDot);
        const xLbl = document.createElementNS(NS, 'text');
        xLbl.setAttribute('x', String(PAD + 5)); xLbl.setAttribute('y', String(legendY));
        xLbl.setAttribute('font-size', '6.5'); xLbl.setAttribute('fill', '#6600FF');
        xLbl.setAttribute('font-family', 'var(--app-font, system-ui)');
        xLbl.textContent = `X (${xGrids.length})`;
        svg.appendChild(xLbl);

        const yDot = document.createElementNS(NS, 'circle');
        yDot.setAttribute('cx', String(PAD + 35)); yDot.setAttribute('cy', String(legendY - 2));
        yDot.setAttribute('r', '2.5'); yDot.setAttribute('fill', '#9200B2');
        svg.appendChild(yDot);
        const yLbl = document.createElementNS(NS, 'text');
        yLbl.setAttribute('x', String(PAD + 40)); yLbl.setAttribute('y', String(legendY));
        yLbl.setAttribute('font-size', '6.5'); yLbl.setAttribute('fill', '#9200B2');
        yLbl.setAttribute('font-family', 'var(--app-font, system-ui)');
        yLbl.textContent = `Y (${yGrids.length})`;
        svg.appendChild(yLbl);

        const wrapper = document.createElement('div');
        wrapper.className = 'gm-preview-wrap';
        wrapper.appendChild(svg);
        return wrapper;
    }

    // ── Row ───────────────────────────────────────────────────────────────

    private _buildRow(grid: Grid): HTMLElement {
        const row = document.createElement('div');
        row.className = 'gm-row';

        const axisBadge = document.createElement('span');
        axisBadge.className   = 'gm-axis-badge gm-axis-badge--' + grid.axis.toLowerCase();
        axisBadge.textContent = grid.axis;

        const posInput = document.createElement('input');
        posInput.type      = 'number';
        posInput.className = 'gm-pos-input';
        posInput.value     = grid.position.toFixed(2);
        posInput.step      = '0.1';
        posInput.title     = 'Grid position (m)';
        posInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter')   posInput.blur();
            if (e.key === 'Escape') { posInput.value = grid.position.toFixed(2); posInput.blur(); }
        });
        posInput.addEventListener('blur', () => {
            const newPos = parseFloat(posInput.value);
            if (isFinite(newPos) && newPos !== grid.position) {
                this._execute(new UpdateGridCommand({ gridId: grid.id, updates: { position: newPos } }));
            }
        });

        const nameInput = document.createElement('input');
        nameInput.type      = 'text';
        nameInput.className = 'gm-name-input';
        nameInput.value     = grid.name;
        nameInput.title     = 'Grid name (press Enter or blur to save)';
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter')   nameInput.blur();
            if (e.key === 'Escape') { nameInput.value = grid.name; nameInput.blur(); }
        });
        nameInput.addEventListener('blur', () => {
            const newName = nameInput.value.trim();
            if (newName && newName !== grid.name) {
                this._execute(new UpdateGridCommand({ gridId: grid.id, updates: { name: newName } }));
            }
        });

        const visBtn = document.createElement('button');
        visBtn.className   = 'gm-vis-btn' + (grid.isVisible ? '' : ' gm-vis-btn--hidden');
        visBtn.textContent = grid.isVisible ? '👁' : '⊘';
        visBtn.title       = grid.isVisible ? 'Hide grid line' : 'Show grid line';
        visBtn.addEventListener('click', () => {
            this._execute(new UpdateGridCommand({ gridId: grid.id, updates: { isVisible: !grid.isVisible } }));
        });

        // §40 §3.4 — Per-grid pin toggle. Pinned grids reject geometry edits
        // (axis/position/extents/mode/start..end) until unpinned.
        const pinBtn = document.createElement('button');
        const pinned = grid.isPinned === true;
        pinBtn.className   = 'gm-pin-btn' + (pinned ? ' gm-pin-btn--on' : '');
        pinBtn.textContent = pinned ? '📌' : '📍';
        pinBtn.title       = pinned
            ? 'Grid is pinned — click to unlock geometry'
            : 'Pin this grid to lock its geometry';
        pinBtn.addEventListener('click', () => {
            this._execute(new TogglePinGridCommand({ gridId: grid.id }));
        });

        const delBtn = document.createElement('button');
        delBtn.className   = 'gm-delete-btn';
        delBtn.textContent = '✕';
        delBtn.title       = `Remove grid "${grid.name}"`;
        delBtn.addEventListener('click', () => {
            this._execute(new RemoveGridCommand({ gridId: grid.id }));
        });

        row.appendChild(axisBadge);
        row.appendChild(posInput);
        row.appendChild(nameInput);
        row.appendChild(visBtn);
        row.appendChild(pinBtn);
        row.appendChild(delBtn);

        return row;
    }

    // ── Add form ──────────────────────────────────────────────────────────

    private _buildAddForm(): HTMLElement {
        const form = document.createElement('div');
        form.className = 'gm-add-form';

        const axisSelect = document.createElement('select');
        axisSelect.className = 'gm-axis-select';
        (['X', 'Y'] as const).forEach(ax => {
            const opt = document.createElement('option');
            opt.value = ax; opt.textContent = ax;
            if (ax === this._addAxis) opt.selected = true;
            axisSelect.appendChild(opt);
        });
        axisSelect.addEventListener('change', () => {
            this._addAxis = axisSelect.value as 'X' | 'Y';
        });

        const posInput = document.createElement('input');
        posInput.type      = 'number';
        posInput.className = 'gm-add-pos';
        posInput.placeholder = 'Pos (m)';
        posInput.value     = this._addPosition.toString();
        posInput.step      = '0.5';
        posInput.addEventListener('change', () => {
            this._addPosition = parseFloat(posInput.value) || 0;
        });
        posInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this._doAdd(posInput, nameInput);
        });

        const nameInput = document.createElement('input');
        nameInput.type        = 'text';
        nameInput.className   = 'gm-add-name';
        nameInput.placeholder = 'Name (optional)';
        nameInput.value       = this._addName;
        nameInput.addEventListener('change', () => { this._addName = nameInput.value; });
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this._doAdd(posInput, nameInput);
        });

        const addBtn = document.createElement('button');
        addBtn.className   = 'gm-add-btn';
        addBtn.textContent = '+ Add';
        addBtn.addEventListener('click', () => this._doAdd(posInput, nameInput));

        form.appendChild(axisSelect);
        form.appendChild(posInput);
        form.appendChild(nameInput);
        form.appendChild(addBtn);

        return form;
    }

    private _doAdd(posInput: HTMLInputElement, nameInput: HTMLInputElement): void {
        const position = parseFloat(posInput.value);
        if (!isFinite(position)) { posInput.focus(); return; }
        const orientation = this._addAxis;
        const name        = nameInput.value.trim() || undefined;
        const cmd         = new AddGridCommand({ orientation, position, name });
        const result      = this._execute(cmd);
        if (result?.success !== false) {
            this._addPosition = position + 1;
            this._addName     = '';
        }
    }

    private _execute(cmd: any): any {
        const mgr = this.props.getCommandManager();
        if (mgr) return mgr.execute(cmd);
        console.error('[GridManagerPanel] CommandManager not found');
        return null;
    }

    private _sortedGrids(): Grid[] {
        return this.props.gridStore.getAll()
            .slice()
            .sort((a, b) => {
                if (a.axis !== b.axis) return a.axis.localeCompare(b.axis);
                return a.position - b.position;
            });
    }

    private _subscribe(): void {
        this.unsubscribeBim = this.props.bimManager.subscribe((type) => {
            if (type === 'gridAdded' || type === 'gridUpdated' || type === 'gridRemoved') {
                this._render();
            }
        });

        window.addEventListener('grid-added',   () => this._render());
        window.addEventListener('grid-removed', () => this._render());
        window.addEventListener('grid-updated', () => this._render());
    }
}
