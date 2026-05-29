// Apartment Layout — modal wiring controller + generate trigger (SPEC §11/§13, A5-modal).
//
// Ties the runtime to the §11 modal: subscribes to 'apartment.layout-options-ready'
// → shows the modal with the AIStore's scored options → on Select emits
// 'apartment.layout-execute' {optionIndex} (the A6 handler commits); on Cancel
// clears the store + emits 'apartment.layout-cancel'. The generate trigger
// (requestApartmentLayout) ensures the workflow is registered, then submits.
//
// DOM/runtime glue verified by the editor typecheck (apps/editor vitest is 'node').
// `attach()` is safe at boot — it only subscribes to runtime.events; it does NOT
// call getHost(), so it adds zero AI bytes to first-paint (lazy K3-A preserved).

import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { ScoredLayoutOption, ApartmentProgram } from '@pryzm/ai-host';
import { ApartmentLayoutModal } from './ApartmentLayoutModal.js';
import { ensureApartmentLayoutRegistered } from '../../engine/ensureApartmentLayoutRegistered.js';
import type { ApartmentGenerateLayoutPayload } from '@pryzm/ai-host';

/** Subscribes to layout-options-ready and drives the §11 modal. */
export class ApartmentLayoutController {
    private readonly modal = new ApartmentLayoutModal();
    private _dispose: (() => void) | null = null;
    /** §MODAL-DYNAMIC (2026-05-29): cache the last generate payload so the
     *  modal's program-edit form can re-trigger generation with the same
     *  shell + window/door spans but a NEW program. Owned by the generate
     *  trigger (requestApartmentLayout writes it before submitting). */
    private _lastPayload: ApartmentGenerateLayoutPayload | null = null;
    /** §MODAL-DYNAMIC ctx — same idea (the projectId/actorId follow the
     *  workflow submission so a regenerate uses the same identity). */
    private _lastCtx: { projectId?: string; actorId?: string } = {};
    /** True between an `onProgramChange` re-submit and the next
     *  options-ready, so the next event refreshes IN PLACE instead of
     *  re-opening the modal. */
    private _regenerating = false;

    /** §MODAL-DYNAMIC: writers are the trigger (requestApartmentLayout) AND
     *  the modal-driven re-generate path. Exposed for the trigger only. */
    setLastPayload(payload: ApartmentGenerateLayoutPayload, ctx: { projectId?: string; actorId?: string }): void {
        this._lastPayload = payload;
        this._lastCtx = ctx;
    }

    /** Subscribe + drive the modal. Idempotent (a second attach is a no-op). */
    attach(runtime: PryzmRuntime): void {
        if (this._dispose) return;
        const sub = runtime.events.on('apartment.layout-options-ready', () => {
            // Source of truth is the AIStore (typed); the event is just the signal.
            // Wrapped in try/catch because the EventBus swallows per-listener errors —
            // without this a throw in the modal would vanish silently.
            try {
                const options = runtime.ai.layoutOptions.options() as readonly ScoredLayoutOption[];
                // §MODAL-DYNAMIC re-trigger landing: refresh IN PLACE instead of
                // opening a new modal. Keeps the program-edit form alive +
                // preserves scroll position.
                if (this._regenerating && this.modal.isOpen) {
                    console.log('[apartment-layout] options-ready (regenerate) —', options.length, 'option(s); refreshing modal');
                    this.modal.refresh(options);
                    this._regenerating = false;
                    return;
                }
                console.log('[apartment-layout] options-ready received —', options.length, 'option(s); opening modal');
                this.modal.show(options, {
                    onSelect: (index: number) => {
                        console.log('[apartment-layout] modal: option', index, 'selected → execute');
                        runtime.events.emit('apartment.layout-execute', { optionIndex: index });
                    },
                    onCancel: () => {
                        runtime.ai.layoutOptions.clear();
                        runtime.events.emit('apartment.layout-cancel', {});
                    },
                    onProgramChange: (program: ApartmentProgram) => {
                        // §MODAL-DYNAMIC re-trigger: rebuild the payload with
                        // the same shell/openings but the edited program, then
                        // resubmit. Cap with a guard so a debounced edit-burst
                        // doesn't fire while another in-flight regenerate is
                        // still pending.
                        if (this._regenerating) {
                            console.log('[apartment-layout] program-change ignored — regenerate already in flight');
                            return;
                        }
                        const base = this._lastPayload;
                        if (!base) {
                            console.warn('[apartment-layout] program-change: no cached payload — cannot regenerate');
                            this.modal.setBusy(false);
                            return;
                        }
                        const next: ApartmentGenerateLayoutPayload = { ...base, program };
                        this._lastPayload = next;
                        this._regenerating = true;
                        void requestApartmentLayout(runtime, next, this._lastCtx).then(res => {
                            if (!res.ok) {
                                console.warn('[apartment-layout] regenerate failed:', res.reason);
                                this._regenerating = false;
                                this.modal.setBusy(false);
                                runtime.events?.emit('pryzm:toast', {
                                    message: `Layout regenerate failed: ${res.reason ?? 'unknown'}`,
                                    severity: 'error',
                                });
                            }
                            // Success: the next 'apartment.layout-options-ready' event
                            // will land in the refresh-in-place branch above.
                        });
                    },
                }, this._lastPayload?.program);
            } catch (err) {
                console.error('[apartment-layout] failed to open the options modal:', err);
                runtime.events?.emit('pryzm:toast', { message: `Could not open the layouts modal: ${String(err)}`, severity: 'error' });
            }
        });
        console.log('[apartment-layout] controller attached — listening for options-ready');
        this._dispose = typeof sub === 'function' ? sub : () => { /* non-disposer */ };
    }

    /** Unsubscribe + close any open modal. */
    detach(): void {
        this._dispose?.();
        this._dispose = null;
        this._lastPayload = null;
        this._regenerating = false;
        this.modal.dismiss();
    }
}

export interface RequestApartmentLayoutResult {
    readonly ok: boolean;
    readonly reason?: string;
}

/** Minimal structural view of the AiPlane the trigger submits through. */
interface PlaneSubmitLike {
    submit(opts: {
        workflow: string;
        projectId: string;
        actorId?: string;
        plan?: string;
        input: unknown;
    }): Promise<unknown>;
}

/**
 * The generate trigger: ensure the workflow is registered (lazy — loads the
 * ai-host chunk here, on user action) then submit it. On success the workflow
 * persists options + emits 'apartment.layout-options-ready', which the attached
 * controller turns into the modal. Never throws — returns {ok,reason}.
 */
export async function requestApartmentLayout(
    runtime: PryzmRuntime,
    payload: ApartmentGenerateLayoutPayload,
    ctx: { projectId?: string; actorId?: string } = {},
): Promise<RequestApartmentLayoutResult> {
    try {
        const reg = await ensureApartmentLayoutRegistered(runtime);
        const host = (await runtime.ai.getHost()) as { plane?: PlaneSubmitLike };
        const plane = host.plane;
        if (!plane || typeof plane.submit !== 'function') {
            return { ok: false, reason: reg.reason ?? 'AI plane unavailable' };
        }
        if (!payload.shellWallIds || payload.shellWallIds.length < 3) {
            return { ok: false, reason: 'Need at least 3 exterior shell walls on the active level' };
        }
        await plane.submit({
            workflow: 'apartment-layout-generate',
            projectId: ctx.projectId ?? 'local-apartment-layout',
            actorId: ctx.actorId ?? 'local',
            plan: 'team',
            input: payload,
        });
        return { ok: true };
    } catch (err) {
        console.warn('[requestApartmentLayout] failed (non-fatal):', err);
        return { ok: false, reason: String(err) };
    }
}
