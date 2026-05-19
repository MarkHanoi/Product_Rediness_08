// ToastController — Phase A.6 (S73-WIRE) typed wrapper backing
// `runtime.toasts.show(...)`.
//
// Phase A.6 close (2026-04-29): the canonical DOM helper now lives in
// `./showAppToast.ts` — this controller no longer needs an injected
// `showFn` from `src/ui/AppToast.ts` (deleted).  The `showFn` parameter
// is kept as an optional escape hatch for tests / embedded harnesses
// that want to substitute their own toast UI.

import type { Disposable, ToastKind, ToastsSlot } from './types.js';
import { showAppToast as packageShowAppToast } from './showAppToast.js';

/** Signature of the toast helper.  Tests may pass a stub matching this
 *  shape into `buildToastsSlot()`; production callers pass nothing. */
export type ShowAppToastFn = (
  message: string,
  type?: ToastKind,
  durationMs?: number,
) => HTMLElement;

/** SSR-safe noop: the package `showAppToast` touches `document` on the
 *  first call (it lazily creates the `#at-container` div).  When the
 *  composer runs in a Node test harness without a DOM, the default
 *  show-fn resolves to this stub which simply records the call. */
function noopShowAppToast(message: string, type: ToastKind = 'info'): HTMLElement {
  const stub: unknown = { message, type, isStub: true, remove: (): void => undefined };
  return stub as HTMLElement;
}

/** Default show-fn: real DOM helper in browser, noop in Node. */
const defaultShowAppToast: ShowAppToastFn = (message, type, durationMs) => {
  if (typeof document === 'undefined') return noopShowAppToast(message, type);
  return packageShowAppToast(message, type, durationMs);
};

export function buildToastsSlot(showFn: ShowAppToastFn | null = null): ToastsSlot {
  const show = showFn ?? defaultShowAppToast;
  const wrap = (kind: ToastKind, message: string, durationMs?: number): Disposable => {
    const el = show(message, kind, durationMs);
    return {
      dispose: (): void => {
        try {
          el?.remove?.();
        } catch {
          /* swallow — toast already removed by auto-dismiss */
        }
      },
    };
  };
  return {
    show: (message, kind = 'info', durationMs) => wrap(kind, message, durationMs),
    info: (message, durationMs) => wrap('info', message, durationMs),
    success: (message, durationMs) => wrap('success', message, durationMs),
    warn: (message, durationMs) => wrap('warn', message, durationMs),
    error: (message, durationMs) => wrap('error', message, durationMs),
  };
}
