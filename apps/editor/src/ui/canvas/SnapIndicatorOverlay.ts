/**
 * @file SnapIndicatorOverlay.ts
 * @description Wave 14 — F.5.6 — runtime.scene.snap.candidate wiring.
 *   Renders a small glyph at the snap candidate position on the canvas.
 *   Phase F stub: candidate is always null; Phase D wires the real snap query.
 */

type Runtime = import('@pryzm/runtime-composer/types').PryzmRuntime;

const SNAP_GLYPH_SIZE = 6;

export class SnapIndicatorOverlay {
    private readonly _runtime: Runtime | null;
    private _canvas: HTMLCanvasElement | null = null;
    private _ctx: CanvasRenderingContext2D | null = null;

    constructor(runtime: Runtime | null = null) {
        this._runtime = runtime;
    }

    mount(container: HTMLElement): void {
        this._canvas = document.createElement('canvas');
        this._canvas.className = 'snap-indicator-overlay';
        this._canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:10;';
        container.appendChild(this._canvas);
        this._ctx = this._canvas.getContext('2d');
    }

    /** Called on every pointer-move frame to update the snap glyph. */
    tick(): void {
        if (!this._runtime || !this._ctx || !this._canvas) return;
        this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

        // F.5.6 — runtime.scene.snap.candidate$ wiring
        const candidate = this._runtime.scene.snap.candidate;
        if (candidate === null) return;

        const { x, y } = candidate.point;
        const half = SNAP_GLYPH_SIZE / 2;
        this._ctx.strokeStyle = '#00c8c8';
        this._ctx.lineWidth = 1.5;
        this._ctx.strokeRect(x - half, y - half, SNAP_GLYPH_SIZE, SNAP_GLYPH_SIZE);
    }

    destroy(): void {
        this._canvas?.remove();
        this._canvas = null;
        this._ctx = null;
    }
}
