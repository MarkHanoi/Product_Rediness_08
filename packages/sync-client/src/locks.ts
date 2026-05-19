// @pryzm/sync-client — LockManager + LockHandle + LockConflictError (S45 D1).
//
// Lifecycle:
//   • S43 — `heldLocks` reserved on the awareness wire shape (ADR-0033 §2.6).
//   • S44 — `PryzmAwareness.setHeldLocks(...)` setter shipped (full S44 runtime).
//   • S45 (this file) — client-side LockManager that talks to the server's
//     `/api/locks/:elementId` endpoints and mirrors the held-lock list onto
//     awareness so peers paint a "Locked by Bob" badge in real time.
//   • S46 — chaos-test the lease-expiry semantics under contention.
//
// Spec source: `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md`
//   • §S45 lines 393-423 — the canonical client surface.
//   • §S45 line 440 — server returns 409 + JSON body `{ holder: <displayName> }`
//     on conflict.
//
// Per `[strategic ADR-019]` soft-locks are advisory at the wire (peers are
// expected to respect them) but server-enforced at the gateway: a peer that
// commits a write touching an element they don't hold the lock for has the
// command rejected with 409 at AppendEvent.
//
// PURE: no DOM, no THREE, no Yjs.  The `transport` seam is the only side-effect
// surface and is injectable for tests (the unit suite passes a MockTransport
// rather than spinning up the real server + fetch polyfill).

import type { ElementId, UserId } from './types.js';

// ─── Wire contracts ─────────────────────────────────────────────────────────
//
// These mirror `apps/sync-server/src/locks/handlers.ts` exactly — the two
// files are intentionally kept in lock-step.  When this file changes, that
// file changes, and the integration test in
// `apps/sync-server/__tests__/locks.test.ts` is the contract.

/** Server response body for a successful POST /api/locks/:id (acquire) or
 *  POST /api/locks/:id/extend (extend).  Contains the lease-id the client
 *  must echo on subsequent extends + the absolute-timestamp expiry so the
 *  client can schedule its next auto-extend without clock drift. */
export interface LockAcquireSuccessBody {
  readonly elementId: ElementId;
  readonly leaseId: string;
  /** Server clock, ms since epoch.  Client schedules auto-extend at
   *  `expiresAtMs - extendMarginMs`. */
  readonly expiresAtMs: number;
}

/** Server response body for a 409 Conflict on POST /api/locks/:id.  The
 *  `holder` block is what the editor surfaces in the friendly UI message
 *  ("User Bob is editing this wall — try again in 12 s"). */
export interface LockAcquireConflictBody {
  readonly elementId: ElementId;
  readonly holder: {
    readonly userId: UserId;
    readonly displayName: string;
    readonly expiresAtMs: number;
  };
}

/** Optional snapshot row exposed by GET /api/locks?projectId=... — the
 *  editor uses it on cold-start to populate the lock-badge layer before
 *  the awareness `change` events catch up. */
export interface LockRow {
  readonly elementId: ElementId;
  readonly holderId: UserId;
  readonly holderDisplayName: string;
  readonly leaseId: string;
  readonly acquiredAtMs: number;
  readonly expiresAtMs: number;
}

// ─── Errors ─────────────────────────────────────────────────────────────────

/** Thrown by `LockManager.acquire` when the server returns 409 Conflict.
 *  The `holder` block has the same shape as `LockAcquireConflictBody.holder`
 *  so the editor can show a friendly toast without re-parsing JSON.
 *
 *  The error is INSTANCEOF-checkable from any plugin (the prototype is set
 *  explicitly because TypeScript-down-targeted Error subclasses lose the
 *  prototype chain by default). */
export class LockConflictError extends Error {
  readonly elementId: ElementId;
  readonly holder: LockAcquireConflictBody['holder'];
  constructor(elementId: ElementId, holder: LockAcquireConflictBody['holder']) {
    super(`Element ${elementId} is locked by ${holder.displayName}`);
    this.name = 'LockConflictError';
    this.elementId = elementId;
    this.holder = holder;
    Object.setPrototypeOf(this, LockConflictError.prototype);
  }
}

/** Thrown when the server returns a non-409 error, or the response body is
 *  malformed.  The transport layer stays narrow — anything that isn't a
 *  conflict is a TransportError so the caller can choose between retry vs
 *  surface-to-user. */
export class LockTransportError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'LockTransportError';
    this.status = status;
    Object.setPrototypeOf(this, LockTransportError.prototype);
  }
}

// ─── Transport seam ─────────────────────────────────────────────────────────
//
// We do NOT take a hard dependency on `fetch` — the unit suite injects a
// MockTransport so it doesn't need a polyfill and the bench harness can
// substitute an in-process direct call against the SoftLockStore (skipping
// the JSON serialise round-trip).
//
// Implementations MUST throw `LockConflictError` on a 409 response and
// `LockTransportError` on any other non-2xx.  The default `fetchTransport()`
// factory below does this for the production editor.

export interface LockTransport {
  acquire(elementId: ElementId, ttlMs: number): Promise<LockAcquireSuccessBody>;
  extend(elementId: ElementId, leaseId: string, ttlMs: number): Promise<LockAcquireSuccessBody>;
  release(elementId: ElementId, leaseId: string): Promise<void>;
  list(projectId: string): Promise<readonly LockRow[]>;
}

export interface FetchTransportOptions {
  /** Base URL for the locks API; e.g. `https://sync.pryzm.com` or `''` for
   *  same-origin.  No trailing slash. */
  readonly baseUrl: string;
  /** Bearer token; passed as `Authorization: Bearer <token>`. */
  readonly authToken: string;
  /** Project scope.  Sent as the `?projectId=...` query parameter on every
   *  request because the server enforces lock isolation per-project. */
  readonly projectId: string;
  /** Optional fetch injection.  Default is `globalThis.fetch`. */
  readonly fetch?: typeof globalThis.fetch;
}

/** Default transport that talks to the sync-server over HTTP.  Stays out of
 *  the unit suite — the unit suite uses MockTransport. */
export function createFetchTransport(opts: FetchTransportOptions): LockTransport {
  const f = opts.fetch ?? globalThis.fetch;
  if (typeof f !== 'function') {
    throw new Error('createFetchTransport: globalThis.fetch is unavailable; pass opts.fetch');
  }
  const headers = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${opts.authToken}`,
  });
  const url = (path: string): string =>
    `${opts.baseUrl}${path}?projectId=${encodeURIComponent(opts.projectId)}`;
  return {
    async acquire(elementId, ttlMs) {
      const res = await f(url(`/api/locks/${encodeURIComponent(elementId)}`), {
        method: 'POST', headers: headers(), body: JSON.stringify({ ttlMs }),
      });
      if (res.status === 409) {
        const body = (await res.json()) as LockAcquireConflictBody;
        throw new LockConflictError(elementId, body.holder);
      }
      if (!res.ok) throw new LockTransportError(res.status, `lock acquire failed: ${res.status}`);
      return (await res.json()) as LockAcquireSuccessBody;
    },
    async extend(elementId, leaseId, ttlMs) {
      const res = await f(url(`/api/locks/${encodeURIComponent(elementId)}/extend`), {
        method: 'POST', headers: headers(), body: JSON.stringify({ leaseId, ttlMs }),
      });
      if (!res.ok) throw new LockTransportError(res.status, `lock extend failed: ${res.status}`);
      return (await res.json()) as LockAcquireSuccessBody;
    },
    async release(elementId, leaseId) {
      const res = await f(url(`/api/locks/${encodeURIComponent(elementId)}`), {
        method: 'DELETE', headers: { ...headers(), 'X-Lease-Id': leaseId },
      });
      // 404 on release is benign — sweeper got there first.  Spec §S45 D6.
      if (!res.ok && res.status !== 404) {
        throw new LockTransportError(res.status, `lock release failed: ${res.status}`);
      }
    },
    async list(projectId) {
      const res = await f(`${opts.baseUrl}/api/locks?projectId=${encodeURIComponent(projectId)}`, {
        method: 'GET', headers: headers(),
      });
      if (!res.ok) throw new LockTransportError(res.status, `lock list failed: ${res.status}`);
      return (await res.json()) as readonly LockRow[];
    },
  };
}

// ─── Awareness mirror seam ──────────────────────────────────────────────────
//
// LockManager mirrors its locally-held locks onto PryzmAwareness so the peer-
// list and the lock-badge renderer can paint without polling the server.
// We keep the dependency narrow — only the `setHeldLocks` method is used —
// so the unit suite can inject a stub.

export interface AwarenessHeldLocksSink {
  setHeldLocks(locks: readonly ElementId[]): void;
}

// ─── LockManager + LockHandle ──────────────────────────────────────────────

/** Default TTL for a lock acquire.  Spec §S45 line 399. */
const DEFAULT_TTL_MS = 30_000;

/** Auto-extend window.  We extend at TTL/2 by default — same as Yjs's
 *  awareness keep-alive, gives one round-trip of headroom under normal
 *  network conditions. */
const DEFAULT_EXTEND_MARGIN_RATIO = 0.5;

export interface LockManagerOptions {
  /** Default acquire TTL in ms.  Default 30 000 (spec line 399). */
  readonly defaultTtlMs?: number;
  /** Auto-extend ratio in (0, 1).  The next extend fires `ttlMs * ratio`
   *  ms after the last successful acquire/extend.  Default 0.5. */
  readonly extendMarginRatio?: number;
  /** Optional clock injection for tests. */
  readonly now?: () => number;
  /** Optional setTimeout injection for tests (vitest fake timers preferred). */
  readonly setTimeout?: typeof setTimeout;
  readonly clearTimeout?: typeof clearTimeout;
}

export class LockManager {
  private readonly transport: LockTransport;
  private readonly awareness: AwarenessHeldLocksSink | null;
  private readonly defaultTtlMs: number;
  private readonly extendMarginRatio: number;
  // D.5.A.6 (2026-04-30) TS-sweep: the `private readonly now` clock field was
  // assigned (`opts.now ?? Date.now`) but never called — TTL expiry uses
  // `setT`/`clearT` timer refs directly, not a `now()` read, so the clock
  // was dead state.  If a future TTL-extend step needs a wall-clock read
  // (e.g. `now()` for retroactive expiry checks during reconnect), re-add
  // the field AND a reader.  Surfaced via D.5.A.6 type-import edge.
  private readonly setT: typeof setTimeout;
  private readonly clearT: typeof clearTimeout;
  /** Active handles keyed by elementId.  At most one per element on this client. */
  private readonly active = new Map<ElementId, LockHandle>();
  private disposed = false;

  constructor(
    transport: LockTransport,
    awareness: AwarenessHeldLocksSink | null,
    opts: LockManagerOptions = {},
  ) {
    this.transport = transport;
    this.awareness = awareness;
    this.defaultTtlMs = opts.defaultTtlMs ?? DEFAULT_TTL_MS;
    this.extendMarginRatio = opts.extendMarginRatio ?? DEFAULT_EXTEND_MARGIN_RATIO;
    this.setT = opts.setTimeout ?? setTimeout;
    this.clearT = opts.clearTimeout ?? clearTimeout;
  }

  /** Acquire a lock on an element.  Resolves with the LockHandle on success,
   *  rejects with `LockConflictError` if another peer holds it.
   *
   *  If THIS client already holds the lock, returns the existing handle —
   *  callers can call `acquire()` defensively without double-leasing. */
  async acquire(elementId: ElementId, ttlMs?: number): Promise<LockHandle> {
    if (this.disposed) throw new Error('LockManager: disposed');
    const existing = this.active.get(elementId);
    if (existing) return existing;
    const ttl = ttlMs ?? this.defaultTtlMs;
    const body = await this.transport.acquire(elementId, ttl);
    const handle = new LockHandle(elementId, body.leaseId, body.expiresAtMs, this);
    this.active.set(elementId, handle);
    this.publishHeldLocks();
    this.scheduleAutoExtend(handle, ttl);
    return handle;
  }

  /** Extend an existing handle.  Returns the new expiry timestamp.
   *  Throws if the handle is not active on this manager.
   *
   *  Auto-extend uses this internally; manual extend is exposed for callers
   *  that want longer-than-default leases (e.g. an open form dialog). */
  async extend(handle: LockHandle, ttlMs?: number): Promise<number> {
    if (this.disposed) throw new Error('LockManager: disposed');
    if (this.active.get(handle.elementId) !== handle) {
      throw new Error(`LockManager: handle for ${handle.elementId} is not active`);
    }
    const ttl = ttlMs ?? this.defaultTtlMs;
    const body = await this.transport.extend(handle.elementId, handle.leaseId, ttl);
    handle._setExpiresAt(body.expiresAtMs);
    this.scheduleAutoExtend(handle, ttl);
    return body.expiresAtMs;
  }

  /** Release a lock on an element.  Idempotent — releasing a lock the
   *  client doesn't hold is a no-op (matches the server's 404-as-benign
   *  semantics).  Cancels any pending auto-extend. */
  async release(elementId: ElementId): Promise<void> {
    const handle = this.active.get(elementId);
    if (!handle) return;
    this.cancelAutoExtend(handle);
    this.active.delete(elementId);
    this.publishHeldLocks();
    handle._markReleased();
    try {
      await this.transport.release(elementId, handle.leaseId);
    } catch (err) {
      // Local state is already cleared; transport errors here are at-most-once
      // delivery failures the sweeper will resolve within 5 s + ttlMs.
      if (!(err instanceof LockTransportError)) throw err;
    }
  }

  /** Snapshot of currently-held element IDs on this client. */
  heldElementIds(): readonly ElementId[] {
    return [...this.active.keys()].sort();
  }

  /** Tear down the manager — cancels every pending auto-extend timer.
   *  Does NOT release server-side locks (that's the caller's choice;
   *  in practice the page-unload handler should call `releaseAll` first). */
  dispose(): void {
    if (this.disposed) return;
    for (const handle of this.active.values()) this.cancelAutoExtend(handle);
    this.disposed = true;
  }

  /** Best-effort batched release used on page-unload.  Awaits every release
   *  in parallel; individual failures are swallowed (the sweeper is the
   *  authoritative cleanup path). */
  async releaseAll(): Promise<void> {
    const ids = [...this.active.keys()];
    await Promise.all(ids.map((id) => this.release(id).catch(() => undefined)));
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private publishHeldLocks(): void {
    if (this.awareness === null) return;
    this.awareness.setHeldLocks(this.heldElementIds());
  }

  private scheduleAutoExtend(handle: LockHandle, ttlMs: number): void {
    this.cancelAutoExtend(handle);
    const margin = ttlMs * this.extendMarginRatio;
    const fireIn = Math.max(0, margin);
    const timer = this.setT(() => {
      this.extend(handle, ttlMs).catch(() => {
        // Auto-extend failure → drop the local handle; the sweeper will clear
        // the server-side row when expires_at lapses.  No throw — this fires
        // from a setTimeout, so a throw would be unhandled.
        if (this.active.get(handle.elementId) === handle) {
          this.active.delete(handle.elementId);
          this.publishHeldLocks();
          handle._markReleased();
        }
      });
    }, fireIn);
    handle._setAutoExtendTimer(timer);
  }

  private cancelAutoExtend(handle: LockHandle): void {
    const timer = handle._takeAutoExtendTimer();
    if (timer !== null) this.clearT(timer);
  }
}

/** Opaque handle returned by `LockManager.acquire`.  Carries the leaseId
 *  and the absolute-time expiry so callers can render "expires in 12 s"
 *  hints in the UI. */
export class LockHandle {
  readonly elementId: ElementId;
  readonly leaseId: string;
  private expiresAtMs: number;
  private released = false;
  private autoExtendTimer: ReturnType<typeof setTimeout> | null = null;
  /** Back-ref to the owning manager so `.release()` is a one-liner. */
  private readonly manager: LockManager;

  constructor(
    elementId: ElementId,
    leaseId: string,
    expiresAtMs: number,
    manager: LockManager,
  ) {
    this.elementId = elementId;
    this.leaseId = leaseId;
    this.expiresAtMs = expiresAtMs;
    this.manager = manager;
  }

  getExpiresAtMs(): number { return this.expiresAtMs; }
  isReleased(): boolean { return this.released; }

  /** Convenience — `await handle.release()` instead of `mgr.release(id)`. */
  release(): Promise<void> { return this.manager.release(this.elementId); }

  /** @internal — LockManager-private setter. */
  _setExpiresAt(t: number): void { this.expiresAtMs = t; }
  /** @internal */
  _setAutoExtendTimer(t: ReturnType<typeof setTimeout>): void { this.autoExtendTimer = t; }
  /** @internal */
  _takeAutoExtendTimer(): ReturnType<typeof setTimeout> | null {
    const t = this.autoExtendTimer;
    this.autoExtendTimer = null;
    return t;
  }
  /** @internal */
  _markReleased(): void { this.released = true; }
}
