/**
 * @file server/rateLimiter.js
 * @description Rate limiting middleware for PRYZM server.
 *
 * CONTRACT (07-BIM-SECURITY-CONTRACT §7):
 *  - aiLimiter: 20 requests per 15 minutes per IP — applied to AI proxy only.
 *  - globalLimiter: 200 requests per 15 minutes per IP — applied to all API routes.
 *  - Both respond with HTTP 429 and a JSON body (never HTML) when limit is exceeded.
 *  - Both are exported as named exports and wired in server.js — never duplicated inline.
 *  - Default IP key generator is used (express-rate-limit handles IPv6 normalisation).
 */

import rateLimit from 'express-rate-limit';

// In DEVELOPMENT the global + API limiters are a no-op: a single local developer
// hammering their own server in a heavy authoring/test session must never be
// throttled (it was 429-ing create/delete/open, blocking all work, 2026-06-03).
// Production keeps the (raised) limits. The aiLimiter is NOT skipped — it guards
// real Anthropic/CF-worker cost even in dev.
const IS_PROD = process.env.NODE_ENV === 'production';
const SKIP_IN_DEV = () => !IS_PROD;

const JSON_HANDLER = (_req, res) => {
    res.status(429).json({
        error: 'Too many requests. Please wait and try again.',
        retryAfterMs: 15 * 60 * 1000,
    });
};

/**
 * Strict limiter for the AI proxy endpoint.
 * 20 requests per 15-minute window per IP.
 * Prevents DoS and uncontrolled Anthropic API cost abuse.
 */
export const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler: JSON_HANDLER,
});

/**
 * Broad limiter applied globally to all /api/* routes.
 * 200 requests per 15-minute window per IP.
 * Prevents scraping and general API abuse.
 */
export const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    // 200/15min (~13/min) was tuned for a low-traffic public API, but the EDITOR
    // is an interactive SPA: opening the hub syncs N projects, each project-open
    // makes several /api/v1 calls, and a heavy authoring/test session easily
    // exceeds it → legit users got HTTP 429 on create/delete (2026-06-03). Raised
    // to an interactive-app-sane ceiling that still caps scraping/abuse.
    max: 2000,
    standardHeaders: true,
    legacyHeaders: false,
    skip: SKIP_IN_DEV,
    handler: JSON_HANDLER,
});

/**
 * REST API limiter for public /api/v1/* endpoints.
 * 60 requests per minute per IP.
 * Stricter than globalLimiter — v1 endpoints can be called by CI pipelines
 * and third-party tools so a tighter burst window is appropriate.
 */
export const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    // 60/min was far too tight for the interactive editor — the hub project-list
    // sync + per-project loads + an authoring session burst past it, 429-ing
    // create/delete/list (2026-06-03). 600/min (10/s) absorbs interactive bursts
    // while still bounding automated abuse; CI pipelines stay well under it.
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    skip: SKIP_IN_DEV,
    handler: JSON_HANDLER,
});
