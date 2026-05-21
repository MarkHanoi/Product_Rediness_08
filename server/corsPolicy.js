/**
 * @file server/corsPolicy.js
 * @description Centralised CORS configuration for PRYZM server.
 *
 * CONTRACT (07-BIM-SECURITY-CONTRACT §9 — CORS & Transport Security):
 *  - Allowed origins are derived from the ALLOWED_ORIGIN env var (comma-separated list).
 *  - In development (env var not set) the wildcard '*' is used so local workflows are not broken.
 *  - The same allowlist is shared by both the Express cors() middleware and Socket.io's cors option
 *    so there is a single point of truth for origin policy.
 *  - This module MUST NOT be imported from any file inside src/.
 *
 * Setting ALLOWED_ORIGIN in production:
 *   ALLOWED_ORIGIN=https://your-app.replit.app
 *   or comma-separated for multiple:
 *   ALLOWED_ORIGIN=https://your-app.replit.app,https://custom-domain.com
 */

/**
 * Returns the list of allowed origins from ALLOWED_ORIGIN env var.
 *
 * §H1 (audit) — Fail closed in production. When `credentials: true` is set
 * (it is), `origin: '*'` causes the cors package to reflect the request
 * origin, effectively allowing any site to make credentialed requests. In
 * dev (NODE_ENV !== 'production') we keep the '*' fallback so local
 * workflows are not broken; in production we return an EMPTY array which
 * the cors package treats as "deny all cross-origin requests" — preferable
 * to silent over-permission. Operators are expected to set ALLOWED_ORIGIN.
 *
 * @returns {string|string[]}
 */
export function getAllowedOrigins() {
    const raw = process.env.ALLOWED_ORIGIN;
    if (!raw) {
        if (process.env.NODE_ENV === 'production') {
            console.warn(
                '[corsPolicy] ALLOWED_ORIGIN is not set in production — denying all cross-origin requests. ' +
                'Set ALLOWED_ORIGIN to your deployed origin(s) to enable the app.',
            );
            return []; // deny all cross-origin requests
        }
        return '*'; // dev convenience only
    }
    const list = raw.split(',').map(s => s.trim()).filter(Boolean);
    return list.length === 1 ? list[0] : list;
}

/**
 * Returns options object suitable for passing to the `cors` package.
 * Usage: app.use(cors(expressCorsOptions()))
 * @returns {object}
 */
export function expressCorsOptions() {
    const origin = getAllowedOrigins();
    return {
        origin,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'x-internal-secret'],
        credentials: true,
    };
}

/**
 * Returns Socket.io-compatible cors options object.
 * Usage: new Server(httpServer, { cors: socketCorsOptions() })
 * @returns {object}
 */
export function socketCorsOptions() {
    return {
        origin: getAllowedOrigins(),
        methods: ['GET', 'POST'],
    };
}
