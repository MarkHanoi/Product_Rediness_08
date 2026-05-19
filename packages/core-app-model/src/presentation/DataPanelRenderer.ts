/**
 * DataPanelRenderer — Phase SC-5 (Next-Gen Sheet Composition Engine)
 * src/core/presentation/DataPanelRenderer.ts
 *
 * Renders a DataPanel entity into a DOM table element that can be placed
 * inside the sheet canvas area. Subscribes to relevant store events and
 * re-renders when data changes — no manual refresh required.
 *
 * Supported panel types:
 *   - 'schedule'       → renders a ScheduleDefinition as a data table
 *   - 'quantity-table' → renders element-count totals by type
 *   - 'metric'         → renders a single computed value
 *   - 'key-legend'     → renders VGGovernanceStore category colour swatches
 *   - 'issue-list'     → renders a placeholder (issue tracking not yet implemented)
 *
 * Contract compliance:
 *   §01 §2   — Read-only; no store writes, no Command calls
 *   §03 §1.1 — No schema mutations
 *   §05      — Creates only standard HTMLElements; sh- CSS prefix; no bim-* elements
 *   §05 §7   — No @thatopen/ui components
 *   §06      — No platform-layer imports
 *   §07      — No server routes
 *
 * Usage:
 *   const el = dataPanelRenderer.render(dataPanel, scaleFactor);
 *   dataPanelRenderer.attach(dataPanel, el);  // auto-refresh on store events
 *   dataPanelRenderer.detach(dataPanel.id);   // cleanup
 */

import type { DataPanel } from '@pryzm/core-app-model';

// ── Registry entry ─────────────────────────────────────────────────────────────

interface _Entry {
    panel:    DataPanel;
    el:       HTMLElement;
    sf:       number;
}

// ── DataPanelRenderer ──────────────────────────────────────────────────────────

class DataPanelRendererImpl {
    private _registry = new Map<string, _Entry>();

    constructor() {
        this._bindEvents();
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    /**
     * Render a DataPanel to a new HTMLElement (a positioned div containing the panel).
     * The returned element is not yet attached to the DOM.
     */
    render(panel: DataPanel, scaleFactor: number): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.className   = 'sh-data-panel';
        wrapper.dataset['panelId'] = panel.id;
        wrapper.style.cssText = `
            position: absolute;
            left:   ${panel.position.x * scaleFactor}px;
            top:    ${panel.position.y * scaleFactor}px;
            ${panel.size ? `width: ${panel.size.w * scaleFactor}px; height: ${panel.size.h * scaleFactor}px;` : ''}
            box-sizing: border-box;
            pointer-events: auto;
        `;

        const inner = this._buildInner(panel, scaleFactor);
        wrapper.appendChild(inner);
        return wrapper;
    }

    /**
     * Attach a panel to an existing element for automatic re-rendering on data events.
     * Call after appending the element to the DOM.
     */
    attach(panel: DataPanel, el: HTMLElement, scaleFactor: number): void {
        this._registry.set(panel.id, { panel, el, sf: scaleFactor });
    }

    /**
     * Detach a panel from the registry. Call when removing the panel from the DOM.
     */
    detach(panelId: string): void {
        this._registry.delete(panelId);
    }

    // ── Event binding ──────────────────────────────────────────────────────────

    private _bindEvents(): void {
        const rerender = () => {
            this._registry.forEach(({ panel, el, sf }) => {
                const inner = el.querySelector('.sh-data-panel-inner');
                if (inner) {
                    inner.replaceWith(this._buildInner(panel, sf));
                }
            });
        };

        window.addEventListener('schedule:updated', rerender);
        window.addEventListener('sd:sheet-updated', rerender);
        // Element store changes → re-compute metrics
        window.addEventListener('bim-wall-added',  rerender);
        window.addEventListener('bim-slab-added',  rerender);
        window.addEventListener('store:wall-created', rerender);
        window.addEventListener('store:slab-created', rerender);
    }

    // ── Inner content builders ─────────────────────────────────────────────────

    private _buildInner(panel: DataPanel, sf: number): HTMLElement {
        const inner = document.createElement('div');
        inner.className = 'sh-data-panel-inner';

        switch (panel.panelType) {
            case 'schedule':
            case 'quantity-table':
                inner.appendChild(this._buildScheduleTable(panel, sf));
                break;
            case 'metric':
                inner.appendChild(this._buildMetric(panel, sf));
                break;
            case 'key-legend':
                inner.appendChild(this._buildKeyLegend(panel, sf));
                break;
            case 'issue-list':
                inner.appendChild(this._buildPlaceholder('Issue List', 'Issue tracker not yet linked.', sf));
                break;
            default:
                inner.appendChild(this._buildPlaceholder(panel.panelType, 'Panel type not supported.', sf));
        }

        return inner;
    }

    private _buildScheduleTable(panel: DataPanel, sf: number): HTMLElement {
        const style  = panel.style ?? {};
        const fs     = Math.max(8, Math.round((style.fontSize ?? 9) * (sf ?? 1)));
        const hBg    = style.headerBg   ?? '#1e2130';
        const hFg    = style.headerFg   ?? '#e8eaf0';
        const altBg  = style.rowAlternateBg ?? '#f4f6fb';
        const border = style.borderColor ?? '#d0d4e0';

        const table = document.createElement('table');
        table.className = 'sh-dp-table';
        table.style.cssText = `
            border-collapse: collapse;
            width: 100%;
            font-size: ${fs}px;
            font-family: ${style.fontFamily ?? 'system-ui, sans-serif'};
        `;

        // Resolve schedule data via window.scheduleStore // TODO(TASK-07)
        const scheduleStore  = window.scheduleStore // TODO(TASK-07);
        const schedule = panel.scheduleId && scheduleStore
            ? scheduleStore.get(panel.scheduleId)
            : null;

        if (!schedule) {
            const wallStore   = window.wallStore // TODO(TASK-07);
            const slabStore   = window.slabStore // TODO(TASK-07);
            const columnStore = window.columnStore // TODO(TASK-07);
            // Fall back to element count summary
            const counts: Array<[string, number]> = [
                ['Walls',   wallStore   ? wallStore.getAll().length   : 0],
                ['Slabs',   slabStore   ? slabStore.getAll().length   : 0],
                ['Columns', columnStore ? columnStore.getAll().length : 0],
            ];

            const thead = document.createElement('thead');
            const hRow  = document.createElement('tr');
            for (const col of ['Element Type', 'Count']) {
                const th = document.createElement('th');
                th.textContent   = col;
                th.style.cssText = `background:${hBg}; color:${hFg}; padding:2px 5px; text-align:left; border:1px solid ${border};`;
                hRow.appendChild(th);
            }
            thead.appendChild(hRow);
            table.appendChild(thead);

            const tbody = document.createElement('tbody');
            counts.forEach(([label, count], i) => {
                const tr = document.createElement('tr');
                tr.style.background = i % 2 === 0 ? '#fff' : altBg;
                for (const text of [label, String(count)]) {
                    const td = document.createElement('td');
                    td.textContent   = text;
                    td.style.cssText = `padding:2px 5px; border:1px solid ${border};`;
                    tr.appendChild(td);
                }
                tbody.appendChild(tr);
            });
            table.appendChild(tbody);
            return table;
        }

        // Render schedule columns/rows
        const columns: string[] = schedule.columns ?? ['Element', 'Value'];
        const rows: string[][] = schedule.rows ?? [];

        const thead = document.createElement('thead');
        const hRow  = document.createElement('tr');
        for (const col of columns) {
            const th = document.createElement('th');
            th.textContent   = col;
            th.style.cssText = `background:${hBg}; color:${hFg}; padding:2px 5px; text-align:left; border:1px solid ${border};`;
            hRow.appendChild(th);
        }
        thead.appendChild(hRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        rows.forEach((row, i) => {
            const tr = document.createElement('tr');
            tr.style.background = i % 2 === 0 ? '#fff' : altBg;
            for (const cell of row) {
                const td = document.createElement('td');
                td.textContent   = cell;
                td.style.cssText = `padding:2px 5px; border:1px solid ${border};`;
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        return table;
    }

    private _buildMetric(panel: DataPanel, sf: number): HTMLElement {
        const container = document.createElement('div');
        container.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            padding: 8px;
            text-align: center;
        `;

        const label = document.createElement('div');
        label.textContent   = panel.query ?? 'Metric';
        label.style.cssText = `font-size:${Math.round(8 * sf)}px; color:#6b7280; margin-bottom:4px; font-family:system-ui;`;

        // Compute value from element stores
        const wallStore   = window.wallStore // TODO(TASK-07);
        const slabStore   = window.slabStore // TODO(TASK-07);
        let value = '—';
        const q = (panel.query ?? '').toLowerCase();
        if (q.includes('wall') || q.includes('walls')) {
            value = wallStore ? String(wallStore.getAll().length) : '0';
        } else if (q.includes('slab') || q.includes('floor')) {
            value = slabStore ? String(slabStore.getAll().length) : '0';
        }

        const valueEl = document.createElement('div');
        valueEl.textContent   = value;
        valueEl.style.cssText = `font-size:${Math.round(20 * sf)}px; font-weight:700; color:#1a1a2e; font-family:system-ui;`;

        container.appendChild(label);
        container.appendChild(valueEl);
        return container;
    }

    private _buildKeyLegend(_panel: DataPanel, sf: number): HTMLElement {
        const container = document.createElement('div');
        container.style.cssText = `padding:4px; font-family:system-ui; font-size:${Math.round(8 * sf)}px;`;

        const title = document.createElement('div');
        title.textContent   = 'Key Legend';
        title.style.cssText = `font-size:${Math.round(9 * sf)}px; font-weight:600; color:#1a1a2e; margin-bottom:4px;`;
        container.appendChild(title);

        // Resolve VG category colours
        const vgStore = window.vgGovernanceStore // TODO(TASK-07);
        const categories: Array<{ name: string; color: string }> = [];

        if (vgStore) {
            const template = vgStore.getActiveTemplate?.();
            if (template?.categoryStyles) {
                for (const [cat, style] of Object.entries(template.categoryStyles)) {
                    categories.push({ name: cat, color: (style as any)?.surface ?? '#aaaaaa' });
                }
            }
        }

        if (categories.length === 0) {
            // Fallback legend
            categories.push(
                { name: 'Walls',   color: '#1a1a2e' },
                { name: 'Slabs',   color: '#e4e8ef' },
                { name: 'Columns', color: '#4a5068' },
            );
        }

        for (const cat of categories) {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; align-items:center; gap:5px; margin-bottom:3px;';

            const swatch = document.createElement('div');
            swatch.style.cssText = `width:${Math.round(10 * sf)}px; height:${Math.round(10 * sf)}px; background:${cat.color}; border:0.5px solid #ccc; flex-shrink:0;`;

            const name = document.createElement('div');
            name.textContent = cat.name;
            name.style.color = '#343a40';

            row.appendChild(swatch);
            row.appendChild(name);
            container.appendChild(row);
        }

        return container;
    }

    private _buildPlaceholder(type: string, message: string, sf: number): HTMLElement {
        const container = document.createElement('div');
        container.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            padding: 6px;
            color: #6b7280;
            text-align: center;
            font-family: system-ui;
        `;

        const typeLabel = document.createElement('div');
        typeLabel.textContent   = type.toUpperCase();
        typeLabel.style.cssText = `font-size:${Math.round(9 * sf)}px; font-weight:600; margin-bottom:3px;`;

        const msg = document.createElement('div');
        msg.textContent   = message;
        msg.style.cssText = `font-size:${Math.round(7 * sf)}px; font-style:italic;`;

        container.appendChild(typeLabel);
        container.appendChild(msg);
        return container;
    }
}

// ── Singleton export ───────────────────────────────────────────────────────────

export const dataPanelRenderer = new DataPanelRendererImpl();
export type { DataPanelRendererImpl };
