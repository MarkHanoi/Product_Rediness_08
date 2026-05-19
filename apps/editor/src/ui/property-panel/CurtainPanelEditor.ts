/**
 * CurtainPanelEditor
 *
 * Widget showing a visual grid of curtain wall panels with type badges.
 * Clicking a cell opens a small popover to change the panel type
 * via the command manager.
 *
 * Architecture (§05 UI Contract):
 *  - All mutations go through the legacy command manager
 *  - Never writes to stores directly
 *  - Uses cw- CSS class prefix (AppTheme.ts)
 *  - Reads panel data from injected curtainPanelStore (deps) — falls back
 *    to the legacy window global only as a backward-compat path.
 *
 * Contract compliance:
 *  - §01 CORE §2.7: commandManager is the ONLY mutation path
 *  - §01-1.1: This class lives in the Tool/UI Layer
 *  - §03: Reads from injected stores via DI, with window fallback
 *  - §05 §3: Uses cw- prefix, no independent <style> injection
 *  - §CURTAIN-WALL-AUDIT-2026 §5.4: PropertyPanelContext DI struct accepted
 *    so the editor no longer reaches into the global window registry on every
 *    render.
 */

import { PanelType, VALID_PANEL_TYPES } from '@pryzm/geometry-curtain-wall';
import { CurtainGridSystem, migrateToGridSystem } from '@pryzm/geometry-curtain-wall';
import { getPanelDefinition } from '@pryzm/geometry-curtain-wall';
import type { CurtainPropertyPanelContext } from './CurtainGridEditor';

// All UI metadata (label / legend colour / initial badge) comes from the
// CurtainPanelFactory registry — adding a new panel type does NOT require any
// edit to this file.
const panelBg     = (pt: PanelType): string => getPanelDefinition(pt).legendColor;
const panelLabel  = (pt: PanelType): string => getPanelDefinition(pt).label;
const panelInit   = (pt: PanelType): string => getPanelDefinition(pt).initial;

function _wallStore(ctx?: CurtainPropertyPanelContext): any {
    return ctx?.curtainWallStore ?? window.curtainWallStore; // TODO(E.curtain-wall.S): legacy curtainWallStore — replace with runtime.stores.curtainWall
}
function _panelStore(ctx?: CurtainPropertyPanelContext): any {
    return ctx?.curtainPanelStore ?? window.curtainPanelStore; // TODO(E.curtain-wall.S): legacy curtainPanelStore — replace with runtime.stores.curtainPanel
}
function resolveGrid(cwId: string, ctx?: CurtainPropertyPanelContext): CurtainGridSystem | null {
    const store = _wallStore(ctx);
    if (!store) return null;
    const cw = store.get(cwId);
    if (!cw) return null;
    if (cw.gridSystem) return cw.gridSystem;
    const [start, end] = cw.baseLine ?? [];
    if (!start || !end) return null;
    const length = typeof start.distanceTo === 'function'
        ? start.distanceTo(end)
        : Math.hypot(end.x - start.x, end.z - start.z);
    return migrateToGridSystem(length, cw.height, cw.gridXSpacing, cw.gridYSpacing);
}

function getPanelType(cwId: string, i: number, j: number, ctx?: CurtainPropertyPanelContext): PanelType {
    const panelStore = _panelStore(ctx);
    if (!panelStore) return 'SystemPanel_Glass';
    const panel = panelStore.getByCellIndex?.(cwId, i, j);
    return panel?.panelType ?? 'SystemPanel_Glass';
}

/**
 * Builds the Panel Grid sub-section for a selected curtain wall.
 * Returns null if elementData is not a curtain wall.
 */
export function buildCurtainPanelEditor(
    elementData: Record<string, any>,
    ctx?: CurtainPropertyPanelContext,
): HTMLElement | null {
    const rawType = (elementData.elementType ?? elementData.type ?? '').toLowerCase().replace(/-/g, '');
    if (rawType !== 'curtainwall') return null;

    const cwId: string = elementData.id;
    if (!cwId) return null;

    // ── Outer wrapper ─────────────────────────────────────────────────────────
    const wrap = document.createElement('div');
    wrap.className = 'cw-panel-editor';

    // ── Title row ─────────────────────────────────────────────────────────────
    const titleRow = document.createElement('div');
    titleRow.className = 'cw-section-title-row';
    const titleEl = document.createElement('div');
    titleEl.className = 'cw-section-label';
    titleEl.textContent = 'Panel Grid';
    titleRow.appendChild(titleEl);
    wrap.appendChild(titleRow);

    // ── Legend ────────────────────────────────────────────────────────────────
    const legendRow = document.createElement('div');
    legendRow.className = 'cw-legend';
    VALID_PANEL_TYPES.forEach(pt => {
        const item = document.createElement('span');
        item.className = 'cw-legend-item';
        const dot = document.createElement('span');
        dot.className = 'cw-legend-dot';
        dot.style.background = panelBg(pt);
        item.appendChild(dot);
        const lbl = document.createElement('span');
        lbl.textContent = panelLabel(pt);
        item.appendChild(lbl);
        legendRow.appendChild(item);
    });
    wrap.appendChild(legendRow);

    // ── Panel grid container ───────────────────────────────────────────────────
    const gridContainer = document.createElement('div');
    gridContainer.className = 'cw-panel-grid-container';
    wrap.appendChild(gridContainer);

    // ── Hint ──────────────────────────────────────────────────────────────────
    const hint = document.createElement('div');
    hint.className = 'cw-panel-hint';
    hint.textContent = 'Click a cell to change its type';
    wrap.appendChild(hint);

    // ── Render the visual grid ─────────────────────────────────────────────────
    function renderGrid(): void {
        gridContainer.innerHTML = '';

        const grid = resolveGrid(cwId, ctx);
        if (!grid) {
            const msg = document.createElement('div');
            msg.className = 'cw-empty-note';
            msg.textContent = 'Grid data unavailable';
            gridContainer.appendChild(msg);
            return;
        }

        const uCells = Math.max(0, grid.uLines.length - 1);
        const vCells = Math.max(0, grid.vLines.length - 1);

        if (uCells <= 0 || vCells <= 0) {
            const msg = document.createElement('div');
            msg.className = 'cw-empty-note';
            msg.textContent = 'No panels to display';
            gridContainer.appendChild(msg);
            return;
        }

        const gridEl = document.createElement('div');
        gridEl.className = 'cw-panel-grid';
        // Limit column repetition for very wide walls to avoid overflow
        const colCount = Math.min(uCells, 20);
        gridEl.style.gridTemplateColumns = `repeat(${colCount}, 1fr)`;

        // Render rows from top (j=vCells-1) to bottom (j=0) — visual top = wall top
        for (let j = vCells - 1; j >= 0; j--) {
            for (let i = 0; i < uCells; i++) {
                if (i >= 20) break; // truncate very wide walls
                const panelType = getPanelType(cwId, i, j, ctx);

                const cell = document.createElement('div');
                cell.className = 'cw-panel-cell';
                cell.style.background = panelBg(panelType);
                cell.title = `[col ${i}, row ${j}] — ${panelLabel(panelType)}\nClick to change`;

                const badge = document.createElement('span');
                badge.className = 'cw-cell-badge';
                badge.textContent = panelInit(panelType);
                cell.appendChild(badge);

                // Click opens popover type selector
                cell.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openTypeSelector(cell, i, j, panelType);
                });

                gridEl.appendChild(cell);
            }
        }

        gridContainer.appendChild(gridEl);

        // Truncation notice
        if (uCells > 20) {
            const notice = document.createElement('div');
            notice.className = 'cw-panel-hint';
            notice.style.color = 'var(--app-text-muted)';
            notice.textContent = `(Showing first 20 of ${uCells} columns)`;
            gridContainer.appendChild(notice);
        }
    }

    function openTypeSelector(
        cell: HTMLElement,
        i: number,
        j: number,
        currentType: PanelType
    ): void {
        // Remove any existing popover
        document.querySelector('.cw-type-popover')?.remove();

        const popover = document.createElement('div');
        popover.className = 'cw-type-popover';

        VALID_PANEL_TYPES.forEach(pt => {
            const btn = document.createElement('button');
            btn.className = 'cw-type-option' + (pt === currentType ? ' cw-type-option--selected' : '');

            const dot = document.createElement('span');
            dot.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:2px;background:${panelBg(pt)};margin-right:6px;border:1px solid rgba(0,0,0,0.15);flex-shrink:0;`;
            btn.appendChild(dot);
            btn.appendChild(document.createTextNode(panelLabel(pt)));

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (pt !== currentType) {
                    applyPanelType(i, j, pt);
                }
                popover.remove();
            });
            popover.appendChild(btn);
        });

        // Position the popover below the cell
        const rect = cell.getBoundingClientRect();
        popover.style.top = `${rect.bottom + window.scrollY + 4}px`;
        popover.style.left = `${rect.left + window.scrollX}px`;
        document.body.appendChild(popover);

        // Dismiss on outside click
        const dismiss = (e: MouseEvent) => {
            if (!popover.contains(e.target as Node)) {
                popover.remove();
                document.removeEventListener('click', dismiss);
            }
        };
        // Defer so this click event doesn't trigger immediate dismiss
        setTimeout(() => document.addEventListener('click', dismiss), 0);
    }

    function applyPanelType(i: number, j: number, newType: PanelType): void {
        const panelStore = _panelStore(ctx);
        if (!panelStore) {
            console.warn('[CurtainPanelEditor] curtainPanelStore not available');
            return;
        }
        const panel = panelStore.getByCellIndex?.(cwId, i, j);
        if (!panel) {
            console.warn(`[CurtainPanelEditor] No panel at cell [${i}, ${j}]`);
            return;
        }
        window.runtime?.bus?.executeCommand('curtainwall.replacePanel', {
            panelId: panel.id,
            newPanelType: newType,
        })?.then(() => {
            renderGrid();
        })?.catch((e: Error) => {
            console.warn('[CurtainPanelEditor] curtainwall.replacePanel failed:', e);
        });
    }

    renderGrid();

    return wrap;
}
