/**
 * logSafe.js — PII-safe logging helpers for PRYZM server code.
 *
 * Replit's deployment pipeline runs a HoundDog dataflow scan that BLOCKS
 * publishing if it detects PII (emails, auth tokens, API keys) flowing into
 * a console.* sink — even via boolean checks or template-string interpolation.
 *
 * Use these helpers anywhere user-identifying or secret data could end up in
 * a log line. Default to logging opaque IDs (`userId`, `projectId`); only mask
 * when an email or token must appear for debug purposes.
 *
 *   import { maskEmail, maskToken } from './logSafe.js';
 *   console.log(`[auth] sign-in OK: ${maskEmail(email)} (${userId})`);
 *
 * Rules of thumb:
 *  1. NEVER log a raw email, token, password, API key, or any slice of one.
 *  2. NEVER reference an `*_API_KEY` / `*_SECRET` variable inside a console.*
 *     call — even `apiKey ? 'set' : 'unset'` will trip the scanner.
 *  3. Prefer logging the user's `id` over their email for traceability.
 *  4. If you must log a user-supplied identifier, run it through `maskEmail`
 *     or `maskToken` first.
 */

/**
 * Mask an email so the scanner sees a non-email string.
 * `alice@example.com` → `a***@e***.com`
 * Returns `'***'` for falsy / non-email input.
 */
export function maskEmail(email) {
    if (typeof email !== 'string' || !email.includes('@')) return '***';
    const [local, domain] = email.split('@');
    if (!local || !domain) return '***';
    const dotIdx = domain.lastIndexOf('.');
    const tld = dotIdx >= 0 ? domain.slice(dotIdx) : '';
    const dom = dotIdx >= 0 ? domain.slice(0, dotIdx) : domain;
    return `${local[0] || '*'}***@${dom[0] || '*'}***${tld}`;
}

/**
 * Mask any token-shaped string (JWT, API key, session id, password hash).
 * Returns `'***'` for any non-empty input, `'(empty)'` otherwise.
 */
export function maskToken(token) {
    if (token === null || token === undefined || token === '') return '(empty)';
    return '***';
}

/**
 * Boolean form for "is this secret configured" log lines.
 * Use INSTEAD of `apiKey ? 'set' : 'unset'` — referencing the secret variable
 * directly inside console.* trips the scanner even when only a boolean is
 * printed. Compute the boolean OUTSIDE the log call:
 *
 *   const hasKey = isConfigured(process.env.MY_API_KEY);
 *   console.log('[server] MyService:', hasKey ? 'configured' : 'missing');
 */
export function isConfigured(secret) {
    return typeof secret === 'string' && secret.length > 0;
}
