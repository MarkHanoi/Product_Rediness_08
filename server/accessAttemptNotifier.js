/**
 * @file server/accessAttemptNotifier.js
 * @description Notify the founder when someone outside the private beta tries to
 * get in. Founder ruling 2026-08-07: "if someone tries to sign up I would like to
 * receive a notification to hellopryzm@gmail.com".
 *
 * ── WHY THIS IS NOT JUST `nodemailer` ────────────────────────────────────────
 * This repo has NO mail transport and no mail credentials — verified 2026-08-07
 * (no nodemailer / sendgrid / resend / postmark / mailgun / smtp anywhere in
 * `server/`, `server.js` or `package.json`). Adding one is not a code problem, it
 * is a CREDENTIAL problem, and a credential the founder has to create.
 *
 * So this module is built to be USEFUL WITH NO CREDENTIAL AT ALL and to upgrade
 * itself the moment one exists:
 *
 *   • ALWAYS — a structured `[access-attempt]` line on stdout. Fly retains these
 *     (`flyctl logs`), so no attempt is ever lost, even today with nothing configured.
 *   • IF `RESEND_API_KEY` is set — additionally delivers a real email to
 *     `ACCESS_NOTIFY_TO` (default hellopryzm@gmail.com) over plain HTTPS.
 *
 * Resend was chosen over SMTP for ONE reason that matters here: it is a single
 * `fetch()` POST, so it adds **zero npm dependencies**. A new dependency means a
 * `pnpm-lock.yaml` change, and an unsynced lockfile breaks CI's frozen-lockfile
 * install — a real, previously-hit failure in this repo. Any transport reachable by
 * `fetch` can be swapped in below without touching the call sites.
 *
 * ⚠ UNTIL `RESEND_API_KEY` EXISTS, NO EMAIL IS SENT. The log line is real, the
 * email is not. `notifierStatus()` reports which mode is live precisely so nobody
 * reads a quiet inbox as "nobody tried" — the §CONTEXT-DATA-HONESTY rule that a
 * failure and an empty result must never be the same value. The startup banner
 * prints the mode for the same reason.
 *
 * ── SAFETY PROPERTIES (all four are load-bearing) ────────────────────────────
 * 1. NEVER BLOCKS THE REQUEST. Fire-and-forget; the auth route does not await it.
 *    A notification is an operator convenience, never a reason a request hangs.
 * 2. NEVER THROWS. Every failure is caught and logged. A refusal must still be a
 *    clean refusal if the mail provider is down.
 * 3. RATE-CAPPED. A scripted signup flood would otherwise become an outbound-mail
 *    flood — turning a nuisance into a deliverability incident and an amplification
 *    vector pointed at the founder's own inbox.
 * 4. NO SECRETS OR PASSWORDS EVER. Only the attempted email, the surface, and a
 *    coarse source. Never the submitted password, never a token.
 */

'use strict';

const NOTIFY_TO = process.env.ACCESS_NOTIFY_TO || 'hellopryzm@gmail.com';
const NOTIFY_FROM = process.env.ACCESS_NOTIFY_FROM || 'PRYZM access <onboarding@resend.dev>';
const RESEND_KEY = process.env.RESEND_API_KEY || '';

// Rate cap — same shape as the CSP report sink, for the same reason: keep the
// signal without letting the volume become the incident.
const WINDOW_MS = 60 * 60_000;   // 1 hour
const MAX_PER_WINDOW = 20;
let _windowStart = 0;
let _sent = 0;
let _suppressed = 0;

const trunc = (v, n) => String(v ?? '?').slice(0, n);

/**
 * Which mode this process is in. Exported so the startup banner and tests can
 * state it plainly instead of leaving operators to infer it from silence.
 * @returns {{ transport: 'log-only' | 'resend', to: string, reason?: string }}
 */
export function notifierStatus() {
    if (!RESEND_KEY) {
        return {
            transport: 'log-only',
            to: NOTIFY_TO,
            reason: 'RESEND_API_KEY is not set — attempts are LOGGED but NO EMAIL IS SENT. '
                + 'Set RESEND_API_KEY (and optionally ACCESS_NOTIFY_TO/ACCESS_NOTIFY_FROM) to enable delivery.',
        };
    }
    return { transport: 'resend', to: NOTIFY_TO };
}

async function deliverViaResend(subject, text) {
    const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${RESEND_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: NOTIFY_FROM, to: [NOTIFY_TO], subject, text }),
        signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) {
        // Read the provider's reason — a 403 here usually means the `from` domain
        // is not verified in Resend, which is a config fix, not a code fix.
        const detail = await r.text().catch(() => '');
        throw new Error(`resend ${r.status}: ${trunc(detail, 200)}`);
    }
}

/**
 * Record (and, if configured, email) a blocked access attempt.
 *
 * Fire-and-forget by contract: callers MUST NOT await this. Returns a promise only
 * so tests can settle it.
 *
 * @param {object} attempt
 * @param {string} attempt.email    the address that was refused
 * @param {string} attempt.surface  'signup' | 'signin' | 'oauth:google' | 'oauth:microsoft'
 * @param {string} [attempt.ip]     coarse source, for spotting a scripted sweep
 * @returns {Promise<void>}
 */
export async function notifyBlockedAccessAttempt({ email, surface, ip } = {}) {
    try {
        const now = Date.now();
        if (now - _windowStart > WINDOW_MS) {
            if (_suppressed > 0) {
                console.warn(`[access-attempt] suppressed ${_suppressed} notification(s) in the last hour (cap ${MAX_PER_WINDOW}/h)`);
            }
            _windowStart = now;
            _sent = 0;
            _suppressed = 0;
        }

        const safeEmail = trunc(email, 120);
        const safeSurface = trunc(surface, 24);

        // (1) ALWAYS log. This is the record that exists with zero configuration.
        console.warn(`[access-attempt] BLOCKED surface=${safeSurface} email=${safeEmail} ip=${trunc(ip, 45)}`);

        if (_sent >= MAX_PER_WINDOW) { _suppressed++; return; }
        _sent++;

        // (2) Deliver, if a transport is configured.
        if (!RESEND_KEY) return;

        await deliverViaResend(
            `PRYZM: blocked ${safeSurface} attempt — ${safeEmail}`,
            [
                'Someone outside the private-beta allowlist tried to access PRYZM.',
                '',
                `  email:   ${safeEmail}`,
                `  surface: ${safeSurface}`,
                `  ip:      ${trunc(ip, 45)}`,
                `  when:    ${new Date(now).toISOString()}`,
                '',
                'They were refused. To grant access, add the address to',
                'server/betaAccessAllowlist.js and deploy.',
            ].join('\n'),
        );
    } catch (err) {
        // Property 2: never throw. A refusal must stay a clean refusal.
        console.warn(`[access-attempt] notification failed (the attempt WAS logged above): ${trunc(err?.message ?? err, 200)}`);
    }
}

/** Test-only hook to reset the rate-cap window. */
export function __resetAccessNotifierCap() {
    _windowStart = 0;
    _sent = 0;
    _suppressed = 0;
}
