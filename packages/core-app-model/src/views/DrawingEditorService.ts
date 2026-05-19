import type { ToolName } from '@pryzm/core-app-model/tool-types';

export const ANNOTATION_TOOL_IDS = new Set<string>([
    'linear-dim',
    'linear-dimension',
    'angular-dimension',
    'radius-dimension',
    'diameter-dimension',
    'slope-dimension',
    'spot-elevation',
    'text-note',
    'element-tag',
    'keynote',
    'door-tag',
    'window-tag',
    'level-tag',
    'grid-bubble',
    'revision-cloud',
    'section-mark',
    'elevation-mark',
    'callout-detail',
    'detail-line',
    'north-arrow',
    'scale-bar',
    'matchline',
]);

export class DrawingEditorService {
    private _drawingEditor: any = null;
    private _domElement: HTMLElement | null = null;

    init(drawingEditor: any, container?: HTMLElement | null): void {
        this._drawingEditor = drawingEditor ?? null;
        this._domElement = this._resolveDomElement(drawingEditor, container ?? null);
        this.disable();
    }

    enable(): void {
        if (this._drawingEditor) {
            this._drawingEditor.enabled = true;
        }
        this._applyPointerEvents('auto', 'crosshair');
    }

    disable(): void {
        if (this._drawingEditor) {
            try {
                this._drawingEditor.cancel?.();
            } catch (err) {
                console.warn('[DrawingEditorService] cancel failed while disabling:', err);
            }

            try {
                this._drawingEditor.activeTool = null;
            } catch (err) {
                console.warn('[DrawingEditorService] activeTool reset failed while disabling:', err);
            }

            try {
                this._drawingEditor.clearHover?.();
            } catch (err) {
                console.warn('[DrawingEditorService] clearHover failed while disabling:', err);
            }

            this._drawingEditor.enabled = false;
        }

        this._applyPointerEvents('none', '');
    }

    syncForTool(toolName: ToolName | string): void {
        if (ANNOTATION_TOOL_IDS.has(toolName)) {
            this.enable();
        } else {
            this.disable();
        }
    }

    private _applyPointerEvents(pointerEvents: 'none' | 'auto', cursor: string): void {
        if (!this._domElement) return;
        this._domElement.style.pointerEvents = pointerEvents;
        this._domElement.style.cursor = cursor;
    }

    private _resolveDomElement(drawingEditor: any, container: HTMLElement | null): HTMLElement | null {
        const candidates = [
            drawingEditor?.domElement,
            drawingEditor?.element,
            drawingEditor?.container,
            drawingEditor?.uiElement,
            drawingEditor?.htmlElement,
            drawingEditor?.overlay,
            drawingEditor?._domElement,
            drawingEditor?._element,
            drawingEditor?._container,
        ];

        for (const candidate of candidates) {
            if (candidate instanceof HTMLElement && candidate.tagName.toLowerCase() !== 'canvas') {
                return candidate;
            }
        }

        if (!container) return null;

        const selector = [
            '[data-drawing-editor]',
            '[data-obc-drawing-editor]',
            '.drawing-editor',
            '.obc-drawing-editor',
            '.thatopen-drawing-editor',
            '[class*="DrawingEditor"]',
            '[class*="drawing-editor"]',
        ].join(',');

        const found = Array.from(container.querySelectorAll<HTMLElement>(selector))
            .find(el => el.id !== 'ann-render-layer' && el.tagName.toLowerCase() !== 'canvas');

        return found ?? null;
    }
}

export const drawingEditorService = new DrawingEditorService();
