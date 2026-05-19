// @pryzm/sync-client — YjsDocAdapter (Wave A19-T2; Phase 2D; ADR-049 §4.4)
//
// CONTRACT (C08 §3.1 amended by ADR-049):
// All element-property mutations MUST go through Yjs Y.Map operations.
// The Yjs CRDT guarantees convergence without silent data loss.
//
// ADR-049 — Y.Doc-per-level CRDT split (Task 4.4):
//   One Y.Doc per active level, gated behind PRYZM_YDOC_PER_LEVEL=true.
//   A coordination Y.Doc holds cross-level invariants (level order, active
//   level, grid lines).  Commands without a levelId always route to the
//   coordination doc — preserving backward compatibility with callers that
//   do not yet pass a levelId in their payload.
//
// Gate (E.2): seqNo cross-level ordering is not yet implemented.  The
//   per-level split is therefore gated behind the `PRYZM_YDOC_PER_LEVEL`
//   environment flag.  Default is single-doc (Phase 2D, original contract).
//
// Backward compatibility:
//   `adapter.doc` always refers to the coordination / global Y.Doc.
//   In single-doc mode (default) this is the only doc — Phase 2D callers
//   that call `applyCommand` without a levelId see identical behaviour.
//
// Architecture (per-level mode active):
//   ┌─────────────────────────────────────────────────────┐
//   │  YjsDocAdapter                                       │
//   │  ┌──────────────────────────┐                       │
//   │  │ coordination doc (this.doc) ← cross-level state  │
//   │  └──────────────────────────┘                       │
//   │  ┌───────────────────────────────────────────────┐  │
//   │  │ _levelDocs: Map<levelId, Y.Doc>               │  │
//   │  │  "L1" → Y.Doc (walls, doors, slabs on L1)     │  │
//   │  │  "L2" → Y.Doc (elements on L2) ...            │  │
//   │  └───────────────────────────────────────────────┘  │
//   └─────────────────────────────────────────────────────┘
//
//   Late-joining collaborator: server sends only the active level doc
//   (~200 KB) instead of the full project doc (~200 MB).
//
// OTel: every public method wraps in a span per P8 span requirement.

import * as Y from 'yjs';
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.sync-client.yjs');

// ─── Module-level helpers ─────────────────────────────────────────────────────

/**
 * G3-T3: Compare two Yjs state vectors for equality (byte-by-byte).
 * Returns true when both vectors are identical — meaning no new ops have been
 * applied to the doc since the snapshot was taken.
 */
function _stateVectorsEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ─── Feature flag ────────────────────────────────────────────────────────────

/**
 * Read the PRYZM_YDOC_PER_LEVEL environment flag.
 * Gate: E.2 (seqNo cross-level ordering) must be complete before production.
 * Works in both Node.js (process.env) and browser (import.meta.env) contexts.
 */
function _readPerLevelFlag(): boolean {
  try {
    // Node.js path
    const nodeEnv = (
      globalThis as { process?: { env?: Record<string, string | undefined> } }
    ).process?.env;
    if (nodeEnv !== undefined) {
      return nodeEnv['PRYZM_YDOC_PER_LEVEL'] === 'true';
    }
    // Browser / Vite path (import.meta.env is injected at build time)
    const meta = (
      globalThis as { importMeta?: { env?: Record<string, string | undefined> } }
    ).importMeta?.env;
    return meta?.['PRYZM_YDOC_PER_LEVEL'] === 'true';
  } catch {
    return false;
  }
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface PresenceData {
  userId: string;
  /** server-authoritative (from JWT / server.js displayName cache) */
  displayName: string;
  color: string;
  cursor?: { x: number; y: number };
}

export interface CRDTConflict {
  elementId: string;
  property: string;
  localValue: unknown;
  remoteValue: unknown;
  remoteAuthor: string;
  timestamp: number;
}

/** Minimal provider-like interface — accepts WebsocketProvider or MockProvider. */
export interface YjsProvider {
  awareness: { setLocalState(state: PresenceData | null): void } | undefined;
  disconnect(): void;
  connect(): void;
  destroy(): void;
}

// ─── E.1 — CRDT batch blackout window hooks ───────────────────────────────────

/**
 * §E.1 — Payload for the CRDT batch blackout window open event.
 * BatchCoordinator calls `YjsDocAdapter.onBatchWindowOpen` at batch start so
 * the adapter can instrument the CRDT blackout window for observability.
 *
 * ADR-049 §4.4: `levelIds` is optional.  When per-level mode is active and
 * BatchCoordinator knows which levels are affected, it passes them here so
 * the blackout is scoped to only those level docs.  When absent, the blackout
 * covers the full project (coordination doc and all level docs).
 */
export interface BatchWindowOpenInfo {
  /** Short batch UUID (8-char prefix from crypto.randomUUID). */
  batchId: string;
  /** performance.now() at batch start — matches §D.1 batchStartTime. */
  startMs: number;
  /**
   * ADR-049 §4.4 — IDs of levels whose CRDT scope is blacked out.
   * Absent in single-doc mode or when the affected set is unknown.
   */
  levelIds?: readonly string[];
}

/**
 * §E.1 — Payload for the CRDT batch blackout window close event.
 * Mirrors the corresponding open event; `levelIds` matches what was passed
 * to `onBatchWindowOpen` for the same batchId.
 */
export interface BatchWindowCloseInfo {
  /** Same batchId as the corresponding open event. */
  batchId: string;
  /** Elapsed ms from batch start to onComplete (the CRDT blackout duration). */
  blackoutMs: number;
  /** Total elements created during the batch (from BatchOptions.totalElementCount). */
  elementCount: number;
  /**
   * ADR-049 §4.4 — mirrors levelIds from the corresponding open event.
   * Absent in single-doc mode or when the affected set was unknown at open time.
   */
  levelIds?: readonly string[];
}

// ─── YjsDocAdapterOptions ────────────────────────────────────────────────────

/**
 * Constructor options for YjsDocAdapter (ADR-049 §4.4).
 * All fields are optional; the adapter is fully backward-compatible with
 * existing callers that pass only a projectId string.
 */
export interface YjsDocAdapterOptions {
  /**
   * Enable Y.Doc-per-level CRDT split (ADR-049).
   *
   * When true, `applyCommand()` routes to a per-level Y.Doc when the payload
   * contains a `levelId` string field.  Commands without `levelId` always
   * route to the coordination doc (cross-level invariants: level order, active
   * level, grid lines).
   *
   * Defaults to `process.env.PRYZM_YDOC_PER_LEVEL === 'true'`.
   *
   * GATE (E.2): seqNo cross-level ordering must be implemented before this
   * flag is enabled in production.  Leave disabled (default) until E.2 lands.
   */
  perLevelMode?: boolean;
}

// ─── YjsDocAdapter ───────────────────────────────────────────────────────────

/**
 * YjsDocAdapter — maps PRYZM command operations to Yjs CRDT operations.
 *
 * CONTRACT (C08 §3.1 — Phase 2D COMPLETE, amended by ADR-049 §4.4):
 * Each `applyCommand()` call transacts the payload into a Y.Map entry under
 * the command type's namespace.  Two concurrent clients editing the same
 * property simultaneously produce a deterministic CRDT merge (Yjs Lamport
 * clock wins on scalar keys).  When the merge is semantically ambiguous the
 * conflict handler fires → runtime sets `sync.status = 'CONFLICTED'` →
 * ConflictResolutionDialog shown to user.
 *
 * ADR-049 — Y.Doc-per-level (when perLevelMode=true):
 *   Commands with `payload.levelId` route to the level's Y.Doc.
 *   Commands without `levelId` route to the coordination Y.Doc.
 *   Late-joining collaborators sync only the active level (~200 KB vs ~200 MB).
 */
export class YjsDocAdapter {
  /**
   * Coordination / global Y.Doc.
   *
   * Single-doc mode (default, perLevelMode=false):
   *   The project-level doc.  All commands write here.  Identical to Phase 2D.
   *
   * Per-level mode (perLevelMode=true):
   *   Holds cross-level invariants only (level order, active level, grid lines).
   *   Element commands with a levelId write to `_levelDocs` instead.
   *
   * Always accessible as `adapter.doc` — callers from Phase 2D that read or
   * apply updates to this doc directly remain fully compatible.
   */
  readonly doc: Y.Doc;

  /**
   * ADR-049: per-level Y.Doc instances, keyed by levelId.
   * Only populated when `perLevelMode` is true and commands with a levelId
   * have been applied.  Lazily created by `getDocForLevel()`.
   */
  private readonly _levelDocs = new Map<string, Y.Doc>();

  /**
   * ADR-049: per-level providers, keyed by levelId.
   * In production, each entry is a WebsocketProvider connected to the
   * level-scoped Socket.io room `${projectId}:${levelId}`.
   */
  private readonly _levelProviders = new Map<string, YjsProvider>();

  /** Whether per-level routing is active for this adapter instance. */
  private readonly _perLevelMode: boolean;

  private _provider: YjsProvider | null = null;
  private _conflictHandlers = new Set<(conflict: CRDTConflict) => void>();
  private _statusHandlers = new Set<(status: string) => void>();
  private _status: string = 'disconnected';

  // ── §E.1 / G3-T1: Batch blackout tracking fields ─────────────────────────
  private _blackoutBatchId: string | undefined = undefined;
  private _blackoutStartMs: number | undefined = undefined;
  /**
   * G3-T3: Y.Doc state vector snapshots at batch window open.
   * Key: levelId (or '__coord__' for the coordination doc).
   * Value: Y.encodeStateVector() output at batch start.
   * Compared at close time to detect remote ops during the blackout.
   */
  private readonly _batchStateVectorSnapshot = new Map<string, Uint8Array>();

  // ── §E.1 — Batch blackout hooks ────────────────────────────────────────────
  // Optional callbacks wired by BatchCoordinator via registerYjsDocAdapter().
  // Declared as public optional fields (not event emitters) to keep the
  // coupling surface minimal — BatchCoordinator calls them directly.
  // Default implementations are set in the constructor (G3-T1 / G3-T3).
  onBatchWindowOpen?: (info: BatchWindowOpenInfo) => void;
  onBatchWindowClose?: (info: BatchWindowCloseInfo) => void;

  constructor(private readonly _projectId: string, opts?: YjsDocAdapterOptions) {
    this.doc = new Y.Doc();
    this._perLevelMode = opts?.perLevelMode ?? _readPerLevelFlag();

    // ── §E.1 / G3-T1: CRDT blackout observability ──────────────────────────
    // G3-T3: snapshot state vectors at open; detect remote changes at close.
    // BatchCoordinator calls these via registerYjsDocAdapter().  External code
    // may re-assign them; the defaults provide observability + conflict detection.
    this.onBatchWindowOpen = (info: BatchWindowOpenInfo): void => {
      this._blackoutBatchId = info.batchId;
      this._blackoutStartMs = info.startMs;
      console.log(
        `[YjsDocAdapter] §E.1 CRDT blackout started ` +
        `batchId=${info.batchId} status=${this._status}` +
        (info.levelIds ? ` levels=[${info.levelIds.join(',')}]` : ''),
      );
      // G3-T3: snapshot state vectors for remote-change detection at close.
      this._batchStateVectorSnapshot.clear();
      const targetLevelIds = info.levelIds ?? Array.from(this._levelDocs.keys());
      for (const levelId of targetLevelIds) {
        const levelDoc = this._levelDocs.get(levelId);
        if (levelDoc) {
          this._batchStateVectorSnapshot.set(levelId, Y.encodeStateVector(levelDoc));
        }
      }
      // Always snapshot the coordination doc (covers single-doc mode).
      this._batchStateVectorSnapshot.set('__coord__', Y.encodeStateVector(this.doc));
    };

    this.onBatchWindowClose = (info: BatchWindowCloseInfo): void => {
      console.log(
        `[YjsDocAdapter] §E.1 CRDT blackout ended ` +
        `batchId=${info.batchId} ` +
        `duration=${info.blackoutMs.toFixed(0)}ms ` +
        `elements=${info.elementCount} ` +
        `status=${this._status}`,
      );
      // G3-T3: semantic conflict detection after batch.
      this._detectBatchConflicts(info);
      this._batchStateVectorSnapshot.clear();
      this._blackoutBatchId = undefined;
      this._blackoutStartMs = undefined;
    };
  }

  // ── Per-level mode queries (ADR-049) ───────────────────────────────────────

  /** True when the per-level CRDT split is active for this adapter instance. */
  get perLevelMode(): boolean { return this._perLevelMode; }

  /**
   * ADR-049: Get (or lazily create) the Y.Doc for a specific level.
   *
   * The doc is created on first access and cached for the lifetime of the
   * adapter.  Callers must not destroy the returned doc directly — use
   * `destroyLevel(levelId)` instead so the adapter's internal bookkeeping
   * stays consistent.
   *
   * Note: returns a Y.Doc even when `perLevelMode=false` (useful for tests
   * and migration tooling), but in single-doc mode this doc is not wired
   * into the `applyCommand` routing pipeline.
   */
  getDocForLevel(levelId: string): Y.Doc {
    if (!levelId) throw new RangeError(
      `YjsDocAdapter.getDocForLevel: levelId must be a non-empty string`,
    );
    let doc = this._levelDocs.get(levelId);
    if (!doc) {
      doc = new Y.Doc();
      this._levelDocs.set(levelId, doc);
    }
    return doc;
  }

  /**
   * ADR-049: All level IDs for which a Y.Doc has been created on this adapter.
   * Returns a stable snapshot array — mutations to `_levelDocs` after the
   * call do not affect the returned value.
   */
  getLevelIds(): string[] {
    return Array.from(this._levelDocs.keys());
  }

  /**
   * ADR-049: Apply a raw Yjs binary update to a specific level's Y.Doc.
   * Used for server-side catch-up sync of the active level only.
   */
  applyUpdateForLevel(levelId: string, update: Uint8Array): void {
    const span = tracer.startSpan('pryzm.sync.applyUpdateForLevel', {
      attributes: {
        'pryzm.project.id': this._projectId,
        'pryzm.level.id': levelId,
        'pryzm.update.byteLength': update.byteLength,
      },
    });
    try {
      Y.applyUpdate(this.getDocForLevel(levelId), update);
    } finally {
      span.end();
    }
  }

  /**
   * ADR-049: Encode a specific level's Y.Doc state as a binary update.
   * This is the critical primitive for the late-join fast path: the server
   * sends only this update for the active level (~200 KB) instead of the
   * full project update (~200 MB).
   */
  encodeStateAsUpdateForLevel(levelId: string): Uint8Array {
    return Y.encodeStateAsUpdate(this.getDocForLevel(levelId));
  }

  /**
   * ADR-049: Get the state vector for a specific level's Y.Doc.
   * Clients send this to request only the delta they are missing.
   */
  encodeStateVectorForLevel(levelId: string): Uint8Array {
    return Y.encodeStateVector(this.getDocForLevel(levelId));
  }

  /**
   * ADR-049: Get a named namespace Y.Map from a specific level's Y.Doc.
   * Equivalent to `getNamespace(commandType)` but scoped to one level.
   */
  getNamespaceForLevel(levelId: string, commandType: string): Y.Map<Y.Map<unknown>> {
    return this.getDocForLevel(levelId).getMap<Y.Map<unknown>>(commandType);
  }

  /**
   * ADR-049: Connect a specific level's Y.Doc to a transport provider.
   * In production this wires to a WebsocketProvider connected to the
   * level-scoped Socket.io room `${projectId}:${levelId}` so the client
   * receives only updates for the active level.
   *
   * Any previously registered provider for this levelId is disconnected
   * and destroyed before the new one is registered.
   */
  connectLevelWithProvider(levelId: string, provider: YjsProvider): void {
    const span = tracer.startSpan('pryzm.sync.connectLevelWithProvider', {
      attributes: {
        'pryzm.project.id': this._projectId,
        'pryzm.level.id': levelId,
      },
    });
    try {
      const existing = this._levelProviders.get(levelId);
      if (existing) {
        existing.disconnect();
        existing.destroy();
      }
      this._levelProviders.set(levelId, provider);
    } finally {
      span.end();
    }
  }

  /**
   * ADR-049: Disconnect and destroy the provider for a specific level.
   * Does not destroy the level's Y.Doc — retained in _levelDocs for reuse
   * if the same level becomes visible again (common with floor navigation).
   */
  disconnectLevel(levelId: string): void {
    const span = tracer.startSpan('pryzm.sync.disconnectLevel', {
      attributes: {
        'pryzm.project.id': this._projectId,
        'pryzm.level.id': levelId,
      },
    });
    try {
      const provider = this._levelProviders.get(levelId);
      if (provider) {
        provider.disconnect();
        provider.destroy();
        this._levelProviders.delete(levelId);
      }
    } finally {
      span.end();
    }
  }

  /**
   * ADR-049: Destroy and remove a specific level's Y.Doc from memory.
   * Also disconnects its provider if one was registered.
   * Use this when a level is permanently evicted (e.g. LRU pressure).
   * For temporary visibility toggles, prefer `disconnectLevel()` only.
   */
  destroyLevel(levelId: string): void {
    this.disconnectLevel(levelId);
    const doc = this._levelDocs.get(levelId);
    if (doc) {
      doc.destroy();
      this._levelDocs.delete(levelId);
    }
  }

  // ── Connection ─────────────────────────────────────────────────────────────

  /**
   * Connect using the given provider for the coordination / global doc.
   * In production this is a WebsocketProvider from y-websocket; in tests
   * it is a MockProvider.
   */
  connectWithProvider(provider: YjsProvider): void {
    const span = tracer.startSpan('pryzm.sync.connectWithProvider', {
      attributes: { 'pryzm.project.id': this._projectId },
    });
    try {
      this._provider = provider;
      this._setStatus('connected');
    } finally {
      span.end();
    }
  }

  disconnect(): void {
    const span = tracer.startSpan('pryzm.sync.disconnect');
    try {
      this._provider?.disconnect();
      this._provider = null;
      this._setStatus('disconnected');
    } finally {
      span.end();
    }
  }

  /**
   * Destroy the adapter: coordination provider, all level providers, all
   * level Y.Docs, the coordination Y.Doc, and all handler sets.
   * After `destroy()` the adapter instance MUST NOT be used again.
   */
  destroy(): void {
    // Tear down level providers first (they hold refs to level docs)
    for (const levelId of Array.from(this._levelProviders.keys())) {
      this.disconnectLevel(levelId);
    }
    // Destroy all level Y.Docs
    for (const doc of this._levelDocs.values()) {
      doc.destroy();
    }
    this._levelDocs.clear();
    this._levelProviders.clear();
    // Tear down coordination provider + doc
    this._provider?.destroy();
    this._provider = null;
    this.doc.destroy();
    this._conflictHandlers.clear();
    this._statusHandlers.clear();
  }

  // ── Command → CRDT mapping ─────────────────────────────────────────────────

  /**
   * Apply a PRYZM command payload as a Yjs transaction.
   *
   * Routing logic (ADR-049 §4.4):
   *   perLevelMode=false (default):
   *     All commands write to `this.doc` (coordination / project doc).
   *     Identical to Phase 2D behaviour — no change for existing callers.
   *
   *   perLevelMode=true (PRYZM_YDOC_PER_LEVEL=true):
   *     payload.levelId is a non-empty string → level-specific Y.Doc.
   *     payload.levelId absent or empty      → coordination Y.Doc.
   *
   * @param commandType - e.g. 'wall.create', 'door.update'
   * @param payload - must contain an `id` field (element identifier).
   *                  May contain a `levelId` field for per-level routing.
   */
  applyCommand(commandType: string, payload: Record<string, unknown>): void {
    // Determine target doc before opening the OTel span so the span
    // attribute is accurate even in the per-level branch.
    const levelId = this._perLevelMode
      ? (typeof payload['levelId'] === 'string' && payload['levelId'] !== ''
          ? payload['levelId']
          : undefined)
      : undefined;

    const span = tracer.startSpan('pryzm.sync.applyCommand', {
      attributes: {
        'pryzm.command.type': commandType,
        'pryzm.element.id': String(payload['id'] ?? 'unknown'),
        ...(levelId !== undefined ? { 'pryzm.level.id': levelId } : {}),
        'pryzm.crdt.per_level': this._perLevelMode,
      },
    });
    try {
      const targetDoc = levelId !== undefined
        ? this.getDocForLevel(levelId)
        : this.doc;

      targetDoc.transact(() => {
        const namespace = targetDoc.getMap<Y.Map<unknown>>(commandType);
        const elementId = String(payload['id'] ?? '');
        if (!elementId) return;

        let elementMap = namespace.get(elementId);
        if (!elementMap) {
          elementMap = new Y.Map<unknown>();
          namespace.set(elementId, elementMap);
        }

        // Map command payload fields → Y.Map entries.
        // Yjs CRDT semantics: concurrent set() on the same key converges
        // deterministically (last timestamp wins at the CRDT layer).
        for (const [key, value] of Object.entries(payload)) {
          if (key === 'id') continue;
          elementMap.set(key, value);
        }
      }, this);
    } finally {
      span.end();
    }
  }

  /**
   * Apply a raw Yjs binary update to the coordination / global doc.
   * For level-specific updates use `applyUpdateForLevel(levelId, update)`.
   *
   * §E.3 — After applying the remote update, calls `_detectCwLevelYMismatch()`
   * to surface CW / level-Y semantic inconsistencies as `CRDTConflict` events.
   */
  applyUpdate(update: Uint8Array): void {
    const span = tracer.startSpan('pryzm.sync.applyUpdate', {
      attributes: { 'pryzm.update.byteLength': update.byteLength },
    });
    try {
      Y.applyUpdate(this.doc, update);
      // §E.3 — Post-merge semantic validation: detect CW elements whose stored
      // base-Y no longer matches the level elevation after a remote update.
      this._detectCwLevelYMismatch();
    } finally {
      span.end();
    }
  }

  /**
   * Encode the current coordination / global Y.Doc state as a binary update.
   * For level-specific encoding use `encodeStateAsUpdateForLevel(levelId)`.
   */
  encodeStateAsUpdate(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }

  /**
   * Get a snapshot of a named namespace map from the coordination / global doc.
   * For level-specific namespaces use `getNamespaceForLevel(levelId, commandType)`.
   */
  getNamespace(commandType: string): Y.Map<Y.Map<unknown>> {
    return this.doc.getMap<Y.Map<unknown>>(commandType);
  }

  // ── Presence ───────────────────────────────────────────────────────────────

  /**
   * Set presence data (avatar, server-authoritative displayName, cursor).
   * displayName MUST come from the server-verified JWT — not a client string.
   */
  setPresence(data: PresenceData): void {
    const span = tracer.startSpan('pryzm.sync.setPresence');
    try {
      this._provider?.awareness?.setLocalState(data);
    } finally {
      span.end();
    }
  }

  // ── Conflict hooks ─────────────────────────────────────────────────────────

  /** Register a conflict handler.  Returns a disposer. */
  onConflict(handler: (conflict: CRDTConflict) => void): () => void {
    this._conflictHandlers.add(handler);
    return () => { this._conflictHandlers.delete(handler); };
  }

  /** Register a status change handler.  Returns a disposer. */
  onStatusChange(handler: (status: string) => void): () => void {
    this._statusHandlers.add(handler);
    return () => { this._statusHandlers.delete(handler); };
  }

  /** Fire a conflict — called by CRDTConflictResolver when auto-merge fails. */
  emitConflict(conflict: CRDTConflict): void {
    this._setStatus('CONFLICTED');
    for (const h of this._conflictHandlers) {
      try { h(conflict); } catch { /* swallow — handlers must be best-effort */ }
    }
  }

  getStatus(): string { return this._status; }

  /**
   * G3-T1 observability: true while a batch blackout window is open.
   * BatchCoordinator sets this via `onBatchWindowOpen` / `onBatchWindowClose`.
   * Can be polled by UI components to show a "syncing batch…" indicator.
   */
  get isBatchBlackoutActive(): boolean { return this._blackoutBatchId !== undefined; }

  /** Current batch ID during an active blackout, or undefined when idle. */
  get currentBlackoutBatchId(): string | undefined { return this._blackoutBatchId; }

  /** performance.now() at which the current blackout started, or undefined when idle. */
  get blackoutStartMs(): number | undefined { return this._blackoutStartMs; }

  // ── Internals ──────────────────────────────────────────────────────────────

  private _setStatus(status: string): void {
    if (this._status === status) return;
    this._status = status;
    for (const h of this._statusHandlers) {
      try { h(status); } catch { /* swallow */ }
    }
  }

  // ── G3-T3: Semantic conflict detection ─────────────────────────────────────

  /**
   * G3-T3 — Detect remote Y.Doc changes that occurred during the batch blackout.
   *
   * Called by `onBatchWindowClose`.  Compares the Y.Doc state vectors captured
   * at `onBatchWindowOpen` against the current vectors.  If any doc has
   * additional state (remote ops arrived during the blackout), a `CRDTConflict`
   * is emitted for each affected level.
   *
   * The most common case: collaborator B changed a level's elevation (Y) while
   * the batch was creating curtain-wall elements on that level.  The locally-
   * created CW elements reference the correct `levelId` but were built against
   * the OLD elevation.  The model is geometrically invalid without this conflict
   * being surfaced.  (P8 compliance: silent LWW discard is forbidden.)
   *
   * The emitted `CRDTConflict.property` is `'semantic-elevation-mismatch'`
   * so the `ConflictResolutionDialog` can display a specific re-geometry prompt.
   */
  private _detectBatchConflicts(info: BatchWindowCloseInfo): void {
    const span = tracer.startSpan('pryzm.sync.detectBatchConflicts', {
      attributes: {
        'pryzm.batch.id': info.batchId,
        'pryzm.batch.blackout_ms': info.blackoutMs,
        'pryzm.batch.element_count': info.elementCount,
      },
    });
    try {
      let conflictCount = 0;

      // Check the coordination doc (covers single-doc mode).
      const coordSnap = this._batchStateVectorSnapshot.get('__coord__');
      if (coordSnap) {
        const currentVector = Y.encodeStateVector(this.doc);
        if (!_stateVectorsEqual(coordSnap, currentVector)) {
          this.emitConflict({
            elementId: `batch:${info.batchId}:coord`,
            property: 'semantic-elevation-mismatch',
            localValue: `batch(${info.elementCount} elements)`,
            remoteValue: 'remote-change-during-blackout',
            remoteAuthor: 'collaborator',
            timestamp: Date.now(),
          });
          conflictCount++;
        }
      }

      // Check per-level docs that were snapshotted at batch open.
      const levelIds = info.levelIds
        ?? Array.from(this._batchStateVectorSnapshot.keys()).filter(k => k !== '__coord__');
      for (const levelId of levelIds) {
        const snap = this._batchStateVectorSnapshot.get(levelId);
        if (!snap) continue;
        const levelDoc = this._levelDocs.get(levelId);
        if (!levelDoc) continue;
        const currentVector = Y.encodeStateVector(levelDoc);
        if (!_stateVectorsEqual(snap, currentVector)) {
          this.emitConflict({
            elementId: `batch:${info.batchId}:level:${levelId}`,
            property: 'semantic-elevation-mismatch',
            localValue: `batch(${info.elementCount} elements on level ${levelId})`,
            remoteValue: 'level-changed-during-blackout',
            remoteAuthor: 'collaborator',
            timestamp: Date.now(),
          });
          conflictCount++;
        }
      }

      if (conflictCount > 0) {
        console.warn(
          `[YjsDocAdapter] §G3-T3 ${conflictCount} semantic conflict(s) detected ` +
          `after batch ${info.batchId} — ConflictResolutionDialog should surface these.`,
        );
      }
    } finally {
      span.end();
    }
  }

  // ── §E.3: CW_LEVEL_Y_MISMATCH semantic conflict detection ──────────────────

  /**
   * §E.3 — Post-merge semantic validation: detect curtain-wall / level-Y
   * mismatches that arise when a remote Yjs update changes a level's elevation
   * (Y) while the local client has curtain-wall elements built at the old Y.
   *
   * Scenario: user B edits `level.y` on their client. The change arrives as a
   * remote Yjs binary update and is merged into the coordination doc.  Any CW
   * element whose stored `computedBaseY` / `baseY` was derived from the OLD
   * level elevation is now geometrically inconsistent — it sits at the wrong
   * height.  Silent LWW discard is forbidden by P8; this conflict must be
   * surfaced to the user via `CRDTConflict`.
   *
   * Algorithm:
   *   1. Scan known level-command namespaces in the coordination doc.
   *      Build a Map<levelId, levelY> of current level elevations.
   *   2. Return early if no level data is present (fast-path for non-level
   *      updates — no unnecessary iteration over CW elements).
   *   3. Scan known curtain-wall command namespaces.
   *      For each CW element with a `levelId` that matches a tracked level:
   *        - Read stored `computedBaseY` / `baseY` / `elevation`.
   *        - If |cwBaseY − levelY| > 1 mm tolerance → emit `CW_LEVEL_Y_MISMATCH`.
   *
   * Non-fatal: wrapped in try/catch; any failure is logged and swallowed.
   * Called unconditionally after every `applyUpdate()` — the fast-path
   * (empty levelYMap) exits in O(known-ns) ≈ O(1).
   *
   * Emitted `CRDTConflict`:
   *   elementId  — the curtain-wall element ID
   *   property   — 'CW_LEVEL_Y_MISMATCH'
   *   localValue — cwBaseY (what the local geometry was built with)
   *   remoteValue — levelY (the updated level elevation from the remote)
   */
  private _detectCwLevelYMismatch(): void {
    // Known Yjs namespace keys for level commands.
    // applyCommand() uses commandType as the Y.Map key, so these must match
    // the actual command type strings dispatched by the level plugin.
    const LEVEL_NAMESPACES  = ['level.update', 'levels.update', 'level.create'];
    // Known Yjs namespace keys for curtain-wall commands.
    const CW_NAMESPACES = [
      'curtain-wall.create-on-all-slabs',
      'curtain-wall.create',
      'curtain-wall.batch.create',
    ];
    // 1 mm tolerance — ignore sub-millimetre deltas that arise from floating-
    // point serialisation round-trips in JSON payloads.
    const TOLERANCE_M = 0.001;

    try {
      // ── Step 1: Build levelId → levelY from all level namespaces ──────────
      const levelYMap = new Map<string, number>();
      for (const ns of LEVEL_NAMESPACES) {
        const nsMap = this.doc.getMap<Y.Map<unknown>>(ns);
        nsMap.forEach((entry: Y.Map<unknown>, levelId: string) => {
          const rawY =
            entry.get('y')             ??
            entry.get('elevation')     ??
            entry.get('baseElevation') ??
            entry.get('elevationY');
          if (typeof rawY === 'number') {
            levelYMap.set(levelId, rawY);
          }
        });
      }

      // Fast-path: no level data → nothing to compare against.
      if (levelYMap.size === 0) return;

      // ── Step 2: Scan CW namespaces for mismatched elements ────────────────
      let mismatchCount = 0;
      for (const ns of CW_NAMESPACES) {
        const cwMap = this.doc.getMap<Y.Map<unknown>>(ns);
        cwMap.forEach((cwEntry: Y.Map<unknown>, cwId: string) => {
          const levelId = cwEntry.get('levelId');
          if (typeof levelId !== 'string' || !levelId) return;

          const levelY = levelYMap.get(levelId);
          if (levelY === undefined) return; // level not present in this doc

          // CW elements store the baked base elevation under one of these keys.
          const cwBaseY =
            cwEntry.get('computedBaseY') ??
            cwEntry.get('baseY')         ??
            cwEntry.get('elevation')     ??
            cwEntry.get('y');
          if (typeof cwBaseY !== 'number') return; // not stored — skip

          const delta = Math.abs(cwBaseY - levelY);
          if (delta > TOLERANCE_M) {
            console.warn(
              `[YjsDocAdapter] §E3-CW_LEVEL_Y_MISMATCH ` +
              `cwId=${cwId} ns=${ns} levelId=${levelId} ` +
              `cwBaseY=${cwBaseY.toFixed(4)}m levelY=${levelY.toFixed(4)}m ` +
              `delta=${delta.toFixed(4)}m — ` +
              `CW geometry is inconsistent with remote level elevation. ` +
              `Surfacing CRDTConflict (P8 — silent LWW discard is forbidden).`
            );
            this.emitConflict({
              elementId:    cwId,
              property:     'CW_LEVEL_Y_MISMATCH',
              localValue:   cwBaseY,
              remoteValue:  levelY,
              remoteAuthor: 'collaborator',
              timestamp:    Date.now(),
            });
            mismatchCount++;
          }
        });
      }

      if (mismatchCount > 0) {
        console.warn(
          `[YjsDocAdapter] §E3 ${mismatchCount} CW_LEVEL_Y_MISMATCH conflict(s) emitted — ` +
          `ConflictResolutionDialog should prompt re-geometry for affected levels.`
        );
      }
    } catch (e) {
      // Non-fatal — collaboration safety guard, not batch correctness.
      // A scan failure must never crash applyUpdate() or block the CRDT merge.
      console.warn('[YjsDocAdapter] §E3 _detectCwLevelYMismatch scan failed (non-fatal):', e);
    }
  }
}
