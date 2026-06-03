/**
 * @file server/leads.js
 * @description Lead-capture sink for the RAC onboarding handoff (IP-A3 · A.5.e).
 *
 * When the in-app RAC onboarding conversation (A.5.f) captures the visitor's
 * role · team size · typology · brief, the editor POSTs it here so sales /
 * marketing have the lead even if the visitor abandons before completing
 * sign-up. Public + unauthenticated (the lead exists pre-account).
 *
 * DESIGN
 *   - 16 KB body cap + a per-minute rate cap so the endpoint can't be abused
 *     to flood logs (same posture as server/cspReport.js).
 *   - Permissive validation: a lead is worth capturing even if partial; we
 *     only reject a non-object body. Fields are truncated, never trusted.
 *   - No DB schema yet — leads are logged structured (a `leads` table +
 *     persistence is the follow-on; the log line is greppable telemetry today).
 *   - Always answers 200 `{ ok, leadId }` quickly; capture never blocks the
 *     user's sign-up flow.
 *
 * @see apps/editor/src/ui/platform/PlatformRouter.ts (showOnboarding → onBriefReady)
 * @see docs/03-execution/plans/master-execution-tracker.md IP-A3 A.5.e
 */

import express from 'express';

export const LEADS_PATH = '/api/leads';

export const leadsBodyParser = express.json({ type: ['application/json'], limit: '16kb' });

// ── Rate cap ──────────────────────────────────────────────────────────────
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60;
let _windowStart = 0;
let _accepted = 0;
let _dropped = 0;

const trunc = (v, n) => (v == null ? '' : String(v).slice(0, n));

/**
 * Derive a short, non-cryptographic lead id for the log + the client ack.
 * (crypto.randomUUID where available; a timestamp-ish fallback otherwise.)
 */
function leadId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return 'lead_' + crypto.randomUUID().split('-')[0];
    return 'lead_' + Date.now().toString(36);
}

/** Express handler for POST {LEADS_PATH}. Exported for direct unit testing. */
export function leadsHandler(req, res) {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return res.status(400).json({ ok: false, error: 'lead body must be a JSON object' });
    }

    const now = Date.now();
    if (now - _windowStart > WINDOW_MS) {
        if (_dropped > 0) console.warn(`[leads] dropped ${_dropped} lead(s) in the last window (cap ${MAX_PER_WINDOW}/min)`);
        _windowStart = now;
        _accepted = 0;
        _dropped = 0;
    }
    if (_accepted >= MAX_PER_WINDOW) {
        _dropped++;
        // Still 200 — never signal back-pressure to the onboarding client.
        return res.status(200).json({ ok: true, leadId: null, throttled: true });
    }
    _accepted++;

    const id = leadId();
    // Structured, truncated capture. role · teamSize · typology · brief · email
    // · source — whatever the RAC conversation gathered. Never log raw beyond
    // these bounded fields.
    console.log(
        `[leads] ${id} role=${trunc(body.role, 40)} team=${trunc(body.teamSize, 24)} ` +
        `typology=${trunc(body.typology, 40)} email=${trunc(body.email, 80)} ` +
        `source=${trunc(body.source, 40)} brief="${trunc(body.briefText ?? body.brief, 200)}"`,
    );

    return res.status(200).json({ ok: true, leadId: id });
}

/** Test-only hook to reset the rate-cap window between unit tests. */
export function __resetLeadsRateCap() {
    _windowStart = 0;
    _accepted = 0;
    _dropped = 0;
}
