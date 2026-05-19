// apps/sync-server/src/presence/PresenceService.ts — Wave A19-T8
//
// CONTRACT (C08 §3.2, §3.4):
// displayName MUST be pulled from the server-verified JWT `user.name` claim
// or the server's pryzm_users record — NOT from the client-provided string.
// Clients MUST NOT be able to spoof their own displayName in presence events.
//
// This service mirrors the `_displayNameCache` + `resolveDisplayName()` pattern
// already in server.js (lines 483–505) but formalized as a typed module for
// use inside the apps/sync-server WebSocket path.
//
// Integration: called from SessionManager.handlePresence() when a WebSocket
// client sends a `presence.update` message.  The server enriches the payload
// with the authoritative displayName before broadcasting to peers.

import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.sync-server.presence');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ClientPresenceData {
  userId: string;
  /** Client-provided name — overridden by server-authoritative resolution. */
  displayName?: string;
  color?: string;
  cursor?: { x: number; y: number };
  [key: string]: unknown;
}

export interface ServerPresenceData {
  userId: string;
  /** Server-authoritative display name — never trust the client claim. */
  displayName: string;
  color: string;
  cursor?: { x: number; y: number };
}

// ─── PresenceService ─────────────────────────────────────────────────────────

/**
 * PresenceService — server-authoritative display names on presence events.
 *
 * CONTRACT (C08 §3.2):
 * displayName is resolved from the server's session registry (userId → name)
 * rather than accepted from the client payload.  This prevents presence
 * spoofing (a client cannot impersonate another user via a crafted displayName).
 *
 * The displayName source priority is:
 *   1. Injected name override (from JWT / user store — injected at session open)
 *   2. UserId prefix (first 8 chars) — anonymous fallback
 *
 * Full JWT resolution (via `jwt.verify(token, SESSION_SECRET)`) is wired in
 * server.js lines 299–306 and the _displayNameCache (lines 483–505) — that
 * Socket.io path already implements server-authority.  This module brings the
 * same contract to the apps/sync-server WebSocket path.
 */
export class PresenceService {
  /** userId → resolved server-authoritative displayName. */
  private readonly _cache = new Map<string, string>();

  /**
   * Register a user's server-authoritative display name at session open.
   * Called when the client connects and the server resolves their identity.
   */
  registerUser(userId: string, displayName: string): void {
    const span = tracer.startSpan('pryzm.presence.registerUser', {
      attributes: { 'pryzm.user.id': userId },
    });
    try {
      this._cache.set(userId, displayName);
    } finally {
      span.end();
    }
  }

  /**
   * Enrich a client presence payload with the server-authoritative displayName.
   *
   * CONTRACT: the returned object ALWAYS has `displayName` from the server.
   * The client-provided `displayName` is discarded.
   */
  getServerAuthoritativePresence(
    userId: string,
    clientPresence: ClientPresenceData,
  ): ServerPresenceData {
    const span = tracer.startSpan('pryzm.presence.enrichPresence', {
      attributes: { 'pryzm.user.id': userId },
    });
    try {
      const authoritativeDisplayName =
        this._cache.get(userId) ??
        // Fallback: use userId prefix if not yet resolved
        `user:${userId.slice(0, 8)}`;

      return {
        ...clientPresence,
        userId,
        // Server overrides client-provided name — P8 compliance
        displayName: authoritativeDisplayName,
        color: clientPresence.color ?? '#6366f1',
      };
    } finally {
      span.end();
    }
  }

  /** Remove a user from the cache when they disconnect. */
  unregisterUser(userId: string): void {
    this._cache.delete(userId);
  }

  /** Number of registered users (test helper). */
  size(): number { return this._cache.size; }
}

// ─── Singleton exported for sync-server wiring ──────────────────────────────
export const presenceService = new PresenceService();
