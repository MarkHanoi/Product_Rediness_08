// @pryzm/sync-client — ElementSyncReader (W5-4, "LEG B")
//
// ─── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
//
// W5-3 built the WRITE half of property replication: 25 verbs now land on the
// canonical element record in `ELEMENTS_NAMESPACE`.  A conformance probe then
// measured the other half and found it ABSENT — zero `.observe` calls on that
// map anywhere in the repository, and no caller for `readElement()` /
// `readElementProperty()` in `apps/editor`.  So a receiving client's Y.Doc was
// correct and its SCREEN was wrong, indefinitely: writes went in, nothing came
// out, and the stores the renderer consults were never told.
//
// Crucially the receiver did not read as EMPTY.  It kept the creation-time value
// — a wall raised to 5 m by user A stayed 3 m for user B, confidently.  Failure
// and staleness had the same observable value, which is this subsystem's
// signature defect (§CONTEXT-DATA-HONESTY).  This file closes the read path and
// its probe (`__tests__/element-readback.test.ts`) asserts the NUMBER, never
// mere definedness.
//
// ─── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────
//
// It does NOT touch a store.  `@pryzm/sync-client` is L3; wall/slab/room stores
// are L3-L4 concretions owned elsewhere, and a sync package that imported one
// would invert the layer rule and couple replication to a store's shape.  The
// reader emits a typed `RemoteElementUpdate` and an L7 host supplies the sink.
// In `apps/editor` that sink dispatches through the command bus (P6 — commands
// are the only mutation path), which is what makes the renderer redraw.
//
// ─── C66 §1 — WHAT THIS DOES NOT CLAIM ───────────────────────────────────────
//
// A working read path is NOT working collaboration.  There is still no deployed
// CRDT transport (L-391: the websocket provider is OFF by default and no sync
// server ships), so nothing delivers document A's update to document B in
// production — production collaboration remains socket.io last-writer-wins full
// snapshots.  Two real users still do not see each other's edits through this
// path.  No capacity tier is claimed here.
//
// OTel (P8): every delivery is spanned; every suppression and every failure is
// COUNTED and readable via `stats` — a gap must be detectable, never silent.

import * as Y from 'yjs';
import { trace } from '@opentelemetry/api';
// The element map itself is reached through `adapter.getElementsNamespace()`,
// which owns the ELEMENTS_NAMESPACE key and the coordination/per-level choice.
import { type YjsDocAdapter } from './YjsDocAdapter.js';

const tracer = trace.getTracer('pryzm.sync-client.readback');

/** Coordination-doc sentinel, mirroring `YjsDocAdapter`'s own bookkeeping key. */
const COORD_KEY = '__coord__';

/**
 * One element's remotely-authored property change, ready to be applied to the
 * receiving client's authoritative state.
 */
export interface RemoteElementUpdate {
  /** The element the change is about. */
  readonly elementId: string;
  /**
   * ADR-049 routing scope this arrived on: the level's id, or `undefined` for
   * the coordination / single-doc scope.  Carried through because the sink may
   * need it to find the right store partition.
   */
  readonly levelId: string | undefined;
  /** The properties that CHANGED, with their merged post-CRDT values. */
  readonly properties: Readonly<Record<string, unknown>>;
  /**
   * `'create'` when the element record did not exist in this document before
   * the transaction, `'update'` otherwise.
   *
   * The distinction matters to the sink and MUST NOT be inferred from
   * "is the element in my store?": a client that missed the create and then
   * receives an update would otherwise treat a genuine update as a create and
   * mint a second element.  Stated explicitly rather than guessed.
   */
  readonly kind: 'create' | 'update';
}

/** The L7-supplied application function.  May throw; failures are counted. */
export type RemoteElementSink = (update: RemoteElementUpdate) => void;

/** Everything this reader has done, so that nothing it skipped is invisible. */
export interface ElementSyncReaderStats {
  /** Updates handed to the sink. */
  delivered: number;
  /** Transactions this document itself authored, correctly not re-applied. */
  suppressedLocalOrigin: number;
  /** Sink invocations that threw.  Distinct from `delivered === 0`. */
  sinkErrors: number;
  /** Deep events whose element id could not be resolved from the Yjs path. */
  unresolvedPath: number;
}

export interface ElementSyncReaderOptions {
  /**
   * Observe the coordination / single-doc element map immediately.
   * Default `true`.  In single-doc mode (the production default) this is the
   * only map that matters.
   */
  readonly observeCoordination?: boolean;
}

/**
 * Observes `ELEMENTS_NAMESPACE` on a {@link YjsDocAdapter} and pushes remotely
 * authored property changes to a sink.
 *
 * ECHO BREAK — the hard requirement.  `YjsDocAdapter.applyCommand()` transacts
 * with the adapter instance as the Yjs transaction ORIGIN.  A transaction whose
 * origin is that adapter was authored HERE, and delivering it back to the sink
 * would (a) re-dispatch the user's own edit at them and (b) over a real
 * transport, ping-pong it with every peer forever.  The filter is exact — an
 * identity check on the origin — not a value heuristic, and every suppression
 * is counted so "the reader is silent" and "the reader is broken" stay
 * different observations.
 */
export class ElementSyncReader {
  private readonly _adapter: YjsDocAdapter;
  private readonly _sink: RemoteElementSink;
  private readonly _disposers: Array<() => void> = [];
  private readonly _observedLevels = new Set<string>();
  private _disposed = false;

  private readonly _stats: ElementSyncReaderStats = {
    delivered: 0,
    suppressedLocalOrigin: 0,
    sinkErrors: 0,
    unresolvedPath: 0,
  };

  constructor(
    adapter: YjsDocAdapter,
    sink: RemoteElementSink,
    opts?: ElementSyncReaderOptions,
  ) {
    this._adapter = adapter;
    this._sink = sink;
    if (opts?.observeCoordination !== false) this._observe(undefined);
  }

  /** Counters.  A copy — callers cannot mutate the reader's bookkeeping. */
  get stats(): Readonly<ElementSyncReaderStats> { return { ...this._stats }; }

  /**
   * ADR-049 — also observe a level-scoped Y.Doc.
   *
   * In per-level mode each level is its own document, so a reader that watched
   * only the coordination doc would silently miss every element on every level:
   * exactly the shape of defect this file exists to remove.  Levels must
   * therefore be observed EXPLICITLY, and {@link observedLevelIds} reports which
   * ones are — an unobserved level is a stated fact, not an absence.
   */
  observeLevel(levelId: string): void {
    if (!levelId) throw new RangeError('ElementSyncReader.observeLevel: levelId required');
    if (this._observedLevels.has(levelId)) return;
    this._observedLevels.add(levelId);
    this._observe(levelId);
  }

  /** Levels currently observed.  Empty means coordination-doc scope only. */
  observedLevelIds(): readonly string[] { return Array.from(this._observedLevels); }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    for (const d of this._disposers) { try { d(); } catch { /* best-effort */ } }
    this._disposers.length = 0;
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private _observe(levelId: string | undefined): void {
    const elements = this._adapter.getElementsNamespace(levelId);
    const handler = (events: Array<Y.YEvent<Y.AbstractType<unknown>>>, txn: Y.Transaction): void => {
      this._onDeepChange(elements, levelId, events, txn);
    };
    elements.observeDeep(handler);
    this._disposers.push(() => { try { elements.unobserveDeep(handler); } catch { /* doc destroyed */ } });
  }

  private _onDeepChange(
    elements: Y.Map<Y.Map<unknown>>,
    levelId: string | undefined,
    events: Array<Y.YEvent<Y.AbstractType<unknown>>>,
    txn: Y.Transaction,
  ): void {
    if (this._disposed) return;

    // ── ECHO BREAK ──────────────────────────────────────────────────────────
    // `applyCommand` transacts with the adapter as origin; a merge from
    // `applyUpdate` has origin null/undefined.  Anything WE authored is
    // suppressed — and counted, so silence is legible.
    if (txn.origin === this._adapter) {
      this._stats.suppressedLocalOrigin++;
      return;
    }

    // Merge every event in this transaction into one update per element, so a
    // create-plus-property transaction reaches the sink as ONE change, in the
    // order the renderer needs (record first, then its fields).
    const perElement = new Map<string, { props: Record<string, unknown>; kind: 'create' | 'update' }>();

    for (const event of events) {
      if (event.target === (elements as unknown as Y.AbstractType<unknown>)) {
        // Top level: element records added or replaced wholesale.
        for (const [elementId, change] of event.changes.keys) {
          if (change.action === 'delete') continue; // deletion is not a property route
          const record = elements.get(elementId);
          if (!(record instanceof Y.Map)) continue;
          const props: Record<string, unknown> = {};
          record.forEach((v: unknown, k: string) => { props[k] = v; });
          const entry = perElement.get(elementId);
          if (entry) Object.assign(entry.props, props);
          else perElement.set(elementId, { props, kind: change.action === 'add' ? 'create' : 'update' });
        }
        continue;
      }

      // Nested: a property set on an existing element record.  `event.path` is
      // relative to the observed map, so `[elementId]`.
      const elementId = event.path.length > 0 ? String(event.path[0]) : '';
      if (!elementId) {
        // Cannot attribute this change to an element.  Counted, never dropped
        // quietly — an unattributable change is a finding about the shape of
        // the document, not a no-op.
        this._stats.unresolvedPath++;
        continue;
      }
      const record = elements.get(elementId);
      if (!(record instanceof Y.Map)) { this._stats.unresolvedPath++; continue; }

      const props: Record<string, unknown> = {};
      for (const [key, change] of event.changes.keys) {
        if (change.action === 'delete') { props[key] = undefined; continue; }
        props[key] = record.get(key);
      }
      const entry = perElement.get(elementId);
      if (entry) Object.assign(entry.props, props);
      else perElement.set(elementId, { props, kind: 'update' });
    }

    for (const [elementId, { props, kind }] of perElement) {
      if (Object.keys(props).length === 0) continue;
      this._deliver({ elementId, levelId, properties: props, kind });
    }
  }

  private _deliver(update: RemoteElementUpdate): void {
    const span = tracer.startSpan('pryzm.sync.applyRemoteElement', {
      attributes: {
        'pryzm.element.id': update.elementId,
        'pryzm.property.count': Object.keys(update.properties).length,
        'pryzm.remote.kind': update.kind,
        ...(update.levelId !== undefined ? { 'pryzm.level.id': update.levelId } : {}),
      },
    });
    try {
      this._stats.delivered++;
      this._sink(update);
    } catch (err) {
      // A failing sink must never break the CRDT merge (C08 §3.1: CRDT failure
      // must not break local execution) — but it must not look like "nothing
      // arrived" either.  `delivered` already counted this one, so
      // `sinkErrors > 0` alongside it is the distinguishable failure signal.
      this._stats.sinkErrors++;
      console.error(
        `[ElementSyncReader] sink threw applying remote change to ` +
        `element=${update.elementId} scope=${update.levelId ?? COORD_KEY} — ` +
        `the local view of this element is now STALE (counted, not swallowed):`,
        err,
      );
    } finally {
      span.end();
    }
  }
}
