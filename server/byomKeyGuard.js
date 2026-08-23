/**
 * byomKeyGuard.js — refuse to accept a third-party AI provider key (C105 §4.5).
 *
 * ⛔ WHAT THIS DEFENDS. BYOM's whole promise is that a user's provider key stays
 * on their device and goes only to the provider they chose. The client keeps
 * that promise by construction — `packages/ai-host/src/byom/` has no edge to
 * PRYZM's origin at all, and `byomSecretContainment.test.ts` asserts the absent
 * edge. This file is the SECOND wall, for the two cases construction cannot
 * cover:
 *
 *   1. A USER PASTES THEIR KEY INTO THE CHAT BOX. Entirely realistic — the
 *      panel asks for a key, and the chat is right next to it. Without this
 *      guard the key rides to PRYZM's server inside a prompt, lands in the
 *      proxy's request log, and is then forwarded to Anthropic. With it, the
 *      user gets a refusal that tells them exactly what happened and what to do.
 *   2. A FUTURE EDIT re-routes BYOM through the BFF "just for CORS". The route
 *      would start refusing, loudly, in development, instead of quietly
 *      breaking the promise in production.
 *
 * ⚠ THE DETECTORS HERE ARE NARROWER THAN THE CLIENT'S, DELIBERATELY. The client
 * guard (`ByomRedaction.ts`) carries a generic "40+ high-entropy characters"
 * arm, which is right for a redactor: a false positive merely masks something.
 * Here a false positive REJECTS A USER'S REQUEST, and prompt bodies legitimately
 * carry base64 thumbnails, long element ids and pasted CAD text. So this file
 * matches only unambiguous VENDOR PREFIXES. The two lists are different on
 * purpose; a comment on each explains why, so a future author does not
 * "harmonise" them and start rejecting valid prompts.
 *
 * ⛔ NOTHING IN THIS FILE MAY LOG THE MATCHED VALUE — not truncated, not
 * hashed-and-truncated. It logs the ROUTE and the PATTERN NAME, which is all an
 * operator needs. See `logSafe.js` for the house rules this follows.
 */

/**
 * Unambiguous vendor key prefixes. Each entry is `[name, RegExp]` so a refusal
 * can name WHICH vendor's key shape was seen without echoing the value.
 *
 * ⚠ Anchored on vendor prefixes only. No generic entropy arm — see the header.
 */
const VENDOR_KEY_PATTERNS = Object.freeze([
    ['anthropic', /sk-ant-[A-Za-z0-9_-]{16,}/],
    ['openrouter', /sk-or-[A-Za-z0-9_-]{16,}/],
    ['openai-project', /sk-proj-[A-Za-z0-9_-]{16,}/],
    ['openai', /\bsk-[A-Za-z0-9]{32,}/],
    ['google', /\bAIza[A-Za-z0-9_-]{30,}/],
]);

/**
 * Request headers that carry a provider credential. PRYZM's own proxy never
 * needs any of them from a client: it attaches its OWN credential upstream.
 * A client sending one is either confused or attempting to have PRYZM spend on
 * a key it should never have seen.
 *
 * ⚠ `authorization` is NOT in this list. PRYZM's own session may legitimately
 * arrive as a bearer, and rejecting it would break every authenticated call.
 * A provider bearer is caught by the VALUE patterns instead.
 */
const FORBIDDEN_CREDENTIAL_HEADERS = Object.freeze([
    'x-api-key',
    'x-goog-api-key',
    'anthropic-dangerous-direct-browser-access',
    'openai-organization',
]);

/**
 * Walk a parsed JSON body looking for a vendor key shape.
 * Returns the PATTERN NAME (never the value), or null.
 *
 * Depth- and node-capped: a 50 MB body must not turn this guard into a DoS.
 */
export function findVendorKeyShape(value, depth = 0, budget = { nodes: 20000 }) {
    if (depth > 12 || budget.nodes <= 0) return null;
    budget.nodes -= 1;

    if (typeof value === 'string') {
        if (value.length < 20 || value.length > 8192) return null;
        for (const [name, re] of VENDOR_KEY_PATTERNS) {
            if (re.test(value)) return name;
        }
        return null;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            const hit = findVendorKeyShape(item, depth + 1, budget);
            if (hit) return hit;
        }
        return null;
    }
    if (value && typeof value === 'object') {
        for (const key of Object.keys(value)) {
            const hit = findVendorKeyShape(value[key], depth + 1, budget);
            if (hit) return hit;
        }
    }
    return null;
}

/** Which forbidden credential header a request carries, or null. */
export function findCredentialHeader(headers) {
    if (!headers || typeof headers !== 'object') return null;
    for (const name of FORBIDDEN_CREDENTIAL_HEADERS) {
        const v = headers[name];
        if (typeof v === 'string' && v.length > 0) return name;
    }
    return null;
}

/** The refusal a user reads. Names the mistake and the remedy; quotes nothing. */
export const BYOM_KEY_REFUSAL =
    'This request looks like it carries a third-party AI provider key. PRYZM refuses ' +
    'it rather than forwarding it: your provider key must never reach PRYZM servers. ' +
    'If you meant to use your own key, add it under "AI provider keys" in the AI chat ' +
    'header — from there it is stored only on your device and is sent straight to the ' +
    'provider you chose. If you pasted a key into the chat box by accident, treat it as ' +
    'exposed and rotate it in the provider console.';

/**
 * Express middleware. Mount on the AI routes AFTER the JSON body parser.
 *
 * Refuses with 400 — a CLIENT mistake, not a server failure, and not 401/403
 * which would read as "your PRYZM session is wrong" and send the user to
 * re-authenticate for a problem that has nothing to do with their session.
 */
export function byomKeyGuard(req, res, next) {
    const headerHit = findCredentialHeader(req.headers);
    if (headerHit) {
        console.warn(`[byom-guard] refused ${req.method} ${req.path} — client sent header: ${headerHit}`);
        return res.status(400).json({ error: BYOM_KEY_REFUSAL, code: 'BYOM_KEY_REJECTED' });
    }
    const bodyHit = findVendorKeyShape(req.body);
    if (bodyHit) {
        console.warn(`[byom-guard] refused ${req.method} ${req.path} — body carried a ${bodyHit}-shaped key`);
        return res.status(400).json({ error: BYOM_KEY_REFUSAL, code: 'BYOM_KEY_REJECTED' });
    }
    return next();
}
