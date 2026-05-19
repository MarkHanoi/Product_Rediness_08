/**
 * CurtainSubElementPanel
 *
 * Renders a focused property panel for an individually selected curtain wall
 * panel or mullion sub-element.
 *
 * ## Architecture (§05 UI Contract)
 *
 * This module is invoked by PropertyPanel.showElement() when
 * window.__curtainSubElement is set — meaning the user clicked directly on a
 * panel mesh or a mullion mesh inside a curtain wall group.
 *
 * The parent curtain wall group remains the SelectionManager's selected object
 * (unchanged), so TransformControls still work on the whole wall. This panel
 * only changes *what is shown* in the property inspector.
 *
 * ## Mutation path
 *
 *   Panel type change  → ReplacePanelTypeCommand (existing, §01 §2.7)
 *   Color override     → ReplacePanelTypeCommand with materialOverride field
 *   Mullion editing    → Phase 2 (read-only in Phase 1)
 *
 * Contract compliance:
 *   §01: All mutations via the legacy command manager only.
 *   §03: Reads from curtainPanelStore only; never writes stores directly.
 *   §05: Uses cw- CSS class prefix; no independent <style> injection.
 *
 * Risk: Low — new file, zero impact on existing panels or tools.
 */

import { PanelType, VALID_PANEL_TYPES } from '@pryzm/geometry-curtain-wall';
import { CurtainSubElement } from '@pryzm/geometry-curtain-wall';
import type { CurtainPropertyPanelContext } from './CurtainGridEditor';

// §CURTAIN-WALL-AUDIT-2026 §5.4 — DI accessors with safe window fallback so
// existing call sites that pre-date the DI struct keep working.
function _panelStore(ctx?: CurtainPropertyPanelContext): any {
    return ctx?.curtainPanelStore ?? window.curtainPanelStore; // TODO(E.curtain-wall.S): legacy curtainPanelStore — replace with runtime.stores.curtainPanel
}
// All UI metadata (label / legend colour) is sourced from the
// CurtainPanelFactory registry — adding a new panel type does NOT require any
// edit to this file.
import { getPanelDefinition } from '@pryzm/geometry-curtain-wall';

const PANEL_BG = new Proxy({} as Record<PanelType, string>, {
    get: (_t, key: string) => getPanelDefinition(key as PanelType).legendColor,
});
const PANEL_LABEL = new Proxy({} as Record<PanelType, string>, {
    get: (_t, key: string) => {
        const def = getPanelDefinition(key as PanelType);
        return def.id === 'SystemPanel_Empty' ? 'Empty (void)' : def.label;
    },
});

const MULLION_AXIS_LABEL: Record<'u' | 'v', string> = {
    u: 'Vertical (U-axis)',
    v: 'Horizontal (V-axis)',
};

/** Returns a short truncated ID for display */
function shortId(id: string): string {
    return id.length > 22 ? id.slice(0, 10) + '…' + id.slice(-6) : id;
}

/**
 * Builds the close (✕) button for sub-element panel headers.
 * Hides the container (which is this.element from PropertyPanel) on click.
 * Contract: §05 — pure UI; no store writes.
 */
function makeCloseBtn(container: HTMLElement): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'gpp-close-btn';
    btn.textContent = '✕';
    btn.title = 'Close panel';
    btn.addEventListener('click', () => { container.style.display = 'none'; });
    return btn;
}

/** Row helper: label + value in 2-column grid layout */
function makeRow(label: string, value: string, mono = false): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:contents;';

    const lbl = document.createElement('div');
    lbl.className = 'gpp-prop-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    const val = document.createElement('div');
    val.className = 'gpp-prop-value-ro';
    val.textContent = value;
    if (mono) val.style.fontFamily = '"SF Mono","Fira Code",monospace';
    row.appendChild(val);

    return row;
}

/** Section card matching the existing PropertyPanel card style */
function makeCard(title: string, step: number): { card: HTMLElement; body: HTMLElement } {
    const card = document.createElement('div');
    card.className = 'gpp-section';

    const header = document.createElement('div');
    header.className = 'gpp-section-header open';

    const circle = document.createElement('div');
    circle.className = 'gpp-step-circle';
    circle.textContent = String(step);
    header.appendChild(circle);

    const titleEl = document.createElement('div');
    titleEl.className = 'gpp-section-title';
    titleEl.textContent = title;
    header.appendChild(titleEl);

    card.appendChild(header);

    const body = document.createElement('div');
    body.className = 'gpp-section-body';
    card.appendChild(body);

    return { card, body };
}

/** Chevron breadcrumb linking back to parent curtain wall info */
function makeBreadcrumb(parentCwId: string, onBack: () => void): HTMLElement {
    const crumb = document.createElement('div');
    crumb.style.cssText = `
        display:flex;align-items:center;gap:6px;
        font-size:9px;color:rgba(255,255,255,0.70);
        margin-bottom:6px;cursor:pointer;
        border:1px solid rgba(255,255,255,0.18);
        border-radius:5px;padding:3px 7px;width:fit-content;
        transition:background 0.12s;
    `;
    crumb.title = 'Click to show parent curtain wall';
    crumb.innerHTML = `<span style="font-size:10px;">←</span> Curtain Wall <span style="font-family:monospace;opacity:0.7">${parentCwId.slice(0, 8)}…</span>`;
    crumb.addEventListener('mouseenter', () => { crumb.style.background = 'rgba(255,255,255,0.12)'; });
    crumb.addEventListener('mouseleave', () => { crumb.style.background = 'transparent'; });
    crumb.addEventListener('click', onBack);
    return crumb;
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel Sub-Element Renderer
// ─────────────────────────────────────────────────────────────────────────────

function buildPanelSubPanel(
    subEl: Extract<CurtainSubElement, { type: 'panel' }>,
    container: HTMLElement,
    onShowParent: () => void,
    ctx?: CurtainPropertyPanelContext,
): void {
    const panelData = subEl.panelData
        ?? _panelStore(ctx)?.get?.(subEl.id);

    const currentType: PanelType = (panelData?.panelType ?? subEl.panelType ?? 'SystemPanel_Glass') as PanelType;
    const cellIndex = panelData?.cellIndex ?? subEl.cellIndex;
    const mark = panelData?.properties?.mark ?? `Panel [${cellIndex?.[0] ?? '?'}, ${cellIndex?.[1] ?? '?'}]`;

    // ── Header ────────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'gpp-header';

    // Breadcrumb back to parent CW
    header.appendChild(makeBreadcrumb(subEl.parentCwId, onShowParent));

    const badge = document.createElement('div');
    badge.className = 'gpp-type-badge';
    badge.textContent = 'CURTAIN PANEL';
    header.appendChild(badge);

    const markEl = document.createElement('input');
    markEl.className = 'gpp-mark-input';
    markEl.value = mark;
    markEl.readOnly = true;
    markEl.title = 'Panel mark (read-only in Phase 1)';
    header.appendChild(markEl);

    const idRow = document.createElement('div');
    idRow.className = 'gpp-id-row';
    const idSpan = document.createElement('span');
    idSpan.textContent = shortId(subEl.id);
    idSpan.title = subEl.id;
    const copyBtn = document.createElement('button');
    copyBtn.className = 'gpp-id-copy';
    copyBtn.textContent = 'Copy ID';
    copyBtn.addEventListener('click', () => {
        navigator.clipboard?.writeText(subEl.id).catch(() => {});
        copyBtn.textContent = '✓ Copied';
        setTimeout(() => { copyBtn.textContent = 'Copy ID'; }, 1500);
    });
    idRow.appendChild(idSpan);
    idRow.appendChild(copyBtn);
    header.appendChild(idRow);

    header.appendChild(makeCloseBtn(container));
    container.appendChild(header);

    // ── Body ──────────────────────────────────────────────────────────────────
    const body = document.createElement('div');
    body.className = 'gpp-body';

    // Section 1: Identity
    const { card: idCard, body: idBody } = makeCard('Identity', 1);
    idBody.appendChild(makeRow('Element ID', shortId(subEl.id), true));
    idBody.appendChild(makeRow('Type', 'Curtain Panel'));
    if (cellIndex) {
        idBody.appendChild(makeRow('Grid Cell', `[col ${cellIndex[0]}, row ${cellIndex[1]}]`));
    }
    idBody.appendChild(makeRow('Parent Wall', shortId(subEl.parentCwId), true));
    body.appendChild(idCard);

    // Section 2: Panel Type (editable)
    const { card: typeCard, body: typeBody } = makeCard('Panel Type', 2);

    // Current type swatch
    const swatchRow = document.createElement('div');
    swatchRow.style.cssText = 'grid-column: 1 / -1; display:flex; gap:8px; align-items:center; margin-bottom:8px;';
    const swatch = document.createElement('div');
    swatch.style.cssText = `width:36px;height:36px;border-radius:6px;border:1px solid rgba(0,0,0,0.12);background:${PANEL_BG[currentType]};flex-shrink:0;`;
    const swatchLabel = document.createElement('div');
    swatchLabel.style.cssText = 'font-size:12px;font-weight:700;color:#1a2035;';
    swatchLabel.textContent = PANEL_LABEL[currentType];
    swatchRow.appendChild(swatch);
    swatchRow.appendChild(swatchLabel);
    typeBody.appendChild(swatchRow);

    // Type selector buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'grid-column: 1 / -1; display:flex; flex-direction:column; gap:6px;';

    let pendingType: PanelType = currentType;

    VALID_PANEL_TYPES.forEach(pt => {
        const btn = document.createElement('button');
        btn.style.cssText = `
            display:flex;align-items:center;gap:8px;padding:7px 10px;
            border-radius:7px;border:1.5px solid ${pt === currentType ? '#6e8efb' : '#dde3f0'};
            background:${pt === currentType ? 'rgba(110,142,251,0.08)' : '#fff'};
            cursor:pointer;font-size:10.5px;font-weight:${pt === currentType ? '700' : '500'};
            color:#1a2035;transition:all 0.12s;text-align:left;
        `;

        const dot = document.createElement('span');
        dot.style.cssText = `width:12px;height:12px;border-radius:3px;background:${PANEL_BG[pt]};border:1px solid rgba(0,0,0,0.12);flex-shrink:0;`;
        btn.appendChild(dot);
        btn.appendChild(document.createTextNode(PANEL_LABEL[pt]));

        btn.addEventListener('click', () => {
            pendingType = pt;
            // Update visual selection
            typeBody.querySelectorAll<HTMLButtonElement>('[data-ptbtn]').forEach(b => {
                const bPt = b.dataset.ptbtn as PanelType;
                b.style.border = `1.5px solid ${bPt === pt ? '#6e8efb' : '#dde3f0'}`;
                b.style.background = bPt === pt ? 'rgba(110,142,251,0.08)' : '#fff';
                b.style.fontWeight = bPt === pt ? '700' : '500';
            });
        });
        btn.dataset.ptbtn = pt;
        btnRow.appendChild(btn);
    });

    typeBody.appendChild(btnRow);
    body.appendChild(typeCard);

    // Section 3: Material Override (color)
    const { card: matCard, body: matBody } = makeCard('Material Override', 3);

    const colorNote = document.createElement('div');
    colorNote.style.cssText = 'grid-column:1/-1;font-size:9.5px;color:#7a8aaa;margin-bottom:4px;';
    colorNote.textContent = 'Optional custom color — overrides type default.';
    matBody.appendChild(colorNote);

    const colorLabel = document.createElement('div');
    colorLabel.className = 'gpp-prop-label';
    colorLabel.textContent = 'Color';
    matBody.appendChild(colorLabel);

    const colorRow = document.createElement('div');
    colorRow.className = 'gpp-color-row';
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'gpp-color-input';
    colorInput.value = panelData?.materialOverride ?? '#88ccff';
    const colorHex = document.createElement('span');
    colorHex.className = 'gpp-color-hex';
    colorHex.textContent = colorInput.value;
    colorInput.addEventListener('input', () => { colorHex.textContent = colorInput.value; });

    const clearColorBtn = document.createElement('button');
    clearColorBtn.style.cssText = `
        font-size:9px;padding:2px 7px;border-radius:4px;border:1px solid #dde3f0;
        background:#f0f4ff;color:#1a2035;cursor:pointer;margin-left:4px;
    `;
    clearColorBtn.textContent = 'Clear';
    clearColorBtn.title = 'Remove color override (use type default)';
    clearColorBtn.addEventListener('click', () => {
        colorInput.value = '#88ccff';
        colorHex.textContent = '#88ccff';
    });

    colorRow.appendChild(colorInput);
    colorRow.appendChild(colorHex);
    colorRow.appendChild(clearColorBtn);
    matBody.appendChild(colorRow);
    body.appendChild(matCard);

    // ── Apply button ──────────────────────────────────────────────────────────
    const applyBtn = document.createElement('button');
    applyBtn.className = 'gpp-apply-btn';
    applyBtn.textContent = 'Apply Changes';
    applyBtn.addEventListener('click', () => {
        const isColorOverride = panelData?.materialOverride !== colorInput.value;
        const colorVal = (colorInput.value !== '#88ccff' || isColorOverride)
            ? colorInput.value
            : null;

        window.runtime?.bus?.executeCommand('curtainwall.replacePanel', {
            panelId: subEl.id,
            newPanelType: pendingType,
            materialOverride: colorVal,
        })?.then(() => {
            swatch.style.background = PANEL_BG[pendingType];
            swatchLabel.textContent = PANEL_LABEL[pendingType];
            applyBtn.textContent = '✓ Applied';
            setTimeout(() => { applyBtn.textContent = 'Apply Changes'; }, 1500);
        })?.catch((e: Error) => {
            console.warn('[CurtainSubElementPanel] curtainwall.replacePanel failed:', e);
            applyBtn.textContent = '✗ Failed — check console';
            setTimeout(() => { applyBtn.textContent = 'Apply Changes'; }, 2000);
        });
    });

    body.appendChild(applyBtn);

    // ── "Show parent" link at bottom ─────────────────────────────────────────
    const parentLink = document.createElement('div');
    parentLink.style.cssText = `
        text-align:center;font-size:9px;color:#7a8aaa;margin-top:10px;
        cursor:pointer;padding:6px;border-radius:6px;border:1px solid #eef1f8;
        transition:background 0.12s;
    `;
    parentLink.textContent = '← Show parent curtain wall properties';
    parentLink.addEventListener('mouseenter', () => { parentLink.style.background = '#f0f4ff'; });
    parentLink.addEventListener('mouseleave', () => { parentLink.style.background = 'transparent'; });
    parentLink.addEventListener('click', onShowParent);
    body.appendChild(parentLink);

    container.appendChild(body);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mullion Sub-Element Renderer
// ─────────────────────────────────────────────────────────────────────────────

function buildMullionSubPanel(
    subEl: Extract<CurtainSubElement, { type: 'mullion' }>,
    container: HTMLElement,
    onShowParent: () => void
): void {
    // ── Header ────────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'gpp-header';

    header.appendChild(makeBreadcrumb(subEl.parentCwId, onShowParent));

    const badge = document.createElement('div');
    badge.className = 'gpp-type-badge';
    badge.textContent = 'CURTAIN MULLION';
    header.appendChild(badge);

    const markEl = document.createElement('input');
    markEl.className = 'gpp-mark-input';
    markEl.value = MULLION_AXIS_LABEL[subEl.mullionAxis ?? 'u'];
    markEl.readOnly = true;
    header.appendChild(markEl);

    const idRow = document.createElement('div');
    idRow.className = 'gpp-id-row';
    const idSpan = document.createElement('span');
    idSpan.textContent = shortId(subEl.id);
    idSpan.title = subEl.id;
    const copyBtn = document.createElement('button');
    copyBtn.className = 'gpp-id-copy';
    copyBtn.textContent = 'Copy ID';
    copyBtn.addEventListener('click', () => {
        navigator.clipboard?.writeText(subEl.id).catch(() => {});
        copyBtn.textContent = '✓ Copied';
        setTimeout(() => { copyBtn.textContent = 'Copy ID'; }, 1500);
    });
    idRow.appendChild(idSpan);
    idRow.appendChild(copyBtn);
    header.appendChild(idRow);

    header.appendChild(makeCloseBtn(container));
    container.appendChild(header);

    // ── Body ──────────────────────────────────────────────────────────────────
    const body = document.createElement('div');
    body.className = 'gpp-body';

    // Section 1: Identity
    const { card: idCard, body: idBody } = makeCard('Identity', 1);
    idBody.appendChild(makeRow('Element ID', shortId(subEl.id), true));
    idBody.appendChild(makeRow('Type', 'Curtain Mullion'));
    idBody.appendChild(makeRow('Orientation', MULLION_AXIS_LABEL[subEl.mullionAxis ?? 'u']));
    if (subEl.mullionT !== undefined) {
        idBody.appendChild(makeRow('Position (t)', (subEl.mullionT * 100).toFixed(1) + '%'));
    }
    idBody.appendChild(makeRow('Parent Wall', shortId(subEl.parentCwId), true));
    body.appendChild(idCard);

    // Section 2: Phase 2 note
    const { card: phaseCard, body: phaseBody } = makeCard('Mullion Profile', 2);
    const note = document.createElement('div');
    note.style.cssText = 'grid-column:1/-1;font-size:9.5px;color:#7a8aaa;line-height:1.5;padding:4px 0;';
    note.innerHTML = `
        <strong style="color:#1a2035;">Mullion profile editing</strong> is planned for
        Phase 2. In Phase 2 you will be able to assign custom mullion profiles
        (T-section, rectangular, L-section) and adjust their dimensions here.<br><br>
        The mullion size for all mullions in this wall can currently be changed
        via the parent curtain wall's properties.
    `;
    phaseBody.appendChild(note);
    body.appendChild(phaseCard);

    // ── "Show parent" link at bottom ──────────────────────────────────────────
    const parentLink = document.createElement('div');
    parentLink.style.cssText = `
        text-align:center;font-size:9px;color:#7a8aaa;margin-top:10px;
        cursor:pointer;padding:6px;border-radius:6px;border:1px solid #eef1f8;
        transition:background 0.12s;
    `;
    parentLink.textContent = '← Show parent curtain wall properties';
    parentLink.addEventListener('mouseenter', () => { parentLink.style.background = '#f0f4ff'; });
    parentLink.addEventListener('mouseleave', () => { parentLink.style.background = 'transparent'; });
    parentLink.addEventListener('click', onShowParent);
    body.appendChild(parentLink);

    container.appendChild(body);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Renders the curtain sub-element panel into `container`.
 *
 * @param subEl       — the CurtainSubElement detected by SelectionManager
 * @param container   — the panel's root HTMLDivElement (will be cleared first)
 * @param onShowParent — callback to re-render the parent CW's property panel
 */
export function buildCurtainSubElementPanel(
    subEl: CurtainSubElement,
    container: HTMLElement,
    onShowParent: () => void,
    ctx?: CurtainPropertyPanelContext,
): void {
    container.innerHTML = '';

    if (subEl.type === 'panel') {
        buildPanelSubPanel(subEl as Extract<CurtainSubElement, { type: 'panel' }>, container, onShowParent, ctx);
    } else if (subEl.type === 'mullion') {
        buildMullionSubPanel(subEl as Extract<CurtainSubElement, { type: 'mullion' }>, container, onShowParent);
    }
}
