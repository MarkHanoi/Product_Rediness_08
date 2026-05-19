/**
 * @file CommentThreadPanel.ts
 * @description Wave 14 — F.9.3 — runtime.sync.client.threads$ wiring.
 *   Panel for viewing and posting comment threads attached to elements.
 *   Uses the sync client's thread API.  Phase F stub: client is null until
 *   Phase C.5.x wires the real WebSocket-backed comment sync.
 */

type Runtime = import('@pryzm/runtime-composer/types').PryzmRuntime;

export interface CommentThread {
    readonly id: string;
    readonly elementId: string;
    readonly body: string;
    readonly authorId: string;
    readonly createdAt: number;
}

export class CommentThreadPanel {
    private readonly _runtime: Runtime | null;
    private _el: HTMLElement | null = null;

    constructor(runtime: Runtime | null = null) {
        this._runtime = runtime;
    }

    mount(container: HTMLElement): void {
        this._el = document.createElement('div');
        this._el.className = 'comment-thread-panel';
        container.appendChild(this._el);
        this._bindSyncClient();
    }

    private _bindSyncClient(): void {
        if (!this._runtime) return;

        // F.9.3 — runtime.sync.client.threads$ wiring
        // Phase F: client may be null until Phase C.5.x wires the WebSocket.
        const client = this._runtime.sync.client;
        if (client === null) {
            console.debug('[CommentThreadPanel] sync client not available (Phase C.5.x)');
            return;
        }

        // TODO(F.9.3): subscribe client.threads$(elementId) once the typed
        // thread API lands — Phase C.5.x wires comment.post + comment.list.
        console.debug('[CommentThreadPanel] sync client ready, pending Phase C.5.x thread API');
    }

    /** Post a comment by dispatching a comment.post command through the bus. */
    postComment(elementId: string, body: string): void {
        if (!this._runtime) return;
        this._runtime.bus.executeCommand('comment.post', { elementId, body });
    }

    destroy(): void {
        this._el?.remove();
        this._el = null;
    }
}
