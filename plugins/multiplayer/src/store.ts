// MultiplayerStore — peer awareness and lock state store (S44 / PHASE-2D).
//
// Wave 12 recipe completion: multiplayer plugin store.ts (previously missing).
//
// The multiplayer plugin tracks connected peers (cursor positions, active
// view, active tool, idle state) and soft-lock ownership. Handlers call
// set*() methods after receiving awareness events from the sync client.
//
// This is NOT a Store<T> (element DTOs) — it is an ephemeral session
// store that holds transient presence data that does NOT need undo/redo.

export interface PeerRecord {
  readonly clientID: number;
  readonly displayName: string;
  /** View the peer is currently looking at. */
  activeViewId: string;
  /** Tool the peer has active (may be undefined for non-tool interactions). */
  activeToolId?: string;
  /** Cursor in view-local coordinates (undefined if cursor not visible). */
  cursor?: { readonly x: number; readonly y: number };
  /** Unix ms of last awareness update — used for idle detection. */
  lastSeenAt: number;
}

export interface LockRecord {
  readonly elementId: string;
  /** clientID of the peer holding the lock. */
  readonly ownerClientID: number;
  readonly acquiredAt: number;
}

export type MultiplayerDirtyCallback = () => void;

/**
 * MultiplayerStore holds ephemeral peer presence and element lock state.
 * Handlers update it on PEER_JOIN, PEER_LEAVE, CURSOR_MOVE, LOCK_CHANGE.
 * The peer list panel and cursor renderer subscribe via subscribeDirty().
 */
export class MultiplayerStore {
  private readonly peers = new Map<number, PeerRecord>();
  private readonly locks = new Map<string, LockRecord>();
  private readonly dirtyListeners = new Set<MultiplayerDirtyCallback>();

  // ── Peers ─────────────────────────────────────────────────────────────────

  getPeers(): readonly PeerRecord[] {
    return [...this.peers.values()];
  }

  getPeer(clientID: number): PeerRecord | undefined {
    return this.peers.get(clientID);
  }

  upsertPeer(record: PeerRecord): void {
    this.peers.set(record.clientID, record);
    this.fireDirty();
  }

  removePeer(clientID: number): void {
    this.peers.delete(clientID);
    this.fireDirty();
  }

  updateCursor(clientID: number, viewId: string, x: number, y: number): void {
    const peer = this.peers.get(clientID);
    if (!peer) return;
    this.peers.set(clientID, {
      ...peer,
      activeViewId: viewId,
      cursor: { x, y },
      lastSeenAt: Date.now(),
    });
    this.fireDirty();
  }

  // ── Locks ─────────────────────────────────────────────────────────────────

  getLocks(): readonly LockRecord[] {
    return [...this.locks.values()];
  }

  getLock(elementId: string): LockRecord | undefined {
    return this.locks.get(elementId);
  }

  setLock(elementId: string, ownerClientID: number): void {
    this.locks.set(elementId, { elementId, ownerClientID, acquiredAt: Date.now() });
    this.fireDirty();
  }

  releaseLock(elementId: string): void {
    this.locks.delete(elementId);
    this.fireDirty();
  }

  // ── Subscription ──────────────────────────────────────────────────────────

  subscribeDirty(cb: MultiplayerDirtyCallback): () => void {
    this.dirtyListeners.add(cb);
    return () => this.dirtyListeners.delete(cb);
  }

  private fireDirty(): void {
    for (const cb of this.dirtyListeners) cb();
  }
}
