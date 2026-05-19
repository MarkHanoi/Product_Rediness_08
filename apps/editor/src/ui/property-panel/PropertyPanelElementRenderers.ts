/**
 * PropertyPanelElementRenderers
 *
 * Extracted from PropertyPanel.ts (WS-B S84-WIRE).
 * Full-panel renderers for element types with non-standard property layouts:
 *  - Floor-plan underlay overlays
 *  - IFC-imported (read-only) elements
 *
 * These renderers fully replace the panel container content.
 * Mutable panel state is threaded through the `ElementRenderHost` interface
 * so no `this` reference is needed.
 *
 * P4-compliant: all window.* accesses use typed Window extension declarations.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { PropertyPanelState } from './types';
import { deleteIfcImportedElement } from '@pryzm/file-format';

// ── Host interface ────────────────────────────────────────────────────────────

/**
 * Mutable panel state that the renderers need to read and/or write.
 * PropertyPanel provides this via `_asElementRenderHost()`.
 */
export interface ElementRenderHost {
    /** The panel's root DOM container (cleared + repopulated by renderers). */
    readonly container: HTMLElement;
    /** Live state bag — renderers set `selectedElementId` / `selectedElementType`. */
    readonly state: PropertyPanelState;
    /** Draft edits accumulated since last Apply — cleared on re-render. */
    readonly draft: Map<string, any>;
    /** Per-field validation errors — cleared on re-render. */
    readonly validationErrors: Map<string, string>;
    /** Sets `this.selectedObject` on the panel (write-only from here). */
    setSelectedObject(obj: THREE.Object3D): void;
    /** Injects the panel's CSS rules into the container once per render. */
    injectStyles(): void;
    /** Makes the panel visible after re-render (calls `_makeVisible`). */
    makeVisible(): void;
    /** Hides the panel (calls `this.hide()`). */
    hide(): void;
    /** Returns the panel's close button element. */
    buildCloseBtn(): HTMLElement;
}

// ── Private helpers ───────────────────────────────────────────────────────────

/** Two-column label / value read-only row — used by the underlay panel. */
function _makeReadOnlyRow(label: string, value: string): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
    const l = document.createElement('span');
    l.style.cssText = 'font:500 11px/1 system-ui;color:var(--text-muted,#888);';
    l.textContent = label;
    const v = document.createElement('span');
    v.style.cssText = 'font:400 12px/1 system-ui;color:var(--text-primary,#e0e0e0);';
    v.textContent = value;
    row.appendChild(l);
    row.appendChild(v);
    return row;
}

/**
 * Builds a collapsible section for the IFC property panel.
 * Uses native gpp-section/gpp-section-header CSS classes for visual consistency,
 * but injects its own body layout (NOT gpp-section-body, which is a 2-col grid
 * designed for native property rows — using it would crush our content to 104px).
 */
function _buildIfcSection(
    title: string,
    rows: { label: string; value: string }[],
    collapsed = false,
): HTMLElement {
    const section = document.createElement('div');
    section.className = 'gpp-section';

    const sectionHeader = document.createElement('div');
    sectionHeader.className = `gpp-section-header${collapsed ? '' : ' open'}`;

    const titleEl = document.createElement('span');
    titleEl.className = 'gpp-section-title';
    titleEl.textContent = title;

    const chevron = document.createElement('span');
    chevron.className = 'gpp-chevron';
    chevron.style.cssText = 'margin-left:auto;flex-shrink:0;transform:'
        + (collapsed ? 'rotate(0deg)' : 'rotate(90deg)')
        + ';transition:transform 0.15s;';
    chevron.textContent = '›';

    sectionHeader.appendChild(titleEl);
    sectionHeader.appendChild(chevron);

    const sectionBody = document.createElement('div');
    sectionBody.style.cssText = [
        'padding:8px 14px 10px',
        'background:#ffffff',
        'border-radius:0 0 12px 12px',
        collapsed ? 'display:none' : '',
    ].filter(Boolean).join(';');

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:minmax(90px,42%) 1fr;gap:5px 10px;align-items:start;';

    for (const { label, value } of rows) {
        const labelEl = document.createElement('div');
        labelEl.style.cssText = [
            'font-size:10px',
            'color:#6b7a99',
            'font-weight:500',
            'letter-spacing:0.02em',
            'overflow:hidden',
            'text-overflow:ellipsis',
            'white-space:nowrap',
            'padding-top:1px',
        ].join(';');
        labelEl.textContent = label;
        labelEl.title = label;

        const valueEl = document.createElement('div');
        valueEl.style.cssText = [
            'font-size:11px',
            'color:#1a2035',
            'overflow:hidden',
            'text-overflow:ellipsis',
            'white-space:nowrap',
            'font-family:var(--app-mono,monospace)',
            'background:#f4f6fb',
            'padding:1px 5px',
            'border-radius:3px',
        ].join(';');
        valueEl.textContent = value !== '' && value !== 'undefined' ? value : '—';
        valueEl.title = value;

        grid.appendChild(labelEl);
        grid.appendChild(valueEl);
    }

    sectionBody.appendChild(grid);

    sectionHeader.addEventListener('click', () => {
        const isHidden = sectionBody.style.display === 'none';
        sectionBody.style.display = isHidden ? '' : 'none';
        sectionHeader.classList.toggle('open', isHidden);
        chevron.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
    });

    section.appendChild(sectionHeader);
    section.appendChild(sectionBody);
    return section;
}

// ── Public renderers ──────────────────────────────────────────────────────────

/**
 * Full-panel renderer for a floor-plan underlay (imported raster overlay).
 * Populates host.container with header + body and calls host.makeVisible().
 */
export function _renderUnderlayPanel(
    host: ElementRenderHost,
    obj: THREE.Object3D,
): void {
    host.setSelectedObject(obj);
    host.state.selectedElementId   = obj.userData?.id ?? '';
    host.state.selectedElementType = 'floor_plan_underlay';
    host.draft.clear();
    host.validationErrors.clear();

    host.container.innerHTML = '';
    host.injectStyles();

    const ud = obj.userData as {
        type: string; pxPerMeter: number;
        widthPx: number; heightPx: number;
        planWidthMeters: number; planHeightMeters: number;
    };

    // ── Header ──────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.style.cssText = [
        'display:flex', 'align-items:center', 'gap:8px',
        'padding:10px 12px 8px',
        'border-bottom:1px solid var(--border-muted,#2a2a2a)',
    ].join(';');

    const badge = document.createElement('span');
    badge.style.cssText = [
        'background:linear-gradient(135deg,#8B5CF6,#6600FF)',
        'color:#fff', 'font:600 10px/1 system-ui',
        'padding:3px 7px', 'border-radius:4px',
        'letter-spacing:0.04em', 'text-transform:uppercase',
    ].join(';');
    badge.textContent = 'Import Overlay';

    const title = document.createElement('span');
    title.style.cssText = 'flex:1;font:600 13px/1 system-ui;color:var(--text-primary,#e0e0e0);';
    const wm = ud.planWidthMeters?.toFixed(2) ?? '?';
    const hm = ud.planHeightMeters?.toFixed(2) ?? '?';
    title.textContent = `${wm} m × ${hm} m`;

    header.appendChild(badge);
    header.appendChild(title);
    host.container.appendChild(header);

    // ── Body ────────────────────────────────────────────────────────────
    const body = document.createElement('div');
    body.style.cssText = 'padding:10px 12px 14px;display:flex;flex-direction:column;gap:10px;';

    body.appendChild(_makeReadOnlyRow(
        'Scale',
        ud.pxPerMeter ? `${ud.pxPerMeter.toFixed(1)} px/m` : '—',
    ));
    body.appendChild(_makeReadOnlyRow(
        'Source',
        (ud.widthPx && ud.heightPx) ? `${ud.widthPx} × ${ud.heightPx} px` : '—',
    ));

    // Opacity slider
    const mat = (obj as THREE.Mesh).material as THREE.MeshBasicMaterial;
    const opRow = document.createElement('div');
    opRow.style.cssText = 'display:flex;flex-direction:column;gap:4px;';

    const opLabel = document.createElement('label');
    opLabel.style.cssText = 'font:500 11px/1 system-ui;color:var(--text-muted,#888);';
    opLabel.textContent = 'Opacity';

    const slider = document.createElement('input');
    slider.type  = 'range';
    slider.min   = '0';
    slider.max   = '100';
    slider.step  = '1';
    slider.value = String(Math.round((mat?.opacity ?? 0.5) * 100));
    slider.style.cssText = 'width:100%;accent-color:#8B5CF6;cursor:pointer;';

    const opValue = document.createElement('span');
    opValue.style.cssText = 'font:400 11px/1 system-ui;color:var(--text-muted,#888);';
    opValue.textContent   = `${slider.value}%`;

    slider.addEventListener('input', () => {
        const pct = parseInt(slider.value, 10);
        opValue.textContent = `${pct}%`;
        if (mat) mat.opacity = pct / 100;
    });

    opRow.appendChild(opLabel);
    opRow.appendChild(slider);
    opRow.appendChild(opValue);
    body.appendChild(opRow);

    // Reference Scale button
    const scaleBtn = document.createElement('button');
    scaleBtn.type  = 'button';
    scaleBtn.style.cssText = [
        'display:flex', 'align-items:center', 'justify-content:center', 'gap:6px',
        'width:100%', 'padding:8px 12px', 'border-radius:6px',
        'border:1px solid #8B5CF6',
        'background:rgba(139,92,246,0.12)',
        'color:#c4b5fd',
        'font:600 12px/1 system-ui',
        'cursor:pointer',
        'transition:background 0.15s',
    ].join(';');
    scaleBtn.textContent = '📐  Reference Scale (3 points)';
    scaleBtn.addEventListener('mouseenter', () => {
        scaleBtn.style.background = 'rgba(139,92,246,0.28)';
    });
    scaleBtn.addEventListener('mouseleave', () => {
        scaleBtn.style.background = 'rgba(139,92,246,0.12)';
    });
    scaleBtn.addEventListener('click', () => {
        const ut = window.floorPlanUnderlayTool ?? null; // TODO(E.floor.X): legacy floorPlanUnderlayTool — replace with runtime.tools.activate('underlay') after plugins/floor lands
        window.runtime?.events?.emit('underlay:reference-scale-activate', { underlayTool: ut }); // F.events.13
    });
    body.appendChild(scaleBtn);

    // Hint
    const hint = document.createElement('p');
    hint.style.cssText = [
        'margin:0', 'font:400 10px/1.5 system-ui',
        'color:var(--text-muted,#666)',
    ].join(';');
    hint.textContent = 'Click 3 points in scene: reference start → reference end → target. ' +
        'Scale factor = dist(1–3) ÷ dist(1–2).';
    body.appendChild(hint);

    host.container.appendChild(body);
    host.makeVisible();
}

/**
 * Renders a full native-looking property panel for a selected IFC element.
 * Reads element record from ifcModelStore (for latest pset data) with
 * userData as fallback. All fields are read-only.
 */
export function _renderIfcElement(
    host: ElementRenderHost,
    obj: THREE.Object3D,
): void {
    const ud = obj.userData;
    const expressID: number  = ud.expressID;
    const modelId: string    = ud.modelId ?? '';

    // Look up element record from store (may be fresher than userData)
    const store: any = window.ifcModelStore; // TODO(E.ifc.S): legacy ifcModelStore — replace with runtime.stores.ifcModel
    const model  = store?.getModel?.(modelId);
    const record = model?.elements?.find((e: any) => e.expressID === expressID);

    const elementName  = record?.name       ?? ud.name       ?? `Element ${expressID}`;
    const ifcTypeName  = record?.ifcTypeName ?? ud.ifcTypeName ?? ud.type ?? 'Element';
    const rawIfcType   = record?.rawIfcType  ?? ud.rawIfcType  ?? ifcTypeName.toUpperCase();
    const storeyName   = record?.storeyName  ?? ud.storeyName  ?? '—';
    const psets: Record<string, Record<string, string | number | boolean>> =
        record?.psets ?? ud.psets ?? {};
    const elementId    = ud.id ?? `ifc-${expressID}`;

    host.setSelectedObject(obj as any);
    host.state.selectedElementId   = elementId;
    host.state.selectedElementType = 'ifc-element' as any;
    host.draft.clear();
    host.validationErrors.clear();

    host.container.innerHTML = '';
    host.injectStyles();

    // ── Header ────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'gpp-header';

    const typeBadge = document.createElement('div');
    typeBadge.className = 'gpp-type-badge';
    typeBadge.textContent = `${ifcTypeName.toUpperCase()} · IFC`;
    header.appendChild(typeBadge);

    const nameRow = document.createElement('div');
    nameRow.style.cssText = 'display:flex;align-items:center;gap:6px;';
    const nameInput = document.createElement('input');
    nameInput.className = 'gpp-mark-input';
    nameInput.value     = elementName;
    nameInput.readOnly  = true;
    nameInput.style.cssText += ';cursor:default;opacity:0.85;';
    nameInput.placeholder = 'Name';
    nameRow.appendChild(nameInput);
    header.appendChild(nameRow);

    const idRow = document.createElement('div');
    idRow.className = 'gpp-id-row';
    const idSpan = document.createElement('span');
    idSpan.textContent = elementId.length > 20 ? elementId.substring(0, 20) + '…' : elementId;
    idSpan.title = elementId;
    const copyBtn = document.createElement('button');
    copyBtn.className   = 'gpp-id-copy';
    copyBtn.textContent = 'Copy ID';
    copyBtn.addEventListener('click', () => {
        navigator.clipboard?.writeText(elementId).catch(() => {});
        copyBtn.textContent = '✓ Copied';
        setTimeout(() => { copyBtn.textContent = 'Copy ID'; }, 1500);
    });
    idRow.appendChild(idSpan);
    idRow.appendChild(copyBtn);
    header.appendChild(idRow);

    if (storeyName && storeyName !== '—') {
        const spatialSummary = document.createElement('div');
        spatialSummary.className = 'gpp-spatial-summary';
        spatialSummary.textContent = `Level: ${storeyName}`;
        header.appendChild(spatialSummary);
    }

    const readOnlyBadge = document.createElement('div');
    readOnlyBadge.style.cssText = [
        'font-size:10px', 'color:rgba(255,255,255,0.55)',
        'margin-top:4px', 'padding:2px 8px',
        'background:rgba(102,0,255,0.18)', 'border-radius:4px',
        'display:inline-flex', 'align-items:center', 'gap:5px',
        'width:fit-content', 'border:1px solid rgba(102,0,255,0.3)',
    ].join(';');
    readOnlyBadge.innerHTML =
        `<span style="width:6px;height:6px;border-radius:50%;background:#6600FF;display:inline-block;flex-shrink:0;"></span>Imported · Read-only`;
    header.appendChild(readOnlyBadge);

    header.appendChild(host.buildCloseBtn());
    host.container.appendChild(header);

    // ── Body ──────────────────────────────────────────────────────────────
    const body = document.createElement('div');
    body.className = 'gpp-body';
    body.style.cssText = 'padding:8px 12px 12px;overflow-y:auto;';

    // Identity section
    body.appendChild(_buildIfcSection('Identity', [
        { label: 'Express ID', value: String(expressID) },
        { label: 'IFC Type',   value: rawIfcType },
        { label: 'Level',      value: storeyName },
        { label: 'Element ID', value: elementId },
    ], false));

    // Property set sections — one per pset
    const psetNames = Object.keys(psets).sort();
    if (psetNames.length > 0) {
        for (const psetName of psetNames) {
            const props = psets[psetName];
            const rows = Object.entries(props).map(([k, v]) => ({ label: k, value: String(v) }));
            if (rows.length === 0) continue;
            // Collapse PRYZM-specific psets by default to reduce noise
            const collapsed = psetName.startsWith('Pset_PRYZM_') || psetName.startsWith('EPset_');
            body.appendChild(_buildIfcSection(psetName, rows, collapsed));
        }
    } else {
        const noProps = document.createElement('div');
        noProps.style.cssText = 'font-size:11px;color:#9aabcc;padding:12px 0;font-style:italic;text-align:center;';
        noProps.textContent = 'No property sets found for this element.';
        body.appendChild(noProps);
    }

    // Action footer — Hide/Show + Delete
    const footer = document.createElement('div');
    footer.className = 'gpp-actions';

    let meshVisible = true;
    const hideBtn = document.createElement('button');
    hideBtn.className   = 'gpp-action-btn';
    hideBtn.textContent = 'Hide';
    hideBtn.addEventListener('click', () => {
        meshVisible = !meshVisible;
        obj.visible = meshVisible;
        hideBtn.textContent = meshVisible ? 'Hide' : 'Show';
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className   = 'gpp-action-btn danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', async () => {
        const deleted = await deleteIfcImportedElement(obj, {
            selectionManager: window.selectionManager, // TODO(D.13): legacy selectionManager — replace with runtime.selection
        });
        if (deleted) host.hide();
    });

    footer.appendChild(hideBtn);
    footer.appendChild(deleteBtn);
    body.appendChild(footer);

    host.container.appendChild(body);
    host.makeVisible();
}
