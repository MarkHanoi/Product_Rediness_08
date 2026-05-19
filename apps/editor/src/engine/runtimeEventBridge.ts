/**
 * runtimeEventBridge.ts — F.events.2d
 *
 * Deferred runtime-event subscription helper.
 *
 * Problem: module-level singletons (e.g. DiagnosticMaterialManager) are
 * constructed at ES-module evaluation time — before engineLauncher.ts sets
 * window.runtime.  A direct `window.runtime?.events?.on()` call in their
 * constructors silently no-ops because runtime is undefined.
 *
 * Solution: queue subscriptions that arrive before runtime is composed and
 * apply them when `flushRuntimeEventListeners()` is called from
 * engineLauncher.ts immediately after runtime is confirmed available.
 *
 * Usage for pre-runtime singletons:
 *   import { onRuntimeEvent } from '../runtimeEventBridge';
 *   onRuntimeEvent('my-event', (payload) => { ... });
 *
 * For callers whose init() runs after engineLauncher composes the runtime
 * (e.g. InspectModeCoordinator, LevelExplodeController, UnderlayPersistence),
 * use `window.runtime?.events?.on()` directly — by then the flush has already
 * happened and the subscription is applied immediately.
 */

type PendingEntry = { event: string; handler: (payload: unknown) => void };

const _pending: PendingEntry[] = [];
let _flushed = false;

/**
 * Subscribe to a runtime event, deferring the subscription until
 * `flushRuntimeEventListeners()` is called if `window.runtime` is not yet set.
 *
 * Returns an unsubscribe function.
 * If the subscription is still in the pending queue (not yet flushed), the
 * returned function removes it so it is never registered.
 */
export function onRuntimeEvent(
    event: string,
    handler: (payload: unknown) => void,
): () => void {
    if (window.runtime?.events) {
        return window.runtime.events.on(event, handler);
    }

    if (_flushed) {
        console.warn(
            `[runtimeEventBridge] runtime unavailable after flush for event: ${event}. ` +
            'Subscription dropped.',
        );
        return () => {};
    }

    const entry: PendingEntry = { event, handler };
    _pending.push(entry);

    return () => {
        const idx = _pending.indexOf(entry);
        if (idx !== -1) _pending.splice(idx, 1);
    };
}

/**
 * Called once from engineLauncher.ts immediately after `window.runtime` is
 * confirmed to be available.  Applies all queued subscriptions to the live
 * `runtime.events` bus.
 *
 * Idempotent — subsequent calls are no-ops.
 */
export function flushRuntimeEventListeners(): void {
    if (_flushed) return;
    _flushed = true;

    if (!window.runtime?.events) {
        console.error(
            '[runtimeEventBridge] flushRuntimeEventListeners() called but ' +
            'window.runtime.events is not available. Deferred subscriptions lost.',
        );
        return;
    }

    let count = 0;
    for (const { event, handler } of _pending) {
        window.runtime.events.on(event, handler);
        count++;
    }
    _pending.length = 0;

    if (count > 0) {
        console.log(`[runtimeEventBridge] Applied ${count} deferred runtime-event subscription(s).`);
    }
}
