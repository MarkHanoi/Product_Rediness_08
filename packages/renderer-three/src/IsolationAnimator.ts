// C27 INS-α-7 (BIM 3.0 Inspect Model) — IsolationAnimator (L4).
//
// The ONE place in the codebase that writes `mesh.material.opacity` for
// inspect-driven isolation.  CI gate `tools/ga-gate/check-visibility-intent.ts`
// flags every direct `material.opacity = N` write outside this file.
//
// Per C27 §1.3 isolation is a visibility intent: the L1 resolver
// (`buildIsolationIntent` in `packages/visibility/`) computes per-element
// `IsolationOverride` records, the L3 `IsolationStateStore` (in
// `packages/stores/`) holds the active override map, and this L4 animator
// drives the 200 ms fade transition on the mesh materials.
//
// Per C27 §1.4 the animator MUST subscribe to a FrameScheduler at the
// `render` priority and MUST NOT call `requestAnimationFrame` directly
// (P3 — single rAF owner is `packages/runtime-composer/src/scheduler.ts`).
// Per P2 only `packages/renderer-three/` may touch THREE objects, so the
// material write lives here.
//
// This slice (α-7) ships the animator class only.  All collaborators
// (FrameScheduler, IsolationStateStore, element-mesh registry) are
// injected via duck-typed interfaces — α-8 wires the live composeRuntime
// store / scheduler / mesh registry to this animator without changing it.
//
// L4 PURITY by injection:
//   - The only `@pryzm/*` import is `@pryzm/schemas` (L0) for the
//     `IsolationOverride` / `IsolationTier` types.
//   - NO import of `@pryzm/stores`, `@pryzm/visibility`, or
//     `@pryzm/runtime-composer`.
//   - NO `import * as THREE` — the MeshLike interface duck-types the
//     subset the animator touches so it is unit-testable without a real
//     THREE renderer.  THREE imports remain available in this package
//     for other files (P2).
//
// References:
//   - C27-BIM3-INSPECT-MODEL.md §1.3, §1.4, §5.4
//   - C04-RENDERING-AND-SCHEDULING.md §2 (FrameScheduler), §2.3 (priorities)

import type { IsolationOverride } from '@pryzm/schemas';

// ── Duck-typed collaborator interfaces ────────────────────────────────────────

/**
 * Read-only view onto the active isolation state.  Mirrors the shape
 * returned by `IsolationStateStore.get()` (in `@pryzm/stores`) — but the
 * animator imports nothing from L3 so the interface is duck-typed here.
 */
export interface IsolationStateProvider {
    get(): {
        readonly overrides: ReadonlyMap<string, IsolationOverride>;
        readonly isActive: boolean;
    };
    /** Subscribe to state-change notifications.  Returns an unsubscribe disposer. */
    subscribe(listener: () => void): () => void;
}

/**
 * Subset of `FrameScheduler` ([C04 §2]) consumed by the animator.  Only
 * the `render` priority is permitted — the animator runs after physics +
 * update + scene-committer but before post (screenshot / telemetry).
 */
export interface FrameSchedulerLike {
    /** Subscribe at `render` priority.  Returns an unsubscribe disposer. */
    onFrame(priority: 'render', cb: (dt: number) => void): () => void;
}

/**
 * Bridge from element ids to the THREE meshes that should fade with that
 * element.  Concrete wiring (e.g. scanning the scene graph for elements
 * tagged with `userData.elementId`) is α-8's responsibility.
 */
export interface ElementMeshRegistry {
    /**
     * Returns the array of meshes for the given element id.  An empty
     * array is fine (e.g. instanced-aggregate elements that don't have
     * per-element meshes today) — the animator silently skips them.
     */
    getMeshesForElement(elementId: string): ReadonlyArray<MeshLike>;
    /**
     * Returns all currently-tracked element ids.  Used during `stop()`
     * to restore every known element to its default visibility — the
     * animator never reaches outside this list.
     */
    listElementIds(): ReadonlyArray<string>;
}

/**
 * Minimal mesh-like shape — duck-types `THREE.Mesh` for the subset the
 * animator writes.  Keeps the animator unit-testable without a real THREE
 * renderer (the test suite passes plain `{ material, visible }` objects).
 */
export interface MeshLike {
    material: { opacity: number; transparent: boolean };
    visible: boolean;
}

/**
 * Animator options.  All fields optional with C27 §1.4 defaults.
 *
 *   - `fadeDurationMs`    — fade transition duration.  Default 200 ms
 *                           (C27 §1.4).
 *   - `staggerThreshold`  — element-count threshold above which the
 *                           initial transition splits into chunks across
 *                           consecutive scheduler frames.  Default 1000.
 *   - `staggerChunkSize`  — chunk size used when staggering.  Default
 *                           200 elements per scheduler frame.
 *   - `now`               — clock function (defaults to `Date.now`).
 *                           Override in tests to make progress deterministic
 *                           without leaning on real wall-clock time.
 */
export interface IsolationAnimatorOptions {
    fadeDurationMs?: number;
    staggerThreshold?: number;
    staggerChunkSize?: number;
    now?: () => number;
}

// ── Internal animation state ──────────────────────────────────────────────────

/** Per-element fade descriptor.  Tracks where we are + where we're going. */
interface FadeState {
    /** Opacity at the moment the current fade started — interpolation source. */
    startOpacity: number;
    /** Final opacity of the current fade — interpolation target. */
    targetOpacity: number;
    /** Final `visible` flag.  Applied at fade end (HIDDEN only). */
    targetVisible: boolean;
    /** Clock timestamp (via opts.now) at which the current fade began. */
    startMs: number;
    /** Last opacity actually written to meshes — interpolation source on interrupt. */
    currentOpacity: number;
    /** True once finalized — kept around briefly so `tickFn` can no-op. */
    finalized: boolean;
}

/**
 * IsolationAnimator — drives the 200 ms fade between isolation states.
 *
 * Lifecycle:
 *   const a = new IsolationAnimator(state, scheduler, registry);
 *   a.start();   // subscribe to scheduler + state
 *   …
 *   a.stop();    // unsubscribe + restore every element to default
 *
 * Multiple `start()` calls are safe (idempotent).  `stop()` without
 * `start()` is safe (idempotent).  After `stop()`, state-change
 * notifications are ignored.
 */
export class IsolationAnimator {
    private readonly _fadeDurationMs: number;
    private readonly _staggerThreshold: number;
    private readonly _staggerChunkSize: number;
    private readonly _now: () => number;

    private _running = false;
    private _unsubFrame: (() => void) | null = null;
    private _unsubState: (() => void) | null = null;

    /** Per-element fade state.  Element ids absent here are at their default. */
    private readonly _fades = new Map<string, FadeState>();

    /**
     * Pending element ids waiting to be initialised at the next scheduler
     * tick.  Populated by `_planTransition` when the element count exceeds
     * `staggerThreshold` so we don't pay the full O(N) cost in one frame.
     */
    private readonly _pendingInit: string[] = [];
    /** Snapshot of overrides at the moment the pending queue was filled. */
    private _pendingOverrides: ReadonlyMap<string, IsolationOverride> | null = null;
    /** Target `isActive` for the pending queue (true → apply, false → restore). */
    private _pendingIsActive = false;

    constructor(
        private readonly _state: IsolationStateProvider,
        private readonly _scheduler: FrameSchedulerLike,
        private readonly _registry: ElementMeshRegistry,
        opts: IsolationAnimatorOptions = {},
    ) {
        this._fadeDurationMs = opts.fadeDurationMs ?? 200;
        this._staggerThreshold = opts.staggerThreshold ?? 1000;
        this._staggerChunkSize = opts.staggerChunkSize ?? 200;
        this._now = opts.now ?? Date.now;
    }

    /**
     * Subscribe to the scheduler + the state provider.  Idempotent — a
     * second call while already running is a silent no-op.
     */
    start(): void {
        if (this._running) return;
        this._running = true;
        this._unsubFrame = this._scheduler.onFrame('render', dt => this._tick(dt));
        this._unsubState = this._state.subscribe(() => this._onStateChange());
        // Initial sync — if the state is already active when we start,
        // begin the corresponding fade immediately rather than waiting
        // for the next state change.
        const initial = this._state.get();
        if (initial.isActive) this._planTransition(initial.overrides, true);
    }

    /**
     * Unsubscribe from the scheduler + state provider.  Restores every
     * element listed by the registry to default visibility (opacity 1,
     * transparent false, visible true).  Idempotent.
     */
    stop(): void {
        if (!this._running) return;
        this._running = false;
        if (this._unsubFrame) { this._unsubFrame(); this._unsubFrame = null; }
        if (this._unsubState) { this._unsubState(); this._unsubState = null; }
        // Restore every known element to its default appearance.
        for (const id of this._registry.listElementIds()) {
            this._writeAll(id, 1, true);
        }
        this._fades.clear();
        this._pendingInit.length = 0;
        this._pendingOverrides = null;
        this._pendingIsActive = false;
    }

    // ── State-change handling ────────────────────────────────────────────────

    /**
     * Hooked into `state.subscribe`.  Reads the fresh snapshot + plans the
     * transition (start a fade towards every override target — or back to
     * default when `isActive` flipped off).
     */
    private _onStateChange(): void {
        if (!this._running) return;
        const snap = this._state.get();
        this._planTransition(snap.overrides, snap.isActive);
    }

    /**
     * Plan a transition towards the supplied overrides.  When `isActive`
     * is false this means "back to default" — every currently-faded
     * element gets a target of {opacity: 1, visible: true}.  When true,
     * each override's tier maps to a target per C27 §5.1.
     *
     * Above `staggerThreshold` elements we defer init to the scheduler
     * frame (chunk size = `staggerChunkSize`) to keep the state-change
     * step inside the frame budget.
     */
    private _planTransition(
        overrides: ReadonlyMap<string, IsolationOverride>,
        isActive: boolean,
    ): void {
        if (isActive) {
            const ids = Array.from(overrides.keys());
            if (ids.length > this._staggerThreshold) {
                // Defer to the scheduler — `_tick` drains chunks.
                this._pendingInit.length = 0;
                this._pendingInit.push(...ids);
                this._pendingOverrides = overrides;
                this._pendingIsActive = true;
                return;
            }
            this._pendingInit.length = 0;
            this._pendingOverrides = null;
            for (const id of ids) {
                this._startFadeForElement(id, overrides.get(id)!);
            }
        } else {
            // Restore phase — every currently-faded element fades back.
            const ids = Array.from(this._fades.keys());
            if (ids.length > this._staggerThreshold) {
                this._pendingInit.length = 0;
                this._pendingInit.push(...ids);
                this._pendingOverrides = null;
                this._pendingIsActive = false;
                return;
            }
            this._pendingInit.length = 0;
            for (const id of ids) {
                this._startRestoreForElement(id);
            }
        }
    }

    /** Map a single override to a target + start (or restart) the fade. */
    private _startFadeForElement(id: string, override: IsolationOverride): void {
        const target = tierToTarget(override);
        const existing = this._fades.get(id);
        const startOpacity = existing ? existing.currentOpacity : 1;
        this._fades.set(id, {
            startOpacity,
            targetOpacity: clamp01(target.opacity),
            targetVisible: target.visible,
            startMs: this._now(),
            currentOpacity: startOpacity,
            finalized: false,
        });
    }

    /** Restore a single element back to default — opacity 1, visible true. */
    private _startRestoreForElement(id: string): void {
        const existing = this._fades.get(id);
        const startOpacity = existing ? existing.currentOpacity : 1;
        this._fades.set(id, {
            startOpacity,
            targetOpacity: 1,
            targetVisible: true,
            startMs: this._now(),
            currentOpacity: startOpacity,
            finalized: false,
        });
    }

    // ── Per-frame tick (driven by FrameScheduler) ────────────────────────────

    /**
     * Per-frame callback registered at `render` priority.  Drains the
     * stagger queue first (so large transitions don't blow the frame
     * budget), then advances every active fade by `dt`.
     *
     * `dt` is accepted for parity with the scheduler interface; the
     * animator computes progress against `opts.now()` so fades remain
     * smooth across pause/resume boundaries.
     */
    private _tick(_dt: number): void {
        // 1. Drain stagger queue.
        if (this._pendingInit.length > 0) {
            const chunk = this._pendingInit.splice(0, this._staggerChunkSize);
            for (const id of chunk) {
                if (this._pendingIsActive && this._pendingOverrides) {
                    const ov = this._pendingOverrides.get(id);
                    if (ov) this._startFadeForElement(id, ov);
                } else {
                    this._startRestoreForElement(id);
                }
            }
            if (this._pendingInit.length === 0) {
                this._pendingOverrides = null;
            }
        }

        // 2. Advance every active fade.
        const now = this._now();
        const finished: string[] = [];
        for (const [id, fade] of this._fades) {
            if (fade.finalized) continue;
            const elapsed = now - fade.startMs;
            const progress = this._fadeDurationMs <= 0
                ? 1
                : clamp01(elapsed / this._fadeDurationMs);
            const opacity = clamp01(
                fade.startOpacity + (fade.targetOpacity - fade.startOpacity) * progress,
            );
            fade.currentOpacity = opacity;
            // Determine `visible` for the active mid-fade frame.  HIDDEN
            // elements stay visible until the fade actually completes —
            // otherwise they'd pop out instantly at fade start.
            const midVisible = fade.targetVisible || progress < 1;
            this._writeAll(id, opacity, midVisible);

            if (progress >= 1) {
                // Finalize: snap to target, write final visible flag.
                fade.currentOpacity = fade.targetOpacity;
                fade.finalized = true;
                this._writeAll(id, fade.targetOpacity, fade.targetVisible);
                // Element is fully back to default → drop from active set.
                if (fade.targetOpacity === 1 && fade.targetVisible) {
                    finished.push(id);
                }
            }
        }
        for (const id of finished) this._fades.delete(id);
    }

    /**
     * Write opacity + visible to every mesh for an element id.  Sets
     * `transparent = (opacity < 1)`.  Silent when the registry returns
     * an empty mesh array (e.g. instanced-aggregate stand-ins).
     */
    private _writeAll(id: string, opacity: number, visible: boolean): void {
        const meshes = this._registry.getMeshesForElement(id);
        const transparent = opacity < 1;
        for (const m of meshes) {
            m.material.opacity = opacity;
            m.material.transparent = transparent;
            m.visible = visible;
        }
    }
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/** Clamp `n` into the inclusive [0, 1] interval. */
function clamp01(n: number): number {
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
}

/**
 * Map an `IsolationOverride` to {opacity, visible} per C27 §5.1.
 *
 *   FULL    → opacity 1,  visible true
 *   DIMMED  → opacity = override.opacity (default 0.5), visible true
 *   HIDDEN  → opacity 0,  visible false at fade end
 */
function tierToTarget(
    override: IsolationOverride,
): { opacity: number; visible: boolean } {
    switch (override.tier) {
        case 'FULL':
            return { opacity: 1, visible: true };
        case 'DIMMED':
            return { opacity: override.opacity ?? 0.5, visible: true };
        case 'HIDDEN':
            return { opacity: 0, visible: false };
    }
}
