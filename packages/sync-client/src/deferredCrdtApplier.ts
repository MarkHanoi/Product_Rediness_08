// @pryzm/sync-client — DeferredCrdtApplier (W5-4)
//
// ─── THE DEFECT THIS REMOVES ─────────────────────────────────────────────────
//
// `engineLauncher.bootstrap()` constructs the `YjsDocAdapter` behind
// `requestIdleCallback(cb, { timeout: 4000 })` — `setTimeout(cb, 1500)` where
// rIC is unavailable — and only THEN calls `runtime.bus.setCrdtApplier(...)`.
// Until that slot fires, `CommandBus._crdtApplier` is null and step 7 of
// `executeCommand` is skipped:
//
//     if (this._crdtApplier) { ... }        // ← null for the first ~1.5–4 s
//
// Every command executed in that window never reaches the Y.Doc.  There is no
// log, no counter and no refusal; `executeCommand` returns its record and the
// caller is told the mutation succeeded.  On this product that window covers
// project open and hydration, so it is not an edge case — it is most of the
// commands a session ever issues.
//
// This is the SAME defect class W5-3 removed one layer down (`if (!elementId)
// return`): a mutation discarded while the system reports success.  Doctrine:
// never let a silent drop stand — log it, count it, or refuse it.
//
// ─── THE FIX, AND WHY IT IS NOT "STOP DEFERRING" ─────────────────────────────
//
// Deferring the ADAPTER is legitimate: constructing a Y.Doc on the first-paint
// path costs main-thread time a solo session does not need, and this repository
// has a documented history of boot-ordering changes producing white screens
// (circular barrel at module load → undefined → blank).  Moving Y.Doc
// construction back into the synchronous boot path would be exactly that class
// of change.  So the deferral is KEPT and made NON-LOSSY instead: install this
// applier SYNCHRONOUSLY at boot, let it queue, and hand the queue to the real
// adapter when it arrives.  Nothing about module load order changes.
//
// The queue is BOUNDED.  An unbounded one would trade a data-loss bug for an
// OOM bug during a large generate.  Overflow is therefore possible — and it is
// counted, warned once, and readable via `hasLostCommands` FOREVER after,
// because a loss that stops being reportable once the adapter attaches is just
// a slower silent drop.

/** The downstream applier — in production `YjsDocAdapter.applyCommand`. */
export type CrdtApplyFn = (type: string, payload: Record<string, unknown>) => void;

export interface DeferredCrdtApplierStats {
  /** Commands currently held awaiting an adapter. */
  queued: number;
  /** Commands passed straight through after attach. */
  forwarded: number;
  /** Commands replayed out of the queue on attach. */
  replayed: number;
  /** Commands lost to queue overflow.  Non-zero is a finding, not noise. */
  dropped: number;
  /** Downstream applier invocations that threw. */
  applierErrors: number;
}

export interface DeferredCrdtApplierOptions {
  /**
   * Maximum commands held before the adapter attaches.  Default 5000 — ample
   * for project open + hydration, bounded well below anything that could
   * pressure memory during a large generate.
   */
  readonly maxQueued?: number;
  /**
   * Called (once per overflow episode) when the queue is full and a command is
   * dropped.  Defaults to `console.warn`.  A dropped command MUST be visible.
   */
  readonly onOverflow?: (message: string) => void;
}

const DEFAULT_MAX_QUEUED = 5_000;

export class DeferredCrdtApplier {
  private _downstream: CrdtApplyFn | null = null;
  private readonly _queue: Array<{ type: string; payload: Record<string, unknown> }> = [];
  private readonly _maxQueued: number;
  private readonly _onOverflow: (message: string) => void;
  private _overflowAnnounced = false;

  private _forwarded = 0;
  private _replayed = 0;
  private _dropped = 0;
  private _applierErrors = 0;

  constructor(opts?: DeferredCrdtApplierOptions) {
    this._maxQueued = opts?.maxQueued ?? DEFAULT_MAX_QUEUED;
    this._onOverflow = opts?.onOverflow ?? ((m) => { console.warn(m); });
  }

  /**
   * The function to hand to `CommandBus.setCrdtApplier()` — synchronously, at
   * boot, BEFORE the adapter exists.  Bound so it can be passed as a value.
   */
  readonly apply: CrdtApplyFn = (type, payload) => {
    if (this._downstream) {
      this._forwarded++;
      this._invoke(this._downstream, type, payload);
      return;
    }
    if (this._queue.length >= this._maxQueued) {
      this._dropped++;
      if (!this._overflowAnnounced) {
        this._overflowAnnounced = true;
        this._onOverflow(
          `[DeferredCrdtApplier] CRDT pre-adapter queue full at ${this._maxQueued} — ` +
          `commands are being dropped and will NOT reach the CRDT document. ` +
          `First dropped: type=${type}. This is a real replication gap, counted in ` +
          `stats.dropped; it is not a throttle.`,
        );
      }
      return;
    }
    this._queue.push({ type, payload });
  };

  /**
   * Attach the real applier and replay the queue IN DISPATCH ORDER — a create
   * must precede the update that edits it, or the update merges onto nothing.
   *
   * Idempotent-ish: attaching twice replaces the downstream and replays only
   * what is still queued (nothing, after the first attach).
   */
  attach(downstream: CrdtApplyFn): void {
    this._downstream = downstream;
    const pending = this._queue.splice(0, this._queue.length);
    for (const { type, payload } of pending) {
      this._replayed++;
      this._invoke(downstream, type, payload);
    }
  }

  /** True when any command was lost.  Stays true after attach, by design. */
  get hasLostCommands(): boolean { return this._dropped > 0; }

  get stats(): DeferredCrdtApplierStats {
    return {
      queued: this._queue.length,
      forwarded: this._forwarded,
      replayed: this._replayed,
      dropped: this._dropped,
      applierErrors: this._applierErrors,
    };
  }

  private _invoke(fn: CrdtApplyFn, type: string, payload: Record<string, unknown>): void {
    try {
      fn(type, payload);
    } catch (err) {
      // C08 §3.1 — CRDT failure must never break local command execution.
      this._applierErrors++;
      console.error(`[DeferredCrdtApplier] applier threw for type=${type}:`, err);
    }
  }
}
