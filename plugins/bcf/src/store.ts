// BCFStore — in-memory store for the active BCF archive (S59 / ADR-0007).
//
// Wave 12 recipe completion: bcf plugin store.ts (previously missing).
//
// The BCF plugin does not use Store<T> (which is for element DTOs) —
// instead it holds a single BCFArchive record (the whole parsed BCF
// zip) plus per-topic metadata needed for fast UI rendering.
//
// The store follows the same "applyPatch-free mutable singleton" pattern
// used by InMemoryIFCMetaStore: it exposes imperative set/get methods
// and fires a dirty callback so UI panels can re-render.

import type { BCFArchive, BCFTopic } from './types.js';

export type BCFDirtyCallback = () => void;

/**
 * BCFStore holds the in-memory BCF archive loaded from the last
 * successful bcf.import command. Handlers mutate it via set*() helpers;
 * the BCF panel reads it via get*() helpers.
 */
export class BCFStore {
  private archive: BCFArchive | null = null;
  private readonly dirtyListeners = new Set<BCFDirtyCallback>();

  // ── Read surface ──────────────────────────────────────────────────────────

  getArchive(): BCFArchive | null {
    return this.archive;
  }

  getTopics(): readonly BCFTopic[] {
    return this.archive?.topics ?? [];
  }

  getTopic(guid: string): BCFTopic | undefined {
    return this.archive?.topics.find((t) => t.guid === guid);
  }

  isEmpty(): boolean {
    return this.archive === null || this.archive.topics.length === 0;
  }

  // ── Write surface (called by handlers) ───────────────────────────────────

  /** Replace the entire in-memory archive (e.g. after bcf.import). */
  setArchive(archive: BCFArchive): void {
    this.archive = archive;
    this.fireDirty();
  }

  /** Clear the archive (project close / new project). */
  clearArchive(): void {
    this.archive = null;
    this.fireDirty();
  }

  // ── Subscription ──────────────────────────────────────────────────────────

  /** Subscribe to archive changes. Returns an unsubscribe function. */
  subscribeDirty(cb: BCFDirtyCallback): () => void {
    this.dirtyListeners.add(cb);
    return () => this.dirtyListeners.delete(cb);
  }

  private fireDirty(): void {
    for (const cb of this.dirtyListeners) cb();
  }
}
