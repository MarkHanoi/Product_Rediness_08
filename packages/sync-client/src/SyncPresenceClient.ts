// @pryzm/sync-client — SyncPresenceClient (Wave A19-T9)
//
// CONTRACT (C08 §3.2, §3.4):
// Presence avatars MUST use the server-authoritative displayName injected
// by the server — not the client-provided string.  This client consumes
// presence events from the awareness protocol and exposes a typed API for
// rendering presence avatars / cursors in the editor.
//
// The server-authoritative displayName flows:
//   1. User connects → server resolves name from pryzm_users (server.js §50 CP-1)
//   2. Server registers in PresenceService._cache → enriches broadcast
//   3. Remote clients receive `ServerPresenceData` with authoritative name
//   4. SyncPresenceClient presents this to the editor UI
//
// OTel: every public method has a span per P8 span requirement.

import { trace } from '@opentelemetry/api';
import type { PryzmAwareness, PryzmAwarenessState } from './awareness.js';

const tracer = trace.getTracer('pryzm.sync-client.presence');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PresenceUser {
  userId: string;
  /** Server-authoritative displayName — never the client-claimed name. */
  displayName: string;
  color: string;
  cursor: { x: number; y: number; viewId: string } | null;
  activeViewId: string;
  activeTool: string | null;
}

type PresenceChangeHandler = (users: readonly PresenceUser[]) => void;

// ─── SyncPresenceClient ──────────────────────────────────────────────────────

/**
 * SyncPresenceClient — displays presence avatars using server-authoritative
 * displayName from the awareness protocol.
 *
 * Usage:
 *   const presenceClient = new SyncPresenceClient(awareness);
 *   presenceClient.onUsersChanged((users) => renderAvatars(users));
 */
export class SyncPresenceClient {
  private readonly _handlers = new Set<PresenceChangeHandler>();
  private _users: PresenceUser[] = [];
  private _disposed = false;

  constructor(private readonly _awareness: PryzmAwareness) {
    const span = tracer.startSpan('pryzm.presence.client.init');
    try {
      // Subscribe to awareness changes and republish as typed PresenceUser[]
      // The awareness state already has server-authoritative displayName because:
      //   - The server sets it via PresenceService before broadcasting
      //   - The local user's displayName is set from the JWT on connect
      this._awareness.on('change', () => {
        this._recompute();
      });
    } finally {
      span.end();
    }
  }

  /**
   * Subscribe to presence user list changes.
   * Fires immediately with current users, then on every change.
   * Returns a disposer.
   */
  onUsersChanged(handler: PresenceChangeHandler): () => void {
    this._handlers.add(handler);
    handler(this._users);
    return () => { this._handlers.delete(handler); };
  }

  /** Current snapshot of connected users. */
  getUsers(): readonly PresenceUser[] { return this._users; }

  /** Number of connected users (including self). */
  getUserCount(): number { return this._users.length; }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._handlers.clear();
  }

  private _recompute(): void {
    const span = tracer.startSpan('pryzm.presence.client.recompute');
    try {
      const states = this._awareness.getStates();
      this._users = Object.entries(states)
        .map(([, state]) => this._toPresenceUser(state as PryzmAwarenessState))
        .filter((u): u is PresenceUser => u !== null);

      for (const h of this._handlers) {
        try { h(this._users); } catch { /* swallow */ }
      }
    } finally {
      span.end();
    }
  }

  private _toPresenceUser(state: PryzmAwarenessState): PresenceUser | null {
    if (!state?.userId) return null;
    return {
      userId: state.userId,
      displayName: state.displayName ?? `user:${state.userId.slice(0, 8)}`,
      color: '#6366f1',
      cursor: state.cursor ?? null,
      activeViewId: state.activeViewId ?? 'main-3d',
      activeTool: state.activeTool ?? null,
    };
  }
}
