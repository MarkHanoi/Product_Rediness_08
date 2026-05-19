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
 * Drop-in replacement for fetch() that adds Authorization: Bearer header.
 * Signature matches window.fetch so call-sites can swap without other changes.
 */
export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const token = getStoredToken();
    const headers = new Headers(init.headers ?? {});
    if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
    }
    return fetch(input, { ...init, headers });
}
