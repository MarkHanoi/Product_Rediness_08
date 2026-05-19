// loader/HistoryStreamer.ts — history-events-on-demand (S23 D7).
//
// Spec source: `docs/00_NEW_ARCHITECTURE/phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • §S23 line 1099 — "History events on demand: the full event
//     log is not loaded on startup.  Events are fetched in segments
//     of 500 (matching the sync-server's `LoadEvents` pagination)
//     only when the user scrubs history."
//   • §S23 D7 (line 1241) — "Implement history events on demand:
//     `TierStreamedLoader.loadHistorySegment(fromSeq, toSeq)` —
//     fetches 500 events from sync server's `LoadEvents` handler,
//     applies to stores.  Used by undo-panel when it needs events
//     older than the in-memory undo stack."
//   • §S23 exit criterion #5 (line 1256) — "History-on-demand:
//     `loadHistorySegment(0, 499)` returns events correctly."
//
// PAGINATION CONTRACT — matches `apps/sync-server`'s `events.load`
// frame (PHASE-1D §S22 lines 919-945): default page size 500,
// `fromSeq` is INCLUSIVE, `toSeq` is INCLUSIVE.  Returning fewer
// events than requested means the tail of the log was reached.
//
// The fetcher callback is INJECTED so the loader stays
// transport-agnostic — production wires it to a WebSocket
// `events.load` round-trip; tests wire it to an in-memory array.

import { withLoaderSpan } from './otel.js';

/**
 * Mirror of `apps/sync-server`'s `LinearisedEvent` minus the
 * `_persistence-client_` brand types — kept structural so the
 * loader can compile without importing `@pryzm/sync-server`.  The
 * editor side maps these into `PersistedEvent` via the existing
 * `attachEventLog` adapter.
 */
export interface LinearisedHistoryEvent {
  readonly id: string;
  readonly sequenceNumber: number;
  readonly projectId: string;
  readonly timestamp: number;
  readonly userId: string;
  readonly clientId: string;
  readonly type: string;
  readonly payload: unknown;
}

/**
 * One page of events from the sync server.  `nextFromSeq` is
 * `null` when the tail of the log was reached; otherwise callers
 * pass it to a follow-up `loadHistorySegment` to continue
 * pagination.
 */
export interface HistorySegment {
  readonly events: readonly LinearisedHistoryEvent[];
  readonly fromSeq: number;
  readonly toSeq: number;
  readonly nextFromSeq: number | null;
}

/**
 * Pluggable history fetcher.  Production: a `events.load` WS
 * round-trip per page.  Tests: in-memory slice.  Limit MAY be
 * less than `(toSeq - fromSeq + 1)` if the server enforces a
 * per-page max (sync-server's hard cap is 1000 per page; default
 * is 500).
 */
export type HistoryFetcher = (req: {
  readonly projectId: string;
  readonly fromSeq: number;
  readonly limit: number;
}) => Promise<readonly LinearisedHistoryEvent[]>;

/** Default page size — matches sync-server's `events.load` default
 *  (PHASE-1D §S22 line 925). */
export const DEFAULT_HISTORY_PAGE_SIZE = 500;

/** Hard cap — matches sync-server's `events.load` enforced max
 *  (PHASE-1D §S22 line 925: "default 500, hard-cap 1000"). */
export const MAX_HISTORY_PAGE_SIZE = 1000;

export class HistoryStreamer {
  constructor(private readonly fetcher: HistoryFetcher) {}

  /**
   * Fetch one page of events.  `fromSeq` and `toSeq` are
   * INCLUSIVE — `loadHistorySegment(0, 499)` returns up to 500
   * events.  `toSeq < fromSeq` returns an empty segment without
   * a network round-trip.
   *
   * Throws `RangeError` when `(toSeq - fromSeq + 1) >
   * MAX_HISTORY_PAGE_SIZE` so the caller doesn't accidentally
   * blow past the server-enforced cap.
   */
  async loadHistorySegment(
    projectId: string,
    fromSeq: number,
    toSeq: number,
  ): Promise<HistorySegment> {
    if (!Number.isInteger(fromSeq) || fromSeq < 0) {
      throw new RangeError(`fromSeq must be a non-negative integer (got ${fromSeq})`);
    }
    if (!Number.isInteger(toSeq) || toSeq < 0) {
      throw new RangeError(`toSeq must be a non-negative integer (got ${toSeq})`);
    }
    if (toSeq < fromSeq) {
      return { events: [], fromSeq, toSeq, nextFromSeq: null };
    }
    const limit = toSeq - fromSeq + 1;
    if (limit > MAX_HISTORY_PAGE_SIZE) {
      throw new RangeError(
        `requested ${limit} events; max page is ${MAX_HISTORY_PAGE_SIZE}.  ` +
          `Loop with smaller pages instead.`,
      );
    }

    return withLoaderSpan(
      'pryzm.loader.history',
      {
        'pryzm.loader.projectId': projectId,
        'pryzm.loader.history.from_seq': fromSeq,
        'pryzm.loader.history.to_seq': toSeq,
        'pryzm.loader.history.limit': limit,
      },
      async (span) => {
        const events = await this.fetcher({ projectId, fromSeq, limit });
        // Defensive validation — server bugs MUST NOT corrupt the
        // editor's local sequence.  A missing or non-monotonic
        // sequence is a hard fail.
        for (let i = 0; i < events.length; i++) {
          const ev = events[i]!;
          const expected = fromSeq + i;
          if (ev.sequenceNumber !== expected) {
            throw new HistorySequenceGapError(expected, ev.sequenceNumber);
          }
        }
        const nextFromSeq =
          events.length === limit ? toSeq + 1 : null;
        span.setAttribute('pryzm.loader.history.event_count', events.length);
        span.setAttribute('pryzm.loader.history.next_from_seq', nextFromSeq ?? -1);
        return { events, fromSeq, toSeq, nextFromSeq };
      },
    );
  }
}

export class HistorySequenceGapError extends Error {
  constructor(
    public readonly expected: number,
    public readonly received: number,
  ) {
    super(
      `history segment has sequence gap: expected ${expected}, received ${received}`,
    );
    this.name = 'HistorySequenceGapError';
  }
}
