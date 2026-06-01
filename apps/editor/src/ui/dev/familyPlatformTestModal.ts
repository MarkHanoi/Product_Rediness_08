/**
 * familyPlatformTestModal.ts — dev-only modal that lets a user paste a
 * FamilyRequest JSON and run it through the Family Generation Pipeline
 * (`runFamilyPipeline`) without opening DevTools.
 *
 * Surface counterpart of the DevTools helper installed by
 * `apps/editor/src/dev/installPryzmTestFunctions.ts` (`__pryzmFamilyPipeline`).
 *
 * Strict scope:
 *   • Uses the existing root-barrel exports from `@pryzm/schemas`
 *     (`runFamilyPipeline`, `isPipelineSuccess`) — does NOT inline pipeline logic.
 *   • Native `<dialog>` element + vanilla DOM. No framework imports.
 *   • All styles inline / scoped to the modal. No global CSS injection.
 *   • No mutations to stores, commands, runtime — read-only test surface.
 *   • No `(window as any)`; `openFamilyPlatformTestModal` is a local helper.
 */

import { runFamilyPipeline, isPipelineSuccess } from '@pryzm/schemas';

// ── Sample fixture (mirrors __pryzmSampleFamilyRequest in installPryzmTestFunctions.ts) ─

const SAMPLE_FAMILY_REQUEST = {
    identity: {
        id: 'family/dev/sample-desk',
        name: 'Sample Desk',
        version: '1.0.0',
        author: 'PRYZM',
        license: 'MIT',
    },
    documentation: { pdfs: [], specSheets: [], referenceImages: [] },
    geometry: {
        dimensions: { widthM: 1.5, depthM: 0.75, heightM: 0.72 },
        parametricRanges: [
            { name: 'width', unit: 'm', min: 1.0, max: 2.2, defaultValue: 1.5 },
        ],
        hostedRelationship: { hostKind: 'none' },
    },
    behaviour: { movable: true, hosted: false, mountClass: 'floor' },
    constraints: { excludeWallTypes: [] },
    placement: {
        defaultAnchor: 'wall-longest',
        allowedAnchors: ['wall-longest'],
        excludedWalls: [],
    },
    bim: {
        entityType: 'IfcFurniture',
        predefinedType: 'DESK',
        psets: ['Pset_FurnitureTypeCommon'],
    },
    ai: { semanticNames: ['desk', 'workstation'], synonyms: [], cuesForPrompts: [] },
};

const SAMPLE_JSON_TEXT = JSON.stringify(SAMPLE_FAMILY_REQUEST, null, 2);

// ── Inline styles (scoped via id) ────────────────────────────────────────────

const DIALOG_STYLE_ID = 'pryzm-family-pipeline-modal-style';

function ensureStyle(): void {
    if (document.getElementById(DIALOG_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = DIALOG_STYLE_ID;
    style.textContent = `
        dialog.fpmtm-dialog {
            width: 700px; max-width: 92vw; max-height: 86vh;
            padding: 0; border: 1px solid #444; border-radius: 8px;
            background: #1e1e1e; color: #e0e0e0;
            font-family: var(--app-font, system-ui, sans-serif);
            box-shadow: 0 8px 32px rgba(0,0,0,.6);
        }
        dialog.fpmtm-dialog::backdrop { background: rgba(0,0,0,.5); }
        .fpmtm-body { display: flex; flex-direction: column; max-height: 86vh; }
        .fpmtm-header {
            padding: 12px 16px; border-bottom: 1px solid #333;
            display: flex; align-items: center; justify-content: space-between;
            background: linear-gradient(90deg, #2a1a4a, #1e1e1e);
        }
        .fpmtm-title { font-size: 14px; font-weight: 600; margin: 0; }
        .fpmtm-close {
            background: transparent; color: #aaa; border: none;
            font-size: 18px; cursor: pointer; padding: 0 4px;
        }
        .fpmtm-close:hover { color: #fff; }
        .fpmtm-content {
            padding: 12px 16px; overflow-y: auto; flex: 1;
            display: flex; flex-direction: column; gap: 10px;
        }
        .fpmtm-row { display: flex; gap: 8px; align-items: center; }
        .fpmtm-label { font-size: 11px; color: #aaa; text-transform: uppercase; letter-spacing: .04em; }
        .fpmtm-textarea {
            width: 100%; min-height: 220px; max-height: 360px;
            font-family: ui-monospace, Menlo, Consolas, monospace;
            font-size: 11px; line-height: 1.4;
            background: #111; color: #d0d0d0; border: 1px solid #333;
            border-radius: 4px; padding: 8px; resize: vertical;
            box-sizing: border-box;
        }
        .fpmtm-btn {
            background: #6600ff; color: #fff; border: none; border-radius: 4px;
            padding: 6px 14px; font-size: 12px; cursor: pointer; font-weight: 500;
        }
        .fpmtm-btn:hover { background: #7a1aff; }
        .fpmtm-btn--secondary { background: #333; color: #e0e0e0; }
        .fpmtm-btn--secondary:hover { background: #444; }
        .fpmtm-result { margin-top: 4px; }
        .fpmtm-result-header {
            font-size: 12px; font-weight: 600; padding: 6px 8px;
            border-radius: 4px; margin-bottom: 6px;
        }
        .fpmtm-result-header--success { background: #1a3d2a; color: #6fdc8c; }
        .fpmtm-result-header--failure { background: #3d1a1a; color: #ff8a8a; }
        .fpmtm-result-summary {
            font-size: 11px; color: #ccc; margin-bottom: 6px;
            background: #0f0f0f; padding: 6px 8px; border-radius: 4px;
            border: 1px solid #2a2a2a;
        }
        .fpmtm-result-summary code {
            color: #b388ff; font-family: ui-monospace, Menlo, Consolas, monospace;
        }
        .fpmtm-pre {
            background: #0a0a0a; color: #c0e0c0; border: 1px solid #2a2a2a;
            border-radius: 4px; padding: 8px; font-size: 11px;
            font-family: ui-monospace, Menlo, Consolas, monospace;
            max-height: 280px; overflow: auto; white-space: pre-wrap;
            word-break: break-word;
        }
        .fpmtm-error-inline {
            color: #ff8a8a; font-size: 11px; padding: 6px 8px;
            background: #2a1010; border: 1px solid #4a1a1a; border-radius: 4px;
        }
        .fpmtm-issue-table {
            width: 100%; border-collapse: collapse; font-size: 11px;
            font-family: ui-monospace, Menlo, Consolas, monospace;
        }
        .fpmtm-issue-table th, .fpmtm-issue-table td {
            border: 1px solid #333; padding: 4px 6px; text-align: left;
            vertical-align: top;
        }
        .fpmtm-issue-table th { background: #2a2a2a; color: #ccc; font-weight: 600; }
        .fpmtm-issue-table td { color: #ddd; }
        .fpmtm-issue-table td:first-child { color: #b388ff; }
    `;
    document.head.appendChild(style);
}

// ── Public entry ─────────────────────────────────────────────────────────────

export function openFamilyPlatformTestModal(): void {
    ensureStyle();

    const dialog = document.createElement('dialog');
    dialog.className = 'fpmtm-dialog';

    const body = document.createElement('div');
    body.className = 'fpmtm-body';
    dialog.appendChild(body);

    // Header
    const header = document.createElement('div');
    header.className = 'fpmtm-header';
    const title = document.createElement('h2');
    title.className = 'fpmtm-title';
    title.textContent = 'Test Family Pipeline (dev)';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'fpmtm-close';
    closeBtn.textContent = '×';
    closeBtn.title = 'Close';
    closeBtn.addEventListener('click', () => dialog.close());
    header.appendChild(title);
    header.appendChild(closeBtn);
    body.appendChild(header);

    // Content
    const content = document.createElement('div');
    content.className = 'fpmtm-content';
    body.appendChild(content);

    const label = document.createElement('div');
    label.className = 'fpmtm-label';
    label.textContent = 'FamilyRequest JSON';
    content.appendChild(label);

    const textarea = document.createElement('textarea');
    textarea.className = 'fpmtm-textarea';
    textarea.spellcheck = false;
    textarea.value = SAMPLE_JSON_TEXT;
    content.appendChild(textarea);

    const row = document.createElement('div');
    row.className = 'fpmtm-row';
    const runBtn = document.createElement('button');
    runBtn.type = 'button';
    runBtn.className = 'fpmtm-btn';
    runBtn.textContent = 'Run Pipeline';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'fpmtm-btn fpmtm-btn--secondary';
    copyBtn.textContent = 'Copy Sample JSON';
    copyBtn.addEventListener('click', () => { textarea.value = SAMPLE_JSON_TEXT; });

    const closeFooterBtn = document.createElement('button');
    closeFooterBtn.type = 'button';
    closeFooterBtn.className = 'fpmtm-btn fpmtm-btn--secondary';
    closeFooterBtn.textContent = 'Close';
    closeFooterBtn.addEventListener('click', () => dialog.close());

    row.appendChild(runBtn);
    row.appendChild(copyBtn);
    row.appendChild(closeFooterBtn);
    content.appendChild(row);

    const resultArea = document.createElement('div');
    resultArea.className = 'fpmtm-result';
    content.appendChild(resultArea);

    // Run handler
    runBtn.addEventListener('click', () => {
        resultArea.innerHTML = '';

        let parsed: unknown;
        try {
            parsed = JSON.parse(textarea.value);
        } catch (err) {
            const errEl = document.createElement('div');
            errEl.className = 'fpmtm-error-inline';
            errEl.textContent = `JSON parse error: ${String((err as Error).message ?? err)}`;
            resultArea.appendChild(errEl);
            return;
        }

        let result: ReturnType<typeof runFamilyPipeline>;
        try {
            result = runFamilyPipeline(parsed);
        } catch (err) {
            const errEl = document.createElement('div');
            errEl.className = 'fpmtm-error-inline';
            errEl.textContent = `Pipeline threw: ${String((err as Error).message ?? err)}`;
            resultArea.appendChild(errEl);
            return;
        }

        if (isPipelineSuccess(result)) {
            const headerEl = document.createElement('div');
            headerEl.className = 'fpmtm-result-header fpmtm-result-header--success';
            headerEl.textContent = 'Registered — pipeline succeeded';
            resultArea.appendChild(headerEl);

            const reg = result.registered as Record<string, unknown>;
            const summary = document.createElement('div');
            summary.className = 'fpmtm-result-summary';
            const escape = (v: unknown): string => {
                const div = document.createElement('div');
                div.textContent = String(v ?? '—');
                return div.innerHTML;
            };
            summary.innerHTML =
                `<div><strong>schemaHash:</strong> <code>${escape((reg as { schemaHash?: unknown }).schemaHash)}</code></div>` +
                `<div><strong>mountClass:</strong> <code>${escape((reg as { mountClass?: unknown }).mountClass)}</code></div>` +
                `<div><strong>category:</strong> <code>${escape((reg as { category?: unknown }).category)}</code></div>` +
                `<div><strong>tags:</strong> <code>${escape(JSON.stringify((reg as { tags?: unknown }).tags))}</code></div>`;
            resultArea.appendChild(summary);

            const pre = document.createElement('pre');
            pre.className = 'fpmtm-pre';
            pre.textContent = JSON.stringify(result.registered, null, 2);
            resultArea.appendChild(pre);
        } else {
            const headerEl = document.createElement('div');
            headerEl.className = 'fpmtm-result-header fpmtm-result-header--failure';
            headerEl.textContent = `Validation failed — ${result.message ?? 'see issues'}`;
            resultArea.appendChild(headerEl);

            const table = document.createElement('table');
            table.className = 'fpmtm-issue-table';
            const thead = document.createElement('thead');
            thead.innerHTML = '<tr><th>path</th><th>message</th></tr>';
            table.appendChild(thead);
            const tbody = document.createElement('tbody');
            for (const issue of result.issues) {
                const tr = document.createElement('tr');
                const tdPath = document.createElement('td');
                tdPath.textContent = Array.isArray(issue.path) ? issue.path.join('.') : String(issue.path);
                const tdMsg = document.createElement('td');
                tdMsg.textContent = issue.message;
                tr.appendChild(tdPath);
                tr.appendChild(tdMsg);
                tbody.appendChild(tr);
            }
            table.appendChild(tbody);
            resultArea.appendChild(table);
        }
    });

    // Mount + clean up on close
    document.body.appendChild(dialog);
    dialog.addEventListener('close', () => {
        dialog.remove();
    });
    dialog.showModal();
}
