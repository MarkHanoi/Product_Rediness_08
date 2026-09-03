/**
 * ComponentPreview — lane U5 (§COMPONENT-PREVIEW) · the mountable live 3-D
 * preview for a component definition.
 *
 * A thin composition over the PROVEN showroom widget: `mountElementPreview`
 * (§OPENING-SHOWROOM-PREVIEW) owns the canvas, the orbit, the keyboard access
 * and the honest-failure overlay; the shared `ElementPreviewRenderer` rig owns
 * the ONE WebGL context (the one-versus-many decision — a second context here
 * would evict the founder's main viewport). This file adds exactly three
 * things:
 *
 *  1. the ASYNC evaluate step — `buildComponentPreviewSubject` (the ONE bake)
 *     with a newest-wins token, so a stale bake can never overpaint a newer
 *     edit's result;
 *  2. the HONEST REFUSAL surface — a definition whose recipe cannot evaluate
 *     shows the evaluator's own sentences and HIDES the canvas: a refused
 *     evaluation must never leave the PREVIOUS shape on screen wearing the new
 *     parameters' caption (stale-shape = the lying-preview defect class);
 *  3. the PARTIAL strip — baked-but-incomplete states name every refused solid
 *     (spec §75: state it, never fake it).
 *
 * P3: no rAF, no loop — a render happens on `update()` only (the rig coalesces
 * through the frame scheduler). An idle preview costs zero frames.
 */

import {
    mountElementPreview,
    type ElementPreviewHandle,
} from '../element-preview/ElementPreviewCanvas';
import type { PreviewDrawResult } from '../element-preview/ElementPreviewRenderer';
import {
    buildComponentPreviewSubject,
    type ComponentPreviewRequest,
    type ComponentPreviewResult,
} from './componentPreviewSubject';

const MUTED = '#5b6472';
const REFUSAL = '#b3261e';
const WARN = '#8a5a00';
const LINE = '#d8dce3';

export interface ComponentPreviewHandle {
    /** Re-evaluate and re-render. Newest call wins; a superseded bake's result
     *  is dropped, never painted. Resolves when THIS request was applied or
     *  superseded. */
    update(req: ComponentPreviewRequest): Promise<void>;
    /** The last APPLIED evaluation outcome, or null before the first one. */
    lastResult(): ComponentPreviewResult | null;
    /** The inner showroom's last draw outcome (null while refused/never drawn). */
    lastDrawResult(): PreviewDrawResult | null;
    dispose(): void;
    readonly el: HTMLElement;
}

export interface ComponentPreviewOptions {
    /** CSS height of the canvas box. */
    heightPx?: number;
}

/**
 * Mount the component preview inside `host`. Renders nothing until the first
 * `update()` — the empty state names itself rather than showing a blank box.
 */
export function mountComponentPreview(
    host: HTMLElement,
    opts: ComponentPreviewOptions = {},
): ComponentPreviewHandle {
    let disposed = false;
    let token = 0;
    let lastResult: ComponentPreviewResult | null = null;
    let preview: ElementPreviewHandle | null = null;

    const root = document.createElement('div');
    root.setAttribute('data-component-preview', '');
    root.setAttribute('data-component-preview-state', 'empty');
    root.style.cssText = 'margin:0 0 10px;';

    /** The showroom's own container — hidden while a refusal stands. */
    const stage = document.createElement('div');
    stage.setAttribute('data-component-preview-stage', '');
    root.appendChild(stage);

    /** The typed-refusal surface. `role=status` so it reads out; hidden on ok. */
    const refusalEl = document.createElement('div');
    refusalEl.setAttribute('data-component-preview-refusal', '');
    refusalEl.setAttribute('role', 'status');
    refusalEl.style.cssText =
        `display:none;border:1px solid ${LINE};border-radius:10px;padding:14px 16px;` +
        `font-size:11.5px;line-height:1.5;color:${REFUSAL};white-space:pre-wrap;` +
        'background:linear-gradient(160deg,#ffffff 0%,#fff6f5 100%);';
    root.appendChild(refusalEl);

    /** The partial strip — refused solids named while others draw. */
    const partialEl = document.createElement('div');
    partialEl.setAttribute('data-component-preview-partial', '');
    partialEl.style.cssText =
        `display:none;margin-top:4px;font-size:11px;line-height:1.45;color:${WARN};white-space:pre-wrap;`;
    root.appendChild(partialEl);

    /** Before the first update. An honest sentence, not an empty frame. */
    const emptyEl = document.createElement('div');
    emptyEl.setAttribute('data-component-preview-empty', '');
    emptyEl.style.cssText =
        `border:1px dashed ${LINE};border-radius:10px;padding:14px 16px;` +
        `font-size:11.5px;color:${MUTED};`;
    emptyEl.textContent = 'No evaluation yet — the preview renders once the definition is evaluated.';
    root.appendChild(emptyEl);

    host.appendChild(root);

    function setState(state: 'empty' | 'ok' | 'partial' | 'refused'): void {
        root.setAttribute('data-component-preview-state', state);
        emptyEl.style.display = state === 'empty' ? '' : 'none';
        stage.style.display = state === 'ok' || state === 'partial' ? '' : 'none';
        refusalEl.style.display = state === 'refused' ? '' : 'none';
        partialEl.style.display = state === 'partial' ? '' : 'none';
    }

    async function update(req: ComponentPreviewRequest): Promise<void> {
        const my = ++token;
        const result = await buildComponentPreviewSubject(req);
        // Newest wins — a superseded bake paints NOTHING (not even its refusal).
        if (disposed || my !== token) return;
        lastResult = result;

        if (!result.ok) {
            // ⛔ The stale-shape rule: the canvas is torn down, not merely covered —
            // a refused evaluation leaves NO previous geometry on screen and
            // releases its claim on the shared rig while it stands.
            preview?.dispose();
            preview = null;
            refusalEl.setAttribute('data-component-preview-refusal-reason', result.reason);
            const diagLines = result.diagnostics
                .map((d) => `${d.severity} · ${d.code}: ${d.message}`)
                .join('\n');
            refusalEl.textContent =
                `This definition cannot be evaluated (${result.reason}).\n` +
                result.message +
                (diagLines ? `\n${diagLines}` : '');
            setState('refused');
            return;
        }

        if (preview === null) {
            preview = mountElementPreview(stage, {
                subject: result.subject,
                ...(opts.heightPx !== undefined ? { heightPx: opts.heightPx } : {}),
            });
        } else {
            preview.setSubject(result.subject);
        }

        if (result.unsupported.length > 0) {
            partialEl.textContent =
                result.unsupported
                    .map((u) => `⛔ ${u.kind} ${u.solidId} — ${u.reason}: ${u.message}`)
                    .join('\n');
            setState('partial');
        } else {
            setState('ok');
        }
    }

    return {
        el: root,
        update,
        lastResult: () => lastResult,
        lastDrawResult: () => preview?.lastDrawResult() ?? null,
        dispose(): void {
            if (disposed) return;
            disposed = true;
            preview?.dispose();
            preview = null;
            root.remove();
        },
    };
}
