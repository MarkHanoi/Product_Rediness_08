/**
 * validateLayoutTestModal.ts — dev-only modal that lets a user paste a
 * D-TGL apartment-layout DTO and run it through `validateAndFormatLayout`
 * (the apartment validator framework) without opening DevTools.
 *
 * Surface counterpart of the DevTools helper installed by
 * `apps/editor/src/dev/installPryzmTestFunctions.ts` (`__pryzmValidateLayout`).
 *
 * Strict scope:
 *   • Uses the `@pryzm/ai-host/validators/validate-and-format` subpath export
 *     — does NOT inline the validator pipeline.
 *   • Native `<dialog>` element + vanilla DOM. No framework imports.
 *   • All styles inline / scoped to the modal. No global CSS injection.
 *   • No mutations to stores, commands, runtime — read-only test surface.
 *   • No `(window as any)`; `openValidateLayoutTestModal` is a local helper.
 */

import { validateAndFormatLayout } from '@pryzm/ai-host/validators/validate-and-format';

// ── Sample fixture (mirrors __pryzmSampleLayoutDto in installPryzmTestFunctions.ts) ──

const SAMPLE_LAYOUT_DTO = {
    rooms: [
        { id: 'living',   type: 'living_room',     rect: { w: 5,   h: 6 },   externalFrontageM: 5, hasExteriorEdge: true,  glazedAreaM2: 4 },
        { id: 'kitchen',  type: 'kitchen',         rect: { w: 4,   h: 3 },   externalFrontageM: 3, hasExteriorEdge: true,  glazedAreaM2: 2 },
        { id: 'master',   type: 'master_bedroom',  rect: { w: 4,   h: 4 },   externalFrontageM: 4, hasExteriorEdge: true,  glazedAreaM2: 2 },
        { id: 'bathroom', type: 'bathroom',        rect: { w: 2,   h: 2.5 }, externalFrontageM: 0, hasExteriorEdge: false, glazedAreaM2: 0 },
    ],
    edges: [
        { aId: 'living', bId: 'kitchen' },
        { aId: 'living', bId: 'master' },
        { aId: 'master', bId: 'bathroom' },
    ],
    entranceRoomId: 'living',
};

const SAMPLE_JSON_TEXT = JSON.stringify(SAMPLE_LAYOUT_DTO, null, 2);

// ── Inline styles (scoped via id) ────────────────────────────────────────────

const DIALOG_STYLE_ID = 'pryzm-validate-layout-modal-style';

function ensureStyle(): void {
    if (document.getElementById(DIALOG_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = DIALOG_STYLE_ID;
    style.textContent = `
        dialog.vltm-dialog {
            width: 700px; max-width: 92vw; max-height: 86vh;
            padding: 0; border: 1px solid #444; border-radius: 8px;
            background: #1e1e1e; color: #e0e0e0;
            font-family: var(--app-font, system-ui, sans-serif);
            box-shadow: 0 8px 32px rgba(0,0,0,.6);
        }
        dialog.vltm-dialog::backdrop { background: rgba(0,0,0,.5); }
        .vltm-body { display: flex; flex-direction: column; max-height: 86vh; }
        .vltm-header {
            padding: 12px 16px; border-bottom: 1px solid #333;
            display: flex; align-items: center; justify-content: space-between;
            background: linear-gradient(90deg, #1a3a4a, #1e1e1e);
        }
        .vltm-title { font-size: 14px; font-weight: 600; margin: 0; }
        .vltm-close {
            background: transparent; color: #aaa; border: none;
            font-size: 18px; cursor: pointer; padding: 0 4px;
        }
        .vltm-close:hover { color: #fff; }
        .vltm-content {
            padding: 12px 16px; overflow-y: auto; flex: 1;
            display: flex; flex-direction: column; gap: 10px;
        }
        .vltm-row { display: flex; gap: 8px; align-items: center; }
        .vltm-label { font-size: 11px; color: #aaa; text-transform: uppercase; letter-spacing: .04em; }
        .vltm-textarea {
            width: 100%; min-height: 220px; max-height: 360px;
            font-family: ui-monospace, Menlo, Consolas, monospace;
            font-size: 11px; line-height: 1.4;
            background: #111; color: #d0d0d0; border: 1px solid #333;
            border-radius: 4px; padding: 8px; resize: vertical;
            box-sizing: border-box;
        }
        .vltm-btn {
            background: #6600ff; color: #fff; border: none; border-radius: 4px;
            padding: 6px 14px; font-size: 12px; cursor: pointer; font-weight: 500;
        }
        .vltm-btn:hover { background: #7a1aff; }
        .vltm-btn--secondary { background: #333; color: #e0e0e0; }
        .vltm-btn--secondary:hover { background: #444; }
        .vltm-result { margin-top: 4px; display: flex; flex-direction: column; gap: 8px; }
        .vltm-summary-line {
            font-size: 12px; font-weight: 600; padding: 6px 8px;
            background: #0f0f0f; border: 1px solid #2a2a2a; border-radius: 4px;
            color: #d0d0d0; font-family: ui-monospace, Menlo, Consolas, monospace;
        }
        .vltm-legality {
            font-size: 12px; font-weight: 600; padding: 6px 10px;
            border-radius: 4px; display: inline-block;
        }
        .vltm-legality--pass { background: #1a3d2a; color: #6fdc8c; }
        .vltm-legality--fail { background: #3d1a1a; color: #ff8a8a; }
        .vltm-pre {
            background: #0a0a0a; color: #d6d6d6; border: 1px solid #2a2a2a;
            border-radius: 4px; padding: 10px; font-size: 11px; line-height: 1.45;
            font-family: ui-monospace, Menlo, Consolas, monospace;
            max-height: 320px; overflow: auto; white-space: pre-wrap;
            word-break: break-word;
        }
        .vltm-error-inline {
            color: #ff8a8a; font-size: 11px; padding: 6px 8px;
            background: #2a1010; border: 1px solid #4a1a1a; border-radius: 4px;
        }
    `;
    document.head.appendChild(style);
}

// ── Public entry ─────────────────────────────────────────────────────────────

export function openValidateLayoutTestModal(): void {
    ensureStyle();

    const dialog = document.createElement('dialog');
    dialog.className = 'vltm-dialog';

    const body = document.createElement('div');
    body.className = 'vltm-body';
    dialog.appendChild(body);

    // Header
    const header = document.createElement('div');
    header.className = 'vltm-header';
    const title = document.createElement('h2');
    title.className = 'vltm-title';
    title.textContent = 'Test Layout Validator (dev)';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'vltm-close';
    closeBtn.textContent = '×';
    closeBtn.title = 'Close';
    closeBtn.addEventListener('click', () => dialog.close());
    header.appendChild(title);
    header.appendChild(closeBtn);
    body.appendChild(header);

    // Content
    const content = document.createElement('div');
    content.className = 'vltm-content';
    body.appendChild(content);

    const label = document.createElement('div');
    label.className = 'vltm-label';
    label.textContent = 'Apartment layout DTO (D-TGL shape)';
    content.appendChild(label);

    const textarea = document.createElement('textarea');
    textarea.className = 'vltm-textarea';
    textarea.spellcheck = false;
    textarea.value = SAMPLE_JSON_TEXT;
    content.appendChild(textarea);

    const row = document.createElement('div');
    row.className = 'vltm-row';
    const runBtn = document.createElement('button');
    runBtn.type = 'button';
    runBtn.className = 'vltm-btn';
    runBtn.textContent = 'Run Validator';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'vltm-btn vltm-btn--secondary';
    copyBtn.textContent = 'Copy Sample DTO';
    copyBtn.addEventListener('click', () => { textarea.value = SAMPLE_JSON_TEXT; });

    const closeFooterBtn = document.createElement('button');
    closeFooterBtn.type = 'button';
    closeFooterBtn.className = 'vltm-btn vltm-btn--secondary';
    closeFooterBtn.textContent = 'Close';
    closeFooterBtn.addEventListener('click', () => dialog.close());

    row.appendChild(runBtn);
    row.appendChild(copyBtn);
    row.appendChild(closeFooterBtn);
    content.appendChild(row);

    const resultArea = document.createElement('div');
    resultArea.className = 'vltm-result';
    content.appendChild(resultArea);

    // Run handler
    runBtn.addEventListener('click', () => {
        resultArea.innerHTML = '';

        let parsed: unknown;
        try {
            parsed = JSON.parse(textarea.value);
        } catch (err) {
            const errEl = document.createElement('div');
            errEl.className = 'vltm-error-inline';
            errEl.textContent = `JSON parse error: ${String((err as Error).message ?? err)}`;
            resultArea.appendChild(errEl);
            return;
        }

        let result: ReturnType<typeof validateAndFormatLayout>;
        try {
            // The adapter accepts the DTO shape directly; cast through `unknown`
            // because the DevTools surface takes any pasted JSON.
            result = validateAndFormatLayout(
                parsed as Parameters<typeof validateAndFormatLayout>[0],
            );
        } catch (err) {
            const errEl = document.createElement('div');
            errEl.className = 'vltm-error-inline';
            errEl.textContent = `Validator threw: ${String((err as Error).message ?? err)}`;
            resultArea.appendChild(errEl);
            return;
        }

        // Summary line
        const summary = document.createElement('div');
        summary.className = 'vltm-summary-line';
        summary.textContent = result.summaryLine;
        resultArea.appendChild(summary);

        // Legality verdict
        const legality = document.createElement('div');
        legality.className = result.passesLegality
            ? 'vltm-legality vltm-legality--pass'
            : 'vltm-legality vltm-legality--fail';
        legality.textContent = result.passesLegality
            ? '✓ Passes legality gate'
            : '✗ Fails legality gate';
        resultArea.appendChild(legality);

        // Markdown report
        const reportLabel = document.createElement('div');
        reportLabel.className = 'vltm-label';
        reportLabel.textContent = 'Markdown report';
        resultArea.appendChild(reportLabel);

        const pre = document.createElement('pre');
        pre.className = 'vltm-pre';
        pre.textContent = result.markdownReport;
        resultArea.appendChild(pre);
    });

    // Mount + clean up on close
    document.body.appendChild(dialog);
    dialog.addEventListener('close', () => {
        dialog.remove();
    });
    dialog.showModal();
}
