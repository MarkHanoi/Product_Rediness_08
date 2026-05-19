/**
 * CurtainGridEditor
 *
 * Widget for managing U/V grid lines on a selected curtain wall.
 * Displays the inner grid lines with their t-values and provides
 * controls to add or remove lines.
 *
 * Architecture (§05 UI Contract):
 *  - All mutations go through the legacy command manager
 *  - Never writes to stores directly
 *  - Uses cw- CSS class prefix (AppTheme.ts)
 *  - Pure display — no state stored outside the DOM
 *
 * Contract compliance:
 *  - §01 CORE §2.7: commandManager is the ONLY mutation path
 *  - §01-1.1: This class lives in the Tool/UI Layer
 *  - §03: Reads from injected curtainWallStore (deps) — falls back to the
 *    legacy `window.curtainWallStore` only as a backward-compat path. // TODO(E.curtain-wall.S): legacy curtainWallStore — replace with runtime.stores.curtainWall
 *  - §05 §3: Uses cw- prefix, no independent <style> injection
 *  - §CURTAIN-WALL-AUDIT-2026 §5.4: PropertyPanelContext DI struct accepted
 *    by buildCurtainGridEditor so the editor no longer reaches into the
 *    global window registry on every render.
 */

import { CurtainGridSystem, migrateToGridSystem } from '@pryzm/geometry-curtain-wall';

/**
 * §CURTAIN-WALL-AUDIT-2026 §5.4 — Optional DI struct. When omitted, the
 * editor falls back to the window globals (legacy code paths).
 */
export interface CurtainPropertyPanelContext {
    curtainWallStore?: any;
    curtainPanelStore?: any;
    commandManager?: any;
}

function _store(ctx?: CurtainPropertyPanelContext): any {
    return ctx?.curtainWallStore ?? window.curtainWallStore; // TODO(E.curtain-wall.S): legacy curtainWallStore — replace with runtime.stores.curtainWall
}
function resolveGrid(cwId: string, ctx?: CurtainPropertyPanelContext): CurtainGridSystem | null {
    const store = _store(ctx);
    if (!store) return null;
    const cw = store.get(cwId);
    if (!cw) return null;
    if (cw.gridSystem) return cw.gridSystem;
    // Migrate from legacy scalar spacing (backward compat)
    const [start, end] = cw.baseLine ?? [];
    if (!start || !end) return null;
    const length = typeof start.distanceTo === 'function'
        ? start.distanceTo(end)
        : Math.hypot(end.x - start.x, end.z - start.z);
    return migrateToGridSystem(length, cw.height, cw.gridXSpacing, cw.gridYSpacing);
}

/**
 * Builds the Grid System sub-section for a selected curtain wall.
 * Returns null if elementData is not a curtain wall.
 */
export function buildCurtainGridEditor(
    elementData: Record<string, any>,
    _ctx?: CurtainPropertyPanelContext,
): HTMLElement | null {
    const rawType = (elementData.elementType ?? elementData.type ?? '').toLowerCase().replace(/-/g, '');
    if (rawType !== 'curtainwall') return null;

    const cwId: string = elementData.id;
    if (!cwId) return null;

    // ── Outer wrapper ─────────────────────────────────────────────────────────
    const wrap = document.createElement('div');
    wrap.className = 'cw-grid-editor';

    // ── Title row ─────────────────────────────────────────────────────────────
    const titleRow = document.createElement('div');
    titleRow.className = 'cw-section-title-row';
    const titleEl = document.createElement('div');
    titleEl.className = 'cw-section-label';
    titleEl.textContent = 'Grid System';
    titleRow.appendChild(titleEl);
    wrap.appendChild(titleRow);

    // ── Summary line (columns × rows) ─────────────────────────────────────────
    const summaryEl = document.createElement('div');
    summaryEl.className = 'cw-grid-summary';
    wrap.appendChild(summaryEl);

    // ── Axes list ─────────────────────────────────────────────────────────────
    const axesEl = document.createElement('div');
    wrap.appendChild(axesEl);

    // ── Add-line form ─────────────────────────────────────────────────────────
    const addRow = document.createElement('div');
    addRow.className = 'cw-add-row';

    const axisSelect = document.createElement('select');
    axisSelect.className = 'cw-axis-select';
    (['u', 'v'] as const).forEach(axis => {
        const opt = document.createElement('option');
        opt.value = axis;
        opt.textContent = axis === 'u' ? 'U (horizontal)' : 'V (vertical)';
        axisSelect.appendChild(opt);
    });

    const tInput = document.createElement('input');
    tInput.type = 'number';
    tInput.className = 'cw-t-input';
    tInput.min = '0.01';
    tInput.max = '0.99';
    tInput.step = '0.01';
    tInput.value = '0.50';
    tInput.placeholder = 't (0–1)';

    const addBtn = document.createElement('button');
    addBtn.className = 'cw-add-btn';
    addBtn.textContent = '+ Add';

    addBtn.addEventListener('click', () => {
        const t = parseFloat(tInput.value);
        if (isNaN(t) || t <= 0.001 || t >= 0.999) {
            addBtn.textContent = '⚠ Invalid t';
            setTimeout(() => { addBtn.textContent = '+ Add'; }, 1500);
            return;
        }
        window.runtime?.bus?.executeCommand('curtainwall.addGridLine', {
            curtainWallId: cwId,
            axis: axisSelect.value as 'u' | 'v',
            t,
        })?.then(() => {
            renderContent();
            addBtn.textContent = '✓ Added';
            setTimeout(() => { addBtn.textContent = '+ Add'; }, 1200);
        })?.catch((e: Error) => {
            addBtn.textContent = '⚠ Failed';
            console.warn('[CurtainGridEditor] curtainwall.addGridLine failed:', e);
            setTimeout(() => { addBtn.textContent = '+ Add'; }, 1500);
        });
    });

    addRow.appendChild(axisSelect);
    addRow.appendChild(tInput);
    addRow.appendChild(addBtn);
    wrap.appendChild(addRow);

    // ── Helpers ───────────────────────────────────────────────────────────────

    function renderAxisSection(grid: CurtainGridSystem, axis: 'u' | 'v'): HTMLElement {
        const lines = axis === 'u' ? grid.uLines : grid.vLines;
        const innerLines = lines.filter(l => l.t > 0.001 && l.t < 0.999)
            .sort((a, b) => a.t - b.t);

        const section = document.createElement('div');
        section.className = 'cw-axis-section';

        const axisLabel = document.createElement('div');
        axisLabel.className = 'cw-axis-label';
        axisLabel.textContent = axis === 'u'
            ? `U-Lines — horizontal  (${innerLines.length} inner)`
            : `V-Lines — vertical  (${innerLines.length} inner)`;
        section.appendChild(axisLabel);

        if (innerLines.length === 0) {
            const note = document.createElement('div');
            note.className = 'cw-empty-note';
            note.textContent = 'No inner lines — single uniform span';
            section.appendChild(note);
            return section;
        }

        innerLines.forEach(line => {
            const row = document.createElement('div');
            row.className = 'cw-line-row';

            const tLabel = document.createElement('span');
            tLabel.className = 'cw-t-label';
            tLabel.textContent = `t = ${line.t.toFixed(3)}`;
            row.appendChild(tLabel);

            const removeBtn = document.createElement('button');
            removeBtn.className = 'cw-remove-btn';
            removeBtn.textContent = '×';
            removeBtn.title = `Remove grid line at t=${line.t.toFixed(3)}`;
            removeBtn.addEventListener('click', () => {
                window.runtime?.bus?.executeCommand('curtainwall.removeGridLine', {
                    curtainWallId: cwId,
                    gridLineId: line.id,
                    axis,
                })?.then(() => {
                    renderContent();
                })?.catch((e: Error) => {
                    console.warn('[CurtainGridEditor] curtainwall.removeGridLine failed:', e);
                });
            });
            row.appendChild(removeBtn);

            section.appendChild(row);
        });

        return section;
    }

    function renderContent(): void {
        axesEl.innerHTML = '';
        summaryEl.textContent = '';

        const grid = resolveGrid(cwId);
        if (!grid) {
            summaryEl.textContent = 'Grid data unavailable';
            return;
        }

        const uCells = Math.max(0, grid.uLines.length - 1);
        const vCells = Math.max(0, grid.vLines.length - 1);
        const uInner = grid.uLines.filter(l => l.t > 0.001 && l.t < 0.999).length;
        const vInner = grid.vLines.filter(l => l.t > 0.001 && l.t < 0.999).length;
        summaryEl.textContent = `${uCells} col × ${vCells} row  ·  ${uInner} inner U,  ${vInner} inner V`;

        axesEl.appendChild(renderAxisSection(grid, 'u'));
        axesEl.appendChild(renderAxisSection(grid, 'v'));
    }

    renderContent();

    return wrap;
}
