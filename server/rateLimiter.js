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
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
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
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler: JSON_HANDLER,
});
