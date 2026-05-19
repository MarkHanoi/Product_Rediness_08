/**
 * @file StructuralOverlay.ts
 * @description Wave 14 — F.12.3 — runtime.structural.loadPaths wiring.
 *   Dev overlay that renders structural force-vector load paths for selected
 *   elements.  Phase F stub: loadPaths() returns []; Phase F.12.3 wires the
 *   real structural analysis engine.
 */

type Runtime = import('@pryzm/runtime-composer/types').PryzmRuntime;

export class StructuralOverlay {
    private readonly _runtime: Runtime | null;
    private _canvas: HTMLCanvasElement | null = null;
    private _ctx: CanvasRenderingContext2D | null = null;

    constructor(runtime: Runtime | null = null) {
        this._runtime = runtime;
    }

    mount(container: HTMLElement): void {
        this._canvas = document.createElement('canvas');
        this._canvas.className = 'structural-overlay';
        this._canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:15;';
        container.appendChild(this._canvas);
        this._ctx = this._canvas.getContext('2d');
    }

    /** Render load paths for the given element IDs. */
    render(elementIds: readonly string[]): void {
        if (!this._runtime || !this._ctx || !this._canvas) return;

        this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

        // F.12.3 — runtime.structural.loadPath$ wiring
        const paths = this._runtime.structural.loadPaths(elementIds);
        if (paths.length === 0) return;

        this._ctx.strokeStyle = '#ff6600';
        this._ctx.lineWidth = 2;
        for (const path of paths) {
            if (path.forces.length < 2) continue;
            this._ctx.beginPath();
            this._ctx.moveTo(path.forces[0], path.forces[1]);
            for (let i = 2; i + 1 < path.forces.length; i += 2) {
                this._ctx.lineTo(path.forces[i], path.forces[i + 1]);
            }
            this._ctx.stroke();
        }
    }

    destroy(): void {
        this._canvas?.remove();
        this._canvas = null;
        this._ctx = null;
    }
}
