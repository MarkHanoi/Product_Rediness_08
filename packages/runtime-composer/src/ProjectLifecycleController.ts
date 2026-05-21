/**
 * ProjectLifecycleController — C13 project-isolation teardown (Task 5.2).
 *
 * Owns the `pryzm-project-switch` window listener and executes the normative
 * 5-step teardown before Project B's stores are populated.
 *
 * Dependency policy: zero imports from `src/`.  The concrete BatchCoordinator
 * is injected via structural `IBatchCoordinatorTeardown` so this package stays
 * at L3 (packages/).
 *
 * Spec: C13 §4 (Wave 35 I-3/I-5).
 */

/** Minimal BatchCoordinator surface needed by the teardown sequence. */
export interface IBatchCoordinatorTeardown {
    readonly isBatching: boolean;
    readonly pendingRegistrationCount: number;
    forceReset(): void;
}

export class ProjectLifecycleController {
    private readonly _bc: IBatchCoordinatorTeardown;
    /** Optional callback fired at step 5 — for closure-private engine state (e.g. _levelCamReady = false). */
    private readonly _onAfterStep5: (() => void) | null;
    /**
     * §U-B1 (DAILY-USE-AUDIT 2026-05-20) — Optional callback to clear undo stacks
     * on project switch. Composer threads in `() => runtime.bus.clearUndoStacks()`
     * so the RingBufferUndoStack and legacy UndoStack are wiped BEFORE Project B
     * starts producing events. Without this, Ctrl+Z in B applies inverse patches
     * from A's edits (no-op on missing IDs / data corruption on ID collision).
     * Runs as Step 0 (before BatchCoordinator reset) so any in-flight commands
     * settle into the OLD stacks before we clear them.
     */
    private readonly _onClearUndoStacks: (() => void) | null;

    constructor(
        bc: IBatchCoordinatorTeardown,
        onAfterStep5: (() => void) | null = null,
        onClearUndoStacks: (() => void) | null = null,
    ) {
        this._bc = bc;
        this._onAfterStep5 = onAfterStep5;
        this._onClearUndoStacks = onClearUndoStacks;
    }

    /** Registers the pryzm-project-switch listener. Call once after engine boot. */
    bind(): void {
        window.addEventListener('pryzm-project-switch', this._handleProjectSwitch.bind(this));
    }

    private _handleProjectSwitch(e: Event): void {
        const detail   = (e as CustomEvent).detail ?? {};
        const fromId: string | null = detail.from ?? null;
        const toId:   string        = detail.to   ?? '(unknown)';

        console.log(`[ProjectLifecycleController] C13 project-switch: ${fromId ?? 'cold-boot'} → ${toId}`);

        const batchWasActive    = this._bc.isBatching;
        const regQueueCount     = this._bc.pendingRegistrationCount;
        const wallWasPaused     = (window as any).__engineTeardown?.isWallRebuildPaused     ?? false;
        const wallWasDiscarding = (window as any).__engineTeardown?.isWallRebuildDiscarding  ?? false;
        const pendingWallCount  = (window as any).__engineTeardown?.pendingWallEventCount    ?? 0;
        const cwWasPaused       = (window as any).__curtainWallRebuildControl?.isPaused?.()  ?? false;
        const slabWasPaused     = (window as any).__slabRebuildControl?.isPaused?.()         ?? false;

        const span = (window as any).runtime?.tracer?.startSpan?.('project.session.teardown') ?? null;
        try {
            // §U-B1 Step 0 — Clear undo stacks (RingBuffer + legacy UndoStack)
            // BEFORE any further teardown so that Project B never sees Project A's
            // inverse patches in either Ctrl+Z stack.
            try { this._onClearUndoStacks?.(); }
            catch (err) { console.warn('[ProjectLifecycleController] §U-B1 clearUndoStacks failed:', err); }

            // Step 1 — BatchCoordinator (C13 §3.1)
            this._bc.forceReset();

            // Step 2 — Wall rebuild pipeline (C13 §3.2 / §3.3 / §3.4)
            (window as any).__engineTeardown?.resetWallRebuildState();

            // Step 3 — CurtainWall builder (C13 §3.5)
            try { (window as any).__curtainWallRebuildControl?.resumeAndFlush?.(); }
            catch (err) { console.warn('[ProjectLifecycleController] C13 CW resumeAndFlush failed:', err); }

            // Step 4 — Slab builder (C13 §3.5)
            try { (window as any).__slabRebuildControl?.resumeAndFlush?.(); }
            catch (err) { console.warn('[ProjectLifecycleController] C13 Slab resumeAndFlush failed:', err); }

            // Step 5 — caller-supplied callback (e.g. _levelCamReady = false)
            this._onAfterStep5?.();

            span?.setAttributes?.({
                'priorProjectId':           fromId ?? 'cold-boot',
                'batchWasActive':           batchWasActive,
                'wallRebuildWasPaused':     wallWasPaused,
                'wallRebuildWasDiscarding': wallWasDiscarding,
                'pendingWallEventCount':    pendingWallCount,
                'pendingRegistrationCount': regQueueCount,
                'cwWasPaused':              cwWasPaused,
                'slabWasPaused':            slabWasPaused,
            });

            console.log('[ProjectLifecycleController] C13 teardown complete — Project B context loading');
        } finally {
            span?.end?.();
        }
    }
}
