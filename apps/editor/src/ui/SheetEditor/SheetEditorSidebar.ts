/**
 * SheetEditorSidebar — all sidebar DOM-building functions for the Sheet Editor.
 *
 * Wave 7 WS-B (S85-WIRE): extracted from SheetEditorPanel.ts.
 *
 * §01 §2: All mutations via the legacy command manager.
 * §06:    No platform-layer imports.
 */

import { sheetStore } from '@pryzm/core-app-model';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import { resolveViewportScale } from '@pryzm/core-app-model';  // §SHEET-ONE-SCALE-RESOLUTION (L-10682)
import { titleBlockStore } from '@pryzm/core-app-model';
import type { SheetDefinition } from '@pryzm/core-app-model';
import type { ViewDefinition } from '@pryzm/core-app-model';
import { MoveViewportCommand } from '@pryzm/command-registry';
import { UpdateViewportScaleCommand } from '@pryzm/command-registry';
import { SetViewportCropCommand } from '@pryzm/command-registry';
import { sheetCommentStore } from '@pryzm/core-app-model';
import type { SheetComment } from '@pryzm/core-app-model';
import { VIEW_TYPE_ICONS, VIEW_DRAG_MIME } from './SheetEditorContracts';
import type { SidebarOpts } from './SheetEditorContracts';
import { buildLayoutSection, buildDataPanelSection, buildIntentSection, buildRevisionFormEl } from './SheetEditorCommands';
import DOMPurify from 'dompurify';

// ── Public: top-level sidebar builder ─────────────────────────────────────

export function buildSidebar(sheet: SheetDefinition, opts: SidebarOpts): HTMLDivElement {
    const sidebar = document.createElement('div');
    sidebar.className = 'sh-sidebar';

    sidebar.appendChild(buildSheetPropsSection(sheet, opts));
    sidebar.appendChild(buildViewportPropsSection(sheet, opts));
    sidebar.appendChild(buildLayoutSection(sheet, (key, value) => opts.updateSheetField(sheet.id, key, value)));
    sidebar.appendChild(buildDataPanelSection(sheet));
    sidebar.appendChild(buildIntentSection(sheet));
    sidebar.appendChild(buildRevisionSection(sheet, opts));
    sidebar.appendChild(buildViewPickerSection(sheet, opts));

    return sidebar;
}

// ── Sheet identity section ─────────────────────────────────────────────────

export function buildSheetPropsSection(sheet: SheetDefinition, opts: SidebarOpts): HTMLElement {
    const sec = document.createElement('div');
    sec.className = 'sh-sidebar-section';

    const title = document.createElement('div');
    title.className   = 'sh-sidebar-section-title';
    title.textContent = 'Sheet Properties';
    sec.appendChild(title);

    const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
        { value: '',                 label: '(none)'            },
        { value: 'draft',            label: 'Draft'             },
        { value: 'for-review',       label: 'For Review'        },
        { value: 'for-construction', label: 'For Construction'  },
        { value: 'issued',           label: 'Issued'            },
        { value: 'superseded',       label: 'Superseded'        },
    ];

    const TITLE_BLOCK_OPTIONS = titleBlockStore.getAll().map(t => ({ value: t.id, label: t.name }));

    const rows: Array<{
        label:   string;
        value:   string;
        key:     string;
        type?:   'text' | 'select';
        options?: Array<{ value: string; label: string }>;
    }> = [
        { label: 'Number',      value: sheet.sheetNumber,   key: 'sheetNumber'  },
        { label: 'Name',        value: sheet.name,          key: 'name'         },
        { label: 'Issue Date',  value: sheet.issueDate ?? '', key: 'issueDate'  },
        { label: 'Issued By',   value: sheet.issuedBy  ?? '', key: 'issuedBy'   },
        { label: 'Status',      value: sheet.status    ?? '', key: 'status',
          type: 'select', options: STATUS_OPTIONS },
        { label: 'Title Block', value: sheet.titleBlock ?? '', key: 'titleBlock',
          type: 'select', options: [{ value: '', label: '(default)' }, ...TITLE_BLOCK_OPTIONS] },
    ];

    for (const row of rows) {
        const rowEl = document.createElement('div');
        rowEl.className = 'sh-prop-row';

        const labelEl = document.createElement('span');
        labelEl.className   = 'sh-prop-label';
        labelEl.textContent = row.label;

        if (row.type === 'select') {
            const sel = document.createElement('select');
            sel.className = 'sh-prop-select';
            for (const opt of (row.options ?? [])) {
                const o = document.createElement('option');
                o.value       = opt.value;
                o.textContent = opt.label;
                if (opt.value === row.value) o.selected = true;
                sel.appendChild(o);
            }
            sel.addEventListener('change', () => {
                opts.updateSheetField(sheet.id, row.key, sel.value);
            });
            rowEl.appendChild(labelEl);
            rowEl.appendChild(sel);
        } else {
            const input = document.createElement('input');
            input.className = 'sh-prop-input';
            input.type      = 'text';
            input.value     = row.value;
            input.addEventListener('blur', () => {
                if (input.value.trim() !== row.value) {
                    opts.updateSheetField(sheet.id, row.key, input.value.trim());
                }
            });
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
            rowEl.appendChild(labelEl);
            rowEl.appendChild(input);
        }

        sec.appendChild(rowEl);
    }

    return sec;
}

// ── Selected-viewport section ──────────────────────────────────────────────

export function buildViewportPropsSection(sheet: SheetDefinition, opts: SidebarOpts): HTMLElement {
    const sec = document.createElement('div');
    sec.className = 'sh-sidebar-section';

    const title = document.createElement('div');
    title.className   = 'sh-sidebar-section-title';
    title.textContent = 'Selected Viewport';
    sec.appendChild(title);

    const selectedVpId  = opts.getSelectedVpId();
    const activeSheetId = opts.getActiveSheetId();

    if (!selectedVpId) {
        const hint = document.createElement('div');
        hint.className      = 'sh-prop-label';
        hint.textContent    = 'Click a viewport on the canvas to select it';
        hint.style.fontStyle = 'italic';
        sec.appendChild(hint);
        return sec;
    }

    const vp   = sheet.viewports.find(v => v.id === selectedVpId);
    const view = vp ? viewDefinitionStore.get(vp.viewId) : null;

    if (!vp) {
        const hint = document.createElement('div');
        hint.className   = 'sh-prop-label';
        hint.textContent = 'Viewport not found';
        sec.appendChild(hint);
        return sec;
    }

    const addRow = (label: string, value: string) => {
        const row = document.createElement('div');
        row.className = 'sh-prop-row';
        const l = document.createElement('span'); l.className = 'sh-prop-label'; l.textContent = label;
        const v = document.createElement('span'); v.className = 'sh-prop-value'; v.textContent = value;
        row.appendChild(l); row.appendChild(v);
        sec.appendChild(row);
    };

    addRow('View', view?.name ?? vp.viewId);
    addRow('Type', view?.viewType ?? '—');

    // ── §SHEET-VIEWPORT-SCALE-IS-LIVE (L-1863) — the VIEW's own properties ──
    //
    // The founder asked for *"a panel — like the sheet panel — with information
    // of the view, like the properties panel"*. Everything below the two rows
    // above used to describe the PLACEMENT only (where on the paper, at what
    // scale), which is the sheet's half of the story and not the drawing's.
    //
    // These rows are READ-ONLY on purpose. Level, discipline, detail level and
    // view range belong to the ViewDefinition and apply EVERYWHERE that view
    // appears — editing them from one sheet would silently re-document every
    // other sheet the view is placed on. The properties that belong to THIS
    // placement (position, scale, crop) are the editable ones, and they are
    // below. Where a value is genuinely absent it reads '—' rather than a
    // plausible default [context-data-honesty].
    if (view) {
        const levelId = view.spatial?.levelId;
        if (levelId) addRow('Level', levelId);
        if (view.discipline) addRow('Discipline', view.discipline);
        if (view.output?.detailLevel) addRow('Detail level', String(view.output.detailLevel));
        if (view.viewRange) {
            const vr = view.viewRange as { cutPlane?: number; topOffset?: number; bottomOffset?: number };
            if (typeof vr.cutPlane === 'number') addRow('Cut plane', `${vr.cutPlane.toFixed(2)} m`);
        }
        addRow('View crop', view.crop?.enabled ? 'on (view-wide)' : 'off');
    }

    // Position X
    const posXRow = document.createElement('div');
    posXRow.className = 'sh-prop-row';
    const pxl = document.createElement('span'); pxl.className = 'sh-prop-label'; pxl.textContent = 'Position X (mm)';
    const pxi = document.createElement('input');
    pxi.className = 'sh-prop-input'; pxi.type = 'number'; pxi.min = '0';
    pxi.value     = String(Math.round(vp.position.x));
    pxi.title     = 'Horizontal position from the left edge of the sheet (mm)';
    const commitPosX = () => {
        const nx = parseFloat(pxi.value);
        if (!isNaN(nx) && nx >= 0) {
            const curSheet = activeSheetId ? sheetStore.get(activeSheetId) : null;
            const curVp    = curSheet?.viewports.find(v => v.id === vp.id);
            const curY     = curVp?.position.y ?? vp.position.y;
            const mgr = window.commandManager; // TODO(E.5.x): replace with runtime.bus.executeCommand — Phase E.5.x
            if (mgr) mgr.execute(new MoveViewportCommand(sheet.id, vp.id, { x: nx, y: curY }), { source: 'HUMAN_DIRECT' });
        }
    };
    pxi.addEventListener('blur', commitPosX);
    pxi.addEventListener('keydown', (e) => { if (e.key === 'Enter') pxi.blur(); });
    posXRow.appendChild(pxl); posXRow.appendChild(pxi);
    sec.appendChild(posXRow);

    // Position Y
    const posYRow = document.createElement('div');
    posYRow.className = 'sh-prop-row';
    const pyl = document.createElement('span'); pyl.className = 'sh-prop-label'; pyl.textContent = 'Position Y (mm)';
    const pyi = document.createElement('input');
    pyi.className = 'sh-prop-input'; pyi.type = 'number'; pyi.min = '0';
    pyi.value     = String(Math.round(vp.position.y));
    pyi.title     = 'Vertical position from the bottom edge of the sheet (mm)';
    const commitPosY = () => {
        const ny = parseFloat(pyi.value);
        if (!isNaN(ny) && ny >= 0) {
            const curSheet2 = activeSheetId ? sheetStore.get(activeSheetId) : null;
            const curVp2    = curSheet2?.viewports.find(v => v.id === vp.id);
            const curX      = curVp2?.position.x ?? vp.position.x;
            const mgr = window.commandManager; // TODO(E.5.x): replace with runtime.bus.executeCommand — Phase E.5.x
            if (mgr) mgr.execute(new MoveViewportCommand(sheet.id, vp.id, { x: curX, y: ny }), { source: 'HUMAN_DIRECT' });
        }
    };
    pyi.addEventListener('blur', commitPosY);
    pyi.addEventListener('keydown', (e) => { if (e.key === 'Enter') pyi.blur(); });
    posYRow.appendChild(pyl); posYRow.appendChild(pyi);
    sec.appendChild(posYRow);

    // Scale
    const scaleRow = document.createElement('div');
    scaleRow.className = 'sh-prop-row';
    const sl = document.createElement('span'); sl.className = 'sh-prop-label'; sl.textContent = 'Scale';

    const SCALE_PRESETS = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
    // §SHEET-ONE-SCALE-RESOLUTION (L-10682) — the dropdown showed 1:50 for a
    // viewport drawn at 1:100, and the guard below then refused to dispatch when
    // the founder chose the value it was showing him.
    const currentScale  = resolveViewportScale(vp, view);
    const isCustom      = !SCALE_PRESETS.includes(currentScale);

    const scaleInputGroup = document.createElement('div');
    scaleInputGroup.style.cssText = 'display:flex;gap:4px;flex:1;min-width:0;';

    const sd = document.createElement('select');
    sd.className  = 'sh-prop-select';
    sd.style.flex = '0 0 auto';
    sd.style.width = 'auto';
    for (const p of SCALE_PRESETS) {
        const o = document.createElement('option');
        o.value = String(p); o.textContent = `1:${p}`;
        if (p === currentScale && !isCustom) o.selected = true;
        sd.appendChild(o);
    }
    const customOpt = document.createElement('option');
    customOpt.value       = 'custom';
    customOpt.textContent = 'Custom…';
    if (isCustom) customOpt.selected = true;
    sd.appendChild(customOpt);

    const si = document.createElement('input');
    si.className     = 'sh-prop-input';
    si.type          = 'number';
    si.min           = '1'; si.max = '5000';
    si.value         = String(currentScale);
    si.title         = '1:N scale denominator (e.g. 50 = 1:50)';
    si.style.display = isCustom ? '' : 'none';
    si.style.width   = '64px';
    si.style.flex    = '0 0 auto';

    const applyScale = (n: number) => {
        if (!isNaN(n) && n > 0 && n !== resolveViewportScale(vp, view)) {
            const cmd = new UpdateViewportScaleCommand(sheet.id, vp.id, n);
            const mgr = window.commandManager; // TODO(E.5.x): replace with runtime.bus.executeCommand — Phase E.5.x
            if (mgr) mgr.execute(cmd, { source: 'HUMAN_DIRECT' });
        }
    };

    sd.addEventListener('change', () => {
        if (sd.value === 'custom') { si.style.display = ''; si.focus(); }
        else { si.style.display = 'none'; applyScale(parseInt(sd.value, 10)); }
    });
    si.addEventListener('blur',    () => applyScale(parseInt(si.value, 10)));
    si.addEventListener('keydown', (e) => { if (e.key === 'Enter') si.blur(); });

    scaleInputGroup.appendChild(sd);
    scaleInputGroup.appendChild(si);
    scaleRow.appendChild(sl);
    scaleRow.appendChild(scaleInputGroup);
    sec.appendChild(scaleRow);

    // ── §SHEET-VIEWPORT-CROP-UI (L-1864) — crop, on the sheet, on demand ────
    //
    // The founder: *"also crop the view on demand as I do with the elevations in
    // floor plan."*
    //
    // The persistence and rendering halves of this landed in L-1840
    // (`SheetViewport.crop`, `sheetStore.updateViewportCrop`,
    // `SetViewportCropCommand`, and `ViewportSvgComposer`'s `cropWorldM`
    // branch). NOTHING DISPATCHED IT — the crop existed everywhere except where
    // a user could ask for one. This section is that missing half.
    //
    // ⚠ THE UNITS ARE DRAWING-SPACE METRES, and the label says so. This is the
    // THIRD crop concept in the codebase and the other two are in different
    // frames: `ViewDefinition.crop.region` is view-wide and its `region[0]`
    // carries two incompatible meanings depending on view type (see
    // ViewDefinitionTypes §ELEV-SCOPE-FRAME), and `spatial.cropRegion` is a
    // third. A fourth is not invented here — these four inputs write the one
    // field `ViewportSvgComposer` already frames in.
    const cropTitle = document.createElement('div');
    cropTitle.className   = 'sh-prop-label';
    cropTitle.textContent = 'Crop (drawing metres)';
    cropTitle.style.cssText = 'margin-top:8px;opacity:0.75;';
    sec.appendChild(cropTitle);

    const cropInputs: Record<'minX' | 'maxX' | 'minZ' | 'maxZ', HTMLInputElement> =
        {} as Record<'minX' | 'maxX' | 'minZ' | 'maxZ', HTMLInputElement>;

    const dispatchCrop = (next: { minX: number; minZ: number; maxX: number; maxZ: number } | null): void => {
        const mgr = window.commandManager; // TODO(E.5.x): replace with runtime.bus.executeCommand — Phase E.5.x
        if (!mgr) return;
        const cmd = new SetViewportCropCommand(sheet.id, vp.id, next);
        // The command REFUSES an inverted or zero-area rectangle rather than
        // normalising it, so a half-typed crop is rejected loudly instead of
        // persisting a zero-width viewBox. Surface the refusal; do not swallow.
        const res = mgr.execute(cmd, { source: 'HUMAN_DIRECT' }) as { success?: boolean; error?: string } | undefined;
        if (res && res.success === false) {
            console.warn(`[SheetEditorSidebar] crop refused: ${res.error ?? 'unknown reason'}`);
        }
        opts.refreshSidebar();
    };

    const cropKeys = ['minX', 'maxX', 'minZ', 'maxZ'] as const;

    const readCropFields = (): { minX: number; minZ: number; maxX: number; maxZ: number } | null => {
        const n = (k: typeof cropKeys[number]) => parseFloat(cropInputs[k].value);
        const r = { minX: n('minX'), minZ: n('minZ'), maxX: n('maxX'), maxZ: n('maxZ') };
        return Object.values(r).every(v => Number.isFinite(v)) ? r : null;
    };

    const cropGrid = document.createElement('div');
    cropGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:4px;';
    for (const field of cropKeys) {
        const wrap = document.createElement('label');
        wrap.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:10px;opacity:0.8;';
        wrap.textContent = field;
        const inp = document.createElement('input');
        inp.className = 'sh-prop-input';
        inp.type      = 'number';
        inp.step      = '0.1';
        inp.style.width = '100%';
        inp.dataset['cropField'] = field;
        inp.value = vp.crop ? String(vp.crop[field]) : '';
        inp.placeholder = 'auto';
        inp.addEventListener('change', () => {
            const r = readCropFields();
            // All four blank means the user CLEARED the crop, which is a
            // different operation from "crop to everything": an uncropped
            // viewport reframes itself as the drawing grows, a cropped one does
            // not. Partially-filled is neither, and is left alone.
            if (!r) {
                const allBlank = cropKeys.every(k => cropInputs[k].value.trim() === '');
                if (allBlank && vp.crop) dispatchCrop(null);
                return;
            }
            dispatchCrop(r);
        });
        cropInputs[field] = inp;
        wrap.appendChild(inp);
        cropGrid.appendChild(wrap);
    }
    sec.appendChild(cropGrid);

    const cropBtnRow = document.createElement('div');
    cropBtnRow.style.cssText = 'display:flex;gap:4px;';

    const cropToViewBtn = document.createElement('button');
    cropToViewBtn.className   = 'sh-header-btn';
    cropToViewBtn.type        = 'button';
    cropToViewBtn.textContent = '⛶ Crop to current view';
    cropToViewBtn.title       = 'Crop this placement to exactly what the viewport is showing right now';
    cropToViewBtn.style.flex  = '1';
    cropToViewBtn.addEventListener('click', () => {
        const rect = opts.getVisibleWorldRect(vp.id);
        if (!rect) {
            console.warn('[SheetEditorSidebar] no composed drawing to crop to');
            return;
        }
        dispatchCrop(rect);
    });
    cropBtnRow.appendChild(cropToViewBtn);

    const clearCropBtn = document.createElement('button');
    clearCropBtn.className   = 'sh-header-btn';
    clearCropBtn.type        = 'button';
    clearCropBtn.textContent = '↺';
    clearCropBtn.title       = 'Clear the crop and reframe to the full content bounds';
    clearCropBtn.disabled    = !vp.crop;
    clearCropBtn.addEventListener('click', () => dispatchCrop(null));
    cropBtnRow.appendChild(clearCropBtn);
    sec.appendChild(cropBtnRow);

    // ── §SHEET-DBLCLICK-STAYS-ON-THE-SHEET (L-1866) — the named escape hatch ─
    //
    // Double-click now activates navigation IN the sheet, which is what the
    // founder asked for. Leaving the sheet to edit the view's ELEMENTS is still
    // possible — it is the only way to edit elements at all, because the
    // composed SVG carries no per-element identity to pick against — but it is
    // now a button he presses, not something that happens to him.
    const openBtn = document.createElement('button');
    openBtn.className   = 'sh-header-btn';
    openBtn.type        = 'button';
    openBtn.textContent = '↗ Open in main editor';
    openBtn.title       = 'Leave the sheet and open this view in the main editor to edit its elements';
    openBtn.style.width     = '100%';
    openBtn.style.marginTop = '6px';
    openBtn.addEventListener('click', () => opts.openViewInMainEditor(vp.viewId));
    sec.appendChild(openBtn);

    const removeBtn = document.createElement('button');
    removeBtn.className   = 'sh-header-btn sh-header-btn--danger';
    removeBtn.type        = 'button';
    removeBtn.textContent = '✕ Remove from sheet  (Del)';
    removeBtn.style.width     = '100%';
    removeBtn.style.marginTop = '6px';
    // Routed through the panel's dispatcher rather than a local
    // `mgr.execute(...)`: the panel also has to drop the viewport's navigation
    // camera and clear the selection, and a second removal path that skips both
    // is how a re-placed view inherits a deleted one's pan.
    removeBtn.addEventListener('click', () => {
        opts.removeViewport(sheet.id, vp.id);
    });
    sec.appendChild(removeBtn);

    return sec;
}

// ── Revision section ───────────────────────────────────────────────────────

export function buildRevisionSection(sheet: SheetDefinition, opts: SidebarOpts): HTMLElement {
    const sec = document.createElement('div');
    sec.className = 'sh-sidebar-section';

    const titleRow = document.createElement('div');
    titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;';

    const title = document.createElement('div');
    title.className   = 'sh-sidebar-section-title';
    title.style.margin = '0';
    title.textContent = 'Revisions';
    titleRow.appendChild(title);

    const addBtn = document.createElement('button');
    addBtn.className      = 'sh-revision-add-btn';
    addBtn.style.width    = 'auto';
    addBtn.style.padding  = '2px 8px';
    addBtn.textContent    = '+ Add';
    addBtn.addEventListener('click', () => {
        opts.setRevisionFormOpen(!opts.getRevisionFormOpen());
        opts.refreshSidebar();
    });
    titleRow.appendChild(addBtn);
    sec.appendChild(titleRow);

    const revisions = sheet.revisions ?? [];

    if (revisions.length > 0) {
        const table = document.createElement('table');
        table.className = 'sh-revision-table';
        const thead = document.createElement('thead');
        thead.innerHTML = '<tr><th>Code</th><th>Date</th><th>By</th><th>Description</th></tr>';
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        for (const rev of revisions) {
            const tr = document.createElement('tr');
            // Wave A14 (S118) A14-T2: sanitize all rev.* fields before innerHTML injection.
            // rev.* values come from user-supplied IFC data / form input — XSS risk if
            // unescaped. DOMPurify strips all tags/attrs, leaving safe plain text only.
            const safe = (v: string) => DOMPurify.sanitize(String(v ?? ''), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
            const safeCode        = safe(rev.code);
            const safeDate        = safe(rev.date);
            const safeIssuedBy    = safe(rev.issuedBy);
            const safeDesc        = safe(rev.description);
            const safeDescPreview = safeDesc.slice(0, 20) + (safeDesc.length > 20 ? '…' : '');
            tr.innerHTML = `<td>${safeCode}</td><td>${safeDate}</td><td>${safeIssuedBy}</td><td title="${safeDesc}">${safeDescPreview}</td>`;
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        sec.appendChild(table);
    } else if (!opts.getRevisionFormOpen()) {
        const empty = document.createElement('div');
        empty.className      = 'sh-prop-label';
        empty.textContent    = 'No revisions recorded';
        empty.style.fontStyle = 'italic';
        sec.appendChild(empty);
    }

    if (opts.getRevisionFormOpen()) {
        const onDone = () => {
            opts.setRevisionFormOpen(false);
            opts.refreshSidebar();
        };
        sec.appendChild(buildRevisionFormEl(sheet.id, onDone));
    }

    return sec;
}

// ── View picker ────────────────────────────────────────────────────────────

export function buildViewPickerSection(sheet: SheetDefinition, opts: SidebarOpts): HTMLElement {
    const sec = document.createElement('div');
    sec.className = 'sh-sidebar-section sh-view-picker-section';

    const title = document.createElement('div');
    title.className   = 'sh-sidebar-section-title';
    title.textContent = 'Available Views';
    sec.appendChild(title);

    const placedViewIds = new Set(sheet.viewports.map(vp => vp.viewId));
    const allViews      = viewDefinitionStore.getAll();

    const picker = document.createElement('div');
    picker.className = 'sh-view-picker';

    if (allViews.length === 0) {
        const empty = document.createElement('div');
        empty.className   = 'sh-view-picker-empty';
        empty.textContent = 'No views defined. Create views in the Project Browser first.';
        picker.appendChild(empty);
    } else {
        for (const view of allViews) {
            const isPlaced = placedViewIds.has(view.id);
            picker.appendChild(buildViewPickerEntry(view, isPlaced, sheet, opts));
        }
    }

    sec.appendChild(picker);
    return sec;
}

export function buildViewPickerEntry(
    view:     ViewDefinition,
    isPlaced: boolean,
    sheet:    SheetDefinition,
    opts:     SidebarOpts,
): HTMLElement {
    const entry = document.createElement('div');
    entry.className = 'sh-view-entry' + (isPlaced ? ' sh-view-entry--placed' : '');
    entry.title     = isPlaced
        ? `${view.name} — already on this sheet`
        : `Drag onto the sheet to place ${view.name}, or click to auto-place`;

    const icon = document.createElement('span');
    icon.className   = 'sh-view-entry-icon';
    icon.textContent = VIEW_TYPE_ICONS[view.viewType] ?? '□';

    const name = document.createElement('span');
    name.textContent = view.name;

    entry.appendChild(icon);
    entry.appendChild(name);

    if (isPlaced) {
        const badge = document.createElement('span');
        badge.className   = 'sh-view-entry-badge';
        badge.textContent = '✓ placed';
        entry.appendChild(badge);
    }

    if (!isPlaced) {
        entry.addEventListener('click', () => opts.addViewToSheet(sheet, view));

        // §SHEET-DROP-WHERE-THE-CURSOR-IS (L-1632) — Mural-style placement.
        // The click path is deliberately KEPT: dragging is the precise gesture,
        // clicking is the fast one, and removing the fast one to add the precise
        // one would be a net withdrawal of capability (C82 §1.1).
        // `setAttribute`, not the `draggable` IDL property: the attribute is what
        // the drag-and-drop algorithm and CSS attribute selectors both read, and
        // it is the form that survives cloning and serialisation.
        entry.setAttribute('draggable', 'true');
        entry.addEventListener('dragstart', (e) => {
            const dt = (e as DragEvent).dataTransfer;
            if (!dt) return;
            // A private MIME type is what makes the sheet canvas able to tell a
            // view drag from any other drag that crosses it (a file drop, a text
            // selection). `text/plain` is set as well so the drag has a sane
            // payload if it lands outside the app.
            dt.setData(VIEW_DRAG_MIME, view.id);
            dt.setData('text/plain', view.name);
            dt.effectAllowed = 'copy';
            entry.classList.add('sh-view-entry--dragging');
        });
        entry.addEventListener('dragend', () => {
            entry.classList.remove('sh-view-entry--dragging');
        });
    }

    return entry;
}

// ── SC-8: Presence + Comments ──────────────────────────────────────────────

/**
 * Initialise the socket-based presence listeners for a sheet.
 * Returns a cleanup function that stops the cursor-prune interval and removes socket listeners.
 */
export function initPresence(
    sheetId:       string,
    el:            HTMLDivElement,
    onUpdateStrip: () => void,
): () => void {
    const pruneInterval = setInterval(() => {
        sheetCommentStore.pruneStaleCursors();
    }, 5000);

    const socket = window.socket; // TODO(D.4): replace with runtime.bus (socket.io bridge removed in D.4) — Phase D.4
    if (socket) {
        socket.on('remote-cursor', (data: any) => {
            if (data.sheetId !== sheetId) return;
            sheetCommentStore.updateCursor({
                userId:    data.userId,
                userName:  data.userName ?? data.userId,
                userColor: data.userColor ?? '#6741D9',
                sheetId,
                position:  { x: data.x ?? 0, y: data.y ?? 0 },
                lastSeen:  Date.now(),
            });
            updatePresenceStrip(el, sheetId);
        });
        socket.on('remote-sheet-comment-add', (data: any) => {
            if (data.sheetId !== sheetId) return;
            sheetCommentStore.addComment(data.comment);
        });
        socket.on('remote-sheet-comment-resolve', (data: any) => {
            if (data.sheetId !== sheetId) return;
            sheetCommentStore.resolveComment(data.commentId);
        });
    }

    void onUpdateStrip;

    return () => {
        clearInterval(pruneInterval);
    };
}

export function updatePresenceStrip(el: HTMLDivElement, sheetId: string): void {
    el.innerHTML = '';
    const cursors = sheetCommentStore.getCursorsForSheet(sheetId);
    for (const cursor of cursors.slice(0, 8)) {
        const avatar = document.createElement('div');
        avatar.className       = 'sh-presence-avatar';
        avatar.style.background = cursor.userColor;
        avatar.dataset['name']  = cursor.userName;
        avatar.textContent      = (cursor.userName?.[0] ?? '?').toUpperCase();
        avatar.title            = cursor.userName;
        el.appendChild(avatar);
    }
}

export function placeComment(
    sheetId: string,
    xMm:    number,
    yMm:    number,
    _canvas: HTMLElement,
): void {
    const body = prompt('Comment:');
    if (!body) return;
    const userId    = window.clerkUser?.id ?? 'anon'; // TODO(C.3.x): replace with runtime.persistence.currentUser — Phase C.3.x
    const userName  = window.clerkUser?.fullName ?? 'Anonymous'; // TODO(C.3.x): replace with runtime.persistence.currentUser — Phase C.3.x
    const userColor = '#6741D9';
    const comment: SheetComment = {
        id:          crypto.randomUUID(),
        sheetId,
        authorId:    userId,
        authorName:  userName,
        authorColor: userColor,
        body,
        position:    { x: xMm, y: yMm },
        resolved:    false,
        createdAt:   Date.now(),
        updatedAt:   Date.now(),
        replies:     [],
    };
    sheetCommentStore.addComment(comment);

    const socket = window.socket; // TODO(D.4): replace with runtime.bus — Phase D.4
    const projectId = window.currentProjectId; // TODO(C.3.x): replace with runtime.persistence.projectId — Phase C.3.x
    if (socket && projectId) {
        socket.emit('sheet-comment-add', { projectId, sheetId, comment });
    }
}

export function buildCommentPin(
    comment:       SheetComment,
    scaleFactor:   number,
    activeSheetId: string | null,
    _canvas:       HTMLElement,
): HTMLElement {
    const sf  = scaleFactor;
    const pin = document.createElement('div');
    pin.className = comment.resolved ? 'sh-comment-pin sh-comment-pin--resolved' : 'sh-comment-pin';
    pin.style.cssText = `
        left: ${comment.position.x * sf}px;
        top:  ${comment.position.y * sf}px;
        background: ${comment.authorColor};
    `;
    pin.title = `${comment.authorName}: ${comment.body}`;

    pin.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.sh-comment-popover').forEach(el => el.remove());

        const popover = document.createElement('div');
        popover.className = 'sh-comment-popover';
        popover.style.cssText = `left: ${comment.position.x * sf + 22}px; top: ${comment.position.y * sf}px;`;

        const author = document.createElement('div');
        author.className   = 'sh-comment-popover-author';
        author.textContent = comment.authorName;

        const body = document.createElement('div');
        body.className   = 'sh-comment-popover-body';
        body.textContent = comment.body;

        const resolveBtn = document.createElement('button');
        resolveBtn.className   = 'sh-comment-resolve-btn';
        resolveBtn.textContent = comment.resolved ? '✓ Resolved' : 'Resolve';
        resolveBtn.disabled    = comment.resolved;
        resolveBtn.addEventListener('click', () => {
            sheetCommentStore.resolveComment(comment.id);
            pin.classList.add('sh-comment-pin--resolved');
            resolveBtn.disabled    = true;
            resolveBtn.textContent = '✓ Resolved';
            const socket    = window.socket; // TODO(D.4): replace with runtime.bus — Phase D.4
            const projectId = window.currentProjectId; // TODO(C.3.x): replace with runtime.persistence.projectId — Phase C.3.x
            if (socket && projectId && activeSheetId) {
                socket.emit('sheet-comment-resolve', { projectId, sheetId: activeSheetId, commentId: comment.id });
            }
        });

        popover.appendChild(author);
        popover.appendChild(body);
        popover.appendChild(resolveBtn);
        (pin.parentElement ?? document.body).appendChild(popover);

        const outsideClick = (ev: MouseEvent) => {
            if (!popover.contains(ev.target as Node)) {
                popover.remove();
                document.removeEventListener('click', outsideClick);
            }
        };
        setTimeout(() => document.addEventListener('click', outsideClick), 0);
    });

    return pin;
}
