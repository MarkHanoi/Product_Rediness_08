/**
 * AnnotationRailPanel — Annotation tools section for the right tools rail system.
 *
 * Extracted from the inline annotation section in Layout.ts.
 * Renders a native button list for each annotation tool registered in
 * ToolRegistry under section='ANNOTATION', routing clicks to the correct
 * toolManager method per the §ANN-B1/B3/B4/Phase-IV/C1 contract.
 *
 * Special tools:
 *   annotation-visibility — lazy-initialises AnnotationVisibilityPanel on first use
 *   annotate-view-ai      — fires AnnotateViewCommand with a progress toast
 *
 * Contract compliance:
 *   §05 §9     — New UI file under src/ui/
 *   §05 §6     — Zero bim-* layout elements; bim-icon used only as icon leaf (existing pattern)
 *   §01 §2     — All mutations via toolManager / AnnotateViewCommand; no direct store writes
 *   §05 §7.6   — No independent <style> injection
 *   §ANN-B1/B3/B4/Phase-IV/C1 — Annotation routing preserved verbatim from Layout.ts
 */

import { AnnotateViewCommand } from '@pryzm/command-registry';
import { toolRegistry } from '@pryzm/input-host';
import type { ToolDescriptor } from '@pryzm/input-host';
import type { ToolsRailController } from '../ToolsRailController';
import type { ToolsPanelProps } from '../ToolsPanelTypes';
import * as PryzmIcons from '../../icons/PryzmIcons';

export class AnnotationRailPanel {
    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(
        private readonly _props: ToolsPanelProps,
        _rail: ToolsRailController,
        runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null,
    ) {
        this.runtime = runtime;}

    build(): HTMLElement {
        const root = document.createElement('div');
        root.className = 'tpr-ann-root';

        const tools = toolRegistry.getBySection('ANNOTATION');

        if (tools.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'tpr-ann-empty';
            empty.textContent = 'No annotation tools registered.';
            root.appendChild(empty);
            return root;
        }

        // Visibility/Graphics panel mount point — lazy-init target
        const annVgMount = document.createElement('div');
        annVgMount.id = 'ann-vg-panel-mount';
        root.appendChild(annVgMount);

        for (const tool of tools) {
            root.appendChild(this._buildToolBtn(tool, annVgMount));
        }

        return root;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private helpers
    // ─────────────────────────────────────────────────────────────────────────

    /** Maps annotation tool IDs to minimalist arch: placeholder icons */
    private static readonly _ANN_ICON: Record<string, string> = {
        'linear-dimension':      'arch:linear-dim',
        'angular-dimension':     'arch:angular-dim',
        'radius-dimension':      'arch:radius-dim',
        'diameter-dimension':    'arch:diameter-dim',
        'slope-dimension':       'arch:slope-dim',
        'spot-elevation':        'arch:spot-elevation',
        'text-note':             'arch:text-note',
        'element-tag':           'arch:element-tag',
        'keynote':               'arch:keynote',
        'door-tag':              'arch:door-tag',
        'window-tag':            'arch:window-tag',
        'level-tag':             'arch:level-tag',
        'grid-bubble':           'arch:grid-bubble',
        'revision-cloud':        'arch:revision-cloud',
        'section-mark':          'arch:section-mark',
        'elevation-mark':        'arch:elevation-mark',
        'callout-detail':        'arch:callout-detail',
        'annotation-visibility': 'arch:annotation-visibility',
        'annotate-view-ai':      'arch:annotate-ai',
    };

    private _buildToolBtn(tool: ToolDescriptor, annVgMount: HTMLElement): HTMLElement {
        const btn = document.createElement('button');
        btn.className = 'tpr-ann-btn';
        btn.type = 'button';
        btn.title = tool.label;

        const resolvedIcon =
            AnnotationRailPanel._ANN_ICON[tool.id] ??
            tool.icon ??
            'arch:linear-dim';

        const iconEl = PryzmIcons.iconEl(
            resolvedIcon,
            'tpr-ann-btn-icon',
            16,
        );

        const labelEl = document.createElement('span');
        labelEl.className = 'tpr-ann-btn-label';
        labelEl.textContent = tool.label;

        btn.appendChild(iconEl);
        btn.appendChild(labelEl);

        btn.addEventListener('click', () => this._dispatchTool(tool.id, annVgMount));

        return btn;
    }

    /**
     * Routes a tool button click to the correct activation method.
     * Preserves the exact routing logic from Layout.ts §ANN-B1/B3/B4/Phase-IV/C1.
     */
    private _dispatchTool(id: string, annVgMount: HTMLElement): void {
        console.log(`[AnnotationRailPanel] Tool clicked: ${id}`);
        const { toolManager } = this._props;

        switch (id) {
            case 'linear-dimension':
                toolManager.activateLinearDimAnnotation();
                break;

            case 'text-note':
                toolManager.activateTextNote();
                break;

            case 'element-tag':
                toolManager.activateElementTag();
                break;

            case 'angular-dimension':
                toolManager.activateAngularDimension();
                break;

            case 'spot-elevation':
                toolManager.activateSpotElevation();
                break;

            case 'keynote':
                toolManager.activateKeynote();
                break;

            case 'annotation-visibility':
                this._handleAnnotationVisibility(annVgMount);
                break;

            case 'annotate-view-ai':
                this._handleAIAnnotate();
                break;

            case 'door-tag':
                toolManager.activateDoorTag();
                break;

            case 'window-tag':
                toolManager.activateWindowTag();
                break;

            case 'level-tag':
                toolManager.activateLevelTag();
                break;

            case 'grid-bubble':
                toolManager.activateGridBubble();
                break;

            case 'revision-cloud':
                toolManager.activateRevisionCloud();
                break;

            case 'radius-dimension':
                toolManager.activateRadiusDimension();
                break;

            case 'diameter-dimension':
                toolManager.activateDiameterDimension();
                break;

            case 'slope-dimension':
                toolManager.activateSlopeDimension();
                break;

            case 'section-mark':
                toolManager.activateSectionMark();
                break;

            case 'elevation-mark':
                toolManager.activateElevationMark();
                break;

            case 'callout-detail':
                toolManager.activateCalloutDetail();
                break;

            default:
                console.warn(`[AnnotationRailPanel] Unknown tool id: ${id}`);
        }
    }

    // ─── §ANN-B7 — Annotation Visibility/Graphics panel ──────────────────────

    private _handleAnnotationVisibility(mountEl: HTMLElement): void {
        const annVgPanel = window.annotationVisibilityPanel; // TODO(F.6.5): legacy annotationVisibilityPanel — replace with runtime.panelHost.get('annotationVisibility')
        if (annVgPanel) {
            annVgPanel.toggle();
            return;
        }
        const annMgr = window.annotationManager; // TODO(D.4): legacy annotationManager — replace with runtime.scene.annotation manager
        if (!annMgr) {
            console.warn('[AnnotationRailPanel] annotationManager not available on window');
            return;
        }
        import('@pryzm/plugin-annotations').then(({ AnnotationVisibilityPanel }) => {
            const panel = new AnnotationVisibilityPanel(
                annMgr.visibilityStore,
                () => annMgr.getActiveViewId(),
            );
            panel.mount(mountEl);
            panel.show();
            window.annotationVisibilityPanel = panel; // TODO(F.6.5): legacy annotationVisibilityPanel — replace with runtime.panelHost.get('annotationVisibility')
        });
    }

    // ─── §ANN-C1 — AI Annotate View ──────────────────────────────────────────

    private _handleAIAnnotate(): void {
        const annotManager = window.annotationManager; // TODO(D.4): legacy annotationManager — replace with runtime.scene.annotation manager
        const viewId = annotManager?.getActiveViewId?.() ?? null;

        if (!viewId) {
            console.warn('[AnnotationRailPanel] No active view. Open a floor plan view first.');
            this._showToast('Open a floor plan view before using AI Annotate.', 'warn');
            return;
        }

        const toast = this._showToast('AI is annotating the view…', 'default');

        AnnotateViewCommand.execute({
            ownerViewId: viewId,
            userIntent:  'Annotate this floor plan with key dimensions, element tags, and fire rating notes.',
            onProgress:  (msg: string) => { toast.textContent = msg; },
            onError:     (err: string) => {
                toast.textContent = `Error: ${err}`;
                toast.className   = 'ann-ai-toast ann-ai-toast--error';
            },
        }).then((result: { summary: string }) => {
            toast.textContent = result.summary;
            toast.className   = 'ann-ai-toast ann-ai-toast--success';
        }).finally(() => {
            setTimeout(() => toast.remove(), 6000);
        });
    }

    /**
     * Appends a toast notification to document.body and returns it so callers
     * can update its text during async operations.
     */
    private _showToast(message: string, variant: 'default' | 'warn' | 'error' | 'success'): HTMLElement {
        const toast = document.createElement('div');
        const variantClass = variant === 'default' ? '' : ` ann-ai-toast--${variant}`;
        toast.className = `ann-ai-toast${variantClass}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        if (variant === 'warn') {
            setTimeout(() => toast.remove(), 4000);
        }
        return toast;
    }
}
