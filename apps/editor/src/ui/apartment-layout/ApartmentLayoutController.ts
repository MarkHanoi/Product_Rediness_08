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
import { patchActiveBriefMetadata } from './activeBrief.js';
import { computeProgramShortfall, buildReducedProgramNoticeHtml } from './programNotice.js';

/** Max-wait for the regenerate flow's options-ready event after a successful
 *  workflow submit. 15 s is long enough for the slowest realistic D-TGL run
 *  on a complex shell + a relay round-trip, while still short enough that a
 *  silently-hung workflow doesn't strand the modal in busy state. */
const REGEN_TIMEOUT_MS = 15_000;

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
    /** §MODAL-DYNAMIC reliability guard (2026-05-29): a max-wait timer for
     *  the in-flight regenerate. If `apartment.layout-options-ready` doesn't
     *  fire within REGEN_TIMEOUT_MS of a successful submit, we treat the
     *  workflow as silently hung — reset busy state + show a toast so the
     *  modal doesn't get stuck. Cleared when the event lands normally. */
    private _regenerateTimer: ReturnType<typeof setTimeout> | null = null;

    /** §MODAL-DYNAMIC: writers are the trigger (requestApartmentLayout) AND
     *  the modal-driven re-generate path. Exposed for the trigger only. */
    setLastPayload(payload: ApartmentGenerateLayoutPayload, ctx: { projectId?: string; actorId?: string }): void {
        this._lastPayload = payload;
        this._lastCtx = ctx;
    }

    /**
     * A.21.D5 editor follow-up — build the reduced-programme notice for the apartment
     * modal: compare the REQUESTED bedroom/bathroom counts (the cached payload's
     * program) against what the best option actually BUILT (counting its rooms). When
     * the plate couldn't fit the requested count at minimum sizes the §FEASIBILITY-ALLOC
     * drop surfaces as a non-blocking chip. Returns '' when nothing was dropped.
     *
     * GAP NOTE (do NOT fix here): the engine's structured per-room `droppedRooms` is NOT
     * threaded onto the exported `ScoredLayoutOption` (`runDeterministicLayout.ts` drops
     * it), so the shortfall is derived from requested-vs-built counts — which IS
     * available + faithful for the bedroom/bathroom brief.
     */
    private _noticeHtmlFor(options: readonly ScoredLayoutOption[]): string {
        const program = this._lastPayload?.program;
        const best = options[0];
        if (!program || !best) return '';
        let bedroom = 0, bathroom = 0;
        for (const r of best.rooms ?? []) {
            const t = (r.type || '').toLowerCase();
            const occ = ((r as { occupancy?: string }).occupancy || '').toLowerCase();
            if (t.includes('bed') || t === 'master' || occ.includes('bed')) bedroom++;
            else if (t.includes('bath') || t === 'ensuite' || t === 'wc' || occ.includes('bath')) bathroom++;
        }
        const shortfall = computeProgramShortfall(
            { bedroom: Math.max(0, Math.round(program.bedrooms || 0)), bathroom: Math.max(0, Math.round(program.bathrooms || 0)) },
            { bedroom, bathroom },
        );
        return buildReducedProgramNoticeHtml(shortfall);
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
                    this.modal.refresh(options, this._noticeHtmlFor(options));
                    this._regenerating = false;
                    if (this._regenerateTimer !== null) {
                        clearTimeout(this._regenerateTimer);
                        this._regenerateTimer = null;
                    }
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
                        // O.12.c — the picker writes back to the SAME brief stash
                        // the RAC populated, keyed by the shared brief field ids,
                        // so the two surfaces are one source of truth: a later
                        // no-arg re-trigger (AI panel / console) honours the
                        // picker's edits too. Only the fields that ARE brief ids
                        // are mirrored (areas/livingRoom/entranceHall are
                        // modal-only refinements, not brief fields).
                        patchActiveBriefMetadata('apartment', {
                            bedrooms: program.bedrooms,
                            bathrooms: program.bathrooms,
                            openPlanKitchenDining: program.openPlanKitchenDining,
                            masterEnSuite: program.masterEnSuite,
                        });
                        this._regenerating = true;
                        // §RELIABILITY (2026-05-29): arm a max-wait timer
                        // BEFORE submit. If the workflow succeeds-without-event
                        // (relay accepts but the pipeline never emits options-
                        // ready), the modal would otherwise spin forever. The
                        // timer fires after REGEN_TIMEOUT_MS — cleared on the
                        // normal event landing OR a submit failure path below.
                        if (this._regenerateTimer !== null) clearTimeout(this._regenerateTimer);
                        this._regenerateTimer = setTimeout(() => {
                            this._regenerateTimer = null;
                            if (!this._regenerating) return;
                            console.warn('[apartment-layout] regenerate TIMED OUT — no options-ready within', REGEN_TIMEOUT_MS, 'ms');
                            this._regenerating = false;
                            this.modal.setBusy(false);
                            runtime.events?.emit('pryzm:toast', {
                                message: 'Layout regenerate timed out. Try a smaller program or simpler shell.',
                                severity: 'error',
                            });
                        }, REGEN_TIMEOUT_MS);
                        void requestApartmentLayout(runtime, next, this._lastCtx).then(res => {
                            if (!res.ok) {
                                console.warn('[apartment-layout] regenerate failed:', res.reason);
                                this._regenerating = false;
                                this.modal.setBusy(false);
                                if (this._regenerateTimer !== null) {
                                    clearTimeout(this._regenerateTimer);
                                    this._regenerateTimer = null;
                                }
                                runtime.events?.emit('pryzm:toast', {
                                    message: `Layout regenerate failed: ${res.reason ?? 'unknown'}`,
                                    severity: 'error',
                                });
                            }
                            // Success: the next 'apartment.layout-options-ready' event
                            // will land in the refresh-in-place branch above; the
                            // max-wait timer fires only if no event lands within
                            // REGEN_TIMEOUT_MS.
                        });
                    },
                }, this._lastPayload?.program, {
                    // §WINDOW-SYMBOLS (2026-05-29): perimeter openings the
                    // thumbnail overlays on the shell. Both fields are pass-
                    // through from the cached payload — D-TGL already
                    // collects them in layoutRequestPayload (§DOOR-AVOIDANCE).
                    ...(this._lastPayload?.windowSpansWorld
                        ? { windowSpansWorld: this._lastPayload.windowSpansWorld }
                        : {}),
                    ...(this._lastPayload?.doorSpansWorld
                        ? { doorSpansWorld: this._lastPayload.doorSpansWorld }
                        : {}),
                },
                // A.21.D5 follow-up — reduced-programme notice (requested vs built).
                this._noticeHtmlFor(options));
            } catch (err) {
                console.error('[apartment-layout] failed to open the options modal:', err);
                runtime.events?.emit('pryzm:toast', { message: `Could not open the layouts modal: ${String(err)}`, severity: 'error' });
            }
        });
        // §REJECT-SURFACE (2026-05-31): subscribe to the engine's rejection
        // event so the user sees WHY the algorithm declined to generate.
        // Previously the rejected branch (envelope too big/small,
        // deterministic engine declined, AI relay failed without procedural
        // fallback) dropped the result on the floor — the modal never opened
        // and the user thought the button was broken. Now every rejection
        // surfaces a toast with the engine's reason.
        const subReject = runtime.events.on('apartment.layout-rejected', (e: unknown) => {
            try {
                const evt = e as { runId?: string; reason?: string; attempts?: number } | null;
                const reason = (evt?.reason ?? 'Engine declined to generate layouts').trim();
                console.warn('[apartment-layout] REJECTED:', reason, `(attempts: ${evt?.attempts ?? '?'})`);
                // A.21.D5 follow-up — surface the engine's STRUCTURED §ENVELOPE-DIAGNOSTIC
                // reason (plate too small for the requested rooms at minimum sizes) PLUS an
                // actionable hint, instead of a bare/silent failure.
                runtime.events?.emit('pryzm:toast', {
                    message: `No apartment layout fits this plot: ${reason}. Try a larger plot or reduce the number of bedrooms / room sizes.`,
                    severity: 'error',
                });
                // If we were waiting on a regenerate, clear the in-flight state.
                if (this._regenerating) {
                    this._regenerating = false;
                    if (this._regenerateTimer !== null) {
                        clearTimeout(this._regenerateTimer);
                        this._regenerateTimer = null;
                    }
                }
            } catch (err) {
                console.error('[apartment-layout] failed to surface rejection:', err);
            }
        });
        console.log('[apartment-layout] controller attached — listening for options-ready + layout-rejected');
        const subOpts = sub;
        this._dispose = () => {
            if (typeof subOpts === 'function') subOpts();
            if (typeof subReject === 'function') subReject();
        };
    }

    /** Unsubscribe + close any open modal. */
    detach(): void {
        this._dispose?.();
        this._dispose = null;
        this._lastPayload = null;
        this._regenerating = false;
        if (this._regenerateTimer !== null) {
            clearTimeout(this._regenerateTimer);
            this._regenerateTimer = null;
        }
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
