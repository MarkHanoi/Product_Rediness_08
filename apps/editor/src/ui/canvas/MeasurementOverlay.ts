/**
 * @file MeasurementOverlay.ts
 * @description Wave 14 — F.5.5 — runtime.scene.snap wiring.
 *   Reads the current snap mode and candidate from runtime.scene.snap to render
 *   measurement annotations.  Phase F stub: snap slot returns 'off'/null; Phase D
 *   wires the real snap-engine so measurements appear on hover.
 */

type Runtime = import('@pryzm/runtime-composer/types').PryzmRuntime;

export class MeasurementOverlay {
    private readonly _runtime: Runtime | null;
    private _canvas: HTMLCanvasElement | null = null;
    private _ctx: CanvasRenderingContext2D | null = null;

    constructor(runtime: Runtime | null = null) {
        this._runtime = runtime;
    }

    mount(container: HTMLElement): void {
        this._canvas = document.createElement('canvas');
        this._canvas.className = 'measurement-overlay';
        this._canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';
        container.appendChild(this._canvas);
        this._ctx = this._canvas.getContext('2d');
    }

    /** Called each frame — reads snap state and paints measurement labels. */
    tick(): void {
        if (!this._runtime || !this._ctx || !this._canvas) return;
        // F.5.5 — runtime.scene.snap wiring (mode + inspector)
        const snapMode = this._runtime.scene.snap.mode; // 'off'|'grid'|'vertex'|'edge'|'face'
        const candidate = this._runtime.scene.snap.candidate;

        this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
        if (snapMode === 'off' || candidate === null) return;

        // Draw crosshair at snap candidate screen position (Phase D wires real projection)
        this._ctx.fillStyle = 'rgba(0,200,200,0.9)';
        this._ctx.fillRect(candidate.point.x - 4, candidate.point.y - 4, 8, 8);
    }

    destroy(): void {
        this._canvas?.remove();
        this._canvas = null;
        this._ctx = null;
    }
}
