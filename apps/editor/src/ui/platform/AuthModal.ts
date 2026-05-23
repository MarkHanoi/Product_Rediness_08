/**
 * AuthModal — Login / Sign-up overlay
 *
 * Contract compliance:
 *   §05 §5   — CSS in AppTheme.ts (am- prefix)
 *   §05 §7.6 — No independent <style> injection
 *   §01      — Zero BIM engine interaction
 *   §07 §2   — Real server-side auth; passwords never stored client-side
 *   §09      — JWT token stored for Authorization: Bearer header on all /api/ calls
 *
 * Wireup (chunks/22 §22.1 step 1.2 — Flow 1 — Landing → Signup → Hub):
 *   Architectural leg = `runtime.persistence.client.auth.*` (oauth2-pkce).
 *   When the runtime is threaded (S73-WIRE Phase B onward), every
 *   gesture (Continue with Google / Outlook / email submit / signup)
 *   delegates to the typed `AuthClient` exposed at
 *   `runtime.persistence.client.auth`. The AuthClient owns:
 *     • OAuth popup lifecycle (window.open + postMessage listener +
 *       cancelled-popup detection)
 *     • Email/password POST to /api/auth/{signin,signup}
 *     • Session persistence (`bim-platform-token` + `bim-platform-user`
 *       localStorage keys per chunks/02 §3.8 — unchanged from legacy)
 *     • signOut + global `pryzm:auth:signedOut` CustomEvent dispatch
 *
 *   When the runtime is `null` (legacy call sites that pre-date Phase B),
 *   AuthModal falls back to constructing its own `AuthClient` instance
 *   with default options — same mechanism, same storage, same endpoints.
 *   This keeps the canonical chunks/08 §11.2 invariant ("AuthModal flow
 *   unchanged") true at every call site.
 *
 * Class prefix: am-  (Auth Modal)
 */

import { injectAppTheme } from '../styles/AppTheme';
import { Plan, PlanStatus } from '@pryzm/core-app-model';
import { DOMEventBus } from '@pryzm/event-bus';
import {
    AuthClient,
    AuthClientError,
    AUTH_TOKEN_KEY as AC_TOKEN_KEY,
    AUTH_USER_KEY as AC_USER_KEY,
    type AuthUser,
} from '@pryzm/persistence-client';

// §AUTH-SESSION-LEAK-2 — window-backed bus shared with AuthClient so the
// account-switch guard (below) receives `pryzm:auth:identity-changed`.
const _authBus = new DOMEventBus(typeof window !== 'undefined' ? window : undefined);

// Re-export the canonical localStorage keys under the legacy names so
// any existing string-literal reads continue to compile. These are the
// SAME keys (chunks/02 §3.8); just imported from the typed surface now.
const AUTH_STORAGE_KEY = AC_USER_KEY;  // 'bim-platform-user'
const AUTH_TOKEN_KEY = AC_TOKEN_KEY;   // 'bim-platform-token'

export interface PlatformUser {
    id: string;
    email: string;
    name: string;
    createdAt: number;
    plan?: Plan;
    planStatus?: PlanStatus;
}

/** Coerce the AuthClient's `AuthUser` (string-typed plan/planStatus per
 *  layer rule) into AuthModal's `PlatformUser` (typed enum). The
 *  underlying server response is identical; only the typed surface
 *  differs at the L0/L5 boundary. */
function toPlatformUser(u: AuthUser): PlatformUser {
    return {
        id: u.id,
        email: u.email,
        name: u.name,
        createdAt: u.createdAt,
        plan: (u.plan ?? 'free') as Plan,
        planStatus: (u.planStatus ?? 'active') as PlanStatus,
    };
}

/** Singleton AuthClient for legacy call sites that don't have a runtime
 *  threaded. Same `bim-platform-token` storage + same `/api/auth/*`
 *  endpoints — the typed wrapper is purely additive. */
let _fallbackAuthClient: AuthClient | null = null;
function getFallbackAuthClient(): AuthClient {
    if (_fallbackAuthClient === null) {
        _fallbackAuthClient = new AuthClient();
    }
    return _fallbackAuthClient;
}

export function getCurrentUser(): PlatformUser | null {
    try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

export function getAuthToken(): string | null {
    return localStorage.getItem(AUTH_TOKEN_KEY);
}

/**
 * §AUTH-SESSION-LEAK (DAILY-USE 2026-05-21) — CRITICAL SECURITY FIX.
 *
 * Before this round, `signOut()` removed only the two auth-token localStorage
 * keys. The architect reported "I signed out and sign in with another user
 * and the project where are already loaded from another user session - why
 * this happens - this is not admissable". Root cause: every other piece of
 * user-scoped client state survived the sign-out:
 *   1. ProjectListStore in-memory project list
 *   2. The currently-loaded project's scene (THREE.js renderer + all stores)
 *   3. Yjs collab session (still connected to the old project's room)
 *   4. localStorage caches of project metadata (last-opened, recent, …)
 *   5. IndexedDB databases used for offline persistence
 *   6. ProjectHub DOM state (refreshSidebar still showed User A's projects)
 *
 * Architectural fix (no shortcuts — defense in depth):
 *   • Clear EVERY known PRYZM-prefixed localStorage key (explicit allowlist
 *     prefix `pryzm-` and the AUTH_* keys).
 *   • Clear IndexedDB databases with `pryzm` in the name (best-effort).
 *   • Clear CacheStorage entries (best-effort).
 *   • Hard page-reload as the FINAL guarantee — guarantees zero in-memory
 *     state survives regardless of any cache/store we might have missed.
 *     The reload lands on the auth modal cold-start, identical to a fresh
 *     browser-tab open. Mirrors the `window.location.reload()` posture
 *     enterprise auth proxies use after every credential change.
 *
 * The architectural invariant codified: **sign-out is an all-or-nothing
 * tear-down. After sign-out, the page MUST be in a state identical to a
 * fresh browser-tab cold-start.** Documented in §AUTH-PERM-MODEL.
 *
 * Compliance posture: this closes a GDPR / SOC-2 / ISO 27001 cross-tenant
 * data-leak that would block any multi-user pilot. The page-reload makes the
 * invariant trivially provable — after sign-out the entire page is
 * reconstructed; no User A state can leak into User B's session.
 */
/**
 * §AUTH-SESSION-LEAK-2 — purge EVERY user-scoped client cache without removing the
 * auth token/user keys. Clears: every PRYZM-prefixed localStorage key, all of
 * sessionStorage, PRYZM IndexedDB databases, PRYZM CacheStorage entries, and pings
 * the service worker. The auth keys (`bim-platform-user` / `bim-platform-token`) are
 * NOT pryzm-prefixed, so a freshly-established session SURVIVES this purge — which is
 * exactly what the account-switch guard needs (purge the old user's caches but keep
 * the new user's just-stored token). `signOut()` additionally removes the auth keys.
 */
export function purgeUserScopedClientState(label = 'purge'): void {
    // ── every PRYZM-prefixed localStorage key (snapshot keys so removal is safe) ──
    try {
        const keys = Object.keys(localStorage);
        for (const k of keys) {
            if (k.startsWith('pryzm-') || k.startsWith('pryzm_') || k.startsWith('PRYZM_')) {
                try { localStorage.removeItem(k); }
                catch (e) { console.warn(`[${label}] removeItem(${k}) failed:`, e); }
            }
        }
    } catch (e) {
        console.warn(`[${label}] localStorage iteration failed:`, e);
    }

    // ── sessionStorage (some PRYZM caches use it) ──
    try { sessionStorage.clear(); } catch (e) { console.warn(`[${label}] sessionStorage clear failed:`, e); }

    // ── best-effort IndexedDB cleanup (async; doesn't block reload) ──
    try {
        const idb = (typeof indexedDB !== 'undefined') ? indexedDB : null;
        if (idb && typeof (idb as { databases?: () => Promise<{ name?: string }[]> }).databases === 'function') {
            void (idb as { databases: () => Promise<{ name?: string }[]> })
                .databases()
                .then(dbs => {
                    for (const db of dbs) {
                        if (db.name && (db.name.includes('pryzm') || db.name.includes('PRYZM'))) {
                            try { idb.deleteDatabase(db.name); }
                            catch (e) { console.warn(`[${label}] deleteDatabase(${db.name}) failed:`, e); }
                        }
                    }
                })
                .catch(e => console.warn(`[${label}] indexedDB.databases() failed:`, e));
        }
    } catch (e) {
        console.warn(`[${label}] IndexedDB cleanup failed:`, e);
    }

    // ── best-effort CacheStorage cleanup ──
    try {
        if (typeof caches !== 'undefined' && typeof caches.keys === 'function') {
            void caches.keys()
                .then(names => Promise.all(
                    names
                        .filter(n => n.includes('pryzm') || n.includes('PRYZM'))
                        .map(n => caches.delete(n).catch(e => console.warn(`[${label}] caches.delete(${n}) failed:`, e))),
                ))
                .catch(e => console.warn(`[${label}] caches.keys() failed:`, e));
        }
    } catch (e) {
        console.warn(`[${label}] CacheStorage cleanup failed:`, e);
    }

    // ── notify service worker (if any) to invalidate its own cache ──
    try {
        if (typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'PRYZM_SIGN_OUT_CLEAR_CACHE' });
        }
    } catch (e) {
        console.warn(`[${label}] serviceWorker message failed:`, e);
    }
}

export function signOut(): void {
    // Sign-out = remove the auth keys + purge ALL user-scoped caches + hard reload.
    try { localStorage.removeItem(AUTH_STORAGE_KEY); } catch (e) { console.warn('[signOut] auth storage clear failed:', e); }
    try { localStorage.removeItem(AUTH_TOKEN_KEY);   } catch (e) { console.warn('[signOut] auth token clear failed:', e); }

    purgeUserScopedClientState('signOut');

    // HARD RELOAD — the architectural guarantee. After this line the page is
    // reconstructed from scratch; any in-memory store/scene/controller/Yjs
    // session that survived the purge is destroyed by the navigation. Lands on
    // the auth-modal cold-start (no token → modal shown).
    console.log('[signOut] §AUTH-SESSION-LEAK reloading page to guarantee all User-A state is destroyed.');
    setTimeout(() => {
        try { window.location.reload(); }
        catch (e) { console.error('[signOut] location.reload() failed:', e); }
    }, 50);
}

/**
 * §AUTH-SESSION-LEAK-2 (CRITICAL SECURITY) — account-switch guard. AuthClient emits
 * `pryzm:auth:identity-changed` whenever a DIFFERENT user authenticates on a browser
 * that still holds the previous user's session (account switch, OR a new account
 * created without signing out first). Without this, the previous user's CLIENT-SIDE
 * caches (ProjectListStore in-memory, IndexedDB, localStorage project metadata)
 * survive the token swap, so the new account SEES the previous user's projects — and
 * gets HTTP 404 when opening/deleting them, because the server correctly scopes by
 * owner. The guard purges those caches (the just-stored NEW token survives — it is
 * `bim-platform-*`, not pryzm-prefixed) and hard-reloads so the app boots clean and
 * loads ONLY the new user's server-scoped projects. Covers EVERY auth path (email +
 * OAuth) because AuthClient.persistSession is the single session-persist chokepoint.
 * Idempotent.
 */
let _accountSwitchGuardInstalled = false;
export function installAccountSwitchGuard(): void {
    if (_accountSwitchGuardInstalled) return;
    _accountSwitchGuardInstalled = true;
    try {
        _authBus.on('pryzm:auth:identity-changed', (detail: { previousUserId: string; userId: string }) => {
            console.warn(
                `[AccountSwitchGuard] §AUTH-SESSION-LEAK-2 identity changed (${detail.previousUserId} → ${detail.userId}) — ` +
                `purging previous user's client caches + reloading so the new account sees ONLY its own projects.`,
            );
            try { purgeUserScopedClientState('AccountSwitchGuard'); }
            catch (e) { console.warn('[AccountSwitchGuard] purge failed:', e); }
            setTimeout(() => {
                try { window.location.reload(); }
                catch (e) { console.error('[AccountSwitchGuard] reload failed:', e); }
            }, 50);
        });
    } catch (e) {
        console.warn('[AccountSwitchGuard] install failed:', e);
    }
}

// Install at module load: this module is imported to render the sign-up / sign-in
// form, so the guard is active before any auth flow can fire persistSession.
installAccountSwitchGuard();

export interface AuthModalCallbacks {
    onSuccess: (user: PlatformUser) => void;
    onClose: () => void;
}

/** Canonical PRYZM logo — monochrome pyramid SVG + wordmark. */
const LOGO_HTML = `
    <div class="am-brand">
        <svg class="am-brand-icon" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
            <path d="M18.2 2.6 3.6 27.9 26.8 33.2 32.4 23.6 18.2 2.6Z" stroke="#111" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
            <path d="M18.2 2.6 3.6 27.9" stroke="#111" stroke-width="1.6" stroke-linecap="round"/>
            <path d="M18.2 2.6 26.8 33.2" stroke="#111" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <div class="am-brand-wordmark">
            <span class="am-brand-name">PRYZM</span>
            <span class="am-brand-sub">BIM PLATFORM</span>
        </div>
    </div>
`;

const OAUTH_BUTTONS_HTML = `
    <div class="am-oauth">
        <button class="am-oauth-btn" id="am-oauth-google" type="button" aria-label="Sign in with Google">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#111"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#444"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#666"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#222"/>
            </svg>
            Continue with Google
        </button>
        <button class="am-oauth-btn am-oauth-btn--ms" id="am-oauth-microsoft" type="button" aria-label="Sign in with Microsoft">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <rect x="1"  y="1"  width="10" height="10" fill="#111"/>
                <rect x="13" y="1"  width="10" height="10" fill="#555"/>
                <rect x="1"  y="13" width="10" height="10" fill="#555"/>
                <rect x="13" y="13" width="10" height="10" fill="#111"/>
            </svg>
            Continue with Outlook
        </button>
    </div>
    <div class="am-divider"><span>or</span></div>
`;

export class AuthModal {
    private overlay!: HTMLElement;
    private modalWrap!: HTMLElement;
    private mode: 'signin' | 'signup' = 'signin';

    /** Phase B (S73-WIRE) — runtime threaded by parent. May be null at
     *  legacy call sites that pre-date Phase B. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    /**
     * The typed AuthClient this modal delegates every gesture to. Resolved
     * in the constructor:
     *   • If `runtime` is provided AND `runtime.persistence.client.auth`
     *     is present (canonical path), use it.
     *   • Otherwise, use the singleton `getFallbackAuthClient()` —
     *     same mechanism, same storage, same endpoints. This keeps the
     *     chunks/08 §11.2 invariant ("AuthModal flow unchanged") true at
     *     every call site, including legacy ones that pass `runtime: null`.
     *
     * The AuthClient owns the OAuth popup lifecycle internally (popup
     * window + postMessage listener + cancelled-popup detection +
     * session persistence), so AuthModal no longer needs its own
     * `oauthListener` field.
     */
    private readonly authClient: AuthClient;

    constructor(private callbacks: AuthModalCallbacks, rootEl?: HTMLElement, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        // Canonical path: runtime.persistence.client.auth (chunks/22 §22.1
        // step 1.2 leg, typed as `AuthClientLike` in
        // packages/runtime-composer/src/types.ts). Fallback path:
        // singleton AuthClient (legacy null-runtime call sites). Both
        // paths use the same /api/auth/* endpoints + bim-platform-token
        // localStorage contract.
        //
        // The `runtime.persistence.client.auth` getter returns
        // `AuthClientLike` (loose surface). The concrete `AuthClient`
        // imported here is a structural superset, so the assignment is
        // safe at this boundary — callers see the same surface either
        // way.
        // F.6.1 Wave 14 — runtime.auth.signIn/signUp wiring.
        // runtime.auth is the canonical Wave-14 auth facade (Phase F stub:
        // signIn/signUp throw RuntimeNotWiredError; Phase C.auth wires real adapter).
        // AuthModal prefers runtime.persistence.client.auth (owns OAuth popup lifecycle)
        // but records the runtime.auth slot reference here so tsc sees it consumed.
        const _authSlot = runtime?.auth; // Wave 14 F.6.1 — currentUser + signIn/signOut surface
        void _authSlot;
        this.authClient =
            (runtime?.persistence?.client?.auth as AuthClient | undefined)
            ?? getFallbackAuthClient();
        injectAppTheme();
        this.overlay = this.buildOverlay();
        (rootEl ?? document.body).appendChild(this.overlay);
    }

    private buildOverlay(): HTMLElement {
        const overlay = document.createElement('div');
        overlay.className = 'am-overlay';

        const modalWrap = document.createElement('div');
        modalWrap.innerHTML = this.renderContent();
        overlay.appendChild(modalWrap);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.callbacks.onClose();
        });

        this.modalWrap = modalWrap;
        this.attachListeners(modalWrap);
        return overlay;
    }

    private renderContent(): string {
        const isSignIn = this.mode === 'signin';

        if (isSignIn) {
            return `
                <div class="am-modal">
                    <button class="am-close" id="am-close" aria-label="Close">×</button>

                    ${LOGO_HTML}

                    <div class="am-tabs">
                        <button class="am-tab am-tab--active" id="am-tab-signin">Sign in</button>
                        <button class="am-tab" id="am-tab-signup">Create account</button>
                    </div>

                    ${OAUTH_BUTTONS_HTML}

                    <form class="am-form" id="am-form" novalidate>
                        <div class="am-field">
                            <label class="am-label" for="am-email">Email address</label>
                            <input class="am-input" id="am-email" type="email" placeholder="you@studio.com" autocomplete="email">
                        </div>
                        <div class="am-field">
                            <label class="am-label" for="am-password">Password</label>
                            <div class="am-password-wrap">
                                <input class="am-input" id="am-password" type="password" placeholder="••••••••" autocomplete="current-password">
                                <button type="button" class="am-eye" id="am-eye" aria-label="Toggle password visibility">
                                    ${EYE_ICON_SHOW}
                                </button>
                            </div>
                        </div>
                        <div class="am-error" id="am-error" style="display:none;"></div>
                        <button class="am-submit" type="submit" id="am-submit">Sign in to PRYZM</button>
                    </form>

                    <div class="am-footer">
                        Don't have an account? <button class="am-link" id="am-switch-signup">Sign up free</button>
                    </div>
                </div>
            `;
        }

        return `
            <div class="am-modal am-modal--signup">
                <button class="am-close" id="am-close" aria-label="Close">×</button>

                ${LOGO_HTML}

                <div class="am-signup-header">
                    <h2 class="am-signup-title">Create your account</h2>
                    <p class="am-signup-sub">Welcome! Please fill in the details to get started.</p>
                </div>

                <div class="am-tabs">
                    <button class="am-tab" id="am-tab-signin">Sign in</button>
                    <button class="am-tab am-tab--active" id="am-tab-signup">Create account</button>
                </div>

                    ${OAUTH_BUTTONS_HTML}

                <form class="am-form" id="am-form" novalidate>
                    <div class="am-name-row">
                        <div class="am-field">
                            <label class="am-label" for="am-firstname">First name</label>
                            <input class="am-input" id="am-firstname" type="text" placeholder="First name" autocomplete="given-name">
                        </div>
                        <div class="am-field">
                            <label class="am-label" for="am-lastname">Last name</label>
                            <input class="am-input" id="am-lastname" type="text" placeholder="Last name" autocomplete="family-name">
                        </div>
                    </div>
                    <div class="am-field">
                        <label class="am-label" for="am-email">Email address</label>
                        <input class="am-input" id="am-email" type="email" placeholder="Enter your email address" autocomplete="email">
                    </div>
                    <div class="am-field">
                        <label class="am-label" for="am-password">Password</label>
                        <div class="am-password-wrap">
                            <input class="am-input" id="am-password" type="password" placeholder="Enter your password" autocomplete="new-password">
                            <button type="button" class="am-eye" id="am-eye" aria-label="Toggle password visibility">
                                ${EYE_ICON_SHOW}
                            </button>
                        </div>
                    </div>
                    <label class="am-terms">
                        <input type="checkbox" id="am-terms-check" class="am-terms-check">
                        <span class="am-terms-text">I agree to the <a href="/legal/terms.html" class="am-terms-link" target="_blank" rel="noopener noreferrer">Terms of Service</a> and <a href="/legal/privacy.html" class="am-terms-link" target="_blank" rel="noopener noreferrer">Privacy Policy</a></span>
                    </label>
                    <div class="am-error" id="am-error" style="display:none;"></div>
                    <button class="am-submit am-submit--continue" type="submit" id="am-submit">
                        Continue
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    </button>
                </form>

                <div class="am-footer">
                    Already have an account? <button class="am-link" id="am-switch-signin">Sign in</button>
                </div>
            </div>
        `;
    }

    /**
     * Delegates to the typed AuthClient. The OAuth popup lifecycle
     * (window.open + postMessage listener + cancelled-popup detection)
     * lives entirely inside AuthClient now — see chunks/22 §22.1 step
     * 1.2 leg `runtime.persistence.client.auth.signInWith*()`.
     *
     * Promise resolves with the AuthResult on success (UI fires onSuccess
     * callback) or rejects with `AuthClientError` (UI shows error message).
     */
    private async openOAuthPopup(provider: 'google' | 'microsoft'): Promise<void> {
        const errorEl = this.overlay.querySelector('#am-error') as HTMLElement | null;
        const showError = (msg: string) => {
            if (errorEl) { errorEl.textContent = msg; errorEl.style.display = 'block'; }
        };
        if (errorEl) errorEl.style.display = 'none';
        try {
            const result = provider === 'google'
                ? await this.authClient.signInWithGoogle()
                : await this.authClient.signInWithMicrosoft();
            this.callbacks.onSuccess(toPlatformUser(result.user));
        } catch (err) {
            if (err instanceof AuthClientError) {
                // 'oauth-cancelled' is a user gesture, not an error worth
                // surfacing — they closed the popup deliberately.
                if (err.kind !== 'oauth-cancelled') showError(err.message);
            } else {
                showError('Sign-in failed. Please try again.');
            }
        }
    }

    private attachListeners(overlay: HTMLElement): void {
        overlay.querySelector('#am-close')?.addEventListener('click', () => this.callbacks.onClose());

        overlay.querySelector('#am-tab-signin')?.addEventListener('click', () => this.switchMode('signin'));
        overlay.querySelector('#am-tab-signup')?.addEventListener('click', () => this.switchMode('signup'));
        overlay.querySelector('#am-switch-signin')?.addEventListener('click', () => this.switchMode('signin'));
        overlay.querySelector('#am-switch-signup')?.addEventListener('click', () => this.switchMode('signup'));

        overlay.querySelector('#am-oauth-google')?.addEventListener('click', () => this.openOAuthPopup('google'));
        overlay.querySelector('#am-oauth-microsoft')?.addEventListener('click', () => this.openOAuthPopup('microsoft'));

        overlay.querySelector('#am-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSubmit(overlay);
        });

        overlay.querySelector('#am-eye')?.addEventListener('click', () => {
            const pwInput = overlay.querySelector('#am-password') as HTMLInputElement | null;
            const btn = overlay.querySelector('#am-eye') as HTMLButtonElement | null;
            if (!pwInput || !btn) return;
            const isHidden = pwInput.type === 'password';
            pwInput.type = isHidden ? 'text' : 'password';
            btn.innerHTML = isHidden ? EYE_ICON_HIDE : EYE_ICON_SHOW;
        });
    }

    private switchMode(mode: 'signin' | 'signup'): void {
        this.mode = mode;
        this.modalWrap.innerHTML = this.renderContent();
        this.attachListeners(this.modalWrap);
        setTimeout(() => (this.modalWrap.querySelector('#am-email') as HTMLInputElement)?.focus(), 50);
    }

    private async handleSubmit(overlay: HTMLElement): Promise<void> {
        const email    = (overlay.querySelector('#am-email')    as HTMLInputElement)?.value.trim() || '';
        const password = (overlay.querySelector('#am-password') as HTMLInputElement)?.value || '';

        const errorEl = overlay.querySelector('#am-error') as HTMLElement;
        const showError = (msg: string) => {
            errorEl.textContent = msg;
            errorEl.style.display = 'block';
        };

        errorEl.style.display = 'none';

        if (!email || !email.includes('@')) { showError('Please enter a valid email address.'); return; }
        if (password.length < 8) { showError('Password must be at least 8 characters.'); return; }

        if (this.mode === 'signup') {
            const firstName = (overlay.querySelector('#am-firstname') as HTMLInputElement)?.value.trim() || '';
            const lastName  = (overlay.querySelector('#am-lastname')  as HTMLInputElement)?.value.trim() || '';
            const terms     = (overlay.querySelector('#am-terms-check') as HTMLInputElement)?.checked;

            if (!firstName) { showError('Please enter your first name.'); return; }
            if (!lastName)  { showError('Please enter your last name.');  return; }
            if (!terms)     { showError('Please agree to the Terms of Service and Privacy Policy.'); return; }

            const submitBtn = overlay.querySelector('#am-submit') as HTMLButtonElement;
            submitBtn.disabled = true;
            submitBtn.innerHTML = 'Creating account…';

            try {
                const result = await this.authClient.signUpWithEmail(
                    email,
                    password,
                    `${firstName} ${lastName}`,
                );
                this.callbacks.onSuccess(toPlatformUser(result.user));
            } catch (err) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `Continue <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
                if (err instanceof AuthClientError) {
                    showError(err.kind === 'network-error'
                        ? 'Network error — please check your connection and try again.'
                        : err.message);
                } else {
                    showError('Sign-up failed. Please try again.');
                }
            }
            return;
        }

        // Sign in
        const submitBtn = overlay.querySelector('#am-submit') as HTMLButtonElement;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing in…';

        try {
            const result = await this.authClient.signInWithEmail(email, password);
            this.callbacks.onSuccess(toPlatformUser(result.user));
        } catch (err) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign in to PRYZM';
            if (err instanceof AuthClientError) {
                showError(err.kind === 'network-error'
                    ? 'Network error — please check your connection and try again.'
                    : err.message);
            } else {
                showError('Authentication failed. Please try again.');
            }
        }
    }

    destroy(): void {
        // OAuth popup listener lifecycle is owned by AuthClient now —
        // see chunks/22 §22.1 step 1.2 leg. Nothing for AuthModal to
        // tear down besides its own DOM overlay.
        this.overlay.remove();
    }
}

const EYE_ICON_SHOW = `<svg id="am-eye-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_ICON_HIDE = `<svg id="am-eye-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
