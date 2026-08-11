/**
 * @file initRemoteElementSync.ts — W5-4 "LEG B", the L7 half.
 *
 * ─── WHAT THIS CLOSES ────────────────────────────────────────────────────────
 *
 * W5-3 made 25 property verbs reach the CRDT document.  A conformance probe
 * then measured the read side and found it ABSENT: zero `.observe` calls on
 * `ELEMENTS_NAMESPACE`, and no caller anywhere in `apps/editor` for
 * `YjsDocAdapter.readElement()` / `readElementProperty()`.  Writes went in and
 * nothing came out, so a receiving client kept the CREATION-TIME value of every
 * property — a wall raised to 5 m by user A stayed 3 m for user B, confidently.
 *
 * `ElementSyncReader` (L3, `@pryzm/sync-client`) observes the element map and
 * emits `RemoteElementUpdate`.  THIS file is the L7 sink: it turns that update
 * into a command-bus dispatch, because P6 makes commands the only mutation path
 * and because dispatching is what triggers the store write, the geometry
 * rebuild and the repaint.  Writing a store directly from here would replicate
 * the value and NOT the redraw — the exact half-fix this task exists to avoid.
 *
 * ─── ECHO BREAK (two of them, and both are needed) ───────────────────────────
 *
 * 1. SAME DOCUMENT.  `ElementSyncReader` suppresses transactions whose Yjs
 *    origin is the adapter itself, so a command WE dispatch never comes back to
 *    us through our own reader.
 * 2. ACROSS DOCUMENTS.  Suppression (1) is not enough on a real transport.  The
 *    sink's dispatch re-enters `CommandBus` step 7 → the CRDT applier → our
 *    Y.Doc → back to the peer, whose reader dispatches it, whose applier sends
 *    it back … a value-stable ping-pong that never terminates.  So the sink
 *    marks its payload `_remoteSync: true` and {@link shouldReplicate} refuses
 *    to replicate it.  `_`-prefixed keys are the established local-dispatch-flag
 *    convention here (`_skipBridge`, `_recordUndo`) and are already excluded
 *    from replication by `extractElementProperties`, so the marker cannot leak
 *    into the document as a property.
 *
 * ─── WHAT THIS DOES NOT DO — stated, not left as an absence ──────────────────
 *
 * • It applies remote PROPERTY UPDATES to elements this client already has.
 *   A remote CREATE cannot be applied through `element.updateParameters` (the
 *   element has no local type and no store row), and minting one would need a
 *   per-type create route this task does not own.  Remote creates continue to
 *   arrive over the existing socket.io `RemoteCommandDispatcher` path.  Such
 *   updates are COUNTED as `unappliedRemoteCreates`, never dropped quietly.
 * • C66 §1 — none of this makes collaboration work in production.  There is no
 *   deployed CRDT transport (L-391: the websocket provider is OFF by default and
 *   no sync server ships), so nothing carries document A's update to document B.
 *   Two real users still do not see each other's edits through this path.  No
 *   capacity tier is claimed.
 */

import { ElementSyncReader, type RemoteElementUpdate } from '@pryzm/sync-client';
import type { YjsDocAdapter } from '@pryzm/sync-client';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';

/**
 * Payload marker identifying a dispatch that ORIGINATED from a remote CRDT
 * change.  Replicating it back is the ping-pong described above.
 */
export const REMOTE_SYNC_FLAG = '_remoteSync';

/**
 * Guard for the CRDT applier: `false` when this dispatch came from the remote
 * read-back path and must not be written back into the document.
 */
export function shouldReplicate(payload: Record<string, unknown>): boolean {
  return payload[REMOTE_SYNC_FLAG] !== true;
}

/** Counters — every refusal on this path is legible (P8, doctrine 3). */
export interface RemoteElementSyncStats {
  /** Updates dispatched onto the bus. */
  dispatched: number;
  /** Updates for elements this client does not know — see the header. */
  unappliedRemoteCreates: number;
  /** Updates whose properties were all routing/empty after filtering. */
  emptyAfterFilter: number;
  /** Bus dispatches that rejected or threw. */
  dispatchErrors: number;
}

export interface RemoteElementSyncHandle {
  readonly reader: ElementSyncReader;
  readonly stats: () => Readonly<RemoteElementSyncStats>;
  /** ADR-049 — start observing a level-scoped document. */
  readonly observeLevel: (levelId: string) => void;
  readonly dispose: () => void;
}

type BusLike = {
  executeCommand?: (type: string, payload: unknown) => Promise<unknown> | unknown;
};

/**
 * Wire the CRDT element read-back path for one adapter.
 *
 * @param adapter  the live `YjsDocAdapter` (constructed by `engineLauncher`).
 * @param getBus   resolves the command bus lazily — the reader outlives any
 *                 single bus reference and boot order must not be assumed.
 */
export function initRemoteElementSync(
  adapter: YjsDocAdapter,
  getBus: () => BusLike | undefined,
): RemoteElementSyncHandle {
  const stats: RemoteElementSyncStats = {
    dispatched: 0,
    unappliedRemoteCreates: 0,
    emptyAfterFilter: 0,
    dispatchErrors: 0,
  };
  const warnedUnknownIds = new Set<string>();

  const sink = (update: RemoteElementUpdate): void => {
    // The receiving client must know WHAT this element is to route the update
    // to the right store.  `elementRegistry` is the authoritative id → type map
    // this app already uses for exactly that (RemoteCommandDispatcher's
    // duplicate-create guard reads the same registry).
    const elementType = elementRegistry.getStoreType(update.elementId);
    if (elementType === undefined) {
      stats.unappliedRemoteCreates++;
      if (!warnedUnknownIds.has(update.elementId)) {
        warnedUnknownIds.add(update.elementId);
        console.warn(
          `[RemoteElementSync] remote change for element '${update.elementId}' ` +
          `(kind=${update.kind}) is NOT APPLIED: this client has no such element, ` +
          `so there is no type to route it to. Remote CREATES arrive over the ` +
          `socket.io command path, not this one. Counted as ` +
          `unappliedRemoteCreates — this is a known boundary, not a failure to ignore.`,
        );
      }
      return;
    }

    const parameters: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(update.properties)) {
      if (k.startsWith('_')) continue;      // local dispatch flags never apply
      if (k === 'id' || k === 'levelId') continue;  // routing, not properties
      parameters[k] = v;
    }
    if (Object.keys(parameters).length === 0) { stats.emptyAfterFilter++; return; }

    const bus = getBus();
    if (!bus?.executeCommand) {
      stats.dispatchErrors++;
      console.warn(
        `[RemoteElementSync] no command bus available — remote change to ` +
        `'${update.elementId}' was NOT applied and this view is now stale.`,
      );
      return;
    }

    try {
      stats.dispatched++;
      const r = bus.executeCommand('element.updateParameters', {
        elementId: update.elementId,
        elementType,
        parameters,
        // Echo break (2) — see the header.  Excluded from replication both by
        // `shouldReplicate` below and by the `_`-prefix rule in
        // `extractElementProperties`, so it can never become a property.
        [REMOTE_SYNC_FLAG]: true,
      });
      void Promise.resolve(r).catch((err: unknown) => {
        stats.dispatchErrors++;
        console.warn(
          `[RemoteElementSync] dispatch rejected for '${update.elementId}' — ` +
          `the local view of this element is STALE:`, err,
        );
      });
    } catch (err) {
      stats.dispatchErrors++;
      console.warn(
        `[RemoteElementSync] dispatch threw for '${update.elementId}' — ` +
        `the local view of this element is STALE:`, err,
      );
    }
  };

  const reader = new ElementSyncReader(adapter, sink);

  return {
    reader,
    stats: () => ({ ...stats }),
    observeLevel: (levelId: string) => { reader.observeLevel(levelId); },
    dispose: () => { reader.dispose(); },
  };
}
