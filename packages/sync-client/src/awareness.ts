// @pryzm/sync-client — PryzmAwareness wrapper.
//
// Lifecycle:
//   • S43 (skeleton) — wire shape frozen; setLocalState + getStates only.
//   • S44 (this file, full runtime) — per-field setters with coalescing,
//     5 KB/s/peer throttle accounting, byte-budget surface for the bench.
//   • S45 — heldLocks setter wired to the soft-lock subsystem (no wire-shape
//     change because the field was reserved at S43).
//
// The wire shape mirrors spec §S44 line 290-299; this file is the canonical
// source of truth for the shape.  Per ADR-0033 §2.6 the shape is FROZEN —
// changing it requires a protocol-version bump.
//
// THROTTLING CONTRACT (spec §S44 line 315-318 + `[strategic ADR-018]` T1.8)
// ─────────────────────────────────────────────────────────────────────────────
// Per the spec daily plan D6: "Throttle + perf measurement (5 KB/s/peer cap)."
// Per spec line 315-318:
//   • cursor       — coalesced at 50 ms (rapid mouse-move drops intermediate)
//   • selection    — immediate (no throttle)
//   • activeTool   — immediate
//   • activeViewId — immediate
//   • heldLocks    — only when the local lock state actually changes
//
// Implementation strategy:
//   • Per-field setters mutate an internal "next" state.
//   • Cursor setter schedules a setTimeout(50 ms) to flush; further calls
//     within the window REPLACE (coalesce) the pending cursor.
//   • Immediate setters flush synchronously (writing the full state with the
//     cursor at its currently-pending value).
//   • Every flush updates `lastActivity`.
//
// PURE: no DOM, no THREE, no transport — `provider` is the only side-effect
// surface and it's injectable.

import type { ProviderLike, UserId, ElementId, ToolId } from './types.js';

// ─── PryzmAwarenessState — the wire shape ──────────────────────────────────
//
// Per spec §S44 line 290-299.  This is what every connected peer broadcasts
// about itself; every connected peer receives this from every other peer.
// Keep it small — the 5 KB/s/peer cap (per `[strategic ADR-018]` T1.8) is
// computed against this shape encoded as JSON + the awareness throttle.

export interface PryzmAwarenessState {
  readonly userId: UserId;
  readonly displayName: string;
  /** Cursor position in the active view's local coords.  null when the
   *  cursor is offscreen or the user is keyboarding.  Throttled at 50 ms
   *  per spec §S44 line 317. */
  readonly cursor: { readonly x: number; readonly y: number; readonly viewId: string } | null;
  /** The view this user is currently looking at.  Default `'main-3d'`. */
  readonly activeViewId: string;
  /** The tool this user has selected.  null when no tool is active. */
  readonly activeTool: ToolId | null;
  /** Currently-selected elements.  Updated immediately (not throttled)
   *  per spec §S44 line 317. */
  readonly selection: readonly ElementId[];
  /** Mirror of soft-lock state for visibility — the editor paints a
   *  "locked by Bob" badge by reading this instead of querying the
   *  soft_locks table.  Updated only on lock state change.  Wire-shape
   *  frozen here per ADR-0033 §2.6 so S45 doesn't need a protocol bump. */
  readonly heldLocks: readonly ElementId[];
  /** Wall-clock timestamp of last meaningful activity (commit, view-change,
   *  tool-change).  Used by the peer-list UI to show idle peers. */
  readonly lastActivity: number;
}

export interface PryzmAwarenessUserContext {
  readonly id: UserId;
  readonly displayName: string;
}

export interface PryzmAwarenessOptions {
  /** Initial active view ID.  Default `'main-3d'`. */
  readonly initialViewId?: string;
  /** Cursor coalescing window in milliseconds.  Default 50 (spec line 317). */
  readonly cursorCoalesceMs?: number;
  /** Optional clock injection for tests. */
  readonly now?: () => number;
}

const DEFAULT_CURSOR_COALESCE_MS = 50;
const DEFAULT_VIEW_ID = 'main-3d';

/** Bytes/sec budget per peer per `[strategic ADR-018]` T1.8 + spec line 315. */
export const AWARENESS_BYTES_PER_SEC_BUDGET = 5_000;

/** Diagnostic counters surfaced for the bench harness in
 *  `apps/bench/src/benches/awareness-throughput.bench.ts`. */
export interface AwarenessThroughputStats {
  /** Total bytes written to the provider (sum of JSON-encoded local-state). */
  readonly bytesWritten: number;
  /** Total flush() calls that actually pushed state to the provider. */
  readonly flushes: number;
  /** Total cursor sets received (some are coalesced into a single flush). */
  readonly cursorSetsReceived: number;
  /** Total cursor flushes (after coalescing — so flushes ≤ sets). */
  readonly cursorFlushes: number;
}

/** PryzmAwareness — full S44 runtime.
 *
 *  Ships:
 *    • per-field setters: `setCursor`, `setSelection`, `setActiveTool`,
 *      `setActiveView`, `setHeldLocks`
 *    • cursor coalescing at the configured window (default 50 ms)
 *    • immediate flush of selection / tool / view / heldLocks
 *    • `getThroughputStats()` — bytes/flushes counters for the bench
 *    • `dispose()` — cancels pending coalesce timer
 *
 *  The wire shape is identical to S43's; consumers continue to work.
 */
export class PryzmAwareness {
  // D.5.A.6 (2026-04-30) TS-sweep: the `private readonly user` field was
  // assigned in the ctor but never read — two of its fields (`id`,
  // `displayName`) are already projected into `this.state.userId/displayName`
  // below, so the duplicate hold was dead state.  If a future S44+ step
  // needs `user.role`/`user.email` etc., re-add the field here AND wire it
  // into a reader (don't re-introduce dead-private state).  Surfaced once
  // `runtime-composer/types.ts` started type-importing this class for D.5.A.6.
  private readonly cursorCoalesceMs: number;
  private readonly now: () => number;
  /** The current "next" state — what we'd push if we flushed right now. */
  private state: PryzmAwarenessState;
  /** Pending cursor coalesce timer; null when idle. */
  private cursorTimer: ReturnType<typeof setTimeout> | null = null;
  /** Throughput counters. */
  private bytesWritten = 0;
  private flushes = 0;
  private cursorSetsReceived = 0;
  private cursorFlushes = 0;
  private disposed = false;

  constructor(
    private readonly provider: ProviderLike,
    user: PryzmAwarenessUserContext,
    initialViewIdOrOptions?: string | PryzmAwarenessOptions,
  ) {
    // Backward-compatible signature: third arg can be a string (legacy S43
    // call sites) or an options bag (S44 call sites).
    const options: PryzmAwarenessOptions =
      typeof initialViewIdOrOptions === 'string'
        ? { initialViewId: initialViewIdOrOptions }
        : (initialViewIdOrOptions ?? {});
    this.cursorCoalesceMs = options.cursorCoalesceMs ?? DEFAULT_CURSOR_COALESCE_MS;
    this.now = options.now ?? Date.now;

    this.state = {
      userId: user.id,
      displayName: user.displayName,
      cursor: null,
      activeViewId: options.initialViewId ?? DEFAULT_VIEW_ID,
      activeTool: null,
      selection: [],
      heldLocks: [],
      lastActivity: this.now(),
    };
    this.flushNow();
  }

  // ─── Per-field setters ───────────────────────────────────────────────────

  /** Set the cursor position in the active view's local coords.  Coalesced
   *  at the cursor-coalesce window (default 50 ms) — rapid mouse-move calls
   *  collapse to a single flush carrying the most-recent position.
   *
   *  Pass `null` to clear the cursor (e.g. mouse left the canvas); the clear
   *  is also coalesced — the most-recent value wins. */
  setCursor(cursor: { x: number; y: number; viewId: string } | null): void {
    if (this.disposed) return;
    this.cursorSetsReceived++;
    this.state = { ...this.state, cursor: cursor === null ? null : { ...cursor } };
    if (this.cursorTimer !== null) return;  // pending flush will pick it up
    this.cursorTimer = setTimeout(() => {
      this.cursorTimer = null;
      this.cursorFlushes++;
      this.bumpActivityAndFlush();
    }, this.cursorCoalesceMs);
  }

  /** Set the current selection.  Immediate flush per spec line 317. */
  setSelection(selection: readonly ElementId[]): void {
    if (this.disposed) return;
    if (sameStringArray(this.state.selection, selection)) return;  // no-op
    this.state = { ...this.state, selection: [...selection] };
    this.bumpActivityAndFlush();
  }

  /** Set the active tool.  Immediate flush per spec line 317.  Pass `null`
   *  to indicate no tool is active (e.g. selection mode). */
  setActiveTool(toolId: ToolId | null): void {
    if (this.disposed) return;
    if (this.state.activeTool === toolId) return;
    this.state = { ...this.state, activeTool: toolId };
    this.bumpActivityAndFlush();
  }

  /** Set the active view.  Immediate flush.  When the active view changes
   *  the cursor is also cleared (the cursor coords are view-local; carrying
   *  them across a view change would render in the wrong place). */
  setActiveView(viewId: string): void {
    if (this.disposed) return;
    if (this.state.activeViewId === viewId) return;
    this.state = { ...this.state, activeViewId: viewId, cursor: null };
    this.bumpActivityAndFlush();
  }

  /** Set the held-locks list.  Immediate flush, but only when the list
   *  actually changes — the spec line 317 contract is "Updated only on
   *  lock state change". */
  setHeldLocks(locks: readonly ElementId[]): void {
    if (this.disposed) return;
    if (sameStringArray(this.state.heldLocks, locks)) return;
    this.state = { ...this.state, heldLocks: [...locks] };
    this.bumpActivityAndFlush();
  }

  // ─── Legacy / escape-hatch ──────────────────────────────────────────────

  /** Replace the entire local state.  Prefer the per-field setters — they
   *  coalesce + throttle correctly.  Direct callers (mainly tests) accept
   *  the unthrottled path.  Cancels any pending cursor coalesce.  The
   *  caller's `lastActivity` is preserved verbatim (this is a true replace
   *  — use the per-field setters if you want activity bumping). */
  setLocalState(state: PryzmAwarenessState | null): void {
    if (this.disposed) return;
    this.cancelCursorTimer();
    if (state === null) {
      this.provider.awareness?.setLocalState(null);
      this.flushes++;
      return;
    }
    this.state = { ...state };
    this.flushNow();
  }

  // ─── Read surface ────────────────────────────────────────────────────────

  /** Return the current state map keyed by `provider.awareness.clientID`.
   *  The local peer's own state is included.  Snapshot only — the map is
   *  copied, so mutations to the result do NOT affect provider state. */
  getStates(): Map<number, PryzmAwarenessState> {
    const out = new Map<number, PryzmAwarenessState>();
    const raw = this.provider.awareness?.getStates();
    if (!raw) return out;
    for (const [peerId, state] of raw) {
      out.set(peerId, state as unknown as PryzmAwarenessState);
    }
    return out;
  }

  /** Read the local peer's current state — what would be flushed next. */
  getLocalState(): PryzmAwarenessState { return this.state; }

  /** Subscribe to `'change'` events.  Listener fires after every state
   *  update from any peer (including this one). */
  on(event: 'change', fn: () => void): () => void {
    this.provider.awareness?.on(event, fn);
    return () => { this.provider.awareness?.off(event, fn); };
  }

  /** Diagnostic counters for the bench harness.  Reset each instance lifetime. */
  getThroughputStats(): AwarenessThroughputStats {
    return {
      bytesWritten: this.bytesWritten,
      flushes: this.flushes,
      cursorSetsReceived: this.cursorSetsReceived,
      cursorFlushes: this.cursorFlushes,
    };
  }

  /** Force a flush of any pending coalesced cursor.  Mainly for tests + the
   *  bench harness so they don't have to wait the coalesce window. */
  flush(): void {
    if (this.disposed) return;
    if (this.cursorTimer !== null) {
      clearTimeout(this.cursorTimer);
      this.cursorTimer = null;
      this.cursorFlushes++;
    }
    this.bumpActivityAndFlush();
  }

  /** Tear down the awareness wrapper — cancels any pending coalesce timer.
   *  Does NOT clear the local state on the provider; call setLocalState(null)
   *  first if you want presence to drop. */
  dispose(): void {
    if (this.disposed) return;
    this.cancelCursorTimer();
    this.disposed = true;
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  private bumpActivityAndFlush(): void {
    this.state = { ...this.state, lastActivity: this.now() };
    this.flushNow();
  }

  private flushNow(): void {
    const encoded = JSON.stringify(this.state);
    this.bytesWritten += encoded.length;
    this.flushes++;
    // The provider's setLocalState accepts the parsed object (NOT the JSON
    // string).  We compute the encoded length only for the byte budget.
    this.provider.awareness?.setLocalState(this.state as unknown as Record<string, unknown>);
  }

  private cancelCursorTimer(): void {
    if (this.cursorTimer !== null) {
      clearTimeout(this.cursorTimer);
      this.cursorTimer = null;
    }
  }
}

function sameStringArray(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
