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

/** Guard so the furnish→lighting cascade is wired EXACTLY once across the
 *  session, even if install is called more than once or the deferred retry and
 *  a later explicit install race (a double subscription would double-light). */
let _cascadeWired = false;

/** Install the DevTools console command + auto-fire AFTER 'furnish.layout-
 *  executed'. Idempotent. */
export function installLightingLayoutTrigger(runtime: PryzmRuntime | null): void {
    if (typeof window !== 'undefined') {
        window.pryzmLightAllRooms = () => triggerLightingLayout(runtime ?? (window.runtime as unknown as PryzmRuntime | undefined) ?? null);
        console.log('[lighting-layout] console command ready — run pryzmLightAllRooms() to auto-light all rooms.');
    }
    // §LIGHT-WIRE-DEFER (founder 2026-06-19) — mountAIArea can run BEFORE the
    // runtime is composed (createMainLayout defaults runtime to null), in which
    // case the original `if (runtime)` wiring was SKIPPED and the furnish→lighting
    // cascade was never subscribed → clicking "Furnish all rooms (AI)" placed
    // furniture but NEVER lit (house-gen still lit because runHousePostGenChain
    // drives lighting directly per storey, masking the bug). Resolve the runtime
    // from the arg OR window.runtime, and if neither is ready yet, retry on a
    // short interval until it appears so the cascade is reliably wired once.
    const tryWire = (): boolean => {
        const rt = (runtime ?? (typeof window !== 'undefined' ? (window.runtime as unknown as PryzmRuntime | undefined) : undefined)) ?? null;
        if (!rt) return false;
        wireLightingCascade(rt);
        return true;
    };
    if (!tryWire() && typeof window !== 'undefined') {
        let attempts = 0;
        const iv = setInterval(() => {
            attempts++;
            if (tryWire() || attempts > 40) clearInterval(iv);   // ≤10 s of 250 ms polls
        }, 250);
    }
}

/** Wire the furnish→lighting (and ceiling-fallback) cascade. Subscribes EXACTLY
 *  once via `_cascadeWired`. Extracted so the deferred retry above can call it
 *  the moment a runtime becomes available. */
function wireLightingCascade(runtime: PryzmRuntime): void {
    if (_cascadeWired) return;
    _cascadeWired = true;
    {
        _executor.attach(runtime);
        // §CHAIN-TIMEOUT (2026-05-29) — auto-fire-chain reliability.
        // Mirrors the same shape as furnishLayoutTrigger: arm a fallback
        // timer on the predecessor-of-predecessor event (ceiling, here),
        // fire lighting on whichever happens first (normal furnish event
        // OR the fallback). Idempotency via `state.fired`.
        interface ChainState {
            fired: boolean;
            timer: ReturnType<typeof setTimeout> | null;
            /** §CHAIN-NO-DOUBLE-FIRE (2026-08-13) — true once the fallback has
             *  fired for the CURRENT run. The next `furnish.layout-executed`
             *  is then the LATE event from the timed-out run and must NOT
             *  re-fire lighting (the old code reset `state.fired` and fired
             *  AGAIN → double fixtures). One-shot: consumed by that late
             *  event, so a genuinely NEW furnish run afterwards still lights
             *  (§FURNISH-ALWAYS-LIGHTS preserved). */
            fallbackFired: boolean;
        }
        const state: ChainState = { fired: false, timer: null, fallbackFired: false };
        const FALLBACK_MS = 12_000;
        /** §FURNISH-DROP-SURFACING — what the cascade knows about the furnish
         *  stage; mirrors `FurnishStageOutcome` (ai-host lightingBasis.ts). */
        type FurnishOutcome =
            | { state: 'completed'; placedCount: number; roomCount?: number }
            | { state: 'dropped'; reason: string };
        const fireLighting = (source: 'furnish-event' | 'fallback-timeout', furnishOutcome?: FurnishOutcome): void => {
            if (state.fired) return;
            state.fired = true;
            if (state.timer !== null) { clearTimeout(state.timer); state.timer = null; }
            if (source === 'fallback-timeout') {
                state.fallbackFired = true;
                console.warn(`[lighting-layout] §CHAIN-TIMEOUT — no furnish.layout-executed within ${FALLBACK_MS} ms — firing lighting anyway.`);
            } else {
                console.log('[lighting-layout] furnish.layout-executed → auto-lighting.');
            }
            // §FURNISH-DROP-SURFACING — the fired payload CARRIES the outcome so
            // the executor can stamp basis/basisDisclosure on its result. `{}`
            // told downstream nothing; a dropped stage must travel WITH its
            // reason (C75 §1.4).
            // Emit through the untyped narrowing (same as `.on` below): the
            // `furnishOutcome` field is ahead of the PryzmEventMap typing in
            // packages/runtime-composer/src/types.ts (out of L-CHAIN territory).
            setTimeout(() => {
                (runtime.events as unknown as { emit?: (k: string, p: unknown) => void } | undefined)
                    ?.emit?.('lighting.layout-execute', { furnishOutcome });
            }, 0);
        };
        /** Read the furnish outcome off a `furnish.layout-executed` payload:
         *  prefer the explicit `outcome` stamp (FurnishLayoutExecutor,
         *  §FURNISH-DROP-SURFACING commit 1), fall back to the legacy counts,
         *  and return undefined for a payload that says nothing — the ai-host
         *  basis resolver treats undefined as unfurnished-with-reason, never a
         *  silent pass (C70 §2.2). */
        const outcomeFromFurnishPayload = (payload: unknown): FurnishOutcome | undefined => {
            const p = payload as {
                outcome?: { state?: string; placedCount?: number; roomCount?: number; reason?: string };
                placedCount?: number; roomCount?: number;
            } | undefined;
            const o = p?.outcome;
            if (o?.state === 'dropped' && typeof o.reason === 'string') {
                return { state: 'dropped', reason: o.reason };
            }
            if (o?.state === 'completed' && typeof o.placedCount === 'number') {
                return { state: 'completed', placedCount: o.placedCount, roomCount: o.roomCount };
            }
            if (typeof p?.placedCount === 'number') {
                return { state: 'completed', placedCount: p.placedCount, roomCount: p.roomCount };
            }
            return undefined;
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
            state.fallbackFired = false;
            state.timer = setTimeout(() => {
                state.timer = null;
                fireLighting('fallback-timeout', {
                    state: 'dropped',
                    reason: `no furnish.layout-executed within ${FALLBACK_MS} ms (§CHAIN-TIMEOUT fallback fired)`,
                });
            }, FALLBACK_MS);
        });
        events.on?.('furnish.layout-executed', (payload) => {
            if (isHouseFanoutActive()) return;
            // §CHAIN-NO-DOUBLE-FIRE — the fallback already fired lighting for
            // this run; this is the LATE furnish event from the slow (>12 s)
            // run. Re-firing here was the DOUBLE-FIXTURE hazard: the reset
            // below would clear `state.fired` and light AGAIN. Swallow exactly
            // this one event (one-shot), so the next furnish run still lights.
            if (state.fallbackFired) {
                state.fallbackFired = false;
                console.warn(
                    '[lighting-layout] §CHAIN-NO-DOUBLE-FIRE — late furnish.layout-executed after the ' +
                    '§CHAIN-TIMEOUT fallback already fired lighting for this run; NOT re-firing ' +
                    '(double-fixture guard). NOTE: the lighting result was stamped basis=unfurnished; ' +
                    'the furniture that just landed was not part of that computation.',
                );
                return;
            }
            // §FURNISH-ALWAYS-LIGHTS (founder 2026-06-19) — every furnish RUN lights
            // once. The dedup `state.fired` was only reset on a preceding `ceiling.
            // layout-executed`; a DIRECT "Furnish all rooms (AI)" click (no ceiling
            // event first) therefore re-fired lighting only the FIRST time — on the
            // second+ click `state.fired` was stuck true and lighting silently no-op'd
            // ("clicking furnish doesn't trigger anything"). Reset the dedup + cancel any
            // armed fallback here so furnish ALWAYS lights (ceiling fixtures + the
            // §MORE-LIGHTING floor lamps). fireLighting re-sets `fired`, so the fallback
            // timer still can't double-fire within a run.
            if (state.timer !== null) { clearTimeout(state.timer); state.timer = null; }
            state.fired = false;
            fireLighting('furnish-event', outcomeFromFurnishPayload(payload));
        });
        console.log('[lighting-layout] auto-fire on furnish.layout-executed: wired (§CHAIN-TIMEOUT fallback: ' + FALLBACK_MS + ' ms).');
    }
}
