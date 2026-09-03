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
import type { OrbitState, PreviewDrawResult } from '../element-preview/ElementPreviewRenderer';
import {
    buildComponentPreviewSubject,
    type ComponentPreviewRequest,
    type ComponentPreviewResult,
} from './componentPreviewSubject';

const MUTED = '#5b6472';
const REFUSAL = '#b3261e';
const WARN = '#8a5a00';
const LINE = '#d8dce3';
const INK = '#1a1a1a';

/* ------------------------------------------------------------------ */
/* §U8-MULTI-VIEW — one bake, N cameras                                 */
/* ------------------------------------------------------------------ */

/**
 * One viewport of the family editor. A view is a CAMERA over the shared rig,
 * never a renderer of its own.
 */
export interface ComponentPreviewView {
    /** Stable id — lands on `data-component-preview-view`. */
    readonly id: string;
    /** What the user reads above the frame. */
    readonly label: string;
    readonly orbit: Partial<OrbitState>;
    /** `false` = a fixed plan/elevation. Default `true`. */
    readonly interactive?: boolean;
}

/** The orbitable three-quarter view — today's single preview, unchanged. */
export const COMPONENT_VIEW_3D: ComponentPreviewView = Object.freeze({
    id: '3d',
    label: '3D',
    // No orbit override: `DEFAULT_ORBIT` is the showroom's framed default.
    orbit: {},
    interactive: true,
});

/**
 * ⭐ ORTHOGRAPHIC AND FIXED, all three of them. Under perspective, two equal
 *    members at different depths measure differently on screen — so a
 *    "plan" that is really a perspective camera pointed downwards is a picture
 *    that cannot be measured while looking exactly like one that can.
 */
export const COMPONENT_VIEW_PLAN: ComponentPreviewView = Object.freeze({
    id: 'plan',
    label: 'Plan',
    // Straight down. `previewCameraPose` swaps the up-vector to −Z at the pole,
    // so model +X reads across the page — the main viewport's plan orientation.
    orbit: { yaw: 0, pitch: Math.PI / 2, projection: 'orthographic' as const },
    interactive: false,
});
export const COMPONENT_VIEW_FRONT: ComponentPreviewView = Object.freeze({
    id: 'front',
    label: 'Front',
    orbit: { yaw: 0, pitch: 0, projection: 'orthographic' as const },
    interactive: false,
});
export const COMPONENT_VIEW_SIDE: ComponentPreviewView = Object.freeze({
    id: 'side',
    label: 'Side',
    orbit: { yaw: Math.PI / 2, pitch: 0, projection: 'orthographic' as const },
    interactive: false,
});

/**
 * The family-editor arrangement: a 2×2 grid — orbitable 3-D, plan, and two
 * elevations, all from ONE bake and ONE WebGL context.
 *
 * ⚠ 2×2 rather than "one large + three small with a swap control": the swap
 *   control is a second piece of state (which view is large) that every other
 *   surface in this modal would have to agree with, and at the card's width
 *   four equal cells are each wider than the single preview they replace. A
 *   swap is a later refinement, not a precondition.
 */
export const COMPONENT_FAMILY_EDITOR_VIEWS: readonly ComponentPreviewView[] = Object.freeze([
    COMPONENT_VIEW_3D,
    COMPONENT_VIEW_PLAN,
    COMPONENT_VIEW_FRONT,
    COMPONENT_VIEW_SIDE,
]);

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
    /**
     * lane U8 — the viewports to mount. Defaults to the single orbitable 3-D
     * view, so every existing caller is unchanged; the definition workspace
     * passes {@link COMPONENT_FAMILY_EDITOR_VIEWS}.
     *
     * ⭐ ONE BAKE FEEDS ALL OF THEM. `update()` evaluates the definition once
     *    and hands the SAME subject to each canvas — four views of one truth,
     *    not four evaluations that could disagree.
     */
    views?: readonly ComponentPreviewView[];
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
    const views = opts.views ?? [COMPONENT_VIEW_3D];
    /** One handle per view, in `views` order; empty while a refusal stands. */
    let previews: ElementPreviewHandle[] = [];

    const root = document.createElement('div');
    root.setAttribute('data-component-preview', '');
    root.setAttribute('data-component-preview-state', 'empty');
    root.setAttribute('data-component-preview-views', String(views.length));
    root.style.cssText = 'margin:0 0 10px;';

    /** The showroom's own container — hidden while a refusal stands. */
    const stage = document.createElement('div');
    stage.setAttribute('data-component-preview-stage', '');
    if (views.length > 1) {
        stage.style.cssText =
            'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:start;';
    }
    root.appendChild(stage);

    /** Per-view cells, built once; the canvases inside them come and go. */
    const cells: HTMLElement[] = views.map((v) => {
        const cell = document.createElement('div');
        cell.setAttribute('data-component-preview-view', v.id);
        cell.style.cssText = 'min-width:0;';
        if (views.length > 1) {
            const label = document.createElement('div');
            label.setAttribute('data-component-preview-view-label', v.id);
            label.textContent = v.label;
            label.style.cssText =
                `font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;` +
                `color:${INK};margin:0 0 3px;`;
            cell.appendChild(label);
        }
        stage.appendChild(cell);
        return cell;
    });

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
            // releases its claim on the shared rig while it stands. EVERY view,
            // not merely the first: a stale elevation is as much a lie as a
            // stale 3-D.
            for (const p of previews) p.dispose();
            previews = [];
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

        if (previews.length === 0) {
            previews = views.map((v, i) =>
                mountElementPreview(cells[i]!, {
                    subject: result.subject,
                    orbit: v.orbit,
                    ...(v.interactive !== undefined ? { interactive: v.interactive } : {}),
                    ...(opts.heightPx !== undefined ? { heightPx: opts.heightPx } : {}),
                }),
            );
        } else {
            // ⭐ ONE subject, N views: the same buffers, four cameras.
            for (const p of previews) p.setSubject(result.subject);
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
        // The FIRST view's outcome. Every view draws through the one rig, so a
        // draw-level failure is the rig's and is the same answer for all of them.
        lastDrawResult: () => previews[0]?.lastDrawResult() ?? null,
        dispose(): void {
            if (disposed) return;
            disposed = true;
            for (const p of previews) p.dispose();
            previews = [];
            root.remove();
        },
    };
}
