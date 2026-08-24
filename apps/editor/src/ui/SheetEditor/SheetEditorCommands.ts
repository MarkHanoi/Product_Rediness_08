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
import { MoveViewportCommand } from '@pryzm/command-registry';
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
import { SetViewportCropCommand } from '@pryzm/command-registry';
// §SHEET-RESIZE-IS-A-CROP (L-3809) — a viewport has no size of its own, so a
// resize handle changes what it SHOWS. The arithmetic is the inverse of the
// composer's framing and lives beside it, never duplicated here.
import { resizeCropByEdgeDelta, currentCropFromComposition } from '@pryzm/file-format/sheets';
import type { EdgeDeltaMm } from '@pryzm/file-format/sheets';
import { titleBlockStore } from '@pryzm/core-app-model';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import { layoutEngine } from '@pryzm/core-app-model';
import type { LayoutPresetKey } from '@pryzm/core-app-model';
import type { DataPanel } from '@pryzm/core-app-model';

// ── §SHEET-DISPATCH-SEAM (L-10340) ─────────────────────────────────────────
//
// The ONE place this module reaches the legacy command manager.
//
// Thirteen dispatchers each carried the identical preamble: read the global,
// warn when it is absent, execute, and (in eleven of the thirteen) drop the
// result on the floor. Two of the thirteen were added on 2026-08-21/22 by
// copying the eleven above them — which is how a shrink-only P6 ratchet moved
// BACKWARDS without any lane intending a new bypass (L-10340).
//
// Collapsing them is not a rename dodge: there is now genuinely ONE dispatch,
// so the Phase E.5.x migration named in all thirteen TODOs becomes an edit to
// this function rather than thirteen separate edits.
//
// ⚠ WHY `runtime.bus.executeCommand` IS NOT USED HERE YET — measured, not
// assumed (L-10340):
//   • it is `async` and returns `Promise<EventRecord>`, while every caller
//     below is synchronous and two of them return a value to their caller;
//   • it THROWS its refusal (`CommandBus.executeCommand` converts a failed
//     `canExecute` into a thrown error) rather than returning it, so the
//     resize arm at the bottom of this file could not read `res.success`;
//   • ⭐ for the three verbs that ARE bridged, the bus route ENDS AT THIS SAME
//     CALL. `initBusHandlers.ts` registers `sheet.addViewport`, `sheet.create`
//     and `sheet.moveViewport` as `fn: (cmd) => { _cmExec(new
//     AddViewportToSheetCommand(cmd)); }` — the SAME legacy Command classes
//     constructed below, dispatched through `_cmExec`, whose body is
//     `window.commandManager` + `cm.execute`. Routing there would relocate the
//     legacy call into the one file the ratchet excludes, and would ADDITIONALLY
//     discard the verdict, because `_cmExec` is declared `: void`.
//   • the other ten commands below (export, layout preset, data panel, intent,
//     revision, scale, crop) have NO bridge at all, and `'sheet.executeCommand'`
//     — the generic escape hatch declared in `packages/command-bus/src/commands.ts`
//     — is bridged by nothing.
//   • `plugins/sheets`' own ten `sheet.*` handlers are NOT a route either: their
//     `registerSheetHandlers()` has ZERO production callers and is deliberately
//     left unregistered (L-1590, §FIX-SHEET-ADDVIEWPORT-SHADOW MT-03) because it
//     writes a DETACHED DTO shadow store rather than the authoritative
//     `core-app-model` sheetStore.
// Until a sheet verb writes the authoritative store AND returns its refusal
// synchronously, this seam IS the route.
interface SheetDispatch {
    /** FALSE when the command manager was absent, so nothing was dispatched. */
    readonly dispatched: boolean;
    /** The legacy CommandResult — read by the callers that report a refusal. */
    readonly result?: { success?: boolean; error?: string } | undefined;
}

function dispatchSheetCommand(
    label: string,
    cmd:   unknown,
    meta:  unknown = { source: 'HUMAN_DIRECT' },
): SheetDispatch {
    const mgr = window.commandManager as unknown as
        | { execute(c: unknown, o?: unknown): { success?: boolean; error?: string } | undefined }
        | undefined;
    if (!mgr || typeof mgr.execute !== 'function') {
        console.warn(`[SheetEditorCommands] commandManager not available — ${label} dropped`);
        return { dispatched: false };
    }
    return { dispatched: true, result: mgr.execute(cmd, meta) };
}

// ── Core mutation dispatchers ──────────────────────────────────────────────

/**
 * Place a view on a sheet.
 *
 * §SHEET-DROP-WHERE-THE-CURSOR-IS (L-1632) — `position` is now an explicit
 * argument. Without it the caller had no way to say WHERE, so every placement
 * landed on a fixed 30 mm cascade off the sheet origin: the founder's
 * "it works by selecting and being placed automatically somewhere".
 * Omitting it preserves that cascade, which is still the right behaviour for a
 * click (there is no cursor position to honour in a click on a list row).
 */
export function dispatchAddViewport(
    sheet:    SheetDefinition,
    view:     ViewDefinition,
    position?: { x: number; y: number },
): void {
    if (!window.__pryzmInitComplete) {
        console.error('[SheetEditorCommands] Engine not yet initialised — command ignored: dispatchAddViewport');
        return;
    }
    const offset = sheet.viewports.length * 30;
    const cmd = new AddViewportToSheetCommand({
        sheetId:    sheet.id,
        viewportId: `vp-${crypto.randomUUID()}`,
        viewId:     view.id,
        position:   position ?? { x: 50 + offset, y: 100 + offset },
        scale:      view.output?.scale ?? 50,
        viewType:   view.viewType,
    });
    if (!dispatchSheetCommand('dispatchAddViewport', cmd).dispatched) return;
    console.log(
        `[SheetEditorCommands] Added view "${view.name}" to sheet "${sheet.sheetNumber}"` +
        (position ? ` at (${position.x.toFixed(1)}, ${position.y.toFixed(1)})mm` : ' (auto-placed)'),
    );
}

/**
 * Move a placed viewport.
 *
 * §SHEET-MOVE-DISPATCH-IS-DEAD (L-1633) — THE ROOT CAUSE of the founder's
 * "I can move the view but it doesn't stay in place".
 *
 * The panel had two `sheet.moveViewport` dispatch sites (drag mouse-up and
 * arrow-key nudge) and both read `(this.runtime?.bus as any)?.executeCommand(…)`.
 * `initUI.ts` constructs the panel as `new mod.SheetEditorPanel()` — no runtime
 * argument — so `this.runtime` is `null`, and BOTH optional chains short-circuited to
 * `undefined`. No command, no store write, no error, no log: the drag repainted
 * `style.left/top` locally and the very next canvas rebuild read the unchanged
 * store and snapped the viewport back.
 *
 * That is exactly [committed ≠ reachable]: the verb was routed
 * (`initBusHandlers.ts` bridges `sheet.moveViewport` → `MoveViewportCommand`),
 * the command was correct, the store method was correct — and the UI reached
 * none of it. Optional chaining is what made it silent; a nullish bus should
 * have been loud.
 *
 * This dispatcher is the ONE producer of the move verb for this panel and takes
 * the same route its working siblings take (`dispatchRemoveViewport`,
 * `SheetEditorSidebar`'s nudge buttons), which is also where the bus bridge
 * lands anyway — `sheet.moveViewport`'s handler is `_cmExec(new
 * MoveViewportCommand(…))`.
 *
 * Returns true when the command was dispatched, so callers can tell "moved" from
 * "silently dropped" — the distinction this defect erased.
 */
export function dispatchMoveViewport(
    sheetId:     string,
    vpId:        string,
    newPosition: { x: number; y: number },
): boolean {
    if (!window.__pryzmInitComplete) {
        console.error('[SheetEditorCommands] Engine not yet initialised — command ignored: dispatchMoveViewport');
        return false;
    }
    return dispatchSheetCommand(
        'dispatchMoveViewport',
        new MoveViewportCommand(sheetId, vpId, newPosition),
    ).dispatched;
}

export function dispatchRemoveViewport(sheetId: string, vpId: string): void {
    if (!window.__pryzmInitComplete) {
        console.error('[SheetEditorCommands] Engine not yet initialised — command ignored: dispatchRemoveViewport');
        return;
    }
    const cmd = new RemoveViewportFromSheetCommand(sheetId, vpId);
    if (!dispatchSheetCommand('dispatchRemoveViewport', cmd).dispatched) return;
    console.log(`[SheetEditorCommands] Removed viewport ${vpId}`);
}

export function dispatchUpdateSheetField(sheetId: string, key: string, value: string): void {
    if (!window.__pryzmInitComplete) {
        console.error('[SheetEditorCommands] Engine not yet initialised — command ignored: dispatchUpdateSheetField');
        return;
    }
    const patch: Record<string, string> = { [key]: value };
    const cmd = new UpdateSheetCommand(sheetId, patch as any);
    dispatchSheetCommand('dispatchUpdateSheetField', cmd);
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
        if (!window.__pryzmInitComplete) {
            console.error('[SheetEditorCommands] Engine not yet initialised — command ignored: showExportDialog/confirmBtn');
            return;
        }
        const cmd = new ExportSheetCommand({
            sheetId: sheet.id,
            format:  selectedFormat,
            dpi:     selectedFormat === 'png' ? parseInt(dpiInput.value, 10) || 150 : undefined,
        });
        if (!dispatchSheetCommand('showExportDialog/export', cmd).dispatched) return;
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
            if (!window.__pryzmInitComplete) {
                console.error('[SheetEditorCommands] Engine not yet initialised — command ignored: buildLayoutSection/presetBtn');
                return;
            }
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
            dispatchSheetCommand('buildLayoutPresetSection/apply', cmd);
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
            if (!window.__pryzmInitComplete) {
                console.error('[SheetEditorCommands] Engine not yet initialised — command ignored: buildDataPanelSection/addBtn');
                return;
            }
            const panel: DataPanel = {
                id:        crypto.randomUUID(),
                panelType: t.type,
                position:  { x: 20, y: 20 },
                size:      { w: 80, h: 60 },
                query:     t.type === 'metric' ? 'walls' : undefined,
            };
            const cmd = new AddDataPanelToSheetCommand({ sheetId: sheet.id, panel });
            dispatchSheetCommand('buildDataPanelSection/add', cmd);
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
                if (!window.__pryzmInitComplete) {
                    console.error('[SheetEditorCommands] Engine not yet initialised — command ignored: buildDataPanelSection/removeBtn');
                    return;
                }
                const cmd = new RemoveDataPanelFromSheetCommand({ sheetId: sheet.id, panelId: panel.id });
                dispatchSheetCommand('buildDataPanelSection/remove', cmd);
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
        if (!window.__pryzmInitComplete) {
            console.error('[SheetEditorCommands] Engine not yet initialised — command ignored: buildIntentSection/textarea.change');
            return;
        }
        const cmd = new SetSheetCompositionIntentCommand({
            sheetId:           sheet.id,
            compositionIntent: textarea.value.trim(),
            audience:          audienceSelect.value as any || undefined,
        });
        dispatchSheetCommand('buildIntentSection/textarea', cmd);
    });
    sec.appendChild(textarea);

    const audienceRow = document.createElement('div');
    audienceRow.className = 'sh-audience-row';
    const audienceLabel = document.createElement('div');
    audienceLabel.className   = 'sh-audience-label';
    audienceLabel.textContent = 'Audience:';
    audienceSelect.addEventListener('change', () => {
        if (!window.__pryzmInitComplete) {
            console.error('[SheetEditorCommands] Engine not yet initialised — command ignored: buildIntentSection/audienceSelect.change');
            return;
        }
        const cmd = new SetSheetCompositionIntentCommand({
            sheetId:  sheet.id,
            audience: audienceSelect.value as any || undefined,
        });
        dispatchSheetCommand('buildIntentSection/audience', cmd);
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
        if (!window.__pryzmInitComplete) {
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
        dispatchSheetCommand('buildRevisionForm/save', cmd);
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
        if (!window.__pryzmInitComplete) {
            console.error('[SheetEditorCommands] Engine not yet initialised — command ignored: buildInlineScaleOverlay/apply');
            return;
        }
        dispatchSheetCommand(
            'buildInlineScaleOverlay/apply',
            new UpdateViewportScaleCommand(sheet.id, vp.id, n),
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

// ── §SHEET-DBLCLICK-STAYS-ON-THE-SHEET (L-1866) — the RETURN half of SC-11 ──

/**
 * Show the "← Return to Sheet" banner after the user has left a sheet to open a
 * view in the main editor.
 *
 * ─── WHAT THIS REPLACED, AND WHAT WAS KEPT ─────────────────────────────────
 * This was `enterEditInPlace(vpId, viewId, closeFn, activeSheetId)`, which did
 * two jobs. One of them was BROKEN and one of them was GOOD, and they were
 * welded together:
 *
 *   · BROKEN — it called `viewController.activate(viewId)`. `activate()` is
 *     declared `(view: OBC.View | ViewMode)` where ViewMode is
 *     `'3D' | 'Top' | 'Ceiling' | 'ceiling-plan' | 'Front' | 'Back' | 'Left' |
 *     'Right'`. A ViewDefinition id such as `vd-sys-3d-1` is not a ViewMode and
 *     never was; it survived only because the sole caller reached it for 3D
 *     views, where the failure is invisible. That job now belongs to
 *     `activateViewForEditing()`, which resolves the mode first and reports a
 *     discriminated outcome.
 *   · GOOD — the banner. A user who has been taken out of the sheet needs a way
 *     back, and ESC / a button is it. Deleting the whole function to remove the
 *     broken half would have removed this too, and left the new
 *     "Open in main editor" button as a one-way door.
 *
 * So the function was SPLIT rather than deleted. It no longer activates
 * anything, no longer closes anything, and no longer decides anything — the
 * caller has already done all three by the time it runs.
 */
export function showReturnToSheetBanner(
    viewId:        string,
    activeSheetId: string | null,
): void {
    const viewDef = viewDefinitionStore.get(viewId);
    const sheetId = activeSheetId;

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
    lbl.textContent   = 'Editing view:';

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
        `[SheetEditorCommands] Return-to-sheet banner shown for view="${viewDef?.name ?? viewId}" ` +
        `from sheet="${sheetId}" — ESC / Return button to go back`,
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// §SHEET-RESIZE-IS-A-CROP (L-3809) — the eight resize handles
// ─────────────────────────────────────────────────────────────────────────────

/** Which edges a compass handle drives. */
const HANDLE_EDGES: Record<string, ReadonlyArray<'left' | 'right' | 'top' | 'bottom'>> = {
    nw: ['left', 'top'],
    ne: ['right', 'top'],
    sw: ['left', 'bottom'],
    se: ['right', 'bottom'],
    n:  ['top'],
    s:  ['bottom'],
    e:  ['right'],
    w:  ['left'],
};

/**
 * Build the eight resize handles for a selected viewport.
 *
 * ⛔ THIS FUNCTION EXISTS BECAUSE ITS CSS ALREADY DID. Measured before writing
 * it: `grep -rn "sh-resize-handle"` returned NINE hits, every one of them in
 * `apps/editor/src/ui/styles/panels/sheetEditor.ts` — a base class and eight
 * compass cursor rules, fully authored — and ZERO producers of an element to
 * wear them. The stylesheet described a complete feature that had never
 * existed [authored-but-unwired]. The class names below are the ones already in
 * that stylesheet, deliberately, so the CSS acquires the producer it was
 * written for rather than a second, parallel one.
 *
 * ─── WHAT A DRAG DOES ──────────────────────────────────────────────────────
 * It dispatches `SetViewportCropCommand`. A viewport has no size of its own —
 * it is exactly as big as the drawing it shows at the scale it shows it at — so
 * the only honest meaning of "make this viewport wider" is "show more drawing".
 * `resizeCropByEdgeDelta` is the arithmetic; its header records the two
 * alternatives that were rejected (rescale, and stretch).
 *
 * ⭐ THE SCALE IS NEVER TOUCHED, WHICH IS THE WHOLE POINT. Dragging a handle
 * changes WHAT IS SHOWN and never HOW BIG IT IS DRAWN, so the printed `1:N`
 * stays true through any gesture. A resize that quietly rescaled would make
 * every dimension on the drawing wrong.
 *
 * @param vp          the viewport being resized.
 * @param sheet       its sheet.
 * @param scaleFactor CSS pixels per paper millimetre, from the panel's canvas
 *                    fit. The gesture happens in pixels and the model is in
 *                    millimetres; this is the only conversion between them.
 * @param composed    the composition currently on screen. Supplies the frame an
 *                    UNCROPPED viewport is showing, so the first drag is a copy
 *                    of what the user is looking at rather than a jump.
 * @param onCommitted called after a successful dispatch so the panel can rebuild.
 */
export function buildResizeHandles(
    vp:          SheetViewport,
    sheet:       SheetDefinition,
    scaleFactor: number,
    composed:    { originX: number; originZ: number; widthMm: number; heightMm: number } | null,
    onCommitted: () => void,
): HTMLElement[] {
    // Without a composition there is no frame to resize FROM. Returning no
    // handles is correct and VISIBLE: a viewport whose drawing has not composed
    // yet shows no resize affordance, rather than one that silently does nothing
    // when dragged.
    if (!composed) return [];
    if (!(scaleFactor > 0) || !Number.isFinite(scaleFactor)) return [];

    const scaleDenom = vp.scale ?? 100;
    const baseCrop = vp.crop ?? currentCropFromComposition(composed, scaleDenom);
    if (!baseCrop) return [];

    return Object.keys(HANDLE_EDGES).map((dir) => {
        const h = document.createElement('div');
        h.className = `sh-resize-handle sh-resize-handle--${dir}`;
        h.dataset.resizeDir = dir;
        h.title = 'Drag to change what this viewport shows (the scale does not change)';

        h.addEventListener('pointerdown', (ev: PointerEvent) => {
            // A resize must never ALSO start a viewport move or a canvas
            // rubber-band selection; both are listening on ancestors.
            ev.stopPropagation();
            ev.preventDefault();

            const startX = ev.clientX;
            const startY = ev.clientY;
            const edges  = HANDLE_EDGES[dir] ?? [];
            let   last: ReturnType<typeof resizeCropByEdgeDelta> = null;

            const toDelta = (e: PointerEvent): EdgeDeltaMm => {
                // Pixels → paper millimetres. Screen Y grows DOWNWARD, which is
                // the direction `topMm` / `bottomMm` are already defined in, so
                // this needs no flip. The flip that DOES exist on this surface
                // (paper Y grows upward from the bottom-left) is not applied
                // here because `EdgeDeltaMm` is stated per EDGE precisely so
                // that no caller has to reason about it.
                const dxMm = (e.clientX - startX) / scaleFactor;
                const dyMm = (e.clientY - startY) / scaleFactor;
                const d: Record<string, number> = {};
                for (const edge of edges) {
                    if (edge === 'left')   d.leftMm   = dxMm;
                    if (edge === 'right')  d.rightMm  = dxMm;
                    if (edge === 'top')    d.topMm    = dyMm;
                    if (edge === 'bottom') d.bottomMm = dyMm;
                }
                return d as EdgeDeltaMm;
            };

            const onMove = (e: PointerEvent): void => {
                // Recomputed from the ORIGINAL crop every frame, never
                // accumulated from the previous result. Accumulating compounds
                // the refusal at the floor: once one frame is refused, an
                // incremental model has lost its origin and the gesture dies
                // mid-drag.
                last = resizeCropByEdgeDelta(baseCrop, scaleDenom, toDelta(e));
            };

            const onUp = (e: PointerEvent): void => {
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);

                last = resizeCropByEdgeDelta(baseCrop, scaleDenom, toDelta(e));
                if (!last) {
                    // REFUSED — the drag would have collapsed the viewport. The
                    // previous crop stands and nothing is dispatched, so the
                    // undo history does not fill with no-ops.
                    console.warn('[SheetEditorCommands] resize refused — would collapse the viewport');
                    return;
                }

                // ONE command per GESTURE, not per pointermove: a drag must be a
                // single undo step. That is why nothing dispatches in onMove.
                const { dispatched, result: res } = dispatchSheetCommand(
                    'viewportResize/commit',
                    new SetViewportCropCommand(sheet.id, vp.id, last),
                );
                if (!dispatched) {
                    console.error('[SheetEditorCommands] Engine not yet initialised — resize ignored');
                    return;
                }
                if (res && res.success === false) {
                    console.warn(`[SheetEditorCommands] resize refused: ${res.error ?? 'unknown reason'}`);
                    return;
                }
                onCommitted();
            };

            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
        });

        return h;
    });
}
