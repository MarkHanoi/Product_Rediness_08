import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus(typeof window !== 'undefined' ? window : undefined);

/**
 * @pryzm/persistence-client/AuthClient — typed auth surface (L0).
 *
 * Spec (canonical sources, in conflict-resolution order):
 *
 * • `chunks/02-runtime-architecture.md §3.8` (line 223): "AuthClient
 *   (`bim-platform-token` — stays; auth is orthogonal to the wireup)."
 *   This class IS the AuthClient that §3.8 refers to. Composition target,
 *   not inheritance.
 *
 * • `chunks/22-end-to-end-flows.md §22.1` step 1.2: "Click 'Sign up' /
 *   'Log in' → AuthModal opens | platform/AuthModal.ts →
 *   runtime.persistence.client.auth.* (oauth2-pkce) | A.1 + C.2–C.3 |
 *   bench/ui/auth-modal-open.bench.ts (< 50 ms)". This class is the
 *   `runtime.persistence.client.auth.*` typed leg referenced in step 1.2;
 *   exposed via `ProjectListClient.auth` so the canonical access path
 *   `runtime.persistence.client.auth.signInWithGoogle()` resolves
 *   without modifying chunks/02 §3.2's `client: ProjectListClient`
 *   contract.
 *
 * • `chunks/08-click-trails.md §11.2`: "AuthModal flow unchanged. Token
 *   still in `localStorage['bim-platform-token']` (auth is orthogonal —
 *   `runtime.persistence.client` reads the token via `getAuthToken()`
 *   on every request — already wired in `ProjectListClient`)." This
 *   class **wraps** the existing localStorage + popup-OAuth +
 *   postMessage mechanism with a typed surface. The mechanism itself is
 *   unchanged; only the access path moves from "AuthModal opens popup
 *   directly" to "AuthModal calls auth.signInWith*() which opens popup".
 *   No new server endpoints, no new storage keys, no new gestures.
 *
 * Architectural reconciliation note (audit 2026-04-30): chunks/22 §22.1
 * step 1.2 is the only canonical mention of an `.auth` sub-namespace on
 * `runtime.persistence.client`; chunks/02 §3.8 + chunks/08 §11.2 say
 * "auth is orthogonal" and "AuthModal flow unchanged". These are NOT
 * contradictory: a typed wrapper that owns the same legacy mechanism
 * satisfies both. The wrapper is invokable standalone (no runtime
 * required) for back-compat with AuthModal call sites that pre-date
 * the runtime threading (S73-WIRE Phase B).
 */

import {
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  PRYZM_OAUTH_MESSAGE_TYPE,
} from './AuthClient.types.js';
import type {
  AuthUser,
  AuthResult,
  AuthClientErrorKind,
  PryzmOAuthMessage,
} from './AuthClient.types.js';

export type {
  Plan,
  PlanStatus,
  AuthUser,
  AuthResult,
  AuthClientErrorKind,
  PryzmOAuthMessage,
} from './AuthClient.types.js';

export {
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  AUTH_SIGNED_OUT_EVENT,
  PRYZM_OAUTH_MESSAGE_TYPE,
} from './AuthClient.types.js';

/** Typed error class for AuthClient failures. Mirrors `ProjectListClientError`'s shape so callers can switch on `.kind`. */
export class AuthClientError extends Error {
  constructor(
    readonly kind: AuthClientErrorKind,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AuthClientError';
  }
}

export interface AuthClientOptions {
  /** Defaults to `globalThis.fetch`. */
  readonly fetch?: typeof fetch;
  /** Defaults to `''` (relative URLs — same-origin with the API). */
  readonly baseUrl?: string;
  /**
   * Window for popup OAuth + postMessage. Defaults to `globalThis.window`
   * when present. Tests inject a stub. When `null`/absent, OAuth methods
   * throw `AuthClientError('no-window', ...)` — useful for SSR/Node.
   */
  readonly window?: Window | null;
  /**
   * Storage backend. Defaults to `globalThis.localStorage`. Tests inject
   * an in-memory stub. When `null`/absent, session persistence is no-op
   * (sign-in still resolves but token is not persisted).
   */
  readonly storage?: Storage | null;
  /**
   * Popup window features for OAuth. Defaults to a 520×620 centered
   * popup matching the legacy AuthModal behavior.
   */
  readonly popupFeatures?: string;
}

const DEFAULT_POPUP_FEATURES = 'width=520,height=620,resizable=yes,scrollbars=yes,status=yes';

function getDefaultWindow(): Window | null {
  return typeof window !== 'undefined' ? window : null;
}

function getDefaultStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * AuthClient — typed wrapper over the legacy auth mechanism
 * (`/api/auth/*` endpoints + `bim-platform-token` localStorage +
 * popup-OAuth postMessage).
 *
 * Lifetime: a single `AuthClient` instance is owned by `ProjectListClient`
 * and exposed at `runtime.persistence.client.auth`. The instance is
 * stateless beyond the in-flight popup listeners; safe to share.
 *
 * Threading: all methods are safe to call from any context; the popup
 * listeners are scoped per-call and torn down on resolve/reject.
 */
export class AuthClient {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly windowImpl: Window | null;
  private readonly storageImpl: Storage | null;
  private readonly popupFeatures: string;

  constructor(opts: AuthClientOptions = {}) {
    const f = opts.fetch ?? (typeof fetch !== 'undefined' ? fetch : undefined);
    if (!f) {
      throw new Error(
        '[AuthClient] no fetch implementation available; ' +
        'pass `opts.fetch` (e.g. node-fetch in tests).',
      );
    }
    this.fetchImpl = f.bind(globalThis);
    this.baseUrl = (opts.baseUrl ?? '').replace(/\/+$/, '');
    this.windowImpl = opts.window === undefined ? getDefaultWindow() : opts.window;
    this.storageImpl = opts.storage === undefined ? getDefaultStorage() : opts.storage;
    this.popupFeatures = opts.popupFeatures ?? DEFAULT_POPUP_FEATURES;
  }

  // ── OAuth2 providers (chunks/22 §22.1 step 1.2 — "oauth2-pkce") ─────────

  /**
   * Sign in with Google via OAuth2 popup. Opens `/api/auth/google` in
   * a popup window; awaits the postMessage from the OAuth callback;
   * persists the session on success.
   *
   * Returns the `AuthResult` (user + token) on success.
   * Throws `AuthClientError`:
   *   - `'no-window'` if no Window is available (SSR/Node).
   *   - `'popup-blocked'` if the browser blocked the popup.
   *   - `'oauth-failed'` if the OAuth callback returned an error.
   *   - `'oauth-cancelled'` if the popup was closed before completion.
   */
  signInWithGoogle(): Promise<AuthResult> {
    return this.openOAuthPopup('google');
  }

  /** Sign in with Microsoft (Outlook). See `signInWithGoogle`. */
  signInWithMicrosoft(): Promise<AuthResult> {
    return this.openOAuthPopup('microsoft');
  }

  // ── Email / password (legacy contract; /api/auth/signin + /signup) ──────

  /**
   * Sign in with email + password against the legacy `/api/auth/signin`
   * endpoint. Persists the session on success.
   */
  async signInWithEmail(email: string, password: string): Promise<AuthResult> {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      throw new AuthClientError('invalid-request', 'Please enter a valid email address.');
    }
    if (password.length < 8) {
      throw new AuthClientError('invalid-request', 'Password must be at least 8 characters.');
    }
    return this.postAuth('/api/auth/signin', { email: trimmedEmail, password });
  }

  /**
   * Create an account via the legacy `/api/auth/signup` endpoint.
   * Persists the session on success.
   */
  async signUpWithEmail(
    email: string,
    password: string,
    name: string,
  ): Promise<AuthResult> {
    const trimmedEmail = email.trim();
    const trimmedName = name.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      throw new AuthClientError('invalid-request', 'Please enter a valid email address.');
    }
    if (password.length < 8) {
      throw new AuthClientError('invalid-request', 'Password must be at least 8 characters.');
    }
    if (!trimmedName) {
      throw new AuthClientError('invalid-request', 'Please enter your name.');
    }
    return this.postAuth('/api/auth/signup', { email: trimmedEmail, password, name: trimmedName });
  }

  // ── Session lifecycle ────────────────────────────────────────────────────

  /**
   * Sign out — clears the local auth token + user; dispatches the global
   * `pryzm:auth:signedOut` CustomEvent so AuthModal can re-show.
   *
   * Spec: chunks/02 §3.8 (`bim-platform-token` is the canonical key);
   * §16.3 sub-phase C.10.04. The PRYZM JWT is stateless server-side, so
   * no `/api/auth/signout` endpoint is invoked — clearing client-side is
   * sufficient. When a session-revocation endpoint lands later, this
   * method is the single place to wire the POST.
   */
  async signOut(): Promise<void> {
    try {
      this.storageImpl?.removeItem(AUTH_TOKEN_KEY);
      this.storageImpl?.removeItem(AUTH_USER_KEY);
    } catch { /* sandbox / private mode — no-op */ }
    try {
      if (this.windowImpl && typeof CustomEvent !== 'undefined') {
        _bus.emit('pryzm:auth:signedOut', {}); // F.events.18
      }
    } catch { /* no DOM — no-op */ }
  }

  /** Returns the current signed-in user, or `null` if not signed in. */
  getCurrentUser(): AuthUser | null {
    try {
      const raw = this.storageImpl?.getItem(AUTH_USER_KEY);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  }

  /** Returns the current bearer token, or `null` if not signed in. */
  getToken(): string | null {
    try {
      return this.storageImpl?.getItem(AUTH_TOKEN_KEY) ?? null;
    } catch {
      return null;
    }
  }

  /** Convenience: `getToken() !== null`. */
  isSignedIn(): boolean {
    const token = this.getToken();
    return token !== null && token.length > 0;
  }

  // ── internal ─────────────────────────────────────────────────────────────

  private openOAuthPopup(provider: 'google' | 'microsoft'): Promise<AuthResult> {
    const win = this.windowImpl;
    if (!win) {
      return Promise.reject(new AuthClientError(
        'no-window',
        '[AuthClient] OAuth requires a Window (popup + postMessage). ' +
        'No window available in this environment.',
      ));
    }
    return new Promise<AuthResult>((resolve, reject) => {
      const url = `${this.baseUrl}/api/auth/${provider}`;
      const popup = win.open(url, `pryzm-oauth-${provider}`, this.popupFeatures);
      if (!popup) {
        reject(new AuthClientError(
          'popup-blocked',
          'Popup blocked by browser. Please allow popups for this site and try again.',
        ));
        return;
      }

      let settled = false;
      const cleanup = () => {
        win.removeEventListener('message', listener);
        if (pollHandle !== null) {
          win.clearInterval(pollHandle);
          pollHandle = null;
        }
      };

      const listener = (e: MessageEvent) => {
        const data = e.data as PryzmOAuthMessage | undefined;
        if (!data || data.type !== PRYZM_OAUTH_MESSAGE_TYPE) return;
        const payload = data.payload;
        if (!payload) return;

        if (payload.error) {
          settled = true;
          cleanup();
          reject(new AuthClientError('oauth-failed', payload.error));
          return;
        }

        if (payload.token && payload.user) {
          settled = true;
          cleanup();
          const result: AuthResult = { user: payload.user, token: payload.token };
          this.persistSession(result.user, result.token);
          resolve(result);
        }
      };
      win.addEventListener('message', listener);

      // Detect popup-closed-without-completing (user dismissed the OAuth
      // window). Polled because there is no portable "popup closed" event.
      let pollHandle: number | null = win.setInterval(() => {
        try {
          if (popup.closed && !settled) {
            settled = true;
            cleanup();
            reject(new AuthClientError(
              'oauth-cancelled',
              'Sign-in was cancelled before it completed.',
            ));
          }
        } catch {
          // Cross-origin access on `popup.closed` should not throw on
          // modern browsers, but guard regardless.
        }
      }, 500) as unknown as number;
    });
  }

  private async postAuth(path: string, body: unknown): Promise<AuthResult> {
    const url = `${this.baseUrl}${path}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new AuthClientError('network-error', String(err), err);
    }
    let data: { user?: AuthUser; token?: string; error?: string } | null;
    try {
      data = (await res.json()) as { user?: AuthUser; token?: string; error?: string } | null;
    } catch {
      data = null;
    }
    if (!res.ok) {
      const kind: AuthClientErrorKind = res.status === 401 || res.status === 403
        ? 'unauthenticated'
        : res.status >= 400 && res.status < 500 ? 'invalid-request' : 'server-error';
      throw new AuthClientError(kind, data?.error ?? `Request failed (${res.status})`);
    }
    if (!data || !data.user || !data.token) {
      throw new AuthClientError(
        'server-error',
        'Server response missing user or token.',
      );
    }
    const result: AuthResult = {
      user: { ...data.user, createdAt: data.user.createdAt ?? Date.now() },
      token: data.token,
    };
    this.persistSession(result.user, result.token);
    return result;
  }

  private persistSession(user: AuthUser, token: string): void {
    try {
      this.storageImpl?.setItem(AUTH_USER_KEY, JSON.stringify(user));
      this.storageImpl?.setItem(AUTH_TOKEN_KEY, token);
    } catch { /* sandbox / private mode — no-op */ }
  }
}
