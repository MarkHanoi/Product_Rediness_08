/**
 * @file PresenceCursorLayer.ts
 * @description Wave 14 — F.9.1 — runtime.sync.presence wiring.
 *   Renders remote-user cursor positions over the canvas using the sync
 *   awareness slot.  Phase F stub: awareness is null; Phase C.5.x wires the
 *   real WebSocket-backed cursor broadcast.
 */

type Runtime = import('@pryzm/runtime-composer/types').PryzmRuntime;

export interface CursorPosition {
    readonly userId: string;
    readonly x: number;
    readonly y: number;
    readonly color: string;
}

export class PresenceCursorLayer {
    private readonly _runtime: Runtime | null;
    private _el: HTMLElement | null = null;
    private _cursors = new Map<string, HTMLElement>();

    constructor(runtime: Runtime | null = null) {
        this._runtime = runtime;
    }

    mount(container: HTMLElement): void {
        this._el = document.createElement('div');
        this._el.className = 'presence-cursor-layer';
        this._el.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:50;';
        container.appendChild(this._el);
        this._subscribeToAwareness();
    }

    private _subscribeToAwareness(): void {
        if (!this._runtime) return;

        // F.9.1 — runtime.sync.awareness.cursors$ wiring
        // Phase F: presence is null; the subscription is a no-op.
        // Phase C.5.x: PryzmAwareness fires cursor updates via the WebSocket.
        const awareness = this._runtime.sync.presence;
        if (awareness === null) {
            console.debug('[PresenceCursorLayer] awareness not yet available (Phase C.5.x)');
            return;
        }

        // TODO(F.9.1): subscribe awareness.on('change', ...) once PryzmAwareness
        // exposes a typed cursor-map change event — Phase C.5.x wires this.
        console.debug('[PresenceCursorLayer] awareness connected, pending Phase C.5.x typed API');
    }

    updateCursor(pos: CursorPosition): void {
        if (!this._el) return;
        let dot = this._cursors.get(pos.userId);
        if (!dot) {
            dot = document.createElement('div');
            dot.className = 'presence-cursor';
            dot.style.cssText = `position:absolute;width:10px;height:10px;border-radius:50%;background:${pos.color};`;
            this._el.appendChild(dot);
            this._cursors.set(pos.userId, dot);
        }
        dot.style.left = `${pos.x}px`;
        dot.style.top = `${pos.y}px`;
    }

    destroy(): void {
        this._el?.remove();
        this._el = null;
        this._cursors.clear();
    }
}
