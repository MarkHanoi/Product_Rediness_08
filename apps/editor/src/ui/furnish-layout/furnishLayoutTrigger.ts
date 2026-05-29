// Furnish Layout — single shared trigger (mirrors apartmentLayoutTrigger).
//
// Used by:
//   • The console command `window.pryzmFurnishAllRooms()`.
//   • Auto-fire after `ceiling.layout-executed` so the full apartment
//     pipeline (apartment → CEIL → furnish → light) is one continuous flow
//     (architect-friendly). Furniture now runs AFTER ceilings settle so
//     the architect sees an enclosed shell before furniture appears.
//   • Any future AI-panel UI button.
//
// Owns the per-session executor singleton so attaching is idempotent no matter
// which entry point fires. Always logs a [furnish-layout] marker + always
// surfaces a toast, so the trigger can never silently do nothing.

import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { FurnishLayoutExecutor } from './FurnishLayoutExecutor.js';

const _executor = new FurnishLayoutExecutor();

/** §VALIDATE-CACHE (2026-05-29): last `furnish.layout-executed` warnings,
 *  cached in-memory so the user can review them after they scroll past in
 *  the console. Exposed via `window.pryzmShowFurnishWarnings()`. */
let _lastValidationWarnings: readonly string[] = [];
let _lastValidationAt: Date | null = null;

declare global {
    interface Window {
        // `runtime` is already declared as `any` elsewhere — don't re-declare it.
        pryzmFurnishAllRooms?: () => void;
        pryzmShowFurnishWarnings?: () => void;
    }
}

/** Fire the deterministic furniture-layout engine on every furnishable room
 *  on the active level. Safe from the AI panel or the DevTools console. */
export function triggerFurnishLayout(runtimeArg?: PryzmRuntime | null): void {
    const rt = (runtimeArg ?? (window.runtime as unknown as PryzmRuntime | undefined)) ?? undefined;
    const toast = (message: string, severity: 'info' | 'success' | 'error'): void => {
        rt?.events?.emit('pryzm:toast', { message, severity });
    };
    try {
        console.log('[furnish-layout] trigger invoked');
        if (!rt) { toast('Runtime not ready — reload the project.', 'error'); return; }
        _executor.attach(rt);
        toast('Furnishing rooms…', 'info');
        rt.events.emit('furnish.layout-execute', {});
    } catch (err) {
        console.error('[furnish-layout] trigger threw:', err);
        toast(`Furnish trigger failed: ${String(err)}`, 'error');
    }
}

/** §VALIDATE-CACHE — review the last furnish run's circulation gate
 *  warnings. Prints a table to console + a single summary line. Empty cache
 *  ⇒ "no warnings" message. */
function showFurnishWarnings(): void {
    if (_lastValidationAt === null) {
        console.log('[furnish-layout] §VALIDATE no furnish has run yet — try pryzmFurnishAllRooms() first.');
        return;
    }
    if (_lastValidationWarnings.length === 0) {
        console.log(`[furnish-layout] §VALIDATE last run at ${_lastValidationAt.toISOString()} — 0 warnings (clean).`);
        return;
    }
    console.log(
        `[furnish-layout] §VALIDATE last run at ${_lastValidationAt.toISOString()} ` +
        `— ${_lastValidationWarnings.length} warning(s):`,
    );
    for (const w of _lastValidationWarnings) console.warn('[furnish-layout] §VALIDATE  -', w);
}

/** Install the DevTools console command `window.pryzmFurnishAllRooms()`,
 *  AND auto-fire furnishing after every apartment-layout build. Idempotent. */
export function installFurnishLayoutTrigger(runtime: PryzmRuntime | null): void {
    if (typeof window !== 'undefined') {
        window.pryzmFurnishAllRooms = () => triggerFurnishLayout(runtime);
        window.pryzmShowFurnishWarnings = showFurnishWarnings;
        console.log('[furnish-layout] console command ready — run pryzmFurnishAllRooms() to furnish all rooms.');
        console.log('[furnish-layout] §VALIDATE console command ready — run pryzmShowFurnishWarnings() to review last furnish\'s circulation warnings.');
        // §FULL-PIPELINE shortcut: chain furniture + lighting on demand for the
        // manual-walls test case (architect drew walls themselves; the
        // apartment generator never fired, so the auto-chain didn't start).
        const w = window as unknown as {
            pryzmLightAllRooms?: () => void;
            pryzmFurnishAndLightAllRooms?: () => void;
        };
        w.pryzmFurnishAndLightAllRooms = (): void => {
            triggerFurnishLayout(runtime);
            // The furnish run emits 'furnish.layout-executed' which auto-fires
            // the lighting trigger — no explicit lighting call needed.
        };
        console.log('[furnish-layout] full-pipeline shortcut ready — run pryzmFurnishAndLightAllRooms() to furnish + auto-light in one go.');
    }
    if (runtime) {
        _executor.attach(runtime);
        // §VALIDATE-CACHE — capture every furnish run's warnings so the user
        // can `pryzmShowFurnishWarnings()` later without re-running. The
        // event is emitted by FurnishLayoutExecutor at the end of every
        // furnish — both success + empty-placement paths.
        const evts = runtime.events as unknown as {
            on?: (k: string, fn: (p: unknown) => void) => (() => void) | void;
        };
        evts.on?.('furnish.layout-executed', (payload: unknown) => {
            const p = payload as { validationWarnings?: readonly string[] } | undefined;
            _lastValidationWarnings = Array.isArray(p?.validationWarnings)
                ? [...p!.validationWarnings] : [];
            _lastValidationAt = new Date();
            // §VALIDATE-TOAST (2026-05-29) — give the user a visual signal when
            // the circulation gate flagged something. Without this the warnings
            // sit silently in the in-memory cache until the user happens to
            // remember `pryzmShowFurnishWarnings()`. Severity is `info` (not
            // `error`) — the gate flags risk, not failure; the furnish still
            // succeeded. The 'warning' severity isn't part of the toast schema.
            const n = _lastValidationWarnings.length;
            if (n > 0) {
                runtime.events.emit('pryzm:toast', {
                    message: `Furnish complete with ${n} circulation warning${n === 1 ? '' : 's'} — run pryzmShowFurnishWarnings() to review.`,
                    severity: 'info',
                });
            }
        });
        // Auto-fire AFTER the ceiling pass settles. The ceiling layout
        // executor emits `ceiling.layout-executed` AFTER its runBatch, so
        // by the time furnishing starts the shell is enclosed (and the
        // room redetect from apartment.layout-executed has long settled).
        //
        // §CHAIN-TIMEOUT (2026-05-29) — auto-fire-chain reliability. If the
        // ceiling stage throws / never emits its done event, the OLD trigger
        // would silently never fire furnish. The fallback timer below fires
        // furnish 12 s after apartment.layout-executed REGARDLESS, with a
        // warning, so a single bad stage doesn't strand the whole pipeline.
        // Idempotency: `state.fired` flips on whichever path lands first; the
        // other one becomes a no-op.
        interface ChainState { fired: boolean; timer: ReturnType<typeof setTimeout> | null }
        const state: ChainState = { fired: false, timer: null };
        const FALLBACK_MS = 12_000;
        const fireFurnish = (source: 'ceiling-event' | 'fallback-timeout'): void => {
            if (state.fired) return;
            state.fired = true;
            if (state.timer !== null) { clearTimeout(state.timer); state.timer = null; }
            if (source === 'fallback-timeout') {
                console.warn(`[furnish-layout] §CHAIN-TIMEOUT — no ceiling.layout-executed within ${FALLBACK_MS} ms — firing furnish anyway.`);
            } else {
                console.log('[furnish-layout] ceiling.layout-executed → auto-furnishing.');
            }
            setTimeout(() => runtime.events.emit('furnish.layout-execute', {}), 0);
        };
        const events = runtime.events as unknown as {
            on?: (k: string, fn: (p: unknown) => void) => (() => void) | void;
        };
        events.on?.('apartment.layout-executed', () => {
            // New chain — clear any leftover state from a previous run.
            if (state.timer !== null) clearTimeout(state.timer);
            state.fired = false;
            state.timer = setTimeout(() => { state.timer = null; fireFurnish('fallback-timeout'); }, FALLBACK_MS);
        });
        events.on?.('ceiling.layout-executed', () => { fireFurnish('ceiling-event'); });
        console.log('[furnish-layout] auto-fire on ceiling.layout-executed: wired (§CHAIN-TIMEOUT fallback: ' + FALLBACK_MS + ' ms).');
    }
}
