// Lighting Layout — single shared trigger (mirrors furnishLayoutTrigger).
//
// Entry points:
//   • Console: `window.pryzmLightAllRooms()` — manual test.
//   • Auto-fire: subscribes to 'furnish.layout-executed' and emits
//     'lighting.layout-execute' on the next tick. The full apartment
//     pipeline now reads as: generate → walls/doors → redetect → furnish
//     → LIGHT — one continuous architect-friendly flow.

import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { LightingLayoutExecutor } from './LightingLayoutExecutor.js';
import { isHouseFanoutActive } from '../house-layout/houseFanoutGuard.js';

const _executor = new LightingLayoutExecutor();

declare global {
    interface Window {
        pryzmLightAllRooms?: () => void;
    }
}

export function triggerLightingLayout(runtimeArg?: PryzmRuntime | null): void {
    const rt = (runtimeArg ?? (window.runtime as unknown as PryzmRuntime | undefined)) ?? undefined;
    const toast = (message: string, severity: 'info' | 'success' | 'error'): void => {
        rt?.events?.emit('pryzm:toast', { message, severity });
    };
    try {
        console.log('[lighting-layout] trigger invoked');
        if (!rt) { toast('Runtime not ready — reload the project.', 'error'); return; }
        _executor.attach(rt);
        toast('Lighting rooms…', 'info');
        rt.events.emit('lighting.layout-execute', {});
    } catch (err) {
        console.error('[lighting-layout] trigger threw:', err);
        toast(`Lighting trigger failed: ${String(err)}`, 'error');
    }
}

/** Install the DevTools console command + auto-fire AFTER 'furnish.layout-
 *  executed'. Idempotent. */
export function installLightingLayoutTrigger(runtime: PryzmRuntime | null): void {
    if (typeof window !== 'undefined') {
        window.pryzmLightAllRooms = () => triggerLightingLayout(runtime);
        console.log('[lighting-layout] console command ready — run pryzmLightAllRooms() to auto-light all rooms.');
    }
    if (runtime) {
        _executor.attach(runtime);
        // §CHAIN-TIMEOUT (2026-05-29) — auto-fire-chain reliability.
        // Mirrors the same shape as furnishLayoutTrigger: arm a fallback
        // timer on the predecessor-of-predecessor event (ceiling, here),
        // fire lighting on whichever happens first (normal furnish event
        // OR the fallback). Idempotency via `state.fired`.
        interface ChainState { fired: boolean; timer: ReturnType<typeof setTimeout> | null }
        const state: ChainState = { fired: false, timer: null };
        const FALLBACK_MS = 12_000;
        const fireLighting = (source: 'furnish-event' | 'fallback-timeout'): void => {
            if (state.fired) return;
            state.fired = true;
            if (state.timer !== null) { clearTimeout(state.timer); state.timer = null; }
            if (source === 'fallback-timeout') {
                console.warn(`[lighting-layout] §CHAIN-TIMEOUT — no furnish.layout-executed within ${FALLBACK_MS} ms — firing lighting anyway.`);
            } else {
                console.log('[lighting-layout] furnish.layout-executed → auto-lighting.');
            }
            setTimeout(() => runtime.events.emit('lighting.layout-execute', {}), 0);
        };
        const events = runtime.events as unknown as {
            on?: (k: string, fn: (p: unknown) => void) => (() => void) | void;
        };
        events.on?.('ceiling.layout-executed', () => {
            // §A.21.i — during a HOUSE post-gen fan-out, runHousePostGenChain
            // drives lighting itself per storey; skip the cascade (and its
            // fallback timer) so fixtures aren't placed twice. Apartment runs
            // leave the guard false → unchanged.
            if (isHouseFanoutActive()) return;
            // New chain link — clear any leftover state, arm a fresh fallback.
            if (state.timer !== null) clearTimeout(state.timer);
            state.fired = false;
            state.timer = setTimeout(() => { state.timer = null; fireLighting('fallback-timeout'); }, FALLBACK_MS);
        });
        events.on?.('furnish.layout-executed', () => {
            if (isHouseFanoutActive()) return;
            fireLighting('furnish-event');
        });
        console.log('[lighting-layout] auto-fire on furnish.layout-executed: wired (§CHAIN-TIMEOUT fallback: ' + FALLBACK_MS + ' ms).');
    }
}
