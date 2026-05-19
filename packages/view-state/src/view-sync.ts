// view-sync — multi-view synchronisation primitives (post-2B closeout / ADR-0030).
//
// SCOPE (skeleton; full feature S46)
// ─────────────────────────────────────────────────────────────────────────────
// PRYZM 2 wants three classes of view sync:
//   * `selection` — selecting an element in view-A highlights it in view-B.
//   * `viewport` — panning/zooming view-A pans/zooms view-B in lockstep
//                  (subject to scale and projection compatibility).
//   * `cut-plane` — moving the cut plane in view-A's plan view propagates
//                  to dependent section views.
//
// At the closeout we ship the `ViewSyncBus`: a pure publisher that any
// view can broadcast to and any view can subscribe to.  The actual
// transport into the renderer (camera move, selection paint) is plumbing
// that lives in each canvas host and is wired in S46 D2.  By landing the
// bus + topic taxonomy now, the host code can take a stable type-side
// dependency.
//
// PURE: no DOM, no THREE, no Node-only globals.

export type SyncTopic = 'selection' | 'viewport' | 'cut-plane';

export interface SyncEvent {
  readonly topic: SyncTopic;
  readonly sourceViewId: string;
  /** Topic-specific payload — kept opaque to keep this module schema-light. */
  readonly payload: unknown;
}

export type SyncListener = (event: SyncEvent) => void;

export interface SyncSubscription {
  readonly viewId: string;
  readonly topics: ReadonlySet<SyncTopic>;
}

export class ViewSyncBus {
  private readonly subs = new Map<SyncListener, SyncSubscription>();
  private publishing = false;
  private readonly pending: SyncEvent[] = [];

  /** Subscribe to one or more topics from one or more source views.
   *  Returns a disposer.  When `viewId === sourceViewId` the listener
   *  is NOT called (a view doesn't sync with itself). */
  subscribe(
    viewId: string,
    topics: readonly SyncTopic[],
    listener: SyncListener,
  ): () => void {
    this.subs.set(listener, { viewId, topics: new Set(topics) });
    return () => { this.subs.delete(listener); };
  }

  /** Publish an event.  Re-entrancy is queued and drained at the end of
   *  the outer publish call so listeners can publish without deadlocking. */
  publish(event: SyncEvent): void {
    if (this.publishing) { this.pending.push(event); return; }
    this.publishing = true;
    try {
      this.fanout(event);
      while (this.pending.length > 0) {
        const next = this.pending.shift()!;
        this.fanout(next);
      }
    } finally {
      this.publishing = false;
    }
  }

  /** Diagnostic — listener count. */
  size(): number { return this.subs.size; }

  private fanout(event: SyncEvent): void {
    for (const [listener, sub] of this.subs) {
      if (sub.viewId === event.sourceViewId) continue;
      if (!sub.topics.has(event.topic)) continue;
      try { listener(event); }
      catch { /* listener errors must not crash the bus */ }
    }
  }
}
