// apps/sync-server/src/YjsProjectCache.ts — Wave A19-T4 (Phase 2D; ADR-049 §4.4)
//
// CONTRACT (C08 §3.1 amended by ADR-049):
// The sync server MUST maintain server-side Y.Doc instances and use
// Y.applyUpdate to merge concurrent edits rather than LWW (last-writer-wins).
// Yjs CRDT guarantees convergence: all clients eventually see the same state.
//
// ADR-049 — Y.Doc-per-level CRDT split (Task 4.4):
//   Level-scoped Y.Doc instances are stored separately from the project-level
//   doc, keyed by "${projectId}:${levelId}".  Socket.io rooms are named by
//   the same compound key so clients subscribe only to the active level.
//
//   Level-scoped API (all additive — existing project-scoped methods unchanged):
//     applyUpdateForLevel()     — server-side merge for one level
//     getFullStateForLevel()    — catch-up state for late-joining client
//     getStateVectorForLevel()  — differential sync vector for one level
//     mergeStatesForLevel()     — cross-client merge within one level scope
//     evictLevel()              — remove a level Y.Doc from memory
//     getLevelIds()             — enumerate active level docs for a project
//     levelSize()               — total number of active level docs
//
// The LWW path (SessionManager → EventLog → broadcast) is preserved for
// JSON command events.  This cache handles ONLY the Yjs binary protocol.
//
// Room naming convention (ADR-049 §4.4):
//   Project-wide room:  "${projectId}"
//   Level-scoped room:  "${projectId}:${levelId}"

import * as Y from 'yjs';
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.sync-server.yjs');

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Compound cache key for level-scoped docs: "${projectId}:${levelId}". */
function _levelKey(projectId: string, levelId: string): string {
  return `${projectId}:${levelId}`;
}

// ─── YjsProjectCache ─────────────────────────────────────────────────────────

/**
 * YjsProjectCache — in-memory map of Y.Doc per project (and per level) for
 * server-side CRDT merge.
 *
 * CONTRACT (C08 §3.1, ADR-049 §4.4):
 * All Yjs binary updates MUST pass through this cache via `applyUpdate()`
 * (project-level) or `applyUpdateForLevel()` (level-scoped).
 * The cache tracks the merged CRDT state; the merged delta is broadcast
 * to other subscribers rather than the raw client update.
 *
 * Backward compatibility:
 *   All project-scoped methods (`applyUpdate`, `getFullState`,
 *   `getStateVector`, `mergeStates`, `evict`, `size`) are unchanged and
 *   continue to operate on `_projectDocs`.  Level-scoped methods operate on
 *   `_levelDocs` — the two maps are completely independent.
 */
export class YjsProjectCache {
  // ── Project-level docs (Phase 2D — unchanged) ──────────────────────────────
  private readonly _projectDocs = new Map<string, Y.Doc>();

  // ── Level-scoped docs (ADR-049 §4.4) ──────────────────────────────────────
  // Keyed by "${projectId}:${levelId}".  Independent from _projectDocs so
  // the two sync paths can coexist during the PRYZM_YDOC_PER_LEVEL rollout.
  private readonly _levelDocs = new Map<string, Y.Doc>();

  // ── Project-level API (Phase 2D — backward-compatible, unchanged) ──────────

  /**
   * Apply a binary Yjs update for a project.
   * Creates a project Y.Doc if it does not yet exist.
   *
   * @param projectId - PRYZM project identifier
   * @param update - Raw Yjs binary update from a client
   * @returns The merged state delta to broadcast to other clients
   */
  applyUpdate(projectId: string, update: Uint8Array): Uint8Array {
    const span = tracer.startSpan('pryzm.sync.yjs.applyUpdate', {
      attributes: {
        'pryzm.project.id': projectId,
        'pryzm.update.byteLength': update.byteLength,
      },
    });
    try {
      const doc = this._getOrCreateProject(projectId);
      const stateBefore = Y.encodeStateVector(doc);
      Y.applyUpdate(doc, update);
      const mergedDelta = Y.encodeStateAsUpdate(doc, stateBefore);
      span.setAttribute('pryzm.update.merged.byteLength', mergedDelta.byteLength);
      return mergedDelta;
    } finally {
      span.end();
    }
  }

  /**
   * Get the full state of a project's Y.Doc as a binary update.
   * Used for catch-up sync when a new client joins the project room.
   *
   * @returns Full state snapshot, or null if no Y.Doc exists yet
   */
  getFullState(projectId: string): Uint8Array | null {
    const span = tracer.startSpan('pryzm.sync.yjs.getFullState', {
      attributes: { 'pryzm.project.id': projectId },
    });
    try {
      const doc = this._projectDocs.get(projectId);
      if (!doc) return null;
      return Y.encodeStateAsUpdate(doc);
    } finally {
      span.end();
    }
  }

  /**
   * Get the state vector for a project.
   * Clients send their state vector to request only the delta they're missing.
   */
  getStateVector(projectId: string): Uint8Array {
    const doc = this._projectDocs.get(projectId);
    if (!doc) return new Uint8Array(0);
    return Y.encodeStateVector(doc);
  }

  /**
   * Merge two Y.Doc states from two clients (for conflict detection).
   * Returns `{ merged, isConflict }`.
   */
  mergeStates(
    projectId: string,
    updateA: Uint8Array,
    updateB: Uint8Array,
  ): { merged: Uint8Array; isConflict: boolean } {
    const span = tracer.startSpan('pryzm.sync.yjs.mergeStates', {
      attributes: { 'pryzm.project.id': projectId },
    });
    try {
      return this._mergeTwoUpdates(projectId, updateA, updateB, this._projectDocs);
    } finally {
      span.end();
    }
  }

  /** Remove a project's Y.Doc from memory (e.g. when all users disconnect). */
  evict(projectId: string): void {
    const doc = this._projectDocs.get(projectId);
    if (doc) {
      doc.destroy();
      this._projectDocs.delete(projectId);
    }
  }

  /** Number of active project docs (for health endpoint). */
  size(): number { return this._projectDocs.size; }

  // ── Level-scoped API (ADR-049 §4.4) ────────────────────────────────────────

  /**
   * Apply a binary Yjs update for a specific level within a project.
   * Creates the level Y.Doc if it does not yet exist.
   *
   * The compound key `${projectId}:${levelId}` matches the Socket.io room
   * name that clients subscribe to (ADR-049 §4.4 room naming convention).
   *
   * @param projectId - PRYZM project identifier
   * @param levelId   - Level identifier (e.g. "L1", "basement")
   * @param update    - Raw Yjs binary update from a client for this level
   * @returns The merged state delta to broadcast to other subscribers of
   *          the same level room — NOT broadcast project-wide.
   */
  applyUpdateForLevel(
    projectId: string,
    levelId: string,
    update: Uint8Array,
  ): Uint8Array {
    const span = tracer.startSpan('pryzm.sync.yjs.applyUpdateForLevel', {
      attributes: {
        'pryzm.project.id': projectId,
        'pryzm.level.id': levelId,
        'pryzm.update.byteLength': update.byteLength,
      },
    });
    try {
      const doc = this._getOrCreateLevel(projectId, levelId);
      const stateBefore = Y.encodeStateVector(doc);
      Y.applyUpdate(doc, update);
      const mergedDelta = Y.encodeStateAsUpdate(doc, stateBefore);
      span.setAttribute('pryzm.update.merged.byteLength', mergedDelta.byteLength);
      return mergedDelta;
    } finally {
      span.end();
    }
  }

  /**
   * Get the full state of a level's Y.Doc as a binary update.
   *
   * This is the critical primitive for the late-join fast path:
   * a client joining the `${projectId}:${levelId}` room receives only
   * this update (~200 KB) instead of the full project state (~200 MB).
   *
   * @returns Full level state snapshot, or null if no Y.Doc exists yet
   *          (client has no catch-up work to do — level is empty).
   */
  getFullStateForLevel(projectId: string, levelId: string): Uint8Array | null {
    const span = tracer.startSpan('pryzm.sync.yjs.getFullStateForLevel', {
      attributes: {
        'pryzm.project.id': projectId,
        'pryzm.level.id': levelId,
      },
    });
    try {
      const doc = this._levelDocs.get(_levelKey(projectId, levelId));
      if (!doc) return null;
      return Y.encodeStateAsUpdate(doc);
    } finally {
      span.end();
    }
  }

  /**
   * Get the state vector for a specific level's Y.Doc.
   * Clients send this when reconnecting to request only the delta they missed.
   *
   * @returns Empty Uint8Array if the level doc does not yet exist.
   */
  getStateVectorForLevel(projectId: string, levelId: string): Uint8Array {
    const doc = this._levelDocs.get(_levelKey(projectId, levelId));
    if (!doc) return new Uint8Array(0);
    return Y.encodeStateVector(doc);
  }

  /**
   * Merge two Y.Doc states for a specific level (conflict detection).
   * Semantics identical to `mergeStates()` but scoped to one level.
   *
   * @returns `{ merged, isConflict }` — isConflict true when the Yjs-level
   *          merge is semantically ambiguous (same key, diverged history).
   */
  mergeStatesForLevel(
    projectId: string,
    levelId: string,
    updateA: Uint8Array,
    updateB: Uint8Array,
  ): { merged: Uint8Array; isConflict: boolean } {
    const span = tracer.startSpan('pryzm.sync.yjs.mergeStatesForLevel', {
      attributes: {
        'pryzm.project.id': projectId,
        'pryzm.level.id': levelId,
      },
    });
    try {
      return this._mergeTwoUpdates(
        _levelKey(projectId, levelId),
        updateA,
        updateB,
        this._levelDocs,
      );
    } finally {
      span.end();
    }
  }

  /**
   * Remove a specific level's Y.Doc from memory.
   * The project-level doc (in `_projectDocs`) is NOT affected.
   * Use when all subscribers of a level room have disconnected.
   */
  evictLevel(projectId: string, levelId: string): void {
    const key = _levelKey(projectId, levelId);
    const doc = this._levelDocs.get(key);
    if (doc) {
      doc.destroy();
      this._levelDocs.delete(key);
    }
  }

  /**
   * All level IDs for which a Y.Doc is currently active for a given project.
   * Used by the health endpoint and eviction logic.
   */
  getLevelIds(projectId: string): string[] {
    const prefix = `${projectId}:`;
    const ids: string[] = [];
    for (const key of this._levelDocs.keys()) {
      if (key.startsWith(prefix)) {
        ids.push(key.slice(prefix.length));
      }
    }
    return ids;
  }

  /**
   * Total number of active level docs across all projects.
   * Complements `size()` (project docs) for the health endpoint.
   */
  levelSize(): number { return this._levelDocs.size; }

  // ── Internals ──────────────────────────────────────────────────────────────

  private _getOrCreateProject(projectId: string): Y.Doc {
    let doc = this._projectDocs.get(projectId);
    if (!doc) {
      doc = new Y.Doc();
      this._projectDocs.set(projectId, doc);
    }
    return doc;
  }

  private _getOrCreateLevel(projectId: string, levelId: string): Y.Doc {
    const key = _levelKey(projectId, levelId);
    let doc = this._levelDocs.get(key);
    if (!doc) {
      doc = new Y.Doc();
      this._levelDocs.set(key, doc);
    }
    return doc;
  }

  /**
   * Core merge algorithm shared by `mergeStates` and `mergeStatesForLevel`.
   * Works on any doc map (project or level) using the provided storage key.
   *
   * Algorithm:
   *   1. Apply updateA and updateB to independent scratch docs.
   *   2. Bidirectionally merge the two scratch docs via Yjs CRDT.
   *   3. Verify convergence (both docs JSON-equal after merge).
   *   4. Persist the merged state into the cache doc under `cacheKey`.
   *   5. Return the merged binary update + the conflict flag.
   */
  private _mergeTwoUpdates(
    cacheKey: string,
    updateA: Uint8Array,
    updateB: Uint8Array,
    storage: Map<string, Y.Doc>,
  ): { merged: Uint8Array; isConflict: boolean } {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    try {
      Y.applyUpdate(docA, updateA);
      Y.applyUpdate(docB, updateB);

      // Bidirectional CRDT merge
      const deltaA = Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB));
      Y.applyUpdate(docB, deltaA);
      const deltaB = Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA));
      Y.applyUpdate(docA, deltaB);

      // Convergence check
      const isConflict = JSON.stringify(docA.toJSON()) !== JSON.stringify(docB.toJSON());

      // Persist merged state into the cache
      let cacheDoc = storage.get(cacheKey);
      if (!cacheDoc) {
        cacheDoc = new Y.Doc();
        storage.set(cacheKey, cacheDoc);
      }
      Y.applyUpdate(cacheDoc, Y.encodeStateAsUpdate(docB));

      return { merged: Y.encodeStateAsUpdate(docB), isConflict };
    } finally {
      docA.destroy();
      docB.destroy();
    }
  }
}

// Singleton for use across the sync-server
export const yjsProjectCache = new YjsProjectCache();
