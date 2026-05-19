/**
 * SheetEditorCommands — all Command<T> dispatch functions for the Sheet Editor.
 *
 * Wave 7 WS-B (S85-WIRE): extracted from SheetEditorPanel.ts.
 *
 * §01 §2: All mutations via the legacy command manager; no direct store writes.
 * §06:    No platform-layer imports.
 */

import { getFrameScheduler } from '@pryzm/frame-scheduler';
import type { SheetDefinition, SheetViewport } from '@pryzm/core-app-model';
import type { ViewDefinition } from '@pryzm/core-app-model';
import { AddViewportToSheetCommand } from '@pryzm/command-registry';
import { RemoveViewportFromSheetCommand } from '@pryzm/command-registry';
import { UpdateViewportScaleCommand } from '@pryzm/command-registry';
import { UpdateSheetCommand } from '@pryzm/command-registry';
import { AddRevisionToSheetCommand } from '@pryzm/command-registry';
import { ApplySheetLayoutPresetCommand } from '@pryzm/command-registry';
import { AddDataPanelToSheetCommand } from '@pryzm/command-registry';
import { RemoveDataPanelFromSheetCommand } from '@pryzm/command-registry';
import { ExportSheetCommand } from '@pryzm/command-registry';
import type { ExportFormat } from '@pryzm/command-registry';
import { SetSheetCompositionIntentCommand } from '@pryzm/command-registry';
import { titleBlockStore } from '@pryzm/core-app-model';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import { layoutEngine } from '@pryzm/core-app-model';
import type { LayoutPresetKey } from '@pryzm/core-app-model';
import type { DataPanel } from '@pryzm/core-app-model';

// ── Core mutation dispatchers ──────────────────────────────────────────────

export function dispatchAddViewport(sheet: SheetDefinition, view: ViewDefinition): void {
    if (!(window as any).__pryzmInitComplete) {
        console.error('[SheetEditorCommands] Engine not yet initialised — command ignored: dispatchAddViewport');
        return;
    }
    const mgr = window.commandManager; // TODO(E.5.x): replace with runtime.bus.executeCommand — Phase E.5.x
    if (!mgr) {
        console.warn('[SheetEditorCommands] commandManager not available');
        return;
    }
    const offset = sheet.viewports.length * 30;
    const cmd = new AddViewportToSheetCommand({
        sheetId:    sheet.id,
        viewportId: `vp-${crypto.randomUUID()}`,
        viewId:     view.id,
        position:   { x: 50 + offset, y: 100 + offset },
        scale:      view.output?.scale ?? 50,
        viewType:   view.viewType,
    });
    mgr.execute(cmd, { source: 'HUMAN_DIRECT' });
    console.log(`[SheetEditorCommands] Added view "${view.name}" to sheet "${sheet.sheetNumber}"`);
}

export function dispatchRemoveViewport(sheetId: string, vpId: string): void {
    if (!(window as any).__pryzmInitComplete) {
        console.error('[SheetEditorCommands] Engine not yet initialised — command ignored: dispatchRemoveViewport');
        return;
    }
    const mgr = window.commandManager; // TODO(E.5.x): replace with runtime.bus.executeCommand — Phase E.5.x
    if (!mgr) return;
    const cmd = new RemoveViewportFromSheetCommand(sheetId, vpId);
    mgr.execute(cmd, { source: 'HUMAN_DIRECT' });
    console.log(`[SheetEditorCommands] Removed viewport ${vpId}`);
}

export function dispatchUpdateSheetField(sheetId: string, key: string, value: string): void {
    if (!(window as any).__pryzmInitComplete) {
        console.error('[SheetEditorCommands] Engine not yet initialised — command ignored: dispatchUpdateSheetField');
        return;
    }
    const mgr = window.commandManager; // TODO(E.5.x): replace with runtime.bus.executeCommand — Phase E.5.x
    if (!mgr) return;
    const patch: Record<string, string> = { [key]: value };
    const cmd = new UpdateSheetCommand(sheetId, patch as any);
    mgr.execute(cmd, { source: 'HUMAN_DIRECT' });
}

// ── SC-6: Export dialog ────────────────────────────────────────────────────

export function showExportDialog(sheet: SheetDefinition): void {
    document.getElementById('sh-export-dialog-backdrop')?.remove();

    const backdrop = document.createElement('div');
    backdrop.id        = 'sh-export-dialog-backdrop';
    backdrop.className = 'sh-export-dialog-backdrop';

    const dialog = document.createElement('div');
    dialog.className = 'sh-export-dialog';

    const title = document.createElement('h3');
    title.className   = 'sh-export-dialog-title';
    title.textContent = `Export: ${sheet.sheetNumber}`;
    dialog.appendChild(title);

    const formatLabel = document.createElement('label');
    formatLabel.className   = 'sh-export-dialog-label';
    formatLabel.textContent = 'Format';
    dialog.appendChild(formatLabel);

    const formatGrid = document.createElement('div');
    formatGrid.className = 'sh-export-format-grid';

    const formatOptions: Array<{ format: ExportFormat; label: string }> = [
        { format: 'print', label: 'Print' },
        { format: 'png',   label: 'PNG'   },
        { format: 'svg',   label: 'SVG'   },
        { format: 'dxf',   label: 'DXF'   },
        { format: 'pdf',   label: 'PDF'   },
    ];

    let selectedFormat: ExportFormat = 'print';
    for (const { format, label } of formatOptions) {
        const btn = document.createElement('button');
        btn.className   = format === 'print'
            ? 'sh-export-format-btn sh-export-format-btn--selected'
            : 'sh-export-format-btn';
        btn.type        = 'button';
        btn.textContent = label;
        btn.addEventListener('click', () => {
            selectedFormat = format;
            formatGrid.querySelectorAll('.sh-export-format-btn')
                .forEach(b => b.classList.remove('sh-export-format-btn--selected'));
            btn.classList.add('sh-export-format-btn--selected');
            dpiRow.style.display = format === 'png' ? 'flex' : 'none';
        });
        formatGrid.appendChild(btn);
    }
    dialog.appendChild(formatGrid);

    const dpiRow = document.createElement('div');
    dpiRow.className     = 'sh-export-dpi-row';
    dpiRow.style.display = 'none';
    const dpiLabel = document.createElement('label');
    dpiLabel.className   = 'sh-export-dialog-label';
    dpiLabel.textContent = 'DPI:';
    const dpiInput = document.createElement('input');
    dpiInput.className = 'sh-export-dpi-input';
    dpiInput.type  = 'number';
    dpiInput.value = '150';
    dpiInput.min   = '72';
    dpiInput.max   = '600';
    dpiRow.appendChild(dpiLabel);
    dpiRow.appendChild(dpiInput);
    dialog.appendChild(dpiRow);

    const actions = document.createElement('div');
    actions.className = 'sh-export-dialog-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className   = 'sh-export-cancel-btn';
    cancelBtn.type        = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => backdrop.remove());

    const confirmBtn = document.createElement('button');
    confirmBtn.className   = 'sh-export-confirm-btn';
    confirmBtn.type        = 'button';
    confirmBtn.textContent = 'Export';
    confirmBtn.addEventListener('click', () => {
        if (!(window as any).__pryzmInitComplete) {
            console.error('[SheetEditorCommands] Engine not yet initialised — command ignored: showExportDialog/confirmBtn');
            return;
        }
        const mgr = window.commandManager; // TODO(E.5.x): replace with runtime.bus.executeCommand — Phase E.5.x
        if (!mgr) return;
        const cmd = new ExportSheetCommand({
            sheetId: sheet.id,
            format:  selectedFormat,
            dpi:     selectedFormat === 'png' ? parseInt(dpiInput.value, 10) || 150 : undefined,
        });
        mgr.execute(cmd, { source: 'HUMAN_DIRECT' });
        backdrop.remove();
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    dialog.appendChild(actions);

    backdrop.appendChild(dialog);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
    document.body.appendChild(backdrop);
}

// ── SC-4: Layout preset + paper size section ───────────────────────────────

export function buildLayoutSection(
    sheet:          SheetDefinition,
    onUpdateField:  (key: string, value: string) => void,
): HTMLElement {
    const sec = document.createElement('div');
    sec.className = 'sh-layout-section';

    const label = document.createElement('div');
    label.className   = 'sh-layout-label';
    label.textContent = 'Layout Preset';
    sec.appendChild(label);

    const presets = layoutEngine.getPresets();
    const grid = document.createElement('div');
    grid.className = 'sh-preset-grid';

    for (const preset of presets) {
        const btn = document.createElement('button');
        btn.className   = 'sh-preset-btn';
        btn.type        = 'button';
        btn.textContent = preset.name;
        btn.title       = preset.description;
        btn.addEventListener('click', () => {
            if (!(window as any).__pryzmInitComplete) {
                console.error('[SheetEditorCommands] Engine not yet initialised — command ignored: buildLayoutSection/presetBtn');
                return;
            }
            const mgr = window.commandManager; // TODO(E.5.x): replace with runtime.bus.executeCommand — Phase E.5.x
            if (!mgr) return;
            const template = sheet.titleBlock
                ? (titleBlockStore.get(sheet.titleBlock) ?? titleBlockStore.getDefault())
                : titleBlockStore.getDefault();
            const cmd = new ApplySheetLayoutPresetCommand({
                sheetId:   sheet.id,
                presetKey: preset.key as LayoutPresetKey,
                paperW:    template.paperWidth,
                paperH:    template.paperHeight,
                marginMm:  10,
            });
            mgr.execute(cmd, { source: 'HUMAN_DIRECT' });
        });
        grid.appendChild(btn);
    }
    sec.appendChild(grid);

    const paperRow = document.createElement('div');
    paperRow.className = 'sh-paper-size-row';
    const paperLabel = document.createElement('div');
    paperLabel.className   = 'sh-paper-size-label';
    paperLabel.textContent = 'Paper:';
    const paperSelect = document.createElement('select');
    paperSelect.className = 'sh-paper-size-select';
    for (const size of ['A0','A1','A2','A3','A4','ANSI-A','ANSI-B','ANSI-C','ANSI-D','custom']) {
        const opt = document.createElement('option');
        opt.value       = size;
        opt.textContent = size;
        if (sheet.paperSize === size) opt.selected = true;
        paperSelect.appendChild(opt);
    }
    paperSelect.addEventListener('change', () => {
        onUpdateField('paperSize', paperSelect.value);
    });
    paperRow.appendChild(paperLabel);
    paperRow.appendChild(paperSelect);
    sec.appendChild(paperRow);

    return sec;
}

// ── SC-5: Data panel section ───────────────────────────────────────────────

export function buildDataPanelSection(sheet: SheetDefinition): HTMLElement {
    const sec = document.createElement('div');
    sec.className = 'sh-dp-panel-section';

    const label = document.createElement('div');
    label.className   = 'sh-layout-label';
    label.textContent = 'Data Panels';
    sec.appendChild(label);

    const types: Array<{ type: DataPanel['panelType']; label: string }> = [
        { type: 'quantity-table', label: '+ Element Count' },
        { type: 'metric',         label: '+ Metric'        },
        { type: 'key-legend',     label: '+ Key Legend'    },
    ];
    for (const t of types) {
        const btn = document.createElement('button');
        btn.className   = 'sh-dp-add-btn';
        btn.type        = 'button';
        btn.textContent = t.label;
        btn.addEventListener('click', () => {
            if (!(window as any).__pryzmInitComplete) {
                console.error('[SheetEditorCommands] Engine not yet initialised — command ignored: buildDataPanelSection/addBtn');
                return;
            }
            const mgr = window.commandManager; // TODO(E.5.x): replace with runtime.bus.executeCommand — Phase E.5.x
            if (!mgr) return;
            const panel: DataPanel = {
                id:        crypto.randomUUID(),
                panelType: t.type,
                position:  { x: 20, y: 20 },
                size:      { w: 80, h: 60 },
                query:     t.type === 'metric' ? 'walls' : undefined,
            };
            const cmd = new AddDataPanelToSheetCommand({ sheetId: sheet.id, panel });
            mgr.execute(cmd, { source: 'HUMAN_DIRECT' });
        });
        sec.appendChild(btn);
    }

    if ((sheet.dataPanels ?? []).length > 0) {
        const list = document.createElement('div');
        list.className = 'sh-dp-panel-list';
        for (const panel of sheet.dataPanels!) {
            const item = document.createElement('div');
            item.className = 'sh-dp-panel-item';
            const nameEl = document.createElement('div');
            nameEl.textContent = panel.panelType;
            const removeBtn = document.createElement('button');
            removeBtn.className   = 'sh-dp-panel-remove';
            removeBtn.type        = 'button';
            removeBtn.textContent = '×';
            removeBtn.title       = 'Remove panel';
            removeBtn.addEventListener('click', () => {
                if (!(window as any).__pryzmInitComplete) {
                    console.error('[SheetEditorCommands] Engine not yet initialised — command ignored: buildDataPanelSection/removeBtn');
                    return;
                }
                const mgr = window.commandManager; // TODO(E.5.x): replace with runtime.bus.executeCommand — Phase E.5.x
                if (!mgr) return;
                const cmd = new RemoveDataPanelFromSheetCommand({ sheetId: sheet.id, panelId: panel.id });
                mgr.execute(cmd, { source: 'HUMAN_DIRECT' });
            });
            item.appendChild(nameEl);
            item.appendChild(removeBtn);
            list.appendChild(item);
        }
        sec.appendChild(list);
    }

    return sec;
}

// ── SC-7: Composition intent section ──────────────────────────────────────

export function buildIntentSection(sheet: SheetDefinition): HTMLElement {
    const sec = document.createElement('div');
    sec.className = 'sh-intent-section';

    const label = document.createElement('div');
    label.className   = 'sh-intent-label';
    label.textContent = 'AI Composition Intent';
    sec.appendChild(label);

    const textarea = document.createElement('textarea');
    textarea.className   = 'sh-intent-textarea';
    textarea.rows        = 3;
    textarea.placeholder = 'Describe the purpose of this sheet for AI layout suggestions…';
    textarea.value       = sheet.compositionIntent ?? '';

    const audienceSelect = document.createElement('select');
    audienceSelect.className = 'sh-audience-select';
    for (const opt of ['', 'client', 'contractor', 'engineer', 'regulatory', 'coordination']) {
        const el = document.createElement('option');
        el.value       = opt;
        el.textContent = opt || '— select —';
        if (sheet.audience === opt) el.selected = true;
        audienceSelect.appendChild(el);
    }

    textarea.addEventListener('change', () => {
        if (!(window as any).__pryzmInitComplete) {
            console.error('[SheetEditorCommands] Engine not yet initialised — command ignored: buildIntentSection/textarea.change');
            return;
        }
        const mgr = window.commandManager; // TODO(E.5.x): replace with runtime.bus.executeCommand — Phase E.5.x
        if (!mgr) return;
        const cmd = new SetSheetCompositionIntentCommand({
            sheetId:           sheet.id,
            compositionIntent: textarea.value.trim(),
            audience:          audienceSelect.value as any || undefined,
        });
        mgr.execute(cmd, { source: 'HUMAN_DIRECT' });
    });
    sec.appendChild(textarea);

    const audienceRow = document.createElement('div');
    audienceRow.className = 'sh-audience-row';
    const audienceLabel = document.createElement('div');
    audienceLabel.className   = 'sh-audience-label';
    audienceLabel.textContent = 'Audience:';
    audienceSelect.addEventListener('change', () => {
        if (!(window as any).__pryzmInitComplete) {
            console.error('[SheetEditorCommands] Engine not yet initialised — command ignored: buildIntentSection/audienceSelect.change');
            return;
        }
        const mgr = window.commandManager; // TODO(E.5.x): replace with runtime.bus.executeCommand — Phase E.5.x
        if (!mgr) return;
        const cmd = new SetSheetCompositionIntentCommand({
            sheetId:  sheet.id,
            audience: audienceSelect.value as any || undefined,
        });
        mgr.execute(cmd, { source: 'HUMAN_DIRECT' });
    });
    audienceRow.appendChild(audienceLabel);
    audienceRow.appendChild(audienceSelect);
    sec.appendChild(audienceRow);

    const aiBtn = document.createElement('button');
    aiBtn.className   = 'sh-intent-ai-btn';
    aiBtn.type        = 'button';
    aiBtn.textContent = '✦ Suggest Layout';
    aiBtn.addEventListener('click', () => {
        const intent = textarea.value.trim() || '(no intent set)';
        console.log(`[SheetEditorPanel SC-7] AI layout suggestion requested for: "${intent}"`);
        aiBtn.textContent = '✦ Suggesting…';
        aiBtn.disabled    = true;
        setTimeout(() => { aiBtn.textContent = '✦ Suggest Layout'; aiBtn.disabled = false; }, 1500);
    });
    sec.appendChild(aiBtn);

    return sec;
}

// ── Revision form ──────────────────────────────────────────────────────────

export function buildRevisionFormEl(
    sheetId:   string,
    onDone:    () => void,
): HTMLElement {
    const form = document.createElement('div');
    form.className = 'sh-revision-form';

    const mkInput = (placeholder: string): HTMLInputElement => {
        const i = document.createElement('input');
        i.className   = 'sh-prop-input';
        i.placeholder = placeholder;
        i.type        = 'text';
        return i;
    };

    const codeInput = mkInput('Code (e.g. B)');
    const descInput = mkInput('Description');
    const dateInput = mkInput(`Date (${new Date().toLocaleDateString('en-GB')})`);
    const byInput   = mkInput('Issued by');

    dateInput.value = new Date().toLocaleDateString('en-GB');

    form.appendChild(codeInput);
    form.appendChild(descInput);
    form.appendChild(dateInput);
    form.appendChild(byInput);

    const actions = document.createElement('div');
    actions.className = 'sh-revision-form-actions';

    const saveBtn = document.createElement('button');
    saveBtn.className   = 'sh-revision-form-btn sh-revision-form-btn--primary';
    saveBtn.type        = 'button';
    saveBtn.textContent = 'Add';

    const cancelBtn = document.createElement('button');
    cancelBtn.className   = 'sh-revision-form-btn';
    cancelBtn.type        = 'button';
    cancelBtn.textContent = 'Cancel';

    const doSave = () => {
        if (!(window as any).__pryzmInitComplete) {
            console.error('[SheetEditorCommands] Engine not yet initialised — command ignored: buildRevisionFormEl/doSave');
            return;
        }
        const code = codeInput.value.trim();
        const desc = descInput.value.trim();
        const date = dateInput.value.trim();
        const by   = byInput.value.trim();
        if (!code) { codeInput.focus(); return; }
        if (!date) { dateInput.focus(); return; }
        const cmd = new AddRevisionToSheetCommand({
            sheetId,
            revisionId:  `rev-${crypto.randomUUID()}`,
            code,
            description: desc,
            date,
            issuedBy:    by,
        });
        const mgr = window.commandManager; // TODO(E.5.x): replace with runtime.bus.executeCommand — Phase E.5.x
        if (mgr) mgr.execute(cmd, { source: 'HUMAN_DIRECT' });
        onDone();
    };

    saveBtn.addEventListener('click', doSave);
    cancelBtn.addEventListener('click', onDone);
    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    form.appendChild(actions);

    // D.7.5 batch #2: routed through getFrameScheduler() instead of raw rAF.
    getFrameScheduler().scheduleOnce('sheet-editor-code-input-focus', () => codeInput.focus());
    return form;
}

// ── SC-3: Inline scale overlay ─────────────────────────────────────────────

export function buildInlineScaleOverlay(
    vp:       SheetViewport,
    sheet:    SheetDefinition,
    viewType: string,
): HTMLElement {
    const currentScale = vp.scale ?? 50;
    const PRESETS = viewType === 'elevation' || viewType === 'section'
        ? [10, 20, 50, 100, 200]
        : [20, 50, 100, 200, 500];

    const bar = document.createElement('div');
    Object.assign(bar.style, {
        position:    'absolute',
        top:         '-32px',
        left:        '0',
        display:     'flex',
        alignItems:  'center',
        gap:         '3px',
        background:  'rgba(22,26,34,0.88)',
        border:      '1px solid rgba(255,255,255,0.12)',
        borderRadius:'5px',
        padding:     '3px 6px',
        fontSize:    '10px',
        color:       '#e2e8f0',
        whiteSpace:  'nowrap',
        zIndex:      '20',
        userSelect:  'none',
    });

    const lbl = document.createElement('span');
    lbl.textContent     = 'Scale:';
    lbl.style.marginRight = '3px';
    lbl.style.opacity   = '0.6';
    bar.appendChild(lbl);

    const apply = (n: number) => {
        if (n === currentScale) return;
        if (!(window as any).__pryzmInitComplete) {
            console.error('[SheetEditorCommands] Engine not yet initialised — command ignored: buildInlineScaleOverlay/apply');
            return;
        }
        const mgr = window.commandManager; // TODO(E.5.x): replace with runtime.bus.executeCommand — Phase E.5.x
        if (mgr) mgr.execute(
            new UpdateViewportScaleCommand(sheet.id, vp.id, n),
            { source: 'HUMAN_DIRECT' },
        );
    };

    for (const p of PRESETS) {
        const btn = document.createElement('button');
        btn.type        = 'button';
        btn.textContent = `1:${p}`;
        Object.assign(btn.style, {
            background:   p === currentScale ? '#4b7cf3' : 'rgba(255,255,255,0.08)',
            color:        '#e2e8f0',
            border:       p === currentScale ? '1px solid #4b7cf3' : '1px solid rgba(255,255,255,0.12)',
            borderRadius: '3px',
            padding:      '1px 5px',
            cursor:       'pointer',
            fontSize:     '10px',
        });
        btn.addEventListener('click', (e) => { e.stopPropagation(); apply(p); });
        bar.appendChild(btn);
    }

    const ci = document.createElement('input');
    ci.type        = 'number';
    ci.min         = '1';
    ci.max         = '5000';
    ci.value       = PRESETS.includes(currentScale) ? '' : String(currentScale);
    ci.placeholder = 'N…';
    Object.assign(ci.style, {
        width:        '42px',
        background:   'rgba(255,255,255,0.08)',
        color:        '#e2e8f0',
        border:       '1px solid rgba(255,255,255,0.12)',
        borderRadius: '3px',
        padding:      '1px 4px',
        fontSize:     '10px',
    });
    ci.addEventListener('click', e => e.stopPropagation());
    ci.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { const v = parseInt(ci.value, 10); if (v > 0) apply(v); }
    });
    ci.addEventListener('blur', () => {
        const v = parseInt(ci.value, 10);
        if (v > 0 && v !== currentScale) apply(v);
    });
    bar.appendChild(ci);

    return bar;
}

// ── SC-11: Edit-in-Place ───────────────────────────────────────────────────

export function enterEditInPlace(
    vpId:          string,
    viewId:        string,
    closeFn:       () => void,
    activeSheetId: string | null,
): void {
    const vc = window.viewController; // TODO(D.4): replace with runtime.scene.viewController — Phase D.4
    if (!vc || typeof vc.activate !== 'function') {
        console.warn('[SheetEditorCommands] viewController.activate not available');
        return;
    }

    const viewDef = viewDefinitionStore.get(viewId);
    const sheetId = activeSheetId;

    closeFn();
    try {
        vc.activate(viewId);
    } catch (err) {
        console.error('[SheetEditorCommands] activate() failed:', err);
    }

    setTimeout(() => {
        const threeCanvas =
            (document.getElementById('pryzm-canvas') as HTMLCanvasElement | null) ??
            (document.querySelector('canvas[data-engine]') as HTMLCanvasElement | null) ??
            (document.querySelector('canvas') as HTMLCanvasElement | null);
        if (threeCanvas) {
            threeCanvas.focus({ preventScroll: true });
            threeCanvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
        }
    }, 80);

    window.__sheetEditorPreviousSheet = sheetId; // TODO(F.6.5): panel-host registry bridge state — Phase F.6.5

    document.getElementById('sh-edit-in-place-banner')?.remove();

    const banner = document.createElement('div');
    banner.id = 'sh-edit-in-place-banner';
    Object.assign(banner.style, {
        position:     'fixed',
        bottom:       '0',
        left:         '50%',
        transform:    'translateX(-50%)',
        display:      'flex',
        alignItems:   'center',
        gap:          '10px',
        background:   'rgba(22,26,34,0.95)',
        color:        '#e2e8f0',
        padding:      '8px 20px 10px',
        borderRadius: '8px 8px 0 0',
        fontSize:     '12px',
        zIndex:       '99990',
        boxShadow:    '0 -2px 16px rgba(0,0,0,0.35)',
        borderTop:    '2px solid #4b7cf3',
        userSelect:   'none',
    });

    const dot = document.createElement('span');
    Object.assign(dot.style, {
        display:      'inline-block',
        width:        '8px',
        height:       '8px',
        borderRadius: '50%',
        background:   '#4b7cf3',
        flexShrink:   '0',
        animation:    'sh-eip-pulse 1.8s ease-in-out infinite',
    });

    if (!document.getElementById('sh-eip-keyframe')) {
        const style = document.createElement('style');
        style.id          = 'sh-eip-keyframe';
        style.textContent = `
            @keyframes sh-eip-pulse {
                0%, 100% { opacity: 1; }
                50%       { opacity: 0.35; }
            }`;
        document.head.appendChild(style);
    }

    const lbl = document.createElement('span');
    lbl.style.opacity = '0.65';
    lbl.textContent   = 'Edit-in-Place:';

    const viewName = document.createElement('span');
    viewName.style.fontWeight = '600';
    viewName.textContent      = viewDef?.name ?? 'View';

    const sep = document.createElement('span');
    sep.style.cssText = 'width:1px;height:14px;background:rgba(255,255,255,0.15);flex-shrink:0;';

    const returnBtn = document.createElement('button');
    Object.assign(returnBtn.style, {
        background:   '#4b7cf3',
        color:        '#fff',
        border:       'none',
        borderRadius: '4px',
        padding:      '3px 10px',
        fontSize:     '11px',
        cursor:       'pointer',
        fontWeight:   '600',
        whiteSpace:   'nowrap',
    });
    returnBtn.textContent = '← Return to Sheet';
    returnBtn.title       = 'Return to the sheet editor (ESC)';

    const escHint = document.createElement('span');
    escHint.style.cssText = 'font-size:10px;opacity:0.4;';
    escHint.textContent   = '(ESC)';

    banner.appendChild(dot);
    banner.appendChild(lbl);
    banner.appendChild(viewName);
    banner.appendChild(sep);
    banner.appendChild(returnBtn);
    banner.appendChild(escHint);
    document.body.appendChild(banner);

    const returnToSheet = () => {
        banner.remove();
        escListener && document.removeEventListener('keydown', escListener);
        window.__sheetEditorPreviousSheet = null; // TODO(F.6.5): panel-host registry bridge state — Phase F.6.5
        if (sheetId) {
            const panel = window.sheetEditorPanel; // TODO(F.6.5): panel-host registry bridge — Phase F.6.5
            if (panel && typeof panel.open === 'function') {
                panel.open(sheetId);
            }
        }
    };

    returnBtn.addEventListener('click', returnToSheet);

    const escListener = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && document.getElementById('sh-edit-in-place-banner')) {
            e.stopImmediatePropagation();
            returnToSheet();
        }
    };
    document.addEventListener('keydown', escListener, { capture: true });

    console.log(
        `[SheetEditorCommands] Edit-in-Place — vpId=${vpId} activated view="${viewDef?.name ?? viewId}" ` +
        `from sheet="${sheetId}" — banner shown, ESC / Return button to go back`,
    );
}
