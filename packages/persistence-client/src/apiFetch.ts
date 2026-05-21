/**
 * apiFetch — authenticated fetch wrapper for all /api/ calls.
 *
 * Contract §07 §2.3: Every request to /api/ MUST include the
 * Authorization: Bearer <token> header when the user is authenticated.
 *
 * This module reads the JWT stored in localStorage by AuthModal and injects
 * it automatically. All /api/ fetch calls must use this instead of raw fetch.
 *
 * S87-WIRE (Wave 7, 2026-05-01): migrated from src/api/ to src/services/
 * (proper home for a shared service utility; src/api/ deleted).
 * Next destination: packages/protocol/ (Wave 8+).
 */

const AUTH_TOKEN_KEY = 'bim-platform-token';

export function getStoredToken(): string | null {
    try {
        return localStorage.getItem(AUTH_TOKEN_KEY);
    } catch {
        return null;
    }
}

/**
 * Contract 45 §7.2 — extract the authenticated user's id from the stored JWT.
 *
 * Decodes the (unverified) payload of the bearer token to read the `sub`
 * (standard subject claim) or `userId` field. Verification is the server's
 * responsibility — the client only needs the id to filter local caches
 * (e.g. `bim-projects-index`) so projects belonging to a previous user on
 * the same browser are not surfaced.
 *
 * Returns `null` when no token is stored or the token payload cannot be
 * decoded. Callers must treat `null` as "no projects to show".
 */
export function getCurrentUserId(): string | null {
    const token = getStoredToken();
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
        let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const pad = b64.length % 4;
        if (pad) b64 += '='.repeat(4 - pad);
        const json = atob(b64);
        const payload = JSON.parse(json) as Record<string, unknown>;
        const id = (payload.sub ?? payload.userId ?? payload.user_id ?? payload.id);
        return typeof id === 'string' ? id : (id != null ? String(id) : null);
    } catch {
        return null;
    }
}

/**
 * §H14 (audit) — default request timeout. Without this every apiFetch caller
 * (project load, catch-up replay, visibility-intent sync, etc.) hung
 * indefinitely on a stalled server connection, leaving the UI permanently
 * "loading" with no feedback. We default to 30 s; callers can override by
 * passing their own `AbortSignal` in `init.signal` (we chain through).
 */
export class NetworkTimeoutError extends Error {
    readonly code = 'NETWORK_TIMEOUT';
    constructor(message = 'Network request timed out') {
        super(message);
        this.name = 'NetworkTimeoutError';
    }
}
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Drop-in replacement for fetch() that adds Authorization: Bearer header.
 * Signature matches window.fetch so call-sites can swap without other changes.
 */
export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const token = getStoredToken();
    const headers = new Headers(init.headers ?? {});
    if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    // §H14 — timeout via AbortController; respect caller-provided signal too.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    if (typeof timer === 'object' && timer && 'unref' in timer && typeof (timer as { unref?: () => void }).unref === 'function') {
        (timer as { unref: () => void }).unref();
    }
    if (init.signal) {
        // If the caller's signal is already aborted, abort ours immediately.
        if (init.signal.aborted) controller.abort();
        else init.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    return fetch(input, { ...init, headers, signal: controller.signal })
        .catch((err) => {
            if (err?.name === 'AbortError') {
                throw new NetworkTimeoutError(
                    `apiFetch timed out after ${DEFAULT_TIMEOUT_MS}ms: ${typeof input === 'string' ? input : (input as URL).toString?.() ?? '[Request]'}`
                );
            }
            throw err;
        })
        .finally(() => clearTimeout(timer));
}
