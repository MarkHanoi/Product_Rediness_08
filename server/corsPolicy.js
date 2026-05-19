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
 * Falls back to '*' when not set (development).
 * @returns {string|string[]}
 */
export function getAllowedOrigins() {
    const raw = process.env.ALLOWED_ORIGIN;
    if (!raw) return '*';
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
