/**
 * @file AwarenessSelectionLayer.ts
 * @description Wave 14 — F.9.2 — runtime.sync.presence wiring.
 *   Renders remote-user selection highlights over the canvas using the sync
 *   awareness slot.  Phase F stub: awareness is null; Phase C.5.x wires the
 *   real WebSocket-backed selection broadcast.
 */

type Runtime = import('@pryzm/runtime-composer/types').PryzmRuntime;

export class AwarenessSelectionLayer {
    private readonly _runtime: Runtime | null;
    private _el: HTMLElement | null = null;

    constructor(runtime: Runtime | null = null) {
        this._runtime = runtime;
    }

    mount(container: HTMLElement): void {
        this._el = document.createElement('div');
        this._el.className = 'awareness-selection-layer';
        this._el.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:45;';
        container.appendChild(this._el);
        this._subscribeToSelections();
    }

    private _subscribeToSelections(): void {
        if (!this._runtime) return;

        // F.9.2 — runtime.sync.awareness.selections$ wiring
        // Phase F: presence is null; the subscription is a no-op.
        // Phase C.5.x: PryzmAwareness fires selection-set updates via WebSocket.
        const awareness = this._runtime.sync.presence;
        if (awareness === null) {
            console.debug('[AwarenessSelectionLayer] awareness not yet available (Phase C.5.x)');
            return;
        }

        // TODO(F.9.2): subscribe awareness.on('change', ...) once PryzmAwareness
        // exposes a typed selections-map change event — Phase C.5.x.
        console.debug('[AwarenessSelectionLayer] awareness connected, pending Phase C.5.x typed API');
    }

    destroy(): void {
        this._el?.remove();
        this._el = null;
    }
}
